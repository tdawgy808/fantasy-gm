import type { Snapshot } from "./snapshot.ts";
import { calculate, fingerprint, ENGINE_VERSION, type AnalysisResult } from "./engine.ts";
import { defaultSettings, parseSettings, type Settings } from "./strategies.ts";
import { parseResearch, type Research } from "./research.ts";
export type AnalysisState={schema_version:1;settings:Settings;research:Research|null;analysis:AnalysisResult|null};
export const initialState=():AnalysisState=>({schema_version:1,settings:{...defaultSettings},research:null,analysis:null});
export type StateRecord={value:AnalysisState;etag:string};
export interface AnalysisStore {
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
  const next={...state,analysis};
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
  if(state.research&&Date.parse(research.collected_at)<Date.parse(state.research.collected_at))throw new Error("Research snapshot is older than the stored research.");
  const next={...state,research};await store.write(next,record?.etag);return next;
}
