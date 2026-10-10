/* Batty Circus parity check: the JS maths (games/circus/math.js) against the PHP engine (lib/games/circus.php).
   Usage: node tools/circus-xcheck.js [N=20000]
   Both sides play the same N seeded rounds (a quarter each: base, base, GRAND buy, SPOTLIGHT buy) with the same scripted
   choices, and every intermediate state is compared as canonical JSON. Any difference prints and exits 1. */
'use strict';
const M = require('../games/circus/math.js');
const { spawnSync } = require('child_process');
const path = require('path');
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const N = +(process.argv[2] || 20000);
const modes = [null, null, 'grand', 'spotlight'];
const js = [];
const stats = { steps: 0, bonus: 0, acts: {} };
for (let i = 0; i < N; i++) {
  const rng = M.mulberry32(100000 + i), prng = M.mulberry32((100000 + i) ^ 0x2545F491);
  let s = M.start(rng, modes[i % 4]);
  js.push(i + ' ' + canon(s));
  if (s.phase !== 'done') stats.bonus++;
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 500) {
    const p = s.phase; let a, c = null;
    if (p === 'cannon') a = 'fire';
    else if (p === 'decide') a = prng() < 0.5 ? 'retry' : 'collect';
    else if (p === 'fire') { const left = []; for (let t = 0; t < 12; t++) if (s.act.picked.indexOf(t) < 0) left.push(t); a = 'pick'; c = left[Math.floor(prng() * left.length)]; }
    else if (p === 'elephant') a = 'spin';
    else { a = 'pick'; c = Math.floor(prng() * 3); }
    if (s.act) stats.acts[s.act.id] = (stats.acts[s.act.id] || 0) + 1;
    s = M.step(s, a, c, rng); stats.steps++;
    js.push(i + ' ' + canon(s));
  }
}
const r = spawnSync('php', ['-d', 'memory_limit=4G', path.join(__dirname, 'circus-xcheck.php'), String(N)], { maxBuffer: 1 << 30 });
if (r.status !== 0) { console.log(String(r.stderr || r.stdout).slice(0, 2000)); process.exit(1); }
const php = r.stdout.toString().trim().split('\n');
let bad = 0;
if (php.length !== js.length) console.log('line count differs: js ' + js.length + ' php ' + php.length);
for (let k = 0; k < Math.max(php.length, js.length); k++) {
  if (php[k] !== js[k]) {
    if (bad < 3) console.log('DIFF at line ' + k + '\n JS : ' + (js[k] || '').slice(0, 800) + '\n PHP: ' + (php[k] || '').slice(0, 800));
    bad++;
  }
}
console.log(N.toLocaleString() + ' rounds, ' + stats.steps.toLocaleString() + ' steps (' + stats.bonus + ' bonuses; act steps ' + JSON.stringify(stats.acts) + '), ' + js.length.toLocaleString() + ' states compared: ' + (bad ? bad + ' DIFFERENCES' : 'identical'));
process.exit(bad ? 1 : 0);
