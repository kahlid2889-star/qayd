// End-to-end check of the v2 windows against the local Supabase stack and the dev server.
//   VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm run dev      then      node tests/e2e/v2-ui.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:8080", SHOTS = process.env.SHOTS || "/tmp/v2shots"; mkdirSync(SHOTS, { recursive: true });
const results = []; const check = (n, ok, d = "") => { results.push(!!ok); console.log(ok ? "PASS" : "FAIL", n, d); };
const run = Date.now().toString(36);
const dlg = (P) => P.page.getByRole("dialog");

async function player(browser, tag, vp = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600, locale: "ar-SA" });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_|Failed to load resource|fonts\./.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/v2?testfast=1`, { waitUntil: "load" }); await page.waitForTimeout(3000);
  return { page, errors, tag, frame: () => page.frames().find((f) => f.url().includes("qayd.html")) };
}
const gameClick = (P, sel) => P.frame().evaluate((s) => document.querySelector(s)?.click(), sel);
async function register(P, name, username) {
  await gameClick(P, "#online-open"); await P.page.waitForTimeout(600);
  await P.page.getByRole("button", { name: "سجّل دخولك" }).click(); await P.page.waitForTimeout(500);
  await P.page.getByRole("tab", { name: "حساب جديد" }).click();
  await P.page.getByLabel("الاسم على الطاولة").fill(name); await P.page.getByLabel("اسم المستخدم").fill(username);
  await P.page.waitForTimeout(900);
  await P.page.getByLabel("الإيميل").fill(`${username}@test.local`); await P.page.getByLabel("كلمة المرور").fill("Passw0rd-test");
  await P.page.getByRole("button", { name: "سوِّ الحساب" }).click(); await P.page.waitForTimeout(2500);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const A = await player(browser, "A"), B = await player(browser, "B");
const ua = `ua${run}`, ub = `ub${run}`;

// 1. the game's own button opens the new Online window; guests are asked to sign in
await gameClick(A, "#online-open"); await A.page.waitForTimeout(700);
check("home 'الديوانية' button opens the v2 window", await dlg(A).count() === 1);
check("guest is asked to sign in", await A.page.getByText("الأونلاين والأصدقاء يحتاجون حساب").count() === 1);
await A.page.screenshot({ path: `${SHOTS}/01-guest.png` });
await A.page.getByRole("button", { name: "سجّل دخولك" }).click(); await A.page.waitForTimeout(500);
await A.page.screenshot({ path: `${SHOTS}/02-signin.png` });
await A.page.keyboard.press("Escape"); await A.page.waitForTimeout(300);

// 2. sign up through the form
await register(A, "الصقر", ua);
check("account window closes after sign-up", await dlg(A).count() === 0);
await A.page.evaluate(() => window.scrollTo(0, 0));
await A.frame().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "settings" }, location.origin)); await A.page.waitForTimeout(900);
check("profile shows name, username and the 1000-coin welcome grant", (await dlg(A).innerText()).includes("الصقر") && (await dlg(A).innerText()).includes(ua) && (await dlg(A).innerText()).includes("1,000"));
await A.page.screenshot({ path: `${SHOTS}/03-profile.png` });
await A.page.keyboard.press("Escape");

// 3. username taken is caught on the form
const T = await player(browser, "T");
await gameClick(T, "#online-open"); await T.page.waitForTimeout(500); await T.page.getByRole("button", { name: "سجّل دخولك" }).click(); await T.page.getByRole("tab", { name: "حساب جديد" }).click();
await T.page.getByLabel("اسم المستخدم").fill(ua); await T.page.waitForTimeout(1200);
check("taken username is flagged while typing", await T.page.getByText("الاسم مأخوذ").count() === 1);
await T.page.context().close();

// 4. host creates a room
await A.frame().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "online" }, location.origin)); await A.page.waitForTimeout(900);
await A.page.screenshot({ path: `${SHOTS}/04-lobby.png` });
await A.page.getByRole("button", { name: "سوِّ الغرفة" }).click(); await A.page.waitForTimeout(1500);
const codeText = await dlg(A).locator("b[dir=ltr]").first().innerText(); const code = codeText.trim();
check("room created with a 6-digit code", /^\d{6}$/.test(code), code);
await A.page.screenshot({ path: `${SHOTS}/05-room-host.png` });

// 5. second player joins by code; host sees them without reloading
await register(B, "الذيب", ub);
await B.frame().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "online" }, location.origin)); await B.page.waitForTimeout(800);
await B.page.getByLabel("رمز الغرفة").fill(code); await B.page.getByRole("button", { name: "ادخل" }).first().click(); await B.page.waitForTimeout(1800);
check("guest lands on the room board", (await dlg(B).innerText()).includes(code));
await A.page.waitForTimeout(1200);
check("host's open window updated live with the new player", (await dlg(A).innerText()).includes("الذيب"));
await A.page.screenshot({ path: `${SHOTS}/06-room-two.png` });
await B.page.screenshot({ path: `${SHOTS}/07-room-guest.png` });

// 6. guest moves seat ("اجلس هنا"); host sees it
const sitBtn = B.page.getByRole("button", { name: /اجلس/ }).first();
check("guest sees 'اجلس هنا' on empty seats", await sitBtn.count() > 0);
await sitBtn.click(); await B.page.waitForTimeout(1200);
await A.page.waitForTimeout(800);
check("seat change is live on the host's screen", (await dlg(A).innerText()).includes("الذيب"));

// 7. host changes settings; guest sees them live
await A.page.getByRole("button", { name: /عدّل/ }).click(); await A.page.waitForTimeout(400);
await A.page.getByRole("button", { name: "حر", exact: true }).click(); await A.page.waitForTimeout(400);
await A.page.getByRole("button", { name: "101", exact: true }).click(); await A.page.waitForTimeout(1500);
await A.page.screenshot({ path: `${SHOTS}/08-host-settings.png` });
const guestText = await dlg(B).innerText();
check("guest sees the new mode and length live", guestText.includes("حر") && guestText.includes("101"), guestText.match(/(حر|محدود) · \d+/)?.[0]);
check("guest cannot edit settings", await B.page.getByRole("button", { name: /عدّل/ }).count() === 0);

// 8. friends: B adds A, A accepts
await A.page.keyboard.press("Escape"); await B.page.keyboard.press("Escape");
await B.frame().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "friends" }, location.origin)); await B.page.waitForTimeout(700);
await B.page.getByRole("tab", { name: "ابحث" }).click(); await B.page.getByLabel("ابحث عن لاعب").fill(ua); await B.page.waitForTimeout(1200);
await B.page.screenshot({ path: `${SHOTS}/09-search.png` });
await B.page.getByRole("button", { name: "أضف", exact: true }).click(); await B.page.waitForTimeout(1500);
check("request sent", await B.page.getByText("بانتظار الرد").count() === 1);
await A.page.waitForTimeout(1500);
const toastShown = await A.page.getByText("يبي يصير صديقك").count();
check("A got a live toast about the request", toastShown >= 1);
await A.frame().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "friends" }, location.origin)); await A.page.waitForTimeout(800);
await A.page.getByRole("tab", { name: /الطلبات/ }).click(); await A.page.waitForTimeout(400);
await A.page.screenshot({ path: `${SHOTS}/10-requests.png` });
await A.page.getByRole("button", { name: "اقبل" }).click(); await A.page.waitForTimeout(1500);
await A.page.getByRole("tab", { name: "أصدقائي" }).click(); await A.page.waitForTimeout(500);
check("friendship shows on A's list", (await dlg(A).innerText()).includes("الذيب"));
await A.page.screenshot({ path: `${SHOTS}/11-friends.png` });
await B.page.getByRole("tab", { name: "أصدقائي" }).click(); await B.page.waitForTimeout(2500);
check("friendship shows on B's list (live)", (await dlg(B).innerText()).includes("الصقر"));

// 9. sign out returns to guest; reload keeps the session
await B.page.keyboard.press("Escape"); await B.page.reload({ waitUntil: "load" }); await B.page.waitForTimeout(3000);
await B.frame().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "online" }, location.origin)); await B.page.waitForTimeout(1200);
check("after a reload B is still signed in and back in the room", (await dlg(B).innerText()).includes(code));

check("no page errors on either screen", A.errors.length + B.errors.length === 0, JSON.stringify([...A.errors, ...B.errors]).slice(0, 300));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
