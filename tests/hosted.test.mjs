import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedText, projectSnapshot, saveSnapshot, SnapshotConflict } from '../lib/fantasy/hosted.ts';

function fixture(captured_at = '2026-01-02T12:00:00Z') {
  return { schema_version: 1, captured_at, timezone: 'America/Los_Angeles', method: 'Manual Yahoo website', league: { id: 121612, season: 2026, name: 'Example' }, team: { id: 5, name: 'Example' }, week: 9, sources: { roster: 'https://football.fantasysports.yahoo.com/f1/121612/5' }, roster: [{ name: 'Example', slot: 'QB' }] };
}
test('hosted imports reject a different team or league before storage', async () => {
  for (const change of [{ team: { id: 6, name: 'Other' } }, { league: { id: 121612, season: 2025, name: 'Other' } }]) {
    assert.throws(() => projectSnapshot(JSON.stringify({ ...fixture(), ...change })), /2026/);
  }
  let accessed = false;
  await assert.rejects(saveSnapshot('{"password":"bad"}', { read: async () => { accessed = true; }, write: async () => {} }));
  assert.equal(accessed, false);
});
test('first save requires create-only write, subsequent save passes storage ETag', async () => {
  let current = null; const writes = [];
  const store = { read: async () => current, write: async (text, etag) => { writes.push(etag); current = { snapshot: JSON.parse(text), etag: 'revision-1' }; } };
  await saveSnapshot(JSON.stringify(fixture()), store);
  await saveSnapshot(JSON.stringify(fixture('2026-01-03T12:00:00Z')), store);
  assert.deepEqual(writes, [undefined, 'revision-1']);
});
test('older or duplicate imports cannot roll back saved data', async () => {
  let writes = 0;
  const store = { read: async () => ({ snapshot: fixture(), etag: 'revision' }), write: async () => { writes++; } };
  for (const date of ['2026-01-01T12:00:00Z', '2026-01-02T12:00:00Z']) await assert.rejects(saveSnapshot(JSON.stringify(fixture(date)), store), SnapshotConflict);
  assert.equal(writes, 0);
});
test('concurrent storage conflicts are returned to caller without retrying an overwrite', async () => {
  let writes = 0;
  const store = { read: async () => ({ snapshot: fixture(), etag: 'old' }), write: async () => { writes++; throw new SnapshotConflict('Changed'); } };
  await assert.rejects(saveSnapshot(JSON.stringify(fixture('2026-01-03T12:00:00Z')), store), SnapshotConflict);
  assert.equal(writes, 1);
});
test('body reader enforces byte limit on chunked bodies and cancels oversized input', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1024 * 1024)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
  await assert.rejects(boundedText(stream), /1 MB/); assert.equal(cancelled, true);
  const text = 'Football 🏈'; const bytes = new TextEncoder().encode(text);
  assert.equal(await boundedText(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 10)); c.enqueue(bytes.slice(10)); c.close(); } })), text);
});
