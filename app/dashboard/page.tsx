import ManualRefresh from "./manual-refresh";

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">
          🏈 Fantasy GM
        </h1>

        <p className="text-slate-400 mb-8">
          Da_Nucking_Futs | 2026 Season
        </p>

        <div className="bg-slate-900 rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-3">
            Yahoo Fantasy Connection
          </h2>

          <p className="text-slate-300">OAuth support is available. Connection status has not been checked on this page.</p>

          <p className="text-slate-400 mt-3">
            Use manual snapshots while Fantasy Sports API approval is pending.
          </p>
        </div>

        <ManualRefresh />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">

          <div className="bg-slate-900 rounded-xl p-6">
            <h3 className="text-lg font-semibold">
              📋 My Roster
            </h3>
            <p className="text-slate-400 mt-2">
              Coming soon
            </p>
          </div>

          <div className="bg-slate-900 rounded-xl p-6">
            <h3 className="text-lg font-semibold">
              ⚡ Lineup Optimizer
            </h3>
            <p className="text-slate-400 mt-2">
              Coming soon
            </p>
          </div>

          <div className="bg-slate-900 rounded-xl p-6">
            <h3 className="text-lg font-semibold">
              🎯 Waiver Wire
            </h3>
            <p className="text-slate-400 mt-2">
              Coming soon
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
