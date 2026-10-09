/* ===== ultraheist math ===== */
/* Bat Bandits UltraNudge — pure maths. No DOM. Shared verbatim by the browser game, sim/ultraheist.sim.js and
   (via tools/export-data.js -> server/lib/gamedata.json) the PHP port in server/lib/games/ultraheist.php.

   GRID     5 reels x 4 rows, 40 fixed lines, pays left to right from reel 1, 3 or more in a row.
            Each reel is a real, fixed strip. A spin stops each reel at a random strip position.
   AMOUNTS  Everything is in UNITS: 1 unit = stake / 20 (every stake on the ladder is a multiple of 20), so every
            amount is a whole number of Batty Bucks. A line bet is half a unit (40 lines x 0.5 = 20 units = 1 stake).
   BANDITS  Bandit Wilds are not printed on the strips: after the reels stop, 0 to 3 Bandits drop onto reels 2-4
            (only onto ordinary picture symbols). They substitute for every picture symbol. A Bandit RIDES his
            reel: each nudge carries him one row down, until he drops off the bottom.
   ULTRANUDGE  Any Bandit on screen starts an UltraNudge: every reel steps DOWN one strip
            position (a new symbol enters at the top, the bottom one drops away), the multiplier climbs +1, wins
            re-evaluate and pay x multiplier, and it repeats while any line win keeps landing.
   CASH BAGS  Bag symbols carry 1x-25x the stake (drawn as they come into view). At the end of every step (the landing
            and every nudge) each Bandit on screen collects every visible bag; a bag is emptied once collected.
   HEIST FREE SPINS  3 Vaults (reels 1, 3, 5) visible at the end of any step = 8 free spins. Every line win nudges,
            the multiplier starts at 1x and never resets, cash bags are multiplied too, and every 4 bags collected
            fill the alarm meter for +2 spins. Bonus Buy: 100x stake for the same 8 free spins.
   CAP      10,000x stake per spin (including its free spins). When it is reached the spin ends at the cap. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).ultraheist = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 4, CELLS = 20, LINES = 40;
  const UNITS_PER_STAKE = 20;
  const MAX_WIN_X = 10000;
  const CAP = MAX_WIN_X * UNITS_PER_STAKE;             // 200,000 units
  const MAX_STEPS = 60;                               // safety stop for one nudge chain (never reached in 10^8 spins)
  const BUY_X = 100;

  /* ---------- symbols ---------- */
  const PRINT = 0, KEY = 1, CUFFS = 2, LOCK = 3, CROWBAR = 4, TORCH = 5, SAFE = 6, CAR = 7, GOLD = 8, DIAMOND = 9, WILD = 10, BAG = 11, VAULT = 12;
  const NSYM = 13;
  const SYMBOLS = ['print', 'key', 'cuffs', 'lock', 'crowbar', 'torch', 'safe', 'car', 'gold', 'diamond', 'wild', 'bag', 'vault'];
  const SYMBOL_NAMES = ['Fingerprint', 'Skeleton Key', 'Handcuffs', 'Padlock', 'Crowbar', 'Torch', 'Safe Dial', 'Getaway Car', 'Gold Bars', 'Diamond', 'Bandit Wild', 'Cash Bag', 'Vault'];
  /* PAY[symbol][count] in units (1 unit = stake / 20 = two line bets). */
  const PAY = [
    /* Fingerprint */ [0, 0, 0, 2, 6, 20],
    /* Key         */ [0, 0, 0, 2, 6, 20],
    /* Handcuffs   */ [0, 0, 0, 2, 6, 20],
    /* Padlock     */ [0, 0, 0, 2, 8, 25],
    /* Crowbar     */ [0, 0, 0, 2, 8, 25],
    /* Torch       */ [0, 0, 0, 3, 10, 30],
    /* Safe Dial   */ [0, 0, 0, 4, 15, 50],
    /* Getaway Car */ [0, 0, 0, 6, 20, 80],
    /* Gold Bars   */ [0, 0, 0, 8, 30, 150],
    /* Diamond     */ [0, 0, 0, 12, 50, 300],
    /* Wild        */ [0, 0, 0, 0, 0, 0],
    /* Bag         */ [0, 0, 0, 0, 0, 0],
    /* Vault       */ [0, 0, 0, 0, 0, 0],
  ];

  /* 40 fixed lines: row (0 = top .. 3 = bottom) on each reel. */
  const PAYLINES = [
    [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0],
    [1, 2, 3, 2, 1], [3, 2, 1, 2, 3], [2, 1, 0, 1, 2], [0, 1, 0, 1, 0], [1, 0, 1, 0, 1],
    [1, 2, 1, 2, 1], [2, 1, 2, 1, 2], [2, 3, 2, 3, 2], [3, 2, 3, 2, 3], [0, 0, 1, 0, 0],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [2, 2, 1, 2, 2], [2, 2, 3, 2, 2], [3, 3, 2, 3, 3],
    [0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2], [2, 3, 3, 3, 2],
    [3, 2, 2, 2, 3], [0, 0, 1, 2, 2], [3, 3, 2, 1, 1], [0, 1, 2, 3, 3], [3, 2, 1, 0, 0],
    [0, 0, 0, 1, 2], [3, 3, 3, 2, 1], [1, 2, 3, 3, 3], [2, 1, 0, 0, 0], [1, 0, 1, 2, 1],
    [2, 3, 2, 1, 2], [0, 2, 0, 2, 0], [3, 1, 3, 1, 3], [1, 3, 1, 3, 1], [2, 0, 2, 0, 2],
  ];

  /* ---------- tunables: every probability in the game lives here ---------- */
  const CFG = {
    base: [
      /*  Prn Key Cuf Lck Crw Trc Saf Car Gld Dia  -  Bag Vlt */
      [8, 8, 8, 4, 4, 4, 4, 3, 3, 2, 0, 2, 2],
      [6, 6, 6, 6, 6, 6, 4, 3, 3, 2, 0, 2, 0],
      [4, 4, 4, 8, 8, 8, 4, 3, 3, 2, 0, 2, 2],
      [6, 6, 6, 6, 6, 6, 4, 3, 3, 2, 0, 2, 0],
      [6, 6, 6, 6, 6, 6, 4, 3, 3, 2, 0, 2, 2],
    ],
    free: [
      [8, 8, 8, 4, 4, 4, 4, 3, 3, 2, 0, 2, 0],
      [6, 6, 6, 6, 6, 6, 4, 3, 3, 2, 0, 2, 0],
      [4, 4, 4, 8, 8, 8, 4, 3, 3, 2, 0, 2, 0],
      [6, 6, 6, 6, 6, 6, 4, 3, 3, 2, 0, 2, 0],
      [6, 6, 6, 6, 6, 6, 4, 3, 3, 2, 0, 2, 0],
    ],
    /* how many Bandits drop: weights for 0, 1, 2, 3 (never on neighbouring reels) */
    banditBase: [8770, 1095, 135, 0],
    banditFree: [636, 308, 56, 0],
    /* cash bag values in units (20 = 1x stake) and weights; base and free spins */
    bagValues: [20, 40, 60, 100, 200, 500],
    bagBase: [500, 260, 120, 70, 35, 15],
    bagFree: [600, 250, 100, 40, 8, 2],
    fsSpins: 8, alarmEvery: 4, alarmSpins: 2,
  };

  /* ---------- strips: built once, deterministically (fixed seed), from the counts above ---------- */
  function lcg(seed) { let s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function buildStrip(counts, seed) {
    const r = lcg(seed), body = [];
    for (let s = 0; s < NSYM; s++) if (s !== VAULT) for (let i = 0; i < counts[s]; i++) body.push(s);
    for (let i = body.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = body[i]; body[i] = body[j]; body[j] = t; }
    /* break up runs of identical symbols (a strip reads like a real reel, not a stack) */
    for (let pass = 0; pass < 8; pass++) for (let i = 0; i < body.length; i++) {
      const a = body[i], b = body[(i + 1) % body.length];
      if (a === b) { const j = (i + 3 + Math.floor(r() * (body.length - 6))) % body.length; const k = (i + 1) % body.length; const t = body[k]; body[k] = body[j]; body[j] = t; }
    }
    /* vaults spaced evenly so at most one can ever be in view on a reel */
    const n = counts[VAULT], strip = body.slice();
    if (n > 0) { const gap = Math.floor(body.length / n); for (let g = n - 1; g >= 0; g--) strip.splice(g * gap + 2 + Math.floor(r() * Math.max(1, gap - 8)), 0, VAULT); }
    return strip;
  }
  let STRIPS = null, FREE_STRIPS = null;
  function rebuild() {
    STRIPS = CFG.base.map(function (c, i) { return buildStrip(c, 9301 + i * 131); });
    FREE_STRIPS = CFG.free.map(function (c, i) { return buildStrip(c, 4409 + i * 173); });
  }
  rebuild();

  /* ---------- helpers ---------- */
  function pickIndex(rng, weights) {
    let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return weights.length - 1;
  }

  /* One reel set in play: positions, the 20 visible cells, bag values (0 none, >0 value, -1 emptied), Bandits (they ride down with their reel). */
  function Board(strips, free) {
    this.strips = strips; this.free = free;
    this.pos = [0, 0, 0, 0, 0];
    this.sym = new Array(CELLS).fill(0); this.bag = new Array(CELLS).fill(0); this.wild = new Array(CELLS).fill(false);
  }
  function bagValue(rng, free) { return CFG.bagValues[pickIndex(rng, free ? CFG.bagFree : CFG.bagBase)]; }
  Board.prototype.land = function (rng) {
    const S = this.strips;
    for (let r = 0; r < REELS; r++) this.pos[r] = Math.floor(rng() * S[r].length);
    for (let r = 0; r < REELS; r++) for (let k = 0; k < ROWS; k++) {
      const c = r * ROWS + k, s = S[r][(this.pos[r] + k) % S[r].length];
      this.sym[c] = s; this.bag[c] = s === BAG ? bagValue(rng, this.free) : 0; this.wild[c] = false;
    }
    /* Bandits drop onto picture symbols on reels 2-4 */
    let n = pickIndex(rng, this.free ? CFG.banditFree : CFG.banditBase);
    const cand = [];
    for (let c = ROWS; c < 4 * ROWS; c++) if (this.sym[c] < WILD) cand.push(c);
    const out = [];
    while (n > 0 && cand.length) {
      const i = Math.floor(rng() * cand.length); const c = cand[i]; this.wild[c] = true; out.push(c); n--;
      /* Bandits never stand on neighbouring reels (two side by side would pay forever) */
      const reel = Math.floor(c / ROWS);
      for (let j = cand.length - 1; j >= 0; j--) { const rj = Math.floor(cand[j] / ROWS); if (cand[j] === c || rj === reel - 1 || rj === reel + 1) cand.splice(j, 1); }
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  };
  /* every reel steps down one strip position; a new symbol enters at the top */
  Board.prototype.nudge = function (rng) {
    const S = this.strips;
    for (let r = 0; r < REELS; r++) {
      const L = S[r].length; this.pos[r] = (this.pos[r] + L - 1) % L;
      const b = r * ROWS;
      for (let k = ROWS - 1; k > 0; k--) { this.sym[b + k] = this.sym[b + k - 1]; this.bag[b + k] = this.bag[b + k - 1]; this.wild[b + k] = this.wild[b + k - 1]; }
      const s = S[r][this.pos[r]];
      this.sym[b] = s; this.bag[b] = s === BAG ? bagValue(rng, this.free) : 0; this.wild[b] = false;
    }
  };
  Board.prototype.vis = function (c) { return this.wild[c] ? WILD : this.sym[c]; };

  /* line wins on the current view: [[line, symbol, count, units], ...], plus whether any winning line used a Bandit */
  function evalLines(view) {
    const wins = []; let total = 0, withWild = false;
    for (let l = 0; l < LINES; l++) {
      const pl = PAYLINES[l];
      const s = view[pl[0]];
      if (s >= WILD) continue;
      let n = 1, w = false;
      while (n < REELS) { const v = view[n * ROWS + pl[n]]; if (v === s) n++; else if (v === WILD) { n++; w = true; } else break; }
      const p = PAY[s][n];
      if (p > 0) { wins.push([l, s, n, p]); total += p; if (w) withWild = true; }
    }
    return { wins: wins, total: total, withWild: withWild };
  }

  /* Evaluate one step (the landing or a nudge) at multiplier mult. bagMult: whether bags are multiplied (free spins). */
  function step(bd, mult, bagMult) {
    const view = new Array(CELLS);
    for (let c = 0; c < CELLS; c++) view[c] = bd.vis(c);
    const bags = bd.bag.slice();
    for (let c = 0; c < CELLS; c++) if (bd.wild[c]) bags[c] = 0;           // a bag behind a Bandit is hidden
    const ev = evalLines(view);
    const wins = ev.wins.map(function (w) { return [w[0], w[1], w[2], w[3] * mult]; });
    const lineWin = ev.total * mult;
    let bandits = 0, sc = 0;
    for (let c = 0; c < CELLS; c++) { if (bd.wild[c]) bandits++; if (view[c] === VAULT) sc++; }
    const got = []; let bagSum = 0;
    if (bandits > 0) for (let c = 0; c < CELLS; c++) if (!bd.wild[c] && bd.sym[c] === BAG && bd.bag[c] > 0) { got.push(c); bagSum += bd.bag[c]; bd.bag[c] = -1; }
    const collect = bagSum * bandits * (bagMult ? mult : 1);
    return { g: view, b: bags, m: mult, w: wins, lw: lineWin, ww: ev.withWild, nb: bandits, cc: got, c: collect, sc: sc, win: lineWin + collect };
  }

  /* Play one reel set from landing to the end of its nudge chain.
     free: free-spin rules. ctx: {mult, room} — mult carries across free spins; room = units left under the cap. */
  function playSet(rng, free, ctx) {
    const bd = new Board(free ? FREE_STRIPS : STRIPS, free);
    const bandits = bd.land(rng);
    const stops = bd.pos.slice();
    const steps = [];
    let mult = free ? ctx.mult : 1, win = 0, bagsGot = 0, scatter = false, capped = false;
    for (let i = 0; ; i++) {
      const st = step(bd, mult, free);
      steps.push(st); win += st.win; bagsGot += st.cc.length;
      if (!free && st.sc >= 3) scatter = true;
      if (win >= ctx.room) { capped = true; break; }
      /* a Bandit on screen keeps the reels nudging: he rides down with his reel until he drops off the bottom.
         In the Heist any line win nudges too. */
      const go = st.nb > 0 || (free && st.lw > 0);
      if (!go || i + 1 >= MAX_STEPS) break;
      bd.nudge(rng); mult++;
    }
    return { stops: stops, bandits: bandits, steps: steps, win: win, bags: bagsGot, scatter: scatter, capped: capped, multEnd: mult };
  }

  /* Heist Free Spins. room: units left under the cap. */
  function freeSpins(rng, room) {
    const spins = [];
    let left = CFG.fsSpins, total = 0, mult = 1, meter = 0, extra = 0, capped = false, played = 0;
    while (left > 0) {
      left--; played++;
      const s = playSet(rng, true, { mult: mult, room: room - total });
      mult = s.multEnd;
      total += s.win;
      let add = 0;
      meter += s.bags;
      while (meter >= CFG.alarmEvery) { meter -= CFG.alarmEvery; add += CFG.alarmSpins; }
      left += add; extra += add;
      spins.push({ stops: s.stops, bandits: s.bandits, steps: s.steps, win: s.win, bags: s.bags, add: add, meter: meter, left: left, mult: mult });
      if (s.capped || total >= room) { capped = true; total = Math.min(total, room); break; }
    }
    return { spins: spins, total: total, played: played, extra: extra, multEnd: mult, capped: capped };
  }

  function finish(base, fs) {
    let total = base.win + (fs ? fs.total : 0), capped = base.capped || !!(fs && fs.capped);
    if (total >= CAP) { total = CAP; capped = true; }
    return { stops: base.stops, bandits: base.bandits, steps: base.steps, baseWin: Math.min(base.win, CAP), trig: base.scatter && !base.capped, fs: fs, totalWin: total, capped: capped };
  }
  /* A paid spin. Returns the whole outcome, free spins included. totalWin is in units. */
  function spin(rng) {
    const base = playSet(rng, false, { mult: 1, room: CAP });
    const fs = base.scatter && !base.capped ? freeSpins(rng, CAP - base.win) : null;
    return finish(base, fs);
  }
  /* Bonus Buy: 100x stake for Heist Free Spins straight away (no base spin). */
  function buy(rng) {
    const fs = freeSpins(rng, CAP);
    return { stops: null, bandits: [], steps: [], baseWin: 0, trig: true, buy: true, fs: fs, totalWin: Math.min(CAP, fs.total), capped: fs.capped };
  }

  return {
    REELS: REELS, ROWS: ROWS, CELLS: CELLS, LINES: LINES, UNITS_PER_STAKE: UNITS_PER_STAKE, MAX_WIN_X: MAX_WIN_X, CAP: CAP, MAX_STEPS: MAX_STEPS, BUY_X: BUY_X,
    SYM: { PRINT: PRINT, KEY: KEY, CUFFS: CUFFS, LOCK: LOCK, CROWBAR: CROWBAR, TORCH: TORCH, SAFE: SAFE, CAR: CAR, GOLD: GOLD, DIAMOND: DIAMOND, WILD: WILD, BAG: BAG, VAULT: VAULT },
    SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, PAY: PAY, PAYLINES: PAYLINES, CFG: CFG,
    get STRIPS() { return STRIPS; }, get FREE_STRIPS() { return FREE_STRIPS; },
    spin: spin, buy: buy, freeSpins: freeSpins, evalLines: evalLines, pickIndex: pickIndex, _rebuild: rebuild,
  };
});

/* ===== ultraheist ===== */
/* Bat Bandits UltraNudge — the game. Every outcome comes from BattyMath.ultraheist (practice) or the server (online);
   this file only presents it. Art: a rain-lashed city at night under sweeping searchlights, a steel vault behind a laser
   grid, and masked bat bandits who abseil onto the reels and ride them down, one thumping nudge at a time. */
(function () {
  'use strict';
  const ID = 'ultraheist', M = BattyMath.ultraheist;
  const U = M.UNITS_PER_STAKE, REELS = M.REELS, ROWS = M.ROWS, SYM = M.SYM;
  /* dev hooks: practice mode only, and only when localStorage['batty-dev'] === '1' (or ?dev is in the address) */
  const devWanted = () => { try { return localStorage.getItem('batty-dev') === '1' || /(^|[?&])dev\b/.test(location.search); } catch (e) { return false; } };
  let DEV = false;
  let S = null, B = null, h = null, root = null, E = null, RM = false;

  /* ================= art ================= */
  const BAT = (window.Batty && Batty.batPath) || '';
  const NAMES = M.SYMBOLS; // print key cuffs lock crowbar torch safe car gold diamond wild bag vault
  function dialTicks(cx, cy, r1, r2, n, w, col) { let s = ''; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, L = i % 5 === 0 ? r2 - 4 : r2; s += '<line x1="' + (cx + Math.sin(a) * r1).toFixed(1) + '" y1="' + (cy - Math.cos(a) * r1).toFixed(1) + '" x2="' + (cx + Math.sin(a) * L).toFixed(1) + '" y2="' + (cy - Math.cos(a) * L).toFixed(1) + '" stroke="' + col + '" stroke-width="' + (i % 5 === 0 ? w * 1.6 : w) + '"/>'; } return s; }
  const star = (cx, cy, r) => { const k = r * 0.22; return 'M' + cx + ' ' + (cy - r) + 'L' + (cx + k) + ' ' + (cy - k) + 'L' + (cx + r) + ' ' + cy + 'L' + (cx + k) + ' ' + (cy + k) + 'L' + cx + ' ' + (cy + r) + 'L' + (cx - k) + ' ' + (cy + k) + 'L' + (cx - r) + ' ' + cy + 'L' + (cx - k) + ' ' + (cy - k) + 'Z'; };
  const glint = (cx, cy, r, d) => '<path class="uh-tw" style="animation-delay:' + d + 's" d="' + star(cx, cy, r) + '" fill="#fff"/>';
  const COND = 'Bebas Neue, TeX Gyre Heros Cn, Arial Narrow, sans-serif';
  const DEFS = '<defs>' +
    '<linearGradient id="ultraheist-g-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#ffcc4a"/><stop offset=".7" stop-color="#d98a12"/><stop offset="1" stop-color="#7a4306"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-goldside" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b56d0a"/><stop offset="1" stop-color="#5a3003"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f9ff"/><stop offset=".4" stop-color="#b9c3d4"/><stop offset=".75" stop-color="#6b768c"/><stop offset="1" stop-color="#2c3344"/></linearGradient>' +
    '<radialGradient id="ultraheist-g-steelr" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#c3cbd9"/><stop offset=".8" stop-color="#5f6a80"/><stop offset="1" stop-color="#262c3a"/></radialGradient>' +
    '<linearGradient id="ultraheist-g-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#e0aa45"/><stop offset="1" stop-color="#7c4f0e"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a96"/><stop offset=".4" stop-color="#ec2440"/><stop offset="1" stop-color="#6e0616"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-cyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0ffff"/><stop offset=".45" stop-color="#5ff0ff"/><stop offset="1" stop-color="#0a86ad"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-mag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc0e6"/><stop offset=".35" stop-color="#ff3d9e"/><stop offset="1" stop-color="#6d0846"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-burlap" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2dcaa"/><stop offset=".5" stop-color="#c49654"/><stop offset="1" stop-color="#5e3d17"/></linearGradient>' +
    '<linearGradient id="ultraheist-g-violet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d58b8"/><stop offset="1" stop-color="#21173f"/></linearGradient>' +
    '<radialGradient id="ultraheist-g-head" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#7d68c8"/><stop offset=".6" stop-color="#3f2e70"/><stop offset="1" stop-color="#211741"/></radialGradient>' +
    '<pattern id="ultraheist-g-stripe" width="10" height="7" patternUnits="userSpaceOnUse"><rect width="10" height="7" fill="#17131f"/><rect width="10" height="3.2" fill="#ecebf5"/></pattern>' +
    '<linearGradient id="ultraheist-g-beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff7b0" stop-opacity=".95"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="ultraheist-g-ice" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#bdf6ff"/><stop offset="1" stop-color="#1aa4d6"/></radialGradient>' +
    '<radialGradient id="ultraheist-g-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd0d6"/><stop offset=".5" stop-color="#ff2a48"/><stop offset="1" stop-color="#ff2a48" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="ultraheist-g-hoard" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="#fff7cf"/><stop offset=".35" stop-color="#ffcf4d"/><stop offset=".75" stop-color="#b8650a" stop-opacity=".6"/><stop offset="1" stop-color="#2a1402" stop-opacity="0"/></radialGradient>' +
    '<filter id="ultraheist-f-mblur" x="-4%" y="-8%" width="108%" height="116%"><feGaussianBlur stdDeviation="0 7"/></filter>' +
    '</defs>';

  /* A masked bat bandit. kind: 'wild' (on the reels, with a WILD plaque) or 'mascot' (sits on the vault, legs swinging). */
  function banditArt(kind) {
    const wing = 'M38 63C29 51 17 45 4 46c4 5 5 9 3 14 6-2 11 1 12 6 4-3 9-2 11 4 3-3 6-3 8 0z';
    const wingIn = '<path d="' + wing + '" fill="url(#ultraheist-g-violet)" stroke="#0c0716" stroke-width="2.2" stroke-linejoin="round"/><path d="M36 61C28 53 18 49 9 49M30 57l-7 9M22 53l-10 7" fill="none" stroke="#9b86e6" stroke-width="1.1" opacity=".55"/>';
    let s = '<g class="b-all">';
    if (kind === 'mascot') s += '<g class="b-leg l"><path d="M44 79v13" stroke="#17131f" stroke-width="5.5" stroke-linecap="round"/><ellipse cx="42.5" cy="94" rx="5.6" ry="3.2" fill="#0a0810" stroke="#2c2640" stroke-width="1"/></g>' +
      '<g class="b-leg r"><path d="M56 79v13" stroke="#17131f" stroke-width="5.5" stroke-linecap="round"/><ellipse cx="57.5" cy="94" rx="5.6" ry="3.2" fill="#0a0810" stroke="#2c2640" stroke-width="1"/></g>';
    s += '<g class="b-wl">' + wingIn + '</g><g class="b-wr"><g transform="matrix(-1 0 0 1 100 0)">' + wingIn + '</g></g>';
    s += '<path d="M35 66c5-5 25-5 30 0l3 15c-11 6-25 6-36 0z" fill="url(#ultraheist-g-stripe)" stroke="#0c0716" stroke-width="2.2" stroke-linejoin="round"/>';
    if (kind === 'mascot') s += '<g class="b-swag"><path d="M70 66c-6 4-9 10-8 16 1 6 7 8 13 8s12-2 13-8c1-6-2-12-8-16z" fill="url(#ultraheist-g-burlap)" stroke="#3e260b" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M71 66c-2-4-3-7 0-9 2 2 4 1 5-1 2 3 4 3 5 0 2 2 2 6 0 10z" fill="url(#ultraheist-g-burlap)" stroke="#3e260b" stroke-width="1.8" stroke-linejoin="round"/><path d="' + BAT + '" transform="translate(68.5 73) scale(.2)" fill="#3e260b" opacity=".75"/></g>';
    s += '<g class="b-head">' +
      '<path d="M31 37l-5-22 15 12zM69 37l5-22-15 12z" fill="#3f2e70" stroke="#0c0716" stroke-width="2.2" stroke-linejoin="round"/><path d="M31 32l-2.5-11 7 6zM69 32l2.5-11-7 6z" fill="#ff7ab8" opacity=".7"/>' +
      '<ellipse cx="50" cy="47" rx="22" ry="19.5" fill="url(#ultraheist-g-head)" stroke="#0c0716" stroke-width="2.2"/>' +
      '<ellipse cx="36" cy="58" rx="4" ry="2.4" fill="#ff5fa8" opacity=".35"/><ellipse cx="64" cy="58" rx="4" ry="2.4" fill="#ff5fa8" opacity=".35"/>' +
      '<g class="b-tails"><path d="M26 45l-10-5 2 8 7-1zM74 45l10-5-2 8-7-1z" fill="#07050d"/></g>' +
      '<path d="M25 44c8-6 42-6 50 0 1 6-2 10-6 11-8 2-12-3-19-3s-11 5-19 3c-4-1-7-5-6-11z" fill="#07050d"/>' +
      '<ellipse cx="40" cy="47.5" rx="6" ry="4.6" fill="#fff"/><ellipse cx="60" cy="47.5" rx="6" ry="4.6" fill="#fff"/>' +
      '<g class="b-pup"><circle cx="41.3" cy="48" r="2.6" fill="#07050d"/><circle cx="61.3" cy="48" r="2.6" fill="#07050d"/><circle cx="42.3" cy="47" r=".9" fill="#fff"/><circle cx="62.3" cy="47" r=".9" fill="#fff"/></g>' +
      '<ellipse class="b-lid l" cx="40" cy="47.5" rx="6.8" ry="5.3" fill="#07050d"/><ellipse class="b-lid r" cx="60" cy="47.5" rx="6.8" ry="5.3" fill="#07050d"/>' +
      '<g class="b-smile"><path d="M41 59q9 6 18 0" fill="none" stroke="#e8dcff" stroke-width="2.4" stroke-linecap="round"/><path d="M44 60l2 4.5 2-3.6M52 61l2 3.6 2-4.5" fill="#fff"/></g>' +
      '<g class="b-open"><path d="M40 58q10 13 20 0q-10 3-20 0z" fill="#3a0718" stroke="#0c0716" stroke-width="1.6" stroke-linejoin="round"/><path d="M45.5 63.6q4.5 3 9 0q-4.5-2-9 0z" fill="#ff6b8a"/><path d="M43 58.7l2 3 2-2.4M53 59.4l2 2.4 2-3" fill="#fff"/></g>' +
      '<g class="b-hat"><ellipse cx="50" cy="31" rx="29" ry="5.6" fill="#121018" stroke="#000" stroke-width="2"/><path d="M33 31c0-11 5-18 17-18s17 7 17 18" fill="#1c1a26" stroke="#000" stroke-width="2"/><path d="M50 14c-3 5-3 9 0 12" stroke="#000" stroke-width="2" fill="none"/><path d="M33 26h34v5H33z" fill="#ff2e93"/><path d="M38 19q6-4 12-3" stroke="#fff" stroke-width="1.6" opacity=".25" fill="none"/></g>' +
      '</g>';
    if (kind === 'wild') s += '<g class="b-plaque"><rect x="21" y="79" width="58" height="17" rx="5" fill="url(#ultraheist-g-gold)" stroke="#5a3003" stroke-width="2.2"/><path d="M25 82h50" stroke="#fff8d0" stroke-width="1.6" opacity=".7"/>' +
      '<text x="50" y="92.6" text-anchor="middle" font-family="' + COND + '" font-weight="700" font-size="15.5" letter-spacing="2" fill="#2a1402">WILD</text></g>';
    return s + '</g>';
  }
  const banditSvg = (kind) => '<svg class="uh-bsvg" viewBox="0 0 100 100" aria-hidden="true" overflow="visible">' + banditArt(kind) + '</svg>';

  const ART = {
    print: '<rect x="12" y="10" width="76" height="80" rx="14" fill="#08202c" stroke="#5ff0ff" stroke-opacity=".45" stroke-width="2"/>' +
      '<g fill="none" stroke="url(#ultraheist-g-cyan)" stroke-linecap="round" stroke-width="3.6">' +
      '<path d="M26 70V50a24 24 0 0 1 48 0v8"/><path d="M33 78V50a17 17 0 0 1 34 0v20" stroke-dasharray="40 7 60"/><path d="M40 82V50a10 10 0 0 1 20 0v24" stroke-dasharray="22 6 50"/>' +
      '<path d="M47 84V50a3 3 0 0 1 6 0v28"/><path d="M20 58v-8a30 30 0 0 1 60 0v2" stroke-dasharray="30 8 70"/><path d="M74 66v12M67 76v6"/></g>' +
      '<rect class="uh-scan" x="14" y="12" width="72" height="5" rx="2.5" fill="#bff9ff"/>' +
      '<circle cx="50" cy="50" r="40" fill="none" stroke="#5ff0ff" stroke-opacity=".12" stroke-width="10"/>',
    key: '<g transform="rotate(-40 50 50)"><circle cx="50" cy="24" r="17" fill="url(#ultraheist-g-brass)" stroke="#5a3608" stroke-width="2.6"/>' +
      '<path d="' + BAT + '" transform="translate(39.5 19.5) scale(.175)" fill="#2a1406"/>' +
      '<rect x="45" y="39" width="10" height="50" rx="3" fill="url(#ultraheist-g-brass)" stroke="#5a3608" stroke-width="2.4"/>' +
      '<path d="M55 68h13v7H55zM55 80h17v9H55z" fill="url(#ultraheist-g-brass)" stroke="#5a3608" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<rect x="41" y="40" width="18" height="5" rx="2.5" fill="#c58a2c" stroke="#5a3608" stroke-width="2"/><path d="M48 44v40" stroke="#fff7d0" stroke-width="2" opacity=".7"/></g>' + glint(30, 22, 7, 0.4),
    cuffs: '<g fill="none" stroke-linecap="round"><path d="M44 52c4-6 8-6 12 0" stroke="#3a4152" stroke-width="7"/><path d="M44 52c4-6 8-6 12 0" stroke="url(#ultraheist-g-steel)" stroke-width="4"/>' +
      '<circle cx="30" cy="60" r="18" stroke="#262c3a" stroke-width="11"/><circle cx="30" cy="60" r="18" stroke="url(#ultraheist-g-steel)" stroke-width="7.5"/>' +
      '<circle cx="70" cy="60" r="18" stroke="#262c3a" stroke-width="11"/><circle cx="70" cy="60" r="18" stroke="url(#ultraheist-g-steel)" stroke-width="7.5"/>' +
      '<path d="M19 47a18 18 0 0 1 16-5M59 47a18 18 0 0 1 16-5" stroke="#fff" stroke-width="2.4" opacity=".8"/></g>' +
      '<rect x="38" y="34" width="12" height="16" rx="3" fill="url(#ultraheist-g-steel)" stroke="#262c3a" stroke-width="2"/><rect x="50" y="34" width="12" height="16" rx="3" fill="url(#ultraheist-g-steel)" stroke="#262c3a" stroke-width="2"/>' +
      '<circle cx="44" cy="42" r="2" fill="#262c3a"/><circle cx="56" cy="42" r="2" fill="#262c3a"/>' + glint(20, 46, 6, 1.3),
    lock: '<path d="M33 48V34a17 17 0 0 1 34 0v14" fill="none" stroke="#262c3a" stroke-width="12"/><path d="M33 48V34a17 17 0 0 1 34 0v14" fill="none" stroke="url(#ultraheist-g-steel)" stroke-width="8"/>' +
      '<rect x="20" y="44" width="60" height="44" rx="9" fill="url(#ultraheist-g-red)" stroke="#4a0410" stroke-width="2.6"/>' +
      '<rect x="24" y="47" width="52" height="7" rx="3.5" fill="#fff" opacity=".28"/>' +
      '<circle cx="50" cy="62" r="6.5" fill="#1a0408"/><path d="M47 64l-3 14h12l-3-14z" fill="#1a0408"/>' +
      '<g fill="#ffd6dc" opacity=".8"><circle cx="27" cy="81" r="2"/><circle cx="73" cy="81" r="2"/><circle cx="27" cy="58" r="2"/><circle cx="73" cy="58" r="2"/></g>' + glint(28, 50, 6, 2.1),
    crowbar: '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M27 84L70 24c4-6 13-6 15 0 2 5-1 9-6 10" stroke="#3b0710" stroke-width="13"/>' +
      '<path d="M27 84L70 24c4-6 13-6 15 0 2 5-1 9-6 10" stroke="url(#ultraheist-g-red)" stroke-width="9"/>' +
      '<path d="M30 78L68 25" stroke="#ffb3bd" stroke-width="2.5" opacity=".7"/>' +
      '<path d="M27 84l-9 4M27 84l-3 9" stroke="#1d2230" stroke-width="7"/><path d="M27 84l-9 4M27 84l-3 9" stroke="url(#ultraheist-g-steel)" stroke-width="4"/></g>' + glint(73, 24, 6, 0.9),
    torch: '<path class="uh-beam" d="M52 44L97 16V86z" fill="url(#ultraheist-g-beam)" opacity=".9" transform="rotate(-18 52 44)"/>' +
      '<g transform="rotate(-38 40 56)"><rect x="14" y="48" width="40" height="16" rx="4" fill="#20232f" stroke="#08090e" stroke-width="2"/>' +
      '<rect x="18" y="51" width="32" height="3" rx="1.5" fill="#fff" opacity=".22"/><path d="M54 45h12l4-4v30l-4-4H54z" fill="url(#ultraheist-g-steel)" stroke="#08090e" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="68" y="41" width="5" height="30" rx="2" fill="#fff6b0"/><rect x="26" y="52" width="7" height="8" rx="2" fill="#ff3d5e"/>' +
      '<g stroke="#000" stroke-width="1.4" opacity=".5"><path d="M38 49v14M42 49v14M46 49v14"/></g></g>',
    safe: '<circle cx="50" cy="50" r="42" fill="url(#ultraheist-g-steelr)" stroke="#1b2030" stroke-width="3"/>' +
      '<circle cx="50" cy="50" r="33" fill="#1b2232" stroke="#8d98ad" stroke-width="2"/><g class="uh-dialturn">' + dialTicks(50, 50, 32, 26, 40, 1.4, '#d9e2f2') +
      '<g font-family="Chakra Petch, DejaVu Sans, sans-serif" font-weight="700" font-size="8" fill="#e9f0ff" text-anchor="middle"><text x="50" y="30">0</text><text x="71" y="53">25</text><text x="50" y="76">50</text><text x="29" y="53">75</text></g>' +
      '<circle cx="50" cy="50" r="13" fill="url(#ultraheist-g-steelr)" stroke="#1b2030" stroke-width="2"/><rect x="47" y="38" width="6" height="24" rx="3" fill="#30384a"/></g>' +
      '<path d="M50 3l6 9H44z" fill="#ff3048" stroke="#5a0010" stroke-width="1.5"/>',
    car: '<path d="M8 66c0-8 4-12 12-13l10-2 10-14c3-4 6-5 12-5h14c6 0 9 2 12 6l8 12c8 1 12 6 12 13v4c0 3-2 5-5 5H13c-3 0-5-2-5-6z" fill="url(#ultraheist-g-mag)" stroke="#2d0420" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M37 50l7-10c2-2 4-3 7-3h7v13zM62 50V37h5c3 0 5 1 6 3l6 10z" fill="#151a33" stroke="#2d0420" stroke-width="1.6"/>' +
      '<path d="M44 40l-4 6M66 38l-2 6" stroke="#8ff6ff" stroke-width="2.4" opacity=".8"/>' +
      '<path d="M12 60h80" stroke="#ffd1ec" stroke-width="2" opacity=".55"/>' +
      '<rect x="6" y="68" width="90" height="5" rx="2.5" fill="url(#ultraheist-g-steel)"/>' +
      '<circle cx="28" cy="74" r="10" fill="#0b0b12" stroke="#000" stroke-width="2"/><circle cx="28" cy="74" r="5" fill="url(#ultraheist-g-steelr)"/>' +
      '<circle cx="76" cy="74" r="10" fill="#0b0b12" stroke="#000" stroke-width="2"/><circle cx="76" cy="74" r="5" fill="url(#ultraheist-g-steelr)"/>' +
      '<circle cx="94" cy="61" r="3.4" fill="#fff6b0"/><path class="uh-beam" d="M96 59l8-4v12l-8-4z" fill="#fff6b0" opacity=".5"/>',
    gold: '<path d="M10 62l8-14h30l8 14z" fill="url(#ultraheist-g-gold)" stroke="#5a3003" stroke-width="2" stroke-linejoin="round"/><path d="M10 62h46v14H10z" fill="url(#ultraheist-g-goldside)" stroke="#5a3003" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M44 62l8-14h30l8 14z" fill="url(#ultraheist-g-gold)" stroke="#5a3003" stroke-width="2" stroke-linejoin="round"/><path d="M44 62h46v14H44z" fill="url(#ultraheist-g-goldside)" stroke="#5a3003" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M27 38l8-14h30l8 14z" fill="url(#ultraheist-g-gold)" stroke="#5a3003" stroke-width="2" stroke-linejoin="round"/><path d="M27 38h46v14H27z" fill="url(#ultraheist-g-goldside)" stroke="#5a3003" stroke-width="2" stroke-linejoin="round"/>' +
      '<g fill="#3d1f02" opacity=".55"><path d="' + BAT + '" transform="translate(41 41) scale(.15)"/><path d="' + BAT + '" transform="translate(24 65) scale(.15)"/><path d="' + BAT + '" transform="translate(58 65) scale(.15)"/></g>' +
      '<path d="M36 27h22M19 51h22M53 51h22" stroke="#fffbe0" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>' + glint(64, 26, 8, 0) + glint(20, 50, 6, 1.1),
    diamond: '<path d="M50 90L12 40l14-16h48l14 16z" fill="url(#ultraheist-g-ice)" stroke="#0a4e72" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M12 40h76M26 24l10 16 14-16 14 16 10-16M36 40l14 50 14-50" fill="none" stroke="#0a5b84" stroke-width="1.6" stroke-linejoin="round" opacity=".85"/>' +
      '<path d="M26 24l10 16H12zM50 24l14 16H36z" fill="#fff" opacity=".55"/><path d="M36 40l14 50L12 40z" fill="#fff" opacity=".25"/>' +
      glint(80, 17, 9, 0) + glint(18, 76, 6, 0.8) + glint(66, 32, 5, 1.5),
    wild: banditArt('wild'),
    bag: '<g class="uh-sway"><path d="M30 40c-12 10-18 22-16 34 2 12 14 18 36 18s34-6 36-18c2-12-4-24-16-34z" fill="url(#ultraheist-g-burlap)" stroke="#3e260b" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M34 40c-4-8-8-16-2-22 4 4 8 2 10-2 4 6 8 6 12 0 2 4 6 6 10 2 6 6 2 14-2 22z" fill="url(#ultraheist-g-burlap)" stroke="#3e260b" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M30 40c10 4 30 4 40 0" fill="none" stroke="#7a1420" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="' + BAT + '" transform="translate(29 52) scale(.35)" fill="#3e260b" opacity=".75"/>' +
      '<path d="M22 70c2 8 8 12 16 13" fill="none" stroke="#fff3cf" stroke-width="2.4" stroke-linecap="round" opacity=".55"/></g>',
    vault: '<circle class="uh-ledglow" cx="50" cy="50" r="45" fill="url(#ultraheist-g-led)" opacity=".9"/><circle cx="50" cy="50" r="40" fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="3"/>' +
      '<circle cx="50" cy="50" r="31" fill="#2b3346" stroke="#9aa5bb" stroke-width="2.4"/>' +
      '<g fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="1.2">' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { const r = a * Math.PI / 180; return '<circle cx="' + (50 + Math.sin(r) * 36).toFixed(1) + '" cy="' + (50 - Math.cos(r) * 36).toFixed(1) + '" r="2.6"/>'; }).join('') + '</g>' +
      '<g stroke="url(#ultraheist-g-steel)" stroke-width="5" stroke-linecap="round"><path d="M50 24v52M27.5 37l45 26M27.5 63l45-26"/></g>' +
      '<circle cx="50" cy="50" r="10" fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="2"/><circle class="uh-led" cx="50" cy="50" r="4" fill="#ff2a48"/>' +
      '<rect x="28" y="80" width="44" height="13" rx="3" fill="#120208" stroke="#ff2a48" stroke-width="1.6"/><text x="50" y="90.5" text-anchor="middle" font-family="' + COND + '" font-weight="700" font-size="11" letter-spacing="2" fill="#ff5a70">VAULT</text>',
  };
  function spriteSvg() {
    let s = '<svg class="g-ultraheist-defs" aria-hidden="true" focusable="false" width="0" height="0">' + DEFS;
    for (const k in ART) s += '<symbol id="ultraheist-s-' + k + '" viewBox="0 0 100 100" overflow="visible">' + ART[k] + '</symbol>';
    return s + '</svg>';
  }
  const useSym = (name) => '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#ultraheist-s-' + name + '"/></svg>';

  /* the big vault door for the Heist intro (an HTML layer so it can swing open in 3D) */
  function vaultDoorSvg() {
    let bolts = '';
    for (let i = 0; i < 12; i++) { const a = i * 30; bolts += '<rect x="96" y="6" width="8" height="18" rx="3" fill="url(#ultraheist-g-steel)" stroke="#141826" stroke-width="1.4" transform="rotate(' + a + ' 100 100)"/>'; }
    let rivets = '';
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; rivets += '<circle cx="' + (100 + Math.sin(a) * 82).toFixed(1) + '" cy="' + (100 - Math.cos(a) * 82).toFixed(1) + '" r="2.2" fill="#c3cbd9" stroke="#141826" stroke-width=".8"/>'; }
    let spokes = '';
    for (let i = 0; i < 4; i++) spokes += '<g transform="rotate(' + i * 90 + ' 100 100)"><rect x="96" y="56" width="8" height="34" rx="3" fill="url(#ultraheist-g-steel)" stroke="#141826" stroke-width="1.6"/><circle cx="100" cy="54" r="8" fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="1.6"/></g>';
    return '<svg viewBox="0 0 200 200" aria-hidden="true"><g class="vd-bolts">' + bolts + '</g>' +
      '<circle cx="100" cy="100" r="92" fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="3"/>' +
      '<circle cx="100" cy="100" r="86" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>' + rivets +
      '<circle cx="100" cy="100" r="72" fill="#283043" stroke="#9aa5bb" stroke-width="2.5"/>' + dialTicks(100, 100, 71, 64, 60, 1.2, '#7d889e') +
      '<circle cx="100" cy="100" r="58" fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="2" opacity=".35"/>' +
      '<g class="vd-wheel"><circle cx="100" cy="100" r="46" fill="none" stroke="#141826" stroke-width="9"/><circle cx="100" cy="100" r="46" fill="none" stroke="url(#ultraheist-g-steel)" stroke-width="6"/>' + spokes + '</g>' +
      '<circle cx="100" cy="100" r="16" fill="url(#ultraheist-g-steelr)" stroke="#141826" stroke-width="2.4"/><circle class="vd-led" cx="100" cy="100" r="6" fill="#ff2a48"/>' +
      '<path d="' + BAT + '" transform="translate(79 128) scale(.42)" fill="#141826" opacity=".55"/>' +
      '<rect x="183" y="60" width="12" height="22" rx="3" fill="url(#ultraheist-g-steel)" stroke="#141826" stroke-width="1.6"/><rect x="183" y="118" width="12" height="22" rx="3" fill="url(#ultraheist-g-steel)" stroke="#141826" stroke-width="1.6"/></svg>';
  }
  function hoardSvg() {
    const bar = (x, y) => '<g transform="translate(' + x + ' ' + y + ')"><path d="M0 14l6-10h22l6 10z" fill="url(#ultraheist-g-gold)" stroke="#5a3003" stroke-width="1.4"/><path d="M0 14h34v8H0z" fill="url(#ultraheist-g-goldside)" stroke="#5a3003" stroke-width="1.4"/></g>';
    let pile = '';
    [[40, 132], [74, 132], [108, 132], [142, 132], [57, 116], [91, 116], [125, 116], [74, 100], [108, 100], [91, 84]].forEach((p) => { pile += bar(p[0], p[1]); });
    return '<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" fill="#0b0703"/><circle cx="100" cy="100" r="92" fill="url(#ultraheist-g-hoard)"/>' + pile +
      '<g fill="url(#ultraheist-g-burlap)" stroke="#3e260b" stroke-width="1.6"><path d="M28 150c-6 5-8 12-6 18s10 8 18 8 16-2 18-8-1-13-7-18z"/><path d="M150 148c-6 5-8 12-6 18s10 8 18 8 16-2 18-8-1-13-7-18z"/></g>' +
      '<path d="' + star(60, 70, 7) + star(140, 64, 9) + star(100, 52, 6) + '" fill="#fff"/></svg>';
  }

  /* ---------- lobby poster ---------- */
  const POSTER = (function () {
    let wins = ''; let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const towers = [[0, 150, 46], [40, 120, 38], [74, 170, 30], [100, 104, 44], [140, 140, 34], [170, 92, 48], [214, 132, 40], [250, 110, 36], [282, 150, 40]];
    let bld = '';
    for (const [x, y, w] of towers) {
      bld += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (300 - y) + '" fill="#0b1022"/>';
      for (let yy = y + 8; yy < 290; yy += 11) for (let xx = x + 5; xx < x + w - 6; xx += 9) if (rnd() < 0.3) wins += '<rect x="' + xx + '" y="' + yy + '" width="4" height="6" fill="' + (rnd() < 0.2 ? '#ff3d9e' : '#ffd66b') + '" opacity="' + (0.35 + rnd() * 0.6).toFixed(2) + '"/>';
    }
    let rain = ''; for (let i = 0; i < 70; i++) { const x = rnd() * 330 - 10, y = rnd() * 400; rain += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + 'l-5 16" />'; }
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="ultraheist-p-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060f"/><stop offset=".55" stop-color="#151a3d"/><stop offset="1" stop-color="#3a0d3a"/></linearGradient>' +
      '<radialGradient id="ultraheist-p-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff7d6"/><stop offset=".6" stop-color="#ffe7a0" stop-opacity=".9"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="ultraheist-p-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8d0"/><stop offset=".4" stop-color="#ffcf4d"/><stop offset=".75" stop-color="#e08a10"/><stop offset="1" stop-color="#7a4306"/></linearGradient>' +
      '<linearGradient id="ultraheist-p-street" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0d2a"/><stop offset="1" stop-color="#05040a"/></linearGradient>' +
      '<linearGradient id="ultraheist-p-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#9ff6ff" stop-opacity=".35"/><stop offset="1" stop-color="#9ff6ff" stop-opacity="0"/></linearGradient>' +
      '<filter id="ultraheist-p-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<rect width="320" height="400" fill="url(#ultraheist-p-sky)"/>' +
      '<path d="M60 300L20 0h40zM250 300L300 0h-36z" fill="url(#ultraheist-p-beam)"/>' +
      '<circle cx="246" cy="70" r="46" fill="url(#ultraheist-p-moon)"/><path d="' + BAT + '" transform="translate(226 60) scale(.34)" fill="#0b1022" opacity=".85"/>' +
      bld + wins +
      '<rect x="182" y="78" width="70" height="16" rx="3" fill="#120208" stroke="#ff3d9e" stroke-width="1.5" filter="url(#ultraheist-p-glow)"/><text x="217" y="90" text-anchor="middle" font-family="Bebas Neue, TeX Gyre Heros Cn, Arial Narrow, sans-serif" font-size="12" letter-spacing="2.5" fill="#ff7ac0">BANK OF BATS</text>' +
      '<rect y="292" width="320" height="108" fill="url(#ultraheist-p-street)"/>' +
      '<g stroke="#ff2a48" stroke-width="1.6" opacity=".85" filter="url(#ultraheist-p-glow)"><path d="M0 250L320 214M0 276L320 238M0 226L320 262"/></g>' +
      '<g transform="translate(160 236)">' +
      '<path d="' + BAT + '" transform="translate(-120 -40) scale(2)" fill="#1a1230" stroke="#000" stroke-width="1"/>' +
      '<ellipse cx="0" cy="-10" rx="42" ry="38" fill="#3a2a66" stroke="#07040d" stroke-width="3"/>' +
      '<path d="M-36 -34l-10 -36 26 22M36 -34l10 -36 -26 22" fill="#3a2a66" stroke="#07040d" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M-46 -18c14-11 78-11 92 0 2 11-4 20-11 22-14 3-21-6-35-6s-21 9-35 6c-7-2-13-11-11-22z" fill="#07050d"/>' +
      '<ellipse cx="-17" cy="-12" rx="11" ry="8" fill="#fff"/><ellipse cx="17" cy="-12" rx="11" ry="8" fill="#fff"/><circle cx="-14" cy="-11" r="4.5" fill="#07050d"/><circle cx="20" cy="-11" r="4.5" fill="#07050d"/>' +
      '<path d="M-18 10q18 12 36 0" fill="none" stroke="#efe6ff" stroke-width="4" stroke-linecap="round"/><path d="M-12 12l4 9 4-7M6 13l4 7 4-9" fill="#fff"/>' +
      '<ellipse cx="0" cy="-46" rx="58" ry="11" fill="#121018" stroke="#000" stroke-width="2.5"/><path d="M-32 -46c0-22 10-36 32-36s32 14 32 36" fill="#1c1a26" stroke="#000" stroke-width="2.5"/><path d="M-32 -54h64v9h-64z" fill="#ff2e93"/>' +
      '</g>' +
      '<g transform="translate(18 300) scale(.62)">' + '<path d="M30 40c-12 10-18 22-16 34 2 12 14 18 36 18s34-6 36-18c2-12-4-24-16-34z" fill="#c49654" stroke="#3e260b" stroke-width="3"/><path d="M34 40c-4-8-8-16-2-22 4 4 8 2 10-2 4 6 8 6 12 0 2 4 6 6 10 2 6 6 2 14-2 22z" fill="#d8b276" stroke="#3e260b" stroke-width="3"/><path d="M30 40c10 4 30 4 40 0" fill="none" stroke="#7a1420" stroke-width="5"/></g>' +
      '<g transform="translate(236 304) scale(.6)"><path d="M10 62l8-14h30l8 14z" fill="url(#ultraheist-p-gold)" stroke="#5a3003" stroke-width="2.4"/><path d="M10 62h46v14H10z" fill="#b56d0a" stroke="#5a3003" stroke-width="2.4"/><path d="M44 62l8-14h30l8 14z" fill="url(#ultraheist-p-gold)" stroke="#5a3003" stroke-width="2.4"/><path d="M44 62h46v14H44z" fill="#b56d0a" stroke="#5a3003" stroke-width="2.4"/><path d="M27 38l8-14h30l8 14z" fill="url(#ultraheist-p-gold)" stroke="#5a3003" stroke-width="2.4"/><path d="M27 38h46v14H27z" fill="#b56d0a" stroke="#5a3003" stroke-width="2.4"/></g>' +
      '<g stroke="#9fb6ff" stroke-width="1" opacity=".35">' + rain + '</g>' +
      '<g font-family="Bebas Neue, TeX Gyre Heros Cn, Arial Narrow, Impact, sans-serif" text-anchor="middle">' +
      '<text x="160" y="352" font-size="58" letter-spacing="3" fill="#000" opacity=".6" transform="translate(3 4)">BAT BANDITS</text>' +
      '<text x="160" y="352" font-size="58" letter-spacing="3" fill="url(#ultraheist-p-gold)" stroke="#5a3003" stroke-width="1.2">BAT BANDITS</text>' +
      '<text x="160" y="380" font-size="22" letter-spacing="9" fill="#5ff0ff" filter="url(#ultraheist-p-glow)">ULTRANUDGE</text></g>' +
      '<rect x="6" y="6" width="308" height="388" rx="10" fill="none" stroke="#5ff0ff" stroke-opacity=".25" stroke-width="2"/>' +
      '</svg>';
  })();

  /* ---------- the city at night: separate layers so each can drift for parallax ---------- */
  function cityLayers() {
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const svg = (cls, body) => '<svg class="uh-layer ' + cls + '" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + body + '</svg>';
    /* sky: stars, moon, a clock tower far away */
    let stars = '';
    for (let i = 0; i < 70; i++) stars += '<circle class="' + (i % 4 === 0 ? 'tw' : '') + '" style="animation-delay:' + (rnd() * 6).toFixed(1) + 's" cx="' + (rnd() * 1600).toFixed(0) + '" cy="' + (rnd() * 330).toFixed(0) + '" r="' + (0.6 + rnd() * 1.4).toFixed(1) + '" fill="#e6ecff" opacity="' + (0.25 + rnd() * 0.6).toFixed(2) + '"/>';
    const sky = svg('l-sky', '<defs><linearGradient id="ultraheist-c-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02030a"/><stop offset=".55" stop-color="#0e1438"/><stop offset=".85" stop-color="#2a0d3a"/><stop offset="1" stop-color="#3d0e33"/></linearGradient>' +
      '<radialGradient id="ultraheist-c-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff5d0" stop-opacity=".9"/><stop offset=".35" stop-color="#ffe39a" stop-opacity=".35"/><stop offset="1" stop-color="#ffe39a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="ultraheist-c-disc" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffdf0"/><stop offset=".7" stop-color="#ffeec0"/><stop offset="1" stop-color="#e8c97a"/></radialGradient></defs>' +
      '<rect width="1600" height="700" fill="url(#ultraheist-c-sky)"/>' + stars +
      '<circle cx="1250" cy="140" r="170" fill="url(#ultraheist-c-moon)"/><circle cx="1250" cy="140" r="56" fill="url(#ultraheist-c-disc)"/>' +
      '<g fill="#d9bf7c" opacity=".45"><circle cx="1232" cy="124" r="9"/><circle cx="1268" cy="160" r="6"/><circle cx="1262" cy="118" r="4"/><circle cx="1236" cy="160" r="4.5"/></g>');
    /* far skyline with a clock tower */
    let far = '';
    for (let x = -40; x < 1640;) { const w = 36 + rnd() * 62, y = 300 + rnd() * 150; far += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + (700 - y).toFixed(0) + '"/>'; if (rnd() < 0.2) far += '<path d="M' + (x + w / 2 - 6).toFixed(0) + ' ' + y.toFixed(0) + 'l6-34 6 34z"/>'; x += w + 3; }
    const tower = '<g transform="translate(330 0)"><rect x="0" y="210" width="54" height="490"/><path d="M-6 214h66l-8-14H2z"/><path d="M4 200l23-70 23 70z"/><rect x="25" y="96" width="4" height="36"/>' +
      '<circle cx="27" cy="248" r="18" fill="#ffe7a8" opacity=".85"/><circle cx="27" cy="248" r="18" fill="none" stroke="#3a2a10" stroke-width="2"/><path d="M27 248v-12M27 248l8 5" stroke="#3a2a10" stroke-width="2.4" stroke-linecap="round"/></g>';
    const farL = svg('l-far', '<g fill="#0b1026">' + far + tower + '</g>');
    /* mid: buildings with lit windows, a neon bank sign, rooftop beacons */
    let mid = '', wins = '', beacons = '';
    for (let x = -30; x < 1630;) {
      const w = 70 + rnd() * 110, y = 370 + rnd() * 190;
      mid += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + (700 - y).toFixed(0) + '"/>';
      if (rnd() < 0.45) { mid += '<rect x="' + (x + w / 2 - 2).toFixed(0) + '" y="' + (y - 34).toFixed(0) + '" width="4" height="34"/>'; beacons += '<circle class="bk" style="animation-delay:' + (rnd() * 2).toFixed(2) + 's" cx="' + (x + w / 2).toFixed(0) + '" cy="' + (y - 36).toFixed(0) + '" r="3.2" fill="#ff2a48"/>'; }
      else if (rnd() < 0.5) mid += '<path d="M' + (x + 10).toFixed(0) + ' ' + y.toFixed(0) + 'v-26h22v26zM' + (x + 6).toFixed(0) + ' ' + (y - 26).toFixed(0) + 'h30l-15-12z"/>';
      for (let yy = y + 14; yy < 680; yy += 18) for (let xx = x + 8; xx < x + w - 10; xx += 14) if (rnd() < 0.22) { const fl = rnd() < 0.07; wins += '<rect' + (fl ? ' class="fl" style="animation-delay:' + (rnd() * 9).toFixed(1) + 's"' : '') + ' x="' + xx.toFixed(0) + '" y="' + yy.toFixed(0) + '" width="6" height="9" fill="' + (rnd() < 0.15 ? '#ff4fa8' : rnd() < 0.3 ? '#7ff2ff' : '#ffd36b') + '" opacity="' + (0.25 + rnd() * 0.6).toFixed(2) + '"/>'; }
      x += w + 6;
    }
    const sign = '<g class="neon" transform="translate(1040 382)"><rect x="0" y="0" width="190" height="40" rx="6" fill="#12030c" stroke="#ff3d9e" stroke-width="3"/>' +
      '<text x="95" y="30" text-anchor="middle" font-family="' + COND + '" font-size="28" letter-spacing="5" fill="#ff8fcb">BANK OF BATS</text><path d="M30 40v40M160 40v40" stroke="#05060f" stroke-width="5"/></g>';
    const midL = svg('l-mid', '<g fill="#070a1a">' + mid + '</g><g class="wins">' + wins + '</g>' + beacons + sign);
    /* near: chimney pots, aerials and a water tank on the rooftops */
    let near = '';
    for (let x = -60; x < 1660;) {
      const w = 160 + rnd() * 200, y = 560 + rnd() * 70;
      near += '<path d="M' + x.toFixed(0) + ' 700V' + y.toFixed(0) + 'h' + w.toFixed(0) + 'V700z"/>';
      const kind = rnd();
      if (kind < 0.4) for (let k = 0; k < 3; k++) near += '<rect x="' + (x + 24 + k * 18).toFixed(0) + '" y="' + (y - 26).toFixed(0) + '" width="12" height="26"/><rect x="' + (x + 22 + k * 18).toFixed(0) + '" y="' + (y - 30).toFixed(0) + '" width="16" height="5"/>';
      else if (kind < 0.7) near += '<path d="M' + (x + w * 0.6).toFixed(0) + ' ' + y.toFixed(0) + 'v-60M' + (x + w * 0.6 - 18).toFixed(0) + ' ' + (y - 44).toFixed(0) + 'h36M' + (x + w * 0.6 - 12).toFixed(0) + ' ' + (y - 30).toFixed(0) + 'h24" stroke="#04050c" stroke-width="3"/>';
      else near += '<path d="M' + (x + 30).toFixed(0) + ' ' + y.toFixed(0) + 'l6-18h40l6 18z"/><rect x="' + (x + 34).toFixed(0) + '" y="' + (y - 56).toFixed(0) + '" width="44" height="40" rx="3"/><path d="M' + (x + 30).toFixed(0) + ' ' + (y - 56).toFixed(0) + 'l26-14 26 14z"/>';
      x += w + 20 + rnd() * 40;
    }
    const nearL = svg('l-near', '<g fill="#04050c">' + near + '</g>');
    return sky + farL + midL + nearL;
  }

  /* ================= state ================= */
  let busy = false, phase = 'idle', turbo = false, skipping = false, devSpeed = 1, devNext = null, devLog = null;
  let auto = 0, autoLoss = 0, autoStopFs = true, autoFloor = 0, autoPick = { n: 25, loss: 50 };
  let stakeCtl = null, cell = 80, cellH = 80, gap = 6, mode = 'base', reels = [], unitNow = 5, multShown = 1, layoutMode = '';
  let spinState = null, mascotT = 0;
  const sess = { spins: 0, hits: 0, heists: 0, best: 0 };
  const T = (ms) => ms * (turbo ? 0.55 : 1) * (skipping ? 0.12 : 1) * devSpeed * (RM ? 0.6 : 1);
  const nap = (ms) => S.sleep(T(ms));
  const fmtS = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? (Math.round(n / 100) / 10) + 'K' : Batty.fmt(n));
  const tierOf = (m) => (m >= 12 ? 4 : m >= 7 ? 3 : m >= 4 ? 2 : m >= 2 ? 1 : 0);

  /* ---------- sound: a noir heist kit ---------- */
  const A = () => Batty.audio;
  const SND = {
    clunk() { A().tone({ f: 120, f2: 48, d: 0.18, type: 'sine', v: 0.42 }); A().noise({ d: 0.07, v: 0.16, lp: 1400 }); A().tone({ f: 2400, f2: 1800, d: 0.03, type: 'square', v: 0.05, t: 0.01 }); },
    stop(i) { A().tone({ f: 160 - i * 10, f2: 52, d: 0.14, type: 'sine', v: 0.36 }); A().noise({ d: 0.05, v: 0.1, lp: 2000 }); A().tone({ f: 1900 - i * 90, d: 0.025, type: 'square', v: 0.03, t: 0.005 }); },
    spin() { A().noise({ d: 0.5, v: 0.08, lp: 400, f2: 2600 }); A().tone({ f: 55, f2: 110, d: 0.45, type: 'sawtooth', v: 0.05 }); },
    riser(d) { A().tone({ f: 180, f2: 760, d, type: 'sawtooth', v: 0.045 }); A().tone({ f: 362, f2: 1520, d, type: 'triangle', v: 0.035 }); for (let i = 0; i < Math.floor(d / 0.32); i++) A().tone({ f: 70, f2: 45, d: 0.12, type: 'sine', v: 0.32, t: i * 0.32 }); },
    drop() { A().tone({ f: 1100, f2: 240, d: 0.32, type: 'triangle', v: 0.12 }); A().noise({ d: 0.25, v: 0.08, hp: 3000 }); },
    land() { A().tone({ f: 90, f2: 38, d: 0.24, type: 'sine', v: 0.5 }); A().noise({ d: 0.12, v: 0.14, lp: 900 }); A().tone({ f: 330, d: 0.12, type: 'square', v: 0.05, t: 0.04 }); },
    wink() { A().tone({ f: 1400, f2: 2400, d: 0.08, type: 'sine', v: 0.08 }); },
    wind() { A().noise({ d: 0.12, v: 0.07, hp: 700, f2: 3200 }); A().tone({ f: 140, f2: 220, d: 0.1, type: 'triangle', v: 0.06 }); },
    thump(m) {
      const k = Math.min(m, 30);
      A().tone({ f: 82, f2: 30, d: 0.42, type: 'sine', v: 0.6 }); A().noise({ d: 0.2, v: 0.24, lp: 800, f2: 120 });
      A().tone({ f: 980 + k * 45, f2: 760 + k * 40, d: 0.09, type: 'square', v: 0.05, t: 0.01 });
      A().tone({ f: 330 * Math.pow(1.0595, k), d: 0.32, type: 'triangle', v: 0.09, t: 0.05 });
    },
    mult(m) { const f = 330 * Math.pow(1.0595, Math.min(m, 30)); A().tone({ f, f2: f * 2, d: 0.16, type: 'sawtooth', v: 0.07 }); A().tone({ f: f * 1.5, d: 0.28, type: 'square', v: 0.045, t: 0.08 }); A().tone({ f: f * 2, d: 0.4, type: 'sine', v: 0.06, t: 0.14 }); },
    win(k) { const base = [392, 440, 494, 523, 587, 659][Math.min(5, k)]; A().seq([base, base * 1.26, base * 1.5, base * 2], { step: 0.065, type: 'triangle', v: 0.14 }); },
    bag() { A().tone({ f: 1500, d: 0.05, type: 'square', v: 0.06 }); A().tone({ f: 2250, d: 0.12, type: 'square', v: 0.06, t: 0.05 }); A().noise({ d: 0.08, v: 0.06, hp: 5000, t: 0.02 }); },
    till() { A().seq([1568, 2093, 2637], { step: 0.05, type: 'square', v: 0.07 }); A().noise({ d: 0.25, v: 0.07, hp: 6000, t: 0.12 }); },
    alarm() { for (let i = 0; i < 4; i++) A().tone({ f: 740, f2: 990, d: 0.22, type: 'square', v: 0.07, t: i * 0.26 }); },
    siren(n) { for (let i = 0; i < (n || 3); i++) { A().tone({ f: 620, f2: 1180, d: 0.42, type: 'sawtooth', v: 0.045, t: i * 0.84 }); A().tone({ f: 1180, f2: 620, d: 0.42, type: 'sawtooth', v: 0.045, t: i * 0.84 + 0.42 }); } },
    heart() { A().tone({ f: 64, f2: 40, d: 0.14, type: 'sine', v: 0.5 }); A().tone({ f: 58, f2: 38, d: 0.16, type: 'sine', v: 0.42, t: 0.2 }); },
    creak() { A().noise({ d: 0.9, v: 0.1, lp: 520, f2: 140 }); A().tone({ f: 46, f2: 38, d: 0.9, type: 'sawtooth', v: 0.08 }); for (let i = 0; i < 8; i++) A().tone({ f: 2100, d: 0.018, type: 'square', v: 0.04, t: i * 0.1 }); },
    bolts() { for (let i = 0; i < 4; i++) { A().tone({ f: 150, f2: 60, d: 0.1, type: 'sine', v: 0.38, t: i * 0.07 }); A().noise({ d: 0.05, v: 0.1, lp: 1600, t: i * 0.07 }); } },
    open() { A().noise({ d: 1.1, v: 0.16, lp: 300, f2: 4200 }); A().seq([262, 330, 392, 523], { step: 0.11, type: 'triangle', v: 0.1 }); A().tone({ f: 1046, d: 1.2, type: 'sine', v: 0.06, t: 0.42 }); A().tone({ f: 1568, d: 1.0, type: 'sine', v: 0.04, t: 0.5 }); },
    tick() { A().tone({ f: 2600, d: 0.015, type: 'square', v: 0.03 }); },
    count() { A().tone({ f: 1760 + Math.random() * 300, d: 0.03, type: 'triangle', v: 0.05 }); },
    sting() { A().seq([196, 0, 233, 262, 0, 311, [294, 3]], { step: 0.12, type: 'sawtooth', v: 0.07 }); A().seq([98, 0, 0, 98, 0, 0, [73, 3]], { step: 0.12, type: 'sine', v: 0.18 }); },
    take() { A().seq([262, 330, 392, 523, 659, [784, 4]], { step: 0.09, type: 'sawtooth', v: 0.09 }); A().seq([131, 0, 196, 0, [262, 5]], { step: 0.12, type: 'square', v: 0.06 }); },
    haul() { A().seq([523, 659, 784, 1046, [1318, 3]], { step: 0.07, type: 'square', v: 0.07 }); A().seq([131, 196, [262, 4]], { step: 0.1, type: 'triangle', v: 0.14 }); },
    fall() { A().tone({ f: 900, f2: 160, d: 0.45, type: 'triangle', v: 0.08 }); },
    rumble() { A().noise({ d: 1.6, v: 0.05, lp: 220, f2: 60 }); },
    miss() { A().tone({ f: 180, f2: 120, d: 0.2, type: 'triangle', v: 0.06 }); },
  };
  const snd = (k, a) => { try { SND[k](a); } catch (e) { /* audio optional */ } };

  /* ================= DOM ================= */
  function mount(el, Bt) {
    B = Bt; h = B.h; S = B.scope(); root = el; busy = false; phase = 'idle'; auto = 0; skipping = false; mode = 'base'; reels = []; devNext = null; turbo = false; multShown = 1; spinState = null; layoutMode = '';
    RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    DEV = devWanted() && !B.online;
    root.innerHTML = spriteSvg();
    root.classList.toggle('rm', RM);
    E = {};
    /* ---- the world ---- */
    E.bg = h('div', { class: 'uh-bg', 'aria-hidden': 'true' });
    E.beams = h('div', { class: 'uh-beams' }, h('i', { class: 'b1' }), h('i', { class: 'b2' }), h('i', { class: 'b3' }));
    E.clouds = h('div', { class: 'uh-clouds' }, h('i'), h('i'), h('i'));
    E.flyers = h('div', { class: 'uh-flyers', html: '<svg viewBox="0 0 100 40"><path d="' + BAT + '" fill="#05060f"/></svg><svg viewBox="0 0 100 40"><path d="' + BAT + '" fill="#05060f"/></svg>' });
    E.bolt = h('div', { class: 'uh-bolt' });
    E.rain = h('canvas', { class: 'uh-rain' });
    E.bg.innerHTML = cityLayers();
    E.bg.insertBefore(E.beams, E.bg.children[1]);
    E.bg.insertBefore(E.clouds, E.bg.children[1]);
    E.bg.insertBefore(E.flyers, E.bg.children[3]);
    E.bg.append(h('div', { class: 'uh-fog' }), h('div', { class: 'uh-street' }), E.rain, h('div', { class: 'uh-police' }, h('i', { class: 'r' }), h('i', { class: 'b' })), E.bolt, h('div', { class: 'uh-flash' }), h('div', { class: 'uh-vig' }));

    /* logo */
    E.logo = h('div', { class: 'uh-logo' }, h('b', null, 'Bat Bandits'), h('i', null, 'UltraNudge'));
    /* the multiplier: a safe dial that turns a notch every nudge, ringed with LEDs */
    let segs = '';
    for (let i = 0; i < 12; i++) { const a0 = (i / 12) * 360 + 3, a1 = ((i + 1) / 12) * 360 - 3, r = 47; const p = (a) => { const t = (a - 90) * Math.PI / 180; return (50 + Math.cos(t) * r).toFixed(2) + ' ' + (50 + Math.sin(t) * r).toFixed(2); }; segs += '<path d="M' + p(a0) + 'A' + r + ' ' + r + ' 0 0 1 ' + p(a1) + '"/>'; }
    E.leds = h('div', { class: 'leds', html: '<svg viewBox="0 0 100 100" aria-hidden="true">' + segs + '</svg>' });
    E.dialRing = h('div', { class: 'ring', html: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" fill="url(#ultraheist-g-steelr)" stroke="#0b0f1a" stroke-width="2"/><circle cx="50" cy="50" r="35" fill="#121828" stroke="#7d889e" stroke-width="1.5"/>' + dialTicks(50, 50, 42, 37, 50, 1, '#1b2232') + '</svg>' });
    E.multNum = h('output', { 'aria-live': 'off' }, '×1');
    E.dial = h('div', { class: 'uh-dial t0', title: 'Win multiplier' }, h('i', { class: 'aura' }), E.leds, E.dialRing, h('div', { class: 'face' }, h('small', null, 'Multi'), E.multNum), h('i', { class: 'shock' }), h('i', { class: 'pin' }));
    /* heist board: spins left, alarm meter, hint */
    E.bulbs = []; const bulbs = h('div', { class: 'bulbs' });
    for (let i = 0; i < 4; i++) { const b = h('i'); E.bulbs.push(b); bulbs.append(b); }
    E.spinsLeft = h('b', null, '8');
    E.meter = h('div', { class: 'uh-meter' }, h('div', { class: 'lbl' }, h('span', null, 'Alarm'), h('small', null, '4 bags = +2 spins')), bulbs);
    E.fsBox = h('div', { class: 'uh-fsbox', hidden: true }, h('small', null, 'Heist spins'), E.spinsLeft);
    E.hint = h('div', { class: 'uh-hint', html: useSym('vault') + '<span><b>3 Vaults</b> crack the Heist</span>' });
    E.board = h('div', { class: 'uh-board' }, E.fsBox, E.meter, E.hint);
    /* side panels (wide screens) */
    E.left = h('aside', { class: 'uh-side left' }, h('h3', null, 'How the job works'),
      h('div', { class: 'tip', html: useSym('wild') + '<p><b>Bandit Wild</b> abseils onto reels 2-4 and starts an <b>UltraNudge</b>: the reels thump down a row, he rides down with them and the multiplier climbs +1, again and again until he drops off the bottom.</p>' }),
      h('div', { class: 'tip', html: useSym('bag') + '<p><b>Cash Bags</b> hold 1× to 25× stake. Every Bandit on screen grabs every bag after each step.</p>' }),
      h('div', { class: 'tip', html: useSym('vault') + '<p><b>3 Vaults</b> start <b>Heist Free Spins</b>: every win nudges, the multiplier never resets and multiplies bags too.</p>' }));
    E.pays = h('div', { class: 'pays' });
    for (let s = SYM.DIAMOND; s >= SYM.PRINT; s--) {
      if (s < SYM.SAFE && s !== SYM.TORCH && s !== SYM.CROWBAR && s !== SYM.PRINT) continue;
      E.pays.append(h('div', { class: 'pr' }, h('span', { class: 'ic', html: useSym(NAMES[s]) }), h('span', { class: 'v', 'data-s': s })));
    }
    E.right = h('aside', { class: 'uh-side right' }, h('h3', null, 'The take', h('small', null, '5 / 4 / 3 in a row')), E.pays);

    /* ---- the vault machine ---- */
    E.reelsBox = h('div', { class: 'uh-reels' });
    for (let r = 0; r < REELS; r++) {
      const strip = h('div', { class: 'uh-strip' }), el2 = h('div', { class: 'uh-reel' }, strip, h('i', { class: 'dust' }), h('i', { class: 'anti' }));
      E.reelsBox.append(el2);
      reels.push({ i: r, el: el2, strip, cells: [], pos: 0, set: 'base', off: 1 });
    }
    E.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); E.lines.setAttribute('class', 'uh-lines'); E.lines.setAttribute('aria-hidden', 'true');
    E.bandits = h('div', { class: 'uh-bandits' });
    E.fly = h('div', { class: 'uh-fly' });
    E.lasers = h('div', { class: 'uh-lasers', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    E.stepTag = h('div', { class: 'uh-steptag' });
    E.pop = h('div', { class: 'uh-pop' });
    E.multFly = h('div', { class: 'uh-multfly' });
    E.chev = h('div', { class: 'uh-chev', 'aria-hidden': 'true', html: '<svg viewBox="0 0 40 60"><path d="M6 8l14 12L34 8M6 26l14 12 14-12M6 44l14 12 14-12"/></svg><svg viewBox="0 0 40 60"><path d="M6 8l14 12L34 8M6 26l14 12 14-12M6 44l14 12 14-12"/></svg>' });
    E.sweep = h('div', { class: 'uh-sweep' });
    E.window = h('div', { class: 'uh-window' }, E.reelsBox, h('i', { class: 'glass' }), E.lines, E.sweep, E.bandits, E.lasers, E.chev, E.fly, E.pop, E.multFly, E.stepTag);
    E.mascot = h('div', { class: 'uh-mascot', 'aria-hidden': 'true', html: banditSvg('mascot') });
    E.machine = h('div', { class: 'uh-machine' }, h('i', { class: 'bolt a' }), h('i', { class: 'bolt b' }), h('i', { class: 'bolt c' }), h('i', { class: 'bolt d' }),
      h('i', { class: 'uh-beacon l' }), h('i', { class: 'uh-beacon r' }), E.window, E.mascot);
    E.hud = h('div', { class: 'uh-hud' }, E.dial, E.logo, E.board);

    /* win bar + status line (aria-live) */
    E.win = h('output', { class: 'amt' }, '0');
    E.winLbl = h('small', null, 'Win');
    E.msg = h('span', { class: 'msg', role: 'status', 'aria-live': 'polite' }, 'Rain on the windows. A vault full of gold. Let’s go to work.');
    E.winbar = h('div', { class: 'uh-winbar' }, h('div', { class: 'w' }, E.winLbl, E.win), E.msg);

    /* controls */
    const stakeBox = h('div', { class: 'uh-stakebox' });
    stakeCtl = B.ui.stake(stakeBox, { id: ID, label: 'Stake · 40 lines', onChange: paintStake });
    E.buyBtn = h('button', { class: 'uh-btn buy', type: 'button', id: 'ultraheist-buy', 'aria-label': 'Buy Heist Free Spins', onclick: openBuy }, h('b', null, 'Buy Heist'), h('small', null, ''));
    E.spin = h('button', { class: 'uh-spin', type: 'button', id: 'ultraheist-spin', 'aria-label': 'Spin', onclick: primary, html:
      '<svg class="i-spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3" opacity=".35"/>' + dialTicks(50, 50, 44, 38, 30, 2, 'currentColor') + '<path d="M50 28a22 22 0 1 0 21 15" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M60 26l14 3-6 13z" fill="currentColor"/></svg>' +
      '<svg class="i-stop" viewBox="0 0 100 100" aria-hidden="true"><rect x="31" y="31" width="38" height="38" rx="6" fill="currentColor"/></svg>' +
      '<svg class="i-skip" viewBox="0 0 100 100" aria-hidden="true"><path d="M24 30l24 20-24 20zM52 30l24 20-24 20z" fill="currentColor"/></svg><em></em>' });
    E.autoBtn = h('button', { class: 'uh-btn auto', type: 'button', id: 'ultraheist-auto', 'aria-label': 'Autoplay', onclick: autoClick, html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 0 1 12-5l2-2v6h-6l2.4-2.4A5 5 0 0 0 7 12zM19 12a7 7 0 0 1-12 5l-2 2v-6h6l-2.4 2.4A5 5 0 0 0 17 12z" fill="currentColor"/></svg><b>Auto</b><small>off</small>' });
    E.turboBtn = h('button', { class: 'uh-btn turbo', type: 'button', id: 'ultraheist-turbo', 'aria-label': 'Turbo', 'aria-pressed': 'false', onclick: toggleTurbo, html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg><b>Turbo</b><small>off</small>' });
    E.autoMenu = buildAutoMenu();
    E.ctl = h('div', { class: 'uh-ctl' }, h('div', { class: 'l' }, stakeBox, E.buyBtn), E.spin, h('div', { class: 'r' }, E.autoBtn, E.turboBtn), E.autoMenu);
    E.ov = h('div', { class: 'uh-ov', hidden: true });
    E.banner = h('div', { class: 'uh-banner', hidden: true, role: 'status' });

    E.center = h('div', { class: 'uh-center' }, E.hud, E.machine, E.winbar);
    E.wrap = h('div', { class: 'uh-wrap' }, E.left, E.center, E.right, E.ctl);
    root.append(E.bg, E.wrap, E.banner, E.ov);

    /* tap the reels to slam-stop or hurry a presentation along */
    E.window.addEventListener('click', () => { if (busy) primary(); });

    /* opening board: a real strip window */
    for (const R of reels) { R.set = 'base'; R.pos = Math.floor(Math.random() * M.STRIPS[R.i].length); R.cells = []; R.strip.textContent = ''; normalise(R, null); }
    paintStake(); paintCtl(); paintMult(1, false); paintBoard();

    const ro = new ResizeObserver(layout); ro.observe(root); S._ro = ro; S.on(window, 'resize', layout); layout();
    S.on(document, 'keydown', onKey);
    startRain(); lightning(); idleBits();
    if (DEV) {
      devLog = { rounds: 0, staked: 0, won: 0, start: Batty.wallet.balance, heists: 0, capped: 0 };
      const want = (pred) => { devNext = () => { for (let i = 0; i < 500000; i++) { const o = M.spin(Batty.rng); if (pred(o)) return o; } return M.spin(Batty.rng); }; };
      window.__ultraheistDev = {
        /* next practice spin is drawn until pred(outcome) holds (a genuine outcome from the maths, just filtered) */
        next: want,
        feature() { want((o) => !!o.fs); }, nudge(n) { want((o) => o.steps.length >= (n || 4) && !o.fs); }, big() { want((o) => o.totalWin >= 300 && !o.fs); },
        tease() { want((o) => !o.fs && o.steps[0].g.slice(0, 4).includes(SYM.VAULT) && o.steps[0].g.slice(8, 12).includes(SYM.VAULT)); },
        set speed(v) { devSpeed = v; }, get speed() { return devSpeed; },
        get log() { return devLog; }, get busy() { return busy; }, get phase() { return phase; }, get auto() { return auto; }, get mode() { return mode; }, M,
      };
    }
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    S = null; root = null; E = null; reels = []; busy = false; auto = 0; devNext = null; devSpeed = 1; spinState = null; bandits = [];
    if (window.__ultraheistDev) delete window.__ultraheistDev;
  }

  /* ---------- layout: fit the 5x4 window, HUD and controls into whatever we have ---------- */
  function layout() {
    if (!root || !E) return;
    const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return;
    const land = H < 560 && W > H * 1.2;
    const wide = !land && W >= 980 && H >= 560;
    const m = land ? 'land' : wide ? 'wide' : 'narrow';
    if (m !== layoutMode) { root.classList.remove('wide', 'narrow', 'land'); root.classList.add(m); layoutMode = m; }
    root.classList.toggle('short', H < 680);
    gap = W < 420 || land ? 4 : 6;
    let cw, ch;
    if (wide) {
      const side = Math.round(Math.max(200, Math.min(270, W * 0.2)));
      root.style.setProperty('--side', side + 'px');
      const hudH = Math.max(84, Math.min(124, H * 0.13)), ctlH = 112;
      const availW = W - side * 2 - 44 - 40 - 36, availH = H - hudH - 52 - ctlH - 34 - 44;
      cw = (availW - gap * 4) / 5; ch = availH / 4;
    } else if (land) {
      const lw = Math.round(Math.max(150, Math.min(230, W * 0.23))), rw = Math.round(Math.max(150, Math.min(210, W * 0.21)));
      root.style.setProperty('--lw', lw + 'px'); root.style.setProperty('--rw', rw + 'px');
      const availW = W - lw - rw - 32 - 16, availH = H - 12 - 16;
      cw = (availW - gap * 4) / 5; ch = availH / 4;
    } else {
      const ctlH = W < 400 ? 128 : 138, hudH = Math.max(72, Math.min(110, H * 0.12));
      const availW = Math.min(W, 640) - 16 - 18, availH = H - ctlH - hudH - 46 - 34 - 26;
      cw = (availW - gap * 4) / 5; ch = availH / 4;
    }
    cell = Math.floor(Math.max(44, Math.min(150, cw, ch)));
    cellH = wide || land ? cell : Math.floor(Math.max(cell, Math.min(cell * 1.22, ch)));
    root.style.setProperty('--cell', cell + 'px'); root.style.setProperty('--cellh', cellH + 'px'); root.style.setProperty('--gap', gap + 'px');
    fitLogo();
    for (const R of reels) place(R, R.off || 1);
    paintBandits();
    sizeRain();
  }
  /* shrink the logo lettering until it fits (fallback fonts are much wider than Bebas Neue) */
  function fitLogo() {
    const b = E.logo.firstChild; b.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(b).fontSize) || 40;
    for (let i = 0; i < 30 && b.scrollWidth > E.logo.clientWidth + 1 && fs > 14; i++) { fs -= 2; b.style.fontSize = fs + 'px'; }
  }

  /* ================= reels ================= */
  const stripOf = (R) => (R.set === 'free' ? M.FREE_STRIPS : M.STRIPS)[R.i];
  const symAt = (R, p) => { const st = stripOf(R); return st[((p % st.length) + st.length) % st.length]; };
  const ty = (off) => 'translate3d(0,' + (-off * cellH).toFixed(2) + 'px,0)';
  function makeCell(sym, bag) {
    const c = h('div', { class: 'uh-cell s-' + NAMES[sym], html: useSym(NAMES[sym]) });
    c._sym = sym;
    if (sym === SYM.BAG) { const t = h('span', { class: 'val' }); c.append(t); setBag(c, bag); }
    return c;
  }
  function setBag(c, v) {
    if (c._sym !== SYM.BAG) return;
    const t = c.querySelector('.val');
    c.classList.toggle('empty', v === -1);
    if (v > 0) { c._bag = v; t.textContent = fmtS(v * unitNow); t.hidden = false; c.classList.toggle('big', v >= 200); }
    else if (v === -1) { t.textContent = 'grabbed'; t.hidden = false; }
    else t.hidden = !c._bag;
  }
  function place(R, off) { R.off = off; R.strip.style.transform = ty(off); }
  /* rebuild a reel as [above, 4 visible, below] at strip position pos */
  function normalise(R, bags) {
    const kids = [];
    kids.push(makeCell(symAt(R, R.pos - 1), 0));
    for (let k = 0; k < ROWS; k++) kids.push(makeCell(symAt(R, R.pos + k), bags ? bags[k] : (symAt(R, R.pos + k) === SYM.BAG ? M.CFG.bagValues[(R.i + k) % 3] : 0)));
    kids.push(makeCell(symAt(R, R.pos + ROWS), 0));
    R.strip.textContent = ''; R.strip.append(...kids); R.cells = kids;
    place(R, 1);
  }
  const vis = (R, k) => R.cells[R.off + k];
  /* which reel (if any) gets the Vault tease: Vaults already showing on reels 1 and 3, reel 5 still to land */
  function teaseReel(g) {
    const has = (r) => { for (let k = 0; k < ROWS; k++) if (g[r * ROWS + k] === SYM.VAULT) return true; return false; };
    return has(0) && has(2) ? 4 : -1;
  }
  /* Spin every reel to its stop with a back-kick, motion blur, a staggered stop with overshoot, a thud and dust.
     bagsOf(r) -> [4 bag values] for the visible window. tease: reel index that gets the slow, glowing anticipation. */
  function spinTo(stops, set, bagsOf, quick, tease) {
    snd('spin');
    const st = { reels: [], slammed: false };
    spinState = st;
    const kickT = RM ? 0 : T(quick ? 70 : 100), accT = T(quick ? 110 : 170), over = RM ? 0 : 0.2, kick = RM ? 0 : 0.24;
    const vCells = 1 / (quick ? 40 : 48);    // cruise speed in cells per ms of real time (before T scaling)
    const all = [];
    for (const R of reels) {
      const old = R.cells.slice(R.off, R.off + ROWS + 1).map((c) => [c._sym, c._bag || 0]);
      R.set = set; R.pos = stops[R.i];
      let run = T((quick ? 380 : 760) + R.i * (quick ? 90 : 170));
      const decT = tease >= 0 && R.i >= tease ? T(1500) : T(quick ? 170 : 290);
      if (tease >= 0 && R.i >= tease) run += T(1500) + T(900) * (R.i - tease);
      const cruise = Math.max(0, run - accT - decT);
      const extra = Math.max(4, Math.round(vCells * (accT / 2 + cruise + decT / 2) - ROWS));
      const bags = bagsOf(R.i), kids = [makeCell(symAt(R, R.pos - 1), 0)];
      for (let k = 0; k < ROWS; k++) kids.push(makeCell(symAt(R, R.pos + k), bags[k]));
      for (let k = 0; k < extra; k++) kids.push(makeCell(symAt(R, R.pos + ROWS + k), 0));
      for (const [s, b] of old) kids.push(makeCell(s, b));
      R.strip.textContent = ''; R.strip.append(...kids); R.cells = kids;
      const S0 = 1 + ROWS + extra;
      place(R, 1);
      R.el.classList.remove('thud', 'tease');
      /* travel from the top of the back-kick to the overshoot point, with matched speeds at each joint */
      const D = (S0 + kick) - (1 - over), v = D / (accT / 2 + cruise + decT / 2);
      const dA = v * accT / 2, dD = v * decT / 2;
      const settle = RM ? 0 : T(quick ? 110 : 160), total = kickT + accT + cruise + decT + settle;
      const fr = [{ transform: ty(S0), offset: 0, easing: kickT ? 'cubic-bezier(.2,.6,.35,1)' : 'cubic-bezier(.33,0,.67,.33)' }];
      if (kickT) fr.push({ transform: ty(S0 + kick), offset: kickT / total, easing: 'cubic-bezier(.33,0,.67,.33)' });
      fr.push({ transform: ty(S0 + kick - dA), offset: (kickT + accT) / total, easing: 'linear' });
      fr.push({ transform: ty(1 - over + dD), offset: (kickT + accT + cruise) / total, easing: 'cubic-bezier(.33,.67,.6,1)' });
      if (settle) fr.push({ transform: ty(1 - over), offset: (kickT + accT + cruise + decT) / total, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      fr.push({ transform: ty(1), offset: 1 });
      const anim = R.strip.animate(fr, { duration: total });
      const ent = { R, anim, stopped: false, done: false, res: null };
      ent.p = new Promise((res) => { ent.res = res; });
      ent.stop = () => {
        if (ent.stopped || !E) return; ent.stopped = true;
        R.el.classList.remove('spinning', 'tease'); void R.el.offsetWidth; R.el.classList.add('thud');
        snd('stop', R.i);
        if (!RM && !st.slammed) { const r = R.el.getBoundingClientRect(); B.fx.burst({ x: r.left + r.width / 2, y: r.bottom - 4, kind: 'spark', count: 5, power: 0.28 }); }
        /* the Vault tease: two Vaults in, the last reel slows right down, glows and shakes */
        if (tease >= 0 && R.i === tease - 1 && !st.slammed) { for (const e2 of st.reels) if (e2.R.i >= tease && !e2.stopped) e2.R.el.classList.add('tease'); root.classList.add('tense'); mascot('nervous'); snd('riser', T(1500) / 1000 + 0.3); setMsg('Two Vaults… one more cracks the Heist', 'alarm'); }
        if (R.i >= tease && tease >= 0 && R.i === REELS - 1) root.classList.remove('tense');
      };
      ent.finish = () => {
        if (ent.done || !E) return; ent.done = true;
        R.cells.splice(1 + ROWS + 1).forEach((c) => c.remove()); place(R, 1);
        ent.res();
      };
      st.reels.push(ent);
      R.el.classList.add('spinning');
      S.timeout(() => { if (!st.slammed) R.el.classList.remove('spinning'); }, Math.max(0, kickT + accT + cruise + decT * 0.45));
      S.timeout(() => { if (!st.slammed) ent.stop(); }, kickT + accT + cruise + decT);
      S.timeout(() => { if (!st.slammed) ent.finish(); }, total + 10);
      all.push(ent.p);
    }
    return Promise.all(all).then(() => { if (spinState === st) spinState = null; root && root.classList.remove('tense'); });
  }
  /* Slam-stop: every reel still turning lands at once, with a short bounce */
  function slamStop() {
    const st = spinState; if (!st || st.slammed) return;
    st.slammed = true;
    let k = 0;
    for (const ent of st.reels) {
      if (ent.done) continue;
      const R = ent.R, d = k++ * 28;
      ent.anim.cancel();
      R.el.classList.remove('spinning', 'tease');
      if (RM) { ent.stop(); ent.finish(); continue; }
      const a = R.strip.animate([{ transform: ty(1.5) }, { transform: ty(0.86), offset: 0.55, easing: 'cubic-bezier(.3,1.4,.5,1)' }, { transform: ty(1) }], { duration: 170, delay: d, fill: 'backwards' });
      void a;
      S.timeout(() => ent.stop(), d + 90);
      S.timeout(() => ent.finish(), d + 180);
    }
    root.classList.remove('tense');
    if (E && E.mascot.classList.contains('nervous')) mascot(null);
  }

  /* one UltraNudge: wind up, then every reel thumps DOWN one strip position. next: the step to show after the nudge */
  async function nudgeAll(next) {
    const wind = RM ? 0 : T(120), drop = T(170), settle = RM ? 0 : T(170), tot = wind + drop + settle;
    snd('wind');
    E.chev.classList.remove('go'); void E.chev.offsetWidth; E.chev.classList.add('go');
    for (const R of reels) {
      R.pos -= 1;
      /* the cell waiting above the window becomes the new top row; a fresh one is hung above it */
      const above = makeCell(symAt(R, R.pos - 1), 0);
      R.strip.prepend(above); R.cells.unshift(above);
      const o = R.off + 1;
      /* bags that come into view (from above, or out from behind a Bandit) show their real values now */
      for (let k = 0; k < ROWS; k++) { const c = R.cells[o - 1 + k], v = next.b[R.i * ROWS + k]; if (c._sym === SYM.BAG && v) setBag(c, v); }
      place(R, o - 1);
      const fr = [{ transform: ty(o), easing: 'cubic-bezier(.2,.7,.4,1)' }];
      if (wind) fr.push({ transform: ty(o + 0.13), offset: wind / tot, easing: 'cubic-bezier(.7,0,.95,.5)' });
      fr.push({ transform: ty(o - 1 - (RM ? 0 : 0.11)), offset: (wind + drop) / tot, easing: 'cubic-bezier(.25,.9,.4,1.25)' });
      if (settle) fr.push({ transform: ty(o - 1), offset: 1 });
      R.strip.animate(fr, { duration: tot });
    }
    /* every Bandit rides down with his reel; one on the bottom row drops off the screen */
    for (const b of bandits.slice()) {
      const p0 = cellXY(b.c); b.c += 1;
      const off = b.c % ROWS === 0;
      const p1 = off ? { x: p0.x, y: ROWS * cellH } : cellXY(b.c);
      const t = (x, y, extra) => 'translate3d(' + x + 'px,' + y + 'px,0)' + (extra || '');
      if (off) {
        bandits.splice(bandits.indexOf(b), 1);
        b.el.classList.add('falling');
        b.el.animate([{ transform: t(p0.x, p0.y) }, { transform: t(p0.x, p0.y - cellH * 0.25, ' rotate(-8deg)'), offset: 0.3 }, { transform: t(p0.x, p1.y + cellH * 0.7, ' rotate(24deg) scale(.8)'), opacity: 0 }], { duration: tot + T(260), easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
        S.timeout(() => b.el.remove(), tot + T(320));
        S.timeout(() => snd('fall'), wind);
      } else {
        b.el.style.transform = t(p1.x, p1.y);
        b.el.classList.remove('ride'); void b.el.offsetWidth; b.el.classList.add('ride');
        const fr = [{ transform: t(p0.x, p0.y), easing: 'cubic-bezier(.2,.7,.4,1)' }];
        if (wind) fr.push({ transform: t(p0.x, p0.y - cellH * 0.13), offset: wind / tot, easing: 'cubic-bezier(.7,0,.95,.5)' });
        fr.push({ transform: t(p1.x, p1.y + (RM ? 0 : cellH * 0.11)), offset: (wind + drop) / tot, easing: 'cubic-bezier(.25,.9,.4,1.25)' });
        if (settle) fr.push({ transform: t(p1.x, p1.y), offset: 1 });
        b.el.animate(fr, { duration: tot });
      }
    }
    await S.sleep(wind + drop);
    impact(next.m);
    await S.sleep(settle + 30);
    for (const R of reels) { const keep = R.cells.slice(R.off - 1, R.off + ROWS + 1); R.cells.slice(R.off + ROWS + 1).forEach((c) => c.remove()); R.cells.slice(0, R.off - 1).forEach((c) => c.remove()); R.cells = keep; place(R, 1); }
  }
  /* the thump: low boom, screen shake, sparks off the reel bottoms and the multiplier flash */
  function impact(m) {
    snd('thump', m);
    shake(Math.min(14, 4 + m * 0.9));
    flash('white');
    E.machine.classList.remove('thump'); void E.machine.offsetWidth; E.machine.classList.add('thump');
    if (!RM) {
      const r = E.window.getBoundingClientRect();
      B.fx.burst({ x: r.left + r.width * 0.18, y: r.bottom, kind: 'spark', count: 8, power: 0.42 });
      B.fx.burst({ x: r.left + r.width * 0.82, y: r.bottom, kind: 'spark', count: 8, power: 0.42 });
    }
    multFlash(m);
  }
  function shake(px) {
    if (RM || !E) return;
    const fr = [];
    for (let i = 0; i <= 8; i++) { const k = 1 - i / 8, a = px * k * k; fr.push({ transform: i === 8 ? 'none' : 'translate(' + ((Math.random() - 0.5) * 2 * a).toFixed(1) + 'px,' + ((i % 2 ? 1 : -1) * a * 0.8).toFixed(1) + 'px) rotate(' + ((Math.random() - 0.5) * a * 0.08).toFixed(2) + 'deg)' }); }
    E.machine.animate(fr, { duration: 360, easing: 'linear' });
    E.hud.animate(fr.map((f) => ({ transform: f.transform === 'none' ? 'none' : f.transform.replace(/rotate\([^)]*\)/, '') })), { duration: 300 });
    E.bg.animate([{ transform: 'scale(1.03) translateY(' + (px * 0.5) + 'px)' }, { transform: 'scale(1.03)' }], { duration: 300, easing: 'ease-out' });
  }
  /* "×N" bursts out of the reels and flies into the dial, which slams to the new value */
  function multFlash(m) {
    const f = E.multFly;
    f.textContent = '×' + m; f.className = 'uh-multfly on t' + tierOf(m);
    if (RM) { paintMult(m, true); S.timeout(() => { if (E) E.multFly.className = 'uh-multfly'; }, 500); return; }
    const wr = E.window.getBoundingClientRect(), dr = E.dial.getBoundingClientRect();
    const dx = dr.left + dr.width / 2 - (wr.left + wr.width / 2), dy = dr.top + dr.height / 2 - (wr.top + wr.height / 2);
    const dur = T(820);
    f.animate([
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.42 },
      { transform: 'translate(calc(-50% + ' + dx.toFixed(0) + 'px), calc(-50% + ' + dy.toFixed(0) + 'px)) scale(.3)', opacity: 0.95, offset: 0.9 },
      { transform: 'translate(calc(-50% + ' + dx.toFixed(0) + 'px), calc(-50% + ' + dy.toFixed(0) + 'px)) scale(.2)', opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
    S.timeout(() => { if (E) paintMult(m, true); }, dur * 0.88);
  }

  /* ---------- bandits: they abseil in on ropes and ride their reel down ---------- */
  let bandits = [];
  function cellXY(c) { const r = Math.floor(c / ROWS), k = c % ROWS; return { x: r * (cell + gap), y: k * cellH }; }
  function paintBandits() {
    for (const b of bandits) { const p = cellXY(b.c); b.el.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0)'; b.el.style.setProperty('--rope', (p.y + cellH * 0.4) + 'px'); }
  }
  async function dropBandits(list) {
    clearBandits(true);
    if (!list.length) return;
    let k = 0;
    for (const c of list) {
      const el = h('div', { class: 'uh-bandit', html: '<div class="bw"><i class="rope"></i>' + banditSvg('wild') + '</div><i class="dust"></i><span class="grab"></span>' });
      el.style.setProperty('--bd', (k * 1.7 + Math.random() * 2).toFixed(2) + 's');
      E.bandits.append(el); bandits.push({ c, el }); k++;
    }
    paintBandits();
    /* a searchlight sweeps the vault and the beacons flare as they come in */
    E.sweep.classList.remove('go'); void E.sweep.offsetWidth; E.sweep.classList.add('go');
    beacons(true, T(1200));
    snd('drop');
    setMsg(list.length > 1 ? list.length + ' Bandits drop in!' : 'A Bandit drops in!', 'hot');
    const each = T(640);
    bandits.forEach((b, i) => {
      const bw = b.el.firstChild;
      b.el.classList.add('in');
      if (!RM) bw.animate([
        { transform: 'translateY(' + (-5 * cellH) + 'px) rotate(-16deg)' },
        { transform: 'translateY(' + (cellH * 0.08) + 'px) rotate(9deg) scale(1.06,.92)', offset: 0.6 },
        { transform: 'translateY(' + (-cellH * 0.05) + 'px) rotate(-5deg)', offset: 0.78 },
        { transform: 'translateY(0) rotate(2deg)', offset: 0.9 },
        { transform: 'none' },
      ], { duration: each, delay: T(i * 140), easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'backwards' });
    });
    await S.sleep(each * 0.6 + T((bandits.length - 1) * 140));
    snd('land'); shake(5);
    for (const b of bandits) b.el.classList.add('set');
    mascot('cheer', 1200);
    await nap(260);
    snd('wink');
  }
  function clearBandits(now) {
    const old = bandits; bandits = [];
    for (const b of old) { if (now) b.el.remove(); else { b.el.classList.add('out'); S.timeout(() => b.el.remove(), 600); } }
    if (now && E) E.bandits.textContent = '';
  }
  const banditAt = (c) => bandits.find((b) => b.c === c);

  /* ---------- the world reacts ---------- */
  function mascot(state, ms) {
    if (!E) return;
    const m = E.mascot;
    m.classList.remove('cheer', 'nervous', 'alarm', 'glum');
    if (mascotT) { S.clear(mascotT); mascotT = 0; }
    if (state) { void m.offsetWidth; m.classList.add(state); if (ms) mascotT = S.timeout(() => { if (E) m.classList.remove(state); }, ms); }
  }
  function scene(cls, ms) {
    if (!E) return;
    E.bg.classList.remove(cls); void E.bg.offsetWidth; E.bg.classList.add(cls);
    if (ms) S.timeout(() => { if (E) E.bg.classList.remove(cls); }, ms);
  }
  function beacons(on, ms) {
    if (!E) return;
    E.machine.classList.toggle('beacons', !!on);
    if (on && ms) S.timeout(() => { if (E && mode !== 'free') E.machine.classList.remove('beacons'); }, ms);
  }
  function lightning() {
    const next = () => S.timeout(() => {
      if (!E) return;
      if (!RM && !document.hidden) {
        const x = 8 + Math.random() * 84;
        let d = 'M' + x + ' 0', cx = x, cy = 0;
        while (cy < 46) { cx += (Math.random() - 0.5) * 6; cy += 3 + Math.random() * 5; d += 'L' + cx.toFixed(1) + ' ' + cy.toFixed(1); }
        E.bolt.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + d + '"/></svg>';
        E.bolt.classList.remove('on'); void E.bolt.offsetWidth; E.bolt.classList.add('on');
        S.timeout(() => snd('rumble'), 500 + Math.random() * 800);
      }
      next();
    }, 14000 + Math.random() * 22000);
    next();
  }
  /* the mascot looks about, tips his hat; ambient bits that are timed rather than looped */
  function idleBits() {
    S.interval(() => {
      if (!E || busy) return;
      const m = E.mascot, r = Math.random();
      const cls = r < 0.4 ? 'look' : r < 0.7 ? 'tip' : 'peek';
      m.classList.remove('look', 'tip', 'peek'); void m.offsetWidth; m.classList.add(cls);
    }, 5200);
  }

  /* ---------- win presentation ---------- */
  function clearWins() {
    E.lines.textContent = '';
    E.reelsBox.classList.remove('showing');
    E.window.querySelectorAll('.uh-cell.hit, .uh-bandit.hit, .uh-cell.alarm').forEach((n) => n.classList.remove('hit', 'alarm'));
    E.fly.querySelectorAll('.lb').forEach((n) => n.remove());
    E.stepTag.className = 'uh-steptag';
  }
  function cellEl(c) { const r = Math.floor(c / ROWS), k = c % ROWS; return vis(reels[r], k); }
  const LINE_COLS = ['#5ff0ff', '#ff3d9e', '#ffd36b', '#9cff6b', '#c58bff', '#ff8a3c'];
  function drawLine(w, col, unit, badge) {
    const line = w[0], n = w[2], pl = M.PAYLINES[line], pts = [];
    for (let r = 0; r < REELS; r++) pts.push((r * (cell + gap) + cell / 2).toFixed(1) + ',' + (pl[r] * cellH + cellH / 2).toFixed(1));
    const ns = 'http://www.w3.org/2000/svg';
    const pb = document.createElementNS(ns, 'polyline'); pb.setAttribute('points', pts.join(' ')); pb.setAttribute('class', 'glow'); pb.style.stroke = col;
    const p = document.createElementNS(ns, 'polyline'); p.setAttribute('points', pts.join(' ')); p.setAttribute('class', 'core'); p.style.stroke = col;
    E.lines.append(pb, p);
    for (let r = 0; r < n; r++) { const c = r * ROWS + pl[r], b = banditAt(c); if (b) b.el.classList.add('hit'); else { const ce = cellEl(c); if (ce) { ce.classList.add('hit'); ce.style.setProperty('--lc', col); } } }
    if (badge) {
      const r = n - 1, xy = { x: r * (cell + gap) + cell / 2, y: pl[r] * cellH + cellH * 0.18 };
      const lb = h('span', { class: 'lb' }, fmtS(w[3] * unit));
      lb.style.left = xy.x + 'px'; lb.style.top = xy.y + 'px'; lb.style.borderColor = col;
      E.fly.append(lb);
    }
  }
  let winRunning = 0;
  function addWin(amount, ms) {
    const from = winRunning; winRunning += amount;
    E.winbar.classList.add('won');
    E.winbar.classList.remove('bump'); void E.winbar.offsetWidth; E.winbar.classList.add('bump');
    const d = T(ms || 500);
    const tk = d > 120 ? S.interval(() => snd('count'), 70) : 0;
    return B.ui.countUp(E.win, from, winRunning, d).then(() => { if (tk) S.clear(tk); });
  }
  function setMsg(t, cls) { if (!E) return; E.msg.textContent = t; E.msg.className = 'msg' + (cls ? ' ' + cls : ''); }
  function tag(text, cls) { E.stepTag.textContent = text; E.stepTag.className = 'uh-steptag on ' + (cls || ''); }
  function pop(text, sub, cls) {
    E.pop.innerHTML = ''; E.pop.append(h('b', null, text)); if (sub) E.pop.append(h('small', null, sub));
    E.pop.className = 'uh-pop'; void E.pop.offsetWidth; E.pop.className = 'uh-pop on ' + (cls || '');
  }

  async function showStep(st, i, unit, free) {
    clearWins();
    if (st.w.length) {
      E.reelsBox.classList.add('showing');
      const order = st.w.map((w, j) => [w, j]).sort((a, b) => b[0][3] - a[0][3]);
      order.forEach(([w, j], rank) => drawLine(w, LINE_COLS[j % LINE_COLS.length], unit, rank < 4));
      snd('win', Math.min(5, i));
      mascot('cheer', 1100); scene('cheer', 900);
      const best = order[0][0], amt = st.lw * unit;
      tag((st.m > 1 ? '×' + st.m + ' · ' : '') + st.w.length + ' line' + (st.w.length > 1 ? 's' : ''), st.m > 1 ? 'mult' : '');
      pop('+' + Batty.fmt(amt), st.m > 1 ? 'at ×' + st.m : '', amt >= unitNow * U * 5 ? 'big' : '');
      setMsg(st.w.length + ' line' + (st.w.length > 1 ? 's' : '') + (st.m > 1 ? ' at ×' + st.m : '') + ' · best: ' + best[2] + ' ' + M.SYMBOL_NAMES[best[1]], 'hot');
      if (!RM && amt >= unitNow * U * 2) B.fx.burst({ el: E.window, kind: 'coin', count: Math.min(30, 6 + Math.round(amt / (unitNow * U))), power: 0.6 });
      await addWin(amt, 420 + Math.min(900, st.lw * 4));
      await nap(st.m > 1 ? 460 : 380);
    }
    if (st.cc.length) await collect(st, unit, free);
    if (st.sc >= 3 && !free) {
      for (let c = 0; c < 20; c++) { const ce = cellEl(c); if (ce && ce._sym === SYM.VAULT) ce.classList.add('alarm'); }
      snd('alarm'); flash('red'); beacons(true); root.classList.add('alert'); mascot('alarm');
      tag('Three Vaults!', 'alarmtag');
      setMsg('Three Vaults! The Heist is on', 'alarm');
      await nap(1100);
    }
  }
  /* every Bandit grabs every visible bag; the bag empties */
  async function collect(st, unit, free) {
    const box = E.window.getBoundingClientRect();
    const targets = bandits.map((b) => b.el);
    let k = 0;
    for (const c of st.cc) {
      const ce = cellEl(c); if (!ce) continue;
      const r = ce.getBoundingClientRect(), v = ce._bag || 0;
      ce.classList.add('grabbed');
      for (const t of targets) {
        const tr = t.getBoundingClientRect();
        const chip = h('div', { class: 'chip' }, fmtS(v * unit));
        const x0 = r.left - box.left + r.width / 2, y0 = r.top - box.top + r.height * 0.72;
        chip.style.left = x0 + 'px'; chip.style.top = y0 + 'px';
        E.fly.append(chip);
        const dx = tr.left - r.left + (tr.width - r.width) / 2, dy = tr.top - r.top + (tr.height - r.height) / 2 - r.height * 0.22;
        const lift = -Math.max(30, Math.abs(dx) * 0.35);
        chip.animate([
          { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
          { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.2 },
          { transform: 'translate(calc(-50% + ' + (dx / 2).toFixed(0) + 'px), calc(-50% + ' + (dy / 2 + lift).toFixed(0) + 'px)) scale(1)', offset: 0.6 },
          { transform: 'translate(calc(-50% + ' + dx.toFixed(0) + 'px), calc(-50% + ' + dy.toFixed(0) + 'px)) scale(.6)', opacity: 0.9 },
        ], { duration: T(620), delay: T(k * 90), easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
        S.timeout(() => { chip.remove(); t.classList.remove('grab-pop'); void t.offsetWidth; t.classList.add('grab-pop'); snd('bag'); }, T(620 + k * 90));
      }
      S.timeout(() => setBag(ce, -1), T(300 + k * 90));
      k++;
    }
    await nap(640 + k * 90);
    const n = bandits.length;
    tag('Bags ' + (n > 1 ? '×' + n + ' Bandits ' : '') + (free && st.m > 1 ? '×' + st.m + ' ' : '') + '+' + fmtS(st.c * unit), 'bag');
    pop('+' + Batty.fmt(st.c * unit), 'cash bags' + (free && st.m > 1 ? ' ×' + st.m : ''), 'gold');
    setMsg((n > 1 ? n + ' Bandits grab ' : 'The Bandit grabs ') + st.cc.length + ' bag' + (st.cc.length > 1 ? 's' : '') + (free && st.m > 1 ? ', multiplied ×' + st.m : ''), 'gold');
    snd('till'); mascot('cheer', 1000);
    if (!RM) B.fx.burst({ el: targets[0] || E.window, kind: 'coin', count: Math.min(36, 8 + st.cc.length * 6), power: 0.7 });
    await addWin(st.c * unit, 520);
    await nap(280);
  }
  function flash(kind) { const f = E && E.bg.querySelector('.uh-flash'); if (!f) return; f.className = 'uh-flash ' + kind; void f.offsetWidth; f.classList.add('on'); }

  /* ---------- the multiplier dial ---------- */
  function paintMult(m, slam) {
    multShown = m;
    E.multNum.textContent = '×' + m;
    E.dialRing.style.transform = 'rotate(' + (m - 1) * 30 + 'deg)';
    E.dial.className = 'uh-dial t' + tierOf(m);
    const lit = Math.min(12, m - 1);
    E.leds.querySelectorAll('path').forEach((p, i) => p.classList.toggle('on', i < lit));
    E.dial.setAttribute('aria-label', 'Multiplier ×' + m);
    if (slam) {
      void E.dial.offsetWidth; E.dial.classList.add('slam');
      snd('mult', m);
      if (!RM) B.fx.burst({ el: E.dial, kind: 'spark', count: 10 + Math.min(20, m), power: 0.5 });
    }
  }

  /* ---------- a reel set (one paid spin or one free spin) ---------- */
  async function playSet(set, unit, free, quick) {
    const stepsB = set.steps;
    phase = 'spinning'; paintCtl();
    E.reelsBox.classList.toggle('free', free);
    await spinTo(set.stops, free ? 'free' : 'base', (r) => stepsB[0].b.slice(r * ROWS, r * ROWS + ROWS), quick, free ? -1 : teaseReel(stepsB[0].g));
    if (!E) return;
    phase = 'present'; paintCtl();
    if (set.bandits.length) await dropBandits(set.bandits);
    if (DEV) checkGrid(stepsB[0]);
    for (let i = 0; i < stepsB.length; i++) {
      const st = stepsB[i];
      if (i > 0) {
        tag('UltraNudge ' + i, 'nudge');
        setMsg('UltraNudge! Multiplier ×' + st.m, 'hot');
        clearWins();
        await nudgeAll(st);
        if (DEV) checkGrid(st);
        await nap(160);
      }
      await showStep(st, i, unit, free);
      if (i === 0 && stepsB.length > 1 && !st.w.length && !st.cc.length) await nap(200);
    }
    if (stepsB.length > 1 && !free) setMsg('Chain over: ' + (stepsB.length - 1) + ' nudge' + (stepsB.length > 2 ? 's' : '') + ', top multiplier ×' + stepsB[stepsB.length - 1].m, 'gold');
    clearBandits(false);
  }

  /* dev only: the reels on screen must show exactly the grid the maths produced */
  function checkGrid(st) {
    for (let c = 0; c < 20; c++) { if (st.g[c] === SYM.WILD) continue; const ce = cellEl(c); if (!ce || ce._sym !== st.g[c]) { console.error('ultraheist grid mismatch at cell ' + c + ': shown ' + (ce && ce._sym) + ', maths ' + st.g[c]); return; } }
  }

  /* ================= a round ================= */
  function primary() {
    if (!E) return;
    if (ovTap) return ovTap();
    if (!E.ov.hidden) return;
    if (busy) {
      if (phase === 'spinning' && spinState && !spinState.slammed) { slamStop(); return; }
      skipping = true; paintCtl(); return;
    }
    if (!E.autoMenu.hidden) { E.autoMenu.hidden = true; return; }
    round(false);
  }
  async function round(buy) {
    if (busy || !E) return;
    const stake = stakeCtl.value, unit = stake / U, cost = buy ? M.BUY_X * stake : stake;
    if (!B.wallet.bet(ID, cost)) { stopAuto(); return B.ui.broke(); }
    busy = true; skipping = false; unitNow = unit; E.autoMenu.hidden = true; phase = 'spinning'; paintCtl();
    winRunning = 0; E.win.textContent = '0'; E.winbar.classList.remove('won', 'cap'); clearWins(); hideBanner(); mascot(null);
    E.pop.className = 'uh-pop';
    if (auto > 0 && !buy) auto--;
    setMsg(buy ? 'Heist bought. Gloves on.' : 'Rolling…', '');
    let o;
    if (B.online) {
      const r = await B.play(ID, 'spin', buy ? { stake, buy: true } : { stake }, cost);
      if (!E) return;
      if (!r) { busy = false; phase = 'idle'; stopAuto(); paintCtl(); setMsg('The job was called off. Try again.', ''); return; }
      o = r.o;
    } else if (buy) o = M.buy(B.rng);
    else if (DEV && devNext) { o = devNext(); devNext = null; }
    else o = M.spin(B.rng);
    const win = o.totalWin * unit;
    if (win > 0) B.wallet.win(ID, win, { silent: true });
    sess.spins++; if (win > 0) sess.hits++; if (o.fs) sess.heists++; if (win > sess.best) sess.best = win;
    if (devLog) { devLog.rounds++; devLog.staked += cost; devLog.won += win; if (o.fs) devLog.heists++; if (o.capped) devLog.capped++; devLog.last = o; }

    const quick = turbo || auto > 0;
    if (!buy) {
      paintMult(1, false);
      await playSet(o, unit, false, quick);
    }
    if (o.fs && E) await heist(o, unit, buy);
    if (!E) return;
    /* the round is over */
    phase = 'present'; clearWins();
    if (o.capped) { E.winbar.classList.add('cap'); setMsg('Maximum win reached: ' + Batty.fmt(M.MAX_WIN_X) + '× stake. The job is done.', 'gold'); }
    else if (win > 0) setMsg(o.fs ? 'The take: ' + Batty.fmt(win) + ' BB' : 'Paid ' + Batty.fmt(win) + ' BB', 'gold');
    else { setMsg(IDLE[(sess.spins) % IDLE.length], ''); if (!o.steps.length || o.steps.length === 1) mascot('glum', 900); }
    if (E.win.textContent !== Batty.fmt(win)) E.win.textContent = Batty.fmt(win);
    B.wallet.sync();
    const ratio = win / stake;
    if (win > 0 && ratio >= 10 && (!buy || win > cost)) await B.ui.celebrate({ amount: win, bet: stake });
    else if (win > 0 && ratio >= 3 && !o.fs) { banner(ratio >= 6 ? 'Big haul!' : 'Nice haul!', 'gold', 1300); snd('haul'); scene('cheer', 1400); mascot('cheer', 1500); if (!RM) B.fx.rain('coin', ratio >= 6 ? 1300 : 800); await nap(quick ? 600 : 1100); }
    if (!E) return;
    busy = false; skipping = false; phase = 'idle'; paintMult(1, false); paintCtl();
    root.classList.remove('alert'); E.bg.classList.remove('alarm'); if (mode !== 'free') beacons(false);
    continueAuto(o, win, cost);
  }
  const IDLE = ['Rain on the windows. A vault full of gold. Let’s go to work.', 'Bandits drop on reels 2, 3 and 4, then ride the reels all the way down.', 'Every Bandit starts an UltraNudge: down a notch, multiplier +1, until he falls off the bottom.', 'Cash Bags pay 1× to 25×, but only a Bandit can carry them.', 'Three Vaults on reels 1, 3 and 5 crack the Heist.', 'In the Heist the multiplier never resets.'];

  /* ---------- Heist Free Spins ---------- */
  let ovTap = null;
  async function heist(o, unit, bought) {
    const fs = o.fs;
    phase = 'present'; paintCtl();
    beacons(true); root.classList.add('alert'); E.bg.classList.add('alarm'); mascot('alarm');
    snd('siren', 2);
    await intro(bought);
    if (!E) return;
    mode = 'free'; root.classList.add('free'); root.classList.remove('alert');
    flash('gold');
    clearWins(); mascot(null);
    E.winLbl.textContent = 'Heist total';
    let left = M.CFG.fsSpins, meter = 0, mult = 1;
    paintMult(1, false); paintBoard(left, meter);
    for (let i = 0; i < fs.spins.length && E; i++) {
      const s = fs.spins[i];
      skipping = false;
      left--; paintBoard(left, meter, true);
      setMsg('Heist spin ' + (i + 1) + ' · multiplier ×' + mult, '');
      if (left === 0) { tag('Final spin', 'alarmtag'); snd('heart'); }
      await playSetFree(s, unit, mult);
      if (!E) return;
      mult = s.mult;
      /* the alarm meter: every 4 bags rings it for +2 spins */
      let got = s.bags;
      while (got > 0) {
        got--; meter++;
        paintBoard(left, meter); E.bulbs[meter - 1].classList.remove('pop'); void E.bulbs[meter - 1].offsetWidth; E.bulbs[meter - 1].classList.add('pop'); snd('tick');
        await nap(150);
        if (meter === 4) {
          left += 2; meter = 0;
          snd('alarm'); flash('red'); E.board.classList.remove('ring'); void E.board.offsetWidth; E.board.classList.add('ring'); mascot('alarm', 1200);
          banner('Alarm! +2 Heist spins', 'alarm', 1200);
          await nap(1150);
          paintBoard(left, meter, true);
        }
      }
      if (s.win === 0) setMsg('Nothing on that one. Keep your nerve.', '');
      else setMsg('Spin paid ' + Batty.fmt(s.win * unit) + ' BB · total ' + Batty.fmt(winRunning) + ' BB', 'gold');
      if (left !== s.left || meter !== s.meter) { left = s.left; meter = s.meter; paintBoard(left, meter); }
      await nap(s.win ? 420 : 260);
    }
    if (!E) return;
    await outro(fs.total * unit, fs.played, fs.multEnd, fs.capped);
    if (!E) return;
    mode = 'base'; root.classList.remove('free'); E.bg.classList.remove('alarm'); beacons(false); paintBoard();
    E.winLbl.textContent = 'Win'; E.reelsBox.classList.remove('free');
  }
  async function playSetFree(s, unit, mult) { paintMult(mult, false); await playSet(s, unit, true, turbo || auto > 0); }
  function paintBoard(left, meter, flip) {
    if (!E) return;
    const free = mode === 'free';
    E.fsBox.hidden = !free; E.hint.hidden = free;
    E.meter.classList.toggle('live', free);
    if (left != null) {
      E.spinsLeft.textContent = String(Math.max(0, left));
      E.fsBox.classList.toggle('last', free && left === 0);
      if (flip) { E.spinsLeft.classList.remove('flip'); void E.spinsLeft.offsetWidth; E.spinsLeft.classList.add('flip'); }
    }
    E.bulbs.forEach((b, i) => { b.classList.toggle('on', free && i < (meter || 0)); if (!free) b.classList.remove('pop'); });
  }
  /* Tense intro: lights die, sirens wail, the vault wheel spins, bolts shoot back, the door swings open on the gold */
  function intro(bought) {
    return new Promise((res) => {
      const quick = auto > 0 || turbo;
      E.ov.hidden = false; E.ov.className = 'uh-ov intro';
      const door = h('div', { class: 'vdoor', html: vaultDoorSvg() });
      const vault = h('div', { class: 'uh-vault' }, h('div', { class: 'vin', html: hoardSvg() }), h('i', { class: 'rays' }), door);
      const title = h('div', { class: 'title' },
        h('small', null, bought ? 'You bought the job' : 'Three Vaults cracked'),
        h('h2', null, h('span', { class: 'k' }, 'The'), ' ', ...'HEIST'.split('').map((ch, i) => h('span', { class: 'ch', style: { animationDelay: (0.06 * i) + 's' } }, ch))),
        h('div', { class: 'sub' }, 'Free Spins'),
        h('div', { class: 'spins' }, h('b', null, String(M.CFG.fsSpins)), h('span', null, 'Heist spins')),
        h('p', null, 'Every win nudges · the multiplier never resets · bags are multiplied · 4 bags = +2 spins'),
        h('em', null, 'Tap' + (B.online ? '' : ' or press Space') + ' to start'));
      E.ov.textContent = ''; E.ov.append(h('div', { class: 'lights' }, h('i'), h('i')), vault, title);
      let stage = 0, closed = false;
      const showTitle = () => {
        if (stage >= 2 || !E) return; stage = 2;
        E.ov.classList.add('open', 'titled');
        snd('sting');
        if (!RM) { B.fx.burst({ el: vault, kind: 'coin', count: 40, power: 1 }); }
        S.timeout(() => { if (!closed) go(); }, T(quick ? 1700 : 4200));
      };
      const go = () => {
        if (closed) return;
        if (stage < 2) { showTitle(); return; }
        closed = true; ovTap = null;
        E.ov.classList.add('out');
        S.timeout(() => { if (E) { E.ov.hidden = true; E.ov.textContent = ''; E.ov.className = 'uh-ov'; } res(); }, 420);
      };
      ovTap = go; E.ov.onclick = go;
      snd('heart');
      if (RM) { S.timeout(showTitle, 300); return; }
      const t0 = T(quick ? 250 : 500);
      S.timeout(() => { if (!E || closed || stage) return; E.ov.classList.add('spinwheel'); snd('creak'); }, t0);
      S.timeout(() => { if (!E || closed || stage) return; E.ov.classList.add('unbolt'); snd('bolts'); shake(6); }, t0 + T(1000));
      S.timeout(() => { if (!E || closed || stage) return; stage = 1; E.ov.classList.add('open'); snd('open'); flash('gold'); }, t0 + T(1350));
      S.timeout(() => { if (!E || closed) return; showTitle(); }, t0 + T(1950));
    });
  }
  /* The Take: a clean getaway, the total counting up as the car tears off */
  function outro(total, played, multEnd, capped) {
    return new Promise((res) => {
      snd('take'); snd('siren', 1);
      E.ov.hidden = false; E.ov.className = 'uh-ov outro';
      const amt = h('output', null, '0');
      const car = h('div', { class: 'car', html: useSym('car') });
      const card = h('div', { class: 'card' }, h('small', null, capped ? 'Maximum win reached' : 'Clean getaway'), h('h2', null, 'The Take'), amt,
        h('p', null, 'You won ', h('b', null, Batty.fmt(total) + ' BB'), ' in ' + played + ' Heist spin' + (played === 1 ? '' : 's')),
        h('p', { class: 'fine' }, 'Top multiplier ×' + multEnd), h('em', null, 'Tap to continue'));
      E.ov.textContent = ''; E.ov.append(h('div', { class: 'road' }, car), card);
      const d = T(1500);
      const tk = S.interval(() => snd('count'), 70);
      B.ui.countUp(amt, 0, total, d).then(() => { S.clear(tk); if (E) { amt.classList.add('done'); snd('till'); } });
      if (total > 0 && !RM) B.fx.rain('coin', 1600);
      let closed = false;
      const go = () => { if (closed) return; closed = true; ovTap = null; S.clear(tk); E.ov.classList.add('out'); S.timeout(() => { if (E) { E.ov.hidden = true; E.ov.textContent = ''; E.ov.className = 'uh-ov'; } res(); }, 420); };
      ovTap = go; E.ov.onclick = go;
      S.timeout(() => { if (!closed) go(); }, T(auto > 0 || turbo ? 2600 : 5200));
    });
  }
  function banner(text, cls, ms) {
    E.banner.textContent = text; E.banner.className = 'uh-banner on ' + (cls || ''); E.banner.hidden = false;
    S.timeout(() => hideBanner(), T(ms || 1200));
  }
  function hideBanner() { if (E) { E.banner.hidden = true; E.banner.className = 'uh-banner'; } }

  /* ---------- buy ---------- */
  function openBuy() {
    if (busy || !E) return;
    const stake = stakeCtl.value, price = M.BUY_X * stake;
    snd('drop');
    E.ov.hidden = false; E.ov.className = 'uh-ov buying';
    const yes = h('button', { class: 'uh-btn go', type: 'button', id: 'ultraheist-buy-yes', disabled: !B.wallet.canBet(price) }, h('b', null, 'Buy for ' + Batty.fmt(price) + ' BB'));
    const no = h('button', { class: 'uh-btn ghost', type: 'button', id: 'ultraheist-buy-no' }, h('b', null, 'Not tonight'));
    const card = h('div', { class: 'card buy', role: 'dialog', 'aria-label': 'Buy the Heist' }, h('div', { class: 'door small', html: useSym('vault') }), h('small', null, 'Inside job'), h('h2', null, 'Buy the Heist'),
      h('p', null, 'Skip the stake-out: 8 Heist Free Spins straight away, every win nudges and the multiplier never resets.'),
      h('p', { class: 'fine' }, 'Price ' + M.BUY_X + '× stake (' + Batty.fmt(stake) + ' BB stake). Designed return ' + RTP.buy + '.'), h('div', { class: 'row' }, no, yes));
    E.ov.textContent = ''; E.ov.append(card);
    const close = () => { ovTap = null; if (E) { E.ov.hidden = true; E.ov.textContent = ''; E.ov.onclick = null; E.ov.className = 'uh-ov'; } };
    no.onclick = () => { snd('miss'); close(); };
    yes.onclick = () => { close(); round(true); };
    E.ov.onclick = (e) => { if (e.target === E.ov) close(); };
    ovTap = null;
    S.timeout(() => { try { yes.disabled ? no.focus() : yes.focus(); } catch (e) { /* fine */ } }, 50);
  }

  /* ---------- autoplay with a loss limit ---------- */
  function buildAutoMenu() {
    const m = h('div', { class: 'uh-automenu', hidden: true, role: 'dialog', 'aria-label': 'Autoplay' });
    const rowN = h('div', { class: 'chips' }), rowL = h('div', { class: 'chips' });
    const paint = () => {
      rowN.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.n === autoPick.n));
      rowL.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.l === autoPick.loss));
      fsT.classList.toggle('on', autoStopFs); fsT.setAttribute('aria-pressed', autoStopFs);
    };
    for (const n of [10, 25, 50, 100, 250]) rowN.append(h('button', { type: 'button', 'data-n': n, onclick: () => { autoPick.n = n; snd('tick'); paint(); } }, String(n)));
    for (const l of [0, 20, 50, 100, 250]) rowL.append(h('button', { type: 'button', 'data-l': l, onclick: () => { autoPick.loss = l; snd('tick'); paint(); } }, l ? l + '×' : 'None'));
    const fsT = h('button', { type: 'button', class: 'tog', onclick: () => { autoStopFs = !autoStopFs; snd('tick'); paint(); } }, 'Stop after a Heist');
    const go = h('button', { type: 'button', class: 'uh-btn go', id: 'ultraheist-auto-go', onclick: () => startAuto() }, h('b', null, 'Start autoplay'));
    m.append(h('h4', null, 'Autoplay'), h('label', null, 'Spins'), rowN, h('label', null, 'Stop if I lose more than (× stake)'), rowL, fsT, go);
    paint();
    return m;
  }
  function autoClick() {
    snd('tick');
    if (auto > 0) { stopAuto(); return; }
    if (busy) return;
    E.autoMenu.hidden = !E.autoMenu.hidden;
  }
  function startAuto() {
    E.autoMenu.hidden = true;
    auto = autoPick.n; autoLoss = autoPick.loss * stakeCtl.value; autoFloor = B.wallet.balance - autoLoss;
    Batty.sfx('click'); paintCtl();
    if (!busy) round(false);
  }
  function stopAuto() { auto = 0; if (E) paintCtl(); }
  function continueAuto(o, win, cost) {
    if (auto <= 0) return;
    const stake = stakeCtl.value;
    if (autoStopFs && o.fs) { stopAuto(); B.ui.toast('Autoplay stopped after the Heist.'); return; }
    if (autoLoss && B.wallet.balance - stake < autoFloor) { stopAuto(); B.ui.toast('Autoplay stopped: loss limit reached.'); return; }
    if (!B.wallet.canBet(stake)) { stopAuto(); B.ui.toast('Autoplay stopped: not enough Batty Bucks for the next spin.'); return; }
    S.timeout(() => { if (auto > 0 && !busy) round(false); }, T(win ? 420 : 160));
  }
  function toggleTurbo() { turbo = !turbo; E.turboBtn.setAttribute('aria-pressed', turbo); E.turboBtn.lastChild.textContent = turbo ? 'on' : 'off'; E.turboBtn.classList.toggle('on', turbo); snd('tick'); }

  function paintStake() {
    if (!E) return;
    const st = stakeCtl.value; unitNow = st / U;
    E.buyBtn.lastChild.textContent = Batty.fmt(M.BUY_X * st) + ' BB';
    E.pays.querySelectorAll('.v').forEach((v) => { const s = +v.dataset.s, p = M.PAY[s]; v.textContent = [5, 4, 3].map((n) => fmtS(p[n] * st / U)).join(' / '); });
    for (const R of reels) for (const c of R.cells) if (c._sym === SYM.BAG && c._bag > 0) setBag(c, c._bag);
  }
  function paintCtl() {
    if (!E) return;
    stakeCtl.disabled = busy || auto > 0;
    E.buyBtn.disabled = busy || auto > 0;
    const sp = E.spin;
    sp.classList.toggle('busy', busy); sp.classList.toggle('auto', auto > 0);
    sp.classList.toggle('stop', busy && phase === 'spinning');
    sp.classList.toggle('skip', busy && phase !== 'spinning');
    sp.classList.toggle('skipping', busy && skipping);
    sp.querySelector('em').textContent = auto > 0 ? String(auto) : '';
    sp.setAttribute('aria-label', !busy ? 'Spin' : phase === 'spinning' ? 'Stop the reels' : 'Speed up');
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? 'stop' : 'off';
    E.autoBtn.setAttribute('aria-label', auto > 0 ? 'Stop autoplay' : 'Autoplay');
    E.autoBtn.disabled = busy && auto === 0;
  }
  function onKey(e) {
    if (!E || document.querySelector('.bc-veil')) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
      if (e.key === 'Enter' && t && t.tagName === 'BUTTON') return;
      if (t && t.tagName === 'BUTTON' && t !== E.spin && E.ov.contains(t)) return;
      e.preventDefault(); if (e.repeat) return; primary(); return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 't') toggleTurbo();
    else if (k === 'a') autoClick();
    else if (k === 'b' && !busy) openBuy();
    else if (k === 'escape') { if (!E.autoMenu.hidden) E.autoMenu.hidden = true; else if (!E.ov.hidden && E.ov.classList.contains('buying')) { E.ov.hidden = true; E.ov.textContent = ''; E.ov.className = 'uh-ov'; } }
    else if ((k === '+' || k === '=' || k === 'arrowup') && !stakeCtl.disabled) { e.preventDefault(); stakeCtl.el.lastChild.click(); }
    else if ((k === '-' || k === 'arrowdown') && !stakeCtl.disabled) { e.preventDefault(); stakeCtl.el.firstChild.click(); }
  }

  /* ---------- rain: two depths of drops, a gusting wind, splashes on the wet street ---------- */
  let rainCtx = null, drops = [], splashes = [], rainW = 0, rainH = 0, rainDpr = 1;
  function sizeRain() {
    if (!E) return;
    rainDpr = Math.min(1.5, window.devicePixelRatio || 1);
    rainW = root.clientWidth; rainH = root.clientHeight;
    E.rain.width = Math.round(rainW * rainDpr); E.rain.height = Math.round(rainH * rainDpr);
    rainCtx = E.rain.getContext('2d');
    const n = Math.round(Math.min(240, rainW * rainH / 4600));
    drops = []; splashes = [];
    for (let i = 0; i < n; i++) { const near = i % 3 === 0; drops.push({ x: Math.random() * rainW, y: Math.random() * rainH, v: near ? 1100 + Math.random() * 500 : 620 + Math.random() * 380, l: near ? 18 + Math.random() * 16 : 8 + Math.random() * 10, near, floor: near ? rainH * (0.8 + Math.random() * 0.2) : rainH + 20 }); }
    if (RM) drawRain(0, 0);
  }
  function drawRain(dt, t) {
    const c = rainCtx; if (!c) return;
    c.setTransform(rainDpr, 0, 0, rainDpr, 0, 0); c.clearRect(0, 0, rainW, rainH);
    const wind = -0.17 + Math.sin((t || 0) / 6000) * 0.07;
    const free = mode === 'free';
    c.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const near = pass === 1;
      c.lineWidth = near ? 1.4 : 1;
      c.strokeStyle = free ? (near ? 'rgba(255,140,160,.42)' : 'rgba(255,110,130,.2)') : (near ? 'rgba(190,215,255,.4)' : 'rgba(160,190,255,.2)');
      c.beginPath();
      for (const d of drops) {
        if (d.near !== near) continue;
        d.y += d.v * dt; d.x += d.v * dt * wind;
        if (d.y > d.floor) { if (near && splashes.length < 50) splashes.push({ x: d.x, y: d.floor, r: 1, a: 0.55 }); d.y = -30 - Math.random() * 60; d.x = Math.random() * (rainW + 120); }
        c.moveTo(d.x, d.y); c.lineTo(d.x - d.l * wind, d.y - d.l);
      }
      c.stroke();
    }
    c.lineWidth = 1;
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]; s.r += 46 * dt; s.a -= 1.5 * dt;
      if (s.a <= 0) { splashes.splice(i, 1); continue; }
      c.strokeStyle = free ? 'rgba(255,150,170,' + s.a.toFixed(2) + ')' : 'rgba(200,225,255,' + s.a.toFixed(2) + ')';
      c.beginPath(); c.ellipse(s.x, s.y, s.r, s.r * 0.28, 0, 0, Math.PI * 2); c.stroke();
    }
  }
  function startRain() { if (RM) return; S.loop((dt, t) => { if (!document.hidden) drawRain(dt, t); }); }

  /* ================= rules ================= */
  const RTP = { base: '98.0%', buy: '98.0%' };
  function rules() {
    const pt = M.PAY, rows = [];
    for (let s = SYM.DIAMOND; s >= SYM.PRINT; s--) rows.push('<tr><td><span class="uh-ri">' + useSym(NAMES[s]) + '</span>' + M.SYMBOL_NAMES[s] + '</td><td>' + [5, 4, 3].map((n) => (pt[s][n] / U).toFixed(2).replace(/\.?0+$/, '') + '×').join('</td><td>') + '</td></tr>');
    const bv = M.CFG.bagValues.map((v) => v / U + '×').join(', ');
    return '<div class="g-ultraheist-rules">' +
      '<h3>Bat Bandits UltraNudge</h3><p>5 reels, 4 rows, 40 fixed lines. Wins pay left to right from reel 1 for 3, 4 or 5 matching symbols on a line; only the best win on each line pays. Pays below are multiples of your <b>total stake</b>.</p>' +
      '<table class="pt"><tr><th>Symbol</th><th>5</th><th>4</th><th>3</th></tr>' + rows.join('') + '</table>' +
      '<h3>Bandit Wild</h3><p>After the reels stop, up to three masked Bandits can drop onto reels 2, 3 and 4 (only onto picture symbols, and never on two neighbouring reels). A Bandit substitutes for every picture symbol. He rides on his reel: every nudge carries him <b>one row down</b>, until he drops off the bottom of the screen.</p>' +
      '<h3>UltraNudge</h3><p>A Bandit on the screen starts an UltraNudge: every reel steps <b>down one position on its strip</b> (a new symbol enters at the top) and the Bandit moves down with it, the win multiplier goes up by 1, and all wins are evaluated again and paid at the new multiplier. It keeps nudging, one row at a time, until every Bandit has dropped off the bottom of the reels; the step after the last one leaves is paid too. A Bandit landing on the top row gives four nudges, up to ×5. The multiplier resets to ×1 on the next paid spin.</p>' +
      '<h3>Cash Bags</h3><p>Cash Bags carry ' + bv + ' your stake. At the end of every step (the landing and every nudge) each Bandit on screen collects every visible Cash Bag; a bag is emptied once collected, and a bag hidden behind a Bandit cannot be collected until it slides out. In the base game bags are not multiplied.</p>' +
      '<h3>Heist Free Spins</h3><p>Three Vaults (they appear on reels 1, 3 and 5) in view at the end of any step award <b>8 Heist Free Spins</b>, played on their own reel strips (no Vaults). In the Heist every Bandit nudges just as in the base game and <b>every</b> line win starts an UltraNudge too, the multiplier starts at ×1 and <b>never resets</b>, and collected Cash Bags are multiplied by it too. Every 4 bags collected fill the alarm meter for <b>+2 spins</b> (no limit).</p>' +
      '<h3>Bonus Buy</h3><p>Buy the Heist Free Spins straight away for <b>' + M.BUY_X + '× stake</b>.</p>' +
      '<h3>Maximum win</h3><p>A spin (including its free spins) pays at most <b>' + Batty.fmt(M.MAX_WIN_X) + '× stake</b>; when it is reached the round ends there.</p>' +
      '<h3>Return and statistics</h3><p>Designed return: paid spins <b>' + RTP.base + '</b>, Bonus Buy <b>' + RTP.buy + '</b>. Live-balanced site-wide to a 98% target.</p>' +
      '<table class="st">' + STATS.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' +
      '<p class="rtp">' + RTP_LINE + '</p>' +
      '<p>Shortcuts: Space spin, stop the reels or speed up · tap the reels to stop them · T turbo · A autoplay · B buy · + and − stake. Batty Bucks are for fun only and have no cash value.</p></div>';
  }
  /* figures quoted from sim/ultraheist.sim.js (tools/ultraheist-sim-out.txt) */
  const STATS = [
    ['Hit rate (any win)', 'about 30%'],
    ['Heist Free Spins', 'about 1 in 230 spins'],
    ['UltraNudge chains', 'about 1 in 8 spins'],
    ['Volatility', 'high'],
    ['Max win', Batty.fmt(M.MAX_WIN_X) + '× stake'],
  ];
  const RTP_LINE = 'Tested return: paid spins 98.4%, Bonus Buy 97.8%.';

  Batty.registerGame({
    id: ID,
    name: 'Bat Bandits UltraNudge',
    tagline: 'Bandits ride the reels down, the multiplier climbs every nudge',
    tag: 'Slot',
    poster: POSTER,
    rules,
    mount,
    unmount,
  });
})();
