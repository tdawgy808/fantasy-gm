import { calculate, type AnalysisResult } from "./engine.ts";
import { buildWeeklyReview } from "./weekly-model.ts";
import { historyRecord } from "./weekly-history.ts";
import { weeklyMetrics } from "./weekly-metrics.ts";
import type { DecisionRecord, ResultRecord } from "./weekly-types.ts";

// Offline, read-only replay: callers supply a fixed candidate implementation.
// Results are never supplied to the candidate; no stored records or weights are changed.
export function backtestDecisions(pairs:{decision:DecisionRecord;result:ResultRecord}[],candidateVersion:string,candidate:typeof calculate=calculate){
  const unique=new Map<string,typeof pairs[number]>();for(const pair of [...pairs].sort((a,b)=>a.decision.recorded_at.localeCompare(b.decision.recorded_at))){const d=pair.decision;if(d.scope!=="pregame"||d.integrity_warnings.length||pair.result.results.status!=="final"||d.week!==pair.result.week||d.season!==pair.result.season)continue;const key=`${d.season}:${d.week}`;if(!unique.has(key))unique.set(key,pair);}
  const rows=[...unique.values()],cut=Math.max(1,Math.floor(rows.length*.7)),training=rows.slice(0,cut),heldout=rows.slice(cut);
  const evaluate=(values:typeof rows)=>{const baseline=[],proposed=[];for(const {decision:d,result} of values){const archived=structuredClone(d);const analysis:AnalysisResult=candidate(structuredClone(d.snapshot),structuredClone(d.research),structuredClone(d.analysis.settings),null,Date.parse(d.recorded_at));if(analysis.engine_version!==candidateVersion)throw Error("Candidate implementation/version mismatch.");baseline.push(historyRecord(buildWeeklyReview(archived,result,Date.parse(result.recorded_at))));proposed.push(historyRecord(buildWeeklyReview({...archived,analysis,engine_version:candidateVersion},result,Date.parse(result.recorded_at))));}return {baseline:weeklyMetrics(baseline),candidate:weeklyMetrics(proposed)};};
  return {candidate_version:candidateVersion,training_weeks:training.length,heldout_weeks:heldout.length,training:evaluate(training),heldout:evaluate(heldout),adoption_ready:false,note:rows.length<8?"Insufficient independent weeks for an adoption evaluation. Collect at least eight timed weeks with complete outcomes, reserve chronological held-out weeks, and require a human review.":"Replay is descriptive evidence only. Freeze candidate design before inspecting held-out results, examine constraints and injury handling, then request approval. No automatic adoption."};
}
