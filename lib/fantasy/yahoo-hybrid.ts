import type { Snapshot } from "./snapshot.ts";
import { checkPrivateFields, parseSnapshot } from "./snapshot.ts";
import { timestamp, type PlayerInput, type TeamInput } from "./inputs.ts";
import { initialFreshness } from "./freshness.ts";
import type { CoverageReport } from "./coverage.ts";
import type { RefreshBundle } from "./refresh.ts";
import { fields, indexed, numberField, scalar } from "./yahoo-coverage.ts";
import { yahooLeagueKeys, yahooReader } from "./yahoo-probe.ts";

const leaguePage = "https://football.fantasysports.yahoo.com/f1/121612";
const safeError = (message: string): never => { throw new HybridError(message); };
export class HybridError extends Error {}

export function readProjectionImport(value: unknown, now = Date.now()) {
  checkPrivateFields(value);
  const input = value as {week:number; captured_at:string; projections:{player_id:string; points:number|null; game_status?:string}[]};
  if (!input || !Number.isInteger(input.week) || input.week<1 || input.week>18 ||
      !timestamp(input.captured_at) || Date.parse(input.captured_at)>now+300000 || now-Date.parse(input.captured_at)>24*3600000 ||
      !Array.isArray(input.projections) || !input.projections.length || input.projections.length>640) {
    return safeError("Use a Yahoo website projection export less than 24 hours old.");
  }
  const rows = new Map<string,typeof input.projections[number]>();
  for (const row of input.projections) {
    if (!row || !/^yahoo:\d+$/.test(row.player_id) || rows.has(row.player_id) ||
        row.points!==null && (typeof row.points!=="number" || !Number.isFinite(row.points)) ||
        row.points!==null && row.game_status===undefined ||
        row.game_status!==undefined && !["scheduled","in progress","final","locked","bye"].includes(row.game_status)) {
      return safeError("Check Yahoo player IDs, duplicate rows, points and game status in the projection file.");
    }
    rows.set(row.player_id,row);
  }
  return { week:input.week, captured_at:input.captured_at, rows };
}

export async function buildHybridRefresh(access:string, base:Snapshot, coverage:CoverageReport, input:ReturnType<typeof readProjectionImport>, request=fetch):Promise<RefreshBundle> {
  if (!base.analysis_inputs || !coverage.trade_ready || !coverage.scoring || !coverage.rules) return safeError("Save a comprehensive manual baseline with league scoring and rules first.");
  const get=yahooReader(access,request);
  const {gameKey,leagueKey,teamKey}=await yahooLeagueKeys(get);
  const leaguePath="league/"+leagueKey;
  const league=await get(leaguePath);
  const week=input.week;
  if (!scalar(league,"league_key",v=>v===leagueKey) || numberField(league,"current_week")!==week || week<base.week) return safeError("The projection file must match Yahoo’s current league week.");
  const [rosters, standings, scoreboard]=await Promise.all([get(leaguePath+"/teams/roster"),get(leaguePath+"/standings"),get(leaguePath+"/scoreboard;week="+week)]);
  const teamId=(row:unknown)=>Number(scalar(row,"team_key",v=>v.startsWith(leagueKey+".t.")&&/^\d+$/.test(v.split(".").at(-1)??""))?.split(".").at(-1));
  const standingsById=new Map(fields(standings,"team").map(row=>[teamId(row),row]));
  const prior=base.analysis_inputs;
  const oldPlayers=new Map(prior.players.map(p=>[p.id,p]));
  const players=new Map<string,PlayerInput>();
  function playerKey(row:unknown) {
    const id=scalar(row,"player_key",key=>key.startsWith(gameKey+".p.")&&/^\d+$/.test(key.split(".").at(-1)??""))?.split(".").at(-1);
    if (!id) throw new Error("Player identity missing.");
    return "yahoo:"+id;
  }
  function addPlayer(row:unknown,id:string) {
    const old=oldPlayers.get(id), projection=input.rows.get(id);
    const name=scalar(fields(row,"name")[0],"full")??old?.name;
    const position=scalar(row,"primary_position")??old?.position;
    if (!name || !position) throw new Error("Player metadata missing.");
    const eligible=Array.from(new Set(fields(fields(row,"eligible_positions")[0],"position").flatMap(v=>typeof v==="string"?[v]:[])));
    const player:PlayerInput={...old,id,name,position,eligible:eligible.length?eligible:old?.eligible??[position],
      team:scalar(row,"editorial_team_abbr")??old?.team,status:scalar(row,"status")||undefined,
      bye:projection?.game_status==="bye"?week:numberField(fields(row,"bye_weeks")[0],"week")??old?.bye,
      projection:projection?.points??undefined,game_status:projection?.game_status};
    delete player.projected_stats;
    if (week!==base.week) delete player.actual;
    players.set(id,player);
    return player;
  }
  const teamRows=fields(rosters,"team");
  const teams:TeamInput[]=teamRows.map(row=>{
    const id=teamId(row), standing=standingsById.get(id), stats=fields(standing,"team_standings")[0];
    const outcome=fields(stats,"outcome_totals")[0];
    const name=scalar(standing,"name")??scalar(row,"name");
    const rows=indexed(fields(fields(row,"roster")[0],"players")[0],"player");
    if (!name || !standing || !rows.length) throw new Error("Incomplete team roster or standings.");
    return {id,name,faab:numberField(standing,"faab_balance")??numberField(row,"faab_balance")??undefined,
      wins:numberField(outcome,"wins")??undefined, losses:numberField(outcome,"losses")??undefined,
      ties:numberField(outcome,"ties")??undefined,points_for:numberField(stats,"points_for")??undefined,
      roster:rows.map(p=>{
        const pid=playerKey(p),slot=scalar(fields(p,"selected_position")[0],"position");
        if (!slot || players.has(pid)) throw new Error("Duplicate roster player or missing slot.");
        addPlayer(p,pid);
        return {player_id:pid,slot};
      })};
  });
  if (teams.length!==10 || new Set(teams.map(t=>t.id)).size!==10 || teams.some(t=>t.id<1||t.id>10||!Number.isInteger(t.id)) || standingsById.size!==10) throw new Error("Incomplete league response.");
  const owner=teams.find(t=>t.id===5)!;
  if (owner.faab===undefined) {
    const ownerRow=fields(await get("team/"+teamKey),"team")[0];
    if(teamId(ownerRow)===5)owner.faab=numberField(ownerRow,"faab_balance")??undefined;
  }
  if (owner.faab===undefined) return safeError("Yahoo did not return your FAAB balance.");
  if (owner.roster.some(p=>p.slot!=="IR" && !input.rows.has(p.player_id))) return safeError("Include a current Yahoo projection row for each active or bench player on your team.");
  if (!owner.roster.some(p=>typeof input.rows.get(p.player_id)?.points==="number")) return safeError("Include current projected points and game status for your roster.");
  const matchupRows=fields(scoreboard,"matchup").map(row=>fields(row,"team")).find(rows=>rows.some(row=>teamId(row)===5));
  const opponentId=matchupRows?.map(teamId).find(id=>id!==5);
  const opponent=teams.find(t=>t.id===opponentId);
  if (!opponent || matchupRows?.length!==2) throw new Error("Current matchup missing.");
  const score=(team:number,key:string)=>numberField(fields(matchupRows.find(row=>teamId(row)===team),key)[0],"total");
  const scoreA=score(5,"team_points"),scoreB=score(opponent.id,"team_points");
  const projectionA=score(5,"team_projected_points"),projectionB=score(opponent.id,"team_projected_points");
  if (scoreA===null || scoreB===null || projectionA===null || projectionB===null) throw new Error("Matchup scores missing.");

  const pool=new Map<string,unknown>();
  const expires=Date.now()+50000;
  let pages=0, exhausted=false;
  for (let start=0;start<1600 && Date.now()<expires;start+=25) {
    const rows=indexed(fields(await get(leaguePath+"/players;status=A;start="+start+";count=25"),"players")[0],"player");
    if (rows.length>25) throw new Error("Invalid player page.");
    pages++;
    for (const row of rows) {
      const id=playerKey(row);
      if (pool.has(id) || players.has(id)) return safeError("Yahoo availability changed during collection. Retry before saving.");
      pool.set(id,row);
    }
    if (rows.length<25) { exhausted=true; break; }
  }
  if (!exhausted) return safeError("Yahoo availability pagination did not finish. Retry before saving.");

  const tracked=[...new Set([...input.rows.keys(),...(prior.available_ids??[])])].filter(id=>pool.has(id));
  if (tracked.length>800-players.size) return safeError("The imported projections and previously tracked players exceed the snapshot limit.");
  if (!tracked.some(id=>typeof input.rows.get(id)?.points==="number")) return safeError("Include website projections for available players too.");
  const available=tracked.map(id=>{
    const row=pool.get(id);
    const p=addPlayer(row,id);
    const ownership=scalar(row,"ownership_type");
    const state=ownership==="waivers"?"W":ownership==="freeagents"?"FA":"Available";
    return [p.name,p.position,state,p.projection??null];
  });

  const at=new Date().toISOString();
  const snapshot:Snapshot={...base,captured_at:at,week,method:"Hybrid Yahoo API and Yahoo website projections",
    team:{...base.team,name:owner.name,faab_remaining:owner.faab},
    roster:owner.roster.map(r=>{
      const p=players.get(r.player_id)!;
      return {slot:r.slot,name:p.name,position:p.position,team:p.team,status:p.status,bye:p.bye,projection:p.projection??null,game_status:p.game_status};
    }),
    matchup:{opponent:opponent.name,score:scoreA,opponent_score:scoreB,live_projection:projectionA,opponent_live_projection:projectionB},
    available_players:available,available_player_scope:pool.size+" API availability records checked; "+tracked.length+" tracked in the dashboard.",
    analysis_inputs:{...prior,players:[...players.values()],teams,available_ids:tracked,opponent_team_id:opponent.id,
      records_through_week:undefined,transactions:prior.transactions?.filter(t=>players.has(t.player_id)),
      correlations:prior.correlations?.filter(c=>players.has(c.a)&&players.has(c.b))},
  };
  if (week!==base.week) delete snapshot.review_context;
  const ranked=teams.map(team=>{
    const stats=fields(standingsById.get(team.id),"team_standings")[0];
    const rank=numberField(stats,"rank"), against=numberField(stats,"points_against");
    if (rank===null || against===null || team.wins===undefined || team.losses===undefined || team.ties===undefined || team.points_for===undefined) throw new Error("Incomplete Yahoo standings.");
    if (team.id===5) {snapshot.team.rank=rank; snapshot.team.record=[team.wins,team.losses,team.ties].join("-");}
    return [rank,team.name,[team.wins,team.losses,team.ties].join("-"),team.points_for,against,
      null,team.faab??null,numberField(standingsById.get(team.id),"waiver_priority"),numberField(standingsById.get(team.id),"number_of_moves")];
  });
  if(new Set(ranked.map(row=>row[0])).size!==10)throw new Error("Standings are incomplete.");
  snapshot.standings=ranked.sort((a,b)=>Number(a[0])-Number(b[0]));
  const fresh=initialFreshness(snapshot);
  const previous=base.data_freshness??initialFreshness(base);
  snapshot.data_freshness={...fresh,mode:"daily",baseline_at:previous.baseline_at,schedule_at:previous.schedule_at,transactions_at:previous.transactions_at,
    projections:Object.fromEntries([...players.values()].filter(p=>p.projection!==undefined).map(p=>[p.id,input.captured_at]))};
  snapshot.quality_notes=[
    "Website projections are from "+input.captured_at+". Missing player projections remain unavailable.",
    "League settings, schedule and external research are retained from earlier imports. Weekly results are imported separately.",
  ];
  const note = pool.size+" available players checked across "+pages+" API pages; "+tracked.length+" retained for dashboard analysis.";
  return {schema_version:1,snapshot:parseSnapshot(JSON.stringify(snapshot)),research:null,collection:{
    expected_team_ids:teams.map(t=>t.id),rosters:teams.map(t=>({team_id:t.id,status:"Complete",collected_at:at,player_count:t.roster.length,views:["offense","kicker","defense"],ids_verified:true})),
    standings:true,scoring:coverage.scoring,rules:coverage.rules,pool:[],transaction_rows:coverage.transaction_rows,transaction_scope:coverage.transaction_scope,
    researched_player_ids:[],research_target_ids:[],sources:[{name:"Yahoo Fantasy Sports API",url:leaguePage,status:"accessed",note},
      {name:"Yahoo website projections",url:leaguePage+"/5",status:"accessed",note:"Manually imported Week "+week+" projections from "+input.captured_at+"."}],
    limitations:[note,...snapshot.quality_notes],
  }};
}
