import type { AnalysisResult } from "./engine.ts";
import type { Snapshot } from "./snapshot.ts";
import type { Research, Finding } from "./research.ts";
import type { Evaluation } from "./players.ts";

export type BriefingSection="lineup"|"intelligence"|"waivers"|"faab"|"trades"|"upcoming"|"playoffs"|"changes"|"coverage";
export type SummaryAction={id:string;label:"START"|"BENCH"|"MONITOR"|"ADD"|"HOLD"|"CONSIDER TRADE";title:string;body:string;section:BriefingSection;player_ids:string[];evidence_ids:string[];priority:number};
export type SummaryChange={id:string;kind:"roster"|"injury"|"projection"|"lineup"|"opportunity"|"research"|"strategy"|"week";text:string;section:BriefingSection;player_id?:string};
export type SummaryBaseline={version:1;analysis_at:string;week:number|null;owner:{id:string;name:string;slot:string;status:string;mean:number|null}[];starters:string[];waiver:{id:string;name:string;gain:number}|null;settings:AnalysisResult["settings"];news:{key:string;player_id:string}[]|null};

const started=(p:Evaluation)=>p.slot!==undefined&&!["BN","IR"].includes(p.slot);
const points=(n:number)=>n.toFixed(1);
export function normalizedStatus(p:Pick<Evaluation,"status"|"bye">,week:number|null):string{
  if(week!==null&&p.bye===week)return "Bye";
  const s=(p.status??"").trim();
  if(/^q$|questionable/i.test(s))return "Questionable";
  if(/^ir$|injured reserve/i.test(s))return "IR";
  if(/^na$|inactive|not active/i.test(s))return "Inactive";
  if(/^o$|^out$/i.test(s))return "Out";
  if(/^d$|doubtful/i.test(s))return "Doubtful";
  return s||"No designation";
}
export function currentFinding(f:Finding,now:number):boolean{
  const published=f.published_at??(f.published_date?`${f.published_date}T00:00:00Z`:null);
  if(!published||f.quality==="low"||f.confirmation==="speculative")return false;
  const age=now-Date.parse(published),retrievalAge=now-Date.parse(f.retrieved_at);
  return Number.isFinite(age)&&age>=-300000&&age<=48*3600000&&retrievalAge>=-300000&&retrievalAge<=24*3600000;
}
export const findingsFor=(research:Research|null,id:string,name:string)=>research?.findings.filter(f=>f.player_id?f.player_id===id:f.player.toLowerCase()===name.toLowerCase())??[];
const newsKey=(f:Finding)=>`${f.player_id??f.player.toLowerCase()}|${f.category}|${f.source_url}|${f.claim.toLowerCase().replace(/\s+/g," ").trim()}`;
export function captureSummaryBaseline(result:AnalysisResult,research:Research|null,week:number|null):SummaryBaseline{
  const owner=result.players.filter(p=>p.slot!==undefined);
  const top=result.waivers.find(w=>w.immediate_gain>=1);
  return {version:1,analysis_at:result.calculated_at,week,owner:owner.map(p=>({id:p.id,name:p.name,slot:p.slot!,status:normalizedStatus(p,week),mean:p.mean})),starters:result.lineup.assignments.map(a=>a.player.id),waiver:top?{id:top.id,name:top.player,gain:top.immediate_gain}:null,settings:result.settings,
    news:research?owner.flatMap(p=>findingsFor(research,p.id,p.name).filter(f=>["injury","availability","workload","depth_chart"].includes(f.category)).map(f=>({key:newsKey(f),player_id:p.id}))):null};
}
export function compareSummaryBaselines(previous:SummaryBaseline|null,next:SummaryBaseline,research:Research|null,now:number):SummaryChange[]{
  if(!previous)return [];
  const changes:SummaryChange[]=[];
  const sameWeek=previous.week!==null&&previous.week===next.week;
  if(previous.week!==null&&next.week!==previous.week)changes.push({id:"week",kind:"week",text:`Week ${next.week} analysis is now available.`,section:"lineup"});
  for(const p of next.owner){
    const old=previous.owner.find(o=>o.id===p.id);
    if(!old){changes.push({id:`added:${p.id}`,kind:"roster",text:`${p.name} joined your roster.`,section:"intelligence",player_id:p.id});continue;}
    if(p.status!==old.status)changes.push({id:`status:${p.id}`,kind:"injury",text:`${p.name}: ${old.status} → ${p.status}.`,section:"intelligence",player_id:p.id});
    if(p.slot!==old.slot)changes.push({id:`slot:${p.id}`,kind:"roster",text:`${p.name} moved from ${old.slot} to ${p.slot}.`,section:"lineup",player_id:p.id});
    if(sameWeek&&p.mean!==null&&old.mean!==null&&Math.abs(p.mean-old.mean)>=1)changes.push({id:`projection:${p.id}`,kind:"projection",text:`${p.name}'s weekly projection moved ${points(old.mean)} → ${points(p.mean)}.`,section:"lineup",player_id:p.id});
  }
  for(const p of previous.owner)if(!next.owner.some(n=>n.id===p.id))changes.push({id:`removed:${p.id}`,kind:"roster",text:`${p.name} left your roster.`,section:"changes",player_id:p.id});
  for(const id of next.starters)if(!previous.starters.includes(id)){const p=next.owner.find(p=>p.id===id);if(p)changes.push({id:`starter:${id}`,kind:"lineup",text:`${p.name} is now a recommended starter.`,section:"lineup",player_id:id});}
  if(next.waiver&&next.waiver.id!==previous.waiver?.id)changes.push({id:`waiver:${next.waiver.id}`,kind:"opportunity",text:`${next.waiver.name} is now the leading immediate waiver upgrade.`,section:"waivers",player_id:next.waiver.id});
  for(const key of ["lineup","waiver","trade"] as const)if(next.settings[key]!==previous.settings[key])changes.push({id:`strategy:${key}`,kind:"strategy",text:`${key=== "lineup"?"Lineup":key==="waiver"?"Waiver":"Trade"} strategy changed to ${next.settings[key]}.`,section:key==="waiver"?"waivers":key==="trade"?"trades":"lineup"});
  // Retrieval times and importer-generated finding IDs do not make an old report new.
  if(previous.news!==null&&next.news!==null)for(const p of next.owner){
    const oldKeys=new Set(previous.news.filter(f=>f.player_id===p.id).map(f=>f.key));
    const fresh=findingsFor(research,p.id,p.name).some(f=>["injury","availability","workload","depth_chart"].includes(f.category)&&currentFinding(f,now)&&!oldKeys.has(newsKey(f)));
    if(fresh&&!changes.some(c=>c.kind==="injury"&&c.player_id===p.id))changes.push({id:`research:${p.id}`,kind:"research",text:`Updated availability or workload evidence for ${p.name}.`,section:"intelligence",player_id:p.id});
  }
  return changes;
}

export function playerConclusion(p:Evaluation,research:Research|null,now:number):string{
  if(p.locked)return "Game started or complete; keep this assignment locked.";
  if(p.conflicts.length)return "Reports conflict. Review the evidence before deciding.";
  if(p.unavailable)return "Not eligible for an unlocked starting slot under the imported availability information.";
  if(/\bQ\b|questionable/i.test(p.status??"")){
    const expected=findingsFor(research,p.id,p.name).some(f=>currentFinding(f,now)&&/expected to play|in line to play|slated to play/i.test(f.claim)&&!/not expected|unlikely/i.test(f.claim));
    return expected?"Questionable, but reportedly expected to play. Confirm active status before kickoff.":"Questionable. Confirm active status before kickoff and prepare an eligible contingency.";
  }
  const workload=findingsFor(research,p.id,p.name).some(f=>currentFinding(f,now)&&f.category==="workload");
  return workload?"Workload needs review; see the supporting report before changing your plans.":"Use the saved projection and lineup comparison; no additional current alert is established.";
}
export function weeklyOutlook(snapshot:Snapshot){
  const matchup=snapshot.matchup,cut=snapshot.analysis_inputs?.playoff?.teams??(snapshot.rules?.playoffs as {teams?:number}|undefined)?.teams;
  const rank=snapshot.team.rank;
  const strategy=rank&&cut?(rank>cut?`Rank ${rank}, outside the ${cut}-team playoff cut. Prioritize near-term wins.`:`Rank ${rank}, inside the ${cut}-team playoff cut; qualification is not secured.`):"Playoff position is not established in the saved data.";
  return {at:snapshot.data_freshness?.matchup_at??snapshot.captured_at,opponent:matchup?.opponent??"Opponent unavailable",mine:matchup?.live_projection??null,theirs:matchup?.opponent_live_projection??null,
    conclusion:matchup?Math.abs(matchup.live_projection-matchup.opponent_live_projection)<.05?"The imported Yahoo projections are level.":`Projected ${points(Math.abs(matchup.live_projection-matchup.opponent_live_projection))} points ${matchup.live_projection>matchup.opponent_live_projection?"ahead of":"behind"} ${matchup.opponent}.`:"No Yahoo matchup projection was imported.",strategy};
}
export function buildGmSummary(snapshot:Snapshot,result:AnalysisResult|null,research:Research|null,changes:SummaryChange[]|undefined,needsAnalysis:boolean,now:number){
  const stale=now-Date.parse(snapshot.captured_at)>86400000||!result||now-Date.parse(result.calculated_at)>86400000;
  const researchStale=!research||now-Date.parse(research.collected_at)>86400000;
  const actions:SummaryAction[]=[],alerts:{id:string;text:string;section:BriefingSection;player_id?:string}[]=[];
  const blocked=stale||needsAnalysis||!result;
  if(!blocked&&result){
    const owner=result.players.filter(p=>p.slot!==undefined);
    for(const p of owner.filter(p=>started(p)&&!p.locked&&(p.unavailable||/\bQ\b|questionable/i.test(p.status??"")))){
      const alternative=result.lineup.decisions?.comparisons.find(c=>c.starter_id===p.id)?.alternative;
      actions.push({id:`availability:${p.id}`,label:p.unavailable?"BENCH":"MONITOR",title:p.name,body:p.unavailable?"Unavailable for an unlocked start. Review the recommended replacement before kickoff.":`${playerConclusion(p,research,now).replace(/\.$/,"")}${alternative?`; keep ${alternative} ready as an eligible alternative.`:"."}`,section:p.unavailable?"lineup":"intelligence",player_ids:[p.id],evidence_ids:p.evidence,priority:p.unavailable?120:100});
    }
    for(const c of result.lineup.changes){const p=result.players.find(p=>p.name===c.player);if(!p||p.locked||p.unavailable)continue;
      actions.push({id:`start:${p.id}`,label:"START",title:`${p.name} at ${c.slot}`,body:`The saved optimizer recommends this starting change.${result.lineup.projection!==null&&result.lineup.current_projection!==null?` Full-lineup projection change: ${points(result.lineup.projection-result.lineup.current_projection)} points.`:""}`,section:"lineup",player_ids:[p.id],evidence_ids:p.evidence,priority:110});}
    const waiver=result.waivers.find(w=>w.immediate_gain>=1);
    if(waiver)actions.push({id:`add:${waiver.id}`,label:"ADD",title:`Consider ${waiver.player}`,body:`${points(waiver.immediate_gain)} projected points above ${waiver.replaces??"the eligible starter"}.${waiver.bid!==null?` Estimated bid $${waiver.bid}; confirm availability before acting.`:" Review availability and FAAB before acting."}`,section:"waivers",player_ids:[waiver.id],evidence_ids:waiver.evidence,priority:60+Math.min(20,waiver.immediate_gain)});
    const trade=result.trades.opportunities[0];
    if(trade){const ps=result.players.filter(p=>p.name===trade.send||p.name===trade.receive);actions.push({id:"trade",label:"CONSIDER TRADE",title:trade.opening_offer,body:`Review the modeled mutual benefit with ${trade.partner}; acceptance is unknown.`,section:"trades",player_ids:ps.map(p=>p.id),evidence_ids:trade.evidence,priority:50});}
    if(!actions.length)actions.push({id:"hold",label:"HOLD",title:result.lineup.assignments.length?"No action needed right now":"Review your starting slots",body:result.lineup.assignments.length?"No lineup changes or meaningful immediate waiver upgrade are recommended in the saved analysis.":"A complete legal lineup could not be calculated. Check missing positions and availability.",section:"lineup",player_ids:[],evidence_ids:[],priority:0});
  }
  const deadline=snapshot.analysis_inputs?.trade_deadline_at??(typeof snapshot.rules?.trade_deadline==="string"?snapshot.rules.trade_deadline:null);
  if(deadline){const until=Date.parse(deadline)-now;if(until>=0&&until<=7*86400000)alerts.push({id:"trade-deadline",text:`Trade deadline ${deadline.slice(0,10)}. Allow for the league review period.`,section:"trades"});}
  return {outlook:weeklyOutlook(snapshot),actions:actions.sort((a,b)=>b.priority-a.priority).slice(0,3),alerts,changes:changes?.slice(0,3)??[],comparison_available:changes!==undefined,stale,research_stale:researchStale,blocked,
    status:needsAnalysis?"Analysis needs refresh":stale?"Saved data needs a refresh":researchStale?"Research needs a refresh":"Saved analysis ready"};
}
