import { initialState, type AnalysisState, type AnalysisStore } from "./analysis-service.ts";
import { emptyReviewIndex, historyRecord, reference } from "./weekly-history.ts";
import { buildWeeklyReview, parseFinalResults } from "./weekly-model.ts";
import type { DecisionRecord, FinalWeekResults, ResultRecord, ReviewReadiness, WeeklyReview } from "./weekly-types.ts";

function history(store:AnalysisStore){if(!store.putHistory||!store.readHistory)throw Error("Private review history is not configured.");return {put:store.putHistory.bind(store),read:store.readHistory.bind(store)};}
export async function appendResults(store:AnalysisStore,state:AnalysisState,values:FinalWeekResults[],now:number){
  const h=history(store),index=structuredClone(state.review_index??emptyReviewIndex()),changed=new Set<string>();
  for(const value of values){
    const results=parseFinalResults(value,now),refs=index.results.filter(r=>r.season===results.season&&r.week===results.week);
    const latest=refs.length?await h.read(refs.at(-1)!.id):null;
    if(latest?.kind==="result"&&Date.parse(results.collected_at)<Date.parse(latest.results.collected_at))throw Error("Weekly results are older than the saved revision.");
    if(latest?.kind==="result"&&latest.results.status==="final"&&results.status!=="final")throw Error("Final results cannot be replaced by pending results.");
    if(latest?.kind==="result"&&JSON.stringify(latest.results)===JSON.stringify(results))continue;
    if(latest?.kind==="result"&&results.collected_at===latest.results.collected_at)throw Error("Corrected results need a newer collection timestamp.");
    const record=historyRecord({kind:"result" as const,season:results.season,week:results.week,recorded_at:new Date(now).toISOString(),results});
    await h.put(record);index.results.push(reference(record));changed.add(`${results.season}:${results.week}`);
  }
  let next={...state,review_index:index};
  for(const key of changed){const [season,week]=key.split(':').map(Number);next=await appendReview(store,next,season,week,now);}
  return next;
}
export async function appendReview(store:AnalysisStore,state:AnalysisState,season:number,week:number,now:number,decisionId?:string){
  const h=history(store),index=structuredClone(state.review_index??emptyReviewIndex());
  const ref=index.results.filter(r=>r.season===season&&r.week===week).at(-1);if(!ref)throw Error("Import weekly results before generating a review.");
  const result=await h.read(ref.id);if(result?.kind!=="result")throw Error("Weekly results history is unavailable.");
  const decisions=index.decisions.filter(r=>r.season===season&&r.week===week);
  const primary=decisions.find(r=>r.scope==="pregame")??decisions[0];
  const selected=decisionId?decisions.find(r=>r.id===decisionId):primary;if(decisionId&&!selected)throw Error("Choose an archived decision for this week.");
  const decision=selected?await h.read(selected.id):null;if(decision&&decision.kind!=="decision"||selected&&!decision)throw Error("Decision history is unavailable.");
  const review=historyRecord(buildWeeklyReview(decision as DecisionRecord|null,result as ResultRecord,now,!decisionId||selected?.id===primary?.id));
  await h.put(review);index.reviews.push(reference(review));return {...state,review_index:index};
}
export async function saveWeeklyResults(store:AnalysisStore,values:unknown[],now=Date.now()){
  if(!Array.isArray(values)||!values.length||values.length>18)throw Error("Import one to eighteen weekly result records.");
  const record=await store.read(),next=await appendResults(store,record?.value??initialState(),values.map(v=>parseFinalResults(v,now)),now);
  await store.write(next,record?.etag);return next;
}
export async function regenerateReview(store:AnalysisStore,season:number,week:number,decisionId?:string,now=Date.now()){
  const record=await store.read(),next=await appendReview(store,record?.value??initialState(),season,week,now,decisionId);await store.write(next,record?.etag);return next;
}
export function reviewReadiness(state:AnalysisState,season:number,week:number):ReviewReadiness{
  const ref=state.review_index?.reviews.filter(r=>r.season===season&&r.week===week&&r.primary_decision).at(-1);
  return {season,week,status:ref?.status??"pending",reason:!ref?"Pending finalized Yahoo scores, full starter/bench points and standings import.":ref.status==="ready"?"Final results and an archived decision are available.":ref.status==="pending"?"Yahoo results have not been explicitly finalized.":"Results imported; decision timing or outcome coverage is limited. Open the review for details."};
}
export async function loadReviews(store:AnalysisStore,state:AnalysisState){
  const refs=state.review_index?.reviews??[],latest=new Map<string,typeof refs[number]>();for(const ref of refs)if(ref.primary_decision)latest.set(`${ref.season}:${ref.week}`,ref);
  const values:WeeklyReview[]=[];for(const ref of latest.values()){const r=await store.readHistory?.(ref.id);if(r?.kind==="review")values.push(r);else throw Error("Review history is unavailable.");}return values;
}
