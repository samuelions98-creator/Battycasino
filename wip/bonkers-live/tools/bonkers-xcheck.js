#!/usr/bin/env node
/* Bonkers Time parity check: the JS maths (games/bonkers/game.js) and the PHP port (lib/games/bonkers.php) must draw
   identical rounds, timetables and settlements from the same seeded generator.
   Usage: node tools/bonkers-xcheck.js [rounds=20000] [seed=7]   (needs php on the PATH) */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { M, mulberry32 } = require('./bonkers-sim.js');

const n = +(process.argv[2] || 20000), seed = +(process.argv[3] || 7);
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((a, k) => { a[k] = canon(v[k]); return a; }, {}) : v);
const php = JSON.parse(execFileSync('php', [path.join(__dirname, 'bonkers-xcheck.php'), String(n), String(seed)], { maxBuffer: 1 << 30 }).toString());

const rng = mulberry32(seed);
const bets = { 1: 10, 2: 20, 5: 30, 10: 40, flap: 50, hunt: 60, drop: 70, bonkers: 80 };
const js = [];
for (let i = 0; i < n; i++) {
  const o = M.drawRound(rng);
  const picks = { hunt: Math.floor(rng() * M.HUNT_N), flapper: Math.floor(rng() * 3) };
  js.push({ o, picks, settle: M.settle(bets, o, picks), plan: M.plan(o, 1000000.25 + i * 61.5) });
}
const tables = { WHEEL: M.WHEEL, TS_STRIP: M.TS_STRIP, TS: M.TS, FLAP: M.FLAP, HUNT: M.HUNT, DROP: M.DROP, BIG: M.BIG.segs, CAP: M.CAP, TIME: M.TIME };
let bad = 0;
if (JSON.stringify(canon(tables)) !== JSON.stringify(canon(php.tables))) { console.log('TABLES DIFFER'); bad++; }
const kinds = {};
for (let i = 0; i < n; i++) {
  const a = JSON.stringify(canon(js[i])), b = JSON.stringify(canon(php.rounds[i]));
  kinds[js[i].o.spot] = (kinds[js[i].o.spot] || 0) + 1;
  if (a !== b) { if (bad < 3) console.log('round ' + i + ' differs\n JS  ' + a.slice(0, 600) + '\n PHP ' + b.slice(0, 600)); bad++; }
}
console.log((bad ? 'MISMATCH: ' + bad + ' differences' : 'OK: JS and PHP agree') + ' over ' + n.toLocaleString('en-GB') + ' seeded rounds (seed ' + seed + ') ' + JSON.stringify(kinds));
process.exit(bad ? 1 : 0);
