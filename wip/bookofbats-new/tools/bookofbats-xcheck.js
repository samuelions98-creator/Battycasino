#!/usr/bin/env node
/* Book of Bats: proves the PHP port (lib/games/bookofbats.php) gives exactly the same results as the JavaScript maths
   (games/bookofbats/game.js) from the same seeded RNG (mulberry32 / batty_mulberry).
     node tools/bookofbats-xcheck.js [rounds=20000] [features=2000]
   Compares the maths tables, every plain round (stops, grids, line wins, Books, free spins, totals, BB), a run of rounds
   forced to reach free spins (so every feature path and retrigger is exercised), and the gamble rules. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { loadMath } = require('./bookofbats-sim.js');
const M = loadMath();
function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const rounds = +(process.argv[2] || 20000), features = +(process.argv[3] || 2000);
const t0 = Date.now();
const out = execFileSync('php', [path.join(__dirname, 'bookofbats-xcheck.php'), String(rounds), String(features)], { maxBuffer: 1 << 30, encoding: 'utf8' }).trim().split('\n');
const tPhp = Date.now() - t0;
const stakes = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];
const js = [];
js.push(JSON.stringify({ PAY: M.PAY, SCAT: M.SCAT, MINEXP: M.MINEXP, SPECIAL_W: M.SPECIAL_W, LINES: M.LINES, STRIPS: M.STRIPS, MAX_WIN_X: M.MAX_WIN_X, FS_AWARD: M.FS_AWARD, MAX_SPECIALS: M.MAX_SPECIALS, GAMBLE_STEPS: M.GAMBLE_STEPS, GAMBLE_LIMIT_X: M.GAMBLE_LIMIT_X }));
let feats = 0, retrigs = 0, capped = 0, unitsJS = 0;
for (let i = 0; i < rounds; i++) {
  const rng = mulberry(1000003 * i + 17), lines = 1 + i % 10, stake = stakes[i % 9];
  const o = M.spin(rng, lines);
  if (o.fs) { feats++; retrigs += o.fs.retriggers; }
  if (o.capped) capped++;
  unitsJS += o.total;
  js.push(JSON.stringify({ i, o, bb: M.winBB(o.total, stake, lines) }));
}
let fsSpins = 0, multiSpecial = 0;
for (let i = 0; i < features; i++) {
  const rng = mulberry(0x51ab + 7919 * i), lines = 10 - i % 10; let n = 0, o;
  do { o = M.spin(rng, lines); n++; } while (!o.fs);
  fsSpins += o.fs.played; retrigs += o.fs.retriggers; if (o.fs.specials.length > 1) multiSpecial++; if (o.capped) capped++;
  js.push(JSON.stringify({ f: i, tries: n, o }));
}
{
  const rng = mulberry(424242), g = [];
  for (let i = 0; i < 5000; i++) {
    const c = M.drawCard(rng), row = [c];
    for (const ch of M.CHOICES) row.push(M.gambleResolve(c, ch) ? 1 : 0);
    const amt = 1 + Math.floor(rng() * 20000), stake = stakes[i % 9], steps = i % 7;
    for (const ch of M.CHOICES) row.push(M.gambleAllowed(amt, stake, steps, ch) ? 1 : 0);
    g.push(row);
  }
  js.push(JSON.stringify({ gamble: g }));
}
/* compare as parsed JSON (PHP and JS agree on every value; this ignores only formatting) */
const canon = (s) => JSON.stringify(JSON.parse(s));
let bad = 0;
if (out.length !== js.length) { console.log('LINE COUNT DIFFERS: php ' + out.length + ' js ' + js.length); bad++; }
for (let k = 0; k < Math.min(out.length, js.length); k++) {
  if (canon(out[k]) !== js[k]) {
    bad++;
    if (bad <= 3) { console.log('MISMATCH at line ' + k + '\n php: ' + out[k].slice(0, 400) + '\n  js: ' + js[k].slice(0, 400)); }
  }
}
console.log('Book of Bats cross-check: ' + rounds.toLocaleString('en-GB') + ' seeded rounds (lines 1-10, every stake) + ' + features.toLocaleString('en-GB') + ' rounds forced into free spins (' + fsSpins.toLocaleString('en-GB') + ' free spins, ' + retrigs + ' retriggers, ' + multiSpecial + ' with 2+ expanding symbols, ' + capped + ' capped) + 5,000 gamble cards.');
console.log('PHP took ' + (tPhp / 1000).toFixed(1) + 's. ' + (bad ? bad + ' MISMATCHES' : 'IDENTICAL: tables, every round and every gamble verdict match exactly.'));
process.exit(bad ? 1 : 0);
