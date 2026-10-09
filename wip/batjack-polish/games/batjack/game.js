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
/* Bat Jack — a live midnight blackjack table, drawn and animated in code. Barnaby, a vampire-bat croupier, deals from a
   shoe, peeks, flips, pays and reacts; cards arc out of the shoe with shadows and 3D flips, chips stack in 3D and slide
   to and from his tray. Up to three seats in practice, Perfect Pairs and 21+3 on every seat, Bat Advice (basic strategy
   for these rules), hand history, Rebet, Rebet & Deal, Double bets.
   Online: the shared live table — every card comes from the server (the shoe and the hole card never leave it).
   Practice: the same maths (BattyMath.batjack) runs in the browser. The UI only presents views; it decides nothing.
   The whole felt is a fixed-size stage (three layouts: wide, compact landscape and tall portrait) scaled to fit. */
(function () {
  'use strict';
  const ID = 'batjack', M = BattyMath.batjack, B = Batty, h = B.h, fmt = B.fmt;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const KEY = 'batty-batjack-v1';
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
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
  /* big corner indices (readable on a phone, like a live-dealer camera card) */
  function faceSvg(c) {
    const r = c % 13, s = Math.floor(c / 13), col = ink(c), lab = RANKS[r];
    let mid = '';
    if (r === 0) {
      mid = '<path d="' + BAT() + '" transform="translate(16 54) scale(.57)" fill="#c99a35" opacity=".85"/>' + suitAt(s, 50, 72, s === 0 ? 40 : 34, false, col) +
        '<circle cx="50" cy="71" r="27" fill="none" stroke="#c99a35" stroke-width=".8" stroke-dasharray="1.5 2.5"/>';
    } else if (r >= 10) mid = '<g transform="translate(50 72) scale(.7 .78) translate(-50 -70)">' + court(r, s, col) + '</g>';
    else for (const [x, y] of PIPS[r + 1]) mid += suitAt(s, 50 + (x - 50) * 0.8, 6 + y * 0.93, 15, y > 70, col);
    const ten = lab === '10';
    const corner = '<text x="13" y="27" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="' + (ten ? 19 : 25) + '" fill="' + col + '"' + (ten ? ' letter-spacing="-2.6"' : '') + '>' + lab + '</text>' + suitAt(s, 13, 38.5, 12.5, false, col);
    return '<svg viewBox="0 0 100 140" aria-hidden="true"><rect x=".6" y=".6" width="98.8" height="138.8" rx="8" fill="url(#batjack-paper)" stroke="#bfa877" stroke-width="1.2"/>' +
      mid + corner + '<g transform="rotate(180 50 70)">' + corner + '</g></svg>';
  }
  const BACK_SVG = '<svg viewBox="0 0 100 140" aria-hidden="true"><rect x=".6" y=".6" width="98.8" height="138.8" rx="8" fill="#3a0610" stroke="#c99a35" stroke-width="1.4"/>' +
    '<rect x="6" y="6" width="88" height="128" rx="5" fill="url(#batjack-damask)" stroke="#c99a35" stroke-width="1"/>' +
    '<circle cx="50" cy="70" r="21" fill="#3a0610" stroke="#c99a35" stroke-width="1.4"/><path d="' + B.batPath + '" transform="translate(32 61) scale(.3)" fill="#e2bd62"/></svg>';
  const DEFS = '<svg class="bj-defs" width="0" height="0" aria-hidden="true"><defs>' +
    '<linearGradient id="batjack-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f6eedb"/><stop offset="1" stop-color="#e9dcc0"/></linearGradient>' +
    '<pattern id="batjack-damask" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#5c0b19"/><path d="M7 1L13 7L7 13L1 7Z" fill="none" stroke="#a8792a" stroke-width=".7"/><circle cx="7" cy="7" r="1.4" fill="#c99a35"/><circle cx="0" cy="0" r="1" fill="#7e1425"/><circle cx="14" cy="14" r="1" fill="#7e1425"/></pattern>' +
    '<linearGradient id="batjack-cedge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>' +
    '<linearGradient id="batjack-cshine" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="batjack-flat-shine" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '</defs></svg>';
  /* a chip seen from above (the rack and the poster) */
  function chipSvg(v, size) {
    const st = CHIP_STYLE[v] || CHIP_STYLE[10];
    return '<svg viewBox="0 0 40 40" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="' + st[0] + '" stroke="rgba(0,0,0,.45)" stroke-width="1"/>' +
      '<circle cx="20" cy="20" r="16" fill="none" stroke="' + st[1] + '" stroke-width="5" stroke-dasharray="5.2 7.4"/>' +
      '<circle cx="20" cy="20" r="11.5" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width="1.2"/>' +
      '<text x="20" y="24.2" text-anchor="middle" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + (st[3].length > 2 ? 10 : 12) + '" fill="' + st[2] + '">' + st[3] + '</text>' +
      '<circle cx="20" cy="20" r="19" fill="url(#batjack-flat-shine)"/></svg>';
  }
  /* a chip lying on the felt, seen at the camera's angle: an elliptical top and a striped edge */
  function chip3d(v) {
    const st = CHIP_STYLE[v] || CHIP_STYLE[10];
    const edge = 'M1 12v6c0 7.2 9.4 12.6 21 12.6S43 25.2 43 18v-6Z';
    return '<svg viewBox="0 0 44 32" aria-hidden="true"><path d="' + edge + '" fill="' + st[0] + '"/>' +
      '<path d="M4.6 18.4v6.1M13.6 22.3v6.4M30.4 22.3v6.4M39.4 18.4v6.1" stroke="' + st[1] + '" stroke-width="3.6"/><path d="' + edge + '" fill="url(#batjack-cedge)"/>' +
      '<ellipse cx="22" cy="12" rx="21" ry="11.5" fill="' + st[0] + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>' +
      '<ellipse cx="22" cy="12" rx="17.4" ry="9.5" fill="none" stroke="' + st[1] + '" stroke-width="3.4" stroke-dasharray="4.6 5.9"/>' +
      '<ellipse cx="22" cy="12" rx="12.4" ry="6.8" fill="' + st[0] + '" stroke="' + st[1] + '" stroke-width=".9"/>' +
      '<text x="22" y="15.4" text-anchor="middle" transform="translate(0 4.6) scale(1 .62)" font-family="\'Chakra Petch\',\'Arial Narrow\',sans-serif" font-weight="700" font-size="' + (st[3].length > 2 ? 10 : 12) + '" fill="' + st[2] + '">' + st[3] + '</text>' +
      '<ellipse cx="22" cy="12" rx="21" ry="11.5" fill="url(#batjack-cshine)"/></svg>';
  }
  /* break an amount into chips, largest first */
  function chipsFor(n) { const out = []; const ds = M.CHIPS.slice().reverse(); for (const d of ds) while (n >= d && out.length < 40) { out.push(d); n -= d; } return out; }
  /* a 3D stack: largest at the bottom, at most `max` chips shown */
  function stackHtml(n, max, drop) {
    const cs = chipsFor(n).slice(0, max || 9);
    return cs.map((v, k) => '<i style="--k:' + k + '"' + (drop && k === cs.length - 1 ? ' class="drop"' : '') + '>' + chip3d(v) + '</i>').join('');
  }

  /* the shoe: a lacquered card shoe with a gold bat, cards stacked inside, the next card's tongue at the mouth */
  const SHOE_SVG = '<svg viewBox="0 0 170 120" aria-hidden="true"><defs>' +
    '<linearGradient id="batjack-shoe-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1824"/><stop offset="1" stop-color="#16060b"/></linearGradient>' +
    '<linearGradient id="batjack-shoe-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0c14"/><stop offset=".55" stop-color="#541a28"/><stop offset="1" stop-color="#1a060c"/></linearGradient>' +
    '<linearGradient id="batjack-shoe-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset=".5" stop-color="#c99a35"/><stop offset="1" stop-color="#7a5a18"/></linearGradient></defs>' +
    '<ellipse cx="92" cy="110" rx="76" ry="9" fill="rgba(0,0,0,.5)"/>' +
    '<path d="M150 24C164 12 166 0 158 -6C156 4 150 10 142 12C146 4 144 -2 138 -6C136 6 130 14 120 20Z" fill="#14050a" stroke="#c99a35" stroke-width="1.4"/>' +
    '<path d="M44 30L152 20L164 86L56 100Z" fill="url(#batjack-shoe-t)" stroke="url(#batjack-shoe-g)" stroke-width="2"/>' +
    '<path d="M58 40L142 32L151 76L66 86Z" fill="#efe3c6"/>' +
    '<path d="M60 47L144 39M62 54L146 46M63 61L147 53M64 68L148 60M65 75L149 67" stroke="#c9b48a" stroke-width=".9"/>' +
    '<path d="M128 28L150 26L158 70L136 72Z" fill="#2a0c14" stroke="#c99a35" stroke-width="1.2"/><circle cx="145" cy="49" r="4" fill="url(#batjack-shoe-g)"/>' +
    '<path d="M18 50L56 40L64 104L28 112Z" fill="url(#batjack-shoe-f)" stroke="url(#batjack-shoe-g)" stroke-width="2"/>' +
    '<path d="M26 64L56 57L58 72L29 79Z" fill="#070103"/>' +
    '<path d="M4 72L46 62L50 74L8 84Z" fill="#5c0b19" stroke="#c99a35" stroke-width=".9"/><path d="M10 74L44 66" stroke="#c99a35" stroke-width=".6" opacity=".7"/>' +
    '<path d="' + B.batPath + '" transform="translate(30 86) scale(.24) rotate(-10)" fill="url(#batjack-shoe-g)"/>' +
    '<path d="M56 100L164 86L166 92L58 106Z" fill="url(#batjack-shoe-g)"/></svg>';

  /* the dealer's chip float: columns of chips lying on edge in a black lacquer tray */
  function traySvg() {
    const cols = [5000, 1000, 1000, 500, 100, 100, 50, 50, 10, 10];
    let slots = '';
    cols.forEach((v, i) => {
      const st = CHIP_STYLE[v], x = 14 + i * 27.2;
      slots += '<rect x="' + x + '" y="11" width="24" height="27" rx="3" fill="' + st[0] + '"/>' +
        '<rect x="' + x + '" y="11" width="24" height="27" rx="3" fill="url(#batjack-edge-' + (v === 10 || v === 1000 ? 'd' : 'l') + ')" opacity=".85"/>' +
        '<rect x="' + (x + 9) + '" y="11" width="6" height="27" fill="' + st[1] + '" opacity=".55"/>' +
        '<rect x="' + x + '" y="11" width="24" height="6" rx="2" fill="#fff" opacity=".2"/>';
    });
    return '<svg viewBox="0 0 300 52" aria-hidden="true"><defs>' +
      '<pattern id="batjack-edge-l" width="24" height="3.2" patternUnits="userSpaceOnUse"><rect width="24" height="1" fill="rgba(255,255,255,.5)"/><rect x="0" y="1" width="24" height=".5" fill="rgba(0,0,0,.4)"/></pattern>' +
      '<pattern id="batjack-edge-d" width="24" height="3.2" patternUnits="userSpaceOnUse"><rect width="24" height="1" fill="rgba(80,50,10,.45)"/><rect x="0" y="1" width="24" height=".5" fill="rgba(0,0,0,.35)"/></pattern>' +
      '<linearGradient id="batjack-lacq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1016"/><stop offset="1" stop-color="#0a0305"/></linearGradient></defs>' +
      '<path d="M4 6H296L290 48H10Z" fill="url(#batjack-lacq)" stroke="#c99a35" stroke-width="1.6"/>' + slots +
      '<path d="M8 40H292L290 48H10Z" fill="#14060a"/><path d="M8 40H292" stroke="#f3d98b" stroke-width="1.2" opacity=".7"/></svg>';
  }

  /* ============================== Barnaby, the dealer ============================== */
  /* viewBox 0 0 360 200; the table edge is at y 178. Two layers: the body (behind the table edge) and the arms (in front). */
  function dealerSvg() {
    const fur = 'url(#batjack-fur)';
    const wing = '<path d="M142 112C112 82 64 62 12 70C24 84 22 98 14 112C30 106 42 114 44 128C56 118 70 124 74 138C86 128 100 134 104 150L146 154Z" fill="url(#batjack-wing)" stroke="#1a0718" stroke-width="1.5"/>' +
      '<path d="M142 112L18 72M132 118L46 126M122 126L76 136" stroke="#5e2a66" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>';
    const ear = '<path d="M152 56Q124 32 126 0Q152 10 174 40Z" fill="' + fur + '" stroke="#170a1c" stroke-width="1.4"/><path d="M151 48Q135 30 134 12Q150 20 164 40Z" fill="#b3445a" opacity=".75"/>';
    const collar = '<path d="M150 106L112 34Q140 58 162 92Z" fill="#12060f" stroke="#c99a35" stroke-width="1.2"/><path d="M148 103L120 48Q140 64 158 90Z" fill="#8c1528"/>';
    return '<svg class="bj-dsvg" viewBox="0 0 360 200" aria-hidden="true"><defs>' +
      '<radialGradient id="batjack-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#5a3d68"/><stop offset=".7" stop-color="#2e1a38"/><stop offset="1" stop-color="#1a0d22"/></radialGradient>' +
      '<linearGradient id="batjack-wing" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e1846"/><stop offset="1" stop-color="#12051a"/></linearGradient>' +
      '<linearGradient id="batjack-jkt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d1d34"/><stop offset=".55" stop-color="#140b18"/><stop offset="1" stop-color="#0a050c"/></linearGradient>' +
      '<linearGradient id="batjack-vest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3182e"/><stop offset="1" stop-color="#4a0812"/></linearGradient>' +
      '<radialGradient id="batjack-eye" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fffbe6"/><stop offset=".7" stop-color="#ffe08a"/><stop offset="1" stop-color="#e2a83a"/></radialGradient>' +
      '</defs>' +
      '<g class="d-body">' +
      '<g class="d-wing l">' + wing + '</g><g class="d-wing r"><g transform="translate(360 0) scale(-1 1)">' + wing + '</g></g>' +
      collar + '<g transform="translate(360 0) scale(-1 1)">' + collar + '</g>' +
      '<path d="M110 114Q180 92 250 114Q264 142 266 190L94 190Q96 142 110 114Z" fill="url(#batjack-jkt)"/>' +
      '<path d="M148 108L162 106L180 146L200 106L212 108L216 190L144 190Z" fill="url(#batjack-vest)"/>' +
      '<path d="M162 103L180 142L198 103Q180 97 162 103Z" fill="#f4ece0"/><path d="M180 112V142" stroke="#d8cfc0" stroke-width="1"/>' +
      '<circle cx="180" cy="154" r="2.6" fill="#e2bd62"/><circle cx="180" cy="168" r="2.6" fill="#e2bd62"/><circle cx="180" cy="182" r="2.6" fill="#e2bd62"/>' +
      '<path d="M146 108L170 156L146 190H124Q126 146 146 108Z" fill="#221428"/><path d="M214 108L190 156L214 190H236Q234 146 214 108Z" fill="#221428"/>' +
      '<path d="M146 108L170 156M214 108L190 156" stroke="#5e4668" stroke-width="1.2"/>' +
      '<path d="M224 128L238 124L236 132Z" fill="#b3122a"/>' +
      '<rect x="118" y="132" width="30" height="9" rx="2" fill="#c99a35" stroke="#6b4a10" stroke-width=".6"/><text x="133" y="138.8" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="5.4" fill="#2a0508">BARNABY</text>' +
      '<path d="M180 106L163 97L163 115Z M180 106L197 97L197 115Z" fill="#b3122a" stroke="#4a0812" stroke-width="1"/><circle cx="180" cy="106" r="3.6" fill="#e2bd62"/>' +
      '<g class="d-head">' +
      '<g class="d-ear l">' + ear + '</g><g class="d-ear r"><g transform="translate(360 0) scale(-1 1)">' + ear + '</g></g>' +
      '<ellipse cx="180" cy="64" rx="41" ry="37" fill="' + fur + '" stroke="#170a1c" stroke-width="1.4"/>' +
      '<path d="M158 32Q180 22 202 32Q190 36 180 50Q170 36 158 32Z" fill="#170a1c"/>' +
      '<ellipse cx="180" cy="77" rx="27" ry="19" fill="#5e4268" opacity=".9"/>' +
      '<ellipse cx="153" cy="78" rx="6.5" ry="4.2" fill="#ff6a8a" opacity=".22"/><ellipse cx="207" cy="78" rx="6.5" ry="4.2" fill="#ff6a8a" opacity=".22"/>' +
      '<g class="d-eyes"><ellipse cx="164" cy="59" rx="10" ry="11" fill="url(#batjack-eye)" stroke="#170a1c" stroke-width="1.2"/><ellipse cx="196" cy="59" rx="10" ry="11" fill="url(#batjack-eye)" stroke="#170a1c" stroke-width="1.2"/>' +
      '<g class="d-pupils"><ellipse cx="165" cy="61" rx="4.4" ry="5.2" fill="#1a0508"/><ellipse cx="197" cy="61" rx="4.4" ry="5.2" fill="#1a0508"/><circle cx="163.4" cy="58.6" r="1.6" fill="#fff"/><circle cx="195.4" cy="58.6" r="1.6" fill="#fff"/></g></g>' +
      '<g class="d-lids"><path class="lid l" d="M153 59A11 11.5 0 0 1 175 59Z" fill="#3c2647"/><path class="lid r" d="M185 59A11 11.5 0 0 1 207 59Z" fill="#3c2647"/></g>' +
      '<g class="d-lidsfull"><ellipse cx="164" cy="59" rx="11" ry="12" fill="#3c2647"/><ellipse cx="196" cy="59" rx="11" ry="12" fill="#3c2647"/><path d="M155 62Q164 66 173 62M187 62Q196 66 205 62" stroke="#170a1c" stroke-width="1.4" fill="none"/></g>' +
      '<circle cx="196" cy="59" r="13.4" fill="rgba(255,255,255,.06)" stroke="#e2bd62" stroke-width="2.2"/><path d="M209 63Q218 92 208 110" stroke="#c99a35" stroke-width="1" stroke-dasharray="1.6 1.6" fill="none"/>' +
      '<path class="d-brow l" d="M151 44Q162 40 174 45" stroke="#120610" stroke-width="3.6" stroke-linecap="round" fill="none"/><path class="d-brow r" d="M186 45Q198 40 209 44" stroke="#120610" stroke-width="3.6" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="180" cy="73" rx="7" ry="4.8" fill="#2a1530"/><circle cx="177.4" cy="73.6" r="1.2" fill="#0a0408"/><circle cx="182.6" cy="73.6" r="1.2" fill="#0a0408"/>' +
      '<g class="d-mouth">' +
      '<g class="mo-smile"><path d="M166 83Q180 93 194 83" stroke="#1a0508" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M171 86l2.6 6.2 2.4-5.2ZM184 87l2.4 5.2 2.6-6.2Z" fill="#fff"/></g>' +
      '<g class="mo-grin"><path d="M161 80Q180 104 199 80Q180 90 161 80Z" fill="#4a0812" stroke="#1a0508" stroke-width="1.6"/><path d="M168 84l3 7 3-6ZM186 85l3 6 3-7Z" fill="#fff"/></g>' +
      '<g class="mo-o"><ellipse cx="180" cy="89" rx="6.5" ry="8" fill="#4a0812" stroke="#1a0508" stroke-width="1.6"/></g>' +
      '<g class="mo-flat"><path d="M168 88Q180 84 192 88" stroke="#1a0508" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>' +
      '</g></g></g></svg>';
  }
  function armsSvg() {
    const arm = '<path d="M112 112Q92 142 104 172L132 186Q122 150 140 122Z" fill="url(#batjack-jkt2)" stroke="#06030a" stroke-width="1"/>' +
      '<path d="M100 168L134 180L131 191L97 179Z" fill="#f4ece0" stroke="#c9bfae" stroke-width=".8"/><circle cx="116" cy="181" r="1.8" fill="#e2bd62"/>' +
      '<path d="M100 178Q112 172 132 184Q140 196 126 200Q104 200 98 190Q96 182 100 178Z" fill="#fbf6ee" stroke="#cfc4b2" stroke-width="1.2"/>' +
      '<path d="M108 192Q116 196 126 194M106 186Q116 190 128 189" stroke="#d6cbb8" stroke-width="1" fill="none"/>';
    return '<svg class="bj-asvg" viewBox="0 0 360 200" aria-hidden="true"><defs><linearGradient id="batjack-jkt2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d1d34"/><stop offset="1" stop-color="#0a050c"/></linearGradient></defs>' +
      '<g class="d-arm l">' + arm + '</g><g class="d-arm r"><g transform="translate(360 0) scale(-1 1)">' + arm + '</g></g></svg>';
  }

  /* ============================== the room behind the table ============================== */
  function roomSvg() {
    const arch = (x0, x1, yt, yb) => { const xm = (x0 + x1) / 2, ys = yt + (x1 - x0) * 0.55; return 'M' + x0 + ' ' + yb + 'V' + ys + 'Q' + x0 + ' ' + (yt + 8) + ' ' + xm + ' ' + yt + 'Q' + x1 + ' ' + (yt + 8) + ' ' + x1 + ' ' + ys + 'V' + yb + 'Z'; };
    const win = (x0, x1, yt, yb, moon) => {
      const xm = (x0 + x1) / 2, w = x1 - x0;
      let stars = ''; for (let i = 0; i < 14; i++) { const sx = x0 + 10 + ((i * 67) % (w - 20)), sy = yt + 30 + ((i * 41) % (yb - yt - 60)); stars += '<circle cx="' + sx + '" cy="' + sy + '" r="' + (1 + (i % 3) * 0.5) + '" fill="#fff" opacity="' + (0.4 + (i % 4) * 0.15) + '" class="tw" style="animation-delay:-' + (i * 0.7) + 's"/>'; }
      return '<g><path d="' + arch(x0 - 14, x1 + 14, yt - 18, yb + 12) + '" fill="#1d0a12" stroke="#3a1a22" stroke-width="3"/>' +
        '<path d="' + arch(x0, x1, yt, yb) + '" fill="url(#bjr-sky)"/>' +
        '<g clip-path="url(#bjr-clip-' + x0 + ')">' + stars + (moon ? '<g class="moon"><circle cx="' + xm + '" cy="' + (yt + 120) + '" r="120" fill="url(#bjr-mglow)"/><circle cx="' + xm + '" cy="' + (yt + 120) + '" r="52" fill="url(#bjr-moon)"/><circle cx="' + (xm - 16) + '" cy="' + (yt + 108) + '" r="9" fill="#e9d79a" opacity=".55"/><circle cx="' + (xm + 18) + '" cy="' + (yt + 132) + '" r="6" fill="#e9d79a" opacity=".5"/><circle cx="' + (xm + 4) + '" cy="' + (yt + 96) + '" r="4" fill="#e9d79a" opacity=".5"/></g>' : '') +
        '<g class="cloud" style="animation-duration:' + (60 + x0 % 40) + 's"><ellipse cx="' + (x0 + 30) + '" cy="' + (yt + 170) + '" rx="70" ry="12" fill="#2a1d48" opacity=".75"/><ellipse cx="' + (x0 + 70) + '" cy="' + (yt + 160) + '" rx="40" ry="10" fill="#2a1d48" opacity=".75"/></g>' +
        '<g class="wbats" style="animation-delay:-' + (x0 % 13) + 's"><path d="' + B.batPath + '" transform="translate(' + (x0 + 20) + ' ' + (yt + 90) + ') scale(.16)" fill="#07020a"/><path d="' + B.batPath + '" transform="translate(' + (x0 + 50) + ' ' + (yt + 110) + ') scale(.11)" fill="#07020a"/></g>' +
        '<path d="M' + xm + ' ' + yt + 'V' + yb + 'M' + x0 + ' ' + (yt + (yb - yt) * 0.62) + 'H' + x1 + '" stroke="#150709" stroke-width="7"/>' +
        '<circle cx="' + xm + '" cy="' + (yt + w * 0.42) + '" r="' + w * 0.2 + '" fill="none" stroke="#150709" stroke-width="6"/></g>' +
        '<path d="' + arch(x0, x1, yt, yb) + '" fill="none" stroke="url(#bjr-glass)" stroke-width="6"/></g>';
    };
    const clip = (x0, x1, yt, yb) => '<clipPath id="bjr-clip-' + x0 + '"><path d="' + arch(x0, x1, yt, yb) + '"/></clipPath>';
    const drape = (flip) => {
      let folds = ''; for (let i = 0; i < 6; i++) folds += '<path d="M' + (i * 38) + ' 0C' + (i * 38 + 30) + ' 200 ' + (i * 38 - 10) + ' 420 ' + (i * 38 + 22) + ' 640" stroke="rgba(0,0,0,.45)" stroke-width="14" fill="none"/><path d="M' + (i * 38 + 14) + ' 0C' + (i * 38 + 40) + ' 200 ' + (i * 38 + 4) + ' 420 ' + (i * 38 + 34) + ' 640" stroke="rgba(255,120,140,.10)" stroke-width="6" fill="none"/>';
      return '<g' + (flip ? ' transform="translate(1600 0) scale(-1 1)"' : '') + '><path d="M0 0H250Q236 160 180 300Q150 360 196 440Q230 540 210 640H0Z" fill="url(#bjr-velvet)"/>' + '<g clip-path="url(#bjr-dclip)">' + folds + '</g>' +
        '<path d="M150 318Q190 326 214 304" stroke="#e2bd62" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="216" cy="306" r="9" fill="#c99a35"/><path d="M210 312L204 352M216 314L216 356M222 312L228 350" stroke="#c99a35" stroke-width="3"/>' +
        '<path d="M0 0H330V22Q300 50 250 34Q200 56 150 34Q100 54 50 34Q20 44 0 30Z" fill="url(#bjr-velvet)"/><path d="M0 30Q20 44 50 34Q100 54 150 34Q200 56 250 34Q300 50 330 22" stroke="#c99a35" stroke-width="3" fill="none"/></g>';
    };
    const sconce = (x, y) => '<g><path d="M' + (x - 14) + ' ' + (y + 30) + 'H' + (x + 14) + 'L' + (x + 8) + ' ' + (y + 44) + 'H' + (x - 8) + 'Z" fill="#c99a35"/><rect x="' + (x - 6) + '" y="' + y + '" width="12" height="30" rx="2" fill="#f2e6c8"/>' +
      '<circle class="gl" cx="' + x + '" cy="' + (y - 10) + '" r="70" fill="url(#bjr-candle)"/><path class="fl" d="M' + x + ' ' + (y - 22) + 'Q' + (x + 7) + ' ' + (y - 8) + ' ' + x + ' ' + (y + 1) + 'Q' + (x - 7) + ' ' + (y - 8) + ' ' + x + ' ' + (y - 22) + 'Z" fill="#ffd27a"/></g>';
    return '<svg class="bj-roomsvg" viewBox="0 0 1600 640" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><defs>' +
      '<linearGradient id="bjr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22070f"/><stop offset=".6" stop-color="#14040a"/><stop offset="1" stop-color="#070104"/></linearGradient>' +
      '<linearGradient id="bjr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e0b2a"/><stop offset=".7" stop-color="#2a1748"/><stop offset="1" stop-color="#4a1f4a"/></linearGradient>' +
      '<radialGradient id="bjr-moon" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#fffbe8"/><stop offset=".8" stop-color="#f3dc98"/><stop offset="1" stop-color="#d9b45f"/></radialGradient>' +
      '<radialGradient id="bjr-mglow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".45"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="bjr-candle"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".55"/><stop offset=".4" stop-color="#ff9a3c" stop-opacity=".16"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="bjr-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3122a"/><stop offset=".5" stop-color="#e2bd62"/><stop offset="1" stop-color="#5a1a7a"/></linearGradient>' +
      '<linearGradient id="bjr-velvet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0309"/><stop offset=".5" stop-color="#6b0a1c"/><stop offset="1" stop-color="#3a040e"/></linearGradient>' +
      '<linearGradient id="bjr-pillar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16060b"/><stop offset=".5" stop-color="#2e1018"/><stop offset="1" stop-color="#10040a"/></linearGradient>' +
      '<clipPath id="bjr-dclip"><path d="M0 0H250Q236 160 180 300Q150 360 196 440Q230 540 210 640H0Z"/></clipPath>' +
      clip(320, 520, 120, 470) + clip(660, 940, 70, 470) + clip(1080, 1280, 120, 470) +
      '</defs><rect width="1600" height="640" fill="url(#bjr-wall)"/>' +
      '<path d="M0 0H1600V640H0Z" fill="none"/>' +
      '<rect x="560" y="0" width="60" height="640" fill="url(#bjr-pillar)"/><rect x="980" y="0" width="60" height="640" fill="url(#bjr-pillar)"/>' +
      '<g class="bj-sky">' + win(320, 520, 120, 470, false) + win(660, 940, 70, 470, true) + win(1080, 1280, 120, 470, false) + '</g>' +
      sconce(590, 300) + sconce(1010, 300) +
      '<g class="chand"><circle cx="800" cy="-20" r="260" fill="url(#bjr-candle)" class="gl"/></g>' +
      drape(false) + drape(true) + '</svg>';
  }

  /* ============================== table layouts (logical px; the stage is scaled to fit) ============================== */
  const LAY = {
    wide: { name: 'wide', W: 1200, H: 640, edge: 165, fx: 600, rx: 660, ry: 468, cw: 78, d: { x: 600, s: 0.86 }, tray: 250,
      shoe: { x: 985, y: 222, w: 150 }, disc: { x: 228, y: 226, w: 74 }, dc: { x: 600, y: 262 }, timer: { x: 432, y: 262 }, call: { x: 600, y: 408 }, bub: { x: 668, y: 44 },
      seats: [{ x: 255, y: 482, s: 1 }, { x: 600, y: 560, s: 1 }, { x: 945, y: 482, s: 1 }],
      print: { y: 312, sag: 40, lines: [{ t: 'DEALER STANDS ON ALL 17s · DEALER 22 PUSHES', dy: 0, a: 236, size: 11.5, ls: 2.2, op: 0.72 }, { t: 'BLACKJACK PAYS 3 TO 2 · BAT JACK PAYS 6 TO 1', dy: 25, a: 300, size: 17.5, ls: 1.6 }], band: { dy: 36, h: 21, a: 330, t: 'INSURANCE PAYS 2 TO 1', size: 10.5 } } },
    compact: { name: 'compact', W: 1000, H: 580, edge: 150, fx: 500, rx: 560, ry: 420, cw: 80, d: { x: 500, s: 0.8 }, tray: 220,
      shoe: { x: 815, y: 205, w: 132 }, disc: { x: 190, y: 208, w: 70 }, dc: { x: 500, y: 246 }, timer: { x: 335, y: 246 }, call: { x: 500, y: 372 }, bub: { x: 560, y: 34 },
      seats: [{ x: 200, y: 436, s: 0.94 }, { x: 500, y: 506, s: 1 }, { x: 800, y: 436, s: 0.94 }],
      print: { y: 300, sag: 34, lines: [{ t: 'BLACKJACK PAYS 3 TO 2 · BAT JACK PAYS 6 TO 1', dy: 0, a: 250, size: 16, ls: 1.2 }], band: { dy: 12, h: 20, a: 270, t: 'INSURANCE PAYS 2 TO 1 · DEALER 22 PUSHES', size: 10 } } },
    tall: { name: 'tall', W: 420, H: 690, edge: 118, fx: 210, rx: 300, ry: 545, cw: 62, d: { x: 210, s: 0.6 }, tray: 150,
      shoe: { x: 370, y: 156, w: 92 }, disc: { x: 46, y: 158, w: 50 }, dc: { x: 210, y: 204 }, timer: { x: 46, y: 246 }, call: { x: 210, y: 352 }, bub: { x: 246, y: 18 },
      seats: [{ x: 76, y: 470, s: 0.66 }, { x: 210, y: 588, s: 1 }, { x: 344, y: 470, s: 0.66 }],
      print: { y: 276, sag: 30, lines: [{ t: 'BLACKJACK PAYS 3 TO 2', dy: 0, a: 150, size: 14, ls: 1.6 }, { t: 'BAT JACK PAYS 6 TO 1', dy: 20, a: 160, size: 14, ls: 1.6 }], band: { dy: 30, h: 18, a: 176, t: 'INSURANCE 2 TO 1 · DEALER 22 PUSHES', size: 8.5 } } },
  };
  function feltSvg(c) {
    const { W, H, edge, fx, rx, ry } = c, p = c.print;
    const half = (a, b) => 'M' + (fx - a) + ' ' + edge + 'A' + a + ' ' + b + ' 0 0 0 ' + (fx + a) + ' ' + edge;
    const arc = (dy, a) => 'M' + (fx - a) + ' ' + (p.y + dy) + 'Q' + fx + ' ' + (p.y + dy + p.sag * 2) + ' ' + (fx + a) + ' ' + (p.y + dy);
    let print = '';
    p.lines.forEach((l, i) => {
      print += '<path id="batjack-pl' + i + '" d="' + arc(l.dy, l.a) + '" fill="none"/>' +
        '<text font-family="Cinzel,Georgia,serif" font-weight="800" font-size="' + l.size + '" letter-spacing="' + l.ls + '" fill="#e2bd62"' + (l.op ? ' opacity="' + l.op + '"' : '') + '><textPath href="#batjack-pl' + i + '" startOffset="50%" text-anchor="middle">' + l.t + '</textPath></text>';
    });
    const b = p.band;
    print += '<path d="' + arc(b.dy, b.a) + '" stroke="#c99a35" stroke-width="1.4" fill="none" opacity=".8"/><path d="' + arc(b.dy + b.h, b.a) + '" stroke="#c99a35" stroke-width="1.4" fill="none" opacity=".8"/>' +
      '<path class="bj-insband" d="' + arc(b.dy + b.h / 2, b.a) + '" stroke="#f3d98b" stroke-width="' + (b.h - 3) + '" fill="none" opacity="0"/>' +
      '<path id="batjack-plb" d="' + arc(b.dy + b.h / 2 + b.size * 0.36, b.a) + '" fill="none"/><text font-family="Cinzel,Georgia,serif" font-weight="800" font-size="' + b.size + '" letter-spacing="2" fill="#f3d98b" opacity=".85"><textPath href="#batjack-plb" startOffset="50%" text-anchor="middle">' + b.t + '</textPath></text>';
    const ly = edge + ry * 0.36;
    return '<svg class="bj-feltsvg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><defs>' +
      '<radialGradient id="batjack-felt" gradientUnits="userSpaceOnUse" cx="' + fx + '" cy="' + ly + '" r="' + rx + '"><stop offset="0" stop-color="#9a1a30"/><stop offset=".45" stop-color="#6e0c1e"/><stop offset=".85" stop-color="#3c0611"/><stop offset="1" stop-color="#22030a"/></radialGradient>' +
      '<radialGradient id="batjack-pool" gradientUnits="userSpaceOnUse" cx="' + fx + '" cy="' + (edge + ry * 0.3) + '" r="' + ry * 0.75 + '"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".22"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="batjack-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2418"/><stop offset=".5" stop-color="#2a0e08"/><stop offset="1" stop-color="#120503"/></linearGradient>' +
      '<filter id="batjack-noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .32 0"/></filter>' +
      '<clipPath id="batjack-feltclip"><path d="' + half(rx, ry) + 'Z"/></clipPath>' + '</defs>' +
      '<path d="' + half(rx + 40, ry + 40) + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="40" transform="translate(0 14)"/>' +
      '<path d="' + half(rx, ry) + 'Z" fill="url(#batjack-felt)"/>' +
      '<g clip-path="url(#batjack-feltclip)"><rect x="' + (fx - rx) + '" y="' + edge + '" width="' + rx * 2 + '" height="' + ry + '" filter="url(#batjack-noise)" opacity=".6"/>' +
      '<ellipse cx="' + fx + '" cy="' + (edge + ry * 0.3) + '" rx="' + rx * 0.8 + '" ry="' + ry * 0.75 + '" fill="url(#batjack-pool)"/>' +
      '<path d="' + B.batPath + '" transform="translate(' + (fx - 120 * c.cw / 78) + ' ' + (p.y - 6) + ') scale(' + (2 * c.cw / 78) + ')" fill="#e2bd62" opacity=".06"/>' + print + '</g>' +
      '<path d="' + half(rx - 10, ry - 10) + '" fill="none" stroke="#c99a35" stroke-width="2.2" opacity=".8"/><path d="' + half(rx - 17, ry - 17) + '" fill="none" stroke="#c99a35" stroke-width=".8" stroke-dasharray="3 5" opacity=".55"/>' +
      '<path d="' + half(rx + 19, ry + 19) + '" fill="none" stroke="url(#batjack-rail)" stroke-width="38"/>' +
      '<path d="' + half(rx + 8, ry + 8) + '" fill="none" stroke="rgba(255,200,160,.22)" stroke-width="5"/>' +
      '<path d="' + half(rx + 26, ry + 26) + '" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2" stroke-dasharray="5 4"/>' +
      '<path d="' + half(rx + 1, ry + 1) + '" fill="none" stroke="#c99a35" stroke-width="2"/></svg>';
  }

  /* ============================== poster ============================== */
  function poster() {
    const card = (c, x, y, rot) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') translate(-50 -70)">' + faceSvg(c).replace('<svg viewBox="0 0 100 140" aria-hidden="true">', '').replace('</svg>', '').replace('url(#batjack-paper)', 'url(#batjack-p-paper)') + '</g>';
    return '<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Bat Jack"><defs>' +
      '<radialGradient id="batjack-p-felt" cx=".5" cy=".75" r=".8"><stop offset="0" stop-color="#7a1022"/><stop offset=".55" stop-color="#3d0611"/><stop offset="1" stop-color="#0d0205"/></radialGradient>' +
      '<radialGradient id="batjack-p-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4cf"/><stop offset=".6" stop-color="#f3d98b"/><stop offset="1" stop-color="#f3d98b" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="batjack-p-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1be"/><stop offset=".45" stop-color="#e2bd62"/><stop offset=".55" stop-color="#a8792a"/><stop offset="1" stop-color="#f3d98b"/></linearGradient>' +
      '<linearGradient id="batjack-p-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9dcc0"/></linearGradient>' +
      '<radialGradient id="batjack-flat-shine" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
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
    const liveTxt = '<h3>The live table</h3><p>Everyone online plays the same table at the same time, dealt by Barnaby. Betting is open for 15 seconds; then the cards come out. <b>Every player gets the same first two cards and the same dealer.</b> From there you play your own hand: hit, stand, double or split as you like. Your extra cards come from your own private order of the shoe, so nobody else\'s hit tells you anything, and your hand is exactly a normal blackjack hand dealt from a freshly shuffled six-deck shoe. Other players\' moves are hidden until the dealer plays.</p>' +
      '<p>You have 20 seconds to decide (insurance gets 7 seconds before that when the dealer shows an ace); the ring round the timer and your seat counts it down. The dealer plays as soon as everyone has finished, or when the time runs out. Any hand still undecided then stands. One hand per player, with Perfect Pairs and 21+3 alongside. Main bet 10 to 10,000 BB, side bets up to 1,000 BB, in 10 BB chips.</p>';
    return (B.online ? liveTxt : '<h3>The table</h3><p>Six decks, shuffled fresh for every round. Play one, two or three seats at once; each seat has its own main bet and its own optional side bets. Bets come in 10 BB chips: main bet 10 to 10,000 BB per seat, each side bet up to 1,000 BB. Practice hands have no clock: take your time.</p><p>Online, Bat Jack is a live table shared with every player.</p>') +
      '<h3>Rules</h3><ul><li>Blackjack pays <b>3 to 2</b>.</li><li><b>Bat Jack</b>: a blackjack made of an ace and a <b>jack</b> (the bat card), any suits, pays <b>6 to 1</b>.</li>' +
      '<li>Dealer stands on all 17s (soft 17 included).</li><li>Dealer peeks for blackjack under an ace or a ten-value card. A dealer blackjack ends the round at once and you only lose your original bets; a player blackjack against it pushes.</li>' +
      '<li>Double down on any two cards, including after a split. One card on a double (dealt sideways).</li><li>Split any two cards of the same value, up to four hands per seat. Split aces get one card each and cannot be split again. A 21 made after a split is not a blackjack.</li>' +
      '<li>Insurance (when the dealer shows an ace) costs half of each main bet and pays 2 to 1 if the dealer has blackjack.' + (B.online ? '' : ' One answer covers every seat.') + '</li><li>No surrender.</li></ul>' +
      '<h3>House rule: dealer 22 pushes</h3><p>If the dealer busts with <b>exactly 22</b>, every hand still standing is a push (your stake comes back). Blackjacks have already been paid. This is what pays for the 6 to 1 Bat Jack. It happens in about 5.9% of rounds.</p>' +
      '<h3>Perfect Pairs</h3><p>Pays on your first two cards.</p><table><tr><th>Hand</th><th>Pays</th></tr>' + pp + '</table>' +
      '<h3>21+3</h3><p>Your first two cards plus the dealer\'s up card, as a three-card poker hand. Ace counts high or low in a straight.</p><table><tr><th>Hand</th><th>Pays</th></tr>' + t3 + '</table>' +
      '<h3>Bat Advice</h3><p>Turn on Bat Advice and the correct basic-strategy move for these exact rules is marked on the buttons. It never takes insurance. Players who follow it get the designed return below.</p>' +
      '<h3>Controls</h3><p>Tap a betting spot to add the chosen chip; right-click (or Undo) takes it back. Keys: <b>Space</b> deals (or rebets and deals), <b>H</b> hit, <b>S</b> or Space stand, <b>D</b> double, <b>P</b> split, <b>I</b>/<b>N</b> insurance, <b>1</b>–<b>6</b> pick a chip, <b>C</b> clear, <b>U</b> undo, <b>X</b> double the bets, <b>R</b> rebet, <b>A</b> Bat Advice, <b>Q</b> quick deal. Tap the table during the deal or the payout to hurry it along.</p>' +
      '<h3>Leaving mid-hand</h3><p>If you leave a hand unfinished, insurance is declined and every remaining hand stands; the dealer then plays it out and it is paid as normal.</p>' +
      '<h3>Return</h3><table><tr><th>Bet</th><th>Designed return</th></tr>' +
      '<tr><td>Main bet, Bat Advice</td><td>97.85%</td></tr><tr><td>Main bet on the live table (10,000,000 simulated hands)</td><td>98.03%</td></tr><tr><td>Perfect Pairs (exact)</td><td>98.07%</td></tr><tr><td>21+3 (exact)</td><td>98.12%</td></tr>' +
      '<tr><td>Insurance (optional, never advised)</td><td>92.61%</td></tr></table>' +
      '<p class="rtp">Designed return 97.85% (main bet, Bat Advice; exact analysis 97.854%, confirmed by 40,000,000 simulated hands). Perfect Pairs 98.07%, 21+3 98.12%. Live-balanced site-wide to a 98% target. Batty Bucks have no cash value.</p>';
  }

  /* ============================== memory and sound ============================== */
  let S = null, G = null;
  const mem = { chip: 2, last: null, advice: true, quick: false, hist: [] };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) { if (raw.chip >= 0 && raw.chip < M.CHIPS.length) mem.chip = raw.chip | 0; if (Array.isArray(raw.last)) mem.last = raw.last; mem.advice = raw.advice !== false; mem.quick = !!raw.quick; if (Array.isArray(raw.hist)) mem.hist = raw.hist.slice(0, 30); } } catch (e) { /* memory only */ }
  const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify({ chip: mem.chip, last: mem.last, advice: mem.advice, quick: mem.quick, hist: mem.hist.slice(0, 30) })); } catch (e) { /* memory only */ } };

  const A = B.audio;
  const snd = {
    slide() { A.noise({ d: 0.14, v: 0.12, lp: 900, f2: 5200 }); },
    snap() { A.noise({ d: 0.035, v: 0.2, hp: 2600 }); A.tone({ f: 210, f2: 110, d: 0.05, type: 'sine', v: 0.09 }); },
    flip() { A.noise({ d: 0.09, v: 0.14, hp: 1500, f2: 5000 }); A.tone({ f: 520, f2: 260, d: 0.08, type: 'triangle', v: 0.06 }); },
    chip() { B.sfx('chip'); A.noise({ d: 0.02, v: 0.08, hp: 4200, t: 0.02 }); },
    clack(n) { for (let i = 0; i < Math.min(n || 3, 7); i++) { A.tone({ f: 2300 + ((i * 397) % 900), d: 0.025, type: 'square', v: 0.03, t: i * 0.045 }); A.noise({ d: 0.02, v: 0.09, hp: 3800, t: i * 0.045 }); } },
    chipSlide() { A.noise({ d: 0.3, v: 0.08, lp: 1600, f2: 500 }); },
    organ(notes, step, v) { A.seq(notes, { step: step || 0.16, type: 'sawtooth', v: v || 0.06, d: (step || 0.16) * 2.2 }); A.seq(notes.map((n) => (Array.isArray(n) ? [n[0] / 2, n[1]] : n / 2)), { step: step || 0.16, type: 'triangle', v: (v || 0.06) * 1.4, d: (step || 0.16) * 2.2 }); },
    win() { snd.organ([392, 466.2, 587.3, [784, 3]], 0.11, 0.05); },
    bj() { snd.organ([293.7, 349.2, 440, 587.3, [698.5, 4]], 0.1, 0.06); A.tone({ f: 1568, d: 0.9, type: 'sine', v: 0.08, t: 0.4 }); },
    batjack() { A.tone({ f: 2400, f2: 5200, d: 0.14, type: 'square', v: 0.05 }); A.tone({ f: 2800, f2: 6000, d: 0.12, type: 'square', v: 0.04, t: 0.16 }); snd.organ([146.8, 220, 293.7, 349.2, 440, [587.3, 6]], 0.12, 0.08); B.sfx('thunder'); },
    lose() { A.tone({ f: 130, f2: 70, d: 0.35, type: 'sawtooth', v: 0.06 }); },
    bust() { A.tone({ f: 98, f2: 40, d: 0.4, type: 'sine', v: 0.32 }); A.noise({ d: 0.18, v: 0.1, lp: 600 }); },
    push() { A.tone({ f: 660, d: 0.12, type: 'triangle', v: 0.08 }); A.tone({ f: 660, d: 0.12, type: 'triangle', v: 0.06, t: 0.14 }); },
    reveal() { B.sfx('drum'); },
    turn() { A.tone({ f: 880, d: 0.06, type: 'sine', v: 0.06 }); A.tone({ f: 1320, d: 0.08, type: 'sine', v: 0.04, t: 0.07 }); },
    wings() { for (let i = 0; i < 4; i++) A.noise({ d: 0.07, v: 0.05, lp: 700, t: i * 0.09 }); },
    side() { A.seq([1046.5, 1318.5, 1568], { step: 0.06, type: 'square', v: 0.05 }); },
    squeak() { A.tone({ f: 1700, f2: 2600, d: 0.07, type: 'sine', v: 0.035 }); A.tone({ f: 2100, f2: 3000, d: 0.06, type: 'sine', v: 0.03, t: 0.09 }); },
    chuckle() { for (let i = 0; i < 4; i++) A.tone({ f: 520 - i * 30, f2: 420 - i * 30, d: 0.07, type: 'triangle', v: 0.05, t: i * 0.11 }); },
    gasp() { A.tone({ f: 600, f2: 1300, d: 0.22, type: 'triangle', v: 0.06 }); A.noise({ d: 0.25, v: 0.05, hp: 1800, f2: 4000 }); },
    clap() { for (let i = 0; i < 7; i++) A.noise({ d: 0.03, v: 0.12, hp: 1400, t: i * 0.12 + ((i * 37) % 5) / 100 }); },
    ooh() { A.noise({ d: 0.7, v: 0.06, lp: 500, f2: 1200 }); A.tone({ f: 240, f2: 330, d: 0.6, type: 'triangle', v: 0.04 }); },
    tick() { B.sfx('tick'); },
    whoosh() { A.noise({ d: 0.3, v: 0.1, lp: 400, f2: 4200 }); },
  };

  const LINES = {
    bets: ['Place your bets, my lovelies.', 'Chips down, darlings.', 'Who fancies a flutter?', 'Bets, please. Fangs out!'],
    nomore: ['No more bets!', 'Right then, cards coming.'],
    deal: ['Good luck, my dears.', 'Here we go…', 'Fresh from the shoe.'],
    ins: ['Insurance, anyone?', 'An ace! Insurance?'],
    nobj: ['Nothing under there. Carry on!', 'No blackjack. Phew!'],
    bj: ['Blackjack! Smashing.', 'Ooh, blackjack! Lovely.'],
    batjack: ['A Bat Jack! Well I never!', 'BAT JACK! Six to one!'],
    bust: ['Oh dear, oh dear.', 'Bust! Hard cheese.', 'Too many, I\'m afraid.'],
    dbust: ['Crumbs! I\'m bust.', 'Blast! Over I go.'],
    d22: ['Twenty-two! Stakes back.'],
    dbj: ['Blackjack for the house. Sorry, chaps.'],
    pwin: ['Well played!', 'Jolly good show.', 'You\'ve got me there.'],
    dwin: ['The house thanks you.', 'Better luck next time.'],
    push: ['A push. Nobody\'s cross.'],
    side: ['Ooh, the side bet lands!', 'Side bet pays!'],
    double: ['Doubling? Brave bat.', 'Double it is.'],
    split: ['Splitting them, are we?', 'Two hands. Cheeky!'],
    idle: ['Lovely night for it.', 'Mind the fangs.', 'Six decks, fresh shoe.'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ICON = {
    hit: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
    stand: '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
    double: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="14" fill="currentColor">×2</text></svg>',
    split: '<svg viewBox="0 0 24 24"><path d="M12 20v-6L6 7M12 14l6-7M3 7h5V2M21 7h-5V2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="rotate(180 12 12) translate(0 -1)"/></svg>',
    ins: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/><path d="M8 12l3 3 5-6" stroke="#2a0508" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
    noins: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    deal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="10" height="14" rx="2" transform="rotate(-12 8 12)" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="5" width="10" height="14" rx="2" transform="rotate(10 16 12)" fill="currentColor"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
    x2: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="13" fill="currentColor">×2</text></svg>',
    rebet: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function mount(root) {
    S = B.scope();
    const live = B.online;
    let devOn = false; try { devOn = !live && localStorage.getItem('batty-dev') === '1'; } catch (e) { /* off */ }
    const dev = devOn ? (window.__batjackDev = { force: null, rounds: 0, staked: 0, won: 0, last: null }) : null;
    const g = { phase: 'bet', bets: [0, 1, 2].map(() => ({ main: 0, pp: 0, t3: 0 })), undo: [], v: null, rid: 0, seq: 0, local: null, busy: false, dead: false, lastWin: 0, hurry: false };
    G = g;
    /* LIVE: the shared table. L.st is the last state from the server; the director turns it into the felt. */
    const L = { st: null, off: null, best: 1e9, age: 0, polling: false, others: [null, null], confirmed: 0, sending: false, dirty: false, shown: null, settled: {}, done: {}, odone: {}, running: false, again: false, lastTick: 0, called: {} };
    const nowS = () => Date.now() / 1000 + (L.off || 0);
    const T = (ms) => (reduce ? Math.min(ms, 120) : (mem.quick || g.hurry) ? ms * 0.45 : ms);

    /* ---------- DOM: the room ---------- */
    root.innerHTML = DEFS;
    const el = {};
    const bg = h('div', { class: 'bj-bg', html: roomSvg() });
    const motes = h('div', { class: 'bj-motes', 'aria-hidden': 'true' }); for (let i = 0; i < 9; i++) motes.append(h('i', { style: '--x:' + (8 + i * 11) + '%;--d:' + (9 + (i % 4) * 3) + 's;--o:-' + i * 1.7 + 's' }));
    const flyers = h('div', { class: 'bj-flyers', 'aria-hidden': 'true' });
    const view = h('div', { class: 'bj-view' });
    const stage = h('div', { class: 'bj-stage' });
    view.append(stage);
    const room = h('div', { class: 'bj-room' + (live ? ' bj-live' : '') }, bg, motes, flyers, view);

    /* ---------- the dealer ---------- */
    const D = (() => {
      const body = h('div', { class: 'bj-dealer', html: dealerSvg() });
      const arms = h('div', { class: 'bj-darms', html: armsSvg() });
      const bub = h('div', { class: 'bj-bubble', 'aria-hidden': 'true' });
      const svgB = body.firstChild, svgA = arms.firstChild;
      let reactT = 0, bubT = 0;
      function react(kind, ms) {
        for (const s of [svgB, svgA]) { s.classList.remove('x-happy', 'x-sad', 'x-shock', 'x-clap', 'x-laugh', 'x-peek', 'x-shrug'); }
        void body.offsetWidth;
        if (kind) for (const s of [svgB, svgA]) s.classList.add('x-' + kind);
        S.clear(reactT); if (kind && ms) reactT = S.timeout(() => react(null), ms);
      }
      function say(text, ms) {
        bub.textContent = text; bub.classList.remove('on'); void bub.offsetWidth; bub.classList.add('on'); snd.squeak();
        S.clear(bubT); bubT = S.timeout(() => bub.classList.remove('on'), ms || 2600);
      }
      function shoulder(side) { const r = svgA.getBoundingClientRect(), k = r.width / 360 || 1; return { x: r.left + (side === 'r' ? 238 : 122) * k, y: r.top + 118 * k, k }; }
      function pose(side, x, y) {
        const s = shoulder(side), dx = x - s.x, dy = Math.max(10 * s.k, y - s.y);
        const a = Math.max(-84, Math.min(72, -Math.atan2(dx, dy) * 57.2958));
        const e = Math.max(1, Math.min(1.45, Math.hypot(dx, dy) / s.k / 120));
        return 'rotate(' + a.toFixed(1) + 'deg) scale(1,' + e.toFixed(2) + ')';
      }
      /* swing an arm through screen points: pts [{x, y, at (0..1)}] */
      function reach(side, pts, ms) {
        if (reduce) return;
        const arm = svgA.querySelector('.d-arm.' + side); if (!arm) return;
        const cur = getComputedStyle(arm).transform;
        const frames = [{ transform: cur && cur !== 'none' ? cur : 'rotate(0deg) scale(1,1)', offset: 0 }];
        for (const p of pts) frames.push({ transform: pose(side, p.x, p.y), offset: p.at });
        frames.push({ transform: 'rotate(0deg) scale(1,1)', offset: 1 });
        arm.getAnimations().forEach((a) => a.cancel());
        arm.animate(frames, { duration: ms, easing: 'ease-in-out' });
      }
      function look(x, y) {
        const r = svgB.getBoundingClientRect(), k = r.width / 360 || 1;
        const dx = x - (r.left + 180 * k), dy = y - (r.top + 60 * k), d = Math.hypot(dx, dy) || 1;
        svgB.style.setProperty('--px', (dx / d * 3.4).toFixed(2) + 'px'); svgB.style.setProperty('--py', (dy / d * 3).toFixed(2) + 'px');
      }
      function lookHome() { svgB.style.setProperty('--px', '0px'); svgB.style.setProperty('--py', '1px'); }
      function twitch() { const e = svgB.querySelectorAll('.d-ear')[Math.random() < 0.5 ? 0 : 1]; e.classList.remove('tw'); void body.offsetWidth; e.classList.add('tw'); }
      return { body, arms, bub, react, say, reach, look, lookHome, twitch };
    })();

    /* ---------- the stage: felt, shoe, tray, dealer's cards, seats ---------- */
    const felt = h('div', { class: 'bj-felt' });
    const pool = h('div', { class: 'bj-pool' });
    const edgeEl = h('div', { class: 'bj-edge' });
    const tray = h('div', { class: 'bj-tray bj-abs', html: traySvg() });
    const shoe = h('div', { class: 'bj-shoe bj-abs', html: SHOE_SVG }, h('i', { class: 'bj-mouth' }));
    const pile = h('i', { class: 'pile' });
    const discard = h('div', { class: 'bj-discard bj-abs' }, pile, h('span', null, 'DISCARD'));
    const dealerCards = h('div', { class: 'bj-cards bj-dcards' });
    const dealerBadge = h('div', { class: 'bj-badge bj-dbadge' });
    const dWrap = h('div', { class: 'bj-dzone bj-abs' }, dealerCards, dealerBadge);
    el.timer = h('div', { class: 'bj-timer bj-abs', hidden: true, html: '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><circle class="v" cx="22" cy="22" r="19"/></svg><b></b><small></small>' });
    el.call = h('div', { class: 'bj-call bj-abs', 'aria-hidden': 'true' });
    el.winPl = h('div', { class: 'bj-winpl bj-abs', 'aria-hidden': 'true' });
    el.rail = h('aside', { class: 'bj-rail', 'aria-label': 'Players at the table' });
    el.hist = h('div', { class: 'bj-dhist', 'aria-label': 'Dealer results' });

    const seatEls = [0, 1, 2].map((i) => {
      const mk = (k, label) => {
        const stack = h('div', { class: 'bj-stack' }), amt = h('b', { class: 'bj-amt' }), pay = h('div', { class: 'bj-stack bj-pay' }), plq = h('div', { class: 'bj-plq' });
        const spot = h('button', { type: 'button', class: 'bj-spot bj-' + k, 'data-seat': i, 'data-k': k, 'aria-label': 'Seat ' + (i + 1) + ' ' + (k === 'main' ? 'main bet' : k === 'pp' ? 'Perfect Pairs' : '21+3') },
          h('span', { class: 'bj-ring' }, h('i', null, label)), stack, pay, amt, plq);
        spot.addEventListener('click', () => addChip(i, k));
        spot.addEventListener('contextmenu', (e) => { e.preventDefault(); removeBet(i, k); });
        return { spot, stack, amt, pay, plq, n: -1 };
      };
      const pp = mk('pp', 'PAIRS'), main = mk('main', 'SEAT ' + (i + 1)), t3 = mk('t3', '21+3');
      const insStack = h('div', { class: 'bj-stack' });
      const ins = h('div', { class: 'bj-ins' }, insStack);
      const hands = h('div', { class: 'bj-hands' });
      const plate = h('div', { class: 'bj-plate' });
      const wrap = h('div', { class: 'bj-seat', 'data-i': i }, ins, pp.spot, t3.spot, main.spot, hands, plate);
      return { wrap, hands, pp, main, t3, ins, insStack, plate, handEls: [] };
    });
    stage.append(felt, pool, D.body, edgeEl, tray, shoe, discard, D.arms, dWrap, ...seatEls.map((s) => s.wrap), el.timer, D.bub, el.call, el.winPl);
    if (live) stage.append(el.rail, el.hist);

    /* ---------- control bar ---------- */
    const btn = (cls, label, key, fn, icon) => {
      const b = h('button', { type: 'button', class: 'bj-btn ' + cls, 'aria-label': label + (key ? ' (' + key + ')' : '') }, icon ? h('span', { class: 'ic', html: icon }) : null, h('span', { class: 'lb' }, label), key ? h('kbd', null, key) : null);
      b.addEventListener('click', () => { B.audio.ensure(); fn(); }); return b;
    };
    el.chips = h('div', { class: 'bj-chips', role: 'radiogroup', 'aria-label': 'Chip value' });
    M.CHIPS.forEach((v, i) => { const c = h('button', { type: 'button', class: 'bj-chip', role: 'radio', 'data-v': v, 'aria-label': fmt(v) + ' BB chip', html: chipSvg(v) }); c.addEventListener('click', () => { mem.chip = i; saveMem(); snd.chip(); paintChips(); }); el.chips.append(c); });
    el.clear = btn('ghost', 'Clear', 'C', () => clearBets(), ICON.clear);
    el.undo = btn('ghost', 'Undo', 'U', () => undo(), ICON.undo);
    el.x2 = btn('ghost', '×2', 'X', () => doubleBets(), ICON.x2);
    el.rebet = btn('ghost', 'Rebet', 'R', () => rebet(false), ICON.rebet);
    el.deal = btn('primary', 'Deal', 'Space', () => dealOrRebet(), ICON.deal);
    el.hit = btn('act hit', 'Hit', 'H', () => act('hit'), ICON.hit);
    el.stand = btn('act stand', 'Stand', 'S', () => act('stand'), ICON.stand);
    el.dbl = btn('act dbl', 'Double', 'D', () => act('double'), ICON.double);
    el.split = btn('act split', 'Split', 'P', () => act('split'), ICON.split);
    el.insY = btn('act ins', 'Insure', 'I', () => insure(true), ICON.ins);
    el.insN = btn('act noins', 'No thanks', 'N', () => insure(false), ICON.noins);
    el.advice = h('button', { type: 'button', class: 'bj-tog', 'aria-pressed': 'false', 'aria-label': 'Bat Advice (A)', title: 'Bat Advice (A)' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg>' }), h('span', { class: 'tl' }, 'Advice'));
    el.advice.addEventListener('click', () => { mem.advice = !mem.advice; saveMem(); B.sfx('click'); paintAdvice(); });
    el.quick = h('button', { type: 'button', class: 'bj-tog', 'aria-pressed': 'false', 'aria-label': 'Quick deal (Q)', title: 'Quick deal (Q)' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>' }), h('span', { class: 'tl' }, 'Quick'));
    el.quick.addEventListener('click', () => { mem.quick = !mem.quick; saveMem(); B.sfx('click'); paintToggles(); });
    el.histB = h('button', { type: 'button', class: 'bj-tog', 'aria-label': 'Hand history', title: 'Hand history' }, h('span', { class: 'ic', html: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }), h('span', { class: 'tl' }, 'History'));
    el.histB.addEventListener('click', () => showHistory());
    el.total = h('b', null, '0'); el.win = h('b', null, '0');
    el.msg = h('div', { class: 'bj-msg', role: 'status', 'aria-live': 'polite' }, h('span', null, 'Place your bets'));
    el.tbar = h('div', { class: 'bj-tbar', 'aria-hidden': 'true' }, h('i'));
    const info = h('div', { class: 'bj-info' }, h('span', null, h('small', null, 'Total bet'), el.total), h('span', { class: 'w' }, h('small', null, 'Last win'), el.win));
    el.betRow = h('div', { class: 'bj-row bj-betrow' }, el.clear, el.undo, el.x2, el.rebet, el.deal);
    el.actRow = h('div', { class: 'bj-row bj-actrow' }, el.split, el.dbl, el.hit, el.stand);
    el.insCost = h('b', { class: 'bj-inscost' });
    el.insRow = h('div', { class: 'bj-row bj-insrow' }, h('p', null, h('span', null, 'Insurance?'), el.insCost), el.insN, el.insY);
    el.waitRow = h('div', { class: 'bj-row bj-waitrow' }, h('p', null, ''));
    el.left = h('div', { class: 'bj-left' }, info, h('div', { class: 'bj-togs' }, el.advice, el.quick, el.histB));
    el.ctl = h('div', { class: 'bj-ctl' }, el.betRow, el.actRow, el.insRow, el.waitRow);
    const bar = h('div', { class: 'bj-bar' }, el.tbar, el.msg, el.left, el.chips, el.ctl);
    el.banner = h('div', { class: 'bj-banner', 'aria-hidden': 'true' });
    root.append(room, bar, el.banner);

    /* ---------- layout: pick a table layout and scale the stage to fit ---------- */
    let C = null, SC = 1;
    const posAbs = (e, x, y) => { e.style.left = x + 'px'; e.style.top = y + 'px'; };
    function applyLayout(c) {
      C = c; root.dataset.lay = c.name;
      stage.style.width = c.W + 'px'; stage.style.height = c.H + 'px';
      root.style.setProperty('--cw', c.cw + 'px');
      felt.innerHTML = feltSvg(c);
      const ds = c.d.s;
      for (const e of [D.body, D.arms]) { e.style.width = 360 * ds + 'px'; e.style.height = 200 * ds + 'px'; e.style.left = (c.d.x - 180 * ds) + 'px'; e.style.top = (c.edge - 178 * ds) + 'px'; }
      edgeEl.style.top = (c.edge - 7) + 'px'; edgeEl.style.width = (c.W + 600) + 'px';
      tray.style.width = c.tray + 'px'; posAbs(tray, c.d.x, c.edge + c.tray * 0.075);
      shoe.style.width = c.shoe.w + 'px'; posAbs(shoe, c.shoe.x, c.shoe.y);
      discard.style.width = c.disc.w + 'px'; posAbs(discard, c.disc.x, c.disc.y);
      posAbs(dWrap, c.dc.x, c.dc.y);
      posAbs(el.timer, c.timer.x, c.timer.y);
      posAbs(el.call, c.call.x, c.call.y); posAbs(el.winPl, c.call.x, c.call.y);
      posAbs(D.bub, c.bub.x, c.bub.y);
      seatEls.forEach((s, i) => { const p = c.seats[i]; posAbs(s.wrap, p.x, p.y); s.wrap.style.setProperty('--s', p.s); });
      light(lightAt);
    }
    function layout() {
      const W0 = root.clientWidth, H0 = window.innerHeight - (root.getBoundingClientRect().top + window.scrollY > 0 ? root.getBoundingClientRect().top + window.scrollY : 56);
      if (!W0) return;
      const short = W0 > H0 * 1.3 && H0 < 560, phone = !short && W0 < 700;
      root.classList.toggle('bj-short', short); root.classList.toggle('bj-phone', phone);
      const vw = view.clientWidth, vh = view.clientHeight; if (!vw || !vh) return;
      const want = short ? LAY.compact : vw / vh < 1.08 ? LAY.tall : LAY.wide;
      if (want !== C) applyLayout(want);
      SC = Math.min(vw / C.W, vh / C.H, 1.4);
      const left = (vw - C.W * SC) / 2, top = C === LAY.tall ? Math.max(0, (vh - C.H * SC) * 0.35) : (vh - C.H * SC) / 2;
      stage.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px) scale(' + SC.toFixed(4) + ')';
      root.style.setProperty('--sc', SC.toFixed(4));
    }
    const ro = new ResizeObserver(() => layout()); ro.observe(root); ro.observe(bar); S.on(window, 'resize', layout);

    /* the pool of light follows the action: the whole table, a seat, or the dealer */
    let lightAt = 'table';
    function light(where) {
      lightAt = where; if (!C) return;
      let x = C.fx, y = C.edge + C.ry * 0.42, w = C.W * 0.9, hh = C.ry * 0.9, o = 0.55;
      if (typeof where === 'number') { const p = C.seats[where]; x = p.x; y = p.y - 70 * p.s; w = 380 * p.s; hh = 300 * p.s; o = 1; }
      else if (where === 'dealer') { x = C.dc.x; y = C.dc.y; w = 460; hh = 240; o = 0.9; }
      pool.style.width = w + 'px'; pool.style.height = hh + 'px';
      pool.style.transform = 'translate(' + (x - w / 2) + 'px,' + (y - hh / 2) + 'px)'; pool.style.opacity = o;
    }

    /* ---------- painting ---------- */
    function msg(text, cls) { el.msg.className = 'bj-msg' + (cls ? ' ' + cls : ''); el.msg.firstChild.textContent = text; }
    let callT = 0;
    function call(text, cls, ms) {
      el.call.innerHTML = '<b>' + text + '</b>'; el.call.className = 'bj-call bj-abs ' + (cls || '');
      void el.call.offsetWidth; el.call.classList.add('on');
      S.clear(callT); callT = S.timeout(() => el.call.classList.remove('on'), ms || 1500);
    }
    function paintChips() { [...el.chips.children].forEach((c, i) => { c.classList.toggle('on', i === mem.chip); c.setAttribute('aria-checked', i === mem.chip ? 'true' : 'false'); }); }
    function paintToggles() { el.quick.setAttribute('aria-pressed', mem.quick ? 'true' : 'false'); el.advice.setAttribute('aria-pressed', mem.advice ? 'true' : 'false'); }
    function paintSpot(sp, n, drop) {
      if (sp.n === n) return;
      const grew = sp.n >= 0 && n > sp.n; sp.n = n;
      sp.stack.innerHTML = n ? stackHtml(n, sp.spot.classList.contains('bj-main') ? 9 : 6, drop && grew) : '';
      sp.amt.textContent = n ? fmt(n) : '';
      sp.spot.classList.toggle('has', n > 0);
    }
    function betSeats() { return g.phase === 'bet' ? g.bets : g.v ? g.v.seats.map((s) => ({ main: s.main, pp: s.pp, t3: s.t3 })) : g.bets; }
    function paintBets(drop) {
      let bs;
      if (live) {
        const me = g.phase === 'bet' ? g.bets[1] : L.st && L.st.mine ? (L.st.mine.v ? L.st.mine.v.seats[0] : L.st.mine.bet) : g.bets[1];
        bs = [L.others[0] || { main: 0, pp: 0, t3: 0 }, me || { main: 0, pp: 0, t3: 0 }, L.others[1] || { main: 0, pp: 0, t3: 0 }];
        el.total.textContent = fmt(g.phase === 'bet' ? M.betCost([g.bets[1]]) : L.st && L.st.mine ? L.st.mine.stake : 0);
      } else {
        bs = betSeats();
        el.total.textContent = fmt(g.phase === 'bet' ? M.betCost(g.bets) : g.v ? g.v.staked : 0);
      }
      bs.forEach((b, i) => { const s = seatEls[i]; paintSpot(s.main, b.main, drop); paintSpot(s.pp, b.pp, drop); paintSpot(s.t3, b.t3, drop); s.wrap.classList.toggle('empty', !b.main); });
      paintPlates();
    }
    function controls() {
      const ph = g.phase, idle = ph === 'bet' && !g.busy;
      root.dataset.phase = g.busy ? 'busy' : ph;
      el.betRow.hidden = ph !== 'bet'; el.actRow.hidden = ph !== 'player'; el.insRow.hidden = ph !== 'insurance';
      el.waitRow.hidden = ph === 'bet' || ph === 'player' || ph === 'insurance';
      el.chips.classList.toggle('off', ph !== 'bet');
      const cost = M.betCost(g.bets), has = g.bets.some((b) => b.main);
      el.clear.disabled = !idle || !cost; el.undo.disabled = !idle || !g.undo.length; el.x2.disabled = !idle || !has;
      el.rebet.disabled = !idle || !mem.last || has;
      el.deal.disabled = !idle || (!has && !mem.last);
      el.deal.hidden = live;
      el.deal.querySelector('.lb').textContent = has ? 'Deal' : mem.last ? 'Rebet & Deal' : 'Deal';
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
      if (g.phase !== 'player' || !g.v.cur) return null;
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
      c.innerHTML = '<i class="bj-shad"></i><div class="bj-cin"><div class="bj-face">' + (code >= 0 ? faceSvg(code) : '') + '<i class="bj-sheen"></i></div><div class="bj-back">' + BACK_SVG + '</div></div>';
      return c;
    }
    function setFace(c, code) { c.querySelector('.bj-face').innerHTML = faceSvg(code) + '<i class="bj-sheen"></i>'; c.dataset.c = code; }
    function layCards(cont) { const kids = [...cont.children]; kids.forEach((c, k) => c.style.setProperty('--k', k)); cont.style.setProperty('--n', Math.max(1, kids.length)); }
    const centre = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
    const mouth = () => centre(shoe.querySelector('.bj-mouth'));
    function sheen(card, delay) { if (reduce) return; const s = card.querySelector('.bj-sheen'); if (s) s.animate([{ opacity: 0, transform: 'translateX(-70%)' }, { opacity: 0.95, offset: 0.3 }, { opacity: 0, transform: 'translateX(70%)' }], { duration: 650, delay: delay || 0, easing: 'ease-out' }); }
    /* a card arcs from the shoe's mouth to its place, lifting (bigger, softer shadow) and flipping face up on the way */
    function flyCard(card, faceUp, ms) {
      if (reduce) return Promise.resolve();
      const to = centre(card), from = mouth(), k = to.w / (card.offsetWidth || 1) || 1;
      const dx = (from.x - to.x) / k, dy = (from.y - to.y) / k, s0 = Math.max(0.35, (C.cw * SC * 0.6) / to.w);
      const ease = 'cubic-bezier(.28,.62,.3,1)';
      const a = card.animate([
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(-24deg) scale(' + s0.toFixed(3) + ')', offset: 0 },
        { transform: 'translate(' + (dx * 0.42).toFixed(1) + 'px,' + (dy * 0.42 - 44).toFixed(1) + 'px) rotate(-7deg) scale(1.12)', offset: 0.52 },
        { transform: 'translate(0px,-2px) rotate(1.5deg) scale(1.01)', offset: 0.86 },
        { transform: 'none', offset: 1 }], { duration: ms, easing: ease });
      card.querySelector('.bj-shad').animate([{ transform: 'translate(0px,0px)', opacity: 0.15 }, { transform: 'translate(14px,38px) scale(1.06)', opacity: 0.2, offset: 0.52 }, { transform: 'translate(2px,4px)', opacity: 0.5, offset: 0.86 }, { transform: 'none', opacity: 0.55 }], { duration: ms, easing: ease });
      if (faceUp) { card.querySelector('.bj-cin').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.28 }, { transform: 'rotateY(-14deg)', offset: 0.8 }, { transform: 'rotateY(0deg)' }], { duration: ms, easing: 'ease-in-out' }); sheen(card, ms * 0.7); }
      return a.finished.catch(() => {});
    }
    function newHandBox() {
      const cards = h('div', { class: 'bj-cards' }), badge = h('div', { class: 'bj-badge' }), res = h('div', { class: 'bj-res' }), bet = h('div', { class: 'bj-hbet' }), num = h('i', { class: 'bj-hnum' });
      const ptr = h('i', { class: 'bj-ptr', html: '<svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg>' });
      const box = h('div', { class: 'bj-hand' }, ptr, cards, badge, bet, num, res);
      return { box, cards, badge, res, bet, num, betKey: undefined };
    }
    function paintHandBet(hb, hd, many) {
      const show = many || hd.dbl, key = show ? hd.bet + (hd.dbl ? 'd' : '') : '';
      if (hb.betKey === key) return;
      const grew = hb.betKey !== undefined && !!key; hb.betKey = key;
      hb.bet.innerHTML = show ? '<span class="bj-stack mini">' + stackHtml(hd.bet, 5, grew) + '</span><b>' + fmt(hd.bet) + (hd.dbl ? ' · ×2' : '') + '</b>' : '';
    }
    function badge(elB, cards, extra) {
      elB.classList.remove('soft', 'bust', 'bj', 'twentyone', 'bat');
      if (!cards.length) { elB.textContent = ''; return; }
      const t = M.total(cards), nat = cards.length === 2 && t.t === 21 && !extra.split;
      elB.textContent = nat ? (M.isBatJack(cards) ? 'BAT JACK' : 'BLACKJACK') : t.t > 21 ? t.t + ' BUST' : t.soft && t.t < 21 && !extra.done ? (t.t - 10) + ' / ' + t.t : String(t.t);
      elB.classList.toggle('soft', t.soft && !nat); elB.classList.toggle('bust', t.t > 21); elB.classList.toggle('bj', nat); elB.classList.toggle('bat', nat && M.isBatJack(cards)); elB.classList.toggle('twentyone', t.t === 21 && !nat);
    }
    function clearTable() {
      for (const s of seatEls) { s.hands.textContent = ''; s.handEls = []; s.wrap.classList.remove('turn', 'won', 'lostall'); s.insStack.innerHTML = ''; s.ins.classList.remove('on'); delete s.ins.dataset.gone; }
      dealerCards.textContent = ''; dealerBadge.textContent = ''; dealerBadge.className = 'bj-badge bj-dbadge'; dealerBadge.hidden = true; dWrap.classList.remove('bust', 'bjk');
    }
    /* Bring the table from what it shows (prev) to view v, animating every new card in dealing order. */
    async function present(v, prev) {
      const initial = !prev;
      const jobs = [];
      v.seats.forEach((st, i) => {
        if (!st.main) return;
        const s = seatEls[i];
        const before = new Map(); s.handEls.forEach((hb) => [...hb.cards.children].forEach((c) => before.set(c, c.getBoundingClientRect())));
        let split = false;
        if (prev && prev.phase === 'player' && prev.cur && prev.cur[0] === i && st.hands.length === s.handEls.length + 1) {
          const hi = prev.cur[1], src = s.handEls[hi], nb = newHandBox();
          s.handEls.splice(hi + 1, 0, nb);
          const moved = src.cards.children[1]; if (moved) nb.cards.append(moved);
          split = true;
        }
        while (s.handEls.length < st.hands.length) s.handEls.push(newHandBox());
        s.hands.textContent = ''; s.handEls.forEach((hb) => s.hands.append(hb.box));
        s.hands.dataset.n = st.hands.length;
        st.hands.forEach((hd, j) => {
          const hb = s.handEls[j], old = [...hb.cards.children];
          let k0 = 0; while (k0 < old.length && k0 < hd.cards.length && +old[k0].dataset.c === hd.cards[k0]) k0++;
          old.slice(k0).forEach((c) => c.remove());
          for (let k = k0; k < hd.cards.length; k++) {
            const c = makeCard(hd.cards[k]); c.dataset.new = '1';
            if (hd.dbl && k === 2) c.classList.add('side');
            hb.cards.append(c);
            jobs.push({ c, order: initial ? (k === 0 ? i : 10 + i + k * 0.001) : 100 + i * 10 + j + k * 0.01 });
          }
          layCards(hb.cards);
          hb.box.classList.toggle('dbl', hd.dbl);
          hb.num.textContent = st.hands.length > 1 ? String(j + 1) : '';
          paintHandBet(hb, hd, st.hands.length > 1);
        });
        if (!reduce) for (const [c, r0] of before) if (c.isConnected) {
          const r1 = c.getBoundingClientRect(), k = r1.width / (c.offsetWidth || 1) || 1, dx = (r0.left - r1.left) / k, dy = (r0.top - r1.top) / k;
          if (Math.abs(dx) + Math.abs(dy) > 2) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' + (split ? ' rotate(-4deg)' : '') }, { transform: 'none' }], { duration: T(split ? 520 : 380), easing: 'cubic-bezier(.3,.8,.3,1)' });
        }
        if (split) { snd.chipSlide(); S.timeout(() => snd.clack(3), T(300)); }
      });
      /* dealer */
      const dEls = [...dealerCards.children];
      const dShow = v.dealer.hole ? v.dealer.cards.concat([-1]) : v.dealer.cards;
      if (v.dealer.peeked && !(prev && prev.dealer.peeked)) jobs.push({ peek: true, order: initial ? 16 : 199 });
      dShow.forEach((code, k) => {
        let c = dEls[k];
        if (c && code >= 0 && +c.dataset.c < 0) jobs.push({ c, flipTo: code, dealer: true, k, order: 200 + k });
        else if (!c) { c = makeCard(code); c.dataset.new = '1'; dealerCards.append(c); jobs.push({ c, dealer: true, k, order: initial ? (k === 0 ? 5 : k === 1 ? 15 : 300 + k) : 200 + k }); }
      });
      layCards(dealerCards);
      jobs.sort((a, b) => a.order - b.order);
      /* hide the cards still to come so totals and positions stay honest */
      for (const j of jobs) if (j.c && j.c.dataset.new) j.c.style.visibility = 'hidden';
      paintBadges(v, true);
      let dealerDrew = false;
      for (const j of jobs) {
        if (g.dead) return;
        if (j.peek) { await peekFx(v); continue; }
        if (j.flipTo !== undefined) { await revealHole(j.c, j.flipTo); paintBadges(v, true); continue; }
        if (j.dealer && !initial && j.k >= 2) { if (!dealerDrew) { light('dealer'); await S.sleep(T(280)); } dealerDrew = true; await S.sleep(T(200)); }
        const tc = centre(j.c), m = mouth();
        D.look(tc.x, tc.y);
        D.reach('r', [{ x: m.x, y: m.y, at: 0.28 }, { x: tc.x, y: tc.y, at: 0.66 }], T(660));
        await S.sleep(T(150));
        if (g.dead) return;
        j.c.style.visibility = ''; delete j.c.dataset.new;
        snd.slide();
        const p = flyCard(j.c, +j.c.dataset.c >= 0, T(470));
        S.timeout(snd.snap, T(420));
        await S.sleep(T(initial ? 250 : 320));
        p.then(() => { if (!g.dead) paintBadges(v, true); });
      }
      await S.sleep(T(jobs.length ? 380 : 0));
      if (g.dead) return;
      paintBadges(v, false);
      D.lookHome();
    }
    async function revealHole(c, code) {
      const tc = centre(c);
      light('dealer'); D.look(tc.x, tc.y);
      D.reach('l', [{ x: tc.x, y: tc.y, at: 0.4 }, { x: tc.x, y: tc.y - 10, at: 0.6 }], T(900));
      await S.sleep(T(330)); if (g.dead) return;
      snd.reveal(); setFace(c, code);
      if (!reduce) c.animate([{ transform: 'none' }, { transform: 'translateY(-16px) scale(1.1)', offset: 0.45 }, { transform: 'none' }], { duration: T(560), easing: 'ease-out' });
      c.classList.remove('down'); snd.flip(); sheen(c, 280);
      await S.sleep(T(560));
    }
    async function peekFx(v) {
      const c = dealerCards.children[1]; if (!c) return;
      const tc = centre(c);
      light('dealer'); D.react('peek', T(1300)); D.look(tc.x, tc.y + 30);
      D.reach('l', [{ x: tc.x, y: tc.y, at: 0.3 }, { x: tc.x, y: tc.y, at: 0.72 }], T(1200));
      call('Dealer peeks', 'quiet', T(1100));
      if (!reduce) c.animate([{ transform: 'none' }, { transform: 'perspective(380px) rotateX(-42deg) translateY(-3px)', offset: 0.35 }, { transform: 'perspective(380px) rotateX(-42deg) translateY(-3px)', offset: 0.65 }, { transform: 'none' }], { duration: T(1150), easing: 'ease-in-out' });
      await S.sleep(T(1200)); if (g.dead) return;
      if (!v.dealer.bj) {
        call('No blackjack', 'good', T(1100)); D.say(pick(LINES.nobj), 1800); snd.push();
        /* insurance lost: the dealer sweeps it */
        const ins = seatEls.filter((s, i) => v.seats[i] && v.seats[i].ins && s.ins.classList.contains('on'));
        if (ins.length) await collect(ins.map((s) => ({ stack: s.insStack, spot: s.ins })));
      } else { call('Dealer blackjack', 'bad', T(1400)); }
      await S.sleep(T(300));
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
          hb.box.classList.toggle('waiting', v.phase === 'player' && v.cur && v.cur[0] === i && !cur && !hd.done);
        });
        s.wrap.classList.toggle('turn', v.phase === 'player' && !!v.cur && v.cur[0] === i && !partial);
      });
      const dv = visibleCodes(dealerCards);
      badge(dealerBadge, dv, { done: true });
      dealerBadge.hidden = !dv.length;
    }

    /* ---------- chips moving on the felt ---------- */
    /* move an element so its centre lands on a screen point; in its own (scaled) coordinates */
    function toward(e, pt, ms, o) {
      o = o || {};
      if (reduce) return Promise.resolve();
      const c0 = centre(e), k = c0.w / (e.offsetWidth || 1) || 1;
      if (!c0.w) return Promise.resolve();
      const dx = (pt.x - c0.x) / k, dy = (pt.y - c0.y) / k;
      return e.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.5 - (o.arc || 0)).toFixed(1) + 'px) scale(' + ((1 + (o.scale || 0.7)) / 2) + ')', opacity: 1, offset: 0.5 },
        { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + (o.scale || 0.7) + ')', opacity: o.fade ? 0 : 1 }], { duration: ms, easing: o.ease || 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' }).finished.catch(() => {});
    }
    /* the dealer rakes stacks into his tray */
    async function collect(items) {
      items = items.filter((it) => it.stack.childElementCount && !it.spot.dataset.gone);
      if (!items.length) return;
      const tr = centre(tray), c0 = centre(items[0].stack);
      D.reach('l', [{ x: c0.x, y: c0.y, at: 0.35 }, { x: tr.x, y: tr.y, at: 0.8 }], T(820));
      D.look(c0.x, c0.y);
      snd.chipSlide();
      await Promise.all(items.map((it, k) => S.sleep(T(k * 70)).then(() => toward(it.stack, tr, T(560), { fade: true, scale: 0.45, arc: 10 }))));
      for (const it of items) it.spot.dataset.gone = '1';
      snd.clack(3);
    }
    /* the dealer cuts a payout stack from the tray and slides it beside the bet */
    async function payTo(sp, amount, ms) {
      if (amount <= 0) return;
      sp.pay.innerHTML = stackHtml(amount, 9); sp.pay.classList.add('on');
      const tr = centre(tray), c1 = centre(sp.pay), k = c1.w / (sp.pay.offsetWidth || 1) || 1;
      D.reach('r', [{ x: tr.x + 20, y: tr.y, at: 0.25 }, { x: c1.x, y: c1.y, at: 0.62 }], T(ms + 260));
      snd.chipSlide();
      if (!reduce) await sp.pay.animate([{ transform: 'translate(' + ((tr.x - c1.x) / k).toFixed(1) + 'px,' + ((tr.y - c1.y) / k).toFixed(1) + 'px) scale(.55)', opacity: 0.3 },
        { transform: 'translate(' + ((tr.x - c1.x) / k * 0.4).toFixed(1) + 'px,' + ((tr.y - c1.y) / k * 0.4 - 20).toFixed(1) + 'px) scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: T(ms), easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.catch(() => {});
      snd.clack(chipsFor(amount).length);
    }
    /* winnings slide off the felt to the player */
    async function toPlayer() {
      const items = [];
      for (const s of seatEls) for (const sp of [s.main, s.pp, s.t3]) {
        if (sp.stack.childElementCount && !sp.spot.dataset.gone && !sp.spot.classList.contains('other')) items.push(sp.stack);
        if (sp.pay.classList.contains('on') && !sp.spot.classList.contains('other')) items.push(sp.pay);
      }
      for (const s of seatEls) if (s.ins.classList.contains('on') && !s.ins.dataset.gone && s.insStack.childElementCount) { items.push(s.insStack); s.ins.dataset.gone = '1'; }
      if (!items.length || reduce) return;
      const dst = centre(el.win);
      snd.whoosh();
      await Promise.all(items.map((e, k) => S.sleep(T(k * 60)).then(() => toward(e, dst, T(620), { fade: true, scale: 0.4, arc: 50, ease: 'cubic-bezier(.5,0,.6,1)' }))));
      for (const s of seatEls) for (const sp of [s.main, s.pp, s.t3]) { if (!sp.spot.classList.contains('other')) sp.spot.dataset.gone = '1'; }
    }
    function flyChip(v, from, to, ms) {
      const r0 = from.getBoundingClientRect(), r1 = to.getBoundingClientRect();
      if (!r0.width || reduce) return;
      const fly = h('div', { class: 'g-batjack-fly', html: chipSvg(v, r0.width) });
      Object.assign(fly.style, { left: r0.left + 'px', top: r0.top + 'px', width: r0.width + 'px', height: r0.height + 'px' });
      document.body.append(fly);
      const dx = r1.left + r1.width / 2 - r0.left - r0.width / 2, dy = r1.top + r1.height / 2 - r0.top - r0.height / 2, sc = Math.max(0.35, (C.cw * SC * 0.7) / r0.width);
      fly.animate([{ transform: 'none' }, { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 70 * SC) + 'px) scale(' + ((1 + sc) / 2) + ')', offset: 0.5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ',' + sc * 0.6 + ')' }], { duration: ms, easing: 'cubic-bezier(.3,.6,.4,1)' })
        .finished.then(() => fly.remove(), () => fly.remove());
      S.timeout(() => fly.remove(), ms + 200);
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
      const sp = seatEls[i][k];
      flyChip(v, el.chips.children[mem.chip], sp.spot, 300);
      sp.spot.style.setProperty('--dd', reduce ? '0ms' : '280ms');
      S.timeout(() => snd.clack(2), reduce ? 0 : 280);
      snd.chip(); paintBets(true); controls(); queueSend();
      if (sp.spot.classList.contains('bj-main') && !reduce) D.look(centre(sp.spot).x, centre(sp.spot).y);
    }
    function removeBet(i, k) {
      if (g.phase !== 'bet' || g.busy || !g.bets[i][k]) return;
      g.undo.push(snapshot());
      g.bets[i][k] = 0; if (k === 'main') { g.bets[i].pp = 0; g.bets[i].t3 = 0; }
      B.sfx('click'); paintBets(); controls(); queueSend();
    }
    function clearBets() { if (g.phase !== 'bet' || g.busy) return; if (M.betCost(g.bets)) g.undo.push(snapshot()); g.bets = [0, 1, 2].map(() => ({ main: 0, pp: 0, t3: 0 })); snd.chipSlide(); paintBets(); controls(); queueSend(); }
    function undo() { if (g.phase !== 'bet' || g.busy || !g.undo.length) return; g.bets = g.undo.pop(); B.sfx('click'); paintBets(); controls(); queueSend(); }
    function doubleBets() {
      if (g.phase !== 'bet' || g.busy) return;
      const nb = g.bets.map((b) => ({ main: Math.min(M.LIMITS.mainMax, b.main * 2), pp: Math.min(M.LIMITS.sideMax, b.pp * 2), t3: Math.min(M.LIMITS.sideMax, b.t3 * 2) }));
      if (M.betCost(nb) - (live ? L.confirmed : 0) > B.wallet.balance) { B.ui.broke(); return; }
      seatEls.forEach((s) => { if (s.main.n > 0) s.main.spot.style.setProperty('--dd', '0ms'); });
      g.undo.push(snapshot()); g.bets = nb; snd.clack(4); paintBets(true); controls(); queueSend();
    }
    function rebet(andDeal) {
      if (g.phase !== 'bet' || g.busy || !mem.last) return false;
      let nb = mem.last.map((b) => ({ main: b.main | 0, pp: b.pp | 0, t3: b.t3 | 0 }));
      if (live) { const one = nb.find((b) => b.main) || nb[1]; nb = [{ main: 0, pp: 0, t3: 0 }, { main: one.main, pp: one.pp, t3: one.t3 }, { main: 0, pp: 0, t3: 0 }]; }
      if (M.checkBets(nb)) return false;
      if (M.betCost(nb) - (live ? L.confirmed : 0) > B.wallet.balance) { B.ui.broke(); return false; }
      g.undo.push(snapshot()); g.bets = nb; snd.clack(4); paintBets(); controls(); queueSend();
      if (!reduce) seatEls.forEach((s) => { for (const sp of [s.main, s.pp, s.t3]) if (sp.stack.childElementCount) sp.stack.animate([{ transform: 'translateY(-40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' }); });
      if (andDeal && !live) deal();
      return true;
    }
    function dealOrRebet() { if (live) { if (!g.bets[1].main) rebet(false); return; } if (g.bets.some((b) => b.main)) deal(); else rebet(true); }

    /* ---------- a round ---------- */
    function forced(bets) {
      const f = dev && dev.force; if (dev) dev.force = null;
      const want = {
        ace: (S2) => M.valOf(S2.dealer[0]) === 1, ten: (S2) => M.valOf(S2.dealer[0]) === 10 && !S2.dealerBJ,
        pair: (S2) => S2.seats.some((s) => s.main && M.valOf(s.hands[0].cards[0]) === M.valOf(s.hands[0].cards[1])) && M.valOf(S2.dealer[0]) !== 1,
        aces: (S2) => S2.seats.some((s) => s.main && M.valOf(s.hands[0].cards[0]) === 1 && M.valOf(s.hands[0].cards[1]) === 1),
        batjack: (S2) => S2.seats.some((s) => s.main && M.isBatJack(s.hands[0].cards)) && M.valOf(S2.dealer[0]) !== 1 && !S2.dealerBJ,
        blackjack: (S2) => S2.seats.some((s) => s.main && M.isNatural(s.hands[0].cards) && !M.isBatJack(s.hands[0].cards)) && M.valOf(S2.dealer[0]) !== 1 && !S2.dealerBJ,
        dealerbj: (S2) => S2.dealerBJ, perfect: (S2) => S2.seats.some((s) => s.ppKind === 'perfect'), side: (S2) => S2.seats.some((s) => s.t3Kind || s.ppKind),
        eleven: (S2) => S2.seats.some((s) => s.main && M.total(s.hands[0].cards).t === 11 && !M.total(s.hands[0].cards).soft) && M.valOf(S2.dealer[0]) < 7,
        bust: (S2) => S2.seats.some((s) => s.main && M.total(s.hands[0].cards).t >= 13 && M.total(s.hands[0].cards).t <= 16 && !M.total(s.hands[0].cards).soft) && M.valOf(S2.dealer[0]) >= 7 && M.valOf(S2.dealer[0]) <= 10 && !S2.dealerBJ,
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
      g.busy = true; g.hurry = false; controls();
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
      msg('Good luck', 'quiet'); D.say(pick(LINES.deal), 1600); light('table');
      await present(v, null);
      if (g.dead) return;
      await naturals(v);
      await sideResults(v);
      await afterStep(v);
    }
    /* blackjacks are announced as soon as they land */
    async function naturals(v) {
      if (v.dealer.bj) return;
      let bat = false, any = false;
      v.seats.forEach((st, i) => {
        if (!st.main || (live && i !== 1)) return;
        const hd = st.hands[0], hb = seatEls[i].handEls[0];
        if (!hd || !hb || !M.isNatural(hd.cards) || hd.fromSplit) return;
        any = true; if (M.isBatJack(hd.cards)) bat = true;
        hb.box.classList.add('natural'); [...hb.cards.children].forEach((c, k) => sheen(c, k * 120));
        B.fx.burst({ el: hb.cards, kind: 'spark', count: 26, power: 0.7, colors: ['#fff1be', '#e2bd62', '#ffffff'] });
      });
      if (!any) return;
      if (bat) { batJackShow(); D.react('shock', 2200); D.say(pick(LINES.batjack), 2600); await S.sleep(T(1500)); }
      else { snd.bj(); D.react('clap', 1800); snd.clap(); D.say(pick(LINES.bj), 2200); call('Blackjack!', 'gold', T(1400)); await S.sleep(T(900)); }
    }
    function plaque(sp, title, odds, amount) {
      sp.plq.innerHTML = '<b>' + title + '</b><span>' + odds + '</span>' + (amount ? '<em>+' + fmt(amount) + '</em>' : '');
      sp.plq.classList.remove('on'); void sp.plq.offsetWidth; sp.plq.classList.add('on');
    }
    async function sideResults(v) {
      let any = false; const lost = [], pays = [];
      for (let i = 0; i < 3; i++) {
        const st = v.seats[i]; if (!st || !st.main || (live && i !== 1)) continue;
        const s = seatEls[i];
        if (st.pp) { if (st.ppKind) { plaque(s.pp, PP_NAME[st.ppKind], M.PP[st.ppKind] + ' to 1', st.ppWin - st.pp); s.pp.spot.classList.add('paid'); pays.push([s.pp, st.ppWin - st.pp]); any = true; } else { s.pp.spot.classList.add('lost'); lost.push(s.pp); } }
        if (st.t3) { if (st.t3Kind) { plaque(s.t3, T3_NAME[st.t3Kind], M.T3[st.t3Kind] + ' to 1', st.t3Win - st.t3); s.t3.spot.classList.add('paid'); pays.push([s.t3, st.t3Win - st.t3]); any = true; } else { s.t3.spot.classList.add('lost'); lost.push(s.t3); } }
      }
      if (!lost.length && !pays.length) return;
      if (any) {
        snd.side(); D.react('sad', 1500); D.say(pick(LINES.side), 1800);
        for (const [sp] of pays) B.fx.burst({ el: sp.spot, kind: 'coin', count: 16, power: 0.55 });
      }
      await S.sleep(T(any ? 700 : 300));
      if (lost.length) await collect(lost.map((sp) => ({ stack: sp.stack, spot: sp.spot })));
      for (const [sp, amt] of pays) { await payTo(sp, amt, 480); }
      if (pays.length) await S.sleep(T(300));
    }
    /* after every server/maths step: turn indicator, messages, or the end of the round */
    async function afterStep(v) {
      if (g.dead) return;
      g.phase = v.phase;
      if (v.phase === 'insurance') {
        el.insCost.textContent = 'Costs ' + fmt(v.insCost) + ' BB';
        msg('Dealer shows an ace. Insurance costs ' + fmt(v.insCost) + ' BB', 'ask'); snd.turn();
        call('Insurance?', 'ask', T(1600)); D.say(pick(LINES.ins), 2200);
        root.classList.add('bj-insure'); light('dealer'); g.hurry = false;
      } else if (v.phase === 'player') {
        root.classList.remove('bj-insure');
        const [si, hi] = v.cur, hd = v.seats[si].hands[hi];
        const many = v.seats[si].hands.length > 1;
        const t = M.total(hd.cards), up = M.valOf(v.dealer.cards[0]);
        let text = (live ? 'Your hand' : 'Seat ' + (si + 1)) + (many ? ', hand ' + (hi + 1) : '') + ': ' + (t.soft ? 'soft ' : '') + t.t + ' against ' + (up === 1 ? 'an ace' : up === 10 ? 'a ten' : up === 8 ? 'an 8' : 'a ' + up);
        if (mem.advice) { const a = M.adviseCards(hd.cards, v.dealer.cards[0], v.legal); text += ' · Bat Advice: ' + ACT_NAME[a]; }
        msg(text, 'turn'); snd.turn(); light(si); g.hurry = false;
        const hb = seatEls[si].handEls[hi]; if (hb) { const c = centre(hb.cards); D.look(c.x, c.y); }
      } else if (v.phase === 'done') { root.classList.remove('bj-insure'); await finish(v); return; }
      g.busy = false; controls(); paintBadges(v, false);
    }
    async function act(a) {
      if (g.phase !== 'player' || g.busy || !g.v || g.v.legal.indexOf(a) < 0) return;
      const [si, hi] = g.v.cur, cost = a === 'double' || a === 'split' ? g.v.seats[si].hands[hi].bet : 0;
      if (cost && !B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      g.busy = true; controls();
      B.sfx('click');
      if (cost) { snd.chip(); S.timeout(() => snd.clack(3), 200); D.say(pick(a === 'split' ? LINES.split : LINES.double), 1500); }
      const hb0 = seatEls[si].handEls[hi];
      if (a === 'stand' && hb0) { hb0.box.classList.add('stood'); if (!reduce) hb0.cards.animate([{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 220 }); }
      let v;
      if (live) {
        const r = await B.play(ID, 'act', { round: g.rid, move: a, seq: g.seq }, cost);
        if (g.dead) return;
        if (r && L.st && L.st.mine) { L.st.mine.v = r.v; L.st.mine.seq = r.seq; L.st.mine.stake = r.stake; g.seq = r.seq; }
        g.busy = false; B.wallet.sync();
        direct();
        return;
      } else if (B.online) {
        const r = await B.play(ID, a, { round: g.rid, seq: g.seq }, cost);
        if (g.dead) return;
        if (!r) { await resync(); return; }
        v = r.v; g.seq = r.seq;
      } else { const e = M.act(g.local, a); if (e) { B.wallet.unbet(cost); B.ui.toast(e); g.busy = false; controls(); return; } v = M.view(g.local); if (dev && cost) dev.staked += cost; }
      const prev = g.v; g.v = v; paintBets();
      await present(v, prev);
      if (g.dead) return;
      await bustCheck(v, prev, si);
      await afterStep(v);
    }
    /* a hand that has just gone over 21: stamp it, and take the bet at once if the whole seat is bust */
    async function bustCheck(v, prev, si) {
      const st = v.seats[si], ps = prev.seats[si]; if (!st) return;
      let busted = false;
      st.hands.forEach((hd, j) => {
        const was = ps.hands[j], hb = seatEls[si].handEls[j];
        if (!hb || M.total(hd.cards).t <= 21 || (was && was.cards.length === hd.cards.length && M.total(was.cards).t > 21)) return;
        busted = true; hb.box.classList.add('busted');
        hb.res.className = 'bj-res show r-bust'; hb.res.innerHTML = '<b>BUST</b>';
        if (!reduce) hb.cards.animate([{ transform: 'none' }, { transform: 'translateX(-6px) rotate(-1deg)' }, { transform: 'translateX(5px) rotate(1deg)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 360 });
      });
      if (!busted) return;
      snd.bust(); D.react('laugh', 1500); snd.chuckle(); D.say(pick(LINES.bust), 1800);
      if (st.hands.every((hd) => M.total(hd.cards).t > 21)) { await S.sleep(T(450)); const s = seatEls[si]; await collect([{ stack: s.main.stack, spot: s.main.spot }]); s.handEls.forEach((hb) => { if (hb.bet.firstChild) hb.bet.classList.add('gone'); }); }
      else await S.sleep(T(350));
    }
    async function insure(take) {
      if (g.phase !== 'insurance' || g.busy) return;
      const cost = take ? g.v.insCost : 0;
      if (cost && !B.wallet.bet(ID, cost)) { B.ui.broke(); return; }
      g.busy = true; controls(); B.sfx('click');
      root.classList.remove('bj-insure');
      if (take) placeInsurance(live ? [1] : g.v.seats.map((st, i) => (st.main ? i : -1)).filter((i) => i >= 0), live ? [g.v.seats[1].main / 2] : g.v.seats.map((st) => st.main / 2));
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
      msg(take ? 'Insured. The dealer peeks' : 'No insurance. The dealer peeks', 'quiet');
      await S.sleep(T(take ? 500 : 250));
      await present(v, prev);
      await afterStep(v);
    }
    /* insurance chips go on the insurance line in front of each seat */
    function placeInsurance(seatIdx, amounts) {
      seatIdx.forEach((i, k) => {
        const s = seatEls[i], amt = amounts[live ? 0 : i]; if (!amt) return;
        s.insStack.innerHTML = stackHtml(amt, 5); s.ins.classList.add('on'); delete s.ins.dataset.gone;
        if (!reduce) { const r = el.chips.getBoundingClientRect(), c = centre(s.insStack), kk = c.w / (s.insStack.offsetWidth || 1) || 1; s.insStack.animate([{ transform: 'translate(' + ((r.left + r.width / 2 - c.x) / kk) + 'px,' + ((r.top - c.y) / kk) + 'px) scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: k * 80, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' }); }
      });
      S.timeout(() => snd.clack(3), 400);
    }
    /* online: a request failed mid-round; ask the server where we are */
    async function resync() {
      let r = null;
      try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { /* offline */ }
      if (g.dead) return;
      if (r && r.v) { const prev = g.v; g.v = r.v; g.rid = r.round; g.seq = r.seq; paintBets(); await present(r.v, prev); await afterStep(r.v); }
      else { g.busy = false; g.phase = 'bet'; B.wallet.sync(); controls(); msg('Place your bets'); }
    }
    /* the dealer's own outcome, then every seat is settled in turn, then the winnings slide to the player */
    async function finish(v) {
      g.busy = true; controls(); light('dealer');
      B.wallet.win(ID, v.win, { silent: true });
      if (dev) dev.won += v.win;
      const dt = M.total(v.dealer.cards).t, drew = v.dealer.cards.length > 2;
      if (v.dealer.bj) { D.react('happy', 1800); D.say(pick(LINES.dbj), 2200); snd.lose(); }
      else if (dt === 22) { call('Dealer 22 · stakes back', 'push', T(1700)); D.react('shrug', 1800); D.say(pick(LINES.d22), 2200); dWrap.classList.add('bust'); snd.push(); }
      else if (dt > 21) { call('Dealer busts!', 'good', T(1600)); D.react('shock', 1800); D.say(pick(LINES.dbust), 2200); snd.ooh(); flash(); dWrap.classList.add('bust'); }
      else if (drew || dt >= 17) call('Dealer has ' + dt, 'quiet', T(1200));
      await S.sleep(T(v.dealer.bj ? 900 : 650));
      if (g.dead) return;
      let best = null; const order = ['lose', 'bust', 'push', 'push22', 'win', 'blackjack', 'batjack'];
      for (const i of [2, 1, 0]) {
        const st = v.seats[i]; if (!st || !st.main || (live && i !== 1)) continue;
        const s = seatEls[i];
        light(i);
        let seatBest = null;
        st.hands.forEach((hd, j) => {
          const hb = s.handEls[j]; if (!hb || !hd.res) return;
          const profit = hd.win - hd.bet;
          hb.res.className = 'bj-res r-' + hd.res; void hb.res.offsetWidth; hb.res.classList.add('show');
          hb.res.innerHTML = '<b>' + RES_TEXT[hd.res] + '</b>' + (hd.win > hd.bet ? '<span>+' + fmt(profit) + '</span>' : '');
          hb.box.classList.add(hd.win > hd.bet ? 'won' : hd.win === hd.bet ? 'pushed' : 'lost');
          if (hd.win === 0 && hb.bet.firstChild) hb.bet.classList.add('gone');
          if (!best || order.indexOf(hd.res) > order.indexOf(best)) best = hd.res;
          if (!seatBest || order.indexOf(hd.res) > order.indexOf(seatBest)) seatBest = hd.res;
        });
        const mainWin = st.hands.reduce((a, hd) => a + hd.win, 0), mainBet = st.hands.reduce((a, hd) => a + hd.bet, 0);
        if (mainWin > mainBet) { (seatBest === 'blackjack' || seatBest === 'batjack' ? snd.bj : snd.win)(); s.wrap.classList.add('won'); B.fx.burst({ el: s.main.spot, kind: 'coin', count: 14 + Math.min(30, Math.round((mainWin - mainBet) / mainBet * 6)), power: 0.6 }); }
        else if (mainWin === mainBet) snd.push(); else snd.lose();
        await S.sleep(T(360)); if (g.dead) return;
        if (mainWin === 0) { await collect([{ stack: s.main.stack, spot: s.main.spot }]); s.wrap.classList.add('lostall'); }
        else if (mainWin > mainBet) await payTo(s.main, mainWin - mainBet, 520);
        if (st.insWin && s.ins.classList.contains('on')) { B.fx.burst({ el: s.ins, kind: 'coin', count: 12, power: 0.5 }); }
        await S.sleep(T(220)); if (g.dead) return;
      }
      const net = v.win - v.staked;
      if (best === 'batjack' || best === 'blackjack' || net > 0) { D.react(net > 0 ? 'sad' : 'clap', 1600); if (!v.dealer.bj && dt <= 21) D.say(pick(LINES.pwin), 1800); }
      else if (net < 0 && !v.dealer.bj) { D.react('happy', 1500); if (dt <= 21) D.say(pick(LINES.dwin), 1800); }
      else if (net === 0 && v.win) D.say(pick(LINES.push), 1600);
      msg(v.dealer.bj ? 'Dealer blackjack' + (v.win ? ' · paid ' + fmt(v.win) + ' BB' : '') : v.win > v.staked ? 'You win ' + fmt(v.win) + ' BB' : v.win === v.staked ? 'Stakes back · ' + fmt(v.win) + ' BB' : v.win ? 'Paid ' + fmt(v.win) + ' BB' : 'The house takes it. Next hand?', v.win > v.staked ? 'good' : v.win ? 'quiet' : 'bad');
      if (v.win > v.staked) await winPlaque(v.win, v.staked);
      await toPlayer();
      if (g.dead) return;
      g.lastWin = v.win; B.ui.countUp(el.win, 0, v.win, 600);
      if (v.win) { room.classList.remove('glow'); void room.offsetWidth; room.classList.add('glow'); }
      record(v);
      await B.ui.celebrate({ amount: v.win, bet: v.staked });
      if (g.dead) return;
      B.wallet.sync(); light('table'); D.lookHome();
      if (live) { g.phase = 'rest'; g.busy = false; controls(); return; }
      g.phase = 'bet'; g.busy = false; g.local = null; g.hurry = false;
      g.bets = g.startBets.map(() => ({ main: 0, pp: 0, t3: 0 })); g.undo = [];
      controls();
      msg('Place your bets'); S.timeout(() => { if (g.phase === 'bet' && !g.busy) D.say(pick(LINES.bets), 2200); }, 900);
    }
    async function winPlaque(win, staked) {
      const x = win / Math.max(1, staked), tier = x >= 5 ? 'mega' : x >= 2.4 ? 'big' : '';
      el.winPl.className = 'bj-winpl bj-abs ' + tier; el.winPl.innerHTML = '<small>' + (tier === 'mega' ? 'Superb win' : tier === 'big' ? 'Big win' : 'You win') + '</small><b>0</b><i></i>';
      void el.winPl.offsetWidth; el.winPl.classList.add('on');
      B.fx.burst({ el: el.winPl, kind: x >= 2.4 ? 'confetti' : 'coin', count: x >= 2.4 ? 60 : 28, power: 0.9 });
      const tick = S.interval(() => snd.tick(), 70);
      await B.ui.countUp(el.winPl.querySelector('b'), 0, win, T(900));
      S.clear(tick); B.sfx('coin');
      await S.sleep(T(900));
      el.winPl.classList.remove('on');
    }
    function batJackShow() {
      snd.batjack(); snd.wings(); flash();
      let swarm = ''; for (let i = 0; i < 16; i++) { const a = (i / 16) * 360 + (i % 3) * 7; swarm += '<i style="--a:' + a + 'deg;--d:' + (180 + (i % 5) * 60) + 'px;--t:' + (0.9 + (i % 4) * 0.2) + 's"><svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg></i>'; }
      el.banner.innerHTML = '<div><svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg><b>BAT JACK</b><span>pays 6 to 1</span></div>' + swarm;
      el.banner.classList.remove('on'); void el.banner.offsetWidth; el.banner.classList.add('on');
      B.fx.burst({ el: el.banner, kind: 'spark', count: 60, colors: ['#f3d98b', '#c99a35', '#ffffff', '#b3122a'], power: 1.3 });
      S.timeout(() => el.banner.classList.remove('on'), 2800);
    }
    function flash() { room.classList.remove('flash'); void room.offsetWidth; room.classList.add('flash'); S.timeout(() => room.classList.remove('flash'), 1200); }
    /* before a new deal: sweep the old cards to the discard holder */
    async function sweep() {
      const cards = stage.querySelectorAll('.bj-card');
      for (const s of seatEls) for (const k of ['main', 'pp', 't3']) {
        const sp = s[k]; sp.spot.classList.remove('paid', 'lost'); delete sp.spot.dataset.gone; sp.stack.getAnimations().forEach((a) => a.cancel());
        sp.pay.getAnimations().forEach((a) => a.cancel()); sp.pay.classList.remove('on'); sp.pay.innerHTML = ''; sp.plq.classList.remove('on');
      }
      for (const s of seatEls) { s.insStack.getAnimations().forEach((a) => a.cancel()); }
      el.winPl.classList.remove('on');
      if (cards.length && !reduce) {
        const dr = centre(discard);
        D.reach('l', [{ x: dr.x + 40, y: dr.y + 30, at: 0.5 }], T(700));
        snd.slide(); S.timeout(snd.slide, 120);
        const anims = [...cards].map((c, k) => { const r = centre(c), kk = r.w / (c.offsetWidth || 1) || 1; return c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + ((dr.x - r.x) / kk) + 'px,' + ((dr.y - r.y) / kk) + 'px) rotate(' + (k % 2 ? 80 : 100) + 'deg) scale(.55)', opacity: 0 }], { duration: T(420), delay: k * 22, easing: 'cubic-bezier(.5,0,.7,.6)', fill: 'forwards' }).finished.catch(() => {}); });
        await Promise.race([Promise.all(anims), S.sleep(T(800))]);
        pileN = Math.min(1, pileN + cards.length / 120); discard.style.setProperty('--pile', pileN.toFixed(3));
      }
      clearTable(); paintBets();
    }
    let pileN = 0;

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
      paintRail(); paintHist(); if (g.phase !== 'bet') paintBets(); else paintPlates();
      direct();
    }
    /* seat plates: an avatar medallion with a status ring for every player at the table */
    function paintPlates() {
      const me = B.me;
      seatEls.forEach((s, i) => {
        let html = '', cls = 'bj-plate';
        if (!live) {
          const b = g.phase === 'bet' ? g.bets[i] : g.v ? g.v.seats[i] : g.bets[i];
          if (b && b.main) { html = '<span class="av">' + B.avatar(me ? me.avatar : '6-5', 30) + '</span><b>' + (me ? 'You' : 'You') + '</b><small>Seat ' + (i + 1) + '</small>'; cls += ' me'; }
          else { html = '<i>Seat ' + (i + 1) + '</i>'; cls += ' free'; }
        } else if (i === 1) { html = me ? '<span class="av">' + B.avatar(me.avatar, 30) + '</span><b>You</b>' + (B.level ? '<small>Lv ' + B.level + '</small>' : '') : '<b>You</b>'; cls += ' me'; }
        else {
          const p = L.others[i ? 1 : 0];
          if (!p) { html = '<i>Empty seat</i>'; cls += ' free'; }
          else {
            const t = L.st && L.st.round, decide = t && t.cards && !t.dealer && !p.done;
            const w = p.win == null ? '' : p.win > 0 ? '<em class="up">+' + fmt(p.win) + '</em>' : '<em>–</em>';
            html = '<span class="av">' + B.avatar(p.avatar, 30) + '</span><b>' + String(p.name).replace(/[<>&"]/g, '') + '</b>' + (p.level ? '<small>Lv ' + p.level + '</small>' : '') + (p.done && t && t.cards && !t.dealer ? '<small class="ok">✓ done</small>' : '') + w;
            if (decide) cls += ' think'; if (p.win > 0) cls += ' winner';
          }
        }
        if (s.plate.dataset.k !== html + cls) { s.plate.dataset.k = html + cls; s.plate.innerHTML = '<span class="ring"></span>' + html; s.plate.className = cls; }
        s.main.spot.classList.toggle('other', live && i !== 1); s.pp.spot.classList.toggle('other', live && i !== 1); s.t3.spot.classList.toggle('other', live && i !== 1);
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
      el.hist.innerHTML = '<small>Dealer</small>' + hs.slice(0, 12).map((x) => '<i class="' + (x === 'B' || x === '22' ? 'bust' : x === 'BJ' ? 'bj' : '') + '">' + (x === 'B' ? 'BUST' : x === '22' ? '22' : x) + '</i>').join('');
    }
    function paintTimer(left, span, label) {
      if (left == null || left <= 0) { el.timer.hidden = true; el.tbar.classList.remove('on'); root.style.setProperty('--tl', 0); return; }
      const f = Math.max(0, Math.min(1, left / span));
      el.timer.hidden = false;
      el.timer.querySelector('.v').style.strokeDashoffset = String(119.4 * (1 - f));
      el.timer.querySelector('b').textContent = String(Math.ceil(left));
      el.timer.querySelector('small').textContent = label;
      el.timer.classList.toggle('hot', left <= 5);
      el.tbar.classList.add('on'); el.tbar.classList.toggle('hot', left <= 5); el.tbar.firstChild.style.transform = 'scaleX(' + f.toFixed(4) + ')';
      root.style.setProperty('--tl', f.toFixed(4));
      if (left <= 5.05 && Math.ceil(left) !== L.lastTick) { L.lastTick = Math.ceil(left); snd.tick(); }
    }
    /* the felt as the server sees it: you in the centre seat, two other players either side */
    function comp() {
      const r = L.st, t = r.round, my = r.mine && r.mine.v;
      const peeked = t.peekAt != null && nowS() >= t.peekAt && (M.valOf(t.up) === 1 || M.valOf(t.up) === 10);
      const dealer = t.dealer ? { cards: t.dealer, hole: false, bj: !!t.dealerBJ, total: M.total(t.dealer).t, peeked } : { cards: [t.up], hole: true, bj: false, peeked };
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
    const cardsKey = (v) => JSON.stringify([v.dealer.cards, v.dealer.hole, v.dealer.peeked, v.seats.map((s) => s.hands.map((hd) => hd.cards))]);
    /* the director: one pass at a time, catching up with whatever the server says */
    function direct() { if (L.running) { L.again = true; return; } L.running = true; (async () => { try { do { L.again = false; await step(); } while (L.again && !g.dead); } catch (e) { console.error(e); } L.running = false; })(); }
    function once(key, fn) { if (L.called[key]) return; L.called[key] = true; fn(); }
    async function step() {
      const r = L.st; if (!r || L.off == null || g.dead) return;
      const t = r.round, now = nowS();
      /* the previous hand pays out before the felt is cleared */
      if (g.rid && t.id !== g.rid && !L.done[g.rid] && L.shown && L.shown.seats[1].main) {
        if (L.settled[g.rid]) await finishLive(g.rid); else return;
      }
      if (t.id !== g.rid) {
        g.rid = t.id; L.shown = null; L.confirmed = 0; g.seq = 0; L.called = {};
        g.phase = 'bet'; g.busy = false; g.undo = []; g.bets = blank();
        if (r.mine && r.mine.bet) { g.bets[1] = { main: r.mine.bet.main, pp: r.mine.bet.pp, t3: r.mine.bet.t3 }; L.confirmed = r.mine.stake; }
        await sweep(); if (g.dead) return;
        msg(t.cards ? 'Hand in play: you are watching this one' : 'Place your bets', t.cards ? 'quiet' : '');
        if (!t.cards) { call('Place your bets', 'gold', 1500); D.say(pick(LINES.bets), 2400); light('table'); }
        controls();
      }
      if (!t.cards) {
        if (g.phase !== 'bet' && g.phase !== 'closing') { g.phase = 'bet'; controls(); }
        paintTimer(t.closeAt - now, t.closeAt - t.openAt, 'Bets close');
        if (t.closeAt - now <= 0 && g.phase !== 'closing') { msg('No more bets', 'quiet'); g.phase = 'closing'; controls(); once('nomore', () => { call('No more bets', 'bad', 1300); D.say(pick(LINES.nomore), 1600); }); }
        return;
      }
      if (g.phase === 'bet' || g.phase === 'closing') { g.phase = 'deal'; S.clear(sendT); if (L.dirty && !L.sending) sendBet(); controls(); snd.slide(); once('nomore', () => { call('No more bets', 'bad', 1100); }); }
      g.seq = r.mine ? r.mine.seq : 0;
      const v = comp();
      g.v = v;
      if (!L.shown || cardsKey(v) !== cardsKey(L.shown)) {
        const prev = L.shown; L.shown = v; g.busy = true; controls();
        if (!prev) { msg(r.mine ? 'Good luck' : 'Cards are out', 'quiet'); D.say(pick(LINES.deal), 1500); }
        await present(v, prev);
        if (g.dead) return;
        if (!prev && r.mine && r.mine.v) { await naturals(v); await sideResults(v); }
        if (prev) await bustCheck(v, prev, 1);
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
          else { L.done[t.id] = true; g.phase = 'rest'; controls(); await othersSettle(t.id); }
        }
        return;
      }
      if (my && my.phase === 'insurance' && now < t.peekAt) {
        paintTimer(t.peekAt - now, t.peekAt - t.closeAt - 4, 'Insurance');
        if (g.phase !== 'insurance') { g.phase = 'insurance'; controls(); afterStep(v); }
        return;
      }
      if (now < t.peekAt) { paintTimer(t.peekAt - now, t.peekAt - t.closeAt, t.insurance ? 'Dealer peeks' : 'Dealing'); if (g.phase !== 'wait') { g.phase = 'wait'; root.classList.remove('bj-insure'); controls(); } return; }
      paintTimer(t.decideEnd - now, t.decideEnd - t.peekAt, 'Decisions');
      if (my && my.phase === 'player') {
        once('decide', () => call('Make your decision', 'gold', 1300));
        if (g.phase !== 'player' || L.turnKey !== JSON.stringify(my.cur) + my.legal.join()) { L.turnKey = JSON.stringify(my.cur) + my.legal.join(); g.phase = 'player'; await afterStep(v); }
        return;
      }
      if (g.phase !== 'wait') { g.phase = 'wait'; controls(); msg(r.mine ? 'Done. Waiting for the other players' : 'Players are deciding', 'quiet'); el.waitRow.firstChild.textContent = r.mine ? 'Waiting for the other players…' : 'Watching this hand…'; }
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
      await othersSettle(rid);
    }
    /* the other players' stacks: paid or raked */
    async function othersSettle(rid) {
      if (L.odone[rid]) return; L.odone[rid] = true;
      const items = [];
      for (const i of [0, 2]) {
        const p = L.others[i ? 1 : 0], s = seatEls[i];
        if (!p || p.win == null || !s.main.stack.childElementCount) continue;
        if (p.win > 0) { s.wrap.classList.add('won'); const stake = p.main + p.pp + p.t3; if (p.win > stake) payTo(s.main, p.win - stake, 420); }
        else items.push({ stack: s.main.stack, spot: s.main.spot }, { stack: s.pp.stack, spot: s.pp.spot }, { stack: s.t3.stack, spot: s.t3.spot });
      }
      if (items.length) await collect(items);
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
      if (live) mem.hist[0].s = [null, mem.hist[0].s[1], null];
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
          st.h.forEach((hd, j) => { rows += '<div class="ln"><i>' + (live ? 'You' : 'Seat ' + (i + 1)) + (st.h.length > 1 ? '.' + (j + 1) : '') + '</i>' + mini(hd[0]) + '<em class="r-' + hd[1] + '">' + RES_TEXT[hd[1]] + ' · ' + fmt(hd[2]) + ' → ' + fmt(hd[3]) + '</em></div>'; });
          const sides = [];
          if (st.pp) sides.push(PP_NAME[st.pp] + ' pays ' + fmt(st.pw)); if (st.t3) sides.push(T3_NAME[st.t3] + ' pays ' + fmt(st.tw)); if (st.iw) sides.push('Insurance pays ' + fmt(st.iw));
          if (sides.length) rows += '<div class="ln side"><i></i>' + sides.join(' · ') + '</div>';
        });
        box.append(h('div', { class: 'it', html: rows }));
      }
      B.ui.modal('Hand history', box);
    }

    /* ---------- keyboard and taps ---------- */
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
      else if (g.busy && (k === ' ' || k === 'enter')) { e.preventDefault(); g.hurry = true; }
    });
    /* a tap on the felt while the dealer is busy hurries him along */
    S.on(view, 'pointerdown', (e) => { if (g.busy && !e.target.closest('.bj-spot')) g.hurry = true; });

    /* ---------- ambience: Barnaby idles, bats cross the windows, candles flicker (CSS) ---------- */
    S.interval(() => { if (!reduce && Math.random() < 0.7) D.twitch(); }, 3300);
    S.interval(() => {
      if (reduce || document.hidden) return;
      const b = h('i', { class: 'bj-fbat', html: '<svg viewBox="0 0 120 58"><path d="' + B.batPath + '"/></svg>' });
      const ltr = Math.random() < 0.5, y0 = 4 + Math.random() * 14, y1 = 2 + Math.random() * 18, sz = 0.6 + Math.random() * 0.8;
      b.style.top = y0 + '%'; b.style.setProperty('--sz', sz.toFixed(2)); flyers.append(b);
      const w = room.clientWidth;
      b.animate([{ transform: 'translate(' + (ltr ? -80 : w + 80) + 'px,0) scale(' + sz + ')' }, { transform: 'translate(' + (w * 0.5) + 'px,' + (y1 - y0) * 4 + 'px) scale(' + sz + ')', offset: 0.5 }, { transform: 'translate(' + (ltr ? w + 80 : -80) + 'px,' + (Math.random() * 30 - 15) + 'px) scale(' + sz + ')' }], { duration: 5200 + Math.random() * 3000, easing: 'linear' }).finished.then(() => b.remove(), () => b.remove());
      if (Math.random() < 0.35 && !g.busy) snd.wings();
    }, 7000);
    S.interval(() => { if (g.phase === 'bet' && !g.busy && !live && Math.random() < 0.3) D.say(pick(LINES.idle), 2200); }, 16000);

    /* ---------- start ---------- */
    layout();
    paintChips(); paintBets(); controls(); light('table');
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
    } else { S.timeout(() => { if (g.phase === 'bet' && !g.busy) { D.say(pick(LINES.bets), 2400); call('Place your bets', 'gold', 1400); } }, 700); }
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
