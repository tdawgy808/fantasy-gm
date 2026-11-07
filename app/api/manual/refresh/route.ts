import { connection,NextRequest,NextResponse } from "next/server";
import { AUTH_COOKIE,isOwner,sameOrigin } from "@/lib/auth/session";
import { analysisStore } from "@/lib/fantasy/analysis-store";
import { importRefresh,verifyRefresh } from "@/lib/fantasy/refresh";
import { boundedText } from "@/lib/fantasy/hosted";
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  try{const state=(await analysisStore.read())?.value;return reply({coverage:state?.coverage??null,attempts:state?.refresh_attempts??[]});}catch{return reply({error:"Unable to read private refresh history."},503);}
}
export async function POST(request:NextRequest){
  await connection();if(!isOwner(request.cookies.get(AUTH_COOKIE)?.value))return reply({error:"Sign in required."},401);
  if(!sameOrigin(request))return reply({error:"Invalid request origin."},403);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({error:"Use application/json."},415);
  try{const raw=await boundedText(request.body);let value;try{value=JSON.parse(raw);}catch{/* The import validator records malformed JSON as a failed attempt. */}
    if(value?.action==="verify"){if(typeof value.id!=="string")return reply({error:"Missing refresh identifier."},400);return reply({coverage:await verifyRefresh(analysisStore,value.id,Date.now(),!!process.env.VERCEL)});}
    const state=await importRefresh(analysisStore,raw);return reply({coverage:state.coverage});
  }catch{return reply({error:"Refresh did not finish. Read Data Coverage for the last saved bundle and validation attempts; previous valid data is retained."},400);}
}
