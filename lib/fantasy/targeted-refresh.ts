import { checkPrivateFields, parseSnapshot, type Snapshot } from "./snapshot.ts";
import type { PlayerInput, TeamInput } from "./inputs.ts";
import { timestamp, sourceUrl } from "./inputs.ts";
import { initialFreshness } from "./freshness.ts";
import type { Research } from "./research.ts";
import type { CollectionEvidence, CoverageReport } from "./coverage.ts";

type PlayerPatch={id:string}&{[K in keyof Omit<PlayerInput,"id">]?:PlayerInput[K]|null};
export type TargetedRefresh={schema_version:2;mode:"daily";base_captured_at:string;captured_at:string;week:number;player_updates:PlayerPatch[];roster_updates:TeamInput[];availability_updates:{player_id:string;state:"FA"|"W"|"unavailable"}[];availability_checked_ids:string[];matchup?:Snapshot["matchup"];faab_remaining?:number;research:Research|null;collection:{sources:CollectionEvidence["sources"];limitations:string[];researched_player_ids:string[];research_target_ids:string[]}};
const fields=new Set(["id","name","position","team","eligible","projection","status","bye","game_status","actual","projected_stats","history","ros_projection","playoff_projection","opportunity_trend","usage_note","environment_note","matchup_note"]);
export function mergeTargeted(b:TargetedRefresh,base:Snapshot,coverage:CoverageReport|undefined){
  const fail=():never=>{throw Error("Invalid targeted refresh. Use a current comprehensive baseline and explicit checked updates.");};
  checkPrivateFields(b);
  if(b?.schema_version!==2||b.mode!=="daily"||!base.analysis_inputs||!coverage?.trade_ready||coverage.complete_rosters!==10||b.base_captured_at!==base.captured_at||b.week!==base.week||!timestamp(b.captured_at)||Date.parse(b.captured_at)<=Date.parse(base.captured_at))fail();
  if(![b.player_updates,b.roster_updates,b.availability_updates,b.availability_checked_ids].every(Array.isArray)||!b.collection||![b.collection.sources,b.collection.limitations,b.collection.researched_player_ids,b.collection.research_target_ids].every(Array.isArray))fail();
  if(new Set(b.player_updates.map(p=>p.id)).size!==b.player_updates.length||new Set(b.roster_updates.map(t=>t.id)).size!==b.roster_updates.length||new Set(b.availability_updates.map(p=>p.player_id)).size!==b.availability_updates.length||new Set(b.availability_checked_ids).size!==b.availability_checked_ids.length)fail();
  if(b.collection.sources.some(s=>!sourceUrl(s.url)||!["accessed","restricted","unavailable"].includes(s.status)||typeof s.name!=="string"||typeof s.note!=="string")||b.collection.limitations.some(s=>typeof s!=="string"))fail();
  const s=structuredClone(base),input=s.analysis_inputs!,at=b.captured_at;
  const fresh=structuredClone(base.data_freshness??initialFreshness(base));fresh.mode="daily";
  for(const patch of b.player_updates){
    if(!patch||typeof patch.id!=="string"||Object.keys(patch).some(k=>!fields.has(k)))fail();
    const old=input.players.find(p=>p.id===patch.id);const next={...old,...patch} as PlayerInput;
    for(const [key,value] of Object.entries(patch))if(value===null)delete (next as unknown as Record<string,unknown>)[key];
    if(old)input.players[input.players.indexOf(old)]=next;else input.players.push(next);
    if(Object.hasOwn(patch,"projection")||Object.hasOwn(patch,"projected_stats"))fresh.projections[patch.id]=at;
    // The two projection formats must not silently disagree after a partial update.
    if(Object.hasOwn(patch,"projection")&&!Object.hasOwn(patch,"projected_stats"))delete next.projected_stats;
  }
  const ids=new Set(input.players.map(p=>p.id));
  for(const id of b.availability_checked_ids){if(!ids.has(id)||!b.player_updates.some(p=>p.id===id&&Object.hasOwn(p,"status")))fail();fresh.availability[id]=at;}
  const required=[s.team.id,input.opponent_team_id].filter((id):id is number=>id!==undefined);
  for(const id of required)if(!b.roster_updates.some(t=>t.id===id))fail();
  for(const team of b.roster_updates){
    const index=input.teams?.findIndex(t=>t.id===team.id)??-1;if(index<0||!Array.isArray(team.roster)||!team.roster.length)fail();
    if(team.roster.some(r=>!b.availability_checked_ids.includes(r.player_id)))fail();
    input.teams![index]={...input.teams![index],...team};fresh.rosters[String(team.id)]=at;
  }
  const owned=new Set(input.teams!.flatMap(t=>t.roster.map(r=>r.player_id))),available=new Set(input.available_ids??[]);
  const rows=new Map((s.available_players??[]).filter(Array.isArray).map(r=>[String(r[0]).toLowerCase(),r]));
  const newlyAvailable:string[]=[],recentlyAdded:string[]=[];
  for(const id of owned)if(available.delete(id))recentlyAdded.push(id);
  for(const update of b.availability_updates){
    if(!ids.has(update.player_id)||!["FA","W","unavailable"].includes(update.state))fail();
    if(update.state==="unavailable")available.delete(update.player_id);
    else {if(owned.has(update.player_id))fail();if(!available.has(update.player_id))newlyAvailable.push(update.player_id);available.add(update.player_id);}
  }
  input.available_ids=[...available];
  // Rebuild display rows only from explicitly confirmed membership. Omitted rows persist.
  s.available_players=[...available].map(id=>{const p=input.players.find(p=>p.id===id)!;const old=rows.get(p.name.toLowerCase());const status=b.availability_updates.find(u=>u.player_id===id)?.state??(old?.[2]??"FA");return [p.name,p.position,status,p.projection??null];});
  const owner=input.teams!.find(t=>t.id===s.team.id)!;
  s.roster=owner.roster.map(r=>{const p=input.players.find(p=>p.id===r.player_id);if(!p)fail();const old=base.roster.find(o=>o.name===p!.name),patch=b.player_updates.find(u=>u.id===r.player_id);return {slot:r.slot,name:p!.name,team:p!.team,position:p!.position,projection:p!.projection??null,status:p!.status,bye:p!.bye,actual:patch&&Object.hasOwn(patch,"actual")?p!.actual:old?.actual??p!.actual,game_status:patch&&Object.hasOwn(patch,"game_status")?p!.game_status:old?.game_status??p!.game_status,opponent:old?.opponent};});
  if(b.matchup!==undefined){s.matchup=b.matchup;fresh.matchup_at=at;}
  if(b.faab_remaining!==undefined){if(!Number.isFinite(b.faab_remaining)||b.faab_remaining<0)fail();s.team.faab_remaining=b.faab_remaining;owner.faab=b.faab_remaining;fresh.faab_at=at;}
  s.research_checked_at={...base.research_checked_at,...Object.fromEntries(b.collection.researched_player_ids.map(id=>[id,b.research?.collected_at??at]))};
  s.refresh_changes={newly_available:newlyAvailable,recently_added:recentlyAdded,changed_players:b.player_updates.filter(p=>Object.entries(p).some(([k,v])=>k!=="id"&&JSON.stringify(base.analysis_inputs?.players.find(o=>o.id===p.id)?.[k as keyof PlayerInput]??null)!==JSON.stringify(v))).map(p=>p.id)};
  s.captured_at=at;s.data_freshness=fresh;s.method="Daily targeted browser collection merged into comprehensive baseline";
  const snapshot=parseSnapshot(JSON.stringify(s));
  const collection:CollectionEvidence={expected_team_ids:input.teams!.map(t=>t.id),rosters:coverage!.rosters.map(r=>({...r,player_count:input.teams!.find(t=>t.id===r.team_id)!.roster.length,collected_at:fresh.rosters[String(r.team_id)]??r.collected_at})),standings:coverage!.standings,scoring:coverage!.scoring,rules:coverage!.rules,pool:coverage!.pool,transaction_rows:coverage!.transaction_rows,transaction_scope:coverage!.transaction_scope,researched_player_ids:b.collection.researched_player_ids,research_target_ids:b.collection.research_target_ids,sources:b.collection.sources,limitations:[...b.collection.limitations,`Targeted update: ${b.player_updates.length} player records, ${b.roster_updates.length} complete roster updates; omitted players and original dates retained.`,`${newlyAvailable.length} newly available; ${recentlyAdded.length} previously available players now rostered.`,`Standings, schedules, pool pagination and transaction coverage retained from baseline ${fresh.baseline_at}.`]};
  return {schema_version:1 as const,snapshot,research:b.research,collection};
}
