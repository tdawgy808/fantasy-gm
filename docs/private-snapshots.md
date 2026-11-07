# Private snapshots across devices

The manual Yahoo data adapter remains unchanged. A separate server-side store saves the validated snapshot for the 2026 league 121612, team 5. The API is `/api/manual/snapshot`: GET loads the saved snapshot; POST saves one. Both require the owner session. POST also requires the exact application Origin and `application/json`. Chunked request bodies and stored objects are limited to 1 MB. Credentials, other league/team identities, invalid data, and older or duplicate capture times are rejected.

The Vercel Blob store must have **private** access. Its credentials belong only in server environment variables, never `NEXT_PUBLIC_*`, GitHub, or the snapshot itself. The dashboard never receives a Blob token or direct storage URL. Reads use `useCache: false`, validate the stored JSON, and return private/no-store responses. Updates use storage ETags to reject a concurrent overwrite; the first save is create-only. Storage failures fail closed with a generic error.

On opening the dashboard, the app tries the authenticated hosted snapshot, then the existing localhost-only file handoff. Importing a JSON file still reads it only into the current tab. The explicit **Save for my devices** button uploads it to the configured private store. Sign in on another device or reload to read that saved copy. **Clear view** only clears the tab; it does not delete the hosted copy. The store retains one current snapshot, without a hosted history or backup; local dated archives remain separate.

The private store is for manual JSON files, not Yahoo OAuth tokens. The existing Yahoo integration remains disabled on Vercel until encrypted durable token storage is separately implemented. No Yahoo requests or transactions are introduced.

Before launch, configure the hosted GitHub OAuth App and its exact callback, verify private storage against the live authenticated app, and obtain deployment approval. Do not claim cross-device storage has been tested live until a deployment exists. Storage credentials are provisioned by the Vercel project connection; `BLOB_READ_WRITE_TOKEN` is supported, as is managed OIDC with `BLOB_STORE_ID`. No long-lived storage credential is required in the browser.

Reference: [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
