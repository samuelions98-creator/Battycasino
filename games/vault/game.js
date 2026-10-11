/* ===== vault math ===== */
/* Crimson Vault: pure maths. No DOM. Shared verbatim by the browser game and tools/vault-sim.js, and ported line for line
   to lib/games/vault.php (proved identical by tools/vault-xcheck.js).

   THE GRID    5 reels x 4 rows, 20 fixed lines, paid left to right (3, 4 or 5 of a kind). 1 unit = stake / 100; the line bet
               is 5 units. Every stake on the High Roller ladder (2,000 to 250,000) is a multiple of 100.
   WILD        The Wild Vault lands on reels 2 to 5 in the base game and stands in for every symbol but the key.
   KEYS        Crimson Keys pay anywhere (3 = 3x, 4 = 20x, 5 = 100x the stake), spaced on the strips so a reel never shows two.
               3+ open the vault: the player picks a vault, and only then are its free spins drawn (on the server).
   THE VAULTS  No wilds on the free-spin strips: wilds drop in on reels 2 to 5 and stick to the end. Multipliers on wilds that
               share a line multiply together.
                 The Safe        12 spins, plain sticky wilds (drop 16.8% per reel per spin), 3+ keys +4 spins.
                 The Deposit Box 10 spins, x2 sticky wilds (drop 9.58%), up to x16 a line, 3+ keys +3 spins.
                 The Grand Vault 4 spins, a wild guaranteed every spin, each growing x2 -> x3 -> x5 with age (x625 a line),
                                 its own low-heavy strip, 3+ keys +2 spins.
               Each vault is tuned to the same average (about 96.4x), so the pick changes only the swing.
   BUYS        100x the stake: straight to the vault pick. 300x, the Inside Job: the Safe starts with 2 sticky wilds and drops
               them at 21.43%, the Box starts with 1 and drops at 11.8%, the Grand Vault starts with 1 already growing.
   MAX WIN     50,000x the stake per round (trigger spin + free spins); the round ends the moment it is reached.
   MEASURED    (node tools/vault-sim.js --spins 40000000 --feat 4000000 --seed 2026, release 15)
               Base game 96.70% as played over 40,000,000 spins with a random vault (99% band 96.03-97.36%), 96.64% with each
               feature at its measured value: line and key wins 58.78%, features 37.86%. Always the Safe 96.76%, always the
               Box 96.63%, always the Grand Vault 96.16% as played (96.71 / 96.53 / 96.70% at measured values; 20M each).
               Hit rate 1 in 2.63 (38.0%). Vault 1 in 255 spins (3 keys 1 in 265, 4 keys 1 in 6,700, 5 keys 1 in 450,000).
               Each vault on its own (4M runs): Safe 96.54x (sd 110, 1,000x+ 1 in 2,445), Box 96.30x (sd 263, 1,000x+
               1 in 66), Grand 96.34x (sd 304, 1,000x+ 1 in 98, the cap 1 in 2,000,000 Grand Vaults).
               100x buy: 96.37% Safe / 96.74% Box / 96.44% Grand. 300x Inside Job: 96.59% / 96.29% / 96.27% (4M each).
               Max win: never in 100,000,000 simulated base spins (biggest 21,570x); the Grand Vault reaches the cap about once
               in 2,000,000 features, so roughly once in 500 million base spins if every trigger picks it. The Inside Job
               Grand Vault caps about 1 in 1,000,000 buys.
               Tuning from the saved draft (pays doubled, base wilds 9 -> 4 per reel to bring the hit rate from 59% to 38%,
               every drop rate re-fitted, Grand Vault strip and Inside Job presets re-cut). */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).vault = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 4, UNITS = 100, MAX_WIN_X = 50000, CAP = MAX_WIN_X * UNITS, TRIGGER = 3;
  const STAKES = [2000, 5000, 10000, 25000, 50000, 100000, 250000];
  const MIN_LEVEL = 5;
  /* symbols */
  const WILD = 0, KEY = 1, NSYM = 10;
  const KEYS = ['wild', 'key', 'boss', 'bars', 'diamond', 'dial', 'ace', 'king', 'queen', 'jack'];
  const NAMES = ['Wild Vault', 'Crimson Key', 'The Boss', 'Gold Bars', 'Blood Diamond', 'The Dial', 'Ace', 'King', 'Queen', 'Jack'];
  /* PAY[symbol] = [3, 4, 5 of a kind] in UNITS (hundredths of the stake) on one line */
  const PAY = [[0, 0, 0], [0, 0, 0], [200, 1000, 5000], [150, 500, 2500], [120, 400, 1500], [100, 250, 1000], [60, 150, 600], [50, 125, 500], [40, 100, 400], [30, 75, 300]];
  /* Crimson Keys pay anywhere, in units, by how many land */
  const KEY_PAY = [0, 0, 0, 300, 2000, 10000];
  /* the 20 lines, as the row on each reel (0 = top) */
  const LINES = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3],
    [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 1, 0, 1, 1],
    [2, 2, 3, 2, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [3, 2, 3, 2, 3],
  ];
  /* base strips: counts of [WILD, KEY, BOSS .. JACK] per reel. Reel 1 never carries a wild. */
  const BASE = [
    [0, 1, 5, 6, 7, 8, 10, 11, 12, 13],
    [4, 2, 6, 7, 8, 9, 11, 12, 13, 14],
    [4, 2, 6, 7, 8, 9, 11, 12, 13, 14],
    [4, 2, 6, 7, 8, 9, 11, 12, 13, 14],
    [3, 1, 5, 6, 7, 8, 10, 11, 12, 13],
  ];
  /* free-spin strips, one per vault (no wilds on the strips: in the free spins wilds only drop in, and stick) */
  const FREE = [
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
    [0, 1, 2, 3, 4, 5, 15, 16, 18, 20],
  ];
  /* The three vaults. spins: free spins; retrig: spins added by 3+ keys; ladder: a sticky wild's multiplier by its age in
     spins (the last step holds); drop: chance per reel 2-5 per spin that a wild drops in; inside / insideDrop: the Inside Job
     (the 300x buy) starts with that many wilds already stuck and drops them more often; guarantee: a wild every spin. */
  const MODES = [
    { key: 'safe', name: 'The Safe', spins: 12, retrig: 4, ladder: [1], drop: 0.168, inside: 2, insideDrop: 0.2143, guarantee: false },
    { key: 'box', name: 'The Deposit Box', spins: 10, retrig: 3, ladder: [2], drop: 0.0958, inside: 1, insideDrop: 0.118, guarantee: false },
    { key: 'grand', name: 'The Grand Vault', spins: 4, retrig: 2, ladder: [2, 3, 5], drop: 0.051, inside: 1, insideDrop: 0.005, guarantee: true },
  ];
  const BUY_PRICE = [100, 300];
  /* average return of one feature in units (each vault is tuned to the same average), for the server's live balancing */
  const FEATURE_EV = 9640;

  /* ---------- strips: built once with a fixed seeded shuffle ---------- */
  function mulberry(seed) {
    let s = seed | 0;
    return function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* shuffle every symbol but the keys, then space the keys evenly so one reel never shows two */
  function buildStrips(counts, seed) {
    const rnd = mulberry(seed), out = [];
    for (let r = 0; r < REELS; r++) {
      const a = [];
      for (let s = 0; s < NSYM; s++) if (s !== KEY) for (let i = 0; i < counts[r][s]; i++) a.push(s);
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      const nk = counts[r][KEY], L = a.length + nk;
      for (let k = 0; k < nk; k++) a.splice(Math.floor(k * L / nk) + Math.floor(L / (2 * nk)), 0, KEY);
      out.push(a);
    }
    return out;
  }
  const STRIPS = buildStrips(BASE, 20261009);
  const FREE_STRIPS = FREE.map((c, m) => buildStrips([c, c, c, c, c], 19201031 + m));

  /* ---------- helpers ---------- */
  function windowOf(strips, stops) {
    const g = [];
    for (let r = 0; r < REELS; r++) { const st = strips[r], L = st.length, col = []; for (let k = 0; k < ROWS; k++) col.push(st[(stops[r] + k) % L]); g.push(col); }
    return g;
  }
  function keysOn(g) { let n = 0; for (let r = 0; r < REELS; r++) for (let k = 0; k < ROWS; k++) if (g[r][k] === KEY) n++; return n; }
  /* line wins: [{l, s, n, m, pay}]. mult[r][k]: the multiplier of a wild on that cell (free spins), or null */
  function evaluate(g, mult) {
    const wins = []; let pay = 0;
    for (let l = 0; l < LINES.length; l++) {
      const ln = LINES[l], sym = g[0][ln[0]];
      if (sym === KEY) continue;
      let n = 1, m = 1;
      while (n < REELS) {
        const c = g[n][ln[n]];
        if (c === WILD) m *= mult ? mult[n][ln[n]] : 1;
        else if (c !== sym) break;
        n++;
      }
      if (n >= 3) { const p = PAY[sym][n - 3] * m; wins.push({ l: l, s: sym, n: n, m: m, pay: p }); pay += p; }
    }
    return { wins: wins, pay: pay };
  }
  /* a base spin */
  function spin(rng) {
    const S = STRIPS, stops = [];
    for (let r = 0; r < REELS; r++) stops.push(Math.floor(rng() * S[r].length));
    const g = windowOf(S, stops);
    const ev = evaluate(g, null), keys = keysOn(g);
    const keyPay = KEY_PAY[keys];
    let pay = ev.pay + keyPay;
    if (pay > CAP) pay = CAP;
    return { stops: stops, grid: g, wins: ev.wins, linePay: ev.pay, keys: keys, keyPay: keyPay, pay: pay, trigger: keys >= TRIGGER };
  }
  const ladderAt = (md, age) => md.ladder[Math.min(age, md.ladder.length - 1)];
  /* cells on reels 2-5 (index r * ROWS + k) without a sticky wild (and, given a grid, without a key) */
  function freeCells(sticky, g) {
    const out = [];
    for (let r = 1; r < REELS; r++) for (let k = 0; k < ROWS; k++) { const c = r * ROWS + k; if (!sticky[c] && (!g || g[r][k] !== KEY)) out.push(c); }
    return out;
  }
  /* The free spins of one vault. opts: {inside: the Inside Job, carried: units already won this round (the trigger spin)} */
  function bonus(rng, modeIdx, opts) {
    opts = opts || {};
    const md = MODES[modeIdx], inside = !!opts.inside;
    const drop = inside ? md.insideDrop : md.drop, strips = FREE_STRIPS[modeIdx];
    const N = REELS * ROWS, sticky = new Array(N).fill(0), age = new Array(N).fill(0);
    const carried = opts.carried | 0;
    let total = carried, capped = false, left = md.spins, played = 0;
    const preset = [], spins = [];
    if (inside) {
      for (let k = 0; k < md.inside; k++) {
        const fc = freeCells(sticky, null);
        const c = fc[Math.floor(rng() * fc.length)];
        sticky[c] = ladderAt(md, 0); preset.push(c);
      }
    }
    while (left > 0 && !capped) {
      left--; played++;
      if (played > 1) for (let c = 0; c < N; c++) if (sticky[c]) { age[c]++; sticky[c] = ladderAt(md, age[c]); }
      const stops = [];
      for (let r = 0; r < REELS; r++) stops.push(Math.floor(rng() * strips[r].length));
      const g = windowOf(strips, stops);
      const land = [];
      for (let r = 1; r < REELS; r++) {
        if (rng() < drop) {
          const rows = [];
          for (let k = 0; k < ROWS; k++) if (!sticky[r * ROWS + k] && g[r][k] !== KEY) rows.push(k);
          if (rows.length) { const c = r * ROWS + rows[Math.floor(rng() * rows.length)]; sticky[c] = ladderAt(md, 0); land.push(c); }
        }
      }
      let forced = false;
      if (md.guarantee && !land.length) {
        const fc = freeCells(sticky, g);
        if (fc.length) { const c = fc[Math.floor(rng() * fc.length)]; sticky[c] = ladderAt(md, 0); land.push(c); forced = true; }
      }
      const mult = [];
      for (let r = 0; r < REELS; r++) { const col = []; for (let k = 0; k < ROWS; k++) { const c = r * ROWS + k; col.push(sticky[c] || 1); if (sticky[c]) g[r][k] = WILD; } mult.push(col); }
      const ev = evaluate(g, mult), keys = keysOn(g);
      let pay = ev.pay;
      if (total + pay >= CAP) { pay = CAP - total; capped = true; }
      total += pay;
      const add = keys >= TRIGGER ? md.retrig : 0;
      left += add;
      spins.push({ stops: stops, grid: g, land: land, forced: forced, sticky: sticky.slice(), wins: ev.wins, pay: pay, keys: keys, add: add, left: left, total: total });
    }
    return { mode: modeIdx, inside: inside, preset: preset, spins: spins, total: total - carried, capped: capped };
  }
  /* A whole round, for simulations and the cross-check. opt: {buy: null|0|1, pick(rng-free policy) -> vault index} */
  function round(rng, opt) {
    opt = opt || {};
    const buy = opt.buy == null ? null : opt.buy;
    const base = buy == null ? spin(rng) : null;
    const out = { buy: buy, base: base, mode: -1, bonus: null, win: base ? base.pay : 0 };
    if (buy != null || base.trigger) {
      const mode = opt.pick ? opt.pick(base) : 0;
      const carried = base ? base.pay : 0;
      out.mode = mode;
      out.bonus = bonus(rng, mode, { inside: buy === 1, carried: carried });
      out.win = carried + out.bonus.total;
    }
    return out;
  }
  /* Dev and test helper: a base spin whose outcome satisfies pred */
  function spinUntil(rng, pred, tries) { for (let i = 0; i < (tries || 2000000); i++) { const o = spin(rng); if (pred(o)) return o; } return spin(rng); }

  return {
    REELS: REELS, ROWS: ROWS, UNITS: UNITS, MAX_WIN_X: MAX_WIN_X, CAP: CAP, TRIGGER: TRIGGER, STAKES: STAKES, MIN_LEVEL: MIN_LEVEL,
    SYM: { WILD: WILD, KEY: KEY }, NSYM: NSYM, KEYS: KEYS, NAMES: NAMES, PAY: PAY, KEY_PAY: KEY_PAY, LINES: LINES, BASE: BASE, FREE: FREE,
    MODES: MODES, BUY_PRICE: BUY_PRICE, FEATURE_EV: FEATURE_EV, STRIPS: STRIPS, FREE_STRIPS: FREE_STRIPS,
    windowOf: windowOf, keysOn: keysOn, evaluate: evaluate, spin: spin, spinUntil: spinUntil, ladderAt: ladderAt, freeCells: freeCells, bonus: bonus, round: round,
    mulberry: mulberry,
  };
});
/* ===== vault ===== */
/* Crimson Vault: presentation only. Every outcome comes from the maths above: practice mode runs it here, online mode asks
   lib/games/vault.php (the same code). A base spin settles in one request; 3+ Crimson Keys (or a buy) open a held round, and
   the free spins are drawn on the server only after the player picks a vault.
   Layout: .vt-bg (the crimson vault: deposit-box walls, the great door ring, marble floor, gold bars, lasers, bat burglars on
   ropes, a camera and the alarm beacon) | .vt-main = head (title or the free-spin HUD), the reel frame (.vt-frame: 5x4 reels,
   the sticky-wild layer, the win-line layer), message, controls. Overlays: the vault door and the pick, the buy menu. */
(function () {
  'use strict';
  const B = Batty, h = B.h, M = BattyMath.vault, ID = 'vault', fmt = B.fmt;
  const SY = M.SYM, REELS = M.REELS, ROWS = M.ROWS, KEY = M.KEYS, NAME = M.NAMES, MODES = M.MODES;
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let G = null;

  /* ---------- sound: vault clunks, dial clicks, laser hum, gold clinks, the alarm; all synthesised ---------- */
  const au = B.audio;
  const SND = {
    spin() { au.noise({ d: 0.35, v: 0.06, lp: 900, f2: 2600 }); au.tone({ f: 110, f2: 70, d: 0.3, type: 'sine', v: 0.1 }); },
    stop(i) { au.tone({ f: 130 + i * 10, f2: 52, d: 0.13, type: 'sine', v: 0.3 }); au.noise({ d: 0.05, v: 0.1, lp: 1200 }); au.tone({ f: 2400 + i * 120, d: 0.03, type: 'triangle', v: 0.04, t: 0.02 }); },
    key(n) { [0, 0.05, 0.1].forEach((t, i) => au.tone({ f: 1568 + n * 180 + i * 330, d: 0.18, type: 'triangle', v: 0.07, t })); au.tone({ f: 523 + n * 90, f2: 1046 + n * 160, d: 0.3, type: 'sine', v: 0.1 }); },
    antic(k) { au.tone({ f: 220 + k * 60, f2: 440 + k * 120, d: 0.9, type: 'sawtooth', v: 0.03 }); au.tone({ f: 880, f2: 660, d: 0.25, type: 'square', v: 0.03, t: 0.1 }); au.tone({ f: 880, f2: 660, d: 0.25, type: 'square', v: 0.03, t: 0.45 }); },
    win(n) { au.seq(n > 2 ? [523, 659, 784, 1046, 784, 1318] : [523, 659, 784, 1046], { step: 0.065, type: 'triangle', v: 0.13 }); },
    clink() { au.tone({ f: 2093, d: 0.12, type: 'triangle', v: 0.07 }); au.tone({ f: 3136, d: 0.08, type: 'sine', v: 0.05, t: 0.03 }); },
    tick() { au.tone({ f: 1900, d: 0.015, type: 'square', v: 0.035 }); },
    dial() { au.tone({ f: 2600, d: 0.01, type: 'square', v: 0.05 }); au.noise({ d: 0.015, v: 0.03, hp: 3000 }); },
    clunk() { au.tone({ f: 70, f2: 38, d: 0.3, type: 'sine', v: 0.45 }); au.noise({ d: 0.18, v: 0.14, lp: 500 }); au.tone({ f: 620, f2: 300, d: 0.08, type: 'square', v: 0.04 }); },
    bolts() { for (let i = 0; i < 6; i++) { au.tone({ f: 180 - i * 8, f2: 90, d: 0.08, type: 'square', v: 0.05, t: i * 0.07 }); au.noise({ d: 0.05, v: 0.06, lp: 900, t: i * 0.07 }); } },
    door() { au.tone({ f: 60, f2: 95, d: 1.6, type: 'sawtooth', v: 0.05, a: 0.2 }); au.noise({ d: 1.5, v: 0.06, lp: 380 }); au.tone({ f: 140, f2: 220, d: 1.2, type: 'triangle', v: 0.04, t: 0.3 }); },
    choir() { [[262, 0], [330, 0], [392, 0], [523, 0], [294, 0.6], [370, 0.6], [440, 0.6], [587, 0.6]].forEach(([f, t]) => { au.tone({ f, d: 1.1, type: 'sine', v: 0.05, a: 0.15, t }); au.tone({ f: f * 2, d: 0.9, type: 'triangle', v: 0.018, a: 0.15, t }); }); },
    laser() { au.tone({ f: 1400, f2: 300, d: 0.25, type: 'sawtooth', v: 0.035 }); },
    slam() { au.tone({ f: 90, f2: 40, d: 0.35, type: 'sine', v: 0.5 }); au.noise({ d: 0.25, v: 0.16, lp: 700 }); au.tone({ f: 1200, f2: 2400, d: 0.2, type: 'triangle', v: 0.06, t: 0.05 }); },
    mult(m) { au.tone({ f: 440 + m * 90, f2: 880 + m * 160, d: 0.2, type: 'square', v: 0.06 }); au.tone({ f: 1320 + m * 60, d: 0.14, type: 'sine', v: 0.06, t: 0.09 }); },
    alarm() { for (let i = 0; i < 4; i++) au.tone({ f: i % 2 ? 660 : 880, d: 0.22, type: 'square', v: 0.04, t: i * 0.24 }); },
    retrig() { au.seq([523, 659, 784, 1046, 1318], { step: 0.06, type: 'square', v: 0.06 }); B.sfx('ding'); },
    click() { B.sfx('click'); },
    pop() { B.sfx('pop'); },
    bonus() { B.sfx('bonus'); },
  };
  const snd = (n, a) => { try { SND[n](a); } catch (e) { /* sound is optional */ } };

  /* ---------- art: hand-built SVG, shared gradients ---------- */
  const DEFS_IN =
    '<linearGradient id="vt-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#f5c451"/><stop offset=".7" stop-color="#b9780f"/><stop offset="1" stop-color="#5a3000"/></linearGradient>' +
    '<linearGradient id="vt-gold2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5208"/><stop offset=".3" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#e2a630"/><stop offset="1" stop-color="#6a3a04"/></linearGradient>' +
    '<linearGradient id="vt-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6fb"/><stop offset=".3" stop-color="#a9b0c2"/><stop offset=".62" stop-color="#5c6378"/><stop offset="1" stop-color="#22262f"/></linearGradient>' +
    '<radialGradient id="vt-chrome" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#c3c8d6"/><stop offset=".8" stop-color="#5a6070"/><stop offset="1" stop-color="#1c1f27"/></radialGradient>' +
    '<radialGradient id="vt-crimson" cx=".4" cy=".32" r=".78"><stop offset="0" stop-color="#ff7a86"/><stop offset=".45" stop-color="#c3122c"/><stop offset=".85" stop-color="#5c0414"/><stop offset="1" stop-color="#2a0008"/></radialGradient>' +
    '<linearGradient id="vt-enamel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a94"/><stop offset=".4" stop-color="#d0142e"/><stop offset="1" stop-color="#4a0010"/></linearGradient>' +
    '<radialGradient id="vt-halo" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#ff2a3a" stop-opacity=".65"/><stop offset="1" stop-color="#ff2a3a" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="vt-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7a0" stop-opacity=".9"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="vt-ruby" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd0d6"/><stop offset=".3" stop-color="#ff2a48"/><stop offset=".72" stop-color="#9a001e"/><stop offset="1" stop-color="#38000a"/></linearGradient>' +
    '<radialGradient id="vt-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#7d6a9a"/><stop offset=".6" stop-color="#3c2c58"/><stop offset="1" stop-color="#160e24"/></radialGradient>' +
    '<pattern id="vt-stripe" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#17121e"/><rect width="12" height="6" fill="#ece6f2"/></pattern>' +
    '<linearGradient id="vt-sack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8b680"/><stop offset=".6" stop-color="#9a7240"/><stop offset="1" stop-color="#4a3218"/></linearGradient>' +
    '<linearGradient id="vt-lA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd6dc"/><stop offset=".45" stop-color="#ff3550"/><stop offset="1" stop-color="#6a0014"/></linearGradient>' +
    '<linearGradient id="vt-lK" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ecff"/><stop offset=".45" stop-color="#5a8cff"/><stop offset="1" stop-color="#14286a"/></linearGradient>' +
    '<linearGradient id="vt-lQ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcffe8"/><stop offset=".45" stop-color="#2ad07a"/><stop offset="1" stop-color="#0a4a26"/></linearGradient>' +
    '<linearGradient id="vt-lJ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2dcff"/><stop offset=".45" stop-color="#b05cff"/><stop offset="1" stop-color="#3a0c6a"/></linearGradient>' +
    ['A', 'K', 'Q', 'J'].map((c) => '<clipPath id="vt-c' + c + '"><text x="50" y="80" text-anchor="middle" font-family="Cinzel,serif" font-weight="900" font-size="78">' + c + '</text></clipPath>').join('');
  const DEFS = '<svg class="vt-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + DEFS_IN + '</defs></svg>';

  const BATP = 'M60 22 C52 10 40 8 28 12 C34 16 36 20 34 26 C26 22 16 24 8 30 C22 30 30 34 36 40 C44 34 52 32 60 34 C68 32 76 34 84 40 C90 34 98 30 112 30 C104 24 94 22 86 26 C84 20 86 16 92 12 C80 8 68 10 60 22Z';
  const bolts = (cx, cy, r, n, rr, cls) => Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n; return '<circle' + (cls ? ' class="' + cls + '" style="--bx:' + (-Math.cos(a) * 9).toFixed(1) + 'px;--by:' + (-Math.sin(a) * 9).toFixed(1) + 'px"' : '') + ' cx="' + (cx + Math.cos(a) * r).toFixed(1) + '" cy="' + (cy + Math.sin(a) * r).toFixed(1) + '" r="' + rr + '" fill="url(#vt-gold)" stroke="#3a1a00" stroke-width="' + (rr > 4 ? 1.5 : 0.8) + '"/>'; }).join('');
  const ticks = (cx, cy, r1, r2, n, col, w) => Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n; return '<path d="M' + (cx + Math.cos(a) * r1).toFixed(1) + ' ' + (cy + Math.sin(a) * r1).toFixed(1) + 'L' + (cx + Math.cos(a) * (i % 5 ? r2 : r2 - (r1 - r2) * 0.8)).toFixed(1) + ' ' + (cy + Math.sin(a) * (i % 5 ? r2 : r2 - (r1 - r2) * 0.8)).toFixed(1) + '" stroke="' + col + '" stroke-width="' + w + '"/>'; }).join('');
  const spokes = (cx, cy, r, w) => [0, 120, 240].map((d) => { const a = (d - 90) * Math.PI / 180, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; return '<path d="M' + cx + ' ' + cy + 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + '" stroke="url(#vt-gold2)" stroke-width="' + w + '" stroke-linecap="round"/><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (w * 0.9).toFixed(1) + '" fill="url(#vt-gold)" stroke="#3a1a00" stroke-width="1"/>'; }).join('');
  const letter = (c, grad, gem) => '<text x="50" y="80" text-anchor="middle" font-family="Cinzel,serif" font-weight="900" font-size="78" fill="url(#' + grad + ')" stroke="#14060a" stroke-width="3" paint-order="stroke">' + c + '</text>' +
    '<g clip-path="url(#vt-c' + c + ')"><path class="vt-shine" d="M-40 0 L-18 0 L-48 100 L-70 100Z" fill="#fff" opacity=".7"/></g>' +
    '<path d="M50 4 l5 6 l-5 6 l-5 -6Z" fill="' + gem + '" stroke="#3a1a00" stroke-width="1"/><path class="vt-spark" d="M82 22 l1.6 5 l5 1.6 l-5 1.6 l-1.6 5 l-1.6 -5 l-5 -1.6 l5 -1.6Z" fill="#fff"/>';
  const SYM_IN = [
    /* 0 Wild Vault: a little vault door with its spoked handle */
    '<circle cx="50" cy="44" r="46" fill="url(#vt-halo)" class="vt-pulse"/>' +
    '<circle cx="50" cy="44" r="37" fill="url(#vt-steel)" stroke="#14060a" stroke-width="2.5"/>' + bolts(50, 44, 32, 12, 2.4) +
    '<circle cx="50" cy="44" r="26" fill="url(#vt-crimson)" stroke="#2a0008" stroke-width="2"/>' + ticks(50, 44, 24, 21, 30, '#ffd88a', 1) +
    '<g class="vt-spoke">' + spokes(50, 44, 17, 3.4) + '<circle cx="50" cy="44" r="6.5" fill="url(#vt-gold)" stroke="#3a1a00" stroke-width="1.5"/></g>' +
    '<path d="M24 30 A30 30 0 0 1 44 15" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="10" y="72" width="80" height="22" rx="6" fill="url(#vt-gold)" stroke="#3a1a00" stroke-width="2.5"/><rect x="14" y="75" width="72" height="4" rx="2" fill="#fff" opacity=".35"/>' +
    '<text x="50" y="90" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="17" letter-spacing="1.5" fill="#4a0010">WILD</text>',
    /* 1 Crimson Key */
    '<circle cx="50" cy="50" r="48" fill="url(#vt-halo)" class="vt-pulse"/>' +
    '<g class="vt-keyb"><g transform="rotate(-38 50 50)">' +
    '<circle cx="50" cy="22" r="18" fill="url(#vt-enamel)" stroke="url(#vt-gold)" stroke-width="4"/>' +
    '<path transform="translate(35 15) scale(.25)" d="' + BATP + '" fill="#2a0008"/>' +
    '<rect x="45" y="38" width="10" height="50" rx="2" fill="url(#vt-gold2)" stroke="#3a1a00" stroke-width="1.8"/>' +
    '<rect x="40" y="39" width="20" height="6" rx="2" fill="url(#vt-enamel)" stroke="#3a1a00" stroke-width="1.5"/>' +
    '<path d="M55 70 h13 v7 h-6 v5 h-7Z M55 82 h9 v6 h-9Z" fill="url(#vt-gold)" stroke="#3a1a00" stroke-width="1.5"/>' +
    '<path d="M38 14 A14 14 0 0 1 50 8" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5" stroke-linecap="round"/></g></g>' +
    '<path class="vt-spark" d="M78 18 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2Z" fill="#fff"/><path class="vt-spark s2" d="M22 74 l1.6 5 l5 1.6 l-5 1.6 l-1.6 5 l-1.6 -5 l-5 -1.6 l5 -1.6Z" fill="#fff"/>' +
    '<rect x="18" y="82" width="64" height="14" rx="5" fill="#2a0010" stroke="url(#vt-gold)" stroke-width="2"/><text x="50" y="93" text-anchor="middle" font-family="Cinzel,serif" font-weight="900" font-size="9" letter-spacing="1.4" fill="#ffd0a0">BONUS</text>',
    /* 2 The Boss: the bat burglar, flat cap, domino mask, striped jumper and his swag */
    '<path d="M10 100 Q12 70 50 64 Q88 70 90 100Z" fill="url(#vt-stripe)" stroke="#0a0610" stroke-width="2.5"/>' +
    '<path d="M74 62 C92 62 98 82 90 96 C82 100 66 98 64 88 C60 76 64 64 74 62Z" fill="url(#vt-sack)" stroke="#2a1a08" stroke-width="2"/><path d="M70 64 q6 -6 12 0" fill="none" stroke="#2a1a08" stroke-width="2.5"/><text x="78" y="88" text-anchor="middle" font-family="Bungee,sans-serif" font-size="11" fill="#4a2a08">BB</text>' +
    '<path d="M28 44 L20 12 L44 32Z M72 44 L80 12 L56 32Z" fill="url(#vt-fur)" stroke="#0e0716" stroke-width="2.5" stroke-linejoin="round"/><path d="M29 39 L25 20 L39 32Z M71 39 L75 20 L61 32Z" fill="#d07aa6" opacity=".5"/>' +
    '<ellipse cx="50" cy="48" rx="21" ry="19" fill="url(#vt-fur)" stroke="#0e0716" stroke-width="2.5"/>' +
    '<path d="M24 26 Q50 12 76 26 L78 32 Q50 24 22 32Z" fill="#2c2a36" stroke="#0a0610" stroke-width="2"/><path d="M22 32 Q50 24 78 32 Q86 34 88 38 Q60 30 22 34Z" fill="#3c3a48" stroke="#0a0610" stroke-width="1.5"/>' +
    '<path d="M28 44 Q50 36 72 44 L72 54 Q61 50 50 54 Q39 50 28 54Z" fill="#0c0810" stroke="#000" stroke-width="1.5"/>' +
    '<g class="vt-eyes"><ellipse cx="40" cy="47.5" rx="5" ry="4.5" fill="#fff4b0"/><ellipse cx="60" cy="47.5" rx="5" ry="4.5" fill="#fff4b0"/><circle cx="41" cy="48" r="2.2" fill="#1a0a0a"/><circle cx="61" cy="48" r="2.2" fill="#1a0a0a"/></g>' +
    '<path d="M42 59 Q50 64 58 59" fill="none" stroke="#14060c" stroke-width="2" stroke-linecap="round"/><path d="M53 60 l2 5 l2 -5.5Z" fill="#fff" stroke="#14060c" stroke-width=".8"/>',
    /* 3 Gold Bars */
    '<circle cx="50" cy="56" r="44" fill="url(#vt-glow)" opacity=".55" class="vt-pulse"/>' +
    [[8, 66], [52, 66], [30, 40]].map(([x, y]) => '<path d="M' + x + ' ' + (y + 22) + ' L' + (x + 40) + ' ' + (y + 22) + ' L' + (x + 34) + ' ' + (y + 6) + ' L' + (x + 6) + ' ' + (y + 6) + 'Z" fill="url(#vt-gold2)" stroke="#3a1a00" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M' + (x + 6) + ' ' + (y + 6) + ' L' + (x + 34) + ' ' + (y + 6) + ' L' + (x + 30) + ' ' + y + ' L' + (x + 10) + ' ' + y + 'Z" fill="#fff1b0" stroke="#3a1a00" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path transform="translate(' + (x + 13) + ' ' + (y + 10) + ') scale(.12)" d="' + BATP + '" fill="#7a4a06" opacity=".75"/>').join('') +
    '<path class="vt-spark" d="M76 30 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2Z" fill="#fff"/>',
    /* 4 Blood Diamond */
    '<path d="M18 36 L32 16 L68 16 L82 36 L50 92Z" fill="url(#vt-ruby)" stroke="#2a0008" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M18 36 L82 36 M32 16 L40 36 L50 16 L60 36 L68 16 M40 36 L50 92 L60 36" fill="none" stroke="#ffc0c8" stroke-opacity=".55" stroke-width="1.5"/>' +
    '<path d="M32 16 L40 36 L18 36Z" fill="#fff" opacity=".3"/><path d="M50 16 L60 36 L40 36Z" fill="#fff" opacity=".14"/><path d="M40 36 L50 92 L18 36Z" fill="#000" opacity=".12"/>' +
    '<path class="vt-spark" d="M30 12 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2Z" fill="#fff"/><path class="vt-spark s2" d="M70 50 l1.6 5 l5 1.6 l-5 1.6 l-1.6 5 l-1.6 -5 l-5 -1.6 l5 -1.6Z" fill="#fff"/>',
    /* 5 The Dial: a polished combination dial */
    '<circle cx="50" cy="50" r="42" fill="url(#vt-chrome)" stroke="#14141c" stroke-width="2.5"/>' + ticks(50, 50, 39, 34, 40, '#2a2e3a', 1.4) +
    '<g class="vt-dialr"><circle cx="50" cy="50" r="30" fill="#14121a" stroke="#4a4e5e" stroke-width="2"/>' + ticks(50, 50, 29, 25, 20, '#d8dcea', 1.2) +
    ['0', '25', '50', '75'].map((t, i) => { const a = (i * 90 - 90) * Math.PI / 180; return '<text x="' + (50 + Math.cos(a) * 18).toFixed(1) + '" y="' + (53 + Math.sin(a) * 18).toFixed(1) + '" text-anchor="middle" font-family="Bebas Neue,sans-serif" font-size="9" fill="#f0f2fa">' + t + '</text>'; }).join('') +
    '<circle cx="50" cy="50" r="10" fill="url(#vt-chrome)" stroke="#14141c" stroke-width="1.5"/></g>' +
    '<path d="M50 4 L56 14 L44 14Z" fill="url(#vt-enamel)" stroke="#2a0008" stroke-width="1.5"/>' +
    '<path d="M22 30 A34 34 0 0 1 40 14" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>',
    /* 6-9 the royals, engraved and gem-set */
    letter('A', 'vt-lA', '#ff3a50'), letter('K', 'vt-lK', '#5a8cff'), letter('Q', 'vt-lQ', '#2ad07a'), letter('J', 'vt-lJ', '#b05cff'),
  ];
  const symSvg = (i) => '<svg class="vt-sym vt-s-' + KEY[i] + '" viewBox="0 0 100 100" aria-hidden="true">' + SYM_IN[i] + '</svg>';

  /* the three vaults' art: a steel safe, a pulled deposit box, the gold pile of the Grand Vault */
  const VAULT_ART = [
    '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="16" y="14" width="88" height="92" rx="8" fill="url(#vt-steel)" stroke="#14060a" stroke-width="3"/><rect x="24" y="22" width="72" height="76" rx="5" fill="#3a4050" stroke="#14141c" stroke-width="2"/>' +
      '<circle cx="60" cy="58" r="20" fill="url(#vt-chrome)" stroke="#14141c" stroke-width="2"/>' + ticks(60, 58, 18, 14, 24, '#2a2e3a', 1.2) + '<circle cx="60" cy="58" r="6" fill="#1a1c24"/><path d="M60 36 l4 6 h-8Z" fill="#ff3a50"/>' +
      '<rect x="84" y="46" width="6" height="24" rx="3" fill="url(#vt-gold)"/><rect x="26" y="106" width="14" height="8" rx="2" fill="#22262f"/><rect x="80" y="106" width="14" height="8" rx="2" fill="#22262f"/></svg>',
    '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="10" y="20" width="100" height="52" rx="4" fill="#5a3a12" stroke="#1a0c02" stroke-width="3"/>' +
      [0, 1, 2].map((i) => '<rect x="' + (16 + i * 32) + '" y="26" width="28" height="18" rx="2" fill="url(#vt-gold2)" stroke="#3a1a00" stroke-width="1.5"/><circle cx="' + (30 + i * 32) + '" cy="35" r="2.6" fill="#2a1406"/>').join('') +
      '<path d="M18 56 L102 56 L110 96 L10 96Z" fill="url(#vt-gold2)" stroke="#3a1a00" stroke-width="2.5"/><path d="M26 56 L94 56 L96 64 L24 64Z" fill="#2a1406"/>' +
      '<circle cx="44" cy="58" r="6" fill="url(#vt-ruby)"/><circle cx="60" cy="56" r="7" fill="url(#vt-gold)"/><circle cx="76" cy="59" r="5" fill="#5a8cff"/><rect x="50" y="78" width="20" height="8" rx="3" fill="#3a1a00"/></svg>',
    '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="url(#vt-glow)"/>' +
      [[14, 82], [46, 82], [78, 82], [30, 64], [62, 64], [46, 46]].map(([x, y]) => '<path d="M' + x + ' ' + (y + 18) + ' L' + (x + 30) + ' ' + (y + 18) + ' L' + (x + 26) + ' ' + (y + 5) + ' L' + (x + 4) + ' ' + (y + 5) + 'Z" fill="url(#vt-gold2)" stroke="#3a1a00" stroke-width="1.6"/><path d="M' + (x + 4) + ' ' + (y + 5) + ' L' + (x + 26) + ' ' + (y + 5) + ' L' + (x + 23) + ' ' + y + ' L' + (x + 7) + ' ' + y + 'Z" fill="#fff1b0" stroke="#3a1a00" stroke-width="1.2"/>').join('') +
      '<path d="M44 40 L48 22 L56 32 L60 16 L64 32 L72 22 L76 40Z" fill="url(#vt-gold)" stroke="#3a1a00" stroke-width="2"/><circle cx="60" cy="14" r="4" fill="url(#vt-ruby)"/></svg>',
  ];
  const MODE_TXT = [
    { tag: 'Steady', line: '12 free spins', how: 'Every wild that drops in sticks for the rest of the round.', stat: 'Sticky wilds · lowest swing' },
    { tag: 'Bold', line: '10 free spins', how: 'Sticky wilds worth ×2 each, and they multiply together on a line.', stat: '×2 sticky wilds · up to ×16 a line' },
    { tag: 'Reckless', line: '4 free spins', how: 'A wild every spin. Each one grows from ×2 to ×3 to ×5 as it ages.', stat: 'Growing wilds · up to ×625 a line' },
  ];

  /* the lobby poster */
  const POSTER = '<svg viewBox="0 0 300 380" xmlns="http://www.w3.org/2000/svg"><defs>' + DEFS_IN +
    '<radialGradient id="vtp-bg" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#6a0a1e"/><stop offset=".6" stop-color="#2a0410"/><stop offset="1" stop-color="#0a0106"/></radialGradient></defs>' +
    '<rect width="300" height="380" fill="url(#vtp-bg)"/>' +
    Array.from({ length: 6 }, (_, i) => '<path d="M' + (-20 + i * 70) + ' 380 L' + (40 + i * 50) + ' 0" stroke="#ff2a3a" stroke-width="1.6" opacity=".45"/>').join('') +
    '<circle cx="150" cy="150" r="118" fill="url(#vt-steel)" stroke="#14060a" stroke-width="5"/>' + bolts(150, 150, 104, 20, 5.5) +
    '<circle cx="150" cy="150" r="88" fill="url(#vt-crimson)" stroke="#2a0008" stroke-width="4"/>' + ticks(150, 150, 82, 74, 60, '#ffd88a', 1.4) +
    '<g>' + spokes(150, 150, 62, 9) + '<circle cx="150" cy="150" r="22" fill="url(#vt-chrome)" stroke="#14141c" stroke-width="2"/></g>' +
    '<g transform="translate(196 196) scale(.9)">' + SYM_IN[1] + '</g>' +
    '<g transform="translate(20 210) scale(.9)">' + SYM_IN[3] + '</g>' +
    '<text x="150" y="318" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="40" fill="url(#vt-gold)" stroke="#2a0008" stroke-width="3" paint-order="stroke">CRIMSON</text>' +
    '<text x="150" y="360" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="40" fill="url(#vt-gold)" stroke="#2a0008" stroke-width="3" paint-order="stroke">VAULT</text></svg>';

  /* ---------- rules ---------- */
  const RTP_TEXT = '96.7% for the base game (40,000,000 simulated spins: a win 1 in 2.63 spins, the vault about 1 in 255 spins, and every vault returns about 96.4× your stake on average). The 100× buy returns 96.4–96.7% and the 300× Inside Job 96.3–96.6%, depending on the vault (4,000,000 simulated buys each). The ' + fmt(M.MAX_WIN_X) + '× maximum was never reached in 100,000,000 simulated base spins (about once in 2,000,000 Grand Vaults); the biggest base-game win in the test was 21,570×.';
  function rules() {
    const x = (u) => +(u / M.UNITS).toFixed(2) + '×';
    const rows = [2, 3, 4, 5, 6, 7, 8, 9].map((s) => '<tr><td><span class="vt-ri">' + symSvg(s) + '</span>' + NAME[s] + '</td>' + M.PAY[s].map((u) => '<td>' + x(u) + '</td>').join('') + '</tr>').join('');
    return '<div class="vt-rules">' +
      '<p><b>Crimson Vault</b> is an original Batty Bucks heist slot for the <b>High Roller Lounge</b>, open to players of <b>level ' + M.MIN_LEVEL + ' and above</b>. Stakes run from ' + fmt(M.STAKES[0]) + ' to ' + fmt(M.STAKES[M.STAKES.length - 1]) + ' BB.</p>' +
      '<h3>The reels</h3><p>Five reels, four rows and <b>20 fixed lines</b>. A line pays when 3, 4 or 5 matching symbols land on it from the leftmost reel. Only the highest win on each line is paid; wins on different lines are added up.</p>' +
      '<h3>Wild Vault</h3><p>The <b>Wild Vault</b> lands on reels 2 to 5 and stands in for every symbol except the Crimson Key.</p>' +
      '<h3>Crimson Keys</h3><p>Keys pay anywhere: 3 pay ' + x(M.KEY_PAY[3]) + ', 4 pay ' + x(M.KEY_PAY[4]) + ' and 5 pay ' + x(M.KEY_PAY[5]) + ' your stake. <b>3 or more</b> open the vault.</p>' +
      '<h3>Pick your vault</h3><p>Choose one of three vaults. Nothing is decided until you choose: the free spins are drawn after your pick, and every vault returns the same on average; they differ only in how swingy they are. In the free spins wilds drop in on reels 2 to 5 and <b>stick</b> until the end. Where wilds with multipliers meet on a line, their multipliers <b>multiply</b> together. 3 or more keys in the free spins add more spins.</p><ul>' +
      MODES.map((m, i) => '<li><b>' + m.name + '</b>: ' + m.spins + ' free spins. ' + MODE_TXT[i].how + ' 3+ keys add ' + m.retrig + ' spins.</li>').join('') + '</ul>' +
      '<h3>Buy the heist</h3><p><b>Crack the vault</b> for ' + M.BUY_PRICE[0] + '× your stake: straight to the vault pick. <b>The Inside Job</b> for ' + M.BUY_PRICE[1] + '× your stake: our inside man has already been in. The Safe starts with ' + MODES[0].inside + ' sticky wilds and drops them more often, the Deposit Box starts with ' + MODES[1].inside + ' and drops them more often, and the Grand Vault starts with ' + MODES[2].inside + ' already growing. Batty Bucks only: the result is random and can be less than the price.</p>' +
      '<p>A round (the triggering spin and all its free spins) is capped at <b>' + fmt(M.MAX_WIN_X) + '× your stake</b>; the round ends the moment it is reached.</p>' +
      '<h3>Paytable</h3><p>Multiples of your stake for 3, 4 and 5 on a line.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>' + rows + '</table>' +
      '<div class="rtp"><b>Tested return</b> ' + RTP_TEXT + ' Rounds are drawn on the server with a secure random generator. Space spins; a tap or Space during a spin stops the reels at once, and taps speed through wins and free spins.</div>' +
      '<p>Batty Bucks are play money. They have no cash value and cannot be bought, sold or cashed out.</p></div>';
  }

  /* ---------- symbol html caches (resting, and motion-blurred for spinning) ---------- */
  const REST = [], BLUR = [], PRE = [];
  function prepSyms() {
    if (REST.length) return;
    for (let i = 0; i < M.NSYM; i++) {
      REST[i] = symSvg(i);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>' + DEFS_IN + '<filter id="b" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="0 9"/></filter></defs><g filter="url(#b)" opacity=".9">' + SYM_IN[i] + '</g></svg>';
      BLUR[i] = 'data:image/svg+xml,' + encodeURIComponent(svg);
      try { const im = new Image(); im.src = BLUR[i]; PRE.push(im); if (im.decode) im.decode().catch(() => {}); } catch (e) { /* fine */ }
    }
  }
  const rndSym = (free) => { const st = free ? M.FREE_STRIPS[0][2] : M.STRIPS[2]; return st[(Math.random() * st.length) | 0]; };
  const rndPlain = () => 2 + ((Math.random() * 8) | 0);

  /* ---------- the vault behind the reels ---------- */
  function world() {
    const boxes = (x0, w) => {
      let s = '';
      for (let row = 0; row < 9; row++) for (let col = 0; col < Math.floor(w / 92); col++) {
        const x = x0 + col * 92, y = 40 + row * 84, n = 100 + row * 10 + col + (x0 > 800 ? 50 : 0);
        s += '<rect x="' + x + '" y="' + y + '" width="86" height="78" rx="4" fill="url(#vt-wb)" stroke="#12030a" stroke-width="3"/>' +
          '<rect x="' + (x + 26) + '" y="' + (y + 10) + '" width="34" height="12" rx="2" fill="url(#vt-gold2)" opacity=".85"/><text x="' + (x + 43) + '" y="' + (y + 20) + '" text-anchor="middle" font-family="Bebas Neue,sans-serif" font-size="11" fill="#3a1a00">' + n + '</text>' +
          '<circle cx="' + (x + 43) + '" cy="' + (y + 48) + '" r="7" fill="url(#vt-chrome)"/><rect x="' + (x + 41.5) + '" y="' + (y + 46) + '" width="3" height="7" fill="#12030a"/>';
      }
      return s;
    };
    const stack = (cx, by, n) => { let s = ''; for (let row = 0; row < n; row++) for (let i = 0; i < n - row; i++) { const x = cx - (n - row) * 34 + i * 68, y = by - row * 30; s += '<path d="M' + x + ' ' + y + ' L' + (x + 64) + ' ' + y + ' L' + (x + 56) + ' ' + (y - 22) + ' L' + (x + 8) + ' ' + (y - 22) + 'Z" fill="url(#vt-gold2)" stroke="#3a1a00" stroke-width="2"/><path d="M' + (x + 8) + ' ' + (y - 22) + ' L' + (x + 56) + ' ' + (y - 22) + ' L' + (x + 51) + ' ' + (y - 30) + ' L' + (x + 13) + ' ' + (y - 30) + 'Z" fill="#fff1b0" stroke="#3a1a00" stroke-width="1.5"/>'; } return s; };
    return '<svg class="vt-wall" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><radialGradient id="vt-wg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#5a0a1c"/><stop offset=".55" stop-color="#26040e"/><stop offset="1" stop-color="#080105"/></radialGradient>' +
      '<linearGradient id="vt-wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a1424"/><stop offset="1" stop-color="#2e0610"/></linearGradient>' +
      '<linearGradient id="vt-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0610"/><stop offset=".4" stop-color="#140208"/><stop offset="1" stop-color="#050003"/></linearGradient></defs>' +
      '<rect width="1600" height="900" fill="url(#vt-wg)"/>' +
      '<g opacity=".8">' + boxes(-30, 470) + boxes(1180, 470) + '</g>' +
      /* the great door ring behind the reels */
      '<g class="vt-ring"><circle cx="800" cy="420" r="430" fill="none" stroke="url(#vt-steel)" stroke-width="56" opacity=".7"/><circle cx="800" cy="420" r="430" fill="none" stroke="#12030a" stroke-width="4" opacity=".7"/>' + bolts(800, 420, 430, 36, 10) + '</g>' +
      /* the marble floor with its reflections */
      '<rect x="0" y="760" width="1600" height="140" fill="url(#vt-floor)"/><path d="M0 760 H1600" stroke="#a8263c" stroke-width="3" opacity=".6"/>' +
      Array.from({ length: 9 }, (_, i) => '<path d="M' + (i * 200 - 100) + ' 900 L' + (800 + (i - 4) * 60) + ' 760" stroke="#5a0a1c" stroke-width="2" opacity=".5"/>').join('') +
      '<g class="vt-gold l">' + stack(190, 840, 4) + '</g><g class="vt-gold r">' + stack(1410, 840, 4) + '</g>' +
      /* the camera, top right */
      '<g class="vt-cam" transform="translate(1440 70)"><rect x="-6" y="-40" width="12" height="40" fill="#22262f"/><g class="vt-camh"><rect x="-70" y="-14" width="90" height="34" rx="6" fill="url(#vt-steel)" stroke="#14060a" stroke-width="3"/><circle cx="-70" cy="3" r="12" fill="#14121a" stroke="#4a4e5e" stroke-width="3"/><circle cx="-70" cy="3" r="4" fill="#ff2a3a" class="vt-camled"/></g></g>' +
      '</svg>';
  }
  const ROPE_BAT = '<svg viewBox="0 0 120 300" aria-hidden="true"><path d="M60 0 V150" stroke="#b89a6a" stroke-width="4" stroke-dasharray="6 3"/>' +
    '<g transform="translate(0 130)"><path d="M60 20 C40 0 20 6 6 -6 C10 14 4 30 14 46 C24 36 40 40 46 52Z M60 20 C80 0 100 6 114 -6 C110 14 116 30 106 46 C96 36 80 40 74 52Z" fill="#160e22" stroke="#06030a" stroke-width="2"/>' +
    '<path d="M44 36 L38 12 L54 26Z M76 36 L82 12 L66 26Z" fill="url(#vt-fur)" stroke="#06030a" stroke-width="2"/><ellipse cx="60" cy="44" rx="18" ry="16" fill="url(#vt-fur)" stroke="#06030a" stroke-width="2"/>' +
    '<path d="M42 40 Q60 34 78 40 L78 48 Q60 44 42 48Z" fill="#0c0810"/><g class="vt-eyes"><ellipse cx="52" cy="44" rx="4" ry="3.5" fill="#fff4b0"/><ellipse cx="68" cy="44" rx="4" ry="3.5" fill="#fff4b0"/></g>' +
    '<path d="M38 60 Q40 78 60 80 Q80 78 82 60 Q60 66 38 60Z" fill="url(#vt-stripe)" stroke="#06030a" stroke-width="2"/>' +
    '<path d="M70 70 C90 70 96 92 88 104 C78 110 62 106 62 94 C60 82 62 72 70 70Z" fill="url(#vt-sack)" stroke="#2a1a08" stroke-width="2"/><text x="77" y="96" text-anchor="middle" font-family="Bungee,sans-serif" font-size="10" fill="#4a2a08">BB</text></g></svg>';

  /* the great vault door for the pick scene */
  const DOOR = '<svg class="vt-doorsvg" viewBox="0 0 400 400" aria-hidden="true">' +
    '<circle cx="200" cy="200" r="190" fill="url(#vt-steel)" stroke="#14060a" stroke-width="5"/>' +
    '<g class="vt-bolts">' + bolts(200, 200, 172, 16, 9, 'vt-bolt') + '</g>' +
    '<circle cx="200" cy="200" r="150" fill="url(#vt-crimson)" stroke="#2a0008" stroke-width="5"/>' + ticks(200, 200, 142, 132, 80, '#ffd88a', 1.6) +
    '<path id="vt-arc" d="M88 200 A112 112 0 0 1 312 200" fill="none"/>' +
    '<text font-family="\'Cinzel Decorative\',Cinzel,serif" font-weight="900" font-size="24" letter-spacing="5" fill="url(#vt-gold)" stroke="#2a0008" stroke-width="1"><textPath href="#vt-arc" startOffset="50%" text-anchor="middle">CRIMSON VAULT</textPath></text>' +
    '<g class="vt-dspoke">' + spokes(200, 200, 100, 13) + '</g>' +
    '<g class="vt-ddial"><circle cx="200" cy="200" r="48" fill="url(#vt-chrome)" stroke="#14141c" stroke-width="3"/>' + ticks(200, 200, 46, 39, 50, '#1c1f27', 1.4) + '<circle cx="200" cy="200" r="30" fill="#14121a" stroke="#5a5e6e" stroke-width="2"/><circle cx="200" cy="200" r="10" fill="url(#vt-chrome)"/></g>' +
    '<path d="M200 140 l7 12 h-14Z" fill="#ff3a50" stroke="#2a0008" stroke-width="1.5"/>' +
    '<path d="M60 130 A150 150 0 0 1 150 44" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-linecap="round"/></svg>';

  /* ---------- the mounted game ---------- */
  function mount(root) {
    prepSyms();
    const S = B.scope();
    G = { S };
    const el = {};
    root.classList.add('vt');
    root.innerHTML = DEFS;
    let DEV = false;
    try { DEV = !B.online && localStorage.getItem('batty-dev') === '1'; } catch (e) { DEV = false; }

    /* ----- the level gate ----- */
    if (B.level < M.MIN_LEVEL) {
      root.append(h('div', { class: 'vt-bg', 'aria-hidden': 'true', html: world() + '<div class="vt-lasers"><i></i><i></i><i></i></div>' }),
        h('div', { class: 'vt-gate', role: 'dialog', 'aria-label': 'High Roller Lounge locked' },
          h('div', { class: 'box' }, h('span', { class: 'art', html: '<svg viewBox="0 0 400 400" aria-hidden="true">' + DOOR.replace('<svg class="vt-doorsvg" viewBox="0 0 400 400" aria-hidden="true">', '').replace('</svg>', '') + '</svg>' }),
            h('h2', null, 'High Roller Lounge'), h('p', null, 'Crimson Vault opens at level ' + M.MIN_LEVEL + '. You are level ' + B.level + '. Keep playing anywhere on the floor to climb.'),
            h('button', { type: 'button', class: 'vt-btn gold', onclick: () => B.go('') }, 'Back to the lobby'))));
      G.unmount = () => {};
      return;
    }

    let stakeCtl, busy = false, spinning = false, auto = 0, turbo = false, skip = false;
    let primary = null, curStake = M.STAKES[0], roundCost = 0, winUnits = 0, inFs = false, devNext = null, devBonus = null;
    const T = (ms) => ms * (skip ? 0.25 : turbo ? 0.55 : 1) * (RM ? 0.6 : 1);
    const nap = (ms) => S.sleep(Math.max(16, T(ms)));
    const setMsg = (t, cls) => { el.msg.textContent = t; el.msg.className = 'vt-msg' + (cls ? ' ' + cls : ''); };
    const money = (u) => Math.floor(u * curStake / M.UNITS);

    /* ----- build the world ----- */
    el.bg = h('div', { class: 'vt-bg', 'aria-hidden': 'true', html:
      world() +
      '<div class="vt-glare"></div>' +
      '<div class="vt-lasers"><i></i><i></i><i></i><i></i></div>' +
      '<div class="vt-beacon"><i></i></div>' +
      '<div class="vt-ropes"><span class="l">' + ROPE_BAT + '</span><span class="r">' + ROPE_BAT + '</span></div>' +
      '<div class="vt-dust"></div><div class="vt-flash"></div>' });
    el.flash = el.bg.querySelector('.vt-flash');
    el.title = h('div', { class: 'vt-title' }, h('small', null, 'HIGH ROLLER LOUNGE'), h('b', null, 'CRIMSON VAULT'), h('span', null, '20 lines · pick your vault · up to ' + fmt(M.MAX_WIN_X) + '×'));
    el.hudLeft = h('output', null, '0'); el.hudMode = h('output', null, ''); el.hudTotal = h('output', null, '0');
    el.hud = h('div', { class: 'vt-hud', hidden: true },
      h('div', { class: 'vt-hud-c' }, h('small', null, 'FREE SPINS'), el.hudLeft),
      h('div', { class: 'vt-hud-c m' }, h('small', null, 'VAULT'), el.hudMode),
      h('div', { class: 'vt-hud-c' }, h('small', null, 'TOTAL WIN · BB'), el.hudTotal));
    el.reels = h('div', { class: 'vt-reels' });
    el.cols = [];
    for (let r = 0; r < REELS; r++) { const c = h('div', { class: 'vt-col', 'data-r': r }); el.cols.push(c); el.reels.append(c); }
    el.stk = h('div', { class: 'vt-stk', 'aria-hidden': 'true' });
    el.lines = h('div', { class: 'vt-lines', 'aria-hidden': 'true' });
    el.chips = h('div', { class: 'vt-chips', 'aria-hidden': 'true' });
    el.pops = h('div', { class: 'vt-pops', 'aria-hidden': 'true' });
    el.banner = h('div', { class: 'vt-banner', hidden: true, 'aria-hidden': 'true' });
    el.frame = h('div', { class: 'vt-frame' }, el.reels, el.stk, el.lines, el.chips, el.pops, el.banner,
      h('i', { class: 'vt-rivet tl' }), h('i', { class: 'vt-rivet tr' }), h('i', { class: 'vt-rivet bl' }), h('i', { class: 'vt-rivet br' }));
    el.box = h('div', { class: 'vt-box' }, el.frame);
    el.msg = h('div', { class: 'vt-msg', role: 'status', 'aria-live': 'polite' }, 'Land 3 Crimson Keys to open the vault.');
    el.win = h('output', null, '0');
    el.winbox = h('div', { class: 'vt-winbox' }, h('small', null, 'WIN'), el.win);
    el.stakeBox = h('div', { class: 'vt-stakebox' });
    el.spin = h('button', { class: 'vt-spin', type: 'button', 'aria-label': 'Spin', id: 'vt-spin', onclick: () => onSpin(), html: '<svg viewBox="0 0 48 48" aria-hidden="true"><g class="go"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="4"/>' + [0, 120, 240].map((d) => { const a = (d - 90) * Math.PI / 180; return '<path d="M24 24 L' + (24 + Math.cos(a) * 15).toFixed(1) + ' ' + (24 + Math.sin(a) * 15).toFixed(1) + '" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'; }).join('') + '<circle cx="24" cy="24" r="4.5" fill="currentColor"/></g><rect class="st" x="15" y="15" width="18" height="18" rx="3" fill="currentColor"/></svg>' });
    el.buy = h('button', { class: 'vt-btn gold', type: 'button', id: 'vt-buy', onclick: () => openBuy() }, h('small', null, 'BUY'), 'HEIST');
    el.turbo = h('button', { class: 'vt-btn', type: 'button', id: 'vt-turbo', 'aria-pressed': 'false', onclick: () => { turbo = !turbo; el.turbo.setAttribute('aria-pressed', turbo); el.turbo.classList.toggle('on', turbo); el.turbo.lastChild.textContent = turbo ? 'ON' : 'OFF'; snd('click'); } }, h('small', null, 'TURBO'), 'OFF');
    el.auto = h('button', { class: 'vt-btn', type: 'button', id: 'vt-auto', onclick: () => onAuto() }, h('small', null, 'AUTO'), 'OFF');
    el.autoMenu = h('div', { class: 'vt-automenu', hidden: true }, ...[10, 25, 50, 100].map((n) => h('button', { type: 'button', onclick: () => { el.autoMenu.hidden = true; startAuto(n); } }, String(n))));
    el.ctl = h('div', { class: 'vt-ctl' }, el.stakeBox, el.buy, el.winbox, el.spin, el.turbo, h('div', { class: 'vt-autowrap' }, el.auto, el.autoMenu));
    el.ov = h('div', { class: 'vt-ov', hidden: true });
    el.main = h('div', { class: 'vt-main' }, h('div', { class: 'vt-head' }, el.title, el.hud), el.box, el.msg, el.ctl);
    root.append(el.bg, el.main, el.ov);
    stakeCtl = B.ui.stake(el.stakeBox, { id: ID, stakes: M.STAKES, label: 'Stake · BB' });
    curStake = stakeCtl.value;
    const paintAuto = () => { el.auto.lastChild.textContent = auto > 0 ? String(auto) : 'OFF'; el.auto.classList.toggle('on', auto !== 0); };
    requestAnimationFrame(() => root.classList.add('open'));

    /* ----- the grid ----- */
    let grid = null, colCells = [];
    function cellEl(s, k) {
      const c = h('div', { class: 'vt-cell s-' + KEY[s] + (s === SY.KEY ? ' key' : s === SY.WILD ? ' wild' : '') });
      c.style.top = (k * 100 / ROWS) + '%'; c.style.height = (100 / ROWS) + '%';
      c.innerHTML = REST[s];
      return c;
    }
    function paintCol(r, col) {
      const box = el.cols[r]; box.textContent = '';
      colCells[r] = col.map((s, k) => { const c = cellEl(s, k); box.append(c); return c; });
      return colCells[r];
    }
    (function idleGrid() { const o = M.spin(Math.random); grid = o.grid; grid.forEach((c, r) => paintCol(r, c)); })();

    /* ===================== reels ===================== */
    const reelSt = [];
    for (let r = 0; r < REELS; r++) reelSt.push({ mode: 'idle', stopAt: 0, col: null, antic: false, done: null, fin: null, tok: 0 });
    function rollEl(free) {
      const n = 8, syms = [];
      for (let i = 0; i < n; i++) syms.push(rndSym(free));
      const strip = syms.concat(syms).map((s) => RM ? REST[s] : '<img alt="" draggable="false" src="' + BLUR[s] + '">').join('');
      return h('div', { class: 'vt-roll' + (RM ? ' rm' : ''), html: strip });
    }
    function startRoll(free) {
      spinning = true; snd('spin'); lockUi(true);
      clearWins();
      for (let r = 0; r < REELS; r++) {
        const box = el.cols[r], st = reelSt[r];
        if (st.mode === 'spin') continue;
        st.mode = 'spin'; st.stopAt = 0; st.fin = null;
        const old = Array.from(box.children);
        if (!RM) old.forEach((c) => c.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-9%)', offset: 0.3 }, { transform: 'translateY(' + (ROWS * 100 + 60) + '%)', opacity: 0.4 }], { duration: 240 + r * 30, easing: 'ease-in', fill: 'forwards' }));
        st.tok++; const tok = st.tok;
        S.timeout(() => { if (st.mode !== 'spin' || st.tok !== tok) return; box.textContent = ''; box.append(rollEl(free)); }, RM ? 0 : 150 + r * 25);
        box.classList.add('spinning');
      }
    }
    function land(r) {
      const st = reelSt[r], box = el.cols[r];
      st.mode = 'idle'; box.classList.remove('spinning', 'antic'); st.tok++;
      const cells = paintCol(r, st.col);
      st.fin = st.col; st.col = null;
      if (!RM) cells.forEach((c, k) => c.animate([{ transform: 'translateY(' + (-(ROWS + 1) * 100) + '%)' }, { transform: 'translateY(6%)', offset: 0.78 }, { transform: 'translateY(-2%)', offset: 0.9 }, { transform: 'translateY(0)' }], { duration: T(300), delay: (ROWS - 1 - k) * T(20), easing: 'cubic-bezier(.45,.05,.55,1)', fill: 'backwards' }));
      S.timeout(() => {
        box.classList.add('thud'); S.timeout(() => box.classList.remove('thud'), 260);
        snd('stop', r);
        if (!RM) { const p = h('i', { class: 'vt-puff' }); box.append(p); S.timeout(() => p.remove(), 600); }
        const ks = cells.filter((c) => c.classList.contains('key'));
        if (ks.length) { ks.forEach((c) => c.classList.add('landed')); snd('key', keysUpTo(r)); }
      }, RM ? 10 : T(280) + (ROWS - 1) * T(20));
      S.timeout(() => { const d = st.done; st.done = null; if (d) d(); }, RM ? 60 : T(330) + (ROWS - 1) * T(20));
    }
    function keysUpTo(upTo) { let n = 0; for (let r = 0; r <= upTo; r++) n += (reelSt[r].fin || []).filter((s) => s === SY.KEY).length; return n; }
    S.loop(() => {
      if (!spinning) return;
      const now = performance.now();
      for (let r = 0; r < REELS; r++) {
        const st = reelSt[r];
        if (st.mode === 'spin' && st.col && st.stopAt && now >= st.stopAt) {
          land(r);
          if (r + 1 < REELS && reelSt[r + 1].antic && reelSt[r + 1].mode === 'spin') {
            for (let k = r + 1; k < REELS; k++) if (reelSt[k].antic && reelSt[k].mode === 'spin') el.cols[k].classList.add('antic');
            el.frame.classList.add('antic'); el.bg.classList.add('antic');
            snd('antic', keysUpTo(r)); setMsg(keysUpTo(r) >= M.TRIGGER ? 'The vault is open… one more key?' : 'One more Crimson Key…', 'red');
          } else if (r === REELS - 1) { el.frame.classList.remove('antic'); el.bg.classList.remove('antic'); }
        }
      }
    });
    function spinTo(g, opts) {
      opts = opts || {};
      return new Promise((res) => {
        const base = performance.now(), gap = T(150), first = T(opts.first || 520);
        let before = 0, extra = 0, left = REELS;
        const done = () => { if (--left === 0) { spinning = false; el.frame.classList.remove('antic'); el.bg.classList.remove('antic'); lockUi(true); res(); } };
        for (let r = 0; r < REELS; r++) {
          const st = reelSt[r];
          st.antic = !opts.noAntic && before >= M.TRIGGER - 1 && !skip;
          if (st.antic) extra += T(850);
          before += g[r].filter((s) => s === SY.KEY).length;
          st.col = g[r].slice(); st.done = done;
          if (st.mode !== 'spin') st.mode = 'spin';
          st.stopAt = base + first + r * gap + extra;
        }
        spinning = true; lockUi(true);
      });
    }
    function slam() {
      if (!spinning) return;
      const now = performance.now();
      for (let r = 0; r < REELS; r++) { const st = reelSt[r]; if (st.mode === 'spin' && st.stopAt) { st.stopAt = Math.min(st.stopAt, now + r * 35); st.antic = false; } }
      el.cols.forEach((c) => c.classList.remove('antic'));
      snd('slam');
    }
    function restAll() {
      for (let r = 0; r < REELS; r++) { const st = reelSt[r]; st.mode = 'idle'; st.col = null; st.done = null; st.antic = false; st.tok++; el.cols[r].classList.remove('spinning', 'antic'); paintCol(r, grid[r]); }
      spinning = false;
    }

    /* ===================== wins ===================== */
    const winNow = () => parseInt(el.win.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    function countWin(to, ms) { return B.ui.countUp(el.win, winNow(), to, Math.max(60, T(ms || 600))); }
    function pop(txt, cls, x, y) {
      const p = h('div', { class: 'vt-pop ' + (cls || ''), style: { left: (x == null ? 50 : x) + '%', top: (y == null ? 50 : y) + '%' } }, txt);
      el.pops.append(p); S.timeout(() => p.remove(), 1500);
    }
    function clearWins() {
      el.lines.textContent = ''; el.chips.classList.remove('in'); el.reels.classList.remove('dim'); el.frame.classList.remove('won');
      el.stk.querySelectorAll('.win').forEach((c) => c.classList.remove('win'));
      colCells.forEach((col) => col && col.forEach((c) => c.classList.remove('win')));
    }
    const LINE_COL = ['#ffd54a', '#ff4a5e', '#5ad1ff', '#7dff8a', '#ff9a3a', '#c98aff', '#ff6ad5', '#fff2a8', '#4affd0', '#ff7a7a', '#9ab8ff', '#e8ff5a', '#ffb3c6', '#a0ffe0', '#ffd0a0', '#c0ff90', '#ffa0ff', '#90d0ff', '#ffe060', '#ff8060'];
    function drawLines(wins) {
      const paths = wins.map((w) => {
        const ln = M.LINES[w.l], pts = ln.map((row, r) => (r * 100 + 50) + ',' + (row * 100 + 50)).join(' ');
        return '<polyline points="' + pts + '" stroke="' + LINE_COL[w.l] + '" class="ln"/>';
      }).join('');
      el.lines.innerHTML = '<svg viewBox="0 0 500 400" preserveAspectRatio="none">' + wins.map((w) => '<polyline points="' + M.LINES[w.l].map((row, r) => (r * 100 + 50) + ',' + (row * 100 + 50)).join(' ') + '" class="sh"/>').join('') + paths + '</svg>';
    }
    function markWin(w) {
      const ln = M.LINES[w.l];
      for (let r = 0; r < w.n; r++) {
        const cell = colCells[r] && colCells[r][ln[r]]; if (cell) cell.classList.add('win');
        const sc = el.stk.querySelector('[data-c="' + (r * ROWS + ln[r]) + '"]'); if (sc) sc.classList.add('win');
      }
    }
    function chips(wins, keyPay, keys) {
      el.chips.textContent = '';
      const ws = wins.slice().sort((a, b) => b.pay - a.pay).slice(0, keyPay ? 3 : 4);
      if (keyPay) el.chips.append(h('div', { class: 'vt-chip key', html: '<span class="vt-ci">' + REST[SY.KEY] + '</span><b>' + keys + '</b><small>keys</small><em>' + fmt(money(keyPay)) + '</em>' }));
      for (const w of ws) el.chips.append(h('div', { class: 'vt-chip', html: '<span class="vt-ci">' + REST[w.s] + '</span><b>' + w.n + '</b><small>line ' + (w.l + 1) + (w.m > 1 ? ' · ×' + w.m : '') + '</small><em>' + fmt(money(w.pay)) + '</em>' }));
      if (wins.length > ws.length) el.chips.append(h('div', { class: 'vt-chip more' }, '+' + (wins.length - ws.length)));
      el.chips.classList.add('in');
    }
    /* show a grid's wins: every line at once, then a quick tour of the biggest ones */
    async function showWins(wins, keyPay, keys, pay) {
      if (!wins.length && !keyPay) return;
      el.reels.classList.add('dim'); el.frame.classList.add('won');
      wins.forEach(markWin);
      if (keyPay) colCells.flat().forEach((c) => { if (c.classList.contains('key')) c.classList.add('win'); });
      drawLines(wins);
      chips(wins, keyPay, keys);
      const bb = money(pay);
      const top = wins.reduce((a, w) => Math.max(a, w.m), 1);
      snd('win', wins.length + (keyPay ? 1 : 0));
      setMsg((wins.length ? wins.length + (wins.length > 1 ? ' lines' : ' line') : '') + (wins.length && keyPay ? ' + ' : '') + (keyPay ? keys + ' Crimson Keys' : '') + (top > 1 ? ' · up to ×' + top : '') + ' · ' + fmt(bb) + ' BB', 'gold');
      pop('+' + fmt(bb), bb >= roundCost * 5 ? 'big' : '', 50, 46);
      if (top > 1) { snd('mult', Math.min(8, top)); pop('×' + top, 'mult', 50, 24); }
      if (bb >= roundCost * 3) bigFlash(false);
      if (bb >= roundCost * 2) snd('clink');
      winUnits += pay;
      countWin(money(winUnits), 500);
      await nap(wins.length > 1 ? 1100 : 900); if (!G) return;
      /* the tour: each of the top lines on its own (not in turbo, auto or skip) */
      if (wins.length > 1 && !turbo && !auto && !skip && !RM) {
        const tour = wins.slice().sort((a, b) => b.pay - a.pay).slice(0, 3);
        for (const w of tour) {
          if (skip || !G) break;
          clearMarks(); markWin(w); drawLines([w]);
          setMsg(NAME[w.s] + ' × ' + w.n + ' on line ' + (w.l + 1) + (w.m > 1 ? ' · ×' + w.m : '') + ' · ' + fmt(money(w.pay)) + ' BB', 'gold');
          await nap(560);
        }
      }
    }
    function clearMarks() { el.stk.querySelectorAll('.win').forEach((c) => c.classList.remove('win')); colCells.forEach((col) => col && col.forEach((c) => c.classList.remove('win'))); }
    function bigFlash(strong) {
      el.bg.classList.remove('flare'); void el.bg.offsetWidth; el.bg.classList.add('flare');
      if (RM) return;
      el.flash.animate([{ opacity: 0 }, { opacity: strong ? 0.8 : 0.45, offset: 0.1 }, { opacity: 0.1, offset: 0.25 }, { opacity: strong ? 0.6 : 0.3, offset: 0.35 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      if (strong) snd('alarm');
    }
    function banner(html, cls, ms) {
      el.banner.hidden = false; el.banner.className = 'vt-banner ' + (cls || ''); el.banner.innerHTML = html;
      requestAnimationFrame(() => el.banner.classList.add('in'));
      return nap(ms || 1200).then(() => { el.banner.classList.remove('in'); el.banner.classList.add('out'); return nap(260); }).then(() => { el.banner.hidden = true; });
    }

    /* ===================== the server / the maths ===================== */
    async function fetchSpin(stake, buy, c) {
      if (B.online) {
        const r = await B.play(ID, 'spin', { stake, buy: buy == null ? undefined : buy }, c);
        if (!r) return null;
        return r;
      }
      if (buy != null) return { pending: true, round: 0, buy, cost: c, stake, carried: 0 };
      let o;
      if (DEV && devNext) { o = M.spinUntil(B.rng, devNext); devNext = null; } else o = M.spin(B.rng);
      return o.trigger ? { o, pending: true, round: 0, cost: c, stake, buy: -1, carried: o.pay } : { o, pending: false, win: money(o.pay), cost: c };
    }
    async function fetchPick(open, mode) {
      if (B.online) {
        const r = await B.play(ID, 'pick', { round: open.round, mode }, 0);
        return r || null;
      }
      const inside = open.buy === 1;
      let b = null;
      if (DEV && devBonus) { const pred = devBonus; devBonus = null; for (let i = 0; i < 400000; i++) { const t = M.bonus(B.rng, mode, { inside, carried: open.carried }); if (pred(t)) { b = t; break; } } }
      if (!b) b = M.bonus(B.rng, mode, { inside, carried: open.carried });
      return { bonus: b, mode, units: open.carried + b.total, carried: open.carried, buy: open.buy };
    }

    /* ===================== spin button, auto, buy ===================== */
    function lockUi(on) {
      stakeCtl.disabled = on; el.buy.disabled = on; el.main.classList.toggle('busy', on);
      el.spin.classList.toggle('stop', on && spinning);
      el.spin.setAttribute('aria-label', on && spinning ? 'Stop the reels' : 'Spin');
    }
    function onSpin() {
      if (!el.ov.hidden) { if (G.ovPrimary) G.ovPrimary(); return; }
      if (!el.autoMenu.hidden) { el.autoMenu.hidden = true; return; }
      if (busy) { if (spinning) slam(); else if (primary) primary(); else skip = true; return; }
      round(null);
    }
    function onAuto() { if (auto !== 0) { stopAuto(); snd('click'); } else if (!busy) el.autoMenu.hidden = !el.autoMenu.hidden; }
    function startAuto(n) { auto = n; paintAuto(); round(null); }
    function stopAuto() { auto = 0; paintAuto(); }
    function openBuy() {
      if (busy) return;
      const stake = stakeCtl.value;
      el.ov.hidden = false; el.ov.textContent = ''; G.ovPrimary = closeOv;
      const opt = (i, title, sub, art) => {
        const c = stake * M.BUY_PRICE[i];
        return h('button', { class: 'vt-buyopt' + (i ? ' inside' : ''), type: 'button', id: 'vt-buy-' + i, disabled: B.wallet.balance < c, onclick: () => { closeOv(); round(i); } },
          h('span', { class: 'art', html: art }), h('b', null, title), h('small', null, sub), h('em', null, M.BUY_PRICE[i] + '× · ' + fmt(c) + ' BB'));
      };
      el.ov.append(h('div', { class: 'vt-buybox', role: 'dialog', 'aria-label': 'Buy the heist' },
        h('h3', null, 'Plan the heist'),
        h('div', { class: 'vt-buyrow2' },
          opt(0, 'Crack the vault', 'Straight to the vault pick.', '<svg viewBox="0 0 100 100">' + SYM_IN[1] + '</svg>'),
          opt(1, 'The Inside Job', 'Wilds already in place, and more of them.', '<svg viewBox="0 0 100 100">' + SYM_IN[2] + '</svg>')),
        h('p', null, 'Batty Bucks only: the result is random and can be less than the price. Stake ' + fmt(stake) + ' BB.'),
        h('button', { class: 'vt-btn', type: 'button', onclick: closeOv }, 'Not now')));
      snd('pop');
    }
    function closeOv() { el.ov.hidden = true; el.ov.textContent = ''; el.ov.className = 'vt-ov'; G.ovPrimary = null; }

    /* ===================== a round ===================== */
    async function round(buy) {
      if (busy || !G) return;
      const stake = stakeCtl.value, c = buy == null ? stake : stake * M.BUY_PRICE[buy];
      if (!B.wallet.bet(ID, c)) { stopAuto(); return B.ui.broke(); }
      busy = true; skip = false; el.autoMenu.hidden = true; roundCost = c; curStake = stake; winUnits = 0;
      el.win.textContent = '0'; el.winbox.classList.remove('hot');
      if (auto > 0 && buy == null) { auto--; paintAuto(); }
      if (buy != null) {
        lockUi(true); clearWins();
        setMsg(buy ? 'The inside man gives the nod…' : 'Bats on the ropes. Lasers off…', 'red');
        const res = await fetchSpin(stake, buy, c); if (!G) return;
        if (!res) { busy = false; lockUi(false); setMsg('The heist was called off. Try again.', ''); return; }
        if (res.resume) { B.wallet.sync(); await resume(res.resume); return; }
        B.wallet.sync();
        snd('alarm'); bigFlash(true);
        await banner('<small>' + (buy ? 'The Inside Job' : 'Crack the vault') + '</small><b>HEIST ON</b>', 'big', 1300); if (!G) return;
        await pickVault({ round: res.round, stake, buy, o: null, carried: 0, cost: c });
        return;
      }
      setMsg('Lasers sweeping…', '');
      startRoll(false);
      const res = await fetchSpin(stake, null, c); if (!G) return;
      if (!res || (!res.o && !res.resume)) { restAll(); busy = false; stopAuto(); lockUi(false); setMsg('The alarm tripped. Try again.', ''); return; }
      if (res.resume) { restAll(); B.wallet.sync(); await resume(res.resume); return; }
      const o = res.o;
      await spinTo(o.grid, {}); if (!G) return;
      grid = o.grid;
      await showWins(o.wins, o.keyPay, o.keys, o.pay); if (!G) return;
      if (res.pending) { await trigger({ round: res.round, stake, buy: -1, o, carried: o.pay, cost: c }); return; }
      await finishRound(o.pay, false);
    }
    async function finishRound(units, feature) {
      const win = money(units);
      if (win > winNow()) await countWin(win, 900);
      if (!G) return;
      if (win > 0) B.wallet.win(ID, win, { silent: true });
      B.wallet.sync();
      if (win > 0) {
        setMsg((units >= M.CAP ? 'MAXIMUM WIN! ' : '') + 'Paid ' + fmt(win) + ' BB', 'gold');
        el.winbox.classList.add('hot'); S.timeout(() => el.winbox.classList.remove('hot'), 1600);
      } else setMsg(keysUpTo(REELS - 1) === M.TRIGGER - 1 ? 'Two keys… the vault stays shut. Spin again.' : 'The vault holds. Spin again.', '');
      if (win >= roundCost * 10) { bigFlash(true); await B.ui.celebrate({ amount: win, bet: roundCost }); if (!G) return; }
      busy = false; spinning = false; skip = false; primary = null; lockUi(false);
      if (auto > 0 && B.wallet.balance >= stakeCtl.value) S.timeout(() => { if (auto > 0 && !busy) round(null); }, T(feature ? 900 : 420));
      else if (auto !== 0) stopAuto();
    }

    /* ===================== the trigger and the vault door ===================== */
    async function trigger(open) {
      const ks = colCells.flat().filter((c) => c.classList.contains('key'));
      ks.forEach((c) => c.classList.add('trig'));
      snd('alarm'); bigFlash(true); el.bg.classList.add('alert');
      setMsg(open.o.keys + ' Crimson Keys! The vault is yours to crack.', 'red');
      await nap(1500); if (!G) return;
      ks.forEach((c) => c.classList.remove('trig'));
      await pickVault(open);
    }
    /* the heavy door: the dial spins, the handle turns, the bolts draw back and the door swings open on the three vaults */
    async function pickVault(open) {
      roundCost = open.cost; curStake = open.stake; winUnits = open.carried;
      el.win.textContent = fmt(money(open.carried));
      el.ov.hidden = false; el.ov.textContent = ''; el.ov.className = 'vt-ov door'; G.ovPrimary = null;
      const door = h('div', { class: 'vt-door', html: DOOR });
      const light = h('div', { class: 'vt-doorlight' });
      const picks = h('div', { class: 'vt-picks', role: 'group', 'aria-label': 'Pick your vault' });
      const head = h('div', { class: 'vt-pickhead' }, h('small', null, open.buy === 1 ? 'THE INSIDE JOB' : open.buy === 0 ? 'CRACK THE VAULT' : open.o ? open.o.keys + ' CRIMSON KEYS' : 'THE VAULT'), h('b', null, 'Pick your vault'),
        h('span', null, open.carried > 0 ? 'Already won: ' + fmt(money(open.carried)) + ' BB' : 'Every vault returns the same on average. Choose your swing.'));
      const scene = h('div', { class: 'vt-scene' }, light, picks, door);
      el.ov.append(h('div', { class: 'vt-pickwrap', role: 'dialog', 'aria-label': 'The vault' }, head, scene));
      el.bg.classList.add('alert');
      setMsg('Cracking the combination…', 'red');
      /* the opening */
      const dial = door.querySelector('.vt-ddial'), spk = door.querySelector('.vt-dspoke');
      if (!RM) {
        let n = 0; const tk = S.interval(() => { if (n++ < 26) snd('dial'); }, 55);
        await dial.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-400deg)', offset: 0.45 }, { transform: 'rotate(260deg)' }], { duration: T(1500), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
        S.clear(tk); if (!G) return;
        snd('clunk');
        await spk.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(130deg)', offset: 0.8 }, { transform: 'rotate(120deg)' }], { duration: T(700), easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).finished.catch(() => {});
        if (!G) return;
      }
      snd('bolts'); door.classList.add('unbolt');
      await nap(560); if (!G) return;
      snd('door'); door.classList.add('swing'); light.classList.add('on'); scene.classList.add('open');
      await nap(900); if (!G) return;
      snd('choir');
      MODES.forEach((m, i) => {
        const b = h('button', { class: 'vt-pick m-' + m.key, type: 'button', id: 'vt-pick-' + i, style: { '--i': i } },
          h('span', { class: 'art', html: VAULT_ART[i] }), h('i', null, MODE_TXT[i].tag), h('b', null, m.name), h('em', null, MODE_TXT[i].line), h('small', null, MODE_TXT[i].how), h('span', { class: 'stat' }, MODE_TXT[i].stat));
        picks.append(b);
      });
      picks.classList.add('in');
      setMsg('Pick your vault: The Safe, the Deposit Box or the Grand Vault.', 'red');
      const mode = await new Promise((res) => {
        const btns = picks.querySelectorAll('button');
        btns.forEach((b, i) => b.addEventListener('click', () => { if (picks.classList.contains('chosen')) return; picks.classList.add('chosen'); b.classList.add('chosen'); snd('clunk'); res(i); }));
      });
      if (!G) return;
      setMsg(MODES[mode].name + ': opening…', 'red');
      const r = await fetchPick(open, mode); if (!G) return;
      if (!r) { closeOv(); busy = false; lockUi(false); el.bg.classList.remove('alert'); setMsg('The connection dropped. Your vault is safe: spin again to pick it.', ''); return; }
      await nap(700); if (!G) return;
      closeOv();
      await playBonus(open, r);
    }

    /* ===================== the free spins ===================== */
    const stkCells = {};
    function stkCell(c, v, mode, cls) {
      let e = stkCells[c];
      const r = Math.floor(c / ROWS), k = c % ROWS;
      if (!e) {
        e = h('div', { class: 'vt-sc ' + (cls || ''), 'data-c': c, style: { left: (r * 100 / REELS) + '%', top: (k * 100 / ROWS) + '%' }, html: REST[SY.WILD] + '<b class="vt-badge"></b>' });
        el.stk.append(e); stkCells[c] = e;
      }
      const badge = e.querySelector('.vt-badge');
      badge.textContent = v > 1 ? '×' + v : 'STICKY';
      e.dataset.v = v; e.classList.toggle('x5', v >= 5); e.classList.toggle('x3', v === 3); e.classList.toggle('plain', v <= 1);
      return e;
    }
    function clearStk() { el.stk.textContent = ''; for (const k in stkCells) delete stkCells[k]; }
    async function playBonus(open, r) {
      const b = r.bonus, md = MODES[b.mode];
      inFs = true; winUnits = open.carried;
      root.classList.add('fs', 'm-' + md.key); el.bg.classList.remove('alert');
      el.hud.hidden = false; el.title.hidden = true;
      el.hudMode.textContent = md.name.replace('The ', ''); el.hudLeft.textContent = String(md.spins); el.hudTotal.textContent = fmt(money(open.carried));
      clearStk(); clearWins();
      /* the free-spin reels: blank out the base grid with the vault's own strip */
      grid = M.windowOf(M.FREE_STRIPS[b.mode], [0, 7, 14, 21, 28]); grid.forEach((c, k) => paintCol(k, c));
      snd('choir');
      await banner('<small>' + md.name + '</small><b>' + md.spins + ' FREE SPINS</b><span>' + MODE_TXT[b.mode].how + '</span>', 'big m-' + md.key, 2000); if (!G) return;
      primary = () => { skip = true; };
      if (b.preset.length) {
        setMsg('The inside man left ' + b.preset.length + (b.preset.length > 1 ? ' wilds' : ' wild') + ' in place.', 'gold');
        for (const c of b.preset) { const e = stkCell(c, M.ladderAt(md, 0), md.key, 'drop'); snd('slam'); if (!RM) e.animate([{ transform: 'translateY(-160%) scale(1.3)', opacity: 0 }, { transform: 'translateY(6%) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translateY(0)' }], { duration: T(460), easing: 'cubic-bezier(.5,0,.6,1.4)' }); await nap(420); if (!G) return; }
      }
      let left = md.spins, prevSticky = null;
      for (let i = 0; i < b.spins.length; i++) {
        const sp = b.spins[i];
        if (!G) return;
        left--; el.hudLeft.textContent = String(left);
        /* the wilds already stuck age first (the Grand Vault's grow) */
        if (i > 0 && prevSticky) {
          let grew = false;
          for (const c in stkCells) { const v = sp.sticky[c]; if (v && +stkCells[c].dataset.v !== v) { stkCell(+c, v, md.key); grew = true; if (!RM) stkCells[c].animate([{ transform: 'scale(1.35)', filter: 'brightness(2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: T(420), easing: 'cubic-bezier(.2,1.6,.4,1)' }); } }
          if (grew) { snd('mult', 3); await nap(380); if (!G) return; }
        }
        startRoll(true);
        await nap(200); if (!G) return;
        /* under a new wild the reel shows a plain symbol; the wild then drops onto it */
        const g = sp.grid.map((col, r) => col.map((s, k) => (sp.land.indexOf(r * ROWS + k) >= 0 ? rndPlain() : s)));
        await spinTo(g, { first: 380, noAntic: false }); if (!G) return;
        grid = sp.grid;
        for (const c of sp.land) {
          const e = stkCell(c, sp.sticky[c], md.key, 'drop');
          snd('slam'); el.frame.classList.remove('jolt'); void el.frame.offsetWidth; el.frame.classList.add('jolt');
          if (!RM) e.animate([{ transform: 'translateY(-170%) scale(1.25)', opacity: 0 }, { transform: 'translateY(6%) scale(1)', opacity: 1, offset: 0.72 }, { transform: 'translateY(0)' }], { duration: T(420), easing: 'cubic-bezier(.5,0,.6,1.4)' });
          const rr = Math.floor(c / ROWS), kk = c % ROWS; if (colCells[rr] && colCells[rr][kk]) colCells[rr][kk].classList.add('under');
          if (sp.forced) setMsg('The Grand Vault drops a wild!', 'gold');
          await nap(360); if (!G) return;
        }
        if (sp.pay > 0) await showWins(sp.wins, 0, 0, sp.pay); else winUnits = open.carried + sp.total - sp.pay;
        winUnits = open.carried + sp.total;
        el.hudTotal.textContent = fmt(money(winUnits));
        if (sp.add) {
          left += sp.add; el.hudLeft.textContent = String(left);
          colCells.flat().forEach((c) => { if (c.classList.contains('key')) c.classList.add('trig'); });
          snd('retrig'); bigFlash(false);
          await banner('<small>' + sp.keys + ' Crimson Keys</small><b>+' + sp.add + ' SPINS</b>', 'big', 1300); if (!G) return;
        }
        prevSticky = sp.sticky;
        await nap(sp.pay > 0 ? 360 : 260);
      }
      primary = null; skip = false;
      const units = open.carried + b.total;
      await countWin(money(units), 700); if (!G) return;
      snd('bonus'); B.fx.burst({ el: el.frame, kind: 'coin', count: Math.min(70, 20 + Math.floor(money(b.total) / Math.max(1, roundCost) * 4)), power: 1 });
      const card = h('div', { class: 'vt-outro m-' + md.key, role: 'dialog', 'aria-label': 'Free spins summary' },
        h('small', null, b.capped ? 'MAXIMUM WIN' : md.name.toUpperCase() + ' CRACKED'),
        h('span', null, 'You won'),
        h('b', null, fmt(money(b.total)) + ' BB'),
        h('span', null, 'in ' + b.spins.length + ' free spins' + (open.carried > 0 ? ' · plus ' + fmt(money(open.carried)) + ' BB from the keys' : '')),
        h('button', { class: 'vt-btn gold', type: 'button' }, 'CONTINUE'));
      el.box.append(card);
      requestAnimationFrame(() => card.classList.add('in'));
      await new Promise((res) => {
        let over = false;
        const done = () => { if (over) return; over = true; primary = null; card.removeEventListener('click', done); res(); };
        card.addEventListener('click', done); primary = done;
        S.timeout(done, auto ? 2600 : 8000);
      });
      if (!G) return;
      card.remove();
      inFs = false;
      root.classList.remove('fs', 'm-safe', 'm-box', 'm-grand'); el.hud.hidden = true; el.title.hidden = false;
      clearStk(); clearWins();
      await finishRound(units, true);
    }

    /* ----- a held round: after a reload, or a spin refused because a vault was waiting ----- */
    async function resume(off) {
      busy = true; lockUi(true);
      curStake = off.stake; roundCost = off.cost;
      if (off.o) { grid = off.o.grid; grid.forEach((c, r) => paintCol(r, c)); }
      setMsg('Your vault is waiting to be cracked!', 'red');
      await nap(700); if (!G) return;
      await pickVault(off);
    }

    /* ----- keyboard and taps ----- */
    S.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (document.querySelector('.bc-veil, .bc-win')) return;
      e.preventDefault(); if (e.repeat) return;
      onSpin();
    });
    S.on(el.frame, 'click', () => { if (spinning) slam(); else if (busy && el.ov.hidden) { if (primary) primary(); else skip = true; } });

    if (B.online) {
      (async () => {
        let r = null;
        try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { r = null; }
        if (!G || !r || !r.open || busy) return;
        await resume(r.open);
      })();
    }

    if (DEV) {
      const until = (pred) => { devNext = pred; B.ui.toast('Dev: next spin forced'); };
      window.vtDev = {
        trig: () => until((o) => o.trigger),
        keys4: () => until((o) => o.keys >= 4),
        antic: () => until((o) => !o.trigger && o.grid.slice(0, 3).reduce((a, c) => a + c.filter((s) => s === SY.KEY).length, 0) >= 2),
        big: () => until((o) => o.pay >= 1500),
        lines: () => until((o) => o.wins.length >= 4),
        retrig: () => { until((o) => o.trigger); devBonus = (b) => b.spins.some((s) => s.add); },
        huge: () => { until((o) => o.trigger); devBonus = (b) => b.total >= 50000; },
        dud: () => { until((o) => o.trigger); devBonus = (b) => b.total < 1500; },
      };
    }
    G.unmount = () => { try { delete window.vtDev; } catch (e) { /* fine */ } };
  }

  B.registerGame({
    id: ID, name: 'Crimson Vault', tagline: 'Three vaults. One heist. Up to 50,000× your stake.', tag: 'Heist slot', section: 'highroller', minLevel: M.MIN_LEVEL, isNew: true,
    poster: POSTER, rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S && G.S.dispose(); } G = null; },
  });
})();
