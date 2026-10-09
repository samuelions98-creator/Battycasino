/* Bat Derby parity check: the JavaScript maths (games/derby/game.js) and the PHP port (lib/games/derby.php) must build the
   same stable, price the same fields, run the same races and settle the same bets from the same seeded rng.
   Usage: node tools/derby-xcheck.js [rounds=20000]        (runs tools/derby-xcheck.php and compares every round)
          node tools/derby-xcheck.js dump <seed>           (prints the JSON of one round, for diffing by hand) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');

function loadMath() {
  const src = fs.readFileSync(path.join(__dirname, '../games/derby/game.js'), 'utf8');
  const cut = src.indexOf('/* ===== derby ===== */');
  const g = {};
  new Function('globalThis', 'module', src.slice(0, cut))(g, undefined);
  return g.BattyMath.derby;
}
const M = loadMath();
const STAKES = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* One round: a fresh stable, a race (some bats excluded), its result, a few bets settled and the form update. */
function round(seed) {
  const rng = mulberry32(seed);
  const roster = M.makeRoster(rng);
  const exclude = []; const nx = Math.floor(rng() * 9); for (let i = 0; i < nx; i++) exclude.push(1 + Math.floor(rng() * 48));
  const race = M.makeRace(rng, roster, exclude);
  const res = M.runRace(rng, race);
  const types = ['win', 'ew', 'fc', 'rfc', 'tc'];
  const bets = [];
  for (let i = 0; i < 6; i++) {
    const t = types[Math.floor(rng() * 5)], n = M.TYPES[t].n;
    const sel = []; while (sel.length < n) { const x = Math.floor(rng() * 8); if (sel.indexOf(x) < 0) sel.push(x); }
    /* every third bet backs the actual result so winning paths are exercised as well */
    if (i % 3 === 0) for (let k = 0; k < n; k++) sel[k] = res.order[k];
    const b = { t, sel, stake: STAKES[Math.floor(rng() * STAKES.length)] };
    bets.push({ b, err: M.checkBet(b, STAKES), win: M.settleBet(b, race, res) });
  }
  const bats = race.runners.map((r) => roster.find((x) => x.id === r.id));
  const form = M.updateForm(bats, race, res, seed, 1700000000 + seed);
  return { roster: roster.slice(0, 3), exclude, race, res, bets, form, margins: res.margins.map(M.marginStr) };
}

const args = process.argv.slice(2);
if (args[0] === 'dump') { console.log(JSON.stringify(round(+args[1]))); process.exit(0); }
const n = +(args[0] || 20000);
const t0 = Date.now();
const js = [];
for (let s = 1; s <= n; s++) js.push(crypto.createHash('md5').update(JSON.stringify(round(s))).digest('hex'));
const tj = Date.now() - t0;
const out = execFileSync('php', [path.join(__dirname, 'derby-xcheck.php'), String(n)], { maxBuffer: 1 << 28 }).toString().trim().split('\n');
const tp = Date.now() - t0 - tj;
let bad = 0, first = 0;
for (let s = 1; s <= n; s++) if (out[s - 1] !== js[s - 1]) { bad++; if (!first) first = s; }
console.log('Bat Derby xcheck: ' + n + ' seeded rounds (stable + race + result + 6 bets + form update each), JS ' + tj + ' ms, PHP ' + tp + ' ms');
if (bad) { console.log('MISMATCH in ' + bad + ' rounds; first at seed ' + first + '. Compare: node tools/derby-xcheck.js dump ' + first + '  vs  php tools/derby-xcheck.php dump ' + first); process.exit(1); }
console.log('All ' + n + ' rounds identical (md5 of the full JSON of each round).');
