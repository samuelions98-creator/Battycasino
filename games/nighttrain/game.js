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
   MAX WIN     MAX_X times the stake per round. The round ends the moment it is reached.
   MEASURED    (tools/nighttrain-sim.js, release 9 tuning) Base game 96.22% over 100,000,000 spins (two seeds of 50M:
               96.10% / 96.35%; lines 59.29%, bonus 36.94%). Hit rate 1 in 1.52 (a win of at least the stake 1 in 5),
               Respin Bonus 1 in 136, average bonus 50.1x, sd 12.7x. Max win reached 2 times in 100M spins (about
               1 in 50,000,000); 1,000x+ about 1 in 147,000. Bonus buy at 55x: 96.20% over 4,000,000 buys, average 52.9x,
               max win 1 in 400,000 buys. Tuning from the saved draft (85.6% base, 68.1% buy at 80x, Phantom-driven
               50,000x wins 1 in 100,000 buys): a second Moon Coin on reels 1 and 5, landP 0.05 -> 0.052, more mid-value
               coins, Phantom weights 5/7/7 -> 1/2/4, buy price 80x -> 55x. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).nighttrain = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 4, COLS = 5, BROWS = 6, CELLS = 30, ROW0 = 2;
  const CR = 1000, LINE_CR = 25, MAX_X = 50000, CAP = MAX_X * CR, BUY_X = 55;

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
      [0, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
      [8, 4, 5, 6, 7, 10, 11, 12, 12, 1],
    ],
    /* Moon Coin cash values (credits; 1000 = 1x stake) and their weights */
    coinV: [500, 1000, 2000, 3000, 4000, 5000, 8000, 10000, 15000, 20000, 25000, 50000, 100000, 250000],
    coinW: [2600, 2600, 1700, 1000, 700, 560, 320, 260, 160, 120, 90, 45, 18, 4],
    /* a Moon Coin in the base game is a coin, or rarely a character: [coin, Conductor, Paymaster, Sharpshooter, Necromancer] */
    baseKindW: [960, 10, 14, 12, 4],
    /* bonus: chance that each empty open space lands a symbol on a respin, by how many spaces are filled */
    landP: 0.052,
    /* what lands, by kind (index = kind). Phantoms (6, 7, 8): at most one of each per bonus. */
    kindW: [0, 9200, 160, 180, 160, 70, 1, 2, 4],
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
/* Night Train: presentation only. Every outcome comes from the maths above: practice mode runs it here, online mode
   asks lib/games/nighttrain.php (the same code), which settles the whole round in one request.
   Layout: .nt-bg (sky, moon, scrolling gothic countryside, telegraph poles, fog, bats) | .nt-main = head (title or the
   bonus HUD), the carriage window (.nt-frame: reels, or the 5x6 respin board), message bar, controls. */
(function () {
  'use strict';
  const B = Batty, h = B.h, M = BattyMath.nighttrain, ID = 'nighttrain', fmt = B.fmt;
  const REELS = M.REELS, ROWS = M.ROWS, COLS = M.COLS, BROWS = M.BROWS, CELLN = 6, STEP = 100 / CELLN;
  const K = M.KIND, SY = M.SYM;
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isPh = (k) => k >= K.PCOL;
  const baseK = (k) => (k === K.PCOL ? K.COL : k === K.PPAY ? K.PAY : k === K.PSNP ? K.SNP : k);
  const TAG = ['', '', 'COLLECT', 'PAY', 'SHOOT', 'RAISE', 'PHANTOM', 'PHANTOM', 'PHANTOM'];
  const ROLE = ['', 'Moon Coin', 'Conductor', 'Paymaster', 'Sharpshooter', 'Necromancer', 'Phantom Conductor', 'Phantom Paymaster', 'Phantom Sharpshooter'];
  let G = null;

  /* ---------- sound: whistle, rails, pistols and ghosts, all synthesised ---------- */
  const au = B.audio;
  const SND = {
    spin() { au.noise({ d: 0.45, v: 0.06, lp: 800, f2: 2600 }); },
    stop(i) { au.tone({ f: 165 + i * 12, f2: 58, d: 0.12, type: 'sine', v: 0.3 }); au.noise({ d: 0.035, v: 0.09, hp: 2600 }); au.noise({ d: 0.03, v: 0.06, hp: 3000, t: 0.07 }); },
    whistle() { [587, 740, 880].forEach((f, i) => au.tone({ f, f2: f * 1.012, d: 1.2, type: i ? 'sine' : 'triangle', v: 0.07, a: 0.08 })); au.noise({ d: 1.1, v: 0.03, hp: 4000 }); },
    chug() { for (let i = 0; i < 8; i++) au.noise({ d: 0.11, v: 0.12 - i * 0.012, lp: 520, t: i * 0.15 }); },
    coin() { B.sfx('coin'); },
    land(n) { au.tone({ f: 660 + n * 70, f2: 1320 + n * 90, d: 0.12, type: 'triangle', v: 0.12 }); au.tone({ f: 1980, d: 0.1, type: 'sine', v: 0.05, t: 0.05 }); },
    antic(k) { au.tone({ f: 240 + k * 110, f2: 380 + k * 140, d: 0.6, type: 'sawtooth', v: 0.04 }); },
    win(n) { au.seq(n > 2 ? [392, 494, 587, 784, 587, 784] : [392, 494, 587], { step: 0.07, type: 'triangle', v: 0.16 }); },
    bang() { au.noise({ d: 0.22, v: 0.38, hp: 700, f2: 200 }); au.tone({ f: 160, f2: 40, d: 0.2, type: 'square', v: 0.14 }); },
    pay() { au.seq([1047, 1319, 1568, 2093], { step: 0.045, type: 'square', v: 0.05 }); },
    collect() { au.tone({ f: 300, f2: 1200, d: 0.5, type: 'triangle', v: 0.1 }); au.tone({ f: 450, f2: 1800, d: 0.5, type: 'sine', v: 0.06, t: 0.05 }); },
    necro() { au.tone({ f: 110, f2: 55, d: 1.0, type: 'sawtooth', v: 0.07 }); au.tone({ f: 165, f2: 330, d: 0.9, type: 'sine', v: 0.07, t: 0.2 }); },
    ghost() { au.tone({ f: 520, f2: 780, d: 0.6, type: 'sine', v: 0.06 }); au.tone({ f: 780, f2: 520, d: 0.6, type: 'sine', v: 0.04, t: 0.15 }); },
    chain() { for (let i = 0; i < 5; i++) au.tone({ f: 1400 + i * 260, d: 0.08, type: 'square', v: 0.05, t: i * 0.04 }); au.noise({ d: 0.3, v: 0.2, hp: 1800 }); },
    lamp() { au.tone({ f: 330, f2: 160, d: 0.25, type: 'sine', v: 0.12 }); },
    reset() { au.tone({ f: 880, d: 0.1, type: 'triangle', v: 0.09 }); au.tone({ f: 1175, d: 0.16, type: 'triangle', v: 0.09, t: 0.08 }); },
    tick() { au.tone({ f: 1500, d: 0.02, type: 'square', v: 0.035 }); },
    click() { B.sfx('click'); },
    pop() { B.sfx('pop'); },
    bonus() { B.sfx('bonus'); },
    thunder() { B.sfx('thunder'); },
  };
  const snd = (n, a) => { try { SND[n](a); } catch (e) { /* sound is optional */ } };

  /* ---------- art: hand-built SVG, shared gradients ---------- */
  const DEFS_IN =
    '<linearGradient id="nt-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".35" stop-color="#ffd25a"/><stop offset=".7" stop-color="#d48a12"/><stop offset="1" stop-color="#7a4300"/></linearGradient>' +
    '<radialGradient id="nt-gold2" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".6" stop-color="#e7a92c"/><stop offset="1" stop-color="#9a5c06"/></radialGradient>' +
    '<linearGradient id="nt-iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d5470"/><stop offset=".45" stop-color="#2a2238"/><stop offset="1" stop-color="#120c1c"/></linearGradient>' +
    '<linearGradient id="nt-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a7a"/><stop offset=".5" stop-color="#c0142c"/><stop offset="1" stop-color="#5a0614"/></linearGradient>' +
    '<radialGradient id="nt-lamp" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fff2a8"/><stop offset=".8" stop-color="#ffb21a"/><stop offset="1" stop-color="#b8560a"/></radialGradient>' +
    '<radialGradient id="nt-beam" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd25a" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="nt-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#7a5a9c"/><stop offset=".6" stop-color="#3a2756"/><stop offset="1" stop-color="#1a1028"/></radialGradient>' +
    '<linearGradient id="nt-wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3468"/><stop offset="1" stop-color="#1a0f2a"/></linearGradient>' +
    '<radialGradient id="nt-sack" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#e8c48a"/><stop offset=".6" stop-color="#b1814a"/><stop offset="1" stop-color="#5e3a18"/></radialGradient>' +
    '<radialGradient id="nt-face" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffdf2"/><stop offset=".75" stop-color="#efe3c4"/><stop offset="1" stop-color="#c9b48a"/></radialGradient>' +
    '<linearGradient id="nt-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb0a0" stop-opacity=".9"/><stop offset=".5" stop-color="#e3402a" stop-opacity=".85"/><stop offset="1" stop-color="#7a0e10" stop-opacity=".95"/></linearGradient>' +
    '<radialGradient id="nt-flame" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#fff07a"/><stop offset="1" stop-color="#ff7a10"/></radialGradient>' +
    '<linearGradient id="nt-lA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd0d6"/><stop offset=".45" stop-color="#e2243f"/><stop offset="1" stop-color="#6a0618"/></linearGradient>' +
    '<linearGradient id="nt-lK" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ead8ff"/><stop offset=".45" stop-color="#9a5cf0"/><stop offset="1" stop-color="#3c1478"/></linearGradient>' +
    '<linearGradient id="nt-lQ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4fbff"/><stop offset=".45" stop-color="#2cb8d8"/><stop offset="1" stop-color="#0a4a68"/></linearGradient>' +
    '<linearGradient id="nt-lJ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ffd8"/><stop offset=".45" stop-color="#4cc76a"/><stop offset="1" stop-color="#11552a"/></linearGradient>' +
    '<radialGradient id="nt-dCol" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#b48cff"/><stop offset=".6" stop-color="#5a2aa8"/><stop offset="1" stop-color="#22093f"/></radialGradient>' +
    '<radialGradient id="nt-dPay" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#8affc0"/><stop offset=".6" stop-color="#139a5a"/><stop offset="1" stop-color="#06381f"/></radialGradient>' +
    '<radialGradient id="nt-dSnp" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ff9a8a"/><stop offset=".6" stop-color="#c11a2a"/><stop offset="1" stop-color="#4a0510"/></radialGradient>' +
    '<radialGradient id="nt-dNec" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#d6ff6a"/><stop offset=".55" stop-color="#3f7a12"/><stop offset="1" stop-color="#0b1f05"/></radialGradient>';
  const DEFS = '<svg class="nt-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + DEFS_IN + '</defs></svg>';

  /* the bat head every character shares, then their hats and props */
  const batHead = (eye) =>
    '<path d="M30 50 L24 24 L44 40Z M70 50 L76 24 L56 40Z" fill="url(#nt-fur)" stroke="#0e0716" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M31 46 L28 31 L40 41Z M69 46 L72 31 L60 41Z" fill="#c76a9a" opacity=".55"/>' +
    '<ellipse cx="50" cy="58" rx="22" ry="20" fill="url(#nt-fur)" stroke="#0e0716" stroke-width="2.5"/>' +
    '<g class="nt-eyes"><ellipse cx="42" cy="55" rx="5" ry="5.5" fill="' + eye + '"/><ellipse cx="58" cy="55" rx="5" ry="5.5" fill="' + eye + '"/>' +
    '<circle cx="43" cy="56" r="2.2" fill="#14060c"/><circle cx="59" cy="56" r="2.2" fill="#14060c"/><circle cx="41" cy="53.5" r="1.2" fill="#fff"/><circle cx="57" cy="53.5" r="1.2" fill="#fff"/></g>' +
    '<path d="M46 63 Q50 66 54 63" fill="none" stroke="#14060c" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M44.5 66 l2 5 l2 -5Z M51.5 66 l2 5 l2 -5Z" fill="#fff" stroke="#14060c" stroke-width=".8"/>';
  const SYM_IN = [
    /* 0 Night Train Wild: the locomotive head-on, lamp blazing */
    '<g class="nt-smoke"><circle cx="44" cy="9" r="6" fill="#b7aed0" opacity=".55"/><circle cx="54" cy="5" r="5" fill="#d6d0e6" opacity=".45"/><circle cx="36" cy="4" r="4" fill="#9a90b8" opacity=".4"/></g>' +
    '<path d="M39 13 h22 l-3 14 h-16Z" fill="url(#nt-iron)" stroke="#0b0614" stroke-width="2.5"/><rect x="36" y="11" width="28" height="5" rx="2" fill="url(#nt-gold)" stroke="#3a1a00" stroke-width="1.5"/>' +
    '<path d="M16 34 Q50 20 84 34 L88 76 L12 76Z" fill="url(#nt-iron)" stroke="#0b0614" stroke-width="3"/>' +
    '<path d="M22 36 Q50 26 78 36" fill="none" stroke="#8a80a8" stroke-width="2" opacity=".7"/>' +
    '<circle cx="50" cy="46" r="20" fill="url(#nt-beam)" class="nt-glow"/>' +
    '<circle cx="50" cy="46" r="13.5" fill="url(#nt-lamp)" stroke="url(#nt-gold)" stroke-width="4"/><ellipse cx="45" cy="41" rx="4" ry="2.5" fill="#fff" opacity=".9"/>' +
    '<circle cx="22" cy="44" r="3" fill="url(#nt-gold)"/><circle cx="78" cy="44" r="3" fill="url(#nt-gold)"/>' +
    '<path d="M12 76 L88 76 L74 96 L26 96Z" fill="url(#nt-red)" stroke="#0b0614" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M34 78 L40 95 M50 78 V96 M66 78 L60 95 M22 80 L31 95 M78 80 L69 95" stroke="#3a0410" stroke-width="2.5"/>' +
    '<rect x="6" y="60" width="88" height="19" rx="5" fill="url(#nt-gold)" stroke="#3a1a00" stroke-width="2.5"/>' +
    '<text x="50" y="75.5" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="16" letter-spacing="1" fill="#2a0712">WILD</text>',
    /* 1 Bandit Bat */
    '<path d="M48 60 C34 36 18 40 3 30 C9 44 6 56 12 68 C20 61 29 64 33 72Z M52 60 C66 36 82 40 97 30 C91 44 94 56 88 68 C80 61 71 64 67 72Z" fill="url(#nt-wing)" stroke="#0e0716" stroke-width="2.5" stroke-linejoin="round"/>' +
    batHead('#ffd34a') +
    '<path d="M27 52 Q50 42 73 52 L72 60 Q50 52 28 60Z" fill="#120a18" stroke="#000" stroke-width="1.5"/><ellipse cx="42" cy="55" rx="4.5" ry="3.4" fill="#ffd34a"/><ellipse cx="58" cy="55" rx="4.5" ry="3.4" fill="#ffd34a"/><circle cx="43" cy="55.5" r="1.8" fill="#14060c"/><circle cx="59" cy="55.5" r="1.8" fill="#14060c"/>' +
    '<path d="M22 36 Q50 26 78 36 L74 42 Q50 35 26 42Z" fill="#1c1226" stroke="#000" stroke-width="2"/><path d="M34 36 Q36 14 50 14 Q64 14 66 36Z" fill="#2c1c3a" stroke="#000" stroke-width="2"/><path d="M35 31 Q50 27 65 31 L65 35 Q50 31 35 35Z" fill="#c0142c"/>' +
    '<path d="M32 74 Q50 84 68 74 L62 90 L50 82 L38 90Z" fill="url(#nt-red)" stroke="#3a0410" stroke-width="2" stroke-linejoin="round"/>',
    /* 2 Loot Sack */
    '<path d="M30 42 Q16 62 22 84 Q50 98 78 84 Q84 62 70 42Z" fill="url(#nt-sack)" stroke="#3a2210" stroke-width="3"/>' +
    '<path d="M36 42 Q34 30 40 24 Q50 30 60 24 Q66 30 64 42Z" fill="url(#nt-sack)" stroke="#3a2210" stroke-width="3"/>' +
    '<path d="M32 42 Q50 49 68 42" fill="none" stroke="#d9a441" stroke-width="5" stroke-linecap="round"/><path d="M32 42 Q50 49 68 42" fill="none" stroke="#7a4a10" stroke-width="1.5" stroke-dasharray="3 3"/>' +
    '<path d="M57 56 a14 14 0 1 0 0 24 a10.5 10.5 0 1 1 0 -24Z" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="1.5"/>' +
    '<path d="M28 66 Q30 78 38 86" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>' +
    '<g class="nt-coins"><ellipse cx="18" cy="88" rx="10" ry="5.5" fill="url(#nt-gold)" stroke="#6a3c00" stroke-width="1.5"/><ellipse cx="82" cy="90" rx="9" ry="5" fill="url(#nt-gold)" stroke="#6a3c00" stroke-width="1.5"/><ellipse cx="88" cy="83" rx="7" ry="4" fill="url(#nt-gold)" stroke="#6a3c00" stroke-width="1.5"/></g>' +
    '<path class="nt-spark" d="M80 30 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2Z" fill="#fff8d0"/>',
    /* 3 Pocket Watch */
    '<path d="M50 4 Q30 4 28 20" fill="none" stroke="url(#nt-gold)" stroke-width="2.5" stroke-dasharray="4 2"/>' +
    '<circle cx="50" cy="13" r="6" fill="none" stroke="url(#nt-gold)" stroke-width="3.5"/><rect x="44.5" y="17" width="11" height="8" rx="2" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="1.5"/>' +
    '<circle cx="50" cy="59" r="35" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="3"/><circle cx="50" cy="59" r="28" fill="url(#nt-face)" stroke="#7a4a00" stroke-width="1.5"/>' +
    Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = i % 3 ? 24 : 21, r2 = 26; return '<line x1="' + (50 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (59 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (50 + Math.sin(a) * r2).toFixed(1) + '" y2="' + (59 - Math.cos(a) * r2).toFixed(1) + '" stroke="#2a1a10" stroke-width="' + (i % 3 ? 1.5 : 3) + '"/>'; }).join('') +
    '<path d="M42 70 a9 9 0 1 0 0 -1" fill="none" stroke="#c9b48a" stroke-width="1.2"/>' +
    '<g class="nt-hand"><path d="M50 59 L50 38" stroke="#1a0f20" stroke-width="3" stroke-linecap="round"/></g><path d="M50 59 L63 66" stroke="#1a0f20" stroke-width="3.5" stroke-linecap="round"/><circle cx="50" cy="59" r="3.2" fill="#b0122a"/>' +
    '<path d="M27 46 A28 28 0 0 1 44 32" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>',
    /* 4 Lantern */
    '<path d="M36 22 Q50 2 64 22" fill="none" stroke="#2a2230" stroke-width="5" stroke-linecap="round"/><path d="M36 22 Q50 2 64 22" fill="none" stroke="#8a80a8" stroke-width="1.5"/>' +
    '<path d="M28 27 L72 27 L64 17 L36 17Z" fill="url(#nt-iron)" stroke="#0b0614" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<circle cx="50" cy="50" r="30" fill="url(#nt-beam)" class="nt-glow"/>' +
    '<rect x="31" y="27" width="38" height="46" rx="7" fill="url(#nt-glass)" stroke="#2a2230" stroke-width="3"/>' +
    '<g class="nt-flame"><path d="M50 36 C59 48 59 59 50 65 C41 59 41 48 50 36Z" fill="url(#nt-flame)"/></g>' +
    '<path d="M41 27 V73 M59 27 V73 M31 50 H69" stroke="#2a2230" stroke-width="3"/>' +
    '<path d="M35 31 V48" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M26 73 L74 73 L79 86 L21 86Z" fill="url(#nt-iron)" stroke="#0b0614" stroke-width="2.5" stroke-linejoin="round"/><rect x="24" y="86" width="52" height="6" rx="2" fill="url(#nt-gold)" stroke="#3a1a00" stroke-width="1.5"/>',
  ];
  const letter = (ch, g) => '<text x="50" y="77" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="74" fill="url(#' + g + ')" stroke="#12051a" stroke-width="5" paint-order="stroke" stroke-linejoin="round">' + ch + '</text>';
  SYM_IN.push(letter('A', 'nt-lA'), letter('K', 'nt-lK'), letter('Q', 'nt-lQ'), letter('J', 'nt-lJ'));
  /* 9 Moon Coin */
  const COIN_IN =
    '<circle cx="50" cy="50" r="42" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="3"/>' +
    '<circle cx="50" cy="50" r="38" fill="none" stroke="#fff1a8" stroke-width="2" stroke-dasharray="1.5 4"/>' +
    '<circle cx="50" cy="50" r="32" fill="url(#nt-gold2)" stroke="#9a5c06" stroke-width="2"/>' +
    '<path d="M57 26 a24 24 0 1 0 0 48 a18.5 18.5 0 1 1 0 -48Z" fill="#fff6d0" stroke="#b5760c" stroke-width="1.5"/>' +
    '<path d="M66 36 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6Z" fill="#fff"/>' +
    '<path d="M24 36 A30 30 0 0 1 40 20" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>';
  SYM_IN.push(COIN_IN);
  const SYM_KEY = M.SYMBOLS;
  const symSvg = (i) => '<svg class="nt-sym nt-s-' + SYM_KEY[i] + '" viewBox="0 0 100 100" aria-hidden="true">' + SYM_IN[i] + '</svg>';

  /* board characters: a coloured medal with the character's head */
  const DISC = (g) => '<circle cx="50" cy="52" r="44" fill="url(#' + g + ')" stroke="url(#nt-gold)" stroke-width="5"/><circle cx="50" cy="52" r="38" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>';
  const TOK_IN = {
    [K.COL]: DISC('nt-dCol') + batHead('#ffe066') +
      '<path d="M26 40 Q50 22 74 40 L74 44 L26 44Z" fill="#1b1f4a" stroke="#000" stroke-width="2"/><path d="M22 44 Q50 40 78 44 Q72 50 50 48 Q28 50 22 44Z" fill="#0d1030" stroke="#000" stroke-width="1.5"/><rect x="45" y="30" width="10" height="8" rx="2" fill="url(#nt-gold)"/>' +
      '<path d="M62 74 h14 l3 4 h-17Z" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="1.2"/>',
    [K.PAY]: DISC('nt-dPay') + batHead('#9dffcf') +
      '<path d="M24 40 Q50 34 76 40 L74 45 Q50 40 26 45Z" fill="#111" stroke="#000" stroke-width="1.5"/><rect x="34" y="12" width="32" height="28" rx="3" fill="#161018" stroke="#000" stroke-width="2"/><rect x="34" y="31" width="32" height="5" fill="#139a5a"/>' +
      '<circle cx="58" cy="55" r="7" fill="none" stroke="url(#nt-gold)" stroke-width="2"/><path d="M65 57 Q70 66 66 76" fill="none" stroke="url(#nt-gold)" stroke-width="1.2"/>' +
      '<ellipse cx="74" cy="80" rx="9" ry="5" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="1.2"/><ellipse cx="74" cy="76" rx="9" ry="5" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="1.2"/>',
    [K.SNP]: DISC('nt-dSnp') +
      '<g class="nt-ret"><circle cx="50" cy="56" r="30" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><path d="M50 22 V34 M50 78 V90 M16 56 H28 M72 56 H84" stroke="#fff" stroke-opacity=".5" stroke-width="2.5"/></g>' +
      batHead('#ffb84a') +
      '<path d="M14 40 Q50 30 86 40 Q80 46 50 42 Q20 46 14 40Z" fill="#4a2a14" stroke="#000" stroke-width="2"/><path d="M32 40 Q34 20 50 20 Q66 20 68 40Z" fill="#6a3c1c" stroke="#000" stroke-width="2"/><path d="M33 35 Q50 31 67 35 L67 39 Q50 35 33 39Z" fill="#2a1408"/>' +
      '<path d="M34 72 Q50 80 66 72 L60 84 L50 79 L40 84Z" fill="#c0142c" stroke="#3a0410" stroke-width="1.5"/>',
    [K.NEC]: DISC('nt-dNec') +
      '<path d="M18 92 Q20 40 50 18 Q80 40 82 92Z" fill="#0d0a10" stroke="#000" stroke-width="2"/>' +
      '<ellipse cx="50" cy="60" rx="18" ry="19" fill="#d9d4c4" stroke="#14060c" stroke-width="2"/>' +
      '<g class="nt-eyes"><ellipse cx="43" cy="57" rx="5" ry="6" fill="#0b0f05"/><ellipse cx="57" cy="57" rx="5" ry="6" fill="#0b0f05"/><circle cx="43" cy="58" r="2.4" fill="#b6ff3a"/><circle cx="57" cy="58" r="2.4" fill="#b6ff3a"/></g>' +
      '<path d="M48 66 L50 70 L52 66Z" fill="#14060c"/><path d="M42 73 h16 M44 71 v4 M48 71 v4 M52 71 v4 M56 71 v4" stroke="#14060c" stroke-width="1.5"/>' +
      '<path d="M20 92 Q24 56 32 44" fill="none" stroke="#b6ff3a" stroke-opacity=".35" stroke-width="2"/><path d="M80 92 Q76 56 68 44" fill="none" stroke="#b6ff3a" stroke-opacity=".35" stroke-width="2"/>',
  };
  const tokSvg = (k) => {
    if (k === K.COIN) return '<svg class="nt-tok" viewBox="0 0 100 100" aria-hidden="true">' + COIN_IN + '</svg>';
    return '<svg class="nt-tok" viewBox="0 0 100 100" aria-hidden="true">' + TOK_IN[baseK(k)] + '</svg>';
  };

  /* the lobby poster */
  const POSTER = '<svg viewBox="0 0 300 380" xmlns="http://www.w3.org/2000/svg"><defs>' + DEFS_IN +
    '<linearGradient id="ntp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05030f"/><stop offset=".6" stop-color="#2a1048"/><stop offset="1" stop-color="#5a1a4a"/></linearGradient>' +
    '<radialGradient id="ntp-moon" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffbe8"/><stop offset=".7" stop-color="#f0deb0"/><stop offset="1" stop-color="#c8a878"/></radialGradient></defs>' +
    '<rect width="300" height="380" fill="url(#ntp-sky)"/>' +
    Array.from({ length: 40 }, (_, i) => '<circle cx="' + ((i * 73) % 300) + '" cy="' + ((i * 37) % 200) + '" r="' + (i % 4 ? 0.8 : 1.5) + '" fill="#fff" opacity="' + (0.4 + (i % 3) * 0.2) + '"/>').join('') +
    '<circle cx="200" cy="110" r="70" fill="#ffe9b0" opacity=".12"/><circle cx="200" cy="110" r="52" fill="url(#ntp-moon)"/><circle cx="185" cy="98" r="8" fill="#d6c090" opacity=".5"/><circle cx="215" cy="125" r="11" fill="#d6c090" opacity=".4"/>' +
    '<path d="M0 250 L30 222 L52 236 L70 200 L84 214 L92 180 L100 214 L120 196 L150 230 L182 206 L210 232 L246 198 L270 220 L300 205 V300 H0Z" fill="#1a0b2a"/>' +
    '<path d="M70 200 V160 L76 150 L82 160 V200 M92 180 V140 L100 122 L108 140 V200" fill="#1a0b2a"/>' +
    '<path d="M0 262 H300 V280 H0Z" fill="#120720"/>' + Array.from({ length: 8 }, (_, i) => '<path d="M' + (i * 40 + 6) + ' 280 Q' + (i * 40 + 26) + ' 240 ' + (i * 40 + 46) + ' 280Z" fill="#05030f"/>').join('') +
    '<g transform="translate(36 214)"><rect x="0" y="12" width="92" height="30" rx="5" fill="#120a1c" stroke="#ffd25a" stroke-width="1.5"/><rect x="8" y="18" width="14" height="12" fill="#ffcf5a"/><rect x="28" y="18" width="14" height="12" fill="#ffcf5a"/><rect x="48" y="18" width="14" height="12" fill="#ffcf5a"/><rect x="68" y="18" width="14" height="12" fill="#ffcf5a"/>' +
    '<rect x="100" y="8" width="70" height="34" rx="6" fill="#1c1228" stroke="#ffd25a" stroke-width="1.5"/><rect x="150" y="-4" width="12" height="14" fill="#1c1228"/><circle cx="172" cy="24" r="7" fill="#fff2a8"/><path d="M178 24 L300 6 L300 46Z" fill="#fff2a8" opacity=".25"/>' +
    '<circle cx="155" cy="-14" r="8" fill="#a99fc2" opacity=".5"/><circle cx="140" cy="-26" r="11" fill="#a99fc2" opacity=".35"/></g>' +
    '<g transform="translate(150 316)"><text text-anchor="middle" y="0" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="40" fill="url(#nt-gold)" stroke="#2a0712" stroke-width="3" paint-order="stroke">NIGHT</text>' +
    '<text text-anchor="middle" y="40" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="40" fill="url(#nt-gold)" stroke="#2a0712" stroke-width="3" paint-order="stroke">TRAIN</text></g>' +
    '<g transform="translate(52 64) scale(.9)"><circle cx="0" cy="0" r="24" fill="url(#nt-gold)" stroke="#5a3400" stroke-width="2"/><path d="M5 -14 a14 14 0 1 0 0 28 a11 11 0 1 1 0 -28Z" fill="#fff6d0"/></g></svg>';

  /* ---------- the scrolling countryside, generated once ---------- */
  function rnd32(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function farLayer() {
    const r = rnd32(7); let d = 'M0 300 L0 170';
    for (let x = 0; x <= 1600; x += 40) d += ' L' + x + ' ' + (150 + r() * 70 - (x % 400 < 200 ? 30 : 0)).toFixed(0);
    d += ' L1600 300Z';
    /* a ruined castle on the ridge, twice so the loop is seamless */
    const castle = (x) => '<path d="M' + x + ' 180 v-50 h10 v-8 h6 v8 h8 v-8 h6 v8 h10 v50Z M' + (x + 14) + ' 122 v-30 l8 -16 l8 16 v30Z M' + (x + 44) + ' 180 v-36 h8 v-6 h5 v6 h8 v36Z M' + (x - 22) + ' 180 v-26 l11 -18 l11 18 v26Z" fill="#1d0f33"/><rect x="' + (x + 19) + '" y="100" width="4" height="7" fill="#ffcf5a" opacity=".8"/><rect x="' + (x + 6) + '" y="140" width="3" height="5" fill="#ffcf5a" opacity=".6"/>';
    return '<svg viewBox="0 0 1600 300" preserveAspectRatio="none"><path d="' + d + '" fill="#1d0f33"/>' + castle(420) + castle(1220) + '</svg>';
  }
  function midLayer() {
    const r = rnd32(23); let s = '';
    for (let x = -10; x < 1600; x += 18 + r() * 22) {
      const hgt = 50 + r() * 70, w = hgt * 0.36;
      if (r() < 0.12) s += '<path d="M' + x.toFixed(0) + ' 300 v-' + (hgt * 0.5).toFixed(0) + ' h-7 v-6 h7 v-8 h5 v8 h7 v6 h-7 v' + (hgt * 0.5 + 6).toFixed(0) + 'Z" fill="#0f0820"/>';
      else s += '<path d="M' + (x - w).toFixed(0) + ' 300 L' + x.toFixed(0) + ' ' + (300 - hgt).toFixed(0) + ' L' + (x + w).toFixed(0) + ' 300Z" fill="#0f0820"/>';
    }
    return '<svg viewBox="0 0 1600 300" preserveAspectRatio="none"><rect y="270" width="1600" height="30" fill="#0f0820"/>' + s + '</svg>';
  }
  function nearLayer() {
    let s = '';
    for (let x = 100; x < 1600; x += 400) s += '<path d="M' + x + ' 300 V40 M' + (x - 26) + ' 60 H' + (x + 26) + ' M' + (x - 20) + ' 80 H' + (x + 20) + '" stroke="#06030c" stroke-width="7"/><circle cx="' + (x - 22) + '" cy="56" r="3" fill="#06030c"/><circle cx="' + (x + 22) + '" cy="56" r="3" fill="#06030c"/>';
    s += '<path d="M0 62 Q200 92 400 62 T800 62 T1200 62 T1600 62" fill="none" stroke="#06030c" stroke-width="1.5"/><path d="M0 82 Q200 108 400 82 T800 82 T1200 82 T1600 82" fill="none" stroke="#06030c" stroke-width="1.5"/>';
    return '<svg viewBox="0 0 1600 300" preserveAspectRatio="none">' + s + '</svg>';
  }
  const BATP = 'M60 22 C52 10 40 8 28 12 C34 16 36 20 34 26 C26 22 16 24 8 30 C22 30 30 34 36 40 C44 34 52 32 60 34 C68 32 76 34 84 40 C90 34 98 30 112 30 C104 24 94 22 86 26 C84 20 86 16 92 12 C80 8 68 10 60 22Z';

  /* ---------- rules ---------- */
  function rules() {
    const pay = M.PAY, nm = M.SYMBOL_NAMES;
    const lines = M.LINES.map((l, i) => '<svg viewBox="0 0 100 80" aria-label="Line ' + (i + 1) + '"><rect width="100" height="80" rx="6" fill="#1d1033"/><polyline points="' + l.map((r, c) => (10 + c * 20) + ',' + (10 + r * 20)).join(' ') + '" fill="none" stroke="#ffd25a" stroke-width="3.5" stroke-linejoin="round"/><text x="5" y="77" fill="#fff" font-size="10">' + (i + 1) + '</text></svg>').join('');
    const x = (c) => { const v = c / M.CR; return (v >= 1 ? +v.toFixed(2) : +v.toFixed(3)) + '×'; };
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => '<tr><td>' + nm[i] + '</td>' + pay[i].map((c) => '<td>' + x(c) + '</td>').join('') + '</tr>').join('');
    const coinMax = Math.max.apply(null, M.CFG.coinV) / M.CR;
    return '<div class="nt-rules">' +
      '<p><b>Night Train</b> is an original Batty Bucks hold-and-win slot. All aboard the midnight express: every character, picture and number here is our own.</p>' +
      '<h3>The reels</h3><p>5 reels, 4 rows and 40 fixed lines, all included in the stake. Three or more matching symbols in a row from reel 1 pay; only the best win on each line counts. The <b>Night Train Wild</b> lands on reels 2 to 5 and stands in for every pay symbol. Line wins are shown below as multiples of your total stake.</p>' +
      '<h3>Moon Coins</h3><p>A <b>Moon Coin</b> can land anywhere carrying a cash prize from 0.5× to ' + fmt(coinMax) + '× your stake, or now and then one of the characters below. Coins only pay in the Respin Bonus.</p>' +
      '<h3>The Night Train Respin Bonus</h3><p>Land <b>3 or more Moon Coins</b> anywhere. They board a 5 × 6 carriage with their values; the bottom 4 rows are open and the top 2 are chained shut. You get <b>3 respins</b>, and every respin that lands anything resets them to 3. Fill ' + M.CFG.unlock[0] + ' spaces to break the chains on row 5, and ' + M.CFG.unlock[1] + ' for row 6. When the respins run out, or the carriage is full, every value on board is paid.</p>' +
      '<h3>The characters</h3><p>When a character boards, it acts once, in this order:</p><ul>' +
      '<li><b>Paymaster.</b> Adds its own value to every other symbol on board.</li>' +
      '<li><b>Sharpshooter.</b> Doubles 2 to 5 random symbols.</li>' +
      '<li><b>Conductor.</b> Collects every other value on board and adds it to itself (the others keep theirs).</li>' +
      '<li><b>Necromancer.</b> Raises 1 to 3 Paymasters, Sharpshooters or Conductors already used, who act again. With nobody to raise, it triples its own value.</li>' +
      '<li><b>Phantoms.</b> Very rarely a Phantom Paymaster, Sharpshooter or Conductor boards (at most one of each per bonus). Phantoms act when they board and then <b>again after every respin</b>. A Phantom Sharpshooter never doubles the same symbol twice, and Sharpshooters never shoot Phantoms.</li></ul>' +
      '<h3>Bonus buy</h3><p>Buy straight into the Respin Bonus for <b>' + M.BUY_X + '× your stake</b>, starting with 3, 4 or 5 Moon Coins. Batty Bucks only, no guaranteed return: a bought bonus can pay less than its price.</p>' +
      '<p>The whole round is capped at <b>' + fmt(M.MAX_X) + '× your stake</b>; the round ends the moment it is reached.</p>' +
      '<h3>Paytable</h3><p>Multiples of your <b>total stake</b>, per winning line, for 3, 4 and 5 in a row.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>' + rows + '</table>' +
      '<details><summary>View all 40 paylines</summary><div class="nt-lines">' + lines + '</div></details>' +
      '<div class="rtp"><b>Tested return</b> 96.2% for the base game (100,000,000 simulated spins: hit rate 1 in 1.5, a win of at least your stake 1 in 5, the Respin Bonus 1 in 136, and the ' + fmt(M.MAX_X) + '× maximum reached about once in 50,000,000 spins) and 96.2% for the bonus buy (4,000,000 simulated buys). Rounds are drawn on the server with a secure random generator and settle in one go. Space spins; a tap or Space during a spin stops the reels at once, and skips ahead in the bonus.</div>' +
      '<p>Batty Bucks are play money. They have no cash value and cannot be bought, sold or cashed out.</p></div>';
  }

  /* ---------- symbol html caches (resting, and motion-blurred for spinning) ---------- */
  const REST = [], BLUR = [];
  function prepSyms() {
    if (REST.length) return;
    for (let i = 0; i < M.NSYM; i++) {
      REST[i] = symSvg(i);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>' + DEFS_IN + '<filter id="b" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="0 7"/></filter></defs><g filter="url(#b)" opacity=".92">' + SYM_IN[i] + '</g></svg>';
      BLUR[i] = '<img class="nt-blur" alt="" draggable="false" src="data:image/svg+xml,' + encodeURIComponent(svg) + '">';
    }
  }
  const strip0 = M.STRIPS[1];
  const rndSym = () => strip0[(Math.random() * strip0.length) | 0];

  /* ---------- the mounted game ---------- */
  function mount(root) {
    prepSyms();
    const S = B.scope();
    G = { S };
    const el = {};
    let stakeCtl, reels = [], busy = false, spinning = false, auto = 0, turbo = false, skip = false;
    let cycleTok = 0, primary = null, curStake = B.STAKES[0], roundCost = 0, devNext = null, anticOn = [];
    let DEV = false;
    try { DEV = !B.online && localStorage.getItem('batty-dev') === '1'; } catch (e) { DEV = false; }
    const T = (ms) => ms * (skip ? 0.15 : turbo ? 0.5 : 1) * (RM ? 0.7 : 1);
    const nap = (ms) => S.sleep(Math.max(16, T(ms)));
    const setMsg = (t, cls) => { el.msg.textContent = t; el.msg.className = 'nt-msg' + (cls ? ' ' + cls : ''); };
    const money = (cr) => Math.floor(cr * curStake / M.CR);
    const short = (n) => (n < 100000 ? fmt(n) : n < 1e6 ? Math.round(n / 1000) + 'K' : (n / 1e6).toFixed(n < 1e7 ? 2 : 1).replace(/\.?0+$/, '') + 'M');
    const lineBB = (cr) => { const v = cr * curStake / M.CR; return Number.isInteger(v) ? fmt(v) : v.toFixed(1); };
    const pieceHtml = (k, v) => '<div class="nt-pc k' + baseK(k) + (isPh(k) ? ' ph' : '') + '">' + tokSvg(k) + (k !== K.COIN ? '<i class="nt-tag">' + TAG[k] + '</i>' : '') + '<b class="nt-val">' + (v ? short(money(v)) : '') + '</b></div>';

    /* ----- build the world ----- */
    root.classList.add('nt');
    root.innerHTML = DEFS;
    const moon = '<svg viewBox="0 0 200 200"><defs><radialGradient id="nt-mn" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#fffdf0"/><stop offset=".65" stop-color="#f1e2bc"/><stop offset="1" stop-color="#b8a0c8"/></radialGradient><radialGradient id="nt-mg" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#ffe9b0" stop-opacity=".32"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="100" cy="100" r="100" fill="url(#nt-mg)"/><circle cx="100" cy="100" r="46" fill="url(#nt-mn)"/><circle cx="86" cy="86" r="8" fill="#d8c69c" opacity=".55"/><circle cx="114" cy="110" r="11" fill="#d8c69c" opacity=".45"/><circle cx="96" cy="122" r="5" fill="#d8c69c" opacity=".5"/><circle cx="118" cy="80" r="4" fill="#d8c69c" opacity=".5"/></svg>';
    el.bg = h('div', { class: 'nt-bg', 'aria-hidden': 'true', html:
      '<div class="nt-stars"></div><div class="nt-moon">' + moon + '</div>' +
      '<div class="nt-far"><div class="nt-track">' + farLayer() + farLayer() + '</div></div>' +
      '<div class="nt-mist"></div>' +
      '<div class="nt-midl"><div class="nt-track">' + midLayer() + midLayer() + '</div></div>' +
      '<div class="nt-near"><div class="nt-track">' + nearLayer() + nearLayer() + '</div></div>' +
      '<div class="nt-fog"></div>' +
      '<div class="nt-bats">' + [0, 1, 2].map((i) => '<i style="--i:' + i + '"><svg viewBox="0 0 120 44"><path d="' + BATP + '" fill="#07040f"/></svg></i>').join('') + '</div>' +
      '<div class="nt-flash"></div>' });
    el.flash = el.bg.querySelector('.nt-flash');
    el.title = h('div', { class: 'nt-title' }, h('b', null, 'NIGHT TRAIN'), h('span', null, '40 lines · hold & win respins · up to ' + fmt(M.MAX_X) + '×'));
    /* the bonus HUD */
    el.lamps = h('div', { class: 'nt-lamps' }, h('i'), h('i'), h('i'));
    el.hudTotal = h('output', null, '0');
    el.fillBar = h('i'); el.fillTxt = h('span', null, '');
    el.skipBtn = h('button', { class: 'nt-skip', type: 'button', 'aria-label': 'Fast forward the bonus', onclick: () => { skip = true; snd('click'); el.skipBtn.hidden = true; } }, 'SKIP ▸▸');
    el.hud = h('div', { class: 'nt-hud', hidden: true },
      h('div', { class: 'nt-hud-c' }, h('small', null, 'RESPINS'), el.lamps),
      h('div', { class: 'nt-hud-c m' }, h('small', null, 'ON BOARD · BB'), el.hudTotal),
      h('div', { class: 'nt-hud-c' }, h('small', null, 'NEXT ROW'), h('div', { class: 'nt-fill' }, el.fillBar, el.fillTxt)),
      el.skipBtn);
    /* the reels */
    el.reels = h('div', { class: 'nt-reels' });
    for (let i = 0; i < REELS; i++) {
      const strip = h('div', { class: 'nt-strip' }), reel = h('div', { class: 'nt-reel' }, strip);
      const r = { i, el: reel, strip, off: 0, mode: 'idle', queue: null, stopAt: 0, v: 0, t: 0, fin: null, coins: null, done: null };
      for (let k = 0; k < CELLN; k++) { const c = h('div', { class: 'nt-cell' }); c.innerHTML = REST[rndSym()]; strip.append(c); }
      reels.push(r); el.reels.append(reel);
    }
    el.lines = h('div', { class: 'nt-lines-layer', 'aria-hidden': 'true' });
    /* the respin board: 5 x 6, the top two rows in chains */
    el.board = h('div', { class: 'nt-board', hidden: true, 'aria-label': 'Respin board' });
    el.bcells = [];
    for (let c = 0; c < M.CELLS; c++) { const x = h('div', { class: 'nt-bc', 'data-c': c }); el.bcells.push(x); el.board.append(x); }
    el.chains = [0, 1].map((row) => { const ch = h('div', { class: 'nt-chain', style: { top: (row * 100 / BROWS) + '%' } }, h('span', null, 'FILL ' + M.CFG.unlock[1 - row] + ' TO OPEN')); el.board.append(ch); return ch; });
    el.pops = h('div', { class: 'nt-pops', 'aria-hidden': 'true' });
    el.board.append(el.pops);
    el.fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.fx.setAttribute('class', 'nt-fx'); el.fx.setAttribute('viewBox', '0 0 500 600'); el.fx.setAttribute('preserveAspectRatio', 'none'); el.fx.setAttribute('aria-hidden', 'true');
    el.board.append(el.fx);
    el.banner = h('div', { class: 'nt-banner', hidden: true, 'aria-hidden': 'true' });
    el.frame = h('div', { class: 'nt-frame' }, h('div', { class: 'nt-plaque', 'aria-hidden': 'true' }, 'NIGHT TRAIN'), el.reels, el.lines, el.board, el.banner,
      h('i', { class: 'nt-rv tl' }), h('i', { class: 'nt-rv tr' }), h('i', { class: 'nt-rv bl' }), h('i', { class: 'nt-rv br' }));
    el.box = h('div', { class: 'nt-box' }, el.frame);
    /* controls */
    el.msg = h('div', { class: 'nt-msg', role: 'status', 'aria-live': 'polite' }, 'Land 3 or more Moon Coins to board the Respin Bonus.');
    el.win = h('output', null, '0');
    el.winbox = h('div', { class: 'nt-winbox' }, h('small', null, 'WIN'), el.win);
    el.stakeBox = h('div', { class: 'nt-stakebox' });
    el.spin = h('button', { class: 'nt-spin', type: 'button', 'aria-label': 'Spin', id: 'nt-spin', onclick: () => onSpin(), html: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="go" d="M24 8a16 16 0 1 1-11.3 4.7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path class="go" d="M8 6v10h10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect class="st" x="15" y="15" width="18" height="18" rx="3" fill="currentColor"/></svg>' });
    el.buy = h('button', { class: 'nt-btn gold', type: 'button', id: 'nt-buy', onclick: () => openBuy() }, h('small', null, 'BUY'), 'BONUS');
    el.turbo = h('button', { class: 'nt-btn', type: 'button', id: 'nt-turbo', 'aria-pressed': 'false', onclick: () => { turbo = !turbo; el.turbo.setAttribute('aria-pressed', turbo); el.turbo.classList.toggle('on', turbo); el.turbo.lastChild.textContent = turbo ? 'ON' : 'OFF'; snd('click'); } }, h('small', null, 'TURBO'), 'OFF');
    el.auto = h('button', { class: 'nt-btn', type: 'button', id: 'nt-auto', onclick: () => onAuto() }, h('small', null, 'AUTO'), 'OFF');
    el.autoMenu = h('div', { class: 'nt-automenu', hidden: true }, ...[10, 25, 50, 100].map((n) => h('button', { type: 'button', onclick: () => { el.autoMenu.hidden = true; startAuto(n); } }, String(n))));
    el.ctl = h('div', { class: 'nt-ctl' }, el.stakeBox, el.buy, el.winbox, el.spin, el.turbo, h('div', { class: 'nt-autowrap' }, el.auto, el.autoMenu));
    el.ov = h('div', { class: 'nt-ov', hidden: true });
    el.main = h('div', { class: 'nt-main' }, h('div', { class: 'nt-head' }, el.title, el.hud), el.box, el.msg, el.ctl);
    root.append(el.bg, el.main, el.ov);
    stakeCtl = B.ui.stake(el.stakeBox, { id: ID, label: 'Stake · BB' });
    curStake = stakeCtl.value;
    const paintAuto = () => { el.auto.lastChild.textContent = auto > 0 ? String(auto) : 'OFF'; el.auto.classList.toggle('on', auto !== 0); };
    requestAnimationFrame(() => root.classList.add('open'));
    S.timeout(() => snd('whistle'), 450);
    S.on(el.board, 'click', () => { if (G && G.bonusOn && !skip) { skip = true; el.skipBtn.hidden = true; } });
    if (DEV) {
      const until = (pred) => { devNext = pred; B.ui.toast('Dev: next spin forced'); };
      window.ntDev = { bonus: () => until((o) => !!o.bonus), phantom: () => until((o) => o.bonus && o.bonus.board.some((s) => isPh(s.k))), unlock: () => until((o) => o.bonus && o.bonus.open === BROWS), big: () => until((o) => o.totalWin >= 40 * M.CR), lines: () => until((o) => o.lines.length >= 3), antic: () => until((o) => !o.bonus && o.coins.length === 2 && o.coins.every((c) => c.r < 3)) };
    }

    /* ----- keyboard ----- */
    S.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (document.querySelector('.bc-veil, .bc-win')) return;
      e.preventDefault(); if (e.repeat) return;
      if (primary) primary(); else onSpin();
    });

    /* ===================== reels ===================== */
    const cellAt = (c, row) => reels[c].strip.children[row + 1];
    const setStrip = (r) => { r.strip.style.transform = 'translate3d(0,' + ((r.off - 1) * STEP).toFixed(3) + '%,0)'; };
    function shift(r) {
      const c = r.strip.lastElementChild; r.strip.prepend(c);
      if (r.mode === 'stopping') {
        const q = r.queue.shift();
        c.className = 'nt-cell' + (q.coin ? ' coin' : '');
        c.innerHTML = q.coin ? pieceHtml(q.coin.k, q.coin.v) : REST[q.s];
        if (!r.queue.length) landed(r);
      } else { c.className = 'nt-cell'; c.innerHTML = RM ? REST[rndSym()] : BLUR[rndSym()]; }
    }
    function landed(r) {
      r.mode = 'settle'; r.off = 0; setStrip(r); r.el.classList.remove('spinning', 'antic');
      snd('stop', r.i);
      if (!RM) r.strip.animate([{ transform: 'translate3d(0,' + (-STEP * 0.8).toFixed(3) + '%,0)' }, { transform: 'translate3d(0,' + (-STEP).toFixed(3) + '%,0)' }], { duration: T(320), easing: 'cubic-bezier(.22,1.7,.45,1)' });
      r.el.classList.add('thud'); S.timeout(() => r.el.classList.remove('thud'), 260);
      if (r.coins && r.coins.some(Boolean)) { r.el.classList.add('bon'); S.timeout(() => r.el.classList.remove('bon'), 800); snd('land', r.i); }
      const nx = reels[r.i + 1];
      if (nx && anticOn[nx.i] && nx.mode === 'spin') {
        nx.el.classList.add('antic'); el.frame.classList.add('antic');
        snd('antic', nx.i); setMsg('One more Moon Coin…', 'gold');
      } else if (!nx || !anticOn[nx.i]) el.frame.classList.remove('antic');
      S.timeout(() => { r.mode = 'idle'; if (r.done) { const d = r.done; r.done = null; d(); } }, T(280));
    }
    function frame(dt) {
      const now = performance.now();
      for (const r of reels) {
        if (r.mode !== 'spin' && r.mode !== 'stopping') continue;
        if (r.mode === 'spin' && r.stopAt && now >= r.stopAt) {
          r.mode = 'stopping';
          r.queue = [3, 2, 1, 0].map((w) => ({ s: r.fin[w], coin: r.coins ? r.coins[w] : null })).concat([{ s: rndSym(), coin: null }]);
        }
        r.t += dt;
        const vmax = (turbo || skip ? 32 : 22) * (RM ? 0.6 : 1) * (r.el.classList.contains('antic') ? 0.55 : 1);
        if (r.t < 0.09 && !RM) { r.off = -0.14 * Math.sin(r.t / 0.09 * Math.PI / 2); setStrip(r); continue; }
        r.v = Math.min(vmax, r.v + dt * vmax / 0.2);
        r.off += r.v * dt;
        while (r.off >= 1 && (r.mode === 'spin' || r.mode === 'stopping')) { r.off -= 1; shift(r); }
        if (r.mode !== 'settle') setStrip(r);
      }
    }
    S.loop(frame);
    function startRoll() {
      for (const r of reels) if (r.mode === 'idle' || r.mode === 'settle') { r.mode = 'spin'; r.t = 0; r.v = 0; r.stopAt = 0; r.el.classList.add('spinning'); }
      spinning = true; snd('spin'); lockUi(true);
    }
    /* bring the spinning reels to rest on grid (grid[reel][row]); coins[reel][row] carries each Moon Coin's piece */
    function spinTo(grid, coins, opts) {
      opts = opts || {};
      return new Promise((res) => {
        const base = performance.now(), gap = T(170), first = T(opts.first || 620);
        let before = 0, extra = 0, left = REELS;
        anticOn = [];
        reels.forEach((r, i) => {
          anticOn[i] = !opts.noAntic && before === 2;
          if (anticOn[i]) extra += T(950);
          before += grid[i].filter((s) => s === SY.COIN).length;
          r.fin = grid[i]; r.coins = coins[i];
          r.done = () => { if (--left === 0) { spinning = false; el.frame.classList.remove('antic'); lockUi(true); res(); } };
          if (r.mode === 'idle' || r.mode === 'settle') { r.mode = 'spin'; r.t = 0; r.v = 0; r.off = 0; r.el.classList.add('spinning'); }
          r.stopAt = base + first + i * gap + extra;
        });
        spinning = true; lockUi(true);
      });
    }
    function slam() {
      if (!spinning) return;
      const now = performance.now();
      reels.forEach((r, i) => { if (r.mode === 'spin' && r.stopAt) r.stopAt = Math.min(r.stopAt, now + i * 40); });
      anticOn = [];
    }
    function restAll() {
      for (const r of reels) { r.mode = 'idle'; r.off = 0; setStrip(r); r.el.classList.remove('spinning', 'antic'); for (let k = 1; k <= 4; k++) { const c = r.strip.children[k]; c.className = 'nt-cell'; c.innerHTML = REST[rndSym()]; } }
      spinning = false;
    }

    /* ===================== win presentation ===================== */
    const clearMarks = () => { el.reels.querySelectorAll('.nt-cell.win').forEach((c) => c.classList.remove('win')); el.reels.classList.remove('dim'); el.lines.innerHTML = ''; };
    function markWins(ws) { clearMarks(); if (!ws.length) return; el.reels.classList.add('dim'); for (const w of ws) { const ln = M.LINES[w.l]; for (let c = 0; c < w.n; c++) cellAt(c, ln[c]).classList.add('win'); } }
    function drawLines(ws) {
      el.lines.innerHTML = '<svg viewBox="0 0 5 4" preserveAspectRatio="none" aria-hidden="true">' + ws.map((w) => { const ln = M.LINES[w.l]; return '<polyline class="nt-ln" points="' + ln.slice(0, w.n).map((row, c) => (c + 0.5) + ',' + (row + 0.5)).join(' ') + '"/>'; }).join('') + '</svg>';
    }
    const winNow = () => parseInt(el.win.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    function countWin(to, ms) { return B.ui.countUp(el.win, winNow(), to, Math.max(60, T(ms || 600))); }
    const lineText = (w) => M.SYMBOL_NAMES[w.s] + ' × ' + w.n + ' on line ' + (w.l + 1) + ' pays ' + lineBB(w.pay) + ' BB';
    async function showWins(ws, total) {
      if (!ws.length) return;
      markWins(ws); drawLines(ws); snd('win', ws.length); el.frame.classList.add('won');
      setMsg(ws.length > 1 ? ws.length + ' winning lines!' : lineText(ws[0]), 'gold');
      await countWin(total, 600);
      if (ws.length > 1) {
        const tok = ++cycleTok;
        S.timeout(async () => {
          let i = 0;
          while (cycleTok === tok && !S.dead && G) {
            const w = ws[i++ % ws.length]; markWins([w]); drawLines([w]); setMsg(lineText(w), 'gold');
            await S.sleep(1000);
          }
        }, T(1000));
      }
    }
    function stopCycle() { cycleTok++; el.frame.classList.remove('won'); clearMarks(); }
    function banner(html, cls, ms) {
      el.banner.hidden = false; el.banner.className = 'nt-banner ' + (cls || ''); el.banner.innerHTML = html;
      requestAnimationFrame(() => el.banner.classList.add('in'));
      return nap(ms || 1100).then(() => { el.banner.classList.remove('in'); el.banner.classList.add('out'); return nap(260); }).then(() => { el.banner.hidden = true; });
    }
    function lightning(strong) {
      if (RM) return;
      el.flash.animate([{ opacity: 0 }, { opacity: strong ? 0.85 : 0.5, offset: 0.08 }, { opacity: 0.1, offset: 0.2 }, { opacity: strong ? 0.7 : 0.35, offset: 0.3 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      if (strong) snd('thunder');
    }

    /* ===================== server / maths ===================== */
    async function fetchRound(stake, buy, cost) {
      if (B.online) {
        const r = await B.play(ID, 'spin', { stake, buy: buy ? 1 : undefined }, cost);
        if (!r || !r.o) return null;
        return { o: r.o, win: r.win };
      }
      let o;
      if (DEV && devNext && !buy) { o = M.spinUntil(B.rng, devNext); devNext = null; }
      else o = buy ? M.buy(B.rng) : M.spin(B.rng);
      return { o, win: Math.floor(o.totalWin * stake / M.CR) };
    }

    /* ===================== spin button, auto, buy ===================== */
    function lockUi(on) {
      stakeCtl.disabled = on; el.buy.disabled = on; el.main.classList.toggle('busy', on);
      el.spin.classList.toggle('stop', on && spinning);
      el.spin.setAttribute('aria-label', on && spinning ? 'Stop the reels' : 'Spin');
    }
    function onSpin() {
      if (!el.ov.hidden) { closeOv(); return; }
      if (!el.autoMenu.hidden) { el.autoMenu.hidden = true; return; }
      if (busy) { if (spinning) slam(); else if (G.bonusOn) { skip = true; el.skipBtn.hidden = true; } return; }
      round(false);
    }
    function onAuto() { if (auto !== 0) { stopAuto(); snd('click'); } else if (!busy) el.autoMenu.hidden = !el.autoMenu.hidden; }
    function startAuto(n) { auto = n; paintAuto(); round(false); }
    function stopAuto() { auto = 0; paintAuto(); }
    function openBuy() {
      if (busy) return;
      const stake = stakeCtl.value, cost = stake * M.BUY_X;
      el.ov.hidden = false; el.ov.textContent = '';
      el.ov.append(h('div', { class: 'nt-buybox', role: 'dialog', 'aria-label': 'Bonus buy' },
        h('div', { class: 'nt-buyart', 'aria-hidden': 'true', html: tokSvg(K.COIN) + tokSvg(K.COL) + tokSvg(K.COIN) }),
        h('h3', null, 'Buy a ticket'),
        h('p', null, 'Board the Night Train Respin Bonus at once with 3, 4 or 5 Moon Coins. Batty Bucks only: the result is random and can be less than the price.'),
        h('div', { class: 'nt-buyrow' },
          h('button', { class: 'nt-btn', type: 'button', onclick: closeOv }, 'Not now'),
          h('button', { class: 'nt-btn gold big', type: 'button', id: 'nt-buy-go', disabled: B.wallet.balance < cost, onclick: () => { closeOv(); round(true); } }, h('small', null, M.BUY_X + '× stake'), fmt(cost) + ' BB'))));
      snd('pop');
    }
    function closeOv() { el.ov.hidden = true; el.ov.textContent = ''; }

    /* ===================== a round ===================== */
    async function round(buy) {
      if (busy || !G) return;
      const stake = stakeCtl.value, cost = stake * (buy ? M.BUY_X : 1);
      if (!B.wallet.bet(ID, cost)) { stopAuto(); return B.ui.broke(); }
      busy = true; skip = false; el.autoMenu.hidden = true; roundCost = cost; curStake = stake;
      stopCycle(); el.win.textContent = '0'; el.winbox.classList.remove('hot');
      if (auto > 0) { auto--; paintAuto(); }
      setMsg(buy ? 'Ticket bought. The Night Train is coming…' : 'Full steam ahead…', buy ? 'gold' : '');
      startRoll();
      const res = await fetchRound(stake, buy, cost);
      if (!G) return;
      if (!res) { restAll(); busy = false; stopAuto(); lockUi(false); setMsg('Lost the signal in a tunnel. Try again.', ''); return; }
      const o = res.o, win = res.win;
      if (win > 0) B.wallet.win(ID, win, { silent: true });
      const coins = [0, 1, 2, 3, 4].map(() => [null, null, null, null]);
      for (const c of o.coins) coins[c.r][c.w] = c;
      await spinTo(o.grid, coins, { first: buy ? 1000 : 620, noAntic: !!buy });
      if (!G) return;
      if (o.lineWin > 0) {
        await showWins(o.lines, money(o.lineWin));
        if (o.lineWin >= 5 * M.CR) lightning(false);
        if (o.bonus) await nap(900);
      }
      if (o.bonus) { await playBonus(o); if (!G) return; }
      await finish(o, win);
    }
    async function finish(o, win) {
      if (o.bonus) stopCycle();
      if (win > winNow()) await countWin(win, 900);
      if (!G) return;
      B.wallet.sync();
      if (win > 0) {
        if (!o.lines.length || o.bonus) setMsg((o.capped ? 'MAXIMUM WIN! ' : '') + 'Paid ' + fmt(win) + ' BB', 'gold');
        el.winbox.classList.add('hot'); S.timeout(() => el.winbox.classList.remove('hot'), 1600);
      } else setMsg(o.coins.length === 2 ? 'Two Moon Coins… so close. Spin again.' : 'No win this time. Spin again.', '');
      if (win >= roundCost * 10) { lightning(true); await B.ui.celebrate({ amount: win, bet: roundCost }); if (!G) return; }
      busy = false; spinning = false; skip = false; lockUi(false);
      if (auto > 0 && B.wallet.balance >= stakeCtl.value) S.timeout(() => { if (auto > 0 && !busy) round(false); }, T(o.bonus ? 900 : 420));
      else if (auto !== 0) stopAuto();
    }

    /* ===================== the Night Train Respin Bonus ===================== */
    let bk = [], bv = [], open = 4;
    const ctr = (c) => [(c % COLS + 0.5) * 100, (Math.floor(c / COLS) + 0.5) * 100];
    const rowOpen = (c) => Math.floor(c / COLS) >= BROWS - open;
    const filled = () => bk.filter(Boolean).length;
    const boardSum = () => bv.reduce((a, b) => a + b, 0);
    function setLamps(n) { Array.from(el.lamps.children).forEach((l, i) => l.classList.toggle('on', i < n)); }
    function setTotal(cr) {
      const to = money(cr), from = parseInt(el.hudTotal.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      if (to !== from) B.ui.countUp(el.hudTotal, from, to, Math.max(80, T(500)));
    }
    function paintFill() {
      const f = filled();
      if (open >= BROWS) { el.fillBar.style.transform = 'scaleX(1)'; el.fillTxt.textContent = f >= M.CELLS ? 'FULL!' : 'ALL OPEN'; return; }
      const goal = M.CFG.unlock[open - 4];
      el.fillBar.style.transform = 'scaleX(' + Math.min(1, f / goal).toFixed(3) + ')';
      el.fillTxt.textContent = f + ' / ' + goal;
    }
    function paintLocks() {
      el.bcells.forEach((x, c) => x.classList.toggle('lock', !rowOpen(c)));
      el.chains.forEach((ch, row) => { ch.hidden = row >= BROWS - open; });
    }
    function place(c, k, v, anim) {
      bk[c] = k; bv[c] = v;
      const x = el.bcells[c];
      x.innerHTML = pieceHtml(k, v);
      x.classList.add('on'); x.classList.remove('roll');
      if (anim && !RM) x.firstChild.animate([{ transform: 'scale(.2) rotate(-25deg)', opacity: 0, filter: 'brightness(2.5)' }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: T(420), easing: 'ease-out' });
    }
    function setVal(c, v) {
      bv[c] = v;
      const n = el.bcells[c].querySelector('.nt-val'); if (!n) return;
      n.textContent = short(money(v));
      if (!RM) n.animate([{ transform: 'scale(1.7)', color: '#ffffff' }, { transform: 'scale(1)' }], { duration: T(420), easing: 'cubic-bezier(.2,1.6,.4,1)' });
    }
    function pop(c, txt, cls) {
      const [x, y] = ctr(c);
      const p = h('div', { class: 'nt-pop ' + (cls || ''), style: { left: (x / 5) + '%', top: (y / 6) + '%' } }, txt);
      el.pops.append(p); S.timeout(() => p.remove(), 1300);
    }
    const svgEl = (tag, attrs) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    /* orbs flying between cells, along a gentle arc */
    function fly(pairs, cls, ms) {
      if (!pairs.length) return Promise.resolve();
      const D = Math.max(60, T(ms));
      return Promise.all(pairs.map(([a, b], i) => {
        const [x1, y1] = ctr(a), [x2, y2] = ctr(b);
        const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18, my = (y1 + y2) / 2 - (x2 - x1) * 0.18 - 24;
        const n = svgEl('circle', { r: 15, class: 'nt-orb ' + cls }); el.fx.append(n);
        const an = n.animate([{ transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.3)', opacity: 0.4 }, { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.15)', opacity: 1, offset: 0.5 }, { transform: 'translate(' + x2 + 'px,' + y2 + 'px) scale(.5)', opacity: 0.9 }], { duration: D, delay: Math.min(i * T(45), T(400)), easing: 'ease-in-out', fill: 'both' });
        return an.finished.then(() => n.remove(), () => n.remove());
      }));
    }
    function beam(a, b, cls, ms) {
      const [x1, y1] = ctr(a), [x2, y2] = ctr(b);
      const n = svgEl('line', { x1, y1, x2, y2, class: 'nt-ray ' + cls }); el.fx.append(n);
      S.timeout(() => n.remove(), Math.max(200, T(ms || 900)));
    }
    async function shoot(from, to) {
      const [x1, y1] = ctr(from), [x2, y2] = ctr(to);
      const ret = svgEl('g', { class: 'nt-reticle' });
      ret.innerHTML = '<circle r="34" fill="none" stroke-width="5"/><circle r="6"/><path d="M0 -50 V-22 M0 50 V22 M-50 0 H-22 M50 0 H22" stroke-width="5"/>';
      el.fx.append(ret);
      const an = ret.animate([{ transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(1.6)', opacity: 0 }, { transform: 'translate(' + x2 + 'px,' + y2 + 'px) scale(1)', opacity: 1 }], { duration: Math.max(60, T(330)), easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'forwards' });
      await an.finished.catch(() => {});
      if (!G) return;
      snd('bang');
      const fl = svgEl('circle', { cx: x2, cy: y2, r: 46, class: 'nt-muzzle' }); el.fx.append(fl);
      S.timeout(() => { fl.remove(); ret.remove(); }, Math.max(120, T(260)));
      el.bcells[to].classList.add('hit'); S.timeout(() => el.bcells[to].classList.remove('hit'), 400);
    }
    async function playAct(a) {
      if (!G) return;
      const src = el.bcells[a.c], who = ROLE[bk[a.c]] || 'Character';
      if (a.p === 'p') { src.classList.add('ghosting'); snd('ghost'); await nap(320); }
      src.classList.add('acting');
      if (a.t === 'pay') {
        setMsg(who + ' pays ' + short(money(a.v)) + ' BB to everyone aboard!', 'gold'); snd('pay');
        await fly(a.hits.map((x) => [a.c, x[0]]), 'gold', 560); if (!G) return;
        a.hits.forEach((x) => setVal(x[0], x[1])); snd('coin');
      } else if (a.t === 'snp') {
        setMsg(who + ' takes aim…', 'red');
        if (!a.hits.length) { pop(a.c, 'NO TARGET', 'bad'); await nap(500); }
        for (const x of a.hits) { await shoot(a.c, x[0]); if (!G) return; setVal(x[0], x[1]); pop(x[0], '×2', 'red'); await nap(200); }
      } else if (a.t === 'col') {
        setMsg(who + ' collects the lot!', 'violet'); snd('collect');
        await fly(a.from.map((t) => [t, a.c]), 'violet', 600); if (!G) return;
        setVal(a.c, a.to); pop(a.c, '+' + short(money(a.to)), 'violet');
      } else if (a.t === 'nec') {
        snd('necro');
        if (!a.raise.length) { setMsg('Nobody to raise, so the Necromancer triples itself!', 'green'); await nap(380); setVal(a.c, a.to); pop(a.c, '×3', 'green'); }
        else {
          setMsg('The Necromancer raises ' + a.raise.length + (a.raise.length > 1 ? ' characters' : ' character') + ' from the grave!', 'green');
          a.raise.forEach((t) => { beam(a.c, t, 'green', 1100); el.bcells[t].classList.add('raised'); });
          await nap(800);
        }
      }
      src.classList.remove('acting', 'ghosting');
      if (a.p === 'r') src.classList.remove('raised');
      setTotal(boardSum());
      await nap(320);
    }
    async function playActs(acts) { for (const a of acts) { if (!G) return; await playAct(a); } }
    async function unlock(to) {
      while (open < to) {
        open++;
        const row = BROWS - open, ch = el.chains[row];
        if (ch) { ch.classList.add('break'); snd('chain'); lightning(false); }
        setMsg('The chains break! Row ' + (BROWS - row) + ' is open.', 'gold');
        await nap(650);
        if (ch) ch.classList.remove('break');
        paintLocks(); paintFill();
      }
    }
    async function respin(st) {
      const empties = [];
      for (let c = 0; c < M.CELLS; c++) if (!bk[c] && rowOpen(c)) empties.push(c);
      empties.forEach((c) => el.bcells[c].classList.add('roll'));
      setMsg('Respin… ' + st.left + ' left', ''); snd('spin');
      await nap(700); if (!G) return;
      let n = 0;
      for (const l of st.lands) {
        place(l.c, l.k, l.v, true); snd('land', n++);
        if (isPh(l.k)) { setMsg('A ' + ROLE[l.k].toUpperCase() + ' boards! It acts after every respin.', 'cyan'); snd('ghost'); lightning(false); await nap(700); }
        else if (l.k !== K.COIN) { setMsg('The ' + ROLE[l.k] + ' boards!', 'gold'); await nap(260); }
        await nap(170); if (!G) return;
      }
      empties.forEach((c) => el.bcells[c].classList.remove('roll'));
      if (!st.lands.length) setMsg(st.leftAfter ? 'Nothing boards. ' + st.leftAfter + (st.leftAfter === 1 ? ' respin' : ' respins') + ' left.' : 'Nothing boards. End of the line!', '');
      paintFill(); setTotal(boardSum());
    }
    async function playBonus(o) {
      const bo = o.bonus;
      G.bonusOn = true;
      /* the trigger, on the reels */
      reels.forEach((r) => { for (let k = 1; k <= 4; k++) if (r.strip.children[k].classList.contains('coin')) r.strip.children[k].classList.add('trig'); });
      snd('whistle'); lightning(true); setMsg('ALL ABOARD!', 'gold');
      await nap(1300); if (!G) return;
      stopCycle();
      await banner('<small>The Night Train</small><b>ALL ABOARD!</b><span>3 respins · every landing resets them</span>', 'big', 1900); if (!G) return;
      /* into the carriage */
      bk = new Array(M.CELLS).fill(0); bv = new Array(M.CELLS).fill(0); open = 4;
      el.bcells.forEach((x) => { x.className = 'nt-bc'; x.textContent = ''; });
      el.fx.textContent = ''; el.pops.textContent = '';
      el.hudTotal.textContent = '0'; setLamps(3); paintLocks(); paintFill();
      el.frame.classList.add('board'); el.board.hidden = false; el.main.classList.add('bonus'); el.bg.classList.add('bonus');
      el.hud.hidden = false; el.title.hidden = true; el.skipBtn.hidden = skip;
      snd('chug');
      await nap(380);
      for (const s of bo.start) { place(s.c, s.k, s.v, true); snd('land', 0); await nap(150); if (!G) return; }
      paintFill(); setTotal(boardSum());
      setMsg(bo.start.length + ' Moon Coins aboard. 3 respins!', 'gold');
      primary = () => { if (!skip) { skip = true; el.skipBtn.hidden = true; } };
      await nap(700); if (!G) return;
      await playActs(bo.startActs); if (!G) return;
      for (const st of bo.steps) {
        setLamps(st.left);
        await respin(st); if (!G) return;
        if (st.unlock) { await unlock(st.unlock); if (!G) return; }
        await playActs(st.acts); if (!G) return;
        setLamps(st.leftAfter); snd(st.lands.length ? 'reset' : 'lamp');
        el.hudTotal.textContent = fmt(money(st.sum));
        await nap(260); if (!G) return;
      }
      /* end of the line: count the loot */
      primary = null; el.skipBtn.hidden = true;
      if (bo.full) { setMsg('A FULL CARRIAGE!', 'gold'); lightning(true); await nap(900); }
      setMsg(bo.capped ? 'MAXIMUM WIN reached!' : 'End of the line! Counting the loot…', 'gold');
      const total = money(bo.total);
      let run = 0;
      for (const s of bo.board) {
        if (!G) return;
        run = Math.min(total, run + money(s.v));
        el.bcells[s.c].classList.add('cash'); el.hudTotal.textContent = fmt(run); snd('tick');
        await S.sleep(Math.max(20, T(bo.board.length > 18 ? 70 : 110)));
      }
      el.hudTotal.textContent = fmt(total);
      B.fx.burst({ el: el.board, kind: 'coin', count: Math.min(60, 16 + bo.board.length * 2), power: 1 });
      snd('bonus');
      await countWin(money(o.lineWin) + total, 700);
      /* the outro card */
      skip = false;
      const card = h('div', { class: 'nt-outro', role: 'dialog', 'aria-label': 'Bonus summary' },
        h('small', null, bo.capped ? 'MAXIMUM WIN' : 'END OF THE LINE'),
        h('b', null, fmt(total) + ' BB'),
        h('span', null, 'won in ' + bo.respins + (bo.respins === 1 ? ' respin' : ' respins') + (bo.full ? ' · full carriage' : '') + (bo.open === BROWS ? ' · every row opened' : '')),
        h('button', { class: 'nt-btn gold', type: 'button' }, 'CONTINUE'));
      el.box.append(card);
      requestAnimationFrame(() => card.classList.add('in'));
      await new Promise((res) => {
        let over = false;
        const done = () => { if (over) return; over = true; primary = null; card.removeEventListener('click', done); res(); };
        card.addEventListener('click', done); primary = done;
        S.timeout(done, auto ? 2600 : 6000);
      });
      if (!G) return;
      card.remove();
      el.frame.classList.remove('board'); el.board.hidden = true; el.main.classList.remove('bonus'); el.bg.classList.remove('bonus');
      el.hud.hidden = true; el.title.hidden = false;
      el.reels.querySelectorAll('.nt-cell.trig').forEach((c) => c.classList.remove('trig'));
      G.bonusOn = false;
    }
    G.unmount = () => { try { delete window.ntDev; } catch (e) { /* fine */ } };
  }

  B.registerGame({
    id: ID, name: 'Night Train', tagline: 'All aboard the midnight express.', tag: 'Hold & Win', section: 'slots', isNew: true,
    poster: POSTER, rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S.dispose(); } G = null; },
  });
})();
