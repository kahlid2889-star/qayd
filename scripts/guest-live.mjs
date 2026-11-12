import { chromium } from "playwright";
import fs from "fs";

const out = { errors: { host: [], guest: [] }, steps: [] };
const log = (m) => { out.steps.push(m); console.log(m); };

async function signup(page, login, name) {
  const frame = page.frameLocator("iframe");
  await frame.locator("#online-open").waitFor({ timeout: 20000 });
  await frame.locator("#online-open").click();
  const dialog = page.locator("[role=dialog]");
  await dialog.waitFor({ timeout: 10000 });
  const create = dialog.getByRole("button", { name: "إنشاء الحساب" });
  if (!(await create.count())) {
    await dialog.getByRole("button", { name: "حساب جديد" }).click();
  }
  await create.waitFor();
  const inputs = dialog.locator("form input");
  await inputs.nth(0).fill(login);
  await inputs.nth(1).fill(name);
  await inputs.nth(2).fill("secret-pass-1");
  await create.click();
  await page.getByRole("button", { name: "سوِّ غرفة" }).waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ headless: true });
const host = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const guest = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const hp = await host.newPage();
const gp = await guest.newPage();
hp.on("pageerror", (e) => out.errors.host.push(String(e)));
gp.on("pageerror", (e) => out.errors.guest.push(String(e)));
await hp.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
await gp.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
const stamp = Date.now().toString(36);
await signup(hp, "host" + stamp, "فيصل");
await signup(gp, "guest" + stamp, "يزن");
log("signed-up");
await hp.getByRole("button", { name: "سوِّ غرفة" }).click();
await hp.getByText("رمز الجلسة").waitFor({ timeout: 10000 });
const code = (await hp.locator("p[dir=ltr]").first().innerText()).trim();
log("room " + code);
await gp.locator("input[placeholder='رمز غرفة خاصة']").fill(code);
await gp.getByRole("button", { name: "ادخل", exact: true }).click();
await gp.getByText("ننتظر صاحب الطاولة").waitFor({ timeout: 10000 });
log("guest seated");
const gf = gp.frame({ url: /qayd\.html/ });
await gf.evaluate(() => {
  window.__seen = { packet: 0, flyer: 0, sweep: 0, drop: 0 };
  const bump = () => {
    if (document.querySelector(".cm-next-packet")) window.__seen.packet += 1;
    if (document.querySelector(".cm-throw-flyer")) window.__seen.flyer += 1;
    if (document.querySelector("#drop-layer")) window.__seen.drop += 1;
  };
  new MutationObserver(bump).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  setInterval(bump, 40);
});
await hp.getByRole("button", { name: "ابدأ الصكة" }).click();
log("started");
await hp.waitForTimeout(600);
for (const page of [hp, gp]) {
  const hide = page.getByRole("button", { name: "إخفاء" });
  if (await hide.count()) await hide.click().catch(() => {});
}
const hf = hp.frame({ url: /qayd\.html/ });
await hf.evaluate(() => { try { P.speed = "fast"; } catch (e) {} });

async function sample() {
  return gf.evaluate(() => ({
    role: window.QaidNet && QaidNet.role,
    motions: (window.QaidNet && QaidNet._motions) || [],
    sounds: (window.QaidNet && QaidNet._sounds) || [],
    paints: window.QaidNet && QaidNet._paints,
    skips: window.QaidNet && QaidNet._skips,
    seen: window.__seen,
    audio: window.QaidAudio && QaidAudio.state ? QaidAudio.state() : null,
    hand: document.querySelectorAll("#hand .cd").length,
    floor: !!document.querySelector("#fl .cd"),
    trick: ["sl0", "sl1", "sl2", "sl3"].filter((id) => document.querySelector("#" + id + " .cd")).length,
    phase: window.R && R.phase,
    say: (document.getElementById("say") || {}).textContent || "",
    sc0: (document.getElementById("sc0") || {}).textContent,
    sc1: (document.getElementById("sc1") || {}).textContent,
    drop: !!document.getElementById("drop-layer"),
  }));
}

async function nudge(frame) {
  const bid = await frame.evaluate(() => {
    if (document.getElementById("ov")?.classList.contains("on")) return "overlay";
    const buttons = [...document.querySelectorAll("#act button")];
    const text = (b) => (b.textContent || "").trim();
    const banned = /سوا|المشاريع|قيدها|تراجع|أكك/;
    let best = null;
    let score = 99;
    for (const button of buttons) {
      const label = text(button);
      if (!label || banned.test(label)) continue;
      let rank = 50;
      if (label === "صن" || label.startsWith("صن")) rank = 0;
      else if (label.startsWith("حكم")) rank = 1;
      else if (label.includes("قبلك")) rank = 2;
      else if (label.includes("شكل")) rank = 3;
      else if (label.startsWith("تم")) rank = 4;
      else if (label.includes("بدون")) rank = 5;
      else if (label === "ولا") rank = 6;
      else if (label === "بس") rank = 7;
      else continue;
      if (rank < score) { score = rank; best = button; }
    }
    if (best) { best.click(); return "bid:" + text(best); }
    const project = document.querySelector("#prj .pbtn");
    if (project) { project.click(); return "project"; }
    if (!window.__projTried) {
      const projects = buttons.find((button) => text(button) === "المشاريع");
      const turn = document.getElementById("s0")?.classList.contains("on");
      if (projects && turn && !document.querySelector("#sl0 .cd, #sl1 .cd, #sl2 .cd, #sl3 .cd")) {
        window.__projTried = true;
        projects.click();
        return "open-projects";
      }
    }
    return "";
  });
  if (bid) return bid;
  const card = frame.locator("#hand .cd.ok");
  if (await card.count()) {
    await card.first().click({ timeout: 800 }).catch(() => {});
    return "card";
  }
  return "";
}

const deadline = Date.now() + 110000;
let best = null;
let clicks = [];
let shot = false;
while (Date.now() < deadline) {
  for (const frame of [hf, gf]) {
    const what = await nudge(frame);
    if (what && what !== "overlay") clicks.push(what);
  }
  best = await sample();
  const motions = best.motions || [];
  const sounds = best.sounds || [];
  if (!shot && (best.trick || 0) > 0) {
    shot = true;
    await hp.screenshot({ path: "/workspace/screenshots/guest-live-host.png" });
    await gp.screenshot({ path: "/workspace/screenshots/guest-live-guest.png" });
  }
  if (motions.includes("floor") && motions.includes("throw") && motions.includes("sweep") && (sounds.includes("play") || sounds.includes("throw")) && clicks.some((item) => item === "card")) break;
  await hp.waitForTimeout(350);
}
log("clicks " + clicks.length + " " + clicks.filter((v, i, a) => a.indexOf(v) === i).join(","));
out.clicks = clicks.slice(0, 40);
out.guest = best;
const hostState = await hf.evaluate(() => ({
  role: window.QaidNet && QaidNet.role,
  phase: window.R && R.phase,
  hand: document.querySelectorAll("#hand .cd").length,
  trick: ["sl0", "sl1", "sl2", "sl3"].filter((id) => document.querySelector("#" + id + " .cd")).length,
  scores: window.G && G.sc,
  audio: window.QaidAudio && QaidAudio.state(),
  say: (document.getElementById("say") || {}).textContent || "",
  sc0: (document.getElementById("sc0") || {}).textContent,
  sc1: (document.getElementById("sc1") || {}).textContent,
}));
out.host = hostState;
if (!shot) {
  await hp.screenshot({ path: "/workspace/screenshots/guest-live-host.png" });
  await gp.screenshot({ path: "/workspace/screenshots/guest-live-guest.png" });
}

// Rejoin: reload the guest and enter the same room. The table must catch up, not freeze.
await gp.reload({ waitUntil: "domcontentloaded" });
const frame2 = gp.frameLocator("iframe");
await frame2.locator("#online-open").waitFor({ timeout: 15000 });
await frame2.locator("#online-open").click();
await gp.locator("input[placeholder='رمز غرفة خاصة']").fill(code);
await gp.getByRole("button", { name: "ادخل", exact: true }).click();
let rejoined = null;
for (let i = 0; i < 12; i++) {
  await gp.waitForTimeout(700);
  const hide2 = gp.getByRole("button", { name: "إخفاء" });
  if (await hide2.count()) await hide2.click().catch(() => {});
  const gf2 = gp.frame({ url: /qayd\.html/ });
  rejoined = await gf2.evaluate(() => ({
    role: window.QaidNet && QaidNet.role,
    hand: document.querySelectorAll("#hand .cd").length,
    floor: !!document.querySelector("#fl .cd"),
    trick: ["sl0", "sl1", "sl2", "sl3"].filter((id) => document.querySelector("#" + id + " .cd")).length,
    say: (document.getElementById("say") || {}).textContent || "",
    gm: document.getElementById("gm")?.classList.contains("on") || false,
    sc0: (document.getElementById("sc0") || {}).textContent,
    sc1: (document.getElementById("sc1") || {}).textContent,
  }));
  if (rejoined.role === "guest" && rejoined.hand > 0) break;
}
out.rejoin = rejoined;
const hostNow = await hf.evaluate(() => ({
  hand: document.querySelectorAll("#hand .cd").length,
  trick: ["sl0", "sl1", "sl2", "sl3"].filter((id) => document.querySelector("#" + id + " .cd")).length,
  say: (document.getElementById("say") || {}).textContent || "",
  sc0: (document.getElementById("sc0") || {}).textContent,
  sc1: (document.getElementById("sc1") || {}).textContent,
}));
out.hostAfter = hostNow;
await gp.screenshot({ path: "/workspace/screenshots/guest-live-rejoin.png" });
fs.writeFileSync("/workspace/screenshots/guest-live.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
