// Pre-throw: pick a card before my turn; it lifts, can be changed or cancelled, and is played the moment my turn comes.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs"; mkdirSync("screenshots/pre", { recursive: true });
const res = []; const check = (n, ok, d = "") => { res.push(!!ok); console.log(ok ? "PASS" : "FAIL", n, d); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8080/qayd.html", { waitUntil: "load" }); await page.waitForTimeout(3500);
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn).catch(() => false)) return Date.now() - t; await page.waitForTimeout(100); } return -1; };
await page.evaluate(() => { P.speed = "normal"; cfg.stake = 0; cfg.mode = "friendly"; cfg.len = 152; startGame();
  window.__a = setInterval(() => { try { const lu = document.querySelector("#lineup"); if (lu && !lu.hidden) lu.querySelector(".lu-stage")?.dispatchEvent(new Event("pointerdown"));
    if (document.querySelector("#ov").classList.contains("on")) { document.querySelector("#nx")?.click(); return; }
    if (R && pending && R.phase !== "play") document.querySelector("#act button")?.click();
    if (R && pending && R.phase === "play" && R.myTurn && window.__autoplay) resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); } catch (e) {} }, 250); });
// wait for a moment in play where it is NOT my turn and at least two players are still to act before me
await page.evaluate(() => { window.__autoplay = true; });
const waitGap = () => until(() => R && R.phase === "play" && !R.myTurn && R.turn !== 0 && R.h[0].length >= 3 && R.trick.length <= 1 && ((0 - R.turn + 4) % 4) >= 3 && R.trick.length === 0, 240000);
check("reached a moment before my turn", (await waitGap()) >= 0);
await page.evaluate(() => { window.__autoplay = false; });
const cards = page.locator("#hand .cd");
await cards.nth(0).tap({ position: { x: 12, y: 24 } }); await page.waitForTimeout(250);
const one = await page.evaluate(() => ({ pre: R.pre, lifted: [...document.querySelectorAll("#hand .cd.pre")].length, y: document.querySelector("#hand .cd.pre")?.getBoundingClientRect().top, other: document.querySelector("#hand .cd:not(.pre)")?.getBoundingClientRect().top }));
check("tapping a card before my turn queues it and lifts it", one.pre && one.lifted === 1 && one.y < one.other - 12, JSON.stringify(one));
await page.screenshot({ path: "screenshots/pre/1-queued.png" });
await cards.nth(1).tap({ position: { x: 12, y: 24 } }); await page.waitForTimeout(200);
check("tapping another card moves the choice", await page.evaluate(() => document.querySelectorAll("#hand .cd.pre").length === 1 && true));
await cards.nth(1).tap({ position: { x: 12, y: 24 } }); await page.waitForTimeout(200);
check("tapping it again cancels", await page.evaluate(() => !R.pre && document.querySelectorAll("#hand .cd.pre").length === 0));
// queue a card and let my turn arrive; in limited mode it is played only if legal
const picked = await page.evaluate(() => { const el = document.querySelectorAll("#hand .cd")[0]; el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return { pre: R.pre, n: R.pl[0].length }; });
const turn = await until(() => R && (R.myTurn || R.pl[0].length > window.__n0) , 30000);
const after = await until(() => R && R.phase === "play" ? !R.myTurn && !R.pre : true, 4000);
const out = await page.evaluate((pre) => ({ played: R.pl[0].some((c) => cn(c) === pre) || R.trick.some((t) => t.p === 0 && cn(t.c) === pre) || (R.last[0]?.t || []).some((t) => t.p === 0 && cn(t.c) === pre), stillMyTurn: R.myTurn, pre: R.pre, said: document.querySelector("#say")?.textContent || "" }), picked.pre);
check("the queued card is played when my turn comes, or refused with a message if not allowed", (out.played && !out.stillMyTurn) || (!out.played && out.stillMyTurn && /ما تنلعب|يجب|قطع|زات/.test(out.said)), JSON.stringify(out));
// run a few more turns with random pre-throws to make sure nothing stalls
await page.evaluate(() => { window.__autoplay = true; window.__pre = setInterval(() => { try { if (R && R.phase === "play" && !R.myTurn && R.turn !== 0 && !R.pre && R.h[0].length) { const els = document.querySelectorAll("#hand .cd"); els[Math.floor(Math.random() * els.length)].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); } } catch (e) {} }, 400); });
const n0 = await page.evaluate(() => G.hist.length);
const rounds = await until(() => typeof G !== "undefined" && G && G.hist.length >= window.__h0 + 2 || !G, 120000);
check("rounds keep finishing with pre-throws on every turn", await page.evaluate((n) => !G || G.hist.length >= n + 1, n0), `hist ${n0} -> ${await page.evaluate(() => (G ? G.hist.length : "match over"))}`);
check("no page errors", errs.length === 0, JSON.stringify(errs));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`); await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
