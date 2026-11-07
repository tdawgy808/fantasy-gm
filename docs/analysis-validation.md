# Analysis release verification

This release is prepared for owner review. It has not replaced the existing production deployment.

## Completed checks

- 43 automated tests passed, including existing OAuth/authentication/manual-import regressions and the new engine cases.
- ESLint passed without warnings after cleanup.
- Next.js production build and TypeScript checks passed.
- Publication allowlist and private-path exclusions passed. The separate audit confirmed the original Yahoo credentials are absent from published files and the underlying Yahoo OAuth flow remains preserved.
- Local production HTTP checks verified owner-only analysis, anonymous 401, cross-origin 403, persisted strategy/research/result state, recalculation invalidation and failed-import timestamp retention.
- A real previously imported Yahoo snapshot and its previously captured sourced injury notes were used in the local demonstration. No claims of newly collected Yahoo data or news were made.
- Browser clicked Refresh Analysis, observed the saved success timestamp advance, changed lineup strategy, observed the recalculation prompt, recalculated, then reloaded and verified persisted strategy/results.
- The 390 px phone viewport had no horizontal overflow. The primary Refresh Analysis control appears above the former dashboard metric grid. The viewport override was reset after testing.

The local browser harness lives under ignored `private/`, uses a random test owner key, and is accessible only over loopback. It is not an authentication bypass in the application and is not included in publication.

## Data-dependent limits

The currently saved legacy snapshot enables projection-based legal lineups, sourced injury review, roster-relative waiver comparisons, low-confidence budget-constrained FAAB estimates and qualitative standings guidance. It lacks the complete other-team rosters, normalized historical scoring, complete remaining schedule and supported tiebreaker inputs needed for advanced real-league simulations and proactive trade candidates. Those paths are verified with explicitly synthetic fixtures, not represented as verified live forecasts.

The season model currently supports points-for tiebreakers, not head-to-head tiebreakers. No automated external feeds or AI services are connected. All named research providers require authorized access or permitted manual collection; the allowlist is not a license. No dependency or environment-variable additions are required for this manual release. The inherited eight moderate development-tool advisories remain documented from the earlier deployment.

## Release gate and phone check

After the owner approves deployment, merge the reviewed change and deploy that exact commit using the existing project and production variables. Retain the private Blob store and existing Yahoo snapshot. Do not upload private league JSON to GitHub. Then verify hosted GET/POST analysis routes, sign in on the phone, open Briefing, press Refresh Analysis, confirm all three source/calculation times, change a strategy, recalculate, and reload. Verify a signed-out request cannot read analysis or research. Live deployment verification remains pending until that approved release exists.
