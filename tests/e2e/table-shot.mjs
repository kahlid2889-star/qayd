// Close-up of the table mid-round: trick piles, seats and name plates. Usage: OUT=dir THEME=trad|dark|light node tests/e2e/table-shot.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = process.env.OUT || "screenshots/table"; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: +(process.env.W || 390), height: +(process.env.H || 844) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8080/qayd.html?testfast", { waitUntil: "load" }); await page.waitForTimeout(2500);
if (process.env.THEME) await page.evaluate((t) => theme(t), process.env.THEME);
await page.evaluate(() => { cfg.stake = 0; startGame(); window.__a = setInterval(() => { try { if (document.querySelector("#ov").classList.contains("on")) return; if (R && pending) { if (R.phase === "play" && R.myTurn) resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); else document.querySelector("#act button")?.click(); } } catch (e) {} }, 200); });
const t = Date.now();
while (Date.now() - t < 90000) { if (await page.evaluate(() => R && R.phase === "play" && (R.last || []).length >= 4 && R.trick.length >= 1 && new Set(R.last.map((x) => x.w)).size >= 2).catch(() => false)) break; await page.waitForTimeout(150); }
await page.evaluate(() => clearInterval(window.__a)); await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/full.png` });
const box = await page.locator("#tb").boundingBox();
await page.screenshot({ path: `${OUT}/table.png`, clip: box });
console.log("errors", JSON.stringify(errs)); await b.close();
