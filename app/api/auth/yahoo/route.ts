import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireOwner } from "@/lib/auth/owner";
import { hostedYahooConfig } from "@/lib/fantasy/yahoo-hosted";

export async function GET() {
  await requireOwner();
  let clientId = process.env.YAHOO_CLIENT_ID;
  let redirectUri = process.env.YAHOO_REDIRECT_URI;
  if (process.env.VERCEL) {
    if (process.env.YAHOO_FANTASY_API_ENABLED !== "true") return NextResponse.json({ error: "Yahoo API access is disabled." }, { status: 403 });
    try {
      const config = hostedYahooConfig();
      clientId = config.id;
      redirectUri = config.callback;
    } catch {
      return NextResponse.json({ error: "Hosted Yahoo OAuth is not configured." }, { status: 503 });
    }
  }

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Yahoo OAuth configuration is missing." },
      { status: 500 }
    );
  }

  const state = randomBytes(32).toString("hex");

  const authorizationUrl = new URL(
    "https://api.login.yahoo.com/oauth2/request_auth"
  );

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("language", "en-us");

  const response = NextResponse.redirect(authorizationUrl);
  response.headers.set("Cache-Control", "private, no-store");

  response.cookies.set("yahoo_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
