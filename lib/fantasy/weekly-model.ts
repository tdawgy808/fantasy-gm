import type { Snapshot } from "./snapshot.ts";
import { checkPrivateFields } from "./snapshot.ts";
import { sourceUrl } from "./inputs.ts";
import { parseResearch, type Research } from "./research.ts";
import type { AnalysisResult } from "./engine.ts";
import { canPlay, type Evaluation } from "./players.ts";
import { legalCandidates, rosterSlots } from "./optimizer.ts";
import type { DecisionRecord, FinalWeekResults, PlayerReview, Quality, ResultRecord, WeeklyReview } from "./weekly-types.ts";

export const REVIEW_VERSION="1.0.0";
const iso=(v:unknown):v is string=>typeof v==="string"&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const integer=(v:unknown)=>finite(v)&&Number.isInteger(v);
const text=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=2000;
export function parseFinalResults(value:unknown,now=Date.now()):FinalWeekResults{
  checkPrivateFields(value);const r=structuredClone(value) as FinalWeekResults;
  const fail=():never=>{throw Error("Invalid finalized weekly results. Check identities, dates, lineup, points, standings and sources.");};
  if(!r||r.schema_version!==1||r.league_id!==121612||r.team_id!==5||r.season!==2026||!integer(r.week)||r.week<1||r.week>18||!["final","pending"].includes(r.status)||typeof r.all_games_complete!=="boolean"||!iso(r.collected_at)||Date.parse(r.collected_at)>now+300000||r.finalized_at!==null&&(!iso(r.finalized_at)||Date.parse(r.finalized_at)>Date.parse(r.collected_at))||r.status==="final"&&(!r.all_games_complete||!r.finalized_at)||!Array.isArray(r.sources)||!r.sources.length||r.sources.some(url=>!sourceUrl(url)||new URL(url).hostname!=="football.fantasysports.yahoo.com"||!/^\/f1\/121612(?:\/|$)/.test(new URL(url).pathname))||!Array.isArray(r.players)||r.players.length>800||new Set(r.players.map(p=>p.id)).size!==r.players.length||r.players.some(p=>!text(p.id)||!text(p.name)||p.points!==null&&!finite(p.points)||p.participation!==undefined&&!["played","inactive","unknown"].includes(p.participation)||p.stats!==undefined&&(typeof p.stats!=="object"||p.stats===null||Array.isArray(p.stats)||Object.values(p.stats).some(n=>!finite(n))))||!r.score||![r.score.owner,r.score.opponent].every(finite)||!integer(r.score.opponent_id)||r.score.opponent_id<1||r.score.opponent_id>10||r.score.opponent_id===r.team_id||!text(r.score.opponent_name)||!Array.isArray(r.actual_lineup)||r.actual_lineup.length>12||new Set(r.actual_lineup.map(p=>p.player_id)).size!==r.actual_lineup.length||r.actual_lineup.some(p=>!text(p.slot)||!r.players.some(o=>o.id===p.player_id))||!r.standings||!iso(r.standings.captured_at)||Date.parse(r.standings.captured_at)>Date.parse(r.collected_at)||!Array.isArray(r.standings.teams)||r.standings.teams.length>10||new Set(r.standings.teams.map(t=>t.team_id)).size!==r.standings.teams.length||r.standings.teams.some(t=>!integer(t.team_id)||t.team_id<1||t.team_id>10||!integer(t.rank)||t.rank<1||t.rank>10||!/^\d+-\d+-\d+$/.test(t.record)||t.points_for!==undefined&&!finite(t.points_for))||r.standings.qualifiers!==null&&(!integer(r.standings.qualifiers)||r.standings.qualifiers<1||r.standings.qualifiers>10)||!Array.isArray(r.notes)||r.notes.some(n=>!text(n)))fail();
  if(r.transactions!==undefined&&(!Array.isArray(r.transactions)||r.transactions.length>500||r.transactions.some(t=>!text(t.player_id)||!integer(t.team_id)||t.team_id<1||t.team_id>10||t.bid!==null&&(!finite(t.bid)||t.bid<0)||t.at!==null&&(!iso(t.at)||Date.parse(t.at)>Date.parse(r.collected_at)))))fail();
  if(r.postgame_research){r.postgame_research=parseResearch(JSON.stringify(r.postgame_research));if(Date.parse(r.postgame_research.collected_at)>Date.parse(r.collected_at))fail();}
  if(r.status==="final"&&Date.parse(r.standings.captured_at)<Date.parse(r.finalized_at!))fail();
  const actual=r.actual_lineup.map(p=>r.players.find(o=>o.id===p.player_id)?.points);
  if(r.status==="final"&&(!r.actual_lineup.length||actual.some(n=>n===null||n===undefined)||Math.abs(actual.reduce<number>((a,b)=>a+(b??0),0)-r.score.owner)>.05))fail();
  return structuredClone(r);
}

export function decisionData(snapshot:Snapshot,research:Research|null,analysis:AnalysisResult,now:number):Omit<DecisionRecord,"id">{
  const at=new Date(now).toISOString(),warnings:string[]=[];
  if(Date.parse(snapshot.captured_at)>now)warnings.push("Yahoo capture is later than the decision timestamp.");
  if(research?.findings.some(f=>Date.parse(f.retrieved_at)>now||f.published_at&&Date.parse(f.published_at)>now))warnings.push("Research includes a publication or retrieval later than this decision.");
  const timing=snapshot.review_context;
  const owner=analysis.players.filter(p=>p.slot!==undefined);
  const pregame=!!timing&&now<Date.parse(timing.first_kickoff_at)&&!owner.some(p=>p.locked);
  const inWeek=owner.some(p=>p.locked)||!!timing&&now>=Date.parse(timing.first_kickoff_at);
  if(!timing)warnings.push("Verified kickoff metadata missing; pregame timing is not established.");
  return structuredClone({kind:"decision",season:snapshot.league.season,week:snapshot.week,recorded_at:at,engine_version:analysis.engine_version,source_hash:analysis.source_hash,scope:pregame?"pregame":inWeek?"in_week":"unverified",integrity_warnings:warnings,snapshot,research,analysis});
}
const started=(p:Evaluation)=>p.slot!==undefined&&!["BN","IR"].includes(p.slot);
function timed(d:DecisionRecord,p:Evaluation){
  if(p.locked||d.integrity_warnings.some(w=>!w.startsWith("Verified kickoff")))return false;
  const kickoff=d.snapshot.review_context?.player_kickoffs?.[p.id]??(d.scope==="pregame"?d.snapshot.review_context?.first_kickoff_at:null);
  return !!kickoff&&Date.parse(d.recorded_at)<Date.parse(kickoff);
}
function legal(assignments:{slot:string;id:string}[],owner:Evaluation[],slots:string[]){
  if(assignments.length!==slots.length||new Set(assignments.map(a=>a.id)).size!==assignments.length)return false;
  const remaining=[...slots];for(const a of assignments){const i=remaining.indexOf(a.slot),p=owner.find(p=>p.id===a.id);if(i<0||!p||p.slot==="IR"||p.unavailable&&!p.locked||!canPlay(p,a.slot)||p.locked&&p.slot!==a.slot)return false;remaining.splice(i,1);}
  return owner.filter(p=>p.locked&&started(p)).every(p=>assignments.some(a=>a.id===p.id&&a.slot===p.slot))&&assignments.every(a=>!owner.find(p=>p.id===a.id)?.locked||started(owner.find(p=>p.id===a.id)!));
}
const fmt=(n:number|null)=>n===null?"unavailable":n.toFixed(2);
export function buildWeeklyReview(d:DecisionRecord|null,result:ResultRecord,now:number,primary=true):Omit<WeeklyReview,"id">{
  const r=result.results,final=r.status==="final"&&r.all_games_complete&&!!r.finalized_at;
  const missing=[...r.notes];if(!final)missing.push("Finalized Yahoo results have not been imported; review pending.");
  if(!d)missing.push("No archived decision exists. Pregame predictions cannot be reconstructed from current or postgame data.");
  if(d&&d.scope!=="pregame")missing.push("No verified full-week pregame record selected. Only individually timed, still-unlocked forecasts can be evaluated.");
  if(d)missing.push(...d.integrity_warnings);
  const owner=d?.analysis.players.filter(p=>p.slot!==undefined).map(p=>({...p,locked:p.locked||!!d.snapshot.review_context?.player_kickoffs?.[p.id]&&Date.parse(d.snapshot.review_context.player_kickoffs[p.id])<=Date.parse(d.recorded_at)}))??[],slots=d?rosterSlots(d.snapshot):[],actualIds=new Set(r.actual_lineup.map(a=>a.player_id));
  const rec=d?.analysis.lineup.assignments.map(a=>({slot:a.slot,id:a.player.id}))??[],original=owner.filter(started).map(p=>({slot:p.slot!,id:p.id}));
  const score=(ids:string[])=>!final||!ids.length||ids.some(id=>r.players.find(p=>p.id===id)?.points==null)?null:ids.reduce((sum,id)=>sum+r.players.find(p=>p.id===id)!.points!,0);
  const originalPoints=score(original.map(p=>p.id));const recommendedLegal=!!d&&legal(rec,owner,slots),originalLegal=!!d&&legal(original,owner,slots);
  const recommendedPoints=recommendedLegal?score(rec.map(p=>p.id)):null;
  const modeled= d?legalCandidates(owner,slots,d.analysis.settings.lineup):[];
  const objective=(assignments:{slot:string;id:string}[])=>assignments.reduce((s,a)=>{const p=owner.find(p=>p.id===a.id)!;return s+(p.locked?p.actual??0:d?.analysis.settings.lineup==="Safe"?p.floor??p.mean??0:d?.analysis.settings.lineup==="Aggressive"?p.ceiling??p.mean??0:p.mean??0);},0);
  const supportedChoice=recommendedLegal&&(d?.analysis.lineup.simulation_trials?modeled.some(c=>c.assignments.map(a=>a.player.id).sort().join('|')===rec.map(a=>a.id).sort().join('|')):modeled.every(c=>objective(rec)>=objective(c.assignments.map(a=>({slot:a.slot,id:a.player.id})))-1e-8));
  const timingComplete=!!d&&owner.filter(p=>p.slot!=="IR"&&!p.unavailable).every(p=>p.locked||timed(d,p));
  const missingBench=owner.filter(p=>p.slot!=="IR"&&!p.unavailable).some(p=>r.players.find(o=>o.id===p.id)?.points==null);
  const hindsightPlayers=owner.map(p=>({...p,mean:r.players.find(o=>o.id===p.id)?.points??null,floor:null,ceiling:null,actual:p.locked?r.players.find(o=>o.id===p.id)?.points??undefined:p.actual}));
  const best=final&&timingComplete&&!missingBench?legalCandidates(hindsightPlayers,slots,"Matchup-Aware",1)[0]:undefined;
  const bestPoints=best?score(best.assignments.map(a=>a.player.id)):null;
  if(d&&!recommendedLegal)missing.push("Archived recommendation violates recorded slot, ownership, availability or lock constraints; potential model error.");
  if(d&&!timingComplete)missing.push("Some player kickoff times are unknown; best achievable lineup and regret are not asserted.");
  if(missingBench)missing.push("Missing eligible bench outcomes; no complete hindsight optimum is asserted.");
  if(d&&r.actual_lineup.some(a=>!owner.some(p=>p.id===a.player_id)))missing.push("Final starters include players outside the decision-time roster; recommendation gains are counterfactual, not causally attributable to advice.");
  const players:PlayerReview[]=owner.map(p=>{
    const points=r.players.find(o=>o.id===p.id)?.points??null,eligible=!!d&&timed(d,p)&&!p.unavailable&&p.slot!=="IR"&&p.mean!==null;
    const chosen=rec.some(a=>a.id===p.id);let assessment:Quality="Insufficient Evidence",reason="Missing verified pre-kickoff timing, forecast or final outcome; no decision-quality verdict.";
    if(d&&chosen&&!recommendedLegal){assessment="Potential Model Error";reason="The selected lineup violates constraints that were present in the archived inputs.";}
    else if(eligible&&final&&points!==null){
      if(p.conflicts.length){assessment="Questionable Decision";reason="Conflicting evidence was already recorded before kickoff; review how the decision handled that uncertainty.";}
      else {const justified=chosen&&supportedChoice;
        if(justified){assessment=points>=p.mean!?"Good Decision / Good Outcome":"Good Decision / Bad Outcome";reason="Supported by the recorded strategy and eligible projected alternatives. Outcome relative to forecast is descriptive; underperformance alone is not a model failure.";}
        else reason="Player forecast can be measured, but this record alone does not establish the quality of the particular roster decision.";
      }
    }
    return {id:p.id,name:p.name,position:p.position,original_slot:p.slot!,recommended:chosen,actual_starter:actualIds.has(p.id),projection:p.mean,points:final?points:null,error:eligible&&final&&points!==null?points-p.mean!:null,forecast_eligible:eligible,assessment,reason,pre_kickoff_evidence:p.evidence};
  });
  const beforeRank=d?.snapshot.team.rank??null,afterRank=final?r.standings.teams.find(t=>t.team_id===r.team_id)?.rank??null:null;
  const before=owner.filter(started);const predicted=before.length&&before.every(p=>d&&timed(d,p)&&p.mean!==null)?before.reduce((s,p)=>s+p.mean!,0):null;
  const baselineOutcome=score(original.map(a=>a.id));
  const gains=originalPoints!==null&&recommendedPoints!==null?recommendedPoints-originalPoints:null;
  const comparableActual=originalLegal&&originalPoints!==null;
  const bench=score(owner.filter(p=>p.slot==="BN").map(p=>p.id));
  const probability=d?.scope==="pregame"&&d.integrity_warnings.length===0&&d.analysis.lineup.current_probability!==null?d.analysis.lineup.current_probability:null;
  const probabilityComparable=!!d&&d.snapshot.analysis_inputs?.opponent_team_id===r.score.opponent_id&&original.map(a=>`${a.slot}:${a.id}`).sort().join('|')===r.actual_lineup.map(a=>`${a.slot}:${a.player_id}`).sort().join('|');
  const waivers=(d?.analysis.waivers??[]).map(w=>{
    const transaction=r.transactions?.find(t=>t.player_id===w.id&&t.team_id===r.team_id&&t.at&&Date.parse(t.at)>=Date.parse(d!.recorded_at));
    const points=final?r.players.find(p=>p.id===w.id)?.points??null:null,played=actualIds.has(w.id);
    return {id:w.id,name:w.player,points,acquired:transaction?true:r.transactions?false:null,started:played,bid:transaction?.bid??null,points_per_dollar:transaction?.bid&&played&&points!==null?points/transaction.bid:null,note:transaction?"Observed acquisition; points per dollar describes production, not marginal return or bid optimality.":"Candidate hindsight only. Availability, claim success and a legal replacement are not established; no actionable missed opportunity is assumed."};
  });
  const scouting_outcomes=final&&d?Object.entries(d.analysis.scouting??{}).flatMap(([id,scout])=>{
    if(!scout.supported)return [];
    const player=d.analysis.players.find(p=>p.id===id);
    const result=r.players.find(p=>p.id===id);
    if(!player||!timed(d,player)||result?.points==null||result.participation==="inactive")return [];
    const waiver=d.analysis.all_waivers.find(w=>w.id===id);
    const suggestedDrop=d.analysis.players.find(p=>p.id===waiver?.drop_id);
    const drop=waiver?.recommendation==="ADD"&&suggestedDrop&&timed(d,suggestedDrop)?suggestedDrop:null;
    const share=result.stats?.snap_share;
    return [{id,name:player.name,actual:result.points,yahoo:scout.yahoo,independent:scout.projection,drop:drop?.name??null,
      drop_points:drop?r.players.find(p=>p.id===drop.id)?.points??null:null,
      workload_error:share!==undefined&&share>=0&&share<=1&&scout.workload_reference!==null?share-scout.workload_reference:null,
      recommendation:waiver?.recommendation??null}];
  }):[];
  const positives=players.filter(p=>p.actual_starter&&p.points!==null).sort((a,b)=>(b.error??-Infinity)-(a.error??-Infinity));
  const bestPositive=positives.filter(p=>p.error!==null&&p.error>0)[0],worst=positives.filter(p=>p.error!==null&&p.error<0).sort((a,b)=>a.error!-b.error!)[0];
  const highest=players.filter(p=>p.actual_starter&&p.points!==null).sort((a,b)=>b.points!-a.points!)[0];
  const outcome=r.score.owner>r.score.opponent?"Win":r.score.owner<r.score.opponent?"Loss":"Tie";
  const right=gains!==null&&gains>0?`Recommended swaps would have added ${fmt(gains)} points versus the starting lineup recorded at the decision.`:bestPositive?`${bestPositive.name} beat the archived forecast by ${fmt(bestPositive.error)} points.`:d?"No verified advantage from the recorded recommendations is established.":"No archived pregame record to grade.";
  const wrong=!recommendedLegal&&d?"Recorded lineup constraints need investigation; flagged as a potential model error.":gains!==null&&gains<0?`Recommended swaps would have cost ${fmt(-gains)} points; inspect the original reasoning before attributing fault.`:worst?`${worst.name} finished ${fmt(-worst.error!)} below forecast. This alone is not evidence of an algorithm failure.`:"No supported controllable error established from the available record.";
  const injuryAssessments:WeeklyReview["injury_assessments"]=[];
  for(const p of owner){const findings=d?.research?.findings.filter(f=>p.evidence.includes(f.id)&&["injury","availability","workload","usage"].includes(f.category))??[];if(!findings.length)continue;
    const actual=r.players.find(o=>o.id===p.id),verified=!!d&&timed(d,p),predictInactive=verified&&findings.some(f=>f.effect?.unavailable===true&&f.effect.week===d!.week&&f.effect.season===d!.season&&!!f.published_at&&Date.parse(f.published_at)<=Date.parse(d!.recorded_at)&&Date.parse(f.retrieved_at)<=Date.parse(d!.recorded_at));
    const expectedShare=p.projected_stats?.snap_share,observedShare=actual?.stats?.snap_share;
    const workloadError=final&&verified&&expectedShare!==undefined&&observedShare!==undefined&&expectedShare>=0&&expectedShare<=1&&observedShare>=0&&observedShare<=1?observedShare-expectedShare:null;
    const accuracy=final&&predictInactive&&actual?.participation&&actual.participation!=="unknown"?(actual.participation==="inactive"?"supported":"contradicted"):"insufficient";
    injuryAssessments.push({id:p.id,name:p.name,warning:"Archived injury/workload evidence is preserved with its original claim and timestamps.",accuracy,workload_error:workloadError,outcome:accuracy==="insufficient"?"A comparable pregame participation prediction or observed outcome is missing; fantasy points alone cannot establish accuracy.":accuracy==="supported"?"The explicit pregame unavailable prediction matches imported inactive participation.":"The explicit pregame unavailable prediction differs from imported played participation; inspect the original uncertainty before attributing model fault."});
  }
  if(r.standings.teams.length!==10)missing.push("Final league standings coverage is incomplete.");
  return {kind:"review",season:r.season,week:r.week,generated_at:new Date(now).toISOString(),review_version:REVIEW_VERSION,engine_version:d?.engine_version??null,decision_id:d?.id??null,result_id:result.id,primary_decision:primary,status:!final?"pending":d?.scope==="pregame"&&d.integrity_warnings.length===0&&timingComplete&&recommendedLegal&&!missingBench&&afterRank!==null&&r.standings.teams.length===10&&bestPoints!==null&&originalPoints!==null?"ready":"limited",
    sections:[{title:"What happened",text:final?`${outcome}: ${fmt(r.score.owner)}–${fmt(r.score.opponent)} against ${r.score.opponent_name}.${highest?` ${highest.name} led recorded starters with ${fmt(highest.points)} points.`:""}`:"Pending finalized Yahoo scores and player outcomes."},{title:"What Fantasy GM got right",text:final?right:"Pending final outcomes."},{title:"What Fantasy GM got wrong",text:final?wrong:"No verdict before final results."},{title:"What was unpredictable",text:r.postgame_research?.findings.length?"Postgame reports are available below to explain outcomes; they were not used to grade what was knowable before kickoff.":"Unexplained forecast residuals are not automatically random variance or model errors; postgame explanation evidence is insufficient."},{title:"What to improve next week",text:!d||!timingComplete?"Capture a verified, timed pregame analysis and complete bench results before drawing model conclusions.":"Review repeated errors across several weeks and backtest any proposed change; production weights remain unchanged."}],
    players,metrics:{final_actual_points:final?r.score.owner:null,predicted_original_points:predicted,original_lineup_points:originalPoints,recommended_points:recommendedPoints,recommendation_gain:gains,best_legal_points:bestPoints,lineup_regret:bestPoints!==null&&comparableActual?Math.max(0,bestPoints-originalPoints!):null,bench_points:bench,recoverable_bench_points:bestPoints!==null&&comparableActual?Math.max(0,bestPoints-originalPoints!):null,team_projection_error:predicted!==null&&baselineOutcome!==null?baselineOutcome-predicted:null,probability:probabilityComparable?probability:null,probability_outcome:final&&probabilityComparable?(r.score.owner===r.score.opponent ? 0.5 : r.score.owner>r.score.opponent ? 1 : 0):null,probability_origin:probability!==null&&probabilityComparable?"engine":null},
    final_lineup:r.actual_lineup.map(a=>({slot:a.slot,id:a.player_id,name:r.players.find(p=>p.id===a.player_id)!.name,points:final?r.players.find(p=>p.id===a.player_id)!.points:null})),best_lineup:best?.assignments.map(a=>({slot:a.slot,id:a.player.id,name:a.player.name,points:r.players.find(p=>p.id===a.player.id)!.points!}))??[],waivers,scouting_outcomes,injury_assessments:injuryAssessments,
    standings:{before_rank:beforeRank,after_rank:afterRank,qualifiers:r.standings.qualifiers,note:afterRank===null?"Final owner standing not imported.":`Final rank ${afterRank}${beforeRank!==null?` versus ${beforeRank} at the decision`:""}${r.standings.qualifiers!==null?`; ${r.standings.qualifiers} playoff places`:""}. A rank change does not establish qualification probability.`},limitations:[...new Set(missing),"Best legal lineup uses only decision-time roster members, eligibility, unavailable/IR and lock restrictions; it does not include hypothetical waiver additions.","All gains and regret are hindsight comparisons, not guaranteed attainable wins or causal effects of following advice.","Review versions preserve stat corrections; no production model weights are changed."],result_sources:r.sources,postgame_research:r.postgame_research??null};
}
