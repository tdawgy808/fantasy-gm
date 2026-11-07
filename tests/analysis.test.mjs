import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, recommendations, unavailable } from '../lib/fantasy/analysis.ts';
import { parseSnapshot } from '../lib/fantasy/snapshot.ts';

const base = () => ({ schema_version:1, captured_at:'2026-01-01T00:00:00Z', timezone:'UTC', method:'Synthetic test', league:{id:1,season:2026,name:'Example'}, team:{id:1,name:'Example'},week:9,sources:{roster:'https://football.fantasysports.yahoo.com/f1/1/1'},roster:[] });
test('recommendations honor eligibility, byes and inactive bench players', () => {
  const value = base(); value.roster = [{name:'Starter',slot:'WR',projection:10},{name:'Healthy',slot:'BN',position:'WR',projection:13},{name:'Inactive',slot:'BN',position:'WR',status:'NA / Inactive',projection:30},{name:'Bye',slot:'BN',position:'WR',bye:9,projection:40},{name:'Wrong position',slot:'BN',position:'QB',projection:50}];
  const result = recommendations(value); assert.equal(result[0].title,'Consider Healthy at WR');
  assert.equal(eligible({slot:'BN',position:'QB'}, 'W/R/T'), false);
  assert.equal(unavailable({status:'No injury tag on refreshed page'},9),false);
});
test('completed or started games are held fixed even with zero points', () => {
  for (const completion of [{actual:0},{game_status:'Final'},{game_status:'In progress'}]) {
    const value = base(); value.roster=[{name:'Starter',slot:'RB',projection:1,...completion},{name:'Bench',slot:'BN',position:'RB',projection:20}];
    assert.equal(recommendations(value).some(item=>item.level==='opportunity'),false);
  }
});
test('questionable starter gets a contingency, not a claimed confirmed injury report', () => {
  const value = base(); value.roster = [{name:'Starter',slot:'RB',status:'Q',projection:15},{name:'Backup',slot:'BN',position:'RB',projection:10}];
  assert.match(recommendations(value)[0].detail,/Backup.*contingency/);
});
test('malformed tabular data and injury links are rejected', () => {
  const value = base(); value.roster=[{name:'Example',slot:'QB'}];
  for (const extension of [{standings:[['bad']]},{available_players:[['Example','RB','FA','not a number']]},{injury_notes:[{player:'Example',summary:'Test',updated_at:'2026-01-01',source_url:'https://attacker.example'}]}]) assert.throws(()=>parseSnapshot(JSON.stringify({...value,...extension})));
});
