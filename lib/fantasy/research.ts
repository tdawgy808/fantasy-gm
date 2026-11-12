import { checkPrivateFields, MAX_SNAPSHOT_BYTES } from "./snapshot.ts";
import { sourceUrl, timestamp } from "./inputs.ts";

export type Finding = {
  id: string; player_id?: string; player: string; source: string; source_url: string;
  published_at: string | null; published_date?: string; retrieved_at: string; claim: string;
  category: "injury" | "availability" | "workload" | "usage" | "depth_chart" | "performance" | "matchup" | "expert" | "news";
  quality: "high" | "medium" | "low"; confirmation: "confirmed" | "reported" | "speculative";
  opportunity?: { season: number; week: number; direction: "up" | "down" | "stable" };
  effect?: { week: number; season: number; projection_multiplier?: number; unavailable?: boolean; rationale: string };
};
export type Research = { schema_version: 1; collected_at: string; mode: "manual" | "licensed_feed"; findings: Finding[] };
const text = (s: unknown, max=2000): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const trusted = ["nfl.com","espn.com","fantasypros.com","rotowire.com","pro-football-reference.com","pff.com","sports.yahoo.com","nbcsports.com","cbssports.com","apnews.com","philadelphiaeagles.com","therams.com","seahawks.com","giants.com","detroitlions.com","raiders.com","49ers.com","patriots.com","commanders.com","neworleanssaints.com","steelers.com"];
export function parseResearch(raw: string): Research {
  if (new TextEncoder().encode(raw).length > MAX_SNAPSHOT_BYTES) throw new Error("Research must be 1 MB or smaller.");
  const r = JSON.parse(raw); checkPrivateFields(r);
  if (!r || r.schema_version !== 1 || !timestamp(r.collected_at) || !["manual","licensed_feed"].includes(r.mode) || !Array.isArray(r.findings) || r.findings.length > 500) throw new Error("Invalid research snapshot.");
  const ids = new Set(); const dedup = new Map<string,Finding>();
  for (const f of r.findings) {
    if(f.published_date!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(f.published_date)||!Number.isFinite(Date.parse(f.published_date))||Date.parse(f.published_date)>Date.parse(r.collected_at)+86400000))throw new Error("Invalid research publication date.");
    if (!f || !text(f.id,100) || ids.has(f.id) || !text(f.player,150) || f.player_id !== undefined && !text(f.player_id,150) || !text(f.source,150) || !text(f.claim) || !sourceUrl(f.source_url) || (f.published_at !== null && !timestamp(f.published_at)) || !timestamp(f.retrieved_at) || f.published_at !== null && Date.parse(f.published_at) > Date.parse(f.retrieved_at)+300000 || Date.parse(f.retrieved_at) > Date.parse(r.collected_at)+300000 || !["high","medium","low"].includes(f.quality) || !["confirmed","reported","speculative"].includes(f.confirmation) || !["injury","availability","workload","usage","depth_chart","performance","matchup","expert","news"].includes(f.category)) throw new Error("Each finding needs an identity, factual claim, safe source URL, real timestamps and evidence labels.");
    const host = new URL(f.source_url).hostname;
    if (!trusted.some(d=>host===d||host.endsWith(`.${d}`))) throw new Error("Research source is not in the reviewed provider allowlist.");
    if (f.opportunity !== undefined) {
      const o = f.opportunity;
      if (!f.player_id || !o || !Number.isInteger(o.season) || o.season < 2000 || !Number.isInteger(o.week) || o.week < 1 || o.week > 18 || !["up","down","stable"].includes(o.direction)) throw new Error("Invalid scouting role assessment.");
    }
    if (f.effect !== undefined) {
      const e=f.effect;
      if (!e || !Number.isInteger(e.week) || e.week<1 || e.week>18 || !Number.isInteger(e.season) || e.season<2000 || !text(e.rationale) || e.projection_multiplier !== undefined && (typeof e.projection_multiplier !== "number" || !Number.isFinite(e.projection_multiplier) || e.projection_multiplier<0 || e.projection_multiplier>1.5) || e.unavailable!==undefined && typeof e.unavailable!=="boolean") throw new Error("Invalid modeled research effect.");
    }
    ids.add(f.id);
    const key=`${f.player_id||f.player.toLowerCase()}|${f.source_url}|${f.claim.toLowerCase().replace(/\s+/g,' ').trim()}`;
    const prior=dedup.get(key); if(!prior || f.retrieved_at>prior.retrieved_at)dedup.set(key,f);
  }
  return { ...r, findings:[...dedup.values()] };
}

// Optional providers must be implemented with an authorized API/feed and explicit licensing.
// No generic scraping or paid-provider access is attempted by the analysis calculation.
export interface ResearchProvider { collect(): Promise<Research> }
export function researchForPlayer(research: Research | null, id: string, name: string): Finding[] {
  return research?.findings.filter(f=>f.player_id ? f.player_id===id : f.player.toLowerCase()===name.toLowerCase()) ?? [];
}
