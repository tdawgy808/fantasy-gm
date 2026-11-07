import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const AUTH_COOKIE = "gm_owner";
export const FLOW_COOKIE = "gm_login_flow";
export const SESSION_SECONDS = 8 * 60 * 60;
type Claims = { purpose: "owner" | "login"; sub: string; iat: number; exp: number };
function key(): string {
  const secret = process.env.GM_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace_")) throw new Error("Authentication is not configured.");
  return secret;
}
export function origin(): string {
  const url = new URL(process.env.APP_ORIGIN || "http://localhost:3000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local && !process.env.VERCEL))) throw new Error("Invalid application origin.");
  if (process.env.VERCEL && !process.env.APP_ORIGIN) throw new Error("APP_ORIGIN is required.");
  return url.origin;
}
export function configured(): boolean {
  try { key(); origin(); return !!(process.env.GM_GITHUB_CLIENT_ID && !process.env.GM_GITHUB_CLIENT_ID.startsWith("replace_") && process.env.GM_GITHUB_CLIENT_SECRET && !process.env.GM_GITHUB_CLIENT_SECRET.startsWith("replace_") && /^\d+$/.test(process.env.GM_OWNER_GITHUB_ID || "")); } catch { return false; }
}
export function signClaims(purpose: Claims["purpose"], sub: string, seconds: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const body = Buffer.from(JSON.stringify({ purpose, sub, iat, exp: iat + seconds })).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}
export function verifyClaims(value: string | undefined, purpose: Claims["purpose"], now = Date.now()): Claims | null {
  try {
    if (!value || value.length > 2048) return null;
    const parts = value.split("."); if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
    const expected = createHmac("sha256", key()).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims: Claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const time = Math.floor(now / 1000);
    if (claims.purpose !== purpose || typeof claims.sub !== "string" || !claims.sub || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > time + 30 || claims.exp <= time || claims.exp <= claims.iat || claims.exp - claims.iat > (purpose === "owner" ? SESSION_SECONDS : 600)) return null;
    return claims;
  } catch { return null; }
}
export function isOwner(value: string | undefined): boolean {
  const claims = verifyClaims(value, "owner");
  return !!claims && /^\d+$/.test(process.env.GM_OWNER_GITHUB_ID || "") && claims.sub === process.env.GM_OWNER_GITHUB_ID;
}
export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax" as const, path: "/", maxAge };
}
export function newState(): string { return randomBytes(32).toString("hex"); }
export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export function sameOrigin(request: Request): boolean { try { return request.headers.get("origin") === origin(); } catch { return false; } }
