/* Loads the "royale math" IIFE out of games/royale/game.js for the node tools (the rest of the file needs a browser). */
const fs = require('fs'), path = require('path'), vm = require('vm');
function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'royale', 'game.js'), 'utf8');
  const math = src.split('/* ===== royale ===== */')[0];
  const ctx = { module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(math, ctx);
  return ctx.module.exports;
}
/* the same mulberry32 as games/fishing/game.js and batty_mulberry() in lib/rng.php */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
module.exports = { load, mulberry32 };
