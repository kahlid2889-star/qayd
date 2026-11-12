import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACE_SPADES_XP,
  JOKER_COLOR,
  JOKER_XP,
  levelFromXp,
  roomCuts,
  roomEvalXp,
  settleMatch,
  stageLabel,
  threshold,
} from "./xp.ts";

describe("baloot xp ladder", () => {
  it("locks the joker color and the published thresholds", () => {
    assert.equal(JOKER_COLOR, "#1A1A1A");
    assert.equal(threshold(31), ACE_SPADES_XP);
    assert.equal(threshold(32), JOKER_XP);
    assert.equal(threshold(0), 0);
    assert.equal(threshold(1), 200);
    assert.equal(threshold(2) - threshold(1), 250);
  });

  it("drops 40 XP minus 100 to 0 at level 1", () => {
    const row = settleMatch(40, { kind: "result", won: false, evalXp: 0, hidden: 0, caught: 0 });
    assert.equal(row.after, 0);
    assert.equal(row.toLevel, 0);
    assert.equal(stageLabel(0), "7♦ — جديد");
  });

  it("drops 1,200 XP minus 150 from 8♦ to 7♠", () => {
    assert.equal(levelFromXp(1200), 4);
    assert.equal(stageLabel(4), "8♦ — مبتدئ");
    const row = settleMatch(1200, { kind: "result", won: false, evalXp: 0, hidden: 0, caught: 5 });
    assert.equal(row.netXp, -150);
    assert.equal(row.after, 1050);
    assert.equal(row.toLevel, 3);
    assert.equal(stageLabel(3), "7♠ — جديد");
  });

  it("charges a disconnect exactly −200 and nothing else", () => {
    const row = settleMatch(1000, { kind: "abandon", won: true, evalXp: 50, hidden: 4, caught: 1 });
    assert.equal(row.netXp, -200);
    assert.equal(row.baseXp, -200);
    assert.equal(row.evalXp, 0);
    assert.equal(row.cheatXp, 0);
    assert.equal(row.after, 800);
  });

  it("promotes across more than one card in a single settlement", () => {
    const before = threshold(4) - 5;
    assert.equal(levelFromXp(before), 3);
    const row = settleMatch(before, { kind: "result", won: true, evalXp: 50, hidden: 20, caught: 0 });
    assert.equal(row.netXp, 100 + 50 + 400);
    assert.ok(row.toLevel >= row.fromLevel + 2);
  });

  it("demotes off the joker when XP falls under 59,450", () => {
    const row = settleMatch(JOKER_XP, { kind: "result", won: false, evalXp: 0, hidden: 0, caught: 0 });
    assert.equal(row.fromLevel, 32);
    assert.equal(row.after, JOKER_XP - 100);
    assert.equal(row.toLevel, 31);
    assert.equal(stageLabel(31), "A♠ — قيد");
  });

  it("never lets total XP go below zero", () => {
    const row = settleMatch(50, { kind: "abandon" });
    assert.equal(row.after, 0);
    assert.equal(row.toLevel, 0);
  });
});

describe("room evaluation authority", () => {
  it("uses the host report for a guest and ignores the guest's own number", () => {
    assert.equal(roomEvalXp([0, 0, 30, 0], 2, 50, false), 30);
    assert.equal(roomEvalXp([0, 0, 30, 0], 2, 50, true), 30);
  });

  it("drops a forged grade and waits for the host unless the caller owns the table", () => {
    assert.equal(roomEvalXp(null, 1, 50, false), 0);
    assert.equal(roomEvalXp(null, 0, 50, true), 50);
    assert.equal(roomEvalXp(null, 0, 15, true), 0);
    assert.equal(roomEvalXp(["nope", 20], 1, 50, false), 20);
  });
});

describe("room cut authority", () => {
  it("uses the host report and ignores a guest who invents cuts", () => {
    const stored = { hidden: [0, 1, 0, 0], caught: [2, 0, 0, 0] };
    assert.deepEqual(roomCuts(stored, 0, 12, 0, false), { hidden: 0, caught: 2 });
    assert.deepEqual(roomCuts(stored, 1, 12, 9, false), { hidden: 1, caught: 0 });
    assert.deepEqual(roomCuts(stored, 1, 12, 9, true), { hidden: 1, caught: 0 });
  });

  it("lets only the owner use his own count until the report is stored", () => {
    assert.deepEqual(roomCuts(null, 2, 4, 1, false), { hidden: 0, caught: 0 });
    assert.deepEqual(roomCuts(null, 0, 40, 80, true), { hidden: 12, caught: 40 });
    assert.deepEqual(roomCuts("{}", 0, 3, 1, false), { hidden: 0, caught: 0 });
  });
});
