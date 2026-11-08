"use client";
import { useEffect, useState } from "react";
import AvailablePlayers from "./available-players";
import DailyBriefing from "./daily-briefing";
import { MAX_SNAPSHOT_BYTES, manualProvider, snapshotAgeHours, type Snapshot } from "@/lib/fantasy/snapshot";
import { completed, standings, unavailable } from "@/lib/fantasy/analysis";

const tabs = ["Summary", "Briefing", "Roster", "Standings", "Available", "Intel"] as const;
type Tab = typeof tabs[number];
function points(value: number | null | undefined) { return typeof value === "number" ? value.toFixed(2) : "—"; }
function Tag({ text, tone = "neutral" }: { text: string; tone?: string }) { return <span className={`tag ${tone}`}>{text}</span>; }

export default function ManualRefresh() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("Summary");
  const [target,setTarget] = useState("");
  const [error, setError] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        for (const url of ["/api/manual/snapshot", "/api/manual/local"]) {
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          if (!response.ok) continue;
          const next = await manualProvider.load(await response.text());
          setSnapshot(current => current ?? next);
          break;
        }
      } catch { /* Optional saved data must not block manual file import. */ }
    })();
    return () => controller.abort();
  }, []);

  async function importFile(file: File | undefined) {
    if (!file) return; setError(""); setSaveMessage(""); setLoading(true);
    try {
      if (file.size > MAX_SNAPSHOT_BYTES) throw new Error("Snapshot must be 1 MB or smaller.");
      const next = await manualProvider.load(await file.text());
      if (snapshot && (snapshot.league.id !== next.league.id || snapshot.league.season !== next.league.season || snapshot.team.id !== next.team.id)) throw new Error("Different league, season or team. Clear the current view before opening another team.");
      if (snapshot && Date.parse(next.captured_at) < Date.parse(snapshot.captured_at)) throw new Error("This snapshot is older than the current one.");
      const notes: string[] = [];
      if (snapshot) {
        for (const p of next.roster) {
          const prior = snapshot.roster.find(old => old.name === p.name);
          if (!prior) notes.push(`Added: ${p.name}`);
          else {
            if (prior.slot !== p.slot) notes.push(`${p.name}: ${prior.slot} → ${p.slot}`);
            if (prior.status !== p.status) notes.push(`${p.name}: ${p.status || "no tag recorded"}`);
          }
        }
        for (const p of snapshot.roster) if (!next.roster.some(nextPlayer => nextPlayer.name === p.name)) notes.push(`Removed: ${p.name}`);
        if (snapshot.team.faab_remaining !== next.team.faab_remaining) notes.push(`FAAB: ${snapshot.team.faab_remaining ?? "unknown"} → ${next.team.faab_remaining ?? "unknown"}`);
        if (!notes.length) notes.push("No roster, status or FAAB changes detected.");
      }
      setChanges(notes); setSnapshot(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read snapshot."); }
    finally { setLoading(false); }
  }
  async function saveForDevices() {
    if (!snapshot) return;
    setSaving(true); setError(""); setSaveMessage("");
    try {
      const response = await fetch("/api/manual/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the snapshot.");
      setSaveMessage("Saved privately. This snapshot will load when you sign in on another device.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the snapshot."); }
    finally { setSaving(false); }
  }
  function exportFile() {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `fantasy-gm-${snapshot.captured_at.slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const injuries = snapshot?.roster.filter(p => /\b(Q|IR|NA|O|OUT|D)\b|questionable|inactive|doubtful/i.test(p.status || "") || snapshot.injury_notes?.some(note => note.player === p.name)) || [];
  const stale = snapshot ? snapshotAgeHours(snapshot) >= 24 : false;

  const snapshotTools = snapshot && <div className="snapshot-bar"><span><span className="status-dot" />{stale ? "Snapshot needs a refresh" : "Manual snapshot"}</span><time dateTime={snapshot.captured_at}>{new Date(snapshot.captured_at).toLocaleString("en-US", { timeZone: snapshot.timezone })} · {snapshot.timezone}</time><button className="text-button" disabled={saving || loading} onClick={() => void saveForDevices()}>{saving ? "Saving…" : "Save for my devices"}</button><button className="text-button" onClick={exportFile}>Export JSON ↓</button><button className="text-button" onClick={() => {setSnapshot(null);setChanges([]);setError("");setSaveMessage("");}}>Clear view</button></div>;

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/dashboard"><span className="brand-mark">FG</span><span>Fantasy GM<small>THE FRONT OFFICE</small></span></a><p className="sidebar-caption">WORKSPACE</p>
      <nav aria-label="Desktop dashboard sections">{tabs.map((name, i) => <button key={name} className={tab === name ? "nav-active" : ""} onClick={() => setTab(name)}><span className="nav-icon">{["◈", "≡", "▤", "▥", "⊕", "◎"][i]}</span>{name}{name === "Intel" && injuries.length > 0 && <span className="nav-count">{injuries.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><Tag text="READ ONLY" tone="mint" /><p>Every move is your call.<br />No transactions are submitted.</p><form action="/api/login/logout" method="post"><button className="text-button">Sign out ↗</button></form></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="mobile-brand"><span className="brand-mark">FG</span><strong>Fantasy GM</strong></div><span className="desktop-only muted">Your private front office</span><div className="topbar-right"><span className="status-dot" />Owner access<form action="/api/login/logout" method="post" className="mobile-only"><button className="text-button">Sign out</button></form></div></header>
      <main className={`workspace ${tab === "Summary" ? "summary-workspace" : tab === "Available" ? "available-page" : ""}`}><div className="page-heading"><div><p className="eyebrow">FANTASY FOOTBALL / {snapshot?.league.season ?? "MANUAL WORKSPACE"}</p><h1>{tab === "Summary" ? "GM Summary" : tab === "Briefing" ? "Daily Briefing" : tab === "Available" ? "Available Players" : `${tab}.`}</h1><p className="muted">{snapshot ? `${snapshot.team.name} · ${snapshot.league.name} · Week ${snapshot.week}` : "Bring your league into focus with a dated Yahoo snapshot."}</p></div><label className="primary-button import-button">{loading ? "Reading…" : "↑ Import snapshot"}<input aria-label="Import snapshot JSON" type="file" accept=".json,application/json" disabled={loading} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
        {saveMessage && <div role="status" className="notice">{saveMessage}</div>}
        {error && <div role="alert" className="notice danger">{error} Your previous snapshot is unchanged.</div>}
        {!snapshot ? <><section className="empty-state"><div className="empty-orbit">◈</div><p className="eyebrow">YOUR LEAGUE, ALL IN ONE PLACE</p><h2>Start with a fresh snapshot.</h2><p>Roster, matchup, standings, available players, and your waiver budget.<br />Import once. Review every angle.</p><label className="primary-button import-button">Choose JSON file<input aria-label="Choose snapshot JSON" type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></label><p className="small muted">Up to 1 MB · Imports stay in this tab until you choose Save for my devices</p></section><section className="card"><h2>How the manual refresh works</h2><div className="steps"><div><span>01</span><h3>Read Yahoo</h3><p>Gather the latest pages in your authorized session. Record the week, scoring, status tags and coverage.</p></div><div><span>02</span><h3>Import JSON</h3><p>Open the structured snapshot here. Credentials and session fields are rejected.</p></div><div><span>03</span><h3>Make the call</h3><p>Review projection comparisons and injury flags. All Yahoo actions remain yours to approve.</p></div></div></section></> : <>
          {tab === "Available" ? <details className="available-import-tools"><summary>Snapshot tools & saved data</summary>{snapshotTools}</details> : snapshotTools}
          {stale && <div className="notice">Captured over 24 hours ago. Availability and projections may have changed; recheck before making a decision.</div>}
          {tab !== "Briefing" && tab !== "Summary" && tab !== "Available" && <div className="metric-grid"><section className="metric"><p>RECORD</p><strong>{snapshot.team.record ?? "—"}</strong><span>Season to date</span></section><section className="metric"><p>LEAGUE RANK</p><strong>{snapshot.team.rank ? `#${snapshot.team.rank}` : "—"}</strong><span>Standings at capture</span></section><section className="metric"><p>FAAB REMAINING</p><strong className="mint-text">{snapshot.team.faab_remaining === undefined ? "—" : `$${snapshot.team.faab_remaining}`}</strong><span>No bids submitted</span></section><section className="metric"><p>AVAILABILITY FLAGS</p><strong className={injuries.length ? "amber-text" : ""}>{injuries.length}</strong><span>Including bench and IR</span></section></div>}
          <div role="tablist" aria-label="Dashboard sections" className="section-tabs">{tabs.map(name => <button role="tab" aria-selected={tab === name} aria-controls="dashboard-panel" key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
          <div role="tabpanel" id="dashboard-panel" aria-label={tab}>
          {(tab === "Summary" || tab === "Briefing") && <DailyBriefing snapshot={snapshot} mode={tab === "Summary" ? "summary" : "briefing"} target={target} onNavigate={section=>{setTarget(section);setTab("Briefing");}} />}
          {tab === "Roster" && <section className="card"><div className="card-heading"><h2>Your roster</h2><Tag text={`${snapshot.roster.length} PLAYERS`} /></div><div className="roster-list"><div className="roster-head"><span>POSITION / PLAYER</span><span>STATUS</span><span>BYE</span><span>PROJ.</span><span>ACTUAL</span></div>{snapshot.roster.map((p,i)=><div className={`roster-row ${["BN","IR"].includes(p.slot)?"bench-row":""}`} key={i}><div className="roster-player"><span className="slot">{p.slot}</span><div><strong>{p.name}</strong><p>{p.team || p.position || ""}{p.opponent ? ` · ${p.opponent}` : ""}{completed(p) ? " · Game started / complete" : ""}</p></div></div><span className="roster-status"><Tag text={p.status || "No tag"} tone={unavailable(p,snapshot.week)?"amber":"neutral"}/></span><span className="roster-bye">{p.bye ?? "—"}</span><strong>{points(p.projection)}</strong><strong className="mint-text">{points(p.actual)}</strong></div>)}</div><p className="small muted">No tag means no status was recorded. This screen cannot edit your Yahoo lineup.</p></section>}
          {tab === "Standings" && <section className="card"><div className="card-heading"><h2>The league table</h2><Tag text="AT CAPTURE" /></div>{standings(snapshot).length ? <div className="table-scroll"><table><thead><tr>{["Rank","Team","W–L–T","Points for","Points against","FAAB"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{standings(snapshot).map(row=><tr key={row.rank} className={row.team===snapshot.team.name?"your-team":""}><td>#{row.rank}</td><td><strong>{row.team}</strong>{row.team===snapshot.team.name&&<span className="you-label">YOU</span>}</td><td>{row.record}</td><td>{points(row.pf)}</td><td>{points(row.pa)}</td><td>${row.faab}</td></tr>)}</tbody></table></div> : <p className="muted">Standings were not included in this snapshot.</p>}</section>}
          {tab === "Available" && <AvailablePlayers snapshot={snapshot} />}
          {tab === "Intel" && <div className="intel-grid"><section className="card"><h2>Injury information</h2><p className="small muted">Imported status tags, not a live injury feed.</p>{injuries.map(p=><div className="injury-card" key={p.name}><div className="card-heading"><h3>{p.name}</h3><Tag text={p.status || "Check"} tone="amber"/></div><p>{p.slot} · {p.team || "Team not recorded"} · {points(p.projection)} projected</p>{snapshot.injury_notes?.filter(n=>n.player===p.name).map((note,i)=><div key={i}><p>{note.summary}</p><p className="small muted">Updated {new Date(note.updated_at).toLocaleString()}{note.source_url && <> · <a href={note.source_url} target="_blank" rel="noreferrer">Yahoo source ↗</a></>}</p></div>)}{!snapshot.injury_notes?.some(n=>n.player===p.name)&&<p className="small muted">No sourced injury report included. Read Yahoo player notes before deciding.</p>}</div>)}{!injuries.length&&<p>No injury tags recorded.</p>}</section><section className="card"><h2>Refresh notes</h2><p className="small muted">{snapshot.method}</p><ul className="notes">{(snapshot.quality_notes || ["No collection notes included."]).map((note,i)=><li key={i}>{note}</li>)}</ul>{changes.length>0&&<><h3>Changes since previous import</h3><ul className="notes">{changes.map((note,i)=><li key={i}>{note}</li>)}</ul></>}<h3>Source pages</h3><div className="source-links">{Object.entries(snapshot.sources).map(([name,url])=><a href={url} target="_blank" rel="noreferrer" key={name}>{name.replaceAll("_"," ")} ↗</a>)}</div></section><section className="card full-span"><h2>League rules & scoring</h2><p className="small muted">Recommendations use imported Yahoo projections. Custom scoring is preserved for review.</p><div className="rules-grid">{["scoring","rules"].map(key=><details key={key}><summary>{key === "scoring"?"Scoring values":"Roster, waivers & playoffs"}</summary><pre>{JSON.stringify(snapshot[key] ?? "Not provided",null,2)}</pre></details>)}</div></section></div>}
          </div></>}
        <footer className="workspace-footer"><span>FANTASY GM <span className="mint-text">/</span> YOUR CALL, ALWAYS.</span><span>Manual data · No Yahoo transactions · Private snapshot workspace</span></footer>
      </main><nav className="mobile-nav" aria-label="Mobile dashboard sections">{tabs.map((name,i)=><button key={name} className={tab===name?"active":""} onClick={()=>setTab(name)}><span>{["◈","≡","▤","▥","⊕","◎"][i]}</span>{name}</button>)}</nav>
    </div></div>;
}
