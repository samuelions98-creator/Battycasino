/* ===== crypt math ===== */
/* Count Batula's Crypt: pure maths. No DOM. Shared verbatim by the browser game and tools/crypt-sim.js, and ported line
   for line to lib/games/crypt.php (proved identical by tools/crypt-xcheck.js).

   THE GRID    6 reels. Reels 1 and 6 show 2 to 7 symbols, reels 2 to 5 show 2 to 6, and a horizontal TOP REEL above reels
               2 to 5 adds one more symbol to each of them, so every reel shows 2 to 7 and there are up to 7^6 = 117,649 ways.
               Each reel's height is drawn per spin; each height has its own reel strip (STRIPS[set][reel][height]).
   WAYS        A symbol pays when it lands on 3+ adjacent reels from the left. Ways = the product of how many times it
               (or a wild) shows on each of those reels. Every symbol pays independently.
   WILD        The Bat Wild lands on the top reel only and stands in for every paying symbol.
   CASCADES    Every winning symbol (and wild) shatters. Symbols above fall down, new ones fall in from the strip above, and
               the top reel slides left with new symbols entering on the right. Repeats until there is no win.
   MULTIPLIER  The win multiplier starts at x1 and goes up by 1 after every cascade. It resets each base spin; in the free
               spins it never resets.
   BLOOD MOON  The scatter (main reels only). Counted on the grid once all cascades are done. 4+ = 12 free spins, +4 for each
               extra. In the free spins 3+ = +4 spins, +4 for each extra.
   GAMBLE      Before the free spins the player may gamble the spins on the wheel for 4 more (up to 28). The winning slice is
               the value of the spins held divided by the value of the spins played for, so the gamble is fair.
   ANTE        1.25x stake: richer scatter strips, roughly double the free-spin chance.
   BUY         100x stake: replays genuine base spins until one lands 4+ Blood Moons on the first drop.
   MAX WIN     20,000x the stake per round (trigger spin + free spins). The round ends the moment it is reached.
   AMOUNTS     In UNITS: 1 unit = stake / 100 (every stake is a multiple of 20, so BB = floor(units * stake / 100)). */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).crypt = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 6, TOPN = 4, MAXH = 7, UNITS = 100;
  const MAX_WIN_X = 20000, CAP = MAX_WIN_X * UNITS;
  const ANTE_NUM = 5, ANTE_DEN = 4, BUY_X = 100;
  const FS_BASE = 12, FS_EXTRA = 4, FS_RETRIG = 4, GAMBLE_STEP = 4, GAMBLE_MAX = 28;

  /* symbols */
  const WILD = 0, SCAT = 1, COUNT = 2, BRIDE = 3, STAKE = 4, CHALICE = 5, GARLIC = 6, RUBY = 7, AMETHYST = 8, COFFIN = 9, CANDLE = 10, NSYM = 11;
  const KEYS = ['wild', 'moon', 'count', 'bride', 'stake', 'chalice', 'garlic', 'ruby', 'amethyst', 'coffin', 'candle'];
  const NAMES = ['Bat Wild', 'Blood Moon', 'Count Batula', "Batula's Bride", 'Silver Stake', 'Chalice of Blood', 'Garlic Wreath', 'Blood Ruby', 'Amethyst', 'Coffin', 'Candle'];
  /* PAY[symbol] = [3, 4, 5, 6 reels] in UNITS (hundredths of the stake) per way */
  const PAY = [
    null, null,
    [25, 50, 125, 500],    // Count Batula
    [20, 40, 75, 250],     // Bride
    [15, 30, 50, 150],     // Silver Stake
    [10, 20, 40, 100],     // Chalice
    [10, 15, 30, 75],      // Garlic
    [5, 10, 20, 50],       // Ruby
    [5, 10, 15, 40],       // Amethyst
    [5, 8, 10, 30],        // Coffin
    [5, 8, 10, 25],        // Candle
  ];

  /* reel heights: weights for 2..7 (outer reels) and 2..6 (reels 2-5, which also get a top-reel symbol) */
  const TUNE0 = (typeof process !== 'undefined' && process.env && process.env.CRYPT_TUNE) ? JSON.parse(process.env.CRYPT_TUNE) : {};
  const HEIGHTS = {
    base: { outer: TUNE0.ho || [12, 20, 24, 20, 14, 10], mid: TUNE0.hm || [14, 24, 28, 20, 14] },
    fs: { outer: TUNE0.fo || [12, 20, 24, 20, 14, 10], mid: TUNE0.fm || [14, 24, 28, 20, 14] },
  };
  HEIGHTS.ante = HEIGHTS.base;
  const heightW = (set, r) => (r === 0 || r === REELS - 1 ? HEIGHTS[set].outer : HEIGHTS[set].mid);

  /* strip compositions: COMP[set][h] = counts of [COUNT, BRIDE, STAKE, CHALICE, GARLIC, RUBY, AMETHYST, COFFIN, CANDLE] and the
     number of Blood Moons, for a reel showing h symbols. Tall reels carry fewer high symbols (they already make many ways);
     short reels carry more, so every height pulls its weight. */
  const COMP = {
    base: {
      2: [[9, 10, 11, 12, 13, 14, 15, 16, 17], 8],
      3: [[8, 9, 10, 12, 13, 14, 15, 17, 18], 5],
      4: [[7, 8, 10, 11, 13, 15, 16, 17, 19], 4],
      5: [[6, 7, 9, 11, 12, 15, 16, 18, 20], 3],
      6: [[5, 7, 8, 10, 12, 15, 17, 18, 21], 3],
      7: [[5, 6, 8, 10, 12, 15, 17, 19, 21], 2],
    },
    ante: null, fs: null,
  };
  const TUNE = (typeof process !== 'undefined' && process.env && process.env.CRYPT_TUNE) ? JSON.parse(process.env.CRYPT_TUNE) : {};
  const TM = { base: TUNE.mb || [1, 1, 1, 1, 1, 1, 1, 1, 1], fs: TUNE.mf || [1, 1, 1, 1, 1, 1, 1, 1, 1] };
  const SC = { base: TUNE.sb || [0, 0, 8, 5, 4, 3, 3, 2], ante: TUNE.sa || [0, 0, 14, 9, 7, 6, 5, 4], fs: TUNE.sf || [0, 0, 6, 4, 3, 3, 2, 2] };
  const raw = COMP.base; COMP.base = {}; COMP.ante = {}; COMP.fs = {};
  for (let h = 2; h <= MAXH; h++) {
    const b = raw[h][0].map((x, i) => Math.max(1, Math.round(x * TM.base[i]))), f = raw[h][0].map((x, i) => Math.max(1, Math.round(x * TM.fs[i])));
    COMP.base[h] = [b, SC.base[h]]; COMP.ante[h] = [b, SC.ante[h]]; COMP.fs[h] = [f, SC.fs[h]];
  }
  /* the top reel: counts of [WILD, COUNT .. CANDLE] */
  const TOPCOMP = { base: TUNE.tb || [8, 6, 7, 8, 9, 10, 12, 12, 13, 13], ante: null, fs: TUNE.tf || [10, 6, 7, 8, 9, 10, 12, 12, 13, 13] };
  TOPCOMP.ante = TOPCOMP.base;
  const SETS = ['base', 'ante', 'fs'];
  /* stack sizes on the main strips: weights for blocks of 1, 2, 3 */
  const STACK = { base: TUNE.kb || [15, 40, 45], ante: TUNE.kb || [15, 40, 45], fs: TUNE.kf || [10, 30, 60] };

  /* gamble: chance to win the step from n spins to n + 4 (value(n) / value(n + 4), measured by tools/crypt-sim.js) */
  const GAMBLE_P = { 12: 0.7, 16: 0.72, 20: 0.74, 24: 0.76 };
  /* expected value of n free spins in units (for the server's live balancing estimate) */
  const FS_EV = { 12: 9000, 16: 12500, 20: 16000, 24: 20000, 28: 24000 };

  /* ---------- strips: built once from COMP with a fixed seeded shuffle ---------- */
  function mulberry(seed) {
    let s = seed | 0;
    return function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* Symbols are laid in short stacks (blocks of 1 to 3), and no two neighbouring blocks share a symbol, the way real
     cascade reels are cut: a window shows a few symbols several times rather than many symbols once. */
  function buildStrip(syms, counts, nScat, stack, seed) {
    const rnd = mulberry(seed), blocks = [];
    for (let i = 0; i < syms.length; i++) {
      let left = counts[i];
      while (left > 0) { const b = Math.min(left, 1 + pickIndex(rnd, stack)); blocks.push([syms[i], b]); left -= b; }
    }
    for (let i = blocks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = blocks[i]; blocks[i] = blocks[j]; blocks[j] = t; }
    for (let pass = 0; pass < 80; pass++) {
      let bad = false;
      for (let i = 0; i < blocks.length; i++) {
        const n = (i + 1) % blocks.length;
        if (blocks[i][0] === blocks[n][0]) { bad = true; const k = (n + 1 + Math.floor(rnd() * (blocks.length - 3))) % blocks.length; const t = blocks[n]; blocks[n] = blocks[k]; blocks[k] = t; }
      }
      if (!bad) break;
    }
    const a = [];
    for (let i = 0; i < blocks.length; i++) for (let k = 0; k < blocks[i][1]; k++) a.push(blocks[i][0]);
    /* Blood Moons spread evenly, so a fresh window never shows two on one reel */
    if (nScat > 0) {
      const L = a.length + nScat, out = []; let j = 0, src = 0;
      for (let p = 0; p < L; p++) {
        if (j < nScat && p === Math.floor((2 * j + 1) * L / (2 * nScat))) { out.push(SCAT); j++; }
        else out.push(a[src++]);
      }
      return out;
    }
    return a;
  }
  function buildStrips() {
    const S = {};
    const MAIN = [COUNT, BRIDE, STAKE, CHALICE, GARLIC, RUBY, AMETHYST, COFFIN, CANDLE];
    const TOPS = [WILD, COUNT, BRIDE, STAKE, CHALICE, GARLIC, RUBY, AMETHYST, COFFIN, CANDLE];
    for (let si = 0; si < SETS.length; si++) {
      const set = SETS[si], main = [];
      for (let r = 0; r < REELS; r++) {
        const byH = [];
        for (let h = 0; h <= MAXH; h++) {
          if (h < 2) { byH.push(null); continue; }
          const c = COMP[set][h];
          byH.push(buildStrip(MAIN, c[0], c[1], STACK[set], 7919 * (r + 1) + 104729 * h + 1299709 * (si + 1)));
        }
        main.push(byH);
      }
      S[set] = { main: main, top: buildStrip(TOPS, TOPCOMP[set], 0, [1], 31337 + 977 * si) };
    }
    return S;
  }
  const STRIPS = buildStrips();

  /* ---------- helpers ---------- */
  function pickIndex(rng, w) {
    let total = 0; for (let i = 0; i < w.length; i++) total += w[i];
    let r = rng() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return w.length - 1;
  }
  const mod = (a, n) => ((a % n) + n) % n;

  /* A fresh drop: heights, stops and the visible grid. cols[r] top to bottom; top[k] sits above reel k + 1. */
  function draw(rng, set) {
    const S = STRIPS[set], hs = [], stops = [], cols = [];
    for (let r = 0; r < REELS; r++) hs.push(2 + pickIndex(rng, heightW(set, r)));
    for (let r = 0; r < REELS; r++) {
      const st = S.main[r][hs[r]], L = st.length, p = Math.floor(rng() * L), c = [];
      for (let k = 0; k < hs[r]; k++) c.push(st[(p + k) % L]);
      stops.push(p); cols.push(c);
    }
    const T = S.top, tp = Math.floor(rng() * T.length), top = [];
    for (let k = 0; k < TOPN; k++) top.push(T[(tp + k) % T.length]);
    return { set: set, hs: hs, stops: stops, tstop: tp, cols: cols, top: top };
  }
  function countScat(cols) { let n = 0; for (let r = 0; r < REELS; r++) for (let k = 0; k < cols[r].length; k++) if (cols[r][k] === SCAT) n++; return n; }
  function ways(cols) { let w = 1; for (let r = 0; r < REELS; r++) w *= cols[r].length + (r >= 1 && r <= TOPN ? 1 : 0); return w; }

  /* Ways wins on a grid: [{s, n, w (ways), p (units)}] */
  function evaluate(cols, top) {
    const wins = [];
    for (let s = COUNT; s < NSYM; s++) {
      let w = 1, n = 0;
      for (let r = 0; r < REELS; r++) {
        let c = 0; const col = cols[r];
        for (let k = 0; k < col.length; k++) if (col[k] === s) c++;
        if (r >= 1 && r <= TOPN) { const t = top[r - 1]; if (t === s || t === WILD) c++; }
        if (!c) break;
        w *= c; n++;
      }
      if (n >= 3) wins.push({ s: s, n: n, w: w, p: PAY[s][n - 3] * w });
    }
    return wins;
  }

  /* One spin with all its cascades. mult: the multiplier going in. budget: units still payable under the cap.
     Returns {hs, steps:[{c, t, wins, hit, th, m, pay}], scat, win, mult (after), capped}. Step k shows grid k; when it
     has wins, the symbols in hit (per reel, row indexes) and th (top positions) shatter and grid k + 1 follows. */
  function playDrop(d, mult, budget) {
    const S = STRIPS[d.set], cols = d.cols.map((c) => c.slice()), top = d.top.slice();
    const ptr = d.stops.slice(); let tnext = d.tstop + TOPN;
    const steps = []; let win = 0, capped = false;
    for (;;) {
      const wins = evaluate(cols, top);
      const step = { c: cols.map((c) => c.slice()), t: top.slice(), wins: wins, hit: null, th: null, m: mult, pay: 0 };
      steps.push(step);
      if (!wins.length) break;
      let units = 0; for (let i = 0; i < wins.length; i++) units += wins[i].p;
      let pay = units * mult;
      if (win + pay >= budget) { pay = budget - win; capped = true; }
      step.pay = pay; win += pay;
      /* mark every symbol in a winning way */
      const hit = [], th = [];
      for (let r = 0; r < REELS; r++) {
        const rows = [];
        for (let k = 0; k < cols[r].length; k++) { const v = cols[r][k]; for (let i = 0; i < wins.length; i++) if (r < wins[i].n && v === wins[i].s) { rows.push(k); break; } }
        hit.push(rows);
      }
      for (let k = 0; k < TOPN; k++) { const v = top[k], r = k + 1; for (let i = 0; i < wins.length; i++) if (r < wins[i].n && (v === wins[i].s || v === WILD)) { th.push(k); break; } }
      step.hit = hit; step.th = th;
      if (capped) break;
      /* shatter, fall and refill */
      for (let r = 0; r < REELS; r++) {
        const rows = hit[r]; if (!rows.length) continue;
        const st = S.main[r][cols[r].length], L = st.length, keep = [];
        for (let k = 0; k < cols[r].length; k++) if (rows.indexOf(k) < 0) keep.push(cols[r][k]);
        const n = rows.length, fresh = [];
        for (let i = n; i >= 1; i--) fresh.push(st[mod(ptr[r] - i, L)]);
        ptr[r] = mod(ptr[r] - n, L);
        cols[r] = fresh.concat(keep);
      }
      if (th.length) {
        const T = S.top, keep = [];
        for (let k = 0; k < TOPN; k++) if (th.indexOf(k) < 0) keep.push(top[k]);
        while (keep.length < TOPN) { keep.push(T[tnext % T.length]); tnext++; }
        for (let k = 0; k < TOPN; k++) top[k] = keep[k];
      }
      mult++;
    }
    return { hs: d.hs, steps: steps, scat: countScat(cols), win: win, mult: mult, capped: capped };
  }

  const fsAward = (n) => (n >= 4 ? FS_BASE + FS_EXTRA * (n - 4) : 0);
  const fsRetrig = (n) => (n >= 3 ? FS_RETRIG * (n - 2) : 0);

  /* A base-game spin (ante: bool). Returns the drop plus fs (spins won, 0 if none). */
  function spin(rng, ante) {
    const o = playDrop(draw(rng, ante ? 'ante' : 'base'), 1, CAP);
    o.fs = o.capped ? 0 : fsAward(o.scat);
    o.bought = false;
    return o;
  }
  /* Bonus buy: genuine base drops, replayed until one lands 4+ Blood Moons straight away. */
  function buy(rng) {
    let d;
    for (let i = 0; ; i++) { d = draw(rng, 'base'); if (countScat(d.cols) >= 4 || i >= 200000) break; }
    if (countScat(d.cols) < 4) { for (let r = 0; r < 4; r++) d.cols[r][0] = SCAT; }
    const o = playDrop(d, 1, CAP);
    o.fs = o.capped ? 0 : fsAward(o.scat);
    o.bought = true;
    return o;
  }
  /* The gamble wheel: true = the spins go up by 4, false = the free spins are lost. */
  function gambleP(n) { return GAMBLE_P[n] || 0; }
  function canGamble(n) { return n > 0 && n < GAMBLE_MAX && GAMBLE_P[n] > 0; }
  function gamble(rng, n) { return rng() < gambleP(n); }

  /* The free spins. carried: units already won this round (the trigger spin). */
  function freeSpins(rng, n, carried) {
    let left = n, mult = 1, total = 0, capped = false, maxMult = 1, played = 0, retrigs = 0;
    const spins = [];
    while (left > 0 && !capped) {
      left--; played++;
      const m0 = mult;
      const o = playDrop(draw(rng, 'fs'), mult, CAP - carried - total);
      mult = o.mult; if (mult > maxMult) maxMult = mult;
      total += o.win; capped = o.capped;
      const add = capped ? 0 : fsRetrig(o.scat);
      if (add) { left += add; retrigs++; }
      spins.push({ hs: o.hs, steps: o.steps, scat: o.scat, win: o.win, m0: m0, m1: mult, add: add, left: capped ? 0 : left, total: total });
    }
    return { start: n, spins: spins, total: total, capped: capped, maxMult: maxMult, played: played, retrigs: retrigs };
  }

  /* A whole round for simulations and the cross-check: policy(n, k) -> true to gamble at n spins (k-th gamble). */
  function round(rng, opt) {
    opt = opt || {};
    const base = opt.buy ? buy(rng) : spin(rng, !!opt.ante);
    const out = { base: base, gambles: [], fs: null, win: base.win };
    let n = base.fs;
    if (n) {
      let k = 0;
      while (canGamble(n) && opt.policy && opt.policy(n, k)) { const ok = gamble(rng, n); out.gambles.push(ok ? 1 : 0); k++; if (!ok) { n = 0; break; } n += GAMBLE_STEP; }
      if (n) { out.fs = freeSpins(rng, n, base.win); out.win += out.fs.total; }
    }
    out.spins = n;
    return out;
  }

  return {
    REELS: REELS, TOPN: TOPN, MAXH: MAXH, UNITS: UNITS, MAX_WIN_X: MAX_WIN_X, CAP: CAP, ANTE_NUM: ANTE_NUM, ANTE_DEN: ANTE_DEN, BUY_X: BUY_X,
    FS_BASE: FS_BASE, FS_EXTRA: FS_EXTRA, FS_RETRIG: FS_RETRIG, GAMBLE_STEP: GAMBLE_STEP, GAMBLE_MAX: GAMBLE_MAX, GAMBLE_P: GAMBLE_P, FS_EV: FS_EV,
    SYM: { WILD: WILD, SCAT: SCAT, COUNT: COUNT, BRIDE: BRIDE, STAKE: STAKE, CHALICE: CHALICE, GARLIC: GARLIC, RUBY: RUBY, AMETHYST: AMETHYST, COFFIN: COFFIN, CANDLE: CANDLE }, NSYM: NSYM,
    KEYS: KEYS, NAMES: NAMES, PAY: PAY, HEIGHTS: HEIGHTS, COMP: COMP, TOPCOMP: TOPCOMP, STRIPS: STRIPS,
    pickIndex: pickIndex, draw: draw, evaluate: evaluate, playDrop: playDrop, ways: ways, countScat: countScat,
    fsAward: fsAward, fsRetrig: fsRetrig, spin: spin, buy: buy, gambleP: gambleP, canGamble: canGamble, gamble: gamble, freeSpins: freeSpins, round: round,
    mulberry: mulberry,
  };
});
