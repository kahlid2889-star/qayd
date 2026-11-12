import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage();
await page.goto("http://127.0.0.1:8080/qayd.html?testfast"); await page.waitForTimeout(2000);
const all = await page.evaluate(() => Object.fromEntries(Object.entries(window.QAID_CARD_ART).map(([k, v]) => [k, v.startsWith("data:image/svg+xml;base64,") ? atob(v.slice(26)) : v.slice(0, 60)])));
writeFileSync(process.argv[2], JSON.stringify(all)); 
for (const k of [0, 3, 7, 4]) { const s = all[k]; console.log("KEY", k, "len", s.length); console.log(s.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]+/g, "DATA").slice(0, 1500)); console.log("..."); }
await b.close();
