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
await A.gf().evaluate(() => qaid()); await A.page.waitForTimeout(300);
const t1 = await until(B, () => document.querySelector("#ob").classList.contains("qc-watch") && document.querySelector("#ov").classList.contains("on"), 8000);
check("B sees A's qayd window open", t1 >= 0, `${t1} ms`);
check("B is told who is accusing", await B.gf().evaluate(() => /يقيّد/.test(document.querySelector("#ob").innerText)));
await A.gf().locator(".qc-kind:not(.off)").first().tap(); 
const t2 = await until(B, () => document.querySelectorAll("#ob.qc-watch .qc-kind.on").length === 1, 8000);
check("B sees the kind A chose", t2 >= 0, `${t2} ms`);
await A.gf().locator(".qc-slot").first().tap();
const t3 = await until(B, () => document.querySelectorAll("#ob.qc-watch .qc-slot.on").length === 1, 8000);
check("B sees the card A picked", t3 >= 0, `${t3} ms`);
const samePick = await Promise.all([A, B].map((P) => P.gf().evaluate(() => { const e = document.querySelector("#ob .qc-slot.on .cd"); return e ? e.dataset.s + ":" + e.dataset.r : null; })));
check("it is the same card on both phones", samePick[0] && samePick[0] === samePick[1], samePick.join(" vs "));
await B.page.screenshot({ path: "screenshots/online-qayd-watch.png" });
check("B cannot press anything in A's window", await B.gf().evaluate(() => getComputedStyle(document.querySelector("#ob.qc-watch .qc-kind")).pointerEvents === "none"));
await A.gf().locator(".qc-close").tap();
const t4 = await until(B, () => !document.querySelector("#ov").classList.contains("on"), 8000);
check("B's window closes when A backs out", t4 >= 0, `${t4} ms`);
await A.gf().evaluate(() => { window.__hold = false; }); await autopilot(A, true);
const k0 = await A.gf().evaluate(() => QaidSync.k);
await A.page.waitForTimeout(15000);
const ks = await Promise.all([A, B].map((P) => P.gf().evaluate(() => QaidSync.k)));
check("the match carries on afterwards on both phones", ks.every((k) => k > k0 + 3), `${k0} -> ${ks.join(",")}`);
const errors = [...A.errors, ...B.errors]; check("no page errors", errors.length === 0, JSON.stringify(errors).slice(0, 300));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
