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
