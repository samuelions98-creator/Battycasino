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
