import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export type YahooGrant = { access: string; refresh: string; expiresAt: number; renewingUntil?: number };
const purpose = "fantasy-gm:yahoo-grant:v1";

export function decodeGrant(value: unknown): YahooGrant {
  const g = value as YahooGrant;
  if (!g || typeof g.access !== "string" || !g.access || g.access.length > 8192 ||
      typeof g.refresh !== "string" || !g.refresh || g.refresh.length > 8192 ||
      !Number.isSafeInteger(g.expiresAt) || g.expiresAt <= 0 ||
      (g.renewingUntil !== undefined && !Number.isSafeInteger(g.renewingUntil))) {
    throw new Error("Invalid Yahoo grant.");
  }
  return g;
}

function key(secret: string, owner: string) {
  if (secret.length < 32 || secret.startsWith("replace_") || !/^\d+$/.test(owner)) throw new Error("Missing Yahoo storage configuration.");
  return Buffer.from(hkdfSync("sha256", secret, owner, purpose, 32));
}

export function sealGrant(grant: YahooGrant, secret: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, owner), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(decodeGrant(grant)), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(value => value.toString("base64url")).join(".");
}

export function openGrant(value: string, secret: string, owner: string) {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) throw new Error("Invalid encrypted Yahoo grant.");
  const [iv, tag, data] = parts.map(part => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted Yahoo grant.");
  const cipher = createDecipheriv("aes-256-gcm", key(secret, owner), iv);
  cipher.setAuthTag(tag);
  return decodeGrant(JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8")));
}

export function parseTokenReply(value: unknown, previousRefresh?: string, now = Date.now()) {
  const reply = value as {access_token?: string; refresh_token?: string; expires_in?: number|string; token_type?: string};
  const seconds = Number(reply?.expires_in);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400 || reply?.token_type?.toLowerCase() !== "bearer") throw new Error("Invalid Yahoo token response.");
  return decodeGrant({ access: reply.access_token, refresh: reply.refresh_token ?? previousRefresh, expiresAt: now + seconds * 1000 });
}
