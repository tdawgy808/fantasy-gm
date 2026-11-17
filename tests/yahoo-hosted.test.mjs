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

test("Yahoo coverage compares team identities, measures same-week data and keeps missing FAAB unknown", async () => {
  const { compareYahooCoverage } = await import("../lib/fantasy/yahoo-coverage.ts");
  const { fixture } = await import("./engine-fixture.mjs");
  const league = "123.l.121612";
  const collection = (kind, rows) => Object.assign({count:rows.length},Object.fromEntries(rows.map((row,i)=>[i,{[kind]:row}])));
  const players = ids => collection("player",ids.map(id=>[[{player_key:"123.p."+id}]]));
  const team = (id, extra = {}) => [[{team_key:league+".t."+id}],extra];
  const manual=fixture();
  manual.analysis_inputs.teams[0].roster=[{player_id:"yahoo:7",slot:"RB"}];
  manual.analysis_inputs.available_ids=["yahoo:6","yahoo:9"];
  const request=async (url,opts)=>{
    assert.equal(opts.method,"GET");
    const path=new URL(url).pathname;
    let data;
    if(path.includes("/games;"))data={games:{0:{game:[{game_key:"123",season:"2026"}]}}};
    else if(path.endsWith("/"+league))data={league:[{league_key:league,current_week:10,num_teams:2}]};
    else if(path.endsWith("/teams/roster"))data={league:[{teams:collection("team",[team(5,{roster:{players:players([7,8])}}),team(2,{roster:{players:players([11])}})])}]};
    else if(path.includes("/scoreboard;"))data={scoreboard:{matchups:collection("matchup",[{teams:collection("team",[team(5,{team_points:{total:0}}),team(2)])}])}};
    else if(path.endsWith("/standings"))data={standings:{teams:collection("team",[team(5,{team_standings:{rank:"2"}})])}};
    else if(path.includes("/players;"))data={players:players([6,10])};
    else if(path.endsWith("/team/"+league+".t.5"))data={team:team(5)};
    else throw Error("Unexpected Yahoo route");
    return Response.json({fantasy_content:data});
  };
  const report=await compareYahooCoverage(grant.access,manual,request);
  assert.equal(report.rosters.teams[0].overlap,1);
  assert.equal(report.matchup.same_week,false);
  assert.equal(report.matchup.api_points,0);
  assert.equal(report.matchup.manual_points,null);
  assert.equal(report.standings.api_owner_rank,2);
  assert.equal(report.available.overlap,1);
  assert.equal(report.faab.status,"unverified");
});

test("Full Yahoo check distinguishes weekly actuals from projections and traverses extra pages", async () => {
  const { compareYahooCoverage } = await import("../lib/fantasy/yahoo-coverage.ts");
  const { fixture } = await import("./engine-fixture.mjs");
  const league = "123.l.121612", team = league+".t.5";
  const collection = ids => ({count:ids.length,...Object.fromEntries(ids.map((id,i)=>[i,{player:[[{player_key:"123.p."+id}],{player_points:{week:9,total:0}}]}]))});
  let pages=0;
  const request=async (url)=>{
    const path=new URL(url).pathname;
    let data;
    if(path.includes("/games;"))data={games:{0:{game:[{game_key:"123",season:"2026"}]}}};
    else if(path.endsWith("/"+league))data={league:[{league_key:league,current_week:9}]};
    else if(path.includes("/players;status=A")) {
      const start=Number(path.match(/start=(\d+)/)[1]);
      pages++;
      data={players:collection(Array.from({length:start<100?25:1},(_,i)=>start+i+10))};
    }
    else if(path.includes("/roster;week="))data={team:[[{team_key:team}],{roster:{players:collection([1])}}]};
    else if(path.includes("/stats;"))data={players:collection([1])};
    else return new Response(null,{status:404});
    return Response.json({fantasy_content:data});
  };
  const report=await compareYahooCoverage(grant.access,fixture(),request,true);
  assert.equal(pages,5);
  assert.equal(report.available.api_count,101);
  assert.equal(report.available.scope_complete,true);
  assert.equal(report.projections.actual_points_count,1);
  assert.equal(report.projections.verified_projection_count,0);
  assert.equal(report.projections.sample_verified,false);
});
