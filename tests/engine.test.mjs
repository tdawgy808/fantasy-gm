import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,research,now} from './engine-fixture.mjs';
import {parseSnapshot} from '../lib/fantasy/snapshot.ts';
import {parseResearch} from '../lib/fantasy/research.ts';
import {defaultSettings} from '../lib/fantasy/strategies.ts';
import {calculate} from '../lib/fantasy/engine.ts';
import {scoreStats,historicalPoints} from '../lib/fantasy/scoring.ts';
import {evaluatePlayers,canPlay} from '../lib/fantasy/players.ts';
import {legalCandidates} from '../lib/fantasy/optimizer.ts';
import {simulateLineups} from '../lib/fantasy/simulation.ts';
import {runAnalysis,updateSettings,importResearch,needsAnalysis} from '../lib/fantasy/analysis-service.ts';
import {simulateSeason} from '../lib/fantasy/playoffs.ts';

test('version 2 imports validate complete scoring, roster identities and unique ownership',()=>{
  assert.equal(parseSnapshot(JSON.stringify(fixture())).schema_version,2);
  for(const mutate of [s=>s.analysis_inputs.players.push(s.analysis_inputs.players[0]),s=>s.analysis_inputs.teams[1].roster.push({player_id:'steady',slot:'BN'}),s=>s.analysis_inputs.players[0].projection=Infinity,s=>s.analysis_inputs.correlations=[{a:'steady',b:'other',rho:2,source_url:'https://nfl.com',sample_size:8}],s=>s.analysis_inputs.players[0].history.push(s.analysis_inputs.players[0].history[0])]){const s=fixture();mutate(s);assert.throws(()=>parseSnapshot(JSON.stringify(s)));}
});
test('custom scoring includes PPR, negative stats, bands and explicit bonus stacking',()=>{
  const scoring={id:'custom',complete:true,rules:[{stat:'completion',points:.5},{stat:'incompletion',points:-1},{stat:'passing_yards',points:1/30,bonuses:[{threshold:300,points:5},{threshold:400,points:3}],bonus_mode:'cumulative'},{stat:'reception',points:1},{stat:'receiving_yards',points:1/20},{stat:'sack_taken',points:-1},{stat:'points_allowed',points:0,bands:[{min:0,max:0,points:10},{min:1,max:6,points:7},{min:7,points:-1}]}]};
  const stats={completion:20,incompletion:10,passing_yards:420,reception:5,receiving_yards:100,sack_taken:3,points_allowed:3};
  assert.equal(scoreStats(stats,scoring),36);
  scoring.rules[2].bonus_mode='highest';assert.equal(scoreStats(stats,scoring),31);
  assert.throws(()=>scoreStats({...stats,incompletion:undefined},scoring),/Missing scoring/);
});
test('historical points require matching scoring and cannot leak future games into simulation',()=>{
  const s=fixture();const p=s.analysis_inputs.players[0];p.history[0].scoring_id='other';p.history[1].played_at='2026-12-01T00:00:00Z';
  assert.equal(historicalPoints(p.history,s.analysis_inputs.scoring,now).length,6);
  assert.deepEqual(historicalPoints(p.history,undefined,now),[]);
});
test('eligibility and global slot assignment avoid greedy flex errors and duplicate starters',()=>{
  assert.equal(canPlay({eligible:['WR','TE'],position:'WR'},'W/R/T'),true);
  assert.equal(canPlay({eligible:['QB'],position:'QB'},'W/R/T'),false);
  const s=fixture();const players=evaluatePlayers(s,null,now);
  const a={...players[0],id:'rb',eligible:['RB'],mean:20,slot:'RB'},b={...players[0],id:'wr',eligible:['WR'],mean:19,slot:'BN'};
  const best=legalCandidates([a,b],['W/R/T','RB'],'Matchup-Aware')[0];assert.equal(best.assignments.find(a=>a.slot==='RB').player.id,'rb');assert.equal(new Set(best.assignments.map(a=>a.player.id)).size,2);
});
test('locked zero-point starter cannot be replaced; IR, bye, out and missing projection are excluded',()=>{
  const s=fixture();s.roster[0].actual=0;
  assert.equal(calculate(s,null,defaultSettings,null,now).lineup.assignments[0].player.name,'Steady');
  delete s.roster[0].actual;s.analysis_inputs.players[1].status='OUT';s.analysis_inputs.players[0].projection=undefined;
  const result=calculate(s,null,defaultSettings,null,now);assert.equal(result.lineup.assignments.length,0);assert.equal(result.lineup.win_probability,null);
});
test('Safe, Aggressive and Matchup-Aware use different supported objectives',()=>{
  const s=fixture();
  const safe=calculate(s,null,{...defaultSettings,lineup:'Safe'},null,now);
  const aggressive=calculate(s,null,{...defaultSettings,lineup:'Aggressive'},null,now);
  assert.equal(safe.lineup.assignments[0].player.id,'steady');assert.equal(aggressive.lineup.assignments[0].player.id,'volatile');
  const matchup=calculate(s,null,defaultSettings,null,now);assert.equal(typeof matchup.lineup.win_probability,'number');assert.equal(matchup.lineup.simulation_trials,3000);assert.match(matchup.lineup.method,/uncalibrated/);
});
test('matchup bootstrap is deterministic and rejects unsupported distributions or invalid correlations',()=>{
  const ps=evaluatePlayers(fixture(),null,now),mine=[ps.find(p=>p.id==='steady')],opponent=[ps.find(p=>p.id==='other')];
  assert.deepEqual(simulateLineups([mine],opponent,[]),simulateLineups([mine],opponent,[]));
  assert.equal(simulateLineups([[{...mine[0],samples:[]}]],opponent,[]),null);
  assert.equal(simulateLineups([mine],opponent,[{a:'steady',b:'other',rho:1}]),null);
});
test('credible research changes recommendations; speculative, stale and conflicting effects do not',()=>{
  const s=fixture();const baseline=calculate(s,null,{...defaultSettings,lineup:'Aggressive'},null,now);assert.equal(baseline.lineup.assignments[0].player.id,'volatile');
  const r=parseResearch(JSON.stringify(research()));const adjusted=calculate(s,r,{...defaultSettings,lineup:'Aggressive'},null,now);assert.equal(adjusted.lineup.assignments[0].player.id,'steady');
  r.findings[0].confirmation='speculative';assert.equal(evaluatePlayers(s,r,now).find(p=>p.id==='volatile').mean,12);
  r.findings[0].confirmation='reported';r.findings[0].published_at='2026-11-01T12:00:00Z';assert.equal(evaluatePlayers(s,r,now).find(p=>p.id==='volatile').mean,12);
  const conflict=research();conflict.findings.push({...conflict.findings[0],id:'conflict',source_url:'https://www.espn.com/nfl/synthetic-fixture',effect:{...conflict.findings[0].effect,projection_multiplier:1.1}});
  const player=evaluatePlayers(s,conflict,now).find(p=>p.id==='volatile');assert.equal(player.mean,12);assert.equal(player.conflicts.length,1);
});
test('research validates source provenance, deduplicates syndicated copies and rejects credentials',()=>{
  const r=research();r.findings.push({...r.findings[0],id:'duplicate'});assert.equal(parseResearch(JSON.stringify(r)).findings.length,1);
  for(const mutate of [r=>r.findings[0].source_url='https://evil.example/story',r=>r.findings[0].published_at='bad',r=>r.findings[0].extra={access_token:'sensitive'},r=>r.findings[0].effect.projection_multiplier=20]){const r=research();mutate(r);assert.throws(()=>parseResearch(JSON.stringify(r)));}
});
test('waiver strategy changes rankings using observed future inputs and all candidates remain inspectable',()=>{
  const s=fixture();const win=calculate(s,null,{...defaultSettings,waiver:'Win Now'},null,now),up=calculate(s,null,{...defaultSettings,waiver:'Upside'},null,now);
  assert.equal(win.waivers[0].id,'candidate');assert.equal(up.waivers[0].id,'stash');assert.equal(win.all_waivers.length,2);
});
test('FAAB bids and ranges stay within budget, zero balance, and supported increments',()=>{
  for(const balance of [0,3,100]){const s=fixture();s.team.faab_remaining=balance;s.analysis_inputs.waiver_increment=2;for(const w of calculate(s,null,defaultSettings,null,now).waivers){assert.ok(w.bid>=0&&w.bid<=balance);assert.ok(w.range[1]<=balance);assert.equal(w.bid%2,0);assert.equal(w.remaining,balance-w.bid);}}
});
test('trade deadline is enforced before proposing anything; missing rosters produce no invented offers',()=>{
  const s=fixture();s.rules.trade_deadline='2026-11-01';assert.equal(calculate(s,null,defaultSettings,null,now).trades.opportunities.length,0);assert.match(calculate(s,null,defaultSettings,null,now).trades.limitation,/deadline/);
  delete s.rules.trade_deadline;delete s.analysis_inputs.teams;assert.equal(calculate(s,null,defaultSettings,null,now).trades.opportunities.length,0);
});
test('legacy and stale imports expose limits rather than fabricated probabilities or values',()=>{
  const s=fixture();s.schema_version=1;delete s.analysis_inputs;s.captured_at='2026-10-01T00:00:00Z';const result=calculate(s,null,defaultSettings,null,now);
  assert.equal(result.lineup.win_probability,null);assert.equal(result.playoffs.probability,null);assert.equal(result.freshness.yahoo_stale,true);assert.equal(result.freshness.news_stale,true);
});
function memory(){let state=null,etag=0;let source={snapshot:fixture(),etag:'source1'};return {store:{read:async()=>state?{value:structuredClone(state),etag:String(etag)}:null,write:async(value,expected)=>{if(expected!==(state?String(etag):undefined))throw Error('Concurrent change');state=structuredClone(value);etag++;},yahoo:async()=>source},get:()=>state,setSource:s=>source=s};}
test('Refresh Analysis reruns, persists results and settings, and tracks separate source timestamps',async()=>{
  const m=memory();await updateSettings(m.store,{...defaultSettings,lineup:'Safe'});await importResearch(m.store,JSON.stringify(research()));const result=await runAnalysis(m.store,now);
  assert.equal(result.analysis.calculated_at,new Date(now).toISOString());assert.equal(result.analysis.news_at,research().collected_at);assert.equal(result.settings.lineup,'Safe');assert.equal(needsAnalysis(result,fixture()),false);
  const again=await runAnalysis(m.store,now+1000);assert.notEqual(again.analysis.calculated_at,result.analysis.calculated_at);assert.match(again.analysis.changes[0],/No significant/);
  await updateSettings(m.store,{...defaultSettings,lineup:'Aggressive'});assert.equal(needsAnalysis(m.get(),fixture()),true);
});
test('failed compute, failed save, changed sources and missing inputs never advance saved success timestamp',async()=>{
  const m=memory();const saved=await runAnalysis(m.store,now);
  await assert.rejects(runAnalysis(m.store,now+1000,()=>{throw Error('Compute failed');}));assert.equal(m.get().analysis.calculated_at,saved.analysis.calculated_at);
  const broken={...m.store,write:async()=>{throw Error('Storage failed');}};await assert.rejects(runAnalysis(broken,now+1000));assert.equal(m.get().analysis.calculated_at,saved.analysis.calculated_at);
  let reads=0;await assert.rejects(runAnalysis({...m.store,yahoo:async()=>({snapshot:fixture(),etag:String(reads++)})},now+1000),/changed/);
  m.setSource(null);await assert.rejects(runAnalysis(m.store,now+1000),/Import and save/);assert.equal(m.get().analysis.calculated_at,saved.analysis.calculated_at);
});
test('new Yahoo projections invalidate and change analysis without collecting Yahoo data',async()=>{
  const m=memory();const a=await runAnalysis(m.store,now);const s=fixture();s.analysis_inputs.players[0].projection=100;s.captured_at='2026-11-06T19:45:00Z';m.setSource({snapshot:s,etag:'source2'});
  assert.equal(needsAnalysis(m.get(),s),true);const b=await runAnalysis(m.store,now+1000);assert.notEqual(a.analysis.lineup.projection,b.analysis.lineup.projection);assert.ok(b.analysis.changes.includes('New Yahoo snapshot imported.'));
});
test('playoff simulation requires complete schedule, compatible histories, records and known tiebreaker',()=>{
  const s=fixture(),i=s.analysis_inputs;i.playoff={teams:1,start_week:10,tie_breaker:'points_for'};i.records_through_week=8;
  for(const t of i.teams){t.wins=4;t.losses=4;t.ties=0;t.points_for=t.id===5?1000:900;}
  i.team_histories=i.teams.map(t=>({team_id:t.id,scoring_id:'test',through_week:8,points:[80,90,100,110,120,130,140,150]}));
  i.schedule=[{week:9,home:5,away:2,home_projection:120,away_projection:100}];
  const result=simulateSeason(s);assert.ok(result.probability>0&&result.probability<1);assert.deepEqual(simulateSeason(s),result);
  i.playoff.tie_breaker='unsupported';assert.equal(simulateSeason(s),null);i.playoff.tie_breaker='points_for';s.roster[0].actual=0;assert.equal(simulateSeason(s),null);delete s.roster[0].actual;i.schedule=[];assert.equal(simulateSeason(s),null);
});
test('trade scout finds mutual lineup gains from positional surplus and respects exact cutoff',()=>{
  const s=fixture(),i=s.analysis_inputs;s.rules.roster_positions=['RB','WR','BN'];i.roster_slots=['RB','WR'];
  const p=(id,position,projection)=>({id,name:id,position,eligible:[position],projection,ros_projection:projection,playoff_projection:projection});
  i.players=[p('my-rb1','RB',20),p('my-rb2','RB',18),p('my-wr','WR',5),p('their-rb','RB',5),p('their-wr1','WR',20),p('their-wr2','WR',18)];
  i.teams[0].roster=[{player_id:'my-rb1',slot:'RB'},{player_id:'my-wr',slot:'WR'},{player_id:'my-rb2',slot:'BN'}];i.teams[1].roster=[{player_id:'their-rb',slot:'RB'},{player_id:'their-wr1',slot:'WR'},{player_id:'their-wr2',slot:'BN'}];i.available_ids=[];
  const result=calculate(s,null,defaultSettings,null,now);assert.ok(result.trades.opportunities.length>0);for(const t of result.trades.opportunities){assert.ok(t.my_gain>0);assert.ok(t.their_gain>0);}
  i.trade_deadline_at='2026-11-06T21:00:00Z';s.rules.trade_deadline='2026-11-06';assert.ok(calculate(s,null,defaultSettings,null,now).trades.opportunities.length>0);assert.equal(calculate(s,null,defaultSettings,null,now+7200000).trades.opportunities.length,0);
});
