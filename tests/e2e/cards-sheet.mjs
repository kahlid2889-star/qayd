// Contact sheet of all 32 card faces at hand size, to judge the corner indices. Usage: node tests/e2e/cards-sheet.mjs out.png
import { chromium } from "playwright";
const out = process.argv[2] || "screenshots/cards.png";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:8080/qayd.html?testfast"); await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:99999;background:#2a3a55;display:grid;grid-template-columns:repeat(8,124px);gap:10px;padding:14px;align-content:start";
  for (let s = 0; s < 4; s++) for (let r = 0; r < 8; r++) { const e = cardEl({ s, r }); e.style.cssText = "--cw:120px;position:relative;width:120px;height:162px"; host.append(e); }
  document.body.append(host);
  const img = host.querySelector("img"); return { w: img.naturalWidth, h: img.naturalHeight, src: img.src.slice(0, 40) };
});
console.log(JSON.stringify(info)); await page.waitForTimeout(800);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1100, height: 720 } }); await b.close();
