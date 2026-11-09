import { connection, NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isOwner, sameOrigin } from "@/lib/auth/session";
import { analysisStore } from "@/lib/fantasy/analysis-store";
import { initialState } from "@/lib/fantasy/analysis-service";
import { boundedText } from "@/lib/fantasy/hosted";
import { loadReviews, regenerateReview, reviewReadiness, saveWeeklyResults } from "@/lib/fantasy/weekly-service";
import { weeklyMetrics } from "@/lib/fantasy/weekly-metrics";
import { emptyReviewIndex } from "@/lib/fantasy/weekly-history";
function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});}
export async function GET(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  try{const state=(await analysisStore.read())?.value??initialState(),index=state.review_index??emptyReviewIndex();
    const id=request.nextUrl.searchParams.get("id");if(id){if(![...index.decisions,...index.results,...index.reviews].some(r=>r.id===id))return reply({error:"History record not found."},404);const record=await analysisStore.readHistory!(id);return reply({record});}
    const reviews=await loadReviews(analysisStore,state),latest=reviews.sort((a,b)=>b.week-a.week)[0]??null;
    const week=state.bundled_snapshot?.week??1;return reply({index,latest,metrics:weeklyMetrics(reviews),readiness:reviewReadiness(state,2026,state.coverage?.review_readiness?.week??Math.max(1,week-1))});
  }catch{return reply({error:"Unable to load private review history."},503);}
}
export async function POST(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({error:"Use application/json."},415);
  let c;try{c=JSON.parse(await boundedText(request.body));if(!["results","regenerate"].includes(c.action)||c.action==="regenerate"&&(c.season!==2026||!Number.isInteger(c.week)||c.week<1||c.week>18||c.decision_id!==undefined&&typeof c.decision_id!=="string"))throw Error();}catch{return reply({error:"Invalid review request or body exceeds 1 MB."},400);}
  try{if(c.action==="results")await saveWeeklyResults(analysisStore,c.results);else await regenerateReview(analysisStore,c.season,c.week,c.decision_id);return reply({saved:true});}
  catch{return reply({error:"Review was not saved. Check final scores, dates, matching player IDs and sources. Earlier decisions and review versions remain unchanged."},400);}
}
