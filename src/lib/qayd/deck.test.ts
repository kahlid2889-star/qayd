import { test } from "node:test";
import assert from "node:assert/strict";
import { serverDeck } from "./deck.ts";

test("server deck is a full 32-card order", () => {
  for (let n = 0; n < 200; n++) {
    const d = serverDeck();
    assert.equal(d.length, 32);
    assert.deepEqual([...d].sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i));
  }
});

test("server deck is evenly spread", () => {
  // Where card 0 lands, over many shuffles: each of the 32 places about equally often.
  const runs = 32_000;
  const at = new Array(32).fill(0);
  for (let n = 0; n < runs; n++) at[serverDeck().indexOf(0)]++;
  for (const c of at) assert.ok(c > 800 && c < 1200, `place count ${c}`);
});
