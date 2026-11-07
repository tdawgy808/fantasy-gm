# Fantasy GM analysis engine

This extends the existing Next.js application. Production is not changed by importing a source file into GitHub. Deploy only after owner approval. The existing owner authentication, manual Yahoo adapter, private Blob snapshot, responsive dashboard and disabled Yahoo API routes remain. There are no Yahoo write permissions or transaction endpoints.

## Operations and persistence

1. **Yahoo collection:** Work reads authorized Yahoo website pages and creates a dated version 1 or 2 JSON snapshot. The existing authenticated `/api/manual/snapshot` import stores it privately. The localhost handoff remains available only on localhost.
2. **Research collection:** Work collects permitted, attributed research separately and creates a research JSON snapshot. In Daily Briefing → Strategy settings & research imports, choose **Import research & save privately**. Each finding needs source, publication/retrieval times, player identity and evidence labels. No live external provider is configured. The ResearchProvider interface can receive an authorized feed later; it is not a generic scraper or a paywall bypass.
3. **Analysis calculation:** Press **Refresh Analysis**. `/api/analysis` reads the latest saved Yahoo snapshot, research and strategy settings. It never requests Yahoo or provider news. It validates inputs, computes deterministic recommendations, checks that the Yahoo snapshot did not change, and saves the result using an ETag compare-and-swap. Only a successful save advances the analysis timestamp. Errors retain previous saved results.
4. **Phone review:** Open the app, sign in, and select Briefing. Source timestamps and the last successful calculation are separate. Changed settings or imports show a recalculation prompt. The calculation's selected strategies are displayed alongside recommendations so old results cannot look like a new strategy was applied.

All settings, research and analysis are stored together in the existing **private** Vercel Blob store at a separate fixed `analysis-state.json` path. No new database account or dependency is required. The existing `BLOB_READ_WRITE_TOKEN` (server only) or managed `BLOB_STORE_ID`/OIDC credentials are sufficient. The state is capped at 1 MB. Blob calls use private access, uncached reads and conditional writes. The API requires owner authentication; writes also require the exact application Origin and JSON content type. Imported request streams are limited to 1 MB before JSON parsing. Provider errors are not reflected into responses.

Local production-build testing uses ignored `private/analysis-state.json` only when the configured APP_ORIGIN is loopback and VERCEL is unset. There is no hosted filesystem fallback. The queue serializes local process writes; it is not a distributed database. Production uses durable Blob ETags. Production and local OAuth credentials remain separate.

The current hosted app continues serving the previous release until this change is approved and deployed. Existing stored Yahoo data is backward compatible; no migration or production-data upload is needed just to review this code.

## Versioned Yahoo contract

Version 1 retains the existing imported shape. Version 2 uses the same required base fields and adds `analysis_inputs`. See the synthetic `docs/snapshot-v2.example.json` and TypeScript definitions in `lib/fantasy/inputs.ts`. Unknown facts should be omitted, not invented. Preserve the real collection time, week, coverage and source links. Do not re-date old data as newly collected.

Version 2 inputs support explicit player IDs, eligibility, normalized scoring, raw projected stats, historical stats or compatible fantasy points, all team rosters/balances, available IDs, opponent identity, sourced correlations, current records, remaining schedules, playoff rules and transactions. Player IDs and ownership must be unique. When the owner team roster is supplied it must agree with the base roster. Player names without IDs in legacy data are matched exactly, case-insensitively, rather than fuzzy-matched.

### Scoring

`scoring: {id, complete: true, rules: [...]}` is an explicitly reviewed normalization of league rules. Each rule has `stat`, `points` per unit, optional non-overlapping `bands`, and optional `bonuses` with an explicit `bonus_mode` of `cumulative` or `highest`. Record every required stat, including explicit zeroes. Missing stats cause scoring to reject that observation. The old snapshot's ambiguous bonus-stacking note is not treated as verified normalized scoring.

Imported Yahoo fantasy-point projections are already league-scored and are never rescored. A complete projected raw-stat line may be scored with the normalized rules, labeled as an estimate; nonlinear bonuses at average projected stats are not exact expected points. Historical fantasy points are usable only when their `scoring_id` matches; raw history is rescored under the supplied rules. Future observations are excluded. Keep histories chronological; the engine sorts them and retains at most 20 compatible observations.

## Research contract

`{schema_version:1, collected_at, mode:"manual", findings:[...]}`. An empty findings example is included in `docs/research.example.json`. The synthetic test fixture demonstrates a finding and is explicitly fictional; never import it as real news.

Each finding requires `id`, `player` (and preferably `player_id`), `source`, credential-free HTTPS `source_url`, `published_at`, `retrieved_at`, `claim`, `category`, `quality` (`high|medium|low`) and `confirmation` (`confirmed|reported|speculative`). Categories: injury, availability, workload, usage, depth_chart, performance, matchup, expert, news. Publication cannot follow retrieval; retrieval cannot follow collection. Times must be real and not in the future. Allowed domains: NFL.com, ESPN.com, FantasyPros.com, Rotowire.com, Pro-Football-Reference.com, PFF.com, Sports.Yahoo.com, NBCSports.com, CBSSports.com and APNews.com, including subdomains. This allowlist validates provenance format; it does not grant provider access or licensing.

Exact repeated player/source/claim findings are deduplicated. Multiple reports of the same effect do not stack adjustments. Conflicting modeled effects are displayed and suppressed unless a confirmed official NFL report takes precedence. Textual claims remain visible for owner review; no language model determines facts or numeric effects.

Optional `effect` is an **explicit imported estimate** with `week`, `season`, `rationale`, and `projection_multiplier` (0–1.5) and/or `unavailable`. It is not inferred from free text. Only current-week, medium/high quality, non-speculative findings published within 48 hours may adjust a model. A confirmed unavailable finding may exclude an unlocked player. A multiplier scales the projected mean and empirical deviations; that is a transparent assumption, not a medical or workload probability. A questionable tag alone never invents an injury discount. News age and contradictions remain visible.

No provider credentials, licensing subscriptions or AI explanation service are currently connected. NFL.com/ESPN/FantasyPros/Rotowire/PFR/PFF are examples of supported source attribution, **not connected feeds**. Live Refresh NFL News is intentionally unavailable. No AI API key is needed; explanations are deterministic templates tied to computed evidence. A later configured AI explanation layer must consume verified results and citations without fabricating inputs.

## Algorithms and practical limits

### Lineup

Dynamic programming assigns unique available players to legal roster slots; started games/actual-point players remain fixed and IR/bye/out/inactive/doubtful players are excluded from unlocked assignments. A complete legal lineup is required; it does not call a partial lineup optimal. Explicit multi-position eligibility and FLEX/SUPER_FLEX are supported. The search retains up to 24 candidates per slot mask and supports up to 12 starting slots/40 roster players. This is a bounded search, not a proof of globally optimal simulated win probability.

Safe scores supported historical 20th percentiles, Aggressive scores 80th percentiles, and Matchup-Aware initially scores expected points. With a complete opponent lineup and eight compatible historical games per unlocked player, 3,000 seeded empirical bootstrap trials compare candidate win rates; Matchup-Aware selects the highest. Trials share seeded draws to compare alternatives. Supplied, sourced pair correlations use a Gaussian-copula Cholesky construction; invalid/non-positive-definite matrices disable simulation. Without correlation evidence, independence is disclosed. Locked players need actual points. Empirical histories are shifted to current projections; supported research scales the mean and spread. Results are uncalibrated estimates, rounded in the UI, not verified winning chances. Yahoo's own imported win estimate is labeled separately. Without distributions, projection fallback is explicit and risk strategies can legitimately give the same result.

### Waivers and FAAB

All imported available players are inspectable; the briefing shows ten. Rank relative to an eligible unlocked starting slot, using immediate gain and, when supplied, future/ playoff projections and normalized opportunity trends. Win Now weights immediate gain; Balanced includes future/trend evidence; Upside emphasizes it. Missing ROS, schedules and usage are shown as unavailable. This is a one-player slot comparison, not a claim of global roster improvement.

FAAB is a bounded budget-allocation heuristic: gain relative to remaining NFL weeks, current urgency, imported rival needs and balances, and a limited adjustment from at least five observed successful add bids. Ranges and estimates respect remaining balance and imported increments. No observed winning-bid price is extrapolated as certainty. Estimates remain low confidence. Minimums not imported must be checked manually. A zero suggested bid with a positive minimum is a watch-only recommendation, not a valid claim. Bench-drop candidates are unlocked lowest-modeled-value candidates; depth, future byes and handcuffs require human review. Individual bids are alternatives; their sum is not an authorized spending plan.

### Trades

Screen one-for-one exchanges across imported team rosters; recompute legal starting lineups for both sides and require at least 0.5 modeled points of improvement for each. The top five are presented if any qualify. Locked/inactive/IR players are not proposed. Win Now uses ROS values if present, otherwise current projections; Playoff Focused requires playoff projections. Standings-Aware stays Win Now until a strict mathematical wins lead over rivals' maximum possible wins proves the cut safe. No acceptance probability or complete trade-market optimization is claimed. Deadline timestamps are authoritative; a date-only cutoff is treated conservatively from the start of that local day. No missing deadline means no offers. Incomplete opponent rosters produce an honest data requirement.

### Playoffs

Display current rank, qualification cut and mean opponent projection as schedule-strength evidence when supplied. A season bootstrap is enabled only with complete pre-week records, all remaining regular-season fixtures/projections, eight matching-scoring team-score observations per team and a supported points-for tiebreaker. It uses 3,000 seeded independent team/week residual draws. Started current-week games disable this model; exact unresolved cutoff ties suppress a probability. The current real league's head-to-head tiebreaker is unsupported, so it correctly receives qualitative guidance rather than fabricated odds. Missing playoff projections remain unavailable.

## Verification and release

Run `npm test`, `npm run lint`, `npm run build`, `npm run check:publish`, plus the excluded original-credential audit. Tests include custom scoring, eligibility/locks, strategy-dependent lineup/waiver changes, bootstrap repeatability and unsupported correlations, research provenance/uncertainty, FAAB constraints, deadlines/mutual trades, playoff missing-data guards, versioned imports and refresh persistence/failures/concurrent-source changes. Browser QA should demonstrate a real saved calculation, persistence after reload, strategy invalidation and mobile layout. Keep private snapshots and QA evidence out of the public PR.

After owner-approved deployment: open the unchanged production URL on the phone, sign in, confirm the saved Yahoo time, import authorized research if available, press Refresh Analysis, confirm the successful-analysis time, change one strategy and observe the recalculate prompt, recalculate, then reload and verify persisted settings/results. Try anonymous API access (401) and cross-origin writes (403). Do not claim hosted verification until the approved build is actually deployed.
