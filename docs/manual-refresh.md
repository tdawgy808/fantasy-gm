# Manual Yahoo refresh

This workflow reads Yahoo website pages using an already authorized browser session. It does not call the Fantasy Sports API. No transactions are part of a refresh.

For the local app, the operator may copy the latest validated JSON to ignored `private/snapshots/current.json`. On opening the dashboard, the authenticated owner can receive this local refresh automatically. The server endpoint is owner-protected, uses a fixed path, validates the file and disables itself on Vercel or a non-loopback configured origin. Hosted operation continues to use browser file selection. No snapshot is embedded in the public source or build.

1. Ask the assistant to refresh Fantasy GM, information gathering only. Sign in yourself when needed.
2. Read the selected league's My Team, Matchups, League standings, Scoring & Settings, and Players pages. Reload stale pages and verify the season and week. Record source URLs, capture time including offset, injuries, actual/projected points, FAAB, waiver dates, scoring, and collection limits.
3. Save a version 1 JSON snapshot outside the public repository, under ignored `private/snapshots/`. Include all required fields described below. Use null or omit unknown optional values; do not silently reuse stale data. Never include passwords, OAuth tokens, cookies, session IDs or account details.
4. Optionally run `npm run snapshot:import -- "path/to/snapshot.json"` to validate and archive a uniquely named local copy. Existing archives are never overwritten.
5. Sign in as the approved owner, open `/dashboard`, choose the JSON file, and review the roster, matchup, standings, scoring and availability. File selection reads the file locally in this tab; no upload or Yahoo request occurs. Data is cleared on reload. Load a newer file for the same league, season and team to compare roster, status and FAAB changes. Older snapshots are rejected until the view is cleared.
6. Recheck injury news and lock times before any decision. Recommendations require separate review; never click lineup edits, Start Active Players, add/drop, claim, bid or trade controls during a refresh.

The capture itself is manual browser work, not a button that scrapes Yahoo. Collection coverage must be explicit; a sampled player list is not a complete waiver review.

## Snapshot format

Required: `schema_version: 1`, `captured_at` (ISO timestamp with timezone), `timezone` (IANA timezone), `method`, `league: {id, season, name}`, `team: {id, name}`, `week`, `sources` (map of credential-free HTTPS Yahoo league URLs), and nonempty `roster` (objects with `slot` and `name`). Optional roster values include `team`, `position`, `status`, `opponent`, `bye`, `projection`, `actual` and `game_status`. Team values may include `faab_remaining`, `record` and `rank`.

Optional `matchup`: `opponent`, `score`, `opponent_score`, `live_projection`, `opponent_live_projection`, and `win_probability` (0–1). Additional sections: `standings`, `standings_columns`, `scoring`, `rules`, `available_players`, `available_columns`, `available_player_scope`, `quality_notes`. Inputs are capped at 1 MB and credential/session fields are rejected even in extension sections.

`standings` rows use exactly `[rank, team, record, points_for, points_against, streak, faab, waiver_priority, moves]`. Available-player rows use `[name, position, status_display, weekly_projection]`. Optional `injury_notes` entries contain `player`, `summary`, `updated_at` (ISO timestamp), and optional `source_url` (a credential-free Yahoo Sports page). Do not treat missing injury reports as proof of health.

## Future approved API

`lib/fantasy/snapshot.ts` defines the `Snapshot` contract and `FantasyDataProvider`. An approved API adapter should normalize to the same versioned contract and validation rules, preserve provenance and freshness, and operate server-side with the existing OAuth sessions. Keep the manual adapter as a fallback. The existing API test route is guarded by `YAHOO_FANTASY_API_ENABLED=false` by default. OAuth login alone does not imply Fantasy API approval.

Before API enablement: confirm Yahoo approval and scopes, implement token refresh/expiry cleanup, harden state consumption and callback failure handling, and choose an authenticated private data store if hosting beyond local development. No transaction endpoints are provided.
