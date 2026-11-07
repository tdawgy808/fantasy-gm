import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, configured, cookieOptions, FLOW_COOKIE, origin, SESSION_SECONDS, signClaims, verifyClaims } from "@/lib/auth/session";
import { githubOwner } from "@/lib/auth/github";
export async function GET(request: NextRequest) {
  if (!configured()) return NextResponse.json({ error: "Owner sign-in is not configured." }, { status: 503 });
  const finish = (response: NextResponse) => { response.cookies.set(FLOW_COOKIE, "", cookieOptions(0)); response.headers.set("Cache-Control", "no-store"); return response; };
  const failure = () => finish(NextResponse.redirect(new URL("/login?error=denied", origin())));
  const flow = verifyClaims(request.cookies.get(FLOW_COOKIE)?.value, "login");
  const [savedState, verifier] = flow?.sub.split(".") || [];
  const state = request.nextUrl.searchParams.get("state"); const code = request.nextUrl.searchParams.get("code");
  if (!flow || !state || savedState !== state || !verifier || !/^[A-Za-z0-9_-]{43}$/.test(verifier) || !code || code.length > 1024 || request.nextUrl.searchParams.has("error")) return failure();
  try {
    const owner = await githubOwner(code, verifier, { clientId: process.env.GM_GITHUB_CLIENT_ID!, clientSecret: process.env.GM_GITHUB_CLIENT_SECRET!, ownerId: process.env.GM_OWNER_GITHUB_ID!, redirectUri: `${origin()}/api/login/callback` });
    if (!owner) return failure();
    // GitHub's access token is discarded; only a signed, expiring identity cookie is stored.
    const response = NextResponse.redirect(new URL("/dashboard", origin()));
    response.cookies.set(AUTH_COOKIE, signClaims("owner", owner, SESSION_SECONDS), cookieOptions(SESSION_SECONDS)); return finish(response);
  } catch { return failure(); }
}
