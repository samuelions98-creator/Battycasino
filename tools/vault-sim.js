#!/usr/bin/env node
/* Crimson Vault: Monte Carlo proof of the return.
   node tools/vault-sim.js [--spins 20000000] [--feat 2000000] [--workers 4] [--seed 1] [--quick] [--only=feat,base,buy0,buy1]
   Plays complete rounds with the shipped maths (games/vault/game.js, the part before the presentation marker) on seeded
   mulberry32 streams, one per worker:
     feat   each vault's free spins on their own, plain (a base trigger / the 100x buy) and as the Inside Job (the 300x buy)
     base   base spins at 1x stake, the vault picked by a policy: always the Safe, always the Box, always the Grand Vault,
            or at random (one run each; the random run is the headline figure)
     buy0   the 100x buy, each vault        buy1   the 300x Inside Job, each vault
   Prints return (as played, and for the base game with every feature replaced by its measured value), hit rate, feature
   frequency, standard deviation, win-size buckets, max win and how often the 50,000x cap was reached. */
'use strict';
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const MATH = process.env.VAULT_MATH || path.join(__dirname, '..', 'games', 'vault', 'game.js');
function loadMath(file) {
  const src = fs.readFileSync(file || MATH, 'utf8');
  const cut = src.indexOf('/* ===== vault ===== */');
  const mod = { exports: {} };
  new Function('module', 'globalThis', cut > 0 ? src.slice(0, cut) : src)(mod, {});
  return mod.exports;
}
module.exports = { loadMath };
if (require.main !== module && isMainThread) return;

const EDGES = [0, 1, 2, 5, 10, 25, 100, 1000, 10000];
if (!isMainThread) {
  const M = loadMath();
  const { kind, n, seed } = workerData;
  const rng = M.mulberry(seed);
  const st = { n: 0, cost: 0, won: 0, sq: 0, hits: 0, trig: 0, trigCarried: 0, baseWon: 0, modes: [0, 0, 0], max: 0, capped: 0, keys: [0, 0, 0, 0, 0, 0], retrig: 0, wilds: 0, fsPlayed: 0, maxLineM: 0, buckets: new Array(EDGES.length).fill(0) };
  /* kind: feat:<mode>:<inside>  base:<policy>  buy:<0|1>:<mode> */
  const [k0, a1, a2] = kind.split(':');
  const pol = k0 === 'base' ? a1 : null;
  let pickFn = null;
  if (pol === 'r') pickFn = () => Math.floor(rng() * 3) % 3;   // drawn from the same stream: a fair random pick
  else if (pol != null) { const m = +pol; pickFn = () => m; }
  for (let i = 0; i < n; i++) {
    let w, unitCost;
    if (k0 === 'feat') {
      const b = M.bonus(rng, +a1, { inside: a2 === '1' });
      w = b.total; unitCost = 1; st.trig++; st.modes[+a1]++;
      st.fsPlayed += b.spins.length; for (const s of b.spins) { if (s.add) st.retrig++; for (const x of s.wins) if (x.m > st.maxLineM) st.maxLineM = x.m; }
      st.wilds += b.spins.length ? b.spins[b.spins.length - 1].sticky.filter((v) => v).length : 0;
      if (b.capped) st.capped++;
    } else if (k0 === 'base') {
      /* the policy picks before the bonus is drawn, exactly as a player would */
      const base = M.spin(rng);
      st.keys[base.keys]++;
      w = base.pay; unitCost = 1; st.baseWon += base.pay;
      if (base.trigger) {
        const m = pickFn();
        st.trig++; st.modes[m]++; st.trigCarried += base.pay;
        const b = M.bonus(rng, m, { inside: false, carried: base.pay });
        w += b.total; if (b.capped) st.capped++;
      }
    } else {
      const buy = +a1, m = +a2;
      const b = M.bonus(rng, m, { inside: buy === 1 });
      w = b.total; unitCost = M.BUY_PRICE[buy]; st.trig++; st.modes[m]++;
      if (b.capped) st.capped++;
    }
    const x = w / M.UNITS;
    st.n++; st.cost += unitCost; st.won += w; st.sq += x * x; if (w > 0) st.hits++; if (w > st.max) st.max = w;
    let bk = -1; for (let e = EDGES.length - 1; e >= 0; e--) if (x > EDGES[e]) { bk = e; break; }
    if (bk >= 0) st.buckets[bk]++;
  }
  parentPort.postMessage(st);
  return;
}

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const quick = args.includes('--quick');
const SPINS = arg('spins', quick ? 2000000 : 20000000), FEAT = arg('feat', quick ? 200000 : 2000000);
const WORKERS = arg('workers', 4), SEED = arg('seed', 1);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const want = (k) => !only || only.split(',').includes(k);
const M = loadMath();

function run(kind, n, salt) {
  const per = Math.ceil(n / WORKERS), jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    const cnt = Math.max(0, Math.min(per, n - per * w));
    jobs.push(new Promise((res, rej) => {
      const wk = new Worker(__filename, { workerData: { kind, n: cnt, seed: (SEED * 1000003 + salt * 7919 + w * 104729) | 0 } });
      wk.on('message', res); wk.on('error', rej);
    }));
  }
  return Promise.all(jobs).then((parts) => parts.reduce((a, b) => {
    for (const k in b) {
      if (k === 'max' || k === 'maxLineM') a[k] = Math.max(a[k] || 0, b[k]);
      else if (Array.isArray(b[k])) a[k] = (a[k] || b[k].map(() => 0)).map((v, i) => v + b[k][i]);
      else a[k] = (a[k] || 0) + b[k];
    }
    return a;
  }, {}));
}
const pct = (x) => (x * 100).toFixed(3) + '%';
const one = (n, d) => (d ? '1 in ' + (n / d).toLocaleString('en-GB', { maximumFractionDigits: n / d < 100 ? 2 : 0 }) : 'never');
const L = ['(0,1]', '(1,2]', '(2,5]', '(5,10]', '(10,25]', '(25,100]', '(100,1000]', '(1000,10000]', '>10000'];
function report(name, t, unitCost, featEv) {
  const mean = t.won / M.UNITS / t.cost;
  const meanX = t.won / M.UNITS / t.n;
  const sd = Math.sqrt(Math.max(0, t.sq / t.n - meanX * meanX));
  const ci = 2.576 * sd / unitCost / Math.sqrt(t.n);
  console.log('\n[' + name + '] rounds ' + t.n.toLocaleString('en-GB'));
  console.log('  return (played) ' + pct(mean) + '  (99% band ' + pct(mean - ci) + ' to ' + pct(mean + ci) + ')');
  let exact = null;
  if (featEv != null) {
    exact = (t.baseWon + t.trig * featEv) / M.UNITS / t.cost;
    console.log('  return (features at their measured value ' + (featEv / M.UNITS).toFixed(2) + 'x) ' + pct(exact) + '   base spins alone ' + pct(t.baseWon / M.UNITS / t.cost) + ', features ' + pct(t.trig * featEv / M.UNITS / t.cost));
  }
  console.log('  hit rate        ' + one(t.n, t.hits) + ' (' + pct(t.hits / t.n) + ')');
  if (t.keys && t.keys.some((v) => v)) console.log('  keys            ' + t.keys.map((v, i) => i + ': ' + one(t.n, v)).join('  '));
  if (featEv != null || name.indexOf('base') >= 0) console.log('  feature         ' + one(t.n, t.trig) + '   vaults picked ' + t.modes.map((v, i) => M.MODES[i].key + ' ' + v).join(', '));
  console.log('  std deviation   ' + sd.toFixed(2) + 'x stake per round');
  console.log('  max win         ' + (t.max / M.UNITS).toFixed(2) + 'x stake; the ' + M.MAX_WIN_X.toLocaleString('en-GB') + 'x cap ' + t.capped + ' time(s) (' + one(t.n, t.capped) + ')');
  console.log('  wins (x stake)  ' + t.buckets.map((v, i) => L[i] + ' ' + (v ? one(t.n, v) : '-')).join(' | '));
  return { rtp: mean, exact, hit: t.n / t.hits, trig: t.trig ? t.n / t.trig : 0, sd, max: t.max / M.UNITS, capped: t.capped };
}
function reportFeat(name, t) {
  const ev = t.won / M.UNITS / t.n, sd = Math.sqrt(Math.max(0, t.sq / t.n - ev * ev)), ci = 2.576 * sd / Math.sqrt(t.n);
  console.log('  ' + name.padEnd(26) + ' EV ' + ev.toFixed(2) + 'x (±' + ci.toFixed(2) + ')  sd ' + sd.toFixed(1) + '  spins ' + (t.fsPlayed / t.n).toFixed(2) + '  retrig/bonus ' + (t.retrig / t.n).toFixed(3) +
    '  wilds at end ' + (t.wilds / t.n).toFixed(2) + '  top line x' + t.maxLineM + '  max ' + (t.max / M.UNITS).toFixed(0) + 'x  cap ' + one(t.n, t.capped) + '  >1000x ' + one(t.n, t.buckets[7] + t.buckets[8]) + '  <10x ' + one(t.n, t.n - t.buckets.slice(4).reduce((a, b) => a + b, 0)));
  return ev * M.UNITS;
}

(async () => {
  const t0 = Date.now();
  console.log('Crimson Vault simulation  (' + WORKERS + ' workers, seed ' + SEED + ')');
  const ev = [[0, 0], [0, 0], [0, 0]];
  if (want('feat')) {
    console.log('\n[each vault on its own] ' + FEAT.toLocaleString('en-GB') + ' runs each');
    for (let m = 0; m < 3; m++) for (const ins of [0, 1]) ev[m][ins] = reportFeat(M.MODES[m].name + (ins ? ' (Inside Job)' : ''), await run('feat:' + m + ':' + ins, FEAT, 10 + m * 2 + ins));
    console.log('  plain: ' + ev.map((e, m) => M.MODES[m].key + ' ' + (e[0] / M.UNITS).toFixed(2) + 'x').join(', ') + '   (100x buy RTP ' + ev.map((e) => pct(e[0] / M.UNITS / 100)).join(' / ') + ')');
    console.log('  inside: ' + ev.map((e, m) => M.MODES[m].key + ' ' + (e[1] / M.UNITS).toFixed(2) + 'x').join(', ') + '   (300x buy RTP ' + ev.map((e) => pct(e[1] / M.UNITS / 300)).join(' / ') + ')');
  }
  const avgEv = want('feat') ? (ev[0][0] + ev[1][0] + ev[2][0]) / 3 : M.FEATURE_EV;
  if (want('base')) {
    for (const p of ['r', '0', '1', '2']) {
      const nm = p === 'r' ? 'base game, vault picked at random' : 'base game, always ' + M.MODES[+p].name;
      const n = p === 'r' ? SPINS : Math.round(SPINS / 2);
      report(nm, await run('base:' + p, n, 20 + (p === 'r' ? 9 : +p)), 1, p === 'r' ? avgEv : (want('feat') ? ev[+p][0] : null));
    }
  }
  for (const buy of [0, 1]) {
    if (!want('buy' + buy)) continue;
    for (let m = 0; m < 3; m++) report((buy ? 'Inside Job 300x' : 'vault buy 100x') + ', ' + M.MODES[m].name, await run('buy:' + buy + ':' + m, FEAT, 40 + buy * 3 + m), M.BUY_PRICE[buy], null);
  }
  console.log('\ndone in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
})();
