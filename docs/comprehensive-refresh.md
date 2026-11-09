# Refresh Fantasy GM Data

“Refresh Fantasy” is an alias for this complete workflow. The assistant performs the collection when asked; no scheduled automation or unattended scraping is configured. The computer and authorized browser session must be available. The owner signs in personally when required.

## Collection checklist

1. Confirm Yahoo league, season, week and owner. Read settings, scoring, roster slots, waiver/FAAB settings, transaction restrictions, trade deadline/review and playoffs. Preserve exact displayed rules. A playoff-game tiebreaker is not proof of a qualification tiebreaker.
2. Open every team roster, including all offense, kicker, defense, bench and IR tables. Match player-row counts to unique Yahoo IDs. Record each team's capture time and Complete/Partial/Missing/Failed status. Ten names alone do not prove ten complete rosters.
3. Read complete standings and visible FAAB balances. Open every team's schedule selector; collect current and all remaining regular-season games. Check each pairing appears reciprocally and each team plays once per week. A future opponent without a projection is still valid schedule data; leave projections absent.
4. Open available QB/RB/WR/TE/K/DEF separately, sort by the current week's projection, and follow pagination. Record pages, counts, whether more pages remain, and ordering. Prefer at least 50 per offensive position and all available K/DEF; expand when needed. Never claim a bounded pool is exhaustive.
5. Read recent transaction pages, trade history and visible FAAB results. Distinguish accepted waiver additions from unsuccessful offers. Keep unknown bids absent. When the display lacks a verified timezone, use `at:null` plus `displayed_at`; never invent a timestamp.
6. Research the owner roster, opponent roster, top available candidates and prospective trade partners. Maintain an explicit target-ID list and a checked-ID list. Review official team/NFL reports first, followed by accessible reporting and statistical providers. Check season, week, matchup and publication freshness—not just page titles. Record access restrictions; never bypass them. A name absent from an injury article is not proof of health.
7. Preserve each finding's Yahoo ID, source, HTTPS URL, factual paraphrase, publication timestamp or null, actual retrieval timestamp, category, quality and confirmation. Deduplicate. Use short original summaries and respect provider reuse limits. Missing publication time prevents numeric modeling; do not substitute retrieval time. Sources with only a date or unverified timezone can preserve their displayed date in source notes.

Do not click Yahoo lineup, add/drop, bid, trade, watchlist or other transaction controls. Never use the unapproved Fantasy Sports API. Raw browser captures may contain account details or action credentials: keep them only in ignored `private/` and strip such URLs before producing structured artifacts.

## Versioned private bundle

The JSON envelope is `{schema_version:1,snapshot,research,collection}`. `snapshot` is the existing version 2 contract; `research` is the existing version 1 contract with nullable publication timestamps. `collection` is defined in `lib/fantasy/coverage.ts` and validated by `parseRefresh` in `lib/fantasy/refresh.ts`. Input is limited to 1 MB; stored combined analysis/history is capped at 3 MB. No source data belongs in GitHub, `public/`, or a build artifact.

Use the authenticated dashboard's **Data Coverage → Import comprehensive refresh & history**. It sends the envelope to owner-only, same-origin `POST /api/manual/refresh`. Validation rejects inconsistent identities, duplicate ownership, malformed evidence and credentials. One conditional private-store write saves Yahoo, research, coverage, prior analysis and persistent strategies together. Blob reads request identity encoding so compare-and-swap uses the strong ETag. Concurrent updates are never overwritten blindly.

A partial league/standings/settings collection retains the entire prior valid Yahoo snapshot with its original date; attempted counts are labeled separately. A missing research snapshot retains prior research; partial new research retains earlier player/category/source findings and their original timestamps. Numeric effects still require recent dated credible evidence. Missing data is never converted into zero.

The import is followed by an authenticated GET of its receipt and a separate verification POST, which reads the active source again. Only a hosted deployment marks `deployed_read_verified_at`; local QA does not establish production availability. Check the same imported source through `/api/manual/snapshot` and `/api/analysis`, then refresh the dashboard. An import receipt alone is not end-to-end success.

Failed validation/save attempts are recorded without replacing successful data or analysis. The latest 50 attempts appear in the state/UI; individual receipts are archived privately under `refresh-history/`. A total storage outage may prevent recording the attempt; the UI must report failure and never imply success. Legacy snapshot imports are blocked once a comprehensive bundle is active to prevent split sources.

## Coverage and analysis

Roster denominator is the ten expected team IDs. Schedule denominator is five games per week from the current week through the week before playoffs. Research target coverage measures only the explicit checked target list; it is not a percentage of all possible news/statistics. Available-player coverage describes the chosen pages and exhaustion status. Reports show transaction rows separately from individual add/drop records, visible balances, accepted bids, publication gaps, restricted sources and readiness.

**Refresh Analysis** remains separate. It reads saved Yahoo/research/settings, recalculates, and advances the analysis timestamp only after a successful conditional save. It never browses Yahoo or news sites. Undated research remains qualitative. Current and remaining opponents display even when future projections and playoff odds are unavailable. Trades use opposing rosters; weekly projection screens are low confidence when ROS values are absent. Skill-player-for-K/DEF suggestions require season-value evidence.

Before declaring completion, verify counts and player identities in the hosted owner session, confirm all three source/analysis dates, confirm evidence reaches player intelligence, and check on a narrow phone viewport. Confirm signed-out requests cannot read data. Code deployment remains a separate owner approval.

## Daily targeted mode

The default `Refresh Fantasy` workflow can now use a current-week comprehensive baseline plus explicit daily deltas, rather than repeating the full checklist. Use weekly comprehensive collection for a new week, an expired baseline, changed rules, or uncertain ownership. See [personalized available players and refresh modes](personalized-available-and-refreshes.md) for the daily contract, collection priorities, original-date retention and mandatory critical injury scans. Data Coverage imports both formats and offers a saved-data collection plan. Refresh Analysis never collects sources.

## Tuesday finalized results and pregame archive

On the first comprehensive refresh each Tuesday, verify the previous week is actually final in Yahoo, collect its final matchup, all archived owner starters and eligible bench outcomes, any available shortlist outcomes/verified claims, and all ten final standings. Add the optional `final_results` array to the comprehensive import; the Weekly GM Review is generated from the immutable decision archive. If games or results remain pending, preserve that status. Collect verified kickoff metadata before the new week begins and run Refresh Analysis to freeze the new recommendations. Corrections append versions; no past prediction is reconstructed. See [the result contract and full workflow](weekly-gm-review.md). This adds no automatic web collection or Yahoo transactions.
