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
(function () {
  'use strict';
  const B = Batty, h = B.h;
  B.registerGame({
    id: 'derby', name: 'Bat Derby', tagline: 'Opening soon', tag: 'Coming soon',
    poster: '<svg viewBox="0 0 300 380"><rect width="300" height="380" fill="#1d1033"/><text x="150" y="200" text-anchor="middle" fill="#ffd76a" font-size="28" font-family="Titan One">Bat Derby</text></svg>',
    rules: '<p>Opening soon.</p>',
    mount(root) { root.append(h('div', { class: 'bc-loading' }, 'Opening soon')); },
    unmount() {},
  });
})();
