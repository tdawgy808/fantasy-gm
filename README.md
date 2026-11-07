# Fantasy GM

Fantasy GM is a personal, noncommercial Yahoo Fantasy Football assistant intended for one user's own leagues.

## Project status

This project contains a local Next.js application with Yahoo OAuth and a manual, read-only snapshot dashboard. Fantasy Sports API access remains disabled by default pending Yahoo approval. Manual collection reads Yahoo website pages; it does not use the Fantasy Sports API.

## Planned features

- **Read-only league analytics:** Review authorized league settings, rosters, standings, matchups, and available player statistics.
- **Lineup recommendations:** Suggest starters and bench options based on league scoring, roster eligibility, and available data.
- **Waiver analysis:** Evaluate available players and potential pickups against the user's roster needs.
- **Trade analysis:** Compare proposed trades and their potential effect on roster balance and team performance.

All recommendations are advisory. The user makes and submits any lineup changes, waiver claims, or trades directly in Yahoo Fantasy Football. The application will not automatically change rosters or execute transactions.

## Intended use and access

- One user, for personal use in leagues they are authorized to access.
- Noncommercial: no paid service, advertising, or resale of Yahoo data.
- Request read-only Fantasy Sports access and retrieve only the data needed for the features above.
- No public user registration or distribution of private league data.

## Privacy and credentials

Yahoo authorization will use OAuth. Client secrets, access tokens, refresh tokens, authorization codes, and private league data must remain outside this public repository. Keep secrets in local environment variables or another private credential store. Do not commit environment files, credential files, API responses, or logs containing personal data.

The public repository contains source code and documentation only. Authentication data, private league snapshots, development certificates, dependencies, and generated output are excluded. The original app and its local credentials remain separate and unchanged.

## Local development

Use Node.js 22.18+ or a newer supported Node LTS. Run `npm ci`, then `npm run dev` and open `/dashboard` to import a locally gathered snapshot JSON file. No credentials are needed for manual review. Files stay in the browser tab and are cleared on reload.

For OAuth development, copy `.env.example` to `.env.local`, fill in your own Yahoo configuration, and keep the API flag false until approval. OAuth cookies are secure and require HTTPS: run `npm run dev -- --experimental-https` and use the exact HTTPS callback registered with Yahoo. Locally generated certificates remain ignored. The original app's credentials and certificates are deliberately not copied into this source migration.

Sessions are held only in server memory and disappear when the process restarts. Token refresh is not yet implemented. This is a local personal-development app, not a production authentication service. The dashboard does not claim a verified OAuth connection just because it was opened.

## Manual refresh and checks

See [the manual refresh workflow](docs/manual-refresh.md) for collection, import, validation, and the future API adapter boundary. Run `npm test`, `npm run lint`, and `npm run build` to validate changes. `npm run check:publish` scans an explicit source allowlist and verifies private-file exclusions; its local manifest is written under ignored `private/migration-review/`. Publish only the reviewed manifest, never a whole folder upload.

Git ignore rules do not remove previously tracked files. Recheck the Git index or the exact upload manifest before every publication. No snapshot files or real environment files belong in Git.

## Disclaimer

Fantasy GM is an independent personal project and is not affiliated with or endorsed by Yahoo or the NFL. API use is subject to Yahoo's applicable terms and approval. Recommendations do not guarantee fantasy outcomes.
