import { randomUUID } from "node:crypto";
import { parseSnapshot, checkPrivateFields, type Snapshot } from "./snapshot.ts";
import { parseResearch, type Research } from "./research.ts";
import { timestamp,sourceUrl } from "./inputs.ts";
import { coverageReport, coverageStatus, type CollectionEvidence, type CoverageReport } from "./coverage.ts";
import { initialState, type AnalysisStore } from "./analysis-service.ts";
import { mergeTargeted } from "./targeted-refresh.ts";
import { initialFreshness } from "./freshness.ts";
export type RefreshAttempt={id:string;attempted_at:string;status:"Saved"|"Failed";message:string;report?:CoverageReport};
export type RefreshBundle={schema_version:1;snapshot:Snapshot;research:Research|null;collection:CollectionEvidence};
export function parseRefresh(raw:string):RefreshBundle{
  const b=JSON.parse(raw);checkPrivateFields(b);
  if(b?.schema_version!==1)throw new Error("Unsupported comprehensive refresh format.");
  const snapshot=parseSnapshot(JSON.stringify(b.snapshot));
  if(snapshot.league.id!==121612||snapshot.league.season!==2026||snapshot.team.id!==5)throw new Error("Wrong league or owner.");
  const research=b.research===null?null:parseResearch(JSON.stringify(b.research));
  const e=b.collection as CollectionEvidence;
  if(!e||!Array.isArray(e.expected_team_ids)||e.expected_team_ids.length!==10||new Set(e.expected_team_ids).size!==10||e.expected_team_ids.some(id=>!Number.isInteger(id)||id<1||id>10)||!Array.isArray(e.rosters)||new Set(e.rosters.map(r=>r.team_id)).size!==e.rosters.length||e.rosters.some(r=>!e.expected_team_ids.includes(r.team_id)||!["Complete","Partial","Missing","Failed"].includes(r.status)||!timestamp(r.collected_at)||!Number.isInteger(r.player_count)||r.player_count<0)||![e.pool,e.sources,e.limitations,e.researched_player_ids,e.research_target_ids].every(Array.isArray)||![e.standings,e.scoring,e.rules].every(v=>typeof v==="boolean")||!Number.isInteger(e.transaction_rows)||e.transaction_rows<0||typeof e.transaction_scope!=="string")throw new Error("Invalid collection evidence.");
  if(e.pool.some(p=>!["QB","RB","WR","TE","K","DEF"].includes(p.position)||!Number.isInteger(p.pages)||p.pages<0||typeof p.exhausted!=="boolean"||typeof p.scope!=="string")||e.sources.some(s=>typeof s.name!=="string"||typeof s.url!=="string"||!sourceUrl(s.url)||!["accessed","restricted","unavailable"].includes(s.status)||typeof s.note!=="string")||e.limitations.some(s=>typeof s!=="string")||[...e.researched_player_ids,...e.research_target_ids].some(id=>typeof id!=="string"))throw new Error("Invalid collection scope.");
  const playerIds=new Set(snapshot.analysis_inputs?.players.map(p=>p.id)??[]);
  if(e.researched_player_ids.some(id=>!e.research_target_ids.includes(id)||!playerIds.has(id)))throw new Error("Research coverage identities do not match targets and players.");
  for(const r of e.rosters.filter(r=>r.status==="Complete")){const team=snapshot.analysis_inputs?.teams?.find(t=>t.id===r.team_id);if(!team||!r.player_count||team.roster.length!==r.player_count||r.ids_verified!==true||!["offense","kicker","defense"].every(v=>r.views?.includes(v)))throw new Error("Roster evidence does not match imported records and all roster views.");}
  return {schema_version:1,snapshot,research,collection:e};
}
async function commitRefresh(store:AnalysisStore,raw:string,now=Date.now()){
  const id=randomUUID(),at=new Date(now).toISOString(),record=await store.read(),state=record?.value??initialState();
  const prior=await store.yahoo();
  const incoming=JSON.parse(raw),daily=incoming?.schema_version===2&&incoming?.mode==="daily";
  if(daily&&!prior)throw Error("A comprehensive baseline is required.");
  const bundle=parseRefresh(daily?JSON.stringify(mergeTargeted(incoming,prior!.snapshot,state.coverage)):raw);
  if(!daily){bundle.snapshot.data_freshness=initialFreshness(bundle.snapshot);bundle.snapshot.research_checked_at=Object.fromEntries(bundle.collection.researched_player_ids.map(id=>[id,bundle.research?.collected_at??bundle.snapshot.captured_at]));}
  if(!daily){const current=bundle.snapshot.analysis_inputs,old=prior?.snapshot.analysis_inputs;bundle.snapshot.refresh_changes={newly_available:(current?.available_ids??[]).filter(id=>!old?.available_ids?.includes(id)),recently_added:(old?.available_ids??[]).filter(id=>current?.teams?.some(t=>t.roster.some(p=>p.player_id===id))),changed_players:(current?.players??[]).filter(p=>{const before=old?.players.find(o=>o.id===p.id);return before&&(p.status!==before.status||p.projection!==before.projection);}).map(p=>p.id)};}
  if(prior&&Date.parse(bundle.snapshot.captured_at)<=Date.parse(prior.snapshot.captured_at))throw new Error("Refresh must be newer than saved Yahoo data.");
  const report=coverageReport(id,at,bundle.snapshot,bundle.research,bundle.collection);
  // A partial league collection never replaces a known complete source. Retain its original date.
  const retain=!daily&&!!prior&&(!report.trade_ready||!report.standings||!report.scoring||!report.rules);
  const snapshot=retain?prior!.snapshot:bundle.snapshot;
  let research=bundle.research??state.research;
  if(research&&state.research&&Date.parse(research.collected_at)<Date.parse(state.research.collected_at))throw new Error("Research is older than saved data.");
  if(bundle.research&&state.research){
    const keys=new Set(bundle.research.findings.map(f=>`${f.player_id??f.player}|${f.category}|${f.source_url}`));
    const old=state.research.findings.filter(f=>!keys.has(`${f.player_id??f.player}|${f.category}|${f.source_url}`)&&!bundle.research!.findings.some(n=>n.id===f.id));
    research=parseResearch(JSON.stringify({...bundle.research,findings:[...bundle.research.findings,...old]}));
    if(old.length)report.limitations=[...report.limitations,`${old.length} earlier research findings retained with their original retrieval/publication dates.`];
  }
  report.retained=retain;report.yahoo_at=snapshot.captured_at;report.research_at=research?.collected_at??null;
  if(retain)report.limitations=[...report.limitations,"Yahoo collection incomplete: previous valid Yahoo snapshot retained with its original capture date; counts above describe the attempted collection."];
  if(!bundle.research&&state.research)report.limitations=[...report.limitations,"Previous research retained with its original collection date."];
  report.import_status="Saved";report.findings_imported=research?.findings.length??0;
  report.status=coverageStatus(report);
  const attempt:RefreshAttempt={id,attempted_at:at,status:"Saved",message:retain?"Partial collection; older Yahoo source retained.":"Validated source bundle saved; deployed read verification pending.",report};
  const next={...state,research,bundled_snapshot:snapshot,coverage:report,refresh_attempts:[...(state.refresh_attempts??[]),attempt].slice(-50)};
  await store.write(next,record?.etag);await store.archive?.(attempt);return next;
}
export async function importRefresh(store:AnalysisStore,raw:string,now=Date.now()){
  try{return await commitRefresh(store,raw,now);}catch{
    const attempt:RefreshAttempt={id:randomUUID(),attempted_at:new Date(now).toISOString(),status:"Failed",message:"Validation or save failed. Check the latest successful receipt; no success is assumed for this attempt."};
    // Log against the latest state so a concurrent valid import is never rolled back.
    await store.archive?.(attempt);
    const current=await store.read(),state=current?.value??initialState();
    await store.write({...state,refresh_attempts:[...(state.refresh_attempts??[]),attempt].slice(-50)},current?.etag);
    throw new Error(attempt.message);
  }
}
export async function verifyRefresh(store:AnalysisStore,id:string,now=Date.now(),deployed=false){
  const record=await store.read();if(!record?.value.coverage||record.value.coverage.id!==id)throw new Error("Refresh changed before verification.");
  const source=await store.yahoo();if(source?.snapshot.captured_at!==record.value.coverage.yahoo_at)throw new Error("Saved Yahoo source does not match refresh receipt.");
  const coverage={...record.value.coverage,deployed_read_verified_at:deployed?new Date(now).toISOString():null};
  coverage.status=coverageStatus(coverage);
  const attempts=record.value.refresh_attempts?.map(a=>a.id===id?{...a,report:coverage,message:deployed?"Saved bundle read back by authenticated deployment.":"Saved bundle read back locally; production verification pending."}:a);
  await store.write({...record.value,coverage,refresh_attempts:attempts},record.etag);const attempt=attempts?.find(a=>a.id===id);if(attempt)await store.archive?.(attempt);return coverage;
}
