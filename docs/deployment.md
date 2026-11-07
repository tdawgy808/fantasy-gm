# Private Fantasy GM MVP — Vercel Hobby preparation

No deployment has been performed. `vercel.json` sets `git.deploymentEnabled` to false to prevent automatic deployments from this change. Do not remove that guard or manually deploy until the owner approves. Vercel project import can itself start a deployment; defer importing the project until approval too.

## What works without a database

The MVP is a Node.js/Next.js app with a responsive dashboard, validated manual JSON import, roster, weekly matchup, league standings, player search/filtering, FAAB, injury tags/reports and projection-based lineup advice. Imports are read locally in the browser tab and are lost on reload or sign-out navigation. Keep the JSON files privately for reimport; Export JSON downloads the current snapshot. There is no automatic Yahoo refresh, scraping endpoint, browser storage persistence or server snapshot upload.

Owner authentication uses GitHub OAuth with PKCE S256, followed by a signed, eight-hour HTTP-only, SameSite=Lax, host-only cookie. Hosted operation requires HTTPS and secure cookies. The owner's immutable numeric GitHub ID is checked server-side after OAuth and on every protected request. No GitHub access token is stored. Login state and the random PKCE verifier are signed in an HTTP-only browser-bound cookie that expires after ten minutes; GitHub authorization codes are single-use. Logout is POST-only and requires an exact Origin header. Rotating the signing secret or changing the allowed ID invalidates existing sessions.

The proxy rejects unauthorized APIs with 401 and redirects pages to sign-in. The dashboard and each existing Yahoo route also check the owner server-side. There is no authentication bypass or public user registration. App sign-in is separate from Yahoo authorization and from the ChatGPT GitHub connector.

## Required account setup (after review)

1. Create a dedicated GitHub **OAuth App**, not another repository connector. It only needs GitHub identity; the code requests no repository or email scopes. Set its callback to `APP_ORIGIN/api/login/callback`. Use a separate development OAuth App for localhost if keeping both environments.
2. Set environment variables privately in `.env.local` for development or in the approved Vercel project's environment settings. Never enter real values into GitHub source or commit them.
3. Use Vercel's Next.js framework preset, standard `npm ci` install, `npm run build`, and a supported Node LTS (22.18+; Node 24 LTS is suitable). Do not configure static export. A Hobby account is suitable for this personal, noncommercial use; confirm current plan terms before launch.
4. After approval only, connect the repository and configure a stable HTTPS origin and matching GitHub OAuth callback. Do not enable API access just to deploy the manual dashboard.

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact origin, e.g. `http://localhost:3000` locally or the approved stable HTTPS Vercel domain. No paths, query or trailing callback. |
| `GM_AUTH_SECRET` | At least 32 random bytes, base64 encoded; generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Keep private. Placeholders are rejected. |
| `GM_GITHUB_CLIENT_ID` | Dedicated GitHub OAuth App client ID. |
| `GM_GITHUB_CLIENT_SECRET` | Dedicated OAuth App secret. Server-only. |
| `GM_OWNER_GITHUB_ID` | Your numeric GitHub user ID, not your username. Only this ID may sign in. |
| `YAHOO_FANTASY_API_ENABLED` | Keep `false` pending explicit Yahoo approval and API implementation review. |

The pre-existing `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REDIRECT_URI`, and `YAHOO_LEAGUE_ID` are optional for manual mode. The Yahoo callback must exactly match Yahoo's registered HTTPS URL. Existing local OAuth requires HTTPS because its cookies are secure.

## Yahoo preservation and future persistence

The original Yahoo login, state verification, token exchange, secure cookie and in-memory session implementation remain. Owner guards were added around its routes. Since in-memory OAuth tokens cannot reliably survive Vercel function recycling, the Yahoo authorization and callback explicitly return 503 on Vercel until durable encrypted storage is implemented. Manual mode and GitHub owner sign-in work without those Yahoo sessions.

No hosted database account is required or connected for this MVP. If cross-device snapshot persistence or hosted Yahoo authorization is requested, use a managed Postgres service such as Neon or Supabase, accessed only from authenticated server routes. That extension requires a database connection, schema migration, backups/retention policy and a private encryption key for Yahoo tokens. Do not put credentials in browser code, use a filesystem database on Vercel, or reuse the OAuth signing key for token encryption. No private league data will be sent to a new database without owner approval.

`FantasyDataProvider` and `Snapshot` are the replaceable interface. `manualProvider` validates imported JSON; `YahooApiProvider` is an explicit disabled adapter. A later approved adapter should return the same versioned snapshot with provenance, not alter the UI contract. It must implement refresh-token rotation and expiry handling before hosted API enablement. No Yahoo write/transaction endpoints exist.

## Validation and limits

Run `npm test`, `npm run lint`, `npm run build`, and `npm run check:publish`. Tests cover signed sessions, expiry, tampering, owner allowlisting, cookie/origin rules, manual validation and recommendation eligibility. Login via the real GitHub provider needs the dedicated OAuth App credentials and is not claimed as tested until configured.

Injury tags are imported information, not a live medical/news feed. Optional sourced `injury_notes` carry their own timestamps. Recommendations compare the imported Yahoo projections; they are not a complete global lineup optimizer, do not recalculate custom scoring, and cannot guarantee lock eligibility. Completed/in-progress/actual-scored games are held fixed. Coverage and capture time remain visible. Waiver bids, lineup changes and all Yahoo transactions require separate approval.

The inherited dependency lock has eight moderate development-tool advisory entries in the lint/parser chain. No version downgrade was applied as part of this MVP. The earlier migration review records that limitation.

References: [GitHub OAuth web flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Vercel Git deployment control](https://vercel.com/docs/project-configuration/git-configuration).
