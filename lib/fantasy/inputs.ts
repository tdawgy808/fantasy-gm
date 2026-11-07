// Version 2 adds explicit analysis inputs; existing version 1 snapshots remain valid.
export type ScoringRule = { stat: string; points: number; bonuses?: { threshold: number; points: number }[]; bonus_mode?: "cumulative" | "highest"; bands?: { min: number; max?: number; points: number }[] };
export type History = { week: number; season: number; played_at: string; stats?: Record<string, number>; points?: number; scoring_id?: string };
export type PlayerInput = {
  id: string; name: string; position: string; team?: string; eligible: string[];
  projection?: number; status?: string; bye?: number; game_status?: string; actual?: number;
  projected_stats?: Record<string, number>; history?: History[];
  ros_projection?: number; playoff_projection?: number; opportunity_trend?: number;
  usage_note?: string; environment_note?: string; matchup_note?: string;
};
export type TeamInput = { id: number; name: string; roster: { player_id: string; slot: string }[]; faab?: number; wins?: number; losses?: number; ties?: number; points_for?: number };
export type AnalysisInputs = {
  scoring?: { id: string; complete: true; rules: ScoringRule[] };
  players: PlayerInput[]; teams?: TeamInput[]; roster_slots?: string[];
  opponent_team_id?: number; available_ids?: string[];
  correlations?: { a: string; b: string; rho: number; source_url: string; sample_size: number }[];
  schedule?: { week: number; home: number; away: number; home_projection?: number; away_projection?: number }[];
  playoff?: { teams: number; start_week: number; tie_breaker: "points_for" | "unsupported" };
  trade_deadline_at?: string; waiver_min_bid?: number; waiver_increment?: number;
  transactions?: { at: string | null; displayed_at?: string; team_id: number; kind: string; player_id: string; bid?: number }[];
  records_through_week?: number;
  team_histories?: { team_id:number; scoring_id:string; through_week:number; points:number[] }[];
};
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 2000;
const arr = (v: unknown, max = 1000): v is unknown[] => Array.isArray(v) && v.length <= max;
const positive = (v: unknown): v is number => num(v) && Number.isInteger(v) && v > 0;
export function sourceUrl(v: unknown): boolean {
  if (!str(v)) return false;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.hostname.includes("."); } catch { return false; }
}
export function timestamp(v: unknown): v is string { return str(v) && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now() + 300000; }
function stats(v: unknown): boolean { return obj(v) && Object.keys(v).length <= 100 && Object.entries(v).every(([k,n]) => /^[a-zA-Z0-9_]+$/.test(k) && num(n)); }
export function validateInputs(v: unknown): asserts v is AnalysisInputs {
  function fail(): never { throw new Error("Invalid version 2 analysis inputs. Check player identities, scoring, eligibility, schedules and evidence."); }
  if (!obj(v) || !arr(v.players, 800)) fail();
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const p of v.players) {
    if (!obj(p) || !str(p.id) || ids.has(p.id) || !str(p.name) || !str(p.position) || !arr(p.eligible,12) || !p.eligible.length || !p.eligible.every(str)) fail();
    if(names.has(p.name.toLowerCase()))fail(); names.add(p.name.toLowerCase()); ids.add(p.id);
    for (const k of ["projection","actual","ros_projection","playoff_projection","opportunity_trend"]) if (p[k] !== undefined && !num(p[k])) fail();
    if (p.opportunity_trend !== undefined && Math.abs(p.opportunity_trend as number) > 1) fail();
    for (const k of ["status","team","game_status","usage_note","environment_note","matchup_note"]) if (p[k] !== undefined && !str(p[k])) fail();
    if (p.bye !== undefined && (!positive(p.bye) || p.bye > 18)) fail();
    if (p.projected_stats !== undefined && !stats(p.projected_stats)) fail();
    if (p.history !== undefined) {
      if (!arr(p.history, 50)) fail(); const seen = new Set<string>();
      for (const h of p.history) {
        if (!obj(h) || !positive(h.week) || h.week > 18 || !positive(h.season) || !timestamp(h.played_at) || (!stats(h.stats) && !num(h.points)) || h.stats !== undefined && !stats(h.stats) || h.scoring_id !== undefined && !str(h.scoring_id)) fail();
        const key = `${h.season}-${h.week}`; if (seen.has(key)) fail(); seen.add(key);
      }
    }
  }
  if (v.scoring !== undefined) {
    const s = v.scoring;
    if (!obj(s) || !str(s.id) || s.complete !== true || !arr(s.rules,100) || !s.rules.length) fail();
    for (const r of s.rules) {
      if (!obj(r) || !str(r.stat) || !num(r.points)) fail();
      if (r.bonuses !== undefined && (!arr(r.bonuses,30) || !["cumulative","highest"].includes(r.bonus_mode as string) || !r.bonuses.every(b=>obj(b)&&num(b.threshold)&&num(b.points)))) fail();
      if (r.bands !== undefined) {
        if (!arr(r.bands,30) || !r.bands.length) fail(); let previousMax = -Infinity;
        for (const b of r.bands) { if (!obj(b) || !num(b.min) || !num(b.points) || b.max !== undefined && (!num(b.max) || b.max < b.min) || b.min <= previousMax) fail(); previousMax = b.max === undefined ? Infinity : b.max as number; }
      }
    }
  }
  if (v.roster_slots !== undefined && (!arr(v.roster_slots,16) || !v.roster_slots.length || !v.roster_slots.every(str) || v.roster_slots.some(s=>["BN","IR"].includes(String(s))))) fail();
  const teamIds = new Set<number>();
  if (v.teams !== undefined) {
    if (!arr(v.teams,30)) fail(); const owned = new Set<string>();
    for (const t of v.teams) {
      if (!obj(t) || !positive(t.id) || teamIds.has(t.id) || !str(t.name) || !arr(t.roster,40)) fail(); teamIds.add(t.id);
      for (const r of t.roster) { if (!obj(r) || !str(r.player_id) || !ids.has(r.player_id) || owned.has(r.player_id) || !str(r.slot)) fail(); owned.add(r.player_id); }
      for (const k of ["faab","wins","losses","ties","points_for"]) if (t[k] !== undefined && (!num(t[k]) || (t[k] as number) < 0)) fail();
    }
  }
  if (v.opponent_team_id !== undefined && !teamIds.has(v.opponent_team_id as number)) fail();
  if (v.available_ids !== undefined && (!arr(v.available_ids,800) || !v.available_ids.every(id=>str(id)&&ids.has(id)) || new Set(v.available_ids).size !== v.available_ids.length || (v.teams as TeamInput[]|undefined)?.some(t=>t.roster.some(p=>(v.available_ids as string[]).includes(p.player_id))))) fail();
  if (v.correlations !== undefined) {
    if (!arr(v.correlations,100)) fail();
    for (const c of v.correlations) if (!obj(c) || !ids.has(c.a as string) || !ids.has(c.b as string) || c.a === c.b || !num(c.rho) || Math.abs(c.rho) > 1 || !sourceUrl(c.source_url) || !positive(c.sample_size) || c.sample_size < 8) fail();
  }
  if (v.schedule !== undefined) {
    if (!arr(v.schedule,300)) fail(); const games = new Set<string>();
    for (const g of v.schedule) {
      if (!obj(g) || !positive(g.week) || g.week > 18 || !teamIds.has(g.home as number) || !teamIds.has(g.away as number) || g.home === g.away || g.home_projection !== undefined && !num(g.home_projection) || g.away_projection !== undefined && !num(g.away_projection)) fail();
      for (const id of [g.home,g.away]) { const key=`${g.week}-${id}`; if(games.has(key)) fail(); games.add(key); }
    }
  }
  if (v.playoff !== undefined && (!obj(v.playoff) || !positive(v.playoff.teams) || !positive(v.playoff.start_week) || v.playoff.start_week > 18 || !["points_for","unsupported"].includes(v.playoff.tie_breaker as string))) fail();
  if (v.trade_deadline_at !== undefined && (!str(v.trade_deadline_at) || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v.trade_deadline_at) || !Number.isFinite(Date.parse(v.trade_deadline_at)))) fail();
  for (const key of ["waiver_min_bid","waiver_increment"]) if (v[key] !== undefined && (!num(v[key]) || (v[key] as number) < (key === "waiver_increment" ? 0.01 : 0))) fail();
  if (v.transactions !== undefined && (!arr(v.transactions,500) || !v.transactions.every(t=>obj(t)&&(timestamp(t.at)||t.at===null&&str(t.displayed_at))&&teamIds.has(t.team_id as number)&&str(t.kind)&&ids.has(t.player_id as string)&&(t.bid===undefined||num(t.bid)&&t.bid>=0)))) fail();
  if(v.records_through_week!==undefined&&(!num(v.records_through_week)||!Number.isInteger(v.records_through_week)||v.records_through_week<0||v.records_through_week>18))fail();
  if(v.team_histories!==undefined){if(!arr(v.team_histories,30)||new Set(v.team_histories.map(h=>obj(h)?h.team_id:null)).size!==v.team_histories.length)fail();for(const h of v.team_histories)if(!obj(h)||!teamIds.has(h.team_id as number)||!str(h.scoring_id)||!positive(h.through_week)||!arr(h.points,50)||!h.points.every(num))fail();}
}
