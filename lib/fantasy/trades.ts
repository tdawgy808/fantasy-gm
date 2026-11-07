import type { Snapshot } from "./snapshot.ts";
import type { Evaluation } from "./players.ts";
import type { Settings } from "./strategies.ts";
import type { TeamInput } from "./inputs.ts";
import { legalCandidates, rosterSlots } from "./optimizer.ts";
export function tradeScout(snapshot:Snapshot,players:Evaluation[],settings:Settings,now:number) {
  const inputs=snapshot.analysis_inputs;const deadline=inputs?.trade_deadline_at;
  // A date without a timezone/cutoff is ambiguous; do not offer trades on that day.
  const dateOnly=typeof snapshot.rules?.trade_deadline==="string"?snapshot.rules.trade_deadline:undefined;
  if(deadline&&now>=Date.parse(deadline)||!deadline&&dateOnly&&new Intl.DateTimeFormat("en-CA",{timeZone:snapshot.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(now)>=dateOnly)return {opportunities:[],limitation:"Trade deadline reached or cutoff time is ambiguous today; no trade recommendations."};
  if(!deadline&&!dateOnly)return {opportunities:[],limitation:"Trade deadline unavailable; import it before generating offers."};
  const teams=inputs?.teams??[];const me=teams.find(t=>t.id===snapshot.team.id);const slots=rosterSlots(snapshot);
  if(!me||teams.length<2)return {opportunities:[],limitation:"Other league rosters and explicit player identities are required for mutually beneficial trade analysis."};
  const collection=snapshot.collection_coverage as {complete_team_ids?:number[]}|undefined;
  if(collection?.complete_team_ids&&collection.complete_team_ids.length!==10)return {opportunities:[],limitation:"Complete rosters for all ten teams are required before suggesting trades."};
  if(typeof snapshot.rules?.trade_reject_days==="number"&&snapshot.rules.trade_reject_days>0&&!players.some(p=>p.ros_projection!==undefined))return {opportunities:[],limitation:`All imported rosters can be inspected, but the ${snapshot.rules.trade_reject_days}-day league review period can outlast the current week. No actionable trade offers: rest-of-season or future-week values are required to assess mutual benefit after review. Current-week projections are insufficient.`};
  const playoffTeams=inputs?.playoff?.teams;
  const remaining=Math.max(0,(inputs?.playoff?.start_week??15)-snapshot.week);
  // Rank inside the cut is not a clinch. Require a strict wins lead over enough rivals' maximum wins.
  const secure=playoffTeams!==undefined&&me.wins!==undefined&&me.ties!==undefined&&teams.filter(t=>t.id!==me.id&&(t.wins===undefined||t.ties===undefined||t.wins+.5*t.ties+remaining>=me.wins!+.5*me.ties!)).length<playoffTeams;
  const urgent=!secure;
  const strategy=settings.trade==="Standings-Aware"?(urgent?"Win Now":"Playoff Focused"):settings.trade;
  const roster=(t:TeamInput)=>t.roster.flatMap(r=>{const p=players.find(p=>p.id===r.player_id);return p?[{...p,slot:r.slot}]:[];});
  const value=(ps:Evaluation[],mode:string)=>{
    const valued=ps.map(p=>({...p,mean:mode==="Playoff Focused"?p.playoff_projection??null:p.ros_projection??p.mean}));
    const best=legalCandidates(valued,slots,"Matchup-Aware",1)[0];return best?best.assignments.reduce((s,a)=>s+(a.player.locked?a.player.actual??a.player.mean??0:a.player.mean??0),0):null;
  };
  const mine=roster(me);const before=value(mine,strategy);if(before===null)return {opportunities:[],limitation:"A complete legal baseline or strategy-relevant player values are unavailable."};
  const offers=[];
  for(const team of teams.filter(t=>t.id!==me.id)){
    const other=roster(team);const beforeOther=value(other,"Win Now");if(beforeOther===null)continue;
    for(const give of mine.filter(p=>!p.locked&&!p.unavailable&&p.slot!=="IR"))for(const receive of other.filter(p=>!p.locked&&!p.unavailable&&p.slot!=="IR")){
      // Weekly kicker/defense streaming value cannot justify trading a skill player without season evidence.
      if((["K","DEF"].includes(give.position)!==["K","DEF"].includes(receive.position))&&(give.ros_projection===undefined||receive.ros_projection===undefined))continue;
      const after=value([...mine.filter(p=>p.id!==give.id),{...receive,slot:"BN"}],strategy);
      const afterOther=value([...other.filter(p=>p.id!==receive.id),{...give,slot:"BN"}],"Win Now");
      if(after===null||afterOther===null||after-before<.5||afterOther-beforeOther<.5)continue;
      offers.push({partner:team.name,send:give.name,receive:receive.name,my_gain:after-before,their_gain:afterOther-beforeOther,reason:`${strategy}: estimated legal starting-lineup improvement for both teams.`,opening_offer:`${give.name} for ${receive.name}`,confidence:"low",risks:[...give.factors,...receive.factors,...give.conflicts,...receive.conflicts,...(give.ros_projection===undefined||receive.ros_projection===undefined?["ROS value unavailable: weekly projection screen only, not a season-value assessment."]:[]),"One-for-one screen only; manager preferences and acceptance likelihood unknown.","Player values are imported estimates; bench depth and injury coverage require manual review.","League review delay, next-week game locks and schedules may change value."],evidence:[...give.evidence,...receive.evidence]});
    }
  }
  return {opportunities:offers.sort((a,b)=>b.my_gain+b.their_gain-a.my_gain-a.their_gain).slice(0,5),limitation:"Shows up to five supported matches; fewer may pass. Bounded one-for-one screen. No offer is sent. No acceptance odds are claimed; lack of matches is a valid result."};
}
