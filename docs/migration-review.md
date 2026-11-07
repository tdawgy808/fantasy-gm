# Migration review

Reviewed November 6, 2026. Destination: `tdawgy808/fantasy-gm`, initially containing only README.md and .gitignore at commit `47046dae6b8593c954d2ff5daa9bd4a48e35b30a`.

The existing application was copied into a separate workspace. The original application, its environment configuration, certificates, server process and in-memory OAuth sessions were not modified. Source files and standard starter assets were copied through an explicit allowlist; dependencies and generated build output were re-created locally, not migrated or published.

## OAuth preservation

The initial migration preserved the login route, callback route, and server-side in-memory session module byte-for-byte. The subsequent private MVP adds owner authorization guards and Vercel storage-readiness checks around those routes, preserving the underlying Yahoo flow. The callback checks OAuth state, exchanges the code on the server, stores tokens in memory, and sets a secure HTTP-only session cookie. No real credentials are embedded in the source. The existing Fantasy API test route is retained but disabled unless explicitly enabled after approval. Raw Yahoo error bodies are no longer echoed to the browser.

Existing limitations remain: token refresh is unimplemented; sessions disappear on restart; expired sessions are not automatically cleaned up; callback state is cleared on success but not consumed before every failed exchange. This migration does not claim production-ready authentication or verified live Yahoo login. No new OAuth login, token exchange, Fantasy API call, or Yahoo transaction was performed during migration.

## Privacy and publication

`.env.example` contains placeholders only. Ignore rules cover environment variants, OAuth token files, client-secret files, sessions, browser storage-state files, certificates/private keys, private data, logs, dependencies, and build output. OAuth implementation source remains publishable. Private league snapshots and the detailed local review manifest stay under ignored `private/`.

`npm run check:publish` generates the exact publication manifest from a source allowlist, checks representative Git exclusions, rejects symlinks and suspicious credential content, and verifies that source files are not accidentally ignored. Before publication, also compare this manifest against real local credential values without printing those values. Publish precisely the scanned bytes. A fresh GitHub base revision must be checked before creating the review branch; do not force-update or overwrite concurrent work.

## Validation and remaining dependency risk

Snapshot validation tests, ESLint, TypeScript and the production build pass. The existing private snapshot was validated and archived locally without publication. Browser testing confirmed that selecting it renders the full roster, capture time, FAAB, matchup and coverage notes. HTTP checks confirmed dashboard success, the disabled API guard, missing-configuration handling and callback rejection when state/code are absent. Manual review uses browser-local file selection and has no network fetch; the imported data is not persisted to browser storage or included in the build.

The inherited dependency lock reports eight moderate development-tool advisory entries, all in the ESLint/TypeScript parser chain due to a minimatch denial-of-service advisory. npm suggests a major configuration downgrade, which was not applied during migration. No high or critical entries were reported. This remains a development-dependency maintenance item; do not describe the dependency set as vulnerability-free. See GHSA-g3hv-75wg-m249 in npm audit output. Production deployment and broader authentication hardening are outside this migration.
