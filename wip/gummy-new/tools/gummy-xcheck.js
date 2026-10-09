#!/usr/bin/env node
/* Gummy Bats parity check: the JS maths (games/gummy/game.js, "gummy math" block) and the PHP port (lib/games/gummy.php)
   must produce identical rounds from the same seeded RNG.

   node tools/gummy-xcheck.js [rounds=20000] [firstSeed=1]

   Round i is seeded with mulberry32(firstSeed + i) on both sides (lib/rng.php's batty_mulberry is bit-for-bit the same
   generator). Modes rotate 7 base : 2 buy : 1 super, and every 50th base round is a forced 3–7 Moon trigger spin, so the
   free spins, retriggers, Super spots and the cap path are all exercised. Every round's full outcome (grids, clusters,
   multiplier spots, refills, free spins, totals) is compared, plus every table. Exits 1 on the first mismatch. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), { spawnSync } = require('child_process');

const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'gummy', 'game.js'), 'utf8');
const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('/* ===== gummy math ===== */'), src.indexOf('/* ===== gummy ===== */')), ctx);
const M = ctx.module.exports;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const xcMode = (i) => { const k = i % 10; return k < 7 ? 'base' : k < 9 ? 'buy' : 'super'; };

const N = +(process.argv[2] || 20000), first = +(process.argv[3] || 1);
const t0 = Date.now();
const r = spawnSync('php', [path.join(__dirname, 'gummy-xcheck.php'), String(first), String(N)], { maxBuffer: 1 << 30, encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const lines = r.stdout.split('\n').filter(Boolean);
const tPhp = Date.now() - t0;

/* deep compare, key order ignored; returns the path of the first difference */
function diff(a, b, p) {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null) return p + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
  if (Array.isArray(a) !== Array.isArray(b)) return p + ': array vs object';
  if (typeof a !== 'object') return p + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return p + ': keys ' + ka.join(',') + ' vs ' + kb.join(',');
  for (const k of ka) { if (!(k in b)) return p + ': missing ' + k; const d = diff(a[k], b[k], p + '.' + k); if (d) return d; }
  return null;
}

const tables = { COLS: M.COLS, ROWS: M.ROWS, CELLS: M.CELLS, UNITS_PER_STAKE: M.UNITS_PER_STAKE, MAX_WIN_X: M.MAX_WIN_X, CAP: M.CAP, BUY_X: M.BUY_X, SUPER_X: M.SUPER_X,
  MIN_CLUSTER: M.MIN_CLUSTER, TOP_CLUSTER: M.TOP_CLUSTER, SPOT_MAX: M.SPOT_MAX, SUPER_SPOT: M.SUPER_SPOT, PAY: M.PAY, FS_AWARD: M.FS_AWARD, FS_TRIGGER: M.FS_TRIGGER, W: M.W, BUY_MOONS: M.BUY_MOONS, SUPER_MOONS: M.SUPER_MOONS };
const td = diff(JSON.parse(JSON.stringify(tables)), JSON.parse(lines[0]), 'tables');
if (td) { console.error('TABLE MISMATCH ' + td); process.exit(1); }

let fsRounds = 0, superRounds = 0, retrig = 0, units = 0, tumbles = 0, maxSpot = 0, capped = 0, wilds = 0;
for (let i = 0; i < N; i++) {
  const rng = mulberry32(first + i), mode = xcMode(i);
  const o = (mode === 'base' && i % 50 === 0) ? M.triggerSpin(rng, 3 + Math.floor(i / 50) % 5, 'base') : M.play(rng, mode);
  const js = JSON.parse(JSON.stringify(o)), php = JSON.parse(lines[i + 1] || 'null');
  const d = diff(js, php, 'round ' + i + ' (seed ' + (first + i) + ', ' + mode + ')');
  if (d) { console.error('MISMATCH ' + d); process.exit(1); }
  units += o.totalWin; if (o.capped) capped++;
  const seqs = [o.spin].concat(o.fs ? o.fs.spins : []);
  for (const s of seqs) { tumbles += s.steps.length; for (const v of s.spots) if (v > maxSpot) maxSpot = v; for (const st of s.steps) for (const a of st.add) for (const x of a) if (x === M.SYM.WILD) wilds++; }
  if (o.fs) { fsRounds++; retrig += o.fs.retriggers; if (o.fs.superFs) superRounds++; }
}
console.log('Gummy Bats parity: ' + N.toLocaleString('en-GB') + ' seeded rounds identical in JS and PHP (seeds ' + first + '–' + (first + N - 1) + '), tables identical.');
console.log('  covered: ' + fsRounds + ' free-spins features (' + superRounds + ' super), ' + retrig + ' retriggers, ' + tumbles + ' tumbles, ' + wilds + ' wilds dropped, biggest spot x' + maxSpot + ', ' + capped + ' capped rounds');
console.log('  total paid: ' + units.toLocaleString('en-GB') + ' units · PHP ' + (tPhp / 1000).toFixed(1) + 's, total ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
