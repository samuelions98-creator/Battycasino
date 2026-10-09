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
