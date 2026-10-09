/* ===== fishing math ===== */
/* Fishing Frenzy — pure maths. No DOM. Shared verbatim by the browser game and sim/fishing.sim.js.
   5x3 reels, 10 fixed lines (left to right), stake = 10 x line bet. Every random decision takes rng. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).fishing = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 3, CELLS = 15, LINE_COUNT = 10;
  /* symbol ids */
  const TEN = 0, JACK = 1, QUEEN = 2, KING = 3, ACE = 4, BOX = 5, BUOY = 6, ROD = 7, PEL = 8, FISH = 9, SCAT = 10, WILD = 11;
  const SYMBOLS = ['TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'BOX', 'BUOY', 'ROD', 'PEL', 'FISH', 'SCAT', 'WILD'];
  const NAMES = ['10', 'Jack', 'Queen', 'King', 'Ace', 'Tackle box', 'Lifebuoy', 'Rod and reel', 'Pelican', 'Fish', 'Bait tin scatter', 'Captain Batty'];

  /* row on each reel, 0 = top */
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  ];

  /* pays in multiples of the LINE bet (stake / 10), indexed by count 0..5 */
  const PAY = [];
  PAY[TEN]   = [0, 0, 0, 10, 40, 200];
  PAY[JACK]  = [0, 0, 0, 10, 40, 200];
  PAY[QUEEN] = [0, 0, 0, 15, 50, 250];
  PAY[KING]  = [0, 0, 0, 15, 50, 250];
  PAY[ACE]   = [0, 0, 0, 20, 80, 400];
  PAY[FISH]  = [0, 0, 0, 30, 125, 600];
  PAY[BOX]   = [0, 0, 5, 40, 150, 750];
  PAY[BUOY]  = [0, 0, 5, 50, 200, 1000];
  PAY[ROD]   = [0, 0, 10, 75, 300, 1500];
  PAY[PEL]   = [0, 0, 20, 100, 500, 2500];
  PAY[SCAT]  = [0, 0, 0, 0, 0, 0];
  PAY[WILD]  = PAY[PEL]; /* a line of captains pays as pelicans */

  /* fish cash values, in multiples of the TOTAL stake. kind = which fish is drawn. */
  const FISH_VALUES = [
    { v: 2, w: 3600, kind: 0, name: 'Sprat' },
    { v: 5, w: 2400, kind: 1, name: 'Perch' },
    { v: 10, w: 1400, kind: 2, name: 'Chubby chub' },
    { v: 15, w: 800, kind: 3, name: 'Plum wrasse' },
    { v: 20, w: 480, kind: 4, name: 'Puffer' },
    { v: 25, w: 300, kind: 5, name: 'Big-lip bass' },
    { v: 50, w: 80, kind: 6, name: 'Red snapper' },
    { v: 250, w: 15, kind: 7, name: 'Golden whopper' },
  ];
  let FISH_W = 0; for (const f of FISH_VALUES) FISH_W += f.w;
  const WHOPPER = 250;

  const MAX_WIN_X = 5000;            /* whole-round cap, x total stake */
  const FS_AWARD = { 3: 10, 4: 15, 5: 20 };
  const LADDER = [1, 2, 3, 10];      /* fish multiplier per level */
  const CAPTAINS_PER_STEP = 4;
  const RETRIGGER_SPINS = 10;

  /* feature chances */
  const P_BLAST = 0.038;             /* base, exactly 2 scatters: dynamite blasts in a third */
  const P_DUD = 0.06;                /* base, exactly 2 scatters: dynamite thrown but it is a dud (no award, pure tease) */
  const P_NET = 0.04;                /* free spins, fish but no captain: cast net drops a captain in */
  const P_SHOAL = 0.50;              /* free spins, captain but no fish: a shoal leaves fish behind */
  const SHOAL_COUNT = [{ n: 2, w: 50 }, { n: 3, w: 32 }, { n: 4, w: 14 }, { n: 5, w: 4 }];

  /* pre-bonus pick: five floats, one of each perk, shuffled by the maths before the player chooses */
  const PERKS = [
    { id: 'spins3', label: '+3 Free Spins', blurb: 'Three extra casts before you start.' },
    { id: 'spins5', label: '+5 Free Spins', blurb: 'Five extra casts before you start.' },
    { id: 'fish', label: 'Fish Supper', blurb: 'Extra fish on every reel for the whole bonus.' },
    { id: 'crew', label: 'All Hands', blurb: 'Extra Captain Battys on the reels for the whole bonus.' },
    { id: 'mult', label: 'Head Start x2', blurb: 'Start one step up the ladder: fish pay x2 from the first cast.' },
  ];

  /* buy bonus */
  const BUY_PRICE_X = 80;
  const BUY_SCATTERS = [{ n: 3, w: 9830 }, { n: 4, w: 150 }, { n: 5, w: 20 }];

  /* ---------- reel strips ---------- */
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* Strips are laid out once, deterministically, from symbol counts: specials (scatter, captain) are kept at least
     three stops apart so a reel can never show two of them, and no symbol sits directly on top of itself. */
  function buildStrip(counts, seed) {
    const rnd = mulberry32(seed);
    for (let attempt = 0; attempt < 400000; attempt++) {
      const s = [];
      for (let sym = 0; sym < counts.length; sym++) for (let i = 0; i < (counts[sym] || 0); i++) s.push(sym);
      for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = s[i]; s[i] = s[j]; s[j] = t; }
      const L = s.length; let ok = true;
      for (let i = 0; i < L && ok; i++) {
        const a = s[i];
        if (a === s[(i + 1) % L] && a !== FISH) ok = false;
        if (a === SCAT || a === WILD) { if (s[(i + 1) % L] === a || s[(i + 2) % L] === a) ok = false; }
        /* a captain never shares his reel window with a fish: the fish he reels in are always on other reels */
        if (a === WILD) for (let d = -2; d <= 2; d++) if (s[(i + d + L) % L] === FISH) ok = false;
      }
      if (ok) return s;
    }
    throw new Error('fishing: could not lay out strip');
  }

  /* one row per symbol, one column per reel */
  const col = (table) => [0, 1, 2, 3, 4].map((r) => table.map((row) => row[r]));
  const BASE_COUNTS = col([
    /* 10   */ [11, 11, 11, 10, 10],
    /* J    */ [10, 10, 11, 10, 10],
    /* Q    */ [9, 9, 9, 9, 10],
    /* K    */ [9, 9, 9, 9, 9],
    /* A    */ [9, 8, 9, 8, 8],
    /* BOX  */ [7, 7, 6, 6, 6],
    /* BUOY */ [6, 7, 5, 6, 5],
    /* ROD  */ [5, 5, 5, 4, 5],
    /* PEL  */ [4, 4, 3, 4, 3],
    /* FISH */ [6, 6, 6, 6, 6],
    /* SCAT */ [2, 2, 2, 2, 2],
    /* WILD */ [0, 0, 0, 0, 0],
  ]);
  const FREE_COUNTS = col([
    /* 10   */ [13, 13, 13, 13, 13],
    /* J    */ [13, 13, 13, 13, 13],
    /* Q    */ [12, 12, 12, 12, 12],
    /* K    */ [11, 11, 11, 11, 11],
    /* A    */ [10, 10, 10, 10, 10],
    /* BOX  */ [8, 8, 8, 8, 8],
    /* BUOY */ [7, 7, 7, 7, 7],
    /* ROD  */ [6, 5, 6, 5, 6],
    /* PEL  */ [5, 5, 4, 5, 4],
    /* FISH */ [12, 12, 12, 12, 12],
    /* SCAT */ [0, 0, 0, 0, 0],
    /* WILD */ [1, 1, 1, 1, 1],
  ]);
  const CREW_EXTRA = [0, 1, 0, 1, 0];   /* All Hands: an extra captain on reels 2 and 4 */
  const bump = (rows, sym, by) => rows.map((r, i) => { const c = r.slice(); c[sym] += Array.isArray(by) ? by[i] : by; return c; });
  const strips = (rows, seed) => rows.map((c, i) => buildStrip(c, seed + i * 7919));
  const STRIPS = {
    base: strips(BASE_COUNTS, 1101),
    free: strips(FREE_COUNTS, 2202),
    fish: strips(bump(FREE_COUNTS, FISH, 14), 3303),   /* Fish Supper perk */
    crew: strips(bump(FREE_COUNTS, WILD, CREW_EXTRA), 4404),   /* All Hands perk */
  };

  /* ---------- helpers ---------- */
  function fishValue(rng) {
    let r = rng() * FISH_W;
    for (let i = 0; i < FISH_VALUES.length; i++) { r -= FISH_VALUES[i].w; if (r < 0) return FISH_VALUES[i].v; }
    return FISH_VALUES[0].v;
  }
  function pickW(rng, items) {
    let t = 0; for (const it of items) t += it.w;
    let r = rng() * t;
    for (const it of items) { r -= it.w; if (r < 0) return it; }
    return items[items.length - 1];
  }
  const cellOf = (reel, row) => reel * ROWS + row;

  /* grid is column-major: grid[reel * 3 + row] */
  function drawGrid(rng, set, forced) {
    const grid = new Array(CELLS), values = new Array(CELLS).fill(0), stops = new Array(REELS);
    for (let r = 0; r < REELS; r++) {
      const strip = set[r], L = strip.length;
      const stop = forced && forced[r] != null ? forced[r] : Math.floor(rng() * L);
      stops[r] = stop;
      for (let row = 0; row < ROWS; row++) {
        const s = strip[(stop + row) % L];
        grid[r * ROWS + row] = s;
        if (s === FISH) values[r * ROWS + row] = fishValue(rng);
      }
    }
    return { grid, values, stops };
  }

  /* Line wins on a finished grid. Captains substitute for everything except the scatter. */
  function evalLines(grid, lineBet) {
    const wins = []; let total = 0;
    for (let l = 0; l < LINE_COUNT; l++) {
      const ln = LINES[l];
      const s0 = grid[ln[0]], s1 = grid[ROWS + ln[1]], s2 = grid[2 * ROWS + ln[2]], s3 = grid[3 * ROWS + ln[3]], s4 = grid[4 * ROWS + ln[4]];
      const s = [s0, s1, s2, s3, s4];
      let w = 0; while (w < 5 && s[w] === WILD) w++;
      let best = 0, bsym = -1, bcount = 0;
      if (w >= 2) { const p = PAY[WILD][w]; if (p > 0) { best = p; bsym = WILD; bcount = w; } }
      if (w < 5) {
        const base = s[w];
        if (base !== SCAT) {
          let c = w + 1; while (c < 5 && (s[c] === base || s[c] === WILD)) c++;
          const p = PAY[base][c];
          if (p > best) { best = p; bsym = base; bcount = c; }
        }
      }
      if (best > 0) { const pay = best * lineBet; wins.push({ line: l, sym: bsym, count: bcount, pay }); total += pay; }
    }
    return { wins, total };
  }

  function shuffledPerks(rng) {
    const p = PERKS.map((x) => x.id);
    for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    return p;
  }

  /* ---------- base game ---------- */
  /* spin(rng, stake) -> everything about the paid spin. If o.triggered, the UI shows o.perks as hidden floats, the player
     hooks one, and bonus() is then called with that perk to produce the whole free-spins script. */
  function finishBase(rng, stake, d, bought) {
    const grid = d.grid, values = d.values, lineBet = stake / 10;
    const scat = [];
    for (let i = 0; i < CELLS; i++) if (grid[i] === SCAT) scat.push(i);
    let tease = null, blastCell = -1;
    const landed = grid.slice(), landedValues = values.slice();   /* what the reels stop on, before any dynamite */
    if (scat.length === 2 && !bought) {
      const u = rng();
      if (u < P_BLAST) {
        tease = 'blast';
        /* drop it on a reel without a scatter, on a cell that is not part of a line win if there is one */
        const pre = evalLines(grid, lineBet), used = new Array(CELLS).fill(false);
        for (const wn of pre.wins) for (let r = 0; r < wn.count; r++) used[cellOf(r, LINES[wn.line][r])] = true;
        const has = [false, false, false, false, false];
        for (const c of scat) has[(c / ROWS) | 0] = true;
        const free = [], any = [];
        for (let i = 0; i < CELLS; i++) { if (has[(i / ROWS) | 0]) continue; any.push(i); if (!used[i]) free.push(i); }
        const pool = free.length ? free : any;
        blastCell = pool[Math.floor(rng() * pool.length)];
        grid[blastCell] = SCAT; values[blastCell] = 0; scat.push(blastCell);
      } else if (u < P_BLAST + P_DUD) {
        tease = 'dud';
        const has = [false, false, false, false, false];
        for (const c of scat) has[(c / ROWS) | 0] = true;
        const any = []; for (let i = 0; i < CELLS; i++) if (!has[(i / ROWS) | 0]) any.push(i);
        blastCell = any[Math.floor(rng() * any.length)];
      }
    }
    const ev = evalLines(grid, lineBet);
    const cap = MAX_WIN_X * stake;
    const lineWin = Math.min(ev.total, cap);
    const triggered = scat.length >= 3;
    const o = {
      stake, bought: !!bought, stops: d.stops, landed, landedValues, grid, values, scatters: scat, tease, blastCell,
      lines: ev.wins, lineWin, win: lineWin, triggered,
      freeSpins: triggered ? FS_AWARD[Math.min(5, scat.length)] : 0,
      perks: triggered ? shuffledPerks(rng) : null,
    };
    return o;
  }
  function spin(rng, stake) { return finishBase(rng, stake, drawGrid(rng, STRIPS.base), false); }

  /* Buy bonus: costs BUY_PRICE_X x stake. The reels land 3, 4 or 5 scatters (weighted) and line wins on that spin are paid as normal. */
  function buy(rng, stake) {
    const n = pickW(rng, BUY_SCATTERS).n;
    const reels = [0, 1, 2, 3, 4];
    for (let i = 4; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = reels[i]; reels[i] = reels[j]; reels[j] = t; }
    const forced = [null, null, null, null, null];
    const set = STRIPS.base;
    for (let r = 0; r < REELS; r++) {
      const strip = set[r], L = strip.length, at = [];
      for (let i = 0; i < L; i++) if (strip[i] === SCAT) at.push(i);
      const inView = (st) => at.some((pos) => ((pos - st + L) % L) < ROWS);
      if (reels.indexOf(r) < n) forced[r] = (at[Math.floor(rng() * at.length)] - Math.floor(rng() * ROWS) + L) % L;
      else { let st; do { st = Math.floor(rng() * L); } while (inView(st)); forced[r] = st; }
    }
    const o = finishBase(rng, stake, drawGrid(rng, set, forced), true);
    o.price = BUY_PRICE_X * stake;
    return o;
  }

  /* ---------- free spins ---------- */
  /* bonus(rng, stake, {spins, perk, carried}) -> the whole feature as a script the UI plays back.
     carried = what the triggering spin already won (counts towards the cap). */
  function bonus(rng, stake, opt) {
    const perk = opt.perk || null, carried = opt.carried || 0, lineBet = stake / 10;
    const cap = MAX_WIN_X * stake;
    let spinsLeft = opt.spins, level = 0, meter = 0, total = 0, capped = false;
    if (perk === 'spins3') spinsLeft += 3;
    if (perk === 'spins5') spinsLeft += 5;
    if (perk === 'mult') { level = 1; meter = CAPTAINS_PER_STEP; }
    const set = perk === 'fish' ? STRIPS.fish : perk === 'crew' ? STRIPS.crew : STRIPS.free;
    const startSpins = spinsLeft, startLevel = level;
    const spins = [];
    let captainsSeen = 0, fishCaught = 0, maxLevel = level;
    while (spinsLeft > 0 && !capped) {
      spinsLeft--;
      const d = drawGrid(rng, set), grid = d.grid, values = d.values;
      const landed = grid.slice(), landedValues = values.slice();
      let caps = [], fish = [];
      for (let i = 0; i < CELLS; i++) { if (grid[i] === WILD) caps.push(i); else if (grid[i] === FISH) fish.push(i); }
      let feature = null;
      if (fish.length && !caps.length) {
        if (rng() < P_NET) {
          const pool = []; for (let i = 0; i < CELLS; i++) if (grid[i] !== FISH) pool.push(i);
          if (pool.length) {
            const c = pool[Math.floor(rng() * pool.length)];
            grid[c] = WILD; values[c] = 0; caps = [c];
            feature = { type: 'net', cell: c };
          }
        }
      } else if (caps.length && !fish.length) {
        if (rng() < P_SHOAL) {
          const n = pickW(rng, SHOAL_COUNT).n;
          const pool = []; for (let i = 0; i < CELLS; i++) if (grid[i] !== WILD) pool.push(i);
          const cells = [];
          for (let k = 0; k < n && pool.length; k++) {
            const j = Math.floor(rng() * pool.length), c = pool[j]; pool.splice(j, 1);
            const v = fishValue(rng);
            grid[c] = FISH; values[c] = v; cells.push({ cell: c, value: v });
          }
          cells.sort((a, b) => a.cell - b.cell);
          fish = cells.map((x) => x.cell);
          feature = { type: 'shoal', cells };
        }
      }
      const ev = evalLines(grid, lineBet);
      const mult = LADDER[level];
      let sum = 0; for (const c of fish) sum += values[c];
      const collects = [];
      let collectWin = 0;
      if (caps.length && fish.length) {
        for (const c of caps) { const amt = sum * mult * stake; collects.push({ captain: c, amount: amt }); collectWin += amt; }
        fishCaught += fish.length * caps.length;
      }
      const meterBefore = meter, levelBefore = level;
      meter += caps.length; captainsSeen += caps.length;
      const steps = [];
      while (level < LADDER.length - 1 && meter >= CAPTAINS_PER_STEP * (level + 1)) {
        level++; spinsLeft += RETRIGGER_SPINS;
        steps.push({ level, mult: LADDER[level], spins: RETRIGGER_SPINS });
      }
      if (level > maxLevel) maxLevel = level;
      let win = ev.total + collectWin;
      if (carried + total + win >= cap) { win = cap - carried - total; capped = true; }
      total += win;
      spins.push({
        stops: d.stops, landed, landedValues, grid, values, feature,
        lines: ev.wins, lineWin: ev.total, captains: caps, fish, fishSum: sum, mult, collects, collectWin,
        meterBefore, meterAfter: meter, levelBefore, levelAfter: level, steps,
        win, totalAfter: total, spinsLeftAfter: capped ? 0 : spinsLeft, capped,
      });
    }
    return { stake, perk, startSpins, startLevel, startMeter: startLevel * CAPTAINS_PER_STEP, spins, total, capped, maxLevel, captainsSeen, fishCaught };
  }

  /* One complete round for simulation: spin, and if the bonus triggers hook float number `pick`. */
  function play(rng, stake, pick) {
    const o = spin(rng, stake);
    let b = null;
    if (o.triggered) b = bonus(rng, stake, { spins: o.freeSpins, perk: o.perks[pick || 0], carried: o.win });
    return { base: o, bonus: b, total: o.win + (b ? b.total : 0) };
  }
  function playBuy(rng, stake, pick) {
    const o = buy(rng, stake);
    const b = bonus(rng, stake, { spins: o.freeSpins, perk: o.perks[pick || 0], carried: o.win });
    return { base: o, bonus: b, total: o.win + b.total, price: o.price };
  }

  return {
    REELS, ROWS, CELLS, LINE_COUNT, LINES, PAY, SYMBOLS, NAMES,
    SYM: { TEN, JACK, QUEEN, KING, ACE, BOX, BUOY, ROD, PEL, FISH, SCAT, WILD },
    FISH_VALUES, WHOPPER, MAX_WIN_X, FS_AWARD, LADDER, CAPTAINS_PER_STEP, RETRIGGER_SPINS,
    P_BLAST, P_DUD, P_NET, P_SHOAL, SHOAL_COUNT, PERKS, BUY_PRICE_X, BUY_SCATTERS, STRIPS,
    kindOf(v) { for (const f of FISH_VALUES) if (f.v === v) return f.kind; return 0; },
    mulberry32, evalLines, shufflePerks: shuffledPerks, spin, buy, bonus, play, playBuy,
  };
});

/* ===== fishing ===== */
/* Fishing Frenzy — Captain Batty's dusk fishing slot. All outcomes come from BattyMath.fishing; this file only presents them. */
(function () {
  'use strict';
  const ID = 'fishing', M = BattyMath.fishing, h = Batty.h, SY = M.SYM, A = Batty.audio;
  const INK = '#1a1838';
  const FONT = "'Lilita One','Bowlby One','Arial Black',Impact,sans-serif";
  const SNAME = ['ten', 'jack', 'queen', 'king', 'ace', 'box', 'buoy', 'rod', 'pel', 'fish', 'scat', 'wild'];
  const LINE_COLORS = ['#ffd23f', '#ff7a59', '#58e0d0', '#ff9ad5', '#a8e06a', '#7fb8ff', '#ffb347', '#c78df2', '#fff3d6', '#ff5d7a'];
  let S = null, G = null;

  /* ================================================================== art ================================================================== */
  const ST = (w) => 'stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"';
  const lg = (id, stops, x2, y2) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 || 0) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</linearGradient>';
  const rg = (id, stops, cx, cy, r) => '<radialGradient id="' + id + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</radialGradient>';
  const r1 = (n) => Math.round(n * 10) / 10;

  const FISHDEF = [
    { name: 'Sprat', rx: 23, ry: 11, a: '#d6f2fb', b: '#5fa9cf', belly: '#f4fbff', fin: '#3f86b5' },
    { name: 'Perch', rx: 26, ry: 15, a: '#b5e86f', b: '#3b9644', belly: '#f6f9c9', fin: '#ff8a3c' },
    { name: 'Chubby chub', rx: 27, ry: 19, a: '#ffcf7a', b: '#ee6a1c', belly: '#fff2cf', fin: '#e2463f' },
    { name: 'Plum wrasse', rx: 29, ry: 18, a: '#cf9af5', b: '#7636bd', belly: '#f7defF', fin: '#ffd23f' },
    { name: 'Puffer', rx: 22, ry: 21, a: '#fff3a0', b: '#f0ac14', belly: '#fffbe6', fin: '#ff9a3c' },
    { name: 'Big-lip bass', rx: 31, ry: 20, a: '#8be3f2', b: '#1a80b3', belly: '#e3fbff', fin: '#0e5f8f' },
    { name: 'Red snapper', rx: 32, ry: 21, a: '#ff9683', b: '#cf2433', belly: '#ffe3d8', fin: '#96142c' },
    { name: 'Golden whopper', rx: 34, ry: 22, a: '#fff8bd', b: '#ee9a08', belly: '#fffbe0', fin: '#e07f00' },
  ];
  const LOWDEF = [
    { t: '10', a: '#4fd6c8', b: '#0f8088' }, { t: 'J', a: '#6fb2ff', b: '#2059b3' }, { t: 'Q', a: '#c08cf2', b: '#6a35b0' },
    { t: 'K', a: '#ffb65c', b: '#e2601a' }, { t: 'A', a: '#ff8080', b: '#c42b3d' },
  ];

  function gradients(p) {
    let s = '';
    FISHDEF.forEach((f, k) => { s += lg(p + 'f' + k, [[0, f.a], [0.55, f.b], [1, f.b]]); });
    LOWDEF.forEach((f, k) => { s += lg(p + 'l' + k, [[0, f.a], [1, f.b]]); });
    s += lg(p + 'brass', [[0, '#fff3b8'], [0.45, '#f4c542'], [1, '#b07a1e']]);
    s += lg(p + 'hat', [[0, '#ffe873'], [0.6, '#ffd23f'], [1, '#f0a500']]);
    s += lg(p + 'coat', [[0, '#ffd94a'], [1, '#eb9d00']]);
    s += rg(p + 'fur', [[0, '#9a74dc'], [0.7, '#6a44ad'], [1, '#553390']], '45%', '35%', '70%');
    s += lg(p + 'coral', [[0, '#ff8f6b'], [1, '#e2463f']]);
    s += lg(p + 'wood', [[0, '#b98454'], [1, '#6e4424']]);
    s += lg(p + 'sea', [[0, '#58e0d0'], [1, '#12808f']]);
    s += rg(p + 'glow', [[0, '#fffbe0', 1], [0.45, '#ffd23f', 0.85], [1, '#ff9a3c', 0]], '50%', '50%', '50%');
    s += lg(p + 'steel', [[0, '#f4f8ff'], [1, '#8fa2bd']]);
    return s;
  }

  /* chunky cartoon fish, facing right; k = kind 0..7 */
  function fishArt(k, p) {
    const F = FISHDEF[k], cx = 53, cy = k === 7 ? 43 : 44, rx = F.rx, ry = F.ry;
    const dark = F.b, X = (f) => r1(cx + rx * f), Y = (f) => r1(cy + ry * f);
    let s = '';
    if (k === 7) s += '<circle cx="50" cy="46" r="47" fill="url(#' + p + 'glow)"/>';
    /* tail, dorsal, pelvic */
    s += '<path d="M' + X(-0.8) + ' ' + cy + ' L' + r1(cx - rx - 14) + ' ' + Y(-0.9) + ' Q' + r1(cx - rx - 6) + ' ' + cy + ' ' + r1(cx - rx - 14) + ' ' + Y(0.9) + ' Z" fill="' + F.fin + '" ' + ST(3) + '/>';
    if (k === 6) s += '<path d="M' + X(-0.5) + ' ' + Y(-0.8) + ' l4 -11 l5 8 l5 -10 l5 9 l5 -8 l4 11 Z" fill="' + F.fin + '" ' + ST(3) + '/>';
    else if (k !== 4) s += '<path d="M' + X(-0.45) + ' ' + Y(-0.82) + ' Q' + r1(cx - 4) + ' ' + r1(cy - ry - 14) + ' ' + X(0.42) + ' ' + Y(-0.86) + ' Z" fill="' + F.fin + '" ' + ST(3) + '/>';
    if (k !== 4) s += '<path d="M' + r1(cx - 8) + ' ' + Y(0.88) + ' Q' + r1(cx - 2) + ' ' + r1(cy + ry + 11) + ' ' + r1(cx + 9) + ' ' + Y(0.86) + ' Z" fill="' + F.fin + '" ' + ST(3) + '/>';
    if (k === 4) { /* puffer spikes */
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * 6.283 + 0.2, c = Math.cos(a), sn = Math.sin(a);
        if (c > 0.82) continue;
        s += '<path d="M' + r1(cx + c * rx * 0.9 - sn * 3.4) + ' ' + r1(cy + sn * ry * 0.9 + c * 3.4) + ' L' + r1(cx + c * (rx + 7)) + ' ' + r1(cy + sn * (ry + 7)) + ' L' + r1(cx + c * rx * 0.9 + sn * 3.4) + ' ' + r1(cy + sn * ry * 0.9 - c * 3.4) + ' Z" fill="' + F.fin + '" ' + ST(2.4) + '/>';
      }
    }
    s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + p + 'f' + k + ')" ' + ST(3) + '/>';
    s += '<path d="M' + X(-0.8) + ' ' + Y(0.36) + ' Q' + cx + ' ' + Y(1.18) + ' ' + X(0.86) + ' ' + Y(0.3) + ' Q' + cx + ' ' + Y(0.62) + ' ' + X(-0.8) + ' ' + Y(0.36) + ' Z" fill="' + F.belly + '" opacity=".8"/>';
    /* markings */
    if (k === 0) s += '<path d="M' + X(-0.7) + ' ' + Y(-0.05) + ' Q' + cx + ' ' + Y(-0.35) + ' ' + X(0.3) + ' ' + Y(-0.1) + '" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>';
    if (k === 1) for (let i = 0; i < 4; i++) { const f = -0.58 + i * 0.27, top = -Math.sqrt(1 - f * f) * 0.93; s += '<path d="M' + X(f) + ' ' + Y(top) + ' q-3.5 ' + r1(ry * 0.55) + ' 0 ' + r1(ry * (0.75 - top * 0.35)) + '" fill="none" stroke="#1f5e2c" stroke-width="4" stroke-linecap="round" opacity=".6"/>'; }
    if (k === 2) s += '<circle cx="' + X(-0.3) + '" cy="' + Y(-0.35) + '" r="2" fill="#c9500f" opacity=".6"/><circle cx="' + X(-0.05) + '" cy="' + Y(-0.5) + '" r="1.7" fill="#c9500f" opacity=".6"/><circle cx="' + X(-0.5) + '" cy="' + Y(-0.1) + '" r="1.6" fill="#c9500f" opacity=".6"/><circle cx="' + X(0.5) + '" cy="' + Y(0.3) + '" r="4.2" fill="#ff7d8f" opacity=".7"/>';
    if (k === 3) s += '<path d="M' + X(-0.82) + ' ' + Y(-0.05) + ' q' + r1(rx * 0.2) + ' -8 ' + r1(rx * 0.4) + ' 0 t' + r1(rx * 0.4) + ' 0 t' + r1(rx * 0.36) + ' 0" fill="none" stroke="#ff9ad5" stroke-width="3.6" stroke-linecap="round" opacity=".9"/><circle cx="' + X(-0.35) + '" cy="' + Y(-0.55) + '" r="2" fill="#ffd23f"/><circle cx="' + X(0) + '" cy="' + Y(-0.62) + '" r="1.6" fill="#ffd23f"/>';
    if (k === 7) {
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4 - (j === 2 ? 1 : 0); i++) { const x = cx - rx * 0.62 + i * 10 + (j % 2) * 5, y = cy - ry * 0.42 + j * 8; s += '<path d="M' + r1(x) + ' ' + r1(y) + ' q5 4 0 9" fill="none" stroke="#c97700" stroke-width="2" stroke-linecap="round" opacity=".55"/>'; }
    }
    /* gill + pectoral fin */
    if (k !== 4) s += '<path d="M' + X(0.3) + ' ' + Y(-0.5) + ' Q' + X(0.14) + ' ' + cy + ' ' + X(0.3) + ' ' + Y(0.52) + '" fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round" opacity=".35"/>';
    s += '<path d="M' + r1(cx - 1) + ' ' + r1(cy + 3) + ' q-11 2 -10 ' + r1(Math.min(11, ry * 0.6)) + ' q9 0 13 -7 Z" fill="' + F.fin + '" ' + ST(2.2) + '/>';
    /* eye */
    const er = k === 4 ? 7.6 : k === 0 ? 4.6 : 6.3, ex = X(0.52), ey = Y(k === 4 ? -0.2 : -0.24);
    s += '<circle cx="' + ex + '" cy="' + ey + '" r="' + er + '" fill="#fff" ' + ST(2) + '/><circle cx="' + r1(ex + er * 0.22) + '" cy="' + r1(ey + er * 0.1) + '" r="' + r1(er * 0.55) + '" fill="' + INK + '"/><circle cx="' + r1(ex + er * 0.42) + '" cy="' + r1(ey - er * 0.22) + '" r="' + r1(er * 0.22) + '" fill="#fff"/>';
    /* mouths and character */
    if (k === 5) {
      s += '<path d="M' + r1(ex - er - 1) + ' ' + r1(ey - 1) + ' Q' + ex + ' ' + r1(ey - er - 3) + ' ' + r1(ex + er + 1) + ' ' + r1(ey - 1) + ' Z" fill="' + dark + '" ' + ST(2) + '/>';
      s += '<ellipse cx="' + X(0.93) + '" cy="' + r1(cy + 1) + '" rx="6.5" ry="4" fill="#ff5470" ' + ST(2) + '/><ellipse cx="' + X(0.91) + '" cy="' + r1(cy + 8.5) + '" rx="5.8" ry="3.8" fill="#ff5470" ' + ST(2) + '/>';
    } else if (k === 6) {
      s += '<path d="M' + r1(ex - er - 2) + ' ' + r1(ey - er - 3) + ' L' + r1(ex + er + 2) + ' ' + r1(ey - er * 0.2) + '" fill="none" ' + ST(3.4) + '/>';
      s += '<path d="M' + X(0.5) + ' ' + Y(0.38) + ' L' + X(0.93) + ' ' + Y(0.22) + ' L' + X(0.6) + ' ' + Y(0.66) + ' Z" fill="#5a0a18" ' + ST(2) + '/><path d="M' + X(0.58) + ' ' + Y(0.4) + ' l2.4 4 l2.4 -5 l2.4 4 l2.4 -5" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>';
    } else if (k === 4) {
      s += '<ellipse cx="' + X(0.72) + '" cy="' + Y(0.36) + '" rx="3.4" ry="4.2" fill="#7a2b12" ' + ST(2) + '/><circle cx="' + X(0.3) + '" cy="' + Y(0.3) + '" r="4" fill="#ff8f9c" opacity=".65"/>';
    } else {
      s += '<path d="M' + X(0.6) + ' ' + Y(0.34) + ' q' + r1(rx * 0.14) + ' 5 ' + r1(rx * 0.3) + ' -1.5" fill="none" ' + ST(2.3) + '/>';
    }
    /* shine */
    s += '<path d="M' + X(-0.5) + ' ' + Y(-0.6) + ' Q' + r1(cx - 2) + ' ' + Y(-0.96) + ' ' + X(0.22) + ' ' + Y(-0.76) + '" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>';
    if (k === 7) {
      s += '<path d="M' + X(0.2) + ' ' + r1(cy - ry - 1) + ' l-3 -12 l6 5 l4 -8 l4 8 l6 -5 l-3 12 Z" fill="#ff5d5d" ' + ST(2.4) + '/><circle cx="' + r1(X(0.2) + 7) + '" cy="' + r1(cy - ry - 4) + '" r="1.6" fill="#fff8bd"/>';
      const star = (x, y, r) => '<path d="M' + x + ' ' + (y - r) + ' q' + r * 0.18 + ' ' + r * 0.82 + ' ' + r + ' ' + r + ' q-' + r * 0.82 + ' ' + r * 0.18 + ' -' + r + ' ' + r + ' q-' + r * 0.18 + ' -' + r * 0.82 + ' -' + r + ' -' + r + ' q' + r * 0.82 + ' -' + r * 0.18 + ' ' + r + ' -' + r + ' Z" fill="#fff" opacity=".95"/>';
      s += star(14, 20, 6) + star(90, 66, 5) + star(86, 14, 4);
    }
    return s;
  }

  /* 10 J Q K A: painted bobber floats */
  function lowArt(i, p) {
    const L = LOWDEF[i];
    return '<line x1="50" y1="7" x2="50" y2="24" ' + ST(6.5) + '/><line x1="50" y1="7" x2="50" y2="24" stroke="' + L.a + '" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="50" cy="7" r="3.6" fill="url(#' + p + 'brass)" ' + ST(1.6) + '/>' +
      '<rect x="42.5" y="19" width="15" height="8" rx="2.5" fill="url(#' + p + 'brass)" ' + ST(2.2) + '/>' +
      '<circle cx="50" cy="59" r="33" fill="#fff5dc"/>' +
      '<path d="M22 76 A33 33 0 0 0 78 76 A44 44 0 0 1 22 76 Z" fill="#e3c592" opacity=".9"/>' +
      '<path d="M17.3 55 A33 33 0 0 1 82.7 55 Q66 62 50 55 Q34 48 17.3 55 Z" fill="url(#' + p + 'l' + i + ')"/>' +
      '<path d="M17.3 55 Q34 48 50 55 Q66 62 82.7 55" fill="none" stroke="' + INK + '" stroke-width="2" opacity=".55"/>' +
      '<circle cx="50" cy="59" r="33" fill="none" ' + ST(3) + '/>' +
      '<path d="M27 44 Q31 33 42 29" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>' +
      '<text x="50" y="' + (L.t === '10' ? 73 : 75) + '" text-anchor="middle" font-family="' + FONT + '" font-size="' + (L.t === '10' ? 36 : 44) + '" fill="#fffaf0" stroke="' + INK + '" stroke-width="5.5" stroke-linejoin="round" paint-order="stroke"' + (L.t === '10' ? ' textLength="46" lengthAdjust="spacingAndGlyphs"' : '') + '>' + L.t + '</text>';
  }

  function boxArt(p) {
    return '<line x1="74" y1="30" x2="80" y2="10" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/><circle cx="80" cy="12" r="6" fill="#fff5dc" ' + ST(2.2) + '/><path d="M74 12 A6 6 0 0 1 86 12 Z" fill="#ff5d5d" ' + ST(2.2) + '/>' +
      '<path d="M36 31 Q36 15 50 15 Q64 15 64 31" fill="none" ' + ST(9.5) + '/><path d="M36 31 Q36 15 50 15 Q64 15 64 31" fill="none" stroke="url(#' + p + 'brass)" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M11 36 Q11 28 19 28 H81 Q89 28 89 36 V50 H11 Z" fill="#5fd08c" ' + ST(3) + '/>' +
      '<path d="M11 50 H89 V80 Q89 89 80 89 H20 Q11 89 11 80 Z" fill="#2f9460" ' + ST(3) + '/>' +
      '<path d="M14 80 Q14 86 20 86 H80 Q86 86 86 80 V74 H14 Z" fill="#1f7046" opacity=".8"/>' +
      '<path d="M20 35 H80" stroke="#b6f5cf" stroke-width="3" stroke-linecap="round" opacity=".75"/><path d="M20 42 H80" stroke="#2f9460" stroke-width="2" stroke-linecap="round" opacity=".7"/>' +
      '<rect x="22" y="44" width="11" height="13" rx="2.5" fill="url(#' + p + 'brass)" ' + ST(2.2) + '/><rect x="67" y="44" width="11" height="13" rx="2.5" fill="url(#' + p + 'brass)" ' + ST(2.2) + '/>' +
      '<rect x="37" y="57" width="26" height="22" rx="4" fill="#fff5dc" ' + ST(2.2) + '/>' +
      '<path d="M51 61 v8.5 q0 5.5 -5.5 5.5 q-4.5 0 -4.5 -4.5" fill="none" stroke="#e2463f" stroke-width="3" stroke-linecap="round"/><circle cx="51" cy="61" r="2" fill="' + INK + '"/>';
  }
  function buoyArt() {
    let s = '<circle cx="50" cy="50" r="40" fill="none" ' + ST(6) + '/><circle cx="50" cy="50" r="40" fill="none" stroke="#e8c98d" stroke-width="3.2" stroke-dasharray="4 2.6"/>' +
      '<circle cx="50" cy="50" r="24" fill="none" stroke="' + INK + '" stroke-width="25"/><circle cx="50" cy="50" r="24" fill="none" stroke="#fffaf0" stroke-width="19.5"/>' +
      '<circle cx="50" cy="50" r="24" fill="none" stroke="#f0513c" stroke-width="19.5" stroke-dasharray="18.85 18.85" transform="rotate(22.5 50 50)"/>' +
      '<circle cx="50" cy="50" r="29" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="20 162" transform="rotate(-150 50 50)" stroke-linecap="round" opacity=".7"/>' +
      '<circle cx="50" cy="50" r="18" fill="none" stroke="#000" stroke-width="5" opacity=".1"/>';
    for (let i = 0; i < 4; i++) s += '<rect x="46" y="9" width="8" height="12" rx="2.5" fill="#e8c98d" ' + ST(2) + ' transform="rotate(' + (i * 90) + ' 50 50)"/>';
    return s;
  }
  function rodArt(p) {
    return '<path d="M90 7 Q98 30 82 44 Q70 54 79 64" fill="none" stroke="#fff" stroke-width="1.5" opacity=".9"/>' +
      '<path d="M79 63 v9 q0 6.5 -6.5 6.5 q-5.5 0 -5.5 -5.5" fill="none" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/><path d="M79 63 v9 q0 6.5 -6.5 6.5 q-5.5 0 -5.5 -5.5" fill="none" stroke="#dfe7f2" stroke-width="2.4" stroke-linecap="round"/>' +
      '<line x1="36" y1="66" x2="90" y2="7" ' + ST(6) + '/><line x1="36" y1="66" x2="90" y2="7" stroke="#ff7a59" stroke-width="2.8" stroke-linecap="round"/>' +
      '<line x1="12" y1="92" x2="38" y2="64" ' + ST(11) + '/><line x1="12" y1="92" x2="38" y2="64" stroke="#e0aa6c" stroke-width="6.5" stroke-linecap="round"/><line x1="16" y1="86" x2="22" y2="92" stroke="#b07a3e" stroke-width="2"/><line x1="23" y1="79" x2="29" y2="85" stroke="#b07a3e" stroke-width="2"/>' +
      '<circle cx="56" cy="44" r="3" fill="none" stroke="' + INK + '" stroke-width="2.4"/><circle cx="72" cy="26.5" r="2.6" fill="none" stroke="' + INK + '" stroke-width="2.2"/>' +
      '<circle cx="47" cy="77" r="16" fill="url(#' + p + 'brass)" ' + ST(3) + '/><circle cx="47" cy="77" r="9" fill="#1f6f8f" ' + ST(2.2) + '/><circle cx="47" cy="77" r="3" fill="#fff5dc" ' + ST(1.6) + '/>' +
      '<path d="M38 68 Q41 64 46 63.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>' +
      '<line x1="47" y1="77" x2="62" y2="88" ' + ST(4.5) + '/><circle cx="63.5" cy="89" r="5" fill="#ff5d5d" ' + ST(2.2) + '/>';
  }
  function pelArt(p) {
    return '<path d="M30 92 v5 M30 97 h-6 M30 97 h5 M46 92 v5 M46 97 h-6 M46 97 h5" fill="none" stroke="#ff9a3c" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M32 60 Q24 42 34 30 L54 30 Q48 46 54 62 Z" fill="#fffaf0" ' + ST(3) + '/>' +
      '<ellipse cx="38" cy="72" rx="27" ry="20" fill="#fffaf0" ' + ST(3) + '/>' +
      '<path d="M34 59 Q30 50 32 42 L50 42 Q48 52 52 60 Z" fill="#fffaf0"/>' +
      '<path d="M14 78 Q30 96 56 86 Q46 92 34 92 Q20 90 14 78 Z" fill="#d5deec" opacity=".9"/>' +
      '<path d="M20 68 Q38 56 58 72 Q46 86 26 80 Q30 76 32 72 Q24 72 20 68 Z" fill="#cfd9ea" ' + ST(2.6) + '/>' +
      '<path d="M57 18 L97 31 L60 36 Z" fill="#ffc24a" ' + ST(3) + '/>' +
      '<path d="M59 34 L96 31.5 Q88 62 66 57 Q57 48 59 34 Z" fill="url(#' + p + 'coral)" ' + ST(3) + '/>' +
      '<path d="M66 40 Q76 46 88 40" fill="none" stroke="#fff" stroke-width="2" opacity=".5" stroke-linecap="round"/>' +
      '<path d="M78 31 l4 -12 l7 5 Z" fill="#58e0d0" ' + ST(2.2) + '/>' +
      '<circle cx="46" cy="27" r="16" fill="#fffaf0" ' + ST(3) + '/>' +
      '<path d="M32 20 l-7 -6 l9 0 l-3 -8 l8 6" fill="#fffaf0" ' + ST(2.6) + '/>' +
      '<circle cx="51" cy="24" r="5.4" fill="#fff" ' + ST(2) + '/><circle cx="52.5" cy="24.6" r="2.8" fill="' + INK + '"/><circle cx="53.4" cy="23.4" r="1" fill="#fff"/>' +
      '<path d="M44 16 Q51 13 58 18" fill="none" ' + ST(2.4) + '/><circle cx="40" cy="33" r="3.6" fill="#ff9ab0" opacity=".7"/>';
  }
  function ribbon(p, fill, label, color, size) {
    return '<path d="M4 79 H96 L89 88 L96 97 H4 L11 88 Z" fill="' + fill + '" ' + ST(3) + '/>' +
      '<text x="50" y="93.6" text-anchor="middle" font-family="' + FONT + '" font-size="' + (size || 15.5) + '" fill="' + color + '" stroke="' + INK + '" stroke-width="3.4" stroke-linejoin="round" paint-order="stroke" textLength="' + (label.length * 10.5) + '" lengthAdjust="spacingAndGlyphs">' + label + '</text>';
  }
  function scatArt(p) {
    let rays = '';
    for (let i = 0; i < 12; i++) rays += '<path d="M50 44 L46 -2 L54 -2 Z" fill="#ffd23f" opacity=".55" transform="rotate(' + i * 30 + ' 50 44)"/>';
    return '<circle cx="50" cy="44" r="46" fill="url(#' + p + 'glow)"/>' + rays +
      '<line x1="47" y1="10" x2="47" y2="34" ' + ST(5) + '/><line x1="47" y1="10" x2="47" y2="34" stroke="#b98454" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M48.5 9 L68 15 L48.5 22 Z" fill="url(#' + p + 'coral)" ' + ST(2.4) + '/>' +
      '<rect x="33" y="30" width="36" height="7" rx="2.5" fill="url(#' + p + 'coral)" ' + ST(2.6) + '/>' +
      '<rect x="37" y="36" width="28" height="18" rx="2" fill="#fff5dc" ' + ST(2.8) + '/>' +
      '<circle cx="46" cy="45" r="4.6" fill="#58e0d0" ' + ST(2.2) + '/><circle cx="58" cy="45" r="4.6" fill="#58e0d0" ' + ST(2.2) + '/>' +
      '<rect x="68" y="40" width="7" height="14" rx="2" fill="url(#' + p + 'brass)" ' + ST(2.4) + '/>' +
      '<path d="M8 52 H92 Q89 72 76 76 H24 Q11 72 8 52 Z" fill="#e2463f" ' + ST(3) + '/>' +
      '<path d="M11 58 H89" stroke="#fff5dc" stroke-width="4.5"/><path d="M14 66 Q50 72 86 66" fill="none" stroke="#9c1730" stroke-width="2" opacity=".5"/>' +
      '<path d="M2 78 Q10 68 20 75 T40 75 T60 75 T80 75 T98 73 V86 H2 Z" fill="url(#' + p + 'sea)" ' + ST(2.8) + '/>' +
      '<path d="M12 76 q4 -3 8 0 M50 76 q4 -3 8 0 M72 76 q4 -3 8 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>' +
      ribbon(p, 'url(#' + p + 'brass)', 'BONUS', '#fffaf0', 15);
  }

  /* Captain Batty. o.rod: holding his rod; o.banner: WILD ribbon; o.wink */
  function captainArt(p, o) {
    o = o || {};
    let s = '';
    /* ears */
    s += '<path d="M21 38 L7 6 Q25 11 34 31 Z" fill="url(#' + p + 'fur)" ' + ST(3) + '/><path d="M19.5 30 L13 13 Q22 17 27.5 28 Z" fill="#f6a8bd"/>';
    s += '<path d="M79 38 L93 6 Q75 11 66 31 Z" fill="url(#' + p + 'fur)" ' + ST(3) + '/><path d="M80.5 30 L87 13 Q78 17 72.5 28 Z" fill="#f6a8bd"/>';
    /* wings behind the coat */
    s += '<path d="M24 78 Q6 74 3 92 Q9 88 12 94 Q15 88 20 93 Q22 86 28 88 Z" fill="url(#' + p + 'fur)" ' + ST(2.6) + '/>';
    if (!o.rod) s += '<path d="M76 78 Q94 74 97 92 Q91 88 88 94 Q85 88 80 93 Q78 86 72 88 Z" fill="url(#' + p + 'fur)" ' + ST(2.6) + '/>';
    /* raincoat */
    s += '<path d="M21 101 Q20 73 50 70 Q80 73 79 101 Z" fill="url(#' + p + 'coat)" ' + ST(3) + '/>';
    s += '<path d="M50 80 V101" stroke="' + INK + '" stroke-width="2" opacity=".5"/><circle cx="45.5" cy="89" r="2.3" fill="' + INK + '"/><circle cx="45.5" cy="97" r="2.3" fill="' + INK + '"/>';
    s += '<path d="M34 73 L50 86 L66 73 L60 69 L50 77 L40 69 Z" fill="#f2a200" ' + ST(2.4) + '/>';
    /* head */
    s += '<path d="M24 53 l-7 2 l6 4 l-5 4 l8 2 Z" fill="url(#' + p + 'fur)" ' + ST(2.4) + '/><path d="M76 53 l7 2 l-6 4 l5 4 l-8 2 Z" fill="url(#' + p + 'fur)" ' + ST(2.4) + '/>';
    s += '<ellipse cx="50" cy="53" rx="26" ry="23.5" fill="url(#' + p + 'fur)" ' + ST(3) + '/>';
    s += '<ellipse cx="50" cy="62.5" rx="15" ry="11" fill="#cdb8f2"/>';
    /* eyes */
    s += '<ellipse cx="39.5" cy="50" rx="8" ry="9" fill="#fff" ' + ST(2.2) + '/><ellipse cx="60.5" cy="50" rx="8" ry="9" fill="#fff" ' + ST(2.2) + '/>';
    if (o.wink) s += '<path d="M53.5 51 Q60.5 45 67.5 51" fill="none" ' + ST(2.8) + '/><ellipse cx="60.5" cy="53" rx="7" ry="6.4" fill="#8a63cc"/>';
    else s += '<circle cx="62" cy="51" r="4.2" fill="' + INK + '"/><circle cx="63.6" cy="49.2" r="1.5" fill="#fff"/>';
    s += '<circle cx="41" cy="51" r="4.2" fill="' + INK + '"/><circle cx="42.6" cy="49.2" r="1.5" fill="#fff"/>';
    s += '<path d="M32 40.5 Q39 36.5 46 40" fill="none" ' + ST(2.6) + '/><path d="M54 38 Q61 33.5 68 38.5" fill="none" ' + ST(2.6) + '/>';
    /* nose, grin, fangs */
    s += '<path d="M46 57 Q50 54 54 57 Q53 61.5 50 61.5 Q47 61.5 46 57 Z" fill="#f6a8bd" ' + ST(1.8) + '/>';
    s += '<path d="M39 63 Q50 67 61 63 Q58 75 50 75 Q42 75 39 63 Z" fill="#4a1535" ' + ST(2.2) + '/><ellipse cx="50" cy="72" rx="4.6" ry="2.2" fill="#ff7a8a"/>';
    s += '<path d="M43.5 64.6 l2.2 5.2 l2.2 -4.4 Z" fill="#fff" stroke="' + INK + '" stroke-width="1"/><path d="M52.1 65.4 l2.2 4.4 l2.2 -5.2 Z" fill="#fff" stroke="' + INK + '" stroke-width="1"/>';
    s += '<circle cx="31" cy="60" r="4" fill="#ff8fb0" opacity=".45"/><circle cx="69" cy="60" r="4" fill="#ff8fb0" opacity=".45"/>';
    /* sou'wester */
    s += '<path d="M27 37 Q25 11 50 10 Q75 11 73 37 Z" fill="url(#' + p + 'hat)" ' + ST(3) + '/>';
    s += '<path d="M50 10.5 V33" stroke="#d48f00" stroke-width="1.6" opacity=".8"/><path d="M34 21 Q37 14.5 45 13.5" fill="none" stroke="#fff8c4" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>';
    s += '<path d="M9 41 Q17 29.5 50 30.5 Q83 29.5 91 41 Q84 47 50 45.5 Q16 47 9 41 Z" fill="url(#' + p + 'hat)" ' + ST(3) + '/>';
    s += '<path d="M14 41.5 Q30 46 50 44 Q70 46 86 41.5" fill="none" stroke="#d48f00" stroke-width="2" opacity=".7" stroke-linecap="round"/>';
    if (o.rod) {
      s += '<path d="M95 12 Q100 28 92 40" fill="none" stroke="#fff" stroke-width="1.4" opacity=".95"/>';
      s += '<circle cx="92" cy="45" r="5" fill="#fff5dc" ' + ST(2) + '/><path d="M87 45 A5 5 0 0 1 97 45 Z" fill="#ff5d5d" ' + ST(2) + '/>';
      s += '<line x1="68" y1="101" x2="95" y2="12" ' + ST(6.5) + '/><line x1="68" y1="101" x2="95" y2="12" stroke="#b98454" stroke-width="3" stroke-linecap="round"/>';
      s += '<circle cx="79" cy="80" r="6.5" fill="url(#' + p + 'steel)" ' + ST(2.2) + '/><circle cx="79" cy="80" r="2" fill="' + INK + '"/>';
      s += '<path d="M66 86 Q73 80 79 86 Q80 93 73 95 Q66 94 66 86 Z" fill="url(#' + p + 'fur)" ' + ST(2.4) + '/>';
    }
    if (o.banner) s += ribbon(p, 'url(#' + p + 'coral)', 'WILD', '#fffaf0', 16);
    return s;
  }

  const SYMBOL_ART = (p) => {
    const m = {
      ten: lowArt(0, p), jack: lowArt(1, p), queen: lowArt(2, p), king: lowArt(3, p), ace: lowArt(4, p),
      box: boxArt(p), buoy: buoyArt(p), rod: rodArt(p), pel: pelArt(p), scat: scatArt(p),
      wild: captainArt(p, { rod: true, banner: true }), cap: captainArt(p, { rod: true }), head: captainArt(p, {}),
    };
    for (let k = 0; k < 8; k++) m['f' + k] = fishArt(k, p);
    return m;
  };
  function defsSvg() {
    const p = 'fishing-', art = SYMBOL_ART(p);
    let s = '<svg width="0" height="0" aria-hidden="true" focusable="false"><defs>' + gradients(p) + '</defs>';
    for (const k in art) s += '<symbol id="' + p + 's-' + k + '" viewBox="0 0 100 100">' + art[k] + '</symbol>';
    return s + '</svg>';
  }
  const useSvg = (key, cls) => '<svg viewBox="0 0 100 100"' + (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true"><use href="#fishing-s-' + key + '"/></svg>';

  function logoSvg(p) {
    const word = (t, x, len, fill) => '<text x="' + x + '" y="62" font-family="' + FONT + '" font-size="60" textLength="' + len + '" lengthAdjust="spacingAndGlyphs" fill="' + fill + '" stroke="' + INK + '" stroke-width="12" stroke-linejoin="round" paint-order="stroke">' + t + '</text>';
    return '<svg viewBox="0 0 560 84" aria-label="Fishing Frenzy" role="img"><defs>' + lg(p + 'lg1', [[0, '#fff6b8'], [0.5, '#ffd23f'], [1, '#f08a1c']]) + lg(p + 'lg2', [[0, '#ffc0a0'], [0.5, '#ff7a59'], [1, '#d93a3a']]) + '</defs>' +
      '<g transform="translate(0 5)" opacity=".35">' + word('FISHING', 14, 262, INK).replace('stroke-width="12"', 'stroke-width="14"') + word('FRENZY', 300, 244, INK).replace('stroke-width="12"', 'stroke-width="14"') + '</g>' +
      word('FISHING', 14, 262, 'url(#' + p + 'lg1)') + word('FRENZY', 300, 244, 'url(#' + p + 'lg2)') +
      '<path d="M22 30 Q60 20 120 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/></svg>';
  }

  /* ---------- scenery ---------- */
  function lighthouseSvg(p) {
    return '<svg class="ff-lh" viewBox="0 0 200 260" aria-hidden="true"><defs>' + lg(p + 'beam', [[0, '#fff8d0', 0.75], [1, '#fff8d0', 0]], 1, 0) + rg(p + 'lamp', [[0, '#fffbe0', 1], [0.4, '#ffd23f', 0.7], [1, '#ffd23f', 0]], '50%', '50%', '50%') + '</defs>' +
      '<g class="ff-beam"><path d="M74 73 L420 10 L420 150 Z" fill="url(#' + p + 'beam)"/></g>' +
      '<path d="M0 262 V216 Q30 196 72 201 Q112 205 134 224 Q166 236 200 262 Z" fill="#33265a"/><path d="M0 216 Q30 196 72 201 Q112 205 134 224" fill="none" stroke="#ff9a76" stroke-width="2.5" opacity=".55"/>' +
      '<rect x="108" y="196" width="34" height="24" fill="#fff0dc" ' + ST(2.5) + '/><path d="M104 197 L125 180 L146 197 Z" fill="#e2463f" ' + ST(2.5) + '/><rect x="120" y="205" width="9" height="9" fill="#ffd23f" ' + ST(1.8) + '/>' +
      '<path d="M52 206 L60 92 H88 L96 206 Z" fill="#fff3e0" ' + ST(3) + '/>' +
      '<path d="M58.2 118 H89.8 L91.4 140 H56.6 Z" fill="#e2463f"/><path d="M54.9 164 H93.1 L94.7 186 H53.3 Z" fill="#e2463f"/>' +
      '<path d="M78 93 H88 L96 206 H82 Z" fill="#1a1838" opacity=".14"/><path d="M52 206 L60 92 H88 L96 206 Z" fill="none" ' + ST(3) + '/>' +
      '<rect x="70.5" y="148" width="7" height="10" rx="3.5" fill="#33265a"/><path d="M68 206 V192 Q74 184 80 192 V206 Z" fill="#6e4424" ' + ST(2) + '/>' +
      '<circle cx="74" cy="73" r="34" fill="url(#' + p + 'lamp)"/>' +
      '<rect x="53" y="84" width="42" height="9" rx="2" fill="#2b2350" ' + ST(2.5) + '/>' +
      '<rect x="62" y="62" width="24" height="22" fill="#fff3a8" ' + ST(2.5) + '/><path d="M70 62 V84 M78 62 V84" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<path d="M57 62 L74 43 L91 62 Z" fill="#e2463f" ' + ST(2.5) + '/><circle cx="74" cy="41" r="3.2" fill="#ffd23f" ' + ST(1.8) + '/></svg>';
  }
  function cloudsSvg() {
    const cloud = (x, y, w, o) => '<g opacity="' + o + '"><ellipse cx="' + x + '" cy="' + y + '" rx="' + w + '" ry="' + r1(w * 0.14) + '" fill="#c96f9a"/><ellipse cx="' + r1(x - w * 0.3) + '" cy="' + r1(y - w * 0.09) + '" rx="' + r1(w * 0.36) + '" ry="' + r1(w * 0.13) + '" fill="#d8809e"/><ellipse cx="' + r1(x + w * 0.22) + '" cy="' + r1(y - w * 0.12) + '" rx="' + r1(w * 0.42) + '" ry="' + r1(w * 0.15) + '" fill="#d8809e"/><ellipse cx="' + r1(x + w * 0.05) + '" cy="' + r1(y + w * 0.05) + '" rx="' + r1(w * 0.9) + '" ry="' + r1(w * 0.07) + '" fill="#ffc08a"/></g>';
    return '<svg class="ff-clouds" viewBox="0 0 800 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + cloud(130, 60, 110, 0.75) + cloud(420, 110, 150, 0.6) + cloud(690, 50, 100, 0.7) + cloud(600, 150, 80, 0.5) + cloud(250, 150, 70, 0.45) + '</svg>';
  }
  function farSvg() {
    return '<svg class="ff-far" viewBox="0 0 400 60" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">' +
      '<path d="M150 60 Q200 34 250 44 Q300 22 350 36 Q380 30 400 40 V60 Z" fill="#4a2f6b"/><path d="M150 60 Q200 34 250 44 Q300 22 350 36 Q380 30 400 40" fill="none" stroke="#ff9a76" stroke-width="1.5" opacity=".5"/>' +
      '<path d="M60 58 h34 l-5 6 h-24 Z" fill="#2b2350"/><path d="M76 56 V26 L96 54 Z M73 56 V34 L60 55 Z" fill="#3b2d66"/></svg>';
  }
  function aboveHtml() {
    return '<div class="ff-above"><div class="ff-sky"></div><div class="ff-stars"></div>' + cloudsSvg() + '<div class="ff-sun"></div>' + farSvg() + lighthouseSvg('fishing-') + '<div class="ff-sea"><i></i></div></div>';
  }
  function belowHtml() {
    let kelp = '';
    const kx = [40, 70, 118, 540, 610, 668, 742, 770];
    kx.forEach((x, i) => { const hgt = 90 + ((i * 37) % 70); kelp += '<path class="ff-kelp" style="animation-delay:-' + (i * 0.7) + 's" d="M' + x + ' 220 q-14 -' + r1(hgt * 0.25) + ' 0 -' + r1(hgt * 0.5) + ' t0 -' + r1(hgt * 0.5) + '" fill="none" stroke="' + (i % 2 ? '#1c8f7c' : '#27b08e') + '" stroke-width="' + (9 - (i % 3) * 2) + '" stroke-linecap="round"/>'; });
    const coral = (x, y, c, sc) => '<g transform="translate(' + x + ' ' + y + ') scale(' + sc + ')" fill="none" stroke="' + c + '" stroke-width="9" stroke-linecap="round"><path d="M0 0 V-34 M0 -14 Q-18 -18 -20 -40 M0 -20 Q16 -24 18 -48 M-20 -30 Q-30 -34 -30 -46"/></g>';
    return '<div class="ff-below"><div class="ff-rays"></div>' +
      '<svg class="ff-surface" viewBox="0 0 800 120" preserveAspectRatio="xMidYMin slice" aria-hidden="true">' +
      '<path d="M0 0 H800 V16 Q760 26 720 16 T640 16 T560 16 T480 16 T400 16 T320 16 T240 16 T160 16 T80 16 T0 16 Z" fill="#c9fff6" opacity=".55"/>' +
      '<path d="M300 0 H500 Q492 40 452 46 H348 Q308 40 300 0 Z" fill="#082042"/><path d="M344 46 l-10 14 l18 -4 Z" fill="#082042"/><path d="M400 46 V120" stroke="#082042" stroke-width="2.5" stroke-dasharray="6 5"/></svg>' +
      '<svg class="ff-bed" viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<path d="M470 190 L520 96 L600 84 L690 112 L716 190 Z" fill="#0d3763" opacity=".8"/><path d="M560 92 V30 M560 40 H596 M540 190 L560 92" stroke="#0d3763" stroke-width="7" stroke-linecap="round" opacity=".8" fill="none"/>' +
      '<path d="M0 220 V150 Q80 120 170 150 Q260 178 360 160 Q470 138 560 164 Q680 196 800 150 V220 Z" fill="#0b2a55"/>' +
      '<path d="M0 150 Q80 120 170 150 Q260 178 360 160 Q470 138 560 164 Q680 196 800 150" fill="none" stroke="#2f7fa8" stroke-width="3" opacity=".45"/>' +
      kelp + coral(210, 196, '#ff7a59', 1) + coral(250, 206, '#ff9ab0', 0.7) + coral(480, 200, '#ff9ab0', 0.9) + coral(712, 204, '#ff7a59', 0.8) +
      '<g transform="translate(330 150)"><circle cx="34" cy="14" r="46" fill="#ffd23f" opacity=".13"/><path d="M4 22 Q34 -18 64 22 Z" fill="#8a5a34" stroke="#04132c" stroke-width="3"/><rect x="4" y="22" width="60" height="30" rx="3" fill="#6e4424" stroke="#04132c" stroke-width="3"/><path d="M4 30 H64 M20 22 V52 M48 22 V52" stroke="#f4c542" stroke-width="3"/><rect x="29" y="24" width="10" height="11" rx="2" fill="#f4c542" stroke="#04132c" stroke-width="2"/><circle cx="12" cy="20" r="4" fill="#ffd23f"/><circle cx="22" cy="16" r="4" fill="#ffe873"/><circle cx="46" cy="16" r="4" fill="#ffd23f"/><circle cx="56" cy="20" r="4" fill="#ffe873"/></g>' +
      '<path d="M0 220 V196 Q120 176 260 198 Q420 220 560 200 Q700 184 800 204 V220 Z" fill="#061a3a"/></svg></div>';
  }

  /* lobby poster */
  function posterSvg() {
    const p = 'fishing-p-';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Fishing Frenzy"><defs>' + gradients(p) +
      lg(p + 'sky', [[0, '#27245f'], [0.34, '#74428f'], [0.6, '#ff7a59'], [0.74, '#ffc46b']]) + lg(p + 'water', [[0, '#ff9f78'], [0.12, '#2aa9a4'], [0.55, '#0f5f86'], [1, '#0b2545']]) +
      lg(p + 'lg1', [[0, '#fff6b8'], [0.5, '#ffd23f'], [1, '#f08a1c']]) + lg(p + 'lg2', [[0, '#ffc0a0'], [0.5, '#ff7a59'], [1, '#d93a3a']]) +
      rg(p + 'sun', [[0, '#fff8d0', 1], [0.3, '#ffd98a', 0.9], [1, '#ff9a59', 0]], '50%', '50%', '50%') + '</defs>' +
      '<rect width="320" height="400" fill="url(#' + p + 'sky)"/>' +
      '<circle cx="232" cy="262" r="150" fill="url(#' + p + 'sun)"/><circle cx="232" cy="262" r="46" fill="#fff3bd"/>' +
      '<g opacity=".7"><ellipse cx="60" cy="150" rx="60" ry="8" fill="#c96f9a"/><ellipse cx="70" cy="156" rx="56" ry="4" fill="#ffc08a"/><ellipse cx="280" cy="176" rx="50" ry="6" fill="#c96f9a"/><ellipse cx="276" cy="181" rx="46" ry="3" fill="#ffc08a"/></g>' +
      '<g transform="translate(-6 180) scale(.36)"><path d="M0 262 V216 Q30 196 72 201 Q112 205 134 224 Q166 236 200 262 Z" fill="#33265a"/><path d="M52 206 L60 92 H88 L96 206 Z" fill="#fff3e0" ' + ST(4) + '/><path d="M58.2 118 H89.8 L91.4 140 H56.6 Z" fill="#e2463f"/><path d="M54.9 164 H93.1 L94.7 186 H53.3 Z" fill="#e2463f"/><rect x="62" y="62" width="24" height="22" fill="#fff3a8" ' + ST(4) + '/><path d="M57 62 L74 43 L91 62 Z" fill="#e2463f" ' + ST(4) + '/><path d="M74 73 L360 20 L360 130 Z" fill="#fff8d0" opacity=".3"/></g>' +
      '<rect y="272" width="320" height="128" fill="url(#' + p + 'water)"/>' +
      '<g fill="#ffe9b0" opacity=".7"><rect x="206" y="282" width="52" height="3" rx="1.5"/><rect x="216" y="292" width="34" height="3" rx="1.5"/><rect x="198" y="304" width="64" height="3" rx="1.5"/><rect x="222" y="316" width="26" height="3" rx="1.5"/></g>' +
      /* leaping whopper on the line */
      '<path d="M222 150 Q150 96 86 196" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>' +
      '<g transform="translate(22 176) rotate(-24 50 50) scale(1.02)">' + fishArt(7, p) + '</g>' +
      '<g fill="#fff" opacity=".85"><circle cx="46" cy="282" r="4"/><circle cx="62" cy="270" r="3"/><circle cx="104" cy="276" r="3.5"/><circle cx="34" cy="262" r="2.5"/></g>' +
      /* captain in his boat */
      '<g transform="translate(128 132) scale(1.72)">' + captainArt(p, { rod: true }) + '</g>' +
      '<path d="M112 302 H316 Q308 352 282 360 H150 Q122 350 112 302 Z" fill="#e2463f" ' + ST(4) + '/><path d="M116 314 H312" stroke="#fff5dc" stroke-width="8"/>' +
      '<path d="M-4 356 Q16 338 40 352 T88 352 T136 352 T184 352 T232 352 T280 352 T328 350 V404 H-4 Z" fill="#12808f" ' + ST(3.5) + '/>' +
      '<path d="M-4 376 Q20 362 44 374 T92 374 T140 374 T188 374 T236 374 T284 374 T332 372 V404 H-4 Z" fill="#0b4f73"/>' +
      '<g transform="translate(232 322) scale(.5)">' + fishArt(2, p) + '</g><g transform="translate(8 330) scale(.44)">' + fishArt(5, p) + '</g>' +
      /* lettering */
      '<g font-family="' + FONT + '" text-anchor="middle" stroke-linejoin="round" paint-order="stroke">' +
      '<text x="160" y="72" font-size="64" textLength="268" lengthAdjust="spacingAndGlyphs" fill="' + INK + '" stroke="' + INK + '" stroke-width="16" opacity=".4" transform="translate(0 6)">FISHING</text>' +
      '<text x="160" y="72" font-size="64" textLength="268" lengthAdjust="spacingAndGlyphs" fill="url(#' + p + 'lg1)" stroke="' + INK + '" stroke-width="12">FISHING</text>' +
      '<text x="160" y="126" font-size="54" textLength="226" lengthAdjust="spacingAndGlyphs" fill="' + INK + '" stroke="' + INK + '" stroke-width="15" opacity=".4" transform="translate(0 6)">FRENZY</text>' +
      '<text x="160" y="126" font-size="54" textLength="226" lengthAdjust="spacingAndGlyphs" fill="url(#' + p + 'lg2)" stroke="' + INK + '" stroke-width="11">FRENZY</text></g>' +
      '</svg>';
  }

  /* ================================================================== sound ================================================================== */
  const tone = (o) => A.tone(o), noise = (o) => A.noise(o);
  const snd = {
    start() { noise({ d: 0.28, v: 0.07, lp: 500, f2: 2600 }); tone({ f: 170, f2: 330, d: 0.2, type: 'triangle', v: 0.08 }); },
    stop(i) { tone({ f: 200 - i * 9, f2: 85, d: 0.1, type: 'triangle', v: 0.24 }); noise({ d: 0.045, v: 0.1, lp: 1500 }); },
    bell(n) { const f = [1175, 1397, 1760, 2093, 2349][Math.min(4, n - 1)]; tone({ f, d: 1.0, type: 'sine', v: 0.2 }); tone({ f: f * 2.01, d: 0.55, type: 'sine', v: 0.07 }); tone({ f: f * 2.76, d: 0.3, type: 'sine', v: 0.035 }); },
    antic(sec) { tone({ f: 196, f2: 587, d: sec, type: 'sawtooth', v: 0.045 }); tone({ f: 294, f2: 880, d: sec, type: 'triangle', v: 0.05 }); for (let t = 0; t < sec; t += 0.11) tone({ f: 1500 + t * 500, d: 0.02, type: 'square', v: 0.03, t }); },
    fuse(sec) { noise({ d: sec, v: 0.07, hp: 4200 }); for (let t = 0; t < sec; t += 0.07) tone({ f: 2400 + Math.random() * 900, d: 0.015, type: 'square', v: 0.02, t }); },
    boom() { Batty.sfx('thunder'); tone({ f: 130, f2: 28, d: 0.55, type: 'sine', v: 0.5 }); noise({ d: 0.4, v: 0.35, lp: 2600, f2: 180 }); },
    dud() { noise({ d: 0.35, v: 0.09, lp: 800 }); tone({ f: 233, f2: 220, d: 0.28, type: 'sawtooth', v: 0.09, t: 0.25 }); tone({ f: 196, f2: 185, d: 0.28, type: 'sawtooth', v: 0.09, t: 0.55 }); tone({ f: 156, f2: 110, d: 0.7, type: 'sawtooth', v: 0.09, t: 0.85 }); },
    cast() { noise({ d: 0.2, v: 0.09, hp: 2600, f2: 7500 }); tone({ f: 800, f2: 1700, d: 0.14, type: 'sine', v: 0.05 }); },
    ratchet(n) { for (let i = 0; i < n; i++) tone({ f: 900 + i * 45, d: 0.018, type: 'square', v: 0.045, t: i * 0.032 }); },
    caught(i) { const f = 587 * Math.pow(1.0595, Math.min(i, 12) * 2); tone({ f, d: 0.08, type: 'square', v: 0.06 }); tone({ f: f * 1.5, d: 0.24, type: 'triangle', v: 0.13, t: 0.05 }); },
    captain() { tone({ f: 147, d: 0.16, type: 'sawtooth', v: 0.1 }); tone({ f: 196, d: 0.3, type: 'sawtooth', v: 0.1, t: 0.14 }); tone({ f: 294, d: 0.16, type: 'square', v: 0.05 }); tone({ f: 392, d: 0.3, type: 'square', v: 0.05, t: 0.14 }); },
    pip() { tone({ f: 1320, d: 0.1, type: 'triangle', v: 0.16 }); tone({ f: 1760, d: 0.3, type: 'sine', v: 0.12, t: 0.07 }); },
    plop() { tone({ f: 380, f2: 950, d: 0.08, type: 'sine', v: 0.2 }); noise({ d: 0.08, v: 0.05, hp: 3000 }); },
    bubbles(n) { for (let i = 0; i < n; i++) { const f = 300 + Math.random() * 700; tone({ f, f2: f * 1.9, d: 0.06, type: 'sine', v: 0.06, t: i * 0.07 + Math.random() * 0.04 }); } },
    shanty() { /* What shall we do with the drunken sailor */
      const B = Batty.notes, m = [[B.A4, 1], [B.A4, 0.5], [B.A4, 0.5], [B.A4, 1], [B.A4, 0.5], [B.A4, 0.5], [B.A4, 1], [B.D4, 1], [B.F4, 1], [B.A4, 1], [B.G4, 1], [B.G4, 0.5], [B.G4, 0.5], [B.G4, 1], [B.G4, 0.5], [B.G4, 0.5], [B.G4, 1], [B.C4, 1], [B.E4, 1], [B.G4, 1], [B.A4, 0.5], [B.C5, 0.5], [B.D5, 3]];
      A.seq(m, { step: 0.105, type: 'square', v: 0.085 }); A.seq(m.map((n) => [n[0] * 2, n[1]]), { step: 0.105, type: 'triangle', v: 0.07 });
      A.seq([[147, 4], [147, 4], [131, 4], [131, 4], [147, 4]], { step: 0.105, type: 'sawtooth', v: 0.06, d: 0.09 });
    },
    retrigger() { const B = Batty.notes; A.seq([B.D5, B.F5, B.A5, [B.D5 * 2, 1], B.A5, [B.D5 * 2, 3]], { step: 0.09, type: 'square', v: 0.1 }); A.seq([B.D4, 0, B.A4, 0, [B.D4, 4]], { step: 0.09, type: 'sawtooth', v: 0.07 }); noise({ d: 0.6, v: 0.05, hp: 5000 }); },
    win(tier) { const B = Batty.notes; const m = tier > 1 ? [B.D5, B.F5, B.A5, B.D5 * 2, B.A5, [B.D5 * 2, 2]] : tier ? [B.D5, B.F5, B.A5, [B.D5 * 2, 2]] : [B.A4, B.D5, [B.F5, 2]]; A.seq(m, { step: 0.075, type: 'triangle', v: 0.17 }); },
    dive() { Batty.sfx('splash'); tone({ f: 520, f2: 70, d: 1.3, type: 'sine', v: 0.16 }); noise({ d: 1.5, v: 0.14, lp: 3000, f2: 220 }); snd.bubbles(12); },
    surface() { tone({ f: 90, f2: 520, d: 0.9, type: 'sine', v: 0.14 }); noise({ d: 0.9, v: 0.12, lp: 300, f2: 4000 }); S && S.timeout(() => Batty.sfx('splash'), 700); },
    net() { noise({ d: 0.45, v: 0.16, lp: 400, f2: 5000 }); tone({ f: 300, f2: 120, d: 0.35, type: 'triangle', v: 0.1, t: 0.3 }); },
    pick() { tone({ f: 660, f2: 990, d: 0.1, type: 'triangle', v: 0.14 }); noise({ d: 0.12, v: 0.08, hp: 2500 }); },
    reveal() { const B = Batty.notes; A.seq([B.A4, B.D5, B.F5, [B.A5, 3]], { step: 0.08, type: 'square', v: 0.1 }); },
    wave() { noise({ d: 2.2, v: 0.022, lp: 350, f2: 1300 }); },
    gull() { tone({ f: 1500, f2: 1050, d: 0.22, type: 'sawtooth', v: 0.018 }); tone({ f: 1450, f2: 980, d: 0.3, type: 'sawtooth', v: 0.018, t: 0.28 }); },
    count() { tone({ f: 1250, d: 0.02, type: 'square', v: 0.035 }); },
  };

    /* ================================================================== game ================================================================== */
  const WHEEL = (function () { let s = '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="#fff5dc" stroke-linecap="round"><circle cx="50" cy="50" r="26" stroke-width="8"/>'; for (let i = 0; i < 4; i++) s += '<path d="M50 9 V91" stroke-width="6.5" transform="rotate(' + i * 45 + ' 50 50)"/>'; return s + '</g><circle cx="50" cy="50" r="9" fill="#ffd23f" stroke="#fff5dc" stroke-width="4"/><rect class="ff-stopico" x="36" y="36" width="28" height="28" rx="5" fill="#fff5dc"/></svg>'; })();
  const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h5.5L9.5 22 19 10h-6z" fill="currentColor"/></svg>';
  const LOOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M18.5 2.5v4.6h-4.6M5.5 21.500v-4.6h4.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const short = (n) => (n >= 1e6 ? Math.round(n / 1e5) / 10 + 'M' : n >= 1e4 ? Math.round(n / 100) / 10 + 'K' : Batty.fmt(n));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const MSGS = ['Good luck, shipmate', '3 boats win free spins', 'Captain Batty reels in every fish', 'Every 4th captain: +10 spins', 'Tight lines!', '10 lines, left to right', 'Mind the pelican'];
  const perkOf = (id) => M.PERKS.find((x) => x.id === id);
  const hasFeat = (b, t) => b.spins.some((s) => s.feature && s.feature.type === t);
  const FORCES = {
    trigger: { base: (o) => o.triggered && !o.tease },
    four: { base: (o) => o.scatters.length >= 4 },
    blast: { base: (o) => o.tease === 'blast' },
    dud: { base: (o) => o.tease === 'dud' },
    tease: { base: (o) => !o.triggered && !o.tease && o.scatters.length === 2 && o.scatters[1] < 9 },
    win: { base: (o) => o.lineWin >= 3 * o.stake && o.lines.length >= 2 && !o.triggered },
    net: { base: (o) => o.triggered && !o.tease, bonus: (b) => hasFeat(b, 'net') },
    shoal: { base: (o) => o.triggered && !o.tease, bonus: (b) => hasFeat(b, 'shoal') },
    retrigger: { base: (o) => o.triggered && !o.tease, bonus: (b) => b.maxLevel > b.startLevel },
    top: { base: (o) => o.triggered && !o.tease, bonus: (b) => b.maxLevel === 3 },
    whopper: { base: (o) => o.triggered && !o.tease, bonus: (b) => b.spins.some((s) => s.collects.length && s.fish.some((c) => s.values[c] === M.WHOPPER)) },
    all: { base: (o) => o.triggered && !o.tease, bonus: (b) => hasFeat(b, 'net') && hasFeat(b, 'shoal') && b.maxLevel > b.startLevel && b.spins.length <= 28 },
    blank: { base: (o) => o.triggered && !o.tease, bonus: (b) => b.total === 0 },
  };
  function roll(fn, pred, max) { let o = fn(); if (pred) for (let i = 0; i < max && !pred(o); i++) o = fn(); return o; }

  function createGame(root) {
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const dev = /[?&]dev/.test(location.search) ? (window.__fishingDev = { force: null, speed: 0, perks: null, last: null, rounds: 0, staked: 0, won: 0 }) : null;
    const FISH = SY.FISH, WILD = SY.WILD, SCAT = SY.SCAT;
    let busy = false, auto = 0, turbo = false, mode = 'base', skip = false, skipWaiters = [], pending = null, primaryHook = null, round = null, pickEl = null;
    let cw = 70, chh = 84, hz = 200, W = 0, H = 0, wide = false, sunX = 300, depth = 0, depthTarget = 0, tagStake = 100, hudSpins = 0, dead = false;
    const scale = () => (dev && dev.speed ? dev.speed : turbo ? 0.55 : 1) * (reduce ? 0.8 : 1);
    const T = (ms) => ms * scale();
    const wait = (ms) => S.sleep(T(ms));

    /* ---------- DOM ---------- */
    const world = h('div', { class: 'ff-world', html: aboveHtml() + belowHtml() });
    const cv = h('canvas', { class: 'ff-amb', 'aria-hidden': 'true' });
    const logo = h('div', { class: 'ff-logo', html: logoSvg('fishing-') });
    const topEl = h('div', { class: 'ff-top' }, logo);

    const spinsOut = h('output', null, '0'), multOut = h('output', null, '×1');
    const pips = [0, 1, 2, 3].map(() => h('i', { class: 'ff-pip', html: useSvg('head') }));
    const ladder = M.LADDER.map((m) => h('em', null, '×' + m));
    const hud = h('div', { class: 'ff-hud', 'aria-live': 'off' },
      h('div', { class: 'ff-plq ff-pspins' }, h('small', null, 'Free spins'), spinsOut),
      h('div', { class: 'ff-plq ff-pmeter' }, h('div', { class: 'ff-pips' }, pips), h('div', { class: 'ff-ladder' }, ladder)),
      h('div', { class: 'ff-plq ff-pmult' }, h('small', null, 'Fish pay'), multOut));

    const signLabel = h('small', null, 'Win'), signOut = h('output', null, '0'), signMsg = h('span', { class: 'ff-msg' }, MSGS[0]);
    const sign = h('div', { class: 'ff-sign msg' }, h('div', { class: 'ff-winrow' }, signLabel, signOut), signMsg);
    const mascot = h('button', { class: 'ff-mascot', type: 'button', 'aria-label': 'Captain Batty', html: useSvg('cap') });

    const reelsEl = h('div', { class: 'ff-reels' });
    const over = h('div', { class: 'ff-over', html: '<svg class="ff-lines" viewBox="0 0 5 3" preserveAspectRatio="none" aria-hidden="true"></svg>' });
    const linesEl = over.firstChild;
    const win = h('div', { class: 'ff-window' }, reelsEl, over);
    const frame = h('div', { class: 'ff-frame' }, h('i', { class: 'ff-post l' }), h('i', { class: 'ff-post r' }), hud, sign, mascot, win,
      h('i', { class: 'ff-brass tl' }), h('i', { class: 'ff-brass tr' }), h('i', { class: 'ff-brass bl' }), h('i', { class: 'ff-brass br' }));
    const mid = h('div', { class: 'ff-mid' }, frame);

    const stakeBox = h('div', { class: 'ff-stakebox' });
    const stakeCtl = Batty.ui.stake(stakeBox, { id: ID, label: '10 lines · Stake BB', onChange: () => { tagStake = stakeCtl.value; retag(); controls(); } });
    const spinBtn = h('button', { class: 'ff-spin', type: 'button', 'aria-label': 'Spin', html: WHEEL + '<b></b>' });
    const turboBtn = h('button', { class: 'ff-tog', type: 'button', 'aria-pressed': 'false', html: BOLT + '<span>Turbo</span>' });
    const autoBtn = h('button', { class: 'ff-tog', type: 'button', html: LOOP + '<span>Auto</span>' });
    const autoMenu = h('div', { class: 'ff-automenu' }, [10, 25, 50, 100].map((n) => h('button', { type: 'button', onclick: () => startAuto(n) }, String(n))));
    const buyBtn = h('button', { class: 'ff-buy', type: 'button', html: '<span>Buy bonus</span><b></b>' });
    const infoEl = h('div', { class: 'ff-info', html: '<span>Lines <b>10</b></span><span>Max win <b>' + Batty.fmt(M.MAX_WIN_X) + '×</b></span>' });
    const bar = h('div', { class: 'ff-bar' }, h('div', { class: 'ff-barin' }, stakeBox, buyBtn, turboBtn, spinBtn, h('div', { class: 'ff-autowrap' }, autoBtn, autoMenu), infoEl));
    const fxl = h('div', { class: 'ff-fxl' }), pop = h('div', { class: 'ff-pop' });
    root.textContent = '';
    root.append(h('div', { class: 'ff-defs', html: defsSvg() }), world, cv, topEl, mid, bar, fxl, pop);
    tagStake = stakeCtl.value;

    /* ---------- reels ---------- */
    const reels = [];
    function makeCell() {
      const el = h('div', { class: 'ff-cell', html: '<div class="ff-sq"><svg viewBox="0 0 100 100" aria-hidden="true"><use/></svg><b class="ff-tag"></b></div>' });
      return { el, use: el.querySelector('use'), tag: el.querySelector('.ff-tag'), sym: -1, val: -1 };
    }
    function setCell(c, sym, val) {
      val = val || 0;
      if (c.sym === sym && c.val === val) return;
      c.sym = sym; c.val = val;
      const key = sym === FISH ? 'f' + M.kindOf(val) : SNAME[sym];
      c.use.setAttribute('href', '#fishing-s-' + key);
      c.el.setAttribute('data-s', key);
      c.tag.textContent = sym === FISH ? short(val * tagStake) : '';
    }
    function retag() { for (const R of reels) for (const c of R.cells) if (c.sym === FISH) c.tag.textContent = short(c.val * tagStake); }
    for (let r = 0; r < 5; r++) {
      const strip = h('div', { class: 'ff-strip' }), cells = [];
      for (let i = 0; i < 4; i++) { const c = makeCell(); cells.push(c); strip.append(c.el); }
      const el = h('div', { class: 'ff-reel' }, strip);
      reelsEl.append(el);
      reels.push({ i: r, el, strip, cells, pos: 0, on: false, feed: null, done: null, speed: 0, target: 22 });
    }
    const cellAt = (i) => reels[(i / 3) | 0].cells[1 + (i % 3)];
    const xy = (i) => [(((i / 3) | 0) + 0.5) * cw, ((i % 3) + 0.5) * chh];
    const FILL_V = [2, 2, 2, 5, 5, 5, 10, 10, 15, 20, 25];
    function filler(r) {
      const set = mode === 'bonus' ? M.STRIPS.free : M.STRIPS.base, strip = set[r], s = strip[(Math.random() * strip.length) | 0];
      return [s, s === FISH ? FILL_V[(Math.random() * FILL_V.length) | 0] : 0];
    }
    /* a tidy opening screen with no line win on it */
    (function () {
      const g = [SY.ACE, SY.PEL, SY.TEN, FISH, SY.BUOY, SY.QUEEN, SCAT, SY.KING, FISH, SY.ROD, FISH, SY.JACK, SY.BOX, SY.ACE, SCAT];
      const v = [0, 0, 0, 10, 0, 0, 0, 0, 25, 0, 5, 0, 0, 0, 0];
      for (let i = 0; i < 15; i++) setCell(cellAt(i), g[i], v[i]);
      for (let r = 0; r < 5; r++) setCell(reels[r].cells[0], SY.KING, 0);
    })();

    function stepReels(dt) {
      for (const R of reels) {
        if (!R.on) continue;
        R.speed += (R.target - R.speed) * Math.min(1, dt * 9);
        R.pos += R.speed * dt;
        while (R.on && R.pos >= 1) {
          R.pos -= 1;
          for (let i = 3; i > 0; i--) setCell(R.cells[i], R.cells[i - 1].sym, R.cells[i - 1].val);
          const nx = R.feed && R.feed.length ? R.feed.shift() : filler(R.i);
          setCell(R.cells[0], nx[0], nx[1]);
          if (R.feed && !R.feed.length) {
            R.feed = null; R.on = false; R.pos = 0;
            R.strip.style.transform = ''; R.el.classList.remove('spin', 'antic'); R.strip.classList.add('land');
            const d = R.done; R.done = null; if (d) d();
          }
        }
        if (R.on) R.strip.style.transform = 'translate3d(0,' + ((R.pos - 1) * chh).toFixed(1) + 'px,0)';
      }
    }
    function landReel(r, grid, values) {
      const R = reels[r];
      return new Promise((res) => {
        R.done = res;
        R.feed = [[grid[r * 3 + 2], values[r * 3 + 2]], [grid[r * 3 + 1], values[r * 3 + 1]], [grid[r * 3], values[r * 3]], filler(r)];
        if (skip) R.target = 46;
      });
    }
    function pause(ms) {
      return new Promise((res) => { if (skip) { S.timeout(res, 25); return; } S.timeout(res, ms); skipWaiters.push(res); });
    }
    function requestSkip() {
      if (!root.classList.contains('ff-spinning') || skip) return;
      skip = true; Batty.sfx('click');
      for (const R of reels) if (R.on) R.target = 46;
      const w = skipWaiters; skipWaiters = []; w.forEach((f) => f());
    }
    async function spinReels(grid, values, allowAntic) {
      skip = false; skipWaiters = [];
      root.classList.add('ff-spinning');
      snd.start();
      reels.forEach((R) => { R.strip.classList.remove('land'); R.on = true; R.pos = 0; R.speed = 4; R.target = 21 / Math.max(0.5, Math.min(1, scale() * 1.2)); R.feed = null; R.el.classList.add('spin'); });
      await pause(T(600));
      let sc = 0, antic = false;
      for (let r = 0; r < 5; r++) {
        if (r) {
          if (antic && !skip) {
            const sec = T(1500) / 1000;
            for (let k = r; k < 5; k++) reels[k].el.classList.add('antic');
            reels[r].target = 30; win.classList.add('antic'); snd.antic(sec);
            await pause(sec * 1000);
          } else await pause(T(250));
        }
        await landReel(r, grid, values);
        snd.stop(r);
        let hit = false;
        for (let row = 0; row < 3; row++) if (grid[r * 3 + row] === SCAT) { hit = true; cellAt(r * 3 + row).el.classList.add('scatland'); }
        if (hit) { sc++; snd.bell(sc); }
        antic = allowAntic && sc === 2 && r < 4;
        if (!antic) win.classList.remove('antic');
      }
      win.classList.remove('antic');
      root.classList.remove('ff-spinning');
      skipWaiters = [];
    }

    /* ---------- sign, win lines ---------- */
    function signText(msg) { sign.classList.add('msg'); signMsg.textContent = msg; }
    function signWin(label, value) { sign.classList.remove('msg'); signLabel.textContent = label; signOut.textContent = Batty.fmt(value); }
    function signBump() { sign.classList.remove('bump'); void sign.offsetWidth; sign.classList.add('bump'); }
    async function signCount(label, from, to, ms) {
      signWin(label, from);
      if (to <= from) return;
      const tk = S.interval(() => snd.count(), 75);
      await Promise.race([Batty.ui.countUp(signOut, from, to, ms), S.sleep(ms + 400)]);
      S.clear(tk); signOut.textContent = Batty.fmt(to); signBump();
    }
    function clearMarks() {
      linesEl.innerHTML = ''; reelsEl.classList.remove('dim');
      for (const R of reels) for (const c of R.cells) c.el.classList.remove('win', 'hooked', 'reeling', 'scatland', 'drop');
    }
    function markWins(list) {
      clearMarks();
      let svg = '';
      for (const w of list) {
        const ln = M.LINES[w.line];
        let pts = '0.04,' + (ln[0] + 0.5);
        for (let r = 0; r < 5; r++) pts += ' ' + (r + 0.5) + ',' + (ln[r] + 0.5);
        pts += ' 4.96,' + (ln[4] + 0.5);
        svg += '<polyline points="' + pts + '" class="u"/><polyline points="' + pts + '" stroke="' + LINE_COLORS[w.line] + '"/>';
        for (let r = 0; r < w.count; r++) cellAt(r * 3 + ln[r]).el.classList.add('win');
      }
      linesEl.innerHTML = svg; reelsEl.classList.add('dim');
    }
    async function showWins(wins, from, to, label) {
      const ratio = (to - from) / round.stake;
      markWins(wins);
      snd.win(ratio >= 5 ? 2 : ratio >= 1 ? 1 : 0);
      if (ratio >= 5) Batty.fx.burst({ el: win, kind: 'coin', count: 22, power: 0.8 });
      await signCount(label, from, to, T(clamp(420 + ratio * 170, 420, 1900)));
      await wait(auto || turbo ? 380 : 620);
      if (wins.length > 1 && !auto && !turbo && mode === 'base') {
        for (const w of wins.slice(0, 5)) { markWins([w]); Batty.sfx('tick'); await wait(480); }
        markWins(wins);
      }
    }

    /* ---------- little helpers for staged animation ---------- */
    function callout(html, ms, cls) {
      const el = h('div', { class: 'ff-call ' + (cls || ''), html });
      over.append(el);
      const d = T(ms);
      el.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(-8deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.12) rotate(2deg)', opacity: 1, offset: 0.16 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-1deg)', opacity: 1, offset: 0.24 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-1deg)', opacity: 1, offset: 0.85 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], { duration: d, fill: 'forwards' });
      S.timeout(() => el.remove(), d + 30);
      return S.sleep(d);
    }
    function popCell(c) { c.el.classList.remove('drop'); void c.el.offsetWidth; c.el.classList.add('drop'); }
    function shake() { frame.classList.remove('shake'); void frame.offsetWidth; frame.classList.add('shake'); }
    const centre = (el) => { const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(); return [a.left + a.width / 2 - b.left, a.top + a.height / 2 - b.top]; };
    /* fly a node across the game from one element to another along a little arc */
    function fly(node, fromEl, toEl, dur, o) {
      o = o || {};
      const a = centre(fromEl), b = centre(toEl), dx = b[0] - a[0], dy = b[1] - a[1], lift = o.lift == null ? 50 : o.lift;
      node.style.left = a[0] + 'px'; node.style.top = a[1] + 'px';
      fxl.append(node);
      const base = 'translate(-50%,-50%) ';
      node.animate([
        { transform: base + 'translate(0,0) scale(' + (o.s0 || 1) + ') rotate(0deg)' },
        { transform: base + 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - lift) + 'px) scale(' + (o.s1 || 1.2) + ') rotate(' + (o.spin || 0) / 2 + 'deg)', offset: 0.5 },
        { transform: base + 'translate(' + dx + 'px,' + dy + 'px) scale(' + (o.s2 || 0.5) + ') rotate(' + (o.spin || 0) + 'deg)' },
      ], { duration: dur, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      return S.sleep(dur);
    }

        /* ---------- base game feature: dynamite ---------- */
    async function dynamite(o) {
      const target = cellAt(o.blastCell);
      signText('Fire in the hole!');
      mascot.classList.add('throw');
      const stick = h('div', { class: 'ff-stick', html: '<svg viewBox="0 0 40 80" aria-hidden="true"><path d="M20 22 Q24 10 32 8" fill="none" stroke="#e8c98d" stroke-width="3" stroke-linecap="round"/><g class="ff-spark"><path d="M32 8 l3 -7 l1 6 l6 -3 l-4 5 l6 2 l-7 1 l2 6 l-5 -4 l-4 4 l1 -6 l-6 -1 l6 -2 Z" fill="#ffd23f" stroke="#ff7a59" stroke-width="1.5"/></g><rect x="9" y="20" width="22" height="54" rx="5" fill="#e2463f" stroke="' + INK + '" stroke-width="3"/><rect x="9" y="30" width="22" height="7" fill="#fff5dc" stroke="' + INK + '" stroke-width="2"/><rect x="9" y="57" width="22" height="7" fill="#fff5dc" stroke="' + INK + '" stroke-width="2"/><path d="M14 24 V70" stroke="#fff" stroke-width="2.5" opacity=".35" stroke-linecap="round"/></svg>' });
      stick.style.width = Math.round(cw * 0.42) + 'px';
      snd.cast(); snd.fuse(T(1650) / 1000);
      await fly(stick, mascot, target.el, T(720), { spin: 700, lift: 90, s0: 0.6, s1: 1.3, s2: 1 });
      const wob = stick.firstChild.animate([{ transform: 'rotate(-14deg)' }, { transform: 'rotate(14deg)' }], { duration: 110, iterations: Infinity, direction: 'alternate' });
      target.el.classList.add('hooked');
      await wait(950);
      wob.cancel(); mascot.classList.remove('throw'); target.el.classList.remove('hooked');
      if (o.tease === 'blast') {
        const fl = h('div', { class: 'ff-flash' }); over.append(fl); S.timeout(() => fl.remove(), 600);
        stick.remove(); snd.boom(); shake();
        Batty.fx.burst({ el: target.el, kind: 'spark', count: 46, power: 1.3, colors: ['#ffd23f', '#ff7a59', '#fff', '#e2463f'] });
        setCell(target, SCAT, 0); popCell(target); target.el.classList.add('scatland');
        S.timeout(() => snd.bell(3), T(260));
        signText('Boom! Third boat blasted in');
        await wait(1150);
      } else {
        const puff = h('div', { class: 'ff-puff', html: '<i></i><i></i><i></i><i></i><i></i>' });
        const p = xy(o.blastCell); puff.style.left = p[0] + 'px'; puff.style.top = p[1] + 'px'; over.append(puff); S.timeout(() => puff.remove(), 1400);
        snd.dud();
        stick.animate([{ opacity: 1 }, { opacity: 0, marginTop: '40px' }], { duration: T(700), fill: 'forwards', delay: T(250) });
        S.timeout(() => stick.remove(), T(1000));
        signText('Damp squib. Sorry, shipmate');
        await callout('<b>Dud!</b>', 1250, 'sad');
      }
    }

    /* ---------- free spins features ---------- */
    async function netFeature(s) {
      const c = cellAt(s.feature.cell);
      callout('<b>Cast the net!</b>', 1500, 'top');
      const net = h('div', { class: 'ff-net' }); over.append(net); snd.net();
      net.animate([{ transform: 'translateY(-108%) rotate(-4deg)' }, { transform: 'translateY(4%) rotate(1deg)', offset: 0.8 }, { transform: 'translateY(0)' }], { duration: T(520), easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
      await wait(540);
      shake(); s.fish.forEach((f) => cellAt(f).el.classList.add('hooked'));
      await wait(520);
      setCell(c, WILD, 0); popCell(c); Batty.sfx('splash'); snd.captain();
      Batty.fx.burst({ el: c.el, kind: 'spark', count: 26, power: 0.9, colors: ['#bff5ee', '#fff', '#58e0d0', '#ffd23f'] });
      await wait(420);
      net.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-110%) rotate(3deg)' }], { duration: T(420), easing: 'ease-in', fill: 'forwards' });
      await wait(440); net.remove();
      s.fish.forEach((f) => cellAt(f).el.classList.remove('hooked'));
    }
    async function shoalFeature(s) {
      callout('<b>Shoal ahoy!</b>', 1500, 'top');
      snd.bubbles(16); snd.net();
      const els = [], total = T(1500), span = 5 * cw + 140;
      for (let i = 0; i < 18; i++) {
        const size = Math.round(cw * (0.3 + Math.random() * 0.28));
        const el = h('div', { class: 'ff-shoalfish', html: useSvg('f' + ((Math.random() * 6) | 0)) });
        el.style.width = size + 'px'; el.style.top = Math.round(Math.random() * (3 * chh - size)) + 'px';
        over.append(el); els.push(el);
        const wob = 8 + Math.random() * 14;
        el.animate([{ transform: 'translate(-70px,0)' }, { transform: 'translate(' + span * 0.33 + 'px,' + -wob + 'px)' }, { transform: 'translate(' + span * 0.66 + 'px,' + wob + 'px)' }, { transform: 'translate(' + span + 'px,0)' }], { duration: total * (0.8 + Math.random() * 0.3), delay: i * total * 0.028, easing: 'linear', fill: 'both' });
      }
      for (const f of s.feature.cells) {
        const reel = (f.cell / 3) | 0;
        S.timeout(() => { const c = cellAt(f.cell); setCell(c, FISH, f.value); popCell(c); snd.plop(); }, total * (0.22 + reel * 0.15));
      }
      await S.sleep(total * 1.5 + 60);
      els.forEach((e) => e.remove());
    }

    /* every captain reels in every fish */
    async function collect(s, cur, limit) {
      const st = round.stake, per = clamp(2800 / (s.fish.length * s.collects.length), 200, 440);
      let n = 0;
      reelsEl.classList.add('dim');
      for (const c of s.collects) cellAt(c.captain).el.classList.add('win');
      for (const f of s.fish) cellAt(f).el.classList.add('win');
      for (const c of s.collects) {
        const cc = cellAt(c.captain), a = xy(c.captain);
        cc.el.classList.add('reeling'); snd.captain();
        await wait(340);
        for (const f of s.fish) {
          const fc = cellAt(f), b = xy(f), amt = s.values[f] * s.mult * st;
          linesEl.insertAdjacentHTML('beforeend', '<line class="fl" x1="' + (a[0] / cw).toFixed(3) + '" y1="' + ((a[1] - chh * 0.18) / chh).toFixed(3) + '" x2="' + (b[0] / cw).toFixed(3) + '" y2="' + (b[1] / chh).toFixed(3) + '"/>');
          const line = linesEl.lastChild;
          fc.el.classList.add('hooked'); snd.cast();
          await wait(per * 0.32);
          snd.ratchet(5);
          const tag = h('div', { class: 'ff-fly' + (s.mult > 1 ? ' mult' : ''), html: (s.mult > 1 ? '<i>×' + s.mult + '</i>' : '') + '<b>' + short(amt) + '</b>' });
          await fly(tag, fc.el, cc.el, T(per * 0.68), { lift: 22, s0: 1.25, s1: 1.25, s2: 0.75 });
          tag.remove(); line.remove(); fc.el.classList.remove('hooked');
          cur = Math.min(limit, cur + amt); signWin('Total win', cur); signBump(); snd.caught(n++);
          Batty.fx.burst({ el: cc.el, kind: 'coin', count: 4, power: 0.4 });
        }
        cc.el.classList.remove('reeling');
        await wait(220);
      }
      clearMarks();
      return cur;
    }

    /* ---------- HUD ---------- */
    function paintHud(level, filled) {
      spinsOut.textContent = String(Math.max(0, hudSpins));
      multOut.textContent = '×' + M.LADDER[level];
      hud.setAttribute('data-level', level);
      ladder.forEach((e, i) => { e.classList.toggle('on', i === level); e.classList.toggle('past', i < level); });
      pips.forEach((p, i) => p.classList.toggle('on', level >= M.LADDER.length - 1 || i < filled));
      hud.classList.toggle('max', level >= M.LADDER.length - 1);
    }
    function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    async function bankCaptains(s) {
      let lvl = s.levelBefore, m = s.meterBefore, si = 0;
      const top = M.LADDER.length - 1, per = M.CAPTAINS_PER_STEP;
      for (const c of s.captains) {
        m++;
        if (lvl < top) {
          const slot = pips[clamp(m - per * lvl - 1, 0, per - 1)];
          const tok = h('div', { class: 'ff-token', html: useSvg('head') }); tok.style.width = Math.round(cw * 0.7) + 'px';
          await fly(tok, cellAt(c).el, slot, T(520), { lift: 30, s0: 1, s1: 1.1, s2: 0.4 });
          tok.remove(); snd.pip();
          paintHud(lvl, m - per * lvl); bump(slot);
          await wait(160);
          if (m >= per * (lvl + 1)) {
            const step = s.steps[si++]; lvl++;
            await wait(250);
            snd.retrigger(); shake();
            Batty.fx.burst({ el: hud, kind: 'confetti', count: 60, power: 1.1 });
            hudSpins += step.spins; paintHud(lvl, 0); bump(spinsOut.parentNode); bump(multOut.parentNode);
            signText('Retrigger! +' + step.spins + ' free spins');
            await callout('<small>4 captains banked</small><b>+' + step.spins + ' Free Spins</b><em>Fish now pay ×' + step.mult + '</em>', 2300, 'big');
            signWin('Total win', round.o.win + s.totalAfter);
          }
        } else { bump(multOut.parentNode); await wait(120); }
      }
    }

    /* ---------- bonus flow ---------- */
    function card(cls, kids) { const el = h('div', { class: 'ff-card ' + cls }, kids); pop.append(el); pop.classList.add('on'); return el; }
    function closePop() { pop.classList.remove('on'); pop.textContent = ''; }
    async function triggerIntro(o) {
      clearMarks();
      o.scatters.forEach((c) => cellAt(c).el.classList.add('win')); reelsEl.classList.add('dim');
      snd.shanty(); Batty.fx.burst({ el: win, kind: 'confetti', count: 70, power: 1.2 });
      signText(o.scatters.length + ' boats! Free spins!');
      await wait(1700);
      card('ff-intro', [h('small', null, o.scatters.length + ' boats in view'), h('output', null, String(o.freeSpins)), h('h2', null, 'Free Spins'), h('p', null, 'Captain Batty reels in every fish on screen. Every 4th captain adds +10 spins and a bigger multiplier.')]);
      Batty.sfx('bonus');
      await wait(2300);
      closePop(); clearMarks();
    }
    function pickScreen(o) {
      return new Promise((res) => {
        if (dev) dev.perks = o.perks.slice();
        const floats = o.perks.map((_, i) => h('button', { class: 'ff-float', type: 'button', style: '--i:' + i, 'aria-label': 'Float ' + (i + 1), html: '<span class="ff-hookline"></span><span class="ff-bob"><svg viewBox="0 0 100 100" aria-hidden="true">' + lowArt(i, 'fishing-', '?') + '</svg></span><span class="ff-perk"></span>' }));
        const title = h('h2', null, 'Hook a float'), sub = h('p', null, 'Each float hides a different perk for your ' + o.freeSpins + ' free spins.');
        const el = h('div', { class: 'ff-pick' }, h('div', { class: 'ff-pickhead' }, title, sub), h('div', { class: 'ff-floats' }, floats),
          h('div', { class: 'ff-pickwater', html: '<svg viewBox="0 0 800 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14 Q25 0 50 14 T100 14 T150 14 T200 14 T250 14 T300 14 T350 14 T400 14 T450 14 T500 14 T550 14 T600 14 T650 14 T700 14 T750 14 T800 14 V60 H0 Z" fill="#17899a"/><path d="M0 30 Q25 18 50 30 T100 30 T150 30 T200 30 T250 30 T300 30 T350 30 T400 30 T450 30 T500 30 T550 30 T600 30 T650 30 T700 30 T750 30 T800 30 V60 H0 Z" fill="#0e5f86"/></svg>' }));
        pop.append(el); pop.classList.add('on');
        pickEl = { el, floats, title, sub };
        let done = false, tm = 0;
        const choose = (i) => { if (done) return; done = true; primaryHook = null; S.clear(tm); snd.pick(); floats.forEach((f) => { f.disabled = true; }); res(i); };
        floats.forEach((f, i) => f.addEventListener('click', () => choose(i)));
        primaryHook = () => choose((Math.random() * floats.length) | 0);
        tm = S.timeout(() => choose((Math.random() * floats.length) | 0), auto ? T(2400) : 25000);
      });
    }
    async function revealPick(idx, perks) {
      const P = pickEl, perk = perkOf(perks[idx]);
      P.floats[idx].classList.add('hooked');
      Batty.sfx('splash');
      await wait(850);
      P.floats[idx].lastChild.textContent = perk.label; P.floats[idx].classList.add('show');
      P.title.textContent = perk.label; P.sub.textContent = perk.blurb;
      snd.reveal(); Batty.fx.burst({ el: P.floats[idx], kind: 'spark', count: 30, power: 0.9 });
      await wait(750);
      P.floats.forEach((f, i) => { if (i !== idx) { f.lastChild.textContent = perkOf(perks[i]).label; f.classList.add('show', 'other'); } });
      await wait(2000);
      closePop(); pickEl = null;
    }
    async function dive(b) {
      const o = round.o;
      mode = 'bonus'; hudSpins = o.freeSpins; paintHud(0, 0);
      root.classList.add('ff-bonus'); depthTarget = 1; if (reduce) depth = 1;
      snd.dive(); signWin('Total win', o.win);
      await wait(1700);
      if (b.startSpins > hudSpins) { hudSpins = b.startSpins; paintHud(0, 0); bump(spinsOut.parentNode); snd.pip(); await callout('<b>' + perkOf(b.perk).label + '</b>', 1300); }
      else if (b.startLevel > 0) { paintHud(b.startLevel, 0); bump(multOut.parentNode); snd.retrigger(); await callout('<b>Head start</b><em>Fish pay ×' + M.LADDER[b.startLevel] + '</em>', 1400); }
      else if (b.perk === 'fish') { snd.bubbles(8); await callout('<b>Fish Supper</b><em>Extra fish on every reel</em>', 1400); }
      else if (b.perk === 'crew') { snd.captain(); await callout('<b>All Hands</b><em>Extra captains on the reels</em>', 1400); }
    }
    async function freeSpin(s) {
      hudSpins--; spinsOut.textContent = String(Math.max(0, hudSpins));
      clearMarks();
      await spinReels(s.landed, s.landedValues, false);
      if (s.feature) await (s.feature.type === 'net' ? netFeature(s) : shoalFeature(s));
      const before = round.o.win + s.totalAfter - s.win, after = before + s.win;
      let cur = before;
      if (s.lineWin > 0) { const to = Math.min(after, cur + s.lineWin); await showWins(s.lines, cur, to, 'Total win'); cur = to; clearMarks(); }
      if (s.collects.length) cur = await collect(s, cur, after);
      if (s.captains.length) await bankCaptains(s);
      signWin('Total win', after);
      if (s.capped) { snd.retrigger(); Batty.fx.rain('coin', 1800); await callout('<small>Net full!</small><b>Max win</b><em>' + Batty.fmt(M.MAX_WIN_X) + '× stake</em>', 2600, 'big'); }
      await wait(s.win > 0 ? 320 : 140);
    }
    function outro(b) {
      return new Promise((res) => {
        const out = h('output', null, '0'), btn = h('button', { class: 'ff-cta', type: 'button' }, 'Back to the pier');
        card('ff-outro', [h('small', null, 'Free spins over'), h('h2', null, b.total > 0 ? 'Catch of the day' : 'The one that got away'), out,
          h('p', null, b.spins.length + ' free spins · ' + b.fishCaught + ' fish landed · top multiplier ×' + M.LADDER[b.maxLevel] + (b.capped ? ' · max win reached' : '')), btn]);
        if (b.total > 0) { snd.win(2); if (b.total >= 20 * b.stake) Batty.fx.rain('coin', 1600); } else Batty.sfx('lose');
        const ms = b.total > 0 ? T(1700) : 0;
        Batty.ui.countUp(out, 0, b.total, ms || 1);
        let done = false, tm = 0;
        const go = () => { if (done) return; done = true; primaryHook = null; S.clear(tm); Batty.sfx('click'); closePop(); res(); };
        btn.addEventListener('click', go); primaryHook = go;
        tm = S.timeout(go, ms + (auto ? T(1700) : 9000));
      });
    }
    async function surface() {
      root.classList.remove('ff-bonus'); depthTarget = 0; if (reduce) depth = 0; mode = 'base';
      snd.surface(); signWin('Win', round.total);
      await wait(1500);
    }
    async function bonusRound() {
      const o = round.o, stake = round.stake;
      pending = { o, stake };
      await triggerIntro(o);
      const idx = await pickScreen(o);
      let b;
      if (Batty.online) {
        let r = null;
        for (let tries = 0; tries < 4 && !r && !dead; tries++) { r = await Batty.play(ID, 'pick', { round: round.rid, pick: idx }, 0); if (!r) await S.sleep(1200); }
        if (dead) return;
        pending = null;
        if (!r) { closePop(); Batty.ui.toast('Lost touch with the server. Your free spins were played and paid: check your balance.'); await Batty.refreshMe(false); return; }
        b = r.bonus; o.perks = r.perks;
      } else b = roll(() => M.bonus(Batty.rng, stake, { spins: o.freeSpins, perk: o.perks[idx], carried: o.win }), round.want && round.want.bonus, 60000);
      pending = null;
      Batty.wallet.win(ID, b.total, { silent: true });
      round.total += b.total; round.bonus = b;
      if (dev) { dev.bonus = b; dev.won += b.total; }
      await revealPick(idx, o.perks);
      await dive(b);
      for (const s of b.spins) await freeSpin(s);
      await wait(500);
      await outro(b);
      await surface();
    }

    /* ---------- a paid round ---------- */
    async function playRound(bought) {
      if (busy || dead) return;
      const stake = stakeCtl.value, cost = bought ? M.BUY_PRICE_X * stake : stake;
      if (!Batty.wallet.bet(ID, cost)) { stopAuto(); Batty.ui.broke(); return; }
      busy = true; autoMenu.classList.remove('on'); controls();
      tagStake = stake;
      const want = dev && dev.force ? FORCES[dev.force] || null : null;
      if (dev) dev.force = null;
      let o, rid = 0;
      if (Batty.online) {
        /* online: the server spins; if free spins trigger it keeps the floats' perks secret until the pick */
        const r = await Batty.play(ID, 'spin', { stake, buy: bought }, cost);
        if (dead) return;
        if (!r) { busy = false; auto = 0; controls(); return; }
        o = r.o; rid = r.round;
      } else o = roll(() => (bought ? M.buy(Batty.rng, stake) : M.spin(Batty.rng, stake)), want && want.base, 400000);
      Batty.wallet.win(ID, o.win, { silent: true });
      round = { stake, o, total: o.win, want, rid };
      if (dev) { dev.last = o; dev.rounds++; dev.staked += cost; dev.won += o.win; }
      clearMarks();
      signText(bought ? 'Bonus bought. Here come the boats' : MSGS[(Math.random() * MSGS.length) | 0]);
      spinBtn.classList.add('go'); S.timeout(() => spinBtn.classList.remove('go'), 500);
      await spinReels(o.landed, o.landedValues, true);
      if (o.tease) await dynamite(o);
      if (o.lineWin > 0) await showWins(o.lines, 0, o.lineWin, 'Win');
      if (o.triggered) await bonusRound();
      await Batty.ui.celebrate({ amount: round.total, bet: stake });
      Batty.wallet.sync();
      busy = false;
      if (auto > 0) { auto--; if (auto > 0 && Batty.wallet.canBet(stakeCtl.value)) S.timeout(() => playRound(false), T(o.win > 0 ? 420 : 240)); else auto = 0; }
      controls();
    }
    function startAuto(n) { autoMenu.classList.remove('on'); Batty.sfx('click'); auto = n; controls(); if (!busy) playRound(false); }
    function stopAuto() { auto = 0; controls(); }
    function controls() {
      const lock = busy || auto > 0;
      stakeCtl.disabled = lock; buyBtn.disabled = lock;
      spinBtn.classList.toggle('busy', busy); spinBtn.classList.toggle('auto', auto > 0);
      spinBtn.lastChild.textContent = auto > 0 ? String(auto) : '';
      spinBtn.setAttribute('aria-label', auto > 0 ? 'Stop autoplay' : busy ? 'Skip reel spin' : 'Spin');
      autoBtn.classList.toggle('on', auto > 0); autoBtn.lastChild.textContent = auto > 0 ? 'Stop' : 'Auto';
      buyBtn.lastChild.textContent = short(M.BUY_PRICE_X * stakeCtl.value) + ' BB';
    }
    function primary() {
      if (primaryHook) return primaryHook();
      if (pop.classList.contains('on')) return;
      if (auto > 0) { Batty.sfx('click'); return stopAuto(); }
      if (busy) return requestSkip();
      playRound(false);
    }
    function buyDialog() {
      if (busy || auto > 0 || pop.classList.contains('on')) return;
      Batty.sfx('click');
      const stake = stakeCtl.value, price = M.BUY_PRICE_X * stake;
      const yes = h('button', { class: 'ff-cta', type: 'button' }, 'Buy for ' + Batty.fmt(price)), no = h('button', { class: 'ff-cta ghost', type: 'button' }, 'Not now');
      card('ff-buycard', [h('small', null, 'Buy bonus'), h('h2', null, 'Straight to the free spins'), h('div', { class: 'ff-buyart', html: useSvg('scat') + useSvg('scat') + useSvg('scat') }),
        h('p', null, 'The next spin lands 3 or more boats and starts the free spins. Costs ' + M.BUY_PRICE_X + '× your stake of ' + Batty.fmt(stake) + ' Batty Bucks.'), h('div', { class: 'ff-row' }, no, yes)]);
      const close = () => { primaryHook = null; closePop(); };
      primaryHook = () => {};
      no.addEventListener('click', () => { Batty.sfx('click'); close(); });
      yes.addEventListener('click', () => { close(); playRound(true); });
    }

    /* ---------- events ---------- */
    spinBtn.addEventListener('click', primary);
    win.addEventListener('click', requestSkip);
    turboBtn.addEventListener('click', () => { turbo = !turbo; turboBtn.classList.toggle('on', turbo); turboBtn.setAttribute('aria-pressed', String(turbo)); Batty.sfx('click'); });
    autoBtn.addEventListener('click', () => { if (auto > 0) { Batty.sfx('click'); return stopAuto(); } Batty.sfx('click'); autoMenu.classList.toggle('on'); });
    buyBtn.addEventListener('click', buyDialog);
    mascot.addEventListener('click', () => { snd.captain(); mascot.classList.remove('hop'); void mascot.offsetWidth; mascot.classList.add('hop'); });
    S.on(document, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (document.querySelector('.bc-veil,.bc-win')) return;
      e.preventDefault();
      if (e.repeat) return;
      if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
      primary();
    });
    S.on(document, 'pointerdown', (e) => { if (autoMenu.classList.contains('on') && !e.target.closest('.ff-autowrap')) autoMenu.classList.remove('on'); });

    /* ---------- ambient scene ---------- */
    const ctx = cv.getContext('2d');
    let dpr = 1;
    const amb = { fish: [], bub: [], gulls: [], glints: [], jump: null, nextJump: 3 };
    for (let i = 0; i < 9; i++) amb.fish.push({ x: Math.random(), yf: Math.random(), s: Math.random(), v: (0.02 + Math.random() * 0.045) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.3 });
    for (let i = 0; i < 36; i++) amb.bub.push({ x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 4, v: 0.04 + Math.random() * 0.07, ph: Math.random() * 6.3 });
    for (let i = 0; i < 3; i++) amb.gulls.push({ x: Math.random(), yf: Math.random(), v: 0.012 + Math.random() * 0.016, ph: Math.random() * 6.3, s: 0.7 + Math.random() * 0.6 });
    for (let i = 0; i < 34; i++) amb.glints.push({ x: Math.random(), yf: Math.pow(Math.random(), 1.5), sp: 0.6 + Math.random() * 1.8, ph: Math.random() * 6.3 });
    function drawAmbient(dt, tms) {
      if (!W || !H) return;
      const t = tms / 1000;
      depth += clamp(depthTarget - depth, -dt * 0.75, dt * 0.75);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const seaTop = hz * (1 - depth), seaH = H - seaTop, up = 1 - depth, big = wide ? 1.4 : 1;
      ctx.lineCap = 'round';
      if (up > 0.02) {
        for (const g of amb.glints) {
          const y = hz + 5 + g.yf * (H - hz - 8), len = 5 + g.yf * 28, a = (0.1 + 0.3 * (0.5 + 0.5 * Math.sin(t * g.sp + g.ph))) * up;
          const x = ((g.x + t * 0.004 * (1 + g.yf * 3)) % 1) * (W + 60) - 30;
          const sunny = Math.abs(x - sunX) < 30 + g.yf * 110;
          ctx.strokeStyle = sunny ? 'rgba(255,233,176,' + Math.min(1, a * 2).toFixed(3) + ')' : 'rgba(191,245,238,' + a.toFixed(3) + ')';
          ctx.lineWidth = 1.4 + g.yf * 1.6; ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
        }
      }
      for (const f of amb.fish) {
        f.x += f.v * dt * (1 + depth * 0.5); if (f.x > 1.15) f.x = -0.15; if (f.x < -0.15) f.x = 1.15;
        const sz = (9 + f.s * 13) * big, dir = f.v > 0 ? 1 : -1;
        const x = f.x * W, y = seaTop + 24 + sz + f.yf * Math.max(30, seaH - 60 - sz) + Math.sin(t * 0.8 + f.ph) * 6, wag = Math.sin(t * 6 + f.ph) * 0.3;
        ctx.fillStyle = 'rgba(5,22,52,' + (0.16 + 0.16 * depth + f.s * 0.1).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(x, y, sz, sz * 0.42, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - dir * sz * 0.8, y); ctx.lineTo(x - dir * sz * 1.6, y - sz * 0.45 + wag * sz); ctx.lineTo(x - dir * sz * 1.6, y + sz * 0.45 + wag * sz); ctx.closePath(); ctx.fill();
      }
      const nb = Math.round(7 + 29 * depth);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < nb; i++) {
        const b = amb.bub[i]; b.y -= b.v * dt * (0.6 + depth); if (b.y < 0) { b.y = 1; b.x = Math.random(); }
        const y = seaTop + b.y * seaH, x = b.x * W + Math.sin(t * 1.4 + b.ph) * 7; if (y < seaTop + 8) continue;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.2 + 0.25 * depth).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x, y, b.r * big, 0, 6.283); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.3 * depth).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x - b.r * 0.35, y - b.r * 0.35, b.r * 0.24 * big, 0, 6.283); ctx.fill();
      }
      if (up > 0.02) {
        ctx.strokeStyle = 'rgba(43,35,80,' + (0.85 * up).toFixed(3) + ')'; ctx.lineWidth = 2.2 * (wide ? 1.2 : 1);
        for (const g of amb.gulls) {
          g.x += g.v * dt; if (g.x > 1.1) { g.x = -0.1; g.yf = Math.random(); }
          const x = g.x * W, y = 16 + g.yf * Math.max(20, hz * 0.55) + Math.sin(t * 0.7 + g.ph) * 6, sp = 9 * g.s * big, fl = Math.sin(t * 7 + g.ph) * sp * 0.45;
          ctx.beginPath(); ctx.moveTo(x - sp, y - fl); ctx.quadraticCurveTo(x - sp * 0.4, y - sp * 0.55 - fl * 0.3, x, y); ctx.quadraticCurveTo(x + sp * 0.4, y - sp * 0.55 - fl * 0.3, x + sp, y - fl); ctx.stroke();
        }
        amb.nextJump -= dt;
        if (!amb.jump && amb.nextJump < 0 && depthTarget === 0 && depth < 0.01) {
          const fx = wide ? (Math.random() < 0.5 ? 0.02 + Math.random() * 0.07 : 0.9 + Math.random() * 0.07) : 0.1 + Math.random() * 0.8;
          amb.jump = { x: fx * W, t: 0, dir: Math.random() < 0.5 ? -1 : 1, c: ['#ff9a3c', '#58e0d0', '#ffd23f', '#ff7a59'][(Math.random() * 4) | 0] }; amb.nextJump = 4 + Math.random() * 7;
        }
        if (amb.jump) {
          const j = amb.jump; j.t += dt; const k = j.t / 0.95, hop = 46 * big, hi = 42 * big;
          if (k >= 1.3) amb.jump = null; else {
            if (k < 1) {
              const x = j.x + j.dir * k * hop, y = hz + 4 - Math.sin(k * Math.PI) * hi, ang = Math.atan2(-Math.cos(k * Math.PI) * hi * Math.PI, hop * j.dir);
              ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (j.dir < 0) ctx.scale(1, -1); ctx.scale(big, big);
              ctx.fillStyle = j.c; ctx.strokeStyle = INK; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-17, -6); ctx.lineTo(-17, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.ellipse(0, 0, 11, 5.6, 0, 0, 6.283); ctx.fill(); ctx.stroke();
              ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(6, -1.6, 1.4, 0, 6.283); ctx.fill(); ctx.restore();
            }
            for (const sp of [[j.x, k], [j.x + j.dir * hop, k - 0.92]]) if (sp[1] >= 0 && sp[1] < 0.36) {
              ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - sp[1] / 0.36)).toFixed(3) + ')'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.ellipse(sp[0], hz + 5, 6 + sp[1] * 60, 2 + sp[1] * 12, 0, 0, 6.283); ctx.stroke();
            }
          }
        }
      }
    }

    /* ---------- layout ---------- */
    function layout() {
      W = root.clientWidth; H = root.clientHeight; if (!W || !H) return;
      wide = W >= 860 && H <= W * 0.82;
      root.classList.toggle('ff-wide', wide);
      const fb = wide ? 14 : 8, signH = wide ? 60 : 52, hudH = wide ? 70 : 64;
      const barH = bar.offsetHeight, topH = topEl.offsetHeight;
      const availW = W - (wide ? 300 : 8) - 2 * fb, availH = H - barH - topH - signH - 2 * fb - (wide ? 44 : 12);
      let c = availW / 5, r = Math.min(availH / 3, c * 1.26);
      if (r < c * 0.86) c = r / 0.86;
      cw = Math.max(40, Math.floor(c)); chh = Math.max(40, Math.floor(r));
      root.style.setProperty('--cw', cw + 'px'); root.style.setProperty('--ch', chh + 'px'); root.style.setProperty('--fb', fb + 'px');
      root.classList.toggle('ff-tight', availH - 3 * chh < hudH + 6);
      const fr = frame.getBoundingClientRect(), rr = root.getBoundingClientRect();
      hz = wide ? Math.round(H * 0.45) : Math.round(fr.top - rr.top - 12);
      sunX = wide ? W - (W - fr.width) / 4 : W * 0.76;
      root.style.setProperty('--hz', hz + 'px'); root.style.setProperty('--sunx', Math.round(sunX) + 'px');
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      if (reduce) drawAmbient(0, 0);
    }
    const ro = new ResizeObserver(() => layout());
    ro.observe(root);
    layout(); controls();
    S.loop((dt, t) => { stepReels(dt); if (!reduce) drawAmbient(dt, t); });
    S.interval(() => {
      if (!A.ctx || busy && mode !== 'bonus') return;
      if (mode === 'bonus') snd.bubbles(2); else { snd.wave(); if (Math.random() < 0.3) snd.gull(); }
    }, 3600);

    return {
      destroy() {
        dead = true; ro.disconnect();
        /* left while choosing a float: the free spins are still owed, so play them out with the first float and bank the result */
        if (pending && Batty.online) { if (round && round.rid) Batty.play(ID, 'pick', { round: round.rid, pick: 0 }, 0).then(() => Batty.wallet.sync()); pending = null; }
        else if (pending) { const b = M.bonus(Batty.rng, pending.stake, { spins: pending.o.freeSpins, perk: pending.o.perks[0], carried: pending.o.win }); Batty.wallet.win(ID, b.total, { silent: true }); pending = null; }
        if (dev && window.__fishingDev === dev) delete window.__fishingDev;
      },
    };

  }

  /* ================================================================== registration ================================================================== */
  function rulesHtml() {
    const row = (k, name) => '<tr><td>' + name + '</td><td>' + (M.PAY[k][2] || '–') + '</td><td>' + M.PAY[k][3] + '</td><td>' + M.PAY[k][4] + '</td><td>' + M.PAY[k][5] + '</td></tr>';
    const fish = M.FISH_VALUES.map((f) => '<tr><td>' + f.name + '</td><td>' + f.v + '× stake</td></tr>').join('');
    return '<h3>How it plays</h3><p>5 reels, 3 rows, 10 fixed lines paying left to right. Your stake covers all 10 lines; each line bets a tenth of it. Only the highest win on each line pays. Click the reels or press Space to stop them early.</p>' +
      '<h3>Paytable (× line bet)</h3><table><tr><th>Symbol</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>' +
      row(SY.PEL, 'Pelican') + row(SY.ROD, 'Rod and reel') + row(SY.BUOY, 'Lifebuoy') + row(SY.BOX, 'Tackle box') + row(SY.FISH, 'Any fish') + row(SY.ACE, 'A float') + row(SY.KING, 'K float') + row(SY.QUEEN, 'Q float') + row(SY.JACK, 'J float') + row(SY.TEN, '10 float') + '</table>' +
      '<h3>Free spins</h3><p>3, 4 or 5 boats anywhere win 10, 15 or 20 free spins. With exactly 2 boats showing, Captain Batty may chuck a stick of dynamite: sometimes it blasts in a third boat, sometimes it is a dud.</p>' +
      '<p>Before the free spins you hook one of five floats for a perk: +3 spins, +5 spins, Fish Supper (more fish on the reels), All Hands (more captains on the reels) or Head Start (fish pay ×2 from the first spin).</p>' +
      '<p>In free spins Captain Batty is wild and every captain that lands reels in the cash value of every fish on screen. Every 4th captain adds 10 more free spins and raises the fish multiplier: ×2, then ×3, then ×10. Fish but no captain: a cast net may drop a captain in. A captain but no fish: a shoal may swim through and leave fish behind.</p>' +
      '<h3>Fish values</h3><table><tr><th>Fish</th><th>Value</th></tr>' + fish + '</table>' +
      '<h3>Buy bonus</h3><p>Pay ' + M.BUY_PRICE_X + '× your stake to go straight to the free spins (3 to 5 boats).</p>' +
      '<p>Wins in one round, free spins included, are capped at ' + Batty.fmt(M.MAX_WIN_X) + '× stake.</p>' +
      '<p class="rtp">Tested return: 96.09% over 100,000,000 simulated spins (base lines 48.09%, free spins 48.00%). Free spins about 1 in 161 spins. Buy bonus: 96.04% over 4,000,000 simulated buys.</p>';
  }
  let game = null;
  Batty.registerGame({
    id: ID,
    name: 'Fishing Frenzy',
    tagline: 'Captain Batty reels in every fish on screen',
    tag: 'Slot',
    poster: posterSvg(),
    rules: rulesHtml,
    mount(root) { S = Batty.scope(); game = createGame(root); },
    unmount() { if (game) game.destroy(); game = null; if (S) S.dispose(); S = null; },
  });
})();
