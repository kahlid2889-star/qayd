// Refresh the ?v=hash on every local stylesheet/script link in public/qayd.html (run after editing any of them).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const page = new URL("../public/qayd.html", import.meta.url);
let html = readFileSync(page, "utf8"), n = 0;
html = html.replace(/(href|src)="((?:qayd[\w-]*|qayd-js\/[\w-]+)\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g, (_, attr, file) => {
  const v = createHash("sha1").update(readFileSync(new URL("../public/" + file, import.meta.url))).digest("hex").slice(0, 8); n++;
  return `${attr}="${file}?v=${v}"`;
});
writeFileSync(page, html); console.log("versions refreshed:", n);
