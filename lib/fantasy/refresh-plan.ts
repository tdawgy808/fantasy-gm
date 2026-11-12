import type { Snapshot } from "./snapshot.ts";
import type { Research } from "./research.ts";
import type { Settings } from "./strategies.ts";
import { evaluatePlayers } from "./players.ts";
import { waiverScout } from "./waivers.ts";
import { expired, observedAt } from "./freshness.ts";
import { scoutPlayer, scoutingPool } from "./scouting.ts";
export function targetedPlan(snapshot:Snapshot,research:Research|null,settings:Settings,now=Date.now()){
  const nomination={...snapshot,data_freshness:undefined};
  const players=evaluatePlayers(nomination,research,now),available=new Set(snapshot.analysis_inputs?.available_ids??[]);
  const scouting=Object.fromEntries(players.filter(p=>available.has(p.id)).map(p=>[p.id,scoutPlayer(nomination,p,research,now,p.unavailable)]));
  const ranked=waiverScout(nomination,players,settings,now,scouting);
  // Same roster-value engine as recommendations; unrankable/missing-data players stay visible as research targets.
  const candidates=ranked.slice(0,15).map(w=>w.id);
  for(const id of snapshot.refresh_changes?.newly_available??[])if(candidates.length<25&&available.has(id)&&!candidates.includes(id))candidates.push(id);
  for(const [id,scout] of Object.entries(scouting))if(candidates.length<25&&scout.direction==="up"&&!candidates.includes(id))candidates.push(id);
  for(const w of ranked)if(candidates.length<25&&!candidates.includes(w.id))candidates.push(w.id);
  for(const p of players.filter(p=>available.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name)))if(candidates.length<25&&!candidates.includes(p.id))candidates.push(p.id);
  const critical=(snapshot.analysis_inputs?.teams??[]).filter(t=>[snapshot.team.id,snapshot.analysis_inputs?.opponent_team_id].includes(t.id)).flatMap(t=>t.roster.map(r=>r.player_id));
  const targets=[...new Set([...critical,...candidates])];
  const evidence=targets.map(id=>{
    const p=players.find(p=>p.id===id)!;const findings=research?.findings.filter(f=>f.player_id===id||!f.player_id&&f.player.toLowerCase()===p.name.toLowerCase())??[];
    const last=(categories:string[])=>findings.filter(f=>categories.includes(f.category)).sort((a,b)=>Date.parse(b.retrieved_at)-Date.parse(a.retrieved_at))[0];
    const injury=last(["injury","availability"]),usage=last(["usage","performance","workload"]);
    const flagged=/questionable|out|inactive|doubtful|\b(Q|O|IR|NA|D)\b/i.test(p.status??"");
    const checked=snapshot.research_checked_at?.[id];
    const lastGame=p.history?.slice().sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at))[0]?.played_at;
    const usageAfterGame=!!lastGame&&(!usage||Date.parse(lastGame)>Date.parse(usage.retrieved_at));
    const changed=snapshot.refresh_changes?.changed_players.includes(id)||snapshot.refresh_changes?.newly_available.includes(id);
    const reasons=[...(changed&&(!checked||Date.parse(checked)<Date.parse(snapshot.captured_at))?["New availability or changed player input needs review."]:[]),...(flagged?["Flagged availability; recheck current reports."]:[]),...(expired(checked,now,24)&&expired(injury?.retrieved_at,now,6)?["Research check missing or stale; check current reports and record unavailable evidence."]:[]),...(usageAfterGame?["A game occurred after the saved usage evidence."]:[]),...(expired(checked,now,168)&&expired(usage?.retrieved_at,now,168)?["Usage evidence missing or older than seven days."]:[])];
    return {id,name:p.name,candidate:candidates.includes(id),critical_report_scan:critical.includes(id),last_research_check:checked??null,research_required:reasons.length>0,reasons,projection_at:observedAt(snapshot,"projections",id),availability_at:observedAt(snapshot,"availability",id),injury:{published_at:injury?.published_at??injury?.published_date??null,retrieved_at:injury?.retrieved_at??null},usage:{published_at:usage?.published_at??usage?.published_date??null,retrieved_at:usage?.retrieved_at??null},historical_retrieved_at:scouting[id]?.historical_at??null,historical_last_game:p.history?.slice().sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at))[0]?.played_at??null,reuse_sources:findings.filter(f=>!expired(f.retrieved_at,now,["usage","performance"].includes(f.category)?168:6)).map(f=>({url:f.source_url,published_at:f.published_at,published_date:f.published_date,retrieved_at:f.retrieved_at}))};
  });
  return {mode:"daily" as const,base_captured_at:snapshot.captured_at,week:snapshot.week,baseline_at:snapshot.data_freshness?.baseline_at??snapshot.captured_at,weekly_due:expired(snapshot.data_freshness?.baseline_at??snapshot.captured_at,now,168),weekly_scouting_pool:scoutingPool(snapshot,players,scouting),candidate_ids:candidates,critical_check_ids:critical,players:evidence,notes:["Use the weekly scouting pool for comprehensive collection. Collect at least five per position when available; verify recent game logs, role and injury reports, and record missing sources.","This is a collection plan from saved data; it does not browse or refresh sources.","Candidate nominations can use last-known projections to prioritize collection; numerical recommendations still require fresh inputs.","First check current Yahoo rosters, recent transactions and position leaders; add newly available opportunities before finalizing the candidate list.","Check official game-day injury/inactive updates before reusing older reports. Retrieval freshness never makes an old publication current.","Historical games and unchanged relevant usage retain original source dates; refresh usage after another game."]};
}
