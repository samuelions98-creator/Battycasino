#!/usr/bin/env node
/* Bunky Time parity check: the JS maths (games/bunky/game.js) and the PHP port (lib/games/bunky.php) must draw identical
   rounds, settlements, live timetables, rest angles and reveals from the same seeded generator.
   Usage: node tools/bunky-xcheck.js [rounds=20000] [seed=7]   (needs php on the PATH) */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { M, mulberry32 } = require('./bunky-sim.js');

const n = +(process.argv[2] || 20000), seed = +(process.argv[3] || 7);
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((a, k) => { a[k] = canon(v[k]); return a; }, {}) : v);
const php = JSON.parse(execFileSync('php', [path.join(__dirname, 'bunky-xcheck.php'), String(n), String(seed)], { maxBuffer: 1 << 30 }).toString());

const rng = mulberry32(seed);
const bets = {}; M.SPOTS.forEach((s, i) => { bets[s] = 10 * (i + 1); });
const js = [];
for (let i = 0; i < n; i++) {
  const o = M.spin(rng);
  const jit = (rng() - 0.5) * 0.72;
  const pick = Math.floor(rng() * 3);
  const open = 1000000.25 + i * 61.5, tl0 = M.timeline(o), tl = { open };
  for (const k in tl0) tl[k] = Array.isArray(tl0[k]) ? tl0[k].map((x) => open + x) : open + tl0[k];
  const r = { id: i + 1, o, tl, th0: 1.5, jit };
  const seen = [0.5, 15.2, 22.9, 29.6, 34.0, 41.0, 47.0, 55.0, 70.0, 95.0].map((dt) => M.reveal(r, open + dt));
  js.push({ o, pick, settle: M.settle(bets, o, pick), tl: tl0, topX: M.topX(o), rest: Math.round(M.restAngle(o.stop, jit) * 1e9) / 1e9, seen });
}
const strip = (t) => { const c = {}; for (const k of ['values', 'weights', 'total']) c[k] = t[k]; return c; };
const tables = {
  WHEEL: M.WHEEL, ODDS: M.ODDS, MAX_BONUS_X: M.MAX_BONUS_X, SPOT_MAX: M.SPOT_MAX, LIVE: M.LIVE,
  BOOST: { ones: M.BOOST.ones, letters: M.BOOST.letters, bonusChance: M.BOOST.bonusChance, oneMult: strip(M.BOOST.oneMult), letterMult: strip(M.BOOST.letterMult), bonusMult: strip(M.BOOST.bonusMult) },
  BAR: strip(M.BAR), HANG: M.HANG, DISCO: { size: M.DISCO.size, tiles: strip(M.DISCO.tiles) }, VIP: { size: M.VIP.size, tiles: strip(M.VIP.tiles) },
};
let bad = 0;
const ta = JSON.stringify(canon(tables)), tb = JSON.stringify(canon(php.tables));
if (ta !== tb) { console.log('TABLES DIFFER\n JS  ' + ta.slice(0, 800) + '\n PHP ' + tb.slice(0, 800)); bad++; }
const kinds = {};
for (let i = 0; i < n; i++) {
  const a = JSON.stringify(canon(js[i])), b = JSON.stringify(canon(php.rounds[i]));
  kinds[js[i].o.spot] = (kinds[js[i].o.spot] || 0) + 1;
  if (a !== b) { if (bad < 3) console.log('round ' + i + ' differs\n JS  ' + a.slice(0, 900) + '\n PHP ' + b.slice(0, 900)); bad++; }
}
console.log((bad ? 'MISMATCH: ' + bad + ' differences' : 'OK: JS and PHP agree') + ' over ' + n.toLocaleString('en-GB') + ' seeded rounds (seed ' + seed + ') ' + JSON.stringify(kinds));
process.exit(bad ? 1 : 0);
