// Soak: full solo matches on autopilot (fast mode), both play modes, random bids, sometimes sawa / qayd / projects.
// Reports matches finished, rounds, stalls, page errors and layout problems. Usage: MATCHES=4 node tests/e2e/soak.mjs
import { chromium } from "playwright";
const MATCHES = +(process.env.MATCHES || 4);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:8080/qayd.html?testfast", { waitUntil: "load" }); await page.waitForTimeout(2500);
const out = [];
for (let m = 0; m < MATCHES; m++) {
  const mode = m % 2 ? "free" : "friendly";
  await page.evaluate((mode) => { cfg.stake = 0; cfg.mode = mode; cfg.len = 152; window.__st = { rounds: 0, sawa: 0, qayd: 0, over: false, stall: 0, last: Date.now(), sig: "" };
    startGame();
    clearInterval(window.__a);
    window.__a = setInterval(() => { try {
      const st = window.__st; const sig = (typeof G !== "undefined" && G ? G.n + ":" : "") + (R ? R.phase + R.n + R.turn + R.trick.length : "-") + document.querySelector("#ov").classList.contains("on");
      if (sig !== st.sig) { st.sig = sig; st.last = Date.now(); } else if (Date.now() - st.last > 20000) { st.stall++; st.last = Date.now(); st.where = sig; }
      const ovOn = document.querySelector("#ov").classList.contains("on");
      if (ovOn) { const nx = document.querySelector("#nx"); if (nx) { if (/نهاية اللعبة/.test(document.querySelector("#ob").innerText)) st.over = true; else st.rounds++; nx.click(); return; }
        const yes = document.querySelector("#claim-yes"); if (yes) { yes.click(); return; }
        const go = document.querySelector("#ob.qaid-catch .qc-go"); if (go) { const k = document.querySelector(".qc-kind:not(.off)"); if (k && !k.classList.contains("on")) k.click(); const s = document.querySelectorAll(".qc-slot"); if (s.length >= 2) { if (!s[0].dataset.tag) s[0].click(); if (!s[1].dataset.tag) s[1].click(); go.click(); } else document.querySelector(".qc-close")?.click(); return; }
        document.querySelector("#ob button")?.click(); return; }
      if (!R || !pending) return;
      if (R.phase === "play" && R.myTurn) {
        const roll = Math.random();
        if (roll < .03 && !R.trick.length && R.n >= 5) { st.sawa++; sawa(); return; }
        if (roll < .05 && cfg.mode === "free" && R.last.length >= 2) { st.qayd++; qaid(); return; }
        if (R.n === 0 && !R.pl[0].length && Math.random() < .5) declare(0);
        const hand = R.h[0]; const card = cfg.mode === "free" && Math.random() < .15 ? hand[Math.floor(Math.random() * hand.length)] : aiPick(0);
        resolvePending({ card, from: center(document.querySelector("#hand")) }); return; }
      const bt = [...document.querySelectorAll("#act button")]; if (bt.length) bt[Math.floor(Math.random() * bt.length)].click();
    } catch (e) { (window.__errs ??= []).push(String(e).slice(0, 150)); } }, 60);
  }, mode);
  const t0 = Date.now(); let st;
  while (Date.now() - t0 < 240000) { await page.waitForTimeout(1000); st = await page.evaluate(() => window.__st); if (st.over) break; }
  const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, inner: (window.__errs || []).slice(0, 3) }));
  out.push({ match: m + 1, mode, finished: st.over, rounds: st.rounds, sawa: st.sawa, qayd: st.qayd, stalls: st.stall, where: st.where, secs: Math.round((Date.now() - t0) / 1000), ...layout });
  console.log(JSON.stringify(out[out.length - 1]));
  await page.evaluate(() => { clearInterval(window.__a); window.__errs = []; }); await page.waitForTimeout(800);
}
console.log("page errors:", JSON.stringify([...new Set(errs)]).slice(0, 900));
console.log(out.every((o) => o.finished && !o.stalls) && !errs.length ? "SOAK OK" : "SOAK PROBLEMS");
await b.close();
