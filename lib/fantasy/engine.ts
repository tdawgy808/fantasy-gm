import { createHash } from "node:crypto";
import type { Snapshot } from "./snapshot.ts";
import type { Research } from "./research.ts";
import type { Settings } from "./strategies.ts";
import { evaluatePlayers } from "./players.ts";
import { optimize } from "./optimizer.ts";
import { waiverScout } from "./waivers.ts";
import { tradeScout } from "./trades.ts";
import { playoffOutlook } from "./playoffs.ts";
export const ENGINE_VERSION="1.2.0";
export const fingerprint=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
type PreviousAnalysis={yahoo_at:string;news_at:string|null;settings:Settings;lineup:{assignments:{player:{id:string}}[]};waivers:{id:string}[]};
export function calculate(snapshot:Snapshot,research:Research|null,settings:Settings,previous:PreviousAnalysis|null=null,now=Date.now()) {
  const players=evaluatePlayers(snapshot,research,now);const lineup=optimize(snapshot,players,settings);
  const waivers=waiverScout(snapshot,players,settings,now);
  const result={schema_version:1 as const,engine_version:ENGINE_VERSION,calculated_at:new Date(now).toISOString(),yahoo_at:snapshot.captured_at,news_at:research?.collected_at??null,source_hash:fingerprint({snapshot,research,settings,engine:ENGINE_VERSION}),settings,lineup,waivers:waivers.slice(0,10),all_waivers:waivers,
    trades:tradeScout(snapshot,players,settings,now),playoffs:playoffOutlook(snapshot),players,
    yahoo_probability:snapshot.matchup?.win_probability??null,
    freshness:{yahoo_stale:now-Date.parse(snapshot.captured_at)>24*3600000,news_stale:research?now-Date.parse(research.collected_at)>24*3600000:true},
    changes:[] as string[],limitations:["Advisor only; no Yahoo transactions or write permissions.","Historical distributions are empirical estimates, not calibrated forecasts. Missing evidence reduces confidence.","Yahoo projections are treated as already league-scored; they are never rescored as raw stats.",...(!research?["External research unavailable. Import a sourced research snapshot; no live providers configured."]:[]),...(snapshot.schema_version===1?["Legacy snapshot: extended player identity, historical distributions and other league rosters may be missing."]:[])]};
  if(previous) {
    if(previous.yahoo_at!==result.yahoo_at)result.changes.push("New Yahoo snapshot imported.");
    if(previous.news_at!==result.news_at)result.changes.push("External research snapshot changed.");
    if(fingerprint(previous.settings)!==fingerprint(settings))result.changes.push("Strategy settings changed.");
    const old=new Set(previous.lineup.assignments.map(a=>a.player.id));
    for(const a of lineup.assignments)if(!old.has(a.player.id))result.changes.push(`New recommended starter: ${a.player.name}.`);
    if(previous.waivers[0]?.id!==waivers[0]?.id)result.changes.push(`Top waiver changed to ${waivers[0]?.player??"none"}.`);
    if(!result.changes.length)result.changes.push("No significant recommendation changes detected. Calculation reran using the current inputs.");
  } else result.changes.push("First saved analysis; no previous calculation to compare.");
  return result;
}
export type AnalysisResult=ReturnType<typeof calculate>;
