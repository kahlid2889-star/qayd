// Helpers for the colour identity (public/qayd-theme.css is the single source of colours).
//   node scripts/theme-tools.mjs strip    remove every old definition of a token the theme file now owns
//   node scripts/theme-tools.mjs census   list hard-coded colours left in qayd.css, by section
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
const CSS = new URL("../public/qayd.css", import.meta.url), THEME = new URL("../public/qayd-theme.css", import.meta.url);
const owned = new Set([...readFileSync(THEME, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const cmd = process.argv[2];
const root = postcss.parse(readFileSync(CSS, "utf8"));
if (cmd === "strip") {
  let n = 0;
  root.walkDecls((d) => { if (owned.has(d.prop)) { d.remove(); n++; } });
  for (let i = 0; i < 3; i++) root.walkRules((r) => { if (!r.nodes.some((x) => x.type !== "comment")) r.remove(); });
  writeFileSync(CSS, root.toString());
  console.log(`removed ${n} old token definitions (${owned.size} tokens are owned by qayd-theme.css)`);
} else if (cmd === "census") {
  const colour = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
  let section = "start"; const by = new Map();
  root.walk((node) => {
    if (node.type === "comment" && /════/.test(node.text)) section = node.text.replace(/═/g, "").trim();
    if (node.type !== "decl") return;
    const hits = node.value.match(colour); if (!hits) return;
    if (!by.has(section)) by.set(section, []);
    by.get(section).push(`${node.parent.selector?.slice(0, 70)} { ${node.prop}: ${node.value.slice(0, 90)} }`);
  });
  for (const [s, list] of by) { console.log(`\n== ${s}: ${list.length}`); if (process.argv[3] === s || process.argv[3] === "all") list.forEach((l) => console.log("   " + l)); }
}
