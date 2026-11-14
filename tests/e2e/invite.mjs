// Inviting friends from the room lobby. Local dev server only (PGLite).
//  1. three accounts; A becomes friends with B and C;
//  2. A makes a room: the lobby lists B and C with an invite button;
//  3. A invites B: B gets the banner, taps "ادخل" and lands in A's room; B leaves A's invite list;
//  4. "شارك رمز الغرفة" copies the code when the phone has no share sheet.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:8080";
mkdirSync("screenshots", { recursive: true });
const tag = Date.now().toString(36).slice(-5);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = []; const check = (name, ok, detail = "") => { results.push(!!ok); console.log(ok ? "PASS" : "FAIL", name, detail); };

async function open(user) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA", permissions: ["clipboard-read", "clipboard-write"] });
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

const A = await open("own" + tag), B = await open("bee" + tag), C = await open("cee" + tag);
// mutual requests turn into a friendship
await befriend(A, B.user); await befriend(B, A.user);
await befriend(A, C.user); await befriend(C, A.user);

await panel(A, "online"); await A.page.waitForTimeout(1200);
await A.page.getByRole("button", { name: /سوِّ غرفة/ }).tap(); await A.page.waitForTimeout(3500);
const code = ((await A.page.locator("body").innerText()).match(/\b\d{6}\b/) || [])[0];
check("room made", !!code, code);
const invite = A.page.getByRole("region", { name: "ادعُ أصدقاءك" });
await invite.getByText(B.user).waitFor({ timeout: 10000 }).catch(() => {});
const listText = await invite.innerText().catch(() => "");
check("lobby lists both friends", listText.includes(B.user) && listText.includes(C.user), listText.replace(/\n/g, " / "));
await invite.scrollIntoViewIfNeeded();
await A.page.screenshot({ path: "screenshots/invite-lobby.png" });

const rowB = invite.locator("li", { hasText: B.user });
await rowB.getByRole("button", { name: "ادعُه" }).tap(); await A.page.waitForTimeout(1500);
check("A's button shows the invite went out", (await rowB.innerText()).includes("انرسلت"));

let banner = "";
for (let i = 0; i < 20 && !banner.includes("يدعوك"); i++) { await B.page.waitForTimeout(1000); banner = await B.page.locator('[role="status"]').innerText().catch(() => ""); }
check("B gets the invite banner", banner.includes("يدعوك لصكة"), banner.replace(/\n/g, " / "));
await B.page.screenshot({ path: "screenshots/invite-banner.png" });
await B.page.locator('[role="status"]').getByRole("button", { name: "ادخل" }).tap(); await B.page.waitForTimeout(4000);
check("B lands in A's room", (await B.page.locator("body").innerText()).includes(code));

let gone = false;
for (let i = 0; i < 25 && !gone; i++) { await A.page.waitForTimeout(1000); gone = !(await invite.innerText().catch(() => "")).includes(B.user); }
check("B drops off A's invite list once seated", gone);
check("C is still on A's invite list", (await invite.innerText()).includes(C.user));

await A.page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
await invite.getByRole("button", { name: "شارك رمز الغرفة" }).tap(); await A.page.waitForTimeout(800);
const clip = await A.page.evaluate(() => navigator.clipboard.readText()).catch((e) => "ERR " + e);
check("share copies the room code", clip.includes(code), clip.replace(/\n/g, " / "));
check("share says it was copied", (await invite.innerText()).includes("انتسخ الرمز"));

const errors = [...A.errors, ...B.errors, ...C.errors];
check("no page errors", errors.length === 0, JSON.stringify(errors).slice(0, 600));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
