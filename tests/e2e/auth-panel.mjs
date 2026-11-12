// Browser check of the account window on "/": sign-up, confirm mismatch, duplicate, wrong password,
// sign-in, Google button, no X button, and that the account id is never shown.
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8080", SHOTS = process.env.SHOTS || "/tmp/authshots";
import { mkdirSync } from "node:fs"; mkdirSync(SHOTS, { recursive: true });
const res = []; const check = (n, ok, d = "") => { res.push(!!ok); console.log(ok ? "PASS" : "FAIL", n, d); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-SA" });
const page = await ctx.newPage(); const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto(`${BASE}/`, { waitUntil: "load" }); await page.waitForTimeout(6500);
const gf = () => page.frames().find((f) => f.url().includes("qayd.html"));
const open = async () => { await gf().locator("#online-open").tap(); await page.waitForTimeout(1200); };
const body = () => page.locator("body").innerText();
const user = "khalid" + Date.now().toString(36).slice(-4);

await open();
await page.screenshot({ path: `${SHOTS}/1-signup.png` });
const t = await body();
check("sign-up asks only username, password, confirm", t.includes("اسم المستخدم") && t.includes("كلمة السر") && t.includes("تأكيد كلمة السر") && !t.includes("الاسم على الطاولة"));
check("no X button", !/المتابعة عبر X|X$/m.test(t) && !t.includes("عبر X"));
check("Google button shown (credentials set)", t.includes("المتابعة بحساب Google"));

const u = page.getByLabel("اسم المستخدم"), p = page.locator("#qa-pass"), c = page.getByLabel("تأكيد كلمة السر");
await u.fill(user); await p.fill("Passw0rd-test"); await c.fill("Passw0rd-xxxx");
await page.getByRole("button", { name: "سوِّ الحساب" }).tap(); await page.waitForTimeout(500);
check("mismatched confirm is caught", (await body()).includes("ما تتطابق"));
await u.fill("a b"); await page.waitForTimeout(200);
check("spaces in username are caught", (await body()).includes("بدون مسافات"));
await u.fill(user); await c.fill("Passw0rd-test");
await page.getByRole("button", { name: "سوِّ الحساب" }).tap(); await page.waitForTimeout(3500);
const after = await body();
check("new account signs in (room lobby visible)", after.includes("سوِّ غرفة") || after.includes("ادخل ديوانية"), after.slice(0, 80));

// account box (game gear -> account) never shows the id
await page.keyboard.press("Escape").catch(() => {});
await gf().evaluate(() => parent.postMessage({ source: "qayd-ui", open: "settings" }, location.origin)); await page.waitForTimeout(1200);
const acct = await body(); await page.screenshot({ path: `${SHOTS}/2-account.png` });
const uid = await page.evaluate(async () => (await (await fetch("/api/auth/get-session")).json())?.user?.id);
check("account window shows the username", acct.includes(user));
check("account window never shows the account id", uid && !acct.includes(uid), uid);
await gf().evaluate(() => { document.querySelector("#gear")?.click(); }); await page.waitForTimeout(900);
const inner = await gf().evaluate(() => document.querySelector("#se")?.innerText || "");
check("game settings never show the account id", uid && !inner.includes(uid) && !inner.includes("معرّف"), inner.slice(0, 80));

// sign out, then wrong password, duplicate username, and correct sign-in
await page.evaluate(async () => { await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); });
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(6500); await open();
await page.getByLabel("اسم المستخدم").fill(user); await page.locator("#qa-pass").fill("Passw0rd-test"); await page.getByLabel("تأكيد كلمة السر").fill("Passw0rd-test");
await page.getByRole("button", { name: "سوِّ الحساب" }).tap(); await page.waitForTimeout(2500);
check("duplicate username says it is taken (not 'wrong password')", (await body()).includes("مأخوذ"));
await page.getByRole("tab", { name: "تسجيل الدخول" }).tap(); await page.waitForTimeout(300);
check("sign-in has no confirm field", (await page.getByLabel("تأكيد كلمة السر").count()) === 0);
await page.locator("#qa-pass").fill("WrongPass-1"); await page.getByRole("button", { name: "ادخل", exact: true }).tap(); await page.waitForTimeout(2500);
check("wrong password is reported as such", (await body()).includes("غلط"));
await page.screenshot({ path: `${SHOTS}/3-wrong.png` });
await page.locator("#qa-pass").fill("Passw0rd-test"); await page.getByRole("button", { name: "ادخل", exact: true }).tap(); await page.waitForTimeout(3500);
const back = await body();
check("correct password signs in", back.includes("سوِّ غرفة") || back.includes("ادخل ديوانية"));
check("no page errors", errors.length === 0, JSON.stringify(errors));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`); await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
