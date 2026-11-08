# Dashboard summaries

The dashboard opens on GM Summary. It shows the imported Yahoo full-game forecast, up to three ranked decisions, meaningful changes and compact freshness/coverage information. Open Daily Briefing for lineup, player intelligence, waivers, FAAB, trades, upcoming opponents and playoffs. Each recommendation leads to its analysis; View Evidence & Sources exposes reports, dates, confidence, adjustments and model limits. All imported research records remain accessible under Data and model limitations.

Refresh Analysis retains its original behavior: it recalculates from private saved imports and settings. It does not browse Yahoo or submit transactions. No new account connection, environment variable or AI provider is required.

## Change tracking

A deterministic summary baseline is saved atomically with each successful analysis. It compares roster membership, normalized availability, starting assignments, same-week projection moves of at least one point, the leading meaningful waiver upgrade, strategies and credible current availability/workload evidence. Refresh timestamps and importer-generated finding IDs are excluded from research identity. Repeating unchanged analysis clears the changes list. Failed calculations or saves leave the last successful result and baseline intact. The first calculation after upgrading establishes research comparison history without labeling older reports as new.

Recommendations are suppressed when Yahoo/analysis is over 24 hours old or inputs require recalculation. Research staleness and partial coverage remain visible; recently retrieving an older report does not make its publication current. Summary wording is derived from the existing engine; it does not change rankings or scoring.

## Verification

Run `npm test`, `npm run lint`, `npm run build` and `npm run check:publish`. Use synthetic fixtures in source control; real league imports, screenshots and local authentication helpers belong in ignored private storage. Review at an iPhone-size viewport and desktop width. Verify Summary → Briefing → Evidence, coverage access, unchanged refresh behavior and existing import/settings paths. Production deployment requires separate owner approval.
