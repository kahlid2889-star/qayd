// Computed-style snapshot of every kind of element on every screen, in the three themes.
// Used to prove a CSS refactor changed nothing: run before and after, then diff.
//   node tests/e2e/style-snapshot.mjs out.json          take a snapshot
//   node tests/e2e/style-snapshot.mjs a.json b.json     compare two snapshots
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
if (process.argv[3]) {
  const a = JSON.parse(readFileSync(process.argv[2], "utf8")), b = JSON.parse(readFileSync(process.argv[3], "utf8"));
  let same = 0, diff = 0, missing = 0; const shown = [];
  for (const [state, els] of Object.entries(a)) for (const [key, props] of Object.entries(els)) {
    const other = b[state]?.[key]; if (!other) { missing++; if (shown.length < 12) shown.push(`MISSING ${state} ${key}`); continue; }
    for (const [p, v] of Object.entries(props)) { if (other[p] === v) same++; else { diff++; if (shown.length < 25) shown.push(`${state} | ${key} | ${p}: ${String(v).slice(0, 70)}  ->  ${String(other[p]).slice(0, 70)}`); } }
  }
  console.log(`same ${same}  different ${diff}  missing ${missing}`); shown.forEach((s) => console.log("  " + s));
  process.exit(diff || missing ? 1 : 0);
}
const PROPS = ["display", "position", "width", "height", "min-height", "max-width", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "color", "background-color", "background-image", "border-top-width", "border-top-color", "border-top-style", "border-right-width", "border-left-color", "border-bottom-width", "border-bottom-color",
  "border-top-left-radius", "border-bottom-right-radius", "box-shadow", "font-family", "font-size", "font-weight", "line-height", "text-align", "letter-spacing", "opacity", "z-index", "overflow-x", "overflow-y",
  "gap", "flex-direction", "align-items", "justify-content", "grid-template-columns", "filter", "backdrop-filter", "text-shadow", "outline-style", "visibility", "pointer-events", "cursor", "white-space", "inset-inline-start", "top", "bottom"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.goto("http://127.0.0.1:8080/qayd.html?testfast", { waitUntil: "load" }); await page.waitForTimeout(3000);
const snap = () => page.evaluate((PROPS) => {
  const out = {}; const volatile = /^(hand|eats|rml|fl|sl\d|lt-book)$/;
  const sig = (el) => { const parts = []; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { parts.unshift(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).filter((c) => !/^(on|ok|no|shk|selected|hot|live|timing|drop|dealer|buyer|win)$/.test(c)).sort().join(".") : "")); if (e.id) break; } return parts.join(">"); };
  for (const el of document.querySelectorAll("body *")) {
    if (/^(SCRIPT|STYLE|LINK|DEFS|SYMBOL|PATH|CIRCLE|RECT|USE|STOP|ELLIPSE|G|FE\w+|FILTER|\w+GRADIENT|CLIPPATH|IMAGE)$/i.test(el.tagName)) continue;
    const key = sig(el); if (out[key]) continue;
    const cs = getComputedStyle(el); if (cs.display === "none" && !el.closest(".mod, #ov")) { out[key] = { display: "none" }; continue; }
    const inVolatile = el.closest("#hand, #eats, .seat .fan, .sl, #fl, .cm-throw-flyer");
    const o = {}; for (const p of PROPS) { if (inVolatile && /^(width|height|top|bottom|inset|z-index|opacity)/.test(p)) continue; o[p] = cs.getPropertyValue(p); }
    for (const pseudo of ["::before", "::after"]) { const ps = getComputedStyle(el, pseudo); if (ps.content && ps.content !== "none" && ps.content !== "normal") for (const p of ["content", "display", "color", "background-color", "background-image", "width", "height", "border-top-color", "box-shadow", "opacity", "border-top-left-radius"]) o[pseudo + p] = ps.getPropertyValue(p); }
    out[key] = o;
  }
  return out;
}, PROPS);
const all = {}; const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(150); } return false; };
const closeAll = () => page.evaluate(() => { document.querySelectorAll(".mod").forEach((e) => e.classList.remove("on")); });
for (const t of ["trad", "dark", "light"]) {
  await page.evaluate((t) => { theme(t); cfg.stake = 0; cfg.mode = "free"; }, t); await page.waitForTimeout(500);
  all[t + ":home"] = await snap();
  await page.evaluate(() => openLobby()); await page.waitForTimeout(400); all[t + ":lobby"] = await snap(); await closeAll();
  await page.evaluate(() => openSet()); await page.waitForTimeout(400); all[t + ":settings"] = await snap();
  for (const pane of ["account", "sound", "look", "play", "privacy", "notes", "lang", "access", "help"]) { await page.evaluate((p) => document.querySelector(`.set-nav button[data-pane="${p}"]`).click(), pane); await page.waitForTimeout(250); all[t + ":set-" + pane] = await snap(); await page.evaluate(() => document.querySelector("#set-back").click()); await page.waitForTimeout(150); }
  await closeAll();
  await page.evaluate(() => showRules()); await page.waitForTimeout(300); all[t + ":rules"] = await snap(); await page.evaluate(() => closeOv());
  await page.evaluate(() => startGame());
  await until(() => R && R.phase === "bid" && document.querySelectorAll("#act button").length > 0); await page.waitForTimeout(500);
  all[t + ":bid"] = await snap();
  await page.evaluate(() => { window.__a = setInterval(() => { try { if (document.querySelector("#ov").classList.contains("on")) { document.querySelector("#nx")?.click(); return; } if (typeof G === "undefined" || !G) { startGame(); return; } if (R && pending) { if (R.phase === "play" && R.myTurn) { if (R.last.length >= 3) { window.__stop = true; return; } resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); } else document.querySelector("#act button")?.click(); } } catch (e) {} }, 120); });
  await until(() => window.__stop === true && R.myTurn, 120000); await page.evaluate(() => { clearInterval(window.__a); window.__stop = false; }); await page.waitForTimeout(600);
  all[t + ":play"] = await snap();
  await page.evaluate(() => showHistory()); await page.waitForTimeout(300); all[t + ":book"] = await snap(); await page.evaluate(() => closeOv());
  await page.evaluate(() => qaid()); await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector(".qc-kind:not(.off)").click(); document.querySelectorAll(".qc-slot")[0].click(); document.querySelectorAll(".qc-slot")[1].click(); }); await page.waitForTimeout(200);
  all[t + ":qayd"] = await snap();
  await page.evaluate(() => document.querySelector(".qc-go").click());
  await until(() => R && R.phase === "result" && !!document.querySelector("#nx"), 20000); await page.waitForTimeout(400);
  all[t + ":result"] = await snap();
  await page.evaluate(() => { closeOv(); leaveGame(); }); await page.waitForTimeout(800);
}
writeFileSync(process.argv[2], JSON.stringify(all));
console.log("states", Object.keys(all).length, "elements", Object.values(all).reduce((n, s) => n + Object.keys(s).length, 0)); await b.close();
