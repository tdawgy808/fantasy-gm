import test from "node:test";
import assert from "node:assert/strict";
import { fixture, now, research } from "./engine-fixture.mjs";
import { calculate } from "../lib/fantasy/engine.ts";
import { parseSnapshot } from "../lib/fantasy/snapshot.ts";
import { parseResearch } from "../lib/fantasy/research.ts";
import { scoutingCoverage } from "../lib/fantasy/coverage.ts";
import { mergeGameHistory } from "../lib/fantasy/inputs.ts";
import { defaultSettings } from "../lib/fantasy/strategies.ts";

const source={url:"https://www.nfl.com/players/fixture/stats/logs/2026/",retrieved_at:"2026-11-06T18:00:00Z"};
function sourced(){
  const s=fixture(),p=s.analysis_inputs.players.find(p=>p.id==="candidate");
  s.rules.roster_positions.push("BN");
  p.history=[100,150,250,200].map((yards,index)=>({week:index+1,season:2026,played_at:`2026-10-${index+20}T23:00:00Z`,stats:{yards},source}));
  s.analysis_inputs.scoring.rules[0].bonuses=[{threshold:200,points:2}];
  s.analysis_inputs.scoring.rules[0].bonus_mode="highest";
  return {s,p};
}

test("sourced league-scored games yield an independent estimate and retain original provenance",()=>{
  const {s,p}=sourced(), imported=parseSnapshot(JSON.stringify(s));
  const result=calculate(imported,null,defaultSettings,null,now),scout=result.scouting[p.id];
  assert.equal(scout.projection,(64/3+74/4)/2); // recent: 15, 27, 22; season: 10, 15, 27, 22
  assert.equal(scout.yahoo,13);
  assert.equal(scout.delta,scout.projection-13);
  assert.deepEqual(scout.sources,[source]);
  assert.deepEqual(scout.windows.map(w=>w.games),[3,4,4,4,0]);
  assert.equal(result.waivers[0].recommendation,"ADD");
  assert.equal(result.waivers[0].drop,null);
  assert.ok(result.waivers[0].bid<=s.team.faab_remaining);
});

test("incomplete scoring, identity mismatch and future data do not create independent evidence",()=>{
  const {s,p}=sourced();
  const data=research();
  data.findings[0].player=p.name;
  data.findings[0].opportunity={season:2026,week:9,direction:"up"};
  const parsed=parseResearch(JSON.stringify(data));
  assert.equal(calculate(s,parsed,defaultSettings,null,now).scouting[p.id].direction,null);
  delete s.analysis_inputs.scoring;
  p.history[0].source={...source,retrieved_at:"2026-11-06T21:00:00Z"};
  const scout=calculate(s,parsed,defaultSettings,null,now).scouting[p.id];
  assert.equal(scout.projection,null);
  assert.equal(scout.windows[3].games,3);
  assert.equal(scout.supported,false);
  const report=scoutingCoverage(s,parsed,[],now).by_position.find(p=>p.position==="RB");
  assert.equal(report.independent,0);
  assert.equal(report.evaluated,0);
  assert.equal(report.historical,1);
  p.history[1].source={...source,url:"https://name:password@www.nfl.com/log"};
  assert.throws(()=>parseSnapshot(JSON.stringify(s)));
});

test("independent breakout nominations reach beyond Yahoo position leaders without pricing role uncertainty",()=>{
  const {s,p}=sourced();
  p.projection=0;
  for(let i=0;i<7;i++){
    const id="pool"+i;
    s.analysis_inputs.players.push({id,name:id,position:"RB",eligible:["RB"],projection:10+i});
    s.analysis_inputs.available_ids.push(id);
  }
  const data=research(),f=data.findings[0];
  f.player=p.name;
  f.player_id=p.id;
  f.opportunity={season:2026,week:9,direction:"up"};
  delete f.effect;
  const result=calculate(s,parseResearch(JSON.stringify(data)),defaultSettings,null,now);
  assert.equal(result.scouting_pool.RB[0],p.id);
  assert.ok(result.scouting_pool.RB.length>=5);
  assert.equal(result.scouting[p.id].projection,null);
  const waiver=result.all_waivers.find(w=>w.id===p.id);
  assert.equal(waiver.recommendation,"MONITOR");
  assert.equal(waiver.bid,null);
});

test("incremental history preserves dated evidence and accepts a newer verified game",()=>{
  const {p}=sourced();
  const old=p.history[0];
  const newGame={...old,week:8};
  const merged=mergeGameHistory(p.history,[{...old,source:undefined},newGame]);
  assert.equal(merged.length,5);
  assert.equal(merged[0],newGame);
  assert.equal(merged.at(-1),old);
});


