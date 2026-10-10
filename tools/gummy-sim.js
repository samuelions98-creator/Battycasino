#!/usr/bin/env node
/* Gummy Bats — RTP simulation. Runs the real maths from games/gummy/game.js (the "gummy math" block, loaded verbatim).

   node tools/gummy-sim.js [base|buy|super|all] [rounds] [threads] [seed]
     base   paid spins (default 10,000,000)          buy / super   bought free spins (default 10,000,000 each)
     all    base, then buy, then super

   Each round is drawn from a mulberry32 stream (seed + worker index), so every run is reproducible.
   Output per mode: RTP with its standard error and a 95% interval, hit rate, the free-spins trigger rate, the average
   feature by award, the largest win seen and how often the 25,000x cap was reached.

   For the base game it also prints a DECOMPOSED estimate: the cluster RTP of the paid spins (low variance, from the same
   run) plus P(award) x E[free spins | award], with E[free spins | award] measured on the bought features (the feature is
   identical whatever started it). The free spins are rare and very swingy, so this second figure has a far smaller error
   than the raw base figure, and the two must agree within their errors.

   OV='{"W":{...},"PAY":[...]}' overrides tables (tuning only; the published figures come from runs without it). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

function loadMath() {
  const src = fs.readFileSync(process.env.GUMMY_SRC || path.join(__dirname, '..', 'games', 'gummy', 'game.js'), 'utf8');
  const a = src.indexOf('/* ===== gummy math ===== */'), b = src.indexOf('/* ===== gummy ===== */');
  if (a < 0 || b < 0) throw new Error('gummy math block not found');
  const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(src.slice(a, b), ctx);
  const M = ctx.module.exports;
  if (process.env.OV) {
    const C = JSON.parse(process.env.OV);
    if (C.PAY) C.PAY.forEach((r, i) => r.forEach((v, j) => { M.PAY[i][j] = v; }));
    if (C.W) for (const k in C.W) C.W[k].forEach((v, i) => { if (v != null) M.W[k][i] = v; });
    if (C.BUY_MOONS) C.BUY_MOONS.forEach((v, i) => { M.BUY_MOONS[i] = v; });
  }
  return M;
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* the win bands of the distribution table, in x stake */
const BANDS = [0, 0.000001, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];

function newStats() {
  return { n: 0, cost: 0, won: 0, sq: 0, hits: 0, cluster: 0, clusterSq: 0, tumbles: 0, trig: 0, max: 0, capped: 0, maxSpot: 0, bands: new Array(BANDS.length).fill(0),
    fsByAward: {}, fsSpins: 0, retrig: 0, wildSeen: 0 };
}
function runChunk(mode, n, seed) {
  const M = loadMath(), rng = mulberry32(seed), st = newStats(), U = M.UNITS_PER_STAKE;
  for (let i = 0; i < n; i++) {
    const o = M.play(rng, mode);
    const x = o.totalWin / o.cost;
    st.n++; st.cost += o.cost; st.won += o.totalWin; st.sq += x * x;
    if (o.totalWin > 0) st.hits++;
    st.cluster += o.spin.tw; st.clusterSq += (o.spin.tw / o.cost) ** 2; st.tumbles += o.spin.steps.length;
    if (o.totalWin > st.max) st.max = o.totalWin;
    if (o.capped) st.capped++;
    const xs = o.totalWin / U; let b = 0; while (b + 1 < BANDS.length && xs >= BANDS[b + 1]) b++; st.bands[b]++;
    if (o.fs) {
      st.trig++; st.fsSpins += o.fs.spins.length; st.retrig += o.fs.retriggers;
      const k = o.fs.award, f = st.fsByAward[k] || (st.fsByAward[k] = { n: 0, sum: 0, sq: 0 });
      const fx = o.fs.total / U; f.n++; f.sum += fx; f.sq += fx * fx;
      const last = o.fs.spins[o.fs.spins.length - 1].spots;
      for (let c = 0; c < last.length; c++) if (last[c] > st.maxSpot) st.maxSpot = last[c];
    }
  }
  return st;
}
function merge(a, b) {
  for (const k of ['n', 'cost', 'won', 'sq', 'hits', 'cluster', 'clusterSq', 'tumbles', 'trig', 'capped', 'fsSpins', 'retrig']) a[k] += b[k];
  a.max = Math.max(a.max, b.max); a.maxSpot = Math.max(a.maxSpot, b.maxSpot);
  b.bands.forEach((v, i) => { a.bands[i] += v; });
  for (const k in b.fsByAward) { const f = a.fsByAward[k] || (a.fsByAward[k] = { n: 0, sum: 0, sq: 0 }), g = b.fsByAward[k]; f.n += g.n; f.sum += g.sum; f.sq += g.sq; }
  return a;
}

if (!isMainThread) {
  parentPort.postMessage(runChunk(workerData.mode, workerData.n, workerData.seed));
} else {
  const want = process.argv[2] || 'all', N = +(process.argv[3] || 10000000), T = +(process.argv[4] || Math.max(1, require('os').cpus().length - 1)), seed0 = +(process.argv[5] || 20261009);
  const M = loadMath(), U = M.UNITS_PER_STAKE;
  const f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3), nf = (v) => Math.round(v).toLocaleString('en-GB');
  async function run(mode) {
    const t0 = Date.now(), per = Math.ceil(N / T), jobs = [];
    for (let w = 0; w < T; w++) {
      const n = Math.min(per, N - per * w); if (n <= 0) break;
      jobs.push(new Promise((res, rej) => { const wk = new Worker(__filename, { workerData: { mode, n, seed: (seed0 + w * 7919 + (mode === 'buy' ? 1e6 : mode === 'super' ? 2e6 : 0)) | 0 } }); wk.on('message', res); wk.on('error', rej); }));
    }
    const parts = await Promise.all(jobs), st = parts.reduce(merge, newStats());
    const mu = st.won / st.cost, sd = Math.sqrt(st.sq / st.n - mu * mu), se = sd / Math.sqrt(st.n);
    const price = M.costOf(mode) / U;
    console.log('\n=== ' + mode.toUpperCase() + ' (' + (mode === 'base' ? '1x' : price + 'x') + ' stake) — ' + nf(st.n) + ' rounds, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's, seed ' + seed0 + ' ===');
    console.log('RTP            ' + f3(mu * 100) + '%   (standard error ' + f3(se * 100) + ', 95% interval ' + f2((mu - 1.96 * se) * 100) + '–' + f2((mu + 1.96 * se) * 100) + '%)');
    console.log('  from clusters on the paid spin  ' + f3(st.cluster / st.cost * 100) + '%');
    console.log('  from free spins                 ' + f3((st.won - st.cluster) / st.cost * 100) + '%');
    console.log('Hit rate       1 in ' + f2(st.n / st.hits) + ' (' + f2(st.hits / st.n * 100) + '%)    tumbles per paid spin ' + f3(st.tumbles / st.n));
    if (st.trig) console.log('Free spins     1 in ' + f2(st.n / st.trig) + '   average ' + f2(st.fsSpins / st.trig) + ' spins, ' + f3(st.retrig / st.trig) + ' retriggers each, biggest spot seen x' + st.maxSpot);
    const fsAll = Object.values(st.fsByAward).reduce((a, f) => ({ n: a.n + f.n, sum: a.sum + f.sum }), { n: 0, sum: 0 });
    if (fsAll.n) console.log('Feature avg    ' + f2(fsAll.sum / fsAll.n) + 'x stake');
    for (const k of Object.keys(st.fsByAward).sort((a, b) => a - b)) { const f = st.fsByAward[k], m = f.sum / f.n; console.log('  award ' + String(k).padStart(2) + ' spins: ' + nf(f.n).padStart(10) + ' features, avg ' + f2(m).padStart(8) + 'x, sd ' + f2(Math.sqrt(Math.max(0, f.sq / f.n - m * m)))); }
    console.log('Max win seen   ' + f2(st.max / U) + 'x stake    capped at 25,000x: ' + nf(st.capped) + (st.capped ? ' (1 in ' + nf(st.n / st.capped) + ')' : ''));
    console.log('Win distribution (x stake):');
    for (let b = 0; b < BANDS.length; b++) {
      const lo = BANDS[b], hi = BANDS[b + 1];
      const lab = b === 0 ? 'no win' : (lo < 1 ? '<1' : lo) + (hi ? '–' + hi : '+');
      if (st.bands[b]) console.log('  ' + lab.padEnd(12) + (st.bands[b] / st.n * 100).toFixed(4).padStart(9) + '%   1 in ' + nf(st.n / st.bands[b]));
    }
    return { mode, st, mu, se };
  }
  (async () => {
    const modes = want === 'all' ? ['base', 'buy', 'super'] : [want];
    const res = {};
    for (const m of modes) res[m] = await run(m);
    if (res.base && res.buy) {
      /* decomposed base RTP: cluster part from the base run, feature part from P(award) x E[feature | award] measured on buys */
      const b = res.base.st, y = res.buy.st;
      const cl = b.cluster / b.cost, clSe = Math.sqrt(Math.max(0, b.clusterSq / b.n - cl * cl)) / Math.sqrt(b.n);
      let fsPart = 0, fsVar = 0;
      for (const k in b.fsByAward) {
        const p = b.fsByAward[k].n / b.n, f = y.fsByAward[k] || b.fsByAward[k];
        const m = f.sum / f.n, v = Math.max(0, f.sq / f.n - m * m) / f.n;
        fsPart += p * m; fsVar += p * p * v + m * m * p * (1 - p) / b.n;
      }
      const est = cl + fsPart, se = Math.sqrt(clSe * clSe + fsVar);
      console.log('\n=== BASE, decomposed ===');
      console.log('cluster ' + f3(cl * 100) + '% + free spins ' + f3(fsPart * 100) + '% = ' + f3(est * 100) + '%   (standard error ' + f3(se * 100) + ', 95% interval ' + f2((est - 1.96 * se) * 100) + '–' + f2((est + 1.96 * se) * 100) + '%)');
    }
  })();
}
