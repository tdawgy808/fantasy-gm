import { test } from "node:test";
import assert from "node:assert/strict";
import { openGrant, parseTokenReply, sealGrant } from "../lib/fantasy/yahoo-grant.ts";
import { verifyYahooLeague } from "../lib/fantasy/yahoo-probe.ts";

const secret = "synthetic-testing-value-not-for-real-use";
const grant = { access:"example-access", refresh:"example-refresh", expiresAt: 3601000 };

test("Yahoo grant encryption authenticates ciphertext and binds it to the owner", () => {
  const sealed = sealGrant(grant, secret, "7");
  assert.deepEqual(openGrant(sealed, secret, "7"), grant);
  assert.notEqual(sealed, sealGrant(grant, secret, "7"));
  assert.ok(!sealed.includes(grant.refresh));
  assert.throws(()=>openGrant(sealed, secret, "8"));
  const parts = sealed.split(".");
  parts[1] = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
  assert.throws(()=>openGrant(parts.join("."), secret, "7"));
});

test("Yahoo renewal stores a rotated refresh credential and preserves it if omitted", () => {
  const reply = { access_token:"example-access", expires_in:3600, token_type:"bearer" };
  assert.deepEqual(parseTokenReply(reply, grant.refresh, 1000), grant);
  assert.equal(parseTokenReply({...reply,refresh_token:"rotated"},grant.refresh,1000).refresh,"rotated");
  assert.throws(()=>parseTokenReply(reply,undefined,1000));
});

test("connection check makes only read requests and verifies the correct private team", async () => {
  const requests = [];
  const mock = (teamKey) => async (url, options) => {
    requests.push([url,options.method,options.redirect]);
    const data = url.includes("/games;")
      ? {games:{0:{game:[{game_key:"123",season:"2026"}]}}}
      : {team:[[{team_key:teamKey}],{roster:{players:{0:{player:[[{player_key:"123.p.444"}]]}}}}]};
    return Response.json({fantasy_content:data});
  };
  assert.equal((await verifyYahooLeague(grant.access,mock("123.l.121612.t.5"))).rosterReadable,true);
  assert.deepEqual(requests.map(r=>r.slice(1)),[["GET","error"],["GET","error"]]);
  assert.match(requests[1][0],/\/team\/123\.l\.121612\.t\.5\/roster\?format=json$/);
  await assert.rejects(verifyYahooLeague(grant.access,mock("123.l.121612.t.6")));
});
