import type { Snapshot } from "./snapshot.ts";
export type DataFreshness={baseline_at:string;mode:"weekly"|"daily";projections:Record<string,string>;availability:Record<string,string>;rosters:Record<string,string>;standings_at:string;schedule_at:string;transactions_at:string;faab_at:string;matchup_at:string|null};
export function initialFreshness(s:Snapshot):DataFreshness{
  const at=s.captured_at;
  return {baseline_at:at,mode:"weekly",projections:Object.fromEntries((s.analysis_inputs?.players??[]).filter(p=>p.projection!==undefined||p.projected_stats!==undefined).map(p=>[p.id,at])),availability:Object.fromEntries((s.analysis_inputs?.players??[]).map(p=>[p.id,at])),rosters:Object.fromEntries((s.analysis_inputs?.teams??[]).map(t=>[String(t.id),at])),standings_at:at,schedule_at:at,transactions_at:at,faab_at:at,matchup_at:s.matchup?at:null};
}
export const observedAt=(s:Snapshot,kind:"projections"|"availability",id:string)=>s.data_freshness?.[kind][id]??(s.data_freshness?null:s.captured_at);
export const expired=(at:string|null|undefined,now:number,hours=24)=>!at||!Number.isFinite(Date.parse(at))||now-Date.parse(at)>hours*3600000;
