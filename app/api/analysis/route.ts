import { connection, NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isOwner, sameOrigin } from "@/lib/auth/session";
import { analysisStore } from "@/lib/fantasy/analysis-store";
import { initialState, needsAnalysis, runAnalysis, updateSettings, importResearch } from "@/lib/fantasy/analysis-service";
import { boundedText } from "@/lib/fantasy/hosted";
function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});}
export async function GET(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  try {const state=(await analysisStore.read())?.value??initialState();const yahoo=await analysisStore.yahoo();return reply({...state,needs_analysis:needsAnalysis(state,yahoo?.snapshot??null),latest_yahoo_at:yahoo?.snapshot.captured_at??null,live_news_configured:false});}
  catch{return reply({error:"Unable to load private analysis. Check storage configuration and try again."},503);}
}
export async function POST(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({error:"Use application/json."},415);
  let command;
  try{command=JSON.parse(await boundedText(request.body));if(!["refresh","settings","research"].includes(command.action))throw new Error();}
  catch{return reply({error:"Invalid analysis request or body exceeds 1 MB."},400);}
  try {
    const state=command.action==="refresh"?await runAnalysis(analysisStore):command.action==="settings"?await updateSettings(analysisStore,command.settings):await importResearch(analysisStore,JSON.stringify(command.research));
    const yahoo=await analysisStore.yahoo();return reply({...state,needs_analysis:needsAnalysis(state,yahoo?.snapshot??null),latest_yahoo_at:yahoo?.snapshot.captured_at??null,live_news_configured:false});
  } catch(error) {
    // Provider errors can contain identifiers/URLs. Never return raw storage/OAuth errors.
    const message=error instanceof Error?error.message:"";
    const safe=/^(Import and save|Import research with|Research snapshot is older|Choose a supported|Each finding needs|Research source is not|Invalid (research|modeled)|Yahoo data changed|Analysis inputs changed|Saved analysis exceeds)/.test(message);
    return reply({error:safe?message:"Analysis could not complete or save. Previous recommendations and success timestamp were retained."},safe?400:503);
  }
}
