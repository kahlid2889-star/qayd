// Scoring and legal-play checks for the rules engine that lives inside public/qayd.html.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const html = readFileSync(new URL("../public/qayd.html", import.meta.url), "utf8");
const start = html.indexOf("const Baloot = (() => {");
const end = html.indexOf("if (typeof module !== 'undefined' && module.exports) module.exports = Baloot;");
assert.ok(start > 0 && end > start, "rules engine not found in qayd.html");
const Baloot = vm.runInNewContext(html.slice(start, end) + "\nBaloot;", { require: createRequire(import.meta.url) });

const c = (s, r) => ({ s, r });
const round = (o) => ({ mode: "hokm", T: 0, buyer: 0, dealer: 3, multiplier: 1, pts: [100, 62], tk: [5, 3], bel: [0, 0], decl: [[], [], [], []], ...o });
const fifty = { kind: "sequence", count: 4, high: 7, suit: 1, raw: 50, cards: [c(1, 4), c(1, 5), c(1, 6), c(1, 7)] };
const score = (o) => Array.from(Baloot.score(round(o)).score);

test("plain hands add up to 16 in hokm and 26 in sun", () => {
  for (const mode of ["hokm", "sun"]) {
    const total = mode === "sun" ? 130 : 162;
    for (let p = 1; p < total; p++) {
      const s = score({ mode, T: mode === "sun" ? -1 : 0, pts: [p, total - p], tk: [4, 4] });
      assert.equal(s[0] + s[1], mode === "sun" ? 26 : 16, `${mode} ${p}`);
    }
  }
});

test("rounding follows the table rules", () => {
  assert.deepEqual([75, 76, 85, 86].map(Baloot.hokmConvert), [7, 8, 8, 9]);
  assert.deepEqual([63, 65, 66, 67].map(Baloot.sunConvert), [12, 13, 14, 14]);
});

test("every multiplier scales the projects with the hand", () => {
  assert.deepEqual(score({ multiplier: 2, decl: [[fifty], [], [], []] }), [42, 0]);
  assert.deepEqual(score({ multiplier: 3, decl: [[fifty], [], [], []] }), [63, 0]);
  assert.deepEqual(score({ multiplier: 4, decl: [[fifty], [], [], []] }), [84, 0]);
});

test("a doubled kaboot is never worth less than a doubled ordinary win", () => {
  const kaboot = { pts: [162, 0], tk: [8, 0] };
  assert.deepEqual(score(kaboot), [25, 0]);
  assert.deepEqual(score({ ...kaboot, multiplier: 2 }), [50, 0]);
  assert.deepEqual(score({ ...kaboot, multiplier: 4 }), [100, 0]);
  assert.deepEqual(score({ mode: "sun", T: -1, pts: [130, 0], tk: [8, 0], multiplier: 2 }), [88, 0]);
  assert.ok(score({ ...kaboot, multiplier: 2 })[0] > score({ multiplier: 2 })[0]);
});

test("a failed purchase gives the whole hand to the other side", () => {
  assert.deepEqual(score({ pts: [60, 102] }), [0, 16]);
  assert.deepEqual(score({ mode: "sun", T: -1, pts: [50, 80] }), [0, 26]);
});

test("coffee decides the match without multiplying the hand", () => {
  const r = Baloot.score(round({ multiplier: 0 }));
  assert.equal(r.coffee, true);
  assert.deepEqual(Array.from(r.score), [16, 0]);
});

test("following suit and over-trumping are enforced", () => {
  const ids = (list) => list.map((x) => x.s + ":" + x.r);
  // Opponent led trump: a higher trump is forced.
  assert.deepEqual(ids(Baloot.legal([c(0, 4), c(0, 0), c(1, 7)], [{ p: 1, c: c(0, 2) }], 0, "hokm", 0)), ["0:4"]);
  // Holding the led suit: nothing else is legal.
  assert.deepEqual(ids(Baloot.legal([c(2, 3), c(0, 4)], [{ p: 1, c: c(2, 7) }], 0, "hokm", 0)), ["2:3"]);
  // Void, opponent winning, a winning trump in hand: it must be played.
  assert.deepEqual(ids(Baloot.legal([c(0, 0), c(1, 7)], [{ p: 1, c: c(2, 7) }], 0, "hokm", 0)), ["0:0"]);
  // Locked hokm: no trump lead while another suit is held.
  assert.deepEqual(ids(Baloot.legal([c(0, 4), c(1, 7)], [], 0, "hokm", 0, { open: false })), ["1:7"]);
});

test("projects: four aces are 400 in sun, 100 in hokm; four nines are nothing", () => {
  const aces = [c(0, 7), c(1, 7), c(2, 7), c(3, 7), c(0, 0), c(1, 1), c(2, 2), c(3, 3)];
  assert.equal(Baloot.projects(aces, "sun", -1)[0].raw, 200);
  assert.equal(Baloot.projects(aces, "hokm", 0)[0].raw, 100);
  const nines = [c(0, 2), c(1, 2), c(2, 2), c(3, 2), c(0, 7), c(1, 5), c(2, 4), c(3, 0)];
  assert.equal(Baloot.projects(nines, "hokm", 0).length, 0);
});
