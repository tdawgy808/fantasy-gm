import type { RosterPlayer, Snapshot } from "./snapshot.ts";
export type Advice = { title: string; detail: string; level: "watch" | "opportunity" | "info" };
export function unavailable(player: RosterPlayer, week: number): boolean {
  return player.bye === week || /\b(IR|NA|OUT|O|D)\b|inactive|doubtful/i.test(player.status || "");
}
export function completed(player: RosterPlayer): boolean { return /final|in progress|live|locked/i.test(player.game_status || "") || player.actual !== undefined; }
function position(player: RosterPlayer): string { return player.position || player.slot; }
export function eligible(player: RosterPlayer, slot: string): boolean {
  return slot === "W/R/T" || slot === "W_R_T" ? ["WR", "RB", "TE"].includes(position(player)) : position(player) === slot;
}
export function recommendations(snapshot: Snapshot): Advice[] {
  const advice: Advice[] = [];
  const starters = snapshot.roster.filter(p => !["BN", "IR"].includes(p.slot));
  const bench = snapshot.roster.filter(p => p.slot === "BN" && !unavailable(p, snapshot.week) && !completed(p) && typeof p.projection === "number");
  const used = new Set<string>();
  for (const starter of starters) {
    if (completed(starter)) continue;
    const candidate = bench.filter(p => eligible(p, starter.slot) && !used.has(p.name)).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))[0];
    const absent = unavailable(starter, snapshot.week);
    const uncertain = /\bQ\b|questionable/i.test(starter.status || "");
    if (absent || uncertain) advice.push({ level: "watch", title: `${starter.name}: ${absent ? "availability problem" : "monitor status"}`, detail: candidate ? `Recheck before kickoff. ${candidate.name} is an eligible bench contingency (${candidate.projection?.toFixed(2)} projected). Confirm health and lock times first.` : "Recheck the official status and identify an eligible replacement before kickoff." });
    if (!absent && !uncertain && candidate && typeof starter.projection === "number" && candidate.projection! > starter.projection + 1) {
      used.add(candidate.name);
      advice.push({ level: "opportunity", title: `Consider ${candidate.name} at ${starter.slot}`, detail: `${candidate.projection?.toFixed(2)} projected vs ${starter.name}'s ${starter.projection.toFixed(2)}. This is a projection comparison, not an automatic lineup change.` });
    }
  }
  const byes = snapshot.roster.filter(p => p.bye === snapshot.week + 1 && !["BN", "IR"].includes(p.slot));
  if (byes.length) advice.push({ level: "info", title: `Week ${snapshot.week + 1} planning`, detail: `${byes.map(p => p.name).join(", ")} have a bye next week. Review replacement projections after the next refresh.` });
  if (!advice.length) advice.push({ level: "info", title: "No clear projection upgrade found", detail: "The imported roster does not show an obvious eligible bench upgrade. Check recent news and actual lineup locks before deciding." });
  return advice;
}

export type Standing = { rank: number; team: string; record: string; pf: number; pa: number; faab: number };
export type Available = { name: string; position: string; status: string; projection: number };
export function standings(snapshot: Snapshot): Standing[] {
  return (snapshot.standings || []).filter(Array.isArray).map(row => ({ rank: row[0], team: row[1], record: row[2], pf: row[3], pa: row[4], faab: row[6] }));
}
export function available(snapshot: Snapshot): Available[] {
  return (snapshot.available_players || []).filter(Array.isArray).map(row => ({ name: row[0], position: row[1], status: row[2], projection: row[3] }));
}
