/* Night Train cross-check: the PHP port (lib/games/nighttrain.php) must produce exactly the same rounds as the JS maths
   (games/nighttrain/game.js) from the same seeded RNG (mulberry32 / batty_mulberry).
   Usage: node tools/nighttrain-xcheck.js [spins=20000] [buys=20000] [seed0=1]
   Compares the reel strips and the config, then every round field by field (spins, plus bought bonuses so that the
   whole Respin Bonus is exercised thousands of times). Exits non-zero on the first difference. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const M = require('./nighttrain-math.js')();

const spins = +(process.argv[2] || 20000), buys = +(process.argv[3] || 20000), seed0 = +(process.argv[4] || 1);
const t0 = Date.now();
const out = execFileSync('php', [path.join(__dirname, 'nighttrain-xcheck.php'), String(spins), String(buys), String(seed0)], { maxBuffer: 1 << 30, encoding: 'utf8' });
const lines = out.split('\n').filter(Boolean);
const tPhp = Date.now() - t0;

const canon = (x) => JSON.stringify(x);
function firstDiff(a, b, p) {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) return p + ': ' + canon(a) + ' vs ' + canon(b);
  if (a && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join() !== kb.join()) return p + ' keys: ' + ka.join() + ' vs ' + kb.join();
    for (const k of ka) { const d = firstDiff(a[k], b[k], p + '.' + k); if (d) return d; }
    return null;
  }
  return a === b ? null : p + ': ' + canon(a) + ' vs ' + canon(b);
}
let bad = 0;
const head = JSON.parse(lines[0]);
const want = { strips: M.STRIPS, cfg: M.CFG, pay: M.PAY, lines: M.LINES };
for (const k of Object.keys(want)) { const d = firstDiff(want[k], head[k], k); if (d) { console.log('MISMATCH in ' + d); bad++; } }

let n = 0, bonuses = 0, acts = 0, respins = 0, total = 0;
for (let i = 0; i < spins + buys && !bad; i++) {
  const js = i < spins ? M.spin(M.mulberry(seed0 + i)) : M.buy(M.mulberry(seed0 + 1000000 + (i - spins)));
  const php = JSON.parse(lines[i + 1]);
  const d = firstDiff(JSON.parse(canon(js)), php, i < spins ? 'spin#' + i : 'buy#' + (i - spins));
  if (d) { console.log('MISMATCH ' + d); bad++; break; }
  n++; total += js.totalWin;
  if (js.bonus) { bonuses++; respins += js.bonus.respins; acts += js.bonus.startActs.length + js.bonus.steps.reduce((a, s) => a + s.acts.length, 0); }
}
if (bad) { console.log('FAILED'); process.exit(1); }
console.log('Night Train cross-check: ' + n.toLocaleString('en-GB') + ' rounds identical in JS and PHP (' + spins + ' spins + ' + buys + ' bought bonuses, seeds from ' + seed0 + ')');
console.log('  covered ' + bonuses.toLocaleString('en-GB') + ' bonuses, ' + respins.toLocaleString('en-GB') + ' respins, ' + acts.toLocaleString('en-GB') + ' character actions; strips, paytable, lines and config identical');
console.log('  total credits ' + total.toLocaleString('en-GB') + ' · php ' + (tPhp / 1000).toFixed(1) + 's');
