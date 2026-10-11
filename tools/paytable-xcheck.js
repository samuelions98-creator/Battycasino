/* Parity check for Starwing and Bat Bandits UltraNudge: the browser maths (the "math" block of games/<id>/game.js) against
   the PHP engine on the same seeded rounds. Usage: node tools/paytable-xcheck.js [N=20000] */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), N = +process.argv[2] || 20000;
function load(g) {
  const src = fs.readFileSync(path.join(root, 'games', g, 'game.js'), 'utf8');
  const a = src.indexOf('/* ===== ' + g + ' math ===== */'), b = src.indexOf('/* ===== ' + g + ' ===== */');
  new Function(src.slice(a, b))(); return globalThis.BattyMath[g];
}
function mulberry(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let bad = 0;
for (const [g, mode] of [['starwing', 'spin'], ['ultraheist', 'spin'], ['ultraheist', 'buy']]) {
  const M = load(g), n = mode === 'buy' ? Math.ceil(N / 10) : N, js = [];
  for (let i = 1; i <= n; i++) { const o = M[mode](mulberry(i)); js.push(o.totalWin + (o.capped ? 'c' : '')); }
  const php = execFileSync('php', [path.join(__dirname, 'paytable-xcheck.php'), g, String(n), mode === 'buy' ? 'buy' : ''], { maxBuffer: 1 << 28 }).toString().split(',');
  let diff = 0; for (let i = 0; i < n; i++) if (js[i] !== php[i]) { if (diff++ < 3) console.log('  DIFF', g, mode, 'seed', i + 1, 'js', js[i], 'php', php[i]); }
  console.log((diff ? 'MISMATCH ' : 'identical ') + g + ' ' + mode + ': ' + n + ' seeded rounds' + (diff ? ', ' + diff + ' differ' : ''));
  bad += diff;
}
process.exit(bad ? 1 : 0);
