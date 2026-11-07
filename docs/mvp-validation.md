# MVP validation

November 6, 2026. The source builds with the locked dependencies. Twenty offline tests pass, covering snapshot validation, recommendation eligibility, held-fixed completed games, signed sessions, expiry, tampering, owner allowlisting, secure-cookie/origin rules, PKCE and mocked GitHub identity exchange. ESLint and the production build (including TypeScript) pass.

Local HTTP smoke checks against the built production app verify:

- Anonymous pages redirect to sign-in; protected APIs return 401.
- Tampered, expired and different-owner signed sessions cannot access the dashboard.
- A valid owner session reaches the dashboard with no-store caching.
- The existing Fantasy API endpoint returns 403 while disabled.
- GitHub login initiation includes S256 PKCE and a signed flow cookie.
- Invalid callback state is rejected and the flow cookie is cleared.
- Cross-origin logout returns 403; valid same-origin logout expires the cookie.

Browser checks imported an existing private Yahoo snapshot, rendering the complete 15-player roster, matchup, standings, FAAB, advisory recommendations and injury tags. At a 390px viewport, the page has no horizontal overflow outside intentionally scrollable tables; bottom navigation is visible. Available-player position filtering and search were exercised. Source snapshot and QA authentication material remain private and were not included in publication.

The initial local browser checks used a loopback-only test harness with a randomly generated test session; this harness is excluded from publication. No production login bypass exists. During subsequent owner setup, a dedicated GitHub OAuth App was registered and a real owner sign-in successfully reached the protected localhost dashboard. Credentials remain only in ignored local configuration. No Yahoo API request, Yahoo transaction or Vercel deployment was performed. The original app directory remains unchanged.

The local manual-refresh handoff was also verified: anonymous access returns 401, owner access receives the validated snapshot, and the signed-in dashboard loaded the refreshed league data automatically. This endpoint is disabled for Vercel and non-loopback configured origins. Private data is not part of the source or build.

The inherited development dependency advisories remain documented in the migration review. These checks do not constitute an independent security audit or live provider certification.
