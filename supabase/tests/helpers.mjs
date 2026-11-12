import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  execSync("./phase0/node_modules/.bin/supabase status -o env", { cwd: new URL("../..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"] })
    .toString().split("\n").filter((l) => l.includes("=")).map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").replace(/^"|"$/g, "")]; }));
export const URL_ = env.API_URL, KEY = env.PUBLISHABLE_KEY || env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
export const admin = () => createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

let n = 0; const run = Date.now().toString(36);
export async function newPlayer(tag = "p", username) {
  const c = mk(); n++;
  const un = username ?? `${tag}${run}${n}`.toLowerCase().slice(0, 20);
  const { data, error } = await c.auth.signUp({ email: `${un}@test.local`, password: "Passw0rd-test", options: { data: { username: un, display_name: `لاعب ${n}` } } });
  if (error) throw error;
  return { c, id: data.user.id, username: un, token: data.session.access_token, async rpc(name, args) { const r = await c.rpc(name, args); return r; } };
}
// Join private channels the way Phase 0 proved reliable: await setAuth once, then join everything together.
export async function listen(player, topics, onMsg) {
  const c = mk(); await c.realtime.setAuth(player.token);
  const results = await Promise.all(topics.map((t) => new Promise((resolve) => {
    const ch = c.channel(t, { config: { private: true } });
    ch.on("broadcast", { event: "*" }, (m) => onMsg(t, m.event, m.payload));
    const timer = setTimeout(() => resolve({ topic: t, status: "TIMED_OUT" }), 5000);
    ch.subscribe((s) => { if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(s)) { clearTimeout(timer); resolve({ topic: t, status: s }); } });
  })));
  return { c, results, close: () => c.realtime.disconnect() };
}
