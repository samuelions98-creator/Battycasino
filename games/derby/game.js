/* ===== derby math ===== */
/* Bat Derby: pure maths. No DOM. Shared verbatim by the browser game, tools/derby-sim.js and tools/derby-xcheck.js,
   and ported line for line to lib/games/derby.php (same rng call order, same arithmetic, so the same races).
   Only + - * / and comparisons are used on doubles (no exp/log/pow), so PHP and JavaScript agree to the last bit.

   The race model. Every runner has a win strength w (its true win chance) and a place strength v.
   The winner is drawn in proportion to w; every later position is drawn from the runners left, in proportion to v
   (a Plackett-Luce order). So, exactly:
     P(i wins)               = w_i
     P(i 1st, j 2nd)         = w_i * v_j / (1 - v_i)                          (v sums to 1)
     P(i 1st, j 2nd, k 3rd)  = w_i * v_j / (1 - v_i) * v_k / (1 - v_i - v_j)
   Prices. Win prices are UK fractions from a fixed ladder; w_i is the price's implied chance divided by the book
   (so every runner's win price returns the same 1/book, kept within 95.85-96.15%). Each-way bets are struck at an
   each-way price (a shade shorter than the win price), and v is fitted so that every runner's each-way bet returns the
   same figure, also within 95.85-96.15%. Forecast and tricast dividends are 96% of the fair odds, rounded down to 0.01. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).derby = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const N = 8;                    /* runners per race */
  const TARGET = 0.96;            /* every bet type is priced to return 96% */
  const BAND = 0.0015;            /* a field is only offered when its win and each-way returns are within 96% +/- 0.15% */
  const DIV_CAP = 999999;         /* forecast/tricast dividends, in hundredths: a field whose dearest tricast would pay over 9,999.99x is redrawn */
  const MAX_X = 10000;            /* so no single bet can ever return more than 10,000x its stake */

  /* UK fractional odds, shortest first */
  const LADDER = [[1, 5], [2, 9], [1, 4], [2, 7], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1],
    [11, 10], [6, 5], [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2],
    [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [17, 2], [9, 1], [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [18, 1], [20, 1], [22, 1], [25, 1], [28, 1], [33, 1],
    [40, 1], [50, 1], [66, 1], [80, 1], [100, 1]];
  const L = LADDER.length;
  const DEC = LADDER.map((f) => (f[0] + f[1]) / f[1]);   /* decimal odds (stake back included) */
  const FRA = LADDER.map((f) => f[0] / f[1]);            /* fractional odds as a number */
  const fracStr = (i) => { const f = LADDER[i]; return f[0] === f[1] ? 'Evs' : f[0] + '/' + f[1]; };

  /* bet types */
  const TYPES = {
    win: { name: 'Win', n: 1 },
    ew: { name: 'Each Way', n: 1 },
    fc: { name: 'Forecast', n: 2 },
    rfc: { name: 'Reverse Forecast', n: 2 },
    tc: { name: 'Tricast', n: 3 },
  };

  /* ---------- cosmetics drawn with the field ---------- */
  const BAT_NAMES = ['Count Flapula', 'Wing Commander', 'Night Fury', 'Echo Location', 'Fang Shui', 'Guano Express', 'Sir Flapsalot', 'Velvet Wings',
    'Moonlit Menace', 'Belfry Boy', 'Nocturne', 'Dusk Till Dawn', 'Batty Boo', 'Steeple Chaser', 'Hanging Around', 'Upside Downey',
    'Sonar Flare', 'Leather Wing', 'Flittermouse', 'Nosferatu Ned', 'Little Fang', 'Pipistrelle Pete', 'Hollow Moon', 'Gloaming Glory',
    'Batsby', 'Blood Orange', 'Garlic Dodger', 'Coffin Dodger', 'Eclipse Express', 'Wingnut', 'Lady Noctula', 'Barbastelle',
    'Night Shift', 'Bramble Bat', 'Rooftop Rascal', 'Bell Tower', 'Echo Chamber', 'Moon Dancer', 'Shadow Puppet', 'Flap Jack',
    'Sky Fang', 'Midnight Feast', 'Dracu-Lass', 'Gothic Rocket', 'Vlad the Inhaler', 'Bite Club', 'Fangs a Million', 'Lord Dangleby'];
  const JOCKEYS = ['V. Nightingale', 'B. Wingate', 'R. Flittermouse', 'D. Batterby', 'S. Echols', 'C. Dusk', 'M. Moonie', 'J. Belfry',
    'T. Vamperley', 'L. Fangio', 'P. Gargoyle', 'H. Ravenscroft', 'E. Mothersole', 'A. Sonar'];
  const RACE_NAMES = ['Moonlight Sprint', 'Belfry Handicap', 'Count’s Cup', 'Twilight Stakes', 'Gravestone Maiden Stakes', 'Full Moon Derby',
    'Crypt Nursery Stakes', 'Lantern Trophy', 'Batty Bucks Handicap', 'Vampire Vase', 'Echo Plate', 'Gothic Gold Cup', 'Harvest Moon Stakes',
    'Witching Hour Handicap', 'Fang Sprint', 'Night Owl Conditions Stakes'];
  const GOINGS = ['Good', 'Good to Firm', 'Good to Soft', 'Soft', 'Firm'];
  const GOING_W = [34, 22, 24, 12, 8];
  const DISTS = [5, 6, 7];                 /* furlongs */
  const DIST_MS = [15200, 17400, 19600];   /* a typical winning time, ms */
  const COLOURS = ['#e8173a', '#1d4fd8', '#ffd21f', '#0f9d58', '#ffffff', '#14141c', '#ff7a1a', '#7b2ff7', '#ff5fb0', '#22c6e0', '#7a1030', '#0b2a6b', '#9be22d', '#c0c6d2', '#7b4a1e', '#00796b'];
  const PATTERNS = ['hoops', 'stripes', 'chevrons', 'quartered', 'halved', 'sash', 'cross', 'stars', 'spots', 'diamonds', 'check', 'braces', 'hoop', 'seams'];
  const CAPS = ['plain', 'quartered', 'hooped', 'spots', 'star', 'peak'];
  /* margins, in hundredths of a length, and the weights for the winning margin and for the gaps behind */
  const MARGINS = [5, 10, 20, 30, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600];
  const WIN_MW = [6, 6, 7, 12, 14, 12, 10, 7, 6, 4, 4, 2, 2, 1, 1, 0, 0];
  const GAP_MW = [3, 4, 6, 10, 13, 12, 11, 8, 8, 5, 6, 4, 3, 2, 2, 1, 1];

  function pickW(rng, w) {
    let t = 0; for (let i = 0; i < w.length; i++) t += w[i];
    let r = rng() * t;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return w.length - 1;
  }
  function shuffleTake(rng, arr, k) {
    const a = arr.slice();
    for (let i = 0; i < k; i++) { const j = i + Math.floor(rng() * (a.length - i)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, k);
  }
  /* e^x for |x| < 4, as (1 + x/1024)^1024: plain multiplication, so it is bit-identical in PHP */
  function expA(x) { let y = 1 + x / 1024; for (let i = 0; i < 10; i++) y = y * y; return y; }
  /* roughly standard normal, from four uniforms */
  function gauss(rng) { return (rng() + rng() + rng() + rng() - 2) * 1.7320508075688772; }

  /* nearest ladder rung to decimal odds d (nearest on a log scale, compared without logs) */
  function snapDec(d) {
    if (d <= DEC[0]) return 0;
    for (let i = 1; i < L; i++) if (d <= DEC[i]) return d * d < DEC[i - 1] * DEC[i] ? i - 1 : i;
    return L - 1;
  }
  function snapFra(f) {
    if (f <= FRA[0]) return 0;
    for (let i = 1; i < L; i++) if (f <= FRA[i]) return f * f < FRA[i - 1] * FRA[i] ? i - 1 : i;
    return L - 1;
  }

  /* chance of finishing in the first three, for every runner, under (w, v) */
  function placeProbs(w, v) {
    const out = [0, 0, 0, 0, 0, 0, 0, 0];
    let V = 0; for (let i = 0; i < N; i++) V += v[i];
    for (let j = 0; j < N; j++) {
      out[j] += w[j];
      const V1 = V - v[j];
      for (let a = 0; a < N; a++) {
        if (a === j) continue;
        const pa = v[a] / V1;
        out[a] += w[j] * pa;
        const V2 = V1 - v[a];
        for (let b = 0; b < N; b++) { if (b === j || b === a) continue; out[b] += w[j] * pa * v[b] / V2; }
      }
    }
    return out;
  }
  function bookReturn(idx) { let q = 0; for (let i = 0; i < N; i++) q += 1 / DEC[idx[i]]; return 1 / q; }
  /* the each-way return that the 'first three' total of exactly 3 forces, for win chances w and each-way fractions e */
  function ewReturn(w, eidx) {
    let sb = 0, sc = 0;
    for (let i = 0; i < N; i++) { const e = FRA[eidx[i]]; const b = 1 / (1 + e / 4); sb += b; sc += w[i] * (1 + e) * b; }
    return (3 + sc) / (2 * sb);
  }
  /* move prices one or two rungs at a time until fn(idx) is as close to TARGET as single and paired moves can get it */
  function tune(idx, fn, maxOf) {
    for (let it = 0; it < 30; it++) {
      const cur = fn(idx); let best = cur < TARGET ? TARGET - cur : cur - TARGET;
      if (best < 0.0006) return;
      const moves = [];
      for (let i = 0; i < N; i++) for (let d = -1; d <= 1; d += 2) { const k = idx[i] + d; if (k >= 0 && k <= maxOf(i)) moves.push([i, d]); }
      let bm = null;
      for (let m = 0; m < moves.length; m++) {
        const A = moves[m]; idx[A[0]] += A[1];
        let r = fn(idx), e = r < TARGET ? TARGET - r : r - TARGET;
        if (e < best) { best = e; bm = [A]; }
        for (let m2 = m + 1; m2 < moves.length; m2++) {
          const B2 = moves[m2]; if (B2[0] === A[0]) continue;
          idx[B2[0]] += B2[1]; r = fn(idx); e = r < TARGET ? TARGET - r : r - TARGET;
          if (e < best) { best = e; bm = [A, B2]; }
          idx[B2[0]] -= B2[1];
        }
        idx[A[0]] -= A[1];
      }
      if (!bm) return;
      for (const A of bm) idx[A[0]] += A[1];
    }
  }

  /* Price a field from the runners' ratings. Returns null if this draw cannot be priced within the bands (the caller redraws). */
  function priceField(rng, ratings) {
    let mean = 0; for (let i = 0; i < N; i++) mean += ratings[i]; mean /= N;
    const sig = 0.34 + 0.32 * rng();
    const s = []; let S = 0;
    for (let i = 0; i < N; i++) { const x = (ratings[i] - mean) * 0.04 + gauss(rng) * sig; const e = expA(x < -3.5 ? -3.5 : x > 3.5 ? 3.5 : x); s.push(e); S += e; }
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(snapDec(TARGET * S / s[i]));
    tune(idx, bookReturn, () => L - 1);
    const rw = bookReturn(idx);
    if (rw < TARGET - BAND || rw > TARGET + BAND) return null;
    const w = []; for (let i = 0; i < N; i++) w.push(rw / DEC[idx[i]]);
    /* each-way prices: the same fraction k of every win price, k chosen so the each-way return is 96%, then laddered */
    let lo = 0.5, hi = 1.05, k = 1;
    for (let t = 0; t < 40; t++) { k = (lo + hi) / 2; const e = []; for (let i = 0; i < N; i++) e.push(snapFra(FRA[idx[i]] * k)); if (ewReturn(w, e) > TARGET) hi = k; else lo = k; }
    const eidx = []; for (let i = 0; i < N; i++) { const j = snapFra(FRA[idx[i]] * k); eidx.push(j > idx[i] ? idx[i] : j); }
    tune(eidx, (x) => ewReturn(w, x), (i) => idx[i]);
    const re = ewReturn(w, eidx);
    if (re < TARGET - BAND || re > TARGET + BAND) return null;
    /* the place chance each runner needs so its each-way bet returns re */
    const tgt = [];
    for (let i = 0; i < N; i++) {
      const e = FRA[eidx[i]]; const t = (2 * re - w[i] * (1 + e)) / (1 + e / 4);
      if (!(t > w[i] + 0.002) || !(t < 0.995)) return null;
      tgt.push(t);
    }
    /* fit the place strengths v to those chances (multiplicative scaling on the placed-but-not-won part) */
    let v = w.slice(), err = 1;
    for (let it = 0; it < 200 && err > 1e-13; it++) {
      const c = placeProbs(w, v); err = 0;
      for (let i = 0; i < N; i++) { const d = c[i] - tgt[i]; const ad = d < 0 ? -d : d; if (ad > err) err = ad; v[i] = v[i] * ((tgt[i] - w[i]) / (c[i] - w[i])); }
      let sv = 0; for (let i = 0; i < N; i++) sv += v[i];
      for (let i = 0; i < N; i++) v[i] = v[i] / sv;
    }
    if (err > 1e-9) return null;
    /* forecast and tricast dividends, in hundredths of the stake (stake included) */
    const fc = [], tc = [];
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      if (a === b) { fc.push(0); for (let c = 0; c < N; c++) tc.push(0); continue; }
      const pab = w[a] * v[b] / (1 - v[a]);
      fc.push(Math.floor(96 / pab));
      for (let c = 0; c < N; c++) {
        if (c === a || c === b) { tc.push(0); continue; }
        const d = Math.floor(96 / (pab * v[c] / (1 - v[a] - v[b])));
        if (d > DIV_CAP) return null;
        tc.push(d);
      }
    }
    return { idx, eidx, w, v, rw, re, fc, tc };
  }

  /* ---------- the stable ---------- */
  function makeSilks(rng) {
    const b = Math.floor(rng() * COLOURS.length);
    let a = Math.floor(rng() * (COLOURS.length - 1)); if (a >= b) a++;
    const p = Math.floor(rng() * PATTERNS.length);
    const cp = Math.floor(rng() * CAPS.length);
    const c = rng() < 0.5 ? a : b;
    return { b: COLOURS[b], a: COLOURS[a], p: PATTERNS[p], c: COLOURS[c], cp: CAPS[cp] };
  }
  /* a fresh stable of 48 bats: names, silks, ratings and a few previous runs */
  function makeRoster(rng) {
    const out = [];
    for (let i = 0; i < BAT_NAMES.length; i++) {
      const silks = makeSilks(rng);
      const rating = 62 + Math.floor(rng() * 40);
      const runs = 3 + Math.floor(rng() * 4);
      let form = '';
      for (let k = 0; k < runs; k++) {
        const q = (rating - 62) / 40;                 /* 0 weakest .. 1 best */
        let pos = 1 + Math.floor(rng() * 8 * (1.15 - 0.75 * q));
        if (pos > 8) pos = 8; if (pos < 1) pos = 1;
        form += String(pos);
      }
      out.push({ id: i + 1, name: BAT_NAMES[i], silks, rating, form, runs, wins: (form.match(/1/g) || []).length, hist: [] });
    }
    return out;
  }

  /* Build a race from the stable. roster: every bat, in id order. exclude: ids running in the race before. */
  function makeRace(rng, roster, exclude) {
    const pool = []; for (const b of roster) if (exclude.indexOf(b.id) < 0) pool.push(b);
    const runners = shuffleTake(rng, pool, N);
    const jockeys = shuffleTake(rng, JOCKEYS, N);
    const name = RACE_NAMES[Math.floor(rng() * RACE_NAMES.length)];
    const dist = Math.floor(rng() * DISTS.length);
    const going = pickW(rng, GOING_W);
    const ratings = runners.map((b) => b.rating);
    let pr = null, tries = 0;
    while (!pr) { pr = priceField(rng, ratings); tries++; if (tries > 200) throw new Error('derby: could not price a field'); }
    let avg = 0; for (const r of ratings) avg += r; avg /= N;
    const cls = avg >= 92 ? 1 : avg >= 84 ? 2 : avg >= 76 ? 3 : avg >= 68 ? 4 : 5;
    return {
      name, dist: DISTS[dist], going: GOINGS[going], cls, tries,
      runners: runners.map((b, i) => ({ no: i + 1, id: b.id, name: b.name, silks: b.silks, rating: b.rating, form: b.form, jockey: jockeys[i],
        odds: LADDER[pr.idx[i]].slice(), ew: LADDER[pr.eidx[i]].slice(), oi: pr.idx[i], ei: pr.eidx[i] })),
      w: pr.w, v: pr.v, rw: pr.rw, re: pr.re, fc: pr.fc, tc: pr.tc,
    };
  }

  /* The result: the finishing order (winner by w, the rest by v), the distances between them, and the race timing. */
  function runRace(rng, race) {
    const order = [];
    const left = [0, 1, 2, 3, 4, 5, 6, 7];
    const first = pickW(rng, race.w);
    order.push(first); left.splice(left.indexOf(first), 1);
    while (left.length) {
      const vw = left.map((i) => race.v[i]);
      const k = pickW(rng, vw);
      order.push(left[k]); left.splice(k, 1);
    }
    const margins = [MARGINS[pickW(rng, WIN_MW)]];
    for (let i = 1; i < N - 1; i++) margins.push(MARGINS[pickW(rng, GAP_MW)]);
    const di = DISTS.indexOf(race.dist);
    const goingMs = { 'Firm': -300, 'Good to Firm': -150, 'Good': 0, 'Good to Soft': 200, 'Soft': 450 }[race.going] || 0;
    const timeMs = DIST_MS[di] + goingMs + Math.floor(rng() * 900) - 300;
    const seed = Math.floor(rng() * 2147483647);
    return { order, margins, timeMs, seed, photo: margins[0] <= 20 };
  }

  /* ---------- bets ---------- */
  /* Validate a bet {t, sel:[runner indexes 0..7], stake}. Returns an error string or ''. */
  function checkBet(b, stakes) {
    if (!b || typeof b !== 'object' || !TYPES[b.t]) return 'Unknown bet type';
    if (!Array.isArray(b.sel) || b.sel.length !== TYPES[b.t].n) return 'Pick ' + TYPES[b.t].n + ' runner' + (TYPES[b.t].n > 1 ? 's' : '');
    for (let i = 0; i < b.sel.length; i++) {
      const x = b.sel[i]; if (!Number.isInteger(x) || x < 0 || x >= N) return 'Bad runner';
      for (let j = 0; j < i; j++) if (b.sel[j] === x) return 'Pick different runners';
    }
    if (stakes.indexOf(b.stake) < 0) return 'That stake is not on offer';
    return '';
  }
  /* What a bet returns (stake included), in whole Batty Bucks, given the result. Each-way and reverse forecasts are two
     bets of the stake each (UK style), so they cost twice the stake: each way = the stake to win plus the stake to place. */
  const costOf = (b) => (b.t === 'ew' || b.t === 'rfc' ? 2 : 1) * b.stake;
  function settleBet(b, race, res) {
    const o = res.order, s = b.stake, R = race.runners;
    const pos = (i) => o.indexOf(i);
    if (b.t === 'win') { const f = R[b.sel[0]].odds; return pos(b.sel[0]) === 0 ? Math.floor(s * (f[0] + f[1]) / f[1]) : 0; }
    if (b.t === 'ew') {
      const f = R[b.sel[0]].ew, h = s, p = pos(b.sel[0]);
      let r = 0;
      if (p === 0) r += Math.floor(h * (f[0] + f[1]) / f[1]);
      if (p >= 0 && p <= 2) r += Math.floor(h * (f[0] + 4 * f[1]) / (4 * f[1]));
      return r;
    }
    if (b.t === 'fc') return o[0] === b.sel[0] && o[1] === b.sel[1] ? Math.floor(s * race.fc[b.sel[0] * N + b.sel[1]] / 100) : 0;
    if (b.t === 'rfc') {
      const h = s, a = b.sel[0], c = b.sel[1];
      if (o[0] === a && o[1] === c) return Math.floor(h * race.fc[a * N + c] / 100);
      if (o[0] === c && o[1] === a) return Math.floor(h * race.fc[c * N + a] / 100);
      return 0;
    }
    if (b.t === 'tc') return o[0] === b.sel[0] && o[1] === b.sel[1] && o[2] === b.sel[2] ? Math.floor(s * race.tc[(b.sel[0] * N + b.sel[1]) * N + b.sel[2]] / 100) : 0;
    return 0;
  }
  /* The most a bet could return (for the slip). */
  function bestReturn(b, race) {
    const R = race.runners, s = b.stake;
    if (b.t === 'win') { const f = R[b.sel[0]].odds; return Math.floor(s * (f[0] + f[1]) / f[1]); }
    if (b.t === 'ew') { const f = R[b.sel[0]].ew, h = s; return Math.floor(h * (f[0] + f[1]) / f[1]) + Math.floor(h * (f[0] + 4 * f[1]) / (4 * f[1])); }
    if (b.t === 'fc') return Math.floor(s * race.fc[b.sel[0] * N + b.sel[1]] / 100);
    if (b.t === 'rfc') { const a = b.sel[0], c = b.sel[1], h = s; return Math.max(Math.floor(h * race.fc[a * N + c] / 100), Math.floor(h * race.fc[c * N + a] / 100)); }
    if (b.t === 'tc') return Math.floor(s * race.tc[(b.sel[0] * N + b.sel[1]) * N + b.sel[2]] / 100);
    return 0;
  }
  /* Exact chance that a bet returns anything, and its exact expected return as a fraction of what it costs (ignoring whole-BB rounding). */
  function betStats(b, race) {
    const w = race.w, v = race.v, R = race.runners;
    const fcP = (a, c) => w[a] * v[c] / (1 - v[a]);
    if (b.t === 'win') { const f = R[b.sel[0]].odds; return { p: w[b.sel[0]], ret: w[b.sel[0]] * (f[0] + f[1]) / f[1] }; }
    if (b.t === 'ew') {
      const i = b.sel[0], f = R[i].ew, pl = placeProbs(w, v)[i];
      return { p: pl, ret: 0.5 * w[i] * (f[0] + f[1]) / f[1] + 0.5 * pl * (f[0] + 4 * f[1]) / (4 * f[1]) };
    }
    if (b.t === 'fc') { const P = fcP(b.sel[0], b.sel[1]); return { p: P, ret: P * race.fc[b.sel[0] * N + b.sel[1]] / 100 }; }
    if (b.t === 'rfc') { const a = b.sel[0], c = b.sel[1], P1 = fcP(a, c), P2 = fcP(c, a); return { p: P1 + P2, ret: 0.5 * (P1 * race.fc[a * N + c] + P2 * race.fc[c * N + a]) / 100 }; }
    if (b.t === 'tc') { const a = b.sel[0], c = b.sel[1], d = b.sel[2]; const P = fcP(a, c) * v[d] / (1 - v[a] - v[c]); return { p: P, ret: P * race.tc[(a * N + c) * N + d] / 100 }; }
    return { p: 0, ret: 0 };
  }

  /* ---------- after the race: the stable's form and ratings ---------- */
  /* bats: the roster entries for the race's runners (same order as race.runners). Returns updated copies. */
  function updateForm(bats, race, res, raceId, when) {
    /* expected place = rank of the price (1 = favourite), shared by joint favourites */
    const out = [];
    for (let i = 0; i < N; i++) {
      const b = bats[i]; const pos = res.order.indexOf(i) + 1;
      let rank = 1; for (let j = 0; j < N; j++) if (j !== i && race.runners[j].oi < race.runners[i].oi) rank++;
      const d = rank - pos;
      let rating = b.rating + (d > 0 ? Math.floor((d + 1) / 2) : d < 0 ? -Math.floor((1 - d) / 2) : 0) + (pos === 1 ? 1 : 0);
      if (rating > 125) rating = 125; if (rating < 45) rating = 45;
      let form = b.form + String(pos); if (form.length > 8) form = form.slice(form.length - 8);
      const hist = [{ race: raceId, at: when, pos, odds: fracStr(race.runners[i].oi), name: race.name, dist: race.dist, going: race.going, j: race.runners[i].jockey }].concat(b.hist || []).slice(0, 6);
      out.push({ id: b.id, rating, form, runs: b.runs + 1, wins: b.wins + (pos === 1 ? 1 : 0), hist });
    }
    return out;
  }

  /* how a margin in hundredths of a length is said */
  function marginStr(m) {
    if (m <= 5) return 'nose'; if (m <= 10) return 'short head'; if (m <= 20) return 'head'; if (m <= 30) return 'neck';
    const whole = Math.floor(m / 100), frac = m % 100;
    const fs = frac === 25 ? '¼' : frac === 50 ? '½' : frac === 75 ? '¾' : '';
    return (whole ? whole : '') + fs + (m <= 100 ? ' length' : ' lengths');
  }

  return { N, TARGET, BAND, MAX_X, LADDER, DEC, FRA, TYPES, BAT_NAMES, JOCKEYS, RACE_NAMES, COLOURS, PATTERNS, CAPS, MARGINS,
    costOf, fracStr, placeProbs, priceField, makeRoster, makeRace, runRace, checkBet, settleBet, bestReturn, betStats, updateForm, marginStr, expA, snapDec, snapFra };
});
/* ===== derby ===== */
/* Bat Derby: the presentation. One live racecourse for every player: the server runs race after race on its own clock
   (lib/games/derby.php) and this page draws it. Everything on the track is a pure function of the server's data (the card,
   the result with its seed, and the race clock), so every viewer, and a reload mid-race, sees the very same race.
   Practice mode (no server) runs the same maths locally, one race at a time, started by the player. */
(function () {
  'use strict';
  const ID = 'derby', M = BattyMath.derby, B = Batty, h = B.h, fmt = B.fmt;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const KEY = 'batty-derby-v1';
  const FURLONG = 201.168, LEN = 2.4, PXM = 15, VH = 450, TAU = Math.PI * 2, SKEW = 22;
  const STAKES = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];
  const TYPES = ['win', 'ew', 'fc', 'rfc', 'tc'];
  const TNAME = { win: 'Win', ew: 'Each Way', fc: 'Forecast', rfc: 'Reverse Forecast', tc: 'Tricast' };
  const TSHORT = { win: 'Win', ew: 'E/W', fc: 'Forecast', rfc: 'Rev FC', tc: 'Tricast' };
  const TTAB = { win: 'Win', ew: 'Each Way', fc: 'Forecast', rfc: 'Rev. FC', tc: 'Tricast' };
  /* saddle cloths, as on a British racecourse: 1 red, 2 white, 3 blue, 4 yellow, 5 green, 6 black, 7 orange, 8 pink */
  const CLOTH = [['#d0102b', '#fff'], ['#f2f2f2', '#14141c'], ['#1d4fd8', '#fff'], ['#ffd21f', '#14141c'], ['#0f9d58', '#fff'], ['#18181e', '#ffd21f'], ['#ff7a1a', '#14141c'], ['#ff5fb0', '#14141c']];
  const FUR = [['#5a4068', '#8a6a9c'], ['#4a3e58', '#7a6c90'], ['#6b4a34', '#a07656'], ['#44445a', '#74748e'], ['#5e4438', '#90705e'], ['#523e62', '#86709a']];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (f) => (f[0] === f[1] ? 'Evs' : f[0] + '/' + f[1]);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const chipLabel = (v) => (v >= 1000 ? v / 1000 + 'K' : String(v));
  const abbr = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'K' : fmt(n));
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const svgUrl = (s) => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';

  /* ============================== art ============================== */
  const DEFS = '<svg class="dy-defs" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="dy-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".4" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
    '<radialGradient id="dy-eye" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff9d8"/><stop offset=".6" stop-color="#ffd84a"/><stop offset="1" stop-color="#c77d00"/></radialGradient>' +
    '<linearGradient id="dy-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e2bd62"/><stop offset="1" stop-color="#8a6420"/></linearGradient>' +
    '<radialGradient id="dy-memb" cx=".2" cy=".9" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '</defs></svg>';

  function star(cx, cy, r) {
    let d = '';
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; d += (k ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
    return d + 'Z';
  }
  /* racing silks: cap and jersey, in the bat's registered colours and pattern */
  let UID = 0;
  const JERSEY = 'M10 17L16 14Q20 16.5 24 14L30 17L38 28L33 31L29 26L29 51L11 51L11 26L7 31L2 28Z';
  function silksSvg(s, cls) {
    const u = 'dys' + (++UID), A = s.a, C0 = s.b;
    let p = '';
    switch (s.p) {
      case 'hoops': p = [21, 29, 37, 45].map((y) => '<rect x="0" y="' + y + '" width="40" height="4"/>').join(''); break;
      case 'hoop': p = '<rect x="0" y="28" width="40" height="8"/>'; break;
      case 'stripes': p = [7, 15, 23, 31].map((x) => '<rect x="' + x + '" y="10" width="3.4" height="44"/>').join(''); break;
      case 'chevrons': p = '<path d="M0 21L20 31L40 21M0 32L20 42L40 32" fill="none" stroke="' + A + '" stroke-width="4"/>'; break;
      case 'quartered': p = '<rect x="20" y="10" width="20" height="20"/><rect x="0" y="30" width="20" height="24"/>'; break;
      case 'halved': p = '<rect x="20" y="10" width="20" height="44"/>'; break;
      case 'sash': p = '<path d="M9 13L16 13L33 53L26 53Z"/>'; break;
      case 'cross': p = '<path d="M9 13L16 13L33 53L26 53ZM31 13L24 13L7 53L14 53Z"/>'; break;
      case 'stars': p = '<path d="' + star(15, 25, 4) + star(25, 34, 4) + star(15, 43, 4) + star(33, 24, 3) + star(6, 26, 2.6) + '"/>'; break;
      case 'spots': p = [[14, 22], [25, 27], [16, 34], [26, 40], [14, 46], [33, 25], [7, 27]].map((c) => '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6"/>').join(''); break;
      case 'diamonds': p = '<path d="M20 18L24 25L20 32L16 25ZM20 34L24 41L20 48L16 41ZM10 26L13 31L10 36L7 31ZM30 26L33 31L30 36L27 31Z"/>'; break;
      case 'check': { for (let y = 13, r = 0; y < 52; y += 6, r++) for (let x = (r % 2) * 6; x < 40; x += 12) p += '<rect x="' + x + '" y="' + y + '" width="6" height="6"/>'; break; }
      case 'braces': p = '<rect x="13" y="13" width="3.4" height="40"/><rect x="23.6" y="13" width="3.4" height="40"/>'; break;
      case 'seams': p = '<path d="M16 14L13 51M24 14L27 51M8 29L11 26M32 29L29 26" fill="none" stroke="' + A + '" stroke-width="1.8"/>'; break;
      default: p = '';
    }
    const oc = s.c === A ? C0 : A;
    let cap = '';
    switch (s.cp) {
      case 'quartered': cap = '<rect x="12" y="2" width="8" height="5.5"/><rect x="20" y="7.5" width="8" height="6"/>'; break;
      case 'hooped': cap = '<rect x="10" y="7" width="20" height="2.6"/>'; break;
      case 'spots': cap = '<circle cx="16" cy="9" r="1.6"/><circle cx="21" cy="6" r="1.6"/><circle cx="24.5" cy="10.5" r="1.6"/>'; break;
      case 'star': cap = '<path d="' + star(20, 8.5, 3.6) + '"/>'; break;
      default: cap = '';
    }
    return '<svg class="dy-silks' + (cls ? ' ' + cls : '') + '" viewBox="0 0 40 54" aria-hidden="true"><defs><clipPath id="' + u + 'j"><path d="' + JERSEY + '"/></clipPath><clipPath id="' + u + 'c"><path d="M12 13Q12 3 20 3Q28 3 28 13Z"/></clipPath></defs>' +
      '<path d="' + JERSEY + '" fill="' + C0 + '"/><g fill="' + A + '" clip-path="url(#' + u + 'j)">' + p + '</g>' +
      '<path d="' + JERSEY + '" fill="url(#dy-gloss)" stroke="rgba(0,0,0,.45)" stroke-width="1"/>' +
      '<path d="M12 13Q12 3 20 3Q28 3 28 13Z" fill="' + s.c + '"/><g fill="' + oc + '" clip-path="url(#' + u + 'c)">' + cap + '</g>' +
      '<path d="M27 12L37 13.6L27 14.6Z" fill="' + (s.cp === 'peak' ? oc : s.c) + '" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>' +
      '<path d="M12 13Q12 3 20 3Q28 3 28 13Z" fill="url(#dy-gloss)" stroke="rgba(0,0,0,.45)" stroke-width=".8"/></svg>';
  }
  const clothHtml = (i, cls) => '<span class="dy-cl' + (cls ? ' ' + cls : '') + '" style="--c:' + CLOTH[i][0] + ';--t:' + CLOTH[i][1] + '">' + (i + 1) + '</span>';

  /* the racing bat, side on, facing right; the shoulder (wing pivot) is at (2,-4) */
  const WINGS = [
    'M2 -4C0 -22 -6 -40 -18 -52C-20 -44 -26 -42 -32 -44C-31 -36 -38 -32 -45 -33C-40 -24 -30 -14 -16 -5Z',
    'M2 -4C3 -26 -2 -46 -9 -60C-15 -47 -24 -41 -37 -39C-30 -28 -22 -15 -14 -5Z',
    'M2 -4C-2 -20 -10 -36 -24 -47C-27 -41 -32 -40 -37 -42C-37 -36 -42 -33 -48 -33C-48 -27 -52 -23 -58 -23C-46 -14 -32 -8 -16 -4Z',
  ];
  const BONES = ['M2 -4L-18 -52M2 -4L-32 -44M2 -4L-45 -33', 'M2 -4L-9 -60M2 -4L-37 -39', 'M2 -4L-24 -47M2 -4L-37 -42M2 -4L-48 -33M2 -4L-58 -23'];
  function batSvg(r, i) {
    const k = r.id % 3, fur = FUR[r.id % FUR.length], s = r.silks;
    const wing = (cls, fill) => '<g class="' + cls + '"><path d="' + WINGS[k] + '" fill="' + fill + '"/><path d="' + WINGS[k] + '" fill="' + s.b + '" opacity=".42"/><path d="' + WINGS[k] + '" fill="url(#dy-memb)"/><path d="' + BONES[k] + '" stroke="' + fur[1] + '" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>';
    return '<svg class="dy-batsvg" viewBox="-64 -64 128 112" aria-hidden="true">' +
      wing('wf', '#120c17') +
      '<path d="M-18 7Q-26 10 -31 16M-14 10Q-20 15 -22 21" stroke="' + fur[0] + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="0" cy="4" rx="20" ry="11" fill="' + fur[0] + '"/><ellipse cx="-2" cy="1" rx="15" ry="6" fill="' + fur[1] + '" opacity=".55"/>' +
      '<path d="M17 -8L14 -22L22 -11ZM24 -10L28 -22L29 -8Z" fill="' + fur[0] + '"/><path d="M17.5 -10L16 -18L20.5 -11.5Z" fill="#c9708a" opacity=".7"/>' +
      '<circle cx="22" cy="-1" r="9.5" fill="' + fur[0] + '"/><ellipse cx="30" cy="1.5" rx="4.5" ry="3.4" fill="' + fur[1] + '"/><circle cx="33.4" cy="0.6" r="1" fill="#120c17"/>' +
      '<ellipse cx="25" cy="-4" rx="2.9" ry="3.1" fill="url(#dy-eye)"/><circle cx="26" cy="-4" r="1.3" fill="#120c17"/>' +
      '<path d="M28 5L29.4 9.4L30.6 5Z" fill="#fff"/>' +
      '<rect x="-13" y="-6.5" width="13" height="10" rx="2" fill="' + CLOTH[i][0] + '" stroke="rgba(0,0,0,.4)" stroke-width=".7"/><text x="-6.5" y="1.6" text-anchor="middle" font-size="8" font-weight="800" font-family="Chakra Petch,Figtree,sans-serif" fill="' + CLOTH[i][1] + '">' + (i + 1) + '</text>' +
      '<path d="M-5 -6L0 -1L-6 2" stroke="#f3efe6" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M-8 -6Q-7 -16 3 -18.5L10 -14.5Q4 -10.5 1.5 -6Z" fill="' + s.b + '" stroke="rgba(0,0,0,.45)" stroke-width=".7"/>' +
      '<path d="M-6.5 -11Q-1 -15.5 6 -16.5" stroke="' + s.a + '" stroke-width="2.6" fill="none"/>' +
      '<path d="M5 -15L15 -8.5" stroke="' + s.b + '" stroke-width="3" stroke-linecap="round"/><circle cx="15.5" cy="-8" r="1.5" fill="#f2d2b0"/>' +
      '<circle cx="8.5" cy="-21" r="3.6" fill="#f2d2b0"/><path d="M4.6 -21.2Q5 -26.4 8.8 -26.4Q12.6 -26.4 12.8 -21.6Z" fill="' + s.c + '"/><path d="M12 -22L16.5 -21L12 -20.6Z" fill="' + s.c + '"/>' +
      wing('wn', '#1d1424') + '</svg>';
  }
  /* the bat used on the lobby poster and the result board (wings spread) */
  const POSTER = (function () {
    const bat = (x, y, s, c, a) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="' + WINGS[0] + '" fill="#2c1e3a"/><path d="' + WINGS[0] + '" fill="' + c + '" opacity=".3"/>' +
      '<ellipse cx="0" cy="4" rx="20" ry="11" fill="#6a4c7a"/><circle cx="22" cy="-1" r="9.5" fill="#6a4c7a"/><path d="M17 -8L14 -22L22 -11ZM24 -10L28 -22L29 -8Z" fill="#6a4c7a"/><ellipse cx="25" cy="-4" rx="2.9" ry="3.1" fill="#ffd84a"/>' +
      '<path d="M-8 -6Q-7 -16 3 -18.5L10 -14.5Q4 -10.5 1.5 -6Z" fill="' + c + '"/><path d="M-6.5 -11Q-1 -15.5 6 -16.5" stroke="' + a + '" stroke-width="2.6" fill="none"/><circle cx="8.5" cy="-21" r="3.6" fill="#f2d2b0"/><path d="M4.6 -21.2Q5 -26.4 8.8 -26.4Q12.6 -26.4 12.8 -21.6Z" fill="' + a + '"/>' +
      '<g transform="scale(1 -.7) translate(0 8)"><path d="' + WINGS[0] + '" fill="#3a2a4c"/></g></g>';
    let stars = ''; const r = mulberry(99);
    for (let i = 0; i < 40; i++) stars += '<circle cx="' + (r() * 300).toFixed(0) + '" cy="' + (r() * 200).toFixed(0) + '" r="' + (0.4 + r() * 1.1).toFixed(1) + '" fill="#fff" opacity="' + (0.3 + r() * 0.6).toFixed(2) + '"/>';
    return '<svg viewBox="0 0 300 380" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="dyp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090a26"/><stop offset=".6" stop-color="#2a1550"/><stop offset="1" stop-color="#4b1f5e"/></linearGradient>' +
      '<radialGradient id="dyp-moon" cx=".4" cy=".4" r=".6"><stop offset="0" stop-color="#fffbe8"/><stop offset=".7" stop-color="#f3e2a8"/><stop offset="1" stop-color="#d8c27a"/></radialGradient>' +
      '<radialGradient id="dyp-glow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="dyp-turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#123a2a"/><stop offset="1" stop-color="#06180f"/></linearGradient>' +
      '<linearGradient id="dyp-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e2bd62"/><stop offset="1" stop-color="#8a6420"/></linearGradient></defs>' +
      '<rect width="300" height="380" fill="url(#dyp-sky)"/>' + stars +
      '<circle cx="214" cy="86" r="80" fill="url(#dyp-glow)"/><circle cx="214" cy="86" r="42" fill="url(#dyp-moon)"/><circle cx="200" cy="76" r="7" fill="#e6d08e" opacity=".6"/><circle cx="226" cy="100" r="5" fill="#e6d08e" opacity=".5"/>' +
      '<path d="M0 250L30 236L52 244L70 222L76 222L80 206L84 222L96 226L120 240L150 232L180 244L210 230L240 242L270 228L300 240L300 300L0 300Z" fill="#160b26"/>' +
      '<rect x="0" y="262" width="300" height="118" fill="url(#dyp-turf)"/>' +
      '<path d="M0 286H300M0 300H300" stroke="#e9e4d6" stroke-width="2.4" opacity=".85"/>' + [20, 60, 100, 140, 180, 220, 260].map((x) => '<rect x="' + x + '" y="283" width="3" height="20" fill="#e9e4d6" opacity=".8"/>').join('') +
      '<rect x="248" y="150" width="6" height="150" fill="#f4f1ea"/><circle cx="251" cy="150" r="14" fill="#fff" stroke="#d0102b" stroke-width="6"/>' +
      bat(84, 190, 1.55, '#d0102b', '#ffd21f') + bat(170, 236, 1.2, '#1d4fd8', '#fff') + bat(56, 262, 1.0, '#0f9d58', '#ff7a1a') +
      '<text x="150" y="338" text-anchor="middle" font-family="Titan One, Lilita One, sans-serif" font-size="46" fill="url(#dyp-t)" stroke="#2a0b2a" stroke-width="2.5" paint-order="stroke">Bat Derby</text>' +
      '<text x="150" y="362" text-anchor="middle" font-family="Chakra Petch, sans-serif" font-size="13" letter-spacing="3" fill="#ffe9a8">LIVE BAT RACING</text></svg>';
  })();

  /* ---------- the racecourse scenery (tiles repeat sideways; the camera scrolls them at their own depth) ---------- */
  const TILE = {
    far: { w: 1200, par: 0.08, top: 150, hgt: 150, svg: (function () {
      const r = mulberry(5); let win = '';
      for (let i = 0; i < 14; i++) win += '<rect x="' + (520 + r() * 150).toFixed(0) + '" y="' + (40 + r() * 70).toFixed(0) + '" width="4" height="7" fill="#ffcf6a" opacity="' + (0.4 + r() * 0.6).toFixed(2) + '"/>';
      return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="150" viewBox="0 0 1200 150"><path d="M0 110L80 92L160 104L240 80L330 98L420 86L500 100L520 60L540 60L545 30L552 60L575 60L575 22L585 0L595 22L595 60L620 60L626 34L636 60L680 60L680 100L760 84L860 100L950 78L1040 96L1120 84L1200 110L1200 150L0 150Z" fill="#1a1030"/>' + win +
        '<path d="M0 128L120 116L260 126L380 112L520 124L660 110L800 124L940 112L1080 124L1200 128L1200 150L0 150Z" fill="#130a24"/></svg>';
    })() },
    mid: { w: 900, par: 0.3, top: 196, hgt: 104, svg: (function () {
      const tree = (x, s) => '<g transform="translate(' + x + ' 100) scale(' + s + ')"><path d="M0 0L-2 -40L-14 -52L-3 -46L-6 -70L0 -50L6 -78L4 -48L16 -60L3 -38L2 0Z" fill="#0e0a1a"/></g>';
      const grave = (x, s) => '<g transform="translate(' + x + ' 100) scale(' + s + ')"><path d="M-7 0V-14Q-7 -22 0 -22Q7 -22 7 -14V0Z" fill="#241a36"/><path d="M-1 -18H1V-8H-1ZM-4 -15H4V-13H-4Z" fill="#3a2d52"/></g>';
      const lamp = (x) => '<g transform="translate(' + x + ' 100)"><rect x="-1.5" y="-64" width="3" height="64" fill="#1a1426"/><circle cx="0" cy="-66" r="16" fill="#ffcf6a" opacity=".12"/><path d="M-5 -70H5L3 -62H-3Z" fill="#ffcf6a"/></g>';
      return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="104" viewBox="0 0 900 104">' + tree(40, 1) + grave(120, 1) + grave(150, 0.8) + lamp(230) + tree(320, 1.3) + grave(400, 1.1) + tree(470, 0.8) + lamp(560) + grave(640, 0.9) + grave(668, 0.7) + tree(760, 1.15) + grave(840, 1) +
        '<path d="M0 100H900V104H0Z" fill="#0c0816"/></svg>';
    })() },
    turf: { w: 240, par: 1, top: 292, hgt: 158, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="158" viewBox="0 0 240 158"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173f31"/><stop offset="1" stop-color="#0d2a1f"/></linearGradient></defs><rect width="240" height="158" fill="url(#g)"/><path d="M0 14H240V28H0ZM0 42H240V56H0ZM0 70H240V84H0ZM0 98H240V112H0ZM0 126H240V140H0Z" fill="#fff" opacity=".035"/><path d="M0 0H60L110 158H30ZM120 0H180L230 158H150Z" fill="#000" opacity=".06"/></svg>' },
    frail: { w: 360, par: 0.88, top: 268, hgt: 30, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="30" viewBox="0 0 360 30"><rect y="6" width="360" height="3.2" fill="#e8e4da" opacity=".85"/><rect y="14" width="360" height="2.2" fill="#e8e4da" opacity=".6"/>' + [0, 1, 2, 3, 4, 5].map((k) => '<rect x="' + (k * 60 + 2) + '" y="4" width="2.6" height="24" fill="#d8d3c6" opacity=".75"/>').join('') + '</svg>' },
    rail: { w: 440, par: 1, top: 414, hgt: 46, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="46" viewBox="0 0 440 46"><defs><linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9b4a8"/></linearGradient></defs><rect y="6" width="440" height="7" rx="3" fill="url(#r)"/><rect y="20" width="440" height="4" fill="#d8d3c6" opacity=".85"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => '<rect x="' + (k * 44 + 2) + '" y="4" width="5" height="42" fill="#ece8dd"/><rect x="' + (k * 44 + 5) + '" y="4" width="2" height="42" fill="#8f8a7e" opacity=".5"/>').join('') + '</svg>' },
    fore: { w: 700, par: 1.35, top: 428, hgt: 30, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="30" viewBox="0 0 700 30"><path d="M0 30L10 12L16 26L24 6L30 24L40 14L46 30ZM200 30L208 16L214 28L222 10L230 26L238 30ZM420 30L428 14L436 28L444 8L452 24L462 18L468 30ZM610 30L616 18L624 28L632 12L640 30Z" fill="#05110b"/></svg>' },
  };
  function skySvg() {
    const r = mulberry(17); let st = '';
    for (let i = 0; i < 90; i++) st += '<circle cx="' + (r() * 1600).toFixed(0) + '" cy="' + (r() * 230).toFixed(0) + '" r="' + (0.5 + r() * 1.3).toFixed(1) + '" fill="#fff" opacity="' + (0.25 + r() * 0.7).toFixed(2) + '"' + (i % 7 === 0 ? ' class="tw" style="animation-delay:-' + (r() * 4).toFixed(1) + 's"' : '') + '/>';
    return '<svg class="dy-skysvg" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><defs><linearGradient id="dy-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070823"/><stop offset=".55" stop-color="#1d1145"/><stop offset="1" stop-color="#3d1a55"/></linearGradient></defs><rect width="1600" height="300" fill="url(#dy-sk)"/>' + st + '</svg>';
  }
  const MOON = '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><radialGradient id="dy-mg"><stop offset=".3" stop-color="#ffe9a8" stop-opacity=".5"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient><radialGradient id="dy-mb" cx=".4" cy=".38" r=".62"><stop offset="0" stop-color="#fffdf0"/><stop offset=".75" stop-color="#f1dfa2"/><stop offset="1" stop-color="#cfb76c"/></radialGradient></defs>' +
    '<circle cx="100" cy="100" r="98" fill="url(#dy-mg)"/><circle cx="100" cy="100" r="44" fill="url(#dy-mb)"/><circle cx="86" cy="88" r="8" fill="#dcc583" opacity=".55"/><circle cx="114" cy="112" r="6" fill="#dcc583" opacity=".5"/><circle cx="108" cy="80" r="4" fill="#dcc583" opacity=".45"/><circle cx="84" cy="116" r="3.5" fill="#dcc583" opacity=".4"/></svg>';
  /* the grandstand by the winning post: "The Belfry", packed with bats */
  function standSvg() {
    const r = mulberry(23), cols = ['#5a3f6e', '#6b4a3a', '#3e4a6b', '#7a2a3a', '#2f5a4a', '#6b6b7a', '#8a6a2a', '#4a2a5a'];
    let crowd = '';
    for (let row = 0; row < 4; row++) {
      let g = '';
      for (let x = 30 + (row % 2) * 9; x < 1440; x += 17 + r() * 4) {
        const y = 118 - row * 22 + r() * 3, c = cols[Math.floor(r() * cols.length)];
        g += '<path d="M' + (x - 6).toFixed(1) + ' ' + (y + 8).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + (y - 9).toFixed(1) + ' ' + (x + 6).toFixed(1) + ' ' + (y + 8).toFixed(1) + 'L' + (x + 4) + ' ' + (y - 6).toFixed(1) + 'L' + (x + 1) + ' ' + (y - 2).toFixed(1) + 'L' + (x - 1) + ' ' + (y - 2).toFixed(1) + 'L' + (x - 4) + ' ' + (y - 6).toFixed(1) + 'Z" fill="' + c + '"/>';
        if (r() < 0.12) g += '<rect x="' + (x - 1) + '" y="' + (y - 14).toFixed(1) + '" width="2" height="9" fill="#ffd76a"/><path d="M' + (x + 1) + ' ' + (y - 14).toFixed(1) + 'h8l-2 3l2 3h-8z" fill="' + CLOTH[Math.floor(r() * 8)][0] + '"/>';
      }
      crowd += '<g class="cr cr' + row + '">' + g + '</g>';
    }
    let flash = '';
    for (let i = 0; i < 16; i++) flash += '<circle class="fl" cx="' + (40 + r() * 1360).toFixed(0) + '" cy="' + (60 + r() * 70).toFixed(0) + '" r="5" fill="#fff" style="animation-delay:-' + (r() * 3).toFixed(2) + 's"/>';
    let arches = '';
    for (let x = 0; x < 1440; x += 120) arches += '<path d="M' + x + ' 30Q' + (x + 60) + ' -6 ' + (x + 120) + ' 30" fill="none" stroke="#3a2a52" stroke-width="5"/><rect x="' + (x - 3) + '" y="26" width="6" height="128" fill="#2a1d3c"/>';
    return '<svg class="dy-standsvg" viewBox="0 0 1440 170" aria-hidden="true"><defs><linearGradient id="dy-st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1430"/><stop offset="1" stop-color="#2e2148"/></linearGradient><radialGradient id="dy-fl"><stop offset="0" stop-color="#fff6d8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient></defs>' +
      '<path d="M0 34L40 8H1400L1440 34V170H0Z" fill="url(#dy-st)"/><path d="M40 8H1400" stroke="#ffd76a" stroke-width="2" opacity=".6"/>' + arches + crowd + flash +
      '<rect x="560" y="0" width="320" height="22" rx="4" fill="#120a1e" stroke="#e2bd62" stroke-width="1.5"/><text x="720" y="16" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="14" letter-spacing="4" fill="#ffe9a8">THE BELFRY STAND</text>' +
      '<path d="M0 154H1440V170H0Z" fill="#120b1e"/>' +
      [140, 1300].map((x) => '<g transform="translate(' + x + ' 0)"><rect x="-3" y="-70" width="6" height="110" fill="#2a2236"/><rect x="-20" y="-84" width="40" height="16" rx="3" fill="#3a3248"/><circle cx="-12" cy="-76" r="4" fill="#fff6d8"/><circle cx="0" cy="-76" r="4" fill="#fff6d8"/><circle cx="12" cy="-76" r="4" fill="#fff6d8"/><circle cx="0" cy="-76" r="40" fill="url(#dy-fl)" opacity=".5"/></g>').join('') +
      '</svg>';
  }
  /* the starting stalls: eight bays, each with a perch bar the bats hang from */
  function stallsSvg() {
    let s = '<svg class="dy-stallsvg" viewBox="-70 0 300 450" aria-hidden="true">';
    const top = (i) => laneBatY(i) - 30 * laneScale(i);
    s += '<path d="M' + (skw(0) - 36) + ' ' + (top(0) - 16).toFixed(1) + 'L' + (skw(7) - 36) + ' ' + (top(7) - 16).toFixed(1) + 'M' + (skw(0) + 36) + ' ' + (top(0) - 16).toFixed(1) + 'L' + (skw(7) + 36) + ' ' + (top(7) - 16).toFixed(1) + '" stroke="#2c7a52" stroke-width="7" stroke-linecap="round"/>';
    for (let i = 0; i < 8; i++) {
      const x = skw(i), y = top(i), sc = laneScale(i), gy = laneGround(i);
      s += '<path d="M' + (x - 34) + ' ' + (y - 16).toFixed(1) + 'V' + gy + 'M' + (x + 34) + ' ' + (y - 16).toFixed(1) + 'V' + gy + '" stroke="#1d5a3c" stroke-width="' + (2.4 + i * 0.3).toFixed(1) + '"/>' +
        '<path d="M' + (x - 30) + ' ' + y.toFixed(1) + 'H' + (x + 30) + '" stroke="#d9d2bd" stroke-width="' + (3 + i * 0.3).toFixed(1) + '" stroke-linecap="round"/>' +
        '<rect class="gt" x="' + (x + 28) + '" y="' + (y + 2).toFixed(1) + '" width="' + (5 + i * 0.4).toFixed(1) + '" height="' + (56 * sc).toFixed(1) + '" rx="1.5" fill="#2c7a52" stroke="#e2bd62" stroke-width=".8"/>' +
        '<rect x="' + (x - 46) + '" y="' + (y - 22).toFixed(1) + '" width="16" height="14" rx="2" fill="' + CLOTH[i][0] + '" stroke="#000" stroke-opacity=".3"/><text x="' + (x - 38) + '" y="' + (y - 11.5).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="800" font-family="Chakra Petch,sans-serif" fill="' + CLOTH[i][1] + '">' + (i + 1) + '</text>';
    }
    return s + '</svg>';
  }
  /* lanes: 0 is the far side of the course (higher up and smaller), 7 the near rail */
  function laneScale(i) { return 0.92 + i * 0.05; }
  function laneGround(i) { return 306 + i * 14; }
  /* neighbouring lanes fly at different heights, so every runner can be seen */
  function laneBatY(i) { return laneGround(i) - (56 + (((i % 2) + 2) % 2) * 30) * laneScale(i); }
  /* the course is seen a little from above, so a line across it (the stalls, the winning line) runs up and to the right */
  const skw = (i) => (7 - i) * SKEW;

  /* ============================== the race model (presentation only) ==============================
     The finishing order, the distances and the winning time come from the server. This turns them into eight smooth
     flight paths: a shared pace profile plus, for each runner, a running style, a few gentle surges and a final gap that
     opens late, all from the result's seed. Every path ends exactly at the official distances. */
  function buildModel(card, res) {
    const rng = mulberry((res.seed >>> 0) || 7);
    const Dm = card.dist * FURLONG, T = Math.max(6, res.timeMs / 1000), tau = 0.75;
    const Vc = Dm / (T - tau * (1 - Math.exp(-T / tau)));
    const cum = []; let c = 0;
    res.order.forEach((ri, k) => { if (k > 0) c += res.margins[k - 1] / 100; cum[ri] = c; });
    const R = [];
    for (let i = 0; i < 8; i++) R.push({ g: cum[i] * LEN, style: rng() * 2 - 1, sa: 3 + rng() * 9, late: 1.3 + rng() * 1.8, wob: [0, 1, 2].map(() => ({ a: 0.25 + rng() * 1.0, f: 0.8 + rng() * 2.6, p: rng() * TAU })) });
    const m = { Dm, T, tau, Vc, R, vEnd: [], cross: [], res, card };
    for (let i = 0; i < 8; i++) { const x1 = rawX(m, i, T), x0 = rawX(m, i, T - 0.05); m.vEnd[i] = (x1 - x0) / 0.05; m.cross[i] = T + (Dm - x1) / m.vEnd[i]; }
    m.events = commentary(m);
    return m;
  }
  function rawX(m, i, t) {
    if (t <= 0) return 0;
    const r = m.R[i], u = Math.min(1, t / m.T), e = 1 - Math.exp(-t / m.tau);
    const S = Math.pow(u, r.late), bump = Math.sin(Math.PI * Math.pow(u, 0.8)), env = Math.sin(Math.PI * u);
    let w = 0; for (const q of r.wob) w += q.a * Math.sin(TAU * q.f * u + q.p);
    return m.Vc * (t - m.tau * e) + e * (-r.g * S + r.style * r.sa * bump + env * w);
  }
  function xAt(m, i, t) {
    if (t <= m.T) return rawX(m, i, t);
    const v = m.vEnd[i], xT = m.Dm - m.R[i].g;
    const over = m.Dm + 5, x = xT + v * (t - m.T);
    if (x <= over) return x;
    const tc = m.T + (over - xT) / v, tt = t - tc, dec = 16, ts = (v * 0.8) / dec;
    if (tt < ts) return over + v * tt - 0.5 * dec * tt * tt;
    return over + v * ts - 0.5 * dec * ts * ts + v * 0.2 * (tt - ts);
  }
  function rankAt(m, t, xs) {
    const ids = [0, 1, 2, 3, 4, 5, 6, 7];
    const done = m.res.order.filter((i) => t >= m.cross[i] - 1e-6);
    const rest = ids.filter((i) => done.indexOf(i) < 0).sort((a, b) => xs[b] - xs[a]);
    return done.concat(rest);
  }
  function lengthsStr(m) {
    if (m < 0.08) return ''; if (m < 0.15) return 'sh'; if (m < 0.25) return 'hd'; if (m < 0.4) return 'nk';
    const q = Math.round(m * 4) / 4, w = Math.floor(q), f = q - w;
    return (w ? w : '') + (f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '');
  }
  /* the race-reader: a commentary written from the flight paths, timed in seconds from the off */
  function commentary(m) {
    const rr = mulberry(((m.res.seed >>> 0) ^ 0x9e3779b9) >>> 0);
    const pick = (a) => a[Math.floor(rr() * a.length)];
    const R = m.card.runners, nm = (i) => R[i].name, o = m.res.order;
    const ev = [{ t: 0, text: pick(['And they’re off!', 'They’re off and racing!', 'The stalls crash open and they’re away!']), k: 'off' }];
    let lead = -1, leadT = 0, lastLeadCall = -9, lastMover = -9, calledLead = -1;
    const marks = []; for (let f = m.card.dist - 1; f >= 2; f--) marks.push(f);
    let mi = 0, fin1 = false, hist = [];
    for (let t = 0.2; t <= m.T + 0.001; t += 0.2) {
      const xs = []; for (let i = 0; i < 8; i++) xs.push(rawX(m, i, t));
      const ord = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => xs[b] - xs[a]);
      hist.push(ord);
      if (Math.abs(t - 1.6) < 0.1) ev.push({ t, text: pick([nm(ord[0]) + ' breaks smartly and shows early pace.', nm(ord[0]) + ' is quickest away.', 'Early leader is ' + nm(ord[0]) + ', ' + nm(ord[1]) + ' tracking.']) });
      if (ord[0] !== lead) { lead = ord[0]; leadT = t; }
      else if (t - leadT >= 0.8 && t - lastLeadCall > 2.2 && t > 2.6 && t < m.T - 1.6 && calledLead >= 0 && lead !== calledLead) {
        ev.push({ t, text: pick(['Now ' + nm(lead) + ' takes it up!', nm(lead) + ' hits the front!', nm(lead) + ' goes on!', 'It’s ' + nm(lead) + ' who leads now!']) }); lastLeadCall = t; calledLead = lead;
      }
      if (calledLead < 0 && t > 2.6) calledLead = lead;
      if (mi < marks.length && xs[ord[0]] >= m.Dm - marks[mi] * FURLONG) {
        const f = marks[mi]; mi++;
        ev.push({ t, text: (f === 2 ? 'Two out' : f + ' furlongs to run') + ': ' + nm(ord[0]) + ' leads from ' + nm(ord[1]) + ' and ' + nm(ord[2]) + '.' });
      }
      if (hist.length > 12 && t - lastMover > 3 && t > 4 && t < m.T - 1) {
        const then = hist[hist.length - 13];
        for (let i = 0; i < 8; i++) { const gain = then.indexOf(i) - ord.indexOf(i); if (gain >= 3 && ord.indexOf(i) <= 3) { ev.push({ t, text: pick(['Here comes ' + nm(i) + ' down the outside!', nm(i) + ' is flying!', nm(i) + ' finds another gear!', 'Look at ' + nm(i) + ' come through!']) }); lastMover = t; break; } }
      }
      if (!fin1 && xs[ord[0]] >= m.Dm - FURLONG) {
        fin1 = true; const gap = xs[ord[0]] - xs[ord[1]];
        ev.push({ t, text: gap < 2.4 ? 'Into the final furlong and ' + nm(ord[0]) + ' and ' + nm(ord[1]) + ' are locked together!' : 'Into the final furlong, and ' + nm(ord[0]) + ' is in command!' });
      }
    }
    const mg = m.res.margins[0];
    if (m.res.photo) {
      ev.push({ t: m.T - 0.7, text: nm(o[0]) + ' and ' + nm(o[1]) + ', nothing between them…' });
      ev.push({ t: m.T, text: 'They hit the line together. Photograph!', k: 'line' });
    } else {
      const ms = M.marginStr(mg);
      ev.push({ t: m.T, text: mg >= 300 ? nm(o[0]) + ' romps home by ' + ms + '!' : mg >= 75 ? nm(o[0]) + ' wins it by ' + ms + '!' : nm(o[0]) + ' just holds on, by ' + ms + '!', k: 'line' });
      ev.push({ t: m.T + 1.3, text: nm(o[1]) + ' runs on for second, ' + nm(o[2]) + ' third.' });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  /* ============================== rules ============================== */
  function rules() {
    const live = B.online;
    return '<h3>A night at the races</h3><p>Eight racing bats, each ridden by a jockey in its owner’s silks, fly a straight course of 5, 6 or 7 furlongs under the moon. Back them before the off, then watch the race.</p>' +
      (live ? '<h3>The live course</h3><p>Every player watches the same race at the same time. A new race card opens every minute or so and betting stays open for about a minute: the timer shows how long is left. When it closes the runners go behind the stalls, the bell rings and they are off. The result is drawn by the server when the race is made and only leaves it once betting has closed. Your bets are paid when the result is official, even if you have left the course. You can take back any bet until betting closes.</p>'
        : '<h3>Practice</h3><p>One race at a time: put your bets on the slip and press <b>Place &amp; race</b> (or <b>Watch race</b> with no bets). Tap the course to skip to the finish. Online, races run on a live schedule shared by everyone.</p>') +
      '<h3>The bets</h3><table><tr><th>Bet</th><th>Wins when</th><th>Pays</th></tr>' +
      '<tr><td>Win</td><td>your bat wins</td><td>the price on the card, e.g. 9/2 pays 9 for every 2 staked, plus the stake</td></tr>' +
      '<tr><td>Each Way</td><td>two bets: win, and place (first three)</td><td>the each-way price for the win half, and ¼ of those odds for the place half. Costs twice the stake</td></tr>' +
      '<tr><td>Forecast</td><td>your two bats finish first and second in that order</td><td>the dividend on the card</td></tr>' +
      '<tr><td>Reverse Forecast</td><td>your two bats finish first and second in either order</td><td>two forecasts. Costs twice the stake</td></tr>' +
      '<tr><td>Tricast</td><td>your three bats finish first, second and third in that order</td><td>the dividend on the card</td></tr></table>' +
      '<p>Each bet’s stake is one of 20, 40, 100, 200, 400, 1,000, 2,000, 5,000 or 10,000 BB, and you can strike up to 40 bets on one race. Forecast and tricast dividends are shown as a multiple of the stake (stake included) as soon as you pick the runners.</p>' +
      '<h3>Form and prices</h3><p>The stable has 48 bats. Each has a rating that rises and falls with its results, and its last runs show as its form (1 = won, 8 = last). Prices come from the ratings plus a little luck on the night; the runners in one race sit out the next. Every price on the card is a fair chance of that result, less the house’s 4%.</p>' +
      '<h3>Controls</h3><p>Pick a bet type, then tap a price (Win, Each Way) or tap runners for 1st, 2nd and 3rd (Forecast, Tricast). Pick a chip for the stake first. Keys: <b>1</b>–<b>9</b> chips, <b>U</b> undo, <b>C</b> clear, <b>R</b> rebet (the same bets on the runners in the same places in the betting), <b>Space</b> ' + (live ? 'place your bets' : 'place and race') + '.</p>' +
      '<h3>Return</h3><p>Every price is set so that each bet type returns <b>96.0%</b> of stakes in the long run: Win, Each Way, Forecast, Reverse Forecast and Tricast alike. A simulation of 1,000,000 races, settling every possible bet of every type on each, measured Win 96.01%, Each Way 95.99%, Forecast 95.90%, Reverse Forecast 95.90% and Tricast 95.86% (each within its margin of error of 96%). Hit rates: Win 12.5%, Each Way (anything back) 37.5%, Forecast 1.8%, Reverse Forecast 3.6%, Tricast 0.3%. Whole-BB rounding costs a touch more on the smallest stakes. No bet can return more than 10,000× its stake (the dearest tricast is capped at 9,999.99×), so the most a single 10,000 BB bet can return is 99,999,900 BB.</p>' +
      '<p class="rtp">Return to player 96.0% for every bet type (1,000,000 simulated races: 95.86%–96.01%). Max win per bet 10,000× stake. Batty Bucks have no cash value.</p>';
  }

  /* ============================== memory and sound ============================== */
  let S = null, G = null;
  const mem = { chip: 3, type: 'win', last: null, sound: true };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) { if (raw.chip >= 0 && raw.chip < STAKES.length) mem.chip = raw.chip | 0; if (TYPES.indexOf(raw.type) >= 0) mem.type = raw.type; if (Array.isArray(raw.last)) mem.last = raw.last.slice(0, 40); if (raw.prac && typeof raw.prac === 'object') mem.prac = raw.prac; } } catch (e) { /* memory only */ }
  const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* memory only */ } };

  const A = B.audio;
  const snd = {
    chip() { B.sfx('chip'); },
    click() { B.sfx('click'); },
    tick() { B.sfx('tick'); },
    /* the starting bell: a struck bell, rung hard several times */
    bell(n) { for (let k = 0; k < (n || 7); k++) { const t = k * 0.11; A.tone({ f: 1480, d: 0.5, type: 'sine', v: 0.09, t }); A.tone({ f: 1480 * 2.76, d: 0.25, type: 'sine', v: 0.035, t }); A.tone({ f: 1480 * 5.4, d: 0.12, type: 'sine', v: 0.02, t }); A.noise({ d: 0.03, v: 0.05, hp: 5000, t }); } },
    /* the bugler's call to the post */
    bugle() { const N = [392, 523.3, 659.3, 784, 659.3, 784, 784, 784, 659.3, 523.3, 659.3, [523.3, 3]]; A.seq(N, { step: 0.13, type: 'sawtooth', v: 0.045, d: 0.2 }); A.seq(N, { step: 0.13, type: 'triangle', v: 0.06, d: 0.22 }); },
    /* the crowd: filtered noise, louder as the race comes to the boil */
    crowd(level) { A.noise({ d: 0.7, v: 0.012 + 0.09 * level, lp: 700 + 900 * level }); A.noise({ d: 0.5, v: 0.006 + 0.03 * level, hp: 1800, t: 0.1 }); },
    roar() { A.noise({ d: 2.4, v: 0.16, lp: 1500, f2: 600 }); A.noise({ d: 1.6, v: 0.05, hp: 2200, f2: 900 }); },
    /* wings: soft leathery flutters, a flurry at the off */
    wings(n, v) { for (let k = 0; k < (n || 1); k++) A.noise({ d: 0.06, v: (v || 0.05) * (0.6 + Math.random() * 0.6), lp: 380 + Math.random() * 300, t: k * 0.045 + Math.random() * 0.02 }); },
    stalls() { A.noise({ d: 0.18, v: 0.22, lp: 900 }); A.tone({ f: 120, f2: 60, d: 0.2, type: 'square', v: 0.08 }); },
    shutter() { A.noise({ d: 0.04, v: 0.25, hp: 3000 }); A.tone({ f: 2400, d: 0.03, type: 'square', v: 0.05, t: 0.06 }); A.noise({ d: 0.05, v: 0.2, hp: 2600, t: 0.08 }); },
    open() { A.seq([523.3, 659.3, 784], { step: 0.09, type: 'triangle', v: 0.08 }); },
    result() { A.seq([392, 523.3, 659.3, [784, 2]], { step: 0.12, type: 'triangle', v: 0.09 }); },
    win() { A.seq([523.3, 659.3, 784, 1046.5, 784, [1046.5, 3]], { step: 0.1, type: 'square', v: 0.08 }); snd.roar(); },
    lose() { A.tone({ f: 220, f2: 140, d: 0.4, type: 'triangle', v: 0.08 }); },
    place() { B.sfx('coin'); },
  };

  /* ============================== the game ============================== */
  function mount(root) {
    S = B.scope();
    const live = B.online;
    let devOn = false; try { devOn = !live && localStorage.getItem('batty-dev') === '1'; } catch (e) { /* off */ }
    const dev = devOn ? (window.__derbyDev = { winner: null, photo: false, order: null, races: 0, staked: 0, won: 0, last: null }) : null;
    const g = { dead: false, mode: '', tab: 'card', type: mem.type, build: [], pending: [], busy: false, sending: false, paying: false, payFor: 0, lastKey: '', tickN: 0, crowdT: 0, wingT: 0, lastLine: '', sessionStaked: 0, sessionWon: 0 };
    G = g;
    const L = { st: null, off: null, best: 1e9, age: 0, polling: false, cards: {}, results: [], latest: 0, settledQ: [], paid: {}, form: null, formAt: 0 };
    const P = { roster: null, prev: [], results: [], no: 0, race: null, card: null, show: null };
    const V = { s: 1, w: 800, cam: 0 };
    const nowS = () => Date.now() / 1000 + (live ? (L.off || 0) : 0);
    const T = (ms) => (reduce ? Math.min(ms, 160) : ms);

    /* ---------- DOM ---------- */
    root.innerHTML = DEFS;
    const el = {};
    const main = h('div', { class: 'dy-main' });
    const side = h('div', { class: 'dy-side' });
    /* the course */
    el.view = h('div', { class: 'dy-view', 'aria-label': 'The racecourse' });
    el.world = h('div', { class: 'dy-world' });
    el.sky = h('div', { class: 'dy-sky', html: skySvg() });
    el.moon = h('div', { class: 'dy-moon', html: MOON });
    el.clouds = h('div', { class: 'dy-clouds' }, h('i'), h('i'), h('i'));
    el.tiles = {};
    for (const k in TILE) { const t = TILE[k]; el.tiles[k] = h('div', { class: 'dy-tile dy-t-' + k, style: 'top:' + t.top + 'px;height:' + t.hgt + 'px;background-image:' + svgUrl(t.svg) + ';background-size:' + t.w + 'px ' + t.hgt + 'px' }); }
    el.l88 = h('div', { class: 'dy-layer dy-l88' });
    el.stand = h('div', { class: 'dy-stand', html: standSvg() });
    el.l88.append(el.stand);
    el.course = h('div', { class: 'dy-layer dy-course' });
    el.stalls = h('div', { class: 'dy-stalls', html: stallsSvg() });
    el.post = h('div', { class: 'dy-post', html: '<svg viewBox="0 0 80 360" aria-hidden="true"><rect x="36" y="20" width="8" height="320" fill="#f4f1ea"/><rect x="36" y="20" width="3" height="320" fill="#fff"/><circle cx="40" cy="26" r="20" fill="#fff" stroke="#d0102b" stroke-width="8"/><circle cx="40" cy="26" r="5" fill="#d0102b"/><rect x="2" y="70" width="22" height="30" rx="3" fill="#2a2236"/><circle cx="13" cy="85" r="7" fill="#0b0b10" stroke="#e2bd62" stroke-width="2"/><circle cx="13" cy="85" r="2.5" fill="#6ab7ff"/></svg>' });
    el.poles = h('div', { class: 'dy-poles' });
    el.fline = h('div', { class: 'dy-fline', html: '<svg viewBox="-40 280 230 150" aria-hidden="true"><path d="M' + skw(-1) + ' ' + laneGround(-1) + 'L' + skw(8.4) + ' ' + laneGround(8.4) + '" stroke="#fff" stroke-width="3" opacity=".7"/></svg>' });
    el.startB = h('div', { class: 'dy-startb' }, 'START');
    el.course.append(el.poles, el.fline, el.startB, el.stalls, el.post);
    el.shadows = h('div', { class: 'dy-layer dy-shadows' });
    el.bats = h('div', { class: 'dy-layer dy-batsl' });
    el.world.append(el.sky, el.moon, el.clouds, el.tiles.far, el.tiles.mid, el.l88, el.tiles.frail, el.tiles.turf, el.course, el.shadows, el.bats, el.tiles.rail, el.tiles.fore);
    /* overlays */
    el.hud = h('div', { class: 'dy-hud' }, el.hname = h('div', { class: 'dy-hname' }), el.phase = h('div', { class: 'dy-phase' }));
    el.timer = h('div', { class: 'dy-timer', hidden: true, html: '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="t"/><circle cx="22" cy="22" r="19" class="v"/></svg><b></b><small>Bets</small>' });
    el.map = h('div', { class: 'dy-map', 'aria-hidden': 'true' }, h('i', { class: 'ln' }));
    el.mapDots = [];
    el.lb = h('div', { class: 'dy-lb', 'aria-hidden': 'true' });
    el.lbRows = [];
    el.offs = h('div', { class: 'dy-offs', 'aria-hidden': 'true' });
    el.call = h('div', { class: 'dy-call', 'aria-hidden': 'true' });
    el.photo = h('div', { class: 'dy-photo', 'aria-hidden': 'true' });
    el.result = h('div', { class: 'dy-result' });
    el.cut = h('i', { class: 'dy-cut' });
    el.spot = h('i', { class: 'dy-spot' });
    el.flash = h('i', { class: 'dy-flash' });
    el.view.append(el.world, el.spot, el.cut, el.flash, el.map, el.lb, el.offs, el.hud, el.timer, el.photo, el.result, el.call);
    el.tick = h('div', { class: 'dy-tick', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'mic', html: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' }), el.tickT = h('span', { class: 'tx' }));
    el.lower = h('div', { class: 'dy-lower' });
    main.append(el.view, el.tick, el.lower);
    /* the side: tabs, the race card, the slip, results, players, and the betting bar */
    const tabBtn = (k, label) => h('button', { type: 'button', class: 'dy-tabb', 'data-k': k, role: 'tab', onclick: () => { g.tab = k; snd.click(); paintTabs(); if (k === 'res') loadHistory(); } }, h('span', null, label), h('em'));
    el.tabs = h('div', { class: 'dy-tabs', role: 'tablist' }, tabBtn('card', 'Race card'), tabBtn('slip', 'Bet slip'), tabBtn('res', 'Results'), tabBtn('rail', 'Players'));
    el.panels = h('div', { class: 'dy-panels' });
    el.card = h('section', { class: 'dy-pan dy-card', 'aria-label': 'Race card' });
    el.cardHead = h('div', { class: 'dy-chead' });
    el.types = h('div', { class: 'dy-types', role: 'radiogroup', 'aria-label': 'Bet type' });
    TYPES.forEach((t) => el.types.append(h('button', { type: 'button', class: 'dy-type', 'data-t': t, role: 'radio', onclick: () => setType(t) }, TTAB[t])));
    el.terms = h('div', { class: 'dy-terms' });
    el.list = h('div', { class: 'dy-list' });
    el.builder = h('div', { class: 'dy-builder', hidden: true });
    el.card.append(el.cardHead, el.types, el.terms, el.list, el.builder);
    el.slip = h('section', { class: 'dy-pan dy-slip', 'aria-label': 'Bet slip' });
    el.res = h('section', { class: 'dy-pan dy-res', 'aria-label': 'Results' });
    el.rail = h('section', { class: 'dy-pan dy-rail', 'aria-label': 'Other players' });
    el.panels.append(el.card, el.slip, el.res, el.rail);
    /* the bar: chips, actions, totals, place */
    el.chips = h('div', { class: 'dy-chips', role: 'radiogroup', 'aria-label': 'Stake per bet' });
    STAKES.forEach((v, i) => el.chips.append(h('button', { type: 'button', class: 'dy-chip c' + i, role: 'radio', 'aria-label': fmt(v) + ' BB stake', onclick: () => { mem.chip = i; saveMem(); snd.chip(); paintChips(); } }, h('b', null, chipLabel(v)))));
    const ICON = {
      undo: '<svg viewBox="0 0 24 24"><path d="M9 4L4 9l5 5M4 9h11a5 5 0 0 1 0 10h-3" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      clear: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
      rebet: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
    const actBtn = (label, icon, fn) => h('button', { type: 'button', class: 'dy-act', 'aria-label': label, title: label, onclick: fn }, h('span', { class: 'ic', html: icon }), h('span', { class: 'lb' }, label));
    el.undoB = actBtn('Undo', ICON.undo, () => undo());
    el.clearB = actBtn('Clear', ICON.clear, () => clearAll());
    el.rebetB = actBtn('Rebet', ICON.rebet, () => rebet());
    el.total = h('div', { class: 'dy-total' }, h('small', null, 'Slip'), h('b', null, '0'));
    el.placeB = h('button', { type: 'button', class: 'dy-place', onclick: () => placeBets() }, h('b', null, 'Place bets'), h('small', null, ''));
    el.bar = h('div', { class: 'dy-bar' }, h('div', { class: 'dy-chiprow' }, el.chips), h('div', { class: 'dy-actrow' }, el.undoB, el.clearB, el.rebetB, el.total, el.placeB));
    side.append(el.tabs, el.panels, el.bar);
    root.append(main, side);
    if (live) root.classList.add('dy-live');
    if (reduce) root.classList.add('dy-reduce');

    /* bats on the course: one per runner, rebuilt per race card */
    let batEls = [], batFor = 0, wingPh = [0, 0, 0, 0, 0, 0, 0, 0];
    function buildBats(card) {
      if (batFor === card.id) return; batFor = card.id;
      el.bats.textContent = ''; el.shadows.textContent = ''; batEls = [];
      card.runners.forEach((r, i) => {
        const d = h('div', { class: 'dy-bat', style: 'z-index:' + (10 + i), html: batSvg(r, i) });
        const sh = h('i', { class: 'dy-shad' });
        el.bats.append(d); el.shadows.append(sh);
        const svg = d.firstChild;
        batEls.push({ d, sh, wn: svg.querySelector('.wn'), wf: svg.querySelector('.wf'), f: 5.4 + ((r.id * 37) % 23) / 10, amp: 0.82 + ((r.id * 13) % 7) / 40, lag: 0.25 + ((r.id * 7) % 5) / 14 });
      });
      el.mapDots.forEach((x) => x.remove()); el.mapDots = [];
      el.lb.textContent = ''; el.lbRows = [];
      card.runners.forEach((r, i) => {
        const dot = h('i', { class: 'dt', style: '--c:' + CLOTH[i][0] + ';--t:' + CLOTH[i][1] }, String(i + 1)); el.map.append(dot); el.mapDots.push(dot);
        const row = h('div', { class: 'r' }, h('span', { class: 'p' }), h('span', { html: clothHtml(i) }), h('span', { class: 'n' }, r.name), h('span', { class: 'g' }));
        el.lb.append(row); el.lbRows.push(row);
      });
      el.offs.textContent = '';
      el.offEls = card.runners.map((r, i) => { const o = h('div', { class: 'o', html: clothHtml(i) + '<em></em>' }); el.offs.append(o); return o; });
    }
    function buildCourse(card) {
      if (el.course.dataset.dist === String(card.dist)) return;
      el.course.dataset.dist = String(card.dist);
      const Dm = card.dist * FURLONG;
      el.poles.textContent = '';
      for (let f = card.dist - 1; f >= 1; f--) {
        const x = (Dm - f * FURLONG) * PXM;
        el.poles.append(h('div', { class: 'dy-pole', style: 'left:' + x.toFixed(0) + 'px' }, h('b', null, f + 'f')));
      }
      el.post.style.left = (Dm * PXM + skw(7.6) - 40) + 'px';
      el.fline.style.left = (Dm * PXM - 40) + 'px';
      el.stand.style.left = ((Dm - 75) * PXM * 0.88).toFixed(0) + 'px';
      el.map.querySelectorAll('.fm').forEach((x) => x.remove());
      for (let f = 1; f < card.dist; f++) el.map.append(h('i', { class: 'fm', style: 'left:' + (100 * f / card.dist).toFixed(2) + '%' }));
    }

    /* ---------- layout ---------- */
    function layout() {
      const W = root.clientWidth, H = root.clientHeight;
      if (!W || !H) return;
      const mode = W >= 900 && H >= 540 ? 'wide' : W > H * 1.2 ? 'short' : 'tall';
      if (mode !== g.mode) {
        g.mode = mode; root.dataset.mode = mode;
        if (mode === 'wide') { el.lower.append(el.res, el.rail); if (g.tab === 'res' || g.tab === 'rail') g.tab = 'card'; }
        else el.panels.append(el.res, el.rail);
        paintTabs();
      }
      if (mode === 'wide') {
        const sw = clamp(Math.round(W * 0.31), 360, 430);
        root.style.setProperty('--side', sw + 'px');
        el.view.style.height = clamp(Math.round((W - sw) * 0.5), 260, H - 236) + 'px';
      } else if (mode === 'tall') el.view.style.height = clamp(Math.round(W * 0.6), 170, Math.round(H * 0.34)) + 'px';
      else el.view.style.height = '';
      sizeView();
    }
    function sizeView() {
      const vw = el.view.clientWidth, vh = el.view.clientHeight;
      if (!vw || !vh) return;
      V.s = vh / VH; V.w = vw / V.s;
      el.world.style.width = V.w.toFixed(1) + 'px';
      el.world.style.transform = 'scale(' + V.s.toFixed(4) + ')';
      root.style.setProperty('--vu', clamp(V.s, 0.5, 1.25).toFixed(3));
      el.view.classList.toggle('narrow', vw < 520);
      for (const k in TILE) el.tiles[k].style.width = (V.w + TILE[k].w * 2).toFixed(0) + 'px';
    }
    const ro = new ResizeObserver(() => layout()); ro.observe(root); S.on(window, 'resize', layout);

    /* ---------- the race card ---------- */
    let cardFor = 0;
    function bettingCard() {
      if (!live) return P.show ? P.show.card : P.card;
      const r = L.st && L.st.races.find((x) => nowS() < x.closeAt);
      return r ? L.cards[r.id] || null : null;
    }
    function bettingRace() { return live ? (L.st && L.st.races.find((x) => nowS() < x.closeAt)) || null : null; }
    function canBet() {
      if (g.dead) return false;
      if (!live) return !P.show && !!P.card;
      const r = bettingRace(); if (!r || !L.cards[r.id]) return false;
      return nowS() < r.closeAt - 0.6;
    }
    function favRank(card) {
      const idx = card.runners.map((r, i) => i).sort((a, b) => card.runners[a].oi - card.runners[b].oi || a - b);
      const rank = []; idx.forEach((i, k) => { rank[i] = k; });
      return { idx, rank };
    }
    function paintCard(force) {
      const card = bettingCard();
      if (!card) {
        if (cardFor !== -1 || force) { cardFor = -1; el.cardHead.innerHTML = '<div class="nm">The next race card is on its way…</div>'; el.list.innerHTML = '<p class="dy-empty">Betting reopens in a moment.</p>'; el.builder.hidden = true; }
        paintTypes(); return;
      }
      if (card.id !== cardFor || force) {
        cardFor = card.id; g.build = [];
        g.pending = g.pending.filter((b) => b.race === card.id);
        const fav = favRank(card), favOi = card.runners[fav.idx[0]].oi, jf = card.runners.filter((r) => r.oi === favOi).length > 1;
        el.cardHead.innerHTML = '<div class="nm"><small>Race ' + (live ? card.id : card.id) + '</small>' + esc(card.name) + '</div><div class="meta"><span>' + card.dist + 'f</span><span>' + esc(card.going) + '</span><span>Class ' + card.cls + '</span></div>';
        el.list.textContent = '';
        card.runners.forEach((r, i) => {
          const row = h('div', { class: 'dy-run', 'data-i': i },
            h('span', { class: 'ci', html: clothHtml(i) + silksSvg(r.silks) }),
            h('button', { type: 'button', class: 'nm', 'aria-label': 'Form for ' + r.name, onclick: () => showForm(r, i, card) }, h('b', null, r.name, r.oi === favOi ? h('em', { class: 'fav' }, jf ? 'JF' : 'F') : null), h('small', null, r.jockey + ' · form ', h('span', { class: 'fm' }, r.form || '–'), ' · RTG ' + r.rating)),
            h('span', { class: 'bk' }),
            h('span', { class: 'op' }));
          el.list.append(row);
        });
        paintTypes(); paintOps();
      }
      paintMarks();
    }
    function paintTypes() {
      [...el.types.children].forEach((b) => { const on = b.dataset.t === g.type; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      const terms = { win: 'Back one bat to win. Tap a price.', ew: 'Each way: win, plus ¼ odds for 1st, 2nd or 3rd. Costs 2 × stake.', fc: 'Pick 1st and 2nd in order.', rfc: 'Pick two bats to finish 1st and 2nd in either order. Costs 2 × stake.', tc: 'Pick 1st, 2nd and 3rd in order.' };
      el.terms.textContent = terms[g.type];
    }
    function setType(t) {
      if (g.type === t) return;
      g.type = t; mem.type = t; saveMem(); g.build = []; snd.click();
      paintTypes(); paintOps(); paintBuilder();
    }
    function paintOps() {
      const card = bettingCard(); if (!card || card.id !== cardFor) return;
      const n = M.TYPES[g.type].n;
      [...el.list.children].forEach((row) => {
        const i = +row.dataset.i, r = card.runners[i], op = row.querySelector('.op');
        op.textContent = '';
        if (g.type === 'win' || g.type === 'ew') {
          const f = g.type === 'win' ? r.odds : r.ew;
          op.append(h('button', { type: 'button', class: 'odds', 'aria-label': (g.type === 'win' ? 'Win: ' : 'Each way: ') + r.name + ' at ' + fr(f), onclick: (e) => tapOdds(i, e.currentTarget) }, h('b', null, fr(f)), g.type === 'ew' ? h('small', null, 'e/w') : null));
        } else if (g.type === 'rfc') {
          op.append(h('button', { type: 'button', class: 'pos any', 'data-k': 'a', 'aria-label': 'Pick ' + r.name, onclick: () => tapPos(i, -1) }, 'Pick'));
        } else {
          for (let k = 0; k < n; k++) op.append(h('button', { type: 'button', class: 'pos', 'data-k': k, 'aria-label': (k + 1) + (k === 0 ? 'st' : k === 1 ? 'nd' : 'rd') + ': ' + r.name, onclick: () => tapPos(i, k) }, ['1st', '2nd', '3rd'][k]));
        }
      });
      paintMarks(); paintBuilder();
    }
    /* which runners carry your bets (slip and placed), the current build, and other players' money */
    function paintMarks() {
      const card = bettingCard(); if (!card || card.id !== cardFor) return;
      const mineB = myBetsOn(card.id), cnt = new Array(8).fill(0), others = new Array(8).fill(0);
      for (const b of g.pending.concat(mineB)) for (const s of b.sel) cnt[s]++;
      if (live && L.st) for (const o of L.st.others) if (o.race === card.id) for (const s of o.sel) others[s]++;
      [...el.list.children].forEach((row) => {
        const i = +row.dataset.i;
        row.querySelector('.bk').innerHTML = (cnt[i] ? '<i class="me" title="Your bets">' + cnt[i] + '</i>' : '') + (others[i] ? '<i class="ot" title="Other players’ bets">' + B.batSvg() + others[i] + '</i>' : '');
        const odds = row.querySelector('.odds');
        if (odds) odds.classList.toggle('on', !!g.pending.find((b) => b.t === g.type && b.sel[0] === i));
        row.querySelectorAll('.pos').forEach((b) => { const k = b.dataset.k === 'a' ? -1 : +b.dataset.k; b.classList.toggle('on', k < 0 ? g.build.indexOf(i) >= 0 : g.build[k] === i); });
        row.classList.toggle('picked', g.build.indexOf(i) >= 0);
      });
      el.tabs.querySelector('[data-k="slip"] em').textContent = (g.pending.length + mineB.length) ? String(g.pending.length + mineB.length) : '';
    }
    function tapOdds(i, btn) {
      if (!canBet()) { notOpen(); return; }
      const card = bettingCard();
      const k = g.pending.findIndex((b) => b.t === g.type && b.sel[0] === i);
      const stake = STAKES[mem.chip];
      if (k >= 0) {
        if (g.pending[k].stake === stake) { g.pending.splice(k, 1); snd.click(); }
        else { g.pending[k].stake = stake; snd.chip(); }
      } else {
        if (!roomFor(1)) return;
        g.pending.push({ race: card.id, t: g.type, sel: [i], stake }); snd.chip(); flyChip(btn);
      }
      paintAll();
    }
    function tapPos(i, k) {
      if (!canBet()) { notOpen(); return; }
      const n = M.TYPES[g.type].n;
      if (k < 0) { const j = g.build.indexOf(i); if (j >= 0) g.build.splice(j, 1); else { if (g.build.length >= 2) g.build.shift(); g.build.push(i); } }
      else {
        const j = g.build.indexOf(i);
        if (g.build[k] === i) g.build[k] = undefined;
        else { if (j >= 0) g.build[j] = undefined; g.build[k] = i; }
        g.build.length = n;
      }
      snd.click(); paintMarks(); paintBuilder();
    }
    function buildBet() {
      const card = bettingCard(); if (!card) return null;
      const n = M.TYPES[g.type].n, sel = g.build.filter((x) => x != null);
      if (g.type === 'win' || g.type === 'ew' || sel.length !== n || (g.type !== 'rfc' && g.build.slice(0, n).some((x) => x == null))) return null;
      return { race: card.id, t: g.type, sel: g.type === 'rfc' ? sel : g.build.slice(0, n), stake: STAKES[mem.chip] };
    }
    function paintBuilder() {
      const card = bettingCard();
      if (!card || g.type === 'win' || g.type === 'ew') { el.builder.hidden = true; return; }
      el.builder.hidden = false;
      const n = M.TYPES[g.type].n, b = buildBet();
      const slots = [];
      for (let k = 0; k < n; k++) { const i = g.type === 'rfc' ? g.build[k] : g.build[k]; slots.push(i != null ? clothHtml(i) : '<span class="dy-cl empty">' + (g.type === 'rfc' ? '?' : (k + 1)) + '</span>'); }
      let pays = '';
      if (b) { const x = M.bestReturn({ t: b.t, sel: b.sel, stake: 100 }, card) / 100; pays = '<span class="px">' + (g.type === 'rfc' ? 'pays up to ' : 'pays ') + '<b>' + x.toFixed(2) + '×</b>' + (g.type === 'rfc' ? ' each way round' : '') + '</span>'; }
      el.builder.innerHTML = '<span class="sl">' + slots.join(g.type === 'rfc' ? '<i>&amp;</i>' : '<i>→</i>') + '</span>' + (pays || '<span class="px dim">' + (g.type === 'rfc' ? 'Pick two runners' : 'Tap 1st, 2nd' + (n === 3 ? ' and 3rd' : '')) + '</span>');
      const add = h('button', { type: 'button', class: 'add', disabled: !b, onclick: () => addBuilt() }, 'Add ' + fmt(STAKES[mem.chip] * (g.type === 'rfc' ? 2 : 1)));
      el.builder.append(add);
    }
    function addBuilt() {
      if (!canBet()) { notOpen(); return; }
      const b = buildBet(); if (!b) return;
      if (!roomFor(1)) return;
      g.pending.push(b); g.build = []; snd.chip(); flyChip(el.builder.querySelector('.add'));
      paintAll();
    }
    function roomFor(n) {
      const card = bettingCard(); if (!card) return false;
      if (g.pending.length + myBetsOn(card.id).length + n > 40) { B.ui.toast('That is the limit of 40 bets on one race.'); return false; }
      return true;
    }
    function notOpen() { B.ui.toast(live ? 'Betting has closed on this race. The next card opens in a moment.' : 'Wait for this race to finish.'); }
    function flyChip(from) {
      if (reduce || !from) return;
      const target = g.mode === 'wide' ? el.slip : el.tabs.querySelector('[data-k="slip"]');
      const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
      const c = h('i', { class: 'dy-fly c' + mem.chip, style: 'left:' + (a.left + a.width / 2 - 12) + 'px;top:' + (a.top + a.height / 2 - 12) + 'px' });
      root.append(c);
      const dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + Math.min(40, b.height / 2) - a.top - a.height / 2;
      c.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 50) + 'px) scale(1.1)', opacity: 1, offset: 0.5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.4,0,.6,1)' }).finished.then(() => c.remove(), () => c.remove());
    }

    /* ---------- the slip ---------- */
    function myBetsOn(raceId) {
      if (!live) return [];
      return (L.st ? L.st.mine : []).filter((b) => b.race === raceId);
    }
    function cardOf(raceId) { return live ? L.cards[raceId] : P.card && P.card.id === raceId ? P.card : P.show && P.show.id === raceId ? P.show.card : null; }
    function betRow(b, card, kind, onX) {
      const cost = M.costOf(b), best = card ? M.bestReturn(b, card) : 0;
      const sel = b.t === 'win' || b.t === 'ew' ? clothHtml(b.sel[0]) + '<span class="bn">' + esc(card ? card.runners[b.sel[0]].name : '') + '</span>' : b.sel.map((i) => clothHtml(i)).join(b.t === 'rfc' ? '<i>&amp;</i>' : '<i>→</i>');
      let tail = '';
      if (kind === 'won') tail = '<span class="rt up">+' + fmt(b.win) + '</span>';
      else if (kind === 'lost') tail = '<span class="rt">–</span>';
      else tail = '<span class="rt"><small>' + (b.t === 'rfc' || b.t === 'ew' ? 'up to' : 'returns') + '</small>' + fmt(best) + '</span>';
      const row = h('div', { class: 'dy-bet ' + kind, html: '<span class="ty">' + TSHORT[b.t] + '</span><span class="sel">' + sel + '</span><span class="st">' + (cost !== b.stake ? '2×' + abbr(b.stake) : abbr(b.stake)) + '</span>' + tail });
      if (onX) row.append(h('button', { type: 'button', class: 'x', 'aria-label': 'Remove this bet', onclick: onX, html: ICON.clear }));
      return row;
    }
    let slipKey = '';
    function paintSlip(force) {
      const card = bettingCard(), show = currentShow();
      const placed = card ? myBetsOn(card.id) : [];
      const riding = show && (!live || show.id !== (card && card.id)) ? ridingBets(show) : [];
      const key = JSON.stringify([card && card.id, g.pending, placed.map((b) => [b.id, b.win]), riding.map((b) => [b.id || 0, b.win]), show && show.id, canBet()]);
      if (!force && key === slipKey) return; slipKey = key;
      el.slip.textContent = '';
      el.slip.append(h('h4', null, 'Bet slip', h('span', null, card ? 'Race ' + card.id + ' · ' + card.name : '')));
      const open = canBet();
      if (!g.pending.length && !placed.length) el.slip.append(h('p', { class: 'dy-empty' }, card ? 'Pick a bet type, choose a chip and tap a price on the race card.' : 'Betting opens with the next race card.'));
      if (g.pending.length) {
        el.slip.append(h('div', { class: 'dy-sh' }, 'On your slip · not placed yet'));
        g.pending.forEach((b, k) => el.slip.append(betRow(b, card, 'pending', () => { g.pending.splice(k, 1); snd.click(); paintAll(); })));
      }
      if (placed.length) {
        el.slip.append(h('div', { class: 'dy-sh ok' }, 'Placed · ' + fmt(placed.reduce((a, b) => a + b.cost, 0)) + ' BB'));
        placed.forEach((b) => el.slip.append(betRow(b, card, 'placed', open ? () => cancelBet(b.id) : null)));
      }
      if (riding.length && show) {
        const sc = show.card;
        el.slip.append(h('div', { class: 'dy-sh ride' }, 'Riding on race ' + show.id + ' · ' + (sc ? sc.name : '')));
        riding.forEach((b) => el.slip.append(betRow(b, sc, b.win > 0 ? 'won' : b.win === 0 ? 'lost' : 'placed', null)));
      }
    }
    function ridingBets(show) {
      if (!show) return [];
      if (!live) return show.bets || [];
      return myBetsOn(show.id);
    }
    function paintBar() {
      const open = canBet(), card = bettingCard();
      const pend = g.pending.reduce((a, b) => a + M.costOf(b), 0);
      const placed = card ? myBetsOn(card.id) : [];
      el.total.querySelector('b').textContent = abbr(pend);
      el.total.querySelector('small').textContent = placed.length ? 'Slip · ' + abbr(placed.reduce((a, b) => a + b.cost, 0)) + ' on' : 'Slip';
      el.undoB.disabled = !open || (!g.pending.length && !placed.length);
      el.clearB.disabled = !open || (!g.pending.length && !placed.length);
      el.rebetB.disabled = !open || !mem.last || !mem.last.length;
      el.chips.classList.toggle('off', !open);
      const pb = el.placeB, b = pb.querySelector('b'), s = pb.querySelector('small');
      if (live) {
        pb.disabled = !open || !g.pending.length || g.sending;
        b.textContent = g.sending ? 'Placing…' : g.pending.length ? 'Place ' + g.pending.length + ' bet' + (g.pending.length > 1 ? 's' : '') : placed.length ? 'Bets placed' : 'Place bets';
        s.textContent = g.pending.length ? fmt(pend) + ' BB' : '';
      } else {
        pb.disabled = !open || g.busy;
        b.textContent = g.pending.length ? 'Place & race' : 'Watch race';
        s.textContent = g.pending.length ? fmt(pend) + ' BB' : 'no bets';
      }
      pb.classList.toggle('go', !pb.disabled && g.pending.length > 0);
    }
    function paintChips() {
      [...el.chips.children].forEach((c, i) => { c.classList.toggle('on', i === mem.chip); c.setAttribute('aria-checked', i === mem.chip ? 'true' : 'false'); });
      paintBuilder();
    }
    function paintTabs() {
      root.dataset.tab = g.tab;
      el.tabs.querySelectorAll('.dy-tabb').forEach((b) => { const on = b.dataset.k === g.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    }
    function paintAll() { paintMarks(); paintSlip(); paintBar(); paintBuilder(); }

    /* ---------- actions ---------- */
    function undo() {
      if (!canBet()) return;
      if (g.pending.length) { g.pending.pop(); snd.click(); paintAll(); return; }
      const card = bettingCard(), placed = card ? myBetsOn(card.id) : [];
      if (placed.length) cancelBet(placed[placed.length - 1].id);
    }
    async function clearAll() {
      if (!canBet()) return;
      if (g.pending.length) { g.pending = []; g.build = []; snd.click(); paintAll(); paintOps(); return; }
      const card = bettingCard(), placed = card ? myBetsOn(card.id).slice() : [];
      for (const b of placed) { if (!canBet()) break; await cancelBet(b.id, true); }
      B.wallet.sync(); paintAll();
    }
    function rebet() {
      if (!canBet() || !mem.last || !mem.last.length) return;
      const card = bettingCard(), fav = favRank(card);
      let n = 0;
      for (const x of mem.last) {
        if (!roomFor(1)) break;
        const sel = x.r.map((k) => fav.idx[k]);
        if (sel.some((s) => s == null)) continue;
        g.pending.push({ race: card.id, t: x.t, sel, stake: x.stake }); n++;
      }
      if (n) { snd.chip(); B.ui.toast('Rebet: the same ' + (n > 1 ? n + ' bets' : 'bet') + ' on the runners in the same places in the betting.'); }
      paintAll();
    }
    function rememberSlip(card, bets) {
      if (!card || !bets.length) return;
      const fav = favRank(card);
      mem.last = bets.slice(0, 40).map((b) => ({ t: b.t, r: b.sel.map((i) => fav.rank[i]), stake: b.stake }));
      saveMem();
    }
    async function placeBets() {
      if (!live) { practiceRace(); return; }
      if (!canBet() || !g.pending.length || g.sending) return;
      const r = bettingRace(), card = L.cards[r.id];
      const bets = g.pending.filter((b) => b.race === r.id).slice(0, 20);
      if (!bets.length) return;
      const cost = bets.reduce((a, b) => a + M.costOf(b), 0);
      if (!B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      g.sending = true; paintBar();
      const res = await B.play(ID, 'bet', { race: r.id, bets: bets.map((b) => ({ t: b.t, sel: b.sel, stake: b.stake })) }, cost);
      g.sending = false; if (g.dead) return;
      if (res && res.race === r.id) {
        g.pending = g.pending.filter((b) => bets.indexOf(b) < 0);
        if (L.st) { L.st.mine = L.st.mine.filter((b) => b.race !== r.id).concat(res.mine); }
        g.sessionStaked += cost;
        rememberSlip(card, res.mine);
        snd.place(); B.fx.burst({ el: el.placeB, kind: 'coin', count: 12, power: 0.5 });
      }
      B.wallet.sync(); paintAll(); paintOps();
    }
    async function cancelBet(id, quiet) {
      if (!live || !canBet()) return;
      const r = bettingRace();
      const res = await B.play(ID, 'cancel', { race: r.id, id });
      if (g.dead) return;
      if (res && L.st) { L.st.mine = L.st.mine.filter((b) => b.race !== r.id).concat(res.mine); if (!quiet) snd.click(); }
      if (!quiet) B.wallet.sync();
      paintAll();
    }

    /* ---------- the form guide ---------- */
    async function showForm(r, i, card) {
      snd.click();
      let bat = null;
      if (live) {
        if (!L.form || Date.now() - L.formAt > 30000) { const res = await B.play(ID, 'form', {}); if (res && res.bats) { L.form = res.bats; L.formAt = Date.now(); } }
        bat = L.form && L.form.find((b) => b.id === r.id);
      } else bat = P.roster && P.roster.find((b) => b.id === r.id);
      const hist = (bat && bat.hist) || [];
      const box = h('div', { class: 'g-derby dy-formbox' });
      box.innerHTML = '<div class="hd">' + silksSvg(r.silks, 'big') + '<div><b>' + clothHtml(i) + ' ' + esc(r.name) + '</b><small>Ridden by ' + esc(r.jockey) + ' · rating ' + r.rating + (bat ? ' · ' + bat.runs + ' runs, ' + bat.wins + ' wins' : '') + '</small><small>Win ' + fr(r.odds) + ' · each way ' + fr(r.ew) + ' · form <b>' + esc(r.form || '–') + '</b></small></div></div>' +
        (hist.length ? '<table><tr><th>Race</th><th>Dist</th><th>Going</th><th>Price</th><th>Pos</th></tr>' + hist.map((x) => '<tr><td>' + esc(x.name) + '</td><td>' + x.dist + 'f</td><td>' + esc(x.going) + '</td><td>' + esc(x.odds) + '</td><td class="p' + x.pos + '">' + x.pos + '</td></tr>').join('') + '</table>' : '<p class="dy-empty">No runs on this course yet: the form figures are from its previous stable.</p>');
      B.ui.modal(r.name, box);
    }

    /* ---------- results, history and players ---------- */
    let resKey = '';
    function resultsList() { return live ? L.results : P.results; }
    function paintResults(force) {
      const list = resultsList();
      const key = list.map((x) => x.id).join(',') + '|' + (g.hist ? g.hist.length + ':' + (g.hist[0] && g.hist[0].id) : '');
      if (!force && key === resKey) return; resKey = key;
      let html = '<h4>Results <span>' + (list.length ? 'last ' + list.length + ' races' : '') + '</span></h4>';
      if (!list.length) html += '<p class="dy-empty">No races run yet tonight.</p>';
      for (const x of list.slice(0, 12)) {
        const top = x.top || [];
        html += '<div class="dy-rr"><div class="rh"><b>' + esc(x.name) + '</b><small>Race ' + x.id + ' · ' + x.dist + 'f · ' + esc(x.going) + (x.photo ? ' · photo' : '') + '</small></div><ol>' +
          top.slice(0, 3).map((t, k) => '<li>' + clothHtml(t.i) + silksSvg(t.silks, 'sm') + '<span class="n">' + esc(t.name) + '</span><span class="o">' + esc(t.odds) + '</span>' + (k < 2 && x.margins && x.margins[k] ? '<em>' + esc(x.margins[k]) + '</em>' : '') + '</li>').join('') +
          '</ol><div class="dv"><span>Forecast <b>' + (x.fc / 100).toFixed(2) + '×</b></span><span>Tricast <b>' + (x.tc / 100).toFixed(2) + '×</b></span></div></div>';
      }
      if (live && g.hist && g.hist.length) {
        html += '<h4 class="mb">Your recent bets</h4>';
        for (const b of g.hist.slice(0, 12)) html += '<div class="dy-hb' + (b.win > 0 ? ' up' : '') + '"><span class="ty">' + TSHORT[b.t] + '</span><span class="sel">' + b.sel.map((i) => clothHtml(i)).join('') + '</span><small>' + esc(b.raceName) + '</small><span class="st">' + abbr(b.cost) + '</span><b>' + (b.win > 0 ? '+' + fmt(b.win) : '–') + '</b></div>';
      }
      el.res.innerHTML = html;
    }
    let histAt = 0;
    async function loadHistory() {
      if (!live || Date.now() - histAt < 8000) return;
      histAt = Date.now();
      const r = await B.play(ID, 'history', {});
      if (r && !g.dead) { g.hist = r.bets || []; if (r.results && r.results.length) L.results = r.results.slice(0, 12); paintResults(true); }
    }
    let railKey = '';
    function paintRail(force) {
      const card = bettingCard(), show = currentShow();
      if (!live) {
        const key = 'p' + P.no + ':' + g.sessionStaked + ':' + g.sessionWon;
        if (!force && key === railKey) return; railKey = key;
        el.rail.innerHTML = '<h4>The rail <span>Practice course</span></h4><p class="dy-empty">Online, every player watches the same races, and their bets show here.</p><div class="dy-ps"><span><small>Races</small><b>' + P.no + '</b></span><span><small>Staked</small><b>' + fmt(g.sessionStaked) + '</b></span><span><small>Won</small><b>' + fmt(g.sessionWon) + '</b></span></div>';
        el.tabs.querySelector('[data-k="rail"] em').textContent = '';
        return;
      }
      const st = L.st; if (!st) return;
      const ids = [card && card.id, show && show.id];
      const key = JSON.stringify([st.online, st.others.map((o) => [o.id, o.win]), ids, (st.mine || []).length]);
      if (!force && key === railKey) return; railKey = key;
      const by = {};
      for (const o of st.others) { if (ids.indexOf(o.race) < 0) continue; const p = by[o.uid] || (by[o.uid] = { name: o.name, avatar: o.avatar, level: o.level, now: [], show: [], won: 0, done: false }); (card && o.race === card.id ? p.now : p.show).push(o); if (show && o.race === show.id && o.win >= 0) { p.done = true; p.won += o.win; } }
      const ps = Object.values(by);
      let html = '<h4>The rail <span>' + st.online + ' on course · ' + ps.length + ' betting</span></h4>';
      if (!ps.length) html += '<p class="dy-empty">Nobody else has a bet on yet. The bats fly whether or not anyone’s watching.</p>';
      for (const p of ps.slice(0, 16)) {
        const chips = (arr) => arr.slice(0, 6).map((o) => '<i class="bt">' + TSHORT[o.t] + ' ' + o.sel.map((s) => s + 1).join(o.t === 'rfc' ? '&amp;' : '-') + ' <b>' + abbr(o.stake) + '</b></i>').join('') + (arr.length > 6 ? '<i class="bt">+' + (arr.length - 6) + '</i>' : '');
        html += '<div class="dy-pl' + (p.won > 0 ? ' up' : '') + '">' + B.avatar(p.avatar, 30) + '<div class="pn"><b>' + esc(p.name) + '</b><small>Lv ' + p.level + '</small></div><div class="pb">' +
          (p.now.length ? chips(p.now) : '') + (p.show.length ? '<span class="rd">Race ' + show.id + ': ' + (p.done ? (p.won > 0 ? '<b class="w">+' + fmt(p.won) + '</b>' : 'no luck') : abbr(p.show.reduce((a, o) => a + o.cost, 0)) + ' riding') + '</span>' : '') + '</div></div>';
      }
      el.rail.innerHTML = html;
      el.tabs.querySelector('[data-k="rail"] em').textContent = ps.length ? String(ps.length) : '';
    }

    /* ============================== the director ==============================
       Turns the race clock into the show. A "show" is a race with its card, timing and (once betting has closed) result. */
    let curShow = null;
    function currentShow() { return curShow; }
    function liveShows(t) {
      const st = L.st; if (!st) return { show: null, bet: null };
      let show = null, bet = null;
      for (const r of st.races) {
        const card = L.cards[r.id]; if (!card) continue;
        if (t < r.closeAt) bet = { id: r.id, card, tm: r, res: null };
        else if (r.endAt == null || t < r.endAt) show = { id: r.id, card, tm: r, res: r.res || null };
      }
      return { show, bet };
    }
    function phaseOf(s, t) {
      const tm = s.tm;
      if (t < tm.closeAt) return 'bet';
      if (t < tm.offAt || !s.res || tm.finishAt == null) return 'gate';
      if (t < tm.finishAt) return 'run';
      if (t < tm.resultAt) return s.res.photo ? 'photo' : 'judge';
      if (t < tm.endAt) return 'result';
      return 'done';
    }
    const models = {};
    function modelFor(s) {
      if (!s.res) return null;
      const k = s.id + ':' + s.res.seed;
      return models[k] || (models[k] = buildModel(s.card, s.res));
    }

    function frame(dt) {
      if (g.dead) return;
      const t = nowS();
      let disp = null, ph = 'bet';
      if (live) {
        if (!L.st || L.off == null) return;
        const ls = liveShows(t);
        if (ls.show) { disp = ls.show; ph = phaseOf(disp, t); if (ph === 'done') disp = null; }
        if (!disp && ls.bet) { disp = ls.bet; ph = 'bet'; }
        curShow = ls.show && phaseOf(ls.show, t) !== 'done' ? ls.show : null;
      } else {
        if (P.show) { disp = P.show; ph = phaseOf(disp, t); if (ph === 'done') { practiceNext(); return; } }
        else if (P.card) { disp = { id: P.card.id, card: P.card, tm: { closeAt: Infinity }, res: null }; ph = 'bet'; }
        curShow = P.show;
      }
      if (!disp) { el.phase.textContent = 'Waiting for the next card'; return; }
      buildBats(disp.card); buildCourse(disp.card);
      const key = disp.id + ':' + ph;
      if (key !== g.lastKey) { const first = !g.lastKey; const was = g.lastKey; g.lastKey = key; onPhase(disp, ph, first, was); }
      const m = modelFor(disp);
      const rt = t - (disp.tm.offAt || 0);
      drawScene(disp, ph, t, rt, m, dt);
      paintHud(disp, ph, t, rt, m);
      const br = live ? bettingRace() : null;
      if (br) betClock({ id: br.id, tm: br }, t, disp.id === br.id); else el.timer.hidden = true;
      settleTick(disp, ph);
      if (canBet() !== g.couldBet) { g.couldBet = canBet(); root.classList.toggle('dy-locked', !g.couldBet); paintAll(); paintCard(); }
      if (live) { const bc = bettingCard(); if ((bc ? bc.id : -1) !== cardFor) { paintCard(); paintAll(); } }
      ambience(disp, ph, rt, m, dt);
    }

    /* the scene, from the clock: camera, bats, wings, shadows */
    function drawScene(s, ph, t, rt, m, dt) {
      const card = s.card, Dm = card.dist * FURLONG, W = V.w;
      const xs = [], ys = [], mode = [];
      let cam = 0, lead = 0;
      const wingAmp = reduce ? 0.35 : 1;
      if (ph === 'bet') {
        cam = Dm - 30;
        for (let i = 0; i < 8; i++) { xs.push(cam + ((i - 3.5) * W * 0.108) / PXM + (reduce ? 0 : 1.2 * Math.sin(0.55 * t + i * 1.7))); ys.push(laneBatY(i) - 18 + (reduce ? 0 : 7 * Math.sin(0.8 * t + i))); mode.push('glide'); }
      } else if (ph === 'gate' || !m) {
        cam = (0.12 * W) / PXM;
        for (let i = 0; i < 8; i++) { xs.push(0.8); ys.push(laneBatY(i)); mode.push('hang'); }
      } else if (ph === 'result') {
        cam = Dm - 30;
        const o = m.res.order;
        for (let i = 0; i < 8; i++) { const k = o.indexOf(i); if (k < 3) { const sp = [0, -1, 1][k]; xs.push(cam + ((-0.26 + sp * 0.14) * W) / PXM + (reduce ? 0 : 0.6 * Math.sin(1.1 * t + k))); ys.push(laneBatY(k === 0 ? 7 : k === 1 ? 2 : 4) - (k === 0 ? 70 : 34) + (reduce ? 0 : 6 * Math.sin(1.6 * t + k))); mode.push(k === 0 ? 'hero' : 'glide'); } else { xs.push(-9999); ys.push(0); mode.push('off'); } }
      } else {
        for (let i = 0; i < 8; i++) { xs.push(xAt(m, i, Math.max(0, rt))); ys.push(laneBatY(i)); mode.push('fly'); }
        /* a soft maximum of the leaders keeps the camera smooth through every change of lead */
        let mx = -1e9; for (const x of xs) if (x > mx) mx = x;
        let sum = 0; for (const x of xs) sum += Math.exp((x - mx) / 4);
        lead = mx + 4 * Math.log(sum);
        cam = Math.min(lead - (0.12 * W) / PXM, Dm - (0.1 * W) / PXM);
        if (rt < 0) cam = (0.12 * W) / PXM;
      }
      /* the stalls' doors: open from the off */
      el.stalls.classList.toggle('open', ph !== 'gate' && ph !== 'bet');
      V.cam = cam;
      const ox = -cam * PXM + W * 0.5;
      el.course.style.transform = 'translate3d(' + ox.toFixed(1) + 'px,0,0)';
      el.shadows.style.transform = el.bats.style.transform = el.course.style.transform;
      el.l88.style.transform = 'translate3d(' + (-cam * PXM * 0.88 + W * 0.5).toFixed(1) + 'px,0,0)';
      for (const k in TILE) {
        const tl = TILE[k], off = ((cam * PXM * tl.par) % tl.w + tl.w) % tl.w;
        el.tiles[k].style.transform = 'translate3d(' + (-off - tl.w).toFixed(1) + 'px,0,0)';
      }
      /* bats */
      for (let i = 0; i < 8; i++) {
        const b = batEls[i]; if (!b) continue;
        if (mode[i] === 'off') { if (!b.hidden) { b.d.style.display = 'none'; b.sh.style.display = 'none'; b.hidden = true; } continue; }
        if (b.hidden) { b.d.style.display = ''; b.sh.style.display = ''; b.hidden = false; }
        let sc = laneScale(i), y = ys[i], rot = 0, flipY = 1, k = 0, k2 = 0;
        const lx = mode[i] === 'fly' || mode[i] === 'hang' ? skw(i) : 0;
        const sx = (xs[i] - cam) * PXM + W * 0.5 + lx;
        if (mode[i] === 'hang') {
          flipY = -1; rot = reduce ? 0 : 4 * Math.sin(t * 1.3 + i * 0.9);
          const tw = (Math.sin(t * 0.7 + i * 2.3) > 0.96 && !reduce) ? 0.6 : 0.16;
          k = tw; k2 = tw * 0.9;
        } else {
          let f = b.f;
          if (mode[i] === 'glide') f *= 0.55; else if (mode[i] === 'hero') f *= 0.75;
          else if (m) { const v = rt > m.T ? m.vEnd[i] : (xAt(m, i, rt + 0.05) - xs[i]) / 0.05; f *= 0.65 + 0.4 * clamp(v / m.Vc, 0, 1.3); }
          wingPh[i] += dt * TAU * f * (reduce ? 0.5 : 1);
          const ph0 = wingPh[i];
          k = Math.cos(ph0) * b.amp * wingAmp + (reduce ? 0.55 : 0); k2 = Math.cos(ph0 - b.lag * TAU * 0.3) * b.amp * 0.9 * wingAmp + (reduce ? 0.5 : 0);
          y += reduce ? 0 : -Math.sin(ph0) * 3.2 * sc;
          if (mode[i] === 'fly' && m && rt >= 0 && rt < 0.4) { flipY = -1 + 2 * clamp(rt / 0.35, 0, 1); y -= 20 * (1 - rt / 0.4); }
          if (mode[i] === 'hero') sc *= 1.45;
          rot = mode[i] === 'fly' ? -4 : 0;
        }
        if (Math.abs(flipY) < 0.05) flipY = flipY < 0 ? -0.05 : 0.05;
        b.d.style.transform = 'translate3d(' + (xs[i] * PXM + lx - 60).toFixed(1) + 'px,' + (y - 60).toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ',' + (sc * flipY).toFixed(3) + ')';
        b.wn.setAttribute('transform', 'translate(2 -4) scale(1 ' + k.toFixed(3) + ') rotate(' + (-12 * k).toFixed(1) + ') translate(-2 4)');
        b.wf.setAttribute('transform', 'translate(6 -6) scale(.92 ' + k2.toFixed(3) + ') rotate(' + (-10 * k2).toFixed(1) + ') translate(-2 4)');
        const gy = mode[i] === 'hero' ? laneGround(7) + 10 : laneGround(i);
        const lift = clamp((gy - y) / 160, 0, 1);
        b.sh.style.transform = 'translate3d(' + (xs[i] * PXM + lx - 30).toFixed(1) + 'px,' + (gy - 6).toFixed(1) + 'px,0) scale(' + (sc * (1.1 - lift * 0.5)).toFixed(3) + ')';
        b.sh.style.opacity = mode[i] === 'hang' ? '0.25' : (0.55 - lift * 0.3).toFixed(2);
        /* off-screen markers for the stragglers */
        const oe = el.offEls && el.offEls[i];
        if (oe) {
          const off = (mode[i] === 'fly') && sx < 12;
          if (off !== !!oe.on) { oe.on = off; oe.classList.toggle('on', off); }
          if (off) { oe.style.top = ((y / VH) * 100).toFixed(1) + '%'; oe.lastChild.textContent = '−' + Math.max(1, Math.round((lead - xs[i]) / LEN)) + 'L'; }
        }
      }
      if (ph === 'result' && m) { const hi = m.res.order[0]; el.spot.style.left = (((xs[hi] - cam) * PXM + W * 0.5) / W * 100).toFixed(2) + '%'; el.spot.style.top = (ys[hi] / VH * 100).toFixed(2) + '%'; }
      el.spot.classList.toggle('on', ph === 'result');
      drawMapAndBoard(s, ph, t, rt, m, xs, lead);
      root.classList.toggle('dy-roar', (ph === 'run' && m && rt > m.T - 4) || ph === 'photo');
    }
    let lbKey = '';
    function drawMapAndBoard(s, ph, t, rt, m, xs, lead) {
      const Dm = s.card.dist * FURLONG;
      const running = (ph === 'run' || ph === 'photo' || ph === 'judge') && m;
      el.map.classList.toggle('on', ph !== 'bet');
      for (let i = 0; i < 8; i++) {
        const d = el.mapDots[i]; if (!d) continue;
        const x = running ? clamp(xs[i] / Dm, 0, 1) : ph === 'result' && m ? 1 : 0;
        d.style.left = (x * 100).toFixed(2) + '%';
      }
      let order;
      if (running) order = rankAt(m, rt, xs);
      else if (ph === 'result' && m) order = m.res.order;
      else order = [0, 1, 2, 3, 4, 5, 6, 7];
      el.lb.classList.toggle('on', ph !== 'bet' && ph !== 'gate' && ph !== 'result');
      const photoHide = ph === 'photo' || (running && m.res.photo && rt >= m.T - 0.2);
      const k = order.join('') + (photoHide ? 'p' : '') + ph;
      for (let p = 0; p < 8; p++) {
        const i = order[p], row = el.lbRows[i]; if (!row) continue;
        row.style.transform = 'translateY(' + (p * 100) + '%)';
        if (k !== lbKey) { row.querySelector('.p').textContent = photoHide && p < 2 ? '?' : String(p + 1); row.classList.toggle('ph', photoHide && p < 2); }
        let gtxt = '';
        if (running && p > 0) { const ld = xs[order[0]], gl = (ld - xs[i]) / LEN; gtxt = gl < 0.1 ? '' : '+' + (lengthsStr(gl) || '–'); }
        else if (ph === 'result' && m && p > 0 && p < 4) gtxt = M.marginStr(m.res.margins[p - 1]);
        const ge = row.querySelector('.g'); if (ge.textContent !== gtxt) ge.textContent = gtxt;
      }
      lbKey = k;
    }

    /* HUD: race name, the phase, and the commentary */
    function paintHud(s, ph, t, rt, m) {
      const c = s.card;
      const nm = 'Race ' + s.id + ' · ' + c.name + ' · ' + c.dist + 'f · ' + c.going;
      if (el.hname.textContent !== nm) el.hname.textContent = nm;
      const label = { bet: live ? 'Betting open' : 'Place your bets', gate: 'Going behind', run: 'Racing', photo: 'Photo finish', judge: 'Awaiting the result', result: 'Result' }[ph] || '';
      if (el.phase.textContent !== label) { el.phase.textContent = label; el.phase.dataset.ph = ph; }
      let line = '';
      if (ph === 'bet') {
        const fav = favRank(c), f0 = c.runners[fav.idx[0]], f7 = c.runners[fav.idx[7]];
        const lines = [(live ? 'Betting is open on the ' : 'Welcome to the ') + c.name + '. ' + f0.name + ' heads the market at ' + fr(f0.odds) + '.', 'The going is ' + c.going.toLowerCase() + ', over ' + c.dist + ' furlongs. ' + f7.name + ' is the outsider at ' + fr(f7.odds) + '.', 'The runners parade in front of the Belfry Stand. Tap a name for its form.'];
        line = lines[Math.floor(t / 6) % lines.length];
      } else if (ph === 'gate') line = t - s.tm.closeAt < 2 ? (live ? 'Betting has closed. They’re going behind the stalls.' : 'They’re going behind the stalls.') : 'All eight are hanging in the stalls… the starter raises his flag…';
      else if (m && (ph === 'run' || ph === 'photo' || ph === 'judge')) { for (const e of m.events) if (e.t <= rt) line = e.text; if (ph === 'judge' && !line) line = 'Waiting for the judge.'; }
      else if (ph === 'result' && m) {
        const o = m.res.order, R = c.runners;
        line = (m.res.photo ? 'Photo finish result: first, number ' + (o[0] + 1) + ', ' + R[o[0]].name + '! ' : 'Result: ') + '1st ' + R[o[0]].name + ' (' + fr(R[o[0]].odds) + '), 2nd ' + R[o[1]].name + ', 3rd ' + R[o[2]].name + '.';
      }
      if (line && line !== g.lastLine) {
        g.lastLine = line; el.tickT.textContent = line;
        if (!reduce) { el.tickT.classList.remove('in'); void el.tickT.offsetWidth; el.tickT.classList.add('in'); }
      }
      /* the photo: freeze frame of the noses on the line */
      if (ph === 'photo' && m && rt >= m.T + 0.35) {
        if (el.photo.dataset.id !== String(s.id)) { el.photo.dataset.id = String(s.id); el.photo.innerHTML = photoHtml(s, m); }
        el.photo.classList.add('on');
      } else el.photo.classList.remove('on');
      if (ph === 'result' && m) { if (el.result.dataset.id !== String(s.id)) showResultBoard(s, m); }
      else if (el.result.classList.contains('on')) { el.result.classList.remove('on'); el.result.dataset.id = ''; el.photo.classList.remove('on'); }
    }
    function photoHtml(s, m) {
      const o = m.res.order, R = s.card.runners;
      const sil = (i) => '<svg viewBox="-64 -40 128 70" class="ps"><path d="M-30 4Q-20 -12 2 -8L22 -10Q34 -4 36 2Q28 10 4 10Q-20 14 -30 4Z" fill="#1b1410"/><path d="' + WINGS[R[i].id % 3] + '" fill="#2a201a" transform="scale(1 .5)"/><circle cx="24" cy="-4" r="8" fill="#1b1410"/></svg>';
      const pxPerM = 70, rows = [0, 1, 2].map((k) => {
        const i = o[k], back = (m.R[i].g - m.R[o[0]].g) * pxPerM;
        return '<div class="pr" style="--b:' + Math.min(back, 260).toFixed(0) + 'px">' + sil(i) + '<span>' + clothHtml(i) + '</span></div>';
      });
      return '<div class="pf"><div class="ph">PHOTO FINISH</div><div class="strip"><i class="line"></i>' + rows.join('') + '</div><small>The judge is studying the print…</small></div>';
    }
    function showResultBoard(s, m) {
      const o = m.res.order, R = s.card.runners, c = s.card;
      el.result.dataset.id = String(s.id);
      const mine = ridingBets(s);
      const rows = [0, 1, 2, 3].map((k) => { const i = o[k], r = R[i]; return '<li class="p' + (k + 1) + '"><span class="ps">' + ['1st', '2nd', '3rd', '4th'][k] + '</span>' + clothHtml(i) + silksSvg(r.silks, 'sm') + '<span class="n"><b>' + esc(r.name) + '</b><small>' + esc(r.jockey) + '</small></span><span class="o">' + fr(r.odds) + '</span>' + (k < 3 ? '<em>' + esc(M.marginStr(m.res.margins[k])) + '</em>' : '') + '</li>'; }).join('');
      const fc = c.fc[o[0] * 8 + o[1]] / 100, tc = c.tc[(o[0] * 8 + o[1]) * 8 + o[2]] / 100;
      el.result.innerHTML = '<div class="rb"><div class="hd"><small>Official result · race ' + s.id + '</small><b>' + esc(c.name) + '</b></div><ol>' + rows + '</ol><div class="dv"><span>Forecast ' + (o[0] + 1) + '-' + (o[1] + 1) + ' <b>' + fc.toFixed(2) + '×</b></span><span>Tricast ' + (o[0] + 1) + '-' + (o[1] + 1) + '-' + (o[2] + 1) + ' <b>' + tc.toFixed(2) + '×</b></span></div><div class="you">' + (mine.length ? 'Settling your bets…' : 'No bets on this race') + '</div></div>';
      el.result.classList.add('on');
      if (!reduce) B.fx.burst({ el: el.result.querySelector('.p1') || el.result, kind: 'confetti', count: 26, power: 0.6 });
    }

    /* betting timer (live) */
    function betClock(s, t, own) {
      const lbl = own ? 'Bets' : 'Next';
      if (el.timer.lastChild.textContent !== lbl) el.timer.lastChild.textContent = lbl;
      const left = s.tm.closeAt - t, span = Math.max(1, s.tm.closeAt - s.tm.openAt);
      const f = clamp(left / span, 0, 1);
      el.timer.hidden = false;
      el.timer.querySelector('.v').style.strokeDashoffset = String(119.4 * (1 - f));
      el.timer.querySelector('b').textContent = left >= 60 ? Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') : String(Math.max(0, Math.ceil(left)));
      el.timer.classList.toggle('hot', left <= 10);
      if (left <= 5.05 && left > 0 && Math.ceil(left) !== g.tickN) { g.tickN = Math.ceil(left); snd.tick(); }
      const pb = el.placeB.querySelector('small');
      if (canBet() && !g.pending.length) pb.textContent = 'closes in ' + Math.max(0, Math.ceil(left)) + 's';
      /* a slip that is still unplaced as betting closes goes on automatically */
      if (left < 1.6 && left > 0.7 && g.pending.length && !g.sending && !g.autoFor) { g.autoFor = s.id; B.ui.toast('Betting is closing: placing your slip.'); placeBets(); }
    }

    /* phase changes: calls, sounds and cuts */
    function call(html, cls, ms) {
      el.call.innerHTML = html; el.call.className = 'dy-call ' + (cls || '');
      void el.call.offsetWidth; el.call.classList.add('on');
      S.timeout(() => el.call.classList.remove('on'), ms || 1600);
    }
    function cut() { if (reduce) return; el.cut.classList.remove('on'); void el.cut.offsetWidth; el.cut.classList.add('on'); }
    function onPhase(s, ph, first, was) {
      if (ph === 'bet') {
        el.result.classList.remove('on'); el.photo.classList.remove('on');
        if (!first) { cut(); if (live) { call('<span>Betting open</span><small>' + esc(s.card.name) + '</small>', 'open', 1700); snd.open(); } }
        g.autoFor = 0;
        paintCard(); paintAll();
      } else if (ph === 'gate') {
        if (live) { const card = s.card, mineB = myBetsOn(s.id); if (mineB.length) rememberSlip(card, mineB); g.pending = g.pending.filter((b) => b.race !== s.id); }
        if (!first) { cut(); call('<span>Betting closed</span><small>They’re going behind</small>', 'close', 1700); snd.bugle(); }
        paintAll(); paintCard();
      } else if (ph === 'run') {
        if (!first || s.tm.offAt > nowS() - 1.5) { snd.bell(); snd.stalls(); S.timeout(() => snd.wings(14, 0.06), 120); call('<span>They’re off!</span>', 'off', 1300); }
      } else if (ph === 'photo') {
        if (!first) { snd.roar(); S.timeout(() => { snd.shutter(); if (!reduce) { el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on'); } }, 300); call('<span>Photo!</span>', 'photo', 1400); }
      } else if (ph === 'judge') {
        if (!first) snd.roar();
      } else if (ph === 'result') {
        if (!first) snd.result();
      }
    }
    /* crowd and wings, while the race is on */
    function ambience(s, ph, rt, m, dt) {
      if (reduce || document.hidden) return;
      g.crowdT -= dt; g.wingT -= dt;
      if (g.crowdT <= 0) {
        g.crowdT = 0.55;
        let lv = 0.05;
        if (ph === 'run' && m) lv = 0.15 + 0.75 * clamp(rt / m.T, 0, 1) ** 2;
        else if (ph === 'photo' || ph === 'judge') lv = 0.45;
        else if (ph === 'result') lv = 0.25;
        else if (ph === 'gate') lv = 0.1;
        snd.crowd(lv);
      }
      if (ph === 'run' && g.wingT <= 0) { g.wingT = 0.22; snd.wings(2, 0.03); }
    }

    /* ---------- settling ---------- */
    function settleTick(s, ph) {
      if (g.paying) return;
      if (live) {
        while (L.settledQ.length) {
          const st = L.settledQ[0];
          if (st.race === s.id && (ph === 'result')) { L.settledQ.shift(); livePay(st, s); break; }
          if (st.race !== s.id || ph === 'bet') { L.settledQ.shift(); awayPay(st); continue; }
          break;
        }
        /* the settlement may have gone to another tab of yours: the bets themselves then carry what they won */
        if (ph === 'result' && !L.paid[s.id] && nowS() > s.tm.resultAt + 2.5) {
          const mb = myBetsOn(s.id);
          if (mb.length && mb.every((b) => b.win >= 0)) { livePay({ race: s.id, won: mb.reduce((a, b) => a + b.win, 0), staked: mb.reduce((a, b) => a + b.cost, 0) }, s); return; }
        }
        if (ph === 'result' && el.result.classList.contains('on') && !ridingBets(s).length) el.result.querySelector('.you').textContent = 'No bets on this race';
      } else if (ph === 'result' && P.show && !P.show.paid) {
        P.show.paid = true; practicePay(P.show);
      }
    }
    async function livePay(st, s) {
      if (L.paid[st.race]) return; L.paid[st.race] = true;
      g.paying = true;
      try { await payout(s, st.won, st.staked, st.bets); } catch (e) { console.error(e); }
      g.paying = false; paintAll();
    }
    function awayPay(st) {
      if (L.paid[st.race]) return; L.paid[st.race] = true;
      B.wallet.win(ID, st.won, { silent: true }); B.wallet.sync();
      if (st.won > 0) B.ui.toast('Race ' + st.race + ' is official: your bets returned ' + fmt(st.won) + ' BB.', 4200);
    }
    async function payout(s, won, staked, betWins) {
      const you = el.result.querySelector('.you');
      B.wallet.win(ID, won, { silent: true });
      g.sessionWon += won;
      if (won > 0) {
        if (you) { you.innerHTML = 'You win <b>0</b> BB'; you.classList.add('up'); B.ui.countUp(you.querySelector('b'), 0, won, T(1200), fmt); }
        snd.win();
        if (!reduce) { B.fx.burst({ el: you || el.view, kind: 'coin', count: 30, power: 0.8 }); }
        call('<span>You win</span><small>' + fmt(won) + ' BB</small>', 'win', 2200);
        await S.sleep(T(1300));
        B.wallet.sync();
        if (won >= staked * 10 && staked > 0) await B.ui.celebrate({ amount: won, bet: staked });
      } else {
        if (you) you.textContent = staked > 0 ? 'No luck this time: ' + fmt(staked) + ' BB staked' : 'No bets on this race';
        if (staked > 0) snd.lose();
        B.wallet.sync();
      }
      paintSlip(true); paintRail(true);
    }

    /* ---------- LIVE: the poll ---------- */
    async function poll() {
      if (L.polling || g.dead) return;
      L.polling = true;
      const t0 = Date.now(); let r;
      try { r = await B.api('play', { game: ID, op: 'state', have: Object.keys(L.cards).map(Number).slice(-8), since: L.latest }, { defer: true }); }
      catch (e) {
        L.polling = false;
        if (e.status === 401 || e.status === 403) { if (!g.dead) { g.dead = true; B.ui.toast(e.message); } }
        return;
      }
      const t1 = Date.now(); L.polling = false; if (g.dead) return;
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (L.off == null || rtt <= L.best * 1.25 || ++L.age > 40) { L.off = off; L.best = rtt; L.age = 0; }
      for (const c of r.cards || []) L.cards[c.id] = c;
      const keep = new Set(r.races.map((x) => x.id)); for (const k in L.cards) if (!keep.has(+k) && Object.keys(L.cards).length > 4) delete L.cards[k];
      if (r.results) L.results = r.results;
      if (r.latest) L.latest = r.latest;
      for (const s of r.settled || []) if (!L.settledQ.find((x) => x.race === s.race) && !L.paid[s.race]) L.settledQ.push(s);
      L.st = r;
      paintRail(); paintResults(); paintSlip(); paintMarks(); paintBar();
    }

    /* ---------- PRACTICE ---------- */
    function practiceInit() {
      const pr = mem.prac;
      if (pr && Array.isArray(pr.roster) && pr.roster.length === M.BAT_NAMES.length) { P.roster = pr.roster; P.prev = pr.prev || []; P.results = (pr.results || []).slice(0, 12); P.no = pr.no || 0; }
      else { P.roster = M.makeRoster(B.rng); P.prev = []; P.results = []; P.no = 0; }
      practiceCard();
    }
    function practiceSave() { mem.prac = { roster: P.roster, prev: P.prev, results: P.results.slice(0, 12), no: P.no }; saveMem(); }
    function practiceCard() {
      const race = M.makeRace(B.rng, P.roster, P.prev);
      P.race = race;
      P.card = { id: P.no + 1, name: race.name, dist: race.dist, going: race.going, cls: race.cls, runners: race.runners, fc: race.fc, tc: race.tc };
      g.pending = [];
    }
    function practiceRace() {
      if (P.show || !P.card || g.busy) return;
      const card = P.card, bets = g.pending.filter((b) => b.race === card.id);
      const cost = bets.reduce((a, b) => a + M.costOf(b), 0);
      if (cost > 0 && !B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      let res = M.runRace(B.rng, P.race);
      if (dev) {
        if (Array.isArray(dev.order) && dev.order.length === 8) res.order = dev.order.slice();
        if (dev.winner >= 1 && dev.winner <= 8) { const w = dev.winner - 1; res.order = [w].concat(res.order.filter((x) => x !== w)); }
        if (dev.photo) { res.margins[0] = 5; res.photo = true; }
        dev.order = null; dev.winner = null; dev.photo = false;
      }
      const t0 = nowS(), off = t0 + (reduce ? 2 : 4), fin = off + res.timeMs / 1000, rs = fin + (res.photo ? 5.5 : 2.5);
      P.show = { id: card.id, card, race: P.race, res, bets: bets.map((b) => ({ t: b.t, sel: b.sel, stake: b.stake, cost: M.costOf(b), win: -1 })), staked: cost, tm: { openAt: t0 - 60, closeAt: t0, offAt: off, finishAt: fin, resultAt: rs, endAt: rs + 8 } };
      if (bets.length) rememberSlip(card, bets);
      g.pending = []; g.build = []; g.sessionStaked += cost;
      if (dev) { dev.races++; dev.staked += cost; }
      paintAll(); paintCard(); paintOps();
    }
    function practicePay(s) {
      let won = 0;
      for (const b of s.bets) { b.win = M.settleBet(b, s.race, s.res); won += b.win; }
      if (dev) { dev.won += won; dev.last = { order: s.res.order.slice(), margins: s.res.margins.slice(), photo: s.res.photo, bets: s.bets, won }; }
      g.paying = true;
      payout(s, won, s.staked, null).catch((e) => console.error(e)).then(() => { g.paying = false; paintAll(); });
    }
    function practiceNext() {
      const s = P.show; if (!s || g.paying) return;
      const bats = s.card.runners.map((r) => P.roster.find((b) => b.id === r.id));
      const upd = M.updateForm(bats, s.race, s.res, s.id, Math.floor(Date.now() / 1000));
      for (const u of upd) { const k = P.roster.findIndex((b) => b.id === u.id); P.roster[k] = Object.assign({}, P.roster[k], u); }
      const o = s.res.order, R = s.card.runners;
      P.results.unshift({ id: s.id, name: s.card.name, dist: s.card.dist, going: s.card.going, photo: s.res.photo, top: o.slice(0, 4).map((i) => ({ i, no: i + 1, name: R[i].name, silks: R[i].silks, odds: fr(R[i].odds), jockey: R[i].jockey })), margins: s.res.margins.slice(0, 3).map(M.marginStr), fc: s.card.fc[o[0] * 8 + o[1]], tc: s.card.tc[(o[0] * 8 + o[1]) * 8 + o[2]] });
      P.results = P.results.slice(0, 12);
      P.prev = s.card.runners.map((r) => r.id); P.no = s.id; P.show = null;
      practiceCard(); practiceSave();
      paintResults(true); paintRail(true); paintCard(true); paintAll();
    }
    /* practice: tap the course to skip to the finish */
    S.on(el.view, 'click', () => {
      if (live || !P.show) return;
      const t = nowS(), s = P.show, tm = s.tm;
      if (t < tm.finishAt - 1) { const d = tm.finishAt - 1 - t; for (const k of ['offAt', 'finishAt', 'resultAt', 'endAt']) tm[k] -= d; tm.closeAt = Math.min(tm.closeAt, tm.offAt - 0.01); }
      else if (t >= tm.resultAt && t < tm.endAt - 0.5 && !g.paying) tm.endAt = t + 0.3;
    });

    /* ---------- keys ---------- */
    S.on(window, 'keydown', (e) => {
      if (g.dead || e.target.closest && e.target.closest('input,textarea,select') || document.querySelector('.bc-modal, .bc-veil, .bc-win')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); placeBets(); }
      else if (k >= '1' && k <= '9') { mem.chip = +k - 1; saveMem(); snd.chip(); paintChips(); }
      else if (k === 'u') undo();
      else if (k === 'c') clearAll();
      else if (k === 'r') rebet();
    });

    /* ---------- start ---------- */
    layout(); paintChips(); paintTabs(); paintTypes();
    if (live) {
      el.phase.textContent = 'Joining the course…';
      poll(); S.interval(() => { if (!document.hidden || Math.random() < 0.25) poll(); }, 1000);
    } else {
      practiceInit();
      paintCard(true); paintResults(true); paintRail(true);
      if (dev) B.ui.toast('Practice dev hooks on: window.__derbyDev.winner = 3, .photo = true');
    }
    paintAll();
    let errN = 0;
    S.loop((dt) => { try { frame(dt); } catch (e) { if (errN++ < 3) console.error(e); } });
    g.destroy = () => { g.dead = true; ro.disconnect(); if (window.__derbyDev) delete window.__derbyDev; };
  }

  B.registerGame({
    id: ID, name: 'Bat Derby', tagline: 'Live bat racing under the moon: back a winner, watch them fly',
    tag: 'Live racing', section: 'arcade', isNew: true,
    poster: POSTER, rules,
    mount(root) { mount(root); },
    unmount() { if (G && G.destroy) G.destroy(); G = null; if (S) S.dispose(); S = null; },
  });
})();
