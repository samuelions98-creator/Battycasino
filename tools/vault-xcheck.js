#!/usr/bin/env node
/* Crimson Vault: proves the PHP port (lib/games/vault.php) gives exactly the same results as the JavaScript maths
   (games/vault/game.js, the part before the presentation) from the same seeded RNG (mulberry32 / batty_mulberry).
     node tools/vault-xcheck.js [rounds=20000] [buys=3000] [forced=1500]
   Compares the tables and every reel strip, then every round field by field: plain spins (a trigger picks each vault in
   turn), bought rounds (the 100x buy and the 300x Inside Job, every vault), rounds forced into the feature, and free spins
   started just under the 50,000x cap. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { loadMath } = require('./vault-sim.js');
const M = loadMath();

const rounds = +(process.argv[2] || 20000), buys = +(process.argv[3] || 3000), forced = +(process.argv[4] || 1500);
const t0 = Date.now();
const out = execFileSync('php', [path.join(__dirname, 'vault-xcheck.php'), String(rounds), String(buys), String(forced)], { maxBuffer: 1 << 30, encoding: 'utf8' }).trim().split('\n');
const tPhp = Date.now() - t0;
const js = [];
js.push(JSON.stringify({ PAY: M.PAY, KEY_PAY: M.KEY_PAY, LINES: M.LINES, BASE: M.BASE, FREE: M.FREE, MODES: M.MODES, BUY_PRICE: M.BUY_PRICE,
  FEATURE_EV: M.FEATURE_EV, CAP: M.CAP, MAX_WIN_X: M.MAX_WIN_X, STAKES: M.STAKES, MIN_LEVEL: M.MIN_LEVEL, STRIPS: M.STRIPS, FREE_STRIPS: M.FREE_STRIPS }));
const bb = (u, s) => Math.floor(u * s / M.UNITS);
const st = { feat: 0, byMode: [0, 0, 0], inside: 0, spins: 0, retrig: 0, forcedWild: 0, capped: 0, maxLineM: 0, trig: 0 };
const tally = (b) => {
  st.feat++; st.byMode[b.mode]++; if (b.inside) st.inside++; if (b.capped) st.capped++;
  for (const s of b.spins) { st.spins++; if (s.add) st.retrig++; if (s.forced) st.forcedWild++; for (const w of s.wins) if (w.m > st.maxLineM) st.maxLineM = w.m; }
};
for (let i = 0; i < rounds; i++) {
  const rng = M.mulberry(1000003 * i + 17), m = i % 3;
  const o = M.round(rng, { pick: () => m });
  if (o.bonus) { st.trig++; tally(o.bonus); }
  js.push(JSON.stringify({ i, o, bb: bb(o.win, M.STAKES[i % 7]) }));
}
for (let i = 0; i < buys; i++) {
  const rng = M.mulberry(0x5eed + 7919 * i), m = i % 3;
  const o = M.round(rng, { buy: Math.floor(i / 3) % 2, pick: () => m });
  tally(o.bonus);
  js.push(JSON.stringify({ b: i, o, bb: bb(o.win, M.STAKES[i % 7]) }));
}
for (let i = 0; i < forced; i++) {
  const rng = M.mulberry(0xc0ffee + 104729 * i); let tries = 0, o;
  do { o = M.spin(rng); tries++; } while (!o.trigger);
  const b = M.bonus(rng, i % 3, { carried: o.pay });
  tally(b);
  js.push(JSON.stringify({ f: i, tries, o, b }));
}
for (let i = 0; i < 600; i++) {
  const rng = M.mulberry(0xcab + 31337 * i);
  const b = M.bonus(rng, i % 3, { inside: Math.floor(i / 3) % 2 === 1, carried: M.CAP - 500 - (i * 97) % 6000 });
  tally(b);
  js.push(JSON.stringify({ c: i, b }));
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
console.log('Crimson Vault cross-check: ' + n(rounds) + ' seeded rounds (every stake) + ' + n(buys) + ' bought rounds (100x and 300x) + ' + n(forced) + ' rounds forced into the feature + 600 free-spin runs started just under the 50,000x cap.');
console.log('  covered ' + n(st.feat) + ' features (' + n(st.trig) + ' natural triggers; Safe ' + n(st.byMode[0]) + ', Deposit Box ' + n(st.byMode[1]) + ', Grand Vault ' + n(st.byMode[2]) + '; ' + n(st.inside) + ' Inside Jobs), ' +
  n(st.spins) + ' free spins, ' + n(st.retrig) + ' retriggers, ' + n(st.forcedWild) + ' guaranteed wilds, top line multiplier x' + st.maxLineM + ', ' + st.capped + ' capped.');
console.log('PHP took ' + (tPhp / 1000).toFixed(1) + 's. ' + (bad ? bad + ' MISMATCHES' : 'IDENTICAL: tables, all reel strips and every round match exactly.'));
process.exit(bad ? 1 : 0);
