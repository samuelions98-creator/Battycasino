/* ===== bonkers math ===== */
/* Bonkers Time — pure maths. No DOM. Shared verbatim by the browser game (practice mode), the Node simulation and
   the parity check; lib/games/bonkers.php is a line-for-line port. Every random decision takes rng() in [0,1). */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).bonkers = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- bet spots ---------- */
  const SPOTS = ['1', '2', '5', '10', 'flap', 'hunt', 'drop', 'bonkers'];
  const NUMBERS = { 1: 1, 2: 2, 5: 5, 10: 10 };
  const BONUSES = ['flap', 'hunt', 'drop', 'bonkers'];
  const isBonus = (s) => BONUSES.indexOf(s) > -1;
  const CAP = 20000;                 // no single spot's multiplier (bonus result x Top Slot) may exceed this
  const SPOT_MAX = 10000;            // BB per spot
  const TABLE_MAX = 50000;           // BB across the table per round

  /* ---------- the money wheel: 54 segments ----------
     1 x21, 2 x13, 5 x7, 10 x4, Coin Flap x4, Crypt Hunt x2, Drop Zone x2, BONKERS TIME x1.
     A bonus every sixth segment, five numbers between each pair. */
  const GAPS = [
    ['1', '2', '1', '5', '1'], ['2', '1', '10', '1', '2'], ['1', '5', '1', '2', '1'], ['2', '1', '5', '1', '2'], ['1', '10', '1', '2', '1'],
    ['2', '1', '5', '1', '2'], ['1', '2', '10', '2', '1'], ['5', '1', '2', '1', '5'], ['1', '10', '2', '5', '1'],
  ];
  const HEADS = ['bonkers', 'flap', 'drop', 'flap', 'hunt', 'flap', 'drop', 'flap', 'hunt'];
  const WHEEL = [];
  HEADS.forEach((b, i) => { WHEEL.push(b); GAPS[i].forEach((s) => WHEEL.push(s)); });
  const N = WHEEL.length; // 54
  const COUNT = {}; WHEEL.forEach((s) => { COUNT[s] = (COUNT[s] || 0) + 1; });

  /* ---------- weighted tables ---------- */
  const tbl = (values, weights) => { let total = 0; for (const w of weights) total += w; return { values, weights, total }; };
  function pick(t, rng) {
    let r = rng() * t.total;
    for (let i = 0; i < t.values.length; i++) { r -= t.weights[i]; if (r < 0) return t.values[i]; }
    return t.values[t.values.length - 1];
  }

  /* ---------- Top Slot ----------
     Left reel: a strip of 20 bet-spot symbols. Right reel: the multiplier, drawn from that spot's own table.
     Every round the Top Slot boosts exactly one spot. */
  const TS_STRIP = ['1', 'flap', '2', 'hunt', '5', 'drop', '1', 'bonkers', '2', 'flap', '10', 'hunt', '1', 'drop', '2', 'flap', '5', 'hunt', 'bonkers', 'drop'];
  const TS_MULTS = [2, 3, 4, 5, 7, 10, 15, 20, 25, 50];
  const TS = {
    1: tbl(TS_MULTS, [347, 184, 118, 84, 50, 29, 16, 10, 7, 2]),
    2: tbl(TS_MULTS, [360, 198, 130, 93, 57, 34, 18, 12, 9, 3]),
    5: tbl(TS_MULTS, [316, 157, 97, 67, 38, 21, 11, 6, 4, 1]),
    10: tbl(TS_MULTS, [430, 253, 177, 134, 88, 56, 34, 24, 18, 8]),
    flap: tbl(TS_MULTS, [272, 129, 76, 50, 27, 14, 6, 4, 2, 1]),
    hunt: tbl(TS_MULTS, [277, 129, 76, 50, 27, 14, 6, 4, 2, 1]),
    drop: tbl(TS_MULTS, [274, 129, 76, 50, 27, 14, 6, 4, 2, 1]),
    bonkers: tbl(TS_MULTS, [309, 130, 76, 50, 27, 14, 6, 4, 2, 1]),
  };
  function drawTop(rng) {
    const stop = Math.floor(rng() * TS_STRIP.length), spot = TS_STRIP[stop];
    return { stop, spot, mult: pick(TS[spot], rng) };
  }

  /* ---------- Coin Flap: red and blue each get a multiplier, then the coin decides ---------- */
  const FLAP = tbl([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100], [605, 451, 366, 311, 272, 221, 188, 165, 140, 114, 97, 58, 35]);
  function playFlap(rng) {
    const red = pick(FLAP, rng), blue = pick(FLAP, rng), side = rng() < 0.5 ? 0 : 1;
    return { red, blue, side, x: side ? blue : red };
  }

  /* ---------- Crypt Hunt: a 12 x 9 wall of 108 targets, each hiding its own multiplier ----------
     The wall below is the FINAL arrangement (position -> multiplier). Players see the same values unordered before the
     shuffle, then pick blind; positions only leave the server after the picks lock. */
  const HUNT_COLS = 12, HUNT_ROWS = 9, HUNT_N = HUNT_COLS * HUNT_ROWS;
  const HUNT = tbl([5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 500], [1872, 1319, 910, 753, 597, 442, 351, 290, 215, 170, 112, 83, 54, 40, 16]);
  function playHunt(rng) {
    const wall = new Array(HUNT_N);
    for (let i = 0; i < HUNT_N; i++) wall[i] = pick(HUNT, rng);
    let best = 0; for (const v of wall) if (v > best) best = v;
    return { wall, best };
  }

  /* ---------- Drop Zone: 16 pockets, two of them DOUBLE ----------
     The host drops the puck from the top of the peg wall; it is equally likely to finish in any pocket. DOUBLE doubles
     every prize on the board and the puck is dropped again. After 5 doubles (32x) the DOUBLE pockets close. */
  const DROP_POCKETS = 16, DROP_DOUBLES = 2, DROP_MAX_DOUBLES = 5;
  const DROP = tbl([5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200, 500], [1531, 1034, 682, 425, 304, 234, 190, 136, 104, 65, 47, 21, 7]);
  function chooseDistinct(n, k, rng) {
    const a = []; for (let i = 0; i < n; i++) a.push(i);
    const out = [];
    for (let i = 0; i < k; i++) { const j = i + Math.floor(rng() * (n - i)); const t = a[i]; a[i] = a[j]; a[j] = t; out.push(a[i]); }
    return out;
  }
  function playDrop(rng) {
    const dbl = chooseDistinct(DROP_POCKETS, DROP_DOUBLES, rng);
    const board = new Array(DROP_POCKETS);
    for (let i = 0; i < DROP_POCKETS; i++) board[i] = dbl.indexOf(i) > -1 ? 0 : pick(DROP, rng); // 0 = DOUBLE
    const prizes = []; for (let i = 0; i < DROP_POCKETS; i++) if (board[i]) prizes.push(i);
    const drops = []; let doubles = 0;
    for (;;) {
      const closed = doubles >= DROP_MAX_DOUBLES;
      const p = closed ? prizes[Math.floor(rng() * prizes.length)] : Math.floor(rng() * DROP_POCKETS);
      drops.push(p);
      if (board[p]) break;
      doubles++;
    }
    const last = drops[drops.length - 1];
    return { board, drops, doubles, x: board[last] * Math.pow(2, doubles) };
  }

  /* ---------- BONKERS TIME: the giant wheel, 64 segments, three flappers ----------
     Every player backs one flapper (green, blue or yellow). A flapper on a number banks it (times its doubles); a flapper on
     DOUBLE or TRIPLE multiplies its own pending factor and rides the next spin. After 5 re-spins DOUBLE and TRIPLE switch
     off and the last spin lands every live flapper on a number. */
  const BIG_VALUES = [10, 15, 20, 25, 50, 75, 100, 150, 200, 500];
  const BIG_COUNTS = [17, 13, 10, 7, 6, 2, 2, 1, 1, 1];
  const BIG = (function () {
    /* a fixed, hand-spread layout: big prizes kept apart, D/T a quarter-turn from each other */
    const pool = [];
    BIG_VALUES.forEach((v, i) => { for (let k = 0; k < BIG_COUNTS[i]; k++) pool.push(v); });
    const order = [500, 10, 25, 15, 50, 10, 20, 15, 10, 100, 20, 10, 25, 15, 75, 10, 20, 15, 50, 10, 25, 20, 15, 200, 10, 15, 20, 50, 10, 25, 15, 10, 150, 15, 10, 15, 50, 25, 10, 20, 15, 75, 10, 25, 20, 10, 100, 15, 10, 50, 20, 15, 10, 25, 20, 10, 50, 15, 20, 10];
    const out = order.slice();
    /* specials: 'D' doubles, 'T' triples */
    out.splice(8, 0, 'D'); out.splice(24, 0, 'T'); out.splice(40, 0, 'D'); out.splice(56, 0, 'D');
    return { segs: out, pool };
  })();
  const BIG_N = 64;
  const FLAPPERS = [-16, 0, 16];           // green on the left, blue on top, yellow on the right (in segments)
  const BIG_MAX_RESPINS = 5;
  const bigAt = (r, k) => BIG.segs[((r + FLAPPERS[k]) % BIG_N + BIG_N) % BIG_N];
  function playBonkers(rng) {
    const fac = [1, 1, 1], res = [0, 0, 0], live = [true, true, true];
    const spins = [];
    for (let n = 0; ; n++) {
      let r;
      if (n >= BIG_MAX_RESPINS) {
        /* D and T are off: re-draw until every live flapper sits on a number */
        do { r = Math.floor(rng() * BIG_N); } while ([0, 1, 2].some((k) => live[k] && typeof bigAt(r, k) !== 'number'));
      } else r = Math.floor(rng() * BIG_N);
      const hit = [];
      for (let k = 0; k < 3; k++) {
        if (!live[k]) { hit.push(null); continue; }
        const s = bigAt(r, k);
        hit.push(s);
        if (typeof s === 'number') { res[k] = s * fac[k]; live[k] = false; }
        else fac[k] *= s === 'D' ? 2 : 3;
      }
      spins.push({ r, hit, fac: fac.slice() });
      if (!live[0] && !live[1] && !live[2]) break;
    }
    return { spins, res, x: Math.max(res[0], res[1], res[2]) };
  }

  /* ---------- a whole round ---------- */
  function drawRound(rng) {
    const ts = drawTop(rng);
    const seg = Math.floor(rng() * N), spot = WHEEL[seg];
    const o = { seg, spot, ts };
    if (spot === 'flap') o.flap = playFlap(rng);
    else if (spot === 'hunt') o.hunt = playHunt(rng);
    else if (spot === 'drop') o.drop = playDrop(rng);
    else if (spot === 'bonkers') o.bonkers = playBonkers(rng);
    return o;
  }
  /* The raw result on the winning spot before the Top Slot: face value for a number, the bonus multiplier otherwise.
     picks: {hunt: target 0..107, flapper: 0..2} — only Crypt Hunt and BONKERS TIME use them. */
  function baseX(o, picks) {
    const s = o.spot;
    if (NUMBERS[s]) return NUMBERS[s];
    if (s === 'flap') return o.flap.x;
    if (s === 'drop') return o.drop.x;
    if (s === 'hunt') return o.hunt.wall[picks && picks.hunt != null ? picks.hunt : 0];
    return o.bonkers.res[picks && picks.flapper != null ? picks.flapper : 1];
  }
  /* The multiplier paid on the winning spot (Top Slot applied, capped). The chip comes back on top. */
  function spotX(o, picks) {
    const b = baseX(o, picks), m = o.ts.spot === o.spot ? o.ts.mult : 1;
    return Math.min(CAP, b * m);
  }
  /* bets: {spot: BB}. Returns {total, x, staked, won (bet on the winning spot)} */
  function settle(bets, o, picks) {
    const b = bets[o.spot] || 0;
    let staked = 0; for (const k in bets) staked += bets[k];
    const x = spotX(o, picks);
    return { total: b > 0 ? Math.floor(b * (1 + x)) : 0, x, staked, on: b };
  }
  function validBets(bets) {
    if (!bets || typeof bets !== 'object') return 'Bad bets';
    let total = 0, n = 0;
    for (const k in bets) {
      if (SPOTS.indexOf(k) < 0) return 'Unknown bet spot';
      const v = bets[k];
      if (!Number.isInteger(v) || v <= 0 || v % 10) return 'Bad chip amount';
      if (v > SPOT_MAX) return 'That spot is at its limit';
      total += v; n++;
    }
    if (total > TABLE_MAX) return 'The table limit is ' + TABLE_MAX + ' BB';
    return '';
  }

  /* ---------- the live show's running order (seconds) ----------
     Every round's timetable follows from its outcome alone, so the server can fix it the moment the round is drawn. */
  const TIME = { BET: 15, SPIN_AT: 0.4, SPIN: 9, TS_LEFT: 2.6, TS_RIGHT: 3.4, NUM_PAY: 1.2, NUM_END: 7, BONUS_IN: 5.5, BOARD: 6 };
  function plan(o, open) {
    const close = open + TIME.BET, spinAt = close + TIME.SPIN_AT, result = spinAt + TIME.SPIN;
    const p = { open, close, tsLeft: close + TIME.TS_LEFT, tsRight: close + TIME.TS_RIGHT, spinAt, result };
    if (!isBonus(o.spot)) { p.pay = result + TIME.NUM_PAY; p.end = result + TIME.NUM_END; return p; }
    const B = result + TIME.BONUS_IN; let E;
    p.bonus = B;
    if (o.spot === 'flap') { p.flip = B + 4.5; p.land = B + 7.7; E = B + 10.5; }
    else if (o.spot === 'hunt') { p.cover = B + 3; p.shuffle = B + 4.2; p.aim = B + 7.5; p.lock = B + 17.5; p.fire = B + 18.1; E = B + 25; }
    else if (o.spot === 'drop') {
      p.drops = []; p.lands = []; let t = B + 3;
      for (let i = 0; i < o.drop.drops.length; i++) { p.drops.push(t); const l = t + 5.2; p.lands.push(l); t = l + 2.4; }
      E = p.lands[p.lands.length - 1] + 3.5;
    } else {
      p.pick = B + 4.5; p.lock = B + 12.5; p.spins = []; p.stops = []; let t = p.lock + 0.5;
      for (let i = 0; i < o.bonkers.spins.length; i++) { p.spins.push(t); const s = t + 8; p.stops.push(s); t = s + 3; }
      E = p.stops[p.stops.length - 1] + 4.5;
    }
    p.pay = E; p.end = E + TIME.BOARD;
    return p;
  }

  return {
    TIME, plan,
    SPOTS, NUMBERS, BONUSES, isBonus, CAP, SPOT_MAX, TABLE_MAX, WHEEL, N, COUNT, tbl, pick,
    TS_STRIP, TS_MULTS, TS, drawTop, FLAP, playFlap, HUNT, HUNT_COLS, HUNT_ROWS, HUNT_N, playHunt,
    DROP, DROP_POCKETS, DROP_DOUBLES, DROP_MAX_DOUBLES, playDrop, chooseDistinct,
    BIG, BIG_N, BIG_VALUES, BIG_COUNTS, FLAPPERS, BIG_MAX_RESPINS, bigAt, playBonkers,
    drawRound, baseX, spotX, settle, validBets,
  };
});

/* ===== bonkers ===== */
/* Bonkers Time — the show. One studio, one money wheel, one clock for everybody.
   Everything you see is a pure function of the round's data and the time: the wheel's angle, the Top Slot reels, the coin's
   flight, the puck's path through the pegs, the giant wheel's spins. So two people watching the same round on two phones see
   the same thing at the same moment, and a page reloaded half-way through a bonus picks the show up exactly where it is.
   Online, the server's clock and the server's round are the script (lib/games/bonkers.php); in practice mode the same maths
   above draws the round locally and the very same director plays it. */
(function () {
  'use strict';
  const ID = 'bonkers', M = BattyMath.bonkers, B = Batty, h = B.h, fmt = B.fmt;
  const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TAU = Math.PI * 2, SEG = TAU / M.N, BSEG = TAU / M.BIG_N;
  const KEY = 'batty-bonkers-v1';
  const CHIPS = [10, 50, 100, 500, 1000, 5000];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t, p) => 1 - Math.pow(1 - clamp(t, 0, 1), p || 3);
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const mod = (a, n) => ((a % n) + n) % n;
  const wrapPi = (a) => mod(a + Math.PI, TAU) - Math.PI;
  const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  const abbr = (n) => (n >= 1e6 ? Math.round(n / 1e5) / 10 + 'M' : n >= 1000 ? Math.round(n / 100) / 10 + 'K' : String(n));
  const totalOf = (b) => { let t = 0; for (const k in b) t += b[k]; return t; };
  const clone = (o) => Object.assign({}, o || {});
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* a little generator seeded from round facts: every viewer gets the same "random" flourishes */
  function rngFor() { let a = 0x9E3779B9 | 0; for (let i = 0; i < arguments.length; i++) { a = Math.imul(a ^ (arguments[i] | 0), 0x85EBCA6B); a ^= a >>> 13; a = Math.imul(a, 0xC2B2AE35); a ^= a >>> 16; } return mulberry(a); }
  /* the wheel profile: a hard shove, then a long, slowing run (normalised: distance fraction at time fraction v) */
  function spinCurve(v, a, p) {
    a = a || 0.08; p = p || 3.1; v = clamp(v, 0, 1);
    const acc = p / (a * (1 - a) + 0.5 * p * a * a), d1 = 0.5 * acc * a * a;
    if (v < a) return 0.5 * acc * v * v;
    const s = (v - a) / (1 - a);
    return d1 + (1 - d1) * (1 - Math.pow(1 - s, p));
  }

  /* ============================== the spots ============================== */
  const SP = {
    1: { name: '1', pays: 'Pays 1 to 1', c1: '#3b97ff', c2: '#0b2f86', ink: '#ffffff' },
    2: { name: '2', pays: 'Pays 2 to 1', c1: '#ffd84a', c2: '#b06a00', ink: '#3a1d00' },
    5: { name: '5', pays: 'Pays 5 to 1', c1: '#ff58b9', c2: '#8d0a55', ink: '#ffffff' },
    10: { name: '10', pays: 'Pays 10 to 1', c1: '#b06cff', c2: '#3d0f8f', ink: '#ffffff' },
    flap: { name: 'Coin Flap', pays: 'Bonus game', c1: '#ff4057', c2: '#1d5cff', ink: '#ffffff' },
    hunt: { name: 'Crypt Hunt', pays: 'Bonus game', c1: '#3fe08a', c2: '#0b5a33', ink: '#05230f' },
    drop: { name: 'Drop Zone', pays: 'Bonus game', c1: '#22d8ff', c2: '#05507a', ink: '#02293b' },
    bonkers: { name: 'BONKERS TIME', pays: 'Bonus game', c1: '#ffd23a', c2: '#ff2d8a', ink: '#2a0a18' },
  };
  const NAME = (s) => SP[s].name;
  const FLAP_COL = ['#2fe07a', '#3a8bff', '#ffd23a'], FLAP_NAME = ['Green', 'Blue', 'Yellow'];

  /* ============================== art ============================== */
  const DEFS = '<svg class="bn-defs" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="bn-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#ffcf3f"/><stop offset="1" stop-color="#a86400"/></linearGradient>' +
    '<radialGradient id="bn-coinR" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ff98a4"/><stop offset=".55" stop-color="#e5132f"/><stop offset="1" stop-color="#70000f"/></radialGradient>' +
    '<radialGradient id="bn-coinB" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#9cc4ff"/><stop offset=".55" stop-color="#1650f0"/><stop offset="1" stop-color="#051a66"/></radialGradient>' +
    '<linearGradient id="bn-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa6b8"/><stop offset=".6" stop-color="#5d677a"/><stop offset="1" stop-color="#363d4c"/></linearGradient>' +
    '<radialGradient id="bn-puck" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e9fdff"/><stop offset=".5" stop-color="#22d8ff"/><stop offset="1" stop-color="#03496e"/></radialGradient>' +
    '<linearGradient id="bn-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2d8a"/><stop offset=".33" stop-color="#ffd23a"/><stop offset=".66" stop-color="#2fe07a"/><stop offset="1" stop-color="#3a8bff"/></linearGradient>' +
    '<radialGradient id="bn-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#7b5cc4"/><stop offset="1" stop-color="#2b1658"/></radialGradient>' +
    '<linearGradient id="bn-wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2c8c"/><stop offset="1" stop-color="#1a0b38"/></linearGradient>' +
    '<linearGradient id="bn-jacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fbf"/><stop offset=".5" stop-color="#d4127a"/><stop offset="1" stop-color="#7a0644"/></linearGradient>' +
    '</defs></svg>';
  const BATP = B.batPath;
  /* bet-spot badges (viewBox 0 0 100 100) */
  function icon(s) {
    if (s === 'flap') return '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="56" rx="40" ry="38" fill="#3a0010" opacity=".5"/><circle cx="50" cy="50" r="40" fill="url(#bn-gold)"/><path d="M50 14a36 36 0 0 0 0 72z" fill="url(#bn-coinR)"/><path d="M50 14a36 36 0 0 1 0 72z" fill="url(#bn-coinB)"/><circle cx="50" cy="50" r="36" fill="none" stroke="#fff3c0" stroke-width="2" stroke-dasharray="3 4"/><path d="' + BATP + '" transform="translate(26 40) scale(.4)" fill="#fff" opacity=".92"/></svg>';
    if (s === 'hunt') return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 92V44q0-30 28-30t28 30v48z" fill="url(#bn-stone)" stroke="#20252f" stroke-width="3"/><path d="M30 90V46q0-23 20-23" fill="none" stroke="#c9d2e0" stroke-width="3" opacity=".6"/><text x="50" y="58" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="17" fill="#1f2530">RIP</text><path d="' + BATP + '" transform="translate(32 66) scale(.3)" fill="#2fe07a"/><rect x="12" y="88" width="76" height="8" rx="3" fill="#1d6b3a"/></svg>';
    if (s === 'drop') return '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#bff6ff">' + [[20, 22], [50, 22], [80, 22], [35, 42], [65, 42], [20, 62], [80, 62]].map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5"/>').join('') + '</g><circle cx="50" cy="66" r="20" fill="url(#bn-puck)" stroke="#013a57" stroke-width="3"/><circle cx="50" cy="66" r="9" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/><path d="M14 92h72" stroke="#ffd23a" stroke-width="6" stroke-linecap="round"/></svg>';
    if (s === 'bonkers') {
      let w = ''; const cols = ['#ff2d8a', '#ffd23a', '#2fe07a', '#3a8bff', '#b06cff', '#ff8a1e', '#ff2d8a', '#ffd23a', '#2fe07a', '#3a8bff', '#b06cff', '#ff8a1e'];
      for (let i = 0; i < 12; i++) { const a0 = (i / 12) * TAU - Math.PI / 2, a1 = ((i + 1) / 12) * TAU - Math.PI / 2; w += '<path d="M50 52L' + (50 + 38 * Math.cos(a0)).toFixed(1) + ' ' + (52 + 38 * Math.sin(a0)).toFixed(1) + 'A38 38 0 0 1 ' + (50 + 38 * Math.cos(a1)).toFixed(1) + ' ' + (52 + 38 * Math.sin(a1)).toFixed(1) + 'Z" fill="' + cols[i] + '"/>'; }
      return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="52" r="44" fill="url(#bn-gold)"/>' + w + '<circle cx="50" cy="52" r="15" fill="#2a0a18" stroke="url(#bn-gold)" stroke-width="4"/><text x="50" y="59" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="19" fill="#ffd23a">!</text><path d="M50 2l7 14H43z" fill="#fff" stroke="#2a0a18" stroke-width="2"/></svg>';
    }
    const c = SP[s];
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="10" width="84" height="84" rx="20" fill="' + c.c2 + '"/><rect x="8" y="6" width="84" height="84" rx="20" fill="' + c.c1 + '"/><rect x="14" y="11" width="72" height="34" rx="14" fill="#fff" opacity=".22"/>' +
      '<text x="50" y="' + (s === '10' ? 66 : 70) + '" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="' + (s === '10' ? 46 : 58) + '" fill="' + c.ink + '" stroke="' + c.c2 + '" stroke-width="2" paint-order="stroke">' + s + '</text></svg>';
  }
  const badge = (s, cls) => '<span class="bn-badge s-' + s + (cls ? ' ' + cls : '') + '">' + icon(s) + '</span>';
  const CHIPCOL = { 10: ['#7fa3c8', '#294b6e'], 50: ['#ff4a4a', '#7a0d0d'], 100: ['#2fd27a', '#0b5a33'], 500: ['#b06cff', '#40128f'], 1000: ['#ffcf3f', '#8a5400'], 5000: ['#2a2a3a', '#ff4fb4'] };
  function chipSvg(v, label) {
    const c = CHIPCOL[v] || CHIPCOL[CHIPS.slice().reverse().find((x) => x <= v) || 10];
    let marks = ''; for (let i = 0; i < 6; i++) marks += '<rect x="46" y="4" width="8" height="14" rx="2" fill="#fff" transform="rotate(' + i * 60 + ' 50 50)"/>';
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="53" r="45" fill="rgba(0,0,0,.35)"/><circle cx="50" cy="50" r="45" fill="' + c[0] + '"/>' + marks +
      '<circle cx="50" cy="50" r="31" fill="' + c[1] + '" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/><text x="50" y="59" text-anchor="middle" font-family="\'Chakra Petch\',sans-serif" font-weight="700" font-size="' + ((label || abbr(v)).length > 3 ? 21 : 27) + '" fill="#fff">' + (label || abbr(v)) + '</text></svg>';
  }
  /* Bertie, the host: a bat in a sequinned jacket. Parts are classed so the sheet can make him talk, cheer and shove the wheel. */
  function hostSvg() {
    const wing = 'M72 120C52 98 28 86 8 94c8 10 6 22 14 30 8-4 16 2 18 12 8-4 18 4 18 14 6-4 14-4 18 2z';
    return '<svg class="bn-hostsvg" viewBox="0 0 200 250" aria-hidden="true">' +
      '<ellipse cx="100" cy="242" rx="56" ry="7" fill="rgba(0,0,0,.45)"/>' +
      '<g class="h-all">' +
      '<g class="h-wl">' + '<path d="' + wing + '" fill="url(#bn-wing)" stroke="#0d0420" stroke-width="2.5"/><path d="M70 122L22 124M70 126L40 136M70 132L58 150" stroke="#6b4cb0" stroke-width="2" opacity=".7"/></g>' +
      '<g class="h-wr"><g transform="translate(200 0) scale(-1 1)"><path d="' + wing + '" fill="url(#bn-wing)" stroke="#0d0420" stroke-width="2.5"/><path d="M70 122L22 124M70 126L40 136M70 132L58 150" stroke="#6b4cb0" stroke-width="2" opacity=".7"/></g>' +
      '<g class="h-mic"><rect x="150" y="108" width="9" height="34" rx="4" fill="#20202a" transform="rotate(18 154 125)"/><circle cx="160" cy="104" r="11" fill="#c8ccd8" stroke="#3a3a48" stroke-width="2.5"/><path d="M152 100h16M152 106h16" stroke="#6a6e7c" stroke-width="1.6"/></g></g>' +
      '<path d="M84 204l-4 26h-16q-4 6 4 8h22l2-34zM116 204l4 26h16q4 6-4 8h-22l-2-34z" fill="#1a0b38"/>' +
      '<path d="M64 124q36-18 72 0l8 80q-44 16-88 0z" fill="url(#bn-jacket)" stroke="#4a0028" stroke-width="2.5"/>' +
      '<path d="M86 118l14 52 14-52z" fill="#fff8ea"/><path d="M86 118l-8 44 22 8zM114 118l8 44-22 8z" fill="#2a0a2a" opacity=".55"/>' +
      '<g class="h-spark" fill="#fff">' + [[72, 150], [126, 144], [80, 182], [124, 176], [104, 194], [70, 132]].map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (1.6 + (i % 3) * 0.6) + '" style="animation-delay:-' + (i * 0.37).toFixed(2) + 's"/>').join('') + '</g>' +
      '<path d="M100 126l-16-9v18zM100 126l16-9v18z" fill="url(#bn-gold)" stroke="#6a3a00" stroke-width="1.5"/><circle cx="100" cy="126" r="4" fill="#ffcf3f" stroke="#6a3a00" stroke-width="1.5"/>' +
      '<g class="h-head">' +
      '<path d="M66 62L52 6l38 38z" fill="url(#bn-fur)" stroke="#170830" stroke-width="2.5"/><path d="M68 54L60 20l20 22z" fill="#ff8fc8"/>' +
      '<path d="M134 62l14-56-38 38z" fill="url(#bn-fur)" stroke="#170830" stroke-width="2.5"/><path d="M132 54l8-34-20 22z" fill="#ff8fc8"/>' +
      '<ellipse cx="100" cy="72" rx="42" ry="37" fill="url(#bn-fur)" stroke="#170830" stroke-width="2.5"/>' +
      '<ellipse cx="100" cy="88" rx="25" ry="16" fill="#9a80dc"/>' +
      '<g class="h-eyes"><ellipse cx="85" cy="66" rx="10" ry="12" fill="#fff"/><ellipse cx="115" cy="66" rx="10" ry="12" fill="#fff"/><circle class="h-pup" cx="87" cy="68" r="5.5" fill="#180a30"/><circle class="h-pup" cx="113" cy="68" r="5.5" fill="#180a30"/><circle cx="89" cy="65" r="2" fill="#fff"/><circle cx="115" cy="65" r="2" fill="#fff"/></g>' +
      '<path class="h-lid" d="M74 60q11-12 22 0M104 60q11-12 22 0" fill="none" stroke="#170830" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="100" cy="82" rx="5" ry="3.5" fill="#2a0e4a"/>' +
      '<g class="h-mouth"><path d="M86 92q14 16 28 0q-14 6-28 0z" fill="#3a0620" stroke="#170830" stroke-width="2"/><path d="M90 93l3 6 3-5M104 94l3 5 3-6" fill="#fff"/></g>' +
      '<ellipse cx="73" cy="86" rx="6" ry="4" fill="#ff6fb4" opacity=".55"/><ellipse cx="127" cy="86" rx="6" ry="4" fill="#ff6fb4" opacity=".55"/>' +
      '<g class="h-hat" transform="rotate(-12 100 36)"><rect x="80" y="10" width="40" height="28" rx="3" fill="#1a0b38" stroke="#0a0418" stroke-width="2"/><rect x="80" y="28" width="40" height="7" fill="url(#bn-gold)"/><rect x="70" y="35" width="60" height="7" rx="3.5" fill="#1a0b38" stroke="#0a0418" stroke-width="2"/></g>' +
      '</g></g></svg>';
  }
  /* the studio: a deep stage, an arch of bulbs, spotlights and a crowd of bats in the dark */
  function studioSvg() {
    /* the static set is one SVG painted once; everything that moves is its own layer, animated with opacity/transform only */
    const VB = 'viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"';
    const bulbs = ['', '', ''];
    for (let i = 0; i <= 40; i++) { const a = Math.PI + (i / 40) * Math.PI, x = 800 + 700 * Math.cos(a), y = 640 + 560 * Math.sin(a); bulbs[i % 3] += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="7"/>'; }
    const crowd = ['', ''];
    const r = rngFor(7, 7);
    for (let i = 0; i < 46; i++) { const x = (i / 46) * 1640 - 20 + r() * 20, y = 820 + r() * 50, s = 0.5 + r() * 0.35; crowd[i % 2] += '<path d="' + BATP + '" transform="translate(' + x.toFixed(0) + ' ' + y.toFixed(0) + ') scale(' + s.toFixed(2) + ')"/>'; }
    return '<svg class="bn-studio" ' + VB + '><defs>' +
      '<radialGradient id="bn-st-bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#4a167e"/><stop offset=".55" stop-color="#1c0738"/><stop offset="1" stop-color="#07020f"/></radialGradient>' +
      '<linearGradient id="bn-st-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0c4c"/><stop offset="1" stop-color="#05010b"/></linearGradient></defs>' +
      '<rect width="1600" height="900" fill="url(#bn-st-bg)"/>' +
      '<g opacity=".3">' + Array.from({ length: 9 }, (_, i) => '<rect x="' + (60 + i * 170) + '" y="70" width="130" height="420" rx="14" fill="none" stroke="' + (i % 2 ? '#ff58b9' : '#b06cff') + '" stroke-width="3"/>').join('') + '</g>' +
      '<path d="M100 640A700 560 0 0 1 1500 640" fill="none" stroke="#ffcf3f" stroke-width="16" opacity=".35"/>' +
      '<path d="M0 690L1600 690L1600 900L0 900Z" fill="url(#bn-st-floor)"/>' +
      '<ellipse cx="800" cy="700" rx="760" ry="40" fill="#ff2d8a" opacity=".12"/>' +
      '<linearGradient id="bn-st-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<path d="M250 -20L330 -20L600 900L40 900Z" fill="url(#bn-st-beam)" transform="rotate(-8 290 0)"/><path d="M1270 -20L1350 -20L1560 900L1000 900Z" fill="url(#bn-st-beam)" transform="rotate(9 1310 0)"/><path d="M770 -20L830 -20L1010 900L590 900Z" fill="url(#bn-st-beam)" opacity=".6"/></svg>' +
      bulbs.map((b, i) => '<svg class="bn-st-bulbs l' + i + '" ' + VB + '><g fill="' + ['#ffe9a0', '#ff8fd0', '#9fd0ff'][i] + '">' + b + '</g></svg>').join('') +
      crowd.map((c, i) => '<svg class="bn-st-crowd c' + i + '" ' + VB + '><g fill="#0a0216">' + c + '</g></svg>').join('');
  }

  /* ============================== the money wheel face (canvas) ============================== */
  const FONT = 'Bungee, "Bowlby One", "Arial Black", Impact, sans-serif';
  function wedge(c, a0, a1, r0, r1) { c.beginPath(); c.arc(0, 0, r1, a0, a1); c.arc(0, 0, r0, a1, a0, true); c.closePath(); }
  function drawMoneyFace(cv, px) {
    cv.width = cv.height = px;
    const c = cv.getContext('2d'), R = px / 2;
    c.setTransform(1, 0, 0, 1, R, R);
    /* rim */
    let g = c.createRadialGradient(0, 0, R * 0.9, 0, 0, R);
    g.addColorStop(0, '#6a3a00'); g.addColorStop(0.35, '#ffe08a'); g.addColorStop(0.7, '#c98a10'); g.addColorStop(1, '#4a2600');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    const r0 = R * 0.3, r1 = R * 0.915;
    for (let i = 0; i < M.N; i++) {
      const s = M.WHEEL[i], st = SP[s], a0 = (i - 0.5) * SEG - Math.PI / 2, a1 = (i + 0.5) * SEG - Math.PI / 2;
      const gg = c.createRadialGradient(0, 0, r0, 0, 0, r1);
      if (s === 'flap') { gg.addColorStop(0, '#2a0010'); gg.addColorStop(1, i % 2 ? '#ff2d48' : '#1f5cff'); }
      else if (s === 'bonkers') { gg.addColorStop(0, '#5a0a2c'); gg.addColorStop(0.6, '#ff2d8a'); gg.addColorStop(1, '#ffd23a'); }
      else { gg.addColorStop(0, st.c2); gg.addColorStop(1, st.c1); }
      wedge(c, a0, a1, r0, r1); c.fillStyle = gg; c.fill();
      /* a glossy band */
      wedge(c, a0, a1, r1 - R * 0.07, r1); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
      c.strokeStyle = 'rgba(40,16,0,.85)'; c.lineWidth = R * 0.008; wedge(c, a0, a1, r0, r1); c.stroke();
      /* label */
      c.save(); c.rotate((i * SEG) - Math.PI / 2);
      if (M.NUMBERS[s]) {
        c.translate(r1 - R * 0.13, 0); c.rotate(Math.PI / 2);
        c.font = (s === '10' ? 0.085 : 0.105) * R + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = R * 0.018; c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(s, 0, 0);
        c.fillStyle = st.ink === '#ffffff' ? '#fff' : st.ink; c.fillText(s, 0, 0);
        c.rotate(-Math.PI / 2); c.translate(-(r1 - R * 0.13), 0);
        /* little bat pips toward the hub */
        c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(r0 + R * 0.12, 0, R * 0.012, 0, TAU); c.fill();
      } else {
        const txt = s === 'flap' ? 'COIN FLAP' : s === 'hunt' ? 'CRYPT HUNT' : s === 'drop' ? 'DROP ZONE' : 'BONKERS';
        c.font = (s === 'bonkers' ? 0.05 : 0.046) * R + 'px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'middle';
        c.lineWidth = R * 0.012; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(txt, r1 - R * 0.035, 0);
        c.fillStyle = s === 'hunt' ? '#eafff1' : s === 'drop' ? '#effcff' : '#fff'; c.fillText(txt, r1 - R * 0.035, 0);
        c.fillStyle = s === 'bonkers' ? '#ffd23a' : '#fff'; c.beginPath(); c.arc(r0 + R * 0.06, 0, R * 0.018, 0, TAU); c.fill();
      }
      c.restore();
    }
    /* pegs on the boundaries */
    for (let i = 0; i < M.N; i++) {
      const a = (i + 0.5) * SEG - Math.PI / 2, x = Math.cos(a) * R * 0.955, y = Math.sin(a) * R * 0.955;
      const pg = c.createRadialGradient(x - R * 0.004, y - R * 0.004, 0, x, y, R * 0.018);
      pg.addColorStop(0, '#fffbe0'); pg.addColorStop(1, '#a86400');
      c.fillStyle = pg; c.beginPath(); c.arc(x, y, R * 0.016, 0, TAU); c.fill();
    }
    /* inner ring */
    g = c.createRadialGradient(0, 0, r0 * 0.7, 0, 0, r0);
    g.addColorStop(0, '#1a0638'); g.addColorStop(0.85, '#3a1470'); g.addColorStop(1, '#ffcf3f');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r0, 0, TAU); c.fill();
    for (let i = 0; i < 27; i++) { const a = (i / 27) * TAU; c.fillStyle = i % 2 ? '#ffe9a0' : '#ff8fd0'; c.beginPath(); c.arc(Math.cos(a) * r0 * 0.9, Math.sin(a) * r0 * 0.9, R * 0.011, 0, TAU); c.fill(); }
  }
  /* the giant BONKERS TIME wheel: 64 segments of prizes and two kinds of multiplier */
  function drawBigFace(cv, px) {
    cv.width = cv.height = px;
    const c = cv.getContext('2d'), R = px / 2;
    c.setTransform(1, 0, 0, 1, R, R);
    let g = c.createRadialGradient(0, 0, R * 0.9, 0, 0, R);
    g.addColorStop(0, '#5a0a2c'); g.addColorStop(0.4, '#ffe08a'); g.addColorStop(0.75, '#d08a10'); g.addColorStop(1, '#4a2600');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    const r0 = R * 0.22, r1 = R * 0.92, pal = ['#ff2d8a', '#ffd23a', '#2fe07a', '#3a8bff', '#b06cff', '#ff8a1e'];
    for (let i = 0; i < M.BIG_N; i++) {
      const s = M.BIG.segs[i], a0 = (i - 0.5) * BSEG - Math.PI / 2, a1 = (i + 0.5) * BSEG - Math.PI / 2;
      const gg = c.createRadialGradient(0, 0, r0, 0, 0, r1);
      if (s === 'D') { gg.addColorStop(0, '#300018'); gg.addColorStop(1, '#ff1f5a'); }
      else if (s === 'T') { gg.addColorStop(0, '#002a18'); gg.addColorStop(1, '#00e08a'); }
      else if (s >= 100) { gg.addColorStop(0, '#3a1a00'); gg.addColorStop(1, '#ffd23a'); }
      else { const col = pal[i % pal.length]; gg.addColorStop(0, '#12051f'); gg.addColorStop(1, col); }
      wedge(c, a0, a1, r0, r1); c.fillStyle = gg; c.fill();
      c.strokeStyle = 'rgba(20,0,10,.9)'; c.lineWidth = R * 0.006; c.stroke();
      c.save(); c.rotate(i * BSEG - Math.PI / 2);
      const txt = s === 'D' ? 'DOUBLE' : s === 'T' ? 'TRIPLE' : String(s);
      c.font = (typeof s === 'number' ? (s >= 100 ? 0.062 : 0.068) : 0.04) * R + 'px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.lineWidth = R * 0.012; c.strokeStyle = 'rgba(0,0,0,.65)'; c.strokeText(txt, r1 - R * 0.03, 0);
      c.fillStyle = s >= 100 ? '#2a0a00' : '#fff'; if (s >= 100) { c.strokeStyle = '#fff6c2'; c.lineWidth = R * 0.006; c.strokeText(txt, r1 - R * 0.03, 0); }
      c.fillText(txt, r1 - R * 0.03, 0);
      c.restore();
    }
    for (let i = 0; i < M.BIG_N; i++) { const a = (i + 0.5) * BSEG - Math.PI / 2; c.fillStyle = '#fff3c0'; c.beginPath(); c.arc(Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955, R * 0.012, 0, TAU); c.fill(); }
    g = c.createRadialGradient(0, 0, 0, 0, 0, r0);
    g.addColorStop(0, '#ff2d8a'); g.addColorStop(0.7, '#5a0a2c'); g.addColorStop(1, '#ffd23a');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r0, 0, TAU); c.fill();
    c.font = R * 0.07 + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.lineWidth = R * 0.012; c.strokeStyle = '#2a0a18';
    c.strokeText('BONKERS', 0, -R * 0.03); c.fillText('BONKERS', 0, -R * 0.03); c.font = R * 0.05 + 'px ' + FONT; c.fillStyle = '#ffd23a'; c.strokeText('TIME', 0, R * 0.05); c.fillText('TIME', 0, R * 0.05);
  }

  /* ============================== sound: Bertie's own kit ============================== */
  const AU = B.audio;
  const snd = {
    tick(v) { AU.tone({ f: 1800 + Math.random() * 300, f2: 1100, d: 0.02, type: 'square', v: 0.03 + 0.04 * (v || 0) }); AU.noise({ d: 0.012, v: 0.04, hp: 4000 }); },
    peg(i) { AU.tone({ f: 620 + (i % 7) * 70, f2: 380, d: 0.07, type: 'triangle', v: 0.09 }); AU.noise({ d: 0.02, v: 0.03, hp: 5000 }); },
    chip() { AU.tone({ f: 2400, f2: 1700, d: 0.04, type: 'square', v: 0.05 }); AU.noise({ d: 0.03, v: 0.06, hp: 3000 }); },
    click() { AU.tone({ f: 900, d: 0.03, type: 'triangle', v: 0.06 }); },
    count() { AU.tone({ f: 1320, d: 0.05, type: 'sine', v: 0.08 }); },
    hot() { AU.tone({ f: 990, d: 0.08, type: 'square', v: 0.06 }); },
    open() { const n = B.notes; AU.seq([n.C5, n.E5, n.G5, [n.C6, 2]], { step: 0.08, type: 'triangle', v: 0.09 }); },
    close() { AU.tone({ f: 420, f2: 260, d: 0.25, type: 'sawtooth', v: 0.08 }); AU.tone({ f: 330, f2: 200, d: 0.3, type: 'sawtooth', v: 0.06, t: 0.12 }); },
    whoosh() { AU.noise({ d: 0.55, v: 0.1, lp: 600, f2: 4200 }); },
    thud() { AU.tone({ f: 140, f2: 50, d: 0.16, type: 'sine', v: 0.28 }); AU.noise({ d: 0.06, v: 0.06, lp: 900 }); },
    reel() { AU.tone({ f: 300, f2: 900, d: 0.1, type: 'square', v: 0.03 }); },
    ding() { [1568, 2093].forEach((f, i) => AU.tone({ f, d: 0.5, type: 'sine', v: 0.1, t: i * 0.06 })); },
    fanfare() { const n = B.notes; AU.seq([n.G4, n.C5, n.E5, n.G5, [n.C6, 2], n.G5, [n.C6, 4]], { step: 0.1, type: 'sawtooth', v: 0.08 }); AU.noise({ d: 0.9, v: 0.05, hp: 3000, t: 0.5 }); },
    drum(d) { for (let i = 0; i < (d || 16); i++) AU.noise({ d: 0.05, v: 0.03 + i * 0.004, lp: 1400, t: i * 0.06 }); },
    rise() { for (let i = 0; i < 10; i++) AU.tone({ f: 220 * Math.pow(2, i / 6), d: 0.12, type: 'sawtooth', v: 0.05, t: i * 0.07 }); },
    ping() { AU.tone({ f: 2637, d: 0.6, type: 'sine', v: 0.12 }); AU.tone({ f: 3951, d: 0.4, type: 'sine', v: 0.05, t: 0.02 }); },
    crack() { AU.noise({ d: 0.18, v: 0.16, hp: 900 }); AU.tone({ f: 180, f2: 60, d: 0.12, type: 'sine', v: 0.18 }); },
    boing() { AU.tone({ f: 200, f2: 520, d: 0.18, type: 'sine', v: 0.14 }); },
    zap() { AU.tone({ f: 1600, f2: 120, d: 0.3, type: 'sawtooth', v: 0.08 }); AU.noise({ d: 0.25, v: 0.1, hp: 2000 }); },
    dbl() { const n = B.notes; AU.seq([n.C5, n.G5, n.C6, n.G5, [n.C6, 2]], { step: 0.07, type: 'square', v: 0.08 }); },
    lose() { AU.tone({ f: 330, f2: 220, d: 0.3, type: 'triangle', v: 0.07 }); },
    win(big) { const n = B.notes; AU.seq(big ? [n.E5, n.G5, n.C6, n.E6, n.C6, [n.E6, 3]] : [n.E5, n.G5, [n.C6, 2]], { step: 0.085, type: 'sawtooth', v: 0.09 }); },
  };

  /* ============================== poster and rules ============================== */
  const POSTER = (function () {
    const CX = 150, CY = 262, RW = 104;
    let segs = '';
    const cols = ['#3b97ff', '#ffd84a', '#3b97ff', '#ff58b9', '#3b97ff', '#ff4057', '#ffd84a', '#3b97ff', '#b06cff', '#3b97ff', '#ffd84a', '#22d8ff', '#3b97ff', '#ff58b9', '#3b97ff', '#ffd84a', '#3b97ff', '#3fe08a'];
    for (let i = 0; i < 18; i++) { const a0 = (i / 18) * TAU - Math.PI / 2 - TAU / 36, a1 = a0 + TAU / 18; segs += '<path d="M' + CX + ' ' + CY + 'L' + (CX + RW * Math.cos(a0)).toFixed(1) + ' ' + (CY + RW * Math.sin(a0)).toFixed(1) + 'A' + RW + ' ' + RW + ' 0 0 1 ' + (CX + RW * Math.cos(a1)).toFixed(1) + ' ' + (CY + RW * Math.sin(a1)).toFixed(1) + 'Z" fill="' + cols[i] + '" stroke="#3a1a00" stroke-width="1.5"/>'; }
    return '<svg viewBox="0 0 300 380" aria-hidden="true"><defs><radialGradient id="bnp-bg" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#5a1a9a"/><stop offset="1" stop-color="#0c0320"/></radialGradient>' +
      '<linearGradient id="bnp-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".5" stop-color="#ffcf3f"/><stop offset="1" stop-color="#a86400"/></linearGradient></defs>' +
      '<rect width="300" height="380" fill="url(#bnp-bg)"/>' +
      '<path d="M40 380L120 0h60l80 380z" fill="#fff" opacity=".06"/>' +
      Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return '<circle cx="' + (CX + 122 * Math.cos(a)).toFixed(0) + '" cy="' + (CY + 122 * Math.sin(a)).toFixed(0) + '" r="3.6" fill="' + (i % 2 ? '#ffe9a0' : '#ff8fd0') + '"/>'; }).join('') +
      '<circle cx="' + CX + '" cy="' + CY + '" r="114" fill="url(#bnp-g)"/>' + segs + '<circle cx="' + CX + '" cy="' + CY + '" r="30" fill="#1a0638" stroke="url(#bnp-g)" stroke-width="5"/>' +
      '<path d="' + BATP + '" transform="translate(129 254) scale(.35)" fill="#ffcf3f"/>' +
      '<path d="M150 166l11 -20h-22z" fill="#fff" stroke="#3a1a00" stroke-width="2"/>' +
      '<text x="150" y="96" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="40" fill="#ffd23a" stroke="#5a0a2c" stroke-width="6" paint-order="stroke">BONKERS</text>' +
      '<text x="150" y="132" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="30" fill="#ff58b9" stroke="#2a0a18" stroke-width="5" paint-order="stroke">TIME</text>' +
      '<rect x="0" y="336" width="300" height="44" fill="#0c0320" opacity=".85"/><text x="150" y="364" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="15" fill="#fff">LIVE GAME SHOW · 4 BONUS GAMES</text></svg>';
  })();
  function rules() {
    const pct = (n) => (n / M.N * 100).toFixed(1) + '%';
    const rows = M.SPOTS.map((s) => '<tr><td>' + NAME(s) + '</td><td>' + M.COUNT[s] + ' of 54</td><td>' + pct(M.COUNT[s]) + '</td><td>' + (M.NUMBERS[s] ? M.NUMBERS[s] + ' to 1' : 'the bonus result') + '</td></tr>').join('');
    const live = B.online
      ? '<h3>The live show</h3><p>Everyone in the casino plays the same wheel at the same moment. Bets are open for <b>15 seconds</b>; then Bertie calls “no more bets”, the Top Slot spins and the wheel runs for about 9 seconds. The whole round is drawn by the server when it is created, and nothing about it leaves the server until its moment comes. Bonus games are played once, for everybody, live. Your chips are settled on the server when the show reaches the payout, even if you have left the studio.</p>'
      : '<h3>Practice studio</h3><p>Place your chips and press <b>Spin</b> (or Space). Online, Bonkers Time is one live show shared by every player in the casino.</p>';
    return '<p><b>A live money-wheel game show.</b> Put chips on any of the eight spots: the four numbers, and the four bonus games. Spin the giant wheel of 54 segments; whatever it lands on wins.</p>' + live +
      '<h3>The wheel</h3><table><tr><th>Spot</th><th>Segments</th><th>Lands</th><th>Pays</th></tr>' + rows + '</table>' +
      '<p>A win pays its multiplier and gives your chip back. A chip on a bonus that comes up plays that bonus; a bonus that you have no chip on is still shown, for fun.</p>' +
      '<h3>Top Slot</h3><p>Before the wheel spins, the two-reel Top Slot above it picks one spot and a multiplier from 2× to 50×. If the wheel lands on that spot, its whole result is multiplied, bonus games included.</p>' +
      '<h3>Coin Flap</h3><p>The red side and the blue side of a giant coin each get a multiplier (2× to 100×). Bertie flips it, and the side that lands face up pays.</p>' +
      '<h3>Crypt Hunt</h3><p>A wall of 108 tombstones, each hiding a prize from 5× to 500×. You see every prize, then the tombs close and shuffle. Pick one before the timer runs out (or Bertie picks one for you); everyone’s tomb is then smashed open and yours pays what is inside.</p>' +
      '<h3>Drop Zone</h3><p>Sixteen pockets: fourteen prizes from 5× to 500× and two DOUBLEs. Bertie drops the puck through the pegs; it is equally likely to finish in any pocket. A DOUBLE doubles every prize on the board and the puck is dropped again. After five doubles the DOUBLE pockets close.</p>' +
      '<h3>BONKERS TIME</h3><p>A giant wheel of 64 prizes from 10× to 500×, with three DOUBLE and one TRIPLE segment, and three flappers: green, blue and yellow. Choose your flapper (or one is chosen for you). Each spin, a flapper on a prize banks it; a flapper on DOUBLE or TRIPLE multiplies its own prize and spins again. After five re-spins the multipliers switch off.</p>' +
      '<h3>Limits</h3><p>Chips of 10, 50, 100, 500, 1,000 and 5,000 BB, at most ' + fmt(M.SPOT_MAX) + ' BB on one spot and ' + fmt(M.TABLE_MAX) + ' BB per round. No spot pays more than ' + fmt(M.CAP) + '× (plus the chip back).</p>' +
      '<h3>Controls</h3><p>Pick a chip and tap the spots. <b>U</b> undo, <b>C</b> clear, <b>X</b> double, <b>R</b> rebet, <b>1</b>–<b>6</b> chips' + (B.online ? '' : ', <b>Space</b> spin') + '.</p>' +
      '<h3>Return</h3><p>Every spot returns <b>96.00%</b>, worked out exactly from the tables, Top Slot and cap included (each BONKERS TIME flapper and every Crypt Hunt tomb alike); a 10,000,000-round simulation agrees within its margin. Hit rates are the segment shares above. The largest single payout is ' + fmt(M.CAP) + '× a spot’s chip.</p>' +
      '<p class="rtp">Return to player 96.00% on every spot (exact). Max win ' + fmt(M.CAP) + '× per spot. Batty Bucks have no cash value.</p>';
  }

  /* ============================== layouts (logical px; the stage is scaled to fit) ============================== */
  const LAY = {
    wide: { name: 'wide', W: 1280, H: 720,
      hist: [252, 8, 776, 44], rail: [12, 12, 226, 470], side: [1042, 12, 226, 470],
      show: [244, 0, 792, 488], ts: [640, 118], wheel: [640, 578, 342], host: [352, 318, 1],
      timer: [962, 128], spots: [12, 498, 940, 150], spotCols: 8, info: [12, 656, 940, 56],
      chips: [964, 506, 304, 66], acts: [964, 582, 304, 62], go: [964, 652, 304, 60] },
    tall: { name: 'tall', W: 720, H: 1440,
      hist: [12, 8, 696, 46], rail: [12, 902, 696, 60], side: null,
      show: [0, 60, 720, 836], ts: [360, 116], wheel: [360, 632, 334], host: [92, 268, 0.82],
      timer: [636, 268], spots: [12, 972, 696, 252], spotCols: 4, info: [12, 1230, 696, 50],
      chips: [12, 1288, 696, 70], acts: [12, 1366, 460, 66], go: [480, 1366, 228, 66] },
    compact: { name: 'compact', W: 1400, H: 580,
      hist: [712, 6, 676, 40], rail: [712, 516, 676, 58], side: null,
      show: [0, 0, 700, 580], ts: [350, 60], wheel: [350, 518, 330], host: [92, 360, 0.8],
      timer: [622, 92], spots: [712, 52, 676, 236], spotCols: 4, info: [712, 294, 676, 48],
      chips: [712, 348, 676, 70], acts: [712, 424, 440, 84], go: [1160, 424, 228, 84] },
  };

  /* ============================== bonus scenes ==============================
     Each scene is built on an 800 × 560 logical board that is scaled into the show area. update(t, R) is called every
     frame with the show clock and the round as currently known; it must draw the right picture for ANY t (join late,
     reload, slow poll). ctx carries the viewer's own picks, the room's players and the once-only event helper. */
  const SW = 800, SH = 560;
  /* keeps a value continuous when its model changes (a late reveal arrives): the jump is blended out */
  function smoother(rate, angle) {
    let off = 0, key = null, out = null, lt = null;
    return function (v, k, t) {
      if (key !== null && k !== key && out !== null) off += angle ? wrapPi(out - v) : out - v;
      const dt = lt == null ? 0 : clamp(t - lt, 0, 0.1); off *= Math.exp(-dt * rate);
      if (Math.abs(off) < 1e-4) off = 0;
      key = k; lt = t; out = v + off; return out;
    };
  }
  const xTxt = (x) => fmt(x) + '×';
  function sceneShell(cls, title, s) {
    const el = h('div', { class: 'sc ' + cls });
    const head = h('div', { class: 'sc-head' }, h('span', { class: 'sc-ic', html: icon(s) }), h('b', null, title), h('em', { class: 'sc-ts', hidden: true }));
    const sub = h('div', { class: 'sc-sub', 'aria-hidden': 'true' });
    const res = h('div', { class: 'sc-res', 'aria-hidden': 'true' }, h('small'), h('b'), h('i'));
    el.append(head, sub, res);
    let lastSub = null, lastRes = null;
    return {
      el, head, sub, res,
      setSub(txt) { if (txt !== lastSub) { lastSub = txt; sub.textContent = txt || ''; sub.classList.toggle('on', !!txt); } },
      setRes(small, big, note, cls2) { const k = small + '|' + big + '|' + note + '|' + cls2; if (k === lastRes) return; lastRes = k; res.className = 'sc-res' + (big ? ' on' : '') + (cls2 ? ' ' + cls2 : ''); res.children[0].textContent = small || ''; res.children[1].textContent = big || ''; res.children[2].textContent = note || ''; },
      setTs(R) { const t = head.querySelector('.sc-ts'); const on = R.ts && R.ts.spot === R.spot; t.hidden = !on; if (on) t.textContent = 'TOP SLOT ' + R.ts.mult + '×'; },
    };
  }
  const tsMult = (R) => (R.ts && R.ts.spot === R.spot ? R.ts.mult : 1);
  function finalLine(R, base) { const m = tsMult(R); return m > 1 ? xTxt(base) + ' × ' + m + ' Top Slot = ' + xTxt(Math.min(M.CAP, base * m)) : ''; }

  /* ---------- Coin Flap ---------- */
  function sceneFlap(ctx) {
    const sh = sceneShell('sc-flap', 'Coin Flap', 'flap');
    const face = (side) => '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="98" fill="url(#bn-gold)"/><circle cx="100" cy="100" r="86" fill="url(#' + (side ? 'bn-coinB' : 'bn-coinR') + ')"/>' +
      '<circle cx="100" cy="100" r="78" fill="none" stroke="#fff3c0" stroke-width="3" stroke-dasharray="6 6" opacity=".8"/><path d="' + BATP + '" transform="translate(64 40) scale(.6)" fill="#fff" opacity=".35"/></svg>';
    const st = h('div', { class: 'fl-stage', html: '<i class="fl-cone"></i><i class="fl-ped"></i>' });
    const host = h('div', { class: 'bn-host fl-host', html: hostSvg() });
    const box = (k) => h('div', { class: 'fl-box ' + (k ? 'b' : 'r') }, h('small', null, k ? 'BLUE' : 'RED'), h('b', null, '?'));
    const bx = [box(0), box(1)];
    const coin = h('div', { class: 'fl-coin' }, h('div', { class: 'fc r', html: face(0) }, h('b')), h('div', { class: 'fc b', html: face(1) }, h('b')), h('i', { class: 'fc-core' }));
    const wrap = h('div', { class: 'fl-cw' }, h('i', { class: 'fl-sh' }), coin);
    sh.el.append(st, host, bx[0], bx[1], wrap);
    sh.el.insertBefore(st, sh.el.firstChild);
    const rot = smoother(5), seed = rngFor(ctx.id, 11), turns = 7 + Math.floor(seed() * 4);
    let shown = [null, null], last = '';
    return {
      el: sh.el,
      update(t, R) {
        const F = R.flap || {}, B0 = R.bonus, flip = R.flip != null ? R.flip : B0 + 4.5, land = R.land != null ? R.land : B0 + 7.7;
        sh.setTs(R);
        /* the two multipliers roll and lock */
        for (let k = 0; k < 2; k++) {
          const lockAt = B0 + 1.6 + k, v = F[k ? 'blue' : 'red'];
          let txt;
          if (t < lockAt || v == null) txt = xTxt(M.FLAP.values[Math.floor((t * 15 + k * 5) % M.FLAP.values.length)]);
          else txt = xTxt(v);
          if (txt !== shown[k]) { shown[k] = txt; bx[k].lastChild.textContent = txt; coin.children[k].lastChild.textContent = t >= lockAt && v != null ? txt : ''; }
          bx[k].classList.toggle('lock', t >= lockAt && v != null);
          ctx.once('fl-lock' + k, lockAt, t, (late) => { if (!late) snd.ping(); });
        }
        /* the coin */
        let a, y = 0, sc = 1, key = 'pre';
        if (t < flip) {
          const w = (t - (B0 + 2.8)) / 1.5;
          a = 360 * easeInOut(w) + (t > B0 + 2.6 ? 0 : Math.sin(t * 2.4) * 8);
          y = -8 - 6 * Math.sin(t * 3);
        } else {
          const side = F.side != null ? F.side : 0, u = clamp((t - flip) / (land - flip), 0, 1);
          key = 'f' + (F.side != null);
          a = 360 * (turns * easeOut(u, 2)) + 180 * side * smooth((u - 0.38) / 0.52);
          if (u < 1) { y = -270 * 4 * u * (1 - u); sc = 1 + 0.32 * 4 * u * (1 - u); }
          else { const u2 = clamp((t - land) / 0.4, 0, 1); y = -22 * 4 * u2 * (1 - u2); }
          ctx.once('fl-flip', flip, t, (late) => { if (!late) { snd.whoosh(); host.classList.add('cheer'); } });
        }
        a = rot(a, key, t);
        coin.style.transform = 'rotateX(' + a.toFixed(1) + 'deg)';
        wrap.style.transform = 'translate(-50%,-50%) translateY(' + y.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
        wrap.firstChild.style.transform = 'scale(' + (1 - Math.min(0.6, -y / 450)).toFixed(3) + ')';
        /* the result */
        if (t >= land && F.side != null) {
          bx[F.side].classList.add('win'); bx[1 - F.side].classList.add('lose');
          ctx.once('fl-land', land, t, (late) => { if (!late) { snd.ding(); snd.fanfare(); } host.classList.remove('cheer'); host.classList.add('talk'); });
          const m = tsMult(R), fin = Math.min(M.CAP, F.x * m);
          const k = (F.side ? 'Blue' : 'Red') + (t >= land + 1.3 ? 'f' : '');
          if (k !== last) { last = k; sh.setRes((F.side ? 'BLUE' : 'RED') + ' WINS', xTxt(t >= land + 1.3 ? fin : F.x), t >= land + 1.3 ? finalLine(R, F.x) : '', F.side ? 'blue' : 'red'); }
          if (m > 1) ctx.once('fl-ts', land + 1.3, t, (late) => { if (!late) snd.dbl(); });
          sh.setSub('');
        } else sh.setSub(t < B0 + 2.6 ? 'Red and blue get their multipliers…' : t < flip ? 'Bertie gets ready to flip…' : 'Heads or tails? Red or blue?');
      },
      destroy() {},
    };
  }

  /* ---------- Crypt Hunt ---------- */
  function sceneHunt(ctx) {
    const sh = sceneShell('sc-hunt', 'Crypt Hunt', 'hunt');
    const COLS = M.HUNT_COLS, N = M.HUNT_N, PX = 60, PY = 47, X0 = (SW - COLS * PX) / 2 + PX / 2, Y0 = 118 + PY / 2;
    const bg = h('div', { class: 'hu-bg', html: '<i class="hu-moon"></i><i class="hu-fog f1"></i><i class="hu-fog f2"></i>' });
    const grid = h('div', { class: 'hu-grid' });
    const tiles = [], home = [];
    for (let i = 0; i < N; i++) {
      const x = X0 + (i % COLS) * PX, y = Y0 + Math.floor(i / COLS) * PY;
      home.push([x, y]);
      const tl = h('button', { type: 'button', class: 'ht', 'aria-label': 'Tomb ' + (i + 1), tabindex: '-1' }, h('span', { class: 'v' }), h('i', { class: 'st' }, h('em', null, 'RIP')), h('i', { class: 'mk' }));
      tl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      tl.onpointerdown = (e) => e.preventDefault();   // no focus, so nothing ever scrolls the studio
      tl.onclick = () => ctx.pick(i);
      tiles.push(tl); grid.append(tl);
    }
    const bolt = h('i', { class: 'hu-bolt' });
    sh.el.append(bg, grid, bolt);
    sh.el.insertBefore(bg, sh.el.firstChild);
    const tstate = new Array(N).fill(''), tval = new Array(N).fill(null), tmark = new Array(N).fill('');
    const way = [];
    { const r = rngFor(ctx.id, 21); for (let i = 0; i < N; i++) way.push([[home[i][0] + (r() - 0.5) * 380, home[i][1] + (r() - 0.5) * 260], [home[(i * 37 + 11) % N][0], home[(i * 37 + 11) % N][1]], [home[i][0] + (r() - 0.5) * 160, home[i][1] + (r() - 0.5) * 120]]); }
    let moving = false, lastMine = null;
    const set = (i, s) => { if (tstate[i] !== s) { tstate[i] = s; tiles[i].className = 'ht ' + s; } };
    return {
      el: sh.el,
      update(t, R) {
        const H = R.hunt || {}, B0 = R.bonus, cover = R.cover, shuf = R.shuffle, aim = R.aim, lock = R.lock, fire = R.fire;
        sh.setTs(R);
        const mine = ctx.myPick('hunt'), canPick = ctx.canPick() && t >= aim && t < lock;
        sh.el.classList.toggle('aiming', canPick);
        /* where every tomb is */
        if (t >= shuf && t < aim) {
          moving = true;
          for (let i = 0; i < N; i++) {
            const u = (t - shuf) / (aim - shuf), w = way[i], hm = home[i];
            const pts = [hm, w[0], w[1], w[2], hm], seg = Math.min(3, Math.floor(u * 4)), f = easeInOut(u * 4 - seg);
            const x = lerp(pts[seg][0], pts[seg + 1][0], f), y = lerp(pts[seg][1], pts[seg + 1][1], f);
            tiles[i].style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
          }
          ctx.once('hu-shuf', shuf, t, (late) => { if (!late) snd.drum(20); });
        } else if (moving) { moving = false; for (let i = 0; i < N; i++) tiles[i].style.transform = 'translate(' + home[i][0] + 'px,' + home[i][1] + 'px)'; }
        /* what every tomb shows */
        const pick = mine != null ? mine : null;
        const cx = pick != null ? home[pick][0] : SW / 2, cy = pick != null ? home[pick][1] : 300;
        for (let i = 0; i < N; i++) {
          let s, v = null;
          if (t < cover) { s = 'open'; v = H.show ? H.show[i] : null; }
          else if (t < fire || !H.wall) s = t >= cover + (i % COLS) * 0.04 ? 'up' : 'open', v = t < cover + (i % COLS) * 0.04 && H.show ? H.show[i] : null;
          else {
            const d = Math.hypot(home[i][0] - cx, home[i][1] - cy) / 700, at = fire + (i === pick ? 0.25 : 0.7 + d * 1.6);
            if (t >= at) { s = 'cr'; v = H.wall[i]; if (H.best != null && v === H.best && t >= fire + 2.5) s = 'cr best'; } else s = 'up';
          }
          if (i === pick) s += ' mine';
          if (canPick) s += ' can';
          set(i, s);
          if (v !== tval[i]) { tval[i] = v; tiles[i].firstChild.textContent = v == null ? '' : v + '×'; tiles[i].firstChild.dataset.big = v >= 100 ? '1' : v >= 40 ? '2' : ''; }
        }
        /* markers: yours always; everybody's once the picks lock */
        if (pick !== lastMine) { lastMine = pick; }
        const marks = {};
        if (t >= lock) for (const p of ctx.players()) if (p.hunt != null && p.id !== ctx.me) (marks[p.hunt] = marks[p.hunt] || []).push(p);
        for (let i = 0; i < N; i++) {
          const ps = marks[i], k = (i === pick ? 'me' : '') + (ps ? ps.map((p) => p.id).join(',') : '');
          if (k !== tmark[i]) { tmark[i] = k; tiles[i].lastChild.innerHTML = i === pick ? '<span class="me">YOU</span>' : ps ? B.avatar(ps[0].avatar, 20) + (ps.length > 1 ? '<b>+' + (ps.length - 1) + '</b>' : '') : ''; }
        }
        /* the words, the bolt, the sound */
        ctx.once('hu-cover', cover, t, (late) => { if (!late) snd.thud(); });
        if (t < cover) sh.setSub('108 tombs. Every one hides a prize. Remember where the big ones are…');
        else if (t < shuf) sh.setSub('The tombs close…');
        else if (t < aim) sh.setSub('…and the crypt shuffles!');
        else if (t < lock) sh.setSub(ctx.canPick() ? (mine != null ? 'Tomb chosen. Change your mind? ' : 'Tap a tomb! ') + Math.ceil(lock - t) : ctx.hasChip() ? 'Picking… ' + Math.ceil(lock - t) : 'You have no chip on Crypt Hunt: watching this one. ' + Math.ceil(lock - t));
        else if (t < fire) sh.setSub('Picks locked!');
        else sh.setSub('');
        ctx.once('hu-lock', lock, t, (late) => { if (!late) snd.close(); });
        if (t >= fire && t < fire + 0.6 && H.wall) { bolt.className = 'hu-bolt on'; if (pick != null) { bolt.style.left = home[pick][0] + 'px'; bolt.style.top = home[pick][1] + 'px'; } else { bolt.style.left = '400px'; bolt.style.top = '300px'; } }
        else if (bolt.className !== 'hu-bolt') bolt.className = 'hu-bolt';
        ctx.once('hu-fire', fire, t, (late) => { if (!late) { snd.zap(); B.audio.noise({ d: 1.6, v: 0.08, hp: 800, t: 0.3 }); } });
        if (H.wall && t >= fire + 2.6) {
          if (pick != null) { const v = H.wall[pick]; sh.setRes('YOUR TOMB', xTxt(Math.min(M.CAP, v * tsMult(R))), finalLine(R, v), 'green'); ctx.once('hu-res', fire + 2.6, t, (late) => { if (!late) snd.fanfare(); }); }
          else sh.setRes('BEST TOMB', xTxt(Math.min(M.CAP, H.best * tsMult(R))), finalLine(R, H.best), 'green');
        }
      },
      destroy() {},
    };
  }

  /* ---------- Drop Zone ---------- */
  const DZ = { rows: 13, y0: 132, dy: 24, x0: 80, pw: 40, pocketY: 470 };
  function dropPath(id, i, target) {
    /* 13 left/right bounces from a peg in row 0 to the target pocket; start x = 360 + 40·(target − rights) */
    const r = rngFor(id, 300 + i);
    for (let tries = 0; tries < 60; tries++) {
      const mv = []; let k = 0;
      for (let j = 0; j < DZ.rows; j++) { const m = r() < 0.5 ? 1 : -1; mv.push(m); if (m > 0) k++; }
      const sx = 360 + 40 * (target - k);
      if (sx >= 120 && sx <= 680) { const xs = [sx]; for (let j = 0; j < DZ.rows; j++) xs.push(xs[j] + mv[j] * 20); return xs; }
    }
    const k = Math.min(DZ.rows, target), xs = [360 + 40 * (target - k)];
    for (let j = 0; j < DZ.rows; j++) xs.push(xs[j] + (j < k ? 20 : -20));
    return xs;
  }
  function sceneDrop(ctx) {
    const sh = sceneShell('sc-drop', 'Drop Zone', 'drop');
    let pegs = '';
    const pegAt = [];
    for (let r = 0; r < DZ.rows; r++) {
      const y = DZ.y0 + r * DZ.dy, even = r % 2 === 0;
      for (let x = even ? 80 : 100; x <= (even ? 720 : 700); x += 40) { pegs += '<circle class="pg" id="bnpg-' + r + '-' + x + '" cx="' + x + '" cy="' + y + '" r="4.6"/>'; pegAt.push([r, x]); }
    }
    let walls = '';
    for (let j = 0; j <= 16; j++) walls += '<rect x="' + (78 + j * 40) + '" y="' + (DZ.pocketY - 22) + '" width="4" height="72" rx="2" fill="url(#bn-gold)"/>';
    const board = h('div', { class: 'dr-board', html: '<svg viewBox="0 0 800 560" aria-hidden="true"><defs><linearGradient id="bn-dr-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#062a4a"/><stop offset="1" stop-color="#020a18"/></linearGradient></defs>' +
      '<rect x="60" y="92" width="680" height="456" rx="22" fill="url(#bn-dr-bg)" stroke="url(#bn-gold)" stroke-width="5"/>' +
      '<g fill="#bff6ff">' + pegs + '</g>' + walls + '</svg>' });
    const pockets = [];
    const prow = h('div', { class: 'dr-pockets' });
    for (let j = 0; j < 16; j++) { const p = h('div', { class: 'dp' }, h('b')); p.style.left = (80 + j * 40) + 'px'; pockets.push(p); prow.append(p); }
    const puck = h('div', { class: 'dr-puck', html: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="url(#bn-puck)" stroke="#013a57" stroke-width="2"/><circle cx="20" cy="20" r="8" fill="none" stroke="#fff" stroke-width="2.5" opacity=".85"/><path d="M12 12a11 11 0 0 1 9-4" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' });
    const host = h('div', { class: 'bn-host dr-host', html: hostSvg() });
    const dcount = h('div', { class: 'dr-dbl' }, h('small', null, 'Board'), h('b', null, '1×'));
    sh.el.append(board, prow, host, puck, dcount);
    const paths = {}, hx = smoother(4);
    let lastBoard = '', lastPeg = null;
    const pathFor = (R, i) => { const tg = R.drop.drops[i]; const k = i + ':' + tg; return paths[k] || (paths[k] = dropPath(ctx.id, i, tg)); };
    /* the puck's position relative to its drop time */
    function puckAt(xs, s) {
      const REL = 1.3, FALL = 0.32, HOP = (k) => 0.26 - 0.006 * k, rowY = (r) => DZ.y0 + r * DZ.dy - 12;
      if (s < REL) return { x: xs[0], y: 72, held: true, rot: 0 };
      let u = s - REL;
      if (u < FALL) { const f = u / FALL; return { x: xs[0], y: lerp(72, rowY(0), f * f), rot: 0 }; }
      u -= FALL;
      for (let k = 0; k < DZ.rows - 1; k++) {
        const d = HOP(k);
        if (u < d) { const f = u / d; return { x: lerp(xs[k], xs[k + 1], smooth(f * 1.1)), y: lerp(rowY(k), rowY(k + 1), f) - 13 * 4 * f * (1 - f), rot: (k + f) * 70 * (xs[k + 1] > xs[k] ? 1 : -1), peg: k, pf: f }; }
        u -= d;
      }
      const lastX = xs[DZ.rows - 1], fx = xs[DZ.rows], d2 = 0.36;
      if (u < d2) { const f = u / d2; return { x: lerp(lastX, fx, smooth(f * 1.6)), y: lerp(rowY(DZ.rows - 1), DZ.pocketY + 26, f * f) - 10 * 4 * Math.min(1, f * 1.6) * (1 - Math.min(1, f * 1.6)), rot: 900, peg: DZ.rows - 1, pf: f }; }
      u -= d2;
      const b = Math.max(0, 1 - u / 0.4);
      return { x: fx, y: DZ.pocketY + 26 - 10 * b * Math.abs(Math.sin(u * 14)), rot: 900, landed: true };
    }
    return {
      el: sh.el,
      update(t, R) {
        const D = R.drop; if (!D) return;
        sh.setTs(R);
        const times = R.drops || [], lands = R.lands || [];
        /* which drop is on, and how many doubles have landed by now */
        let cur = -1, dbl = 0;
        for (let i = 0; i < times.length; i++) if (t >= times[i]) cur = i;
        for (let i = 0; i < D.drops.length; i++) if (lands[i] != null && t >= lands[i] && D.board[D.drops[i]] === 0) dbl++;
        const closed = dbl >= M.DROP_MAX_DOUBLES;
        /* the board */
        const bk = dbl + '|' + closed;
        if (bk !== lastBoard) {
          lastBoard = bk;
          for (let j = 0; j < 16; j++) { const v = D.board[j]; pockets[j].className = 'dp' + (v === 0 ? (closed ? ' closed' : ' dbl') : '') + (v >= 100 ? ' hi' : ''); pockets[j].firstChild.innerHTML = v === 0 ? (closed ? 'SHUT' : '2×<small>DOUBLE</small>') : fmt(v * Math.pow(2, dbl)) + '×'; }
          dcount.lastChild.textContent = Math.pow(2, dbl) + '×';
          dcount.classList.toggle('on', dbl > 0);
          if (dbl) { sh.el.classList.remove('dbl-flash'); void sh.el.offsetWidth; sh.el.classList.add('dbl-flash'); }
        }
        /* the puck */
        let hostX = 400, px = null;
        if (cur >= 0 && D.drops[cur] != null) {
          const xs = pathFor(R, cur), s = t - times[cur], p = puckAt(xs, s);
          const prevX = cur > 0 && D.drops[cur - 1] != null ? pathFor(R, cur - 1)[0] : 400;
          hostX = lerp(prevX, xs[0], easeInOut(s / 1.2));
          px = p;
          puck.style.transform = 'translate(' + (p.x - 17).toFixed(1) + 'px,' + (p.y - 17).toFixed(1) + 'px) rotate(' + (p.rot || 0).toFixed(0) + 'deg)';
          puck.classList.add('on');
          if (p.peg != null && p.peg !== lastPeg && p.pf < 0.2) {
            lastPeg = p.peg;
            const pg = board.querySelector('#bnpg-' + p.peg + '-' + xs[p.peg]);
            if (pg) { pg.classList.remove('hit'); pg.getBoundingClientRect(); pg.classList.add('hit'); }
            if (s - 1.3 < 6) snd.peg(p.peg);
          }
          if (p.held) lastPeg = null;
          ctx.once('dr-rel' + cur, times[cur] + 1.3, t, (late) => { if (!late) snd.whoosh(); });
          if (lands[cur] != null && t >= lands[cur]) {
            const j = D.drops[cur];
            pockets.forEach((pk, k) => pk.classList.toggle('land', k === j));
            ctx.once('dr-land' + cur, lands[cur], t, (late) => { if (!late) { if (D.board[j] === 0) snd.dbl(); else { snd.ding(); snd.fanfare(); } } });
          } else pockets.forEach((pk) => pk.classList.remove('land'));
        } else { puck.classList.remove('on'); }
        if (cur >= 0 && D.drops[cur] == null) hostX = cur > 0 && D.drops[cur - 1] != null ? pathFor(R, cur - 1)[0] : 400;
        const hxv = hx(hostX, cur + ':' + (D.drops[cur] != null), t);
        host.style.transform = 'translate(' + (hxv - 60).toFixed(1) + 'px, 0) scale(.5)';
        host.classList.toggle('carry', !!(px && px.held) || cur < 0);
        /* words */
        const lastLanded = cur >= 0 && lands[cur] != null && t >= lands[cur];
        if (cur < 0) sh.setSub('Sixteen pockets, two of them DOUBLE. Bertie takes the puck up…');
        else if (!lastLanded) sh.setSub(cur ? 'DOUBLE! Every prize doubled. Drop again!' : 'Here it comes!');
        else if (D.board[D.drops[cur]] === 0 && D.x == null) sh.setSub('DOUBLE!');
        else sh.setSub('');
        if (D.x != null && lands.length === D.drops.length && t >= lands[lands.length - 1]) {
          const base = D.x;
          sh.setRes(dbl ? 'DOUBLED ' + dbl + (dbl > 1 ? ' TIMES' : ' TIME') : 'DROP ZONE PAYS', xTxt(Math.min(M.CAP, base * tsMult(R))), finalLine(R, base), 'cyan');
        } else sh.setRes('', '', '', '');
      },
      destroy() {},
    };
  }

  /* ---------- BONKERS TIME ---------- */
  function sceneBonkers(ctx) {
    const sh = sceneShell('sc-bonk', 'BONKERS TIME', 'bonkers');
    const WR = 205, WX = 400, WY = 350;
    const rays = h('i', { class: 'bk-rays' });
    const wheelBox = h('div', { class: 'bk-wheel' });
    const cv = h('canvas', { class: 'bk-face' });
    const hub = h('div', { class: 'bk-hub', html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="url(#bn-gold)"/><circle cx="50" cy="50" r="38" fill="#2a0a18"/><path d="' + BATP + '" transform="translate(26 40) scale(.4)" fill="#ffd23a"/></svg>' });
    wheelBox.append(cv);
    const fl = [], av = [], rb = [];
    const POS = [[WX - WR - 6, WY, 90], [WX, WY - WR - 6, 180], [WX + WR + 6, WY, -90]];   // left, top, right: rotation so the tip points at the hub
    for (let k = 0; k < 3; k++) {
      const f = h('div', { class: 'bk-fl k' + k, html: '<svg viewBox="0 0 40 60"><path d="M20 58L6 14a14 14 0 1 1 28 0z" fill="' + FLAP_COL[k] + '" stroke="#1a0618" stroke-width="3"/><circle cx="20" cy="14" r="6" fill="#fff" opacity=".8"/></svg>' });
      f.style.left = POS[k][0] + 'px'; f.style.top = POS[k][1] + 'px';
      fl.push(f);
      const a = h('div', { class: 'bk-av k' + k }); av.push(a);
      const r = h('div', { class: 'bk-rb k' + k }, h('small', null, FLAP_NAME[k]), h('b', null, ''), h('i'));
      rb.push(r);
    }
    const picks = h('div', { class: 'bk-picks' });
    const pb = [0, 1, 2].map((k) => { const b = h('button', { type: 'button', class: 'bk-pb k' + k, 'aria-label': 'Back the ' + FLAP_NAME[k].toLowerCase() + ' flapper' }, h('i'), h('b', null, FLAP_NAME[k])); b.onclick = () => ctx.pick(k); b.onpointerdown = (e) => e.preventDefault(); picks.append(b); return b; });
    sh.el.append(rays, wheelBox, hub, ...fl, ...av, ...rb, picks);
    let baked = 0;
    const bake = () => { const px = Math.min(1400, Math.round(WR * 2 * Math.max(1, ctx.scale() * (window.devicePixelRatio || 1)))); if (Math.abs(px - baked) > 40) { baked = px; drawBigFace(cv, px); } };
    bake();
    const ang = smoother(5, true), a0 = -(rngFor(ctx.id, 9)() * 64) * BSEG;
    const jit = (i) => (rngFor(ctx.id, 40 + i)() - 0.5) * 0.6;
    const flap = [0, 0, 0], lastIdx = [null, null, null];
    let lastAv = '', shownRes = ['', '', ''], prevA = null;
    function model(t, R) {
      const S = R.bonkers ? R.bonkers.spins : [], st = R.spins || [], so = R.stops || [];
      let a = a0, key = 'rest';
      for (let i = 0; i < st.length; i++) {
        if (t < st[i]) break;
        const known = S[i] != null, tg = known ? -(S[i].r + jit(i)) * BSEG : a + Math.PI;
        const D = mod(tg - a, TAU) + TAU * 2, u = (t - st[i]) / (so[i] - st[i]);
        if (u >= 1) { a = a + D; key = 'r' + i + known; continue; }
        a = a + D * spinCurve(u, 0.1, 3); key = 's' + i + known;
        break;
      }
      return { a, key };
    }
    return {
      el: sh.el,
      update(t, R, dt) {
        bake();
        sh.setTs(R);
        const S = R.bonkers ? R.bonkers.spins : [], st = R.spins || [], so = R.stops || [];
        const m = model(t, R), a = ang(m.a, m.key, t);
        const v = prevA == null ? 0 : Math.abs(wrapPi(a - prevA)) / Math.max(0.001, dt || 0.016); prevA = a;
        wheelBox.style.transform = 'rotate(' + mod(a, TAU).toFixed(4) + 'rad)';
        rays.style.opacity = (0.35 + Math.min(0.5, v * 0.05)).toFixed(2);
        /* the flappers: a peg passing under each one bends it */
        for (let k = 0; k < 3; k++) {
          const rel = (M.FLAPPERS[k] * BSEG - a) / BSEG, idx = Math.round(rel), s = mod(rel - 0.5, 1);
          if (lastIdx[k] !== null && idx !== lastIdx[k] && k === 1 && v > 0.05) snd.tick(clamp(v / 6, 0, 1));
          lastIdx[k] = idx;
          const target = s > 0.78 ? (s - 0.78) / 0.22 : 0;
          flap[k] += (target - flap[k]) * (target > flap[k] ? 1 : 1 - Math.exp(-(dt || 0.016) * 22));
          fl[k].style.transform = 'translate(-50%,-80%) rotate(' + (POS[k][2] + flap[k] * 28 * (v > 0.02 ? 1 : 0.3)).toFixed(1) + 'deg)';
        }
        /* who backs which flapper */
        const groups = [[], [], []];
        for (const p of ctx.players()) if (p.flapper != null && p.id !== ctx.me) groups[p.flapper].push(p);
        const mineF = ctx.myPick('flapper');
        const ak = groups.map((g) => g.map((p) => p.id).join(',')).join('|') + '|' + mineF;
        if (ak !== lastAv) {
          lastAv = ak;
          for (let k = 0; k < 3; k++) av[k].innerHTML = (mineF === k ? '<span class="me">YOU</span>' : '') + groups[k].slice(0, 5).map((p) => B.avatar(p.avatar, 26)).join('') + (groups[k].length > 5 ? '<b>+' + (groups[k].length - 5) + '</b>' : '') + (!groups[k].length && mineF !== k ? '<em>' + FLAP_NAME[k] + '</em>' : '');
          for (let k = 0; k < 3; k++) { fl[k].classList.toggle('mine', mineF === k); rb[k].classList.toggle('mine', mineF === k); pb[k].classList.toggle('on', mineF === k); }
        }
        /* picking */
        const canPick = ctx.canPick() && t < R.lock;
        picks.classList.toggle('on', canPick);
        if (t < R.lock) sh.setSub(ctx.canPick() ? (mineF != null ? FLAP_NAME[mineF] + ' it is! Change? ' : 'Choose your flapper! ') + Math.ceil(R.lock - t) : ctx.hasChip() ? 'Choosing… ' + Math.ceil(R.lock - t) : 'No chip on BONKERS TIME: enjoy the show! ' + Math.ceil(R.lock - t));
        ctx.once('bk-lock', R.lock, t, (late) => { if (!late) snd.close(); });
        /* each flapper's story so far */
        let done = 0;
        for (let i = 0; i < st.length; i++) if (so[i] != null && t >= so[i] && S[i]) done = i + 1;
        let spinning = false;
        for (let i = 0; i < st.length; i++) if (t >= st[i] && t < so[i]) spinning = true;
        for (let k = 0; k < 3; k++) {
          let txt = '', note = '', cls = '';
          let fac = 1, res = null;
          for (let i = 0; i < done; i++) {
            const hit = S[i].hit[k];
            if (hit == null) continue;
            if (typeof hit === 'number') { res = hit * fac; note = hit + '× × ' + fac; }
            else fac *= hit === 'D' ? 2 : 3;
          }
          if (res != null) { txt = xTxt(res); cls = 'bank'; if (fac === 1) note = ''; }
          else if (fac > 1) { txt = fac + '×'; note = 'riding'; cls = 'ride'; }
          else txt = done ? '' : '';
          const key = txt + note + cls;
          if (key !== shownRes[k]) { shownRes[k] = key; rb[k].children[1].textContent = txt || '—'; rb[k].children[2].textContent = note; rb[k].className = 'bk-rb k' + k + (cls ? ' ' + cls : '') + (mineF === k ? ' mine' : ''); }
        }
        for (let i = 0; i < st.length; i++) {
          ctx.once('bk-spin' + i, st[i], t, (late) => { if (!late) { snd.whoosh(); snd.drum(30); } });
          if (S[i]) ctx.once('bk-stop' + i, so[i], t, (late) => { if (late) return; const sp = S[i].hit.some((x) => x === 'D' || x === 'T'); if (sp) snd.dbl(); else snd.ding(); });
        }
        if (t >= R.lock) {
          if (spinning) sh.setSub(done ? 'Re-spin! Multipliers riding…' : 'Spin!');
          else if (done && R.bonkers && R.bonkers.res && done === S.length) sh.setSub('');
          else if (done) sh.setSub('DOUBLE or TRIPLE! Spin again!');
          else sh.setSub('Hold on to your wings…');
        }
        if (R.bonkers && R.bonkers.res && done === (R.spins || []).length && done > 0) {
          const k = mineF != null ? mineF : 1, base = R.bonkers.res[k];
          sh.setRes(mineF != null ? 'YOUR FLAPPER · ' + FLAP_NAME[k].toUpperCase() : 'BLUE FLAPPER', xTxt(Math.min(M.CAP, base * tsMult(R))), finalLine(R, base), 'gold');
          ctx.once('bk-res', so[so.length - 1] + 0.8, t, (late) => { if (!late) snd.fanfare(); });
        } else sh.setRes('', '', '', '');
      },
      destroy() {},
    };
  }
  const SCENES = { flap: sceneFlap, hunt: sceneHunt, drop: sceneDrop, bonkers: sceneBonkers };

  /* ============================== the studio ============================== */
  let S = null, G = null;
  const mem = { chip: 2, last: null, hist: [] };
  try { Object.assign(mem, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh */ }
  const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* memory only */ } };
  /* the complete round, as the director wants it (practice mode knows everything up front) */
  function fullView(o, p, id) {
    const R = Object.assign({ id, seg: o.seg, spot: o.spot, ts: o.ts }, p);
    if (o.flap) R.flap = o.flap;
    if (o.hunt) R.hunt = { show: o.hunt.wall.slice().sort((a, b) => b - a), wall: o.hunt.wall, best: o.hunt.best };
    if (o.drop) R.drop = o.drop;
    if (o.bonkers) R.bonkers = o.bonkers;
    return R;
  }
  function phaseOf(R, t) {
    if (t < R.close) return 'bet';
    if (R.result == null || t < R.result) return 'spin';
    if (!M.isBonus(R.spot)) return R.pay == null || t < R.pay ? 'result' : 'board';
    if (R.bonus == null || t < R.bonus) return 'intro';
    if (R.pay == null || t < R.pay) return 'bonus';
    return 'board';
  }
  const restAngleOf = (id, seg) => -(seg + (rngFor(id, 77)() - 0.5) * 0.6) * SEG;

  function mount(root) {
    S = B.scope();
    const live = B.online;
    let devOn = false; try { devOn = !live && localStorage.getItem('batty-dev') === '1'; } catch (e) { /* off */ }
    const dev = devOn ? (window.__bonkersDev = { force: null, tsHit: 0, speed: 1, rounds: 0, staked: 0, won: 0, last: null }) : null;
    const g = { bets: {}, undo: [], dead: false, lastWin: 0, sRounds: 0, sStaked: 0, sWon: 0 };
    const L = { st: null, off: null, best: 1e9, age: 0, polling: false, sending: false, dirty: false, seq: 0, confirmed: {}, confTotal: 0, hist: [], hv: '', settled: [], paid: new Set(), picks: {}, mine: null, lastPoll: 0, keyT: 0 };
    const P = { o: null, bets: {}, picks: {}, clock: Date.now() / 1000, hist: (Array.isArray(mem.hist) ? mem.hist : []).slice(0, 100) };
    P.id = P.hist.length ? P.hist[0].id : 0;
    let R = null, RID = 0, fired = new Set(), scene = null;
    const nowS = () => (live ? Date.now() / 1000 + (L.off || 0) : P.clock);
    const myId = () => (B.me && B.me.id) || -1;
    const hist = () => (live ? L.hist : P.hist);

    /* ---------- DOM ---------- */
    root.innerHTML = DEFS;
    const el = {};
    const room = h('div', { class: 'bn-room', html: studioSvg() });
    const stage = h('div', { class: 'bn-stage' });
    room.append(stage);
    el.desk = h('div', { class: 'bn-desk', 'aria-hidden': 'true' });
    /* the wheel */
    let bulbs = '';
    for (let i = 0; i < 54; i++) { const a = (i / 54) * TAU; bulbs += '<circle class="b' + (i % 2) + '" cx="' + (100 * Math.cos(a)).toFixed(2) + '" cy="' + (100 * Math.sin(a)).toFixed(2) + '" r="2.1"/>'; }
    el.wheel = h('div', { class: 'bn-wheel', 'aria-hidden': 'true' });
    el.lights = h('div', { class: 'bn-wlights', html: '<svg viewBox="-106 -106 212 212"><circle r="104" fill="none" stroke="url(#bn-gold)" stroke-width="5"/><circle r="100" fill="#1a0638"/>' + bulbs + '</svg>' });
    el.face = h('canvas', { class: 'bn-face' });
    el.blur = h('i', { class: 'bn-blur' });
    el.land = h('i', { class: 'bn-landg' });
    el.hub = h('div', { class: 'bn-hub', html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="url(#bn-gold)"/><circle cx="50" cy="50" r="40" fill="#1a0638"/><circle cx="50" cy="50" r="40" fill="none" stroke="#ff58b9" stroke-width="2" stroke-dasharray="2 5"/><path d="' + BATP + '" transform="translate(23 30) scale(.45)" fill="url(#bn-gold)"/><text x="50" y="72" text-anchor="middle" font-family="Bungee,Impact,sans-serif" font-size="11" fill="#ffd23a">BONKERS</text></svg>' });
    el.ptr = h('div', { class: 'bn-ptr', html: '<svg viewBox="0 0 60 90"><path d="M30 86L8 26a22 22 0 1 1 44 0z" fill="url(#bn-gold)" stroke="#4a2600" stroke-width="3"/><path d="M30 72L16 28a14 14 0 1 1 28 0z" fill="#ff2d8a"/><circle cx="30" cy="24" r="7" fill="#fff6c2"/></svg>' });
    el.wheel.append(el.lights, el.face, el.blur, el.land, el.hub, el.ptr);
    /* Top Slot */
    const IH = 60;
    const reel = (items) => { const s = h('div', { class: 'strip' }); for (let c = 0; c < 3; c++) items.forEach((x) => s.append(h('div', { class: 'it', html: x }))); return s; };
    el.stripL = reel(M.TS_STRIP.map((s) => badge(s))); el.stripR = reel(M.TS_MULTS.map((m) => '<b>' + m + '×</b>'));
    el.ts = h('div', { class: 'bn-ts', 'aria-hidden': 'true' }, h('small', null, 'TOP SLOT'), h('div', { class: 'tsw l' }, el.stripL), h('div', { class: 'tsw r' }, el.stripR), h('i', { class: 'tsline' }));
    /* Bertie */
    el.host = h('div', { class: 'bn-host main', html: hostSvg(), 'aria-hidden': 'true' });
    el.say = h('div', { class: 'bn-say', 'aria-hidden': 'true' });
    el.host.append(el.say);
    /* timer, history, rail, side */
    el.timer = h('div', { class: 'bn-timer', hidden: true, html: '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="t"/><circle cx="22" cy="22" r="19" class="v"/></svg><b></b><small>BETS</small>' });
    el.hist = h('div', { class: 'bn-hist', 'aria-label': 'Recent results' });
    el.rail = h('div', { class: 'bn-rail' });
    el.side = h('div', { class: 'bn-side' });
    /* the show area: calls, intro, scene, win, winners board */
    el.show = h('div', { class: 'bn-show' });
    el.call = h('div', { class: 'bn-call', 'aria-hidden': 'true' });
    el.intro = h('div', { class: 'bn-intro', 'aria-hidden': 'true' });
    el.scene = h('div', { class: 'bn-scene' });
    el.winB = h('div', { class: 'bn-winb', 'aria-hidden': 'true' }, h('small', null, 'YOU WIN'), h('b'), h('i'));
    el.board = h('div', { class: 'bn-board', 'aria-hidden': 'true' });
    el.show.append(el.scene, el.call, el.intro, el.board, el.winB);
    /* the betting desk */
    el.spots = h('div', { class: 'bn-spots', role: 'group', 'aria-label': 'Bet spots' });
    const tile = {};
    M.SPOTS.forEach((s) => {
      const t = h('button', { type: 'button', class: 'bn-spot s-' + s, 'aria-label': NAME(s) + ': ' + SP[s].pays },
        h('span', { class: 'ic', html: icon(s) }), h('b', { class: 'nm' }, M.NUMBERS[s] ? '' : NAME(s)), h('small', { class: 'py' }, SP[s].pays),
        h('span', { class: 'stk' }), h('span', { class: 'ppl' }), h('em', { class: 'tsb' }));
      t.onclick = () => placeChip(s);
      t.oncontextmenu = (e) => { e.preventDefault(); takeChip(s); };
      tile[s] = t; el.spots.append(t);
    });
    el.msg = h('div', { class: 'bn-msg', role: 'status', 'aria-live': 'polite' }, h('span'));
    el.total = h('output', null, '0'); el.win = h('output', null, '0'); el.bal = h('output', null, '');
    el.info = h('div', { class: 'bn-info' }, el.msg, h('span', { class: 'it' }, h('small', null, 'Total bet'), el.total), h('span', { class: 'it w' }, h('small', null, 'Last win'), el.win));
    el.chips = h('div', { class: 'bn-chips', role: 'radiogroup', 'aria-label': 'Chip value' });
    CHIPS.forEach((v, i) => el.chips.append(h('button', { type: 'button', class: 'bn-chip', role: 'radio', 'aria-label': fmt(v) + ' BB chip', html: chipSvg(v), onclick: () => { mem.chip = i; saveMem(); paintChips(); snd.click(); } })));
    const ICON = {
      undo: '<svg viewBox="0 0 24 24"><path d="M9 4L4 9l5 5M4 9h11a5 5 0 0 1 0 10h-3" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      clear: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
      x2: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="13" fill="currentColor">×2</text></svg>',
      rebet: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      stats: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    };
    const btn = (cls, label, ic, fn) => h('button', { type: 'button', class: 'bn-btn ' + cls, 'aria-label': label, title: label, onclick: fn }, h('span', { class: 'ic', html: ic }), h('span', { class: 'lb' }, label.split(' ')[0]));
    el.undoB = btn('undo', 'Undo', ICON.undo, () => undo());
    el.clearB = btn('clear', 'Clear bets', ICON.clear, () => clearBets());
    el.x2B = btn('x2', 'Double bets', ICON.x2, () => doubleBets());
    el.rebetB = btn('rebet', 'Rebet', ICON.rebet, () => rebet());
    el.statsB = btn('statsb', 'Stats', ICON.stats, () => showStats());
    el.acts = h('div', { class: 'bn-acts' }, el.undoB, el.clearB, el.x2B, el.rebetB, el.statsB);
    el.spinB = h('button', { type: 'button', class: 'bn-spin', 'aria-label': live ? 'Round status' : 'Spin' }, h('b', null, live ? '…' : 'SPIN'), h('small', null, ''));
    el.spinB.onclick = () => { if (!live) practiceSpin(); };
    el.go = h('div', { class: 'bn-go' }, el.spinB);
    stage.append(el.wheel, el.host, el.ts, el.hist, el.rail, el.side, el.show, el.desk, el.spots, el.info, el.chips, el.acts, el.go, el.timer);
    root.append(room);
    root.classList.add(live ? 'bn-live' : 'bn-practice');

    /* ---------- layout ---------- */
    let C = null, SC = 1, SCS = 1, faceBaked = 0, faceA = null;
    const faceImg = document.createElement('canvas'), fctx = el.face.getContext('2d');
    const place = (e, r) => { e.style.left = r[0] + 'px'; e.style.top = r[1] + 'px'; e.style.width = r[2] + 'px'; e.style.height = r[3] + 'px'; };
    const DESK = { wide: [0, 486, 1280, 234], tall: [0, 896, 720, 544], compact: [704, 0, 696, 580] };
    function bakeFace() {
      const px = Math.min(1600, Math.round(C.wheel[2] * 2 * 0.9 * SC * Math.min(2, window.devicePixelRatio || 1)));
      if (Math.abs(px - faceBaked) > 30) { faceBaked = px; drawMoneyFace(faceImg, px); el.face.width = el.face.height = px; faceA = null; }
    }
    function applyLayout(c) {
      C = c; root.dataset.lay = c.name;
      stage.style.width = c.W + 'px'; stage.style.height = c.H + 'px';
      place(el.hist, c.hist); place(el.rail, c.rail); place(el.desk, DESK[c.name]);
      if (c.side) { el.side.hidden = false; place(el.side, c.side); } else el.side.hidden = true;
      const w = c.wheel;
      place(el.wheel, [w[0] - w[2], w[1] - w[2], w[2] * 2, w[2] * 2]);
      el.ts.style.left = c.ts[0] + 'px'; el.ts.style.top = c.ts[1] + 'px';
      el.host.style.left = c.host[0] + 'px'; el.host.style.top = c.host[1] + 'px'; el.host.style.setProperty('--hs', c.host[2]);
      el.timer.style.left = c.timer[0] + 'px'; el.timer.style.top = c.timer[1] + 'px';
      place(el.spots, c.spots); el.spots.style.setProperty('--cols', c.spotCols);
      place(el.info, c.info); place(el.chips, c.chips); place(el.acts, c.acts); place(el.go, c.go);
      place(el.show, c.show);
      faceBaked = 0;
      paintHist(); paintRail();
    }
    function layout() {
      const vw = room.clientWidth, vh = room.clientHeight; if (!vw || !vh) return;
      const want = vh < 500 && vw > vh * 1.4 ? LAY.compact : vw / vh < 1.02 ? LAY.tall : LAY.wide;
      if (want !== C) applyLayout(want);
      SC = Math.min(vw / C.W, vh / C.H);
      const left = (vw - C.W * SC) / 2, top = C === LAY.tall ? Math.max(0, (vh - C.H * SC) * 0.3) : (vh - C.H * SC) / 2;
      stage.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px) scale(' + SC.toFixed(4) + ')';
      const sh = C.show; SCS = Math.min(sh[2] / SW, sh[3] / SH);
      el.scene.style.transform = 'translate(' + ((sh[2] - SW * SCS) / 2).toFixed(1) + 'px,' + ((sh[3] - SH * SCS) / 2).toFixed(1) + 'px) scale(' + SCS.toFixed(4) + ')';
      bakeFace();
    }
    const ro = new ResizeObserver(() => layout());
    ro.observe(room);
    S.on(room, 'scroll', () => { room.scrollTop = 0; room.scrollLeft = 0; });
    S.on(root, 'scroll', () => { root.scrollTop = 0; root.scrollLeft = 0; });
    if (document.fonts && document.fonts.load) document.fonts.load('20px Bungee').then(() => { faceBaked = 0; if (C) bakeFace(); }).catch(() => {});

    /* ---------- little helpers ---------- */
    let msgT = '';
    function msg(t) { if (t !== msgT) { msgT = t; el.msg.firstChild.textContent = t; } }
    let sayT = 0;
    function say(txt, ms, mood) {
      el.say.textContent = txt; el.say.classList.add('on');
      el.host.classList.remove('talk', 'cheer', 'push'); void el.host.offsetWidth; el.host.classList.add(mood || 'talk');
      S.clear(sayT); sayT = S.timeout(() => { el.say.classList.remove('on'); el.host.classList.remove('talk', 'cheer', 'push'); }, ms || 2200);
    }
    let callT = 0;
    function call(html, cls, ms) {
      el.call.innerHTML = html; el.call.className = 'bn-call on ' + (cls || '');
      S.clear(callT); callT = S.timeout(() => { el.call.className = 'bn-call'; }, ms || 1600);
    }
    function bump(e) { if (!e) return; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
    function once(k, at, t, fn) { if (at == null || t < at || fired.has(k)) return; fired.add(k); try { fn(t - at > 1.5); } catch (e) { console.error(e); } }

    /* ---------- painting the desk ---------- */
    function paintChips() { [...el.chips.children].forEach((b, i) => { b.classList.toggle('on', i === mem.chip); b.setAttribute('aria-checked', i === mem.chip ? 'true' : 'false'); }); }
    function rideBets() { return live ? (L.mine && R && L.st && L.st.round.id === R.id ? L.mine.bets || {} : {}) : P.bets; }
    function shownBets() { if (!R) return g.bets; const t = nowS(); return t < R.close ? g.bets : rideBets(); }
    let lastPaint = '';
    function paintBets(force) {
      const b = shownBets(), key = JSON.stringify(b) + (R ? R.id : 0);
      if (!force && key === lastPaint) return; lastPaint = key;
      for (const s of M.SPOTS) {
        const v = b[s] || 0, st = tile[s].querySelector('.stk');
        st.innerHTML = v ? chipSvg(CHIPS.slice().reverse().find((c) => c <= v) || 10, abbr(v)) : '';
        tile[s].classList.toggle('has', v > 0);
      }
      el.total.textContent = fmt(totalOf(b));
      controls();
    }
    function controls() {
      const ed = canEdit(), has = totalOf(g.bets) > 0;
      el.undoB.disabled = !ed || !g.undo.length; el.clearB.disabled = !ed || !has; el.x2B.disabled = !ed || !has;
      el.rebetB.disabled = !ed || !mem.last || !totalOf(mem.last);
      el.spots.classList.toggle('locked', !ed);
      if (!live) { el.spinB.disabled = !!P.o || g.dead; el.spinB.firstChild.textContent = P.o ? '…' : 'SPIN'; el.spinB.lastChild.textContent = P.o ? '' : has ? fmt(totalOf(g.bets)) + ' BB' : 'or watch'; }
    }
    function canEdit() { if (g.dead) return false; if (live) return !!(R && L.off != null && nowS() < R.close - 0.6); return !P.o; }
    function affordable(nb) { const extra = totalOf(nb) - (live ? L.confTotal : 0); return extra <= B.wallet.balance; }
    function setBets(nb) { g.undo.push(clone(g.bets)); if (g.undo.length > 60) g.undo.shift(); g.bets = nb; paintBets(true); queueSend(); }
    function placeChip(s) {
      if (!canEdit()) { if (live && R) msg(nowS() >= R.close - 0.6 ? 'No more bets: wait for the next round.' : ''); return; }
      const v = CHIPS[mem.chip], nb = clone(g.bets); nb[s] = (nb[s] || 0) + v;
      if (nb[s] > M.SPOT_MAX) { B.ui.toast('That spot is at its ' + fmt(M.SPOT_MAX) + ' BB limit.'); return; }
      if (totalOf(nb) > M.TABLE_MAX) { B.ui.toast('The table limit is ' + fmt(M.TABLE_MAX) + ' BB a round.'); return; }
      if (!affordable(nb)) { B.ui.broke(); return; }
      setBets(nb); snd.chip(); bump(tile[s]);
    }
    function takeChip(s) {
      if (!canEdit() || !g.bets[s]) return;
      const nb = clone(g.bets), v = CHIPS[mem.chip]; nb[s] -= Math.min(nb[s], v); if (nb[s] <= 0) delete nb[s];
      setBets(nb); snd.click();
    }
    function undo() { if (!canEdit() || !g.undo.length) return; g.bets = g.undo.pop(); paintBets(true); queueSend(); snd.click(); }
    function clearBets() { if (!canEdit() || !totalOf(g.bets)) return; setBets({}); snd.click(); }
    function doubleBets() {
      if (!canEdit() || !totalOf(g.bets)) return;
      const nb = {}; for (const k in g.bets) nb[k] = Math.min(M.SPOT_MAX, g.bets[k] * 2);
      if (totalOf(nb) > M.TABLE_MAX) { B.ui.toast('The table limit is ' + fmt(M.TABLE_MAX) + ' BB a round.'); return; }
      if (!affordable(nb)) { B.ui.broke(); return; }
      setBets(nb); snd.chip();
    }
    function rebet() {
      if (!canEdit() || !mem.last) return;
      const nb = {}; for (const k in mem.last) if (M.SPOTS.indexOf(k) > -1 && mem.last[k] > 0) nb[k] = mem.last[k];
      if (M.validBets(nb)) return;
      if (!affordable(nb)) { B.ui.broke(); return; }
      setBets(nb); snd.chip();
    }

    /* ---------- history, rail, stats, winners ---------- */
    let histKey = '';
    function paintHist() {
      const H = hist(), n = C ? (C.name === 'wide' ? 15 : C.name === 'tall' ? 10 : 10) : 10, k = H.slice(0, n).map((e) => e.id + (e.x != null ? 'x' : '')).join(',') + (C ? C.name : '');
      if (k === histKey) return; histKey = k;
      el.hist.innerHTML = '<small>LAST</small>' + H.slice(0, n).map((e, i) => '<span class="hh' + (i === 0 ? ' new' : '') + (e.ts === e.s ? ' ts' : '') + '" title="' + esc(NAME(e.s)) + '">' + badge(e.s) + (e.x != null && (M.isBonus(e.s) || e.ts === e.s) ? '<em>' + fmt(e.x) + '×</em>' : '') + '</span>').join('');
    }
    let railKey = '';
    function paintRail() {
      const me = myId();
      let list = [];
      if (live && L.st && R && L.st.round.id === R.id) list = L.st.players || [];
      const k = JSON.stringify(list.map((p) => [p.id, p.total, p.win])) + (g.sRounds || 0) + (L.st ? L.st.watching + ':' + L.st.inRound : '') + (C ? C.name : '');
      if (k === railKey) return; railKey = k;
      if (!live) {
        const tip = (s, txt) => '<div class="tip">' + badge(s) + '<span>' + txt + '</span></div>';
        el.rail.innerHTML = '<div class="rh"><b>Practice studio</b><small>' + (g.sRounds ? fmt(g.sRounds) + (g.sRounds === 1 ? ' round · ' : ' rounds · ') + (g.sWon - g.sStaked >= 0 ? '+' : '−') + fmt(Math.abs(g.sWon - g.sStaked)) + ' BB' : 'Online, everyone plays one live show') + '</small></div>' +
          '<div class="tips">' + tip('2', 'Numbers pay their face value, chip back.') + tip('flap', 'Coin Flap: red or blue multiplier.') + tip('hunt', 'Crypt Hunt: pick one of 108 tombs.') + tip('drop', 'Drop Zone: puck, pegs, DOUBLEs.') + tip('bonkers', 'BONKERS TIME: back a flapper.') + '</div>';
        return;
      }
      const head = '<div class="rh"><b>In the studio</b><small>' + (L.st ? fmt(L.st.watching || 1) + ' watching · ' + fmt(L.st.inRound || 0) + ' betting' : '') + '</small></div>';
      el.rail.innerHTML = head + '<div class="rl">' + (list.length ? list.slice(0, C && C.name === 'wide' ? 9 : 12).map((p) => '<div class="p' + (p.id === me ? ' me' : '') + (p.win > 0 ? ' up' : '') + '">' + B.avatar(p.avatar, 30) + '<b>' + (p.id === me ? 'You' : esc(p.name)) + '</b><small>' + fmt(p.total) + ' · ' + p.spots.slice(0, 4).map((s) => '<i class="d s-' + s + '"></i>').join('') + '</small>' + (p.win != null ? '<em>' + (p.win > 0 ? '+' + fmt(p.win) : '–') + '</em>' : '') + '</div>').join('') : '<div class="none">No chips down yet. Be the first!</div>') + '</div>';
    }
    function statCounts() { const H = hist().slice(0, 100), c = {}; M.SPOTS.forEach((s) => { c[s] = 0; }); H.forEach((e) => { c[e.s]++; }); return { c, n: H.length }; }
    let sideKey = '';
    function paintSide() {
      if (!C || !C.side) return;
      const { c, n } = statCounts(), wn = live && L.st && L.st.winners;
      const k = JSON.stringify(c) + n + (wn ? wn.round + ':' + wn.list.length : '');
      if (k === sideKey) return; sideKey = k;
      const max = Math.max(1, ...M.SPOTS.map((s) => c[s]));
      el.side.innerHTML = '<div class="sh"><b>Stats</b><small>last ' + n + ' spins</small></div><div class="bars">' + M.SPOTS.map((s) => '<div class="bar">' + badge(s) + '<i><u style="width:' + (c[s] / max * 100).toFixed(0) + '%"></u></i><b>' + c[s] + '</b></div>').join('') + '</div>' +
        (wn && wn.list ? '<div class="sh"><b>Last winners</b><small>' + esc(NAME(wn.spot)) + '</small></div><div class="wl">' + (wn.list.length ? wn.list.slice(0, 4).map((w) => '<span>' + B.avatar(w.avatar, 20) + '<b>' + esc(w.name) + '</b><em>+' + fmt(w.win) + '</em></span>').join('') : '<span class="none">No winners</span>') + '</div>' : '');
    }
    function showStats() {
      const { c, n } = statCounts(), max = Math.max(1, ...M.SPOTS.map((s) => c[s]));
      const H = hist(); let since = H.findIndex((e) => M.isBonus(e.s));
      const row = (s) => '<div style="display:grid;grid-template-columns:30px 1fr 2fr 28px;gap:8px;align-items:center;margin:6px 0">' + badge(s).replace('class="bn-badge', 'style="display:block;width:30px;height:30px" class="bn-badge') + '<b>' + esc(NAME(s)) + '</b><i style="display:block;height:9px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden"><u style="display:block;height:100%;background:linear-gradient(90deg,#ff2d8a,#ffcf3f);width:' + (c[s] / max * 100).toFixed(0) + '%"></u></i><b style="text-align:right">' + c[s] + '</b></div>';
      B.ui.modal('Bonkers Time stats', '<div><p>The last ' + n + ' spins' + (since >= 0 ? '; the last bonus was ' + (since ? since + ' spins ago' : 'the latest spin') : '') + '. Expected shares: 1 in 38.9%, 2 in 24.1%, 5 in 13.0%, 10 in 7.4%, Coin Flap 7.4%, Crypt Hunt and Drop Zone 3.7% each, BONKERS TIME 1.9%.</p>' + M.SPOTS.map(row).join('') + '</div>');
    }

    /* ---------- the wheel and the Top Slot, from the clock ---------- */
    const wAng = smoother(6, true), tsLs = smoother(8), tsRs = smoother(8);
    let prevWA = null, wVel = 0, flapV = 0, lastIdx = null, lastTick = 0;
    function prevEntry(id) { for (const e of hist()) if (e.id < id && e.g != null) return e; return null; }
    function wheelModel(t) {
      if (!R) { const e = hist()[0]; return { a: e && e.g != null ? restAngleOf(e.id, e.g) : 0, key: 'idle' }; }
      const pe = prevEntry(R.id), a0 = pe ? restAngleOf(pe.id, pe.g) : -(rngFor(R.id, 5)() * 54) * SEG;
      const spinAt = R.spinAt != null ? R.spinAt : R.close + M.TIME.SPIN_AT, res = R.result != null ? R.result : spinAt + M.TIME.SPIN;
      if (t < spinAt) return { a: a0, key: 'rest' };
      const known = R.seg != null, tg = known ? restAngleOf(R.id, R.seg) : a0 + 2;
      const D = mod(tg - a0, TAU) + TAU * 3, u = (t - spinAt) / (res - spinAt), ov = 0.11 * SEG;
      if (u >= 1) return { a: a0 + D, key: 'd' + R.id + known };
      return { a: u < 0.93 ? a0 + (D + ov) * spinCurve(u / 0.93) : a0 + D + ov * (1 - smooth((u - 0.93) / 0.07)), key: 's' + R.id + known };
    }
    function drawWheel(t, dt) {
      const m = wheelModel(t), a = wAng(m.a, m.key, t);
      if (prevWA != null) wVel = wVel * 0.6 + 0.4 * (Math.abs(wrapPi(a - prevWA)) / Math.max(0.001, dt));
      prevWA = a;
      if (faceA === null || Math.abs(a - faceA) > 0.0004) {   /* the face is drawn rotated into its canvas (cheaper than compositing a rotated layer) */
        faceA = a; const px = el.face.width, hp = px / 2;
        fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, px, px);
        fctx.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), hp, hp); fctx.drawImage(faceImg, -hp, -hp);
      }
      el.blur.style.opacity = REDUCE ? 0 : clamp((wVel - 1.5) / 6, 0, 0.85).toFixed(2);
      const rel = -a / SEG, idx = Math.round(rel), s = mod(rel - 0.5, 1);
      if (lastIdx !== null && idx !== lastIdx && wVel > 0.08) { const now = performance.now(); if (now - lastTick > 28) { lastTick = now; snd.tick(clamp(wVel / 8, 0, 1)); } }
      lastIdx = idx;
      const target = s < 0.24 ? (0.24 - s) / 0.24 : 0;
      flapV = target > flapV ? target : flapV * Math.exp(-dt * (wVel > 2 ? 14 : 20));
      el.ptr.style.transform = 'translateX(-50%) rotate(' + (flapV * 26).toFixed(1) + 'deg)';
    }
    function prevTs(id) { const e = id ? prevEntry(id) : hist()[0]; return e ? { l: Math.max(0, M.TS_STRIP.indexOf(e.ts)), r: Math.max(0, M.TS_MULTS.indexOf(e.m)) } : { l: 0, r: 0 }; }
    let tsCls = '';
    function drawTopSlot(t) {
      const pv = prevTs(R ? R.id : 0);
      let pl = pv.l, pr = pv.r, kl = 'r', kr = 'r', cls = '';
      if (R && t >= R.close) {
        const tl = R.tsLeft != null ? R.tsLeft : R.close + M.TIME.TS_LEFT, tr = R.tsRight != null ? R.tsRight : R.close + M.TIME.TS_RIGHT;
        const kn = !!R.ts, sl = kn ? R.ts.stop : pv.l + 7, sr = kn ? M.TS_MULTS.indexOf(R.ts.mult) : pv.r + 4;
        pl = pv.l + (mod(sl - pv.l, 20) + 40) * spinCurve((t - R.close) / (tl - R.close), 0.12, 2.4);
        pr = pv.r + (mod(sr - pv.r, 10) + 30) * spinCurve((t - R.close) / (tr - R.close), 0.1, 2.4);
        kl = 'l' + R.id + kn; kr = 'r' + R.id + kn;
        cls = t < tl ? 'spin' : t < tr ? 'spin1' : 'set';
        if (R.ts && R.seg != null && R.result != null && t >= R.result && R.ts.spot === R.spot) cls += ' hit';
      }
      pl = tsLs(pl, kl, t); pr = tsRs(pr, kr, t);
      el.stripL.style.transform = 'translateY(' + (-(mod(pl, 20) + 20) * IH).toFixed(1) + 'px)';
      el.stripR.style.transform = 'translateY(' + (-(mod(pr, 10) + 10) * IH).toFixed(1) + 'px)';
      if (cls !== tsCls) { tsCls = cls; el.ts.className = 'bn-ts ' + cls; }
    }
    let tmLeft = -1;
    function drawTimer(t) {
      if (!R || !live || t >= R.close) { if (!el.timer.hidden) el.timer.hidden = true; return; }
      const left = R.close - t, f = clamp(left / (R.close - R.open), 0, 1);
      el.timer.hidden = false;
      el.timer.querySelector('.v').style.strokeDashoffset = String((119.4 * (1 - f)).toFixed(2));
      const sec = Math.max(0, Math.ceil(left));
      if (sec !== tmLeft) { tmLeft = sec; el.timer.querySelector('b').textContent = String(sec); el.timer.classList.toggle('hot', left <= 5); if (left <= 5 && sec > 0) snd.hot(); }
    }

    /* ---------- the director ---------- */
    function newRound() {
      RID = R.id; fired = new Set();
      if (scene) { scene.el.remove(); scene.destroy(); scene = null; }
      el.intro.className = 'bn-intro'; el.board.className = 'bn-board'; el.winB.classList.remove('on'); el.land.classList.remove('on');
      root.classList.remove('bn-inbonus', 'bn-won');
      M.SPOTS.forEach((s) => { tile[s].classList.remove('won', 'lost', 'tson'); tile[s].querySelector('.tsb').textContent = ''; });
      if (live) { L.picks = {}; g.undo = []; if (nowS() < R.close) { g.bets = clone(L.confirmed); } }
      paintBets(true); paintRail();
    }
    function sceneCtx() {
      return {
        id: R.id, me: myId(), scale: () => SC * SCS,
        once, players: () => (live && L.st && L.st.round.id === R.id ? L.st.players || [] : []),
        hasChip: () => (rideBets()[R.spot] || 0) > 0,
        canPick: () => (rideBets()[R.spot] || 0) > 0,
        myPick: (k) => (live ? (L.picks[k] != null ? L.picks[k] : L.mine && L.mine[k] != null ? L.mine[k] : null) : P.picks[k] != null ? P.picks[k] : null),
        pick: (v) => doPick(v),
      };
    }
    async function doPick(v) {
      if (!R) return;
      const t = nowS(), k = R.spot === 'hunt' ? 'hunt' : 'flapper';
      if (!(rideBets()[R.spot] > 0)) return;
      if (R.spot === 'hunt' && (t < R.aim || t >= R.lock - 0.15)) return;
      if (R.spot === 'bonkers' && t >= R.lock - 0.15) return;
      snd.click();
      if (!live) { P.picks[k] = v; return; }
      const was = L.picks[k]; L.picks[k] = v;
      const r = await B.play(ID, 'pick', k === 'hunt' ? { round: R.id, hunt: v } : { round: R.id, flapper: v });
      if (!r) L.picks[k] = was; else if (L.mine) L.mine[k] = v;
    }
    function introFor(s) {
      const sub = { flap: 'Red or blue? One flip decides it.', hunt: '108 tombs. One of them is yours.', drop: 'Pegs, pockets and a puck.', bonkers: 'Three flappers. One giant wheel.' }[s];
      return '<div class="rays"></div><div class="card s-' + s + '">' + badge(s) + '<b>' + esc(NAME(s)) + '</b><small>' + sub + '</small></div>';
    }
    function onResult(late) {
      const s = R.spot, ts = R.ts && R.ts.spot === s ? R.ts.mult : 1;
      el.land.classList.add('on');
      M.SPOTS.forEach((k) => { tile[k].classList.toggle('won', k === s); tile[k].classList.toggle('lost', k !== s); });
      const H = live ? L.hist : P.hist;
      if (!H.length || H[0].id < R.id) H.unshift({ id: R.id, s, g: R.seg, ts: R.ts ? R.ts.spot : '', m: R.ts ? R.ts.mult : 0 });
      paintHist(); paintSide();
      const mine = rideBets()[s] || 0;
      if (M.isBonus(s)) {
        if (!late) { snd.fanfare(); call('<span>' + esc(NAME(s)) + '!</span>' + (ts > 1 ? '<em>TOP SLOT ' + ts + '×</em>' : ''), 'bonus', 2600); say("It's " + NAME(s) + '!', 2600, 'cheer'); B.fx.burst({ el: el.wheel, kind: 'confetti', count: 40 }); }
        msg(NAME(s) + (mine ? '! You have ' + fmt(mine) + ' BB on it.' : '! You are watching this one.'));
      } else {
        if (!late) { snd.ding(); call('<span>' + s + '</span>' + (ts > 1 ? '<em>TOP SLOT ' + ts + '×</em>' : ''), 'num s-' + s, 1800); say(ts > 1 ? 'Number ' + s + ' with a Top Slot ' + ts + '×!' : 'Number ' + s + '!', 1800, ts > 1 ? 'cheer' : 'talk'); }
        msg('The wheel says ' + s + (ts > 1 ? ', boosted ' + ts + '× by the Top Slot.' : '.'));
      }
    }
    function showWin(won, staked, x, late) {
      g.lastWin = won; el.win.textContent = fmt(won);
      if (won > 0) {
        const wb = el.winB;
        wb.children[2].textContent = x ? fmt(x) + '× on ' + NAME(R.spot) : '';
        wb.classList.add('on'); root.classList.add('bn-won');
        if (late) wb.children[1].textContent = fmt(won); else B.ui.countUp(wb.children[1], 0, won, Math.min(2600, 600 + won / Math.max(1, staked) * 40), fmt);
        if (!late) { snd.win(won >= staked * 10); B.fx.burst({ el: wb, kind: 'coin', count: Math.min(60, 16 + Math.round(won / Math.max(1, staked)) * 2) }); say('Winner winner!', 1800, 'cheer'); }
        msg('You win ' + fmt(won) + ' BB!');
        B.wallet.sync();
        if (!late && won >= staked * 10) S.timeout(() => B.ui.celebrate({ amount: won, bet: staked }), 900);
      } else {
        B.wallet.sync();
        if (staked > 0) { msg('No win this time.' + (live && !M.isBonus(R.spot) ? ' Next round soon.' : '')); if (!late) snd.lose(); }
      }
    }
    function showBoard(late) {
      let list = [];
      if (live && L.st && L.st.winners && L.st.winners.round === R.id) list = L.st.winners.list;
      else if (!live && g.lastWin > 0) list = [{ id: myId(), name: 'You', avatar: (B.me && B.me.avatar) || '1-1', win: g.lastWin }];
      const me = myId();
      el.board.innerHTML = '<div class="bx"><small>ROUND ' + R.id + ' · ' + esc(NAME(R.spot)) + '</small><b>' + (list.length ? 'Winners' : 'No winners this time') + '</b>' +
        (list.length ? '<ol>' + list.slice(0, 5).map((w) => '<li class="' + (w.id === me ? 'me' : '') + '">' + B.avatar(w.avatar, 26) + '<span>' + (w.id === me ? 'You' : esc(w.name)) + '</span><em>+' + fmt(w.win) + '</em></li>').join('') + '</ol>' : '') +
        '<i>Next round in a moment…</i></div>';
      el.board.className = 'bn-board on';
    }
    function phaseText(ph, t) {
      if (ph === 'bet') return live ? 'Place your bets. ' + Math.max(0, Math.ceil(R.close - t)) + ' s' : '';
      return '';
    }
    let lastPh = '';
    function direct(t, dt) {
      if (!R) { root.dataset.ph = 'idle'; return; }
      if (R.id !== RID) newRound();
      const ph = phaseOf(R, t);
      if (ph !== lastPh) { lastPh = ph; root.dataset.ph = ph; controls(); paintBets(true); }
      if (live) {
        once('open', R.open, t, (late) => { if (!late) { snd.open(); call('<span>Place your bets</span>', 'open', 1500); say('Place your bets!', 1800); } });
        if (ph === 'bet') msg(phaseText(ph, t));
      }
      once('close', R.close, t, (late) => {
        if (live) { g.bets = clone(L.confirmed); }
        if (totalOf(rideBets())) { mem.last = clone(rideBets()); saveMem(); }
        paintBets(true);
        if (!late) { snd.close(); call('<span>No more bets</span>', 'nomore', 1500); say('No more bets!', 1500); }
        msg(totalOf(rideBets()) ? fmt(totalOf(rideBets())) + ' BB riding on round ' + R.id + '.' : 'Watching round ' + R.id + '.');
      });
      once('push', R.spinAt != null ? R.spinAt : R.close + M.TIME.SPIN_AT, t, (late) => { if (!late) { el.host.classList.remove('talk', 'cheer'); el.host.classList.add('push'); snd.whoosh(); S.timeout(() => el.host.classList.remove('push'), 900); } });
      if (R.ts) {
        once('tsl', R.tsLeft, t, (late) => { if (!late) snd.thud(); });
        once('tsr', R.tsRight, t, (late) => {
          if (!late) { snd.thud(); snd.ping(); say('Top Slot: ' + R.ts.mult + '× on ' + NAME(R.ts.spot) + '!', 2000, 'cheer'); }
          M.SPOTS.forEach((s) => { const e = tile[s].querySelector('.tsb'); e.textContent = s === R.ts.spot ? R.ts.mult + '×' : ''; tile[s].classList.toggle('tson', s === R.ts.spot); });
        });
      }
      if (R.seg != null) once('result', R.result, t, onResult);
      if (M.isBonus(R.spot) && R.bonus != null) {
        once('intro', R.result + 1.1, t, (late) => { if (t < R.bonus - 0.3) { el.intro.innerHTML = introFor(R.spot); el.intro.className = 'bn-intro on s-' + R.spot; snd.rise(); } });
        if (t >= R.bonus - 0.35) {
          once('introOff', R.bonus - 0.35, t, () => { el.intro.className = 'bn-intro'; });
          if (!scene) { scene = SCENES[R.spot](sceneCtx()); el.scene.append(scene.el); root.classList.add('bn-inbonus'); }
        }
      }
      if (scene) { try { scene.update(t, R, dt); } catch (e) { console.error(e); } if (R.end != null && t >= R.end - 0.6) scene.el.classList.add('out'); }
      /* picks Bertie makes for anyone who has not chosen (practice; online the server does it) */
      if (!live && P.o && R.lock != null) once('autopick', R.lock, t, () => { const k = R.spot === 'hunt' ? 'hunt' : 'flapper'; if (P.bets[R.spot] > 0 && P.picks[k] == null) P.picks[k] = Math.floor(B.rng() * (k === 'hunt' ? M.HUNT_N : 3)); });
      /* the payout */
      if (R.pay != null) {
        if (live) {
          const s = L.settled.find((x) => x.round === R.id);
          if (s && t >= R.pay && !L.paid.has(s.round)) { L.paid.add(s.round); L.settled = L.settled.filter((x) => x !== s); B.wallet.win(ID, s.won, { silent: true }); showWin(s.won, s.staked, s.x, t - R.pay > 3); paintRail(); }
        } else once('pay', R.pay, t, (late) => {
          const res = M.settle(P.bets, P.o, P.picks), staked = totalOf(P.bets);
          if (res.total > 0) B.wallet.win(ID, res.total, { silent: true });
          if (staked) { g.sRounds++; g.sStaked += staked; g.sWon += res.total; paintRail(); }
          if (dev) { dev.rounds++; dev.staked += staked; dev.won += res.total; dev.last = { spot: P.o.spot, x: res.x, won: res.total, picks: clone(P.picks), bets: clone(P.bets), o: P.o }; }
          showWin(res.total, staked, res.on ? res.x : 0, late);
        });
        once('board', R.pay + (root.classList.contains('bn-won') ? 3.1 : 1.2), t, (late) => showBoard(late));
      }
      /* settlements of rounds you were not watching */
      if (live) for (const s of L.settled.slice()) if (s.round < R.id && !L.paid.has(s.round)) { L.paid.add(s.round); L.settled = L.settled.filter((x) => x !== s); B.wallet.win(ID, s.won, { silent: true }); B.wallet.sync(); if (s.won > 0) B.ui.toast('Round ' + s.round + ' (' + NAME(s.spot) + '): you won ' + fmt(s.won) + ' BB.', 4000); }
      if (!live && R.end != null && t >= R.end) finishPractice();
      paintBets();
    }
    let lastNow = performance.now();
    function frame(dt) {
      if (g.dead) return;
      const pn = performance.now(); dt = Math.min(0.25, Math.max(0, (pn - lastNow) / 1000)); lastNow = pn;
      if (!live) P.clock += dt * ((dev && dev.speed) || 1);
      if (live && L.off == null) return;
      const t = nowS();
      drawWheel(t, dt); drawTopSlot(t); drawTimer(t);
      direct(t, dt);
      if (live) liveTick(t);
    }

    /* ---------- practice ---------- */
    function practiceSpin() {
      if (P.o || g.dead) return;
      const total = totalOf(g.bets);
      if (total > 0 && !B.wallet.bet(ID, total)) { B.ui.broke(); return; }
      let o = M.drawRound(B.rng);
      if (dev && dev.force && M.SPOTS.indexOf(dev.force) > -1) for (let i = 0; i < 50000 && o.spot !== dev.force; i++) o = M.drawRound(B.rng);
      if (dev && dev.tsHit) o.ts = { stop: M.TS_STRIP.indexOf(o.spot), spot: o.spot, mult: dev.tsHit };
      P.id++; P.o = o; P.bets = clone(g.bets); P.picks = {};
      if (total) { mem.last = clone(g.bets); saveMem(); }
      R = fullView(o, M.plan(o, P.clock - M.TIME.BET), P.id);
      g.undo = [];
      controls();
    }
    function finishPractice() {
      const o = P.o; if (!o) return;
      const x = M.spotX(o, { hunt: P.picks.hunt != null ? P.picks.hunt : 0, flapper: P.picks.flapper != null ? P.picks.flapper : 1 });
      if (P.hist.length && P.hist[0].id === R.id) P.hist[0].x = x; else P.hist.unshift({ id: R.id, s: o.spot, g: o.seg, ts: o.ts.spot, m: o.ts.mult, x });
      P.hist = P.hist.slice(0, 100); mem.hist = P.hist.slice(0, 100); saveMem();
      P.o = null; P.bets = {}; g.bets = {}; R = null; RID = 0;
      if (scene) { scene.el.remove(); scene.destroy(); scene = null; }
      root.classList.remove('bn-inbonus', 'bn-won'); el.board.className = 'bn-board'; el.winB.classList.remove('on'); el.land.classList.remove('on');
      M.SPOTS.forEach((s) => { tile[s].classList.remove('won', 'lost', 'tson'); tile[s].querySelector('.tsb').textContent = ''; });
      paintHist(); paintSide(); paintBets(true); controls();
      msg('Place your chips, then spin. Rebet repeats your last round.');
    }

    /* ---------- live ---------- */
    let sendT = 0;
    function queueSend() {
      if (!live) return;
      L.dirty = true; L.seq++;
      const left = R ? R.close - nowS() : 9;
      S.clear(sendT); sendT = S.timeout(sendBet, left < 2.5 ? 0 : 280);
    }
    async function sendBet() {
      if (L.sending || !L.dirty || g.dead) return;
      if (!R || nowS() >= R.close - 0.25) { L.dirty = false; g.bets = clone(L.confirmed); paintBets(true); return; }
      L.sending = true; L.dirty = false;
      const want = clone(g.bets), total = totalOf(want), delta = total - L.confTotal, rid = R.id;
      if (delta > 0 && !B.wallet.bet(ID, delta)) { L.sending = false; B.ui.broke(); g.bets = clone(L.confirmed); paintBets(true); return; }
      const r = await B.play(ID, 'bet', { round: rid, bets: want }, Math.max(0, delta));
      L.sending = false; if (g.dead) return;
      if (r && r.round === rid) { L.confirmed = r.mine ? clone(r.mine.bets) : {}; L.confTotal = totalOf(L.confirmed); L.mine = r.mine ? Object.assign({}, L.mine || {}, r.mine) : null; if (total > 0) { mem.last = clone(want); saveMem(); } }
      else if (!r) { g.bets = clone(L.confirmed); paintBets(true); }
      B.wallet.sync(); controls();
      if (L.dirty) sendBet();
    }
    async function poll() {
      if (L.polling || g.dead) return;
      L.polling = true; L.lastPoll = Date.now();
      const seq0 = L.seq, t0 = Date.now(); let r;
      try { r = await B.api('play', { game: ID, op: 'state', hv: L.hv }, { defer: true }); }
      catch (e) { L.polling = false; return; }
      const t1 = Date.now(); L.polling = false; if (g.dead || !r || !r.round) return;
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (L.off == null || rtt <= L.best * 1.25 || ++L.age > 60) { L.off = off; L.best = rtt; L.age = 0; }
      if (r.hist) L.hist = r.hist;
      L.hv = r.hv; L.st = r;
      const isNew = !R || R.id !== r.round.id;
      R = r.round; L.mine = r.mine;
      if (isNew || (!L.sending && !L.dirty && L.seq === seq0)) {
        L.confirmed = r.mine ? clone(r.mine.bets) : {}; L.confTotal = totalOf(L.confirmed);
        if (!L.sending && !L.dirty && L.seq === seq0 && nowS() < R.close && JSON.stringify(g.bets) !== JSON.stringify(L.confirmed)) { g.bets = clone(L.confirmed); paintBets(true); }
      }
      for (const s of r.settled || []) if (!L.paid.has(s.round) && !L.settled.find((x) => x.round === s.round)) L.settled.push(s);
      paintRail(); paintHist(); paintSide();
    }
    /* the next moment something new will be revealed: poll just after it */
    function nextKey(t) {
      if (!R) return null;
      const ks = [R.close, R.bonus, R.flip, R.lock != null ? R.lock + 0.45 : null, R.pay, R.end];
      if (R.drops && R.lands && R.drop) { const i = R.drops.length - 1; ks.push(R.drops[i]); if (R.drop.drops[i] != null && R.drop.board[R.drop.drops[i]] === 0) ks.push(R.lands[i] + 2.4); }
      if (R.spins && R.stops) { const i = R.spins.length - 1; ks.push(R.spins[i]); if (R.bonkers && R.bonkers.spins[i] && R.bonkers.spins[i].hit.some((x) => x === 'D' || x === 'T')) ks.push(R.stops[i] + 3); }
      let best = null; for (const k of ks) if (k != null && k > t - 0.05 && (best == null || k < best)) best = k;
      return best;
    }
    function liveTick(t) {
      const ph = R ? phaseOf(R, t) : 'bet', gap = ph === 'bet' ? 1000 : 600, since = Date.now() - L.lastPoll;
      const nk = nextKey(t);
      if (nk != null && t >= nk + 0.06 && L.keyT !== nk && since > 120) { L.keyT = nk; poll(); return; }
      if (R && R.end != null && t >= R.end && since > 250) { poll(); return; }
      if (since >= gap && (!document.hidden || since > 4000)) poll();
    }

    /* ---------- keys ---------- */
    S.on(document, 'keydown', (e) => {
      if (g.dead || e.target.closest && e.target.closest('input,textarea,select') || document.querySelector('.bc-modal')) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'spacebar') { if (!live) { e.preventDefault(); practiceSpin(); } }
      else if (k === 'u') undo(); else if (k === 'c') clearBets(); else if (k === 'x') doubleBets(); else if (k === 'r') rebet();
      else if (k >= '1' && k <= '6') { mem.chip = +k - 1; saveMem(); paintChips(); snd.click(); }
    });

    /* ---------- start ---------- */
    applyLayout(LAY.wide); layout(); paintChips(); paintBets(true); paintHist(); paintRail(); paintSide();
    S.loop(frame);
    if (live) {
      msg('Joining the studio…');
      poll();
      S.interval(() => { if (!g.dead && L.off != null) liveTick(nowS()); else if (!g.dead && !L.polling && Date.now() - L.lastPoll > 1500) poll(); }, 250);
    } else {
      msg(dev ? 'Practice (dev hooks: window.__bonkersDev.force = "flap" | "hunt" | "drop" | "bonkers", .tsHit = 5, .speed = 3).' : 'Place your chips, then spin. Online, Bonkers Time is one live show for everybody.');
    }
    G = g;
    g.destroy = () => { g.dead = true; ro.disconnect(); if (scene) scene.destroy(); if (window.__bonkersDev) delete window.__bonkersDev; };
  }

  B.registerGame({
    id: ID, name: 'Bonkers Time', tagline: 'The live game show: one giant wheel, Top Slot multipliers and four bonus games',
    tag: 'Live game show', section: 'live', isNew: true,
    poster: POSTER, rules,
    mount(root) { mount(root); },
    unmount() { if (G && G.destroy) G.destroy(); G = null; if (S) S.dispose(); S = null; },
  });
})();
