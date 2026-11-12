/* Online play, the real way: every phone runs the same match.
 *
 * Nobody "hosts" the table. Each phone runs the full game (same animations,
 * same sounds) and sees itself at the bottom seat. The only thing that travels
 * is the list of decisions, numbered 0, 1, 2… in the order the game asks for
 * them: the deck order of each deal, every bid, every card, and a bot catching
 * a cut. The server keeps the first write for each number, so every phone
 * applies the same list and ends with the same table.
 *
 * Who decides what:
 *  - my own seat: me (the move is shown at once and sent in the background);
 *  - bots, the deck, and a player who walked away or ran out of time: the
 *    "lead" phone, which is simply the lowest seat still online. If the lead
 *    leaves, the next phone becomes lead and the match carries on.
 *
 * Seats on the wire are the table's real seats (0..3). On this phone, seat 0 is
 * always "me", so every seat is rotated on the way in and out.
 */
(function () {
  const net = window.QaidNet;
  if (!net) return;

  const PATIENCE_MS = 90_000; /* an online player who never answers: the lead plays for him */
  const S = (window.QaidSync = {
    on: false,
    replaying: false,
    you: 0,
    persons: new Set(),
    names: {},
    online: null,
    matchId: null,
    seed: 0,
    k: 0,
    moves: new Map(),
    waiters: [],
    paidKey: "qayd-paid",
  });

  const g2l = (g) => (((g - S.you) % 4) + 4) % 4;
  const l2g = (l) => (l + S.you) % 4;
  const code = (c) => c.s * 8 + c.r;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* jsonb comes back with its keys reordered, so compare moves by sorted keys. */
  function canon(value) {
    if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canon(value[k])).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- seats ---------- */
  S.person = (l) => S.on && S.persons.has(l2g(l));
  S.away = (g) => !!S.online && g !== S.you && !S.online.has(g);
  const aliveSeats = () => [...S.persons].filter((g) => g === S.you || !S.away(g)).sort((a, b) => a - b);
  S.isLead = function () {
    const alive = aliveSeats();
    return alive.length ? alive[0] === S.you : true;
  };
  /* How long this phone waits before deciding in the lead's place. The lead answers at once; if it is
     connected but stuck (a frozen or hidden tab), the next seat steps in, then the one after. The server
     keeps only the first answer, so two phones stepping in together is harmless. */
  S.stepInAfter = function () {
    if (document.hidden) return Infinity;
    const rank = Math.max(0, aliveSeats().indexOf(S.you));
    return rank === 0 ? 0 : 9000 + (rank - 1) * 5000;
  };
  S.firstDealer = () => g2l(Math.abs(Number(S.seed) || 0) % 4);
  S.cast = function () {
    const base = QaidBots.cast("sultan", null, rng(S.seed));
    const out = [];
    for (let l = 0; l < 4; l++) {
      const g = l2g(l);
      const bot = base[g] || QaidBots.get("abu-mutair");
      out[l] = S.persons.has(g)
        ? Object.assign({}, bot, { botName: bot.name, name: S.names[g] || "لاعب", human: true })
        : Object.assign({}, bot);
    }
    return out;
  };
  /* The stake is paid once per match, even when a player reloads and replays it. */
  S.payStake = function () {
    let paid = null;
    try { paid = JSON.parse(localStorage.getItem(S.paidKey) || "null"); } catch (e) { paid = null; }
    if (paid && paid.matchId === S.matchId) return false;
    try { localStorage.setItem(S.paidKey, JSON.stringify({ matchId: S.matchId })); } catch (e) { /* ignore */ }
    return true;
  };

  /* ---------- the move list ---------- */
  function waitFor(k) {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const w = { k, resolve };
    S.waiters.push(w);
    const have = S.moves.get(k);
    if (have) resolve(have);
    return { promise, cancel() { S.waiters = S.waiters.filter((x) => x !== w); } };
  }

  function feed(list) {
    for (const m of list || []) {
      const k = Number(m.k);
      if (!Number.isInteger(k) || k < 0) continue;
      const body = m.body && typeof m.body === "object" ? m.body : {};
      const prev = S.moves.get(k);
      if (prev) {
        if (canon(prev.body) === canon(body)) continue;
        /* Two phones decided the same step differently (a timeout race). The server's copy wins;
           if this phone already used its own, replay the match from the start with the right list. */
        S.moves.set(k, { seat: Number(m.seat), body });
        if (k < S.k) { resync(); return; }
        continue;
      }
      S.moves.set(k, { seat: Number(m.seat), body });
      if (window.__qaydArrive) window.__qaydArrive[k] = Date.now();
      S.waiters.filter((w) => w.k === k).forEach((w) => w.resolve(S.moves.get(k)));
    }
  }

  function push(k, seat, body) {
    if (window.__qaydPushed) window.__qaydPushed[k] = Date.now();
    net.post({ type: "sync-push", matchId: S.matchId, k, seat, body });
  }

  function endReplay() {
    if (!S.replaying) return;
    S.replaying = false;
    FAST = FAST_URL;
    try { renderSeats(); renderHand(); } catch (e) { /* table not drawn yet */ }
  }

  /* Ask the list for the next decision. `how.mine` runs my own UI, `how.lead` decides for a bot. */
  /* Test hook: the table as seen from the real seats, at every decision. Every phone must agree. */
  function trace(k) {
    if (!window.__qaydTrace || !G) return;
    const mine = S.you % 2;
    const team = (a) => (a ? (mine === 0 ? [a[0], a[1]] : [a[1], a[0]]) : null);
    const hands = R ? [0, 1, 2, 3].map((g) => (R.h[g2l(g)] || []).map(code).sort((a, b) => a - b)) : null;
    window.__qaydTrace.push({ k, at: Date.now(), state: canon({
      sc: team(G.sc), n: G.n, dealer: l2g(G.dealer), hands,
      trick: R ? (R.trick || []).map((t) => [l2g(t.p), code(t.c)]) : null,
      pts: R ? team(R.pts) : null, turn: R ? l2g(R.turn) : null, mode: R ? R.mode : null, T: R ? R.T : null,
    }) });
  }

  async function decide(seat, token, how) {
    const k = S.k++;
    trace(k);
    const known = S.moves.get(k);
    if (known) {
      /* Far behind the table (back from another app, slow phone): skip the animations until caught up. */
      if (!S.replaying && S.moves.size - S.k > 5) { S.catching = true; FAST = true; }
      return { body: known.body };
    }
    if (S.catching) { S.catching = false; FAST = FAST_URL; try { renderSeats(); renderHand(); } catch (e) { /* ignore */ } }
    endReplay();
    if (seat === 0 && how.mine) {
      const arrived = waitFor(k);
      const result = await Promise.race([how.mine().then((x) => ({ x })), arrived.promise.then((m) => ({ m }))]);
      arrived.cancel();
      ensure(token);
      if (result.m) {
        /* The table played for me while I was away: drop my prompt and take its move. */
        try { clearTimer(); pending = null; if (R) R.myTurn = false; $("#act").innerHTML = ""; closeOv(); renderHand(); } catch (e) { /* ignore */ }
        say("الكمبيوتر لعب عنك");
        return { body: result.m.body };
      }
      const { body, local } = result.x;
      S.moves.set(k, { seat: S.you, body });
      push(k, S.you, body);
      return { body, local };
    }
    const g = seat < 0 ? -1 : l2g(seat);
    const human = g >= 0 && S.persons.has(g);
    const arrived = waitFor(k);
    const started = Date.now();
    let retryAt = 0;
    try {
      for (;;) {
        const m = await Promise.race([arrived.promise, sleep(200).then(() => null)]);
        ensure(token);
        if (m) return { body: m.body };
        if (Date.now() < retryAt) continue;
        const waited = Date.now() - started;
        const mine = !human || S.away(g) ? waited : waited - PATIENCE_MS; /* time since this became the table's job */
        if (mine < S.stepInAfter()) continue;
        retryAt = Date.now() + 4000;
        const body = await how.lead();
        ensure(token);
        if (!S.moves.has(k)) push(k, g, body);
      }
    } finally {
      arrived.cancel();
    }
  }

  /* ---------- the decisions the game asks for ---------- */
  S.deal = async function (token) {
    const { body } = await decide(-1, token, {
      lead: async () => ({ d: Baloot.shuffled(fairShuffleRandom).map(code) }),
    });
    const list = Array.isArray(body.d) ? body.d.map(Number) : [];
    if (list.length !== 32 || new Set(list).size !== 32 || list.some((n) => !(n >= 0 && n < 32))) {
      throw new Error("bad deal");
    }
    return list.map((n) => ({ s: n >> 3, r: n & 7 }));
  };

  S.buy = async function (seat, token, how) {
    const { body } = await decide(seat, token, {
      mine: async () => { const v = await how.mine(); return { body: { v: String(v) }, local: v }; },
      lead: async () => ({ v: String(await how.lead()) }),
    });
    return String(body.v);
  };

  function picksOut(picks, toWire) {
    if (!picks) return null;
    const turn = (a) => (Array.isArray(a) && a.length === 4 ? [a[0], toWire ? l2g(a[1]) : g2l(a[1]), a[2], a[3]].map(Number) : null);
    return { kind: String(picks.kind || ""), reveal: turn(picks.reveal), cheat: turn(picks.cheat) };
  }

  S.card = async function (p, token, how) {
    const { body, local } = await decide(p, token, {
      mine: async () => {
        const res = await how.mine();
        if (!res) return { body: { none: 1 }, local: null };
        let body;
        if (res.qayd) body = { q: picksOut(R && R.qaydSent, true) };
        else if (res.claim) body = { sw: 1 };
        else {
          body = {
            c: code(res.card),
            a: res.akk ? 1 : 0,
            sl: window.__qaydSlamArmed === true && QaidWallet.coins >= SLAM_COST ? 1 : 0,
            d: R.n === 0 && R.decl[0] && R.decl[0].length ? 1 : 0,
          };
        }
        return { body, local: Object.assign({}, res, { local: true }) };
      },
      lead: async () => {
        const card = await how.lead();
        return { c: code(card), a: 0, sl: 0, d: R.n === 0 ? 1 : 0 };
      },
    });
    if (local !== undefined) return local;
    if (body.none) return null;
    if (body.sw) return { sawa: true, net: true };
    if (body.q) return { qayd: picksOut(body.q, false), net: true };
    const card = (R.h[p] || []).find((c) => code(c) === Number(body.c));
    if (!card) { resync(); throw STOP; }
    return { card, from: throwOrigin(p), akk: !!body.a, slam: !!body.sl, decl: !!body.d, net: true };
  };

  /* A bot opponent may catch a person's cut. Only the lead rolls the dice; everyone applies the result. */
  S.catchCut = async function (v, token) {
    if (!v || v.caught || v.judged || !v.reveal || !QAYD_NAME[v.kind]) return null;
    v.judged = true;
    if (cfg.mode !== "free" || !S.person(v.p)) return null;
    const opponents = [1, 2, 3].map((i) => (v.p + i) % 4).filter((q) => q % 2 !== v.p % 2 && !S.person(q));
    v.checkedBy = opponents;
    if (!opponents.length) return null;
    const { body } = await decide(-1, token, {
      lead: async () => {
        for (const q of opponents) {
          const bot = botAt(q);
          if (!bot || !QaidBots.detects(bot.id)) continue;
          if (Math.random() < qaydWalk(bot)) continue;
          return { x: l2g(q) };
        }
        return { x: -1 };
      },
    });
    const who = Number(body.x) >= 0 ? g2l(Number(body.x)) : null;
    if (who != null && opponents.includes(who)) {
      v.detectedBy = who;
      v.caught = true;
      return who;
    }
    v.detectedBy = null;
    return null;
  };

  /* Between rounds nobody waits forever for a phone that is not looking. */
  S.autoNext = function (token, done) {
    if (done) return;
    setTimeout(() => {
      if (token !== epoch || !pending) return;
      const nx = document.getElementById("nx");
      if (nx) nx.click();
    }, S.replaying ? 10 : 9000);
  };

  /* ---------- start, stop, replay ---------- */
  function boot(replay) {
    S.k = 0;
    S.replaying = !!replay;
    FAST = replay ? true : FAST_URL;
    epoch++;
    try { CardMotion.cancelAll(); } catch (e) { /* ignore */ }
    try { clearTimer(); } catch (e) { /* ignore */ }
    pending = null;
    try { closeOv(); hideHandLineup(); } catch (e) { /* ignore */ }
    const gm = document.getElementById("gm");
    if (gm) gm.classList.remove("on");
    G = null;
    R = null;
    net.kick();
    net.matchId = S.matchId;
    startGame();
  }

  let resyncing = false;
  function resync() {
    if (resyncing || !S.on) return;
    resyncing = true;
    setTimeout(() => {
      resyncing = false;
      if (S.on) boot(true);
    }, 0);
  }

  S.begin = function (data) {
    S.on = true;
    S.you = Number(data.you) || 0;
    S.matchId = String(data.matchId || "");
    S.seed = Number(data.seed) || 1;
    S.persons = new Set();
    S.names = {};
    (data.seats || []).forEach((s) => {
      if (!s || s.seat == null) return;
      S.persons.add(Number(s.seat));
      S.names[Number(s.seat)] = String(s.name || "لاعب").slice(0, 14);
    });
    S.persons.add(S.you);
    S.online = null;
    S.moves = new Map();
    S.waiters = [];
    feed(data.moves || []);
    const st = data.settings || {};
    try {
      cfg = {
        mode: st.mode === "free" ? "free" : "friendly",
        len: [61, 101, 152].includes(Number(st.len)) ? Number(st.len) : 152,
        vis: "pub",
        stake: [0, 100, 500, 1000, 2500].includes(Number(st.stake)) ? Number(st.stake) : 0,
      };
    } catch (e) { /* table script not ready */ }
    net.role = "peer";
    net.humans = {};
    boot(S.moves.size > 0);
  };

  S.stop = function () {
    if (!S.on) return;
    S.on = false;
    S.replaying = false;
    FAST = FAST_URL;
    S.waiters = [];
    if (net.role === "peer") net.role = null;
  };

  /* The match ended on this phone: it reports the result like everyone else, the server keeps the first. */
  S.finish = function () {
    S.stop();
    net.post({ type: "sync-done" });
    try { localStorage.removeItem(S.paidKey); } catch (e) { /* ignore */ }
  };

  /* Rotate this phone's view of the result back to the real seats. */
  S.report = function () {
    const mine = S.you % 2;
    const won = G.sc[0] > G.sc[1];
    const seatArr = (arr) => [0, 1, 2, 3].map((g) => Number((arr || [])[g2l(g)]) || 0);
    const cuts = typeof seatCuts === "function" ? seatCuts() : { hidden: [0, 0, 0, 0], caught: [0, 0, 0, 0] };
    return {
      winner: won ? mine : 1 - mine,
      scores: mine === 0 ? [G.sc[0], G.sc[1]] : [G.sc[1], G.sc[0]],
      seed: S.seed,
      eval: seatArr(typeof seatEvalXp === "function" ? seatEvalXp() : []),
      cuts: { hidden: seatArr(cuts.hidden), caught: seatArr(cuts.caught) },
    };
  };

  addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "qayd-shell") return;
    if (data.cmd === "sync-start") S.begin(data);
    else if (data.cmd === "sync-moves") { if (S.on && data.matchId === S.matchId) feed(data.moves); }
    else if (data.cmd === "sync-online") {
      if (S.on) S.online = new Set((data.seats || []).map(Number));
    }
    else if (data.cmd === "table-stop" || data.cmd === "local") S.stop();
  });

  if (typeof leaveGame === "function") {
    const before = leaveGame;
    leaveGame = function () {
      S.stop();
      return before.apply(this, arguments);
    };
  }
})();
