import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { AUTH_COOKIE, isOwner, sameOrigin } from "@/lib/auth/session";
import { blobSnapshotStore, hostedStorageConfigured } from "@/lib/fantasy/blob-store";
import { boundedText, projectSnapshot, saveSnapshot, SnapshotConflict } from "@/lib/fantasy/hosted";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(request: NextRequest) {
  await connection();
  if (!isOwner(request.cookies.get(AUTH_COOKIE)?.value)) return reply({ error: "Sign in required." }, 401);
  if (!hostedStorageConfigured()) return reply({ error: "Private storage is not configured." }, 503);
  try {
    const current = await blobSnapshotStore.read();
    return current ? reply(current.snapshot) : reply({ error: "No saved snapshot yet." }, 404);
  } catch { return reply({ error: "Unable to load the private snapshot. Try again later." }, 503); }
}
export async function POST(request: NextRequest) {
  await connection();
  if (!isOwner(request.cookies.get(AUTH_COOKIE)?.value)) return reply({ error: "Sign in required." }, 401);
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply({ error: "Use a JSON snapshot." }, 415);
  if (!hostedStorageConfigured()) return reply({ error: "Private storage is not configured." }, 503);
  let text: string;
  try { text = await boundedText(request.body); projectSnapshot(text); }
  catch (error) { return reply({ error: error instanceof Error ? error.message : "Invalid snapshot." }, 400); }
  try {
    const saved = await saveSnapshot(text, blobSnapshotStore);
    return reply({ saved: true, captured_at: saved.captured_at });
  } catch (error) {
    return error instanceof SnapshotConflict ? reply({ error: error.message }, 409) : reply({ error: "Unable to save. Your current view is unchanged; try again later." }, 503);
  }
}
