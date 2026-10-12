#!/usr/bin/env node
/* Echo Chamber: proves the PHP port (lib/games/echo.php) gives exactly the same tables and rounds as the JavaScript maths
   (games/echo/game.js) from the same seeded RNG (mulberry32 / batty_mulberry), and checks the return exactly:
   a player with perfect memory who banks after k levels returns at most 96%, for every k.
     node tools/echo-xcheck.js [rounds=20000] */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'echo', 'game.js'), 'utf8').split('/* ===== echo ===== */')[0];
const M = new Function('module', 'globalThis', src + '\nreturn module.exports;')({ exports: {} }, {});
function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const N = +(process.argv[2] || 20000);
const php = execFileSync('php', [path.join(__dirname, 'echo-xcheck.php'), String(N)], { maxBuffer: 1 << 30, encoding: 'utf8' }).trim().split('\n');
let bad = 0, ends = {}, paid = 0, staked = 0;
const head = JSON.stringify({ MULT: M.MULT, SURVIVE: M.SURVIVE });
if (php[0] !== head) { console.log('TABLES DIFFER\nPHP', php[0], '\nJS ', head); bad++; }
for (let i = 0; i < N; i++) {
  const rng = mulberry(1000003 * i + 11);
  let s = M.start(rng); const log = [s.seq];
  const cashAt = 1 + Math.floor(rng() * 12), skill = rng();
  const stake = [20, 100, 1000, 25000, 777760][i % 5]; let end = null, win = 0;
  for (;;) {
    const taps = s.seq.slice();
    if (rng() < (1 - skill) * 0.15) taps[Math.floor(rng() * taps.length)] = (taps[0] + 1) % 4;
    const o = M.input(s, taps, rng); s = o.s; log.push(o.res);
    if (o.res === 'miss' || o.res === 'storm') { end = o.res; win = 0; break; }
    if (o.res === 'top') { end = 'top'; win = M.win(stake, s.m); break; }
    if (s.L >= cashAt) { end = 'cash'; win = M.win(stake, s.m); break; }
    s = M.next(s, rng); log.push(s.seq);
  }
  ends[end] = (ends[end] || 0) + 1; paid += win; staked += stake;
  const js = JSON.stringify({ i, log, end, win, L: s.L });
  if (php[i + 1] !== js) { if (bad++ < 3) console.log('ROUND DIFFERS', i, '\nPHP', php[i + 1], '\nJS ', js); }
}
let worst = 0; const rows = [];
for (let k = 1; k <= M.LEVELS; k++) { const r = M.perfectReturn(k); rows.push(k + ':' + (r * 100).toFixed(2) + '%'); worst = Math.max(worst, r); }
console.log('perfect-memory return, bank after k levels:', rows.join('  '));
console.log(worst <= 0.96 ? 'OK: no strategy beats 96% (best ' + (worst * 100).toFixed(3) + '%)' : 'FAIL: a strategy exceeds 96%');
console.log(bad ? 'MISMATCH in ' + bad : 'PARITY OK: tables and ' + N.toLocaleString() + ' seeded rounds identical', JSON.stringify(ends), 'sample RTP of this slipping-player mix ' + (paid / staked * 100).toFixed(1) + '%');
process.exit(bad || worst > 0.96 ? 1 : 0);
