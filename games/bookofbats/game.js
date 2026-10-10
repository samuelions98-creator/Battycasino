/* ===== bookofbats math ===== */
/* Book of Bats: pure maths. No DOM. Shared verbatim by the browser game, tools/bookofbats-sim.js and tools/bookofbats-xcheck.js,
   and ported line for line to lib/games/bookofbats.php (proved identical by tools/bookofbats-xcheck.js).

   THE REELS   5 reels x 3 rows on real reel strips (STRIPS.base in the base game, STRIPS.fs in free spins). A spin stops each
               reel at a uniformly random strip position; the 3 visible symbols are that position and the next two.
   LINES       10 lines, of which the player plays the first 1 to 10. The stake is the TOTAL stake (from the ladder); the line
               bet is stake / lines. Line wins pay left to right from reel 1.
   THE BOOK    Wild (stands in for every symbol on a line) and scatter (pays anywhere, x total stake). 3+ Books award
               10 free spins.
   FREE SPINS  Before they start, the Book picks a SPECIAL EXPANDING SYMBOL (any of the 9 pay symbols, equally likely).
               After each free spin's normal line wins are paid, if the special symbol shows on enough reels to pay
               (2 reels for the four picture symbols, 3 for the letters) it EXPANDS to fill those reels and pays
               PAY[symbol][reels] on every played line, adjacent or not.
               RETRIGGER: 3+ Books in free spins add 10 spins AND the Book picks an EXTRA special symbol (a different one),
               up to 3 specials at once. Each special expands and pays on its own.
   MAX WIN     5,000x the total stake per round (spin + free spins). The round ends the moment it is reached.
   AMOUNTS     In LINE UNITS (multiples of the line bet). Win in BB = floor(units * stake / lines).
   GAMBLE      After a win, the player may gamble it on a face-down card: red/black doubles it, the suit quadruples it.
               The card is drawn AFTER the choice (on the server, online). The gamble is fair (return 100%), so it does not
               change the game's return. Limits: at most GAMBLE_STEPS gambles per win, and a gamble is offered only while
               its possible prize stays within GAMBLE_LIMIT_X x stake. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).bookofbats = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REELS = 5, ROWS = 3, NLINES = 10, MAX_WIN_X = 5000;
  const FS_AWARD = 10, MAX_SPECIALS = 3;
  const GAMBLE_STEPS = 5, GAMBLE_LIMIT_X = 500;

  /* symbols */
  const TEN = 0, JACK = 1, QUEEN = 2, KING = 3, ACE = 4, SCARAB = 5, ANKH = 6, PHARAOH = 7, INDY = 8, BOOK = 9, NSYM = 10;
  const KEYS = ['ten', 'jack', 'queen', 'king', 'ace', 'scarab', 'ankh', 'pharaoh', 'indy', 'book'];
  const NAMES = ['10', 'J', 'Q', 'K', 'A', 'Scarab', 'Ankh-Bat', 'Pharaoh Bat Queen', 'Indiana Bats', 'Book of Bats'];
  /* PAY[symbol][count] in line-bet multiples (count 0..5) */
  const PAY = [
    [0, 0, 0, 5, 25, 100],
    [0, 0, 0, 5, 25, 100],
    [0, 0, 0, 5, 25, 100],
    [0, 0, 0, 5, 40, 150],
    [0, 0, 0, 5, 40, 150],
    [0, 0, 5, 30, 100, 750],
    [0, 0, 5, 40, 150, 1000],
    [0, 0, 5, 50, 400, 2000],
    [0, 0, 10, 100, 1000, 5000],
  ];
  /* Book scatter pays, x TOTAL stake, by number of Books anywhere */
  const SCAT = [0, 0, 0, 2, 20, 200];
  /* reels a special symbol must show on before it expands (= its smallest paying count) */
  const MINEXP = [3, 3, 3, 3, 3, 2, 2, 2, 2];
  /* the Book's choice of special symbol: equal weights */
  const SPECIAL_W = [1, 1, 1, 1, 1, 1, 1, 1, 1];
  /* rows used by each line, reel by reel (0 = top) */
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 2, 1, 0, 1],
  ];
  /* reel strips (tuned with an exact calculation; see tools/bookofbats-sim.js --exact). No symbol twice in a row, no two
     Books within one window (so a reel shows at most one Book), no picture symbol twice in one window. */
  const STRIPS = {
    base: [
      [3, 0, 7, 4, 6, 2, 9, 6, 1, 3, 2, 6, 2, 0, 4, 1, 0, 3, 0, 2, 3, 4, 1, 4, 1, 5, 8, 3, 0, 1, 0, 1],
      [0, 4, 2, 1, 7, 4, 1, 7, 3, 0, 4, 0, 4, 0, 6, 1, 3, 1, 2, 0, 2, 9, 8, 0, 2, 3, 2, 1, 5, 3, 4, 3, 1, 4, 1],
      [4, 1, 2, 3, 0, 5, 4, 2, 0, 1, 4, 1, 5, 1, 3, 2, 5, 0, 2, 1, 3, 0, 7, 6, 4, 8, 9, 4, 6, 5, 4, 2, 8, 1, 0, 1, 4, 3],
      [3, 4, 1, 3, 4, 1, 2, 1, 0, 2, 7, 0, 3, 1, 0, 4, 1, 6, 1, 4, 8, 2, 0, 2, 1, 5, 2, 9, 0, 3, 6, 0, 3, 0, 5, 6],
      [1, 2, 1, 3, 0, 3, 4, 2, 5, 6, 1, 2, 0, 7, 3, 0, 6, 3, 1, 4, 9, 0, 4, 3, 2, 0, 5, 1, 7, 4, 8, 0, 1, 2, 3, 2],
    ],
    fs: [
      [3, 4, 5, 0, 1, 2, 1, 4, 1, 2, 0, 9, 4, 3, 2, 0, 4, 0, 6, 1, 7, 6, 5, 2, 7, 8, 3, 1, 6, 1, 0, 3, 4, 8],
      [4, 3, 2, 0, 2, 3, 2, 1, 5, 3, 1, 2, 4, 1, 7, 5, 3, 2, 4, 1, 2, 6, 8, 0, 1, 3, 9, 7, 6, 0, 4, 0],
      [1, 2, 7, 1, 3, 4, 5, 0, 4, 3, 4, 0, 1, 3, 2, 0, 5, 2, 8, 4, 7, 4, 3, 9, 6, 2, 4, 0, 1, 3, 0, 6, 5, 2],
      [2, 4, 1, 2, 4, 6, 7, 5, 4, 3, 1, 2, 1, 9, 5, 1, 7, 1, 0, 4, 0, 4, 3, 1, 0, 5, 0, 4, 0, 2, 8, 6, 3, 0],
      [1, 4, 1, 3, 6, 2, 5, 3, 2, 3, 5, 8, 1, 5, 2, 0, 3, 1, 2, 0, 1, 8, 3, 6, 7, 2, 0, 4, 3, 6, 7, 0, 9, 4, 5],
    ],
  };

  /* ---------- helpers ---------- */
  function pickIndex(rng, w) {
    let total = 0; for (let i = 0; i < w.length; i++) total += w[i];
    let r = rng() * total;
    for (let i = 0; i < w.length; i++) { if (w[i] <= 0) continue; r -= w[i]; if (r < 0) return i; }
    for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return i;
    return 0;
  }
  /* the Book picks a special symbol it has not already picked */
  function pickSpecial(rng, have) {
    const w = SPECIAL_W.slice();
    for (let i = 0; i < have.length; i++) w[have[i]] = 0;
    return pickIndex(rng, w);
  }
  /* visible grid: grid[reel][row] */
  function windowOf(set, stops) {
    const S = STRIPS[set], g = [];
    for (let r = 0; r < REELS; r++) { const st = S[r], L = st.length; g.push([st[stops[r] % L], st[(stops[r] + 1) % L], st[(stops[r] + 2) % L]]); }
    return g;
  }
  function drawStops(rng, set) {
    const S = STRIPS[set], stops = [];
    for (let r = 0; r < REELS; r++) stops.push(Math.floor(rng() * S[r].length));
    return stops;
  }
  /* line wins on the played lines: [{l, s, n, pay}] with pay in line units */
  function evalLines(g, lines) {
    const wins = []; let pay = 0;
    for (let l = 0; l < lines; l++) {
      const ln = LINES[l];
      let w = 0; while (w < REELS && g[w][ln[w]] === BOOK) w++;
      if (w === REELS) continue;
      const sym = g[w][ln[w]];
      let n = w + 1; while (n < REELS && (g[n][ln[n]] === sym || g[n][ln[n]] === BOOK)) n++;
      const p = PAY[sym][n];
      if (p > 0) { wins.push({ l: l, s: sym, n: n, pay: p }); pay += p; }
    }
    return { wins: wins, pay: pay };
  }
  function booksOf(g) {
    const cells = [];
    for (let r = 0; r < REELS; r++) for (let row = 0; row < ROWS; row++) if (g[r][row] === BOOK) cells.push([r, row]);
    return cells;
  }
  /* a special symbol expands on every reel that shows it, if that is enough reels to pay */
  function expansion(g, s, lines) {
    const reels = [];
    for (let r = 0; r < REELS; r++) if (g[r][0] === s || g[r][1] === s || g[r][2] === s) reels.push(r);
    if (reels.length < MINEXP[s]) return null;
    return { s: s, reels: reels, n: reels.length, pay: PAY[s][reels.length] * lines };
  }

  /* ---------- a round ----------
     spin(rng, lines) -> {lines, base:{stops, grid, wins, books, scat, pay}, fs: null | {specials, spins:[...], pay}, total, capped}
     Every pay is in line units; total is the round's win in line units (capped at MAX_WIN_X * lines). */
  function spin(rng, lines) {
    const cap = MAX_WIN_X * lines;
    const stops = drawStops(rng, 'base'), grid = windowOf('base', stops);
    const ev = evalLines(grid, lines), books = booksOf(grid);
    const scat = SCAT[books.length] * lines;
    let pay = ev.pay + scat, capped = false;
    if (pay >= cap) { pay = cap; capped = true; }
    const base = { stops: stops, grid: grid, wins: ev.wins, books: books, scat: scat, pay: pay };
    let total = pay, fs = null;
    if (books.length >= 3 && !capped) {
      const specials = [pickSpecial(rng, [])];
      const spins = []; let left = FS_AWARD, fsPay = 0, played = 0, retriggers = 0;
      while (left > 0 && !capped) {
        left--; played++;
        const st = drawStops(rng, 'fs'), g = windowOf('fs', st);
        const e = evalLines(g, lines), bk = booksOf(g);
        const sc = SCAT[bk.length] * lines;
        const using = specials.slice();
        const exp = [];
        let p = e.pay + sc;
        for (let i = 0; i < using.length; i++) { const x = expansion(g, using[i], lines); if (x) { exp.push(x); p += x.pay; } }
        let retrig = false, newSpecial = -1;
        if (bk.length >= 3) {
          retrig = true; retriggers++; left += FS_AWARD;
          if (specials.length < MAX_SPECIALS) { newSpecial = pickSpecial(rng, specials); specials.push(newSpecial); }
        }
        if (total + p >= cap) { p = cap - total; capped = true; }
        total += p; fsPay += p;
        spins.push({ stops: st, grid: g, wins: e.wins, books: bk, scat: sc, specials: using, exp: exp, retrig: retrig, newSpecial: newSpecial, pay: p, total: total, left: capped ? 0 : left });
      }
      fs = { specials: specials, first: specials[0], spins: spins, pay: fsPay, played: played, retriggers: retriggers };
    }
    return { lines: lines, base: base, fs: fs, total: total, capped: capped };
  }
  /* round win in BB */
  const winBB = (units, stake, lines) => Math.floor(units * stake / lines);

  /* ---------- gamble ----------
     A card is 0..51: suit = floor(card / 13) (0 hearts, 1 diamonds, 2 clubs, 3 spades), rank = card % 13 (0 = 2 ... 12 = ace).
     choice: 'red' | 'black' (x2) or 'hearts' | 'diamonds' | 'clubs' | 'spades' (x4). */
  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const CHOICES = ['red', 'black', 'hearts', 'diamonds', 'clubs', 'spades'];
  const gambleMult = (choice) => (choice === 'red' || choice === 'black' ? 2 : 4);
  /* may this amount be gambled with this choice, at this step? */
  function gambleAllowed(amount, stake, steps, choice) {
    if (!(amount > 0) || steps >= GAMBLE_STEPS) return false;
    return amount * gambleMult(choice) <= GAMBLE_LIMIT_X * stake;
  }
  function gambleResolve(card, choice) {
    const suit = Math.floor(card / 13), red = suit < 2;
    if (choice === 'red') return red;
    if (choice === 'black') return !red;
    return SUITS[suit] === choice;
  }
  const drawCard = (rng) => Math.floor(rng() * 52);

  return {
    REELS: REELS, ROWS: ROWS, NLINES: NLINES, MAX_WIN_X: MAX_WIN_X, FS_AWARD: FS_AWARD, MAX_SPECIALS: MAX_SPECIALS,
    GAMBLE_STEPS: GAMBLE_STEPS, GAMBLE_LIMIT_X: GAMBLE_LIMIT_X,
    SYM: { TEN: TEN, JACK: JACK, QUEEN: QUEEN, KING: KING, ACE: ACE, SCARAB: SCARAB, ANKH: ANKH, PHARAOH: PHARAOH, INDY: INDY, BOOK: BOOK }, NSYM: NSYM,
    KEYS: KEYS, NAMES: NAMES, PAY: PAY, SCAT: SCAT, MINEXP: MINEXP, SPECIAL_W: SPECIAL_W, LINES: LINES, STRIPS: STRIPS,
    SUITS: SUITS, CHOICES: CHOICES,
    pickIndex: pickIndex, pickSpecial: pickSpecial, windowOf: windowOf, evalLines: evalLines, booksOf: booksOf, expansion: expansion,
    spin: spin, winBB: winBB, gambleMult: gambleMult, gambleAllowed: gambleAllowed, gambleResolve: gambleResolve, drawCard: drawCard,
  };
});

/* ===== bookofbats ===== */
/* Book of Bats: the presentation. Every outcome comes from the maths above: practice mode runs it here with B.rng, online
   mode asks lib/games/bookofbats.php, which runs the same code and draws the gamble card on the server after the choice.
   Layout: .bob-bg (crypt, moon window, torches, fog, bats) | .bob-main = title, free-spins HUD, stage box (the frame with
   reels, line markers, win lines, expanding columns and banner; the overlay for the Book, the gamble and the summary),
   message bar, controls. */
(function () {
  'use strict';
  const B = Batty, h = B.h, M = BattyMath.bookofbats, ID = 'bookofbats';
  const fmt = B.fmt, REELS = 5, ROWS = 3, CELLN = 5, STEP = 100 / CELLN, BOOK = M.SYM.BOOK;
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const LCOL = ['#ffd451', '#ff5a6e', '#4ad8ff', '#7dff8a', '#ff9a3c', '#d78bff', '#ff6ad5', '#5affd9', '#fff07a', '#8ab4ff'];
  const SUITS = M.SUITS, SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SHORT = ['10', 'J', 'Q', 'K', 'A', 'Scarab', 'Ankh-Bat', 'Bat Queen', 'Indiana Bats', 'Book'];
  let G = null;
  const pref = (k, d) => { try { const v = localStorage.getItem('bob-' + k); return v == null ? d : v; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('bob-' + k, String(v)); } catch (e) { /* storage is optional */ } };

  /* ---------- sound: crypt drones, harp arpeggios, a temple gong; all synthesised ---------- */
  const au = B.audio;
  const EG = [329.6, 349.2, 415.3, 440, 493.9, 523.3, 587.3, 659.3, 698.5, 830.6, 880, 987.8, 1046.5]; // E Phrygian dominant
  const SND = {
    spin() { au.noise({ d: 0.45, v: 0.06, lp: 600, f2: 2400 }); },
    stop(i) { au.tone({ f: 120 + i * 12, f2: 52, d: 0.14, type: 'sine', v: 0.32 }); au.noise({ d: 0.06, v: 0.05, lp: 1500 }); },
    book(k) { au.tone({ f: EG[3 + k * 2], d: 0.6, type: 'triangle', v: 0.15 }); au.tone({ f: EG[3 + k * 2] * 2, d: 0.4, type: 'sine', v: 0.06, t: 0.03 }); },
    antic(k) { au.tone({ f: 165 + k * 55, f2: 330 + k * 110, d: 0.7, type: 'sawtooth', v: 0.04 }); },
    win(n) { au.seq(n > 2 ? [EG[0], EG[2], EG[3], EG[4], EG[7], EG[10]] : [EG[0], EG[2], EG[4]], { step: 0.075, type: 'triangle', v: 0.16 }); },
    page() { au.noise({ d: 0.12, v: 0.09, hp: 2200, f2: 6000 }); },
    open() { au.tone({ f: 82.4, d: 1.6, type: 'sawtooth', v: 0.05 }); au.tone({ f: 123.5, d: 1.6, type: 'triangle', v: 0.06 }); au.seq(EG.slice(0, 9), { step: 0.06, type: 'triangle', v: 0.09 }); },
    expand() { au.tone({ f: 82, f2: 165, d: 0.8, type: 'sawtooth', v: 0.07 }); au.noise({ d: 0.6, v: 0.07, lp: 700, f2: 3200 }); au.seq([EG[7], EG[9], EG[11], EG[12]], { step: 0.06, type: 'triangle', v: 0.12, t: 0.15 }); },
    gong() { au.tone({ f: 98, d: 2.4, type: 'sine', v: 0.3 }); au.tone({ f: 146.8, d: 1.9, type: 'triangle', v: 0.07 }); au.tone({ f: 392, d: 1.2, type: 'sine', v: 0.04 }); au.noise({ d: 1.1, v: 0.05, lp: 1100 }); },
    tick() { au.tone({ f: 1500, d: 0.02, type: 'square', v: 0.035 }); },
    card() { au.noise({ d: 0.09, v: 0.13, hp: 2600 }); },
    gwin() { au.seq([EG[7], EG[9], EG[11], EG[12]], { step: 0.07, type: 'square', v: 0.09 }); },
    glose() { au.tone({ f: 196, f2: 92, d: 0.55, type: 'sawtooth', v: 0.09 }); },
    click() { B.sfx('click'); }, coin() { B.sfx('coin'); }, bonus() { B.sfx('bonus'); }, pop() { B.sfx('pop'); },
  };
  const snd = (n, a) => { try { SND[n](a); } catch (e) { /* sound is optional */ } };

  /* ---------- art: hand-built SVG, shared gradients in one hidden <defs> ---------- */
  const lg = (id, stops, v) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (v === 'h' ? 1 : 0) + '" y2="' + (v === 'h' ? 0 : 1) + '">' + stops.map((s) => '<stop offset="' + s[1] + '" stop-color="' + s[0] + '"/>').join('') + '</linearGradient>';
  const rg = (id, stops, cx, cy, r) => '<radialGradient id="' + id + '" cx="' + (cx || 0.5) + '" cy="' + (cy || 0.5) + '" r="' + (r || 0.5) + '">' + stops.map((s) => '<stop offset="' + s[1] + '" stop-color="' + s[0] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</radialGradient>';
  const LETC = [
    ['#d6fff6', '#2fd6c0', '#0b5e58'], ['#f2deff', '#b36bff', '#3f1478'], ['#ffdbe0', '#ff4a68', '#6e061c'],
    ['#dbe9ff', '#4a8dff', '#12286e'], ['#fff1cc', '#ff9a2a', '#7a3204'],
  ];
  const DEFS_INNER =
    lg('bob-gold', [['#fff8d2', 0], ['#ffd451', 0.36], ['#d9940f', 0.7], ['#6e3f05', 1]]) +
    lg('bob-goldh', [['#7a4706', 0], ['#ffd451', 0.3], ['#fff6c8', 0.5], ['#ffd451', 0.7], ['#7a4706', 1]], 'h') +
    LETC.map((c, i) => lg('bob-l' + i, [['#ffffff', 0], [c[0], 0.18], [c[1], 0.55], [c[2], 1]])).join('') +
    lg('bob-scar', [['#c8fff0', 0], ['#2fe0b0', 0.35], ['#0d8a6a', 0.7], ['#06392c', 1]]) +
    lg('bob-fur', [['#8b78b0', 0], ['#4e3d72', 0.55], ['#231638', 1]]) +
    lg('bob-wing', [['#5a3f86', 0], ['#2a1844', 1]]) +
    lg('bob-crim', [['#ff7a86', 0], ['#c8142e', 0.45], ['#5e0515', 1]]) +
    lg('bob-blue', [['#7fb0ff', 0], ['#2448b0', 0.6], ['#0f1e5a', 1]]) +
    lg('bob-hat', [['#c48a52', 0], ['#7a4a22', 0.6], ['#3e220c', 1]]) +
    lg('bob-page', [['#fffaf0', 0], ['#f0e0b8', 1]], 'h') +
    rg('bob-glow', [['#fff6c8', 0, 0.95], ['#ffd451', 0.35, 0.6], ['#ff9a2a', 0.7, 0.15], ['#ff9a2a', 1, 0]]) +
    rg('bob-eye', [['#fff7a8', 0], ['#ffb02e', 0.6], ['#a33a00', 1]]);
  const DEFS = '<svg class="bob-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' + DEFS_INNER + '</defs></svg>';
  const INK = '#12051a';
  const WING = 'M50 52 C40 36 24 31 5 37 C12 41 14 48 12 55 C18 51 25 52 29 59 C33 53 41 53 50 59 Z';
  const wings = (fill, op, cls) => '<g class="bob-wings ' + (cls || '') + '" opacity="' + op + '"><path class="bob-w" d="' + WING + '" fill="' + fill + '"/><g transform="translate(100 0) scale(-1 1)"><path class="bob-w" d="' + WING + '" fill="' + fill + '"/></g></g>';
  const batWing = (side) => '<g' + (side ? ' transform="translate(100 0) scale(-1 1)"' : '') + '><path class="bob-w" d="M44 50 C34 30 18 24 2 30 C8 36 9 44 6 52 C13 48 20 50 23 58 C28 52 36 53 44 60 Z" fill="url(#bob-wing)" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/><path class="bob-w" d="M40 48 L14 34 M38 52 L12 46 M36 55 L22 56" stroke="#8b6fc0" stroke-width="1.2" opacity=".6" fill="none"/></g>';
  const shadow = (y, rx) => '<ellipse cx="50" cy="' + (y || 92) + '" rx="' + (rx || 28) + '" ry="4.5" fill="#000" opacity=".35"/>';

  /* the "10" is drawn by hand: the decorative face's figure one reads as a capital I */
  const TEN = '<path d="M27 33 L41 24 H48 V67 H55 V74 H31 V67 H38 V35 L29 40 Z"/><path fill-rule="evenodd" d="M70 25 C82 25 88 37 88 49.5 C88 62 82 74 70 74 C58 74 52 62 52 49.5 C52 37 58 25 70 25 Z M70 32 C64.5 32 61.5 40 61.5 49.5 C61.5 59 64.5 67 70 67 C75.5 67 78.5 59 78.5 49.5 C78.5 40 75.5 32 70 32 Z"/>';
  function letter(i) {
    const c = LETC[i], paint = ' fill="url(#bob-l' + i + ')" stroke="' + INK + '" stroke-width="3.4" paint-order="stroke" stroke-linejoin="round"';
    return wings(c[2], 0.6) +
      (i === 0 ? '<g' + paint + '>' + TEN + '</g>' :
        '<text x="50" y="73" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="900" font-size="58"' + paint + '>' + M.NAMES[i] + '</text>') +
      '<g class="bob-gem"><path d="M50 79 l6 6 -6 7 -6 -7z" fill="' + c[1] + '" stroke="' + INK + '" stroke-width="1.6"/><path d="M50 81 l3 4 -3 1.5z" fill="#fff" opacity=".8"/></g>';
  }
  function scarab() {
    return shadow(92, 24) + batWing(0) + batWing(1) +
      '<g stroke="#b8860b" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M33 58 L22 66 L20 76"/><path d="M67 58 L78 66 L80 76"/><path d="M35 70 L28 82"/><path d="M65 70 L72 82"/></g>' +
      '<ellipse cx="50" cy="61" rx="19" ry="25" fill="url(#bob-scar)" stroke="' + INK + '" stroke-width="3"/>' +
      '<path d="M50 40 V85" stroke="' + INK + '" stroke-width="2.2"/>' +
      '<ellipse cx="43" cy="56" rx="4" ry="11" fill="#fff" opacity=".32"/>' +
      '<ellipse cx="50" cy="38" rx="16" ry="9" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="2.6"/>' +
      '<path d="M38 31 Q50 14 62 31 Z" fill="#0d5a46" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M41 20 L37 10 L45 18 M59 20 L63 10 L55 18" fill="#0d5a46" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<g class="bob-eyes"><circle cx="45" cy="26" r="2.6" fill="#ff3d5a"/><circle cx="55" cy="26" r="2.6" fill="#ff3d5a"/></g>' +
      '<circle cx="50" cy="38" r="3.2" fill="#ff3d81" stroke="' + INK + '" stroke-width="1.2"/>';
  }
  function ankh() {
    return shadow(94, 22) + '<g class="bob-wings">' + batWing(0) + batWing(1) + '</g>' +
      '<ellipse cx="50" cy="28" rx="13" ry="17" fill="none" stroke="' + INK + '" stroke-width="13"/>' +
      '<ellipse cx="50" cy="28" rx="13" ry="17" fill="none" stroke="url(#bob-gold)" stroke-width="8"/>' +
      '<path d="M43 44 H57 L59 92 H41 Z" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M20 44 H80 L78 56 H22 Z" fill="url(#bob-goldh)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M41 22 l3 -9 l4 6 M59 22 l-3 -9 l-4 6" fill="#2a1844" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<ellipse cx="50" cy="28" rx="7" ry="9" fill="#2a1844"/>' +
      '<g class="bob-eyes"><circle cx="47" cy="27" r="2" fill="url(#bob-eye)"/><circle cx="53" cy="27" r="2" fill="url(#bob-eye)"/></g>' +
      '<path d="M47.5 32 l1 2 l1 -2 M50.5 32 l1 2 l1 -2" fill="#fff"/>' +
      '<path d="M50 44 l5 6 -5 6 -5 -6z" fill="#ff3d5a" stroke="' + INK + '" stroke-width="1.6"/><path d="M50 46 l2 3 -2 1z" fill="#fff" opacity=".8"/>' +
      '<path d="M46 60 V88" stroke="#fff6c8" stroke-width="2" opacity=".6"/>';
  }
  function queen() {
    let stripes = '';
    for (let k = 0; k < 6; k++) stripes += '<path d="M' + (22 - k * 1.6) + ' ' + (48 + k * 8) + ' L' + (78 + k * 1.6) + ' ' + (48 + k * 8) + '" stroke="#ffd451" stroke-width="3.2"/>';
    return shadow(95, 30) +
      '<path d="M14 30 L4 14 L24 26 Z M86 30 L96 14 L76 26 Z" fill="url(#bob-fur)" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M50 14 C30 14 20 24 20 40 L12 94 H88 L80 40 C80 24 70 14 50 14 Z" fill="url(#bob-blue)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<g clip-path="none" opacity=".95">' + stripes + '</g>' +
      '<ellipse cx="50" cy="52" rx="20" ry="23" fill="url(#bob-fur)" stroke="' + INK + '" stroke-width="2.6"/>' +
      '<path d="M28 30 C36 24 64 24 72 30 L70 36 C62 32 38 32 30 36 Z" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M50 16 C46 20 46 26 50 30 C54 26 54 20 50 16 Z" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="2"/><circle cx="50" cy="23" r="1.8" fill="#ff3d5a"/>' +
      '<g class="bob-eyes"><path d="M36 48 Q42 42 47 48 Q42 52 36 48 Z" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/><path d="M53 48 Q58 42 64 48 Q58 52 53 48 Z" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<circle cx="42" cy="47.6" r="2.4" fill="' + INK + '"/><circle cx="58" cy="47.6" r="2.4" fill="' + INK + '"/></g>' +
      '<path d="M34 47 L30 45 M66 47 L70 45" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M47 56 Q50 58 53 56" stroke="' + INK + '" stroke-width="1.6" fill="none"/>' +
      '<path d="M43 63 Q50 68 57 63 Q50 66 43 63 Z" fill="#ff3d5a" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<path d="M46 64.5 l1.2 3 l1.2 -2.6 M51.6 64.9 l1.2 2.6 l1.2 -3" fill="#fff"/>' +
      '<path d="M30 76 C40 84 60 84 70 76 L74 88 C60 96 40 96 26 88 Z" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M34 82 C44 88 56 88 66 82" stroke="#2448b0" stroke-width="2.4" fill="none"/>';
  }
  function indy() {
    return shadow(95, 30) +
      '<path d="M22 44 L6 20 L32 36 Z M78 44 L94 20 L68 36 Z" fill="url(#bob-fur)" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M15 44 L4 30 M85 44 L96 30" stroke="#d98aa8" stroke-width="2" opacity=".6"/>' +
      '<ellipse cx="50" cy="60" rx="25" ry="26" fill="url(#bob-fur)" stroke="' + INK + '" stroke-width="2.8"/>' +
      '<path d="M30 74 C40 80 60 80 70 74 L72 86 C60 92 40 92 28 86 Z" fill="#c8142e" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M64 80 L74 96 L80 88 Z" fill="#c8142e" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<g class="bob-eyes"><ellipse cx="41" cy="55" rx="5.5" ry="6.5" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/><ellipse cx="59" cy="55" rx="5.5" ry="6.5" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<circle cx="42" cy="56" r="3" fill="' + INK + '"/><circle cx="58" cy="56" r="3" fill="' + INK + '"/><circle cx="43" cy="54.6" r="1" fill="#fff"/><circle cx="59" cy="54.6" r="1" fill="#fff"/></g>' +
      '<path d="M35 47 L46 49 M65 47 L54 49" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M46 62 Q50 60 54 62 L50 65 Z" fill="#2a1030"/>' +
      '<path d="M38 68 Q50 78 62 68" stroke="' + INK + '" stroke-width="2.2" fill="#5a0a20" stroke-linejoin="round"/>' +
      '<path d="M44 70 l1.6 4 l1.6 -3.4 M54 70.4 l1.6 3.6 l1.6 -4" fill="#fff"/>' +
      '<g fill="#2a1d40" opacity=".55"><circle cx="38" cy="72" r=".9"/><circle cx="35" cy="69" r=".9"/><circle cx="62" cy="72" r=".9"/><circle cx="65" cy="69" r=".9"/></g>' +
      '<ellipse cx="50" cy="38" rx="44" ry="9" fill="url(#bob-hat)" stroke="' + INK + '" stroke-width="2.8"/>' +
      '<path d="M28 38 C28 20 34 10 50 10 C66 10 72 20 72 38 C62 41 38 41 28 38 Z" fill="url(#bob-hat)" stroke="' + INK + '" stroke-width="2.8" stroke-linejoin="round"/>' +
      '<path d="M44 12 C48 18 52 18 56 12" stroke="#3e220c" stroke-width="2.4" fill="none"/>' +
      '<path d="M29 32 C40 35 60 35 71 32 L71.6 37 C60 40 40 40 28.4 37 Z" fill="#2a160a"/>' +
      '<path d="M34 16 C38 13 44 12 48 12" stroke="#e6b27a" stroke-width="2" opacity=".6" fill="none"/>';
  }
  function book() {
    return '<circle class="bob-rays" cx="50" cy="50" r="48" fill="url(#bob-glow)"/>' + shadow(94, 30) +
      '<path d="M22 14 L80 10 L84 84 L26 90 Z" fill="#3e0410" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M80 10 L86 14 L90 86 L84 84 Z" fill="url(#bob-page)" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M83 20 L87.5 22 M83.4 32 L88 34 M83.8 44 L88.4 46 M84.2 56 L88.8 58 M84.6 68 L89.2 70" stroke="#c9a978" stroke-width="1.1"/>' +
      '<path d="M26 90 L84 84 L90 86 L32 92 Z" fill="url(#bob-page)" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M18 16 L76 12 L80 86 L22 92 Z" fill="url(#bob-crim)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M24 21 L71 18 L74 81 L27 85 Z" fill="none" stroke="url(#bob-gold)" stroke-width="2.6"/>' +
      '<path d="M18 16 L26 15.5 L30 91.4 L22 92 Z" fill="#000" opacity=".25"/>' +
      '<g fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="1.4"><path d="M18 16 l13 -1 l-12 11z"/><path d="M76 12 l1 13 l-12 -12z"/><path d="M80 86 l-13 1.2 l12 -12z"/><path d="M22 92 l-1 -13 l12 12z"/></g>' +
      '<g transform="translate(49 50) rotate(-3)"><path transform="translate(-30 -14) scale(.5)" d="' + B.batPath + '" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="3"/>' +
      '<circle cx="0" cy="-3" r="10" fill="none" stroke="url(#bob-gold)" stroke-width="2.4"/><circle cx="0" cy="-3" r="2.6" fill="#ff3d81"/></g>' +
      '<path d="M30 70 L66 67" stroke="url(#bob-gold)" stroke-width="2"/><path d="M33 75 L63 72.6" stroke="url(#bob-gold)" stroke-width="1.4" opacity=".8"/>' +
      '<path d="M28 22 L36 21.4 L38 60" stroke="#fff" stroke-width="2" opacity=".18" fill="none"/>';
  }
  const ART = [() => letter(0), () => letter(1), () => letter(2), () => letter(3), () => letter(4), scarab, ankh, queen, indy, book];
  const SYMS = [];
  const symSvg = (s) => SYMS[s] || (SYMS[s] = '<svg class="bob-sym bob-s' + s + (s < 5 ? ' bob-let' : s === BOOK ? ' bob-bk' : ' bob-pic') + '" viewBox="0 0 100 100" aria-hidden="true">' + ART[s]() + '</svg>');
  const symMini = (s, cls) => '<svg class="bob-mini ' + (cls || '') + '" viewBox="0 0 100 100" aria-label="' + M.NAMES[s] + '" role="img">' + ART[s]() + '</svg>';

  /* the crypt behind the reels (1600 x 900, sliced to fit) */
  function crypt() {
    let blocks = '';
    for (let y = 0; y < 640; y += 46) for (let x = (y / 46) % 2 ? -60 : 0; x < 1600; x += 120) blocks += '<rect x="' + x + '" y="' + y + '" width="118" height="44" rx="3"/>';
    const pillar = (x) => '<g transform="translate(' + x + ' 0)"><rect x="-58" y="90" width="116" height="560" fill="#1c1030"/><rect x="-58" y="90" width="22" height="560" fill="#2b1a44"/><rect x="36" y="90" width="22" height="560" fill="#120a20"/>' +
      '<path d="M-78 70 H78 L64 110 H-64 Z" fill="#2b1a44" stroke="#3d2a5c" stroke-width="2"/><path d="M-70 640 H70 L80 676 H-80 Z" fill="#2b1a44"/>' +
      '<g fill="#3d2a5c" opacity=".9"><path transform="translate(-24 170) scale(.4)" d="' + B.batPath + '"/><circle cx="0" cy="260" r="14"/><rect x="-4" y="290" width="8" height="40"/><path d="M-20 300 H20 V308 H-20Z"/><path transform="translate(-24 380) scale(.4)" d="' + B.batPath + '"/><path d="M-14 450 L0 430 L14 450 L0 470Z"/></g>' +
      '<g class="bob-torch"><rect x="-6" y="500" width="12" height="40" fill="#5a3a1a"/><path d="M-14 496 H14 L10 506 H-10Z" fill="#c8870e"/>' +
      '<circle class="bob-tglow" cx="0" cy="470" r="90" fill="url(#bob-glow)" opacity=".55"/><path class="bob-flame" d="M0 440 C12 458 14 474 0 496 C-14 474 -12 458 0 440Z" fill="#ffb02e"/><path class="bob-flame f2" d="M0 456 C6 466 7 478 0 490 C-7 478 -6 466 0 456Z" fill="#fff3b0"/></g></g>';
    return '<svg class="bob-crypt" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      lg('bob-sky', [['#0a0614', 0], ['#22103a', 0.55], ['#3a1650', 1]]) + rg('bob-moonglow', [['#fff6d0', 0, 0.9], ['#ffd76a', 0.25, 0.35], ['#6b3fd1', 0.6, 0.08], ['#000', 1, 0]]) +
      lg('bob-floor', [['#1a0e2a', 0], ['#07030e', 1]]) + '</defs>' +
      '<rect width="1600" height="900" fill="url(#bob-sky)"/>' +
      '<g fill="#1e1232" stroke="#0c0616" stroke-width="2">' + blocks + '</g>' +
      '<circle class="bob-mglow" cx="800" cy="250" r="360" fill="url(#bob-moonglow)"/>' +
      '<path d="M640 600 V260 C640 140 720 70 800 40 C880 70 960 140 960 260 V600 Z" fill="#0d0820" stroke="#3d2a5c" stroke-width="14"/>' +
      '<circle cx="800" cy="250" r="118" fill="#fff4cc"/><circle cx="800" cy="250" r="118" fill="url(#bob-moonglow)" opacity=".6"/>' +
      '<g fill="#e8d8a0" opacity=".55"><circle cx="760" cy="220" r="18"/><circle cx="836" cy="280" r="24"/><circle cx="818" cy="206" r="9"/><circle cx="772" cy="300" r="11"/></g>' +
      '<path class="bob-moonbat" transform="translate(745 228) scale(.9)" d="' + B.batPath + '" fill="#0d0820"/>' +
      '<g stroke="#3d2a5c" stroke-width="10" fill="none"><path d="M800 44 V600"/><path d="M640 330 H960"/><path d="M660 200 C700 150 760 130 800 130 C840 130 900 150 940 200"/></g>' +
      pillar(150) + pillar(1450) +
      '<rect y="640" width="1600" height="260" fill="url(#bob-floor)"/><path d="M0 640 H1600" stroke="#3d2a5c" stroke-width="4"/><path d="M0 700 H1600 M0 780 H1600" stroke="#22143a" stroke-width="3"/>' +
      '</svg>';
  }
  function flyers() {
    let s = '';
    for (let i = 0; i < 7; i++) s += '<i style="--d:' + (9 + (i * 3.7) % 9).toFixed(1) + 's;--y:' + (6 + (i * 13) % 52) + '%;--s:' + (0.5 + (i % 3) * 0.28).toFixed(2) + ';--dl:-' + (i * 2.3).toFixed(1) + 's"><svg viewBox="0 0 120 56"><path d="' + B.batPath + '"/></svg></i>';
    return s;
  }
  function poster() {
    return '<svg viewBox="0 0 300 380" role="img" aria-label="Book of Bats"><defs>' + DEFS_INNER +
      lg('bobp-bg', [['#0a0614', 0], ['#2a1248', 0.6], ['#4a1a3a', 1]]) + rg('bobp-moon', [['#fff6d0', 0, 1], ['#ffd76a', 0.35, 0.5], ['#6b3fd1', 0.7, 0.1], ['#000', 1, 0]]) + '</defs>' +
      '<rect width="300" height="380" fill="url(#bobp-bg)"/>' +
      '<circle cx="150" cy="120" r="150" fill="url(#bobp-moon)" opacity=".7"/>' +
      '<path d="M60 380 V150 C60 80 110 40 150 20 C190 40 240 80 240 150 V380" fill="none" stroke="#3d2a5c" stroke-width="10"/>' +
      '<circle cx="150" cy="110" r="46" fill="#fff4cc"/><path transform="translate(118 96) scale(.55)" d="' + B.batPath + '" fill="#1a0b2e"/>' +
      '<g transform="translate(55 140) scale(1.9)">' + book() + '</g>' +
      '<g transform="translate(6 236) scale(.62)">' + indy() + '</g><g transform="translate(232 236) scale(.62)">' + queen() + '</g>' +
      '<text x="150" y="345" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="900" font-size="34" fill="url(#bob-gold)" stroke="' + INK + '" stroke-width="3" paint-order="stroke">Book of Bats</text>' +
      '<text x="150" y="368" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="11" letter-spacing="3" fill="#ffe6a8">EXPANDING SYMBOL FREE SPINS</text></svg>';
  }

  /* ---------- rules ---------- */
  function rules() {
    const P = M.PAY;
    const row = (s) => '<tr><td>' + symMini(s) + '<span>' + M.NAMES[s] + '</span></td>' + [2, 3, 4, 5].map((n) => '<td>' + (P[s][n] ? P[s][n] + '×' : '–') + '</td>').join('') + '</tr>';
    const lines = M.LINES.map((l, i) => '<svg viewBox="0 0 100 64" aria-label="Line ' + (i + 1) + '"><rect width="100" height="64" rx="6" fill="#1c1030"/><g fill="#2b1a44">' +
      [0, 1, 2, 3, 4].map((c) => [0, 1, 2].map((r) => '<rect x="' + (6 + c * 18) + '" y="' + (5 + r * 18) + '" width="16" height="16" rx="3"/>').join('')).join('') + '</g>' +
      '<polyline points="' + l.map((r, c) => (14 + c * 18) + ',' + (13 + r * 18)).join(' ') + '" fill="none" stroke="' + LCOL[i] + '" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><text x="4" y="62" fill="#fff" font-size="9" font-weight="700">' + (i + 1) + '</text></svg>').join('');
    return '<div class="bob-rules">' +
      '<p><b>Book of Bats</b> is an original Batty Bucks game in the spirit of the classic adventurer-and-book slot. Every character, picture and number here is our own.</p>' +
      '<h3>The reels</h3><p>5 reels, 3 rows and up to 10 lines. Choose how many lines to play (1 to 10); your stake is the <b>total</b> stake, shared equally between the lines you play. Line wins pay left to right from reel 1, and only the best win on each line counts.</p>' +
      '<h3>The Book of Bats</h3><p>The Book is <b>wild</b> (it stands in for every symbol on a line) and a <b>scatter</b>: 3, 4 or 5 Books anywhere pay 2×, 20× or 200× your total stake, and 3 or more award <b>10 free spins</b>.</p>' +
      '<h3>Free spins with an expanding symbol</h3><p>Before the free spins start, the Book opens and picks a <b>special expanding symbol</b> (any of the nine pay symbols, equally likely). After each free spin\'s normal wins, if the special symbol is on enough reels to pay (2 reels for the four picture symbols, 3 for the letters) it <b>expands</b> to fill those reels and pays on <b>every line you play</b>, even if the reels are not next to each other.</p>' +
      '<p>3 or more Books during the free spins add <b>10 more spins</b>, and the Book picks an <b>extra special symbol</b> (a different one), up to 3 at once. Each one expands and pays on its own.</p>' +
      '<h3>Gamble</h3><p>With <b>GAMBLE ON</b>, after a win you can collect it or gamble it on a face-down card: pick a colour to double it or a suit to quadruple it. The card is drawn after you choose (on the server, when you are online). The gamble is fair, so it does not change the game\'s return. Up to ' + M.GAMBLE_STEPS + ' gambles per win, and only while the possible prize stays within ' + fmt(M.GAMBLE_LIMIT_X) + '× your stake. Autoplay never gambles.</p>' +
      '<p>The whole round, the spin and its free spins together, is capped at <b>' + fmt(M.MAX_WIN_X) + '× your stake</b>; the round ends the moment it is reached.</p>' +
      '<h3>Paytable</h3><p>Multiples of your <b>line bet</b> (your stake divided by the lines you play), for 2, 3, 4 and 5 in a row. An expanding symbol pays the same amounts for the number of reels it fills, on every line played.</p>' +
      '<table class="bob-pt"><tr><th>Symbol</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>' + [8, 7, 6, 5, 4, 3, 2, 1, 0].map(row).join('') +
      '<tr><td>' + symMini(BOOK) + '<span>Book (scatter, × total stake)</span></td><td>–</td><td>2×</td><td>20×</td><td>200×</td></tr></table>' +
      '<details><summary>View all 10 lines</summary><div class="bob-lns">' + lines + '</div></details>' +
      '<div class="rtp"><b>Tested return</b> 96.5% (exact calculation, confirmed by a 10,000,000-spin simulation). Wins land on about 1 spin in 2.9, free spins on about 1 spin in 186, and a free-spins feature is worth about 64× your stake on average. Maximum win ' + fmt(M.MAX_WIN_X) + '× your stake. Rounds are drawn on the server with a secure random generator. Space spins; a tap or Space during a spin stops the reels at once.</div>' +
      '<p>Batty Bucks are play money. They cannot be bought, sold or cashed out, and have no cash value.</p></div>';
  }

  /* ---------- the mounted game ---------- */
  function mount(root) {
    const S = B.scope();
    G = { S };
    const el = {};
    const DEV = (() => { try { return !B.online && localStorage.getItem('batty-dev') === '1'; } catch (e) { return false; } })();
    let reels = [], busy = false, spinning = false, auto = 0, skip = false, primary = null, stake = 0, cycleTok = 0, inFs = false;
    let turbo = pref('turbo', '0') === '1', gambleOn = pref('gamble', '1') === '1';
    let lines = Math.max(1, Math.min(10, parseInt(pref('lines', '10'), 10) || 10));
    let devNext = null;
    const T = (ms) => ms * (skip ? 0.2 : turbo ? 0.55 : 1) * (RM ? 0.7 : 1);
    const nap = (ms) => S.sleep(Math.max(16, T(ms)));
    const setMsg = (t, cls) => { el.msg.textContent = t; el.msg.className = 'bob-msg' + (cls ? ' ' + cls : ''); };
    const bb = (units) => Math.floor(units * stake / lines);

    /* ----- build ----- */
    root.innerHTML = DEFS;
    el.bg = h('div', { class: 'bob-bg', 'aria-hidden': 'true', html: crypt() + '<div class="bob-fog f1"></div><div class="bob-fog f2"></div><div class="bob-flyers">' + flyers() + '</div><div class="bob-motes"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' });
    el.title = h('div', { class: 'bob-title' }, h('b', null, 'Book of Bats'), h('span', null, 'Expanding symbol free spins · up to ' + fmt(M.MAX_WIN_X) + '× stake'));
    el.reels = h('div', { class: 'bob-reels' });
    const s0 = M.windowOf('base', M.STRIPS.base.map((st) => (Math.random() * st.length) | 0));
    const rnd0 = M.STRIPS.base[2];
    const rndSym = () => rnd0[(Math.random() * rnd0.length) | 0];
    for (let i = 0; i < REELS; i++) {
      const strip = h('div', { class: 'bob-strip' }), reel = h('div', { class: 'bob-reel' }, strip, h('i', { class: 'bob-dust' }));
      const r = { i, el: reel, strip, off: 0, mode: 'idle', queue: null, stopAt: 0, v: 0, t: 0, fin: null, done: null };
      for (let k = 0; k < CELLN; k++) { const c = h('div', { class: 'bob-cell' }); c.innerHTML = symSvg(k >= 1 && k <= 3 ? s0[i][k - 1] : rndSym()); strip.append(c); }
      reels.push(r); el.reels.append(reel);
    }
    el.xp = h('div', { class: 'bob-xp', 'aria-hidden': 'true' });
    el.lines = h('div', { class: 'bob-lines', 'aria-hidden': 'true' });
    el.amt = h('div', { class: 'bob-amt', 'aria-hidden': 'true', hidden: true });
    el.banner = h('div', { class: 'bob-banner', hidden: true, 'aria-hidden': 'true' });
    /* line markers, Book-style: numbered gems at each line's first and last row */
    el.mkL = h('div', { class: 'bob-mk l' }); el.mkR = h('div', { class: 'bob-mk r' });
    const marks = [];
    [[el.mkL, 0], [el.mkR, 4]].forEach(([host, reel]) => {
      const groups = [[], [], []]; M.LINES.forEach((ln, l) => groups[ln[reel]].push(l));
      groups.forEach((g, row) => g.forEach((l, k) => {
        const b = h('button', { type: 'button', class: 'bob-mkb', style: '--lc:' + LCOL[l] + ';top:' + ((row + (k + 1) / (g.length + 1)) / 3 * 100).toFixed(2) + '%', 'aria-label': 'Play ' + (l + 1) + ' line' + (l ? 's' : ''), onclick: () => setLines(l + 1, true) }, String(l + 1));
        host.append(b); (marks[l] = marks[l] || []).push(b);
      }));
    });
    el.frame = h('div', { class: 'bob-frame' }, el.mkL, el.reels, el.xp, el.lines, el.amt, el.banner, el.mkR, h('i', { class: 'bob-crest', html: '<svg viewBox="0 0 120 56" aria-hidden="true"><path d="' + B.batPath + '"/></svg>' }));
    el.mid = h('div', { class: 'bob-mid' }, el.frame);
    el.ov = h('div', { class: 'bob-ov', hidden: true });
    el.box = h('div', { class: 'bob-box' }, el.mid, el.ov);
    /* free-spins HUD */
    el.hudLeft = h('output', null, '0'); el.hudSp = h('div', { class: 'bob-hud-sp' }); el.hudTotal = h('output', null, '0');
    el.skipBtn = h('button', { class: 'bob-skip', type: 'button', 'aria-label': 'Fast forward', onclick: () => { skip = true; snd('click'); el.skipBtn.hidden = true; } }, 'SKIP ▸▸');
    el.hud = h('div', { class: 'bob-hud', hidden: true },
      h('div', { class: 'bob-hud-c' }, h('small', null, 'FREE SPINS'), el.hudLeft),
      h('div', { class: 'bob-hud-c sp' }, h('small', null, 'EXPANDING'), el.hudSp),
      h('div', { class: 'bob-hud-c' }, h('small', null, 'FEATURE WIN'), el.hudTotal), el.skipBtn);
    /* controls */
    el.msg = h('div', { class: 'bob-msg', role: 'status', 'aria-live': 'polite' }, '3 Books anywhere open the free spins.');
    el.win = h('output', null, '0');
    el.winbox = h('div', { class: 'bob-winbox' }, h('small', null, 'WIN'), el.win);
    el.stakeBox = h('div', { class: 'bob-stakebox' });
    el.lMinus = h('button', { type: 'button', 'aria-label': 'Fewer lines', onclick: () => setLines(lines - 1, true) }, '−');
    el.lPlus = h('button', { type: 'button', 'aria-label': 'More lines', onclick: () => setLines(lines + 1, true) }, '+');
    el.lOut = h('output');
    el.linesBox = h('div', { class: 'bc-stake bob-lstep' }, el.lMinus, el.lOut, el.lPlus);
    el.spin = h('button', { class: 'bob-spin', type: 'button', 'aria-label': 'Spin', id: 'bob-spin', onclick: () => onSpin(), html: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8a16 16 0 1 1-11.3 4.7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M8 6v10h10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><b>COLLECT</b>' });
    el.gam = h('button', { class: 'bob-btn', type: 'button', id: 'bob-gam', 'aria-pressed': String(gambleOn), onclick: () => { gambleOn = !gambleOn; setPref('gamble', gambleOn ? 1 : 0); paintOpts(); snd('click'); } }, h('small', null, 'GAMBLE'), h('span', null, 'ON'));
    el.turbo = h('button', { class: 'bob-btn', type: 'button', id: 'bob-turbo', 'aria-pressed': String(turbo), onclick: () => { turbo = !turbo; setPref('turbo', turbo ? 1 : 0); paintOpts(); snd('click'); } }, h('small', null, 'TURBO'), h('span', null, 'OFF'));
    el.auto = h('button', { class: 'bob-btn', type: 'button', id: 'bob-auto', onclick: () => onAuto() }, h('small', null, 'AUTO'), h('span', null, 'OFF'));
    el.autoMenu = h('div', { class: 'bob-automenu', hidden: true }, ...[10, 25, 50, 100].map((n) => h('button', { type: 'button', onclick: () => { el.autoMenu.hidden = true; startAuto(n); } }, String(n))));
    el.opts = h('div', { class: 'bob-opts' }, el.gam, el.turbo, h('div', { class: 'bob-autowrap' }, el.auto, el.autoMenu));
    el.ctl = h('div', { class: 'bob-ctl' }, el.stakeBox, el.linesBox, el.winbox, el.spin, el.opts);
    el.main = h('div', { class: 'bob-main' }, el.title, el.hud, el.box, el.msg, el.ctl);
    root.append(el.bg, el.main);
    const stakeCtl = B.ui.stake(el.stakeBox, { id: ID, label: 'Stake · BB' });
    function paintOpts() {
      el.gam.lastChild.textContent = gambleOn ? 'ON' : 'OFF'; el.gam.classList.toggle('on', gambleOn); el.gam.setAttribute('aria-pressed', String(gambleOn));
      el.turbo.lastChild.textContent = turbo ? 'ON' : 'OFF'; el.turbo.classList.toggle('on', turbo); el.turbo.setAttribute('aria-pressed', String(turbo));
      el.auto.lastChild.textContent = auto > 0 ? String(auto) : 'OFF'; el.auto.classList.toggle('on', auto !== 0);
    }
    function paintLines() {
      el.lOut.innerHTML = lines + '<small>Lines</small>';
      el.lMinus.disabled = busy || lines <= 1; el.lPlus.disabled = busy || lines >= 10;
      marks.forEach((bs, l) => bs.forEach((b) => { b.classList.toggle('off', l >= lines); b.disabled = busy; }));
    }
    function setLines(n, show) {
      if (busy) return;
      n = Math.max(1, Math.min(10, n)); if (n === lines && !show) return;
      lines = n; setPref('lines', n); paintLines(); snd('click');
      if (show) { stopCycle(); drawLines(Array.from({ length: lines }, (_, l) => ({ l, n: 5 })), true); const tok = cycleTok; S.timeout(() => { if (tok === cycleTok) el.lines.innerHTML = ''; }, 1100); setMsg(lines + ' line' + (lines > 1 ? 's' : '') + ' · ' + fmt(stakeCtl.value / lines) + ' BB a line'); }
    }
    paintOpts(); paintLines();
    requestAnimationFrame(() => root.classList.add('open'));

    /* ----- keyboard ----- */
    S.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (document.querySelector('.bc-veil, .bc-win')) return;
      e.preventDefault(); if (e.repeat) return;
      if (primary) primary(); else onSpin();
    });
    S.on(el.reels, 'click', () => { if (spinning) slam(); });

    /* ===================== reels ===================== */
    const cellAt = (c, row) => reels[c].strip.children[row + 1];
    const setStrip = (r) => { r.strip.style.transform = 'translate3d(0,' + ((r.off - 1) * STEP).toFixed(3) + '%,0)'; };
    let booksLanded = 0;
    function shift(r) {
      const c = r.strip.lastElementChild; r.strip.prepend(c);
      c.classList.remove('win', 'bk');
      if (r.mode === 'stopping') { c.innerHTML = symSvg(r.queue.shift()); if (!r.queue.length) landed(r); }
      else c.innerHTML = symSvg(rndSym());
    }
    function landed(r) {
      r.mode = 'settle'; r.off = 0; setStrip(r); r.el.classList.remove('spinning', 'antic');
      snd('stop', r.i);
      if (!RM) r.strip.animate([{ transform: 'translate3d(0,' + (-STEP * 0.8).toFixed(3) + '%,0)' }, { transform: 'translate3d(0,' + (-STEP).toFixed(3) + '%,0)' }], { duration: T(340), easing: 'cubic-bezier(.22,1.7,.45,1)' });
      r.el.classList.remove('thud'); void r.el.offsetWidth; r.el.classList.add('thud'); S.timeout(() => r.el.classList.remove('thud'), 420);
      const row = r.fin.indexOf(BOOK);
      if (row >= 0) { const c = cellAt(r.i, row); c.classList.add('bk'); snd('book', booksLanded++); }
      S.timeout(() => { r.mode = 'idle'; if (r.done) { const d = r.done; r.done = null; d(); } }, T(280));
    }
    function frame(dt) {
      const now = performance.now();
      for (const r of reels) {
        if (r.mode !== 'spin' && r.mode !== 'stopping') continue;
        if (r.mode === 'spin' && r.stopAt && now >= r.stopAt) { r.mode = 'stopping'; r.queue = [r.fin[2], r.fin[1], r.fin[0], rndSym()]; }
        r.t += dt;
        const vmax = (turbo || skip ? 30 : 21) * (RM ? 0.6 : 1);
        if (r.t < 0.1 && !RM) { r.off = -0.14 * Math.sin(r.t / 0.1 * Math.PI / 2); setStrip(r); continue; }
        r.v = Math.min(vmax, r.v + dt * vmax / 0.22);
        r.off += r.v * dt;
        while (r.off >= 1 && (r.mode === 'spin' || r.mode === 'stopping')) { r.off -= 1; shift(r); }
        if (r.mode !== 'settle') setStrip(r);
      }
    }
    S.loop(frame);
    function paintSpin() { el.spin.classList.toggle('stop', spinning); el.spin.setAttribute('aria-label', el.spin.classList.contains('collect') ? 'Collect' : spinning ? 'Stop' : 'Spin'); }
    function startRoll() {
      for (const r of reels) if (r.mode === 'idle') { r.mode = 'spin'; r.t = 0; r.v = 0; r.stopAt = 0; r.el.classList.add('spinning'); }
      spinning = true; paintSpin(); snd('spin');
    }
    /* bring the reels to rest on grid (grid[reel][row]); resolves once the last reel settles */
    function spinTo(grid, opts) {
      opts = opts || {};
      booksLanded = 0;
      return new Promise((res) => {
        const base = performance.now(), gap = T(170), first = T(opts.first || 620);
        let left = REELS, extra = 0, cnt = 0;
        startRoll();
        reels.forEach((r, i) => {
          r.fin = grid[i]; r.done = () => { if (--left === 0) { spinning = false; paintSpin(); res(); } };
          if (cnt >= 2 && opts.antic !== false) {
            const k = i, prevAt = base + first + (i - 1) * gap + extra;
            extra += T(1150);
            S.timeout(() => { r.el.classList.add('antic'); el.frame.classList.add('antic'); snd('antic', k - 2); if (k === 2 || !el.msg.classList.contains('gold')) setMsg('One more Book…', 'gold'); }, Math.max(0, prevAt - base + T(120)));
          }
          r.stopAt = base + first + i * gap + extra;
          if (grid[i].indexOf(BOOK) >= 0) cnt++;
        });
        S.timeout(() => el.frame.classList.remove('antic'), first + 4 * gap + extra + T(200));
      });
    }
    function slam() {
      if (!spinning) return;
      const now = performance.now();
      reels.forEach((r, i) => { if (r.mode === 'spin' && r.stopAt) r.stopAt = Math.min(r.stopAt, now + i * 40); });
    }
    function restAll() {
      for (const r of reels) { r.mode = 'idle'; r.off = 0; setStrip(r); r.el.classList.remove('spinning', 'antic'); for (let k = 0; k < CELLN; k++) r.strip.children[k].innerHTML = symSvg(rndSym()); }
      spinning = false; paintSpin();
    }
    function setGrid(grid) { grid.forEach((col, c) => col.forEach((s, k) => { const x = cellAt(c, k); x.innerHTML = symSvg(s); x.classList.remove('win', 'bk'); })); }

    /* ===================== win presentation ===================== */
    function clearMarks() { el.reels.querySelectorAll('.bob-cell.win').forEach((c) => c.classList.remove('win')); el.reels.classList.remove('dim'); el.lines.innerHTML = ''; el.amt.hidden = true; marks.forEach((bs) => bs.forEach((b) => b.classList.remove('hot'))); }
    function markWins(ws, books) {
      clearMarks();
      if (!ws.length && !(books && books.length)) return;
      el.reels.classList.add('dim');
      for (const w of ws) { const ln = M.LINES[w.l]; for (let c = 0; c < w.n; c++) cellAt(c, ln[c]).classList.add('win'); marks[w.l].forEach((b) => b.classList.add('hot')); }
      if (books) books.forEach(([c, row]) => cellAt(c, row).classList.add('win'));
    }
    function drawLines(ws, preview) {
      el.lines.innerHTML = '<svg viewBox="0 0 5 3" preserveAspectRatio="none" aria-hidden="true">' + ws.map((w) => {
        const ln = M.LINES[w.l], pts = ['-0.06,' + (ln[0] + 0.5)].concat(ln.map((row, c) => (c + 0.5) + ',' + (row + 0.5)), ['5.06,' + (ln[4] + 0.5)]).join(' ');
        return '<polyline class="bob-ln' + (preview ? ' pv' : '') + '" style="--lc:' + LCOL[w.l] + '" points="' + pts + '"/>';
      }).join('') + '</svg>';
    }
    function showAmt(w, amount) {
      const ln = M.LINES[w.l], c = w.n - 1;
      el.amt.hidden = false; el.amt.textContent = fmt(amount);
      el.amt.style.left = ((c + 0.5) * 20) + '%'; el.amt.style.top = ((ln[c] + 0.5) / 3 * 100) + '%'; el.amt.style.setProperty('--lc', LCOL[w.l]);
      el.amt.classList.remove('pop'); void el.amt.offsetWidth; el.amt.classList.add('pop');
    }
    const curWin = () => parseInt(el.win.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    function countWin(to, ms) { const from = curWin(); if (to === from) return Promise.resolve(); let last = 0; const tk = S.interval(() => { if (++last % 2) snd('tick'); }, 70); return B.ui.countUp(el.win, from, to, Math.max(60, T(ms || 600))).then(() => S.clear(tk)); }
    function flare(big) { el.bg.classList.remove('flare', 'flare2'); void el.bg.offsetWidth; el.bg.classList.add(big ? 'flare2' : 'flare'); S.timeout(() => el.bg.classList.remove('flare', 'flare2'), 1800); }
    const lineText = (w) => M.NAMES[w.s] + ' × ' + w.n + ' on line ' + (w.l + 1) + ' pays ' + fmt(bb(w.pay)) + ' BB';
    /* a spin's wins: all together, then (base game) one line at a time until the next spin */
    async function showWins(ws, books, scat, countTo, cycle) {
      if (!ws.length && !scat) return;
      markWins(ws, scat ? books : null); drawLines(ws); snd('win', ws.length + (scat ? 2 : 0)); el.frame.classList.add('won');
      if (ws.length === 1 && !scat) showAmt(ws[0], bb(ws[0].pay));
      const big = countTo >= stake * 5; flare(big);
      if (scat) setMsg(books.length + ' Books pay ' + fmt(bb(scat)) + ' BB', 'gold'); else if (ws.length === 1) setMsg(lineText(ws[0]), 'gold'); else setMsg(ws.length + ' winning lines', 'gold');
      await countWin(countTo, big ? 1100 : 600);
      if (!cycle || ws.length + (scat ? 1 : 0) < 2) return;
      const tok = ++cycleTok, items = ws.map((w) => ({ w })).concat(scat ? [{ books }] : []);
      S.timeout(async () => {
        let i = 0;
        while (cycleTok === tok && !S.dead) {
          const it = items[i++ % items.length];
          if (it.w) { markWins([it.w]); drawLines([it.w]); showAmt(it.w, bb(it.w.pay)); setMsg(lineText(it.w), 'gold'); }
          else { markWins([], it.books); setMsg(it.books.length + ' Books pay ' + fmt(bb(scat)) + ' BB', 'gold'); }
          await S.sleep(T(1000));
        }
      }, T(700));
    }
    function stopCycle() { cycleTok++; el.frame.classList.remove('won'); clearMarks(); }
    function banner(html, cls, ms) {
      el.banner.hidden = false; el.banner.className = 'bob-banner ' + (cls || ''); el.banner.innerHTML = html; void el.banner.offsetWidth; el.banner.classList.add('in');
      return nap(ms || 1200).then(() => { el.banner.classList.remove('in'); el.banner.classList.add('out'); return nap(280); }).then(() => { el.banner.hidden = true; });
    }
    function burstAt(node, kind, n) { if (!node || !node.getBoundingClientRect || RM) return; const r = node.getBoundingClientRect(); B.fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: kind || 'coin', count: n || 18, power: 0.8 }); }
    function clearXp() { el.xp.textContent = ''; el.frame.classList.remove('xping'); }

    /* ===================== the server / the maths ===================== */
    const offerOf = (amount, st, steps, hist) => ({ amount, steps, hist, canColour: M.gambleAllowed(amount, st, steps, 'red'), canSuit: M.gambleAllowed(amount, st, steps, 'hearts'), stepsLeft: Math.max(0, M.GAMBLE_STEPS - steps), limit: M.GAMBLE_LIMIT_X * st });
    async function begin(st, wantGamble) {
      if (B.online) {
        const r = await B.play(ID, 'spin', { stake: st, lines, gamble: wantGamble ? 1 : 0 }, st);
        if (!r || !r.o) return null;
        if (r.collected > 0) B.ui.toast('Collected ' + fmt(r.collected) + ' BB left over from your last win');
        return { o: r.o, win: r.win, held: r.held ? { round: r.round, offer: r.offer, stake: st } : null };
      }
      let o = M.spin(B.rng, lines);
      if (DEV && devNext) { const want = devNext; devNext = null; for (let k = 0; k < 200000; k++) { if (want === 'fs' ? o.fs : want === 'retrig' ? (o.fs && o.fs.retriggers > 0) : want === 'big' ? o.total >= 50 * lines : o.total > 0) break; o = M.spin(B.rng, lines); } }
      const win = M.winBB(o.total, st, lines);
      return { o, win, held: win > 0 && wantGamble && M.gambleAllowed(win, st, 0, 'red') ? { round: 0, offer: offerOf(win, st, 0, []), stake: st } : null };
    }
    if (DEV) window.bobDev = { next(k) { devNext = k || 'fs'; return 'next spin: ' + devNext; } };

    /* ===================== spin button, auto ===================== */
    function lockUi(on) { busy = on; stakeCtl.disabled = on; el.main.classList.toggle('busy', on); paintLines(); paintSpin(); }
    function onSpin() {
      if (primary) { primary(); return; }   // collect a held win, or skip a feature card
      if (!el.autoMenu.hidden) { el.autoMenu.hidden = true; return; }
      if (busy) { if (spinning) slam(); else if (inFs && !skip) { skip = true; el.skipBtn.hidden = true; } return; }
      round();
    }
    function onAuto() { if (auto !== 0) { stopAuto(); snd('click'); } else if (!busy) el.autoMenu.hidden = !el.autoMenu.hidden; }
    function startAuto(n) { auto = n; paintOpts(); round(); }
    function stopAuto() { auto = 0; paintOpts(); }

    /* ===================== a round ===================== */
    async function round() {
      if (busy || !G) return;
      const st = stakeCtl.value, autoing = auto !== 0;
      if (!B.wallet.bet(ID, st)) { stopAuto(); return B.ui.broke(); }
      skip = false; stake = st; el.autoMenu.hidden = true;
      stopCycle(); clearXp(); el.win.textContent = '0'; el.winbox.classList.remove('hot'); lockUi(true);
      if (auto > 0) { auto--; paintOpts(); }
      setMsg('Spinning…', ''); startRoll();
      const res = await begin(st, gambleOn && !autoing);
      if (!G) return;
      if (!res) { restAll(); lockUi(false); stopAuto(); setMsg('Lost touch with the crypt. Try again.', ''); return; }
      const o = res.o, b = o.base;
      await spinTo(b.grid);
      if (!G) return;
      const trig = !!o.fs;
      if (b.pay > 0) await showWins(b.wins, b.books, b.scat, bb(b.pay), !trig);
      else setMsg(['The crypt stays quiet. Spin again.', 'Not this time. The Book is waiting.', 'Nothing yet. Three Books open the free spins.'][(Math.random() * 3) | 0], '');
      if (trig) { await freeSpins(o); if (!G) return; }
      await finish(res);
    }
    async function finish(res) {
      const o = res.o, win = res.win;
      if (o.fs) stopCycle();
      if (win > curWin()) await countWin(win, 700);
      if (win >= stake * 10) { flare(true); await B.ui.celebrate({ amount: win, bet: stake }); if (!G) return; }
      if (res.held) {
        const g = await gambleFlow(res.held);
        if (!G) return;
        settle(g);
      } else {
        if (win > 0) { B.wallet.win(ID, win, { silent: true }); el.winbox.classList.add('hot'); }
        B.wallet.sync();
        if (o.capped) setMsg('MAXIMUM WIN! Paid ' + fmt(win) + ' BB', 'gold'); else if (win > 0 && o.fs) setMsg('Paid ' + fmt(win) + ' BB', 'gold');
      }
      lockUi(false);
      if (auto > 0 && B.wallet.balance >= stakeCtl.value) S.timeout(() => { if (auto > 0 && !busy) round(); }, T(o.fs ? 1000 : 420));
      else if (auto !== 0) stopAuto();
    }
    function settle(g) {
      el.win.textContent = fmt(g.amount);
      if (g.amount > 0) { B.wallet.win(ID, g.amount, { silent: true }); B.wallet.sync(); el.winbox.classList.add('hot'); setMsg('Collected ' + fmt(g.amount) + ' BB', 'gold'); snd('coin'); }
      else { B.wallet.sync(); setMsg('The card was against you. Spin again!', ''); }
    }

    /* ===================== free spins ===================== */
    function enterFs(specials) { inFs = true; el.main.classList.add('fs'); el.bg.classList.add('fs'); el.hud.hidden = false; el.skipBtn.hidden = false; el.hudTotal.textContent = '0'; paintSpecials(specials); }
    function exitFs() { inFs = false; el.main.classList.remove('fs'); el.bg.classList.remove('fs'); el.hud.hidden = true; }
    function paintSpecials(sp, fresh) { el.hudSp.innerHTML = sp.map((s, i) => '<i class="' + (fresh && i === sp.length - 1 ? 'new' : '') + '">' + symMini(s) + '</i>').join(''); }
    function setHudTotal(v) { const from = parseInt(el.hudTotal.textContent.replace(/[^0-9]/g, ''), 10) || 0; if (v !== from) B.ui.countUp(el.hudTotal, from, v, Math.max(80, T(500))); }
    function tapOr(ms) {
      return new Promise((res) => {
        let done = false;
        const fin = () => { if (done) return; done = true; primary = null; el.ov.removeEventListener('click', fin); res(); };
        el.ov.addEventListener('click', fin); primary = fin; S.timeout(fin, T(ms));
      });
    }
    function openOv(cls) { el.ov.hidden = false; el.ov.className = 'bob-ov ' + cls; el.ov.textContent = ''; void el.ov.offsetWidth; el.ov.classList.add('in'); }
    function closeOv() { el.ov.classList.remove('in'); el.ov.classList.add('out'); return nap(300).then(() => { el.ov.hidden = true; el.ov.textContent = ''; el.ov.className = 'bob-ov'; }); }
    /* the Book opens and its pages flick through the symbols until it settles on the special one */
    async function bookPick(pick, have, extraPick) {
      openOv('intro');
      const page = h('div', { class: 'bob-pgsym' });
      const bk = h('div', { class: 'bob-tome' },
        h('div', { class: 'bob-tome-back' }), h('div', { class: 'bob-tome-l', html: '<svg viewBox="0 0 120 56" aria-hidden="true"><path d="' + B.batPath + '"/></svg><span>' + (extraPick ? 'AN EXTRA SYMBOL' : 'THE BOOK CHOOSES') + '</span>' }),
        h('div', { class: 'bob-tome-r' }, page), h('div', { class: 'bob-tome-cover', html: '<div class="bob-cv-f">' + symMini(BOOK, 'cv') + '</div><div class="bob-cv-b"></div>' }));
      const cap = h('div', { class: 'bob-intro-cap' }, h('small', null, extraPick ? 'RETRIGGER · 10 MORE FREE SPINS' : '10 FREE SPINS'), h('b', null, extraPick ? 'Extra expanding symbol' : 'Special expanding symbol'), h('span', null, ''));
      el.ov.append(h('div', { class: 'bob-intro' }, h('div', { class: 'bob-tome-wrap' }, bk), cap));
      snd('gong'); await nap(650); if (!G) return;
      bk.classList.add('open'); snd('open'); await nap(900); if (!G) return;
      const pool = []; for (let s = 0; s < 9; s++) if (have.indexOf(s) < 0) pool.push(s);
      const steps = skip ? 4 : RM ? 6 : 16;
      let at = pool.indexOf(pick) - steps; at = ((at % pool.length) + pool.length) % pool.length;
      for (let k = 0; k <= steps; k++) {
        const s = pool[(at + k) % pool.length];
        page.innerHTML = symMini(s); page.classList.remove('flip'); void page.offsetWidth; page.classList.add('flip'); snd('page');
        await S.sleep(Math.max(30, T(60 + Math.pow(k / steps, 3) * 380)));
        if (!G) return;
      }
      page.innerHTML = symMini(pick); page.classList.add('chosen'); snd('expand'); burstAt(page, 'spark', 30);
      cap.lastChild.textContent = M.NAMES[pick] + ' · expands on ' + M.MINEXP[pick] + '+ reels';
      cap.classList.add('show');
      await tapOr(2300); if (!G) return;
      await closeOv();
    }
    /* the special symbol grows to fill every reel it is on, then pays on every played line */
    async function expand(x, grid) {
      el.reels.classList.add('dim'); el.reels.querySelectorAll('.bob-cell.win').forEach((c) => c.classList.remove('win'));
      x.reels.forEach((r) => grid[r].forEach((s, row) => { if (s === x.s) cellAt(r, row).classList.add('win'); }));
      setMsg(M.NAMES[x.s] + ' on ' + x.n + ' reels: it expands!', 'gold');
      await nap(650); if (!G) return;
      el.xp.textContent = ''; el.frame.classList.add('xping'); snd('expand');
      x.reels.forEach((r, k) => {
        const row = grid[r].indexOf(x.s);
        const col = h('div', { class: 'bob-xcol', style: '--c:' + r + ';--o:' + ((row + 0.5) / 3 * 100).toFixed(1) + '%;--dl:' + Math.round(T(k * 110)) + 'ms', html: '<i>' + symSvg(x.s) + '</i><i>' + symSvg(x.s) + '</i><i>' + symSvg(x.s) + '</i>' });
        el.xp.append(col);
      });
      await nap(700 + x.reels.length * 110); if (!G) return;
      drawLines(Array.from({ length: lines }, (_, l) => ({ l, n: 5 })));
      marks.forEach((bs, l) => bs.forEach((b) => b.classList.toggle('hot', l < lines)));
      setMsg(M.NAMES[x.s] + ' expands on ' + x.n + ' reels · ' + lines + ' line' + (lines > 1 ? 's' : '') + ' pay ' + fmt(bb(x.pay)) + ' BB', 'gold');
      snd('win', 3); burstAt(el.frame, 'coin', 26); flare(bb(x.pay) >= stake * 5);
    }
    async function freeSpins(o) {
      const fs = o.fs;
      markWins([], o.base.books); el.frame.classList.add('won'); snd('bonus'); flare(true);
      await banner('<small>' + o.base.books.length + ' Books</small><b>Free spins</b>', 'fs', 1500); if (!G) return;
      await bookPick(fs.first, [], false); if (!G) return;
      stopCycle(); enterFs([fs.first]);
      let have = [fs.first], prev = o.base.pay;
      for (let k = 0; k < fs.spins.length; k++) {
        const sp = fs.spins[k], awarded = k + 1 + sp.left - (sp.retrig && !(o.capped && k === fs.spins.length - 1) ? M.FS_AWARD : 0);
        el.hudLeft.textContent = (k + 1) + ' / ' + Math.max(k + 1, awarded);
        stopCycle(); clearXp(); setMsg('Free spin ' + (k + 1), '');
        await spinTo(sp.grid, { first: 520 }); if (!G) return;
        const linePart = sp.wins.reduce((a, w) => a + w.pay, 0) + sp.scat;
        if (linePart > 0) { await showWins(sp.wins, sp.books, sp.scat, bb(Math.min(prev + linePart, sp.total)), false); if (!G) return; await nap(650); }
        let acc = prev + linePart;
        for (const x of sp.exp) {
          await expand(x, sp.grid); if (!G) return;
          acc += x.pay; await countWin(bb(Math.min(acc, sp.total)), 900); setHudTotal(bb(Math.min(acc, sp.total)) - bb(o.base.pay));
          await nap(1100); if (!G) return;
        }
        await countWin(bb(sp.total), 300);
        setHudTotal(bb(sp.total) - bb(o.base.pay));
        prev = sp.total;
        if (sp.retrig) {
          el.hudLeft.textContent = (k + 1) + ' / ' + (k + 1 + sp.left);
          markWins([], sp.books); snd('bonus');
          await banner('<small>3 Books</small><b>+10 free spins</b>', 'fs', 1300); if (!G) return;
          if (sp.newSpecial >= 0) { await bookPick(sp.newSpecial, have, true); if (!G) return; have = have.concat([sp.newSpecial]); paintSpecials(have, true); }
        }
        if (o.capped && k === fs.spins.length - 1) { snd('gong'); await banner('<small>The Book is closed</small><b>Maximum win</b>', 'max', 2000); if (!G) return; }
        await nap(sp.pay > 0 ? 450 : 260); if (!G) return;
      }
      stopCycle(); clearXp();
      /* summary */
      const fw = bb(o.total) - bb(o.base.pay);
      openOv('outro');
      el.ov.append(h('div', { class: 'bob-outro' }, h('small', null, 'FEATURE COMPLETE'), h('b', null, fmt(fw) + ' BB'), h('span', null, 'won in ' + fs.played + ' free spin' + (fs.played > 1 ? 's' : '') + (fs.retriggers ? ' · ' + fs.retriggers + ' retrigger' + (fs.retriggers > 1 ? 's' : '') : '')), h('em', null, 'Tap to continue')));
      snd(fw > 0 ? 'gwin' : 'gong'); if (fw > 0) flare(true);
      await tapOr(3000); if (!G) return;
      await closeOv(); exitFs();
    }

    /* ===================== the gamble ===================== */
    function cardFace(c) {
      const suit = SUITS[Math.floor(c / 13)], red = Math.floor(c / 13) < 2, rk = RANKS[c % 13], g = SUIT_GLYPH[suit];
      return '<div class="bob-cface ' + (red ? 'red' : 'blk') + '"><b>' + rk + '<i>' + g + '</i></b><em>' + g + '</em><b class="br">' + rk + '<i>' + g + '</i></b></div>';
    }
    function gambleFlow(hd) {
      return new Promise((resolve) => {
        let offer = hd.offer, sending = false, amount = offer.amount;
        stopCycle(); openOv('gamble');
        el.main.classList.add('gambling');
        const card = h('div', { class: 'bob-card' }, h('div', { class: 'bob-cback', html: '<svg viewBox="0 0 120 56" aria-hidden="true"><path d="' + B.batPath + '"/></svg>' }), h('div', { class: 'bob-cfront' }));
        const amt = h('output', null, fmt(amount)), toCol = h('em'), toSuit = h('em'), stepsEl = h('small', { class: 'bob-gsteps' });
        const hist = h('div', { class: 'bob-ghist', 'aria-label': 'Previous cards' });
        const btn = (choice, label, cls) => h('button', { type: 'button', class: 'bob-gb ' + cls, 'data-c': choice, onclick: () => choose(choice), 'aria-label': 'Gamble on ' + choice }, label);
        const red = btn('red', 'RED', 'red'), black = btn('black', 'BLACK', 'blk');
        const suits = SUITS.map((s) => btn(s, SUIT_GLYPH[s], 'suit ' + (s === 'hearts' || s === 'diamonds' ? 'red' : 'blk')));
        const col = h('button', { type: 'button', class: 'bob-gcollect', onclick: () => collect() }, h('b', null, 'COLLECT'), h('small', null, 'Space'));
        const panel = h('div', { class: 'bob-gamble', role: 'dialog', 'aria-label': 'Gamble your win' },
          h('div', { class: 'bob-ghead' }, h('b', null, 'Gamble'), stepsEl),
          h('div', { class: 'bob-gbody' },
            h('div', { class: 'bob-gcardwrap' }, card, hist),
            h('div', { class: 'bob-gside' },
              h('div', { class: 'bob-gamt' }, h('small', null, 'GAMBLE AMOUNT'), amt),
              h('div', { class: 'bob-grow' }, h('small', null, 'Colour wins'), toCol), h('div', { class: 'bob-gbtns two' }, red, black),
              h('div', { class: 'bob-grow' }, h('small', null, 'Suit wins'), toSuit), h('div', { class: 'bob-gbtns four' }, ...suits))),
          col);
        el.ov.append(panel);
        const paint = () => {
          amt.textContent = fmt(amount); toCol.textContent = fmt(amount * 2) + ' BB'; toSuit.textContent = fmt(amount * 4) + ' BB';
          red.disabled = black.disabled = sending || !offer.canColour; suits.forEach((b) => { b.disabled = sending || !offer.canSuit; });
          stepsEl.textContent = offer.stepsLeft + ' gamble' + (offer.stepsLeft === 1 ? '' : 's') + ' left';
          hist.innerHTML = (offer.hist || []).slice(-5).map((c) => '<i class="' + (Math.floor(c / 13) < 2 ? 'red' : 'blk') + '">' + RANKS[c % 13] + SUIT_GLYPH[SUITS[Math.floor(c / 13)]] + '</i>').join('');
          col.disabled = sending;
        };
        paint();
        el.spin.classList.add('collect'); paintSpin();
        setMsg('Collect ' + fmt(amount) + ' BB, or gamble it on the next card', 'gold');
        const end = (amount2) => { primary = null; el.spin.classList.remove('collect'); el.main.classList.remove('gambling'); paintSpin(); closeOv().then(() => resolve({ amount: amount2 })); };
        async function choose(choice) {
          if (sending) return;
          sending = true; paint(); panel.classList.add('wait'); snd('click');
          let r;
          if (B.online) {
            r = await B.play(ID, 'gamble', { round: hd.round, choice }, 0);
            if (!G) return;
            if (!r) { sending = false; panel.classList.remove('wait'); paint(); return; }
          } else {
            const c = M.drawCard(B.rng), won = M.gambleResolve(c, choice), steps = offer.steps + 1, h2 = (offer.hist || []).concat([c]).slice(-8);
            const a = won ? amount * M.gambleMult(choice) : 0, of = offerOf(a, hd.stake, steps, h2);
            r = { card: c, won, amount: a, offer: of, done: !won || !of.canColour };
          }
          await nap(420); if (!G) return;
          card.lastChild.innerHTML = cardFace(r.card); card.classList.add('up'); snd('card');
          panel.classList.remove('wait');
          panel.classList.add(r.won ? 'won' : 'lost');
          if (r.won) { snd('gwin'); burstAt(card, 'coin', 22); setMsg('The ' + RANKS[r.card % 13] + ' of ' + SUITS[Math.floor(r.card / 13)] + '! Now ' + fmt(r.amount) + ' BB', 'gold'); }
          else { snd('glose'); setMsg('The ' + RANKS[r.card % 13] + ' of ' + SUITS[Math.floor(r.card / 13)] + '. The Book keeps it.', ''); }
          amount = r.amount; offer = r.offer || offer; el.win.textContent = fmt(amount);
          paint();
          await nap(r.done ? 1300 : 1000); if (!G) return;
          if (r.done) { if (r.won && amount > 0) setMsg('Gamble limit reached: collected', 'gold'); end(amount); return; }
          card.classList.remove('up'); panel.classList.remove('won', 'lost');
          sending = false; paint(); setMsg('Collect ' + fmt(amount) + ' BB, or gamble again', 'gold');
        }
        async function collect() {
          if (sending) return;
          sending = true; paint(); snd('click');
          if (B.online) {
            const r = await B.play(ID, 'collect', { round: hd.round }, 0);
            if (!G) return;
            if (!r) { const st = await B.play(ID, 'state', {}, 0); if (!G) return; if (st && !st.open) { end(0); return; } sending = false; paint(); return; }
            end(r.amount); return;
          }
          end(amount);
        }
        primary = collect;
        hd.collect = collect;
      });
    }

    /* ----- a held win left from before (reloaded page): offer it again ----- */
    if (B.online) {
      lockUi(true);
      B.play(ID, 'state', {}, 0).then(async (r) => {
        if (!G) return;
        if (!r || !r.open) { lockUi(false); return; }
        const op = r.open; stake = op.stake;
        if (op.lines >= 1 && op.lines <= 10) { lines = op.lines; paintLines(); }
        if (op.grid) setGrid(op.grid);
        el.win.textContent = fmt(op.amount);
        const g = await gambleFlow({ round: op.round, offer: op, stake: op.stake });
        if (!G) return;
        settle(g); lockUi(false);
      });
    }
    G.unmount = () => { if (window.bobDev) delete window.bobDev; };
  }

  B.registerGame({
    id: ID, name: 'Book of Bats', tagline: 'Open the Book. One symbol expands.', tag: 'Slot', section: 'slots', isNew: true,
    poster: poster(), rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S.dispose(); } G = null; },
  });
})();
