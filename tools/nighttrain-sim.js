/* Night Train: RTP simulation of the real maths (the top of games/nighttrain/game.js, loaded by tools/nighttrain-math.js;
   lib/games/nighttrain.php is the same code, proved by tools/nighttrain-xcheck.js).
   Usage:
     node tools/nighttrain-sim.js all [spins] [buys]   base game then bonus buy (default 10,000,000 / 1,000,000)
     node tools/nighttrain-sim.js base N [seed]        base game only (full rounds, bonuses included)
     node tools/nighttrain-sim.js buy N [seed]         bonus buy only
   Seeded, so runs repeat exactly. Reports RTP, hit rate, bonus frequency, the win distribution and how often the
   max win (MAX_X) is reached. */
'use strict';
const M = require('./nighttrain-math.js')();
const CR = M.CR;
const BANDS = [1, 10, 50, 100, 500, 1000, 2500, 5000];

function run(N, seed, buy) {
  const rng = M.mulberry(seed);
  let won = 0, lineWon = 0, bonusWon = 0, hits = 0, bonuses = 0, capped = 0, max = 0, sq = 0, respins = 0, upgrades = 0, full = 0;
  const band = new Array(BANDS.length).fill(0);
  for (let i = 0; i < N; i++) {
    const o = buy ? M.buy(rng) : M.spin(rng);
    const w = o.totalWin;
    won += w; lineWon += o.lineWin; bonusWon += o.bonusWin;
    const x = w / CR; sq += x * x;
    if (w > 0) hits++;
    if (w > max) max = w;
    if (o.capped) capped++;
    if (o.bonus) { bonuses++; respins += o.bonus.respins; if (o.bonus.open === 6) upgrades++; if (o.bonus.full) full++; }
    for (let b = 0; b < BANDS.length; b++) if (x >= BANDS[b]) band[b]++;
  }
  const mean = won / CR / N;
  return { N, mean, line: lineWon / CR / N, bonus: bonusWon / CR / N, hit: hits / N, bonuses, capped, max: max / CR, sd: Math.sqrt(sq / N - mean * mean), respins, upgrades, full, band };
}
const pct = (x) => (x * 100).toFixed(3) + '%';
const one = (n, N) => (n ? '1 in ' + Math.round(N / n).toLocaleString('en-GB') : 'never') + ' (' + n + ')';
function report(r, buy) {
  const price = buy ? M.BUY_X : 1;
  console.log((buy ? 'BONUS BUY at ' + M.BUY_X + 'x' : 'BASE GAME') + ' (' + r.N.toLocaleString('en-GB') + ' rounds): RTP ' + pct(r.mean / price) +
    (buy ? '' : '  (lines ' + pct(r.line) + ', bonus ' + pct(r.bonus) + ')'));
  if (!buy) console.log('  hit rate 1 in ' + (1 / r.hit).toFixed(2) + ', bonus ' + one(r.bonuses, r.N) + ', average bonus ' + (r.bonus * r.N / Math.max(1, r.bonuses)).toFixed(2) + 'x');
  else console.log('  average bonus ' + r.mean.toFixed(2) + 'x');
  console.log('  sd ' + r.sd.toFixed(2) + 'x, biggest ' + r.max.toFixed(1) + 'x, max win (' + M.MAX_X.toLocaleString('en-GB') + 'x) ' + one(r.capped, r.N));
  console.log('  bonuses reaching row 6 ' + (100 * r.upgrades / Math.max(1, r.bonuses)).toFixed(2) + '%, full board ' + one(r.full, r.N) + ', respins per bonus ' + (r.respins / Math.max(1, r.bonuses)).toFixed(1));
  console.log('  wins of at least: ' + BANDS.map((b, i) => b + 'x ' + (r.band[i] ? '1 in ' + Math.round(r.N / r.band[i]).toLocaleString('en-GB') : '-')).join(', '));
}
const cmd = process.argv[2] || 'all';
const t0 = Date.now();
if (cmd === 'base' || cmd === 'all') report(run(+(process.argv[3] || 1e7), cmd === 'base' ? +(process.argv[4] || 4242) : 4242, false), false);
if (cmd === 'buy' || cmd === 'all') report(run(+(process.argv[cmd === 'all' ? 4 : 3] || 1e6), cmd === 'buy' ? +(process.argv[4] || 9090) : 9090, true), true);
console.log('(' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
