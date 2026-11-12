// Phase 0: how long do the existing bots take per decision, and how much CPU per round?
// Runs unchanged in Node, Deno and the Supabase Edge runtime.
import { Baloot, QaidBots, QaidSmart } from "./engine.mjs";
const now = () => performance.now();
const cpuMs = () => (typeof process !== "undefined" && process.cpuUsage) ? (u => (u.user + u.system) / 1000)(process.cpuUsage()) : now();

function aiPick(v) {
  const skill = (QaidBots.get(v.profileId) || {}).skill;
  if (skill && skill !== "novice") {
    const scale = QaidBots.searchScale();
    const samples = Math.round((skill === "strong" ? 160 : skill === "ten" ? 80 : 28) * scale);
    const budgetMs = Math.round((skill === "strong" ? 160 : skill === "ten" ? 100 : 60) * Math.min(2, scale));
    const c = QaidSmart.pick(v, Math.random, { samples, budgetMs });
    if (c) { const own = v.hand.find((x) => x.s === c.s && x.r === c.r); if (own) return own; }
  }
  return QaidBots.pick(v);
}

export function runRounds(rounds, tier, ids = ["abu-mutair", "sultan", "khalid", "abu-raheel"]) {
  QaidBots.setTier(tier);
  const samples = { strong: [], medium: [] }; let cpuTotal = 0, wallTotal = 0, picks = 0, maxRoundCpu = 0, maxPick = 0;
  for (let r = 0; r < rounds; r++) {
    const dealer = r % 4, sun = r % 2 === 1;
    const d = Baloot.deal(Baloot.shuffled(Math.random), dealer);
    const buyer = (dealer + 1) % 4, T = sun ? -1 : d.floor.s, mode = sun ? "sun" : "hokm";
    const hands = Baloot.completeDeal(d.hands, d.rest, d.floor, buyer, dealer);
    const pl = [[], [], [], []], last = []; let trick = [], turn = (dealer + 1) % 4;
    const c0 = cpuMs(), w0 = now();
    for (let t = 0; t < 8; t++) {
      for (let k = 0; k < 4; k++) {
        const p = turn;
        const view = { player: p, hand: hands[p].map((c) => ({ ...c })), trick: trick.slice(), mode, suit: T, played: pl.map((x) => x.slice()), history: [...last].reverse(), historyOrder: "oldest",
          counts: hands.map((h) => h.length), buyer, floor: d.floor, recipient: buyer, open: true, profileId: ids[p], floorSuit: d.floor.s, flippedFromHokm: false, hokmBuyer: -1, sunFlipper: -1 };
        const a = now(), ca = cpuMs();
        const card = aiPick(view);
        const ms = now() - a; const skill = (QaidBots.get(ids[p]) || {}).skill;
        (samples[skill] ||= []).push(ms); picks++; maxPick = Math.max(maxPick, ms);
        const own = hands[p].find((x) => x.s === card.s && x.r === card.r) || Baloot.legal(hands[p], trick, p, mode, T, { open: true })[0];
        hands[p] = hands[p].filter((x) => x !== own); pl[p].push(own); trick.push({ p, c: own }); turn = (p + 1) % 4;
      }
      const w = Baloot.winner(trick, mode, T); last.unshift({ t: trick.slice(), w: w.p }); turn = w.p; trick = [];
    }
    const cpu = cpuMs() - c0; cpuTotal += cpu; wallTotal += now() - w0; maxRoundCpu = Math.max(maxRoundCpu, cpu);
  }
  const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); };
  return { tier, rounds, picks, perPickMs: Object.fromEntries(Object.entries(samples).filter(([, v]) => v.length).map(([k, v]) => [k, { n: v.length, p50: pct(v, .5), p95: pct(v, .95), p99: pct(v, .99), max: +Math.max(...v).toFixed(1) }])),
    cpuPerRoundMs: +(cpuTotal / rounds).toFixed(0), maxRoundCpuMs: +maxRoundCpu.toFixed(0), wallPerRoundMs: +(wallTotal / rounds).toFixed(0), maxPickMs: +maxPick.toFixed(0) };
}
if (import.meta.main !== false && (typeof process === "undefined" || process.argv?.[1]?.endsWith("bench-bots.mjs") || typeof Deno !== "undefined")) {
  const runtime = typeof Deno !== "undefined" ? "Deno " + Deno.version.deno : "Node " + process.versions.node;
  const R = +(globalThis.process?.env?.ROUNDS || 60);
  console.log(runtime);
  for (const tier of [0, 4]) console.log(JSON.stringify(runRounds(R, tier)));
}
