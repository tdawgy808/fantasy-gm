import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export async function GET() {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;

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

  response.cookies.set("yahoo_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}