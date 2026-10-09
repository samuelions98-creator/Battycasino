#!/usr/bin/env node
/* Book of Bats: return-to-player proof.
     node tools/bookofbats-sim.js --exact            exact calculation (line wins, scatters, trigger rate, free-spin value)
     node tools/bookofbats-sim.js [spins] [lines]    Monte Carlo over the real game maths (default 10,000,000 spins, 10 lines),
                                                     split over worker threads, each with its own seeded mulberry32.
   The maths is loaded straight from games/bookofbats/game.js (the part before the presentation), so this tests the
   exact code the browser runs (and the server ports). */
'use strict';
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

function loadMath() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'bookofbats', 'game.js'), 'utf8');
  const cut = src.indexOf('/* ===== bookofbats ===== */');
  const mod = { exports: {} };
  new Function('module', 'globalThis', cut > 0 ? src.slice(0, cut) : src)(mod, {});
  return mod.exports;
}
const M = loadMath();
function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------- exact ---------------- */
function exact() {
  const { STRIPS, PAY, SCAT, MINEXP, SPECIAL_W, BOOK, FS_AWARD, MAX_SPECIALS } = Object.assign({}, M, { BOOK: M.SYM.BOOK });
  const N = M.NSYM, R = M.REELS;
  const freq = (set) => STRIPS[set].map((st) => { const f = new Array(N).fill(0); st.forEach((s) => f[s]++); return f.map((x) => x / st.length); });
  const vis = (set) => STRIPS[set].map((st) => { const L = st.length, q = new Array(N).fill(0); for (let p = 0; p < L; p++) new Set([st[p], st[(p + 1) % L], st[(p + 2) % L]]).forEach((s) => { q[s] += 1 / L; }); return q; });
  /* one line: the symbol on each reel is uniform over that reel's strip, so a line's return per line bet is the same for
     every line. Enumerate every symbol 5-tuple, weighted by strip frequencies. */
  function lineEV(set) {
    const f = freq(set), t = [0, 0, 0, 0, 0]; let ev = 0, hit = 0;
    const g = [[0], [0], [0], [0], [0]];
    (function rec(r, p) {
      if (r === R) { for (let k = 0; k < R; k++) g[k][1] = t[k]; const e = M.evalLines(g.map((c) => [c[0], c[1], c[0]]), 1); ev += p * e.pay; if (e.pay) hit += p; return; }
      for (let s = 0; s < N; s++) if (f[r][s] > 0) { t[r] = s; rec(r + 1, p * f[r][s]); }
    })(0, 1);
    return { ev, hit };
  }
  function countDist(q) { const pk = new Array(R + 1).fill(0); for (let m = 0; m < 1 << R; m++) { let p = 1, k = 0; for (let r = 0; r < R; r++) { if (m >> r & 1) { p *= q[r]; k++; } else p *= 1 - q[r]; } pk[k] += p; } return pk; }
  function scatter(set) { const pk = countDist(vis(set).map((x) => x[BOOK])); let ev = 0, p3 = 0; for (let k = 0; k <= R; k++) { ev += pk[k] * SCAT[k]; if (k >= 3) p3 += pk[k]; } return { ev, p3, pk }; }
  function expandEV(set) { const q = vis(set), out = []; for (let s = 0; s < 9; s++) { const pk = countDist(q.map((x) => x[s])); let ev = 0; for (let k = MINEXP[s]; k <= R; k++) ev += pk[k] * PAY[s][k]; out.push(ev); } return out; }
  function sampleSum(X, W, j) {
    let tot = 0; const n = X.length;
    (function rec(ch, p, d) {
      if (d === j) { let s = 0; ch.forEach((i) => { s += X[i]; }); tot += p * s; return; }
      let ws = 0; for (let i = 0; i < n; i++) if (!ch.includes(i)) ws += W[i];
      for (let i = 0; i < n; i++) if (!ch.includes(i) && W[i] > 0) rec(ch.concat([i]), p * W[i] / ws, d + 1);
    })([], 1, 0);
    return tot;
  }
  const bl = lineEV('base'), bs = scatter('base');
  const fl = lineEV('fs'), fsS = scatter('fs'), X = expandEV('fs');
  const perSpinBase = fl.ev + fsS.ev, p = fsS.p3;
  const Mj = [0]; for (let j = 1; j <= MAX_SPECIALS; j++) Mj.push(sampleSum(X, SPECIAL_W, j));
  /* Markov chain over (spins left, specials held): every spin returns perSpinBase + the expansion value of its specials */
  let st = new Map([[FS_AWARD + '|1', 1]]), fsTotal = 0, fsSpins = 0;
  for (let it = 0; it < 20000 && st.size; it++) {
    const nx = new Map(), add = (k, v) => nx.set(k, (nx.get(k) || 0) + v);
    for (const [key, pr] of st) {
      if (pr < 1e-18) continue;
      const [n, j] = key.split('|').map(Number);
      fsTotal += pr * (perSpinBase + Mj[j]); fsSpins += pr;
      add((n - 1 + FS_AWARD) + '|' + Math.min(MAX_SPECIALS, j + 1), pr * p);
      if (n > 1) add((n - 1) + '|' + j, pr * (1 - p));
    }
    st = nx;
  }
  const fsRTP = bs.p3 * fsTotal;
  const out = {
    baseLineRTP: bl.ev, baseScatterRTP: bs.ev, freeSpinsRTP: fsRTP, totalRTP: bl.ev + bs.ev + fsRTP,
    lineHitPerLine: bl.hit, triggerOneIn: 1 / bs.p3, freeSpinsPerFeature: fsSpins, featureValueXStake: fsTotal,
    retriggerOneInFreeSpins: 1 / p, expansionValuePerFreeSpinXStake: Object.fromEntries(X.map((x, s) => [M.NAMES[s], +x.toFixed(4)])),
    note: 'Exact, before the 5,000x cap (the simulation measures the cap; its effect is a few hundredths of a point).',
  };
  console.log('Book of Bats: exact return');
  console.log('  base game line wins   ' + (out.baseLineRTP * 100).toFixed(4) + '%');
  console.log('  Book scatter pays     ' + (out.baseScatterRTP * 100).toFixed(4) + '%');
  console.log('  free spins            ' + (out.freeSpinsRTP * 100).toFixed(4) + '%');
  console.log('  TOTAL                 ' + (out.totalRTP * 100).toFixed(4) + '%');
  console.log('  free spins 1 in ' + out.triggerOneIn.toFixed(2) + ' spins, ' + out.freeSpinsPerFeature.toFixed(3) + ' spins per feature on average, worth ' + out.featureValueXStake.toFixed(2) + 'x stake');
  console.log('  retrigger 1 in ' + out.retriggerOneInFreeSpins.toFixed(1) + ' free spins');
  console.log('  expansion value per free spin (x stake): ' + JSON.stringify(out.expansionValuePerFreeSpinXStake));
  console.log('  ' + out.note);
  return out;
}

/* ---------------- simulation ---------------- */
function simChunk(seed, n, lines) {
  const rng = mulberry(seed);
  const s = { n: 0, ret: 0, ret2: 0, base: 0, scat: 0, fs: 0, hits: 0, feats: 0, fsSpins: 0, retrig: 0, capped: 0, max: 0, buckets: new Array(9).fill(0), specials: new Array(9).fill(0), specialRet: new Array(9).fill(0) };
  const edges = [0, 1, 2, 5, 10, 25, 100, 500];
  for (let i = 0; i < n; i++) {
    const o = M.spin(rng, lines);
    const x = o.total / lines; // x stake
    s.n++; s.ret += x; s.ret2 += x * x;
    s.base += (o.base.pay - o.base.scat) / lines; s.scat += o.base.scat / lines;
    if (o.total > 0) s.hits++;
    if (o.fs) { s.feats++; s.fs += o.fs.pay / lines; s.fsSpins += o.fs.played; s.retrig += o.fs.retriggers; s.specials[o.fs.first]++; s.specialRet[o.fs.first] += o.fs.pay / lines; }
    if (o.capped) s.capped++;
    if (x > s.max) s.max = x;
    let b = 0; if (x > 0) { b = 1; while (b < edges.length && x >= edges[b]) b++; }
    s.buckets[b]++;
  }
  return s;
}
if (!isMainThread) {
  parentPort.postMessage(simChunk(workerData.seed, workerData.n, workerData.lines));
} else if (require.main !== module) {
  /* required as a library (tools/bookofbats-xcheck.js) */
} else if (process.argv.includes('--exact')) {
  exact();
} else {
  const total = +(process.argv[2] || 10000000), lines = +(process.argv[3] || 10);
  const threads = Math.max(1, Math.min(+(process.env.THREADS || 4), require('os').cpus().length));
  const t0 = Date.now();
  const per = Math.ceil(total / threads), jobs = [];
  for (let k = 0; k < threads; k++) jobs.push(new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { seed: 0x5eed0000 + k * 7919, n: per, lines } }); w.on('message', res); w.on('error', rej); }));
  Promise.all(jobs).then((parts) => {
    const s = parts.reduce((a, b) => { for (const k in a) { if (Array.isArray(a[k])) a[k] = a[k].map((v, i) => v + b[k][i]); else if (k === 'max') a[k] = Math.max(a[k], b[k]); else a[k] += b[k]; } return a; });
    const rtp = s.ret / s.n, sd = Math.sqrt(s.ret2 / s.n - rtp * rtp), se = sd / Math.sqrt(s.n);
    const pc = (v) => (v * 100).toFixed(3) + '%';
    console.log('Book of Bats: ' + s.n.toLocaleString('en-GB') + ' simulated spins on ' + lines + ' line' + (lines > 1 ? 's' : '') + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
    console.log('  RTP                   ' + pc(rtp) + '  (±' + (1.96 * se * 100).toFixed(3) + ' at 95%, sd ' + sd.toFixed(2) + 'x per spin)');
    console.log('    base line wins      ' + pc(s.base / s.n));
    console.log('    Book scatter pays   ' + pc(s.scat / s.n));
    console.log('    free spins          ' + pc(s.fs / s.n));
    console.log('  hit rate              1 in ' + (s.n / s.hits).toFixed(2) + ' (' + pc(s.hits / s.n) + ')');
    console.log('  free spins            1 in ' + (s.n / s.feats).toFixed(1) + ', avg ' + (s.fsSpins / s.feats).toFixed(2) + ' spins, avg win ' + (s.fs / s.feats).toFixed(2) + 'x, retriggers ' + s.retrig);
    console.log('  max win               ' + s.max.toFixed(2) + 'x stake; capped at 5,000x: ' + s.capped + ' times');
    console.log('  by first special (features, avg win x): ' + M.NAMES.slice(0, 9).map((nm, i) => nm + ' ' + s.specials[i] + '/' + (s.specialRet[i] / Math.max(1, s.specials[i])).toFixed(1) + 'x').join(', '));
    const lab = ['no win', '<1x', '1-2x', '2-5x', '5-10x', '10-25x', '25-100x', '100-500x', '500x+'];
    console.log('  win sizes             ' + lab.map((l, i) => l + ' 1 in ' + (s.buckets[i] ? (s.n / s.buckets[i]).toFixed(s.buckets[i] > s.n / 100 ? 2 : 0) : '-')).join(', '));
  });
}
module.exports = { exact, simChunk, loadMath };
