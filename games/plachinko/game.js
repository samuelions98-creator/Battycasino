/* ===== plachinko math ===== */
/* Plachinko — pure maths. No DOM. Shared verbatim by the browser game and sim/plachinko.sim.js.

   Every ball is independent and is resolved completely by drop(): there is no state carried from ball to ball,
   so stake changes, stream speed, order of landing and leaving mid-stream cannot change the return.

   UNITS  All multipliers are integer "ticks" of 0.05x (20 ticks = 1x). Stakes are multiples of 20 BB, so
          stake * ticks / 20 is always a whole number of Batty Bucks: no payout is ever rounded.

   BALL   rows fair left/right bounces (one rng() call supplies the bits) -> pocket = number of rights.
          Pays TABLES[rows][risk][pocket] x stake.
   GOLD   1 ball in 50 is golden (base balls and fever balls): its pocket pays x5.
   GATE   The START gate is the centre peg of the middle row. A ball whose path strikes that peg drops into the
          gate with probability GATE.catch[rows], chosen so exactly 1 ball in 12 is a gate hit for every row
          count. Each gate hit spins the LCD once:
            7-7-7      BATTY FEVER  40 free balls, pockets x3
            n-n-n      FEVER        20 free balls, pockets x2
            n,n+1,n+2  TULIP TIME   5 bonus balls into the tulips, each 1x/2x/3x/5x/10x the stake
            n-m-n      REACH        near miss, pays nothing
            anything else           miss
          Fever balls fall through the same board at the triggering ball's stake. A fever ball that drops into
          the START gate adds 3 more balls, at most 5 times per fever (+15). Fever balls never spin the LCD.
   CAP    No single ball pays more than 5,000x its stake. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).plachinko = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TICK = 20;                       // ticks per 1x
  const ROWS = [8, 12, 16];
  const RISKS = ['low', 'med', 'high'];
  const RISK_NAMES = { low: 'Low', med: 'Medium', high: 'High' };
  const STAKES = [20, 40, 100, 200, 400, 1000, 2000];
  const CAP_X = 5000;                    // max win per ball, x stake

  /* Pocket multipliers, left edge -> centre (the board is symmetric). All multiples of 0.05. */
  const HALF = {
    8: {
      low: [4, 1.6, 1, 0.65, 0.45],
      med: [9, 2.5, 1.05, 0.5, 0.3],
      high: [21, 3, 1, 0.3, 0.2],
    },
    12: {
      low: [10, 4, 2, 1.2, 1, 0.5, 0.45],
      med: [22, 7, 3, 1.45, 0.8, 0.5, 0.3],
      high: [130, 15, 5, 1.6, 0.55, 0.25, 0.2],
    },
    16: {
      low: [16, 9, 4, 2, 1.3, 1.15, 1, 0.5, 0.3],
      med: [100, 25, 8, 4, 1.6, 1, 0.7, 0.55, 0.3],
      high: [1000, 100, 20, 7, 2.5, 1, 0.35, 0.25, 0.2],
    },
  };
  const TABLES = {}, TICKS = {};
  for (const r of ROWS) {
    TABLES[r] = {}; TICKS[r] = {};
    for (const k of RISKS) {
      const h = HALF[r][k], full = [];
      for (let i = 0; i <= r; i++) full.push(h[i <= r / 2 ? i : r - i]);
      TABLES[r][k] = full;
      TICKS[r][k] = full.map((m) => Math.round(m * TICK));
    }
  }

  const GOLD = { p: 1 / 50, mult: 5 };

  const choose = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return Math.round(c); };
  const GATE = { rate: 1 / 12, node: {}, pass: {}, catch: {} };
  for (const r of ROWS) {
    const gr = r / 2, gj = r / 4;        // node reached after gr bounces with gj rights = centre peg of row gr
    GATE.node[r] = { row: gr, rights: gj };
    GATE.pass[r] = choose(gr, gj) / Math.pow(2, gr);
    GATE.catch[r] = GATE.rate / GATE.pass[r];
  }

  /* LCD outcome per gate hit. Cumulative thresholds are compared with one rng() call. */
  const REEL = { batty: 0.002, fever: 0.02, tulip: 0.06, reach: 0.22 };
  REEL.miss = 1 - REEL.batty - REEL.fever - REEL.tulip - REEL.reach;

  const FEVER = {
    fever: { balls: 20, mult: 2 },
    batty: { balls: 40, mult: 3 },
    retrigger: { add: 3, max: 5 },       // per fever: at most 5 gate retriggers, +3 balls each
  };
  const TULIP = { balls: 5, prizes: [{ x: 1, w: 50 }, { x: 2, w: 30 }, { x: 3, w: 12 }, { x: 5, w: 6 }, { x: 10, w: 2 }] };
  TULIP.total = TULIP.prizes.reduce((s, p) => s + p.w, 0);

  /* ---- one ball's path: bits (bit i set = bounce right at row i), pocket, whether it strikes the gate peg ---- */
  function path(rng, rows, out) {
    const bits = Math.floor(rng() * (1 << rows));
    const g = GATE.node[rows];
    let j = 0, pass = false;
    for (let i = 0; i < rows; i++) {
      if (i === g.row && j === g.rights) pass = true;
      j += (bits >>> i) & 1;
    }
    out.bits = bits; out.pocket = j; out.pass = pass;
    return out;
  }

  function rollReel(rng, forceKind) {
    let kind;
    if (forceKind) kind = forceKind;
    else {
      const u = rng();
      kind = u < REEL.batty ? 'batty' : u < REEL.batty + REEL.fever ? 'fever' : u < REEL.batty + REEL.fever + REEL.tulip ? 'tulip'
        : u < REEL.batty + REEL.fever + REEL.tulip + REEL.reach ? 'reach' : 'miss';
    }
    let d; // digits as shown: [left, centre, right]; the centre reel stops last
    if (kind === 'batty') d = [7, 7, 7];
    else if (kind === 'fever') { const n = 1 + Math.floor(rng() * 8); const v = n >= 7 ? n + 1 : n; d = [v, v, v]; }
    else if (kind === 'tulip') { const a = 1 + Math.floor(rng() * 7); d = [a, a + 1, a + 2]; }
    else if (kind === 'reach') {
      const v = 1 + Math.floor(rng() * 9), up = rng() < 0.5;
      const c = up ? (v % 9) + 1 : ((v + 7) % 9) + 1;  // one step past, or one step short
      d = [v, c, v];
    } else {
      const a = 1 + Math.floor(rng() * 9);
      let r = 1 + Math.floor(rng() * 8); if (r >= a) r++;           // right differs from left
      let c = 1 + Math.floor(rng() * 9);
      if (r === a + 2 && c === a + 1) c = (c % 9) + 1;               // never an accidental straight
      d = [a, c, r];
    }
    return { kind, d };
  }

  function ballTicks(rows, risk, pocket, gold, mult) {
    const t = TICKS[rows][risk][pocket] * (gold ? GOLD.mult : 1) * mult;
    return t > CAP_X * TICK ? CAP_X * TICK : t;
  }

  function makeFever(rng, rows, risk, kind) {
    const cfg = FEVER[kind], balls = [];
    let left = cfg.balls, retrig = 0, total = 0;
    const p = {};
    while (left > 0) {
      left--;
      path(rng, rows, p);
      const gold = rng() < GOLD.p;
      const gate = p.pass && rng() < GATE.catch[rows];
      let add = 0;
      if (gate && retrig < FEVER.retrigger.max) { retrig++; add = FEVER.retrigger.add; left += add; }
      const ticks = ballTicks(rows, risk, p.pocket, gold, cfg.mult);
      total += ticks;
      balls.push({ bits: p.bits, pocket: p.pocket, gold, gate, add, ticks });
    }
    return { type: kind, mult: cfg.mult, base: cfg.balls, balls, ticks: total };
  }

  function makeTulip(rng) {
    const prizes = [];
    let total = 0;
    for (let i = 0; i < TULIP.balls; i++) {
      let u = rng() * TULIP.total, x = TULIP.prizes[TULIP.prizes.length - 1].x;
      for (const p of TULIP.prizes) { u -= p.w; if (u < 0) { x = p.x; break; } }
      prizes.push({ x, side: i % 2, ticks: x * TICK });
      total += x * TICK;
    }
    return { type: 'tulip', balls: prizes, ticks: total };
  }

  /* Resolve one paid ball completely.
     force (dev/testing only, never passed in normal play): { gate: true, reel: 'reach'|'tulip'|'fever'|'batty'|'miss', gold: true } */
  function drop(rng, rows, risk, force) {
    const o = { rows, risk, bits: 0, pocket: 0, pass: false, gold: false, gate: false, reel: null, feature: null, ticks: 0, totalTicks: 0 };
    path(rng, rows, o);
    if (force && force.gate) { let n = 0; while (!o.pass && n++ < 10000) path(rng, rows, o); }
    o.gold = rng() < GOLD.p || !!(force && force.gold);
    o.ticks = ballTicks(rows, risk, o.pocket, o.gold, 1);
    if (o.pass) o.gate = rng() < GATE.catch[rows] || !!(force && force.gate);
    if (o.gate) {
      o.reel = rollReel(rng, force && force.reel);
      if (o.reel.kind === 'fever' || o.reel.kind === 'batty') o.feature = makeFever(rng, rows, risk, o.reel.kind);
      else if (o.reel.kind === 'tulip') o.feature = makeTulip(rng);
    }
    o.totalTicks = o.ticks + (o.feature ? o.feature.ticks : 0);
    return o;
  }

  /* Whole Batty Bucks for a tick amount at a stake. Exact for every stake on the ladder; rounds otherwise. */
  const pay = (stake, ticks) => Math.round(stake * ticks / TICK);
  /* Total banked for an outcome: each ball (base, fever, tulip) is paid on its own. */
  function settle(o, stake) {
    let total = pay(stake, o.ticks);
    if (o.feature) for (const b of o.feature.balls) total += pay(stake, b.ticks);
    return total;
  }

  /* ---- exact expectations (used by the sim and the rules panel) ---- */
  function theory(rows, risk) {
    const n = Math.pow(2, rows), T = TICKS[rows][risk];
    const evBall = (mult) => {
      let e = 0;
      for (let k = 0; k <= rows; k++) {
        const pk = choose(rows, k) / n, cap = CAP_X * TICK;
        e += pk * ((1 - GOLD.p) * Math.min(cap, T[k] * mult) + GOLD.p * Math.min(cap, T[k] * GOLD.mult * mult));
      }
      return e / TICK;
    };
    let plain = 0, hitPlain = 0;
    for (let k = 0; k <= rows; k++) { const pk = choose(rows, k) / n; plain += pk * T[k] / TICK; if (T[k] >= TICK) hitPlain += pk; }
    /* expected number of balls in a fever: each ball is a gate hit with probability GATE.rate */
    const expBalls = (base) => {
      const memo = new Map();
      const f = (left, used) => {
        if (left === 0) return 0;
        const key = left * 8 + used; if (memo.has(key)) return memo.get(key);
        const g = GATE.rate;
        const v = 1 + (used < FEVER.retrigger.max ? g * f(left - 1 + FEVER.retrigger.add, used + 1) + (1 - g) * f(left - 1, used) : f(left - 1, used));
        memo.set(key, v); return v;
      };
      return f(base, 0);
    };
    const nF = expBalls(FEVER.fever.balls), nB = expBalls(FEVER.batty.balls);
    const feverAvg = nF * evBall(FEVER.fever.mult), battyAvg = nB * evBall(FEVER.batty.mult);
    const tulipAvg = TULIP.balls * TULIP.prizes.reduce((s, p) => s + p.x * p.w, 0) / TULIP.total;
    const base = evBall(1);
    const fever = GATE.rate * REEL.fever * feverAvg, batty = GATE.rate * REEL.batty * battyAvg, tulip = GATE.rate * REEL.tulip * tulipAvg;
    return {
      pockets: plain, gold: base - plain, base, fever, batty, tulip, rtp: base + fever + batty + tulip,
      feverAvg, battyAvg, tulipAvg, feverBalls: nF, battyBalls: nB, hitPlain,
      gateRate: GATE.rate, reachRate: GATE.rate * REEL.reach, feverRate: GATE.rate * (REEL.fever + REEL.batty),
    };
  }

  return { TICK, ROWS, RISKS, RISK_NAMES, STAKES, CAP_X, TABLES, TICKS, GOLD, GATE, REEL, FEVER, TULIP, path, rollReel, drop, pay, settle, theory, choose };
});

/* ===== plachinko ===== */
/* Plachinko — speed plinko in a neon pachinko parlour. Every outcome comes from BattyMath.plachinko.drop();
   this file only launches, animates and reveals what the maths already decided (and already banked). */
(function () {
  'use strict';
  const ID = 'plachinko', M = BattyMath.plachinko;
  const h = Batty.h, fmt = Batty.fmt, W = Batty.wallet, A = Batty.audio;
  let S = null, game = null;

  /* survives leaving and coming back (per page load) */
  const SESSION = { balls: 0, staked: 0, won: 0, bestX: 0, bestBB: 0, rows: 12, risk: 'med', stakeI: 0 };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmtM = (m) => (m >= 1000 ? (m / 1000) + 'K' : String(m));
  const tierOf = (m) => (m < 0.5 ? 0 : m < 1 ? 1 : m < 2 ? 2 : m < 10 ? 3 : m < 100 ? 4 : 5);
  const TIER = [
    { a: '#2c2670', b: '#1c1850', ink: '#a9a4ee' },
    { a: '#6a3df0', b: '#4320b0', ink: '#efe8ff' },
    { a: '#2ff0ff', b: '#0d9fd0', ink: '#021c2a' },
    { a: '#fff06a', b: '#f5b800', ink: '#3a2400' },
    { a: '#ffae45', b: '#f2600c', ink: '#3a1000' },
    { a: '#ff6fb0', b: '#f0146e', ink: '#ffffff' },
  ];
  const F_GOLD = 1, F_FEVER = 2, F_GATE = 4, F_TULIP = 8, F_BATTY = 16;
  const DIGIT_CLS = ['', 'c', 'y', 'c', 'y', 'c', 'y', 'p', 'y', 'c'];

  function create(root) {
    const dev = /[?&]dev\b/.test(location.search);
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let rows = SESSION.rows, risk = SESSION.risk, stakeI = SESSION.stakeI;
    let table = M.TABLES[rows][risk];

    /* ================= DOM ================= */
    const cvS = h('canvas', { class: 'g-plachinko-cv' }), cvL = h('canvas', { class: 'g-plachinko-cv' });
    const lamps = [0, 1, 2, 3].map(() => h('i'));
    const lampMore = h('b');
    const lcdStat = h('span', { class: 'g-plachinko-stat' }, 'READY');
    const reelEls = [0, 1, 2].map(() => {
      const strip = h('div', { class: 'g-plachinko-strip' });
      for (let d = 1; d <= 10; d++) { const v = d > 9 ? 1 : d; strip.append(h('span', { class: DIGIT_CLS[v] }, String(v))); }
      return { win: h('div', { class: 'g-plachinko-reel' }, strip), strip };
    });
    const lcdFoot = h('div', { class: 'g-plachinko-foot' }, h('span', null, 'HIT START TO SPIN'));
    const lcdCall = h('div', { class: 'g-plachinko-call' });
    const lcd = h('div', { class: 'g-plachinko-lcd' },
      h('div', { class: 'g-plachinko-lcdtop' }, h('span', { class: 'g-plachinko-res' }, h('em', null, 'HOLD'), lamps, lampMore), lcdStat),
      h('div', { class: 'g-plachinko-reels' }, reelEls.map((r) => r.win)),
      lcdFoot, lcdCall);
    const banner = h('div', { class: 'g-plachinko-banner', 'aria-live': 'polite' });
    const board = h('div', { class: 'g-plachinko-board' }, cvS, cvL, lcd, banner);
    const marq = h('div', { class: 'g-plachinko-marq' },
      h('span', { class: 'g-plachinko-bat', html: '<svg viewBox="0 0 120 58" aria-hidden="true"><path d="' + Batty.batPath + '"/><circle cx="55.5" cy="20" r="2.2"/><circle cx="64.5" cy="20" r="2.2"/></svg>' }),
      h('div', { class: 'g-plachinko-logo' }, h('b', null, 'PLACHINKO'), h('i', null, h('span', { lang: 'ja' }, 'パチンコ'), ' SPEED PLINKO')),
      h('span', { class: 'g-plachinko-bat r', html: '<svg viewBox="0 0 120 58" aria-hidden="true"><path d="' + Batty.batPath + '"/><circle cx="55.5" cy="20" r="2.2"/><circle cx="64.5" cy="20" r="2.2"/></svg>' }));
    const cab = h('div', { class: 'g-plachinko-cab' }, marq, board);

    const cell = (label, short, cls) => { const o = h('output', null, '0'); return { el: h('div', { class: 'g-plachinko-cell ' + (cls || '') }, h('small', null, h('span', { class: 'l' }, label), h('span', { class: 's' }, short)), o), o }; };
    const cTray = cell('Tray · landing', 'Tray', 'tray'), cNet = cell('Session net', 'Net', 'net');
    const cBalls = cell('Balls', 'Balls'), cBps = cell('Per sec', 'Per sec'), cBest = cell('Best hit', 'Best');
    const trayNote = h('p', { class: 'g-plachinko-note' }, 'Winnings land in the tray and pour into your balance when the board clears.');
    const money = h('div', { class: 'g-plachinko-money' }, cTray.el, cNet.el, trayNote);
    const counts = h('div', { class: 'g-plachinko-counts' }, cBalls.el, cBps.el, cBest.el);
    const chips = []; for (let i = 0; i < 14; i++) chips.push(h('span'));
    const strip = h('div', { class: 'g-plachinko-last', 'aria-label': 'Last pockets' }, h('small', null, 'Last'), h('div', null, chips));
    const legend = h('div', { class: 'g-plachinko-legend', html:
      '<h3>How it pays</h3>' +
      '<ul>' +
      '<li><b class="k p">7 7 7</b><span><strong>Batty Fever</strong>40 free balls, pockets ×3</span></li>' +
      '<li><b class="k c">5 5 5</b><span><strong>Fever</strong>20 free balls, pockets ×2</span></li>' +
      '<li><b class="k y">4 5 6</b><span><strong>Tulip Time</strong>5 bonus balls, up to 10× each</span></li>' +
      '<li><b class="k g"><i></i></b><span><strong>Golden ball</strong>1 in 50, its pocket pays ×5</span></li>' +
      '<li><b class="k s">START</b><span><strong>The gate</strong>1 ball in 12 drops in and spins the reels</span></li>' +
      '</ul>' });

    const seg = (label, opts, cur, on) => {
      const btns = opts.map((o) => h('button', { type: 'button', class: o.v === cur ? 'on' : '', 'aria-pressed': o.v === cur ? 'true' : 'false', onclick: () => on(o.v) }, o.t));
      return { el: h('div', { class: 'g-plachinko-seg' }, h('small', null, label), h('div', null, btns)), btns, set(v) { btns.forEach((b, i) => { const k = opts[i].v === v; b.classList.toggle('on', k); b.setAttribute('aria-pressed', k ? 'true' : 'false'); }); }, lock(d) { btns.forEach((b) => { b.disabled = d; }); } };
    };
    const segRows = seg('Rows', M.ROWS.map((r) => ({ v: r, t: String(r) })), rows, (v) => setConfig(v, risk));
    const segRisk = seg('Risk', M.RISKS.map((r) => ({ v: r, t: M.RISK_NAMES[r] })), risk, (v) => setConfig(rows, v));
    const cfg = h('div', { class: 'g-plachinko-cfg' }, segRows.el, segRisk.el);

    const stakeOut = h('output');
    const stMinus = h('button', { type: 'button', 'aria-label': 'Lower stake per ball', onclick: () => moveStake(-1) }, '−');
    const stPlus = h('button', { type: 'button', 'aria-label': 'Raise stake per ball', onclick: () => moveStake(1) }, '+');
    const stakeBox = h('div', { class: 'g-plachinko-stake' }, stMinus, stakeOut, stPlus);
    const autoBtn = h('button', { type: 'button', class: 'g-plachinko-auto', 'aria-pressed': 'false', onclick: () => toggleAuto() }, h('b', null, 'AUTO'), h('small', null, 'stream'));
    const dropBtn = h('button', { type: 'button', class: 'g-plachinko-drop', 'aria-label': 'Drop a ball. Hold to stream.' },
      h('span', { class: 'g-plachinko-dropface' }, h('b', null, 'DROP'), h('small', null, 'tap fast · hold · space')));
    root.append(cab,
      h('div', { class: 'g-plachinko-left' }, legend, counts, strip),
      h('div', { class: 'g-plachinko-right' }, money, cfg, stakeBox, autoBtn, dropBtn));

    /* ================= state ================= */
    const G = { W: 0, H: 0, ok: false };
    let dpr = 1, ctxS = cvS.getContext('2d'), ctxL = cvL.getContext('2d');
    const CAP = 640;
    const bx0 = new Float32Array(CAP), by0 = new Float32Array(CAP), bx1 = new Float32Array(CAP), by1 = new Float32Array(CAP), bb = new Float32Array(CAP);
    const bt0 = new Float64Array(CAP), bT = new Float32Array(CAP), bpx = new Float32Array(CAP), bpy = new Float32Array(CAP);
    const bseg = new Int16Array(CAP), bbits = new Uint32Array(CAP), bj = new Int8Array(CAP), bflags = new Uint8Array(CAP), bidx = new Int16Array(CAP);
    const bwin = new Float64Array(CAP), bstake = new Float64Array(CAP), bticks = new Float64Array(CAP);
    const bobj = new Array(CAP).fill(null);
    const act = new Int16Array(CAP), free = new Int16Array(CAP);
    let nAct = 0, nFree = CAP;
    for (let i = 0; i < CAP; i++) free[i] = CAP - 1 - i;

    const NP = 360, px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP), pl = new Float32Array(NP), pm = new Float32Array(NP), pc = new Uint8Array(NP);
    let pHead = 0;
    const PCOL = ['#ffffff', '#2ff0ff', '#fff06a', '#ff3d95', '#ffb347'];
    const NF = 160, fxX = new Float32Array(NF), fxY = new Float32Array(NF), fxT = new Float64Array(NF);
    let fHead = 0;
    const POPS = []; for (let i = 0; i < 20; i++) POPS.push({ on: false, x: 0, y: 0, t0: 0, text: '', col: '#fff', size: 12, life: 800 });
    const pockT = new Float64Array(20).fill(-1e9), pockC = new Uint8Array(20);
    const launches = new Float64Array(64); let lHead = 0;
    const lastRes = []; let lastDirty = true;

    let inFlight = 0;              // banked at launch, not yet landed on screen
    let spaceDown = false, auto = false, streamT0 = 0, acc = 0, feverAcc = 0;
    const pointers = new Set();
    let celebrating = false, pendingCel = null, lastBroke = -1e9, forceNext = null;
    const reelQ = []; let reelBusy = false, reelWake = null;
    const fevers = []; let tulipRuns = 0, tulipOpen = 0, tulipTarget = 0, gateGlow = -1e9, ledPhase = 0, heat = 0, feverGlow = 0;
    let shakeT = -1e9, lastUi = 0, lastNow = performance.now();
    const perf = { n: 0, sumDt: 0, maxDt: 0, sumJs: 0, maxJs: 0, peak: 0 };

    const netQ = []; let netBusy = false;  // online: balls paid for and waiting for the server to say where they go
    const busy = () => nAct > 0 || reelBusy || reelQ.length > 0 || fevers.length > 0 || tulipRuns > 0 || netQ.length > 0 || netBusy;
    const streaming = () => pointers.size > 0 || spaceDown || auto;

    /* ================= sound ================= */
    const PENTA = [0, 2, 4, 7, 9];
    const noteHz = (i) => 783.99 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);
    let tTing = 0, tLand = 0, tLaunch = 0, tMid = 0;
    function sTing(row, t) { if (A.muted || t - tTing < 26) return; tTing = t; A.tone({ f: noteHz(Math.round(row * 10 / (rows - 1))), d: 0.045, type: 'triangle', v: 0.028 }); }
    function sLaunch(t) { if (A.muted || t - tLaunch < 55) return; tLaunch = t; A.tone({ f: 520, f2: 260, d: 0.035, type: 'square', v: 0.035 }); }
    function sLand(x, gold, t) {
      if (A.muted) return;
      if (gold) { A.tone({ f: 2637, d: 0.1, type: 'sine', v: 0.08 }); A.tone({ f: 3520, d: 0.18, type: 'sine', v: 0.06, t: 0.06 }); }
      if (x >= 25) { A.seq([1568, 2093, 2637, 3136], { step: 0.05, type: 'square', v: 0.06 }); Batty.sfx('coin'); return; }
      if (x >= 5) { if (t - tMid < 70) return; tMid = t; A.tone({ f: 1568, d: 0.08, type: 'square', v: 0.045 }); A.tone({ f: 2349, d: 0.13, type: 'square', v: 0.045, t: 0.05 }); return; }
      if (t - tLand < 42) return; tLand = t;
      if (x >= 1) A.tone({ f: 1175 + x * 140, d: 0.07, type: 'sine', v: 0.06 });
      else A.tone({ f: 230, f2: 150, d: 0.045, type: 'sine', v: 0.05 });
    }
    function sGate() { A.tone({ f: 988, d: 0.07, type: 'square', v: 0.05 }); A.tone({ f: 1319, d: 0.13, type: 'square', v: 0.05, t: 0.06 }); }
    function sReelStop(i) { A.tone({ f: 330 + i * 110, f2: 200, d: 0.06, type: 'square', v: 0.06 }); }
    function sReach() { for (let i = 0; i < 3; i++) A.tone({ f: 620, f2: 1240, d: 0.22, type: 'sawtooth', v: 0.05, t: i * 0.24 }); }
    function sFanfare(big) {
      const n = Batty.notes;
      A.seq([n.G5, n.C6, n.E6, n.G6, n.E6, n.G6, [2093, 2], 0, n.G6, [2093, 3]], { step: 0.085, type: 'square', v: 0.09 });
      A.seq([n.C4, n.C4, n.G4, n.G4, n.C5, n.C5, [n.C5, 4]], { step: 0.127, type: 'sawtooth', v: 0.05 });
      A.noise({ d: 0.9, v: 0.05, hp: 6000 });
      if (big) { A.seq([n.A5, n.D5 * 2, 1479.98, n.A5 * 2, 1479.98, n.A5 * 2, [2349.3, 4]], { step: 0.085, type: 'square', v: 0.09, t: 0.95 }); A.noise({ d: 1.2, v: 0.05, hp: 5000, t: 0.95 }); Batty.sfx('thunder'); }
    }
    function sBloom() { A.seq([784, 988, 1175, 1568, 1976, 2349], { step: 0.045, type: 'sine', v: 0.09 }); }
    let beat = 0;
    const BASS = [130.8, 130.8, 196, 130.8, 155.6, 155.6, 196, 233.1];
    S.interval(() => {
      if (!fevers.length || A.muted) return;
      beat++;
      A.tone({ f: BASS[beat % 8], d: 0.1, type: 'square', v: 0.035 });
      if (beat % 2) A.noise({ d: 0.03, v: 0.025, hp: 7000 });
      if (beat % 4 === 0) A.tone({ f: fevers[0].type === 'batty' ? 1568 : 1046.5, d: 0.08, type: 'triangle', v: 0.035 });
    }, 132);

    /* ================= geometry ================= */
    const pegX = (r, i) => G.cx + (i - (r + 2) / 2) * G.dx;
    const pegY = (r) => G.y0 + r * G.dy;
    const pockX = (k) => G.cx + (k - rows / 2) * G.dx;
    let sprBall = null, sprPock = null, pockW = 0;

    function layout() {
      const r = board.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) { G.ok = false; return; }
      G.W = r.width; G.H = r.height; G.ok = true;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [cvS, cvL]) { c.width = Math.round(G.W * dpr); c.height = Math.round(G.H * dpr); }
      const Wd = G.W, Hd = G.H;
      G.pad = clamp(Wd * 0.034, 10, 20); G.cx = Wd / 2;
      G.lcdW = clamp(Wd * 0.5, 150, 330); G.lcdH = G.lcdW * 0.43; G.lcdX = G.cx - G.lcdW / 2; G.lcdY = G.pad + 4;
      G.nozY = G.lcdY + G.lcdH + 5;
      G.pockH = clamp(Hd * 0.058, 20, 36); G.pockY = Hd - G.pad - 5 - G.pockH;
      let dx = (Wd - 2 * G.pad - 4) / (rows + 1.7);
      let dy = (G.pockY - G.nozY - 4) / (rows - 1 + 0.8 + 1.05);
      dy = Math.min(dy, dx * 1.16);
      G.dx = dx; G.dy = dy;
      G.yLast = G.pockY - 0.8 * dy; G.y0 = G.yLast - (rows - 1) * dy;
      G.br = clamp(dx * 0.26, 3.6, 11); G.pr = clamp(dx * 0.088, 1.6, 4.4);
      G.seg = rows === 8 ? 128 : rows === 12 ? 108 : 98;
      G.gr = M.GATE.node[rows].row; G.gj = M.GATE.node[rows].rights;
      G.gx = pegX(G.gr, G.gj + 1); G.gy = pegY(G.gr);
      G.tR = clamp(Wd * 0.056, 17, 34); G.tx = G.pad + 5 + G.tR + Wd * 0.012;
      const rt = (G.cx - G.tx - G.tR - 6 - 0.8 * dx) / (dx / 2) - 2;
      G.ty = G.y0 + clamp(Math.min(rt - 0.4, 0.3 * (rows - 1)), 0.3, 99) * dy;
      G.chY = G.pad + 6;
      /* LED bulbs round the frame */
      const leds = [], inset = G.pad * 0.5, rad = 18, step = clamp(Wd / 26, 13, 20);
      const x0 = inset, y0 = inset, x1 = Wd - inset, y1 = Hd - inset;
      const edge = (ax, ay, bx, by) => { const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / step)); for (let i = 0; i < n; i++) leds.push(ax + (bx - ax) * i / n, ay + (by - ay) * i / n); };
      edge(x0 + rad, y0, x1 - rad, y0); edge(x1, y0 + rad, x1, y1 - rad); edge(x1 - rad, y1, x0 + rad, y1); edge(x0, y1 - rad, x0, y0 + rad);
      G.leds = new Float32Array(leds); G.nLed = leds.length / 2; G.ledR = clamp(G.pad * 0.2, 1.8, 3.4);
      lcd.style.cssText = 'left:' + G.lcdX + 'px;top:' + G.lcdY + 'px;width:' + G.lcdW + 'px;height:' + G.lcdH + 'px;font-size:' + (G.lcdW / 100) + 'px';
      for (const rl of reels) rl.cell = 0; // re-measured lazily
      makeSprites(); drawStatic();
    }

    function ballSprite(kind, r) {
      const g = Math.ceil(r * (kind ? 1.9 : 1.25)), s = (r + g) * 2, c = document.createElement('canvas');
      c.width = c.height = Math.ceil(s * dpr);
      const x = c.getContext('2d'); x.scale(dpr, dpr);
      const m = s / 2;
      const glow = ['rgba(190,215,255,', 'rgba(255,205,60,', 'rgba(255,46,136,', 'rgba(47,240,255,'][kind];
      const gg = x.createRadialGradient(m, m, r * 0.6, m, m, r + g);
      gg.addColorStop(0, glow + (kind ? '.75)' : '.35)')); gg.addColorStop(1, glow + '0)');
      x.fillStyle = gg; x.fillRect(0, 0, s, s);
      const stops = [['#ffffff', '#e4eaff', '#8e98c8', '#343a6a'], ['#fffbe0', '#ffe066', '#f29a00', '#7a3d00'], ['#ffffff', '#ffc4e0', '#ff2e88', '#7a0a45'], ['#ffffff', '#c4fff6', '#19d3ff', '#0a3f7a']][kind];
      const bg = x.createRadialGradient(m - r * 0.38, m - r * 0.42, r * 0.05, m, m, r);
      bg.addColorStop(0, stops[0]); bg.addColorStop(0.28, stops[1]); bg.addColorStop(0.72, stops[2]); bg.addColorStop(1, stops[3]);
      x.fillStyle = bg; x.beginPath(); x.arc(m, m, r, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(m - r * 0.36, m - r * 0.4, r * 0.2, 0, TAU); x.fill();
      return { c, half: s / 2, size: s };
    }
    const NUMFONT = '"Chakra Petch","Figtree","Segoe UI",system-ui,sans-serif';
    function rr(x, X, Y, w, hh, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + hh, r); x.arcTo(X + w, Y + hh, X, Y + hh, r); x.arcTo(X, Y + hh, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
    function makeSprites() {
      sprBall = [ballSprite(0, G.br), ballSprite(1, G.br), ballSprite(2, G.br), ballSprite(3, G.br)];
      pockW = G.dx;
      const c = document.createElement('canvas'), n = rows + 1, hh = G.pockH;
      c.width = Math.ceil(pockW * n * dpr); c.height = Math.ceil(hh * dpr);
      const x = c.getContext('2d'); x.scale(dpr, dpr);
      for (let k = 0; k < n; k++) {
        const m = table[k], T = TIER[tierOf(m)], X = k * pockW + 1, w = pockW - 2;
        const g = x.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, T.a); g.addColorStop(1, T.b);
        x.fillStyle = g; rr(x, X, 0, w, hh - 1, Math.min(6, w * 0.28)); x.fill();
        x.fillStyle = 'rgba(255,255,255,.28)'; rr(x, X + 1.5, 1.5, w - 3, Math.max(2, hh * 0.16), Math.min(3, w * 0.2)); x.fill();
        x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(X + 1, hh - 4, w - 2, 3);
        let txt = fmtM(m); if (w < 30 && m < 1) txt = txt.replace(/^0/, '');
        let fs = Math.min(hh * 0.5, 15);
        x.font = '700 ' + fs + 'px ' + NUMFONT;
        const tw = x.measureText(txt).width; if (tw > w - 3) { fs = Math.max(6.5, fs * (w - 3) / tw); x.font = '700 ' + fs + 'px ' + NUMFONT; }
        x.fillStyle = T.ink; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(txt, X + w / 2, hh * 0.56);
      }
      sprPock = c;
    }

    function drawStatic() {
      const x = ctxS, Wd = G.W, Hd = G.H;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, Wd, Hd);
      let g = x.createLinearGradient(0, 0, 0, Hd); g.addColorStop(0, '#17104a'); g.addColorStop(0.55, '#0d0930'); g.addColorStop(1, '#07051c');
      x.fillStyle = g; x.fillRect(0, 0, Wd, Hd);
      /* sunburst behind the LCD */
      x.save(); x.translate(G.cx, G.lcdY + G.lcdH * 0.5);
      const R = Math.hypot(Wd, Hd);
      for (let i = 0; i < 28; i++) { x.fillStyle = i % 2 ? 'rgba(255,46,136,.05)' : 'rgba(47,240,255,.028)'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, i * TAU / 28, (i + 1) * TAU / 28); x.closePath(); x.fill(); }
      x.restore();
      g = x.createRadialGradient(G.cx, Hd * 0.62, 10, G.cx, Hd * 0.62, Hd * 0.6); g.addColorStop(0, 'rgba(90,70,255,.22)'); g.addColorStop(1, 'rgba(90,70,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, Wd, Hd);
      /* playfield inside the rails */
      const topHalf = 1 * G.dx + 0.85 * G.dx, botHalf = (rows + 1) / 2 * G.dx + 0.42 * G.dx;
      const ty = G.y0 - 0.75 * G.dy, by = G.pockY + G.pockH + 2;
      x.beginPath(); x.moveTo(G.cx - topHalf, ty); x.lineTo(G.cx + topHalf, ty); x.lineTo(G.cx + botHalf, G.yLast + 0.2 * G.dy); x.lineTo(G.cx + botHalf, by); x.lineTo(G.cx - botHalf, by); x.lineTo(G.cx - botHalf, G.yLast + 0.2 * G.dy); x.closePath();
      g = x.createLinearGradient(0, ty, 0, by); g.addColorStop(0, 'rgba(60,45,170,.34)'); g.addColorStop(1, 'rgba(18,12,70,.5)');
      x.fillStyle = g; x.fill();
      for (const sgn of [-1, 1]) {
        const rail = () => { x.beginPath(); x.moveTo(G.cx + sgn * topHalf, ty - 3); x.lineTo(G.cx + sgn * botHalf, G.yLast + 0.2 * G.dy); x.lineTo(G.cx + sgn * botHalf, by); };
        x.lineCap = 'round'; x.lineJoin = 'round';
        rail(); x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 6; x.stroke();
        rail(); g = x.createLinearGradient(0, ty, 0, by); g.addColorStop(0, '#f4f6ff'); g.addColorStop(0.4, '#8f98c6'); g.addColorStop(0.7, '#dfe4ff'); g.addColorStop(1, '#565d8e'); x.strokeStyle = g; x.lineWidth = 3.4; x.stroke();
        rail(); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 0.9; x.stroke();
      }
      /* nozzle under the LCD */
      const nw = Math.max(G.br * 3.2, G.dx * 0.7), nh = Math.min(10, G.dy * 0.4);
      g = x.createLinearGradient(G.cx - nw, 0, G.cx + nw, 0); g.addColorStop(0, '#50567f'); g.addColorStop(0.35, '#f2f4ff'); g.addColorStop(0.65, '#9aa2cc'); g.addColorStop(1, '#3d4270');
      x.fillStyle = g; x.beginPath(); x.moveTo(G.cx - nw, G.nozY - 6); x.lineTo(G.cx + nw, G.nozY - 6); x.lineTo(G.cx + nw * 0.62, G.nozY + nh); x.lineTo(G.cx - nw * 0.62, G.nozY + nh); x.closePath(); x.fill();
      x.fillStyle = '#05030f'; x.beginPath(); x.ellipse(G.cx, G.nozY + nh, nw * 0.5, 2.4, 0, 0, TAU); x.fill();
      /* tulip chutes and labels */
      for (const sgn of [-1, 1]) {
        const cx = sgn < 0 ? G.tx : Wd - G.tx, cw = G.tR * 0.62;
        g = x.createLinearGradient(cx - cw, 0, cx + cw, 0); g.addColorStop(0, '#454a78'); g.addColorStop(0.4, '#eef1ff'); g.addColorStop(1, '#3d4270');
        x.fillStyle = g; rr(x, cx - cw, G.chY, cw * 2, 9, 3); x.fill();
        x.fillStyle = '#05030f'; x.beginPath(); x.ellipse(cx, G.chY + 9, cw * 0.72, 2, 0, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(255,225,74,.16)'; x.lineWidth = 1; x.setLineDash([2, 5]); x.beginPath(); x.moveTo(cx, G.chY + 13); x.lineTo(cx, G.ty - G.tR * 0.9); x.stroke(); x.setLineDash([]);
        x.fillStyle = 'rgba(255,225,74,.75)'; x.font = '700 ' + clamp(G.tR * 0.42, 7.5, 12) + 'px ' + NUMFONT; x.textAlign = 'center'; x.textBaseline = 'top';
        x.fillText('TULIP', cx, G.ty + G.tR * 1.12);
      }
      /* edge prize signs in the side wings */
      {
        const yS = G.ty + (G.yLast - G.ty) * 0.52, railX = topHalf + (botHalf - topHalf) * clamp((yS - ty) / (G.yLast + 0.2 * G.dy - ty), 0, 1);
        const wing = G.cx - railX - G.pad - 8, fsz = clamp(wing * 0.42, 9, 30);
        if (wing > 26) for (const sgn of [-1, 1]) {
          const X = G.cx + sgn * (railX + (G.cx - railX - G.pad) / 2 + 2);
          x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillStyle = 'rgba(47,240,255,.8)'; x.font = '700 ' + clamp(fsz * 0.42, 7, 11) + 'px ' + NUMFONT; x.fillText('EDGE', X, yS - fsz * 0.85);
          x.font = '400 ' + fsz + 'px "Dela Gothic One","Bowlby One","Arial Black",Impact,sans-serif';
          const txt = fmtM(table[0]) + '×', tw = x.measureText(txt).width; if (tw > wing) x.font = '400 ' + (fsz * wing / tw) + 'px "Dela Gothic One","Bowlby One","Arial Black",Impact,sans-serif';
          x.shadowColor = 'rgba(255,46,136,.9)'; x.shadowBlur = 10; x.fillStyle = '#ffe14a'; x.fillText(txt, X, yS); x.shadowBlur = 0;
          x.strokeStyle = 'rgba(255,46,136,.85)'; x.lineWidth = 2; x.lineCap = 'round'; x.lineJoin = 'round';
          for (let a = 0; a < 3; a++) { const yy = yS + fsz * 0.75 + a * fsz * 0.34, ww = fsz * 0.3; x.globalAlpha = 1 - a * 0.28; x.beginPath(); x.moveTo(X - ww, yy); x.lineTo(X, yy + ww * 0.7); x.lineTo(X + ww, yy); x.stroke(); }
          x.globalAlpha = 1;
        }
      }
      /* pins */
      for (let r = 0; r < rows; r++) for (let i = 0; i < r + 3; i++) {
        if (r === G.gr && i === G.gj + 1) continue;
        const X = pegX(r, i), Y = pegY(r), p = G.pr;
        x.fillStyle = 'rgba(47,240,255,.13)'; x.beginPath(); x.arc(X, Y, p * 2.3, 0, TAU); x.fill();
        g = x.createRadialGradient(X - p * 0.35, Y - p * 0.4, 0.2, X, Y, p); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#cfd6ff'); g.addColorStop(1, '#5a628f');
        x.fillStyle = g; x.beginPath(); x.arc(X, Y, p, 0, TAU); x.fill();
      }
      /* START gate (replaces the centre pin of the middle row) */
      const gr = Math.max(G.pr * 2.3, G.dx * 0.27);
      G.gateR = gr;
      x.fillStyle = 'rgba(255,225,74,.16)'; x.beginPath(); x.arc(G.gx, G.gy, gr * 1.9, 0, TAU); x.fill();
      g = x.createRadialGradient(G.gx - gr * 0.3, G.gy - gr * 0.4, 0.5, G.gx, G.gy, gr); g.addColorStop(0, '#fff8c0'); g.addColorStop(0.5, '#ffd21f'); g.addColorStop(1, '#b85b00');
      x.fillStyle = g; x.beginPath(); x.arc(G.gx, G.gy, gr, 0, TAU); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.arc(G.gx, G.gy, gr, 0, TAU); x.stroke();
      x.fillStyle = '#3a1500'; x.font = '900 ' + gr * 1.25 + 'px ' + NUMFONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('S', G.gx, G.gy + gr * 0.08);
      if (G.dy > 26) { x.fillStyle = 'rgba(255,225,74,.9)'; x.font = '700 ' + clamp(G.dx * 0.2, 7, 10) + 'px ' + NUMFONT; x.textBaseline = 'top'; x.fillText('START', G.gx, G.gy + gr + 2); }
      /* dim bulbs */
      for (let i = 0; i < G.nLed; i++) { x.fillStyle = ['#5a1238', '#0e4a5c', '#5c4c10'][i % 3]; x.beginPath(); x.arc(G.leds[i * 2], G.leds[i * 2 + 1], G.ledR, 0, TAU); x.fill(); }
    }

    /* ================= balls ================= */
    function alloc() { if (!nFree) return -1; const i = free[--nFree]; act[nAct++] = i; if (nAct > perf.peak) perf.peak = nAct; return i; }
    function spawn(bits, flags, win, stake, ticks, obj, idx, t) {
      const i = alloc(); if (i < 0) return -1;
      const dir = (bits & 1) ? 1 : -1;
      bx0[i] = G.cx + (Math.random() - 0.5) * G.dx * 0.5; by0[i] = G.nozY + 3;
      bx1[i] = pegX(0, 1) + dir * (0.04 + 0.13 * Math.random()) * G.dx; by1[i] = pegY(0) - G.pr - G.br;
      const D = by1[i] - by0[i]; bb[i] = D / 4;
      bT[i] = (150 + Math.sqrt(Math.max(1, D)) * 9) * (0.92 + Math.random() * 0.16);
      bt0[i] = t + Math.random() * 22;
      bseg[i] = -1; bbits[i] = bits; bj[i] = 0; bflags[i] = flags; bwin[i] = win; bstake[i] = stake; bticks[i] = ticks; bobj[i] = obj; bidx[i] = idx;
      bpx[i] = bx0[i]; bpy[i] = by0[i];
      return i;
    }
    function spawnTulip(run, k, t) {
      const i = alloc(); if (i < 0) { landTulipDirect(run, k); return; }
      const side = run.balls[k].side, cx = side ? G.W - G.tx : G.tx;
      bx0[i] = cx + (Math.random() - 0.5) * G.tR * 0.5; by0[i] = G.chY + 10; bx1[i] = cx; by1[i] = G.ty - G.tR * 0.1;
      bb[i] = (by1[i] - by0[i]) / 4; bT[i] = 330 + Math.random() * 50; bt0[i] = t;
      bseg[i] = 100; bflags[i] = F_TULIP; bwin[i] = run.wins[k]; bstake[i] = run.stake; bobj[i] = run; bidx[i] = k;
      bpx[i] = bx0[i]; bpy[i] = by0[i];
    }
    function pegFlash(X, Y, t) { fxX[fHead] = X; fxY[fHead] = Y; fxT[fHead] = t; fHead = (fHead + 1) % NF; }
    function sparks(X, Y, n, col, pw) {
      if (reduce) n = Math.min(n, 3);
      for (let k = 0; k < n; k++) { const i = pHead; pHead = (pHead + 1) % NP; const a = -Math.PI * (0.1 + 0.8 * Math.random()), s = (60 + Math.random() * 190) * pw; px[i] = X; py[i] = Y; pvx[i] = Math.cos(a) * s; pvy[i] = Math.sin(a) * s; pl[i] = 0; pm[i] = 0.35 + Math.random() * 0.4; pc[i] = col; }
    }
    function pop(X, Y, text, col, size, life) {
      let p = null, old = null;
      for (const q of POPS) { if (!q.on) { p = q; break; } if (!old || q.t0 < old.t0) old = q; }
      p = p || old; p.on = true; p.x = clamp(X, 26, G.W - 26); p.y = Y; p.t0 = lastNow; p.text = text; p.col = col; p.size = size; p.life = life || 850;
    }
    function shake() { if (reduce) return; shakeT = lastNow; board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake'); }

    /* a ball finished a segment at time tEnd: bounce off the next pin, or land */
    function advance(i, tEnd) {
      const s = bseg[i];
      if (s === 100) { landTulip(i); return false; }
      const r = s + 1;
      if (r >= rows) { land(i, tEnd); return false; }
      const j = bj[i], X = pegX(r, j + 1), Y = pegY(r);
      pegFlash(X, Y, tEnd); sTing(r, tEnd);
      if (r === G.gr && j === G.gj && (bflags[i] & F_GATE)) gateHit(i, tEnd);
      const bit = (bbits[i] >>> r) & 1, j2 = j + bit;
      bj[i] = j2; bseg[i] = r;
      bx0[i] = bx1[i]; by0[i] = by1[i];
      if (r + 1 < rows) {
        const nd = ((bbits[i] >>> (r + 1)) & 1) ? 1 : -1;
        bx1[i] = pegX(r + 1, j2 + 1) + nd * (0.04 + 0.13 * Math.random()) * G.dx; by1[i] = pegY(r + 1) - G.pr - G.br;
        bb[i] = G.dy * (0.2 + 0.24 * Math.random()); bT[i] = G.seg * (0.87 + 0.26 * Math.random());
      } else {
        bx1[i] = pockX(j2) + (Math.random() - 0.5) * G.dx * 0.3; by1[i] = G.pockY + G.pockH * 0.3;
        bb[i] = G.dy * 0.24; bT[i] = G.seg * 1.12;
      }
      bt0[i] = tEnd;
      return true;
    }

    function gateHit(i, t) {
      gateGlow = t; sGate();
      sparks(G.gx, G.gy, 8, 2, 0.8);
      const o = bobj[i];
      if (bflags[i] & F_FEVER) {            // fever retrigger
        const b = o.balls[bidx[i]];
        if (b.add) { o.revealed += b.add; pop(G.gx, G.gy - G.dy, '+' + b.add + ' BALLS', '#fff06a', clamp(G.W * 0.045, 13, 22), 1100); Batty.sfx('ding'); paintFever(); }
      } else if (o) { bobj[i] = null; queueSpin(o); }
    }

    function recordResult(x, ticksX, flags, win, stake) {
      if (lastRes.length >= 14) lastRes.pop();
      lastRes.unshift({ x: ticksX, tier: tierOf(x), gold: !!(flags & F_GOLD), fever: !!(flags & F_FEVER) });
      lastDirty = true;
      if (ticksX > SESSION.bestX) { SESSION.bestX = ticksX; SESSION.bestBB = win; }
    }

    function land(i, t) {
      const k = bj[i], fl = bflags[i], win = bwin[i], stake = bstake[i], xPaid = bticks[i] / M.TICK, xP = table[k];
      const X = pockX(k), Y = G.pockY;
      pockT[k] = t; pockC[k] = (fl & F_GOLD) ? 1 : (fl & F_FEVER) ? 2 : 0;
      inFlight -= win; SESSION.won += win;
      recordResult(xP, xPaid, fl, win, stake);
      sLand(xPaid, !!(fl & F_GOLD), t);
      if (fl & F_GOLD) { sparks(X, Y, 14, 2, 1.1); pop(X, Y - 6, 'GOLD ×5  +' + fmt(win), '#ffe14a', clamp(G.W * 0.04, 12, 20), 1200); }
      else if (fl & F_FEVER) { if (xPaid >= 1) sparks(X, Y, 4, 3, 0.8); if (xPaid >= 4) pop(X, Y - 6, '+' + fmt(win), '#ff9cc8', clamp(G.W * 0.036, 11, 18)); }
      else if (xPaid >= 2) { sparks(X, Y, xPaid >= 5 ? 10 : 4, 1, 0.9); pop(X, Y - 6, fmtM(xP) + '×', xPaid >= 10 ? '#ffb347' : '#fff06a', clamp(G.W * (xPaid >= 10 ? 0.05 : 0.036), 11, 24)); }
      else if (xPaid >= 1) sparks(X, Y, 2, 1, 0.6);
      if (xPaid >= 25) {
        shake(); sparks(X, Y, 30, 3, 1.4);
        const rc = board.getBoundingClientRect();
        Batty.fx.burst({ x: rc.left + X, y: rc.top + Y, count: xPaid >= 100 ? 46 : 22, kind: 'coin', power: 0.9 });
      }
      if (fl & F_FEVER) {
        const f = bobj[i]; f.landed++; f.total += win; paintFever();
        if (f.landed === f.balls.length) endFever(f);
      } else if (xPaid >= 100) {
        say(fmtM(xPaid) + '× HIT', '+' + fmt(win) + ' BB', 'hit', 2200);
        queueCelebrate(win, stake, xPaid >= 1000);
      }
      release(i);
    }
    function landTulip(i) {
      const run = bobj[i], k = bidx[i], win = bwin[i], side = run.balls[k].side, X = side ? G.W - G.tx : G.tx;
      sparks(X, G.ty, 10, 2, 0.9);
      pop(X, G.ty - G.tR * 1.2, run.balls[k].x + '×', '#fff06a', clamp(G.W * 0.05, 14, 24), 1000);
      A.tone({ f: 1319 + run.balls[k].x * 90, d: 0.1, type: 'triangle', v: 0.09 }); A.tone({ f: 1976, d: 0.16, type: 'sine', v: 0.06, t: 0.05 });
      release(i);
      tulipCredit(run, k, win);
    }
    function landTulipDirect(run, k) { tulipCredit(run, k, run.wins[k]); }
    function tulipCredit(run, k, win) {
      inFlight -= win; SESSION.won += win; run.landed++; run.total += win;
      recordResult(run.balls[k].x, run.balls[k].x, 0, win, run.stake);
      if (run.landed === run.balls.length) {
        tulipRuns--; if (!tulipRuns) tulipTarget = 0;
        setFoot('TULIPS PAID +' + fmt(run.total) + ' BB', 'y', 2600);
        Batty.sfx('coin');
        if (run.total >= run.stake * 25) queueCelebrate(run.total, run.stake, false);
      }
    }
    function release(i) {
      bobj[i] = null;
      for (let a = 0; a < nAct; a++) if (act[a] === i) { act[a] = act[--nAct]; break; }
      free[nFree++] = i;
    }

    /* ================= firing ================= */
    function fire() {
      if (celebrating || !S || S.dead || !G.ok) return 0;
      const stake = M.STAKES[stakeI], now = performance.now();
      if (W.balance - inFlight < stake || nFree - netQ.length < 4) {
        if (busy()) return -1;                       // wait for what is still in the air to land
        stopStream();
        if (now - lastBroke > 1200) { lastBroke = now; Batty.ui.broke(); }
        return 0;
      }
      if (W.shown < stake) W.sync();                 // tray has to top the visible balance up early
      if (!W.bet(ID, stake)) { stopStream(); if (now - lastBroke > 1200) { lastBroke = now; Batty.ui.broke(); } return 0; }
      SESSION.balls++; SESSION.staked += stake;
      if (Batty.online) { netQ.push(stake); netFlush(); heat = Math.min(1, heat + 0.07); return 1; }
      const o = M.drop(Batty.rng, rows, risk, dev ? forceNext : null);
      forceNext = null;
      launch(o, stake, now);
      return 1;
    }
    /* Online: send the waiting balls in one request (same stake together), then launch what the server decided. */
    async function netFlush() {
      if (netBusy || !netQ.length) return;
      const stake = netQ[0]; let n = 0;
      while (n < netQ.length && n < 30 && netQ[n] === stake) n++;
      netQ.splice(0, n); netBusy = true;
      const r = await Batty.play(ID, 'drop', { stake, rows, risk, n }, stake * n);
      netBusy = false;
      if (!S || S.dead) return;
      if (!r) {
        stopStream();
        let back = 0; for (const s of netQ) back += s; netQ.length = 0; if (back) W.unbet(back);
        return;
      }
      if (r.n < n) { SESSION.balls -= n - r.n; SESSION.staked -= (n - r.n) * stake; }
      const now = performance.now();
      r.balls.forEach((o, k) => launch(o, stake, now + k * 0.01));
      netFlush();
    }
    function launch(o, stake, now) {
      const total = M.settle(o, stake), win = M.pay(stake, o.ticks);
      if (total > 0) W.win(ID, total, { silent: true });
      inFlight += total;
      launches[lHead] = now; lHead = (lHead + 1) % 64;
      let item = null;
      if (o.gate) item = { reel: o.reel, feature: o.feature, stake, wins: o.feature ? o.feature.balls.map((b) => M.pay(stake, b.ticks)) : null };
      spawn(o.bits, (o.gold ? F_GOLD : 0) | (o.gate ? F_GATE : 0), win, stake, o.ticks, item, 0, now);
      sLaunch(now);
      if (o.gold) { A.tone({ f: 1976, d: 0.08, type: 'triangle', v: 0.06 }); A.tone({ f: 2637, d: 0.12, type: 'triangle', v: 0.06, t: 0.05 }); }
      if (!Batty.online) heat = Math.min(1, heat + 0.07);
    }
    function tap() {
      const r = fire();
      if (r === 1) { dropBtn.classList.remove('hit'); void dropBtn.offsetWidth; dropBtn.classList.add('hit'); }
      else if (r === -1) { A.tone({ f: 160, d: 0.05, type: 'square', v: 0.04 }); setFoot('WAITING FOR BALLS TO LAND', 'c', 900); }
    }
    function beginHold() { if (!streaming()) { streamT0 = performance.now(); acc = 0; } }
    function stopStream() {
      pointers.clear(); spaceDown = false;
      if (auto) { auto = false; paintAuto(); }
    }
    function toggleAuto() {
      if (celebrating) return;
      if (!auto) { beginHold(); auto = true; streamT0 = performance.now() - 140; Batty.sfx('click'); }
      else { auto = false; Batty.sfx('click'); }
      paintAuto();
    }
    function paintAuto() {
      autoBtn.classList.toggle('on', auto); autoBtn.setAttribute('aria-pressed', auto ? 'true' : 'false');
      autoBtn.firstChild.textContent = auto ? 'STOP' : 'AUTO'; autoBtn.lastChild.textContent = auto ? 'auto on' : 'stream';
    }

    dropBtn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      beginHold();
      pointers.add(e.pointerId);
      try { dropBtn.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
      tap();
    });
    const pUp = (e) => { pointers.delete(e.pointerId); };
    dropBtn.addEventListener('pointerup', pUp); dropBtn.addEventListener('pointercancel', pUp); dropBtn.addEventListener('lostpointercapture', pUp);
    dropBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    dropBtn.addEventListener('dragstart', (e) => e.preventDefault());
    dropBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); tap(); } });
    dropBtn.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    S.on(document, 'keydown', (e) => {
      if (e.code !== 'Space' || typing(e.target) || document.querySelector('.bc-veil')) return;
      e.preventDefault();
      if (e.repeat || spaceDown) return;
      beginHold(); spaceDown = true; dropBtn.classList.add('down'); tap();
    });
    S.on(document, 'keyup', (e) => { if (e.code !== 'Space') return; e.preventDefault(); spaceDown = false; dropBtn.classList.remove('down'); });
    S.on(window, 'blur', () => { stopStream(); dropBtn.classList.remove('down'); });
    S.on(document, 'visibilitychange', () => { if (document.hidden) { stopStream(); dropBtn.classList.remove('down'); } });

    function moveStake(d) {
      const n = clamp(stakeI + d, 0, M.STAKES.length - 1); if (n === stakeI) return;
      stakeI = SESSION.stakeI = n; Batty.sfx('chip'); paintStake();
    }
    function paintStake() {
      stakeOut.innerHTML = fmt(M.STAKES[stakeI]) + '<small>BB per ball</small>';
      stMinus.disabled = stakeI === 0; stPlus.disabled = stakeI === M.STAKES.length - 1;
    }
    function setConfig(r, k) {
      if (busy()) { Batty.ui.toast('Rows and risk unlock when the board is clear.'); return; }
      if (r === rows && k === risk) return;
      rows = SESSION.rows = r; risk = SESSION.risk = k; table = M.TABLES[rows][risk];
      segRows.set(rows); segRisk.set(risk); Batty.sfx('click');
      pockT.fill(-1e9); layout();
    }

    /* ================= LCD reels ================= */
    const reels = reelEls.map((r, i) => ({ el: r.strip, win: r.win, p: [2, 6, 4][i], mode: 0, v: 0, from: 0, dist: 0, t0: 0, dur: 1, wob: 0, cell: 0, shown: -1 }));
    const easeOut = (k) => 1 - Math.pow(1 - k, 3);
    const easeBack = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
    function reelSpin(i, v) { const r = reels[i]; r.mode = 1; r.v = v; r.wob = 0; r.win.classList.add('spin'); r.win.classList.remove('lock'); }
    function reelTo(i, idx, dur, back, minTravel) {
      const r = reels[i]; let dist = (((idx - r.p) % 9) + 9) % 9; if (dist < (minTravel || 0)) dist += 9;
      r.mode = 2; r.from = r.p; r.dist = dist; r.t0 = performance.now(); r.dur = dur; r.back = !!back; r.wob = 0; r.win.classList.remove('spin');
    }
    function reelNudge(i, delta, dur) { const r = reels[i]; r.mode = 2; r.from = r.p; r.dist = delta; r.t0 = performance.now(); r.dur = dur; r.back = true; r.wob = 0; }
    function reelsTick(dt, t) {
      for (const r of reels) {
        if (r.mode === 1) r.p += r.v * dt;
        else if (r.mode === 2) { const k = Math.min(1, (t - r.t0) / r.dur); r.p = r.from + r.dist * (r.back ? easeBack(k) : easeOut(k)); if (k >= 1) { r.mode = 0; r.p = ((r.p % 9) + 9) % 9; } }
        let q = ((r.p % 9) + 9) % 9;
        if (r.wob) q += Math.sin(t / 38) * r.wob;
        if (!r.cell) r.cell = r.win.clientHeight || 1;
        const y = Math.round(-q * r.cell * 100) / 100;
        if (y !== r.shown) { r.shown = y; r.el.style.transform = 'translate3d(0,' + y + 'px,0)'; }
      }
    }
    function setStat(t, cls) { lcdStat.textContent = t; lcdStat.className = 'g-plachinko-stat ' + (cls || ''); }
    let footT = 0;
    function setFoot(t, cls, ms) {
      if (fevers.length && cls !== 'f') return;
      lcdFoot.firstChild.textContent = t; lcdFoot.className = 'g-plachinko-foot ' + (cls || '');
      if (footT) S.clear(footT); footT = 0;
      if (ms) footT = S.timeout(() => { footT = 0; if (!fevers.length) { lcdFoot.firstChild.textContent = 'HIT START TO SPIN'; lcdFoot.className = 'g-plachinko-foot'; } }, ms);
    }
    function call(html, cls, ms) {
      lcdCall.innerHTML = html; lcdCall.className = 'g-plachinko-call on ' + (cls || '');
      S.timeout(() => { lcdCall.classList.remove('on'); }, ms);
    }
    let sayT = 0;
    function say(title, sub, cls, ms) {
      banner.innerHTML = ''; banner.append(h('b', null, title), sub ? h('span', null, sub) : null);
      banner.className = 'g-plachinko-banner on ' + (cls || '');
      if (sayT) S.clear(sayT);
      sayT = S.timeout(() => { banner.classList.remove('on'); sayT = 0; }, ms || 1800);
    }
    function paintLamps() {
      const n = reelQ.length;
      lamps.forEach((l, i) => l.classList.toggle('on', i < n));
      lampMore.textContent = n > 4 ? '+' + (n - 4) : '';
    }
    function queueSpin(item) { reelQ.push(item); paintLamps(); if (reelWake) { const w = reelWake; reelWake = null; w(); } }
    async function reelLoop() {
      for (;;) {
        if (!reelQ.length) { await new Promise((res) => { reelWake = res; }); continue; }
        reelBusy = true;
        const it = reelQ.shift(); paintLamps();
        await playSpin(it);
        reelBusy = false;
      }
    }
    async function playSpin(it) {
      const d = it.reel.d, kind = it.reel.kind, back = reelQ.length;
      if (kind === 'miss' && back >= 5) {              // far behind: condense plain misses to a flick
        for (let i = 0; i < 3; i++) { reels[i].mode = 0; reels[i].p = d[i] - 1; }
        lcd.classList.remove('flick'); void lcd.offsetWidth; lcd.classList.add('flick');
        await S.sleep(60); return;
      }
      const fast = back >= 2;
      setStat('SPIN', 'c');
      for (let i = 0; i < 3; i++) reelSpin(i, 26 + i * 3);
      if (!A.muted) A.noise({ d: fast ? 0.12 : 0.25, v: 0.035, lp: 900, f2: 3200 });
      await S.sleep(fast ? 120 : 300);
      reelTo(0, d[0] - 1, fast ? 90 : 160, true, 1); sReelStop(0); await S.sleep(fast ? 80 : 170);
      reelTo(2, d[2] - 1, fast ? 90 : 160, true, 1); sReelStop(1); await S.sleep(fast ? 80 : 170);
      if (d[0] === d[2]) await playReach(it, kind === 'reach' && back >= 4);
      else { reelTo(1, d[1] - 1, fast ? 90 : 160, true, 1); sReelStop(2); await S.sleep(fast ? 100 : 210); }
      if (kind === 'tulip') await startTulip(it);
      else if (kind === 'fever' || kind === 'batty') await startFever(it);
      else if (kind === 'miss') { setStat('READY'); await S.sleep(fast ? 20 : 150); }
    }
    async function playReach(it, quick) {
      const d = it.reel.d, v = d[0], c = d[1], hit = c === v;
      lcd.classList.add('reach'); setStat('REACH!', 'p');
      call('<i lang="ja">リーチ</i><b>REACH!</b>', 'p', quick ? 500 : 1000);
      sReach();
      reels[0].win.classList.add('lock'); reels[2].win.classList.add('lock');
      reelSpin(1, quick ? 14 : 9); reels[1].win.classList.remove('spin'); reels[1].win.classList.add('slow');
      const ticks = S.interval(() => { if (!A.muted) A.tone({ f: 1500, d: 0.02, type: 'square', v: 0.04 }); }, 110);
      await S.sleep(quick ? 260 : 900 + Math.random() * 400);
      if (hit) {
        reelTo(1, v - 1 - 0.46, 620, false, 2); await S.sleep(640);
        reels[1].wob = 0.05; await S.sleep(quick ? 150 : 420);
        reelNudge(1, 0.46, 130); await S.sleep(150);
      } else if (c === (v % 9) + 1) {                  // slips one past
        reelTo(1, v - 1, quick ? 300 : 640, false, 2); await S.sleep(quick ? 310 : 660);
        reels[1].wob = 0.045; await S.sleep(quick ? 120 : 380);
        reelNudge(1, 1, 190); await S.sleep(210);
      } else {                                         // stops one short
        reelTo(1, c - 1 + 0.44, quick ? 300 : 640, false, 2); await S.sleep(quick ? 310 : 660);
        reels[1].wob = 0.05; await S.sleep(quick ? 120 : 420);
        reelNudge(1, -0.44, 170); await S.sleep(190);
      }
      S.clear(ticks);
      reels[1].wob = 0; reels[1].win.classList.remove('spin', 'slow');
      lcd.classList.remove('reach'); reels[0].win.classList.remove('lock'); reels[2].win.classList.remove('lock');
      if (!hit) { sReelStop(2); A.tone({ f: 300, f2: 150, d: 0.22, type: 'sawtooth', v: 0.05 }); setStat('SO CLOSE', ''); await S.sleep(quick ? 120 : 420); setStat('READY'); }
      else { for (const r of reels) r.win.classList.add('lock'); }
    }

    /* ================= features ================= */
    function paintFever() {
      if (!fevers.length) return;
      let left = 0, total = 0;
      for (const f of fevers) { left += f.revealed - f.fired; total += f.total; }
      lcdFoot.firstChild.textContent = left + ' BALLS · ' + fmt(total) + ' BB';
      lcdFoot.className = 'g-plachinko-foot f';
    }
    async function startFever(it) {
      const ft = it.feature, big = ft.type === 'batty';
      const f = { type: ft.type, mult: ft.mult, balls: ft.balls, wins: it.wins, stake: it.stake, revealed: ft.base, fired: 0, landed: 0, total: 0 };
      setStat(big ? 'BATTY FEVER ×3' : 'FEVER ×2', 'p');
      lcd.classList.add('hitflash');
      root.classList.add('is-fever'); if (big) root.classList.add('is-batty');
      call(big ? '<i lang="ja">大当り</i><b>7 7 7</b>' : '<i lang="ja">フィーバー</i><b>FEVER!</b>', big ? 'y' : 'p', big ? 1900 : 1300);
      say(big ? 'BATTY FEVER' : 'FEVER', ft.base + ' free balls · pockets ×' + ft.mult, big ? 'batty' : 'fever', big ? 2100 : 1500);
      sFanfare(big); shake();
      const rc = board.getBoundingClientRect();
      Batty.fx.burst({ x: rc.left + G.cx, y: rc.top + G.lcdY + G.lcdH / 2, count: big ? 60 : 30, kind: 'spark', colors: ['#ff2e88', '#2ff0ff', '#fff06a', '#ffffff'], power: 1.1 });
      fevers.push(f); feverAcc = -(big ? 1.7 : 1.1) * 14;      // a beat for the fanfare before the balls pour
      paintFever();
      await S.sleep(big ? 1500 : 1000);
      lcd.classList.remove('hitflash');
      for (const r of reels) r.win.classList.remove('lock');
    }
    function endFever(f) {
      const k = fevers.indexOf(f); if (k >= 0) fevers.splice(k, 1);
      const big = f.type === 'batty';
      say((big ? 'BATTY FEVER' : 'FEVER') + ' TOTAL', '+' + fmt(f.total) + ' BB  ·  ' + Batty.fmtX(f.total / f.stake), big ? 'batty total' : 'fever total', 3000);
      Batty.sfx('win'); A.noise({ d: 0.5, v: 0.05, hp: 5000 });
      const rc = board.getBoundingClientRect();
      Batty.fx.burst({ x: rc.left + G.cx, y: rc.top + G.H * 0.45, count: 40, kind: 'coin', power: 1 });
      if (!fevers.length) {
        root.classList.remove('is-fever', 'is-batty'); setStat('READY');
        lcdFoot.firstChild.textContent = 'FEVER PAID +' + fmt(f.total) + ' BB'; lcdFoot.className = 'g-plachinko-foot y';
        footT = S.timeout(() => { footT = 0; if (!fevers.length) { lcdFoot.firstChild.textContent = 'HIT START TO SPIN'; lcdFoot.className = 'g-plachinko-foot'; } }, 3200);
      } else { root.classList.toggle('is-batty', fevers.some((q) => q.type === 'batty')); paintFever(); }
      queueCelebrate(f.total, f.stake, f.total >= f.stake * 500);
    }
    async function startTulip(it) {
      const run = { balls: it.feature.balls, wins: it.wins, stake: it.stake, landed: 0, total: 0 };
      tulipRuns++; tulipTarget = 1;
      setStat('TULIP TIME', 'y'); setFoot('TULIPS OPEN · 5 BONUS BALLS', 'y', 2400);
      call('<b>TULIP TIME</b>', 'y', 900);
      sBloom();
      for (let k = 0; k < run.balls.length; k++) S.timeout(() => spawnTulip(run, k, performance.now()), 420 + k * 170);
      await S.sleep(520);
      setStat('READY');
    }
    function queueCelebrate(amount, bet, huge) {
      if (amount < bet * 10) return;
      if (!pendingCel || amount / bet > pendingCel.amount / pendingCel.bet) pendingCel = { amount, bet, t: performance.now() };
      if (huge) stopStream();                         // truly huge: let the board clear and give it the full treatment
    }

    /* ================= frame ================= */
    function drawTulip(x, cx, open, t) {
      const R = G.tR, cy = G.ty;
      x.save(); x.translate(cx, cy); x.lineJoin = 'round';
      x.fillStyle = 'rgba(255,225,74,' + (0.05 + 0.2 * open + 0.05 * open * Math.sin(t / 90)) + ')'; x.beginPath(); x.arc(0, -R * 0.1, R * (1.25 + 0.35 * open), 0, TAU); x.fill();
      /* stem cup */
      x.fillStyle = '#17b86a'; x.fillRect(-R * 0.07, R * 0.5, R * 0.14, R * 0.45);
      /* back petal */
      x.fillStyle = '#c21868'; x.beginPath(); x.moveTo(-R * 0.36, R * 0.3); x.quadraticCurveTo(-R * 0.46, -R * 0.45, 0, -R * 0.92); x.quadraticCurveTo(R * 0.46, -R * 0.45, R * 0.36, R * 0.3); x.closePath(); x.fill();
      if (open > 0.05) { x.fillStyle = 'rgba(5,3,15,' + 0.85 * open + ')'; x.beginPath(); x.ellipse(0, -R * 0.05, R * 0.34 * open + R * 0.08, R * 0.2, 0, 0, TAU); x.fill(); }
      for (const sgn of [-1, 1]) {
        x.save(); x.translate(sgn * R * 0.16, R * 0.55); x.rotate(sgn * (0.04 + open * 0.8));
        const g = x.createLinearGradient(0, -R * 1.3, 0, 0); g.addColorStop(0, '#ff9ac6'); g.addColorStop(0.5, '#ff3d95'); g.addColorStop(1, '#d81270');
        x.fillStyle = g; x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(-sgn * R * 0.16, 0); x.quadraticCurveTo(sgn * R * 0.85, -R * 0.2, sgn * R * 0.2, -R * 1.42); x.quadraticCurveTo(-sgn * R * 0.12, -R * 0.75, -sgn * R * 0.16, 0); x.closePath(); x.fill(); x.stroke();
        x.restore();
      }
      x.fillStyle = '#ffe14a'; x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.moveTo(-R * 0.42, R * 0.36); x.quadraticCurveTo(0, R * 1.0, R * 0.42, R * 0.36); x.quadraticCurveTo(0, R * 0.62, -R * 0.42, R * 0.36); x.closePath(); x.fill(); x.stroke();
      x.restore();
    }

    function frame(_dt, t) {
      const js0 = performance.now();
      const dtR = Math.min(0.1, Math.max(0, (t - lastNow) / 1000));
      if (perf.n < 1e7 && t > lastNow) { const ms = t - lastNow; perf.n++; perf.sumDt += ms; if (ms > perf.maxDt) perf.maxDt = ms; }
      lastNow = t;
      if (!G.ok) return;

      /* stream */
      const on = streaming();
      if (on) {
        const e = (t - streamT0 - 140) / 500;
        if (e >= 0) {
          acc += dtR * (7 + 6 * Math.min(1, e));
          let guard = 0;
          while (acc >= 1 && guard++ < 4) { acc -= 1; const r = fire(); if (r !== 1) { acc = 0; break; } }
          if (acc > 2) acc = 2;
        }
      }
      /* fever balls */
      if (fevers.length) {
        feverAcc += dtR * 14;
        while (feverAcc >= 1) {
          feverAcc -= 1;
          let f = null; for (const q of fevers) if (q.fired < q.revealed) { f = q; break; }
          if (!f) { feverAcc = 0; break; }
          const k = f.fired, b = f.balls[k];
          if (spawn(b.bits, F_FEVER | (f.type === 'batty' ? F_BATTY : 0) | (b.gold ? F_GOLD : 0) | (b.gate ? F_GATE : 0), f.wins[k], f.stake, b.ticks, f, k, t) < 0) { feverAcc = 0; break; }
          f.fired++; sLaunch(t);
        }
        paintFeverThrottle(t);
      }
      heat = Math.max(0, heat - dtR * 0.5);
      feverGlow += ((fevers.length ? 1 : 0) - feverGlow) * Math.min(1, dtR * 5);
      tulipOpen += (tulipTarget - tulipOpen) * Math.min(1, dtR * 9);
      reelsTick(dtR, t);

      /* ---- draw ---- */
      const x = ctxL;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, G.W, G.H);
      if (feverGlow > 0.01) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 130);
        x.fillStyle = (root.classList.contains('is-batty') ? 'rgba(255,214,60,' : 'rgba(255,46,136,') + (0.07 + 0.07 * pulse) * feverGlow + ')';
        x.fillRect(0, 0, G.W, G.H);
      }
      /* LED chase: faster the faster you stream */
      const bps = bpsNow(t);
      ledPhase += dtR * (2.2 + bps * 1.6 + feverGlow * 16);
      const ph = Math.floor(ledPhase), L = G.leds, lr = G.ledR;
      for (let c = 0; c < 3; c++) {
        x.fillStyle = ['rgba(255,46,136,.28)', 'rgba(47,240,255,.26)', 'rgba(255,225,74,.26)'][c];
        x.beginPath();
        for (let i = c; i < G.nLed; i += 3) if ((((i - ph) % 9) + 9) % 9 < (feverGlow > 0.5 ? 6 : 3 + (bps > 6 ? 1 : 0))) { x.moveTo(L[i * 2] + lr * 2.6, L[i * 2 + 1]); x.arc(L[i * 2], L[i * 2 + 1], lr * 2.6, 0, TAU); }
        x.fill();
        x.fillStyle = ['#ff5aa5', '#7ff6ff', '#fff29a'][c];
        x.beginPath();
        for (let i = c; i < G.nLed; i += 3) if ((((i - ph) % 9) + 9) % 9 < (feverGlow > 0.5 ? 6 : 3 + (bps > 6 ? 1 : 0))) { x.moveTo(L[i * 2] + lr, L[i * 2 + 1]); x.arc(L[i * 2], L[i * 2 + 1], lr, 0, TAU); }
        x.fill();
      }
      /* pin flashes */
      for (let pass = 0; pass < 2; pass++) {
        x.fillStyle = pass ? 'rgba(255,255,255,.95)' : 'rgba(47,240,255,.3)';
        x.beginPath();
        for (let i = 0; i < NF; i++) { const age = t - fxT[i]; if (age < 0 || age > 170) continue; const rad = pass ? G.pr * 1.2 : G.pr * (1.7 + 1.5 * (1 - age / 170)); x.moveTo(fxX[i] + rad, fxY[i]); x.arc(fxX[i], fxY[i], rad, 0, TAU); }
        x.fill();
      }
      /* gate glow */
      const ga = t - gateGlow;
      { const idle = 0.5 + 0.5 * Math.sin(t / 320); const k = ga < 500 ? 1 - ga / 500 : 0;
        x.strokeStyle = 'rgba(255,225,74,' + (0.35 + 0.25 * idle + 0.4 * k) + ')'; x.lineWidth = 1.5 + 2.5 * k;
        x.beginPath(); x.arc(G.gx, G.gy, G.gateR * (1.45 + 0.12 * idle + 1.4 * k), 0, TAU); x.stroke(); }
      /* tulips */
      drawTulip(x, G.tx, tulipOpen, t); drawTulip(x, G.W - G.tx, tulipOpen, t);
      /* pockets */
      const pw = pockW, ph2 = G.pockH, left = G.cx - (rows + 1) / 2 * G.dx;
      for (let k = 0; k <= rows; k++) {
        const age = t - pockT[k], kick = age < 200 ? Math.sin(Math.PI * age / 200) * Math.min(5, ph2 * 0.2) : 0;
        x.drawImage(sprPock, k * pw * dpr, 0, pw * dpr, ph2 * dpr, left + k * pw, G.pockY + kick, pw, ph2);
        if (age < 260) { x.fillStyle = (pockC[k] === 1 ? 'rgba(255,225,74,' : pockC[k] === 2 ? 'rgba(255,90,165,' : 'rgba(255,255,255,') + 0.55 * (1 - age / 260) + ')'; x.fillRect(left + k * pw + 1, G.pockY + kick, pw - 2, ph2 - 1); }
      }
      /* balls: move, trail, blit */
      x.lineCap = 'round'; x.lineWidth = G.br * 1.15; x.strokeStyle = 'rgba(190,215,255,.26)';
      x.beginPath();
      for (let a = nAct - 1; a >= 0; a--) {
        const i = act[a];
        let u = (t - bt0[i]) / bT[i], alive = true;
        while (u >= 1) { if (!advance(i, bt0[i] + bT[i])) { alive = false; break; } u = (t - bt0[i]) / bT[i]; }
        if (!alive) continue;
        if (u < 0) u = 0;
        const D = by1[i] - by0[i], b4 = 4 * bb[i];
        const X = bx0[i] + (bx1[i] - bx0[i]) * u, Y = by0[i] + (D - b4) * u + b4 * u * u;
        x.moveTo(bpx[i], bpy[i]); x.lineTo(X, Y);
        bpx[i] = X; bpy[i] = Y;
      }
      x.stroke();
      for (let a = 0; a < nAct; a++) {
        const i = act[a], fl = bflags[i], sp = sprBall[(fl & F_GOLD) ? 1 : (fl & F_BATTY) ? 3 : (fl & F_FEVER) ? 2 : 0];
        x.drawImage(sp.c, bpx[i] - sp.half, bpy[i] - sp.half, sp.size, sp.size);
      }
      /* sparks */
      for (let c = 0; c < PCOL.length; c++) {
        let any = false;
        for (let i = 0; i < NP; i++) {
          if (pc[i] !== c || pl[i] >= pm[i]) continue;
          if (!any) { x.fillStyle = PCOL[c]; x.beginPath(); any = true; }
          pl[i] += dtR; pvy[i] += 520 * dtR; px[i] += pvx[i] * dtR; py[i] += pvy[i] * dtR;
          const s = 2.4 * (1 - pl[i] / pm[i]) + 0.6; x.rect(px[i] - s / 2, py[i] - s / 2, s, s);
        }
        if (any) x.fill();
      }
      /* pops */
      x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const p of POPS) {
        if (!p.on) continue;
        const k = (t - p.t0) / p.life; if (k >= 1) { p.on = false; continue; }
        const sc = k < 0.15 ? 0.6 + 0.6 * (k / 0.15) : 1.2 - 0.2 * Math.min(1, (k - 0.15) / 0.2);
        x.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        x.font = '700 ' + (p.size * sc) + 'px ' + NUMFONT;
        x.lineWidth = 3; x.strokeStyle = 'rgba(8,4,26,.85)'; x.strokeText(p.text, p.x, p.y - 26 * easeOut(Math.max(0, k)));
        x.fillStyle = p.col; x.fillText(p.text, p.x, p.y - 26 * easeOut(Math.max(0, k)));
      }
      x.globalAlpha = 1;

      /* ---- housekeeping ---- */
      if (!busy()) {
        if (dev && Math.abs(inFlight) > 1e-6) console.error('plachinko: inFlight should be 0 with a clear board, is ' + inFlight);
        inFlight = 0;
        if (W.shown !== W.balance) { const poured = W.balance - W.shown; W.sync(); if (poured > 0) { Batty.sfx('coin'); cTray.el.classList.remove('pour'); void cTray.el.offsetWidth; cTray.el.classList.add('pour'); } }
        if (pendingCel && !on && !celebrating) {
          const pcel = pendingCel; pendingCel = null;
          if (t - pcel.t < 12000) { celebrating = true; stopStream(); Batty.ui.celebrate({ amount: pcel.amount, bet: pcel.bet }).then(() => { celebrating = false; }); }
        }
      }
      if (t - lastUi > 100) { lastUi = t; paintUi(t, bps); }
      const js = performance.now() - js0; perf.sumJs += js; if (js > perf.maxJs) perf.maxJs = js;
    }
    let lastFeverPaint = 0;
    function paintFeverThrottle(t) { if (t - lastFeverPaint > 120) { lastFeverPaint = t; paintFever(); } }
    function bpsNow(t) { let n = 0; for (let i = 0; i < 64; i++) if (launches[i] > 0 && t - launches[i] < 1000) n++; return n; }

    let uiLock = null, uiHot = null, vTray = -1, vNet = null, vBalls = -1, vBps = -1, vBest = -1;
    function paintUi(t, bps) {
      const tray = Math.max(0, Math.round(W.balance - W.shown - inFlight));
      if (tray !== vTray) { vTray = tray; cTray.o.textContent = fmt(tray); cTray.el.classList.toggle('has', tray > 0); }
      const net = SESSION.won - SESSION.staked;
      if (net !== vNet) { vNet = net; cNet.o.textContent = (net > 0 ? '+' : net < 0 ? '−' : '') + fmt(Math.abs(net)); cNet.el.classList.toggle('up', net > 0); cNet.el.classList.toggle('down', net < 0); }
      if (SESSION.balls !== vBalls) { vBalls = SESSION.balls; cBalls.o.textContent = fmt(vBalls); }
      if (bps !== vBps) { vBps = bps; cBps.o.textContent = String(bps); cBps.el.style.setProperty('--heat', Math.min(1, bps / 13).toFixed(2)); }
      if (SESSION.bestX !== vBest) { vBest = SESSION.bestX; cBest.o.textContent = vBest ? Batty.fmtX(vBest) : '—'; cBest.el.title = vBest ? fmt(SESSION.bestBB) + ' BB' : ''; }
      const lock = busy();
      if (lock !== uiLock) { uiLock = lock; segRows.lock(lock); segRisk.lock(lock); cfg.classList.toggle('locked', lock); }
      const hot = streaming();
      if (hot !== uiHot) { uiHot = hot; dropBtn.classList.toggle('hot', hot); root.classList.toggle('is-stream', hot); }
      if (lastDirty) {
        lastDirty = false;
        for (let i = 0; i < chips.length; i++) {
          const r = lastRes[i], c = chips[i];
          if (!r) { c.textContent = ''; c.className = ''; continue; }
          c.textContent = fmtM(Math.round(r.x * 100) / 100); c.className = 't' + r.tier + (r.gold ? ' g' : '') + (r.fever ? ' f' : '');
        }
      }
    }

    /* ================= boot ================= */
    paintStake(); paintAuto(); paintLamps();
    const fitCab = () => {
      const r = root.getBoundingClientRect();
      if (window.innerWidth < 900 || r.height < 100) { root.style.removeProperty('--pk-cabw'); return; }
      const side = r.width >= 1100 ? 230 + 290 + 52 + 48 : 200 + 250 + 32 + 28;
      root.style.setProperty('--pk-cabw', Math.round(Math.max(340, Math.min((r.height - 30) * 0.83, r.width - side))) + 'px');
    };
    const ro = new ResizeObserver(() => layout());
    ro.observe(board);
    const ro2 = new ResizeObserver(fitCab);
    ro2.observe(root); fitCab();
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S && !S.dead && G.ok) { makeSprites(); drawStatic(); } });
    S.timeout(() => { if (G.ok) { makeSprites(); drawStatic(); } }, 1500);
    S.loop(frame);
    reelLoop();

    if (dev) {
      window.__plachinkoDev = {
        force(kind) { forceNext = kind === 'gold' ? { gold: true } : { gate: true, reel: kind }; },
        flood(n, ms) { const t0 = performance.now(); let k = 0; const id = S.interval(() => { const want = Math.min(n, Math.ceil((performance.now() - t0) / (ms || 1) * n)); while (k < want) { k++; fire(); } if (k >= n) S.clear(id); }, 8); },
        state() {
          return { active: nAct, peak: perf.peak, inFlight, tray: Math.max(0, W.balance - W.shown - inFlight), balls: SESSION.balls, staked: SESSION.staked, won: SESSION.won,
            balance: W.balance, shown: W.shown, reelQ: reelQ.length, reelBusy, fevers: fevers.length, tulipRuns, auto, streaming: streaming(), busy: busy(), rows, risk, stake: M.STAKES[stakeI] };
        },
        perfReset() { perf.n = 0; perf.sumDt = 0; perf.maxDt = 0; perf.sumJs = 0; perf.maxJs = 0; perf.peak = nAct; },
        perf() { return { frames: perf.n, avgFrameMs: perf.n ? perf.sumDt / perf.n : 0, maxFrameMs: perf.maxDt, avgJsMs: perf.n ? perf.sumJs / perf.n : 0, maxJsMs: perf.maxJs, peakBalls: perf.peak }; },
      };
    }

    return {
      destroy() {
        ro.disconnect(); ro2.disconnect();
        SESSION.won += inFlight; inFlight = 0;        // everything in the air was banked at launch
        if (netQ.length) { let back = 0; for (const s of netQ) back += s; netQ.length = 0; W.unbet(back); }
        root.classList.remove('is-fever', 'is-batty', 'is-stream');
        if (dev) delete window.__plachinkoDev;
      },
    };
  }

  /* ================= lobby poster ================= */
  function poster() {
    let pegs = '';
    for (let r = 0; r < 7; r++) for (let i = 0; i < r + 3; i++) pegs += '<circle cx="' + (160 + (i - (r + 2) / 2) * 30) + '" cy="' + (176 + r * 22) + '" r="2.6"/>';
    let leds = '';
    for (let i = 0; i < 40; i++) { const a = Math.PI + (i / 39) * Math.PI, cx = 160 + Math.cos(a) * 146, cy = 162 + Math.sin(a) * 146; leds += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.2" fill="' + ['#ff2e88', '#2ff0ff', '#ffe14a'][i % 3] + '"/>'; }
    for (let i = 0; i < 10; i++) { leds += '<circle cx="14" cy="' + (176 + i * 22) + '" r="3.2" fill="' + ['#2ff0ff', '#ffe14a', '#ff2e88'][i % 3] + '"/><circle cx="306" cy="' + (176 + i * 22) + '" r="3.2" fill="' + ['#ffe14a', '#ff2e88', '#2ff0ff'][i % 3] + '"/>'; }
    const ball = (x, y, r, g) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#plachinko-p-' + (g || 'ball') + ')"/><circle cx="' + (x - r * 0.35) + '" cy="' + (y - r * 0.4) + '" r="' + (r * 0.2) + '" fill="#fff"/>';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="plachinko-p-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1158"/><stop offset=".6" stop-color="#0c082c"/><stop offset="1" stop-color="#050314"/></linearGradient>' +
      '<radialGradient id="plachinko-p-glow" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="#ff2e88" stop-opacity=".55"/><stop offset="1" stop-color="#ff2e88" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="plachinko-p-ball" cx=".32" cy=".28" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#e4eaff"/><stop offset=".75" stop-color="#8e98c8"/><stop offset="1" stop-color="#343a6a"/></radialGradient>' +
      '<radialGradient id="plachinko-p-gold" cx=".32" cy=".28" r=".8"><stop offset="0" stop-color="#fffbe0"/><stop offset=".3" stop-color="#ffe066"/><stop offset=".75" stop-color="#f29a00"/><stop offset="1" stop-color="#7a3d00"/></radialGradient>' +
      '<linearGradient id="plachinko-p-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6ff"/><stop offset=".45" stop-color="#8f98c6"/><stop offset=".7" stop-color="#e6eaff"/><stop offset="1" stop-color="#4b5180"/></linearGradient>' +
      '<linearGradient id="plachinko-p-logo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff9c4"/><stop offset=".5" stop-color="#ffe14a"/><stop offset="1" stop-color="#ff8a1e"/></linearGradient>' +
      '<filter id="plachinko-p-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '</defs>' +
      '<rect width="320" height="400" fill="url(#plachinko-p-bg)"/><rect width="320" height="400" fill="url(#plachinko-p-glow)"/>' +
      '<path d="M8 400V162a152 152 0 01304 0v238z" fill="#0a0726" stroke="url(#plachinko-p-chrome)" stroke-width="5"/>' +
      '<path d="M26 400V164a134 134 0 01268 0v236z" fill="#130d44" stroke="#2ff0ff" stroke-opacity=".5" stroke-width="1.5"/>' +
      '<g filter="url(#plachinko-p-blur)" opacity=".7">' + leds + '</g><g>' + leds + '</g>' +
      '<g fill="#dfe5ff">' + pegs + '</g>' +
      '<g transform="translate(160 44)"><path transform="translate(-52 -8) scale(.87)" d="' + Batty.batPath + '" fill="#07051c" stroke="#ff2e88" stroke-width="2"/><circle cx="-4" cy="9" r="2" fill="#ffe14a"/><circle cx="4" cy="9" r="2" fill="#ffe14a"/></g>' +
      '<rect x="84" y="88" width="152" height="66" rx="9" fill="#04020e" stroke="url(#plachinko-p-chrome)" stroke-width="4"/>' +
      '<rect x="92" y="96" width="136" height="50" rx="5" fill="#0b0730" stroke="#ff2e88" stroke-opacity=".7"/>' +
      '<g font-family="\'Dela Gothic One\',\'Arial Black\',Impact,sans-serif" font-size="40" text-anchor="middle" fill="#ff2e88" stroke="#fff" stroke-width="1.2"><text x="116" y="136">7</text><text x="160" y="136">7</text><text x="204" y="136">7</text></g>' +
      ball(121, 190, 9) + ball(176, 214, 9) + ball(204, 238, 9, 'gold') + ball(100, 262, 9) + ball(160, 268, 9) + ball(232, 290, 9) + ball(72, 300, 9) + ball(143, 296, 9, 'gold') +
      '<g font-family="\'Dela Gothic One\',\'Arial Black\',Impact,sans-serif" text-anchor="middle">' +
      '<text x="160" y="356" font-size="43" textLength="292" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#ff2e88" stroke-width="9" stroke-linejoin="round" opacity=".9">PLACHINKO</text>' +
      '<text x="160" y="356" font-size="43" textLength="292" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#12093a" stroke-width="5" stroke-linejoin="round">PLACHINKO</text>' +
      '<text x="160" y="356" font-size="43" textLength="292" lengthAdjust="spacingAndGlyphs" fill="url(#plachinko-p-logo)">PLACHINKO</text>' +
      '</g>' +
      '<text x="160" y="384" text-anchor="middle" font-family="\'Chakra Petch\',\'Segoe UI\',sans-serif" font-weight="700" font-size="13" letter-spacing="4" fill="#2ff0ff">HOLD TO STREAM</text>' +
      '</svg>';
  }

  /* ================= rules ================= */
  function rules() {
    const T = (rows) => {
      let head = '<tr><th>Risk</th>', body = '';
      for (let k = 0; k <= rows / 2; k++) head += '<th>' + (k === 0 ? 'Edge' : k === rows / 2 ? 'Centre' : '') + '</th>';
      for (const risk of M.RISKS) { body += '<tr><td>' + M.RISK_NAMES[risk] + '</td>'; for (let k = 0; k <= rows / 2; k++) body += '<td>' + fmtM(M.TABLES[rows][risk][k]) + '×</td>'; body += '</tr>'; }
      return '<h3>' + rows + ' rows</h3><div class="g-plachinko-rt"><table>' + head + '</tr>' + body + '</table></div>';
    };
    const lo = Math.min.apply(null, M.ROWS.map((r) => Math.min.apply(null, M.RISKS.map((k) => M.theory(r, k).rtp))));
    const hi = Math.max.apply(null, M.ROWS.map((r) => Math.max.apply(null, M.RISKS.map((k) => M.theory(r, k).rtp))));
    return '<h3>Speed Plinko</h3>' +
      '<p>Every tap of DROP fires one ball at your stake. Hold the button (or the Space bar) and balls stream at up to 13 a second; AUTO streams without holding. Each ball bounces left or right off every row of pins and pays the multiplier of the pocket it lands in. The board mirrors, so the tables below read from an edge pocket to the centre.</p>' +
      '<p>Each ball is settled the moment it launches. Winnings show in the <b>tray</b> as balls land and pour into your balance when the board clears. If you leave mid-stream, every ball already fired is paid in full.</p>' +
      T(8) + T(12) + T(16) +
      '<h3>START gate and the reels</h3>' +
      '<p>The gold START gate replaces the centre pin of the middle row. A ball that strikes it drops in often enough that exactly 1 ball in 12 is a gate hit, whatever the row count. Each gate hit spins the three reels once (held spins queue on the HOLD lamps and the reels speed up to keep pace):</p>' +
      '<table><tr><th>Reels</th><th>Chance per spin</th><th>Result</th></tr>' +
      '<tr><td>7 7 7</td><td>0.2%</td><td><b>Batty Fever</b>: 40 free balls, every pocket ×3</td></tr>' +
      '<tr><td>Any other triple</td><td>2%</td><td><b>Fever</b>: 20 free balls, every pocket ×2</td></tr>' +
      '<tr><td>Three in a run (4 5 6)</td><td>6%</td><td><b>Tulip Time</b>: 5 bonus balls into the tulips</td></tr>' +
      '<tr><td>Outer reels match</td><td>22%</td><td>Reach: so close, pays nothing</td></tr>' +
      '<tr><td>Anything else</td><td>69.8%</td><td>Miss</td></tr></table>' +
      '<h3>Fever</h3>' +
      '<p>Fever balls are free and fall through the same board at the stake of the ball that triggered the fever. A fever ball that drops into the START gate adds 3 more balls, up to 5 times per fever (+15 balls). Fever balls do not spin the reels. You can keep dropping your own balls while a fever runs.</p>' +
      '<h3>Tulip Time</h3>' +
      '<p>The two tulips open and 5 bonus balls drop straight in. Each pays 1× (50%), 2× (30%), 3× (12%), 5× (6%) or 10× (2%) of the triggering stake.</p>' +
      '<h3>Golden ball</h3>' +
      '<p>1 ball in 50 is golden, paid or fever, and its pocket pays ×5 (on top of any fever multiplier).</p>' +
      '<h3>Small print</h3>' +
      '<ul><li>No single ball pays more than ' + fmt(M.CAP_X) + '× its stake.</li><li>Rows and risk can be changed when the board is clear. Stake can be changed at any time and applies to the next ball.</li><li>All multipliers are multiples of 0.05×, so every payout is a whole number of Batty Bucks at every stake.</li></ul>' +
      '<p class="rtp">Tested return: ' + (lo * 100).toFixed(2) + '% to ' + (hi * 100).toFixed(2) + '% depending on rows and risk (exact calculation), confirmed by 450,000,000 simulated balls across all nine combinations (simulated 95.83% to 96.20%).</p>';
  }

  Batty.registerGame({
    id: ID,
    name: 'Plachinko',
    tagline: 'Hold the button. Unleash the balls.',
    tag: 'Speed plinko',
    poster: poster(),
    rules,
    mount(root, B) { S = B.scope(); game = create(root); },
    unmount() { if (game) game.destroy(); game = null; if (S) S.dispose(); S = null; },
  });
})();
