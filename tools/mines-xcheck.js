#!/usr/bin/env node
/* Crypt Sweeper: proves the PHP port (lib/games/mines.php) gives exactly the same multiplier tables and seeded skull
   placements as the JavaScript maths (games/mines/game.js), that placements are uniform, and that no way of playing returns
   more than 96.5%.   node tools/mines-xcheck.js [rounds=20000] */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'mines', 'game.js'), 'utf8').split('/* ===== mines ===== */')[0];
const M = new Function('module', 'globalThis', src + '\nreturn module.exports;')({ exports: {} }, {});
function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const N = +(process.argv[2] || 20000);
const php = execFileSync('php', [path.join(__dirname, 'mines-xcheck.php'), String(N)], { maxBuffer: 1 << 30, encoding: 'utf8' }).trim().split('\n');
let bad = 0;
const t = []; for (let m = 1; m <= M.MAX_MINES; m++) for (let k = 0; k <= M.TILES - m; k++) t.push(M.mult(m, k));
if (php[0] !== JSON.stringify(t)) { bad++; console.log('MULTIPLIER TABLES DIFFER'); }
const hist = new Array(25).fill(0);
for (let i = 0; i < N; i++) {
  const rng = mulberry(1000003 * i + 5), m = 1 + Math.floor(rng() * M.MAX_MINES), pl = M.place(rng, m);
  if (php[i + 1] !== JSON.stringify([m, pl])) { if (bad++ < 3) console.log('PLACEMENT DIFFERS', i, php[i + 1], JSON.stringify([m, pl])); }
  if (new Set(pl).size !== m || pl.some((x) => x < 0 || x > 24)) { bad++; console.log('BAD PLACEMENT', pl); }
  pl.forEach((x) => hist[x]++);
}
const mean = hist.reduce((a, b) => a + b, 0) / 25, dev = Math.max(...hist.map((x) => Math.abs(x - mean) / mean));
const best = M.bestReturn();
console.log('best return of any stopping rule over every skull count:', (best * 100).toFixed(3) + '%', best <= 0.965 + 1e-9 ? 'OK' : 'FAIL');
console.log('tile frequency spread (should be tiny):', (dev * 100).toFixed(2) + '%');
console.log(bad || best > 0.965 + 1e-9 ? 'MISMATCH ' + bad : 'PARITY OK: ' + t.length + ' multipliers and ' + N.toLocaleString() + ' seeded placements identical');
process.exit(bad || best > 0.965 + 1e-9 ? 1 : 0);
