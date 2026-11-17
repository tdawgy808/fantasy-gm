import { NextRequest, NextResponse } from "next/server";
import { yahooSessions } from "../../../../lib/yahoo-session";
import { requireOwner } from "@/lib/auth/owner";
import { hostedYahooAccess } from "@/lib/fantasy/yahoo-hosted";
import { verifyYahooLeague } from "@/lib/fantasy/yahoo-probe";
import { compareYahooCoverage } from "@/lib/fantasy/yahoo-coverage";
import { analysisStore } from "@/lib/fantasy/analysis-store";

export async function GET(request: NextRequest) {
  await requireOwner();
  if (process.env.YAHOO_FANTASY_API_ENABLED !== "true") {
    return NextResponse.json(
      { connected: false, error: "Fantasy API access is disabled. Use manual snapshots." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (process.env.VERCEL) {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const access = await hostedYahooAccess();
      if (!access) return NextResponse.json({ connected: false, error: "Connect your Yahoo account first." }, { status: 409, headers });
      if (request.nextUrl.searchParams.get("compare") === "1") {
        const saved = await analysisStore.yahoo();
        if (!saved) return NextResponse.json({ error: "Save a manual snapshot before comparing." }, { status: 409, headers });
        return NextResponse.json(await compareYahooCoverage(access, saved.snapshot), { headers });
      }
      return NextResponse.json(await verifyYahooLeague(access), { headers });
    } catch {
      return NextResponse.json({ connected: false, error: "Could not verify the private Yahoo roster. If the connection has expired, reconnect Yahoo and retry." }, { status: 502, headers });
    }
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
