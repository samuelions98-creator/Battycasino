#!/usr/bin/env node
/* Bunky Time — return-to-player proof.
   1. Exact return of "1", every letter and The Blood Bar from the tables themselves (Glitterball included).
   2. Hangin' Alive, Belfry Disco and VIP Crypt Disco: Monte Carlo of the bonus game alone (default 10,000,000 plays each),
      combined exactly with the Glitterball's bonus multipliers and the cap.
   3. A Monte Carlo run of whole rounds through the very same spin() the game uses (default 10,000,000 rounds), with a
      chip on every spot, the bartender/team picked at random.
   Usage: node tools/bunky-sim.js [rounds] [bonusPlays] [seed]
   The maths is read straight out of games/bunky/game.js (its "bunky math" block), so nothing is copied. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

function loadMath() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'bunky', 'game.js'), 'utf8');
  const end = src.indexOf('/* ===== bunky ===== */');
  const sandbox = { module: { exports: {} }, globalThis: {} };
  vm.runInNewContext(end > 0 ? src.slice(0, end) : src, sandbox);
  return sandbox.module.exports;
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const M = loadMath();
if (require.main !== module) { module.exports = { M, mulberry32 }; return; }

const rounds = +(process.argv[2] || 10000000), plays = +(process.argv[3] || 10000000), seed = +(process.argv[4] || 20261011);
const pct = (x) => (x * 100).toFixed(3) + '%';
const N = M.N, B = M.BOOST;
const mean = M.tblMean;

/* ---------- 1. exact ---------- */
const eOne = 1 - B.ones / M.ONE_SEGS.length + (B.ones / M.ONE_SEGS.length) * mean(B.oneMult);
const eLet = 1 - B.letters / M.LETTER_SEGS.length + (B.letters / M.LETTER_SEGS.length) * mean(B.letterMult);
const pBonusLit = B.bonusChance / M.BONUS_SEGS.length;              // a given bonus segment is lit
const boostDist = [[1, 1 - pBonusLit]].concat(B.bonusMult.values.map((v, i) => [v, pBonusLit * B.bonusMult.weights[i] / B.bonusMult.total]));
const segs = (s) => M.SEGS_OF[s].length;
const exact = {};
exact.one = (segs('one') / N) * (1 + M.ODDS.one * eOne);
exact.letter = (2 / N) * (1 + M.ODDS.letter * eLet);
/* Blood Bar: three distinct draws (rejection sampling), the pick only selects one of them, so E[x] = E[first | distinct] */
{
  const t = M.BAR, n = t.values.length, p = t.weights.map((w) => w / t.total);
  let z = 0, ex = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
    if (a === b || b === c || a === c) continue;
    const q = p[a] * p[b] * p[c]; z += q; ex += q * (t.values[a] + t.values[b] + t.values[c]) / 3;
  }
  const eb = ex / z; let e = 0;
  for (const [m, q] of boostDist) e += q * Math.min(M.MAX_BONUS_X, eb * m);   // never near the cap: 100 x 5 = 500
  exact.bar = (segs('bar') / N) * (1 + e);
}
/* ---------- 2. bonus games alone ---------- */
const rng = mulberry32(seed);
const bonusRTP = {};
for (const s of ['hang', 'disco', 'vip']) {
  /* keep the raw multiplier distribution so the boost and the cap combine exactly */
  const hist = new Map(); let sum = 0;
  for (let i = 0; i < plays; i++) { const o = M.playBonus(s, rng); const x = s === 'hang' ? o.mults[Math.floor(rng() * 3)] : o.total; hist.set(x, (hist.get(x) || 0) + 1); sum += x; }
  let e = 0;
  for (const [x, c] of hist) for (const [m, q] of boostDist) e += (c / plays) * q * Math.min(M.MAX_BONUS_X, x * m);
  bonusRTP[s] = (segs(s) / N) * (1 + e);
  bonusRTP[s + 'Mean'] = sum / plays;
}
/* ---------- 3. whole rounds ---------- */
const bets = {}; for (const s of M.SPOTS) bets[s] = 1;
const ret = {}, hit = {}; for (const s of M.SPOTS) { ret[s] = 0; hit[s] = 0; }
let maxX = 0, maxRound = null, tot = 0, big100 = 0;
for (let i = 0; i < rounds; i++) {
  const o = M.spin(rng);
  const pick = M.needsPick(o) ? Math.floor(rng() * 3) : 0;
  const x = M.winX(o, pick);
  ret[o.spot] += 1 + x; hit[o.spot]++; tot += 1 + x;
  if (x > maxX) { maxX = x; maxRound = o.spot + ' boost ' + o.boost; }
  if (1 + x >= 100) big100++;
}
const per = (s) => ret[s] / rounds;
let letters = 0; for (const l of M.LETTERS) letters += per(l);
console.log('Bunky Time RTP (seed ' + seed + ')');
console.log('Exact:   1 ' + pct(exact.one) + ' | any letter ' + pct(exact.letter) + ' | Blood Bar ' + pct(exact.bar));
console.log('Bonus MC (' + plays.toLocaleString('en-GB') + ' plays each, Glitterball and cap exact): Hangin\' Alive ' + pct(bonusRTP.hang) + ' | Belfry Disco ' + pct(bonusRTP.disco) + ' | VIP Crypt Disco ' + pct(bonusRTP.vip));
console.log('Rounds MC (' + rounds.toLocaleString('en-GB') + ' rounds, 1 BB on every spot):');
console.log('  1 ' + pct(per('one')) + ' | letters (avg) ' + pct(letters / M.LETTERS.length) + ' | bar ' + pct(per('bar')) + ' | hang ' + pct(per('hang')) + ' | disco ' + pct(per('disco')) + ' | vip ' + pct(per('vip')));
console.log('  whole table ' + pct(tot / rounds / M.SPOTS.length) + ' | best single win ' + maxX + 'x + chip (' + maxRound + ') | rounds paying 100x stake on their spot or more: 1 in ' + Math.round(rounds / Math.max(1, big100)));
