import type { Snapshot } from "./snapshot.ts";
import { calculate, fingerprint, ENGINE_VERSION, type AnalysisResult } from "./engine.ts";
import { defaultSettings, parseSettings, type Settings } from "./strategies.ts";
import { parseResearch, type Research } from "./research.ts";
import type { CoverageReport } from "./coverage.ts";
import type { RefreshAttempt } from "./refresh.ts";
import { captureSummaryBaseline, compareSummaryBaselines, type SummaryBaseline, type SummaryChange } from "./summary.ts";
import type { HistoryRecord, ReviewIndex } from "./weekly-types.ts";
import { emptyReviewIndex, historyRecord, reference } from "./weekly-history.ts";
import { decisionData } from "./weekly-model.ts";
export type AnalysisState={schema_version:1;review_index?:ReviewIndex;bundled_snapshot?:Snapshot;coverage?:CoverageReport;refresh_attempts?:RefreshAttempt[];summary_baseline?:SummaryBaseline;summary_changes?:SummaryChange[];settings:Settings;research:Research|null;analysis:AnalysisResult|null};
export const initialState=():AnalysisState=>({schema_version:1,settings:{...defaultSettings},research:null,analysis:null});
export type StateRecord={value:AnalysisState;etag:string};
export interface AnalysisStore {
  putHistory?(record:HistoryRecord):Promise<void>;
  readHistory?(id:string):Promise<HistoryRecord|null>;
  archive?(attempt:RefreshAttempt):Promise<void>;
  read():Promise<StateRecord|null>;
  write(value:AnalysisState,etag?:string):Promise<void>;
  yahoo():Promise<{snapshot:Snapshot;etag:string}|null>;
}
export function needsAnalysis(state:AnalysisState,snapshot:Snapshot|null) {
  return !snapshot||!state.analysis||state.analysis.source_hash!==fingerprint({snapshot,research:state.research,settings:state.settings,engine:ENGINE_VERSION});
}
export async function runAnalysis(store:AnalysisStore,now=Date.now(),compute=calculate):Promise<AnalysisState> {
  const record=await store.read(),state=record?.value??initialState();
  const source=await store.yahoo(); if(!source)throw new Error("Import and save a Yahoo snapshot before refreshing analysis.");
  const analysis=compute(source.snapshot,state.research,state.settings,state.analysis,now);
  // Reject an analysis calculated against a source replaced during the calculation.
  const latest=await store.yahoo();if(latest?.etag!==source.etag)throw new Error("Yahoo data changed during calculation. Refresh analysis again.");
  const baseline=captureSummaryBaseline(analysis,state.research,source.snapshot.week);
  const previous=state.summary_baseline??(state.analysis?captureSummaryBaseline(state.analysis,null,state.analysis.yahoo_at===source.snapshot.captured_at?source.snapshot.week:null):null);
  const next={...state,analysis,summary_baseline:baseline,summary_changes:compareSummaryBaselines(previous,baseline,state.research,now)};
  if(store.putHistory){const index=structuredClone(state.review_index??emptyReviewIndex()),last=index.decisions.at(-1),analysisHash=fingerprint({players:analysis.players,lineup:analysis.lineup,waivers:analysis.waivers,trades:analysis.trades,playoffs:analysis.playoffs});if(last?.source_hash!==analysis.source_hash||last.engine_version!==analysis.engine_version||last.analysis_hash!==analysisHash){const decision=historyRecord(decisionData(source.snapshot,state.research,analysis,now));await store.putHistory(decision);index.decisions.push({...reference(decision),analysis_hash:analysisHash});}next.review_index=index;}
  // ETag compare-and-swap rejects concurrent settings/research/results changes.
  await store.write(next,record?.etag);
  return next;
}
export async function updateSettings(store:AnalysisStore,value:unknown) {
  const settings=parseSettings(value); const record=await store.read();const next={...(record?.value??initialState()),settings};
  await store.write(next,record?.etag);return next;
}
export async function importResearch(store:AnalysisStore,text:string) {
  const research=parseResearch(text);const record=await store.read();const state=record?.value??initialState();
  if(state.bundled_snapshot)throw new Error("Import research with the comprehensive refresh bundle to keep coverage consistent.");
  if(state.research&&Date.parse(research.collected_at)<Date.parse(state.research.collected_at))throw new Error("Research snapshot is older than the stored research.");
  const next={...state,research};await store.write(next,record?.etag);return next;
}
