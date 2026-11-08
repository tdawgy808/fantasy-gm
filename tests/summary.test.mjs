import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,research,now} from './engine-fixture.mjs';
import {calculate} from '../lib/fantasy/engine.ts';
import {defaultSettings} from '../lib/fantasy/strategies.ts';
import {buildGmSummary,captureSummaryBaseline,compareSummaryBaselines,currentFinding,weeklyOutlook} from '../lib/fantasy/summary.ts';
import {runAnalysis,initialState} from '../lib/fantasy/analysis-service.ts';
const result=()=>calculate(fixture(),research(),defaultSettings,null,now);
test('summary actions are capped and grounded in saved lineup or waiver decisions',()=>{
 const r=result(),s=buildGmSummary(fixture(),r,research(),[],false,now);
 assert.ok(s.actions.length>0&&s.actions.length<=3);
 for(const a of s.actions){for(const id of a.player_ids)assert.ok(r.players.some(p=>p.id===id));for(const id of a.evidence_ids)assert.ok(research().findings.some(f=>f.id===id));}
 const add=s.actions.find(a=>a.label==='ADD');if(add)assert.ok(r.waivers.some(w=>w.id===add.player_ids[0]&&w.immediate_gain>=1));
});
test('same inputs and changed retrieval times do not create new developments',()=>{
 const r=result(),old=captureSummaryBaseline(r,research(),9),fresh=research();fresh.collected_at=new Date(now).toISOString();fresh.findings[0].retrieved_at=fresh.collected_at;fresh.findings[0].id='changed-import-id';
 assert.deepEqual(compareSummaryBaselines(old,captureSummaryBaseline(r,fresh,9),fresh,now),[]);
});
test('status, material projection and strategy changes are reported, small moves are ignored',()=>{
 const r=result(),a=captureSummaryBaseline(r,research(),9),b=structuredClone(a);b.owner[0].status='Questionable';b.owner[0].mean+=2;b.settings.lineup='Aggressive';
 const c=compareSummaryBaselines(a,b,research(),now);assert.ok(c.some(x=>x.kind==='injury'));assert.ok(c.some(x=>x.kind==='projection'));assert.ok(c.some(x=>x.kind==='strategy'));
 const tiny=structuredClone(a);tiny.owner[0].mean+=.1;assert.deepEqual(compareSummaryBaselines(a,tiny,research(),now),[]);
});
test('stale or pending analysis suppresses actionable recommendations',()=>{
 for(const [pending,time] of [[true,now],[false,now+86400001]]){const s=buildGmSummary(fixture(),result(),research(),[],pending,time);assert.equal(s.blocked,true);assert.deepEqual(s.actions,[]);}
});
test('old publication is not made current by a recent retrieval',()=>{
 const f=research().findings[0];f.published_at='2026-10-01T00:00:00Z';f.retrieved_at=new Date(now).toISOString();assert.equal(currentFinding(f,now),false);f.published_at=null;assert.equal(currentFinding(f,now),false);
});
test('outlook uses Yahoo full-game projections rather than locked-game engine totals',()=>{
 const s=fixture();s.matchup={opponent:'Example other',score:5,opponent_score:3,live_projection:105.33,opponent_live_projection:108.29};const outlook=weeklyOutlook(s);assert.equal(outlook.mine,105.33);assert.match(outlook.conclusion,/3.0 points behind/);assert.match(outlook.strategy,/outside/);
});
test('no supported immediate actions explicitly says HOLD',()=>{
 const r=result();r.lineup.changes=[];r.waivers=[];r.trades.opportunities=[];const s=buildGmSummary(fixture(),r,null,[],false,now);assert.equal(s.actions[0].label,'HOLD');assert.equal(s.actions[0].title,'No action needed right now');assert.equal(s.research_stale,true);
});
test('baseline and changes save only with successful analysis and unchanged repeats clear changes',async()=>{
 let state=initialState(),fail=false;const store={read:async()=>({value:state,etag:'v'}),yahoo:async()=>({snapshot:fixture(),etag:'y'}),write:async next=>{if(fail)throw Error('save failed');state=next;}};
 await runAnalysis(store,now);assert.ok(state.summary_baseline);assert.deepEqual(state.summary_changes,[]);const before=state;fail=true;await assert.rejects(runAnalysis(store,now+1000));assert.equal(state,before);fail=false;await runAnalysis(store,now+2000);assert.deepEqual(state.summary_changes,[]);
});
test('summary updates when the saved optimizer recommendation changes',()=>{
 const s=fixture(),first=calculate(s,research(),defaultSettings,null,now);s.roster[0].projection=0;s.analysis_inputs.players[0].projection=0;
 const next=calculate(s,research(),defaultSettings,first,now+1000);const a=buildGmSummary(fixture(),first,research(),[],false,now),b=buildGmSummary(s,next,research(),[],false,now+1000);
 assert.ok(!a.actions.some(a=>a.label==='START'&&a.player_ids.includes('volatile')));assert.ok(b.actions.some(a=>a.label==='START'&&a.player_ids.includes('volatile')));
});
test('credible current research changes are tracked but old reports are not announced',()=>{
 const r=result(),a=captureSummaryBaseline(r,{...research(),findings:[]},9),fresh=research();fresh.findings[0].player_id='steady';fresh.findings[0].player='Steady';
 assert.ok(compareSummaryBaselines(a,captureSummaryBaseline(r,fresh,9),fresh,now).some(c=>c.kind==='research'));
 fresh.findings[0].published_at='2026-10-01T00:00:00Z';assert.deepEqual(compareSummaryBaselines(a,captureSummaryBaseline(r,fresh,9),fresh,now),[]);
});
