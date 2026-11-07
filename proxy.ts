import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isOwner } from "@/lib/auth/session";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = ["/login", "/api/login/github", "/api/login/callback"].includes(path);
  let response: NextResponse;
  if (!publicRoute && !isOwner(request.cookies.get(AUTH_COOKIE)?.value)) {
    response = path.startsWith("/api/") ? NextResponse.json({ error: "Sign in required." }, { status: 401 }) : NextResponse.redirect(new URL("/login", request.url));
  } else response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
