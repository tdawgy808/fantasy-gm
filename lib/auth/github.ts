type OAuthConfig = { clientId: string; clientSecret: string; ownerId: string; redirectUri: string };

// The transport is injectable for offline tests, never configurable through a request.
export async function githubOwner(code: string, verifier: string, config: OAuthConfig, transport: typeof fetch = fetch): Promise<string | null> {
  const exchange = await transport("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: verifier, redirect_uri: config.redirectUri }),
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!exchange.ok) return null;
  const data = await exchange.json();
  if (typeof data.access_token !== "string" || !data.access_token) return null;
  const identity = await transport("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "Fantasy-GM" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!identity.ok) return null;
  const user = await identity.json();
  return Number.isSafeInteger(user.id) && String(user.id) === config.ownerId ? String(user.id) : null;
}
