// Split the one-file game (public/qayd.html) into a small page plus real files:
//   public/qayd.css          every style layer, in the original order, with dead declarations removed
//   public/qayd-js/NN-*.js   every inline script, in the original order
// Run once: node scripts/split-game.mjs   (safe to run again: nothing inline is left to move)
//
// "Dead" is decided the strict way only: a declaration is dropped when a LATER rule with exactly the
// same selector, in the same @media/@supports context, sets exactly the same property with the same or
// higher importance. That later rule already won in the browser, so the page cannot change.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postcss from "postcss";

const HTML = new URL("../public/qayd.html", import.meta.url);
const OUT = new URL("../public/", import.meta.url);
let html = readFileSync(HTML, "utf8");
const hash = (text) => createHash("sha1").update(text).digest("hex").slice(0, 8);

/* ---------- styles ---------- */
const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/g;
const blocks = [...html.matchAll(styleRe)].map((m, i) => {
  const id = (m[1].match(/id="([^"]+)"/) || [])[1];
  const lead = (m[2].match(/^\s*\/\*\s*([^*\n]{3,70})/) || [])[1];
  return { index: m.index, length: m[0].length, name: id || (lead ? lead.trim() : "base " + (i + 1)), root: postcss.parse(m[2]) };
});
if (blocks.length) {
  const skip = new Set(["keyframes", "-webkit-keyframes", "font-face", "page", "property"]);
  const context = (node) => {
    const chain = [];
    for (let p = node.parent; p && p.type !== "root"; p = p.parent) {
      if (p.type === "atrule") { if (skip.has(p.name.toLowerCase())) return null; chain.unshift(`@${p.name} ${p.params.replace(/\s+/g, " ").trim()}`); }
      else return null; // nested rule: leave alone
    }
    return chain.join(" > ");
  };
  const rules = [];
  blocks.forEach((b) => b.root.walkRules((rule) => { const ctx = context(rule); if (ctx !== null) rules.push({ rule, ctx }); }));
  const won = new Map(); // ctx | selector | property -> importance of the latest declaration seen so far (walking backwards)
  let removed = 0, kept = 0;
  for (let i = rules.length - 1; i >= 0; i--) {
    const { rule, ctx } = rules[i];
    const selectors = rule.selectors.map((s) => s.replace(/\s+/g, " ").trim());
    const decls = rule.nodes.filter((n) => n.type === "decl");
    const dead = decls.filter((d) => {
      const prop = d.prop.startsWith("--") ? d.prop : d.prop.toLowerCase(), imp = d.important ? 2 : 1;
      return selectors.every((s) => (won.get(`${ctx}|${s}|${prop}`) || 0) >= imp);
    });
    for (const d of decls) {
      const prop = d.prop.startsWith("--") ? d.prop : d.prop.toLowerCase(), imp = d.important ? 2 : 1;
      for (const s of selectors) { const key = `${ctx}|${s}|${prop}`; if ((won.get(key) || 0) < imp) won.set(key, imp); }
    }
    dead.forEach((d) => d.remove()); removed += dead.length; kept += decls.length - dead.length;
    if (!rule.nodes.some((n) => n.type !== "comment")) rule.remove();
  }
  blocks.forEach((b) => { for (let pass = 0; pass < 3; pass++) b.root.walkAtRules((at) => { if (at.nodes && !at.nodes.some((n) => n.type !== "comment")) at.remove(); }); });
  const css = "/* قيد — every style of the game, in the order the layers were written.\n   Later sections override earlier ones. Generated once by scripts/split-game.mjs; edit this file directly from now on. */\n\n"
    + blocks.map((b) => `/* ════════════════ ${b.name} ════════════════ */\n${b.root.toString().trim()}\n`).join("\n");
  writeFileSync(new URL("qayd.css", OUT), css);
  // remove the blocks (last first), put one link where the first one was
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    html = html.slice(0, b.index) + (i === 0 ? `<link rel="stylesheet" href="qayd.css?v=${hash(css)}">` : "") + html.slice(b.index + b.length);
  }
  console.log(`styles: ${blocks.length} blocks -> qayd.css (${Math.round(css.length / 1024)} KB); declarations kept ${kept}, dead removed ${removed}`);
}

/* ---------- scripts ---------- */
mkdirSync(new URL("qayd-js/", OUT), { recursive: true });
const scriptRe = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const scripts = [...html.matchAll(scriptRe)].filter((m) => m[2].trim().length > 1500);
const slug = (code, i) => {
  const lead = (code.match(/^\s*\/\*\s*([^*\n]{3,60})/) || [])[1] || "";
  const known = [[/QAID_BRAND/, "brand"], [/QAID_CARD_ART/, "cards"], [/const Baloot = /, "game"], [/stable draft layout/, "layout"], [/next frontend/, "frontend"], [/swap logo/, "home-logo"], [/qayd-board/, "board"]];
  const hit = known.find(([re]) => re.test(code.slice(0, 4000)) || re.test(lead));
  const name = hit ? hit[1] : lead.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "part";
  return `${String(i + 1).padStart(2, "0")}-${name}.js`;
};
for (let i = scripts.length - 1; i >= 0; i--) {
  const m = scripts[i], file = slug(m[2], i), code = m[2].replace(/^\n/, "");
  writeFileSync(new URL("qayd-js/" + file, OUT), code);
  html = html.slice(0, m.index) + `<script${m[1]} src="qayd-js/${file}?v=${hash(code)}"></script>` + html.slice(m.index + m[0].length);
  console.log(`script: qayd-js/${file} (${Math.round(code.length / 1024)} KB)`);
}
// cache-bust the two bridge files too
html = html.replace(/src="(qayd-net|qayd-sync)\.js(\?v=[0-9a-f]+)?"/g, (_, name) => `src="${name}.js?v=${hash(readFileSync(new URL(name + ".js", OUT), "utf8"))}"`);
writeFileSync(HTML, html);
console.log(`qayd.html is now ${Math.round(html.length / 1024)} KB, ${html.split("\n").length} lines`);
