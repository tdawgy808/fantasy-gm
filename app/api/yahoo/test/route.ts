import { NextRequest, NextResponse } from "next/server";
import { yahooSessions } from "../../../../lib/yahoo-session";

export async function GET(request: NextRequest) {
  if (process.env.YAHOO_FANTASY_API_ENABLED !== "true") {
    return NextResponse.json(
      { connected: false, error: "Fantasy API access is disabled pending Yahoo approval. Use manual snapshots." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  const sessionId = request.cookies.get("fantasy_gm_session")?.value;

  if (!sessionId) {
    return NextResponse.json(
      { connected: false, error: "No Yahoo session cookie found" },
      { status: 401 }
    );
  }

  const session = yahooSessions.get(sessionId);

  if (!session) {
    return NextResponse.json(
      {
        connected: false,
        error: "Yahoo session not found. Please reconnect.",
      },
      { status: 401 }
    );
  }

  if (Date.now() >= session.expiresAt) {
    return NextResponse.json(
      {
        connected: false,
        error: "Yahoo access token expired. Refresh support is next.",
      },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(
      "https://fantasysports.yahooapis.com/fantasy/v2/game/nfl?format=json",
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

if (!response.ok) {
  return NextResponse.json(
    {
      connected: false,
      error: "Yahoo Fantasy API request failed",
      yahooStatus: response.status,
    },
    { status: 502 }
  );
}
    const data = await response.json();

    return NextResponse.json({
      connected: true,
      message: "Yahoo Fantasy API connection successful!",
      data,
    });
  } catch {
    return NextResponse.json(
      {
        connected: false,
        error: "Unable to reach Yahoo Fantasy API",
      },
      { status: 502 }
    );
  }
}
