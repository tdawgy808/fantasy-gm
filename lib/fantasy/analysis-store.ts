import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { origin } from "../auth/session";
import { boundedText, projectSnapshot } from "./hosted";
import { blobSnapshotStore, hostedStorageConfigured } from "./blob-store";
import { parseSettings } from "./strategies";
import { parseResearch } from "./research";
import type { AnalysisState, AnalysisStore } from "./analysis-service";
import { privateReadOptions } from "./blob-options";
import { decodeHistory, validateHistoryId } from "./weekly-history";

const blobPath="fantasy-gm/2026/121612/5/analysis-state.json";
const localPath=join(process.cwd(),"private","analysis-state.json");
function localAllowed(){return !process.env.VERCEL&&["localhost","127.0.0.1","[::1]"].includes(new URL(origin()).hostname);}
function decode(text:string):AnalysisState {
  const state=JSON.parse(text);if(state.schema_version!==1)throw new Error("Unsupported analysis state.");
  state.settings=parseSettings(state.settings);if(state.bundled_snapshot)state.bundled_snapshot=projectSnapshot(JSON.stringify(state.bundled_snapshot));
  if(state.research)state.research=parseResearch(JSON.stringify(state.research));
  return state;
}
async function localRead(){try{const text=await readFile(localPath,"utf8");return {value:decode(text),etag:createHash("sha256").update(text).digest("hex")};}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}}
// A process-local queue serializes local dev file writes. Hosted writes use durable Blob ETags.
let queue:Promise<void>=Promise.resolve();
export const analysisStore:AnalysisStore={
  async readHistory(id){validateHistoryId(id);if(hostedStorageConfigured()){const result=await get(`fantasy-gm/2026/121612/5/gm-history/${id}.json`,privateReadOptions());if(!result||result.statusCode!==200)return null;return decodeHistory(await boundedText(result.stream,5*1024*1024));}if(!localAllowed())throw Error("Private storage is not configured.");try{return decodeHistory(await readFile(join(process.cwd(),"private","gm-history",`${id}.json`),"utf8"));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}},
  async putHistory(record){const text=JSON.stringify(record);decodeHistory(text);if(Buffer.byteLength(text)>5*1024*1024)throw Error("Weekly history exceeds 5 MB.");if(hostedStorageConfigured()){try{await put(`fantasy-gm/2026/121612/5/gm-history/${record.id}.json`,text,{access:"private",addRandomSuffix:false,allowOverwrite:false,contentType:"application/json"});return;}catch(error){const prior=await this.readHistory!(record.id);if(prior&&JSON.stringify(prior)===text)return;throw error;}}if(!localAllowed())throw Error("Private storage is not configured.");const dir=join(process.cwd(),"private","gm-history");await mkdir(dir,{recursive:true});try{await writeFile(join(dir,`${record.id}.json`),text,{flag:"wx"});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST"||JSON.stringify(await this.readHistory!(record.id))!==text)throw error;}},
  async archive(attempt){const text=JSON.stringify(attempt);if(hostedStorageConfigured()){await put(`fantasy-gm/2026/121612/5/refresh-history/${attempt.id}.json`,text,{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});return;}if(!localAllowed())throw new Error("Private storage is not configured.");const dir=join(process.cwd(),"private","refresh-history");await mkdir(dir,{recursive:true});await writeFile(join(dir,`${attempt.id}.json`),text);},
  async read(){
    if(hostedStorageConfigured()) {const result=await get(blobPath,privateReadOptions());if(!result||result.statusCode!==200)return null;return {value:decode(await boundedText(result.stream,3*1024*1024)),etag:result.blob.etag};}
    if(!localAllowed())throw new Error("Private storage is not configured.");return localRead();
  },
  async write(value,etag){
    const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>3*1024*1024)throw new Error("Saved analysis exceeds 3 MB. Reduce imported research/history.");
    if(hostedStorageConfigured()){
      try {await put(blobPath,text,{access:"private",contentType:"application/json",addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{})});}
      catch(error){if(error instanceof BlobPreconditionFailedError||error instanceof Error&&/already exists/i.test(error.message))throw new Error("Analysis inputs changed. Reload and try again.");throw error;}return;
    }
    if(!localAllowed())throw new Error("Private storage is not configured.");
    const write=queue.then(async()=>{const current=await localRead();if(current?.etag!==etag)throw new Error("Analysis inputs changed. Reload and try again.");await mkdir(join(process.cwd(),"private"),{recursive:true});const temp=`${localPath}.${randomUUID()}.tmp`;await writeFile(temp,text);await rename(temp,localPath);});queue=write.catch(()=>{});await write;
  },
  async yahoo(){
    const state=await this.read();if(state?.value.bundled_snapshot)return {snapshot:state.value.bundled_snapshot,etag:createHash("sha256").update(JSON.stringify(state.value.bundled_snapshot)).digest("hex")};
    if(hostedStorageConfigured())return blobSnapshotStore.read();
    if(!localAllowed())throw new Error("Private storage is not configured.");
    try {const text=await readFile(join(process.cwd(),"private","snapshots","current.json"),"utf8");return {snapshot:projectSnapshot(text),etag:createHash("sha256").update(text).digest("hex")};}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
  },
};
