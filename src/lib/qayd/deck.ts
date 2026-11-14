/** A fair deck order from the server's own random source: card codes 0..31 (suit * 8 + rank). */
export function serverDeck(): number[] {
  const deck = Array.from({ length: 32 }, (_, i) => i);
  const word = new Uint32Array(1);
  for (let i = 31; i > 0; i--) {
    // Rejection sampling keeps every order equally likely.
    const range = i + 1;
    const limit = Math.floor(0x1_0000_0000 / range) * range;
    let x: number;
    do {
      crypto.getRandomValues(word);
      x = word[0];
    } while (x >= limit);
    const j = x % range;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
