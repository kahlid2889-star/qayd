import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
async function signup(page, login, name) {
  const frame = page.frameLocator("iframe");
  await frame.locator("#online-open").waitFor({ timeout: 20000 });
  await frame.locator("#online-open").click();
  const dialog = page.locator("[role=dialog]");
  await dialog.waitFor();
  const create = dialog.getByRole("button", { name: "إنشاء الحساب" });
  if (!(await create.count())) await dialog.getByRole("button", { name: "حساب جديد" }).click();
  await create.waitFor();
  const inputs = dialog.locator("form input");
  await inputs.nth(0).fill(login);
  await inputs.nth(1).fill(name);
  await inputs.nth(2).fill("secret-pass-1");
  await create.click();
  await page.getByRole("button", { name: "سوِّ غرفة" }).waitFor({ timeout: 15000 });
}
const host = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const guest = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const hp = await host.newPage();
const gp = await guest.newPage();
const logs = [];
for (const [name, page] of [["H", hp], ["G", gp]]) {
  page.on("console", (msg) => logs.push(name + " " + msg.type() + " " + msg.text()));
  page.on("pageerror", (e) => logs.push(name + " PAGE " + e.message));
}
await hp.goto("http://127.0.0.1:8080/");
await gp.goto("http://127.0.0.1:8080/");
const stamp = Date.now().toString(36);
await signup(hp, "h" + stamp, "فيصل");
await signup(gp, "g" + stamp, "يزن");
await hp.getByRole("button", { name: "سوِّ غرفة" }).click();
await hp.getByText("رمز الجلسة").waitFor();
const code = (await hp.locator("p[dir=ltr]").first().innerText()).trim();
await gp.locator("input[placeholder='رمز غرفة خاصة']").fill(code);
await gp.getByRole("button", { name: "ادخل", exact: true }).click();
await gp.getByText("ننتظر صاحب الطاولة").waitFor();
const hf = hp.frame({ url: /qayd\.html/ });
await hf.evaluate(() => {
  const orig = console.error;
  window.__errs = [];
  window.__ticks = [];
  console.error = (...args) => { window.__errs.push(args.map(String).join(" ").slice(0, 500)); orig(...args); };
  setInterval(() => {
    const fl = document.getElementById("fl");
    const r = fl && fl.getBoundingClientRect();
    const gm = document.getElementById("gm");
    window.__ticks.push({
      phase: window.R && R.phase,
      fl: r && Math.round(r.width),
      tw: getComputedStyle(document.documentElement).getPropertyValue("--tw"),
      gm: gm && gm.className,
      show: gm && getComputedStyle(gm).display,
    });
  }, 500);
});
await hf.evaluate(() => {
  window.__posts = [];
  const orig = QaidNet.post.bind(QaidNet);
  QaidNet.post = (msg) => { window.__posts.push(msg && msg.type); return orig(msg); };
  const start = startGame;
  let n = 0;
  startGame = function () {
    n += 1;
    window.__starts = n;
    return start.apply(this, arguments);
  };
});
await hp.getByRole("button", { name: "ابدأ الصكة" }).click();
await hp.waitForTimeout(9000);
console.log("POSTS", JSON.stringify(await hf.evaluate(() => ({ posts: window.__posts, starts: window.__starts }))));
const gf = gp.frame({ url: /qayd\.html/ });
const read = (f) => f.evaluate(() => ({
  role: window.QaidNet && QaidNet.role,
  phase: window.R && R.phase,
  say: (document.getElementById("say") || {}).textContent,
  hand: document.querySelectorAll("#hand .cd").length,
  floor: !!document.querySelector("#fl .cd"),
  motions: (window.QaidNet && QaidNet._motions) || null,
  sounds: (window.QaidNet && QaidNet._sounds) || null,
  act: (document.getElementById("act") || {}).innerText,
}));
console.log("HOST", JSON.stringify(await read(hf)));
console.log("GUEST", JSON.stringify(await read(gf)));
console.log("LOGS", logs.filter((l) => /error|Error|تعذر|TypeError|warn/i.test(l)).slice(-40).join("\n"));
await browser.close();
