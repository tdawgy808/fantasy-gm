import { expired, observedAt } from "./freshness.ts";
import type { Snapshot } from "./snapshot.ts";
import type { Evaluation } from "./players.ts";
import { canPlay } from "./players.ts";
import type { Settings } from "./strategies.ts";
import { rosterSlots } from "./optimizer.ts";
import type { ScoutingEvaluation } from "./scouting.ts";
export function waiverScout(snapshot:Snapshot,players:Evaluation[],settings:Settings,now=Date.now(),scouting:Record<string,ScoutingEvaluation>={}) {
  const owner=players.filter(p=>p.slot!==undefined);const owned=new Set(snapshot.analysis_inputs?.teams?.flatMap(t=>t.roster.map(r=>r.player_id))??owner.map(p=>p.id));
  const available=new Set(snapshot.analysis_inputs?.available_ids??(snapshot.available_players??[]).flatMap(r=>Array.isArray(r)?[players.find(p=>p.name===r[0])?.id]:[]));
  const slots=rosterSlots(snapshot);
  const playoffTeams=snapshot.analysis_inputs?.playoff?.teams??(snapshot.rules?.playoffs as {teams?:number}|undefined)?.teams;
  const urgent=typeof playoffTeams==="number"&&typeof snapshot.team.rank==="number"&&snapshot.team.rank>playoffTeams;
  const budget=snapshot.team.faab_remaining;
  const weeks=Math.max(1,18-snapshot.week);
  const used=new Map<string,number>();
  for(const p of owner)if(p.slot)used.set(p.slot,(used.get(p.slot)??0)+1);
  const open=slots.filter((slot,index)=>slots.slice(0,index+1).filter(s=>s===slot).length>(used.get(slot)??0));
  const capacity=Array.isArray(snapshot.rules?.roster_positions)?snapshot.rules.roster_positions.filter(slot=>slot!=="IR").length:null;
  const rosterSpace=capacity!==null&&owner.filter(p=>p.slot!=="IR").length<capacity;
  return players.filter(p=>available.has(p.id)&&!owned.has(p.id)&&!p.locked&&!p.unavailable&&(!snapshot.data_freshness||!expired(observedAt(snapshot,"availability",p.id),now))&&(p.mean!==null||scouting[p.id]?.supported)&&slots.some(s=>canPlay(p,s))).map(player=>{
    const scout=scouting[player.id];
    const p={...player,mean:scout?.projection??(scout ? scout.yahoo : player.mean)};
    const alternatives=owner.filter(o=>o.slot&&!["BN","IR"].includes(o.slot)&&!o.locked&&canPlay(p,o.slot));
    const replacement=[...alternatives].sort((a,b)=>(a.unavailable?0:a.mean??Infinity)-(b.unavailable?0:b.mean??Infinity))[0];
    const vacancy=open.find(slot=>canPlay(p,slot));
    const cover=vacancy?owner.filter(o=>o.slot==="BN"&&!o.unavailable&&!o.locked&&canPlay(o,vacancy)).reduce((best,o)=>Math.max(best,o.mean??0),0):0;
    const currentGain=p.mean===null||!replacement?0:Math.max(0,p.mean-(replacement.unavailable?0:replacement.mean??p.mean));
    const vacancyGain=vacancy&&p.mean!==null?Math.max(0,p.mean-cover):0;
    const immediate=Math.max(currentGain,vacancyGain);
    const trend=scout?.direction==="up"?Math.max(.25,p.opportunity_trend??0):scout?.direction==="down"?Math.min(0,p.opportunity_trend??0):p.opportunity_trend??0;
    const future=p.ros_projection!==undefined&&replacement?.ros_projection!==undefined?Math.max(0,p.ros_projection-replacement.ros_projection):0;
    const playoff=p.playoff_projection!==undefined&&replacement?.playoff_projection!==undefined?Math.max(0,p.playoff_projection-replacement.playoff_projection):0;
    const bench=owner.filter(o=>o.slot==="BN"&&!o.unavailable&&o.mean!==null&&o.eligible.some(slot=>canPlay(p,slot))).sort((a,b)=>(b.mean??0)-(a.mean??0))[0];
    const depthGain=bench&&p.mean!==null?Math.max(0,p.mean-bench.mean!):0;
    const need=owner.some(o=>o.slot&&!["BN","IR"].includes(o.slot)&&canPlay(p,o.slot)&&(o.unavailable||/questionable|\bQ\b/i.test(o.status??"")));
    const rankScore=settings.waiver==="Win Now"?immediate*2+(urgent?immediate:0)+depthGain*.15+(need?1:0):settings.waiver==="Upside"?immediate*.4+future+playoff*.4+Math.max(0,trend)*8+depthGain*.3+(need?1:0):immediate*(urgent?1.5:1)+future*.5+Math.max(0,trend)*3+depthGain*.25+playoff*.2+(need?1:0);
    const drops=owner.filter(o=>o.slot==="BN"&&!o.locked&&o.id!==p.id&&(o.bye!==snapshot.week||p.ros_projection!==undefined&&o.ros_projection!==undefined&&p.ros_projection>=o.ros_projection)&&(o.ros_projection===undefined||p.ros_projection!==undefined&&p.ros_projection>=o.ros_projection)&&!owner.some(starter=>starter.slot&&!["BN","IR"].includes(starter.slot)&&starter.bye===snapshot.week+1&&canPlay(o,starter.slot)&&p.bye===snapshot.week+1)&&(o.unavailable||o.mean!==null)&&(o.unavailable||o.eligible.every(slot=>canPlay(p,slot)||owner.some(other=>other.id!==o.id&&other.slot==="BN"&&!other.unavailable&&canPlay(other,slot))))&&(!["K","DEF"].includes(p.position)||["K","DEF"].includes(o.position)||o.unavailable||p.ros_projection!==undefined&&o.ros_projection!==undefined&&p.ros_projection>o.ros_projection)).sort((a,b)=>((a.ros_projection??a.mean??Infinity)+(a.playoff_projection??0)*.2)-((b.ros_projection??b.mean??Infinity)+(b.playoff_projection??0)*.2));
    const drop=rosterSpace?undefined:drops.find(o=>!owner.some(starter=>starter.slot&&!["BN","IR"].includes(starter.slot)&&starter.bye===snapshot.week+1&&canPlay(o,starter.slot)&&(p.bye===undefined||p.bye===snapshot.week+1)&&!owner.some(other=>other.id!==o.id&&other.slot==="BN"&&!other.unavailable&&other.bye!==undefined&&other.bye!==snapshot.week+1&&canPlay(other,starter.slot!))));
    const increment=snapshot.analysis_inputs?.waiver_increment??1,min=snapshot.analysis_inputs?.waiver_min_bid??0;
    const value=immediate+future*.4+depthGain*.2+Math.max(0,trend)*2;
    const rivals=(snapshot.analysis_inputs?.teams??[]).filter(t=>t.id!==snapshot.team.id&&t.faab!==undefined&&t.faab>0&&t.roster.some(r=>{
      const other=players.find(o=>o.id===r.player_id);return !["BN","IR"].includes(r.slot)&&canPlay(p,r.slot)&&other&&p.mean!>(other.mean??p.mean!);
    }));
    const observedBids=(snapshot.analysis_inputs?.transactions??[]).filter(t=>t.kind==="add"&&typeof t.bid==="number"&&t.bid>0).map(t=>t.bid!).sort((a,b)=>a-b);
    const historicalMedian=observedBids.length>=5?observedBids[Math.floor(observedBids.length/2)]:null;
    const baseFraction=Math.max(0,value/(weeks*8))*(urgent?1.3:1);
    const marketMultiplier=1+Math.min(.4,rivals.length*.1);
    const historyMultiplier=historicalMedian!==null&&budget!==undefined&&baseFraction>0?Math.max(.7,Math.min(1.3,historicalMedian/Math.max(1,budget*baseFraction))):1;
    const fraction=Math.min(.35,baseFraction*marketMultiplier*historyMultiplier);
    const cap=(v:number)=>budget===undefined?null:v<=0||budget<min?0:Math.max(0,min+Math.floor((Math.min(budget,Math.max(min,v))-min)/increment)*increment);
    const rulesKnown=(!snapshot.data_freshness||!expired(snapshot.data_freshness.faab_at,now))&&snapshot.analysis_inputs?.waiver_min_bid!==undefined&&snapshot.analysis_inputs?.waiver_increment!==undefined;
    const directionRisk=scout?.direction==="down"||/questionable|\bQ\b/i.test(p.status??"");
    const hasUpgrade=immediate>0||depthGain>0||future>0||playoff>0;
    const recommendation=hasUpgrade&&(drop||rosterSpace)&&!directionRisk?"ADD" as const:hasUpgrade||scout?.supported||trend>0?"MONITOR" as const:"PASS" as const;
    const bid=budget===undefined||!rulesKnown||budget<min||value<=0||recommendation!=="ADD"?null:cap(Math.max(min,budget*fraction));
    const low=bid===null?null:cap(bid*.6),high=bid===null?null:cap(Math.max(bid,bid*1.5));
    return {id:p.id,player:p.name,position:p.position,team:p.team??"Not imported",score:rankScore,immediate_gain:immediate,replaces:vacancyGain>currentGain?null:replacement?.name??null,rest_of_season:p.ros_projection??null,playoff_value:p.playoff_projection??null,bench_depth_gain:depthGain,positional_need:need||!!vacancy,ros_gain:p.ros_projection!==undefined&&replacement?.ros_projection!==undefined?future:null,playoff_gain:p.playoff_projection!==undefined&&replacement?.playoff_projection!==undefined?playoff:null,drop_id:drop?.id??null,drop:drop?.name??null,roster_space:rosterSpace,recommendation,drop_risk:rosterSpace?"A verified active roster spot is open.":drop?"Eligible unlocked bench option after depth checks. Review keeper value and handcuff role.":"No unlocked bench drop identified.",
      bid,bid_reason:budget===undefined?"FAAB balance unavailable.":!rulesKnown?"Verify the current FAAB balance, minimum bid and increment before estimating a bid.":budget<min?"Remaining budget is below the minimum bid." :recommendation!=="ADD"?"A supported add and legal roster move are required before estimating a bid.":value<=0?"No supported benefit for spending FAAB.":"Low-confidence budget estimate; not a predicted winning bid.",range:bid===null?null:[low!,high!],remaining:bid===null||budget===undefined?null:budget-bid,confidence:"low" as const,
      reason:vacancyGain>currentGain?`${vacancyGain.toFixed(1)} projected points over current bench cover for the open ${vacancy} slot.`:immediate>0?`${immediate.toFixed(1)} projected points above ${replacement?.name} in an eligible unlocked slot; ${settings.waiver} strategy${urgent?", outside current playoff cut":""}.`:`${depthGain>0?`${depthGain.toFixed(1)} projected points above ${bench?.name} for same-position bench depth. `:""}${future>0||trend>0?"Imported future value or usage trend supports a stash review.":"No supported starting upgrade or case for spending FAAB."}`,
      risks:[...p.factors,...p.conflicts,"One-player slot comparison; not a guaranteed full-roster gain. FAAB is a budget-allocation heuristic, not a predicted winning bid.","Individual bid estimates are alternatives, not an instruction to submit all bids together.",...(snapshot.analysis_inputs?.waiver_min_bid===undefined?["Minimum bid and increments are not fully imported; verify league rules."]:[]),...(p.ros_projection===undefined?["Rest-of-season value unavailable."]:[]),...(p.playoff_projection===undefined?["Playoff-week projection unavailable."]:[]),historicalMedian===null?"Fewer than five observed successful add bids; no bidding-history adjustment.":`Observed add-bid median $${historicalMedian} from ${observedBids.length} transactions; bounded history adjustment, not a winning-bid forecast.`,`${rivals.length} imported rivals have an eligible starting-slot need and available FAAB; missing roster/balance data may hide competition.`],opportunity_cost:bid===null?"No supported spend estimate.":`Spending $${bid} leaves $${budget!-bid} for approximately ${weeks} remaining NFL weeks.`,evidence:[...new Set([...p.evidence,...(replacement?.evidence??[])])]};
  }).sort((a,b)=>Number(b.recommendation!=="PASS")-Number(a.recommendation!=="PASS")||b.score-a.score||b.immediate_gain-a.immediate_gain||a.player.localeCompare(b.player)).map((p,i)=>({...p,rank:i+1}));
}
