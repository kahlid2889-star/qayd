// Online play where every phone runs the same match (public/qayd-sync.js).
// Local dev server only (PGLite). Three players + one bot:
//  1. play rounds and check every phone saw the same table at every decision;
//  2. the room owner closes the page mid-match: the others must keep playing;
//  3. the owner comes back: the phone replays the moves and rejoins the same match.
// Prints move delivery times and any errors.
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8080";
const PHASE1 = +(process.env.PHASE1 || 150), PHASE2 = +(process.env.PHASE2 || 60), PHASE3 = +(process.env.PHASE3 || 90);
const tag = Date.now().toString(36).slice(-5);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = []; const check = (name, ok, detail = "") => { results.push(!!ok); console.log(ok ? "PASS" : "FAIL", name, detail); };

async function open(user, signUp) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA" });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_|Failed to load resource|status of 4/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/`, { waitUntil: "load" }); await page.waitForTimeout(6000);
  const gf = () => page.frames().find((f) => f.url().includes("qayd.html"));
  await gf().locator("#online-open").tap(); await page.waitForTimeout(1200);
  if (!signUp) await page.getByRole("tab", { name: "تسجيل الدخول" }).tap();
  await page.locator("#qa-user").fill(user); await page.locator("#qa-pass").fill("pw-Test-12345");
  if (signUp) await page.locator("#qa-confirm").fill("pw-Test-12345");
  await page.getByRole("button", { name: signUp ? "سوِّ الحساب" : "ادخل", exact: true }).tap(); await page.waitForTimeout(3500);
  return { ctx, page, gf, errors, user };
}
// Each phone plays its own seat like a person would, inside the page.
async function autopilot(P) {
  await P.gf().evaluate(() => {
    window.__qaydTrace = []; window.__qaydArrive = {}; window.__qaydPushed = {}; window.__snd = [];
    QaidNet.noteSound = (k) => window.__snd.push(k);
    clearInterval(window.__auto);
    window.__auto = setInterval(() => { try {
      const lu = document.querySelector("#lineup"); if (lu && !lu.hidden) lu.querySelector(".lu-stage")?.dispatchEvent(new Event("pointerdown"));
      if (document.querySelector("#ov").classList.contains("on") && /نهاية اللعبة/.test(document.querySelector("#ob").innerText)) window.__final = document.querySelector("#ob h2")?.innerText || "?";
      if (document.querySelector("#ov").classList.contains("on")) { const nx = document.querySelector("#nx"); if (nx) nx.click(); else document.querySelector("#ob .qc-go, #ob button")?.click(); return; }
      if (typeof R === "undefined" || !R || !pending) return;
      if (R.phase === "play" && R.myTurn) { if (R.n === 0 && !R.pl[0].length && Math.random() < .5) declare(0); resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); return; }
      const bt = [...document.querySelectorAll("#act button")]; if (!bt.length) return;
      const sun = bt.find((b) => /^صن$/.test(b.textContent)); (sun && Math.random() < .3 ? sun : bt[Math.random() < .65 ? 0 : bt.length - 1]).click();
    } catch (e) { /* next tick */ } }, 350);
  });
}
const peek = (P) => (P.gf() ? P.gf().evaluate(() => ({
  on: !!(window.QaidSync && QaidSync.on), k: window.QaidSync ? QaidSync.k : null, replay: !!(window.QaidSync && QaidSync.replaying),
  gm: document.querySelector("#gm").classList.contains("on"), n: typeof G !== "undefined" && G ? G.n : null, sc: typeof G !== "undefined" && G ? G.sc.slice() : null,
  final: window.__final || null, seat: window.QaidSync ? QaidSync.you : null,
  sounds: (window.__snd || []).length, soundKinds: [...new Set(window.__snd || [])].join(","),
  thrown: document.querySelectorAll("#sl0 .cd,#sl1 .cd,#sl2 .cd,#sl3 .cd").length,
  trace: (window.__qaydTrace || []).map((t) => [t.k, t.state]), arrive: window.__qaydArrive || {}, pushed: window.__qaydPushed || {},
})).catch((e) => ({ err: String(e).slice(0, 120) })) : Promise.resolve({ err: "no frame" }));

function compare(peeks, label) {
  const maps = peeks.map((p) => new Map((p.trace || []).map(([k, s]) => [k, s])));
  let same = 0, diff = 0, first = null;
  for (const [k, s] of maps[0]) for (const m of maps.slice(1)) if (m.has(k)) { if (m.get(k) === s) same++; else { diff++; first ??= { k, a: s.slice(0, 300), b: m.get(k).slice(0, 300) }; } }
  check(`${label}: every phone saw the same table at each decision`, same > 0 && diff === 0, `${same} matches, ${diff} differences${first ? " first at k=" + first.k + "\n  " + first.a + "\n  " + first.b : ""}`);
}
function latency(peeks) {
  const out = [];
  peeks.forEach((src, i) => Object.entries(src.pushed || {}).forEach(([k, t0]) => peeks.forEach((dst, j) => {
    if (i === j) return; const t1 = (dst.arrive || {})[k]; if (t1 && t1 >= t0) out.push(t1 - t0);
  })));
  out.sort((a, b) => a - b);
  return out.length ? `n ${out.length} · p50 ${out[Math.floor(out.length * .5)]} ms · p95 ${out[Math.floor(out.length * .95)]} ms · max ${out[out.length - 1]} ms` : "no samples";
}

const A = await open("own" + tag, true), B = await open("bee" + tag, true), C = await open("cee" + tag, true);
await A.page.getByRole("button", { name: /سوِّ غرفة/ }).tap(); await A.page.waitForTimeout(2500);
const code = ((await A.page.locator("body").innerText()).match(/\b\d{6}\b/) || [])[0];
for (const P of [B, C]) { await P.page.locator("input").first().fill(code); await P.page.getByRole("button", { name: "ادخل", exact: true }).tap(); await P.page.waitForTimeout(2500); }
await A.page.getByRole("button", { name: "61", exact: true }).tap(); await A.page.waitForTimeout(800);
await A.page.getByRole("button", { name: "ابدأ الصكة" }).tap(); await A.page.waitForTimeout(4000);
for (const P of [A, B, C]) await autopilot(P);

// 1. play
let t0 = Date.now();
while (Date.now() - t0 < PHASE1 * 1000) {
  await A.page.waitForTimeout(15000);
  const ps = await Promise.all([A, B, C].map(peek));
  console.log(`t+${Math.round((Date.now() - t0) / 1000)}s`, ps.map((p) => p.err || `k${p.k} n${p.n} ${p.sc}`).join(" | "));
}
let ps = await Promise.all([A, B, C].map(peek));
check("all three phones are in the online match", ps.every((p) => p.on && p.gm), ps.map((p) => p.err || p.on).join(","));
check("the match moved forward", ps.every((p) => p.k > 20), ps.map((p) => p.k).join(","));
compare(ps, "phase 1");
console.log("move delivery between phones:", latency(ps));
check("a non-owner phone plays the game sounds", ps[2].sounds > 10, `${ps[2].sounds} sounds: ${ps[2].soundKinds}`);
for (let i = 0; i < 30; i++) { const p = await peek(C); if (p.thrown >= 2) break; await C.page.waitForTimeout(300); }
await C.page.screenshot({ path: "screenshots/online-guest-midtrick.png" });

// 2. owner leaves
const kBefore = Math.min(...[B, C].map((_, i) => ps[i + 1].k));
await A.ctx.close();
t0 = Date.now();
while (Date.now() - t0 < PHASE2 * 1000) await B.page.waitForTimeout(5000);
ps = await Promise.all([B, C].map(peek));
check("after the owner left, the others are still in the match", ps.every((p) => p.on && p.gm), ps.map((p) => p.err || p.on).join(","));
check("after the owner left, the match kept going", ps.every((p) => p.k > kBefore + 8), `${kBefore} -> ${ps.map((p) => p.k).join(",")}`);
compare(ps, "phase 2 (owner gone)");
const banner = await B.page.locator("body").innerText();
check("the others see who left", banner.includes("الكمبيوتر يلعب عنه"));

// 3. owner comes back
const A2 = await open("own" + tag, false);
await A2.page.locator("input").first().fill(code); await A2.page.getByRole("button", { name: "ادخل", exact: true }).tap();
await A2.page.waitForTimeout(6000);
await autopilot(A2);
let back = await peek(A2);
check("the owner is back in the same match", back.on && back.gm, JSON.stringify({ on: back.on, gm: back.gm, k: back.k, err: back.err }));
t0 = Date.now();
while (Date.now() - t0 < PHASE3 * 1000) await A2.page.waitForTimeout(5000);
ps = await Promise.all([A2, B, C].map(peek));
check("after rejoining, everyone keeps playing", ps.every((p) => p.on || !p.gm), ps.map((p) => p.err || `k${p.k} on${p.on}`).join(","));
compare(ps, "phase 3 (owner back)");
console.log("move delivery between phones:", latency(ps));
// 4. finish the match: the two teams must see opposite results
t0 = Date.now();
while (Date.now() - t0 < +(process.env.FINISH || 420) * 1000) {
  ps = await Promise.all([A2, B, C].map(peek));
  if (ps.every((p) => p.final)) break;
  await B.page.waitForTimeout(5000);
}
console.log("final screens:", ps.map((p) => `seat ${p.seat}: ${p.final}`).join(" | "));
const won = (p) => /فزنا/.test(p.final || "");
check("the match ended on every phone", ps.every((p) => p.final), ps.map((p) => p.final).join(" | "));
check("partners see the same result and opponents the opposite", ps.every((p) => ps.every((q) => (p.seat % 2 === q.seat % 2) === (won(p) === won(q)))));
const errors = [...A.errors, ...B.errors, ...C.errors, ...A2.errors];
check("no page errors", errors.length === 0, JSON.stringify(errors).slice(0, 600));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
