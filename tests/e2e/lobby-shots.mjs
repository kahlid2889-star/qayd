// Screenshots of the room window in its states (for design review), plus the buttons doing their jobs.
//   OUT=screenshots/lobby-before node tests/e2e/lobby-shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:8080", OUT = process.env.OUT || "screenshots/lobby";
mkdirSync(OUT, { recursive: true });
const tag = Date.now().toString(36).slice(-4);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = []; const check = (name, ok, detail = "") => { results.push(!!ok); console.log(ok ? "PASS" : "FAIL", name, detail); };

async function open(user, display) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ar-SA", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_|Failed to load resource|status of 4/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/`, { waitUntil: "load" }); await page.waitForTimeout(6000);
  const gf = () => page.frames().find((f) => f.url().includes("qayd.html"));
  await gf().locator("#online-open").tap(); await page.waitForTimeout(1200);
  await page.locator("#qa-user").fill(user); await page.locator("#qa-pass").fill("pw-Test-12345");
  await page.locator("#qa-confirm").fill("pw-Test-12345");
  await page.getByRole("button", { name: "سوِّ الحساب", exact: true }).tap(); await page.waitForTimeout(3500);
  return { ctx, page, gf, errors, user };
}
const panel = (P, name) => P.gf().evaluate((n) => parent.postMessage({ source: "qayd-ui", open: n }, location.origin), name);
async function befriend(P, other) {
  await panel(P, "friends"); await P.page.waitForTimeout(1200);
  await P.page.getByLabel("بحث عن لاعب").fill(other); await P.page.getByRole("button", { name: "بحث", exact: true }).tap(); await P.page.waitForTimeout(1500);
  await P.page.getByRole("button", { name: "أرسل طلب" }).first().tap(); await P.page.waitForTimeout(1500);
}
async function shot(P, name) {
  const sheet = P.page.getByRole("dialog").first();
  await sheet.evaluate((el) => { el.dataset.mh = el.style.maxHeight; el.style.maxHeight = "none"; });
  await P.page.setViewportSize({ width: 390, height: 2400 }); await P.page.waitForTimeout(400);
  await sheet.screenshot({ path: `${OUT}/${name}.png` });
  await P.page.setViewportSize({ width: 390, height: 844 });
  await sheet.evaluate((el) => { el.style.maxHeight = el.dataset.mh || ""; });
  await P.page.waitForTimeout(200);
}
const text = (P) => P.page.getByRole("dialog").first().innerText().catch(() => "");
const until = async (P, fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn(await text(P))) return true; await P.page.waitForTimeout(700); } return false; };

const A = await open("own" + tag), B = await open("bee" + tag), C = await open("cee" + tag), D = await open("dee" + tag);
for (const P of [B, C, D]) { await befriend(A, P.user); await befriend(P, A.user); }
await D.ctx.close(); // D stays a friend but goes offline

await panel(A, "online"); await A.page.waitForTimeout(1200);
await A.page.getByRole("button", { name: /سوِّ غرفة/ }).tap(); await A.page.waitForTimeout(3500);
const code = ((await A.page.locator("body").innerText()).match(/\b\d{6}\b/) || [])[0];
check("room made", !!code, code);
await until(A, (t) => t.includes(B.user) && t.includes(C.user));
await shot(A, "1-owner-alone");

// invite B from the lobby; B joins from the banner
await A.page.getByRole("button", { name: new RegExp("ادع.*" + B.user) }).or(A.page.locator("li", { hasText: B.user }).getByRole("button")).first().tap();
check("invite sent", await until(A, (t) => t.includes("انرسلت")));
let banner = "";
for (let i = 0; i < 25 && !banner.includes("يدعوك"); i++) { await B.page.waitForTimeout(1000); banner = await B.page.locator('[role="status"]').innerText().catch(() => ""); }
check("B gets the invite", banner.includes("يدعوك"));
await B.page.locator('[role="status"]').getByRole("button", { name: "ادخل" }).tap(); await B.page.waitForTimeout(4000);
check("owner sees B seated", await until(A, (t) => !t.includes("انرسلت") && (t.match(new RegExp(B.user, "g")) || []).length >= 1 && /٢ من ٤|2 من ٤/.test(t)));
await shot(A, "2-owner-with-guest");
await shot(B, "3-guest");

// settings: the owner changes them, the guest sees them
await A.page.getByRole("button", { name: /حر/ }).first().tap();
await A.page.getByRole("button", { name: "101" }).tap();
await A.page.getByRole("button", { name: /^.?100$/ }).first().tap().catch(() => {});
check("guest sees new settings", await until(B, (t) => /101/.test(t)), "");
// seats: the owner moves B to the other team, and back
const before = await text(A);
await A.page.getByRole("button", { name: /خلّه ضدي|خلّه معي/ }).first().tap();
check("owner moves a player", await until(A, (t) => t !== before && /خلّه (ضدي|معي)/.test(t)));
// C joins by code
await panel(C, "online"); await C.page.waitForTimeout(1000);
await C.page.locator("input").first().fill(code); await C.page.getByRole("button", { name: "ادخل", exact: true }).tap(); await C.page.waitForTimeout(3500);
check("C joined by code", await until(A, (t) => /٣ من ٤|3 من ٤/.test(t)));
// guest takes an empty seat
const cBefore = await text(C);
const sit = C.page.getByRole("button", { name: "اجلس هنا" }).first();
if (await sit.count()) { await sit.tap(); check("guest takes an empty seat", await until(C, (t) => t !== cBefore)); }
else check("guest has an empty seat to take", false);
await shot(A, "4-owner-three");
// share
await A.page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
await A.page.getByRole("button", { name: "شارك رمز الغرفة" }).tap(); await A.page.waitForTimeout(800);
const clip = await A.page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
check("share copies the code", clip.includes(code));
// guest leaves, owner starts
await C.page.getByRole("button", { name: "خروج من الجلسة" }).tap();
check("guest leaves", await until(A, (t) => /٢ من ٤|2 من ٤/.test(t)));
await A.page.getByRole("button", { name: "ابدأ الصكة" }).tap(); await A.page.waitForTimeout(5000);
const on = await A.gf().evaluate(() => !!(window.QaidSync && QaidSync.on)).catch(() => false);
check("start opens the match", on);

const errors = [...A.errors, ...B.errors, ...C.errors];
check("no page errors", errors.length === 0, JSON.stringify(errors).slice(0, 600));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
