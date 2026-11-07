import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { origin } from "@/lib/auth/session";
import { MAX_SNAPSHOT_BYTES, parseSnapshot } from "@/lib/fantasy/snapshot";

// Local refresh handoff only. Never serves a filesystem snapshot from a hosted app.
export async function GET() {
  await requireOwner();
  if (process.env.VERCEL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin()).hostname)) {
    return NextResponse.json({ error: "Local refresh is unavailable." }, { status: 404 });
  }
  const path = join(process.cwd(), "private", "snapshots", "current.json");
  try {
    if ((await stat(path)).size > MAX_SNAPSHOT_BYTES) return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
    const snapshot = parseSnapshot(await readFile(path, "utf8"));
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No validated local refresh is available." }, { status: 404 });
  }
}
