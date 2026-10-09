/* ===== batjack math ===== */
/* Bat Jack — pure blackjack maths. No DOM. Shared verbatim by the browser game (practice mode), sim/batjack.sim.js,
   and (ported line for line) server/lib/games/batjack.php.

   THE SHOE   Six 52-card decks (312 cards), freshly shuffled for every round. The WHOLE shoe is shuffled (Fisher-Yates,
              311 draws) when the round is dealt, so every card the round can ever use is fixed, and hidden on the
              server, from the first request; later actions take cards from the top and use no randomness. That is
              what lets the server's live balancing (server/lib/rtp.php rtp_pick) judge a whole round at the deal: it
              plays the dealt shoe out with Bat Advice (basic strategy, no insurance) to get the round's return. Card code 0..51: rank = code % 13 (0 = ace, 1..9 = two..ten,
              10 = jack, 11 = queen, 12 = king), suit = floor(code / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs).
   DEAL       Seat 1, seat 2, seat 3, dealer up card, seat 1, seat 2, seat 3, dealer hole card.
   RULES      Dealer stands on all 17s. Dealer peeks under an ace (after insurance) or a ten-value card; a dealer
              blackjack ends the round at once and only the original bets lose. Blackjack pays 3:2, and a BAT JACK
              (an ace with a jack, the bat card, any suits) pays 6:1. Double on any two cards, double after split, split any two
              cards of equal value up to four hands, split aces get one card each and cannot be re-split, a 21 on a
              split hand is not a blackjack. Insurance pays 2:1. No surrender.
   HOUSE RULE (disclosed on the felt): DEALER 22 PUSHES. If the dealer busts with exactly 22, every hand still
              standing pushes (a player blackjack has already been paid). This is what pays for the 6:1 Bat Jack.
   RETURN     Basic strategy for these rules (STRATEGY below, derived by tools/batjack-engine.js) returns about 97.85%
              of the main bet; sim/batjack.sim.js plays 10,000,000+ hands per seat count to confirm. Side bets are
              computed exactly: Perfect Pairs 98.07%, 21+3 98.12%. Insurance (2:1, fixed by the rules) returns 92.6%
              and is never advised.
   AMOUNTS    All bets are multiples of 10 BB, so insurance (half the bet) and every payout are whole numbers. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).batjack = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DECKS = 6, CARDS = 52 * DECKS, SEATS = 3, MAX_HANDS = 4;
  const PAY = { bj: 1.5, batjack: 6, insurance: 2 };
  /* Perfect Pairs on the seat's first two cards (exclusive, best one only) */
  const PP = { perfect: 30, coloured: 10, mixed: 6 };
  /* 21+3 on the seat's first two cards plus the dealer's up card */
  const T3 = { suitedTrips: 100, straightFlush: 40, trips: 30, straight: 9, flush: 6 };
  const LIMITS = { mainMin: 10, mainMax: 10000, sideMax: 1000, step: 10 };
  const CHIPS = [10, 50, 100, 500, 1000, 5000];

  /* ---------- basic strategy for THESE rules (6 decks, S17, dealer 22 pushes, DAS, peek) ----------
     Columns: dealer up card 2,3,4,5,6,7,8,9,10,A.  H hit, S stand, D double (else hit), d double (else stand).
     PAIRS: Y split, - play as a total. Produced by tools/batjack-engine.js (composition-weighted EV per cell). */
  const STRATEGY = {
    hard: { 4: 'HHHHHHHHHH', 5: 'HHHHHHHHHH', 6: 'HHHHHHHHHH', 7: 'HHHHHHHHHH', 8: 'HHHHHHHHHH', 9: 'HHHDDHHHHH', 10: 'DDDDDDDHHH', 11: 'DDDDDDDDHH',
      12: 'HHHSHHHHHH', 13: 'HSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHHH', 16: 'SSSSSHHHHH', 17: 'SSSSSSSSSS', 18: 'SSSSSSSSSS', 19: 'SSSSSSSSSS', 20: 'SSSSSSSSSS', 21: 'SSSSSSSSSS' },
    soft: { 12: 'HHHHHHHHHH', 13: 'HHHHHHHHHH', 14: 'HHHHHHHHHH', 15: 'HHHHHHHHHH', 16: 'HHHHHHHHHH', 17: 'HHHDDHHHHH', 18: 'SSSddSSHHH', 19: 'SSSSSSSSSS', 20: 'SSSSSSSSSS', 21: 'SSSSSSSSSS' },
    pair: { 1: 'YYYYYYYYYY', 2: '---YYY----', 3: '---YYY----', 4: '----------', 5: '----------', 6: '--YYY-----', 7: '-YYYYY----', 8: 'YYYYYYYY-Y', 9: '--YYY-YY--', 10: '----------' },
  };

  /* ---------- cards ---------- */
  const rankOf = (c) => c % 13;
  const suitOf = (c) => Math.floor(c / 13);
  const valOf = (c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; };
  const isRed = (c) => { const s = Math.floor(c / 13); return s === 1 || s === 2; };
  /* {t: best total, soft: an ace is counting 11} */
  function total(cards) {
    let t = 0, ace = false;
    for (let i = 0; i < cards.length; i++) { const v = valOf(cards[i]); t += v; if (v === 1) ace = true; }
    if (ace && t + 10 <= 21) return { t: t + 10, soft: true };
    return { t, soft: false };
  }
  const isNatural = (cards) => cards.length === 2 && total(cards).t === 21;
  const isBatJack = (cards) => cards.length === 2 && ((rankOf(cards[0]) === 0 && rankOf(cards[1]) === 10) || (rankOf(cards[1]) === 0 && rankOf(cards[0]) === 10));

  /* the shoe is shuffled once, at the deal; a draw just takes the next card */
  function shuffle(rng) {
    const shoe = new Array(CARDS); for (let i = 0; i < CARDS; i++) shoe[i] = i;
    for (let i = 0; i < CARDS - 1; i++) { const j = i + Math.floor(rng() * (CARDS - i)); const t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t; }
    return shoe;
  }
  function draw(S) { return (S.live ? S.shoe[S.order[S.pos++]] : S.shoe[S.pos++]) % 52; }

  /* ---------- side bets ---------- */
  function ppKind(a, b) {
    if (rankOf(a) !== rankOf(b)) return null;
    if (suitOf(a) === suitOf(b)) return 'perfect';
    return isRed(a) === isRed(b) ? 'coloured' : 'mixed';
  }
  function t3Kind(a, b, c) {
    const r = [rankOf(a), rankOf(b), rankOf(c)].sort((x, y) => x - y);
    const flush = suitOf(a) === suitOf(b) && suitOf(b) === suitOf(c);
    const trips = r[0] === r[1] && r[1] === r[2];
    const straight = r[0] !== r[1] && r[1] !== r[2] && (r[2] - r[0] === 2 || (r[0] === 0 && r[1] === 11 && r[2] === 12));
    if (trips && flush) return 'suitedTrips';
    if (straight && flush) return 'straightFlush';
    if (trips) return 'trips';
    if (straight) return 'straight';
    if (flush) return 'flush';
    return null;
  }

  /* ---------- validation ---------- */
  /* bets: array of 1..3 seats, each {main, pp, t3} (pp / t3 optional). Returns an error string or null. */
  function checkBets(bets) {
    if (!Array.isArray(bets) || bets.length < 1 || bets.length > SEATS) return 'Choose one to three seats.';
    let any = false;
    for (let i = 0; i < bets.length; i++) {
      const b = bets[i];
      if (!b || typeof b !== 'object') return 'Bad seat.';
      const m = b.main, p = b.pp || 0, t = b.t3 || 0;
      for (const v of [m, p, t]) if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v % LIMITS.step) return 'Bets come in 10 BB chips.';
      if (m === 0 && (p || t)) return 'Side bets need a main bet on the same seat.';
      if (m && (m < LIMITS.mainMin || m > LIMITS.mainMax)) return 'Main bets are ' + LIMITS.mainMin + ' to ' + LIMITS.mainMax + ' BB.';
      if (p > LIMITS.sideMax || t > LIMITS.sideMax) return 'Side bets are up to ' + LIMITS.sideMax + ' BB.';
      if (m) any = true;
    }
    return any ? null : 'Put a bet on at least one seat.';
  }
  const betCost = (bets) => { let s = 0; for (const b of bets) s += b.main + (b.pp || 0) + (b.t3 || 0); return s; };

  /* ---------- a round ---------- */
  function newHand(cards, bet) { return { cards, bet, dbl: false, splitAces: false, fromSplit: false, done: false, res: null, win: 0 }; }

  /* Deal a fresh round. bets must already pass checkBets. Seats with main 0 are empty and get no cards. */
  function deal(rng, bets) {
    const shoe = shuffle(rng);
    const S = { shoe, pos: 0, seats: [], dealer: [], phase: 'player', cur: [0, 0], staked: 0, win: 0, insured: null, dealerBJ: false, peeked: false };
    for (let i = 0; i < bets.length; i++) {
      const b = bets[i];
      S.seats.push({ main: b.main, pp: b.main ? (b.pp || 0) : 0, t3: b.main ? (b.t3 || 0) : 0, ppKind: null, ppWin: 0, t3Kind: null, t3Win: 0, ins: 0, insWin: 0, hands: [] });
      S.staked += b.main + (b.main ? (b.pp || 0) + (b.t3 || 0) : 0);
    }
    const live = []; for (let i = 0; i < S.seats.length; i++) if (S.seats[i].main) live.push(i);
    for (const i of live) S.seats[i].hands.push(newHand([draw(S)], S.seats[i].main));
    S.dealer.push(draw(S));
    for (const i of live) S.seats[i].hands[0].cards.push(draw(S));
    S.dealer.push(draw(S));
    /* side bets settle on the dealt cards */
    const up = S.dealer[0];
    for (const i of live) {
      const st = S.seats[i], c = st.hands[0].cards;
      if (st.pp) { st.ppKind = ppKind(c[0], c[1]); st.ppWin = st.ppKind ? st.pp * (PP[st.ppKind] + 1) : 0; }
      if (st.t3) { st.t3Kind = t3Kind(c[0], c[1], up); st.t3Win = st.t3Kind ? st.t3 * (T3[st.t3Kind] + 1) : 0; }
      if (isNatural(c)) st.hands[0].done = true;
    }
    if (valOf(up) === 1) { S.phase = 'insurance'; return S; }
    return afterPeek(S);
  }
  /* insurance decision (one answer for every seat): take = true buys insurance at half of each main bet */
  function insure(S, take) {
    if (S.phase !== 'insurance') return 'No insurance on offer.';
    S.insured = !!take;
    if (take) for (const st of S.seats) if (st.main) { st.ins = st.main / 2; S.staked += st.ins; }
    afterPeek(S);
    return null;
  }
  const insuranceCost = (S) => { let s = 0; for (const st of S.seats) if (st.main) s += st.main / 2; return s; };
  function afterPeek(S) {
    const v = valOf(S.dealer[0]);
    if (v === 1 || v === 10) { S.peeked = true; S.dealerBJ = isNatural(S.dealer); }
    if (S.dealerBJ) { settle(S); return S; }
    S.phase = 'player'; S.cur = [0, -1];
    advance(S);
    return S;
  }
  /* move to the next hand that needs a decision; deal the second card to a split hand when it comes up */
  function advance(S) {
    let si = S.cur[0], hi = S.cur[1] + 1;
    for (; si < S.seats.length; si++, hi = 0) {
      const st = S.seats[si];
      for (; hi < st.hands.length; hi++) {
        const h = st.hands[hi];
        if (h.done) continue;
        if (h.cards.length === 1) {
          h.cards.push(draw(S));
          if (h.splitAces || total(h.cards).t === 21) { h.done = true; continue; }
        }
        S.cur = [si, hi];
        return;
      }
    }
    if (S.live) { S.phase = 'stood'; return; }
    dealerPlay(S);
  }
  function curHand(S) { if (S.phase !== 'player') return null; return S.seats[S.cur[0]].hands[S.cur[1]]; }
  function legal(S) {
    const h = curHand(S); if (!h) return [];
    const st = S.seats[S.cur[0]], out = ['hit', 'stand'];
    if (h.cards.length === 2) {
      out.push('double');
      if (valOf(h.cards[0]) === valOf(h.cards[1]) && st.hands.length < MAX_HANDS && !h.splitAces) out.push('split');
    }
    return out;
  }
  /* extra stake an action takes (double / split = the hand's bet) */
  function actionCost(S, a) { const h = curHand(S); return h && (a === 'double' || a === 'split') ? h.bet : 0; }
  /* hit / stand / double / split on the current hand. Returns an error string, or null when done. */
  function act(S, a) {
    if (S.phase !== 'player') return 'Not your turn.';
    if (legal(S).indexOf(a) < 0) return 'That move is not allowed now.';
    const st = S.seats[S.cur[0]], h = st.hands[S.cur[1]];
    if (a === 'hit') {
      h.cards.push(draw(S));
      if (total(h.cards).t >= 21) h.done = true;
    } else if (a === 'stand') h.done = true;
    else if (a === 'double') {
      S.staked += h.bet; h.bet *= 2; h.dbl = true;
      h.cards.push(draw(S)); h.done = true;
    } else if (a === 'split') {
      const aces = valOf(h.cards[0]) === 1;
      const nh = newHand([h.cards.pop()], h.bet);
      nh.fromSplit = true; h.fromSplit = true;
      if (aces) { nh.splitAces = true; h.splitAces = true; }
      S.staked += h.bet;
      st.hands.splice(S.cur[1] + 1, 0, nh);
      h.cards.push(draw(S));
      if (aces || total(h.cards).t === 21) h.done = true;
    }
    if (h.done) advance(S);
    return null;
  }
  /* abandoned round: decline insurance, stand every remaining hand, finish */
  function autoFinish(S) {
    if (S.phase === 'insurance') insure(S, false);
    let guard = 0;
    while (S.phase === 'player' && guard++ < 50) act(S, 'stand');
    return S;
  }
  /* The round played out with Bat Advice and no insurance, from the cards already in the shoe, on a copy (the shoe
     itself is never written after the shuffle, so it can be shared). autoReturn(S) is that round's return measured
     against the stake taken at the deal: win minus any extra money doubles and splits put in, so it is above the deal
     stake exactly when the round makes a profit. Used by the server's live balancing at the deal:
     rtp_pick('batjack', dealStake, () => [S, autoReturn(S)]). */
  function autoPlay(S) {
    const C = Object.assign({}, S, { dealer: S.dealer.slice(), cur: S.cur.slice(),
      seats: S.seats.map((st) => Object.assign({}, st, { hands: st.hands.map((h) => Object.assign({}, h, { cards: h.cards.slice() })) })) });
    if (C.phase === 'insurance') insure(C, false);
    let g = 0;
    while (C.phase === 'player' && g++ < 200) act(C, advise(C));
    return C;
  }
  function autoReturn(S) { const C = autoPlay(S); return C.win - (C.staked - S.staked); }
  function dealerPlay(S) {
    S.phase = 'dealer';
    let needed = false;
    for (const st of S.seats) for (const h of st.hands) {
      const t = total(h.cards).t;
      if (t <= 21 && !(isNatural(h.cards) && !h.fromSplit)) needed = true;
    }
    if (needed || S.live) {
      for (;;) { const d = total(S.dealer); if (d.t >= 17) break; S.dealer.push(S.live ? S.shoe[S.dpos++] % 52 : draw(S)); }
    }
    settle(S);
  }
  function settle(S) {
    const d = total(S.dealer).t, dBJ = S.dealerBJ;
    let win = 0;
    for (const st of S.seats) {
      if (!st.main) continue;
      st.insWin = st.ins && dBJ ? st.ins * (PAY.insurance + 1) : 0;
      for (const h of st.hands) {
        const t = total(h.cards).t;
        const nat = isNatural(h.cards) && !h.fromSplit;
        let res, w;
        if (nat && dBJ) { res = 'push'; w = h.bet; }
        else if (nat) { const bat = isBatJack(h.cards); res = bat ? 'batjack' : 'blackjack'; w = h.bet + (bat ? h.bet * PAY.batjack : h.bet * 3 / 2); }   /* 3:2 in whole numbers: bets are multiples of 10 */
        else if (dBJ) { res = 'lose'; w = 0; }
        else if (t > 21) { res = 'bust'; w = 0; }
        else if (d === 22) { res = 'push22'; w = h.bet; }
        else if (d > 21 || t > d) { res = 'win'; w = h.bet * 2; }
        else if (t === d) { res = 'push'; w = h.bet; }
        else { res = 'lose'; w = 0; }
        h.res = res; h.win = w; h.done = true; win += w;
      }
      win += st.ppWin + st.t3Win + st.insWin;
    }
    S.win = win; S.phase = 'done';
    return S;
  }

  /* ---------- what the player may see ----------
     The shoe and (until the dealer acts) the hole card never leave the server. */
  function view(S) {
    const show = S.phase === 'done' || S.phase === 'dealer';
    const dc = show ? S.dealer.slice() : [S.dealer[0]];
    const out = {
      phase: S.phase, cur: S.phase === 'player' ? S.cur.slice() : null, staked: S.staked, win: S.phase === 'done' ? S.win : 0,
      dealer: { cards: dc, hole: !show, total: show ? total(S.dealer).t : total(dc).t, soft: show ? total(S.dealer).soft : total(dc).soft, bj: show ? S.dealerBJ : false, peeked: S.peeked },
      insured: S.insured, legal: legal(S), insCost: S.phase === 'insurance' ? insuranceCost(S) : 0,
      seats: S.seats.map((st) => ({ main: st.main, pp: st.pp, t3: st.t3, ppKind: st.ppKind, ppWin: st.ppWin, t3Kind: st.t3Kind, t3Win: st.t3Win, ins: st.ins, insWin: st.insWin,
        hands: st.hands.map((h) => { const t = total(h.cards); return { cards: h.cards.slice(), bet: h.bet, dbl: h.dbl, splitAces: h.splitAces, fromSplit: h.fromSplit, done: h.done, res: h.res, win: h.win, total: t.t, soft: t.soft }; }) })),
    };
    if (out.phase === 'dealer') out.phase = 'done';
    return out;
  }

  /* ---------- Bat Advice: basic strategy for the current hand ---------- */
  function advise(S) {
    if (S.phase === 'insurance') return 'noins';
    const h = curHand(S); if (!h) return null;
    return adviseCards(h.cards, S.dealer[0], legal(S));
  }
  function adviseCards(cards, up, lg) {
    const col = valOf(up) === 1 ? 9 : valOf(up) - 2;
    if (lg.indexOf('split') > -1 && STRATEGY.pair[valOf(cards[0])][col] === 'Y') return 'split';
    const t = total(cards);
    const row = t.soft ? STRATEGY.soft[t.t] : STRATEGY.hard[t.t];
    const c = row ? row[col] : 'S';
    const canD = lg.indexOf('double') > -1;
    if (c === 'D') return canD ? 'double' : 'hit';
    if (c === 'd') return canD ? 'double' : 'stand';
    return c === 'H' ? 'hit' : 'stand';
  }


  /* ---------- LIVE TABLE (common draw) ----------
     One shoe per round, shared by everyone at the table. Positions 0 and 2 are every player's first two cards, 1 and 3
     the dealer's up and hole card, 4-13 the dealer's draws. Each player's own extra cards (hits, doubles, splits) come
     from positions 14-311 in an order private to that player (a Fisher-Yates shuffle seeded per player), so nobody's
     hit tells anybody else anything, and every player's game is exactly a normal blackjack dealt from a shuffled shoe.
     The dealer always draws to 17 (the table is shared), which never changes a player's result. */
  const LIVE_FIRST = 14;
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function liveOrder(seed) {
    const r = mulberry(seed), o = []; for (let i = LIVE_FIRST; i < CARDS; i++) o.push(i);
    for (let i = 0; i < o.length - 1; i++) { const j = i + Math.floor(r() * (o.length - i)); const t = o[i]; o[i] = o[j]; o[j] = t; }
    return o;
  }
  /* bet {main, pp, t3}, already valid. Phase after: 'insurance' (ace up) or 'peek' (waiting for the table's peek). */
  function liveDeal(shoe, bet, seed) {
    const S = { live: true, shoe, order: liveOrder(seed), pos: 0, dpos: 4, seats: [], dealer: [shoe[1] % 52, shoe[3] % 52], phase: 'peek', cur: [0, 0], staked: 0, win: 0, insured: null, dealerBJ: false, peeked: false };
    const m = bet.main, pp = bet.pp || 0, t3 = bet.t3 || 0;
    const st = { main: m, pp, t3, ppKind: null, ppWin: 0, t3Kind: null, t3Win: 0, ins: 0, insWin: 0, hands: [newHand([shoe[0] % 52, shoe[2] % 52], m)] };
    S.seats.push(st); S.staked = m + pp + t3;
    const c = st.hands[0].cards, up = S.dealer[0];
    if (pp) { st.ppKind = ppKind(c[0], c[1]); st.ppWin = st.ppKind ? pp * (PP[st.ppKind] + 1) : 0; }
    if (t3) { st.t3Kind = t3Kind(c[0], c[1], up); st.t3Win = st.t3Kind ? t3 * (T3[st.t3Kind] + 1) : 0; }
    if (isNatural(c)) st.hands[0].done = true;
    if (valOf(up) === 1) S.phase = 'insurance';
    return S;
  }
  function liveInsure(S, take) {
    if (S.phase !== 'insurance') return 'No insurance on offer.';
    S.insured = !!take;
    if (take) { const st = S.seats[0]; st.ins = st.main / 2; S.staked += st.ins; }
    S.phase = 'peek';
    return null;
  }
  /* the table's peek moment: undecided insurance is declined */
  function livePeek(S) {
    if (S.phase === 'insurance') S.insured = false;
    if (S.phase === 'insurance' || S.phase === 'peek') afterPeek(S);
    return S;
  }
  /* decisions are over: stand whatever is left, then the dealer plays and the round settles */
  function liveFinish(S, useAdvice) {
    livePeek(S);
    let g = 0;
    while (S.phase === 'player' && g++ < 200) act(S, useAdvice ? advise(S) : 'stand');
    if (S.phase === 'stood') dealerPlay(S);
    return S;
  }
  function liveCopy(S) {
    return Object.assign({}, S, { dealer: S.dealer.slice(), cur: S.cur.slice(),
      seats: S.seats.map((st) => Object.assign({}, st, { hands: st.hands.map((h) => Object.assign({}, h, { cards: h.cards.slice() })) })) });
  }
  /* return of the round as Bat Advice would play it (no insurance), measured like autoReturn */
  function liveAutoReturn(S) { const C = liveFinish(liveCopy(S), true); return C.win - (C.staked - S.staked); }
  /* the dealer's whole hand, the same for everyone */
  function liveDealerCards(shoe) {
    const d = [shoe[1] % 52, shoe[3] % 52], v = valOf(d[0]);
    if ((v === 1 || v === 10) && isNatural(d)) return d;
    let p = 4; while (total(d).t < 17) d.push(shoe[p++] % 52);
    return d;
  }

  return { LIVE_FIRST, liveOrder, liveDeal, liveInsure, livePeek, liveFinish, liveCopy, liveAutoReturn, liveDealerCards, DECKS, CARDS, SEATS, MAX_HANDS, PAY, PP, T3, LIMITS, CHIPS, STRATEGY,
    rankOf, suitOf, valOf, isRed, total, isNatural, isBatJack, ppKind, t3Kind,
    checkBets, betCost, shuffle, deal, insure, autoPlay, autoReturn, insuranceCost, legal, actionCost, act, autoFinish, view, advise, adviseCards, curHand };
});

/* ===== batjack ===== */
/* Bat Jack — premium blackjack at a midnight gothic club table. Up to three seats, Perfect Pairs and 21+3 on every seat,
   Bat Advice (basic strategy for these rules), hand history, Rebet, Rebet & Deal, Double bets.
   Online: every card comes from the server (one request per action; the shoe and the hole card never leave it).
   Practice: the same maths (BattyMath.batjack) runs in the browser. The UI only presents views; it decides nothing. */
(function () {
  'use strict';
  const ID = 'batjack', M = BattyMath.batjack, B = Batty, h = B.h, fmt = B.fmt;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const KEY = 'batty-batjack-v1';
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
  const CHIP_STYLE = {
    10: ['#e9e1cf', '#8a7a5c', '#3a2a14', '10'], 50: ['#b3122a', '#f3d98b', '#fff4dc', '50'], 100: ['#17121c', '#d9b25f', '#f3d98b', '100'],
    500: ['#4b1d6b', '#e7c6ff', '#fff', '500'], 1000: ['#c99a35', '#4a0b14', '#2a0508', '1K'], 5000: ['#0c0c10', '#e3263f', '#ff9aa8', '5K'],
  };
  const RES_TEXT = { win: 'WIN', push: 'PUSH', push22: '22 PUSH', lose: 'LOSE', bust: 'BUST', blackjack: 'BLACKJACK', batjack: 'BAT JACK' };
  const PP_NAME = { perfect: 'Perfect pair', coloured: 'Coloured pair', mixed: 'Mixed pair' };
  const T3_NAME = { suitedTrips: 'Suited trips', straightFlush: 'Straight flush', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush' };
  const ACT_NAME = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' };

  /* ============================== card and chip art ============================== */
  const SUIT = {
    0: '<path d="M50 4C50 4 11 37 11 60C11 76 25 85 38 81C44 79 47 75 48 71C47 83 42 92 33 97H67C58 92 53 83 52 71C53 75 56 79 62 81C75 85 89 76 89 60C89 37 50 4 50 4Z"/>',
    1: '<path d="M50 93C50 93 7 63 7 34C7 18 19 7 33 7C42 7 48 13 50 22C52 13 58 7 67 7C81 7 93 18 93 34C93 63 50 93 50 93Z"/>',
    2: '<path d="M50 3Q66 30 87 50Q66 70 50 97Q34 70 13 50Q34 30 50 3Z"/>',
    3: '<circle cx="50" cy="27" r="20"/><circle cx="27" cy="58" r="20"/><circle cx="73" cy="58" r="20"/><path d="M45 50C46 74 40 88 31 97H69C60 88 54 74 55 50Z"/>',
  };
  const red = (c) => { const s = Math.floor(c / 13); return s === 1 || s === 2; };
  const ink = (c) => (red(c) ? '#b3122a' : '#17121c');
  const suitAt = (s, x, y, size, rot, fill) => '<g transform="translate(' + x + ' ' + y + ')' + (rot ? ' rotate(180)' : '') + ' scale(' + (size / 100) + ') translate(-50 -50)" fill="' + fill + '">' + SUIT[s] + '</g>';
  const PIPS = {
    2: [[50, 30], [50, 110]], 3: [[50, 30], [50, 70], [50, 110]], 4: [[32, 30], [68, 30], [32, 110], [68, 110]],
    5: [[32, 30], [68, 30], [50, 70], [32, 110], [68, 110]], 6: [[32, 30], [68, 30], [32, 70], [68, 70], [32, 110], [68, 110]],
    7: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [32, 110], [68, 110]],
    8: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [50, 90], [32, 110], [68, 110]],
    9: [[32, 30], [68, 30], [32, 57], [68, 57], [50, 70], [32, 83], [68, 83], [32, 110], [68, 110]],
    10: [[32, 30], [68, 30], [50, 44], [32, 57], [68, 57], [32, 83], [68, 83], [50, 96], [32, 110], [68, 110]],
  };
  const BAT = () => B.batPath;
  /* the court figures: a bat in the suit colour, crowned (K, Q) or hooded (J, the bat card), mirrored like a real court card */
  function court(r, s, col) {
    const gold = '#c99a35', gl = '#f3d98b';
    let head = '';
    if (r === 12) head = '<path d="M36 26L38 14L44 21L50 10L56 21L62 14L64 26Z" fill="' + gold + '" stroke="#6b4a10" stroke-width="1"/><circle cx="50" cy="12" r="2.2" fill="#b3122a"/>' +
      '<path d="M71 18L71 54" stroke="' + gold + '" stroke-width="2.4"/><circle cx="71" cy="16" r="3.4" fill="' + gl + '" stroke="#6b4a10" stroke-width=".8"/>';
    else if (r === 11) head = '<path d="M39 26L41 17L46 22L50 15L54 22L59 17L61 26Z" fill="' + gold + '" stroke="#6b4a10" stroke-width="1"/>' +
      '<path d="M27 46C24 40 26 34 31 33C33 38 31 43 27 46Z" fill="#b3122a"/><path d="M29 47L33 56" stroke="#2d6b2a" stroke-width="1.4"/>';
    else head = '<path d="M38 28Q50 4 62 28Q56 23 50 24Q44 23 38 28Z" fill="' + (s === 1 || s === 2 ? '#17121c' : '#b3122a') + '"/><circle cx="50" cy="8" r="2.4" fill="' + gold + '"/>' +
      '<path d="M30 22L30 52" stroke="#8a7a5c" stroke-width="1.6"/><path d="M26 22L30 15L34 22Z" fill="' + gold + '"/>';
    const fig = '<g>' + head + '<path d="' + BAT() + '" transform="translate(23 26) scale(.45)" fill="' + col + '"/>' +
      '<circle cx="45.5" cy="35.5" r="1.7" fill="' + gl + '"/><circle cx="54.5" cy="35.5" r="1.7" fill="' + gl + '"/>' +
      '<path d="M40 54Q50 62 60 54L58 66H42Z" fill="' + gold + '" opacity=".85"/>' + suitAt(s, 50, 61, 9, false, col) + '</g>';
    return '<rect x="17" y="17" width="66" height="106" rx="3" fill="#f2e3bd" stroke="' + gold + '" stroke-width="1.6"/>' +
      '<path d="M17 70H83" stroke="' + gold + '" stroke-width=".9" stroke-dasharray="2 2"/>' +
      '<g transform="translate(0 1)">' + fig + '</g><g transform="rotate(180 50 70) translate(0 1)">' + fig + '</g>' +
      '<text x="50" y="74.5" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="8" fill="#6b4a10">' + (r === 10 ? 'BAT' : r === 11 ? 'QUEEN' : 'KING') + '</text>';
  }
  function faceSvg(c) {
    const r = c % 13, s = Math.floor(c / 13), col = ink(c), lab = RANKS[r];
    let mid = '';
    if (r === 0) {
      mid = '<g transform="translate(50 72)"><path d="' + BAT() + '" transform="translate(-48 -40) scale(.8)" fill="#c99a35" opacity=".9"/></g>' + suitAt(s, 50, 70, s === 0 ? 46 : 38, false, col) +
        '<circle cx="50" cy="70" r="30" fill="none" stroke="#c99a35" stroke-width=".8" stroke-dasharray="1.5 2.5"/>';
    } else if (r >= 10) mid = court(r, s, col);
    else for (const [x, y] of PIPS[r + 1]) mid += suitAt(s, x, y, 17, y > 70, col);
    const corner = '<text x="10.5" y="21" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="' + (lab === '10' ? 15 : 18) + '" fill="' + col + '"' + (lab === '10' ? ' letter-spacing="-1.5"' : '') + '>' + lab + '</text>' + suitAt(s, 10.5, 31, 11, false, col);
    return '<svg viewBox="0 0 100 140" aria-hidden="true"><rect x=".6" y=".6" width="98.8" height="138.8" rx="8" fill="url(#batjack-paper)" stroke="#bfa877" stroke-width="1.2"/>' +
      mid + corner + '<g transform="rotate(180 50 70)">' + corner + '</g></svg>';
  }
  const BACK_SVG = '<svg viewBox="0 0 100 140" aria-hidden="true"><rect x=".6" y=".6" width="98.8" height="138.8" rx="8" fill="#3a0610" stroke="#c99a35" stroke-width="1.4"/>' +
    '<rect x="6" y="6" width="88" height="128" rx="5" fill="url(#batjack-damask)" stroke="#c99a35" stroke-width="1"/>' +
    '<circle cx="50" cy="70" r="21" fill="#3a0610" stroke="#c99a35" stroke-width="1.4"/><path d="' + B.batPath + '" transform="translate(32 61) scale(.3)" fill="#e2bd62"/></svg>';
  const DEFS = '<svg class="bj-defs" width="0" height="0" aria-hidden="true"><defs>' +
    '<linearGradient id="batjack-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f6eedb"/><stop offset="1" stop-color="#e9dcc0"/></linearGradient>' +
    '<pattern id="batjack-damask" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#5c0b19"/><path d="M7 1L13 7L7 13L1 7Z" fill="none" stroke="#a8792a" stroke-width=".7"/><circle cx="7" cy="7" r="1.4" fill="#c99a35"/><circle cx="0" cy="0" r="1" fill="#7e1425"/><circle cx="14" cy="14" r="1" fill="#7e1425"/></pattern>' +
    '</defs></svg>';
  function chipSvg(v, size) {
    const st = CHIP_STYLE[v] || CHIP_STYLE[10];
    return '<svg viewBox="0 0 40 40" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="' + st[0] + '" stroke="rgba(0,0,0,.45)" stroke-width="1"/>' +
      '<circle cx="20" cy="20" r="16" fill="none" stroke="' + st[1] + '" stroke-width="5" stroke-dasharray="5.2 7.4"/>' +
      '<circle cx="20" cy="20" r="11.5" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width="1.2"/>' +
      '<text x="20" y="24.2" text-anchor="middle" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + (st[3].length > 2 ? 10 : 12) + '" fill="' + st[2] + '">' + st[3] + '</text></svg>';
  }
  /* break an amount into chips, largest first */
  function chipsFor(n) { const out = []; const ds = M.CHIPS.slice().reverse(); for (const d of ds) while (n >= d && out.length < 12) { out.push(d); n -= d; } return out; }
  const SHOE_SVG = '<svg viewBox="0 0 150 110" aria-hidden="true">' +
    '<path d="M10 52C2 34 8 18 20 10C20 22 26 30 34 34C30 24 32 16 38 10C40 24 46 32 56 38L52 66Z" fill="#1c0b12" stroke="#c99a35" stroke-width="1.6"/>' +
    '<path d="M140 52C148 34 142 18 130 10C130 22 124 30 116 34C120 24 118 16 112 10C110 24 104 32 94 38L98 66Z" fill="#1c0b12" stroke="#c99a35" stroke-width="1.6"/>' +
    '<path d="M36 40H114L124 96H26Z" fill="#2a0c14" stroke="#c99a35" stroke-width="2"/><path d="M42 46H108L114 74H36Z" fill="#12060a"/>' +
    '<rect x="48" y="44" width="54" height="30" rx="3" fill="#5c0b19" stroke="#c99a35" stroke-width="1" transform="skewX(-8)"/>' +
    '<path d="M26 96H124L120 104H30Z" fill="#c99a35"/><circle cx="75" cy="86" r="5" fill="#c99a35"/><path d="' + B.batPath + '" transform="translate(64 80) scale(.18)" fill="#2a0c14"/></svg>';

  /* the dealer's chip tray: rows of chips lying on edge in a black lacquer tray */
  function traySvg() {
    const cols = [5000, 1000, 500, 100, 100, 50, 50, 10, 10, 500];
    let slots = '';
    cols.forEach((v, i) => {
      const st = CHIP_STYLE[v], x = 14 + i * 27.2;
      slots += '<rect x="' + x + '" y="12" width="24" height="26" rx="3" fill="' + st[0] + '"/>' +
        '<rect x="' + x + '" y="12" width="24" height="26" rx="3" fill="url(#batjack-edge)" opacity=".85" style="mix-blend-mode:normal"/>' +
        '<rect x="' + x + '" y="12" width="24" height="5" rx="2" fill="#fff" opacity=".18"/>';
      slots = slots.replace('url(#batjack-edge)', 'url(#batjack-edge-' + (v === 10 ? 'd' : 'l') + ')');
    });
    return '<svg viewBox="0 0 300 50" aria-hidden="true"><defs>' +
      '<pattern id="batjack-edge-l" width="24" height="4" patternUnits="userSpaceOnUse"><rect width="24" height="1.2" fill="rgba(255,255,255,.55)"/><rect x="0" y="1.2" width="24" height=".5" fill="rgba(0,0,0,.35)"/></pattern>' +
      '<pattern id="batjack-edge-d" width="24" height="4" patternUnits="userSpaceOnUse"><rect width="24" height="1.2" fill="rgba(80,50,10,.45)"/><rect x="0" y="1.2" width="24" height=".5" fill="rgba(0,0,0,.3)"/></pattern>' +
      '<linearGradient id="batjack-lacq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1016"/><stop offset="1" stop-color="#0a0305"/></linearGradient></defs>' +
      '<path d="M4 4H296L290 46H10Z" fill="url(#batjack-lacq)" stroke="#c99a35" stroke-width="1.6"/>' + slots +
      '<path d="M10 40H290" stroke="#c99a35" stroke-width="1" opacity=".6"/></svg>';
  }

  /* ============================== poster ============================== */
  function poster() {
    const card = (c, x, y, rot) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') translate(-50 -70)">' + faceSvg(c).replace('<svg viewBox="0 0 100 140" aria-hidden="true">', '').replace('</svg>', '').replace('url(#batjack-paper)', 'url(#batjack-p-paper)') + '</g>';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Bat Jack"><defs>' +
      '<radialGradient id="batjack-p-felt" cx=".5" cy=".75" r=".8"><stop offset="0" stop-color="#7a1022"/><stop offset=".55" stop-color="#3d0611"/><stop offset="1" stop-color="#0d0205"/></radialGradient>' +
      '<radialGradient id="batjack-p-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4cf"/><stop offset=".6" stop-color="#f3d98b"/><stop offset="1" stop-color="#f3d98b" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="batjack-p-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset=".45" stop-color="#e2bd62"/><stop offset=".55" stop-color="#a8792a"/><stop offset="1" stop-color="#f3d98b"/></linearGradient>' +
      '<linearGradient id="batjack-p-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9dcc0"/></linearGradient>' +
      '<path id="batjack-p-arc" d="M24 300 Q160 196 296 300"/>' +
      '</defs><rect width="320" height="400" fill="url(#batjack-p-felt)"/>' +
      '<circle cx="250" cy="70" r="46" fill="url(#batjack-p-moon)" opacity=".85"/>' +
      '<path d="' + B.batPath + '" transform="translate(204 52) scale(.62)" fill="#14040a"/>' +
      '<path d="' + B.batPath + '" transform="translate(40 40) scale(.28) rotate(-12)" fill="#14040a" opacity=".8"/>' +
      '<path d="' + B.batPath + '" transform="translate(96 22) scale(.18) rotate(8)" fill="#14040a" opacity=".7"/>' +
      '<path d="M0 260 Q160 150 320 260 L320 400 L0 400Z" fill="#2c040c" opacity=".55"/>' +
      '<path d="M8 300 Q160 180 312 300" fill="none" stroke="#c99a35" stroke-width="1.5" opacity=".8"/>' +
      '<path d="M30 330 Q160 230 290 330" fill="none" stroke="#c99a35" stroke-width="1" opacity=".55"/>' +
      '<text font-family="Cinzel,Georgia,serif" font-weight="800" font-size="10" letter-spacing="2.6" fill="#e2bd62"><textPath href="#batjack-p-arc" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2 · BAT JACK 6 TO 1</textPath></text>' +
      card(10, 132, 200, -14) + card(0, 190, 194, 12) +
      '<text x="160" y="118" text-anchor="middle" font-family="\'Cinzel Decorative\',Cinzel,Georgia,serif" font-weight="900" font-size="54" fill="url(#batjack-p-gold)" stroke="#2a0508" stroke-width="7" paint-order="stroke" letter-spacing="1">BAT JACK</text>' +
      '<text x="160" y="142" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="800" font-size="11" letter-spacing="5" fill="#f3d98b">MIDNIGHT BLACKJACK</text>' +
      '<g transform="translate(160 352)">' + [[-58, 100], [-20, 500], [20, 1000], [58, 50]].map(([x, v], i) => '<g transform="translate(' + (x - 17) + ' ' + (-17 - (i % 2) * 6) + ')">' + chipSvg(v, 34) + '</g>').join('') + '</g>' +
      '<rect x="6" y="6" width="308" height="388" rx="10" fill="none" stroke="#c99a35" stroke-width="1.2" opacity=".6"/></svg>';
  }

  /* ============================== rules ============================== */
  function rules() {
    const pp = Object.entries(M.PP).map(([k, v]) => '<tr><td>' + PP_NAME[k] + '</td><td>' + v + ' to 1</td></tr>').join('');
    const t3 = Object.entries(M.T3).map(([k, v]) => '<tr><td>' + T3_NAME[k] + '</td><td>' + v + ' to 1</td></tr>').join('');
    const liveTxt = '<h3>The live table</h3><p>Everyone online plays the same table at the same time. Betting is open for 15 seconds; then the cards come out. <b>Every player gets the same first two cards and the same dealer.</b> From there you play your own hand: hit, stand, double or split as you like. Your extra cards come from your own private order of the shoe, so nobody else\'s hit tells you anything, and your hand is exactly a normal blackjack hand dealt from a freshly shuffled six-deck shoe. Other players\' moves are hidden until the dealer plays.</p>' +
      '<p>You have 20 seconds to decide (insurance gets 7 seconds before that when the dealer shows an ace). The dealer plays as soon as everyone has finished, or when the time runs out. Any hand still undecided then stands. One hand per player, with Perfect Pairs and 21+3 alongside. Main bet 10 to 10,000 BB, side bets up to 1,000 BB, in 10 BB chips.</p>';
    return (B.online ? liveTxt : '<h3>The table</h3><p>Six decks, shuffled fresh for every round. Play one, two or three seats at once; each seat has its own main bet and its own optional side bets. Bets come in 10 BB chips: main bet 10 to 10,000 BB per seat, each side bet up to 1,000 BB.</p><p>Online, Bat Jack is a live table shared with every player.</p>') +
      '<h3>Rules</h3><ul><li>Blackjack pays <b>3 to 2</b>.</li><li><b>Bat Jack</b>: a blackjack made of an ace and a <b>jack</b> (the bat card), any suits, pays <b>6 to 1</b>.</li>' +
      '<li>Dealer stands on all 17s (soft 17 included).</li><li>Dealer peeks for blackjack under an ace or a ten-value card. A dealer blackjack ends the round at once and you only lose your original bets; a player blackjack against it pushes.</li>' +
      '<li>Double down on any two cards, including after a split. One card on a double.</li><li>Split any two cards of the same value, up to four hands per seat. Split aces get one card each and cannot be split again. A 21 made after a split is not a blackjack.</li>' +
      '<li>Insurance (when the dealer shows an ace) costs half of each main bet and pays 2 to 1 if the dealer has blackjack.' + (B.online ? '' : ' One answer covers every seat.') + '</li><li>No surrender.</li></ul>' +
      '<h3>House rule: dealer 22 pushes</h3><p>If the dealer busts with <b>exactly 22</b>, every hand still standing is a push (your stake comes back). Blackjacks have already been paid. This is what pays for the 6 to 1 Bat Jack. It happens in about 5.9% of rounds.</p>' +
      '<h3>Perfect Pairs</h3><p>Pays on your first two cards.</p><table><tr><th>Hand</th><th>Pays</th></tr>' + pp + '</table>' +
      '<h3>21+3</h3><p>Your first two cards plus the dealer\'s up card, as a three-card poker hand. Ace counts high or low in a straight.</p><table><tr><th>Hand</th><th>Pays</th></tr>' + t3 + '</table>' +
      '<h3>Bat Advice</h3><p>Turn on Bat Advice and the correct basic-strategy move for these exact rules is marked on the buttons. It never takes insurance. Players who follow it get the designed return below.</p>' +
      '<h3>Leaving mid-hand</h3><p>If you leave a hand unfinished, insurance is declined and every remaining hand stands; the dealer then plays it out and it is paid as normal.</p>' +
      '<h3>Return</h3><table><tr><th>Bet</th><th>Designed return</th></tr>' +
      '<tr><td>Main bet, Bat Advice</td><td>97.85%</td></tr><tr><td>Main bet on the live table (10,000,000 simulated hands)</td><td>98.03%</td></tr><tr><td>Perfect Pairs (exact)</td><td>98.07%</td></tr><tr><td>21+3 (exact)</td><td>98.12%</td></tr>' +
      '<tr><td>Insurance (optional, never advised)</td><td>92.61%</td></tr></table>' +
      '<p class="rtp">Designed return 97.85% (main bet, Bat Advice; exact analysis 97.854%, confirmed by 40,000,000 simulated hands). Perfect Pairs 98.07%, 21+3 98.12%. Live-balanced site-wide to a 98% target.</p>';
  }

  /* ============================== the game ============================== */
  let S = null, G = null;
  const mem = { chip: 2, last: null, advice: true, quick: false, hist: [] };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) { if (raw.chip >= 0 && raw.chip < M.CHIPS.length) mem.chip = raw.chip | 0; if (Array.isArray(raw.last)) mem.last = raw.last; mem.advice = raw.advice !== false; mem.quick = !!raw.quick; if (Array.isArray(raw.hist)) mem.hist = raw.hist.slice(0, 30); } } catch (e) { /* memory only */ }
  const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify({ chip: mem.chip, last: mem.last, advice: mem.advice, quick: mem.quick, hist: mem.hist.slice(0, 30) })); } catch (e) { /* memory only */ } };

  const snd = {
    deal() { B.audio.noise({ d: 0.07, v: 0.16, hp: 2400, f2: 7000 }); B.audio.tone({ f: 190, f2: 120, d: 0.05, type: 'sine', v: 0.08, t: 0.04 }); },
    flip() { B.audio.noise({ d: 0.09, v: 0.14, hp: 1500, f2: 5000 }); B.audio.tone({ f: 520, f2: 260, d: 0.08, type: 'triangle', v: 0.06 }); },
    chip() { B.sfx('chip'); B.audio.tone({ f: 3200, d: 0.03, type: 'square', v: 0.03, t: 0.03 }); },
    slide() { B.audio.noise({ d: 0.22, v: 0.08, lp: 1800, f2: 600 }); },
    organ(notes, step, v) { B.audio.seq(notes, { step: step || 0.16, type: 'sawtooth', v: v || 0.06, d: (step || 0.16) * 2.2 }); B.audio.seq(notes.map((n) => (Array.isArray(n) ? [n[0] / 2, n[1]] : n / 2)), { step: step || 0.16, type: 'triangle', v: (v || 0.06) * 1.4, d: (step || 0.16) * 2.2 }); },
    win() { snd.organ([392, 466.2, 587.3, [784, 3]], 0.11, 0.05); },
    bj() { snd.organ([293.7, 349.2, 440, 587.3, [698.5, 4]], 0.1, 0.06); B.audio.tone({ f: 1568, d: 0.9, type: 'sine', v: 0.08, t: 0.4 }); },
    batjack() { B.audio.tone({ f: 2400, f2: 5200, d: 0.14, type: 'square', v: 0.05 }); B.audio.tone({ f: 2800, f2: 6000, d: 0.12, type: 'square', v: 0.04, t: 0.16 }); snd.organ([146.8, 220, 293.7, 349.2, 440, [587.3, 6]], 0.12, 0.08); B.sfx('thunder'); },
    lose() { B.audio.tone({ f: 130, f2: 70, d: 0.35, type: 'sawtooth', v: 0.06 }); },
    bust() { B.audio.tone({ f: 98, f2: 40, d: 0.4, type: 'sine', v: 0.32 }); B.audio.noise({ d: 0.18, v: 0.1, lp: 600 }); },
    push() { B.audio.tone({ f: 660, d: 0.12, type: 'triangle', v: 0.08 }); B.audio.tone({ f: 660, d: 0.12, type: 'triangle', v: 0.06, t: 0.14 }); },
    reveal() { B.sfx('drum'); },
    turn() { B.audio.tone({ f: 880, d: 0.06, type: 'sine', v: 0.06 }); },
    wings() { for (let i = 0; i < 4; i++) B.audio.noise({ d: 0.07, v: 0.05, lp: 700, t: i * 0.09 }); },
    side() { B.audio.seq([1046.5, 1318.5, 1568], { step: 0.06, type: 'square', v: 0.05 }); },
  };

  function mount(root) {
    S = B.scope();
    const dev = /dev/.test(location.search) ? (window.__batjackDev = { force: null, rounds: 0, staked: 0, won: 0, last: null }) : null;
    const g = { phase: 'bet', bets: [0, 1, 2].map(() => ({ main: 0, pp: 0, t3: 0 })), undo: [], v: null, rid: 0, seq: 0, local: null, busy: false, dead: false, lastWin: 0 };
    G = g;
    const live = B.online;
    /* LIVE: the shared table. L.st is the last state from the server; the director turns it into the felt. */
    const L = { st: null, off: null, best: 1e9, age: 0, polling: false, others: [null, null], confirmed: 0, sending: false, dirty: false, shown: null, settled: {}, done: {}, running: false, again: false, lastTick: 0 };
    const nowS = () => Date.now() / 1000 + (L.off || 0);
    const T = (ms) => (reduce ? Math.min(ms, 120) : mem.quick ? ms * 0.45 : ms);

    /* ---------- DOM ---------- */
    root.innerHTML = DEFS;
    const el = {};
    const seatEls = [0, 1, 2].map((i) => {
      const hands = h('div', { class: 'bj-hands' });
      const mk = (k, label) => {
        const stack = h('div', { class: 'bj-stack' }), amt = h('b', { class: 'bj-amt' });
        const spot = h('button', { type: 'button', class: 'bj-spot bj-' + k, 'data-seat': i, 'data-k': k, 'aria-label': 'Seat ' + (i + 1) + ' ' + label }, h('span', { class: 'bj-ring' }, h('i', null, label)), stack, amt);
        spot.addEventListener('click', () => addChip(i, k));
        spot.addEventListener('contextmenu', (e) => { e.preventDefault(); removeBet(i, k); });
        return { spot, stack, amt };
      };
      const pp = mk('pp', 'PAIRS'), main = mk('main', 'SEAT ' + (i + 1)), t3 = mk('t3', '21+3');
      const note = h('div', { class: 'bj-note' });
      const plate = h('div', { class: 'bj-plate' });
      const wrap = h('div', { class: 'bj-seat', 'data-i': i }, plate, hands, h('div', { class: 'bj-spots' }, pp.spot, main.spot, t3.spot), note);
      return { wrap, hands, pp, main, t3, note, plate, handEls: [] };
    });
    const dealerCards = h('div', { class: 'bj-cards bj-dcards' });
    const dealerBadge = h('div', { class: 'bj-badge bj-dbadge' });
    const shoe = h('div', { class: 'bj-shoe', html: SHOE_SVG });
    const discard = h('div', { class: 'bj-discard' }, h('span', null, 'DISCARD'));
    el.msg = h('div', { class: 'bj-msg', role: 'status' }, h('span', null, 'Place your bets'));
    const print = h('div', { class: 'bj-print', html: '<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><defs>' +
      '<path id="batjack-arc1" d="M70 40 Q500 330 930 40"/><path id="batjack-arc2" d="M110 26 Q500 290 890 26"/></defs>' +
      '<path d="' + B.batPath + '" transform="translate(368 22) scale(2.2)" fill="#e2bd62" opacity=".07"/>' +
      '<path d="M40 30 Q500 360 960 30" fill="none" stroke="#c99a35" stroke-width="2" opacity=".7"/><path d="M120 34 Q500 300 880 34" fill="none" stroke="#c99a35" stroke-width="1.2" opacity=".45"/>' +
      '<text class="p1"><textPath href="#batjack-arc1" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2 · BAT JACK PAYS 6 TO 1</textPath></text>' +
      '<text class="p2"><textPath href="#batjack-arc2" startOffset="50%" text-anchor="middle">DEALER STANDS ON ALL 17s · DEALER 22 PUSHES · INSURANCE PAYS 2 TO 1</textPath></text></svg>' });
    const table = h('div', { class: 'bj-table' }, print,
      h('div', { class: 'bj-top' }, discard, h('div', { class: 'bj-dealer' }, h('div', { class: 'bj-tray', html: traySvg() }), h('div', { class: 'bj-dlabel' }, 'DEALER'), dealerCards, dealerBadge), shoe),
      el.msg,
      h('div', { class: 'bj-seats' }, seatEls.map((s) => s.wrap)));
    el.timer = h('div', { class: 'bj-timer', hidden: true, html: '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><circle class="v" cx="22" cy="22" r="19"/></svg><b></b><small></small>' });
    el.rail = h('aside', { class: 'bj-rail', 'aria-label': 'Players at the table' });
    el.hist = h('div', { class: 'bj-dhist', 'aria-label': 'Dealer results' });
    if (live) table.append(el.timer);
    const room = h('div', { class: 'bj-room' + (live ? ' bj-live' : '') }, h('div', { class: 'bj-candles', 'aria-hidden': 'true' }, h('i'), h('i')), table, live ? el.rail : null, live ? el.hist : null);

    /* control bar */
    const btn = (cls, label, key, fn) => { const b = h('button', { type: 'button', class: 'bj-btn ' + cls }, h('span', null, label), key ? h('kbd', null, key) : null); b.addEventListener('click', () => { B.audio.ensure(); fn(); }); return b; };
    el.chips = h('div', { class: 'bj-chips', role: 'radiogroup', 'aria-label': 'Chip value' });
    M.CHIPS.forEach((v, i) => { const c = h('button', { type: 'button', class: 'bj-chip', role: 'radio', 'data-v': v, 'aria-label': fmt(v) + ' BB chip', html: chipSvg(v) }); c.addEventListener('click', () => { mem.chip = i; saveMem(); snd.chip(); paintChips(); }); el.chips.append(c); });
    el.clear = btn('ghost', 'Clear', 'C', () => clearBets());
    el.undo = btn('ghost', 'Undo', 'U', () => undo());
    el.x2 = btn('ghost', '×2 Bets', 'X', () => doubleBets());
    el.rebet = btn('ghost', 'Rebet', 'R', () => rebet(false));
    el.deal = btn('primary', 'Deal', 'Space', () => dealOrRebet());
    el.hit = btn('act hit', 'Hit', 'H', () => act('hit'));
    el.stand = btn('act stand', 'Stand', 'S', () => act('stand'));
    el.dbl = btn('act dbl', 'Double', 'D', () => act('double'));
    el.split = btn('act split', 'Split', 'P', () => act('split'));
    el.insY = btn('act ins', 'Insure', 'I', () => insure(true));
    el.insN = btn('act noins', 'No insurance', 'N', () => insure(false));
    el.advice = h('button', { type: 'button', class: 'bj-tog', 'aria-pressed': 'false', title: 'Bat Advice (A)' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg>' }), h('span', null, 'Bat Advice'));
    el.advice.addEventListener('click', () => { mem.advice = !mem.advice; saveMem(); B.sfx('click'); paintAdvice(); });
    el.quick = h('button', { type: 'button', class: 'bj-tog', 'aria-pressed': 'false', title: 'Quick deal (Q)' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>' }), h('span', null, 'Quick'));
    el.quick.addEventListener('click', () => { mem.quick = !mem.quick; saveMem(); B.sfx('click'); paintToggles(); });
    el.histB = h('button', { type: 'button', class: 'bj-tog', title: 'Hand history' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }), h('span', null, 'History'));
    el.histB.addEventListener('click', () => showHistory());
    el.total = h('b', null, '0'); el.win = h('b', null, '0');
    const info = h('div', { class: 'bj-info' }, h('span', null, h('small', null, 'Total bet'), el.total), h('span', null, h('small', null, 'Last win'), el.win));
    el.betRow = h('div', { class: 'bj-row bj-betrow' }, el.clear, el.undo, el.x2, el.rebet, el.deal);
    el.actRow = h('div', { class: 'bj-row bj-actrow' }, el.split, el.dbl, el.hit, el.stand);
    el.insRow = h('div', { class: 'bj-row bj-insrow' }, h('p', null, 'Dealer shows an ace. ', h('b', { class: 'bj-inscost' })), el.insN, el.insY);
    const bar = h('div', { class: 'bj-bar' }, h('div', { class: 'bj-bar-in' }, h('div', { class: 'bj-left' }, info, h('div', { class: 'bj-togs' }, el.advice, el.quick, el.histB)), el.chips, h('div', { class: 'bj-ctl' }, el.betRow, el.actRow, el.insRow)));
    el.banner = h('div', { class: 'bj-banner', 'aria-hidden': 'true' });
    root.append(room, bar, el.banner);

    /* ---------- layout: card size follows the table ---------- */
    function layout() {
      const r = table.getBoundingClientRect(); if (!r.width) return;
      const phone = r.width < 620;
      /* the felt must fit between the top bar and the sticky control bar: about 5.6 card widths + fixed parts tall */
      const avail = window.innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 56) - bar.offsetHeight - (phone ? 26 : 50);
      const cw = Math.max(34, Math.min(phone ? 62 : 84, r.width / (phone ? 6.2 : 13.5), (avail - (phone ? 140 : 175) - (live ? (phone ? 30 : 34) : 0)) / (phone ? 6.0 : 5.7)));
      root.style.setProperty('--cw', cw.toFixed(1) + 'px');
      root.classList.toggle('bj-phone', phone);
    }
    const ro = new ResizeObserver(layout); ro.observe(root); ro.observe(bar); S.on(window, 'resize', layout); layout();

    /* ---------- painting ---------- */
    function msg(text, cls) { el.msg.className = 'bj-msg' + (cls ? ' ' + cls : ''); el.msg.firstChild.textContent = text; }
    function paintChips() { [...el.chips.children].forEach((c, i) => { c.classList.toggle('on', i === mem.chip); c.setAttribute('aria-checked', i === mem.chip ? 'true' : 'false'); }); }
    function paintToggles() { el.quick.setAttribute('aria-pressed', mem.quick ? 'true' : 'false'); el.advice.setAttribute('aria-pressed', mem.advice ? 'true' : 'false'); }
    function stackHtml(n) { const cs = chipsFor(n).reverse().slice(-6); return cs.map((v, k) => '<span style="--k:' + k + '">' + chipSvg(v) + '</span>').join(''); }
    function paintSpot(sp, n) { sp.stack.innerHTML = n ? stackHtml(n) : ''; sp.amt.textContent = n ? fmt(n) : ''; sp.spot.classList.toggle('has', n > 0); }
    function betSeats() { return g.phase === 'bet' ? g.bets : g.v ? g.v.seats.map((s) => ({ main: s.main, pp: s.pp, t3: s.t3 })) : g.bets; }
    function paintBets() {
      if (live) {
        const me = g.phase === 'bet' ? g.bets[1] : L.st && L.st.mine ? (L.st.mine.v ? L.st.mine.v.seats[0] : L.st.mine.bet) : g.bets[1];
        const bs = [L.others[0] || { main: 0, pp: 0, t3: 0 }, me || { main: 0, pp: 0, t3: 0 }, L.others[1] || { main: 0, pp: 0, t3: 0 }];
        bs.forEach((b, i) => { const s = seatEls[i]; paintSpot(s.main, b.main); paintSpot(s.pp, b.pp); paintSpot(s.t3, b.t3); s.wrap.classList.toggle('empty', !b.main); });
        el.total.textContent = fmt(g.phase === 'bet' ? M.betCost([g.bets[1]]) : L.st && L.st.mine ? L.st.mine.stake : 0);
        paintPlates();
        return;
      }
      const bs = betSeats();
      bs.forEach((b, i) => { const s = seatEls[i]; paintSpot(s.main, b.main); paintSpot(s.pp, b.pp); paintSpot(s.t3, b.t3); s.wrap.classList.toggle('empty', !b.main); });
      el.total.textContent = fmt(g.phase === 'bet' ? M.betCost(g.bets) : g.v ? g.v.staked : 0);
    }
    function controls() {
      const ph = g.phase, idle = ph === 'bet' && !g.busy;
      root.dataset.phase = g.busy ? 'busy' : ph;
      el.betRow.hidden = !(ph === 'bet'); el.actRow.hidden = ph !== 'player'; el.insRow.hidden = ph !== 'insurance';
      el.chips.classList.toggle('off', ph !== 'bet');
      const cost = M.betCost(g.bets), has = g.bets.some((b) => b.main);
      el.clear.disabled = !idle || !cost; el.undo.disabled = !idle || !g.undo.length; el.x2.disabled = !idle || !has;
      el.rebet.disabled = !idle || !mem.last || has;
      el.deal.disabled = !idle || (!has && !mem.last);
      el.deal.hidden = live;
      el.deal.firstChild.textContent = has ? 'Deal' : mem.last ? 'Rebet & Deal' : 'Deal';
      const lg = g.v && ph === 'player' ? g.v.legal : [];
      for (const k of ['hit', 'stand', 'split']) el[k].disabled = g.busy || lg.indexOf(k) < 0;
      el.dbl.disabled = g.busy || lg.indexOf('double') < 0;
      el.insY.disabled = el.insN.disabled = g.busy || ph !== 'insurance';
      seatEls.forEach((s, i) => { for (const k of ['main', 'pp', 't3']) s[k].spot.disabled = !idle || (live && i !== 1); });
      paintAdvice();
    }
    function advised() {
      if (!g.v || g.busy) return null;
      if (g.phase === 'insurance') return 'noins';
      if (g.phase !== 'player') return null;
      const [si, hi] = g.v.cur, hd = g.v.seats[si].hands[hi];
      return M.adviseCards(hd.cards, g.v.dealer.cards[0], g.v.legal);
    }
    function paintAdvice() {
      paintToggles();
      const a = mem.advice ? advised() : null;
      for (const [k, b] of [['hit', el.hit], ['stand', el.stand], ['double', el.dbl], ['split', el.split], ['noins', el.insN]]) b.classList.toggle('advised', a === k);
    }

    /* ---------- cards on the table ---------- */
    function makeCard(code) {
      const c = h('div', { class: 'bj-card' + (code < 0 ? ' down' : ''), 'data-c': code });
      c.innerHTML = '<div class="bj-cin"><div class="bj-face">' + (code >= 0 ? faceSvg(code) : '') + '</div><div class="bj-back">' + BACK_SVG + '</div></div>';
      return c;
    }
    function setFace(c, code) { c.querySelector('.bj-face').innerHTML = faceSvg(code); c.dataset.c = code; }
    function flyFrom(card, fromRect, flip, ms) {
      const to = card.getBoundingClientRect();
      const dx = fromRect.left + fromRect.width / 2 - (to.left + to.width / 2), dy = fromRect.top + fromRect.height / 2 - (to.top + to.height / 2);
      const sc = 0.72;
      if (reduce) return Promise.resolve();
      const a = card.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(-28deg) scale(' + sc.toFixed(2) + ')', opacity: 0.6 },
        { transform: 'translate(' + dx * 0.4 + 'px,' + (dy * 0.4 - 26) + 'px) rotate(-8deg) scale(1.06)', opacity: 1, offset: 0.55 },
        { transform: 'none', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.2,.75,.25,1)' });
      if (flip) { const cin = card.querySelector('.bj-cin'); cin.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.45 }, { transform: 'rotateY(0deg)' }], { duration: ms, easing: 'ease-out' }); }
      return a.finished.catch(() => {});
    }
    function newHandBox() {
      const cards = h('div', { class: 'bj-cards' }), badge = h('div', { class: 'bj-badge' }), res = h('div', { class: 'bj-res' }), bet = h('div', { class: 'bj-hbet' });
      const box = h('div', { class: 'bj-hand' }, res, cards, h('div', { class: 'bj-hfoot' }, badge, bet));
      return { box, cards, badge, res, bet };
    }
    function badge(elB, cards, extra) {
      elB.classList.remove('soft', 'bust', 'bj', 'twentyone');
      if (!cards.length) { elB.textContent = ''; return; }
      const t = M.total(cards), nat = cards.length === 2 && t.t === 21 && !extra.split;
      elB.textContent = nat ? (M.isBatJack(cards) ? 'BAT JACK' : 'BLACKJACK') : t.t > 21 ? t.t + ' BUST' : t.soft && t.t < 21 && !extra.done ? (t.t - 10) + ' / ' + t.t : String(t.t);
      elB.classList.toggle('soft', t.soft && !nat); elB.classList.toggle('bust', t.t > 21); elB.classList.toggle('bj', nat); elB.classList.toggle('twentyone', t.t === 21 && !nat);
    }
    function clearTable() {
      for (const s of seatEls) { s.hands.textContent = ''; s.handEls = []; s.note.textContent = ''; s.note.className = 'bj-note'; s.wrap.classList.remove('turn'); }
      dealerCards.textContent = ''; dealerBadge.textContent = ''; dealerBadge.className = 'bj-badge bj-dbadge'; dealerBadge.hidden = true;
    }
    /* Bring the table from what it shows (prev) to view v, animating every new card in dealing order. */
    async function present(v, prev) {
      const initial = !prev;
      const shoeR = shoe.getBoundingClientRect();
      const jobs = [];
      /* players: cards already on the felt stay; a split moves the second card into a new hand */
      v.seats.forEach((st, i) => {
        if (!st.main) return;
        const s = seatEls[i];
        const before = new Map(); s.handEls.forEach((hb) => [...hb.cards.children].forEach((c) => before.set(c, c.getBoundingClientRect())));
        if (prev && prev.phase === 'player' && prev.cur && prev.cur[0] === i && st.hands.length === s.handEls.length + 1) {
          const hi = prev.cur[1], src = s.handEls[hi], nb = newHandBox();
          s.handEls.splice(hi + 1, 0, nb);
          const moved = src.cards.children[1]; if (moved) nb.cards.append(moved);
        }
        while (s.handEls.length < st.hands.length) s.handEls.push(newHandBox());
        s.hands.textContent = ''; s.handEls.forEach((hb) => s.hands.append(hb.box));
        s.hands.dataset.n = st.hands.length;
        st.hands.forEach((hd, j) => {
          const hb = s.handEls[j], old = [...hb.cards.children];
          let k0 = 0; while (k0 < old.length && k0 < hd.cards.length && +old[k0].dataset.c === hd.cards[k0]) k0++;
          old.slice(k0).forEach((c) => c.remove());
          for (let k = k0; k < hd.cards.length; k++) {
            const c = makeCard(hd.cards[k]); c.dataset.new = '1'; hb.cards.append(c);
            jobs.push({ c, order: initial ? (k === 0 ? i : 10 + i + k * 0.001) : 100 + i * 10 + j + k * 0.01 });
          }
          hb.cards.style.setProperty('--n', hd.cards.length);
          hb.box.classList.toggle('dbl', hd.dbl);
          hb.bet.innerHTML = st.hands.length > 1 || hd.dbl ? chipSvg(chipsFor(hd.bet)[0] || 10, 16) + '<span>' + fmt(hd.bet) + (hd.dbl ? ' · DOUBLED' : '') + '</span>' : '';
        });
        if (!reduce) for (const [c, r0] of before) if (c.isConnected) {
          const r1 = c.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
          if (Math.abs(dx) + Math.abs(dy) > 2) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: T(380), easing: 'cubic-bezier(.3,.8,.3,1)' });
        }
      });
      /* dealer */
      const dEls = [...dealerCards.children];
      const dShow = v.dealer.hole ? v.dealer.cards.concat([-1]) : v.dealer.cards;
      dShow.forEach((code, k) => {
        let c = dEls[k];
        if (c && code >= 0 && +c.dataset.c < 0) jobs.push({ c, flipTo: code, dealer: true, k, order: 200 + k });
        else if (!c) { c = makeCard(code); c.dataset.new = '1'; dealerCards.append(c); jobs.push({ c, dealer: true, k, order: initial ? (k === 0 ? 5 : k === 1 ? 15 : 300 + k) : 200 + k }); }
      });
      dealerCards.style.setProperty('--n', dShow.length);
      jobs.sort((a, b) => a.order - b.order);
      /* hide the cards still to come so totals and positions stay honest */
      for (const j of jobs) if (j.c.dataset.new) j.c.style.visibility = 'hidden';
      paintBadges(v, true);
      let dealerDrew = false;
      for (const j of jobs) {
        if (g.dead) return;
        if (j.flipTo !== undefined) {
          await S.sleep(T(320)); snd.reveal();
          setFace(j.c, j.flipTo); j.c.classList.remove('down'); snd.flip();
          await S.sleep(T(420)); paintBadges(v, true);
          continue;
        }
        if (j.dealer && !initial && j.k >= 2) { if (!dealerDrew) await S.sleep(T(260)); dealerDrew = true; await S.sleep(T(380)); }
        j.c.style.visibility = ''; delete j.c.dataset.new;
        snd.deal();
        const p = flyFrom(j.c, shoeR, j.c.dataset.c >= 0, T(460));
        await S.sleep(T(initial ? 230 : 300));
        p.then(() => { if (!g.dead) paintBadges(v, true); });
      }
      await S.sleep(T(jobs.length ? 300 : 0));
      if (g.dead) return;
      paintBadges(v, false);
    }
    /* totals from the cards actually visible on the felt */
    function visibleCodes(cont) { return [...cont.children].filter((c) => c.style.visibility !== 'hidden' && +c.dataset.c >= 0).map((c) => +c.dataset.c); }
    function paintBadges(v, partial) {
      v.seats.forEach((st, i) => {
        const s = seatEls[i];
        st.hands.forEach((hd, j) => {
          const hb = s.handEls[j]; if (!hb) return;
          badge(hb.badge, partial ? visibleCodes(hb.cards) : hd.cards, { split: hd.fromSplit, done: hd.done && v.phase === 'done' });
          const cur = v.phase === 'player' && v.cur && v.cur[0] === i && v.cur[1] === j && !partial;
          hb.box.classList.toggle('cur', cur);
        });
        s.wrap.classList.toggle('turn', v.phase === 'player' && v.cur && v.cur[0] === i && !partial);
      });
      const dv = visibleCodes(dealerCards);
      badge(dealerBadge, dv, { done: true });
      dealerBadge.hidden = !dv.length;
    }

    /* ---------- betting ---------- */
    function snapshot() { return g.bets.map((b) => ({ main: b.main, pp: b.pp, t3: b.t3 })); }
    function addChip(i, k) {
      if (g.phase !== 'bet' || g.busy) return;
      if (live && i !== 1) return;
      B.audio.ensure();
      const v = M.CHIPS[mem.chip], b = g.bets[i];
      if (k !== 'main' && !b.main) { B.ui.toast('Put a main bet on seat ' + (i + 1) + ' first.'); B.sfx('click'); return; }
      const cap = k === 'main' ? M.LIMITS.mainMax : M.LIMITS.sideMax;
      if (b[k] >= cap) { B.ui.toast((k === 'main' ? 'Main bets' : 'Side bets') + ' are up to ' + fmt(cap) + ' BB.'); return; }
      const add = Math.min(v, cap - b[k]);
      if (M.betCost(g.bets) + add - (live ? L.confirmed : 0) > B.wallet.balance) { B.ui.broke(); return; }
      g.undo.push(snapshot()); if (g.undo.length > 60) g.undo.shift();
      b[k] += add;
      /* chip flies from the rack */
      const rack = el.chips.children[mem.chip], spot = seatEls[i][k].spot;
      if (rack && !reduce) {
        const r0 = rack.getBoundingClientRect(), r1 = spot.getBoundingClientRect();
        const fly = h('div', { class: 'g-batjack-fly', html: chipSvg(v, r0.width) });
        fly.style.left = r0.left + 'px'; fly.style.top = r0.top + 'px'; document.body.append(fly);
        fly.animate([{ transform: 'none' }, { transform: 'translate(' + (r1.left + r1.width / 2 - r0.left - r0.width / 2) + 'px,' + (r1.top + r1.height / 2 - r0.top - r0.height / 2) + 'px) scale(.8)' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.4,1)' }).finished.then(() => fly.remove(), () => fly.remove());
        S.timeout(() => fly.remove(), 400);
      }
      snd.chip(); paintBets(); controls(); queueSend();
    }
    function removeBet(i, k) {
      if (g.phase !== 'bet' || g.busy || !g.bets[i][k]) return;
      g.undo.push(snapshot());
      g.bets[i][k] = 0; if (k === 'main') { g.bets[i].pp = 0; g.bets[i].t3 = 0; }
      B.sfx('click'); paintBets(); controls(); queueSend();
    }
    function clearBets() { if (g.phase !== 'bet' || g.busy) return; if (M.betCost(g.bets)) g.undo.push(snapshot()); g.bets = [0, 1, 2].map(() => ({ main: 0, pp: 0, t3: 0 })); snd.slide(); paintBets(); controls(); queueSend(); }
    function undo() { if (g.phase !== 'bet' || g.busy || !g.undo.length) return; g.bets = g.undo.pop(); B.sfx('click'); paintBets(); controls(); queueSend(); }
    function doubleBets() {
      if (g.phase !== 'bet' || g.busy) return;
      const nb = g.bets.map((b) => ({ main: Math.min(M.LIMITS.mainMax, b.main * 2), pp: Math.min(M.LIMITS.sideMax, b.pp * 2), t3: Math.min(M.LIMITS.sideMax, b.t3 * 2) }));
      if (M.betCost(nb) - (live ? L.confirmed : 0) > B.wallet.balance) { B.ui.broke(); return; }
      g.undo.push(snapshot()); g.bets = nb; snd.chip(); S.timeout(snd.chip, 70); paintBets(); controls(); queueSend();
    }
    function rebet(andDeal) {
      if (g.phase !== 'bet' || g.busy || !mem.last) return false;
      let nb = mem.last.map((b) => ({ main: b.main | 0, pp: b.pp | 0, t3: b.t3 | 0 }));
      if (live) { const one = nb.find((b) => b.main) || nb[1]; nb = [{ main: 0, pp: 0, t3: 0 }, { main: one.main, pp: one.pp, t3: one.t3 }, { main: 0, pp: 0, t3: 0 }]; }
      if (M.checkBets(nb)) return false;
      if (M.betCost(nb) - (live ? L.confirmed : 0) > B.wallet.balance) { B.ui.broke(); return false; }
      g.undo.push(snapshot()); g.bets = nb; snd.chip(); paintBets(); controls(); queueSend();
      if (andDeal && !live) deal();
      return true;
    }
    function dealOrRebet() { if (live) { if (!g.bets[1].main) rebet(false); return; } if (g.bets.some((b) => b.main)) deal(); else rebet(true); }

    /* ---------- a round ---------- */
    function forced(bets) {
      const f = dev && dev.force; if (dev) dev.force = null;
      const want = {
        ace: (S2) => M.valOf(S2.dealer[0]) === 1, pair: (S2) => S2.seats.some((s) => s.main && M.valOf(s.hands[0].cards[0]) === M.valOf(s.hands[0].cards[1])),
        aces: (S2) => S2.seats.some((s) => s.main && M.valOf(s.hands[0].cards[0]) === 1 && M.valOf(s.hands[0].cards[1]) === 1),
        batjack: (S2) => S2.seats.some((s) => s.main && s.hands[0].res === 'batjack' || (s.main && M.isBatJack(s.hands[0].cards))) && M.valOf(S2.dealer[0]) !== 1 && !S2.dealerBJ,
        dealerbj: (S2) => S2.dealerBJ, perfect: (S2) => S2.seats.some((s) => s.ppKind === 'perfect'), eleven: (S2) => S2.seats.some((s) => s.main && M.total(s.hands[0].cards).t === 11 && !M.total(s.hands[0].cards).soft) && M.valOf(S2.dealer[0]) < 7,
      }[f];
      for (let n = 0; n < 50000; n++) { const s2 = M.deal(B.rng, bets); if (!want || want(s2)) return s2; }
      return M.deal(B.rng, bets);
    }
    async function deal() {
      if (g.phase !== 'bet' || g.busy) return;
      const bets = snapshot();
      const err = M.checkBets(bets); if (err) { B.ui.toast(err); return; }
      const cost = M.betCost(bets);
      if (!B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      g.busy = true; controls();
      mem.last = bets; saveMem();
      await sweep();
      let v;
      if (B.online) {
        const r = await B.play(ID, 'deal', { bets }, cost);
        if (g.dead) return;
        if (!r) { g.busy = false; controls(); return; }
        v = r.v; g.rid = r.round; g.seq = r.seq;
      } else {
        g.local = forced(bets); v = M.view(g.local); g.rid = 0; g.seq = 0;
        if (dev) { dev.rounds++; dev.staked += cost; dev.last = g.local; }
      }
      g.v = v; g.phase = v.phase; g.startBets = bets;
      paintBets();
      msg('Good luck', 'quiet');
      await present(v, null);
      if (g.dead) return;
      await sideResults(v);
      await afterStep(v);
    }
    async function sideResults(v) {
      let any = false;
      for (let i = 0; i < 3; i++) {
        const st = v.seats[i]; if (!st.main) continue;
        const bits = [];
        if (st.pp) bits.push(st.ppKind ? '<b>' + PP_NAME[st.ppKind] + '</b> +' + fmt(st.ppWin - st.pp) : '<s>Pairs</s>');
        if (st.t3) bits.push(st.t3Kind ? '<b>' + T3_NAME[st.t3Kind] + '</b> +' + fmt(st.t3Win - st.t3) : '<s>21+3</s>');
        if (!bits.length) continue;
        const s = seatEls[i];
        s.note.innerHTML = bits.join(' · '); s.note.className = 'bj-note show' + (st.ppWin || st.t3Win ? ' hit' : '');
        if (st.ppWin) { s.pp.spot.classList.add('paid'); any = true; } else if (st.pp) s.pp.spot.classList.add('lost');
        if (st.t3Win) { s.t3.spot.classList.add('paid'); any = true; } else if (st.t3) s.t3.spot.classList.add('lost');
        if (st.ppWin || st.t3Win) B.fx.burst({ el: (st.ppWin ? s.pp : s.t3).spot, kind: 'coin', count: 18, power: 0.6 });
      }
      if (any) { snd.side(); await S.sleep(T(700)); }
    }
    /* after every server/maths step: turn indicator, messages, or the end of the round */
    async function afterStep(v) {
      if (g.dead) return;
      g.phase = v.phase;
      if (v.phase === 'insurance') {
        el.insRow.querySelector('.bj-inscost').textContent = 'Insurance costs ' + fmt(v.insCost) + ' BB.';
        msg('Dealer shows an ace. Insurance?', 'ask'); snd.turn();
      } else if (v.phase === 'player') {
        const [si, hi] = v.cur, hd = v.seats[si].hands[hi];
        const many = v.seats[si].hands.length > 1;
        const t = M.total(hd.cards), up = M.valOf(v.dealer.cards[0]);
        let text = (live ? 'Your hand' : 'Seat ' + (si + 1)) + (many ? ' · hand ' + (hi + 1) : '') + ': ' + (t.soft ? 'soft ' : '') + t.t + ' against ' + (up === 1 ? 'an ace' : up === 10 ? 'a ten' : up === 8 ? 'an 8' : 'a ' + up);
        if (mem.advice) { const a = M.adviseCards(hd.cards, v.dealer.cards[0], v.legal); text += '  ·  Bat Advice: ' + ACT_NAME[a]; }
        msg(text, 'turn'); snd.turn();
      } else if (v.phase === 'done') { await finish(v); return; }
      g.busy = false; controls(); paintBadges(v, false);
    }
    async function act(a) {
      if (g.phase !== 'player' || g.busy || !g.v || g.v.legal.indexOf(a) < 0) return;
      const [si, hi] = g.v.cur, cost = a === 'double' || a === 'split' ? g.v.seats[si].hands[hi].bet : 0;
      if (cost && !B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      g.busy = true; controls();
      B.sfx('click');
      if (cost) snd.chip();
      let v;
      if (live) {
        const r = await B.play(ID, 'act', { round: g.rid, move: a, seq: g.seq }, cost);
        if (g.dead) return;
        if (r && L.st && L.st.mine) { L.st.mine.v = r.v; L.st.mine.seq = r.seq; L.st.mine.stake = r.stake; g.seq = r.seq; }
        g.busy = false; B.wallet.sync();
        if (r && a === 'stand') { const hb = seatEls[1].handEls[hi]; if (hb) hb.box.classList.add('stood'); }
        direct();
        return;
      } else if (B.online) {
        const r = await B.play(ID, a, { round: g.rid, seq: g.seq }, cost);
        if (g.dead) return;
        if (!r) { await resync(); return; }
        v = r.v; g.seq = r.seq;
      } else { const e = M.act(g.local, a); if (e) { B.wallet.unbet(cost); B.ui.toast(e); g.busy = false; controls(); return; } v = M.view(g.local); if (dev && cost) dev.staked += cost; }
      const prev = g.v; g.v = v; paintBets();
      if (a === 'stand') { const hb = seatEls[si].handEls[hi]; if (hb) hb.box.classList.add('stood'); }
      await present(v, prev);
      if (g.dead) return;
      const hd = v.seats[si].hands[hi];
      if (hd && M.total(hd.cards).t > 21) { snd.bust(); const hb = seatEls[si].handEls[hi]; if (hb) hb.box.classList.add('busted'); }
      await afterStep(v);
    }
    async function insure(take) {
      if (g.phase !== 'insurance' || g.busy) return;
      const cost = take ? g.v.insCost : 0;
      if (cost && !B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      g.busy = true; controls(); B.sfx('click'); if (cost) snd.chip();
      let v;
      if (live) {
        const r = await B.play(ID, 'insure', { round: g.rid, seq: g.seq, take }, cost);
        if (g.dead) return;
        if (r && L.st && L.st.mine) { L.st.mine.v = r.v; L.st.mine.seq = r.seq; L.st.mine.stake = r.stake; g.seq = r.seq; }
        g.busy = false; B.wallet.sync();
        msg(take ? 'Insured. The dealer peeks when the timer ends' : 'No insurance. The dealer peeks when the timer ends', 'quiet');
        direct();
        return;
      }
      if (B.online) {
        const r = await B.play(ID, 'insure', { round: g.rid, seq: g.seq, take }, cost);
        if (g.dead) return;
        if (!r) { await resync(); return; }
        v = r.v; g.seq = r.seq;
      } else { M.insure(g.local, take); v = M.view(g.local); if (dev && cost) dev.staked += cost; }
      const prev = g.v; g.v = v; paintBets();
      msg(v.dealer.bj ? 'Dealer has blackjack' : 'Dealer peeks… no blackjack', v.dealer.bj ? 'bad' : 'quiet');
      await S.sleep(T(500));
      await present(v, prev);
      await afterStep(v);
    }
    /* online: a request failed mid-round; ask the server where we are */
    async function resync() {
      let r = null;
      try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { /* offline */ }
      if (g.dead) return;
      if (r && r.v) { const prev = g.v; g.v = r.v; g.rid = r.round; g.seq = r.seq; paintBets(); await present(r.v, prev); await afterStep(r.v); }
      else { g.busy = false; g.phase = 'bet'; B.wallet.sync(); controls(); msg('Place your bets'); }
    }
    async function finish(v) {
      g.busy = true; controls();
      B.wallet.win(ID, v.win, { silent: true });
      if (dev) dev.won += v.win;
      let best = null; const order = ['lose', 'bust', 'push', 'push22', 'win', 'blackjack', 'batjack'];
      v.seats.forEach((st, i) => {
        if (!st.main || (live && i !== 1)) return;
        const s = seatEls[i];
        st.hands.forEach((hd, j) => {
          const hb = s.handEls[j]; if (!hb || !hd.res) return;
          const profit = hd.win - hd.bet;
          hb.res.className = 'bj-res show r-' + hd.res;
          hb.res.innerHTML = '<b>' + RES_TEXT[hd.res] + '</b>' + (hd.win > hd.bet ? '<span>+' + fmt(profit) + '</span>' : '');
          hb.box.classList.add(hd.win > hd.bet ? 'won' : hd.win === hd.bet ? 'pushed' : 'lost');
          if (!best || order.indexOf(hd.res) > order.indexOf(best)) best = hd.res;
        });
        if (st.insWin) { s.note.innerHTML = (s.note.innerHTML ? s.note.innerHTML + ' · ' : '') + '<b>Insurance</b> +' + fmt(st.insWin - st.ins); s.note.className = 'bj-note show hit'; }
      });
      paintBadges(v, false);
      const net = v.win - v.staked;
      if (best === 'batjack') { batJackShow(); }
      else if (best === 'blackjack') snd.bj();
      else if (net > 0) snd.win(); else if (net === 0 && v.win) snd.push(); else snd.lose();
      msg(v.dealer.bj ? 'Dealer blackjack' + (v.win ? ' · paid ' + fmt(v.win) + ' BB' : '') : v.win > v.staked ? 'You win ' + fmt(v.win) + ' BB' : v.win === v.staked ? 'Stakes back · ' + fmt(v.win) + ' BB' : v.win ? 'Paid ' + fmt(v.win) + ' BB' : 'The house takes it. Next hand?', v.win > v.staked ? 'good' : v.win ? 'quiet' : 'bad');
      await chipsSettle(v);
      if (g.dead) return;
      g.lastWin = v.win; B.ui.countUp(el.win, 0, v.win, 600);
      record(v);
      await B.ui.celebrate({ amount: v.win, bet: v.staked });
      if (g.dead) return;
      B.wallet.sync();
      if (live) { g.phase = 'rest'; g.busy = false; controls(); return; }
      g.phase = 'bet'; g.busy = false; g.local = null;
      g.bets = g.startBets.map((b) => ({ main: 0, pp: 0, t3: 0 })); g.undo = [];
      controls();
    }
    function batJackShow() {
      snd.batjack(); snd.wings();
      el.banner.innerHTML = '<div><svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg><b>BAT JACK</b><span>pays 6 to 1</span></div>';
      el.banner.classList.remove('on'); void el.banner.offsetWidth; el.banner.classList.add('on');
      B.fx.burst({ el: el.banner, kind: 'spark', count: 60, colors: ['#f3d98b', '#c99a35', '#ffffff', '#b3122a'], power: 1.3 });
      S.timeout(() => el.banner.classList.remove('on'), 2600);
    }
    /* money moves: lost stacks slide to the dealer, winners get a payout stack */
    async function chipsSettle(v) {
      const dr = dealerCards.getBoundingClientRect();
      const moves = [];
      v.seats.forEach((st, i) => {
        if (!st.main || (live && i !== 1)) return;
        const s = seatEls[i];
        const mainWin = st.hands.reduce((a, hd) => a + hd.win, 0), mainBet = st.hands.reduce((a, hd) => a + hd.bet, 0);
        moves.push([s.main, mainWin, mainBet]);
        if (st.pp) moves.push([s.pp, st.ppWin, st.pp]);
        if (st.t3) moves.push([s.t3, st.t3Win, st.t3]);
      });
      if (reduce) return;
      let lost = false, won = false;
      for (const [sp, win, bet] of moves) {
        const r = sp.stack.getBoundingClientRect();
        if (!win) { lost = true; const a = sp.stack.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (dr.left + dr.width / 2 - r.left - r.width / 2) + 'px,' + (dr.top - r.top) + 'px) scale(.6)', opacity: 0 }], { duration: T(620), easing: 'cubic-bezier(.5,0,.6,1)' }); sp.spot.dataset.gone = '1'; a.finished.catch(() => {}); }
        else if (win > bet) {
          won = true;
          const pay = h('div', { class: 'g-batjack-fly stack', html: stackHtml(win - bet) });
          pay.style.left = (dr.left + dr.width / 2 - 20) + 'px'; pay.style.top = dr.top + 'px'; document.body.append(pay);
          pay.animate([{ transform: 'none', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: 'translate(' + (r.left + r.width / 2 + 26 - dr.left - dr.width / 2) + 'px,' + (r.top - dr.top) + 'px)', opacity: 1 }], { duration: T(700), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
          S.timeout(() => pay.remove(), T(1500));
          sp.spot.classList.add('paid');
        }
      }
      if (lost) S.timeout(snd.slide, 80);
      if (won) S.timeout(() => { snd.chip(); B.sfx('coin'); }, T(650));
      await S.sleep(T(1100));
    }
    /* before a new deal: sweep the old cards to the discard tray */
    async function sweep() {
      const cards = root.querySelectorAll('.bj-table .bj-card');
      for (const s of seatEls) for (const k of ['main', 'pp', 't3']) { s[k].spot.classList.remove('paid', 'lost'); delete s[k].spot.dataset.gone; s[k].stack.getAnimations().forEach((a) => a.cancel()); }
      if (cards.length && !reduce) {
        const dr = discard.getBoundingClientRect();
        snd.slide();
        const anims = [...cards].map((c, k) => { const r = c.getBoundingClientRect(); return c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (dr.left - r.left) + 'px,' + (dr.top - r.top) + 'px) rotate(' + (k % 2 ? 12 : -9) + 'deg) scale(.7)', opacity: 0 }], { duration: T(380), delay: k * 18, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {}); });
        await Promise.race([Promise.all(anims), S.sleep(T(700))]);
      }
      clearTable(); paintBets();
    }

    /* ================= LIVE TABLE (online) ================= */
    function blank() { return [0, 1, 2].map(() => ({ main: 0, pp: 0, t3: 0 })); }
    let sendT = 0;
    function queueSend() { if (!live || g.phase !== 'bet') return; L.dirty = true; S.clear(sendT); sendT = S.timeout(sendBet, 260); }
    async function sendBet() {
      if (L.sending || !L.dirty || !g.rid) return;
      L.sending = true; L.dirty = false;
      const b = g.bets[1], rid = g.rid;
      const r = await B.play(ID, 'bet', { round: rid, main: b.main, pp: b.pp, t3: b.t3 }, 0);
      L.sending = false; if (g.dead) return;
      if (r && r.round === g.rid) { L.confirmed = r.total; if (L.st) L.st.mine = r.bet ? { bet: r.bet, seq: 0, v: null, stake: r.total } : null; if (r.bet) { mem.last = [{ main: 0, pp: 0, t3: 0 }, r.bet, { main: 0, pp: 0, t3: 0 }]; saveMem(); } }
      else if (!r && g.rid === rid) { const m = L.st && L.st.mine && L.st.mine.bet; g.bets = blank(); if (m) g.bets[1] = { main: m.main, pp: m.pp, t3: m.t3 }; }
      B.wallet.sync(); paintBets(); controls();
      if (L.dirty) sendBet();
    }
    async function poll() {
      if (L.polling || g.dead) return;
      L.polling = true;
      const t0 = Date.now(); let r;
      try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { L.polling = false; return; }
      const t1 = Date.now(); L.polling = false; if (g.dead) return;
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (L.off == null || rtt <= L.best * 1.25 || ++L.age > 60) { L.off = off; L.best = rtt; L.age = 0; }
      for (const s of r.settled || []) L.settled[s.round] = s;
      /* keep what we know locally if the poll raced an action */
      if (L.st && L.st.mine && r.mine && L.st.round.id === r.round.id && (L.st.mine.seq || 0) > (r.mine.seq || 0)) r.mine = L.st.mine;
      L.st = r;
      const me = B.me && B.me.id;
      const others = r.players.filter((p) => p.id !== me);
      L.others = [others[0] || null, others[1] || null];
      paintRail(); paintHist(); if (g.phase !== 'bet') paintBets();
      direct();
    }
    function paintPlates() {
      const me = B.me;
      seatEls.forEach((s, i) => {
        const p = i === 1 ? null : L.others[i ? 1 : 0];
        if (i === 1) { s.plate.innerHTML = me ? '<span class="av">' + B.avatar(me.avatar, 22) + '</span><b>You</b>' : ''; s.plate.className = 'bj-plate me'; return; }
        if (!p) { s.plate.innerHTML = '<i>Empty seat</i>'; s.plate.className = 'bj-plate free'; return; }
        const w = p.win == null ? '' : p.win > 0 ? '<em class="up">+' + fmt(p.win) + '</em>' : '<em>–</em>';
        s.plate.innerHTML = '<span class="av">' + B.avatar(p.avatar, 22) + '</span><b>' + p.name + '</b>' + (p.done && !p.hands ? '<small>✓</small>' : '') + w;
        s.plate.className = 'bj-plate';
      });
    }
    let railKey = '';
    function paintRail() {
      const r = L.st; if (!r) return;
      const key = JSON.stringify(r.players.map((p) => [p.id, p.main, p.done, p.win]));
      if (key === railKey) return; railKey = key;
      el.rail.textContent = '';
      el.rail.append(h('h4', null, 'At the table · ' + r.players.length));
      if (!r.players.length) el.rail.append(h('p', null, 'Nobody has bet on this hand yet.'));
      for (const p of r.players) {
        const me = B.me && p.id === B.me.id;
        el.rail.append(h('div', { class: 'it' + (me ? ' me' : '') }, h('span', { class: 'av', html: B.avatar(p.avatar, 22) }), h('b', null, me ? 'You' : p.name), h('span', { class: 'bt' }, fmt(p.main + p.pp + p.t3)),
          h('span', { class: 'st' + (p.win > 0 ? ' up' : '') }, p.win != null ? (p.win > 0 ? '+' + fmt(p.win) : '–') : p.hands ? 'settling' : p.done ? 'done' : r.round.cards ? 'thinking' : 'bet placed')));
      }
    }
    let histKey = '';
    function paintHist() {
      const hs = (L.st && L.st.hist) || []; const key = hs.join(','); if (key === histKey) return; histKey = key;
      el.hist.innerHTML = '<small>Dealer</small>' + hs.slice(0, 14).map((x) => '<i class="' + (x === 'B' || x === '22' ? 'bust' : x === 'BJ' ? 'bj' : '') + '">' + (x === 'B' ? 'BUST' : x === '22' ? '22' : x) + '</i>').join('');
    }
    function paintTimer(left, span, label) {
      if (left == null || left <= 0) { el.timer.hidden = true; return; }
      el.timer.hidden = false;
      el.timer.querySelector('.v').style.strokeDashoffset = String(119.4 * (1 - Math.max(0, Math.min(1, left / span))));
      el.timer.querySelector('b').textContent = String(Math.ceil(left));
      el.timer.querySelector('small').textContent = label;
      el.timer.classList.toggle('hot', left <= 4);
      if (left <= 3.05 && Math.ceil(left) !== L.lastTick) { L.lastTick = Math.ceil(left); B.sfx('tick'); }
    }
    /* the felt as the server sees it: you in the centre seat, two other players either side */
    function comp() {
      const r = L.st, t = r.round, my = r.mine && r.mine.v;
      const dealer = t.dealer ? { cards: t.dealer, hole: false, bj: !!t.dealerBJ, total: M.total(t.dealer).t } : { cards: [t.up], hole: true, bj: false };
      const handOf = (cards, bet, dbl, split, res) => { const tt = M.total(cards); return { cards, bet, dbl: !!dbl, fromSplit: !!split, splitAces: false, done: true, res: res || null, win: 0, total: tt.t, soft: tt.soft }; };
      const other = (p) => {
        if (!p) return { main: 0, pp: 0, t3: 0, hands: [] };
        const hs = p.hands || [{ c: t.cards, dbl: false }];
        return { main: p.main, pp: p.pp, t3: p.t3, ppKind: null, ppWin: 0, t3Kind: null, t3Win: 0, ins: 0, insWin: 0, hands: hs.map((hd) => handOf(hd.c, p.main * (hd.dbl ? 2 : 1), hd.dbl, hs.length > 1, hd.res)) };
      };
      let me;
      const sv = L.settled[t.id];
      if (my) me = my.seats[0];
      else if (sv) me = sv.v.seats[0];
      else if (r.mine && r.mine.bet) me = { main: r.mine.bet.main, pp: r.mine.bet.pp, t3: r.mine.bet.t3, ppKind: null, ppWin: 0, t3Kind: null, t3Win: 0, ins: 0, insWin: 0, hands: [handOf(t.cards, r.mine.bet.main)] };
      else me = { main: 0, pp: 0, t3: 0, hands: [] };
      return { phase: my ? my.phase : 'wait', cur: my && my.phase === 'player' && my.cur ? [1, my.cur[1]] : null, legal: my ? my.legal : [], insCost: my ? my.insCost : 0, staked: my ? my.staked : 0, win: 0,
        dealer, seats: [other(L.others[0]), me, other(L.others[1])] };
    }
    const cardsKey = (v) => JSON.stringify([v.dealer.cards, v.dealer.hole, v.seats.map((s) => s.hands.map((hd) => hd.cards))]);
    /* the director: one pass at a time, catching up with whatever the server says */
    function direct() { if (L.running) { L.again = true; return; } L.running = true; (async () => { try { do { L.again = false; await step(); } while (L.again && !g.dead); } catch (e) { console.error(e); } L.running = false; })(); }
    async function step() {
      const r = L.st; if (!r || L.off == null || g.dead) return;
      const t = r.round, now = nowS();
      /* the previous hand pays out before the felt is cleared */
      if (g.rid && t.id !== g.rid && !L.done[g.rid] && L.shown && L.shown.seats[1].main) {
        if (L.settled[g.rid]) await finishLive(g.rid); else return;
      }
      if (t.id !== g.rid) {
        g.rid = t.id; L.shown = null; L.confirmed = 0; g.seq = 0;
        g.phase = 'bet'; g.busy = false; g.undo = []; g.bets = blank();
        if (r.mine && r.mine.bet) { g.bets[1] = { main: r.mine.bet.main, pp: r.mine.bet.pp, t3: r.mine.bet.t3 }; L.confirmed = r.mine.stake; }
        await sweep(); if (g.dead) return;
        msg(t.cards ? 'Hand in play: you are watching this one' : 'Place your bets', t.cards ? 'quiet' : '');
        if (mem.auto && mem.last && !t.cards) rebet(false);
        controls();
      }
      if (!t.cards) {
        if (g.phase !== 'bet') { g.phase = 'bet'; controls(); }
        paintTimer(t.closeAt - now, t.closeAt - t.openAt, 'Bets close');
        if (t.closeAt - now <= 0) { msg('No more bets', 'quiet'); g.phase = 'closing'; controls(); }
        return;
      }
      if (g.phase === 'bet' || g.phase === 'closing') { g.phase = 'deal'; S.clear(sendT); if (L.dirty && !L.sending) sendBet(); controls(); snd.slide(); }
      g.seq = r.mine ? r.mine.seq : 0;
      const v = comp();
      g.v = v;
      if (!L.shown || cardsKey(v) !== cardsKey(L.shown)) {
        const prev = L.shown; L.shown = v; g.busy = true; controls();
        if (!prev) msg(r.mine ? 'Good luck' : 'Cards are out', 'quiet');
        await present(v, prev);
        if (g.dead) return;
        if (!prev && r.mine && r.mine.v) await sideResults(v);
        if (prev && prev.seats[1].hands.some((hd, j) => { const n = v.seats[1].hands[j]; return n && M.total(n.cards).t > 21 && M.total(hd.cards).t <= 21; })) snd.bust();
        g.busy = false;
      }
      paintBets();
      /* where are we in the round? */
      const my = r.mine && r.mine.v;
      if (t.dealer && now >= t.dealerAt) {
        paintTimer(null);
        if (g.phase !== 'dealer' && g.phase !== 'rest') { g.phase = 'dealer'; controls(); msg(t.dealerBJ ? 'Dealer blackjack' : 'Dealer has ' + (M.total(t.dealer).t > 21 ? M.total(t.dealer).t + ': bust' : M.total(t.dealer).t), 'quiet'); }
        if (t.resultAt && now >= t.resultAt && !L.done[t.id]) {
          if (L.shown && L.shown.seats[1].main) { if (L.settled[t.id]) await finishLive(t.id); }
          else { L.done[t.id] = true; g.phase = 'rest'; controls(); }
        }
        return;
      }
      if (my && my.phase === 'insurance' && now < t.peekAt) {
        paintTimer(t.peekAt - now, t.peekAt - t.closeAt - 4, 'Insurance');
        if (g.phase !== 'insurance') { g.phase = 'insurance'; controls(); afterStep(v); }
        return;
      }
      if (now < t.peekAt) { paintTimer(t.peekAt - now, t.peekAt - t.closeAt, t.insurance ? 'Dealer peeks' : 'Dealing'); if (g.phase !== 'wait') { g.phase = 'wait'; controls(); } return; }
      paintTimer(t.decideEnd - now, t.decideEnd - t.peekAt, 'Decisions');
      if (my && my.phase === 'player') {
        if (g.phase !== 'player' || L.turnKey !== JSON.stringify(my.cur) + my.legal.join()) { L.turnKey = JSON.stringify(my.cur) + my.legal.join(); g.phase = 'player'; await afterStep(v); }
        return;
      }
      if (g.phase !== 'wait') { g.phase = 'wait'; controls(); msg(r.mine ? 'Done. Waiting for the other players' : 'Players are deciding', 'quiet'); }
    }
    async function finishLive(rid) {
      L.done[rid] = true;
      const s = L.settled[rid];
      const v = comp();
      const sv = s.v;
      v.seats[1] = sv.seats[0]; v.dealer = sv.dealer; v.win = sv.win; v.staked = sv.staked; v.phase = 'done';
      if (cardsKey(v) !== cardsKey(L.shown)) { const prev = L.shown; L.shown = v; await present(v, prev); }
      g.startBets = blank();
      await finish(v);
    }
    function startLive() {
      g.phase = 'wait'; g.rid = 0; controls();
      msg('Taking a seat…', 'quiet');
      S.interval(poll, 450); poll();
      S.loop(() => { if (L.st && !L.running) { const t = L.st.round, now = nowS(); if (!t.cards && t.closeAt - now > -1) direct(); else if (t.cards && (!t.dealer || (t.resultAt && now >= t.resultAt))) direct(); else if (now < (t.decideEnd || 0)) direct(); } });
    }
    /* ---------- history ---------- */
    function record(v) {
      mem.hist.unshift({ t: Date.now(), d: v.dealer.cards, dbj: v.dealer.bj, s: v.seats.map((st) => st.main ? { m: st.main, pp: st.ppKind, pw: st.ppWin, t3: st.t3Kind, tw: st.t3Win, iw: st.insWin, h: st.hands.map((hd) => [hd.cards, hd.res, hd.bet, hd.win]) } : null), st: v.staked, w: v.win });
      mem.hist = mem.hist.slice(0, 30); saveMem();
    }
    function mini(cards) { return cards.map((c) => '<span class="mc' + (red(c) ? ' r' : '') + '">' + RANKS[c % 13] + '<svg viewBox="0 0 100 100"><g fill="currentColor">' + SUIT[Math.floor(c / 13)] + '</g></svg></span>').join(''); }
    function showHistory() {
      B.sfx('click');
      const box = h('div', { class: 'g-batjack-hist' });
      if (!mem.hist.length) box.innerHTML = '<p>No hands yet. Deal one.</p>';
      for (const e of mem.hist) {
        const net = e.w - e.st, t = new Date(e.t);
        let rows = '<div class="hd"><span>' + t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</span><span>Staked ' + fmt(e.st) + '</span><b class="' + (net > 0 ? 'up' : net < 0 ? 'down' : '') + '">' + (net > 0 ? '+' : '') + fmt(net) + '</b></div>';
        rows += '<div class="ln"><i>Dealer</i>' + mini(e.d) + '<em>' + (e.dbj ? 'Blackjack' : M.total(e.d).t) + '</em></div>';
        e.s.forEach((st, i) => {
          if (!st) return;
          st.h.forEach((hd, j) => { rows += '<div class="ln"><i>Seat ' + (i + 1) + (st.h.length > 1 ? '.' + (j + 1) : '') + '</i>' + mini(hd[0]) + '<em class="r-' + hd[1] + '">' + RES_TEXT[hd[1]] + ' · ' + fmt(hd[2]) + ' → ' + fmt(hd[3]) + '</em></div>'; });
          const sides = [];
          if (st.pp) sides.push(PP_NAME[st.pp] + ' pays ' + fmt(st.pw)); if (st.t3) sides.push(T3_NAME[st.t3] + ' pays ' + fmt(st.tw)); if (st.iw) sides.push('Insurance pays ' + fmt(st.iw));
          if (sides.length) rows += '<div class="ln side"><i></i>' + sides.join(' · ') + '</div>';
        });
        box.append(h('div', { class: 'it', html: rows }));
      }
      B.ui.modal('Hand history', box);
    }

    /* ---------- keyboard ---------- */
    S.on(document, 'keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      if (document.querySelector('.bc-veil,.bc-win')) return;
      const k = e.key.toLowerCase();
      const map = g.phase === 'bet' ? { ' ': dealOrRebet, enter: dealOrRebet, c: clearBets, u: undo, x: doubleBets, r: () => rebet(false) }
        : g.phase === 'player' ? { h: () => act('hit'), s: () => act('stand'), ' ': () => act('stand'), d: () => act('double'), p: () => act('split') }
          : g.phase === 'insurance' ? { i: () => insure(true), y: () => insure(true), n: () => insure(false), ' ': () => insure(false) } : {};
      if (k === 'a') { el.advice.click(); return; }
      if (k === 'q') { el.quick.click(); return; }
      if (g.phase === 'bet' && k >= '1' && k <= '6') { mem.chip = +k - 1; saveMem(); snd.chip(); paintChips(); return; }
      if (map[k]) { e.preventDefault(); B.audio.ensure(); map[k](); }
    });

    /* ---------- ambience: a candle flicker loop is CSS; now and then a bat flaps past ---------- */
    S.interval(() => { if (!g.busy && Math.random() < 0.25) snd.wings(); }, 9000);

    /* ---------- resume an open round (online) ---------- */
    paintChips(); paintBets(); controls();
    if (live) startLive();
    else if (B.online) {
      (async () => {
        g.busy = true; controls();
        let r = null;
        try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { /* none */ }
        if (g.dead) return;
        if (r && r.v) {
          g.v = r.v; g.rid = r.round; g.seq = r.seq; g.phase = r.v.phase; g.startBets = r.v.seats.map((s) => ({ main: s.main, pp: s.pp, t3: s.t3 }));
          msg('Welcome back. Your hand is still on the table.', 'turn');
          paintBets(); await present(r.v, null); await afterStep(r.v);
        } else { g.busy = false; controls(); }
      })();
    }
    g.destroy = () => {
      g.dead = true; ro.disconnect();
      /* practice: a hand left unfinished stands and is paid now */
      if (!B.online && g.local && g.local.phase !== 'done') { M.autoFinish(g.local); B.wallet.win(ID, g.local.win, { silent: true }); }
      document.querySelectorAll('.g-batjack-fly').forEach((n) => n.remove());
      if (dev && window.__batjackDev === dev) delete window.__batjackDev;
    };
    return g;
  }

  B.registerGame({
    id: ID,
    name: 'Bat Jack',
    tagline: 'Live midnight blackjack table. Ace and Jack pays 6 to 1',
    tag: 'Table game',
    poster: poster(),
    rules,
    mount(root) { mount(root); },
    unmount() { if (G) G.destroy(); G = null; if (S) S.dispose(); S = null; },
  });
})();
