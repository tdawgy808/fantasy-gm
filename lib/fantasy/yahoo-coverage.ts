import type { Snapshot } from "./snapshot.ts";
import { findValue, yahooLeagueKeys, yahooReader } from "./yahoo-probe.ts";

export function fields(value: unknown, field: string): unknown[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => key === field ? [child] : fields(child, field));
}

export function scalar(value: unknown, field: string, matches: (value: string) => boolean = () => true) {
  return findValue(value, field, matches);
}

export function numberField(value: unknown, field: string) {
  const raw = scalar(value, field, v => v.trim() !== "" && Number.isFinite(Number(v)));
  return raw === undefined ? null : Number(raw);
}

export function indexed(collection: unknown, resource: string) {
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

export async function compareYahooCoverage(access: string, snapshot: Snapshot, request = fetch, full = false) {
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
  const deadline = Date.now() + 50000;
  const [rosters, matchup, standings, available, faab, projections] = await Promise.all([
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
      let stop_reason = "page limit";
      for (let start=0;start<(full?1600:100);start+=25) {
        if (Date.now() >= deadline) { stop_reason="time limit"; break; }
        let page: string[];
        try { page = players(fields(await get("league/" + leagueKey + "/players;status=A;start=" + start + ";count=25"),"players")[0]); }
        catch { if (!pages) throw new Error("No verified availability page."); stop_reason="unverified page"; break; }
        if (page.length>25 || page.some(id=>ids.has(id))) { stop_reason="invalid or repeated player rows"; break; }
        page.forEach(id=>ids.add(id));
        pages++;
        if (page.length<25) { scope_complete=true; stop_reason="end of Yahoo collection"; break; }
      }
      const comparison=compareIds(ids,manual?.available_ids?.map(manualId));
      return {...comparison, manual_only:scope_complete?comparison.manual_only:null, pages, scope_complete, stop_reason, scope:"Yahoo available players (free agents and waivers)"};
    }),
    section(async () => {
      const result=teams(await get("team/" + teamKey));
      const row=result.find(team=>team.key===teamKey);
      const balance=numberField(row?.row,"faab_balance");
      if (balance===null || balance<0) throw new Error("FAAB missing.");
      return { api_remaining:balance, manual_remaining:snapshot.team.faab_remaining??null };
    }),
    full ? section(async () => {
      if (apiWeek===null || !Number.isInteger(apiWeek) || apiWeek<1 || apiWeek>18) throw new Error("Week missing.");
      const owner = await get("team/" + teamKey + "/roster;week=" + apiWeek);
      if (!scalar(owner,"team_key", key=>key===teamKey)) throw new Error("Owner roster missing.");
      const keys = players(fields(owner,"players")[0]).slice(0,10).map(id=>gameKey+".p."+id);
      if (!keys.length) throw new Error("No sample players.");
      const result = await get("league/" + leagueKey + "/players;player_keys=" + keys.join(",") + "/stats;type=week;week=" + apiWeek);
      const rows = indexed(fields(result,"players")[0],"player");
      const sampleIds = new Set(keys.map(key=>key.split(".").at(-1)));
      const matching = rows.filter(row=>sampleIds.has(playerId(row)));
      if (!matching.length || new Set(matching.map(playerId)).size!==matching.length) throw new Error("Sample identities invalid.");
      const covered = matching.filter(row=>fields(row,"player_projected_points").some(value=>
        numberField(value,"week")===apiWeek && numberField(value,"total")!==null));
      return {week:apiWeek, requested:keys.length, returned:matching.length, verified_projection_count:covered.length,
        actual_points_count:matching.filter(row=>fields(row,"player_points").some(value=>numberField(value,"total")!==null)).length,
        sample_verified:covered.length===keys.length};
    }) : Promise.resolve({status:"not_checked" as const}),
  ]);
  return { compared_at:new Date().toISOString(), manual_captured_at:snapshot.captured_at, api_week:apiWeek,
    manual_week:snapshot.week, rosters, matchup, standings, available, faab, projections,
    limitations:["Manual and API readings can differ because they were captured at different times.",
      "Availability is complete only when Yahoo pagination reaches its end. Projection checking requires a distinct player projection field and an explicit matching week. External research is separate."],
  };
}
