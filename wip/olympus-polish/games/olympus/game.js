/* ===== olympus math ===== */
/* Raging Cocks of Olympus 2 — pure maths. No DOM. Shared verbatim by the browser game and sim/olympus.sim.js.
   All amounts are in UNITS: 1 unit = one line bet = stake / 20. Every stake on the ladder is a multiple of 20,
   so units x (stake / 20) is always a whole number of Batty Bucks. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).olympus = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 3, CELLS = 15, LINES = 20;
  const UNITS_PER_STAKE = 20;
  const MAX_WIN_X = 5000;
  const CAP = MAX_WIN_X * UNITS_PER_STAKE;          // 100,000 units

  /* ---------- symbols ---------- */
  const TEN = 0, JACK = 1, QUEEN = 2, KING = 3, ACE = 4, LYRE = 5, AMPH = 6, WREATH = 7, HELM = 8, EGG = 9, WILD = 10, COIN = 11, GOD = 12;
  const SYMBOLS = ['ten', 'jack', 'queen', 'king', 'ace', 'lyre', 'amphora', 'wreath', 'helmet', 'egg', 'wild', 'coin', 'god'];
  const SYMBOL_NAMES = ['10', 'Jack', 'Queen', 'King', 'Ace', 'Lyre', 'Amphora', 'Laurel Wreath', 'War Helmet', 'Golden Egg', 'Wild', 'Drachma Prize', 'Rooster God'];
  /* PAY[symbol][count] in units (multiples of the line bet). */
  const PAY = [
    /* 10     */ [0, 0, 0, 5, 20, 100],
    /* Jack   */ [0, 0, 0, 5, 20, 100],
    /* Queen  */ [0, 0, 0, 5, 25, 125],
    /* King   */ [0, 0, 0, 10, 30, 150],
    /* Ace    */ [0, 0, 0, 10, 40, 200],
    /* Lyre   */ [0, 0, 0, 20, 80, 300],
    /* Amph.  */ [0, 0, 0, 25, 100, 400],
    /* Wreath */ [0, 0, 0, 40, 150, 600],
    /* Helmet */ [0, 0, 0, 50, 250, 1000],
    /* Egg    */ [0, 0, 10, 100, 500, 2000],
    /* Wild   */ [0, 0, 10, 100, 500, 2000],
    /* Coin   */ [0, 0, 0, 0, 0, 0],
    /* God    */ [0, 0, 0, 0, 0, 0],
  ];

  /* 20 fixed paylines, row index per reel (0 = top). */
  const PAYLINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 0, 1],
    [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
    [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 1, 2, 1],
  ];

  /* ---------- reel strips ----------
     Each strip is built once, deterministically, from the symbol counts below (fixed seed), so the strips are
     constants of the game. Gods are spaced so that at most one can show per reel. */
  const STRIP_COUNTS = [
    /*            10  J   Q   K   A  Lyr Amp Wre Hel Egg Wild Coin God */
    /* reel 1 */ [10, 10, 10, 9, 9, 7, 6, 5, 4, 3, 2, 3, 2],
    /* reel 2 */ [10, 10, 9, 9, 9, 6, 6, 5, 4, 3, 4, 3, 2],
    /* reel 3 */ [9, 10, 10, 9, 9, 6, 6, 5, 4, 3, 4, 3, 2],
    /* reel 4 */ [10, 9, 10, 9, 9, 7, 5, 5, 4, 3, 4, 3, 2],
    /* reel 5 */ [10, 10, 9, 10, 9, 6, 6, 5, 4, 4, 2, 3, 2],
  ];
  function lcg(seed) { let s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function buildStrip(counts, seed) {
    const r = lcg(seed), body = [];
    for (let s = 0; s < counts.length; s++) if (s !== GOD) for (let i = 0; i < counts[s]; i++) body.push(s);
    for (let i = body.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = body[i]; body[i] = body[j]; body[j] = t; }
    /* break up runs of three or more identical symbols and adjacent wilds/coins */
    for (let pass = 0; pass < 6; pass++) for (let i = 0; i < body.length; i++) {
      const a = body[i], b = body[(i + 1) % body.length];
      if (a === b) { const j = (i + 1 + 3 + Math.floor(r() * (body.length - 6))) % body.length; const t = body[(i + 1) % body.length]; body[(i + 1) % body.length] = body[j]; body[j] = t; }
    }
    const n = counts[GOD], gap = Math.floor(body.length / n), strip = body.slice();
    for (let g = n - 1; g >= 0; g--) strip.splice(g * gap + 2 + Math.floor(r() * (gap - 6)), 0, GOD);
    return strip;
  }
  const STRIPS = STRIP_COUNTS.map(function (c, i) { return buildStrip(c, 7001 + i * 97); });

  /* ---------- the five rooster gods ---------- */
  const ZEUS = 0, PECK = 1, HEN = 2, POLLO = 3, ARES = 4;
  const GODS = [
    { id: 'zeus', name: 'Zeus', title: 'The Thunder Cock', feature: 'Prize Booster', blurb: 'His bolt strikes every prize on the board and adds to each one.' },
    { id: 'peck', name: 'Peckseidon', title: 'Lord of the Wet Bits', feature: 'Extra Collect', blurb: 'His trident scoops the value of every prize on the board into itself, then stays as a prize.' },
    { id: 'hen', name: 'Hendes', title: 'Keeper of the Underworld', feature: 'Jackpots', blurb: 'Jackpot gems can land: Mini, Minor, Major and Grand.' },
    { id: 'pollo', name: 'A-Pollo', title: 'The Golden Bird', feature: 'Prize Double', blurb: 'His sun doubles every prize on the board.' },
    { id: 'ares', name: 'Ares', title: 'The Fighting Cock', feature: 'Power Symbol', blurb: 'His shield is a prize that grows after every single respin.' },
  ];

  /* ---------- jackpots (units) ---------- */
  const JACKPOTS = [
    { id: 'mini', name: 'Mini', x: 10, units: 200 },
    { id: 'minor', name: 'Minor', x: 25, units: 500 },
    { id: 'major', name: 'Major', x: 100, units: 2000 },
    { id: 'grand', name: 'Grand', x: 1000, units: 20000 },
  ];

  /* ---------- tunables (every probability in the game lives here) ---------- */
  const CFG = {
    /* prize coin values in units and their weights (20 units = 1x stake) */
    coinValues: [10, 20, 30, 40, 60, 100, 160, 200, 400],
    coinWeights: [420, 300, 120, 80, 45, 22, 9, 3, 1],
    /* natural trigger chance by number of gods landed (3+ always triggers) */
    trigger: [0, 0.0098, 0.035, 1, 1, 1],
    /* SUPER: chance, on a spin where 1 or 2 gods landed and did not trigger, that a pot bursts */
    superChance: 0.0032,
    /* SUPER: weights for the total number of gods in play (must exceed the number landed, minimum 2) */
    superTotal: [0, 0, 50, 30, 13, 7],
    /* cosmetic pot growth chance per feed (visual only) */
    potGrow: 0.45,
    /* respin feature: chance that each empty position lands something, by number of filled positions */
    landP: [0.06, 0.06, 0.06, 0.06, 0.056, 0.052, 0.047, 0.042, 0.036, 0.03, 0.024, 0.018, 0.012, 0.008, 0.005],
    /* what lands: relative weights (specials only count while their god is active) */
    wCoin: 100, wBolt: 8, wTrident: 3, wGem: 3, wSun: 3,
    /* Zeus: amount added to every prize (units) */
    boostValues: [10, 20, 40, 100], boostWeights: [55, 32, 10, 3],
    /* Hendes: which gem */
    gemWeights: [850, 125, 23, 2],
    /* Ares: power symbol start value and growth per respin (units) */
    powerStart: 20,
    growValues: [10, 20, 40, 100], growWeights: [55, 30, 12, 3],
    /* buy tiers. price in units. godCount weights for the random tier. startCoins = weights for extra coins on the opening board. */
    buy: [
      { id: 'combo', name: 'Cock Combo', sub: '1 to 5 random gods', price: 850, godCount: [0, 40, 30, 20, 7, 3], startCoins: [30, 40, 20, 10] },
      { id: 'trinity', name: 'Unholy Trinity', sub: 'Three gods guaranteed', price: 1190, godCount: [0, 0, 0, 1, 0, 0], startCoins: [30, 40, 20, 10] },
      { id: 'pantheon', name: 'The Full Pantheon', sub: 'All five gods at once', price: 3860, godCount: [0, 0, 0, 0, 0, 1], startCoins: [30, 40, 20, 10] },
    ],
  };

  /* ---------- helpers ---------- */
  function pickIndex(rng, weights) {
    let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }
  function coinValue(rng) { return CFG.coinValues[pickIndex(rng, CFG.coinWeights)]; }
  function shuffled(rng, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const cellOf = function (reel, row) { return reel * ROWS + row; };

  /* ---------- line evaluation ---------- */
  /* Pay for five symbols read left to right. Returns pay, and writes [symbol, count] into out if given. */
  function linePay(s0, s1, s2, s3, s4, out) {
    const s = [s0, s1, s2, s3, s4];
    let wl = 0; while (wl < 5 && s[wl] === WILD) wl++;
    let best = PAY[WILD][wl], bs = WILD, bn = wl;
    if (wl < 5) {
      const x = s[wl];
      if (x < WILD) {
        let n = wl + 1; while (n < 5 && (s[n] === x || s[n] === WILD)) n++;
        const p = PAY[x][n];
        if (p > best || (p === best && p > 0)) { best = p; bs = x; bn = n; }
      }
    }
    if (out) { out[0] = bs; out[1] = bn; }
    return best;
  }
  function evalLines(grid) {
    const wins = []; let total = 0; const out = [0, 0];
    for (let l = 0; l < LINES; l++) {
      const pl = PAYLINES[l];
      const p = linePay(grid[0][pl[0]], grid[1][pl[1]], grid[2][pl[2]], grid[3][pl[3]], grid[4][pl[4]], out);
      if (p > 0) { wins.push({ line: l, symbol: out[0], count: out[1], pay: p }); total += p; }
    }
    return { wins: wins, total: total };
  }

  /* ---------- the bonus: COCK COMBO hold-and-respin ----------
     gods:  array of god indices in play
     start: [{cell, kind:'god'|'coin', god?, value?}] — what is held from the triggering screen
     cap:   the most this bonus may pay (units)
     Returns the complete script. The UI plays it back and decides nothing. */
  function makeBonus(rng, gods, start, cap) {
    if (cap == null) cap = CAP;
    const active = [false, false, false, false, false];
    for (let i = 0; i < gods.length; i++) active[gods[i]] = true;
    const kind = new Array(CELLS).fill(null), val = new Array(CELLS).fill(0), isJp = new Array(CELLS).fill(false);
    let filled = 0, powerCell = -1;
    const startOut = [];
    for (let i = 0; i < start.length; i++) {
      const st = start[i], c = st.cell;
      if (kind[c]) continue;
      if (st.kind === 'god') {
        if (st.god === ARES) { kind[c] = 'power'; val[c] = CFG.powerStart; powerCell = c; }
        else { kind[c] = 'coin'; val[c] = coinValue(rng); }
        startOut.push({ cell: c, kind: kind[c], value: val[c], god: st.god });
      } else { kind[c] = 'coin'; val[c] = st.value; startOut.push({ cell: c, kind: 'coin', value: st.value }); }
      filled++;
    }
    const sum = function () { let s = 0; for (let c = 0; c < CELLS; c++) s += val[c]; return s; };
    /* gods that still owe the player a strike (Ares is always on the board from the start) */
    const owed = [];
    if (active[ZEUS]) owed.push(ZEUS); if (active[PECK]) owed.push(PECK); if (active[HEN]) owed.push(HEN); if (active[POLLO]) owed.push(POLLO);
    const wSpec = [active[ZEUS] ? CFG.wBolt : 0, active[PECK] ? CFG.wTrident : 0, active[HEN] ? CFG.wGem : 0, active[POLLO] ? CFG.wSun : 0];
    const landW = [CFG.wCoin, wSpec[0], wSpec[1], wSpec[2], wSpec[3]];
    const SPECIAL_KIND = ['bolt', 'trident', 'gem', 'sun'], SPECIAL_GOD = [ZEUS, PECK, HEN, POLLO];
    const steps = [], jackpots = [0, 0, 0, 0];
    let left = 3, capped = sum() >= cap, strikes = [0, 0, 0, 0, 0];

    while (left > 0 && filled < CELLS && !capped) {
      const step = { left: left, lands: [], events: [], leftAfter: 0, total: 0 };
      const p = CFG.landP[filled];
      const empties = [];
      for (let c = 0; c < CELLS; c++) if (!kind[c]) empties.push(c);
      const lands = [];
      for (let i = 0; i < empties.length; i++) {
        if (rng() < p) {
          const w = pickIndex(rng, landW);
          lands.push({ cell: empties[i], spec: w - 1, forced: false });
        }
      }
      /* divine intervention: on the last respin, a god who has not struck yet is guaranteed to land */
      if (left === 1 && owed.length) {
        let need = owed[Math.floor(rng() * owed.length)];
        let has = false;
        for (let i = 0; i < lands.length; i++) if (lands[i].spec >= 0 && SPECIAL_GOD[lands[i].spec] === need) has = true;
        if (!has) {
          const specIdx = SPECIAL_GOD.indexOf(need);
          const free = empties.filter(function (c) { for (let i = 0; i < lands.length; i++) if (lands[i].cell === c) return false; return true; });
          if (free.length) lands.push({ cell: free[Math.floor(rng() * free.length)], spec: specIdx, forced: true });
          else { const coinLands = lands.filter(function (l) { return l.spec < 0; }); const pick = (coinLands.length ? coinLands : lands)[0]; pick.spec = specIdx; pick.forced = true; }
        }
      }
      lands.sort(function (a, b) { return a.cell - b.cell; });
      /* place everything that landed */
      for (let i = 0; i < lands.length; i++) {
        const L = lands[i], c = L.cell;
        const rec = { cell: c, kind: 'coin', value: 0 };
        if (L.forced) rec.forced = true;
        if (L.spec < 0) { kind[c] = 'coin'; val[c] = coinValue(rng); rec.value = val[c]; }
        else {
          const k = SPECIAL_KIND[L.spec], g = SPECIAL_GOD[L.spec];
          kind[c] = k; rec.kind = k; rec.god = g; strikes[g]++;
          const oi = owed.indexOf(g); if (oi >= 0) owed.splice(oi, 1);
          if (k === 'gem') { const j = pickIndex(rng, CFG.gemWeights); val[c] = JACKPOTS[j].units; isJp[c] = true; rec.jp = j; rec.value = val[c]; jackpots[j]++; }
          else if (k === 'bolt') { L.add = CFG.boostValues[pickIndex(rng, CFG.boostWeights)]; rec.value = 0; }
          else if (k === 'sun') { L.own = coinValue(rng); rec.value = 0; }
          else { rec.value = 0; }
        }
        filled++;
        step.lands.push(rec);
      }
      /* resolve specials: boosts, then doubles, then collects */
      for (let i = 0; i < lands.length; i++) if (lands[i].spec === 0) {
        const c = lands[i].cell, add = lands[i].add, hits = [];
        for (let t = 0; t < CELLS; t++) if (t !== c && kind[t] && !isJp[t] && val[t] > 0) { val[t] += add; hits.push({ cell: t, to: val[t] }); }
        val[c] = add;
        step.events.push({ type: 'boost', god: ZEUS, cell: c, add: add, hits: hits, own: add });
      }
      for (let i = 0; i < lands.length; i++) if (lands[i].spec === 3) {
        const c = lands[i].cell, hits = [];
        for (let t = 0; t < CELLS; t++) if (t !== c && kind[t] && !isJp[t] && val[t] > 0) { val[t] *= 2; hits.push({ cell: t, to: val[t] }); }
        val[c] = lands[i].own;
        step.events.push({ type: 'double', god: POLLO, cell: c, hits: hits, own: lands[i].own });
      }
      for (let i = 0; i < lands.length; i++) if (lands[i].spec === 1) {
        const c = lands[i].cell, from = []; let s = 0;
        for (let t = 0; t < CELLS; t++) if (t !== c && kind[t] && val[t] > 0) { s += val[t]; from.push({ cell: t, value: val[t] }); }
        if (s <= 0) s = coinValue(rng);
        val[c] = s;
        step.events.push({ type: 'collect', god: PECK, cell: c, from: from, value: s });
      }
      if (lands.length) left = 3; else left--;
      /* Ares: the power symbol grows after every respin */
      if (powerCell >= 0) {
        const add = CFG.growValues[pickIndex(rng, CFG.growWeights)];
        val[powerCell] += add; strikes[ARES]++;
        step.events.push({ type: 'grow', god: ARES, cell: powerCell, add: add, to: val[powerCell] });
      }
      step.leftAfter = left;
      const s = sum();
      if (s >= cap) capped = true;
      step.total = Math.min(cap, s);
      steps.push(step);
    }
    let total = sum(), full = filled >= CELLS, grand = false;
    if (full && !capped) { grand = true; total += JACKPOTS[3].units; jackpots[3]++; }
    if (total >= cap) { total = cap; capped = true; }
    const final = [];
    for (let c = 0; c < CELLS; c++) if (kind[c]) final.push({ cell: c, kind: kind[c], value: val[c] });
    return { gods: gods.slice(), start: startOut, steps: steps, final: final, boardSum: Math.min(cap, sum()), full: full, fullGrand: grand, jackpots: jackpots, strikes: strikes, total: total, capped: capped };
  }

  /* ---------- a base spin ---------- */
  function readGrid(stops) {
    const grid = [];
    for (let r = 0; r < REELS; r++) {
      const st = STRIPS[r], n = st.length, s = stops[r];
      grid.push([st[s], st[(s + 1) % n], st[(s + 2) % n]]);
    }
    return grid;
  }
  function finishSpin(rng, grid, stops, forced) {
    const ev = evalLines(grid);
    const coins = [], gods = [];
    let order = null;
    for (let r = 0; r < REELS; r++) for (let w = 0; w < ROWS; w++) {
      const s = grid[r][w];
      if (s === COIN) coins.push({ reel: r, row: w, cell: cellOf(r, w), value: coinValue(rng) });
      else if (s === GOD) {
        if (!order) order = forced && forced.gods ? forced.gods.slice() : shuffled(rng, [0, 1, 2, 3, 4]);
        gods.push({ reel: r, row: w, cell: cellOf(r, w), god: order[gods.length], grow: rng() < CFG.potGrow });
      }
    }
    const out = { stops: stops, grid: grid, lines: ev.wins, lineWin: ev.total, coins: coins, gods: gods, trigger: null, bonus: null, bonusWin: 0, totalWin: 0, capped: false };
    const k = gods.length;
    let type = null;
    if (forced) type = forced.type;
    else if (k >= 3) type = 'natural';
    else if (k >= 1) {
      if (rng() < CFG.trigger[k]) type = 'natural';
      else if (rng() < CFG.superChance) type = 'super';
    }
    if (type) {
      const inPlay = gods.map(function (g) { return g.god; });
      const extras = [];
      if (type === 'super') {
        let total;
        if (forced && forced.total) total = forced.total;
        else { const w = CFG.superTotal.map(function (x, n) { return n > k && n >= 2 ? x : 0; }); total = pickIndex(rng, w); }
        const rest = shuffled(rng, [0, 1, 2, 3, 4].filter(function (g) { return inPlay.indexOf(g) < 0; }));
        const want = forced && forced.extraGods ? forced.extraGods : rest.slice(0, Math.max(0, total - k));
        const free = [];
        for (let c = 0; c < CELLS; c++) { const s = grid[(c / ROWS) | 0][c % ROWS]; if (s !== COIN && s !== GOD) free.push(c); }
        const spots = shuffled(rng, free);
        for (let i = 0; i < want.length; i++) { extras.push({ god: want[i], cell: spots[i], reel: (spots[i] / ROWS) | 0, row: spots[i] % ROWS }); inPlay.push(want[i]); }
      }
      const start = [];
      for (let i = 0; i < gods.length; i++) start.push({ cell: gods[i].cell, kind: 'god', god: gods[i].god });
      for (let i = 0; i < extras.length; i++) start.push({ cell: extras[i].cell, kind: 'god', god: extras[i].god });
      for (let i = 0; i < coins.length; i++) start.push({ cell: coins[i].cell, kind: 'coin', value: coins[i].value });
      inPlay.sort(function (a, b) { return a - b; });
      out.trigger = { type: type, gods: inPlay, extras: extras };
      out.bonus = makeBonus(rng, inPlay, start, Math.max(0, CAP - Math.min(CAP, ev.total)));
      out.bonusWin = out.bonus.total;
    }
    let total = out.lineWin + out.bonusWin;
    if (total >= CAP) { total = CAP; out.capped = true; }
    out.totalWin = total;
    return out;
  }
  function spin(rng) {
    const stops = [0, 0, 0, 0, 0];
    for (let r = 0; r < REELS; r++) stops[r] = Math.floor(rng() * STRIPS[r].length);
    return finishSpin(rng, readGrid(stops), stops, null);
  }

  /* ---------- constructed trigger screens (bonus buys and the dev hook) ----------
     Builds a reel screen with no line win, the wanted gods on separate reels and some prize coins. */
  const FILLER = [TEN, JACK, QUEEN, KING, ACE, LYRE, AMPH, WREATH, HELM, EGG];
  function quietGrid(rng) {
    for (let tries = 0; tries < 200; tries++) {
      const grid = [];
      for (let r = 0; r < REELS; r++) grid.push([FILLER[Math.floor(rng() * 10)], FILLER[Math.floor(rng() * 10)], FILLER[Math.floor(rng() * 10)]]);
      if (evalLines(grid).total === 0) return grid;
    }
    return [[0, 5, 1], [2, 6, 3], [4, 7, 0], [1, 8, 2], [3, 9, 4]];
  }
  function staged(rng, godList, nCoins, type, superExtra) {
    const grid = quietGrid(rng);
    const landed = superExtra ? godList.slice(0, godList.length - superExtra.length) : godList;
    const reels = shuffled(rng, [0, 1, 2, 3, 4]).slice(0, landed.length).sort(function (a, b) { return a - b; });
    for (let i = 0; i < landed.length; i++) grid[reels[i]][Math.floor(rng() * ROWS)] = GOD;
    const free = [];
    for (let c = 0; c < CELLS; c++) if (grid[(c / ROWS) | 0][c % ROWS] !== GOD) free.push(c);
    const spots = shuffled(rng, free);
    for (let i = 0; i < nCoins && i < spots.length; i++) grid[(spots[i] / ROWS) | 0][spots[i] % ROWS] = COIN;
    if (evalLines(grid).total !== 0) return staged(rng, godList, nCoins, type, superExtra);
    const forced = { type: type, gods: shuffled(rng, landed) };
    if (superExtra) { forced.extraGods = superExtra; forced.total = godList.length; }
    return finishSpin(rng, grid, null, forced);
  }
  /* Buy a bonus. tierIndex into CFG.buy. Returns a spin-shaped outcome plus {buy, cost}. */
  function buy(rng, tierIndex) {
    const tier = CFG.buy[tierIndex];
    const n = pickIndex(rng, tier.godCount);
    const godList = shuffled(rng, [0, 1, 2, 3, 4]).slice(0, n);
    const out = staged(rng, godList, pickIndex(rng, tier.startCoins), 'natural', null);
    out.trigger.type = 'buy'; out.buy = tier.id; out.cost = tier.price;
    return out;
  }
  /* Dev/testing only: a trigger with exactly these gods. asSuper=true lands the first one or two and bursts the rest from their pots. */
  function forceTrigger(rng, godList, asSuper) {
    if (asSuper && godList.length >= 2) {
      const landedN = Math.min(2, godList.length - 1, 1 + Math.floor(rng() * 2));
      return staged(rng, godList, pickIndex(rng, [30, 40, 20, 10]), 'super', godList.slice(landedN));
    }
    return staged(rng, godList, pickIndex(rng, [30, 40, 20, 10]), 'natural', null);
  }

  /* ---------- exact line RTP from strip frequencies (one line reads one independent symbol per reel) ---------- */
  function exactLineRtp() {
    const freq = STRIPS.map(function (st) { const f = new Array(13).fill(0); st.forEach(function (s) { f[s]++; }); return f.map(function (x) { return x / st.length; }); });
    let ev = 0;
    for (let a = 0; a < 13; a++) for (let b = 0; b < 13; b++) for (let c = 0; c < 13; c++) for (let d = 0; d < 13; d++) for (let e = 0; e < 13; e++) {
      const p = freq[0][a] * freq[1][b] * freq[2][c] * freq[3][d] * freq[4][e];
      if (p > 0) ev += p * linePay(a, b, c, d, e);
    }
    return ev; // expected pay per line in line bets == line RTP of the whole game
  }

  return {
    REELS: REELS, ROWS: ROWS, CELLS: CELLS, LINES: LINES, UNITS_PER_STAKE: UNITS_PER_STAKE, MAX_WIN_X: MAX_WIN_X, CAP: CAP,
    SYM: { TEN: TEN, JACK: JACK, QUEEN: QUEEN, KING: KING, ACE: ACE, LYRE: LYRE, AMPH: AMPH, WREATH: WREATH, HELM: HELM, EGG: EGG, WILD: WILD, COIN: COIN, GOD: GOD },
    SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, PAY: PAY, PAYLINES: PAYLINES, STRIPS: STRIPS, GODS: GODS, JACKPOTS: JACKPOTS, CFG: CFG,
    ZEUS: ZEUS, PECK: PECK, HEN: HEN, POLLO: POLLO, ARES: ARES,
    spin: spin, resolve: finishSpin, readGrid: readGrid, buy: buy, forceTrigger: forceTrigger, makeBonus: makeBonus, evalLines: evalLines, linePay: linePay, exactLineRtp: exactLineRtp, coinValue: coinValue,
  };
});

/* ===== olympus ===== */
/* Raging Cocks of Olympus 2 — the game. Every outcome comes from BattyMath.olympus; this file only presents it. */
(function () {
  'use strict';
  const ID = 'olympus', M = BattyMath.olympus, h = Batty.h;
  const SYM = M.SYM, U = M.UNITS_PER_STAKE, REELS = M.REELS, ROWS = M.ROWS, CELLS = M.CELLS;
  const NC = ROWS + 2; // cells on each strip: one hidden above, three on show, one hidden below (for the back-kick and the bounce)
  /* dev hooks: asked for with ?dev or localStorage['batty-dev']='1', and only ever wired up in practice mode */
  const DEV = (function () { if (/[?&]dev\b/.test(location.search)) return true; try { return localStorage.getItem('batty-dev') === '1'; } catch (e) { return false; } })();
  const GOD_COL = ['#5ab4ff', '#2fe3c2', '#b96bff', '#ffc832', '#ff5a44'];
  const MOD_SHORT = ['Boost', 'Collect', 'Jackpots', 'Double', 'Power'];
  const JP_COL = ['#3ee08a', '#4aa8ff', '#c86bff', '#ff4a5a'];
  const SERIF = "'Cinzel','Trajan Pro','Palatino Linotype','Book Antiqua',Palatino,'TeX Gyre Pagella',Lora,Georgia,'Times New Roman',serif";
  const DECO = "'Cinzel Decorative'," + SERIF;

  /* =====================================================================================
     ART — everything is drawn here. p is an id prefix so the poster and the game never share SVG ids.
     ===================================================================================== */
  const lg = (id, stops, x1, y1, x2, y2) => '<linearGradient id="' + id + '" x1="' + (x1 || 0) + '" y1="' + (y1 || 0) + '" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</linearGradient>';
  const rg = (id, stops, cx, cy, r) => '<radialGradient id="' + id + '" cx="' + (cx == null ? 0.5 : cx) + '" cy="' + (cy == null ? 0.5 : cy) + '" r="' + (r || 0.5) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</radialGradient>';

  const GOD_ART = [
    { f1: '#ffffff', f2: '#cdd8f6', f3: '#8d9bd0', o: '#27306a', comb: '#ff4838', comb2: '#b3161a', beak: '#ffc23a', beak2: '#e08a12', wat: '#ff4838', wat2: '#b3161a', iris: '#2f9bff', bg: [['0', '#5d8cff'], ['.55', '#2440b8'], ['1', '#0a1248']] },
    { f1: '#8ff8e4', f2: '#27c3b4', f3: '#0d7682', o: '#053a44', comb: '#3d8bff', comb2: '#1546b8', beak: '#ffd25a', beak2: '#e39a1c', wat: '#ff8a70', wat2: '#d0503c', iris: '#12d6a0', bg: [['0', '#4ff0e0'], ['.5', '#0f8fa8'], ['1', '#04304a']] },
    { f1: '#6a5896', f2: '#3a2c5c', f3: '#1a1130', o: '#07040f', comb: '#c15bff', comb2: '#ff8ae0', beak: '#efe8d4', beak2: '#b8ad94', wat: '#a3163f', wat2: '#5a0a24', iris: '#ff2a2a', bg: [['0', '#a04dff'], ['.5', '#4a148c'], ['1', '#12041f']] },
    { f1: '#fff0a0', f2: '#ffb630', f3: '#de6c12', o: '#6b2d00', comb: '#ff5a1e', comb2: '#c22a08', beak: '#ffdc6a', beak2: '#e39a1c', wat: '#ff5a1e', wat2: '#c22a08', iris: '#b85a00', bg: [['0', '#fffbd6'], ['.45', '#ffcf4a'], ['1', '#e0701a']] },
    { f1: '#f0603f', f2: '#ae2c1d', f3: '#61130c', o: '#2a0503', comb: '#ff2f2f', comb2: '#8a0a0a', beak: '#ffc23a', beak2: '#d07d10', wat: '#c9201c', wat2: '#7a0c0c', iris: '#ff9a1e', bg: [['0', '#ff7a4a'], ['.5', '#9c1f12'], ['1', '#2c0705']] },
  ];

  const LETTERS = { ten: '10', jack: 'J', queen: 'Q', king: 'K', ace: 'A' };
  function letterAttrs(ch) {
    const fs = ch.length > 1 ? 56 : 72, y = ch.length > 1 ? 68 : 72;
    return 'x="50" y="' + y + '" font-family="' + DECO + '" font-weight="900" font-size="' + fs + '" text-anchor="middle"' + (ch.length > 1 ? ' letter-spacing="-3"' : '');
  }

  function defs(p) {
    let s = '';
    s += lg(p + 'gold', [[0, '#fff8d0'], [0.28, '#ffd75e'], [0.6, '#e39a1c'], [1, '#8a4d05']]);
    s += lg(p + 'goldd', [[0, '#ffe48a'], [0.5, '#c9810f'], [1, '#6b3a03']]);
    s += lg(p + 'goldh', [[0, '#a8660a'], [0.3, '#ffe48a'], [0.5, '#fff8d0'], [0.72, '#e39a1c'], [1, '#7a4504']], 0, 0, 1, 0);
    s += rg(p + 'goldr', [[0, '#fffbe0'], [0.35, '#ffd75e'], [0.75, '#d98c14'], [1, '#7a4504']], 0.36, 0.3, 0.75);
    s += lg(p + 'marble', [[0, '#fbf8f1'], [0.6, '#ddd5c8'], [1, '#a79f93']]);
    s += lg(p + 'bronze', [[0, '#ffd9a0'], [0.3, '#d98c3a'], [0.7, '#8a4a16'], [1, '#4a2408']]);
    s += lg(p + 'bronzeh', [[0, '#5a2c0a'], [0.3, '#e0994a'], [0.5, '#ffdcae'], [0.75, '#a85e20'], [1, '#4a2408']], 0, 0, 1, 0);
    s += lg(p + 'terra', [[0, '#6e2206'], [0.28, '#e0662a'], [0.45, '#ffa860'], [0.7, '#c2491a'], [1, '#5a1a04']], 0, 0, 1, 0);
    s += lg(p + 'leaf', [[0, '#e4f78a'], [0.5, '#62b838'], [1, '#1f6a22']]);
    s += lg(p + 'crest', [[0, '#ff6a5a'], [0.5, '#e0201c'], [1, '#7a0808']]);
    s += rg(p + 'enamel', [[0, '#5a3ad0'], [0.6, '#2a1670'], [1, '#0e0630']], 0.5, 0.35, 0.7);
    s += rg(p + 'shell', [[0, '#7ff0d8'], [0.6, '#1c9a8e'], [1, '#0a4a52']], 0.4, 0.3, 0.8);
    const L = [['ten', '#b8ffd8', '#1fbf7a', '#0a6a44'], ['jack', '#bfe4ff', '#2f8fff', '#0f3fa8'], ['queen', '#ecd0ff', '#b25cff', '#5a1aa8'], ['king', '#ffd0c0', '#ff5a3a', '#a8200a'], ['ace', '#fffbe0', '#ffd23a', '#e07a00']];
    for (const l of L) s += lg(p + 'l-' + l[0], [[0, l[1]], [0.45, l[2]], [1, l[3]]]);
    for (let k = 0; k < 5; k++) s += rg(p + 'bg' + k, GOD_ART[k].bg, 0.5, 0.38, 0.72);
    s += lg(p + 'flame', [[0, '#ffe9ff'], [0.4, '#ff8ae0'], [1, '#a03dff']], 0, 1, 0, 0);
    s += lg(p + 'fin', [[0, '#9ad8ff'], [1, '#1c58d8']]);
    const G = [['#d8ffe8', '#3ee08a', '#0c7a44'], ['#d8f0ff', '#4aa8ff', '#1048b8'], ['#f4dcff', '#c86bff', '#5a1aa8'], ['#ffe0d8', '#ff4a5a', '#8a0a1c']];
    for (let j = 0; j < 4; j++) s += lg(p + 'gem' + j, [[0, G[j][0]], [0.45, G[j][1]], [1, G[j][2]]]);
    s += rg(p + 'storm', [[0, '#7a5cff'], [0.6, '#2c1a8a'], [1, '#0c0638']], 0.5, 0.4, 0.7);
    s += rg(p + 'sea', [[0, '#7ff5e8'], [0.6, '#0f8fa8'], [1, '#04304a']], 0.5, 0.4, 0.7);
    s += rg(p + 'sun', [[0, '#fffde0'], [0.5, '#ffd23a'], [1, '#ff8a1e']], 0.5, 0.45, 0.6);
    s += lg(p + 'shine', [[0, '#fff', 0], [0.5, '#fff', 0.9], [1, '#fff', 0]], 0, 0, 1, 0.3);
    s += '<clipPath id="' + p + 'gclip"><circle cx="50" cy="52" r="39.5"/><rect x="-6" y="-12" width="112" height="64"/></clipPath>';
    s += '<clipPath id="' + p + 'amph"><path d="M42 11H58V16C58 20 56 22 56 27C56 33 75 39 75 55C75 72 61 80 57 86H43C39 80 25 72 25 55C25 39 44 33 44 27C44 22 42 20 42 16Z"/></clipPath>';
    s += '<clipPath id="' + p + 'eggc"><path d="M50 12C67 12 79 38 79 56C79 76 66 88 50 88C34 88 21 76 21 56C21 38 33 12 50 12Z"/></clipPath>';
    s += '<clipPath id="' + p + 'coinc"><circle cx="50" cy="50" r="45"/></clipPath>';
    s += '<clipPath id="' + p + 'gemc"><path d="M50 5L84 22L92 50L74 84H26L8 50L16 22Z"/></clipPath>';
    for (const k in LETTERS) s += '<clipPath id="' + p + 'lc-' + k + '"><text ' + letterAttrs(LETTERS[k]) + '>' + LETTERS[k] + '</text></clipPath>';
    /* vertical motion blur for spinning reels */
    s += '<filter id="' + p + 'vblur" x="-5%" y="-25%" width="110%" height="150%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 7"/></filter>';
    return s;
  }

  /* a gilded card rank */
  function letter(p, key, ch) {
    const t = (extra) => '<text ' + letterAttrs(ch) + ' ' + extra + '>' + ch + '</text>';
    let s = '<g class="glyph">';
    s += t('fill="none" stroke="#150a02" stroke-width="13" stroke-linejoin="round"');
    s += t('fill="none" stroke="url(#' + p + 'gold)" stroke-width="8" stroke-linejoin="round"');
    s += t('fill="none" stroke="#5a3200" stroke-width="2.4" stroke-linejoin="round"');
    s += t('fill="url(#' + p + 'l-' + key + ')"');
    s += '</g>';
    /* olive sprig underneath */
    s += '<g class="sprig" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width=".7">';
    for (const d of [-1, 1]) for (let i = 0; i < 3; i++) s += '<ellipse transform="translate(' + (50 + d * (9 + i * 9)) + ' ' + (88 - i * 2.2) + ') rotate(' + (-d * (18 + i * 10)) + ')" rx="5.4" ry="2.3"/>';
    s += '<circle cx="50" cy="89" r="2.6"/></g>';
    return s;
  }

  function lyre(p) {
    let s = '';
    for (const sx of [1, -1]) s += '<path transform="translate(50 0) scale(' + sx + ' 1)" d="M-13 72C-30 62-36 40-27 19C-25 12-17 11-17 19C-23 37-17 54-6 64Z" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width="1.6"/><circle cx="' + (50 - sx * 22) + '" cy="15" r="4.6" fill="url(#' + p + 'goldr)" stroke="#4a2800" stroke-width="1.2"/>';
    s += '<rect x="19" y="24" width="62" height="6.5" rx="3.2" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width="1.4"/>';
    s += '<g class="strs">';
    for (let i = 0; i < 5; i++) s += '<line x1="' + (40 + i * 5) + '" y1="30" x2="' + (42 + i * 4) + '" y2="72" stroke="#fff6cf" stroke-width="1.5"/><line x1="' + (40.8 + i * 5) + '" y1="30" x2="' + (42.8 + i * 4) + '" y2="72" stroke="#8a5a10" stroke-width=".5"/>';
    s += '</g>';
    s += '<ellipse cx="50" cy="76" rx="23" ry="15" fill="url(#' + p + 'shell)" stroke="#4a2800" stroke-width="1.6"/>';
    s += '<ellipse cx="50" cy="76" rx="23" ry="15" fill="none" stroke="url(#' + p + 'gold)" stroke-width="2.6"/>';
    s += '<path d="M38 70l6-4 6 4 6-4 6 4M35 78l7-4 8 4 8-4 7 4M41 86l9-4 9 4" fill="none" stroke="#0a4a52" stroke-width="1.3" opacity=".7"/>';
    s += '<rect x="39" y="69.5" width="22" height="4" rx="2" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width=".9"/>';
    s += '<ellipse cx="42" cy="70" rx="8" ry="3" fill="#fff" opacity=".25"/>';
    return s;
  }

  function amphora(p) {
    let s = '';
    for (const sx of [1, -1]) s += '<path transform="translate(50 0) scale(' + sx + ' 1)" d="M-7 17C-24 15-27 33-19 43" fill="none" stroke="#4a1604" stroke-width="6.4" stroke-linecap="round"/><path transform="translate(50 0) scale(' + sx + ' 1)" d="M-7 17C-24 15-27 33-19 43" fill="none" stroke="#d05a22" stroke-width="3.6" stroke-linecap="round"/>';
    s += '<g clip-path="url(#' + p + 'amph)"><rect x="20" y="8" width="60" height="84" fill="url(#' + p + 'terra)"/>';
    s += '<rect x="20" y="45" width="60" height="21" fill="#170c10"/><rect x="20" y="20" width="60" height="4" fill="#170c10"/><rect x="20" y="74" width="60" height="3" fill="#170c10"/><rect x="20" y="8" width="60" height="6" fill="#170c10"/>';
    let m = ''; for (let x = 23; x < 78; x += 9) m += 'M' + x + ' 62v-12h7v8h-4v-4';
    s += '<path d="' + m + '" fill="none" stroke="#ffb866" stroke-width="1.5"/>';
    s += '<path d="M36 33q14 6 28 0" fill="none" stroke="#170c10" stroke-width="1.6"/><path d="M39 38l3-4 3 4 3-4 3 4 3-4 3 4 3-4" fill="none" stroke="#170c10" stroke-width="1.2"/>';
    s += '<rect x="33" y="8" width="7" height="84" fill="#fff" opacity=".2"/><rect class="gleam" x="-30" y="8" width="16" height="84" fill="url(#' + p + 'shine)" opacity="0"/></g>';
    s += '<path d="M42 11H58V16C58 20 56 22 56 27C56 33 75 39 75 55C75 72 61 80 57 86H43C39 80 25 72 25 55C25 39 44 33 44 27C44 22 42 20 42 16Z" fill="none" stroke="#3a1002" stroke-width="1.7"/>';
    s += '<path d="M39 86h22l3 6H36z" fill="#170c10" stroke="#3a1002" stroke-width="1.2"/><rect x="39" y="8" width="22" height="5" rx="2" fill="#2a1418" stroke="#3a1002" stroke-width="1.2"/>';
    return s;
  }

  function wreath(p) {
    let s = '<path d="M50 84c-8 6-14 10-20 9 5-3 9-7 12-12zM50 84c8 6 14 10 20 9-5-3-9-7-12-12z" fill="#e0201c" stroke="#5a0808" stroke-width="1.2"/>';
    for (const sx of [1, -1]) {
      s += '<g class="side ' + (sx > 0 ? 'sr' : 'sl') + '">';
      for (let i = 0; i < 9; i++) {
        const a = (100 + i * 27) * Math.PI / 180, ro = 33, x = Math.cos(a) * ro, y = 50 + Math.sin(a) * ro;
        const rot = (100 + i * 27) + 90 + 28;
        s += '<g transform="translate(50 0) scale(' + sx + ' 1)"><ellipse transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot + ')" rx="10.5" ry="4.6" fill="url(#' + p + 'leaf)" stroke="#12401a" stroke-width="1.1"/>';
        const x2 = Math.cos(a + 0.2) * (ro - 9), y2 = 50 + Math.sin(a + 0.2) * (ro - 9);
        s += '<ellipse transform="translate(' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ') rotate(' + (rot - 50) + ')" rx="8" ry="3.4" fill="url(#' + p + 'leaf)" stroke="#12401a" stroke-width="1"/>';
        if (i % 3 === 1) s += '<circle cx="' + (Math.cos(a + 0.1) * (ro + 1)).toFixed(1) + '" cy="' + (50 + Math.sin(a + 0.1) * (ro + 1)).toFixed(1) + '" r="2.6" fill="url(#' + p + 'goldr)" stroke="#5a3200" stroke-width=".7"/>';
        s += '</g>';
      }
      s += '</g>';
    }
    s += '<ellipse cx="50" cy="83" rx="6" ry="4.4" fill="#ff5a4a" stroke="#5a0808" stroke-width="1.2"/>';
    return s;
  }

  function helmet(p) {
    let s = '';
    /* plume */
    s += '<g class="plume"><path d="M22 50C8 20 44-6 82 12C88 16 86 24 80 24C62 12 40 18 34 44C30 54 26 64 24 78C16 70 18 58 22 50Z" fill="url(#' + p + 'crest)" stroke="#4a0606" stroke-width="1.6"/>';
    s += '<path d="M30 30C38 14 58 8 76 16M26 40C32 22 50 12 70 16M23 56C24 46 28 36 34 28" fill="none" stroke="#ffb0a0" stroke-width="1.2" opacity=".55"/></g>';
    s += '<path d="M28 46C30 24 52 12 80 22L78 28C56 20 38 28 34 48Z" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width="1.3"/>';
    /* bowl, cheek guard, nose guard */
    s += '<path d="M27 66C22 42 36 26 54 25C71 24 83 35 83 52L83 70L77.5 70L75.5 57C71 54.500 65 55 61 58C61 66 66 70 73 72L71 90C62 90 54 85 50 76L45 76C43 83 37 88 30 90C27 82 27 74 27 66Z" fill="url(#' + p + 'bronzeh)" stroke="#2e1403" stroke-width="1.8" stroke-linejoin="round"/>';
    s += '<path d="M31 64C28 46 38 31 54 30C68 29 78 38 79 50" fill="none" stroke="#ffe9c4" stroke-width="1.6" opacity=".75"/>';
    s += '<path d="M33 86C40 84 43 78 44 72L51 72C54 80 60 85 68 86" fill="none" stroke="#3a1a05" stroke-width="1.1" opacity=".7"/>';
    s += '<path d="M61 58C65 55 71 54.500 75.500 57" fill="none" stroke="#ffe9c4" stroke-width="1.2" opacity=".7"/>';
    for (const c of [[36, 60], [40, 46], [50, 37], [62, 35], [72, 40]]) s += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="1.5" fill="#ffe9c4" stroke="#3a1a05" stroke-width=".5"/>';
    s += '<ellipse cx="46" cy="44" rx="8" ry="5" transform="rotate(-35 46 44)" fill="#fff" opacity=".22"/>';
    return s;
  }

  function egg(p) {
    let s = '';
    for (const sx of [1, -1]) {
      s += '<g class="wing ' + (sx > 0 ? 'wr' : 'wl') + '"><g transform="translate(50 0) scale(' + sx + ' 1)">';
      for (let i = 0; i < 4; i++) s += '<path d="M22 ' + (50 + i * 6) + 'C36 ' + (30 + i * 7) + ' 48 ' + (26 + i * 8) + ' ' + (49 - i * 4) + ' ' + (22 + i * 10) + 'C' + (44 - i * 3) + ' ' + (40 + i * 8) + ' 34 ' + (52 + i * 6) + ' 22 ' + (58 + i * 5) + 'Z" fill="#fbfaff" stroke="#8d9bd0" stroke-width="1"/>';
      s += '</g></g>';
    }
    s += '<path d="M50 12C67 12 79 38 79 56C79 76 66 88 50 88C34 88 21 76 21 56C21 38 33 12 50 12Z" fill="url(#' + p + 'goldr)" stroke="#4a2800" stroke-width="1.8"/>';
    s += '<g clip-path="url(#' + p + 'eggc)"><rect x="18" y="52" width="64" height="15" fill="#8a4d05" opacity=".55"/>';
    let m = ''; for (let x = 20; x < 82; x += 9) m += 'M' + x + ' 64v-9h6v6h-3v-3';
    s += '<path d="' + m + '" fill="none" stroke="#fff3bd" stroke-width="1.4"/><path d="M18 52h64M18 67h64" stroke="#fff3bd" stroke-width="1"/>';
    s += '<path d="M62 20C74 34 78 52 72 74C82 60 80 34 62 20Z" fill="#7a4504" opacity=".35"/><rect class="gleam" x="-30" y="8" width="16" height="84" fill="url(#' + p + 'shine)" opacity="0"/></g>';
    s += '<ellipse cx="39" cy="32" rx="6" ry="12" transform="rotate(22 39 32)" fill="#fff" opacity=".7"/>';
    s += star(80, 18, 7) + star(18, 26, 5) + star(74, 84, 4);
    return s;
  }
  function star(x, y, r) { return '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="#fff"/>'; }
  const BOLT = 'M58 4L26 52H45L36 96L76 40H55L68 4Z';

  function wild(p) {
    let s = '<circle cx="50" cy="50" r="45" fill="url(#' + p + 'gold)" stroke="#3a1c00" stroke-width="1.6"/>';
    s += '<circle cx="50" cy="50" r="38.500" fill="url(#' + p + 'storm)" stroke="#3a1c00" stroke-width="1.2"/>';
    s += '<circle cx="50" cy="50" r="41.800" fill="none" stroke="#7a4504" stroke-width="1.6" stroke-dasharray="1.2 4.2" stroke-linecap="round"/>';
    s += '<g class="bolt"><path class="bglow" d="' + BOLT + '" fill="#7fd0ff" opacity=".35" stroke="#7fd0ff" stroke-width="7" stroke-linejoin="round"/>';
    s += '<path d="' + BOLT + '" fill="url(#' + p + 'gold)" stroke="#fff8d0" stroke-width="1.4" stroke-linejoin="round"/></g>';
    s += '<g class="wb"><g transform="rotate(-7 50 52)"><path d="M1 39H99L93 52L99 65H1L7 52Z" fill="#1c0b4a" stroke="url(#' + p + 'gold)" stroke-width="2.4" stroke-linejoin="round"/>';
    s += '<text x="50" y="60.500" text-anchor="middle" font-family="' + SERIF + '" font-weight="900" font-size="23" letter-spacing="1.5" fill="none" stroke="#1a0d00" stroke-width="5" stroke-linejoin="round">WILD</text>';
    s += '<text x="50" y="60.500" text-anchor="middle" font-family="' + SERIF + '" font-weight="900" font-size="23" letter-spacing="1.5" fill="url(#' + p + 'gold)">WILD</text></g></g>';
    return s;
  }

  function coinBase(p, inner) {
    let s = '<circle cx="50" cy="50" r="45" fill="url(#' + p + 'goldr)" stroke="#3a1c00" stroke-width="1.6"/>';
    s += '<circle cx="50" cy="50" r="40.500" fill="none" stroke="#7a4504" stroke-width="2" stroke-dasharray="1.4 4.4" stroke-linecap="round"/>';
    s += '<circle cx="50" cy="50" r="35.500" fill="url(#' + p + inner + ')" stroke="#4a2800" stroke-width="1.5"/>';
    s += '<circle cx="50" cy="50" r="33" fill="none" stroke="#fff" stroke-width=".8" opacity=".25"/>';
    s += '<path d="M14 36A39 39 0 0 1 60 12" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>';
    return s;
  }
  function coin(p) {
    let s = coinBase(p, 'enamel');
    for (const sx of [1, -1]) for (let i = 0; i < 4; i++) { const a = (118 + i * 17) * Math.PI / 180; s += '<ellipse transform="translate(' + (50 + sx * Math.cos(a) * -27).toFixed(1) + ' ' + (50 + Math.sin(a) * 27).toFixed(1) + ') rotate(' + (sx * (-40 + i * 17)) + ')" rx="5" ry="2.1" fill="url(#' + p + 'gold)" opacity=".85"/>'; }
    return s;
  }
  function boltSym(p) {
    let s = coinBase(p, 'storm');
    s += '<g transform="translate(50 43) scale(.62) translate(-50 -50)"><g class="bi"><path d="' + BOLT + '" fill="#7fd0ff" opacity=".4" stroke="#7fd0ff" stroke-width="9" stroke-linejoin="round"/><path d="' + BOLT + '" fill="url(#' + p + 'gold)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g></g>';
    return s;
  }
  const TRIDENT = 'M50 92V30M50 30V6M34 34C34 22 38 20 38 10M66 34C66 22 62 20 62 10M34 34H66';
  function tridentSym(p) {
    let s = coinBase(p, 'sea');
    s += '<path class="ripple" d="M20 60q8-7 15 0t15 0 15 0 15 0" fill="none" stroke="#d8fff8" stroke-width="1.6" opacity=".6"/>';
    s += '<g transform="translate(50 42) scale(.66) translate(-50 -48)"><path d="' + TRIDENT + '" fill="none" stroke="#3a1c00" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="' + TRIDENT + '" fill="none" stroke="url(#' + p + 'goldh)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';
    s += '<path d="M50-2l5 10h-10zM38 2l4.500 9h-9zM62 2l4.500 9h-9z" fill="#ffe48a" stroke="#3a1c00" stroke-width="1.5" stroke-linejoin="round"/></g>';
    return s;
  }
  function sunSym(p) {
    let s = coinBase(p, 'enamel'), rays = '';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; rays += 'M' + (50 + Math.cos(a - 0.14) * 17).toFixed(1) + ' ' + (42 + Math.sin(a - 0.14) * 17).toFixed(1) + 'L' + (50 + Math.cos(a) * (i % 2 ? 26 : 30)).toFixed(1) + ' ' + (42 + Math.sin(a) * (i % 2 ? 26 : 30)).toFixed(1) + 'L' + (50 + Math.cos(a + 0.14) * 17).toFixed(1) + ' ' + (42 + Math.sin(a + 0.14) * 17).toFixed(1) + 'Z'; }
    s += '<path class="rays" d="' + rays + '" fill="#ffe45c" stroke="#a85a00" stroke-width=".8"/><circle cx="50" cy="42" r="16" fill="url(#' + p + 'sun)" stroke="#a85a00" stroke-width="1.2"/>';
    s += '<text x="50" y="48" text-anchor="middle" font-family="' + SERIF + '" font-weight="900" font-size="17" fill="#7a2c00">&#215;2</text>';
    return s;
  }
  function powerSym(p) {
    let s = '<g class="spear"><path d="M12 92L88 8" stroke="#3a1c00" stroke-width="6" stroke-linecap="round"/><path d="M12 92L88 8" stroke="#c98a4a" stroke-width="3" stroke-linecap="round"/><path d="M92 3L79 8L87 17Z" fill="#e8eef8" stroke="#3a1c00" stroke-width="1.4" stroke-linejoin="round"/></g>';
    s += '<circle cx="50" cy="50" r="40" fill="url(#' + p + 'bronze)" stroke="#2e1403" stroke-width="1.8"/>';
    s += '<circle cx="50" cy="50" r="33" fill="url(#' + p + 'crest)" stroke="#2e1403" stroke-width="1.4"/>';
    s += '<circle cx="50" cy="50" r="36.500" fill="none" stroke="#ffe9c4" stroke-width="1.6" stroke-dasharray="1 5.400" stroke-linecap="round"/>';
    /* rooster comb crest emblem */
    s += '<path d="M30 42C28 32 34 26 39 32C39 22 49 20 51 30C55 22 64 24 62 34C68 30 73 36 69 42C58 38 42 38 30 42Z" fill="url(#' + p + 'gold)" stroke="#3a1c00" stroke-width="1.2" stroke-linejoin="round"/>';
    s += '<path d="M24 34A30 30 0 0 1 52 20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>';
    return s;
  }
  function gemSym(p, j) {
    const NAMES = ['MINI', 'MINOR', 'MAJOR', 'GRAND'];
    let s = '<path d="M50 5L84 22L92 50L74 84H26L8 50L16 22Z" fill="url(#' + p + 'gold)" stroke="#3a1c00" stroke-width="1.6" stroke-linejoin="round"/>';
    s += '<path d="M50 11L80 26L86 50L71 78H29L14 50L20 26Z" fill="url(#' + p + 'gem' + j + ')" stroke="#1a0d00" stroke-width="1.2" stroke-linejoin="round"/>';
    s += '<path d="M50 11L60 30H40ZM20 26L40 30L28 50L14 50ZM80 26L60 30L72 50L86 50ZM28 50L40 70L29 78ZM72 50L60 70L71 78Z" fill="#fff" opacity=".28"/>';
    s += '<path d="M40 30H60L72 50L60 70H40L28 50Z" fill="#fff" opacity=".16" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/>';
    s += '<path d="M40 30L28 50L40 70M60 30L72 50L60 70M50 11V30M40 70L29 78M60 70L71 78" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>';
    s += '<g clip-path="url(#' + p + 'gemc)"><rect class="gleam" x="-30" y="0" width="18" height="100" fill="url(#' + p + 'shine)" opacity="0"/></g>';
    if (j === 3) s += '<path d="M34 12L37 0L44 8L50-3L56 8L63 0L66 12Z" fill="url(#' + p + 'gold)" stroke="#3a1c00" stroke-width="1.3" stroke-linejoin="round"/>';
    s += '<path d="M6 36H94L89 46L94 56H6L11 46Z" fill="#170a2a" stroke="url(#' + p + 'gold)" stroke-width="2" stroke-linejoin="round"/>';
    s += '<text x="50" y="52.500" text-anchor="middle" font-family="' + SERIF + '" font-weight="900" font-size="' + (j ? 15.5 : 17) + '" letter-spacing="1" fill="url(#' + p + 'gold)">' + NAMES[j] + '</text>';
    return s;
  }

  /* ---------- the roosters ---------- */
  const feather = (x, y, rot, len, w, fill, stroke) => '<path transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')" d="M0 0C' + w + ' ' + (len * 0.3) + ' ' + (w * 0.8) + ' ' + (len * 0.8) + ' 0 ' + len + 'C' + (-w * 0.8) + ' ' + (len * 0.8) + ' ' + (-w) + ' ' + (len * 0.3) + ' 0 0Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width=".8"/>';
  const COMB = 'M35 32C29 22 35 12 42 19C40 7 53 3 55 15C60 5 72 9 67 20C74 16 80 25 71 31C60 26 46 27 35 32Z';

  function bust(p, k) {
    const C = GOD_ART[k];
    let s = '';
    s += '<path d="M8 106C12 82 26 64 37 52L64 52C66 70 78 90 94 106Z" fill="' + C.f3 + '" stroke="' + C.o + '" stroke-width="1"/>';
    s += '<g class="chest">';
    for (let i = 0; i < 9; i++) s += feather(18 + i * 8, 63 + Math.abs(i - 4) * 1.2, (4 - i) * 6.5, 44, 7.8, i % 2 ? C.f3 : C.f2, C.o);
    for (let i = 0; i < 6; i++) s += feather(31 + i * 7.2, 53, (2.5 - i) * 9, 30, 6.8, i % 2 ? C.f2 : C.f1, C.o);
    s += '</g>';
    /* ruffled back of the head */
    s += '<path d="M39 30L27 30L35 37L24 41L34 45L26 52L37 53L33 61L45 57Z" fill="' + C.f2 + '" stroke="' + C.o + '" stroke-width="1" stroke-linejoin="round"/>';
    s += '<g class="head">';
    /* comb (some gods bring their own) */
    s += '<g class="comb">';
    if (k === 2) {
      s += '<path d="M34 33C27 24 35 18 32 6C41 11 44 16 44 23C45 14 50 8 48-4C58 4 61 13 58 23C62 18 66 13 65 5C73 14 74 25 69 33C58 27 46 27 34 33Z" fill="url(#' + p + 'flame)" stroke="#4a148c" stroke-width="1.2" stroke-linejoin="round"/>';
      s += '<path d="M40 30C37 24 41 20 40 14C45 18 46 22 46 26C48 20 51 16 51 9C56 15 57 21 55 27C58 24 61 21 61 16C65 22 65 27 63 31C56 28 47 28 40 30Z" fill="#ffe9ff" opacity=".85"/>';
    } else if (k === 1) {
      s += '<path d="M34 33C30 20 38 8 47 4C46 11 48 15 52 18C52 9 59 3 67 4C64 11 66 17 70 21C74 18 79 20 80 25C74 26 71 28 69 32C58 27 46 27 34 33Z" fill="url(#' + p + 'fin)" stroke="#0a2a78" stroke-width="1.2" stroke-linejoin="round"/>';
      s += '<path d="M40 28C40 20 43 12 46 7M48 27C50 22 52 20 52 18M56 27C57 18 61 10 65 6M64 29C66 26 68 23 70 21" fill="none" stroke="#d8f0ff" stroke-width="1" opacity=".8"/>';
    } else if (k === 4) {
      /* helmet crest in place of a comb */
      s += '<path d="M27 46C12 20 44-8 80 10C84 14 83 20 78 22C60 12 42 18 36 42Z" fill="url(#' + p + 'crest)" stroke="#4a0606" stroke-width="1.4" stroke-linejoin="round"/>';
      s += '<path d="M30 30C38 14 56 8 74 14M27 38C32 22 48 12 68 14" fill="none" stroke="#ffb0a0" stroke-width="1.1" opacity=".6"/>';
    } else {
      s += '<path d="' + COMB + '" fill="' + C.comb + '" stroke="' + C.comb2 + '" stroke-width="1.4" stroke-linejoin="round"/>';
      s += '<path d="M40 24C39 19 41 17 43 20M52 17C52 12 55 11 57 15M65 22C66 18 69 18 70 21" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>';
    }
    s += '</g>';
    /* wattles / beard */
    s += '<g class="wat">';
    if (k === 0) {
      for (const c of [[63, 58, 6.5], [69, 63, 6], [61, 66, 7], [67, 72, 6], [60, 75, 5.5], [65, 80, 4.5]]) s += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="#fff" stroke="#8d9bd0" stroke-width="1"/>';
      for (const c of [[63, 58, 5.5], [69, 63, 5], [61, 66, 6], [67, 72, 5], [60, 75, 4.5], [65, 80, 3.5]]) s += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="#fff"/>';
    } else {
      s += '<path d="M58 54C64 53 68 60 66 70C64 76 58 73 57 66C56 60 56 56 58 54Z" fill="' + C.wat2 + '" stroke="' + C.o + '" stroke-width=".8"/>';
      s += '<path d="M63 53C71 53 76 62 72 73C69 80 62 76 61 67C60 60 61 56 63 53Z" fill="' + C.wat + '" stroke="' + C.o + '" stroke-width="1"/>';
      s += '<path d="M66 58C69 60 70 64 69 68" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>';
    }
    s += '</g>';
    /* head */
    s += '<ellipse cx="52" cy="42" rx="17.500" ry="16.500" fill="' + C.f1 + '" stroke="' + C.o + '" stroke-width="1.2"/>';
    s += '<path d="M36 46C38 56 48 60 58 57C50 55 42 52 39 40Z" fill="' + C.f2 + '" opacity=".8"/>';
    s += '<path d="M42 44C44 47 47 48 50 48M44 50C46 52 49 53 52 52" fill="none" stroke="' + C.o + '" stroke-width="1" stroke-linecap="round" opacity=".55"/>';
    /* open beak with tongue: he is, after all, raging */
    s += '<g class="jaw"><path d="M66 47C72 49 77 53 80 58C74 58 69 56 66 53Z" fill="' + C.beak2 + '" stroke="#5a2c00" stroke-width="1" stroke-linejoin="round"/>';
    s += '<path d="M67 46C71 47 74 49 76 52C72 51 69 50 67 49Z" fill="#e0201c"/></g>';
    s += '<g class="beak"><path d="M65 35C76 33 87 38 92 47C84 44 75 46 66 47Z" fill="' + C.beak + '" stroke="#5a2c00" stroke-width="1.1" stroke-linejoin="round"/>';
    s += '<path d="M68 37C75 36 82 38 87 42" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".6"/><circle cx="71" cy="41" r=".9" fill="#5a2c00"/></g>';
    /* eye, an eyelid for blinking and a furious brow */
    s += '<ellipse cx="59.500" cy="38.500" rx="5.200" ry="4.700" fill="' + (k === 2 ? '#ffe9a0' : '#fff') + '" stroke="' + C.o + '" stroke-width="1"/>';
    s += '<g class="eye"><circle cx="60.800" cy="39" r="3" fill="' + C.iris + '"/><circle cx="61.200" cy="39" r="1.500" fill="#0a0408"/><circle cx="62.200" cy="37.800" r=".9" fill="#fff"/></g>';
    s += '<ellipse class="lid" cx="59.500" cy="38.500" rx="5.800" ry="5.300" fill="' + C.f2 + '" stroke="' + C.o + '" stroke-width="1" opacity="0"/>';
    s += '<path class="brow" d="M49 29.500L66.500 35.500L66 38L50 33.500Z" fill="' + C.o + '" stroke="' + C.o + '" stroke-width="1" stroke-linejoin="round"/>';
    s += '</g>';
    return s;
  }

  function godSym(p, k) {
    const col = GOD_COL[k];
    let s = '<circle cx="50" cy="52" r="45" fill="url(#' + p + 'gold)" stroke="#3a1c00" stroke-width="1.6"/>';
    s += '<circle cx="50" cy="52" r="42" fill="none" stroke="#7a4504" stroke-width="1.5" stroke-dasharray="1.2 4.300" stroke-linecap="round"/>';
    s += '<circle cx="50" cy="52" r="39.500" fill="url(#' + p + 'bg' + k + ')" stroke="' + col + '" stroke-width="2"/>';
    s += '<path d="M84 76A40 40 0 0 1 60 91" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>';
    s += '<g clip-path="url(#' + p + 'gclip)"><g class="orn">';
    if (k === 0) {
      s += '<path d="M12 70q6-8 14-3q5-8 13-2M60 22q6-7 13-2q6-5 11 2" fill="none" stroke="#b9ccff" stroke-width="1.6" opacity=".5"/>';
      s += '<g transform="translate(-13 -3) rotate(-8 30 50) scale(.86)"><path d="' + BOLT + '" fill="#bfe6ff" opacity=".45" stroke="#bfe6ff" stroke-width="8" stroke-linejoin="round"/><path d="' + BOLT + '" fill="url(#' + p + 'gold)" stroke="#fffbe0" stroke-width="1.6" stroke-linejoin="round"/></g>';
    } else if (k === 1) {
      s += '<path d="M10 74q8-7 15 0t15 0M58 80q8-7 15 0t15 0" fill="none" stroke="#d8fff8" stroke-width="1.6" opacity=".5"/>';
      for (const b of [[78, 30, 3], [84, 42, 2], [74, 20, 1.6]]) s += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="none" stroke="#d8fff8" stroke-width="1" opacity=".7"/>';
      s += '<g transform="translate(-30 2)"><path d="' + TRIDENT + '" fill="none" stroke="#3a1c00" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="' + TRIDENT + '" fill="none" stroke="url(#' + p + 'goldh)" stroke-width="4.600" stroke-linecap="round" stroke-linejoin="round"/><path d="M50-1l4.500 9h-9zM38 3l4 8h-8zM62 3l4 8h-8z" fill="#ffe48a" stroke="#3a1c00" stroke-width="1.3" stroke-linejoin="round"/></g>';
    } else if (k === 2) {
      s += '<path d="M10 92C12 78 18 76 17 66C24 72 25 80 24 86C28 80 30 76 29 70C35 78 36 86 34 94ZM66 96C66 84 72 80 71 70C78 76 80 84 79 90C83 84 86 80 85 74C91 82 92 90 90 98Z" fill="#c15bff" opacity=".6"/>';
      s += '<g transform="translate(-30 2)"><path d="M50 92V32M41 34C41 20 44 18 44 6M59 34C59 20 56 18 56 6M41 34H59" fill="none" stroke="#c9a0ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/><path d="M50 92V32M41 34C41 20 44 18 44 6M59 34C59 20 56 18 56 6M41 34H59" fill="none" stroke="#2a1a4a" stroke-width="5.400" stroke-linecap="round" stroke-linejoin="round"/><path d="M50 92V32M41 34C41 20 44 18 44 6M59 34C59 20 56 18 56 6M41 34H59" fill="none" stroke="#e4d0ff" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></g>';
    } else if (k === 3) {
      let rays = '';
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; rays += 'M' + (50 + Math.cos(a - 0.11) * 29).toFixed(1) + ' ' + (42 + Math.sin(a - 0.11) * 29).toFixed(1) + 'L' + (50 + Math.cos(a) * (i % 2 ? 40 : 47)).toFixed(1) + ' ' + (42 + Math.sin(a) * (i % 2 ? 40 : 47)).toFixed(1) + 'L' + (50 + Math.cos(a + 0.11) * 29).toFixed(1) + ' ' + (42 + Math.sin(a + 0.11) * 29).toFixed(1) + 'Z'; }
      s += '<path class="srays" d="' + rays + '" fill="#fff7b0" stroke="#e08a00" stroke-width=".8"/><circle cx="50" cy="42" r="29" fill="#fffbe0" stroke="#e08a00" stroke-width="1.2" opacity=".9"/>';
    } else {
      s += '<path d="M6 98L40 0" stroke="#2e1403" stroke-width="5.500" stroke-linecap="round"/><path d="M6 98L40 0" stroke="#c98a4a" stroke-width="2.800" stroke-linecap="round"/><path d="M43-8L33 4L42 6Z" fill="#e8eef8" stroke="#2e1403" stroke-width="1.3" stroke-linejoin="round"/>';
      for (const b of [[80, 30], [86, 44], [76, 20], [14, 60]]) s += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="1.300" fill="#ffd75e"/>';
    }
    s += '</g>';
    s += bust(p, k);
    if (k === 0 || k === 3) {
      /* a laurel crown */
      s += '<g class="crown">';
      for (let i = 0; i < 5; i++) s += '<ellipse transform="translate(' + (38 + i * 6) + ' ' + (33 - i * 1.6) + ') rotate(' + (-58 + i * 6) + ')" rx="5.600" ry="2.500" fill="' + (k === 0 ? 'url(#' + p + 'gold)' : 'url(#' + p + 'leaf)') + '" stroke="' + (k === 0 ? '#5a3200' : '#12401a') + '" stroke-width=".8"/>';
      s += '</g>';
    } else if (k === 4) {
      /* bronze helmet over the skull */
      s += '<g class="crown"><path d="M33 47C29 28 41 22 53 22C65 22 72 28 71 36L64 34C59 32 53 34 52 39L50 52C45 56 39 54 35 51Z" fill="url(#' + p + 'bronzeh)" stroke="#2e1403" stroke-width="1.3" stroke-linejoin="round"/>';
      s += '<path d="M36 44C34 32 42 26 53 26" fill="none" stroke="#ffe9c4" stroke-width="1.2" opacity=".8"/>';
      s += '<path d="M30 42C32 26 50 16 76 20L75 25C54 22 40 30 37 44Z" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width="1"/>';
      s += '<path d="M55 30L64 46" stroke="#2a0503" stroke-width="1.200" opacity=".7"/></g>';
    } else if (k === 1) {
      s += '<g class="crown"><path d="M40 31L42 24L46 29L50 22L54 28L58 23L61 30Z" fill="url(#' + p + 'gold)" stroke="#4a2800" stroke-width=".9" stroke-linejoin="round"/></g>';
    }
    s += '</g>';
    s += '<circle class="halo" cx="50" cy="52" r="46" fill="none" stroke="' + col + '" stroke-width="3" opacity="0"/>';
    return s;
  }

  const SYM_KEYS = ['ten', 'jack', 'queen', 'king', 'ace', 'lyre', 'amphora', 'wreath', 'helmet', 'egg', 'wild', 'coin'];
  function symbolMarkup(p, key) {
    if (LETTERS[key]) return letter(p, key, LETTERS[key]);
    switch (key) {
      case 'lyre': return lyre(p);
      case 'amphora': return amphora(p);
      case 'wreath': return wreath(p);
      case 'helmet': return helmet(p);
      case 'egg': return egg(p);
      case 'wild': return wild(p);
      case 'coin': return coin(p);
      case 'bolt': return boltSym(p);
      case 'trident': return tridentSym(p);
      case 'sun': return sunSym(p);
      case 'power': return powerSym(p);
    }
    if (key.slice(0, 3) === 'god') return godSym(p, +key[3]);
    if (key.slice(0, 3) === 'gem') return gemSym(p, +key[3]);
    return '';
  }
  /* animated layers that only exist in the idle (-i) and win (-w) variants of a symbol */
  function spk(pts) { return pts.map((q, i) => '<g transform="translate(' + q[0] + ' ' + q[1] + ')"><g class="spk s' + (i % 3) + '">' + star(0, 0, q[2]) + '</g></g>').join(''); }
  function extra(p, key, v) {
    if (LETTERS[key]) return '<g clip-path="url(#' + p + 'lc-' + key + ')"><rect class="shine" x="-46" y="0" width="40" height="100" fill="url(#' + p + 'shine)"/></g>' + (v === 'w' ? spk([[84, 20, 6], [16, 76, 5], [80, 84, 4]]) : '');
    const g = key.slice(0, 3);
    if (g === 'god') return v === 'w' ? spk([[14, 18, 6], [88, 24, 5], [86, 86, 4]]) : '';
    if (g === 'gem') return spk([[86, 14, 6], [12, 30, 4], [80, 86, 5]]);
    switch (key) {
      case 'lyre': return v === 'w' ? '<g transform="translate(78 30)"><g class="note n0"><path d="M0 0v-14l9-3v14" fill="none" stroke="#fff3bd" stroke-width="2"/><ellipse cx="-2.6" cy="0" rx="3.6" ry="2.7" fill="#fff3bd"/><ellipse cx="6.4" cy="-3" rx="3.6" ry="2.7" fill="#fff3bd"/></g></g><g transform="translate(18 40)"><g class="note n1"><path d="M0 0v-15" fill="none" stroke="#fff3bd" stroke-width="2"/><path d="M0-15q6 2 6 8" fill="none" stroke="#fff3bd" stroke-width="2"/><ellipse cx="-2.6" cy="0" rx="3.6" ry="2.7" fill="#fff3bd"/></g></g>' : '';
      case 'amphora': case 'helmet': case 'wreath': return v === 'w' ? spk([[82, 18, 6], [16, 30, 5], [84, 78, 4]]) : '';
      case 'egg': return v === 'w' ? spk([[50, 6, 6], [10, 60, 4], [90, 64, 5]]) : '';
      case 'wild': return '<g class="arcs" fill="none" stroke="#dff2ff" stroke-width="1.8" stroke-linejoin="bevel"><path class="arc a0" d="M8 30l9 5-5 4 10 6"/><path class="arc a1" d="M92 66l-9-3 4-5-11-4"/><path class="arc a2" d="M70 6l-4 9 6 1-6 9"/><path class="arc a0" d="M24 92l6-8-6-2 8-8"/></g>';
      case 'coin': case 'bolt': case 'trident': case 'sun': case 'power': return '<g transform="translate(50 50)"><g class="orbit"><g transform="translate(-30 -31)">' + star(0, 0, 6) + '</g></g></g>';
    }
    return '';
  }
  const LINE_KEYS = SYM_KEYS;
  const GOD_KEYS = ['god0', 'god1', 'god2', 'god3', 'god4'], GEM_KEYS = ['gem0', 'gem1', 'gem2', 'gem3'], SPEC_KEYS = ['bolt', 'trident', 'sun', 'power'];
  const ALL_KEYS = SYM_KEYS.concat(SPEC_KEYS, GOD_KEYS, GEM_KEYS);
  const HAS_I = { wild: 1, egg: 1, coin: 1, bolt: 1, trident: 1, sun: 1, power: 1, god0: 1, god1: 1, god2: 1, god3: 1, god4: 1, gem0: 1, gem1: 1, gem2: 1, gem3: 1 };
  const famOf = (k) => (LETTERS[k] ? 'let' : k.slice(0, 3) === 'god' ? 'god' : k.slice(0, 3) === 'gem' ? 'gem' : k);
  const P = 'olympus-';
  function defsSvg() {
    let s = '<svg class="g-olympus-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + defs(P);
    for (const k of ALL_KEYS) {
      const m = symbolMarkup(P, k), f = famOf(k);
      s += '<g id="' + P + 's-' + k + '">' + m + '</g>';
      s += '<g id="' + P + 's-' + k + '-w" class="w w-' + f + ' w-' + k + '"><g class="all">' + m + '</g>' + extra(P, k, 'w') + '</g>';
      if (HAS_I[k]) s += '<g id="' + P + 's-' + k + '-i" class="i i-' + f + ' i-' + k + '"><g class="all">' + m + '</g>' + extra(P, k, 'i') + '</g>';
    }
    return s + '</defs></svg>';
  }
  const useSym = (key, cls) => '<svg class="' + (cls || 'sym') + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#' + P + 's-' + key + '"/></svg>';

  /* ---------- lobby poster ---------- */
  function poster() {
    const p = 'olympus-p-';
    const med = (k, x, y, sc) => '<g transform="translate(' + x + ' ' + y + ') scale(' + sc + ')">' + godSym(p, k) + '</g>';
    const word = (txt, x, y, size, ls, font) => { const a = 'x="' + x + '" y="' + y + '" text-anchor="middle" font-family="' + (font || DECO) + '" font-weight="900" font-size="' + size + '" letter-spacing="' + (ls || 0) + '"'; return '<text ' + a + ' fill="none" stroke="#140802" stroke-width="' + (size * 0.2) + '" stroke-linejoin="round">' + txt + '</text><text ' + a + ' fill="none" stroke="#6b3a03" stroke-width="' + (size * 0.09) + '" stroke-linejoin="round">' + txt + '</text><text ' + a + ' fill="url(#' + p + 'gold)">' + txt + '</text>'; };
    let s = '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>' + defs(p);
    s += lg(p + 'sky', [[0, '#070a26'], [0.45, '#2a1670'], [0.8, '#7a2c8a'], [1, '#e0704a']]);
    s += rg(p + 'halo', [[0, '#fff8d0', 0.9], [0.4, '#ffc832', 0.35], [1, '#ffc832', 0]]);
    s += '</defs><rect width="320" height="400" fill="url(#' + p + 'sky)"/>';
    s += '<circle cx="160" cy="232" r="170" fill="url(#' + p + 'halo)"/>';
    let rays = ''; for (let i = 0; i < 18; i++) { const a = i * Math.PI / 9; rays += 'M160 232L' + (160 + Math.cos(a - 0.06) * 330).toFixed(0) + ' ' + (232 + Math.sin(a - 0.06) * 330).toFixed(0) + 'L' + (160 + Math.cos(a + 0.06) * 330).toFixed(0) + ' ' + (232 + Math.sin(a + 0.06) * 330).toFixed(0) + 'Z'; }
    s += '<path d="' + rays + '" fill="#ffd75e" opacity=".1"/>';
    s += '<path d="M-10 150q30-26 62-8q24-30 60-10q30-22 58 0q34-24 66-2q30-20 60 4q20-12 40 0v-60h-346z" fill="#150c3a" opacity=".85"/><path d="M-10 132q36-22 70-4q30-26 64-6q32-20 60 0q30-22 64-4q30-16 72 6v-130h-330z" fill="#0b0828"/>';
    s += '<path d="M40 128L62 168H50L70 214L28 160H42L24 128Z" fill="#fff8d0" stroke="#7fd0ff" stroke-width="3" stroke-linejoin="round" opacity=".9"/><path d="M286 130L268 166H279L262 206L298 158H285L300 130Z" fill="#fff8d0" stroke="#7fd0ff" stroke-width="3" stroke-linejoin="round" opacity=".9"/>';
    /* columns and steps */
    for (const x of [-6, 290]) { s += '<rect x="' + x + '" y="150" width="36" height="250" fill="url(#' + p + 'marble)"/>'; for (let i = 0; i < 4; i++) s += '<rect x="' + (x + 5 + i * 8) + '" y="160" width="3" height="240" fill="#8d8474" opacity=".5"/>'; s += '<rect x="' + (x - 4) + '" y="142" width="44" height="12" rx="2" fill="url(#' + p + 'gold)" stroke="#4a2800"/>'; }
    s += '<path d="M0 372h320v28H0z" fill="url(#' + p + 'marble)"/><path d="M0 372h320" stroke="url(#' + p + 'goldh)" stroke-width="3"/>';
    s += '<text x="160" y="391" text-anchor="middle" font-family="' + SERIF + '" font-weight="800" font-size="11.500" letter-spacing="3" fill="#4a3c2c">FIVE GODS &#183; FIVE BONUSES</text>';
    /* the cast */
    s += med(1, 22, 268, 0.74) + med(2, 88, 292, 0.74) + med(3, 158, 292, 0.74) + med(4, 224, 268, 0.74);
    s += med(0, 75, 122, 1.7);
    /* lettering */
    s += word('RAGING', 160, 40, 30, 5, SERIF) + word('COCKS', 160, 92, 60, 1) + word('OF OLYMPUS', 160, 121, 21, 3, SERIF);
    s += '<g transform="translate(262 176)"><circle r="27" fill="url(#' + p + 'goldr)" stroke="#3a1c00" stroke-width="2"/><circle r="21" fill="url(#' + p + 'storm)" stroke="#3a1c00" stroke-width="1.4"/>' + word('2', 0, 15, 40, 0) + '</g>';
    return s + '</svg>';
  }

  /* ---------- the mountain at storm-dusk, as separate layers so the moving parts never repaint the sky ---------- */
  function sceneHtml() {
    const p = P + 'sc-';
    const sv = (inner, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + inner + '</svg>';
    let d = '<defs>';
    d += lg(p + 'sky', [[0, '#05071e'], [0.35, '#1a1158'], [0.62, '#4a1f86'], [0.82, '#a23a7a'], [1, '#f08a4a']]);
    d += lg(p + 'mt', [[0, '#5a4aa0'], [0.5, '#2a1c66'], [1, '#120a36']]);
    d += lg(p + 'mt2', [[0, '#2c2070'], [1, '#0c0628']]);
    d += rg(p + 'glow', [[0, '#ffe9a0', 0.75], [0.5, '#ff9a5a', 0.25], [1, '#ff9a5a', 0]]);
    d += lg(p + 'floor', [[0, '#3a2c7a'], [1, '#0e0830']]);
    d += lg(p + 'cl', [[0, '#3a2a8a'], [1, '#120c40']]);
    d += '</defs>';
    const stars = (seed, n, big) => { let s = ''; for (let i = 0; i < n; i++) { const x = (i * 197.3 + seed * 61.7) % 1280, y = (i * 83.7 + seed * 37.1) % 400; s += big && i % 3 === 0 ? '<path transform="translate(' + x.toFixed(0) + ' ' + y.toFixed(0) + ')" d="M0-5Q0 0 5 0Q0 0 0 5Q0 0-5 0Q0 0 0-5Z" fill="#fff"/>' : '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (big ? 1.6 : i % 7 === 0 ? 1.5 : 0.9) + '" fill="#fff" opacity="' + (big ? 0.9 : 0.25 + (i % 5) * 0.1) + '"/>'; } return s; };
    let html = '<div class="lyr sky">' + sv(d + '<rect width="1280" height="800" fill="url(#' + p + 'sky)"/>' + stars(0, 70, false) + '<ellipse cx="640" cy="650" rx="620" ry="210" fill="url(#' + p + 'glow)"/>') + '</div>';
    html += '<div class="lyr tw tw1">' + sv(stars(3, 22, true)) + '</div><div class="lyr tw tw2">' + sv(stars(8, 22, true)) + '</div>';
    /* the moon, and bats crossing it — this is still the Batty Casino sky */
    let moon = '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' + rg(p + 'mglow', [[0.3, '#fff3c8', 0.55], [0.55, '#ffcf8a', 0.18], [1, '#ffcf8a', 0]]) + rg(p + 'mdisc', [[0, '#fffdf0'], [0.6, '#f3e6c0'], [1, '#c9b48a']], 0.4, 0.35, 0.7) + '</defs>';
    moon += '<circle cx="100" cy="100" r="100" fill="url(#' + p + 'mglow)"/><circle cx="100" cy="100" r="52" fill="url(#' + p + 'mdisc)"/>';
    for (const c of [[82, 86, 9], [112, 74, 6], [118, 112, 11], [88, 122, 6], [70, 104, 4], [104, 96, 3.5]]) moon += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="#b9a374" opacity=".35"/><circle cx="' + (c[0] - 1) + '" cy="' + (c[1] - 1) + '" r="' + (c[2] * 0.7) + '" fill="#fff8e0" opacity=".25"/>';
    moon += '</svg>';
    html += '<div class="lyr moon">' + moon + '</div>';
    let bats = '<div class="lyr bats">';
    const BATS = [[9, 26, -3, 0.7, 0], [17, 34, -14, 0.5, 1], [6, 41, -27, 0.9, 0], [22, 30, -8, 0.42, 1], [13, 52, -38, 0.6, 0]];
    BATS.forEach((b, i) => { bats += '<i class="bat' + (b[4] ? ' rev' : '') + '" style="--y:' + b[0] + '%;--d:' + b[1] + 's;--dl:' + b[2] + 's;--s:' + b[3] + '"><svg viewBox="0 0 120 44" aria-hidden="true"><path d="' + (Batty.batPath || '') + '" fill="#0a0620"/></svg></i>'; void i; });
    html += bats + '</div>';
    /* far peaks, Olympus with its temple */
    let far = '<path d="M0 640L150 470L250 560L380 420L470 520L560 470L640 560L760 450L860 540L980 400L1100 520L1190 460L1280 560V800H0Z" fill="url(#' + p + 'mt2)" opacity=".8"/>';
    far += '<path d="M330 800L560 300L610 250L640 262L680 240L730 310L960 800Z" fill="url(#' + p + 'mt)"/>';
    far += '<path d="M610 250L640 262L680 240L700 270L668 300L650 282L626 310L596 272Z" fill="#e8e0ff" opacity=".85"/>';
    far += '<g transform="translate(606 196)" fill="#fff3d0"><path d="M0 22L38 4L76 22Z"/><rect x="2" y="24" width="72" height="5"/><rect y="52" x="-2" width="80" height="6"/>';
    for (let i = 0; i < 6; i++) far += '<rect x="' + (5 + i * 12.6) + '" y="29" width="5" height="23"/>';
    far += '</g><ellipse cx="644" cy="222" rx="90" ry="60" fill="url(#' + p + 'glow)" opacity=".8"/>';
    html += '<div class="lyr far par" data-d="6">' + sv(far) + '</div>';
    html += '<i class="lyr tglow"></i>';
    /* storm clouds drift on their own layers */
    html += '<div class="lyr cl cla par" data-d="10">' + sv('<path d="M-80 150q70-70 160-20q60-80 170-30q80-60 170 0q90-50 180 10q70-30 120 30q-200 60-420 40t-380-30z" fill="#0d0a30"/><path d="M700 110q80-60 170-10q70-70 180-20q90-50 170 20q70-20 110 30q-190 50-380 30t-250-50z" fill="#120d3c"/>') + '</div>';
    html += '<div class="lyr cl clb par" data-d="16">' + sv('<path d="M-60 250q90-50 170-10q70-60 160-10q80-40 150 20q-150 50-300 34t-180-34z" fill="url(#' + p + 'cl)" opacity=".7"/><path d="M820 230q90-60 180-10q80-50 160 0q70-30 130 30q-170 50-320 30t-150-50z" fill="url(#' + p + 'cl)" opacity=".7"/>') + '</div>';
    html += '<div class="lyr near par" data-d="22">' + sv('<path d="M0 800V600L90 520L160 600L240 540L330 650L420 800ZM1280 800V590L1180 510L1110 600L1040 550L950 660L880 800Z" fill="#0c0628"/><path d="M0 742h1280v58H0z" fill="url(#' + p + 'floor)"/><path d="M-100 20q120-70 260-10q110-80 250-10q120-60 240 10q130-60 250 10q110-50 220 20q90-30 180 20v-120h-1400z" fill="#06051a"/>') + '</div>';
    /* bonus-only: god rays and a blood-red storm tint */
    html += '<i class="lyr tint"></i><i class="rays"></i>';
    html += '<canvas class="amb" aria-hidden="true"></canvas>';
    /* sky bolts: lit only on big moments */
    html += '<div class="lyr bolts">' + sv('<path class="skybolt b1" d="M300 60L270 180L300 176L250 320L280 314L236 430" fill="none" stroke="#e8f4ff" stroke-width="5" stroke-linejoin="bevel"/><path class="skybolt b2" d="M1010 50L1040 170L1012 168L1066 300L1036 296L1080 400" fill="none" stroke="#e8f4ff" stroke-width="5" stroke-linejoin="bevel"/><path class="skybolt b3" d="M640 40L620 110L650 108L628 196" fill="none" stroke="#fff3bd" stroke-width="4" stroke-linejoin="bevel"/>') + '</div>';
    html += '<i class="flash"></i>';
    return html;
  }

  /* ---------- small helpers ---------- */
  function short(n) {
    n = Math.round(n);
    if (n < 100000) return Batty.fmt(n);
    if (n < 1000000) return (Math.floor(n / 100) / 10).toFixed(n % 1000 >= 100 && n < 999950 ? 1 : 0) + 'K';
    return (Math.floor(n / 10000) / 100).toFixed(2).replace(/\.?0+$/, '') + 'M';
  }
  const LINE_COL = (i) => 'hsl(' + ((i * 47 + 40) % 360) + ' 95% 62%)';
  const A = Batty.audio;
  /* Olympus's own sound kit — all synthesised */
  const snd = {
    strum() { A.seq([330, 392, 440, 494, 587], { step: 0.035, type: 'triangle', v: 0.09 }); A.noise({ d: 0.3, v: 0.07, lp: 400, f2: 2400 }); },
    kick() { A.tone({ f: 260, f2: 140, d: 0.08, type: 'triangle', v: 0.1 }); },
    whirr() { A.noise({ d: 0.07, v: 0.025, lp: 900 + Math.random() * 300 }); A.tone({ f: 240 + Math.random() * 50, d: 0.02, type: 'triangle', v: 0.018 }); },
    thud(i) { A.tone({ f: 120 - i * 6, f2: 52, d: 0.13, type: 'sine', v: 0.34 }); A.noise({ d: 0.06, v: 0.12, lp: 1300 }); A.tone({ f: 900 + i * 60, d: 0.03, type: 'square', v: 0.025, t: 0.01 }); },
    pluck(f) { A.tone({ f: f, d: 0.5, type: 'triangle', v: 0.16 }); A.tone({ f: f * 2, d: 0.2, type: 'sine', v: 0.05 }); },
    cluck() { A.tone({ f: 640, f2: 380, d: 0.06, type: 'square', v: 0.07 }); A.tone({ f: 720, f2: 430, d: 0.07, type: 'square', v: 0.07, t: 0.09 }); },
    crow() {
      const n = [[520, 700, 0.13, 0], [700, 690, 0.1, 0.14], [660, 940, 0.2, 0.27], [940, 990, 0.28, 0.48], [990, 500, 0.55, 0.76]];
      for (const x of n) { A.tone({ f: x[0], f2: x[1], d: x[2], type: 'sawtooth', v: 0.12, t: x[3] }); A.tone({ f: x[0] * 2.01, f2: x[1] * 2.01, d: x[2], type: 'square', v: 0.03, t: x[3] }); }
    },
    zap() { A.noise({ d: 0.22, v: 0.22, hp: 2600 }); A.tone({ f: 1900, f2: 110, d: 0.3, type: 'sawtooth', v: 0.13 }); },
    crackle() { A.noise({ d: 0.05, v: 0.06, hp: 4000 }); },
    thunder() { Batty.sfx('thunder'); },
    boom() { A.tone({ f: 70, f2: 28, d: 0.7, type: 'sine', v: 0.45 }); A.noise({ d: 0.6, v: 0.18, lp: 500, f2: 60 }); },
    clang() { A.tone({ f: 523, d: 0.45, type: 'square', v: 0.06 }); A.tone({ f: 785, d: 0.36, type: 'square', v: 0.045 }); A.tone({ f: 1318, d: 0.22, type: 'triangle', v: 0.07 }); A.noise({ d: 0.07, v: 0.2, hp: 4200 }); },
    bell() { A.tone({ f: 110, d: 1.5, type: 'sine', v: 0.3 }); A.tone({ f: 164, d: 1.1, type: 'sine', v: 0.14 }); A.tone({ f: 277, d: 0.8, type: 'triangle', v: 0.07 }); A.noise({ d: 0.8, v: 0.05, hp: 3200 }); },
    harp() { A.seq([392, 440, 494, 587, 659, 784, 880, 988, 1175, 1319], { step: 0.038, type: 'triangle', v: 0.12 }); },
    wave() { Batty.sfx('splash'); A.noise({ d: 0.9, v: 0.12, lp: 400, f2: 2600 }); },
    rise(d) { A.tone({ f: 180, f2: 720, d: d, type: 'sawtooth', v: 0.05 }); A.noise({ d: d, v: 0.06, lp: 500, f2: 5000 }); },
    antic(n, d) { const b = 196 * Math.pow(1.26, n); A.tone({ f: b, f2: b * 2.4, d: d, type: 'sawtooth', v: 0.05 }); A.tone({ f: b * 1.5, f2: b * 3.6, d: d, type: 'square', v: 0.02 }); A.noise({ d: d, v: 0.05, lp: 400, f2: 4500 }); },
    fizzle() { A.tone({ f: 320, f2: 140, d: 0.28, type: 'triangle', v: 0.07 }); },
    fanfare() { A.seq([392, 392, 523, [659, 2], 587, [784, 4]], { step: 0.11, type: 'sawtooth', v: 0.1 }); A.seq([196, 0, 262, [330, 2], 294, [392, 4]], { step: 0.11, type: 'square', v: 0.06 }); },
    heart() { A.tone({ f: 70, f2: 40, d: 0.16, type: 'sine', v: 0.4 }); A.tone({ f: 70, f2: 40, d: 0.16, type: 'sine', v: 0.3, t: 0.22 }); },
    win(ratio) { const up = [330, 392, 494, 587, 659, 784, 988, 1175]; A.seq(up.slice(0, ratio >= 5 ? 8 : ratio >= 1 ? 6 : 4), { step: 0.07, type: 'triangle', v: 0.16 }); },
    tick(k) { A.tone({ f: 1100 + k * 900, d: 0.028, type: 'square', v: 0.035 }); },
    lock(n) { A.tone({ f: 170, f2: 80, d: 0.14, type: 'sine', v: 0.34 }); A.tone({ f: 1180 + n * 150, d: 0.2, type: 'square', v: 0.045, t: 0.01 }); A.tone({ f: 2360 + n * 300, d: 0.14, type: 'triangle', v: 0.05, t: 0.03 }); A.noise({ d: 0.06, v: 0.14, hp: 3200 }); },
    reset() { A.seq([784, 988, 1175, 1568], { step: 0.05, type: 'triangle', v: 0.13 }); A.noise({ d: 0.4, v: 0.06, hp: 2500, f2: 9000 }); },
    empty() { A.tone({ f: 200, f2: 120, d: 0.04, type: 'sine', v: 0.1 }); },
    gong() { A.tone({ f: 98, d: 2.2, type: 'sine', v: 0.32 }); A.tone({ f: 147, d: 1.8, type: 'triangle', v: 0.1 }); A.tone({ f: 233, d: 1.4, type: 'sine', v: 0.08 }); A.noise({ d: 1.2, v: 0.06, lp: 2000, f2: 300 }); },
  };

  /* ---------- rules ---------- */
  const SIM = { rtp: '96.09', spins: '20,000,000', buy: ['96.31', '95.89', '96.10'] }; /*SIMLINE*/
  function rules() {
    const x = (u) => { const v = u / U; return (Math.round(v * 100) / 100) + '×'; };
    let t = '<h3>The short version</h3><p>Five reels, three rows, <b>20 fixed paylines</b>. Five rooster gods live on Mount Olympus and every one of them is furious. Land them to wake the <b>Cock Combo</b> hold-and-respin bonus, where each god in play brings his own modifier. Up to all five can rage at once.</p>';
    t += '<h3>Line pays (multiples of your total stake)</h3><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>';
    for (let i = 10; i >= 0; i--) t += '<tr><td>' + M.SYMBOL_NAMES[i] + (M.PAY[i][2] ? ' <small>(2 pays ' + x(M.PAY[i][2]) + ')</small>' : '') + '</td><td>' + x(M.PAY[i][3]) + '</td><td>' + x(M.PAY[i][4]) + '</td><td>' + x(M.PAY[i][5]) + '</td></tr>';
    t += '</table><p>Lines pay left to right from the first reel; only the best win on each line is paid. <b>Wild</b> stands in for everything except Drachma Prizes and Rooster Gods.</p>';
    t += '<h3>The Cock Combo</h3><ul><li><b>Three or more gods</b> on the reels always start the bonus. <b>One or two gods</b> can start it at random.</li><li>Every god on the triggering spin switches on his modifier, so the bonus runs with anything from one modifier to all five together.</li><li>The gods and any Drachma Prizes on screen lock in place as prizes. You get <b>3 respins</b>; every new prize that lands sticks and resets the count to 3.</li><li>Each god in play is guaranteed to strike at least once before the bonus can end.</li><li>It ends when the respins run out or all 15 spots are full. <b>A full board also pays the Grand.</b> Everything on the board is then paid.</li></ul>';
    t += '<table><tr><th>God</th><th>Modifier</th><th>What he does</th></tr>';
    for (let k = 0; k < 5; k++) t += '<tr><td><b>' + M.GODS[k].name + '</b><br><small>' + M.GODS[k].title + '</small></td><td>' + M.GODS[k].feature + '</td><td>' + M.GODS[k].blurb + '</td></tr>';
    t += '</table>';
    t += '<h3>Super pots</h3><p>Gods that land without starting the bonus feed their pot above the reels. Any pot can burst, at any size, to launch a <b>Super Cock Combo</b> with at least two gods in play. The pot sizes are for show; the burst is decided at random on each spin and a bigger pot is not more likely to burst.</p>';
    t += '<h3>Jackpots</h3><table><tr><th>Mini</th><th>Minor</th><th>Major</th><th>Grand</th></tr><tr>' + M.JACKPOTS.map((j) => '<td>' + Batty.fmt(j.x) + '× stake</td>').join('') + '</tr></table><p>Fixed, and scaled to your stake. Jackpot gems only land when Hendes is in play; the Grand is also paid for filling the board.</p>';
    t += '<h3>Buy the bonus</h3><table><tr><th>Buy</th><th>You get</th><th>Price</th><th>Tested return</th></tr>';
    M.CFG.buy.forEach((b, i) => { t += '<tr><td>' + b.name + '</td><td>' + b.sub + '</td><td>' + (b.price / U) + '× stake</td><td>' + SIM.buy[i] + '%</td></tr>'; });
    t += '</table><h3>Controls</h3><p><b>Space</b> or the big button spins. Tap the reels, the button or Space during a spin to slam the reels to a stop, and tap again to hurry any long presentation along. <b>Turbo</b> halves every animation; <b>Auto</b> plays 10 to 100 spins and stops whenever you press it again.</p>';
    t += '<h3>Small print</h3><p>The most any single spin or bought bonus can pay is <b>' + Batty.fmt(M.MAX_WIN_X) + '× your stake</b>; the bonus ends at once if it gets there.</p>';
    t += '<p class="rtp">Tested return: ' + SIM.rtp + '% over ' + SIM.spins + ' simulated spins (bonus buys: ' + SIM.buy.join('%, ') + '%).</p>';
    t += '<p>Batty Bucks are play money with no cash value.</p>';
    return t;
  }

  /* =====================================================================================
     THE GAME
     ===================================================================================== */
  const pots = [0, 0, 0, 0, 0];            // cosmetic pot stages, kept for the session
  let S = null, root = null, E = null, stakeCtl = null;
  let busy = false, auto = 0, turbo = false, skipFns = [], tapFn = null, cycleTok = 0, mode = 'base';
  let reels = [], reelLoop = null, slots = [], fxList = [], fxStop = null, fxCv = null, fxCx = null, fxDpr = 1;
  let devNext = null, devSpeed = 1, devLog = null;
  let rush = false, slamReq = false, hum = 0, lay = 'narrow', rm = false, geo = { cw: 72, ch: 80 }, aresShown = false;
  let amb = null, par = { x: 0, y: 0, tx: 0, ty: 0 };
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));

  /* every presentation delay runs through T: turbo halves it, and a tap mid-feature hurries the rest along */
  const T = (ms) => ms * (turbo ? 0.5 : 1) * devSpeed * (rush ? 0.3 : 1) * (rm ? 0.75 : 1);
  const nap = (ms) => S.sleep(T(ms));
  /* a sleep the player can cut short with a click / Space */
  function napSkip(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; const i = skipFns.indexOf(fin); if (i >= 0) skipFns.splice(i, 1); res(); };
      skipFns.push(fin); S.timeout(fin, T(ms));
    });
  }
  function doSkip() { const f = skipFns.slice(); skipFns.length = 0; f.forEach((x) => x()); }
  /* wait for a tap (or Space), or give up waiting after ms */
  function waitTap(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; if (tapFn === fin) tapFn = null; res(); };
      tapFn = fin; S.timeout(fin, T(ms));
    });
  }
  /* slam-stop the reels, or hurry the presentation */
  function hurry() { if (!busy) return; slamReq = true; doSkip(); if (mode !== 'base' || reels.every((R) => R.phase === 'idle')) rush = true; }
  const unitOf = () => stakeCtl.value / U;

  /* ---------- build ---------- */
  function mount(el, B) {
    S = B.scope(); root = el; busy = false; auto = 0; skipFns = []; tapFn = null; mode = 'base'; fxList = []; fxStop = null; reels = []; slots = [];
    turbo = false; devNext = null; rush = false; slamReq = false; reelLoop = null; cycleTok = 0; hum = 0; rm = reduce(); aresShown = false;
    E = {};
    root.innerHTML = defsSvg();
    const scene = h('div', { class: 'scene', html: sceneHtml() });
    E.scene = scene; E.par = Array.prototype.slice.call(scene.querySelectorAll('.par')); E.amb = scene.querySelector('.amb');

    /* jackpots */
    E.jp = h('div', { class: 'jp' });
    E.jpv = [];
    for (let j = 3; j >= 0; j--) {
      const v = h('b', null, '');
      E.jpv[j] = v;
      E.jp.append(h('div', { class: 'plaque j' + j, 'data-j': j }, h('i', { html: useSym('gem' + j, 'gem') }), h('span', null, M.JACKPOTS[j].name), v));
    }

    /* temple: pediment + altars + reels */
    E.ped = h('div', { class: 'ped' }, h('div', { class: 'gable' }), h('div', { class: 'logo', html: '<span>Raging</span> <b>Cocks</b> <span>of Olympus</span> <em>2</em>' }));
    E.altars = h('div', { class: 'altars' });
    E.altar = []; E.medUse = [];
    for (let k = 0; k < 5; k++) {
      const a = h('button', { class: 'altar g' + k, type: 'button', style: { '--gc': GOD_COL[k] }, 'aria-label': M.GODS[k].name + ': ' + M.GODS[k].feature,
        onclick: () => { Batty.sfx('click'); Batty.ui.toast(M.GODS[k].name + ', ' + M.GODS[k].title + ' · ' + M.GODS[k].feature + ': ' + M.GODS[k].blurb, 3600); } },
        h('span', { class: 'glow' }),
        h('span', { class: 'pot', html: potSvg(k) }),
        h('span', { class: 'med', html: useSym('god' + k) }),
        h('span', { class: 'lab' }, MOD_SHORT[k]));
      E.altar[k] = a; E.medUse[k] = a.querySelector('.med use'); E.altars.append(a);
    }
    E.reels = h('div', { class: 'reels' });
    for (let r = 0; r < REELS; r++) {
      const strip = h('div', { class: 'strip' }), cells = [];
      for (let i = 0; i < NC; i++) {
        const c = h('div', { class: 'cell', html: '<svg class="sym" viewBox="0 0 100 100" aria-hidden="true"><use href="#' + P + 's-ten"/></svg><b class="val"></b>' });
        cells.push({ el: c, use: c.querySelector('use'), val: c.querySelector('b'), href: '', t: '', cls: '', f: '' }); strip.append(c);
      }
      const reel = h('div', { class: 'reel' }, strip, h('i', { class: 'streak' }));
      E.reels.append(reel);
      reels.push({ el: reel, strip, cells, syms: [], off: 0, phase: 'idle', idx: Math.floor(Math.random() * M.STRIPS[r].length), v: 0, vmax: 26, vt: 26, r, blur: false, st: 0 });
    }
    E.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    E.lines.setAttribute('class', 'lines'); E.lines.setAttribute('aria-hidden', 'true');
    E.lbls = h('div', { class: 'lbls', 'aria-hidden': 'true' });
    E.board = h('div', { class: 'board' });
    E.banner = h('div', { class: 'banner' });
    E.plqTier = h('small', null, ''); E.plqOut = h('output', null, '0');
    E.plaque = h('div', { class: 'winplq', 'aria-hidden': 'true' }, E.plqTier, E.plqOut);
    E.frame = h('div', { class: 'frame', onclick: () => { if (tapFn) tapFn(); else hurry(); } }, h('div', { class: 'colm l' }), E.reels, E.lines, E.lbls, E.board, E.plaque, E.banner, h('div', { class: 'colm r' }));
    E.godcast = h('div', { class: 'godcast', 'aria-hidden': 'true' });

    /* hud: win meter in the base game, respins + total in the bonus */
    E.win = h('output', null, '0');
    E.msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' }, '');
    E.respins = h('div', { class: 'respins', 'aria-label': 'Respins left' }, h('i'), h('i'), h('i'));
    E.total = h('output', null, '0');
    E.hud = h('div', { class: 'hud' },
      h('div', { class: 'base' }, h('div', { class: 'meter' }, h('small', null, 'Win'), E.win), E.msg),
      h('div', { class: 'bon' }, h('div', { class: 'rs' }, h('small', null, 'Respins'), E.respins), h('div', { class: 'meter' }, h('small', null, 'Combo total'), E.total)));
    E.temple = h('div', { class: 'temple' }, E.ped, E.altars, E.frame, E.hud, E.godcast);

    /* legend (desktop) */
    E.legend = h('div', { class: 'legend' }, h('h4', null, 'The Five Gods'));
    E.leg = [];
    for (let k = 0; k < 5; k++) { const li = h('div', { class: 'row', style: { '--gc': GOD_COL[k] } }, h('i', { html: useSym('god' + k) }), h('div', null, h('b', null, M.GODS[k].name), h('span', null, M.GODS[k].feature), h('small', null, M.GODS[k].blurb))); E.leg[k] = li; E.legend.append(li); }

    /* controls */
    E.spin = h('button', { class: 'spin', type: 'button', id: 'olympus-spin', 'aria-label': 'Spin', onclick: primary, html: '<i class="ring"></i><svg viewBox="0 0 100 100" aria-hidden="true"><g class="arrs"><path class="arr" d="M50 20a30 30 0 1 0 28.500 20.500" fill="none" stroke-width="9" stroke-linecap="round"/><path class="arr2" d="M62 8l20 30-34 3z"/></g><rect class="sq" x="34" y="34" width="32" height="32" rx="5"/></svg><span></span>' });
    E.autoBtn = h('button', { class: 'btn auto', type: 'button', id: 'olympus-auto', 'aria-label': 'Autoplay', 'aria-haspopup': 'true', onclick: autoClick }, h('b', null, 'Auto'), h('small', null, 'off'));
    E.turboBtn = h('button', { class: 'btn turbo', type: 'button', id: 'olympus-turbo', 'aria-pressed': 'false', 'aria-label': 'Turbo', onclick: () => { turbo = !turbo; E.turboBtn.setAttribute('aria-pressed', turbo); E.turboBtn.lastChild.textContent = turbo ? 'on' : 'off'; Batty.sfx('click'); } }, h('b', null, 'Turbo'), h('small', null, 'off'));
    E.buyBtn = h('button', { class: 'btn buy', type: 'button', id: 'olympus-buy', 'aria-label': 'Buy the bonus', onclick: openBuy }, h('b', null, 'Buy Bonus'), h('small', null, 'from ' + (M.CFG.buy[0].price / U) + '×'));
    E.stakeBox = h('div', { class: 'stakebox' });
    stakeCtl = Batty.ui.stake(E.stakeBox, { id: ID, onChange: paintStake, label: 'Stake · 20 lines' });
    E.autoMenu = h('div', { class: 'automenu', hidden: true, role: 'menu' }, h('small', null, 'Autoplay spins'));
    for (const n of [10, 25, 50, 100]) E.autoMenu.append(h('button', { type: 'button', role: 'menuitem', 'data-n': n, onclick: () => { E.autoMenu.hidden = true; auto = n; paintCtl(); Batty.sfx('click'); if (!busy) spin(); } }, String(n)));
    E.ctl = h('div', { class: 'ctl' }, h('div', { class: 'left' }, E.stakeBox, E.buyBtn), E.spin, h('div', { class: 'right' }, E.autoBtn, E.turboBtn, E.autoMenu));
    E.ov = h('div', { class: 'ov', hidden: true, onclick: (e) => { if (tapFn && !e.target.closest('button')) tapFn(); } });
    fxCv = h('canvas', { class: 'fx', 'aria-hidden': 'true' }); fxCx = fxCv.getContext('2d');
    E.wrap = h('div', { class: 'wrap' }, E.jp, E.temple, E.legend, E.ctl);
    root.append(scene, E.wrap, fxCv, E.ov);

    /* opening screen: a quiet, winless arrangement */
    const open = [[SYM.ACE, SYM.LYRE, SYM.TEN], [SYM.WREATH, SYM.EGG, SYM.JACK], [SYM.QUEEN, SYM.WILD, SYM.AMPH], [SYM.HELM, SYM.KING, SYM.COIN], [SYM.JACK, SYM.AMPH, SYM.ACE]];
    for (let r = 0; r < REELS; r++) { const R = reels[r]; R.syms = [desc(SYM.TEN)].concat(open[r].map((x) => desc(x, x === SYM.COIN ? 40 : null)), [desc(SYM.KING)]); paintReel(R); }
    paintStake(); paintPots(); paintCtl(); setMsg(IDLE[0]);

    const ro = new ResizeObserver(layout); ro.observe(root); S.on(window, 'resize', layout);
    S._ro = ro; layout();
    S.on(document, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (document.querySelector('.bc-veil')) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      e.preventDefault(); if (e.repeat) return; primary();
    });
    S.on(document, 'click', (e) => { if (E && !E.autoMenu.hidden && !e.target.closest('.automenu') && !e.target.closest('.auto')) E.autoMenu.hidden = true; });
    S.interval(() => { if (!busy && mode === 'base' && !cycleTok) { idleI = (idleI + 1) % IDLE.length; setMsg(IDLE[idleI]); } }, 5200);
    /* distant weather */
    S.interval(() => { if (!busy && Math.random() < 0.5 && !rm) { skyFlash(1 + Math.floor(Math.random() * 2), true); S.timeout(() => A.noise({ d: 1.4, v: 0.05, lp: 300, f2: 60 }), 300 + Math.random() * 600); } }, 9000);
    /* the symbols and the gods on their altars never sit completely still */
    S.interval(idleTick, 1250);
    S.interval(() => { if (!E || busy || mode !== 'base') return; const k = Math.floor(Math.random() * 5); if (E.altar[k].classList.contains('strike')) return; E.medUse[k].setAttribute('href', '#' + P + 's-god' + k + '-i'); S.timeout(() => { if (E && !E.altar[k].classList.contains('strike')) E.medUse[k].setAttribute('href', '#' + P + 's-god' + k); }, 1600); }, 2300);
    ambStart();
    if (!rm) S.on(root, 'pointermove', (e) => { if (lay !== 'wide' || e.pointerType === 'touch') return; const b = root.getBoundingClientRect(); par.tx = ((e.clientX - b.left) / b.width - 0.5) * 2; par.ty = ((e.clientY - b.top) / b.height - 0.5) * 2; });
    if (DEV && !Batty.online) {
      devLog = { rounds: 0, staked: 0, won: 0, start: Batty.wallet.balance, bonuses: 0 };
      const find = (fn, test, tries) => { for (let i = 0; i < tries; i++) { const o = fn(); if (test(o)) return o; } return null; };
      const arm = (o) => { if (o) devNext = () => o; return !!o; };
      window.__olympusDev = {
        /* next spin is a trigger with exactly these gods, e.g. force([0]) or force([0,1,2,3,4], true) for a SUPER */
        force(gods, asSuper) { devNext = () => M.forceTrigger(Batty.rng, gods, !!asSuper); },
        forceOutcome(fn) { devNext = fn; },
        /* a Hendes bonus that pays jackpot j (0 Mini … 3 Grand gem) */
        forceJackpot(j, gods) { return arm(find(() => M.forceTrigger(Batty.rng, gods || [2, 0, 3], false), (x) => x.bonus && x.bonus.jackpots[j] > 0 && (j < 3 || !x.bonus.fullGrand), 80000)); },
        forceFull() { return arm(find(() => M.forceTrigger(Batty.rng, [0, 1, 2, 3, 4], false), (x) => x.bonus && x.bonus.full, 80000)); },
        forceLineWin(minX) { return arm(find(() => M.spin(Batty.rng), (x) => !x.bonus && x.lineWin >= (minX || 1) * U, 600000)); },
        forceAntic() { return arm(find(() => M.spin(Batty.rng), (x) => { let n = 0; for (let r = 0; r < 3; r++) if (x.grid[r].indexOf(SYM.GOD) >= 0) n++; return n >= 2; }, 600000)); },
        set speed(v) { devSpeed = v; }, get speed() { return devSpeed; },
        get log() { return devLog; }, get busy() { return busy; }, get auto() { return auto; }, get mode() { return mode; },
        pots, M,
      };
    }
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    S = null; root = null; E = null; reels = []; slots = []; fxList = []; fxStop = null; skipFns = []; tapFn = null; busy = false; auto = 0; cycleTok = 0; devSpeed = 1; amb = null; reelLoop = null;
    try { delete window.__olympusDev; } catch (e) { /* fine */ }
  }

  const IDLE = ['Three or more gods always wake the Cock Combo', 'Fill all 15 spots to win the Grand', 'Any pot can burst into a Super Cock Combo', 'Every god in play brings his own modifier', 'Space spins · tap the reels to slam them to a stop'];
  let idleI = 0;
  function setMsg(t, cls) { if (!E) return; if (E.msg.textContent !== t) E.msg.textContent = t; E.msg.className = 'msg' + (cls ? ' ' + cls : ''); }

  function potSvg(k) {
    const p = P;
    let s = '<svg viewBox="0 0 100 64" aria-hidden="true">';
    s += '<path d="M10 14C2 14 0 30 12 32M90 14C98 14 100 30 88 32" fill="none" stroke="url(#' + p + 'goldd)" stroke-width="5" stroke-linecap="round"/>';
    s += '<path d="M6 6H94L91 13C90 34 74 47 62 50L66 60H34L38 50C26 47 10 34 9 13Z" fill="url(#' + p + 'gold)" stroke="#3a1c00" stroke-width="1.8" stroke-linejoin="round"/>';
    s += '<path d="M10 16H90C89 21 88 25 86 28H14C12 25 11 21 10 16Z" fill="' + GOD_COL[k] + '" stroke="#3a1c00" stroke-width="1.2"/>';
    for (let i = 0; i < 3; i++) s += '<circle class="pip p' + (i + 1) + '" cx="' + (32 + i * 18) + '" cy="22" r="4.200" stroke="#3a1c00" stroke-width="1.2"/>';
    s += '<path d="M4 4H96V9H4Z" fill="url(#' + p + 'goldh)" stroke="#3a1c00" stroke-width="1.4" stroke-linejoin="round"/>';
    s += '<path d="M16 34C22 42 32 46 40 47" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".5"/>';
    return s + '</svg>';
  }
  function paintPots() { for (let k = 0; k < 5; k++) E.altar[k].setAttribute('data-stage', pots[k]); }
  function paintStake() {
    const st = stakeCtl.value;
    for (let j = 0; j < 4; j++) E.jpv[j].textContent = short(M.JACKPOTS[j].x * st);
    E.buyBtn.lastChild.textContent = 'from ' + short(M.CFG.buy[0].price * st / U);
  }
  function paintCtl() {
    if (!E) return;
    const bonus = mode !== 'base';
    stakeCtl.disabled = busy || auto > 0;
    E.buyBtn.disabled = busy || auto > 0;
    E.spin.classList.toggle('busy', busy);
    E.spin.classList.toggle('inbonus', bonus);
    E.spin.classList.toggle('autoon', auto > 0);
    E.spin.setAttribute('aria-label', busy ? (bonus ? 'Hurry up' : 'Stop') : 'Spin');
    E.spin.lastChild.textContent = auto > 0 ? String(auto) : '';
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? 'stop' : 'off';
    E.autoBtn.setAttribute('aria-label', auto > 0 ? 'Stop autoplay' : 'Autoplay');
  }

  /* ---------- layout: size the cells to whatever space the shell gives us ---------- */
  function layout() {
    if (!root) return;
    const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return;
    const land = W > H * 1.25 && H < 560, wide = !land && W >= 900;
    lay = land ? 'land' : wide ? 'wide' : 'narrow';
    root.classList.toggle('wide', wide); root.classList.toggle('land', land); root.classList.toggle('narrow', !wide && !land);
    let cw, ch, colw, alt, ped;
    if (wide) {
      const side = clamp(190, W * 0.185, 270);
      colw = 34; ped = clamp(46, H * 0.085, 66); alt = clamp(78, H * 0.145, 116);
      const availH = H - ped - alt - 58 - 104 - 36, availW = W - side * 2 - colw * 2 - 84;
      ch = Math.max(70, availH / 3); cw = Math.min(availW / 5, ch * 1.2); ch = Math.min(ch, cw * 1.02);
      root.style.setProperty('--side', side + 'px');
    } else if (land) {
      const side = clamp(140, W * 0.215, 260);
      colw = 8; ped = 0; alt = clamp(44, H * 0.165, 72);
      const availH = H - alt - 40 - 8 - 18, availW = W - side * 2 - colw * 2 - 40;
      ch = Math.max(44, availH / 3); cw = Math.min(availW / 5, ch * 1.25); ch = Math.min(ch, cw * 1.05);
      root.style.setProperty('--side', side + 'px');
    } else {
      colw = W < 380 ? 5 : 7;
      cw = Math.floor((Math.min(W, 560) - 12 - colw * 2 - 8) / 5);
      ped = clamp(34, cw * 0.62, 56);
      alt = clamp(60, cw * 1.16, 104);
      let availH = H - 46 - ped - alt - 54 - 138 - 36;
      if (availH / 3 < cw * 0.9) { const short2 = cw * 0.9 * 3 - availH; const cut = Math.min(short2, alt - 56 + ped - 30); alt -= cut * 0.6; ped -= cut * 0.4; availH += cut; }
      ch = Math.max(cw * 0.72, Math.min(cw * 1.28, availH / 3));
    }
    geo = { cw, ch };
    root.style.setProperty('--cw', cw.toFixed(1) + 'px'); root.style.setProperty('--ch', ch.toFixed(1) + 'px');
    root.style.setProperty('--colw', colw + 'px'); root.style.setProperty('--alt', alt.toFixed(0) + 'px'); root.style.setProperty('--ped', ped.toFixed(0) + 'px');
    E.lines.setAttribute('viewBox', '0 0 ' + (cw * 5).toFixed(1) + ' ' + (ch * 3).toFixed(1));
    fxDpr = Math.min(2, window.devicePixelRatio || 1);
    fxCv.width = Math.round(W * fxDpr); fxCv.height = Math.round(H * fxDpr);
    if (amb) { amb.W = W; amb.H = H; E.amb.width = Math.round(W * amb.dpr); E.amb.height = Math.round(H * amb.dpr); }
    for (const R of reels) placeStrip(R);
  }

  /* ---------- reels ---------- */
  function desc(sym, extra) {
    if (sym === SYM.GOD) return { key: 'god' + (extra != null ? extra : Math.floor(Math.random() * 5)), god: true };
    if (sym === SYM.COIN) return { key: 'coin', val: short((extra != null ? extra : M.CFG.coinValues[Math.floor(Math.random() * 4)]) * unitOf()) };
    return { key: M.SYMBOLS[sym] };
  }
  function paintCell(c, d) {
    const href = '#' + P + 's-' + d.key + (d.v ? '-' + d.v : '');
    if (c.href !== href) { c.use.setAttribute('href', href); c.href = href; }
    const t = d.val || ''; if (c.t !== t) { c.val.textContent = t; c.t = t; }
    const f = famOf(d.key); if (c.f !== f) { c.el.setAttribute('data-f', f); c.f = f; }
  }
  function paintReel(R) { for (let i = 0; i < NC; i++) paintCell(R.cells[i], R.syms[i]); }
  function setVar(R, i, v) { const d = R.syms[i]; if (!d) return; d.v = v || null; paintCell(R.cells[i], d); }
  function placeStrip(R) { R.strip.style.transform = 'translate3d(0,' + ((R.off - 1) * 100 / NC).toFixed(3) + '%,0)'; }
  function setBlur(R, on) { if (R.blur === on) return; R.blur = on; R.el.classList.toggle('blur', on); }
  function shiftReel(R) {
    let d;
    if (R.queue && R.queue.length) d = R.queue.shift();
    else { const st = M.STRIPS[R.r]; R.idx = (R.idx - 1 + st.length) % st.length; d = desc(st[R.idx]); }
    R.syms.pop(); R.syms.unshift(d); paintReel(R);
  }
  const KICK = 0.15;
  function reelTick(dt) {
    let moving = false;
    for (const R of reels) {
      if (R.phase === 'idle') continue;
      moving = true;
      if (R.phase === 'kick') {
        /* the back-kick: the strip lifts against the spin before it lets go */
        R.st += dt; const k = clamp(0, R.st / KICK, 1);
        R.off = -R.kick * Math.sin(Math.PI * k);
        if (k >= 1) { R.phase = 'spin'; R.off = 0; R.v = R.vmax * 0.25; }
      } else if (R.phase === 'spin') {
        if (R.v < R.vt) R.v = Math.min(R.vt, R.v + R.vmax * dt * 5); else R.v = Math.max(R.vt, R.v - R.vmax * dt * 2.4);
        R.off += R.v * dt;
        while (R.off >= 1) { R.off -= 1; shiftReel(R); }
        setBlur(R, R.v > R.vmax * 0.5);
      } else if (R.phase === 'stop') {
        R.st += dt;
        const k = Math.min(1, R.st / R.dur), e = 1 - (1 - k) * (1 - k);
        const pos = R.s0 + R.D * e;
        while (R.done < Math.floor(pos + 1e-6) && R.done < R.shifts) { R.done++; shiftReel(R); }
        R.off = pos - R.done;
        setBlur(R, k < 0.45);
        if (k >= 1) {
          while (R.done < R.shifts) { R.done++; shiftReel(R); }
          /* it has overshot by R.ov: the strip now springs back into place */
          R.off = Math.max(0, R.s0 + R.D - R.shifts); R.ov = R.off; R.phase = 'settle'; R.st = 0; setBlur(R, false);
          const f = R.onLand; R.onLand = null; if (f) f();
        }
      } else if (R.phase === 'settle') {
        R.st += dt;
        R.off = R.ov * Math.exp(-R.st * 12) * Math.cos(R.st * 24);
        if (R.st >= 0.38 || R.ov <= 0) { R.off = 0; R.phase = 'idle'; R.el.classList.remove('spinning', 'antic'); }
      }
      placeStrip(R);
    }
    if (!moving && reelLoop) { reelLoop(); reelLoop = null; }
    if (hum && !reels.some((R) => R.phase === 'spin' || R.phase === 'kick' || R.phase === 'stop')) { S.clear(hum); hum = 0; }
  }
  function startReels() {
    const vm = (turbo ? 34 : 26) / Math.max(0.25, Math.min(1, devSpeed * 4));
    reels.forEach((R, r) => {
      R.phase = 'kick'; R.st = -r * 0.04; R.kick = rm ? 0 : 0.24; R.vmax = vm; R.vt = vm; R.v = 0; R.queue = null; R.onLand = null;
      R.el.classList.add('spinning'); R.el.classList.remove('antic');
    });
    snd.kick();
    if (!reelLoop) reelLoop = S.loop(reelTick);
    if (!hum) hum = S.interval(() => { if (E) snd.whirr(); }, 90);
  }
  function stopReel(R, finals) {
    return new Promise((res) => {
      if (R.phase === 'idle' || R.phase === 'settle') { R.syms = [R.syms[0], finals[0], finals[1], finals[2], R.syms[NC - 1]]; paintReel(R); return res(); }
      if (R.phase === 'kick') { R.phase = 'spin'; R.off = Math.max(0, R.off); }
      const rnd = M.STRIPS[R.r][Math.floor(Math.random() * M.STRIPS[R.r].length)];
      R.queue = [finals[2], finals[1], finals[0], desc(rnd === SYM.GOD || rnd === SYM.COIN ? SYM.KING : rnd)];
      const ov = rm ? 0 : turbo ? 0.11 : 0.18;
      R.v = Math.max(R.v, R.vmax * 0.4);
      R.shifts = 4; R.done = 0; R.s0 = R.off; R.D = 4 - R.off + ov; R.st = 0; R.dur = Math.max(0.12, 2 * R.D / R.v); R.phase = 'stop'; R.onLand = res;
    });
  }
  async function abortReels() {
    await Promise.all(reels.map((R) => stopReel(R, [R.syms[1], R.syms[2], R.syms[3]])));
    await S.sleep(300);
  }

  async function spinReels(o, t0) {
    const finals = [];
    for (let r = 0; r < REELS; r++) finals.push([0, 1, 2].map((row) => {
      const s = o.grid[r][row];
      if (s === SYM.GOD) return desc(s, o.gods.find((g) => g.reel === r && g.row === row).god);
      if (s === SYM.COIN) return desc(s, o.coins.find((c) => c.reel === r && c.row === row).value);
      return desc(s);
    }));
    let skipped = slamReq, godsSeen = 0;
    const stops = [];
    for (let r = 0; r < REELS; r++) {
      const R = reels[r], col = o.grid[r];
      const antic = godsSeen >= 2 && !skipped;
      if (antic) anticOn(r);
      if (!skipped) {
        let cut = false; const mark = () => { cut = true; }; skipFns.push(mark);
        await napSkip(r === 0 ? Math.max(140, 560 - (performance.now() - t0)) : antic ? 1400 : 210);
        const i = skipFns.indexOf(mark); if (i >= 0) skipFns.splice(i, 1);
        if (cut || slamReq) skipped = true;
      }
      if (!E) return;
      const hasGod = col.indexOf(SYM.GOD) >= 0, hasCoin = col.indexOf(SYM.COIN) >= 0;
      if (hasGod) godsSeen++;
      const idx = godsSeen;
      const pr = stopReel(R, finals[r]).then(() => landFx(r, col, finals[r], hasGod, hasCoin, idx, antic));
      stops.push(pr);
      if (skipped) continue;
      if (antic) await pr;
    }
    await Promise.all(stops);
    anticOff();
    await nap(skipped ? 260 : 140);
  }
  const cellEl = (reel, row) => reels[reel].cells[row + 1].el;

  /* anticipation: one god away from the bonus */
  function anticOn(r) {
    const R = reels[r];
    R.el.classList.add('antic'); R.vt = R.vmax * 0.42; root.classList.add('tension');
    snd.antic(r - 2, T(1400) / 1000);
    if (E.anticT) S.clear(E.anticT);
    if (!rm) E.anticT = S.interval(() => {
      if (!E || R.phase === 'idle' || R.phase === 'settle') return;
      const p = pos(R.el), x0 = p.x - p.w / 2, y0 = p.y - p.h / 2, side = Math.random() < 0.5 ? 0 : 1;
      const x = x0 + side * p.w + (Math.random() - 0.5) * 6;
      bolt({ x: x, y: y0 + Math.random() * p.h * 0.4 }, { x: x + (Math.random() - 0.5) * 18, y: y0 + p.h * (0.55 + Math.random() * 0.45) }, '#d8c8ff', 1.4, 0.2);
      if (Math.random() < 0.5) snd.crackle();
    }, 130);
  }
  function anticOff() { if (!E) return; if (E.anticT) { S.clear(E.anticT); E.anticT = 0; } root.classList.remove('tension'); for (const R of reels) R.el.classList.remove('antic'); }

  /* a reel hits its stops: thud, dust and, for gods, a proper entrance */
  function landFx(r, col, fin, hasGod, hasCoin, idx, antic) {
    if (!E) return;
    const R = reels[r];
    snd.thud(r);
    if (antic) { R.el.classList.remove('antic'); if (E.anticT) { S.clear(E.anticT); E.anticT = 0; } if (!hasGod) snd.fizzle(); }
    if (!rm) {
      const p = pos(R.el), y = p.y + p.h / 2 - 3;
      for (let i = 0; i < 4; i++) fxAdd({ type: 'p', shape: 'puff', x: p.x - p.w / 2 + (0.15 + Math.random() * 0.7) * p.w, y: y, vx: (Math.random() - 0.5) * 50, vy: -14 - Math.random() * 26, g: 0, r: 5 + Math.random() * 4, grow: 18, col: '#cbb8ff', life: 0.5 });
      for (let i = 0; i < 5; i++) fxAdd({ type: 'p', shape: 'dot', x: p.x - p.w / 2 + Math.random() * p.w, y: y, vx: (Math.random() - 0.5) * 140, vy: -90 - Math.random() * 120, g: 520, r: 1 + Math.random() * 1.4, col: Math.random() < 0.6 ? '#ffd75e' : '#fff', life: 0.45 });
    }
    if (hasGod) {
      const row = col.indexOf(SYM.GOD), c = R.cells[row + 1], k = +fin[row].key[3], p = pos(c.el);
      setVar(R, row + 1, 'w'); c.el.classList.add('pop');
      snd.pluck([392, 494, 587, 698, 784][Math.min(4, idx - 1)]); snd.cluck();
      ring(p, GOD_COL[k], p.w * 0.75, 0.5);
      sparks(p.x, p.y, 16, ['#fff', GOD_COL[k]], 260);
      if (idx >= 2 && !rm) { skyFlash(1, true); }
      S.timeout(() => { if (E && R.syms[row + 1] === fin[row] && mode === 'base' && !c.el.classList.contains('win')) { setVar(R, row + 1, null); c.el.classList.remove('pop'); } }, 1900);
    } else if (hasCoin) {
      Batty.sfx('chip');
      const row = col.indexOf(SYM.COIN); setVar(R, row + 1, 'i');
    }
  }

  /* idle life: a random symbol on show glints, blinks or flaps */
  function idleTick() {
    if (!E || busy || mode !== 'base' || E.reels.classList.contains('haswin') || rm) return;
    const r = Math.floor(Math.random() * REELS), i = 1 + Math.floor(Math.random() * ROWS), R = reels[r], d = R.syms[i];
    if (!d || d.v || R.phase !== 'idle') return;
    const v = HAS_I[d.key] ? 'i' : 'w';
    setVar(R, i, v);
    S.timeout(() => { if (E && R.syms[i] === d && d.v === v && !busy) setVar(R, i, null); }, 1800);
  }

  /* ---------- fx canvas: lightning, flying orbs, rings, particles ---------- */
  function pos(el) { const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, w: a.width, h: a.height }; }
  function fxAdd(o) { o.t = 0; fxList.push(o); if (!fxStop && S) fxStop = S.loop(fxTick); }
  function jag(x0, y0, x1, y1, rough) {
    let pts = [[x0, y0], [x1, y1]];
    let off = Math.hypot(x1 - x0, y1 - y0) * (rough || 0.18);
    for (let it = 0; it < 5; it++) { const n = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, d = (Math.random() - 0.5) * off; n.push(a, [mx - dy / l * d, my + dx / l * d]); } n.push(pts[pts.length - 1]); pts = n; off *= 0.55; }
    return pts;
  }
  function bolt(a, b, color, width, life, branches) {
    const main = jag(a.x, a.y, b.x, b.y), all = [main];
    if (branches) for (let i = 0; i < 3; i++) { const s = main[Math.floor(main.length * (0.2 + Math.random() * 0.5))], l = Math.hypot(b.x - a.x, b.y - a.y) * (0.15 + Math.random() * 0.2), ang = Math.atan2(b.y - a.y, b.x - a.x) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6); all.push(jag(s[0], s[1], s[0] + Math.cos(ang) * l, s[1] + Math.sin(ang) * l, 0.25)); }
    fxAdd({ type: 'bolt', lines: all, color: color || '#bfe6ff', width: width || 3, life: life || 0.38 });
  }
  function orb(a, b, color, life, cb) { fxAdd({ type: 'orb', a, b, color, life: (life || 0.45) * Math.max(0.3, T(1)), cb, bend: (Math.random() - 0.5) * 0.5 }); }
  function ring(a, color, maxR, life) { fxAdd({ type: 'ring', a, color, maxR, life: life || 0.6 }); }
  function sparks(x, y, n, cols, sp, o) {
    if (rm) return;
    o = o || {};
    for (let i = 0; i < n; i++) { const ang = o.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * 6.283, s = (sp || 220) * (0.35 + Math.random() * 0.9); fxAdd({ type: 'p', shape: o.shape || 'dot', x: x, y: y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, g: o.g == null ? 420 : o.g, r: (o.r || 1.8) * (0.6 + Math.random() * 0.9), col: cols[(Math.random() * cols.length) | 0], life: (o.life || 0.6) * (0.7 + Math.random() * 0.6), grow: o.grow || 0 }); }
  }
  function flames(p, col, n) { if (rm) return; for (let i = 0; i < n; i++) fxAdd({ type: 'p', shape: 'flame', x: p.x + (Math.random() - 0.5) * p.w * 0.7, y: p.y + p.h * 0.3, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 120, g: -40, r: 6 + Math.random() * 8, col: col, life: 0.5 + Math.random() * 0.5, delay: Math.random() * 0.4 }); }
  function fxTick(dt) {
    if (!fxCx || !root) return;
    const c = fxCx; c.setTransform(fxDpr, 0, 0, fxDpr, 0, 0); c.clearRect(0, 0, fxCv.width, fxCv.height);
    for (const o of fxList) {
      o.t += dt;
      if (o.delay && o.t < o.delay) continue;
      const k = Math.min(1, (o.t - (o.delay || 0)) / o.life);
      if (o.type === 'bolt') {
        const a = 1 - k; c.lineJoin = 'round'; c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
        for (let li = 0; li < o.lines.length; li++) {
          const pts = o.lines[li], wm = li ? 0.45 : 1;
          for (const pass of [[o.width * 4.5 * wm, 0.22], [o.width * 2 * wm, 0.5], [o.width * 0.8 * wm, 1]]) {
            c.globalAlpha = a * pass[1] * (k < 0.12 && Math.random() < 0.4 ? 0.3 : 1); c.strokeStyle = pass[1] === 1 ? '#ffffff' : o.color; c.lineWidth = pass[0];
            c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
          }
        }
        c.globalCompositeOperation = 'source-over';
      } else if (o.type === 'orb') {
        const e = k * k * (3 - 2 * k), dx = o.b.x - o.a.x, dy = o.b.y - o.a.y;
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const kk = Math.max(0, e - i * 0.03), bend = Math.sin(kk * Math.PI) * o.bend, x = o.a.x + dx * kk - dy * bend, y = o.a.y + dy * kk + dx * bend;
          c.globalAlpha = (1 - i / 7) * 0.9; c.fillStyle = i ? o.color : '#fff';
          c.beginPath(); c.arc(x, y, Math.max(1.5, 8 - i), 0, 6.3); c.fill();
        }
        c.globalCompositeOperation = 'source-over';
      } else if (o.type === 'ring') {
        c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = o.color; c.lineWidth = 7 * (1 - k) + 1;
        c.beginPath(); c.arc(o.a.x, o.a.y, Math.max(1, o.maxR * (1 - (1 - k) * (1 - k))), 0, 6.3); c.stroke();
      } else if (o.type === 'p') {
        o.vy += o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.shape === 'puff') { c.globalAlpha = (1 - k) * 0.32; c.fillStyle = o.col; c.beginPath(); c.arc(o.x, o.y, o.r + o.grow * k, 0, 6.3); c.fill(); }
        else {
          c.globalCompositeOperation = 'lighter'; c.fillStyle = o.col;
          const r = o.shape === 'flame' ? o.r * (1 - k * 0.7) : o.r * (1 - k * 0.4);
          c.globalAlpha = (1 - k) * (o.shape === 'flame' ? 0.55 : 1);
          c.beginPath(); c.arc(o.x, o.y, r, 0, 6.3); c.fill();
          c.globalCompositeOperation = 'source-over';
        }
      }
      if (k >= 1 && o.cb) { const f = o.cb; o.cb = null; f(); }
    }
    c.globalAlpha = 1;
    fxList = fxList.filter((o) => o.t < o.life + (o.delay || 0));
    if (!fxList.length && fxStop) { c.clearRect(0, 0, fxCv.width, fxCv.height); fxStop(); fxStop = null; }
  }

  /* ---------- the living sky: drifting motes, parallax ---------- */
  function ambStart() {
    amb = { cx: E.amb.getContext('2d'), parts: [], W: root.clientWidth, H: root.clientHeight, dpr: 1, t: 0 };
    E.amb.width = amb.W; E.amb.height = amb.H;
    S.loop(ambTick);
  }
  function ambTick(dt) {
    if (!amb || !E || document.hidden) return;
    amb.t += dt;
    /* parallax eases towards the pointer */
    if (!rm && (Math.abs(par.tx - par.x) > 0.002 || Math.abs(par.ty - par.y) > 0.002)) {
      par.x += (par.tx - par.x) * Math.min(1, dt * 3); par.y += (par.ty - par.y) * Math.min(1, dt * 3);
      for (const el of E.par) { const d = +el.getAttribute('data-d'); el.style.transform = 'translate3d(' + (-par.x * d).toFixed(1) + 'px,' + (-par.y * d * 0.5).toFixed(1) + 'px,0)'; }
    }
    if (rm) return;
    const c = amb.cx, W = amb.W, H = amb.H, bon = mode !== 'base';
    const want = Math.round((lay === 'narrow' ? 16 : 30) * (bon ? 1.8 : 1));
    while (amb.parts.length < want) amb.parts.push({ x: Math.random() * W, y: amb.parts.length < want / 2 ? Math.random() * H : H + 10, vy: -(10 + Math.random() * 26), sw: 6 + Math.random() * 16, f: 0.5 + Math.random(), ph: Math.random() * 6, r: 0.7 + Math.random() * 1.8, a: 0.35 + Math.random() * 0.5, hot: bon && Math.random() < 0.6 });
    if (amb.parts.length > want) amb.parts.length = want;
    c.clearRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    for (const p of amb.parts) {
      p.y += p.vy * dt * (bon ? 1.8 : 1); p.x += Math.sin(amb.t * p.f + p.ph) * p.sw * dt;
      if (p.y < -12) { p.y = H + 10; p.x = Math.random() * W; p.hot = bon && Math.random() < 0.6; }
      const tw = 0.6 + 0.4 * Math.sin(amb.t * 3 * p.f + p.ph);
      c.globalAlpha = p.a * tw * 0.35; c.fillStyle = p.hot ? '#ff6a3a' : '#ffd98a';
      c.beginPath(); c.arc(p.x, p.y, p.r * 3.2, 0, 6.3); c.fill();
      c.globalAlpha = p.a * tw; c.fillStyle = p.hot ? '#ffd0a0' : '#fff6d8';
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.3); c.fill();
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
  function skyFlash(n, quiet) {
    if (!E) return;
    const sc = E.scene; sc.classList.remove('f1', 'f2', 'f3'); void sc.offsetWidth; sc.classList.add('f' + (n || 1));
    if (!quiet) shake();
  }
  function shake(big) { if (!E || rm) return; const c = big ? 'shake2' : 'shake'; root.classList.remove('shake', 'shake2'); void root.offsetWidth; root.classList.add(c); S.timeout(() => root && root.classList.remove(c), 600); }
  function cheer(ratio) {
    if (!E) return;
    const sc = E.scene; sc.classList.remove('cheer', 'cheer2'); void sc.offsetWidth; sc.classList.add(ratio >= 5 ? 'cheer2' : 'cheer');
    S.timeout(() => E && sc.classList.remove('cheer', 'cheer2'), 2400);
  }
  function banner(text, cls, ms) {
    const b = E.banner; b.className = 'banner'; void b.offsetWidth; b.className = 'banner show ' + (cls || ''); b.innerHTML = text;
    if (ms) S.timeout(() => { if (E && b.innerHTML === text) b.className = 'banner'; }, T(ms));
  }
  function hideBanner() { if (E) E.banner.className = 'banner'; }
  /* a god swoops across his altar row to announce his power */
  function godcast(k, name, sub, ms) {
    const g = E.godcast;
    g.className = 'godcast'; g.style.setProperty('--gc', GOD_COL[k]);
    g.innerHTML = '<i>' + useSym('god' + k + '-w', 'gsym') + '</i><div><b>' + name + '</b><span>' + sub + '</span></div>';
    void g.offsetWidth; g.className = 'godcast show g' + k;
    const tok = g.innerHTML;
    S.timeout(() => { if (E && g.innerHTML === tok) g.classList.add('out'); }, T(ms || 1500));
  }
  /* tick-tick-tick count-up; a tap finishes it */
  function countTick(el, from, to, ms, fmt) {
    const f = fmt || Batty.fmt;
    if (ms < 120 || to === from) { el.textContent = f(to); return Promise.resolve(); }
    return new Promise((res) => {
      const t0 = performance.now(); let last = 0, done = false, stop = null;
      const fin = () => { if (done) return; done = true; el.textContent = f(to); if (stop) stop(); const i = skipFns.indexOf(fin); if (i >= 0) skipFns.splice(i, 1); res(); };
      skipFns.push(fin);
      stop = S.loop(() => {
        const now = performance.now(), k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 2.2);
        el.textContent = f(from + (to - from) * e);
        if (now - last > 70) { last = now; snd.tick(e); }
        if (k >= 1) fin();
      });
    });
  }

  /* ---------- line wins ---------- */
  function drawLines(list, anim) {
    const cw = geo.cw, ch = geo.ch;
    let s = '';
    for (const w of list) {
      const pl = M.PAYLINES[w.line], pts = ['0,' + ((pl[0] + 0.5) * ch).toFixed(1)];
      for (let r = 0; r < REELS; r++) pts.push(((r + 0.5) * cw).toFixed(1) + ',' + ((pl[r] + 0.5) * ch).toFixed(1));
      pts.push((5 * cw).toFixed(1) + ',' + ((pl[4] + 0.5) * ch).toFixed(1));
      const P2 = pts.join(' '), a = anim ? ' draw' : '';
      s += '<polyline class="sh' + a + '" pathLength="100" points="' + P2 + '"/><polyline class="ln' + a + '" pathLength="100" points="' + P2 + '" stroke="' + LINE_COL(w.line) + '"/><polyline class="hi' + a + '" pathLength="100" points="' + P2 + '"/>';
    }
    E.lines.innerHTML = s;
  }
  function lineLabel(w, unit) {
    if (!w) { E.lbls.innerHTML = ''; return; }
    const pl = M.PAYLINES[w.line], r = w.count - 1;
    E.lbls.innerHTML = '<span style="left:' + ((r + 0.5) * 20).toFixed(1) + '%;top:' + ((pl[r] + 0.5) * 100 / 3).toFixed(1) + '%;--lc:' + LINE_COL(w.line) + '">' + short(w.pay * unit) + '</span>';
  }
  function markWins(list) {
    for (const R of reels) for (let i = 1; i <= ROWS; i++) { const c = R.cells[i]; if (c.el.classList.contains('win')) { c.el.classList.remove('win'); setVar(R, i, null); } }
    for (const w of list) { const pl = M.PAYLINES[w.line]; for (let r = 0; r < w.count; r++) { const R = reels[r], i = pl[r] + 1; R.cells[i].el.classList.add('win'); setVar(R, i, 'w'); } }
    E.reels.classList.toggle('haswin', list.length > 0);
  }
  function clearWins() {
    cycleTok = 0; if (!E) return; E.lines.innerHTML = ''; E.lbls.innerHTML = ''; markWins([]); hidePlaque();
    for (const R of reels) { for (let i = 0; i < NC; i++) { R.cells[i].el.classList.remove('pop'); if (R.syms[i] && R.syms[i].v) setVar(R, i, null); } }
  }
  function showPlaque(tier, big) { E.plqTier.textContent = tier || ''; E.plaque.className = 'winplq show' + (big ? ' big' : '') + (tier ? ' tier' : ''); }
  function hidePlaque() { if (E && E.plaque.classList.contains('show')) E.plaque.className = 'winplq'; }
  function countWin(from, to, ms) { return Batty.ui.countUp(E.win, from, to, Math.max(60, T(ms))); }
  async function showLineWins(o, unit) {
    const total = o.lineWin * unit, ratio = total / stakeCtl.value;
    const tier = ratio >= 10 ? 'Big win' : ratio >= 5 ? 'Great win' : ratio >= 2 ? 'Nice win' : '';
    drawLines(o.lines, true); markWins(o.lines);
    snd.win(ratio); cheer(ratio);
    setMsg(o.lines.length + (o.lines.length > 1 ? ' lines pay ' : ' line pays ') + Batty.fmt(total) + ' BB', 'hot');
    E.hud.classList.add('won');
    const ms = Math.min(2600, 420 + ratio * 170);
    showPlaque(tier, ratio >= 5);
    countWin(0, total, ms);
    const cnt = countTick(E.plqOut, 0, total, T(ms));
    if (ratio >= 2) { const p = pos(E.plaque); sparks(p.x, p.y, ratio >= 5 ? 34 : 18, ['#ffd75e', '#fff3bd', '#fff'], 360, { r: 2.4, life: 0.9 }); Batty.fx.burst({ el: E.plaque, count: ratio >= 5 ? 22 : 10, kind: 'coin', power: 0.6 }); }
    if (ratio >= 5) { skyFlash(2, true); Batty.fx.rain('coin', 900); }
    await napSkip(ms + (auto || turbo ? 250 : 650));
    E.win.textContent = Batty.fmt(total);
    await cnt;
    S.timeout(hidePlaque, T(auto || turbo ? 200 : 700));
  }
  function cycleLines(o, unit) {
    if (o.lines.length < 1) return;
    const tok = ++cycleTok === 0 ? ++cycleTok : cycleTok; let i = -1;
    const step = () => {
      if (!E || cycleTok !== tok || busy) return;
      i = (i + 1) % (o.lines.length + (o.lines.length > 1 ? 1 : 0));
      if (i === o.lines.length) { drawLines(o.lines, false); markWins(o.lines); lineLabel(null); setMsg(o.lines.length + ' lines pay ' + Batty.fmt(o.lineWin * unit) + ' BB', 'hot'); }
      else { const w = o.lines[i]; drawLines([w], true); markWins([w]); lineLabel(w, unit); setMsg('Line ' + (w.line + 1) + ' · ' + w.count + ' × ' + M.SYMBOL_NAMES[w.symbol] + ' · ' + Batty.fmt(w.pay * unit) + ' BB', 'hot'); }
      S.timeout(step, 1500);
    };
    S.timeout(step, 900);
  }

  /* ---------- pots ---------- */
  function feedPots(o) {
    for (const g of o.gods) {
      const from = pos(cellEl(g.reel, g.row)), a = E.altar[g.god], to = pos(a);
      orb(from, to, GOD_COL[g.god], 0.5, () => {
        if (!E) return;
        if (g.grow && pots[g.god] < 3) pots[g.god]++;
        paintPots(); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump');
        sparks(to.x, to.y, 10, ['#fff', GOD_COL[g.god]], 160);
        A.tone({ f: 660 + pots[g.god] * 140, d: 0.18, type: 'triangle', v: 0.12 }); A.tone({ f: 1320 + pots[g.god] * 280, d: 0.12, type: 'sine', v: 0.05, t: 0.05 });
      });
    }
  }

  /* ---------- a round ---------- */
  function primary() {
    if (!E) return;
    if (tapFn) return tapFn();
    if (!E.ov.hidden && E.ov.classList.contains('buying')) return;
    if (busy) return hurry();
    spin();
  }
  function autoClick() {
    Batty.sfx('click');
    if (auto > 0) { auto = 0; paintCtl(); return; }
    E.autoMenu.hidden = !E.autoMenu.hidden;
  }
  async function spin(buyTier) {
    if (busy || !E) return;
    const stake = stakeCtl.value, unit = stake / U;
    const tier = buyTier != null ? M.CFG.buy[buyTier] : null;
    const cost = tier ? tier.price * unit : stake;
    if (!Batty.wallet.bet(ID, cost)) { auto = 0; paintCtl(); return Batty.ui.broke(); }
    busy = true; rush = false; slamReq = false; E.autoMenu.hidden = true; if (auto > 0 && !tier) auto--; paintCtl();
    clearWins(); hideBanner(); E.hud.classList.remove('won'); E.win.textContent = '0';
    setMsg(tier ? tier.name + ' bought · good luck' : 'Good luck', '');
    if (tier) { snd.gong(); skyFlash(2, true); }
    /* the reels let go at once; the outcome catches up with them */
    const t0 = performance.now();
    snd.strum(); startReels();
    let o;
    if (Batty.online) {
      /* online: the server decides the spin and has already settled it by the time it answers */
      const r = await Batty.play(ID, 'spin', { stake, buy: tier ? buyTier : null }, cost);
      if (!E) return;
      if (!r) { await abortReels(); if (!E) return; busy = false; auto = 0; paintCtl(); setMsg(IDLE[idleI], ''); return; }
      o = r.o;
    } else if (tier) o = M.buy(Batty.rng, buyTier);
    else if (DEV && devNext) { o = devNext(); devNext = null; }
    else o = M.spin(Batty.rng);
    const win = o.totalWin * unit;
    if (win > 0) Batty.wallet.win(ID, win, { silent: true });
    if (devLog) { devLog.rounds++; devLog.staked += cost; devLog.won += win; if (o.bonus) devLog.bonuses++; devLog.last = o; }

    await spinReels(o, t0);
    if (!E) return;
    if (o.gods.length && !o.bonus) feedPots(o);
    if (o.lineWin > 0) await showLineWins(o, unit);
    if (o.bonus) {
      await playBonus(o, unit);
      if (!E) return;
      const lw = Math.min(o.lineWin, o.totalWin) * unit;
      E.hud.classList.add('won'); countWin(lw, win, 500);
      setMsg(win > 0 ? 'The gods paid ' + Batty.fmt(win) + ' BB' : 'The gods have gone back to sleep', 'hot');
    } else if (!o.lineWin) setMsg(o.gods.length ? M.GODS[o.gods[0].god].name + ' feeds his pot' : IDLE[idleI], '');
    Batty.wallet.sync();
    if (win >= stake * 10) { skyFlash(3, true); await Batty.ui.celebrate({ amount: win, bet: stake }); }
    if (!E) return;
    busy = false; rush = false; paintCtl();
    if (!o.bonus) cycleLines(o, unit);
    if (auto > 0) {
      if (!Batty.wallet.canBet(stake)) { auto = 0; paintCtl(); Batty.ui.toast('Autoplay stopped: not enough Batty Bucks for the next spin.'); }
      else S.timeout(() => { if (auto > 0 && !busy) spin(); }, T(o.totalWin ? 500 : 180));
    }
  }

  /* ---------- buy menu ---------- */
  function openBuy() {
    if (busy) return;
    Batty.sfx('pop');
    const st = stakeCtl.value, unit = st / U;
    const box = h('div', { class: 'buybox' }, h('i', { class: 'rays' }), h('h3', null, 'Summon the Gods'), h('p', null, 'Skip the foreplay and buy straight into the Cock Combo. Prices are at your current stake of ' + Batty.fmt(st) + ' BB.'));
    const row = h('div', { class: 'tiers' });
    M.CFG.buy.forEach((tier, i) => {
      const price = tier.price * unit;
      const fc = h('div', { class: 'faces t' + i });
      [0, 1, 2, 3, 4].forEach((k, n) => fc.append(h('i', { class: i === 0 ? 'q' : i === 1 && n > 2 ? 'off' : '', html: useSym('god' + k + (i === 2 ? '-i' : '')) })));
      const b = h('button', { class: 'tier', type: 'button', id: 'olympus-buy-' + tier.id, disabled: !Batty.wallet.canBet(price),
        onclick: () => { closeOv(); spin(i); } }, fc, h('b', null, tier.name), h('span', null, tier.sub), h('em', null, Batty.fmt(price) + ' BB'), h('small', null, (tier.price / U) + '× stake'));
      row.append(b);
    });
    box.append(row, h('button', { class: 'close', type: 'button', onclick: () => { Batty.sfx('click'); closeOv(); } }, 'Not today'));
    E.ov.textContent = ''; E.ov.append(box); E.ov.className = 'ov buying'; E.ov.hidden = false;
  }
  function closeOv() { if (!E) return; E.ov.hidden = true; E.ov.textContent = ''; E.ov.className = 'ov'; }

  /* =====================================================================================
     THE COCK COMBO — plays back the script the maths file wrote. Nothing is decided here.
     ===================================================================================== */
  function buildBoard() {
    E.board.textContent = ''; slots = [];
    E.board.append(h('i', { class: 'wave' }));
    for (let c = 0; c < CELLS; c++) {
      const col = (c / ROWS) | 0, row = c % ROWS;
      const el = h('div', { class: 'slot', style: { gridColumn: String(col + 1), gridRow: String(row + 1), '--c': col, '--r': row, '--gd': (Math.random() * -4).toFixed(2) + 's' } });
      E.board.append(el); slots.push({ el, kind: null, val: 0, valEl: null });
    }
  }
  const pieceKey = (key) => (HAS_I[key] && key !== 'coin' ? key + '-i' : key);
  function place(c, key, kind, text, cls) {
    const sl = slots[c];
    sl.kind = kind; sl.el.className = 'slot full k-' + kind + (cls ? ' ' + cls : '');
    sl.el.innerHTML = '<div class="piece">' + useSym(pieceKey(key)) + '<b class="val"></b></div>';
    sl.valEl = sl.el.querySelector('b'); sl.valEl.textContent = text || '';
  }
  function setVal(c, units, unit, fx) {
    const sl = slots[c]; sl.val = units; if (!sl.valEl) return;
    sl.valEl.textContent = short(units * unit);
    if (fx) { const p = sl.el.firstChild; p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); }
  }
  function floatText(c, text, color) {
    const f = h('span', { class: 'float', style: { color: color || '#fff' } }, text);
    slots[c].el.append(f); S.timeout(() => f.remove(), 1000);
  }
  function setRespins(n, how) {
    const kids = E.respins.children;
    for (let i = 0; i < 3; i++) kids[i].className = i < n ? 'on' : '';
    E.respins.className = 'respins' + (n === 1 ? ' last' : '');
    if (how) { void E.respins.offsetWidth; E.respins.classList.add(how); }
  }
  /* the combo total: one animator, so overlapping updates never fight */
  let shownTotal = 0, totFrom = 0, totTo = 0, totT0 = 0, totMs = 1, totStop = null;
  function setTotal(bb, quick) {
    if (bb === totTo && totStop) return;
    totFrom = shownTotal; totTo = bb; totT0 = performance.now(); totMs = quick ? 120 : Math.max(120, T(420));
    E.total.classList.remove('bump'); void E.total.offsetWidth; E.total.classList.add('bump');
    if (!totStop) totStop = S.loop(() => {
      const k = Math.min(1, (performance.now() - totT0) / totMs), e = 1 - (1 - k) * (1 - k);
      shownTotal = Math.round(totFrom + (totTo - totFrom) * e); E.total.textContent = Batty.fmt(shownTotal);
      if (k >= 1) { totStop(); totStop = null; }
    });
  }
  function resetTotal() { if (totStop) { totStop(); totStop = null; } shownTotal = totFrom = totTo = 0; E.total.textContent = '0'; }
  const boardSum = () => slots.reduce((a, s) => a + s.val, 0);
  function godOn(k, on) {
    if (!E) return;
    E.altar[k].classList.toggle('strike', on); E.leg[k].classList.toggle('strike', on);
    E.medUse[k].setAttribute('href', '#' + P + 's-god' + k + (on ? '-w' : ''));
  }
  function strike(k) { godOn(k, true); S.timeout(() => godOn(k, false), T(1100)); }
  function slotPos(c) { return pos(slots[c].el); }
  function jpPulse(j, on) { const p = E.jp.querySelector('.j' + j); if (p) p.classList.toggle('tease', on); }

  async function superBurst(o) {
    const tr = o.trigger;
    banner('<small>A pot has burst</small><b>Super!</b>', 'super', 1600); snd.rise(T(900) / 1000); shake(true);
    const landed = o.gods.map((g) => g.god);
    for (const k of landed) { pots[k] = 3; }
    paintPots(); await nap(500);
    for (const k of tr.gods) { pots[k] = 3; }
    paintPots(); await nap(400);
    for (const x of tr.extras) {
      const a = E.altar[x.god], ap = pos(a);
      a.classList.add('burst'); skyFlash(2); snd.zap(); snd.boom(); Batty.sfx('pop');
      Batty.fx.burst({ el: a, count: 34, kind: 'coin', power: 0.9 }); sparks(ap.x, ap.y, 26, ['#fff', GOD_COL[x.god]], 320);
      const cell = cellEl(x.reel, x.row);
      await new Promise((res) => { orb(ap, pos(cell), GOD_COL[x.god], 0.55, res); S.timeout(res, T(900)); });
      const R = reels[x.reel]; R.syms[x.row + 1] = { key: 'god' + x.god, god: true, v: 'w' }; paintReel(R);
      cell.classList.add('pop'); snd.cluck(); snd.pluck(784);
      const cp = pos(cell); ring(cp, GOD_COL[x.god], cp.w * 0.9, 0.5); sparks(cp.x, cp.y, 18, ['#fff', GOD_COL[x.god]], 260);
      bolt({ x: cp.x, y: -20 }, cp, GOD_COL[x.god], 4, 0.5, true);
      await nap(420);
    }
    for (const k of landed) { E.altar[k].classList.add('burst'); Batty.fx.burst({ el: E.altar[k], count: 20, kind: 'coin', power: 0.7 }); }
    Batty.sfx('pop'); await nap(450);
  }

  async function intro(o) {
    const tr = o.trigger, n = tr.gods.length, sup = tr.type === 'super';
    const titles = ['', 'One god answers', 'Two gods answer', 'Three gods answer', 'Four gods answer', 'The Full Pantheon'];
    const title = (sup ? 'Super ' : '') + 'Cock Combo';
    const cards = [];
    const row = h('div', { class: 'cards' });
    for (let k = 0; k < 5; k++) { const c = h('div', { class: 'card', style: { '--gc': GOD_COL[k], '--i': k } }, h('i', { html: useSym('god' + k) }), h('b', null, M.GODS[k].name), h('span', null, M.GODS[k].feature)); cards.push(c); row.append(c); }
    const sub = h('p', { class: 'sub' }, ' ');
    const h3 = h('h3', { 'aria-label': title, html: title.split('').map((ch, i) => '<span style="--i:' + i + '"' + (sup && i < 5 ? ' class="em"' : '') + '>' + (ch === ' ' ? '&#160;' : ch) + '</span>').join('') });
    const box = h('div', { class: 'introbox' + (sup ? ' super' : '') }, h('i', { class: 'rays' }), h('small', { class: 'kick' }, sup ? 'A pot has burst' : tr.type === 'buy' ? 'Bought and paid for' : 'The gods are furious'), h3, row, sub, h('p', { class: 'tap' }, 'Tap to begin'));
    E.ov.textContent = ''; E.ov.append(box); E.ov.className = 'ov intro'; E.ov.hidden = false;
    snd.gong(); Batty.sfx('bonus'); skyFlash(2, true);
    await nap(950);
    for (const k of tr.gods) {
      if (!E) return;
      cards[k].classList.add('on'); cards[k].querySelector('use').setAttribute('href', '#' + P + 's-god' + k + '-w'); godOn(k, true);
      [snd.zap, snd.wave, snd.bell, snd.harp, snd.clang][k]();
      if (k === 0) skyFlash(2, true);
      const cp = pos(cards[k]); ring(cp, GOD_COL[k], cp.w * 0.9, 0.55); sparks(cp.x, cp.y, 22, ['#fff', GOD_COL[k]], 300, { g: 200, life: 0.8 });
      await nap(n >= 4 ? 420 : 580);
    }
    sub.textContent = titles[n] + (n === 5 ? ' · every modifier at once' : ' · ' + tr.gods.map((k) => M.GODS[k].feature).join(' + '));
    box.classList.add('ready'); if (n === 5) { snd.fanfare(); skyFlash(3, true); }
    await waitTap(auto || turbo ? 1500 : 3600);
    for (let k = 0; k < 5; k++) godOn(k, false);
    E.ov.classList.add('out'); Batty.sfx('whoosh'); await nap(300);
    closeOv();
  }

  /* lightning flash, the reels give way to the board in a wave */
  async function enterBoard(o, unit) {
    const b = o.bonus, tr = o.trigger;
    E.scene.classList.add('storm'); root.classList.add('bonus'); skyFlash(3, true); snd.boom();
    buildBoard(); E.board.classList.add('entering'); S.timeout(() => E && E.board.classList.remove('entering'), 1400);
    for (let k = 0; k < 5; k++) { const on = tr.gods.indexOf(k) >= 0; E.altar[k].classList.toggle('inplay', on); E.altar[k].classList.toggle('asleep', !on); E.leg[k].classList.toggle('inplay', on); E.leg[k].classList.toggle('asleep', !on); }
    resetTotal(); setRespins(3);
    for (const st of b.start) {
      if (st.god != null) place(st.cell, 'god' + st.god, 'god', '', 'in');
      else { place(st.cell, 'coin', 'coin', '', 'in'); setVal(st.cell, st.value, unit); }
    }
    setMsg('Three respins · every prize that lands resets them', 'hot');
    await nap(900);
    for (const st of b.start) {
      if (st.god == null) continue;
      const p = slotPos(st.cell);
      place(st.cell, st.kind === 'power' ? 'power' : 'coin', st.kind, '', 'flip'); setVal(st.cell, st.value, unit);
      Batty.sfx('coin'); if (st.kind === 'power') snd.clang();
      ring(p, GOD_COL[st.god], p.w * 0.8, 0.45); sparks(p.x, p.y, 14, ['#fff', GOD_COL[st.god]], 220);
      setTotal(Math.min(boardSum(), M.CAP) * unit);
      await nap(280);
    }
    setTotal(Math.min(boardSum(), M.CAP) * unit);
    await nap(420);
  }
  async function leaveBoard() {
    skyFlash(2, true); Batty.sfx('whoosh');
    root.classList.add('leaving'); await nap(320);
    root.classList.remove('bonus', 'leaving'); E.scene.classList.remove('storm'); E.board.textContent = ''; slots = [];
    for (let k = 0; k < 5; k++) { E.altar[k].classList.remove('inplay', 'asleep', 'burst', 'strike'); E.leg[k].classList.remove('inplay', 'asleep', 'strike'); E.medUse[k].setAttribute('href', '#' + P + 's-god' + k); }
    for (let j = 0; j < 4; j++) jpPulse(j, false);
  }

  async function playBonus(o, unit) {
    const b = o.bonus, tr = o.trigger;
    /* the moment it triggers */
    clearWins(); mode = 'bonus'; paintCtl(); aresShown = false;
    setMsg('The gods awaken', 'hot');
    for (const g of o.gods) { const R = reels[g.reel]; setVar(R, g.row + 1, 'w'); R.cells[g.row + 1].el.classList.add('pop'); }
    snd.crow(); skyFlash(3); S.timeout(() => snd.thunder(), T(300)); E.frame.classList.add('trig');
    for (const g of o.gods) { const c = pos(cellEl(g.reel, g.row)); bolt({ x: c.x + (Math.random() - 0.5) * 80, y: -20 }, c, GOD_COL[g.god], 4, 0.6, true); ring(c, GOD_COL[g.god], c.w * 1.1, 0.6); sparks(c.x, c.y, 22, ['#fff', GOD_COL[g.god]], 320); }
    await nap(1400);
    E.frame.classList.remove('trig');
    if (tr.type === 'super') await superBurst(o);
    await intro(o);
    if (!E) return;
    await enterBoard(o, unit);
    for (const st of b.steps) { if (!E) return; await playStep(st, unit, b); }
    rush = false;
    /* the end */
    setRespins(b.full ? 3 : 0);
    if (b.fullGrand) {
      for (const sl of slots) { const pc = sl.el.firstChild; if (pc) { pc.classList.remove('paid'); void pc.offsetWidth; pc.classList.add('paid'); } }
      await nap(500);
      await jpTakeover(3, M.JACKPOTS[3].units * unit, 'Every spot filled');
      setTotal(b.total * unit);
    } else if (b.capped) {
      banner('<small>The gods can give no more</small><b>Max win ' + Batty.fmt(M.MAX_WIN_X) + '×</b>', 'grand'); snd.fanfare(); skyFlash(3);
      setTotal(b.total * unit); await waitTap(2800); hideBanner();
    }
    await outro(b, unit);
    await leaveBoard();
    if (tr.type === 'super') { for (const k of tr.gods) pots[k] = 0; paintPots(); }
    mode = 'base'; paintCtl();
  }

  async function playStep(st, unit, b) {
    rush = false;
    const last = st.left === 1;
    setRespins(st.left - 1, 'use');
    const empties = []; for (let c = 0; c < CELLS; c++) if (!slots[c].kind) empties.push(c);
    const tease = empties.length <= 2;
    for (const c of empties) slots[c].el.classList.add('spin');
    if (last) { snd.heart(); S.timeout(() => { if (E && mode !== 'base') snd.heart(); }, T(760)); E.hud.classList.add('lastgasp'); E.board.classList.add('danger'); setMsg('Last respin', 'hot'); }
    else setMsg(st.left === 3 ? 'Respins: 3' : 'Respins: ' + st.left, '');
    if (tease) { for (const c of empties) slots[c].el.classList.add('tease'); snd.antic(2, T(1300) / 1000); jpPulse(3, true); setMsg(empties.length === 1 ? 'One spot from the Grand…' : 'Two spots from the Grand…', 'hot'); }
    Batty.sfx('spin');
    await napSkip(tease ? 1350 : last ? 1050 : 620);
    const landAt = {}; for (const L of st.lands) landAt[L.cell] = L;
    let any = false, n = 0;
    for (let col = 0; col < REELS; col++) {
      let had = false, landed = false;
      for (let row = 0; row < ROWS; row++) {
        const c = col * ROWS + row; if (empties.indexOf(c) < 0) continue;
        had = true; const sl = slots[c]; sl.el.classList.remove('spin', 'tease');
        const L = landAt[c];
        if (!L) { sl.el.classList.remove('stopped'); void sl.el.offsetWidth; sl.el.classList.add('stopped'); continue; }
        landed = true; any = true; n++;
        if (L.kind === 'coin') { place(c, 'coin', 'coin', '', 'land'); setVal(c, L.value, unit); }
        else if (L.kind === 'gem') { place(c, 'gem' + L.jp, 'gem', '', 'land'); setVal(c, L.value, unit); }
        else place(c, L.kind, L.kind, '', 'land');
        lockFx(c, L, n);
      }
      if (had && !landed) snd.empty();
      if (had) await nap(landed ? 180 : 80);
    }
    E.hud.classList.remove('lastgasp'); E.board.classList.remove('danger'); jpPulse(3, false);
    if (any) {
      respinReset(n);
      setTotal(Math.min(boardSum(), M.CAP) * unit);
      for (const L of st.lands) {
        if (L.forced) await divine(L);
        if (L.kind === 'gem') await jackpotMoment(L, unit);
      }
      await nap(280);
    } else { if (st.leftAfter === 0) snd.fizzle(); await nap(160); }
    for (const ev of st.events) await playEvent(ev, unit);
    setRespins(st.leftAfter); setTotal(st.total * unit);
    await nap(any ? 300 : 120);
  }

  /* a prize slams into its spot and locks */
  function lockFx(c, L, n) {
    const p = slotPos(c), spec = L.kind !== 'coin', col = spec ? GOD_COL[L.god] : '#ffd75e';
    snd.lock(n);
    ring(p, col, p.w * 0.72, 0.45);
    sparks(p.x, p.y, spec ? 22 : 12, spec ? ['#fff', col] : ['#ffd75e', '#fff3bd', '#fff'], spec ? 300 : 220);
    if (!rm) for (let i = 0; i < 3; i++) fxAdd({ type: 'p', shape: 'puff', x: p.x + (Math.random() - 0.5) * p.w * 0.6, y: p.y + p.h * 0.35, vx: (Math.random() - 0.5) * 40, vy: -10, g: 0, r: 6, grow: 16, col: '#e8dcff', life: 0.45 });
    E.frame.classList.remove('jolt'); void E.frame.offsetWidth; E.frame.classList.add('jolt');
    if (spec) { strike(L.god); A.tone({ f: 523 * Math.pow(1.12, L.god), d: 0.4, type: 'triangle', v: 0.1, t: 0.05 }); }
  }
  function respinReset(n) {
    setRespins(3, 'reset'); snd.reset();
    E.hud.classList.remove('rsfx'); void E.hud.offsetWidth; E.hud.classList.add('rsfx');
    E.board.classList.remove('rsflash'); void E.board.offsetWidth; E.board.classList.add('rsflash');
    const p = pos(E.respins); sparks(p.x, p.y, 16, ['#ffd75e', '#fff'], 200, { g: 300 });
    setMsg((n > 1 ? n + ' prizes land' : 'A prize lands') + ' · respins reset to 3', 'hot');
  }
  async function divine(L) {
    const p = slotPos(L.cell);
    banner('<small>Divine intervention</small><b>' + M.GODS[L.god].name + ' will not be ignored</b>', 'god g' + L.god, 1300);
    bolt({ x: p.x, y: -30 }, p, GOD_COL[L.god], 5, 0.6, true); skyFlash(2); snd.zap();
    floatText(L.cell, 'Divine!', GOD_COL[L.god]);
    await nap(800);
  }

  function jpFlash(j) { const p = E.jp.querySelector('.j' + j); if (!p) return; p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); S.timeout(() => p.classList.remove('hit'), 2600); }
  async function jackpotMoment(L, unit) {
    const j = L.jp, name = M.JACKPOTS[j].name, sp = slotPos(L.cell);
    strike(2); snd.bell(); jpFlash(j);
    const plq = E.jp.querySelector('.j' + j);
    if (plq) bolt(pos(plq), sp, JP_COL[j], 3.5, 0.6, true);
    flames(sp, '#b96bff', 18); flames(sp, JP_COL[j], 10);
    ring(sp, JP_COL[j], sp.w * 1.2, 0.6);
    if (j <= 1) {
      godcast(2, 'Hendes', name + ' Jackpot · ' + Batty.fmt(L.value * unit) + ' BB', 1600);
      banner('<i class="bgem">' + useSym('gem' + j + '-w') + '</i><small>Hendes coughs up the</small><b>' + name + ' Jackpot</b><span>' + Batty.fmt(L.value * unit) + ' BB</span>', 'jp j' + j);
      Batty.fx.burst({ el: slots[L.cell].el, count: 18 + j * 14, kind: 'spark', colors: ['#fff', JP_COL[j]], power: 0.6 + j * 0.15 });
      A.seq(j ? [523, 659, 784, 1047] : [523, 659, 784], { step: 0.08, type: 'triangle', v: 0.14 });
      await napSkip(j === 0 ? 1300 : 1700);
      hideBanner();
    } else {
      godcast(2, 'Hendes', 'The ' + name + ' is yours', 1200);
      await nap(700);
      await jpTakeover(j, L.value * unit, 'Hendes coughs up the');
    }
  }
  /* the full-screen jackpot takeover for the Major and the Grand */
  async function jpTakeover(j, bb, kicker) {
    const out = h('output', null, '0');
    const box = h('div', { class: 'jpbox j' + j, style: { '--jc': JP_COL[j] } }, h('i', { class: 'rays' }), h('div', { class: 'gem', html: useSym('gem' + j + '-w') }), h('small', { class: 'kick' }, kicker), h('h3', null, M.JACKPOTS[j].name + ' Jackpot'), out, h('p', { class: 'tap' }, 'Tap to carry on'));
    E.ov.textContent = ''; E.ov.append(box); E.ov.className = 'ov jpov'; E.ov.hidden = false;
    snd.gong(); snd.fanfare(); skyFlash(3); shake(true);
    Batty.fx.rain(j >= 3 ? 'confetti' : 'coin', j >= 3 ? 3400 : 2200);
    const gp = pos(box.querySelector('.gem')); ring(gp, JP_COL[j], gp.w * 1.6, 0.8); sparks(gp.x, gp.y, 40, ['#fff', JP_COL[j], '#ffd75e'], 420, { r: 2.4, life: 1 });
    const ms = j >= 3 ? 2600 : 1800;
    countTick(out, 0, bb, T(ms));
    await waitTap(ms + 200);
    doSkip();
    box.classList.add('ready');
    await waitTap(auto || turbo ? 1200 : 2800);
    E.ov.classList.add('out'); await nap(260); closeOv();
  }

  function sunburst(c) {
    const col = (c / ROWS) | 0, row = c % ROWS;
    const el = h('i', { class: 'sunburst', style: { left: ((col + 0.5) * 20) + '%', top: ((row + 0.5) * 100 / 3) + '%' } });
    E.board.append(el); S.timeout(() => el.remove(), 1600);
  }
  async function playEvent(ev, unit) {
    const sl = slots[ev.cell];
    if (ev.type === 'grow') {
      godOn(4, true); snd.clang();
      if (!aresShown) { aresShown = true; godcast(4, 'Ares', 'His shield grows after every respin', 1500); }
      const p = pos(sl.el); ring(p, GOD_COL[4], p.w * 0.9, 0.45); sparks(p.x, p.y, 12, ['#ffb0a0', '#ffd75e', '#fff'], 220);
      const pc = sl.el.firstChild; pc.classList.remove('thrust'); void pc.offsetWidth; pc.classList.add('thrust');
      setVal(ev.cell, ev.to, unit, true); floatText(ev.cell, '+' + short(ev.add * unit), '#ffb0a0');
      setTotal(Math.min(boardSum(), M.CAP) * unit, true);
      await nap(360); godOn(4, false);
      return;
    }
    if (ev.type === 'boost') {
      strike(0); setMsg('Zeus lets rip', 'hot');
      const p = pos(sl.el);
      godcast(0, 'Zeus', '+' + short(ev.add * unit) + ' on every prize', 1600);
      skyFlash(3); shake(true); snd.zap(); snd.thunder(); snd.boom();
      for (let i = 0; i < 3; i++) bolt({ x: p.x + (i - 1) * 70 + (Math.random() - 0.5) * 30, y: -30 }, p, '#bfe6ff', 6 - i * 1.5, 0.7, true);
      ring(p, '#fff', p.w * 1.6, 0.5); sparks(p.x, p.y, 30, ['#fff', '#bfe6ff', '#ffe45c'], 380);
      E.board.classList.remove('zap'); void E.board.offsetWidth; E.board.classList.add('zap');
      sl.el.firstChild.classList.add('hit');
      await nap(560);
      for (const hx of ev.hits) {
        const hp = pos(slots[hx.cell].el);
        bolt(p, hp, '#ffe45c', 2.6, 0.35); sparks(hp.x, hp.y, 8, ['#fff', '#ffe45c'], 180);
        setVal(hx.cell, hx.to, unit, true); floatText(hx.cell, '+' + short(ev.add * unit), '#ffe45c');
        A.tone({ f: 900 + Math.random() * 500, f2: 300, d: 0.09, type: 'sawtooth', v: 0.06 });
        setTotal(Math.min(boardSum(), M.CAP) * unit, true);
        await nap(Math.max(55, 560 / (ev.hits.length + 1)));
      }
      setVal(ev.cell, ev.own, unit, true);
      await nap(380);
    } else if (ev.type === 'double') {
      strike(3); setMsg('A-Pollo shines on you', 'hot');
      const p = pos(sl.el);
      godcast(3, 'A-Pollo', 'Every prize doubled', 1600);
      snd.harp(); sunburst(ev.cell); ring(p, '#ffe45c', Math.max(root.clientWidth, 500) * 0.6, 0.9); ring(p, '#fff', p.w, 0.5);
      sparks(p.x, p.y, 34, ['#fff', '#ffe45c', '#ffb630'], 420, { r: 2.2 });
      orb(pos(E.altar[3]), p, '#ffe45c', 0.3);
      await nap(520);
      const order = ev.hits.slice().sort((x, y) => Math.hypot(pos(slots[x.cell].el).x - p.x, pos(slots[x.cell].el).y - p.y) - Math.hypot(pos(slots[y.cell].el).x - p.x, pos(slots[y.cell].el).y - p.y));
      for (const hx of order) {
        const pc = slots[hx.cell].el.firstChild; pc.classList.remove('dbl'); void pc.offsetWidth; pc.classList.add('dbl');
        setVal(hx.cell, hx.to, unit); floatText(hx.cell, '×2', '#ffe45c');
        const hp = pos(slots[hx.cell].el); sparks(hp.x, hp.y, 6, ['#fff', '#ffe45c'], 150);
        A.tone({ f: 660 + Math.random() * 600, d: 0.16, type: 'triangle', v: 0.09 });
        setTotal(Math.min(boardSum(), M.CAP) * unit, true);
        await nap(Math.max(55, 600 / (order.length + 1)));
      }
      setVal(ev.cell, ev.own, unit, true);
      await nap(380);
    } else if (ev.type === 'collect') {
      strike(1); setMsg('Peckseidon scoops the lot', 'hot');
      const p = pos(sl.el);
      godcast(1, 'Peckseidon', 'Scoops every prize into his trident', 1600);
      snd.wave(); orb(pos(E.altar[1]), p, GOD_COL[1], 0.3); ring(p, GOD_COL[1], p.w * 1.6, 0.6);
      E.board.classList.remove('surf'); void E.board.offsetWidth; E.board.classList.add('surf');
      await nap(520);
      let run = 0;
      if (!ev.from.length) setVal(ev.cell, ev.value, unit, true);
      for (const f of ev.from) {
        const fp = slots[f.cell].el.firstChild; fp.classList.remove('hit'); void fp.offsetWidth; fp.classList.add('hit');
        run += f.value; const now = run;
        orb(pos(slots[f.cell].el), p, GOD_COL[1], 0.34, () => { if (!E || !slots.length) return; setVal(ev.cell, now, unit, true); setTotal(Math.min(boardSum(), M.CAP) * unit, true); Batty.sfx('chip'); sparks(p.x, p.y, 5, ['#fff', GOD_COL[1]], 140); });
        await nap(Math.max(55, 660 / (ev.from.length + 1)));
      }
      await nap(440);
      setVal(ev.cell, ev.value, unit, true);
      ring(p, '#fff', p.w * 1.1, 0.5);
      Batty.fx.burst({ el: sl.el, count: 16, kind: 'coin', power: 0.5 });
      await nap(320);
    }
    setTotal(Math.min(boardSum(), M.CAP) * unit, true);
  }

  async function outro(b, unit) {
    const total = b.total * unit, x = b.total / U, n = b.steps.length;
    setMsg('Paying the board', 'hot');
    const tp = pos(E.total);
    let i = 0;
    for (let c = 0; c < CELLS; c++) if (slots[c].kind) {
      const sl = slots[c]; sl.el.firstChild.classList.add('paid');
      if (!rm) orb(pos(sl.el), tp, '#ffd75e', 0.32);
      A.tone({ f: 600 + i * 45, d: 0.07, type: 'square', v: 0.045 }); i++;
      await nap(60);
    }
    setTotal(total);
    await nap(380);
    const amount = h('output', null, '0');
    const gods = h('div', { class: 'who' }); for (const k of b.gods) gods.append(h('i', { style: { '--gc': GOD_COL[k] }, html: useSym('god' + k + '-w') }));
    const jpw = []; b.jackpots.forEach((cnt, j) => { if (cnt) jpw.push((cnt > 1 ? cnt + '× ' : '') + M.JACKPOTS[j].name); });
    const stat = (k, v) => h('div', null, h('b', null, String(v)), h('small', null, k));
    const stats = h('div', { class: 'stats' }, stat(n === 1 ? 'Respin' : 'Respins', n), stat('Prizes', b.final.length), stat(jpw.length === 1 ? 'Jackpot' : 'Jackpots', jpw.length ? jpw.join(' + ') : 'None'));
    const box = h('div', { class: 'outrobox' + (x >= 10 ? ' big' : '') }, h('i', { class: 'rays' }), h('small', { class: 'kick' }, 'Cock Combo complete'), h('h3', null, total > 0 ? 'You won' : 'The gods shrug'), amount, h('span', { class: 'xs' }, 'in ' + n + (n === 1 ? ' respin' : ' respins') + ' · ' + Batty.fmtX(x) + ' your stake'), gods, stats, h('p', { class: 'tap' }, 'Tap to carry on'));
    E.ov.textContent = ''; E.ov.append(box); E.ov.className = 'ov outro'; E.ov.hidden = false;
    if (x >= 10) { snd.fanfare(); Batty.fx.rain('coin', 1600); } else Batty.sfx('win');
    if (total > 0) Batty.fx.burst({ el: amount, count: 30, kind: 'coin', power: 0.9 });
    const ms = Math.min(2600, 800 + x * 14);
    countTick(amount, 0, total, T(ms));
    await waitTap(ms + 150);
    doSkip(); amount.textContent = Batty.fmt(total); box.classList.add('ready');
    await waitTap(auto || turbo ? 1200 : 3000);
    E.ov.classList.add('out'); await nap(260);
    closeOv();
  }

  Batty.registerGame({
    id: ID,
    name: 'Raging Cocks of Olympus 2',
    tagline: 'Five furious rooster gods, five bonuses, one Cock Combo',
    tag: 'Slot',
    poster: poster(),
    rules: rules,
    mount: mount,
    unmount: unmount,
  });
})();
