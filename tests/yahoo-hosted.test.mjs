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

test("hybrid merges a new week by Yahoo ID and leaves omitted projections unknown", async()=>{
  const {buildHybridRefresh,readProjectionImport}=await import("../lib/fantasy/yahoo-hybrid.ts");
  const {fixture}=await import("./engine-fixture.mjs");
  const base=fixture(), at=new Date(Date.now()-1000).toISOString();
  const league="123.l.121612";
  const row=(id,slot)=>[[{player_key:"123.p."+id},{name:{full:"Player "+id}},{primary_position:"RB"},{eligible_positions:[{position:"RB"}]}],{selected_position:[{position:slot}]}];
  const list=(kind,rows)=>({count:rows.length,...Object.fromEntries(rows.map((r,i)=>[i,{[kind]:r}]))});
  const teams=(factory)=>({teams:list("team",Array.from({length:10},(_,i)=>factory(i+1)))});
  const team=(id,extra)=>[[{team_key:league+".t."+id},{name:"Team "+id},{faab_balance:id===5?100:20}],extra];
  const request=async url=>{
    const p=new URL(url).pathname;
    let f;
    if(p.includes("/games;"))f={games:{0:{game:[{game_key:"123",season:"2026"}]}}};
    else if(p.endsWith("/"+league))f={league:[{league_key:league,current_week:10}]};
    else if(p.endsWith("/teams/roster"))f=teams(id=>team(id,{roster:{players:list("player",[row(id,"RB")])}}));
    else if(p.endsWith("/standings"))f=teams(id=>team(id,{team_standings:{rank:id,points_for:100,points_against:200,outcome_totals:{wins:2,losses:7,ties:0}}}));
    else if(p.includes("/scoreboard;"))f={scoreboard:{matchups:list("matchup",[{teams:list("team",[5,2].map(id=>team(id,{team_points:{total:0},team_projected_points:{total:30}}))) }])}};
    else if(p.includes("/players;status=A"))f={players:list("player",[row(42),row(43)])};
    else throw Error("Unexpected route.");
    return Response.json({fantasy_content:f});
  };
  base.analysis_inputs.available_ids=["yahoo:43"];
  base.analysis_inputs.players.push({id:"yahoo:43",name:"Player 43",eligible:["RB"],position:"RB",projection:99,actual:12});
  const rows=[{player_id:"yahoo:5",points:0,game_status:"bye"},{player_id:"yahoo:42",points:10,game_status:"scheduled"}];
  const report={trade_ready:true,scoring:true,rules:true,transaction_rows:0,transaction_scope:"Previously imported"};
  const saved=await buildHybridRefresh(grant.access,base,report,readProjectionImport({week:10,captured_at:at,projections:rows}),request);
  assert.equal(saved.snapshot.week,10);
  assert.equal(saved.snapshot.roster[0].projection,0);
  assert.equal(saved.snapshot.roster[0].bye,10);
  assert.equal(saved.snapshot.data_freshness.projections["yahoo:5"],at);
  assert.equal(saved.snapshot.analysis_inputs.players.find(p=>p.id==="yahoo:43").projection,undefined);
  assert.equal(saved.snapshot.analysis_inputs.players.find(p=>p.id==="yahoo:43").actual,undefined);
  assert.equal(saved.snapshot.standings.length,10);
  assert.equal(saved.snapshot.team.faab_remaining,100);
  await assert.rejects(buildHybridRefresh(grant.access,base,report,readProjectionImport({week:9,captured_at:at,projections:rows}),request),/current league week/);
  assert.throws(()=>readProjectionImport({week:10,captured_at:at,projections:[...rows,rows[0]]}),/duplicate/);
});
