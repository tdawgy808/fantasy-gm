import { Suspense } from "react";
import { requireOwner } from "@/lib/auth/owner";
import ManualRefresh from "./manual-refresh";
async function PrivateDashboard() { await requireOwner(); return <ManualRefresh />; }
export default function Dashboard() {
  return <Suspense fallback={<main className="login-shell">Opening your front office…</main>}><PrivateDashboard /></Suspense>;
}
