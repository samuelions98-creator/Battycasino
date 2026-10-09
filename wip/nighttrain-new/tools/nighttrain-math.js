/* Loads the Night Train maths straight out of games/nighttrain/game.js (the part before the presentation marker), so the
   simulation and the cross-check always test exactly the code the browser runs. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function loadNightTrain() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'nighttrain', 'game.js'), 'utf8');
  const cut = src.indexOf('/* ===== nighttrain ===== */');
  if (cut < 0) throw new Error('presentation marker not found in games/nighttrain/game.js');
  const mod = { exports: {} };
  new Function('module', 'globalThis', src.slice(0, cut))(mod, {});
  return mod.exports;
};
