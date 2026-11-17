import { get, put } from "@vercel/blob";
import { origin } from "../auth/session";
import { privateReadOptions } from "./blob-options";
import { hostedStorageConfigured } from "./blob-store";
import { boundedText } from "./hosted";
import { openGrant, parseTokenReply, sealGrant, type YahooGrant } from "./yahoo-grant";
import { verifyYahooLeague } from "./yahoo-probe";

const grantPath = "fantasy-gm/yahoo/owner-grant-v1";
const timeout = 10000;

export function hostedYahooConfig() {
  const id = process.env.YAHOO_CLIENT_ID, secret = process.env.YAHOO_CLIENT_SECRET;
  const storageSecret = process.env.GM_AUTH_SECRET, owner = process.env.GM_OWNER_GITHUB_ID;
  if (!id || !secret || !storageSecret || !owner || !hostedStorageConfigured()) throw new Error("Hosted Yahoo is not configured.");
  return { id, secret, owner, storageSecret, callback: new URL("/api/auth/callback/yahoo", origin()).href };
}
type Config = ReturnType<typeof hostedYahooConfig>;

async function exchange(config: Config, fields: Record<string,string>, refresh?: string) {
  const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(config.id + ":" + config.secret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error("Yahoo rejected the OAuth exchange.");
  return parseTokenReply(await response.json(), refresh);
}

async function read(config: Config) {
  const result = await get(grantPath, privateReadOptions());
  if (!result) return null;
  if (result.statusCode !== 200) throw new Error("Yahoo connection storage is unavailable.");
  return { grant: openGrant(await boundedText(result.stream, 65536), config.storageSecret, config.owner), etag: result.blob.etag };
}

async function save(config: Config, grant: YahooGrant, etag?: string) {
  const object = await put(grantPath, sealGrant(grant, config.storageSecret, config.owner), {
    access: "private", contentType: "text/plain", addRandomSuffix: false, allowOverwrite: !!etag,
    ...(etag ? { ifMatch: etag } : {}),
  });
  return object.etag;
}

export async function connectHostedYahoo(code: string) {
  const config = hostedYahooConfig();
  const current = await read(config);
  if (current?.grant.renewingUntil && current.grant.renewingUntil > Date.now()) throw new Error("Yahoo connection is busy.");
  const grant = await exchange(config, { grant_type: "authorization_code", code, redirect_uri: config.callback });
  await verifyYahooLeague(grant.access);
  await save(config, grant, current?.etag);
}

export async function hostedYahooAccess() {
  const config = hostedYahooConfig();
  const current = await read(config);
  if (!current) return null;
  const { grant } = current;
  const now = Date.now();
  if (grant.expiresAt > now + 60000) return grant.access;
  if (grant.renewingUntil && grant.renewingUntil > now) throw new Error("Yahoo connection renewal is already in progress.");
  // A conditional write claims renewal before Yahoo can rotate the credential.
  const etag = await save(config, { ...grant, renewingUntil: now + 60000 }, current.etag);
  const renewed = await exchange(config, { grant_type: "refresh_token", refresh_token: grant.refresh, redirect_uri: config.callback }, grant.refresh);
  await save(config, renewed, etag);
  return renewed.access;
}
