/* Velvet Baccarat: exact house edge of every bet, plus a long simulation of the real table (persisted 8-deck shoe,
   cut card, burn) as a cross-check.
   Usage: node tools/baccarat-sim.js [hands=10000000] [seed=20261009]

   1. Exact: every Punto Banco hand from a full 8-deck shoe, enumerated card value by card value with the exact
      without-replacement probabilities (10 value classes: 128 zero-value cards, 32 of each of ace..nine). Pairs depend
      on rank, so they are exact in closed form: the chance a side's first two cards share a rank is 31/415.
   2. Simulated: the table exactly as the server runs it (BattyMath.baccarat.newShoe/deal/settle), one unit on every
      bet every hand, with mulberry32. Shows that dealing deep into a persisted shoe barely moves the edges. */
'use strict';
/* the maths is the part of game.js before the presentation marker: the exact code the browser runs */
const M = (() => { const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'games', 'baccarat', 'game.js'), 'utf8'), cut = src.indexOf('/* ===== baccarat ===== */'), mod = { exports: {} }; new Function('module', 'globalThis', cut > 0 ? src.slice(0, cut) : src)(mod, {}); return mod.exports; })();

const N = 416, CNT = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];

function exact() {
  const cnt = CNT.slice(); let left = N;
  const acc = { P: 0, B: 0, T: 0, PD: 0, BD: 0, hitP: 0, hitB: 0, hitT: 0, hitPD: 0, hitBD: 0, pushPD: 0, pushBD: 0, nat: 0, p3: 0, b3: 0, prob: 0 };
  const take = (v) => { const pr = cnt[v] / left; cnt[v]--; left--; return pr; };
  const put = (v) => { cnt[v]++; left++; };
  function finish(p, b, pr) {
    const h = M.facts(p, b);
    acc.prob += pr;
    if (h.res === 'P') { acc.P += 2 * pr; acc.hitP += pr; }
    else if (h.res === 'B') { acc.B += 1.95 * pr; acc.hitB += pr; }
    else { acc.P += pr; acc.B += pr; acc.T += 9 * pr; acc.hitT += pr; }
    const dp = M.dragon(h, 'P'), db = M.dragon(h, 'B');
    acc.PD += dp * pr; acc.BD += db * pr;
    if (dp > 1) acc.hitPD += pr; if (db > 1) acc.hitBD += pr;
    if (dp === 1) acc.pushPD += pr; if (db === 1) acc.pushBD += pr;
    if (p.length === 2 && b.length === 2 && Math.max(h.pt, h.bt) >= 8) acc.nat += pr;
    if (p.length === 3) acc.p3 += pr; if (b.length === 3) acc.b3 += pr;
  }
  /* value v stands in for a card: use v itself for 1..9 and 9 (a ten) for 0, so M.val() reads it right */
  const card = (v) => (v === 0 ? 9 : v - 1);
  for (let a = 0; a < 10; a++) { const pa = take(a);
    for (let b1 = 0; b1 < 10; b1++) { if (!cnt[b1]) continue; const pb = take(b1);
      for (let c = 0; c < 10; c++) { if (!cnt[c]) continue; const pc = take(c);
        for (let d = 0; d < 10; d++) { if (!cnt[d]) continue; const pd = take(d);
          const pr4 = pa * pb * pc * pd;
          const P = [card(a), card(c)], B = [card(b1), card(d)];
          const pt = (a + c) % 10, bt = (b1 + d) % 10;
          if (pt >= 8 || bt >= 8) finish(P, B, pr4);
          else if (pt <= 5) {
            for (let e = 0; e < 10; e++) { if (!cnt[e]) continue; const pe = take(e);
              const h = M.deal([P[0], B[0], P[1], B[1], card(e), 0], 0);
              if (h.b.length === 3) {
                for (let f = 0; f < 10; f++) { if (!cnt[f]) continue; const pf = take(f); finish([P[0], P[1], card(e)], [B[0], B[1], card(f)], pr4 * pe * pf); put(f); }
              } else finish([P[0], P[1], card(e)], B, pr4 * pe);
              put(e);
            }
          } else if (bt <= 5) {
            for (let f = 0; f < 10; f++) { if (!cnt[f]) continue; const pf = take(f); finish(P, [B[0], B[1], card(f)], pr4 * pf); put(f); }
          } else finish(P, B, pr4);
          put(d); }
        put(c); }
      put(b1); }
    put(a); }
  const pair = 31 / 415;
  return {
    total: acc.prob,
    P: { rtp: acc.P, hit: acc.hitP, push: acc.hitT }, B: { rtp: acc.B, hit: acc.hitB, push: acc.hitT }, T: { rtp: acc.T, hit: acc.hitT, push: 0 },
    PP: { rtp: 12 * pair, hit: pair, push: 0 }, BP: { rtp: 12 * pair, hit: pair, push: 0 },
    PD: { rtp: acc.PD, hit: acc.hitPD, push: acc.pushPD }, BD: { rtp: acc.BD, hit: acc.hitBD, push: acc.pushBD },
    natural: acc.nat, playerDraws: acc.p3, bankerDraws: acc.b3,
  };
}

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function simulate(hands, seed) {
  const rng = mulberry32(seed);
  const unit = 1000, bets = {}; for (const k of M.SPOTS) bets[k] = unit;
  const ret = {}, hit = {}; for (const k of M.SPOTS) { ret[k] = 0; hit[k] = 0; }
  let shoe = M.newShoe(rng), shoes = 1, maxCards = 0, cardsDealt = 0;
  for (let n = 0; n < hands; n++) {
    if (shoe.pos >= shoe.cut) { shoe = M.newShoe(rng); shoes++; }
    const h = M.deal(shoe.cards, shoe.pos);
    cardsDealt += h.pos - shoe.pos; shoe.pos = h.pos; if (h.pos > maxCards) maxCards = h.pos;
    const by = M.settle(bets, h).by;   // one unit on every spot (settle prices each spot on its own)
    for (const k of M.SPOTS) { const w = by[k]; ret[k] += w; if (w > unit) hit[k]++; }
  }
  const out = { hands, shoes, handsPerShoe: hands / shoes, deepestCard: maxCards };
  for (const k of M.SPOTS) out[k] = { rtp: ret[k] / (hands * unit), hit: hit[k] / hands };
  return out;
}

const hands = +(process.argv[2] || 10000000), seed = +(process.argv[3] || 20261009);
const pct = (x) => (100 * x).toFixed(4) + '%';
const t0 = Date.now();
const E = exact();
console.log('Exact, full 8-deck shoe (probability mass ' + E.total.toFixed(12) + ')');
console.log('bet  pays           RTP        house edge  win rate   push');
const PAYS = { P: '1:1', B: '0.95:1', T: '8:1', PP: '11:1', BP: '11:1', PD: 'Dragon table', BD: 'Dragon table' };
for (const k of M.SPOTS) console.log(k.padEnd(4), PAYS[k].padEnd(14), pct(E[k].rtp).padStart(9), pct(1 - E[k].rtp).padStart(10), pct(E[k].hit).padStart(9), pct(E[k].push).padStart(9));
console.log('naturals ' + pct(E.natural) + ' · Player draws ' + pct(E.playerDraws) + ' · Banker draws ' + pct(E.bankerDraws));
console.log('\nM.RTP block for game.js:');
const js = {}; for (const k of M.SPOTS) js[k] = { rtp: +(100 * E[k].rtp).toFixed(4), edge: +(100 * (1 - E[k].rtp)).toFixed(4), hit: +(100 * E[k].hit).toFixed(4) };
console.log(JSON.stringify(js));
const S = simulate(hands, seed);
console.log('\nSimulated table: ' + hands.toLocaleString('en-GB') + ' hands from ' + S.shoes.toLocaleString('en-GB') + ' persisted shoes (' + S.handsPerShoe.toFixed(1) + ' hands a shoe, deepest card ' + S.deepestCard + ' of 416)');
for (const k of M.SPOTS) console.log(k.padEnd(4), 'RTP', pct(S[k].rtp).padStart(9), ' win rate', pct(S[k].hit).padStart(9), ' (exact ' + pct(E[k].rtp) + ')');
console.log('\nMax win: ' + M.MAX_WIN.toLocaleString('en-GB') + ' BB a hand (Player 2.5M at 1:1 + both pairs 100k at 11:1 + Player Dragon 100k at 30:1, the most the table limits allow).');
console.log('Done in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
