import { configured } from "@/lib/auth/session";
import { connection } from "next/server";
import { Suspense } from "react";
async function LoginCard() {
  await connection();
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">FG</div><p className="eyebrow">YOUR PRIVATE FRONT OFFICE</p><h1>Fantasy GM</h1><p className="muted">One league. Every decision in view.</p><div className="login-rule" /><h2>Owner access only</h2><p>Sign in with the approved GitHub account to open your dashboard. Yahoo authorization stays separate.</p>
    {configured() ? <a className="primary-button" href="/api/login/github">Continue with GitHub <span>↗</span></a> : <div className="notice">Owner sign-in needs configuration. Set the app origin, signing secret, GitHub OAuth credentials, and allowed owner ID on the server.</div>}
    <p className="small muted">No Yahoo transactions. Imported snapshots stay in your browser tab. If sign-in was denied, check that you used the approved owner account.</p></section></main>;
}
export default function Login() { return <Suspense fallback={<main className="login-shell">Opening sign-in…</main>}><LoginCard /></Suspense>; }
