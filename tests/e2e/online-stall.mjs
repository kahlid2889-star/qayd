// Online play under bad conditions (local dev server). Three players + one bot.
//  A. the lead phone is connected but stuck (it stops deciding for the bots): the others must step in;
//  B. one guest is on a slow network (every server call +700 ms);
//  C. one guest loses half of its move uploads: no move may be lost.
// After each part: the match kept moving and every phone saw the same table at every decision.
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8080", PART = +(process.env.PART || 55);
const tag = Date.now().toString(36).slice(-5);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = []; const check = (n, ok, d = "") => { results.push(!!ok); console.log(ok ? "PASS" : "FAIL", n, d); };
async function open(user) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA" });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/`, { waitUntil: "load" }); await page.waitForTimeout(6000);
  const gf = () => page.frames().find((f) => f.url().includes("qayd.html"));
  await gf().locator("#online-open").tap(); await page.waitForTimeout(1200);
  await page.locator("#qa-user").fill(user); await page.locator("#qa-pass").fill("pw-Test-12345"); await page.locator("#qa-confirm").fill("pw-Test-12345");
  await page.getByRole("button", { name: "سوِّ الحساب", exact: true }).tap(); await page.waitForTimeout(3500);
  return { ctx, page, gf, errors };
}
const autopilot = (P) => P.gf().evaluate(() => {
  window.__qaydTrace = []; clearInterval(window.__auto);
  window.__auto = setInterval(() => { try {
    const lu = document.querySelector("#lineup"); if (lu && !lu.hidden) lu.querySelector(".lu-stage")?.dispatchEvent(new Event("pointerdown"));
    if (document.querySelector("#ov").classList.contains("on")) { const nx = document.querySelector("#nx"); if (nx) nx.click(); else document.querySelector("#ob .qc-go, #ob button")?.click(); return; }
    if (typeof R === "undefined" || !R || !pending) return;
    if (R.phase === "play" && R.myTurn) { resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); return; }
    const bt = [...document.querySelectorAll("#act button")]; if (bt.length) bt[Math.random() < .65 ? 0 : bt.length - 1].click();
  } catch (e) {} }, 350);
});
const peek = (P) => P.gf().evaluate(() => ({ on: !!(window.QaidSync && QaidSync.on), k: QaidSync.k, seat: QaidSync.you, lead: QaidSync.isLead(), trace: (window.__qaydTrace || []).map((t) => [t.k, t.state]) })).catch((e) => ({ err: String(e).slice(0, 100), k: -1, trace: [] }));
function same(ps) { const maps = ps.map((p) => new Map(p.trace)); let ok = 0, bad = 0; for (const [k, s] of maps[0]) for (const m of maps.slice(1)) if (m.has(k)) (m.get(k) === s ? ok++ : bad++); return { ok, bad }; }
async function part(name, players, secs = PART) {
  const before = (await Promise.all(players.map(peek))).map((p) => p.k);
  let maxGap = 0, last = Math.max(...before), lastAt = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) { await players[0].page.waitForTimeout(1000); const k = Math.max(...(await Promise.all(players.map(peek))).map((p) => p.k)); if (k !== last) { maxGap = Math.max(maxGap, Date.now() - lastAt); last = k; lastAt = Date.now(); } }
  maxGap = Math.max(maxGap, Date.now() - lastAt);
  const ps = await Promise.all(players.map(peek)); const s = same(ps);
  check(`${name}: the match kept moving`, ps.every((p, i) => p.k > before[i] + 8), `${before.join(",")} -> ${ps.map((p) => p.k).join(",")}`);
  check(`${name}: longest pause under 20 s`, maxGap < 20000, `${(maxGap / 1000).toFixed(1)} s`);
  check(`${name}: every phone saw the same table`, s.ok > 0 && s.bad === 0, `${s.ok} matches, ${s.bad} differences`);
}
const A = await open("sta" + tag), B = await open("stb" + tag), C = await open("stc" + tag);
await A.page.getByRole("button", { name: /سوِّ غرفة/ }).tap(); await A.page.waitForTimeout(2500);
const code = ((await A.page.locator("body").innerText()).match(/\b\d{6}\b/) || [])[0];
for (const P of [B, C]) { await P.page.locator("input").first().fill(code); await P.page.getByRole("button", { name: "ادخل", exact: true }).tap(); await P.page.waitForTimeout(2500); }
await A.page.getByRole("button", { name: "ابدأ الصكة" }).tap(); await A.page.waitForTimeout(4000);
for (const P of [A, B, C]) await autopilot(P);
await A.page.waitForTimeout(8000);
const lead = (await Promise.all([A, B, C].map(peek))).findIndex((p) => p.lead);
check("one phone is the lead", lead >= 0, `index ${lead}`);

// A. the lead stays connected but stops deciding for the bots and the deck
await [A, B, C][lead].gf().evaluate(() => { QaidSync.__real = QaidSync.stepInAfter; QaidSync.stepInAfter = () => Infinity; });
await part("A (lead stuck)", [A, B, C], PART + 25);
await [A, B, C][lead].gf().evaluate(() => { QaidSync.stepInAfter = QaidSync.__real; });

// B. slow network for one guest
const slow = [A, B, C][(lead + 1) % 3];
await slow.page.route("**/_serverFn/**", async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue().catch(() => {}); });
await part("B (slow guest)", [A, B, C]);
await slow.page.unroute("**/_serverFn/**", { behavior: "ignoreErrors" });

// C. half of one guest's move uploads fail
const flaky = [A, B, C][(lead + 2) % 3]; let dropped = 0;
await flaky.page.route("**/_serverFn/**", async (route) => { const body = route.request().postData() || ""; if (body.includes("matchId") && body.includes("seat") && body.includes("body") && Math.random() < .5) { dropped++; return route.abort().catch(() => {}); } await route.continue().catch(() => {}); });
await part("C (lost uploads)", [A, B, C]);
check("C: uploads were really dropped", dropped > 0, `${dropped} dropped`);
const errors = [...A.errors, ...B.errors, ...C.errors];
check("no page errors", errors.length === 0, JSON.stringify(errors).slice(0, 400));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
