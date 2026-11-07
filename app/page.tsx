export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        <div className="text-6xl mb-6">🏈</div>

        <h1 className="text-5xl font-bold mb-4">
          Fantasy GM
        </h1>

        <p className="text-slate-400 mb-2">
          Your Personal Fantasy Football Assistant
        </p>

        <p className="text-slate-500 mb-8">
          Da_Nucking_Futs • 2026 Season
        </p>

        <a href="/dashboard" className="block mb-5 underline">Open manual refresh dashboard</a>

        <a
          href="/api/auth/yahoo"
          className="inline-block bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl font-semibold transition"
        >
          Connect to Yahoo Fantasy
        </a>

        <p className="text-slate-500 text-sm mt-8">
          Analyze your roster, optimize your lineup,
          and dominate the waiver wire.
        </p>
      </div>
    </main>
  );
}
