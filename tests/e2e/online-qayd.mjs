// Online: the whole table watches a player's qayd window live, and real levels show on name plates.
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8080"; const tag = Date.now().toString(36).slice(-5);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = []; const check = (n, ok, d = "") => { results.push(!!ok); console.log(ok ? "PASS" : "FAIL", n, d); };
async function open(user) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA" });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/`, { waitUntil: "load" }); await page.waitForTimeout(6000);
  const gf = () => page.frames().find((f) => f.url().includes("qayd.html"));
  await gf().locator("#online-open").tap(); await page.waitForTimeout(1200);
  await page.locator("#qa-user").fill(user); await page.locator("#qa-pass").fill("pw-Test-12345"); await page.locator("#qa-confirm").fill("pw-Test-12345");
  await page.getByRole("button", { name: "سوِّ الحساب", exact: true }).tap(); await page.waitForTimeout(3500);
  return { page, gf, errors };
}
const autopilot = (P, on) => P.gf().evaluate((on) => { clearInterval(window.__auto); if (!on) return;
  window.__auto = setInterval(() => { try {
    const lu = document.querySelector("#lineup"); if (lu && !lu.hidden) lu.querySelector(".lu-stage")?.dispatchEvent(new Event("pointerdown"));
    const ob = document.querySelector("#ob"); if (ob.classList.contains("qc-watch")) return;
    if (document.querySelector("#ov").classList.contains("on")) { const nx = document.querySelector("#nx"); if (nx) nx.click(); else document.querySelector("#ob button")?.click(); return; }
    if (typeof R === "undefined" || !R || !pending) return;
    if (R.phase === "play" && R.myTurn) { if (window.__hold && R.last.length >= 2) { window.__held = true; return; } resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); return; }
    const bt = [...document.querySelectorAll("#act button")]; if (bt.length) bt[0].click();
  } catch (e) {} }, 300); }, on);
const until = async (P, fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await P.gf().evaluate(fn).catch(() => false)) return Date.now() - t; await P.page.waitForTimeout(100); } return -1; };
const A = await open("qa" + tag), B = await open("qb" + tag);
await A.page.getByRole("button", { name: /سوِّ غرفة/ }).tap(); await A.page.waitForTimeout(2500);
const code = ((await A.page.locator("body").innerText()).match(/\b\d{6}\b/) || [])[0];
await B.page.locator("input").first().fill(code); await B.page.getByRole("button", { name: "ادخل", exact: true }).tap(); await B.page.waitForTimeout(2500);
await A.page.getByRole("button", { name: "حر", exact: false }).first().tap().catch(() => {}); await A.page.waitForTimeout(800);
await A.page.getByRole("button", { name: "ابدأ الصكة" }).tap(); await A.page.waitForTimeout(4000);
await A.gf().evaluate(() => { window.__hold = true; });
await autopilot(A, true); await autopilot(B, true);
check("A reaches its turn with tricks on the table", (await until(A, () => window.__held === true && R.myTurn && !!pending, 150000)) >= 0);
// levels on B's phone: A's plate shows a level word, not just "opponent/partner"
const plate = await B.gf().evaluate(() => { const l = [1, 2, 3].find((p) => QaidSync.person(p)); return { text: document.querySelector("#s" + l + " .nm small")?.textContent || "", seat: l }; });
check("the other player's real level shows on his plate", /جديد/.test(plate.text), JSON.stringify(plate));
await autopilot(A, false);
// B uses another theme: the look is per player and must not touch the match
await B.gf().evaluate(() => theme("dark")); await B.page.waitForTimeout(400);
await A.gf().evaluate(() => qaid()); await A.page.waitForTimeout(300);
check("a warning comes first, with a way to keep playing", await A.gf().evaluate(() => !!document.querySelector("#qaid-yes") && !!document.querySelector("#qaid-no")));
check("B sees nothing until A confirms", await B.gf().evaluate(() => !document.querySelector("#ob").classList.contains("qc-watch")));
await A.gf().locator("#qaid-yes").tap(); await A.page.waitForTimeout(300);
const t1 = await until(B, () => document.querySelector("#ob").classList.contains("qc-watch") && document.querySelector("#ov").classList.contains("on"), 8000);
check("B sees A's qayd window open", t1 >= 0, `${t1} ms`);
check("B is told who is accusing", await B.gf().evaluate(() => /يقيّد/.test(document.querySelector("#ob").innerText)));
check("there is no way back for A", await A.gf().evaluate(() => !document.querySelector(".qc-close")));
const hands = await Promise.all([A, B].map((P) => P.gf().evaluate(() => ({ rows: document.querySelectorAll(".qc-hand").length, held: document.querySelectorAll(".qc-held").length, total: R.h.flat().length }))));
check("both phones list all four hands with every held card", hands.every((h) => h.rows === 4 && h.held === h.total && h.total > 0), JSON.stringify(hands));
await A.gf().locator(".qc-kind:not(.off)").first().tap();
const t2 = await until(B, () => document.querySelectorAll("#ob.qc-watch .qc-kind.on").length === 1, 8000);
check("B sees the kind A chose", t2 >= 0, `${t2} ms`);
await A.gf().locator(".qc-held").first().scrollIntoViewIfNeeded(); await A.gf().locator(".qc-held").first().tap();
const t3 = await until(B, () => document.querySelectorAll("#ob.qc-watch .qc-slot.on").length === 1, 8000);
check("B sees the held card A picked", t3 >= 0, `${t3} ms`);
// the same real card on both phones: compare by real seat, not by where it sits on screen
const samePick = await Promise.all([A, B].map((P) => P.gf().evaluate(() => { const e = document.querySelector("#ob .qc-slot.on"); if (!e) return null; const a = e.dataset.pid ? e.dataset.pid.split(":") : null; const c = e.querySelector(".cd"); return c.dataset.s + ":" + c.dataset.r; })));
check("it is the same card on both phones", samePick[0] && samePick[0] === samePick[1], samePick.join(" vs "));
await B.gf().locator(".qc-held.on").scrollIntoViewIfNeeded().catch(() => {});
await B.page.screenshot({ path: "screenshots/online-qayd-watch.png" });
check("B cannot press anything in A's window", await B.gf().evaluate(() => getComputedStyle(document.querySelector("#ob.qc-watch .qc-kind")).pointerEvents === "none"));
// A picks a second card and confirms: the round ends on both phones with the same result
await A.gf().evaluate(() => { const s = [...document.querySelectorAll(".qc-slot")].find((x) => !x.classList.contains("on")); s.click(); }); await A.page.waitForTimeout(200);
await A.gf().locator(".qc-go").tap();
const done = await Promise.all([A, B].map((P) => until(P, () => R && R.phase === "result" && !!document.querySelector("#nx"), 15000)));
check("the round ends on both phones", done.every((d) => d >= 0), done.join(","));
const verdict = await Promise.all([A, B].map((P) => P.gf().evaluate(() => ({ winnerReal: (R.forced.winner + QaidSync.you) % 2, tag: R.forced.tag, text: document.querySelector("#ob").innerText.slice(0, 60).replace(/\n/g, " ") }))));
check("both phones agree which team took the round", verdict[0].winnerReal === verdict[1].winnerReal, JSON.stringify(verdict));
await B.page.screenshot({ path: "screenshots/online-qayd-result-guest.png" });
check("B kept its own theme", await B.gf().evaluate(() => document.documentElement.dataset.theme === "dark") && await A.gf().evaluate(() => document.documentElement.dataset.theme !== "dark"));
await A.gf().evaluate(() => { window.__hold = false; }); await autopilot(A, true);
const k0 = await A.gf().evaluate(() => QaidSync.k);
await A.page.waitForTimeout(18000);
const ks = await Promise.all([A, B].map((P) => P.gf().evaluate(() => QaidSync.k)));
check("the match carries on afterwards on both phones", ks.every((k) => k > k0 + 3), `${k0} -> ${ks.join(",")}`);
const errors = [...A.errors, ...B.errors]; check("no page errors", errors.length === 0, JSON.stringify(errors).slice(0, 300));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
