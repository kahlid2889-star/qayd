// Multi-round check of the ORIGINAL online system (host runs the table, guest plays through it).
// Local dev server only (PGLite). Reports completed rounds, scoreboard agreement, stalls and errors.
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8080", SECS = +(process.env.SECS || 240), LEN = process.env.LEN || "61";
const sfx = Date.now().toString(36).slice(-5); const log = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function mk(tag, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA" });
  const page = await ctx.newPage(); const errors = []; const navs = [];
  page.on("framenavigated", (f) => { if (f !== page.mainFrame() && f.url().includes("qayd.html")) navs.push(new Date().toISOString().slice(11, 19) + " " + f.url().split("?")[1]); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  await page.goto(`${BASE}/`, { waitUntil: "load" }); await page.waitForTimeout(6500);
  const gf = () => page.frames().find((f) => f.url().includes("qayd.html"));
  await gf().locator("#online-open").tap(); await page.waitForTimeout(1500);
  const i = page.locator("input"); await i.nth(0).fill(tag + sfx); await i.nth(1).fill(name); await i.nth(2).fill("pw-Test-12345");
  await page.getByRole("button", { name: "إنشاء الحساب" }).tap(); await page.waitForTimeout(3500);
  return { page, gf, errors, tag, navs };
}
const A = await mk("a", "المضيف"), B = await mk("b", "الضيف");
await A.page.getByRole("button", { name: /سوِّ غرفة/ }).tap(); await A.page.waitForTimeout(2500);
const code = ((await A.page.locator("body").innerText()).match(/\b\d{6}\b/) || [])[0];
await B.page.locator("input").first().fill(code); await B.page.getByRole("button", { name: "ادخل", exact: true }).tap(); await B.page.waitForTimeout(2500);
await A.page.getByRole("button", { name: LEN, exact: true }).tap(); await A.page.waitForTimeout(500);
await A.page.getByRole("button", { name: "ابدأ الصكة" }).tap(); await A.page.waitForTimeout(3500);

const reloads = { A: 0, B: 0 };
const st = (P) => !P.gf() ? (reloads[P.tag === "a" ? "A" : "B"]++, Promise.resolve({ err: "NO GAME FRAME (iframe gone or reloading)" })) : P.gf().evaluate(() => ({ gm: document.querySelector("#gm").classList.contains("on"), role: window.QaidNet?.role, hand: document.querySelectorAll("#hand .cd").length,
  acts: [...document.querySelectorAll("#act button")].map((x) => x.textContent), ov: document.querySelector("#ov").classList.contains("on"), ovText: document.querySelector("#ov").classList.contains("on") ? document.querySelector("#ob").innerText.slice(0, 80) : "",
  sc: typeof G !== "undefined" && G && G.sc ? G.sc.slice() : null, n: typeof G !== "undefined" && G ? G.n : null, hist: typeof G !== "undefined" && G && G.hist ? G.hist.length : null,
  phase: typeof R !== "undefined" && R ? R.phase : null, turn: typeof R !== "undefined" && R ? R.turn : null, trickN: typeof R !== "undefined" && R ? R.n : null, lineup: !!document.querySelector("#lineup:not([hidden]) .lu-stage") })).catch((e) => ({ err: String(e).slice(0, 140) }));
// host autopilot inside the page (the host plays seat 0 like a person would)
await A.gf().evaluate(() => { window.__hostBid = 0; setInterval(() => { try {
  const lu = document.querySelector("#lineup"); if (lu && !lu.hidden) lu.querySelector(".lu-stage")?.click();
  if (document.querySelector("#ov").classList.contains("on")) { document.querySelector("#nx")?.click(); return; }
  if (R && pending) { if (R.phase === "play" && R.myTurn) { if (R.n === 0 && !R.pl[0].length) declare(0); resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); }
    else { const bt = [...document.querySelectorAll("#act button")]; if (bt.length) { const sun = bt.find((b) => /^صن$/.test(b.textContent)); (sun && Math.random() < .35 ? sun : bt[Math.random() < .6 ? 0 : bt.length - 1]).click(); } } } } catch (e) {} }, 300); });

const t0 = Date.now(); let last = ""; let lastChange = Date.now(); let stalls = 0; const rounds = []; let mismatches = 0; let comparisons = 0; const maxGap = [];
while (Date.now() - t0 < SECS * 1000) {
  const sb = await st(B); const f = B.gf(); if (!f) { await A.page.waitForTimeout(500); continue; }
  if (sb.lineup) await f.locator("#lineup .lu-stage").tap({ force: true }).catch(() => {});
  if (sb.ov) await f.locator("#ob button").last().tap({ force: true }).catch(() => {});
  else if (sb.acts?.length && !/^سوا/.test(sb.acts.join("/"))) { const sun = f.locator("#act button", { hasText: /^صن$/ }); const hk = f.locator("#act button", { hasText: /^حكم/ }); if (await sun.count() && Math.random() < .35) await sun.first().tap({ force: true }).catch(() => {}); else if (await hk.count() && Math.random() < .5) await hk.first().tap({ force: true }).catch(() => {}); else await f.locator("#act button").first().tap({ force: true }).catch(() => {}); }
  else if (sb.acts?.length) {
    // the guest's turn: note which cards are offered, tap one, and time how long until the host moves on
    const info = await f.evaluate(() => ({ all: document.querySelectorAll("#hand .cd").length, ok: document.querySelectorAll("#hand .cd.ok").length, no: document.querySelectorAll("#hand .cd.no").length, myTurn: R.myTurn, mode: cfg.mode, hints: window.__qaydHints, pending: !!pending, legal: (() => { try { return legal(0).length; } catch (e) { return String(e).slice(0, 60); } })(), turn: R.turn, phase: R.phase }));
    (globalThis.__cls ??= []).push(info);
    const target = info.ok ? f.locator("#hand .cd.ok").first() : f.locator("#hand .cd").first();
    const before = JSON.stringify((await st(A)).trickN) + (await st(A)).turn; const t = Date.now();
    await target.tap({ force: true }).catch(() => {});
    for (let k = 0; k < 40; k++) { await A.page.waitForTimeout(100); const a = await st(A); if (JSON.stringify(a.trickN) + a.turn !== before) { (globalThis.__resp ??= []).push(Date.now() - t); break; } }
  }
  const sa = await st(A);
  const sig = JSON.stringify([sa.hist, sa.trickN, sa.phase, sa.turn, sa.hand, sb.hand]);
  if (sig !== last) { last = sig; maxGap.push(Date.now() - lastChange); lastChange = Date.now(); } else if (Date.now() - lastChange > 45000) { stalls++; lastChange = Date.now(); log.push(`STALL host=${JSON.stringify(sa)} guest=${JSON.stringify(sb)}`); }
  if (sa.hist !== null && (rounds.length === 0 || rounds[rounds.length - 1].hist !== sa.hist)) rounds.push({ hist: sa.hist, at: Math.round((Date.now() - t0) / 1000), sc: sa.sc });
  if (sa.sc && sb.sc && sa.phase === "bid") { comparisons++; if (sa.sc.join() !== sb.sc.join()) mismatches++; }
  if (Date.now() - (globalThis.__lp ?? 0) > 20000) { globalThis.__lp = Date.now(); console.log(`t+${Math.round((Date.now() - t0) / 1000)}s host ${JSON.stringify({ ph: sa.phase, turn: sa.turn, tr: sa.trickN, hand: sa.hand, acts: sa.acts?.join('/'), ov: sa.ovText })} | guest ${JSON.stringify({ gm: sb.gm, hand: sb.hand, acts: sb.acts?.join('/'), ov: sb.ovText, err: sb.err })}`); }
  await A.page.waitForTimeout(400);
}
const sa = await st(A), sb = await st(B);
console.log("host :", JSON.stringify({ sc: sa.sc, rounds: sa.hist, role: sa.role }));
console.log("guest:", JSON.stringify({ sc: sb.sc, role: sb.role, gm: sb.gm }));
console.log("rounds finished:", rounds.slice(1).map((r) => `#${r.hist}@${r.at}s ${r.sc?.join("-")}`).join("  "));
console.log("scoreboard agreement while bidding:", `${comparisons - mismatches}/${comparisons}`);
console.log("stalls over 45 s:", stalls); log.forEach((l) => console.log(l.slice(0, 400)));
const gaps = maxGap.filter((g) => g > 0).sort((a, b) => a - b); console.log("time between visible state changes on host (s): p50", (gaps[Math.floor(gaps.length * .5)] / 1000).toFixed(1), "p95", (gaps[Math.floor(gaps.length * .95)] / 1000).toFixed(1), "max", (gaps[gaps.length - 1] / 1000).toFixed(1));
console.log("game iframe (re)loads  host:", A.navs.length, JSON.stringify(A.navs.slice(-4)), " guest:", B.navs.length, JSON.stringify(B.navs.slice(-4)));
console.log("moments with no game frame (A host / B guest):", JSON.stringify(reloads));
console.log("guest hand classes on its turns (sample):", JSON.stringify((globalThis.__cls || []).slice(0, 5)));
const R_ = (globalThis.__resp || []).sort((a, b) => a - b); console.log("guest tap -> host moves on (ms): n", R_.length, "p50", R_[Math.floor(R_.length * .5)], "p95", R_[Math.floor(R_.length * .95)], "max", R_[R_.length - 1]);
console.log("errors:", JSON.stringify([...A.errors, ...B.errors]).slice(0, 400));
await browser.close();
