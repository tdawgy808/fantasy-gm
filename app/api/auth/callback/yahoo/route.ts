import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { requireOwner } from "@/lib/auth/owner";
import { origin } from "@/lib/auth/session";
import { connectHostedYahoo } from "@/lib/fantasy/yahoo-hosted";

export async function GET(request: NextRequest) {
  await requireOwner();
  if (process.env.VERCEL && process.env.YAHOO_FANTASY_API_ENABLED !== "true") return NextResponse.json({ error: "Yahoo API access is disabled." }, { status: 403 });
  const url = new URL(request.url);

  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.json(
      { error: "Yahoo authorization was declined or failed." },
      { status: 400 }
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = request.cookies.get("yahoo_oauth_state")?.value;

  if (!code || !state || !savedState) {
    return NextResponse.json(
      { error: "Missing Yahoo authorization code or OAuth state." },
      { status: 400 }
    );
  }

  const received = createHash("sha256").update(state).digest();
  const expected = createHash("sha256").update(savedState).digest();

  if (!timingSafeEqual(received, expected)) {
    return NextResponse.json(
      { error: "OAuth state verification failed." },
      { status: 403 }
    );
  }

  if (process.env.VERCEL) {
    const response = await connectHostedYahoo(code).then(
      () => NextResponse.redirect(new URL("/api/yahoo/test", origin())),
      () => NextResponse.json({ error: "Yahoo authorization could not be saved. Start a new Yahoo connection to retry." }, { status: 502 }),
    );
    response.cookies.delete("yahoo_oauth_state");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Yahoo credentials are not configured." },
      { status: 500 }
    );
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const tokenResponse = await fetch(
    "https://api.login.yahoo.com/oauth2/get_token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    }
  );

  if (!tokenResponse.ok) {
    return NextResponse.json(
      { error: "Yahoo token exchange failed." },
      { status: 502 }
    );
  }

  const tokens = await tokenResponse.json();

  // Temporary in-memory session for local development.
  // Tokens are never sent to the browser.
  const sessionId = randomBytes(32).toString("hex");

  const { yahooSessions } = await import("@/lib/yahoo-session");

  yahooSessions.set(sessionId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  const response = NextResponse.redirect(
    new URL("/dashboard", request.url)
  );

  response.cookies.set("fantasy_gm_session", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  response.cookies.delete("yahoo_oauth_state");

  return response;
}
