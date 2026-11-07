import { NextResponse } from "next/server";
import { configured, cookieOptions, FLOW_COOKIE, newPkce, newState, origin, signClaims } from "@/lib/auth/session";
export async function GET() {
  if (!configured()) return NextResponse.json({ error: "Configure owner sign-in before using the app." }, { status: 503 });
  const state = newState(); const url = new URL("https://github.com/login/oauth/authorize");
  const pkce = newPkce();
  url.searchParams.set("client_id", process.env.GM_GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin()}/api/login/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  // No repository or email scopes are needed to check the account's numeric identity.
  const response = NextResponse.redirect(url);
  response.cookies.set(FLOW_COOKIE, signClaims("login", `${state}.${pkce.verifier}`, 600), cookieOptions(600));
  response.headers.set("Cache-Control", "no-store"); return response;
}
