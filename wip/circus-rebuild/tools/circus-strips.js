/* Batty Circus: builds the reel strips from symbol counts and writes the same text into games/circus/math.js and
   lib/games/circus.php (between the STRIPS markers).
   Usage: node tools/circus-strips.js [--print]
   Wilds go in as stacks; bonus symbols are spread evenly so no more than one can show on a reel at once. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

/* counts per reel: [E, L, M, G, S, A, K, Q, J], wild stacks [sizes...], bonus count */
const CFG = {
  base: [
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [], b: 3 },
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [3, 2], b: 0 },
    { c: [3, 4, 5, 6, 7, 9, 10, 10, 10], w: [3, 2], b: 3 },
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [4, 2], b: 0 },
    { c: [3, 4, 5, 6, 7, 9, 10, 10, 10], w: [4, 2], b: 3 },
  ],
  jester: [
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [], b: 0 },
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [2], b: 0 },
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [2], b: 0 },
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [2], b: 0 },
    { c: [3, 4, 5, 6, 7, 9, 10, 11, 12], w: [2], b: 0 },
  ],
  elephant: [
    { c: [9, 4, 5, 6, 7, 9, 10, 11, 12], w: [], b: 2 },
    { c: [9, 4, 5, 6, 7, 9, 10, 11, 12], w: [3], b: 0 },
    { c: [9, 4, 5, 6, 7, 9, 10, 11, 12], w: [3], b: 2 },
    { c: [9, 4, 5, 6, 7, 9, 10, 11, 12], w: [3], b: 0 },
    { c: [9, 4, 5, 6, 7, 9, 10, 11, 12], w: [3], b: 2 },
  ],
};
const PAYCH = 'ELMGSAKQJ';

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function build(cfg, seed) {
  const rnd = mulberry32(seed);
  const blocks = [];
  cfg.c.forEach((n, i) => { for (let k = 0; k < n; k++) blocks.push(PAYCH[i]); });
  for (const st of cfg.w) blocks.push('W'.repeat(st));
  /* shuffle until no two equal high symbols touch and no wild stacks touch */
  for (let tries = 0; tries < 5000; tries++) {
    for (let i = blocks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    let ok = true;
    for (let i = 0; i < blocks.length; i++) { const a = blocks[i], b = blocks[(i + 1) % blocks.length]; if (a[0] === b[0] && 'WELMG'.includes(a[0])) { ok = false; break; } }
    if (ok) break;
  }
  let s = blocks.join('');
  if (cfg.b) {
    const arr = s.split(''), L = arr.length + cfg.b, gap = L / cfg.b, out = [];
    let bi = 0, src = 0;
    for (let i = 0; i < L; i++) {
      if (bi < cfg.b && i === Math.floor(bi * gap + gap / 2)) { out.push('B'); bi++; }
      else out.push(arr[src++]);
    }
    s = out.join('');
  }
  return s;
}

const res = {};
for (const set of Object.keys(CFG)) res[set] = CFG[set].map((c, r) => build(c, 1000 + r * 31 + set.length * 7));
const js = "  const BASE = " + JSON.stringify(res.base).replace(/","/g, "', '").replace('["', "['").replace('"]', "']") + ";\n" +
  "  const JFS = " + JSON.stringify(res.jester).replace(/","/g, "', '").replace('["', "['").replace('"]', "']") + ";\n" +
  "  const EFS = " + JSON.stringify(res.elephant).replace(/","/g, "', '").replace('["', "['").replace('"]', "']") + ";\n";
const php = "const CC_BASE = " + JSON.stringify(res.base).replace(/","/g, "', '").replace('["', "['").replace('"]', "']") + ";\n" +
  "const CC_JFS = " + JSON.stringify(res.jester).replace(/","/g, "', '").replace('["', "['").replace('"]', "']") + ";\n" +
  "const CC_EFS = " + JSON.stringify(res.elephant).replace(/","/g, "', '").replace('["', "['").replace('"]', "']") + ";\n";
if (process.argv.includes('--print')) { console.log(js); process.exit(0); }
function inject(file, text) {
  const p = path.join(ROOT, file); if (!fs.existsSync(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(/(\/\*STRIPS\*\/\n)[\s\S]*?(\s*\/\*\/STRIPS\*\/)/, (m, a, b) => a + text.replace(/\n$/, '') + b);
  fs.writeFileSync(p, out);
}
inject('games/circus/math.js', js);
inject('lib/games/circus.php', php);
for (const set of Object.keys(res)) console.log(set, res[set].map((s) => s.length).join(' '));
