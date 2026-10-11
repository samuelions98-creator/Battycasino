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

/* ===== baccarat ===== */
/* Velvet Baccarat: the High Roller Lounge's Punto Banco salon, drawn and animated in code. Vesper, a velvet-gloved bat
   croupière, deals from an eight-deck shoe; cards arc out with shadows and 3D flips, the key cards are squeezed with a slow
   peel, chips stack in 3D and slide to and from her float, and the scoreboard keeps the Bead Plate, Big Road, Big Eye Boy,
   Small Road and Cockroach Pig for the shoe.
   Online: one shared table on the server clock: everyone bets on the same hand, the cards leave the server only when betting
   closes, and the reveal follows BattyMath.baccarat.timeline exactly. Practice: the same maths and timeline in the browser.
   The felt is a fixed-size stage (wide, compact landscape and tall portrait layouts) scaled to fit; the roads dock beside it. */
(function () {
  'use strict';
  const ID = 'baccarat', M = BattyMath.baccarat, B = Batty, h = B.h, fmt = B.fmt;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const KEY = 'batty-baccarat-v1';
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SPOT_NAME = { P: 'Player', B: 'Banker', T: 'Tie', PP: 'Player Pair', BP: 'Banker Pair', PD: 'Player Dragon', BD: 'Banker Dragon' };
  const SPOT_PAYS = { P: '1 : 1', B: '0.95 : 1', T: '8 : 1', PP: '11 : 1', BP: '11 : 1', PD: 'up to 30 : 1', BD: 'up to 30 : 1' };
  /* chip colours: [body, edge stripes, label ink, label] */
  const CHIP_STYLE = {
    2000: ['#efe4cf', '#6b2f7a', '#3a1446', '2K'], 5000: ['#b3122a', '#f3d98b', '#fff4dc', '5K'], 10000: ['#1f4fa8', '#e9eefc', '#ffffff', '10K'],
    25000: ['#13704a', '#f3d98b', '#eafff3', '25K'], 50000: ['#121016', '#d9b25f', '#f3d98b', '50K'], 100000: ['#5b1f86', '#f0c8ff', '#ffffff', '100K'],
    250000: ['#d6a93e', '#2a0a3a', '#2a0a3a', '250K'],
  };

  /* ============================== cards ============================== */
  const SUIT = {
    0: '<path d="M50 4C50 4 11 37 11 60C11 76 25 85 38 81C44 79 47 75 48 71C47 83 42 92 33 97H67C58 92 53 83 52 71C53 75 56 79 62 81C75 85 89 76 89 60C89 37 50 4 50 4Z"/>',
    1: '<path d="M50 93C50 93 7 63 7 34C7 18 19 7 33 7C42 7 48 13 50 22C52 13 58 7 67 7C81 7 93 18 93 34C93 63 50 93 50 93Z"/>',
    2: '<path d="M50 3Q66 30 87 50Q66 70 50 97Q34 70 13 50Q34 30 50 3Z"/>',
    3: '<circle cx="50" cy="27" r="20"/><circle cx="27" cy="58" r="20"/><circle cx="73" cy="58" r="20"/><path d="M45 50C46 74 40 88 31 97H69C60 88 54 74 55 50Z"/>',
  };
  const red = (c) => { const s = Math.floor(c / 13); return s === 1 || s === 2; };
  const ink = (c) => (red(c) ? '#b3122a' : '#1a1222');
  const suitAt = (s, x, y, size, rot, fill) => '<g transform="translate(' + x + ' ' + y + ')' + (rot ? ' rotate(180)' : '') + ' scale(' + (size / 100) + ') translate(-50 -50)" fill="' + fill + '">' + SUIT[s] + '</g>';
  const PIPS = {
    2: [[50, 30], [50, 110]], 3: [[50, 30], [50, 70], [50, 110]], 4: [[32, 30], [68, 30], [32, 110], [68, 110]],
    5: [[32, 30], [68, 30], [50, 70], [32, 110], [68, 110]], 6: [[32, 30], [68, 30], [32, 70], [68, 70], [32, 110], [68, 110]],
    7: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [32, 110], [68, 110]],
    8: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [50, 90], [32, 110], [68, 110]],
    9: [[32, 30], [68, 30], [32, 57], [68, 57], [50, 70], [32, 83], [68, 83], [32, 110], [68, 110]],
    10: [[32, 30], [68, 30], [50, 44], [32, 57], [68, 57], [32, 83], [68, 83], [50, 96], [32, 110], [68, 110]],
  };
  /* the court cards: a bat in the suit colour wearing a crown (K), a tiara (Q) or a velvet hood (J), mirrored like a real court card */
  function court(r, s, col) {
    const gold = '#c99a35', gl = '#f3d98b';
    let head = '';
    if (r === 12) head = '<path d="M36 26L38 14L44 21L50 10L56 21L62 14L64 26Z" fill="' + gold + '" stroke="#6b4a10" stroke-width="1"/><circle cx="50" cy="12" r="2.2" fill="#7b2fa8"/>' +
      '<path d="M71 18L71 54" stroke="' + gold + '" stroke-width="2.4"/><circle cx="71" cy="16" r="3.4" fill="' + gl + '" stroke="#6b4a10" stroke-width=".8"/>';
    else if (r === 11) head = '<path d="M39 25Q50 13 61 25L57 22L50 17L43 22Z" fill="' + gold + '" stroke="#6b4a10" stroke-width="1"/><circle cx="50" cy="17" r="2" fill="#fff"/>' +
      '<path d="M27 46C24 40 26 34 31 33C33 38 31 43 27 46Z" fill="#7b2fa8"/><path d="M29 47L33 56" stroke="#2d6b2a" stroke-width="1.4"/>';
    else head = '<path d="M37 29Q50 3 63 29Q56 23 50 24Q44 23 37 29Z" fill="#4a1466"/><circle cx="50" cy="8" r="2.4" fill="' + gold + '"/>' +
      '<path d="M30 22L30 52" stroke="#8a7a5c" stroke-width="1.6"/><path d="M26 22L30 15L34 22Z" fill="' + gold + '"/>';
    const fig = '<g>' + head + '<path d="' + B.batPath + '" transform="translate(23 26) scale(.45)" fill="' + col + '"/>' +
      '<circle cx="45.5" cy="35.5" r="1.7" fill="' + gl + '"/><circle cx="54.5" cy="35.5" r="1.7" fill="' + gl + '"/>' +
      '<path d="M40 54Q50 62 60 54L58 66H42Z" fill="' + gold + '" opacity=".85"/>' + suitAt(s, 50, 61, 9, false, col) + '</g>';
    return '<rect x="17" y="17" width="66" height="106" rx="3" fill="#efe2f2" stroke="' + gold + '" stroke-width="1.6"/>' +
      '<path d="M17 70H83" stroke="' + gold + '" stroke-width=".9" stroke-dasharray="2 2"/>' +
      '<g transform="translate(0 1)">' + fig + '</g><g transform="rotate(180 50 70) translate(0 1)">' + fig + '</g>' +
      '<text x="50" y="74.5" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="8" fill="#6b4a10">' + (r === 10 ? 'KNAVE' : r === 11 ? 'QUEEN' : 'KING') + '</text>';
  }
  /* the face, without the <svg> wrapper (the squeeze draws it inside its own svg); big corner indices for phones */
  function faceInner(c, paper) {
    const r = c % 13, s = Math.floor(c / 13), col = ink(c), lab = RANKS[r];
    let mid = '';
    if (r === 0) {
      mid = '<path d="' + B.batPath + '" transform="translate(16 54) scale(.57)" fill="#c99a35" opacity=".8"/>' + suitAt(s, 50, 72, s === 0 ? 40 : 34, false, col) +
        '<circle cx="50" cy="71" r="27" fill="none" stroke="#c99a35" stroke-width=".8" stroke-dasharray="1.5 2.5"/>';
    } else if (r >= 10) mid = '<g transform="translate(50 72) scale(.7 .78) translate(-50 -70)">' + court(r, s, col) + '</g>';
    else for (const [x, y] of PIPS[r + 1]) mid += suitAt(s, 50 + (x - 50) * 0.8, 6 + y * 0.93, 15, y > 70, col);
    const ten = lab === '10';
    const corner = '<text x="13" y="27" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="' + (ten ? 19 : 25) + '" fill="' + col + '"' + (ten ? ' letter-spacing="-2.6"' : '') + '>' + lab + '</text>' + suitAt(s, 13, 38.5, 12.5, false, col);
    return '<rect x=".6" y=".6" width="98.8" height="138.8" rx="8" fill="url(#' + (paper || 'baccarat-paper') + ')" stroke="#bfa98a" stroke-width="1.2"/>' +
      mid + corner + '<g transform="rotate(180 50 70)">' + corner + '</g>';
  }
  const faceSvg = (c) => '<svg viewBox="0 0 100 140" aria-hidden="true">' + faceInner(c) + '</svg>';
  const BACK_INNER = '<rect x=".6" y=".6" width="98.8" height="138.8" rx="8" fill="#2a0a3a" stroke="#c99a35" stroke-width="1.4"/>' +
    '<rect x="6" y="6" width="88" height="128" rx="5" fill="url(#baccarat-damask)" stroke="#c99a35" stroke-width="1"/>' +
    '<ellipse cx="50" cy="70" rx="22" ry="26" fill="#2a0a3a" stroke="#c99a35" stroke-width="1.4"/><path d="M50 52A14 14 0 1 0 64 74A11 11 0 1 1 50 52Z" fill="#e2bd62"/>' +
    '<path d="' + B.batPath + '" transform="translate(37 80) scale(.22)" fill="#e2bd62"/>';
  const BACK_SVG = '<svg viewBox="0 0 100 140" aria-hidden="true">' + BACK_INNER + '</svg>';
  const DEFS = '<svg class="vb-defs" width="0" height="0" aria-hidden="true"><defs>' +
    '<linearGradient id="baccarat-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf3"/><stop offset=".6" stop-color="#f7efe4"/><stop offset="1" stop-color="#e8dccd"/></linearGradient>' +
    '<pattern id="baccarat-damask" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#3d1052"/><path d="M7 1L13 7L7 13L1 7Z" fill="none" stroke="#a8792a" stroke-width=".7"/><circle cx="7" cy="7" r="1.4" fill="#c99a35"/><circle cx="0" cy="0" r="1" fill="#5e1a7a"/><circle cx="14" cy="14" r="1" fill="#5e1a7a"/></pattern>' +
    '<linearGradient id="baccarat-cedge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>' +
    '<linearGradient id="baccarat-cshine" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="baccarat-flat-shine" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="baccarat-flap" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4ecff"/><stop offset=".55" stop-color="#d9c8ea"/><stop offset="1" stop-color="#a68fbf"/></linearGradient>' +
    '</defs></svg>';

  /* ============================== chips ============================== */
  function chipSvg(v, size) {
    const st = CHIP_STYLE[v] || CHIP_STYLE[2000], fs = st[3].length > 3 ? 8.6 : 10.5;
    return '<svg viewBox="0 0 40 40" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="' + st[0] + '" stroke="rgba(0,0,0,.45)" stroke-width="1"/>' +
      '<circle cx="20" cy="20" r="16" fill="none" stroke="' + st[1] + '" stroke-width="5" stroke-dasharray="5.2 7.4"/>' +
      '<circle cx="20" cy="20" r="11.5" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width="1.2"/>' +
      '<text x="20" y="' + (20 + fs * 0.36) + '" text-anchor="middle" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + fs + '" fill="' + st[2] + '">' + st[3] + '</text>' +
      '<circle cx="20" cy="20" r="19" fill="url(#baccarat-flat-shine)"/></svg>';
  }
  /* a chip lying on the velvet, seen at the camera's angle */
  function chip3d(v) {
    const st = CHIP_STYLE[v] || CHIP_STYLE[2000], fs = st[3].length > 3 ? 9 : 11;
    const edge = 'M1 12v6c0 7.2 9.4 12.6 21 12.6S43 25.2 43 18v-6Z';
    return '<svg viewBox="0 0 44 32" aria-hidden="true"><path d="' + edge + '" fill="' + st[0] + '"/>' +
      '<path d="M4.6 18.4v6.1M13.6 22.3v6.4M30.4 22.3v6.4M39.4 18.4v6.1" stroke="' + st[1] + '" stroke-width="3.6"/><path d="' + edge + '" fill="url(#baccarat-cedge)"/>' +
      '<ellipse cx="22" cy="12" rx="21" ry="11.5" fill="' + st[0] + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>' +
      '<ellipse cx="22" cy="12" rx="17.4" ry="9.5" fill="none" stroke="' + st[1] + '" stroke-width="3.4" stroke-dasharray="4.6 5.9"/>' +
      '<ellipse cx="22" cy="12" rx="12.4" ry="6.8" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width=".9"/>' +
      '<text x="22" y="15.4" text-anchor="middle" transform="translate(0 4.6) scale(1 .62)" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + fs + '" fill="' + st[2] + '">' + st[3] + '</text>' +
      '<ellipse cx="22" cy="12" rx="21" ry="11.5" fill="url(#baccarat-cshine)"/></svg>';
  }
  const chipsFor = (n) => M.chipsOf(n).filter((v) => CHIP_STYLE[v]).slice(0, 40);
  function stackHtml(n, max, drop) {
    const cs = chipsFor(n).slice(0, max || 9);
    return cs.map((v, k) => '<i style="--k:' + k + '"' + (drop && k === cs.length - 1 ? ' class="drop"' : '') + '>' + chip3d(v) + '</i>').join('');
  }

  /* ============================== table furniture ============================== */
  const SHOE_SVG = '<svg viewBox="0 0 170 120" aria-hidden="true"><defs>' +
    '<linearGradient id="baccarat-shoe-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1450"/><stop offset="1" stop-color="#12051a"/></linearGradient>' +
    '<linearGradient id="baccarat-shoe-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f0a2a"/><stop offset=".55" stop-color="#47195e"/><stop offset="1" stop-color="#170620"/></linearGradient>' +
    '<linearGradient id="baccarat-shoe-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset=".5" stop-color="#c99a35"/><stop offset="1" stop-color="#7a5a18"/></linearGradient></defs>' +
    '<ellipse cx="92" cy="110" rx="76" ry="9" fill="rgba(0,0,0,.5)"/>' +
    '<path d="M44 30L152 20L164 86L56 100Z" fill="url(#baccarat-shoe-t)" stroke="url(#baccarat-shoe-g)" stroke-width="2"/>' +
    '<path d="M58 40L142 32L151 76L66 86Z" fill="#efe6f2"/>' +
    '<path d="M60 47L144 39M62 54L146 46M63 61L147 53M64 68L148 60M65 75L149 67" stroke="#c4b2cc" stroke-width=".9"/>' +
    '<path class="cut" d="M100 36L104 35.6L113 81L109 81.4Z" fill="#e3263f"/>' +
    '<path d="M128 28L150 26L158 70L136 72Z" fill="#1f0a2a" stroke="#c99a35" stroke-width="1.2"/><circle cx="145" cy="49" r="4" fill="url(#baccarat-shoe-g)"/>' +
    '<path d="M18 50L56 40L64 104L28 112Z" fill="url(#baccarat-shoe-f)" stroke="url(#baccarat-shoe-g)" stroke-width="2"/>' +
    '<path d="M26 64L56 57L58 72L29 79Z" fill="#070103"/>' +
    '<path d="M4 72L46 62L50 74L8 84Z" fill="#3d1052" stroke="#c99a35" stroke-width=".9"/><path d="M10 74L44 66" stroke="#c99a35" stroke-width=".6" opacity=".7"/>' +
    '<path d="M38 86A9 9 0 1 0 47 96A7 7 0 1 1 38 86Z" fill="url(#baccarat-shoe-g)"/>' +
    '<path d="M56 100L164 86L166 92L58 106Z" fill="url(#baccarat-shoe-g)"/></svg>';
  /* the croupière's float: columns of high-roller chips lying on edge in a lacquer tray */
  function traySvg() {
    const cols = [250000, 100000, 100000, 50000, 25000, 25000, 10000, 10000, 5000, 2000];
    let slots = '';
    cols.forEach((v, i) => {
      const st = CHIP_STYLE[v], x = 14 + i * 27.2;
      slots += '<rect x="' + x + '" y="11" width="24" height="27" rx="3" fill="' + st[0] + '"/>' +
        '<rect x="' + x + '" y="11" width="24" height="27" rx="3" fill="url(#baccarat-edge)" opacity=".8"/>' +
        '<rect x="' + (x + 9) + '" y="11" width="6" height="27" fill="' + st[1] + '" opacity=".55"/>' +
        '<rect x="' + x + '" y="11" width="24" height="6" rx="2" fill="#fff" opacity=".2"/>';
    });
    return '<svg viewBox="0 0 300 52" aria-hidden="true"><defs>' +
      '<pattern id="baccarat-edge" width="24" height="3.2" patternUnits="userSpaceOnUse"><rect width="24" height="1" fill="rgba(255,255,255,.45)"/><rect x="0" y="1" width="24" height=".5" fill="rgba(0,0,0,.4)"/></pattern>' +
      '<linearGradient id="baccarat-lacq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24102e"/><stop offset="1" stop-color="#08030c"/></linearGradient></defs>' +
      '<path d="M4 6H296L290 48H10Z" fill="url(#baccarat-lacq)" stroke="#c99a35" stroke-width="1.6"/>' + slots +
      '<path d="M8 40H292L290 48H10Z" fill="#12061a"/><path d="M8 40H292" stroke="#f3d98b" stroke-width="1.2" opacity=".7"/></svg>';
  }

  /* ============================== Vesper, the croupière ============================== */
  /* viewBox 0 0 360 200; the table edge is at y 178. The body sits behind the table edge, the arms in front of it. */
  function vesperSvg() {
    const fur = 'url(#baccarat-fur)';
    const ear = '<path d="M154 54Q128 28 134 -4Q158 8 176 40Z" fill="' + fur + '" stroke="#1c0d24" stroke-width="1.4"/><path d="M153 46Q140 26 142 8Q156 18 168 40Z" fill="#c4637e" opacity=".7"/>';
    const wing = '<path d="M134 118C104 96 58 84 16 96C28 106 28 118 22 130C36 126 46 132 48 144C60 136 72 142 76 154C88 146 102 150 106 164L140 166Z" fill="url(#baccarat-wing)" stroke="#12051a" stroke-width="1.5"/>' +
      '<path d="M134 118L22 98M126 126L50 142M118 134L80 152" stroke="#6d3a86" stroke-width="2" stroke-linecap="round" opacity=".85"/>';
    return '<svg class="vb-dsvg" viewBox="0 0 360 200" aria-hidden="true"><defs>' +
      '<radialGradient id="baccarat-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#7d6a92"/><stop offset=".7" stop-color="#4a3a5e"/><stop offset="1" stop-color="#2a1f38"/></radialGradient>' +
      '<linearGradient id="baccarat-wing" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1650"/><stop offset="1" stop-color="#10041a"/></linearGradient>' +
      '<linearGradient id="baccarat-gown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a1866"/><stop offset=".5" stop-color="#26093a"/><stop offset="1" stop-color="#12031e"/></linearGradient>' +
      '<linearGradient id="baccarat-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#e7c6ff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="baccarat-eye" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fffbe6"/><stop offset=".65" stop-color="#ffd6f0"/><stop offset="1" stop-color="#c88ad8"/></radialGradient>' +
      '<linearGradient id="baccarat-goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset=".5" stop-color="#d9ac48"/><stop offset="1" stop-color="#8a6418"/></linearGradient>' +
      '</defs>' +
      '<g class="v-body">' +
      '<g class="v-wing l">' + wing + '</g><g class="v-wing r"><g transform="translate(360 0) scale(-1 1)">' + wing + '</g></g>' +
      /* the gown: off-black velvet with a high collar, a gold choker and a moon cameo */
      '<path d="M114 118Q180 98 246 118Q262 146 264 192L96 192Q98 146 114 118Z" fill="url(#baccarat-gown)"/>' +
      '<path d="M130 120Q180 104 230 120L222 192H138Z" fill="url(#baccarat-sheen)"/>' +
      '<path d="M150 112Q180 100 210 112L200 132Q180 140 160 132Z" fill="#6d5a80"/>' +
      '<path d="M152 112Q180 124 208 112" stroke="url(#baccarat-goldv)" stroke-width="4" fill="none"/>' +
      '<ellipse cx="180" cy="126" rx="7.5" ry="9" fill="url(#baccarat-goldv)" stroke="#5a3d10" stroke-width=".8"/><path d="M180 119A6 6 0 1 0 185 130A4.6 4.6 0 1 1 180 119Z" fill="#2a0a3a"/>' +
      '<path d="M120 124Q140 150 138 192M240 124Q220 150 222 192" stroke="#5e2a7a" stroke-width="1.3" fill="none" opacity=".8"/>' +
      '<rect x="222" y="146" width="30" height="9" rx="2" fill="#c99a35" stroke="#6b4a10" stroke-width=".6"/><text x="237" y="152.7" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="5.6" fill="#2a0a3a">VESPER</text>' +
      '<g class="v-head">' +
      '<g class="v-ear l">' + ear + '</g><g class="v-ear r"><g transform="translate(360 0) scale(-1 1)">' + ear + '</g></g>' +
      '<ellipse cx="180" cy="66" rx="40" ry="36" fill="' + fur + '" stroke="#1c0d24" stroke-width="1.4"/>' +
      /* swept fringe and a crescent hair pin */
      '<path d="M146 50Q156 22 196 26Q222 32 216 56Q204 38 186 40Q170 44 160 56Q154 50 146 50Z" fill="#241430"/>' +
      '<path d="M206 30A10 10 0 1 0 218 44A7.6 7.6 0 1 1 206 30Z" fill="url(#baccarat-goldv)" stroke="#5a3d10" stroke-width=".6"/><circle cx="214" cy="30" r="1.8" fill="#fff"/>' +
      '<ellipse cx="180" cy="80" rx="25" ry="17" fill="#8c7aa2" opacity=".85"/>' +
      '<ellipse cx="154" cy="80" rx="6.5" ry="4" fill="#ff7aa8" opacity=".32"/><ellipse cx="206" cy="80" rx="6.5" ry="4" fill="#ff7aa8" opacity=".32"/>' +
      '<g class="v-eyes"><ellipse cx="165" cy="62" rx="10" ry="11" fill="url(#baccarat-eye)" stroke="#1c0d24" stroke-width="1.2"/><ellipse cx="195" cy="62" rx="10" ry="11" fill="url(#baccarat-eye)" stroke="#1c0d24" stroke-width="1.2"/>' +
      '<g class="v-pupils"><ellipse cx="166" cy="64" rx="4.6" ry="5.6" fill="#2a0a3a"/><ellipse cx="196" cy="64" rx="4.6" ry="5.6" fill="#2a0a3a"/><circle cx="164.2" cy="61.4" r="1.7" fill="#fff"/><circle cx="194.2" cy="61.4" r="1.7" fill="#fff"/></g>' +
      '<path d="M154 56Q160 50 170 52M152 58L148 54M154 55L151 51M206 56Q200 50 190 52M208 58L212 54M206 55L209 51" stroke="#12061a" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>' +
      '<g class="v-lidl"><path d="M154 62A11 11.5 0 0 1 176 62Q165 66 154 62Z" fill="#5a4870"/></g>' +
      '<g class="v-lidr"><path d="M184 62A11 11.5 0 0 1 206 62Q195 66 184 62Z" fill="#5a4870"/></g>' +
      '<g class="v-lidsfull"><ellipse cx="165" cy="62" rx="11" ry="12" fill="#5a4870"/><ellipse cx="195" cy="62" rx="11" ry="12" fill="#5a4870"/><path d="M155 65Q165 69 175 65M185 65Q195 69 205 65" stroke="#12061a" stroke-width="1.5" fill="none"/></g>' +
      '<g class="v-wink"><ellipse cx="195" cy="62" rx="11" ry="12" fill="#5a4870"/><path d="M185 64Q195 69 205 64" stroke="#12061a" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>' +
      '<path class="v-brow l" d="M153 46Q163 42 174 46" stroke="#160818" stroke-width="2.6" stroke-linecap="round" fill="none"/><path class="v-brow r" d="M186 46Q197 42 207 46" stroke="#160818" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="180" cy="76" rx="6" ry="4.2" fill="#3a2048"/><circle cx="177.8" cy="76.6" r="1.1" fill="#12061a"/><circle cx="182.2" cy="76.6" r="1.1" fill="#12061a"/>' +
      '<g class="v-mouth">' +
      '<g class="mo-smile"><path d="M168 86Q180 94 192 86" stroke="#7a1238" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M172 88.4l2.2 5.2 2.2-4.4ZM183.6 89l2.2 4.6 2.2-5.2Z" fill="#fff"/></g>' +
      '<g class="mo-grin"><path d="M164 84Q180 104 196 84Q180 92 164 84Z" fill="#5a0a28" stroke="#7a1238" stroke-width="1.6"/><path d="M170 87l2.8 6.4 2.8-5.6ZM184.4 87.8l2.8 5.6 2.8-6.4Z" fill="#fff"/></g>' +
      '<g class="mo-o"><ellipse cx="180" cy="91" rx="5.6" ry="7" fill="#5a0a28" stroke="#7a1238" stroke-width="1.6"/></g>' +
      '<g class="mo-flat"><path d="M170 90Q180 87 190 90" stroke="#7a1238" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>' +
      '</g></g></g></svg>';
  }
  function armsSvg() {
    const arm = '<path d="M114 116Q94 144 104 172L132 186Q122 152 142 124Z" fill="url(#baccarat-glove)" stroke="#05020a" stroke-width="1"/>' +
      '<path d="M101 166L133 177L131 184L99 173Z" fill="url(#baccarat-goldv2)"/>' +
      '<path d="M100 176Q112 170 132 182Q140 196 126 200Q104 200 98 190Q96 180 100 176Z" fill="#1a0d22" stroke="#3d2a4e" stroke-width="1.2"/>' +
      '<path d="M108 191Q116 195 126 193M106 185Q116 189 128 188" stroke="#4a3560" stroke-width="1" fill="none"/>';
    return '<svg class="vb-asvg" viewBox="0 0 360 200" aria-hidden="true"><defs><linearGradient id="baccarat-glove" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2a4a"/><stop offset=".4" stop-color="#140a1c"/><stop offset="1" stop-color="#06020a"/></linearGradient>' +
      '<linearGradient id="baccarat-goldv2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset="1" stop-color="#9a7020"/></linearGradient></defs>' +
      '<g class="v-arm l">' + arm + '</g><g class="v-arm r"><g transform="translate(360 0) scale(-1 1)">' + arm + '</g></g></svg>';
  }

  /* ============================== the salon behind the table ============================== */
  function roomSvg() {
    const panel = (x, w) => '<rect x="' + x + '" y="90" width="' + w + '" height="430" rx="6" fill="url(#bcr-panel)" stroke="#8a6418" stroke-width="2"/>' +
      '<rect x="' + (x + 14) + '" y="104" width="' + (w - 28) + '" height="402" rx="4" fill="none" stroke="#c99a35" stroke-width="1" opacity=".55"/>' +
      '<path d="M' + (x + w / 2) + ' 130L' + (x + w / 2 + 22) + ' 160L' + (x + w / 2) + ' 190L' + (x + w / 2 - 22) + ' 160Z" fill="none" stroke="#c99a35" stroke-width="1.2" opacity=".6"/>';
    const win = (x0, x1, yt, yb) => {
      const xm = (x0 + x1) / 2, w = x1 - x0;
      let stars = ''; for (let i = 0; i < 16; i++) { const sx = x0 + 10 + ((i * 67) % (w - 20)), sy = yt + 30 + ((i * 41) % (yb - yt - 80)); stars += '<circle cx="' + sx + '" cy="' + sy + '" r="' + (1 + (i % 3) * 0.5) + '" fill="#fff" opacity="' + (0.4 + (i % 4) * 0.15) + '" class="tw" style="animation-delay:-' + (i * 0.7) + 's"/>'; }
      const arch = 'M' + x0 + ' ' + yb + 'V' + (yt + w * 0.5) + 'A' + w / 2 + ' ' + w / 2 + ' 0 0 1 ' + x1 + ' ' + (yt + w * 0.5) + 'V' + yb + 'Z';
      return '<path d="M' + (x0 - 16) + ' ' + (yb + 14) + 'V' + (yt + w * 0.5) + 'A' + (w / 2 + 16) + ' ' + (w / 2 + 16) + ' 0 0 1 ' + (x1 + 16) + ' ' + (yt + w * 0.5) + 'V' + (yb + 14) + 'Z" fill="#160520" stroke="#8a6418" stroke-width="3"/>' +
        '<path d="' + arch + '" fill="url(#bcr-sky)"/><g clip-path="url(#bcr-wclip)">' + stars +
        '<g class="moon"><circle cx="' + (xm + 30) + '" cy="' + (yt + 140) + '" r="130" fill="url(#bcr-mglow)"/><circle cx="' + (xm + 30) + '" cy="' + (yt + 140) + '" r="56" fill="url(#bcr-moon)"/><circle cx="' + (xm + 12) + '" cy="' + (yt + 126) + '" r="9" fill="#e9d79a" opacity=".5"/><circle cx="' + (xm + 50) + '" cy="' + (yt + 154) + '" r="6" fill="#e9d79a" opacity=".45"/></g>' +
        '<g class="cloud"><ellipse cx="' + (x0 + 40) + '" cy="' + (yt + 200) + '" rx="90" ry="13" fill="#2a1d48" opacity=".8"/><ellipse cx="' + (x0 + 90) + '" cy="' + (yt + 188) + '" rx="46" ry="10" fill="#2a1d48" opacity=".8"/></g>' +
        '<g class="wbats"><path d="' + B.batPath + '" transform="translate(' + (x0 + 30) + ' ' + (yt + 100) + ') scale(.18)" fill="#07020a"/><path d="' + B.batPath + '" transform="translate(' + (x0 + 66) + ' ' + (yt + 122) + ') scale(.12)" fill="#07020a"/></g>' +
        '<path d="M' + xm + ' ' + yt + 'V' + yb + 'M' + x0 + ' ' + (yt + (yb - yt) * 0.6) + 'H' + x1 + '" stroke="#12040e" stroke-width="7"/></g>' +
        '<path d="' + arch + '" fill="none" stroke="url(#bcr-glass)" stroke-width="6"/>';
    };
    const drape = (flip) => {
      let folds = ''; for (let i = 0; i < 6; i++) folds += '<path d="M' + (i * 38) + ' 0C' + (i * 38 + 30) + ' 200 ' + (i * 38 - 10) + ' 420 ' + (i * 38 + 22) + ' 640" stroke="rgba(0,0,0,.45)" stroke-width="14" fill="none"/><path d="M' + (i * 38 + 14) + ' 0C' + (i * 38 + 40) + ' 200 ' + (i * 38 + 4) + ' 420 ' + (i * 38 + 34) + ' 640" stroke="rgba(220,150,255,.10)" stroke-width="6" fill="none"/>';
      return '<g' + (flip ? ' transform="translate(1600 0) scale(-1 1)"' : '') + '><path d="M0 0H250Q236 160 180 300Q150 360 196 440Q230 540 210 640H0Z" fill="url(#bcr-velvet)"/><g clip-path="url(#bcr-dclip)">' + folds + '</g>' +
        '<path d="M150 318Q190 326 214 304" stroke="#e2bd62" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="216" cy="306" r="9" fill="#c99a35"/><path d="M210 312L204 352M216 314L216 356M222 312L228 350" stroke="#c99a35" stroke-width="3"/>' +
        '<path d="M0 0H330V22Q300 50 250 34Q200 56 150 34Q100 54 50 34Q20 44 0 30Z" fill="url(#bcr-velvet)"/><path d="M0 30Q20 44 50 34Q100 54 150 34Q200 56 250 34Q300 50 330 22" stroke="#c99a35" stroke-width="3" fill="none"/></g>';
    };
    /* the chandelier: tiers of crystal drops round a gold hoop */
    let drops = ''; for (let i = 0; i < 15; i++) { const a = (i / 15) * Math.PI, x = 800 + Math.cos(a) * 150, y = 52 + Math.sin(a) * 22; drops += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'l-3 10 3 7 3-7Z" fill="#fff4dc" opacity=".85" class="cr" style="animation-delay:-' + (i * 0.37).toFixed(2) + 's"/>'; }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI, x = 800 + Math.cos(a) * 92, y = 86 + Math.sin(a) * 14; drops += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'l-2.6 9 2.6 6 2.6-6Z" fill="#fff4dc" opacity=".8" class="cr" style="animation-delay:-' + (i * 0.51).toFixed(2) + 's"/>'; }
    const stanchion = (x) => '<g><rect x="' + (x - 4) + '" y="470" width="8" height="120" fill="url(#bcr-goldbar)"/><ellipse cx="' + x + '" cy="592" rx="22" ry="6" fill="#8a6418"/><circle cx="' + x + '" cy="466" r="9" fill="#e2bd62"/></g>';
    return '<svg class="vb-roomsvg" viewBox="0 0 1600 640" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><defs>' +
      '<linearGradient id="bcr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e0a2c"/><stop offset=".6" stop-color="#12051c"/><stop offset="1" stop-color="#06020a"/></linearGradient>' +
      '<linearGradient id="bcr-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c0f3e"/><stop offset="1" stop-color="#170624"/></linearGradient>' +
      '<linearGradient id="bcr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0b2a"/><stop offset=".7" stop-color="#261848"/><stop offset="1" stop-color="#43204e"/></linearGradient>' +
      '<radialGradient id="bcr-moon" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#fffbe8"/><stop offset=".8" stop-color="#f3dc98"/><stop offset="1" stop-color="#d9b45f"/></radialGradient>' +
      '<radialGradient id="bcr-mglow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".45"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="bcr-candle"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".5"/><stop offset=".4" stop-color="#ffb070" stop-opacity=".14"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="bcr-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b2fa8"/><stop offset=".5" stop-color="#e2bd62"/><stop offset="1" stop-color="#2f4fa8"/></linearGradient>' +
      '<linearGradient id="bcr-velvet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1e0530"/><stop offset=".5" stop-color="#4f1270"/><stop offset="1" stop-color="#2a0640"/></linearGradient>' +
      '<linearGradient id="bcr-goldbar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5a18"/><stop offset=".5" stop-color="#f3d98b"/><stop offset="1" stop-color="#7a5a18"/></linearGradient>' +
      '<clipPath id="bcr-dclip"><path d="M0 0H250Q236 160 180 300Q150 360 196 440Q230 540 210 640H0Z"/></clipPath>' +
      '<clipPath id="bcr-wclip"><path d="M660 470V210A140 140 0 0 1 940 210V470Z"/></clipPath>' +
      '</defs><rect width="1600" height="640" fill="url(#bcr-wall)"/>' +
      panel(300, 170) + panel(1130, 170) +
      win(660, 940, 70, 470) +
      '<g class="chand"><circle cx="800" cy="40" r="300" fill="url(#bcr-candle)" class="gl"/><path d="M800 0V40" stroke="#c99a35" stroke-width="3"/>' +
      '<ellipse cx="800" cy="52" rx="150" ry="22" fill="none" stroke="#e2bd62" stroke-width="3"/><ellipse cx="800" cy="86" rx="92" ry="14" fill="none" stroke="#e2bd62" stroke-width="2.4"/>' + drops + '</g>' +
      drape(false) + drape(true) +
      '<path d="M380 520Q520 470 660 520Q800 470 940 520Q1080 470 1220 520" stroke="#8c1538" stroke-width="9" fill="none" stroke-linecap="round" opacity=".9"/>' +
      stanchion(380) + stanchion(660) + stanchion(940) + stanchion(1220) + '</svg>';
  }

  /* ============================== table layouts (logical px; the stage is scaled to fit) ============================== */
  /* spots: centre x/y, w/h, tilt; boxes: the card positions; sq: the squeeze close-up; cw: card width */
  const LAY = {
    wide: { name: 'wide', W: 1200, H: 600, edge: 150, fx: 600, rx: 700, ry: 560, cw: 82, d: { x: 600, s: 0.84 }, tray: 250,
      shoe: { x: 1082, y: 206, w: 128 }, disc: { x: 122, y: 210, w: 62 }, P: { x: 405, y: 262 }, Bk: { x: 795, y: 262 }, sq: { x: 600, y: 306, w: 168 },
      timer: { x: 600, y: 288 }, call: { x: 600, y: 336 }, bub: { x: 668, y: 40 },
      spots: { PP: { x: 352, y: 404, w: 160, h: 62, r: -4 }, T: { x: 600, y: 414, w: 230, h: 62, r: 0 }, BP: { x: 848, y: 404, w: 160, h: 62, r: 4 },
        PD: { x: 214, y: 488, w: 150, h: 74, r: -9 }, P: { x: 440, y: 512, w: 250, h: 92, r: -2 }, B: { x: 760, y: 512, w: 250, h: 92, r: 2 }, BD: { x: 986, y: 488, w: 150, h: 74, r: 9 } },
      print: { y: 354, sag: 10, t: 'BANKER PAYS 19 TO 20 · TIE PAYS 8 TO 1 · PAIRS 11 TO 1', a: 330, size: 13 } },
    compact: { name: 'compact', W: 1000, H: 520, edge: 130, fx: 500, rx: 620, ry: 500, cw: 74, d: { x: 500, s: 0.74 }, tray: 210,
      shoe: { x: 922, y: 184, w: 108 }, disc: { x: 80, y: 186, w: 52 }, P: { x: 330, y: 232 }, Bk: { x: 670, y: 232 }, sq: { x: 500, y: 266, w: 148 },
      timer: { x: 500, y: 252 }, call: { x: 500, y: 292 }, bub: { x: 560, y: 30 },
      spots: { PP: { x: 296, y: 352, w: 140, h: 54, r: -4 }, T: { x: 500, y: 360, w: 200, h: 54, r: 0 }, BP: { x: 704, y: 352, w: 140, h: 54, r: 4 },
        PD: { x: 178, y: 428, w: 130, h: 64, r: -9 }, P: { x: 370, y: 446, w: 216, h: 80, r: -2 }, B: { x: 630, y: 446, w: 216, h: 80, r: 2 }, BD: { x: 822, y: 428, w: 130, h: 64, r: 9 } },
      print: { y: 318, sag: 5, t: 'BANKER PAYS 19 TO 20 · TIE PAYS 8 TO 1', a: 260, size: 12 } },
    tall: { name: 'tall', W: 420, H: 560, edge: 104, fx: 210, rx: 320, ry: 540, cw: 56, d: { x: 210, s: 0.56 }, tray: 140,
      shoe: { x: 384, y: 120, w: 66 }, disc: { x: 34, y: 126, w: 36 }, P: { x: 112, y: 204 }, Bk: { x: 308, y: 204 }, sq: { x: 210, y: 236, w: 116 },
      timer: { x: 210, y: 226 }, call: { x: 210, y: 262 }, bub: { x: 244, y: 16 },
      spots: { PP: { x: 78, y: 330, w: 116, h: 50, r: -3 }, T: { x: 210, y: 336, w: 128, h: 50, r: 0 }, BP: { x: 342, y: 330, w: 116, h: 50, r: 3 },
        P: { x: 110, y: 412, w: 188, h: 74, r: -1 }, B: { x: 310, y: 412, w: 188, h: 74, r: 1 },
        PD: { x: 110, y: 494, w: 170, h: 52, r: -1 }, BD: { x: 310, y: 494, w: 170, h: 52, r: 1 } },
      print: { y: 299, sag: 2, t: "BANKER PAYS 19 TO 20", a: 120, size: 10 } },
  };
  function feltSvg(c) {
    const { W, H, edge, fx, rx, ry } = c, p = c.print;
    const half = (a, b) => 'M' + (fx - a) + ' ' + edge + 'A' + a + ' ' + b + ' 0 0 0 ' + (fx + a) + ' ' + edge;
    const arc = (dy, a) => 'M' + (fx - a) + ' ' + (p.y + dy) + 'Q' + fx + ' ' + (p.y + dy + p.sag * 2) + ' ' + (fx + a) + ' ' + (p.y + dy);
    const ly = edge + ry * 0.3;
    return '<svg class="vb-feltsvg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><defs>' +
      '<radialGradient id="baccarat-felt" gradientUnits="userSpaceOnUse" cx="' + fx + '" cy="' + ly + '" r="' + rx + '"><stop offset="0" stop-color="#5b1f7e"/><stop offset=".45" stop-color="#3a0f55"/><stop offset=".85" stop-color="#1f0632"/><stop offset="1" stop-color="#12031e"/></radialGradient>' +
      '<radialGradient id="baccarat-pool" gradientUnits="userSpaceOnUse" cx="' + fx + '" cy="' + (edge + ry * 0.25) + '" r="' + ry * 0.7 + '"><stop offset="0" stop-color="#ffd9f0" stop-opacity=".2"/><stop offset="1" stop-color="#ffd9f0" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="baccarat-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1a46"/><stop offset=".5" stop-color="#1c0824"/><stop offset="1" stop-color="#0c0310"/></linearGradient>' +
      '<filter id="baccarat-noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .3 0"/></filter>' +
      '<clipPath id="baccarat-feltclip"><path d="' + half(rx, ry) + 'Z"/></clipPath><path id="baccarat-pl" d="' + arc(0, p.a) + '" fill="none"/></defs>' +
      '<path d="' + half(rx + 40, ry + 40) + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="40" transform="translate(0 14)"/>' +
      '<path d="' + half(rx, ry) + 'Z" fill="url(#baccarat-felt)"/>' +
      '<g clip-path="url(#baccarat-feltclip)"><rect x="' + (fx - rx) + '" y="' + edge + '" width="' + rx * 2 + '" height="' + ry + '" filter="url(#baccarat-noise)" opacity=".55"/>' +
      '<ellipse cx="' + fx + '" cy="' + (edge + ry * 0.25) + '" rx="' + rx * 0.8 + '" ry="' + ry * 0.7 + '" fill="url(#baccarat-pool)"/>' +
      '<path d="M' + (fx - 40 * c.cw / 82) + ' ' + (c.P.y - 50 * c.cw / 82) + 'A' + (40 * c.cw / 82) + ' ' + (40 * c.cw / 82) + ' 0 1 0 ' + (fx + 20 * c.cw / 82) + ' ' + (c.P.y + 20 * c.cw / 82) + 'A' + (30 * c.cw / 82) + ' ' + (30 * c.cw / 82) + ' 0 1 1 ' + (fx - 40 * c.cw / 82) + ' ' + (c.P.y - 50 * c.cw / 82) + 'Z" fill="#e2bd62" opacity=".06"/>' +
      '<text font-family="Cinzel,Georgia,serif" font-weight="800" font-size="' + p.size + '" letter-spacing="2" fill="#e2bd62" opacity=".8"><textPath href="#baccarat-pl" startOffset="50%" text-anchor="middle">' + p.t + '</textPath></text></g>' +
      '<path d="' + half(rx - 10, ry - 10) + '" fill="none" stroke="#c99a35" stroke-width="2.2" opacity=".8"/><path d="' + half(rx - 17, ry - 17) + '" fill="none" stroke="#c99a35" stroke-width=".8" stroke-dasharray="3 5" opacity=".55"/>' +
      '<path d="' + half(rx + 19, ry + 19) + '" fill="none" stroke="url(#baccarat-rail)" stroke-width="38"/>' +
      '<path d="' + half(rx + 8, ry + 8) + '" fill="none" stroke="rgba(230,190,255,.18)" stroke-width="5"/>' +
      '<path d="' + half(rx + 1, ry + 1) + '" fill="none" stroke="#c99a35" stroke-width="2"/></svg>';
  }

  /* ============================== the roads ============================== */
  /* results: [{r: 'P' | 'B' | 'T', pp, bp, nat, pt, bt}] in dealing order */
  function bigCols(res) {
    const cols = []; let lead = 0;
    for (const e of res) {
      if (e.r === 'T') { if (cols.length) { const c = cols[cols.length - 1]; c[c.length - 1].ties++; } else lead++; continue; }
      const it = { r: e.r, ties: 0, pp: e.pp, bp: e.bp, nat: e.nat };
      const last = cols[cols.length - 1];
      if (last && last[0].r === e.r) last.push(it); else cols.push([it]);
    }
    if (lead && cols.length) cols[0][0].lead = lead;
    return { cols, lead };
  }
  /* lay logical columns on a 6-row grid: down the column, then right along the row when blocked (the dragon tail) */
  function placeCols(cols, rows) {
    const occ = new Set(), cells = [], key = (x, y) => x * 8 + y;
    cols.forEach((col, ci) => {
      let x = ci, y = 0, turned = false;
      while (occ.has(key(x, 0))) x++;
      col.forEach((it, k) => {
        if (k > 0) { if (!turned && y + 1 < rows && !occ.has(key(x, y + 1))) y++; else { turned = true; x++; } }
        occ.add(key(x, y)); cells.push({ x, y, it });
      });
    });
    return cells;
  }
  /* Big Eye Boy (k = 1), Small Road (k = 2), Cockroach Pig (k = 3): red ('R') when the Big Road repeats its pattern, blue ('U') when it breaks it */
  function derivedSeq(cols, k) {
    const out = [];
    cols.forEach((col, c) => {
      for (let r = 0; r < col.length; r++) {
        if (r === 0) { if (c < k + 1) continue; out.push(cols[c - 1].length === cols[c - 1 - k].length ? 'R' : 'U'); }
        else { if (c < k) continue; const L = cols[c - k].length; out.push(L > r ? 'R' : L === r ? 'U' : 'R'); }
      }
    });
    return out;
  }
  function seqCols(seq) { const cols = []; for (const s of seq) { const last = cols[cols.length - 1]; if (last && last[0].r === s) last.push({ r: s }); else cols.push([{ r: s }]); } return cols; }
  function roadsOf(res) {
    const bc = bigCols(res);
    return { res, big: bc, der: [1, 2, 3].map((k) => derivedSeq(bc.cols, k)) };
  }
  /* what each derived road would add if the next hand went to side s */
  function askRoad(res, s) {
    const a = roadsOf(res), b = roadsOf(res.concat([{ r: s }]));
    return b.der.map((d, i) => (d.length > a.der[i].length ? d[d.length - 1] : null));
  }
  const RC = { P: '#2f6fe0', B: '#e0334d', T: '#1c9a5a', R: '#e0334d', U: '#2f6fe0' };
  /* draw one road into an svg sized to its box; always shows the newest columns. kind: bead | big | eye | small | roach */
  function roadSvg(kind, R, wpx, hpx, ask) {
    const rows = 6, cs = hpx / rows, ncol = Math.max(1, Math.floor(wpx / cs));
    let grid = '';
    for (let i = 0; i <= ncol; i++) grid += '<path d="M' + (i * cs).toFixed(1) + ' 0V' + hpx.toFixed(1) + '"/>';
    for (let j = 0; j <= rows; j++) grid += '<path d="M0 ' + (j * cs).toFixed(1) + 'H' + (ncol * cs).toFixed(1) + '"/>';
    let marks = '';
    const rr = cs * 0.4;
    const at = (x, y) => [(x + 0.5) * cs, (y + 0.5) * cs];
    if (kind === 'bead') {
      const all = R.res.slice(); if (ask) all.push({ r: ask, ask: true });
      const used = Math.ceil(all.length / rows), off = Math.max(0, used - ncol);
      all.forEach((e, i) => {
        const x = Math.floor(i / rows) - off, y = i % rows; if (x < 0) return;
        const [cx, cy] = at(x, y);
        marks += '<g' + (e.ask ? ' class="ask"' : '') + '><circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (cs * 0.43).toFixed(1) + '" fill="' + RC[e.r] + '"/>' +
          '<text x="' + cx.toFixed(1) + '" y="' + (cy + cs * 0.15).toFixed(1) + '" text-anchor="middle" font-size="' + (cs * 0.46).toFixed(1) + '" font-weight="800" fill="#fff">' + (e.r === 'P' ? 'P' : e.r === 'B' ? 'B' : 'T') + '</text>' +
          (e.bp ? '<circle cx="' + (cx - cs * 0.3).toFixed(1) + '" cy="' + (cy - cs * 0.3).toFixed(1) + '" r="' + (cs * 0.12).toFixed(1) + '" fill="#e0334d" stroke="#fff" stroke-width=".8"/>' : '') +
          (e.pp ? '<circle cx="' + (cx + cs * 0.3).toFixed(1) + '" cy="' + (cy + cs * 0.3).toFixed(1) + '" r="' + (cs * 0.12).toFixed(1) + '" fill="#2f6fe0" stroke="#fff" stroke-width=".8"/>' : '') + '</g>';
      });
    } else {
      let cols, askLast = false;
      if (kind === 'big') { const res = ask ? R.res.concat([{ r: ask }]) : R.res; cols = bigCols(res).cols; askLast = !!ask; }
      else { const k = { eye: 0, small: 1, roach: 2 }[kind]; const seq = R.der[k].slice(); if (ask && ask[k]) { seq.push(ask[k]); askLast = true; } cols = seqCols(seq); }
      const cells = placeCols(cols, rows);
      const maxX = cells.reduce((m, c) => Math.max(m, c.x), -1), off = Math.max(0, maxX + 1 - ncol);
      cells.forEach((c, i) => {
        const x = c.x - off; if (x < 0) return;
        const [cx, cy] = at(x, c.y), col = RC[c.it.r], cls = askLast && i === cells.length - 1 ? ' class="ask"' : '';
        if (kind === 'big') {
          marks += '<g' + cls + '><circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (cs * 0.36).toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="' + (cs * 0.13).toFixed(1) + '"/>';
          if (c.it.ties || c.it.lead) marks += '<path d="M' + (cx - rr).toFixed(1) + ' ' + (cy + rr).toFixed(1) + 'L' + (cx + rr).toFixed(1) + ' ' + (cy - rr).toFixed(1) + '" stroke="' + RC.T + '" stroke-width="' + (cs * 0.12).toFixed(1) + '" stroke-linecap="round"/>' +
            ((c.it.ties + (c.it.lead || 0)) > 1 ? '<text x="' + cx.toFixed(1) + '" y="' + (cy + cs * 0.14).toFixed(1) + '" text-anchor="middle" font-size="' + (cs * 0.4).toFixed(1) + '" font-weight="800" fill="#0d5c34">' + (c.it.ties + (c.it.lead || 0)) + '</text>' : '');
          if (c.it.bp) marks += '<circle cx="' + (cx - cs * 0.32).toFixed(1) + '" cy="' + (cy - cs * 0.32).toFixed(1) + '" r="' + (cs * 0.11).toFixed(1) + '" fill="#e0334d"/>';
          if (c.it.pp) marks += '<circle cx="' + (cx + cs * 0.32).toFixed(1) + '" cy="' + (cy + cs * 0.32).toFixed(1) + '" r="' + (cs * 0.11).toFixed(1) + '" fill="#2f6fe0"/>';
          marks += '</g>';
        } else if (kind === 'eye') marks += '<circle' + cls + ' cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (cs * 0.34).toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="' + (cs * 0.16).toFixed(1) + '"/>';
        else if (kind === 'small') marks += '<circle' + cls + ' cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (cs * 0.4).toFixed(1) + '" fill="' + col + '"/>';
        else marks += '<path' + cls + ' d="M' + (cx - cs * 0.36).toFixed(1) + ' ' + (cy + cs * 0.36).toFixed(1) + 'L' + (cx + cs * 0.36).toFixed(1) + ' ' + (cy - cs * 0.36).toFixed(1) + '" stroke="' + col + '" stroke-width="' + (cs * 0.17).toFixed(1) + '" stroke-linecap="round"/>';
      });
    }
    return '<svg viewBox="0 0 ' + (ncol * cs).toFixed(1) + ' ' + hpx.toFixed(1) + '" width="' + (ncol * cs).toFixed(1) + '" height="' + hpx.toFixed(1) + '" aria-hidden="true"><g class="gr">' + grid + '</g>' + marks + '</svg>';
  }

  /* ============================== poster ============================== */
  function poster() {
    const card = (c, x, y, rot) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') translate(-50 -70)">' + faceInner(c, 'baccarat-p-paper') + '</g>';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Velvet Baccarat"><defs>' +
      '<radialGradient id="baccarat-p-felt" cx=".5" cy=".72" r=".85"><stop offset="0" stop-color="#5b1f7e"/><stop offset=".55" stop-color="#2a0a40"/><stop offset="1" stop-color="#0a0212"/></radialGradient>' +
      '<radialGradient id="baccarat-p-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4cf"/><stop offset=".6" stop-color="#f3d98b"/><stop offset="1" stop-color="#f3d98b" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="baccarat-p-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset=".45" stop-color="#e2bd62"/><stop offset=".55" stop-color="#a8792a"/><stop offset="1" stop-color="#f3d98b"/></linearGradient>' +
      '<linearGradient id="baccarat-p-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf3"/><stop offset="1" stop-color="#e8dccd"/></linearGradient>' +
      '<radialGradient id="baccarat-flat-shine" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<path id="baccarat-p-arc" d="M24 304 Q160 200 296 304"/></defs><rect width="320" height="400" fill="url(#baccarat-p-felt)"/>' +
      '<g opacity=".35">' + [0, 1, 2, 3, 4, 5, 6].map((i) => '<path d="M' + (i * 52 - 20) + ' 0C' + (i * 52 + 10) + ' 120 ' + (i * 52 - 30) + ' 260 ' + (i * 52) + ' 400" stroke="#14031f" stroke-width="16" fill="none"/>').join('') + '</g>' +
      '<circle cx="252" cy="66" r="46" fill="url(#baccarat-p-moon)" opacity=".85"/>' +
      '<path d="' + B.batPath + '" transform="translate(206 50) scale(.6)" fill="#12031c"/><path d="' + B.batPath + '" transform="translate(36 40) scale(.26) rotate(-12)" fill="#12031c" opacity=".8"/>' +
      '<path d="M0 262 Q160 152 320 262 L320 400 L0 400Z" fill="#1e0530" opacity=".55"/>' +
      '<path d="M8 304 Q160 184 312 304" fill="none" stroke="#c99a35" stroke-width="1.5" opacity=".8"/><path d="M30 334 Q160 234 290 334" fill="none" stroke="#c99a35" stroke-width="1" opacity=".55"/>' +
      '<text font-family="Cinzel,Georgia,serif" font-weight="800" font-size="10" letter-spacing="2.4" fill="#e2bd62"><textPath href="#baccarat-p-arc" startOffset="50%" text-anchor="middle">PLAYER · BANKER · TIE · DRAGON BONUS</textPath></text>' +
      card(8, 128, 206, -13) + card(25, 192, 200, 11) +
      '<rect x="98" y="150" width="124" height="22" rx="11" fill="#12031c" stroke="#c99a35" stroke-width="1.2"/><text x="160" y="165.5" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="11" letter-spacing="3" fill="#f3d98b">HIGH ROLLER</text>' +
      '<text x="160" y="84" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="900" font-size="30" fill="#f3d98b" letter-spacing="6">VELVET</text>' +
      '<text x="160" y="132" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="900" font-size="46" fill="url(#baccarat-p-gold)" stroke="#1e0530" stroke-width="6" paint-order="stroke">Baccarat</text>' +
      '<g transform="translate(160 356)">' + [[-58, 25000], [-20, 100000], [20, 250000], [58, 10000]].map(([x, v], i) => '<g transform="translate(' + (x - 17) + ' ' + (-17 - (i % 2) * 6) + ')">' + chipSvg(v, 34) + '</g>').join('') + '</g>' +
      '<rect x="6" y="6" width="308" height="388" rx="10" fill="none" stroke="#c99a35" stroke-width="1.2" opacity=".6"/></svg>';
  }

  /* ============================== rules ============================== */
  const pct = (x) => x.toFixed(2) + '%';
  function rules() {
    const R = M.RTP;
    const live = '<h3>The live table</h3><p>Velvet Baccarat is one shared table in the High Roller Lounge, open around the clock to players of <b>level ' + M.MIN_LEVEL + ' and up</b>. Every player bets on the same hand, dealt by Vesper from the same eight-deck shoe. Betting is open for ' + M.T.BET + ' seconds; then the cards come out. The cards are drawn on the server when the hand is created and are only sent to anyone once betting has closed.</p>' +
      '<p>The Player cards are squeezed first, then the Banker cards, then any third cards, one at a time. The biggest bettor on each side is named as its squeezer. <b>Skip</b> (or a tap on the table) shows every card at once; <b>Turbo</b> turns the squeeze into a straight flip. Neither changes the hand: the cards were fixed when betting closed. A new shoe is shuffled, cut and burned when the cut card comes out. Bets you leave on the table are settled and paid even if you walk away.</p>';
    const prac = '<h3>Practice table</h3><p>An eight-deck shoe of your own, with the cut card and burn of the real table. Place chips and press <b>Deal</b>. Online, Velvet Baccarat is one live table shared by every high roller.</p>';
    return (B.online ? live : prac) +
      '<h3>How a hand is played</h3><p>Two cards each go to the <b>Player</b> and the <b>Banker</b>. Aces count 1, two to nine count their pips, tens and court cards count 0, and only the last digit of a total counts (7 and 8 make 5). The hand closer to 9 wins. You bet on the result; you never play the hand yourself.</p>' +
      '<ul><li>A two-card 8 or 9 is a <b>natural</b>: nobody draws.</li><li>Otherwise the Player draws a third card on 0 to 5 and stands on 6 or 7.</li>' +
      '<li>If the Player stood, the Banker draws on 0 to 5. If the Player drew, the Banker follows the table: on 0 to 2 always draws; on 3 draws unless the Player\'s third card was an 8; on 4 draws against 2 to 7; on 5 against 4 to 7; on 6 against 6 or 7; on 7 stands.</li></ul>' +
      '<h3>Bets</h3><table><tr><th>Bet</th><th>Pays</th><th>Limit</th></tr>' +
      '<tr><td>Player</td><td>1 to 1 (a tie returns the stake)</td><td>' + fmt(M.LIMIT.P) + '</td></tr>' +
      '<tr><td>Banker</td><td>19 to 20 (5% commission; a tie returns the stake)</td><td>' + fmt(M.LIMIT.B) + '</td></tr>' +
      '<tr><td>Tie</td><td>8 to 1</td><td>' + fmt(M.LIMIT.T) + '</td></tr>' +
      '<tr><td>Player Pair / Banker Pair</td><td>11 to 1 when that side\'s first two cards share a rank</td><td>' + fmt(M.LIMIT.PP) + '</td></tr>' +
      '<tr><td>Player Dragon / Banker Dragon</td><td>see below</td><td>' + fmt(M.LIMIT.PD) + '</td></tr></table>' +
      '<p>You may back the Player or the Banker on a hand, not both. Bets are made with the table chips (2K to 250K), so every bet is at least 2,000 BB.</p>' +
      '<h3>Dragon Bonus</h3><p>A side bet that your side wins well. Natural win: 1 to 1. Natural tie: stake returned. Any other win by 9 points pays 30 to 1, by 8 pays 10 to 1, by 7 pays 6 to 1, by 6 pays 4 to 1, by 5 pays 2 to 1, by 4 pays 1 to 1. Anything else loses.</p>' +
      '<h3>The roads</h3><p>The scoreboard keeps this shoe\'s results the classic ways. <b>Bead Plate</b>: every hand in order, down the columns (blue P, red B, green T; small dots mark pairs). <b>Big Road</b>: a new column every time the winner changes, with ties as a green stroke and a long streak turning right along the bottom (the dragon\'s tail). <b>Big Eye Boy</b>, <b>Small Road</b> and <b>Cockroach Pig</b> read the Big Road one, two and three columns back: red when it is repeating its own pattern, blue when it breaks it. Tap <b>B?</b> or <b>P?</b> to see what each road would show after a Banker or a Player win. The roads are for fun: every hand is independent.</p>' +
      '<h3>Controls</h3><p>Pick a chip and tap a betting spot; Undo takes the last chip back and a right-click clears a spot. Keys: <b>1</b>–<b>7</b> chips, <b>U</b> undo, <b>C</b> clear, <b>X</b> double, <b>R</b> rebet, ' + (B.online ? '' : '<b>Space</b> deal, ') + '<b>S</b> skip, <b>T</b> turbo.</p>' +
      '<h3>Return</h3><table><tr><th>Bet</th><th>Return</th><th>Wins</th></tr>' +
      ['P', 'B', 'T', 'PP', 'PD', 'BD'].map((k) => '<tr><td>' + (k === 'PP' ? 'Player or Banker Pair' : SPOT_NAME[k]) + '</td><td>' + pct(R[k].rtp) + '</td><td>' + pct(R[k].hit) + '</td></tr>').join('') + '</table>' +
      '<p class="rtp">Exact returns for a full eight-deck shoe (every hand enumerated), confirmed by 10,000,000 simulated hands dealt from persisted shoes with the cut card and burn: Banker ' + pct(R.B.rtp) + ', Player ' + pct(R.P.rtp) + ', Player Dragon ' + pct(R.PD.rtp) + ', Banker Dragon ' + pct(R.BD.rtp) + ', pairs ' + pct(R.PP.rtp) + ', Tie ' + pct(R.T.rtp) + '. A tie happens in ' + pct(R.T.hit) + ' of hands. Maximum win ' + fmt(M.MAX_WIN) + ' BB on one hand (the most the table limits allow).</p>' +
      '<p>Batty Bucks are play money. They have no cash value and cannot be bought, sold or cashed out.</p>';
  }

  /* ============================== sound ============================== */
  const A = B.audio;
  const snd = {
    slide() { A.noise({ d: 0.14, v: 0.12, lp: 900, f2: 5200 }); },
    snap() { A.noise({ d: 0.035, v: 0.2, hp: 2600 }); A.tone({ f: 210, f2: 110, d: 0.05, type: 'sine', v: 0.09 }); },
    flip() { A.noise({ d: 0.09, v: 0.14, hp: 1500, f2: 5000 }); A.tone({ f: 520, f2: 260, d: 0.08, type: 'triangle', v: 0.06 }); },
    peel(d) { A.noise({ d: d || 0.5, v: 0.05, hp: 2400, f2: 6200 }); A.noise({ d: (d || 0.5) * 0.8, v: 0.03, lp: 700, f2: 300 }); },
    tension() { A.tone({ f: 110, f2: 116, d: 0.9, type: 'sine', v: 0.08 }); A.tone({ f: 220, f2: 233, d: 0.9, type: 'triangle', v: 0.03 }); },
    heart() { A.tone({ f: 70, f2: 50, d: 0.12, type: 'sine', v: 0.22 }); A.tone({ f: 64, f2: 46, d: 0.12, type: 'sine', v: 0.16, t: 0.18 }); },
    chip() { B.sfx('chip'); A.noise({ d: 0.02, v: 0.08, hp: 4200, t: 0.02 }); },
    clack(n) { for (let i = 0; i < Math.min(n || 3, 7); i++) { A.tone({ f: 2300 + ((i * 397) % 900), d: 0.025, type: 'square', v: 0.03, t: i * 0.045 }); A.noise({ d: 0.02, v: 0.09, hp: 3800, t: i * 0.045 }); } },
    chipSlide() { A.noise({ d: 0.3, v: 0.08, lp: 1600, f2: 500 }); },
    riffle() { for (let i = 0; i < 18; i++) A.noise({ d: 0.025, v: 0.07, hp: 2000 + (i % 5) * 300, t: i * 0.035 }); },
    harp(notes, step, v) { A.seq(notes, { step: step || 0.09, type: 'triangle', v: v || 0.07, d: (step || 0.09) * 3 }); A.seq(notes.map((n) => (Array.isArray(n) ? [n[0] * 2, n[1]] : n * 2)), { step: step || 0.09, type: 'sine', v: (v || 0.07) * 0.5, d: (step || 0.09) * 3 }); },
    win() { snd.harp([392, 493.9, 587.3, [784, 3]], 0.1, 0.07); },
    natural() { A.tone({ f: 196, d: 1.4, type: 'sine', v: 0.16 }); A.tone({ f: 392, d: 1.2, type: 'triangle', v: 0.05 }); snd.harp([587.3, 784, 987.8, [1174.7, 4]], 0.08, 0.06); },
    tie() { snd.harp([523.3, 659.3, 784, 1046.5, [1318.5, 4]], 0.07, 0.07); },
    pair() { A.seq([1318.5, 1568, 2093], { step: 0.06, type: 'square', v: 0.04 }); },
    dragon() { A.tone({ f: 98, f2: 196, d: 0.6, type: 'sawtooth', v: 0.06 }); snd.harp([293.7, 440, 587.3, 880, [1174.7, 5]], 0.09, 0.08); B.sfx('thunder'); },
    lose() { A.tone({ f: 130, f2: 70, d: 0.35, type: 'sawtooth', v: 0.05 }); },
    push() { A.tone({ f: 660, d: 0.12, type: 'triangle', v: 0.08 }); A.tone({ f: 660, d: 0.12, type: 'triangle', v: 0.06, t: 0.14 }); },
    bell() { A.tone({ f: 1318.5, d: 0.9, type: 'sine', v: 0.08 }); A.tone({ f: 1976, d: 0.6, type: 'sine', v: 0.04 }); },
    tick() { B.sfx('tick'); },
    whoosh() { A.noise({ d: 0.3, v: 0.1, lp: 400, f2: 4200 }); },
    hum() { A.tone({ f: 880, d: 0.06, type: 'sine', v: 0.05 }); A.tone({ f: 1320, d: 0.08, type: 'sine', v: 0.035, t: 0.07 }); },
  };
  const LINES = {
    bets: ['Place your bets, darlings.', 'Chips on the velvet, please.', 'Player or Banker, my dears?', 'The shoe awaits. Bets, please.'],
    nomore: ['No more bets.', 'Thank you. No more bets.'],
    squeeze: ['Slowly does it…', 'Let\'s have a little look…', 'Squeeze it gently…'],
    natural: ['A natural! How delicious.', 'Natural nine. Divine.', 'A natural. Nobody draws.'],
    tie: ['A tie! Well, well.', 'Honours even. Tie!'],
    pair: ['A pair! Somebody\'s lucky.', 'Pairs, darling. Pairs!'],
    pwin: ['Player wins.', 'The Player has it.'],
    bwin: ['Banker wins.', 'Banker takes it.'],
    dragon: ['The Dragon roars!', 'Dragon Bonus! Magnificent.'],
    youwin: ['Splendid, darling.', 'Nicely played.', 'Ooh, lovely.'],
    shuffle: ['Fresh shoe, darlings. Eight decks.', 'A quick shuffle…'],
    last: ['The cut card! Last hand of the shoe.'],
    idle: ['The velvet suits you.', 'Champagne, anyone?', 'Big chips tonight.'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ICON = {
    deal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="10" height="14" rx="2" transform="rotate(-12 8 12)" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="5" width="10" height="14" rx="2" transform="rotate(10 16 12)" fill="currentColor"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
    x2: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="13" fill="currentColor">×2</text></svg>',
    rebet: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    skip: '<svg viewBox="0 0 24 24"><path d="M5 5l8 7-8 7zM13 5l8 7-8 7z" fill="currentColor"/></svg>',
    turbo: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    roads: '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="14" r="3"/><circle cx="14" cy="6" r="3"/></g><circle cx="18" cy="18" r="3" fill="currentColor"/></svg>',
  };

  /* ============================== the squeeze: a peel drawn as a fold ============================== */
  /* The back is clipped to the side of a fold line still covering the face; the flap is the peeled part reflected across it. */
  const RECT = [[0, 0], [100, 0], [100, 140], [0, 140]];
  function clipHalf(poly, n, d, less) {
    const out = [], f = (p) => p[0] * n[0] + p[1] * n[1] - d;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b), ia = less ? fa < 0 : fa >= 0, ib = less ? fb < 0 : fb >= 0;
      if (ia) out.push(a);
      if (ia !== ib) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function peelGeom(ang, frac) {
    const n = [Math.cos(ang), Math.sin(ang)], ds = RECT.map((p) => p[0] * n[0] + p[1] * n[1]);
    const lo = Math.min.apply(null, ds), hi = Math.max.apply(null, ds), d = lo + (hi - lo) * frac;
    const cover = clipHalf(RECT, n, d, false), open = clipHalf(RECT, n, d, true);
    const flap = open.map((p) => { const k = 2 * (p[0] * n[0] + p[1] * n[1] - d); return [p[0] - k * n[0], p[1] - k * n[1]]; });
    return { cover, flap, n };
  }
  const ptsStr = (ps) => ps.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const A_RIGHT = Math.PI + 0.12, A_BOTTOM = -Math.PI / 2 - 0.1, A_CORNER = Math.atan2(-1.4, -1);
  /* a card's peel at progress u (0..1): [angle, fraction, stage]. quick: one corner peel; slow: the side, the bottom, then the corner */
  function peelAt(u, slow) {
    if (!slow) {
      if (u < 0.2) return [A_CORNER, 0.14 * ease(u / 0.2), 0];
      if (u < 0.38) return [A_CORNER, 0.14, 0];
      return [A_CORNER, 0.14 + 0.86 * ease((u - 0.38) / 0.62), 1];
    }
    const seg = [[0, 0.16, A_RIGHT, 0, 0.22, 0], [0.16, 0.3, A_RIGHT, 0.22, 0.22, 1], [0.3, 0.37, A_RIGHT, 0.22, 0, 2],
      [0.37, 0.54, A_BOTTOM, 0, 0.3, 3], [0.54, 0.68, A_BOTTOM, 0.3, 0.3, 4], [0.68, 0.74, A_BOTTOM, 0.3, 0, 5], [0.74, 1, A_CORNER, 0, 1, 6]];
    for (const [a, b, ang, f0, f1, st] of seg) if (u < b) { const k = ease((u - a) / (b - a)); const wob = st === 1 || st === 4 ? Math.sin(u * 90) * 0.012 : 0; return [ang, f0 + (f1 - f0) * k + wob, st]; }
    return [A_CORNER, 1, 7];
  }

  /* ============================== the game ============================== */
  let S = null, G = null;
  const mem = { chip: 1, last: null, turbo: false, road: [], hist: [] };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) { if (raw.chip >= 0 && raw.chip < M.CHIPS.length) mem.chip = raw.chip | 0; if (raw.last && typeof raw.last === 'object') mem.last = raw.last; mem.turbo = !!raw.turbo; } } catch (e) { /* memory only */ }
  const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify({ chip: mem.chip, last: mem.last, turbo: mem.turbo })); } catch (e) { /* memory only */ } };
  const sum = (bets) => Object.keys(bets).reduce((a, k) => a + (bets[k] || 0), 0);
  const clean = (bets) => { const o = {}; for (const k of M.SPOTS) if (bets && bets[k] > 0) o[k] = bets[k]; return o; };
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  function mount(root) {
    S = B.scope();
    const live = B.online;
    let devOn = false; try { devOn = !live && localStorage.getItem('batty-dev') === '1'; } catch (e) { /* off */ }
    const dev = devOn ? (window.__baccaratDev = { force: null, hands: 0, staked: 0, won: 0, last: null }) : null;
    const g = { dead: false, phase: 'idle', bets: {}, undo: [], hid: 0, hand: null, F: null, tl: null, ev: null, t: 0, skip: false, busy: false, my: {}, shoe: null, road: [], sweeping: false, lastWin: 0, sq: null };
    G = g;
    const L = { st: null, off: null, best: 1e9, age: 0, polling: false, next: 0, settled: {}, confirmed: 0, mine: {}, sending: false, dirty: false, bettorsKey: '', winKey: '', roadKey: '' };
    const nowS = () => Date.now() / 1000 + (L.off || 0);
    const T = (ms) => (reduce ? Math.min(ms, 140) : mem.turbo ? ms * 0.55 : ms);

    root.innerHTML = DEFS;
    /* ---------- the velvet rope: under level 5 there is no table ---------- */
    function showLock(text) {
      g.dead = true; g.phase = 'lock';
      root.innerHTML = DEFS;
      const box = h('div', { class: 'vb-lockscr' }, h('div', { class: 'vb-lockbox' },
        h('div', { class: 'rope', html: '<svg viewBox="0 0 240 70" aria-hidden="true"><path d="M20 30Q120 78 220 30" stroke="#8c1538" stroke-width="9" fill="none" stroke-linecap="round"/><rect x="14" y="16" width="12" height="54" fill="#c99a35"/><rect x="214" y="16" width="12" height="54" fill="#c99a35"/><circle cx="20" cy="14" r="9" fill="#f3d98b"/><circle cx="220" cy="14" r="9" fill="#f3d98b"/></svg>' }),
        h('h2', null, 'Velvet Baccarat'), h('p', null, text || ('The High Roller Lounge opens at level ' + M.MIN_LEVEL + '. Keep playing to climb.')),
        h('button', { type: 'button', class: 'vb-btn primary', onclick: () => B.go('') }, 'Back to the lobby')));
      root.append(box);
    }
    if ((B.level || 1) < M.MIN_LEVEL) { showLock(); return g; }

    /* ---------- DOM: the salon ---------- */
    const el = {};
    const bg = h('div', { class: 'vb-bg', html: roomSvg() });
    const motes = h('div', { class: 'vb-motes', 'aria-hidden': 'true' }); for (let i = 0; i < 9; i++) motes.append(h('i', { style: '--x:' + (8 + i * 11) + '%;--d:' + (9 + (i % 4) * 3) + 's;--o:-' + i * 1.7 + 's' }));
    const view = h('div', { class: 'vb-view' });
    const stage = h('div', { class: 'vb-stage' });
    view.append(stage);
    el.roads = h('aside', { class: 'vb-roads', 'aria-label': 'Scoreboard: the roads for this shoe' });
    const main = h('div', { class: 'vb-main' }, view, el.roads);
    const room = h('div', { class: 'vb-room' + (live ? ' vb-live' : '') }, bg, motes, main);

    /* ---------- Vesper ---------- */
    const D = (() => {
      const body = h('div', { class: 'vb-dealer', html: vesperSvg() });
      const arms = h('div', { class: 'vb-darms', html: armsSvg() });
      const bub = h('div', { class: 'vb-bubble', 'aria-hidden': 'true' });
      const svgB = body.firstChild, svgA = arms.firstChild;
      let reactT = 0, bubT = 0;
      function react(kind, ms) {
        for (const s of [svgB, svgA]) s.classList.remove('x-happy', 'x-sad', 'x-shock', 'x-wink', 'x-peek', 'x-laugh');
        void body.offsetWidth;
        if (kind) for (const s of [svgB, svgA]) s.classList.add('x-' + kind);
        S.clear(reactT); if (kind && ms) reactT = S.timeout(() => react(null), ms);
      }
      function say(text, ms) {
        bub.textContent = text; bub.classList.remove('on'); void bub.offsetWidth; bub.classList.add('on');
        S.clear(bubT); bubT = S.timeout(() => bub.classList.remove('on'), ms || 2600);
      }
      function shoulder(side) { const r = svgA.getBoundingClientRect(), k = r.width / 360 || 1; return { x: r.left + (side === 'r' ? 238 : 122) * k, y: r.top + 118 * k, k }; }
      function pose(side, x, y) {
        const s = shoulder(side), dx = x - s.x, dy = Math.max(10 * s.k, y - s.y);
        const a = Math.max(-84, Math.min(72, -Math.atan2(dx, dy) * 57.2958));
        const e = Math.max(1, Math.min(1.5, Math.hypot(dx, dy) / s.k / 120));
        return 'rotate(' + a.toFixed(1) + 'deg) scale(1,' + e.toFixed(2) + ')';
      }
      function reach(side, pts, ms) {
        if (reduce || g.dead) return;
        const arm = svgA.querySelector('.v-arm.' + side); if (!arm) return;
        const cur = getComputedStyle(arm).transform;
        const frames = [{ transform: cur && cur !== 'none' ? cur : 'rotate(0deg) scale(1,1)', offset: 0 }];
        for (const p of pts) frames.push({ transform: pose(side, p.x, p.y), offset: p.at });
        frames.push({ transform: 'rotate(0deg) scale(1,1)', offset: 1 });
        arm.getAnimations().forEach((a) => a.cancel());
        arm.animate(frames, { duration: ms, easing: 'ease-in-out' });
      }
      function look(x, y) {
        const r = svgB.getBoundingClientRect(), k = r.width / 360 || 1;
        const dx = x - (r.left + 180 * k), dy = y - (r.top + 62 * k), d = Math.hypot(dx, dy) || 1;
        svgB.style.setProperty('--px', (dx / d * 3.4).toFixed(2) + 'px'); svgB.style.setProperty('--py', (dy / d * 3).toFixed(2) + 'px');
      }
      function lookHome() { svgB.style.setProperty('--px', '0px'); svgB.style.setProperty('--py', '1px'); }
      function twitch() { const e = svgB.querySelectorAll('.v-ear')[Math.random() < 0.5 ? 0 : 1]; e.classList.remove('tw'); void body.offsetWidth; e.classList.add('tw'); }
      return { body, arms, bub, react, say, reach, look, lookHome, twitch };
    })();

    /* ---------- the stage ---------- */
    const felt = h('div', { class: 'vb-felt' });
    const pool = h('div', { class: 'vb-pool' });
    const edgeEl = h('div', { class: 'vb-edge' });
    const tray = h('div', { class: 'vb-tray vb-abs', html: traySvg() });
    const shoe = h('div', { class: 'vb-shoe vb-abs', html: SHOE_SVG }, h('i', { class: 'vb-mouth' }), h('b', { class: 'vb-left' }));
    const pile = h('i', { class: 'pile' });
    const discard = h('div', { class: 'vb-discard vb-abs' }, pile, h('span', null, 'DISCARD'));
    const boxes = {};
    for (const s of ['P', 'B']) {
      const tot = h('i', { class: 'tot' }), cards = h('div', { class: 'cards' }), tag = h('em', { class: 'tag' });
      const box = h('div', { class: 'vb-hbox vb-abs ' + (s === 'P' ? 'p' : 'b') }, h('div', { class: 'lbl' }, h('b', null, s === 'P' ? 'PLAYER' : 'BANKER'), tot), cards, tag);
      boxes[s] = { box, tot, cards, tag, slots: [] };
    }
    const spots = {};
    for (const k of M.SPOTS) {
      const stack = h('div', { class: 'vb-stack' }), pay = h('div', { class: 'vb-stack vb-pay' }), amt = h('b', { class: 'vb-amt' }), ost = h('div', { class: 'vb-stack vb-ost' }), oth = h('span', { class: 'vb-oth' }), res = h('em', { class: 'vb-sres' });
      const big = k === 'P' || k === 'B';
      const spot = h('button', { type: 'button', class: 'vb-spot vb-abs s-' + k.toLowerCase() + (big ? ' big' : ''), 'data-k': k, 'aria-label': SPOT_NAME[k] + ', pays ' + SPOT_PAYS[k] },
        h('span', { class: 'ring' }, h('b', null, k === 'PD' || k === 'BD' ? (k === 'PD' ? 'P DRAGON' : 'B DRAGON') : k === 'PP' ? 'P PAIR' : k === 'BP' ? 'B PAIR' : SPOT_NAME[k].toUpperCase()), h('small', null, SPOT_PAYS[k])),
        ost, stack, pay, amt, oth, res);
      spot.addEventListener('click', () => addChip(k));
      spot.addEventListener('contextmenu', (e) => { e.preventDefault(); clearSpot(k); });
      spots[k] = { spot, stack, pay, amt, ost, oth, res, n: -1, on: -1 };
    }
    el.timer = h('div', { class: 'vb-timer vb-abs', hidden: true, html: '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><circle class="v" cx="22" cy="22" r="19"/></svg><b></b><small></small>' });
    el.call = h('div', { class: 'vb-call vb-abs', 'aria-hidden': 'true' });
    el.winPl = h('div', { class: 'vb-winpl vb-abs', 'aria-hidden': 'true' });
    el.sq = h('div', { class: 'vb-sq vb-abs', 'aria-hidden': 'true' });
    el.deck = h('div', { class: 'vb-deck vb-abs', 'aria-hidden': 'true', html: '<i></i><i></i><i></i><i></i><i></i><i></i>' });
    el.burn = h('div', { class: 'vb-burn vb-abs', 'aria-hidden': 'true' });
    el.rail = h('aside', { class: 'vb-rail', 'aria-label': 'Players at the table' });
    el.wins = h('aside', { class: 'vb-wins', 'aria-label': 'Winners of the last hand' });
    el.count = h('div', { class: 'vb-count', 'aria-live': 'polite' });
    stage.append(felt, pool, D.body, edgeEl, tray, shoe, discard, D.arms, boxes.P.box, boxes.B.box, ...M.SPOTS.map((k) => spots[k].spot), el.timer, el.deck, el.burn, el.sq, D.bub, el.call, el.winPl);
    if (live) stage.append(el.rail, el.wins, el.count);

    /* ---------- the control bar ---------- */
    const btn = (cls, label, key, fn, icon) => {
      const b = h('button', { type: 'button', class: 'vb-btn ' + cls, 'aria-label': label + (key ? ' (' + key + ')' : '') }, icon ? h('span', { class: 'ic', html: icon }) : null, h('span', { class: 'lb' }, label), key ? h('kbd', null, key) : null);
      b.addEventListener('click', () => { B.audio.ensure(); fn(); }); return b;
    };
    el.chips = h('div', { class: 'vb-chips', role: 'radiogroup', 'aria-label': 'Chip value' });
    M.CHIPS.forEach((v, i) => { const c = h('button', { type: 'button', class: 'vb-chip', role: 'radio', 'data-v': v, 'aria-label': fmt(v) + ' BB chip', html: chipSvg(v) }); c.addEventListener('click', () => { mem.chip = i; saveMem(); snd.chip(); paintChips(); }); el.chips.append(c); });
    el.undo = btn('ghost', 'Undo', 'U', () => undo(), ICON.undo);
    el.clear = btn('ghost', 'Clear', 'C', () => clearBets(), ICON.clear);
    el.x2 = btn('ghost', 'Double', 'X', () => doubleBets(), ICON.x2);
    el.rebet = btn('ghost', 'Rebet', 'R', () => rebet(), ICON.rebet);
    el.deal = btn('primary', 'Deal', 'Space', () => deal(), ICON.deal);
    el.skip = btn('primary skip', 'Skip', 'S', () => doSkip(), ICON.skip);
    el.turbo = h('button', { type: 'button', class: 'vb-tog', 'aria-pressed': 'false', 'aria-label': 'Turbo (T): no squeeze', title: 'Turbo (T): no squeeze' }, h('span', { class: 'ic', html: ICON.turbo }), h('span', { class: 'tl' }, 'Turbo'));
    el.turbo.addEventListener('click', () => { mem.turbo = !mem.turbo; saveMem(); B.sfx('click'); paintToggles(); if (mem.turbo && g.sq) closeSqueeze(true); });
    el.total = h('b', null, '0'); el.win = h('b', null, '0');
    el.msg = h('div', { class: 'vb-msg', role: 'status', 'aria-live': 'polite' }, h('span', null, 'Place your bets'));
    el.tbar = h('div', { class: 'vb-tbar', 'aria-hidden': 'true' }, h('i'));
    const info = h('div', { class: 'vb-info' }, h('span', null, h('small', null, 'Total bet'), el.total), h('span', { class: 'w' }, h('small', null, 'Last win'), el.win));
    el.betRow = h('div', { class: 'vb-row vb-betrow' }, el.undo, el.clear, el.x2, el.rebet, el.deal);
    el.playRow = h('div', { class: 'vb-row vb-playrow' }, h('p', null, ''), el.skip);
    el.left = h('div', { class: 'vb-left' }, info, h('div', { class: 'vb-togs' }, el.turbo));
    el.ctl = h('div', { class: 'vb-ctl' }, el.betRow, el.playRow);
    const bar = h('div', { class: 'vb-bar' }, el.tbar, el.msg, el.left, el.chips, el.ctl);
    el.banner = h('div', { class: 'vb-banner', 'aria-hidden': 'true' });
    root.append(room, bar, el.banner);

    /* the roads panel */
    el.rd = {};
    const rdBox = (cls, label) => { const b = h('div', { class: 'rd-box ' + cls, title: label, 'aria-label': label }); el.rd[cls.replace('rd-', '')] = b; return b; };
    el.rdStats = h('div', { class: 'rd-stats' });
    el.askB = h('button', { type: 'button', class: 'rd-ask b', 'aria-label': 'What the roads show if the Banker wins next' }, 'B?');
    el.askP = h('button', { type: 'button', class: 'rd-ask p', 'aria-label': 'What the roads show if the Player wins next' }, 'P?');
    let askT = 0;
    const ask = (s) => { B.sfx('click'); paintRoads(s); S.clear(askT); askT = S.timeout(() => paintRoads(), 2600); };
    el.askB.addEventListener('click', () => ask('B')); el.askP.addEventListener('click', () => ask('P'));
    el.roads.append(h('div', { class: 'rd-head' }, el.rdStats, h('div', { class: 'rd-asks' }, el.askB, el.askP)),
      h('div', { class: 'rd-body' }, rdBox('rd-bead', 'Bead Plate'), rdBox('rd-big', 'Big Road'), h('div', { class: 'rd-der' }, rdBox('rd-eye', 'Big Eye Boy'), rdBox('rd-small', 'Small Road'), rdBox('rd-roach', 'Cockroach Pig'))));

    /* ---------- layout ---------- */
    let C = null, SC = 1;
    const posAbs = (e, x, y) => { e.style.left = x + 'px'; e.style.top = y + 'px'; };
    function applyLayout(c) {
      C = c; root.dataset.lay = c.name;
      stage.style.width = c.W + 'px'; stage.style.height = c.H + 'px';
      root.style.setProperty('--cw', c.cw + 'px');
      felt.innerHTML = feltSvg(c);
      const ds = c.d.s;
      for (const e of [D.body, D.arms]) { e.style.width = 360 * ds + 'px'; e.style.height = 200 * ds + 'px'; e.style.left = (c.d.x - 180 * ds) + 'px'; e.style.top = (c.edge - 178 * ds) + 'px'; }
      edgeEl.style.top = (c.edge - 7) + 'px'; edgeEl.style.width = (c.W + 600) + 'px';
      tray.style.width = c.tray + 'px'; posAbs(tray, c.d.x, c.edge + c.tray * 0.075);
      shoe.style.width = c.shoe.w + 'px'; posAbs(shoe, c.shoe.x, c.shoe.y);
      discard.style.width = c.disc.w + 'px'; posAbs(discard, c.disc.x, c.disc.y);
      posAbs(boxes.P.box, c.P.x, c.P.y); posAbs(boxes.B.box, c.Bk.x, c.Bk.y);
      for (const k of M.SPOTS) { const p = c.spots[k], sp = spots[k].spot; posAbs(sp, p.x, p.y); sp.style.width = p.w + 'px'; sp.style.height = p.h + 'px'; sp.style.rotate = p.r + 'deg'; }
      posAbs(el.timer, c.timer.x, c.timer.y); posAbs(el.deck, c.timer.x, c.timer.y - 10); posAbs(el.burn, c.timer.x, c.timer.y);
      posAbs(el.call, c.call.x, c.call.y); posAbs(el.winPl, c.call.x, c.call.y);
      posAbs(el.sq, c.sq.x, c.sq.y); root.style.setProperty('--sqw', c.sq.w + 'px');
      posAbs(D.bub, c.bub.x, c.bub.y);
      light(lightAt);
    }
    function layout() {
      const W0 = root.clientWidth, H0 = root.clientHeight || (window.innerHeight - 56);
      if (!W0) return;
      const short = W0 > H0 * 1.3 && H0 < 560, phone = !short && W0 < 700;
      root.classList.toggle('vb-short', short); root.classList.toggle('vb-phone', phone);
      const vw = view.clientWidth, vh = view.clientHeight; if (!vw || !vh) return;
      const want = short ? LAY.compact : phone || vw / vh < 1.1 ? LAY.tall : LAY.wide;
      if (want !== C) applyLayout(want);
      SC = Math.min(vw / C.W, vh / C.H, 1.4);
      const left = (vw - C.W * SC) / 2, top = (vh - C.H * SC) / 2;
      stage.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px) scale(' + SC.toFixed(4) + ')';
      root.style.setProperty('--sc', SC.toFixed(4));
      paintRoads();
    }
    const ro = new ResizeObserver(() => layout()); ro.observe(root); ro.observe(bar); ro.observe(el.roads); S.on(window, 'resize', layout);

    let lightAt = 'table';
    function light(where) {
      lightAt = where; if (!C) return;
      let x = C.fx, y = C.edge + C.ry * 0.36, w = C.W * 0.9, hh = C.ry * 0.8, o = 0.55;
      if (where === 'P' || where === 'B') { const p = where === 'P' ? C.P : C.Bk; x = p.x; y = p.y; w = C.cw * 5; hh = C.cw * 3.6; o = 1; }
      else if (where === 'sq') { x = C.sq.x; y = C.sq.y; w = C.sq.w * 3.4; hh = C.sq.w * 2.4; o = 1; }
      pool.style.width = w + 'px'; pool.style.height = hh + 'px';
      pool.style.transform = 'translate(' + (x - w / 2) + 'px,' + (y - hh / 2) + 'px)'; pool.style.opacity = o;
    }

    /* ---------- painting ---------- */
    function msg(text, cls) { el.msg.className = 'vb-msg' + (cls ? ' ' + cls : ''); el.msg.firstChild.textContent = text; }
    let callT = 0;
    function call(text, cls, ms, sub) {
      el.call.innerHTML = '<b>' + text + '</b>' + (sub ? '<small>' + sub + '</small>' : ''); el.call.className = 'vb-call vb-abs ' + (cls || '');
      void el.call.offsetWidth; el.call.classList.add('on');
      S.clear(callT); callT = S.timeout(() => el.call.classList.remove('on'), ms || 1500);
    }
    function paintChips() { [...el.chips.children].forEach((c, i) => { c.classList.toggle('on', i === mem.chip); c.setAttribute('aria-checked', i === mem.chip ? 'true' : 'false'); }); }
    function paintToggles() { el.turbo.setAttribute('aria-pressed', mem.turbo ? 'true' : 'false'); }
    function paintSpot(k, n, drop) {
      const sp = spots[k];
      if (sp.n === n) return;
      const grew = sp.n >= 0 && n > sp.n; sp.n = n;
      sp.stack.innerHTML = n ? stackHtml(n, k === 'P' || k === 'B' ? 10 : 7, drop && grew) : '';
      sp.amt.textContent = n ? fmt(n) : '';
      sp.spot.classList.toggle('has', n > 0);
    }
    function paintBets(drop) {
      for (const k of M.SPOTS) paintSpot(k, g.bets[k] || 0, drop);
      el.total.textContent = fmt(sum(g.bets));
    }
    function paintOthers() {
      const sp = live && L.st ? L.st.spots || {} : {};
      for (const k of M.SPOTS) {
        const o = sp[k], s = spots[k], key = o ? o.n + ':' + o.amt : '';
        if (s.on === key) continue; s.on = key;
        s.ost.innerHTML = o ? stackHtml(o.amt, 4) : '';
        s.oth.innerHTML = o ? '<i>' + o.n + '</i>' + fmt(o.amt) : '';
        s.spot.classList.toggle('oth', !!o);
      }
    }
    function controls() {
      const ph = g.phase, canBet = ph === 'bet' && !g.busy;
      root.dataset.phase = ph;
      el.betRow.hidden = !(ph === 'bet' || ph === 'idle' || ph === 'rest' || ph === 'shuffle');
      el.playRow.hidden = !el.betRow.hidden;
      el.chips.classList.toggle('off', !canBet);
      const has = sum(g.bets) > 0;
      el.undo.disabled = !canBet || !g.undo.length; el.clear.disabled = !canBet || !has; el.x2.disabled = !canBet || !has;
      el.rebet.disabled = !canBet || !mem.last || !sum(mem.last) || has;
      el.deal.hidden = live;
      el.deal.disabled = !canBet || (!has && !(mem.last && sum(mem.last)));
      el.deal.querySelector('.lb').textContent = has || !(mem.last && sum(mem.last)) ? 'Deal' : 'Rebet & Deal';
      el.skip.disabled = !(ph === 'play' && !g.skip);
      el.playRow.firstChild.textContent = ph === 'closing' ? 'No more bets' : ph === 'deal' ? 'Dealing…' : ph === 'result' ? 'Settling the bets…' : g.skip ? 'Cards shown' : 'Skip shows every card at once';
      for (const k of M.SPOTS) spots[k].spot.disabled = !canBet;
      paintToggles();
    }

    /* ---------- cards ---------- */
    function makeCard(code) {
      const c = h('div', { class: 'vb-card down', 'data-c': code });
      c.innerHTML = '<i class="vb-shad"></i><div class="vb-cin"><div class="vb-face">' + faceSvg(code) + '<i class="vb-sheen"></i></div><div class="vb-back">' + BACK_SVG + '</div></div>';
      return c;
    }
    const centre = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
    const mouth = () => centre(shoe.querySelector('.vb-mouth'));
    function sheen(card, delay) { if (reduce) return; const s = card.querySelector('.vb-sheen'); if (s) s.animate([{ opacity: 0, transform: 'translateX(-70%)' }, { opacity: 0.95, offset: 0.3 }, { opacity: 0, transform: 'translateX(70%)' }], { duration: 650, delay: delay || 0, easing: 'ease-out' }); }
    function flyCard(card, ms) {
      if (reduce) return Promise.resolve();
      const to = centre(card), from = mouth(), k = to.w / (card.offsetWidth || 1) || 1;
      if (!to.w) return Promise.resolve();
      const side = false;   /* a third card lies sideways through the CSS `rotate` property, which composes with these keyframes */
      const dx = (from.x - to.x) / k, dy = (from.y - to.y) / k, s0 = 0.5, r0 = side ? 64 : -26;
      const ez = 'cubic-bezier(.28,.62,.3,1)';
      const a = card.animate([
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + r0 + 'deg) scale(' + s0 + ')', offset: 0 },
        { transform: 'translate(' + (dx * 0.42).toFixed(1) + 'px,' + (dy * 0.42 - 40).toFixed(1) + 'px) rotate(' + (side ? 78 : -8) + 'deg) scale(1.1)', offset: 0.52 },
        { transform: 'translate(0px,-2px) rotate(' + (side ? 91 : 1.5) + 'deg) scale(1.01)', offset: 0.86 },
        { transform: side ? 'rotate(90deg)' : 'none', offset: 1 }], { duration: ms, easing: ez });
      card.querySelector('.vb-shad').animate([{ transform: 'translate(0px,0px)', opacity: 0.15 }, { transform: 'translate(14px,38px) scale(1.06)', opacity: 0.2, offset: 0.52 }, { transform: 'translate(2px,4px)', opacity: 0.5, offset: 0.86 }, { transform: 'none', opacity: 0.55 }], { duration: ms, easing: ez });
      return a.finished.catch(() => {});
    }
    function flipUp(card, animate) {
      if (!card || !card.classList.contains('down')) return;
      card.classList.remove('down');
      if (animate && !reduce) {
        card.querySelector('.vb-cin').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(-12deg) translateZ(20px)', offset: 0.7 }, { transform: 'rotateY(0deg)' }], { duration: T(420), easing: 'ease-in-out' });
        sheen(card, T(300)); snd.flip();
      }
    }
    function slotEl(id) { return boxes[id[0]].slots[+id[1]]; }
    function paintTotals() {
      for (const s of ['P', 'B']) {
        const bx = boxes[s], up = bx.slots.filter((c) => c && !c.classList.contains('down')).map((c) => +c.dataset.c);
        const t = up.length ? String(up.reduce((a, c) => a + M.val(c), 0) % 10) : '';
        if (bx.tot.textContent !== t) { bx.tot.textContent = t; bx.tot.classList.remove('pop'); void bx.tot.offsetWidth; if (t) bx.tot.classList.add('pop'); }
        bx.box.classList.toggle('shown', !!t);
      }
    }
    function clearTable() {
      for (const s of ['P', 'B']) { const bx = boxes[s]; bx.cards.textContent = ''; bx.slots = []; bx.tot.textContent = ''; bx.tag.textContent = ''; bx.box.classList.remove('win', 'lose', 'tie', 'shown', 'nat'); }
      for (const k of M.SPOTS) { const sp = spots[k]; sp.spot.classList.remove('won', 'lost', 'push', 'hot'); delete sp.spot.dataset.gone; sp.pay.innerHTML = ''; sp.pay.classList.remove('on'); sp.res.textContent = ''; sp.res.classList.remove('on'); sp.stack.getAnimations().forEach((a) => a.cancel()); sp.pay.getAnimations().forEach((a) => a.cancel()); sp.ost.getAnimations().forEach((a) => a.cancel()); }
      el.winPl.classList.remove('on');
      closeSqueeze(true);
    }
    /* the old hand's cards go to the discard holder */
    async function sweep() {
      const cards = stage.querySelectorAll('.vb-hbox .vb-card');
      g.sweeping = true;
      if (cards.length && !reduce) {
        const dr = centre(discard);
        D.reach('l', [{ x: dr.x + 40, y: dr.y + 30, at: 0.5 }], T(700));
        snd.slide(); S.timeout(snd.slide, 120);
        const anims = [...cards].map((c, k) => { const r = centre(c), kk = r.w / (c.offsetWidth || 1) || 1; return c.animate([{ opacity: 1 }, { transform: 'translate(' + ((dr.x - r.x) / kk) + 'px,' + ((dr.y - r.y) / kk) + 'px) rotate(' + (k % 2 ? 80 : 100) + 'deg) scale(.55)', opacity: 0 }], { duration: T(420), delay: k * 25, easing: 'cubic-bezier(.5,0,.7,.6)', fill: 'forwards' }).finished.catch(() => {}); });
        await Promise.race([Promise.all(anims), S.sleep(T(800))]);
      }
      pileN = Math.min(1, pileN + cards.length / 80); discard.style.setProperty('--pile', pileN.toFixed(3));
      clearTable(); g.sweeping = false;
    }
    let pileN = 0;

    /* ---------- chips moving ---------- */
    function toward(e, pt, ms, o) {
      o = o || {};
      if (reduce) return Promise.resolve();
      const c0 = centre(e), k = c0.w / (e.offsetWidth || 1) || 1;
      if (!c0.w) return Promise.resolve();
      const dx = (pt.x - c0.x) / k, dy = (pt.y - c0.y) / k;
      return e.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.5 - (o.arc || 0)).toFixed(1) + 'px) scale(' + ((1 + (o.scale || 0.7)) / 2) + ')', opacity: 1, offset: 0.5 },
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + (o.scale || 0.7) + ')', opacity: o.fade ? 0 : 1 }], { duration: ms, easing: o.ease || 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' }).finished.catch(() => {});
    }
    async function collect(list) {
      list = list.filter((e) => e.childElementCount);
      if (!list.length) return;
      const tr = centre(tray), c0 = centre(list[0]);
      D.reach('l', [{ x: c0.x, y: c0.y, at: 0.35 }, { x: tr.x, y: tr.y, at: 0.8 }], T(820));
      D.look(c0.x, c0.y); snd.chipSlide();
      await Promise.all(list.map((e, k) => S.sleep(T(k * 70)).then(() => toward(e, tr, T(560), { fade: true, scale: 0.45, arc: 10 }))));
      snd.clack(3);
    }
    async function payTo(sp, amount, ms) {
      if (amount <= 0) return;
      sp.pay.innerHTML = stackHtml(amount, 10); sp.pay.classList.add('on');
      if (reduce) { snd.clack(4); return; }
      const tr = centre(tray), c1 = centre(sp.pay), k = c1.w / (sp.pay.offsetWidth || 1) || 1;
      D.reach('r', [{ x: tr.x + 20, y: tr.y, at: 0.25 }, { x: c1.x, y: c1.y, at: 0.62 }], T(ms + 260));
      snd.chipSlide();
      await sp.pay.animate([{ transform: 'translate(' + ((tr.x - c1.x) / k).toFixed(1) + 'px,' + ((tr.y - c1.y) / k).toFixed(1) + 'px) scale(.55)', opacity: 0.3 },
        { transform: 'translate(' + ((tr.x - c1.x) / k * 0.4).toFixed(1) + 'px,' + ((tr.y - c1.y) / k * 0.4 - 20).toFixed(1) + 'px) scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: T(ms), easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.catch(() => {});
      snd.clack(chipsFor(amount).length);
    }
    async function toPlayer(keys) {
      const items = [];
      for (const k of keys) { const sp = spots[k]; if (sp.stack.childElementCount) items.push(sp.stack); if (sp.pay.classList.contains('on')) items.push(sp.pay); }
      if (!items.length || reduce) return;
      const dst = centre(el.win);
      snd.whoosh();
      await Promise.all(items.map((e, k) => S.sleep(T(k * 60)).then(() => toward(e, dst, T(620), { fade: true, scale: 0.4, arc: 50, ease: 'cubic-bezier(.5,0,.6,1)' }))));
    }
    function flyChip(v, from, to, ms) {
      if (reduce) return;
      const r0 = from.getBoundingClientRect(), r1 = to.getBoundingClientRect(), rr = root.getBoundingClientRect();
      if (!r0.width) return;
      const fly = h('div', { class: 'vb-fly', html: chipSvg(v, r0.width) });
      Object.assign(fly.style, { left: (r0.left - rr.left) + 'px', top: (r0.top - rr.top) + 'px', width: r0.width + 'px', height: r0.height + 'px' });
      root.append(fly);
      const dx = r1.left + r1.width / 2 - r0.left - r0.width / 2, dy = r1.top + r1.height / 2 - r0.top - r0.height / 2, sc = Math.max(0.35, (C.cw * SC * 0.55) / r0.width);
      fly.animate([{ transform: 'none' }, { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 70 * SC) + 'px) scale(' + ((1 + sc) / 2) + ')', offset: 0.5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ',' + sc * 0.6 + ')' }], { duration: ms, easing: 'cubic-bezier(.3,.6,.4,1)' })
        .finished.then(() => fly.remove(), () => fly.remove());
      S.timeout(() => fly.remove(), ms + 200);
    }

    /* ---------- betting ---------- */
    const snapshot = () => Object.assign({}, g.bets);
    function canAfford(total) { return total - (live ? L.confirmed : 0) <= B.wallet.balance; }
    function addChip(k) {
      if (g.phase !== 'bet' || g.busy) return;
      B.audio.ensure();
      const v = M.CHIPS[mem.chip], cur = g.bets[k] || 0, cap = M.LIMIT[k];
      if ((k === 'P' && g.bets.B) || (k === 'B' && g.bets.P)) { B.ui.toast('Back the Player or the Banker, not both.'); B.sfx('click'); return; }
      if (cur >= cap) { B.ui.toast(SPOT_NAME[k] + ' is at its table limit of ' + fmt(cap) + ' BB.'); return; }
      const add = Math.min(v, cap - cur);
      if (!canAfford(sum(g.bets) + add)) { B.ui.broke(); return; }
      g.undo.push(snapshot()); if (g.undo.length > 60) g.undo.shift();
      g.bets[k] = cur + add;
      const sp = spots[k];
      flyChip(v, el.chips.children[mem.chip], sp.spot, 300);
      S.timeout(() => snd.clack(2), reduce ? 0 : 280);
      snd.chip(); paintBets(true); controls(); queueSend();
      if (!reduce) { const c = centre(sp.spot); D.look(c.x, c.y); }
    }
    function clearSpot(k) {
      if (g.phase !== 'bet' || g.busy || !g.bets[k]) return;
      g.undo.push(snapshot()); delete g.bets[k];
      B.sfx('click'); paintBets(); controls(); queueSend();
    }
    function clearBets() { if (g.phase !== 'bet' || g.busy) return; if (sum(g.bets)) g.undo.push(snapshot()); g.bets = {}; snd.chipSlide(); paintBets(); controls(); queueSend(); }
    function undo() { if (g.phase !== 'bet' || g.busy || !g.undo.length) return; g.bets = g.undo.pop(); B.sfx('click'); paintBets(); controls(); queueSend(); }
    function doubleBets() {
      if (g.phase !== 'bet' || g.busy || !sum(g.bets)) return;
      const nb = {}; for (const k in g.bets) nb[k] = Math.min(M.LIMIT[k], g.bets[k] * 2);
      if (!canAfford(sum(nb))) { B.ui.broke(); return; }
      g.undo.push(snapshot()); g.bets = nb; snd.clack(4); paintBets(true); controls(); queueSend();
    }
    function rebet() {
      if (g.phase !== 'bet' || g.busy || !mem.last) return false;
      const nb = clean(mem.last);
      if (!sum(nb) || M.check(nb)) return false;
      if (!canAfford(sum(nb))) { B.ui.broke(); return false; }
      g.undo.push(snapshot()); g.bets = nb; snd.clack(4); paintBets(); controls(); queueSend();
      if (!reduce) for (const k in nb) spots[k].stack.animate([{ transform: 'translateY(-40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      return true;
    }

    /* ---------- the hand's script ---------- */
    /* every event of a hand, in seconds after betting closed (BattyMath.baccarat.timeline: identical for every viewer) */
    function buildEvents(F, tl) {
      const ev = [];
      ['P0', 'B0', 'P1', 'B1'].forEach((id, i) => ev.push({ t: tl.deal[i], k: 'deal', id, code: (id[0] === 'P' ? F.p : F.b)[+id[1]] }));
      ev.push({ t: tl.sqP[0], k: 'sq', side: 'P', ids: ['P0', 'P1'], w: tl.sqP }, { t: tl.sqP[1], k: 'rev', side: 'P', ids: ['P0', 'P1'] });
      ev.push({ t: tl.sqB[0], k: 'sq', side: 'B', ids: ['B0', 'B1'], w: tl.sqB }, { t: tl.sqB[1], k: 'rev', side: 'B', ids: ['B0', 'B1'], first: true });
      for (const th of tl.third) {
        const id = th.side + '2';
        ev.push({ t: th.deal - 0.2, k: 'draw', side: th.side });
        ev.push({ t: th.deal, k: 'deal', id, code: (th.side === 'P' ? F.p : F.b)[2] });
        ev.push({ t: th.sq[0], k: 'sq', side: th.side, ids: [id], w: th.sq }, { t: th.sq[1], k: 'rev', side: th.side, ids: [id] });
      }
      ev.push({ t: tl.result, k: 'result' });
      return ev.sort((a, b) => a.t - b.t);
    }
    function startScript(F) {
      g.F = F; g.tl = M.timeline(F); g.ev = buildEvents(F, g.tl); g.skip = false; g.phase = 'play'; g.sq = null;
      controls(); light('table');
    }
    function doSkip() {
      if (g.phase !== 'play' || g.skip) return;
      g.skip = true; closeSqueeze(true); snd.whoosh(); controls();
    }
    /* run every event that is due; late ones (a late join, a skip, a slow tab) happen without their animation */
    function present(t) {
      const tp = g.skip ? Math.max(t, g.tl.result) : t;
      for (const e of g.ev) {
        if (e.done || tp < e.t) continue;
        e.done = true;
        try { fire(e, g.skip || tp - e.t > 0.7); } catch (err) { console.error(err); }
        if (g.dead) return;
      }
      if (g.sq) squeezeFrame(tp);
    }
    function fire(e, instant) {
      if (e.k === 'deal') {
        const s = e.id[0], i = +e.id[1], bx = boxes[s];
        const c = makeCard(e.code); c.classList.add('s' + i); if (i === 2) c.classList.add('side');
        bx.slots[i] = c; bx.cards.append(c);
        if (!instant) {
          const tc = centre(c), m = mouth();
          D.look(tc.x, tc.y);
          D.reach('r', [{ x: m.x, y: m.y, at: 0.3 }, { x: tc.x, y: tc.y, at: 0.7 }], T(520));
          snd.slide(); flyCard(c, T(420)); S.timeout(snd.snap, T(380));
        }
        if (s === 'P' && i === 0 && !instant) msg('Cards out. Good luck!', 'quiet');
        return;
      }
      if (e.k === 'sq') {
        const quick = instant || mem.turbo || reduce || g.skip;
        if (quick) { for (const id of e.ids) flipUp(slotEl(id), !instant); paintTotals(); e.flipped = true; if (!instant) light(e.side); return; }
        openSqueeze(e);
        return;
      }
      if (e.k === 'rev') {
        if (g.sq && g.sq.e.side === e.side) closeSqueeze(instant);
        for (const id of e.ids) flipUp(slotEl(id), !instant && !e.flippedBy);
        paintTotals();
        if (e.first) afterNaturals(instant);
        return;
      }
      if (e.k === 'draw') {
        const F = g.F, pt2 = (M.val(F.p[0]) + M.val(F.p[1])) % 10, bt2 = (M.val(F.b[0]) + M.val(F.b[1])) % 10;
        if (!instant) {
          if (e.side === 'P') call('Player draws', 'quiet p', 1100, 'on ' + pt2);
          else call('Banker draws', 'quiet b', 1100, 'on ' + bt2 + (F.p.length === 3 ? ' · Player\'s third card ' + M.val(F.p[2]) : ''));
          light(e.side);
        }
        return;
      }
      if (e.k === 'result') { g.phase = 'result'; controls(); onResult(instant); }
    }
    /* after the first four cards: naturals, or who stands */
    function afterNaturals(instant) {
      const F = g.F, pn = F.pn, bn = F.bn;
      if (pn >= 8 || bn >= 8) {
        const who = pn >= 8 && bn >= 8 ? 'Natural ' + Math.max(pn, bn) + 's' : (pn >= 8 ? 'Player natural ' + pn : 'Banker natural ' + bn);
        boxes.P.box.classList.toggle('nat', pn >= 8); boxes.B.box.classList.toggle('nat', bn >= 8);
        if (pn >= 8) boxes.P.tag.textContent = 'NATURAL'; if (bn >= 8) boxes.B.tag.textContent = 'NATURAL';
        if (!instant) { call(who, 'gold', 1700, 'No more cards'); snd.natural(); D.react('shock', 1200); D.say(pick(LINES.natural), 2000); flash(); }
        return;
      }
      if (instant) return;
      if (F.p.length === 2 && F.b.length === 2) call('Both stand', 'quiet', 1200, 'Player ' + pn + ' · Banker ' + bn);
      else if (F.p.length === 2) call('Player stands on ' + pn, 'quiet p', 1100);
    }

    /* ---------- the squeeze ---------- */
    let sqSeq = 0;
    function openSqueeze(e) {
      closeSqueeze(true);
      const codes = e.ids.map((id) => (id[0] === 'P' ? g.F.p : g.F.b)[+id[1]]);
      const who = squeezer(e.side);
      el.sq.innerHTML = '';
      const cards = codes.map((code, i) => {
        const n = ++sqSeq, cid = 'baccarat-sqc' + n;
        const wrap = h('div', { class: 'sq-card' });
        wrap.innerHTML = '<svg viewBox="-34 -34 168 208" aria-hidden="true"><defs><clipPath id="' + cid + '"><polygon points="0,0 100,0 100,140 0,140"/></clipPath></defs>' +
          '<g class="face">' + faceInner(code) + '</g><g clip-path="url(#' + cid + ')"><g class="back">' + BACK_INNER + '</g></g>' +
          '<polygon class="fs" points="" fill="rgba(10,0,20,.35)"/><polygon class="flap" points="" fill="url(#baccarat-flap)" stroke="#8f78a8" stroke-width=".6"/></svg>';
        const svg = wrap.firstChild;
        return { wrap, clip: svg.querySelector('clipPath polygon'), flap: svg.querySelector('.flap'), fs: svg.querySelector('.fs'), back: svg.querySelector('.back'), code, slow: codes.length === 1 || i === 1, st: -1, done: false };
      });
      el.sq.append(h('div', { class: 'sq-lbl ' + (e.side === 'P' ? 'p' : 'b') }, h('b', null, e.side === 'P' ? 'PLAYER' : 'BANKER'), h('i', { class: 'sq-tot' }, ''), (codes.length === 1 || who) ? h('small', null, [codes.length === 1 ? 'Third card' : '', who].filter(Boolean).join(' · ')) : null),
        h('div', { class: 'sq-cards n' + codes.length }, ...cards.map((c) => c.wrap)),
        h('div', { class: 'sq-hint' }, 'Tap to skip'));
      el.sq.className = 'vb-sq vb-abs on ' + (e.side === 'P' ? 'p' : 'b');
      g.sq = { e, cards, tot: el.sq.querySelector('.sq-tot') };
      e.flippedBy = true;
      const nxt = g.ev.find((x) => x.k === 'rev' && x.side === e.side && x.t === e.w[1]); if (nxt) nxt.flippedBy = true;
      light('sq'); D.say(pick(LINES.squeeze), 1500); D.react('peek', 1600);
      const c0 = centre(el.sq); D.look(c0.x, c0.y);
      snd.tension();
    }
    function squeezeFrame(tp) {
      const q = g.sq, w = q.e.w, U = Math.max(0, Math.min(1, (tp - w[0]) / (w[1] - w[0])));
      const n = q.cards.length;
      q.cards.forEach((c, i) => {
        let u = U;
        if (n === 2) u = i === 0 ? Math.min(1, U / 0.32) : Math.max(0, (U - 0.36) / 0.64);
        const [ang, frac, st] = peelAt(u, c.slow);
        if (st !== c.st) { c.st = st; if (st === 0 || st === 3 || st === 6) snd.peel(c.slow ? 0.6 : 0.35); else if (st === 1 || st === 4) snd.heart(); }
        if (frac >= 0.999) {
          if (!c.done) { c.done = true; c.back.parentNode.style.display = 'none'; c.flap.setAttribute('points', ''); c.fs.setAttribute('points', ''); c.wrap.classList.add('open'); snd.flip(); paintSqTotal(); }
          return;
        }
        if (frac <= 0.001) { c.clip.setAttribute('points', '0,0 100,0 100,140 0,140'); c.flap.setAttribute('points', ''); c.fs.setAttribute('points', ''); return; }
        const gm = peelGeom(ang, frac);
        c.clip.setAttribute('points', ptsStr(gm.cover));
        c.flap.setAttribute('points', ptsStr(gm.flap));
        c.fs.setAttribute('points', ptsStr(gm.flap.map((p) => [p[0] - gm.n[0] * 3 + 2, p[1] - gm.n[1] * 3 + 4])));
      });
    }
    function paintSqTotal() {
      const q = g.sq; if (!q) return;
      const side = q.e.side, bx = boxes[side];
      const known = bx.slots.filter((c) => c && !c.classList.contains('down')).map((c) => +c.dataset.c);
      const open = q.cards.filter((c) => c.done).map((c) => c.code);
      const all = known.concat(open);
      q.tot.textContent = all.length ? String(all.reduce((a, c) => a + M.val(c), 0) % 10) : '';
      q.tot.classList.remove('pop'); void q.tot.offsetWidth; q.tot.classList.add('pop');
    }
    function closeSqueeze(instant) {
      if (!g.sq) { el.sq.classList.remove('on'); return; }
      const q = g.sq; g.sq = null;
      for (const id of q.e.ids) flipUp(slotEl(id), false);
      paintTotals();
      if (instant || reduce) { el.sq.className = 'vb-sq vb-abs'; el.sq.innerHTML = ''; return; }
      el.sq.classList.add('out');
      S.timeout(() => { if (!g.sq) { el.sq.className = 'vb-sq vb-abs'; el.sq.innerHTML = ''; } }, 380);
      light(q.e.side);
    }
    function squeezer(side) {
      if (!live || !L.st || !L.st.squeeze) return '';
      const uid = L.st.squeeze[side]; if (!uid) return '';
      if (B.me && uid === B.me.id) return 'Your squeeze';
      const p = (L.st.bettors || []).find((x) => x.id === uid);
      return p ? 'Squeezed by ' + p.name : '';
    }

    /* ---------- the result and the payout ---------- */
    function onResult(instant) {
      const F = g.F;
      closeSqueeze(true);
      for (const s of ['P', 'B']) for (const c of boxes[s].slots) flipUp(c, false);
      paintTotals();
      const res = F.res;
      boxes.P.box.classList.add(res === 'P' ? 'win' : res === 'T' ? 'tie' : 'lose'); boxes.B.box.classList.add(res === 'B' ? 'win' : res === 'T' ? 'tie' : 'lose');
      const nat = F.p.length === 2 && F.b.length === 2 && Math.max(F.pn, F.bn) >= 8;
      const title = res === 'T' ? 'Tie' : (res === 'P' ? 'Player wins' : 'Banker wins');
      const sub = res === 'T' ? F.pt + ' all' : (res === 'P' ? F.pt + ' to ' + F.bt : F.bt + ' to ' + F.pt) + (nat ? ' · natural' : '');
      call(title, res === 'T' ? 'tie' : res === 'P' ? 'p' : 'b', 2200, sub);
      msg(title + ' · ' + sub, 'quiet');
      /* the winning spots light up */
      const lit = { P: res === 'P', B: res === 'B', T: res === 'T', PP: F.pp, BP: F.bp, PD: M.dragon(F, 'P') > 1, BD: M.dragon(F, 'B') > 1 };
      for (const k of M.SPOTS) spots[k].spot.classList.toggle('hot', !!lit[k]);
      if (res === 'T') { snd.tie(); D.say(pick(LINES.tie), 2000); D.react('shock', 1400); }
      else { snd.win(); D.say(pick(res === 'P' ? LINES.pwin : LINES.bwin), 1800); }
      if (F.pp || F.bp) S.timeout(() => { snd.pair(); call(F.pp && F.bp ? 'Both pairs!' : F.pp ? 'Player pair' : 'Banker pair', 'gold', 1500, 'pays 11 to 1'); }, T(1000));
      if (!live) { g.road.push({ r: res, pt: F.pt, bt: F.bt, pp: F.pp ? 1 : 0, bp: F.bp ? 1 : 0, nat: nat ? 1 : 0 }); paintRoads(); }
      const bets = clean(g.my), staked = sum(bets);
      const st = M.settle(bets, F);
      if (!live && staked) { B.wallet.win(ID, st.total, { silent: true }); if (dev) { dev.hands++; dev.staked += staked; dev.won += st.total; dev.last = { F, bets, win: st.total }; } }
      settleShow(bets, st, staked);
    }
    async function settleShow(bets, st, staked) {
      g.busy = true; controls();
      const hid = g.hid;
      await S.sleep(T(900)); if (g.dead) return;
      const keys = Object.keys(bets), lose = [], win = [];
      for (const k of keys) {
        const w = st.by[k] || 0, sp = spots[k];
        if (w === 0) { lose.push(k); sp.spot.classList.add('lost'); }
        else if (w === bets[k]) { sp.spot.classList.add('push'); sp.res.textContent = 'PUSH'; sp.res.classList.add('on'); }
        else { win.push(k); sp.spot.classList.add('won'); sp.res.textContent = '+' + fmt(w - bets[k]); sp.res.classList.add('on'); }
      }
      /* other players' losing chips go too */
      const olose = M.SPOTS.filter((k) => spots[k].ost.childElementCount && !spots[k].spot.classList.contains('hot')).map((k) => spots[k].ost);
      await collect(lose.map((k) => spots[k].stack).concat(olose));
      if (g.dead) return;
      for (const k of win) { await payTo(spots[k], st.by[k] - bets[k], 480); if (g.dead) return; }
      const dB = bets.PD ? M.dragon(g.F, 'P') : 0, dP = bets.BD ? M.dragon(g.F, 'B') : 0, top = Math.max(dB, dP);
      if (top >= 7) dragonShow(top - 1);
      if (staked && st.total > staked) { D.react('happy', 1600); D.say(pick(LINES.youwin), 1800); await winPlaque(st.total, staked); }
      else if (staked && st.total === 0) D.react('wink', 1200);
      if (g.dead) return;
      await toPlayer(keys.filter((k) => (st.by[k] || 0) > 0));
      if (g.dead) return;
      for (const k of keys) { spots[k].stack.innerHTML = ''; spots[k].pay.innerHTML = ''; spots[k].pay.classList.remove('on'); spots[k].n = 0; spots[k].amt.textContent = ''; spots[k].spot.classList.remove('has'); }
      if (staked) {
        if (live) await waitSettled(hid);
        g.lastWin = st.total; B.ui.countUp(el.win, 0, st.total, 600);
        if (st.total > staked) { room.classList.remove('glow'); void room.offsetWidth; room.classList.add('glow'); }
        await B.ui.celebrate({ amount: st.total, bet: staked });
        if (g.dead) return;
      }
      B.wallet.sync();
      el.total.textContent = '0';
      g.busy = false;
      if (live) { g.phase = 'rest'; msg('Next hand in a moment…', 'quiet'); }
      else { g.phase = 'bet'; g.bets = {}; g.undo = []; msg('Place your bets'); S.timeout(() => { if (g.phase === 'bet' && !g.busy && !sum(g.bets)) D.say(pick(LINES.bets), 2200); }, 1200); }
      controls(); light('table'); D.lookHome();
    }
    async function waitSettled(hid) {
      for (let i = 0; i < 40 && !L.settled[hid] && !g.dead; i++) { if (i % 4 === 3) poll(); await S.sleep(200); }
    }
    async function winPlaque(win, staked) {
      const x = win / Math.max(1, staked), tier = x >= 8 ? 'mega' : x >= 2.5 ? 'big' : '';
      el.winPl.className = 'vb-winpl vb-abs ' + tier; el.winPl.innerHTML = '<small>' + (tier === 'mega' ? 'Superb win' : tier === 'big' ? 'Big win' : 'You win') + '</small><b>0</b><i></i>';
      void el.winPl.offsetWidth; el.winPl.classList.add('on');
      B.fx.burst({ el: el.winPl, kind: x >= 2.5 ? 'confetti' : 'coin', count: x >= 2.5 ? 60 : 26, power: 0.9 });
      const tick = S.interval(() => snd.tick(), 70);
      await B.ui.countUp(el.winPl.querySelector('b'), 0, win, T(900));
      S.clear(tick); B.sfx('coin');
      await S.sleep(T(800));
      el.winPl.classList.remove('on');
    }
    function dragonShow(odds) {
      snd.dragon(); flash();
      let swarm = ''; for (let i = 0; i < 14; i++) { const a = (i / 14) * 360 + (i % 3) * 7; swarm += '<i style="--a:' + a + 'deg;--d:' + (170 + (i % 5) * 55) + 'px;--t:' + (0.9 + (i % 4) * 0.2) + 's"><svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg></i>'; }
      el.banner.innerHTML = '<div><svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg><b>DRAGON BONUS</b><span>pays ' + odds + ' to 1</span></div>' + swarm;
      el.banner.classList.remove('on'); void el.banner.offsetWidth; el.banner.classList.add('on');
      B.fx.burst({ el: el.banner, kind: 'spark', count: 60, colors: ['#f3d98b', '#c99a35', '#ffffff', '#b37bff'], power: 1.3 });
      D.say(pick(LINES.dragon), 2200);
      S.timeout(() => el.banner.classList.remove('on'), 2800);
    }
    function flash() { room.classList.remove('flash'); void room.offsetWidth; room.classList.add('flash'); S.timeout(() => room.classList.remove('flash'), 1200); }

    /* ---------- a new shoe ---------- */
    async function shuffleShow(burn, secs) {
      if (g.dead) return;
      const ms = Math.max(1200, secs * 1000);
      call('New shoe', 'gold', 1600, 'Eight decks, shuffled and cut'); D.say(pick(LINES.shuffle), 2400); snd.riffle();
      el.deck.classList.add('on'); light('table');
      const c = centre(el.deck);
      D.reach('l', [{ x: c.x - 30, y: c.y, at: 0.3 }, { x: c.x, y: c.y, at: 0.7 }], T(1400)); D.reach('r', [{ x: c.x + 30, y: c.y, at: 0.3 }, { x: c.x, y: c.y, at: 0.7 }], T(1400));
      S.timeout(snd.riffle, 900); S.timeout(snd.riffle, 1800);
      pileN = 0; discard.style.setProperty('--pile', 0);
      await S.sleep(Math.min(ms * 0.55, 3800)); if (g.dead) return;
      el.deck.classList.remove('on');
      if (burn != null && burn >= 0) {
        const n = M.val(burn) || 10;
        const bc = makeCard(burn); bc.classList.add('burn');
        el.burn.textContent = ''; el.burn.append(bc);
        flyCard(bc, T(420)); S.timeout(() => flipUp(bc, true), T(450));
        call('Burn card ' + RANKS[burn % 13], 'quiet', 1800, n + ' card' + (n > 1 ? 's' : '') + ' burned');
        await S.sleep(Math.min(ms * 0.35, 1800)); if (g.dead) return;
        const dr = centre(discard), r = centre(bc), kk = r.w / (bc.offsetWidth || 1) || 1;
        if (!reduce) await bc.animate([{ opacity: 1 }, { transform: 'translate(' + ((dr.x - r.x) / kk) + 'px,' + ((dr.y - r.y) / kk) + 'px) rotate(90deg) scale(.6)', opacity: 0 }], { duration: T(450), fill: 'forwards' }).finished.catch(() => {});
        bc.remove(); pileN = (n + 1) / 80; discard.style.setProperty('--pile', pileN.toFixed(3));
      }
    }

    /* ---------- the roads ---------- */
    function results() { return live ? ((L.st && L.st.road) || []).map((x) => ({ r: x[0], pt: x[1], bt: x[2], pp: x[3], bp: x[4], nat: x[5] })) : g.road; }
    function paintRoads(askSide) {
      if (!el.rd.big) return;
      const res = results(), R = roadsOf(res), ask = askSide ? askRoad(res, askSide) : null;
      for (const [k, kind] of [['bead', 'bead'], ['big', 'big'], ['eye', 'eye'], ['small', 'small'], ['roach', 'roach']]) {
        const box = el.rd[k], w = box.clientWidth, hh = box.clientHeight;
        if (!w || !hh) { box.innerHTML = ''; continue; }
        box.innerHTML = roadSvg(kind, R, w, hh, kind === 'bead' || kind === 'big' ? askSide : ask);
      }
      const n = { P: 0, B: 0, T: 0, pp: 0, bp: 0 }; for (const e of res) { n[e.r]++; if (e.pp) n.pp++; if (e.bp) n.bp++; }
      const hd = live && L.st ? L.st.hand : null, left = hd ? hd.left : g.shoe ? M.SHOE_N - g.shoe.pos : M.SHOE_N;
      el.rdStats.innerHTML = '<span class="b"><i>B</i>' + n.B + '</span><span class="p"><i>P</i>' + n.P + '</span><span class="t"><i>T</i>' + n.T + '</span><span class="pr"><i></i>' + n.bp + '<i class="pb"></i>' + n.pp + '</span><span class="no">Hand ' + (hd ? hd.no : res.length + (g.phase === 'result' ? 0 : 1)) + ' · ' + left + ' cards</span>';
      shoe.querySelector('.vb-left').textContent = left;
      el.askB.classList.toggle('on', askSide === 'B'); el.askP.classList.toggle('on', askSide === 'P');
    }

    /* ================= PRACTICE ================= */
    function forced() {
      const f = dev && dev.force; if (dev) dev.force = null;
      const want = {
        natural: (x) => x.p.length === 2 && x.b.length === 2 && Math.max(x.pn, x.bn) >= 8, tie: (x) => x.res === 'T', pair: (x) => x.pp || x.bp, ppair: (x) => x.pp, bpair: (x) => x.bp, pairs: (x) => x.pp && x.bp,
        third: (x) => x.p.length === 3 && x.b.length === 3, pthird: (x) => x.p.length === 3 && x.b.length === 2, bthird: (x) => x.p.length === 2 && x.b.length === 3,
        dragon: (x) => M.dragon(x, 'P') >= 11 || M.dragon(x, 'B') >= 11, player: (x) => x.res === 'P', banker: (x) => x.res === 'B',
      }[f];
      if (!want) return null;
      for (let n = 0; n < 40000; n++) { const s = M.newShoe(B.rng), x = M.deal(s.cards, s.pos); if (want(x)) { s.pos = x.pos; return { shoe: s, x }; } }
      return null;
    }
    async function deal() {
      if (live || g.phase !== 'bet' || g.busy) return;
      if (!sum(g.bets) && !rebet()) return;
      const bets = clean(g.bets), err = M.check(bets);
      if (err) { B.ui.toast(err); return; }
      const cost = sum(bets);
      if (!B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      mem.last = bets; saveMem();
      g.my = bets; g.busy = true; g.phase = 'deal'; controls();
      D.say(pick(LINES.nomore), 1200); snd.bell();
      const kept = Object.assign({}, bets);
      await sweep(); if (g.dead) return;
      g.bets = kept; paintBets();
      let F;
      const fz = forced();
      if (fz) { g.shoe = fz.shoe; g.road = []; F = fz.x; }
      else {
        if (!g.shoe || g.shoe.pos >= g.shoe.cut || (dev && dev.shuffle)) {
          if (dev) dev.shuffle = false; g.shoe = M.newShoe(B.rng); g.road = []; paintRoads(); g.phase = 'shuffle'; controls(); msg('A new shoe: shuffling…', 'quiet'); await shuffleShow(g.shoe.burn, 4.2); if (g.dead) return; }
        F = M.deal(g.shoe.cards, g.shoe.pos); g.shoe.pos = F.pos;
      }
      g.hid++;
      g.busy = false; g.t = -0.1;
      startScript(M.facts(F.p, F.b));
      paintRoads();
    }

    /* ================= LIVE ================= */
    let sendT = 0;
    function queueSend() { if (!live || g.phase !== 'bet') return; L.dirty = true; S.clear(sendT); sendT = S.timeout(sendBets, 220); }
    async function sendBets() {
      if (L.sending || !L.dirty || !g.hid) return;
      L.sending = true; L.dirty = false;
      const hid = g.hid, bets = clean(g.bets);
      const r = await B.play(ID, 'bet', { hand: hid, bets }, 0);
      L.sending = false; if (g.dead) return;
      if (r && r.hand === g.hid) {
        L.confirmed = r.total; L.mine = clean(r.mine);
        if (r.total > 0) { mem.last = L.mine; saveMem(); }
      } else if (!r && g.hid === hid) { g.bets = Object.assign({}, L.mine); paintBets(); }
      B.wallet.sync(); controls();
      if (L.dirty && g.phase === 'bet') sendBets();
    }
    async function poll() {
      if (L.polling || g.dead) return;
      L.polling = true; L.next = nowS() + 1;
      const t0 = Date.now(); let r;
      try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); }
      catch (e) { L.polling = false; if (e && e.status === 403) showLock(e.message); return; }
      const t1 = Date.now(); L.polling = false; if (g.dead) return;
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (L.off == null || rtt <= L.best * 1.25 || ++L.age > 40) { L.off = off; L.best = rtt; L.age = 0; }
      for (const s of r.settled || []) L.settled[s.hand] = s;
      L.st = r;
      const hd = r.hand, now = nowS();
      /* the next moment worth asking about: the cards at the close, the payout at the result, the new hand after the rest */
      const keys = [hd.openAt, hd.closeAt + 0.05, hd.resultAt ? hd.resultAt + 0.12 : 0, hd.resultAt ? hd.resultAt + M.T.REST + 0.05 : 0].filter((x) => x > now);
      L.next = Math.min(now + (hd.p ? 1.6 : 1), keys.length ? Math.min.apply(null, keys) : 1e12);
      paintRail(); paintOthers();
      const rk = JSON.stringify(r.road); if (rk !== L.roadKey) { L.roadKey = rk; paintRoads(); }
    }
    function paintRail() {
      const r = L.st; if (!r) return;
      el.count.innerHTML = '<i></i>' + r.players + ' at the table';
      const key = JSON.stringify(r.bettors.map((p) => [p.id, p.total]));
      if (key !== L.bettorsKey) {
        L.bettorsKey = key;
        el.rail.innerHTML = '<h4>At the table · ' + r.players + '</h4>' + (r.bettors.length ? '' : '<p>No bets on this hand yet.</p>') +
          r.bettors.slice(0, 8).map((p) => { const me = B.me && p.id === B.me.id; return '<div class="it' + (me ? ' me' : '') + '"><span class="av">' + B.avatar(p.avatar, 22) + '</span><b>' + (me ? 'You' : esc(p.name)) + '</b><span class="bt">' + fmt(p.total) + '</span><span class="st">' + Object.keys(p.bets || {}).map((k) => SPOT_NAME[k]).join(' · ') + '</span></div>'; }).join('');
      } else el.rail.querySelector('h4').textContent = 'At the table · ' + r.players;
      const wk = r.winHand + ':' + r.winners.length;
      if (wk !== L.winKey) {
        L.winKey = wk;
        el.wins.innerHTML = r.winners.length ? '<h4>Last hand\'s winners</h4>' + r.winners.slice(0, 5).map((w) => '<div class="it"><span class="av">' + B.avatar(w.avatar, 20) + '</span><b>' + (B.me && w.id === B.me.id ? 'You' : esc(w.name)) + '</b><span class="bt">+' + fmt(w.net) + '</span></div>').join('') : '';
      }
    }
    function paintTimer(left, span, label) {
      if (left == null || left <= 0) { el.timer.hidden = true; el.tbar.classList.remove('on'); return; }
      const f = Math.max(0, Math.min(1, left / span));
      el.timer.hidden = false;
      el.timer.querySelector('.v').style.strokeDashoffset = String(119.4 * (1 - f));
      el.timer.querySelector('b').textContent = String(Math.ceil(left));
      el.timer.querySelector('small').textContent = label;
      el.timer.classList.toggle('hot', left <= 4);
      el.tbar.classList.add('on'); el.tbar.classList.toggle('hot', left <= 4); el.tbar.firstChild.style.transform = 'scaleX(' + f.toFixed(4) + ')';
      if (left <= 4.05 && Math.ceil(left) !== L.lastTick) { L.lastTick = Math.ceil(left); snd.tick(); }
    }
    async function startHand(hd) {
      g.sweeping = true;
      await sweep(); if (g.dead) return;
      g.hid = hd.id; g.F = null; g.tl = null; g.ev = null; g.skip = false; g.undo = []; g.my = {};
      const mine = clean(L.st && L.st.hand.id === hd.id ? L.st.mine : {});
      g.bets = Object.assign({}, mine); L.mine = mine; L.confirmed = sum(mine); L.dirty = false;
      L.shuffled = false; L.closedCall = false; L.lastTick = 0;
      paintBets(); paintOthers();
      const now = nowS();
      if (hd.shuffle && now < hd.openAt) { g.phase = 'shuffle'; L.shuffled = true; controls(); shuffleShow(hd.burn, hd.openAt - now); msg('A new shoe: shuffling…', 'quiet'); }
      else if (now < hd.closeAt) { g.phase = 'bet'; controls(); call('Place your bets', 'gold', 1400); D.say(pick(LINES.bets), 2200); msg('Place your bets', ''); light('table'); }
      else { g.phase = 'closing'; controls(); msg('Hand in play: you are watching this one', 'quiet'); }
      paintRoads();
    }
    function liveTick() {
      const r = L.st; if (!r || L.off == null) return;
      const now = nowS();
      if (!L.polling && now >= L.next) poll();
      const hd = r.hand;
      if (hd.id !== g.hid) { if (!g.busy && !g.sweeping) startHand(hd); return; }
      if (g.sweeping) return;
      if (now < hd.openAt) { paintTimer(null); if (g.phase !== 'shuffle') { g.phase = 'shuffle'; controls(); } return; }
      if (now < hd.closeAt) {
        if (g.phase === 'shuffle' || g.phase === 'idle' || g.phase === 'rest') { g.phase = 'bet'; controls(); call('Place your bets', 'gold', 1400); D.say(pick(LINES.bets), 2200); msg('Place your bets', ''); light('table'); }
        paintTimer(hd.closeAt - now, M.T.BET, 'Bets close');
        if (hd.closeAt - now < 0.3 && g.phase === 'bet') { g.phase = 'closing'; S.clear(sendT); if (L.dirty && !L.sending) sendBets(); controls(); }
        return;
      }
      paintTimer(null);
      if (g.phase === 'bet' || (g.phase === 'closing' && !L.closedCall)) {
        if (!L.closedCall) { L.closedCall = true; if (now - hd.closeAt < 1.5) { call('No more bets', 'bad', 1200); snd.bell(); D.say(pick(LINES.nomore), 1400); } }
        g.phase = 'closing'; controls();
      }
      if (!hd.p) return;
      if (!g.F) {
        /* the server's record of my chips is the truth from here on */
        g.my = clean(r.mine); g.bets = Object.assign({}, g.my); L.confirmed = sum(g.my); paintBets();
        if (sum(g.my)) { mem.last = g.my; saveMem(); }
        startScript(M.facts(hd.p, hd.b));
        if (hd.last && now - hd.closeAt < 2) { D.say(pick(LINES.last), 2200); }
      }
      g.t = now - hd.closeAt;
      if (g.phase === 'play') present(g.t);
    }
    function startLive() {
      g.phase = 'idle'; controls(); msg('Taking a seat at the velvet table…', 'quiet');
      poll();
    }

    /* ---------- the frame loop ---------- */
    S.loop((dt) => {
      if (g.dead) return;
      if (live) liveTick();
      else if (g.phase === 'play') { g.t += dt * (mem.turbo ? 1.9 : 1); present(g.t); }
    });

    /* ---------- keyboard and taps ---------- */
    S.on(document, 'keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      if (document.querySelector('.bc-veil,.bc-win')) return;
      const k = e.key.toLowerCase();
      if (k === 't') { el.turbo.click(); return; }
      if (g.phase === 'play' && (k === ' ' || k === 's' || k === 'enter')) { e.preventDefault(); doSkip(); return; }
      if (g.phase !== 'bet') return;
      if (k >= '1' && k <= '7') { mem.chip = +k - 1; saveMem(); snd.chip(); paintChips(); return; }
      const map = { u: undo, c: clearBets, x: doubleBets, r: rebet, ' ': deal, enter: deal };
      if (map[k]) { e.preventDefault(); B.audio.ensure(); map[k](); }
    });
    S.on(view, 'pointerdown', (e) => { if (g.phase === 'play' && !e.target.closest('.vb-spot')) doSkip(); });

    /* ---------- ambience ---------- */
    S.interval(() => { if (!reduce && Math.random() < 0.7) D.twitch(); }, 3300);
    S.interval(() => { if (g.phase === 'bet' && !g.busy && !live && Math.random() < 0.3) D.say(pick(LINES.idle), 2200); }, 17000);

    /* ---------- start ---------- */
    layout();
    paintChips(); paintBets(); controls(); light('table');
    if (live) startLive();
    else {
      g.shoe = M.newShoe(B.rng); g.phase = 'bet'; controls(); paintRoads();
      S.timeout(() => { if (g.phase === 'bet' && !g.busy) { D.say(pick(LINES.bets), 2400); call('Place your bets', 'gold', 1400); } }, 700);
    }
    g.destroy = () => {
      g.dead = true; ro.disconnect();
      /* practice: a hand already dealt is paid now */
      if (!live && g.phase === 'play' && g.F && sum(g.my)) B.wallet.win(ID, M.settle(clean(g.my), g.F).total, { silent: true });
      if (dev && window.__baccaratDev === dev) delete window.__baccaratDev;
    };
    return g;
  }

  B.registerGame({
    id: ID,
    name: 'Velvet Baccarat',
    tagline: 'The High Roller salon. Live Punto Banco with the squeeze, the roads and a Dragon Bonus',
    tag: 'Live baccarat',
    section: 'highroller', minLevel: M.MIN_LEVEL, isNew: true,
    poster: poster(),
    rules,
    mount(root) { mount(root); },
    unmount() { if (G && G.destroy) G.destroy(); G = null; if (S) S.dispose(); S = null; },
  });
})();
