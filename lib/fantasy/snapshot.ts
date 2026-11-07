export type RosterPlayer = {
  slot: string; name: string; team?: string; position?: string;
  opponent?: string; status?: string; bye?: number;
  projection?: number | null; actual?: number; game_status?: string;
};
export type Snapshot = {
  schema_version: 1; captured_at: string; timezone: string; method: string;
  league: { id: number; season: number; name: string };
  team: { id: number; name: string; record?: string; rank?: number; faab_remaining?: number };
  week: number; sources: Record<string, string>; roster: RosterPlayer[];
  matchup?: { opponent: string; score: number; opponent_score: number;
    live_projection: number; opponent_live_projection: number; win_probability?: number };
  standings?: unknown[]; scoring?: Record<string, unknown>;
  rules?: Record<string, unknown>; available_players?: unknown[];
  available_columns?: string[]; standings_columns?: string[];
  available_player_scope?: string; quality_notes?: string[];
  [key: string]: unknown;
};

export const MAX_SNAPSHOT_BYTES = 1024 * 1024;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string"; }
function number(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function integer(value: unknown): value is number { return number(value) && Number.isInteger(value) && value > 0; }
function fail(): never { throw new Error("Invalid snapshot. Check the schema, identity, dates, roster, and numeric fields."); }

// Inspect every field, including extensions, before allowing private data into the viewer.
function checkPrivateFields(value: unknown, depth = 0): void {
  if (depth > 30) throw new Error("Snapshot nesting is too deep.");
  if (string(value) && /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/=]+/i.test(value)) {
    throw new Error("Remove credentials from the snapshot.");
  }
  if (Array.isArray(value)) { value.forEach(item => checkPrivateFields(item, depth + 1)); return; }
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|cookie|authorization|client.?id|session|credential|^__proto__$|^constructor$|^prototype$/i.test(key)) {
      throw new Error("Remove credential or session fields from the snapshot.");
    }
    checkPrivateFields(item, depth + 1);
  }
}

export function parseSnapshot(text: string): Snapshot {
  if (new TextEncoder().encode(text).length > MAX_SNAPSHOT_BYTES) throw new Error("Snapshot must be 1 MB or smaller.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Choose a valid JSON snapshot file."); }
  checkPrivateFields(value);
  if (!object(value) || value.schema_version !== 1 || !string(value.captured_at) ||
      !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value.captured_at) ||
      !Number.isFinite(Date.parse(value.captured_at)) || Date.parse(value.captured_at) > Date.now() + 300000 ||
      !string(value.timezone) || !string(value.method) || !integer(value.week) || value.week > 18 ||
      !object(value.league) || !integer(value.league.id) || !integer(value.league.season) || !string(value.league.name) ||
      !object(value.team) || !integer(value.team.id) || !string(value.team.name) ||
      !object(value.sources) || !Object.keys(value.sources).length || !Array.isArray(value.roster) || !value.roster.length || value.roster.length > 100) fail();
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }); } catch { fail(); }
  if (value.team.faab_remaining !== undefined && (!number(value.team.faab_remaining) || value.team.faab_remaining < 0)) fail();
  if (value.team.rank !== undefined && !integer(value.team.rank)) fail();
  if (value.team.record !== undefined && !string(value.team.record)) fail();
  for (const url of Object.values(value.sources)) {
    if (!string(url)) fail();
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "football.fantasysports.yahoo.com" ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        !parsed.pathname.startsWith(`/f1/${value.league.id}/`) && parsed.pathname !== `/f1/${value.league.id}`) {
      throw new Error("Sources must be credential-free Yahoo league page URLs for this league.");
    }
  }
  for (const player of value.roster) {
    if (!object(player) || !string(player.name) || !string(player.slot)) fail();
    for (const key of ["team", "position", "opponent", "status", "game_status"]) {
      if (player[key] !== undefined && !string(player[key])) fail();
    }
    if (player.bye !== undefined && (!integer(player.bye) || player.bye > 18)) fail();
    if (player.projection !== undefined && player.projection !== null && !number(player.projection)) fail();
    if (player.actual !== undefined && !number(player.actual)) fail();
  }
  if (value.matchup !== undefined) {
    if (!object(value.matchup) || !string(value.matchup.opponent)) fail();
    for (const key of ["score", "opponent_score", "live_projection", "opponent_live_projection"]) {
      if (!number(value.matchup[key])) fail();
    }
    const chance = value.matchup.win_probability;
    if (chance !== undefined && (!number(chance) || chance < 0 || chance > 1)) fail();
  }
  for (const key of ["scoring", "rules"]) if (value[key] !== undefined && !object(value[key])) fail();
  for (const key of ["standings", "available_players"]) if (value[key] !== undefined && !Array.isArray(value[key])) fail();
  for (const key of ["available_columns", "standings_columns", "quality_notes"]) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(string))) fail();
  }
  if (value.available_player_scope !== undefined && !string(value.available_player_scope)) fail();
  return value as Snapshot;
}

// Future approved API adapter can return the same versioned Snapshot contract.
export interface FantasyDataProvider { load(input: string): Promise<Snapshot> }
export const manualProvider: FantasyDataProvider = { async load(input) { return parseSnapshot(input); } };

export function snapshotAgeHours(snapshot: Snapshot, now = Date.now()): number {
  return Math.max(0, (now - Date.parse(snapshot.captured_at)) / 3600000);
}
