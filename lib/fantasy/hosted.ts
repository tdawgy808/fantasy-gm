import { MAX_SNAPSHOT_BYTES, parseSnapshot, type Snapshot } from "./snapshot.ts";

export class SnapshotConflict extends Error {}
export async function boundedText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) throw new Error("Missing JSON body.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_SNAPSHOT_BYTES) { await reader.cancel(); throw new Error("Snapshot must be 1 MB or smaller."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function projectSnapshot(text: string): Snapshot {
  const snapshot = parseSnapshot(text);
  // This single-owner project serves only the reviewed league and team.
  if (snapshot.league.id !== 121612 || snapshot.league.season !== 2026 || snapshot.team.id !== 5) {
    throw new Error("Choose the 2026 Da_Nucking_Futs snapshot for F-U & U.");
  }
  return snapshot;
}

export type SnapshotStore = {
  read(): Promise<{ snapshot: Snapshot; etag: string } | null>;
  write(text: string, etag?: string): Promise<void>;
};
export async function saveSnapshot(text: string, store: SnapshotStore): Promise<Snapshot> {
  const next = projectSnapshot(text);
  const current = await store.read();
  if (current && Date.parse(next.captured_at) <= Date.parse(current.snapshot.captured_at)) {
    throw new SnapshotConflict("A snapshot with this capture time or a newer one is already saved.");
  }
  await store.write(JSON.stringify(next), current?.etag);
  return next;
}
