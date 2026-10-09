/* Velvet Baccarat: JS <-> PHP parity. Both sides run the same seeded mulberry32 through the same script:
   shuffle 8-deck shoes, burn, deal hand after hand to the cut card, place random bets, settle them, and run the
   bet validator on random (often illegal) bet sets. The two JSON transcripts must be identical.
   Usage: node tools/baccarat-xcheck.js [hands=20000] [seed=7]   (runs php tools/baccarat-xcheck.php itself) */
'use strict';
const M = require('../games/baccarat/game.js');
const { execFileSync } = require('child_process');
const path = require('path');

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ODD = [1000, 2000, 3000, 4000, 7000, 99000, 100000, 101000, 250000, 2500000, 2501000];

function run(hands, seed) {
  const rng = mulberry32(seed), out = [];
  let shoe = M.newShoe(rng), shoeNo = 1;
  out.push(['shoe', shoeNo, shoe.cut, shoe.pos, shoe.burn, shoe.cards.slice(0, 12)]);
  for (let n = 0; n < hands; n++) {
    if (shoe.pos >= shoe.cut) { shoe = M.newShoe(rng); shoeNo++; out.push(['shoe', shoeNo, shoe.cut, shoe.pos, shoe.burn, shoe.cards.slice(0, 12)]); }
    const h = M.deal(shoe.cards, shoe.pos); shoe.pos = h.pos;
    const bets = {};
    for (const k of M.SPOTS) if (rng() < 0.45) bets[k] = M.CHIPS[Math.floor(rng() * M.CHIPS.length)] * (1 + Math.floor(rng() * 4));
    const s = M.settle(bets, h);
    const F = M.facts(h.p, h.b);
    const odd = {};
    for (const k of M.SPOTS) if (rng() < 0.3) odd[k] = ODD[Math.floor(rng() * ODD.length)];
    out.push([n, h.p, h.b, h.pt, h.bt, h.pn, h.bn, h.res, h.pp, h.bp, h.pos, M.dragon(h, 'P'), M.dragon(h, 'B'), s.total, M.SPOTS.map((k) => (s.by[k] == null ? -1 : s.by[k])),
      F.res === h.res && F.pt === h.pt && F.bt === h.bt ? 1 : 0, M.check(odd) || '', +M.resultAfter(h).toFixed(3)]);
  }
  return out;
}

const hands = +(process.argv[2] || 20000), seed = +(process.argv[3] || 7);
const js = JSON.stringify(run(hands, seed));
const php = execFileSync('php', [path.join(__dirname, 'baccarat-xcheck.php'), String(hands), String(seed)], { maxBuffer: 1 << 28 }).toString().trim();
if (js === php) { console.log('PARITY OK: ' + hands.toLocaleString('en-GB') + ' hands, seed ' + seed + ', ' + js.length.toLocaleString('en-GB') + ' bytes identical'); process.exit(0); }
const a = JSON.parse(js), b = JSON.parse(php);
for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { console.log('MISMATCH at line ' + i + '\n JS : ' + JSON.stringify(a[i]) + '\n PHP: ' + JSON.stringify(b[i])); process.exit(1); }
console.log('MISMATCH in number formatting only');
process.exit(1);
