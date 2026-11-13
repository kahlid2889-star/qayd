// Colour identity audit. For every screen in the three themes:
//  1. every text, background and border colour on screen must come from the identity (the theme's
//     colours, or a mix of two of them) — anything else is an "off-palette" colour;
//  2. every piece of text must be readable against what is behind it (WCAG contrast).
// Cards, portraits, the logo, coins and the board's steel cups are artwork and are skipped.
// Usage: node tests/e2e/theme-audit.mjs [theme]
import { chromium } from "playwright";
const only = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8080/qayd.html?testfast", { waitUntil: "load" }); await page.waitForTimeout(3000);
const scan = () => page.evaluate(() => {
  const probe = document.createElement("i"); document.body.append(probe);
  const rgb = (str) => { const m = String(str).match(/rgba?\(([^)]+)\)/); if (!m) { const c = String(str).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/); return c ? [c[1] * 255, c[2] * 255, c[3] * 255, c[4] === undefined ? 1 : +c[4]] : null; } const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]; };
  const tok = (name) => { probe.style.color = `var(${name})`; return rgb(getComputedStyle(probe).color); };
  const names = ["--c-bg", "--c-surface", "--c-primary", "--c-secondary", "--c-deep", "--c-accent", "--c-text", "--c-text-2", "--c-border", "--c-on-primary", "--c-on-accent", "--c-link", "--c-trim", "--c-primary-hover", "--c-chrome", "--c-on-chrome", "--c-danger", "--c-success"];
  const pal = names.map(tok).filter(Boolean).map((c) => c.slice(0, 3)).concat([[255, 255, 255], [0, 0, 0]]);
  probe.remove();
  const distSeg = (c, a, b2) => { const ab = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const l = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; let t = l ? (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ac[0] - ab[0] * t, ac[1] - ab[1] * t, ac[2] - ab[2] * t); };
  const onPalette = (c) => { for (let i = 0; i < pal.length; i++) for (let j = i; j < pal.length; j++) if (distSeg(c, pal[i], pal[j]) <= 9) return true; return false; };
  const skip = (el) => el.closest(".cd, .cb, img, svg, .coin, .coin-amt, .player-avatar-img, .qn-top-logo, .qaid-logo, .lu-rank, .rank-mini, #qayd-board, .eat, .seat .fan, #sp, .cf, canvas, .qn-ava, #lineup .lu-suits");
  const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const backdrop = (el) => { // what is painted behind this element's text
    const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const g = cs.backgroundImage !== "none" ? rgb(cs.backgroundImage) : null; if (g && g[3] > 0) stack.push(g); const c = rgb(cs.backgroundColor); if (c && c[3] > 0) stack.push(c); if ((g && g[3] === 1) || (c && c[3] === 1)) break; }
    let base = [255, 255, 255]; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const sig = (el) => (el.id ? "#" + el.id : el.tagName.toLowerCase()) + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "") + (el.parentElement ? " < " + (el.parentElement.id ? "#" + el.parentElement.id : el.parentElement.className?.toString().split(/\s+/)[0] || el.parentElement.tagName.toLowerCase()) : "");
  const off = {}, low = [];
  for (const el of document.querySelectorAll("body *")) {
    if (skip(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    if (el.closest(".mod:not(.on), #ov:not(.on), [hidden], .scr:not(.on)")) continue;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const note = (kind, c) => { if (!c || c[3] === 0) return; if (!onPalette(c)) { const k = kind + " " + c.slice(0, 3).map(Math.round).join(","); (off[k] ??= []).push(sig(el)); } };
    if (text) note("text", rgb(cs.color));
    note("background", rgb(cs.backgroundColor));
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none") note("border", rgb(cs.borderTopColor));
    if (text) { const fg = rgb(cs.color); if (fg) { const bg = backdrop(el); const fgc = over(fg, bg); const L1 = lum(fgc), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5; const op = +cs.opacity;
      if (ratio < need && op > .6 && !el.matches(":disabled, [aria-disabled='true'], .off, .short") && !el.closest(":disabled, [aria-disabled='true'], .off, .short")) low.push({ el: sig(el), ratio: +ratio.toFixed(2), need, text: el.textContent.trim().slice(0, 18), fg: fgc.map(Math.round).join(","), bg: bg.map(Math.round).join(",") }); } }
  }
  return { off, low };
});
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(150); } return false; };
const closeAll = () => page.evaluate(() => { document.querySelectorAll(".mod").forEach((e) => e.classList.remove("on")); });
let totalOff = 0, totalLow = 0;
for (const t of (only ? [only] : ["trad", "light", "dark"])) {
  const off = {}, low = new Map(); const take = async (state) => { const r = await scan(); for (const [k, v] of Object.entries(r.off)) (off[k] ??= new Set()).add(state + ": " + v[0]); for (const l of r.low) if (!low.has(l.el + l.text)) low.set(l.el + l.text, { state, ...l }); };
  await page.evaluate((t) => { theme(t); cfg.stake = 0; cfg.mode = "free"; }, t); await page.waitForTimeout(500);
  await take("home");
  await page.evaluate(() => openLobby()); await page.waitForTimeout(400); await take("lobby"); await closeAll();
  await page.evaluate(() => openSet()); await page.waitForTimeout(400); await take("settings");
  for (const pane of ["account", "sound", "look", "play", "privacy", "notes", "lang", "access", "help"]) { await page.evaluate((p) => document.querySelector(`.set-nav button[data-pane="${p}"]`).click(), pane); await page.waitForTimeout(250); await take("settings/" + pane); await page.evaluate(() => document.querySelector("#set-back").click()); await page.waitForTimeout(150); }
  await closeAll();
  await page.evaluate(() => showRules()); await page.waitForTimeout(300); await take("rules"); await page.evaluate(() => closeOv());
  for (let tries = 0; tries < 40; tries++) {
    await page.evaluate(() => { if (document.querySelector("#gm").classList.contains("on")) leaveGame(); startGame(); });
    const got = await until(() => R && ((R.phase !== "play" && R.phase !== "deal" && R.phase !== "result" && !!pending && document.querySelectorAll("#act button").length > 0) ? true : (R.phase === "play" || R.phase === "result") ? (window.__miss = true) : false), 20000);
    if (got && !(await page.evaluate(() => { const m = window.__miss; window.__miss = false; return m; }))) break;
  }
  await page.waitForTimeout(500); await take("bid");
  await page.evaluate(() => { window.__a = setInterval(() => { try { if (document.querySelector("#ov").classList.contains("on")) { document.querySelector("#nx")?.click(); return; } if (typeof G === "undefined" || !G) { startGame(); return; } if (R && pending) { if (R.phase === "play" && R.myTurn) { if (R.last.length >= 3) { window.__stop = true; return; } resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); } else document.querySelector("#act button")?.click(); } } catch (e) {} }, 120); });
  await until(() => window.__stop === true && R.myTurn, 120000); await page.evaluate(() => { clearInterval(window.__a); window.__stop = false; }); await page.waitForTimeout(600);
  await take("play");
  await page.evaluate(() => showHistory()); await page.waitForTimeout(300); await take("match book"); await page.evaluate(() => closeOv());
  await page.evaluate(() => qaid()); await page.waitForTimeout(300); await take("qayd warning");
  await page.evaluate(() => document.querySelector("#qaid-yes").click()); await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector(".qc-kind:not(.off)").click(); document.querySelectorAll(".qc-slot")[0].click(); document.querySelectorAll(".qc-slot")[1].click(); }); await page.waitForTimeout(200);
  await take("qayd window");
  await page.evaluate(() => document.querySelector(".qc-go").click());
  await until(() => R && R.phase === "result" && !!document.querySelector("#nx"), 20000); await page.waitForTimeout(400);
  await take("round result");
  await page.evaluate(() => { closeOv(); leaveGame(); }); await page.waitForTimeout(800);
  const offList = Object.entries(off), lowList = [...low.values()].sort((a, b2) => a.ratio - b2.ratio);
  totalOff += offList.length; totalLow += lowList.length;
  console.log(`\n=== ${t}: off-palette colours ${offList.length}, low-contrast texts ${lowList.length}`);
  offList.slice(0, 40).forEach(([k, v]) => console.log(`  OFF  ${k.padEnd(28)} e.g. ${[...v][0]}${v.size > 1 ? "  (+" + (v.size - 1) + " more)" : ""}`));
  lowList.slice(0, 40).forEach((l) => console.log(`  LOW  ${String(l.ratio).padEnd(5)} need ${l.need}  ${l.state}: ${l.el}  "${l.text}"  ${l.fg} on ${l.bg}`));
}
console.log("\npage errors:", JSON.stringify(errs)); console.log(totalOff + totalLow === 0 ? "AUDIT CLEAN" : `AUDIT: ${totalOff} off-palette, ${totalLow} low-contrast`);
await b.close(); process.exit(totalOff + totalLow === 0 ? 0 : 1);
