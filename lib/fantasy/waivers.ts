import type { Snapshot } from "./snapshot.ts";
import type { Evaluation } from "./players.ts";
import { canPlay } from "./players.ts";
import type { Settings } from "./strategies.ts";
import { rosterSlots } from "./optimizer.ts";
export function waiverScout(snapshot:Snapshot,players:Evaluation[],settings:Settings) {
  const owner=players.filter(p=>p.slot!==undefined);const owned=new Set(snapshot.analysis_inputs?.teams?.flatMap(t=>t.roster.map(r=>r.player_id))??owner.map(p=>p.id));
  const available=new Set(snapshot.analysis_inputs?.available_ids??(snapshot.available_players??[]).flatMap(r=>Array.isArray(r)?[players.find(p=>p.name===r[0])?.id]:[]));
  const slots=rosterSlots(snapshot);
  const playoffTeams=snapshot.analysis_inputs?.playoff?.teams??(snapshot.rules?.playoffs as {teams?:number}|undefined)?.teams;
  const urgent=typeof playoffTeams==="number"&&typeof snapshot.team.rank==="number"&&snapshot.team.rank>playoffTeams;
  const budget=snapshot.team.faab_remaining;
  const weeks=Math.max(1,18-snapshot.week);
  return players.filter(p=>available.has(p.id)&&!owned.has(p.id)&&!p.unavailable&&p.mean!==null&&slots.some(s=>canPlay(p,s))).map(p=>{
    const alternatives=owner.filter(o=>o.slot&&!["BN","IR"].includes(o.slot)&&!o.locked&&canPlay(p,o.slot));
    const replacement=[...alternatives].sort((a,b)=>(a.unavailable?0:a.mean??Infinity)-(b.unavailable?0:b.mean??Infinity))[0];
    const immediate=replacement?Math.max(0,p.mean!-(replacement.unavailable?0:replacement.mean??p.mean!)):0;
    const trend=p.opportunity_trend??0;
    const future=p.ros_projection!==undefined?Math.max(0,p.ros_projection-(replacement?.ros_projection??replacement?.mean??p.mean!)):0;
    const playoff=p.playoff_projection!==undefined?Math.max(0,p.playoff_projection-(replacement?.playoff_projection??replacement?.mean??p.mean!)):0;
    const rankScore=settings.waiver==="Win Now"?immediate*2+(urgent?immediate:0):settings.waiver==="Upside"?immediate*.4+future+playoff*.4+Math.max(0,trend)*8:immediate*(urgent?1.5:1)+future*.5+Math.max(0,trend)*3;
    const drops=owner.filter(o=>o.slot==="BN"&&!o.locked&&o.id!==p.id).sort((a,b)=>((a.ros_projection??a.mean??Infinity)+(a.playoff_projection??0)*.2)-((b.ros_projection??b.mean??Infinity)+(b.playoff_projection??0)*.2));
    const drop=drops[0];
    const increment=snapshot.analysis_inputs?.waiver_increment??1,min=snapshot.analysis_inputs?.waiver_min_bid??0;
    const value=immediate+future*.4+Math.max(0,trend)*2;
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
    const bid=budget===undefined?null:cap(value>0?Math.max(min,budget*fraction):0);
    const low=bid===null?null:cap(bid*.6),high=bid===null?null:cap(Math.max(bid,bid*1.5));
    return {id:p.id,player:p.name,position:p.position,team:p.team??"Not imported",score:rankScore,immediate_gain:immediate,replaces:replacement?.name??null,rest_of_season:p.ros_projection??null,playoff_value:p.playoff_projection??null,drop:drop?.name??null,drop_risk:drop?"Lowest modeled bench value; confirm depth, future byes and handcuff role before dropping.":"No unlocked bench drop identified; roster capacity must be reviewed.",
      bid,range:bid===null?null:[low!,high!],remaining:bid===null||budget===undefined?null:budget-bid,confidence:"low" as const,
      reason:immediate>0?`${immediate.toFixed(1)} projected points above ${replacement?.name} in an eligible unlocked slot; ${settings.waiver} strategy${urgent?", outside current playoff cut":""}.`:`No immediate starting-slot improvement found. ${future>0||trend>0?"Imported future value or usage trend supports a stash review.":"Watchlist only; no evidenced case for spending FAAB."}`,
      risks:[...p.factors,...p.conflicts,"One-player slot comparison; not a guaranteed full-roster gain. FAAB is a budget-allocation heuristic, not a predicted winning bid.","Individual bid estimates are alternatives, not an instruction to submit all bids together.",...(snapshot.analysis_inputs?.waiver_min_bid===undefined?["Minimum bid and increments are not fully imported; verify league rules."]:[]),...(p.ros_projection===undefined?["Rest-of-season value unavailable."]:[]),...(p.playoff_projection===undefined?["Playoff-week projection unavailable."]:[]),historicalMedian===null?"Fewer than five observed successful add bids; no bidding-history adjustment.":`Observed add-bid median $${historicalMedian} from ${observedBids.length} transactions; bounded history adjustment, not a winning-bid forecast.`,`${rivals.length} imported rivals have an eligible starting-slot need and available FAAB; missing roster/balance data may hide competition.`],opportunity_cost:bid===null?"FAAB balance unavailable.":`Spending $${bid} leaves $${budget!-bid} for approximately ${weeks} remaining NFL weeks.`,evidence:p.evidence};
  }).sort((a,b)=>b.score-a.score||b.immediate_gain-a.immediate_gain||a.player.localeCompare(b.player)).map((p,i)=>({...p,rank:i+1}));
}
