import type { Snapshot } from "./snapshot.ts";
import { findValue, yahooLeagueKeys, yahooReader } from "./yahoo-probe.ts";

function fields(value: unknown, field: string): unknown[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => key === field ? [child] : fields(child, field));
}

function scalar(value: unknown, field: string, matches: (value: string) => boolean = () => true) {
  return findValue(value, field, matches);
}

function numberField(value: unknown, field: string) {
  const raw = scalar(value, field, v => v.trim() !== "" && Number.isFinite(Number(v)));
  return raw === undefined ? null : Number(raw);
}

function indexed(collection: unknown, resource: string) {
  if (!collection || typeof collection !== "object") throw new Error("Collection missing.");
  const rows = Object.entries(collection).filter(([key]) => /^\d+$/.test(key))
    .flatMap(([, entry]) => entry && typeof entry === "object" && resource in entry ? [entry[resource as keyof typeof entry]] : []);
  if (numberField({ count: (collection as { count?: unknown }).count }, "count") !== rows.length) throw new Error("Collection count mismatch.");
  return rows;
}

function compareIds(apiIds: Iterable<string>, manualIds: string[] | undefined) {
  const live = new Set(apiIds);
  const saved = manualIds && new Set(manualIds);
  return {
    api_count: live.size, manual_count: saved?.size ?? null,
    overlap: saved ? [...live].filter(id => saved.has(id)).length : null,
    api_only: saved ? [...live].filter(id => !saved.has(id)).length : null,
    manual_only: saved ? [...saved].filter(id => !live.has(id)).length : null,
  };
}

async function section<T>(load: () => Promise<T>) {
  try { return { status:"read" as const, ...await load() }; }
  catch { return { status:"unverified" as const }; }
}

export async function compareYahooCoverage(access: string, snapshot: Snapshot, request = fetch) {
  if (snapshot.league.id !== 121612 || snapshot.league.season !== 2026 || snapshot.team.id !== 5) throw new Error("Saved snapshot belongs to another league.");
  const get = yahooReader(access, request);
  const {gameKey, leagueKey, teamKey} = await yahooLeagueKeys(get);
  const league = await get("league/" + leagueKey);
  if (!scalar(league, "league_key", v=>v===leagueKey)) throw new Error("Yahoo returned a different league.");
  const apiWeek = numberField(league, "current_week");
  const playerId = (row: unknown) => scalar(row,"player_key",v=>v.startsWith(gameKey+".p.") && /^\d+$/.test(v.split(".").at(-1)??""))?.split(".").at(-1);
  const manualId = (id: string) => /^yahoo:\d+$/.test(id) ? id.slice(6) : id;
  function players(collection: unknown) {
    const ids = indexed(collection, "player").map(playerId);
    if (ids.some(id=>!id) || new Set(ids).size !== ids.length) throw new Error("Invalid player identities.");
    return ids as string[];
  }
  const teams = (payload: unknown) => fields(payload,"team").flatMap(row => {
    const key = scalar(row,"team_key",v=>v.startsWith(leagueKey+".t.")&&/^\d+$/.test(v.split(".").at(-1)??""));
    return key ? [{row,key,id:Number(key.split(".").at(-1))}] : [];
  });
  const manual = snapshot.analysis_inputs;
  const [rosters, matchup, standings, available, faab] = await Promise.all([
    section(async () => {
      const result = teams(await get("league/" + leagueKey + "/teams/roster"));
      const rows = result.flatMap(({row,id}) => {
        try {
          const ids = players(fields(fields(row,"roster")[0],"players")[0]);
          if (!ids.length) return [];
          return [{ team_id:id, ...compareIds(ids,manual?.teams?.find(t=>t.id===id)?.roster.map(p=>manualId(p.player_id))) }];
        } catch { return []; }
      });
      if (!rows.some(row=>row.team_id===snapshot.team.id) || new Set(rows.map(row=>row.team_id)).size !== rows.length) throw new Error("Owner or league rosters missing.");
      return { teams:rows, expected_teams:numberField(league,"num_teams"), manual_teams:manual?.teams?.length??null };
    }),
    section(async () => {
      if (apiWeek===null || !Number.isInteger(apiWeek) || apiWeek<1 || apiWeek>18) throw new Error("Week missing.");
      const result = fields(await get("league/" + leagueKey + "/scoreboard;week=" + apiWeek),"matchup");
      const ownerMatch = result.map(teams).find(rows=>rows.some(row=>row.key===teamKey));
      if (ownerMatch?.length !== 2) throw new Error("Matchup missing.");
      const owner = ownerMatch.find(row=>row.key===teamKey)!, opponent = ownerMatch.find(row=>row.key!==teamKey)!;
      const comparable = apiWeek===snapshot.week;
      return { api_week:apiWeek, manual_week:snapshot.week, same_week:comparable,
        opponent_id:opponent.id, manual_opponent_id:comparable ? manual?.opponent_team_id??null : null,
        api_points:numberField(fields(owner.row,"team_points")[0],"total"),
        manual_points:comparable ? snapshot.matchup?.score??null : null,
        api_projected:numberField(fields(owner.row,"team_projected_points")[0],"total"),
        manual_projected:comparable ? snapshot.matchup?.live_projection??null : null,
      };
    }),
    section(async () => {
      const result=teams(await get("league/" + leagueKey + "/standings"));
      const ranks=result.flatMap(({row,id})=>{
        const rank=numberField(fields(row,"team_standings")[0],"rank");
        return rank!==null&&Number.isInteger(rank)&&rank>=1?[{id,rank}]:[];
      });
      const owner = ranks.find(row=>row.id===snapshot.team.id);
      if (!owner || new Set(ranks.map(row=>row.id)).size!==ranks.length) throw new Error("Standings missing.");
      return { api_teams:ranks.length, manual_teams:snapshot.standings?.length??null, api_owner_rank:owner.rank, manual_owner_rank:snapshot.team.rank??null };
    }),
    section(async () => {
      const ids = new Set<string>();
      let pages = 0, scope_complete = false;
      // Bound the trial to four pages. Missing manual IDs outside this sample are unknown.
      for (let start=0;start<100;start+=25) {
        const page = players(fields(await get("league/" + leagueKey + "/players;status=A;start=" + start + ";count=25"),"players")[0]);
        if (page.length>25 || page.some(id=>ids.has(id))) throw new Error("Unverified availability pagination.");
        page.forEach(id=>ids.add(id));
        pages++;
        if (page.length<25) { scope_complete=true; break; }
      }
      const comparison=compareIds(ids,manual?.available_ids?.map(manualId));
      return {...comparison, manual_only:scope_complete?comparison.manual_only:null, pages, scope_complete, scope:"Yahoo available players (free agents and waivers), up to 100 returned rows"};
    }),
    section(async () => {
      const result=teams(await get("team/" + teamKey));
      const row=result.find(team=>team.key===teamKey);
      const balance=numberField(row?.row,"faab_balance");
      if (balance===null || balance<0) throw new Error("FAAB missing.");
      return { api_remaining:balance, manual_remaining:snapshot.team.faab_remaining??null };
    }),
  ]);
  return { compared_at:new Date().toISOString(), manual_captured_at:snapshot.captured_at, api_week:apiWeek,
    manual_week:snapshot.week, rosters, matchup, standings, available, faab,
    limitations:["Manual and API readings can differ because they were captured at different times.",
      "Availability comparison is a bounded sample. Weekly player projections and external research were not compared."],
  };
}
