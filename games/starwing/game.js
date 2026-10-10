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
/* Starwing — presentation. A cosmic gem slot: 5x3, 10 lines that pay both ways, expanding Bat Star wilds with rolling
   multipliers and re-spins, and a Supernova when reels 2, 3 and 4 are all wild at once.
   Online, every round (the spin and all its re-spins) comes from the server in one Batty.play call (lib/games/starwing.php).
   Offline (practice) it runs the maths above with Batty.rng. Nothing here changes an outcome: it only shows it.
   All art is drawn in code: procedurally faceted SVG jewels, CSS, and three canvases (nebula + galaxy, the starfield,
   and a full-screen effects layer). The reels are a small physics engine: back-kick, motion blur, staggered stops with
   overshoot, anticipation and slam-stop. */
(function () {
  'use strict';
  const ID = 'starwing';
  const M = (typeof BattyMath !== 'undefined' && BattyMath.starwing) || (typeof globalThis !== 'undefined' && globalThis.BattyMath && globalThis.BattyMath.starwing);
  const U = M.UNITS_PER_STAKE, R = M.REELS, SYM = M.SYM, SVGNS = 'http://www.w3.org/2000/svg', POOL = 5;
  const KEYS = ['wild', 'bar', 'seven', 'violet', 'blue', 'orange', 'green', 'yellow'];
  const LINE_COL = ['#3ef0ff', '#ff4fd8', '#ffd257', '#7dff8a', '#ff8a3c', '#a98bff', '#ff5d7a', '#5db8ff', '#f6ff6b', '#45ffcf'];
  const GLOW = { wild: '#ffd257', bar: '#ffc83a', seven: '#ff3366', violet: '#c27bff', blue: '#4aa8ff', orange: '#ff9a2e', green: '#2ee88a', yellow: '#ffe24a' };
  /* figures from tools/starwing-exact.js and tools/starwing-sim-out.txt */
  const RTP = { exact: '98.00%', sim: '98.2%', hit: '1 in 2.5', wild: '1 in 8.7', sims: '150,000,000' };

  let B, h, S, root, E, reels, busy, skipping, slam, turbo, auto, stakeCtl, lineIdx, RM = false, DEV = false;
  let autoPick = { n: 25, loss: 50 }, autoLoss = 0, autoFloor = 0, devNext = null, devLog = null, devSpeed = 1;
  let geo = { w: 500, h: 300 }, cycleTok = 0, spinT0 = 0, sky = null, fxs = null, warpBoost = 0;
  const par = { x: 0, y: 0, tx: 0, ty: 0, mouse: false };
  const sess = { spins: 0, hits: 0, best: 0 };
  const T = (ms) => ms * (turbo ? 0.55 : 1) * (skipping ? 0.12 : 1) * devSpeed * (RM ? 0.7 : 1);
  const nap = (ms) => S.sleep(T(ms));
  const fast = () => turbo || auto > 0;
  const fmt = (n) => Batty.fmt(n);
  const mod = (a, n) => ((a % n) + n) % n;

  /* ================= art: procedurally faceted jewels ================= */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  function col(pal, t) {
    t = clamp(t, 0, 1) * (pal.length - 1);
    const i = Math.min(pal.length - 2, Math.floor(t)), f = t - i, a = hx(pal[i]), b = hx(pal[i + 1]);
    return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
  }
  const LIGHT = Math.atan2(-1, -0.75); /* light from the upper left */
  const lit = (x, y, cx, cy) => 0.5 + 0.5 * Math.cos(Math.atan2(y - cy, x - cx) - LIGHT);
  const pd = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  const ngon = (n, r, a0, cx, cy, sy) => Array.from({ length: n }, (_, i) => { const a = (a0 + i * 360 / n) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * (sy || 1)]; });
  const star = (n, r1, r2, a0, cx, cy) => Array.from({ length: n * 2 }, (_, i) => { const a = (a0 + i * 180 / n) * Math.PI / 180, r = i % 2 ? r2 : r1; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const cen = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const scaleP = (pts, c, k) => pts.map((p) => lerpP(c, p, k));

  /* gem(id, outer, inner, palette dark->light, {bands, step}): crown facets between the girdle and the table, each shaded by
     where it faces; the table's star facets are lit from the opposite side (the refraction trick), plus fire, specular and rim light */
  function gem(id, outer, inner, pal, o) {
    o = o || {};
    const g = 'starwing-g-' + id, N = outer.length, c = cen(outer);
    const bands = o.bands || [1];
    const rings = [outer].concat(bands.map((f) => outer.map((p, i) => lerpP(p, inner[i], f))));
    let s = '<defs>' +
      '<linearGradient id="' + g + '-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".42" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + g + '-t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + col(pal, .95) + '"/><stop offset=".5" stop-color="' + col(pal, .6) + '"/><stop offset="1" stop-color="' + col(pal, .38) + '"/></linearGradient>' +
      '<radialGradient id="' + g + '-f" cx=".64" cy=".68" r=".5"><stop offset="0" stop-color="' + pal[4] + '" stop-opacity=".5"/><stop offset="1" stop-color="' + pal[4] + '" stop-opacity="0"/></radialGradient>' +
      '</defs>';
    s += '<path d="' + pd(outer) + '" transform="translate(1.6 4.2)" fill="#02010a" opacity=".45"/>';
    s += '<path d="' + pd(outer) + '" fill="' + pal[0] + '"/>';
    let best = -1, bestQ = null;
    for (let k = 0; k < bands.length; k++) for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, q = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], m = cen(q);
      const b = lit(m[0], m[1], c[0], c[1]), con = k === 0 ? 1 : 0.72, alt = o.step ? (k % 2 ? -0.08 : 0.05) : 0;
      s += '<path d="' + pd(q) + '" fill="' + col(pal, 0.1 + 0.84 * (0.5 + (b - 0.5) * con) + alt) + '" stroke="' + pal[4] + '" stroke-opacity=".3" stroke-width=".5" stroke-linejoin="round"/>';
      if (k === 0 && b > best) { best = b; bestQ = q; }
    }
    const Tb = rings[rings.length - 1], tc = cen(Tb);
    s += '<path d="' + pd(Tb) + '" fill="url(#' + g + '-t)"/>';
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, tri = [tc, Tb[i], Tb[j]], m = cen(tri), b = 1 - lit(m[0], m[1], tc[0], tc[1]);
      s += '<path d="' + pd(tri) + '" fill="' + col(pal, 0.32 + 0.64 * b) + '" opacity=".6"/>';
    }
    const fire = Tb.map((p, i) => lerpP(tc, lerpP(p, Tb[(i + 1) % N], 0.5), 0.55));
    s += '<path d="' + pd(fire) + '" fill="' + pal[4] + '" opacity=".24"/>';
    s += '<path d="' + pd(outer) + '" fill="url(#' + g + '-f)"/>';
    if (bestQ) s += '<path d="' + pd(bestQ) + '" fill="#fff" opacity=".55"/>';
    s += '<path d="' + pd(outer) + '" fill="none" stroke="' + col(pal, .02) + '" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="' + pd(outer) + '" fill="none" stroke="url(#' + g + '-rim)" stroke-width="1.7" stroke-linejoin="round"/>';
    const hs = bestQ ? lerpP(c, cen(bestQ), 1.0) : c;
    s += '<circle cx="' + hs[0].toFixed(1) + '" cy="' + hs[1].toFixed(1) + '" r="2.3" fill="#fff"/>';
    return s;
  }
  const PAL = {
    violet: ['#22054f', '#5212ad', '#9640ff', '#cf8bff', '#f8eaff'],
    blue: ['#03124a', '#0a40bd', '#2a86ff', '#8fd0ff', '#effbff'],
    orange: ['#451100', '#b13f00', '#ff861a', '#ffc46b', '#fff4da'],
    green: ['#022c18', '#05733a', '#18c873', '#7dffbb', '#eafff4'],
    yellow: ['#3d2a00', '#a07000', '#ffd000', '#fff07a', '#fffee8'],
  };
  const SHAPE = {
    violet: [ngon(6, 45, -90, 50, 50), ngon(6, 21, -90, 50, 50), { bands: [0.48, 1] }],
    blue: [ngon(12, 44, -75, 50, 50), ngon(12, 21, -90, 50, 50), { bands: [1] }],
    orange: [star(4, 47, 31, -90, 50, 50), star(4, 19, 12.5, -90, 50, 50), { bands: [0.36, 0.7, 1], step: true }],
    green: [[[33, 5], [67, 5], [86, 24], [86, 76], [67, 95], [33, 95], [14, 76], [14, 24]], [[43, 32], [57, 32], [64, 40], [64, 60], [57, 68], [43, 68], [36, 60], [36, 40]], { bands: [0.34, 0.67, 1], step: true }],
    yellow: [star(3, 49, 27, -90, 50, 57), star(3, 21, 12, -90, 50, 57), { bands: [0.5, 1] }],
  };
  const BATP = 'M60 18C57 10 55 8 53 4c-1 5-2 8-1 12C40 8 22 8 4 16c8 2 12 8 13 16 5-5 11-5 15 1 4-5 10-4 13 3 5 6 11 10 15 18 4-8 10-12 15-18 3-7 9-8 13-3 4-6 10-6 15-1 1-8 5-14 13-16C98 8 80 8 68 16c1-4 0-7-1-12-2 4-4 6-7 14Z';
  const SEVENP = 'M18 10 H86 V25 Q63 47 53 92 H30 Q37 58 61 28 H18 Z';
  const BARO = [[26, 26], [74, 26], [96, 74], [94, 80], [6, 80], [4, 74]];
  const WILDP = star(8, 48, 21, -90, 50, 50);

  function wildArt() {
    const pal = ['#4a1a00', '#b84a00', '#ff961a', '#ffd257', '#fffbe6'], g = 'starwing-g-wild', c = [50, 50];
    let s = '<defs><radialGradient id="' + g + '-d" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#5a2a9a"/><stop offset=".7" stop-color="#1c0844"/><stop offset="1" stop-color="#0b0322"/></radialGradient>' +
      '<radialGradient id="' + g + '-h" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#ffd257" stop-opacity=".55"/><stop offset="1" stop-color="#ffd257" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + g + '-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffc23a"/></linearGradient></defs>';
    s += '<circle cx="50" cy="50" r="49" fill="url(#' + g + '-h)"/>';
    s += '<path d="' + pd(WILDP) + '" transform="translate(1.5 4)" fill="#02010a" opacity=".45"/>';
    for (let i = 0; i < 8; i++) {
      const tip = WILDP[i * 2], v0 = WILDP[mod(i * 2 - 1, 16)], v1 = WILDP[i * 2 + 1];
      const a = [c, v0, tip], b = [c, tip, v1], ma = cen(a), mb = cen(b);
      s += '<path d="' + pd(a) + '" fill="' + col(pal, .12 + .86 * lit(ma[0], ma[1], 50, 50)) + '"/>';
      s += '<path d="' + pd(b) + '" fill="' + col(pal, .05 + .7 * lit(mb[0], mb[1], 50, 50)) + '"/>';
    }
    s += '<path d="' + pd(WILDP) + '" fill="none" stroke="#5a2400" stroke-width="2" stroke-linejoin="round"/>';
    s += '<path d="' + pd(WILDP.slice(12).concat(WILDP.slice(0, 5))) + '" fill="none" stroke="#fffbe6" stroke-width="1.2" stroke-opacity=".8" stroke-linejoin="round" stroke-linecap="round" transform="translate(.6 .6)"/>'.replace('Z"', '"');
    s += '<circle cx="50" cy="50" r="19.5" fill="url(#' + g + '-d)" stroke="#ffd257" stroke-width="2.4"/>';
    s += '<circle cx="50" cy="50" r="15.5" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>';
    s += '<g transform="translate(50 52) scale(.27) translate(-60 -29)"><path d="' + BATP + '" fill="url(#' + g + '-b)"/></g>';
    s += '<circle cx="47.3" cy="49.6" r=".9" fill="#2a0a3a"/><circle cx="52.7" cy="49.6" r=".9" fill="#2a0a3a"/>';
    s += '<path d="M40 41 Q45 36 52 36" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>';
    return s;
  }
  function sevenArt() {
    const g = 'starwing-g-seven';
    return '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fa8"/><stop offset=".35" stop-color="#ff1f4f"/><stop offset=".75" stop-color="#c0002c"/><stop offset="1" stop-color="#6a0018"/></linearGradient>' +
      '<linearGradient id="' + g + '-e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd257"/><stop offset=".7" stop-color="#d98a00"/><stop offset="1" stop-color="#fff0b0"/></linearGradient></defs>' +
      '<path d="' + SEVENP + '" transform="translate(1.6 4.2)" fill="#02010a" opacity=".45" stroke="#02010a" stroke-width="9" stroke-linejoin="round"/>' +
      '<path d="' + SEVENP + '" fill="none" stroke="#3a000c" stroke-width="12" stroke-linejoin="round"/>' +
      '<path d="' + SEVENP + '" fill="url(#' + g + ')" stroke="url(#' + g + '-e)" stroke-width="7" stroke-linejoin="round"/>' +
      '<path d="M23 14.5 H81.5 V22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>' +
      '<path d="M56 30 Q42 52 35 86" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>' +
      '<path d="M22 13 H82 V19 Q52 20 22 26 Z" fill="#fff" opacity=".3"/>' +
      '<path d="M84 4 L86.2 10.8 L93 13 L86.2 15.2 L84 22 L81.8 15.2 L75 13 L81.8 10.8 Z" fill="#fff"/>';
  }
  function barArt() {
    const g = 'starwing-g-bar';
    return '<defs><linearGradient id="' + g + '-t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffe07a"/><stop offset="1" stop-color="#f0b020"/></linearGradient>' +
      '<linearGradient id="' + g + '-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd84a"/><stop offset=".5" stop-color="#f0a400"/><stop offset="1" stop-color="#8a5200"/></linearGradient>' +
      '<linearGradient id="' + g + '-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b87200"/><stop offset="1" stop-color="#ffcc3a"/></linearGradient></defs>' +
      '<path d="' + pd(BARO) + '" transform="translate(1.6 4.2)" fill="#02010a" opacity=".45"/>' +
      '<path d="M26 26 L74 26 L82 40 L18 40 Z" fill="url(#' + g + '-t)"/>' +
      '<path d="M18 40 L82 40 L96 74 L4 74 Z" fill="url(#' + g + '-f)"/>' +
      '<path d="M4 74 L18 40 L26 26 L22 40 L10 72 Z" fill="url(#' + g + '-s)" opacity=".75"/>' +
      '<path d="M96 74 L82 40 L74 26 L78 40 L90 72 Z" fill="#7a4600" opacity=".55"/>' +
      '<path d="M4 74 L96 74 L94 80 L6 80 Z" fill="#6b3c00"/>' +
      '<g transform="translate(50.8 58.3) scale(.4) translate(-60 -29)"><path d="' + BATP + '" fill="#fff3b0" opacity=".7"/></g>' +
      '<g transform="translate(50 57.5) scale(.4) translate(-60 -29)"><path d="' + BATP + '" fill="#7a4300"/></g>' +
      '<path d="M28 29 L50 29 L46 37 L22 37 Z" fill="#fff" opacity=".65"/>' +
      '<path d="M24 44 L36 44 L26 70 L12 70 Z" fill="#fff" opacity=".22"/>' +
      '<path d="' + pd(BARO) + '" fill="none" stroke="#4a2800" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M26 26 L74 26 L82 40 L18 40 Z" fill="none" stroke="#fffbe6" stroke-width="1" stroke-opacity=".7" stroke-linejoin="round"/>';
  }
  const ART = { wild: wildArt(), bar: barArt(), seven: sevenArt() };
  for (const k of ['violet', 'blue', 'orange', 'green', 'yellow']) ART[k] = gem(k, SHAPE[k][0], SHAPE[k][1], PAL[k], SHAPE[k][2]);
  /* silhouettes (for masks: the shine sweep only ever lights the symbol itself) */
  const SIL = { wild: pd(WILDP), bar: pd(BARO), seven: SEVENP };
  for (const k of ['violet', 'blue', 'orange', 'green', 'yellow']) SIL[k] = pd(SHAPE[k][0]);
  /* where each symbol's sparkle sits (in % of its box) */
  const GLINT = { wild: [50, 4], bar: [30, 28], seven: [86, 14], violet: [32, 22], blue: [30, 24], orange: [36, 24], green: [26, 18], yellow: [42, 26] };

  function spriteSvg() {
    let s = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<filter id="starwing-mb" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0 6"/></filter></defs>';
    for (const k in ART) s += '<symbol id="starwing-s-' + k + '" viewBox="0 0 100 100">' + ART[k] + '</symbol>';
    return s + '</svg>';
  }
  function maskCss() {
    let css = '';
    for (const k in SIL) {
      const uri = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="' + SIL[k] + '" stroke="#000" stroke-width="' + (k === 'seven' ? 12 : 2) + '" stroke-linejoin="round"/></svg>') + '")';
      css += '.g-starwing .sw-cell[data-s="' + k + '"]{--gl:' + GLOW[k] + ';--gx:' + GLINT[k][0] + '%;--gy:' + GLINT[k][1] + '%}';
      css += '.g-starwing .sw-cell[data-s="' + k + '"] .shine{-webkit-mask-image:' + uri + ';mask-image:' + uri + '}';
    }
    return css;
  }
  const useSym = (k) => '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#starwing-s-' + k + '"/></svg>';

  /* the mascot: Starwing herself, a small cosmic bat with star-tipped wings */
  const WING = '<path d="M58 52 C46 34 24 24 4 32 C11 38 13 46 11 55 C19 51 26 53 29 61 C34 55 41 55 45 63 C49 57 54 57 58 61 Z" fill="url(#starwing-g-mw)" stroke="#120634" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M57 54 L12 36 M56 57 L27 58 M56 59 L43 62" stroke="#8d6bff" stroke-width="1" opacity=".55" fill="none"/>' +
    '<circle cx="24" cy="40" r=".9" fill="#fff" opacity=".8"/><circle cx="36" cy="47" r=".7" fill="#fff" opacity=".7"/><circle cx="18" cy="48" r=".6" fill="#fff" opacity=".6"/>' +
    '<path d="M4 25 L5.6 30.4 L11 32 L5.6 33.6 L4 39 L2.4 33.6 L-3 32 L2.4 30.4 Z" fill="#ffd257" class="tip"/>';
  const MASCOT = '<svg viewBox="-6 0 152 112" aria-hidden="true"><defs>' +
    '<linearGradient id="starwing-g-mw" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b27a8"/><stop offset="1" stop-color="#1d0b52"/></linearGradient>' +
    '<radialGradient id="starwing-g-mb" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#7a52ec"/><stop offset=".6" stop-color="#3d1c9a"/><stop offset="1" stop-color="#1e0a55"/></radialGradient></defs>' +
    '<g class="mb">' +
    '<g class="wl">' + WING + '</g><g transform="translate(140 0) scale(-1 1)"><g class="wr">' + WING + '</g></g>' +
    '<path d="M56 30 L51 6 L65 23 Z M84 30 L89 6 L75 23 Z" fill="url(#starwing-g-mb)" stroke="#120634" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M57 26 L54 13 L62 23 Z M83 26 L86 13 L78 23 Z" fill="#ff7ad9" opacity=".7"/>' +
    '<ellipse cx="70" cy="66" rx="19" ry="21" fill="url(#starwing-g-mb)" stroke="#120634" stroke-width="1.6"/>' +
    '<ellipse cx="70" cy="71" rx="11" ry="12" fill="#9b7bff" opacity=".35"/>' +
    '<path d="M70 64 L71.6 68.4 L76 70 L71.6 71.6 L70 76 L68.4 71.6 L64 70 L68.4 68.4 Z" fill="#ffd257"/>' +
    '<circle cx="70" cy="40" r="19" fill="url(#starwing-g-mb)" stroke="#120634" stroke-width="1.6"/>' +
    '<g class="eyes"><ellipse cx="62.5" cy="40" rx="5.8" ry="6.8" fill="#fff"/><ellipse cx="77.5" cy="40" rx="5.8" ry="6.8" fill="#fff"/>' +
    '<g class="pup"><circle cx="63.6" cy="41.2" r="3.4" fill="#1a0b2e"/><circle cx="78.6" cy="41.2" r="3.4" fill="#1a0b2e"/><circle cx="64.8" cy="39.6" r="1.3" fill="#fff"/><circle cx="79.8" cy="39.6" r="1.3" fill="#fff"/></g></g>' +
    '<g class="lid"><path d="M56.3 33 h12.4 v14 h-12.4 Z M71.3 33 h12.4 v14 h-12.4 Z" fill="#3d1c9a"/><path d="M56.5 46.6 Q62.5 49 68.5 46.6 M71.5 46.6 Q77.5 49 83.5 46.6" stroke="#120634" stroke-width="1.2" fill="none"/></g>' +
    '<ellipse cx="57.5" cy="49" rx="3.6" ry="2.2" fill="#ff5fc8" opacity=".55"/><ellipse cx="82.5" cy="49" rx="3.6" ry="2.2" fill="#ff5fc8" opacity=".55"/>' +
    '<g class="smile"><path d="M64 50.5 Q70 56 76 50.5" fill="none" stroke="#120634" stroke-width="1.8" stroke-linecap="round"/><path d="M66 52.4 L67.2 55.6 L68.4 53.2 Z M71.6 53.2 L72.8 55.6 L74 52.4 Z" fill="#fff"/></g>' +
    '<ellipse class="oh" cx="70" cy="53" rx="3.2" ry="3.8" fill="#120634"/>' +
    '<path d="M62 86 l-2 6 M66 87 l0 6 M74 87 l0 6 M78 86 l2 6" stroke="#120634" stroke-width="2.2" stroke-linecap="round"/>' +
    '</g></svg>';

  const POSTER = (function () {
    let st = ''; for (let i = 0; i < 80; i++) st += '<circle cx="' + ((i * 97) % 320) + '" cy="' + ((i * 53) % 400) + '" r="' + (i % 7 ? 0.9 : 1.8) + '" fill="#fff" opacity="' + (0.3 + (i % 5) * 0.14).toFixed(2) + '"/>';
    const art = (k) => ART[k].replace(/starwing-g-/g, 'swp-g-');
    const g = (k, x, y, s, r) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + (r || 0) + ') scale(' + s + ') translate(-50 -50)">' + art(k) + '</g>';
    let gal = ''; for (let i = 0; i < 260; i++) { const t = Math.pow((i * 0.618) % 1, 0.8), arm = i % 2, r = 6 + t * 120, a = arm * Math.PI + t * 5 + Math.sin(i * 12.9) * 0.3; gal += '<circle cx="' + (Math.cos(a) * r).toFixed(1) + '" cy="' + (Math.sin(a) * r * 0.42).toFixed(1) + '" r="' + (0.6 + (i % 3) * 0.4) + '" fill="' + (t < 0.3 ? '#ffe3b8' : i % 3 ? '#b9a4ff' : '#7fe6ff') + '" opacity="' + (0.35 + (i % 4) * 0.15) + '"/>'; }
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="swp-bg" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="#3a1f8a"/><stop offset=".5" stop-color="#140c45"/><stop offset="1" stop-color="#05061a"/></radialGradient>' +
      '<radialGradient id="swp-neb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".55"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="swp-neb2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3ef0ff" stop-opacity=".45"/><stop offset="1" stop-color="#3ef0ff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="swp-core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6dc"/><stop offset=".3" stop-color="#ffd9a0" stop-opacity=".7"/><stop offset="1" stop-color="#ff9ad6" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="swp-ray" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#ffd257" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="320" height="400" fill="url(#swp-bg)"/><ellipse cx="90" cy="120" rx="150" ry="90" fill="url(#swp-neb)"/><ellipse cx="250" cy="260" rx="140" ry="100" fill="url(#swp-neb2)"/>' + st +
      '<g transform="translate(160 150) rotate(-14)"><ellipse rx="70" ry="30" fill="url(#swp-core)"/>' + gal + '</g>' +
      '<circle cx="270" cy="42" r="22" fill="#fff6dc"/><circle cx="262" cy="36" r="4" fill="#e8dcb8"/><circle cx="276" cy="50" r="3" fill="#e8dcb8"/>' +
      '<g transform="translate(160 236)"><circle r="96" fill="url(#swp-ray)" opacity=".55"/><g opacity=".55">' + [0, 45, 90, 135].map((a) => '<rect x="-2.5" y="-140" width="5" height="280" fill="#ffd257" opacity=".4" transform="rotate(' + a + ')"/>').join('') + '</g>' +
      '<g transform="scale(1.3) translate(-50 -50)">' + art('wild') + '</g></g>' +
      g('violet', 58, 300, 0.56, -12) + g('blue', 262, 300, 0.54, 8) + g('green', 92, 360, 0.46, 10) + g('orange', 228, 362, 0.48, -6) + g('yellow', 160, 372, 0.4, 4) +
      '<text x="160" y="76" text-anchor="middle" font-family="Monoton, Bungee, Impact, sans-serif" font-size="42" fill="#fff" stroke="#ff4fd8" stroke-width="1.2" letter-spacing="2">STARWING</text>' +
      '<text x="160" y="98" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="15" fill="#ffd257" letter-spacing="5">PAYS BOTH WAYS</text>' +
      '</svg>';
  })();

  /* ================= sound: Starwing's own kit (all synthesised) ================= */
  const A = () => B.audio;
  const SND = {
    spin() { A().noise({ d: 0.34, v: 0.07, lp: 380, f2: 4200 }); A().tone({ f: 150, f2: 520, d: 0.24, type: 'sine', v: 0.07 }); A().tone({ f: 1500, f2: 2600, d: 0.07, type: 'triangle', v: 0.03 }); },
    stop(i) { A().tone({ f: 132 + i * 7, f2: 50, d: 0.16, type: 'sine', v: 0.36 }); A().tone({ f: 2300 - i * 110, f2: 900, d: 0.035, type: 'triangle', v: 0.05 }); A().noise({ d: 0.06, v: 0.08, lp: 1300 }); },
    antic() { A().tone({ f: 220, f2: 990, d: 1.35, type: 'sawtooth', v: 0.03, a: 0.35 }); A().tone({ f: 330, f2: 1480, d: 1.35, type: 'sine', v: 0.05, a: 0.35 }); A().noise({ d: 1.3, v: 0.035, hp: 900, f2: 8000 }); },
    wildLand() { A().seq([1319, 1760, 2093, 2637], { step: 0.045, type: 'sine', v: 0.09 }); A().tone({ f: 110, f2: 46, d: 0.32, type: 'sine', v: 0.36 }); A().noise({ d: 0.3, v: 0.05, hp: 5000 }); },
    charge() { A().tone({ f: 140, f2: 900, d: 0.42, type: 'sawtooth', v: 0.04, a: 0.25 }); A().noise({ d: 0.42, v: 0.06, lp: 300, f2: 5000 }); },
    burst() { A().noise({ d: 0.6, v: 0.12, hp: 700, f2: 10000 }); A().tone({ f: 190, f2: 1600, d: 0.5, type: 'sawtooth', v: 0.035 }); A().tone({ f: 74, f2: 34, d: 0.45, type: 'sine', v: 0.34 }); A().seq([1568, 2093, 2637, 3136], { step: 0.05, type: 'sine', v: 0.05, t: 0.12 }); },
    roll(i) { A().tone({ f: 1250 + i * 45, d: 0.02, type: 'square', v: 0.026 }); },
    mult(m) {
      const f = [0, 784, 988, 1175, 0, 1568][m] || 784;
      A().tone({ f, d: 0.6, type: 'sine', v: 0.16 }); A().tone({ f: f * 2.01, d: 0.35, type: 'sine', v: 0.05 }); A().tone({ f: f * 3.02, d: 0.2, type: 'sine', v: 0.025 });
      if (m >= 2) A().seq([f, f * 1.25, f * 1.5, [f * 2, 3]], { step: 0.055, type: 'triangle', v: 0.07, t: 0.08 });
      if (m >= 5) { A().tone({ f: 98, f2: 44, d: 0.6, type: 'sine', v: 0.38 }); A().noise({ d: 0.7, v: 0.06, hp: 4000, f2: 12000 }); }
    },
    beam(i) { const f = 523 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21][i % 10] / 12); A().tone({ f, f2: f * 1.5, d: 0.2, type: 'sine', v: 0.07 }); A().tone({ f: f * 2, d: 0.14, type: 'triangle', v: 0.025, t: 0.03 }); },
    win(k) { const n = [[523, 659, 784], [523, 659, 784, 1047], [587, 740, 880, 1175, [1480, 2]], [523, 659, 784, 1047, 1319, [1568, 3]]][Math.min(3, k)]; A().seq(n, { step: 0.07, type: 'triangle', v: 0.12 }); A().seq(n.map((x) => (Array.isArray(x) ? [x[0] * 2, x[1]] : x * 2)), { step: 0.07, type: 'sine', v: 0.03, t: 0.02 }); },
    tick() { A().tone({ f: 2600, d: 0.012, type: 'square', v: 0.022 }); },
    respin() { A().tone({ f: 200, f2: 880, d: 0.55, type: 'sawtooth', v: 0.035, a: 0.2 }); A().noise({ d: 0.55, v: 0.05, lp: 300, f2: 6000 }); A().seq([392, 523, 659, [784, 2]], { step: 0.075, type: 'triangle', v: 0.07, t: 0.28 }); },
    feature() {
      A().tone({ f: 65, f2: 40, d: 0.9, type: 'sine', v: 0.38 }); A().noise({ d: 1, v: 0.06, hp: 3000, f2: 12000 });
      for (const f of [262, 330, 392, 523]) { A().tone({ f, d: 1.4, type: 'sawtooth', v: 0.022, a: 0.12 }); A().tone({ f: f * 1.007, d: 1.4, type: 'sawtooth', v: 0.018, a: 0.12 }); }
      A().seq([523, 659, 784, 1047, 1319, [1568, 3]], { step: 0.06, type: 'sine', v: 0.07, t: 0.25 });
    },
    novaCharge() { A().tone({ f: 60, f2: 1200, d: 1.15, type: 'sawtooth', v: 0.045, a: 0.6 }); A().noise({ d: 1.15, v: 0.09, lp: 150, f2: 7000 }); A().tone({ f: 40, f2: 80, d: 1.1, type: 'sine', v: 0.25, a: 0.5 }); },
    boom() {
      A().tone({ f: 76, f2: 26, d: 1.5, type: 'sine', v: 0.6 }); A().noise({ d: 1.4, v: 0.42, lp: 1100, f2: 60 }); A().noise({ d: 0.28, v: 0.24, hp: 2500 });
      for (const f of [262, 330, 392, 523, 659]) { A().tone({ f, d: 2.2, type: 'sawtooth', v: 0.02, a: 0.08, t: 0.08 }); A().tone({ f: f * 1.006, d: 2.2, type: 'triangle', v: 0.03, a: 0.08, t: 0.08 }); }
      A().seq([1047, 1319, 1568, 2093, 2637, 3136, [4186, 4]], { step: 0.05, type: 'sine', v: 0.05, t: 0.35 });
    },
    sum() { A().seq([523, 659, 784, [1047, 4]], { step: 0.09, type: 'triangle', v: 0.12 }); A().seq([262, 0, 392, [523, 4]], { step: 0.09, type: 'sine', v: 0.1 }); },
    tier(k) { A().seq(k ? [523, 659, 784, 1047, 784, 1047, [1319, 4]] : [523, 659, 784, [1047, 3]], { step: 0.085, type: 'square', v: 0.06 }); A().noise({ d: 0.6, v: 0.04, hp: 6000 }); },
    miss() { A().tone({ f: 196, f2: 150, d: 0.16, type: 'triangle', v: 0.035 }); },
    btn() { A().tone({ f: 880, f2: 1320, d: 0.05, type: 'sine', v: 0.06 }); },
  };
  const snd = (k, a) => { try { SND[k](a); } catch (e) { /* audio is optional */ } };

  /* ================= DOM ================= */
  const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function makeCell() {
    const c = document.createElement('div'); c.className = 'sw-cell';
    c.innerHTML = '<div class="sym"><svg viewBox="0 0 100 100" aria-hidden="true"><use/></svg><i class="shine"></i><i class="glint"></i></div>';
    c._use = c.querySelector('use'); c._s = -1;
    c.style.setProperty('--gd', (-Math.random() * 7).toFixed(2) + 's');
    return c;
  }
  function setSym(c, s) { if (c._s === s) return; c._s = s; c._use.setAttribute('href', '#starwing-s-' + KEYS[s]); c.dataset.s = KEYS[s]; }

  function mount(el, Bt) {
    B = Bt; h = B.h; S = B.scope(); root = el; busy = false; skipping = false; slam = false; turbo = false; auto = 0; devNext = null; reels = []; cycleTok = 0; warpBoost = 0;
    RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    try { DEV = !B.online && localStorage.getItem('batty-dev') === '1'; } catch (e) { DEV = false; }
    root.innerHTML = spriteSvg() + '<style>' + maskCss() + '</style>';
    E = {};
    /* ---- the sky ---- */
    E.neb = h('canvas', { class: 'sw-neb' }); E.gal = h('canvas', { class: 'sw-gal' }); E.stars = h('canvas', { class: 'sw-stars' });
    E.nebW = h('div', { class: 'sw-nebw' }, E.neb);
    E.galW = h('div', { class: 'sw-galw' }, h('div', { class: 'sw-galt' }, E.gal));
    E.moon = h('div', { class: 'sw-moon', html: '<svg viewBox="0 0 120 120"><defs><radialGradient id="starwing-g-moon" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#fffdf2"/><stop offset=".6" stop-color="#f2e6c4"/><stop offset="1" stop-color="#b8a6d8"/></radialGradient><radialGradient id="starwing-g-mglow" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#ffe9b0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></radialGradient></defs><circle cx="60" cy="60" r="60" fill="url(#starwing-g-mglow)"/><circle cx="60" cy="60" r="33" fill="url(#starwing-g-moon)"/><circle cx="50" cy="50" r="6" fill="#d9c9a4" opacity=".55"/><circle cx="70" cy="66" r="8" fill="#d9c9a4" opacity=".45"/><circle cx="58" cy="78" r="4" fill="#d9c9a4" opacity=".5"/><circle cx="74" cy="46" r="3" fill="#d9c9a4" opacity=".5"/><path d="M40 82 A33 33 0 0 0 93 60 A30 30 0 0 1 40 82Z" fill="#6b4fb0" opacity=".25"/></svg>' });
    E.bats = h('div', { class: 'sw-bats', html: [0, 1, 2].map((i) => '<i style="--i:' + i + '"><svg viewBox="0 0 120 40"><path d="' + BATP + '" fill="#0b0624"/></svg></i>').join('') });
    E.flash = h('div', { class: 'sw-flash' });
    E.bg = h('div', { class: 'sw-bg', 'aria-hidden': 'true' }, E.nebW, E.galW, E.moon, E.stars, E.bats, E.flash);
    /* ---- title, mascot and the feature HUD ---- */
    E.mascot = h('div', { class: 'sw-mascot', html: MASCOT });
    E.logo = h('div', { class: 'sw-logo' }, E.mascot, h('div', { class: 'tx' }, h('b', null, 'Starwing'), h('small', null, 'Pays both ways · Bat Star re-spins')));
    E.hudPips = h('span', { class: 'pips' }, h('i'), h('i'), h('i'));
    E.hudN = h('b', null, '1'); E.hudX = h('b', null, '×1'); E.hudW = h('b', null, '0');
    E.hud = h('div', { class: 'sw-hud', 'aria-hidden': 'true' },
      h('div', { class: 'c' }, h('small', null, 'Re-spin'), E.hudN, E.hudPips),
      h('div', { class: 'c x' }, h('small', null, 'Wild power'), E.hudX),
      h('div', { class: 'c w' }, h('small', null, 'Feature win'), E.hudW));
    E.top = h('div', { class: 'sw-top' }, E.logo, E.hud);
    /* ---- the machine ---- */
    E.reelsBox = h('div', { class: 'sw-reels' });
    for (let r = 0; r < R; r++) {
      const track = h('div', { class: 'sw-track' }), cells = [];
      for (let k = 0; k < POOL; k++) { const c = makeCell(); cells.push(c); track.append(c); }
      const wild = h('div', { class: 'sw-wild', hidden: true, html: '<i class="neb"></i><i class="rays"></i><i class="pillar"></i><i class="frame"></i><i class="run"></i>' +
        '<i class="mote" style="--m:0"></i><i class="mote" style="--m:1"></i><i class="mote" style="--m:2"></i><i class="mote" style="--m:3"></i><i class="mote" style="--m:4"></i>' +
        '<div class="star">' + useSym('wild') + '</div><b class="tagw">Wild</b><div class="mx"><div class="mxr"><div class="mxs"></div></div></div>' });
      const reelEl = h('div', { class: 'sw-reel' }, track, wild, h('i', { class: 'ant' }));
      E.reelsBox.append(reelEl);
      reels.push({ i: r, el: reelEl, track, cells, wild, stop: 0, p: 0, b: null, off: 0, bnd: -1e9, st: 'idle', v: 0, held: false, target: null, blur: false });
    }
    E.lines = svgEl('svg', { class: 'sw-lines', viewBox: '0 0 500 300', 'aria-hidden': 'true' });
    E.beams = h('div', { class: 'sw-beams', 'aria-hidden': 'true' });
    E.tag = h('div', { class: 'sw-tag', hidden: true });
    E.banner = h('div', { class: 'sw-banner', hidden: true, 'aria-hidden': 'true' });
    E.tier = h('div', { class: 'sw-tier', hidden: true, 'aria-hidden': 'true' });
    E.sum = h('div', { class: 'sw-sum', hidden: true });
    E.window = h('div', { class: 'sw-window' }, E.reelsBox, E.lines, E.beams, E.tag, E.banner, E.tier, E.sum);
    E.gutL = h('div', { class: 'sw-gut l' }); E.gutR = h('div', { class: 'sw-gut r' });
    lineIdx = [[], []];
    for (let l = 0; l < M.LINES.length; l++) {
      lineIdx[0].push(h('i', { 'data-l': l, style: '--c:' + LINE_COL[l] }, String(l + 1)));
      lineIdx[1].push(h('i', { 'data-l': l, style: '--c:' + LINE_COL[l] }, String(l + 1)));
    }
    for (let row = 0; row < 3; row++) {
      const gl = h('div', { class: 'grp' }), gr = h('div', { class: 'grp' });
      M.LINES.forEach((ln, l) => { if (ln[0] === row) gl.append(lineIdx[0][l]); if (ln[4] === row) gr.append(lineIdx[1][l]); });
      E.gutL.append(gl); E.gutR.append(gr);
    }
    const corner = (k, c) => h('i', { class: 'cg ' + c, html: useSym(k) });
    E.machine = h('div', { class: 'sw-machine' }, h('i', { class: 'rim' }), h('i', { class: 'leds t' }), h('i', { class: 'leds b' }),
      corner('violet', 'tl'), corner('blue', 'tr'), corner('green', 'bl'), corner('orange', 'br'), E.gutL, E.window, E.gutR);
    /* ---- win bar ---- */
    E.win = h('output', { 'aria-label': 'Win' }, '0');
    E.msg = h('span', { class: 'msg', role: 'status', 'aria-live': 'polite' }, 'Ten lines, both ways. Catch a Bat Star.');
    E.winbar = h('div', { class: 'sw-winbar' }, h('div', { class: 'w' }, h('small', null, 'Win'), E.win), E.msg);
    /* ---- side panels (wide screens) ---- */
    E.left = h('aside', { class: 'sw-side l' }, h('h3', null, 'The Bat Star'),
      h('div', { class: 'tip', html: useSym('wild') + '<p>Lands on reels <b>2, 3 and 4</b> and <b>expands</b> to fill its reel.</p>' }),
      h('div', { class: 'tip mults', html: '<div class="mx"><b>×1</b><b>×2</b><b>×3</b><b>×5</b></div><p>Each expanded wild rolls a <b>multiplier</b>. Lines through more than one wild multiply them together, up to <b>×125</b>.</p>' }),
      h('div', { class: 'tip', html: '<div class="rs"><i></i><i></i><i></i></div><p>The wild is <b>held</b> and the other reels <b>re-spin</b>. Every new wild gives another re-spin, up to 3.</p>' }),
      h('div', { class: 'tip nova', html: '<p><b>Supernova:</b> reels 2, 3 and 4 all wild at once.</p>' }),
      h('div', { class: 'keys', html: '<b>Space</b> spin / stop <b>T</b> turbo <b>A</b> auto' }));
    E.pays = h('div', { class: 'pays' });
    for (let s = SYM.BAR; s <= SYM.YELLOW; s++) E.pays.append(h('div', { class: 'pr' }, h('span', { class: 'ic', html: useSym(KEYS[s]) }), h('span', { class: 'v', 'data-s': s })));
    E.right = h('aside', { class: 'sw-side r' }, h('h3', null, 'Paytable', h('small', null, '5 · 4 · 3 of a kind, either way')), E.pays);
    /* ---- controls ---- */
    const stakeBox = h('div', { class: 'sw-stakebox' });
    stakeCtl = B.ui.stake(stakeBox, { id: ID, label: 'Stake · 10 lines', onChange: paintStake });
    E.spin = h('button', { class: 'sw-spin', type: 'button', id: 'starwing-spin', 'aria-label': 'Spin', onclick: primary,
      html: '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="starwing-g-btn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ef0ff"/><stop offset=".5" stop-color="#a24dff"/><stop offset="1" stop-color="#ff4fd8"/></linearGradient>' +
        '<radialGradient id="starwing-g-btnc" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#2a1a7a"/><stop offset="1" stop-color="#07061f"/></radialGradient></defs>' +
        '<circle cx="50" cy="50" r="48" fill="url(#starwing-g-btn)"/><circle cx="50" cy="50" r="41" fill="url(#starwing-g-btnc)"/><circle cx="50" cy="50" r="41" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1"/>' +
        '<g class="ring"><path d="M50 13 L54.5 43.5 L85 50 L54.5 56.5 L50 87 L45.5 56.5 L15 50 L45.5 43.5 Z" fill="#ffd257"/><path d="M50 26 L52 48 L74 50 L52 52 L50 74 L48 52 L26 50 L48 48 Z" fill="#fffbe0" opacity=".85" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="6.5" fill="#fffbe0"/></g>' +
        '<rect class="stopi" x="37" y="37" width="26" height="26" rx="5" fill="#fff"/></svg>' });
    E.autoBtn = h('button', { class: 'sw-btn', type: 'button', id: 'starwing-auto', 'aria-label': 'Autoplay', onclick: autoClick }, h('b', null, 'Auto'), h('small', null, 'off'));
    E.turboBtn = h('button', { class: 'sw-btn', type: 'button', id: 'starwing-turbo', 'aria-label': 'Turbo', 'aria-pressed': 'false', onclick: toggleTurbo }, h('b', null, 'Turbo'), h('small', null, 'off'));
    E.autoMenu = buildAutoMenu();
    E.ctl = h('div', { class: 'sw-ctl' }, h('div', { class: 'l' }, stakeBox), h('div', { class: 'm' }, E.spin), h('div', { class: 'r' }, E.autoBtn, E.turboBtn), E.autoMenu);
    E.wrap = h('div', { class: 'sw-wrap' }, E.left, E.top, E.machine, E.winbar, E.right, E.ctl);
    /* ---- overlays: feature title card, Supernova, effects ---- */
    E.card = h('div', { class: 'sw-card', hidden: true, 'aria-hidden': 'true' });
    E.nova = h('div', { class: 'sw-nova', hidden: true, 'aria-hidden': 'true', html: '<i class="dim"></i><i class="rays"></i><i class="core"></i><i class="flash"></i><div class="t"><b data-t="Supernova">Supernova</b><small class="sub"></small></div>' });
    E.fx = h('canvas', { class: 'sw-fx', 'aria-hidden': 'true' });
    root.append(E.bg, E.wrap, E.card, E.nova, E.fx);

    for (const Rl of reels) { Rl.stop = Math.floor(Math.random() * M.STRIPS[Rl.i].length); Rl.p = Rl.stop; renderReel(Rl, true); }
    paintStake(); paintCtl();
    buildSky();
    fxs = { list: [], spr: new Map(), ctx: E.fx.getContext('2d'), dpr: 1, w: 0, h: 0, on: false };
    const ro = new ResizeObserver(layout); ro.observe(root); S._ro = ro; layout();
    S.on(document, 'keydown', onKey);
    S.on(E.window, 'pointerdown', () => { if (busy) hurry(); });
    S.on(E.card, 'pointerdown', () => { if (busy) hurry(); });
    S.on(root, 'pointermove', (e) => { if (e.pointerType !== 'mouse') return; par.mouse = true; par.tx = (e.clientX / innerWidth - 0.5) * 2; par.ty = (e.clientY / innerHeight - 0.5) * 2; });
    S.on(window, 'resize', sizeFx);
    S.loop(frame);
    idleLife();
    if (DEV) {
      devLog = { rounds: 0, staked: 0, won: 0, start: B.wallet.balance, respins: 0 };
      const held3 = (o) => [1, 2, 3].every((r) => o.steps.some((x) => x.newWild.indexOf(r) >= 0));
      const PRE = {
        wild: (o) => o.steps.length > 1,
        respins: (o) => o.steps.length > 2,
        nova: held3,
        win: (o) => o.steps.length === 1 && o.steps[0].wins.length > 1,
        big: (o) => o.totalWin >= 10 * U,
        nice: (o) => o.steps.length === 1 && o.totalWin >= 3 * U && o.totalWin < 10 * U,
        mult: (o) => o.steps.some((s) => s.newWild.some((r) => s.mult[r] >= 3)),
        antic: (o) => o.steps.some((s, k) => k === 0 && s.newWild.length === 2 && s.newWild.indexOf(1) >= 0 && s.newWild.indexOf(2) >= 0),
      };
      window.__starwingDev = {
        next(pred) { if (typeof pred === 'string') pred = PRE[pred]; devNext = () => { for (let i = 0; i < 3000000; i++) { const o = M.spin(B.rng); if (pred(o)) return o; } return M.spin(B.rng); }; },
        spin() { if (!busy) round(); }, get reels() { return reels; }, set speed(v) { devSpeed = v; }, get speed() { return devSpeed; }, get log() { return devLog; }, get busy() { return busy; }, M,
      };
    }
  }
  function unmount() {
    if (S) { if (S._ro) S._ro.disconnect(); S.dispose(); }
    if (window.__starwingDev) delete window.__starwingDev;
    E = null; root = null; reels = null; sky = null; fxs = null;
  }

  /* ---------- layout: three shapes (wide desktop, portrait, landscape phone); the machine is sized to fit ---------- */
  function layout() {
    if (!E) return;
    const w = root.clientWidth, hh = root.clientHeight;
    const mode = w >= 1100 && hh >= 560 ? 'wide' : (w > hh * 1.3 && hh < 640) ? 'land' : 'port';
    root.classList.toggle('wide', mode === 'wide'); root.classList.toggle('land', mode === 'land'); root.classList.toggle('port', mode === 'port');
    const topH = E.top.offsetHeight, winH = E.winbar.offsetHeight, ctlH = E.ctl.offsetHeight;
    let aw, ah, gut;
    if (mode === 'wide') { aw = w - 2 * 250 - 2 * 22 - 48; ah = hh - topH - winH - ctlH - 44; gut = 70; }
    else if (mode === 'land') { aw = w - E.top.offsetWidth - E.ctl.offsetWidth - 36; ah = hh - winH - 26; gut = 62; }
    else { aw = w - 14; ah = hh - topH - winH - ctlH - 40; gut = w < 560 ? 50 : 70; }
    const mw = Math.max(250, Math.min(aw, 920, (ah - 26) * 5 / 3 + gut));
    root.style.setProperty('--mw', Math.floor(mw) + 'px');
    geo.w = E.window.clientWidth || 500; geo.h = E.window.clientHeight || 300;
    E.lines.setAttribute('viewBox', '0 0 ' + geo.w + ' ' + geo.h);
    root.style.setProperty('--bw', Math.max(3, geo.h / 3 * 0.075).toFixed(1) + 'px');
    sizeStars(); sizeFx();
  }

  /* ================= the sky: nebula + galaxy (painted once), starfield (live), parallax ================= */
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function buildSky() {
    const rnd = seeded(1987);
    /* nebula: hundreds of soft puffs, a few dark dust lanes and baked star dust */
    const nb = E.neb, W = 720, H = 450; nb.width = W; nb.height = H; const c = nb.getContext('2d');
    const bg = c.createRadialGradient(W * 0.5, H * 0.3, 10, W * 0.5, H * 0.4, W * 0.75);
    bg.addColorStop(0, '#22106a'); bg.addColorStop(0.45, '#100845'); bg.addColorStop(1, '#03031a');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const puff = (x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.29); c.fill(); };
    c.globalCompositeOperation = 'lighter';
    const clouds = [[0.16, 0.22, 0.42, '255,60,200', 0.11], [0.62, 0.12, 0.3, '150,70,255', 0.12], [0.88, 0.55, 0.42, '40,220,255', 0.08], [0.45, 0.92, 0.4, '255,170,70', 0.07], [0.3, 0.62, 0.34, '90,70,255', 0.09], [0.78, 0.9, 0.3, '255,70,160', 0.07], [0.05, 0.8, 0.3, '60,140,255', 0.08]];
    for (const [cx, cy, rr, rgb, a] of clouds) for (let i = 0; i < 34; i++) { const ang = rnd() * 6.28, d = Math.pow(rnd(), 0.7) * rr * W * 0.5; puff(cx * W + Math.cos(ang) * d, cy * H + Math.sin(ang) * d * 0.6, (0.12 + rnd() * 0.22) * rr * W, rgb, a * (0.4 + rnd())); }
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 16; i++) puff(rnd() * W, rnd() * H, 30 + rnd() * 90, '3,2,18', 0.32);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 1300; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.05 + rnd() * 0.35).toFixed(2) + ')'; c.fillRect(rnd() * W, rnd() * H, rnd() < 0.08 ? 1.6 : 0.8, rnd() < 0.08 ? 1.6 : 0.8); }
    c.globalCompositeOperation = 'source-over';
    /* galaxy: two arms of stars, glowing knots and a warm core */
    const gv = E.gal, G = 600, g = gv.getContext('2d'); gv.width = G; gv.height = G;
    const gc = G / 2;
    const core = g.createRadialGradient(gc, gc, 0, gc, gc, G * 0.24); core.addColorStop(0, 'rgba(255,250,235,1)'); core.addColorStop(0.18, 'rgba(255,224,170,.75)'); core.addColorStop(0.5, 'rgba(255,140,200,.18)'); core.addColorStop(1, 'rgba(120,80,255,0)');
    g.fillStyle = core; g.fillRect(0, 0, G, G);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3200; i++) {
      const t = Math.pow(rnd(), 0.75), arm = i % 2, rr = 12 + t * G * 0.44;
      const a = arm * Math.PI + t * 5.4 + (rnd() - 0.5) * 0.75 * (1.15 - t * 0.6), j = (rnd() - 0.5) * 22 * t;
      const x = gc + Math.cos(a) * (rr + j), y = gc + Math.sin(a) * (rr + j);
      const colr = t < 0.22 ? '255,226,180' : rnd() < 0.55 ? '185,160,255' : '120,225,255';
      g.fillStyle = 'rgba(' + colr + ',' + (0.25 + rnd() * 0.6).toFixed(2) + ')';
      const sz = 0.6 + rnd() * 1.5 * (1 - t * 0.5); g.fillRect(x, y, sz, sz);
      if (rnd() < 0.05) { const kg = g.createRadialGradient(x, y, 0, x, y, 6 + rnd() * 10); kg.addColorStop(0, rnd() < 0.5 ? 'rgba(255,90,200,.35)' : 'rgba(120,200,255,.3)'); kg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = kg; g.fillRect(x - 16, y - 16, 32, 32); }
      if (rnd() < 0.12) { const kg = g.createRadialGradient(x, y, 0, x, y, 18); kg.addColorStop(0, 'rgba(150,120,255,.06)'); kg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = kg; g.fillRect(x - 18, y - 18, 36, 36); }
    }
    g.globalCompositeOperation = 'source-over';
    sky = { stars: [], W: 0, H: 0, dpr: 1, warp: 0.02, shoot: null, ctx: E.stars.getContext('2d') };
  }
  function sizeStars() {
    if (!sky) return;
    const cv = E.stars, W = root.clientWidth, H = root.clientHeight; if (W === sky.W && H === sky.H) return;
    sky.dpr = Math.min(1.5, devicePixelRatio || 1); sky.W = W; sky.H = H; cv.width = W * sky.dpr; cv.height = H * sky.dpr;
    const n = Math.round(Math.min(280, (W * H) / 3400)); sky.stars = [];
    for (let i = 0; i < n; i++) sky.stars.push({ a: Math.random() * 6.283, d: Math.sqrt(Math.random()) * 1.05, z: [0.35, 0.65, 1][i % 3], s: Math.random() < 0.1 ? 1.5 : 0.55 + Math.random() * 0.7, p: Math.random() * 6.3, f: 0.6 + Math.random() * 2, c: Math.random() < 0.14 ? '#ffd9f5' : Math.random() < 0.22 ? '#c8f6ff' : '#ffffff' });
  }
  function drawSky(dt, t) {
    const c = sky.ctx, W = sky.W, H = sky.H; if (!W) return;
    const want = RM ? 0 : (warpBoost > 0 ? 1.6 : root.classList.contains('feature') ? (busy && root.classList.contains('spinning') ? 0.2 : 0.07) : root.classList.contains('spinning') ? 0.13 : 0.012);
    sky.warp += (want - sky.warp) * Math.min(1, dt * (want > sky.warp ? 5 : 1.6));
    if (warpBoost > 0) warpBoost -= dt;
    c.setTransform(sky.dpr, 0, 0, sky.dpr, 0, 0); c.clearRect(0, 0, W, H);
    const cx = W / 2 + par.x * 12, cy = H * 0.42 + par.y * 9, R0 = Math.hypot(W, H) * 0.55, wp = sky.warp;
    c.lineCap = 'round';
    for (const s of sky.stars) {
      if (!RM) { s.d += wp * dt * (0.25 + s.z) * (0.25 + s.d); if (s.d > 1.15) { s.d = 0.03 + Math.random() * 0.3; s.a = Math.random() * 6.283; } }
      const rr = s.d * R0, ca = Math.cos(s.a), sa = Math.sin(s.a);
      const x = cx + ca * rr - par.x * s.z * 18, y = cy + sa * rr - par.y * s.z * 12;
      const al = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 1000 * s.f + s.p))) * Math.min(1, s.d * 4);
      const sz = s.s * (0.45 + s.d * 1.1) * (0.6 + s.z * 0.5);
      c.globalAlpha = al;
      if (wp > 0.05) {
        const len = Math.min(140, wp * 60 * s.z * (0.3 + s.d) * R0 / 300);
        c.strokeStyle = s.c; c.lineWidth = sz; c.beginPath(); c.moveTo(x, y); c.lineTo(x - ca * len, y - sa * len); c.stroke();
      } else { c.fillStyle = s.c; c.fillRect(x - sz / 2, y - sz / 2, sz, sz); if (s.s > 1.4) { c.globalAlpha = al * 0.35; c.fillRect(x - sz * 2, y - 0.3, sz * 4, 0.6); c.fillRect(x - 0.3, y - sz * 2, 0.6, sz * 4); } }
    }
    if (!RM && !sky.shoot && Math.random() < dt * 0.1) sky.shoot = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.35, l: 0 };
    if (sky.shoot) {
      const sh = sky.shoot; sh.l += dt; const k = sh.l / 0.85, x = sh.x + k * 300, y = sh.y + k * 120;
      const gr = c.createLinearGradient(x - 110, y - 44, x, y); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.95)');
      c.globalAlpha = Math.max(0, 1 - k); c.strokeStyle = gr; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 110, y - 44); c.lineTo(x, y); c.stroke();
      if (k >= 1) sky.shoot = null;
    }
    c.globalAlpha = 1;
  }
  function frame(dt, t) {
    if (!E) return;
    tickReels(dt, t);
    if (!RM) {
      if (!par.mouse) { par.tx = Math.sin(t / 9000) * 0.35; par.ty = Math.cos(t / 11000) * 0.25; }
      /* the slow background drift only needs ~20 updates a second; moving three big layers every frame is the costly part */
      par.acc = (par.acc || 0) + dt;
      if (par.acc >= 0.05) {
        const k = Math.min(1, par.acc * 2.5); par.acc = 0;
        par.x += (par.tx - par.x) * k; par.y += (par.ty - par.y) * k;
        E.nebW.style.transform = 'translate3d(' + (-par.x * 10).toFixed(1) + 'px,' + (-par.y * 7).toFixed(1) + 'px,0)';
        E.galW.style.transform = 'translate3d(' + (-par.x * 22).toFixed(1) + 'px,' + (-par.y * 14).toFixed(1) + 'px,0)';
        E.moon.style.transform = 'translate3d(' + (-par.x * 34).toFixed(1) + 'px,' + (-par.y * 20).toFixed(1) + 'px,0)';
      }
    }
    drawSky(dt, t);
    drawFx(dt);
  }

  /* ================= effects layer (full screen canvas, additive) ================= */
  function sizeFx() {
    if (!fxs) return;
    const d = Math.min(1.5, devicePixelRatio || 1); fxs.dpr = d; fxs.w = innerWidth; fxs.h = innerHeight;
    E.fx.width = Math.round(innerWidth * d); E.fx.height = Math.round(innerHeight * d);
  }
  function sprite(color) {
    let s = fxs.spr.get(color); if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64; const c = s.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); fxs.spr.set(color, s); return s;
  }
  const centreOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  function fxAdd(p) { if (!fxs || (RM && p.t !== 'ring')) return; p.life = 0; fxs.list.push(p); }
  function sparks(x, y, o) {
    const n = Math.round((o.n || 24) * (innerWidth < 600 ? 0.6 : 1)), cs = o.colors || ['#fff', '#ffd257', '#3ef0ff'];
    for (let i = 0; i < n; i++) { const a = (o.a0 != null ? o.a0 + (Math.random() - 0.5) * (o.spread || 6.3) : Math.random() * 6.283), sp = (o.speed || 420) * (0.25 + Math.random() * 0.85); fxAdd({ t: 'spark', x: x + (o.jx ? (Math.random() - 0.5) * o.jx : 0), y: y + (o.jy ? (Math.random() - 0.5) * o.jy : 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0), g: o.g == null ? 380 : o.g, max: (o.life || 0.8) * (0.6 + Math.random() * 0.6), w: (o.w || 2.2) * (0.6 + Math.random() * 0.8), c: cs[(Math.random() * cs.length) | 0], drag: o.drag || 1.6 }); }
  }
  function twinkles(x, y, o) { const n = o.n || 10, cs = o.colors || ['#fff', '#ffd257']; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = Math.random() * (o.r || 80); fxAdd({ t: 'star', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * (o.sy || 1), vx: 0, vy: -(o.rise || 20), g: 0, max: 0.6 + Math.random() * 0.8, w: (o.size || 9) * (0.5 + Math.random()), c: cs[(Math.random() * cs.length) | 0], drag: 0, dl: Math.random() * (o.spreadT || 0.4) }); } }
  function ring(x, y, o) { fxAdd({ t: 'ring', x, y, r0: o.r0 || 10, r1: o.r1 || 200, w: o.w || 8, c: o.c || '#ffd257', max: o.life || 0.6, dl: o.dl || 0, vx: 0, vy: 0, g: 0 }); }
  function implode(x, y, o) {
    const n = o.n || 120; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = (o.r || 600) * (0.5 + Math.random() * 0.7); fxAdd({ t: 'orb', sx: x + Math.cos(a) * d, sy: y + Math.sin(a) * d, tx: x, ty: y, x: 0, y: 0, max: (o.life || 0.9) * (0.7 + Math.random() * 0.3), dl: Math.random() * 0.25, w: 1.5 + Math.random() * 3, c: (o.colors || ['#fff', '#ffd257', '#ff4fd8', '#3ef0ff'])[(Math.random() * 4) | 0] }); }
  }
  function drawFx(dt) {
    if (!fxs) return;
    const c = fxs.ctx, L = fxs.list;
    if (!L.length) { if (fxs.on) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, E.fx.width, E.fx.height); fxs.on = false; } return; }
    fxs.on = true;
    c.setTransform(fxs.dpr, 0, 0, fxs.dpr, 0, 0); c.clearRect(0, 0, fxs.w, fxs.h); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.dl > 0) { p.dl -= dt; L[j++] = p; continue; }
      p.life += dt; const k = p.life / p.max; if (k >= 1) continue; L[j++] = p;
      if (p.t === 'spark') {
        p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        c.globalAlpha = 1 - k; c.strokeStyle = p.c; c.lineWidth = p.w; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke();
        if (p.w > 2.4) { const s = p.w * 5; c.drawImage(sprite(p.c), p.x - s, p.y - s, s * 2, s * 2); }
      } else if (p.t === 'ring') {
        const e = 1 - Math.pow(1 - k, 3), r = p.r0 + (p.r1 - p.r0) * e;
        c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = p.c; c.lineWidth = p.w * (1 - k * 0.7); c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.stroke();
        c.globalAlpha = (1 - k) * 0.35; c.lineWidth = p.w * 3 * (1 - k); c.stroke();
      } else if (p.t === 'star') {
        p.y += p.vy * dt; const s = p.w * Math.sin(Math.PI * k);
        c.globalAlpha = 1; c.fillStyle = p.c; c.beginPath(); c.moveTo(p.x, p.y - s); c.lineTo(p.x + s * 0.16, p.y - s * 0.16); c.lineTo(p.x + s, p.y); c.lineTo(p.x + s * 0.16, p.y + s * 0.16); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s * 0.16, p.y + s * 0.16); c.lineTo(p.x - s, p.y); c.lineTo(p.x - s * 0.16, p.y - s * 0.16); c.closePath(); c.fill();
        c.drawImage(sprite(p.c), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.t === 'orb') {
        const e = k * k * k, x = p.sx + (p.tx - p.sx) * e, y = p.sy + (p.ty - p.sy) * e, px = p.sx + (p.tx - p.sx) * Math.max(0, e - 0.08), py = p.sy + (p.ty - p.sy) * Math.max(0, e - 0.08);
        c.globalAlpha = Math.min(1, k * 3); c.strokeStyle = p.c; c.lineWidth = p.w; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
      }
    }
    L.length = j; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function shake(k) { if (RM || !E) return; E.wrap.classList.remove('shake-s', 'shake-l'); void E.wrap.offsetWidth; E.wrap.classList.add('shake-' + k); }

  /* ================= the mascot and idle life ================= */
  function mascot(state) {
    if (!E) return; const m = E.mascot;
    m.classList.remove('cheer', 'wow'); void m.offsetWidth; m.classList.add(state);
    S.clear(m._t); m._t = S.timeout(() => { if (E) m.classList.remove(state); }, state === 'cheer' ? 1600 : 1300);
  }
  function idleLife() {
    /* blinks */
    const blink = () => { if (!E) return; E.mascot.classList.add('blink'); S.timeout(() => E && E.mascot.classList.remove('blink'), 150); S.timeout(blink, 2200 + Math.random() * 3800); };
    S.timeout(blink, 1800);
    /* a jewel turns and catches the light now and then */
    S.interval(() => {
      if (!E || busy || RM || document.hidden) return;
      const Rl = reels[(Math.random() * R) | 0]; if (Rl.held || Rl.st !== 'idle') return;
      const c = cellAt(Rl, (Math.random() * 3) | 0); if (c.classList.contains('hit') || c.classList.contains('turn')) return;
      c.classList.add('turn'); S.timeout(() => c.classList.remove('turn'), 1100);
    }, 900);
  }

  /* ================= the reels ================= */
  const symAt = (r, pos) => { const st = M.STRIPS[r]; return st[mod(pos, st.length)]; };
  const symFor = (Rl, i) => symAt(Rl.i, i < Rl.bnd ? i + Rl.off : i);
  const cellAt = (Rl, row) => Rl.cells[mod(Rl.stop + row, POOL)];
  const wildIn = (r, stop) => [0, 1, 2].some((k) => symAt(r, stop + k) === SYM.WILD);
  function renderReel(Rl, force) {
    const b = Math.floor(Rl.p);
    if (force || b !== Rl.b) {
      Rl.b = b;
      for (let i = b - 1; i <= b + 3; i++) { const c = Rl.cells[mod(i, POOL)]; setSym(c, symFor(Rl, i)); c.style.transform = 'translate3d(0,' + ((i - b) * 100) + '%,0)'; }
    }
    Rl.track.style.transform = 'translate3d(0,' + ((b - Rl.p) * 33.3333).toFixed(3) + '%,0)';
  }
  function setBlur(Rl, on) { if (Rl.blur !== on) { Rl.blur = on; Rl.el.classList.toggle('blur', on); } }
  function spinReels(list) {
    const now = performance.now(); spinT0 = now;
    list.forEach((Rl, j) => {
      Rl.st = 'wait'; Rl.t0 = now + j * (fast() ? 30 : 55); Rl.target = null; Rl.antic = false; Rl.anticOn = false; Rl.done = null;
      Rl.el.classList.add('spinning');
      Rl.cells.forEach((c) => c.classList.remove('hit', 'land', 'turn', 'charge'));
    });
  }
  /* schedule the stops: stagger left to right, anticipation on a reel that could complete a Supernova, slam when asked */
  function stopReels(list, st) {
    return new Promise((resolve) => {
      if (!list.length) return resolve();
      const now = performance.now();
      let wc = st ? [1, 2, 3].filter((r) => reels[r].held).length : 0;
      const antic = list.map((Rl) => { const r = Rl.i; let a = false; if (st && r >= 1 && r <= 3) { if (wc >= 2) a = true; if (wildIn(r, st.stops[r])) wc++; } return a; });
      let t = Math.max(now, spinT0 + (slam ? 0 : T(fast() ? 300 : 620)));
      const gap = slam ? 30 : T(fast() ? 85 : 170);
      let left = list.length;
      list.forEach((Rl, j) => {
        Rl.target = st ? st.stops[Rl.i] : Rl.stop;
        if (j > 0) t += gap;
        if (antic[j] && !slam) { Rl.antic = true; Rl.anticAt = t - gap * 0.5; t += T(1350); }
        Rl.stopAt = t; Rl.stopDur = slam ? 150 : Rl.antic ? T(900) : T(fast() ? 250 : 400);
        Rl.over = slam || fast() ? 0.16 : 0.3; Rl.bounceD = slam || fast() ? 150 : 250;
        Rl.done = () => { if (--left === 0) resolve(); };
      });
    });
  }
  function hurry() {
    const moving = reels.filter((Rl) => Rl.st !== 'idle' && Rl.st !== 'stop' && Rl.st !== 'bounce');
    if (moving.length) {
      slam = true; const now = performance.now();
      moving.forEach((Rl, j) => { if (Rl.target != null) { Rl.stopAt = Math.min(Rl.stopAt, now + j * 30); Rl.stopDur = 150; Rl.over = 0.16; Rl.bounceD = 150; Rl.antic = false; if (Rl.anticOn) { Rl.anticOn = false; Rl.el.classList.remove('antic'); } } });
    } else skipping = true;
  }
  function startAntic(Rl) {
    Rl.anticOn = true; Rl.el.classList.add('antic'); E.machine.classList.add('antic'); snd('antic'); mascot('wow');
  }
  function tickReels(dt, now) {
    for (const Rl of reels) {
      if (Rl.st === 'idle') continue;
      if (Rl.st === 'wait') { if (now < Rl.t0) continue; Rl.st = 'kick'; Rl.t0 = now; Rl.pk = Rl.p; }
      if (Rl.st === 'kick') {
        const k = (now - Rl.t0) / (fast() ? 110 : 150);
        if (k >= 1) { Rl.st = 'acc'; Rl.t0 = now; Rl.p = Rl.pk; Rl.v = 6; } else Rl.p = Rl.pk + 0.27 * Math.sin(Math.PI * k);
      } else if (Rl.st === 'acc' || Rl.st === 'spin') {
        const vmax = turbo ? 31 : 24;
        if (Rl.st === 'acc') { const k = Math.min(1, (now - Rl.t0) / 200); Rl.v = 6 + (vmax - 6) * k * k; if (k >= 1) Rl.st = 'spin'; }
        else { const want = Rl.anticOn ? vmax * 0.7 : vmax; Rl.v += (want - Rl.v) * Math.min(1, dt * 6); }
        Rl.p -= Rl.v * dt;
        if (Rl.antic && !Rl.anticOn && now >= Rl.anticAt) startAntic(Rl);
        if (Rl.target != null && now >= Rl.stopAt) beginStop(Rl, now);
        setBlur(Rl, Rl.v > 11);
      } else if (Rl.st === 'stop') {
        const k = Math.min(1, (now - Rl.t0) / Rl.D), e = 1 - Math.pow(1 - k, 3);
        Rl.p = Rl.p0 - Rl.d * e; Rl.v = (3 * Rl.d / Rl.D * 1000) * (1 - k) * (1 - k);
        setBlur(Rl, Rl.v > 11);
        if (k >= 1) { Rl.p = Rl.pEnd - Rl.over; Rl.st = 'bounce'; Rl.t0 = now; land(Rl); }
      } else if (Rl.st === 'bounce') {
        const k = Math.min(1, (now - Rl.t0) / Rl.bounceD);
        Rl.p = Rl.pEnd - Rl.over * Math.cos(1.25 * Math.PI * k) * Math.pow(1 - k, 1.5);
        if (k >= 1) { finishReel(Rl); continue; }
      }
      renderReel(Rl);
    }
  }
  function beginStop(Rl, now) {
    const v = Math.max(Rl.v, 8), dist = v * Rl.stopDur / 1000 / 3;
    let pEnd = Math.floor(Rl.p - dist + Rl.over); const lim = Math.floor(Rl.p) - 3; if (pEnd > lim) pEnd = lim;
    Rl.bnd = Math.floor(Rl.p); Rl.off = Rl.target - pEnd; Rl.pEnd = pEnd;
    Rl.p0 = Rl.p; Rl.d = Rl.p - (pEnd - Rl.over); Rl.D = 3 * Rl.d / v * 1000; Rl.t0 = now; Rl.st = 'stop';
    renderReel(Rl, true);
  }
  function land(Rl) {
    snd('stop', Rl.i);
    Rl.el.classList.remove('antic'); if (Rl.anticOn) { Rl.anticOn = false; E.machine.classList.remove('antic'); }
    const c = centreOf(Rl.el);
    sparks(c.x, c.y + c.h * 0.5, { n: 10, speed: 160, a0: -Math.PI / 2, spread: 2.4, jx: c.w * 0.8, colors: ['#9fe9ff', '#ffffff', '#c27bff'], life: 0.45, w: 1.6, g: 500 });
    if (Rl.i >= 1 && Rl.i <= 3 && !Rl.held && wildIn(Rl.i, Rl.target)) {
      const row = [0, 1, 2].find((k) => symAt(Rl.i, Rl.target + k) === SYM.WILD);
      S.timeout(() => {
        if (!E) return; const cell = cellAt(Rl, row); cell.classList.add('land'); snd('wildLand');
        const cc = centreOf(cell); ring(cc.x, cc.y, { r0: 8, r1: cc.w * 0.9, w: 5, c: '#ffd257', life: 0.5 }); twinkles(cc.x, cc.y, { n: 8, r: cc.w * 0.5 });
      }, Rl.bounceD * 0.6);
    }
  }
  function finishReel(Rl) {
    Rl.st = 'idle'; Rl.stop = Rl.target; Rl.p = Rl.target; Rl.off = 0; Rl.bnd = -1e9; Rl.v = 0; Rl.target = null;
    renderReel(Rl, true); setBlur(Rl, false); Rl.el.classList.remove('spinning', 'antic');
    const d = Rl.done; Rl.done = null; if (d) d();
  }

  /* ================= Bat Star: expand, roll the multiplier, hold ================= */
  async function expandWild(Rl, mult) {
    const row = [0, 1, 2].find((k) => symAt(Rl.i, Rl.stop + k) === SYM.WILD);
    const cell = cellAt(Rl, row);
    cell.classList.remove('land'); cell.classList.add('charge'); snd('charge'); mascot('wow');
    const cc = centreOf(cell);
    if (!skipping) implode(cc.x, cc.y, { n: 40, r: cc.w * 1.6, life: 0.4, colors: ['#ffd257', '#fff', '#ffb02e', '#ff4fd8'] });
    await nap(380); if (!E) return;
    const w = Rl.wild; w.hidden = false; w.className = 'sw-wild'; w.style.setProperty('--row', row);
    const mx = w.querySelector('.mx'); mx.className = 'mx'; w.querySelector('.mxs').textContent = '';
    void w.offsetWidth; w.classList.add('open'); cell.classList.remove('charge');
    Rl.held = true; Rl.el.classList.add('held');
    const rc = centreOf(Rl.el);
    ring(cc.x, cc.y, { r0: 10, r1: Math.max(rc.h, 240) * 0.9, w: 10, c: '#ffd257', life: 0.7 });
    ring(cc.x, cc.y, { r0: 6, r1: Math.max(rc.h, 240) * 0.65, w: 5, c: '#3ef0ff', life: 0.6, dl: 0.08 });
    sparks(cc.x, cc.y, { n: 46, speed: 620, colors: ['#fffbe0', '#ffd257', '#ff9d1a', '#3ef0ff', '#ff4fd8'], life: 0.9, w: 2.6, g: 260 });
    sparks(rc.x, rc.y, { n: 24, speed: 320, a0: -Math.PI / 2, spread: 0.5, jy: rc.h, colors: ['#fff', '#ffd257'], life: 0.7, w: 1.8, g: -60 });
    twinkles(rc.x, rc.y, { n: 14, r: rc.h * 0.5, sy: 1, size: 11 });
    shake('s'); snd('burst');
    E.flash.classList.remove('go'); void E.flash.offsetWidth; E.flash.classList.add('go');
    await nap(620); if (!E) return;
    await rollMult(w, mult); if (!E) return;
    w.classList.add('held');
  }
  async function rollMult(w, mult) {
    const box = w.querySelector('.mx'), strip = box.querySelector('.mxs'), vals = M.CFG.multValues;
    const n = skipping ? 2 : fast() ? 7 : 13, s0 = (Math.random() * 4) | 0, seq = [];
    for (let i = 0; i < n - 1; i++) seq.push(vals[(s0 + i) % vals.length]);
    seq.push(mult);
    strip.innerHTML = seq.map((v) => '<b class="v' + v + '">×' + v + '</b>').join('');
    box.classList.add('in');
    const D = T(fast() ? 640 : 1300), end = -((n - 1) / n) * 100, over = (0.32 / n) * 100;
    if (strip.animate) strip.animate([{ transform: 'translateY(0)', easing: 'cubic-bezier(.16,.6,.3,1)' }, { transform: 'translateY(' + (end - over) + '%)', offset: 0.84, easing: 'ease-in-out' }, { transform: 'translateY(' + end + '%)' }], { duration: D, fill: 'forwards' });
    for (let j = 1; j < n; j++) S.timeout(() => snd('roll', j), D * 0.84 * (1 - Math.sqrt(1 - j / (n - 1))));
    await new Promise((r) => S.timeout(r, D)); if (!E) return;
    box.classList.add('land', 'm' + mult); w.classList.add('m' + mult); snd('mult', mult);
    const bc = centreOf(box);
    ring(bc.x, bc.y, { r0: 6, r1: bc.w * (mult >= 3 ? 1.6 : 1), w: 4, c: mult >= 5 ? '#ffd257' : mult > 1 ? '#ff4fd8' : '#9fe9ff', life: 0.5 });
    if (mult > 1) { sparks(bc.x, bc.y, { n: mult >= 5 ? 50 : mult >= 3 ? 32 : 18, speed: 380, colors: mult >= 5 ? ['#fffbe0', '#ffd257', '#ff9d1a'] : ['#fff', '#ff4fd8', '#c27bff', '#ffd257'], life: 0.8, w: 2.2 }); mascot('cheer'); }
    if (mult >= 5) shake('s');
    await nap(mult > 1 ? 520 : 260);
  }
  function clearWilds(animated) {
    for (const Rl of reels) {
      if (!Rl.held && Rl.wild.hidden) continue;
      Rl.held = false; Rl.el.classList.remove('held');
      const w = Rl.wild;
      if (animated && !w.hidden) { w.classList.add('close'); S.timeout(() => { if (w.classList.contains('close')) { w.hidden = true; w.className = 'sw-wild'; } }, 340); }
      else { w.hidden = true; w.className = 'sw-wild'; }
    }
  }

  /* ================= wins: light beams, frames, amounts ================= */
  function clearWins() {
    if (!E) return;
    E.lines.textContent = ''; E.beams.textContent = ''; E.window.classList.remove('showing'); E.tag.hidden = true; E.tag.classList.remove('in');
    root.querySelectorAll('.sw-cell.hit, .sw-wild.hit').forEach((c) => c.classList.remove('hit'));
    lineIdx[0].concat(lineIdx[1]).forEach((x) => x.classList.remove('on'));
  }
  function cellsOfWin(w) { const out = [], ln = M.LINES[w.l]; for (let k = 0; k < w.n; k++) { const r = w.dir === 1 ? k : R - 1 - k; out.push([r, ln[r]]); } return out; }
  function markCells(w) {
    for (const [r, row] of cellsOfWin(w)) {
      const Rl = reels[r];
      const el = Rl.held ? Rl.wild : cellAt(Rl, row);
      el.style.setProperty('--c', LINE_COL[w.l]); el.classList.add('hit');
    }
  }
  function linePts(l, dir) {
    const ln = M.LINES[l], cw = geo.w / 5, ch = geo.h / 3, pts = [[1, (ln[0] + 0.5) * ch]];
    for (let r = 0; r < R; r++) pts.push([(r + 0.5) * cw, (ln[r] + 0.5) * ch]);
    pts.push([geo.w - 1, (ln[4] + 0.5) * ch]);
    return dir === -1 ? pts.reverse() : pts;
  }
  function drawBeam(w, o) {
    const pts = linePts(w.l, w.dir), d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const st = '--c:' + LINE_COL[w.l] + ';--d:' + Math.round(o.dur) + 'ms;--dl:' + Math.round(o.delay || 0) + 'ms';
    const g = svgEl('g', { class: 'beam' + (o.solo ? ' solo' : ''), style: st });
    for (const cls of ['halo', 'glow', 'core']) g.append(svgEl('path', { d, class: cls, pathLength: '100' }));
    E.lines.append(g);
    if (!RM) {
      const cm = h('i', { class: 'sw-comet', style: st + ';offset-path:path("' + d + '")' }); E.beams.append(cm);
      S.timeout(() => cm.remove(), o.dur + (o.delay || 0) + 120);
    }
    const marker = lineIdx[w.dir === 1 ? 0 : 1][w.l];
    S.timeout(() => { if (E) marker.classList.add('on'); }, o.delay || 0);
  }
  function amtChip(w, unit) {
    const cells = cellsOfWin(w), [r, row] = cells[cells.length - 1];
    const x = (r + 0.5) / R * 100, y = (row + 0.86) / 3 * 100;
    E.beams.append(h('b', { class: 'sw-amt' + (w.m > 1 ? ' mult' : ''), style: '--c:' + LINE_COL[w.l] + ';left:' + x + '%;top:' + y + '%' }, fmt(w.pay * unit) + (w.m > 1 ? ' ×' + w.m : '')));
  }
  function countUp(el, from, to, ms) {
    const iv = S.interval(() => snd('tick'), 70);
    return B.ui.countUp(el, from, to, ms, fmt).then(() => S.clear(iv));
  }
  function tierOf(x) { return x >= 10 ? 3 : x >= 5 ? 2 : x >= 1 ? 1 : 0; }
  async function showWins(step, unit, running) {
    if (!step.wins.length || !E) return;
    clearWins(); E.window.classList.add('showing');
    const amt = step.pay * unit, wins = step.wins, x = amt / (unit * U), dur = T(480);
    wins.forEach((w, i) => { const dl = T(i * 85); drawBeam(w, { dur, delay: dl }); markCells(w); S.timeout(() => snd('beam', i), dl); });
    if (wins.length <= 3) wins.forEach((w) => amtChip(w, unit));
    const mx = Math.max.apply(null, wins.map((w) => w.m));
    tag(fmt(amt) + ' BB' + (mx > 1 ? ' · up to ×' + mx : ''), mx > 1 ? 'mult' : '');
    snd('win', tierOf(x)); mascot('cheer');
    root.classList.remove('winglow'); void root.offsetWidth; root.classList.add('winglow');
    const wc = centreOf(E.window);
    if (x >= 1) twinkles(wc.x, wc.y, { n: Math.min(30, 8 + wins.length * 3), r: wc.w * 0.5, sy: wc.h / wc.w, size: 10 });
    if (x >= 2) sparks(wc.x, wc.y, { n: Math.min(70, 16 + wins.length * 6), speed: 520, jx: wc.w * 0.6, jy: wc.h * 0.4, colors: ['#3ef0ff', '#ff4fd8', '#ffd257', '#fff'], life: 0.9, w: 2 });
    await countUp(E.win, running, running + amt, T(Math.min(1500, 380 + x * 120)));
    await nap(fast() || skipping ? 300 : 650);
    if (!fast() && !skipping && wins.length > 1) {
      for (let i = 0; i < wins.length && E && !skipping; i++) { showOne(wins[i], unit, true, i); await nap(900); }
    }
  }
  function showOne(w, unit, sound, i) {
    clearWins(); E.window.classList.add('showing');
    drawBeam(w, { dur: T(420), solo: true }); markCells(w); amtChip(w, unit);
    if (sound) snd('beam', i);
    tag('Line ' + (w.l + 1) + (w.dir === 1 ? ' →' : ' ←') + ' · ' + w.n + ' × ' + M.SYMBOL_NAMES[w.s] + (w.m > 1 ? ' · ×' + w.m : '') + ' · ' + fmt(w.pay * unit) + ' BB', w.m > 1 ? 'mult' : '');
  }
  /* after the round, the last wins keep cycling until the next spin */
  async function idleCycle(step, unit) {
    const tok = ++cycleTok;
    if (!step || !step.wins.length || auto > 0) return;
    await S.sleep(1400);
    for (let i = 0; E && tok === cycleTok && !busy; i++) {
      showOne(step.wins[i % step.wins.length], unit, false, i);
      await S.sleep(1500);
      if (step.wins.length === 1 && i > 2) break;
    }
  }
  function tag(text, cls) { E.tag.hidden = false; E.tag.className = 'sw-tag ' + (cls || ''); E.tag.textContent = text; void E.tag.offsetWidth; E.tag.classList.add('in'); }
  function setMsg(t, cls) { if (!E) return; E.msg.textContent = t; E.msg.className = 'msg ' + (cls || ''); }
  function banner(html, cls, ms) {
    E.banner.hidden = false; E.banner.className = 'sw-banner ' + (cls || ''); E.banner.innerHTML = html;
    void E.banner.offsetWidth; E.banner.classList.add('in');
    return nap(ms || 900).then(() => { if (E) { E.banner.classList.remove('in'); E.banner.classList.add('out'); } return nap(260); }).then(() => { if (E) E.banner.hidden = true; });
  }

  /* ================= the feature: title card, HUD, re-spins, outro ================= */
  function paintHud(k, mult, featWin) {
    if (!E) return;
    E.hudN.textContent = String(k);
    Array.from(E.hudPips.children).forEach((x, i) => x.classList.toggle('on', i < k));
    const held = [1, 2, 3].filter((r) => reels[r].held).map((r) => mult[r]);
    E.hudX.innerHTML = held.map((m) => '<i class="v' + m + '">×' + m + '</i>').join('');
    E.hudW.textContent = fmt(featWin);
  }
  async function featureIntro() {
    root.classList.add('feature'); E.top.classList.add('hud-on');
    snd('feature'); mascot('cheer');
    E.card.hidden = false; E.card.className = 'sw-card';
    E.card.innerHTML = '<i class="streak a"></i><i class="streak b"></i><i class="streak c"></i><div class="in"><div class="ic">' + useSym('wild') + '</div><small>Bat Star</small><b>Re-spins</b><em>Wilds hold, the rest spin again</em></div>';
    void E.card.offsetWidth; E.card.classList.add('go');
    const c = centreOf(E.card);
    twinkles(c.x, c.y, { n: 24, r: Math.min(c.w, 600) * 0.45, sy: 0.4, size: 12 });
    warpBoost = 0.9;
    await nap(1700); if (!E) return;
    E.card.classList.add('out'); await nap(380); if (E) E.card.hidden = true;
  }
  async function respinIntro(k, st, featWin) {
    if (k === 1) await featureIntro();
    if (!E) return;
    paintHud(k, st.mult, featWin);
    snd('respin');
    await banner('<small>Re-spin</small><b>' + k + '</b>', 'respin', 520);
  }
  async function featureOutro(featWin, n, capped) {
    if (!E) return;
    E.sum.hidden = false; E.sum.className = 'sw-sum';
    const out = h('b', { class: 'amt' }, '0');
    E.sum.textContent = '';
    E.sum.append(h('small', null, capped ? 'Maximum win' : 'Bat Star re-spins'), out,
      h('p', null, featWin > 0 ? 'You won ' + fmt(featWin) + ' BB in ' + n + ' re-spin' + (n > 1 ? 's' : '') : 'The stars kept their secrets this time'));
    void E.sum.offsetWidth; E.sum.classList.add('in');
    snd('sum');
    const c = centreOf(E.sum);
    if (featWin > 0) { B.fx.burst({ x: c.x, y: c.y, kind: 'coin', count: 26, power: 0.9 }); twinkles(c.x, c.y, { n: 16, r: c.w * 0.4, sy: 0.5 }); }
    await countUp(out, 0, featWin, T(900));
    await nap(1500); if (!E) return;
    E.sum.classList.add('out'); await nap(300); if (E) E.sum.hidden = true;
  }
  async function tierShow(x, amt) {
    E.tier.hidden = false; E.tier.className = 'sw-tier ' + (x >= 5 ? 'great' : 'nice');
    const out = h('output', null, '0');
    E.tier.textContent = ''; E.tier.append(h('b', null, x >= 5 ? 'Great win' : 'Nice win'), out);
    void E.tier.offsetWidth; E.tier.classList.add('in');
    snd('tier', x >= 5 ? 1 : 0);
    const c = centreOf(E.window);
    B.fx.burst({ x: c.x, y: c.y, kind: 'coin', count: x >= 5 ? 34 : 18, power: 0.85 });
    sparks(c.x, c.y, { n: 30, speed: 560, colors: ['#ffd257', '#fff', '#ff4fd8'], life: 0.9 });
    await countUp(out, 0, amt, T(x >= 5 ? 1300 : 900));
    await nap(900); if (!E) return;
    E.tier.classList.add('out'); await nap(280); if (E) E.tier.hidden = true;
  }

  /* ================= Supernova: reels 2, 3 and 4 all wild ================= */
  async function supernova(st) {
    const prod = st.mult[1] * st.mult[2] * st.mult[3];
    mascot('wow'); root.classList.add('nova-pre'); snd('novaCharge');
    const wc = centreOf(E.window);
    for (const r of [1, 2, 3]) { reels[r].wild.classList.add('flare'); snd('roll', r * 4); await nap(170); if (!E) return; }
    if (!skipping) implode(wc.x, wc.y, { n: innerWidth < 600 ? 90 : 170, r: Math.hypot(innerWidth, innerHeight) * 0.55, life: 0.85 });
    await nap(720); if (!E) return;
    root.classList.remove('nova-pre');
    const N = E.nova; N.hidden = false; N.className = 'sw-nova'; N.style.setProperty('--nx', wc.x + 'px'); N.style.setProperty('--ny', wc.y + 'px');
    N.querySelector('.sub').textContent = 'Reels 2, 3 and 4 wild · ×' + prod + ' on every line';
    void N.offsetWidth; N.classList.add('go');
    E.bg.classList.remove('nova'); void E.bg.offsetWidth; E.bg.classList.add('nova');
    snd('boom'); shake('l'); warpBoost = 1.6;
    const big = Math.hypot(innerWidth, innerHeight);
    ring(wc.x, wc.y, { r0: 20, r1: big * 0.8, w: 26, c: '#fffbe0', life: 1.1 });
    ring(wc.x, wc.y, { r0: 10, r1: big * 0.65, w: 14, c: '#ffd257', life: 1.2, dl: 0.12 });
    ring(wc.x, wc.y, { r0: 10, r1: big * 0.5, w: 10, c: '#ff4fd8', life: 1.3, dl: 0.24 });
    ring(wc.x, wc.y, { r0: 10, r1: big * 0.38, w: 8, c: '#3ef0ff', life: 1.3, dl: 0.36 });
    sparks(wc.x, wc.y, { n: 200, speed: 1300, colors: ['#fffbe0', '#ffd257', '#ff9d1a', '#ff4fd8', '#3ef0ff', '#fff'], life: 1.4, w: 3, g: 120, drag: 1.1 });
    twinkles(wc.x, wc.y, { n: 40, r: big * 0.4, sy: 0.6, size: 16, spreadT: 1.2 });
    B.fx.rain('confetti', 1800);
    mascot('cheer');
    await nap(2700); if (!E) return;
    N.classList.add('out'); await nap(500); if (!E) return;
    N.hidden = true; for (const r of [1, 2, 3]) reels[r].wild.classList.remove('flare');
  }

  /* ================= a round ================= */
  function primary() {
    if (busy) { hurry(); return; }
    if (!E.autoMenu.hidden) { E.autoMenu.hidden = true; return; }
    round();
  }
  async function round() {
    if (busy || !E) return;
    const stake = stakeCtl.value, unit = stake / U;
    if (!B.wallet.bet(ID, stake)) { stopAuto(); return B.ui.broke(); }
    busy = true; skipping = false; slam = false; cycleTok++; E.autoMenu.hidden = true; paintCtl();
    E.win.textContent = '0'; E.winbar.classList.remove('won', 'cap'); clearWins(); clearWilds(true);
    root.classList.remove('feature'); E.top.classList.remove('hud-on');
    if (auto > 0) auto--;
    setMsg('Spinning…');
    snd('spin'); root.classList.add('spinning');
    spinReels(reels);
    const o = await (async () => {
      if (B.online) { const r = await B.play(ID, 'spin', { stake }, stake); return r ? r.o : null; }
      if (DEV && devNext) { const x = devNext(); devNext = null; return x; }
      return M.spin(B.rng);
    })();
    if (!E) return;
    if (!o) {
      await stopReels(reels, null); if (!E) return;
      root.classList.remove('spinning'); busy = false; stopAuto(); paintCtl(); setMsg('Lost contact with the stars. Try again.'); return;
    }
    const win = o.totalWin * unit;
    if (win > 0) B.wallet.win(ID, win, { silent: true });
    sess.spins++; if (win > 0) sess.hits++; if (win > sess.best) sess.best = win;
    if (devLog) { devLog.rounds++; devLog.staked += stake; devLog.won += win; devLog.respins += o.steps.length - 1; devLog.last = o; }

    let running = 0;
    const nSteps = o.steps.length;
    for (let k = 0; k < nSteps; k++) {
      const st = o.steps[k];
      if (k > 0) {
        await respinIntro(k, st, running); if (!E) return;
        slam = false;
        const moving = reels.filter((Rl) => !Rl.held);
        root.classList.add('spinning'); snd('spin'); spinReels(moving);
        await stopReels(moving, st);
      } else await stopReels(reels, st);
      if (!E) return;
      root.classList.remove('spinning'); E.machine.classList.remove('antic');
      for (const r of st.newWild) { await expandWild(reels[r], st.mult[r]); if (!E) return; }
      if (st.newWild.length && [1, 2, 3].every((r) => reels[r].held)) { await supernova(st); if (!E) return; }
      if (k > 0) paintHud(k, st.mult, running);
      if (st.pay > 0) { await showWins(st, unit, running); running += st.pay * unit; if (k > 0) paintHud(k, st.mult, running); }
      else if (k > 0) { setMsg('No line this re-spin…'); snd('miss'); }
      if (!E) return;
      if (k < nSteps - 1) { clearWins(); await nap(200); }
    }
    if (!E) return;
    const feature = nSteps > 1, x = win / stake;
    E.win.textContent = fmt(win);
    if (feature) await featureOutro(win, nSteps - 1, o.capped);
    if (!E) return;
    if (!feature && x >= 3 && x < 10) await tierShow(x, win);
    if (!E) return;
    if (o.capped) { E.winbar.classList.add('cap'); setMsg('Maximum win reached: ' + fmt(M.MAX_WIN_X) + '× stake. Supernova!', 'gold'); }
    else if (win > 0) { E.winbar.classList.add('won'); setMsg((feature ? (nSteps - 1) + ' re-spin' + (nSteps > 2 ? 's' : '') + ' · ' : '') + 'Paid ' + fmt(win) + ' BB', 'gold'); }
    else { setMsg(IDLE[sess.spins % IDLE.length]); }
    B.wallet.sync();
    if (x >= 10) { mascot('cheer'); await B.ui.celebrate({ amount: win, bet: stake }); }
    if (!E) return;
    root.classList.remove('feature'); E.top.classList.remove('hud-on');
    busy = false; skipping = false; slam = false; paintCtl();
    const last = o.steps[nSteps - 1];
    if (last.pay > 0) idleCycle(last, unit); else clearWins();
    continueAuto(win);
  }
  const IDLE = ['Ten lines, both ways. Catch a Bat Star.', 'Bat Stars land on reels 2, 3 and 4 and fill the whole reel.', 'Every Bat Star holds its reel and re-spins the rest.', 'Two wilds on one line? Their multipliers multiply.', 'Three Bat Stars at once: Supernova.', 'Tap the reels to stop them sharpish.'];

  /* ---------- autoplay, turbo, keys ---------- */
  function buildAutoMenu() {
    const m = h('div', { class: 'sw-automenu', hidden: true, role: 'dialog', 'aria-label': 'Autoplay' });
    const rowN = h('div', { class: 'chips n' }), rowL = h('div', { class: 'chips l' });
    const paint = () => {
      rowN.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.n === autoPick.n));
      rowL.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.l === autoPick.loss));
    };
    for (const n of [10, 25, 50, 100, 250]) rowN.append(h('button', { type: 'button', 'data-n': n, onclick: () => { autoPick.n = n; snd('btn'); paint(); } }, String(n)));
    for (const l of [0, 20, 50, 100, 250]) rowL.append(h('button', { type: 'button', 'data-l': l, onclick: () => { autoPick.loss = l; snd('btn'); paint(); } }, l ? l + '×' : 'None'));
    const go = h('button', { type: 'button', class: 'sw-btn go', id: 'starwing-auto-go', onclick: () => startAuto() }, h('b', null, 'Start autoplay'));
    m.append(h('h4', null, 'Autoplay'), h('label', null, 'Spins'), rowN, h('label', null, 'Stop if I lose more than (× stake)'), rowL, go);
    paint();
    return m;
  }
  function autoClick() { snd('btn'); if (auto > 0) { stopAuto(); return; } if (busy) return; E.autoMenu.hidden = !E.autoMenu.hidden; }
  function startAuto() { E.autoMenu.hidden = true; auto = autoPick.n; autoLoss = autoPick.loss * stakeCtl.value; autoFloor = B.wallet.balance - autoLoss; paintCtl(); if (!busy) round(); }
  function stopAuto() { auto = 0; if (E) paintCtl(); }
  function continueAuto(win) {
    if (auto <= 0) return;
    const stake = stakeCtl.value;
    if (autoLoss && B.wallet.balance - stake < autoFloor) { stopAuto(); B.ui.toast('Autoplay stopped: loss limit reached.'); return; }
    if (!B.wallet.canBet(stake)) { stopAuto(); B.ui.toast('Autoplay stopped: not enough Batty Bucks for the next spin.'); return; }
    S.timeout(() => { if (auto > 0 && !busy) round(); }, T(win ? 420 : 160));
  }
  function toggleTurbo() { turbo = !turbo; E.turboBtn.setAttribute('aria-pressed', String(turbo)); E.turboBtn.lastChild.textContent = turbo ? 'on' : 'off'; E.turboBtn.classList.toggle('on', turbo); snd('btn'); }
  function paintStake() {
    if (!E) return;
    const unit = stakeCtl.value / U;
    E.pays.querySelectorAll('.v').forEach((v) => {
      const p = M.PAY[+v.dataset.s];
      v.innerHTML = '<i>5</i>' + fmt(p[2] * unit) + '<i>4</i>' + fmt(p[1] * unit) + '<i>3</i>' + fmt(p[0] * unit);
    });
  }
  function paintCtl() {
    if (!E) return;
    stakeCtl.disabled = busy || auto > 0;
    E.spin.classList.toggle('busy', busy);
    E.spin.setAttribute('aria-label', busy ? 'Stop' : 'Spin');
    E.autoBtn.classList.toggle('on', auto > 0);
    E.autoBtn.lastChild.textContent = auto > 0 ? String(auto) : 'off';
  }
  function onKey(e) {
    if (!E || e.target.closest('input,textarea,select') || document.querySelector('.bc-veil')) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) primary(); }
    else if (e.key === 't' || e.key === 'T') toggleTurbo();
    else if (e.key === 'a' || e.key === 'A') autoClick();
  }

  /* ---------- rules ---------- */
  function rules() {
    const f = Batty.fmt;
    let t = '<div class="sw-rules">';
    t += '<p>Starwing is a 5-reel, 3-row slot with <b>10 fixed lines that pay both ways</b>: three or more of a kind from the left-hand reel rightwards, or from the right-hand reel leftwards. A five of a kind is paid once. The stake covers all 10 lines (a line bet is a tenth of it).</p>';
    t += '<h3>Bat Star Wild</h3><p>The Bat Star lands only on reels 2, 3 and 4 and stands in for every symbol. When one lands it <b>expands</b> to fill its reel, rolls a <b>multiplier</b> and is <b>held</b> while the other reels <b>re-spin</b>. A new Bat Star in a re-spin expands and gives another re-spin, so there can be up to 3. Every spin and re-spin pays.</p>';
    t += '<p>When reels 2, 3 and 4 are all wild at once, that is a <b>Supernova</b>: every line pays with all three multipliers.</p>';
    const tw = M.CFG.multWeights.reduce((a, b) => a + b, 0);
    t += '<h3>Wild multipliers</h3><table><tr><th>Multiplier</th><th>Chance</th></tr>' + M.CFG.multValues.map((v, i) => '<tr><td>×' + v + '</td><td>' + (M.CFG.multWeights[i] / tw * 100).toFixed(0) + '%</td></tr>').join('') + '</table>';
    t += '<p>A line that runs through expanded wilds is multiplied by all of their multipliers <b>multiplied together</b> (×2 and ×3 make ×6; three ×5s make ×125).</p>';
    t += '<h3>Paytable</h3><p>Pays for 3, 4 and 5 of a kind, in multiples of your <b>total stake</b>.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>';
    for (let s = SYM.BAR; s <= SYM.YELLOW; s++) t += '<tr><td>' + M.SYMBOL_NAMES[s] + '</td>' + M.PAY[s].map((p) => '<td>' + (p / U).toFixed(2).replace(/\.?0+$/, '') + '×</td>').join('') + '</tr>';
    t += '</table>';
    t += '<h3>Lines</h3><div class="sw-lmap">' + M.LINES.map((ln, l) => '<svg viewBox="0 0 50 30"><rect width="50" height="30" rx="3" fill="#120c3a"/>' + [0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((r) => '<rect x="' + (r * 10 + 1.5) + '" y="' + (row * 10 + 1.5) + '" width="7" height="7" rx="1.5" fill="' + (ln[r] === row ? LINE_COL[l] : '#2a2366') + '"/>').join('')).join('') + '</svg><span>' + (l + 1) + '</span>').join('') + '</div>';
    t += '<h3>Numbers</h3><table>' +
      '<tr><td>Return to player (exact calculation)</td><td><b>' + RTP.exact + '</b></td></tr>' +
      '<tr><td>Return in ' + RTP.sims + ' simulated spins</td><td>' + RTP.sim + '</td></tr>' +
      '<tr><td>Any win</td><td>' + RTP.hit + ' spins</td></tr>' +
      '<tr><td>Bat Star re-spins</td><td>' + RTP.wild + ' spins</td></tr>' +
      '<tr><td>Volatility</td><td>Low to medium</td></tr>' +
      '<tr><td>Maximum win per spin</td><td>' + f(M.MAX_WIN_X) + '× stake</td></tr></table>';
    t += '<p>Keys: Space spins, and during a spin stops the reels at once (tap the reels to do the same, and again to hurry the show along). T turbo, A autoplay. Batty Bucks have no cash value.</p>';
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
