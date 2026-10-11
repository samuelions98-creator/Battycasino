/* ===== royale math ===== */
/* Roulette Royale: pure maths. No DOM. Shared verbatim by the browser game and tools/royale-sim.js, and ported line for
   line to lib/games/royale.php (proved identical by tools/royale-xcheck.js).

   THE WHEEL   European single zero: 37 pockets, 0-36, in the standard wheel order (WHEEL). One uniform draw per spin.
   SPOTS       A bet is a map of spot key => Batty Bucks. Inside spots are 'n' + covered numbers joined by '-':
               straight n17, split n1-2, street n1-2-3, trio n0-1-2 / n0-2-3, corner n1-2-4-5, first four n0-1-2-3,
               six line n1-2-3-4-5-6. Outside: red, black, odd, even, low, high, d1-d3 (dozens), c1-c3 (columns).
   PAYS        A spot covering k numbers returns 36/k times its stake, stake included (straight 35:1, split 17:1,
               street 11:1, corner 8:1, six line 5:1, dozen/column 2:1, even chances 1:1). Zero loses every outside bet.
               Every bet therefore returns 36/37 = 97.297% (house edge 2.703%).
   LIMITS      Chips 2,000 to 250,000. A spot holds a whole number of thousands, at least 2,000 and at most 250,000 per
               number it covers. At most 10,000,000 on the table per spin. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).royale = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const CHIPS = [2000, 5000, 10000, 25000, 50000, 100000, 250000];
  const UNIT = 1000, SPOT_MIN = 2000, SPOT_MAX_PER_NUMBER = 250000, TABLE_MAX = 10000000, MAX_SPOTS = 200;
  const TIMING = { bet: 15, spin: 10, rest: 5 };
  const isRed = (n) => RED.indexOf(n) >= 0;
  const colour = (n) => (n === 0 ? 'green' : isRed(n) ? 'red' : 'black');
  const range = (a, b, step) => { const o = []; for (let i = a; i <= b; i += step || 1) o.push(i); return o; };

  /* spot key => covered numbers, built in the same order as ry_spots() in PHP */
  const SPOTS = {};
  const KIND = {};
  (function build() {
    const add = (nums, kind) => { nums = nums.slice().sort((a, b) => a - b); const k = 'n' + nums.join('-'); SPOTS[k] = nums; KIND[k] = kind; };
    for (let n = 0; n <= 36; n++) add([n], 'straight');
    add([0, 1], 'split'); add([0, 2], 'split'); add([0, 3], 'split');
    for (let n = 1; n <= 36; n++) { if (n % 3 !== 0) add([n, n + 1], 'split'); if (n <= 33) add([n, n + 3], 'split'); }
    add([0, 1, 2], 'street'); add([0, 2, 3], 'street');
    for (let n = 1; n <= 34; n += 3) add([n, n + 1, n + 2], 'street');
    add([0, 1, 2, 3], 'corner');
    for (let n = 1; n <= 32; n++) if (n % 3 !== 0) add([n, n + 1, n + 3, n + 4], 'corner');
    for (let n = 1; n <= 31; n += 3) add(range(n, n + 5), 'line');
    SPOTS.red = RED.slice(); KIND.red = 'even';
    SPOTS.black = range(1, 36).filter((n) => !isRed(n)); KIND.black = 'even';
    SPOTS.odd = range(1, 36, 2); KIND.odd = 'even';
    SPOTS.even = range(2, 36, 2); KIND.even = 'even';
    SPOTS.low = range(1, 18); KIND.low = 'even';
    SPOTS.high = range(19, 36); KIND.high = 'even';
    for (let i = 1; i <= 3; i++) { SPOTS['d' + i] = range(12 * i - 11, 12 * i); KIND['d' + i] = 'dozen'; SPOTS['c' + i] = range(i, 36, 3); KIND['c' + i] = 'column'; }
  })();
  const keyOf = (nums) => 'n' + nums.slice().sort((a, b) => a - b).join('-');
  const spotMax = (k) => SPOT_MAX_PER_NUMBER * SPOTS[k].length;
  const pays = (k) => 36 / SPOTS[k].length - 1;   // to one

  /* what a spot returns (stake included) when n comes in */
  function ret(key, stake, n) {
    const nums = SPOTS[key];
    if (!nums || nums.indexOf(n) < 0) return 0;
    return Math.floor((stake * 36) / nums.length);
  }
  function settle(bets, n) {
    let total = 0; const bySpot = {};
    for (const k in bets) { const r = ret(k, bets[k], n); if (r > 0) { bySpot[k] = r; total += r; } }
    return { total, bySpot };
  }
  const totalOf = (bets) => { let t = 0; for (const k in bets) t += bets[k]; return t; };
  /* null when fine, else the reason (same wording as the server) */
  function validate(bets) {
    if (!bets || typeof bets !== 'object' || Array.isArray(bets)) return 'Bad bets';
    let total = 0; const keys = Object.keys(bets);
    if (keys.length > MAX_SPOTS) return 'Too many bets';
    for (const k of keys) {
      const s = bets[k];
      if (!SPOTS[k]) return 'Unknown bet';
      if (!Number.isInteger(s) || s < SPOT_MIN || s % UNIT !== 0) return 'Bad chip amount';
      if (s > spotMax(k)) return 'That bet is over the ' + spotMax(k).toLocaleString('en-GB') + ' spot limit';
      total += s;
    }
    if (total > TABLE_MAX) return 'That is over the table limit of ' + TABLE_MAX.toLocaleString('en-GB');
    return null;
  }
  const draw = (rng) => WHEEL[Math.floor(rng() * 37)];

  /* ---------- announced (call) bets: lists of [spot, chips] at one chip per unit ---------- */
  const ANNOUNCED = {
    voisins: { name: 'Voisins du Zéro', short: 'Voisins', chips: 9, parts: [['n0-2-3', 2], ['n4-7', 1], ['n12-15', 1], ['n18-21', 1], ['n19-22', 1], ['n32-35', 1], ['n25-26-28-29', 2]] },
    tiers: { name: 'Tiers du Cylindre', short: 'Tiers', chips: 6, parts: [['n5-8', 1], ['n10-11', 1], ['n13-16', 1], ['n23-24', 1], ['n27-30', 1], ['n33-36', 1]] },
    orphelins: { name: 'Orphelins', short: 'Orphelins', chips: 5, parts: [['n1', 1], ['n6-9', 1], ['n14-17', 1], ['n17-20', 1], ['n31-34', 1]] },
    zero: { name: 'Jeu Zéro', short: 'Zéro', chips: 4, parts: [['n0-3', 1], ['n12-15', 1], ['n32-35', 1], ['n26', 1]] },
  };
  /* numbers each section of the racetrack covers (for highlighting) */
  const SECTION = {
    voisins: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
    tiers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
    orphelins: [17, 34, 6, 1, 20, 14, 31, 9],
    zero: [12, 35, 3, 26, 0, 32, 15],
  };
  function announced(id, unit) { const o = {}; for (const [k, c] of ANNOUNCED[id].parts) o[k] = (o[k] || 0) + c * unit; return o; }
  function neighbourNums(n, k) { const i = WHEEL.indexOf(n), o = []; for (let j = -k; j <= k; j++) o.push(WHEEL[(i + j + 37) % 37]); return o; }
  function neighbours(n, k, unit) { const o = {}; for (const m of neighbourNums(n, k)) o['n' + m] = (o['n' + m] || 0) + unit; return o; }
  /* add one bet map onto another without breaking limits; returns {bets, clipped} */
  function merge(base, add) {
    const out = Object.assign({}, base); let clipped = false, total = totalOf(out);
    for (const k in add) {
      let v = add[k]; const room = Math.min(spotMax(k) - (out[k] || 0), TABLE_MAX - total);
      if (v > room) { v = Math.max(0, Math.floor(room / UNIT) * UNIT); clipped = true; }
      if ((out[k] || 0) + v < SPOT_MIN) { if (v > 0) clipped = true; continue; }
      if (v > 0) { out[k] = (out[k] || 0) + v; total += v; }
    }
    return { bets: out, clipped };
  }
  /* split an amount into chips, largest first (for drawing stacks) */
  function chipsFor(amount) {
    const o = []; let left = amount;
    for (let i = CHIPS.length - 1; i >= 0 && o.length < 40; i--) while (left >= CHIPS[i] && o.length < 40) { o.push(CHIPS[i]); left -= CHIPS[i]; }
    if (left > 0) o.push(left);
    return o;
  }
  /* the most one spin can return: for each number, fill the best-paying spots covering it up to their limits */
  function maxWin() {
    let best = 0;
    for (let n = 0; n <= 36; n++) {
      const ks = Object.keys(SPOTS).filter((k) => SPOTS[k].indexOf(n) >= 0).sort((a, b) => SPOTS[a].length - SPOTS[b].length);
      let room = TABLE_MAX, win = 0;
      for (const k of ks) { const s = Math.min(spotMax(k), room); room -= s; win += Math.floor((s * 36) / SPOTS[k].length); if (!room) break; }
      best = Math.max(best, win);
    }
    return best;
  }
  const describe = (n) => n === 0 ? 'Zero' : n + ' ' + (isRed(n) ? 'red' : 'black') + ', ' + (n % 2 ? 'odd' : 'even') + ', ' + (n <= 18 ? 'low' : 'high');

  return { WHEEL, RED, CHIPS, UNIT, SPOT_MIN, SPOT_MAX_PER_NUMBER, TABLE_MAX, MAX_SPOTS, TIMING, SPOTS, KIND, ANNOUNCED, SECTION,
    isRed, colour, keyOf, spotMax, pays, ret, settle, totalOf, validate, draw, announced, neighbourNums, neighbours, merge, chipsFor, maxWin, describe };
});


/* ===== royale ===== */
/* Roulette Royale — the High Roller Lounge's single-zero wheel, drawn and animated in code.
   A mahogany wheel seen at an angle: the head turns, the croupier's ball is flicked round the track, slows, drops off the
   rim, rattles over the diamonds and frets and settles in its pocket. A full European layout (every inside and outside
   bet), the racetrack with the four announced bets and neighbours, 3D chip stacks, undo / clear / double / rebet, a gold
   bat dolly on the winning number, payouts that slide in, the result history with hot and cold numbers.
   Online: one shared wheel on the server's clock (bets open 15 s, the ball runs 10 s, the result shows 5 s). Every number
   comes from the server and only after betting closes; the ball's path is a pure function of the spin, so every viewer
   (and a reload mid-spin) sees the same ball. Practice: the same maths (BattyMath.royale) with a Spin button.
   The felt is a fixed-size stage (three layouts: wide, compact landscape, tall portrait) scaled to fit the view. */
(function () {
  'use strict';
  const ID = 'royale', M = BattyMath.royale, B = Batty, h = B.h, fmt = B.fmt;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canHover = !!(window.matchMedia && matchMedia('(hover: hover)').matches);
  const KEY = 'batty-royale-v1', MIN_LEVEL = 5, TAU = Math.PI * 2;
  const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => Object.assign({}, o || {});
  const abbr = (n) => n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1000 ? (Math.round(n / 100) / 10) + 'K' : String(n);
  const colName = (n) => (n === 0 ? 'Green' : M.isRed(n) ? 'Red' : 'Black');
  const colCls = (n) => M.colour(n);
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ============================== chips ============================== */
  const CHIP = {
    2000: ['#efe6d2', '#b3122a', '#5a0a14'], 5000: ['#b3122a', '#f6eedb', '#fff4e0'], 10000: ['#1f4fb8', '#e9f0ff', '#ffffff'],
    25000: ['#0f7a45', '#f3d98b', '#fff6d6'], 50000: ['#5b2a86', '#e4d2ff', '#ffffff'], 100000: ['#141018', '#e2bd62', '#f3d98b'],
    250000: ['#d4a83c', '#3a0610', '#2a0508'],
  };
  const chipCol = (v) => CHIP[v] || CHIP[M.CHIPS.slice().reverse().find((c) => c <= v) || 2000];
  /* a chip seen flat (the tray) */
  function chipFlat(v) {
    const st = chipCol(v), t = abbr(v);
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="' + st[0] + '" stroke="rgba(0,0,0,.5)" stroke-width="1"/>' +
      '<circle cx="24" cy="24" r="19.5" fill="none" stroke="' + st[1] + '" stroke-width="6" stroke-dasharray="6 7.6"/>' +
      '<circle cx="24" cy="24" r="14" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width="1.3"/>' +
      '<circle cx="24" cy="24" r="12" fill="none" stroke="' + st[1] + '" stroke-width=".6" stroke-dasharray="1.5 1.5" opacity=".8"/>' +
      '<text x="24" y="' + (t.length > 3 ? 27.6 : 28.4) + '" text-anchor="middle" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + (t.length > 3 ? 9.5 : 12) + '" fill="' + st[2] + '">' + t + '</text>' +
      '<circle cx="24" cy="24" r="23" fill="url(#ry-flat-shine)"/></svg>';
  }
  /* a chip lying on the felt at the camera's angle: an elliptical top and a striped edge */
  function chip3d(v, label) {
    const st = chipCol(v), t = label || abbr(v);
    const edge = 'M1 12v6c0 7.2 9.4 12.6 21 12.6S43 25.2 43 18v-6Z';
    return '<svg viewBox="0 0 44 32" aria-hidden="true"><path d="' + edge + '" fill="' + st[0] + '"/>' +
      '<path d="M4.6 18.4v6.1M13.6 22.3v6.4M30.4 22.3v6.4M39.4 18.4v6.1" stroke="' + st[1] + '" stroke-width="3.6"/><path d="' + edge + '" fill="url(#ry-cedge)"/>' +
      '<ellipse cx="22" cy="12" rx="21" ry="11.5" fill="' + st[0] + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>' +
      '<ellipse cx="22" cy="12" rx="17.4" ry="9.5" fill="none" stroke="' + st[1] + '" stroke-width="3.4" stroke-dasharray="4.6 5.9"/>' +
      '<ellipse cx="22" cy="12" rx="12.4" ry="6.8" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width=".9"/>' +
      '<text x="22" y="15.4" text-anchor="middle" transform="translate(0 4.6) scale(1 .62)" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + (t.length > 3 ? 9.6 : 12) + '" fill="' + st[2] + '">' + t + '</text>' +
      '<ellipse cx="22" cy="12" rx="21" ry="11.5" fill="url(#ry-cshine)"/></svg>';
  }
  /* a 3D stack, largest chip at the bottom; the top chip carries the spot's total */
  function stackHtml(n, max, dropTop) {
    const cs = M.chipsFor(n).filter((v) => CHIP[v]); if (!cs.length) cs.push(2000);
    const show = cs.slice(0, max || 5);
    return show.map((v, k) => '<i style="--k:' + k + '"' + (dropTop && k === show.length - 1 ? ' class="drop"' : '') + '>' + chip3d(v, k === show.length - 1 ? abbr(n) : '') + '</i>').join('');
  }

  const DEFS = '<svg class="ry-defs" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="ry-flat-shine" cx=".35" cy=".28" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>' +
    '<linearGradient id="ry-cedge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".35" stop-color="#fff" stop-opacity=".18"/><stop offset=".7" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>' +
    '<radialGradient id="ry-cshine" cx=".35" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></radialGradient>' +
    '<linearGradient id="ry-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#e2bd62"/><stop offset=".7" stop-color="#a8792a"/><stop offset="1" stop-color="#f3d98b"/></linearGradient>' +
    '<linearGradient id="ry-goldh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8792a"/><stop offset=".5" stop-color="#fff0b8"/><stop offset="1" stop-color="#a8792a"/></linearGradient>' +
    '</defs></svg>';

  /* ============================== the wheel ============================== */
  const N37 = 37, STEP = TAU / N37;
  const pocketAngle = (n) => -Math.PI / 2 + M.WHEEL.indexOf(n) * STEP;   // head-local, 0 at the top, clockwise
  const P2 = (r, a) => (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
  function sector(r0, r1, a0, a1) { return 'M' + P2(r1, a0) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + P2(r1, a1) + 'L' + P2(r0, a1) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + P2(r0, a0) + 'Z'; }
  const POCKET_R = 131, RIM_R = 247;
  /* the static bowl: wood rim, ball track, apron with eight diamonds */
  function bowlSvg() {
    let grain = '';
    for (let i = 0; i < 26; i++) { const r = 284 + (i % 7) * 2.2, a0 = (i * 0.83) % TAU, a1 = a0 + 0.5 + (i % 5) * 0.18; grain += '<path d="M' + P2(r, a0) + 'A' + r + ' ' + r + ' 0 0 1 ' + P2(r, a1) + '" stroke="#1a0603" stroke-width="' + (0.6 + (i % 3) * 0.4) + '" opacity=".35" fill="none"/>'; }
    let dia = '';
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + TAU / 16, x = 208 * Math.cos(a), y = 208 * Math.sin(a), deg = a * 180 / Math.PI + (i % 2 ? 0 : 90);
      dia += '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + deg.toFixed(1) + ')"><path d="M0 -15L6 0L0 15L-6 0Z" fill="url(#ry-w-chrome)" stroke="#5c4316" stroke-width=".8"/><path d="M0 -15L6 0L0 0Z" fill="#fff" opacity=".45"/></g>';
    }
    return '<svg class="ry-bowl" viewBox="-300 -300 600 600" aria-hidden="true"><defs>' +
      '<radialGradient id="ry-w-wood" r=".5"><stop offset=".88" stop-color="#2a0c05"/><stop offset=".93" stop-color="#7a3416"/><stop offset=".97" stop-color="#4a1a0a"/><stop offset="1" stop-color="#1c0703"/></radialGradient>' +
      '<radialGradient id="ry-w-track" r=".5"><stop offset=".72" stop-color="#160803"/><stop offset=".8" stop-color="#4b2412"/><stop offset=".88" stop-color="#6b361b"/><stop offset=".94" stop-color="#2a1006"/></radialGradient>' +
      '<radialGradient id="ry-w-apron" r=".5"><stop offset=".6" stop-color="#0c0503"/><stop offset=".77" stop-color="#2b140a"/></radialGradient>' +
      '<linearGradient id="ry-w-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d0"/><stop offset=".5" stop-color="#c99a35"/><stop offset="1" stop-color="#6b4a12"/></linearGradient>' +
      '<linearGradient id="ry-w-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<circle r="299" fill="url(#ry-w-wood)"/>' + grain +
      '<circle r="298" fill="none" stroke="url(#ry-gold)" stroke-width="3"/>' +
      '<circle r="282" fill="url(#ry-w-track)"/><circle r="282" fill="none" stroke="#e2bd62" stroke-width="2.4"/>' +
      '<path d="' + sector(236, 280, Math.PI * 1.05, Math.PI * 1.62) + '" fill="url(#ry-w-sheen)"/>' +
      '<circle r="232" fill="url(#ry-w-apron)"/><circle r="232" fill="none" stroke="#1a0904" stroke-width="2"/>' + dia +
      '<circle r="186" fill="none" stroke="url(#ry-gold)" stroke-width="4"/></svg>';
  }
  /* the turning head: number ring, pockets with gold frets, the cone and the turret */
  function headSvg() {
    let nums = '', pockets = '', frets = '';
    M.WHEEL.forEach((n, i) => {
      const a = -Math.PI / 2 + i * STEP, a0 = a - STEP / 2, a1 = a + STEP / 2;
      const c = n === 0 ? '#0e6b3c' : M.isRed(n) ? '#a50f22' : '#121014';
      nums += '<path d="' + sector(150, 184, a0, a1) + '" fill="' + c + '"/>';
      nums += '<text transform="rotate(' + (a * 180 / Math.PI + 90).toFixed(2) + ') translate(0 -160)" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="19" fill="#f6eedb">' + n + '</text>';
      pockets += '<path d="' + sector(112, 150, a0, a1) + '" fill="' + c + '"/>';
      frets += '<path d="M' + P2(110, a0) + 'L' + P2(184, a0) + '" stroke="url(#ry-w-fret)" stroke-width="2.2"/>';
    });
    let cone = '';
    for (let i = 0; i < 16; i++) cone += '<path d="' + sector(40, 110, i * TAU / 16, (i + 1) * TAU / 16) + '" fill="' + (i % 2 ? '#5a2410' : '#6e2e15') + '"/>';
    let arms = '';
    for (let i = 0; i < 4; i++) arms += '<g transform="rotate(' + (i * 90 + 45) + ')"><path d="M-4 -30L-2.5 -92L2.5 -92L4 -30Z" fill="url(#ry-w-arm)"/><circle cy="-96" r="8" fill="url(#ry-w-knob)"/></g>';
    return '<svg class="ry-headsvg" viewBox="-300 -300 600 600" aria-hidden="true"><defs>' +
      '<linearGradient id="ry-w-fret" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5a18"/><stop offset=".5" stop-color="#fff0b8"/><stop offset="1" stop-color="#7a5a18"/></linearGradient>' +
      '<radialGradient id="ry-w-cone" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>' +
      '<linearGradient id="ry-w-arm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5a18"/><stop offset=".45" stop-color="#fff3c4"/><stop offset="1" stop-color="#8a6420"/></linearGradient>' +
      '<radialGradient id="ry-w-knob" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffbe6"/><stop offset=".4" stop-color="#e2bd62"/><stop offset="1" stop-color="#5c4316"/></radialGradient></defs>' +
      nums + pockets + '<circle r="150" fill="none" stroke="#e2bd62" stroke-width="1.6"/>' +
      '<circle r="131" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="38"/><circle r="115" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="6"/>' + frets +
      '<circle r="111" fill="#e2bd62"/><circle r="109" fill="#3a1608"/>' + cone + '<circle r="110" fill="url(#ry-w-cone)"/>' +
      '<circle r="44" fill="none" stroke="url(#ry-gold)" stroke-width="3"/>' + arms +
      '<circle r="32" fill="url(#ry-w-knob)"/><circle r="20" fill="none" stroke="#7a5a18" stroke-width="1.5"/><circle r="11" fill="url(#ry-w-knob)"/>' +
      '<path d="' + B.batPath + '" transform="translate(-14 -6.8) scale(.233)" fill="#3a0610" opacity=".75"/></svg>';
  }
  /* the wheel's wooden side, seen below the tilted top */
  function skirtSvg(k) {
    const ry = (299 * k).toFixed(1), dd = 26;
    return '<svg class="ry-skirt" viewBox="-300 -300 600 600" aria-hidden="true"><defs><linearGradient id="ry-w-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#140502"/><stop offset=".28" stop-color="#5a2410"/><stop offset=".55" stop-color="#83391a"/><stop offset="1" stop-color="#120401"/></linearGradient></defs>' +
      '<path d="M-299 0A299 ' + ry + ' 0 0 0 299 0L299 ' + dd + 'A299 ' + ry + ' 0 0 1 -299 ' + dd + 'Z" fill="url(#ry-w-side)"/>' +
      '<path d="M-299 ' + (dd * 0.55) + 'A299 ' + ry + ' 0 0 0 299 ' + (dd * 0.55) + '" stroke="#e2bd62" stroke-width="3" fill="none" opacity=".75"/></svg>';
  }
  /* the wheel's motion: a slow idle turn, plus a push from the croupier at each spin (deterministic in time) */
  const W_IDLE = 0.42, W_PUSH = TAU * 1.1, W_TAU = 2.6;
  function wheelAngle(cur, t) {
    let a = W_IDLE * (t % 100000) + W_PUSH * ((cur.id || 1) - 1);
    if (t > cur.t0) a += W_PUSH * (1 - Math.exp(-(t - cur.t0) / W_TAU));
    return a;
  }
  /* The ball's path for one spin. Relative to the head it runs against the turn, slowing exponentially on the rim, drops
     at td, rattles to rest by ts and then rides its pocket. The launch speed is nudged so it always leaves the
     croupier's hand at the same spot, and the total travel ends exactly on the winning pocket. */
  const LAUNCH = Math.PI * 0.62;
  function makePath(spin) {
    const rnd = mulberry((spin.id * 7919 + spin.number * 104729) | 0), D = spin.D;
    const td = D * (0.6 + 0.05 * rnd()), ts = D * (0.9 + 0.035 * rnd()), lam = D * (0.48 + 0.08 * rnd());
    const sd = Math.exp(-td / lam), J = lam * (1 - sd) + sd * (ts - td) / 3;
    const phi = pocketAngle(spin.number), W0 = wheelAngle({ id: spin.id, t0: spin.t0 }, spin.t0);
    const base = TAU * (D < 5 ? 4.5 : 8.5) / J;
    const s0 = base + (((LAUNCH - W0 - phi - base * J) % TAU) + TAU) % TAU / J;
    return { id: spin.id, t0: spin.t0, D, td, ts, lam, sd, J, s0, phi, number: spin.number, cur: { id: spin.id, t0: spin.t0 },
      amp: (0.1 + 0.16 * rnd()) * (rnd() < 0.5 ? -1 : 1), m: 1.2 + rnd() * 1.6, nb: 4 + Math.floor(rnd() * 3) };
  }
  function travelled(P, tau) {
    if (tau <= 0) return 0;
    if (tau < P.td) return P.lam * (1 - Math.exp(-tau / P.lam));
    const rim = P.lam * (1 - P.sd);
    if (tau < P.ts) { const p = (tau - P.td) / (P.ts - P.td); return rim + P.sd * (P.ts - P.td) * (1 - Math.pow(1 - p, 3)) / 3; }
    return P.J;
  }
  /* -> {a: absolute angle, r: radius (wheel units), z: hop height, on: visible, stage: 'hand'|'rim'|'drop'|'pocket', p} */
  function ballAt(P, t) {
    const tau = t - P.t0, W = wheelAngle(P.cur, t);
    if (tau < 0) return { on: false };
    let R = P.phi + P.s0 * (P.J - travelled(P, tau)), r, z = 0, stage, p = 0;
    if (tau < P.td) {
      const k = tau / P.td;
      r = RIM_R - 7 * k * k * k; stage = 'rim';
      if (tau < 0.35) { r = RIM_R + 3 - (tau / 0.35) * 3; z = 8 * (1 - tau / 0.35); stage = 'hand'; }
    } else if (tau < P.ts) {
      p = (tau - P.td) / (P.ts - P.td);
      const fall = 1 - Math.pow(1 - p, 2.2), hop = Math.abs(Math.sin(Math.PI * P.nb * p)) * Math.pow(1 - p, 1.4);
      r = (RIM_R - 7) + (POCKET_R - (RIM_R - 7)) * fall + 17 * hop; z = 11 * hop * (1 - p);
      R += P.amp * Math.sin(TAU * P.m * p) * Math.pow(1 - p, 2) * Math.min(1, p * 6);
      stage = 'drop';
    } else { r = POCKET_R; stage = 'pocket'; }
    return { on: true, a: R + W, r, z, stage, p, tau };
  }

  /* ============================== the layouts (logical px; the stage is scaled to fit) ============================== */
  const LAY = {
    wide: { name: 'wide', W: 1600, H: 800, wheel: { x: 300, y: 248, R: 245, k: 0.6 },
      table: { x: 640, y: 34, ZW: 72, CW: 66, CH: 86, COLW: 72, DZ: 56, EV: 58, vert: false },
      track: { x: 640, y: 432, L: 936, H: 172, bw: 50, vert: false }, trackToggle: false,
      hist: { x: 28, y: 444, w: 572, h: 336 }, rail: { x: 640, y: 642, w: 936, h: 138 }, timer: { x: 562, y: 66 }, focus: null, call: { x: 1108, y: 220 }, win: { x: 300, y: 440 } },
    compact: { name: 'compact', W: 1500, H: 520, wheel: { x: 230, y: 218, R: 200, k: 0.6 },
      table: { x: 520, y: 52, ZW: 66, CW: 68, CH: 92, COLW: 66, DZ: 62, EV: 64, vert: false },
      track: { x: 520, y: 92, L: 948, H: 320, bw: 66, rx: 130, vert: false }, trackToggle: true,
      hist: { x: 20, y: 404, w: 440, h: 106 }, rail: null, timer: { x: 448, y: 46 }, focus: { x: 760, y: 250, s: 1.12 }, call: { x: 1210, y: 250 }, win: { x: 230, y: 392 } },
    tall: { name: 'tall', W: 600, H: 1000, wheel: { x: 162, y: 138, R: 138, k: 0.62 },
      table: { x: 44, y: 262, ZW: 54, CW: 52, CH: 128, COLW: 52, DZ: 64, EV: 64, vert: true },
      track: { x: 110, y: 266, L: 700, H: 380, bw: 80, rx: 100, vert: true }, trackToggle: true,
      hist: { x: 318, y: 16, w: 266, h: 236 }, rail: null, timer: { x: 40, y: 36 }, focus: { x: 300, y: 600, s: 2.0 }, call: { x: 300, y: 870 }, win: { x: 300, y: 760 } },
  };

  /* ---------- the betting layout: geometry, drawing and hit-testing, in "table space" (horizontal: zero on the left) ---------- */
  const EVENS = ['low', 'even', 'red', 'black', 'odd', 'high'];
  const EVEN_LABEL = { low: '1–18', even: 'EVEN', odd: 'ODD', high: '19–36' };
  function tableGeom(t) {
    const { ZW, CW, CH, COLW, DZ, EV } = t, vert = !!t.vert;
    const len = ZW + 12 * CW + COLW, dep = 3 * CH + DZ + EV, G0 = ZW, G1 = ZW + 12 * CW, GY = 3 * CH;
    const num = (c, r) => 3 * c + 3 - r;
    const rectN = (n) => { if (n === 0) return { x: 0, y: 0, w: ZW, h: GY }; const c = Math.floor((n - 1) / 3), r = 2 - ((n - 1) % 3); return { x: G0 + c * CW, y: r * CH, w: CW, h: CH }; };
    const rectO = {};
    for (let i = 1; i <= 3; i++) { rectO['d' + i] = { x: G0 + (i - 1) * 4 * CW, y: GY, w: 4 * CW, h: DZ }; rectO['c' + i] = { x: G1, y: (3 - i) * CH, w: COLW, h: CH }; }
    EVENS.forEach((k, i) => { rectO[k] = { x: G0 + i * 2 * CW, y: GY + DZ, w: 2 * CW, h: EV }; });
    const ctr = (r) => [r.x + r.w / 2, r.y + r.h / 2];
    function anchor(key) {
      if (rectO[key]) return ctr(rectO[key]);
      const ns = M.SPOTS[key]; if (!ns) return [0, 0];
      if (ns.length === 1) return ns[0] === 0 ? [ZW * 0.56, GY / 2] : ctr(rectN(ns[0]));
      if (ns[0] === 0) {
        if (ns.length === 4) return [G0, GY];
        if (ns.length === 3) return [G0, ns[2] === 2 ? 2 * CH : CH];
        return [G0, ctr(rectN(ns[1]))[1]];
      }
      const kind = M.KIND[key];
      if (kind === 'street') return [ctr(rectN(ns[0]))[0], GY];
      if (kind === 'line') return [rectN(ns[0]).x + CW, GY];
      let x = 0, y = 0; for (const n of ns) { const c = ctr(rectN(n)); x += c[0]; y += c[1]; }
      return [x / ns.length, y / ns.length];
    }
    function hit(u, v) {
      const eu = 0.25, ev = 0.25;
      if (u < -4 || v < -4 || u > len + 4 || v > dep + 4) return null;
      if (v > GY + CH * ev * 0.6) {
        if (u < G0 || u > G1) return null;
        if (v < GY + DZ) return 'd' + (1 + Math.min(2, Math.floor((u - G0) / (4 * CW))));
        return EVENS[Math.min(5, Math.floor((u - G0) / (2 * CW)))];
      }
      if (u > G1) return v < GY ? 'c' + (3 - Math.min(2, Math.floor(v / CH))) : null;
      const fu = (u - G0) / CW, c = Math.floor(fu), cf = fu - c;
      if (v > GY - CH * ev) {   // the bottom edge: streets and six lines
        if (u < G0 - ZW * 0.22) return 'n0';
        if (u < G0 + CW * eu) return 'n0-1-2-3';
        if (cf < eu && c > 0) return M.keyOf([3 * c - 2, 3 * c - 1, 3 * c, 3 * c + 1, 3 * c + 2, 3 * c + 3]);
        if (cf > 1 - eu && c < 11) return M.keyOf([3 * c + 1, 3 * c + 2, 3 * c + 3, 3 * c + 4, 3 * c + 5, 3 * c + 6]);
        return M.keyOf([3 * c + 1, 3 * c + 2, 3 * c + 3]);
      }
      const fv = v / CH, r = Math.max(0, Math.min(2, Math.floor(fv))), rf = fv - Math.floor(fv);
      const nearH = (rf < ev && r > 0) || (rf > 1 - ev && r < 2), rb = rf < ev ? r - 1 : r;
      if (u < G0 + CW * eu) {   // along zero
        if (u < G0 - ZW * 0.22) return 'n0';
        if (nearH) return rb === 0 ? 'n0-2-3' : 'n0-1-2';
        return M.keyOf([0, num(0, r)]);
      }
      const nearV = (cf < eu && c > 0) || (cf > 1 - eu && c < 11), cb = cf < eu ? c - 1 : c;
      if (nearV && nearH) { const n = 3 * cb + 2 - rb; return M.keyOf([n, n + 1, n + 3, n + 4]); }
      if (nearV) return M.keyOf([num(cb, r), num(cb + 1, r)]);
      if (nearH) return M.keyOf([num(c, rb), num(c, rb + 1)]);
      return 'n' + num(Math.max(0, Math.min(11, c)), r);
    }
    const toStage = vert ? (u, v) => [t.x + dep - v, t.y + u] : (u, v) => [t.x + u, t.y + v];
    const w = vert ? dep : len, hgt = vert ? len : dep;
    /* drawing */
    const upright = (x, y) => (vert ? ' transform="rotate(-90 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '');
    const fz = Math.min(CW, CH) * (vert ? 0.5 : 0.4);
    let cells = '', hls = '', lines = '';
    const zr = rectN(0);
    const zpath = 'M' + ZW + ' 0V' + GY + 'H' + (ZW * 0.42) + 'Q4 ' + GY + ' 2 ' + (GY / 2) + 'Q4 0 ' + (ZW * 0.42) + ' 0Z';
    cells += '<path d="' + zpath + '" fill="url(#ry-t-green)"/>';
    hls += '<path class="hl" data-n="0" d="' + zpath + '"/>';
    const zc = [ZW * 0.56, GY / 2];
    cells += '<text x="' + zc[0] + '" y="' + (zc[1] + fz * 0.36) + '" class="tn"' + upright(zc[0], zc[1]) + ' font-size="' + (fz * 1.1).toFixed(1) + '">0</text>';
    for (let n = 1; n <= 36; n++) {
      const r = rectN(n), c = ctr(r), red = M.isRed(n);
      cells += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="url(#ry-t-' + (red ? 'red' : 'black') + ')"/>';
      cells += '<text x="' + c[0] + '" y="' + (c[1] + fz * 0.36).toFixed(1) + '" class="tn"' + upright(c[0], c[1]) + ' font-size="' + fz.toFixed(1) + '">' + n + '</text>';
      hls += '<rect class="hl" data-n="' + n + '" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>';
    }
    const ofz = Math.min(DZ, EV, CW * 1.2) * 0.34;
    for (const k in rectO) {
      const r = rectO[k], c = ctr(r);
      hls += '<rect class="hlo" data-k="' + k + '" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>';
      let lab;
      if (k[0] === 'd') lab = ['1st 12', '2nd 12', '3rd 12'][+k[1] - 1];
      else if (k[0] === 'c') lab = '2 to 1';
      if (k === 'red' || k === 'black') {
        const dw = Math.min(r.w * 0.34, 48), dh = Math.min(r.h * 0.36, 22);
        cells += '<path d="M' + (c[0] - dw) + ' ' + c[1] + 'L' + c[0] + ' ' + (c[1] - dh) + 'L' + (c[0] + dw) + ' ' + c[1] + 'L' + c[0] + ' ' + (c[1] + dh) + 'Z" fill="url(#ry-t-' + k + ')" stroke="#e2bd62" stroke-width="1.6"/>';
      } else if (k[0] === 'c') {
        cells += '<text x="' + c[0] + '" y="' + (c[1] + ofz * 0.34) + '" class="tl"' + upright(c[0], c[1]) + ' font-size="' + (ofz * (vert ? 1.05 : 0.95)).toFixed(1) + '">' + lab + '</text>';
      } else {
        cells += '<text x="' + c[0] + '" y="' + (c[1] + ofz * 0.36) + '" class="tl" font-size="' + ofz.toFixed(1) + '">' + (lab || EVEN_LABEL[k]) + '</text>';
      }
    }
    /* gold rules */
    const L = (x1, y1, x2, y2) => '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '"/>';
    for (let c = 0; c <= 12; c++) lines += L(G0 + c * CW, 0, G0 + c * CW, GY);
    lines += L(G0, GY, G0, dep) + L(G1, GY, G1, dep);
    for (let r = 0; r <= 3; r++) lines += L(G0, r * CH, G1 + COLW, r * CH);
    lines += L(G0, GY + DZ, G1, GY + DZ) + L(G0, dep, G1, dep) + L(G1 + COLW, 0, G1 + COLW, GY);
    for (let i = 1; i < 6; i++) lines += L(G0 + i * 2 * CW, GY + DZ, G0 + i * 2 * CW, dep);
    for (let i = 1; i < 3; i++) lines += L(G0 + i * 4 * CW, GY, G0 + i * 4 * CW, GY + DZ);
    const gT = vert ? ' transform="translate(' + dep + ' 0) rotate(90)"' : '';
    const svg = '<svg class="ry-tsvg" viewBox="-6 -6 ' + (w + 12) + ' ' + (hgt + 12) + '" width="' + (w + 12) + '" height="' + (hgt + 12) + '" aria-hidden="true"><defs>' +
      '<linearGradient id="ry-t-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0182e"/><stop offset="1" stop-color="#7d0a1a"/></linearGradient>' +
      '<linearGradient id="ry-t-black" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26222c"/><stop offset="1" stop-color="#0b090e"/></linearGradient>' +
      '<linearGradient id="ry-t-green" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b5c33"/><stop offset="1" stop-color="#11804a"/></linearGradient></defs>' +
      '<g' + gT + '><rect x="-3" y="-3" width="' + (len + 6) + '" height="' + (dep + 6) + '" rx="10" fill="rgba(0,0,0,.28)"/>' +
      '<g class="cells">' + cells + '</g><g class="hls">' + hls + '</g>' +
      '<g class="lines" fill="none" stroke="#e2bd62" stroke-width="2" stroke-linecap="square">' + lines + '<path d="' + zpath + '"/></g>' +
      '<rect class="hit" x="-4" y="-4" width="' + (len + 8) + '" height="' + (dep + 8) + '" fill="transparent"/></g></svg>';
    return { len, dep, w, h: hgt, anchor, hit, toStage, svg, rectN, rectO, ctr };
  }

  /* ---------- the racetrack (numbers in wheel order round a stadium; the four announced bets inside) ---------- */
  function trackGeom(t) {
    const L = t.L, H = t.H, bw = t.bw, r = t.rx || H / 2, ry = H / 2, vert = !!t.vert;
    const AO = 'A' + r + ' ' + ry + ' 0 0 ', AI = 'A' + (r - bw) + ' ' + (ry - bw) + ' 0 0 ';
    const top = M.WHEEL.slice(20), bottom = M.WHEEL.slice(1, 19).reverse(), left = M.WHEEL[19], right = 0;
    const xs = L - 2 * r, tw = xs / top.length, bwid = xs / bottom.length;
    const fz = vert ? Math.min(bw * 0.4, tw * 0.78) : Math.min(bw * 0.42, tw * 0.62);
    const upright = (x, y) => (vert ? ' transform="rotate(-90 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '');
    const fill = (n) => (n === 0 ? '#0e6b3c' : M.isRed(n) ? '#a50f22' : '#141018');
    let cells = '', centres = {};
    const cell = (n, d, cx, cy) => { centres[n] = [cx, cy]; cells += '<g class="rt-n" data-n="' + n + '"><path d="' + d + '" fill="' + fill(n) + '"/><path class="hl" d="' + d + '"/><text x="' + cx.toFixed(1) + '" y="' + (cy + fz * 0.36).toFixed(1) + '"' + upright(cx, cy) + ' font-size="' + fz.toFixed(1) + '">' + n + '</text></g>'; };
    top.forEach((n, i) => { const x0 = r + i * tw; cell(n, 'M' + x0 + ' 0H' + (x0 + tw) + 'V' + bw + 'H' + x0 + 'Z', x0 + tw / 2, bw / 2); });
    bottom.forEach((n, i) => { const x0 = r + i * bwid; cell(n, 'M' + x0 + ' ' + (H - bw) + 'H' + (x0 + bwid) + 'V' + H + 'H' + x0 + 'Z', x0 + bwid / 2, H - bw / 2); });
    cell(left, 'M' + r + ' 0' + AO + '0 ' + r + ' ' + H + 'V' + (H - bw) + AI + '1 ' + r + ' ' + bw + 'Z', r - (r - bw / 2) * 0.86, ry);
    cell(right, 'M' + (L - r) + ' 0' + AO + '1 ' + (L - r) + ' ' + H + 'V' + (H - bw) + AI + '0 ' + (L - r) + ' ' + bw + 'Z', L - r + (r - bw / 2) * 0.86, ry);
    /* inner sections: slanted borders between the top and bottom rows */
    const xt = (i) => r + i * tw, xb = (j) => r + j * bwid, yt = bw, yb = H - bw;
    const cuts = [[xt(3), xb(8)], [xt(8), xb(11)], [xt(13), xb(16)]];
    const big = 4000;
    const poly = (a, b) => 'M' + a[0] + ' ' + yt + 'L' + b[0] + ' ' + yt + 'L' + b[1] + ' ' + yb + 'L' + a[1] + ' ' + yb + 'Z';
    const inner = 'M' + r + ' ' + bw + 'H' + (L - r) + AI + '1 ' + (L - r) + ' ' + (H - bw) + 'H' + r + AI + '1 ' + r + ' ' + bw + 'Z';
    const regs = [['tiers', poly([-big, -big], cuts[0]), 'TIERS'], ['orphelins', poly(cuts[0], cuts[1]), 'ORPHELINS'], ['voisins', poly(cuts[1], cuts[2]), 'VOISINS'], ['zero', poly(cuts[2], [big, big]), 'ZÉRO']];
    let secs = '';
    regs.forEach(([id, d, lab], i) => {
      const a = i === 0 ? [bw + 10, bw + 10] : cuts[i - 1], b = i === 3 ? [L - bw - 10, L - bw - 10] : cuts[i];
      const cx = (a[0] + a[1] + b[0] + b[1]) / 4, cy = H / 2;
      const lf = Math.min(H * 0.1, (vert ? (H - 2 * bw) : ((b[0] + b[1]) / 2 - (a[0] + a[1]) / 2)) * 1.12 / lab.length, 26);
      secs += '<g class="rt-s" data-s="' + id + '" clip-path="url(#ry-rt-clip-' + t.id + ')"><path d="' + d + '" class="bg s' + i + '"/><path class="hl" d="' + d + '"/></g>' +
        '<text class="rt-lab" x="' + cx.toFixed(1) + '" y="' + (cy + lf * 0.36).toFixed(1) + '"' + upright(cx, cy) + ' font-size="' + lf.toFixed(1) + '">' + lab + '</text>';
    });
    let seps = cuts.map((c) => '<path d="M' + c[0] + ' ' + yt + 'L' + c[1] + ' ' + yb + '"/>').join('');
    top.forEach((n, i) => { if (i) seps += '<path d="M' + xt(i) + ' 0V' + bw + '"/>'; });
    bottom.forEach((n, i) => { if (i) seps += '<path d="M' + xb(i) + ' ' + (H - bw) + 'V' + H + '"/>'; });
    seps += '<path d="M' + r + ' 0V' + bw + 'M' + r + ' ' + (H - bw) + 'V' + H + 'M' + (L - r) + ' 0V' + bw + 'M' + (L - r) + ' ' + (H - bw) + 'V' + H + '"/>';
    const outer = 'M' + r + ' 0H' + (L - r) + AO + '1 ' + (L - r) + ' ' + H + 'H' + r + AO + '1 ' + r + ' 0Z';
    const w = vert ? H : L, hgt = vert ? L : H;
    const gT = vert ? ' transform="translate(' + H + ' 0) rotate(90)"' : '';
    const svg = '<svg class="ry-rsvg" viewBox="-4 -4 ' + (w + 8) + ' ' + (hgt + 8) + '" width="' + (w + 8) + '" height="' + (hgt + 8) + '" aria-hidden="true"><defs><clipPath id="ry-rt-clip-' + t.id + '"><path d="' + inner + '"/></clipPath></defs>' +
      '<g' + gT + '><path d="' + outer + '" fill="rgba(0,0,0,.3)"/>' + secs + cells +
      '<g fill="none" stroke="#e2bd62" stroke-width="1.8">' + seps + '<path d="' + outer + '" stroke-width="2.6"/><path d="' + inner + '"/></g></g></svg>';
    const toStage = vert ? (u, v) => [t.x + H - v, t.y + u] : (u, v) => [t.x + u, t.y + v];
    return { svg, w, h: hgt, centres, toStage };
  }

  /* ============================== the room ============================== */
  function roomSvg() {
    let folds = '';
    for (let i = 0; i < 7; i++) folds += '<path d="M' + (i * 36 + 4) + ' 0Q' + (i * 36 + 22) + ' 420 ' + (i * 36 + (i % 2 ? 14 : 30)) + ' 900" stroke="rgba(0,0,0,.35)" stroke-width="' + (10 + (i % 3) * 5) + '" fill="none"/><path d="M' + (i * 36 + 16) + ' 0Q' + (i * 36 + 30) + ' 420 ' + (i * 36 + 24) + ' 900" stroke="rgba(255,120,140,.08)" stroke-width="5" fill="none"/>';
    const drape = (flip) => '<g' + (flip ? ' transform="translate(1600 0) scale(-1 1)"' : '') + '><path d="M0 0H250Q236 170 186 320Q160 380 200 450Q236 560 214 900H0Z" fill="url(#ry-r-velvet)"/><g clip-path="url(#ry-r-dclip)">' + folds + '</g>' +
      '<path d="M178 420Q214 440 236 412" stroke="url(#ry-gold)" stroke-width="7" fill="none"/><circle cx="238" cy="414" r="9" fill="url(#ry-gold)"/><path d="M234 420L226 480L250 480L242 420Z" fill="#c99a35"/>' +
      '<path d="M0 0H270V22H0Z" fill="url(#ry-goldh)"/></g>';
    let sun = '';
    for (let i = 0; i < 19; i++) { const a = Math.PI + (i / 18) * Math.PI; sun += '<path d="M800 470L' + (800 + 560 * Math.cos(a)).toFixed(0) + ' ' + (470 + 560 * Math.sin(a)).toFixed(0) + '" stroke="#e2bd62" stroke-width="' + (i % 2 ? 1 : 2.2) + '" opacity="' + (i % 2 ? 0.08 : 0.14) + '"/>'; }
    let bats = '';
    for (let i = 0; i < 4; i++) bats += '<path class="rb" style="animation-delay:-' + (i * 3.1) + 's" d="' + B.batPath + '" transform="translate(' + (420 + i * 230) + ' ' + (110 + (i % 2) * 50) + ') scale(' + (0.18 + (i % 3) * 0.05) + ')" fill="#0a0105"/>';
    let candles = '';
    for (let i = 0; i < 7; i++) { const x = 680 + i * 40, y = 70 + Math.abs(3 - i) * 8; candles += '<path d="M' + x + ' ' + (y + 16) + 'V' + (y + 34) + '" stroke="#f6eedb" stroke-width="5"/><ellipse class="fl" cx="' + x + '" cy="' + (y + 10) + '" rx="4" ry="8" fill="#ffd27a"/><circle class="gl" cx="' + x + '" cy="' + (y + 10) + '" r="26" fill="url(#ry-r-glow)"/>'; }
    return '<svg class="ry-roomsvg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      '<linearGradient id="ry-r-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0510"/><stop offset=".6" stop-color="#1a030a"/><stop offset="1" stop-color="#0a0105"/></linearGradient>' +
      '<linearGradient id="ry-r-velvet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a0412"/><stop offset=".5" stop-color="#6e0a22"/><stop offset="1" stop-color="#2a020c"/></linearGradient>' +
      '<radialGradient id="ry-r-glow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="ry-r-pool" cx=".5" cy=".3" r=".6"><stop offset="0" stop-color="#ffcf8a" stop-opacity=".22"/><stop offset="1" stop-color="#ffcf8a" stop-opacity="0"/></radialGradient>' +
      '<pattern id="ry-r-damask" width="90" height="110" patternUnits="userSpaceOnUse"><path d="M45 14Q60 34 45 55Q30 34 45 14ZM45 55Q66 72 45 96Q24 72 45 55Z" fill="none" stroke="#e2bd62" stroke-width="1.2" opacity=".09"/><path d="' + B.batPath + '" transform="translate(30 47) scale(.25)" fill="#e2bd62" opacity=".06"/></pattern>' +
      '<clipPath id="ry-r-dclip"><path d="M0 0H250Q236 170 186 320Q160 380 200 450Q236 560 214 900H0Z"/></clipPath></defs>' +
      '<rect width="1600" height="900" fill="url(#ry-r-wall)"/><rect width="1600" height="900" fill="url(#ry-r-damask)"/>' +
      '<g>' + sun + '</g><path d="M520 900V430Q520 160 800 160Q1080 160 1080 430V900" fill="none" stroke="#e2bd62" stroke-width="3" opacity=".22"/>' +
      '<path d="M556 900V440Q556 196 800 196Q1044 196 1044 440V900" fill="none" stroke="#e2bd62" stroke-width="1.2" opacity=".16"/>' +
      bats + '<g class="chand"><path d="M800 0V58" stroke="#c99a35" stroke-width="3"/><path d="M670 96Q800 150 930 96" stroke="#c99a35" stroke-width="4" fill="none"/><path d="M690 86Q800 120 910 86" stroke="#e2bd62" stroke-width="2" fill="none"/>' + candles + '</g>' +
      drape(false) + drape(true) + '<rect width="1600" height="900" fill="url(#ry-r-pool)"/></svg>';
  }
  /* the felt the wheel and layout sit on, with a mahogany rail */
  function feltSvg(c) {
    const W = c.W, H = c.H, rr = c.name === 'tall' ? 40 : 56;
    return '<svg class="ry-feltsvg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><defs>' +
      '<radialGradient id="ry-f-felt" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#145c3e"/><stop offset=".6" stop-color="#0b4029"/><stop offset="1" stop-color="#05200f"/></radialGradient>' +
      '<linearGradient id="ry-f-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e2e15"/><stop offset=".5" stop-color="#3a1608"/><stop offset="1" stop-color="#1c0703"/></linearGradient>' +
      '<pattern id="ry-f-nap" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#000" stroke-width=".6" opacity=".12"/></pattern></defs>' +
      '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '" rx="' + rr + '" fill="url(#ry-f-rail)"/>' +
      '<rect x="3" y="3" width="' + (W - 6) + '" height="' + (H - 6) + '" rx="' + rr + '" fill="none" stroke="url(#ry-gold)" stroke-width="2.5"/>' +
      '<rect x="16" y="16" width="' + (W - 32) + '" height="' + (H - 32) + '" rx="' + (rr - 12) + '" fill="url(#ry-f-felt)"/>' +
      '<rect x="16" y="16" width="' + (W - 32) + '" height="' + (H - 32) + '" rx="' + (rr - 12) + '" fill="url(#ry-f-nap)"/>' +
      '<rect x="24" y="24" width="' + (W - 48) + '" height="' + (H - 48) + '" rx="' + (rr - 18) + '" fill="none" stroke="#e2bd62" stroke-width="1.2" opacity=".35"/>' +
      '<path d="' + B.batPath + '" transform="translate(' + (c.wheel.x - 90) + ' ' + (H - 70) + ') scale(1.5)" fill="#e2bd62" opacity="' + (c.name === 'wide' ? 0.05 : 0) + '"/></svg>';
  }
  /* the dolly: a gold bat on a crystal plinth, set on the winning number */
  const DOLLY = '<svg viewBox="0 0 60 60" aria-hidden="true"><ellipse cx="30" cy="52" rx="16" ry="5" fill="rgba(0,0,0,.45)"/>' +
    '<path d="M20 34L22 50Q30 54 38 50L40 34Z" fill="rgba(220,240,255,.55)" stroke="#fff" stroke-width=".8"/><ellipse cx="30" cy="34" rx="10" ry="3.4" fill="rgba(255,255,255,.7)"/>' +
    '<path d="' + B.batPath + '" transform="translate(4 8) scale(.43)" fill="url(#ry-gold)" stroke="#5c4316" stroke-width="1.5"/></svg>';

  /* ============================== poster ============================== */
  const POSTER = (function () {
    let segs = '';
    M.WHEEL.forEach((n, i) => { const a = -Math.PI / 2 + i * STEP; segs += '<path d="' + sector(62, 92, a - STEP / 2, a + STEP / 2) + '" fill="' + (n === 0 ? '#0e6b3c' : M.isRed(n) ? '#b3122a' : '#141018') + '"/>'; });
    return '<svg viewBox="0 0 300 380" aria-hidden="true"><defs>' +
      '<radialGradient id="ryp-bg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#6e0a22"/><stop offset=".6" stop-color="#2a0410"/><stop offset="1" stop-color="#0a0105"/></radialGradient>' +
      '<linearGradient id="ryp-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e2bd62"/><stop offset="1" stop-color="#8a6420"/></linearGradient>' +
      '<radialGradient id="ryp-w" r=".5"><stop offset=".6" stop-color="#3a1608"/><stop offset="1" stop-color="#1c0703"/></radialGradient>' +
      '<radialGradient id="ryp-ball" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9b2a8"/></radialGradient></defs>' +
      '<rect width="300" height="380" fill="url(#ryp-bg)"/>' +
      '<path d="M0 0H60Q52 120 30 200Q20 260 38 380H0Z" fill="#4a0618" opacity=".9"/><path d="M300 0H240Q248 120 270 200Q280 260 262 380H300Z" fill="#4a0618" opacity=".9"/>' +
      '<g transform="translate(150 150) scale(1 .62)"><circle r="122" fill="url(#ryp-w)" stroke="url(#ryp-g)" stroke-width="5"/><circle r="104" fill="#160803" stroke="#e2bd62" stroke-width="2"/>' + segs +
      '<circle r="62" fill="#5a2410" stroke="#e2bd62" stroke-width="2"/><circle r="18" fill="url(#ryp-g)"/>' +
      '<g fill="url(#ryp-g)"><rect x="-3" y="-56" width="6" height="40"/><rect x="-3" y="16" width="6" height="40"/><rect x="-56" y="-3" width="40" height="6"/><rect x="16" y="-3" width="40" height="6"/></g></g>' +
      '<circle cx="216" cy="118" r="7" fill="url(#ryp-ball)"/>' +
      '<path d="' + B.batPath + '" transform="translate(116 88) scale(.56)" fill="#0a0105"/>' +
      '<path d="M40 252H260L250 270L260 288H40L50 270Z" fill="#3a0610" stroke="url(#ryp-g)" stroke-width="2"/>' +
      '<text x="150" y="276" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="13" letter-spacing="4" fill="#f3d98b">HIGH ROLLER</text>' +
      '<text x="150" y="322" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="700" font-size="30" fill="url(#ryp-g)" stroke="#2a0508" stroke-width="1">Roulette</text>' +
      '<text x="150" y="356" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="700" font-size="30" fill="url(#ryp-g)" stroke="#2a0508" stroke-width="1">Royale</text></svg>';
  })();

  /* ============================== rules ============================== */
  const KIND_NAME = { straight: 'Straight up (one number)', split: 'Split (two)', street: 'Street, or 0-1-2 / 0-2-3 (three)', corner: 'Corner, or 0-1-2-3 (four)', line: 'Six line (six)', column: 'Column (twelve)', dozen: 'Dozen (twelve)', even: 'Red / Black, Odd / Even, 1–18 / 19–36' };
  function rules() {
    const kinds = ['straight', 'split', 'street', 'corner', 'line', 'column', 'dozen', 'even'];
    const cover = { straight: 1, split: 2, street: 3, corner: 4, line: 6, column: 12, dozen: 12, even: 18 };
    const rows = kinds.map((k) => '<tr><td>' + KIND_NAME[k] + '</td><td>' + (36 / cover[k] - 1) + ' to 1</td><td>' + fmt(M.SPOT_MAX_PER_NUMBER * cover[k]) + '</td><td>' + cover[k] + ' in 37</td></tr>').join('');
    const ann = Object.keys(M.ANNOUNCED).map((id) => { const a = M.ANNOUNCED[id]; return '<tr><td>' + a.name + '</td><td>' + a.chips + ' chips</td><td>' + a.parts.map(([k, c]) => (c > 1 ? c + '× ' : '') + M.SPOTS[k].join('/')).join(', ') + '</td></tr>'; }).join('');
    const live = B.online ? '<h3>The live wheel</h3><p>Everyone in the lounge plays the same wheel at the same time. Bets are open for <b>15 seconds</b>; then the croupier calls “no more bets” and the ball runs for 10 seconds. The number is drawn by the server when the spin is created and is never sent to anyone until betting has closed. The result stays up for 5 seconds before the next round. Your chips are taken as you place them and handed back if you take them off before betting closes. If you leave mid-spin your bets still ride and are paid as normal.</p>'
      : '<h3>Practice table</h3><p>Place your chips and press <b>Spin</b> (or Space). Online, Roulette Royale is one live wheel shared by every player in the High Roller Lounge.</p>';
    return '<p><b>Single-zero roulette for the High Roller Lounge.</b> 37 pockets, 0 to 36, in the European wheel order. Open to players of <b>level 5 and above</b>.</p>' + live +
      '<h3>Bets and payouts</h3><table><tr><th>Bet</th><th>Pays</th><th>Spot limit</th><th>Wins</th></tr>' + rows + '</table>' +
      '<p>Zero loses every outside bet (red/black, odd/even, high/low, dozens and columns). Chips are 2,000 to 250,000 BB; each spot takes at least 2,000 and at most 250,000 for every number it covers. Up to 10,000,000 BB on the table per spin.</p>' +
      '<h3>The racetrack</h3><p>The oval shows the numbers in wheel order. Tap a number to bet it with its neighbours (set how many either side with the ± control; one chip each). Tap a section for an announced bet, placed as these chips at your chosen value:</p>' +
      '<table><tr><th>Bet</th><th>Size</th><th>Chips on</th></tr>' + ann + '</table>' +
      '<h3>Controls</h3><p>Pick a chip, then tap the layout: the middle of a number, a line between two numbers (split), a corner (four), the bottom edge (street), the bottom edge on a line (six line), or the line by zero. Right-click or Undo takes chips back. Keys: <b>1</b>–<b>7</b> chips, <b>U</b> undo, <b>C</b> clear, <b>X</b> double, <b>R</b> rebet, <b>T</b> racetrack' + (B.online ? '' : ', <b>Space</b> spin, <b>Q</b> quick spin') + '.</p>' +
      '<h3>Return</h3><p>Every bet returns <b>36/37 = 97.30%</b> (house edge 2.70%), exactly, for every one of the 157 spots on the layout. A simulation of 10,000,000 spins of mixed random bets (inside, outside, announced and neighbours) measured 97.20%. The biggest return one spin can pay is <b>' + fmt(M.maxWin()) + ' BB</b>, with every limit filled around one number; a full straight-up bet of 250,000 BB pays 9,000,000 BB (35 to 1 plus the stake).</p>' +
      '<p class="rtp">Return to player 97.30% (exact; 97.20% in 10,000,000 simulated spins). Max win per spin ' + fmt(M.maxWin()) + ' BB. Batty Bucks have no cash value.</p>';
  }

  /* ============================== memory and sound ============================== */
  let S = null, G = null;
  const mem = { chip: 2, last: null, hist: [], quick: false, k: 2, track: false };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) { if (raw.chip >= 0 && raw.chip < M.CHIPS.length) mem.chip = raw.chip | 0; if (raw.last && typeof raw.last === 'object') mem.last = raw.last; if (Array.isArray(raw.hist)) mem.hist = raw.hist.filter((n) => n >= 0 && n <= 36).slice(0, 500); mem.quick = !!raw.quick; if (raw.k >= 0 && raw.k <= 4) mem.k = raw.k | 0; mem.track = !!raw.track; } } catch (e) { /* memory only */ }
  const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* memory only */ } };

  const A = B.audio;
  const snd = {
    chip(n) { B.sfx('chip'); for (let i = 0; i < Math.min(n || 1, 4); i++) A.noise({ d: 0.02, v: 0.08, hp: 4200, t: 0.02 + i * 0.04 }); },
    clack(n) { for (let i = 0; i < Math.min(n || 3, 7); i++) { A.tone({ f: 2300 + ((i * 397) % 900), d: 0.025, type: 'square', v: 0.03, t: i * 0.045 }); A.noise({ d: 0.02, v: 0.09, hp: 3800, t: i * 0.045 }); } },
    sweep() { A.noise({ d: 0.4, v: 0.08, lp: 1400, f2: 400 }); },
    launch() { A.noise({ d: 0.25, v: 0.12, hp: 900, f2: 4000 }); A.tone({ f: 900, f2: 1600, d: 0.12, type: 'sine', v: 0.04 }); },
    whirr() { A.noise({ d: 0.9, v: 0.05, lp: 300, f2: 900 }); },
    roll(v) { A.noise({ d: 0.16, v: 0.02 + 0.05 * v, lp: 700 + 1600 * v }); },
    diamond() { A.tone({ f: 3400, f2: 2100, d: 0.04, type: 'square', v: 0.05 }); A.noise({ d: 0.04, v: 0.14, hp: 2600 }); },
    fret(v) { A.tone({ f: 2600 + Math.random() * 900, d: 0.025, type: 'triangle', v: 0.03 + 0.05 * v }); A.noise({ d: 0.025, v: 0.05 + 0.08 * v, hp: 3000 }); },
    settle() { A.tone({ f: 190, f2: 95, d: 0.12, type: 'sine', v: 0.22 }); A.noise({ d: 0.05, v: 0.12, hp: 2200 }); },
    open() { A.seq([523.3, 659.3, 784], { step: 0.09, type: 'triangle', v: 0.09 }); },
    close() { A.seq([784, 659.3, 523.3], { step: 0.11, type: 'triangle', v: 0.1 }); A.tone({ f: 130, d: 0.4, type: 'sine', v: 0.12, t: 0.3 }); },
    organ(notes, step, v) { A.seq(notes, { step: step || 0.16, type: 'sawtooth', v: v || 0.05, d: (step || 0.16) * 2.2 }); A.seq(notes.map((n) => (Array.isArray(n) ? [n[0] / 2, n[1]] : n / 2)), { step: step || 0.16, type: 'triangle', v: (v || 0.05) * 1.4, d: (step || 0.16) * 2.2 }); },
    win() { snd.organ([392, 493.9, 587.3, [784, 3]], 0.1, 0.05); },
    straight() { snd.organ([293.7, 392, 493.9, 587.3, [784, 4]], 0.1, 0.06); A.tone({ f: 1568, d: 0.9, type: 'sine', v: 0.08, t: 0.45 }); },
    lose() { A.tone({ f: 150, f2: 90, d: 0.3, type: 'sine', v: 0.1 }); },
    tick() { B.sfx('tick'); },
    click() { B.sfx('click'); },
  };

  /* ============================== the game ============================== */
  function mount(root) {
    S = B.scope();
    const live = B.online;
    let devOn = false; try { devOn = !live && localStorage.getItem('batty-dev') === '1'; } catch (e) { /* off */ }
    const dev = devOn ? (window.__royaleDev = { force: null, spins: 0, staked: 0, won: 0, last: null }) : null;
    const g = { bets: {}, undo: [], phase: 'bet', busy: false, paying: false, dead: false, lastWin: 0, res: null, sessionStaked: 0, sessionWon: 0, spins: 0, lastBest: 0 };
    G = g;
    const L = { ride: { spin: 0, bets: {} }, st: null, off: null, best: 1e9, age: 0, polling: false, sending: false, dirty: false, seq: 0, confirmed: {}, confTotal: 0, hist: [], histId: -1, settledQ: [], spinId: 0, phase: '', resultFor: 0, paidFor: 0, lastTick: 0 };
    const P = { id: 0, spin: null };   // practice spins
    let path = null, lastBall = null;
    const nowS = () => Date.now() / 1000 + (live ? (L.off || 0) : 0);
    const T = (ms) => (reduce ? Math.min(ms, 140) : ms);

    /* ---------- DOM ---------- */
    root.innerHTML = DEFS;
    const el = {};
    const room = h('div', { class: 'ry-room' });
    const bg = h('div', { class: 'ry-bg', html: roomSvg() });
    const view = h('div', { class: 'ry-view' });
    const stage = h('div', { class: 'ry-stage' });
    const felt = h('div', { class: 'ry-felt' });
    /* wheel */
    el.wheel = h('div', { class: 'ry-wheel' });
    el.wshadow = h('i', { class: 'ry-wshadow' });
    el.skirt = h('div', { class: 'ry-skirtw' });
    el.tilt = h('div', { class: 'ry-tilt' }, h('div', { class: 'ry-bowlw', html: bowlSvg() }), el.head = h('div', { class: 'ry-head', html: headSvg() }));
    el.ballSh = h('i', { class: 'ry-ballsh' }); el.ball = h('i', { class: 'ry-ball' });
    el.glint = h('i', { class: 'ry-glint' });
    el.medal = h('div', { class: 'ry-medal', 'aria-hidden': 'true' }, h('b'), h('small'));
    el.wheel.append(el.wshadow, el.skirt, el.tilt, el.ballSh, el.ball, el.glint, el.medal);
    /* table + racetrack + overlays */
    el.table = h('div', { class: 'ry-table' });
    el.track = h('div', { class: 'ry-track' });
    el.kbox = h('div', { class: 'ry-kbox' }, h('small', null, 'Neighbours'), el.kMinus = h('button', { type: 'button', 'aria-label': 'Fewer neighbours' }, '−'), el.kOut = h('output', null, '±2'), el.kPlus = h('button', { type: 'button', 'aria-label': 'More neighbours' }, '+'));
    el.bets = h('div', { class: 'ry-bets', 'aria-hidden': 'true' });
    el.others = h('div', { class: 'ry-others', 'aria-hidden': 'true' });
    el.dolly = h('div', { class: 'ry-dolly', html: DOLLY, 'aria-hidden': 'true' });
    el.tip = h('div', { class: 'ry-tip', 'aria-hidden': 'true' });
    el.timer = h('div', { class: 'ry-timer', hidden: true, html: '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="t"/><circle cx="22" cy="22" r="19" class="v"/></svg><b></b><small></small>' });
    el.call = h('div', { class: 'ry-call', 'aria-hidden': 'true' });
    el.winB = h('div', { class: 'ry-winb', 'aria-hidden': 'true' }, h('small', null, 'You win'), h('b'));
    el.hist = h('div', { class: 'ry-hist' });
    el.rail = h('div', { class: 'ry-rail' });
    el.shade = h('i', { class: 'ry-shade' });
    stage.append(felt, el.hist, el.rail, el.table, el.track, el.kbox, el.others, el.bets, el.dolly, el.tip, el.shade, el.wheel, el.timer, el.call, el.winB);
    view.append(stage);
    room.append(bg, h('div', { class: 'ry-motes', 'aria-hidden': 'true' }, ...Array.from({ length: 8 }, (_, i) => h('i', { style: '--x:' + (6 + i * 12) + '%;--d:' + (10 + (i % 4) * 3) + 's;--o:-' + i * 1.9 + 's' }))), view);

    /* the bar: totals, chip tray, actions and Spin / timer */
    el.msg = h('div', { class: 'ry-msg', role: 'status', 'aria-live': 'polite' }, h('span', null, ''));
    el.total = h('output', null, '0'); el.win = h('output', null, '0');
    el.info = h('div', { class: 'ry-info' }, h('span', { class: 'it' }, h('small', null, 'Total bet'), el.total), h('span', { class: 'it w' }, h('small', null, 'Last win'), el.win));
    el.chips = h('div', { class: 'ry-chips', role: 'radiogroup', 'aria-label': 'Chip value' });
    M.CHIPS.forEach((v, i) => el.chips.append(h('button', { type: 'button', class: 'ry-chip', role: 'radio', 'aria-label': fmt(v) + ' BB chip', html: chipFlat(v), onclick: () => { mem.chip = i; saveMem(); paintChips(); snd.chip(); } })));
    const ICON = {
      undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
      clear: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
      x2: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="13" fill="currentColor">×2</text></svg>',
      rebet: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      track: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="6" stroke="currentColor" stroke-width="2.2" fill="none"/><rect x="8" y="10" width="8" height="4" rx="2" fill="currentColor"/></svg>',
      grid: '<svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zM9 5v14M15 5v14M3 12h18" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
      quick: '<svg viewBox="0 0 24 24"><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor"/></svg>',
    };
    const btn = (cls, label, icon, fn) => h('button', { type: 'button', class: 'ry-btn ' + cls, 'aria-label': label, title: label, onclick: fn }, h('span', { class: 'ic', html: icon }), h('span', { class: 'lb' }, label.split(' ')[0]));
    el.undoB = btn('undo', 'Undo', ICON.undo, () => undo());
    el.clearB = btn('clear', 'Clear bets', ICON.clear, () => clearBets());
    el.x2B = btn('x2', 'Double bets', ICON.x2, () => doubleBets());
    el.rebetB = btn('rebet', 'Rebet', ICON.rebet, () => rebet());
    el.trackB = btn('trackb', 'Racetrack', ICON.track, () => { mem.track = !mem.track; saveMem(); snd.click(); paintTrackMode(); });
    el.quickB = live ? null : btn('quick', 'Quick spin', ICON.quick, () => { mem.quick = !mem.quick; saveMem(); snd.click(); paintToggles(); });
    el.acts = h('div', { class: 'ry-acts' }, el.undoB, el.clearB, el.x2B, el.rebetB, el.trackB, el.quickB);
    el.spinB = h('button', { type: 'button', class: 'ry-spin', 'aria-label': 'Spin' }, h('span', { class: 'ring' }), h('b', null, 'SPIN'), h('small', null, ''));
    el.go = h('div', { class: 'ry-go' }, el.spinB);
    el.tbar = h('div', { class: 'ry-tbar', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'ry-bar' }, el.tbar, el.msg, el.info, el.chips, el.acts, el.go);
    root.append(room, bar);
    if (live) root.classList.add('ry-live');

    /* ---------- the level gate ---------- */
    if (B.level < MIN_LEVEL) {
      root.append(h('div', { class: 'ry-gate', role: 'dialog', 'aria-label': 'High Roller Lounge locked' },
        h('div', { class: 'box' }, h('span', { class: 'rope', html: '<svg viewBox="0 0 240 80" aria-hidden="true"><path d="M30 20Q120 80 210 20" stroke="#a50f22" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M30 20Q120 80 210 20" stroke="#ff6b7d" stroke-width="2" fill="none" opacity=".5"/><rect x="18" y="8" width="24" height="70" rx="6" fill="url(#ry-gold)"/><rect x="198" y="8" width="24" height="70" rx="6" fill="url(#ry-gold)"/><circle cx="30" cy="8" r="12" fill="url(#ry-gold)"/><circle cx="210" cy="8" r="12" fill="url(#ry-gold)"/></svg>' }),
          h('h2', null, 'High Roller Lounge'), h('p', null, 'Roulette Royale opens at level ' + MIN_LEVEL + '. You are level ' + B.level + '. Keep playing anywhere on the floor to climb.'),
          h('button', { type: 'button', class: 'ry-gobtn', onclick: () => B.go('') }, 'Back to the lobby'))));
      g.dead = true;
    }

    /* ---------- layout ---------- */
    let C = null, SC = 1, TG = null, RG = null, focusOn = false;
    const pos = (e, x, y) => { e.style.left = x + 'px'; e.style.top = y + 'px'; };
    function applyLayout(c) {
      C = c; root.dataset.lay = c.name;
      stage.style.width = c.W + 'px'; stage.style.height = c.H + 'px';
      felt.innerHTML = feltSvg(c);
      const w = c.wheel;
      el.wheel.style.width = el.wheel.style.height = (w.R * 2) + 'px';
      el.wheel.style.left = (w.x - w.R) + 'px'; el.wheel.style.top = (w.y - w.R) + 'px';
      el.wheel.style.setProperty('--k', w.k); el.wheel.style.setProperty('--bs', (w.R / 300 * 15).toFixed(1) + 'px');
      el.skirt.innerHTML = skirtSvg(w.k);
      // the medallion rides on the wheel (it follows the focus zoom)
      el.medal.style.setProperty('--ms', (w.R / 245).toFixed(3));
      TG = tableGeom(c.table);
      el.table.innerHTML = TG.svg; el.table.style.left = (c.table.x - 6) + 'px'; el.table.style.top = (c.table.y - 6) + 'px';
      c.track.id = c.name;
      RG = trackGeom(c.track);
      el.track.innerHTML = RG.svg; el.track.style.left = (c.track.x - 4) + 'px'; el.track.style.top = (c.track.y - 4) + 'px';
      if (c.trackToggle) { pos(el.kbox, c.track.x + RG.w / 2, c.track.y + RG.h + (c.name === 'tall' ? 18 : 30)); }
      else pos(el.kbox, c.track.x + RG.w - 96, c.track.y + RG.h + 14);
      const hs = c.hist; Object.assign(el.hist.style, { left: hs.x + 'px', top: hs.y + 'px', width: hs.w + 'px', height: hs.h + 'px' });
      if (c.rail) { el.rail.hidden = false; Object.assign(el.rail.style, { left: c.rail.x + 'px', top: c.rail.y + 'px', width: c.rail.w + 'px', height: c.rail.h + 'px' }); } else el.rail.hidden = true;
      pos(el.timer, c.timer.x, c.timer.y);
      pos(el.call, c.call.x, c.call.y); pos(el.winB, c.win.x, c.win.y);
      const cs = Math.round(Math.min(c.table.CW, c.table.CH) * (c.name === 'tall' ? 0.78 : 0.66));
      stage.style.setProperty('--cs', cs + 'px');
      el.dolly.style.width = (cs * 1.55) + 'px';
      tableEls(); paintTrackMode(); paintBets(true); paintOthers(); paintHist(true); paintRail(true);
      if (g.res != null) placeDolly(g.res, false);
    }
    function layout() {
      const W0 = root.clientWidth, H0 = root.clientHeight;
      if (!W0 || !H0) return;
      const short = W0 > H0 * 1.3 && H0 < 560, phone = !short && W0 < 700;
      root.classList.toggle('ry-short', short); root.classList.toggle('ry-phone', phone);
      const vw = view.clientWidth, vh = view.clientHeight; if (!vw || !vh) return;
      const want = short ? LAY.compact : vw / vh < 1.05 ? LAY.tall : LAY.wide;
      if (want !== C) applyLayout(want);
      SC = Math.min(vw / C.W, vh / C.H);
      const left = (vw - C.W * SC) / 2, top = C === LAY.tall ? Math.max(0, (vh - C.H * SC) * 0.3) : (vh - C.H * SC) / 2;
      stage.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px) scale(' + SC.toFixed(4) + ')';
      root.style.setProperty('--sc', SC.toFixed(4));
    }
    const ro = new ResizeObserver(() => layout()); ro.observe(root); ro.observe(bar); S.on(window, 'resize', layout);
    function paintTrackMode() {
      if (!C) return;
      const showTrack = !C.trackToggle || mem.track;
      const showTable = !C.trackToggle || !mem.track;
      el.track.classList.toggle('off', !showTrack); el.kbox.classList.toggle('off', !showTrack);
      el.table.classList.toggle('off', !showTable); el.bets.classList.toggle('off', !showTable); el.others.classList.toggle('off', !showTable); el.dolly.classList.toggle('off', !showTable);
      el.trackB.hidden = !C.trackToggle;
      el.trackB.querySelector('.ic').innerHTML = mem.track ? ICON.grid : ICON.track;
      el.trackB.querySelector('.lb').textContent = mem.track ? 'Table' : 'Track';
      el.trackB.setAttribute('aria-label', mem.track ? 'Show the betting table' : 'Show the racetrack');
      el.kOut.textContent = '±' + mem.k; el.kMinus.disabled = mem.k <= 0; el.kPlus.disabled = mem.k >= 4;
    }

    /* ---------- table highlights ---------- */
    let nEl = {}, oEl = {}, rtN = {}, rtS = {};
    function tableEls() {
      nEl = {}; oEl = {}; rtN = {}; rtS = {};
      el.table.querySelectorAll('.hl').forEach((e) => { nEl[e.dataset.n] = e; });
      el.table.querySelectorAll('.hlo').forEach((e) => { oEl[e.dataset.k] = e; });
      el.track.querySelectorAll('.rt-n').forEach((e) => { rtN[e.dataset.n] = e; });
      el.track.querySelectorAll('.rt-s').forEach((e) => { rtS[e.dataset.s] = e; });
    }
    let hoverOn = [];
    function hover(nums, outs) {
      for (const e of hoverOn) e.classList.remove('hov');
      hoverOn = [];
      for (const n of nums || []) { if (nEl[n]) hoverOn.push(nEl[n]); if (rtN[n]) hoverOn.push(rtN[n]); }
      for (const k of outs || []) if (oEl[k]) hoverOn.push(oEl[k]);
      for (const e of hoverOn) e.classList.add('hov');
    }
    let winOn = [];
    function winGlow(n) {
      for (const e of winOn) e.classList.remove('win');
      winOn = [];
      if (n == null) return;
      if (nEl[n]) winOn.push(nEl[n]); if (rtN[n]) winOn.push(rtN[n]);
      for (const k in oEl) if (M.SPOTS[k].indexOf(n) >= 0) winOn.push(oEl[k]);
      for (const e of winOn) e.classList.add('win');
    }

    /* ---------- painting ---------- */
    function msg(text) { el.msg.firstChild.textContent = text; }
    let callT = 0;
    function call(html, cls, ms) {
      el.call.innerHTML = html; el.call.className = 'ry-call ' + (cls || '');
      void el.call.offsetWidth; el.call.classList.add('on');
      S.clear(callT); callT = S.timeout(() => el.call.classList.remove('on'), ms || 1600);
    }
    function paintChips() { [...el.chips.children].forEach((c, i) => { c.classList.toggle('on', i === mem.chip); c.setAttribute('aria-checked', i === mem.chip ? 'true' : 'false'); }); }
    function paintToggles() { if (el.quickB) { el.quickB.setAttribute('aria-pressed', mem.quick ? 'true' : 'false'); el.quickB.classList.toggle('on', mem.quick); } }
    const stackEls = {};
    function placeStack(key, amount, drop) {
      let s = stackEls[key];
      if (!amount) { if (s) { s.remove(); delete stackEls[key]; } return; }
      if (!s) {
        s = stackEls[key] = h('div', { class: 'ry-stack' });
        const a = TG.anchor(key), p = TG.toStage(a[0], a[1]);
        pos(s, p[0], p[1]); el.bets.append(s);
      }
      if (s.dataset.n !== String(amount)) { const grew = +(s.dataset.n || 0) < amount; s.dataset.n = amount; s.innerHTML = stackHtml(amount, 5, drop && grew); }
    }
    function paintBets(full) {
      if (!TG) return;
      if (full) { for (const k in stackEls) { stackEls[k].remove(); delete stackEls[k]; } }
      const want = g.bets;
      for (const k in stackEls) if (!want[k]) placeStack(k, 0);
      for (const k in want) placeStack(k, want[k], !full);
      el.total.textContent = fmt(M.totalOf(want));
      controls();
    }
    let othersKey = '';
    function paintOthers() {
      if (!TG) return;
      const sp = (live && L.st && L.st.spots) || {};
      const key = JSON.stringify(sp) + (C ? C.name : '');
      if (key === othersKey) return; othersKey = key;
      el.others.textContent = '';
      for (const k in sp) {
        const a = TG.anchor(k), p = TG.toStage(a[0], a[1]);
        const d = h('div', { class: 'ry-oth', title: 'Other players: ' + fmt(sp[k]) + ' BB' }, h('b', null, abbr(sp[k])));
        pos(d, p[0], p[1]); el.others.append(d);
      }
    }
    function controls() {
      const can = canBet(), any = M.totalOf(g.bets) > 0;
      el.undoB.disabled = !can || !g.undo.length;
      el.clearB.disabled = !can || !any;
      el.x2B.disabled = !can || !any;
      el.rebetB.disabled = !can || any || !mem.last || !Object.keys(mem.last).length;
      el.chips.classList.toggle('off', !can);
      root.classList.toggle('ry-locked', !can);
      if (!live) {
        el.spinB.disabled = g.phase !== 'bet' || g.busy || (!any && !(mem.last && Object.keys(mem.last).length));
        el.spinB.querySelector('b').textContent = g.phase === 'bet' ? (any || !mem.last ? 'SPIN' : 'REBET') : '···';
        el.spinB.querySelector('small').textContent = g.phase === 'bet' ? (any ? fmt(M.totalOf(g.bets)) + ' BB' : mem.last ? fmt(M.totalOf(mem.last)) + ' BB' : '') : '';
        el.spinB.classList.toggle('busy', g.phase !== 'bet');
      }
    }
    function liveGo(phase, left) {
      const b = el.spinB.querySelector('b'), s = el.spinB.querySelector('small');
      el.spinB.disabled = true;
      el.spinB.classList.toggle('busy', phase !== 'bet');
      el.spinB.classList.toggle('hot', phase === 'bet' && left <= 5);
      if (phase === 'bet') { b.textContent = String(Math.max(0, Math.ceil(left))); s.textContent = 'Bets close'; }
      else if (phase === 'spin') { b.textContent = '···'; s.textContent = 'No more bets'; }
      else if (phase === 'result' && g.res != null) { b.textContent = String(g.res); s.textContent = colName(g.res); }
      else { b.textContent = '···'; s.textContent = 'Next spin'; }
      el.spinB.dataset.c = phase === 'result' && g.res != null ? colCls(g.res) : '';
    }

    /* history, hot and cold */
    let histKey = '';
    function histList() { return live ? L.hist : mem.hist; }
    function paintHist(force) {
      const hs = histList().slice();
      const key = hs.slice(0, 200).join(',') + '|' + (C ? C.name : '') + '|' + (live && L.st ? L.st.live + ':' + L.st.players.length : '');
      if (!force && key === histKey) return; histKey = key;
      const last = hs.slice(0, C && C.name === 'tall' ? 11 : C && C.name === 'compact' ? 9 : 13);
      const win = hs.slice(0, 200), cnt = new Array(37).fill(0);
      for (const n of win) cnt[n]++;
      const order = [...Array(37).keys()].sort((a, b) => cnt[b] - cnt[a] || a - b);
      const hot = order.slice(0, 5), cold = order.slice(-5).reverse();
      const pc = (f) => (win.length ? Math.round(100 * win.filter(f).length / win.length) : 0);
      const red = pc((n) => M.isRed(n)), zero = pc((n) => n === 0), black = win.length ? 100 - red - zero : 0;
      const pill = (n, big) => '<i class="' + colCls(n) + (big ? ' big' : '') + '">' + n + '</i>';
      let html = '<div class="ry-last"><small>Last results</small><div class="strip">' + (last.length ? last.map((n, i) => pill(n, i === 0)).join('') : '<em>No spins yet</em>') + '</div></div>';
      if (win.length && win.length < 10) html += '<div class="ry-hc few"><small>Hot and cold numbers appear after 10 spins</small></div>';
      if (win.length >= 10) html += '<div class="ry-hc"><div class="hot"><small>Hot</small>' + hot.map((n) => '<span>' + pill(n) + '<b>' + cnt[n] + '</b></span>').join('') + '</div>' +
          '<div class="cold"><small>Cold</small>' + cold.map((n) => '<span>' + pill(n) + '<b>' + cnt[n] + '</b></span>').join('') + '</div></div>';
      if (win.length) {
        const odd = pc((n) => n && n % 2), low = pc((n) => n && n <= 18);
        const bar3 = (a, b, c, la, lc) => '<div class="b3"><span class="l">' + la + '</span><span class="bar"><i class="a" style="width:' + a + '%">' + a + '%</i><i class="z" style="width:' + b + '%"></i><i class="c" style="width:' + c + '%">' + c + '%</i></span><span class="l">' + lc + '</span></div>';
        html += '<div class="ry-dist"><small>' + (win.length === 1 ? 'Last spin' : 'Last ' + win.length + ' spins') + '</small>' + bar3(red, zero, black, 'Red', 'Black') + bar3(low, zero, 100 - low - zero, '1–18', '19–36') + bar3(odd, zero, 100 - odd - zero, 'Odd', 'Even') + '</div>';
      }
      if (live && L.st && C && C.name !== 'wide') html += '<button type="button" class="ry-who">' + L.st.players.length + ' betting · ' + L.st.live + ' in the lounge</button>';
      el.hist.innerHTML = html;
      const who = el.hist.querySelector('.ry-who'); if (who) who.onclick = () => showPlayers();
    }
    /* players at the table (wide: the rail; elsewhere a modal) */
    let railKey = '';
    function playersHtml(r) {
      if (!r) return '';
      let html = '<div class="cl"><h4>At the table <span>' + r.players.length + ' betting · ' + r.live + ' in the lounge</span></h4><div class="pl">';
      if (!r.players.length) html += '<p class="none">Nobody has bet on this spin yet. The wheel waits for no bat.</p>';
      const me = B.me && B.me.id;
      for (const p of r.players.slice(0, 12)) html += '<div class="p' + (p.id === me ? ' me' : '') + (p.win > 0 ? ' up' : '') + '">' + B.avatar(p.avatar, 30) + '<b>' + (p.id === me ? 'You' : esc(p.name)) + '</b><small>Lv ' + p.level + ' · ' + fmt(p.total) + '</small>' + (p.win != null ? '<em>' + (p.win > 0 ? '+' + fmt(p.win) : '–') + '</em>' : '') + '</div>';
      html += '</div></div>';
      if (r.winners && r.winners.spin) html += '<div class="wn"><small>Last spin · ' + r.winners.number + ' ' + colName(r.winners.number).toLowerCase() + '</small>' + (r.winners.list.length ? r.winners.list.slice(0, 4).map((w) => '<span>' + B.avatar(w.avatar, 18) + esc(w.name) + ' <b>+' + fmt(w.win) + '</b></span>').join('') : '<span class="none">No winners</span>') + '</div>';
      return html;
    }
    function paintRail(force) {
      if (!C || !C.rail) return;
      if (!live) {
        const key = 'p' + g.spins + ':' + g.sessionStaked + ':' + g.sessionWon;
        if (!force && key === railKey) return; railKey = key;
        el.rail.innerHTML = '<h4>Practice table <span>Online, this is one live wheel for the whole lounge</span></h4><div class="ps"><span><small>Spins</small><b>' + g.spins + '</b></span><span><small>Staked</small><b>' + fmt(g.sessionStaked) + '</b></span><span><small>Won</small><b>' + fmt(g.sessionWon) + '</b></span><span><small>Biggest win</small><b>' + fmt(g.lastBest || 0) + '</b></span></div>';
        return;
      }
      const r = L.st; if (!r) return;
      const key = JSON.stringify([r.players.map((p) => [p.id, p.total, p.win]), r.live, r.winners && r.winners.spin]);
      if (!force && key === railKey) return; railKey = key;
      el.rail.innerHTML = playersHtml(r);
    }
    function showPlayers() { if (!L.st) return; snd.click(); B.ui.modal('At the table', h('div', { class: 'ry-rail ry-modalrail', html: playersHtml(L.st) })); }

    /* ---------- placing bets ---------- */
    function canBet() {
      if (g.dead || g.busy) return false;
      if (!live) return g.phase === 'bet';
      const sp = L.st && L.st.spin; if (!sp) return false;
      const t = nowS();
      return g.phase === 'bet' && t >= sp.openAt - 0.3 && t < sp.closeAt - 0.5;
    }
    const committed = () => (live ? L.confTotal : 0);
    function setBets(next, why) {
      const total = M.totalOf(next), cur = M.totalOf(g.bets);
      if (total > cur && total - committed() > B.wallet.balance) { if (B.wallet.balance < M.SPOT_MIN) B.ui.broke(); else B.ui.toast('Not enough Batty Bucks for that.'); return false; }
      g.undo.push(clone(g.bets)); if (g.undo.length > 60) g.undo.shift();
      g.bets = next; paintBets(); queueSend();
      if (why !== 'quiet') snd.chip(Math.max(1, Object.keys(next).length - Object.keys(g.undo[g.undo.length - 1]).length));
      return true;
    }
    function addBets(add, label) {
      if (!canBet()) { if (live) B.ui.toast('No more bets: wait for the next spin.'); return; }
      const r = M.merge(g.bets, add);
      if (M.totalOf(r.bets) === M.totalOf(g.bets)) { B.ui.toast(M.totalOf(g.bets) >= M.TABLE_MAX ? 'The table limit is ' + fmt(M.TABLE_MAX) + ' BB.' : 'That spot is at its limit.'); return; }
      if (setBets(r.bets) && r.clipped) B.ui.toast('Some chips were trimmed to the table limits.');
      if (label) msg(label);
    }
    function removeFrom(key) {
      if (!canBet() || !g.bets[key]) return;
      const v = M.CHIPS[mem.chip], next = clone(g.bets), left = next[key] - v;
      if (left >= M.SPOT_MIN) next[key] = left; else delete next[key];
      setBets(next, 'quiet'); snd.clack(2);
    }
    function undo() { if (!canBet() || !g.undo.length) return; g.bets = g.undo.pop(); paintBets(true); queueSend(); snd.clack(2); }
    function clearBets() { if (!canBet() || !M.totalOf(g.bets)) return; g.undo.push(clone(g.bets)); sweepAway(Object.keys(g.bets)); g.bets = {}; paintBets(); queueSend(); snd.sweep(); }
    function doubleBets() {
      if (!canBet() || !M.totalOf(g.bets)) return;
      const r = M.merge(g.bets, g.bets);
      if (M.totalOf(r.bets) === M.totalOf(g.bets)) { B.ui.toast('Your bets are at the limits.'); return; }
      if (setBets(r.bets) && r.clipped) B.ui.toast('Some chips were trimmed to the table limits.');
    }
    function rebet() {
      if (!canBet() || !mem.last) return false;
      const r = M.merge({}, mem.last);
      if (!M.totalOf(r.bets)) return false;
      return setBets(r.bets);
    }
    function sweepAway(keys) {
      if (reduce) return;
      const w = C.wheel;
      for (const k of keys) {
        const s = stackEls[k]; if (!s) continue;
        const ghost = s.cloneNode(true); el.bets.append(ghost);
        const dx = w.x - parseFloat(s.style.left), dy = (w.y - w.R * 0.3) - parseFloat(s.style.top);
        ghost.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + dx * 0.25 + 'px,' + (dy * 0.25 - 30) + 'px) scale(.9)', opacity: 0.9, offset: 0.4 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.4)', opacity: 0 }], { duration: 520 + Math.random() * 140, easing: 'cubic-bezier(.5,0,.6,1)' }).finished.then(() => ghost.remove(), () => ghost.remove());
      }
    }

    /* ---------- pointer: the layout, the racetrack and the neighbours control ---------- */
    function tablePoint(e) {
      const gEl = el.table.querySelector('svg > g'); if (!gEl) return null;
      const m = gEl.getScreenCTM(); if (!m) return null;
      const svg = el.table.querySelector('svg'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(m.inverse());
      return TG.hit(q.x, q.y);
    }
    function spotLabel(key) {
      const ns = M.SPOTS[key], k = M.KIND[key];
      const names = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36', d1: '1st dozen', d2: '2nd dozen', d3: '3rd dozen', c1: '1st column', c2: '2nd column', c3: '3rd column' };
      const nm = names[key] || ({ straight: 'Straight ', split: 'Split ', street: ns[0] === 0 ? 'Trio ' : 'Street ', corner: ns[0] === 0 ? 'First four ' : 'Corner ', line: 'Six line ' }[k] + ns.join('-'));
      return nm + ' · pays ' + M.pays(key) + ' to 1';
    }
    S.on(el.table, 'click', (e) => { const k = tablePoint(e); if (k) addBets({ [k]: M.CHIPS[mem.chip] }, spotLabel(k)); });
    S.on(el.table, 'contextmenu', (e) => { e.preventDefault(); const k = tablePoint(e); if (k) removeFrom(k); });
    if (canHover) {
      S.on(el.table, 'pointermove', (e) => {
        const k = tablePoint(e);
        if (!k) { hover(); el.tip.classList.remove('on'); return; }
        const outs = /^n/.test(k) ? [] : [k];
        hover(M.SPOTS[k], outs);
        el.tip.textContent = spotLabel(k) + (g.bets[k] ? ' · ' + fmt(g.bets[k]) : '');
        const a = TG.anchor(k), p = TG.toStage(a[0], a[1]); pos(el.tip, p[0], p[1]); el.tip.classList.add('on');
      });
      S.on(el.table, 'pointerleave', () => { hover(); el.tip.classList.remove('on'); });
    }
    function trackTarget(e) {
      const n = e.target.closest && e.target.closest('.rt-n'); if (n) return { n: +n.dataset.n };
      const s = e.target.closest && e.target.closest('.rt-s'); if (s) return { s: s.dataset.s };
      return null;
    }
    S.on(el.track, 'click', (e) => {
      const t = trackTarget(e); if (!t) return;
      const unit = M.CHIPS[mem.chip];
      if (t.n != null) addBets(M.neighbours(t.n, mem.k, unit), t.n + (mem.k ? ' and ' + mem.k + ' neighbours either side' : ' straight up'));
      else addBets(M.announced(t.s, unit), M.ANNOUNCED[t.s].name + ' · ' + M.ANNOUNCED[t.s].chips + ' × ' + fmt(unit));
    });
    if (canHover) {
      S.on(el.track, 'pointermove', (e) => { const t = trackTarget(e); if (!t) { hover(); return; } hover(t.n != null ? M.neighbourNums(t.n, mem.k) : M.SECTION[t.s]); });
      S.on(el.track, 'pointerleave', () => hover());
    }
    el.kMinus.onclick = () => { mem.k = Math.max(0, mem.k - 1); saveMem(); snd.click(); paintTrackMode(); };
    el.kPlus.onclick = () => { mem.k = Math.min(4, mem.k + 1); saveMem(); snd.click(); paintTrackMode(); };
    S.on(window, 'keydown', (e) => {
      if (g.dead || e.target.closest && e.target.closest('input,textarea,select') || document.querySelector('.bc-veil,.bc-win')) return;
      const k = e.key.toLowerCase();
      if (e.key >= '1' && e.key <= '7') { mem.chip = +e.key - 1; saveMem(); paintChips(); snd.chip(); }
      else if (k === 'u') undo(); else if (k === 'c') clearBets(); else if (k === 'x') doubleBets(); else if (k === 'r') rebet();
      else if (k === 't' && C && C.trackToggle) el.trackB.click();
      else if (k === 'q' && !live) el.quickB.click();
      else if (e.key === ' ' && !live) { e.preventDefault(); if (!el.spinB.disabled) el.spinB.click(); }
      else return;
    });

    /* ---------- the wheel and ball, every frame ---------- */
    function curWheel() {
      if (live) { const sp = L.st && L.st.spin; return sp ? { id: sp.id, t0: sp.closeAt } : { id: 1, t0: Infinity }; }
      return P.spin ? { id: P.spin.id, t0: P.spin.t0 } : { id: P.id + 1, t0: Infinity };
    }
    let restN = null;   // the pocket the ball rests in between spins
    let soundMark = { rollT: 0, hop: -1, dia: false, settled: false, launched: false, pathId: 0 };
    function frame() {
      if (!C) return;
      const t = nowS(), cw = curWheel(), W = wheelAngle(cw, t);
      el.head.style.transform = 'rotate(' + (W % TAU).toFixed(4) + 'rad)';
      const w = C.wheel, s = w.R / 300;
      let b = null;
      if (path && t >= path.t0) b = ballAt(path, t);
      else if (restN != null) b = { on: true, a: pocketAngle(restN) + W, r: POCKET_R, z: 0, stage: 'pocket' };
      if (b && b.on && reduce && path && t >= path.t0 && b.stage !== 'pocket') b = { on: false };
      if (!b || !b.on) { el.ball.style.opacity = '0'; el.ballSh.style.opacity = '0'; }
      else {
        const x = w.R + b.r * s * Math.cos(b.a), y = w.R + b.r * s * w.k * Math.sin(b.a);
        const z = b.z * s, sz = 1 + b.z / 40;
        el.ball.style.opacity = b.stage === 'hand' ? Math.min(1, b.tau / 0.2).toFixed(2) : '1';
        el.ball.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - z * 2.2).toFixed(1) + 'px) scale(' + sz.toFixed(3) + ')';
        el.ballSh.style.opacity = (0.55 - Math.min(0.35, b.z / 30)).toFixed(2);
        el.ballSh.style.transform = 'translate(' + (x + 2 * s).toFixed(1) + 'px,' + (y + 3 * s).toFixed(1) + 'px)';
        if (path && t >= path.t0) ballSounds(b, t);
      }
      lastBall = b;
      if (live) liveFrame(t);
    }
    function ballSounds(b, t) {
      const m = soundMark;
      if (m.pathId !== path.id) { m.pathId = path.id; m.hop = -1; m.dia = false; m.settled = false; m.launched = false; m.rollT = 0; }
      if (!m.launched && b.stage === 'hand') { m.launched = true; snd.launch(); snd.whirr(); }
      if (b.stage === 'rim' || b.stage === 'hand') {
        if (t - m.rollT > 0.13) { m.rollT = t; const v = Math.max(0, 1 - (b.tau / path.td)); snd.roll(0.25 + 0.75 * v); }
      } else if (b.stage === 'drop') {
        if (!m.dia && b.p > 0.04) { m.dia = true; snd.diamond(); }
        const hop = Math.floor(path.nb * b.p);
        if (hop !== m.hop) { m.hop = hop; if (hop > 0) snd.fret(1 - b.p); }
        if (t - m.rollT > 0.09) { m.rollT = t; if (Math.random() < 0.5) snd.fret(0.2 * (1 - b.p)); }
      } else if (b.stage === 'pocket' && !m.settled) { m.settled = true; snd.settle(); }
    }
    S.loop(frame);

    /* ---------- the result and the payout ---------- */
    function placeDolly(n, animate) {
      if (!TG || n == null) { el.dolly.classList.remove('on'); return; }
      const c = n === 0 ? [C.table.ZW * 0.56, 1.5 * C.table.CH] : TG.ctr(TG.rectN(n));
      const p = TG.toStage(c[0], c[1]);
      pos(el.dolly, p[0], p[1]);
      el.dolly.classList.add('on');
      if (animate && !reduce) el.dolly.animate([{ transform: 'translateY(-120px) scale(1.4)', opacity: 0 }, { transform: 'translateY(6px) scale(.95)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)' });
    }
    function showResult(n) {
      g.res = n; restN = n;
      const m = el.medal; m.className = 'ry-medal ' + colCls(n); m.querySelector('b').textContent = n; m.querySelector('small').textContent = colName(n);
      void m.offsetWidth; m.classList.add('on');
      if (focusOn) S.timeout(() => spinFocus(false), T(1000));
      winGlow(n); placeDolly(n, true);
      call('<b class="' + colCls(n) + '">' + n + '</b><span>' + (n === 0 ? 'Zero' : colName(n) + ' · ' + (n % 2 ? 'Odd' : 'Even') + ' · ' + (n <= 18 ? '1–18' : '19–36')) + '</span>', 'num', 2600);
      msg(M.describe(n));
      if (!reduce && el.ball) B.fx.burst({ el: el.medal, kind: 'spark', count: 14, power: 0.5, colors: ['#ffffff', '#f3d98b', n === 0 ? '#3fd28a' : M.isRed(n) ? '#ff5d6d' : '#c9c2d6'] });
    }
    function clearResult() {
      g.res = null; winGlow(null); el.dolly.classList.remove('on'); el.medal.classList.remove('on');
      el.winB.classList.remove('on'); hover();
    }
    /* chips on losing spots are swept to the wheel; winners are paid alongside and the lot slides off to your balance */
    async function payout(bets, n, won, staked) {
      const keys = Object.keys(bets), winKeys = keys.filter((k) => M.ret(k, bets[k], n) > 0), loseKeys = keys.filter((k) => !winKeys.includes(k));
      if (!keys.length) return;
      await S.sleep(T(1100));
      if (loseKeys.length) { sweepAway(loseKeys); for (const k of loseKeys) placeStack(k, 0); snd.sweep(); }
      await S.sleep(T(loseKeys.length ? 520 : 100));
      const pays = [];
      winKeys.forEach((k, i) => {
        const s = stackEls[k]; if (!s) return;
        const ret = M.ret(k, bets[k], n), profit = ret - bets[k];
        s.classList.add('win');
        const p = h('div', { class: 'ry-stack pay' }); p.innerHTML = stackHtml(profit, 6, false);
        p.style.left = (parseFloat(s.style.left) + 0) + 'px'; p.style.top = s.style.top; el.bets.append(p); pays.push(p);
        const tag = h('div', { class: 'ry-paytag' }, '+' + fmt(profit)); tag.style.left = s.style.left; tag.style.top = s.style.top; el.bets.append(tag); pays.push(tag);
        if (!reduce) {
          const w = C.wheel, dx = w.x - parseFloat(s.style.left), dy = w.y - parseFloat(s.style.top);
          p.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: 0 }, { transform: 'translate(' + (dx * 0.3) + 'px,' + (dy * 0.3 - 40) + 'px) scale(1.1)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 640, delay: i * 90, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
          tag.animate([{ transform: 'translate(-50%,0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-30px) scale(1.1)', opacity: 1, offset: 0.4 }, { transform: 'translate(-50%,-44px)', opacity: 1 }], { duration: 900, delay: 300 + i * 90, easing: 'ease-out', fill: 'both' });
        }
      });
      if (won > 0) {
        const straight = bets['n' + n] > 0;
        if (straight || won >= staked * 10) snd.straight(); else snd.win();
        snd.clack(Math.min(7, winKeys.length + 2));
        el.call.classList.remove('on');
        el.winB.querySelector('b').textContent = '0'; el.winB.classList.add('on');
        B.ui.countUp(el.winB.querySelector('b'), 0, won, T(1100), fmt);
        el.win.textContent = fmt(won); g.lastWin = won;
        msg('You win ' + fmt(won) + ' BB on ' + n + (straight ? ', straight up!' : '.'));
        await S.sleep(T(1250));
        B.wallet.sync();
        if (won >= staked * 10) await B.ui.celebrate({ amount: won, bet: staked });
        /* the winnings slide off towards your balance */
        const all = [...pays, ...winKeys.map((k) => stackEls[k]).filter(Boolean)];
        if (!reduce) {
          const bal = document.getElementById('bc-balance'), sr = stage.getBoundingClientRect();
          let tx = C.W * 0.85, ty = -80;
          if (bal) { const r = bal.getBoundingClientRect(); tx = (r.left + r.width / 2 - sr.left) / SC; ty = (r.top + r.height / 2 - sr.top) / SC; }
          all.forEach((e, i) => { if (!e.classList.contains('ry-stack')) return; const dx = tx - parseFloat(e.style.left), dy = ty - parseFloat(e.style.top); e.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: 0 }], { duration: 620, delay: i * 40, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' }); });
          S.timeout(() => { const b = document.getElementById('bc-balance'); if (b) B.fx.burst({ el: b, kind: 'coin', count: 16, power: 0.6 }); B.sfx('coin'); }, 620);
          await S.sleep(800);
        } else await S.sleep(300);
        for (const e of pays) e.remove();
        for (const k of winKeys) placeStack(k, 0);
        S.timeout(() => el.winB.classList.remove('on'), T(1400));
      } else {
        snd.lose(); msg(n + ' ' + colName(n).toLowerCase() + '. No luck this time.');
        B.wallet.sync();
      }
    }

    /* ---------- PRACTICE ---------- */
    async function practiceSpin() {
      if (live || g.phase !== 'bet' || g.busy || g.dead) return;
      if (!M.totalOf(g.bets)) { if (!rebet()) return; await S.sleep(T(260)); }
      const bets = clone(g.bets), total = M.totalOf(bets), err = M.validate(bets);
      if (err) { B.ui.toast(err + '.'); return; }
      if (!B.wallet.bet(ID, total)) { B.ui.broke(); return; }
      g.busy = true; g.phase = 'spin'; mem.last = clone(bets); saveMem(); controls();
      g.undo = []; g.sessionStaked += total;
      let n = M.draw(B.rng);
      if (dev && dev.force != null && dev.force >= 0 && dev.force <= 36) { n = dev.force | 0; dev.force = null; }
      const D = reduce ? 1.6 : mem.quick ? 4.2 : 8;
      P.id++; P.spin = { id: P.id, t0: nowS() + 0.15, D, number: n };
      restN = null; path = makePath(P.spin);
      clearResult(); spinFocus(true);
      call('<span>No more bets</span>', 'nomore', 1300); snd.close(); msg('No more bets. The ball is running.');
      await S.sleep(D * 1000 + 150);

      showResult(n);
      mem.hist.unshift(n); mem.hist = mem.hist.slice(0, 500); saveMem(); paintHist();
      const res = M.settle(bets, n);
      B.wallet.win(ID, res.total, { silent: true });
      g.spins++; g.sessionWon += res.total; g.lastBest = Math.max(g.lastBest || 0, res.total);
      if (dev) { dev.spins++; dev.staked += total; dev.won += res.total; dev.last = { n, bets, won: res.total, bySpot: res.bySpot }; }
      await payout(bets, n, res.total, total);
      paintRail();
      await S.sleep(T(500));
      g.bets = {}; paintBets(true);
      g.phase = 'bet'; g.busy = false; controls();
      msg('Place your bets.');
    }
    el.spinB.onclick = () => { if (!live) practiceSpin(); };
    function spinFocus(on) {
      if (!C || !C.focus || reduce) return;
      focusOn = on;
      const f = C.focus, w = C.wheel;
      el.wheel.style.transform = on ? 'translate(' + (f.x - w.x) + 'px,' + (f.y - w.y) + 'px) scale(' + f.s + ')' : '';
      root.classList.toggle('ry-focus', on);
    }

    /* ---------- LIVE ---------- */
    let sendT = 0;
    function queueSend() {
      if (!live) return;
      L.dirty = true; L.seq++;
      const sp = L.st && L.st.spin, left = sp ? sp.closeAt - nowS() : 9;
      S.clear(sendT); sendT = S.timeout(sendBet, left < 2.5 ? 0 : 300);
    }
    async function sendBet() {
      if (L.sending || !L.dirty || g.dead) return;
      const sp = L.st && L.st.spin;
      if (!sp || nowS() >= sp.closeAt - 0.2) { L.dirty = false; g.bets = clone(L.confirmed); paintBets(true); return; }
      L.sending = true; L.dirty = false;
      const want = clone(g.bets), total = M.totalOf(want), delta = total - L.confTotal;
      if (delta > 0 && !B.wallet.bet(ID, delta)) { L.sending = false; B.ui.broke(); g.bets = clone(L.confirmed); paintBets(true); return; }
      const r = await B.play(ID, 'bet', { spin: sp.id, bets: want }, Math.max(0, delta));
      L.sending = false; if (g.dead) return;
      if (r && r.spin === sp.id) { L.confirmed = clone(r.mine); L.confTotal = r.total; if (r.total > 0) { mem.last = clone(r.mine); saveMem(); } }
      else if (!r) { g.bets = clone(L.confirmed); paintBets(true); }
      B.wallet.sync(); controls();
      if (L.dirty) sendBet();
    }
    async function poll() {
      if (L.polling || g.dead) return;
      L.polling = true;
      const seq0 = L.seq, t0 = Date.now(); let r;
      try { r = await B.api('play', { game: ID, op: 'state', h: L.histId }, { defer: true }); }
      catch (e) {
        L.polling = false;
        if (e.status === 403 && !g.dead) { g.dead = true; B.ui.toast(e.message); S.timeout(() => B.go(''), 1200); }
        return;
      }
      const t1 = Date.now(); L.polling = false; if (g.dead) return;
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (L.off == null || rtt <= L.best * 1.25 || ++L.age > 60) { L.off = off; L.best = rtt; L.age = 0; }
      if (r.hist) L.hist = r.hist;
      L.histId = r.histId;
      const newSpin = !L.st || L.st.spin.id !== r.spin.id;
      L.st = r;
      if (newSpin || (!L.sending && !L.dirty && L.seq === seq0)) {
        L.confirmed = clone(r.mine); L.confTotal = M.totalOf(r.mine);
        if (!L.sending && !L.dirty && L.seq === seq0 && (g.phase === 'bet' || newSpin) && !g.busy && JSON.stringify(g.bets) !== JSON.stringify(L.confirmed) && L.spinId === r.spin.id) { g.bets = clone(L.confirmed); paintBets(true); }
      }
      if (r.now < r.spin.resultAt && r.now >= r.spin.closeAt && !L.sending) L.ride = { spin: r.spin.id, bets: clone(r.mine) };
      for (const s of r.settled || []) if (!L.settledQ.find((x) => x.spin === s.spin)) L.settledQ.push(s);
      paintOthers(); paintRail(); paintHist();
    }
    function spinPhase(sp, t) { return t < sp.closeAt ? 'bet' : t < sp.resultAt ? 'spin' : 'result'; }
    /* the director: called every frame; turns the server's clock into the show */
    function liveFrame(t) {
      const r = L.st; if (!r || L.off == null || g.dead) return;
      const sp = r.spin, ph = spinPhase(sp, t);
      if (sp.id !== L.spinId) {
        const first = !L.spinId;
        L.spinId = sp.id; L.phase = ''; path = null;
        if (first) { const h0 = L.hist[0]; restN = h0 != null ? h0 : null; g.bets = clone(L.confirmed); paintBets(true); }
      }
      if (ph !== 'bet' && sp.number != null && (!path || path.id !== sp.id)) { path = makePath({ id: sp.id, t0: sp.closeAt, D: sp.resultAt - sp.closeAt, number: sp.number }); restN = null; }
      if (ph !== L.phase) {
        const was = L.phase; L.phase = ph;
        if (ph === 'bet') openBetting(was === '');
        else if (ph === 'spin') closeBetting(was === '');
        else if (ph === 'result' && sp.number != null) { if (L.resultFor !== sp.id) { L.resultFor = sp.id; liveResult(sp, was === ''); } }
        else L.phase = was;   // waiting for the number
      }
      if (ph === 'result' && L.resultFor !== sp.id && sp.number != null) { L.resultFor = sp.id; liveResult(sp, false); }
      /* settlements: this spin's once its result is up; older ones (you were away) straight away */
      if (L.settledQ.length && !g.busy) {
        const s = L.settledQ[0];
        if (s.spin < L.resultFor || (s.spin === L.resultFor && g.res != null && !g.paying)) { L.settledQ.shift(); if (s.spin === L.resultFor && L.paidFor !== s.spin) { L.paidFor = s.spin; livePay(s); } else awayPay(s); }
      }
      /* the timer */
      const left = sp.closeAt - t;
      if (ph === 'bet') {
        const f = Math.max(0, Math.min(1, left / (sp.closeAt - sp.openAt)));
        el.timer.hidden = false;
        el.timer.querySelector('.v').style.strokeDashoffset = String(119.4 * (1 - f));
        el.timer.querySelector('b').textContent = String(Math.max(0, Math.ceil(left)));
        el.timer.querySelector('small').textContent = 'Bets';
        el.timer.classList.toggle('hot', left <= 5);
        el.tbar.classList.add('on'); el.tbar.classList.toggle('hot', left <= 5); el.tbar.firstChild.style.transform = 'scaleX(' + f.toFixed(4) + ')';
        if (left <= 5.05 && left > 0 && Math.ceil(left) !== L.lastTick) { L.lastTick = Math.ceil(left); snd.tick(); }
        if (left < 0.5 && g.phase === 'bet') { g.phase = 'closing'; controls(); }
      } else { el.timer.hidden = true; el.tbar.classList.remove('on'); }
      liveGo(ph === 'bet' && left < 0.5 ? 'spin' : ph, left);
    }
    function openBetting(first) {
      const go = () => {
        if (g.dead) return;
        clearResult(); spinFocus(false);
        g.bets = clone(L.confirmed); g.undo = []; paintBets(true);
        g.phase = 'bet'; controls();
        if (!first) { call('<span>Place your bets</span>', 'open', 1500); snd.open(); }
        msg('Place your bets. Spin ' + L.spinId + '.');
      };
      if (g.busy) { const wait = () => { if (g.busy) S.timeout(wait, 150); else go(); }; wait(); } else go();
    }
    function closeBetting(first) {
      g.phase = 'spin'; controls(); hover(); el.tip.classList.remove('on');
      if (L.dirty || L.sending) { /* the last change may not have made it */ }
      g.bets = clone(L.confirmed); paintBets(true);
      if (M.totalOf(g.bets)) { mem.last = clone(g.bets); saveMem(); }
      L.ride = { spin: L.spinId, bets: clone(L.confirmed) };
      clearResult(); spinFocus(true);
      if (!first) { call('<span>No more bets</span>', 'nomore', 1400); snd.close(); }
      msg(M.totalOf(g.bets) ? 'No more bets. ' + fmt(M.totalOf(g.bets)) + ' BB riding on spin ' + L.spinId + '.' : 'No more bets. Watching spin ' + L.spinId + '.');
    }
    function liveResult(sp, first) {

      g.phase = 'result'; controls();
      showResult(sp.number);
      if (!L.hist.length || L.histId < sp.id) { L.hist = [sp.number].concat(L.hist).slice(0, 500); L.histId = sp.id; }
      paintHist();
      if (!M.totalOf(L.confirmed)) { msg(M.describe(sp.number) + '.'); }
      else if (!first) msg(M.describe(sp.number) + '. Counting your chips…');
    }
    async function livePay(s) {
      g.busy = true; g.paying = true;
      const bets = L.ride.spin === s.spin ? clone(L.ride.bets) : {};
      try {
        B.wallet.win(ID, s.won, { silent: true });
        if (M.totalOf(bets) === s.staked && s.staked > 0) { g.bets = bets; paintBets(true); await payout(bets, s.number, s.won, s.staked); }
        else if (s.won > 0) { el.winB.querySelector('b').textContent = fmt(s.won); el.winB.classList.add('on'); el.win.textContent = fmt(s.won); snd.win(); B.wallet.sync(); msg('You win ' + fmt(s.won) + ' BB on ' + s.number + '.'); if (s.won >= s.staked * 10) await B.ui.celebrate({ amount: s.won, bet: s.staked }); }
        else { B.wallet.sync(); msg(M.describe(s.number) + '. No luck this time.'); }
      } catch (e) { console.error(e); }
      if (L.spinId === s.spin) { L.confirmed = {}; L.confTotal = 0; }
      g.bets = {}; paintBets(true);
      g.busy = false; g.paying = false; controls();
    }
    function awayPay(s) {
      B.wallet.win(ID, s.won, { silent: true }); B.wallet.sync();
      if (s.won > 0) B.ui.toast('Spin ' + s.spin + ' landed on ' + s.number + ': you won ' + fmt(s.won) + ' BB.', 3800);
    }

    /* ---------- start ---------- */
    applyLayout(LAY.wide); layout(); paintChips(); paintToggles(); controls();
    if (!g.dead) {
      if (live) {
        msg('Joining the wheel…'); el.spinB.disabled = true;
        poll(); S.interval(() => { if (!document.hidden || Math.random() < 0.3) poll(); }, 1000);
      } else {
        restN = mem.hist.length ? mem.hist[0] : null;
        msg('Place your bets, then spin.');
        if (dev) msg('Practice (dev hooks on: window.__royaleDev.force = 17).');
      }
    }
    g.destroy = () => { g.dead = true; ro.disconnect(); if (window.__royaleDev) delete window.__royaleDev; };
  }

  B.registerGame({
    id: ID, name: 'Roulette Royale', tagline: 'Single-zero live roulette for the velvet-rope crowd',
    tag: 'Live roulette', section: 'highroller', minLevel: MIN_LEVEL, isNew: true,
    poster: POSTER, rules,
    mount(root) { mount(root); },
    unmount() { if (G && G.destroy) G.destroy(); G = null; if (S) S.dispose(); S = null; },
  });
})();
