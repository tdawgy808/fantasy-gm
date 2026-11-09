import type { Snapshot } from "./snapshot.ts";
import type { Research } from "./research.ts";
import type { ReviewReadiness } from "./weekly-types.ts";
export type CoverageStatus="Complete"|"Partial"|"Missing"|"Failed";
export type CollectionEvidence={
  expected_team_ids:number[]; rosters:{team_id:number;status:CoverageStatus;collected_at:string;player_count:number;views?:string[];ids_verified?:boolean}[];
  standings:boolean;scoring:boolean;rules:boolean;
  pool:{position:string;pages:number;exhausted:boolean;scope:string}[];
  transaction_rows:number;transaction_scope:string;
  researched_player_ids:string[];research_target_ids:string[];
  sources:{name:string;url:string;status:"accessed"|"restricted"|"unavailable";note:string}[];
  limitations:string[];
};
export type CoverageReport=ReturnType<typeof coverageReport>;
export function coverageStatus(c:CoverageReport):CoverageStatus{
  if(c.collection_mode==="daily")return "Partial";
  return c.import_status==="Saved"&&!!c.deployed_read_verified_at&&!c.retained&&c.trade_ready&&c.schedule_ready&&c.standings&&c.scoring&&c.rules&&c.limitations.length===0&&c.findings_imported>0&&c.missing_publication===0&&c.players_researched===c.research_targets&&c.sources.every(s=>s.status==="accessed")&&["QB","RB","WR","TE","K","DEF"].every(pos=>c.pool.some(p=>p.position===pos&&p.exhausted))?"Complete":"Partial";
}
export function coverageReport(id:string,at:string,snapshot:Snapshot,research:Research|null,e:CollectionEvidence){
  const input=snapshot.analysis_inputs,teams=input?.teams??[],players=input?.players??[];
  const complete=e.rosters.filter(r=>r.status==="Complete"&&teams.some(t=>t.id===r.team_id&&t.roster.length===r.player_count));
  const expected=e.expected_team_ids.length;
  const expectedGames=expected%2===0&&input?.playoff?Math.max(0,input.playoff.start_week-snapshot.week)*expected/2:null;
  const schedule=input?.schedule?.filter(g=>g.week>=snapshot.week&&g.week<(input.playoff?.start_week??19))??[];
  const findings=research?.findings??[],injuries=new Set(findings.filter(f=>["injury","availability"].includes(f.category)&&(f.published_at||f.published_date)&&Date.parse(at)-Date.parse(f.published_at??f.published_date!)<172800000).map(f=>f.player_id??f.player));
  return {id,attempted_at:at,yahoo_at:snapshot.captured_at,research_at:research?.collected_at??null,
    review_readiness:null as ReviewReadiness|null,
    collection_mode:snapshot.data_freshness?.mode??"weekly",baseline_at:snapshot.data_freshness?.baseline_at??snapshot.captured_at,
    checked_projections:Object.values(snapshot.data_freshness?.projections??{}).filter(at=>at===snapshot.captured_at).length,
    checked_availability:Object.values(snapshot.data_freshness?.availability??{}).filter(at=>at===snapshot.captured_at).length,
    status:"Partial" as CoverageStatus,import_status:"Pending" as "Pending"|"Saved"|"Failed",deployed_read_verified_at:null as string|null,
    teams_discovered:teams.length,expected_teams:expected,complete_rosters:complete.length,partial_rosters:e.rosters.filter(r=>r.status==="Partial").length,failed_rosters:expected-complete.length-e.rosters.filter(r=>r.status==="Partial").length,
    rostered_players:teams.reduce((n,t)=>n+t.roster.length,0),remaining_matchups:schedule.length,expected_matchups:expectedGames,
    standings:e.standings&&snapshot.standings?.length===expected,scoring:e.scoring,rules:e.rules,
    available_players:input?.available_ids?.length??0,pool:e.pool,transactions:input?.transactions?.length??0,transaction_rows:e.transaction_rows,transaction_scope:e.transaction_scope,winning_bids:input?.transactions?.filter(t=>t.kind==="add"&&t.bid!==undefined).length??0,faab_balances:teams.filter(t=>t.faab!==undefined).length,
    players_researched:new Set(e.researched_player_ids).size,research_targets:new Set(e.research_target_ids).size,findings_collected:findings.length,findings_imported:0,current_injury_players:injuries.size,usage_players:new Set(findings.filter(f=>f.category==="usage").map(f=>f.player_id??f.player)).size,missing_publication:findings.filter(f=>f.published_at===null).length,
    unresolved_conflicts:findings.filter(f=>f.effect).some((f,i,a)=>a.some((g,j)=>i!==j&&f.player_id===g.player_id&&f.effect?.week===g.effect?.week&&JSON.stringify(f.effect)!==JSON.stringify(g.effect)))?1:0,
    yahoo_validation:"Complete" as CoverageStatus,research_validation:research?"Complete":"Missing" as CoverageStatus,rejected_records:0,sources:e.sources,
    trade_ready:expected===10&&complete.length===expected,schedule_ready:expectedGames!==null&&schedule.length===expectedGames,lineup_research_ready:findings.some(f=>players.some(p=>p.id===f.player_id)&&snapshot.roster.some(p=>p.name===f.player)),analysis_ready:true,
    retained:false,limitations:e.limitations,rosters:e.rosters};
}
