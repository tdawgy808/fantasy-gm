# Weekly GM Review

The Summary links to a private, mobile Weekly GM Review. Five short sections cover the result, supported successes, possible mistakes, uncertainty, and next steps. Player comparisons, sources, diagnostics and revisions are expandable. The existing owner login and private Blob storage are reused. No new account or environment variable is needed; no Yahoo transaction, scheduled collection or model-weight change is introduced.

## Capture before games

Every successful Refresh Analysis archives changed inputs and the complete resulting analysis: Yahoo starters, recommended lineup, bench, projection assumptions, risks, evidence, strategy, swaps, waiver rankings and bid ranges. The archive is a private content-addressed object, created without overwrite; the state index updates with the same conditional save as the analysis. Unchanged inputs do not create duplicate decisions. Failed saves do not advance the visible index. An unreferenced object after a concurrent-save rejection is harmless and never becomes a published decision.

Include verified timing in the snapshot when collecting a pregame baseline:

```json
"review_context": {
  "first_kickoff_at": "2026-11-13T01:15:00Z",
  "source_url": "https://www.nfl.com/schedules/",
  "player_kickoffs": { "stable-yahoo-player-id": "2026-11-15T18:00:00Z" }
}
```

These dates illustrate the format; collect the actual schedule rather than copying them. Record offsets/time zones. `first_kickoff_at` must be the earliest league-relevant kickoff for that fantasy week. Individual kickoff times are required to grade unlocked players in an in-week revision. Keep Yahoo started/completed flags and actual points. Recorded or kickoff-derived locks cannot be reversed by a retrospective. Unknown timing means insufficient evidence, never an invented pregame record.

The primary review uses the earliest verified pregame record, falling back to the earliest archived in-week/unverified record with explicit limitations. All revisions remain available by their private references. A later, more favorable decision cannot silently replace the primary record in multiweek metrics.

## First comprehensive refresh on Tuesday

Continue the existing ten-roster, available-player, standings, schedule and FAAB collection. Additional collection is limited to the previous week's finalized matchup, all starters and eligible bench player scores/statistics on the archived owner roster, final starters and all ten standings. Check outcomes for the archived waiver shortlist when available; do not research the whole free-agent pool again. Record accepted claims/bids with verified times if evaluating acquisition outcomes. Injury/usage explanations are optional sourced postgame evidence, kept separate from decision grading. Reuse already-collected pages and valid history.

Never assume Tuesday means Yahoo has finalized the games. If scores or games are still pending, import a pending record or leave the review pending. Include `final_results` (array, up to 18 records) in the existing schema-1 comprehensive refresh JSON. Daily schema-2 imports do not finalize results. The import saves the results/review index atomically with the source bundle. Standalone results/corrections can also be uploaded under Weekly GM Review → Results imports & review revisions; they do not require replacing the current Yahoo snapshot.

Each result has the shape below. This is a **synthetic** one-slot example; real imports need the complete final lineup, matching IDs, owner total, all eligible historical bench outcomes and ten standings rows.

```json
{
  "schema_version": 1,
  "season": 2026,
  "week": 8,
  "league_id": 121612,
  "team_id": 5,
  "collected_at": "2026-11-03T15:00:00Z",
  "finalized_at": "2026-11-03T14:00:00Z",
  "status": "final",
  "all_games_complete": true,
  "sources": ["https://football.fantasysports.yahoo.com/f1/121612/5"],
  "score": {"owner": 12, "opponent": 10, "opponent_id": 2, "opponent_name": "Synthetic opponent"},
  "actual_lineup": [{"slot": "RB", "player_id": "example-starter"}],
  "players": [{"id": "example-starter", "name": "Synthetic starter", "points": 12}],
  "standings": {"captured_at": "2026-11-03T15:00:00Z", "teams": [{"team_id": 5, "rank": 5, "record": "4-4-0"}], "qualifiers": 6},
  "notes": ["Synthetic partial example; not a real league result."]
}
```

`points: null` means missing, not zero. `stats` is an optional numerical stat map. Optional `participation` is `played`, `inactive` or `unknown`; enter it only if directly verified. A pregame unavailable prediction can be compared with this observation. Snap-share error requires the same 0–1 `snap_share` measure in frozen `projected_stats` and final `stats`; without both, workload accuracy remains unavailable. Optional `transactions` contain `player_id`, `team_id`, `bid` (number or null), and `at` (zoned timestamp or null). Omit transactions if coverage is unavailable; an explicit array means the collector checked that week's transactions. Optional `postgame_research` uses the existing sourced research format. It explains outcomes but cannot modify the frozen decision inputs or decision-quality grades. Never include credentials, session data or OAuth details.

Corrections need a newer `collected_at` and append a result/review version. Re-importing identical results is idempotent. Regenerate reuses stored outcomes and the original decision; no research occurs. Earlier review versions remain selectable. Data Coverage reports review readiness for the previous week; partial coverage is visible in the review. The future approved Yahoo adapter can submit the same validated result structure and invoke the same generation service.

## Interpretation and model changes

Best legal lineup is calculated with only decision-time ownership, eligibility, IR/unavailable status and locks. Missing eligible bench points or unknown timing suppress the optimum and regret. Waiver candidates cannot inflate this total. Gains compare the recommendation with the originally recorded starters; a different final roster makes that a counterfactual, not proof that following advice would have caused a win. Injury/workload accuracy remains insufficient unless actual participation or comparable usage supports it; points alone cannot establish that diagnosis. FAAB production per dollar is descriptive, not an estimate of marginal return or the optimal winning bid.

Projection error is actual minus forecast. Locked results never count as forecasts. Model versions are retained; multiweek counts use one latest primary review per season/week, excluding pending results and alternate decisions. Calibration excludes Yahoo odds, ties and changed final lineups; at least 20 independent supported weekly engine probabilities are needed before reporting Brier score/bins. A residual is not automatically random variance or a controllable error.

Tuning proposals require at least four distinct weeks, 30 verified player forecasts for the same position/model version, absolute bias of at least two points, and bias exceeding two standard errors. This is an investigation threshold, not approval to change weights. `weekly-backtest.ts` provides read-only chronological replay of archived inputs against an explicitly versioned candidate, with separate training/held-out metrics. It never supplies outcomes to the candidate. At least eight independent timed weeks are suggested for an adoption evaluation; freeze candidate design before inspecting held-out results and inspect injury handling and lineup legality as well as error. Human approval remains required. No historical pregame predictions are fabricated to fill missing weeks.

## Verification

Run `npm test`, `npm run lint`, `npm run build`, and `npm run check:publish`. Weekly tests cover immutable histories, conditional-save failure, postgame separation, unknown timing, kickoff-derived locks, legal roster constraints, missing outcomes, corrected results, idempotency, independent-week thresholds and calibration gating. Local route/browser QA uses synthetic data, loopback-only test authentication, and restores the prior local state. Production remains unchanged until approved.
