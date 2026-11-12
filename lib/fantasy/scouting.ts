import type { PlayerInput } from "./inputs.ts";
import type { Evaluation } from "./players.ts";
import { researchForPlayer, type Research } from "./research.ts";
import { scoreStats } from "./scoring.ts";
import type { Snapshot } from "./snapshot.ts";
import { expired, observedAt } from "./freshness.ts";

export const scoutingPositions = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const workloadStats: Record<string,string[]> = {
  QB:["pass_attempts","rush_attempts"],
  RB:["snap_share","carries","targets","goal_line_touches"],
  WR:["route_participation","routes","targets","target_share"],
  TE:["route_participation","routes","targets","target_share"],
  K:["field_goal_attempts"],
  DEF:["pressures","sacks"],
};

export function scoutPlayer(snapshot: Snapshot, player: PlayerInput, research: Research | null, now: number, unavailable = false) {
  const season = snapshot.league.season;
  const cutoff = now;
  const games = (player.history ?? []).filter(game => game.source && Date.parse(game.source.retrieved_at) <= cutoff &&
    Date.parse(game.played_at) < cutoff && (game.season < season || game.season === season && game.week < snapshot.week))
    .sort((a,b) => b.season-a.season || b.week-a.week);
  const current = games.filter(game => game.season === season);
  const windows = [
    { label: "Last 3", games: current.slice(0,3) },
    { label: "Last 5", games: current.slice(0,5) },
    { label: "Last 8", games: current.slice(0,8) },
    { label: "Season", games: current },
    { label: "Previous season", games: games.filter(game => game.season === season-1) },
  ].map(window => {
    const stats = new Map<string, number[]>();
    for (const game of window.games) for (const [key, value] of Object.entries(game.stats ?? {})) {
      const values = stats.get(key) ?? [];
      values.push(value);
      stats.set(key, values);
    }
    return { label:window.label, games:window.games.length, averages:[...stats].map(([stat,values]) => ({
      stat, games:values.length, average:values.reduce((sum,value)=>sum+value,0)/values.length,
    })) };
  });
  const findings = researchForPlayer(research,player.id,player.name).filter(f => Date.parse(f.retrieved_at) <= cutoff &&
    (f.published_at ? Date.parse(f.published_at) <= cutoff : !f.published_date || f.published_date <= new Date(cutoff).toISOString().slice(0,10)));
  const currentFindings = findings.filter(f => {
    const published = f.published_at ?? f.published_date;
    const hours = ["injury","availability"].includes(f.category) ? 48 : 168;
    return published && !expired(published,now,hours) && f.quality !== "low";
  });
  const signals = currentFindings.filter(f => f.player_id === player.id && f.opportunity?.season === season && f.opportunity.week === snapshot.week);
  const supported = signals.filter(f => f.confirmation !== "speculative");
  const directions = new Set(supported.map(f => f.opportunity!.direction));
  const direction = directions.size === 1 ? supported[0].opportunity!.direction : null;
  const scoring = snapshot.analysis_inputs?.scoring;
  const statusRisk = unavailable || player.bye === snapshot.week || /\b(Q|D|O|IR|NA|OUT)\b|questionable|inactive|doubtful/i.test(player.status ?? "");
  const scoringGames = scoring ? current.flatMap(game => {
    if (game.scoring_id === scoring.id && game.points !== undefined) return [game.points];
    try { return game.stats ? [scoreStats(game.stats,scoring)] : []; } catch { return []; }
  }) : [];
  const recentScored = scoring && current.slice(0,3).every(game => {
    if (game.scoring_id === scoring.id && game.points !== undefined) return true;
    try { return game.stats ? Number.isFinite(scoreStats(game.stats,scoring)) : false; } catch { return false; }
  });
  const latestGame = current[0];
  const recentHistory = latestGame && !expired(latestGame.played_at,now,21*24);
  const unresolvedRole = directions.size > 1 || signals.some(f => f.opportunity!.direction !== "stable");
  const canForecast = recentHistory && recentScored && scoringGames.length >= 3 && !statusRisk && !unresolvedRole;
  const mean = (samples: number[]) => samples.reduce((sum,n)=>sum+n,0)/samples.length;
  const projection = canForecast ? (mean(scoringGames.slice(0,3)) + mean(scoringGames))/2 : null;
  const yahoo = player.projection !== undefined && (!snapshot.data_freshness || !expired(observedAt(snapshot,"projections",player.id),now)) ? player.projection : null;
  const delta = projection !== null && yahoo !== null ? projection-yahoo : null;
  const workload = (workloadStats[player.position]??[]).flatMap(stat=>{
    const recent=windows[0].averages.find(row=>row.stat===stat&&row.games===3);
    const earlier=current.slice(3).flatMap(game=>game.stats?.[stat]??[]);
    return recent&&earlier.length>=3?[{stat,recent:recent.average,prior:mean(earlier)}]:[];
  });
  const assessment = direction === "up" ? "Reported role upside. Watch for more work than the Yahoo baseline may reflect."
    : direction === "down" ? "Reported role downside. The Yahoo baseline may overstate the opportunity."
    : projection !== null ? "Average of recent-three and season game scoring under the imported league rules."
    : workload.length ? "Compare the last three games with earlier workload to gauge whether the Yahoo baseline is sustainable."
    : "Current evidence does not establish a dependable change in expected opportunity.";
  const risks = [
    ...(!scoring ? ["Verified custom scoring rules are missing."] : []),
    ...(scoring && (!recentScored || scoringGames.length < 3 || !recentHistory) ? ["Three recent, completely league-scored games are required for a numeric estimate."] : []),
    ...(statusRisk ? ["Current game availability is uncertain or restricted."] : []),
    ...(unresolvedRole ? ["A changed, speculative or conflicting role makes historical scoring an unreliable forecast."] : []),
    ...(projection !== null ? ["Historical estimate assumes similar usage. Matchup, weather and team environment are reviewed as evidence only."] : []),
    ...(!currentFindings.length ? ["No current attributable external report."] : []),
  ];
  return { projection, yahoo, yahoo_baseline:player.projection??null, delta, direction, assessment, risks, windows, workload, sample_size:scoringGames.length,
    workload_reference:current.slice(0,3).every(game=>game.stats?.snap_share!==undefined) && current.length>=3
      ? mean(current.slice(0,3).map(game=>game.stats!.snap_share)) : null,
    sources:[...new Map(games.map(game=>[game.source!.url,game.source!])).values()],
    historical_at:games.map(game=>game.source!.retrieved_at).sort().at(-1)??null,
    research_at:currentFindings.map(f=>f.retrieved_at).sort().at(-1)??null,
    evidence:findings.map(f=>f.id), current_research:currentFindings.length>0,
    recent_usage:currentFindings.some(f=>["usage","workload","depth_chart"].includes(f.category)) ||
      !!recentHistory && current.some(game=>Object.keys(game.stats??{}).some(stat=>/snap|route|target|attempt|carr|sack|pressure|touch/.test(stat))),
    supported:projection!==null || supported.length>0 || !!recentHistory&&workload.length>0 || currentFindings.some(f=>f.confirmation!=="speculative" && ["workload","usage","depth_chart","matchup","performance"].includes(f.category)),
    confidence: projection!==null && scoringGames.length>=8 && currentFindings.length ? "medium" as const : "low" as const };
}
export type ScoutingEvaluation = ReturnType<typeof scoutPlayer>;

export function scoutingPool(snapshot: Snapshot, players: Evaluation[], scouting: Record<string, ScoutingEvaluation>) {
  const available = new Set(snapshot.analysis_inputs?.available_ids ?? Object.keys(scouting));
  const candidates = players.filter(p=>available.has(p.id) && !p.unavailable && !p.locked);
  const added = new Set(snapshot.refresh_changes?.newly_available ?? []);
  const rank = (a:Evaluation,b:Evaluation) => (b.projection ?? -Infinity)-(a.projection ?? -Infinity) || a.name.localeCompare(b.name);
  return Object.fromEntries(scoutingPositions.map(position=>{
    const pool = candidates.filter(p=>p.position===position);
    const breakouts = pool.filter(p=>scouting[p.id]?.direction==="up" || (p.opportunity_trend??0)>0 || added.has(p.id))
      .sort((a,b)=>Number(scouting[b.id]?.direction==="up")-Number(scouting[a.id]?.direction==="up") ||
        (b.opportunity_trend??0)-(a.opportunity_trend??0) || rank(a,b));
    const ordered = [...new Set([...breakouts.slice(0,2), ...pool.sort(rank).slice(0,5), ...breakouts.slice(2,3)])];
    return [position,ordered.map(p=>p.id)];
  }));
}
