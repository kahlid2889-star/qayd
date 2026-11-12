// Zoomed close-up of the biggest won-tricks pile. Usage: node tests/e2e/pile-shot.mjs out.png
import { chromium } from "playwright";
const out = process.argv[2] || "screenshots/pile.png";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 6 });
await page.goto("http://127.0.0.1:8080/qayd.html?testfast"); await page.waitForTimeout(2500);
await page.evaluate(() => { cfg.stake = 0; startGame(); window.__a = setInterval(() => { try { if (document.querySelector("#ov").classList.contains("on")) return; if (R && pending) { if (R.phase === "play" && R.myTurn) resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); else document.querySelector("#act button")?.click(); } } catch (e) {} }, 200); });
for (let i = 0; i < 400; i++) {
  if (await page.evaluate(() => R && R.phase === "play" && (R.last || []).some((t, _, a) => a.filter((x) => x.w === t.w).length >= 3)).catch(() => false)) break;
  await page.waitForTimeout(150);
}
await page.evaluate(() => clearInterval(window.__a)); await page.waitForTimeout(500);
let best = null, most = 0;
for (const p of await page.$$(".eat")) { const c = await p.evaluate((e) => +e.dataset.tricks); if (c > most) { most = c; best = p; } }
const bb = await best.boundingBox();
await page.screenshot({ path: out, clip: { x: bb.x - 8, y: bb.y - 8, width: bb.width + 16, height: bb.height + 16 } });
console.log("tricks in pile:", most); await b.close();
