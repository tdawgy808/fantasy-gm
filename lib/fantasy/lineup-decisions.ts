import type { Assignment } from "./optimizer.ts";
import type { Evaluation } from "./players.ts";
import { canPlay } from "./players.ts";
export function lineupDecisions(current:Evaluation[],owner:Evaluation[],assignments:Assignment[]){
  const starting=new Set(current.map(p=>p.id)),recommended=new Set(assignments.map(a=>a.player.id));
  const additions=assignments.filter(a=>!starting.has(a.player.id));
  const removed=current.filter(p=>!recommended.has(p.id));
  const comparisons=current.map(starter=>{
    const bench=owner.filter(p=>p.slot==="BN"&&!p.locked&&!p.unavailable&&p.mean!==null&&canPlay(p,starter.slot!)).sort((a,b)=>(b.mean??-Infinity)-(a.mean??-Infinity))[0];
    return {slot:starter.slot!,starter:starter.name,starter_id:starter.id,starter_points:starter.locked?starter.actual??null:starter.mean,alternative:bench?.name??null,alternative_id:bench?.id??null,alternative_points:bench?.mean??null,delta:bench&&!starter.locked&&starter.mean!==null?bench.mean!-starter.mean:null,
      confidence:"low",reason:starter.locked?"Starter is locked; substitution is unavailable.":bench?"Best projected eligible, available bench alternative for this slot. The optimizer checks the whole legal lineup, including flex eligibility.":"No eligible unlocked bench alternative with an imported projection.",risks:[...starter.factors,...(bench?.factors??[])],evidence:[...starter.evidence,...(bench?.evidence??[])]};
  });
  return {summary:!assignments.length?"A complete legal lineup could not be calculated.":additions.length?`${additions.length} starting-player change${additions.length===1?"":"s"} recommended.`:"No lineup changes recommended.",
    additions:additions.map(a=>({player:a.player.name,slot:a.slot,from:a.player.slot,reason:`${a.player.projection_source}. Review the complete lineup assignments; flex movement may accompany this substitution.`})),removed:removed.map(p=>p.name),comparisons};
}
