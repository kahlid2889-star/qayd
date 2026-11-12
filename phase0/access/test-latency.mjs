import { newUser, localJwt, realtimeClient, join, sql, sleep, pct, API } from "./common.mjs";
const N_DB = +(process.env.N_DB || 300), N_EDGE = +(process.env.N_EDGE || 200);
const anon = await localJwt("anon");
const code = "LAT" + Math.floor(Math.random() * 900 + 100);
const us = []; for (let i = 0; i < 4; i++) us.push(await newUser(i));
for (const [i, u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code, u.id, i]);
await sql("insert into p0_state(code) values($1) on conflict (code) do update set version=0, state='{}'", [code]);
await sql("delete from p0_events where code=$1", [code]);

// 4 players, each with seat + table channel joined together (the proven pattern), plus a canary.
const recv = [[], [], [], []]; const cls = [];
for (const u of us) cls.push(await realtimeClient(anon, u.token));
await Promise.all(cls.map((c, i) => Promise.all([
  join(c, `room:${code}:seat:${i}`, { canary: () => recv[i].push({ canary: 1 }) }),
  join(c, `room:${code}:table`, { play: (p) => recv[i].push({ seq: p.seq, at: Date.now(), sent_at: Date.parse(p.sent_at), client_sent: p.client_sent }) }),
])));
await sql("select realtime.send('{}'::jsonb,'canary','room:'||$1||':seat:'||g,true) from generate_series(0,3) g", [code]);
await sleep(800);
const live = recv.map((r) => r.length);

// ---- A: database -> clients (the trigger/RPC path)
let v = 0; const dbLat = [], dbE2E = [];
for (let n = 0; n < N_DB; n++) {
  const t0 = Date.now();
  const [{ r }] = await sql("select p0_apply($1,$2,'play',jsonb_build_object('n',$3::int)) as r", [code, v, n]);
  if (r !== v + 1) throw new Error("CAS drift " + r + " vs " + (v + 1)); v = r;
  await sleep(25);
  for (const rr of recv) { const m = rr.find((x) => x.seq === v); if (m) { dbLat.push(m.at - m.sent_at); dbE2E.push(m.at - t0); } }
}
await sleep(500);
const dbMissing = N_DB * 4 - dbLat.length;

// ---- B: client -> Edge Function -> CAS -> broadcast -> all 4 clients
const FN = `${API}/functions/v1/probe`; const httpMs = [], fnTotal = [], fnVerify = [], fnApply = [], e2e = [], cold = [];
let missingEdge = 0, failures = 0;
for (let n = 0; n < N_EDGE; n++) {
  const seat = n % 4, tSend = Date.now(); const base = recv.map((r) => r.length);
  const res = await fetch(FN, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${us[seat].token}` }, body: JSON.stringify({ code, expected: v, card: n, sent: tSend }) });
  const body = await res.json(); const tResp = Date.now();
  if (!body.ok) { failures++; if (failures < 3) console.log("edge fail", JSON.stringify(body)); continue; }
  v = body.version; httpMs.push(tResp - tSend); fnTotal.push(body.totalMs); fnVerify.push(body.verifyMs); fnApply.push(body.applyMs); if (n === 0) cold.push(tResp - tSend);
  await sleep(40);
  for (const rr of recv) { const m = rr.find((x) => x.seq === v); if (m) e2e.push(m.at - tSend); else missingEdge++; }
}
const stats = (a) => a.length ? { n: a.length, p50: Math.round(pct(a, .5)), p95: Math.round(pct(a, .95)), p99: Math.round(pct(a, .99)), max: Math.round(Math.max(...a)) } : null;
console.log("canary/liveness joined, messages seen right after join per socket:", live.join(","));
console.log("A. DB commit -> client receive (Realtime hop)   ms:", JSON.stringify(stats(dbLat)), "| missing", dbMissing, "of", N_DB * 4);
console.log("A'. SQL call start -> client receive             ms:", JSON.stringify(stats(dbE2E)));
console.log("B. Edge HTTP round trip (client view)            ms:", JSON.stringify(stats(httpMs)), "| first call", cold[0]);
console.log("B'. inside function: total/verify/apply          ms:", JSON.stringify(stats(fnTotal)), JSON.stringify(stats(fnVerify)), JSON.stringify(stats(fnApply)));
console.log("B''. action sent -> visible on ALL 4 clients     ms:", JSON.stringify(stats(e2e)), "| missing", missingEdge, "| edge failures", failures);

// ---- C: concurrency: 8 simultaneous actions with the SAME expected version -> exactly one wins
const results = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(FN, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${us[i % 4].token}` }, body: JSON.stringify({ code, expected: v, card: 900 + i }) }).then((r) => r.json())));
const winners = results.filter((r) => r.ok).length;
console.log(`C. 8 concurrent actions, same version: winners=${winners} (expected 1), stale-rejected=${results.filter((r) => r.ok === false && r.version === -1).length}`);
const [{ n: events }] = await sql("select count(*)::int n from p0_events where code=$1", [code]);
const [{ version }] = await sql("select version from p0_state where code=$1", [code]);
console.log(`   event log rows=${events} state.version=${version} consistent=${events === version}`);
// ---- D: wrong identity
const bad = await (await fetch(FN, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${us[0].token.slice(0, -3)}abc` }, body: JSON.stringify({ code, expected: version }) })).json();
const outsider = await newUser(77); const out = await (await fetch(FN, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${outsider.token}` }, body: JSON.stringify({ code, expected: version }) })).json();
console.log("D. tampered token rejected:", bad.ok === false, "| unseated player rejected:", out.ok === false && /not seated/.test(out.error || ""));
cls.forEach((c) => c.realtime.disconnect());
process.exit(0);
