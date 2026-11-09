import { createHash } from "node:crypto";
import type { HistoryRecord, HistoryRef, ReviewIndex } from "./weekly-types.ts";

export const emptyReviewIndex=():ReviewIndex=>({decisions:[],results:[],reviews:[]});
export function historyId(record:Omit<HistoryRecord,"id">):string{return `${record.kind}-${createHash("sha256").update(JSON.stringify(record)).digest("hex")}`;}
export function historyRecord<T extends Omit<HistoryRecord,"id">>(record:T):T&{id:string}{return {...record,id:historyId(record)};}
export function validateHistoryId(id:string){if(!/^(decision|result|review)-[a-f0-9]{64}$/.test(id))throw Error("Invalid history reference.");}
export function decodeHistory(text:string):HistoryRecord{const record=JSON.parse(text) as HistoryRecord;validateHistoryId(record.id);const {id,...body}=record;if(historyId(body)!==id)throw Error("History integrity check failed.");return record;}
export function reference(record:HistoryRecord):HistoryRef{return {id:record.id,season:record.season,week:record.week,at:record.kind==="review"?record.generated_at:record.recorded_at,...(record.kind==="decision"?{engine_version:record.engine_version,source_hash:record.source_hash,scope:record.scope}:record.kind==="review"?{status:record.status,primary_decision:record.primary_decision}:{})};}
