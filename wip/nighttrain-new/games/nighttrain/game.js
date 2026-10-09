/* ===== nighttrain math ===== */
/* Night Train: pure maths. No DOM. Shared verbatim by the browser game, tools/nighttrain-sim.js and tools/nighttrain-xcheck.js,
   and ported line for line to lib/games/nighttrain.php (proved identical on seeded RNGs by tools/nighttrain-xcheck.js).

   AMOUNTS     In CREDITS: 1,000 credits = 1x the stake. A line bet is a fortieth of the stake (25 credits). A round's win in
               Batty Bucks is floor(credits * stake / 1000).
   BASE GAME   5 reels x 4 rows on real reel strips (STRIPS, built once from CFG with a fixed shuffle). 40 fixed lines pay left
               to right from reel 1. The Night Train Wild lands on reels 2 to 5 and stands in for every paying symbol.
               Moon Coins (the bonus symbol) land anywhere carrying a cash value (or, rarely, one of the bonus characters).
   TRIGGER     3 or more Moon Coins anywhere start the Night Train Respin Bonus. They board the train with their values.
   BONUS       A 5x6 board. The 4 rows of the reels are open; the top 2 rows are chained shut. 3 respins; every respin that
               lands anything resets them to 3. Fill UNLOCK[0] spaces to break the chains on row 5, UNLOCK[1] for row 6.
               Characters act in a fixed order every respin:
                 1 newly landed Paymasters (and Phantom Paymasters) add their value to every other symbol,
                 2 newly landed Sharpshooters (and Phantoms) double 2 to 5 random symbols (bullets pass through Phantoms,
                   and a Phantom Sharpshooter never shoots the same symbol twice),
                 3 newly landed Conductors (and Phantoms) add up every other value on the board into themselves,
                 4 newly landed Necromancers raise 1 to 3 spent Paymasters/Sharpshooters/Conductors, who act again
                   (with nobody to raise, the Necromancer triples its own value),
                 5 then every Phantom already aboard acts again: Paymasters, then Sharpshooters, then Conductors.
               When the respins run out (or the board is full) every value on the board is paid.
   BONUS BUY   BUY_X times the stake buys straight into the bonus with 3, 4 or 5 Moon Coins (BUY weights).
   MAX WIN     MAX_X times the stake per round. The round ends the moment it is reached. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).nighttrain = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 4, COLS = 5, BROWS = 6, CELLS = 30, ROW0 = 2;
  const CR = 1000, LINE_CR = 25, MAX_X = 50000, CAP = MAX_X * CR, BUY_X = 80;

  /* reel symbols */
  const WILD = 0, H1 = 1, H2 = 2, H3 = 3, H4 = 4, LA = 5, LK = 6, LQ = 7, LJ = 8, COIN = 9, NSYM = 10;
  const SYMBOLS = ['wild', 'bandit', 'loot', 'watch', 'lantern', 'a', 'k', 'q', 'j', 'coin'];
  const SYMBOL_NAMES = ['Night Train Wild', 'Bandit Bat', 'Loot Sack', 'Pocket Watch', 'Lantern', 'Ace', 'King', 'Queen', 'Jack', 'Moon Coin'];
  /* bonus-board kinds */
  const K_COIN = 1, K_COL = 2, K_PAY = 3, K_SNP = 4, K_NEC = 5, K_PCOL = 6, K_PPAY = 7, K_PSNP = 8;
  const KINDS = ['', 'coin', 'col', 'pay', 'snp', 'nec', 'pcol', 'ppay', 'psnp'];
  const KIND_NAMES = ['', 'Moon Coin', 'Conductor', 'Paymaster', 'Sharpshooter', 'Necromancer', 'Phantom Conductor', 'Phantom Paymaster', 'Phantom Sharpshooter'];

  /* PAY[symbol] = [3, 4, 5 of a kind] in credits per line (a line bet is 25 credits) */
  const PAY = [
    [0, 0, 0],
    [500, 2500, 12500], // Bandit Bat
    [375, 1250, 5000],  // Loot Sack
    [300, 750, 3750],   // Pocket Watch
    [250, 625, 2500],   // Lantern
    [175, 450, 1250],   // Ace
    [150, 375, 1000],   // King
    [125, 300, 750],    // Queen
    [125, 250, 625],    // Jack
    [0, 0, 0],
  ];
  /* rows used by each line, reel by reel (0 = top) */
  const LINES = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3],
    [1, 1, 0, 1, 1], [2, 2, 3, 2, 2], [1, 1, 2, 1, 1], [2, 2, 1, 2, 2], [0, 1, 1, 1, 0],
    [3, 2, 2, 2, 3], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2],
    [0, 1, 0, 1, 0], [3, 2, 3, 2, 3], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2], [1, 2, 1, 2, 1],
    [2, 1, 2, 1, 2], [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [0, 1, 2, 3, 3], [3, 2, 1, 0, 0],
    [1, 0, 1, 2, 1], [2, 3, 2, 1, 2], [1, 2, 1, 0, 1], [2, 1, 2, 3, 2], [0, 0, 0, 1, 2],
    [3, 3, 3, 2, 1], [0, 1, 2, 2, 2], [3, 2, 1, 1, 1], [1, 1, 1, 0, 0], [2, 2, 2, 3, 3],
  ];
  const CFG = {
    /* how many of each symbol on each reel strip (index = symbol). The wild only lands on reels 2 to 5. */
    counts: [
      /* W  H1 H2 H3 H4 A   K   Q   J  COIN */
      [0, 4, 5, 6, 7, 10, 11, 12, 12, 1],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 1],
    ],
    /* Moon Coin cash values (credits; 1000 = 1x stake) and their weights */
    coinV: [500, 1000, 2000, 3000, 4000, 5000, 8000, 10000, 15000, 20000, 25000, 50000, 100000, 250000],
    coinW: [2600, 2600, 1600, 900, 600, 500, 300, 250, 160, 120, 90, 45, 18, 4],
    /* a Moon Coin in the base game is a coin, or rarely a character: [coin, Conductor, Paymaster, Sharpshooter, Necromancer] */
    baseKindW: [960, 10, 14, 12, 4],
    /* bonus: chance that each empty open space lands a symbol on a respin, by how many spaces are filled */
    landP: 0.05,
    /* what lands, by kind (index = kind). Phantoms (6, 7, 8): at most one of each per bonus. */
    kindW: [0, 9200, 160, 180, 160, 70, 5, 7, 7],
    shotN: [2, 3, 4, 5], shotW: [45, 30, 17, 8],
    raiseN: [1, 2, 3], raiseW: [55, 32, 13],
    unlock: [12, 18],
    /* bonus buy: how many Moon Coins start the bonus, and what each one is */
    buyN: [3, 4, 5], buyNW: [70, 22, 8],
    buyKindW: [900, 25, 30, 30, 15],
  };

  /* ---------- strips: built once from CFG with a fixed shuffle ---------- */
  function mulberry(seed) {
    let s = seed | 0;
    return function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function buildStrips() {
    const rnd = mulberry(20261031);
    const out = [];
    for (let r = 0; r < REELS; r++) {
      const a = [];
      for (let sym = 0; sym < NSYM; sym++) for (let i = 0; i < CFG.counts[r][sym]; i++) a.push(sym);
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      /* no symbol twice in a row on a strip (so a reel shows at most two Moon Coins, and the reels look like real reels) */
      for (let pass = 0; pass < 60; pass++) {
        let bad = false;
        for (let i = 0; i < a.length; i++) {
          const n = (i + 1) % a.length;
          if (a[i] === a[n]) { bad = true; const k = (n + 1 + Math.floor(rnd() * (a.length - 3))) % a.length; const t = a[n]; a[n] = a[k]; a[k] = t; }
        }
        if (!bad) break;
      }
      out.push(a);
    }
    return out;
  }
  const STRIPS = buildStrips();

  /* ---------- helpers ---------- */
  function pickIndex(rng, w) {
    let total = 0; for (let i = 0; i < w.length; i++) total += w[i];
    let r = rng() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return w.length - 1;
  }
  const coinValue = (rng) => CFG.coinV[pickIndex(rng, CFG.coinW)];
  /* visible grid: grid[reel][row] */
  function readGrid(stops) {
    const g = [];
    for (let r = 0; r < REELS; r++) { const st = STRIPS[r], L = st.length, s = stops[r]; g.push([st[s % L], st[(s + 1) % L], st[(s + 2) % L], st[(s + 3) % L]]); }
    return g;
  }
  /* 40 lines, left to right. Reel 1 has no wild, so it names the symbol. */
  function evalLines(g) {
    const wins = []; let total = 0;
    for (let l = 0; l < LINES.length; l++) {
      const ln = LINES[l], sym = g[0][ln[0]];
      if (sym === COIN) continue;
      let n = 1;
      while (n < REELS) { const s = g[n][ln[n]]; if (s === sym || s === WILD) n++; else break; }
      if (n >= 3) { const p = PAY[sym][n - 3]; wins.push({ l: l, s: sym, n: n, pay: p }); total += p; }
    }
    return { wins: wins, total: total };
  }
  /* pick n distinct items of arr (a partial Fisher-Yates on a copy), in the order picked */
  function pickSome(rng, arr, n) {
    const a = arr.slice(), out = [];
    n = Math.min(n, a.length);
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rng() * (a.length - i)); const t = a[i]; a[i] = a[j]; a[j] = t; out.push(a[i]); }
    return out;
  }
  const isSpecial = (k) => k >= K_COL;
  const isPhantom = (k) => k >= K_PCOL;
  /* the order characters act in: Paymasters, Sharpshooters, Conductors, Necromancers */
  const ORDER_OF = [9, 9, 2, 0, 1, 3, 2, 0, 1];
  const baseKind = (k) => (k === K_PCOL ? K_COL : k === K_PPAY ? K_PAY : k === K_PSNP ? K_SNP : k);

  /* ---------- the Night Train Respin Bonus ----------
     start: [{c, k, v}] the symbols that boarded (cell c on the 5x6 board, kind k, value v in credits).
     capLeft: credits that can still be paid this round. Returns the whole sequence for the client to animate. */
  function bonus(rng, start, capLeft) {
    const kind = new Array(CELLS).fill(0), val = new Array(CELLS).fill(0), used = new Array(CELLS).fill(false), marked = new Array(CELLS).fill(false);
    let open = 4, filled = 0, capped = false;
    const kw = CFG.kindW.slice();
    const sum = () => { let s = 0; for (let c = 0; c < CELLS; c++) s += val[c]; return s; };
    const isOpen = (c) => Math.floor(c / COLS) >= BROWS - open;
    const startOut = [];
    for (const s of start) { kind[s.c] = s.k; val[s.c] = s.v; filled++; startOut.push({ c: s.c, k: s.k, v: s.v }); }

    /* one character acts; returns the action record */
    function act(c, k, phase) {
      const bk = baseKind(k); let a;
      if (bk === K_PAY) {
        const v = val[c], hits = [];
        for (let t = 0; t < CELLS; t++) if (t !== c && kind[t]) { val[t] += v; hits.push([t, val[t]]); }
        a = { t: 'pay', c: c, v: v, hits: hits };
      } else if (bk === K_SNP) {
        const cand = [];
        const ph = isPhantom(k);
        for (let t = 0; t < CELLS; t++) if (t !== c && kind[t] && !isPhantom(kind[t]) && val[t] > 0 && !(ph && marked[t])) cand.push(t);
        const n = CFG.shotN[pickIndex(rng, CFG.shotW)];
        const tg = pickSome(rng, cand, n), hits = [];
        for (const t of tg) { val[t] *= 2; if (ph) marked[t] = true; hits.push([t, val[t]]); }
        a = { t: 'snp', c: c, n: n, hits: hits };
      } else if (bk === K_COL) {
        const from = []; let s = 0;
        for (let t = 0; t < CELLS; t++) if (t !== c && kind[t] && val[t] > 0) { from.push(t); s += val[t]; }
        val[c] += s;
        a = { t: 'col', c: c, from: from, to: val[c] };
      } else {
        a = { t: 'nec', c: c, raise: [], to: val[c] };
      }
      if (phase) a.p = phase;
      if (!isPhantom(k)) used[c] = true;
      return a;
    }
    function capCheck() { if (sum() >= capLeft) capped = true; return capped; }
    /* resolve a set of cells that just arrived (start, or a respin's landings), in the fixed order */
    function resolveNew(cells, acts) {
      const sp = cells.filter((c) => isSpecial(kind[c]));
      sp.sort((x, y) => ORDER_OF[kind[x]] - ORDER_OF[kind[y]] || x - y);
      for (const c of sp) {
        if (capped) return;
        const k = kind[c];
        if (k === K_NEC) {
          const cand = [];
          for (let t = 0; t < CELLS; t++) if (used[t] && (kind[t] === K_COL || kind[t] === K_PAY || kind[t] === K_SNP)) cand.push(t);
          const n = CFG.raiseN[pickIndex(rng, CFG.raiseW)];
          const raised = pickSome(rng, cand, n);
          if (!raised.length) { val[c] *= 3; acts.push({ t: 'nec', c: c, raise: [], to: val[c] }); used[c] = true; capCheck(); continue; }
          raised.sort((x, y) => ORDER_OF[kind[x]] - ORDER_OF[kind[y]] || x - y);
          acts.push({ t: 'nec', c: c, raise: raised.slice(), to: val[c] }); used[c] = true;
          for (const t of raised) { if (capped) return; acts.push(act(t, kind[t], 'r')); capCheck(); }
        } else { acts.push(act(c, k)); capCheck(); }
      }
    }

    const startActs = [];
    capCheck();
    if (!capped) resolveNew(startOut.map((s) => s.c), startActs);
    const steps = [];
    let left = 3, respins = 0;
    while (left > 0 && !capped && filled < open * COLS) {
      respins++;
      const step = { left: left, lands: [], unlock: 0, acts: [], leftAfter: 0, sum: 0 };
      const landed = [];
      for (let c = 0; c < CELLS; c++) {
        if (kind[c] || !isOpen(c)) continue;
        if (rng() < CFG.landP) {
          const k = pickIndex(rng, kw);
          let v = 0;
          if (k !== K_COL && k !== K_PCOL) v = coinValue(rng);
          if (isPhantom(k)) kw[k] = 0;
          kind[c] = k; val[c] = v; filled++;
          landed.push(c); step.lands.push({ c: c, k: k, v: v });
        }
      }
      while (open < BROWS && filled >= CFG.unlock[open - 4]) { open++; step.unlock = open; }
      capCheck();
      if (!capped) resolveNew(landed, step.acts);
      /* Phantoms already aboard act after every respin */
      if (!capped) {
        const ph = [];
        for (let c = 0; c < CELLS; c++) if (isPhantom(kind[c]) && landed.indexOf(c) < 0) ph.push(c);
        ph.sort((x, y) => ORDER_OF[kind[x]] - ORDER_OF[kind[y]] || x - y);
        for (const c of ph) { if (capped) break; step.acts.push(act(c, kind[c], 'p')); capCheck(); }
      }
      left = landed.length ? 3 : left - 1;
      step.leftAfter = left;
      step.sum = Math.min(capLeft, sum());
      steps.push(step);
    }
    let total = sum();
    if (total >= capLeft) { total = capLeft; capped = true; }
    const board = [];
    for (let c = 0; c < CELLS; c++) if (kind[c]) board.push({ c: c, k: kind[c], v: val[c] });
    return { start: startOut, startActs: startActs, steps: steps, board: board, open: open, full: filled >= CELLS, respins: respins, total: total, capped: capped };
  }

  /* ---------- a base-game spin (and its bonus, if it triggers) ---------- */
  function finish(rng, grid, stops, kindW, buy) {
    const ev = buy ? { wins: [], total: 0 } : evalLines(grid);
    const coins = [];
    for (let r = 0; r < REELS; r++) for (let w = 0; w < ROWS; w++) {
      if (grid[r][w] !== COIN) continue;
      const k = pickIndex(rng, kindW) + 1;
      const v = k === K_COL ? 0 : coinValue(rng);
      coins.push({ r: r, w: w, c: (w + ROW0) * COLS + r, k: k, v: v });
    }
    const out = { stops: stops, grid: grid, lines: ev.wins, lineWin: Math.min(CAP, ev.total), coins: coins, bonus: null, bonusWin: 0, totalWin: 0, capped: false };
    if (buy) out.buy = true;
    if (coins.length >= 3) {
      out.bonus = bonus(rng, coins.map((x) => ({ c: x.c, k: x.k, v: x.v })), CAP - out.lineWin);
      out.bonusWin = out.bonus.total;
    }
    let total = out.lineWin + out.bonusWin;
    if (total >= CAP) { total = CAP; out.capped = true; }
    out.totalWin = total;
    return out;
  }
  function spin(rng) {
    const stops = [];
    for (let r = 0; r < REELS; r++) stops.push(Math.floor(rng() * STRIPS[r].length));
    return finish(rng, readGrid(stops), stops, CFG.baseKindW, false);
  }
  /* Bonus buy: a staged trigger. Reel 1 shows only {Bandit, Pocket Watch, Ace, Queen} and reel 2 only
     {Loot Sack, Lantern, King, Jack}, so no line can pay; then n Moon Coins are placed at random. */
  const BUY_R1 = [H1, H3, LA, LQ], BUY_R2 = [H2, H4, LK, LJ], BUY_REST = [H1, H2, H3, H4, LA, LK, LQ, LJ];
  function buy(rng) {
    const n = CFG.buyN[pickIndex(rng, CFG.buyNW)];
    const grid = [];
    for (let r = 0; r < REELS; r++) {
      const set = r === 0 ? BUY_R1 : r === 1 ? BUY_R2 : BUY_REST, col = [];
      for (let w = 0; w < ROWS; w++) col.push(set[Math.floor(rng() * set.length)]);
      grid.push(col);
    }
    const cells = []; for (let i = 0; i < REELS * ROWS; i++) cells.push(i);
    const spots = pickSome(rng, cells, n).sort((x, y) => x - y);
    for (const s of spots) grid[Math.floor(s / ROWS)][s % ROWS] = COIN;
    return finish(rng, grid, null, CFG.buyKindW, true);
  }
  /* Dev and test helper: a spin whose outcome satisfies pred (draws until it does). */
  function spinUntil(rng, pred, tries) { for (let i = 0; i < (tries || 2000000); i++) { const o = spin(rng); if (pred(o)) return o; } return spin(rng); }

  return {
    REELS: REELS, ROWS: ROWS, COLS: COLS, BROWS: BROWS, CELLS: CELLS, ROW0: ROW0, CR: CR, LINE_CR: LINE_CR, MAX_X: MAX_X, CAP: CAP, BUY_X: BUY_X,
    SYM: { WILD: WILD, H1: H1, H2: H2, H3: H3, H4: H4, A: LA, K: LK, Q: LQ, J: LJ, COIN: COIN }, NSYM: NSYM,
    KIND: { COIN: K_COIN, COL: K_COL, PAY: K_PAY, SNP: K_SNP, NEC: K_NEC, PCOL: K_PCOL, PPAY: K_PPAY, PSNP: K_PSNP },
    SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, KINDS: KINDS, KIND_NAMES: KIND_NAMES, PAY: PAY, LINES: LINES, CFG: CFG, STRIPS: STRIPS,
    mulberry: mulberry, pickIndex: pickIndex, readGrid: readGrid, evalLines: evalLines, bonus: bonus, finish: finish, spin: spin, buy: buy, spinUntil: spinUntil,
  };
});

/* ===== nighttrain ===== */
