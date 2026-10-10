#!/usr/bin/env node
/* Count Batula's Crypt: Monte Carlo proof of the return.
   node tools/crypt-sim.js [--spins 10000000] [--buys 10000000] [--fs 400000] [--workers 4] [--seed 1] [--quick]
   Plays complete rounds with the shipped maths (games/crypt/game.js) on seeded mulberry32 streams, one per worker:
     base   normal spins at 1x stake (free spins taken as awarded, no gamble)
     ante   spins with the ante bet (1.25x stake)
     gamble normal spins that always gamble the wheel to the top (shows the gamble does not move the return)
     buy    bonus buys at BUY_X (56x) stake
     fsN    n free spins on their own, for n = 12, 16, 20, 24, 28 (the gamble wheel's fair odds come from these)
   Prints return, hit rate, free-spin frequency, standard deviation (volatility), max win and a 99% confidence band. */
'use strict';
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const MATH = process.env.CRYPT_MATH || path.join(__dirname, '..', 'games', 'crypt', 'game.js');
/* the maths is the part of game.js before the presentation marker, so this runs the exact code the browser runs */
function loadMath(file) {
  const src = fs.readFileSync(file || MATH, 'utf8');
  const cut = src.indexOf('/* ===== crypt ===== */');
  const mod = { exports: {} };
  new Function('module', 'globalThis', cut > 0 ? src.slice(0, cut) : src)(mod, {});
  return mod.exports;
}
module.exports = { loadMath };
if (require.main !== module && isMainThread) return;

if (!isMainThread) {
  const M = loadMath();
  const { kind, n, seed } = workerData;
  const rng = M.mulberry(seed);
  const st = { trig: {}, baseWon: 0, n: 0, cost: 0, won: 0, sq: 0, hits: 0, fs: 0, fsSpins: 0, max: 0, capped: 0, casc: 0, retrig: 0, maxMult: 0, gw: 0, gl: 0, buckets: new Array(9).fill(0) };
  const EDGES = [0, 1, 2, 5, 10, 25, 100, 1000, 5000];
  const unitCost = kind === 'ante' ? 1.25 : kind === 'buy' ? M.BUY_X : 1;
  const fsN = kind.startsWith('fs') ? +kind.slice(2) : 0;
  const policy = kind === 'gamble' ? () => true : null;
  for (let i = 0; i < n; i++) {
    let w, x;
    if (fsN) { const f = M.freeSpins(rng, fsN, 0); w = f.total; st.retrig += f.retrigs; if (f.maxMult > st.maxMult) st.maxMult = f.maxMult; if (f.capped) st.capped++; st.fsSpins += f.played; st.cost += 0; x = w / M.UNITS; }
    else {
      const r = M.round(rng, { ante: kind === 'ante', buy: kind === 'buy', policy });
      w = r.win; x = w / M.UNITS; st.cost += unitCost; st.baseWon += r.base.win;
      if (r.base.fs) st.trig[r.base.fs] = (st.trig[r.base.fs] || 0) + 1;
      st.casc += r.base.steps.length - 1;
      if (r.base.fs) st.fs++;
      for (const g of r.gambles) { if (g) st.gw++; else st.gl++; }
      if (r.fs) { st.fsSpins += r.fs.played; st.retrig += r.fs.retrigs; if (r.fs.maxMult > st.maxMult) st.maxMult = r.fs.maxMult; }
      if (r.base.capped || (r.fs && r.fs.capped)) st.capped++;
    }
    st.n++; st.won += w; st.sq += x * x; if (w > 0) st.hits++; if (w > st.max) st.max = w;
    let b = 0; for (let k = EDGES.length - 1; k >= 0; k--) if (x > EDGES[k] || (k === 0 && x > 0)) { b = k + 1; break; }
    if (b) st.buckets[b - 1]++;
  }
  parentPort.postMessage(st);
  return;
}

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const quick = args.includes('--quick');
const SPINS = arg('spins', quick ? 1000000 : 10000000), BUYS = arg('buys', quick ? 100000 : 10000000), FSR = arg('fs', quick ? 40000 : 400000);
const WORKERS = arg('workers', 4), SEED = arg('seed', 1);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const M = loadMath();

function run(kind, n, salt) {
  const per = Math.ceil(n / WORKERS), jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    jobs.push(new Promise((res, rej) => {
      const wk = new Worker(__filename, { workerData: { kind, n: Math.min(per, n - per * w), seed: (SEED * 1000003 + salt * 7919 + w * 104729) | 0 } });
      wk.on('message', res); wk.on('error', rej);
    }));
  }
  return Promise.all(jobs).then((parts) => {
    const t = parts.reduce((a, b) => { for (const k in b) { if (k === 'max' || k === 'maxMult') a[k] = Math.max(a[k] || 0, b[k]); else if (k === 'trig') { a[k] = a[k] || {}; for (const j in b[k]) a[k][j] = (a[k][j] || 0) + b[k][j]; } else if (k === 'buckets') a[k] = (a[k] || new Array(9).fill(0)).map((v, i) => v + b[k][i]); else a[k] = (a[k] || 0) + b[k]; } return a; }, {});
    return t;
  });
}
const pct = (x) => (x * 100).toFixed(3) + '%';
function report(name, t, unitCost, ev) {
  const mean = t.won / M.UNITS / t.cost;            // return per BB staked
  const meanX = t.won / M.UNITS / t.n;              // per round, in stakes
  const sd = Math.sqrt(Math.max(0, t.sq / t.n - meanX * meanX));
  const ci = 2.576 * sd / unitCost / Math.sqrt(t.n);
  console.log('\n[' + name + '] rounds ' + t.n.toLocaleString('en-GB'));
  console.log('  return (played) ' + pct(mean) + '  (99% band ' + pct(mean - ci) + ' to ' + pct(mean + ci) + ')');
  let comp = null;
  if (ev) {
    /* variance-reduced: every base drop as played, each free-spin award replaced by the measured value of that many spins */
    let fsv = 0, miss = 0;
    for (const n in t.trig) { if (ev[n] == null) { miss += t.trig[n]; continue; } fsv += t.trig[n] * ev[n]; }
    comp = (t.baseWon / M.UNITS + fsv) / t.cost;
    console.log('  return (exact free-spin values) ' + pct(comp) + (miss ? '  [' + miss + ' awards beyond the table]' : '') + '   base drops alone ' + pct(t.baseWon / M.UNITS / t.cost));
  }
  console.log('  hit rate        1 in ' + (t.n / t.hits).toFixed(2) + ' (' + pct(t.hits / t.n) + ')');
  if (t.fs) console.log('  free spins      1 in ' + (t.n / t.fs).toFixed(1) + ' rounds, avg ' + (t.fsSpins / Math.max(1, t.fs - t.gl)).toFixed(2) + ' spins played, retriggers ' + (t.retrig / t.fs).toFixed(3) + ' per bonus');
  if (t.gw + t.gl) console.log('  gamble          won ' + t.gw + ', lost ' + t.gl + ' (' + pct(t.gw / (t.gw + t.gl)) + ')');
  console.log('  cascades/spin   ' + (t.casc / t.n).toFixed(3) + '   top multiplier seen x' + t.maxMult);
  console.log('  std deviation   ' + sd.toFixed(2) + 'x stake per round');
  console.log('  max win         ' + (t.max / M.UNITS).toFixed(2) + 'x stake, capped ' + t.capped + ' time(s)');
  const L = ['(0,1]', '(1,2]', '(2,5]', '(5,10]', '(10,25]', '(25,100]', '(100,1000]', '(1000,5000]', '>5000'];
  console.log('  wins (x stake)  ' + t.buckets.map((v, i) => L[i] + ' ' + (v ? '1 in ' + Math.round(t.n / v).toLocaleString('en-GB') : '-')).join(' | '));
  return { rtp: mean, comp, hit: t.n / t.hits, fs: t.fs ? t.n / t.fs : 0, sd };
}
function reportFS(n, t) {
  const ev = t.won / M.UNITS / t.n, sd = Math.sqrt(Math.max(0, t.sq / t.n - ev * ev)), ci = 2.576 * sd / Math.sqrt(t.n);
  console.log('  fs' + n + '  EV ' + ev.toFixed(2) + 'x (±' + ci.toFixed(2) + ')  sd ' + sd.toFixed(1) + '  retriggers ' + (t.retrig / t.n).toFixed(3) + '  played ' + (t.fsSpins / t.n).toFixed(2) + '  top mult x' + t.maxMult + '  max ' + (t.max / M.UNITS).toFixed(0) + 'x');
  return ev;
}

(async () => {
  const t0 = Date.now();
  console.log("Count Batula's Crypt simulation  (" + WORKERS + ' workers, seed ' + SEED + ')');
  const want = (k) => !only || only.split(',').includes(k);
  const res = {}, ev = {};
  if (want('fs')) {
    console.log('\n[free spins on their own] ' + FSR.toLocaleString('en-GB') + ' runs each (fewer for 32+)');
    for (const n of [12, 16, 20, 24, 28, 32, 36, 40, 44]) ev[n] = reportFS(n, await run('fs' + n, n <= 28 ? FSR : Math.max(2000, Math.round(FSR / 10)), 10 + n));
    console.log('  fair gamble odds: ' + [12, 16, 20, 24].map((n) => n + '->' + (n + 4) + ' ' + (ev[n] / ev[n + 4]).toFixed(4)).join('  '));
  }
  const E = want('fs') ? ev : null;
  if (want('base')) res.base = report('base game, 1x stake', await run('base', SPINS, 1), 1, E);
  if (want('ante')) res.ante = report('ante bet, 1.25x stake', await run('ante', SPINS, 2), 1.25, E);
  if (want('buy')) res.buy = report('bonus buy, ' + M.BUY_X + 'x stake', await run('buy', BUYS, 4), M.BUY_X, E);
  if (want('gamble')) res.gamble = report('always gamble to the top', await run('gamble', Math.round(SPINS / 2), 3), 1, null);
  console.log('\ndone in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
})();
