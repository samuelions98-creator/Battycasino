/* ===== gummy math ===== */
/* Gummy Bats — pure maths. No DOM. Shared verbatim by the browser game, tools/gummy-sim.js and (ported line for line)
   lib/games/gummy.php. Parity is proved by tools/gummy-xcheck.js.

   THE GRID    7 x 7 = 49 cells. Cells are numbered column-major: cell = col * 7 + row, row 0 at the top. Every cell is drawn
               independently from a weight table: one table for the opening drop, another for the sweets that tumble in.
   CLUSTERS    5 or more matching gummy bats joined edge to edge (up, down, left, right) pay, by cluster size (5 to 15+).
               The Sour Bat wild only ever drops in during tumbles. It stands in for every bat and joins every cluster it
               touches (a wild between two clusters of the same bat joins them into one).
   TUMBLES     Every bat in a winning cluster pops, everything above falls, new sweets drop in from the top, and the grid is
               paid again, until a drop brings no win. Gummy Moons (scatters) never pop.
   SPOTS       Every cell has a mould spot. The first time a winning bat pops on a cell, the spot is marked. The second time it
               becomes a x2 multiplier spot, and every pop after that doubles it, up to x1024. A winning cluster is paid
               base pay x (the SUM of every multiplier spot under it). Pays are worked out before the pop upgrades the spots.
               In the base game the spots reset after every spin. In free spins they stay for the whole feature.
   FREE SPINS  3, 4, 5, 6 or 7+ Gummy Moons (counted when the tumbling stops) award 10, 12, 15, 20 or 30 free spins.
               The same counts during free spins add the same number of spins again.
   BUYS        Free Spins: 100x stake, a spin with 3 to 7 guaranteed Moons. Super Free Spins: 750x stake, the same, but every
               spot on the grid starts the feature as a x2 multiplier spot.
   MAX WIN     25,000x the stake per round. The round ends the moment it is reached.
   AMOUNTS     In UNITS: 1 unit = stake / 20 (every stake on the ladder is a multiple of 20), so every pay is whole Batty Bucks.
   RNG ORDER   Opening grid cells 0..48 in order (one pick each); then for every tumble, column 0..6, one pick per new sweet,
               top to bottom. A bought trigger spin then picks the Moon positions (a partial Fisher-Yates). Nothing else draws. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).gummy = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLS = 7, ROWS = 7, CELLS = 49;
  const UNITS_PER_STAKE = 20;
  const MAX_WIN_X = 25000;
  const CAP = MAX_WIN_X * UNITS_PER_STAKE;
  const BUY_X = 100, SUPER_X = 750;
  const MIN_CLUSTER = 5, TOP_CLUSTER = 15;
  const SPOT_MAX = 1024, SUPER_SPOT = 2;

  /* ---------- symbols ---------- */
  const CHERRY = 0, GRAPE = 1, LIME = 2, ORANGE = 3, LEMON = 4, BLUE = 5, PINK = 6, MOON = 7, WILD = 8;
  const PAYERS = 7, NSYM = 9;
  const SYMBOLS = ['cherry', 'grape', 'lime', 'orange', 'lemon', 'blue', 'pink', 'moon', 'wild'];
  const SYMBOL_NAMES = ['Cherry Count', 'Blackcurrant Baron', 'Sour Lime', 'Orange Squash', 'Lemon Sherbet', 'Blue Raspberry', 'Bubblegum', 'Gummy Moon', 'Sour Bat'];
  /* PAY[symbol][size - 5] for clusters of 5, 6, 7 ... 14, 15+ — in units (20 units = 1x stake) */
  const PAY = [
    /* Cherry Count       */ [60, 80, 100, 150, 200, 300, 400, 600, 1000, 2000, 5000],
    /* Blackcurrant Baron */ [40, 60, 80, 100, 150, 200, 300, 500, 800, 1500, 3000],
    /* Sour Lime          */ [30, 40, 60, 80, 100, 150, 200, 300, 500, 1000, 2000],
    /* Orange Squash      */ [25, 30, 40, 60, 80, 100, 150, 250, 400, 800, 1600],
    /* Lemon Sherbet      */ [20, 25, 30, 40, 60, 80, 100, 200, 300, 600, 1200],
    /* Blue Raspberry     */ [15, 20, 25, 30, 40, 60, 80, 150, 250, 500, 1000],
    /* Bubblegum          */ [10, 15, 20, 25, 30, 40, 60, 120, 200, 400, 800],
  ];
  /* free spins by Moon count (index = count, 7+ uses the last) */
  const FS_AWARD = [0, 0, 0, 10, 12, 15, 20, 30];
  const FS_TRIGGER = 3;

  /* ---------- weight tables (every probability in the game lives here; integers, so JS and PHP sum them identically) ----------
     index = symbol id:  Cherry Grape Lime Orange Lemon Blue Pink Moon Wild */
  const W = {
    base: [90, 110, 135, 160, 185, 210, 240, 7, 0],      // the opening drop of a paid spin
    baseRef: [90, 110, 135, 160, 185, 210, 240, 5, 36],  // sweets that tumble in during a paid spin
    fs: [260, 228, 193, 160, 128, 100, 80, 6, 0],        // the opening drop of a free spin (the big bats come out at night)
    fsRef: [260, 228, 193, 160, 128, 100, 80, 4, 25],    // sweets that tumble in during a free spin
  };
  /* a bought spin lands exactly n Moons on its opening drop: weights for n = 3..7 (more can still tumble in) */
  const BUY_MOONS = [0, 0, 0, 832, 135, 25, 6, 2];
  const SUPER_MOONS = [0, 0, 0, 835, 132, 26, 5, 2];

  /* ---------- helpers ---------- */
  function pickIndex(rng, weights) {
    let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }
  function payFor(s, n) { return PAY[s][(n > TOP_CLUSTER ? TOP_CLUSTER : n) - MIN_CLUSTER]; }
  function fsAward(sc) { return FS_AWARD[sc > 7 ? 7 : sc]; }
  /* the next value of a spot when a winning bat pops on it: 0 (clear) -> 1 (marked) -> x2 -> x4 ... -> x1024 */
  function nextSpot(v) { return v === 0 ? 1 : v === 1 ? 2 : (v * 2 > SPOT_MAX ? SPOT_MAX : v * 2); }
  /* the spots after a pop: pure, the client uses it to animate */
  function bumpSpots(spots, hit) { const o = spots.slice(); for (let i = 0; i < hit.length; i++) o[hit[i]] = nextSpot(o[hit[i]]); return o; }

  /* ---------- clusters ----------
     For each bat s in id order: flood-fill from every unvisited s cell through s cells and wilds. A component of 5+ is a
     cluster. Cells are listed in the order the fill reaches them. Returns {cl:[{s, cells, n, base, mult, pay}], pay, hit}
     where hit is every cell that pops (ascending) and mult is the sum of the x2+ spots under the cluster (0 = none). */
  const NB = [];
  for (let c = 0; c < CELLS; c++) {
    const col = (c / ROWS) | 0, row = c % ROWS, n = [];
    if (row > 0) n.push(c - 1);
    if (row < ROWS - 1) n.push(c + 1);
    if (col > 0) n.push(c - ROWS);
    if (col < COLS - 1) n.push(c + ROWS);
    NB.push(n);
  }
  function evaluate(g, spots) {
    const cl = []; let pay = 0;
    const popped = new Array(CELLS).fill(false);
    for (let s = 0; s < PAYERS; s++) {
      const seen = new Array(CELLS).fill(false);
      for (let c0 = 0; c0 < CELLS; c0++) {
        if (g[c0] !== s || seen[c0]) continue;
        const cells = [c0]; seen[c0] = true;
        for (let k = 0; k < cells.length; k++) {
          const nb = NB[cells[k]];
          for (let j = 0; j < nb.length; j++) { const d = nb[j]; if (!seen[d] && (g[d] === s || g[d] === WILD)) { seen[d] = true; cells.push(d); } }
        }
        if (cells.length < MIN_CLUSTER) continue;
        let mult = 0;
        for (let k = 0; k < cells.length; k++) { const v = spots[cells[k]]; if (v >= 2) mult += v; popped[cells[k]] = true; }
        const base = payFor(s, cells.length), p = base * (mult > 0 ? mult : 1);
        cl.push({ s: s, cells: cells, n: cells.length, base: base, mult: mult, pay: p });
        pay += p;
      }
    }
    const hit = [];
    for (let c = 0; c < CELLS; c++) if (popped[c]) hit.push(c);
    return { cl: cl, pay: pay, hit: hit };
  }
  /* remove the hit cells, let the rest fall, and put add[col] (top to bottom) on top. Pure: the client uses it too. */
  function applyTumble(g, hit, add) {
    const gone = new Array(CELLS).fill(false), ng = new Array(CELLS);
    for (let i = 0; i < hit.length; i++) gone[hit[i]] = true;
    for (let col = 0; col < COLS; col++) {
      const colv = (add[col] || []).slice();
      for (let row = 0; row < ROWS; row++) { const c = col * ROWS + row; if (!gone[c]) colv.push(g[c]); }
      for (let row = 0; row < ROWS; row++) ng[col * ROWS + row] = colv[row];
    }
    return ng;
  }
  function countMoons(g) { let n = 0; for (let c = 0; c < CELLS; c++) if (g[c] === MOON) n++; return n; }

  /* ---------- one tumble sequence ----------
     g: the opening grid (already drawn). spots: the spots it starts on. ref: the refill table. room: units that may still be
     paid before the cap. Returns {g, steps:[{cl, pay, hit, add}], tw, sc, spots (after), capped}. tw is already cut to room. */
  function runSequence(rng, g, spots, ref, room) {
    const out = { g: g.slice(), steps: [], tw: 0, sc: 0, spots: null, capped: false };
    for (;;) {
      const ev = evaluate(g, spots);
      if (!ev.pay) break;
      let p = ev.pay;
      if (out.tw + p >= room) { p = room - out.tw; out.capped = true; }
      const step = { cl: ev.cl, pay: p, hit: ev.hit, add: [] };
      out.steps.push(step);
      out.tw += p;
      spots = bumpSpots(spots, ev.hit);
      if (out.capped) break;
      for (let col = 0; col < COLS; col++) {
        let n = 0; for (let i = 0; i < ev.hit.length; i++) if (((ev.hit[i] / ROWS) | 0) === col) n++;
        const a = [];
        for (let i = 0; i < n; i++) a.push(pickIndex(rng, ref));
        step.add.push(a);
      }
      g = applyTumble(g, ev.hit, step.add);
    }
    out.sc = countMoons(g);
    out.spots = spots;
    return out;
  }
  function freshGrid(rng, w) { const g = new Array(CELLS); for (let c = 0; c < CELLS; c++) g[c] = pickIndex(rng, w); return g; }
  function zeroSpots() { return new Array(CELLS).fill(0); }

  /* ---------- free spins ----------
     carried: units already won this round. superFs: every spot starts at x2. award: the spins the trigger gave.
     Returns {award, superFs, s0, spins:[seq + {retrig, running}], awarded, retriggers, total, capped}. */
  function freeSpins(rng, carried, award, superFs) {
    let spots = superFs ? new Array(CELLS).fill(SUPER_SPOT) : zeroSpots();
    const fs = { award: award, superFs: !!superFs, s0: spots.slice(), spins: [], awarded: award, retriggers: 0, total: 0, capped: false };
    let left = award;
    while (left > 0) {
      left--;
      const g = freshGrid(rng, W.fs);
      const seq = runSequence(rng, g, spots, W.fsRef, CAP - carried - fs.total);
      spots = seq.spots;
      fs.total += seq.tw;
      seq.running = fs.total;
      seq.retrig = 0;
      if (seq.capped) { fs.capped = true; fs.spins.push(seq); break; }
      const more = fsAward(seq.sc);
      if (more) { left += more; fs.awarded += more; fs.retriggers++; seq.retrig = more; }
      fs.spins.push(seq);
    }
    return fs;
  }

  /* ---------- a round ----------
     mode: 'base' | 'buy' | 'super'. Returns {mode, cost (units), spin, fs, totalWin, capped}. */
  function costOf(mode) { return mode === 'buy' ? BUY_X * UNITS_PER_STAKE : mode === 'super' ? SUPER_X * UNITS_PER_STAKE : UNITS_PER_STAKE; }
  function finish(rng, mode, seq) {
    const o = { mode: mode, cost: costOf(mode), spin: seq, fs: null, totalWin: seq.tw, capped: seq.capped };
    if (!o.capped && seq.sc >= FS_TRIGGER) {
      o.fs = freeSpins(rng, seq.tw, fsAward(seq.sc), mode === 'super');
      o.totalWin += o.fs.total;
      if (o.fs.capped) o.capped = true;
    }
    return o;
  }
  function spin(rng) {
    const g = freshGrid(rng, W.base);
    return finish(rng, 'base', runSequence(rng, g, zeroSpots(), W.baseRef, CAP));
  }
  /* a spin with exactly n Moons on the opening drop (the buys, and the practice-mode dev hook) */
  function triggerSpin(rng, n, mode) {
    const w = W.base.slice(); w[MOON] = 0;
    const g = freshGrid(rng, w);
    const idx = []; for (let c = 0; c < CELLS; c++) idx.push(c);
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rng() * (CELLS - i)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; g[idx[i]] = MOON; }
    return finish(rng, mode, runSequence(rng, g, zeroSpots(), W.baseRef, CAP));
  }
  function buy(rng, superFs) { return triggerSpin(rng, pickIndex(rng, superFs ? SUPER_MOONS : BUY_MOONS), superFs ? 'super' : 'buy'); }
  function play(rng, mode) { return mode === 'buy' ? buy(rng, false) : mode === 'super' ? buy(rng, true) : spin(rng); }

  return {
    COLS: COLS, ROWS: ROWS, CELLS: CELLS, UNITS_PER_STAKE: UNITS_PER_STAKE, MAX_WIN_X: MAX_WIN_X, CAP: CAP, BUY_X: BUY_X, SUPER_X: SUPER_X,
    MIN_CLUSTER: MIN_CLUSTER, TOP_CLUSTER: TOP_CLUSTER, SPOT_MAX: SPOT_MAX, SUPER_SPOT: SUPER_SPOT,
    SYM: { CHERRY: CHERRY, GRAPE: GRAPE, LIME: LIME, ORANGE: ORANGE, LEMON: LEMON, BLUE: BLUE, PINK: PINK, MOON: MOON, WILD: WILD },
    PAYERS: PAYERS, NSYM: NSYM, SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, PAY: PAY, FS_AWARD: FS_AWARD, FS_TRIGGER: FS_TRIGGER, W: W, BUY_MOONS: BUY_MOONS, SUPER_MOONS: SUPER_MOONS,
    pickIndex: pickIndex, payFor: payFor, fsAward: fsAward, nextSpot: nextSpot, bumpSpots: bumpSpots, evaluate: evaluate, applyTumble: applyTumble,
    countMoons: countMoons, runSequence: runSequence, freeSpins: freeSpins, spin: spin, triggerSpin: triggerSpin, buy: buy, play: play, costOf: costOf,
  };
});

/* ===== gummy ===== */
/* Gummy Bats — the game. Every outcome comes from BattyMath.gummy (or, online, from the server running the identical maths);
   this file only presents it. A candy factory at midnight: jelly moulds, conveyor belts, bubbling vats and a gummy moon
   in the window. Free spins are the Night Shift. */
(function () {
  'use strict';
  const ID = 'gummy', M = BattyMath.gummy, h = Batty.h;
  const SYM = M.SYM, U = M.UNITS_PER_STAKE, COLS = M.COLS, ROWS = M.ROWS, CELLS = M.CELLS;
  const KEYS = M.SYMBOLS; // cherry grape lime orange lemon blue pink moon wild
  const NAMES = M.SYMBOL_NAMES;
  /* flavour colours: [highlight, body, deep, outline] */
  const FL = {
    cherry: ['#ffb0bd', '#ff2a4f', '#b3002c', '#4d0014'],
    grape: ['#dcb8ff', '#9a46ff', '#5a16bd', '#25075c'],
    lime: ['#e2ffb0', '#6edc2c', '#2d9410', '#123f05'],
    orange: ['#ffd9a6', '#ff8d1f', '#cc5200', '#5c2400'],
    lemon: ['#fff8c0', '#ffd61f', '#d99c00', '#5e4100'],
    blue: ['#bfeaff', '#2ea8ff', '#0062c8', '#002a57'],
    pink: ['#ffd6ef', '#ff66c4', '#cf1f8d', '#5c0a42'],
    moon: ['#fffbe0', '#ffe27a', '#e3a92a', '#5a3a00'],
    wild: ['#ffffff', '#ff7ad9', '#7a2cff', '#2a0a55'],
  };
  const SC = KEYS.map((k) => FL[k][1]); // splat colour per symbol id
  const DISPLAY = "'Titan One','Lilita One','Arial Rounded MT Bold','Trebuchet MS',Verdana,sans-serif";

  /* Figures quoted in the rules, verbatim from tools/gummy-sim.js runs (see the commit message for the full output). */
  const SIM = {
    rounds: '10,000,000', buys: '10,000,000', supers: '10,000,000',
    base: '96.5', buy: '96.5', super: '96.5', hit: '1 in 3', fs: '1 in 260', max: '25,000', vol: 'Very high',
  };

  /* =====================================================================================
     ART — every picture is drawn here. p is an id prefix so the lobby poster and the game never share SVG ids.
     ===================================================================================== */
  const stops = (s) => s.map((x) => '<stop offset="' + x[0] + '" stop-color="' + x[1] + '"' + (x[2] != null ? ' stop-opacity="' + x[2] + '"' : '') + '/>').join('');
  const lg = (id, s, x1, y1, x2, y2) => '<linearGradient id="' + id + '" x1="' + (x1 || 0) + '" y1="' + (y1 || 0) + '" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops(s) + '</linearGradient>';
  const rg = (id, s, cx, cy, r, fx, fy) => '<radialGradient id="' + id + '" cx="' + (cx == null ? 0.5 : cx) + '" cy="' + (cy == null ? 0.5 : cy) + '" r="' + (r || 0.5) + '"' + (fx != null ? ' fx="' + fx + '" fy="' + fy + '"' : '') + '>' + stops(s) + '</radialGradient>';

  function symDefs(p) {
    let s = '';
    for (const k of KEYS) {
      const c = FL[k];
      s += rg(p + 'j-' + k, [[0, c[0]], [0.38, c[1]], [0.86, c[2]], [1, c[3]]], 0.4, 0.36, 0.7, 0.36, 0.3);
      s += lg(p + 'w-' + k, [[0, c[1]], [1, c[3]]], 0, 0, 0, 1);
    }
    s += rg(p + 'glow', [[0, '#fff', 0.55], [1, '#fff', 0]]);
    s += rg(p + 'shadow', [[0, '#000', 0.55], [1, '#000', 0]]);
    s += rg(p + 'moon', [[0, '#fffef2'], [0.45, '#ffe98f'], [0.85, '#f0b53a'], [1, '#a8640a']], 0.42, 0.38, 0.62);
    s += rg(p + 'mhalo', [[0, '#fff2a8', 0.7], [0.55, '#ffd34d', 0.25], [1, '#ffd34d', 0]]);
    s += lg(p + 'rainbow', [[0, '#ff3d6e'], [0.2, '#ff9a1f'], [0.4, '#ffe03a'], [0.6, '#4ee04a'], [0.8, '#2fa8ff'], [1, '#a34dff']], 0, 0, 1, 1);
    s += lg(p + 'gold', [[0, '#fff3b0'], [0.5, '#ffc928'], [1, '#c77a00']]);
    s += lg(p + 'wband', [[0, '#3a0d75'], [1, '#1c0540']]);
    return s;
  }

  /* the shared gummy bat silhouette (viewBox 0 0 100 100) */
  const BODY = 'M50 23C44 23 40 24.5 37.5 26.5L31 11C27 18 25.5 28 27.5 36C22.5 44 25 54 32 58.5C27 64.5 27 76 33 82.5C38.5 88.5 61.5 88.5 67 82.5C73 76 73 64.5 68 58.5C75 54 77.5 44 72.5 36C74.5 28 73 18 69 11L62.5 26.5C60 24.5 56 23 50 23Z';
  const WING_L = 'M34 57C26 50 15 45 5 43C8 49 9 55 8 61C12 58 16 59 18 63C21 60 25 61 27 66C29 64 32 65 34 69Z';
  const WING_R = 'M66 57C74 50 85 45 95 43C92 49 91 55 92 61C88 58 84 59 82 63C79 60 75 61 73 66C71 64 68 65 66 69Z';
  const EYE = (x, y, k) => '<ellipse cx="' + x + '" cy="' + y + '" rx="6.6" ry="7.6" fill="#fff"/><circle cx="' + (x + 0.8) + '" cy="' + (y + 1.6) + '" r="4" fill="' + FL[k][3] + '"/><circle cx="' + (x - 0.9) + '" cy="' + (y - 0.6) + '" r="1.6" fill="#fff"/>';
  const HAPPY = (x, y) => '<path d="M' + (x - 5.5) + ' ' + (y + 1.5) + 'Q' + x + ' ' + (y - 6) + ' ' + (x + 5.5) + ' ' + (y + 1.5) + '" fill="none" stroke="#2a0a20" stroke-width="2.6" stroke-linecap="round"/>';
  function batBase(p, k, face, extraBack, extraFront) {
    const c = FL[k];
    return '<ellipse class="sh" cx="50" cy="91" rx="24" ry="4.5" fill="url(#' + p + 'shadow)"/>' +
      (extraBack || '') +
      '<g class="wl"><path d="' + WING_L + '" fill="url(#' + p + 'w-' + k + ')" stroke="' + c[3] + '" stroke-width="2.2" stroke-linejoin="round"/><path d="M30 58C22 53 14 50 8 48" fill="none" stroke="' + c[0] + '" stroke-width="1.4" opacity=".55" stroke-linecap="round"/></g>' +
      '<g class="wr"><path d="' + WING_R + '" fill="url(#' + p + 'w-' + k + ')" stroke="' + c[3] + '" stroke-width="2.2" stroke-linejoin="round"/><path d="M70 58C78 53 86 50 92 48" fill="none" stroke="' + c[0] + '" stroke-width="1.4" opacity=".55" stroke-linecap="round"/></g>' +
      '<g class="bod">' +
      '<ellipse cx="41.5" cy="86" rx="6.5" ry="3.6" fill="' + c[2] + '" stroke="' + c[3] + '" stroke-width="1.8"/><ellipse cx="58.5" cy="86" rx="6.5" ry="3.6" fill="' + c[2] + '" stroke="' + c[3] + '" stroke-width="1.8"/>' +
      '<path d="' + BODY + '" fill="url(#' + p + 'j-' + k + ')" fill-opacity=".95" stroke="' + c[3] + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<ellipse cx="50" cy="64" rx="17" ry="17" fill="url(#' + p + 'glow)" opacity=".5"/>' +
      '<ellipse cx="50" cy="73" rx="10.5" ry="8.5" fill="' + c[0] + '" opacity=".28"/>' +
      '<path d="M33.5 30L31.5 17.5L36.5 28Z M66.5 30L68.5 17.5L63.5 28Z" fill="' + c[2] + '" opacity=".55"/>' +
      '<ellipse cx="38.5" cy="32" rx="7.5" ry="3.8" transform="rotate(-32 38.5 32)" fill="#fff" opacity=".78"/><circle cx="46.5" cy="27.8" r="1.7" fill="#fff" opacity=".85"/>' +
      '<path d="M33 65Q30.5 73.5 35.5 80.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".42"/>' +
      '<path d="M69.5 61Q72.5 71 66.5 80.5" fill="none" stroke="' + c[0] + '" stroke-width="2" stroke-linecap="round" opacity=".7"/>' +
      '<circle cx="60" cy="74" r=".9" fill="#fff" opacity=".8"/><circle cx="42" cy="79" r=".8" fill="#fff" opacity=".7"/><circle cx="64" cy="40" r=".8" fill="#fff" opacity=".7"/>' +
      '<ellipse cx="35.8" cy="51.5" rx="3.8" ry="2.3" fill="#ff5a8a" opacity=".45"/><ellipse cx="64.2" cy="51.5" rx="3.8" ry="2.3" fill="#ff5a8a" opacity=".45"/>' +
      face + (extraFront || '') + '</g>';
  }
  const SMILE = (k) => '<path d="M44 53Q50 58.6 56 53" fill="' + FL[k][3] + '" stroke="' + FL[k][3] + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M46.4 54.3L47.4 57.6L48.6 55.2Z M53.6 54.3L52.6 57.6L51.4 55.2Z" fill="#fff"/>';
  const EYES = (k) => '<g class="eyes">' + EYE(42, 44, k) + EYE(58, 44, k) + '</g><g class="hap">' + HAPPY(42, 45) + HAPPY(58, 45) + '</g>';

  function batMarkup(p, k) {
    const c = FL[k];
    if (k === 'cherry') {
      /* Cherry Count: a vampire collar, a widow's peak and a cherry stalk sprouting between the ears */
      const collar = '<path d="M33 60L17 37L30 46L36 54Z M67 60L83 37L70 46L64 54Z" fill="#3a0010" stroke="#22000a" stroke-width="2" stroke-linejoin="round"/><path d="M31 56L21 41L32 49Z M69 56L79 41L68 49Z" fill="#c4002f"/>';
      const front = '<path d="M44.5 29.5L50 35.5L55.5 29.5Q50 31.5 44.5 29.5Z" fill="' + c[3] + '" opacity=".5"/>' +
        '<g class="stalk"><path d="M50 24Q51 13 58.5 7.5" fill="none" stroke="#2f7a12" stroke-width="2.6" stroke-linecap="round"/><path d="M57 9C61 4 67 4.5 70 7.5C66 10.5 61 11 57 9Z" fill="#5fd02c" stroke="#1d4d08" stroke-width="1.5"/><circle cx="58.5" cy="8" r="2" fill="#ff2a4f" stroke="#4d0014" stroke-width="1.2"/></g>';
      return batBase(p, k, EYES(k) + SMILE(k), collar, front);
    }
    if (k === 'grape') {
      /* Blackcurrant Baron: a tiny top hat and a gold monocle */
      const hat = '<g class="hat"><ellipse cx="50" cy="22.5" rx="12" ry="3" fill="#1a0533" stroke="#0a0118" stroke-width="1.6"/><path d="M42 22.5L43 9.5Q50 7.5 57 9.5L58 22.5Z" fill="#26084a" stroke="#0a0118" stroke-width="1.6" stroke-linejoin="round"/><path d="M42.6 18.5L57.4 18.5L57.7 21L42.3 21Z" fill="url(#' + p + 'gold)"/><path d="M45 11.5L45.5 18" stroke="#fff" stroke-width="1.2" opacity=".3"/></g>';
      const mono = '<circle cx="58" cy="44" r="8.6" fill="none" stroke="url(#' + p + 'gold)" stroke-width="2.4"/><path d="M65.5 48Q69 58 66 66" fill="none" stroke="#ffc928" stroke-width="1.1" stroke-dasharray="1.6 1.4"/><path d="M53.5 38.5Q56 37 59 37.6" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7"/>';
      const mous = '<path d="M43 53Q47 51 50 53Q53 51 57 53Q54 56.5 50 55Q46 56.5 43 53Z" fill="' + c[3] + '"/>';
      return batBase(p, k, EYES(k) + SMILE(k) + mous, '', hat + mono);
    }
    if (k === 'lime') {
      /* Sour Lime: one eye screwed shut, puckered lips and a crust of sour sugar */
      let sugar = '';
      const pts = [[36, 40], [63, 33], [40, 70], [58, 79], [66, 66], [30, 60], [52, 31], [46, 82], [70, 52], [35, 74]];
      for (const [x, y] of pts) sugar += '<rect x="' + (x - 1.1) + '" y="' + (y - 1.1) + '" width="2.2" height="2.2" transform="rotate(' + ((x * 7) % 90) + ' ' + x + ' ' + y + ')" fill="#fff" opacity=".85"/>';
      const face = '<g class="eyes"><path d="M36.5 41L46 44.5L36.5 48" fill="none" stroke="' + c[3] + '" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>' + EYE(58, 44, k) + '</g><g class="hap">' + HAPPY(42, 45) + HAPPY(58, 45) + '</g>' +
        '<path d="M53 35.5L63 37.5" stroke="' + c[3] + '" stroke-width="2.2" stroke-linecap="round"/>' +
        '<ellipse class="pucker" cx="50" cy="55" rx="3.4" ry="2.8" fill="' + c[3] + '"/><ellipse cx="50" cy="54.4" rx="1.6" ry="1" fill="#ff7aa8"/>';
      return batBase(p, k, face, '', sugar);
    }
    if (k === 'orange') {
      /* Orange Squash: a huge grin, a tongue and orange-peel freckles */
      let peel = '';
      const pts = [[38, 66], [44, 74], [61, 69], [56, 79], [66, 76], [34, 76], [62, 31], [38, 37]];
      for (const [x, y] of pts) peel += '<circle cx="' + x + '" cy="' + y + '" r="1.1" fill="' + c[2] + '" opacity=".45"/>';
      const face = EYES(k) +
        '<path d="M41 51.5Q50 52.5 59 51.5Q58 61 50 61.5Q42 61 41 51.5Z" fill="' + c[3] + '" stroke="' + c[3] + '" stroke-width="1.4" stroke-linejoin="round"/><path d="M45 58.5Q50 55.5 55 58.5Q53 61 50 61Q47 61 45 58.5Z" fill="#ff5c7a"/><path d="M43.5 52L45 55L46.5 52.2Z M56.5 52L55 55L53.5 52.2Z" fill="#fff"/>' +
        '<circle cx="34.5" cy="50" r=".9" fill="' + c[2] + '"/><circle cx="37" cy="52.5" r=".9" fill="' + c[2] + '"/><circle cx="65.5" cy="50" r=".9" fill="' + c[2] + '"/><circle cx="63" cy="52.5" r=".9" fill="' + c[2] + '"/>';
      return batBase(p, k, face, '', peel);
    }
    if (k === 'lemon') {
      /* Lemon Sherbet: starry eyes, a bow on one ear and sherbet fizz */
      const star = (x, y) => '<path d="M' + x + ' ' + (y - 4) + 'L' + (x + 1.2) + ' ' + (y - 1.2) + 'L' + (x + 4) + ' ' + y + 'L' + (x + 1.2) + ' ' + (y + 1.2) + 'L' + x + ' ' + (y + 4) + 'L' + (x - 1.2) + ' ' + (y + 1.2) + 'L' + (x - 4) + ' ' + y + 'L' + (x - 1.2) + ' ' + (y - 1.2) + 'Z" fill="#fff"/>';
      const face = '<g class="eyes"><ellipse cx="42" cy="44" rx="6.6" ry="7.6" fill="' + c[3] + '"/><ellipse cx="58" cy="44" rx="6.6" ry="7.6" fill="' + c[3] + '"/>' + star(42, 44) + star(58, 44) + '<circle cx="39.5" cy="40.5" r="1.2" fill="#fff"/><circle cx="55.5" cy="40.5" r="1.2" fill="#fff"/></g><g class="hap">' + HAPPY(42, 45) + HAPPY(58, 45) + '</g>' + SMILE(k);
      const bow = '<g class="bow"><path d="M30 18L22 13L23 23Z M30 18L38 13.5L36.5 23Z" fill="#ff5fa8" stroke="#7a0a44" stroke-width="1.5" stroke-linejoin="round"/><circle cx="30" cy="18" r="2.6" fill="#ff8cc4" stroke="#7a0a44" stroke-width="1.3"/></g>';
      const fizz = '<g class="fizz"><circle cx="78" cy="30" r="2.2" fill="none" stroke="#fff6b0" stroke-width="1.2"/><circle cx="84" cy="22" r="1.4" fill="none" stroke="#fff6b0" stroke-width="1"/><circle cx="20" cy="30" r="1.6" fill="none" stroke="#fff6b0" stroke-width="1"/></g>';
      return batBase(p, k, face, fizz, bow);
    }
    if (k === 'blue') {
      /* Blue Raspberry: sleepy half-shut eyes and a drooping nightcap */
      const face = '<g class="eyes">' + EYE(42, 45, k) + EYE(58, 45, k) + '<path d="M35 44.5Q42 35 49 44.5Z M51 44.5Q58 35 65 44.5Z" fill="' + c[2] + '" stroke="' + c[3] + '" stroke-width="1.6" stroke-linejoin="round"/></g><g class="hap">' + HAPPY(42, 45) + HAPPY(58, 45) + '</g>' +
        '<path d="M46 54.5Q50 57 54 54.5" fill="none" stroke="' + c[3] + '" stroke-width="2" stroke-linecap="round"/>';
      const cap = '<g class="cap"><path d="M36 27Q48 14 64 26Q70 31 77 41Q70 36 63 33Q50 29 36 27Z" fill="#f2f4ff" stroke="#1b2a5e" stroke-width="1.6" stroke-linejoin="round"/><path d="M45 21.5Q52 21 58 24.5L60 30Q52 26.5 44 27Z M66 30Q70 33.5 72.5 37L70 38Q67 35 64 33Z" fill="#5fb8ff"/><circle cx="77.5" cy="42" r="3.6" fill="#fff" stroke="#1b2a5e" stroke-width="1.4"/><path d="M35 27.5Q49 30 63.5 33.5" fill="none" stroke="#1b2a5e" stroke-width="2.4" stroke-linecap="round"/></g>';
      const zz = '<g class="zz"><path d="M80 18h5l-5 5h5" fill="none" stroke="#bfeaff" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></g>';
      return batBase(p, k, face, zz, cap);
    }
    if (k === 'pink') {
      /* Bubblegum: blowing a big pink bubble */
      const face = '<g class="eyes"><ellipse cx="42" cy="43" rx="6.6" ry="7.6" fill="#fff"/><ellipse cx="58" cy="43" rx="6.6" ry="7.6" fill="#fff"/><circle cx="43.4" cy="46" r="3.9" fill="' + c[3] + '"/><circle cx="56.6" cy="46" r="3.9" fill="' + c[3] + '"/><circle cx="42.2" cy="44.6" r="1.4" fill="#fff"/><circle cx="55.4" cy="44.6" r="1.4" fill="#fff"/></g><g class="hap">' + HAPPY(42, 44) + HAPPY(58, 44) + '</g>';
      const bub = '<g class="bub"><circle cx="50" cy="60" r="11" fill="#ff9ad8" fill-opacity=".82" stroke="#c4247f" stroke-width="1.8"/><ellipse cx="45.5" cy="55.5" rx="3.6" ry="2.2" transform="rotate(-35 45.5 55.5)" fill="#fff" opacity=".85"/><circle cx="54.5" cy="65" r="1.2" fill="#fff" opacity=".6"/></g>';
      return batBase(p, k, face, '', bub);
    }
    return '';
  }
  function moonMarkup(p) {
    return '<circle class="halo" cx="50" cy="50" r="49" fill="url(#' + p + 'mhalo)"/>' +
      '<g class="mwl"><path d="M20 46C12 38 4 38 0 40C3 44 3 48 2 52C6 50 9 51 10 54C13 52 16 53 18 57Z" fill="#3a1d6e" stroke="#1a0838" stroke-width="1.8" stroke-linejoin="round"/></g>' +
      '<g class="mwr"><path d="M80 46C88 38 96 38 100 40C97 44 97 48 98 52C94 50 91 51 90 54C87 52 84 53 82 57Z" fill="#3a1d6e" stroke="#1a0838" stroke-width="1.8" stroke-linejoin="round"/></g>' +
      '<g class="mb"><circle cx="50" cy="50" r="34" fill="url(#' + p + 'moon)" stroke="#8a5200" stroke-width="2.4"/>' +
      '<circle cx="36" cy="38" r="6" fill="#e0a238" opacity=".35"/><circle cx="64" cy="64" r="7.5" fill="#e0a238" opacity=".32"/><circle cx="66" cy="34" r="4" fill="#e0a238" opacity=".3"/><circle cx="33" cy="66" r="3.5" fill="#e0a238" opacity=".3"/>' +
      '<ellipse cx="38" cy="29" rx="10" ry="5" transform="rotate(-28 38 29)" fill="#fff" opacity=".8"/><circle cx="51" cy="23" r="2" fill="#fff" opacity=".9"/>' +
      '<g class="eyes"><path d="M37 50Q42 55 47 50 M53 50Q58 55 63 50" fill="none" stroke="#6a3a00" stroke-width="2.6" stroke-linecap="round"/></g>' +
      '<path d="M44 60Q50 65 56 60" fill="none" stroke="#6a3a00" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="35" cy="57" rx="3.6" ry="2.2" fill="#ff7a6a" opacity=".5"/><ellipse cx="65" cy="57" rx="3.6" ry="2.2" fill="#ff7a6a" opacity=".5"/>' +
      '<rect x="57" y="74" width="2.2" height="2.2" transform="rotate(30 58 75)" fill="#fff"/><rect x="40" y="76" width="1.8" height="1.8" transform="rotate(10 41 77)" fill="#fff"/><rect x="72" y="46" width="2" height="2" transform="rotate(45 73 47)" fill="#fff"/></g>' +
      '<g class="tw"><path d="M86 14l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#fff6c8"/><path d="M12 80l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#fff6c8"/></g>';
  }
  function wildMarkup(p) {
    const c = FL.wild;
    let sugar = '';
    const pts = [[36, 40], [63, 33], [40, 70], [58, 81], [66, 64], [30, 60], [52, 31], [46, 84], [70, 52], [35, 76], [24, 50], [76, 50], [14, 47], [86, 47]];
    for (const [x, y] of pts) sugar += '<rect x="' + (x - 1.2) + '" y="' + (y - 1.2) + '" width="2.4" height="2.4" transform="rotate(' + ((x * 11) % 90) + ' ' + x + ' ' + y + ')" fill="#fff" opacity=".9"/>';
    return '<circle class="halo" cx="50" cy="52" r="48" fill="url(#' + p + 'mhalo)" opacity=".55"/>' +
      '<ellipse class="sh" cx="50" cy="91" rx="24" ry="4.5" fill="url(#' + p + 'shadow)"/>' +
      '<g class="wl"><path d="' + WING_L + '" fill="url(#' + p + 'rainbow)" stroke="' + c[3] + '" stroke-width="2.2" stroke-linejoin="round"/></g>' +
      '<g class="wr"><path d="' + WING_R + '" fill="url(#' + p + 'rainbow)" stroke="' + c[3] + '" stroke-width="2.2" stroke-linejoin="round"/></g>' +
      '<g class="bod"><ellipse cx="41.5" cy="86" rx="6.5" ry="3.6" fill="#a34dff" stroke="' + c[3] + '" stroke-width="1.8"/><ellipse cx="58.5" cy="86" rx="6.5" ry="3.6" fill="#2fa8ff" stroke="' + c[3] + '" stroke-width="1.8"/>' +
      '<path d="' + BODY + '" fill="url(#' + p + 'rainbow)" stroke="' + c[3] + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<ellipse cx="50" cy="60" rx="20" ry="22" fill="url(#' + p + 'glow)" opacity=".55"/>' +
      '<ellipse cx="38.5" cy="32" rx="7.5" ry="3.8" transform="rotate(-32 38.5 32)" fill="#fff" opacity=".8"/>' +
      '<g class="eyes">' + EYE(58, 42, 'wild') + '<path d="M36.5 42Q42 46 47.5 42" fill="none" stroke="' + c[3] + '" stroke-width="2.6" stroke-linecap="round"/></g><g class="hap">' + HAPPY(42, 43) + HAPPY(58, 43) + '</g>' +
      '<path d="M44 50.5Q50 55 56 50.5" fill="' + c[3] + '" stroke="' + c[3] + '" stroke-width="1.6" stroke-linejoin="round"/><path class="tongue" d="M48 52.5Q50 58.5 53 52.8Z" fill="#ff4f86"/>' +
      sugar +
      '<g class="band"><rect x="27" y="62" width="46" height="15" rx="7.5" fill="url(#' + p + 'wband)" stroke="#fff" stroke-width="1.6"/>' +
      '<text x="50" y="73.6" text-anchor="middle" font-family="' + DISPLAY + '" font-size="12" fill="#fff" stroke="#ff3d9a" stroke-width=".6" letter-spacing=".5">WILD</text></g></g>';
  }
  function symInner(p, s) { const k = KEYS[s]; return s === SYM.MOON ? moonMarkup(p) : s === SYM.WILD ? wildMarkup(p) : batMarkup(p, k); }
  /* symbol markup cache (the game id prefix only) */
  const symCache = {};
  function symSvg(s) {
    if (!symCache[s]) symCache[s] = '<svg class="sym" viewBox="0 0 100 100" aria-hidden="true">' + symInner(P, s) + '</svg>';
    return symCache[s];
  }
  const P = 'gb-';

  /* ---------- the factory ---------- */
  function sceneSvg() {
    const p = P + 'sc-';
    let s = '<svg class="bg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      lg(p + 'wall', [[0, '#120a2e'], [0.55, '#1c1142'], [1, '#2a1650']]) +
      lg(p + 'sky', [[0, '#05031a'], [0.6, '#141046'], [1, '#2e1f6a']]) +
      rg(p + 'mglow', [[0, '#fff3b8', 0.9], [0.25, '#ffd65a', 0.45], [0.6, '#ff9a3c', 0.12], [1, '#ff9a3c', 0]]) +
      rg(p + 'moon', [[0, '#fffef2'], [0.5, '#ffe98f'], [0.9, '#f0b53a'], [1, '#c27a12']], 0.42, 0.38, 0.6) +
      lg(p + 'steel', [[0, '#5c6c98'], [0.45, '#2c3660'], [1, '#141a36']]) +
      lg(p + 'pipe', [[0, '#8a97c4'], [0.35, '#4a5788'], [0.7, '#252e58'], [1, '#121733']]) +
      lg(p + 'pipeV', [[0, '#252e58'], [0.35, '#6c79aa'], [0.6, '#3a4677'], [1, '#121733']], 0, 0, 1, 0) +
      lg(p + 'cone', [[0, '#ffd27a', 0.55], [1, '#ffd27a', 0]]) +
      lg(p + 'coneN', [[0, '#ff3d9a', 0.6], [1, '#ff3d9a', 0]]) +
      lg(p + 'floor', [[0, '#1d123e'], [1, '#07041a']]) +
      lg(p + 'belt', [[0, '#3a3f5e'], [0.5, '#1a1d33'], [1, '#0b0c18']]) +
      lg(p + 'vatG', [[0, '#ff5fa8', 0.85], [1, '#a3125a', 0.95]]) +
      lg(p + 'vatG2', [[0, '#5fe0ff', 0.85], [1, '#1252a3', 0.95]]) +
      lg(p + 'glass', [[0, '#fff', 0.25], [0.3, '#fff', 0.05], [1, '#fff', 0]], 0, 0, 1, 0) +
      '<pattern id="' + p + 'stud" width="40" height="22" patternUnits="userSpaceOnUse"><rect width="40" height="22" fill="url(#' + p + 'belt)"/><rect x="0" y="0" width="3" height="22" fill="#000" opacity=".45"/><rect x="3" y="2" width="2" height="18" fill="#fff" opacity=".08"/></pattern>' +
      '</defs>';
    s += '<rect width="1600" height="1000" fill="url(#' + p + 'wall)"/>';
    /* three arched windows onto the night sky; the moon sits in the middle one */
    const win = (x, w) => '<path d="M' + x + ' 560V230Q' + x + ' ' + (230 - w * 0.55) + ' ' + (x + w / 2) + ' ' + (230 - w * 0.55) + 'Q' + (x + w) + ' ' + (230 - w * 0.55) + ' ' + (x + w) + ' 230V560Z"';
    s += '<g class="sky">';
    for (const [x, w] of [[150, 300], [600, 400], [1150, 300]]) s += win(x, w) + ' fill="url(#' + p + 'sky)"/>';
    s += '<g class="stars">';
    const rs = (i) => ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 90; i++) {
      const wi = i % 3, x0 = [150, 600, 1150][wi], w = [300, 400, 300][wi];
      const x = x0 + 10 + rs(i) * (w - 20), y = 120 + rs(i + 50) * 420;
      if (y < 230 - w * 0.4 && Math.abs(x - (x0 + w / 2)) > w * 0.3) continue;
      s += '<circle class="st" cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (rs(i + 9) < 0.12 ? 2.2 : 1.1) + '" fill="' + (rs(i + 3) < 0.2 ? '#ffe9a8' : '#fff') + '" opacity="' + (0.4 + rs(i + 7) * 0.6).toFixed(2) + '"/>';
    }
    s += '</g>';
    s += '<g class="bigmoon"><circle cx="800" cy="330" r="250" fill="url(#' + p + 'mglow)"/><circle cx="800" cy="330" r="118" fill="url(#' + p + 'moon)"/>' +
      '<circle cx="752" cy="296" r="22" fill="#e0a238" opacity=".28"/><circle cx="842" cy="372" r="28" fill="#e0a238" opacity=".26"/><circle cx="850" cy="282" r="13" fill="#e0a238" opacity=".24"/><circle cx="760" cy="390" r="11" fill="#e0a238" opacity=".24"/>' +
      '<ellipse cx="752" cy="258" rx="40" ry="18" transform="rotate(-28 752 258)" fill="#fff" opacity=".55"/>' +
      '<path d="M760 340Q775 352 790 340 M810 340Q825 352 840 340" fill="none" stroke="#8a5200" stroke-width="5" stroke-linecap="round" opacity=".55"/><path d="M782 372Q800 386 818 372" fill="none" stroke="#8a5200" stroke-width="5" stroke-linecap="round" opacity=".5"/></g>';
    /* bats crossing the moon */
    s += '<g class="fbats"><g class="fb fb1"><path transform="translate(640 250) scale(.45)" d="' + Batty.batPath + '" fill="#0b0620"/></g><g class="fb fb2"><path transform="translate(900 210) scale(.32)" d="' + Batty.batPath + '" fill="#0b0620"/></g><g class="fb fb3"><path transform="translate(300 300) scale(.28)" d="' + Batty.batPath + '" fill="#0b0620"/></g></g>';
    s += '</g>';
    /* window frames and mullions */
    for (const [x, w] of [[150, 300], [600, 400], [1150, 300]]) {
      s += win(x, w) + ' fill="none" stroke="url(#' + p + 'steel)" stroke-width="18"/>';
      for (let k = 1; k < 3; k++) s += '<rect x="' + (x + (w * k) / 3 - 4) + '" y="' + (230 - w * 0.5) + '" width="8" height="' + (330 + w * 0.5) + '" fill="#232a4f"/>';
      for (const y of [300, 420]) s += '<rect x="' + x + '" y="' + (y - 4) + '" width="' + w + '" height="8" fill="#232a4f"/>';
      s += '<rect x="' + (x - 20) + '" y="556" width="' + (w + 40) + '" height="18" rx="4" fill="#2c3660"/>';
    }
    /* the NIGHT SHIFT neon sign (dark until the free spins) */
    s += '<g class="neon" transform="translate(800 92)"><rect x="-190" y="-40" width="380" height="80" rx="16" fill="#0a0620" stroke="#2c3660" stroke-width="6"/>' +
      '<text class="nt" x="0" y="16" text-anchor="middle" font-family="' + DISPLAY + '" font-size="46" letter-spacing="4" fill="none" stroke="#5a2a5e" stroke-width="3">NIGHT SHIFT</text></g>';
    /* pipes across the top and down the sides */
    s += '<rect x="0" y="150" width="1600" height="34" fill="url(#' + p + 'pipe)"/><rect x="0" y="196" width="1600" height="16" fill="url(#' + p + 'pipe)" opacity=".8"/>';
    for (const x of [90, 520, 1080, 1510]) s += '<rect x="' + (x - 14) + '" y="144" width="28" height="46" rx="5" fill="#5a6696" stroke="#141a36" stroke-width="3"/>';
    s += '<rect x="40" y="150" width="36" height="850" fill="url(#' + p + 'pipeV)"/><rect x="1524" y="150" width="36" height="850" fill="url(#' + p + 'pipeV)"/>';
    s += '<rect x="34" y="420" width="48" height="22" rx="5" fill="#5a6696"/><rect x="1518" y="420" width="48" height="22" rx="5" fill="#5a6696"/>';
    /* warning beacons on the side pipes (spin in the night shift) */
    for (const x of [58, 1542]) s += '<g class="beacon" transform="translate(' + x + ' 470)"><rect x="-16" y="-4" width="32" height="10" rx="3" fill="#2c3660"/><path d="M-12 -4V-24Q0 -36 12 -24V-4Z" fill="#7a1d3a" class="bl"/><path d="M-6 -22Q0 -28 6 -22" stroke="#fff" stroke-width="2" fill="none" opacity=".5"/></g>';
    /* hanging lamps with light cones */
    s += '<g class="lamps">';
    for (const x of [330, 1270]) {
      s += '<path class="cone" d="M' + (x - 26) + ' 266L' + (x - 190) + ' 900L' + (x + 190) + ' 900L' + (x + 26) + ' 266Z" fill="url(#' + p + 'cone)"/>';
      s += '<path class="coneN" d="M' + (x - 26) + ' 266L' + (x - 190) + ' 900L' + (x + 190) + ' 900L' + (x + 26) + ' 266Z" fill="url(#' + p + 'coneN)"/>';
      s += '<rect x="' + (x - 2) + '" y="184" width="4" height="62" fill="#1a1f3d"/><path d="M' + (x - 34) + ' 270Q' + (x - 30) + ' 240 ' + x + ' 238Q' + (x + 30) + ' 240 ' + (x + 34) + ' 270Z" fill="#3c4778" stroke="#141a36" stroke-width="3"/><ellipse class="bulb" cx="' + x + '" cy="270" rx="22" ry="6" fill="#ffe7a6"/>';
    }
    s += '</g>';
    /* jelly vats left and right, with rising bubbles */
    const vat = (x, g, cls) => '<g class="vat ' + cls + '" transform="translate(' + x + ' 560)"><rect x="-110" y="0" width="220" height="250" rx="26" fill="#232a4f" stroke="#0d1028" stroke-width="5"/>' +
      '<rect x="-90" y="26" width="180" height="200" rx="16" fill="#0b0d22"/><rect class="jel" x="-90" y="86" width="180" height="140" rx="14" fill="url(#' + p + g + ')"/>' +
      '<g class="vb"><circle cx="-40" cy="200" r="9" fill="#fff" opacity=".35"/><circle cx="10" cy="210" r="6" fill="#fff" opacity=".35"/><circle cx="50" cy="190" r="11" fill="#fff" opacity=".3"/><circle cx="-60" cy="214" r="5" fill="#fff" opacity=".35"/></g>' +
      '<rect x="-90" y="26" width="180" height="200" rx="16" fill="url(#' + p + 'glass)"/><rect x="-120" y="-16" width="240" height="26" rx="8" fill="#3c4778" stroke="#0d1028" stroke-width="4"/>' +
      '<circle cx="-70" cy="240" r="7" fill="#5a6696"/><circle cx="70" cy="240" r="7" fill="#5a6696"/></g>';
    s += vat(200, 'vatG', 'v1') + vat(1400, 'vatG2', 'v2');
    /* the back conveyor: gummy bats riding to the packing room */
    let riders = '';
    for (let i = 0; i < 12; i++) riders += '<g transform="translate(' + (i * 140) + ' 0) scale(.38)">' + batMarkup(p + 'r-', KEYS[i % 7]) + '</g>';
    s += '<defs>' + symDefs(p + 'r-') + '</defs>';
    s += '<g class="belt b1"><rect x="0" y="672" width="1600" height="22" fill="url(#' + p + 'stud)"/><g class="roll">' +
      '<g transform="translate(0 634)">' + riders + '<g transform="translate(1680 0)">' + riders + '</g></g></g>' +
      '<rect x="0" y="694" width="1600" height="12" fill="#0b0c18"/>';
    for (let x = 30; x < 1600; x += 180) s += '<rect x="' + x + '" y="706" width="14" height="120" fill="#1a1f3d"/>';
    s += '</g>';
    /* floor */
    s += '<rect x="0" y="826" width="1600" height="174" fill="url(#' + p + 'floor)"/><path d="M0 826H1600" stroke="#3a3f6e" stroke-width="3"/>';
    for (let x = -200; x < 1800; x += 120) s += '<path d="M800 826L' + x + ' 1000" stroke="#2a2456" stroke-width="2" opacity=".5"/>';
    /* stacked jelly moulds in the front corners */
    const mould = (x, y, sc, col) => { let m = '<g transform="translate(' + x + ' ' + y + ') scale(' + sc + ')"><rect x="0" y="0" width="200" height="40" rx="8" fill="#3c4778" stroke="#0d1028" stroke-width="4"/>'; for (let i = 0; i < 5; i++) m += '<rect x="' + (12 + i * 38) + '" y="8" width="28" height="24" rx="8" fill="#0d1028"/><ellipse cx="' + (26 + i * 38) + '" cy="22" rx="10" ry="7" fill="' + col[i % col.length] + '" opacity=".85"/>'; return m + '</g>'; };
    s += mould(40, 900, 1, ['#ff2a4f', '#ffd61f', '#6edc2c']) + mould(70, 856, 0.85, ['#9a46ff', '#ff66c4']) + mould(1360, 900, 1, ['#2ea8ff', '#ff8d1f', '#ff66c4']) + mould(1390, 856, 0.85, ['#ffd61f', '#6edc2c']);
    s += '</svg>';
    return s;
  }

  /* ---------- the logo ---------- */
  function logoSvg(p, small) {
    const cols = [['#ff7a92', '#ff2a4f'], ['#ffc27a', '#ff8d1f'], ['#fff07a', '#ffd61f'], ['#b8f58a', '#4fc81e'], ['#9fdcff', '#2ea8ff']];
    const cols2 = [['#d9b0ff', '#9a46ff'], ['#ffb8e4', '#ff66c4'], ['#ff7a92', '#ff2a4f'], ['#fff07a', '#ffd61f']];
    let d = '';
    cols.forEach((c, i) => { d += lg(p + 'l' + i, [[0, c[0]], [1, c[1]]]); });
    cols2.forEach((c, i) => { d += lg(p + 'm' + i, [[0, c[0]], [1, c[1]]]); });
    let s = '<svg class="logo" viewBox="0 0 300 150" aria-label="Gummy Bats" role="img"><defs>' + d + '</defs>';
    s += '<g transform="translate(150 22) scale(.42)"><path transform="translate(-60 -29)" d="' + Batty.batPath + '" fill="#1a0838" stroke="#ffd61f" stroke-width="5" stroke-linejoin="round"/></g>';
    const word = (txt, y, size, gp, spacing) => {
      let out = ''; const w = txt.length * spacing, x0 = 150 - w / 2 + spacing / 2;
      for (let i = 0; i < txt.length; i++) {
        const x = x0 + i * spacing, rot = [-6, 4, -3, 5, -4][i % 5];
        out += '<g class="lt" style="animation-delay:' + (-i * 0.23).toFixed(2) + 's"><text x="' + x + '" y="' + y + '" transform="rotate(' + rot + ' ' + x + ' ' + y + ')" text-anchor="middle" font-family="' + DISPLAY + '" font-size="' + size + '" fill="url(#' + p + gp + (i % (gp === 'l' ? 5 : 4)) + ')" stroke="#1a0838" stroke-width="7" paint-order="stroke" stroke-linejoin="round">' + txt[i] + '</text>' +
          '<text x="' + (x - 3) + '" y="' + (y - size * 0.42) + '" transform="rotate(' + rot + ' ' + x + ' ' + y + ')" text-anchor="middle" font-family="' + DISPLAY + '" font-size="' + (size * 0.22) + '" fill="#fff" opacity=".8">•</text></g>';
      }
      return out;
    };
    s += word('GUMMY', 82, 58, 'l', 50) + word('BATS', 138, 52, 'm', 46);
    s += '</svg>';
    return s;
  }

  /* ---------- the lobby poster (300 x 380) ---------- */
  function poster() {
    const p = 'gbpo-';
    let s = '<svg viewBox="0 0 300 380" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>' + symDefs(p) +
      lg(p + 'bg', [[0, '#0a0624'], [0.6, '#22134e'], [1, '#3a1a5e']]) + rg(p + 'mg', [[0, '#fff3b8', 0.95], [0.3, '#ffd65a', 0.5], [1, '#ff9a3c', 0]]) +
      lg(p + 'belt', [[0, '#4a4f72'], [1, '#12142a']]) + '</defs>';
    s += '<rect width="300" height="380" fill="url(#' + p + 'bg)"/>';
    for (let i = 0; i < 36; i++) s += '<circle cx="' + ((i * 83) % 300) + '" cy="' + ((i * 47) % 190) + '" r="' + (i % 6 ? 0.8 : 1.6) + '" fill="#fff" opacity="' + (0.3 + (i % 4) * 0.15) + '"/>';
    s += '<circle cx="150" cy="120" r="140" fill="url(#' + p + 'mg)"/>';
    s += '<g transform="translate(78 30) scale(1.45)">' + moonMarkup(p) + '</g>';
    s += '<path d="M0 64H300M0 76H300" stroke="#2c3660" stroke-width="7"/>';
    s += '<rect x="0" y="292" width="300" height="16" fill="url(#' + p + 'belt)"/><rect x="0" y="308" width="300" height="72" fill="#0a0620"/>';
    s += '<g transform="translate(-6 196) scale(1.02) rotate(-8 50 50)">' + batMarkup(p, 'grape') + '</g>';
    s += '<g transform="translate(200 192) scale(1.02) rotate(8 50 50)">' + batMarkup(p, 'pink') + '</g>';
    s += '<g transform="translate(86 168) scale(1.32)">' + batMarkup(p, 'cherry') + '</g>';
    s += '<g transform="translate(0 286) scale(1)">' + logoSvg(p + 'lg-').replace('<svg class="logo"', '<svg width="300" height="150"') + '</g>';
    s += '</svg>';
    return s;
  }

  /* =====================================================================================
     RULES
     ===================================================================================== */
  function iconSvg(s, cls) { return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 100 100" aria-hidden="true">' + symInner('gbr-', s) + '</svg>'; }
  function rules() {
    const st = (stakeCtl && stakeCtl.value) || Batty.STAKES[2], u = st / U, f = (n) => Batty.fmt(n * u);
    let t = '<div class="gummy-rules"><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + symDefs('gbr-') + '</defs></svg>';
    t += '<p class="lead">A 7×7 grid of jelly bats fresh from the moulds of the Batty candy factory. Clusters pay, winners pop, the sweets tumble, and every pop leaves its mark on the mould: the multiplier spots.</p>';
    t += '<h3>Cluster pays</h3><p>5 or more matching gummy bats joined edge to edge (up, down, left or right, never corner to corner) form a cluster and pay by its size. Amounts below are for your current stake of <b>' + Batty.fmt(st) + ' BB</b>.</p>';
    t += '<table class="pt"><thead><tr><th></th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15+</th></tr></thead><tbody>';
    for (let s = 0; s < M.PAYERS; s++) {
      t += '<tr><th>' + iconSvg(s) + '<span>' + NAMES[s] + '</span></th>';
      for (let j = 0; j < 11; j++) t += '<td>' + f(M.PAY[s][j]) + '</td>';
      t += '</tr>';
    }
    t += '</tbody></table>';
    t += '<h3>Tumbles</h3><p>Every bat in a winning cluster pops. The sweets above drop down, new ones fall in from the hopper, and the grid pays again, for as long as new clusters keep forming. One paid spin can tumble many times.</p>';
    t += '<div class="rrow">' + iconSvg(SYM.WILD, 'ico big') + '<div><h3>Sour Bat wild</h3><p>The Sour Bat only ever drops in during tumbles, never on the opening drop. It stands in for any gummy bat and joins every cluster it touches, so one Sour Bat can complete clusters of two different flavours at once, or join two clusters of the same flavour into one bigger one. It pops with the cluster.</p></div></div>';
    t += '<h3>Multiplier spots</h3><div class="spotdemo"><span class="sd m"></span><b>→</b><span class="sd x">×2</span><b>→</b><span class="sd x">×4</span><b>→</b><span class="sd x">×8</span><b>…</b><span class="sd x big">×1024</span></div>';
    t += '<p>Every cell of the jelly mould has a spot. The first time a winning bat pops on a cell, its spot is <b>marked</b>. The next pop there turns it into a <b>×2 multiplier spot</b>, and every pop after that doubles it: ×4, ×8, ×16 and so on, up to <b>×1024</b>.</p>';
    t += '<p>When a cluster wins, the values of every multiplier spot under it are <b>added together</b>, and the cluster’s pay is multiplied by that total. (A cluster sitting on a ×2 and a ×8 pays 10 times.) Clusters with no multiplier spots under them pay as normal. A cluster is paid first; then its pop marks or doubles the spots beneath it.</p>';
    t += '<p>In the base game the spots last for the whole tumble sequence of that spin and are cleared when the next spin starts. In the free spins they stay for the <b>whole feature</b>, getting bigger and bigger.</p>';
    t += '<div class="rrow">' + iconSvg(SYM.MOON, 'ico big') + '<div><h3>Gummy Moons and the Night Shift</h3><p>Gummy Moons are the scatters. They never pop, so every Moon that lands, on the opening drop or in a tumble, is still on the grid when the tumbling stops. Count them then:</p>' +
      '<table class="fst"><tr><th>Moons</th><td>3</td><td>4</td><td>5</td><td>6</td><td>7+</td></tr><tr><th>Free spins</th><td>10</td><td>12</td><td>15</td><td>20</td><td>30</td></tr></table></div></div>';
    t += '<p>The factory switches to the <b>Night Shift</b>. The multiplier spots stay put from one free spin to the next. Landing 3 or more Moons in a free spin adds the same number of spins again, as often as it happens.</p>';
    t += '<h3>Buy the feature</h3><p><b>Free Spins</b> for ' + M.BUY_X + '× your stake (' + Batty.fmt(st * M.BUY_X) + ' BB): one spin with 3 to 7 guaranteed Moons on the opening drop, then the Night Shift.</p>';
    t += '<p><b>Super Free Spins</b> for ' + M.SUPER_X + '× your stake (' + Batty.fmt(st * M.SUPER_X) + ' BB): the same, but every one of the 49 spots starts the feature as a <b>×' + M.SUPER_SPOT + ' multiplier spot</b>.</p>';
    t += '<h3>Max win</h3><p>A round (the spin, every tumble and the whole feature) can pay up to <b>' + Batty.fmt(M.MAX_WIN_X) + '×</b> your stake. When that is reached the round ends there and pays the max win.</p>';
    t += '<h3>The numbers</h3><table class="nums">' +
      '<tr><th>Return (paid spins)</th><td>' + SIM.base + '% over ' + SIM.rounds + ' simulated spins</td></tr>' +
      '<tr><th>Return (Free Spins buy)</th><td>' + SIM.buy + '% over ' + SIM.buys + ' simulated buys</td></tr>' +
      '<tr><th>Return (Super Free Spins buy)</th><td>' + SIM.super + '% over ' + SIM.supers + ' simulated buys</td></tr>' +
      '<tr><th>Hit rate</th><td>' + SIM.hit + ' paid spins wins something</td></tr>' +
      '<tr><th>Free spins</th><td>' + SIM.fs + ' paid spins, on average</td></tr>' +
      '<tr><th>Max win</th><td>' + SIM.max + '× stake (reached in the simulations)</td></tr>' +
      '<tr><th>Volatility</th><td>' + SIM.vol + '</td></tr></table>';
    t += '<h3>Playing</h3><p><b>Spin</b> (or Space) plays a round. Tap the grid, the Spin button or Space during a round to hurry it along: the result is already decided, so this only skips the show. <b>Turbo</b> (T) speeds everything up. <b>Auto</b> (A) plays up to 250 rounds, stopping at your loss limit, when free spins start (if you ask it to), or when you run short. B opens the buy menu.</p>';
    t += '<p class="fine">Every outcome is decided by the casino server before the show starts, from a certified random source; the animation only reveals it. Pays are in whole Batty Bucks, rounded down. Batty Bucks have no cash value.</p></div>';
    return t;
  }

  /* =====================================================================================
     THE GAME
     ===================================================================================== */
  let S = null, root = null, E = null, stakeCtl = null, DEV = false;
  let busy = false, turbo = false, hurry = false, mode = 'base', lay = '';
  let auto = 0, autoLimit = 0, autoStart = 0, autoStopFs = true;
  let cw = 60, cells = [], spots = new Array(CELLS).fill(0), spotEls = [], badgeEls = [], skipFns = [], tapFn = null;
  let parts = [], partStop = null, fxCx = null, fxDpr = 1, ambCx = null, ambParts = [], ambDpr = 1, gridOff = { x: 0, y: 0 };
  let devNext = null, devSpeed = 1;
  const A = Batty.audio, N = Batty.notes;
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = (ms) => ms * (turbo ? 0.5 : 1) * (hurry ? 0.22 : 1) * (reduce() ? 0.6 : 1) * devSpeed;
  function nap(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; const i = skipFns.indexOf(fin); if (i >= 0) skipFns.splice(i, 1); res(); };
      skipFns.push(fin); S.timeout(fin, T(ms));
    });
  }
  function doSkip() { hurry = true; const f = skipFns.slice(); skipFns.length = 0; f.forEach((x) => x()); if (E) E.frame.classList.add('hurry'); }
  function waitTap(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; tapFn = null; res(); };
      tapFn = fin; S.timeout(fin, hurry ? Math.min(ms, 1200) : ms);
    });
  }

  /* ---------- Gummy Bats' own sound kit (all synthesised) ---------- */
  const snd = {
    plop(col) { A.tone({ f: 250 + col * 22, f2: 105, d: 0.13, type: 'sine', v: 0.22 }); A.noise({ d: 0.05, v: 0.05, lp: 900 }); },
    squish(i) { A.tone({ f: 520 + (i || 0) * 30, f2: 170, d: 0.15, type: 'triangle', v: 0.06 }); },
    land(n) { A.tone({ f: 700 + n * 60, f2: 1100 + n * 60, d: 0.05, type: 'sine', v: 0.05 }); },
    moon(n) { const f = [659.3, 784, 987.8, 1174.7, 1318.5, 1568, 1760][Math.min(6, n)]; A.tone({ f, d: 0.7, type: 'sine', v: 0.2 }); A.tone({ f: f * 2, d: 0.45, type: 'sine', v: 0.06, t: 0.03 }); A.tone({ f: f * 1.5, d: 0.55, type: 'triangle', v: 0.07, t: 0.08 }); },
    tease(k) { const b = 220 * Math.pow(2, k / 6); A.tone({ f: b, f2: b * 2, d: 1.1, type: 'sawtooth', v: 0.035 }); A.tone({ f: b * 1.5, f2: b * 3, d: 1.1, type: 'triangle', v: 0.05 }); A.noise({ d: 1, v: 0.04, hp: 2500, f2: 9000 }); },
    cluster(k) { const b = 392 * Math.pow(2, Math.min(k, 12) / 12); A.seq([b, b * 1.26, b * 1.5, b * 2], { step: 0.055, type: 'triangle', v: 0.15 }); },
    giggle() { for (let i = 0; i < 5; i++) A.tone({ f: 880 + (i % 2) * 220 + i * 30, f2: 700 + (i % 2) * 260, d: 0.06, type: 'sine', v: 0.05, t: 0.12 + i * 0.07 }); },
    pop(i) { A.tone({ f: 330 + i * 40, f2: 1500 + i * 60, d: 0.06, type: 'sine', v: 0.13, t: i * 0.022 }); },
    splat() { A.noise({ d: 0.22, v: 0.13, lp: 1500, f2: 200 }); A.tone({ f: 190, f2: 70, d: 0.18, type: 'sine', v: 0.16 }); },
    mark(i) { A.tone({ f: 1320 + (i % 4) * 90, d: 0.09, type: 'sine', v: 0.045, t: (i % 6) * 0.025 }); },
    spot(v, i) { const f = 523.3 * Math.pow(2, Math.log2(v) / 5); A.tone({ f, d: 0.32, type: 'sine', v: 0.12, t: (i % 6) * 0.03 }); A.tone({ f: f * 2.01, d: 0.22, type: 'sine', v: 0.04, t: (i % 6) * 0.03 + 0.01 }); },
    slam(i) { A.tone({ f: 150, f2: 48, d: 0.17, type: 'sine', v: 0.3 }); A.noise({ d: 0.07, v: 0.08, lp: 2600 }); A.tone({ f: 1046.5 * Math.pow(2, Math.min(i, 14) / 12), d: 0.24, type: 'square', v: 0.045, t: 0.02 }); },
    fly() { A.tone({ f: 500, f2: 1800, d: 0.2, type: 'sine', v: 0.06 }); },
    spin() { A.noise({ d: 0.3, v: 0.07, lp: 500, f2: 2500 }); A.tone({ f: 180, f2: 520, d: 0.2, type: 'triangle', v: 0.06 }); },
    wobble() { A.tone({ f: 180, f2: 140, d: 0.25, type: 'sine', v: 0.08 }); },
    siren() { for (let i = 0; i < 3; i++) { A.tone({ f: 520, f2: 980, d: 0.45, type: 'sawtooth', v: 0.035, t: i * 0.9 }); A.tone({ f: 980, f2: 520, d: 0.45, type: 'sawtooth', v: 0.035, t: i * 0.9 + 0.45 }); } },
    intro() { A.seq([N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, [N.E6, 3]], { step: 0.1, type: 'square', v: 0.08 }); A.seq([130.8, 0, 196, 0, 261.6, 0, [261.6, 4]], { step: 0.1, type: 'triangle', v: 0.2 }); },
    retrig() { A.seq([N.E5, N.G5, N.B5, [N.E6, 2]], { step: 0.07, type: 'square', v: 0.1 }); },
    outro() { A.seq([N.G4, N.C5, N.E5, N.G5, N.E5, N.G5, [N.C6, 4]], { step: 0.11, type: 'triangle', v: 0.17 }); },
    lights() { A.tone({ f: 60, d: 0.4, type: 'sawtooth', v: 0.08 }); A.noise({ d: 0.12, v: 0.12, hp: 3000 }); A.noise({ d: 0.12, v: 0.1, hp: 3000, t: 0.25 }); },
    tick() { A.tone({ f: 1700, d: 0.02, type: 'square', v: 0.025 }); },
  };

  /* ---------- build ---------- */
  function mount(el, B) {
    S = B.scope(); root = el; busy = false; hurry = false; mode = 'base'; lay = ''; cells = []; skipFns = []; tapFn = null; parts = []; partStop = null; ambParts = [];
    auto = 0; turbo = false; devNext = null; devSpeed = 1; spots = new Array(CELLS).fill(0); spotEls = []; badgeEls = [];
    try { turbo = localStorage.getItem('gummy-turbo') === '1'; } catch (e) { /* ignore */ }
    DEV = !Batty.online && (() => { try { return localStorage.getItem('batty-dev') === '1'; } catch (e) { return false; } })();
    E = {};
    root.innerHTML = '<svg class="gdefs" aria-hidden="true"><defs>' + symDefs(P) + '</defs></svg>';
    E.scene = h('div', { class: 'scene', html: sceneSvg() });
    E.amb = h('canvas', { class: 'amb', 'aria-hidden': 'true' }); ambCx = E.amb.getContext('2d');

    E.logo = h('div', { class: 'brand', html: logoSvg(P + 'lg-') });
    /* the machine: hopper nozzles, the mould tray (spots under the gummies, badges over them), the belt */
    E.hopper = h('div', { class: 'hopper' });
    E.nozzles = [];
    for (let c = 0; c < COLS; c++) { const n = h('i', { class: 'nz' }); E.nozzles.push(n); E.hopper.append(n); }
    E.spots = h('div', { class: 'spots' });
    E.grid = h('div', { class: 'grid', onclick: () => { if (tapFn) tapFn(); else if (busy) doSkip(); } });
    E.badges = h('div', { class: 'badges' });
    E.outl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); E.outl.setAttribute('class', 'outl'); E.outl.setAttribute('aria-hidden', 'true');
    E.labels = h('div', { class: 'labels' });
    E.tease = h('div', { class: 'teasecols' });
    E.banner = h('div', { class: 'banner' });
    for (let c = 0; c < CELLS; c++) {
      const sp = h('i', { class: 'spot' }), bd = h('b', { class: 'badge' });
      spotEls.push(sp); badgeEls.push(bd); E.spots.append(sp); E.badges.append(bd);
    }
    E.tray = h('div', { class: 'tray' }, E.spots, E.tease, E.grid, E.badges, E.outl, E.labels);
    E.frame = h('div', { class: 'frame' }, h('i', { class: 'rivets' }), E.tray, E.banner);
    E.belt = h('div', { class: 'belt' }, h('i'));
    E.machine = h('div', { class: 'machine' }, E.hopper, E.frame, E.belt);

    /* hud */
    E.win = h('output', null, '0');
    E.fsLeft = h('output', null, '0');
    E.top = h('output', null, '×0');
    E.hud = h('div', { class: 'hud' },
      h('div', { class: 'cell w' }, h('small', null, 'Win'), E.win),
      h('div', { class: 'cell fsl' }, h('small', null, 'Free spins'), E.fsLeft),
      h('div', { class: 'cell top' }, h('small', null, 'Top spot'), E.top));
    E.msg = h('p', { class: 'msg', 'aria-live': 'polite' }, '');

    /* buys */
    E.buy = h('button', { class: 'feat buy', type: 'button', id: 'gummy-buy', onclick: () => openBuy() },
      h('span', { class: 'ico', html: symSvg(SYM.MOON) }), h('span', { class: 't' }, h('b', null, 'Buy Free Spins'), h('small', null, '')));
    E.sbuy = h('button', { class: 'feat sbuy', type: 'button', id: 'gummy-sbuy', onclick: () => openBuy('super') },
      h('span', { class: 'ico', html: symSvg(SYM.MOON) + '<em>×2</em>' }), h('span', { class: 't' }, h('b', null, 'Super Free Spins'), h('small', null, '')));
    E.feats = h('div', { class: 'feats' }, E.buy, E.sbuy);
    E.keys = h('div', { class: 'keys', html: '<b>Space</b> spin <b>T</b> turbo <b>A</b> auto <b>B</b> buy' });

    /* paytable side panel (wide screens) */
    E.pay = h('div', { class: 'paytbl' });
    E.sideR = h('aside', { class: 'side r' }, h('h4', null, 'Cluster pays'), E.pay, h('div', { class: 'sexp', html: '<span class="sd m"></span><span class="sd x">×2</span><span class="sd x">×4</span><span class="sd x t3">×64</span><p>Pops mark the mould, then double it, up to <b>×1024</b>. Spots under a cluster add up and multiply it.</p>' }));
    E.side = h('aside', { class: 'side l' });

    /* controls */
    E.stakeBox = h('div', { class: 'stakebox' });
    stakeCtl = Batty.ui.stake(E.stakeBox, { id: ID, onChange: paintStake, label: 'Stake · BB' });
    E.spin = h('button', { class: 'spin', type: 'button', id: 'gummy-spin', 'aria-label': 'Spin', onclick: primary, html: spinSvg() + '<span class="n"></span>' });
    E.autoBtn = h('button', { class: 'btn auto', type: 'button', id: 'gummy-auto', 'aria-label': 'Autoplay', 'aria-haspopup': 'true', onclick: autoClick }, h('b', null, 'Auto'), h('small', null, 'off'));
    E.turboBtn = h('button', { class: 'btn turbo', type: 'button', id: 'gummy-turbo', 'aria-label': 'Turbo', 'aria-pressed': String(turbo), onclick: toggleTurbo }, h('b', null, 'Turbo'), h('small', null, turbo ? 'on' : 'off'));
    E.autoMenu = buildAutoMenu();
    E.ctlRow = h('div', { class: 'ctlrow' }, h('div', { class: 'l' }, E.stakeBox), E.spin, h('div', { class: 'r' }, E.autoBtn, E.turboBtn));
    E.ctl = h('div', { class: 'ctl' }, E.ctlRow, E.autoMenu);

    E.main = h('div', { class: 'main' }, E.hud, E.machine, E.msg);
    E.wrap = h('div', { class: 'wrap' }, E.side, E.main, E.sideR, E.ctl);
    E.fx = h('canvas', { class: 'fxc', 'aria-hidden': 'true' }); fxCx = E.fx.getContext('2d');
    E.ov = h('div', { class: 'ov', hidden: true, onclick: (e) => { if (tapFn && !e.target.closest('button')) tapFn(); } });
    E.flash = h('div', { class: 'flash' });
    root.append(E.scene, E.amb, E.wrap, E.fx, E.flash, E.ov);
    if (DEV) root.append(devPanel());

    /* the opening grid: a quiet, winless arrangement */
    const open = [4, 1, 6, 2, 5, 0, 3, 2, 5, 3, 0, 6, 1, 4, 6, 0, 4, 1, 3, 5, 2, 1, 3, 2, 5, 0, 7, 6, 5, 6, 0, 4, 2, 3, 1, 0, 2, 5, 3, 6, 4, 5, 3, 4, 1, 6, 0, 1, 2];
    layout();
    for (let c = 0; c < CELLS; c++) { const o = makeCell(open[c]); place(o, (c / ROWS) | 0, c % ROWS); cells[c] = o; E.grid.append(o.el); }
    paintSpots();

    paintStake(); paintCtl(); setMsg('Clusters of 5 or more pay · every pop marks the mould');
    const ro = new ResizeObserver(layout); ro.observe(root); S._ro = ro; S.on(window, 'resize', layout);
    S.on(document, 'keydown', onKey);
    S.on(document, 'click', (e) => { if (E && !E.autoMenu.hidden && !e.target.closest('.automenu') && !e.target.closest('#gummy-auto')) E.autoMenu.hidden = true; });
    S.interval(idleTick, 650);
    if (!reduce()) S.loop(ambStep);
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    S = null; root = null; E = null; cells = []; skipFns = []; tapFn = null; busy = false; auto = 0; parts = []; partStop = null; ambParts = []; devSpeed = 1;
    if (window.__gummyDev) delete window.__gummyDev;
  }

  function spinSvg() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><defs>' + rg(P + 'spinb', [[0, '#ffb3d9'], [0.45, '#ff4fa8'], [0.85, '#c3126e'], [1, '#6a0a3c']], 0.4, 0.35, 0.7) + '</defs>' +
      '<circle cx="50" cy="50" r="46" fill="url(#' + P + 'spinb)" stroke="#3a0622" stroke-width="4"/>' +
      '<g class="arr"><path d="M50 22a28 28 0 1 1-26.6 19.3" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M14.5 36.5L23.4 45.5L30 34Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></g>' +
      '<ellipse cx="36" cy="26" rx="14" ry="7" transform="rotate(-30 36 26)" fill="#fff" opacity=".45"/>' +
      '<rect class="sq" x="36" y="36" width="28" height="28" rx="6" fill="#fff"/></svg>';
  }
  function buildAutoMenu() {
    const box = h('div', { class: 'automenu', hidden: true, role: 'dialog', 'aria-label': 'Autoplay' });
    let limit = 50, stopFs = true;
    const lim = h('div', { class: 'chips' });
    const paintLim = () => lim.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === limit));
    for (const [v, l] of [[0, 'None'], [20, '20×'], [50, '50×'], [100, '100×'], [250, '250×']]) lim.append(h('button', { type: 'button', 'data-v': v, onclick: () => { limit = v; paintLim(); Batty.sfx('click'); } }, l));
    const fsBtn = h('button', { type: 'button', class: 'tog on', id: 'gummy-auto-fs', 'aria-pressed': 'true', onclick: () => { stopFs = !stopFs; fsBtn.classList.toggle('on', stopFs); fsBtn.setAttribute('aria-pressed', String(stopFs)); fsBtn.textContent = stopFs ? 'Yes' : 'No'; Batty.sfx('click'); } }, 'Yes');
    const rounds = h('div', { class: 'chips rounds' });
    for (const n of [10, 25, 50, 100, 250]) rounds.append(h('button', { type: 'button', 'data-n': n, onclick: () => startAuto(n, limit, stopFs) }, String(n)));
    box.append(h('h5', null, 'Loss limit (× stake)'), lim, h('h5', null, 'Stop when free spins start'), fsBtn, h('h5', null, 'Spins'), rounds);
    paintLim();
    return box;
  }
  function startAuto(n, limit, stopFs) {
    E.autoMenu.hidden = true; auto = n; autoLimit = limit * stakeCtl.value; autoStopFs = stopFs; autoStart = Batty.wallet.balance;
    Batty.sfx('click'); paintCtl(); if (!busy) spin();
  }
  function stopAuto(why) { if (auto > 0 && why) Batty.ui.toast(why); auto = 0; paintCtl(); }
  function autoClick() { Batty.sfx('click'); if (auto > 0) return stopAuto(); if (busy) return; E.autoMenu.hidden = !E.autoMenu.hidden; }
  function toggleTurbo() {
    turbo = !turbo; try { localStorage.setItem('gummy-turbo', turbo ? '1' : '0'); } catch (e) { /* ignore */ }
    E.turboBtn.setAttribute('aria-pressed', String(turbo)); E.turboBtn.lastChild.textContent = turbo ? 'on' : 'off'; E.turboBtn.classList.toggle('on', turbo); Batty.sfx('click');
  }
  function onKey(e) {
    if (!E || document.querySelector('.bc-veil,.bc-win')) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) primary(); return; }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 't') toggleTurbo();
    else if (k === 'a') autoClick();
    else if (k === 'b') openBuy();
    else if (k === 'escape') { if (!E.ov.hidden && E.ov.classList.contains('buying')) closeOv(); E.autoMenu.hidden = true; }
  }

  function paintStake() {
    if (!E) return;
    const st = stakeCtl.value;
    E.buy.querySelector('small').textContent = Batty.fmt(st * M.BUY_X) + ' BB · ' + M.BUY_X + '×';
    E.sbuy.querySelector('small').textContent = Batty.fmt(st * M.SUPER_X) + ' BB · ' + M.SUPER_X + '×';
    let t = '<div class="ph"><i></i><b>5</b><b>8</b><b>12</b><b>15+</b></div>';
    for (let s = 0; s < M.PAYERS; s++) t += '<div class="pr"><i>' + symSvg(s) + '</i>' + [0, 3, 7, 10].map((j) => '<span>' + short(M.PAY[s][j] * st / U) + '</span>').join('') + '</div>';
    E.pay.innerHTML = t;
  }
  function short(n) { return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? (Math.round(n / 100) / 10) + 'k' : Batty.fmt(n); }
  function paintCtl() {
    if (!E) return;
    const lock = busy || auto > 0;
    stakeCtl.disabled = lock;
    E.buy.disabled = lock; E.sbuy.disabled = lock;
    E.spin.classList.toggle('busy', busy);
    E.spin.setAttribute('aria-label', busy ? 'Hurry' : auto > 0 ? 'Stop autoplay' : 'Spin');
    E.spin.querySelector('.n').textContent = auto > 0 ? String(auto) : '';
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? 'stop' : 'off';
  }
  function setMsg(t, cls) { if (!E) return; E.msg.innerHTML = t; E.msg.className = 'msg' + (cls ? ' ' + cls : ''); }

  /* ---------- layout: wide (desktop), tall (portrait phone), short (landscape phone) ---------- */
  function layout() {
    if (!root || !E) return;
    const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return;
    const L = W >= 980 && H >= 560 ? 'wide' : W > H * 1.2 ? 'short' : 'tall';
    if (L !== lay) {
      lay = L; root.classList.remove('wide', 'tall', 'short'); root.classList.add(L);
      if (L === 'wide') { E.side.append(E.logo, E.feats, E.keys); E.main.prepend(E.hud); E.ctl.prepend(E.ctlRow); }
      else if (L === 'tall') { E.main.prepend(E.logo, E.hud); E.ctl.prepend(E.feats, E.ctlRow); }
      else { E.side.append(E.logo, E.hud, E.feats); E.sideR.after(E.ctl); E.ctl.prepend(E.ctlRow); }
    }
    let size;
    if (L === 'wide') {
      const aw = W - 2 * 268 - 80, ah = H - 52 - 30 - 22 - 30 - 104 - 34;
      size = Math.min(aw, ah) / COLS;
      size = Math.min(size, 84);
    } else if (L === 'tall') {
      const logoH = H > 720 ? 64 : H > 640 ? 46 : 0;
      root.classList.toggle('nologo', logoH === 0);
      const aw = W - 16 - 22, ah = H - logoH - 50 - 28 - 20 - 26 - 56 - 96 - 34;
      size = Math.min(aw, ah) / COLS;
      size = Math.min(size, 70);
    } else {
      const ah = H - 14 - 22 - 34, aw = W - 200 - 170 - 40;
      size = Math.min(aw, ah) / COLS;
      size = Math.min(size, 64);
    }
    cw = Math.max(30, Math.floor(size));
    root.style.setProperty('--cw', cw + 'px');
    for (const o of cells) if (o) place(o, o.col, o.row);
    for (let c = 0; c < CELLS; c++) { const x = ((c / ROWS) | 0) * cw, y = (c % ROWS) * cw; spotEls[c].style.transform = badgeEls[c].style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
    E.outl.setAttribute('viewBox', '0 0 ' + cw * COLS + ' ' + cw * ROWS); E.outl.setAttribute('width', cw * COLS); E.outl.setAttribute('height', cw * ROWS);
    fxDpr = Math.min(2, window.devicePixelRatio || 1);
    E.fx.width = W * fxDpr; E.fx.height = H * fxDpr;
    ambDpr = Math.min(1.5, window.devicePixelRatio || 1);
    E.amb.width = W * ambDpr; E.amb.height = H * ambDpr;
    measure();
  }
  function measure() {
    if (!root || !E) return;
    const a = E.grid.getBoundingClientRect(), b = root.getBoundingClientRect();
    gridOff = { x: a.left - b.left, y: a.top - b.top };
  }
  /* centre of a cell in root pixels */
  const cpos = (c) => ({ x: gridOff.x + (((c / ROWS) | 0) + 0.5) * cw, y: gridOff.y + ((c % ROWS) + 0.5) * cw });
  function centre(el) { const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; }

  /* ---------- cells ---------- */
  function makeCell(s) {
    const el = h('div', { class: 'c s-' + KEYS[s], html: '<div class="b" style="animation-delay:' + (-Math.random() * 3).toFixed(2) + 's">' + symSvg(s) + '</div>' });
    return { el, b: el.firstChild, s, col: 0, row: 0 };
  }
  const xy = (col, row) => 'translate(' + (col * cw) + 'px,' + (row * cw) + 'px)';
  function place(o, col, row) { o.col = col; o.row = row; o.el.style.transform = xy(col, row); }
  function anim(el, frames, ms, easing, delay) {
    if (!el || !el.animate) return Promise.resolve();
    const a = el.animate(frames, { duration: Math.max(1, ms), easing: easing || 'ease', delay: delay || 0, fill: 'backwards' });
    return a.finished.catch(() => {});
  }
  /* a gummy falls from row a to row b, then squashes on landing and jiggles back */
  function fall(o, from, to, delay, onLand) {
    const dist = Math.max(0.6, to - from), dur = T(Math.min(520, 210 + dist * 42));
    const p = anim(o.el, [{ transform: xy(o.col, from) }, { transform: xy(o.col, to) }], dur, 'cubic-bezier(.47,0,.86,.5)', delay);
    const sq = Math.min(1, 0.45 + dist * 0.09);
    anim(o.b, [{ transform: 'scale(1,1)' }, { transform: 'scale(' + (1 + 0.24 * sq) + ',' + (1 - 0.28 * sq) + ')', offset: 0.18 }, { transform: 'scale(' + (1 - 0.1 * sq) + ',' + (1 + 0.12 * sq) + ')', offset: 0.45 }, { transform: 'scale(' + (1 + 0.04 * sq) + ',' + (1 - 0.04 * sq) + ')', offset: 0.72 }, { transform: 'scale(1,1)' }], T(480), 'ease-out', delay + dur);
    if (onLand) S.timeout(onLand, delay + dur);
    return p.then(() => nap(0));
  }

  /* ---------- the spots ---------- */
  const tierOf = (v) => (v <= 4 ? 1 : v <= 16 ? 2 : v <= 64 ? 3 : v <= 256 ? 4 : 5);
  function paintSpot(c, v, how) {
    const sp = spotEls[c], bd = badgeEls[c];
    sp.className = 'spot' + (v === 1 ? ' m' : v >= 2 ? ' x t' + tierOf(v) : '');
    bd.className = 'badge' + (v >= 2 ? ' on t' + tierOf(v) : '');
    bd.textContent = v >= 2 ? '×' + v : '';
    bd.style.setProperty('--k', v >= 2 ? (0.86 + 0.075 * Math.log2(v)).toFixed(3) : '1');
    if (how === 'new' && v >= 2) { anim(bd, [{ opacity: 0, scale: '2.6' }, { opacity: 1, scale: '.8', offset: 0.6 }, { scale: '1' }], T(420), 'cubic-bezier(.3,1.4,.5,1)'); anim(sp, [{ opacity: 0.3, scale: '1.5' }, { opacity: 1, scale: '1' }], T(360), 'ease-out'); }
    else if (how === 'new' && v === 1) anim(sp, [{ opacity: 0, scale: '1.8' }, { opacity: 1, scale: '1' }], T(360), 'cubic-bezier(.3,1.4,.5,1)');
  }
  function paintSpots() { for (let c = 0; c < CELLS; c++) paintSpot(c, spots[c]); paintTop(); }
  function paintTop() { let m = 0; for (const v of spots) if (v > m) m = v; if (E) E.top.textContent = m >= 2 ? '×' + m : '–'; }
  function clearSpots(wave) {
    if (!spots.some((v) => v)) return;
    const old = spots.slice(); spots = new Array(CELLS).fill(0);
    for (let c = 0; c < CELLS; c++) {
      if (!old[c]) continue;
      if (wave && !reduce()) { const d = T(((c / ROWS) | 0) * 30); const sp = spotEls[c], bd = badgeEls[c]; anim(sp, [{ opacity: 1 }, { opacity: 0 }], T(260), 'ease-in', d); anim(bd, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.3' }], T(260), 'ease-in', d); }
      paintSpot(c, 0);
    }
    paintTop();
  }

  /* ---------- idle life: blinks, wobbles and each bat's own little act ---------- */
  function idleTick() {
    if (!E || reduce() || document.hidden) return;
    const n = cells.length; if (!n) return;
    for (let i = 0; i < 2; i++) {
      const o = cells[(Math.random() * n) | 0]; if (!o || o.el.classList.contains('win')) continue;
      const cls = Math.random() < 0.55 ? 'blink' : 'act';
      o.el.classList.remove('blink', 'act'); void o.el.offsetWidth; o.el.classList.add(cls);
      S.timeout(() => o.el && o.el.classList.remove(cls), 1700);
    }
  }

  /* ---------- the opening drop of a spin, with Moon anticipation ---------- */
  async function flushGrid() {
    const old = cells.filter(Boolean); cells = new Array(CELLS);
    old.forEach((o) => {
      const d = T(o.col * 28 + (ROWS - 1 - o.row) * 10);
      anim(o.el, [{ transform: xy(o.col, o.row) }, { transform: xy(o.col, o.row + 8.5) }], T(330), 'cubic-bezier(.55,0,1,.45)', d).then(() => o.el.remove());
      o.el.style.transform = xy(o.col, o.row + 8.5);
    });
    E.belt.classList.add('run'); S.timeout(() => E && E.belt.classList.remove('run'), T(700));
    await nap(240);
  }
  async function dropGrid(g, fs) {
    let moons = 0, teased = false, delay = 0, teaseK = 0;
    const waits = [];
    for (let col = 0; col < COLS; col++) {
      if (!teased && moons >= 2) { teased = true; startTease(col); }
      if (teased) { delay += T(col === 0 ? 0 : 640); const cc = col, k = teaseK++; S.timeout(() => { if (!E) return; markTease(cc); snd.tease(k); }, delay); }
      else if (col) delay += T(72);
      squirt(col, delay);
      for (let row = ROWS - 1; row >= 0; row--) {
        const c = col * ROWS + row, o = makeCell(g[c]);
        cells[c] = o; place(o, col, row); E.grid.append(o.el);
        const d = delay + T((ROWS - 1 - row) * 34 + (teased ? 60 : 0));
        const isMoon = g[c] === SYM.MOON;
        if (isMoon) moons++;
        const k = moons;
        waits.push(fall(o, row - 8, row, d, isMoon ? () => { snd.moon(k - 1); o.el.classList.add('land'); const p = cpos(c); sparkle(p.x, p.y, '#ffe27a', 16, 1.2); } : null));
      }
      const cc = col; S.timeout(() => { if (!E) return; snd.plop(cc); dust(cc); }, delay + T(ROWS * 34 + 260));
    }
    await Promise.all(waits);
    endTease();
  }
  function startTease() { E.frame.classList.add('tease'); }
  function markTease(col) {
    E.tease.querySelectorAll('i').forEach((x) => x.classList.remove('on'));
    const i = h('i', { class: 'on', style: { transform: 'translateX(' + col * cw + 'px)' } }); E.tease.append(i);
    shake(1);
  }
  function endTease() { if (!E) return; E.frame.classList.remove('tease'); E.tease.textContent = ''; }
  function squirt(col, delay) { const n = E.nozzles[col]; S.timeout(() => { if (!n) return; n.classList.remove('sq'); void n.offsetWidth; n.classList.add('sq'); }, delay); }

  /* ---------- cluster outlines: the edge of the cluster as smooth loops ---------- */
  function outlinePath(cellsIn) {
    const set = new Set(cellsIn), edges = new Map();
    const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; if (!edges.has(k)) edges.set(k, []); edges.get(k).push([x2, y2]); };
    for (const c of cellsIn) {
      const x = (c / ROWS) | 0, y = c % ROWS;
      if (y === 0 || !set.has(c - 1)) add(x, y, x + 1, y);
      if (x === COLS - 1 || !set.has(c + ROWS)) add(x + 1, y, x + 1, y + 1);
      if (y === ROWS - 1 || !set.has(c + 1)) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || !set.has(c - ROWS)) add(x, y + 1, x, y);
    }
    let d = '';
    const r = Math.min(10, cw * 0.22), ins = 3;
    for (;;) {
      let startK = null; for (const [k, v] of edges) if (v.length) { startK = k; break; }
      if (startK == null) break;
      const pts = []; let k = startK;
      for (let guard = 0; guard < 400; guard++) {
        const list = edges.get(k); if (!list || !list.length) break;
        const nx = list.shift(); pts.push(k.split(',').map(Number)); k = nx[0] + ',' + nx[1];
        if (k === startK) break;
      }
      /* keep only corners */
      const cs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) cs.push(b);
      }
      if (cs.length < 3) continue;
      /* inset every corner a little (towards the inside of a clockwise loop) and round it */
      const P2 = cs.map((b, i) => {
        const a = cs[(i - 1 + cs.length) % cs.length], c = cs[(i + 1) % cs.length];
        const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
        const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]];
        return { x: b[0] * cw + (n1[0] + n2[0]) * ins * -1, y: b[1] * cw + (n1[1] + n2[1]) * ins * -1, d1, d2 };
      });
      for (let i = 0; i < P2.length; i++) {
        const p = P2[i];
        const ax = p.x - p.d1[0] * r, ay = p.y - p.d1[1] * r, bx = p.x + p.d2[0] * r, by = p.y + p.d2[1] * r;
        d += (i === 0 ? 'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) : 'L' + ax.toFixed(1) + ' ' + ay.toFixed(1)) + 'Q' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1);
      }
      d += 'Z';
    }
    return d;
  }
  function drawOutline(cl, i) {
    const NS = 'http://www.w3.org/2000/svg', col = SC[cl.s];
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'ol');
    const d = outlinePath(cl.cells);
    g.innerHTML = '<path class="og" d="' + d + '" stroke="' + col + '"/><path class="oc" d="' + d + '" pathLength="100"/><path class="ow" d="' + d + '" pathLength="100"/>';
    g.style.animationDelay = (i * 0.06) + 's';
    E.outl.append(g);
    return g;
  }

  /* ---------- one tumble step: clusters glow, spots slam in, the cluster pays, the bats pop, spots mark ---------- */
  async function showStep(step, k, unit, runBefore, fs) {
    measure();
    const hitSet = new Set(step.hit);
    const winCells = step.hit.map((c) => cells[c]).filter(Boolean);
    winCells.forEach((o) => o.el.classList.add('win'));
    E.grid.classList.add('dim');
    const outs = step.cl.map((cl, i) => drawOutline(cl, i));
    snd.cluster(k); snd.giggle();
    flashLights(step.pay * unit >= stakeCtl.value * 5 ? 2 : 1);
    /* a label per cluster, anchored on its cell nearest the middle */
    const labs = step.cl.map((cl) => {
      let sx = 0, sy = 0; for (const c of cl.cells) { sx += (c / ROWS) | 0; sy += c % ROWS; }
      sx /= cl.n; sy /= cl.n;
      let best = cl.cells[0], bd = 1e9; for (const c of cl.cells) { const dx = ((c / ROWS) | 0) - sx, dy = (c % ROWS) - sy, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } }
      const x = (((best / ROWS) | 0) + 0.5) * cw, y = ((best % ROWS) + 0.5) * cw;
      const el = h('div', { class: 'lab', style: { left: x + 'px', top: y + 'px', '--c': SC[cl.s] } }, h('span', { class: 'v' }, Batty.fmt(cl.base * unit)));
      E.labels.append(el);
      anim(el, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)' }], T(320), 'ease-out');
      return { el, cl, best };
    });
    const names = step.cl.map((cl) => '<b>' + cl.n + '</b> ' + (cl.n === 1 ? NAMES[cl.s] : NAMES[cl.s] + (/[sh]$/.test(NAMES[cl.s]) ? 'es' : 's')) + (cl.mult ? ' <i>×' + cl.mult + '</i>' : '') + ' <em>' + Batty.fmt(cl.pay * unit) + '</em>');
    setMsg(names.slice(0, 3).join(' · ') + (names.length > 3 ? ' · +' + (names.length - 3) + ' more' : ''), 'pay');
    await nap(560);
    /* multiplier spots slam into their clusters */
    let slams = 0;
    for (const L of labs) {
      if (!L.cl.mult) continue;
      const list = L.cl.cells.filter((c) => spots[c] >= 2);
      let sum = 0;
      const to = { x: gridOff.x + parseFloat(L.el.style.left), y: gridOff.y + parseFloat(L.el.style.top) };
      const flights = list.map((c, i) => {
        const v = spots[c], p = cpos(c);
        const fly = h('div', { class: 'flyv t' + tierOf(v) }, '×' + v);
        fly.style.left = p.x + 'px'; fly.style.top = (p.y + cw * 0.28) + 'px';
        root.append(fly);
        const dx = to.x - p.x, dy = to.y - p.y - cw * 0.28;
        badgeEls[c].classList.add('fired');
        return anim(fly, [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) translate(' + dx * 0.4 + 'px,' + (dy * 0.4 - cw * 0.7) + 'px) scale(1.7)', offset: 0.45 }, { transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(.6)' }], T(440), 'cubic-bezier(.5,0,.6,1)', T(i * 90)).then(() => {
          fly.remove(); if (!E) return;
          sum += v; slams++;
          L.el.classList.add('hasm');
          L.el.querySelector('.v').innerHTML = Batty.fmt(L.cl.base * unit) + '<i>×' + sum + '</i>';
          bumpEl(L.el); snd.slam(slams); if (v >= 32) shake(v >= 256 ? 2 : 1);
          sparkle(to.x, to.y, '#ffd84a', v >= 32 ? 18 : 8, 1);
        });
      });
      await Promise.all(flights);
      await nap(160);
      L.el.querySelector('.v').innerHTML = Batty.fmt(L.cl.pay * unit);
      L.el.classList.add('paid'); bumpEl(L.el);
      A.seq([N.G5, N.C6, [N.E6, 2]], { step: 0.06, type: 'square', v: 0.07 });
      if (L.cl.mult >= 16) sparkle(to.x, to.y, '#fff', 26, 1.6);
    }
    /* the step's pay lands in the win counter */
    countTo(E.win, runBefore, runBefore + step.pay * unit, T(slams ? 420 : 520));
    bumpEl(E.win.parentNode);
    if (slams) await nap(380);
    await nap(fs ? 260 : 320);
    /* pop! every winning bat splats; the labels float to the counter */
    const wp = centre(E.win);
    labs.forEach((L, i) => {
      const from = { x: gridOff.x + parseFloat(L.el.style.left), y: gridOff.y + parseFloat(L.el.style.top) };
      anim(L.el, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-50%) translate(' + (wp.x - from.x) + 'px,' + (wp.y - from.y) + 'px) scale(.5)', opacity: 0.2 }], T(460), 'cubic-bezier(.6,0,.8,.6)', T(i * 50)).then(() => L.el.remove());
      L.el.style.opacity = '0';
    });
    outs.forEach((g) => g.classList.add('out'));
    snd.splat();
    winCells.forEach((o, i) => {
      o.el.classList.remove('win'); o.el.classList.add('pop');
      anim(o.b, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35,.72)', opacity: 1, offset: 0.35 }, { transform: 'scale(.15,.15)', opacity: 0 }], T(250), 'ease-in');
      o.b.style.opacity = '0';
      const p = cpos(o.col * ROWS + o.row);
      splat(p.x, p.y, SC[o.s], winCells.length > 20 ? 5 : 8);
      if (i < 8) snd.pop(i);
    });
    E.grid.classList.remove('dim');
    /* the spots under the pops are marked or doubled */
    const before = spots;
    spots = M.bumpSpots(spots, step.hit);
    let ups = 0;
    S.timeout(() => {
      if (!E) return;
      step.hit.forEach((c, i) => {
        badgeEls[c].classList.remove('fired');
        paintSpot(c, spots[c], 'new');
        if (spots[c] >= 2) { if (ups < 6) snd.spot(spots[c], ups); ups++; } else if (i < 6) snd.mark(i);
      });
      paintTop();
    }, T(150));
    await nap(300);
    winCells.forEach((o) => o.el.remove());
    S.timeout(() => E && E.outl.querySelectorAll('.out').forEach((g) => g.remove()), T(300));
    void before; void hitSet;
  }

  /* the survivors drop, new gummies fall in from the hopper */
  async function tumble(step) {
    const gone = new Set(step.hit), next = new Array(CELLS), waits = [];
    for (let col = 0; col < COLS; col++) {
      const keep = [];
      for (let row = 0; row < ROWS; row++) { const c = col * ROWS + row; if (!gone.has(c)) keep.push(cells[c]); }
      const add = step.add[col] || [], n = add.length;
      if (!n) { keep.forEach((o, row) => { next[col * ROWS + row] = o; }); continue; }
      const d0 = T(col * 40);
      squirt(col, d0);
      const colCells = add.map((s) => makeCell(s)).concat(keep);
      colCells.forEach((o, row) => {
        next[col * ROWS + row] = o;
        if (row < n) { o.col = col; E.grid.append(o.el); }
        const from = row < n ? row - n - 0.5 : o.row;
        if (from !== row) {
          place(o, col, row);
          const isMoon = o.s === SYM.MOON, isWild = o.s === SYM.WILD;
          waits.push(fall(o, from, row, d0 + (row < n ? T(70 + (n - 1 - row) * 30) : 0), (isMoon || isWild) ? () => {
            if (!E) return; o.el.classList.add('land'); const p = cpos(col * ROWS + row);
            if (isMoon) { snd.moon(Math.min(6, countMoons())); sparkle(p.x, p.y, '#ffe27a', 16, 1.2); } else { sparkle(p.x, p.y, '#ff7ad9', 18, 1.3); A.seq([N.C6, N.E6, N.G6], { step: 0.05, type: 'triangle', v: 0.08 }); }
          } : null));
        } else place(o, col, row);
      });
      const cc = col; S.timeout(() => snd.land(cc), d0 + T(360));
    }
    cells = next;
    await Promise.all(waits);
    await nap(60);
  }
  const countMoons = () => cells.filter((o) => o && o.s === SYM.MOON).length;

  /* one whole spin (paid or free) with every tumble. Returns the round's running total in BB. */
  async function playSeq(seq, unit, fs, before) {
    await dropGrid(seq.g, fs);
    let run = before;
    for (let k = 0; k < seq.steps.length; k++) {
      const st = seq.steps[k];
      await showStep(st, k, unit, run, fs);
      run += st.pay * unit;
      if (st.add.length) await tumble(st);
    }
    return run;
  }

  /* ---------- a round ---------- */
  function primary() {
    if (!E) return;
    if (tapFn) return tapFn();
    if (!E.ov.hidden) return;
    if (busy) return doSkip();
    if (auto > 0) return stopAuto();
    if (!E.autoMenu.hidden) E.autoMenu.hidden = true;
    spin();
  }
  function localOutcome(md) {
    if (md === 'base' && devNext) { const f = devNext; devNext = null; return f(); }
    return M.play(Batty.rng, md);
  }
  async function spin(buyMode) {
    if (busy || !E) return;
    const md = buyMode || 'base';
    const stake = stakeCtl.value, unit = stake / U, cost = stake * M.costOf(md) / U;
    if (!Batty.wallet.bet(ID, cost)) { stopAuto(); return Batty.ui.broke(); }
    busy = true; hurry = false; E.frame.classList.remove('hurry'); E.autoMenu.hidden = true; if (auto > 0) auto--; paintCtl();
    root.classList.remove('won'); E.win.textContent = '0';
    setMsg(md === 'super' ? 'Super Free Spins bought · every spot starts at ×2' : md === 'buy' ? 'Free Spins bought · here come the Moons' : 'Good luck', '');
    snd.spin();
    clearSpots(true);
    /* the gummies wobble while the order goes in */
    cells.forEach((o, i) => o && anim(o.b, [{ transform: 'scale(1)' }, { transform: 'scale(1.06,.92)' }, { transform: 'scale(.97,1.04)' }, { transform: 'scale(1)' }], T(260), 'ease-in-out', T((i % 7) * 12)));
    let o;
    if (Batty.online) {
      const r = await Batty.play(ID, 'spin', { stake, mode: md }, cost);
      if (!E) return;
      if (!r) { busy = false; auto = 0; paintCtl(); setMsg('Clusters of 5 or more pay · every pop marks the mould'); return; }
      o = r.o;
    } else o = localOutcome(md);
    const win = o.totalWin * unit;
    if (win > 0) Batty.wallet.win(ID, win, { silent: true });
    await flushGrid();
    let shown = await playSeq(o.spin, unit, false, 0);
    if (o.fs) shown = await playFs(o, unit, shown, md);
    if (!E) return;
    if (o.capped) { banner('<small>Max win</small><b>' + Batty.fmt(win) + '</b><small>' + Batty.fmt(M.MAX_WIN_X) + '× stake</small>', 'max'); fx3(); await nap(2200); hideBanner(); }
    E.win.textContent = Batty.fmt(win);
    if (win > 0) {
      root.classList.add('won'); bumpEl(E.win.parentNode);
      const x = win / stake;
      setMsg((o.fs ? 'The Night Shift paid ' : 'You won ') + '<em>' + Batty.fmt(win) + ' BB</em>' + (x >= 2 ? ' · ' + Batty.fmtX(x) : ''), 'hot');
      if (x < 10) Batty.sfx('coin');
    } else setMsg(['No clusters this time', 'The moulds came out empty', 'Not a nibble. Go again?', 'Sticky luck. Next one, maybe'][(Math.random() * 4) | 0]);
    Batty.wallet.sync();
    if (win >= stake * 10) { flashLights(3); jellyRain(win >= stake * 75 ? 4200 : 2400); await Batty.ui.celebrate({ amount: win, bet: stake }); }
    if (!E) return;
    busy = false; hurry = false; E.frame.classList.remove('hurry'); paintCtl();
    if (auto > 0) {
      const lost = autoStart - Batty.wallet.balance;
      if (autoLimit && lost >= autoLimit) stopAuto('Autoplay stopped: loss limit reached.');
      else if (o.fs && autoStopFs) stopAuto('Autoplay stopped: free spins landed.');
      else if (!Batty.wallet.canBet(stake)) stopAuto('Autoplay stopped: not enough Batty Bucks for the next spin.');
      else S.timeout(() => { if (auto > 0 && !busy) spin(); }, T(win ? 600 : 260));
    }
  }

  /* ---------- the Night Shift (free spins) ---------- */
  async function playFs(o, unit, before, md) {
    const fs = o.fs;
    /* the Moons wake up */
    const moons = cells.filter((c) => c && c.s === SYM.MOON);
    moons.forEach((c) => c.el.classList.add('trig'));
    Batty.sfx('bonus'); shake(1);
    moons.forEach((c) => { const p = cpos(c.col * ROWS + c.row); sparkle(p.x, p.y, '#ffe27a', 24, 1.6); });
    setMsg('<b>' + moons.length + '</b> Gummy Moons · <em>' + fs.award + ' free spins</em>', 'hot');
    await nap(1500);
    moons.forEach((c) => c.el.classList.remove('trig'));
    const sup = fs.superFs;
    await overlay('intro', '<div class="ovmoon">' + symSvg(SYM.MOON) + (sup ? '<em>×2</em>' : '') + '</div><h2>' + (sup ? 'Super ' : '') + 'Night Shift</h2><p class="big"><b>' + fs.award + '</b> free spins</p>' +
      '<p>' + (sup ? 'Every spot on the mould starts at <b>×2</b>, and ' : '') + 'the multiplier spots stay put for the whole shift.</p><p class="sm">3 or more Moons in a free spin: more spins</p>', 5200);
    if (!E) return before;
    /* the factory switches to night-shift lighting */
    snd.lights(); snd.siren();
    root.classList.add('switching'); S.timeout(() => root && root.classList.remove('switching'), 1300);
    await nap(500);
    mode = 'fs'; root.classList.add('fs');
    spots = fs.s0.slice();
    if (sup) {
      for (let c = 0; c < CELLS; c++) { const cc = c; S.timeout(() => { if (!E) return; paintSpot(cc, spots[cc], 'new'); if (cc % 7 === 0) snd.spot(2, cc / 7); }, T(((cc / ROWS) | 0) * 70 + (cc % ROWS) * 25)); }
      await nap(900);
    }
    paintSpots();
    let total = before, awarded = fs.award;
    E.fsLeft.textContent = awarded + ' / ' + awarded;
    for (let i = 0; i < fs.spins.length; i++) {
      const seq = fs.spins[i];
      E.fsLeft.textContent = (awarded - i - 1) + ' / ' + awarded;
      setMsg('Free spin <b>' + (i + 1) + '</b> of ' + awarded, '');
      await flushGrid();
      total = await playSeq(seq, unit, true, total);
      total = before + seq.running * unit;
      E.win.textContent = Batty.fmt(total);
      if (seq.retrig) {
        awarded += seq.retrig;
        const mm = cells.filter((c) => c && c.s === SYM.MOON); mm.forEach((c) => c.el.classList.add('trig'));
        snd.retrig(); banner('<small>' + seq.sc + ' Gummy Moons</small><b>+' + seq.retrig + ' spins</b>', 'retrig');
        E.fsLeft.textContent = (awarded - i - 1) + ' / ' + awarded; bumpEl(E.fsLeft.parentNode);
        await nap(1600); hideBanner(); mm.forEach((c) => c.el.classList.remove('trig'));
      }
      await nap(seq.tw ? 380 : 200);
    }
    const winFs = fs.total * unit;
    let top = 0; for (const v of spots) if (v > top) top = v;
    snd.outro();
    await overlay('outro', '<h2>Shift over</h2><p>You won</p><output>0</output><p class="sm">Batty Bucks in ' + fs.spins.length + ' free spins' + (top >= 2 ? ' · top spot ×' + top : '') + '</p>', 4600, winFs);
    if (!E) return before + winFs;
    snd.lights();
    root.classList.add('switching'); S.timeout(() => root && root.classList.remove('switching'), 1300);
    mode = 'base'; root.classList.remove('fs');
    clearSpots(true);
    void md;
    return before + winFs;
  }
  function overlay(kind, html, ms, countTo2) {
    E.ov.innerHTML = '<div class="card ' + kind + '">' + html + '<p class="tap">Tap to continue</p></div>';
    E.ov.hidden = false; E.ov.className = 'ov ' + kind;
    if (kind === 'intro') { snd.intro(); S.timeout(() => E && sparkle(root.clientWidth / 2, root.clientHeight * 0.4, '#ffe27a', 60, 2.4), 200); }
    const out = E.ov.querySelector('output');
    if (out && countTo2) { Batty.ui.countUp(out, 0, countTo2, T(1600)); const tk = S.interval(() => snd.tick(), 90); S.timeout(() => S.clear(tk), T(1600)); S.timeout(() => E && sparkle(root.clientWidth / 2, root.clientHeight * 0.45, '#ff66c4', 50, 2.2), T(1600)); }
    return waitTap(ms).then(() => {
      if (!E) return;
      return anim(E.ov.firstChild, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }], 220, 'ease-in').then(() => { if (E) { E.ov.hidden = true; E.ov.innerHTML = ''; } });
    });
  }
  function closeOv() { if (!E) return; E.ov.hidden = true; E.ov.innerHTML = ''; E.ov.className = 'ov'; }
  function banner(html, cls) { E.banner.innerHTML = html; E.banner.className = 'banner show ' + (cls || ''); }
  const hideBanner = () => { if (E) E.banner.className = 'banner'; };

  /* ---------- the buy menu ---------- */
  function openBuy(which) {
    if (busy || auto > 0 || !E) return;
    const st = stakeCtl.value;
    Batty.sfx('pop');
    E.ov.className = 'ov buying'; E.ov.hidden = false; E.ov.innerHTML = '';
    const card = (md, title, desc, x, extra) => {
      const price = st * x, ok = Batty.wallet.canBet(price);
      return h('div', { class: 'bopt ' + md + (which === md ? ' pick' : '') },
        h('div', { class: 'bi', html: symSvg(SYM.MOON) + (extra || '') }),
        h('h3', null, title), h('p', null, desc),
        h('p', { class: 'price' }, Batty.fmt(price), h('small', null, ' BB · ' + x + '× stake')),
        h('button', { class: 'go', type: 'button', id: 'gummy-buy-' + md, disabled: !ok, onclick: () => { closeOv(); spin(md); } }, ok ? 'Buy' : 'Not enough BB'));
    };
    const no = h('button', { class: 'no', type: 'button', id: 'gummy-buy-no', onclick: () => { Batty.sfx('click'); closeOv(); } }, 'Not now');
    E.ov.append(h('div', { class: 'card buycard' }, h('h2', null, 'Clock in early'),
      h('div', { class: 'bopts' },
        card('buy', 'Free Spins', 'A spin with 3 to 7 Gummy Moons, then 10 to 30 free spins of the Night Shift.', M.BUY_X),
        card('super', 'Super Free Spins', 'The same, but every one of the 49 spots starts at ×2.', M.SUPER_X, '<em>×2</em>')),
      no));
    const f = E.ov.querySelector('.bopt.pick .go') || E.ov.querySelector('.go'); if (f) f.focus();
  }

  /* ---------- juice ---------- */
  function countTo(el, from, to, ms) {
    if (to - from > 0) { const tk = S.interval(() => snd.tick(), 80); S.timeout(() => S.clear(tk), Math.max(60, ms)); }
    return Batty.ui.countUp(el, from, to, Math.max(60, ms));
  }
  function bumpEl(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function shake(n) { if (reduce() || !E) return; E.machine.classList.remove('shake', 'shake2'); void E.machine.offsetWidth; E.machine.classList.add(n > 1 ? 'shake2' : 'shake'); S.timeout(() => E && E.machine.classList.remove('shake', 'shake2'), 520); }
  function flashLights(n) { if (!E) return; root.classList.remove('lights1', 'lights2', 'lights3'); void root.offsetWidth; root.classList.add('lights' + n); S.timeout(() => root && root.classList.remove('lights' + n), 1400); }
  function fx3() { if (!E) return; shake(2); jellyRain(3000); E.flash.classList.remove('go'); void E.flash.offsetWidth; E.flash.classList.add('go'); }

  /* particles on our own canvas: jelly splats, sugar dust, sparkles and a jelly rain */
  function sparkle(x, y, col, n, pw) {
    if (reduce()) return;
    pw = pw || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (60 + Math.random() * 200) * pw;
      parts.push({ k: Math.random() < 0.5 ? 'star' : 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70 * pw, g: 380, life: 0, max: 0.5 + Math.random() * 0.5, r: 2 + Math.random() * 3, c: Math.random() < 0.35 ? '#fff' : col, rot: Math.random() * 6 });
    }
    kick();
  }
  function splat(x, y, col, n) {
    if (reduce()) return;
    parts.push({ k: 'decal', x, y, life: 0, max: 0.8, r: cw * 0.36, c: col, seed: Math.random() * 6 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 80 + Math.random() * 240;
      parts.push({ k: 'blob', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 160, g: 900, life: 0, max: 0.55 + Math.random() * 0.4, r: cw * (0.05 + Math.random() * 0.07), c: col, rot: 0 });
    }
    for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283; parts.push({ k: 'dot', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 60, g: 300, life: 0, max: 0.5, r: 1.6, c: '#fff', rot: 0 }); }
    kick();
  }
  function dust(col) {
    if (reduce() || !E) return;
    const x0 = gridOff.x + col * cw, y = gridOff.y + ROWS * cw - 4;
    for (let i = 0; i < 6; i++) parts.push({ k: 'puff', x: x0 + Math.random() * cw, y, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, g: 0, life: 0, max: 0.5 + Math.random() * 0.3, r: 3 + Math.random() * 4, c: '#fff', rot: 0 });
    kick();
  }
  function jellyRain(ms) {
    if (reduce() || !root) return;
    const end = performance.now() + ms, cols = ['#ff2a4f', '#9a46ff', '#6edc2c', '#ff8d1f', '#ffd61f', '#2ea8ff', '#ff66c4'];
    const W = root.clientWidth;
    const gen = S.interval(() => {
      if (performance.now() > end || !root) return S.clear(gen);
      for (let i = 0; i < (W < 600 ? 2 : 4); i++) parts.push({ k: 'bat', x: Math.random() * W, y: -24, vx: (Math.random() - 0.5) * 70, vy: 100 + Math.random() * 180, g: 140, life: 0, max: 7, r: 9 + Math.random() * 7, c: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 5, rain: true });
      kick();
    }, 70);
  }
  function kick() { if (partStop || !S) return; partStop = S.loop(stepParts); }
  function blobPath(c, r, seed) { c.beginPath(); for (let i = 0; i <= 12; i++) { const a = (i / 12) * 6.283, rr = r * (0.78 + 0.22 * Math.sin(a * 3 + seed) + 0.12 * Math.sin(a * 5 + seed * 2)); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); }
  function stepParts(dt) {
    if (!root) return;
    const W = root.clientWidth, H = root.clientHeight, c = fxCx;
    c.setTransform(fxDpr, 0, 0, fxDpr, 0, 0); c.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.life < p.max && p.y < H + 40);
    for (const p of parts) {
      p.life += dt;
      if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += (p.vr || 3) * dt; }
      const t = p.life / p.max;
      c.save(); c.translate(p.x, p.y);
      if (p.k === 'decal') {
        c.globalAlpha = 0.55 * (1 - t); c.fillStyle = p.c; c.scale(1 + t * 0.5, 1 + t * 0.5); blobPath(c, p.r, p.seed); c.fill();
      } else if (p.k === 'blob') {
        c.globalAlpha = Math.max(0, 1 - t * t); c.fillStyle = p.c;
        const sp = Math.min(1.8, Math.hypot(p.vx, p.vy) / 260), ang = Math.atan2(p.vy, p.vx);
        c.rotate(ang); c.beginPath(); c.ellipse(0, 0, p.r * (1 + sp * 0.5), p.r / (1 + sp * 0.3), 0, 0, 6.283); c.fill();
        c.globalAlpha *= 0.7; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(-p.r * 0.2, -p.r * 0.3, p.r * 0.35, p.r * 0.2, 0, 0, 6.283); c.fill();
      } else if (p.k === 'star') {
        c.globalAlpha = Math.max(0, 1 - t); c.rotate(p.rot); c.fillStyle = p.c; c.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? p.r * 0.4 : p.r * 1.5, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.fill();
      } else if (p.k === 'dot') {
        c.globalAlpha = Math.max(0, 1 - t); c.fillStyle = p.c; c.fillRect(-p.r * 0.6, -p.r * 0.6, p.r * 1.2, p.r * 1.2);
      } else if (p.k === 'puff') {
        c.globalAlpha = 0.5 * (1 - t); c.fillStyle = p.c; c.beginPath(); c.arc(0, 0, p.r * (1 + t), 0, 6.283); c.fill();
      } else if (p.k === 'bat') {
        c.globalAlpha = 1; c.rotate(Math.sin(p.rot) * 0.5); const r = p.r;
        c.fillStyle = p.c; c.strokeStyle = 'rgba(30,6,40,.75)'; c.lineWidth = 1.5;
        const fl = Math.sin(p.life * 14) * 0.35;
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.1); c.quadraticCurveTo(-r * 1.6, -r * (0.8 + fl), -r * 2.1, -r * 0.2); c.quadraticCurveTo(-r * 1.4, r * 0.1, -r * 0.5, r * 0.5); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(r * 0.5, -r * 0.1); c.quadraticCurveTo(r * 1.6, -r * (0.8 + fl), r * 2.1, -r * 0.2); c.quadraticCurveTo(r * 1.4, r * 0.1, r * 0.5, r * 0.5); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(0, 0, r * 0.75, r, 0, 0, 6.283); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.6, -r * 0.6); c.lineTo(-r * 0.45, -r * 1.25); c.lineTo(-r * 0.15, -r * 0.8); c.moveTo(r * 0.6, -r * 0.6); c.lineTo(r * 0.45, -r * 1.25); c.lineTo(r * 0.15, -r * 0.8); c.fill();
        c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-r * 0.25, -r * 0.35, r * 0.25, r * 0.15, -0.5, 0, 6.283); c.fill();
      }
      c.restore();
    }
    c.globalAlpha = 1;
    if (!parts.length) { partStop(); partStop = null; c.clearRect(0, 0, W, H); }
  }
  /* ambient bubbles drifting up through the factory (behind the machine) */
  function ambStep(dt) {
    if (!root || !ambCx || document.hidden) return;
    const W = root.clientWidth, H = root.clientHeight, c = ambCx;
    const want = W < 600 ? 14 : 26;
    if (ambParts.length < want && Math.random() < 0.08) ambParts.push({ x: Math.random() * W, y: H + 10, r: 2 + Math.random() * 7, vy: 14 + Math.random() * 26, ph: Math.random() * 6, hue: Math.random() < 0.5 ? (mode === 'fs' ? '255,80,170' : '255,200,120') : '160,220,255', a: 0.18 + Math.random() * 0.25 });
    c.setTransform(ambDpr, 0, 0, ambDpr, 0, 0); c.clearRect(0, 0, W, H);
    ambParts = ambParts.filter((p) => p.y > -20);
    for (const p of ambParts) {
      p.y -= p.vy * dt * (mode === 'fs' ? 1.6 : 1); p.ph += dt * 1.6;
      const x = p.x + Math.sin(p.ph) * 8;
      c.globalAlpha = p.a; c.strokeStyle = 'rgba(' + p.hue + ',.9)'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, p.y, p.r, 0, 6.283); c.stroke();
      c.fillStyle = 'rgba(' + p.hue + ',.18)'; c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, 6.283); c.fill();
    }
    c.globalAlpha = 1;
  }

  /* ---------- practice-mode dev hook (inert unless localStorage['batty-dev'] === '1' and offline) ---------- */
  function devPanel() {
    const find = (pred, tries) => { for (let i = 0; i < (tries || 20000); i++) { const o = M.play(Batty.rng, 'base'); if (pred(o)) return o; } return M.play(Batty.rng, 'base'); };
    const api = {
      moons(n) { devNext = () => M.triggerSpin(Batty.rng, n, 'base'); },
      multi() { devNext = () => find((o) => o.spin.steps.some((s) => s.cl.some((c) => c.mult > 0))); },
      big(x) { devNext = () => find((o) => o.totalWin >= (x || 20) * U && !o.fs, 200000); },
      wild() { devNext = () => find((o) => o.spin.steps.some((s) => s.add.some((a) => a.includes(SYM.WILD))) && o.spin.steps.length >= 2); },
      outcome(fn) { devNext = fn; },
      set speed(v) { devSpeed = v; }, get speed() { return devSpeed; },
      get busy() { return busy; }, get mode() { return mode; }, get spots() { return spots.slice(); }, M,
    };
    window.__gummyDev = api;
    const b = (t, f) => h('button', { type: 'button', onclick: (e) => { e.stopPropagation(); f(); Batty.ui.toast('Next spin: ' + t); } }, t);
    return h('div', { class: 'dev' }, h('b', null, 'DEV'), b('3 Moons', () => api.moons(3)), b('5 Moons', () => api.moons(5)), b('Multiplier', () => api.multi()), b('Wild', () => api.wild()), b('Big win', () => api.big(20)));
  }

  Batty.registerGame({
    id: ID,
    name: 'Gummy Bats',
    tagline: '7×7 cluster tumbles, multiplier spots to ×1,024',
    tag: 'New',
    section: 'slots',
    isNew: true,
    poster: poster(),
    rules: rules,
    mount: mount,
    unmount: unmount,
  });
})();
