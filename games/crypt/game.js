/* Count Batula's Crypt: placeholder until the game is built. */
(function () {
  'use strict';
  const B = Batty, h = B.h;
  B.registerGame({
    id: 'crypt', name: "Count Batula's Crypt", tagline: 'Opening soon', tag: 'Coming soon',
    poster: '<svg viewBox="0 0 300 380"><rect width="300" height="380" fill="#1d1033"/><text x="150" y="200" text-anchor="middle" fill="#ffd76a" font-size="28" font-family="Titan One">Batula&#39;s Crypt</text></svg>',
    rules: '<p>Opening soon.</p>',
    mount(root) { root.append(h('div', { class: 'bc-loading' }, 'Opening soon')); },
    unmount() {},
  });
})();
