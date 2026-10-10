#!/usr/bin/env node
/* Count Batula's Crypt: proves the PHP port (lib/games/crypt.php) gives exactly the same results as the JavaScript maths
   (games/crypt/game.js, the part before the presentation) from the same seeded RNG (mulberry32 / batty_mulberry).
     node tools/crypt-xcheck.js [rounds=20000] [buys=3000] [forced=1000]
   Compares the tables and all 111 reel strips, then every round field by field: plain spins (with and without the ante,
   gambling the free spins 0 to 4 times), bought bonuses, and rounds forced into free spins on one seeded stream. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { loadMath } = require('./crypt-sim.js');
const M = loadMath();

const rounds = +(process.argv[2] || 20000), buys = +(process.argv[3] || 3000), forced = +(process.argv[4] || 1000);
const t0 = Date.now();
const out = execFileSync('php', [path.join(__dirname, 'crypt-xcheck.php'), String(rounds), String(buys), String(forced)], { maxBuffer: 1 << 30, encoding: 'utf8' }).trim().split('\n');
const tPhp = Date.now() - t0;
const stakes = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];
const js = [];
js.push(JSON.stringify({ PAY: M.PAY, HEIGHT_OUTER: M.HEIGHT_OUTER, HEIGHT_MID: M.HEIGHT_MID, COMP: M.COMP, SCATN: M.SCATN, TOPCOMP: M.TOPCOMP, STACK: M.STACK,
  GAMBLE_P: M.GAMBLE_P, FS_EV: M.FS_EV, MAX_WIN_X: M.MAX_WIN_X, CAP: M.CAP, BUY_X: M.BUY_X, ANTE: [M.ANTE_NUM, M.ANTE_DEN], STRIPS: M.STRIPS }));
const st = { fs: 0, fsSpins: 0, gw: 0, gl: 0, casc: 0, retrig: 0, capped: 0, maxMult: 0 };
const tally = (o) => {
  st.casc += o.base.steps.length - 1;
  for (const g of o.gambles) { if (g) st.gw++; else st.gl++; }
  if (o.fs) { st.fs++; st.fsSpins += o.fs.played; st.retrig += o.fs.retrigs; st.maxMult = Math.max(st.maxMult, o.fs.maxMult); if (o.fs.capped) st.capped++; }
  if (o.base.capped) st.capped++;
};
for (let i = 0; i < rounds; i++) {
  const rng = M.mulberry(1000003 * i + 17), g = i % 5;
  const o = M.round(rng, { ante: i % 3 === 0, policy: (n, k) => k < g });
  tally(o);
  js.push(JSON.stringify({ i, o, bb: Math.floor(o.win * stakes[i % 9] / M.UNITS) }));
}
for (let i = 0; i < buys; i++) {
  const rng = M.mulberry(0x5eed + 7919 * i), g = i % 5;
  const o = M.round(rng, { buy: true, policy: (n, k) => k < g });
  tally(o);
  js.push(JSON.stringify({ b: i, o, bb: Math.floor(o.win * stakes[i % 9] / M.UNITS) }));
}
for (let i = 0; i < forced; i++) {
  const rng = M.mulberry(0xc0ffee + 104729 * i); let tries = 0, o;
  do { o = M.spin(rng, i % 2 === 1); tries++; } while (!o.fs);
  const fs = M.freeSpins(rng, o.fs, o.win);
  st.fs++; st.fsSpins += fs.played; st.retrig += fs.retrigs; st.maxMult = Math.max(st.maxMult, fs.maxMult); if (fs.capped) st.capped++;
  js.push(JSON.stringify({ f: i, tries, o, fs }));
}
for (let i = 0; i < 500; i++) {
  const rng = M.mulberry(0xcab + 31337 * i);
  const fs = M.freeSpins(rng, 12 + 4 * (i % 5), M.CAP - 500 - (i * 97) % 6000);
  if (fs.capped) st.capped++;
  js.push(JSON.stringify({ c: i, fs }));
}
/* compare as parsed JSON (this ignores only number formatting; key order and every value must match) */
const canon = (s) => JSON.stringify(JSON.parse(s));
let bad = 0;
if (out.length !== js.length) { console.log('LINE COUNT DIFFERS: php ' + out.length + ' js ' + js.length); bad++; }
for (let k = 0; k < Math.min(out.length, js.length); k++) {
  if (canon(out[k]) !== js[k]) {
    bad++;
    if (bad <= 3) {
      const a = canon(out[k]), b = js[k]; let p = 0; while (p < a.length && a[p] === b[p]) p++;
      console.log('MISMATCH at line ' + k + ' (char ' + p + ')\n php: ' + a.slice(Math.max(0, p - 120), p + 200) + '\n  js: ' + b.slice(Math.max(0, p - 120), p + 200));
    }
  }
}
const n = (x) => x.toLocaleString('en-GB');
console.log("Count Batula's Crypt cross-check: " + n(rounds) + ' seeded rounds (a third with the ante, every stake) + ' + n(buys) + ' bought bonuses + ' + n(forced) + ' rounds forced into free spins + 500 free-spin runs started just under the max-win cap.');
console.log('  covered ' + n(st.fs) + ' free-spin bonuses (' + n(st.fsSpins) + ' free spins, ' + n(st.retrig) + ' retriggers, top multiplier x' + st.maxMult + '), ' + n(st.gw) + ' gambles won and ' + n(st.gl) + ' lost, ' + n(st.casc) + ' base cascades, ' + st.capped + ' capped.');
console.log('PHP took ' + (tPhp / 1000).toFixed(1) + 's. ' + (bad ? bad + ' MISMATCHES' : 'IDENTICAL: tables, all reel strips and every round match exactly.'));
process.exit(bad ? 1 : 0);
