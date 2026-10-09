/* Parity: the JS maths (games/royale/game.js) and the PHP port (lib/games/royale.php) must agree round for round.
   node tools/royale-xcheck.js [rounds=20000] [seed=777]  — runs both and diffs the JSON. */
const { load, mulberry32 } = require('./royale-load');
const { execFileSync } = require('child_process');
const path = require('path');
const M = load();
const N = +(process.argv[2] || 20000), seed = +(process.argv[3] || 777);

function rounds(rng) {
  const keys = Object.keys(M.SPOTS), out = [];
  for (let i = 0; i < N; i++) {
    const bets = {}, m = 1 + Math.floor(rng() * 6);
    for (let j = 0; j < m; j++) { const k = keys[Math.floor(rng() * keys.length)]; bets[k] = M.UNIT * (2 + Math.floor(rng() * 300)); }
    if (rng() < 0.03) bets.bogus = 2000;
    if (rng() < 0.03) bets.n17 = 2500;
    const n = M.draw(rng), s = M.settle(bets, n);
    out.push({ v: M.validate(bets), n, t: s.total, by: Object.entries(s.bySpot).sort((a, b) => (a[0] < b[0] ? -1 : 1)) });
  }
  return out;
}
const js = JSON.stringify({ spots: Object.keys(M.SPOTS), maxWin: M.maxWin(), rounds: rounds(mulberry32(seed)) });
const php = execFileSync('php', [path.join(__dirname, 'royale-xcheck.php'), String(N), String(seed)], { maxBuffer: 1 << 28 }).toString();
if (js === php) { console.log('PARITY OK: ' + N + ' rounds, seed ' + seed + ', ' + Object.keys(M.SPOTS).length + ' spots, identical JSON (' + js.length + ' bytes)'); process.exit(0); }
const a = JSON.parse(js), b = JSON.parse(php);
if (JSON.stringify(a.spots) !== JSON.stringify(b.spots)) console.log('spot lists differ');
if (a.maxWin !== b.maxWin) console.log('maxWin differs', a.maxWin, b.maxWin);
for (let i = 0; i < a.rounds.length; i++) if (JSON.stringify(a.rounds[i]) !== JSON.stringify(b.rounds[i])) { console.log('round', i, 'differs\nJS ', JSON.stringify(a.rounds[i]), '\nPHP', JSON.stringify(b.rounds[i])); break; }
process.exit(1);
