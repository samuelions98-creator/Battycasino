/* ===== baccarat math ===== */
/* Velvet Baccarat: pure maths, no DOM. Shared verbatim by the browser (practice mode and the table clock),
   tools/baccarat-sim.js and tools/baccarat-xcheck.js; lib/games/baccarat.php is a line-for-line port.
   Punto Banco from an 8-deck shoe, standard third-card rules. Every random decision takes rng() in [0,1). */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).baccarat = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DECKS = 8, SHOE_N = 416;
  const CHIPS = [2000, 5000, 10000, 25000, 50000, 100000, 250000];
  const SPOTS = ['P', 'B', 'T', 'PP', 'BP', 'PD', 'BD'];
  const LIMIT = { P: 2500000, B: 2500000, T: 250000, PP: 100000, BP: 100000, PD: 100000, BD: 100000 };
  const MAX_WIN = 10500000;
  const MIN_LEVEL = 5;
  /* the table clock in seconds (identical in PHP) */
  const T = { BET: 12, SHUFFLE: 7, BASE: 7.6, THIRD: 2.2, END: 0.4, REST: 3 };
  /* Dragon Bonus: non-natural win by N points -> return per unit (stake included) */
  const DRAGON = { 9: 31, 8: 11, 7: 7, 6: 5, 5: 3, 4: 2 };

  /* card 0..51: rank = c % 13 (0 ace .. 8 nine, 9 ten, 10 jack, 11 queen, 12 king), suit = floor(c / 13) */
  const val = (c) => { const r = c % 13; return r >= 9 ? 0 : r + 1; };

  function newShoe(rng) {
    const s = new Array(SHOE_N);
    for (let i = 0; i < SHOE_N; i++) s[i] = i % 52;
    for (let i = SHOE_N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = s[i]; s[i] = s[j]; s[j] = t; }
    const cut = SHOE_N - 14 - Math.floor(rng() * 5);
    const burnN = val(s[0]) || 10;
    return { cards: s, cut, pos: 1 + burnN, burn: s[0] };
  }
  /* Deal one hand from pos: P, B, P, B, then the third-card rules. */
  function deal(cards, pos) {
    const p = [cards[pos], cards[pos + 2]], b = [cards[pos + 1], cards[pos + 3]]; let k = pos + 4;
    let pt = (val(p[0]) + val(p[1])) % 10, bt = (val(b[0]) + val(b[1])) % 10;
    const pn = pt, bn = bt;
    if (pt < 8 && bt < 8) {
      let p3 = -1;
      if (pt <= 5) { const c = cards[k++]; p.push(c); p3 = val(c); pt = (pt + p3) % 10; }
      const draw = p3 < 0 ? bt <= 5
        : bt <= 2 || (bt === 3 && p3 !== 8) || (bt === 4 && p3 >= 2 && p3 <= 7) || (bt === 5 && p3 >= 4 && p3 <= 7) || (bt === 6 && (p3 === 6 || p3 === 7));
      if (draw) { const c = cards[k++]; b.push(c); bt = (bt + val(c)) % 10; }
    }
    return { p, b, pt, bt, pn, bn, res: pt > bt ? 'P' : bt > pt ? 'B' : 'T', pp: p[0] % 13 === p[1] % 13, bp: b[0] % 13 === b[1] % 13, pos: k };
  }
  /* A dealt hand's facts from its cards alone. */
  function facts(p, b) {
    const sum = (cs) => cs.reduce((a, c) => a + val(c), 0) % 10;
    const pt = sum(p), bt = sum(b);
    return { p, b, pt, bt, pn: (val(p[0]) + val(p[1])) % 10, bn: (val(b[0]) + val(b[1])) % 10, res: pt > bt ? 'P' : bt > pt ? 'B' : 'T', pp: p[0] % 13 === p[1] % 13, bp: b[0] % 13 === b[1] % 13 };
  }
  /* What 1 unit on the Dragon Bonus for side returns: natural win 1:1, natural tie push, non-natural win by 9..4 pays 30..1 to 1. */
  function dragon(h, side) {
    const P = side === 'P';
    const my = P ? h.pt : h.bt, ot = P ? h.bt : h.pt;
    const myN = (P ? h.pn : h.bn) >= 8 && (P ? h.p : h.b).length === 2;
    const otN = (P ? h.bn : h.pn) >= 8 && (P ? h.b : h.p).length === 2;
    if (my < ot) return 0;
    if (my === ot) return myN && otN ? 1 : 0;
    if (myN) return 2;
    return DRAGON[my - ot] || 0;
  }
  /* What a set of bets returns on a hand (stakes included), spot by spot. */
  function settle(bets, h) {
    const by = {}; let total = 0;
    for (const k of SPOTS) {
      if (bets[k] == null) continue;
      const s = bets[k]; let w;
      switch (k) {
        case 'P': w = h.res === 'P' ? 2 * s : h.res === 'T' ? s : 0; break;
        case 'B': w = h.res === 'B' ? s + Math.floor(s * 95 / 100) : h.res === 'T' ? s : 0; break;
        case 'T': w = h.res === 'T' ? 9 * s : 0; break;
        case 'PP': w = h.pp ? 12 * s : 0; break;
        case 'BP': w = h.bp ? 12 * s : 0; break;
        case 'PD': w = s * dragon(h, 'P'); break;
        default: w = s * dragon(h, 'B');
      }
      by[k] = w; total += w;
    }
    return { total: Math.min(total, MAX_WIN), by };
  }
  /* null if the bets are legal, else why not (chips only: 2,000 or any multiple of 1,000 from 4,000). */
  function check(bets) {
    for (const k in bets) {
      const v = bets[k];
      if (!SPOTS.includes(k)) return 'Unknown bet spot';
      if (!Number.isInteger(v) || v < CHIPS[0] || v % 1000 !== 0 || v === 3000) return 'Bets are made with the table chips';
      if (v > LIMIT[k]) return 'That spot is at its table limit';
    }
    if (bets.P != null && bets.B != null) return 'Back the Player or the Banker, not both';
    return null;
  }
  const resultAfter = (h) => T.BASE + T.THIRD * (h.p.length + h.b.length - 4) + T.END;
  /* The reveal script for a hand, in seconds after betting closes (the client animates exactly this).
     Four cards go out face down; the Player pair is squeezed, then the Banker pair; then any third cards, one at a time. */
  function timeline(h) {
    const ev = { deal: [0.25, 0.5, 0.75, 1.0], sqP: [1.45, 4.35], sqB: [4.55, 7.45], third: [] };
    let t = T.BASE;
    if (h.p.length === 3) { ev.third.push({ side: 'P', deal: t, sq: [t + 0.35, t + 1.95] }); t += T.THIRD; }
    if (h.b.length === 3) { ev.third.push({ side: 'B', deal: t, sq: [t + 0.35, t + 1.95] }); t += T.THIRD; }
    ev.result = t + T.END;
    return ev;
  }
  /* split an amount into table chips, biggest first */
  function chipsOf(amount) {
    const out = []; let a = amount;
    for (let i = CHIPS.length - 1; i >= 0 && a > 0; i--) while (a >= CHIPS[i]) { out.push(CHIPS[i]); a -= CHIPS[i]; }
    if (a > 0) out.push(a);
    return out;
  }
  /* exact figures from tools/baccarat-sim.js (8 decks, a full shoe; exact combinatorial enumeration) */
  const RTP = {
    P: { rtp: 98.7649, edge: 1.2351, hit: 44.6247 },
    B: { rtp: 98.9421, edge: 1.0579, hit: 45.8597 },
    T: { rtp: 85.6404, edge: 14.3596, hit: 9.5156 },
    PP: { rtp: 89.6386, edge: 10.3614, hit: 7.4699 },
    BP: { rtp: 89.6386, edge: 10.3614, hit: 7.4699 },
    PD: { rtp: 97.3483, edge: 2.6517, hit: 28.9887 },
    BD: { rtp: 90.6269, edge: 9.3731, hit: 28.2795 },
  };

  return { DECKS, SHOE_N, CHIPS, SPOTS, LIMIT, MAX_WIN, MIN_LEVEL, T, DRAGON, RTP, val, newShoe, deal, facts, dragon, settle, check, resultAfter, timeline, chipsOf };
});
