/* Bat Derby simulation: proves the prices and the race model agree, for every bet type.
   It runs the real maths from games/derby/game.js (the same code the server's PHP port is proved identical to) the way the
   live schedule does: a stable of 48 bats whose ratings and form move after every race, a new priced field each race
   (the runners of the race before sit it out), and the result drawn from the model.
   On every race it places every possible bet of every type at the same stake: 8 win, 8 each-way, 56 forecasts,
   28 reverse forecasts and 336 tricasts. So each bet type is tested on every race.
   Usage: node tools/derby-sim.js [races=1000000] [workers=4] [seed=1] */
'use strict';
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

function loadMath() {
  const src = fs.readFileSync(path.join(__dirname, '../games/derby/game.js'), 'utf8');
  const g = {}; new Function('globalThis', 'module', src.slice(0, src.indexOf('/* ===== derby ===== */')))(g, undefined);
  return g.BattyMath.derby;
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const TYPES = ['win', 'ew', 'fc', 'rfc', 'tc'];
const MIN = 20; /* the smallest stake: whole-BB rounding costs the most here */
const FC_BUCKETS = [10, 25, 50, 100, 250, 500, 1e9], TC_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 1e9];
const bucketOf = (x, B) => { for (let i = 0; i < B.length; i++) if (x < B[i]) return i; return B.length - 1; };

function work(seed, races) {
  const M = loadMath();
  const rng = mulberry32(seed);
  let roster = M.makeRoster(rng);
  const z = () => ({ n: 0, stake: 0, ret: 0, retBB: 0, stakeBB: 0, hits: 0, exp: 0, s1: 0, s2: 0, maxX: 0 });
  const T = {}; for (const t of TYPES) T[t] = z();
  const S = {}; for (const k of ['favWin', 'outWin', 'favEW', 'outEW', 'favFC', 'favRFC', 'favTC']) S[k] = { n: 0, ret: 0 };
  const win = {}, place = {}, fcB = FC_BUCKETS.map(() => ({ n: 0, exp: 0, hit: 0, v: 0 })), tcB = TC_BUCKETS.map(() => ({ n: 0, exp: 0, hit: 0, v: 0 }));
  let prev = [], tries = 0, photos = 0, rwMin = 1, rwMax = 0, reMin = 1, reMax = 0, favWins = 0, maxFC = 0, maxTC = 0;
  const posWins = new Array(8).fill(0); let favPrice = {};
  for (let r = 0; r < races; r++) {
    const race = M.makeRace(rng, roster, prev);
    const res = M.runRace(rng, race);
    tries += race.tries; if (res.photo) photos++;
    rwMin = Math.min(rwMin, race.rw); rwMax = Math.max(rwMax, race.rw); reMin = Math.min(reMin, race.re); reMax = Math.max(reMax, race.re);
    const R = race.runners, o = res.order, w = race.w, v = race.v;
    const pl = M.placeProbs(w, v);
    /* every bet of every type, at one unit (exact multipliers) and at the minimum 20 BB stake (whole-BB rounding) */
    const per = {}; for (const t of TYPES) per[t] = 0;
    for (let i = 0; i < 8; i++) {
      for (const t of ['win', 'ew']) {
        const b = { t, sel: [i], stake: MIN };
        const st = M.betStats(b, race), got = M.settleBet(b, race, res);
        const cost = M.costOf(b), x = got / cost;
        T[t].n++; T[t].stake += 1; T[t].exp += st.ret; T[t].retBB += got; T[t].stakeBB += cost;
        const exact = t === 'win' ? (o[0] === i ? (R[i].odds[0] + R[i].odds[1]) / R[i].odds[1] : 0)
          : (o[0] === i ? 0.5 * (R[i].ew[0] + R[i].ew[1]) / R[i].ew[1] : 0) + (o.indexOf(i) <= 2 ? 0.5 * (R[i].ew[0] + 4 * R[i].ew[1]) / (4 * R[i].ew[1]) : 0);
        T[t].ret += exact; per[t] += exact; if (exact > 0) T[t].hits++; if (x > T[t].maxX) T[t].maxX = x;
      }
      const k = R[i].oi;
      (win[k] = win[k] || { n: 0, exp: 0, v: 0, hit: 0 }); win[k].n++; win[k].exp += w[i]; win[k].v += w[i] * (1 - w[i]); if (o[0] === i) win[k].hit++;
      (place[k] = place[k] || { n: 0, exp: 0, v: 0, hit: 0 }); place[k].n++; place[k].exp += pl[i]; place[k].v += pl[i] * (1 - pl[i]); if (o.indexOf(i) <= 2) place[k].hit++;
    }
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      if (a === b) continue;
      const P = w[a] * v[b] / (1 - v[a]), d = race.fc[a * 8 + b] / 100, hit = o[0] === a && o[1] === b;
      T.fc.n++; T.fc.stake += 1; T.fc.exp += P * d; T.fc.stakeBB += MIN; if (hit) { T.fc.ret += d; per.fc += d; T.fc.hits++; T.fc.retBB += Math.floor(MIN * race.fc[a * 8 + b] / 100); if (d > T.fc.maxX) T.fc.maxX = d; }
      const fb = fcB[bucketOf(d, FC_BUCKETS)]; fb.n++; fb.exp += P; fb.v += P * (1 - P); if (hit) fb.hit++;
      if (d > maxFC) maxFC = d;
      if (a < b) {
        const P2 = w[b] * v[a] / (1 - v[b]), d2 = race.fc[b * 8 + a] / 100, hit2 = o[0] === b && o[1] === a;
        T.rfc.n++; T.rfc.stake += 1; T.rfc.exp += 0.5 * (P * d + P2 * d2); T.rfc.stakeBB += 2 * MIN;
        const g = hit ? 0.5 * d : hit2 ? 0.5 * d2 : 0;
        if (g) { T.rfc.ret += g; per.rfc += g; T.rfc.hits++; T.rfc.retBB += M.settleBet({ t: 'rfc', sel: [a, b], stake: MIN }, race, res); if (g > T.rfc.maxX) T.rfc.maxX = g; }
      }
      for (let c = 0; c < 8; c++) {
        if (c === a || c === b) continue;
        const P3 = P * v[c] / (1 - v[a] - v[b]), dt = race.tc[(a * 8 + b) * 8 + c] / 100, hitT = hit && o[2] === c;
        T.tc.n++; T.tc.stake += 1; T.tc.exp += P3 * dt; T.tc.stakeBB += MIN;
        if (hitT) { T.tc.ret += dt; per.tc += dt; T.tc.hits++; T.tc.retBB += Math.floor(MIN * race.tc[(a * 8 + b) * 8 + c] / 100); if (dt > T.tc.maxX) T.tc.maxX = dt; }
        const tb = tcB[bucketOf(dt, TC_BUCKETS)]; tb.n++; tb.exp += P3; tb.v += P3 * (1 - P3); if (hitT) tb.hit++;
        if (dt > maxTC) maxTC = dt;
      }
    }
    /* per-race return per unit staked on each type, for the standard error */
    const cnt = { win: 8, ew: 8, fc: 56, rfc: 28, tc: 336 };
    for (const t of TYPES) { const y = per[t] / cnt[t]; T[t].s1 += y; T[t].s2 += y * y; }
    /* simple strategies: the favourite and the outsider (lowest / highest price, first listed on a tie) */
    let fav = 0, out = 0, fav2 = -1, fav3 = -1;
    for (let i = 1; i < 8; i++) { if (R[i].oi < R[fav].oi) fav = i; if (R[i].oi > R[out].oi) out = i; }
    for (let i = 0; i < 8; i++) if (i !== fav && (fav2 < 0 || R[i].oi < R[fav2].oi)) fav2 = i;
    for (let i = 0; i < 8; i++) if (i !== fav && i !== fav2 && (fav3 < 0 || R[i].oi < R[fav3].oi)) fav3 = i;
    /* per BB of what the bet costs (each way and reverse forecasts are two bets, so they cost twice the stake) */
    const unit = (t, sel) => { const b = { t, sel, stake: 10000 }; return M.settleBet(b, race, res) / M.costOf(b); };
    S.favWin.n++; S.favWin.ret += unit('win', [fav]); S.outWin.n++; S.outWin.ret += unit('win', [out]);
    S.favEW.n++; S.favEW.ret += unit('ew', [fav]); S.outEW.n++; S.outEW.ret += unit('ew', [out]);
    S.favFC.n++; S.favFC.ret += unit('fc', [fav, fav2]); S.favRFC.n++; S.favRFC.ret += unit('rfc', [fav, fav2]); S.favTC.n++; S.favTC.ret += unit('tc', [fav, fav2, fav3]);
    if (o[0] === fav) favWins++;
    favPrice[R[fav].oi] = (favPrice[R[fav].oi] || 0) + 1;
    /* the stable moves on, as it does on the server */
    const bats = R.map((x) => roster.find((b) => b.id === x.id));
    const upd = M.updateForm(bats, race, res, r + 1, r);
    for (const u of upd) { const b = roster.find((x) => x.id === u.id); Object.assign(b, u); b.hist = []; }
    prev = R.map((x) => x.id);
  }
  return { T, S, win, place, fcB, tcB, races, tries, photos, rwMin, rwMax, reMin, reMax, favWins, maxFC, maxTC, favPrice };
}

if (!isMainThread) { parentPort.postMessage(work(workerData.seed, workerData.races)); }
else {
  const races = +(process.argv[2] || 1000000), nw = +(process.argv[3] || 4), seed = +(process.argv[4] || 1);
  const M = loadMath();
  const t0 = Date.now();
  const per = Math.ceil(races / nw);
  Promise.all(Array.from({ length: nw }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { seed: seed * 1000 + i, races: Math.min(per, races - i * per) } });
    w.on('message', res); w.on('error', rej);
  }))).then((parts) => {
    const maxes = {}; for (const t of TYPES) maxes[t] = Math.max(...parts.map((q) => q.T[t].maxX));
    const A = parts[0];
    const addObj = (x, y) => { for (const k in y) { if (typeof y[k] === 'number') x[k] = (x[k] || 0) + y[k]; else if (y[k] && typeof y[k] === 'object') addObj(x[k] = x[k] || (Array.isArray(y[k]) ? [] : {}), y[k]); } };
    for (let i = 1; i < parts.length; i++) {
      const P = parts[i];
      for (const k of ['T', 'S', 'win', 'place', 'fcB', 'tcB', 'favPrice']) addObj(A[k], P[k]);
      for (const k of ['races', 'tries', 'photos', 'favWins']) A[k] += P[k];
      A.rwMin = Math.min(A.rwMin, P.rwMin); A.rwMax = Math.max(A.rwMax, P.rwMax); A.reMin = Math.min(A.reMin, P.reMin); A.reMax = Math.max(A.reMax, P.reMax);
      A.maxFC = Math.max(A.maxFC, P.maxFC); A.maxTC = Math.max(A.maxTC, P.maxTC);
    }
    const pc = (x) => (100 * x).toFixed(3) + '%';
    for (const t of TYPES) A.T[t].maxX = maxes[t];
    const n = A.races;
    console.log('Bat Derby simulation: ' + n.toLocaleString('en-GB') + ' races (' + nw + ' workers, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    console.log('Fields: ' + (A.tries / n).toFixed(3) + ' draws per priced field; win book returns ' + pc(A.rwMin) + '..' + pc(A.rwMax) + ', each-way ' + pc(A.reMin) + '..' + pc(A.reMax) + ' (every field); photo finishes ' + pc(A.photos / n) + '; favourite won ' + pc(A.favWins / n));
    console.log('\nBet type          bets settled     model RTP   simulated RTP (±1.96 SE)        RTP at 20 BB (whole BB)   hit rate    max win');
    const names = { win: 'Win', ew: 'Each Way', fc: 'Forecast', rfc: 'Reverse Forecast', tc: 'Tricast' };
    const out = {};
    for (const t of TYPES) {
      const X = A.T[t], mean = X.s1 / n, sd = Math.sqrt(Math.max(0, X.s2 / n - mean * mean)), se = sd / Math.sqrt(n);
      out[t] = { model: X.exp / X.stake, sim: X.ret / X.stake, se, bb: X.retBB / X.stakeBB, hit: X.hits / X.n, maxX: X.maxX };
      console.log(names[t].padEnd(17) + X.n.toLocaleString('en-GB').padStart(13) + '   ' + pc(X.exp / X.stake).padStart(9) + '   ' + (pc(X.ret / X.stake) + ' ± ' + (196 * se).toFixed(3) + '%').padStart(26) + '   ' + pc(X.retBB / X.stakeBB).padStart(22) + '   ' + pc(X.hits / X.n).padStart(9) + '   ' + (X.maxX.toFixed(2) + '×').padStart(10));
    }
    console.log('\nStrategies (one bet a race, 10,000 BB stake):');
    const sn = { favWin: 'Win on the favourite', outWin: 'Win on the outsider', favEW: 'Each way on the favourite', outEW: 'Each way on the outsider', favFC: 'Forecast: 1st and 2nd favourites', favRFC: 'Reverse forecast: two favourites', favTC: 'Tricast: the three favourites in order' };
    for (const k in A.S) console.log('  ' + sn[k].padEnd(40) + pc(A.S[k].ret / A.S[k].n));
    const calib = (title, tab, label) => {
      console.log('\n' + title);
      console.log('  ' + 'price'.padEnd(10) + 'runners'.padStart(12) + 'expected'.padStart(14) + 'actual'.padStart(12) + '   z');
      let chi = 0, df = 0;
      for (const k of Object.keys(tab).map(Number).sort((a, b) => a - b)) {
        const c = tab[k]; if (c.n < 2000) continue;
        const zz = (c.hit - c.exp) / Math.sqrt(c.v); chi += zz * zz; df++;
        console.log('  ' + label(k).padEnd(10) + c.n.toLocaleString('en-GB').padStart(12) + (100 * c.exp / c.n).toFixed(3).padStart(13) + '%' + (100 * c.hit / c.n).toFixed(3).padStart(11) + '%' + ('   ' + (zz >= 0 ? '+' : '') + zz.toFixed(2)));
      }
      console.log('  chi-square ' + chi.toFixed(1) + ' on ' + df + ' rungs (about ' + df + ' expected if the model and the prices agree)');
      return { chi, df };
    }
    const cw = calib('Win calibration: chance implied by each win price against how often runners at that price won', A.win, (k) => M.fracStr(k));
    const cp = calib('Place calibration (first three), by win price: model place chance against how often they placed', A.place, (k) => M.fracStr(k));
    const bucketTab = (B, edges) => { const o = {}; B.forEach((b, i) => { o[i] = { n: b.n, exp: b.exp, v: b.v, hit: b.hit }; }); return o; };
    const lab = (edges) => (i) => (i ? edges[i - 1] : 0) + '-' + (edges[i] >= 1e9 ? 'up' : edges[i]) + '×';
    const cf = calib('Forecast calibration, by dividend', bucketTab(A.fcB), lab(FC_BUCKETS));
    const ct = calib('Tricast calibration, by dividend', bucketTab(A.tcB), lab(TC_BUCKETS));
    console.log('\nDearest forecast offered: ' + A.maxFC.toFixed(2) + '×   dearest tricast offered: ' + A.maxTC.toFixed(2) + '× (cap 9,999.99×, so no bet can return more than 10,000× its stake)');
  });
}
