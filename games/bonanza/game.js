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
   identical maths); this file only presents it. Gothic candy: a gingerbread-and-liquorice castle under a candy-floss moon,
   with Fangs the gummy bat cheering from the side lines.
   Cosmetic randomness (idle wobbles, the spinning bomb reels, particles) uses Math.random, never the game RNG. */
(function () {
  'use strict';
  const ID = 'bonanza', M = BattyMath.bonanza, h = Batty.h;
  const SYM = M.SYM, U = M.UNITS_PER_STAKE, REELS = M.REELS, ROWS = M.ROWS, CELLS = M.CELLS;
  const KEYS = M.SYMBOLS; // bat coffin skull moon ruby amber lime blue violet lolly bomb
  const SYM_COL = ['#ff6a1f', '#ff8ac6', '#f3ece4', '#ffd84a', '#ff3b5c', '#ffa21a', '#8be33a', '#4a8dff', '#c065ff', '#ff2f5a', '#ff4a8a'];
  const DISPLAY = "'Titan One','Lilita One','Arial Rounded MT Bold','Trebuchet MS',Verdana,sans-serif";
  const devWanted = () => { try { return localStorage.getItem('batty-dev') === '1' || /[?&]dev\b/.test(location.search); } catch (e) { return false; } };

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

  /* Each sweet is drawn in a 100x100 box. Moving parts carry a class (wl/wr wings, eye, swl swirl, wrp wrapper, spr
     sprinkles) so the idle and win animations can work them. */
  function symbolMarkup(p, k) {
    switch (k) {
      case 'bat': return '' +
        '<g class="wl"><path d="M50 30C42 18 24 14 6 22c8 4 11 11 10 19 6-4 12-3 16 2 3-6 10-6 14 1z" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 40L26 25M31 42L36 27" stroke="#7e1803" stroke-width="1.4" opacity=".45" stroke-linecap="round"/></g>' +
        '<g class="wr"><path d="M50 30C58 18 76 14 94 22c-8 4-11 11-10 19-6-4-12-3-16 2-3-6-10-6-14 1z" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.6" stroke-linejoin="round"/><path d="M84 40L74 25M69 42L64 27" stroke="#7e1803" stroke-width="1.4" opacity=".45" stroke-linecap="round"/></g>' +
        '<path d="M36 26 L33 12 L44 22 Z M64 26 L67 12 L56 22 Z" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<ellipse cx="50" cy="55" rx="21" ry="30" fill="url(#' + p + 'gum)" stroke="#7e1803" stroke-width="2.8"/>' +
        '<path d="M34 40c4-10 22-12 30-2" fill="none" stroke="#ffe0b8" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
        '<g class="eye"><ellipse cx="42" cy="46" rx="5.6" ry="6.4" fill="#fff"/><ellipse cx="58" cy="46" rx="5.6" ry="6.4" fill="#fff"/>' +
        '<circle cx="43.2" cy="47.4" r="3" fill="#2a0600"/><circle cx="59.2" cy="47.4" r="3" fill="#2a0600"/><circle cx="42" cy="45.6" r="1.1" fill="#fff"/><circle cx="58" cy="45.6" r="1.1" fill="#fff"/></g>' +
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
        '<g class="spr" fill="#ffd6ec" opacity=".85"><circle cx="40" cy="74" r="2"/><circle cx="50" cy="78" r="2"/><circle cx="60" cy="74" r="2"/><circle cx="45" cy="84" r="2"/><circle cx="55" cy="84" r="2"/></g>' +
        GL(p, 'M40 9H52L33 30H27Z');
      case 'skull': return '' +
        '<path d="M50 8C28 8 16 24 16 42c0 12 6 20 14 24v14c0 6 4 10 10 10h20c6 0 10-4 10-10V66c8-4 14-12 14-24C84 24 72 8 50 8Z" fill="url(#' + p + 'bone)" stroke="#5a3048" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<g fill="#ff6fb4" stroke="#a0205e" stroke-width="1"><circle cx="35" cy="34" r="4"/><circle cx="27" cy="42" r="4"/><circle cx="31" cy="53" r="4"/><circle cx="43" cy="53" r="4"/><circle cx="45" cy="40" r="3.4"/>' +
        '<circle cx="65" cy="34" r="4"/><circle cx="73" cy="42" r="4"/><circle cx="69" cy="53" r="4"/><circle cx="57" cy="53" r="4"/><circle cx="55" cy="40" r="3.4"/></g>' +
        '<g class="eye"><circle cx="36" cy="44" r="8.5" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6"/><circle cx="64" cy="44" r="8.5" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6"/>' +
        '<circle cx="36" cy="44" r="4.4" fill="#120818"/><circle cx="64" cy="44" r="4.4" fill="#120818"/><circle cx="34.6" cy="42.6" r="1.4" fill="#fff"/><circle cx="62.6" cy="42.6" r="1.4" fill="#fff"/></g>' +
        '<path d="M50 56c-4 0-6 5-4 8l4 3 4-3c2-3 0-8-4-8z" fill="#3a1030"/>' +
        '<path class="spr" d="M50 14l3 6 6 1-4.4 4 1 6-5.6-3-5.6 3 1-6-4.4-4 6-1z" fill="#ffd84a" stroke="#a06000" stroke-width="1"/>' +
        '<g class="jaw"><path d="M34 74H66M40 70v12M46 70v14M52 70v14M58 70v12" stroke="#7a4a62" stroke-width="2" stroke-linecap="round"/></g>' +
        GL(p, 'M26 26c6-10 16-13 24-13-10 3-17 8-21 16z');
      case 'moon': return '' +
        '<g class="wrp"><path d="M24 50L4 34l4 16-4 16Z M76 50L96 34l-4 16 4 16Z" fill="url(#' + p + 'wrap)" stroke="#7a1650" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M8 40l12 6M8 60l12-6M92 40l-12 6M92 60l-12-6" stroke="#fff" stroke-width="1.6" opacity=".6"/></g>' +
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
        '<path class="swl" d="M50 38m-2 0a2 2 0 0 1 4 0a6 6 0 0 1-12 0a10 10 0 0 1 20 0a14 14 0 0 1-28 0a18 18 0 0 1 36 0a22 22 0 0 1-44 0a26 26 0 0 1 52 0" fill="none" stroke="#fff3f6" stroke-width="3.6" stroke-linecap="round" opacity=".92"/>' +
        '<path d="M38 69l4 9 4-8Z M54 70l4 8 4-9Z" fill="#fff" stroke="#5a0012" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<path d="M38 64c-8 2-12 8-8 12 6 0 10-6 12-10M62 64c8 2 12 8 8 12-6 0-10-6-12-10" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<circle cx="50" cy="65" r="4" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="1.6"/>' +
        GL(p, 'M26 26c6-10 16-14 26-14-10 4-18 10-22 20z');
      case 'bomb': return '' +
        '<g class="wl"><path d="M50 52C38 34 18 30 2 40c8 3 10 10 9 17 6-4 12-3 15 2 4-5 10-5 13 1z" fill="#2a0a20" stroke="#ff4a8a" stroke-width="2" stroke-linejoin="round"/></g>' +
        '<g class="wr"><path d="M50 52C62 34 82 30 98 40c-8 3-10 10-9 17-6-4-12-3-15 2-4-5-10-5-13 1z" fill="#2a0a20" stroke="#ff4a8a" stroke-width="2" stroke-linejoin="round"/></g>' +
        '<circle cx="50" cy="58" r="30" fill="url(#' + p + 'bomb)" stroke="#ff4a8a" stroke-width="2.6"/>' +
        '<rect x="43" y="22" width="14" height="9" rx="2" fill="#5a3a50" stroke="#ff4a8a" stroke-width="1.6"/>' +
        '<path d="M50 22c0-8 6-12 12-12" fill="none" stroke="#e8c8a0" stroke-width="2.6" stroke-linecap="round"/>' +
        '<circle class="fuse" cx="63" cy="10" r="7" fill="url(#' + p + 'spark)"/>' +
        '<path d="M34 44c4-6 10-9 16-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>';
    }
    return '';
  }
  /* the outline of each sweet: the shine sweep is clipped to it */
  const CLIP = {
    bat: '<ellipse cx="50" cy="55" rx="21" ry="30"/><path d="M50 30C42 18 24 14 6 22c8 4 11 11 10 19 6-4 12-3 16 2 3-6 10-6 14 1zM50 30C58 18 76 14 94 22c-8 4-11 11-10 19-6-4-12-3-16 2-3-6-10-6-14 1z"/>',
    coffin: '<path d="M38 6H62L80 28L66 94H34L20 28Z"/>',
    skull: '<path d="M50 8C28 8 16 24 16 42c0 12 6 20 14 24v14c0 6 4 10 10 10h20c6 0 10-4 10-10V66c8-4 14-12 14-24C84 24 72 8 50 8Z"/>',
    moon: '<circle cx="50" cy="50" r="29"/>',
    ruby: '<path d="M50 6C66 30 80 46 80 64a30 30 0 0 1-60 0C20 46 34 30 50 6Z"/>',
    amber: '<path d="M50 88C30 74 10 58 10 38c0-14 10-24 22-24 8 0 14 4 18 10 4-6 10-10 18-10 12 0 22 10 22 24 0 20-20 36-40 50Z"/>',
    lime: '<path d="M8 46A42 42 0 0 0 92 46Z"/>',
    blue: '<path d="M32 10H68L90 32V68L68 90H32L10 68V32Z"/>',
    violet: '<path d="M50 6L62 36L94 38L69 58L78 90L50 72L22 90L31 58L6 38L38 36Z"/>',
    lolly: '<circle cx="50" cy="38" r="33"/>',
    bomb: '<circle cx="50" cy="58" r="30"/>',
  };
  /* where each sweet's twinkle star sits */
  const TWINK = { bat: [38, 33], coffin: [44, 12], skull: [28, 26], moon: [36, 33], ruby: [40, 30], amber: [24, 26], lime: [26, 52], blue: [32, 18], violet: [50, 15], lolly: [30, 20], bomb: [36, 40] };
  const P = 'bonanza-';
  function defsSvg() {
    let s = '<svg class="g-bonanza-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + defs(P);
    s += lg(P + 'shine', [[0, '#ffffff', 0], [0.5, '#ffffff', 0.85], [1, '#ffffff', 0]], 0, 0, 1, 0);
    s += rg(P + 'mgum', [[0, '#ffe2b8'], [0.3, '#ff9a3a'], [0.72, '#f0480e'], [1, '#9c1c04']], 0.4, 0.3, 0.8);
    for (const k of KEYS) s += '<clipPath id="' + P + 'cl-' + k + '">' + CLIP[k] + '</clipPath>';
    for (const k of KEYS) s += '<g id="' + P + 's-' + k + '">' + symbolMarkup(P, k) + '</g>';
    return s + '</defs></svg>';
  }
  const useSym = (key, cls) => '<svg class="' + (cls || 'sym') + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#' + P + 's-' + key + '"/></svg>';
  /* a live sweet for the grid: its own inline SVG (so its parts can move), plus a twinkle star and a shine sweep */
  const SYMSVG = {};
  function symSvg(k) {
    if (SYMSVG[k]) return SYMSVG[k];
    const t = TWINK[k];
    return (SYMSVG[k] = '<svg class="sym" viewBox="0 0 100 100" aria-hidden="true">' + symbolMarkup(P, k) +
      '<g clip-path="url(#' + P + 'cl-' + k + ')"><g transform="rotate(24 50 50)"><rect class="sh" x="-76" y="-40" width="28" height="180" fill="url(#' + P + 'shine)"/></g></g>' +
      '<g transform="translate(' + t[0] + ' ' + t[1] + ')"><path class="tw" d="M0-10L2.2-2.2 10 0 2.2 2.2 0 10-2.2 2.2-10 0-2.2-2.2Z" fill="#fff"/></g></svg>');
  }

  /* Fangs, the gummy-bat mascot */
  function mascotSvg() {
    const g = 'url(#' + P + 'mgum)';
    return '<svg viewBox="0 0 140 150" aria-hidden="true">' +
      '<ellipse class="msh" cx="70" cy="145" rx="34" ry="5" fill="#000" opacity=".35"/>' +
      '<g class="mbody">' +
      '<g class="mwl"><path d="M66 70C54 46 28 38 3 50c12 6 16 17 14 29 9-6 18-5 24 3 4-9 15-9 21 2z" fill="' + g + '" stroke="#7e1803" stroke-width="3" stroke-linejoin="round"/><path d="M17 78L31 56M40 81L46 58" stroke="#7e1803" stroke-width="2" opacity=".45" stroke-linecap="round"/></g>' +
      '<g class="mwr"><path d="M74 70C86 46 112 38 137 50c-12 6-16 17-14 29-9-6-18-5-24 3-4-9-15-9-21 2z" fill="' + g + '" stroke="#7e1803" stroke-width="3" stroke-linejoin="round"/><path d="M123 78L109 56M100 81L94 58" stroke="#7e1803" stroke-width="2" opacity=".45" stroke-linecap="round"/></g>' +
      '<ellipse cx="57" cy="139" rx="10" ry="5.5" fill="#c0300a" stroke="#7e1803" stroke-width="2.4"/><ellipse cx="83" cy="139" rx="10" ry="5.5" fill="#c0300a" stroke="#7e1803" stroke-width="2.4"/>' +
      '<path d="M50 56 L43 26 L63 46 Z M90 56 L97 26 L77 46 Z" fill="' + g + '" stroke="#7e1803" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M49 50 L46 36 L56 46 Z M91 50 L94 36 L84 46 Z" fill="#ff5a7a" opacity=".55"/>' +
      '<ellipse cx="70" cy="94" rx="33" ry="45" fill="' + g + '" stroke="#7e1803" stroke-width="3.2"/>' +
      '<ellipse cx="70" cy="112" rx="18" ry="20" fill="#ffd9a0" opacity=".4"/>' +
      '<path d="M46 70c6-16 34-19 47-4" fill="none" stroke="#ffe0b8" stroke-width="4" stroke-linecap="round" opacity=".7"/>' +
      '<g class="meye"><ellipse cx="58" cy="80" rx="9" ry="10.5" fill="#fff" stroke="#7e1803" stroke-width="1.2"/><ellipse cx="82" cy="80" rx="9" ry="10.5" fill="#fff" stroke="#7e1803" stroke-width="1.2"/>' +
      '<g class="mpup"><circle cx="60" cy="82" r="5.2" fill="#2a0600"/><circle cx="84" cy="82" r="5.2" fill="#2a0600"/><circle cx="58.2" cy="79.4" r="1.9" fill="#fff"/><circle cx="82.2" cy="79.4" r="1.9" fill="#fff"/></g></g>' +
      '<path class="mbrow" d="M48 66l14 5M92 66l-14 5" stroke="#5a1000" stroke-width="3.4" stroke-linecap="round"/>' +
      '<g class="msmile"><path d="M57 100 Q70 111 83 100" fill="none" stroke="#5a1000" stroke-width="3.2" stroke-linecap="round"/><path d="M61 102l2.8 7.4 2.8-6.4Z M74 103l2.8 6.4 2.8-7.4Z" fill="#fff" stroke="#5a1000" stroke-width="1" stroke-linejoin="round"/></g>' +
      '<g class="mopen"><path d="M56 98 Q70 97 84 98 Q81 120 70 120 Q59 120 56 98Z" fill="#5a1000"/><path d="M62 115 Q70 109 78 115 Q75 120 70 120 Q65 120 62 115Z" fill="#ff5a7a"/><path d="M60 98.5l3 7 3-7Z M74 98.5l3 7 3-7Z" fill="#fff"/></g>' +
      '<ellipse cx="51" cy="98" rx="6" ry="3.4" fill="#ff3d2a" opacity=".45"/><ellipse cx="89" cy="98" rx="6" ry="3.4" fill="#ff3d2a" opacity=".45"/>' +
      '<path d="M70 128 L57 121 L57 135 Z M70 128 L83 121 L83 135 Z" fill="#2bd6b0" stroke="#0c5a4a" stroke-width="2" stroke-linejoin="round"/><circle cx="70" cy="128" r="4" fill="#ffd84a" stroke="#a06000" stroke-width="1.4"/>' +
      sugar([[50, 84], [92, 90], [62, 126], [80, 70, 60], [44, 110, 10], [96, 112]]) +
      '</g></svg>';
  }

  /* the castle and sky (shared by the scene and the poster) */
  function castle(p, lit) {
    const win = lit ? '#ffcf5a' : '#ff8ac6';
    let s = '<g class="castle">';
    s += '<path d="M120 300V170h24v-26l-12-26h48l-12 26v26h20v-40l-14-30h60l-14 30v40h22v-60l-18-36h76l-18 36v60h22v-40l-14-30h60l-14 30v40h20v-26l-12-26h48l-12 26v26h24v130Z" fill="#2a1030" stroke="#12060f" stroke-width="3"/>';
    s += '<path d="M132 118l24-58 24 58Z M220 104l20-60 20 60Z M302 88l28-72 28 72Z M392 104l20-60 20 60Z M478 118l24-58 24 58Z" fill="url(#' + p + 'spire)" stroke="#12060f" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M120 172q12 12 24 0t24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0" fill="none" stroke="#ff9ad5" stroke-width="7" stroke-linecap="round"/>';
    s += '<path d="M150 178v10M200 176v16M258 178v8M312 176v18M368 178v10M420 176v14M478 178v9M520 176v12" stroke="#ff9ad5" stroke-width="6" stroke-linecap="round"/>';
    let i = 0;
    for (const [x, y] of [[150, 140], [240, 128], [330, 112], [420, 128], [502, 140], [200, 210], [300, 200], [360, 200], [460, 210]]) s += '<path d="M' + (x - 7) + ' ' + (y + 16) + 'v-10a7 7 0 0 1 14 0v10Z" fill="' + win + '" class="win w' + (i++ % 3) + '"/>';
    s += '<path d="M310 300v-46a20 20 0 0 1 40 0v46Z" fill="#12060f"/><path d="M314 300v-44a16 16 0 0 1 32 0v44" fill="none" stroke="#ffcf5a" stroke-width="2" opacity=".5"/>';
    s += '<g fill="#ff4a1c" class="flags"><circle cx="156" cy="60" r="5"/><circle cx="240" cy="44" r="5"/><circle cx="330" cy="16" r="6"/><circle cx="412" cy="44" r="5"/><circle cx="502" cy="60" r="5"/></g>';
    return s + '</g>';
  }
  function sceneDefs(p) {
    return lg(p + 'sky', [[0, '#12051c'], [0.45, '#3a0c40'], [0.75, '#8a1f5a'], [1, '#ff6a6a']]) +
      rg(p + 'mglow', [[0, '#ffd6f0', 0.85], [0.35, '#ff8ad0', 0.35], [1, '#ff4aa8', 0]]) +
      rg(p + 'mface', [[0, '#fffafd'], [0.6, '#ffd0ec'], [1, '#f39ad0']], 0.42, 0.38, 0.65) +
      lg(p + 'spire', [[0, '#ffe7f4'], [0.5, '#ff6fbf'], [1, '#8a1450']], 0, 0, 1, 0) +
      lg(p + 'hill', [[0, '#5a1a52'], [1, '#1a0618']]) + lg(p + 'hill2', [[0, '#3a0e3a'], [1, '#0e030d']]);
  }
  /* The scene is a stack of layers that share one viewBox (so they line up), each static on its own: the sky, three star
     layers and the moon glow twinkle and pulse by opacity alone, so the compositor does the work and nothing repaints. */
  const WINS = [[150, 140], [240, 128], [330, 112], [420, 128], [502, 140], [200, 210], [300, 200], [360, 200], [460, 210]];
  function sceneLayers() {
    const p = P + 'sc-';
    const svg = (cls, inner, d) => '<svg class="ly ' + cls + '" viewBox="0 0 660 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + (d ? '<defs>' + d + '</defs>' : '') + inner + '</svg>';
    const out = {};
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const st = ['', '', ''];
    for (let i = 0; i < 90; i++) { const x = rnd() * 660, y = rnd() * 250, r = rnd() < 0.12 ? 1.7 : 0.85; st[i % 3] += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + (rnd() < 0.3 ? '#ffd0ec' : '#fff') + '" opacity="' + (0.4 + rnd() * 0.6).toFixed(2) + '"/>'; }
    out.stars = st.map((s, i) => svg('stars s' + i, s)).join('');
    out.glow = svg('mglow', '<circle cx="330" cy="120" r="160" fill="url(#' + p + 'mglow)"/>', rg(p + 'mglow', [[0, '#ffd6f0', 0.85], [0.35, '#ff8ad0', 0.35], [1, '#ff4aa8', 0]]));
    let m = '<circle cx="330" cy="120" r="78" fill="url(#' + p + 'mface)"/>';
    for (const [x, y, r] of [[290, 96, 16], [312, 84, 12], [352, 92, 18], [376, 118, 14], [300, 140, 13], [340, 150, 17], [366, 152, 10], [318, 116, 9]]) m += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" opacity=".45"/>';
    m += '<path d="M252 150c20 16 54 22 92 16 30-4 52-14 64-28" fill="none" stroke="#ff9ad5" stroke-width="10" stroke-linecap="round" opacity=".35"/>';
    out.moon = svg('moon', m, rg(p + 'mface', [[0, '#fffafd'], [0.6, '#ffd0ec'], [1, '#f39ad0']], 0.42, 0.38, 0.65));
    let s = '<path d="M-10 250c50-40 110-40 150-10 40-30 100-34 140-6 50-26 120-30 170 0 50-26 110-22 150 6 30-14 50-10 70 0V400H-10Z" fill="#3a0e3e" opacity=".8"/>';
    s += castle(p, false);
    s += '<path d="M0 330c60-40 120-30 170-6 50-34 120-36 170-4 60-30 130-30 180 0 50-24 100-20 140 4V400H0Z" fill="url(#' + p + 'hill)"/>';
    s += '<path d="M0 334c60-40 120-30 170-6 50-34 120-36 170-4 60-30 130-30 180 0 50-24 100-20 140 4" fill="none" stroke="#ff9ad5" stroke-width="5" stroke-linecap="round" opacity=".55"/>';
    for (const [x, y, c, k] of [[96, 312, '#2bd6b0', 0.9], [210, 300, '#ffd84a', 0.7], [446, 302, '#c065ff', 0.75], [560, 312, '#ff4a8a', 0.95]]) {
      s += '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')"><rect x="-2.5" y="0" width="5" height="44" rx="2" fill="#f4e4ee"/><circle cy="-4" r="17" fill="' + c + '" stroke="#12060f" stroke-width="2.4"/><path d="M-11-6a11 11 0 0 1 20 2a7 7 0 0 1-12 3a3 3 0 0 1 5-2" stroke="#fff" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/></g>';
    }
    for (const [x, y, f] of [[34, 340, 1], [622, 338, -1]]) s += '<g transform="translate(' + x + ' ' + y + ') scale(' + f + ' 1)"><path d="M0 40V8a10 10 0 0 1 20 0" fill="none" stroke="url(#' + p + 'cane)" stroke-width="7" stroke-linecap="round"/><path d="M0 40V8a10 10 0 0 1 20 0" fill="none" stroke="#ff3b5c" stroke-width="7" stroke-dasharray="4 6" stroke-linecap="butt"/></g>';
    s += '<path d="M0 360c40-20 90-20 130 0 40-18 100-22 150 0 50-20 110-20 160 0 40-16 80-16 120 0 40-14 70-10 100 2V400H0Z" fill="url(#' + p + 'hill2)"/>';
    for (const [x, c] of [[60, '#ff4a8a'], [150, '#2bd6b0'], [262, '#ffd84a'], [400, '#c065ff'], [508, '#ff6a1f'], [612, '#4a8dff']]) s += '<g transform="translate(' + x + ' 372)"><path d="M-9 8C-9-6 9-6 9 8Z" fill="' + c + '" stroke="#12060f" stroke-width="1.8"/><path d="M-5 0c1-3 4-4 6-4" stroke="#fff" stroke-width="1.8" fill="none" opacity=".6" stroke-linecap="round"/></g>';
    out.land = svg('landl', s, sceneDefs(p) + lg(p + 'cane', [[0, '#fff'], [1, '#ffd0e4']], 0, 0, 1, 0));
    /* lit windows: a separate layer that glows in free spins and flashes when the world cheers */
    out.wins = svg('wins', WINS.map(([x, y]) => '<path d="M' + (x - 7) + ' ' + (y + 16) + 'v-10a7 7 0 0 1 14 0v10Z" fill="#ffe27a"/><circle cx="' + x + '" cy="' + (y + 10) + '" r="16" fill="#ffcf5a" opacity=".22"/>').join(''));
    return out;
  }
  /* a candy-floss cloud, optionally a sleepy one with a face */
  function cloudSvg(face, c1, c2) {
    return '<svg viewBox="0 0 200 90" aria-hidden="true"><path d="M20 78c-18 0-22-26-2-30 0-22 30-30 42-12 8-24 48-28 58-4 14-16 46-10 46 14 22-2 28 32 4 32Z" fill="' + c1 + '"/>' +
      '<path d="M30 76c-10 0-12-12-2-16M70 38c6-12 26-14 34-2" fill="none" stroke="' + c2 + '" stroke-width="5" stroke-linecap="round" opacity=".8"/>' +
      (face ? '<path d="M78 58q6 5 12 0M108 58q6 5 12 0" fill="none" stroke="#6a1a5a" stroke-width="3" stroke-linecap="round"/><ellipse cx="74" cy="66" rx="6" ry="3" fill="#ff6fb4" opacity=".6"/><ellipse cx="124" cy="66" rx="6" ry="3" fill="#ff6fb4" opacity=".6"/><path d="M95 68q4 4 8 0" fill="none" stroke="#6a1a5a" stroke-width="2.4" stroke-linecap="round"/>' : '') +
      '</svg>';
  }
  const flyBatSvg = () => '<svg viewBox="-60 -40 120 80" aria-hidden="true"><path d="' + Batty.batPath + '" fill="#12060f"/></svg>';

  /* drippy logo lettering */
  function logoSvg(p, compact) {
    const drip = '#ff9ad5';
    return '<svg class="logo" viewBox="0 0 360 ' + (compact ? 70 : 118) + '" aria-label="Sugar Fang Bonanza">' +
      '<defs>' + lg(p + 'lt', [[0, '#fff2fa'], [0.45, '#ff9ad5'], [1, '#d6338a']]) + lg(p + 'lb', [[0, '#ffe4a0'], [0.4, '#ff8a2a'], [1, '#c0200a']]) + '</defs>' +
      '<text x="180" y="' + (compact ? 34 : 50) + '" text-anchor="middle" font-family="' + DISPLAY.replace(/"/g, '') + '" font-size="' + (compact ? 34 : 50) + '" fill="url(#' + p + 'lt)" stroke="#2a0620" stroke-width="7" paint-order="stroke" letter-spacing="1">SUGAR FANG</text>' +
      (compact ? '' : '<path class="drip" d="M86 52v8a3 3 0 0 0 6 0v-8M140 54v14a3.4 3.4 0 0 0 7 0V54M214 54v10a3 3 0 0 0 6 0V54M262 52v16a3.6 3.6 0 0 0 7 0V52" fill="' + drip + '" stroke="#2a0620" stroke-width="2"/>') +
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
    t += '<h3>Tumbles</h3><p>Every winning sweet pops, everything above drops down and new sweets fall in from the top. The grid pays again, as many times as it keeps winning. One spin can pay many times over; the tumble meter under the grid keeps the running total.</p>';
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
    t += '<p class="rtp">Designed return ' + SIM.base + '%. Live-balanced site-wide to a 98% target.</p>';
    t += '<p class="rtp">Tested return: ' + SIM.base + '% standard, ' + SIM.ante + '% with the Fang Bet over ' + SIM.rounds + ' simulated spins each, and ' + SIM.buy + '% on the Bonus Buy over ' + SIM.buys + ' simulated buys.</p>';
    t += '<h3>Small print</h3><p>The most one round (a spin and all its free spins) can pay is <b>' + f(M.MAX_WIN_X) + '× your stake</b>; the round ends at once if it gets there. ' +
      'Keys: Space spins (and slams the sweets down), T turbo, A autoplay, F Fang Bet, B bonus buy. Tap the grid to hurry any animation. Autoplay stops at your loss limit, when a free-spins round starts (if you ask it to), or when you run short.</p>';
    t += '<p>Batty Bucks have no cash value.</p>';
    return t;
  }

  /* =====================================================================================
     THE GAME
     ===================================================================================== */
  let S = null, root = null, E = null, stakeCtl = null, DEV = false, rmq = null;
  let busy = false, turbo = false, hurry = false, anteOn = false, mode = 'base', lay = '';
  let auto = 0, autoLimit = 0, autoStart = 0, autoStopFs = false;
  let cw = 64, ch = 64, cells = [], skipFns = [], tapFn = null;
  const live = new Set(), pend = new Set();
  let parts = [], partStop = null, fxCx = null, fxDpr = 1, fxW = 0, fxH = 0;
  let devNext = null, devSpeed = 1, devLog = null;
  const reduce = () => !!(rmq && rmq.matches);
  const T = (ms) => ms * (turbo ? 0.55 : 1) * (hurry ? 0.3 : 1) * (reduce() ? 0.6 : 1) * devSpeed;
  const fmt = (n) => Batty.fmt(n);

  /* ---- timing: everything a tap or Space can cut short ---- */
  function onSkip(fn) { skipFns.push(fn); return () => { const i = skipFns.indexOf(fn); if (i >= 0) skipFns.splice(i, 1); }; }
  function nap(ms) {
    return new Promise((res) => {
      let done = false, off = null;
      const fin = () => { if (done) return; done = true; if (off) off(); res(); };
      off = onSkip(fin); if (S) S.timeout(fin, T(ms));   // after leaving the game the wait simply never ends, like any cleared timer
    });
  }
  /* cosmetic callbacks (sounds, particles) that a slam-stop simply cancels */
  function later(fn, ms) { if (!S) return 0; const id = S.timeout(() => { pend.delete(id); fn(); }, ms); pend.add(id); return id; }
  /* hurry: finish every running tween at once (slam-stop), resolve every wait, and speed up the rest of this spin */
  function doSkip() {
    if (!S) return;
    const wasHurry = hurry; hurry = true;
    pend.forEach((id) => S.clear(id)); pend.clear();
    live.forEach((a) => { try { a.finish(); } catch (e) { /* infinite or detached */ } }); live.clear();
    const f = skipFns.slice(); skipFns.length = 0; f.forEach((x) => x());
    if (!wasHurry && E) { antOff(); snd.thud(2); }
  }
  function waitTap(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; tapFn = null; res(); };
      tapFn = fin; S.timeout(fin, ms * (turbo ? 0.6 : 1) * devSpeed);
    });
  }
  function anim(el, frames, ms, easing, delay, fill) {
    if (!el || !el.animate) return Promise.resolve();
    const a = el.animate(frames, { duration: Math.max(1, ms), easing: easing || 'ease', delay: delay || 0, fill: fill || 'backwards' });
    live.add(a);
    return a.finished.then(() => { live.delete(a); }, () => { live.delete(a); });
  }

  /* ---------- Sugar Fang's own sound kit (all synthesised) ---------- */
  const A = Batty.audio, N = Batty.notes;
  let lastTick = 0;
  const snd = {
    thud(r) { A.tone({ f: 190 - r * 10, f2: 62, d: 0.13, type: 'sine', v: 0.24 }); A.noise({ d: 0.05, v: 0.05, lp: 1300 }); A.tone({ f: 520 + r * 30, f2: 300, d: 0.05, type: 'triangle', v: 0.035, t: 0.01 }); },
    land() { A.tone({ f: 1250 + Math.random() * 300, f2: 1700, d: 0.04, type: 'triangle', v: 0.05 }); A.tone({ f: 420, f2: 210, d: 0.06, type: 'sine', v: 0.06 }); },
    lolly(n) { const f = [784, 880, 988, 1175, 1319, 1568, 1760][Math.min(6, n)]; A.tone({ f, d: 0.5, type: 'sine', v: 0.2 }); A.tone({ f: f * 2, d: 0.32, type: 'sine', v: 0.06, t: 0.02 }); A.tone({ f: f * 1.5, d: 0.4, type: 'triangle', v: 0.07, t: 0.07 }); },
    tease(lvl) { const b = 220 * Math.pow(2, lvl / 5); A.tone({ f: b, f2: b * 2, d: 1.1, type: 'triangle', v: 0.07 }); A.tone({ f: b * 1.5, f2: b * 3, d: 1.1, type: 'sine', v: 0.04 }); A.noise({ d: 1.1, v: 0.05, hp: 2400, f2: 9000 }); snd.heart(); },
    heart() { A.tone({ f: 72, f2: 44, d: 0.14, type: 'sine', v: 0.32 }); A.tone({ f: 66, f2: 40, d: 0.16, type: 'sine', v: 0.26, t: 0.2 }); },
    hit() { A.seq([N.C6, N.E6, N.G6], { step: 0.05, type: 'square', v: 0.07 }); A.tone({ f: 2093, d: 0.5, type: 'sine', v: 0.08, t: 0.15 }); },
    win(k) { const b = 523.3 * Math.pow(2, Math.min(k, 10) / 12); A.seq([b, b * 1.26, b * 1.5, b * 2], { step: 0.06, type: 'triangle', v: 0.16 }); A.tone({ f: b * 4, d: 0.25, type: 'sine', v: 0.04, t: 0.2 }); },
    pop(i) { A.tone({ f: 380 + i * 50 + Math.random() * 60, f2: 1500 + i * 80, d: 0.07, type: 'sine', v: 0.15, t: i * 0.022 }); },
    crunch() { A.noise({ d: 0.16, v: 0.12, hp: 2600, f2: 7000 }); },
    tick() { const t = performance.now(); if (t - lastTick < 55) return; lastTick = t; A.tone({ f: 1500 + Math.random() * 200, d: 0.022, type: 'square', v: 0.03 }); },
    fizz() { A.noise({ d: 0.45, v: 0.08, hp: 3000, f2: 800 }); },
    bombLand(m) { A.tone({ f: 96, f2: 38, d: 0.32, type: 'sine', v: 0.36 }); A.noise({ d: 0.14, v: 0.12, lp: 700 }); A.tone({ f: 980, f2: 640, d: 0.08, type: 'square', v: 0.035, t: 0.02 });
      for (let i = 0; i < 9; i++) A.tone({ f: 1700 + i * 60, d: 0.02, type: 'square', v: 0.028, t: 0.08 + i * 0.05 * (1 + i * 0.12) });
      A.tone({ f: m >= 50 ? 1568 : 1319, d: 0.35, type: 'sine', v: 0.12, t: 0.82 }); },
    charge() { A.tone({ f: 160, f2: 1300, d: 0.65, type: 'sawtooth', v: 0.05 }); A.noise({ d: 0.65, v: 0.06, hp: 1200, f2: 8000 }); },
    boom(m) { const big = m >= 50; A.noise({ d: big ? 1.1 : 0.7, v: big ? 0.4 : 0.3, lp: 900, f2: 50 }); A.tone({ f: 110, f2: 34, d: big ? 0.9 : 0.6, type: 'sawtooth', v: 0.14 }); if (big) A.tone({ f: 55, f2: 30, d: 1.2, type: 'sine', v: 0.3 }); },
    fly() { A.tone({ f: 600, f2: 2200, d: 0.3, type: 'sine', v: 0.08 }); A.noise({ d: 0.3, v: 0.04, hp: 3000, f2: 9000 }); },
    chime(k) { A.tone({ f: 1046.5 * Math.pow(2, Math.min(k, 12) / 12), d: 0.35, type: 'sine', v: 0.16 }); A.tone({ f: 2093 * Math.pow(2, Math.min(k, 12) / 12), d: 0.2, type: 'sine', v: 0.05 }); },
    whoosh() { A.noise({ d: 0.55, v: 0.14, lp: 300, f2: 5000 }); A.tone({ f: 200, f2: 900, d: 0.5, type: 'sine', v: 0.05 }); },
    intro() { A.seq([N.A4, N.C5, N.E5, N.A5, N.G5, N.E5, N.F5, [N.A5, 3]], { step: 0.11, type: 'square', v: 0.09 }); A.seq([220, 0, 0, 0, 174.6, 0, 0, [220, 4]], { step: 0.11, type: 'triangle', v: 0.18 }); A.noise({ d: 1.2, v: 0.05, hp: 5000 }); },
    slam() { A.tone({ f: 130, f2: 45, d: 0.4, type: 'sine', v: 0.4 }); A.noise({ d: 0.25, v: 0.15, lp: 1200 }); A.tone({ f: 1568, d: 0.4, type: 'triangle', v: 0.1, t: 0.03 }); },
    retrig() { A.seq([N.E5, N.G5, N.B5, [N.E6, 2]], { step: 0.07, type: 'square', v: 0.1 }); A.seq([N.E6, N.G6, [2637, 3]], { step: 0.07, type: 'triangle', v: 0.08, t: 0.35 }); },
    outro() { A.seq([N.C5, N.E5, N.G5, N.C6, N.B5, N.G5, [N.C6, 4]], { step: 0.1, type: 'triangle', v: 0.18 }); A.seq([N.C4, 0, N.G4, 0, [N.C5, 4]], { step: 0.2, type: 'sine', v: 0.14 }); },
    spin() { A.noise({ d: 0.3, v: 0.08, lp: 600, f2: 2400 }); A.tone({ f: 300, f2: 900, d: 0.18, type: 'triangle', v: 0.06 }); },
    giggle() { A.seq([N.G5, N.E5, N.A5, N.F5], { step: 0.06, type: 'sine', v: 0.06 }); },
  };

  /* ---------- build ---------- */
  function mount(el, B) {
    S = B.scope(); root = el; busy = false; hurry = false; mode = 'base'; lay = ''; cells = []; skipFns = []; tapFn = null; parts = []; partStop = null;
    live.clear(); pend.clear();
    auto = 0; turbo = false; devNext = null;
    rmq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    DEV = devWanted() && !Batty.online;
    anteOn = false; try { anteOn = localStorage.getItem('bonanza-ante') === '1'; } catch (e) { /* ignore */ }
    E = {};
    root.innerHTML = defsSvg();
    E.scene = buildScene();

    E.logo = h('div', { class: 'brand', html: logoSvg(P + 'lg-', false) });
    E.mascot = h('div', { class: 'mascot', html: mascotSvg(), onclick: () => { mascot('cheer', 900); snd.giggle(); } });
    E.grid = h('div', { class: 'grid', onclick: () => { if (tapFn) tapFn(); else if (busy) doSkip(); } });
    E.cols = h('div', { class: 'cols', 'aria-hidden': 'true' });
    for (let r = 0; r < REELS; r++) E.cols.append(h('i', { style: '--r:' + r }));
    E.labs = h('div', { class: 'labs', 'aria-hidden': 'true' });
    E.banner = h('div', { class: 'banner' });
    E.meterOut = h('output', null, '0');
    E.meterX = h('span', { class: 'mx' });
    E.meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('small', null, 'Tumble win'), h('span', { class: 'mv2' }, E.meterOut, E.meterX));
    E.frame = h('div', { class: 'frame' }, h('i', { class: 'drips', html: dripSvg() }), E.cols, E.grid, E.labs, E.banner, E.meter);

    /* hud above the grid */
    E.win = h('output', null, '0');
    E.fsLeft = h('output', null, '0');
    E.mult = h('output', null, '×0');
    E.fsTotal = h('output', null, '0');
    E.hud = h('div', { class: 'hud' },
      h('div', { class: 'cell w' }, h('small', null, 'Win'), E.win),
      h('div', { class: 'cell fsl' }, h('small', null, 'Spins left'), E.fsLeft),
      h('div', { class: 'cell mul' }, h('small', null, 'Bat-Bombs'), E.mult),
      h('div', { class: 'cell fst' }, h('small', null, 'Bonus win'), E.fsTotal));
    E.msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' }, '');

    /* feature cards */
    E.ante = h('button', { class: 'feat ante', type: 'button', id: 'bonanza-ante', 'aria-pressed': 'false', onclick: toggleAnte },
      h('span', { class: 'ico', html: useSym('lolly') }), h('span', { class: 't' }, h('b', null, 'Fang Bet'), h('small', null, '')), h('i', { class: 'sw' }));
    E.buy = h('button', { class: 'feat buy', type: 'button', id: 'bonanza-buy', onclick: openBuy },
      h('span', { class: 'ico', html: useSym('bomb') }), h('span', { class: 't' }, h('b', null, 'Buy Free Spins'), h('small', null, '')));
    E.feats = h('div', { class: 'feats' }, E.ante, E.buy);

    /* paytable side panel (wide screens) */
    E.pay = h('div', { class: 'paytbl' });
    E.keys = h('div', { class: 'keys', html: '<span><b>Space</b> spin</span> <span><b>T</b> turbo</span> <span><b>A</b> auto</span> <span><b>F</b> Fang Bet</span> <span><b>B</b> buy</span>' });
    E.side = h('aside', { class: 'side l' }, E.logo, E.feats, E.mascot, E.keys);
    E.sideR = h('aside', { class: 'side r' }, h('h4', null, 'Pays anywhere'), E.pay);

    /* controls */
    E.stakeBox = h('div', { class: 'stakebox' });
    stakeCtl = Batty.ui.stake(E.stakeBox, { id: ID, onChange: paintStake, label: 'Stake · BB' });
    E.spin = h('button', { class: 'spin', type: 'button', id: 'bonanza-spin', 'aria-label': 'Spin', onclick: primary, html: spinSvg() + '<span class="n"></span>' });
    E.autoBtn = h('button', { class: 'btn auto', type: 'button', id: 'bonanza-auto', 'aria-label': 'Autoplay', onclick: autoClick }, h('b', null, 'Auto'), h('small', null, 'off'));
    E.turboBtn = h('button', { class: 'btn turbo', type: 'button', id: 'bonanza-turbo', 'aria-label': 'Turbo', 'aria-pressed': 'false', onclick: toggleTurbo }, h('b', null, 'Turbo'), h('small', null, 'off'));
    E.autoMenu = buildAutoMenu();
    E.ctlL = h('div', { class: 'l' }, E.stakeBox);
    E.ctlR = h('div', { class: 'r' }, E.autoBtn, E.turboBtn);
    E.ctlRow = h('div', { class: 'ctlrow' }, E.ctlL, E.spin, E.ctlR);
    E.ctl = h('div', { class: 'ctl' }, E.ctlRow, E.autoMenu);

    E.main = h('div', { class: 'main' }, E.hud, E.frame, E.msg);
    E.wrap = h('div', { class: 'wrap' }, E.side, E.main, E.sideR, E.ctl);
    E.flash = h('div', { class: 'flash', 'aria-hidden': 'true' });
    E.iris = h('div', { class: 'iris', hidden: true, 'aria-hidden': 'true' }, h('i'));
    E.fx = h('canvas', { class: 'fxc', 'aria-hidden': 'true' }); fxCx = E.fx.getContext('2d');
    E.ov = h('div', { class: 'ov', hidden: true, onclick: (e) => { if (tapFn && !e.target.closest('button')) tapFn(); } });
    root.append(E.scene, E.wrap, E.flash, E.iris, E.fx, E.ov);

    /* opening grid: a quiet, winless arrangement */
    const open = [4, 7, 2, 8, 5, 1, 6, 3, 0, 4, 8, 5, 7, 2, 6, 9, 3, 1, 5, 0, 8, 4, 7, 6, 2, 3, 6, 8, 1, 5];
    layout();
    for (let c = 0; c < CELLS; c++) { const o = makeCell(open[c], 0); place(o, (c / ROWS) | 0, c % ROWS); cells[c] = o; E.grid.append(o.el); }

    paintStake(); paintAnte(); paintCtl(); setMsg('Land 8 or more of a sweet anywhere to win');
    const ro = new ResizeObserver(layout); ro.observe(root); S._ro = ro; S.on(window, 'resize', layout);
    S.on(document, 'keydown', onKey);
    S.interval(idleDirector, 650);
    if (DEV) {
      devLog = { rounds: 0, staked: 0, won: 0, start: Batty.wallet.balance, bonuses: 0 };
      /* Practice-mode test hooks (inert unless localStorage['batty-dev']==='1' and offline). Every scenario is a genuine
         round from the maths, merely picked out of many: nothing here bends the odds of normal play. */
      const find = (gen, ok, tries) => { for (let i = 0; i < (tries || 20000); i++) { const o = gen(); if (ok(o)) return o; } return null; };
      const queue = (o, buy) => { if (!o) return false; devNext = { o, buy: !!buy }; return true; };
      window.__bonanzaDev = {
        /* next (practice) spin opens with exactly n Lollipops */
        force(n) { return queue(M.triggerSpin(Batty.rng, n, 'base')); },
        forceOutcome(fn) { devNext = { fn }; },
        /* a base spin that shows 3 Lollipops early so the later reels tease (and maybe land the 4th) */
        tease(hit) { return queue(find(() => M.spin(Batty.rng, true), (o) => { let n = 0; for (let c = 0; c < 15; c++) if (o.spin.g[c] === SYM.LOLLY) n++; let all = 0; for (const s of o.spin.g) if (s === SYM.LOLLY) all++; return n >= 3 && (hit ? all >= 4 : all === 3); }, 400000)); },
        /* a long tumble chain */
        chain(min) { return queue(find(() => M.spin(Batty.rng, false), (o) => o.spin.steps.length >= (min || 4))); },
        /* a bought bonus whose first free spin has Bat-Bombs and a tumble win (optionally a big bomb) */
        bombs(minMult) { return queue(find(() => M.buy(Batty.rng), (o) => { const s = o.fs.spins[0]; return s.bombs > 0 && s.tw > 0 && s.mult >= (minMult || 2); }, 4000), true); },
        retrigger() { return queue(find(() => M.buy(Batty.rng), (o) => o.fs.retriggers > 0 && o.fs.spins.slice(0, 3).some((s) => s.retrigger), 4000), true); },
        big(x) { return queue(find(() => M.spin(Batty.rng, false), (o) => o.totalWin >= (x || 10) * U && !o.fs, 400000)); },
        spin() { primary(); }, buy() { if (!busy) spin(!!(devNext && devNext.buy)); },
        tap() { if (tapFn) tapFn(); else if (busy) doSkip(); },
        set speed(v) { devSpeed = v; }, get speed() { return devSpeed; },
        get log() { return devLog; }, get busy() { return busy; }, get auto() { return auto; }, get mode() { return mode; },
        get grid() { return cells.map((o) => o.s); }, M,
      };
    }
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    live.forEach((a) => { try { a.cancel(); } catch (e) { /* gone */ } }); live.clear(); pend.clear();
    S = null; root = null; E = null; cells = []; skipFns = []; tapFn = null; busy = false; auto = 0; parts = []; partStop = null; devSpeed = 1; devNext = null;
    if (window.__bonanzaDev) delete window.__bonanzaDev;
  }

  /* ---------- the world: sky, moon and castle, drifting candy-floss clouds, bats, sugar motes ---------- */
  function buildScene() {
    const sc = h('div', { class: 'scene', 'aria-hidden': 'true' });
    const L = sceneLayers();
    sc.innerHTML = '<div class="sky"></div>' + L.stars + L.glow + L.moon;
    const clouds = h('div', { class: 'clouds' });
    const C = [[0.08, 0.9, 150, -20, 0, '#ff9ad5', '#ffd0ec', 0.32], [0.2, 0.6, 210, -120, 1, '#c38aff', '#e6ccff', 0.28], [0.03, 0.5, 260, -60, 0, '#ffb0de', '#fff', 0.22],
      [0.32, 1.1, 120, -80, 1, '#ff9ad5', '#ffe2f2', 0.24], [0.14, 0.75, 180, -150, 0, '#d79aff', '#f2e0ff', 0.26]];
    for (const [y, s, t, d, face, c1, c2, o] of C) {
      const cl = h('div', { class: 'cl', html: cloudSvg(face, c1, c2) });
      cl.style.cssText = '--y:' + (y * 100) + '%;--s:' + s + ';--t:' + t + 's;--d:' + d + 's;--o:' + o;
      clouds.append(cl);
    }
    sc.append(clouds);
    sc.insertAdjacentHTML('beforeend', L.land + L.wins + '<div class="fsky"></div><div class="bolt"></div>');
    const bats = h('div', { class: 'bats' });
    for (const [y, s, t, d] of [[0.12, 0.5, 19, -3], [0.24, 0.36, 26, -14], [0.06, 0.3, 31, -22], [0.3, 0.42, 23, -9]]) {
      const b = h('div', { class: 'fb', html: '<i>' + flyBatSvg() + '</i>' });
      b.style.cssText = '--y:' + (y * 100) + '%;--s:' + s + ';--t:' + t + 's;--d:' + d + 's';
      bats.append(b);
    }
    sc.append(bats);
    const motes = h('div', { class: 'motes' });
    for (let i = 0; i < 18; i++) {
      const m = h('i');
      m.style.cssText = '--x:' + (Math.random() * 100).toFixed(1) + '%;--t:' + (9 + Math.random() * 10).toFixed(1) + 's;--d:' + (-Math.random() * 18).toFixed(1) + 's;--k:' + (0.5 + Math.random()).toFixed(2) + ';--c:' + ['#fff', '#ffd0ec', '#ffe9a6', '#c8f7ec'][i % 4];
      motes.append(m);
    }
    sc.append(motes, h('div', { class: 'vign' }));
    return sc;
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
      '<path d="M26 30c8-12 20-16 30-16-12 4-20 10-25 20z" fill="#fff" opacity=".55"/><rect class="sq" x="35" y="35" width="30" height="30" rx="7" fill="#2a0620" stroke="#fff3f6" stroke-width="3"/></svg>';
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
    if (anteOn) { const p = centre(E.ante.querySelector('.ico')); sparkle(p.x, p.y, '#ff9ad5', 14, 0.8); }
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
    E.ante.querySelector('small').textContent = anteOn ? 'On · ' + fmt(st * M.ANTE_NUM / M.ANTE_DEN) + ' BB a spin' : (lay === 'wide' ? 'Off · 2× the free spins chance for +25%' : 'Off · 2× bonus chance');
    E.buy.querySelector('small').textContent = fmt(st * M.BUY_X) + ' BB · 100×';
    let t = '';
    for (let s = 0; s < M.PAYERS; s++) t += '<div class="pr"><i>' + useSym(KEYS[s]) + '</i><span>' + M.PAY[s].map((u, k) => '<b>' + ['8+', '10+', '12+'][k] + '</b>' + short(u * st / U)).join('') + '</span></div>';
    t += '<div class="pr sc"><i>' + useSym('lolly') + '</i><span><b>4</b>' + short(60 * st / U) + '<b>5</b>' + short(100 * st / U) + '<b>6+</b>' + short(2000 * st / U) + '</span></div>';
    E.pay.innerHTML = t;
  }
  function short(n) { return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? (Math.round(n / 100) / 10) + 'k' : fmt(n); }
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
    E.spin.classList.toggle('auto', auto > 0);
    E.spin.setAttribute('aria-label', busy ? 'Stop: slam the sweets down' : auto > 0 ? 'Spin (autoplay on)' : 'Spin');
    E.spin.querySelector('.n').textContent = auto > 0 ? String(auto) : '';
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? 'stop' : 'off';
  }
  function setMsg(t, cls) { if (!E) return; E.msg.innerHTML = t; E.msg.className = 'msg' + (cls ? ' ' + cls : ''); }

  /* ---------- layout: wide (desktop), tall (phone portrait) or land (phone landscape) ---------- */
  function layout() {
    if (!root || !E) return;
    const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return;
    const nl = W >= 980 && H >= 540 ? 'wide' : (W > H * 1.2 && H < 600) ? 'land' : 'tall';
    if (nl !== lay) {
      lay = nl;
      root.classList.toggle('wide', lay === 'wide'); root.classList.toggle('land', lay === 'land'); root.classList.toggle('tall', lay === 'tall');
      if (lay === 'wide') {
        E.side.append(E.logo, E.feats, E.mascot, E.keys);
        E.main.append(E.hud, E.frame, E.msg);
        E.ctl.prepend(E.ctlRow);
      } else if (lay === 'land') {
        E.side.append(E.logo, E.hud, E.msg, E.feats);
        E.main.append(E.frame);
        E.ctl.prepend(E.ctlRow);
        E.side.append(E.mascot);
      } else {
        E.main.append(E.logo, E.hud, E.frame, E.msg);
        E.logo.append(E.mascot);
        E.ctl.prepend(E.feats, E.ctlRow);
      }
      paintStake();
    }
    let size, cH;
    if (lay === 'wide') {
      const aw = W - 2 * 280 - 80, ah = H - 64 - 110 - 48 - 46;
      size = Math.floor(Math.min(aw / REELS, ah / ROWS, 118)); cH = size;
    } else if (lay === 'land') {
      const ah = H - 52, aw = W - 2 * Math.max(170, Math.min(240, W * 0.24)) - 30;
      size = Math.floor(Math.min(ah / ROWS, aw / REELS, 100)); cH = size;
    } else {
      const logoH = H > 700 ? 70 : H > 600 ? 54 : 0;
      root.classList.toggle('nologo', logoH === 0);
      const ah = H - logoH - 50 - 28 - 176 - 46, aw = W - 36;
      size = Math.floor(Math.min(aw / REELS, 100));
      cH = Math.max(size, Math.min(Math.floor(size * 1.14), Math.floor(ah / ROWS)));
      if (ah / ROWS < size) { size = Math.floor(Math.max(36, ah / ROWS)); cH = size; }
    }
    cw = Math.max(36, size); ch = Math.max(36, cH);
    root.style.setProperty('--cw', cw + 'px'); root.style.setProperty('--ch', ch + 'px');
    for (const o of cells) if (o) place(o, o.r, o.w);
    fxDpr = Math.min(2, window.devicePixelRatio || 1); fxW = W; fxH = H;
    E.fx.width = Math.round(W * fxDpr); E.fx.height = Math.round(H * fxDpr);
  }

  /* ---------- cells ---------- */
  const tierCls = (m) => m >= 250 ? 't3' : m >= 50 ? 't2' : m >= 10 ? 't1' : 't0';
  const ROLL_N = 8;
  function mvHtml(m) {
    const v = []; for (let i = 0; i < ROLL_N - 1; i++) v.push(M.BOMB_VALUES[(Math.random() * 13) | 0]); v.push(m);
    return '<b class="mv ' + tierCls(m) + '"><span class="rl" style="transform:translateY(-' + ((ROLL_N - 1) * 1.1).toFixed(1) + 'em)">' + v.map((x) => '<i>' + x + '×</i>').join('') + '</span></b>';
  }
  function makeCell(s, m) {
    const k = KEYS[s];
    const el = h('div', { class: 'c s-' + k, html: symSvg(k) + (s === SYM.BOMB ? mvHtml(m) : '') });
    el.style.setProperty('--dl', (-Math.random() * 3.4).toFixed(2) + 's');
    return { el, s, m, r: 0, w: 0, sym: el.firstChild };
  }
  const xy = (r, w) => 'translate(' + (r * cw) + 'px,' + (w * ch) + 'px)';
  const xys = (r, w, sx, sy) => 'translate(' + (r * cw) + 'px,' + (w * ch).toFixed(1) + 'px) scale(' + sx + ',' + sy + ')';
  function place(o, r, w) { o.r = r; o.w = w; o.el.style.transform = xy(r, w); }
  function centre(el) {
    const a = el.getBoundingClientRect(), b = root.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  }
  function gridPos() { const a = E.grid.getBoundingClientRect(), b = root.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top }; }
  const cellXY = (go, r, w) => ({ x: go.x + (r + 0.5) * cw, y: go.y + (w + 0.5) * ch });

  /* a sweet falls from row fromW to row toW: gravity in, a stretch while it falls, an impact squash, one small bounce */
  function dropTo(o, fromW, toW, dur, delay) {
    const r = o.r, bh = Math.min(0.16, 0.03 + (toW - fromW) * 0.016);
    place(o, r, toW);
    const p = anim(o.el, [
      { transform: xys(r, fromW, 0.94, 1.1), offset: 0, easing: 'cubic-bezier(.5,0,.92,.5)' },
      { transform: xys(r, toW, 1, 1), offset: 0.62, easing: 'cubic-bezier(.25,.7,.45,1)' },
      { transform: xys(r, toW - bh, 1, 1), offset: 0.81, easing: 'cubic-bezier(.55,0,.85,.5)' },
      { transform: xys(r, toW, 1, 1), offset: 1 },
    ], dur, 'linear', delay);
    anim(o.sym, [
      { transform: 'scale(1,1)' }, { transform: 'scale(1.18,.78)', offset: 0.28 }, { transform: 'scale(.93,1.08)', offset: 0.62 }, { transform: 'scale(1,1)' },
    ], T(320), 'ease-out', delay + dur * 0.62);
    return p;
  }
  function rollBomb(o, delay) {
    const rl = o.el.querySelector('.rl'); if (!rl) return;
    anim(rl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-' + ((ROLL_N - 1) * 1.1).toFixed(1) + 'em)' }], T(880), 'cubic-bezier(.2,.7,.25,1.04)', delay);
    anim(o.el.querySelector('.mv'), [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.5)', offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(1)' }], T(380), 'ease-out', delay + T(860));
  }

  /* the old grid kicks up and falls away; the new one drops in reel by reel, with a tease once a feature is one Lollipop away */
  async function dropGrid(g, m, fs) {
    const old = cells.slice(); cells = [];
    old.forEach((o) => {
      if (!o) return;
      anim(o.el, [
        { transform: xys(o.r, o.w, 1, 1), easing: 'cubic-bezier(.3,0,.6,1)' },
        { transform: xys(o.r, o.w - 0.12, 1, 1), offset: 0.2, easing: 'cubic-bezier(.55,0,1,.45)' },
        { transform: xys(o.r, o.w + ROWS + 1, 0.94, 1.14) },
      ], T(460), 'linear', T(o.r * 42 + (ROWS - 1 - o.w) * 14), 'forwards').then(() => o.el.remove());
    });
    await nap(210);
    const go = gridPos(), need = fs ? M.FS_RETRIGGER_AT : M.FS_TRIGGER;
    let lollies = 0, delay = 0, lvl = 0, lastLand = 0;
    const waits = [];
    for (let r = 0; r < REELS; r++) {
      const tease = !hurry && lollies >= need - 1;
      let dur = T(440);
      if (tease) {
        lvl++;
        const at = Math.max(0, lastLand - T(60)), rr = r, lv = lvl;
        later(() => antOn(rr, lv), at);
        delay += T(fs ? 700 : 1000); dur = T(620);
      }
      let landAt = 0;
      for (let w = 0; w < ROWS; w++) {
        const c = r * ROWS + w, o = makeCell(g[c], m[c]);
        cells[c] = o; o.r = r; E.grid.append(o.el);
        const d = delay + T(r * 85 + (ROWS - 1 - w) * 28);
        waits.push(dropTo(o, w - ROWS - 0.7, w, dur, d));
        const hit = d + dur * 0.62;
        landAt = Math.max(landAt, hit);
        if (g[c] === SYM.LOLLY) { lollies++; const n = lollies; later(() => lollyLand(o, n, need, go), hit); }
        if (g[c] === SYM.BOMB) { rollBomb(o, hit); later(() => bombLand(o, go), hit); }
      }
      lastLand = landAt;
      const rr = r, tz = tease;
      later(() => { reelThud(rr, go); if (tz) antOff(rr); }, landAt);
    }
    await Promise.all(waits);
    antOff();
  }
  function reelThud(r, go) {
    snd.thud(r);
    if (reduce()) return;
    const x = go.x + (r + 0.5) * cw, y = go.y + ROWS * ch - 4;
    for (let i = 0; i < 5; i++) parts.push({ k: 'puff', x: x + (Math.random() - 0.5) * cw * 0.8, y, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 40, g: -10, life: 0, max: 0.45 + Math.random() * 0.25, r: cw * (0.08 + Math.random() * 0.06), c: Math.random() < 0.5 ? '#ffe6f4' : '#fff' });
    kick();
  }
  function lollyLand(o, n, need, go) {
    o.el.classList.remove('land'); void o.el.offsetWidth; o.el.classList.add('land');
    snd.lolly(n);
    const p = cellXY(go, o.r, o.w);
    ring(p.x, p.y, '#ff9ad5', cw * 0.9);
    sparkle(p.x, p.y, '#ff9ad5', n >= need ? 22 : 10, n >= need ? 1.3 : 0.8);
    cells.forEach((c) => { if (c && c.s === SYM.LOLLY && c !== o && c.el.isConnected) c.el.classList.add('throb'); });
    o.el.classList.add('throb');
    if (n === need) { snd.hit(); flash(0.35); mascot('cheer', 1400); }
  }
  function bombLand(o, go) {
    snd.bombLand(o.m);
    const p = cellXY(go, o.r, o.w);
    anim(E.frame, [{ transform: 'translateY(0)' }, { transform: 'translateY(' + (o.m >= 50 ? 6 : 3) + 'px)', offset: 0.25 }, { transform: 'translateY(-1px)', offset: 0.6 }, { transform: 'translateY(0)' }], T(260), 'ease-out');
    if (reduce()) return;
    for (let i = 0; i < 10; i++) parts.push({ k: 'puff', x: p.x + (Math.random() - 0.5) * cw * 0.7, y: p.y + ch * 0.38, vx: (Math.random() - 0.5) * 160, vy: -30 - Math.random() * 60, g: -20, life: 0, max: 0.5 + Math.random() * 0.3, r: cw * (0.08 + Math.random() * 0.08), c: Math.random() < 0.5 ? '#ffd0ec' : '#e8d0ff' });
    ring(p.x, p.y + ch * 0.3, '#ff4a8a', cw * 0.8);
    if (o.m >= 50) { shake(1); sparkle(p.x, p.y, '#ffd84a', 14, 1); }
    kick();
  }
  /* anticipation on reel r: a glowing column, the frame pulses, the landed Lollipops throb and the tone climbs */
  function antOn(r, lvl) {
    if (!E) return;
    E.cols.children[r].classList.add('on');
    E.frame.classList.add('tease');
    root.classList.add('teasing');
    mascot('tease', 0);
    snd.tease(lvl);
    setMsg('One more Lollipop' + (mode === 'fs' ? ' for 5 more spins…' : ' for free spins…'), 'hot');
  }
  function antOff(r) {
    if (!E) return;
    if (r != null) { E.cols.children[r].classList.remove('on'); return; }
    for (const c of E.cols.children) c.classList.remove('on');
    E.frame.classList.remove('tease'); root.classList.remove('teasing');
    E.mascot.classList.remove('tease');
    cells.forEach((c) => c && c.el.classList.remove('throb'));
  }

  /* one tumble: winners glow with their amounts, pop in a burst of sugar, the rest fall, new sweets drop in */
  async function tumble(step, k, unit, fs, before) {
    const go = gridPos();
    const rm = new Set(step.rm);
    const winCells = step.rm.map((c) => cells[c]).filter(Boolean);
    E.grid.classList.add('dim');
    winCells.forEach((o) => o.el.classList.add('win'));
    snd.win(k);
    meterOn();
    const labels = step.wins.map((x, i) => {
      const mine = winCells.filter((o) => o.s === x.s);
      let ax = 0, ay = 0; mine.forEach((o) => { ax += o.r; ay += o.w; }); ax /= mine.length || 1; ay /= mine.length || 1;
      const L = { x: (ax + 0.5) * cw, y: (ay + 0.5) * ch, amt: x.pay * unit };
      L.el = h('div', { class: 'lab', style: '--sc:' + SYM_COL[x.s] + ';left:' + L.x + 'px;top:' + L.y + 'px;animation-delay:' + (i * 90) + 'ms' }, h('small', null, x.n + ' × ' + M.SYMBOL_NAMES[x.s]), '+' + fmt(L.amt));
      E.labs.append(L.el);
      return L;
    });
    setMsg(step.wins.map((x) => '<b>' + x.n + '</b> ' + M.SYMBOL_NAMES[x.s] + ' <em>' + fmt(x.pay * unit) + '</em>').join(' · ') + (k ? ' · tumble ' + (k + 1) : ''), 'pay');
    if (k >= 2) mascot('cheer', 900);
    if (k >= 1) cheer(1);
    await nap(fs ? 680 : 760);
    /* pop */
    E.grid.classList.remove('dim');
    winCells.forEach((o) => {
      o.el.classList.remove('win'); o.el.classList.add('pop');
      const p = cellXY(go, o.r, o.w);
      sugarBurst(p.x, p.y, SYM_COL[o.s], winCells.length > 14 ? 0.6 : 1);
    });
    for (let i = 0; i < Math.min(7, step.wins.length + 4); i++) snd.pop(i);
    snd.crunch();
    /* the amounts fly into the tumble meter, which counts up */
    const mp = meterPos();
    labels.forEach((L, i) => {
      anim(L.el, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(calc(-50% + ' + (mp.x - L.x) + 'px), calc(-50% + ' + (mp.y - L.y) + 'px)) scale(.45)', opacity: 0.3 }], T(460), 'cubic-bezier(.55,0,.9,.55)', T(160 + i * 70), 'forwards').then(() => L.el.remove());
    });
    S.timeout(() => { if (E) { rollTo(E.meterOut, before, before + step.pay * unit, T(520)); bump(E.meter); } }, T(520));
    await nap(300);
    winCells.forEach((o) => o.el.remove());
    /* fall and refill, reel by reel */
    const next = new Array(CELLS), waits = [];
    for (let r = 0; r < REELS; r++) {
      const keep = [];
      for (let w = 0; w < ROWS; w++) { const c = r * ROWS + w; if (!rm.has(c)) keep.push(cells[c]); }
      const add = step.add[r] || [], addM = step.addM[r] || [];
      const n = add.length;
      const col = add.map((s, i) => { const o = makeCell(s, addM[i]); o.r = r; return o; }).concat(keep);
      let landAt = 0;
      col.forEach((o, w) => {
        const fresh = w < n, fromW = fresh ? w - n - 0.6 : o.w;
        next[r * ROWS + w] = o;
        if (fresh) E.grid.append(o.el);
        if (fromW !== w) {
          const d = T(r * 45 + (fresh ? 110 + (n - 1 - w) * 30 : (ROWS - 1 - w) * 18)), dur = T(fresh ? 420 : 340);
          waits.push(dropTo(o, fromW, w, dur, d));
          landAt = Math.max(landAt, d + dur * 0.62);
          if (fresh && o.s === SYM.LOLLY) later(() => { const cnt = next.filter((x) => x && x.s === SYM.LOLLY).length; lollyLand(o, cnt, fs ? M.FS_RETRIGGER_AT : M.FS_TRIGGER, go); }, d + dur * 0.62);
          if (fresh && o.s === SYM.BOMB) { rollBomb(o, d + dur * 0.62); later(() => bombLand(o, go), d + dur * 0.62); }
        } else place(o, r, w);
      });
      if (landAt) later(() => snd.land(), landAt);
    }
    cells = next;
    await Promise.all(waits);
    await nap(80);
  }

  /* ---------- the tumble meter ---------- */
  function meterOn() { if (!E.meter.classList.contains('on')) { E.meterOut.textContent = '0'; E.meterX.textContent = ''; E.meter.classList.add('on'); } }
  function meterOff() { E.meter.classList.remove('on', 'x'); }
  function meterPos() { const a = E.meter.getBoundingClientRect(), b = E.labs.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; }
  /* the meter's total flies into a HUD box, which counts up */
  async function meterTo(target, from, to) {
    if (!E.meter.classList.contains('on')) { if (to !== from) await rollTo(target, from, to, T(500)); return; }
    const p = centre(E.meterOut), q = centre(target);
    E.meter.classList.remove('on', 'x');
    await flyValue(fmt(to - from), p, q, 'sum');
    if (!E) return;
    bump(target.parentNode);
    await rollTo(target, from, to, T(560));
  }
  /* count a number up with a ticking sound; a tap finishes it */
  function rollTo(el, from, to, ms, quiet) {
    return new Promise((res) => {
      if (!el || !S) return res();
      ms = Math.max(60, ms);
      const t0 = performance.now(); let done = false, off = null;
      const fin = () => { if (done) return; done = true; if (off) off(); el.textContent = fmt(to); res(); };
      off = onSkip(fin);
      const step = (t) => {
        if (done) return;
        const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (!quiet && k < 1) snd.tick();
        if (k < 1) S.raf(step); else fin();
      };
      S.raf(step);
    });
  }
  function banner(html, cls, ms) {
    E.banner.innerHTML = html; E.banner.className = 'banner show ' + (cls || '');
    if (ms) S.timeout(() => { if (E) E.banner.className = 'banner'; }, ms);
  }
  const hideBanner = () => { if (E) E.banner.className = 'banner'; };

  /* a value flies along an arc with a sugar trail */
  function flyValue(txt, p, q, cls) {
    return new Promise((res) => {
      if (!E) return res();
      const el = h('div', { class: 'flyv ' + (cls || '') }, txt); root.append(el);
      const dur = T(cls === 'sum' ? 520 : 640), t0 = performance.now();
      const cx = (p.x + q.x) / 2 + (q.x >= p.x ? -60 : 60), cy = Math.min(p.y, q.y) - 70 - Math.abs(q.x - p.x) * 0.15;
      const col = cls === 'big' ? '#ffd84a' : cls === 'sum' ? '#fff3a0' : '#ff9ad5';
      let done = false, off = null;
      const fin = () => { if (done) return; done = true; if (off) off(); el.remove(); res(); };
      off = onSkip(fin);
      if (cls !== 'sum') snd.fly();
      const step = (t) => {
        if (done) return;
        const k = Math.min(1, (t - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, u = 1 - e;
        const x = u * u * p.x + 2 * u * e * cx + e * e * q.x, y = u * u * p.y + 2 * u * e * cy + e * e * q.y;
        const s = (cls === 'sum' ? 1.1 : 1.5) - 0.6 * e + Math.sin(e * Math.PI) * 0.45;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-50%) scale(' + s.toFixed(3) + ')';
        if (!reduce()) { parts.push({ k: 'glow', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, g: 0, life: 0, max: 0.4, r: 3 + Math.random() * 4, c: col }); kick(); }
        if (k < 1) S.raf(step); else fin();
      };
      S.raf(step);
    });
  }

  /* the Bat-Bombs go off: they charge, explode one by one, and each value flies into the multiplier; then it multiplies */
  async function bombs(seq, unit) {
    const list = cells.filter((o) => o && o.s === SYM.BOMB).sort((a, b) => a.r - b.r || a.w - b.w);
    if (!list.length) return;
    setMsg('Bat-Bombs away!', 'hot');
    const go = gridPos();
    list.forEach((o) => o.el.classList.add('charge')); snd.charge(); mascot('scared', 1600);
    await nap(680);
    let sum = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      o.el.classList.remove('charge'); o.el.classList.add('boom');
      const p = cellXY(go, o.r, o.w);
      snd.boom(o.m); shake(o.m >= 100 ? 3 : o.m >= 20 ? 2 : 1); blast(p.x, p.y, o.m);
      if (o.m >= 50) flash(o.m >= 250 ? 0.8 : 0.45);
      await nap(200);
      if (!E) return;
      await flyValue(o.m + '×', p, centre(E.mult), o.m >= 50 ? 'big' : '');
      if (!E) return;
      sum += o.m; E.mult.textContent = '×' + sum; bump(E.mult.parentNode); snd.chime(i);
      o.el.classList.add('spent');
    }
    await nap(220);
    const tw = seq.tw * unit, total = seq.tw * seq.mult * unit;
    await flyValue('×' + seq.mult, centre(E.mult), centre(E.meter), 'big');
    if (!E) return;
    E.meterX.textContent = '×' + seq.mult; E.meter.classList.add('x'); bump(E.meter);
    banner('<small>' + fmt(tw) + ' × ' + seq.mult + '</small><b>' + fmt(tw) + '</b>', 'mult');
    A.seq([N.C5, N.G5, N.C6, [N.E6, 3]], { step: 0.07, type: 'square', v: 0.11 });
    if (seq.mult >= 20) { const c = centre(E.banner); sparkle(c.x, c.y, '#ffd84a', 40, 2); cheer(2); }
    rollTo(E.meterOut, tw, total, T(1000), true);
    await rollTo(E.banner.querySelector('b'), tw, total, T(1000));
    await nap(650);
    hideBanner();
  }
  function fizzle() {
    const list = cells.filter((o) => o && o.s === SYM.BOMB);
    if (!list.length) return Promise.resolve();
    const go = gridPos();
    list.forEach((o) => { o.el.classList.add('fizz'); const p = cellXY(go, o.r, o.w); smoke(p.x, p.y); });
    snd.fizz();
    setMsg('No tumble win for the Bat-Bombs to multiply', '');
    return nap(600);
  }

  /* one whole spin (paid or free) with every tumble. target/from/to: the HUD box its win counts into. */
  async function playSeq(seq, unit, fs, target, from, to) {
    hurry = false;
    await dropGrid(seq.g, seq.m, fs);
    if (!E) return;
    let tw = 0;
    for (let k = 0; k < seq.steps.length; k++) {
      await tumble(seq.steps[k], k, unit, fs, tw);
      if (!E) return;
      tw += seq.steps[k].pay * unit;
    }
    let shown = tw;
    if (fs && seq.bombs > 0) { if (seq.tw > 0) { await bombs(seq, unit); shown = seq.tw * seq.mult * unit; } else await fizzle(); }
    if (!E) return;
    if (seq.sp > 0) {
      const lol = cells.filter((o) => o && o.s === SYM.LOLLY);
      lol.forEach((o) => o.el.classList.add('win'));
      meterOn();
      setMsg('<b>' + seq.sc + '</b> Cherry-Fang Lollipops pay <em>' + fmt(seq.sp * unit) + '</em>', 'pay');
      snd.lolly(5);
      const go = gridPos(); lol.forEach((o) => { const p = cellXY(go, o.r, o.w); sparkle(p.x, p.y, '#ff9ad5', 10, 0.9); });
      await rollTo(E.meterOut, shown, shown + seq.sp * unit, T(560));
      shown += seq.sp * unit;
      await nap(520);
      lol.forEach((o) => o.el.classList.remove('win'));
    }
    if (shown > 0 || E.meter.classList.contains('on')) await meterTo(target, from, to);
    meterOff();
    return shown;
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
    anim(E.spin.querySelector('svg'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-25deg)', offset: 0.3 }, { transform: 'rotate(360deg)' }], 520, 'cubic-bezier(.3,0,.3,1)');
    let o;
    if (Batty.online) {
      const r = await Batty.play(ID, 'spin', buy ? { stake, buy: true } : { stake, ante }, cost);
      if (!E) return;
      if (!r) { busy = false; auto = 0; paintCtl(); setMsg('Land 8 or more of a sweet anywhere to win'); return; }
      o = r.o;
    } else if (DEV && devNext) { o = devNext.fn ? devNext.fn(ante) : devNext.o; devNext = null; }
    else if (buy) o = M.buy(Batty.rng);
    else o = M.spin(Batty.rng, ante);
    const win = o.totalWin * unit;
    if (win > 0) Batty.wallet.win(ID, win, { silent: true });
    if (devLog) { devLog.rounds++; devLog.staked += cost; devLog.won += win; if (o.fs) devLog.bonuses++; devLog.last = o; }

    const baseWin = Math.min(o.spin.win, M.CAP) * unit;
    await playSeq(o.spin, unit, false, E.win, 0, baseWin);
    if (!E) return;
    if (o.fs) { await playBonus(o, unit, baseWin, stake); if (!E) return; }
    if (o.capped) { banner('<small>Max win reached</small><b>' + fmt(win) + '</b>', 'mult'); flash(0.6); await nap(1800); hideBanner(); }
    E.win.textContent = fmt(win);
    const ratio = win / stake;
    if (win > 0) {
      root.classList.add('won'); bump(E.win.parentNode);
      setMsg((o.fs ? 'Sweet! The round paid ' : 'You won ') + '<em>' + fmt(win) + ' BB</em>' + (win >= cost * 2 ? ' · ' + Batty.fmtX(ratio) : ''), 'hot');
      cheer(ratio >= 5 ? 2 : 1); mascot('cheer', 1600);
      if (ratio < 10) Batty.sfx('coin');
    } else setMsg(['No sweets this time', 'The bats ate them all', 'Not a sausage. Or a sweet.', 'Sugar crash. Go again?', 'Fangs is peckish. Again?'][(Math.random() * 5) | 0]);
    Batty.wallet.sync();
    if (ratio >= 10) { candyRain(ratio >= 75 ? 4200 : 2600); await Batty.ui.celebrate({ amount: win, bet: stake }); }
    else if (ratio >= 3 && !o.fs) {
      banner('<small>' + (ratio >= 6 ? 'Tasty win!' : 'Sweet win!') + '</small><b>' + fmt(win) + '</b>', 'mult', 1500);
      candyRain(ratio >= 6 ? 1600 : 1000); A.seq([N.C5, N.E5, N.G5, [N.C6, 2]], { step: 0.08, type: 'triangle', v: 0.15 });
      await nap(1300);
    }
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
  async function playBonus(o, unit, before, stake) {
    const fs = o.fs;
    /* trigger: the Lollipops leap and the world cheers */
    const lol = cells.filter((c) => c && c.s === SYM.LOLLY);
    lol.forEach((c) => c.el.classList.add('trig'));
    Batty.sfx('bonus'); mascot('cheer', 2400); cheer(2); flash(0.5);
    setMsg('<b>' + lol.length + '</b> Cherry-Fang Lollipops · free spins!', 'hot');
    const go = gridPos();
    lol.forEach((c, i) => { const p = cellXY(go, c.r, c.w); S.timeout(() => { ring(p.x, p.y, '#ffd84a', cw * 1.4); sparkle(p.x, p.y, '#ff9ad5', 18, 1.4); snd.lolly(i + 1); }, T(i * 160)); });
    await nap(1600);
    if (!E) return;
    lol.forEach((c) => c.el.classList.remove('trig'));
    await intro();
    if (!E) return;
    let total = 0, awarded = M.FS_AWARD;
    E.fsTotal.textContent = '0'; E.fsLeft.textContent = String(awarded); E.mult.textContent = '×0';
    for (let i = 0; i < fs.spins.length; i++) {
      const seq = fs.spins[i];
      E.fsLeft.textContent = String(awarded - i - 1); bump(E.fsLeft.parentNode);
      E.mult.textContent = '×0';
      setMsg('Free spin <b>' + (i + 1) + '</b> of <b>' + awarded + '</b>', '');
      const runTo = seq.running * unit;
      await playSeq(seq, unit, true, E.fsTotal, total, runTo);
      if (!E) return;
      total = runTo; E.fsTotal.textContent = fmt(total);
      if (seq.retrigger) { awarded += seq.retrigger; await retrigger(seq.retrigger, awarded - i - 1); if (!E) return; }
      await nap(seq.win ? 320 : 150);
    }
    const winFs = fs.total * unit;
    await outro(winFs, fs.spins.length, stake);
    return before + winFs;
  }

  /* the candy swirl wipe that carries us in and out of the free spins */
  async function iris(close) {
    if (!E) return;
    E.iris.hidden = false;
    snd.whoosh();
    const big = 'circle(150% at 50% 50%)', none = 'circle(0% at 50% 50%)';
    await anim(E.iris, [{ clipPath: close ? none : big }, { clipPath: close ? big : none }], T(close ? 620 : 700), close ? 'cubic-bezier(.5,0,.75,0)' : 'cubic-bezier(.25,1,.5,1)', 0, 'forwards');
    if (!close && E) E.iris.hidden = true;
  }
  function cineCard(kind, inner) {
    E.ov.className = 'ov cine ' + kind; E.ov.hidden = false;
    E.ov.innerHTML = '<div class="rays"></div><div class="cinebats">' + [0, 1, 2, 3, 4].map((i) => '<i style="--i:' + i + '">' + flyBatSvg() + '</i>').join('') + '</div>' +
      '<div class="card ' + kind + '">' + inner + '<p class="tap">Tap to continue</p></div>';
    return E.ov.querySelector('.card');
  }
  async function cardOut() {
    const card = E && E.ov.querySelector('.card');
    if (card) await anim(card, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.25)', opacity: 0 }], T(320), 'ease-in', 0, 'forwards');
    if (E) { E.ov.hidden = true; E.ov.innerHTML = ''; E.ov.className = 'ov'; }
  }
  async function intro() {
    await iris(true);
    if (!E) return;
    mode = 'fs'; root.classList.add('fs');
    E.fsLeft.textContent = String(M.FS_AWARD); E.mult.textContent = '×0'; E.fsTotal.textContent = '0';
    const card = cineCard('intro', '<div class="ovlogo">' + logoSvg(P + 'ci-', true) + '</div><div class="ovlol">' + useSym('lolly') + '</div>' +
      '<h2><b class="cnt">0</b>Free Spins</h2><p>Bat-Bombs worth <em>2× to 1,000×</em> drop in. When a spin stops tumbling they add up and multiply its win.</p><p class="sm">3+ Lollipops in a spin: +' + M.FS_RETRIGGER + ' spins</p>');
    snd.intro();
    const cnt = card.querySelector('.cnt');
    for (let i = 1; i <= M.FS_AWARD; i++) S.timeout(() => { if (cnt.isConnected) { cnt.textContent = String(i); snd.tick(); } }, 350 + i * 60);
    S.timeout(() => { if (!cnt.isConnected) return; snd.slam(); anim(cnt, [{ transform: 'scale(1.7)' }, { transform: 'scale(.9)', offset: 0.5 }, { transform: 'scale(1)' }], 380, 'ease-out'); shake(1); const c = centre(cnt); sparkle(c.x, c.y, '#ffd84a', 40, 1.8); }, 350 + M.FS_AWARD * 60 + 60);
    sparkle(root.clientWidth / 2, root.clientHeight / 2, '#ff9ad5', 50, 2.2);
    await waitTap(4600);
    await cardOut();
    E.iris.hidden = false;
    await iris(false);
  }
  async function outro(winFs, n, stake) {
    await iris(true);
    if (!E) return;
    const x = winFs / stake;
    const title = x >= 100 ? 'Sugar Fang Feast!' : x >= 30 ? 'What a Haul!' : winFs > 0 ? 'Sweet Haul!' : 'Sweet Dreams';
    const card = cineCard('outro', '<div class="ovlol">' + useSym('bat') + '</div><h2>' + title + '</h2><p>You won</p><output>0</output><p class="sm">Batty Bucks in <b>' + n + '</b> free spins' + (winFs > 0 ? ' · ' + Batty.fmtX(x) + ' your stake' : '') + '</p>');
    snd.outro();
    if (winFs > 0) { candyRain(x >= 30 ? 3600 : 2000); }
    mode = 'base'; root.classList.remove('fs');
    E.mult.textContent = '×0';
    rollTo(card.querySelector('output'), 0, winFs, T(1600));
    await waitTap(5200);
    await cardOut();
    E.iris.hidden = false;
    await iris(false);
  }
  async function retrigger(add, left) {
    const lol = cells.filter((c) => c && c.s === SYM.LOLLY);
    lol.forEach((c) => c.el.classList.add('trig'));
    snd.retrig(); flash(0.5); mascot('cheer', 1800); cheer(2);
    anim(E.main, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.3 }, { transform: 'scale(1)' }], T(600), 'ease-out');
    banner('<small>Lollipop retrigger!</small><b>+' + add + ' Free Spins</b>', 'retrig');
    const c0 = centre(E.banner); sparkle(c0.x, c0.y, '#2bd6b0', 36, 1.8);
    setMsg('<b>' + lol.length + '</b> Lollipops · <em>+' + add + ' free spins</em>', 'hot');
    await nap(1000);
    if (!E) return;
    await flyValue('+' + add, centre(E.banner), centre(E.fsLeft), 'spins');
    if (!E) return;
    E.fsLeft.textContent = String(left); bump(E.fsLeft.parentNode); snd.chime(9);
    await nap(500);
    hideBanner(); lol.forEach((c) => c.el.classList.remove('trig'));
  }
  function closeOv() { if (!E) return; E.ov.hidden = true; E.ov.innerHTML = ''; E.ov.className = 'ov'; }

  /* ---------- bonus buy ---------- */
  function openBuy() {
    if (busy || auto > 0 || !E) return;
    if (anteOn) { Batty.ui.toast('Switch the Fang Bet off to buy free spins.'); return; }
    const st = stakeCtl.value, price = st * M.BUY_X;
    Batty.sfx('pop');
    E.ov.className = 'ov buying'; E.ov.hidden = false; E.ov.innerHTML = '';
    const ok = h('button', { class: 'go', type: 'button', id: 'bonanza-buy-go', disabled: !Batty.wallet.canBet(price), onclick: () => { closeOv(); spin(true); } }, 'Buy for ' + fmt(price) + ' BB');
    const no = h('button', { class: 'no', type: 'button', id: 'bonanza-buy-no', onclick: () => { Batty.sfx('click'); closeOv(); } }, 'Not now');
    E.ov.append(h('div', { class: 'card buycard' }, h('div', { class: 'ovlol', html: useSym('bomb') }), h('h2', null, 'Buy Free Spins'),
      h('p', null, 'A spin with 4, 5 or 6 guaranteed Cherry-Fang Lollipops, then ' + M.FS_AWARD + ' free spins full of Bat-Bombs.'),
      h('p', { class: 'price' }, fmt(price), h('small', null, ' BB · ' + M.BUY_X + '× your stake')),
      Batty.wallet.canBet(price) ? null : h('p', { class: 'sm' }, 'Not enough Batty Bucks at this stake.'),
      h('div', { class: 'row' }, no, ok)));
  }

  /* ---------- juice ---------- */
  function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function shake(n) { if (reduce() || !root) return; root.classList.remove('shake', 'shake2', 'shake3'); void root.offsetWidth; root.classList.add(n > 2 ? 'shake3' : n > 1 ? 'shake2' : 'shake'); S.timeout(() => root && root.classList.remove('shake', 'shake2', 'shake3'), 700); }
  function flash(a) { if (!E || reduce()) return; anim(E.flash, [{ opacity: a || 0.5 }, { opacity: 0 }], 420, 'ease-out'); }
  /* Fangs reacts: cheer, tease (leans in), scared (bombs) */
  function mascot(state, ms) {
    if (!E) return;
    const m = E.mascot;
    m.classList.remove('cheer', 'tease', 'scared'); void m.offsetWidth; m.classList.add(state);
    if (m._t) S.clear(m._t);
    m._t = ms ? S.timeout(() => m.classList.remove(state), ms) : 0;
  }
  /* the world cheers: castle windows flash, the moon swells; big wins send a swarm of bats out of the castle */
  function cheer(level) {
    if (!root) return;
    root.classList.remove('cheer'); void root.offsetWidth; root.classList.add('cheer');
    if (root._ch) S.clear(root._ch);
    root._ch = S.timeout(() => root && root.classList.remove('cheer'), 2400);
    if (level >= 2 && !reduce()) swarm(7);
  }
  function swarm(n) {
    const W = root.clientWidth, H = root.clientHeight;
    for (let i = 0; i < n; i++) {
      const b = h('i', { class: 'swb', html: flyBatSvg() });
      E.scene.append(b);
      const x0 = W * 0.5 + (Math.random() - 0.5) * 60, y0 = H * 0.55, x1 = Math.random() * W, y1 = -60 - Math.random() * 80, s = 0.25 + Math.random() * 0.3;
      anim(b, [{ transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(' + s * 0.3 + ')', opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'translate(' + ((x0 + x1) / 2 + (Math.random() - 0.5) * 200) + 'px,' + (y0 * 0.5) + 'px) scale(' + s + ')', offset: 0.5 }, { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(' + s * 1.2 + ')', opacity: 0.9 }], 1600 + Math.random() * 900, 'ease-in', i * 70, 'forwards').then(() => b.remove());
    }
  }
  /* idle life on the grid: every so often a sweet shines, twinkles, blinks or jiggles */
  const IDLE = { bat: ['flap', 'blink', 'shine'], coffin: ['hop', 'shine', 'twk'], skull: ['blink', 'jaw', 'shine'], moon: ['twist', 'shine', 'twk'], ruby: ['shine', 'twk', 'wob'], amber: ['shine', 'twk', 'wob'], lime: ['shine', 'twk', 'wob'], blue: ['shine', 'twk', 'wob'], violet: ['shine', 'twk', 'wob'], lolly: ['shine', 'twk', 'wob'], bomb: ['flap', 'shine'] };
  function idleDirector() {
    if (!E || document.hidden) return;
    const n = busy ? 1 : 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const o = cells[(Math.random() * CELLS) | 0];
      if (!o || !o.el.isConnected || o.el.classList.contains('win') || o.el.classList.contains('pop')) continue;
      const opts = IDLE[KEYS[o.s]], cls = 'i-' + opts[(Math.random() * opts.length) | 0];
      if (reduce() && cls !== 'i-shine') continue;
      o.el.classList.remove(cls); void o.el.offsetWidth; o.el.classList.add(cls);
      S.timeout(() => o.el.classList.remove(cls), 1300);
    }
  }

  /* ---------- particles on our own canvas ---------- */
  function sparkle(x, y, col, n, pw) {
    if (reduce()) return;
    pw = pw || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (60 + Math.random() * 220) * pw;
      parts.push({ k: Math.random() < 0.5 ? 'star' : 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80 * pw, g: 420, life: 0, max: 0.55 + Math.random() * 0.5, r: 2 + Math.random() * 3.5, c: Math.random() < 0.35 ? '#fff' : col, rot: Math.random() * 6 });
    }
    kick();
  }
  /* a popped sweet: sugar cubes, candy shards in its colour, a soft splash ring and a few stars */
  function sugarBurst(x, y, col, k) {
    if (reduce()) return;
    const n = Math.round(10 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 90 + Math.random() * 260;
      parts.push({ k: 'cube', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 140, g: 900, life: 0, max: 0.6 + Math.random() * 0.4, r: 2.2 + Math.random() * 3.2, c: Math.random() < 0.5 ? '#fff' : col, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
    }
    for (let i = 0; i < Math.round(6 * k); i++) {
      const a = Math.random() * 6.283, s = 140 + Math.random() * 220;
      parts.push({ k: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, g: 700, life: 0, max: 0.5 + Math.random() * 0.3, r: 4 + Math.random() * 5, c: col, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18 });
    }
    parts.push({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.38, r: cw * 0.2, r1: cw * 0.75, c: col, w: 5 });
    for (let i = 0; i < Math.round(3 * k); i++) parts.push({ k: 'star', x: x + (Math.random() - 0.5) * cw * 0.6, y: y + (Math.random() - 0.5) * ch * 0.6, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, g: 60, life: 0, max: 0.5 + Math.random() * 0.3, r: 3 + Math.random() * 3, c: '#fff', rot: 0 });
    kick();
  }
  function ring(x, y, col, r1) { if (reduce()) return; parts.push({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.5, r: 6, r1: r1, c: col, w: 4 }); kick(); }
  function blast(x, y, m) {
    if (reduce()) return;
    const big = m >= 50, n = big ? 46 : 26;
    parts.push({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.55, r: 10, r1: cw * (big ? 2.6 : 1.6), c: '#ffd84a', w: big ? 10 : 6 });
    parts.push({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.7, r: 6, r1: cw * (big ? 3.4 : 2.1), c: '#ff4a8a', w: 4 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (160 + Math.random() * 380) * (big ? 1.3 : 1);
      parts.push({ k: 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 300, life: 0, max: 0.4 + Math.random() * 0.35, r: 2 + Math.random() * 2, c: ['#fff', '#ffd84a', '#ff4a8a', '#ff9ad5'][i % 4] });
    }
    for (let i = 0; i < 8; i++) parts.push({ k: 'puff', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 - 30, g: -30, life: 0, max: 0.7 + Math.random() * 0.4, r: cw * (0.18 + Math.random() * 0.14), c: Math.random() < 0.5 ? '#5a1a4a' : '#ff9ad5' });
    sparkle(x, y, '#ffd84a', big ? 26 : 12, big ? 1.6 : 1.1);
  }
  function smoke(x, y) {
    if (reduce()) return;
    for (let i = 0; i < 6; i++) parts.push({ k: 'puff', x: x + (Math.random() - 0.5) * 16, y: y - 10, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40, g: -20, life: 0, max: 0.9 + Math.random() * 0.4, r: cw * (0.1 + Math.random() * 0.08), c: '#8a7a8a' });
    kick();
  }
  function candyRain(ms) {
    if (reduce() || !root) return;
    const end = performance.now() + ms, cols = ['#ff4a8a', '#ffd84a', '#2bd6b0', '#ff6a1f', '#c065ff', '#ff9ad5'];
    const W = root.clientWidth;
    const gen = S.interval(() => {
      if (performance.now() > end || !root) return S.clear(gen);
      for (let i = 0; i < (W < 600 ? 2 : 4); i++) parts.push({ k: Math.random() < 0.6 ? 'wrap' : 'lolly', x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 200, g: 160, life: 0, max: 6, r: 8 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, rain: true });
      kick();
    }, 60);
  }
  function kick() { if (partStop || !S) return; partStop = S.loop(stepParts); }
  function stepParts(dt) {
    const W = fxW, H = fxH, c = fxCx;
    c.setTransform(fxDpr, 0, 0, fxDpr, 0, 0); c.clearRect(0, 0, W, H);
    if (parts.length > 900) parts.splice(0, parts.length - 900);
    parts = parts.filter((p) => p.life < p.max && p.y < H + 40);
    for (const p of parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g == null ? 420 : p.g) * dt; p.rot = (p.rot || 0) + (p.vr || 3) * dt;
      const f = p.life / p.max;
      c.globalAlpha = p.rain ? 1 : Math.max(0, 1 - f);
      if (p.k === 'ring') {
        c.globalAlpha = Math.max(0, 1 - f) * 0.9; c.strokeStyle = p.c; c.lineWidth = p.w * (1 - f) + 0.5;
        c.beginPath(); c.arc(p.x, p.y, p.r + (p.r1 - p.r) * (1 - Math.pow(1 - f, 3)), 0, 6.283); c.stroke(); continue;
      }
      if (p.k === 'puff') { c.globalAlpha = Math.max(0, 0.55 * (1 - f)); c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.r * (1 + f * 1.4), 0, 6.283); c.fill(); continue; }
      if (p.k === 'glow') { c.globalCompositeOperation = 'lighter'; c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.r * (1 - f * 0.6), 0, 6.283); c.fill(); c.globalCompositeOperation = 'source-over'; continue; }
      if (p.k === 'streak') { c.strokeStyle = p.c; c.lineWidth = p.r; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); c.stroke(); continue; }
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      if (p.k === 'star') { c.fillStyle = p.c; c.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? p.r * 0.4 : p.r * 1.4, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.fill(); }
      else if (p.k === 'dot') { c.fillStyle = p.c; c.fillRect(-p.r * 0.9, -p.r * 0.3, p.r * 1.8, p.r * 0.6); }
      else if (p.k === 'cube') { c.fillStyle = p.c; c.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-p.r, -p.r, p.r, p.r); }
      else if (p.k === 'shard') { c.fillStyle = p.c; c.strokeStyle = 'rgba(42,6,32,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -p.r); c.lineTo(p.r * 0.7, p.r * 0.6); c.lineTo(-p.r * 0.6, p.r * 0.4); c.closePath(); c.fill(); c.stroke(); }
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
