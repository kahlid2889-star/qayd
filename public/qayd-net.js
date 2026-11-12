/* Online bridge: host runs the real table, friends play their seats through it. */
(function () {
  const origin = location.origin;
  const net = (window.QaidNet = {
    role: null,
    humans: {},
    me: 0,
    seq: 0,
    waiters: new Map(),
    waiterMeta: new Map(),
    timer: 0,
    seed: 0,
    matchId: null,
    xpWaiters: new Map(),
    /* The next startGame() is an online match, not a game against the computer. */
    kick() { onlineKick = true; },
    human(seat) {
      return this.role === "host" && Number(seat) !== 0 && !!this.humans[seat];
    },
    labelSeats() {
      if (this.role !== "host" || typeof G === "undefined" || !G || !G.bots) return;
      Object.keys(this.humans).forEach((key) => {
        const seat = Number(key);
        if (!seat || !G.bots[seat]) return;
        const current = G.bots[seat];
        const botName = current.botName || current.name;
        G.bots[seat] = Object.assign({}, current, { botName, name: this.humans[seat], human: true });
      });
    },
    post(msg) {
      try { parent.postMessage(Object.assign({ source: "qayd-net" }, msg), origin); } catch (e) { /* parent gone */ }
    },
    waitAct(id, ms) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => { this.waiters.delete(id); resolve(null); }, ms);
        this.waiters.set(id, (value) => { clearTimeout(timer); resolve(value); });
      });
    },
    viewFor(seat) {
      if (typeof R === "undefined" || !R || typeof G === "undefined" || !G) return null;
      const names = [0, 1, 2, 3].map((p) => {
        try { return NM(p); } catch (e) { return this.humans[p] || "لاعب"; }
      });
      const say = document.getElementById("say");
      return {
        you: seat,
        names,
        scores: (G.sc || [0, 0]).slice(),
        dealer: G.dealer,
        round: G.n || 1,
        phase: R.phase,
        turn: R.turn,
        mode: R.mode,
        trump: R.T,
        buyer: R.buyer,
        multiplier: R.multiplier,
        contractKind: R.contractKind,
        open: R.open !== false,
        trick: (R.trick || []).map((t) => ({ p: t.p, s: t.c.s, r: t.c.r })),
        counts: (R.h || [[], [], [], []]).map((h) => h.length),
        hand: (R.h[seat] || []).map((c) => ({ s: c.s, r: c.r })),
        floor: R.floor ? { s: R.floor.s, r: R.floor.r } : null,
        floorUp: !!document.querySelector("#fl .cd"),
        hint: say ? String(say.textContent || "").slice(0, 80) : "",
        reveal: this.reveal || null,
        trickNo: R.n || 0,
        history: (R.last || []).map((row, i) => ({
          trick: (R.n || 0) - 1 - i,
          cards: (row.t || []).map((play) => ({ p: play.p, s: play.c.s, r: play.c.r })),
        })).filter((row) => row.trick >= 0).reverse(),
        need: this.openNeed(seat),
        qayd: (typeof R !== "undefined" && R && R.qaydWatch && R.qaydWatch.open) ? {
          open: true,
          seat: R.qaydWatch.seat,
          name: R.qaydWatch.name || "",
          kind: R.qaydWatch.kind || "",
          reveal: R.qaydWatch.reveal || "",
          cheat: R.qaydWatch.cheat || "",
          locked: !!R.qaydWatch.locked,
        } : null,
      };
    },
    openNeed(seat) {
      let open = null;
      this.waiterMeta.forEach((meta, id) => {
        if (!meta || meta.seat !== seat || !meta.kind) return;
        open = { id, kind: meta.kind, options: meta.options || null };
      });
      return open;
    },
    _sentSig: {},
    _cues: [],
    _cueN: 0,
    _heard: new Set(),
    _sounds: [],
    hear(key) {
      if (this.role !== "host" || !key) return;
      /* Card flights sound on the guest when it plays the same motion. Win/lose is team-relative, so the guest decides from the score. */
      if (!{ pass: 1, bal: 1, project: 1, qaid: 1, levelUp: 1, levelDown: 1 }[key]) return;
      this._cues.push({ id: ++this._cueN, key });
      if (this._cues.length > 12) this._cues.shift();
    },
    noteSound(key) {
      if (this.role !== "guest" || !key) return;
      this._sounds.push(String(key));
      if (this._sounds.length > 120) this._sounds.shift();
    },
    _sig(view) {
      const hand = (view.hand || []).map((c) => c.s + ":" + c.r).join(",");
      const trick = (view.trick || []).map((t) => t.p + ":" + t.s + ":" + t.r).join("|");
      const floor = view.floorUp && view.floor ? view.floor.s + ":" + view.floor.r : "";
      return [
        view.phase, view.turn, view.round, view.mode, view.trump, view.buyer, view.multiplier, view.contractKind,
        hand, (view.counts || []).join(","), trick, floor, (view.scores || []).join(","),
        (view.reveal && view.reveal.id) || "", view.hint || "", view.trickNo || 0,
        (view.history || []).map((row) => row.trick + ":" + (row.cards || []).length).join("."),
        view.qayd ? [view.qayd.seat, view.qayd.kind, view.qayd.reveal, view.qayd.cheat, view.qayd.locked ? 1 : 0].join(":") : "",
        view.need ? view.need.id + ":" + view.need.kind : "",
      ].join("~");
    },
    _push(seat, cues) {
      const view = this.viewFor(seat);
      if (!view) return false;
      view.cues = cues || [];
      const sig = this._sig(view);
      if (sig === this._sentSig[seat] && !view.cues.length) return false;
      this._sentSig[seat] = sig;
      this.post({ type: "view", seat, view });
      return true;
    },
    pushView(seat) {
      return this._push(seat, this._cues.slice());
    },
    pulse() {
      if (this.role !== "host") return;
      const cues = this._cues.slice();
      const seats = Object.keys(this.humans).map(Number).filter(Boolean);
      let sent = 0;
      seats.forEach((s) => { if (this._push(s, cues)) sent += 1; });
      if (!cues.length || sent === seats.length) this._cues.length = 0;
    },
    async bid(seat, opts, st) {
      const id = ++this.seq;
      const options = opts.map((value) => ({ value, label: QaidBuy.bubble(value, st.floorSuit) }));
      this.waiterMeta.set(id, { seat, kind: "bid", options });
      this.post({ type: "need", id, seat, kind: "bid", options });
      this.pushView(seat);
      const action = await this.waitAct(id, 18000);
      this.waiterMeta.delete(id);
      return opts.includes(action) ? action : opts[0];
    },
    async card(seat) {
      const id = ++this.seq;
      this.waiterMeta.set(id, { seat, kind: "card" });
      this.post({ type: "need", id, seat, kind: "card" });
      this.pushView(seat);
      const got = await this.waitAct(id, ((typeof P !== "undefined" && P.turnTime) || 25) * 1000);
      this.waiterMeta.delete(id);
      if (typeof R !== "undefined" && R && R.qaydWatch && Number(R.qaydWatch.seat) === Number(seat)) {
        R.qaydWatch = null;
        try { if (typeof qaydSpectate === "function") qaydSpectate(null); } catch (e) { /* overlay */ }
      }
      if (got && got.sawa === true) {
        if (R.trick && R.trick.length) {
          try { say("سوا قبل أول ورقة من الأكلة"); } catch (e) { /* ignore */ }
        } else return { sawa: true };
      }
      const qayd = cleanClaim(got && got.qayd);
      if (qayd) return { qayd };
      let card = got && R.h[seat].find((c) => c.s === got.s && c.r === got.r);
      // Limited mode has no cuts: a card the rules forbid never reaches the table, whatever the guest's device sent.
      if (card && typeof cfg !== "undefined" && cfg.mode !== "free" &&
        !Baloot.legal(R.h[seat], R.trick, seat, R.mode, R.T, { open: R.open }).includes(card)) {
        card = aiPick(seat);
        return { card, from: throwOrigin(seat) };
      }
      if (!card) {
        try { say("انتهى وقت " + NM(seat) + " — الكمبيوتر لعب عنه"); } catch (e) { /* ignore */ }
        card = aiPick(seat);
      }
      return { card, from: throwOrigin(seat) };
    },
    settleXp(payload) {
      return new Promise((resolve) => {
        const req = ++this.seq;
        const timer = setTimeout(() => {
          this.xpWaiters.delete(req);
          resolve(null);
        }, 5000);
        this.xpWaiters.set(req, (value) => {
          clearTimeout(timer);
          resolve(value);
        });
        this.post({ type: "xp", req, payload });
      });
    },
    queueXp(payload) {
      let list = [];
      try { list = JSON.parse(localStorage.getItem("qayd-xp-queue") || "[]"); } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      if (!list.some((item) => item && item.matchId === payload.matchId)) list.push(payload);
      try { localStorage.setItem("qayd-xp-queue", JSON.stringify(list.slice(-20))); } catch (e) { /* ignore */ }
    },
    async flushXp() {
      let list = [];
      try { list = JSON.parse(localStorage.getItem("qayd-xp-queue") || "[]"); } catch (e) { list = []; }
      if (!Array.isArray(list) || !list.length) return;
      const left = [];
      for (const item of list) {
        const result = await this.settleXp(item);
        if (result && result.ok && window.QaidRank && QaidRank.adoptServer) QaidRank.adoptServer(result, item);
        else if (result && result.gone) continue; /* the server never saw this match start: do not retry forever */
        else left.push(item);
      }
      try { localStorage.setItem("qayd-xp-queue", JSON.stringify(left)); } catch (e) { /* ignore */ }
    },
  });

  let wake = null;
  function holdAwake() {
    try {
      if (!navigator.wakeLock || wake || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((lock) => {
        wake = lock;
        lock.addEventListener("release", () => { if (wake === lock) wake = null; });
        if (!net.role) dropAwake();
      }).catch(() => { /* low battery or unsupported */ });
    } catch (e) { /* unsupported */ }
  }
  function dropAwake() {
    const lock = wake;
    wake = null;
    try { if (lock) lock.release(); } catch (e) { /* ignore */ }
  }
  document.addEventListener("visibilitychange", () => { if (net.role) holdAwake(); });

  /* The session owner picks mode, length and stake in the lobby; every seat plays by the same three. */
  function applySettings(raw) {
    const st = raw || {};
    const next = {
      mode: st.mode === "free" ? "free" : "friendly",
      len: [61, 101, 152].includes(Number(st.len)) ? Number(st.len) : 152,
      vis: "pub",
      stake: [0, 100, 500, 1000, 2500].includes(Number(st.stake)) ? Number(st.stake) : 0,
    };
    try { cfg = next; } catch (e) { /* table script not ready */ }
    return next;
  }

  function armHost(humans, seed, matchId) {
    net.role = "host";
    net.humans = humans || {};
    net.me = 0;
    net.holdOnline = true;
    net.seed = seed || Date.now();
    net.matchId = matchId || net.matchId;
    net._sentSig = {};
    net._cues = [];
    clearInterval(net.timer);
    net.timer = setInterval(() => net.pulse(), 320);
    holdAwake();
  }

  let onlineKick = false;
  let guestYou = 2;
  let guestNeed = null;
  let shown = null;
  let viewQueue = [];
  let presenting = false;
  let guestScores = [0, 0];

  function disarm() {
    net.role = null;
    net.humans = {};
    net.holdOnline = false;
    clearInterval(net.timer);
    net.timer = 0;
    net.waiters.forEach((fn) => { try { fn(null); } catch (e) { /* ignore */ } });
    net.waiters.clear();
    net.waiterMeta.clear();
    guestNeed = null;
    shown = null;
    viewQueue = [];
    net.guestMatch = null;
    dropAwake();
  }

  function refundStake() {
    try {
      if (typeof G !== "undefined" && G && G.stake && !G.coinDone && window.QaidWallet) {
        QaidWallet.add(G.stake);
        G.coinDone = true;
        G.forcedOut = true;
        net.guestPaid = true;
        try { localStorage.removeItem("qayd-paid"); } catch (e) { /* ignore */ }
        if (typeof toast === "function") toast("انقفلت الطاولة قبل النتيجة، ورجعت لك عملات الدخول");
      }
    } catch (e) { /* wallet */ }
  }
  let rawLeave = null;
  function stopTable() {
    try { if (typeof G !== "undefined" && G) G.xpSettled = true; } catch (e) { /* ignore */ }
    refundStake();
    net.guestSettled = true;
    const inGame = document.getElementById("gm") && document.getElementById("gm").classList.contains("on");
    disarm();
    if (inGame && rawLeave) {
      try { rawLeave(); } catch (e) { /* already home */ }
    }
  }
  function releaseToLocal() {
    disarm();
    net.matchId = null;
    net.post({ type: "local" });
  }

  function dropSeat(seat) {
    delete net.humans[seat];
    if (typeof G !== "undefined" && G && G.bots && G.bots[seat]) {
      const bot = G.bots[seat];
      G.bots[seat] = Object.assign({}, bot, { name: bot.botName || bot.name, human: false });
    }
    net.waiterMeta.forEach((meta, id) => {
      if (meta.seat !== seat) return;
      const fn = net.waiters.get(id);
      net.waiters.delete(id);
      net.waiterMeta.delete(id);
      if (fn) fn(null);
    });
    try { if (typeof renderBotAvatars === "function") renderBotAvatars(); } catch (e) { /* ignore */ }
    try { if (typeof renderSeats === "function") renderSeats(); } catch (e) { /* ignore */ }
  }

  function adoptSeat(seat, name) {
    if (!seat || net.role !== "host") return;
    net.humans[seat] = name || "لاعب";
    net.labelSeats();
    try { if (typeof renderBotAvatars === "function") renderBotAvatars(); } catch (e) { /* ignore */ }
    try { if (typeof renderSeats === "function") renderSeats(); } catch (e) { /* ignore */ }
    delete net._sentSig[seat];
    net.pushView(seat);
  }

  function localSeat(abs, you) { return (abs - you + 4) % 4; }
  function motionToken() {
    try { return typeof epoch !== "undefined" ? epoch : 0; } catch (e) { return 0; }
  }
  function mark(kind) {
    net._motions = net._motions || [];
    net._motions.push(kind);
    if (net._motions.length > 80) net._motions.shift();
  }
  function paintScores(scores) {
    const us = guestYou % 2;
    const left = document.getElementById("sc0");
    const right = document.getElementById("sc1");
    if (left) left.textContent = String((scores && scores[us]) || 0);
    if (right) right.textContent = String((scores && scores[1 - us]) || 0);
  }
  function seats(player) {
    try { renderSeats(player == null ? null : player); } catch (e) { /* table still filling */ }
    paintScores(guestScores);
  }
  function hands() {
    try {
      if (R && R.h && R.h[0] && R.h[0].length) renderHand();
      else {
        const box = document.getElementById("hand");
        if (box) box.replaceChildren();
      }
    } catch (e) { /* art not ready */ }
  }
  function stageHands(counts, hand) {
    if (!R) return;
    R.h[0] = (hand || []).slice(0, counts[0] || 0);
    try { if (R.h[0].length && typeof sortH === "function") sortH(R.h[0]); } catch (e) { /* order */ }
    for (let local = 1; local < 4; local++) {
      R.h[local] = Array.from({ length: counts[local] || 0 }, () => ({ s: 0, r: 0 }));
    }
  }
  function visibleHand(view) {
    const trickKeys = new Set((view.trick || []).map((t) => t.s + ":" + t.r));
    return (view.hand || []).filter((c) => {
      const key = c.s + ":" + c.r;
      if (!net._flying || !net._flying.has(key)) return true;
      if (trickKeys.has(key)) { net._flying.delete(key); return false; }
      if (view.turn !== view.you) { net._flying.delete(key); return true; }
      return false;
    }).map((c) => ({ s: c.s, r: c.r }));
  }
  function takeSnap(view) {
    const you = view.you;
    const counts = [0, 0, 0, 0];
    const raw = view.counts || [0, 0, 0, 0];
    for (let abs = 0; abs < 4; abs++) counts[localSeat(abs, you)] = raw[abs] || 0;
    return {
      you,
      phase: view.phase || "",
      turn: localSeat(view.turn || 0, you),
      counts,
      hand: visibleHand(view),
      trick: (view.trick || []).map((t) => ({ p: localSeat(t.p, you), c: { s: t.s, r: t.r } })),
      floor: view.floorUp && view.floor ? { s: view.floor.s, r: view.floor.r } : null,
      scores: (view.scores || [0, 0]).slice(),
      buyer: view.buyer == null || view.buyer < 0 ? -1 : localSeat(view.buyer, you),
      mode: view.mode,
      trump: view.trump,
      round: view.round || 1,
    };
  }
  function sameCards(a, b) {
    if (!a || !b) return false;
    const hand = (s) => s.hand.map((c) => c.s + ":" + c.r).join(",");
    const trick = (s) => s.trick.map((t) => t.p + ":" + t.c.s + ":" + t.c.r).join("|");
    const floor = (s) => (s.floor ? s.floor.s + ":" + s.floor.r : "");
    return a.phase === b.phase && a.round === b.round && a.counts.join() === b.counts.join()
      && hand(a) === hand(b) && trick(a) === trick(b) && floor(a) === floor(b)
      && a.buyer === b.buyer && a.mode === b.mode && String(a.trump) === String(b.trump);
  }
  function scoreSound(prev, next) {
    if (!prev) return;
    const us = next.you % 2;
    const mine = (next.scores[us] || 0) - (prev.scores[us] || 0);
    const theirs = (next.scores[1 - us] || 0) - (prev.scores[1 - us] || 0);
    if (!mine && !theirs) return;
    net._scoreSoundAt = Date.now();
    try { sfx(mine >= theirs ? "win" : "lose"); } catch (e) { /* audio */ }
  }
  function clearSlots() {
    ["sl0", "sl1", "sl2", "sl3"].forEach((id) => {
      const n = document.getElementById(id);
      if (n) n.replaceChildren();
    });
  }
  function cleanClaim(raw) {
    if (!raw || typeof raw !== "object") return null;
    const kind = String(raw.kind || "");
    if (!["qati", "ma-daq", "ma-kabbar", "rabaa", "akka"].includes(kind)) return null;
    const quad = (v) => {
      if (!Array.isArray(v) || v.length !== 4) return null;
      const n = v.map((x) => Number(x));
      if (n.some((x) => !Number.isInteger(x))) return null;
      if (n[0] < 0 || n[0] > 30 || n[1] < 0 || n[1] > 3 || n[2] < 0 || n[2] > 3 || n[3] < 0 || n[3] > 7) return null;
      return n;
    };
    const reveal = quad(raw.reveal);
    const cheat = quad(raw.cheat);
    if (!reveal || !cheat) return null;
    return { kind, reveal, cheat };
  }
  function postTurn(action, flyCard) {
    if (!guestNeed || guestNeed.kind !== "card") return false;
    const id = guestNeed.id;
    guestNeed = null;
    pending = null;
    const act = document.getElementById("act");
    if (act) { act.innerHTML = ""; delete act.dataset.turnTools; }
    try { closeOv(); } catch (e) { /* overlay */ }
    net.post({ type: "act", id, seat: guestYou, action });
    if (flyCard) {
      net._flying = net._flying || new Set();
      net._flying.add(flyCard.s + ":" + flyCard.r);
      queueMicrotask(() => { void guestThrow(flyCard, null); });
    }
    return true;
  }
  function showTurnTools() {
    const act = document.getElementById("act");
    if (!act || act.dataset.turnTools === "1") return;
    act.dataset.turnTools = "1";
    act.innerHTML = "";
    [["سوا", guestSawa], ["المشاريع", guestProjects], ["قيدها", guestQaid]].forEach(([label, fn]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = () => { try { sfx("click"); } catch (e) { /* audio */ } fn(); };
      act.append(b);
    });
  }
  function guestProjects() {
    const view = net._view;
    if (!view || typeof Baloot === "undefined" || typeof projectLabel !== "function") return;
    const list = Baloot.projects(view.hand || [], view.mode, view.trump);
    if (!list.length) { try { say("ما عندك مشروع"); } catch (e) { /* ignore */ } return; }
    try { say(list.map(projectLabel).join("، ")); } catch (e) { /* ignore */ }
  }
  function guestSawa() {
    const view = net._view;
    if (!guestNeed || guestNeed.kind !== "card") return;
    if (!view || view.turn !== guestYou) { try { say("سوا تُطلب في دورك"); } catch (e) { /* ignore */ } return; }
    if ((view.trick || []).length) { try { say("سوا قبل أول ورقة من الأكلة"); } catch (e) { /* ignore */ } return; }
    ov('<h2>تأكيد سوا</h2><p>سوا تعني أنك أنت تأخذ كل الأكلات المتبقية، ولا يكفي أن يأخذها خويّك. إذا كانت خاطئة، الصكة كاملة للخصم. صاحب الطاولة هو الذي يحسمها.</p><div class="row2"><button class="wide" id="claim-no" type="button">تراجع</button><button class="cta" id="claim-yes" type="button">سوا</button></div>');
    const no = document.getElementById("claim-no");
    const yes = document.getElementById("claim-yes");
    if (no) no.onclick = () => closeOv();
    if (yes) yes.onclick = () => { yes.disabled = true; postTurn({ sawa: true }); };
  }
  function guestQaid() {
    const view = net._view;
    if (!guestNeed || guestNeed.kind !== "card" || !view || view.turn !== guestYou) {
      try { say("قيدها في دورك، قبل ما ترمي"); } catch (e) { /* ignore */ } return;
    }
    const piles = (view.history || []).slice();
    if ((view.trick || []).length) piles.push({ trick: view.trickNo || 0, cards: view.trick });
    ov('<div id="qc-root"></div>');
    const ob = document.getElementById("ob");
    if (ob) ob.classList.add("qaid-catch");
    const root = document.getElementById("qc-root");
    if (!root) return;
    const picks = { kind: "", reveal: "", cheat: "" };
    function publish() {
      net.post({
        type: "qayd-watch",
        body: { open: true, seat: guestYou, name: (typeof P !== "undefined" && P.name) || "", kind: picks.kind, reveal: picks.reveal, cheat: picks.cheat },
      });
    }
    const head = document.createElement("div"); head.className = "qc-head";
    const title = document.createElement("h2"); title.className = "qc-title"; title.textContent = "قيدها";
    head.append(title);
    const kinds = document.createElement("div"); kinds.className = "qc-kinds";
    const desc = document.createElement("p"); desc.className = "qc-desc";
    const prompt = document.createElement("p"); prompt.className = "qc-prompt ask";
    const list = document.createElement("div"); list.className = "qc-scroll";
    const go = document.createElement("button"); go.type = "button"; go.className = "qc-go"; go.textContent = "قيدها!";
    const posName = { 2: "top", 1: "right", 3: "left", 0: "bot" };
    function paint() {
      const step = !picks.kind ? 0 : !picks.reveal ? 1 : !picks.cheat ? 2 : 3;
      prompt.textContent = step === 0 ? "١ · اختر نوع القيد" : step === 1 ? "٢ · اختر ورقة الكشف" : step === 2 ? "٣ · اختر ورقة الغش" : "جاهز — أكّد القيد";
      desc.textContent = picks.kind && typeof QAYD_INFO !== "undefined" ? QAYD_INFO[picks.kind].d : "القيد الغلط يعطي الصكة للخصم. صاحب الطاولة يحكم.";
      go.classList.toggle("ready", step === 3);
      root.querySelectorAll(".qc-slot").forEach((btn) => {
        const tag = btn.dataset.pid === picks.reveal ? "كشف" : btn.dataset.pid === picks.cheat ? "غش" : "";
        btn.classList.toggle("on", !!tag);
        if (tag) btn.dataset.tag = tag; else delete btn.dataset.tag;
      });
    }
    function choose(id) {
      if (picks.reveal === id) { picks.reveal = picks.cheat; picks.cheat = ""; }
      else if (picks.cheat === id) picks.cheat = "";
      else if (!picks.reveal) picks.reveal = id;
      else picks.cheat = id;
      try { sfx("click"); } catch (e) { /* audio */ }
      paint();
      publish();
    }
    ["qati", "ma-daq", "ma-kabbar", "rabaa", "akka"].forEach((id) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "qc-kind";
      const name = document.createElement("b"); name.textContent = (typeof QAYD_NAME !== "undefined" && QAYD_NAME[id]) || id; b.append(name);
      const why = typeof qaydKindState === "function" ? qaydKindState(id) : "";
      if (why) { b.classList.add("off"); const tag = document.createElement("small"); tag.textContent = why; b.append(tag); }
      b.onclick = () => {
        if (why) { try { say(name.textContent + ": " + why); } catch (e) { /* ignore */ } return; }
        picks.kind = picks.kind === id ? "" : id;
        kinds.querySelectorAll("button").forEach((n) => n.classList.toggle("on", n === b && !!picks.kind));
        try { sfx("click"); } catch (e) { /* audio */ }
        paint();
        publish();
      };
      kinds.append(b);
    });
    const playedTitle = document.createElement("b"); playedTitle.className = "qc-hands-title"; playedTitle.textContent = "الأكلات";
    list.append(playedTitle);
    piles.forEach((pile) => {
      const row = document.createElement("section"); row.className = "qc-row";
      const name = document.createElement("b"); name.className = "qc-name"; name.textContent = "الأكلة " + ((pile.trick || 0) + 1);
      const cross = document.createElement("div"); cross.className = "qc-cross";
      (pile.cards || []).forEach((play) => {
        const btn = document.createElement("button"); btn.type = "button";
        const local = localSeat(play.p, guestYou);
        btn.className = "qc-slot pos-" + (posName[local] || "bot");
        btn.dataset.pid = pile.trick + ":" + play.p + ":" + play.s + ":" + play.r;
        try { const face = cardEl({ s: play.s, r: play.r }); face.style.pointerEvents = "none"; btn.append(face); } catch (e) { /* card */ }
        const who = document.createElement("i"); who.className = "qc-who";
        who.textContent = (view.names && view.names[play.p]) || "";
        btn.append(who);
        btn.onclick = () => choose(btn.dataset.pid);
        cross.append(btn);
      });
      row.append(name, cross); list.append(row);
    });
    if (piles.length === 1 && !(view.history || []).length && !(view.trick || []).length) {
      const empty = document.createElement("p"); empty.className = "qc-empty"; empty.textContent = "لما تنزل أكلة تقدر تقيدها."; list.append(empty);
    }
    if (!piles.length) {
      const empty = document.createElement("p"); empty.className = "qc-empty"; empty.textContent = "لما تنزل أكلة تقدر تقيدها."; list.append(empty);
    }
    go.onclick = () => {
      if (!picks.kind || !picks.reveal || !picks.cheat) { paint(); return; }
      const num = (text) => String(text).split(":").map(Number);
      net.post({ type: "qayd-watch", body: { open: false, seat: guestYou } });
      postTurn({ qayd: { kind: picks.kind, reveal: num(picks.reveal), cheat: num(picks.cheat) } });
    };
    root.append(head, kinds, desc, prompt, list, go);
    paint();
    publish();
  }
  function armCardPending(need) {
    guestNeed = need;
    pending = (value) => {
      if (!value || !value.card) return;
      const card = { s: value.card.s, r: value.card.r };
      if (window.R) R.myTurn = false;
      postTurn(card, card);
    };
  }
  async function guestThrow(card, from) {
    if (net.role !== "guest" || !window.CardMotion || !window.R) return;
    try {
      R.h[0] = (R.h[0] || []).filter((c) => c.s !== card.s || c.r !== card.r);
      const before = CardMotion.handBefore();
      hands();
      const slot = document.getElementById("sl0");
      if (!slot) return;
      const held = slot.querySelector(".cd");
      if (!(held && held.dataset.s === String(card.s) && held.dataset.r === String(card.r))) {
        slot.replaceChildren();
        const el = cardEl(card);
        slot.style.zIndex = "14";
        slot.dataset.throwOrder = String((shown && shown.trick.length + 1) || 1);
        slot.append(el);
        mark("throw");
        const token = motionToken();
        await Promise.all([
          CardMotion.handAfter(before, token).catch(() => {}),
          CardMotion.play(el, from, 0, token, false).catch(() => {}),
        ]);
      }
    } catch (e) { /* the next snapshot puts the card back if the host refused it */ }
  }
  async function syncTrick(prev, next, snap) {
    const prevT = prev ? prev.trick : [];
    const nextT = next.trick;
    const prefix = nextT.length >= prevT.length && prevT.every((t, i) => t.p === nextT[i].p && t.c.s === nextT[i].c.s && t.c.r === nextT[i].c.r);
    if (prevT.length && !prefix) {
      if (!snap) {
        let winner = next.turn;
        try {
          const found = Baloot.winner(prevT.map((t) => ({ p: t.p, c: t.c })), prev.mode || next.mode, prev.trump);
          if (found) winner = found.p;
        } catch (e) { /* keep the seat the host says is next */ }
        mark("sweep");
        try { await CardMotion.sweep(winner, motionToken()); } catch (e) { /* land */ }
      }
      clearSlots();
    }
    const start = (!prevT.length || prefix) ? prevT.length : 0;
    for (let i = start; i < nextT.length; i++) {
      const t = nextT[i];
      const slot = document.getElementById("sl" + t.p);
      if (!slot) continue;
      const held = slot.querySelector(".cd");
      if (held && held.dataset.s === String(t.c.s) && held.dataset.r === String(t.c.r)) continue;
      if (slot.childElementCount) slot.replaceChildren();
      let el;
      try { el = cardEl(t.c); } catch (e) { continue; }
      slot.style.zIndex = String(11 + i);
      slot.dataset.throwOrder = String(i + 1);
      slot.append(el);
      if (!snap && i === nextT.length - 1 && window.CardMotion) {
        mark("throw");
        const from = t.p === 0 ? CardMotion.handBefore().get(typeof cn === "function" ? cn(t.c) : "") : null;
        try { await CardMotion.play(el, from || null, t.p, motionToken(), false); } catch (e) { /* card stays in the slot */ }
      }
    }
  }
  async function renderDelta(prev, next, snap) {
    if (net.role !== "guest") return false;
    let base = prev;
    if (base && next.round !== base.round) {
      try { if (window.CardMotion) CardMotion.cancelAll(); } catch (e) { /* none running */ }
      clearSlots();
      const floor = document.getElementById("fl");
      if (floor) floor.replaceChildren();
      const box = document.getElementById("hand");
      if (box) box.replaceChildren();
      for (let p = 1; p < 4; p++) {
        const fan = document.querySelector("#s" + p + " .fan");
        if (fan) fan.replaceChildren();
      }
      base = null;
    }
    const prevCounts = base ? base.counts : [0, 0, 0, 0];
    const deltas = next.counts.map((n, i) => Math.max(0, n - (prevCounts[i] || 0)));
    const grew = deltas.some(Boolean);
    const shrunk = next.counts.some((n, i) => n < (prevCounts[i] || 0));
    const floorGone = !!(base && base.floor && !next.floor);
    const floorNew = !!(next.floor && !(base && base.floor && base.floor.s === next.floor.s && base.floor.r === next.floor.r));
    const quiet = snap || !window.CardMotion;
    if (floorGone && !quiet) {
      mark("transfer");
      try { await CardMotion.transferFloor(next.buyer >= 0 ? next.buyer : 0, motionToken()); } catch (e) { /* drop it */ }
    }
    const floorNode = document.getElementById("fl");
    if (floorGone && floorNode && floorNode.childElementCount) floorNode.replaceChildren();
    if (grew && !next.trick.length && deltas.every((n) => n <= 8)) {
      if (!quiet) {
        stageHands(prevCounts, (base && base.hand) || []);
        hands();
        seats();
        mark("deal");
        try {
          await CardMotion.deal(deltas, motionToken(), async (player, amount) => {
            if (!amount || net.role !== "guest") return;
            if (player === 0) {
              const before = CardMotion.handBefore();
              const have = (R.h[0] || []).length;
              R.h[0] = next.hand.slice(0, Math.min(next.hand.length, have + amount));
              try { if (typeof sortH === "function") sortH(R.h[0]); } catch (e) { /* order */ }
              hands();
              await CardMotion.handAfter(before, motionToken());
            } else {
              R.h[player] = Array.from({ length: (prevCounts[player] || 0) + amount }, () => ({ s: 0, r: 0 }));
              try { renderSeats(player); } catch (e) { /* seat */ }
              paintScores(guestScores);
            }
          });
        } catch (e) { /* the still frame below matches the host */ }
      }
    } else if (shrunk || grew) {
      const before = !quiet && window.CardMotion ? CardMotion.handBefore() : null;
      stageHands(next.counts, next.hand);
      hands();
      seats();
      if (before && shrunk) {
        try { await CardMotion.handAfter(before, motionToken()); } catch (e) { /* fan settled */ }
      }
    }
    if (floorNew) {
      if (!quiet) {
        mark("floor");
        try { await CardMotion.floor(next.floor, motionToken()); } catch (e) {
          if (floorNode) {
            floorNode.replaceChildren();
            try { floorNode.append(cardEl(next.floor)); } catch (err) { /* art */ }
          }
        }
      } else if (floorNode) {
        floorNode.replaceChildren();
        try { floorNode.append(cardEl(next.floor)); } catch (e) { /* art */ }
      }
    }
    stageHands(next.counts, next.hand);
    await syncTrick(base, next, quiet);
    hands();
    seats();
    const liveFloor = document.getElementById("fl");
    if (liveFloor && !next.floor && liveFloor.childElementCount) liveFloor.replaceChildren();
    scoreSound(base, next);
    return true;
  }
  function applyModel(view) {
    net._view = view;
    guestYou = view.you;
    try { if (view.names && view.names[view.you]) P.name = String(view.names[view.you]).slice(0, 14); } catch (e) { /* ignore */ }
    if (typeof G === "undefined" || !G) G = { sc: [0, 0], n: 1, dealer: 0, bots: [null, null, null, null] };
    guestScores = (view.scores || [0, 0]).slice();
    G.sc = guestScores.slice();
    G.n = view.round || 1;
    G.dealer = localSeat(view.dealer || 0, guestYou);
    G.bots = [null, null, null, null];
    for (let local = 1; local < 4; local++) {
      const abs = (local + guestYou) % 4;
      G.bots[local] = { id: "sultan", name: (view.names && view.names[abs]) || "لاعب", human: !!(net.humans && net.humans[abs]) };
    }
    if (typeof R === "undefined" || !R) R = {};
    G.xpMatchId = net.guestMatch || null;
    G.xpSettled = !net.guestMatch || !!net.guestSettled;
    G.stake = net.guestStake || 0;
    G.coinDone = !!net.guestPaid;
    try { G.mode = cfg.mode; G.len = cfg.len; } catch (e) { /* ignore */ }
    const hand = visibleHand(view);
    const counts = view.counts || [0, 0, 0, 0];
    R.h = [hand, [], [], []];
    for (let local = 1; local < 4; local++) {
      R.h[local] = Array.from({ length: counts[(local + guestYou) % 4] || 0 }, () => ({ s: 0, r: 0 }));
    }
    R.trick = (view.trick || []).map((t) => ({ p: localSeat(t.p, guestYou), c: { s: t.s, r: t.r } }));
    R.phase = view.phase || "play";
    R.turn = localSeat(view.turn || 0, guestYou);
    R.mode = view.mode;
    R.T = view.trump;
    R.buyer = view.buyer == null || view.buyer < 0 ? -1 : localSeat(view.buyer, guestYou);
    R.multiplier = view.multiplier;
    R.contractKind = view.contractKind;
    R.open = view.open !== false;
    R.myTurn = !!(guestNeed && guestNeed.kind === "card" && view.turn === guestYou);
    R.floor = view.floor ? { s: view.floor.s, r: view.floor.r } : null;
    if (R.myTurn && guestNeed) {
      if (!pending) armCardPending(guestNeed);
      // Redraw now that it is our turn and the trick is current: this lights the legal cards
      // (limited mode) and makes a tap on a forbidden card shake instead of being replaced by the host.
      try { renderHand(); } catch (e) { /* art not ready */ }
    } else if (!(guestNeed && guestNeed.kind === "bid")) pending = null;
  }
  function applyChrome(view) {
    const splash = document.getElementById("sp");
    if (splash) { splash.classList.add("out"); splash.style.display = "none"; }
    show("gm");
    const turn = localSeat(view.turn || 0, guestYou);
    for (let p = 0; p < 4; p++) {
      const seat = document.getElementById("s" + p);
      if (seat) seat.classList.toggle("on", p === turn && view.phase !== "deal" && view.phase !== "result");
    }
    const box = document.getElementById("say");
    if (box) {
      const hint = String(view.hint || "").trim();
      const quiet = !hint || /^دور/.test(hint) || hint.startsWith("توزيع");
      if (quiet) {
        box.classList.remove("on");
        box.textContent = "";
      } else if (box.textContent !== hint) {
        box.textContent = hint;
        box.classList.add("on");
        clearTimeout(box._qaydToast);
        box._qaydToast = setTimeout(() => { box.classList.remove("on"); box.textContent = ""; }, 1700);
      }
    }
    const act = document.getElementById("act");
    if (act && (!guestNeed || guestNeed.kind !== "bid") && !(guestNeed && guestNeed.kind === "card" && view.turn === guestYou)) {
      act.innerHTML = "";
      delete act.dataset.turnTools;
    }
    if (guestNeed && guestNeed.kind === "card" && view.turn === guestYou) showTurnTools();
    paintScores(guestScores);
    (view.cues || []).forEach((cue) => {
      if (!cue || cue.id == null || net._heard.has(cue.id)) return;
      net._heard.add(cue.id);
      try { sfx(cue.key); } catch (e) { /* audio */ }
    });
    if (net._heard.size > 80) net._heard = new Set([...net._heard].slice(-40));
    if (view.reveal && view.reveal.id && net._revealId !== view.reveal.id && typeof window.qaydPaintReveal === "function") {
      net._revealId = view.reveal.id;
      window.qaydPaintReveal(Object.assign({}, view.reveal, {
        seats: (view.reveal.seats || []).map((seat) => Object.assign({}, seat, { p: localSeat(seat.p, guestYou) })),
      }));
      setTimeout(() => { const sheet = document.getElementById("drop-layer"); if (sheet) sheet.remove(); }, 2200);
    }
    if (!net._guestSized && typeof sizes === "function") {
      net._guestSized = true;
      const keep = R && R.h ? R.h[0].slice() : [];
      if (R) R.h[0] = [];
      try { sizes(); } catch (e) { /* layout */ }
      if (R) R.h[0] = keep;
    }
  }
  function enqueueView(view) {
    const next = takeSnap(view);
    const last = viewQueue[viewQueue.length - 1];
    if (last && sameCards(takeSnap(last), next)) viewQueue[viewQueue.length - 1] = view;
    else viewQueue.push(view);
    // A long backlog must not hold the guest's own turn. Older frames are dropped, the latest stays.
    if (view.phase === "play" && view.turn === view.you && viewQueue.length > 3) {
      viewQueue.splice(0, viewQueue.length - 1);
    } else if (viewQueue.length > 8) {
      viewQueue.splice(1, viewQueue.length - 5);
    }
  }
  async function drain() {
    presenting = true;
    try {
      while (viewQueue.length && net.role === "guest") {
        const view = viewQueue.shift();
        const next = takeSnap(view);
        const behind = viewQueue.length > 6;
        const painted = await renderDelta(shown, next, behind);
        if (painted) shown = next;
        net._paints = (net._paints || 0) + 1;
      }
    } catch (e) { console.warn("guest", e); }
    finally {
      presenting = false;
      if (viewQueue.length && net.role === "guest") void drain();
    }
  }
  function syncPrompt(view) {
    const need = view && view.need && view.need.id ? view.need : null;
    if (need) {
      if (guestNeed && guestNeed.id === need.id && guestNeed.kind === need.kind) return;
      guestNeed = { id: need.id, kind: need.kind, options: need.options || null };
      pending = null;
      return;
    }
    if (!guestNeed) return;
    guestNeed = null;
    pending = null;
  }
  function paintGuest(view) {
    if (!view || typeof show !== "function" || net.role !== "guest") return;
    try {
      const watch = view.qayd || null;
      const mine = !!(watch && Number(watch.seat) === Number(guestYou));
      const sheet = document.getElementById("ob");
      const driving = sheet && sheet.classList.contains("qaid-catch") && !sheet.classList.contains("qc-watch");
      if (!mine && typeof qaydSpectate === "function") qaydSpectate(watch, view);
      if (driving && (view.turn !== guestYou || view.phase !== "play")) {
        try { closeOv(); } catch (e) { /* overlay */ }
        net.post({ type: "qayd-watch", body: { open: false, seat: guestYou } });
      }
    } catch (e) { /* watch */ }
    const prevId = guestNeed && guestNeed.id;
    const prevKind = guestNeed && guestNeed.kind;
    syncPrompt(view);
    applyModel(view);
    applyChrome(view);
    if (guestNeed && guestNeed.kind === "bid" && (guestNeed.id !== prevId || prevKind !== "bid")) showBid(guestNeed);
    const next = takeSnap(view);
    if (shown && sameCards(shown, next) && !viewQueue.length && !presenting) {
      scoreSound(shown, next);
      shown = next;
      net._skips = (net._skips || 0) + 1;
      return;
    }
    enqueueView(view);
    if (!presenting) void drain();
  }

  function showBid(need) {
    guestNeed = need;
    const act = document.getElementById("act");
    if (!act) return;
    act.innerHTML = "";
    (need.options || []).forEach((option) => {
      const button = document.createElement("button");
      button.textContent = option.label;
      if (typeof bidTone === "function") button.className = bidTone(option.value);
      button.onclick = () => {
        if (!guestNeed || guestNeed.id !== need.id || guestNeed.kind !== "bid") return;
        try { sfx("click"); } catch (e) { /* audio */ }
        net.post({ type: "act", id: need.id, seat: guestYou, action: option.value });
        guestNeed = null;
        act.innerHTML = "";
      };
      act.append(button);
    });
  }

  addEventListener("message", (event) => {
    if (event.origin !== origin) return;
    const data = event.data;
    if (!data || data.source !== "qayd-shell") return;
    if (data.cmd === "name" && data.name) {
      try {
        const next = String(data.name).trim().slice(0, 14);
        if (next && (!P.name || P.name === "ضيف قيد")) {
          P.name = next;
          save();
          if (typeof home === "function") home();
        }
      } catch (e) { /* ignore */ }
    }
    if (data.cmd === "settings" && typeof openSet === "function") openSet();
    if (data.cmd === "saved" && typeof window.qaydSaveAck === "function") window.qaydSaveAck(!!data.ok);
    if (data.cmd === "xp-flush") {
      void net.flushXp();
    }
    if (data.cmd === "xp") {
      const fn = net.xpWaiters.get(data.req);
      if (fn) {
        net.xpWaiters.delete(data.req);
        fn(data.result || null);
      }
    }
    if (data.cmd === "arm") { applySettings(data.settings); armHost(data.humans, data.seed, data.matchId); }
    if (data.cmd === "go") {
      if (net.role !== "host") return;
      onlineKick = true;
      try { if (typeof startGame === "function") startGame(); } catch (e) { console.error(e); }
    }
    if (data.cmd === "table-stop") stopTable();
    if (data.cmd === "local") {
      const inGame = document.getElementById("gm") && document.getElementById("gm").classList.contains("on");
      /* The table was closed for us (host gone, room reset): that is not a walk-out, so no penalty. */
      try { if (typeof G !== "undefined" && G) G.xpSettled = true; } catch (e) { /* ignore */ }
      /* ...and the stake comes back: nobody won it. */
      try {
        if (typeof G !== "undefined" && G && G.stake && !G.coinDone && window.QaidWallet) {
          QaidWallet.add(G.stake);
          G.coinDone = true;
          G.forcedOut = true;
          net.guestPaid = true;
          try { localStorage.removeItem("qayd-paid"); } catch (e) { /* ignore */ }
          if (typeof toast === "function") toast("انقفلت الطاولة قبل النتيجة، ورجعت لك عملات الدخول");
        }
      } catch (e) { /* ignore */ }
      net.guestSettled = true;
      disarm();
      if (inGame && typeof leaveGame === "function") {
        try { leaveGame(); } catch (e) { /* already home */ }
      }
    }
    if (data.cmd === "drop") { if (net.role === "host") dropSeat(Number(data.seat)); }
    if (data.cmd === "adopt") { if (net.role === "host") adoptSeat(Number(data.seat), data.name); }
    if (data.cmd === "guest") {
      net.role = "guest";
      net.me = data.you;
      guestYou = data.you;
      net.humans = {};
      (data.seats || []).forEach((s) => { if (s && s.name) net.humans[s.seat] = s.name; });
      net.guestMatch = data.matchId || null;
      net.guestSettled = false;
      net.guestPaid = false;
      net.guestStake = 0;
      const rules = applySettings(data.settings);
      if (rules.stake && data.matchId && window.QaidWallet) {
        /* Pay the stake once per match, even if the page reloads and we rejoin the same table. */
        let paid = null;
        try { paid = JSON.parse(localStorage.getItem("qayd-paid") || "null"); } catch (e) { paid = null; }
        if (!paid || paid.matchId !== data.matchId) {
          const take = Math.min(rules.stake, QaidWallet.coins);
          QaidWallet.add(-take);
          paid = { matchId: data.matchId, stake: take };
          try { localStorage.setItem("qayd-paid", JSON.stringify(paid)); } catch (e) { /* ignore */ }
        }
        net.guestStake = Number(paid.stake) || 0;
      }
      net._heard = new Set();
      net._sounds = [];
      net._motions = [];
      net._flying = new Set();
      net._guestSized = false;
      shown = null;
      viewQueue = [];
      clearInterval(net.timer);
      holdAwake();
      net.post({ type: "sync" });
      setTimeout(() => {
        if (net.role === "guest" && !shown) net.post({ type: "sync" });
      }, 700);
    }
    if (data.cmd === "sync") {
      if (net.role !== "host") return;
      const seat = Number(data.seat);
      if (!seat) return;
      delete net._sentSig[seat];
      net.pushView(seat);
    }
    if (data.cmd === "view") {
      if (net.role === "guest") paintGuest(data.view);
    }
    if (data.cmd === "qayd-watch" && net.role === "host") {
      const body = data.body || {};
      const round = typeof R === "undefined" ? null : R;
      if (round) {
        round.qaydWatch = body.open ? {
          open: true,
          seat: Number(body.seat),
          name: body.name || "",
          kind: body.kind || "",
          reveal: body.reveal || "",
          cheat: body.cheat || "",
          locked: false,
        } : null;
      }
      if (typeof qaydSpectate === "function") qaydSpectate(body.open && round ? round.qaydWatch : null, null);
      try { net.pulse(); } catch (e) { /* local */ }
    }
    if (data.cmd === "need") {
      if (net.role !== "guest") return;
      guestNeed = data;
      if (data.kind === "bid") showBid(data);
      else if (data.kind === "card") {
        armCardPending(data);
        showTurnTools();
        if (window.R) { R.myTurn = true; R.phase = "play"; try { renderHand(); } catch (e) { /* ignore */ } }
      }
    }
    if (data.cmd === "act") {
      try { document.documentElement.dataset.qaidAct = JSON.stringify(data.action); } catch (e) { /* ignore */ }
      const meta = net.waiterMeta.get(data.id);
      /* The server stamps the sender's real seat. A move for somebody else's turn is ignored. */
      if (meta && data.seat != null && Number(data.seat) !== Number(meta.seat)) return;
      const fn = net.waiters.get(data.id);
      if (fn) { net.waiters.delete(data.id); fn(data.action); }
    }
    if (data.cmd === "result") {
      net.guestSettled = true;
      try { if (typeof G !== "undefined" && G) G.xpSettled = true; } catch (e) { /* ignore */ }
      const mine = data.you % 2 === data.winner;
      try {
        if (!net._scoreSoundAt || Date.now() - net._scoreSoundAt > 1600) sfx(mine ? "win" : "lose");
      } catch (e) { /* audio */ }
      try {
        if (mine) P.wins = (P.wins || 0) + 1;
        P.games = (P.games || 0) + 1;
        localStorage.setItem("sb", JSON.stringify(P));
      } catch (e) { /* ignore */ }
      const us = (data.scores && data.scores[data.you % 2]) || 0;
      const them = (data.scores && data.scores[1 - (data.you % 2)]) || 0;
      let coinBox = "";
      const stake = net.guestStake || 0;
      if (stake && window.QaidWallet && !net.guestPaid) {
        /* Same sum as the owner's table: the winner takes double his stake, the loser already paid. */
        net.guestPaid = true;
        if (mine) QaidWallet.add(stake * 2);
        const gift = QaidWallet.settleBroke();
        if (gift) QaidWallet.takeGift();
        try { localStorage.removeItem("qayd-paid"); } catch (e) { /* ignore */ }
        try { if (typeof G !== "undefined" && G) G.coinDone = true; } catch (e) { /* ignore */ }
        if (typeof coinTag === "function") {
          coinBox = `<div class="qn-coins ${mine ? "pos" : "neg"}"><div><span>${mine ? "ربحت اللعب على " + fmtNum(stake) : "خسرت دخولك"}</span>${coinTag(stake, "", mine ? "+" : "−")}</div><div class="bal"><span>رصيدك</span><span>${coinTag(QaidWallet.coins)}</span></div>${gift ? '<p class="note">خلصت عملاتك، وهذي ١٠٠ من الديوانية تكمّل فيها.</p>' : ""}</div>`;
        }
      }
      if (typeof ov === "function") {
        ov(`<h2>${mine ? "فزنا!" : "خسرنا هالمرة"}</h2><p>لنا ${us} · لهم ${them}</p>${coinBox}<p class="note">انحفظت النتيجة في حسابك.</p><button class="cta" onclick="closeOv()">تم</button>`);
      }
      if (window.QaidRank && QaidRank.finishSimple) {
        const grade = Array.isArray(data.eval) ? Number(data.eval[data.you]) : 0;
        const bag = data.cuts || {};
        const mineCuts = {
          hidden: Array.isArray(bag.hidden) ? Number(bag.hidden[data.you]) || 0 : 0,
          caught: Array.isArray(bag.caught) ? Number(bag.caught[data.you]) || 0 : 0,
        };
        try { QaidRank.finishSimple(mine, data.matchId, grade, mineCuts); } catch (e) { /* ignore */ }
      }
    }
  });

  if (typeof assignHandBots === "function") {
    const originalAssign = assignHandBots;
    assignHandBots = function () { originalAssign(); net.labelSeats(); };
  }
  if (typeof startGame === "function") {
    const originalStart = startGame;
    startGame = function () {
      const solo = !onlineKick;
      if (solo) releaseToLocal();
      onlineKick = false;
      const out = originalStart.apply(this, arguments);
      /* startGame sets G.xpMatchId before its first await, so it is readable here. */
      try { if (solo && typeof G !== "undefined" && G && G.xpMatchId) net.post({ type: "begin", matchId: G.xpMatchId }); } catch (e) { /* ignore */ }
      return out;
    };
  }
  if (typeof leaveGame === "function") {
    rawLeave = leaveGame;
    leaveGame = function () {
      const matchId = typeof G !== "undefined" && G && G.xpMatchId;
      const pending = !!(matchId && G && !G.xpSettled);
      if (pending && G) G.xpSettled = true;
      releaseToLocal();
      const out = rawLeave.apply(this, arguments);
      if (pending && window.QaidRank && QaidRank.abandon) QaidRank.abandon(matchId);
      return out;
    };
  }
  if (typeof botAvatar === "function") {
    const originalAvatar = botAvatar;
    botAvatar = function (profile) {
      if (profile && profile.human) {
        const ch = String(profile.name || "ل").trim().slice(0, 1);
        return `<b class="qn-ava">${ch}</b>`;
      }
      return originalAvatar(profile);
    };
  }

  const nativeSet = Storage.prototype.setItem;
  const originalSet = (key, value) => nativeSet.call(localStorage, key, value);
  /* An older build assigned the hook on the instance, which some browsers store as a junk "setItem" entry. */
  try { if (Storage.prototype.getItem.call(localStorage, "setItem") != null) Storage.prototype.removeItem.call(localStorage, "setItem"); } catch (e) { /* ignore */ }
  let seenGames = 0;
  let seenWins = 0;
  try { seenGames = P.games || 0; seenWins = P.wins || 0; } catch (e) { /* profile not ready */ }
  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage || key !== "sb") return nativeSet.call(this, key, value);
    let data = null;
    try { data = JSON.parse(value); } catch (e) { return originalSet(key, value); }
    if (data && typeof data === "object") {
      data.savedAt = Date.now();
      if (data.accountId == null && typeof P !== "undefined" && P.accountId) data.accountId = P.accountId;
      value = JSON.stringify(data);
      try { Object.assign(P, { savedAt: data.savedAt, accountId: data.accountId }); } catch (e) { /* ignore */ }
    }
    originalSet(key, value);
    if (data) net.post({ type: "profile", profile: data });
    if (net.role === "peer" && data && window.QaidSync) {
      const games = data.games || 0;
      if (games > seenGames) {
        seenGames = games;
        seenWins = data.wins || 0;
        try { net.post(Object.assign({ type: "over" }, QaidSync.report())); } catch (e) { /* ignore */ }
      }
      return;
    }
    if (net.role !== "host" || !data) return;
    const games = data.games || 0;
    const wins = data.wins || 0;
    if (games > seenGames) {
      const won = wins > (seenWins || 0);
      seenGames = games;
      seenWins = wins;
      net.post({
        type: "over",
        winner: won ? 0 : 1,
        scores: (typeof G !== "undefined" && G && G.sc) ? G.sc.slice() : [0, 0],
        seed: net.seed,
        eval: typeof seatEvalXp === "function" ? seatEvalXp() : [0, 0, 0, 0],
        cuts: typeof seatCuts === "function" ? seatCuts() : { hidden: [0, 0, 0, 0], caught: [0, 0, 0, 0] },
      });
    }
  };

  const style = document.createElement("style");
  style.textContent = ".qn-ava{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:#7a1f1f;color:#f6e7c1;font-weight:800}";
  document.head.appendChild(style);
  net.post({ type: "ready" });
})();
