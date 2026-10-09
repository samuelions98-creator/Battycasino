/* ===== bonanza math ===== */
/* Sugar Fang Bonanza — pure maths. No DOM. Shared verbatim by the browser game, sim/bonanza.sim.js and (ported line for line)
   server/lib/games/bonanza.php.

   THE GRID   6 reels x 5 rows = 30 cells. Every cell is drawn independently from a weight table (base, ante or free-spin table).
              Cells are numbered reel-major: cell = reel * 5 + row, row 0 at the top.
   PAYS       Pay anywhere: 8 or more of one symbol anywhere on the grid pays, in three tiers (8–9, 10–11, 12+).
   TUMBLES    Every winning symbol pops, everything above falls down, new symbols drop in from the top, and the grid is paid
              again, until a drop brings no win. Lollipop scatters and Bat-Bombs never pop.
   SCATTERS   Cherry-fang Lollipops count when the tumbling stops: 4 pay 3x, 5 pay 5x, 6+ pay 100x and 4+ start 10 free spins.
   FREE SPINS Bat-Bombs (2x to 1000x) can land. When a free spin's tumbling stops, every bomb on the grid adds together and the
              total multiplies that spin's tumble win (scatter pays are never multiplied). 3+ Lollipops in a free spin: +5 spins.
   ANTE BET   Costs 1.25x the stake, pays the same as the stake, and roughly doubles the chance of the free spins.
   BONUS BUY  100x the stake: a spin that is guaranteed 4 to 6 Lollipops, then the free spins.
   MAX WIN    21,100x the stake per round (spin + free spins). The round ends the moment it is reached.
   AMOUNTS    In UNITS: 1 unit = stake / 20 (every stake on the ladder is a multiple of 20), so every payout is whole Batty Bucks. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).bonanza = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 6, ROWS = 5, CELLS = 30;
  const UNITS_PER_STAKE = 20;
  const MAX_WIN_X = 21100;
  const CAP = MAX_WIN_X * UNITS_PER_STAKE;
  const ANTE_NUM = 5, ANTE_DEN = 4;              // ante costs stake * 5 / 4
  const BUY_X = 100;                             // bonus buy price, x stake
  const MIN_PAY = 8;

  /* ---------- symbols ---------- */
  const BAT = 0, COFFIN = 1, SKULL = 2, MOON = 3, RUBY = 4, AMBER = 5, LIME = 6, BLUE = 7, VIOLET = 8, LOLLY = 9, BOMB = 10;
  const PAYERS = 9, NSYM = 11;
  const SYMBOLS = ['bat', 'coffin', 'skull', 'moon', 'ruby', 'amber', 'lime', 'blue', 'violet', 'lolly', 'bomb'];
  const SYMBOL_NAMES = ['Gummy Bat', 'Liquorice Coffin', 'Sugar Skull', 'Moon Bonbon', 'Ruby Fang Drop', 'Amber Heart', 'Lime Wedge', 'Blueberry Gem', 'Violet Star', 'Cherry-Fang Lollipop', 'Bat-Bomb'];
  /* PAY[symbol] = [8–9, 10–11, 12+] in units (20 units = 1x stake) */
  const PAY = [
    /* Gummy Bat   */ [300, 800, 1600],
    /* Coffin      */ [80, 300, 800],
    /* Sugar Skull */ [60, 160, 500],
    /* Moon Bonbon */ [40, 80, 400],
    /* Ruby        */ [30, 50, 300],
    /* Amber       */ [24, 40, 240],
    /* Lime        */ [20, 30, 160],
    /* Blueberry   */ [15, 25, 120],
    /* Violet      */ [10, 20, 80],
  ];
  /* scatter pays by count (4, 5, 6+), units */
  const SCATTER_PAY = [0, 0, 0, 0, 60, 100, 2000];
  const FS_AWARD = 10, FS_RETRIGGER = 5, FS_TRIGGER = 4, FS_RETRIGGER_AT = 3;

  /* ---------- weight tables (every probability in the game lives here) ----------
     index = symbol id. Bombs only exist in the free-spin table. */
  const W = {
    /*        Bat Cof Skl Moon Ruby Amb Lime Blue Vio Lolly Bomb */
    base: [11, 14, 17, 21, 27, 33, 39, 46, 52, 4.215, 0],
    ante: [11, 14, 17, 21, 27, 33, 39, 46, 52, 5.18, 0],
    fs: [10, 13, 16, 20, 28, 36, 44, 52, 60, 4.5, 10.8],
  };
  /* Bat-Bomb multiplier values and weights */
  const BOMB_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500, 1000];
  const BOMB_WEIGHTS = [600, 500, 420, 350, 280, 220, 180, 120, 90, 60, 40, 16, 6, 1.6, 0.6, 0.25];
  /* bonus buy: how many Lollipops the bought spin lands (index = count) */
  const BUY_SCATTERS = [0, 0, 0, 0, 82, 15, 3];

  /* ---------- helpers ---------- */
  function pickIndex(rng, weights) {
    let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }
  function bombValue(rng) { return BOMB_VALUES[pickIndex(rng, BOMB_WEIGHTS)]; }
  /* draw one cell: returns the symbol, writes the bomb value (or 0) to out[0] */
  function draw(rng, w, out) {
    const s = pickIndex(rng, w);
    out[0] = s === BOMB ? bombValue(rng) : 0;
    return s;
  }
  function tierOf(n) { return n >= 12 ? 2 : n >= 10 ? 1 : n >= MIN_PAY ? 0 : -1; }
  function scatterPay(n) { return SCATTER_PAY[Math.min(6, n)]; }

  /* the wins on a grid: [{s, n, pay}] in symbol order, plus the removed cells */
  function evaluate(g) {
    const cnt = new Array(PAYERS).fill(0);
    for (let c = 0; c < CELLS; c++) if (g[c] < PAYERS) cnt[g[c]]++;
    const wins = []; let pay = 0;
    for (let s = 0; s < PAYERS; s++) { const t = tierOf(cnt[s]); if (t >= 0) { wins.push({ s: s, n: cnt[s], pay: PAY[s][t] }); pay += PAY[s][t]; } }
    return { wins: wins, pay: pay };
  }
  /* remove cells rm, let the rest fall, and put add[reel] (top to bottom) on top. Returns new {g, m}. Pure: the client uses it too. */
  function applyTumble(g, m, rm, add, addM) {
    const ng = new Array(CELLS), nm = new Array(CELLS), gone = new Array(CELLS).fill(false);
    for (let i = 0; i < rm.length; i++) gone[rm[i]] = true;
    for (let r = 0; r < REELS; r++) {
      const keep = [], keepM = [];
      for (let w = 0; w < ROWS; w++) { const c = r * ROWS + w; if (!gone[c]) { keep.push(g[c]); keepM.push(m[c]); } }
      const top = add[r] || [], topM = addM[r] || [];
      const col = top.concat(keep), colM = topM.concat(keepM);
      for (let w = 0; w < ROWS; w++) { ng[r * ROWS + w] = col[w]; nm[r * ROWS + w] = colM[w]; }
    }
    return { g: ng, m: nm };
  }

  /* ---------- one tumble sequence ----------
     g, m: the starting grid (already drawn). w: weight table for refills. fs: true in free spins (bombs multiply).
     Returns the full script: {g, m, steps:[{wins, pay, rm, add, addM}], tw, sc, sp, bombs, mult, win}. */
  function runSequence(rng, g, m, w, fs) {
    const out = { g: g.slice(), m: m.slice(), steps: [], tw: 0, sc: 0, sp: 0, bombs: 0, mult: 1, win: 0 };
    const tmp = [0];
    for (;;) {
      const ev = evaluate(g);
      if (!ev.pay) break;
      const rm = [], hit = new Array(PAYERS).fill(false);
      for (let i = 0; i < ev.wins.length; i++) hit[ev.wins[i].s] = true;
      for (let c = 0; c < CELLS; c++) if (g[c] < PAYERS && hit[g[c]]) rm.push(c);
      const add = [], addM = [];
      for (let r = 0; r < REELS; r++) {
        let n = 0; for (let x = 0; x < rm.length; x++) if ((rm[x] / ROWS | 0) === r) n++;
        const a = [], am = [];
        for (let i = 0; i < n; i++) { a.push(draw(rng, w, tmp)); am.push(tmp[0]); }
        add.push(a); addM.push(am);
      }
      out.steps.push({ wins: ev.wins, pay: ev.pay, rm: rm, add: add, addM: addM });
      out.tw += ev.pay;
      const nx = applyTumble(g, m, rm, add, addM); g = nx.g; m = nx.m;
    }
    for (let c = 0; c < CELLS; c++) { if (g[c] === LOLLY) out.sc++; else if (g[c] === BOMB) out.bombs += m[c]; }
    out.sp = scatterPay(out.sc);
    if (fs && out.tw > 0 && out.bombs > 0) out.mult = out.bombs;
    out.win = out.tw * out.mult + out.sp;
    out.end = g; out.endM = m;
    return out;
  }
  function freshGrid(rng, w) {
    const g = new Array(CELLS), m = new Array(CELLS), tmp = [0];
    for (let c = 0; c < CELLS; c++) { g[c] = draw(rng, w, tmp); m[c] = tmp[0]; }
    return { g: g, m: m };
  }
  /* slim the script for transport: the end grid is recomputable */
  function slim(seq) { delete seq.end; delete seq.endM; return seq; }

  /* ---------- the free spins ----------
     carried: units already won this round (counts towards the cap). Returns {spins:[seq], awarded, retriggers, total, capped}. */
  function freeSpins(rng, carried) {
    const fs = { spins: [], awarded: FS_AWARD, retriggers: 0, total: 0, capped: false };
    let left = FS_AWARD;
    while (left > 0) {
      left--;
      const st = freshGrid(rng, W.fs);
      const seq = slim(runSequence(rng, st.g, st.m, W.fs, true));
      if (seq.sc >= FS_RETRIGGER_AT) { left += FS_RETRIGGER; fs.awarded += FS_RETRIGGER; fs.retriggers++; seq.retrigger = FS_RETRIGGER; }
      fs.total += seq.win;
      seq.running = fs.total;
      fs.spins.push(seq);
      if (carried + fs.total >= CAP) { fs.capped = true; fs.total = CAP - carried; seq.running = fs.total; break; }
    }
    return fs;
  }

  /* ---------- a round ----------
     mode: 'base' | 'ante'. Returns {mode, cost (in units), spin, fs, totalWin, capped}. */
  function finish(rng, mode, seq) {
    const o = { mode: mode, cost: mode === 'buy' ? BUY_X * UNITS_PER_STAKE : mode === 'ante' ? UNITS_PER_STAKE * ANTE_NUM / ANTE_DEN : UNITS_PER_STAKE, spin: seq, fs: null, totalWin: 0, capped: false };
    let total = Math.min(CAP, seq.win);
    if (seq.win >= CAP) o.capped = true;
    if (seq.sc >= FS_TRIGGER && !o.capped) {
      o.fs = freeSpins(rng, total);
      total += o.fs.total;
      if (o.fs.capped) o.capped = true;
    }
    o.totalWin = Math.min(CAP, total);
    return o;
  }
  function spin(rng, ante) {
    const w = ante ? W.ante : W.base;
    const st = freshGrid(rng, w);
    return finish(rng, ante ? 'ante' : 'base', slim(runSequence(rng, st.g, st.m, w, false)));
  }
  /* a trigger spin with exactly n Lollipops on the opening grid (bonus buy, and the dev hook) */
  function triggerSpin(rng, n, mode) {
    const w = W.base.slice(); w[LOLLY] = 0;
    const st = freshGrid(rng, w);
    const idx = []; for (let c = 0; c < CELLS; c++) idx.push(c);
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rng() * (CELLS - i)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; st.g[idx[i]] = LOLLY; st.m[idx[i]] = 0; }
    return finish(rng, mode, slim(runSequence(rng, st.g, st.m, W.base, false)));
  }
  function buy(rng) { return triggerSpin(rng, pickIndex(rng, BUY_SCATTERS), 'buy'); }

  return {
    REELS: REELS, ROWS: ROWS, CELLS: CELLS, UNITS_PER_STAKE: UNITS_PER_STAKE, MAX_WIN_X: MAX_WIN_X, CAP: CAP, ANTE_NUM: ANTE_NUM, ANTE_DEN: ANTE_DEN, BUY_X: BUY_X, MIN_PAY: MIN_PAY,
    SYM: { BAT: BAT, COFFIN: COFFIN, SKULL: SKULL, MOON: MOON, RUBY: RUBY, AMBER: AMBER, LIME: LIME, BLUE: BLUE, VIOLET: VIOLET, LOLLY: LOLLY, BOMB: BOMB },
    PAYERS: PAYERS, NSYM: NSYM, SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, PAY: PAY, SCATTER_PAY: SCATTER_PAY, W: W, BOMB_VALUES: BOMB_VALUES, BOMB_WEIGHTS: BOMB_WEIGHTS, BUY_SCATTERS: BUY_SCATTERS,
    FS_AWARD: FS_AWARD, FS_RETRIGGER: FS_RETRIGGER, FS_TRIGGER: FS_TRIGGER, FS_RETRIGGER_AT: FS_RETRIGGER_AT,
    spin: spin, buy: buy, triggerSpin: triggerSpin, freeSpins: freeSpins, runSequence: runSequence, evaluate: evaluate, applyTumble: applyTumble, tierOf: tierOf, scatterPay: scatterPay, pickIndex: pickIndex,
  };
});

/* ===== bonanza ===== */
/* Sugar Fang Bonanza — the game. Every outcome comes from BattyMath.bonanza (or, online, from the server running the
   identical maths); this file only presents it. Gothic candy: a gingerbread-and-liquorice castle under a candy-floss moon. */
(function () {
  'use strict';
  const ID = 'bonanza', M = BattyMath.bonanza, h = Batty.h;
  const SYM = M.SYM, U = M.UNITS_PER_STAKE, REELS = M.REELS, ROWS = M.ROWS, CELLS = M.CELLS;
  const DEV = /[?&]dev\b/.test(location.search);
  const KEYS = M.SYMBOLS; // bat coffin skull moon ruby amber lime blue violet lolly bomb
  const SYM_COL = ['#ff6a1f', '#ff8ac6', '#f3ece4', '#ffd84a', '#ff3b5c', '#ffa21a', '#8be33a', '#4a8dff', '#c065ff', '#ff2f5a', '#ff4a8a'];
  const DISPLAY = "'Titan One','Lilita One','Arial Rounded MT Bold','Trebuchet MS',Verdana,sans-serif";

  /* Simulation figures quoted in the rules (verbatim from tools/bonanza-sim-out.txt). */
  const SIM = {
    rounds: '10,000,000', buys: '1,000,000',
    base: '98.2', ante: '97.9', buy: '97.9',
    hit: '1 in 2.3', fsBase: '1 in 364', fsAnte: '1 in 184', avgFs: '90', max: '11,521', vol: 'High',
  };

  /* =====================================================================================
     ART — everything is drawn here. p is an id prefix so the poster and the game never share SVG ids.
     ===================================================================================== */
  const lg = (id, stops, x1, y1, x2, y2) => '<linearGradient id="' + id + '" x1="' + (x1 || 0) + '" y1="' + (y1 || 0) + '" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</linearGradient>';
  const rg = (id, stops, cx, cy, r) => '<radialGradient id="' + id + '" cx="' + (cx == null ? 0.5 : cx) + '" cy="' + (cy == null ? 0.5 : cy) + '" r="' + (r || 0.5) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</radialGradient>';

  function defs(p) {
    let s = '';
    s += rg(p + 'gum', [[0, '#ffd9a0'], [0.35, '#ff8a2a'], [0.75, '#f0400e'], [1, '#9c1c04']], 0.38, 0.32, 0.75);
    s += lg(p + 'liq', [[0, '#4a3448'], [0.45, '#1c0f1c'], [1, '#060206']], 0, 0, 1, 1);
    s += rg(p + 'bone', [[0, '#fffdf8'], [0.6, '#efe5da'], [1, '#bfae9f']], 0.4, 0.35, 0.7);
    s += rg(p + 'moon', [[0, '#fffbd6'], [0.5, '#ffdb4d'], [1, '#d9860c']], 0.38, 0.32, 0.72);
    s += lg(p + 'ruby', [[0, '#ff9ab0'], [0.4, '#ff2d55'], [1, '#6e0320']], 0, 0, 1, 1);
    s += lg(p + 'amber', [[0, '#ffe7a6'], [0.4, '#ffa21a'], [1, '#8f3c00']], 0, 0, 1, 1);
    s += lg(p + 'lime', [[0, '#eaffb0'], [0.45, '#7cd62a'], [1, '#22650a']], 0, 0, 1, 1);
    s += lg(p + 'blue', [[0, '#c8e6ff'], [0.4, '#3f86ff'], [1, '#121c6e']], 0, 0, 1, 1);
    s += lg(p + 'violet', [[0, '#f6d0ff'], [0.45, '#b553ff'], [1, '#3e0c78']], 0, 0, 1, 1);
    s += rg(p + 'cherry', [[0, '#ff8aa0'], [0.55, '#e3123c'], [1, '#6a0016']], 0.38, 0.32, 0.72);
    s += rg(p + 'bomb', [[0, '#8a3a6a'], [0.45, '#3a0c2a'], [1, '#0a0108']], 0.36, 0.3, 0.75);
    s += lg(p + 'gloss', [[0, '#ffffff', 0.85], [1, '#ffffff', 0]]);
    s += lg(p + 'stick', [[0, '#fff6fb'], [1, '#e6c9d8']], 0, 0, 1, 0);
    s += lg(p + 'wrap', [[0, '#ffd0ec'], [0.5, '#ff6fbf'], [1, '#b02a7a']], 0, 0, 1, 1);
    s += rg(p + 'spark', [[0, '#ffffff'], [0.3, '#fff2a8'], [1, '#ff8a00', 0]]);
    return s;
  }
  const GL = (p, d) => '<path d="' + d + '" fill="url(#' + p + 'gloss)" opacity=".8"/>';
  const sugar = (pts) => pts.map((q) => '<rect x="' + q[0] + '" y="' + q[1] + '" width="2.4" height="2.4" rx=".6" fill="#fff" opacity=".75" transform="rotate(' + (q[2] || 30) + ' ' + q[0] + ' ' + q[1] + ')"/>').join('');

  function symbolMarkup(p, k) {
    switch (k) {
      case 'bat': return '' +
        '<path d="M50 30C42 18 24 14 6 22c8 4 11 11 10 19 6-4 12-3 16 2 3-6 10-6 14 1z M50 30C58 18 76 14 94 22c-8 4-11 11-10 19-6-4-12-3-16 2-3-6-10-6-14 1z" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M36 26 L33 12 L44 22 Z M64 26 L67 12 L56 22 Z" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<ellipse cx="50" cy="55" rx="21" ry="30" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.8"/>' +
        '<path d="M34 40c4-10 22-12 30-2" fill="none" stroke="#ffe0b8" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
        '<ellipse cx="42" cy="46" rx="5.6" ry="6.4" fill="#fff"/><ellipse cx="58" cy="46" rx="5.6" ry="6.4" fill="#fff"/>' +
        '<circle cx="43.2" cy="47.4" r="3" fill="#2a0600"/><circle cx="59.2" cy="47.4" r="3" fill="#2a0600"/><circle cx="42" cy="45.6" r="1.1" fill="#fff"/><circle cx="58" cy="45.6" r="1.1" fill="#fff"/>' +
        '<path d="M41 60 Q50 67 59 60" fill="none" stroke="#5a1000" stroke-width="2.6" stroke-linecap="round"/>' +
        '<path d="M44 61.5 l2 6 l2.2-5 Z M52 62 l2.2 5 l2-6 Z" fill="#fff" stroke="#5a1000" stroke-width=".8" stroke-linejoin="round"/>' +
        '<ellipse cx="41" cy="72" rx="4" ry="2.4" fill="#ff3d2a" opacity=".45"/><ellipse cx="59" cy="72" rx="4" ry="2.4" fill="#ff3d2a" opacity=".45"/>' +
        sugar([[30, 54], [66, 58], [48, 80], [38, 76, 60], [62, 74, 10], [18, 26], [80, 27, 70], [52, 36]]) +
        GL(p, 'M36 34c4-6 12-7 16-5-6 1-11 4-14 9z');
      case 'coffin': return '' +
        '<path d="M38 6H62L80 28L66 94H34L20 28Z" fill="url(#' + p + 'liq)" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M40 11H60L74 29L62 89H38L26 29Z" fill="none" stroke="#5a3a58" stroke-width="1.4"/>' +
        '<path d="M22 40H78L76 50H24Z" fill="#ff8ac6" stroke="#000" stroke-width="1.4"/><path d="M24 50H76L74 58H26Z" fill="#ffe14a" stroke="#000" stroke-width="1.4"/>' +
        '<path d="M26 58H74L72 64H28Z" fill="#7fe0ff" stroke="#000" stroke-width="1.2"/>' +
        '<g fill="#ffd6ec" stroke="#b03a7a" stroke-width=".8"><circle cx="50" cy="20" r="3"/><circle cx="50" cy="28" r="3"/><circle cx="43" cy="27" r="3"/><circle cx="57" cy="27" r="3"/><circle cx="50" cy="35" r="3"/></g>' +
        '<g fill="#ffd6ec" opacity=".85"><circle cx="40" cy="74" r="2"/><circle cx="50" cy="78" r="2"/><circle cx="60" cy="74" r="2"/><circle cx="45" cy="84" r="2"/><circle cx="55" cy="84" r="2"/></g>' +
        GL(p, 'M40 9H52L33 30H27Z');
      case 'skull': return '' +
        '<path d="M50 8C28 8 16 24 16 42c0 12 6 20 14 24v14c0 6 4 10 10 10h20c6 0 10-4 10-10V66c8-4 14-12 14-24C84 24 72 8 50 8Z" fill="url(#' + p + 'bone)" stroke="#5a3048" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<g fill="#ff6fb4" stroke="#a0205e" stroke-width="1"><circle cx="35" cy="34" r="4"/><circle cx="27" cy="42" r="4"/><circle cx="31" cy="53" r="4"/><circle cx="43" cy="53" r="4"/><circle cx="45" cy="40" r="3.4"/>' +
        '<circle cx="65" cy="34" r="4"/><circle cx="73" cy="42" r="4"/><circle cx="69" cy="53" r="4"/><circle cx="57" cy="53" r="4"/><circle cx="55" cy="40" r="3.4"/></g>' +
        '<circle cx="36" cy="44" r="8.5" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6"/><circle cx="64" cy="44" r="8.5" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6"/>' +
        '<circle cx="36" cy="44" r="4.4" fill="#120818"/><circle cx="64" cy="44" r="4.4" fill="#120818"/><circle cx="34.6" cy="42.6" r="1.4" fill="#fff"/><circle cx="62.6" cy="42.6" r="1.4" fill="#fff"/>' +
        '<path d="M50 56c-4 0-6 5-4 8l4 3 4-3c2-3 0-8-4-8z" fill="#3a1030"/>' +
        '<path d="M50 14l3 6 6 1-4.4 4 1 6-5.6-3-5.6 3 1-6-4.4-4 6-1z" fill="#ffd84a" stroke="#a06000" stroke-width="1"/>' +
        '<path d="M34 74H66M40 70v12M46 70v14M52 70v14M58 70v12" stroke="#7a4a62" stroke-width="2" stroke-linecap="round"/>' +
        GL(p, 'M26 26c6-10 16-13 24-13-10 3-17 8-21 16z');
      case 'moon': return '' +
        '<path d="M24 50L4 34l4 16-4 16Z M76 50L96 34l-4 16 4 16Z" fill="url(#' + p + 'wrap)" stroke="#7a1650" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M8 40l12 6M8 60l12-6M92 40l-12 6M92 60l-12-6" stroke="#fff" stroke-width="1.6" opacity=".6"/>' +
        '<circle cx="50" cy="50" r="29" fill="url(#' + p + 'moon)" stroke="#8a4a00" stroke-width="2.6"/>' +
        '<path d="M58 26a26 26 0 1 0 14 40 22 22 0 1 1-14-40z" fill="#e89a14" opacity=".55"/>' +
        '<circle cx="40" cy="42" r="4" fill="#e8a820" opacity=".7"/><circle cx="48" cy="62" r="3" fill="#e8a820" opacity=".7"/><circle cx="36" cy="58" r="2.4" fill="#e8a820" opacity=".7"/>' +
        '<path d="M44 32c2 3 6 3 8 0 0 4 3 6 6 6-3 1-4 4-3 6-3-2-6-2-8 0 1-3 0-5-3-6 3-1 1-4 0-6z" fill="#3a1200" opacity=".55" transform="translate(4 6) scale(.9)"/>' +
        GL(p, 'M32 34c5-9 13-12 20-12-9 3-14 8-17 15z');
      case 'ruby': return '' +
        '<path d="M50 6C66 30 80 46 80 64a30 30 0 0 1-60 0C20 46 34 30 50 6Z" fill="url(#' + p + 'ruby)" stroke="#5a0016" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M50 6L40 50L50 92L60 50Z M20 64L40 50M80 64L60 50M40 50H60" fill="none" stroke="#ffc0cc" stroke-width="1.2" opacity=".55"/>' +
        '<path d="M50 6L40 50H60Z" fill="#fff" opacity=".18"/>' + GL(p, 'M34 52c2-10 8-20 14-30-3 12-6 22-8 32z');
      case 'amber': return '' +
        '<path d="M50 88C30 74 10 58 10 38c0-14 10-24 22-24 8 0 14 4 18 10 4-6 10-10 18-10 12 0 22 10 22 24 0 20-20 36-40 50Z" fill="url(#' + p + 'amber)" stroke="#6a2a00" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M50 24L36 42L50 76L64 42Z M10 38H36M90 38H64" fill="none" stroke="#fff0c8" stroke-width="1.2" opacity=".55"/>' +
        '<path d="M50 24L36 42H64Z" fill="#fff" opacity=".2"/>' + GL(p, 'M18 30c2-8 8-12 14-12-6 4-9 9-10 16z');
      case 'lime': return '' +
        '<path d="M8 40A42 42 0 0 0 92 40Z" fill="#f4ffd8" stroke="#2a5a08" stroke-width="2.6" stroke-linejoin="round" transform="translate(0 6)"/>' +
        '<path d="M14 46A36 36 0 0 0 86 46Z" fill="url(#' + p + 'lime)"/>' +
        '<path d="M50 46L22 66M50 46L36 78M50 46L50 82M50 46L64 78M50 46L78 66" stroke="#eaffc0" stroke-width="2.4" opacity=".9"/>' +
        '<path d="M8 46H92" stroke="#2a5a08" stroke-width="2.6" stroke-linecap="round"/>' +
        sugar([[26, 54], [70, 56], [44, 70], [58, 64, 70], [34, 62, 10], [62, 76]]) +
        GL(p, 'M18 50h20c-2 6-6 10-12 12-4-3-7-7-8-12z');
      case 'blue': return '' +
        '<path d="M32 10H68L90 32V68L68 90H32L10 68V32Z" fill="url(#' + p + 'blue)" stroke="#0a1450" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M38 26H62L74 38V62L62 74H38L26 62V38Z" fill="#6aa8ff" opacity=".35" stroke="#d6ecff" stroke-width="1.2"/>' +
        '<path d="M32 10L38 26M68 10L62 26M90 32L74 38M90 68L74 62M68 90L62 74M32 90L38 74M10 68L26 62M10 32L26 38" stroke="#d6ecff" stroke-width="1.2" opacity=".6"/>' +
        GL(p, 'M32 12H62L44 30H30Z');
      case 'violet': return '' +
        '<path d="M50 6L62 36L94 38L69 58L78 90L50 72L22 90L31 58L6 38L38 36Z" fill="url(#' + p + 'violet)" stroke="#2c0656" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M50 20L57 40L78 42L62 54L67 75L50 63L33 75L38 54L22 42L43 40Z" fill="#e0a8ff" opacity=".3"/>' +
        GL(p, 'M40 34L50 10L53 22L44 38Z');
      case 'lolly': return '' +
        '<rect x="46" y="62" width="8" height="36" rx="4" fill="url(#' + p + 'stick)" stroke="#8a5a72" stroke-width="1.6"/>' +
        '<path d="M46 72l8-4M46 82l8-4M46 92l8-4" stroke="#ff4a7a" stroke-width="2"/>' +
        '<circle cx="50" cy="38" r="33" fill="url(#' + p + 'cherry)" stroke="#5a0012" stroke-width="2.8"/>' +
        '<path d="M50 38m-2 0a2 2 0 0 1 4 0a6 6 0 0 1-12 0a10 10 0 0 1 20 0a14 14 0 0 1-28 0a18 18 0 0 1 36 0a22 22 0 0 1-44 0a26 26 0 0 1 52 0" fill="none" stroke="#fff3f6" stroke-width="3.6" stroke-linecap="round" opacity=".92"/>' +
        '<path d="M38 69l4 9 4-8Z M54 70l4 8 4-9Z" fill="#fff" stroke="#5a0012" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<path d="M38 64c-8 2-12 8-8 12 6 0 10-6 12-10M62 64c8 2 12 8 8 12-6 0-10-6-12-10" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<circle cx="50" cy="65" r="4" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6"/>' +
        GL(p, 'M26 26c6-10 16-14 26-14-10 4-18 10-22 20z');
      case 'bomb': return '' +
        '<path d="M50 52C38 34 18 30 2 40c8 3 10 10 9 17 6-4 12-3 15 2 4-5 10-5 13 1z M50 52C62 34 82 30 98 40c-8 3-10 10-9 17-6-4-12-3-15 2-4-5-10-5-13 1z" fill="#2a0a20" stroke="#ff4a8a" stroke-width="2" stroke-linejoin="round"/>' +
        '<circle cx="50" cy="58" r="30" fill="url(#' + p + 'bomb)" stroke="#ff4a8a" stroke-width="2.6"/>' +
        '<rect x="43" y="22" width="14" height="9" rx="2" fill="#5a3a50" stroke="#ff4a8a" stroke-width="1.6"/>' +
        '<path d="M50 22c0-8 6-12 12-12" fill="none" stroke="#e8c8a0" stroke-width="2.6" stroke-linecap="round"/>' +
        '<circle class="fuse" cx="63" cy="10" r="7" fill="url(#' + p + 'spark)"/>' +
        '<path d="M34 44c4-6 10-9 16-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>';
    }
    return '';
  }
  const P = 'bonanza-';
  function defsSvg() {
    let s = '<svg class="g-bonanza-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + defs(P);
    for (const k of KEYS) s += '<g id="' + P + 's-' + k + '">' + symbolMarkup(P, k) + '</g>';
    return s + '</defs></svg>';
  }
  const useSym = (key, cls) => '<svg class="' + (cls || 'sym') + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#' + P + 's-' + key + '"/></svg>';

  /* the castle and sky (shared by the scene and the poster) */
  function castle(p, lit) {
    const win = lit ? '#ffcf5a' : '#ff8ac6';
    let s = '<g class="castle">';
    s += '<path d="M120 300V170h24v-26l-12-26h48l-12 26v26h20v-40l-14-30h60l-14 30v40h22v-60l-18-36h76l-18 36v60h22v-40l-14-30h60l-14 30v40h20v-26l-12-26h48l-12 26v26h24v130Z" fill="#2a1030" stroke="#12060f" stroke-width="3"/>';
    s += '<path d="M132 118l24-58 24 58Z M220 104l20-60 20 60Z M302 88l28-72 28 72Z M392 104l20-60 20 60Z M478 118l24-58 24 58Z" fill="url(#' + p + 'spire)" stroke="#12060f" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M120 172q12 12 24 0t24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0" fill="none" stroke="#ff9ad5" stroke-width="7" stroke-linecap="round"/>';
    s += '<path d="M150 178v10M200 176v16M258 178v8M312 176v18M368 178v10M420 176v14M478 178v9M520 176v12" stroke="#ff9ad5" stroke-width="6" stroke-linecap="round"/>';
    for (const [x, y] of [[150, 140], [240, 128], [330, 112], [420, 128], [502, 140], [200, 210], [300, 200], [360, 200], [460, 210]]) s += '<path d="M' + (x - 7) + ' ' + (y + 16) + 'v-10a7 7 0 0 1 14 0v10Z" fill="' + win + '" class="win"/>';
    s += '<path d="M310 300v-46a20 20 0 0 1 40 0v46Z" fill="#12060f"/><path d="M314 300v-44a16 16 0 0 1 32 0v44" fill="none" stroke="#ffcf5a" stroke-width="2" opacity=".5"/>';
    s += '<g fill="#ff4a1c"><circle cx="156" cy="60" r="5"/><circle cx="240" cy="44" r="5"/><circle cx="330" cy="16" r="6"/><circle cx="412" cy="44" r="5"/><circle cx="502" cy="60" r="5"/></g>';
    return s + '</g>';
  }
  function sceneDefs(p) {
    return lg(p + 'sky', [[0, '#12051c'], [0.45, '#3a0c40'], [0.75, '#8a1f5a'], [1, '#ff6a6a']]) +
      rg(p + 'mglow', [[0, '#ffd6f0', 0.85], [0.35, '#ff8ad0', 0.35], [1, '#ff4aa8', 0]]) +
      rg(p + 'mface', [[0, '#fffafd'], [0.6, '#ffd0ec'], [1, '#f39ad0']], 0.42, 0.38, 0.65) +
      lg(p + 'spire', [[0, '#ffe7f4'], [0.5, '#ff6fbf'], [1, '#8a1450']], 0, 0, 1, 0) +
      lg(p + 'hill', [[0, '#5a1a52'], [1, '#1a0618']]) + lg(p + 'hill2', [[0, '#3a0e3a'], [1, '#0e030d']]);
  }
  function sceneSvg() {
    const p = P + 'sc-';
    let s = '<svg class="bg" viewBox="0 0 660 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>' + sceneDefs(p) + '</defs>';
    s += '<rect width="660" height="400" fill="url(#' + p + 'sky)"/>';
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) { const x = rnd() * 660, y = rnd() * 230, r = rnd() < 0.12 ? 1.6 : 0.8; s += '<circle class="st" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + (rnd() < 0.3 ? '#ffd0ec' : '#fff') + '" opacity="' + (0.35 + rnd() * 0.6).toFixed(2) + '"/>'; }
    s += '<g class="moon"><circle cx="330" cy="120" r="150" fill="url(#' + p + 'mglow)"/><circle cx="330" cy="120" r="78" fill="url(#' + p + 'mface)"/>';
    for (const [x, y, r] of [[290, 96, 16], [312, 84, 12], [352, 92, 18], [376, 118, 14], [300, 140, 13], [340, 150, 17], [366, 152, 10], [318, 116, 9]]) s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" opacity=".45"/>';
    s += '<path d="M252 150c20 16 54 22 92 16 30-4 52-14 64-28" fill="none" stroke="#ff9ad5" stroke-width="10" stroke-linecap="round" opacity=".35"/></g>';
    s += '<g class="floss"><path d="M-20 200c30-20 60-10 80 0 20-24 70-24 90 0 20-12 50-12 60 4H-20Z" fill="#ff9ad5" opacity=".28"/><path d="M450 170c24-18 60-14 76 2 22-22 70-20 86 0 18-10 40-6 56 6H450Z" fill="#c38aff" opacity=".22"/></g>';
    s += '<g class="bats" fill="#12060f">';
    for (const [x, y, k] of [[120, 70, 0.22], [170, 50, 0.16], [520, 64, 0.2], [560, 92, 0.14], [470, 40, 0.12]]) s += '<path class="fbat" d="' + Batty.batPath + '" transform="translate(' + x + ' ' + y + ') scale(' + k + ')"/>';
    s += '</g>';
    s += castle(p, false);
    s += '<path d="M0 330c60-40 120-30 170-6 50-34 120-36 170-4 60-30 130-30 180 0 50-24 100-20 140 4V400H0Z" fill="url(#' + p + 'hill)"/>';
    s += '<path d="M0 360c40-20 90-20 130 0 40-18 100-22 150 0 50-20 110-20 160 0 40-16 80-16 120 0 40-14 70-10 100 2V400H0Z" fill="url(#' + p + 'hill2)"/>';
    for (const [x, c] of [[24, '#ff4a8a'], [70, '#2bd6b0'], [590, '#ffd84a'], [636, '#ff6a1f']]) s += '<g transform="translate(' + x + ' 352)"><rect x="-2" y="0" width="4" height="30" fill="#f4e4ee"/><circle r="12" fill="' + c + '" stroke="#12060f" stroke-width="2"/><path d="M-8-3a8 8 0 0 1 14 2" stroke="#fff" stroke-width="2.4" fill="none" opacity=".6"/></g>';
    return s + '</svg>';
  }

  /* drippy logo lettering */
  function logoSvg(p, compact) {
    const drip = '#ff9ad5';
    return '<svg class="logo" viewBox="0 0 360 ' + (compact ? 70 : 118) + '" aria-label="Sugar Fang Bonanza">' +
      '<defs>' + lg(p + 'lt', [[0, '#fff2fa'], [0.45, '#ff9ad5'], [1, '#d6338a']]) + lg(p + 'lb', [[0, '#ffe4a0'], [0.4, '#ff8a2a'], [1, '#c0200a']]) + '</defs>' +
      '<text x="180" y="' + (compact ? 34 : 50) + '" text-anchor="middle" font-family="' + DISPLAY.replace(/"/g, '') + '" font-size="' + (compact ? 34 : 50) + '" fill="url(#' + p + 'lt)" stroke="#2a0620" stroke-width="7" paint-order="stroke" letter-spacing="1">SUGAR FANG</text>' +
      (compact ? '' : '<path d="M86 52v8a3 3 0 0 0 6 0v-8M140 54v14a3.4 3.4 0 0 0 7 0V54M214 54v10a3 3 0 0 0 6 0V54M262 52v16a3.6 3.6 0 0 0 7 0V52" fill="' + drip + '" stroke="#2a0620" stroke-width="2"/>') +
      '<text x="180" y="' + (compact ? 64 : 104) + '" text-anchor="middle" font-family="' + DISPLAY.replace(/"/g, '') + '" font-size="' + (compact ? 28 : 46) + '" fill="url(#' + p + 'lb)" stroke="#2a0620" stroke-width="7" paint-order="stroke" letter-spacing="' + (compact ? 6 : 8) + '">BONANZA</text></svg>';
  }

  /* ---------- lobby poster ---------- */
  function poster() {
    const p = P + 'po-';
    let s = '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>' + defs(p) + sceneDefs(p) +
      lg(p + 'lt', [[0, '#fff2fa'], [0.45, '#ff9ad5'], [1, '#d6338a']]) + lg(p + 'lb', [[0, '#ffe4a0'], [0.4, '#ff8a2a'], [1, '#c0200a']]) + '</defs>';
    s += '<rect width="320" height="400" fill="url(#' + p + 'sky)"/>';
    for (let i = 0; i < 40; i++) s += '<circle cx="' + ((i * 73) % 320) + '" cy="' + ((i * 41) % 200) + '" r="' + (i % 5 ? 0.8 : 1.5) + '" fill="#fff" opacity="' + (0.3 + (i % 4) * 0.15) + '"/>';
    s += '<circle cx="160" cy="150" r="130" fill="url(#' + p + 'mglow)"/><circle cx="160" cy="150" r="74" fill="url(#' + p + 'mface)"/>';
    for (const [x, y, r] of [[128, 128, 14], [150, 116, 10], [184, 124, 16], [200, 150, 12], [136, 170, 12], [172, 180, 15]]) s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" opacity=".45"/>';
    s += '<g transform="translate(-170 92) scale(.95)">' + castle(p, true) + '</g>';
    s += '<path d="M0 330c50-30 110-24 160 0 50-24 110-30 160 0V400H0Z" fill="url(#' + p + 'hill)"/>';
    s += '<g transform="translate(18 208) rotate(-14) scale(1.15)">' + symbolMarkup(p, 'lolly') + '</g>';
    s += '<g transform="translate(196 198) rotate(10) scale(1.08)">' + symbolMarkup(p, 'bat') + '</g>';
    s += '<g transform="translate(118 268) scale(.78)">' + symbolMarkup(p, 'bomb') + '</g>';
    s += '<text x="157" y="314" text-anchor="middle" font-family="' + DISPLAY.replace(/"/g, '') + '" font-size="22" fill="#fff" stroke="#2a0620" stroke-width="5" paint-order="stroke">100×</text>';
    s += '<g transform="translate(250 290) scale(.5)">' + symbolMarkup(p, 'skull') + '</g><g transform="translate(14 300) scale(.46)">' + symbolMarkup(p, 'moon') + '</g>';
    s += '<text x="160" y="54" text-anchor="middle" font-family="' + DISPLAY.replace(/"/g, '') + '" font-size="44" fill="url(#' + p + 'lt)" stroke="#2a0620" stroke-width="8" paint-order="stroke">SUGAR FANG</text>';
    s += '<path d="M70 56v10a3.4 3.4 0 0 0 7 0V56M124 58v16a3.6 3.6 0 0 0 7 0V58M196 58v9a3 3 0 0 0 6 0v-9M244 56v14a3.4 3.4 0 0 0 7 0V56" fill="#ff9ad5" stroke="#2a0620" stroke-width="2"/>';
    s += '<text x="160" y="98" text-anchor="middle" font-family="' + DISPLAY.replace(/"/g, '') + '" font-size="38" fill="url(#' + p + 'lb)" stroke="#2a0620" stroke-width="8" paint-order="stroke" letter-spacing="6">BONANZA</text>';
    s += '<rect x="64" y="362" width="192" height="26" rx="13" fill="#2a0620" stroke="#ff9ad5" stroke-width="2"/><text x="160" y="380" text-anchor="middle" font-family="Figtree,Arial,sans-serif" font-weight="800" font-size="12" fill="#ffd6ec" letter-spacing="1.5">PAYS ANYWHERE · TUMBLES</text>';
    return s + '</svg>';
  }

  /* =====================================================================================
     RULES
     ===================================================================================== */
  function rules() {
    const st = (Batty.ui && stakeCtl) ? stakeCtl.value : 100, f = Batty.fmt;
    let t = '<h3>Pays anywhere</h3><p>Six reels, five rows, no paylines. Land <b>8 or more</b> of the same sweet <b>anywhere</b> on the grid and they pay. ' +
      'The pays below are in multiples of your stake (and in Batty Bucks at your current stake of ' + f(st) + ' BB).</p>';
    t += '<table><tr><th>Sweet</th><th>8–9</th><th>10–11</th><th>12+</th></tr>';
    for (let s = 0; s < M.PAYERS; s++) t += '<tr><td>' + M.SYMBOL_NAMES[s] + '</td>' + M.PAY[s].map((u) => '<td>' + (u / U) + '× <small>(' + f(u * st / U) + ')</small></td>').join('') + '</tr>';
    t += '</table>';
    t += '<h3>Tumbles</h3><p>Every winning sweet pops, everything above drops down and new sweets fall in from the top. The grid pays again, as many times as it keeps winning. One spin can pay many times over.</p>';
    t += '<h3>Cherry-Fang Lollipops (scatter)</h3><p>Lollipops never pop. When the tumbling stops, count them anywhere: <b>4 pay 3×, 5 pay 5×, 6 or more pay 100×</b> your stake, and <b>4 or more start 10 free spins</b>.</p>';
    t += '<h3>Free spins and Bat-Bombs</h3><p>In free spins, Bat-Bombs worth <b>2× to 1,000×</b> can drop in. Bombs never pop. When a free spin stops tumbling, every bomb on the grid is added together and the total multiplies that spin\'s tumble win (Lollipop pays are not multiplied). Bombs with no tumble win to multiply fizzle out. ' +
      '<b>3 or more Lollipops</b> in a free spin add <b>5 more free spins</b>, as many times as you can land them.</p>';
    t += '<table><tr><th>Bat-Bomb</th><th>Chance when a bomb lands</th></tr>';
    let tw = 0; for (const w of M.BOMB_WEIGHTS) tw += w;
    for (let i = 0; i < M.BOMB_VALUES.length; i++) t += '<tr><td>' + M.BOMB_VALUES[i] + '×</td><td>' + (M.BOMB_WEIGHTS[i] / tw * 100).toFixed(M.BOMB_WEIGHTS[i] / tw < 0.01 ? 3 : 1) + '%</td></tr>';
    t += '</table>';
    t += '<h3>Fang Bet (ante)</h3><p>Switch on the <b>Fang Bet</b> and each spin costs <b>1.25× your stake</b>. Wins are paid on your stake as normal, but Lollipops land more often, roughly <b>doubling the chance of free spins</b>. The bonus buy is unavailable while it is on.</p>';
    t += '<h3>Bonus Buy</h3><p>Pay <b>' + M.BUY_X + '× your stake</b> for a spin that is guaranteed to land 4, 5 or 6 Lollipops (82%, 15% and 3% of the time), which pay as normal and start the free spins.</p>';
    t += '<h3>Numbers from the simulation</h3><table>' +
      '<tr><td>Return, standard spins</td><td><b>' + SIM.base + '%</b></td></tr>' +
      '<tr><td>Return, Fang Bet on</td><td><b>' + SIM.ante + '%</b></td></tr>' +
      '<tr><td>Return, Bonus Buy</td><td><b>' + SIM.buy + '%</b></td></tr>' +
      '<tr><td>Hit rate (any win)</td><td>' + SIM.hit + ' spins</td></tr>' +
      '<tr><td>Free spins, standard</td><td>' + SIM.fsBase + ' spins</td></tr>' +
      '<tr><td>Free spins, Fang Bet</td><td>' + SIM.fsAnte + ' spins</td></tr>' +
      '<tr><td>Average free spins win</td><td>' + SIM.avgFs + '× stake</td></tr>' +
      '<tr><td>Volatility</td><td>' + SIM.vol + '</td></tr>' +
      '<tr><td>Biggest win seen in simulation</td><td>' + SIM.max + '× stake</td></tr></table>';
    t += '<h3>Small print</h3><p>The most one round (a spin and all its free spins) can pay is <b>' + f(M.MAX_WIN_X) + '× your stake</b>; the round ends at once if it gets there. ' +
      'Keys: Space spins (and hurries the animation), T turbo, A autoplay, F Fang Bet, B bonus buy. Autoplay stops at your loss limit, when a free-spins round starts (if you ask it to), or when you run short. Batty Bucks have no cash value.</p>';
    t += '<p class="rtp">Designed return ' + SIM.base + '%. Live-balanced site-wide to a 98% target.</p>';
    t += '<p class="rtp">Tested return: ' + SIM.base + '% standard, ' + SIM.ante + '% with the Fang Bet over ' + SIM.rounds + ' simulated spins each, and ' + SIM.buy + '% on the Bonus Buy over ' + SIM.buys + ' simulated buys.</p>';
    return t;
  }

  /* =====================================================================================
     THE GAME
     ===================================================================================== */
  let S = null, root = null, E = null, stakeCtl = null;
  let busy = false, turbo = false, hurry = false, anteOn = false, mode = 'base', wide = false;
  let auto = 0, autoLimit = 0, autoStart = 0, autoStopFs = false;
  let cw = 64, ch = 64, cells = [], skipFns = [], tapFn = null;
  let parts = [], partStop = null, fxCx = null, fxDpr = 1;
  let devNext = null, devSpeed = 1, devLog = null;
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = (ms) => ms * (turbo ? 0.55 : 1) * (hurry ? 0.3 : 1) * (reduce() ? 0.6 : 1) * devSpeed;
  function nap(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; const i = skipFns.indexOf(fin); if (i >= 0) skipFns.splice(i, 1); res(); };
      skipFns.push(fin); S.timeout(fin, T(ms));
    });
  }
  function doSkip() { hurry = true; const f = skipFns.slice(); skipFns.length = 0; f.forEach((x) => x()); }
  function waitTap(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; tapFn = null; res(); };
      tapFn = fin; S.timeout(fin, T(ms) / (hurry ? 0.3 : 1));
    });
  }
  const A = Batty.audio, N = Batty.notes;
  const snd = {
    thud(r) { A.tone({ f: 200 - r * 12, f2: 70, d: 0.12, type: 'sine', v: 0.22 }); A.noise({ d: 0.05, v: 0.05, lp: 1400 }); },
    land() { A.tone({ f: 1250, f2: 1600, d: 0.05, type: 'triangle', v: 0.06 }); },
    lolly(n) { const f = [784, 880, 988, 1175, 1319, 1568][Math.min(5, n)]; A.tone({ f, d: 0.45, type: 'sine', v: 0.2 }); A.tone({ f: f * 2, d: 0.3, type: 'sine', v: 0.06, t: 0.02 }); A.tone({ f: f * 1.5, d: 0.35, type: 'triangle', v: 0.06, t: 0.06 }); },
    tease() { A.noise({ d: 1.1, v: 0.06, hp: 2400, f2: 9000 }); A.tone({ f: 330, f2: 660, d: 1.1, type: 'triangle', v: 0.06 }); },
    win(k) { const b = 523.3 * Math.pow(2, Math.min(k, 10) / 12); A.seq([b, b * 1.26, b * 1.5, b * 2], { step: 0.06, type: 'triangle', v: 0.16 }); A.tone({ f: b * 4, d: 0.25, type: 'sine', v: 0.04, t: 0.2 }); },
    pop(i) { A.tone({ f: 380 + i * 40, f2: 1400 + i * 60, d: 0.07, type: 'sine', v: 0.16, t: i * 0.018 }); },
    fizz() { A.noise({ d: 0.35, v: 0.08, hp: 3000, f2: 800 }); },
    boom() { A.noise({ d: 0.7, v: 0.32, lp: 900, f2: 60 }); A.tone({ f: 110, f2: 38, d: 0.6, type: 'sawtooth', v: 0.14 }); },
    fly() { A.tone({ f: 600, f2: 2200, d: 0.28, type: 'sine', v: 0.08 }); },
    chime(k) { A.tone({ f: 1046.5 * Math.pow(2, Math.min(k, 12) / 12), d: 0.35, type: 'sine', v: 0.16 }); A.tone({ f: 2093 * Math.pow(2, Math.min(k, 12) / 12), d: 0.2, type: 'sine', v: 0.05 }); },
    intro() { A.seq([N.A4, N.C5, N.E5, N.A5, N.G5, N.E5, N.F5, [N.A5, 3]], { step: 0.11, type: 'square', v: 0.09 }); A.seq([220, 0, 0, 0, 174.6, 0, 0, [220, 4]], { step: 0.11, type: 'triangle', v: 0.18 }); A.noise({ d: 1.2, v: 0.05, hp: 5000 }); },
    retrig() { A.seq([N.E5, N.G5, N.B5, [N.E6, 2]], { step: 0.07, type: 'square', v: 0.1 }); },
    outro() { A.seq([N.C5, N.E5, N.G5, N.C6, N.B5, N.G5, [N.C6, 4]], { step: 0.1, type: 'triangle', v: 0.18 }); },
    spin() { A.noise({ d: 0.3, v: 0.08, lp: 600, f2: 2400 }); A.tone({ f: 300, f2: 900, d: 0.18, type: 'triangle', v: 0.06 }); },
  };

  /* ---------- build ---------- */
  function mount(el, B) {
    S = B.scope(); root = el; busy = false; hurry = false; mode = 'base'; cells = []; skipFns = []; tapFn = null; parts = []; partStop = null;
    auto = 0; turbo = false; devNext = null;
    anteOn = false; try { anteOn = localStorage.getItem('bonanza-ante') === '1'; } catch (e) { /* ignore */ }
    E = {};
    root.innerHTML = defsSvg();
    E.scene = h('div', { class: 'scene', html: sceneSvg() });

    E.logo = h('div', { class: 'brand', html: logoSvg(P + 'lg-', false) });
    E.grid = h('div', { class: 'grid', onclick: () => { if (tapFn) tapFn(); else if (busy) doSkip(); } });
    E.burst = h('div', { class: 'tally' });
    E.banner = h('div', { class: 'banner' });
    E.frame = h('div', { class: 'frame' }, h('i', { class: 'drips', html: dripSvg() }), E.grid, E.burst, E.banner);

    /* hud above the grid */
    E.win = h('output', null, '0');
    E.fsLeft = h('output', null, '0');
    E.mult = h('output', null, '×0');
    E.fsTotal = h('output', null, '0');
    E.hud = h('div', { class: 'hud' },
      h('div', { class: 'cell w' }, h('small', null, 'Win'), E.win),
      h('div', { class: 'cell fsl' }, h('small', null, 'Free spins'), E.fsLeft),
      h('div', { class: 'cell mul' }, h('small', null, 'Bat-Bombs'), E.mult),
      h('div', { class: 'cell fst' }, h('small', null, 'Bonus total'), E.fsTotal));
    E.msg = h('p', { class: 'msg' }, '');

    /* feature cards */
    E.ante = h('button', { class: 'feat ante', type: 'button', id: 'bonanza-ante', 'aria-pressed': 'false', onclick: toggleAnte },
      h('span', { class: 'ico', html: useSym('lolly') }), h('span', { class: 't' }, h('b', null, 'Fang Bet'), h('small', null, '')), h('i', { class: 'sw' }));
    E.buy = h('button', { class: 'feat buy', type: 'button', id: 'bonanza-buy', onclick: openBuy },
      h('span', { class: 'ico', html: useSym('bomb') }), h('span', { class: 't' }, h('b', null, 'Buy Free Spins'), h('small', null, '')));
    E.feats = h('div', { class: 'feats' }, E.ante, E.buy);

    /* paytable side panel (wide screens) */
    E.pay = h('div', { class: 'paytbl' });
    E.side = h('aside', { class: 'side l' }, E.logo, E.feats, h('div', { class: 'keys', html: '<b>Space</b> spin <b>T</b> turbo <b>A</b> auto <b>F</b> Fang Bet <b>B</b> buy' }));
    E.sideR = h('aside', { class: 'side r' }, h('h4', null, 'Pays anywhere'), E.pay);

    /* controls */
    E.stakeBox = h('div', { class: 'stakebox' });
    stakeCtl = Batty.ui.stake(E.stakeBox, { id: ID, onChange: paintStake, label: 'Stake · BB' });
    E.spin = h('button', { class: 'spin', type: 'button', id: 'bonanza-spin', 'aria-label': 'Spin', onclick: primary, html: spinSvg() + '<span class="n"></span>' });
    E.autoBtn = h('button', { class: 'btn auto', type: 'button', id: 'bonanza-auto', onclick: autoClick }, h('b', null, 'Auto'), h('small', null, 'off'));
    E.turboBtn = h('button', { class: 'btn turbo', type: 'button', id: 'bonanza-turbo', 'aria-pressed': 'false', onclick: toggleTurbo }, h('b', null, 'Turbo'), h('small', null, 'off'));
    E.autoMenu = buildAutoMenu();
    E.ctlRow = h('div', { class: 'ctlrow' }, h('div', { class: 'l' }, E.stakeBox), E.spin, h('div', { class: 'r' }, E.autoBtn, E.turboBtn));
    E.ctl = h('div', { class: 'ctl' }, E.ctlRow, E.autoMenu);

    E.main = h('div', { class: 'main' }, E.hud, E.frame, E.msg);
    E.wrap = h('div', { class: 'wrap' }, E.side, E.main, E.sideR, E.ctl);
    E.fx = h('canvas', { class: 'fxc', 'aria-hidden': 'true' }); fxCx = E.fx.getContext('2d');
    E.ov = h('div', { class: 'ov', hidden: true, onclick: (e) => { if (tapFn && !e.target.closest('button')) tapFn(); } });
    root.append(E.scene, E.wrap, E.fx, E.ov);

    /* opening grid: a quiet, winless arrangement */
    const g = [], m = [];
    const open = [4, 7, 2, 8, 5, 1, 6, 3, 0, 4, 8, 5, 7, 2, 6, 9, 3, 1, 5, 0, 8, 4, 7, 6, 2, 3, 6, 8, 1, 5];
    for (let c = 0; c < CELLS; c++) { g.push(open[c]); m.push(0); }
    layout();
    for (let c = 0; c < CELLS; c++) { const o = makeCell(g[c], 0); place(o, (c / ROWS) | 0, c % ROWS); cells[c] = o; E.grid.append(o.el); }

    paintStake(); paintAnte(); paintCtl(); setMsg('Land 8 or more of a sweet anywhere to win');
    const ro = new ResizeObserver(layout); ro.observe(root); S._ro = ro; S.on(window, 'resize', layout);
    S.on(document, 'keydown', onKey);
    S.interval(() => { if (!busy && mode === 'base' && !reduce()) idleWiggle(); }, 2600);
    if (DEV) {
      devLog = { rounds: 0, staked: 0, won: 0, start: Batty.wallet.balance, bonuses: 0 };
      window.__bonanzaDev = {
        /* next (practice) spin opens with exactly n Lollipops */
        force(n) { devNext = (ante) => M.triggerSpin(Batty.rng, n, ante ? 'ante' : 'base'); },
        forceOutcome(fn) { devNext = fn; },
        set speed(v) { devSpeed = v; }, get speed() { return devSpeed; },
        get log() { return devLog; }, get busy() { return busy; }, get auto() { return auto; }, get mode() { return mode; },
        get grid() { return cells.map((o) => o.s); }, M,
      };
    }
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    S = null; root = null; E = null; cells = []; skipFns = []; tapFn = null; busy = false; auto = 0; parts = []; partStop = null; devSpeed = 1;
    if (DEV) delete window.__bonanzaDev;
  }

  function dripSvg() {
    let d = 'M0 0H400V8';
    let x = 400; const pts = [[380, 10], [362, 22], [344, 9], [318, 16], [298, 30], [276, 10], [250, 18], [228, 9], [206, 26], [186, 11], [160, 20], [138, 9], [116, 28], [94, 12], [70, 18], [48, 8], [26, 24], [8, 10]];
    for (const [px, py] of pts) { d += 'Q' + ((x + px) / 2) + ' ' + (py + 4) + ' ' + px + ' ' + Math.min(py, 12); x = px; }
    d += 'L0 10Z';
    return '<svg viewBox="0 0 400 34" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" fill="#ff9ad5"/><path d="M0 3H400" stroke="#fff" stroke-width="2" opacity=".55"/></svg>';
  }
  function spinSvg() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="url(#' + P + 'cherry)" stroke="#2a0620" stroke-width="4"/>' +
      '<path class="sw" d="M50 50m-2 0a2 2 0 0 1 4 0a7 7 0 0 1-14 0a12 12 0 0 1 24 0a17 17 0 0 1-34 0a22 22 0 0 1 44 0a27 27 0 0 1-54 0a32 32 0 0 1 64 0a37 37 0 0 1-74 0" fill="none" stroke="#fff3f6" stroke-width="4.4" stroke-linecap="round" opacity=".9"/>' +
      '<path d="M26 30c8-12 20-16 30-16-12 4-20 10-25 20z" fill="#fff" opacity=".55"/><rect class="sq" x="36" y="36" width="28" height="28" rx="6" fill="#2a0620"/></svg>';
  }
  function buildAutoMenu() {
    const box = h('div', { class: 'automenu', hidden: true });
    let limit = 50, stopFs = true;
    const lim = h('div', { class: 'chips' });
    const limits = [[0, 'None'], [20, '20×'], [50, '50×'], [100, '100×'], [250, '250×']];
    const paintLim = () => lim.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === limit));
    for (const [v, l] of limits) lim.append(h('button', { type: 'button', 'data-v': v, onclick: () => { limit = v; paintLim(); Batty.sfx('click'); } }, l));
    const fsBtn = h('button', { type: 'button', class: 'tog on', id: 'bonanza-auto-fs', onclick: () => { stopFs = !stopFs; fsBtn.classList.toggle('on', stopFs); fsBtn.textContent = stopFs ? 'Yes' : 'No'; Batty.sfx('click'); } }, 'Yes');
    const rounds = h('div', { class: 'chips rounds' });
    for (const n of [10, 25, 50, 100, 500]) rounds.append(h('button', { type: 'button', 'data-n': n, onclick: () => startAuto(n, limit, stopFs) }, String(n)));
    box.append(h('h5', null, 'Loss limit (× stake)'), lim, h('h5', null, 'Stop when free spins start'), fsBtn, h('h5', null, 'Spins'), rounds);
    paintLim();
    return box;
  }
  function startAuto(n, limit, stopFs) {
    E.autoMenu.hidden = true; auto = n; autoLimit = limit * stakeCtl.value; autoStopFs = stopFs; autoStart = Batty.wallet.balance;
    Batty.sfx('click'); paintCtl(); if (!busy) spin(false);
  }
  function stopAuto(why) { if (auto > 0 && why) Batty.ui.toast(why); auto = 0; paintCtl(); }
  function autoClick() { Batty.sfx('click'); if (auto > 0) return stopAuto(); if (busy) return; E.autoMenu.hidden = !E.autoMenu.hidden; }
  function toggleTurbo() { turbo = !turbo; E.turboBtn.setAttribute('aria-pressed', turbo); E.turboBtn.lastChild.textContent = turbo ? 'on' : 'off'; E.turboBtn.classList.toggle('on', turbo); Batty.sfx('click'); }
  function toggleAnte() {
    if (busy || auto > 0) return;
    anteOn = !anteOn; try { localStorage.setItem('bonanza-ante', anteOn ? '1' : '0'); } catch (e) { /* ignore */ }
    A.tone({ f: anteOn ? 660 : 440, f2: anteOn ? 1320 : 220, d: 0.16, type: 'triangle', v: 0.14 });
    paintAnte(); paintStake(); paintCtl();
  }
  function onKey(e) {
    if (document.querySelector('.bc-veil,.bc-win')) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) primary(); return; }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 't') toggleTurbo();
    else if (k === 'a') autoClick();
    else if (k === 'f') toggleAnte();
    else if (k === 'b') openBuy();
    else if (k === 'escape' && E && !E.ov.hidden && E.ov.classList.contains('buying')) closeOv();
  }

  function paintStake() {
    if (!E) return;
    const st = stakeCtl.value;
    E.ante.querySelector('small').textContent = anteOn ? 'On · ' + Batty.fmt(st * M.ANTE_NUM / M.ANTE_DEN) + ' BB a spin' : (wide ? 'Off · 2× the free spins chance for +25%' : 'Off · 2× bonus chance');
    E.buy.querySelector('small').textContent = Batty.fmt(st * M.BUY_X) + ' BB · 100×';
    let t = '';
    for (let s = 0; s < M.PAYERS; s++) t += '<div class="pr"><i>' + useSym(KEYS[s]) + '</i><span>' + M.PAY[s].map((u, k) => '<b>' + ['8+', '10+', '12+'][k] + '</b>' + short(u * st / U)).join('') + '</span></div>';
    t += '<div class="pr sc"><i>' + useSym('lolly') + '</i><span><b>4</b>' + short(60 * st / U) + '<b>5</b>' + short(100 * st / U) + '<b>6+</b>' + short(2000 * st / U) + '</span></div>';
    E.pay.innerHTML = t;
  }
  function short(n) { return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? (Math.round(n / 100) / 10) + 'k' : Batty.fmt(n); }
  function paintAnte() {
    if (!E) return;
    E.ante.classList.toggle('on', anteOn); E.ante.setAttribute('aria-pressed', anteOn);
    root.classList.toggle('ante', anteOn);
  }
  function paintCtl() {
    if (!E) return;
    const lock = busy || auto > 0;
    stakeCtl.disabled = lock;
    E.buy.disabled = lock || anteOn;
    E.ante.disabled = lock;
    E.spin.classList.toggle('busy', busy);
    E.spin.setAttribute('aria-label', busy ? 'Hurry' : 'Spin');
    E.spin.querySelector('.n').textContent = auto > 0 ? String(auto) : '';
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? 'stop' : 'off';
  }
  function setMsg(t, cls) { if (!E) return; E.msg.innerHTML = t; E.msg.className = 'msg' + (cls ? ' ' + cls : ''); }

  /* ---------- layout ---------- */
  function layout() {
    if (!root) return;
    const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return;
    const nowWide = W >= 980 && H >= 540;
    if (nowWide !== wide || !E.placed) {
      wide = nowWide; E.placed = true;
      root.classList.toggle('wide', wide);
      if (wide) { E.side.insertBefore(E.feats, E.side.children[1] || null); E.side.insertBefore(E.logo, E.side.firstChild); }
      else { E.ctl.insertBefore(E.feats, E.ctlRow); E.main.insertBefore(E.logo, E.hud); }
      paintStake();
    }
    let size;
    if (wide) {
      const aw = W - 2 * 270 - 90, ah = H - 64 - 104 - 44 - 50;
      size = Math.min(aw / REELS, ah / ROWS, 118);
    } else {
      const logoH = H > 700 ? 64 : H > 600 ? 50 : 0;
      root.classList.toggle('nologo', logoH === 0);
      const aw = W - 44, ah = H - logoH - 52 - 26 - 160 - 40;
      size = Math.min(aw / REELS, ah / ROWS, 100);
      cw = Math.max(40, Math.floor(size)); ch = Math.max(cw, Math.min(Math.floor(cw * 1.12), Math.floor(ah / ROWS)));
    }
    if (wide) { cw = Math.max(40, Math.floor(size)); ch = cw; }
    root.style.setProperty('--cw', cw + 'px'); root.style.setProperty('--ch', ch + 'px');
    for (const o of cells) if (o) place(o, o.r, o.w);
    fxDpr = Math.min(2, window.devicePixelRatio || 1);
    E.fx.width = W * fxDpr; E.fx.height = H * fxDpr;
  }

  /* ---------- cells ---------- */
  function makeCell(s, m) {
    const el = h('div', { class: 'c s-' + KEYS[s], html: useSym(KEYS[s]) + (s === SYM.BOMB ? '<b class="mv">' + m + '×</b>' : '') });
    return { el, s, m, r: 0, w: 0 };
  }
  const xy = (r, w) => 'translate(' + (r * cw) + 'px,' + (w * ch) + 'px)';
  function place(o, r, w) { o.r = r; o.w = w; o.el.style.transform = xy(r, w); }
  function anim(el, frames, ms, easing, delay) {
    if (!el.animate) return Promise.resolve();
    const a = el.animate(frames, { duration: Math.max(1, ms), easing: easing || 'ease', delay: delay || 0, fill: 'backwards' });
    return a.finished.catch(() => {});
  }
  const BOUNCE = 'cubic-bezier(.3,1.35,.55,1)';
  function centre(el) {
    const a = el.getBoundingClientRect(), b = root.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  }

  /* the old grid falls away, the new one drops in reel by reel (with a tease once 3 Lollipops are showing) */
  async function dropGrid(g, m, fs) {
    const old = cells.slice(); cells = [];
    const fall = T(260);
    old.forEach((o) => { anim(o.el, [{ transform: xy(o.r, o.w), opacity: 1 }, { transform: xy(o.r, o.w + 6), opacity: 0.2 }], fall, 'cubic-bezier(.5,0,1,.6)', T(o.r * 30)); });
    S.timeout(() => old.forEach((o) => o.el.remove()), fall + T(200));
    old.forEach((o) => { o.el.style.transform = xy(o.r, o.w + 7); });
    await nap(140);
    let lollies = 0, teased = false, delay = 0;
    const waits = [];
    for (let r = 0; r < REELS; r++) {
      if (lollies >= (fs ? 2 : 3) && r < REELS && !teased && !turbo) { teased = true; E.frame.classList.add('tease'); snd.tease(); delay += T(fs ? 500 : 900); }
      else if (teased) delay += T(fs ? 300 : 650);
      for (let w = 0; w < ROWS; w++) {
        const c = r * ROWS + w, o = makeCell(g[c], m[c]);
        cells[c] = o; place(o, r, w); E.grid.append(o.el);
        const d = delay + T(r * 70 + (ROWS - 1 - w) * 22);
        waits.push(anim(o.el, [{ transform: xy(r, w - 6) }, { transform: xy(r, w) }], T(380), BOUNCE, d));
        if (g[c] === SYM.LOLLY) { lollies++; const k = lollies; S.timeout(() => { snd.lolly(k); o.el.classList.add('land'); }, d + T(300)); }
        if (g[c] === SYM.BOMB) S.timeout(() => { A.tone({ f: 160, f2: 90, d: 0.15, type: 'square', v: 0.07 }); o.el.classList.add('land'); }, d + T(300));
      }
      const rr = r; S.timeout(() => snd.thud(rr), delay + T(r * 70 + 320));
    }
    await Promise.all(waits);
    E.frame.classList.remove('tease');
  }
  /* one tumble: winners glow, pop, the rest fall, new sweets drop in */
  async function tumble(step, k, unit, fs, sofar) {
    const rm = new Set(step.rm);
    const winCells = cells.filter((o, c) => rm.has(c));
    winCells.forEach((o) => o.el.classList.add('win'));
    snd.win(k);
    const desc = step.wins.map((x) => '<b>' + x.n + '</b> ' + M.SYMBOL_NAMES[x.s] + ' <em>' + Batty.fmt(x.pay * unit) + '</em>').join(' · ');
    setMsg(desc, 'pay');
    showTally('+' + Batty.fmt(step.pay * unit), k);
    countTo(E.win, sofar, sofar + step.pay * unit, T(500));
    await nap(fs ? 650 : 720);
    /* pop */
    winCells.forEach((o, i) => {
      o.el.classList.remove('win'); o.el.classList.add('pop');
      if (i % 2 === 0 || winCells.length < 12) { const p = centre(o.el); sparkle(p.x, p.y, SYM_COL[o.s], 7); }
    });
    for (let i = 0; i < Math.min(6, step.wins.length + 3); i++) snd.pop(i);
    await nap(260);
    winCells.forEach((o) => o.el.remove());
    /* fall and refill, reel by reel */
    const next = new Array(CELLS), waits = [];
    for (let r = 0; r < REELS; r++) {
      const keep = [];
      for (let w = 0; w < ROWS; w++) { const c = r * ROWS + w; if (!rm.has(c)) keep.push(cells[c]); }
      const add = step.add[r] || [], addM = step.addM[r] || [];
      const n = add.length;
      const col = add.map((s, i) => makeCell(s, addM[i])).concat(keep);
      col.forEach((o, w) => {
        const fromW = w < n ? w - n - 1 : o.w;
        next[r * ROWS + w] = o;
        if (w < n) E.grid.append(o.el);
        if (fromW !== w) {
          place(o, r, w);
          waits.push(anim(o.el, [{ transform: xy(r, fromW) }, { transform: xy(r, w) }], T(w < n ? 360 : 300), BOUNCE, T(r * 40 + (w < n ? 90 : 0))));
          if (w < n && o.s === SYM.LOLLY) S.timeout(() => { snd.lolly(3); o.el.classList.add('land'); }, T(r * 40 + 400));
          if (w < n && o.s === SYM.BOMB) S.timeout(() => o.el.classList.add('land'), T(r * 40 + 400));
        } else place(o, r, w);
      });
      if (n) { const rr = r; S.timeout(() => snd.land(rr), T(r * 40 + 330)); }
    }
    cells = next;
    await Promise.all(waits);
    await nap(90);
  }
  function showTally(txt, k) {
    const t = h('div', { class: 'tal' + (k > 2 ? ' hot' : '') }, txt);
    E.burst.append(t); S.timeout(() => t.remove(), 1400);
  }
  function countTo(el, from, to, ms) { return Batty.ui.countUp(el, from, to, Math.max(60, ms)); }
  function banner(html, cls, ms) {
    E.banner.innerHTML = html; E.banner.className = 'banner show ' + (cls || '');
    if (ms) S.timeout(() => { if (E) E.banner.className = 'banner'; }, ms);
  }
  const hideBanner = () => { if (E) E.banner.className = 'banner'; };

  /* the Bat-Bombs go off: each one explodes and its value flies to the counter, then the tumble win is multiplied */
  async function bombs(seq, unit, before) {
    const list = cells.filter((o) => o.s === SYM.BOMB);
    if (!list.length) return;
    let sum = 0;
    setMsg('Bat-Bombs away!', 'hot');
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      o.el.classList.add('boom');
      snd.boom(); shake(o.m >= 50 ? 2 : 1);
      const p = centre(o.el); sparkle(p.x, p.y, '#ff4a8a', o.m >= 100 ? 26 : 14, 1.6);
      await nap(260);
      const q = centre(E.mult);
      const fly = h('div', { class: 'flyv' + (o.m >= 100 ? ' big' : '') }, o.m + '×');
      fly.style.left = p.x + 'px'; fly.style.top = p.y + 'px';
      root.append(fly); snd.fly();
      await anim(fly, [{ transform: 'translate(-50%,-50%) scale(1.4)', offset: 0 }, { transform: 'translate(-50%,-50%) translate(' + (q.x - p.x) * 0.5 + 'px,' + ((q.y - p.y) * 0.5 - 60) + 'px) scale(1.8)', offset: 0.45 }, { transform: 'translate(-50%,-50%) translate(' + (q.x - p.x) + 'px,' + (q.y - p.y) + 'px) scale(.7)' }], T(560), 'ease-in-out');
      fly.remove();
      sum += o.m; E.mult.textContent = '×' + sum; bump(E.mult.parentNode); snd.chime(i);
      o.el.classList.add('spent');
    }
    await nap(200);
    const total = seq.tw * seq.mult * unit;
    banner('<small>' + Batty.fmt(seq.tw * unit) + ' × ' + seq.mult + '</small><b>' + Batty.fmt(total) + '</b>', 'mult');
    A.seq([N.C5, N.G5, N.C6, [N.E6, 3]], { step: 0.07, type: 'square', v: 0.11 });
    if (seq.mult >= 20) sparkle(root.clientWidth / 2, root.clientHeight * 0.45, '#ffd84a', 40, 2);
    await countTo(E.win, seq.tw * unit, total, T(900));
    await nap(700);
    hideBanner();
  }
  function fizzle() {
    const list = cells.filter((o) => o.s === SYM.BOMB);
    if (!list.length) return Promise.resolve();
    list.forEach((o) => o.el.classList.add('fizz')); snd.fizz();
    setMsg('No tumble win for the Bat-Bombs to multiply', '');
    return nap(500);
  }

  /* one whole spin (paid spin or a free spin) with every tumble. Returns the units it paid, as shown so far. */
  async function playSeq(seq, unit, fs, shownBefore) {
    E.win.textContent = fs ? '0' : Batty.fmt(shownBefore);
    if (fs) { E.mult.textContent = '×0'; }
    await dropGrid(seq.g, seq.m, fs);
    let sofar = fs ? 0 : shownBefore;
    for (let k = 0; k < seq.steps.length; k++) {
      await tumble(seq.steps[k], k, unit, fs, sofar);
      sofar += seq.steps[k].pay * unit;
    }
    if (fs && seq.bombs > 0) { if (seq.tw > 0) { await bombs(seq, unit); sofar = seq.tw * seq.mult * unit; } else await fizzle(); }
    if (seq.sp > 0) {
      const lol = cells.filter((o) => o.s === SYM.LOLLY);
      lol.forEach((o) => o.el.classList.add('win'));
      setMsg('<b>' + seq.sc + '</b> Cherry-Fang Lollipops pay <em>' + Batty.fmt(seq.sp * unit) + '</em>', 'pay');
      showTally('+' + Batty.fmt(seq.sp * unit), 3); snd.lolly(5);
      await countTo(E.win, sofar, sofar + seq.sp * unit, T(500));
      sofar += seq.sp * unit;
      await nap(600);
      lol.forEach((o) => o.el.classList.remove('win'));
    }
    return sofar;
  }

  /* ---------- a round ---------- */
  function primary() {
    if (!E) return;
    if (tapFn) return tapFn();
    if (!E.ov.hidden) return;
    if (busy) return doSkip();
    if (!E.autoMenu.hidden) E.autoMenu.hidden = true;
    spin(false);
  }
  async function spin(buy) {
    if (busy || !E) return;
    const stake = stakeCtl.value, unit = stake / U, ante = anteOn && !buy;
    const cost = buy ? stake * M.BUY_X : ante ? stake * M.ANTE_NUM / M.ANTE_DEN : stake;
    if (!Batty.wallet.bet(ID, cost)) { stopAuto(); return Batty.ui.broke(); }
    busy = true; hurry = false; E.autoMenu.hidden = true; if (auto > 0) auto--; paintCtl();
    hideBanner(); E.win.textContent = '0'; root.classList.remove('won');
    setMsg(buy ? 'Free spins bought · here come the Lollipops' : ante ? 'Fang Bet on · good luck' : 'Good luck', '');
    snd.spin();
    let o;
    if (Batty.online) {
      const r = await Batty.play(ID, 'spin', buy ? { stake, buy: true } : { stake, ante }, cost);
      if (!E) return;
      if (!r) { busy = false; auto = 0; paintCtl(); setMsg('Land 8 or more of a sweet anywhere to win'); return; }
      o = r.o;
    } else if (buy) o = M.buy(Batty.rng);
    else if (DEV && devNext) { o = devNext(ante); devNext = null; }
    else o = M.spin(Batty.rng, ante);
    const win = o.totalWin * unit;
    if (win > 0) Batty.wallet.win(ID, win, { silent: true });
    if (devLog) { devLog.rounds++; devLog.staked += cost; devLog.won += win; if (o.fs) devLog.bonuses++; devLog.last = o; }

    let shown = await playSeq(o.spin, unit, false, 0);
    if (o.fs) {
      shown = await playBonus(o, unit, shown);
    }
    if (o.capped) { banner('<small>Max win</small><b>' + Batty.fmt(win) + '</b>', 'mult'); await nap(1600); hideBanner(); }
    E.win.textContent = Batty.fmt(win);
    if (win > 0) {
      root.classList.add('won'); bump(E.win.parentNode);
      setMsg((o.fs ? 'Sweet! The round paid ' : 'You won ') + '<em>' + Batty.fmt(win) + ' BB</em>' + (win >= cost * 2 ? ' · ' + Batty.fmtX(win / stake) : ''), 'hot');
      if (win < stake * 10) Batty.sfx('coin');
    } else setMsg(['No sweets this time', 'The bats ate them all', 'Not a sausage. Or a sweet.', 'Sugar crash. Go again?'][(Math.random() * 4) | 0]);
    Batty.wallet.sync();
    if (win >= stake * 10) { candyRain(win >= stake * 75 ? 4200 : 2600); await Batty.ui.celebrate({ amount: win, bet: stake }); }
    if (!E) return;
    busy = false; paintCtl();
    if (auto > 0) {
      const lost = autoStart - Batty.wallet.balance;
      if (autoLimit && lost >= autoLimit) stopAuto('Autoplay stopped: loss limit reached.');
      else if (o.fs && autoStopFs) stopAuto('Autoplay stopped: free spins landed.');
      else if (!Batty.wallet.canBet(anteOn ? stake * M.ANTE_NUM / M.ANTE_DEN : stake)) stopAuto('Autoplay stopped: not enough Batty Bucks for the next spin.');
      else S.timeout(() => { if (auto > 0 && !busy) spin(false); }, T(win ? 520 : 200));
    }
  }

  /* ---------- free spins ---------- */
  async function playBonus(o, unit, before) {
    const fs = o.fs;
    /* trigger: the Lollipops jump */
    const lol = cells.filter((c) => c.s === SYM.LOLLY);
    lol.forEach((c) => c.el.classList.add('trig'));
    Batty.sfx('bonus');
    lol.forEach((c) => { const p = centre(c.el); sparkle(p.x, p.y, '#ff9ad5', 16, 1.4); });
    await nap(1200);
    lol.forEach((c) => c.el.classList.remove('trig'));
    await overlay('intro', '<div class="ovlol">' + useSym('lolly') + '</div><h2><b>' + M.FS_AWARD + '</b> Free Spins</h2><p>Bat-Bombs worth 2× to 1,000× drop in. When a spin stops tumbling they add up and multiply its win.</p><p class="sm">3+ Lollipops in a spin: +' + M.FS_RETRIGGER + ' spins</p>', 3400);
    mode = 'fs'; root.classList.add('fs');
    let total = 0, awarded = M.FS_AWARD;
    E.fsTotal.textContent = '0'; E.fsLeft.textContent = String(awarded);
    for (let i = 0; i < fs.spins.length; i++) {
      const seq = fs.spins[i];
      E.fsLeft.textContent = (awarded - i - 1) + ' / ' + awarded;
      setMsg('Free spin ' + (i + 1) + ' of ' + awarded, '');
      const got = await playSeq(seq, unit, true, 0);
      const runTo = seq.running * unit;
      if (runTo > total) { const tal = h('div', { class: 'flyv sum' }, '+' + Batty.fmt(Math.min(got, runTo - total))); const p = centre(E.win), q = centre(E.fsTotal); tal.style.left = p.x + 'px'; tal.style.top = p.y + 'px'; root.append(tal); await anim(tal, [{ transform: 'translate(-50%,-50%)' }, { transform: 'translate(-50%,-50%) translate(' + (q.x - p.x) + 'px,' + (q.y - p.y) + 'px) scale(.8)' }], T(420), 'ease-in'); tal.remove(); }
      await countTo(E.fsTotal, total, runTo, T(420)); if (runTo > total) bump(E.fsTotal.parentNode);
      total = runTo;
      if (seq.retrigger) {
        awarded += seq.retrigger;
        E.fsLeft.textContent = (awarded - i - 1) + ' / ' + awarded;
        snd.retrig(); banner('<small>Lollipop retrigger</small><b>+' + seq.retrigger + ' spins</b>', 'retrig');
        await nap(1500); hideBanner();
      }
      await nap(seq.win ? 350 : 160);
    }
    const winFs = fs.total * unit;
    snd.outro();
    await overlay('outro', '<h2>Sugar Rush Over</h2><p>' + fs.spins.length + ' free spins paid</p><output>' + Batty.fmt(winFs) + '</output><p class="sm">Batty Bucks</p>', 3600, winFs);
    mode = 'base'; root.classList.remove('fs');
    return before + winFs;
  }
  function overlay(kind, html, ms, countTo2) {
    E.ov.innerHTML = '<div class="card ' + kind + '">' + html + '<p class="tap">Tap to continue</p></div>';
    E.ov.hidden = false; E.ov.className = 'ov ' + kind;
    if (kind === 'intro') { snd.intro(); sparkle(root.clientWidth / 2, root.clientHeight / 2, '#ff9ad5', 50, 2.2); }
    const out = E.ov.querySelector('output');
    if (out && countTo2) Batty.ui.countUp(out, 0, countTo2, T(1400));
    return waitTap(ms).then(() => { if (E) { E.ov.hidden = true; E.ov.innerHTML = ''; } });
  }
  function closeOv() { if (!E) return; E.ov.hidden = true; E.ov.innerHTML = ''; E.ov.className = 'ov'; }

  /* ---------- bonus buy ---------- */
  function openBuy() {
    if (busy || auto > 0 || !E) return;
    if (anteOn) { Batty.ui.toast('Switch the Fang Bet off to buy free spins.'); return; }
    const st = stakeCtl.value, price = st * M.BUY_X;
    Batty.sfx('pop');
    E.ov.className = 'ov buying'; E.ov.hidden = false; E.ov.innerHTML = '';
    const ok = h('button', { class: 'go', type: 'button', id: 'bonanza-buy-go', disabled: !Batty.wallet.canBet(price), onclick: () => { closeOv(); spin(true); } }, 'Buy for ' + Batty.fmt(price) + ' BB');
    const no = h('button', { class: 'no', type: 'button', id: 'bonanza-buy-no', onclick: () => { Batty.sfx('click'); closeOv(); } }, 'Not now');
    E.ov.append(h('div', { class: 'card buycard' }, h('div', { class: 'ovlol', html: useSym('bomb') }), h('h2', null, 'Buy Free Spins'),
      h('p', null, 'A spin with 4, 5 or 6 guaranteed Cherry-Fang Lollipops, then ' + M.FS_AWARD + ' free spins full of Bat-Bombs.'),
      h('p', { class: 'price' }, Batty.fmt(price), h('small', null, ' BB · ' + M.BUY_X + '× your stake')),
      Batty.wallet.canBet(price) ? null : h('p', { class: 'sm' }, 'Not enough Batty Bucks at this stake.'),
      h('div', { class: 'row' }, no, ok)));
  }

  /* ---------- juice ---------- */
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function shake(n) { if (reduce()) return; root.classList.remove('shake', 'shake2'); void root.offsetWidth; root.classList.add(n > 1 ? 'shake2' : 'shake'); S.timeout(() => root && root.classList.remove('shake', 'shake2'), 500); }
  function idleWiggle() { const o = cells[(Math.random() * CELLS) | 0]; if (!o) return; o.el.classList.remove('idle'); void o.el.offsetWidth; o.el.classList.add('idle'); }
  /* sugar-sparkle particles on our own canvas */
  function sparkle(x, y, col, n, pw) {
    if (reduce()) return;
    pw = pw || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (60 + Math.random() * 220) * pw;
      parts.push({ k: Math.random() < 0.5 ? 'star' : 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80 * pw, life: 0, max: 0.55 + Math.random() * 0.5, r: 2 + Math.random() * 3.5, c: Math.random() < 0.35 ? '#fff' : col, rot: Math.random() * 6 });
    }
    kick();
  }
  function candyRain(ms) {
    if (reduce() || !root) return;
    const end = performance.now() + ms, cols = ['#ff4a8a', '#ffd84a', '#2bd6b0', '#ff6a1f', '#c065ff', '#ff9ad5'];
    const W = root.clientWidth;
    const gen = S.interval(() => {
      if (performance.now() > end || !root) return S.clear(gen);
      for (let i = 0; i < (W < 600 ? 2 : 4); i++) parts.push({ k: Math.random() < 0.6 ? 'wrap' : 'lolly', x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 200, life: 0, max: 6, r: 8 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, rain: true });
      kick();
    }, 60);
  }
  function kick() { if (partStop) return; partStop = S.loop(stepParts); }
  function stepParts(dt) {
    const W = root.clientWidth, H = root.clientHeight, c = fxCx;
    c.setTransform(fxDpr, 0, 0, fxDpr, 0, 0); c.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.life < p.max && p.y < H + 40);
    for (const p of parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.rain ? 160 : 420) * dt; p.rot += (p.vr || 3) * dt;
      c.globalAlpha = p.rain ? 1 : Math.max(0, 1 - p.life / p.max);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      if (p.k === 'star') { c.fillStyle = p.c; c.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? p.r * 0.4 : p.r * 1.4, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.fill(); }
      else if (p.k === 'dot') { c.fillStyle = p.c; c.fillRect(-p.r * 0.9, -p.r * 0.3, p.r * 1.8, p.r * 0.6); }
      else if (p.k === 'wrap') {
        c.fillStyle = p.c; c.strokeStyle = '#2a0620'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-p.r * 2.1, -p.r * 0.7); c.lineTo(-p.r * 0.9, 0); c.lineTo(-p.r * 2.1, p.r * 0.7); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(p.r * 2.1, -p.r * 0.7); c.lineTo(p.r * 0.9, 0); c.lineTo(p.r * 2.1, p.r * 0.7); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.8, 0, 0, 6.283); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-p.r * 0.3, -p.r * 0.3, p.r * 0.35, p.r * 0.2, -0.5, 0, 6.283); c.fill();
      } else {
        c.fillStyle = '#f4e4ee'; c.fillRect(-1.5, 0, 3, p.r * 2.4);
        c.fillStyle = p.c; c.strokeStyle = '#2a0620'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, p.r, 0, 6.283); c.fill(); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, p.r * 0.55, 0, 4.5); c.stroke();
      }
      c.restore();
    }
    c.globalAlpha = 1;
    if (!parts.length) { partStop(); partStop = null; c.clearRect(0, 0, W, H); }
  }

  Batty.registerGame({
    id: ID,
    name: 'Sugar Fang Bonanza',
    tagline: 'Pays anywhere, tumbles, Bat-Bombs up to 1,000×',
    tag: 'Slot',
    poster: poster(),
    rules: rules,
    mount: mount,
    unmount: unmount,
  });
})();
