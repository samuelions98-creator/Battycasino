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
               the value of the spins held divided by the value of the spins played for (GAMBLE_P), so the gamble is fair.
   ANTE        1.25x stake: more Blood Moons on the strips (and a top reel of its own), about twice the free-spin chance.
   BUY         56x stake: replays genuine base spins until one lands 4+ Blood Moons on the first drop.
   MAX WIN     10,000x the stake per round (trigger spin + free spins). The round ends the moment it is reached.
   MEASURED    (node tools/crypt-sim.js --spins 20000000 --buys 2000000 --fs 400000 --seed 4, release 11)
               Base game 96.64% with each free-spin award at its measured value (96.70% as played; 99% band 96.13-97.27%)
               over 20,000,000 spins: base drops 66.6%, free spins 30.0%. Hit rate 1 in 2.85 (35.1%), 0.45 cascades per spin,
               free spins 1 in 177 (12 spins are worth 50.8x on average), sd 9.9x. 1,000x+ 1 in 101,500; biggest win 3,931x.
               Ante 96.86% (96.86% exact, 97.23% as played over 20M; free spins 1 in 93). Bonus buy at 56x 96.53% exact /
               96.81% as played over 2,000,000 buys. Always gambling to 28 spins: 96.50% over 10M (fair, as designed).
               The 10,000x cap: 3 times in 2,000,000 bought bonuses (about 1 in 670,000 bonuses, so roughly 1 in 120 million
               base spins). Tuning from the saved draft (105% base): pays x0.8 (candle 6-reel 21), fs top-reel wilds 21/111,
               base top reel 65/785 wilds, ante scatters [9,6,5,4,3,2], cap 20,000x -> 10,000x, buy 100x -> 56x.
   AMOUNTS     In UNITS: 1 unit = stake / 100 (every stake is a multiple of 20, so BB = floor(units * stake / 100)). */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).crypt = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 6, TOPN = 4, MAXH = 7, UNITS = 100;
  const MAX_WIN_X = 10000, CAP = MAX_WIN_X * UNITS;
  const ANTE_NUM = 5, ANTE_DEN = 4, BUY_X = 56;
  const FS_BASE = 12, FS_EXTRA = 4, FS_RETRIG = 4, GAMBLE_STEP = 4, GAMBLE_MAX = 28;

  /* symbols */
  const WILD = 0, SCAT = 1, COUNT = 2, BRIDE = 3, STAKE = 4, CHALICE = 5, GARLIC = 6, RUBY = 7, AMETHYST = 8, COFFIN = 9, CANDLE = 10, NSYM = 11;
  const KEYS = ['wild', 'moon', 'count', 'bride', 'stake', 'chalice', 'garlic', 'ruby', 'amethyst', 'coffin', 'candle'];
  const NAMES = ['Bat Wild', 'Blood Moon', 'Count Batula', "Batula's Bride", 'Silver Stake', 'Chalice of Blood', 'Garlic Wreath', 'Blood Ruby', 'Amethyst', 'Coffin', 'Candle'];
  /* PAY[symbol] = [3, 4, 5, 6 reels] in UNITS (hundredths of the stake) per way */
  const PAY = [
    null, null,
    [20, 40, 100, 400],
    [16, 32, 60, 200],
    [12, 24, 40, 120],
    [8, 16, 32, 80],
    [8, 12, 24, 60],
    [4, 8, 16, 40],
    [4, 8, 12, 32],
    [4, 6, 8, 24],
    [4, 6, 8, 21],
  ];

  /* reel heights: weights for 2..7 (outer reels) and 2..6 (reels 2-5, which also get a top-reel symbol). The same in every mode. */
  const HEIGHT_OUTER = [12, 20, 24, 20, 14, 10], HEIGHT_MID = [14, 24, 28, 20, 14];
  const heightW = (r) => (r === 0 || r === REELS - 1 ? HEIGHT_OUTER : HEIGHT_MID);

  /* strip compositions: COMP[h] = counts of [COUNT, BRIDE, STAKE, CHALICE, GARLIC, RUBY, AMETHYST, COFFIN, CANDLE] on the
     strip of a reel showing h symbols. Tall reels carry fewer high symbols (they already make many ways); short reels carry
     more, so every height pulls its weight. The same pay symbols in every mode. */
  const COMP = {
    2: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    3: [8, 9, 10, 12, 13, 14, 15, 17, 18],
    4: [7, 8, 10, 11, 13, 15, 16, 17, 19],
    5: [6, 7, 9, 11, 12, 15, 16, 18, 20],
    6: [5, 7, 8, 10, 12, 15, 17, 18, 21],
    7: [5, 6, 8, 10, 12, 15, 17, 19, 21],
  };
  /* Blood Moons on each strip, by reel height (index = height). The ante strips carry more of them. */
  const SCATN = { base: [0, 0, 8, 5, 4, 3, 3, 2], ante: [0, 0, 9, 6, 5, 4, 3, 2], fs: [0, 0, 6, 4, 3, 3, 2, 2] };
  /* the top reel: counts of [WILD, COUNT .. CANDLE]. The free spins carry far more wilds. */
  const TOPCOMP = { base: [65, 48, 56, 64, 72, 80, 96, 96, 104, 104], ante: [8, 6, 7, 8, 9, 10, 12, 12, 13, 13], fs: [21, 6, 7, 8, 9, 10, 12, 13, 13, 13] };
  const SETS = ['base', 'ante', 'fs'];
  /* stack sizes on the main strips: weights for blocks of 1, 2, 3 */
  const STACK = { base: [15, 40, 45], ante: [15, 40, 45], fs: [10, 30, 60] };

  /* gamble: chance to win the step from n spins to n + 4 = value(n) / value(n + 4), measured by tools/crypt-sim.js */
  const GAMBLE_P = { 12: 0.6017, 16: 0.6698, 20: 0.7190, 24: 0.7495 };
  /* expected value of n free spins in units (measured; used by the server's live balancing to value an award) */
  const FS_EV = { 12: 5085, 16: 8452, 20: 12618, 24: 17549, 28: 23414 };

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
          byH.push(buildStrip(MAIN, COMP[h], SCATN[set][h], STACK[set], 7919 * (r + 1) + 104729 * h + 1299709 * (si + 1)));
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
    for (let r = 0; r < REELS; r++) hs.push(2 + pickIndex(rng, heightW(r)));
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

  /* Dev and test helper: a spin whose outcome satisfies pred (draws until it does). */
  function spinUntil(rng, pred, ante, tries) { for (let i = 0; i < (tries || 3000000); i++) { const o = spin(rng, ante); if (pred(o)) return o; } return spin(rng, ante); }

  return {
    REELS: REELS, TOPN: TOPN, MAXH: MAXH, UNITS: UNITS, MAX_WIN_X: MAX_WIN_X, CAP: CAP, ANTE_NUM: ANTE_NUM, ANTE_DEN: ANTE_DEN, BUY_X: BUY_X,
    FS_BASE: FS_BASE, FS_EXTRA: FS_EXTRA, FS_RETRIG: FS_RETRIG, GAMBLE_STEP: GAMBLE_STEP, GAMBLE_MAX: GAMBLE_MAX, GAMBLE_P: GAMBLE_P, FS_EV: FS_EV,
    SYM: { WILD: WILD, SCAT: SCAT, COUNT: COUNT, BRIDE: BRIDE, STAKE: STAKE, CHALICE: CHALICE, GARLIC: GARLIC, RUBY: RUBY, AMETHYST: AMETHYST, COFFIN: COFFIN, CANDLE: CANDLE }, NSYM: NSYM,
    KEYS: KEYS, NAMES: NAMES, PAY: PAY, HEIGHT_OUTER: HEIGHT_OUTER, HEIGHT_MID: HEIGHT_MID, COMP: COMP, SCATN: SCATN, TOPCOMP: TOPCOMP, STACK: STACK, STRIPS: STRIPS,
    pickIndex: pickIndex, draw: draw, evaluate: evaluate, playDrop: playDrop, ways: ways, countScat: countScat,
    fsAward: fsAward, fsRetrig: fsRetrig, spin: spin, spinUntil: spinUntil, buy: buy, gambleP: gambleP, canGamble: canGamble, gamble: gamble, freeSpins: freeSpins, round: round,
    mulberry: mulberry,
  };
});
/* ===== crypt ===== */
/* Count Batula's Crypt: presentation only. Every outcome comes from the maths above: practice mode runs it here, online mode
   asks lib/games/crypt.php (the same code). A spin settles in one request; free spins are a held round: the gamble wheel
   and the free spins themselves are drawn on the server only after the player chooses.
   Layout: .cr-bg (vaulted crypt, moon window, candelabra, coffin, fog, bats) | .cr-main = head (title or the free-spin
   HUD), the reel frame (.cr-frame: ways and multiplier plaques, the top reel, six variable-height reels), message, controls. */
(function () {
  'use strict';
  const B = Batty, h = B.h, M = BattyMath.crypt, ID = 'crypt', fmt = B.fmt;
  const SY = M.SYM, REELS = M.REELS, TOPN = M.TOPN, KEY = M.KEYS, NAME = M.NAMES;
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isHigh = (s) => s >= SY.COUNT && s <= SY.STAKE;
  let G = null;

  /* ---------- sound: organ, church bell, shattering glass, heartbeat and bats; all synthesised ---------- */
  const au = B.audio;
  const SND = {
    spin() { au.noise({ d: 0.4, v: 0.07, lp: 700, f2: 2400 }); au.tone({ f: 98, f2: 62, d: 0.35, type: 'sine', v: 0.12 }); },
    stop(i) { au.tone({ f: 120 + i * 9, f2: 48, d: 0.14, type: 'sine', v: 0.32 }); au.noise({ d: 0.06, v: 0.12, lp: 900 }); au.noise({ d: 0.03, v: 0.05, hp: 3200, t: 0.03 }); },
    top() { au.noise({ d: 0.12, v: 0.08, hp: 1400, f2: 300 }); au.tone({ f: 330, f2: 180, d: 0.1, type: 'triangle', v: 0.1 }); },
    moon(n) { au.tone({ f: 392 + n * 58, f2: 784 + n * 116, d: 0.35, type: 'sine', v: 0.14 }); au.tone({ f: 1175 + n * 90, d: 0.25, type: 'triangle', v: 0.05, t: 0.06 }); },
    heart() { au.tone({ f: 70, f2: 40, d: 0.14, type: 'sine', v: 0.4 }); au.tone({ f: 64, f2: 36, d: 0.16, type: 'sine', v: 0.32, t: 0.22 }); },
    antic(k) { au.tone({ f: 180 + k * 70, f2: 320 + k * 120, d: 0.8, type: 'sawtooth', v: 0.035 }); SND.heart(); },
    win(n) { au.seq(n > 2 ? [294, 349, 440, 587, 440, 698] : [294, 349, 440, 587], { step: 0.07, type: 'triangle', v: 0.15 }); },
    shatter(n) { au.noise({ d: 0.35, v: 0.16 + Math.min(0.1, n * 0.01), hp: 2600, f2: 9000 }); for (let i = 0; i < 4; i++) au.tone({ f: 2400 + Math.random() * 2200, d: 0.08, type: 'triangle', v: 0.05, t: 0.02 + i * 0.035 }); },
    fall() { au.noise({ d: 0.22, v: 0.08, lp: 600, f2: 160 }); },
    mult(m) { au.tone({ f: 440 + Math.min(m, 30) * 22, f2: 880 + Math.min(m, 30) * 44, d: 0.18, type: 'square', v: 0.06 }); au.tone({ f: 1320, d: 0.12, type: 'sine', v: 0.06, t: 0.08 }); },
    squeak() { au.tone({ f: 2600, f2: 3600, d: 0.06, type: 'sine', v: 0.06 }); au.tone({ f: 3000, f2: 2200, d: 0.07, type: 'sine', v: 0.05, t: 0.08 }); },
    organ() { /* a minor-key organ swell: D minor, then the dominant */
      [[147, 0], [220, 0], [294, 0], [349, 0], [139, 0.55], [220, 0.55], [277, 0.55], [330, 0.55]].forEach(([f, t]) => { au.tone({ f, d: 0.9, type: 'sawtooth', v: 0.03, a: 0.12, t }); au.tone({ f: f * 2, d: 0.9, type: 'sine', v: 0.03, a: 0.12, t }); });
    },
    bell() { [0, 0.9].forEach((t) => { au.tone({ f: 196, d: 2.2, type: 'sine', v: 0.16, t }); au.tone({ f: 392 * 1.2, d: 1.6, type: 'sine', v: 0.05, t }); au.tone({ f: 523, d: 1.2, type: 'triangle', v: 0.04, t }); }); },
    creak() { au.tone({ f: 90, f2: 160, d: 0.7, type: 'sawtooth', v: 0.05 }); au.noise({ d: 0.6, v: 0.04, lp: 500 }); },
    wheel() { au.tone({ f: 1800, d: 0.02, type: 'square', v: 0.04 }); },
    gwin() { au.seq([587, 740, 880, 1175], { step: 0.08, type: 'triangle', v: 0.16 }); },
    glose() { au.tone({ f: 196, f2: 98, d: 0.7, type: 'sawtooth', v: 0.09 }); au.noise({ d: 0.6, v: 0.08, lp: 400 }); },
    retrig() { au.seq([440, 554, 659, 880, 1109], { step: 0.06, type: 'square', v: 0.07 }); B.sfx('ding'); },
    tick() { au.tone({ f: 1500, d: 0.02, type: 'square', v: 0.03 }); },
    click() { B.sfx('click'); },
    pop() { B.sfx('pop'); },
    bonus() { B.sfx('bonus'); },
    thunder() { B.sfx('thunder'); },
  };
  const snd = (n, a) => { try { SND[n](a); } catch (e) { /* sound is optional */ } };

  /* ---------- art: hand-built SVG, shared gradients ---------- */
  const DEFS_IN =
    '<linearGradient id="cr-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c0"/><stop offset=".35" stop-color="#f2c14e"/><stop offset=".72" stop-color="#b8780e"/><stop offset="1" stop-color="#5e3200"/></linearGradient>' +
    '<linearGradient id="cr-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#c9d1e6"/><stop offset=".7" stop-color="#7c86a6"/><stop offset="1" stop-color="#2e3450"/></linearGradient>' +
    '<radialGradient id="cr-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#8f7fb4"/><stop offset=".6" stop-color="#4b3a6e"/><stop offset="1" stop-color="#1d1330"/></radialGradient>' +
    '<radialGradient id="cr-fur2" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#e4d4f2"/><stop offset=".6" stop-color="#a58bc4"/><stop offset="1" stop-color="#4c3866"/></radialGradient>' +
    '<linearGradient id="cr-wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3f86"/><stop offset="1" stop-color="#1a0f2c"/></linearGradient>' +
    '<linearGradient id="cr-cape" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1830"/><stop offset="1" stop-color="#07030c"/></linearGradient>' +
    '<linearGradient id="cr-lining" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a6a"/><stop offset=".5" stop-color="#b0102a"/><stop offset="1" stop-color="#4a0412"/></linearGradient>' +
    '<radialGradient id="cr-moon" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#ffd0b0"/><stop offset=".35" stop-color="#ff5a3a"/><stop offset=".8" stop-color="#b0101e"/><stop offset="1" stop-color="#4a0010"/></radialGradient>' +
    '<radialGradient id="cr-halo" cx=".5" cy=".5" r=".5"><stop offset=".5" stop-color="#ff3a2a" stop-opacity=".7"/><stop offset="1" stop-color="#ff3a2a" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="cr-ruby" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc0c8"/><stop offset=".35" stop-color="#ff2a4a"/><stop offset=".75" stop-color="#a00020"/><stop offset="1" stop-color="#40000c"/></linearGradient>' +
    '<linearGradient id="cr-ame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2d8ff"/><stop offset=".35" stop-color="#b064ff"/><stop offset=".75" stop-color="#5a1aa8"/><stop offset="1" stop-color="#22074a"/></linearGradient>' +
    '<linearGradient id="cr-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1a0c"/><stop offset=".3" stop-color="#7a3e1c"/><stop offset=".55" stop-color="#5a2a12"/><stop offset="1" stop-color="#2a1006"/></linearGradient>' +
    '<linearGradient id="cr-stake" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a3216"/><stop offset=".45" stop-color="#b07a44"/><stop offset="1" stop-color="#4a2410"/></linearGradient>' +
    '<linearGradient id="cr-wax" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc2a8"/><stop offset=".35" stop-color="#fff8e8"/><stop offset=".7" stop-color="#e8dcc4"/><stop offset="1" stop-color="#a8987a"/></linearGradient>' +
    '<radialGradient id="cr-flame" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fff07a"/><stop offset=".8" stop-color="#ff8a10"/><stop offset="1" stop-color="#ff3a00" stop-opacity=".6"/></radialGradient>' +
    '<radialGradient id="cr-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".85"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="cr-blood" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ff6a7a"/><stop offset=".6" stop-color="#b00a24"/><stop offset="1" stop-color="#4a0010"/></radialGradient>' +
    '<radialGradient id="cr-garlic" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#efe6d2"/><stop offset="1" stop-color="#a8977a"/></radialGradient>' +
    '<linearGradient id="cr-leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ee06a"/><stop offset="1" stop-color="#2a6a1a"/></linearGradient>';
  const DEFS = '<svg class="cr-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + DEFS_IN + '</defs></svg>';

  /* the bat head both characters share */
  const ears = (fill) => '<path d="M28 46 L20 14 L44 34Z M72 46 L80 14 L56 34Z" fill="' + fill + '" stroke="#0e0716" stroke-width="2.5" stroke-linejoin="round"/><path d="M29 41 L25 22 L39 34Z M71 41 L75 22 L61 34Z" fill="#d07aa6" opacity=".5"/>';
  const eyes = (iris, pupil) => '<g class="cr-eyes"><ellipse cx="41" cy="50" rx="5.5" ry="6" fill="' + iris + '"/><ellipse cx="59" cy="50" rx="5.5" ry="6" fill="' + iris + '"/><circle cx="42" cy="51" r="2.4" fill="' + pupil + '"/><circle cx="60" cy="51" r="2.4" fill="' + pupil + '"/><circle cx="40" cy="48.5" r="1.3" fill="#fff"/><circle cx="58" cy="48.5" r="1.3" fill="#fff"/></g>';
  const SYM_IN = [
    /* 0 Bat Wild: a bat with its wings spread over a gold plaque */
    '<circle cx="50" cy="44" r="40" fill="url(#cr-halo)" class="cr-pulse"/>' +
    '<g class="cr-wings"><path d="M46 46 C34 20 16 22 2 12 C8 28 4 40 10 52 C18 44 28 48 32 58Z M54 46 C66 20 84 22 98 12 C92 28 96 40 90 52 C82 44 72 48 68 58Z" fill="url(#cr-wing)" stroke="#0e0716" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M44 44 C34 30 22 28 12 22 M56 44 C66 30 78 28 88 22" fill="none" stroke="#8a6ac0" stroke-width="1.5" opacity=".7"/></g>' +
    ears('url(#cr-fur)') + '<ellipse cx="50" cy="48" rx="18" ry="17" fill="url(#cr-fur)" stroke="#0e0716" stroke-width="2.5"/>' + eyes('#ffe066', '#2a0a0a') +
    '<path d="M44 58 l2.5 6 l2.5 -6Z M51 58 l2.5 6 l2.5 -6Z" fill="#fff" stroke="#14060c" stroke-width=".8"/>' +
    '<rect x="10" y="68" width="80" height="22" rx="6" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2.5"/><rect x="14" y="71" width="72" height="4" rx="2" fill="#fff" opacity=".35"/>' +
    '<text x="50" y="86" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="17" letter-spacing="1.5" fill="#3a0612">WILD</text>',
    /* 1 Blood Moon: the scatter */
    '<circle cx="50" cy="50" r="48" fill="url(#cr-halo)" class="cr-pulse"/>' +
    '<g class="cr-rays">' + Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return '<path d="M' + (50 + Math.cos(a) * 36).toFixed(1) + ' ' + (50 + Math.sin(a) * 36).toFixed(1) + ' L' + (50 + Math.cos(a + 0.09) * 47).toFixed(1) + ' ' + (50 + Math.sin(a + 0.09) * 47).toFixed(1) + ' L' + (50 + Math.cos(a - 0.09) * 47).toFixed(1) + ' ' + (50 + Math.sin(a - 0.09) * 47).toFixed(1) + 'Z" fill="#ff7a4a" opacity=".55"/>'; }).join('') + '</g>' +
    '<circle cx="50" cy="50" r="34" fill="url(#cr-moon)" stroke="#5a0010" stroke-width="2"/>' +
    '<circle cx="38" cy="40" r="6" fill="#8a0a1a" opacity=".45"/><circle cx="60" cy="58" r="8" fill="#8a0a1a" opacity=".4"/><circle cx="58" cy="34" r="3.5" fill="#8a0a1a" opacity=".45"/><circle cx="40" cy="62" r="3" fill="#8a0a1a" opacity=".45"/>' +
    '<path d="M50 52 C45 44 37 44 30 40 C33 46 32 50 34 54 C38 51 42 52 44 56 C46 54 48 54 50 56 C52 54 54 54 56 56 C58 52 62 51 66 54 C68 50 67 46 70 40 C63 44 55 44 50 52Z" fill="#1a0006"/>' +
    '<path d="M26 40 A26 26 0 0 1 42 22" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="16" y="80" width="68" height="15" rx="5" fill="#2a0010" stroke="url(#cr-gold)" stroke-width="2"/><text x="50" y="91.5" text-anchor="middle" font-family="Cinzel,serif" font-weight="900" font-size="10" letter-spacing="1.2" fill="#ffd0a0">SCATTER</text>',
    /* 2 Count Batula */
    '<path d="M6 98 L12 44 L34 60 L50 70 L66 60 L88 44 L94 98Z" fill="url(#cr-cape)" stroke="#000" stroke-width="2"/>' +
    '<path d="M12 44 L30 66 L44 72 L30 60Z M88 44 L70 66 L56 72 L70 60Z" fill="url(#cr-lining)"/>' +
    ears('url(#cr-fur)') +
    '<ellipse cx="50" cy="52" rx="21" ry="20" fill="url(#cr-fur)" stroke="#0e0716" stroke-width="2.5"/>' +
    '<path d="M29 46 Q30 28 50 27 Q70 28 71 46 Q64 36 56 38 L50 48 L44 38 Q36 36 29 46Z" fill="#120a1c" stroke="#000" stroke-width="1.5"/>' +
    '<path d="M35 44 L46 47 M65 44 L54 47" stroke="#120a1c" stroke-width="2.5" stroke-linecap="round"/>' +
    eyes('#ff2a3a', '#2a0006') +
    '<path d="M44 62 Q50 66 56 62" fill="none" stroke="#14060c" stroke-width="2" stroke-linecap="round"/><path d="M44.5 62.5 l2 6 l2 -5.5Z M51.5 62.5 l2 5.5 l2 -6Z" fill="#fff" stroke="#14060c" stroke-width=".8"/>' +
    '<path d="M38 74 L50 82 L62 74 L58 70 L50 76 L42 70Z" fill="#f4eee4" stroke="#14060c" stroke-width="1.2"/>' +
    '<circle cx="50" cy="86" r="7" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="1.5"/><circle cx="50" cy="86" r="3.5" fill="url(#cr-ruby)"/>',
    /* 3 Batula's Bride */
    '<path d="M50 6 C30 6 22 20 24 40 C18 56 22 74 16 96 L84 96 C78 74 82 56 76 40 C78 20 70 6 50 6Z" fill="#1a1024" stroke="#000" stroke-width="2"/>' +
    '<path d="M63 8 C70 14 72 22 70 34 C66 26 64 18 58 12Z M37 8 C30 14 28 22 30 34 C34 26 36 18 42 12Z" fill="#f4f0ff" opacity=".9"/>' +
    '<path d="M18 40 Q50 20 82 40 L88 96 L12 96Z" fill="#fff" opacity=".18"/>' +
    ears('url(#cr-fur2)') +
    '<ellipse cx="50" cy="54" rx="19" ry="19" fill="url(#cr-fur2)" stroke="#2a1838" stroke-width="2.5"/>' +
    '<g class="cr-eyes"><ellipse cx="42" cy="52" rx="5" ry="5.5" fill="#7a2aff"/><ellipse cx="58" cy="52" rx="5" ry="5.5" fill="#7a2aff"/><circle cx="43" cy="53" r="2.2" fill="#14060c"/><circle cx="59" cy="53" r="2.2" fill="#14060c"/><circle cx="41" cy="50.5" r="1.2" fill="#fff"/><circle cx="57" cy="50.5" r="1.2" fill="#fff"/></g>' +
    '<path d="M35 47 l-3 -3 M37 46 l-2 -4 M65 47 l3 -3 M63 46 l2 -4" stroke="#14060c" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M44 63 Q50 68 56 63 Q50 65 44 63Z" fill="#d0103a" stroke="#6a0018" stroke-width="1.2"/>' +
    Array.from({ length: 7 }, (_, i) => '<circle cx="' + (38 + i * 4) + '" cy="' + (78 + Math.abs(3 - i) * -0.9 + 2).toFixed(1) + '" r="2.2" fill="#fffaf0" stroke="#a89a8a" stroke-width=".6"/>').join(''),
    /* 4 Silver Stake */
    '<g transform="rotate(-38 50 50)"><path d="M44 8 h12 l2 54 h-16Z" fill="url(#cr-stake)" stroke="#2a1206" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M47 12 v46 M53 14 v44" stroke="#3a1a08" stroke-width="1" opacity=".6"/>' +
    '<rect x="36" y="58" width="28" height="8" rx="3" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2"/>' +
    '<path d="M41 66 h18 l-9 32Z" fill="url(#cr-silver)" stroke="#1a1e30" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M46 68 l4 22" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>' +
    '<circle cx="50" cy="62" r="2.5" fill="url(#cr-ruby)"/></g>' +
    '<path class="cr-spark" d="M76 74 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2Z" fill="#fff"/>',
    /* 5 Chalice of Blood */
    '<path d="M24 22 Q24 56 50 60 Q76 56 76 22Z" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2.5"/>' +
    '<ellipse cx="50" cy="22" rx="26" ry="7" fill="#3a0008" stroke="#3a1a00" stroke-width="2"/><ellipse cx="50" cy="22.5" rx="22" ry="5" fill="url(#cr-blood)" class="cr-slosh"/>' +
    '<path d="M30 26 Q31 46 42 54" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M70 24 q2 8 -1 14 q-3 -6 1 -14Z" fill="#b00a24" class="cr-drip"/>' +
    '<rect x="45" y="58" width="10" height="20" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2"/><ellipse cx="50" cy="68" rx="7" ry="3.5" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="1.5"/>' +
    '<path d="M28 92 Q50 74 72 92Z" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2.5"/>' +
    '<circle cx="50" cy="40" r="6" fill="url(#cr-ruby)" stroke="#3a1a00" stroke-width="1.5"/><circle cx="36" cy="36" r="3" fill="url(#cr-ame)"/><circle cx="64" cy="36" r="3" fill="url(#cr-ame)"/>' +
    '<path class="cr-spark" d="M82 14 l1.6 5 l5 1.6 l-5 1.6 l-1.6 5 l-1.6 -5 l-5 -1.6 l5 -1.6Z" fill="#fff"/>',
    /* 6 Garlic Wreath */
    '<path d="M18 30 Q50 6 82 30" fill="none" stroke="#c8a870" stroke-width="5" stroke-linecap="round"/><path d="M18 30 Q50 6 82 30" fill="none" stroke="#7a5a2a" stroke-width="1.5" stroke-dasharray="4 3"/>' +
    [[24, 40, 0.8], [76, 40, 0.8], [36, 58, 0.95], [64, 58, 0.95], [50, 72, 1.1]].map(([x, y, s]) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M0 -15 Q-3 -20 -1 -24 M0 -15 Q3 -20 2 -23" fill="none" stroke="#7a9a4a" stroke-width="2"/>' +
      '<path d="M0 -16 C-14 -12 -16 6 -8 12 Q0 16 8 12 C16 6 14 -12 0 -16Z" fill="url(#cr-garlic)" stroke="#6a5a3a" stroke-width="1.8"/><path d="M0 -14 Q-4 0 -2 13 M0 -14 Q5 0 3 13 M-7 -8 Q-10 4 -6 11 M7 -8 Q10 4 6 11" fill="none" stroke="#b8a888" stroke-width="1"/>' +
      '<path d="M-6 10 l-2 4 M0 13 l0 4 M6 10 l2 4" stroke="#8a7a5a" stroke-width="1"/></g>').join('') +
    '<path d="M30 46 q-8 -2 -10 -8 q8 0 10 8Z M70 46 q8 -2 10 -8 q-8 0 -10 8Z" fill="url(#cr-leaf)"/>',
    /* 7 Blood Ruby */
    '<path d="M50 10 L84 36 L50 92 L16 36Z" fill="url(#cr-ruby)" stroke="#3a0008" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M16 36 L84 36 M50 10 L36 36 L50 92 L64 36Z M28 22 L36 36 M72 22 L64 36" fill="none" stroke="#ffb0bc" stroke-opacity=".55" stroke-width="1.5"/>' +
    '<path d="M50 10 L36 36 L16 36Z" fill="#fff" opacity=".25"/><path d="M36 36 L50 92 L50 36Z" fill="#fff" opacity=".08"/>' +
    '<path class="cr-spark" d="M30 18 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2Z" fill="#fff"/>',
    /* 8 Amethyst */
    '<path d="M50 8 L80 26 L80 66 L50 92 L20 66 L20 26Z" fill="url(#cr-ame)" stroke="#1a0438" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M50 22 L68 33 L68 59 L50 76 L32 59 L32 33Z" fill="#c890ff" opacity=".35" stroke="#f0d8ff" stroke-opacity=".6" stroke-width="1.5"/>' +
    '<path d="M50 8 L50 22 M80 26 L68 33 M80 66 L68 59 M50 92 L50 76 M20 66 L32 59 M20 26 L32 33" stroke="#f0d8ff" stroke-opacity=".5" stroke-width="1.5"/>' +
    '<path d="M50 8 L20 26 L32 33 L50 22Z" fill="#fff" opacity=".3"/>' +
    '<path class="cr-spark" d="M70 76 l1.6 5 l5 1.6 l-5 1.6 l-1.6 5 l-1.6 -5 l-5 -1.6 l5 -1.6Z" fill="#fff"/>',
    /* 9 Coffin */
    '<path d="M36 6 L64 6 L78 30 L68 94 L32 94 L22 30Z" fill="url(#cr-wood)" stroke="#1a0804" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M38 11 L62 11 L73 31 L64 89 L36 89 L27 31Z" fill="none" stroke="#c89a4a" stroke-width="2"/>' +
    '<g class="cr-lid"><path d="M50 30 C46 24 40 24 35 21 C37 25 36 28 37 31 C40 29 43 30 45 33 C47 32 48 32 50 34 C52 32 53 32 55 33 C57 30 60 29 63 31 C64 28 63 25 65 21 C60 24 54 24 50 30Z" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="1"/></g>' +
    '<rect x="16" y="44" width="6" height="12" rx="2" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="1"/><rect x="78" y="44" width="6" height="12" rx="2" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="1"/>' +
    '<path d="M30 34 L34 82" stroke="#fff" stroke-opacity=".18" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="50" cy="60" r="3" fill="url(#cr-gold)"/><circle cx="50" cy="74" r="3" fill="url(#cr-gold)"/>',
    /* 10 Candle */
    '<circle cx="50" cy="26" r="24" fill="url(#cr-glow)" class="cr-pulse"/>' +
    '<g class="cr-flame"><path d="M50 8 C58 20 58 30 50 36 C42 30 42 20 50 8Z" fill="url(#cr-flame)"/><path d="M50 20 C53 26 53 31 50 34 C47 31 47 26 50 20Z" fill="#fff"/></g>' +
    '<path d="M49 34 v6" stroke="#2a1a10" stroke-width="2"/>' +
    '<path d="M36 40 Q50 36 64 40 L64 84 L36 84Z" fill="url(#cr-wax)" stroke="#6a5a40" stroke-width="2"/>' +
    '<path d="M40 40 q0 10 3 14 q2 -6 1 -14Z M56 40 q1 16 4 20 q2 -10 0 -20Z" fill="#fffdf4" stroke="#b8a888" stroke-width=".8"/>' +
    '<path d="M24 84 L76 84 L70 94 L30 94Z" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2.5" stroke-linejoin="round"/><path d="M76 86 q10 0 10 6 q0 4 -6 4" fill="none" stroke="url(#cr-gold)" stroke-width="3"/>',
  ];
  const symSvg = (i) => '<svg class="cr-sym cr-s-' + KEY[i] + '" viewBox="0 0 100 100" aria-hidden="true">' + SYM_IN[i] + '</svg>';

  /* the lobby poster */
  const POSTER = '<svg viewBox="0 0 300 380" xmlns="http://www.w3.org/2000/svg"><defs>' + DEFS_IN +
    '<linearGradient id="crp-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12061c"/><stop offset=".55" stop-color="#2a0a2a"/><stop offset="1" stop-color="#080308"/></linearGradient></defs>' +
    '<rect width="300" height="380" fill="url(#crp-bg)"/>' +
    '<path d="M40 380 V140 Q40 40 150 30 Q260 40 260 140 V380" fill="#1c0c22" stroke="#4a2a4a" stroke-width="6"/>' +
    '<path d="M70 380 V150 Q70 70 150 62 Q230 70 230 150 V380" fill="#0a0410"/>' +
    '<circle cx="150" cy="130" r="58" fill="url(#cr-halo)"/><circle cx="150" cy="130" r="40" fill="url(#cr-moon)"/>' +
    '<path d="M150 136 C143 125 130 126 120 120 C125 128 123 134 126 140 C132 136 138 138 141 143 C144 141 147 141 150 144 C153 141 156 141 159 143 C162 138 168 136 174 140 C177 134 175 128 180 120 C170 126 157 125 150 136Z" fill="#1a0006"/>' +
    '<g transform="translate(60 160) scale(1.8)">' + SYM_IN[2] + '</g>' +
    [[28, 300], [272, 300]].map(([x, y]) => '<g transform="translate(' + (x - 20) + ' ' + (y - 70) + ') scale(.4)">' + SYM_IN[10] + '</g>').join('') +
    '<text x="150" y="318" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="22" fill="#e8d6ff" letter-spacing="2">COUNT BATULA&#8217;S</text>' +
    '<text x="150" y="360" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="46" fill="url(#cr-gold)" stroke="#2a0010" stroke-width="3" paint-order="stroke">CRYPT</text></svg>';

  /* ---------- rules ---------- */
  function rules() {
    const x = (u) => { const v = u / M.UNITS; return (v >= 1 ? +v.toFixed(2) : +v.toFixed(2)) + '×'; };
    const rows = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => '<tr><td><span class="cr-ri">' + symSvg(s) + '</span>' + NAME[s] + '</td>' + M.PAY[s].map((u) => '<td>' + x(u) + '</td>').join('') + '</tr>').join('');
    return '<div class="cr-rules">' +
      '<p><b>Count Batula&#8217;s Crypt</b> is an original Batty Bucks cascading-ways slot. Step into the Count&#8217;s family vault: every character, picture and number here is our own.</p>' +
      '<h3>The reels</h3><p>Six reels. Reels 1 and 6 show 2 to 7 symbols; reels 2 to 5 show 2 to 6, plus one more from the <b>top reel</b> that runs above them. The height of every reel is drawn fresh each spin, so there are up to <b>117,649 ways</b> to win. The number of ways in play is shown at the top left.</p>' +
      '<h3>Ways wins</h3><p>A symbol pays when it lands on 3 or more neighbouring reels starting from reel 1, in any position. The win is the pay below times the number of ways (how many times it shows on reel 1, times reel 2, and so on). Every symbol pays on its own; all wins on one drop are added up.</p>' +
      '<h3>Bat Wild</h3><p>The <b>Bat Wild</b> lands only on the top reel and stands in for every pay symbol.</p>' +
      '<h3>Cascades and the multiplier</h3><p>Every winning symbol shatters. The symbols above fall into the gaps, new ones drop in, and the top reel slides along with new symbols arriving from the right. It keeps going until a drop has no win. The <b>win multiplier</b> starts at ×1 and climbs by 1 after every cascade. In the base game it starts again at ×1 each spin.</p>' +
      '<h3>Blood Moon free spins</h3><p>The <b>Blood Moon</b> scatter lands on the main reels. Count them when the cascades stop: <b>4 or more</b> award <b>12 free spins</b>, plus 4 more for each Blood Moon beyond 4. In the free spins the multiplier <b>never resets</b>: it keeps climbing from spin to spin, the top reel carries far more Bat Wilds, and 3 or more Blood Moons add 4 more spins (plus 4 for each beyond 3).</p>' +
      '<h3>The gamble wheel</h3><p>Before the free spins start you may gamble them on the wheel for 4 more spins, up to ' + M.GAMBLE_MAX + '. The winning slice is exactly the value of the spins you hold divided by the value of the spins you are playing for (' + [12, 16, 20, 24].map((n) => n + '→' + (n + 4) + ': ' + (M.GAMBLE_P[n] * 100).toFixed(1) + '%').join(', ') + '), so gambling never changes the return; it only makes it swingier. Lose, and the free spins are gone but any win from the triggering spin is still paid. Autoplay never gambles.</p>' +
      '<h3>Ante bet</h3><p>Switch on the <b>ante</b> to play at ' + (M.ANTE_NUM / M.ANTE_DEN) + '× your stake with more Blood Moons on the reels: about twice the chance of free spins. Wins still pay on your stake.</p>' +
      '<h3>Bonus buy</h3><p>Buy the free spins for <b>' + M.BUY_X + '× your stake</b>: real spins are replayed until one lands 4 or more Blood Moons. Batty Bucks only, no guaranteed return: a bought bonus can pay less than its price.</p>' +
      '<p>A round (the triggering spin and all its free spins) is capped at <b>' + fmt(M.MAX_WIN_X) + '× your stake</b>; the round ends the moment it is reached.</p>' +
      '<h3>Paytable</h3><p>Multiples of your stake, per way, for 3, 4, 5 and 6 reels.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>' + rows + '</table>' +
      '<div class="rtp"><b>Tested return</b> ' + RTP_TEXT + ' Rounds are drawn on the server with a secure random generator. Space spins; a tap or Space during a spin stops the reels at once, and taps speed through cascades and free spins.</div>' +
      '<p>Batty Bucks are play money. They have no cash value and cannot be bought, sold or cashed out.</p></div>';
  }
  const RTP_TEXT = '96.6% for the base game (20,000,000 simulated spins: a win 1 in 2.85 spins, free spins about 1 in 177, and the ' + fmt(M.MAX_WIN_X) + '× maximum about once in 120 million spins; the biggest win in the test was 3,931×), 96.9% with the ante (free spins 1 in 93) and 96.5% for the bonus buy (2,000,000 simulated buys). Gambling the free spins leaves the return unchanged.';

  /* ---------- symbol html caches (resting, and motion-blurred for spinning) ---------- */
  const REST = [], BLUR = [], PRE = [];
  function prepSyms() {
    if (REST.length) return;
    for (let i = 0; i < M.NSYM; i++) {
      REST[i] = symSvg(i);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>' + DEFS_IN + '<filter id="b" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="0 8"/></filter></defs><g filter="url(#b)" opacity=".9">' + SYM_IN[i] + '</g></svg>';
      BLUR[i] = 'data:image/svg+xml,' + encodeURIComponent(svg);
      try { const im = new Image(); im.src = BLUR[i]; PRE.push(im); if (im.decode) im.decode().catch(() => {}); } catch (e) { /* fine */ }
    }
  }
  const rndMain = () => { const st = M.STRIPS.base.main[2][4]; return st[(Math.random() * st.length) | 0]; };
  const rndTop = () => { const st = M.STRIPS.base.top; return st[(Math.random() * st.length) | 0]; };

  /* ---------- the crypt behind the reels ---------- */
  const BATP = 'M60 22 C52 10 40 8 28 12 C34 16 36 20 34 26 C26 22 16 24 8 30 C22 30 30 34 36 40 C44 34 52 32 60 34 C68 32 76 34 84 40 C90 34 98 30 112 30 C104 24 94 22 86 26 C84 20 86 16 92 12 C80 8 68 10 60 22Z';
  function vault() {
    /* stone arches, a rose window with the moon behind it, the family coffin on its plinth */
    const stones = Array.from({ length: 70 }, (_, i) => { const row = Math.floor(i / 10), x = (i % 10) * 170 + (row % 2) * 85 - 40, y = 520 + row * 54; return '<rect x="' + x + '" y="' + y + '" width="164" height="50" rx="4" fill="#1b1022" stroke="#0a050e" stroke-width="3"/>'; }).join('');
    const arch = (x, w) => '<path d="M' + x + ' 900 V360 Q' + x + ' ' + (360 - w * 0.9) + ' ' + (x + w / 2) + ' ' + (360 - w) + ' Q' + (x + w) + ' ' + (360 - w * 0.9) + ' ' + (x + w) + ' 360 V900" fill="none" stroke="#2a1a33" stroke-width="34"/><path d="M' + x + ' 900 V360 Q' + x + ' ' + (360 - w * 0.9) + ' ' + (x + w / 2) + ' ' + (360 - w) + ' Q' + (x + w) + ' ' + (360 - w * 0.9) + ' ' + (x + w) + ' 360 V900" fill="none" stroke="#3c2747" stroke-width="6" transform="translate(-10 0)"/>';
    return '<svg class="cr-vault" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><radialGradient id="cr-vg" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#3a1840"/><stop offset=".55" stop-color="#170a20"/><stop offset="1" stop-color="#05020a"/></radialGradient>' +
      '<radialGradient id="cr-win" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3a2a6a"/><stop offset="1" stop-color="#0c0620"/></radialGradient></defs>' +
      '<rect width="1600" height="900" fill="url(#cr-vg)"/>' + stones +
      '<g opacity=".9">' + arch(-60, 420) + arch(1240, 420) + '</g>' +
      '<g class="cr-vmoon"><circle cx="800" cy="210" r="250" fill="url(#cr-halo)" class="cr-mh"/><circle cx="820" cy="200" r="118" fill="url(#cr-moon)"/><circle cx="790" cy="170" r="16" fill="#8a0a1a" opacity=".3"/><circle cx="850" cy="230" r="24" fill="#8a0a1a" opacity=".28"/></g>' +
      '<g class="cr-rose"><circle cx="800" cy="210" r="170" fill="url(#cr-win)" fill-opacity=".38" stroke="#2a1a33" stroke-width="26"/>' +
      Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return '<path d="M800 210 L' + (800 + Math.cos(a) * 160).toFixed(0) + ' ' + (210 + Math.sin(a) * 160).toFixed(0) + '" stroke="#2a1a33" stroke-width="9"/>'; }).join('') +
      '<circle cx="800" cy="210" r="60" fill="none" stroke="#2a1a33" stroke-width="10"/></g>' +
      /* a lancet window on the right with the moon behind its tracery */
      '<g class="cr-lancet"><path d="M1240 560 V300 Q1240 170 1330 120 Q1420 170 1420 300 V560Z" fill="#0c0820" stroke="#2a1a33" stroke-width="22"/>' +
      '<clipPath id="cr-lc"><path d="M1240 560 V300 Q1240 170 1330 120 Q1420 170 1420 300 V560Z"/></clipPath>' +
      '<g clip-path="url(#cr-lc)"><rect x="1230" y="110" width="200" height="460" fill="#1a1440"/><g class="cr-vmoon"><circle cx="1350" cy="250" r="120" fill="url(#cr-halo)" class="cr-mh"/><circle cx="1350" cy="250" r="62" fill="url(#cr-moon)"/><circle cx="1336" cy="236" r="9" fill="#8a0a1a" opacity=".3"/><circle cx="1368" cy="266" r="13" fill="#8a0a1a" opacity=".28"/></g>' +
      '<path d="M1290 560 C1295 470 1270 430 1300 380 M1380 560 C1370 480 1400 430 1360 380" stroke="#05030a" stroke-width="7" fill="none"/></g>' +
      '<path d="M1330 120 V560 M1240 330 H1420 M1240 450 H1420" stroke="#2a1a33" stroke-width="9"/><path d="M1240 560 V300 Q1240 170 1330 120 Q1420 170 1420 300 V560" fill="none" stroke="#4a3157" stroke-width="4"/>' +
      '<rect x="1222" y="556" width="216" height="22" rx="4" fill="#24142c"/></g>' +
      /* the Count's portrait on the left wall, eyes blinking */
      '<g class="cr-portrait" transform="translate(190 190)"><rect x="-14" y="-14" width="228" height="288" rx="10" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="6"/><rect x="6" y="6" width="188" height="248" fill="#1c0a20"/>' +
      '<rect x="6" y="6" width="188" height="248" fill="url(#cr-vg)" opacity=".6"/><g transform="translate(18 40) scale(1.64)">' + SYM_IN[2] + '</g>' +
      '<rect x="60" y="262" width="80" height="18" rx="4" fill="url(#cr-gold)"/><path d="M100 -14 L80 -60 M100 -14 L120 -60" stroke="#6a5a40" stroke-width="3"/></g>' +
      '<rect x="0" y="770" width="1600" height="130" fill="#0c0610"/>' +
      '</svg>';
  }
  function candelabra(side) {
    return '<svg class="cr-cand ' + side + '" viewBox="0 0 120 260" aria-hidden="true">' +
      '<path d="M60 250 V120 M20 120 Q20 150 60 150 Q100 150 100 120 M40 250 h40" fill="none" stroke="url(#cr-gold)" stroke-width="7" stroke-linecap="round"/>' +
      '<ellipse cx="60" cy="250" rx="30" ry="6" fill="#4a2a0a"/>' +
      [20, 60, 100].map((x, i) => '<rect x="' + (x - 8) + '" y="' + (i === 1 ? 54 : 74) + '" width="16" height="' + (i === 1 ? 64 : 44) + '" rx="3" fill="url(#cr-wax)"/>' +
        '<g class="cr-bf" style="--d:' + (i * 0.13).toFixed(2) + 's"><ellipse cx="' + x + '" cy="' + (i === 1 ? 34 : 54) + '" rx="22" ry="26" fill="url(#cr-glow)"/><path d="M' + x + ' ' + (i === 1 ? 30 : 50) + ' c7 10 7 18 0 22 c-7 -4 -7 -12 0 -22Z" fill="url(#cr-flame)"/></g>').join('') +
      '</svg>';
  }
  const COFFIN_BG = '<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M10 70 L40 40 L180 40 L210 70 L180 100 L40 100Z" fill="url(#cr-wood)" stroke="#120402" stroke-width="4"/>' +
    '<g class="cr-clid"><path d="M14 66 L42 36 L178 36 L206 66 L178 60 L42 60Z" fill="#4a2212" stroke="#120402" stroke-width="4"/></g>' +
    '<g class="cr-ceyes"><ellipse cx="98" cy="54" rx="5" ry="3" fill="#ff2a3a"/><ellipse cx="122" cy="54" rx="5" ry="3" fill="#ff2a3a"/></g>' +
    '<path d="M100 76 C96 70 90 70 84 68 C86 72 85 75 86 78 C89 76 92 77 94 80 C96 79 98 79 100 81 C102 79 104 79 106 80 C108 77 111 76 114 78 C115 75 114 72 116 68 C110 70 104 70 100 76Z" fill="url(#cr-gold)"/>' +
    '<rect x="0" y="100" width="220" height="20" rx="4" fill="#24142c"/></svg>';

  /* ---------- the mounted game ---------- */
  function mount(root) {
    prepSyms();
    const S = B.scope();
    G = { S };
    const el = {};
    let stakeCtl, busy = false, spinning = false, auto = 0, turbo = false, skip = false, ante = false;
    let primary = null, curStake = B.STAKES[0], roundCost = 0, devNext = null, devFs = null;
    let winUnits = 0, multNow = 1, inFs = false;
    let DEV = false;
    try { DEV = !B.online && localStorage.getItem('batty-dev') === '1'; } catch (e) { DEV = false; }
    const T = (ms) => ms * (skip ? 0.25 : turbo ? 0.55 : 1) * (RM ? 0.6 : 1);
    const nap = (ms) => S.sleep(Math.max(16, T(ms)));
    const setMsg = (t, cls) => { el.msg.textContent = t; el.msg.className = 'cr-msg' + (cls ? ' ' + cls : ''); };
    const money = (u) => Math.floor(u * curStake / M.UNITS);
    const cost = (stake, a, buy) => (buy ? stake * M.BUY_X : a ? stake * M.ANTE_NUM / M.ANTE_DEN : stake);

    /* ----- build the world ----- */
    root.classList.add('cr');
    root.innerHTML = DEFS;
    el.bg = h('div', { class: 'cr-bg', 'aria-hidden': 'true', html:
      vault() +
      '<div class="cr-shafts"></div>' +
      '<div class="cr-coffin">' + COFFIN_BG + '</div>' +
      candelabra('l') + candelabra('r') +
      '<div class="cr-dust"></div><div class="cr-fog"></div>' +
      '<div class="cr-bats">' + [0, 1, 2, 3].map((i) => '<i style="--i:' + i + '"><svg viewBox="0 0 120 44"><path d="' + BATP + '" fill="#07030c"/></svg></i>').join('') + '</div>' +
      '<div class="cr-swarm"></div><div class="cr-flash"></div>' });
    el.flash = el.bg.querySelector('.cr-flash'); el.swarm = el.bg.querySelector('.cr-swarm');
    el.title = h('div', { class: 'cr-title' }, h('small', null, 'COUNT BATULA’S'), h('b', null, 'CRYPT'), h('span', null, 'up to 117,649 ways · cascades · up to ' + fmt(M.MAX_WIN_X) + '×'));
    /* free-spin HUD */
    el.hudLeft = h('output', null, '0'); el.hudMult = h('output', null, '×1'); el.hudTotal = h('output', null, '0');
    el.hud = h('div', { class: 'cr-hud', hidden: true },
      h('div', { class: 'cr-hud-c' }, h('small', null, 'FREE SPINS'), el.hudLeft),
      h('div', { class: 'cr-hud-c m' }, h('small', null, 'MULTIPLIER'), el.hudMult),
      h('div', { class: 'cr-hud-c' }, h('small', null, 'TOTAL WIN · BB'), el.hudTotal));
    /* the frame: ways plaque | top reel | multiplier plaque, then the six reels */
    el.waysN = h('b', null, '0');
    el.ways = h('div', { class: 'cr-ways' }, el.waysN, h('small', null, 'WAYS'));
    el.multN = h('b', null, '×1');
    el.mult = h('div', { class: 'cr-mult' }, h('small', null, 'MULTI'), el.multN);
    el.top = h('div', { class: 'cr-top' });
    el.reels = h('div', { class: 'cr-reels' });
    el.cols = [];
    for (let r = 0; r < REELS; r++) { const c = h('div', { class: 'cr-col', 'data-r': r }); el.cols.push(c); el.reels.append(c); }
    el.chips = h('div', { class: 'cr-chips', 'aria-hidden': 'true' });
    el.pops = h('div', { class: 'cr-pops', 'aria-hidden': 'true' });
    el.banner = h('div', { class: 'cr-banner', hidden: true, 'aria-hidden': 'true' });
    el.frame = h('div', { class: 'cr-frame' }, el.ways, el.top, el.mult, el.reels, el.chips, el.pops, el.banner,
      h('i', { class: 'cr-orn tl' }), h('i', { class: 'cr-orn tr' }), h('i', { class: 'cr-orn bl' }), h('i', { class: 'cr-orn br' }));
    el.box = h('div', { class: 'cr-box' }, el.frame);
    /* controls */
    el.msg = h('div', { class: 'cr-msg', role: 'status', 'aria-live': 'polite' }, 'Land 4 or more Blood Moons for free spins.');
    el.win = h('output', null, '0');
    el.winbox = h('div', { class: 'cr-winbox' }, h('small', null, 'WIN'), el.win);
    el.stakeBox = h('div', { class: 'cr-stakebox' });
    el.spin = h('button', { class: 'cr-spin', type: 'button', 'aria-label': 'Spin', id: 'cr-spin', onclick: () => onSpin(), html: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="go" d="M24 8a16 16 0 1 1-11.3 4.7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path class="go" d="M8 6v10h10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect class="st" x="15" y="15" width="18" height="18" rx="3" fill="currentColor"/></svg>' });
    el.buy = h('button', { class: 'cr-btn gold', type: 'button', id: 'cr-buy', onclick: () => openBuy() }, h('small', null, 'BUY'), 'BONUS');
    el.ante = h('button', { class: 'cr-btn', type: 'button', id: 'cr-ante', 'aria-pressed': 'false', title: 'Ante: ' + (M.ANTE_NUM / M.ANTE_DEN) + '× stake, double the Blood Moon chance', onclick: () => toggleAnte() }, h('small', null, 'ANTE ' + (M.ANTE_NUM / M.ANTE_DEN) + '×'), 'OFF');
    el.turbo = h('button', { class: 'cr-btn', type: 'button', id: 'cr-turbo', 'aria-pressed': 'false', onclick: () => { turbo = !turbo; el.turbo.setAttribute('aria-pressed', turbo); el.turbo.classList.toggle('on', turbo); el.turbo.lastChild.textContent = turbo ? 'ON' : 'OFF'; snd('click'); } }, h('small', null, 'TURBO'), 'OFF');
    el.auto = h('button', { class: 'cr-btn', type: 'button', id: 'cr-auto', onclick: () => onAuto() }, h('small', null, 'AUTO'), 'OFF');
    el.autoMenu = h('div', { class: 'cr-automenu', hidden: true }, ...[10, 25, 50, 100].map((n) => h('button', { type: 'button', onclick: () => { el.autoMenu.hidden = true; startAuto(n); } }, String(n))));
    el.ctl = h('div', { class: 'cr-ctl' }, el.stakeBox, el.ante, el.buy, el.winbox, el.spin, el.turbo, h('div', { class: 'cr-autowrap' }, el.auto, el.autoMenu));
    el.ov = h('div', { class: 'cr-ov', hidden: true });
    el.main = h('div', { class: 'cr-main' }, h('div', { class: 'cr-head' }, el.title, el.hud), el.box, el.msg, el.ctl);
    root.append(el.bg, el.main, el.ov);
    stakeCtl = B.ui.stake(el.stakeBox, { id: ID, label: 'Stake · BB', onChange: () => paintCost() });
    curStake = stakeCtl.value;
    const paintAuto = () => { el.auto.lastChild.textContent = auto > 0 ? String(auto) : 'OFF'; el.auto.classList.toggle('on', auto !== 0); };
    function paintCost() { el.spin.title = ante ? 'Spin for ' + fmt(cost(stakeCtl.value, true)) + ' BB (ante)' : 'Spin'; }
    function toggleAnte() {
      if (busy) return;
      ante = !ante; el.ante.setAttribute('aria-pressed', ante); el.ante.classList.toggle('on', ante); el.ante.lastChild.textContent = ante ? 'ON' : 'OFF';
      el.bg.classList.toggle('ante', ante); snd(ante ? 'moon' : 'click', 1); paintCost();
      setMsg(ante ? 'Ante on: each spin costs ' + fmt(cost(stakeCtl.value, true)) + ' BB, with twice the chance of Blood Moon free spins.' : 'Ante off.', ante ? 'red' : '');
    }
    requestAnimationFrame(() => root.classList.add('open'));
    S.timeout(() => snd('organ'), 400);

    /* ----- the grid: cells are absolutely placed, so reels of any height share one column ----- */
    let grid = null, topRow = null, colCells = [], topCells = [];
    function cellEl(s, k, n, horiz) {
      const c = h('div', { class: 'cr-cell s-' + KEY[s] + (s === SY.SCAT ? ' moon' : s === SY.WILD ? ' wild' : '') });
      if (horiz) { c.style.left = (k * 100 / n) + '%'; c.style.width = (100 / n) + '%'; } else { c.style.top = (k * 100 / n) + '%'; c.style.height = (100 / n) + '%'; }
      c.innerHTML = REST[s];
      return c;
    }
    function paintCol(r, col) {
      const box = el.cols[r]; box.textContent = '';
      colCells[r] = col.map((s, k) => { const c = cellEl(s, k, col.length, false); box.append(c); return c; });
      box.dataset.h = col.length;
      return colCells[r];
    }
    function paintTop(top) {
      el.top.textContent = '';
      topCells = top.map((s, k) => { const c = cellEl(s, k, TOPN, true); el.top.append(c); return c; });
      return topCells;
    }
    function paintWays(cols) { el.waysN.textContent = fmt(M.ways(cols)); el.ways.classList.remove('bump'); void el.ways.offsetWidth; el.ways.classList.add('bump'); }
    function setMult(m, anim) {
      multNow = m; el.multN.textContent = '×' + m; el.hudMult.textContent = '×' + m;
      el.mult.classList.toggle('hot', m > 1);
      if (anim && !RM) { el.mult.animate([{ transform: 'scale(1.6) rotate(-6deg)', filter: 'brightness(2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: T(420), easing: 'cubic-bezier(.2,1.6,.4,1)' }); el.hudMult.animate([{ transform: 'scale(1.7)' }, { transform: 'scale(1)' }], { duration: T(420), easing: 'cubic-bezier(.2,1.6,.4,1)' }); }
    }
    /* a resting grid to start with */
    (function idleGrid() {
      const d = M.draw(Math.random, 'base');
      grid = d.cols; topRow = d.top;
      grid.forEach((c, r) => paintCol(r, c)); paintTop(topRow); paintWays(grid); setMult(1);
    })();

    /* ===================== reels ===================== */
    const reelSt = [];   // per reel: {mode: idle|spin, stopAt, col, antic}
    for (let r = 0; r <= REELS; r++) reelSt.push({ mode: 'idle', stopAt: 0, col: null, antic: false, done: null });
    function rollEl(horiz) {
      const n = 8, syms = [];
      for (let i = 0; i < n; i++) syms.push(horiz ? rndTop() : rndMain());
      const strip = syms.concat(syms).map((s) => RM ? REST[s] : '<img alt="" draggable="false" src="' + BLUR[s] + '">').join('');
      return h('div', { class: 'cr-roll' + (horiz ? ' h' : '') + (RM ? ' rm' : ''), html: strip });
    }
    function startRoll() {
      spinning = true; snd('spin'); lockUi(true);
      el.frame.classList.remove('won'); el.reels.classList.remove('dim'); el.top.classList.remove('dim');
      for (let r = 0; r <= REELS; r++) {
        const box = r < REELS ? el.cols[r] : el.top, horiz = r === REELS;
        const st = reelSt[r]; if (st.mode === 'spin') continue;
        st.mode = 'spin'; st.stopAt = 0;
        const old = Array.from(box.children);
        if (!RM) old.forEach((c) => c.animate(horiz ? [{ transform: 'translateX(0)' }, { transform: 'translateX(8%)', offset: 0.3 }, { transform: 'translateX(-220%)', opacity: 0.2 }] : [{ transform: 'translateY(0)' }, { transform: 'translateY(-10%)', offset: 0.3 }, { transform: 'translateY(' + (box.children.length * 100 + 60) + '%)', opacity: 0.4 }], { duration: 260 + r * 25, easing: 'ease-in', fill: 'forwards' }));
        st.tok = (st.tok || 0) + 1; const tok = st.tok;
        S.timeout(() => { if (st.mode !== 'spin' || st.tok !== tok) return; box.textContent = ''; box.append(rollEl(horiz)); }, RM ? 0 : 160 + r * 20);
        box.classList.add('spinning');
      }
    }
    /* land one reel (r = REELS is the top reel) on its symbols, with a drop and a thud */
    function land(r) {
      const st = reelSt[r], horiz = r === REELS, box = horiz ? el.top : el.cols[r];
      st.mode = 'idle'; box.classList.remove('spinning', 'antic');
      st.tok = (st.tok || 0) + 1;
      const cells = horiz ? paintTop(st.col) : paintCol(r, st.col);
      st.fin = st.col; st.col = null;
      const n = cells.length;
      if (!RM) cells.forEach((c, k) => c.animate(horiz ? [{ transform: 'translateX(' + ((TOPN - k) * 100 + 40) + '%)' }, { transform: 'translateX(-6%)', offset: 0.8 }, { transform: 'translateX(0)' }]
        : [{ transform: 'translateY(' + (-(n + 1) * 100) + '%)' }, { transform: 'translateY(5%)', offset: 0.78 }, { transform: 'translateY(0)' }], { duration: T(300), delay: horiz ? k * T(30) : (n - 1 - k) * T(22), easing: 'cubic-bezier(.45,.05,.55,1)', fill: 'backwards' }));
      S.timeout(() => {
        box.classList.add('thud'); S.timeout(() => box.classList.remove('thud'), 260);
        if (horiz) snd('top'); else snd('stop', r);
        if (!RM && !horiz) puff(box);
        const moons = cells.filter((c) => c.classList.contains('moon'));
        if (moons.length) { moons.forEach((c) => c.classList.add('landed')); snd('moon', countMoons(r)); }
      }, RM ? 10 : T(280) + (horiz ? 0 : (n - 1) * T(22)));
      const doneAt = RM ? 60 : T(330) + (horiz ? TOPN * T(30) : (n - 1) * T(22));
      S.timeout(() => { const d = st.done; st.done = null; if (d) d(); }, doneAt);
    }
    let landedMoons = 0;
    function countMoons(upTo) { let n = 0; for (let r = 0; r <= upTo && r < REELS; r++) n += (reelSt[r].fin || []).filter((s) => s === SY.SCAT).length; return n; }
    function puff(box) {
      const p = h('i', { class: 'cr-puff' }); box.append(p); S.timeout(() => p.remove(), 600);
    }
    function frame() {
      if (!spinning) return;
      const now = performance.now();
      for (let r = 0; r <= REELS; r++) {
        const st = reelSt[r];
        if (st.mode === 'spin' && st.col && st.stopAt && now >= st.stopAt) {
          land(r);
          if (r < REELS) {
            const nx = reelSt[r + 1];
            const moons = countMoons(r);
            for (let k = r + 1; k < REELS; k++) if (reelSt[k].antic && reelSt[k].mode === 'spin') { el.cols[k].classList.add('antic'); }
            if (r + 1 < REELS && nx.antic && nx.mode === 'spin') { el.frame.classList.add('antic'); el.bg.classList.add('antic'); snd('antic', moons); setMsg(moons >= 4 ? 'The Blood Moon rises… more to come?' : 'One more Blood Moon…', 'red'); }
            else if (r === REELS - 1) { el.frame.classList.remove('antic'); el.bg.classList.remove('antic'); }
          }
        }
      }
    }
    S.loop(frame);
    /* bring the spinning reels to rest on cols / top */
    function spinTo(cols, top, opts) {
      opts = opts || {};
      return new Promise((res) => {
        const base = performance.now(), gap = T(140), first = T(opts.first || 520);
        let before = 0, extra = 0, left = REELS + 1;
        const done = () => { if (--left === 0) { spinning = false; el.frame.classList.remove('antic'); el.bg.classList.remove('antic'); res(); } };
        for (let r = 0; r < REELS; r++) {
          const st = reelSt[r];
          st.antic = !opts.noAntic && before >= 3 && !skip;
          if (st.antic) extra += T(820);
          before += cols[r].filter((s) => s === SY.SCAT).length;
          st.col = cols[r].slice(); st.done = done;
          if (st.mode !== 'spin') { st.mode = 'spin'; }
          st.stopAt = base + first + r * gap + extra;
        }
        const tp = reelSt[REELS]; tp.col = top.slice(); tp.done = done; tp.antic = false; if (tp.mode !== 'spin') tp.mode = 'spin';
        tp.stopAt = base + first + gap * 0.5;
        spinning = true; lockUi(true);
      });
    }
    function slam() {
      if (!spinning) return;
      const now = performance.now();
      for (let r = 0; r <= REELS; r++) { const st = reelSt[r]; if (st.mode === 'spin' && st.stopAt) { st.stopAt = Math.min(st.stopAt, now + (r < REELS ? r * 30 : 0)); st.antic = false; } }
      el.cols.forEach((c) => c.classList.remove('antic'));
    }
    function restAll() {
      for (let r = 0; r <= REELS; r++) { const st = reelSt[r]; st.mode = 'idle'; st.col = null; st.done = null; st.antic = false; }
      grid.forEach((c, r) => { el.cols[r].classList.remove('spinning', 'antic'); paintCol(r, c); }); el.top.classList.remove('spinning'); paintTop(topRow);
      spinning = false;
    }

    /* ===================== cascades and win presentation ===================== */
    const winNow = () => parseInt(el.win.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    function countWin(to, ms) { return B.ui.countUp(el.win, winNow(), to, Math.max(60, T(ms || 600))); }
    function pop(txt, cls, x, y) {
      const p = h('div', { class: 'cr-pop ' + (cls || ''), style: { left: (x == null ? 50 : x) + '%', top: (y == null ? 50 : y) + '%' } }, txt);
      el.pops.append(p); S.timeout(() => p.remove(), 1500);
    }
    function chipsFor(st) {
      el.chips.textContent = '';
      const ws = st.wins.slice().sort((a, b) => b.p - a.p).slice(0, 4);
      for (const w of ws) el.chips.append(h('div', { class: 'cr-chip', html: '<span class="cr-ci">' + REST[w.s] + '</span><b>' + w.n + '</b><small>reels · ' + fmt(w.w) + (w.w === 1 ? ' way' : ' ways') + '</small><em>' + fmt(money(w.p * st.m)) + '</em>' }));
      if (st.wins.length > 4) el.chips.append(h('div', { class: 'cr-chip more' }, '+' + (st.wins.length - 4)));
      el.chips.classList.add('in');
    }
    const winText = (st) => {
      const w = st.wins.slice().sort((a, b) => b.p - a.p)[0];
      const tail = st.m > 1 ? ' × ' + st.m : '';
      return st.wins.length > 1 ? st.wins.length + ' symbols win' + tail + ' · ' + fmt(money(st.pay)) + ' BB' : NAME[w.s] + ' on ' + w.n + ' reels, ' + fmt(w.w) + (w.w === 1 ? ' way' : ' ways') + tail + ' · ' + fmt(money(st.pay)) + ' BB';
    };
    /* one drop: show its wins, shatter them, let the rest fall and refill; then the next. */
    async function playSteps(steps, opts) {
      opts = opts || {};
      for (let k = 0; k < steps.length; k++) {
        const st = steps[k];
        if (!st.wins.length) break;
        if (!G) return;
        setMult(st.m, false);
        /* highlight */
        el.reels.classList.add('dim'); el.top.classList.add('dim'); el.frame.classList.add('won');
        st.hit.forEach((rows, r) => rows.forEach((row) => colCells[r][row] && colCells[r][row].classList.add('win')));
        st.th.forEach((k2) => topCells[k2] && topCells[k2].classList.add('win'));
        chipsFor(st);
        snd('win', st.wins.length); setMsg(winText(st), 'gold');
        winUnits += st.pay;
        const bb = money(st.pay);
        pop('+' + fmt(bb), bb >= roundCost * 5 ? 'big' : '', 50, 46);
        if (opts.onWin) opts.onWin(winUnits);
        countWin(money(winUnits), 500);
        if (bb >= roundCost * 3) { candleFlare(); }
        if (bb >= roundCost * 8) batBurst();
        await nap(st.m > 1 ? 1050 : 900); if (!G) return;
        /* shatter */
        const hitCells = [];
        st.hit.forEach((rows, r) => rows.forEach((row) => hitCells.push(colCells[r][row])));
        st.th.forEach((k2) => hitCells.push(topCells[k2]));
        snd('shatter', hitCells.length);
        hitCells.forEach((c) => { if (!c) return; c.classList.add('shatter'); if (!RM) for (let i = 0; i < 3; i++) c.append(h('i', { class: 'cr-shard', style: { '--a': (i * 120 + Math.random() * 60) + 'deg' } })); });
        el.chips.classList.remove('in');
        await nap(380); if (!G) return;
        const next = steps[k + 1];
        if (!next) break;
        /* fall and refill */
        el.reels.classList.remove('dim'); el.top.classList.remove('dim');
        await tumble(st, next); if (!G) return;
        setMult(st.m + 1, true); snd('mult', st.m + 1);
        if (inFs) el.hudMult.parentNode.classList.add('hot');
        await nap(200);
      }
      el.reels.classList.remove('dim'); el.top.classList.remove('dim'); el.chips.classList.remove('in');
    }
    function tumble(st, next) {
      snd('fall');
      const D = T(360);
      for (let r = 0; r < REELS; r++) {
        const rows = st.hit[r];
        const n0 = st.c[r].length;
        if (!rows.length) continue;
        const keepFrom = []; for (let k = 0; k < n0; k++) if (rows.indexOf(k) < 0) keepFrom.push(k);
        const nNew = rows.length;
        const cells = paintCol(r, next.c[r]);
        if (RM) continue;
        cells.forEach((c, k) => {
          const fromK = k < nNew ? k - nNew - 1 : keepFrom[k - nNew];
          const dy = (fromK - k) * 100;
          if (!dy) return;
          c.animate([{ transform: 'translateY(' + dy + '%)' }, { transform: 'translateY(4%)', offset: 0.82 }, { transform: 'translateY(0)' }], { duration: D + (k < nNew ? (nNew - k) * T(30) : 0), easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' });
        });
      }
      if (st.th.length) {
        const keepFrom = []; for (let k = 0; k < TOPN; k++) if (st.th.indexOf(k) < 0) keepFrom.push(k);
        const cells = paintTop(next.t);
        if (!RM) cells.forEach((c, k) => {
          const fromK = k < keepFrom.length ? keepFrom[k] : TOPN + (k - keepFrom.length) + 0.5;
          const dx = (fromK - k) * 100;
          if (dx) c.animate([{ transform: 'translateX(' + dx + '%)' }, { transform: 'translateX(-4%)', offset: 0.85 }, { transform: 'translateX(0)' }], { duration: D, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' });
        });
      }
      grid = next.c; topRow = next.t;
      return nap(420).then(() => {
        el.cols.forEach((c) => { c.classList.add('thud'); S.timeout(() => c.classList.remove('thud'), 240); });
        const moons = next.c.reduce((a, c) => a + c.filter((s) => s === SY.SCAT).length, 0);
        if (moons > landedMoons) { landedMoons = moons; colCells.flat().forEach((c) => { if (c.classList.contains('moon')) c.classList.add('landed'); }); snd('moon', moons); }
      });
    }
    function candleFlare() { el.bg.classList.remove('flare'); void el.bg.offsetWidth; el.bg.classList.add('flare'); }
    function batBurst() {
      if (RM) return;
      snd('squeak');
      el.swarm.textContent = '';
      for (let i = 0; i < 9; i++) {
        const b = h('i', { style: { left: (10 + Math.random() * 80) + '%', top: (55 + Math.random() * 30) + '%', '--dx': ((Math.random() - 0.5) * 60) + 'vw', '--dy': (-40 - Math.random() * 50) + 'vh', '--t': (0.9 + Math.random() * 0.8).toFixed(2) + 's' }, html: '<svg viewBox="0 0 120 44"><path d="' + BATP + '" fill="#0a0410"/></svg>' });
        el.swarm.append(b);
      }
      S.timeout(() => { el.swarm.textContent = ''; }, 1900);
    }
    function lightning(strong) {
      if (RM) return;
      el.flash.animate([{ opacity: 0 }, { opacity: strong ? 0.85 : 0.5, offset: 0.08 }, { opacity: 0.1, offset: 0.2 }, { opacity: strong ? 0.7 : 0.35, offset: 0.3 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      if (strong) snd('thunder');
    }
    function banner(html, cls, ms) {
      el.banner.hidden = false; el.banner.className = 'cr-banner ' + (cls || ''); el.banner.innerHTML = html;
      requestAnimationFrame(() => el.banner.classList.add('in'));
      return nap(ms || 1200).then(() => { el.banner.classList.remove('in'); el.banner.classList.add('out'); return nap(260); }).then(() => { el.banner.hidden = true; });
    }

    /* ===================== the server / the maths ===================== */
    async function fetchSpin(stake, a, buy, c) {
      if (B.online) {
        const r = await B.play(ID, 'spin', { stake, ante: a ? 1 : undefined, buy: buy ? 1 : undefined }, c);
        if (!r || !r.o) return null;
        if (r.collected > 0) { B.wallet.sync(); B.ui.toast('Your unfinished free spins were played: +' + fmt(r.collected) + ' BB'); }
        return { o: r.o, open: r.open };
      }
      let o;
      if (DEV && devNext && !buy) { o = M.spinUntil(B.rng, devNext, a); devNext = null; }
      else o = buy ? M.buy(B.rng) : M.spin(B.rng, a);
      return { o, open: o.fs ? { round: 0, n: o.fs, baseWin: o.win, canGamble: M.canGamble(o.fs), p: M.gambleP(o.fs), scat: o.scat } : null };
    }
    async function fetchGamble(offer) {
      if (B.online) {
        const r = await B.play(ID, 'gamble', { round: offer.round }, 0);
        if (!r) return null;
        return r;
      }
      const x = B.rng(), p = M.gambleP(offer.n), won = x < p;
      return { won, x, p, from: offer.n, n: won ? offer.n + M.GAMBLE_STEP : 0, done: !won, open: won ? Object.assign({}, offer, { n: offer.n + M.GAMBLE_STEP, canGamble: M.canGamble(offer.n + M.GAMBLE_STEP), p: M.gambleP(offer.n + M.GAMBLE_STEP) }) : null };
    }
    async function fetchFs(offer) {
      if (B.online) {
        const r = await B.play(ID, 'start', { round: offer.round }, 0);
        if (!r) return null;
        return r.fs;
      }
      if (DEV && devFs) { const pred = devFs; devFs = null; for (let i = 0; i < 200000; i++) { const f = M.freeSpins(B.rng, offer.n, offer.baseWin); if (pred(f)) return f; } }
      return M.freeSpins(B.rng, offer.n, offer.baseWin);
    }

    /* ===================== spin button, auto, buy ===================== */
    function lockUi(on) {
      stakeCtl.disabled = on; el.buy.disabled = on; el.ante.disabled = on; el.main.classList.toggle('busy', on);
      el.spin.classList.toggle('stop', on && spinning);
      el.spin.setAttribute('aria-label', on && spinning ? 'Stop the reels' : 'Spin');
    }
    function onSpin() {
      if (!el.ov.hidden) { if (G.ovPrimary) G.ovPrimary(); else closeOv(); return; }
      if (!el.autoMenu.hidden) { el.autoMenu.hidden = true; return; }
      if (busy) { if (spinning) slam(); else if (primary) primary(); else skip = true; return; }
      round(false);
    }
    function onAuto() { if (auto !== 0) { stopAuto(); snd('click'); } else if (!busy) el.autoMenu.hidden = !el.autoMenu.hidden; }
    function startAuto(n) { auto = n; paintAuto(); round(false); }
    function stopAuto() { auto = 0; paintAuto(); }
    function openBuy() {
      if (busy) return;
      const stake = stakeCtl.value, c = stake * M.BUY_X;
      el.ov.hidden = false; el.ov.textContent = ''; G.ovPrimary = null;
      el.ov.append(h('div', { class: 'cr-buybox', role: 'dialog', 'aria-label': 'Bonus buy' },
        h('div', { class: 'cr-buyart', 'aria-hidden': 'true', html: REST[SY.SCAT] + REST[SY.COUNT] + REST[SY.SCAT] }),
        h('h3', null, 'Raise the Blood Moon'),
        h('p', null, 'Buy the free spins: real spins are replayed until one lands 4 or more Blood Moons. Batty Bucks only: the result is random and can be less than the price.'),
        h('div', { class: 'cr-buyrow' },
          h('button', { class: 'cr-btn', type: 'button', onclick: closeOv }, 'Not now'),
          h('button', { class: 'cr-btn gold big', type: 'button', id: 'cr-buy-go', disabled: B.wallet.balance < c, onclick: () => { closeOv(); round(true); } }, h('small', null, M.BUY_X + '× stake'), fmt(c) + ' BB'))));
      snd('pop');
    }
    function closeOv() { el.ov.hidden = true; el.ov.textContent = ''; G.ovPrimary = null; }

    /* ===================== a round ===================== */
    async function round(buy) {
      if (busy || !G) return;
      const stake = stakeCtl.value, a = ante && !buy, c = cost(stake, a, buy);
      if (!B.wallet.bet(ID, c)) { stopAuto(); return B.ui.broke(); }
      busy = true; skip = false; el.autoMenu.hidden = true; roundCost = c; curStake = stake; winUnits = 0; landedMoons = 0;
      el.win.textContent = '0'; el.winbox.classList.remove('hot'); el.chips.classList.remove('in');
      if (auto > 0) { auto--; paintAuto(); }
      setMsg(buy ? 'The Count stirs in his coffin…' : 'The crypt door creaks open…', buy ? 'red' : '');
      setMult(1);
      startRoll();
      const res = await fetchSpin(stake, a, buy, c);
      if (!G) return;
      if (!res) { restAll(); busy = false; stopAuto(); lockUi(false); setMsg('The candles blew out. Try again.', ''); return; }
      const o = res.o, st0 = o.steps[0];
      await spinTo(st0.c, st0.t, { first: buy ? 900 : 520, noAntic: !!buy });
      if (!G) return;
      grid = st0.c; topRow = st0.t; paintWays(grid);
      landedMoons = M.countScat(grid);
      await playSteps(o.steps);
      if (!G) return;
      setMult(o.mult);
      if (o.capped) { await finishRound(o.win, null); return; }
      if (res.open) { await award(res.open); return; }
      await finishRound(o.win, null);
    }
    async function finishRound(units, fs) {
      const win = money(units);
      if (win > winNow()) await countWin(win, 900);
      if (!G) return;
      if (win > 0) B.wallet.win(ID, win, { silent: true });
      B.wallet.sync();
      if (win > 0) {
        setMsg((units >= M.CAP ? 'MAXIMUM WIN! ' : '') + 'Paid ' + fmt(win) + ' BB', 'gold');
        el.winbox.classList.add('hot'); S.timeout(() => el.winbox.classList.remove('hot'), 1600);
      } else if (fs !== 'lost') setMsg(landedMoons === 3 ? 'Three Blood Moons… so close. Spin again.' : 'Nothing stirs. Spin again.', '');
      if (win >= roundCost * 10) { lightning(true); batBurst(); await B.ui.celebrate({ amount: win, bet: roundCost }); if (!G) return; }
      setMult(1);
      busy = false; spinning = false; skip = false; primary = null; lockUi(false);
      if (auto > 0 && B.wallet.balance >= cost(stakeCtl.value, ante)) S.timeout(() => { if (auto > 0 && !busy) round(false); }, T(fs ? 900 : 420));
      else if (auto !== 0) stopAuto();
    }

    /* ===================== Blood Moon: the award and the gamble wheel ===================== */
    async function award(offer) {
      /* the trigger */
      const moons = colCells.flat().filter((c) => c.classList.contains('moon'));
      moons.forEach((c) => c.classList.add('trig'));
      lightning(true); snd('bell'); el.bg.classList.add('blood');
      setMsg(offer.scat + ' Blood Moons! ' + offer.n + ' free spins!', 'red');
      await nap(1500); if (!G) return;
      await banner('<small>The Blood Moon rises</small><b>' + offer.n + ' FREE SPINS</b><span>the multiplier never resets</span>', 'big', 1900); if (!G) return;
      moons.forEach((c) => c.classList.remove('trig'));
      let cur = offer;
      while (cur && cur.canGamble && auto === 0) {
        const choice = await gambleChoice(cur); if (!G) return;
        if (choice !== 'gamble') break;
        const g = await spinWheel(cur); if (!G) return;
        if (!g) { closeOv(); break; }
        if (!g.won) {
          closeOv(); el.bg.classList.remove('blood');
          setMsg('The wheel lands on the dark. The Count keeps the free spins.', 'red');
          await nap(1200);
          await finishRound(cur.baseWin, 'lost');
          return;
        }
        cur = g.open;
      }
      closeOv();
      await freeSpins(cur);
    }
    /* the gamble screen: collect the spins, or spin the wheel for 4 more */
    function wheelSvg(p, n) {
      const a = p * 360, rad = (d) => (d - 90) * Math.PI / 180, R = 92;
      const pt = (d) => (100 + Math.cos(rad(d)) * R).toFixed(2) + ' ' + (100 + Math.sin(rad(d)) * R).toFixed(2);
      const ticks = Array.from({ length: 36 }, (_, i) => '<path d="M' + (100 + Math.cos(rad(i * 10)) * 92).toFixed(1) + ' ' + (100 + Math.sin(rad(i * 10)) * 92).toFixed(1) + ' L' + (100 + Math.cos(rad(i * 10)) * 86).toFixed(1) + ' ' + (100 + Math.sin(rad(i * 10)) * 86).toFixed(1) + '" stroke="#ffe9b0" stroke-width="1.5" opacity=".5"/>').join('');
      const lab = (d, r) => { const x = 100 + Math.cos(rad(d)) * r, y = 100 + Math.sin(rad(d)) * r; return 'x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" transform="rotate(' + d.toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"'; };
      return '<svg viewBox="0 0 200 200" class="cr-wheel-svg">' +
        '<circle cx="100" cy="100" r="98" fill="url(#cr-gold)"/>' +
        '<path d="M100 100 L' + pt(0) + ' A' + R + ' ' + R + ' 0 ' + (a > 180 ? 1 : 0) + ' 1 ' + pt(a) + 'Z" fill="url(#cr-moon)"/>' +
        '<path d="M100 100 L' + pt(a) + ' A' + R + ' ' + R + ' 0 ' + (a > 180 ? 0 : 1) + ' 1 ' + pt(360) + 'Z" fill="#14081c"/>' +
        ticks +
        '<text ' + lab(a / 2, 58) + ' text-anchor="middle" font-family="Bungee,sans-serif" font-size="17" fill="#fff6e0" stroke="#4a0010" stroke-width="3" paint-order="stroke">' + (n + M.GAMBLE_STEP) + ' SPINS</text>' +
        '<text ' + lab(a + (360 - a) / 2, 58) + ' text-anchor="middle" font-family="Cinzel,serif" font-weight="900" font-size="12" fill="#8a7aa8">THE DARK</text>' +
        '<circle cx="100" cy="100" r="16" fill="url(#cr-gold)" stroke="#3a1a00" stroke-width="2"/><circle cx="100" cy="100" r="7" fill="url(#cr-ruby)"/></svg>';
    }
    function gambleChoice(offer) {
      return new Promise((res) => {
        el.ov.hidden = false; el.ov.textContent = '';
        const wheel = h('div', { class: 'cr-wheel' }, h('div', { class: 'cr-wrot', html: wheelSvg(offer.p, offer.n) }), h('i', { class: 'cr-pin' }));
        const done = (v) => { G.ovPrimary = null; snd('click'); res(v); };
        const collect = h('button', { class: 'cr-btn gold big', type: 'button', id: 'cr-collect', onclick: () => done('collect') }, h('small', null, 'PLAY'), offer.n + ' FREE SPINS');
        const gamble = h('button', { class: 'cr-btn red big', type: 'button', id: 'cr-gamble', onclick: () => done('gamble') }, h('small', null, (offer.p * 100).toFixed(1) + '% CHANCE'), 'GAMBLE FOR ' + (offer.n + M.GAMBLE_STEP));
        el.ov.append(h('div', { class: 'cr-gbox', role: 'dialog', 'aria-label': 'Gamble the free spins' },
          h('h3', null, 'Spin the Count’s wheel?'),
          h('p', null, 'Land the blood-red slice for ' + (offer.n + M.GAMBLE_STEP) + ' free spins. Land in the dark and the free spins are lost' + (offer.baseWin > 0 ? ' (the ' + fmt(money(offer.baseWin)) + ' BB already won is still paid).' : '.') + ' The odds are fair: gambling never changes the return.'),
          wheel, h('div', { class: 'cr-buyrow' }, collect, gamble)));
        G.ovPrimary = () => done('collect');
        snd('pop'); setMsg('Play ' + offer.n + ' free spins, or gamble them for ' + (offer.n + M.GAMBLE_STEP) + '?', 'red');
      });
    }
    async function spinWheel(offer) {
      const btns = el.ov.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
      const rot = el.ov.querySelector('.cr-wrot');
      rot.classList.add('spin');
      setMsg('The wheel turns…', 'red');
      const g = await fetchGamble(offer);
      if (!G) return null;
      if (!g) return null;
      /* the wheel stops with the drawn point (x of the way round, clockwise from the top) under the pin */
      const turns = RM ? 1 : 5, deg = turns * 360 + (360 - g.x * 360);
      rot.classList.remove('spin');
      const dur = RM ? 400 : T(3600);
      let ticks = 0;
      const tk = S.interval(() => { if (ticks++ < 40) snd('wheel'); }, 70);
      await rot.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + deg + 'deg)' }], { duration: dur, easing: 'cubic-bezier(.15,.7,.2,1)', fill: 'forwards' }).finished.catch(() => {});
      S.clear(tk);
      if (!G) return null;
      if (g.won) { snd('gwin'); rot.parentNode.classList.add('won'); setMsg('The blood-red slice! ' + g.n + ' free spins!', 'gold'); lightning(false); }
      else { snd('glose'); rot.parentNode.classList.add('lost'); }
      await nap(1300);
      return g;
    }

    /* ===================== the free spins ===================== */
    async function freeSpins(offer) {
      setMsg('Summoning the free spins…', 'red');
      const fs = await fetchFs(offer);
      if (!G) return;
      if (!fs) { busy = false; lockUi(false); setMsg('The connection dropped. Your free spins are safe: spin again to play them.', ''); el.bg.classList.remove('blood'); return; }
      inFs = true;
      el.main.classList.add('fs'); el.bg.classList.add('fs'); el.hud.hidden = false; el.title.hidden = true;
      let left = fs.start;
      const total = () => offer.baseWin + fsTotal;
      let fsTotal = 0;
      el.hudLeft.textContent = String(left); el.hudTotal.textContent = fmt(money(offer.baseWin)); setMult(1);
      snd('organ');
      primary = () => { skip = true; };
      await nap(500);
      for (const sp of fs.spins) {
        if (!G) return;
        left--; el.hudLeft.textContent = String(left);
        landedMoons = 0;
        startRoll();
        await nap(220); if (!G) return;
        const st0 = sp.steps[0];
        await spinTo(st0.c, st0.t, { first: 360, noAntic: true }); if (!G) return;
        grid = st0.c; topRow = st0.t; paintWays(grid); landedMoons = M.countScat(grid);
        winUnits = total();
        await playSteps(sp.steps, { onWin: (u) => { el.hudTotal.textContent = fmt(money(u)); } });
        if (!G) return;
        fsTotal = sp.total;
        el.hudTotal.textContent = fmt(money(total()));
        if (sp.add) {
          left += sp.add; el.hudLeft.textContent = String(left);
          colCells.flat().forEach((c) => { if (c.classList.contains('moon')) c.classList.add('trig'); });
          snd('retrig'); lightning(false);
          await banner('<small>' + sp.scat + ' Blood Moons</small><b>+' + sp.add + ' SPINS</b>', 'big', 1300); if (!G) return;
        }
        await nap(sp.win > 0 ? 380 : 240);
      }
      primary = null;
      skip = false;
      const units = offer.baseWin + fs.total;
      await countWin(money(units), 700); if (!G) return;
      /* the summary card */
      snd('bonus'); B.fx.burst({ el: el.frame, kind: 'coin', count: Math.min(70, 20 + Math.floor(money(fs.total) / Math.max(1, roundCost))), power: 1 });
      const card = h('div', { class: 'cr-outro', role: 'dialog', 'aria-label': 'Free spins summary' },
        h('small', null, fs.capped ? 'MAXIMUM WIN' : 'THE BLOOD MOON SETS'),
        h('span', null, 'You won'),
        h('b', null, fmt(money(fs.total)) + ' BB'),
        h('span', null, 'in ' + fs.played + ' free spins · top multiplier ×' + fs.maxMult + (fs.retrigs ? ' · ' + fs.retrigs + (fs.retrigs > 1 ? ' retriggers' : ' retrigger') : '')),
        h('button', { class: 'cr-btn gold', type: 'button' }, 'CONTINUE'));
      el.box.append(card);
      requestAnimationFrame(() => card.classList.add('in'));
      await new Promise((res) => {
        let over = false;
        const done = () => { if (over) return; over = true; primary = null; card.removeEventListener('click', done); res(); };
        card.addEventListener('click', done); primary = done;
        S.timeout(done, auto ? 2600 : 7000);
      });
      if (!G) return;
      card.remove();
      inFs = false;
      el.main.classList.remove('fs'); el.bg.classList.remove('fs', 'blood'); el.hud.hidden = true; el.title.hidden = false;
      el.hudMult.parentNode.classList.remove('hot');
      await finishRound(units, fs);
    }

    /* ----- keyboard ----- */
    S.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName) && t.tagName !== 'BUTTON') return;
      if (document.querySelector('.bc-veil, .bc-win')) return;
      e.preventDefault(); if (e.repeat) return;
      onSpin();
    });
    S.on(el.frame, 'click', () => { if (busy && !spinning && el.ov.hidden) { if (primary) primary(); else skip = true; } else if (spinning) slam(); });

    /* ----- a held round from before the page was reloaded ----- */
    if (B.online) {
      (async () => {
        let r = null;
        try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { r = null; }
        if (!G || !r || !r.open || busy) return;
        const off = r.open;
        busy = true; lockUi(true); curStake = off.stake; roundCost = off.stake * (off.buy ? M.BUY_X : off.ante ? M.ANTE_NUM / M.ANTE_DEN : 1);
        winUnits = off.baseWin; el.win.textContent = fmt(money(off.baseWin));
        setMsg('Your Blood Moon free spins are waiting!', 'red');
        await nap(700); if (!G) return;
        el.bg.classList.add('blood');
        let cur = off;
        while (cur && cur.canGamble) {
          const choice = await gambleChoice(cur); if (!G) return;
          if (choice !== 'gamble') break;
          const g = await spinWheel(cur); if (!G) return;
          if (!g) { closeOv(); break; }
          if (!g.won) { closeOv(); el.bg.classList.remove('blood'); setMsg('The wheel lands on the dark.', 'red'); await nap(900); await finishRound(cur.baseWin, 'lost'); return; }
          cur = g.open;
        }
        closeOv();
        await freeSpins(cur);
      })();
    }

    if (DEV) {
      const until = (pred) => { devNext = pred; B.ui.toast('Dev: next spin forced'); };
      window.crDev = {
        fs: () => until((o) => o.fs > 0),
        fs5: () => until((o) => o.fs >= 16),
        casc: (n) => until((o) => o.steps.length > (n || 4)),
        big: () => until((o) => o.win >= 2000),
        antic: () => until((o) => !o.fs && o.steps[0].c.slice(0, 4).reduce((a, c) => a + c.filter((s) => s === SY.SCAT).length, 0) >= 3),
        retrig: () => { until((o) => o.fs > 0); devFs = (f) => f.retrigs > 0; },
        bigfs: () => { until((o) => o.fs > 0); devFs = (f) => f.total >= 15000; },
      };
    }
    G.unmount = () => { try { delete window.crDev; } catch (e) { /* fine */ } };
  }

  B.registerGame({
    id: ID, name: 'Count Batula’s Crypt', tagline: 'Up to 117,649 ways. The multiplier never sleeps.', tag: 'Cascading ways', section: 'slots', isNew: true,
    poster: POSTER, rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S.dispose(); } G = null; },
  });
})();
