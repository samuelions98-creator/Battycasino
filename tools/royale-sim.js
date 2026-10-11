/* Roulette Royale return: exact per bet type, plus a seeded Monte Carlo of mixed bets.
   node tools/royale-sim.js [spins=10000000] [seed=20261009] */
const { load, mulberry32 } = require('./royale-load');
const M = load();
const N = +(process.argv[2] || 10000000), seed = +(process.argv[3] || 20261009);
const pct = (x) => (x * 100).toFixed(4) + '%';

/* 1. exact: every spot, all 37 outcomes */
const byKind = {};
for (const k of Object.keys(M.SPOTS)) {
  let back = 0; for (let n = 0; n <= 36; n++) back += M.ret(k, 36000, n);
  const rtp = back / 37 / 36000, kind = M.KIND[k];
  (byKind[kind] = byKind[kind] || { spots: 0, min: 1, max: 0, pays: M.pays(k) }).spots++;
  byKind[kind].min = Math.min(byKind[kind].min, rtp); byKind[kind].max = Math.max(byKind[kind].max, rtp);
}
console.log('EXACT (all 37 outcomes, every spot)');
for (const [kind, v] of Object.entries(byKind)) console.log('  ' + kind.padEnd(9) + String(v.spots).padStart(4) + ' spots  pays ' + v.pays + ':1  RTP ' + pct(v.min) + (v.max !== v.min ? '..' + pct(v.max) : '') + '  edge ' + pct(1 - v.min));
let nspots = Object.keys(M.SPOTS).length;
console.log('  spots on the layout:', nspots, ' theoretical RTP 36/37 =', pct(36 / 37));

/* 2. Monte Carlo: each spin a random mix of 1-8 spots (inside and outside, announced bets too), random chips */
const keys = Object.keys(M.SPOTS), rng = mulberry32(seed);
let staked = 0, back = 0, hits = 0, best = 0, bestX = 0;
const kStake = {}, kBack = {};
for (let i = 0; i < N; i++) {
  let bets = {};
  const r0 = rng();
  if (r0 < 0.08) bets = M.announced(['voisins', 'tiers', 'orphelins', 'zero'][Math.floor(rng() * 4)], M.CHIPS[Math.floor(rng() * 3)]);
  else if (r0 < 0.12) bets = M.neighbours(Math.floor(rng() * 37), 1 + Math.floor(rng() * 4), M.CHIPS[Math.floor(rng() * 3)]);
  else { const m = 1 + Math.floor(rng() * 8); for (let j = 0; j < m; j++) { const k = keys[Math.floor(rng() * keys.length)]; bets = M.merge(bets, { [k]: M.CHIPS[Math.floor(rng() * 7)] }).bets; } }
  const n = M.draw(rng), st = M.totalOf(bets), s = M.settle(bets, n);
  staked += st; back += s.total; if (s.total > 0) hits++;
  if (s.total > best) best = s.total; if (s.total / st > bestX) bestX = s.total / st;
  for (const k in bets) { const kind = M.KIND[k]; kStake[kind] = (kStake[kind] || 0) + bets[k]; kBack[kind] = (kBack[kind] || 0) + (s.bySpot[k] || 0); }
}
console.log('\nMONTE CARLO ' + N.toLocaleString('en-GB') + ' spins, seed ' + seed);
console.log('  RTP ' + pct(back / staked) + '   hit rate ' + pct(hits / N) + ' (1 in ' + (N / hits).toFixed(2) + ')   biggest return seen ' + best.toLocaleString('en-GB') + ' BB (' + bestX.toFixed(1) + 'x)');
for (const kind of Object.keys(kStake)) console.log('  ' + kind.padEnd(9) + ' RTP ' + pct(kBack[kind] / kStake[kind]));
console.log('\nMAX WIN per spin (every limit filled on one number): ' + M.maxWin().toLocaleString('en-GB') + ' BB on a ' + M.TABLE_MAX.toLocaleString('en-GB') + ' BB table');
