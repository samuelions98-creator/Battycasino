/* ===== bunky math ===== */
/* Bunky Time — pure maths. No DOM. Shared verbatim by the browser game and the Node simulation.
   Every random decision takes an rng() returning a float in [0,1). */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).bunky = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- bet spots ---------- */
  const WORDS = [
    { id: 'BUNKY', letters: ['B', 'U', 'N', 'K', 'Y'] },
    { id: 'TIME', letters: ['T', 'I', 'M', 'E'] },
    { id: 'FLAP', letters: ['F', 'L', 'A', 'P'] },
  ];
  const LETTERS = [].concat(WORDS[0].letters, WORDS[1].letters, WORDS[2].letters);
  const BONUSES = ['bar', 'hang', 'disco', 'vip'];
  const SPOTS = ['one'].concat(LETTERS, BONUSES);
  const WORD_OF = {}; WORDS.forEach((w) => w.letters.forEach((l) => { WORD_OF[l] = w.id; }));
  const kindOf = (spot) => (spot === 'one' ? 'one' : BONUSES.indexOf(spot) > -1 ? 'bonus' : 'letter');
  const ODDS = { one: 1, letter: 25 };          // paid on top of the returned stake
  const MAX_BONUS_X = 10000;                     // cap on any single bonus result (after any Glitterball boost)
  const SPOT_MAX = { one: 25000, letter: 5000, bonus: 5000 };

  /* ---------- the wheel: 64 segments ----------
     26 x "1", 13 letters x 2, Blood Bar x 6, Belfry Disco x 3, Hangin' Alive x 2, VIP Crypt Disco x 1.
     Bonus segments are spread evenly; 1s and letters alternate between them; each letter's two segments sit half a wheel apart. */
  const WHEEL = (function () {
    const bonusAt = { 0: 'vip', 5: 'bar', 11: 'disco', 16: 'bar', 21: 'hang', 27: 'bar', 32: 'disco', 37: 'bar', 43: 'hang', 48: 'bar', 53: 'disco', 59: 'bar' };
    const order = ['B', 'T', 'F', 'U', 'I', 'L', 'N', 'M', 'A', 'K', 'E', 'P', 'Y'];
    const out = []; let k = 0;
    for (let i = 0; i < 64; i++) {
      if (bonusAt[i]) { out.push(bonusAt[i]); continue; }
      out.push(k % 2 === 0 ? 'one' : order[((k - 1) / 2) % 13]);
      k++;
    }
    return out;
  })();
  const N = WHEEL.length;
  const SEGS_OF = {}; WHEEL.forEach((s, i) => { (SEGS_OF[s] = SEGS_OF[s] || []).push(i); });
  const ONE_SEGS = SEGS_OF.one;
  const LETTER_SEGS = []; const BONUS_SEGS = [];
  WHEEL.forEach((s, i) => { const k = kindOf(s); if (k === 'letter') LETTER_SEGS.push(i); else if (k === 'bonus') BONUS_SEGS.push(i); });

  /* ---------- weighted tables ---------- */
  const tbl = (values, weights) => { let total = 0; for (const w of weights) total += w; return { values, weights, total }; };
  function pick(t, rng) {
    let r = rng() * t.total;
    for (let i = 0; i < t.values.length; i++) { r -= t.weights[i]; if (r < 0) return t.values[i]; }
    return t.values[t.values.length - 1];
  }
  const tblMean = (t) => { let m = 0; for (let i = 0; i < t.values.length; i++) m += t.values[i] * t.weights[i]; return m / t.total; };

  /* ---------- the Glitterball: random multipliers every spin ----------
     Every spin it lights 3 of the 26 "1" segments and 2 of the 26 letter segments, each with its own multiplier.
     One spin in four it also lights one of the 12 bonus segments. */
  const BOOST = {
    ones: 3,
    letters: 2,
    bonusChance: 0.25,
    oneMult: tbl([2, 3, 4, 5, 7, 10, 15, 20, 25, 50], [435, 211, 121, 101, 50, 40, 18, 13, 7, 4]),
    letterMult: tbl([2, 3, 4, 5, 7, 10, 15, 20, 25, 50], [470, 234, 119, 93, 41, 27, 9, 4, 2, 1]),
    bonusMult: tbl([2, 3, 5], [60, 30, 10]),
  };
  function chooseDistinct(arr, n, rng) {
    const a = arr.slice(), out = [];
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rng() * (a.length - i)); const t = a[i]; a[i] = a[j]; a[j] = t; out.push(a[i]); }
    return out;
  }
  function drawBoosts(rng) {
    const out = [];
    for (const seg of chooseDistinct(ONE_SEGS, BOOST.ones, rng)) out.push({ seg, mult: pick(BOOST.oneMult, rng) });
    for (const seg of chooseDistinct(LETTER_SEGS, BOOST.letters, rng)) out.push({ seg, mult: pick(BOOST.letterMult, rng) });
    if (rng() < BOOST.bonusChance) out.push({ seg: BONUS_SEGS[Math.floor(rng() * BONUS_SEGS.length)], mult: pick(BOOST.bonusMult, rng) });
    return out;
  }

  /* ---------- bonus 1: The Blood Bar ----------
     Three bartenders, three different multipliers, all mixed before the player picks. The pick only selects. */
  const BAR = tbl([3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100], [173, 223, 164, 128, 102, 73, 43, 34, 22, 16, 12, 9]);
  function playBar(rng) {
    let a, b, c;
    do { a = pick(BAR, rng); b = pick(BAR, rng); c = pick(BAR, rng); } while (a === b || b === c || a === c);
    return { type: 'bar', mults: [a, b, c] };
  }

  /* ---------- bonus 2: Hangin' Alive ----------
     Three teams climb a 16-rung ladder. The machine holds 17 balls: 3 climb balls per team, 2 "everybody up" balls
     and 2 drop balls per team. Each draw is independent (the ball goes back in). A team's second drop ball knocks it
     off and banks the rung it was on; reaching the top rung banks the top prize. Balls for finished teams are ignored.
     The whole draw is generated up front; the player's team pick only selects one of the three results. */
  const HANG = {
    ladder: [2, 3, 4, 5, 7, 10, 12, 15, 20, 25, 35, 50, 75, 100, 150, 250, 500],
    climbPerTeam: 3, allBalls: 2, dropPerTeam: 2, grips: 2, teams: 3,
  };
  HANG.ballTotal = HANG.teams * (HANG.climbPerTeam + HANG.dropPerTeam) + HANG.allBalls;
  function playHang(rng) {
    const top = HANG.ladder.length - 1;
    const level = [0, 0, 0], grips = [HANG.grips, HANG.grips, HANG.grips], done = [false, false, false], how = ['', '', ''];
    const draws = [];
    let alive = 3;
    const up = (t, moved) => { level[t]++; moved.push(t); if (level[t] >= top) { done[t] = true; how[t] = 'top'; alive--; } };
    while (alive > 0) {
      let r = Math.floor(rng() * HANG.ballTotal);
      let kind, team = -1;
      if (r < HANG.allBalls) kind = 'all';
      else {
        r -= HANG.allBalls;
        const per = HANG.climbPerTeam + HANG.dropPerTeam;
        team = Math.floor(r / per); kind = (r % per) < HANG.climbPerTeam ? 'up' : 'drop';
        if (done[team]) continue;            // that team has finished: ball ignored, draw again
      }
      const d = { kind, team, moved: [], out: -1 };
      if (kind === 'all') { for (let t = 0; t < 3; t++) if (!done[t]) up(t, d.moved); }
      else if (kind === 'up') up(team, d.moved);
      else { grips[team]--; if (grips[team] <= 0) { done[team] = true; how[team] = 'drop'; alive--; d.out = team; } }
      d.levels = level.slice(); d.grips = grips.slice();
      draws.push(d);
    }
    return { type: 'hang', draws, levels: level, how, mults: level.map((l) => HANG.ladder[l]) };
  }

  /* ---------- bonus 3 and 4: Belfry Disco and VIP Crypt Disco ----------
     A square floor of multiplier tiles. The dancer starts on the centre tile and collects it, then takes steps:
     the first in any of the four directions, every later one forward, left or right with equal chance (never straight
     back). Every tile landed on is added to the total (again if revisited). Stepping off the floor ends the bonus. */
  const DISCO = { size: 5, tiles: tbl([1, 2, 3, 5, 10, 25], [387, 285, 160, 105, 50, 13]) };
  const VIP = { size: 7, tiles: tbl([2, 3, 5, 10, 20, 50, 100], [400, 260, 180, 108, 40, 9, 3]) };
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // up, right, down, left (row, col)
  function playDisco(rng, cfg, type) {
    const n = cfg.size, c = (n - 1) / 2;
    const grid = new Array(n * n);
    for (let i = 0; i < n * n; i++) grid[i] = pick(cfg.tiles, rng);
    let r = c, q = c, dir = -1, total = grid[r * n + q];
    const steps = [];
    for (;;) {
      if (dir < 0) dir = Math.floor(rng() * 4);
      else { const k = Math.floor(rng() * 3); dir = (dir + (k === 0 ? 0 : k === 1 ? 1 : 3)) % 4; }
      r += DIRS[dir][0]; q += DIRS[dir][1];
      if (r < 0 || r >= n || q < 0 || q >= n) { steps.push({ dir, r, c: q, off: true, value: 0, total }); break; }
      total += grid[r * n + q];
      steps.push({ dir, r, c: q, off: false, value: grid[r * n + q], total });
    }
    return { type, size: n, grid, start: [c, c], steps, total };
  }

  function playBonus(type, rng) {
    if (type === 'bar') return playBar(rng);
    if (type === 'hang') return playHang(rng);
    if (type === 'disco') return playDisco(rng, DISCO, 'disco');
    return playDisco(rng, VIP, 'vip');
  }

  /* ---------- one whole round ----------
     spin(rng, force?) -> { boosts:[{seg,mult}], stop, spot, kind, boost, bonus }
     force (dev/testing only): { stop: segIndex } or { spot: 'vip' } pins where the wheel lands; everything else stays random. */
  function spin(rng, force) {
    const boosts = drawBoosts(rng);
    let stop = Math.floor(rng() * N);
    if (force) {
      if (force.stop != null) stop = force.stop;
      else if (force.spot && SEGS_OF[force.spot]) { const s = SEGS_OF[force.spot]; stop = s[Math.floor(rng() * s.length)]; }
      if (force.boost) { const i = boosts.findIndex((b) => b.seg === stop); if (i > -1) boosts[i].mult = force.boost; else boosts.push({ seg: stop, mult: force.boost }); }
    }
    const spot = WHEEL[stop], kind = kindOf(spot);
    let boost = 1;
    for (const b of boosts) if (b.seg === stop) boost = b.mult;
    return { boosts, stop, spot, kind, boost, bonus: kind === 'bonus' ? playBonus(spot, rng) : null };
  }

  /* Does this round need a player pick before its bonus result is known?  bar: 0..2 bartender, hang: 0..2 team. */
  const needsPick = (outcome) => (outcome.kind === 'bonus' && (outcome.spot === 'bar' || outcome.spot === 'hang') ? 3 : 0);
  /* Used when the player doesn't (or can't) choose in time. */
  const autoPick = (rng, n) => Math.floor(rng() * n);

  /* The bonus game's own multiplier, before any Glitterball boost. */
  function bonusX(outcome, pickIndex) {
    const b = outcome.bonus; if (!b) return 0;
    if (b.type === 'bar' || b.type === 'hang') return b.mults[pickIndex | 0];
    return b.total;
  }
  /* The multiplier actually paid on a winning stake (on top of the stake itself). */
  function winX(outcome, pickIndex) {
    if (outcome.kind === 'one') return ODDS.one * outcome.boost;
    if (outcome.kind === 'letter') return ODDS.letter * outcome.boost;
    return Math.min(MAX_BONUS_X, bonusX(outcome, pickIndex) * outcome.boost);
  }
  /* Total returned to the player for one spot (stake included). Integers in, integers out. */
  function payout(spot, stake, outcome, pickIndex) {
    if (spot !== outcome.spot || !(stake > 0)) return 0;
    return stake + stake * winX(outcome, pickIndex);
  }
  /* settle({spot: stake}, outcome, pick) -> { total, bySpot } */
  function settle(bets, outcome, pickIndex) {
    const bySpot = {}; let total = 0;
    for (const s in bets) { const p = payout(s, bets[s], outcome, pickIndex); if (p > 0) { bySpot[s] = p; total += p; } }
    return { total, bySpot };
  }

  /* ---------- the live show: one shared wheel on a fixed rhythm ----------
     Mirrored exactly in lib/games/bunky.php (bk_timeline, bk_public). Times are seconds; timeline() counts from the
     moment betting opens. Each bonus event's time depends only on the events before it, so revealing them one at a time
     never hints at what comes next. */
  const LIVE = { bet: 15, glit: 5.5, spin: 9, stopAt: 2.2, look: 1.6, land: 3.4, rest: 7, intro: 3.2, shake: 2.4, pick: 10, outro: 6 };
  function timeline(o) {
    const L = LIVE, t = { close: L.bet, spin: L.bet + L.glit };
    t.land = t.spin + L.spin;
    if (o.kind !== 'bonus') { t.end = t.land + 0.4; t.next = t.land + L.rest; return t; }
    const b = o.bonus, at = t.land + L.land; t.bonus = at;
    if (b.type === 'bar') {
      t.pickStart = at + L.intro + L.shake; t.pickEnd = t.pickStart + L.pick;
      t.end = t.pickEnd + 0.6; t.finish = t.end + 3.6;
    } else if (b.type === 'hang') {
      const top = HANG.ladder.length - 1;
      t.pickStart = at + L.intro; t.pickEnd = t.pickStart + L.pick;
      let x = t.pickEnd + 1.6; const ev = [];
      b.draws.forEach((d, k) => {
        ev.push(x);
        const topped = d.moved.some((m) => d.levels[m] >= top);
        x += (k < 8 ? 1.3 : k < 18 ? 1.0 : 0.75) + (d.kind === 'drop' ? 0.5 : 0) + (d.out >= 0 ? 0.7 : 0) + (topped ? 1.0 : 0);
      });
      t.ev = ev; t.finish = x + 0.6; t.end = t.finish;
    } else {
      const n = b.size;
      t.floor = at + L.intro + 0.2; t.first = t.floor + 1.6;
      let x = t.first, r = b.start[0], q = b.start[1]; const ev = [];
      b.steps.forEach((s, k) => {
        const edge = r === 0 || q === 0 || r === n - 1 || q === n - 1;
        x += (k < 8 ? 0.95 : k < 18 ? 0.8 : 0.6) + (edge ? 0.45 : 0);
        ev.push(x); r = s.r; q = s.c;
      });
      t.ev = ev; t.finish = x + 1.5; t.end = t.finish;
    }
    t.next = t.finish + L.outro;
    return t;
  }
  /* The biggest multiplier a round could pay (for the results strip). */
  function topX(o) {
    if (o.kind !== 'bonus') return ODDS[o.kind] * o.boost;
    const b = o.bonus;
    return Math.min(MAX_BONUS_X, (b.type === 'bar' || b.type === 'hang' ? Math.max.apply(null, b.mults) : b.total) * o.boost);
  }
  /* Where the wheel rests for a stop: the pointer is at 12 o'clock and jit (-0.36..0.36) moves it within the segment. */
  function restAngle(stop, jit) {
    const TAU = Math.PI * 2, a = (-Math.PI / 2 - (stop + 0.5 + jit) * (TAU / N)) % TAU;
    return a < 0 ? a + TAU : a;
  }
  /* What every player may know about a round at instant `now`. r: { id, o, tl (absolute times), th0, jit } */
  function reveal(r, now) {
    const L = LIVE, o = r.o, t = r.tl;
    const p = { id: r.id, openAt: t.open, closeAt: t.close, spinAt: t.spin, landAt: t.land, th0: r.th0 };
    if (now >= t.close) p.boosts = o.boosts;
    if (now >= t.spin + L.stopAt) { p.stop = o.stop; p.jit = r.jit; }
    if (now < t.land) return p;
    p.spot = o.spot; p.kind = o.kind; p.boost = o.boost;
    if (now >= Math.max(t.land, t.end - L.look)) { p.endAt = t.end; p.nextAt = t.next; }
    if (o.kind !== 'bonus') return p;
    const b = o.bonus, look = now + L.look;
    const pb = { type: b.type, at: t.bonus };
    if (t.pickStart !== undefined) { pb.pickStart = t.pickStart; pb.pickEnd = t.pickEnd; }
    const evs = (list) => { const out = []; for (let k = 0; k < t.ev.length; k++) { if (t.ev[k] > look) break; out.push(Object.assign({}, list[k], { t: t.ev[k] })); } return out; };
    if (b.type === 'bar') {
      if (now >= t.pickEnd) { pb.mults = b.mults; pb.finish = t.finish; }
    } else if (b.type === 'hang') {
      if (now >= t.pickEnd) {
        pb.ev = evs(b.draws);
        if (pb.ev.length === t.ev.length) { pb.finish = t.finish; pb.mults = b.mults; pb.levels = b.levels; pb.how = b.how; }
      }
    } else {
      pb.floor = t.floor; pb.first = t.first;
      if (look >= t.floor) {
        pb.size = b.size; pb.grid = b.grid; pb.start = b.start; pb.ev = evs(b.steps);
        if (pb.ev.length === t.ev.length) { pb.finish = t.finish; pb.total = b.total; }
      }
    }
    p.bonus = pb;
    return p;
  }

  return {
    WORDS, LETTERS, BONUSES, SPOTS, WORD_OF, kindOf, ODDS, MAX_BONUS_X, SPOT_MAX,
    WHEEL, N, SEGS_OF, ONE_SEGS, LETTER_SEGS, BONUS_SEGS,
    BOOST, BAR, HANG, DISCO, VIP, DIRS, tblMean, pick,
    drawBoosts, playBar, playHang, playDisco, playBonus, spin, needsPick, autoPick, bonusX, winX, payout, settle,
    LIVE, timeline, topX, restAngle, reveal,
  };
});

/* ===== bunky ===== */
/* Bunky Time — the game. A 70s disco money wheel in a bell tower.
   Everything random about a round comes from bunky.math.js; this file only presents it.
   (Math.random is used here for decoration only: sparkle, light spots, where inside the winning segment the pointer rests.) */
(function () {
  'use strict';
  const ID = 'bunky', M = BattyMath.bunky;
  const h = Batty.h, fmt = Batty.fmt, AU = Batty.audio;
  const TAU = Math.PI * 2, SEG = TAU / M.N;
  const CHIPS = [10, 50, 100, 500, 1000, 5000];
  const COL = { mag: '#ff2e93', teal: '#12d6c5', tan: '#ff8a1e', gold: '#ffd23f', lime: '#a6ec2a', red: '#e0173f', ink: '#fff5fb', deep: '#16062e' };
  const WORDCOL = { BUNKY: COL.mag, TIME: COL.teal, FLAP: COL.tan };
  const BON = {
    bar: { short: 'BAR', name: 'The Blood Bar', col: COL.red, line: 'Three bartenders. One of them likes you.' },
    hang: { short: 'HANG', name: "Hangin' Alive", col: COL.lime, line: 'Climb the bell rope. Mind the drop balls.' },
    disco: { short: 'DISCO', name: 'Belfry Disco', col: '#c44dff', line: 'Every tile he lands on is yours.' },
    vip: { short: 'VIP', name: 'VIP Crypt Disco', col: COL.gold, line: 'Bigger floor. Bigger tiles. Your name is on the list.' },
  };
  const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEV = /dev/.test(location.search);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const fmtK = (n) => (n >= 1000 ? (n % 1000 === 0 ? n / 1000 : Math.round(n / 10) / 100) + 'K' : String(n));
  const xs = (x) => fmt(x) + '×';
  const spotCol = (s) => (s === 'one' ? COL.gold : BON[s] ? BON[s].col : WORDCOL[M.WORD_OF[s]]);
  const spotName = (s) => (s === 'one' ? 'Number 1' : BON[s] ? BON[s].name : 'Letter ' + s);

  /* survives leaving and coming back within a session */
  const memo = { chip: 100, quick: false, bets: {}, last: null, hist: [], lastWin: 0 };

  let S = null, G = null;

  /* ---------- little SVG kit ---------- */
  const ICON = {
    bar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18l-9 10z" fill="currentColor"/><path d="M12 13v7M7.5 21h9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="16.5" cy="5.2" r="2.6" fill="#fff" opacity=".85"/></svg>',
    hang: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 2v20M16.5 2v20M7.5 6.5h9M7.5 12h9M7.5 17.500h9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    disco: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v4" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="13.500" r="8.500" fill="currentColor"/><path d="M3.500 13.500h17M12 5v17M5.500 9h13M5.500 18h13M8 6.500c-2 4-2 10 0 14M16 6.500c2 4 2 10 0 14" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="1"/><circle cx="9" cy="10.500" r="1.700" fill="#fff"/></svg>',
    vip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19L1.500 6.500l6 5L12 4l4.500 7.500 6-5L21 19z" fill="currentColor"/><path d="M4 21.500h16" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12h-2" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3.500)"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/></svg>',
    rebet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 11-2.200-5.100M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.500 2L5 13.500h5.500L9.500 22 19 10h-6z" fill="currentColor"/></svg>',
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 0112.500-4.300M19 12a7 7 0 01-12.500 4.300M17 3.500v4.500h-4.500M7 20.500V16h4.500" fill="none" stroke="currentColor" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 9h-5v9H9v-9H4z" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.900 6.300 6.900.800-5.100 4.700 1.400 6.800L12 17.200l-6.100 3.400 1.400-6.800L2.200 9.100l6.900-.800z" fill="currentColor"/></svg>',
    drop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="4.500" stroke-linecap="round"/></svg>',
    stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  /* A cartoon bat. o: {body, wing, acc:'bow'|'band'|'crown'|'', accCol, afro, shades, flares, chain, cls} */
  function bat(o) {
    o = o || {};
    const body = o.body || '#6b3fd1', wing = o.wing || '#3a1a78', ac = o.accCol || COL.gold;
    const wingD = 'M50 58C40 30 20 22 3 34c7 3 9 9 8 17 5-5 11-4 14 2 4-5 10-4 13 3 4-3 8-2 12 2z';
    let s = '<svg viewBox="0 0 120 108" class="bat' + (o.cls ? ' ' + o.cls : '') + '" aria-hidden="true">';
    s += '<g class="wing wl"><path d="' + wingD + '" fill="' + wing + '"/></g><g class="wing wr"><path d="' + wingD + '" fill="' + wing + '" transform="translate(120 0) scale(-1 1)"/></g>';
    if (o.flares) s += '<path d="M52 86l-9 20h15l3-16zM68 86l9 20H62l-3-16z" fill="' + (o.flares === true ? '#fff' : o.flares) + '"/><path d="M43 106h15M62 106h15" stroke="#000" stroke-opacity=".25" stroke-width="2"/>';
    else s += '<path d="M53 88l-3 9M67 88l3 9" stroke="' + wing + '" stroke-width="4" stroke-linecap="round"/>';
    if (o.afro) s += '<g fill="#1c0b16"><circle cx="60" cy="24" r="23"/><circle cx="40" cy="30" r="12"/><circle cx="80" cy="30" r="12"/><circle cx="46" cy="13" r="11"/><circle cx="74" cy="13" r="11"/><circle cx="60" cy="7" r="10"/></g>';
    s += '<path d="M46 26L41 5l15 13zM74 26l5-21-15 13z" fill="' + body + '"/><path d="M46.500 21L44 10l7 8zM73.500 21L76 10l-7 8z" fill="#ff9ac8" opacity=".7"/>';
    s += '<ellipse cx="60" cy="70" rx="19" ry="22" fill="' + body + '"/><ellipse cx="60" cy="74" rx="11" ry="13" fill="#fff" opacity=".16"/>';
    s += '<circle cx="60" cy="38" r="19" fill="' + body + '"/><ellipse cx="54" cy="30" rx="9" ry="5" fill="#fff" opacity=".12"/>';
    if (o.shades) s += '<path d="M42 31h36v5a8 8 0 01-16 0v-1.500h-4V36a8 8 0 01-16 0z" fill="#12060f"/><path d="M46 33.500l5 0M64 33.500l5 0" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".7"/>';
    else s += '<circle cx="52.500" cy="36" r="6" fill="#fff"/><circle cx="67.500" cy="36" r="6" fill="#fff"/><circle cx="53.500" cy="37" r="2.800" fill="#1a0b2e"/><circle cx="66.500" cy="37" r="2.800" fill="#1a0b2e"/><circle cx="54.500" cy="36" r="1" fill="#fff"/><circle cx="67.500" cy="36" r="1" fill="#fff"/>';
    s += '<path d="M51 47q9 8 18 0" fill="none" stroke="#1a0b2e" stroke-width="2.200" stroke-linecap="round"/><path d="M54.500 49l1.600 5.500 1.800-4.600zM62 49.900l1.800 4.600 1.600-5.500z" fill="#fff"/>';
    if (o.acc === 'bow') s += '<path d="M60 60l-11-6v12zM60 60l11-6v12z" fill="' + ac + '"/><circle cx="60" cy="60" r="3" fill="#fff"/>';
    if (o.acc === 'band') s += '<path d="M42 27q18-9 36 0l-1 6q-17-8-34 0z" fill="' + ac + '"/>';
    if (o.acc === 'crown') s += '<path d="M45 20l-3-15 9 8 9-12 9 12 9-8-3 15z" fill="' + COL.gold + '" stroke="#a36a00" stroke-width="1.500"/><circle cx="60" cy="14" r="2.500" fill="' + COL.mag + '"/>';
    if (o.chain) s += '<path d="M48 58q12 12 24 0" fill="none" stroke="' + COL.gold + '" stroke-width="2.400" stroke-dasharray="1.500 2.500" stroke-linecap="round"/><circle cx="60" cy="67" r="4" fill="' + COL.gold + '"/>';
    return s + '</svg>';
  }

  /* ---------- lobby poster ---------- */
  function poster() {
    const cx = 160, cy = 452, R = 205, n = 26;
    const fills = ['#3a1a78', COL.mag, '#2a1166', COL.teal, '#3a1a78', COL.tan, '#2a1166', COL.red, '#3a1a78', COL.mag, '#2a1166', '#c44dff', '#3a1a78', COL.teal, '#2a1166', COL.gold, '#3a1a78', COL.tan];
    const labs = ['1', 'B', '1', 'T', '1', 'F', '1', '', '1', 'U', '1', '', '1', 'I', '1', '', '1', 'L'];
    let segs = '';
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI + (i * Math.PI) / n * 1.0 - 0.02, a1 = -Math.PI + ((i + 1) * Math.PI) / n - 0.02;
      const p = (r, a) => (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
      const f = fills[i % fills.length], lab = labs[i % labs.length];
      segs += '<path d="M' + p(R, a0) + 'A' + R + ' ' + R + ' 0 0 1 ' + p(R, a1) + 'L' + p(70, a1) + 'A70 70 0 0 0 ' + p(70, a0) + 'Z" fill="' + f + '" stroke="#ffe9a8" stroke-opacity=".55" stroke-width="1"/>';
      const am = (a0 + a1) / 2, deg = (am * 180) / Math.PI + 90;
      if (lab) segs += '<text x="0" y="0" transform="translate(' + p(R - 22, am).replace(' ', ',') + ') rotate(' + deg.toFixed(1) + ')" text-anchor="middle" dominant-baseline="central" font-family="Bungee, \'Arial Black\', Impact, sans-serif" font-size="19" fill="' + (lab === '1' ? COL.gold : '#fff') + '">' + lab + '</text>';
    }
    let bulbs = '';
    for (let i = 0; i <= 22; i++) { const a = -Math.PI + (i * Math.PI) / 22; bulbs += '<circle cx="' + (cx + (R + 9) * Math.cos(a)).toFixed(1) + '" cy="' + (cy + (R + 9) * Math.sin(a)).toFixed(1) + '" r="3.600" fill="' + (i % 2 ? '#fff6c9' : '#ffb347') + '"/>'; }
    let facets = '';
    for (let j = -3; j <= 3; j++) facets += '<path d="M' + (160 - Math.sqrt(38 * 38 - j * j * 100)).toFixed(1) + ' ' + (58 + j * 10) + 'H' + (160 + Math.sqrt(38 * 38 - j * j * 100)).toFixed(1) + '" stroke="#2a0e55" stroke-opacity=".5"/><ellipse cx="160" cy="58" rx="' + Math.abs(j) * 11 + '" ry="38" fill="none" stroke="#2a0e55" stroke-opacity=".4"/>';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="bunky-p-bg" cx="50%" cy="18%" r="95%"><stop offset="0" stop-color="#7a1fb8"/><stop offset=".45" stop-color="#2a0e55"/><stop offset="1" stop-color="#0c031c"/></radialGradient>' +
      '<radialGradient id="bunky-p-ball" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#d9c8ff"/><stop offset="1" stop-color="#5a3aa8"/></radialGradient>' +
      '<linearGradient id="bunky-p-logo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".5" stop-color="' + COL.gold + '"/><stop offset="1" stop-color="' + COL.tan + '"/></linearGradient>' +
      '<radialGradient id="bunky-p-hub" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#a35a00"/></radialGradient></defs>' +
      '<rect width="320" height="400" fill="url(#bunky-p-bg)"/>' +
      '<g opacity=".5"><path d="M160 58L-30 400h90z" fill="' + COL.mag + '" opacity=".35"/><path d="M160 58L350 400h-90z" fill="' + COL.teal + '" opacity=".3"/><path d="M160 58L100 400h120z" fill="' + COL.tan + '" opacity=".22"/></g>' +
      '<g fill="#fff"><circle cx="38" cy="96" r="5" opacity=".5"/><circle cx="286" cy="120" r="6" opacity=".4"/><circle cx="62" cy="208" r="4" opacity=".5"/><circle cx="268" cy="214" r="4.500" opacity=".45"/><circle cx="24" cy="160" r="3" opacity=".5"/><circle cx="300" cy="64" r="3.500" opacity=".5"/><circle cx="84" cy="40" r="3" opacity=".5"/><circle cx="236" cy="30" r="3.500" opacity=".5"/></g>' +
      '<path d="M160 0v22" stroke="#cdb8ff" stroke-width="3"/><circle cx="160" cy="58" r="38" fill="url(#bunky-p-ball)"/>' + facets +
      '<path d="M140 36l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/><path d="M186 70l2 4.500 4.500 2-4.500 2-2 4.500-2-4.500-4.500-2 4.500-2z" fill="#fff"/>' +
      segs + bulbs +
      '<circle cx="' + cx + '" cy="' + cy + '" r="70" fill="url(#bunky-p-hub)"/>' +
      '<path d="M160 228l-13-26h26z" fill="' + COL.tan + '" stroke="#fff3a0" stroke-width="2"/>' +
      '<g transform="translate(96 268) scale(1.07)">' + bat({ body: '#8b4dff', wing: '#4b1fa8', afro: true, shades: true, flares: '#fff', chain: true }).replace('<svg ', '<svg width="120" height="108" ') + '</g>' +
      '<text x="160" y="156" text-anchor="middle" textLength="286" lengthAdjust="spacingAndGlyphs" font-family="Monoton, Bungee, \'Arial Black\', Impact, sans-serif" font-size="70" fill="#1a0533" stroke="#1a0533" stroke-width="10" stroke-linejoin="round">BUNKY</text>' +
      '<text x="160" y="156" text-anchor="middle" textLength="286" lengthAdjust="spacingAndGlyphs" font-family="Monoton, Bungee, \'Arial Black\', Impact, sans-serif" font-size="70" fill="url(#bunky-p-logo)">BUNKY</text>' +
      '<g transform="rotate(-5 160 196)"><rect x="92" y="170" width="136" height="44" rx="10" fill="' + COL.mag + '" stroke="#fff" stroke-width="3"/><text x="160" y="204" text-anchor="middle" textLength="108" lengthAdjust="spacingAndGlyphs" font-family="Bungee, \'Arial Black\', Impact, sans-serif" font-size="34" fill="#fff">TIME</text></g>' +
      '</svg>';
  }

  /* ---------- rules ---------- */
  function rules() {
    const rows = (t) => t.values.map((v, i) => '<tr><td>' + v + '×</td><td>' + ((t.weights[i] / t.total) * 100).toFixed(1) + '%</td></tr>').join('');
    return '<h3>The live show</h3><p>Online, Bunky Time is one shared wheel for the whole casino, spinning on its own clock. Every round opens with a ' + M.LIVE.bet + '-second betting window that everyone shares; then the Glitterball lights its segments, the wheel spins and every player watches the same result and the same bonus game. You can join at any moment, watch without betting, or leave mid-round: your chips stay in and any win is paid straight to your balance. Picks inside a bonus (bartender or team) have a ' + M.LIVE.pick + '-second countdown; if you do not choose, one is picked for you at random, which does not change the return. Practice mode (offline) is a private wheel you spin yourself.</p>' +
      '<h3>How it works</h3><p>Put chips on any spots you fancy before betting closes. The wheel has 64 segments. If the pointer stops on a spot you backed, that spot pays; every other chip is lost. Each spot is its own bet, and your total stake is the sum of your chips.</p>' +
      '<table><tr><th>Spot</th><th>Segments</th><th>Pays</th></tr>' +
      '<tr><td>1</td><td>26</td><td>1:1</td></tr>' +
      '<tr><td>Each letter of BUNKY, TIME, FLAP</td><td>2 each</td><td>25:1</td></tr>' +
      '<tr><td>The Blood Bar</td><td>6</td><td>bonus game</td></tr>' +
      '<tr><td>Belfry Disco</td><td>3</td><td>bonus game</td></tr>' +
      '<tr><td>Hangin\' Alive</td><td>2</td><td>bonus game</td></tr>' +
      '<tr><td>VIP Crypt Disco</td><td>1</td><td>bonus game</td></tr></table>' +
      '<p>Winning chips come back with the win. The word buttons put your chip on every letter of that word in one tap. Spot limits: ' + fmt(M.SPOT_MAX.one) + ' BB on 1, ' + fmt(M.SPOT_MAX.letter) + ' BB on each letter and each bonus.</p>' +
      '<h3>The Glitterball</h3><p>Before every spin the Glitterball lights ' + M.BOOST.ones + ' of the "1" segments and ' + M.BOOST.letters + ' letter segments with multipliers from 2× to 50×. One spin in four it also lights a bonus segment with 2×, 3× or 5×. Land on a lit segment and that payout is multiplied (a lit bonus segment multiplies the bonus result).</p>' +
      '<h3>The Blood Bar</h3><p>Three bartenders each mix a different multiplier (3× to 100×) before you choose. Pick one and you win that multiplier times your Bar bet. All three are then shown. If you do not choose in time one is picked at random.</p>' +
      '<h3>Hangin\' Alive</h3><p>Back one of three teams on the bell rope. Balls are drawn from 17 (and put back each time): 3 climb balls per team, 2 "everybody up" balls and 2 slip balls per team. A team\'s second slip knocks it off and banks the rung it reached. The rope has 17 rungs: ' + M.HANG.ladder.map((x) => x + '×').join(', ') + '. Your team\'s rung times your bet is the win.</p>' +
      '<h3>Belfry Disco and VIP Crypt Disco</h3><p>The dancer starts in the middle of the floor and collects that tile. He then steps one tile at a time: the first step in any direction, then forward, left or right with equal chance, never straight back. Every tile he lands on is added to the total, again if he comes back to it. Stepping off the floor ends the dance and pays the total times your bet. Belfry Disco is a 5×5 floor, VIP Crypt Disco is 7×7.</p>' +
      '<table><tr><th>Belfry tile</th><th>Chance</th></tr>' + rows(M.DISCO.tiles) + '</table>' +
      '<table><tr><th>VIP tile</th><th>Chance</th></tr>' + rows(M.VIP.tiles) + '</table>' +
      '<h3>Small print</h3><p>You only win a bonus game if you have a chip on that bonus spot; otherwise you watch it play out. No single bonus result can exceed ' + fmt(M.MAX_BONUS_X) + '× the bet on that spot, Glitterball included. If you leave during a pick, one is made for you at random and any win is banked. Batty Bucks are play money with no cash value.</p>' +
      '<p class="rtp">Tested return: 96.0% on every bet spot. Exact calculation: 1 96.00%, any letter 96.00%, Blood Bar 96.00%, Hangin\' Alive 96.02%, Belfry Disco 95.98%, VIP Crypt Disco 96.02%. Checked over 30,000,000 simulated rounds plus 10,000,000 plays of each bonus game. Your choice of bartender or team does not change the return.</p>';
  }

  /* ---------- sound: Bunky's own kit ---------- */
  const snd = {
    tick(v) { AU.tone({ f: 1500 + Math.random() * 260, f2: 900, d: 0.022, type: 'square', v: 0.035 + 0.03 * v }); AU.noise({ d: 0.014, v: 0.05, hp: 3500 }); },
    glit(i) { const f = [1319, 1568, 1760, 2093, 2349, 2637][i % 6]; AU.tone({ f, d: 0.35, type: 'sine', v: 0.16 }); AU.tone({ f: f * 2, d: 0.22, type: 'triangle', v: 0.06, t: 0.03 }); AU.noise({ d: 0.12, v: 0.03, hp: 7000 }); },
    wah(f, t) { AU.tone({ f: f || 330, f2: (f || 330) * 1.5, d: 0.11, type: 'sawtooth', v: 0.07, t: t || 0 }); },
    stab(t) { [392, 494, 587, 784].forEach((f) => AU.tone({ f, d: 0.22, type: 'sawtooth', v: 0.05, t: t || 0 })); },
    rise() { for (let i = 0; i < 10; i++) AU.tone({ f: 220 * Math.pow(2, i / 6), d: 0.12, type: 'sawtooth', v: 0.06, t: i * 0.07 }); AU.noise({ d: 0.8, v: 0.06, lp: 400, f2: 6000 }); },
    kick(v) { AU.tone({ f: 150, f2: 45, d: 0.14, type: 'sine', v: v || 0.3 }); },
    hat(v) { AU.noise({ d: 0.035, v: v || 0.05, hp: 7000 }); },
    clap() { AU.noise({ d: 0.09, v: 0.12, hp: 1400 }); AU.noise({ d: 0.07, v: 0.08, hp: 1400, t: 0.018 }); },
    shake() { AU.noise({ d: 0.06, v: 0.09, hp: 2500 }); },
    pour() { AU.noise({ d: 0.5, v: 0.08, lp: 900, f2: 2600 }); AU.tone({ f: 300, f2: 900, d: 0.5, type: 'sine', v: 0.06 }); },
    heart() { AU.tone({ f: 70, f2: 40, d: 0.12, type: 'sine', v: 0.3 }); AU.tone({ f: 60, f2: 38, d: 0.14, type: 'sine', v: 0.22, t: 0.16 }); },
    fall() { AU.tone({ f: 700, f2: 90, d: 0.55, type: 'sawtooth', v: 0.09 }); AU.noise({ d: 0.2, v: 0.14, lp: 500, t: 0.5 }); },
    bell() { [392, 587, 784, 988].forEach((f, i) => AU.tone({ f, d: 1.4, type: 'sine', v: 0.12 - i * 0.02 })); },
    win(big) { const n = Batty.notes; AU.seq(big ? [n.E5, n.G5, n.B5, n.E6, n.B5, [n.E6, 3]] : [n.E5, n.G5, [n.B5, 2]], { step: 0.085, type: 'sawtooth', v: 0.1 }); snd.stab(big ? 0.5 : 0.25); },
  };
  /* A quiet four-on-the-floor loop on the scope's interval, so it dies with the game. */
  const groove = {
    id: 0, step: 0, level: 1, bass: [82.4, 82.4, 164.8, 82.4, 98, 98, 196, 110],
    start(level) { this.stop(); if (!S) return; this.level = level || 1; this.step = 0; this.id = S.interval(() => this.tick(), 125); },
    stop() { if (this.id && S) S.clear(this.id); this.id = 0; },
    tick() {
      if (AU.muted) return;
      const s = this.step++ % 16, L = this.level;
      if (s % 4 === 0) snd.kick(0.16 * L);
      if (s % 4 === 2) snd.hat(0.05 * L); else if (s % 2 === 1) snd.hat(0.02 * L);
      if (s % 8 === 4 && L >= 1) AU.noise({ d: 0.06, v: 0.05 * L, hp: 1800 });
      if (s % 2 === 0) AU.tone({ f: this.bass[(s / 2) | 0], d: 0.11, type: 'triangle', v: 0.1 * L });
      if (L >= 1 && (s === 3 || s === 10)) snd.wah(s === 3 ? 330 : 392);
    },
  };

  Batty.registerGame({
    id: ID,
    name: 'Bunky Time',
    tagline: 'The live disco wheel in the belfry. One show for everyone, four bonus games, glitter on every spin.',
    tag: 'Live game show',
    poster: poster(),
    rules,
    section: 'live',
    mount(root, B) { S = B.scope(); G = Batty.online ? buildLive(root) : build(root); },
    unmount() {
      if (G) G.leave();
      groove.stop();
      if (S) S.dispose();
      S = null; G = null;
      if (DEV) { try { delete window.__bunkyDev; } catch (e) { window.__bunkyDev = undefined; } }
    },
  });

  /* =====================================================================
     THE WHEEL — canvas. Segment i spans angles [i*SEG, (i+1)*SEG] on the face; the pointer sits at 12 o'clock.
     ===================================================================== */
  const FONT_D = 'Bungee, "Bowlby One", "Arial Black", Impact, sans-serif';
  const SEGSTYLE = (function () {
    let ones = 0;
    return M.WHEEL.map((s) => {
      if (s === 'one') return { k: 'one', g: (ones++ % 2) ? ['#1c0a48', '#3b1b8c'] : ['#2a1166', '#5226b4'], txt: '1', tc: COL.gold, key: 'one' + (ones % 2) };
      if (s === 'bar') return { k: 'bonus', g: ['#4f0514', '#f01d48'], txt: 'BAR', tc: '#fff1d6', key: s };
      if (s === 'hang') return { k: 'bonus', g: ['#2c6304', '#b6f53a'], txt: 'HANG', tc: '#12300a', key: s };
      if (s === 'disco') return { k: 'bonus', g: ['#4a10b8', '#ff5ad0'], txt: 'DISCO', tc: '#fff', key: s };
      if (s === 'vip') return { k: 'bonus', g: ['#8a5a00', '#ffe680'], txt: 'VIP', tc: '#2a1500', key: s };
      const w = M.WORD_OF[s];
      return { k: 'letter', g: w === 'BUNKY' ? ['#7d0b45', '#ff2e93'] : w === 'TIME' ? ['#05584f', '#14dccb'] : ['#8a3f02', '#ff8a1e'], txt: s, tc: '#fff', key: w };
    });
  })();

  function makeWheel(stage, cv, opts) {
    const c = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, R = 100, cx = 0, cy = 0, narrow = true, zmax = 2, face = null, faceDirty = true;
    const st = {
      th: Math.random() * TAU, vel: 0, drift: 0.05, anim: null, lastB: null, flap: 0, lastTick: 0,
      zoom: 0, zoomT: 0, boosts: [], shown: 0, beams: [], land: -1, landT: 0, spot: 0, spotT: 0,
      chase: 0, party: 0, hub: 0, t: 0,
    };
    const sprites = {};
    function glow(col, r) {
      const key = col + r; if (sprites[key]) return sprites[key];
      const s = document.createElement('canvas'); s.width = s.height = r * 2; const x = s.getContext('2d');
      const g = x.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2); return (sprites[key] = s);
    }
    const spots = [];
    const SPOTCOL = ['rgba(255,46,147,.5)', 'rgba(18,214,197,.45)', 'rgba(255,138,30,.45)', 'rgba(255,255,255,.4)', 'rgba(170,90,255,.5)'];
    for (let i = 0; i < 16; i++) spots.push({ a: 0.08 + Math.random() * 0.16, b: 0.07 + Math.random() * 0.15, p: Math.random() * TAU, q: Math.random() * TAU, r: 0.05 + Math.random() * 0.07, col: SPOTCOL[i % SPOTCOL.length] });

    function layout() {
      const r = stage.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      narrow = W < 700;
      const top = narrow ? 50 : 34, OUT = 1.085;
      /* the live show keeps a strip on the left for the players' rail (desktop only) */
      const il = opts && opts.inset && !narrow ? opts.inset(W, H) : 0, WW = W - il;
      if (narrow) R = Math.min((WW * 0.485) / OUT, (H - top - 4) / (OUT * 1.5));
      else R = Math.min((WW * 0.46) / OUT, (H - top - 40) / (OUT * 2));
      R = Math.max(60, R);
      cx = il + WW / 2; cy = top + R * OUT;
      zmax = clamp(58 / (R * SEG), 1.5, 2.8);
      faceDirty = true;
    }

    /* ----- the rotating face ----- */
    function icon(x, kind, s, col) {
      x.fillStyle = col; x.strokeStyle = col; x.lineWidth = s * 0.16; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath();
      if (kind === 'bar') {
        x.moveTo(-s * 0.55, -s * 0.5); x.lineTo(s * 0.55, -s * 0.5); x.lineTo(0, s * 0.1); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(0, 0); x.lineTo(0, s * 0.5); x.moveTo(-s * 0.3, s * 0.55); x.lineTo(s * 0.3, s * 0.55); x.stroke();
      } else if (kind === 'hang') {
        x.moveTo(-s * 0.3, -s * 0.6); x.lineTo(-s * 0.3, s * 0.6); x.moveTo(s * 0.3, -s * 0.6); x.lineTo(s * 0.3, s * 0.6);
        for (let j = -1; j <= 1; j++) { x.moveTo(-s * 0.3, j * s * 0.36); x.lineTo(s * 0.3, j * s * 0.36); }
        x.stroke();
      } else if (kind === 'disco') {
        x.arc(0, 0, s * 0.52, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(40,0,80,.55)'; x.lineWidth = s * 0.07; x.beginPath();
        x.moveTo(-s * 0.52, 0); x.lineTo(s * 0.52, 0); x.moveTo(0, -s * 0.52); x.lineTo(0, s * 0.52); x.moveTo(-s * 0.42, -s * 0.28); x.lineTo(s * 0.42, -s * 0.28); x.moveTo(-s * 0.42, s * 0.28); x.lineTo(s * 0.42, s * 0.28); x.stroke();
      } else {
        x.moveTo(-s * 0.55, s * 0.4); x.lineTo(-s * 0.62, -s * 0.35); x.lineTo(-s * 0.25, 0); x.lineTo(0, -s * 0.55); x.lineTo(s * 0.25, 0); x.lineTo(s * 0.62, -s * 0.35); x.lineTo(s * 0.55, s * 0.4); x.closePath(); x.fill();
      }
    }
    function drawFace(x, R) {
      const ro = R * 0.9, ri = R * 0.3, grads = {};
      /* peg rail */
      let g = x.createRadialGradient(0, 0, ro, 0, 0, R); g.addColorStop(0, '#0d0320'); g.addColorStop(0.5, '#3a1b70'); g.addColorStop(1, '#12052a');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
      for (let i = 0; i < M.N; i++) {
        const s = SEGSTYLE[i], a0 = i * SEG, a1 = a0 + SEG;
        if (!grads[s.key]) { const gg = x.createRadialGradient(0, 0, ri, 0, 0, ro); gg.addColorStop(0, s.g[0]); gg.addColorStop(0.62, s.g[1]); gg.addColorStop(1, s.g[1]); grads[s.key] = gg; }
        x.fillStyle = grads[s.key];
        x.beginPath(); x.arc(0, 0, ro, a0, a1); x.arc(0, 0, ri, a1, a0, true); x.closePath(); x.fill();
      }
      /* gloss band + separators */
      g = x.createRadialGradient(0, 0, ri, 0, 0, ro); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(0.86, 'rgba(255,255,255,0)'); g.addColorStop(0.93, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, ro, 0, TAU); x.arc(0, 0, ri, 0, TAU, true); x.fill('evenodd');
      x.strokeStyle = 'rgba(255,226,150,.75)'; x.lineWidth = Math.max(0.6, R * 0.004); x.beginPath();
      for (let i = 0; i < M.N; i++) { const a = i * SEG; x.moveTo(Math.cos(a) * ri, Math.sin(a) * ri); x.lineTo(Math.cos(a) * ro, Math.sin(a) * ro); }
      x.stroke();
      /* labels */
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      const fs = R * 0.074, wmax = R * 0.079;
      for (let i = 0; i < M.N; i++) {
        const s = SEGSTYLE[i];
        x.save(); x.rotate((i + 0.5) * SEG);
        if (s.k === 'bonus') {
          x.save(); x.translate(R * 0.818, 0); x.rotate(Math.PI / 2); icon(x, M.WHEEL[i], R * 0.07, s.tc); x.restore();
          x.translate(R * 0.56, 0); x.rotate(Math.PI);
          x.font = '400 ' + (R * 0.06).toFixed(1) + 'px ' + FONT_D; x.fillStyle = s.tc;
          x.fillText(s.txt, 0, R * 0.003, R * 0.36);
        } else {
          x.save(); x.translate(R * 0.8, 0); x.rotate(Math.PI / 2);
          x.font = '400 ' + (s.k === 'one' ? fs * 1.12 : fs).toFixed(1) + 'px ' + FONT_D;
          x.lineWidth = R * 0.012; x.strokeStyle = 'rgba(20,4,40,.75)'; x.strokeText(s.txt, 0, 0, wmax);
          x.fillStyle = s.tc; x.fillText(s.txt, 0, 0, wmax);
          x.restore();
          /* little studs running to the hub */
          x.fillStyle = s.k === 'one' ? 'rgba(255,210,63,.5)' : 'rgba(255,255,255,.6)';
          for (let j = 0; j < 3; j++) { const rr = R * (0.66 - j * 0.1), d = R * (0.011 - j * 0.002); x.beginPath(); x.arc(rr, 0, d, 0, TAU); x.fill(); }
        }
        x.restore();
      }
      /* inner collar */
      g = x.createRadialGradient(0, 0, R * 0.2, 0, 0, ri); g.addColorStop(0, '#12052a'); g.addColorStop(0.6, '#4a2496'); g.addColorStop(1, '#1b0a40');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, ri, 0, TAU); x.fill();
      x.strokeStyle = COL.gold; x.lineWidth = R * 0.008; x.beginPath(); x.arc(0, 0, ri, 0, TAU); x.stroke();
      x.beginPath(); x.arc(0, 0, ro, 0, TAU); x.stroke();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; x.fillStyle = [COL.mag, COL.teal, COL.tan, COL.gold][i % 4]; x.beginPath(); x.arc(Math.cos(a) * R * 0.262, Math.sin(a) * R * 0.262, R * 0.012, 0, TAU); x.fill(); }
      /* pegs */
      for (let i = 0; i < M.N; i++) {
        const a = i * SEG, px = Math.cos(a) * R * 0.95, py = Math.sin(a) * R * 0.95, pr = R * 0.0135;
        x.fillStyle = '#7a4a00'; x.beginPath(); x.arc(px, py + pr * 0.3, pr, 0, TAU); x.fill();
        x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(px, py, pr, 0, TAU); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(px - pr * 0.3, py - pr * 0.3, pr * 0.4, 0, TAU); x.fill();
      }
    }
    function bakeFace() {
      const px = Math.min(2048, Math.ceil(R * 2 * dpr));
      if (!face) face = document.createElement('canvas');
      face.width = face.height = px;
      const x = face.getContext('2d'); x.setTransform(px / (R * 2), 0, 0, px / (R * 2), px / 2, px / 2);
      drawFace(x, R); faceDirty = false;
    }

    /* ----- per-frame pieces ----- */
    function wedge(a0, a1, r0, r1) { c.beginPath(); c.arc(0, 0, r1, a0, a1); c.arc(0, 0, r0, a1, a0, true); c.closePath(); }
    function drawBoosts(t) {
      for (let i = 0; i < st.shown && i < st.boosts.length; i++) {
        const b = st.boosts[i], a0 = b.seg * SEG, pulse = 0.5 + 0.5 * Math.sin(t / 170 + i * 1.7), age = Math.min(1, (t - b.t0) / 320);
        c.save();
        wedge(a0, a0 + SEG, R * 0.3, R * 0.9);
        c.fillStyle = 'rgba(255,255,255,' + (0.16 + 0.16 * pulse + (1 - age) * 0.6).toFixed(3) + ')'; c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = R * 0.012; c.shadowColor = COL.gold; c.shadowBlur = R * 0.05; c.stroke();
        c.restore();
      }
      for (let i = 0; i < st.shown && i < st.boosts.length; i++) {
        const b = st.boosts[i], age = Math.min(1, (t - b.t0) / 320), pop = 1 + (1 - age) * 0.9;
        const kind = SEGSTYLE[b.seg].k, rr = R * (kind === 'bonus' ? 0.4 : (b.seg % 4 < 2 ? 0.66 : 0.56));
        c.save(); c.rotate((b.seg + 0.5) * SEG); c.translate(rr, 0); c.rotate(Math.PI / 2); c.scale(pop, pop);
        const txt = b.mult + '×', fh = R * 0.062; c.font = '400 ' + fh.toFixed(1) + 'px ' + FONT_D;
        const tw = Math.max(R * 0.1, c.measureText(txt).width + fh * 0.7), th = fh * 1.45;
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = R * 0.02;
        c.fillStyle = b.mult >= 10 ? COL.mag : '#fff'; rr2(c, -tw / 2, -th / 2, tw, th, th / 2); c.fill();
        c.shadowBlur = 0; c.lineWidth = R * 0.008; c.strokeStyle = COL.gold; c.stroke();
        c.fillStyle = b.mult >= 10 ? '#fff' : '#2a0e55'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, fh * 0.06);
        c.restore();
      }
    }
    function rr2(x, l, t, w, hh, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + hh, r); x.arcTo(l + w, t + hh, l, t + hh, r); x.arcTo(l, t + hh, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }
    function drawBeams(t) {
      for (const b of st.beams) {
        const k = (t - b.t0) / 520; if (k >= 1) continue;
        const a = (b.seg + 0.5) * SEG;
        c.save(); c.rotate(a);
        const g = c.createLinearGradient(0, 0, R * 0.9, 0); g.addColorStop(0, 'rgba(255,255,255,' + (0.95 * (1 - k)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,210,63,' + (0.5 * (1 - k)).toFixed(3) + ')');
        c.fillStyle = g; c.globalCompositeOperation = 'lighter';
        c.beginPath(); c.moveTo(0, 0); c.lineTo(R * 0.9, -R * 0.9 * Math.tan(SEG / 2)); c.lineTo(R * 0.9, R * 0.9 * Math.tan(SEG / 2)); c.closePath(); c.fill();
        c.restore();
      }
      st.beams = st.beams.filter((b) => t - b.t0 < 520);
    }
    function drawRim(t) {
      /* fixed outer frame with chasing bulbs */
      const g = c.createRadialGradient(0, 0, R, 0, 0, R * 1.085); g.addColorStop(0, '#7a4a00'); g.addColorStop(0.35, '#ffd86a'); g.addColorStop(0.7, '#c98a12'); g.addColorStop(1, '#5a3200');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 1.085, 0, TAU); c.arc(0, 0, R, 0, TAU, true); c.fill('evenodd');
      const n = 32, br = R * 0.026, on = glow('rgba(255,244,200,1)', 24), halo = glow('rgba(255,190,80,.9)', 24);
      const step = Math.floor(st.chase);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2 + TAU / n / 2, px = Math.cos(a) * R * 1.043, py = Math.sin(a) * R * 1.043;
        let lit;
        if (st.party > 0) lit = (i + Math.floor(t / 110)) % 2 === 0;
        else lit = ((i - step) % 4 + 4) % 4 === 0 || ((i - step) % 4 + 4) % 4 === 1 && st.vel > 2;
        if (lit) { c.globalCompositeOperation = 'lighter'; c.drawImage(halo, px - br * 3, py - br * 3, br * 6, br * 6); c.globalCompositeOperation = 'source-over'; c.drawImage(on, px - br * 1.3, py - br * 1.3, br * 2.6, br * 2.6); c.fillStyle = '#fffbe6'; }
        else c.fillStyle = '#8a5a14';
        c.beginPath(); c.arc(px, py, br * 0.72, 0, TAU); c.fill();
      }
    }
    function drawHub(t) {
      const r = R * 0.205;
      c.save();
      c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = R * 0.05;
      const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#d8c8ff'); g.addColorStop(0.75, '#7a58d6'); g.addColorStop(1, '#2a1166');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.shadowBlur = 0; c.clip();
      c.strokeStyle = 'rgba(30,8,70,.45)'; c.lineWidth = Math.max(0.5, r * 0.02);
      const spin = t / 2600;
      for (let j = -3; j <= 3; j++) { const y = (j / 4) * r, w = Math.sqrt(r * r - y * y); c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); }
      for (let k = 0; k < 6; k++) { const ph = ((k / 6 + spin) % 1) * Math.PI, xr = Math.abs(Math.cos(ph)) * r; c.beginPath(); c.ellipse(0, 0, xr, r, 0, 0, TAU); c.stroke(); }
      /* travelling glints */
      for (let k = 0; k < 14; k++) {
        const lat = ((k * 0.618) % 1 - 0.5) * 2.4, lon = k * 2.4 + spin * TAU * 0.5, cz = Math.cos(lon);
        if (cz <= 0.05) continue;
        const gx = Math.sin(lon) * Math.cos(lat) * r * 0.92, gy = Math.sin(lat) * r * 0.92, s = r * 0.11 * cz;
        c.fillStyle = [COL.mag, '#fff', COL.teal, '#fff', COL.tan][k % 5]; c.globalAlpha = 0.35 + 0.6 * cz * (0.5 + 0.5 * Math.sin(t / 130 + k));
        c.fillRect(gx - s, gy - s * 0.8, s * 2, s * 1.6);
      }
      c.globalAlpha = 1;
      if (st.hub > 0.01) { c.fillStyle = 'rgba(255,255,255,' + (st.hub * 0.85).toFixed(3) + ')'; c.fillRect(-r, -r, r * 2, r * 2); }
      c.restore();
      c.strokeStyle = COL.gold; c.lineWidth = R * 0.012; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      if (st.hub > 0.01) { const s = glow('rgba(255,255,255,.9)', 64), k = r * (1.6 + st.hub * 2.2); c.globalCompositeOperation = 'lighter'; c.globalAlpha = st.hub; c.drawImage(s, -k, -k, k * 2, k * 2); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    }
    function drawPointer() {
      const py = -R * 1.11, len = R * 0.2, w = R * 0.062;
      c.save(); c.translate(0, py); c.rotate(-st.flap);
      c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = R * 0.04; c.shadowOffsetY = R * 0.012;
      const g = c.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, '#ffb347'); g.addColorStop(0.5, '#fff3a0'); g.addColorStop(1, '#e06a00');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, len); c.quadraticCurveTo(w * 1.5, len * 0.25, w, -w * 0.2); c.arc(0, -w * 0.2, w, 0, Math.PI, true); c.quadraticCurveTo(-w * 1.5, len * 0.25, 0, len); c.closePath(); c.fill();
      c.shadowColor = 'transparent'; c.lineWidth = R * 0.008; c.strokeStyle = '#7a3a00'; c.stroke();
      c.fillStyle = COL.mag; c.beginPath(); c.arc(0, -w * 0.2, w * 0.45, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-w * 0.14, -w * 0.34, w * 0.14, 0, TAU); c.fill();
      c.restore();
    }
    function drawStand() {
      if (narrow) return;
      const b = H + 4, top = cy + R * 0.6, w0 = R * 0.2, w1 = R * 0.62;
      const g = c.createLinearGradient(0, top, 0, b); g.addColorStop(0, '#2a1166'); g.addColorStop(1, '#0d0320');
      c.fillStyle = g; c.beginPath(); c.moveTo(cx - w0, top); c.lineTo(cx + w0, top); c.lineTo(cx + w1, b); c.lineTo(cx - w1, b); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,210,63,.55)'; c.lineWidth = 2; c.stroke();
    }

    function frame(dt, t) {
      if (!W) { layout(); if (!W) return; }
      st.t = t;
      /* motion */
      const a = st.anim;
      if (st.drive) {
        /* live: the angle is a pure function of the show clock (see buildLive); velocity is measured for blur and ticks */
        const m = st.drive();
        if (m) {
          const th = m.a, v = dt > 0 ? Math.abs(th - st.th) / dt : 0;
          st.vel = Math.abs(th - st.th) > 1 ? st.vel : st.vel * 0.6 + 0.4 * v; st.th = th; st.zoomT = m.zoom || 0;
        }
      } else if (a) {
        a.t = Math.min(a.T, a.t + dt * a.rate());
        let d, v;
        if (a.t < a.t1) { d = 0.5 * a.acc * a.t * a.t; v = a.acc * a.t; }
        else { const s = (a.t - a.t1) / (a.T - a.t1), d1 = 0.5 * a.acc * a.t1 * a.t1; d = d1 + (a.D - d1) * (1 - Math.pow(1 - s, a.p)); v = ((a.D - d1) * a.p * Math.pow(1 - s, a.p - 1)) / (a.T - a.t1); }
        st.th = a.from + d; st.vel = v;
        const u = a.t / a.T;
        st.zoomT = a.zoom * smooth((u - 0.5) / 0.32);
        if (a.t >= a.T) { st.anim = null; st.vel = 0; a.done(); }
      } else if (st.land < 0) { st.vel = st.drift; st.th += st.drift * dt; }
      /* pegs against the flapper */
      const bi = Math.floor((-Math.PI / 2 - st.th) / SEG);
      if (st.lastB !== null && bi !== st.lastB) {
        st.flap = Math.min(0.62, 0.2 + Math.abs(st.vel) * 0.07);
        if ((a || (st.drive && st.vel > 0.12)) && t - st.lastTick > 26) { st.lastTick = t; snd.tick(clamp(st.vel / 8, 0, 1)); }
      }
      st.lastB = bi;
      st.flap *= Math.exp(-dt * (st.vel > 3 ? 9 : 16));
      st.chase += dt * (2.2 + Math.min(26, Math.abs(st.vel) * 5));
      st.zoom += (st.zoomT - st.zoom) * (1 - Math.exp(-dt * 6));
      st.spot += (st.spotT - st.spot) * (1 - Math.exp(-dt * 7));
      st.hub *= Math.exp(-dt * 5);
      if (st.party > 0) st.party -= dt;

      /* draw */
      if (faceDirty) bakeFace();
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      for (const s of spots) {
        const x = W * (0.5 + 0.52 * Math.sin((t / 1000) * s.a * (REDUCE ? 0.2 : 1) + s.p)), y = H * (0.5 + 0.5 * Math.cos((t / 1000) * s.b * (REDUCE ? 0.2 : 1) + s.q)), r = Math.max(W, H) * s.r;
        c.drawImage(glow(s.col, 48), x - r, y - r, r * 2, r * 2);
      }
      c.globalCompositeOperation = 'source-over';
      const k = st.zoom, z = 1 + (zmax - 1) * k, fx = cx, fy = cy - R * 0.72, tx = fx + (W / 2 - fx) * k, ty = fy + (H * 0.5 - fy) * k;
      c.translate(tx, ty); c.scale(z, z); c.translate(-fx, -fy);
      drawStand();
      const hl = glow('rgba(255,46,147,.55)', 64), gr = R * 1.5; c.drawImage(hl, cx - gr, cy - gr, gr * 2, gr * 2);
      c.save(); c.translate(cx, cy);
      c.save(); c.rotate(st.th);
      if (k < 0.02 && face) {
        if (st.vel > 2.5 && !REDUCE) { c.globalAlpha = 0.35; c.rotate(-st.vel * 0.02); c.drawImage(face, -R, -R, R * 2, R * 2); c.rotate(st.vel * 0.01); c.globalAlpha = 0.5; c.drawImage(face, -R, -R, R * 2, R * 2); c.rotate(st.vel * 0.01); c.globalAlpha = 1; }
        c.drawImage(face, -R, -R, R * 2, R * 2);
      } else drawFace(c, R);
      if (st.land >= 0) {
        const f = 0.5 + 0.5 * Math.sin((t - st.landT) / 95);
        c.save(); wedge(st.land * SEG, (st.land + 1) * SEG, R * 0.3, R * 0.9);
        c.fillStyle = 'rgba(255,255,255,' + (0.1 + 0.3 * f).toFixed(3) + ')'; c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = R * 0.016; c.shadowColor = '#fff'; c.shadowBlur = R * 0.07; c.stroke(); c.restore();
      }
      drawBoosts(t); drawBeams(t);
      c.restore();
      drawRim(t); drawHub(t);
      if (st.spot > 0.01 && st.land >= 0) {
        const am = st.th + (st.land + 0.5) * SEG, hw = SEG * 1.6;
        c.beginPath(); c.rect(-W * 4, -H * 4, W * 8, H * 8);
        c.moveTo(0, 0); c.lineTo(Math.cos(am - hw) * R * 3, Math.sin(am - hw) * R * 3); c.lineTo(Math.cos(am + hw) * R * 3, Math.sin(am + hw) * R * 3); c.closePath();
        c.fillStyle = 'rgba(10,2,24,' + (0.62 * st.spot).toFixed(3) + ')'; c.fill('evenodd');
      }
      drawPointer();
      c.restore();
    }

    const ro = new ResizeObserver(() => layout());
    ro.observe(stage);
    layout();
    if (document.fonts && document.fonts.load) { document.fonts.load('20px Bungee').then(() => { faceDirty = true; }).catch(() => {}); if (document.fonts.ready) document.fonts.ready.then(() => { faceDirty = true; }); }
    S.loop(frame);

    return {
      st,
      dispose() { ro.disconnect(); },
      /* Light the Glitterball's picks one at a time. */
      async assign(boosts, gap) {
        st.boosts = boosts.map((b) => ({ seg: b.seg, mult: b.mult, t0: 0 })); st.shown = 0; st.drift = 0.22;
        for (let i = 0; i < st.boosts.length; i++) {
          st.boosts[i].t0 = st.t; st.shown = i + 1; st.hub = 1; st.beams.push({ seg: st.boosts[i].seg, t0: st.t });
          snd.glit(i);
          await wait(gap);
        }
      },
      clearBoosts() { st.boosts = []; st.shown = 0; },
      /* live: hand the wheel to a clock-driven model, and light the Glitterball's picks one at a time on cue */
      drive(fn) { st.drive = fn; },
      setBoosts(boosts) { st.boosts = boosts.map((b) => ({ seg: b.seg, mult: b.mult, t0: 0 })); st.shown = 0; },
      lightBoost(i, quiet) {
        const b = st.boosts[i]; if (!b) return;
        b.t0 = quiet ? st.t - 1000 : st.t; st.shown = Math.max(st.shown, i + 1);
        if (!quiet) { st.hub = 1; st.beams.push({ seg: b.seg, t0: st.t }); snd.glit(i); }
      },
      /* Spin so that segment `stop` comes to rest under the pointer. */
      spinTo(stop, dur, turns, zoom) {
        return new Promise((done) => {
          const jitter = (Math.random() - 0.5) * 0.72;
          const target = -Math.PI / 2 - (stop + 0.5 + jitter) * SEG;
          let D = (((target - st.th) % TAU) + TAU) % TAU; D += TAU * turns;
          const T = dur, t1 = Math.min(0.75, T * 0.16), p = 3.3;
          const acc = (D * p) / ((T - t1) * t1 + 0.5 * t1 * t1 * p);
          st.land = -1; st.spotT = 0;
          st.anim = { t: 0, T, t1, p, acc, D, from: st.th, zoom, rate: speed, done };
        });
      },
      land(seg) { st.land = seg; st.landT = st.t; st.spotT = 1; st.party = 2.2; },
      release() { st.land = -1; st.spotT = 0; st.zoomT = 0; st.drift = 0.05; },
      zoomOut() { st.zoomT = 0; st.spotT = 0; },
    };
  }

  /* =====================================================================
     THE ROOM — stage, betting table, round flow
     ===================================================================== */
  const speed = () => (DEV && window.__bunkyDev && window.__bunkyDev.speed) || 1;
  const wait = (ms) => S.sleep(ms / speed());

  function sceneSvg() {
    const arch = (x, w, top) => 'M' + x + ' 640V' + (top + w / 2) + 'a' + w / 2 + ' ' + w / 2 + ' 0 01' + w + ' 0V640z';
    const bell = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M0 -60V0" stroke="#3a2208" stroke-width="5"/><path d="M-34 70C-34 24-22 0 0 0s34 24 34 70l10 14h-88z" fill="url(#bunky-s-bell)"/><path d="M-44 84h88" stroke="#ffd86a" stroke-opacity=".5" stroke-width="3"/><circle cx="0" cy="92" r="8" fill="#5a3a08"/></g>';
    const hb = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ' -' + s + ')"><path d="' + Batty.batPath + '" transform="translate(-60 -58)" fill="#0b0218"/></g>';
    let stars = '';
    for (let i = 0; i < 26; i++) stars += '<circle cx="' + (60 + ((i * 197) % 880)) + '" cy="' + (150 + ((i * 113) % 300)) + '" r="' + (1 + (i % 3) * 0.6) + '" fill="#fff" opacity="' + (0.35 + (i % 4) * 0.15) + '"/>';
    let bricks = '';
    for (let r = 0; r < 12; r++) for (let q = 0; q < 9; q++) if ((r * 7 + q * 3) % 5 === 0) bricks += '<rect x="' + (q * 118 + (r % 2) * 59 - 20) + '" y="' + (r * 58 + 10) + '" width="112" height="52" rx="4" fill="#fff" opacity=".022"/>';
    return '<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      '<linearGradient id="bunky-s-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1040"/><stop offset=".7" stop-color="#3b1a8a"/><stop offset="1" stop-color="#b0237a"/></linearGradient>' +
      '<linearGradient id="bunky-s-bell" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b4208"/><stop offset=".45" stop-color="#e8b84a"/><stop offset="1" stop-color="#5a3406"/></linearGradient>' +
      '<clipPath id="bunky-s-clip"><path d="' + arch(60, 190, 150) + arch(405, 190, 110) + arch(750, 190, 150) + '"/></clipPath></defs>' +
      bricks +
      '<g clip-path="url(#bunky-s-clip)"><rect x="0" y="80" width="1000" height="600" fill="url(#bunky-s-sky)"/>' + stars + '<circle cx="845" cy="250" r="46" fill="#ffe9a8"/><circle cx="828" cy="238" r="46" fill="#3b1a8a" opacity=".55"/></g>' +
      '<g fill="none" stroke="#0b0218" stroke-width="10"><path d="' + arch(60, 190, 150) + '"/><path d="' + arch(405, 190, 110) + '"/><path d="' + arch(750, 190, 150) + '"/><path d="M155 150V640M500 110V640M845 150V640" stroke-width="6"/></g>' +
      '<rect x="-10" y="0" width="1020" height="26" fill="#0b0218"/><path d="M0 26h1000" stroke="#ffd86a" stroke-opacity=".25" stroke-width="2"/>' +
      bell(92, 86, 0.9) + bell(908, 86, 0.9) + hb(210, 44, 0.42) + hb(262, 40, 0.3) + hb(760, 44, 0.42) + hb(700, 40, 0.3) + hb(330, 38, 0.24) +
      '</svg>';
  }

  function build(root) {
    const bets = {}; for (const k in memo.bets) if (memo.bets[k] > 0) bets[k] = memo.bets[k];
    let undo = [], busy = false, auto = false, pending = null, chip = memo.chip, quick = memo.quick;
    const spotEls = {}, total = () => { let t = 0; for (const k in bets) t += bets[k]; return t; };

    /* ----- stage ----- */
    const cv = h('canvas', { class: 'bk-cv', 'aria-hidden': 'true' });
    const histEl = h('div', { class: 'bk-hist', 'aria-label': 'Recent results' });
    const callEl = h('div', { class: 'bk-call', role: 'status' });
    const stage = h('section', { class: 'bk-stage' },
      h('div', { class: 'bk-scene', html: sceneSvg() }), h('div', { class: 'bk-floor' }), cv,
      h('div', { class: 'bk-logo', html: '<b>Bunky</b><i>Time</i>' }), histEl, callEl);

    /* ----- table ----- */
    const mkSpot = (spot, cls, inner, pays) => {
      const el = h('button', { type: 'button', class: 'sp ' + cls, 'data-spot': spot, 'aria-label': spotName(spot) + ', ' + pays, onclick: () => place([spot]) });
      el.innerHTML = inner + '<span class="stk" hidden></span><span class="bst" hidden></span>';
      el.style.setProperty('--c', spotCol(spot)); spotEls[spot] = el; return el;
    };
    const spotsEl = h('div', { class: 'bk-spots' });
    spotsEl.append(mkSpot('one', 'sp-one', '<b class="lab">1</b><span class="pay">pays 1:1</span>', 'pays 1 to 1'));
    for (const b of M.BONUSES) spotsEl.append(mkSpot(b, 'sp-bon sp-' + b, '<span class="ic">' + ICON[b] + '</span><b class="lab"><span class="sh">' + BON[b].short + '</span><span class="fu">' + BON[b].name + '</span></b><span class="pay">bonus</span>', 'bonus game'));
    for (const w of M.WORDS) {
      for (const l of w.letters) spotsEl.append(mkSpot(l, 'sp-let w-' + w.id, '<b class="lab">' + l + '</b><span class="pay">25:1</span>', 'pays 25 to 1'));
      const wb = h('button', { type: 'button', class: 'wd w-' + w.id, 'aria-label': 'Bet every letter of ' + w.id, onclick: () => place(w.letters) });
      wb.innerHTML = '<b>' + w.id + '</b><span>all ' + w.letters.length + '<i> letters</i></span>'; wb.style.setProperty('--c', WORDCOL[w.id]);
      spotsEl.append(wb);
    }
    const totEl = h('output', null, '0'), winEl = h('output', null, fmt(memo.lastWin)), statEl = h('div', { class: 'bk-stat' }, 'Place your bets');
    const meters = h('div', { class: 'bk-meters' }, h('div', { class: 'mt' }, h('small', null, 'Total bet'), totEl), statEl, h('div', { class: 'mt win' }, h('small', null, 'Last win'), winEl));
    const chipEls = CHIPS.map((v) => h('button', { type: 'button', class: 'chip c' + v, 'aria-label': fmt(v) + ' chip', onclick: () => { chip = memo.chip = v; Batty.sfx('chip'); render(); } }, h('span', null, fmtK(v))));
    const chipsEl = h('div', { class: 'bk-chips', role: 'group', 'aria-label': 'Chip value' }, chipEls);
    const act = (cls, icon, label, fn) => h('button', { type: 'button', class: 'ac ' + cls, onclick: fn, html: icon + '<span>' + label + '</span>' });
    const bUndo = act('undo', ICON.undo, 'Undo', () => { if (busy || !undo.length) return; setBets(undo.pop(), true); Batty.sfx('click'); });
    const bClear = act('clear', ICON.clear, 'Clear', () => { if (busy || !total()) return; snap(); setBets({}, true); Batty.sfx('whoosh'); });
    const bDouble = act('dbl', '<b>2×</b>', 'Double', doubleUp);
    const bRebet = act('rebet', ICON.rebet, 'Rebet', rebet);
    const actsEl = h('div', { class: 'bk-acts' }, bUndo, bClear, bDouble, bRebet);
    const bQuick = h('button', { type: 'button', class: 'tg quick', 'aria-pressed': 'false', 'aria-label': 'Quick spin', onclick: () => { quick = memo.quick = !quick; Batty.sfx('click'); render(); }, html: ICON.bolt + '<span>Quick</span>' });
    const bAuto = h('button', { type: 'button', class: 'tg auto', 'aria-pressed': 'false', 'aria-label': 'Autoplay', onclick: toggleAuto, html: ICON.auto + '<span>Auto</span>' });
    const bSpin = h('button', { type: 'button', class: 'bk-spin', onclick: () => round() }, h('b', null, 'SPIN'), h('span', null, 'space bar'));
    const goEl = h('div', { class: 'bk-go' }, bQuick, bSpin, bAuto);
    const table = h('section', { class: 'bk-table' }, meters, spotsEl, chipsEl, actsEl, goEl);
    const main = h('div', { class: 'bk-main' }, stage, table);
    root.append(main);

    const wheel = makeWheel(stage, cv);

    /* ----- bets ----- */
    function snap() { undo.push(Object.assign({}, bets)); if (undo.length > 60) undo.shift(); }
    function setBets(nb, quiet) { for (const k in bets) delete bets[k]; for (const k in nb) if (nb[k] > 0) bets[k] = nb[k]; memo.bets = Object.assign({}, bets); render(); if (!quiet) Batty.sfx('chip'); }
    function afford(extra) {
      if (total() + extra <= Batty.wallet.balance) return true;
      if (Batty.wallet.balance < CHIPS[0]) Batty.ui.broke(); else { Batty.sfx('lose'); Batty.ui.toast('Not enough Batty Bucks for that. Try a smaller chip.'); }
      return false;
    }
    function place(spots) {
      if (busy) return;
      const add = {}; let sum = 0;
      for (const s of spots) { const d = Math.min(chip, M.SPOT_MAX[M.kindOf(s)] - (bets[s] || 0)); if (d > 0) { add[s] = d; sum += d; } }
      if (!sum) { Batty.sfx('lose'); Batty.ui.toast('That spot is full: ' + fmt(M.SPOT_MAX[M.kindOf(spots[0])]) + ' BB is the limit.'); return; }
      if (!afford(sum)) return;
      snap();
      for (const s in add) { bets[s] = (bets[s] || 0) + add[s]; bump(spotEls[s]); }
      memo.bets = Object.assign({}, bets); Batty.sfx('chip'); render();
    }
    function doubleUp() {
      if (busy || !total()) return;
      const nb = {}; let sum = 0;
      for (const s in bets) { const d = Math.min(bets[s], M.SPOT_MAX[M.kindOf(s)] - bets[s]); nb[s] = bets[s] + d; sum += d; }
      if (!sum) { Batty.ui.toast('Every spot is already at its limit.'); return; }
      if (!afford(sum)) return;
      snap(); setBets(nb); for (const s in nb) bump(spotEls[s]);
    }
    function rebet() {
      if (busy || !memo.last) return;
      let sum = 0; for (const k in memo.last) sum += memo.last[k];
      if (sum > Batty.wallet.balance) { Batty.sfx('lose'); Batty.ui.toast('Not enough Batty Bucks to repeat that bet.'); return; }
      snap(); setBets(memo.last);
    }
    function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    function chipClass(n) { let c = CHIPS[0]; for (const v of CHIPS) if (n >= v) c = v; return 'c' + c; }
    function sameAsLast() { if (!memo.last) return true; const a = memo.last; for (const k in a) if (a[k] !== bets[k]) return false; for (const k in bets) if (bets[k] !== a[k]) return false; return true; }
    function render() {
      const t = total();
      for (const s of M.SPOTS) {
        const el = spotEls[s], stk = el.querySelector('.stk'), v = bets[s] || 0;
        el.classList.toggle('has', v > 0);
        if (v > 0) { stk.hidden = false; stk.className = 'stk ' + chipClass(v); stk.textContent = fmtK(v); } else stk.hidden = true;
        el.disabled = busy;
      }
      spotsEl.querySelectorAll('.wd').forEach((b) => { b.disabled = busy; });
      totEl.textContent = fmt(t);
      chipEls.forEach((b, i) => { b.classList.toggle('on', CHIPS[i] === chip); b.setAttribute('aria-pressed', CHIPS[i] === chip ? 'true' : 'false'); });
      bUndo.disabled = busy || !undo.length; bClear.disabled = busy || !t; bDouble.disabled = busy || !t; bRebet.disabled = busy || !memo.last || sameAsLast();
      bSpin.disabled = busy; bSpin.classList.toggle('ready', !busy && t > 0);
      bQuick.setAttribute('aria-pressed', quick ? 'true' : 'false'); bAuto.setAttribute('aria-pressed', auto ? 'true' : 'false');
      bAuto.lastChild.textContent = auto ? 'Stop' : 'Auto';
      root.classList.toggle('is-busy', busy);
    }
    function status(t) { statEl.textContent = t; }
    function call(html, cls) { callEl.className = 'bk-call' + (html ? ' on' : '') + (cls ? ' ' + cls : ''); if (html) callEl.innerHTML = html; }
    function renderHist() {
      histEl.textContent = '';
      memo.hist.forEach((r, i) => {
        const el = h('span', { class: 'hx' + (BON[r.spot] ? ' bon' : '') + (i === 0 ? ' new' : '') + (r.boost > 1 ? ' lit' : ''), title: spotName(r.spot) + (r.boost > 1 ? ', Glitterball ' + r.boost + '×' : '') }, r.spot === 'one' ? '1' : BON[r.spot] ? BON[r.spot].short : r.spot);
        el.style.setProperty('--c', spotCol(r.spot)); histEl.append(el);
      });
      if (!memo.hist.length) histEl.append(h('span', { class: 'hint' }, 'Results will queue up here'));
    }
    function badges(boosts) {
      const best = {};
      for (const b of boosts || []) { const s = M.WHEEL[b.seg]; best[s] = Math.max(best[s] || 0, b.mult); }
      for (const s of M.SPOTS) { const el = spotEls[s].querySelector('.bst'); if (best[s]) { el.hidden = false; el.textContent = (s === 'one' ? 'up to ' : '') + best[s] + '×'; } else el.hidden = true; }
    }

    /* ----- player picks inside a bonus: banked the instant they are made ----- */
    async function resolvePick(i) {
      if (!pending || pending.done) return;
      pending.done = true; pending.pick = i;
      if (Batty.online) {
        /* the hidden bonus values only arrive once the pick is in */
        const p = pending; let r = null;
        for (let tries = 0; tries < 4 && !r && S && !S.dead; tries++) { r = await Batty.play(ID, 'pick', { round: p.rid, pick: i }, 0); if (!r && S) await S.sleep(1200); }
        if (!r) { p.won = 0; return; }
        const b = p.o.bonus, full = r.o.bonus;
        if (b.type === 'bar') b.mults.splice(0, b.mults.length, ...full.mults); else Object.assign(b, full);
        delete b.hidden;
        p.won = r.won;
        return;
      }
      pending.won = M.settle(pending.rb, pending.o, i).total;
      Batty.wallet.win(ID, pending.won, { silent: true });
    }

    function tileHtml(o) {
      const s = o.spot, lab = s === 'one' ? '1' : BON[s] ? BON[s].short : s;
      return '<span class="tile' + (BON[s] ? ' bon' : '') + '" style="--c:' + spotCol(s) + '">' + (BON[s] ? ICON[s] : '') + '<b>' + lab + '</b></span>';
    }
    const MISS = ['Not on your chips this time.', 'The wheel giveth, mostly it taketh.', 'Close. Well, close-ish.', 'Unlucky. Same again?', 'Nobody had that. Certainly not you.', 'The bats send their regards.'];

    /* ----- one round ----- */
    async function round() {
      if (busy || !S || S.dead) return;
      const stake = total();
      if (!stake) { Batty.sfx('click'); Batty.ui.toast('Chips on the table first.'); stopAuto(); return; }
      if (!Batty.wallet.bet(ID, stake)) { stopAuto(); return Batty.ui.broke(); }
      busy = true;
      const rb = Object.assign({}, bets); memo.last = Object.assign({}, rb); undo = [];
      const dev = DEV && window.__bunkyDev; let force = null;
      if (dev && dev.force) { force = dev.force; if (!force.sticky) dev.force = null; }
      let o, srvRes = null;
      if (Batty.online) {
        srvRes = await Batty.play(ID, 'spin', { bets: rb }, stake);
        if (!S || S.dead) return;
        if (!srvRes) { busy = false; stopAuto(); render(); return; }
        o = srvRes.o;
      } else o = M.spin(Batty.rng, force);
      const mine = rb[o.spot] || 0, needs = M.needsPick(o), q = quick;
      let won = 0, pick = 0;
      if (srvRes && !srvRes.pending) { won = srvRes.won; Batty.wallet.win(ID, won, { silent: true }); }
      else if (srvRes) pending = { o, rb, done: false, won: 0, pick: 0, rid: srvRes.round };
      else if (!needs) { won = M.settle(rb, o, 0).total; Batty.wallet.win(ID, won, { silent: true }); }
      else if (mine > 0) pending = { o, rb, done: false, won: 0, pick: 0 };
      render(); call(''); badges(null); wheel.release(); wheel.clearBoosts();
      for (const s of M.SPOTS) spotEls[s].classList.remove('won', 'lost');

      status('No more bets'); Batty.sfx('whoosh');
      await wait(q ? 100 : 380);
      status('Glitterball!');
      await wheel.assign(o.boosts, q ? 80 : 290);
      badges(o.boosts);
      await wait(q ? 100 : 420);

      status('Round she goes'); Batty.sfx('spin');
      if (!q) groove.start(0.55);
      await wheel.spinTo(o.stop, q ? 2.5 : 7.4 + Math.random() * 1.4, q ? 2 : 4 + (Math.random() < 0.5 ? 1 : 0), q ? 0.6 : 1);
      groove.stop();

      wheel.land(o.stop); Batty.sfx('stop'); snd.stab(0.02);
      memo.hist.unshift({ spot: o.spot, boost: o.boost }); if (memo.hist.length > 15) memo.hist.length = 15; renderHist();
      for (const s in rb) spotEls[s].classList.add(s === o.spot ? 'won' : 'lost');
      const boostTxt = o.boost > 1 ? '<i class="gb">Glitterball ' + o.boost + '×</i>' : '';

      if (o.kind === 'bonus') {
        status('Bonus!'); Batty.sfx('bonus');
        call(tileHtml(o) + '<span class="tx"><b>' + BON[o.spot].name + '</b><span>' + (mine ? 'You are in with ' + fmt(mine) + ' BB' : 'No chip on it: you are watching') + '</span>' + boostTxt + '</span>', 'bonus');
        await wait(q ? 900 : 1700);
        wheel.zoomOut();
        const res = await bonus(root, o, mine, resolvePick, () => auto);
        pick = res.pick;
        if (pending) { if (!pending.done) await resolvePick(pick); won = pending.won; pending = null; }
        const fx = M.winX(o, pick);
        call(tileHtml(o) + '<span class="tx"><b>' + BON[o.spot].name + ' paid ' + xs(fx) + '</b>' + (won ? '<em>You win ' + fmt(won) + ' BB</em>' : '<span>' + (mine ? '' : 'No chip, no prize') + '</span>') + '</span>', won ? 'win' : '');
      } else {
        const pays = (o.kind === 'one' ? '1:1' : '25:1'), base = o.kind === 'one' ? 'Number 1' : 'Letter ' + o.spot;
        status(won ? 'Winner!' : 'No win');
        call(tileHtml(o) + '<span class="tx"><b>' + base + '</b><span>pays ' + pays + (o.boost > 1 ? ' × ' + o.boost + ' = ' + M.winX(o, 0) + ':1' : '') + '</span>' + boostTxt +
          (won ? '<em>You win ' + fmt(won) + ' BB</em>' : '<span class="miss">' + MISS[Math.floor(Math.random() * MISS.length)] + '</span>') + '</span>', won ? 'win' : '');
        if (o.boost > 1) snd.glit(3);
        await wait(q ? 350 : 800);
      }

      if (won > 0) {
        snd.win(won >= stake * 5);
        if (spotEls[o.spot]) Batty.fx.burst({ el: spotEls[o.spot], kind: 'coin', count: Math.min(60, 14 + Math.floor(won / stake) * 4), power: 0.8 });
        Batty.ui.countUp(winEl, 0, won, q ? 400 : 900);
        memo.lastWin = won;
        meters.classList.remove('hit'); void meters.offsetWidth; meters.classList.add('hit');
      } else if (o.kind !== 'bonus') Batty.sfx('lose');
      Batty.wallet.sync();
      await wait(won > 0 ? (q ? 500 : 1100) : (q ? 300 : 700));
      await Batty.ui.celebrate({ amount: won, bet: stake });
      await wait(q ? 150 : 500);
      wheel.release();
      for (const s of M.SPOTS) spotEls[s].classList.remove('won', 'lost');
      busy = false; status('Place your bets'); render();
      if (auto) {
        if (!Batty.wallet.canBet(total())) { stopAuto(); Batty.ui.toast('Autoplay stopped: not enough Batty Bucks for that bet.'); }
        else { await wait(q ? 250 : 700); if (auto) round(); }
      }
    }
    function stopAuto() { if (auto) { auto = false; render(); } }
    function toggleAuto() {
      auto = !auto; Batty.sfx('click'); render();
      if (auto && !busy) { if (!total()) { auto = false; render(); Batty.ui.toast('Chips on the table first.'); } else round(); }
    }

    S.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (document.querySelector('.bc-veil,.bc-win')) return;
      const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      e.preventDefault(); if (!busy) round();
    });

    renderHist(); render();
    if (DEV) {
      window.__bunkyDev = {
        force: null, speed: 1, pickMs: 0, wheel,
        get busy() { return busy; }, get bets() { return Object.assign({}, bets); }, get auto() { return auto; },
        setBets(nb) { setBets(nb, true); }, spin: () => round(),
      };
    }
    return {
      leave() {
        if (pending && !pending.done) { if (Batty.online) { const p = pending; Batty.play(ID, 'pick', { round: p.rid, pick: M.autoPick(Batty.rng, 3) }, 0).then(() => Batty.wallet.sync()); } else resolvePick(M.autoPick(Batty.rng, 3)); }
        pending = null; auto = false; wheel.dispose();
      },
    };
  }

  /* =====================================================================
     BONUS GAMES — each is a staged scene over the whole room.
     The outcome object already holds every hidden value; these functions only reveal it.
     ===================================================================== */
  async function bonus(root, o, mine, resolvePick, isAuto) {
    const b = BON[o.spot];
    const el = h('div', { class: 'bk-bonus bn-' + o.spot });
    const inner = h('div', { class: 'bn-in' });
    const sub = h('p', { class: 'bn-sub' + (mine ? '' : ' none') }, mine ? 'Your bet: ' + fmt(mine) + ' BB' : 'Watching only: no chip on this one');
    const head = h('header', { class: 'bn-head' }, h('h2', null, b.name), sub, o.boost > 1 ? h('span', { class: 'bn-boost' }, 'Glitterball ' + o.boost + '×') : null);
    const body = h('div', { class: 'bn-body' });
    const prompt = h('div', { class: 'bn-prompt' });
    const lights = h('div', { class: 'bn-lights', html: '<i></i><i></i><i></i><i></i><i></i><i></i>' });
    inner.append(lights, head, body, prompt); el.append(inner); root.append(el);
    try { window.scrollTo(0, 0); } catch (e) { /* fine */ }
    const sc = { el, inner, body, prompt, sub };

    /* intro card */
    const intro = h('div', { class: 'bn-intro' }, h('small', null, 'Bonus game'), h('h2', null, b.name), h('p', null, b.line));
    inner.append(intro); snd.rise(); Batty.sfx('bonus');
    await wait(1900);
    intro.classList.add('out'); await wait(320); intro.remove();

    /* a pick, by the player or (out of time, spectating) by the maths file's autoPick */
    sc.choose = (btns, text) => new Promise((res) => {
      let done = false;
      const dv = DEV && window.__bunkyDev && window.__bunkyDev.pickMs;
      const ms = dv || (mine ? (isAuto() ? 3500 : 12000) : 1600);
      prompt.innerHTML = '<b>' + (mine ? text : 'You are only watching, so the house picks') + '</b><i class="bar"><u style="animation-duration:' + Math.round(ms / speed()) + 'ms"></u></i>';
      prompt.classList.add('on');
      const fin = (i) => { if (done) return; done = true; btns.forEach((x) => { x.disabled = true; x.classList.remove('can'); }); prompt.classList.remove('on'); res(i); };
      btns.forEach((x, i) => { x.disabled = !mine; x.classList.toggle('can', !!mine); x.onclick = () => { Batty.sfx('pop'); fin(i); }; });
      S.on(window, 'keydown', (e) => { if (done || !mine) return; const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i > -1 && i < btns.length) { Batty.sfx('pop'); fin(i); } });
      S.timeout(() => fin(M.autoPick(Batty.rng, btns.length)), ms / speed());
    });

    let res;
    if (o.spot === 'bar') res = await playBar(sc, o, mine, resolvePick);
    else if (o.spot === 'hang') res = await playHang(sc, o, mine, resolvePick);
    else res = await playDisco(sc, o, mine);
    groove.stop();

    /* outro total */
    const x = M.bonusX(o, res.pick), fx = M.winX(o, res.pick), win = mine ? M.payout(o.spot, mine, o, res.pick) : 0;
    const NOBET = { bar: 'No chip on the Bar. You watched other people drink.', hang: 'No chip on it. You were just hanging about.', disco: 'No chip on the Disco. You held the coats.', vip: 'No chip on VIP. Not on the list, mate.' };
    const card = h('div', { class: 'bn-out' });
    card.innerHTML = '<small>' + b.name + ' pays</small><b>' + xs(x) + '</b>' +
      (o.boost > 1 ? '<i>× ' + o.boost + ' Glitterball = ' + xs(fx) + (x * o.boost > M.MAX_BONUS_X ? ' (the maximum)' : '') + '</i>' : '') +
      (mine ? '<em>You win <span>0</span> BB</em><u>' + xs(fx) + ' × ' + fmt(mine) + ' BB, plus your chip back</u>' : '<em class="none">' + NOBET[o.spot] + '</em>');
    inner.append(card); snd.stab(); Batty.sfx('ding');
    if (mine) {
      Batty.fx.burst({ el: card, kind: fx >= 50 ? 'confetti' : 'coin', count: fx >= 50 ? 70 : 36 });
      await Batty.ui.countUp(card.querySelector('em span'), 0, win, 1100 / speed());
    }
    await wait(mine ? 2000 : 1700);
    el.classList.add('out'); await wait(380); el.remove();
    return res;
  }

  /* ---------- 1. The Blood Bar ---------- */
  async function playBar(sc, o, mine, resolvePick) {
    const mults = o.bonus.mults;
    const T = [
      { nm: 'Bloody Mary', body: '#e0407a', wing: '#8f1146', acc: '#fff' },
      { nm: 'Count Drinkula', body: '#7a58e6', wing: '#3a1a8c', acc: COL.red },
      { nm: 'Nosferatini', body: '#18b5a6', wing: '#0a5c55', acc: COL.gold },
    ];
    let bottles = '';
    for (let i = 0; i < 14; i++) bottles += '<i style="--bh:' + (26 + ((i * 7) % 5) * 5) + 'px;--bc:' + ['#e0173f', '#12d6c5', '#ff8a1e', '#a6ec2a', '#c44dff', '#ffd23f'][i % 6] + '"></i>';
    const btns = T.map((t, i) => {
      const bt = h('button', { type: 'button', class: 'tender t' + i, disabled: true, 'aria-label': 'Pick ' + t.nm });
      bt.innerHTML = '<span class="nm">' + t.nm + '</span><span class="bt">' + bat({ body: t.body, wing: t.wing, acc: 'bow', accCol: t.acc }) + '<span class="shk"></span></span>' +
        '<span class="gob"><span class="glass"><i class="fill"></i></span><b class="mx">?</b></span>';
      return bt;
    });
    const room = h('div', { class: 'bar-room' }, h('div', { class: 'bar-back' }, h('div', { class: 'bar-shelf', html: bottles }), h('div', { class: 'bar-sign' }, 'Open till dawn')), h('div', { class: 'bar-row' }, btns), h('div', { class: 'bar-top' }));
    sc.body.append(room);
    await wait(700);
    /* the mixing */
    room.classList.add('shaking');
    const sh = S.interval(() => snd.shake(), 105);
    await wait(1700);
    S.clear(sh); room.classList.remove('shaking'); room.classList.add('ready'); Batty.sfx('ding');
    await wait(450);
    const pick = await sc.choose(btns, 'Pick your poison');
    await resolvePick(pick);
    btns.forEach((b, i) => b.classList.add(i === pick ? 'pick' : 'unpick'));
    snd.heart(); await wait(500); snd.heart(); await wait(600);
    const reveal = (i, main) => {
      const b = btns[i]; b.classList.add('rev'); b.querySelector('.mx').textContent = mults[i] + '×';
      if (mults[i] >= 20) b.classList.add('hot');
      snd.pour();
      if (main) { Batty.sfx(mults[i] >= 20 ? 'win' : 'pop'); Batty.fx.burst({ el: b.querySelector('.gob'), kind: 'spark', count: mults[i] >= 20 ? 46 : 18, colors: ['#ff2e93', '#fff', '#ffd23f', '#e0173f'] }); }
    };
    reveal(pick, true);
    await wait(1300);
    for (let i = 0; i < 3; i++) if (i !== pick) { reveal(i, false); await wait(650); }
    await wait(900);
    return { pick };
  }

  /* ---------- 2. Hangin' Alive ---------- */
  async function playHang(sc, o, mine, resolvePick) {
    const B = o.bonus, L = M.HANG.ladder, top = L.length - 1;
    const TEAMS = [
      { nm: 'The Fangs', col: COL.mag, dark: '#8f0f4f' },
      { nm: 'The Wings', col: COL.teal, dark: '#06695f' },
      { nm: 'Team Guano', col: COL.tan, dark: '#9a4a05' },
    ];
    const mach = h('canvas', { class: 'hg-cv', width: 240, height: 240 });
    const ballEl = h('div', { class: 'hg-ball' });
    const cap = h('div', { class: 'hg-cap' }, 'Seventeen balls. Six of them are trouble.');
    const btns = TEAMS.map((t, i) => {
      const b = h('button', { type: 'button', class: 'hg-team t' + i, disabled: true });
      b.innerHTML = bat({ body: t.col, wing: t.dark, acc: 'band', accCol: '#fff' }) + '<b>' + t.nm + '</b>';
      b.style.setProperty('--c', t.col); return b;
    });
    const rows = h('div', { class: 'hg-rows' });
    for (let l = top; l >= 0; l--) rows.append(h('div', { class: 'hg-row' + (l >= 13 ? ' hi' : l >= 9 ? ' mid' : ''), 'data-l': l }, h('b', null, L[l] + '×'), h('i'), h('i'), h('i')));
    const toks = TEAMS.map((t, i) => {
      const k = h('div', { class: 'hg-tok t' + i, html: bat({ body: t.col, wing: t.dark, acc: 'band', accCol: '#fff' }) + '<span class="gr"><u></u><u></u></span><em></em>' });
      k.style.setProperty('--t', i); k.style.setProperty('--l', 0); k.style.setProperty('--c', t.col); return k;
    });
    const lad = h('div', { class: 'hg-lad' }, h('div', { class: 'hg-bell', html: '<svg viewBox="0 0 60 50" aria-hidden="true"><path d="M30 2c-12 0-17 12-17 28l-7 10h48l-7-10C47 14 42 2 30 2z" fill="#ffd23f" stroke="#8a5a00" stroke-width="2"/><circle cx="30" cy="44" r="5" fill="#8a5a00"/></svg>' }), rows, toks);
    const left = h('div', { class: 'hg-left' }, h('div', { class: 'hg-mach' }, mach, ballEl), cap, h('div', { class: 'hg-teams' }, btns));
    sc.body.append(h('div', { class: 'hg' }, left, lad));

    /* the ball machine: decoration only, the draw order is already in B.draws */
    const balls = [];
    const mk = (kind, team) => balls.push({ kind, team, x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 120, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200 });
    for (let t = 0; t < 3; t++) { for (let i = 0; i < M.HANG.climbPerTeam; i++) mk('up', t); for (let i = 0; i < M.HANG.dropPerTeam; i++) mk('drop', t); }
    for (let i = 0; i < M.HANG.allBalls; i++) mk('all', -1);
    let agit = 0.35;
    const mc = mach.getContext('2d');
    const stopMach = S.loop((dt) => {
      const RR = 104, br = 13;
      mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, 240, 240); mc.translate(120, 120);
      let g = mc.createRadialGradient(-30, -40, 10, 0, 0, RR + 8); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(120,80,220,.12)');
      mc.fillStyle = g; mc.beginPath(); mc.arc(0, 0, RR + 8, 0, TAU); mc.fill();
      for (const b of balls) {
        b.vy += 420 * dt; b.vx += (Math.random() - 0.5) * 2400 * agit * dt; b.vy += (Math.random() - 0.62) * 2600 * agit * dt;
        b.vx *= 0.995; b.vy *= 0.995; b.x += b.vx * dt; b.y += b.vy * dt;
        const d = Math.hypot(b.x, b.y);
        if (d > RR - br) { const nx = b.x / d, ny = b.y / d, vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= 1.9 * vn * nx; b.vy -= 1.9 * vn * ny; } b.x = nx * (RR - br); b.y = ny * (RR - br); }
        const col = b.kind === 'all' ? COL.gold : TEAMS[b.team].col;
        mc.fillStyle = b.kind === 'drop' ? '#1a0b2e' : col; mc.beginPath(); mc.arc(b.x, b.y, br, 0, TAU); mc.fill();
        if (b.kind === 'drop') { mc.strokeStyle = col; mc.lineWidth = 3.5; mc.stroke(); mc.beginPath(); mc.moveTo(b.x - 5, b.y - 5); mc.lineTo(b.x + 5, b.y + 5); mc.moveTo(b.x + 5, b.y - 5); mc.lineTo(b.x - 5, b.y + 5); mc.stroke(); }
        else { mc.fillStyle = 'rgba(255,255,255,.75)'; mc.beginPath(); mc.arc(b.x - 4, b.y - 4, 3.5, 0, TAU); mc.fill(); }
      }
      mc.strokeStyle = 'rgba(255,255,255,.55)'; mc.lineWidth = 5; mc.beginPath(); mc.arc(0, 0, RR + 6, 0, TAU); mc.stroke();
      mc.strokeStyle = 'rgba(255,255,255,.5)'; mc.lineWidth = 6; mc.lineCap = 'round'; mc.beginPath(); mc.arc(0, 0, RR - 8, -2.5, -1.9); mc.stroke();
    });

    await wait(600);
    const pick = await sc.choose(btns, 'Back a team');
    await resolvePick(pick);
    btns.forEach((b, i) => b.classList.add(i === pick ? 'pick' : 'unpick'));
    toks[pick].classList.add('mine'); left.classList.add('picked');
    cap.textContent = (mine ? 'You are on ' : 'The house backs ') + TEAMS[pick].nm + '. Every team starts on 2×.';
    Batty.sfx('ding'); groove.start(0.5);
    await wait(1100);

    let myDone = false, n = 0;
    const grips = [M.HANG.grips, M.HANG.grips, M.HANG.grips];
    for (const d of B.draws) {
      n++;
      const fast = myDone, pace = fast ? 0.22 : n > 14 ? 0.7 : 1;
      const tense = !fast && grips[pick] === 1;
      agit = 1.2; ballEl.className = 'hg-ball';
      if (tense) { left.classList.add('tense'); snd.heart(); }
      for (let i = 0; i < (fast ? 1 : 3); i++) { snd.shake(); await wait(130 * pace + (tense ? 110 : 0)); }
      agit = 0.35;
      const col = d.kind === 'all' ? COL.gold : TEAMS[d.team].col;
      ballEl.style.setProperty('--c', col);
      ballEl.innerHTML = d.kind === 'all' ? ICON.star : d.kind === 'up' ? ICON.up : ICON.drop;
      ballEl.className = 'hg-ball on k-' + d.kind;
      left.classList.remove('tense');
      Batty.sfx('pop');
      await wait(330 * pace);
      d.moved.forEach((t) => { toks[t].style.setProperty('--l', d.levels[t]); toks[t].classList.remove('hop'); void toks[t].offsetWidth; toks[t].classList.add('hop'); });
      if (d.kind !== 'drop') {
        const hi = Math.max.apply(null, d.moved.map((t) => d.levels[t]));
        AU.tone({ f: 330 * Math.pow(2, hi / 12), f2: 440 * Math.pow(2, hi / 12), d: 0.16, type: 'triangle', v: 0.16 });
        cap.textContent = d.kind === 'all' ? 'Everybody up!' : TEAMS[d.team].nm + ' climb to ' + L[d.levels[d.team]] + '×';
        for (const t of d.moved) if (d.levels[t] >= top) { toks[t].classList.add('top'); toks[t].querySelector('em').textContent = L[top] + '×'; snd.bell(); Batty.fx.burst({ el: toks[t], kind: 'confetti', count: 50 }); cap.textContent = TEAMS[t].nm + ' ring the bell! ' + L[top] + '×'; }
      } else {
        grips[d.team] = d.grips[d.team];
        toks[d.team].classList.add(d.out === d.team ? 'out' : 'slip');
        if (d.out === d.team) { snd.fall(); toks[d.team].querySelector('em').textContent = L[d.levels[d.team]] + '×'; cap.textContent = TEAMS[d.team].nm + ' are off. Banked at ' + L[d.levels[d.team]] + '×'; }
        else { Batty.sfx('lose'); cap.textContent = TEAMS[d.team].nm + ' slip! One claw left.'; }
      }
      const mineDone = !myDone && (d.out === pick || d.levels[pick] >= top);
      if (mineDone) {
        myDone = true; toks[pick].classList.add('banked'); groove.stop();
        await wait(1200);
        cap.textContent = (mine ? 'Your team banked ' : TEAMS[pick].nm + ' banked ') + B.mults[pick] + '×. The others play on.';
      }
      await wait((d.kind === 'drop' ? 620 : 420) * pace);
    }
    ballEl.className = 'hg-ball';
    await wait(700);
    stopMach();
    return { pick };
  }

  /* ---------- 3 and 4. Belfry Disco / VIP Crypt Disco ---------- */
  async function playDisco(sc, o) {
    const B = o.bonus, n = B.size, vip = o.spot === 'vip';
    const tot = h('b', null, '0×');
    const totEl = h('div', { class: 'dc-tot' }, h('small', null, 'Collected'), tot);
    const cap = h('div', { class: 'dc-cap' }, vip ? 'Velvet rope lifted. In you go.' : 'He starts in the middle. Every tile pays.');
    const floor = h('div', { class: 'dc-floor' }); floor.style.setProperty('--n', n);
    const tier = (v) => (vip ? (v >= 50 ? 5 : v >= 20 ? 4 : v >= 10 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0) : (v >= 25 ? 5 : v >= 10 ? 4 : v >= 5 ? 3 : v >= 3 ? 2 : v >= 2 ? 1 : 0));
    const tiles = B.grid.map((v, i) => { const t = h('div', { class: 'tl v' + tier(v) }, h('span', null, v + '×')); t.style.setProperty('--d', ((i % n) + Math.floor(i / n)) * 40 + 'ms'); floor.append(t); return t; });
    const dancer = h('div', { class: 'dc-dancer', html: '<span class="sh"></span>' + bat(vip ? { body: '#ffd23f', wing: '#8a5a00', acc: 'crown', shades: true, flares: '#1a0b2e', chain: true } : { body: '#8b4dff', wing: '#4b1fa8', afro: true, shades: true, flares: '#fff', chain: true }) });
    dancer.style.setProperty('--r', B.start[0]); dancer.style.setProperty('--c', B.start[1]);
    floor.append(dancer);
    sc.body.append(h('div', { class: 'dc' + (vip ? ' vip' : '') }, totEl, h('div', { class: 'dc-wrap' }, floor), cap));
    await wait(900);
    dancer.classList.add('in'); groove.start(1);
    let total = 0;
    const hit = (r, c, v) => {
      const t = tiles[r * n + c]; t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit', 'seen');
      total += v; tot.textContent = xs(total); totEl.classList.remove('pop'); void totEl.offsetWidth; totEl.classList.add('pop');
      const fl = h('span', { class: 'dc-plus' }, '+' + v + '×'); t.append(fl); S.timeout(() => fl.remove(), 900);
      const tr = tier(v);
      AU.tone({ f: 392 * Math.pow(2, tr / 6), d: 0.16, type: 'square', v: 0.09 }); AU.tone({ f: 784 * Math.pow(2, tr / 6), d: 0.22, type: 'triangle', v: 0.1, t: 0.05 });
      if (tr >= 4) { Batty.sfx('coin'); Batty.fx.burst({ el: t, kind: 'spark', count: tr === 5 ? 40 : 20, colors: vip ? ['#ffd23f', '#fff', '#ff2e93'] : undefined }); }
    };
    await wait(500);
    hit(B.start[0], B.start[1], B.grid[B.start[0] * n + B.start[1]]);
    let r = B.start[0], c = B.start[1], k = 0;
    const NAMES = ['north', 'east', 'south', 'west'];
    for (const s of B.steps) {
      k++;
      const pace = k > 22 ? 0.55 : k > 11 ? 0.75 : 1;
      const edge = r === 0 || c === 0 || r === n - 1 || c === n - 1;
      floor.classList.toggle('danger', edge);
      if (edge) { snd.heart(); cap.textContent = 'On the edge...'; await wait(420 * pace); }
      await wait(430 * pace);
      r = s.r; c = s.c;
      dancer.style.setProperty('--r', r); dancer.style.setProperty('--c', c);
      dancer.classList.remove('hop'); void dancer.offsetWidth; dancer.classList.add('hop'); dancer.classList.toggle('flip', s.dir === 3 || (s.dir !== 1 && dancer.classList.contains('flip')));
      snd.wah(260 + (k % 4) * 40);
      await wait(300);
      if (s.off) {
        floor.classList.remove('danger'); dancer.classList.add('off', 'o' + s.dir); groove.stop(); snd.fall();
        cap.textContent = 'Off the floor to the ' + NAMES[s.dir] + '. ' + (total >= (vip ? 80 : 30) ? 'What a set.' : 'Two left feet.');
        break;
      }
      hit(r, c, s.value);
      cap.textContent = 'Step ' + k + ': +' + s.value + '×';
    }
    await wait(1300);
    return { pick: 0 };
  }

  /* =====================================================================
     THE LIVE SHOW (online) — one wheel, one clock, everybody.
     The server (lib/games/bunky.php) draws every round when it is created and releases each part only at its moment
     (bk_public). Everything on screen here is a function of the round as currently known and the show clock: the wheel's
     angle, which Glitterball segments are lit, the bartenders, the bell rope, the dancer. So every viewer sees the same
     thing at the same time, and a page reloaded half-way through a bonus picks the show up where it is.
     Practice mode (offline) keeps the single-player wheel above.
     ===================================================================== */
  const LV = M.LIVE;
  const mod = (a, n) => ((a % n) + n) % n;
  const wrapPi = (a) => mod(a + Math.PI, TAU) - Math.PI;
  const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  const totalOf = (b) => { let t = 0; for (const k in b) t += b[k]; return t; };
  const clone = (o) => Object.assign({}, o || {});
  const TURNS = 4;
  /* the host's spin: a hard pull, then a long slowing run (distance fraction at time fraction v) — the same profile as the
     practice wheel (16% of the time accelerating, then a power-3.3 slow-down) */
  function spinCurve(v, a, p) {
    a = a || 0.083; p = p || 3.3; v = clamp(v, 0, 1);
    const acc = p / (a * (1 - a) + 0.5 * p * a * a), d1 = 0.5 * acc * a * a;
    if (v < a) return 0.5 * acc * v * v;
    return d1 + (1 - d1) * (1 - Math.pow(1 - (v - a) / (1 - a), p));
  }
  /* when the model changes (the stop arrives), the jump is spread over w seconds with a smoothstep, never snapped */
  function blender(w, angle) {
    let key = null, out = null, off = 0, t0 = 0;
    return function (v, k, t) {
      if (key !== null && k !== key && out !== null) {
        off = angle ? wrapPi(out - v) : out - v; t0 = t;   /* everything still to blend away, from here */
        if (!isFinite(off)) off = 0;
      }
      key = k; out = v + off * (1 - smooth((t - t0) / w)); return out;
    };
  }
  const TEAMS = [
    { nm: 'The Fangs', col: COL.mag, dark: '#8f0f4f' },
    { nm: 'The Wings', col: COL.teal, dark: '#06695f' },
    { nm: 'Team Guano', col: COL.tan, dark: '#9a4a05' },
  ];
  const TENDERS = [
    { nm: 'Bloody Mary', body: '#e0407a', wing: '#8f1146', acc: '#fff' },
    { nm: 'Count Drinkula', body: '#7a58e6', wing: '#3a1a8c', acc: COL.red },
    { nm: 'Nosferatini', body: '#18b5a6', wing: '#0a5c55', acc: COL.gold },
  ];
  /* the multiplier a viewer's own chip on the bonus earns (null when the pick is not known yet) */
  function liveX(R, pick) {
    const b = R.bonus; if (!b) return null;
    if (b.type === 'bar' || b.type === 'hang') { if (!b.mults || pick == null) return null; return b.mults[pick]; }
    return b.total != null ? b.total : null;
  }
  const capX = (x, boost) => Math.min(M.MAX_BONUS_X, x * boost);
  const LMISS = ['Not on your chips this time.', 'The wheel giveth, mostly it taketh.', 'Close. Well, close-ish.', 'Unlucky. Same again?', 'Nobody had that. Certainly not you.', 'The bats send their regards.'];

  function buildLive(root) {
    const g = { bets: {}, undo: [], dead: false, lastWin: memo.lastWin || 0 };
    const L = {
      st: null, off: null, best: 1e9, age: 0, polling: false, lastPoll: 0, keyT: 0, have: '',
      hist: [], stats: null, winners: null, top: [], confirmed: {}, confTotal: 0,
      sending: false, dirty: false, seq: 0, settled: [], paid: new Set(), mine: null, pick: null, picking: false,
    };
    let R = null, RID = 0, fired = new Set(), scene = null, chip = memo.chip;
    const nowS = () => Date.now() / 1000 + (L.off || 0);
    const myId = () => (Batty.me && Batty.me.id) || -1;
    const spotEls = {};
    root.classList.add('bk-live');

    /* ----- stage ----- */
    const cv = h('canvas', { class: 'bk-cv', 'aria-hidden': 'true' });
    const histEl = h('div', { class: 'bk-hist', 'aria-label': 'Recent results' });
    const callEl = h('div', { class: 'bk-call', role: 'status' });
    const timerEl = h('div', { class: 'bk-timer', hidden: true, 'aria-hidden': 'true', html: '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="t"/><circle cx="22" cy="22" r="19" class="v"/></svg><b></b><small>BETS</small>' });
    const airEl = h('div', { class: 'bk-air' }, h('b', null, 'LIVE'), h('span', null, ''));
    const railEl = h('button', { type: 'button', class: 'bk-rail', 'aria-label': 'Players in the belfry', onclick: () => showPlayers() });
    const stage = h('section', { class: 'bk-stage' },
      h('div', { class: 'bk-scene', html: sceneSvg() }), h('div', { class: 'bk-floor' }), cv,
      h('div', { class: 'bk-logo', html: '<b>Bunky</b><i>Time</i>' }), histEl, airEl, railEl, timerEl, callEl);

    /* ----- table ----- */
    const mkSpot = (spot, cls, inner, pays) => {
      const el = h('button', { type: 'button', class: 'sp ' + cls, 'data-spot': spot, 'aria-label': spotName(spot) + ', ' + pays, onclick: () => place([spot]) });
      el.oncontextmenu = (e) => { e.preventDefault(); takeChip(spot); };
      el.innerHTML = inner + '<span class="stk" hidden></span><span class="bst" hidden></span><span class="ppl" hidden></span>';
      el.style.setProperty('--c', spotCol(spot)); spotEls[spot] = el; return el;
    };
    const spotsEl = h('div', { class: 'bk-spots' });
    spotsEl.append(mkSpot('one', 'sp-one', '<b class="lab">1</b><span class="pay">pays 1:1</span>', 'pays 1 to 1'));
    for (const b of M.BONUSES) spotsEl.append(mkSpot(b, 'sp-bon sp-' + b, '<span class="ic">' + ICON[b] + '</span><b class="lab"><span class="sh">' + BON[b].short + '</span><span class="fu">' + BON[b].name + '</span></b><span class="pay">bonus</span>', 'bonus game'));
    for (const w of M.WORDS) {
      for (const l of w.letters) spotsEl.append(mkSpot(l, 'sp-let w-' + w.id, '<b class="lab">' + l + '</b><span class="pay">25:1</span>', 'pays 25 to 1'));
      const wb = h('button', { type: 'button', class: 'wd w-' + w.id, 'aria-label': 'Bet every letter of ' + w.id, onclick: () => place(w.letters) });
      wb.innerHTML = '<b>' + w.id + '</b><span>all ' + w.letters.length + '<i> letters</i></span>'; wb.style.setProperty('--c', WORDCOL[w.id]);
      spotsEl.append(wb);
    }
    const totEl = h('output', null, '0'), winEl = h('output', null, fmt(g.lastWin)), statEl = h('div', { class: 'bk-stat', 'aria-live': 'polite' }, 'Joining the belfry…');
    const meters = h('div', { class: 'bk-meters' }, h('div', { class: 'mt' }, h('small', null, 'Total bet'), totEl), statEl, h('div', { class: 'mt win' }, h('small', null, 'Last win'), winEl));
    const chipEls = CHIPS.map((v) => h('button', { type: 'button', class: 'chip c' + v, 'aria-label': fmt(v) + ' chip', onclick: () => { chip = memo.chip = v; Batty.sfx('chip'); paintChips(); } }, h('span', null, fmtK(v))));
    const chipsEl = h('div', { class: 'bk-chips', role: 'group', 'aria-label': 'Chip value' }, chipEls);
    const act = (cls, icon, label, fn) => h('button', { type: 'button', class: 'ac ' + cls, onclick: fn, html: icon + '<span>' + label + '</span>' });
    const bUndo = act('undo', ICON.undo, 'Undo', () => undo());
    const bClear = act('clear', ICON.clear, 'Clear', () => { if (!canEdit() || !totalOf(g.bets)) return; setBets({}); Batty.sfx('whoosh'); });
    const bDouble = act('dbl', '<b>2×</b>', 'Double', () => doubleUp());
    const bRebet = act('rebet', ICON.rebet, 'Rebet', () => rebet());
    const bStats = act('stats', ICON.stats, 'Stats', () => showStats());
    const actsEl = h('div', { class: 'bk-acts' }, bUndo, bClear, bDouble, bRebet, bStats);
    const barFill = h('i', { class: 'fill' }), barTxt = h('b', null, 'Joining…'), barSub = h('span', null, '');
    const liveBar = h('div', { class: 'bk-lbar', role: 'timer', 'aria-label': 'Betting time' }, barFill, h('div', { class: 'tx' }, barTxt, barSub));
    const goEl = h('div', { class: 'bk-go' }, liveBar);
    const table = h('section', { class: 'bk-table' }, meters, spotsEl, chipsEl, actsEl, goEl);
    const main = h('div', { class: 'bk-main' }, stage, table);
    root.append(main);
    const wheel = makeWheel(stage, cv, { inset: (W) => (W >= 760 ? Math.min(230, W * 0.26) : 0) });

    /* ----- the betting desk ----- */
    function canEdit() { return !g.dead && !!R && L.off != null && nowS() < R.closeAt - 0.6; }
    function rideBets() { return L.mine && R && L.mine.round === R.id ? L.mine.bets || {} : {}; }
    function shownBets() { if (!R) return g.bets; return nowS() < R.closeAt ? g.bets : rideBets(); }
    function afford(nb) {
      const extra = totalOf(nb) - L.confTotal;
      if (extra <= Batty.wallet.balance) return true;
      if (Batty.wallet.balance < CHIPS[0]) Batty.ui.broke(); else { Batty.sfx('lose'); Batty.ui.toast('Not enough Batty Bucks for that. Try a smaller chip.'); }
      return false;
    }
    function setBets(nb, noUndo) { if (!noUndo) { g.undo.push(clone(g.bets)); if (g.undo.length > 60) g.undo.shift(); } g.bets = {}; for (const k in nb) if (nb[k] > 0) g.bets[k] = nb[k]; paint(true); queueSend(); }
    function refuse() { if (R && L.off != null && nowS() >= R.closeAt - 0.6) { Batty.sfx('click'); status('No more bets: the next round opens soon'); } }
    function place(spots) {
      if (!canEdit()) return refuse();
      const nb = clone(g.bets); let sum = 0;
      for (const s of spots) { const d = Math.min(chip, M.SPOT_MAX[M.kindOf(s)] - (nb[s] || 0)); if (d > 0) { nb[s] = (nb[s] || 0) + d; sum += d; } }
      if (!sum) { Batty.sfx('lose'); Batty.ui.toast('That spot is full: ' + fmt(M.SPOT_MAX[M.kindOf(spots[0])]) + ' BB is the limit.'); return; }
      if (!afford(nb)) return;
      setBets(nb); Batty.sfx('chip'); for (const s of spots) bump(spotEls[s]);
    }
    function takeChip(s) {
      if (!canEdit() || !g.bets[s]) return;
      const nb = clone(g.bets); nb[s] -= Math.min(nb[s], chip); if (nb[s] <= 0) delete nb[s];
      setBets(nb); Batty.sfx('click');
    }
    function undo() { if (!canEdit() || !g.undo.length) return; setBets(g.undo.pop(), true); Batty.sfx('click'); }
    function doubleUp() {
      if (!canEdit() || !totalOf(g.bets)) return;
      const nb = {}; let sum = 0;
      for (const s in g.bets) { const d = Math.min(g.bets[s], M.SPOT_MAX[M.kindOf(s)] - g.bets[s]); nb[s] = g.bets[s] + d; sum += d; }
      if (!sum) { Batty.ui.toast('Every spot is already at its limit.'); return; }
      if (!afford(nb)) return;
      setBets(nb); Batty.sfx('chip');
    }
    function rebet() {
      if (!canEdit() || !memo.last) return;
      const nb = {}; for (const k in memo.last) if (M.SPOTS.indexOf(k) > -1 && memo.last[k] > 0) nb[k] = memo.last[k];
      if (!totalOf(nb)) return;
      if (!afford(nb)) return;
      setBets(nb); Batty.sfx('chip');
    }
    function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    function chipClass(n) { let c = CHIPS[0]; for (const v of CHIPS) if (n >= v) c = v; return 'c' + c; }
    function paintChips() { chipEls.forEach((b, i) => { b.classList.toggle('on', CHIPS[i] === chip); b.setAttribute('aria-pressed', CHIPS[i] === chip ? 'true' : 'false'); }); }
    let paintKey = '';
    function paint(force) {
      const b = shownBets(), ed = canEdit(), crowd = crowdBySpot();
      const key = JSON.stringify(b) + ed + JSON.stringify(crowd) + g.undo.length + (memo.last ? 1 : 0);
      if (!force && key === paintKey) return; paintKey = key;
      for (const s of M.SPOTS) {
        const el = spotEls[s], stk = el.querySelector('.stk'), v = b[s] || 0, pp = el.querySelector('.ppl');
        el.classList.toggle('has', v > 0);
        if (v > 0) { stk.hidden = false; stk.className = 'stk ' + chipClass(v); stk.textContent = fmtK(v); } else stk.hidden = true;
        if (crowd[s]) { pp.hidden = false; pp.textContent = crowd[s]; pp.title = crowd[s] + (crowd[s] === 1 ? ' other player' : ' other players') + ' on ' + spotName(s); } else pp.hidden = true;
        el.disabled = !ed;
      }
      spotsEl.querySelectorAll('.wd').forEach((x) => { x.disabled = !ed; });
      totEl.textContent = fmt(totalOf(b));
      const has = totalOf(g.bets) > 0;
      bUndo.disabled = !ed || !g.undo.length; bClear.disabled = !ed || !has; bDouble.disabled = !ed || !has; bRebet.disabled = !ed || !memo.last || !totalOf(memo.last);
      root.classList.toggle('is-busy', !ed);
    }
    /* how many other players have chips on each spot this round */
    function crowdBySpot() {
      const c = {}, me = myId();
      if (L.st && R && L.st.round && L.st.round.id === R.id) for (const p of L.st.players || []) if (p.id !== me) for (const s of p.spots || []) c[s] = (c[s] || 0) + 1;
      return c;
    }
    function status(t) { if (statEl.textContent !== t) statEl.textContent = t; }
    let callT = 0;
    function call(html, cls, ms) {
      S.clear(callT);
      callEl.className = 'bk-call' + (html ? ' on' : '') + (cls ? ' ' + cls : ''); if (html) callEl.innerHTML = html;
      if (ms) callT = S.timeout(() => { callEl.className = 'bk-call'; }, ms);
    }
    function tileHtml(s) { const lab = s === 'one' ? '1' : BON[s] ? BON[s].short : s; return '<span class="tile' + (BON[s] ? ' bon' : '') + '" style="--c:' + spotCol(s) + '">' + (BON[s] ? ICON[s] : '') + '<b>' + lab + '</b></span>'; }
    function badges(boosts) {
      const best = {};
      for (const b of boosts || []) { const s = M.WHEEL[b.seg]; best[s] = Math.max(best[s] || 0, b.mult); }
      for (const s of M.SPOTS) { const el = spotEls[s].querySelector('.bst'); if (best[s]) { el.hidden = false; el.textContent = (s === 'one' ? 'up to ' : '') + best[s] + '×'; } else el.hidden = true; }
    }

    /* ----- history, players, stats ----- */
    let histKey = '';
    function renderHist() {
      const H = L.hist.filter((e) => !R || e.id < R.id || nowS() >= R.landAt);
      const k = H.map((e) => e.id + ':' + e.x).join(',');
      if (k === histKey) return; histKey = k;
      histEl.textContent = '';
      H.slice(0, 15).forEach((r, i) => {
        const bon = !!BON[r.spot], el = h('span', { class: 'hx' + (bon ? ' bon' : '') + (i === 0 ? ' new' : '') + (r.boost > 1 ? ' lit' : ''), title: spotName(r.spot) + (r.boost > 1 ? ', Glitterball ' + r.boost + '×' : '') + (bon && r.x ? ', paid up to ' + r.x + '×' : '') }, r.spot === 'one' ? '1' : bon ? BON[r.spot].short : r.spot);
        if (bon && r.x) el.append(h('em', null, fmtK(r.x) + '×'));
        el.style.setProperty('--c', spotCol(r.spot)); histEl.append(el);
      });
      if (!H.length) histEl.append(h('span', { class: 'hint' }, 'Results will queue up here'));
    }
    let railKey = '';
    function paintRail() {
      const st = L.st, me = myId();
      const list = st && R && st.round && st.round.id === R.id ? st.players || [] : [];
      const k = JSON.stringify(list.map((p) => [p.id, p.total, p.win, (p.spots || []).join('')])) + (st ? st.watching + ':' + st.betting : '');
      if (k === railKey) return; railKey = k;
      airEl.lastChild.textContent = st ? fmt(Math.max(1, st.watching || 1)) + ' watching' : '';
      const rows = list.slice(0, 7).map((p) => '<div class="p' + (p.id === me ? ' me' : '') + (p.win > 0 ? ' up' : '') + '">' + Batty.avatar(p.avatar, 26) + '<b>' + (p.id === me ? 'You' : esc(p.name)) + '</b><small>' + fmtK(p.total) + ' ' + (p.spots || []).slice(0, 5).map((s) => '<i style="--c:' + spotCol(s) + '">' + (s === 'one' ? '1' : BON[s] ? BON[s].short[0] : s) + '</i>').join('') + '</small>' + (p.win != null ? '<em>' + (p.win > 0 ? '+' + fmtK(p.win) : '–') + '</em>' : '') + '</div>').join('');
      const stack = list.slice(0, 4).map((p) => Batty.avatar(p.avatar, 22)).join('');
      railEl.innerHTML = '<span class="rh"><b>' + fmt(st ? st.betting || 0 : 0) + '</b> betting</span><span class="stack">' + stack + '</span><div class="rl">' + (rows || '<div class="none">No chips down yet. Be the first!</div>') + '</div>';
    }
    function showPlayers() {
      const st = L.st, me = myId(), list = st && st.players ? st.players : [];
      Batty.ui.modal('In the belfry', '<p>' + fmt(st ? st.watching || 1 : 1) + ' watching, ' + fmt(list.length) + ' with chips on round ' + (R ? R.id : '') + '.</p>' +
        (list.length ? '<table><tr><th>Player</th><th>Chips</th><th>Spots</th><th>Win</th></tr>' + list.map((p) => '<tr><td>' + (p.id === me ? 'You' : esc(p.name)) + '</td><td>' + fmt(p.total) + '</td><td>' + (p.spots || []).map((s) => esc(s === 'one' ? '1' : BON[s] ? BON[s].short : s)).join(' ') + '</td><td>' + (p.win != null ? fmt(p.win) : '…') + '</td></tr>').join('') + '</table>' : '<p>No chips down yet this round.</p>'));
    }
    function showStats() {
      const s = L.stats; if (!s) { Batty.ui.toast('Stats arrive with the first result.'); return; }
      const exp = (sp) => (M.SEGS_OF[sp].length / M.N) * s.n;
      const row = (sp) => { const c = (s.counts && s.counts[sp]) || 0, since = s.since && s.since[sp] != null ? s.since[sp] : null; return '<tr><td>' + esc(spotName(sp)) + '</td><td>' + c + '</td><td>' + exp(sp).toFixed(1) + '</td><td>' + (since == null ? 'not in ' + s.n : since === 0 ? 'last spin' : since + ' ago') + '</td></tr>'; };
      const top = (L.top || []).map((w) => '<tr><td>' + esc(w.name) + '</td><td>' + esc(spotName(w.spot)) + '</td><td>' + fmt(w.win) + ' BB</td><td>' + w.x + '×</td></tr>').join('');
      Batty.ui.modal('Bunky Time stats', '<p>Hot and cold over the last ' + s.n + ' spins: how often each spot came up, how often it should, and when it last landed.</p><table><tr><th>Spot</th><th>Hits</th><th>Expected</th><th>Last</th></tr>' + M.SPOTS.map(row).join('') + '</table>' +
        (top ? '<h3>Best wins lately</h3><table><tr><th>Player</th><th>Spot</th><th>Win</th><th>×</th></tr>' + top + '</table>' : ''));
    }

    /* ----- the wheel, from the clock ----- */
    const wBlend = blender(2.4, true);
    let restA = null;
    function wheelModel() {
      const t = nowS();
      if (!R) return restA == null ? null : { a: restA, zoom: 0 };
      const a0 = R.th0, sp = R.spinAt, ld = R.landAt;
      let a, key, zoom = 0;
      if (t < sp) { a = a0; key = 'r' + R.id; }
      else {
        const known = R.stop != null, tg = known ? M.restAngle(R.stop, R.jit) : a0 + 2.1;
        const D = mod(tg - a0, TAU) + TAU * TURNS, u = (t - sp) / (ld - sp);
        key = 's' + R.id + known;
        if (u >= 1) {
          a = a0 + D;
          const out = R.kind === 'bonus' && R.bonus ? R.bonus.at - 1.1 : ld + 3.2;
          zoom = t < out ? 1 : 0;
        } else { a = a0 + D * spinCurve(u); zoom = smooth((u - 0.5) / 0.32); }
      }
      a = wBlend(a, key, t); restA = a;
      return { a, zoom: REDUCE ? 0 : zoom };
    }
    wheel.drive(wheelModel);
    function drawTimer(t) {
      if (!R || t >= R.closeAt) { if (!timerEl.hidden) timerEl.hidden = true; return; }
      const left = R.closeAt - t, f = clamp(left / (R.closeAt - R.openAt), 0, 1);
      timerEl.hidden = false;
      timerEl.querySelector('.v').style.strokeDashoffset = (119.4 * (1 - f)).toFixed(2);
      const sec = Math.max(0, Math.ceil(left)), b = timerEl.querySelector('b');
      if (b.textContent !== String(sec)) { b.textContent = String(sec); timerEl.classList.toggle('hot', left <= 5); if (left <= 5 && sec > 0) snd.wah(500 + (5 - sec) * 60); }
    }
    function drawBar(t) {
      let f = 0, txt = 'Joining the belfry…', sub = '', cls = 'wait';
      if (R) {
        if (t < R.closeAt) { f = clamp((R.closeAt - t) / (R.closeAt - R.openAt), 0, 1); txt = 'Place your bets'; sub = Math.max(0, Math.ceil(R.closeAt - t)) + 's'; cls = R.closeAt - t <= 5 ? 'bet hot' : 'bet'; }
        else if (t < R.spinAt) { txt = 'No more bets'; sub = 'Glitterball'; cls = 'shut'; }
        else if (t < R.landAt) { txt = 'Round she goes'; sub = ''; cls = 'spin'; }
        else if (R.kind === 'bonus') { txt = BON[R.spot] ? BON[R.spot].name : 'Bonus'; sub = 'bonus game'; cls = 'bonus'; }
        else { txt = 'Next round soon'; sub = R.nextAt ? Math.max(0, Math.ceil(R.nextAt - t)) + 's' : ''; cls = 'shut'; }
      }
      barFill.style.transform = 'scaleX(' + f.toFixed(3) + ')';
      if (barTxt.textContent !== txt) barTxt.textContent = txt;
      if (barSub.textContent !== sub) barSub.textContent = sub;
      const c = 'bk-lbar ' + cls; if (liveBar.className !== c) liveBar.className = c;
    }

    /* ----- the director ----- */
    function once(k, at, t, fn) { if (at == null || t < at || fired.has(k)) return; fired.add(k); try { fn(t - at > 1.2); } catch (e) { console.error(e); } }
    function newRound() {
      RID = R.id; fired = new Set();
      if (scene) { scene.destroy(); scene = null; }
      L.pick = null;
      wheel.release(); wheel.clearBoosts(); badges(null); call('');
      for (const s of M.SPOTS) spotEls[s].classList.remove('won', 'lost');
      g.undo = [];
      if (nowS() < R.closeAt) g.bets = clone(L.confirmed);
      groove.stop();
      paint(true); paintRail();
    }
    function mineOn(spot) { return rideBets()[spot] || 0; }
    function myPick() { if (L.pick != null) return L.pick; return L.mine && L.mine.round === R.id && L.mine.pick != null ? L.mine.pick : null; }
    async function doPick(i) {
      if (!R || !R.bonus || L.pick != null || L.picking) return;
      const t = nowS();
      if (t < R.bonus.pickStart || t >= R.bonus.pickEnd - 0.15 || !(mineOn(R.spot) > 0)) return;
      L.picking = true; L.pick = i; Batty.sfx('pop');
      const r = await Batty.play(ID, 'pick', { round: R.id, pick: i }, 0);
      L.picking = false;
      if (g.dead) return;
      if (r && r.round === R.id) { L.pick = r.pick; if (L.mine) L.mine.pick = r.pick; } else if (!r) L.pick = null;
    }
    function sceneCtx() {
      return { once, mine: () => mineOn(R.spot), myPick, clicked: () => L.pick != null, pick: (i) => doPick(i), players: () => (L.st && L.st.players) || [], myId };
    }
    function payAt() { if (!R || R.landAt == null) return null; if (R.kind === 'bonus') return R.bonus && R.bonus.finish != null ? R.bonus.finish : null; return R.endAt != null ? R.endAt : null; }
    function settle(s, late) {
      L.paid.add(s.round); L.settled = L.settled.filter((x) => x.round !== s.round);
      const won = s.won || 0, staked = s.staked || 0;
      if (won > 0) Batty.wallet.win(ID, won, { silent: true });
      Batty.wallet.sync();
      if (s.round !== RID) { if (won > 0) Batty.ui.toast('Round ' + s.round + ': you won ' + fmt(won) + ' BB.', 4000); return; }
      if (won > 0) {
        g.lastWin = memo.lastWin = won;
        if (late) winEl.textContent = fmt(won); else Batty.ui.countUp(winEl, 0, won, 900);
        meters.classList.remove('hit'); void meters.offsetWidth; meters.classList.add('hit');
        if (!late) {
          snd.win(won >= staked * 5);
          if (spotEls[R.spot]) Batty.fx.burst({ el: spotEls[R.spot], kind: 'coin', count: Math.min(60, 14 + Math.floor(won / Math.max(1, staked)) * 4), power: 0.8 });
          if (won >= staked * 10) S.timeout(() => Batty.ui.celebrate({ amount: won, bet: staked }), R.kind === 'bonus' ? 1600 : 700);
        }
        status('You win ' + fmt(won) + ' BB');
      } else if (staked > 0) { status('No win this time'); if (!late && R.kind !== 'bonus') Batty.sfx('lose'); }
      paintRail();
    }
    function onLand(late) {
      const s = R.spot, mine = mineOn(s), staked = totalOf(rideBets());
      wheel.land(R.stop);
      if (!late) { Batty.sfx('stop'); snd.stab(0.02); }
      for (const k in rideBets()) spotEls[k].classList.add(k === s ? 'won' : 'lost');
      renderHist();
      const boostTxt = R.boost > 1 ? '<i class="gb">Glitterball ' + R.boost + '×</i>' : '';
      if (R.kind === 'bonus') {
        status('Bonus: ' + BON[s].name); if (!late) Batty.sfx('bonus');
        call(tileHtml(s) + '<span class="tx"><b>' + BON[s].name + '</b><span>' + (mine ? 'You are in with ' + fmt(mine) + ' BB' : 'No chip on it: you are watching') + '</span>' + boostTxt + '</span>', 'bonus');
      } else {
        const pays = s === 'one' ? '1:1' : '25:1', base = s === 'one' ? 'Number 1' : 'Letter ' + s, x = M.winX({ kind: R.kind, boost: R.boost }, 0);
        status(mine ? 'Winner!' : staked ? 'No win' : 'Result: ' + base);
        call(tileHtml(s) + '<span class="tx"><b>' + base + '</b><span>pays ' + pays + (R.boost > 1 ? ' × ' + R.boost + ' = ' + x + ':1' : '') + '</span>' + boostTxt +
          (mine ? '<em>You win ' + fmt(mine + mine * x) + ' BB</em>' : '<span class="miss">' + (staked ? LMISS[R.id % LMISS.length] : 'Chips down next round?') + '</span>') + '</span>', mine ? 'win' : '');
        if (!late && R.boost > 1) snd.glit(3);
      }
    }
    function outro(late) {
      if (!scene) return;
      const b = BON[R.spot], mine = mineOn(R.spot), pick = myPick(), B0 = R.bonus;
      let x = liveX(R, mine ? pick : null), best = false;
      if (x == null && B0.mults) { x = Math.max.apply(null, B0.mults); best = true; }
      if (x == null) x = 0;
      const fx = capX(x, R.boost), win = mine ? mine + mine * fx : 0;
      const NOBET = { bar: 'No chip on the Bar. You watched other people drink.', hang: 'No chip on it. You were just hanging about.', disco: 'No chip on the Disco. You held the coats.', vip: 'No chip on VIP. Not on the list, mate.' };
      const wl = L.winners && L.winners.round === R.id ? L.winners.list : null, me = myId();
      const card = h('div', { class: 'bn-out' });
      card.innerHTML = '<small>' + b.name + (best ? ' best pick paid' : ' pays') + '</small><b>' + xs(x) + '</b>' +
        (R.boost > 1 ? '<i>× ' + R.boost + ' Glitterball = ' + xs(fx) + (x * R.boost > M.MAX_BONUS_X ? ' (the maximum)' : '') + '</i>' : '') +
        (mine ? '<em>You win <span>0</span> BB</em><u>' + xs(fx) + ' × ' + fmt(mine) + ' BB, plus your chip back</u>' : '<em class="none">' + NOBET[R.spot] + '</em>') +
        '<ol class="wl"></ol>';
      scene.inner.append(card); scene.card = card;
      paintWinners();
      if (!late) { snd.stab(); Batty.sfx('ding'); }
      if (mine) {
        const sp = card.querySelector('em span');
        if (late) sp.textContent = fmt(win);
        else { Batty.fx.burst({ el: card, kind: fx >= 50 ? 'confetti' : 'coin', count: fx >= 50 ? 70 : 36 }); Batty.ui.countUp(sp, 0, win, 1100); }
      }
    }
    function paintWinners() {
      if (!scene || !scene.card) return;
      const wl = L.winners && L.winners.round === R.id ? L.winners.list : null, me = myId(), ol = scene.card.querySelector('.wl');
      const k = wl ? JSON.stringify(wl) : '';
      if (ol.dataset.k === k) return; ol.dataset.k = k;
      ol.innerHTML = wl && wl.length ? '<li class="hd">Winners</li>' + wl.slice(0, 4).map((w) => '<li class="' + (w.id === me ? 'me' : '') + '">' + Batty.avatar(w.avatar, 22) + '<span>' + (w.id === me ? 'You' : esc(w.name)) + '</span><em>+' + fmt(w.win) + '</em></li>').join('') : '';
    }
    let lastPh = '';
    function phaseOf(t) {
      if (!R) return 'idle';
      if (t < R.closeAt) return 'bet';
      if (t < R.spinAt) return 'glit';
      if (t < R.landAt || R.spot == null) return 'spin';
      if (R.kind !== 'bonus') return 'result';
      if (!R.bonus || t < R.bonus.at) return 'land';
      if (R.bonus.finish == null || t < R.bonus.finish) return 'bonus';
      return 'outro';
    }
    function direct(t) {
      if (!R) return;
      if (R.id !== RID) newRound();
      const ph = phaseOf(t);
      if (ph !== lastPh) { lastPh = ph; root.dataset.ph = ph; paint(true); }
      once('open', R.openAt, t, (late) => { if (!late) { snd.stab(); call('<span class="tx"><b>Place your bets</b><span>Round ' + R.id + ' is open</span></span>', 'open', 1600); } });
      if (ph === 'bet') status(totalOf(g.bets) ? fmt(totalOf(g.bets)) + ' BB down · ' + Math.max(0, Math.ceil(R.closeAt - t)) + 's' : 'Place your bets · ' + Math.max(0, Math.ceil(R.closeAt - t)) + 's');
      once('close', R.closeAt, t, (late) => {
        if (!L.sending && !L.dirty) g.bets = clone(L.confirmed);
        const rb = rideBets(); if (totalOf(rb)) memo.last = clone(rb);
        paint(true);
        if (!late) { Batty.sfx('whoosh'); call('<span class="tx"><b>No more bets</b><span>' + (totalOf(rb) ? fmt(totalOf(rb)) + ' BB riding on round ' + R.id : 'Watching round ' + R.id) + '</span></span>', 'shut', 1500); }
        status(totalOf(rb) ? 'No more bets · ' + fmt(totalOf(rb)) + ' BB riding' : 'No more bets · watching');
      });
      if (R.boosts) {
        once('boosts', R.closeAt, t, () => wheel.setBoosts(R.boosts));
        R.boosts.forEach((b, i) => once('gb' + i, R.closeAt + 0.9 + i * 0.6, t, (late) => { wheel.lightBoost(i, late); if (!late && i === 0) status('Glitterball!'); }));
        once('badges', R.closeAt + 0.9 + R.boosts.length * 0.6, t, () => badges(R.boosts));
      }
      once('spin', R.spinAt, t, (late) => { status('Round she goes'); if (!late) { Batty.sfx('spin'); groove.start(0.55); } });
      if (R.spot != null) once('land', R.landAt, t, (late) => { groove.stop(); onLand(late); });
      if (R.kind === 'bonus' && R.bonus) {
        const at = R.bonus.at;
        if (t >= at - 0.4 && !scene && (R.bonus.finish == null || t < (R.nextAt || R.bonus.finish + LV.outro) - 0.4)) {
          call(''); wheel.zoomOut();
          scene = liveScene(root, R, sceneCtx(), t);
        }
        if (scene) {
          try { scene.update(t, R); } catch (e) { console.error(e); }
          if (R.bonus.finish != null) once('outro', R.bonus.finish, t, (late) => { groove.stop(); outro(late); });
          paintWinners();
          if (R.nextAt != null && t >= R.nextAt - 0.45 && !scene.out) { scene.out = true; scene.el.classList.add('out'); }
        }
      }
      /* the money: shown when the show reaches it (the server paid it a moment before) */
      const pa = payAt();
      for (const s of L.settled.slice()) {
        if (L.paid.has(s.round)) continue;
        if (s.round < R.id) settle(s, true);
        else if (s.round === R.id && pa != null && t >= pa) settle(s, t - pa > 3);
      }
      paint();
    }

    /* ----- frame ----- */
    S.loop(() => {
      if (g.dead || L.off == null) return;
      const t = nowS();
      drawTimer(t); drawBar(t); direct(t);
    });

    /* ----- talking to the server ----- */
    let sendT = 0;
    function queueSend() {
      L.dirty = true; L.seq++;
      const left = R ? R.closeAt - nowS() : 9;
      S.clear(sendT); sendT = S.timeout(sendBet, left < 2.5 ? 0 : 260);
    }
    async function sendBet() {
      if (L.sending || !L.dirty || g.dead) return;
      if (!R || nowS() >= R.closeAt - 0.2) { L.dirty = false; g.bets = clone(L.confirmed); paint(true); return; }
      L.sending = true; L.dirty = false;
      const want = clone(g.bets), total = totalOf(want), delta = total - L.confTotal, rid = R.id;
      if (delta > 0 && !Batty.wallet.bet(ID, delta)) { L.sending = false; Batty.ui.broke(); g.bets = clone(L.confirmed); paint(true); return; }
      const r = await Batty.play(ID, 'bet', { round: rid, bets: want }, Math.max(0, delta));
      L.sending = false; if (g.dead) return;
      if (r && r.round === rid) {
        L.confirmed = clone(r.bets); L.confTotal = r.total;
        L.mine = Object.assign({}, L.mine && L.mine.round === rid ? L.mine : { round: rid }, { round: rid, bets: clone(r.bets), total: r.total });
      } else if (!r) { g.bets = clone(L.confirmed); }
      if (delta < 0) Batty.wallet.sync();
      paint(true); paintRail();
      if (L.dirty) sendBet();
    }
    async function poll() {
      if (L.polling || g.dead) return;
      L.polling = true; L.lastPoll = Date.now();
      const seq0 = L.seq, t0 = Date.now(); let r;
      try { r = await Batty.api('play', { game: ID, op: 'state', have: L.have }, { defer: true }); }
      catch (e) { L.polling = false; return; }
      const t1 = Date.now(); L.polling = false;
      if (g.dead || !r || !r.round) return;
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (L.off == null || rtt <= L.best * 1.25 || ++L.age > 40) { L.off = off; L.best = rtt; L.age = 0; }
      if (r.hist) { L.hist = r.hist; L.stats = r.stats; L.winners = r.winners; L.top = r.top || []; L.have = r.have; }
      L.st = r;
      const isNew = !R || R.id !== r.round.id;
      R = r.round;
      const pk = L.mine && L.mine.round === R.id ? L.mine.pick : undefined;
      L.mine = r.mine; if (L.mine && L.mine.pick == null && pk != null) L.mine.pick = pk;
      if (L.mine && L.mine.pick != null && R.bonus && R.bonus.pickEnd != null && r.now < R.bonus.pickEnd) L.ownPick = R.id;   /* chosen by this player, not the house */
      if (isNew || (!L.sending && !L.dirty && L.seq === seq0)) {
        L.confirmed = r.mine && r.mine.round === R.id ? clone(r.mine.bets) : {}; L.confTotal = totalOf(L.confirmed);
        if (!L.sending && !L.dirty && L.seq === seq0 && nowS() < R.closeAt && JSON.stringify(g.bets) !== JSON.stringify(L.confirmed)) { g.bets = clone(L.confirmed); paint(true); }
      }
      for (const s of r.settled || []) if (!L.paid.has(s.round) && !L.settled.some((x) => x.round === s.round)) L.settled.push(s);
      renderHist(); paintRail(); paint();
    }
    /* the next moment something new is revealed: poll just after it */
    function nextKey(t) {
      if (!R) return null;
      const b = R.bonus || {};
      const ks = [R.closeAt, R.spinAt + LV.stopAt, R.landAt, R.endAt, R.nextAt, b.pickEnd, b.floor != null ? b.floor - LV.look : null];
      if (b.ev && b.ev.length && b.finish == null) ks.push(b.ev[b.ev.length - 1].t - LV.look + 0.5);
      let best = null; for (const k of ks) if (k != null && k > t - 0.05 && (best == null || k < best)) best = k;
      return best;
    }
    function liveTick() {
      if (g.dead) return;
      if (L.off == null) { if (!L.polling && Date.now() - L.lastPoll > 1500) poll(); return; }
      const t = nowS(), ph = phaseOf(t), gap = ph === 'bet' || ph === 'result' || ph === 'outro' ? 1000 : 650, since = Date.now() - L.lastPoll;
      const nk = nextKey(t);
      if (nk != null && t >= nk + 0.06 && L.keyT !== nk && since > 120) { L.keyT = nk; poll(); return; }
      if (R && R.nextAt != null && t >= R.nextAt && since > 300) { poll(); return; }
      if (since >= gap && (!document.hidden || since > 4000)) poll();
    }

    /* ----- keys ----- */
    S.on(window, 'keydown', (e) => {
      if (g.dead || document.querySelector('.bc-veil,.bc-win')) return;
      const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); return; }
      const d = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (d > -1 && R && R.bonus && R.bonus.pickStart != null) { const t = nowS(); if (t >= R.bonus.pickStart && t < R.bonus.pickEnd) { doPick(d); return; } }
      const k = (e.key || '').toLowerCase();
      if (k === 'u') undo(); else if (k === 'x') doubleUp(); else if (k === 'r') rebet();
    });

    /* ----- start ----- */
    paintChips(); renderHist(); paint(true); paintRail();
    poll();
    S.interval(liveTick, 120);
    if (DEV) window.__bunkyDev = { live: true, get R() { return R; }, get L() { return L; }, wheel, nowS };
    return {
      leave() { g.dead = true; if (scene) scene.destroy(); scene = null; wheel.dispose(); },
    };
  }

  /* ---------- live bonus scenes: built once, then update(t, R) draws the right picture for ANY t ---------- */
  function liveScene(root, R, ctx, t0) {
    const b = BON[R.spot], mine = ctx.mine();
    const el = h('div', { class: 'bk-bonus bn-' + R.spot + ' lv' });
    const inner = h('div', { class: 'bn-in' });
    const sub = h('p', { class: 'bn-sub' + (mine ? '' : ' none') }, mine ? 'Your bet: ' + fmt(mine) + ' BB' : 'Watching: no chip on this one');
    const head = h('header', { class: 'bn-head' }, h('h2', null, b.name), sub, R.boost > 1 ? h('span', { class: 'bn-boost' }, 'Glitterball ' + R.boost + '×') : null);
    const body = h('div', { class: 'bn-body' });
    const pTxt = h('b'), pFill = h('u');
    const prompt = h('div', { class: 'bn-prompt lv' }, pTxt, h('i', { class: 'bar' }, pFill));
    const lights = h('div', { class: 'bn-lights', html: '<i></i><i></i><i></i><i></i><i></i><i></i>' });
    inner.append(lights, head, body, prompt); el.append(inner); root.append(el);
    const at = R.bonus.at;
    let intro = null;
    if (t0 < at + LV.intro - 0.4) {
      intro = h('div', { class: 'bn-intro' }, h('small', null, 'Bonus game'), h('h2', null, b.name), h('p', null, b.line));
      inner.append(intro);
    }
    let lastP = '';
    const sc = {
      el, inner, body, card: null, out: false,
      setPrompt(text, frac, sec) {
        const k = text ? text + (sec != null ? ' · ' + sec + 's' : '') : '';
        if (k !== lastP) { lastP = k; pTxt.textContent = k; prompt.classList.toggle('on', !!k); }
        if (k) pFill.style.transform = 'scaleX(' + clamp(frac, 0, 1).toFixed(3) + ')';
      },
      update(t, R2) {
        if (intro) {
          ctx.once('intro', at, t, (late) => { if (!late) { snd.rise(); Batty.sfx('bonus'); } });
          if (t >= at + LV.intro - 0.35) { intro.classList.add('out'); if (t >= at + LV.intro) { intro.remove(); intro = null; } }
        }
        inst.update(t, R2);
      },
      destroy() { if (inst.destroy) inst.destroy(); el.remove(); },
    };
    const inst = R.spot === 'bar' ? liveBar(sc, ctx) : R.spot === 'hang' ? liveHang(sc, ctx) : liveDisco(sc, ctx, R);
    return sc;
  }

  /* ---------- The Blood Bar, live ---------- */
  function liveBar(sc, ctx) {
    let bottles = '';
    for (let i = 0; i < 14; i++) bottles += '<i style="--bh:' + (26 + ((i * 7) % 5) * 5) + 'px;--bc:' + ['#e0173f', '#12d6c5', '#ff8a1e', '#a6ec2a', '#c44dff', '#ffd23f'][i % 6] + '"></i>';
    const btns = TENDERS.map((t, i) => {
      const bt = h('button', { type: 'button', class: 'tender t' + i, disabled: true, 'aria-label': 'Pick ' + t.nm, onclick: () => ctx.pick(i) });
      bt.innerHTML = '<span class="nm">' + t.nm + '</span><span class="bt">' + bat({ body: t.body, wing: t.wing, acc: 'bow', accCol: t.acc }) + '<span class="shk"></span></span>' +
        '<span class="gob"><span class="glass"><i class="fill"></i></span><b class="mx">?</b></span><span class="cnt" hidden></span>';
      return bt;
    });
    const room = h('div', { class: 'bar-room' }, h('div', { class: 'bar-back' }, h('div', { class: 'bar-shelf', html: bottles }), h('div', { class: 'bar-sign' }, 'Open till dawn')), h('div', { class: 'bar-row' }, btns), h('div', { class: 'bar-top' }));
    sc.body.append(room);
    let lastShake = 0, lastCls = '';
    return {
      update(t, R) {
        const B = R.bonus, ps = B.pickStart, pe = B.pickEnd, mine = ctx.mine(), pick = ctx.myPick();
        const shaking = t >= B.at + LV.intro && t < ps - 0.45;
        room.classList.toggle('shaking', shaking);
        if (shaking && t - lastShake > 0.105) { lastShake = t; snd.shake(); }
        room.classList.toggle('ready', t >= ps - 0.45);
        ctx.once('b-ready', ps - 0.45, t, (late) => { if (!late) Batty.sfx('ding'); });
        const open = t >= ps && t < pe, can = open && mine > 0 && pick == null;
        const cls = can + ':' + pick + ':' + open;
        if (cls !== lastCls) {
          lastCls = cls;
          btns.forEach((x, i) => { x.disabled = !can; x.classList.toggle('can', can); x.classList.toggle('pick', pick === i && mine > 0); x.classList.toggle('unpick', pick != null && pick !== i && mine > 0); });
        }
        if (open) sc.setPrompt(mine ? (pick == null ? 'Pick your poison' : 'Locked in: ' + TENDERS[pick].nm) : 'You are watching: the players are choosing', (pe - t) / (pe - ps), Math.max(0, Math.ceil(pe - t)));
        else if (t >= pe && t < pe + 2.6 && mine > 0 && pick != null && !ctx.clicked()) sc.setPrompt('Out of time: the house picked ' + TENDERS[pick].nm + ' for you', 0);
        else sc.setPrompt(t < ps && t >= B.at + LV.intro ? 'The bartenders are mixing…' : '', 1);
        if (t >= pe) {
          if (B.picks) ctx.once('b-counts', pe, t, () => { const c = B.picks; btns.forEach((x, i) => { const e = x.querySelector('.cnt'); if (c[i]) { e.hidden = false; e.textContent = c[i] + (c[i] === 1 ? ' pick' : ' picks'); } }); });
          if (B.mults) {
            const end = pe + 0.6, first = mine > 0 && pick != null ? pick : 0;
            const order = [first].concat([0, 1, 2].filter((i) => i !== first));
            if (mine > 0) { ctx.once('b-h1', pe, t, (late) => { if (!late) snd.heart(); }); ctx.once('b-h2', pe + 0.5, t, (late) => { if (!late) snd.heart(); }); }
            order.forEach((i, k) => ctx.once('b-rev' + i, end + (k ? 1.3 + (k - 1) * 0.65 : 0), t, (late) => {
              const x = btns[i]; x.classList.add('rev'); x.querySelector('.mx').textContent = B.mults[i] + '×';
              if (B.mults[i] >= 20) x.classList.add('hot');
              if (!late) { snd.pour(); if (k === 0) { Batty.sfx(B.mults[i] >= 20 ? 'win' : 'pop'); Batty.fx.burst({ el: x.querySelector('.gob'), kind: 'spark', count: B.mults[i] >= 20 ? 46 : 18, colors: ['#ff2e93', '#fff', '#ffd23f', '#e0173f'] }); } }
            }));
          }
        }
      },
    };
  }

  /* ---------- Hangin' Alive, live ---------- */
  function liveHang(sc, ctx) {
    const Lad = M.HANG.ladder, top = Lad.length - 1;
    const mach = h('canvas', { class: 'hg-cv', width: 240, height: 240 });
    const ballEl = h('div', { class: 'hg-ball' });
    const cap = h('div', { class: 'hg-cap' }, 'Seventeen balls. Six of them are trouble.');
    const btns = TEAMS.map((t, i) => {
      const b = h('button', { type: 'button', class: 'hg-team t' + i, disabled: true, onclick: () => ctx.pick(i) });
      b.innerHTML = bat({ body: t.col, wing: t.dark, acc: 'band', accCol: '#fff' }) + '<b>' + t.nm + '</b><span class="cnt" hidden></span>';
      b.style.setProperty('--c', t.col); return b;
    });
    const rows = h('div', { class: 'hg-rows' });
    for (let l = top; l >= 0; l--) rows.append(h('div', { class: 'hg-row' + (l >= 13 ? ' hi' : l >= 9 ? ' mid' : ''), 'data-l': l }, h('b', null, Lad[l] + '×'), h('i'), h('i'), h('i')));
    const toks = TEAMS.map((t, i) => {
      const k = h('div', { class: 'hg-tok t' + i, html: bat({ body: t.col, wing: t.dark, acc: 'band', accCol: '#fff' }) + '<span class="gr"><u></u><u></u></span><em></em>' });
      k.style.setProperty('--t', i); k.style.setProperty('--l', 0); k.style.setProperty('--c', t.col); return k;
    });
    const lad = h('div', { class: 'hg-lad' }, h('div', { class: 'hg-bell', html: '<svg viewBox="0 0 60 50" aria-hidden="true"><path d="M30 2c-12 0-17 12-17 28l-7 10h48l-7-10C47 14 42 2 30 2z" fill="#ffd23f" stroke="#8a5a00" stroke-width="2"/><circle cx="30" cy="44" r="5" fill="#8a5a00"/></svg>' }), rows, toks);
    const left = h('div', { class: 'hg-left' }, h('div', { class: 'hg-mach' }, mach, ballEl), cap, h('div', { class: 'hg-teams' }, btns));
    sc.body.append(h('div', { class: 'hg' }, left, lad));
    /* the ball machine: decoration only (the draws come from the server) */
    const balls = [];
    const mk = (kind, team) => balls.push({ kind, team, x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 120, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200 });
    for (let t = 0; t < 3; t++) { for (let i = 0; i < M.HANG.climbPerTeam; i++) mk('up', t); for (let i = 0; i < M.HANG.dropPerTeam; i++) mk('drop', t); }
    for (let i = 0; i < M.HANG.allBalls; i++) mk('all', -1);
    let agit = 0.35;
    const mc = mach.getContext('2d');
    const stopMach = S.loop((dt) => {
      const RR = 104, br = 13;
      mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, 240, 240); mc.translate(120, 120);
      const g2 = mc.createRadialGradient(-30, -40, 10, 0, 0, RR + 8); g2.addColorStop(0, 'rgba(255,255,255,.22)'); g2.addColorStop(1, 'rgba(120,80,220,.12)');
      mc.fillStyle = g2; mc.beginPath(); mc.arc(0, 0, RR + 8, 0, TAU); mc.fill();
      for (const b of balls) {
        b.vy += 420 * dt; b.vx += (Math.random() - 0.5) * 2400 * agit * dt; b.vy += (Math.random() - 0.62) * 2600 * agit * dt;
        b.vx *= 0.995; b.vy *= 0.995; b.x += b.vx * dt; b.y += b.vy * dt;
        const d = Math.hypot(b.x, b.y);
        if (d > RR - br) { const nx = b.x / d, ny = b.y / d, vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= 1.9 * vn * nx; b.vy -= 1.9 * vn * ny; } b.x = nx * (RR - br); b.y = ny * (RR - br); }
        const col = b.kind === 'all' ? COL.gold : TEAMS[b.team].col;
        mc.fillStyle = b.kind === 'drop' ? '#1a0b2e' : col; mc.beginPath(); mc.arc(b.x, b.y, br, 0, TAU); mc.fill();
        if (b.kind === 'drop') { mc.strokeStyle = col; mc.lineWidth = 3.5; mc.stroke(); mc.beginPath(); mc.moveTo(b.x - 5, b.y - 5); mc.lineTo(b.x + 5, b.y + 5); mc.moveTo(b.x + 5, b.y - 5); mc.lineTo(b.x - 5, b.y + 5); mc.stroke(); }
        else { mc.fillStyle = 'rgba(255,255,255,.75)'; mc.beginPath(); mc.arc(b.x - 4, b.y - 4, 3.5, 0, TAU); mc.fill(); }
      }
      mc.strokeStyle = 'rgba(255,255,255,.55)'; mc.lineWidth = 5; mc.beginPath(); mc.arc(0, 0, RR + 6, 0, TAU); mc.stroke();
      mc.strokeStyle = 'rgba(255,255,255,.5)'; mc.lineWidth = 6; mc.lineCap = 'round'; mc.beginPath(); mc.arc(0, 0, RR - 8, -2.5, -1.9); mc.stroke();
    });
    let applied = 0, shownBall = -1, myDone = false, lastCls = '', lastShake = 0, picked = false;
    function apply(d, late, pick) {
      for (let tm = 0; tm < 3; tm++) toks[tm].style.setProperty('--l', d.levels[tm]);
      d.moved.forEach((tm) => { if (!late) { toks[tm].classList.remove('hop'); void toks[tm].offsetWidth; toks[tm].classList.add('hop'); } });
      if (d.kind !== 'drop') {
        const hi = Math.max.apply(null, d.moved.map((tm) => d.levels[tm]).concat([0]));
        if (!late) AU.tone({ f: 330 * Math.pow(2, hi / 12), f2: 440 * Math.pow(2, hi / 12), d: 0.16, type: 'triangle', v: 0.16 });
        cap.textContent = d.kind === 'all' ? 'Everybody up!' : TEAMS[d.team].nm + ' climb to ' + Lad[d.levels[d.team]] + '×';
        for (const tm of d.moved) if (d.levels[tm] >= top) { toks[tm].classList.add('top'); toks[tm].querySelector('em').textContent = Lad[top] + '×'; cap.textContent = TEAMS[tm].nm + ' ring the bell! ' + Lad[top] + '×'; if (!late) { snd.bell(); Batty.fx.burst({ el: toks[tm], kind: 'confetti', count: 50 }); } }
      } else {
        toks[d.team].classList.add(d.out === d.team ? 'out' : 'slip');
        if (d.out === d.team) { toks[d.team].querySelector('em').textContent = Lad[d.levels[d.team]] + '×'; cap.textContent = TEAMS[d.team].nm + ' are off. Banked at ' + Lad[d.levels[d.team]] + '×'; if (!late) snd.fall(); }
        else { cap.textContent = TEAMS[d.team].nm + ' slip! One claw left.'; if (!late) Batty.sfx('lose'); }
      }
      if (pick != null && !myDone && (d.out === pick || d.levels[pick] >= top)) {
        myDone = true; toks[pick].classList.add('banked'); if (!late) groove.stop();
        cap.textContent = (ctx.mine() ? 'Your team banked ' : TEAMS[pick].nm + ' banked ') + Lad[d.levels[pick]] + '×. The others play on.';
      }
    }
    return {
      update(t, R) {
        const B = R.bonus, ps = B.pickStart, pe = B.pickEnd, mine = ctx.mine(), pick = ctx.myPick(), evs = B.ev || [];
        const open = t >= ps && t < pe, can = open && mine > 0 && pick == null;
        const cls = can + ':' + pick + ':' + (t >= pe);
        if (cls !== lastCls) {
          lastCls = cls;
          btns.forEach((x, i) => { x.disabled = !can; x.classList.toggle('can', can); x.classList.toggle('pick', pick === i && mine > 0); x.classList.toggle('unpick', pick != null && pick !== i && mine > 0); });
        }
        if (open) sc.setPrompt(mine ? (pick == null ? 'Back a team' : 'You are on ' + TEAMS[pick].nm) : 'You are watching: the players are backing teams', (pe - t) / (pe - ps), Math.max(0, Math.ceil(pe - t)));
        else if (t >= pe && t < pe + 2.6 && mine > 0 && pick != null && !ctx.clicked()) sc.setPrompt('Out of time: the house backed ' + TEAMS[pick].nm + ' for you', 0);
        else sc.setPrompt('', 1);
        if (t >= pe && !picked) {
          picked = true;
          cap.textContent = mine > 0 ? 'Every team starts on 2×. Good luck!' : 'Three teams, one rope. Every team starts on 2×.';
          if (t - pe < 1.2) { Batty.sfx('ding'); groove.start(0.5); }
        }
        if (t >= pe && pick != null && mine > 0 && !toks[pick].classList.contains('mine')) { toks[pick].classList.add('mine'); left.classList.add('picked'); if (!applied) cap.textContent = 'You are on ' + TEAMS[pick].nm + '. Every team starts on 2×.'; }
        if (t >= pe && B.picks) ctx.once('h-counts', pe, t, () => { const c = B.picks; btns.forEach((x, i) => { const e = x.querySelector('.cnt'); if (c[i]) { e.hidden = false; e.textContent = c[i] + (c[i] === 1 ? ' fan' : ' fans'); } }); });
        /* the draws, each on its own beat */
        let shake = false, tense = false;
        for (let i = applied; i < evs.length; i++) if (t >= evs[i].t - 0.65 && t < evs[i].t - 0.3) shake = true;
        const mp = mine > 0 ? pick : null;
        if (shake && mp != null && !myDone) { const last = applied ? evs[applied - 1] : null; tense = last ? last.grips[mp] === 1 : false; }
        agit = shake ? 1.2 : 0.35;
        left.classList.toggle('tense', tense);
        if (shake && t - lastShake > 0.13) { lastShake = t; snd.shake(); if (tense) ctx.once('hb' + applied, t, t, () => snd.heart()); }
        for (let i = evs.length - 1; i >= 0; i--) if (t >= evs[i].t - 0.3) {
          if (i !== shownBall) {
            shownBall = i; const d = evs[i], col = d.kind === 'all' ? COL.gold : TEAMS[d.team].col;
            ballEl.style.setProperty('--c', col); ballEl.innerHTML = d.kind === 'all' ? ICON.star : d.kind === 'up' ? ICON.up : ICON.drop;
            ballEl.className = 'hg-ball'; void ballEl.offsetWidth; ballEl.className = 'hg-ball on k-' + d.kind;
            if (t - d.t < 0) Batty.sfx('pop');
          }
          break;
        }
        while (applied < evs.length && t >= evs[applied].t) { apply(evs[applied], t - evs[applied].t > 0.8, mp); applied++; }
        if (B.finish != null && t >= B.finish - 0.3) { ballEl.className = 'hg-ball'; agit = 0.2; }
      },
      destroy() { stopMach(); },
    };
  }

  /* ---------- Belfry Disco / VIP Crypt Disco, live ---------- */
  function liveDisco(sc, ctx, R0) {
    const vip = R0.spot === 'vip';
    const tot = h('b', null, '0×');
    const totEl = h('div', { class: 'dc-tot' }, h('small', null, 'Collected'), tot);
    const cap = h('div', { class: 'dc-cap' }, vip ? 'Velvet rope lifted. In you go.' : 'He starts in the middle. Every tile pays.');
    const floor = h('div', { class: 'dc-floor' });
    const wrap = h('div', { class: 'dc-wrap' }, floor);
    sc.body.append(h('div', { class: 'dc' + (vip ? ' vip' : '') }, totEl, wrap, cap));
    const tier = (v) => (vip ? (v >= 50 ? 5 : v >= 20 ? 4 : v >= 10 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0) : (v >= 25 ? 5 : v >= 10 ? 4 : v >= 5 ? 3 : v >= 3 ? 2 : v >= 2 ? 1 : 0));
    let tiles = null, dancer = null, n = 0, moved = 0, hits = -1, total = 0, pos = null, off = false;
    const NAMES = ['north', 'east', 'south', 'west'];
    function build(B) {
      n = B.size; floor.style.setProperty('--n', n);
      tiles = B.grid.map((v, i) => { const t = h('div', { class: 'tl v' + tier(v) }, h('span', null, v + '×')); t.style.setProperty('--d', ((i % n) + Math.floor(i / n)) * 40 + 'ms'); floor.append(t); return t; });
      dancer = h('div', { class: 'dc-dancer', html: '<span class="sh"></span>' + bat(vip ? { body: '#ffd23f', wing: '#8a5a00', acc: 'crown', shades: true, flares: '#1a0b2e', chain: true } : { body: '#8b4dff', wing: '#4b1fa8', afro: true, shades: true, flares: '#fff', chain: true }) });
      pos = [B.start[0], B.start[1]];
      dancer.style.setProperty('--r', pos[0]); dancer.style.setProperty('--c', pos[1]);
      floor.append(dancer);
    }
    function hit(r, c, v, late) {
      const t = tiles[r * n + c]; t.classList.add('seen');
      total += v; tot.textContent = xs(total);
      if (late) return;
      t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit');
      totEl.classList.remove('pop'); void totEl.offsetWidth; totEl.classList.add('pop');
      const fl = h('span', { class: 'dc-plus' }, '+' + v + '×'); t.append(fl); S.timeout(() => fl.remove(), 900);
      const tr = tier(v);
      AU.tone({ f: 392 * Math.pow(2, tr / 6), d: 0.16, type: 'square', v: 0.09 }); AU.tone({ f: 784 * Math.pow(2, tr / 6), d: 0.22, type: 'triangle', v: 0.1, t: 0.05 });
      if (tr >= 4) { Batty.sfx('coin'); Batty.fx.burst({ el: t, kind: 'spark', count: tr === 5 ? 40 : 20, colors: vip ? ['#ffd23f', '#fff', '#ff2e93'] : undefined }); }
    }
    const edgeAt = (p) => p[0] === 0 || p[1] === 0 || p[0] === n - 1 || p[1] === n - 1;
    return {
      update(t, R) {
        const B = R.bonus;
        if (!B.grid) return;
        if (!tiles) build(B);
        ctx.once('d-in', B.floor + 0.9, t, (late) => { dancer.classList.add('in'); if (!late && !off) groove.start(1); });
        if (hits < 0 && t >= B.first) { hits = 0; hit(B.start[0], B.start[1], B.grid[B.start[0] * n + B.start[1]], t - B.first > 0.8); }
        const evs = B.ev || [];
        /* danger: the next step leaves an edge tile */
        let danger = false;
        if (!off && moved < evs.length && hits >= 0 && edgeAt(pos) && t >= evs[moved].t - 0.75) { danger = true; ctx.once('dg' + moved, evs[moved].t - 0.75, t, (late) => { if (!late) { snd.heart(); cap.textContent = 'On the edge…'; } }); }
        floor.classList.toggle('danger', danger);
        while (moved < evs.length && t >= evs[moved].t) {
          const s = evs[moved], late = t - s.t > 0.8; moved++;
          pos = [s.r, s.c];
          dancer.style.setProperty('--r', s.r); dancer.style.setProperty('--c', s.c);
          dancer.classList.toggle('flip', s.dir === 3 || (s.dir !== 1 && dancer.classList.contains('flip')));
          if (!late) { dancer.classList.remove('hop'); void dancer.offsetWidth; dancer.classList.add('hop'); snd.wah(260 + (moved % 4) * 40); }
          if (s.off) {
            off = true; floor.classList.remove('danger'); dancer.classList.add('off', 'o' + s.dir); groove.stop();
            if (!late) snd.fall();
            cap.textContent = 'Off the floor to the ' + NAMES[s.dir] + '. ' + (total >= (vip ? 80 : 30) ? 'What a set.' : 'Two left feet.');
          }
        }
        while (hits < moved && hits >= 0) {
          const s = evs[hits]; if (t < s.t + 0.3 && !s.off) break;
          hits++;
          if (!s.off) { hit(s.r, s.c, s.value, t - s.t > 1.1); cap.textContent = 'Step ' + hits + ': +' + s.value + '×'; }
        }
      },
    };
  }

})();
