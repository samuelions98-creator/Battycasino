/* ===== starwing math ===== */
/* Starwing — pure maths. No DOM. Shared verbatim by the browser game and sim/starwing.sim.js, and ported line for line to
   server/lib/games/starwing.php (proved identical by tools/starwing-xcheck.js).

   THE REELS   5 reels x 3 rows, real reel strips (STRIPS, built once from CFG with a fixed shuffle). A spin stops each reel at a
               uniformly random strip position; the 3 visible symbols are that position and the next two.
   LINES       10 fixed lines that PAY BOTH WAYS: left to right from reel 1, and right to left from reel 5. A five-of-a-kind
               is paid once. Line bet = stake / 10.
   BAT STAR    The wild only lands on reels 2, 3 and 4. When one lands it EXPANDS to fill its reel, takes a multiplier
               (x1, x2, x3 or x5) and is HELD while the other reels re-spin. A new wild in a re-spin expands, is held and
               gives another re-spin: at most 3 re-spins. Every spin and re-spin pays.
   MULTIPLIER  A line win that runs through expanded wilds is multiplied by the PRODUCT of their multipliers.
   MAX WIN     5,000x the stake per round (spin + re-spins). The round ends the moment it is reached.
   AMOUNTS     In UNITS: 1 unit = stake / 20 (every stake on the ladder is a multiple of 20). Line bet = 2 units. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).starwing = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 3, UNITS_PER_STAKE = 20, LINE_UNITS = 2;
  const MAX_WIN_X = 5000, CAP = MAX_WIN_X * UNITS_PER_STAKE;

  /* symbols */
  const WILD = 0, BAR = 1, SEVEN = 2, VIOLET = 3, BLUE = 4, ORANGE = 5, GREEN = 6, YELLOW = 7, NSYM = 8;
  const SYMBOLS = ['wild', 'bar', 'seven', 'violet', 'blue', 'orange', 'green', 'yellow'];
  const SYMBOL_NAMES = ['Bat Star Wild', 'Gold Bar', 'Lucky Seven', 'Amethyst', 'Sapphire', 'Topaz', 'Emerald', 'Citrine'];
  /* PAY[symbol] = [3, 4, 5 of a kind] in UNITS (a line bet is 2 units, so 4 units = 2x the line bet) */
  const PAY = [
    [0, 0, 0],
    [32, 88, 328],   // Gold Bar
    [18, 44, 164],   // Lucky Seven
    [10, 32, 88],    // Amethyst
    [10, 26, 66],    // Sapphire
    [6, 18, 44],     // Topaz
    [6, 12, 32],     // Emerald
    [4, 10, 26],     // Citrine
  ];
  /* rows used by each line, reel by reel (0 = top) */
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 1, 1, 2],
  ];
  /* reel strips: how many of each symbol on each reel (index = symbol). Wild only on reels 2-4. */
  const CFG = {
    counts: [
      /* W  BAR 7  VIO BLU ORA GRN YEL */
      [0, 4, 6, 16, 4, 16, 4, 12],
      [1, 5, 7, 18, 5, 18, 5, 16],
      [1, 5, 7, 5, 19, 5, 19, 14],
      [1, 5, 7, 18, 5, 18, 5, 16],
      [0, 4, 6, 16, 4, 16, 4, 12],
    ],
    multValues: [1, 2, 3, 5],
    multWeights: [78, 14, 6, 2],
  };

  /* ---------- strips: built once from CFG with a fixed shuffle (exported to the server, so they are data) ---------- */
  function buildStrips() {
    let s = 20261009 | 0;
    const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = [];
    for (let r = 0; r < REELS; r++) {
      const a = [];
      CFG.counts[r].forEach((n, sym) => { for (let i = 0; i < n; i++) a.push(sym); });
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      /* no symbol twice in a row on a strip (keeps the reels looking like real reels) */
      for (let pass = 0; pass < 50; pass++) {
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
  /* visible grid: grid[reel][row] */
  function window_(stops) {
    const g = [];
    for (let r = 0; r < REELS; r++) { const st = STRIPS[r], L = st.length; g.push([st[stops[r] % L], st[(stops[r] + 1) % L], st[(stops[r] + 2) % L]]); }
    return g;
  }
  /* line wins on a grid where held reels are fully wild with multipliers mult[r] (1 for other reels) */
  function evaluate(g, mult) {
    const wins = []; let pay = 0;
    for (let l = 0; l < LINES.length; l++) {
      const s = []; for (let r = 0; r < REELS; r++) s.push(g[r][LINES[l][r]]);
      /* left to right: reel 1 is never wild, so it names the symbol */
      let sym = s[0], n = 1, m = 1;
      while (n < REELS && (s[n] === sym || s[n] === WILD)) { if (s[n] === WILD) m *= mult[n]; n++; }
      if (n >= 3) { const p = PAY[sym][n - 3] * m; wins.push({ l: l, dir: 1, s: sym, n: n, m: m, pay: p }); pay += p; }
      if (n === REELS) continue;
      /* right to left */
      sym = s[REELS - 1]; let k = 1; m = 1;
      while (k < REELS && (s[REELS - 1 - k] === sym || s[REELS - 1 - k] === WILD)) { if (s[REELS - 1 - k] === WILD) m *= mult[REELS - 1 - k]; k++; }
      if (k >= 3) { const p = PAY[sym][k - 3] * m; wins.push({ l: l, dir: -1, s: sym, n: k, m: m, pay: p }); pay += p; }
    }
    return { wins: wins, pay: pay };
  }

  /* ---------- a round ----------
     Returns {steps:[{stops, grid, newWild:[reels], mult:[5], wins, pay}], held, totalWin, capped}. */
  function spin(rng) {
    const stops = [], held = [false, false, false, false, false], mult = [1, 1, 1, 1, 1];
    for (let r = 0; r < REELS; r++) stops.push(Math.floor(rng() * STRIPS[r].length));
    const steps = []; let total = 0, capped = false;
    for (;;) {
      const g = window_(stops), newWild = [];
      for (let r = 1; r <= 3; r++) {
        if (held[r]) continue;
        if (g[r][0] === WILD || g[r][1] === WILD || g[r][2] === WILD) { held[r] = true; mult[r] = CFG.multValues[pickIndex(rng, CFG.multWeights)]; newWild.push(r); }
      }
      for (let r = 1; r <= 3; r++) if (held[r]) g[r] = [WILD, WILD, WILD];
      const ev = evaluate(g, mult);
      let pay = ev.pay;
      if (total + pay >= CAP) { pay = CAP - total; capped = true; }
      total += pay;
      steps.push({ stops: stops.slice(), grid: g, newWild: newWild, mult: mult.slice(), wins: ev.wins, pay: pay });
      if (capped || !newWild.length) break;
      for (let r = 0; r < REELS; r++) if (!held[r]) stops[r] = Math.floor(rng() * STRIPS[r].length);
    }
    return { steps: steps, held: held, totalWin: total, capped: capped };
  }

  return {
    REELS: REELS, ROWS: ROWS, UNITS_PER_STAKE: UNITS_PER_STAKE, LINE_UNITS: LINE_UNITS, MAX_WIN_X: MAX_WIN_X, CAP: CAP,
    SYM: { WILD: WILD, BAR: BAR, SEVEN: SEVEN, VIOLET: VIOLET, BLUE: BLUE, ORANGE: ORANGE, GREEN: GREEN, YELLOW: YELLOW }, NSYM: NSYM,
    SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, PAY: PAY, LINES: LINES, CFG: CFG, STRIPS: STRIPS,
    pickIndex: pickIndex, window: window_, evaluate: evaluate, spin: spin,
  };
});

/* ===== starwing ===== */
/* Starwing — a cosmic gem slot. 5x3, 10 lines that pay both ways, expanding Bat Star wilds with multipliers and re-spins.
   Maths: src/games/starwing.math.js (shared with the server). Online, every spin comes from the server via Batty.play. */
(function () {
  'use strict';
  const ID = 'starwing';
  const M = (typeof BattyMath !== 'undefined' && BattyMath.starwing) || (typeof globalThis !== 'undefined' && globalThis.BattyMath && globalThis.BattyMath.starwing);
  const DEV = /(^|[?&])dev\b/.test(location.search);
  const U = M.UNITS_PER_STAKE, R = M.REELS, SYM = M.SYM;
  const KEYS = ['wild', 'bar', 'seven', 'violet', 'blue', 'orange', 'green', 'yellow'];
  const LINE_COL = ['#3ef0ff', '#ff4fd8', '#ffd257', '#7dff8a', '#ff8a3c', '#a98bff', '#ff5d7a', '#5db8ff', '#f6ff6b', '#45ffcf'];
  /* figures from tools/starwing-exact.js and tools/starwing-sim-out.txt */
  const RTP = { exact: '98.00%', sim: '98.2%', hit: '1 in 2.5', wild: '1 in 8.7', sims: '150,000,000' };

  let B, h, S, root, E, reels, busy, skipping, turbo, auto, autoPick = { n: 25, loss: 50 }, autoLoss = 0, autoFloor = 0, stakeCtl, devNext = null, devLog = null, devSpeed = 1, lineIdx;
  const sess = { spins: 0, hits: 0, best: 0 };
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = (ms) => ms * (turbo ? 0.5 : 1) * (skipping ? 0.12 : 1) * devSpeed * (reduce() ? 0.6 : 1);
  const nap = (ms) => S.sleep(T(ms));

  /* ================= art ================= */
  const GEM = (id, c1, c2, c3, body) => '<defs><linearGradient id="starwing-g-' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset=".55" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c3 + '"/></linearGradient></defs>' + body;
  const ART = {
    violet: GEM('violet', '#f0c8ff', '#a24dff', '#3d0f8a',
      '<path d="M50 8 L86 29 L86 71 L50 92 L14 71 L14 29 Z" fill="url(#starwing-g-violet)" stroke="#2a0760" stroke-width="2.5"/>' +
      '<path d="M50 24 L72 37 L72 63 L50 76 L28 63 L28 37 Z" fill="#c27bff" opacity=".55"/>' +
      '<path d="M50 8 L50 24 M86 29 L72 37 M86 71 L72 63 M50 92 L50 76 M14 71 L28 63 M14 29 L28 37" stroke="#f3dcff" stroke-width="1.6" opacity=".7"/>' +
      '<path d="M28 37 L50 24 L60 30 L36 42 Z" fill="#fff" opacity=".55"/>'),
    blue: GEM('blue', '#c8f1ff', '#2f8bff', '#0a2a8a',
      '<circle cx="50" cy="50" r="40" fill="url(#starwing-g-blue)" stroke="#06205e" stroke-width="2.5"/>' +
      '<path d="M50 10 L60 40 L90 50 L60 60 L50 90 L40 60 L10 50 L40 40 Z" fill="#7cc4ff" opacity=".5"/>' +
      '<circle cx="50" cy="50" r="14" fill="#a9dcff" opacity=".7"/>' +
      '<path d="M50 10 L50 36 M90 50 L64 50 M50 90 L50 64 M10 50 L36 50 M22 22 L40 40 M78 22 L60 40 M78 78 L60 60 M22 78 L40 60" stroke="#e7f7ff" stroke-width="1.4" opacity=".6"/>' +
      '<ellipse cx="36" cy="30" rx="11" ry="6" fill="#fff" opacity=".7" transform="rotate(-30 36 30)"/>'),
    orange: GEM('orange', '#fff0b8', '#ff8a1e', '#8a2a00',
      '<rect x="14" y="14" width="72" height="72" rx="18" fill="url(#starwing-g-orange)" stroke="#5a1c00" stroke-width="2.5"/>' +
      '<rect x="30" y="30" width="40" height="40" rx="8" fill="#ffb24a" opacity=".65"/>' +
      '<path d="M14 32 L30 30 M32 14 L30 30 M86 32 L70 30 M68 14 L70 30 M14 68 L30 70 M32 86 L30 70 M86 68 L70 70 M68 86 L70 70" stroke="#fff3d6" stroke-width="1.5" opacity=".7"/>' +
      '<path d="M22 24 Q30 18 44 18 L36 30 Z" fill="#fff" opacity=".65"/>'),
    green: GEM('green', '#d6ffe0', '#20d07a', '#04542c',
      '<path d="M30 10 L70 10 L90 30 L90 70 L70 90 L30 90 L10 70 L10 30 Z" fill="url(#starwing-g-green)" stroke="#033d20" stroke-width="2.5"/>' +
      '<path d="M36 22 L64 22 L78 36 L78 64 L64 78 L36 78 L22 64 L22 36 Z" fill="#5ff0a4" opacity=".45"/>' +
      '<path d="M42 34 L58 34 L66 42 L66 58 L58 66 L42 66 L34 58 L34 42 Z" fill="#a6ffd0" opacity=".55"/>' +
      '<path d="M26 20 L46 16 L38 28 Z" fill="#fff" opacity=".6"/>'),
    yellow: GEM('yellow', '#fffbd0', '#ffd400', '#8a6200',
      '<path d="M50 10 L92 84 L8 84 Z" fill="url(#starwing-g-yellow)" stroke="#5e4300" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M50 34 L72 72 L28 72 Z" fill="#fff07a" opacity=".6"/>' +
      '<path d="M50 10 L50 34 M92 84 L72 72 M8 84 L28 72" stroke="#fffbe0" stroke-width="1.6" opacity=".75"/>' +
      '<path d="M44 26 L34 46 L40 46 L48 30 Z" fill="#fff" opacity=".7"/>'),
    bar: '<defs><linearGradient id="starwing-g-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c4"/><stop offset=".35" stop-color="#ffcf3a"/><stop offset="1" stop-color="#9a5b00"/></linearGradient>' +
      '<linearGradient id="starwing-g-bartop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe680"/><stop offset=".5" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffd24a"/></linearGradient></defs>' +
      '<path d="M8 72 L20 40 L80 40 L92 72 Z" fill="url(#starwing-g-bar)" stroke="#5c3500" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M20 40 L28 26 L72 26 L80 40 Z" fill="url(#starwing-g-bartop)" stroke="#5c3500" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M8 72 L92 72 L92 78 L8 78 Z" fill="#6b3c00"/>' +
      '<g transform="translate(50 57) scale(.42) translate(-60 -29)"><path d="M60 18C57 10 55 8 53 4c-1 5-2 8-1 12C40 8 22 8 4 16c8 2 12 8 13 16 5-5 11-5 15 1 4-5 10-4 13 3 5 6 11 10 15 18 4-8 10-12 15-18 3-7 9-8 13-3 4-6 10-6 15-1 1-8 5-14 13-16C98 8 80 8 68 16c1-4 0-7-1-12-2 4-4 6-7 14Z" fill="#7a4300"/></g>' +
      '<path d="M30 30 L44 30 L40 36 L26 36 Z" fill="#fff" opacity=".7"/>',
    seven: '<defs><linearGradient id="starwing-g-seven" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3c6"/><stop offset=".4" stop-color="#ff2350"/><stop offset="1" stop-color="#7a0022"/></linearGradient></defs>' +
      '<path d="M20 12 L84 12 L84 26 Q60 50 50 90 L30 90 Q38 56 62 30 L20 30 Z" fill="url(#starwing-g-seven)" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M20 12 L84 12 L84 26 Q60 50 50 90 L30 90 Q38 56 62 30 L20 30 Z" fill="none" stroke="#4a0014" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M84 18 Q96 10 98 22 Q92 20 88 26 Z" fill="#ffd257" stroke="#4a0014" stroke-width="1.5"/>' +
      '<path d="M26 16 L58 16 L54 21 L26 21 Z" fill="#fff" opacity=".6"/>',
    wild: '<defs><radialGradient id="starwing-g-wild" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd257"/><stop offset="1" stop-color="#e0780a"/></radialGradient></defs>' +
      '<path d="M50 2 L60 32 L92 22 L72 48 L98 66 L66 66 L64 98 L50 74 L36 98 L34 66 L2 66 L28 48 L8 22 L40 32 Z" fill="url(#starwing-g-wild)" stroke="#7a3a00" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<g transform="translate(50 50) scale(.5) translate(-60 -29)"><path d="M60 18C57 10 55 8 53 4c-1 5-2 8-1 12C40 8 22 8 4 16c8 2 12 8 13 16 5-5 11-5 15 1 4-5 10-4 13 3 5 6 11 10 15 18 4-8 10-12 15-18 3-7 9-8 13-3 4-6 10-6 15-1 1-8 5-14 13-16C98 8 80 8 68 16c1-4 0-7-1-12-2 4-4 6-7 14Z" fill="#2a0a3a"/></g>',
  };
  function spriteSvg() {
    let s = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">';
    for (const k in ART) s += '<symbol id="starwing-s-' + k + '" viewBox="0 0 100 100">' + ART[k] + '</symbol>';
    return s + '</svg>';
  }
  const useSym = (k) => '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#starwing-s-' + k + '"/></svg>';
  const BATP = 'M60 18C57 10 55 8 53 4c-1 5-2 8-1 12C40 8 22 8 4 16c8 2 12 8 13 16 5-5 11-5 15 1 4-5 10-4 13 3 5 6 11 10 15 18 4-8 10-12 15-18 3-7 9-8 13-3 4-6 10-6 15-1 1-8 5-14 13-16C98 8 80 8 68 16c1-4 0-7-1-12-2 4-4 6-7 14Z';
  /* the bat constellation: star points and the lines between them */
  const CONST = [[10, 40], [24, 30], [34, 44], [44, 36], [50, 50], [56, 36], [66, 44], [76, 30], [90, 40], [50, 70]];
  const CONST_L = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [2, 9], [6, 9], [4, 9]];
  function constellationSvg(w) {
    let s = '<svg viewBox="0 0 100 100" aria-hidden="true">';
    CONST_L.forEach(([a, b]) => { s += '<line x1="' + CONST[a][0] + '" y1="' + CONST[a][1] + '" x2="' + CONST[b][0] + '" y2="' + CONST[b][1] + '" stroke="#9fe9ff" stroke-width="' + (w || 0.6) + '" opacity=".55"/>'; });
    CONST.forEach(([x, y], i) => { s += '<circle cx="' + x + '" cy="' + y + '" r="' + (i === 4 || i === 9 ? 2.2 : 1.5) + '" fill="#fff" style="animation-delay:' + (i * 0.37).toFixed(2) + 's"/>'; });
    return s + '</svg>';
  }
  const POSTER = (function () {
    let st = ''; for (let i = 0; i < 70; i++) st += '<circle cx="' + ((i * 97) % 320) + '" cy="' + ((i * 53) % 400) + '" r="' + (i % 7 ? 0.9 : 1.8) + '" fill="#fff" opacity="' + (0.3 + (i % 5) * 0.14).toFixed(2) + '"/>';
    const gem = (k, x, y, s, r) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + (r || 0) + ') scale(' + s + ') translate(-50 -50)">' + ART[k].replace(/starwing-g-/g, 'swp-g-') + '</g>';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="swp-bg" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="#3a1f8a"/><stop offset=".5" stop-color="#140c45"/><stop offset="1" stop-color="#05061a"/></radialGradient>' +
      '<radialGradient id="swp-neb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".55"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="swp-neb2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3ef0ff" stop-opacity=".45"/><stop offset="1" stop-color="#3ef0ff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="swp-planet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb35c"/><stop offset="1" stop-color="#8a1f6a"/></linearGradient></defs>' +
      '<rect width="320" height="400" fill="url(#swp-bg)"/><ellipse cx="90" cy="120" rx="150" ry="90" fill="url(#swp-neb)"/><ellipse cx="250" cy="260" rx="140" ry="100" fill="url(#swp-neb2)"/>' + st +
      '<circle cx="262" cy="350" r="62" fill="url(#swp-planet)"/><ellipse cx="262" cy="350" rx="104" ry="18" fill="none" stroke="#ffd9a8" stroke-width="5" opacity=".75" transform="rotate(-18 262 350)"/>' +
      '<g opacity=".9">' + (function () { let s = ''; CONST_L.forEach(([a, b]) => { s += '<line x1="' + (60 + CONST[a][0] * 2) + '" y1="' + (CONST[a][1] * 2 - 30) + '" x2="' + (60 + CONST[b][0] * 2) + '" y2="' + (CONST[b][1] * 2 - 30) + '" stroke="#9fe9ff" stroke-width="1.2" opacity=".6"/>'; }); CONST.forEach(([x, y]) => { s += '<circle cx="' + (60 + x * 2) + '" cy="' + (y * 2 - 30) + '" r="2.6" fill="#fff"/>'; }); return s; })() + '</g>' +
      '<g transform="translate(160 210)"><g opacity=".5">' + [0, 45, 90, 135].map((a) => '<rect x="-3" y="-130" width="6" height="260" fill="#ffd257" opacity=".35" transform="rotate(' + a + ')"/>').join('') + '</g>' +
      '<g transform="scale(1.35) translate(-50 -50)">' + ART.wild.replace(/starwing-g-/g, 'swp-g-') + '</g></g>' +
      gem('violet', 62, 290, 0.62, -12) + gem('blue', 108, 330, 0.5, 8) + gem('green', 210, 300, 0.48, 10) + gem('orange', 58, 360, 0.44, -6) + gem('yellow', 150, 362, 0.46, 4) +
      '<text x="160" y="72" text-anchor="middle" font-family="Monoton, Bungee, Impact, sans-serif" font-size="40" fill="#fff" stroke="#ff4fd8" stroke-width="1.2" letter-spacing="2">STARWING</text>' +
      '</svg>';
  })();

  /* ================= sound ================= */
  const A = () => B.audio;
  const SND = {
    spin() { A().noise({ d: 0.5, v: 0.08, lp: 600, f2: 4200 }); A().tone({ f: 220, f2: 660, d: 0.35, type: 'sine', v: 0.05 }); },
    stop(i) { A().tone({ f: 330 + i * 70, f2: 160 + i * 30, d: 0.08, type: 'triangle', v: 0.16 }); A().noise({ d: 0.04, v: 0.05, hp: 3000 }); },
    wildLand(i) { A().seq([988, 1319, 1568, 1976], { step: 0.05, type: 'sine', v: 0.1, t: 0 }); A().tone({ f: 120 + i * 20, f2: 60, d: 0.25, type: 'sine', v: 0.3 }); },
    expand() { A().noise({ d: 0.7, v: 0.1, hp: 1400, f2: 9000 }); A().tone({ f: 200, f2: 1400, d: 0.6, type: 'sawtooth', v: 0.05 }); },
    mult(m) { const f = [0, 660, 784, 988, 0, 1319][m] || 660; A().tone({ f, d: 0.5, type: 'sine', v: 0.18 }); A().tone({ f: f * 2, d: 0.35, type: 'sine', v: 0.06, t: 0.02 }); if (m >= 3) A().seq([f, f * 1.25, f * 1.5, [f * 2, 2]], { step: 0.06, type: 'triangle', v: 0.08, t: 0.1 }); },
    roll() { A().tone({ f: 1500, d: 0.02, type: 'square', v: 0.03 }); },
    win(k) { const base = [523, 587, 659, 784, 880][Math.min(4, k)]; A().seq([base, base * 1.26, base * 1.5], { step: 0.06, type: 'triangle', v: 0.13 }); },
    line(i) { A().tone({ f: 880 + i * 60, d: 0.12, type: 'sine', v: 0.08 }); },
    respin() { A().seq([392, 523, 659, 784], { step: 0.07, type: 'sawtooth', v: 0.06 }); A().noise({ d: 0.5, v: 0.06, lp: 400, f2: 6000 }); },
    nova() { A().seq([262, 330, 392, 523, 659, 784, [1047, 4]], { step: 0.08, type: 'sawtooth', v: 0.09 }); A().seq([131, 0, 196, 0, [262, 6]], { step: 0.12, type: 'square', v: 0.06 }); A().noise({ d: 1.6, v: 0.08, hp: 2000, f2: 12000 }); },
    tick() { A().tone({ f: 2400, d: 0.015, type: 'square', v: 0.035 }); },
    miss() { A().tone({ f: 200, f2: 140, d: 0.18, type: 'triangle', v: 0.05 }); },
  };
  const snd = (k, a) => { try { SND[k](a); } catch (e) { /* audio is optional */ } };

  /* ================= DOM ================= */
  function cellEl(s) { const c = h('div', { class: 'sw-cell', 'data-s': KEYS[s], html: useSym(KEYS[s]) }); return c; }
  function mount(el, Bt) {
    B = Bt; h = B.h; S = B.scope(); root = el; busy = false; skipping = false; turbo = false; auto = 0; devNext = null; reels = [];
    root.innerHTML = spriteSvg();
    E = {};
    /* background */
    E.stars = h('canvas', { class: 'sw-stars', 'aria-hidden': 'true' });
    E.bg = h('div', { class: 'sw-bg' }, h('i', { class: 'neb a' }), h('i', { class: 'neb b' }), h('i', { class: 'neb c' }), E.stars,
      h('div', { class: 'sw-planet', html: '<svg viewBox="0 0 200 120" aria-hidden="true"><defs><linearGradient id="starwing-g-planet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb35c"/><stop offset=".6" stop-color="#c0397a"/><stop offset="1" stop-color="#3a0f4a"/></linearGradient></defs><ellipse cx="100" cy="64" rx="96" ry="16" fill="none" stroke="#ffd9a8" stroke-width="3" opacity=".35" transform="rotate(-14 100 64)"/><circle cx="100" cy="60" r="44" fill="url(#starwing-g-planet)"/><path d="M58 70 Q100 54 142 46" stroke="#ffd9a8" stroke-width="1.5" opacity=".25" fill="none"/><path d="M4 86 A96 16 -14 0 0 196 40" fill="none" stroke="#ffd9a8" stroke-width="3" opacity=".8" transform="rotate(0)"/></svg>' }),
      h('div', { class: 'sw-const', html: constellationSvg() }), h('div', { class: 'sw-flash' }));
    /* logo */
    E.logo = h('div', { class: 'sw-logo' }, h('b', null, 'Starwing'), h('small', null, 'Pays both ways · Bat Star re-spins'));
    /* the machine */
    E.reelsBox = h('div', { class: 'sw-reels' });
    for (let r = 0; r < R; r++) {
      const strip = h('div', { class: 'sw-strip' }), el2 = h('div', { class: 'sw-reel' }, strip), wild = h('div', { class: 'sw-wild', hidden: true });
      el2.append(wild);
      E.reelsBox.append(el2);
      reels.push({ i: r, el: el2, strip, wild, stop: 0, held: false });
    }
    E.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); E.lines.setAttribute('class', 'sw-lines'); E.lines.setAttribute('viewBox', '0 0 500 300'); E.lines.setAttribute('preserveAspectRatio', 'none'); E.lines.setAttribute('aria-hidden', 'true');
    E.tag = h('div', { class: 'sw-tag', hidden: true });
    E.window = h('div', { class: 'sw-window' }, E.reelsBox, E.lines, E.tag);
    E.gutL = h('div', { class: 'sw-gut l' }); E.gutR = h('div', { class: 'sw-gut r' });
    lineIdx = [[], []];
    for (let l = 0; l < M.LINES.length; l++) {
      const a = h('i', { 'data-l': l, style: '--c:' + LINE_COL[l] }, String(l + 1)), b = h('i', { 'data-l': l, style: '--c:' + LINE_COL[l] }, String(l + 1));
      lineIdx[0].push(a); lineIdx[1].push(b);
    }
    for (let row = 0; row < 3; row++) {
      const gl = h('div', { class: 'grp' }), gr = h('div', { class: 'grp' });
      M.LINES.forEach((ln, l) => { if (ln[0] === row) gl.append(lineIdx[0][l]); if (ln[4] === row) gr.append(lineIdx[1][l]); });
      E.gutL.append(gl); E.gutR.append(gr);
    }
    E.machine = h('div', { class: 'sw-machine' }, h('i', { class: 'rim' }), E.gutL, E.window, E.gutR);
    /* wins + messages */
    E.win = h('output', null, '0');
    E.msg = h('span', { class: 'msg' }, 'Ten lines, both ways. Catch a Bat Star.');
    E.respins = h('div', { class: 'sw-respins', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    E.winbar = h('div', { class: 'sw-winbar' }, h('div', { class: 'w' }, h('small', null, 'Win'), E.win), E.msg, E.respins);
    /* side panels for wide screens */
    E.left = h('aside', { class: 'sw-side l' }, h('h3', null, 'The Bat Star'),
      h('div', { class: 'tip', html: useSym('wild') + '<p>Lands on reels <b>2, 3 and 4</b> and <b>expands</b> to fill its reel.</p>' }),
      h('div', { class: 'tip mults', html: '<div class="mx"><b>×1</b><b>×2</b><b>×3</b><b>×5</b></div><p>Each expanded wild takes a <b>multiplier</b>. Lines through more than one wild multiply them together, up to <b>×125</b>.</p>' }),
      h('div', { class: 'tip', html: '<div class="rs"><i></i><i></i><i></i></div><p>The wild is <b>held</b> and the other reels <b>re-spin</b>. Every new wild gives another re-spin, up to 3.</p>' }),
      h('div', { class: 'keys', html: '<b>Space</b> spin <b>T</b> turbo <b>A</b> auto' }));
    E.pays = h('div', { class: 'pays' });
    for (let s = SYM.BAR; s <= SYM.YELLOW; s++) E.pays.append(h('div', { class: 'pr' }, h('span', { class: 'ic', html: useSym(KEYS[s]) }), h('span', { class: 'v', 'data-s': s })));
    E.right = h('aside', { class: 'sw-side r' }, h('h3', null, 'Paytable', h('small', null, '5 · 4 · 3 of a kind, either way')), E.pays);
    /* controls */
    const stakeBox = h('div', { class: 'sw-stakebox' });
    stakeCtl = B.ui.stake(stakeBox, { id: ID, label: 'Stake · 10 lines', onChange: paintStake });
    E.spin = h('button', { class: 'sw-spin', type: 'button', id: 'starwing-spin', 'aria-label': 'Spin', onclick: primary,
      html: '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="starwing-g-btn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ef0ff"/><stop offset=".5" stop-color="#a24dff"/><stop offset="1" stop-color="#ff4fd8"/></linearGradient></defs>' +
        '<circle cx="50" cy="50" r="47" fill="url(#starwing-g-btn)"/><circle cx="50" cy="50" r="40" fill="#0b0a2a"/><g class="ring"><path d="M50 14 L54 44 L84 50 L54 56 L50 86 L46 56 L16 50 L46 44 Z" fill="#ffd257"/><circle cx="50" cy="50" r="7" fill="#fffbe0"/></g></svg>' });
    E.autoBtn = h('button', { class: 'sw-btn', type: 'button', id: 'starwing-auto', onclick: autoClick }, h('b', null, 'Auto'), h('small', null, 'off'));
    E.turboBtn = h('button', { class: 'sw-btn', type: 'button', id: 'starwing-turbo', 'aria-pressed': 'false', onclick: toggleTurbo }, h('b', null, 'Turbo'), h('small', null, 'off'));
    E.autoMenu = buildAutoMenu();
    E.ctl = h('div', { class: 'sw-ctl' }, h('div', { class: 'l' }, stakeBox), E.spin, h('div', { class: 'r' }, E.autoBtn, E.turboBtn), E.autoMenu);
    E.banner = h('div', { class: 'sw-banner', hidden: true });
    E.center = h('div', { class: 'sw-center' }, E.logo, E.machine, E.winbar);
    E.wrap = h('div', { class: 'sw-wrap' }, E.left, E.center, E.right, E.ctl);
    root.append(E.bg, E.wrap, E.banner);

    for (const Rl of reels) { Rl.stop = Math.floor(Math.random() * M.STRIPS[Rl.i].length); restCells(Rl); }
    paintStake(); paintCtl();
    const ro = new ResizeObserver(layout); ro.observe(root); S._ro = ro; layout();
    S.on(document, 'keydown', onKey);
    startStars();
    if (DEV) {
      devLog = { rounds: 0, staked: 0, won: 0, start: B.wallet.balance, respins: 0 };
      window.__starwingDev = {
        next(pred) { devNext = () => { for (let i = 0; i < 2000000; i++) { const o = M.spin(B.rng); if (pred(o)) return o; } return M.spin(B.rng); }; },
        set speed(v) { devSpeed = v; }, get speed() { return devSpeed; }, get log() { return devLog; }, get busy() { return busy; }, M,
      };
    }
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    if (window.__starwingDev) delete window.__starwingDev;
    E = null; root = null; reels = null;
  }
  function layout() {
    if (!E) return;
    const w = root.clientWidth;
    root.classList.toggle('wide', w >= 1100);
  }

  /* ---------- starfield ---------- */
  function startStars() {
    const cv = E.stars, c = cv.getContext('2d'); let W = 0, H = 0, stars = [], shoot = null, dpr = 1;
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; stars = []; const n = Math.min(260, (W * H) / 3800); for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < 0.1 ? 1.6 : 0.5 + Math.random() * 0.8, p: Math.random() * 6.3, s: 0.6 + Math.random() * 2, z: 0.2 + Math.random() * 0.8, c: Math.random() < 0.12 ? '#ffd9f5' : Math.random() < 0.2 ? '#c8f6ff' : '#ffffff' }); };
    size(); S.on(window, 'resize', size);
    const still = reduce();
    S.loop((dt, t) => {
      if (!E) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      const speed = busy ? 26 : 5;
      for (const s of stars) {
        if (!still) { s.y += s.z * speed * dt; if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; } }
        c.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 1000 * s.s + s.p));
        c.fillStyle = s.c; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.3); c.fill();
      }
      if (!still && !shoot && Math.random() < dt * 0.12) shoot = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.4, l: 0 };
      if (shoot) {
        shoot.l += dt; const k = shoot.l / 0.9, x = shoot.x + k * 260, y = shoot.y + k * 110;
        const g = c.createLinearGradient(x - 90, y - 38, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)');
        c.globalAlpha = 1 - k; c.strokeStyle = g; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 90, y - 38); c.lineTo(x, y); c.stroke();
        if (k >= 1) shoot = null;
      }
      c.globalAlpha = 1;
    });
  }

  /* ---------- reels ---------- */
  const symAt = (r, pos) => { const st = M.STRIPS[r]; return st[((pos % st.length) + st.length) % st.length]; };
  function restCells(Rl) {
    Rl.strip.textContent = ''; Rl.strip.style.transform = '';
    for (let k = 0; k < 3; k++) Rl.strip.append(cellEl(symAt(Rl.i, Rl.stop + k)));
  }
  function cellsOf(Rl) { return Array.from(Rl.strip.children); }
  /* roll a reel from its current stop to `to`, moving DOWN through the real strip (new symbols enter at the top) */
  function rollTo(Rl, to, ms, delayMs) {
    const L = M.STRIPS[Rl.i].length;
    let d = ((Rl.stop - to) % L + L) % L;
    const minD = 14 + Rl.i * 5;
    while (d < minD) d += L;
    const strip = Rl.strip; strip.textContent = '';
    for (let k = 0; k < d + 3; k++) strip.append(cellEl(symAt(Rl.i, to + k)));
    const n = d + 3, from = -(d / n) * 100;
    strip.style.transform = 'translateY(' + from + '%)';
    Rl.el.classList.add('spinning');
    return new Promise((res) => {
      S.timeout(() => {
        if (!E) return;
        const over = (0.18 / n) * 100;
        const an = strip.animate([
          { transform: 'translateY(' + from + '%)', filter: 'blur(0)' },
          { transform: 'translateY(' + (from * 0.4) + '%)', filter: 'blur(1.5px)', offset: 0.45 },
          { transform: 'translateY(' + over + '%)', filter: 'blur(0)', offset: 0.88 },
          { transform: 'translateY(0%)', filter: 'blur(0)' },
        ], { duration: ms, easing: 'cubic-bezier(.3,.05,.25,1)', fill: 'forwards' });
        an.onfinish = () => { if (!E) return res(); an.cancel(); Rl.stop = to; restCells(Rl); Rl.el.classList.remove('spinning'); snd('stop', Rl.i); res(); };
      }, delayMs || 0);
    });
  }

  /* ---------- wild expansion ---------- */
  async function expandWild(Rl, mult) {
    const rowOf = [0, 1, 2].find((k) => symAt(Rl.i, Rl.stop + k) === SYM.WILD);
    const cs = cellsOf(Rl); if (cs[rowOf]) cs[rowOf].classList.add('land');
    snd('wildLand', Rl.i);
    await nap(380);
    if (!E) return;
    const w = Rl.wild; w.hidden = false; w.className = 'sw-wild'; w.style.setProperty('--row', rowOf);
    w.innerHTML = '<i class="beam"></i><i class="rays"></i>' + useSym('wild') + '<b class="tagw">Wild</b><output class="mx">×1</output>';
    void w.offsetWidth; w.classList.add('open'); snd('expand');
    Rl.held = true; Rl.el.classList.add('held');
    B.fx.burst({ el: Rl.el, count: 22, kind: 'spark', colors: ['#ffd257', '#fffbe0', '#3ef0ff', '#ff4fd8'], power: 0.7 });
    await nap(520);
    if (!E) return;
    /* the multiplier rolls through the values and lands */
    const out = w.querySelector('.mx'), vals = M.CFG.multValues;
    if (!skipping) for (let i = 0; i < 9; i++) { out.textContent = '×' + vals[i % vals.length]; snd('roll'); await nap(55 + i * 12); if (!E) return; }
    out.textContent = '×' + mult; out.classList.toggle('hot', mult > 1); w.classList.add('m' + mult);
    snd('mult', mult);
    if (mult >= 3) B.fx.burst({ el: out, count: mult >= 5 ? 40 : 22, kind: 'spark', colors: ['#ffd257', '#ff4fd8', '#fff'], power: 0.8 });
    await nap(mult > 1 ? 380 : 200);
  }
  function clearWilds() { for (const Rl of reels) { Rl.held = false; Rl.wild.hidden = true; Rl.wild.className = 'sw-wild'; Rl.wild.innerHTML = ''; Rl.el.classList.remove('held'); } }

  /* ---------- win display ---------- */
  function clearWins() {
    if (!E) return;
    E.lines.textContent = ''; E.window.classList.remove('showing'); E.tag.hidden = true;
    root.querySelectorAll('.g-starwing .sw-cell.hit, .g-starwing .sw-wild.hit').forEach((c) => c.classList.remove('hit'));
    lineIdx[0].concat(lineIdx[1]).forEach((x) => x.classList.remove('on'));
  }
  function cellsOfWin(w) {
    const out = [], ln = M.LINES[w.l];
    for (let k = 0; k < w.n; k++) { const r = w.dir === 1 ? k : R - 1 - k; out.push([r, ln[r]]); }
    return out;
  }
  function markCells(w, on) {
    for (const [r, row] of cellsOfWin(w)) {
      const Rl = reels[r];
      if (Rl.held) Rl.wild.classList.toggle('hit', on);
      else { const c = cellsOf(Rl)[row]; if (c) c.classList.toggle('hit', on); }
    }
  }
  function drawLine(w, solo) {
    const ln = M.LINES[w.l], NS = 'http://www.w3.org/2000/svg';
    const pts = ln.map((row, r) => (r * 100 + 50) + ',' + (row * 100 + 50)).join(' ');
    const g = document.createElementNS(NS, 'g'); g.setAttribute('style', '--c:' + LINE_COL[w.l]);
    for (const cls of ['glow', 'core']) { const p = document.createElementNS(NS, 'polyline'); p.setAttribute('points', pts); p.setAttribute('class', cls + (solo ? ' solo' : '')); p.setAttribute('vector-effect', 'non-scaling-stroke'); g.append(p); }
    E.lines.append(g);
    lineIdx[w.dir === 1 ? 0 : 1][w.l].classList.add('on');
  }
  async function showWins(step, unit, running, k) {
    if (!step.wins.length) return;
    clearWins();
    E.window.classList.add('showing');
    for (const w of step.wins) { drawLine(w, false); markCells(w, true); }
    snd('win', k);
    const amt = step.pay * unit;
    tag(Batty.fmt(amt) + ' BB', step.wins.some((w) => w.m > 1) ? 'mult' : '');
    if (amt >= unit * U * 2) B.fx.burst({ el: E.window, count: Math.min(60, 14 + step.wins.length * 6), kind: 'spark', colors: ['#3ef0ff', '#ff4fd8', '#ffd257', '#fff'], power: 0.8 });
    await B.ui.countUp(E.win, running, running + amt, T(Math.min(900, 300 + amt / unit * 6)));
    await nap(skipping || turbo || auto > 0 ? 350 : 650);
    /* then line by line, when there is time to look */
    if (!skipping && !turbo && auto === 0 && step.wins.length > 1) {
      for (let i = 0; i < step.wins.length && E && !skipping; i++) {
        const w = step.wins[i];
        clearWins(); E.window.classList.add('showing'); drawLine(w, true); markCells(w, true); snd('line', i);
        tag('Line ' + (w.l + 1) + ' · ' + w.n + ' ' + M.SYMBOL_NAMES[w.s] + (w.m > 1 ? ' · ×' + w.m : '') + ' · ' + Batty.fmt(w.pay * unit), w.m > 1 ? 'mult' : '');
        await nap(820);
      }
    }
  }
  function tag(text, cls) { E.tag.hidden = false; E.tag.className = 'sw-tag ' + (cls || ''); E.tag.textContent = text; void E.tag.offsetWidth; E.tag.classList.add('in'); }
  function banner(html, cls, ms) {
    E.banner.hidden = false; E.banner.className = 'sw-banner ' + (cls || ''); E.banner.innerHTML = html;
    void E.banner.offsetWidth; E.banner.classList.add('in');
    return nap(ms || 900).then(() => { if (E) { E.banner.classList.remove('in'); E.banner.classList.add('out'); } return nap(260); }).then(() => { if (E) E.banner.hidden = true; });
  }
  function setMsg(t, cls) { if (!E) return; E.msg.textContent = t; E.msg.className = 'msg ' + (cls || ''); }
  function paintRespins(n) { if (!E) return; Array.from(E.respins.children).forEach((x, i) => x.classList.toggle('on', i < n)); }

  /* ---------- a round ---------- */
  function primary() {
    if (busy) { skipping = true; return; }
    if (!E.autoMenu.hidden) { E.autoMenu.hidden = true; return; }
    round();
  }
  async function round() {
    if (busy || !E) return;
    const stake = stakeCtl.value, unit = stake / U;
    if (!B.wallet.bet(ID, stake)) { stopAuto(); return B.ui.broke(); }
    busy = true; skipping = false; E.autoMenu.hidden = true; paintCtl();
    E.win.textContent = '0'; E.winbar.classList.remove('won', 'cap'); clearWins(); paintRespins(0);
    if (auto > 0) auto--;
    setMsg('Spinning...', '');
    snd('spin');
    /* the reels start rolling at once; the outcome arrives while they spin */
    let o;
    const fetchO = (async () => {
      if (B.online) { const r = await B.play(ID, 'spin', { stake }, stake); return r ? r.o : null; }
      if (DEV && devNext) { const x = devNext(); devNext = null; return x; }
      return M.spin(B.rng);
    })();
    clearWilds();
    o = await fetchO;
    if (!E) return;
    if (!o) { busy = false; stopAuto(); paintCtl(); for (const Rl of reels) restCells(Rl); setMsg('Lost contact with the stars. Try again.', ''); return; }
    const win = o.totalWin * unit;
    if (win > 0) B.wallet.win(ID, win, { silent: true });
    sess.spins++; if (win > 0) sess.hits++; if (win > sess.best) sess.best = win;
    if (devLog) { devLog.rounds++; devLog.staked += stake; devLog.won += win; devLog.respins += o.steps.length - 1; devLog.last = o; }

    let running = 0;
    for (let k = 0; k < o.steps.length && E; k++) {
      const st = o.steps[k];
      if (k > 0) {
        paintRespins(k);
        const novaNow = st.newWild.length && o.steps[k - 1].newWild.length;
        await banner('<small>Bat Star</small><b>Re-spin</b>', 'respin', 700);
        if (!E) return;
        snd('respin'); void novaNow;
      }
      /* spin every reel that is not held */
      const moving = reels.filter((Rl) => !Rl.held);
      const base = turbo || auto > 0 ? 380 : 640, gap = turbo || auto > 0 ? 70 : 140;
      await Promise.all(moving.map((Rl, j) => rollTo(Rl, st.stops[Rl.i], T(base + j * gap), 0)));
      if (!E) return;
      /* new wilds expand, left to right */
      for (const r of st.newWild) { await expandWild(reels[r], st.mult[r]); if (!E) return; }
      if (reels.slice(1, 4).every((Rl) => Rl.held) && st.newWild.length) {
        E.bg.classList.remove('nova'); void E.bg.offsetWidth; E.bg.classList.add('nova');
        snd('nova'); await banner('<small>All three reels</small><b>Supernova</b>', 'nova', 1100);
        if (!E) return;
      }
      if (st.pay > 0) { await showWins(st, unit, running, k); running += st.pay * unit; }
      else if (k === 0 && !st.newWild.length) { await nap(80); }
      if (!E) return;
      if (k < o.steps.length - 1) clearWins();
    }
    if (!E) return;
    /* the round is over */
    if (o.steps.length > 1) await nap(250);
    if (!E) return;
    E.win.textContent = Batty.fmt(win);
    if (o.capped) { E.winbar.classList.add('cap'); setMsg('Maximum win reached: ' + Batty.fmt(M.MAX_WIN_X) + '× stake. Supernova!', 'gold'); }
    else if (win > 0) { E.winbar.classList.add('won'); setMsg((o.steps.length > 1 ? (o.steps.length - 1) + ' re-spin' + (o.steps.length > 2 ? 's' : '') + ' · ' : '') + 'Paid ' + Batty.fmt(win) + ' BB', 'gold'); }
    else { setMsg(IDLE[sess.spins % IDLE.length], ''); }
    B.wallet.sync();
    if (win >= stake * 10) await B.ui.celebrate({ amount: win, bet: stake });
    if (!E) return;
    clearWins(); clearWilds(); for (const Rl of reels) restCells(Rl); paintRespins(0);
    busy = false; skipping = false; paintCtl();
    continueAuto(win);
  }
  const IDLE = ['Ten lines, both ways. Catch a Bat Star.', 'Bat Stars land on reels 2, 3 and 4 and fill the whole reel.', 'Every Bat Star holds its reel and re-spins the rest.', 'Two wilds on one line? Their multipliers multiply.', 'Three Bat Stars at once: Supernova.'];

  /* ---------- autoplay ---------- */
  function buildAutoMenu() {
    const m = h('div', { class: 'sw-automenu', hidden: true, role: 'dialog', 'aria-label': 'Autoplay' });
    const rowN = h('div', { class: 'chips n' }), rowL = h('div', { class: 'chips l' });
    const paint = () => {
      rowN.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.n === autoPick.n));
      rowL.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.l === autoPick.loss));
    };
    for (const n of [10, 25, 50, 100, 250]) rowN.append(h('button', { type: 'button', 'data-n': n, onclick: () => { autoPick.n = n; snd('tick'); paint(); } }, String(n)));
    for (const l of [0, 20, 50, 100, 250]) rowL.append(h('button', { type: 'button', 'data-l': l, onclick: () => { autoPick.loss = l; snd('tick'); paint(); } }, l ? l + '×' : 'None'));
    const go = h('button', { type: 'button', class: 'sw-btn go', id: 'starwing-auto-go', onclick: () => startAuto() }, h('b', null, 'Start autoplay'));
    m.append(h('h4', null, 'Autoplay'), h('label', null, 'Spins'), rowN, h('label', null, 'Stop if I lose more than (× stake)'), rowL, go);
    paint();
    return m;
  }
  function autoClick() { snd('tick'); if (auto > 0) { stopAuto(); return; } if (busy) return; E.autoMenu.hidden = !E.autoMenu.hidden; }
  function startAuto() { E.autoMenu.hidden = true; auto = autoPick.n; autoLoss = autoPick.loss * stakeCtl.value; autoFloor = B.wallet.balance - autoLoss; paintCtl(); if (!busy) round(); }
  function stopAuto() { auto = 0; if (E) paintCtl(); }
  function continueAuto(win) {
    if (auto <= 0) return;
    const stake = stakeCtl.value;
    if (autoLoss && B.wallet.balance - stake < autoFloor) { stopAuto(); B.ui.toast('Autoplay stopped: loss limit reached.'); return; }
    if (!B.wallet.canBet(stake)) { stopAuto(); B.ui.toast('Autoplay stopped: not enough Batty Bucks for the next spin.'); return; }
    S.timeout(() => { if (auto > 0 && !busy) round(); }, T(win ? 380 : 140));
  }
  function toggleTurbo() { turbo = !turbo; E.turboBtn.setAttribute('aria-pressed', turbo); E.turboBtn.lastChild.textContent = turbo ? 'on' : 'off'; E.turboBtn.classList.toggle('on', turbo); snd('tick'); }
  function paintStake() {
    if (!E) return;
    const st = stakeCtl.value, unit = st / U;
    E.pays.querySelectorAll('.v').forEach((v) => {
      const p = M.PAY[+v.dataset.s];
      v.innerHTML = '<i>5</i>' + Batty.fmt(p[2] * unit) + '<i>4</i>' + Batty.fmt(p[1] * unit) + '<i>3</i>' + Batty.fmt(p[0] * unit);
    });
  }
  function paintCtl() {
    if (!E) return;
    stakeCtl.disabled = busy || auto > 0;
    E.spin.classList.toggle('busy', busy);
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? String(auto) : 'off';
  }
  function onKey(e) {
    if (!E || e.target.closest('input,textarea,select') || document.querySelector('.bc-veil')) return;
    if (e.code === 'Space') { e.preventDefault(); primary(); }
    else if (e.key === 't' || e.key === 'T') toggleTurbo();
    else if (e.key === 'a' || e.key === 'A') autoClick();
  }

  /* ---------- rules ---------- */
  function rules() {
    const f = Batty.fmt;
    let t = '<div class="sw-rules">';
    t += '<p>Starwing is a 5-reel, 3-row slot with <b>10 fixed lines that pay both ways</b>: three or more of a kind from the left-hand reel rightwards, or from the right-hand reel leftwards. A five of a kind is paid once. The stake covers all 10 lines (a line bet is a tenth of it).</p>';
    t += '<h3>Bat Star Wild</h3><p>The Bat Star lands only on reels 2, 3 and 4 and stands in for every symbol. When one lands it <b>expands</b> to fill its reel, takes a <b>multiplier</b> and is <b>held</b> while the other reels <b>re-spin</b>. A new Bat Star in a re-spin expands and gives another re-spin, so there can be up to 3. Every spin and re-spin pays.</p>';
    const tw = M.CFG.multWeights.reduce((a, b) => a + b, 0);
    t += '<h3>Wild multipliers</h3><table><tr><th>Multiplier</th><th>Chance</th></tr>' + M.CFG.multValues.map((v, i) => '<tr><td>×' + v + '</td><td>' + (M.CFG.multWeights[i] / tw * 100).toFixed(0) + '%</td></tr>').join('') + '</table>';
    t += '<p>A line that runs through expanded wilds is multiplied by all of their multipliers <b>multiplied together</b> (×2 and ×3 make ×6; three ×5s make ×125).</p>';
    t += '<h3>Paytable</h3><p>Pays for 3, 4 and 5 of a kind, in multiples of your <b>total stake</b>.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>';
    for (let s = SYM.BAR; s <= SYM.YELLOW; s++) t += '<tr><td>' + M.SYMBOL_NAMES[s] + '</td>' + M.PAY[s].map((p) => '<td>' + (p / U).toFixed(2).replace(/\.?0+$/, '') + '×</td>').join('') + '</tr>';
    t += '</table>';
    t += '<h3>Lines</h3><div class="sw-lmap">' + M.LINES.map((ln, l) => '<svg viewBox="0 0 50 30"><rect width="50" height="30" rx="3" fill="#120c3a"/>' + [0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((r) => '<rect x="' + (r * 10 + 1.5) + '" y="' + (row * 10 + 1.5) + '" width="7" height="7" rx="1.5" fill="' + (ln[r] === row ? LINE_COL[l] : '#2a2366') + '"/>').join('')).join('') + '<text x="25" y="28.5" font-size="0">' + (l + 1) + '</text></svg><span>' + (l + 1) + '</span>').join('') + '</div>';
    t += '<h3>Numbers</h3><table>' +
      '<tr><td>Return to player (exact calculation)</td><td><b>' + RTP.exact + '</b></td></tr>' +
      '<tr><td>Return in ' + RTP.sims + ' simulated spins</td><td>' + RTP.sim + '</td></tr>' +
      '<tr><td>Any win</td><td>' + RTP.hit + ' spins</td></tr>' +
      '<tr><td>Bat Star re-spins</td><td>' + RTP.wild + ' spins</td></tr>' +
      '<tr><td>Volatility</td><td>Low to medium</td></tr>' +
      '<tr><td>Maximum win per spin</td><td>' + f(M.MAX_WIN_X) + '× stake</td></tr></table>';
    t += '<p>Keys: Space spins (and hurries the animation), T turbo, A autoplay. Batty Bucks have no cash value.</p>';
    t += '<p class="rtp">Designed return ' + RTP.exact + '. Live-balanced site-wide to a 98% target.</p></div>';
    return t;
  }

  Batty.registerGame({
    id: ID,
    name: 'Starwing',
    tagline: 'Expanding Bat Stars, wild multipliers, both-ways pays',
    tag: 'Slot',
    poster: POSTER,
    rules,
    mount,
    unmount,
  });
})();
