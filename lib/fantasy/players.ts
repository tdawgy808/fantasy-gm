import type { Snapshot } from "./snapshot.ts";
import type { PlayerInput } from "./inputs.ts";
import type { Research } from "./research.ts";
import { researchForPlayer } from "./research.ts";
import { historicalPoints, scoreStats } from "./scoring.ts";

export type Evaluation = PlayerInput & {
  slot?: string; mean: number | null; samples: number[]; floor: number | null; ceiling: number | null;
  unavailable: boolean; locked: boolean; confidence: "low" | "medium"; factors: string[];
  conflicts: string[]; evidence: string[]; projection_source: string; variance_scale:number;
};
export const playerKey=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export function canPlay(p: Pick<PlayerInput,"eligible"|"position">,slot:string) {
  if(p.eligible.includes(slot))return true;
  if(["W/R/T","W_R_T","FLEX"].includes(slot))return p.eligible.some(x=>["RB","WR","TE"].includes(x));
  if(["W/R","W_R"].includes(slot))return p.eligible.some(x=>["RB","WR"].includes(x));
  if(["Q/W/R/T","SUPER_FLEX"].includes(slot))return p.eligible.some(x=>["QB","RB","WR","TE"].includes(x));
  return false;
}
export function evaluatePlayers(snapshot: Snapshot,research: Research|null,now:number): Evaluation[] {
  const inputs=snapshot.analysis_inputs;
  const map=new Map<string,PlayerInput>();
  for(const p of snapshot.roster)map.set(p.name.toLowerCase(),{id:playerKey(p.name),name:p.name,position:p.position||p.slot,team:p.team,eligible:[p.position||p.slot],projection:p.projection??undefined,status:p.status,bye:p.bye,actual:p.actual,game_status:p.game_status});
  for(const row of snapshot.available_players??[]) if(Array.isArray(row))map.set(String(row[0]).toLowerCase(),{id:playerKey(row[0]),name:row[0],position:row[1],eligible:[row[1]],status:row[2],projection:row[3]??undefined});
  for(const p of inputs?.players??[]) {
    const legacy=map.get(p.name.toLowerCase());
    map.set(p.name.toLowerCase(),{...legacy,...p,actual:legacy?.actual??p.actual,game_status:legacy?.game_status??p.game_status});
  }
  return [...map.values()].map(p=>{
    const original=snapshot.roster.find(r=>r.name.toLowerCase()===p.name.toLowerCase());
    const ownerTeam=inputs?.teams?.find(t=>t.id===snapshot.team.id);
    const slot=ownerTeam?ownerTeam.roster.find(r=>r.player_id===p.id)?.slot:original?.slot;
    const factors:string[]=[];const conflicts:string[]=[];
    let mean=p.projection??null,projection_source="Imported Yahoo fantasy-point projection";
    if(p.projected_stats&&inputs?.scoring) {
      try { mean=scoreStats(p.projected_stats,inputs.scoring);projection_source="Modeled stat line scored under imported league rules"; factors.push("Stat-line estimate; nonlinear bonuses at projected totals are approximate expected points."); }
      catch { factors.push("Projected stat line is incomplete; Yahoo projection retained."); }
    }
    const samples=historicalPoints([...(p.history??[])].sort((a,b)=>Date.parse(a.played_at)-Date.parse(b.played_at)),inputs?.scoring,Date.parse(snapshot.captured_at)).slice(-20);
    const sorted=[...samples].sort((a,b)=>a-b),average=samples.reduce((a,b)=>a+b,0)/(samples.length||1);
    let variance_scale=1;
    const quantile=(q:number)=>sorted.length&&mean!==null ? mean+(sorted[Math.floor((sorted.length-1)*q)]-average)*variance_scale : null;
    let unavailable=p.bye===snapshot.week||/\b(IR|NA|OUT|O|D)\b|inactive|doubtful/i.test(p.status??"");
    const locked=p.actual!==undefined||/final|in progress|live|locked/i.test(p.game_status??"");
    if(unavailable)factors.push("Bye, inactive, IR or out/doubtful designation: exclude from an unlocked lineup.");
    if(/\bQ\b|questionable/i.test(p.status??""))factors.push("Questionable: confirm status and prepare an unlocked eligible contingency.");
    if(locked)factors.push("Game started or actual points recorded; hold the assignment fixed.");
    const findings=researchForPlayer(research,p.id,p.name);
    const applicable=findings.filter(f=>f.effect?.week===snapshot.week&&f.effect?.season===snapshot.league.season&&now-Date.parse(f.published_at)<=48*3600000&&f.quality!=="low"&&f.confirmation!=="speculative");
    const official=applicable.filter(f=>f.confirmation==="confirmed"&&/^(?:.*\.)?nfl\.com$/.test(new URL(f.source_url).hostname));
    const preferred=official.length?official:applicable;
    if(official.length&&applicable.some(f=>!official.includes(f)&&JSON.stringify(f.effect)!==JSON.stringify(official[0].effect)))conflicts.push("An official confirmed NFL report is prioritized over other reported modeled effects; review all sources.");
    const signatures=new Set(preferred.map(f=>JSON.stringify([f.effect?.unavailable,f.effect?.projection_multiplier])));
    if(signatures.size>1)conflicts.push("Conflicting research effects; no numeric adjustment applied. Review the sources.");
    else if(preferred.length) {
      const best=[...preferred].sort((a,b)=>Number(b.confirmation==="confirmed")-Number(a.confirmation==="confirmed")||Date.parse(b.published_at)-Date.parse(a.published_at))[0];
      if(best.effect?.unavailable===true&&best.confirmation==="confirmed")unavailable=true;
      if(mean!==null&&best.effect?.projection_multiplier!==undefined) {mean*=best.effect.projection_multiplier;variance_scale=best.effect.projection_multiplier;projection_source+=" + explicitly imported research estimate (mean and spread scaled)";}
      factors.push(`Research model: ${best.effect?.rationale} (${best.confirmation}; ${best.source}).`);
    }
    for(const f of findings)if(now-Date.parse(f.published_at)>48*3600000)factors.push(`Stale research excluded from numeric effects: ${f.source}.`);
    if(p.usage_note)factors.push(`Observed usage: ${p.usage_note}`);
    if(p.matchup_note)factors.push(`Imported defensive matchup: ${p.matchup_note}`);
    if(p.environment_note)factors.push(`Imported environment: ${p.environment_note}`);
    if(samples.length<8)factors.push("Fewer than eight compatible historical games; floor, ceiling and simulation confidence unavailable.");
    return {...p,slot,mean,samples,floor:samples.length>=8?quantile(.2):null,ceiling:samples.length>=8?quantile(.8):null,unavailable,locked,confidence:samples.length>=8?"medium":"low",factors,conflicts,evidence:findings.map(f=>f.id),projection_source,variance_scale};
  });
}
