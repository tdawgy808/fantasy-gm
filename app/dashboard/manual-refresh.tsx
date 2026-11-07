"use client";

import { useState } from "react";
import { MAX_SNAPSHOT_BYTES, manualProvider, snapshotAgeHours, type Snapshot } from "@/lib/fantasy/snapshot";

export default function ManualRefresh() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(""); setLoading(true);
    try {
      if (file.size > MAX_SNAPSHOT_BYTES) throw new Error("Snapshot must be 1 MB or smaller.");
      const next = await manualProvider.load(await file.text());
      if (snapshot && (snapshot.league.id !== next.league.id || snapshot.league.season !== next.league.season || snapshot.team.id !== next.team.id)) {
        throw new Error("This file belongs to a different league, season, or team. Reload the page to start a separate review.");
      }
      if (snapshot && Date.parse(next.captured_at) < Date.parse(snapshot.captured_at)) throw new Error("This snapshot is older than the one already loaded.");
      const notes: string[] = [];
      if (snapshot) {
        for (const player of next.roster) {
          const prior = snapshot.roster.find(p => p.name === player.name);
          if (!prior) notes.push(`Added: ${player.name}`);
          else {
            if (prior.slot !== player.slot) notes.push(`${player.name}: ${prior.slot} → ${player.slot}`);
            if (prior.status !== player.status) notes.push(`${player.name}: status changed to ${player.status ?? "no tag"}`);
          }
        }
        for (const player of snapshot.roster) if (!next.roster.some(p => p.name === player.name)) notes.push(`Removed: ${player.name}`);
        if (snapshot.team.faab_remaining !== next.team.faab_remaining) notes.push(`FAAB: ${snapshot.team.faab_remaining ?? "unknown"} → ${next.team.faab_remaining ?? "unknown"}`);
      }
      setChanges(notes); setSnapshot(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the snapshot."); }
    finally { setLoading(false); }
  }

  return <section className="space-y-6">
    <div className="rounded-xl bg-slate-900 p-6 space-y-3">
      <h2 className="text-2xl font-semibold">Manual Yahoo refresh</h2>
      <p>Gather the latest Yahoo pages in your signed-in browser, then open the dated snapshot file here.</p>
      <p className="text-slate-400">Files are read in this browser tab only. Nothing is uploaded, saved to browser storage, or sent to Yahoo. Reloading clears the view.</p>
      <label className="block font-semibold">Open snapshot JSON
        <input type="file" accept=".json,application/json" disabled={loading} className="block mt-2 max-w-full" onChange={event => {
          void importFile(event.target.files?.[0]); event.target.value = "";
        }} />
      </label>
      {loading && <p role="status">Reading snapshot…</p>}
      {error && <p role="alert" className="text-red-300">{error} The previous snapshot, if any, is unchanged.</p>}
    </div>
    {!snapshot && <p>No snapshot loaded. Yahoo OAuth is preserved separately; API access remains disabled by default.</p>}
    {snapshot && <>
      <div className="rounded-xl bg-slate-900 p-6 space-y-2">
        <h2 className="text-2xl font-semibold">{snapshot.team.name} · Week {snapshot.week}</h2>
        <p>{snapshot.league.name} · {snapshot.league.season} · League {snapshot.league.id}</p>
        <p>Captured {new Date(snapshot.captured_at).toLocaleString("en-US", { timeZone: snapshot.timezone })} ({snapshot.timezone})</p>
        <p>{snapshot.method}</p>
        {snapshotAgeHours(snapshot) >= 24 && <p className="text-amber-300">This snapshot is over 24 hours old. Recheck availability before making decisions.</p>}
        <p>Record: {snapshot.team.record ?? "unknown"} · Rank: {snapshot.team.rank ?? "unknown"} · FAAB: {snapshot.team.faab_remaining === undefined ? "unknown" : `$${snapshot.team.faab_remaining}`}</p>
        {snapshot.matchup && <p>vs {snapshot.matchup.opponent}: {snapshot.matchup.score}–{snapshot.matchup.opponent_score}. Live projection {snapshot.matchup.live_projection}–{snapshot.matchup.opponent_live_projection}.</p>}
      </div>
      {!!changes.length && <div><h3 className="text-xl font-semibold">Changes from previously loaded snapshot</h3><ul className="list-disc pl-6">{changes.map((change, i) => <li key={i}>{change}</li>)}</ul></div>}
      <div className="overflow-x-auto"><table className="w-full text-left"><caption className="text-xl text-left mb-3">Roster</caption><thead><tr>{["Slot", "Player", "Status", "Bye", "Projected", "Actual"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
        <tbody>{snapshot.roster.map((player, i) => <tr className="border-t border-slate-700" key={i}><td className="p-2">{player.slot}</td><td className="p-2">{player.name}</td><td className="p-2">{player.status ?? "No tag recorded"}</td><td className="p-2">{player.bye ?? "—"}</td><td className="p-2">{player.projection ?? "—"}</td><td className="p-2">{player.actual ?? "—"}</td></tr>)}</tbody></table></div>
      <p>{snapshot.available_player_scope ?? "Available-player coverage was not recorded."}</p>
      {snapshot.quality_notes && <ul className="list-disc pl-6 text-amber-200">{snapshot.quality_notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
      {["standings", "available_players", "scoring", "rules"].map(key => snapshot[key] !== undefined && <details className="rounded-xl bg-slate-900 p-4" key={key}><summary>{key.replaceAll("_", " ")}</summary><pre className="overflow-auto text-sm mt-3">{JSON.stringify({ columns: snapshot[`${key === "available_players" ? "available" : key}_columns`], data: snapshot[key] }, null, 2)}</pre></details>)}
      <details><summary>Source pages</summary><ul>{Object.entries(snapshot.sources).map(([name, url]) => <li key={name}><a className="underline" href={url} target="_blank" rel="noreferrer">{name}</a></li>)}</ul></details>
    </>}
  </section>;
}
