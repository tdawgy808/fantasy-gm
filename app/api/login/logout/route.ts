import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, cookieOptions, isOwner, origin, sameOrigin } from "@/lib/auth/session";
export async function POST(request: NextRequest) {
  if (!isOwner(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const response = NextResponse.redirect(new URL("/login", origin()), 303);
  response.cookies.set(AUTH_COOKIE, "", cookieOptions(0)); response.headers.set("Cache-Control", "no-store"); return response;
}
