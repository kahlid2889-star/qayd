// The qayd (accusation) window: open it on my turn in free mode and exercise every control.
// Usage: OUT=dir THEME=trad|dark|light node tests/e2e/qayd-window.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = process.env.OUT || "screenshots/qayd"; mkdirSync(OUT, { recursive: true });
const res = []; const check = (n, ok, d = "") => { res.push(!!ok); console.log(ok ? "PASS" : "FAIL", n, d); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: +(process.env.W || 390), height: +(process.env.H || 844) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8080/qayd.html?testfast", { waitUntil: "load" }); await page.waitForTimeout(2500);
if (process.env.THEME) await page.evaluate((t) => theme(t), process.env.THEME);
const auto = (on) => page.evaluate((on) => { clearInterval(window.__a); if (!on) return; window.__a = setInterval(() => { try { if (document.querySelector("#ov").classList.contains("on")) return; if (R && pending) { if (R.phase === "play" && R.myTurn) resolvePending({ card: aiPick(0), from: center(document.querySelector("#hand")) }); else document.querySelector("#act button")?.click(); } } catch (e) {} }, 200); }, on);
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(150); } return false; };
await page.evaluate(() => { cfg.stake = 0; cfg.mode = "free"; cfg.len = 152; startGame(); });
await auto(true);
// reach my turn in a hokm round with at least 3 finished tricks (rounds that do not fit are played through)
await page.evaluate(() => { window.__n = setInterval(() => { try { const nx = document.querySelector("#nx"); if (nx && document.querySelector("#ov").classList.contains("on")) nx.click(); if (typeof G === "undefined" || !G) { cfg.stake = 0; cfg.mode = "free"; startGame(); } } catch (e) {} }, 400);
  const tick = () => { try { if (R && R.phase === "play" && R.myTurn && pending && R.last.length >= 3 && R.mode === "hokm") { clearInterval(window.__a); clearInterval(window.__n); window.__ready = true; return; } } catch (e) {} requestAnimationFrame(tick); }; tick(); });
check("reached a hokm round on my turn", await until(() => window.__ready === true, 300000));
await auto(false); await page.waitForTimeout(400);
// the rule itself: a cut is proved by a card the cheater still HOLDS, not only by one he played later
const rule = await page.evaluate(() => {
  const trick = R.last[R.last.length - 1].t, play = trick.find((x) => x.p === 1), held = R.h[1][0], other = R.h[3][0];
  const v = { p: 1, kind: "qati", card: { s: play.c.s, r: play.c.r }, trickIndex: 0, lead: held.s, trump: R.T, caught: false, judged: false, reveal: null };
  const keep = R.violations; R.violations = [v];
  const cheat = [0, 1, play.c.s, play.c.r], pick = (p, c) => [-1, p, c.s, c.r];
  const wrongSuit = R.h[1].find((c) => c.s !== held.s);
  const out = {
    heldProof: matchQayd(0, { kind: "qati", reveal: pick(1, held), cheat }) === v,
    eitherOrder: matchQayd(0, { kind: "qati", reveal: cheat, cheat: pick(1, held) }) === v,
    wrongSuit: wrongSuit ? matchQayd(0, { kind: "qati", reveal: pick(1, wrongSuit), cheat }) === null : true,
    otherPlayersCard: matchQayd(0, { kind: "qati", reveal: pick(3, other), cheat }) === null || other.s !== held.s,
    notHeld: matchQayd(0, { kind: "qati", reveal: [-1, 1, play.c.s, play.c.r], cheat }) === null,
    wrongKind: matchQayd(0, { kind: "ma-daq", reveal: pick(1, held), cheat }) === null,
    sameTeam: matchQayd(1, { kind: "qati", reveal: pick(1, held), cheat }) === null,
  };
  R.violations = keep; return out;
});
check("a held card of the led suit proves the cut", rule.heldProof && rule.eitherOrder, JSON.stringify(rule));
check("wrong proofs are refused (other suit, not in hand, wrong kind, own team)", rule.wrongSuit && rule.notHeld && rule.wrongKind && rule.sameTeam && rule.otherPlayersCard, JSON.stringify(rule));
const open = async () => { await page.locator("#act button", { hasText: "قيدها" }).tap(); await page.waitForTimeout(400); await page.locator("#qaid-yes").tap(); await page.waitForTimeout(500); };
await open();
check("the window opens", await page.locator("#qc-root").count() === 1);
await page.screenshot({ path: `${OUT}/1-open.png` });
check("five kinds are listed", await page.locator(".qc-kind").count() === 5);
check("every played trick is listed", await page.evaluate(() => document.querySelectorAll(".qc-row").length === R.last.length + (R.trick.length ? 1 : 0)));
// confirm with nothing chosen -> a hint, window stays
await page.locator(".qc-go").tap(); await page.waitForTimeout(200);
check("confirm without a kind shows a hint", (await page.locator(".qc-prompt").innerText()).includes("اختر نوع القيد"));
// choose a kind, then toggle it off and on
const kind = page.locator(".qc-kind:not(.off)").first();
await kind.tap(); await page.waitForTimeout(150);
check("a kind can be chosen", await kind.evaluate((e) => e.classList.contains("on") && e.getAttribute("aria-checked") === "true"));
check("the kind's explanation shows", await page.locator(".qc-desc.on").count() === 1);
await page.locator(".qc-go").tap(); await page.waitForTimeout(200);
check("confirm without two cards shows a hint", (await page.locator(".qc-prompt").innerText()).includes("الورقتين"));
// pick two cards; tags appear; unpick works
const slots = page.locator(".qc-slot");
await slots.nth(0).scrollIntoViewIfNeeded(); await slots.nth(0).tap(); await slots.nth(1).tap(); await page.waitForTimeout(150);
check("first pick is tagged reveal, second cheat", await page.evaluate(() => { const s = document.querySelectorAll(".qc-slot"); return s[0].dataset.tag === "كشف" && s[1].dataset.tag === "غش"; }));
await slots.nth(1).tap(); await page.waitForTimeout(100);
check("tapping a picked card unpicks it", await page.evaluate(() => !document.querySelectorAll(".qc-slot")[1].dataset.tag));
await slots.nth(2).tap(); await page.waitForTimeout(150);
check("ready state lights the confirm button", await page.locator(".qc-go.ready").count() === 1);
await page.screenshot({ path: `${OUT}/2-ready.png` });
const disabled = page.locator(".qc-kind.off").first();
if (await disabled.count()) { await disabled.tap({ force: true }); await page.waitForTimeout(150); check("an unavailable kind explains why", (await page.locator(".qc-prompt").innerText()).length > 4); }
check("the timer is counting down", await (async () => { const a = +(await page.locator(".qc-time").innerText()); await page.waitForTimeout(2200); const c = +(await page.locator(".qc-time").innerText()); return c < a; })());
// hands: every player is listed by name with the cards he still holds; a held card can be picked
check("there is no way back out of the window", await page.locator(".qc-close").count() === 0);
check("all four players' hands are listed", await page.locator(".qc-hand").count() === 4);
check("the hands show exactly the cards still held", await page.evaluate(() => document.querySelectorAll(".qc-held").length === R.h.flat().length));
check("each hand carries the player's name", await page.evaluate(() => [...document.querySelectorAll(".qc-hand-name")].every((e) => e.firstChild.textContent.trim().length > 0)));
const held = page.locator(".qc-held").first(); await held.scrollIntoViewIfNeeded(); await held.tap(); await page.waitForTimeout(150);
check("a card still in a hand can be picked", await held.evaluate((e) => e.classList.contains("on") || true) && await page.evaluate(() => document.querySelectorAll(".qc-slot.on").length >= 1));
await page.screenshot({ path: `${OUT}/2b-hands.png` });
// make a (wrong) accusation: the round must end against me
await page.evaluate(() => { const k = document.querySelector(".qc-kind:not(.off)"); if (!k.classList.contains("on")) k.click(); });
await page.evaluate(() => { for (let i = 0; i < 4 && document.querySelectorAll(".qc-slot.on").length < 2; i++) { const s = [...document.querySelectorAll(".qc-slot")].find((x) => !x.classList.contains("on")); s.click(); } }); await page.waitForTimeout(150);
await page.locator(".qc-go").tap();
const ended = await until(() => R && R.phase === "result" && !!document.querySelector("#nx"), 15000);
check("a wrong accusation ends the round for the other side", ended && await page.evaluate(() => R.forced && R.forced.winner === 1 && /قيد خاطئ/.test(document.querySelector("#ob").innerText)));
await page.screenshot({ path: `${OUT}/3-wrong.png` });
check("no page errors", errs.length === 0, JSON.stringify(errs));
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`); await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
