import assert from "node:assert/strict";
import test from "node:test";
import { pushMail, restoreBatch, takeBatch, type OutMail } from "./mail.ts";

function ids(mail: OutMail | undefined) {
  const cues = (mail?.body as { cues?: { id?: number }[] } | undefined)?.cues;
  return cues?.map((c) => c.id);
}

test("later view replaces the earlier one and keeps both sound cues", () => {
  const box: OutMail[] = [];
  pushMail(box, { kind: "need", toUser: "a", body: {} });
  pushMail(box, { kind: "view", toUser: "a", body: { cues: [{ id: 1 }] } });
  pushMail(box, { kind: "view", toUser: "b", body: { cues: [{ id: 2 }] } });
  pushMail(box, { kind: "view", toUser: "a", body: { cues: [{ id: 3 }] } });
  pushMail(box, { kind: "act", toUser: "host", body: {} });
  assert.equal(box.length, 4);
  assert.deepEqual(box.map((m) => m.kind), ["need", "view", "view", "act"]);
  assert.deepEqual(ids(box[1]), [2]);
  assert.deepEqual(ids(box.find((m) => m.kind === "view" && m.toUser === "a")), [1, 3]);
});

test("a failed poll puts the batch back and does not drop the ninth message", () => {
  const box: OutMail[] = [];
  for (let i = 0; i < 9; i++) pushMail(box, { kind: "act", toUser: "host", body: { n: i } });
  const sent = takeBatch(box, 8);
  assert.equal(sent.length, 8);
  assert.equal(box.length, 1);
  restoreBatch(box, sent);
  assert.equal(box.length, 9);
  assert.deepEqual(box.map((m) => (m.body as { n: number }).n), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a newer snapshot replaces the view that failed in flight", () => {
  const box: OutMail[] = [{ kind: "view", toUser: "a", body: { cues: [{ id: 1 }] } }];
  const sent = takeBatch(box, 8);
  pushMail(box, { kind: "view", toUser: "a", body: { cues: [{ id: 4 }] } });
  restoreBatch(box, sent);
  assert.equal(box.length, 1);
  assert.deepEqual(ids(box[0]), [4]);
});
