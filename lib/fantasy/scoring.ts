import type { AnalysisInputs, History } from "./inputs.ts";

export function scoreStats(stats: Record<string,number>, scoring: NonNullable<AnalysisInputs["scoring"]>): number {
  let total=0;
  for(const r of scoring.rules) {
    const value=stats[r.stat];
    if(!Number.isFinite(value)) throw new Error(`Missing scoring stat: ${r.stat}. Record explicit zeroes rather than assuming them.`);
    total+=value*r.points;
    if(r.bands) { const band=r.bands.find(b=>value>=b.min&&(b.max===undefined||value<=b.max)); if(!band)throw new Error(`No scoring band for ${r.stat}.`); total+=band.points; }
    const bonuses=(r.bonuses??[]).filter(b=>value>=b.threshold).sort((a,b)=>b.threshold-a.threshold);
    total+=r.bonus_mode==="highest" ? bonuses[0]?.points??0 : bonuses.reduce((sum,b)=>sum+b.points,0);
  }
  return total;
}
export function historicalPoints(history: History[], scoring: AnalysisInputs["scoring"], cutoff: number): number[] {
  if(!scoring)return [];
  return history.filter(h=>Date.parse(h.played_at)<cutoff).flatMap(h=>{
    try { return h.stats ? [scoreStats(h.stats,scoring)] : h.scoring_id===scoring.id && Number.isFinite(h.points) ? [h.points!] : []; } catch { return []; }
  });
}
