/* Batty Circus: RTP simulation of the real round machine (games/circus/math.js, the same code the server ports).
   Usage:
     node tools/circus-sim.js all [baseSpins] [perBuy] [perAct]   everything (default 10,000,000 / 1,000,000 / 1,000,000)
     node tools/circus-sim.js base N        base game only, full rounds with bonuses (optimal re-fire)
     node tools/circus-sim.js acts N        each act on its own (x stake), plus the board values
     node tools/circus-sim.js buy N         both bonus buys
   Player strategy: picks are random (every pick is worth the same on average by design). At the cannon the player
   re-fires when the shot is worth less than an average shot ("best"), and the sim also reports "never re-fire" and
   "always re-fire". Seeded, so runs repeat exactly. */
'use strict';
const M = require('../games/circus/math.js');
const U = M.U;

function strategyRng(seed) { return M.mulberry32(seed ^ 0x5bd1e995); }

/* Play one whole round. policy: 'best' | 'never' | 'always'. Returns { win (units), bonus, shot, acts } */
function playRound(rng, prng, buy, policy, tally) {
  let s = M.start(rng, buy || null);
  const mode = buy || 'base';
  const avg = M.shotEV(mode);
  let guard = 0;
  while (s.phase !== 'done') {
    if (++guard > 500) throw new Error('runaway round');
    const p = s.phase;
    if (p === 'cannon') s = M.step(s, 'fire', null, rng);
    else if (p === 'decide') {
      const shot = s.shots[s.shots.length - 1];
      const retry = policy === 'always' || (policy === 'best' && M.shotValueEV(shot) < avg);
      s = M.step(s, retry ? 'retry' : 'collect', null, rng);
    } else if (p === 'strong' || p === 'bear' || p === 'jester') s = M.step(s, 'pick', Math.floor(prng() * 3), rng);
    else if (p === 'fire') { const left = []; for (let t = 0; t < M.FIRE_TORCHES; t++) if (s.act.picked.indexOf(t) < 0) left.push(t); s = M.step(s, 'pick', left[Math.floor(prng() * left.length)], rng); }
    else if (p === 'elephant') s = M.step(s, 'spin', null, rng);
  }
  if (tally) { for (const d of s.done) { tally[d.id] = (tally[d.id] || 0) + d.win; tally[d.id + 'N'] = (tally[d.id + 'N'] || 0) + 1; } }
  return s;
}

function runBase(N, seed, policy) {
  const rng = M.mulberry32(seed), prng = strategyRng(seed);
  let won = 0, hits = 0, bonus = 0, bonusWin = 0, baseWin = 0, max = 0, capped = 0, sq = 0;
  for (let i = 0; i < N; i++) {
    const b = M.spinBase(rng);
    let w = b.pay;
    if (b.bonus) {
      /* replay the identical spin through the machine so the bonus is played exactly as the server would */
      const s = { v: 1, buy: null, rev: 0, total: 0, capped: false, base: b, phase: 'cannon', shots: [], retried: false, queue: [], act: null, done: [], ev: {} };
      s.total = Math.min(M.CAP, b.pay);
      let st = s, guard = 0; const avg = M.shotEV('base');
      while (st.phase !== 'done') {
        if (++guard > 500) throw new Error('runaway');
        const p = st.phase;
        if (p === 'cannon') st = M.step(st, 'fire', null, rng);
        else if (p === 'decide') { const shot = st.shots[st.shots.length - 1]; const retry = policy === 'always' || (policy === 'best' && M.shotValueEV(shot) < avg); st = M.step(st, retry ? 'retry' : 'collect', null, rng); }
        else if (p === 'strong' || p === 'bear' || p === 'jester') st = M.step(st, 'pick', Math.floor(prng() * 3), rng);
        else if (p === 'fire') { const left = []; for (let t = 0; t < 12; t++) if (st.act.picked.indexOf(t) < 0) left.push(t); st = M.step(st, 'pick', left[Math.floor(prng() * left.length)], rng); }
        else st = M.step(st, 'spin', null, rng);
      }
      w = st.total; bonus++; bonusWin += w - b.pay; if (st.capped) capped++;
    }
    baseWin += b.pay;
    won += w; sq += (w / U) * (w / U);
    if (w > 0) hits++;
    if (w > max) max = w;
  }
  const mean = won / U / N;
  return { N, rtp: won / U / N, baseRtp: baseWin / U / N, bonusRtp: bonusWin / U / N, hit: hits / N, bonusRate: bonus / N, avgBonus: bonus ? bonusWin / U / bonus : 0, max: max / U, capped, sd: Math.sqrt(sq / N - mean * mean) };
}

function runActs(N, seed) {
  const out = {};
  M.ACTS.forEach((id, a) => {
    const rng = M.mulberry32(seed + a * 101), prng = strategyRng(seed + a);
    let tot = 0, max = 0, sq = 0;
    for (let i = 0; i < N; i++) {
      let s = { v: 1, buy: null, rev: 0, total: 0, capped: false, base: null, phase: 'cannon', shots: [], retried: true, queue: [], act: null, done: [], ev: {} };
      /* jump straight into the act */
      s.queue = [a]; s.phase = 'x';
      s = Object.assign(s, {}); const st0 = JSON.parse(JSON.stringify(s));
      /* use the machine's own act start */
      let st = M.step(Object.assign(st0, { phase: 'decide', retried: false, shots: [{ seg: 1, acts: [a] }] }), 'collect', null, rng);
      let guard = 0;
      while (st.phase !== 'done') {
        if (++guard > 500) throw new Error('runaway');
        const p = st.phase;
        if (p === 'strong' || p === 'bear' || p === 'jester') st = M.step(st, 'pick', Math.floor(prng() * 3), rng);
        else if (p === 'fire') { const left = []; for (let t = 0; t < 12; t++) if (st.act.picked.indexOf(t) < 0) left.push(t); st = M.step(st, 'pick', left[Math.floor(prng() * left.length)], rng); }
        else st = M.step(st, 'spin', null, rng);
      }
      const w = st.total / U; tot += w; sq += w * w; if (w > max) max = w;
    }
    const m = tot / N;
    out[id] = { ev: m, max, sd: Math.sqrt(sq / N - m * m) };
  });
  return out;
}

function runBuy(buy, N, seed, policy) {
  const rng = M.mulberry32(seed), prng = strategyRng(seed);
  let won = 0, max = 0, sq = 0;
  for (let i = 0; i < N; i++) { const s = playRound(rng, prng, buy, policy); const w = s.total / U; won += w; sq += w * w; if (w > max) max = w; }
  const m = won / N;
  return { N, ev: m, price: M.BUYS[buy], rtp: m / M.BUYS[buy], max, sd: Math.sqrt(sq / N - m * m) };
}

const pct = (x) => (x * 100).toFixed(3) + '%';
const cmd = process.argv[2] || 'all';
const t0 = Date.now();
if (cmd === 'acts' || cmd === 'all') {
  const N = +(process.argv[cmd === 'all' ? 5 : 3] || 1e6);
  const r = runActs(N, 777);
  console.log('ACTS (' + N.toLocaleString() + ' each, x stake):');
  for (const k in r) console.log('  ' + k.padEnd(9) + ' avg ' + r[k].ev.toFixed(3) + '  sd ' + r[k].sd.toFixed(1) + '  max ' + r[k].max.toFixed(1));
  console.log('  ACT_EV now in math.js: ' + JSON.stringify(M.ACT_EV) + '   measured: ' + JSON.stringify(M.ACTS.map((k) => Math.round(r[k].ev * 10) / 10)));
  for (const mode of ['base', 'grand', 'spotlight']) console.log('  board ' + mode.padEnd(9) + ' average shot ' + M.shotEV(mode).toFixed(2) + 'x');
}
if (cmd === 'base' || cmd === 'all') {
  const N = +(process.argv[3] || 1e7);
  for (const pol of ['best', 'never', 'always']) {
    if (pol !== 'best' && cmd === 'all' && N > 2e6) { const r = runBase(Math.min(N, 4e6), 4242, pol); console.log('BASE GAME, ' + pol + ' re-fire (' + r.N.toLocaleString() + ' spins): RTP ' + pct(r.rtp)); continue; }
    const r = runBase(N, 4242, pol);
    console.log('BASE GAME, ' + pol + ' re-fire (' + N.toLocaleString() + ' spins): RTP ' + pct(r.rtp) + '  (lines ' + pct(r.baseRtp) + ', bonus ' + pct(r.bonusRtp) + ')');
    if (pol === 'best') console.log('  hit rate 1 in ' + (1 / r.hit).toFixed(2) + ', bonus 1 in ' + (1 / r.bonusRate).toFixed(1) + ', average bonus ' + r.avgBonus.toFixed(2) + 'x, max ' + r.max.toFixed(1) + 'x, capped ' + r.capped + ', sd ' + r.sd.toFixed(2));
  }
}
if (cmd === 'buy' || cmd === 'all') {
  const N = +(process.argv[cmd === 'all' ? 4 : 3] || 1e6);
  for (const b of ['grand', 'spotlight']) for (const pol of ['best', 'never']) {
    const r = runBuy(b, pol === 'best' ? N : Math.ceil(N / 4), 9000 + b.length, pol);
    console.log('BUY ' + b.toUpperCase() + ' at ' + r.price + 'x, ' + pol + ' re-fire (' + r.N.toLocaleString() + '): average ' + r.ev.toFixed(2) + 'x, RTP ' + pct(r.rtp) + ', max ' + r.max.toFixed(1) + 'x');
  }
}
console.log('(' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
module.exports = { playRound };
