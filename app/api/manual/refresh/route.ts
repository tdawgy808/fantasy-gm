import { connection,NextRequest,NextResponse } from "next/server";
import { AUTH_COOKIE,isOwner,sameOrigin } from "@/lib/auth/session";
import { analysisStore } from "@/lib/fantasy/analysis-store";
import { importRefresh,saveHybridRefresh,verifyRefresh } from "@/lib/fantasy/refresh";
import { targetedPlan } from "@/lib/fantasy/refresh-plan";
import { boundedText } from "@/lib/fantasy/hosted";
import { reviewReadiness } from "@/lib/fantasy/weekly-service";
import { hostedYahooAccess } from "@/lib/fantasy/yahoo-hosted";
import { buildHybridRefresh, HybridError, readProjectionImport } from "@/lib/fantasy/yahoo-hybrid";
export const maxDuration=90;
const hybridEnabled=()=>!!process.env.VERCEL&&process.env.YAHOO_FANTASY_API_ENABLED==="true";
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  try{const state=(await analysisStore.read())?.value;const coverage=state?.coverage?{...state.coverage,review_readiness:state.bundled_snapshot&&state.bundled_snapshot.week>1?reviewReadiness(state,state.bundled_snapshot.league.season,state.coverage.review_readiness?.week??state.bundled_snapshot.week-1):null}:null;return reply({coverage,attempts:state?.refresh_attempts??[],plan:state?.bundled_snapshot?targetedPlan(state.bundled_snapshot,state.research,state.settings):null,hybrid_enabled:hybridEnabled()});}catch{return reply({error:"Unable to read private refresh history."},503);}
}
export async function POST(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({error:"Use application/json."},415);
  try{const raw=await boundedText(request.body);let value;try{value=JSON.parse(raw);}catch{/* The import validator records malformed JSON as a failed attempt. */}
    if(value?.action==="verify"){if(typeof value.id!=="string")return reply({error:"Missing refresh identifier."},400);return reply({coverage:await verifyRefresh(analysisStore,value.id,Date.now(),!!process.env.VERCEL)});}
    if(value?.action==="hybrid"){
      if(!hybridEnabled())return reply({error:"The hosted Yahoo connection is disabled."},403);
      const input=readProjectionImport(value);
      const state=(await analysisStore.read())?.value;
      const saved=await analysisStore.yahoo();
      if(!saved||!state?.coverage)return reply({error:"Save a comprehensive manual baseline first."},409);
      const access=await hostedYahooAccess();
      if(!access)return reply({error:"Connect Yahoo before running the hybrid refresh."},409);
      const bundle=await buildHybridRefresh(access,saved.snapshot,state.coverage,input);
      const next=await saveHybridRefresh(analysisStore,bundle,saved.etag);
      return reply({coverage:next.coverage});
    }
    const state=await importRefresh(analysisStore,raw);return reply({coverage:state.coverage});
  }catch(error){return reply({error:error instanceof HybridError?error.message:"Refresh did not finish. Check Data Coverage for the last saved bundle."},400);}
}
