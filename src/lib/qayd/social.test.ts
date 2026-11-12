import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activityOf,
  countField,
  isAdminId,
  knownAchievements,
  likePattern,
  rankCard,
} from "./social.ts";

describe("friend rank card", () => {
  it("starts at seven of diamonds", () => {
    const card = rankCard(0);
    assert.equal(card.face, "٧");
    assert.equal(card.suit, "♦");
    assert.equal(card.title, "جديد");
    assert.equal(card.pct, 0);
    assert.equal(card.red, true);
  });

  it("uses the same ladder as the table, including the joker", () => {
    const mid = rankCard(200);
    assert.equal(mid.stage, 1);
    assert.equal(mid.face, "٧");
    assert.equal(mid.suit, "♣");
    assert.equal(rankCard(59_450).face, "الجوكر");
  });
});

describe("friend data guards", () => {
  it("keeps only achievements the game already stores", () => {
    assert.deepEqual(knownAchievements(["win", "invented", "win", "kaboot"]), ["win", "kaboot"]);
    assert.deepEqual(knownAchievements("nope"), []);
  });

  it("does not treat a typed percent as a wildcard", () => {
    assert.equal(likePattern("100%"), "%100\\%%");
  });

  it("refuses a broadcast when no admin list is configured", () => {
    assert.equal(isAdminId("dev-user", undefined), false);
    assert.equal(isAdminId("dev-user", "other, dev-user"), true);
    assert.equal(isAdminId("player", ""), false);
  });

  it("prefers a fresh seat over a quiet profile", () => {
    assert.equal(activityOf(false, "live"), "live");
    assert.equal(activityOf(true, "lobby"), "room");
    assert.equal(activityOf(true, null), "online");
    assert.equal(activityOf(false, null), "offline");
  });

  it("drops junk stats instead of inventing a zero", () => {
    assert.equal(countField(undefined), null);
    assert.equal(countField(-3), null);
    assert.equal(countField("4"), 4);
  });
});
