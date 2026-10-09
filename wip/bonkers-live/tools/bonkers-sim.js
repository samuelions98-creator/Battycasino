#!/usr/bin/env node
/* Bonkers Time — return-to-player proof.
   1. Exact calculation of every bet spot's return (Top Slot, every bonus game, the cap), from the tables themselves.
   2. A Monte Carlo run of whole rounds through the very same drawRound() the game uses (default 10,000,000 rounds).
   Usage: node tools/bonkers-sim.js [rounds] [seed]
   The maths is read straight out of games/bonkers/game.js (its "bonkers math" block), so nothing is copied. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

function loadMath() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'bonkers', 'game.js'), 'utf8');
  const end = src.indexOf('/* ===== bonkers ===== */');
  const code = end > 0 ? src.slice(0, end) : src;
  const sandbox = { module: { exports: {} }, globalThis: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports;
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const M = loadMath();
if (require.main !== module) { module.exports = { M, mulberry32 }; return; }

const pct = (x) => (x * 100).toFixed(3) + '%';
const assert = (c, m) => { if (!c) { console.error('ASSERTION FAILED: ' + m); process.exit(1); } };

/* ---------- layout checks ---------- */
assert(M.N === 54, 'wheel has 54 segments');
const want = { 1: 21, 2: 13, 5: 7, 10: 4, flap: 4, hunt: 2, drop: 2, bonkers: 1 };
for (const s of M.SPOTS) assert(M.COUNT[s] === want[s], 'segment count for ' + s + ' is ' + M.COUNT[s]);
assert(M.BIG.segs.length === 64, 'giant wheel has 64 segments (' + M.BIG.segs.length + ')');
{
  const c = {}; M.BIG.segs.forEach((s) => { c[s] = (c[s] || 0) + 1; });
  M.BIG_VALUES.forEach((v, i) => assert(c[v] === M.BIG_COUNTS[i], 'giant wheel count for ' + v + ' is ' + c[v]));
  assert(c.D === 3 && c.T === 1, 'giant wheel has 3 DOUBLE and 1 TRIPLE');
}
assert(M.TS_STRIP.length === 20, 'Top Slot strip has 20 stops');

/* ---------- exact distributions of each spot's raw result ---------- */
const distOfTable = (t) => { const d = new Map(); t.values.forEach((v, i) => d.set(v, (d.get(v) || 0) + t.weights[i] / t.total)); return d; };
const add = (d, v, p) => d.set(v, (d.get(v) || 0) + p);
const meanOf = (d) => { let m = 0; for (const [v, p] of d) m += v * p; return m; };
const RAW = {};
for (const s of ['1', '2', '5', '10']) RAW[s] = new Map([[M.NUMBERS[s], 1]]);
RAW.flap = distOfTable(M.FLAP);
RAW.hunt = distOfTable(M.HUNT);
{ /* Drop Zone: j doubles then a prize; DOUBLE is 2 of 16 pockets until 5 doubles close them */
  const d = new Map(), pd = M.DROP_DOUBLES / M.DROP_POCKETS, V = distOfTable(M.DROP);
  for (let j = 0; j <= M.DROP_MAX_DOUBLES; j++) {
    const pj = j < M.DROP_MAX_DOUBLES ? Math.pow(pd, j) * (1 - pd) : Math.pow(pd, j);
    for (const [v, p] of V) add(d, v * Math.pow(2, j), pj * p);
  }
  RAW.drop = d;
}
/* BONKERS TIME: exact joint enumeration of all three flappers through every re-spin (including the closing spin). */
const BONK = [new Map(), new Map(), new Map()];
(function walk(n, fac, live, prob) {
  let rs;
  if (n >= M.BIG_MAX_RESPINS) {
    rs = []; for (let r = 0; r < M.BIG_N; r++) if ([0, 1, 2].every((k) => !live[k] || typeof M.bigAt(r, k) === 'number')) rs.push(r);
  } else { rs = []; for (let r = 0; r < M.BIG_N; r++) rs.push(r); }
  const pr = prob / rs.length;
  for (const r of rs) {
    const f2 = fac.slice(), l2 = live.slice();
    for (let k = 0; k < 3; k++) {
      if (!live[k]) continue;
      const s = M.bigAt(r, k);
      if (typeof s === 'number') { add(BONK[k], s * fac[k], pr); l2[k] = false; } else f2[k] *= s === 'D' ? 2 : 3;
    }
    if (l2.some(Boolean)) walk(n + 1, f2, l2, pr);
  }
})(0, [1, 1, 1], [true, true, true], 1);
RAW.bonkers = BONK[1];

const tsHit = (s) => M.TS_STRIP.filter((x) => x === s).length / M.TS_STRIP.length;
function exactRTP(s, raw) {
  const p = tsHit(s), T = M.TS[s];
  let e = 0;
  for (const [v, q] of raw) {
    let em = (1 - p) * Math.min(M.CAP, v);
    T.values.forEach((m, i) => { em += p * (T.weights[i] / T.total) * Math.min(M.CAP, v * m); });
    e += q * em;
  }
  return (M.COUNT[s] / M.N) * (1 + e);
}
if (process.env.TUNE) { /* suggest the Top Slot 2x weight that brings each spot closest to 96.00% */
  for (const s of M.SPOTS) {
    const T = M.TS[s]; let best = null;
    for (let w = 1; w < 4000; w++) {
      const old = T.weights[0]; T.total += w - old; T.weights[0] = w;
      const r = exactRTP(s, RAW[s]);
      if (!best || Math.abs(r - 0.96) < Math.abs(best.r - 0.96)) best = { w, r };
    }
    console.log(s, JSON.stringify([best.w].concat(T.weights.slice(1))), pct(best.r));
  }
  process.exit(0);
}
const NAME = { 1: '1', 2: '2', 5: '5', 10: '10', flap: 'Coin Flap', hunt: 'Crypt Hunt', drop: 'Drop Zone', bonkers: 'BONKERS TIME' };
console.log('Bonkers Time — exact return per bet spot');
const exact = {};
for (const s of M.SPOTS) {
  exact[s] = exactRTP(s, RAW[s]);
  const tsMean = M.TS[s].values.reduce((a, v, i) => a + v * M.TS[s].weights[i], 0) / M.TS[s].total;
  console.log('  ' + NAME[s].padEnd(13) + ' segments ' + String(M.COUNT[s]).padStart(2) + '/54   Top Slot ' + (tsHit(s) * 100).toFixed(0).padStart(2) + '% (avg ' + tsMean.toFixed(2) + '×)   avg raw result ' + meanOf(RAW[s]).toFixed(3).padStart(8) + '×   RTP ' + pct(exact[s]));
}
for (let k = 0; k < 3; k++) console.log('  BONKERS TIME flapper ' + ['green', 'blue', 'yellow'][k] + ': RTP ' + pct(exactRTP('bonkers', BONK[k])) + ' (avg ' + meanOf(BONK[k]).toFixed(3) + '×)');
for (const s of M.SPOTS) assert(exact[s] >= 0.955 && exact[s] <= 0.965, NAME[s] + ' RTP out of the 95.5–96.5% band');

/* ---------- Monte Carlo ---------- */
const ROUNDS = +(process.argv[2] || 10000000), seed = +(process.argv[3] || 20261009);
const rng = mulberry32(seed);
const ret = {}, hits = {}, maxX = {}, sq = {};
for (const s of M.SPOTS) { ret[s] = 0; hits[s] = 0; maxX[s] = 0; sq[s] = 0; }
let tsOn = 0, capped = 0, longest = 0, dropMax = 0;
const t0 = Date.now();
for (let i = 0; i < ROUNDS; i++) {
  const o = M.drawRound(rng);
  const picks = { hunt: Math.floor(rng() * M.HUNT_N), flapper: Math.floor(rng() * 3) };
  const x = M.spotX(o, picks), s = o.spot;
  ret[s] += 1 + x; sq[s] += (1 + x) * (1 + x); hits[s]++;
  if (x > maxX[s]) maxX[s] = x;
  if (o.ts.spot === s) tsOn++;
  if (x >= M.CAP) capped++;
  if (o.bonkers && o.bonkers.spins.length > longest) longest = o.bonkers.spins.length;
  if (o.drop && o.drop.doubles > dropMax) dropMax = o.drop.doubles;
}
const secs = (Date.now() - t0) / 1000;
console.log('\nMonte Carlo: ' + ROUNDS.toLocaleString('en-GB') + ' rounds (seed ' + seed + ', ' + secs.toFixed(1) + ' s), one unit on every spot each round');
let all = 0;
for (const s of M.SPOTS) {
  const r = ret[s] / ROUNDS, sd = Math.sqrt(sq[s] / ROUNDS - r * r) / Math.sqrt(ROUNDS);
  all += ret[s];
  console.log('  ' + NAME[s].padEnd(13) + ' RTP ' + pct(r) + ' ± ' + (sd * 100).toFixed(3) + ' (exact ' + pct(exact[s]) + ')   hit rate ' + pct(hits[s] / ROUNDS) + '   max ' + maxX[s].toLocaleString('en-GB') + '×');
}
console.log('  All spots together: ' + pct(all / ROUNDS / M.SPOTS.length));
console.log('  Top Slot landed on the winning spot in ' + pct(tsOn / ROUNDS) + ' of rounds; ' + capped + ' results reached the ' + M.CAP.toLocaleString('en-GB') + '× cap');
console.log('  Longest BONKERS TIME: ' + longest + ' spins; most Drop Zone doubles: ' + dropMax);
