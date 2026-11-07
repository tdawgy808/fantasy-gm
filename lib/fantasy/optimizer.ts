import type { Evaluation } from "./players.ts";
import { canPlay } from "./players.ts";
import type { Snapshot } from "./snapshot.ts";
import type { Settings } from "./strategies.ts";
import { simulateLineups } from "./simulation.ts";
export type Assignment={slot:string;player:Evaluation};
type Candidate={score:number;assignments:Assignment[]};
export function rosterSlots(snapshot:Snapshot):string[] {
  const rules=snapshot.rules?.roster_positions;
  return snapshot.analysis_inputs?.roster_slots??(Array.isArray(rules)?rules.filter((s):s is string=>typeof s==="string"&&!["BN","IR"].includes(s)):snapshot.roster.filter(p=>!["BN","IR"].includes(p.slot)).map(p=>p.slot));
}
export function legalCandidates(players:Evaluation[],slots:string[],strategy:Settings["lineup"],limit=24):Candidate[] {
  if(!slots.length||slots.length>12||players.length>40)return [];
  const fixed:Assignment[]=[];const remaining=[...slots];
  for(const p of players.filter(p=>p.locked&&p.slot&&!["BN","IR"].includes(p.slot))){const i=remaining.indexOf(p.slot!);if(i<0)return [];remaining.splice(i,1);fixed.push({slot:p.slot!,player:p});}
  const fixedIds=new Set(fixed.map(a=>a.player.id));
  const candidates=players.filter(p=>!fixedIds.has(p.id)&&!p.locked&&!p.unavailable&&p.slot!=="IR"&&p.mean!==null);
  const dp=new Map<number,Candidate[]>([[0,[{score:0,assignments:[]}]]]);
  for(const p of candidates){
    const entries=[...dp.entries()].sort((a,b)=>b[0]-a[0]);
    for(const [mask,rows]of entries)for(let i=0;i<remaining.length;i++)if(!(mask&(1<<i))&&canPlay(p,remaining[i])){
      const next=mask|(1<<i);const risk=strategy==="Safe"?(p.floor??p.mean!):strategy==="Aggressive"?(p.ceiling??p.mean!):p.mean!;
      const options=[...(dp.get(next)??[]),...rows.map(row=>({score:row.score+risk,assignments:[...row.assignments,{slot:remaining[i],player:p}]}))];
      const unique=new Map<string,Candidate>();for(const row of options.sort((a,b)=>b.score-a.score)){const key=row.assignments.map(a=>a.player.id).sort().join("|");if(!unique.has(key))unique.set(key,row);}
      dp.set(next,[...unique.values()].slice(0,limit));
    }
  }
  return (dp.get((1<<remaining.length)-1)??[]).map(row=>({...row,assignments:[...fixed,...row.assignments]}));
}
export function optimize(snapshot:Snapshot,players:Evaluation[],settings:Settings) {
  const owner=players.filter(p=>p.slot!==undefined);const slots=rosterSlots(snapshot);
  const candidates=legalCandidates(owner,slots,settings.lineup);
  const opponentTeam=snapshot.analysis_inputs?.teams?.find(t=>t.id===snapshot.analysis_inputs?.opponent_team_id);
  const opponent=opponentTeam?.roster.filter(r=>!["BN","IR"].includes(r.slot)).map(r=>players.find(p=>p.id===r.player_id)).filter((p):p is Evaluation=>!!p)??[];
  const opponentComplete=opponent.length===slots.length;
  const simulation=opponentComplete?simulateLineups(candidates.map(c=>c.assignments.map(a=>a.player)),opponent,snapshot.analysis_inputs?.correlations):null;
  let index=0;
  if(simulation&&settings.lineup==="Matchup-Aware")index=simulation.probabilities.indexOf(Math.max(...simulation.probabilities));
  const best=candidates[index];
  const current=owner.filter(p=>p.slot&&!["BN","IR"].includes(p.slot));
  const currentSim=simulation&&opponentComplete?simulateLineups([current],opponent,snapshot.analysis_inputs?.correlations):null;
  const sum=(ps:Evaluation[])=>ps.some(p=>p.locked?p.actual===undefined:p.mean===null)?null:ps.reduce((s,p)=>s+(p.locked?p.actual!:p.mean!),0);
  return {assignments:best?.assignments??[],projection:best?sum(best.assignments.map(a=>a.player)):null,current_projection:sum(current),current_probability:currentSim?.probabilities[0]??null,win_probability:simulation?.probabilities[index]??null,simulation_trials:simulation?.trials??0,method:simulation?`Empirical bootstrap, ${simulation.trials} trials; ${simulation.correlated?"sourced correlations":"independence assumption"}; uncalibrated model estimate`:`Projection fallback; ${settings.lineup} uses ${settings.lineup==="Safe"?"empirical 20th percentile where available":settings.lineup==="Aggressive"?"empirical 80th percentile where available":"expected points without unsupported win odds"}`,
    changes:best?.assignments.filter(a=>a.player.slot!==a.slot).map(a=>({player:a.player.name,slot:a.slot,from:a.player.slot,reason:`${a.player.projection_source}; ${settings.lineup} strategy. Verify actual Yahoo eligibility and locks.`}))??[],
    limitations:[...(!best?["A full legal lineup cannot be filled from available, unlocked, projected players. No partial lineup is presented as optimal."]:[]),...(!simulation?["Matchup simulation requires a complete opponent lineup and at least eight compatible historical games for every unlocked player, plus actual points for locked players."]:[]),"Search retains up to 24 candidates per slot state; estimated win probability is compared within this bounded candidate set, not every possible lineup.","Safe/Aggressive settings target floor/ceiling; matchup-aware maximizes estimated win probability when the simulation is supported."]};
}
