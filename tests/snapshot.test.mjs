import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot, manualProvider, snapshotAgeHours } from '../lib/fantasy/snapshot.ts';

function fixture() { return { schema_version: 1, captured_at: '2026-01-01T12:00:00Z', timezone: 'America/Los_Angeles', method: 'Manual Yahoo website', league: { id: 1, season: 2026, name: 'Example league' }, team: { id: 1, name: 'Example team', faab_remaining: 100 }, week: 9, sources: { roster: 'https://football.fantasysports.yahoo.com/f1/1/1' }, roster: [{ slot: 'QB', name: 'Example player', projection: 12, actual: 0 }] }; }
test('manual provider accepts a valid snapshot without fetching', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected network request'); };
  try { const result = await manualProvider.load(JSON.stringify(fixture())); assert.equal(result.roster[0].actual, 0); assert.equal(result.team.faab_remaining, 100); }
  finally { globalThis.fetch = previous; }
});
test('rejects credentials nested inside extension fields', () => {
  const value = fixture(); value.extra = { access_token: 'example-sensitive-value' };
  assert.throws(() => parseSnapshot(JSON.stringify(value)), /credential|session/);
});
test('rejects credential-bearing or wrong-league source URLs', () => {
  for (const url of ['https://example.com/f1/1', 'https://football.fantasysports.yahoo.com/f1/2', 'https://football.fantasysports.yahoo.com/f1/1?code=example']) {
    const value = fixture(); value.sources.roster = url; assert.throws(() => parseSnapshot(JSON.stringify(value)));
  }
});
test('rejects malformed roster, identity, dates, schema, and FAAB', () => {
  for (const update of [{ schema_version: 2 }, { captured_at: 'yesterday' }, { captured_at: '2999-01-01T00:00:00Z' }, { roster: [{ slot: 'RB', name: {} }] }, { team: { id: 1, name: 'Example', faab_remaining: -1 } }, { week: 19 }]) assert.throws(() => parseSnapshot(JSON.stringify({ ...fixture(), ...update })));
});
test('rejects oversize, prototype and deeply nested input', () => {
  assert.throws(() => parseSnapshot(' '.repeat(1024 * 1024 + 1)), /1 MB/);
  assert.throws(() => parseSnapshot('{"__proto__":{}}'), /credential|session/);
  let extra = {}; for (let i = 0; i < 35; i++) extra = { extra };
  assert.throws(() => parseSnapshot(JSON.stringify({ ...fixture(), extra })), /deep/);
});
test('reports snapshot age from capture time', () => {
  assert.equal(snapshotAgeHours(parseSnapshot(JSON.stringify(fixture())), Date.parse('2026-01-02T12:00:00Z')), 24);
});
