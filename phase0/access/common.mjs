import { execSync } from "node:child_process";
import { SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
export const API = "http://127.0.0.1:54321";
export const REALTIME_URL = API;                    // supabase-js appends /realtime/v1
export const BA = process.env.BA_ISSUER || "http://127.0.0.1:3999";
export const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const secret = execSync("docker inspect supabase_realtime_phase0 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^API_JWT_SECRET=' | cut -d= -f2-").toString().trim();
export async function localJwt(role) {   // LOCAL stack's own HS256 key: anon / service_role tokens for the local gateway only
  return new SignJWT({ role, iss: "supabase-demo" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(secret));
}
export async function newUser(i) {
  const email = `p0-${Date.now().toString(36)}-${i}@test.local`;
  const r = await fetch(`${BA}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: BA }, body: JSON.stringify({ email, password: "pw-Test-12345", name: `P${i}` }) });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const id = (await r.json()).user.id;
  const t = await (await fetch(`${BA}/api/auth/token`, { headers: { cookie, origin: BA } })).json();
  return { id, token: t.token, cookie };
}
export const sql = async (q, p) => { const c = new pg.Client({ connectionString: DB }); await c.connect(); try { return (await c.query(q, p)).rows; } finally { await c.end(); } };
// IMPORTANT (Phase 0 finding): setAuth() is async. If a private channel is joined before it resolves,
// the join can report SUBSCRIBED and still never receive server broadcasts. Always await it first.
export async function realtimeClient(anon, token) {
  const c = createClient(API, anon, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 100 } } });
  await c.realtime.setAuth(token);
  c.__token = token;
  return c;
}
// Phase 0 findings (supabase-js 2.119 vs Realtime 2.154):
//  1. await setAuth(token) ONCE before any private join (done in realtimeClient()).
//  2. Join ALL of a socket's private channels in the same tick (Promise.all). Joining one, then calling setAuth
//     again and joining another reports SUBSCRIBED for both but leaves both deaf.
//  3. SUBSCRIBED does not prove delivery; the client needs a server canary message after joining.
export function join(client, topic, onEvent = {}, ms = 6000) {
  return new Promise((resolve) => {
    const ch = client.channel(topic, { config: { private: true, broadcast: { self: false } } });
    for (const [ev, fn] of Object.entries(onEvent)) ch.on("broadcast", { event: ev }, (m) => fn(m.payload, Date.now()));
    const timer = setTimeout(() => resolve({ ch, status: "TIMED_OUT" }), ms);
    ch.subscribe((status, err) => { if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) { clearTimeout(timer); resolve({ ch, status, err: err?.message }); } });
  });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
