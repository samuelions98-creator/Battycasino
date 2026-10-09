/* ===== moonshot math ===== */
/* Batty's Moonshot — pure maths. No DOM. Shared verbatim by the browser game and sim/moonshot.sim.js.

   All multipliers are integer "cents": 235 means 2.35x. All money is whole Batty Bucks.

   CRASH POINT  X is drawn before launch from one rng() call:  X = floor(100 * R / (1 - u)) cents, floored at 1.00x,
   capped at 10,000x.  So P(X >= x) = R / x for every x on the 0.01 grid from 1.01x up to the cap, and
   P(X = 1.00x) = 1 - R/1.01 (dawn on the launch pad). A bet that cashes at x (auto target or by hand) is paid
   stake * x, so every cash-out point has the same expected return R.

   BLOOD MOON   A second rng() call makes 1 flight in 10 a Blood Moon flight: every cash-out on it is paid x1.5.
   It is drawn with the crash point at launch, after bets are locked. Base return = R * (1 + 0.5 * 0.1) = R * 1.05.

   ECLIPSE INSURANCE  Optional side bet per slot: costs 25% of the stake, pays the stake (never boosted) if dawn
   breaks below 1.20x, whether or not the main bet had already bailed. Return = (1 - R/1.2) / 0.25.

   MOON STAMPS  One card per player. A flight in which a paid bet cashes out at 2.00x or higher earns one stamp
   (recording the largest qualifying stake). A flight in which a paid bet is caught by dawn burns one stamp.
   Both in the same flight cancel out. Eight stamps = a free flight worth the LOWEST stake on the card (so
   ramping the stake late cannot farm it). Free flights pay like a normal bet, cannot be insured and do not
   touch the card. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).moonshot = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const R = 0.911;                 // crash-curve constant: P(X >= x) = R / x
  const CAP_C = 1000000;           // 10,000.00x flight ceiling
  const MIN_CASH_C = 101;          // lowest cash-out / auto target (1.01x)
  const BLOOD_P = 0.1;             // chance a flight is a Blood Moon flight
  const BOOST_NUM = 3, BOOST_DEN = 2; // Blood Moon pays x1.5
  const INS = { num: 25, den: 100, belowC: 120 }; // premium 25% of stake; pays stake if crash < 1.20x
  const STAMP = { needC: 200, size: 8 };
  const CURVE = { a: 0.105, b: 0.0006 }; // multiplier(t seconds) = exp(a t + b t^2): ~1.9x at 6 s, ~10x at 20 s, 100x at ~36 s, cap at ~64 s
  const STAKES = [100, 200, 400, 1000, 2000, 5000, 10000]; // multiples of 100 so stake x multiplier is always a whole number of BB

  /* ---- crash point ---- */
  function crashFromU(u) {
    const raw = Math.floor(100 * R / (1 - u));
    return raw < 100 ? 100 : raw > CAP_C ? CAP_C : raw;
  }
  function makeRound(crashC, blood, out) {
    const r = out || {};
    r.crashC = crashC < 100 ? 100 : crashC > CAP_C ? CAP_C : Math.floor(crashC);
    r.blood = !!blood;
    r.capped = r.crashC >= CAP_C;   // flight reaches the ceiling: everyone still aboard is cashed out there
    r.instant = r.crashC <= 100;    // dawn on the launch pad
    return r;
  }
  /* The whole hidden outcome of a flight. Exactly two rng() calls, in this order. Pass `out` to reuse an object. */
  function drawRound(rng, out) {
    const u = rng(), v = rng();
    return makeRound(crashFromU(u), v < BLOOD_P, out);
  }

  /* ---- multiplier against time (shared by the game clock and anything that needs flight length) ---- */
  function multAt(t) { return t <= 0 ? 1 : Math.exp(CURVE.a * t + CURVE.b * t * t); }
  function centsAt(t) { const c = Math.floor(100 * multAt(t) + 1e-7); return c > CAP_C ? CAP_C : c; }
  function timeAtC(c) { const L = Math.log(Math.max(100, c) / 100); return (-CURVE.a + Math.sqrt(CURVE.a * CURVE.a + 4 * CURVE.b * L)) / (2 * CURVE.b); }

  /* ---- money ---- */
  function cashValue(stake, cents, blood) {
    return blood ? Math.round(stake * cents * BOOST_NUM / (100 * BOOST_DEN)) : Math.round(stake * cents / 100);
  }
  function insurancePremium(stake) { return Math.round(stake * INS.num / INS.den); }
  function insurancePays(round) { return round.crashC < INS.belowC; }
  function clampTargetC(c) { c = Math.round(c); return !(c >= MIN_CASH_C) ? MIN_CASH_C : c > CAP_C ? CAP_C : c; }
  /* Where an auto cash-out lands: the target if the flight gets there, the ceiling if the flight tops out first, else 0 (bust). */
  function autoCashC(round, targetC) {
    if (targetC && targetC <= round.crashC) return targetC;
    return round.capped ? CAP_C : 0;
  }
  /* Can a bet be cashed by hand while `cents` is on the readout? (Flying means the readout is still below the crash point.) */
  function canCashAt(round, cents) { return cents >= MIN_CASH_C && (cents < round.crashC || (round.capped && cents <= CAP_C)); }

  /* ---- Moon Stamps card ---- */
  function newCard() { return { stamps: [], free: [], last: { stamped: false, burned: false, award: 0 } }; }

  /* Settle a finished flight. bets: [{stake, insured, free, cashC}] where cashC is the cents the bet left at (0 = caught by dawn).
     Writes win / insPay / bust onto each bet, updates the card in place (card.last says what happened) and returns the total paid. */
  function settleRound(round, bets, card) {
    let total = 0, stampStake = 0, burned = false;
    for (let i = 0; i < bets.length; i++) {
      const b = bets[i];
      const cashC = b.cashC > 0 && (b.cashC <= round.crashC) ? b.cashC : 0;
      b.bust = cashC === 0;
      b.win = cashC ? cashValue(b.stake, cashC, round.blood) : 0;
      b.insPay = !b.free && b.insured && insurancePays(round) ? b.stake : 0;
      total += b.win + b.insPay;
      if (!b.free) {
        if (b.bust) burned = true;
        else if (cashC >= STAMP.needC && b.stake > stampStake) stampStake = b.stake;
      }
    }
    if (card) {
      const last = card.last || (card.last = {});
      last.stamped = stampStake > 0 && !burned; last.burned = burned && !stampStake && card.stamps.length > 0; last.award = 0;
      last.cancelled = burned && stampStake > 0;
      if (last.stamped) {
        card.stamps.push(stampStake);
        if (card.stamps.length >= STAMP.size) {
          let lo = card.stamps[0];
          for (let k = 1; k < card.stamps.length; k++) if (card.stamps[k] < lo) lo = card.stamps[k];
          card.stamps.length = 0; card.free.push(lo); last.award = lo;
        }
      } else if (last.burned) card.stamps.pop();
    }
    return total;
  }

  /* ---- closed forms (used by the rules panel and printed beside the simulation) ---- */
  const survival = (c) => (c <= 100 ? 1 : c > CAP_C ? 0 : R / (c / 100));     // P(crash >= c)
  const theory = {
    instantBust: 1 - R / 1.01,
    base: R * (1 + (BOOST_NUM / BOOST_DEN - 1) * BLOOD_P),                     // any cash-out plan, no extras
    bloodShare: (BOOST_NUM / BOOST_DEN) * BLOOD_P / (1 + (BOOST_NUM / BOOST_DEN - 1) * BLOOD_P), // share of the base return paid on Blood Moon flights
    insurance: (1 - R / (INS.belowC / 100)) / (INS.num / INS.den),             // return of the side bet alone
    /* Expected flights to fill the card when every flight is one paid bet with auto target targetC (>= 2.00x):
       +1 with probability p, -1 (floored at 0) otherwise. */
    flightsPerCard(targetC) {
      const p = survival(Math.max(targetC, STAMP.needC)); let d = 1 / p, sum = d;
      for (let k = 1; k < STAMP.size; k++) { d = 1 / p + ((1 - p) / p) * d; sum += d; }
      return sum;
    },
    /* Extra return from free flights for that plan, as a fraction of stake. Zero below 2.00x. */
    stamps(targetC) { return targetC < STAMP.needC ? 0 : this.base / this.flightsPerCard(targetC); },
    withInsurance(mainRtp) { const c = INS.num / INS.den; return (mainRtp + c * this.insurance) / (1 + c); },
  };

  return { R, CAP_C, MIN_CASH_C, BLOOD_P, BOOST_NUM, BOOST_DEN, INS, STAMP, CURVE, STAKES,
    crashFromU, makeRound, drawRound, multAt, centsAt, timeAtC, cashValue, insurancePremium, insurancePays,
    clampTargetC, autoCashC, canCashAt, newCard, settleRound, survival, theory };
});

/* ===== moonshot ===== */
/* Batty's Moonshot — crash game. The UI only presents outcomes drawn by BattyMath.moonshot (moonshot.math.js).
   Stage concept: one living sky on canvas that travels from a moonlit town up through cloud into deep space,
   a huge multiplier in the middle, two bet slots underneath. Dawn glow is driven by flight time only. */
(function () {
  'use strict';
  const ID = 'moonshot', M = BattyMath.moonshot, B = Batty, h = Batty.h;
  const DEV = location.search.indexOf('dev') > -1;
  const KEY = 'batty-moonshot-v1';
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const mix = (c1, c2, k) => [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
  const rgb = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')';
  const vr = Math.random; // cosmetic randomness only (particles, house bats). Outcomes always come from the maths file with Batty.rng.
  function prng(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* cents -> "2.35×" */
  const X = (c) => { const w = Math.floor(c / 100), f = c % 100; return (w >= 1000 ? B.fmt(w) : w) + '.' + (f < 10 ? '0' : '') + f + '×'; };
  const tier = (c) => (c < 120 ? 'dud' : c < 200 ? 'low' : c < 500 ? 'mid' : c < 1000 ? 'good' : c < 2500 ? 'great' : c < 10000 ? 'moon' : 'cosmic');

  const LANDMARKS = [
    [200, 'Cloud nine'], [500, 'Mind the plane'], [1000, 'Low orbit'], [2500, 'The Moon'], [5000, 'Past the Moon'],
    [10000, 'Deep space'], [25000, 'Comet alley'], [100000, 'Another galaxy'], [500000, 'Edge of the universe'],
  ];
  const BOT_NAMES = ['Scampi Steve', 'Big Sheila', 'Dave from Darts', 'Pickled Egg Reg', 'Karaoke Sandra', 'Two-Pints Trev', 'Lock-In Linda',
    'Meat Raffle Mo', 'Fruit Machine Phil', 'Landlord Len', 'Last Orders Les', 'Dominoes Doreen', 'Shandy Andy', 'Bar Stool Barry',
    'Quiz Night Keith', 'Jukebox Julie', 'Half-a-Mild Harold', 'Snug Bar Sue', 'Pork Scratchings Pam', 'Sticky Carpet Carl',
    'Barry Two-Darts', 'Dartboard Deb', 'Crisps Chris', 'Nan on the Gin', 'Kebab Kev', 'Beer Garden Bren'];

  /* ---------- things that outlive a visit to the game ---------- */
  const mem = { card: M.newCard(), slots: [{ stakeI: 0, auto: 200, autoOn: false, ins: false }, { stakeI: 0, auto: 500, autoOn: false, ins: false }], turbo: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      const okStake = (s) => M.STAKES.indexOf(s) > -1;
      if (raw.card && Array.isArray(raw.card.stamps) && Array.isArray(raw.card.free)) {
        mem.card.stamps = raw.card.stamps.filter(okStake).slice(0, M.STAMP.size - 1);
        mem.card.free = raw.card.free.filter(okStake).slice(0, 5);
      }
      if (Array.isArray(raw.slots)) raw.slots.slice(0, 2).forEach((s, i) => {
        if (!s) return; const d = mem.slots[i];
        if (s.stakeI >= 0 && s.stakeI < M.STAKES.length) d.stakeI = s.stakeI | 0;
        if (s.auto >= M.MIN_CASH_C) d.auto = M.clampTargetC(s.auto);
        d.autoOn = !!s.autoOn; d.ins = !!s.ins;
      });
      mem.turbo = !!raw.turbo;
    }
  } catch (e) { /* memory only */ }
  function saveMem() { try { localStorage.setItem(KEY, JSON.stringify({ card: { stamps: mem.card.stamps, free: mem.card.free }, slots: mem.slots, turbo: mem.turbo })); } catch (e) { /* memory only */ } }
  const session = { hist: [], flights: 0, longest: 0, bestC: 0, bestBB: 0, staked: 0, paid: 0 };
  const dev = DEV ? (window.__moonshotDev = { force: null, queue: [], speed: 1, log: [], game: null }) : null;

  let S = null, G = null;
  const batP = () => batP.p || (batP.p = new Path2D(B.batPath));

  /* =====================================================================================
     ART: Batty, parachutes, props
     ===================================================================================== */
  function wing(c, u, side, f, col1, col2) {
    const sx = 0.5 * u, sy = -0.15 * u, al = 0.35 + 0.75 * f, be = al - 0.75 - 0.2 * f;
    const wx = sx + 1.05 * u * Math.cos(al), wy = sy - 1.05 * u * Math.sin(al);
    const pt = (len, ang) => [wx + len * u * Math.cos(ang), wy - len * u * Math.sin(ang)];
    const T = pt(1.2, be), F1 = pt(1.05, be - 0.75), F2 = pt(0.9, be - 1.5), Hp = [0.4 * u, 0.5 * u];
    const q = (p, r) => { const mx = (p[0] + r[0]) / 2, my = (p[1] + r[1]) / 2; return [lerp(mx, wx, 0.34), lerp(my, wy, 0.34)]; };
    c.save(); c.scale(side, 1);
    const g = c.createLinearGradient(sx, sy, T[0], T[1] + u); g.addColorStop(0, col1); g.addColorStop(1, col2);
    c.fillStyle = g; c.beginPath(); c.moveTo(sx, sy); c.lineTo(wx, wy); c.lineTo(T[0], T[1]);
    let k = q(T, F1); c.quadraticCurveTo(k[0], k[1], F1[0], F1[1]);
    k = q(F1, F2); c.quadraticCurveTo(k[0], k[1], F2[0], F2[1]);
    k = q(F2, Hp); c.quadraticCurveTo(k[0], k[1], Hp[0], Hp[1]);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(190,170,255,.38)'; c.lineWidth = Math.max(1, 0.07 * u); c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(wx, wy); c.lineTo(T[0], T[1]); c.moveTo(wx, wy); c.lineTo(F1[0], F1[1]); c.moveTo(wx, wy); c.lineTo(F2[0], F2[1]); c.stroke();
    c.restore();
  }
  /* Batty: aviator cap, gold goggles, pink scarf. u = body radius in px. mood: 'perch' | 'fly' | 'fear' */
  function drawBatty(c, x, y, u, rot, flap, t, mood) {
    c.save(); c.translate(x, y); c.rotate(rot);
    /* scarf tails streaming behind (down-left) */
    for (let s = 0; s < 2; s++) {
      c.beginPath(); let px = -0.45 * u, py = 0.5 * u; c.moveTo(px, py);
      const calm = mood === 'perch' ? 0.35 : 1;
      for (let i = 1; i <= 7; i++) {
        const a = (mood === 'perch' ? 1.9 : 2.5) + s * 0.22 + Math.sin(t * (7 + s) * calm - i * 0.9 + s) * 0.34;
        px += Math.cos(a) * 0.3 * u; py += Math.sin(a) * 0.3 * u; c.lineTo(px, py);
      }
      c.strokeStyle = s ? '#d93a76' : '#ff5d92'; c.lineWidth = (0.3 - s * 0.05) * u; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
      c.strokeStyle = '#ffd76a'; c.lineWidth = 0.09 * u; c.setLineDash([0.12 * u, 0.5 * u]); c.stroke(); c.setLineDash([]);
    }
    wing(c, u, -1, flap, '#3b2590', '#1b0f4a'); wing(c, u, 1, flap, '#4a30a8', '#23135a');
    /* feet */
    c.fillStyle = '#1b0f4a';
    c.beginPath(); c.ellipse(-0.28 * u, 0.9 * u, 0.13 * u, 0.2 * u, 0.3, 0, TAU); c.ellipse(0.28 * u, 0.9 * u, 0.13 * u, 0.2 * u, -0.3, 0, TAU); c.fill();
    /* ears */
    for (const sd of [-1, 1]) {
      c.fillStyle = '#35217f'; c.beginPath(); c.moveTo(sd * 0.22 * u, -0.6 * u); c.lineTo(sd * 0.74 * u, -1.36 * u); c.lineTo(sd * 0.76 * u, -0.38 * u); c.closePath(); c.fill();
      c.fillStyle = '#ff7fa8'; c.beginPath(); c.moveTo(sd * 0.42 * u, -0.66 * u); c.lineTo(sd * 0.68 * u, -1.12 * u); c.lineTo(sd * 0.69 * u, -0.56 * u); c.closePath(); c.fill();
    }
    /* body */
    const g = c.createRadialGradient(-0.25 * u, -0.35 * u, 0.1 * u, 0, 0, 1.1 * u); g.addColorStop(0, '#8062e0'); g.addColorStop(0.6, '#4a2fa6'); g.addColorStop(1, '#2a1868');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0.06 * u, 0.8 * u, 0.88 * u, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(205,190,255,.26)'; c.beginPath(); c.ellipse(0, 0.5 * u, 0.42 * u, 0.3 * u, 0, 0, TAU); c.fill();
    /* scarf wrap */
    c.strokeStyle = '#ff5d92'; c.lineWidth = 0.26 * u; c.lineCap = 'round'; c.beginPath(); c.ellipse(0, 0.3 * u, 0.66 * u, 0.3 * u, 0, 0.25, Math.PI - 0.25); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 0.06 * u; c.beginPath(); c.ellipse(0, 0.26 * u, 0.62 * u, 0.28 * u, 0, 0.5, Math.PI - 0.5); c.stroke();
    /* leather flying cap */
    c.fillStyle = '#7a4524'; c.beginPath(); c.ellipse(0, -0.3 * u, 0.74 * u, 0.56 * u, 0, Math.PI, TAU); c.fill();
    c.strokeStyle = 'rgba(255,220,170,.25)'; c.lineWidth = 0.05 * u; c.beginPath(); c.ellipse(0, -0.3 * u, 0.6 * u, 0.44 * u, 0, Math.PI + 0.4, TAU - 0.4); c.stroke();
    /* goggle strap + goggles */
    c.strokeStyle = '#3a1f0e'; c.lineWidth = 0.2 * u; c.lineCap = 'butt'; c.beginPath(); c.moveTo(-0.78 * u, -0.2 * u); c.lineTo(0.78 * u, -0.2 * u); c.stroke();
    const look = mood === 'fear' ? [0, 0.1] : mood === 'perch' ? [Math.sin(t * 0.7) * 0.06, -0.02] : [0.07, -0.06];
    for (const sd of [-1, 1]) {
      const gx = sd * 0.35 * u, gy = -0.2 * u, r = 0.31 * u;
      const lg = c.createLinearGradient(gx, gy - r, gx, gy + r); lg.addColorStop(0, '#e6f8ff'); lg.addColorStop(1, '#63b4f0');
      c.fillStyle = lg; c.beginPath(); c.arc(gx, gy, r, 0, TAU); c.fill();
      const blink = mood !== 'fear' && (t % 3.7) < 0.12;
      c.fillStyle = '#150a36';
      if (blink) c.fillRect(gx - 0.14 * u, gy - 0.02 * u, 0.28 * u, 0.05 * u);
      else { c.beginPath(); c.arc(gx + look[0] * u, gy + look[1] * u, (mood === 'fear' ? 0.07 : 0.12) * u, 0, TAU); c.fill(); }
      c.strokeStyle = '#ffd76a'; c.lineWidth = 0.1 * u; c.beginPath(); c.arc(gx, gy, r, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 0.05 * u; c.lineCap = 'round'; c.beginPath(); c.arc(gx, gy, r * 0.66, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    }
    c.fillStyle = '#c9952a'; c.fillRect(-0.07 * u, -0.26 * u, 0.14 * u, 0.1 * u);
    /* nose, grin, fangs */
    c.fillStyle = '#150a36'; c.beginPath(); c.ellipse(0, 0.16 * u, 0.07 * u, 0.05 * u, 0, 0, TAU); c.fill();
    if (mood === 'fear') { c.beginPath(); c.ellipse(0, 0.36 * u, 0.12 * u, 0.15 * u, 0, 0, TAU); c.fill(); }
    else {
      c.strokeStyle = '#150a36'; c.lineWidth = 0.06 * u; c.beginPath(); c.arc(0, 0.2 * u, 0.24 * u, 0.25, Math.PI - 0.25); c.stroke();
      c.fillStyle = '#fff';
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * 0.16 * u, 0.4 * u); c.lineTo(sd * 0.1 * u, 0.56 * u); c.lineTo(sd * 0.04 * u, 0.43 * u); c.closePath(); c.fill(); }
    }
    c.restore();
  }
  function drawMiniBat(c, x, y, w, flap, col) {
    c.save(); c.translate(x, y); c.scale(w / 120, (w / 120) * (0.55 + 0.45 * flap)); c.translate(-60, -29); c.fillStyle = col; c.fill(batP()); c.restore();
  }
  function drawChute(c, p, font) {
    const s = p.s, sway = Math.sin(p.ph) * 0.16;
    c.save(); c.translate(p.x, p.y); c.rotate(sway); c.globalAlpha = clamp(p.life * 2, 0, 1) * (p.dim ? 0.8 : 1);
    const r = 17 * s, top = -34 * s;
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(0.6, s);
    c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * r / 2, top); c.lineTo(0, -6 * s); } c.stroke();
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? p.col2 : p.col; c.beginPath();
      c.moveTo(-r + i * r / 2, top); c.quadraticCurveTo(-r + (i + 0.5) * r / 2 * 1 + (i - 1.5) * 1.2 * s, top - r * (1.05 - Math.abs(i - 1.5) * 0.14), -r + (i + 1) * r / 2, top); c.closePath(); c.fill();
    }
    c.fillStyle = p.col; c.beginPath(); c.moveTo(-r, top); c.bezierCurveTo(-r, top - r * 1.35, r, top - r * 1.35, r, top); c.closePath(); c.globalCompositeOperation = 'destination-over'; c.fill(); c.globalCompositeOperation = 'source-over';
    drawMiniBat(c, 0, 0, 26 * s, 0.9, p.bat || '#2a1868');
    c.restore();
    if (p.label) {
      c.save(); c.globalAlpha = clamp(p.life * 2, 0, 1); c.font = '700 ' + Math.round((p.big ? 15 : 11) * (p.big ? Math.max(1, s * 0.8) : 1)) + 'px ' + font; c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = 'rgba(8,6,30,.85)'; c.strokeText(p.label, p.x, p.y + 20 * s); c.fillStyle = p.big ? p.col : '#d9d0ff'; c.fillText(p.label, p.x, p.y + 20 * s);
      c.restore();
    }
  }
  const PROPS = {
    plane(c, x, y, k, t) {
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 9) * 0.035 - 0.04); c.scale(k, k);
      c.fillStyle = '#cfd4ee'; c.beginPath(); c.moveTo(-70, 0); c.quadraticCurveTo(-74, -11, -52, -12); c.lineTo(52, -12); c.quadraticCurveTo(70, -8, 60, 4); c.lineTo(-50, 8); c.quadraticCurveTo(-66, 8, -70, 0); c.fill();
      c.fillStyle = '#8f96c4'; c.beginPath(); c.moveTo(44, -12); c.lineTo(66, -36); c.lineTo(72, -36); c.lineTo(62, -10); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-6, 0); c.lineTo(26, 26); c.lineTo(36, 26); c.lineTo(18, 0); c.closePath(); c.fill();
      c.fillStyle = '#ff5d92'; c.fillRect(-52, 2, 100, 2.4);
      c.fillStyle = '#ffd98a'; for (let i = 0; i < 9; i++) c.fillRect(-44 + i * 10, -7, 5, 5);
      c.fillStyle = '#1c2450'; c.beginPath(); c.moveTo(-66, -4); c.lineTo(-56, -10); c.lineTo(-52, -4); c.closePath(); c.fill();
      if ((t * 3 | 0) % 2) { c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(30, 26, 3, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,60,60,.3)'; c.beginPath(); c.arc(30, 26, 8, 0, TAU); c.fill(); }
      c.fillStyle = '#ffd76a'; c.font = '900 30px "Audiowide", "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText('!', -62, -24 - Math.abs(Math.sin(t * 8)) * 5);
      c.restore();
    },
    sat(c, x, y, k, t) {
      c.save(); c.translate(x, y); c.rotate(0.4 + t * 0.25); c.scale(k, k);
      c.fillStyle = '#3d5fd0'; c.fillRect(-44, -9, 28, 18); c.fillRect(16, -9, 28, 18);
      c.strokeStyle = '#9db4ff'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-44 + i * 7, -9); c.lineTo(-44 + i * 7, 9); c.moveTo(16 + i * 7, -9); c.lineTo(16 + i * 7, 9); c.stroke(); }
      c.fillStyle = '#d8dcf2'; c.fillRect(-16, -3, 32, 6); c.fillStyle = '#b9bfdc'; c.fillRect(-11, -12, 22, 24);
      c.fillStyle = '#ffd76a'; c.fillRect(-11, -12, 22, 6);
      c.strokeStyle = '#d8dcf2'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 12); c.lineTo(0, 22); c.stroke(); c.beginPath(); c.arc(0, 26, 6, Math.PI, TAU); c.stroke();
      if ((t * 2 | 0) % 2) { c.fillStyle = '#ff4f6b'; c.beginPath(); c.arc(0, -15, 2.6, 0, TAU); c.fill(); }
      c.restore();
    },
    trolley(c, x, y, k, t) { /* somebody always leaves one */
      c.save(); c.translate(x, y); c.rotate(t * 0.5); c.scale(k, k); c.strokeStyle = '#aab3d8'; c.lineWidth = 2; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-22, -16); c.lineTo(-14, -16); c.lineTo(-8, 8); c.lineTo(18, 8); c.lineTo(22, -10); c.lineTo(-12, -10); c.stroke();
      c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(-6 + i * 7, -10); c.lineTo(-5 + i * 6.5, 8); } c.moveTo(-10, -2); c.lineTo(20, -2); c.stroke();
      c.fillStyle = '#aab3d8'; c.beginPath(); c.arc(-6, 14, 3, 0, TAU); c.arc(16, 14, 3, 0, TAU); c.fill();
      c.restore();
    },
    planet(c, x, y, k) {
      c.save(); c.translate(x, y); c.rotate(-0.35); c.scale(k, k);
      c.strokeStyle = 'rgba(255,200,150,.55)'; c.lineWidth = 7; c.beginPath(); c.ellipse(0, 0, 84, 20, 0, Math.PI, TAU); c.stroke();
      const g = c.createRadialGradient(-14, -16, 4, 0, 0, 46); g.addColorStop(0, '#ffd9a8'); g.addColorStop(0.6, '#e88a5a'); g.addColorStop(1, '#7c3550');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(120,50,70,.35)'; c.lineWidth = 5; c.beginPath(); c.ellipse(0, -10, 41, 6, 0, 0, Math.PI); c.stroke(); c.beginPath(); c.ellipse(0, 14, 38, 5, 0, 0, Math.PI); c.stroke();
      c.strokeStyle = 'rgba(255,220,170,.85)'; c.lineWidth = 7; c.beginPath(); c.ellipse(0, 0, 84, 20, 0, 0, Math.PI); c.stroke();
      c.strokeStyle = 'rgba(255,240,210,.5)'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, 70, 15, 0, 0, Math.PI); c.stroke();
      c.restore();
    },
    ufo(c, x, y, k, t) {
      c.save(); c.translate(x, y + Math.sin(t * 3) * 6 * k); c.rotate(Math.sin(t * 2.2) * 0.1); c.scale(k, k);
      const bg = c.createLinearGradient(0, 8, 0, 120); bg.addColorStop(0, 'rgba(140,255,200,.45)'); bg.addColorStop(1, 'rgba(140,255,200,0)');
      c.fillStyle = bg; c.beginPath(); c.moveTo(-16, 8); c.lineTo(16, 8); c.lineTo(46, 120); c.lineTo(-46, 120); c.closePath(); c.fill();
      /* the pint it is nicking */
      const py = 86 - ((t * 22) % 50); c.fillStyle = '#f5b83a'; c.fillRect(-6, py, 12, 15); c.fillStyle = '#fff6da'; c.fillRect(-7, py - 4, 14, 5);
      const dg = c.createLinearGradient(0, -34, 0, -6); dg.addColorStop(0, '#d6fff0'); dg.addColorStop(1, '#58d6b0');
      c.fillStyle = dg; c.beginPath(); c.ellipse(0, -8, 24, 24, 0, Math.PI, TAU); c.fill();
      c.fillStyle = '#1d3b4a'; c.beginPath(); c.ellipse(0, -14, 8, 10, 0, 0, TAU); c.fill();
      c.fillStyle = '#9ff'; c.beginPath(); c.arc(-3, -16, 2, 0, TAU); c.arc(3, -16, 2, 0, TAU); c.fill();
      const sg = c.createLinearGradient(0, -10, 0, 12); sg.addColorStop(0, '#c7cdea'); sg.addColorStop(1, '#5a6090');
      c.fillStyle = sg; c.beginPath(); c.ellipse(0, 0, 62, 13, 0, 0, TAU); c.fill();
      for (let i = 0; i < 5; i++) { c.fillStyle = ((t * 6 | 0) + i) % 3 ? '#ffd76a' : '#ff5d92'; c.beginPath(); c.arc(-40 + i * 20, 2 + Math.abs(i - 2) * -1.5, 3.4, 0, TAU); c.fill(); }
      c.restore();
    },
    galaxy(c, x, y, k, t) {
      c.save(); c.translate(x, y); c.rotate(t * 0.05); c.scale(k, k * 0.55);
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 90; i++) {
        const a = i * 0.13 + arm * Math.PI, r = 4 + i * 1.5, j = Math.sin(i * 12.9898 + arm) * 5;
        c.fillStyle = 'rgba(' + (200 + (i % 3) * 20) + ',' + (170 + (i % 5) * 12) + ',255,' + (0.5 - i * 0.004) + ')';
        c.beginPath(); c.arc(Math.cos(a) * r + j, Math.sin(a) * r + j * 0.6, 2.6 - i * 0.018, 0, TAU); c.fill();
      }
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 34); g.addColorStop(0, 'rgba(255,240,210,.95)'); g.addColorStop(1, 'rgba(255,200,160,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fill();
      c.restore();
    },
    comet(c, x, y, k) {
      c.save(); c.translate(x, y); c.rotate(-0.5); c.scale(k, k);
      const g = c.createLinearGradient(0, 0, 150, 0); g.addColorStop(0, 'rgba(190,240,255,.9)'); g.addColorStop(1, 'rgba(190,240,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, -7); c.lineTo(150, -1); c.lineTo(150, 1); c.lineTo(0, 7); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill();
      c.restore();
    },
    sign(c, x, y, k) {
      c.save(); c.translate(x, y); c.rotate(-0.06); c.scale(k, k);
      c.fillStyle = '#8a8fb0'; c.fillRect(-3, 0, 6, 70);
      c.fillStyle = '#f7f0ff'; c.strokeStyle = '#ff5d92'; c.lineWidth = 4; c.beginPath(); c.rect(-78, -44, 156, 48); c.fill(); c.stroke();
      c.fillStyle = '#1a1040'; c.textAlign = 'center'; c.font = '700 13px "Chakra Petch", sans-serif'; c.fillText('UNIVERSE ENDS', 0, -25); c.font = '600 10px "Chakra Petch", sans-serif'; c.fillText('please fly carefully', 0, -10);
      c.restore();
    },
  };

  /* =====================================================================================
     SCENE (canvas)
     ===================================================================================== */
  function makeScene(cv, box) {
    const c = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, k = 1, U = 400, town = null, townH = 0, launch = { x: 60, y: 300 }, perches = [], rest = { x: 0, y: 0 };
    const FONT = '"Chakra Petch", "Figtree", "Segoe UI", sans-serif';
    const sr = prng(4242);
    const stars = []; for (let i = 0; i < 230; i++) stars.push({ x: sr(), y: sr(), r: sr() < 0.08 ? 1.7 : sr() < 0.3 ? 1.1 : 0.7, ph: sr() * TAU, d: 0.02 + sr() * 0.06, gold: sr() < 0.14 });
    const dust = []; for (let i = 0; i < 34; i++) dust.push({ x: sr(), y: sr(), l: 6 + sr() * 16, d: 1.6 + sr() * 2.2 });
    const clouds = []; for (let i = 0; i < 14; i++) clouds.push({ a: 0.5 + sr() * 0.95, x: sr(), s: 0.6 + sr() * 0.9, d: i % 4 === 0 ? 1.35 : 0.55 + sr() * 0.55, sp: i % 3, v: (sr() - 0.5) * 0.012 });
    clouds.sort((p, q) => p.d - q.d);
    const nebula = []; for (let i = 0; i < 5; i++) nebula.push({ x: sr(), y: sr(), r: 0.3 + sr() * 0.35, col: i % 2 ? [120, 60, 200] : [40, 150, 190] });
    const props = [
      { kind: 'plane', a: Math.log(5), off: 0.16, d: 1, s: 0.9, mv: -0.2, x0: 1.18 },
      { kind: 'sat', a: Math.log(10) - 0.08, off: -0.02, d: 0.9, s: 0.8, x0: 0.2 },
      { kind: 'sat', a: Math.log(10) + 0.3, off: 0.2, d: 1.1, s: 0.55, x0: 0.52 },
      { kind: 'trolley', a: Math.log(16), off: 0.1, d: 1, s: 1, x0: 0.36 },
      { kind: 'planet', a: Math.log(50) + 0.2, off: -0.05, d: 0.6, s: 0.9, x0: 0.2 },
      { kind: 'ufo', a: Math.log(100) + 0.12, off: 0.05, d: 0.8, s: 0.95, mv: 0.07, x0: 0.02 },
      { kind: 'comet', a: Math.log(250), off: 0, d: 0.7, s: 1, mv: -0.12, x0: 0.9 },
      { kind: 'comet', a: Math.log(400), off: 0.1, d: 0.9, s: 0.7, mv: -0.16, x0: 1.0 },
      { kind: 'galaxy', a: Math.log(1000) + 0.25, off: -0.1, d: 0.45, s: 1.2, x0: 0.26 },
      { kind: 'planet', a: Math.log(2500), off: 0.1, d: 0.6, s: 0.6, x0: 0.5 },
      { kind: 'sign', a: Math.log(5000) + 0.1, off: 0.12, d: 1, s: 1, x0: 0.3 },
    ];
    let cloudSprites = [];
    const V = { cam: 0, camPrev: 0, sun: 0, blood: 0, flash: 0, shake: 0, fade: 1, poofed: false, tAbs: 0, lastA: 0, capGlow: 0 };
    const P = { chutes: [], puffs: [], ash: [], junk: [], sparks: [], texts: [] };

    function buildCloud(seed) {
      const r = prng(seed), s = document.createElement('canvas'); s.width = 300; s.height = 130; const x = s.getContext('2d'), n = 8;
      x.fillStyle = '#b9aef5';
      for (let i = 0; i < n; i++) { const rad = 15 + r() * 10 + 24 * Math.sin(Math.PI * (i + 0.5) / n); x.beginPath(); x.arc(42 + i * (216 / (n - 1)) + (r() - 0.5) * 14, 94 - rad * 0.72, rad, 0, TAU); x.fill(); }
      x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(0, 24, 0, 108); g.addColorStop(0, '#f3efff'); g.addColorStop(0.45, '#aa9ce9'); g.addColorStop(1, '#43358f'); x.fillStyle = g; x.fillRect(0, 0, 300, 130);
      x.globalCompositeOperation = 'destination-out';
      const f = x.createLinearGradient(0, 80, 0, 104); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = f; x.fillRect(0, 80, 300, 50);
      return s;
    }
    function house(x, c0, bx, base, w, hh, col, lit, r, perch) {
      x.fillStyle = col; x.fillRect(bx, base - hh, w, hh + 2);
      const pitched = r() < 0.72, rh = pitched ? w * (0.3 + r() * 0.16) : 3 * k;
      x.beginPath(); x.moveTo(bx - 2 * k, base - hh); x.lineTo(bx + w / 2, base - hh - rh); x.lineTo(bx + w + 2 * k, base - hh); x.closePath(); x.fill();
      if (r() < 0.7) x.fillRect(bx + w * (0.15 + r() * 0.5), base - hh - rh * 0.5 - 9 * k, 6 * k, 14 * k);
      const cols = Math.max(1, Math.floor(w / (14 * k))), rows = Math.max(1, Math.floor(hh / (20 * k))), gw = w / cols, gh = Math.min(20 * k, hh / rows);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const on = r() < lit; x.fillStyle = on ? c0 : 'rgba(255,255,255,.05)';
        if (on) { x.shadowColor = c0; x.shadowBlur = 7 * k; }
        x.fillRect(bx + i * gw + gw / 2 - 2.6 * k, base - hh + 6 * k + j * gh, 5.2 * k, 7 * k); x.shadowBlur = 0;
      }
      if (perch) perches.push({ x: bx + w / 2, y: base - hh - rh });
    }
    function buildTown() {
      townH = Math.ceil(250 * k); perches = [];
      town = document.createElement('canvas'); town.width = Math.ceil(W * dpr); town.height = Math.ceil(townH * dpr);
      const x = town.getContext('2d'); x.scale(dpr, dpr); const r = prng(77), base = townH - 6 * k;
      /* hills */
      x.fillStyle = '#1d1552'; x.beginPath(); x.moveTo(0, townH);
      for (let i = 0; i <= W + 8; i += 8) x.lineTo(i, base - (64 * k + Math.sin(i * 0.006 / k + 1) * 26 * k + Math.sin(i * 0.017 / k) * 9 * k));
      x.lineTo(W, townH); x.fill();
      /* back row */
      let bx = -14 * k; while (bx < W) { const w = (30 + r() * 30) * k; house(x, '#f2b866', bx, base, w, (50 + r() * 46) * k, '#261c60', 0.3, r, false); bx += w - 1; }
      /* trees */
      x.fillStyle = '#150e3c'; for (let i = 0; i < 5; i++) { const tx = (0.3 + i * 0.16 + r() * 0.06) * W, tr = (13 + r() * 9) * k; x.beginPath(); x.arc(tx, base - 30 * k - tr, tr, 0, TAU); x.arc(tx - tr * 0.6, base - 26 * k - tr * 0.6, tr * 0.7, 0, TAU); x.fill(); x.fillRect(tx - 2 * k, base - 34 * k, 4 * k, 34 * k); }
      /* front row */
      const cxT = Math.max(46 * k, Math.min(W * 0.15, 150 * k)), pubX = W * (W < 560 ? 0.56 : 0.6), pubW = 104 * k;
      bx = -10 * k; while (bx < W) { const w = (36 + r() * 26) * k, hh = (30 + r() * 34) * k; const clear = bx > cxT + 120 * k && (bx + w < pubX - 6 * k || bx > pubX + pubW + 6 * k); house(x, '#ffcf70', bx, base, w, hh, '#17103c', 0.5, r, clear); bx += w - 1; }
      /* church: nave + tower with belfry */
      const col = '#120b34';
      x.fillStyle = col; x.fillRect(cxT + 14 * k, base - 70 * k, 96 * k, 72 * k);
      x.beginPath(); x.moveTo(cxT + 10 * k, base - 70 * k); x.lineTo(cxT + 62 * k, base - 104 * k); x.lineTo(cxT + 114 * k, base - 70 * k); x.closePath(); x.fill();
      for (let i = 0; i < 3; i++) { const wx = cxT + (34 + i * 26) * k; x.fillStyle = i === 1 ? '#ff9fb8' : '#ffcf70'; x.shadowColor = '#ffcf70'; x.shadowBlur = 8 * k; x.beginPath(); x.moveTo(wx - 5 * k, base - 22 * k); x.lineTo(wx - 5 * k, base - 46 * k); x.quadraticCurveTo(wx, base - 58 * k, wx + 5 * k, base - 46 * k); x.lineTo(wx + 5 * k, base - 22 * k); x.closePath(); x.fill(); x.shadowBlur = 0; }
      x.fillStyle = col; x.fillRect(cxT - 18 * k, base - 150 * k, 36 * k, 152 * k);
      x.beginPath(); x.moveTo(cxT - 23 * k, base - 150 * k); x.lineTo(cxT, base - 186 * k); x.lineTo(cxT + 23 * k, base - 150 * k); x.closePath(); x.fill();
      for (const sd of [-1, 1]) x.fillRect(cxT + sd * 18 * k - 2.5 * k, base - 160 * k, 5 * k, 12 * k);
      /* belfry opening with bell */
      x.fillStyle = '#2c1f6e'; x.beginPath(); x.moveTo(cxT - 9 * k, base - 112 * k); x.lineTo(cxT - 9 * k, base - 132 * k); x.quadraticCurveTo(cxT, base - 146 * k, cxT + 9 * k, base - 132 * k); x.lineTo(cxT + 9 * k, base - 112 * k); x.closePath(); x.fill();
      x.fillStyle = '#d9a742'; x.beginPath(); x.moveTo(cxT - 5 * k, base - 116 * k); x.quadraticCurveTo(cxT - 4 * k, base - 130 * k, cxT, base - 131 * k); x.quadraticCurveTo(cxT + 4 * k, base - 130 * k, cxT + 5 * k, base - 116 * k); x.closePath(); x.fill();
      /* clock */
      x.fillStyle = '#ffe9a8'; x.shadowColor = '#ffd76a'; x.shadowBlur = 10 * k; x.beginPath(); x.arc(cxT, base - 88 * k, 9 * k, 0, TAU); x.fill(); x.shadowBlur = 0;
      x.strokeStyle = '#3a2408'; x.lineWidth = 1.6 * k; x.lineCap = 'round'; x.beginPath(); x.moveTo(cxT, base - 88 * k); x.lineTo(cxT - 5 * k, base - 91 * k); x.moveTo(cxT, base - 88 * k); x.lineTo(cxT, base - 95 * k); x.stroke();
      x.fillStyle = 'rgba(255,207,112,.9)'; x.fillRect(cxT - 3 * k, base - 52 * k, 6 * k, 16 * k); x.fillRect(cxT - 5 * k, base - 20 * k, 10 * k, 20 * k);
      launch = { x: cxT, y: H - townH + base - 186 * k };
      /* pub */
      x.fillStyle = '#1c1244'; x.fillRect(pubX, base - 56 * k, pubW, 58 * k);
      x.fillStyle = '#100a30'; x.beginPath(); x.moveTo(pubX - 5 * k, base - 56 * k); x.lineTo(pubX + 16 * k, base - 84 * k); x.lineTo(pubX + pubW - 16 * k, base - 84 * k); x.lineTo(pubX + pubW + 5 * k, base - 56 * k); x.closePath(); x.fill();
      x.fillRect(pubX + 18 * k, base - 98 * k, 9 * k, 18 * k); x.fillRect(pubX + pubW - 30 * k, base - 98 * k, 9 * k, 18 * k);
      x.fillStyle = '#ffd98a'; x.shadowColor = '#ffb84a'; x.shadowBlur = 14 * k;
      for (let i = 0; i < 3; i++) x.fillRect(pubX + (10 + i * 22) * k, base - 44 * k, 14 * k, 16 * k);
      x.fillRect(pubX + pubW - 26 * k, base - 34 * k, 14 * k, 34 * k); x.shadowBlur = 0;
      x.strokeStyle = '#1c1244'; x.lineWidth = 1.4 * k; for (let i = 0; i < 3; i++) { const wx = pubX + (17 + i * 22) * k; x.beginPath(); x.moveTo(wx, base - 44 * k); x.lineTo(wx, base - 28 * k); x.moveTo(wx - 7 * k, base - 36 * k); x.lineTo(wx + 7 * k, base - 36 * k); x.stroke(); }
      x.fillStyle = '#ff5d92'; x.shadowColor = '#ff5d92'; x.shadowBlur = 10 * k; x.fillRect(pubX + 8 * k, base - 53 * k, 62 * k, 4 * k); x.shadowBlur = 0;
      /* hanging sign */
      x.strokeStyle = '#100a30'; x.lineWidth = 2 * k; x.beginPath(); x.moveTo(pubX + pubW, base - 62 * k); x.lineTo(pubX + pubW + 22 * k, base - 62 * k); x.stroke();
      x.fillStyle = '#ffd76a'; x.shadowColor = '#ffd76a'; x.shadowBlur = 12 * k; x.fillRect(pubX + pubW + 6 * k, base - 60 * k, 16 * k, 20 * k); x.shadowBlur = 0;
      x.save(); x.translate(pubX + pubW + 14 * k, base - 50 * k); x.scale(12 * k / 120, 12 * k / 120); x.translate(-60, -29); x.fillStyle = '#3a1d00'; x.fill(batP()); x.restore();
      /* lamp posts */
      for (const lx of [0.33, 0.47, 0.9]) { const px = lx * W; x.fillStyle = '#0d082a'; x.fillRect(px - 1.2 * k, base - 34 * k, 2.4 * k, 34 * k); const g = x.createRadialGradient(px, base - 36 * k, 0, px, base - 36 * k, 26 * k); g.addColorStop(0, 'rgba(255,215,140,.95)'); g.addColorStop(0.2, 'rgba(255,200,110,.35)'); g.addColorStop(1, 'rgba(255,200,110,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, base - 36 * k, 26 * k, 0, TAU); x.fill(); }
      /* ground + mist */
      x.fillStyle = '#0b0726'; x.fillRect(0, base, W, townH - base);
      const m = x.createLinearGradient(0, base - 60 * k, 0, base); m.addColorStop(0, 'rgba(140,110,220,0)'); m.addColorStop(1, 'rgba(140,110,220,.2)'); x.fillStyle = m; x.fillRect(0, base - 60 * k, W, 60 * k);
      perches.sort((p, q) => p.x - q.x);
    }
    function resize() {
      const r = box.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
      W = Math.round(r.width); H = Math.round(r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      k = clamp(Math.min(H / 560, W / 520 + 0.25), 0.62, 1.3); U = H * 0.92;
      rest = { x: W * (W < 560 ? 0.76 : 0.72), y: H * (W < 560 ? 0.2 : 0.26) };
      if (!cloudSprites.length) cloudSprites = [buildCloud(11), buildCloud(29), buildCloud(53)];
      buildTown();
    }

    /* where Batty is on screen for flight time ft (seconds) */
    function battyPos(g) {
      if (g.phase !== 'fly' && !(g.phase === 'end' && g.round && !g.round.instant)) return { x: launch.x, y: launch.y + V.cam * U - 15 * k };
      const kx = clamp(g.ft / 2.6, 0, 1);
      return { x: lerp(launch.x, rest.x, 1 - (1 - kx) * (1 - kx)), y: lerp(launch.y - 15 * k, rest.y, smooth(kx)) };
    }

    function drawMoon(a, blood, now) {
      const base = Math.min(W, H), ka = smooth(a / 3.25);
      let r = base * 0.085 * Math.exp(0.52 * Math.min(a, 3.4)), mx = lerp(W * 0.84, W * 0.6, ka), my = lerp(H * 0.16, H * 0.5, ka);
      if (W < 560) { mx = lerp(W * 0.2, W * 0.5, ka); my = lerp(H * 0.2, H * 0.52, ka); }
      if (a > 3.25) my += (a - 3.25) * U * 0.95;
      if (my - r > H + 40) return;
      const gold = [[255, 249, 220], [255, 224, 138], [236, 170, 58]], red = [[255, 214, 196], [255, 86, 70], [150, 14, 40]];
      const c0 = mix(gold[0], red[0], blood), c1 = mix(gold[1], red[1], blood), c2 = mix(gold[2], red[2], blood);
      const halo = c.createRadialGradient(mx, my, r * 0.9, mx, my, r * 2.7);
      halo.addColorStop(0, rgb(c1, 0.3 + 0.12 * blood)); halo.addColorStop(0.4, rgb(c1, 0.09)); halo.addColorStop(1, rgb(c1, 0));
      c.fillStyle = halo; c.beginPath(); c.arc(mx, my, r * 2.7, 0, TAU); c.fill();
      const g = c.createRadialGradient(mx - r * 0.35, my - r * 0.35, r * 0.05, mx, my, r);
      g.addColorStop(0, rgb(c0)); g.addColorStop(0.55, rgb(c1)); g.addColorStop(1, rgb(c2));
      c.fillStyle = g; c.beginPath(); c.arc(mx, my, r, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.clip();
      const cr = [[0.3, -0.34, 0.2], [-0.32, 0.22, 0.27], [0.24, 0.42, 0.13], [-0.5, -0.36, 0.11], [0.58, 0.06, 0.1], [-0.05, -0.62, 0.08], [0.02, 0.05, 0.07], [-0.62, 0.52, 0.12], [0.5, -0.66, 0.09]];
      for (const q of cr) {
        c.fillStyle = rgb(c2, 0.34); c.beginPath(); c.arc(mx + q[0] * r, my + q[1] * r, q[2] * r, 0, TAU); c.fill();
        c.strokeStyle = rgb(c0, 0.3); c.lineWidth = Math.max(1, r * 0.012); c.beginPath(); c.arc(mx + q[0] * r, my + q[1] * r, q[2] * r, 0.4, 2.2); c.stroke();
      }
      const sh = c.createRadialGradient(mx - r * 0.4, my - r * 0.4, r * 0.5, mx, my, r * 1.05); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,10,40,.32)'); c.fillStyle = sh; c.fillRect(mx - r, my - r, r * 2, r * 2);
      c.restore();
      if (r > 70) { /* somebody has been here before */
        const fx = mx - r * 0.2, fy = my - r * 0.955, s = r / 170;
        c.strokeStyle = '#efeaff'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx - 4 * s, fy - 34 * s); c.stroke();
        c.fillStyle = '#ff5d92'; c.beginPath(); c.moveTo(fx - 4 * s, fy - 34 * s); c.lineTo(fx + 20 * s, fy - 28 * s + Math.sin(now * 0.004) * 2 * s); c.lineTo(fx - 3 * s, fy - 20 * s); c.closePath(); c.fill();
      }
    }

    function draw(dt, now, g) {
      if (!W) return;
      const t = now / 1000; V.tAbs = t;
      const R = g.round, flying = g.phase === 'fly', ended = g.phase === 'end';
      const m = flying || ended ? M.multAt(g.ft) : 1, a = Math.log(Math.max(1, m));
      /* camera + mood */
      const camT = flying || (ended && R && !R.instant) ? a : 0;
      V.camPrev = V.cam; V.cam = (g.phase === 'bet' || g.phase === 'lift') ? 0 : camT;
      const scroll = dt > 0 ? (V.cam - V.camPrev) * U / dt : 0;
      const wantBlood = R && R.blood && g.phase !== 'bet' ? 1 : 0; V.blood += (wantBlood - V.blood) * Math.min(1, dt * 4);
      const wantSun = ended && R && !R.capped ? 1 : 0; V.sun += (wantSun - V.sun) * Math.min(1, dt * (wantSun ? 5 : 3));
      V.flash = Math.max(0, V.flash - dt * 2.2); V.shake = Math.max(0, V.shake - dt * 2.4); V.fade = Math.max(0, V.fade - dt * 2.2);
      const cam = V.cam;

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.save();
      if (V.shake > 0 && !reduce) c.translate((vr() - 0.5) * 16 * V.shake, (vr() - 0.5) * 16 * V.shake);

      /* 1. sky */
      const SK = [[0, [16, 13, 54], [48, 32, 104], [104, 54, 122]], [1.2, [10, 10, 42], [24, 22, 80], [44, 34, 104]], [2.6, [5, 6, 28], [10, 11, 48], [18, 17, 66]], [4.6, [2, 2, 14], [5, 5, 26], [11, 8, 38]]];
      let i = 0; while (i < SK.length - 2 && cam > SK[i + 1][0]) i++;
      const kk = clamp((cam - SK[i][0]) / (SK[i + 1][0] - SK[i][0]), 0, 1);
      let top = mix(SK[i][1], SK[i + 1][1], kk), mid = mix(SK[i][2], SK[i + 1][2], kk), bot = mix(SK[i][3], SK[i + 1][3], kk);
      if (V.blood > 0.01) { top = mix(top, [52, 4, 22], V.blood * 0.72); mid = mix(mid, [104, 10, 34], V.blood * 0.66); bot = mix(bot, [168, 28, 44], V.blood * 0.6); }
      if (V.sun > 0.01) { top = mix(top, [92, 78, 176], V.sun); mid = mix(mid, [255, 138, 150], V.sun); bot = mix(bot, [255, 204, 120], V.sun); }
      const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, rgb(top)); sky.addColorStop(0.55, rgb(mid)); sky.addColorStop(1, rgb(bot));
      c.fillStyle = sky; c.fillRect(-20, -20, W + 40, H + 40);

      /* 2. nebula (deep space only) */
      const deep = smooth((cam - 3.4) / 1.4);
      if (deep > 0.01) for (const n of nebula) {
        const ny = ((n.y * H * 1.6 + cam * U * 0.05) % (H * 1.6)) - H * 0.3, nr = n.r * Math.max(W, H);
        const ng = c.createRadialGradient(n.x * W, ny, 0, n.x * W, ny, nr); ng.addColorStop(0, rgb(n.col, 0.2 * deep * (1 - V.sun))); ng.addColorStop(1, rgb(n.col, 0));
        c.fillStyle = ng; c.fillRect(n.x * W - nr, ny - nr, nr * 2, nr * 2);
      }

      /* 3. stars */
      const sa = (0.5 + 0.5 * smooth(cam / 2.2)) * (1 - V.sun * 0.95);
      if (sa > 0.02) for (const s of stars) {
        const sy = (s.y * H + cam * U * s.d) % H, tw = 0.6 + 0.4 * Math.sin(t * 1.6 + s.ph);
        const fadeLow = cam < 1 ? clamp(1.25 - sy / (H * 0.8), 0, 1) : 1;
        c.globalAlpha = sa * tw * fadeLow; c.fillStyle = s.gold ? '#ffd76a' : V.blood > 0.5 ? '#ffd0d0' : '#ffffff';
        if (s.r > 1.5) { c.beginPath(); c.arc(s.x * W, sy, s.r, 0, TAU); c.fill(); c.globalAlpha *= 0.35; c.fillRect(s.x * W - 5, sy - 0.5, 10, 1); c.fillRect(s.x * W - 0.5, sy - 5, 1, 10); }
        else c.fillRect(s.x * W, sy, s.r * 1.6, s.r * 1.6);
      }
      c.globalAlpha = 1;

      /* 4. far props, 5. moon */
      const propY = (p) => rest.y + p.off * H + (cam - p.a) * U * p.d;
      for (const p of props) if (p.d < 0.75) { const py = propY(p); if (py > -160 && py < H + 160) { if (p.seen == null) p.seen = t; PROPS[p.kind](c, (p.x0 + (p.mv || 0) * (t - p.seen)) * W, py, p.s * k, t); } }
      drawMoon(cam, V.blood, now);

      /* 6. sunrise */
      if (V.sun > 0.01) {
        const sx = W * 0.5, sr0 = Math.max(W * 0.34, 150), sy = H + sr0 * 0.55 - V.sun * sr0 * 0.8;
        c.save(); c.translate(sx, sy); c.rotate(t * 0.12);
        for (let q = 0; q < 14; q++) { c.rotate(TAU / 14); c.fillStyle = 'rgba(255,240,190,' + 0.13 * V.sun + ')'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-sr0 * 0.24, -Math.max(W, H) * 1.3); c.lineTo(sr0 * 0.24, -Math.max(W, H) * 1.3); c.closePath(); c.fill(); }
        c.restore();
        const sg = c.createRadialGradient(sx, sy, sr0 * 0.2, sx, sy, sr0 * 2.1); sg.addColorStop(0, 'rgba(255,255,235,' + V.sun + ')'); sg.addColorStop(0.28, 'rgba(255,226,130,' + 0.95 * V.sun + ')'); sg.addColorStop(0.5, 'rgba(255,150,80,' + 0.5 * V.sun + ')'); sg.addColorStop(1, 'rgba(255,120,90,0)');
        c.fillStyle = sg; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,252,228,' + V.sun + ')'; c.beginPath(); c.arc(sx, sy, sr0, 0, TAU); c.fill();
      }

      /* 7. clouds (back) */
      const cloudAt = (cl, front) => {
        const cy = rest.y + 0.2 * H + (cam - cl.a) * U * cl.d; if (cy < -140 || cy > H + 120) return;
        const sp = cloudSprites[cl.sp], w = 300 * cl.s * k * (front ? 1.7 : 1.15), hh = w * 130 / 300;
        const cx = (((cl.x + cl.v * t) % 1.3 + 1.3) % 1.3 - 0.15) * W;
        c.globalAlpha = (front ? 0.42 : 0.3 + cl.d * 0.36) * (1 - V.blood * 0.25); c.drawImage(sp, cx - w / 2, cy - hh / 2, w, hh);
      };
      for (const cl of clouds) if (cl.d <= 1) cloudAt(cl, false);
      c.globalAlpha = 1;

      /* 8. town */
      const ty = H - townH + cam * U;
      if (ty < H + 4) {
        c.drawImage(town, 0, ty, W, townH);
        if (V.sun > 0.05) { c.fillStyle = 'rgba(255,170,110,' + 0.25 * V.sun + ')'; c.fillRect(0, ty + townH * 0.3, W, townH); }
      }

      /* 9. mid props */
      for (const p of props) if (p.d >= 0.75) { const py = propY(p); if (py > -160 && py < H + 160) { if (p.seen == null) p.seen = t; PROPS[p.kind](c, (p.x0 + (p.mv || 0) * (t - p.seen)) * W, py, p.s * k, t); } }

      /* 10. dawn glow: tension theatre, a function of flight time only */
      const gl = flying ? 1 - Math.exp(-g.ft / 11) : g.phase === 'bet' || g.phase === 'lift' ? 0 : 1;
      if (!ended) {
        const pulse = 1 + (reduce ? 0 : 0.1 * Math.sin(t * (2.2 + gl * 5))), gh = (0.16 + 0.5 * gl) * H * pulse, ga = (flying ? 0.26 + 0.55 * gl : 0.2);
        c.globalCompositeOperation = 'screen';
        const dg = c.createLinearGradient(0, H, 0, H - gh);
        dg.addColorStop(0, 'rgba(255,' + (150 + 50 * gl | 0) + ',70,' + ga + ')'); dg.addColorStop(0.35, 'rgba(255,96,110,' + ga * 0.62 + ')'); dg.addColorStop(1, 'rgba(255,80,160,0)');
        c.fillStyle = dg; c.fillRect(0, H - gh, W, gh);
        if (flying) { const core = c.createLinearGradient(0, H, 0, H - gh * 0.3); core.addColorStop(0, 'rgba(255,226,140,' + (0.25 + 0.6 * gl) + ')'); core.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = core; c.fillRect(0, H - gh * 0.3, W, gh * 0.3);
          const rg = c.createRadialGradient(W * 0.5, H + 30, 10, W * 0.5, H + 30, W * (0.3 + 0.5 * gl)); rg.addColorStop(0, 'rgba(255,230,150,' + (0.2 + 0.6 * gl) + ')'); rg.addColorStop(1, 'rgba(255,160,90,0)'); c.fillStyle = rg; c.fillRect(0, H * 0.4, W, H * 0.6); }
        c.globalCompositeOperation = 'source-over';
      }

      /* speed dust */
      if (flying && !reduce) {
        c.strokeStyle = 'rgba(220,210,255,.28)'; c.lineWidth = 1;
        c.beginPath(); for (const d of dust) { const dy = (d.y * H + t * 60 * d.d + cam * U * 0.4 * d.d) % H; c.moveTo(d.x * W, dy); c.lineTo(d.x * W - d.l * 0.3, dy + d.l * (1 + g.ft * 0.03)); } c.stroke();
      }

      /* 11. trail */
      const bp = battyPos(g), bob = flying && !reduce ? Math.sin(t * 5.2) * 3 * k : 0;
      const bx = bp.x, by = bp.y + bob;
      const tcol = mix([255, 215, 106], [255, 86, 86], V.blood);
      if ((flying || (ended && R && !R.instant)) && g.ft > 0.05) {
        const ox = launch.x, oy = Math.min(launch.y + cam * U, H + 30), mm = M.multAt(g.ft) - 1, N = 44;
        const pts = []; for (let q = 0; q <= N; q++) { const f = q / N; pts.push([lerp(ox, bx, f), oy - (oy - by) * (mm > 0 ? (M.multAt(g.ft * f) - 1) / mm : f)]); }
        const alphaT = ended ? Math.max(0, 1 - V.sun * 1.2) * 0.5 : 1;
        if (alphaT > 0.01) {
          c.beginPath(); c.moveTo(pts[0][0], H + 40); for (const p of pts) c.lineTo(p[0], p[1]); c.lineTo(bx, H + 40); c.closePath();
          const fg = c.createLinearGradient(0, by, 0, H); fg.addColorStop(0, rgb(tcol, 0.2 * alphaT)); fg.addColorStop(1, rgb(tcol, 0)); c.fillStyle = fg; c.fill();
          const lg = c.createLinearGradient(ox, 0, bx, 0); lg.addColorStop(0, rgb(tcol, 0)); lg.addColorStop(0.35, rgb(tcol, 0.55 * alphaT)); lg.addColorStop(1, rgb(mix(tcol, [255, 255, 255], 0.5), alphaT));
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]);
          c.strokeStyle = lg; c.lineWidth = 5 * k; c.lineCap = 'round'; c.lineJoin = 'round'; c.shadowColor = rgb(tcol, 0.9); c.shadowBlur = 16; c.stroke(); c.shadowBlur = 0;
        }
        if (flying && !reduce && P.sparks.length < 60 && vr() < 0.5) P.sparks.push({ x: bx - 8 * k, y: by + 12 * k, vx: -30 - vr() * 40, vy: 20 + vr() * 50, life: 0.9, r: 1 + vr() * 2 });
      }

      /* 12. house bats */
      const bots = g.bots || [];
      for (let q = 0; q < bots.length; q++) {
        const b = bots[q]; if (b.gone) continue;
        const pc = perches.length ? perches[Math.min(perches.length - 1, Math.floor((q + 0.5) / bots.length * perches.length))] : { x: W * 0.5, y: townH * 0.5 };
        const px = pc.x, py = H - townH + pc.y + cam * U - 5 * k;
        let fxp, fyp, fl;
        if (flying) {
          const kq = smooth(clamp((g.ft - 0.25 - q * 0.12) / 2.8, 0, 1)), col = q % 4, row = (q / 4) | 0;
          const tx = bx - (40 + col * 24 + row * 14) * k - (W < 560 ? 0 : 20 * k), tyy = by + (34 + ((q * 37) % 5) * 15 + row * 16) * k + Math.sin(t * 4 + q * 1.7) * 5 * k;
          fxp = lerp(px, tx, kq); fyp = lerp(H - townH + pc.y - 5 * k, tyy, kq); fl = Math.abs(Math.sin(t * 13 + q));
          b.sx = fxp; b.sy = fyp;
        } else if (g.phase === 'bet' || g.phase === 'lift') { fxp = px; fyp = py; fl = g.phase === 'lift' ? Math.abs(Math.sin(t * 16 + q)) : 0.25 + 0.06 * Math.sin(t * 2 + q); b.sx = fxp; b.sy = fyp; }
        else continue;
        drawMiniBat(c, fxp, fyp, (g.phase === 'bet' ? 20 : 24) * k, fl, V.blood > 0.5 ? '#3a0a1c' : '#241760');
      }

      /* parachutes */
      for (const p of P.chutes) { p.ph += dt * 2.4; p.x += p.vx * dt; p.y += (p.vy + Math.max(0, scroll) * 0.9) * dt; p.life -= dt * (p.y > H + 60 ? 5 : 0.16); drawChute(c, p, FONT); }
      P.chutes = P.chutes.filter((p) => p.life > 0);

      /* 13. Batty */
      if (!V.poofed) {
        const u = (W < 560 ? 18 : 20) * k;
        if (flying) {
          const fear = g.ft > 9 && Math.sin(t * 0.9) > 0.55;
          drawBatty(c, bx, by, u, -0.3 + Math.sin(t * 2.3) * 0.05, Math.sin(t * (13 + Math.min(8, g.ft * 0.4))), t, fear ? 'fear' : 'fly');
        } else if (g.phase === 'lift') {
          drawBatty(c, bx + (reduce ? 0 : (vr() - 0.5) * 2.5), by + 3 * k, u, -0.08, Math.sin(t * 24), t, 'fly');
          if (!reduce && vr() < 0.5) P.puffs.push({ x: bx + (vr() - 0.5) * 24 * k, y: by + 16 * k, r: 3 * k, vr: 16 * k, vx: (vr() - 0.5) * 50, vy: 10, life: 0.5, col: [200, 190, 255] });
        } else if (g.phase === 'bet') {
          drawBatty(c, bx, by, u, Math.sin(t * 1.3) * 0.04, -0.72 + Math.sin(t * 2) * 0.06, t, 'perch');
        } else if (ended && R && R.capped) {
          drawBatty(c, bx, by, u, -0.3, Math.sin(t * 16), t, 'fly');
        }
      }

      /* 14. front clouds */
      for (const cl of clouds) if (cl.d > 1) cloudAt(cl, true);
      c.globalAlpha = 1;

      /* 15. particles */
      for (const p of P.sparks) { p.life -= dt * 1.4; p.x += p.vx * dt; p.y += (p.vy + Math.max(0, scroll) * 0.6) * dt; c.globalAlpha = Math.max(0, p.life); c.fillStyle = rgb(mix(tcol, [255, 255, 255], 0.4)); c.fillRect(p.x, p.y, p.r, p.r); }
      P.sparks = P.sparks.filter((p) => p.life > 0);
      for (const p of P.puffs) { p.life -= dt * (p.slow ? 0.75 : 1.6); p.r += p.vr * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; c.globalAlpha = Math.max(0, Math.min(1, p.life * 1.3)) * 0.85; c.fillStyle = rgb(p.col); c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
      P.puffs = P.puffs.filter((p) => p.life > 0);
      for (const p of P.ash) { p.life -= dt * 0.45; p.vy += 60 * dt; p.x += (p.vx + Math.sin(t * 5 + p.ph) * 24) * dt; p.y += p.vy * dt; p.rot += dt * 4; c.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); c.fillStyle = p.col; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8); c.restore(); }
      P.ash = P.ash.filter((p) => p.life > 0 && p.y < H + 20);
      for (const p of P.junk) { /* goggles and scarf tumbling down */
        p.life -= dt * 0.4; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt; c.globalAlpha = Math.max(0, Math.min(1, p.life * 3));
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); const u = p.u;
        if (p.kind === 'gog') { c.strokeStyle = '#3a1f0e'; c.lineWidth = 0.18 * u; c.beginPath(); c.moveTo(-0.7 * u, 0); c.lineTo(0.7 * u, 0); c.stroke(); for (const sd of [-1, 1]) { c.fillStyle = '#9fd4f8'; c.beginPath(); c.arc(sd * 0.34 * u, 0, 0.3 * u, 0, TAU); c.fill(); c.strokeStyle = '#ffd76a'; c.lineWidth = 0.1 * u; c.stroke(); } }
        else { c.strokeStyle = '#ff5d92'; c.lineWidth = 0.28 * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(-0.8 * u, 0); c.quadraticCurveTo(-0.2 * u, Math.sin(t * 9) * 0.5 * u, 0.2 * u, 0); c.quadraticCurveTo(0.5 * u, -Math.sin(t * 9) * 0.5 * u, 0.9 * u, 0); c.stroke(); }
        c.restore();
      }
      P.junk = P.junk.filter((p) => p.life > 0 && p.y < H + 60);
      for (const p of P.texts) {
        p.life -= dt / p.dur; p.y += p.vy * dt; const al = Math.min(1, p.life * 3), sc = 1 + (1 - Math.min(1, (1 - p.life) * 8)) * 0.8;
        c.save(); c.globalAlpha = Math.max(0, al); c.translate(p.x, p.y); c.rotate(p.rot || 0); c.scale(sc, sc);
        c.font = (p.w || 800) + ' ' + p.size + 'px ' + (p.disp ? '"Audiowide", "Arial Black", sans-serif' : FONT); c.textAlign = 'center'; c.lineJoin = 'round';
        c.lineWidth = Math.max(3, p.size * 0.22); c.strokeStyle = p.stroke || 'rgba(10,8,34,.9)'; c.strokeText(p.text, 0, 0); c.fillStyle = p.col; c.fillText(p.text, 0, 0); c.restore();
      }
      P.texts = P.texts.filter((p) => p.life > 0);
      c.globalAlpha = 1;

      /* 16. flash + fade */
      if (V.flash > 0 && !reduce) { c.fillStyle = 'rgba(255,244,214,' + V.flash * 0.85 + ')'; c.fillRect(-20, -20, W + 40, H + 40); }
      if (V.fade > 0) { c.fillStyle = 'rgba(11,9,38,' + V.fade + ')'; c.fillRect(-20, -20, W + 40, H + 40); }
      /* vignette */
      const vg = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.45, Math.max(W, H) * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,20,.5)'); c.fillStyle = vg; c.fillRect(-20, -20, W + 40, H + 40);
      c.restore();
      V.last = { x: bx, y: by };
    }

    return {
      V, P, resize, draw,
      get w() { return W; }, get k() { return k; },
      batty() { return V.last || { x: launch.x, y: launch.y }; },
      reset() { V.poofed = false; V.sun = 0; V.fade = 1; V.cam = V.camPrev = 0; V.flash = 0; P.chutes = []; P.sparks = []; for (const p of props) p.seen = null; },
      chute(x, y, o) { if (P.chutes.length > 14) P.chutes.shift(); P.chutes.push(Object.assign({ x, y, vx: -16 - vr() * 16, vy: 30 + vr() * 12, ph: vr() * 6, life: 1, s: k }, o)); },
      text(x, y, text, o) { P.texts.push(Object.assign({ x, y, text, life: 1, dur: 1.2, vy: -22, size: 16, col: '#fff' }, o)); },
      poof(x, y, big) {
        const n = reduce ? 5 : big ? 16 : 6;
        for (let q = 0; q < n; q++) { const an = vr() * TAU, sp = (big ? 70 : 30) * (0.4 + vr()) * k, gy = 70 + vr() * 90; P.puffs.push({ x, y, r: (big ? 9 : 4) * k * (0.6 + vr()), vr: (big ? 30 : 14) * k, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 12, life: 0.8 + vr() * 0.5, slow: big, col: [gy, gy - 6, gy + 4] }); }
        if (!big || reduce) return;
        for (let q = 0; q < 26; q++) P.ash.push({ x: x + (vr() - 0.5) * 30 * k, y: y + (vr() - 0.5) * 24 * k, vx: (vr() - 0.5) * 90, vy: -40 - vr() * 90, r: 1.5 + vr() * 2.5, rot: vr() * 6, ph: vr() * 6, life: 1.5 + vr(), col: vr() < 0.3 ? '#ff8a4a' : '#3b3550' });
        const u = (W < 560 ? 18 : 20) * k;
        P.junk.push({ kind: 'gog', x, y: y - 4 * k, vx: 70, vy: -260, rot: 0, vrot: 9, u, life: 1.6 }, { kind: 'scarf', x: x - 6 * k, y: y + 6 * k, vx: -60, vy: -150, rot: 0.4, vrot: -3, u, life: 1.8 });
        P.texts.push({ x: x - 6 * k, y: y - 36 * k, text: 'POOF!', life: 1, dur: 1.5, vy: -14, size: Math.round(30 * k), col: '#fff3d0', stroke: '#ff5d92', disp: true, rot: -0.14 });
      },
    };
  }

  /* =====================================================================================
     SOUND
     ===================================================================================== */
  const A = B.audio;
  function makeEngine() {
    let n = null;
    return {
      start() {
        if (n) return; const c = A.ensure(); if (!c || !A.master) return;
        try {
          const out = c.createGain(); out.gain.value = 0.0001; out.connect(A.master);
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 4; lp.connect(out);
          const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'triangle'; o1.frequency.value = 58; o2.frequency.value = 87.4;
          const g2 = c.createGain(); g2.gain.value = 0.7; o1.connect(lp); o2.connect(g2); g2.connect(lp);
          const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
          const ns = c.createBufferSource(); ns.buffer = buf; ns.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8; const ng = c.createGain(); ng.gain.value = 0.5; ns.connect(bp); bp.connect(ng); ng.connect(out);
          o1.start(); o2.start(); ns.start(); out.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.4);
          n = { c, out, lp, o1, o2, ns, bp };
        } catch (e) { n = null; }
      },
      set(m) {
        if (!n) return; const t = n.c.currentTime, f = Math.min(620, 58 * Math.pow(m, 0.42));
        n.o1.frequency.setTargetAtTime(f, t, 0.08); n.o2.frequency.setTargetAtTime(f * 1.507, t, 0.08);
        n.lp.frequency.setTargetAtTime(Math.min(3400, 480 + 260 * Math.log(m + 1) * 2), t, 0.1); n.bp.frequency.setTargetAtTime(Math.min(4200, 500 + 420 * Math.log(m)), t, 0.1);
      },
      stop(fall) {
        if (!n) return; const q = n; n = null;
        try { const t = q.c.currentTime; q.out.gain.cancelScheduledValues(t); q.out.gain.setTargetAtTime(0.0001, t, fall ? 0.09 : 0.03); if (fall) { q.o1.frequency.setTargetAtTime(30, t, 0.12); q.o2.frequency.setTargetAtTime(40, t, 0.12); } q.o1.stop(t + 0.5); q.o2.stop(t + 0.5); q.ns.stop(t + 0.5); setTimeout(() => { try { q.out.disconnect(); } catch (e) { /* gone */ } }, 700); } catch (e) { /* audio is optional */ }
      },
    };
  }
  const SND = {
    arm() { B.sfx('chip'); },
    launch() { A.noise({ d: 0.9, v: 0.16, lp: 200, f2: 5200 }); A.tone({ f: 90, f2: 420, d: 0.8, type: 'sawtooth', v: 0.07 }); A.seq([262, 330, 392, [523, 2]], { step: 0.07, type: 'square', v: 0.06, t: 0.05 }); },
    blood() { A.tone({ f: 73.4, d: 1.6, type: 'sawtooth', v: 0.16 }); A.tone({ f: 77.8, d: 1.6, type: 'sawtooth', v: 0.1 }); A.seq([[293.7, 2], [277.2, 2], [233.1, 2], [220, 5]], { step: 0.16, type: 'square', v: 0.07, t: 0.1 }); A.noise({ d: 1.4, v: 0.18, lp: 700, f2: 90 }); A.tone({ f: 1244, d: 1.2, type: 'sine', v: 0.06, t: 0.75 }); },
    beat(v) { A.tone({ f: 64, f2: 40, d: 0.13, type: 'sine', v: 0.3 * v }); A.tone({ f: 56, f2: 36, d: 0.12, type: 'sine', v: 0.2 * v, t: 0.15 }); },
    mark(i) { const f = 660 * Math.pow(1.122, i * 2); A.tone({ f, d: 0.35, type: 'sine', v: 0.14 }); A.tone({ f: f * 1.5, d: 0.5, type: 'sine', v: 0.1, t: 0.09 }); A.noise({ d: 0.3, v: 0.04, hp: 6000 }); },
    cash(big) { A.tone({ f: 1320, d: 0.07, type: 'square', v: 0.08 }); A.tone({ f: 1980, d: 0.28, type: 'square', v: 0.08, t: 0.06 }); A.tone({ f: 2640, d: 0.3, type: 'triangle', v: 0.07, t: 0.12 }); A.noise({ d: 0.12, v: 0.12, hp: 3500, t: 0.02 }); A.tone({ f: 300, f2: 760, d: 0.1, type: 'sine', v: 0.24, t: 0.2 }); A.noise({ d: 0.25, v: 0.1, lp: 900, f2: 200, t: 0.21 }); if (big) B.sfx('win'); },
    botCash() { A.tone({ f: 1500 + vr() * 500, d: 0.05, type: 'triangle', v: 0.035 }); },
    bust() { A.noise({ d: 0.55, v: 0.24, hp: 4200, f2: 700 }); A.noise({ d: 0.3, v: 0.3, lp: 700, f2: 120, t: 0.05 }); A.tone({ f: 190, f2: 46, d: 0.3, type: 'sine', v: 0.32, t: 0.04 }); A.tone({ f: 980, f2: 150, d: 0.62, type: 'sine', v: 0.11, t: 0.22 }); A.tone({ f: 120, f2: 80, d: 0.16, type: 'square', v: 0.07, t: 0.86 }); },
    cover() { A.seq([523, 659, 784, [1047, 3]], { step: 0.09, type: 'sine', v: 0.14 }); },
    stamp() { A.tone({ f: 150, f2: 70, d: 0.1, type: 'sine', v: 0.3 }); A.noise({ d: 0.05, v: 0.1, lp: 1500 }); A.tone({ f: 1760, d: 0.3, type: 'sine', v: 0.09, t: 0.05 }); },
    burn() { A.noise({ d: 0.35, v: 0.12, hp: 3000, f2: 900 }); A.tone({ f: 300, f2: 140, d: 0.25, type: 'triangle', v: 0.08 }); },
    cap() { B.sfx('bonus'); A.seq([523, 659, 784, 1047, 1319, [1568, 4]], { step: 0.1, type: 'triangle', v: 0.14, t: 0.3 }); },
  };

  /* =====================================================================================
     POSTER + RULES
     ===================================================================================== */
  const poster = (function () {
    let stars = ''; const r = prng(9);
    for (let i = 0; i < 46; i++) stars += '<circle cx="' + (r() * 320).toFixed(1) + '" cy="' + (r() * 250).toFixed(1) + '" r="' + (r() < 0.15 ? 1.5 : 0.8) + '" fill="' + (r() < 0.2 ? '#ffd76a' : '#fff') + '" opacity="' + (0.4 + r() * 0.6).toFixed(2) + '"/>';
    return '<svg viewBox="0 0 320 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
      '<defs>' +
      '<linearGradient id="moonshot-p-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a2e"/><stop offset=".5" stop-color="#2a1c6c"/><stop offset=".8" stop-color="#7a3a86"/><stop offset=".93" stop-color="#ff6f6a"/><stop offset="1" stop-color="#ffc06a"/></linearGradient>' +
      '<radialGradient id="moonshot-p-moon" cx=".36" cy=".34" r=".7"><stop offset="0" stop-color="#fffadc"/><stop offset=".55" stop-color="#ffe08a"/><stop offset="1" stop-color="#eaa63a"/></radialGradient>' +
      '<radialGradient id="moonshot-p-halo" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#ffd76a" stop-opacity=".4"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="moonshot-p-trail" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff5d92" stop-opacity="0"/><stop offset=".5" stop-color="#ffb04a"/><stop offset="1" stop-color="#fff3bd"/></linearGradient>' +
      '<linearGradient id="moonshot-p-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffd76a"/><stop offset="1" stop-color="#f08a1e"/></linearGradient>' +
      '<filter id="moonshot-p-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>' +
      '<rect width="320" height="400" fill="url(#moonshot-p-sky)"/>' + stars +
      '<circle cx="232" cy="96" r="150" fill="url(#moonshot-p-halo)"/>' +
      '<circle cx="232" cy="96" r="70" fill="url(#moonshot-p-moon)"/>' +
      '<g fill="#d9952e" opacity=".42"><circle cx="254" cy="72" r="13"/><circle cx="208" cy="112" r="18"/><circle cx="250" cy="126" r="8"/><circle cx="198" cy="66" r="7"/><circle cx="274" cy="102" r="6"/></g>' +
      '<path d="M-10 356 C 70 350 132 318 160 248 C 172 216 180 196 190 176" fill="none" stroke="url(#moonshot-p-trail)" stroke-width="7" stroke-linecap="round" filter="url(#moonshot-p-glow)"/>' +
      '<path d="M-10 356 C 70 350 132 318 160 248 C 172 216 180 196 190 176 L190 400 L-10 400Z" fill="#ffb04a" opacity=".1"/>' +
      /* Batty */
      '<g transform="translate(196 150) rotate(-20)">' +
      '<path d="M-10 14 q-22 6 -34 24 q14 -4 20 2 q-8 8 -8 20" fill="none" stroke="#ff5d92" stroke-width="8" stroke-linecap="round"/>' +
      '<g transform="translate(-78 -40) scale(1.3)"><path d="' + B.batPath + '" fill="#2a1868" stroke="#8a6cf0" stroke-width="1.2"/></g>' +
      '<ellipse cx="0" cy="6" rx="21" ry="23" fill="#4a2fa6"/><path d="M-20 0 a20 15 0 0 1 40 0z" fill="#7a4524"/>' +
      '<path d="M-17 14 q17 12 34 0" fill="none" stroke="#ff5d92" stroke-width="7" stroke-linecap="round"/>' +
      '<rect x="-21" y="-4" width="42" height="5" fill="#3a1f0e"/>' +
      '<circle cx="-9" cy="-1" r="8" fill="#bfe6ff" stroke="#ffd76a" stroke-width="3"/><circle cx="9" cy="-1" r="8" fill="#bfe6ff" stroke="#ffd76a" stroke-width="3"/>' +
      '<circle cx="-7" cy="-2" r="3" fill="#150a36"/><circle cx="11" cy="-2" r="3" fill="#150a36"/>' +
      '<path d="M-5 10 l2 5 l2 -4z M5 10 l-2 5 l-2 -4z" fill="#fff"/>' +
      '</g>' +
      /* town */
      '<path d="M0 400V352l14-12 14 12v-22h10l8-26 8 26h10v30l16-14 16 14v-10h18v-16l12-8 12 8v20l20-16 20 16v-24h8v-10h8v10h8v26l18-14 18 14v-18h22v14l16-12 16 12v38z" fill="#0d0828"/>' +
      '<g fill="#ffd27a"><rect x="22" y="362" width="5" height="7"/><rect x="50" y="340" width="4" height="8"/><rect x="92" y="368" width="5" height="7"/><rect x="132" y="350" width="5" height="7"/><rect x="176" y="372" width="5" height="7"/><rect x="214" y="352" width="5" height="7"/><rect x="262" y="372" width="5" height="7"/><rect x="296" y="366" width="5" height="7"/></g>' +
      /* lettering */
      '<text x="160" y="288" text-anchor="middle" font-family="Audiowide, \'Chakra Petch\', \'Arial Black\', sans-serif" font-size="22" fill="#f7f0ff" letter-spacing="5" textLength="150" lengthAdjust="spacingAndGlyphs" stroke="#0b0a2e" stroke-width="5" paint-order="stroke">BATTY’S</text>' +
      '<text x="160" y="326" text-anchor="middle" font-family="Audiowide, \'Chakra Petch\', \'Arial Black\', sans-serif" font-size="40" font-weight="700" fill="url(#moonshot-p-gold)" textLength="288" lengthAdjust="spacingAndGlyphs" stroke="#0b0a2e" stroke-width="7" paint-order="stroke" stroke-linejoin="round">MOONSHOT</text>' +
      '<g transform="translate(26 26)"><rect x="-8" y="-13" width="92" height="26" rx="13" fill="#0b0a2e" opacity=".75" stroke="#ff5d92" stroke-width="1.5"/><text x="38" y="5.5" text-anchor="middle" font-family="\'Chakra Petch\', sans-serif" font-weight="700" font-size="14" fill="#ffd76a" textLength="74" lengthAdjust="spacingAndGlyphs">UP TO 10,000×</text></g>' +
      '</svg>';
  })();

  function rules() {
    const T = M.theory, p = (x, d) => (100 * x).toFixed(d == null ? 2 : d) + '%';
    const boost = M.BOOST_NUM / M.BOOST_DEN, insP = M.INS.num, insX = X(M.INS.belowC);
    return '<h3>The idea</h3>' +
      '<p>Batty launches from the belfry at dusk and the multiplier climbs from 1.00×. Somewhere up there the sun comes up. <b>Cash out before dawn</b> and you are paid your stake × the multiplier on the readout. Still aboard at sunrise and your stake goes up in smoke with him.</p>' +
      '<h3>How to play</h3><ul>' +
      '<li>There are two bet slots, <b>A</b> and <b>B</b>. Use one, both or neither. Pick a stake and press <b>Bet</b> during the countdown (or mid-flight to queue for the next one).' + (B.online ? ' Tap again before lift-off to cancel and get your stake back.' : ' <b>Launch now</b> skips the wait.') + '</li>' +
      '<li>Press <b>Cash out</b> (or Space: A first, then B) at any point from 1.01× while Batty is flying. The win is banked at that instant; the flight carries on so you can see how far it would have gone.</li>' +
      '<li><b>Auto</b> cashes a slot out for you the moment the readout reaches your target (1.01× to 10,000×).</li>' +
      '<li>The flight tops out at <b>10,000×</b>. Anyone still aboard is cashed out there. That is the maximum win: 10,000× stake (' + B.fmt(10000 * boost) + '× on a Blood Moon).</li>' +
      '<li>Every dawn is drawn before lift-off, after bets are locked. Nothing anyone aboard does changes it. The dawn glow at the bottom of the sky is just theatre.</li></ul>' +
      '<h3>When does dawn break?</h3>' +
      '<p>The chance that a flight reaches a given multiplier <i>x</i> is ' + M.R + ' ÷ <i>x</i>. That makes every cash-out point worth the same on average, so there is no clever target, only nerve.</p>' +
      '<table><tr><th>Flight reaches</th><th>Chance</th></tr>' +
      [[101, '1.01× (gets off the pad)'], [150, '1.50×'], [200, '2.00×'], [500, '5.00×'], [1000, '10×'], [2500, '25× (the Moon)'], [10000, '100×'], [100000, '1,000×'], [M.CAP_C, '10,000× (the ceiling)']].map((r) => '<tr><td>' + r[1] + '</td><td>' + (M.survival(r[0]) >= 0.01 ? p(M.survival(r[0]), 1) : '1 in ' + B.fmt(1 / M.survival(r[0]))) + '</td></tr>').join('') +
      '</table><p>About ' + p(T.instantBust, 1) + ' of flights are dawn on the launch pad (1.00×): nobody gets paid on those except Eclipse Cover.</p>' +
      '<h3>Blood Moon</h3>' +
      '<p>One flight in ' + Math.round(1 / M.BLOOD_P) + ' is a Blood Moon flight. It is revealed at lift-off, once bets are locked, and <b>every cash-out on it is paid ×' + boost + '</b> (cash out at 2.00× and you are paid 3.00× your stake). You cannot choose to bet only on Blood Moons; ordinary flights are tuned so the blend comes out at the return below.</p>' +
      '<h3>Eclipse Cover (optional, per slot)</h3>' +
      '<p>Costs an extra ' + insP + '% of that slot’s stake. If dawn breaks below ' + insX + ' the cover pays your stake back (one stake, never boosted), whether or not you had already bailed. Return of the cover on its own: ' + p(T.insurance) + '.</p>' +
      '<h3>Moon Stamps</h3><ul>' +
      '<li>A flight where one of your paid bets cashes out at <b>' + X(M.STAMP.needC) + ' or higher</b> earns a stamp.</li>' +
      '<li>A flight where one of your paid bets is caught by dawn <b>burns</b> one stamp. Both in the same flight cancel out. Sitting out or cashing below ' + X(M.STAMP.needC) + ' leaves the card alone.</li>' +
      '<li>' + M.STAMP.size + ' stamps = a <b>free flight</b> on slot A worth the lowest stake stamped on the card. Free flights pay like a normal bet, cannot take Eclipse Cover and do not touch the card.</li></ul>' +
      '<h3>Autopilot and Quick</h3>' +
      '<p>Autopilot places your chosen slots every flight using each slot’s stake and auto cash-out, and stops after the number of flights you pick, when your balance drops below your limit, or when you press Stop. Quick shortens the gaps and fast-forwards a flight once you have no bets left aboard.</p>' +
      (B.online ? '<h3>Shared flights</h3><p>Everyone in the casino rides the same flight: a new one every few seconds, with an 8-second betting window. The players aboard are listed on the flight deck and you can watch them bail out. The dawn for each flight is drawn by the server when the flight is created and is only revealed when it breaks, so nobody can know it in advance.</p>'
        : '<h3>House bats</h3><p>The bats flying alongside (Scampi Steve and friends) are <b>bots, not real players</b>. They are there for company and have no effect on your flight.</p>') +
      '<h3>Leaving mid-flight</h3><p>If you leave the game with a bet still aboard, it is cashed out at that instant (at 1.01× if Batty has not cleared the pad yet, where the flight allows it).</p>' +
      '<h3>Return to player</h3>' +
      '<table><tr><th>How you play</th><th>Return</th></tr>' +
      '<tr><td>Any cash-out point, by hand or auto</td><td>' + p(T.base) + '</td></tr>' +
      '<tr><td>Always cashing at exactly ' + X(M.STAMP.needC) + ' (best case for Moon Stamps)</td><td>' + p(T.base + T.stamps(M.STAMP.needC)) + '</td></tr>' +
      '<tr><td>Any cash-out point with Eclipse Cover</td><td>' + p(T.withInsurance(T.base)) + '</td></tr></table>' +
      '<p class="rtp">' + RTP_LINE + '</p>';
  }
  const RTP_LINE = 'Tested return: 95.6% to 96.4% whatever your strategy, over 19 simulated strategies (up to 400,000,000 flights each). Any single cash-out target returns 95.66% (91.1% / x chance to reach x, Blood Moon 1 flight in 10 pays ×1.5). Eclipse Insurance on its own returns 96.3%.';

  /* =====================================================================================
     GAME
     ===================================================================================== */
  const ICON = {
    eclipse: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12.4" cy="8.6" r="5.2" fill="currentColor"/></svg>',
    bolt: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.5 1 4 11.5h4.6L7.5 19 16 8.2h-4.9z" fill="currentColor"/></svg>',
    loop: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 0 1 10.2-4.2M16 10a6 6 0 0 1-10.2 4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14.6 2.4v4h-4M5.4 17.6v-4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    moon: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor"/><circle cx="7" cy="7.4" r="2" fill="rgba(0,0,0,.18)"/><circle cx="12.6" cy="12" r="2.6" fill="rgba(0,0,0,.18)"/></svg>',
  };

  function mount(root) {
    S = B.scope();
    const g = G = { phase: 'bet', left: 6, total: 6, ft: 0, cents: 100, round: null, slots: [], bots: [], last: performance.now(), hold: false, dead: false,
      auto: { on: false, left: 0, stopBelow: 0, use: [true, false] }, nextBeat: 0, markI: 0, lastWhole: 1, resultFor: null,
      flight: null, flightId: 0, off: null, bestRtt: 1e9, offAge: 0, lastNow: 0, polling: false, players: [] };
    /* Online, everyone shares one flight on the server's clock. Offline (practice) each player flies alone. */
    const shared = B.online;
    if (dev) dev.game = g;
    const engine = makeEngine();
    const sp = () => (dev && dev.speed > 0 ? dev.speed : 1);
    const quiet = () => sp() > 3;

    /* ---------- DOM ---------- */
    root.innerHTML =
      '<div class="ms-main">' +
        '<div class="ms-stage">' +
          '<canvas class="ms-cv" aria-hidden="true"></canvas>' +
          '<div class="ms-rail" aria-label="Recent dawns"></div>' +
          '<div class="ms-cap" aria-live="polite"></div>' +
          '<div class="ms-hero" data-phase="bet">' +
            '<div class="ms-kick"></div><div class="ms-mult" aria-live="off">1.00×</div><div class="ms-bar"><i></i></div><div class="ms-sub"></div>' +
            '<button type="button" class="ms-launch">Launch now</button>' +
          '</div>' +
          '<div class="ms-blood" aria-live="polite"><span>Blood Moon</span><b>every cash-out paid ×' + (M.BOOST_NUM / M.BOOST_DEN) + '</b></div>' +
          '<div class="ms-free" aria-live="polite"></div>' +
          '<div class="ms-result" aria-live="polite"></div>' +
          '<button type="button" class="ms-ticker" aria-label="House bats, history and stats"><span class="ms-tk-bat">' + B.batSvg() + '</span><span class="ms-tk-t"></span><i>›</i></button>' +
        '</div>' +
        '<div class="ms-deck">' +
          '<div class="ms-slots"></div>' +
          '<div class="ms-util">' +
            '<div class="ms-card" title="Moon Stamps"><div class="ms-card-h"><b>Moon Stamps</b><span></span></div><div class="ms-dots"></div></div>' +
            '<div class="ms-utilbtns"><button type="button" class="ms-autobtn">' + ICON.loop + '<span>Autopilot</span></button>' +
            '<button type="button" class="ms-quick" aria-pressed="false">' + ICON.bolt + '<span>Quick</span></button></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<aside class="ms-side">' +
        '<header class="ms-side-h"><b>Flight deck</b><button type="button" class="ms-x" aria-label="Close">×</button></header>' +
        (B.online ? '<section class="ms-bots"><h4>Aboard this flight <small>real players</small></h4><ul></ul></section>' : '<section class="ms-bots"><h4>House bats <small>bots, not real players</small></h4><ul></ul></section>') +
        '<section class="ms-histbox"><h4>Last 20 dawns</h4><div class="ms-hgrid"></div></section>' +
        '<section class="ms-stats"><h4>Your session</h4><dl></dl></section>' +
      '</aside>' +
      '<div class="ms-sheet" hidden><div class="ms-sheet-in" role="dialog" aria-label="Autopilot">' +
        '<h3>Autopilot</h3><p>Flies your slots every flight using each slot’s stake, auto cash-out and cover.</p>' +
        '<div class="ms-row"><span>Slots</span><div class="ms-chips ms-auto-slots"><button type="button" data-s="0">A</button><button type="button" data-s="1">B</button></div></div>' +
        '<div class="ms-row"><span>Flights</span><div class="ms-chips ms-auto-n"><button type="button" data-n="10">10</button><button type="button" data-n="25">25</button><button type="button" data-n="50">50</button><button type="button" data-n="100">100</button><button type="button" data-n="0">∞</button></div></div>' +
        '<div class="ms-row"><label for="moonshot-stop">Stop if balance drops below</label><input id="moonshot-stop" type="text" inputmode="numeric" maxlength="9" value="0"></div>' +
        '<div class="ms-sheet-btns"><button type="button" class="ms-cancel">Cancel</button><button type="button" class="ms-start">Start autopilot</button></div>' +
      '</div></div>';
    const $ = (s) => root.querySelector(s);
    const el = { stage: $('.ms-stage'), cv: $('.ms-cv'), rail: $('.ms-rail'), cap: $('.ms-cap'), hero: $('.ms-hero'), kick: $('.ms-kick'), mult: $('.ms-mult'), bar: $('.ms-bar i'), sub: $('.ms-sub'),
      launch: $('.ms-launch'), blood: $('.ms-blood'), free: $('.ms-free'), result: $('.ms-result'), ticker: $('.ms-ticker'), tk: $('.ms-tk-t'), slots: $('.ms-slots'), card: $('.ms-card'), cardN: $('.ms-card-h span'), dots: $('.ms-dots'),
      autobtn: $('.ms-autobtn'), quick: $('.ms-quick'), side: $('.ms-side'), botsUl: $('.ms-bots ul'), hgrid: $('.ms-hgrid'), stats: $('.ms-stats dl'), sheet: $('.ms-sheet'), stop: $('#moonshot-stop') };
    const scene = makeScene(el.cv, el.stage);
    g.scene = scene;

    /* ---------- bet slots ---------- */
    function buildSlot(i) {
      const cfg = mem.slots[i], key = i ? 'B' : 'A';
      const s = { i, key, cfg, armed: false, bet: null, state: '' };
      const minus = h('button', { type: 'button', 'aria-label': 'Lower stake ' + key }, '−'), plus = h('button', { type: 'button', 'aria-label': 'Raise stake ' + key }, '+');
      const out = h('output', null);
      const autoT = h('button', { type: 'button', class: 'ms-sw', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Auto cash-out ' + key }, h('i'));
      const autoIn = h('input', { type: 'text', inputmode: 'decimal', maxlength: '8', 'aria-label': 'Auto cash-out multiplier ' + key, value: (cfg.auto / 100).toFixed(2) });
      const ins = h('button', { type: 'button', class: 'ms-ins', 'aria-pressed': 'false', title: 'Eclipse Cover: +' + M.INS.num + '% of stake, pays your stake back if dawn breaks below ' + X(M.INS.belowC), html: ICON.eclipse + '<span>Cover</span><small></small>' });
      const go = h('button', { type: 'button', class: 'ms-go', id: 'moonshot-go-' + key }, h('b'), h('small'));
      s.el = h('section', { class: 'ms-slot ms-' + key.toLowerCase(), 'data-state': 'idle' },
        h('div', { class: 'ms-ctl' },
          h('div', { class: 'ms-r1' }, h('span', { class: 'ms-tag' }, key), h('div', { class: 'ms-stake' }, minus, out, plus)),
          h('div', { class: 'ms-r2' }, h('div', { class: 'ms-auto' }, autoT, h('span', null, 'Auto'), autoIn, h('em', null, '×')), ins)),
        go);
      Object.assign(s, { minus, plus, out, autoT, autoIn, ins, go });
      const stakeMove = (d) => { cfg.stakeI = clamp(cfg.stakeI + d, 0, M.STAKES.length - 1); saveMem(); B.sfx('click'); paintSlot(s); };
      minus.addEventListener('click', () => stakeMove(-1)); plus.addEventListener('click', () => stakeMove(1));
      autoT.addEventListener('click', () => { cfg.autoOn = !cfg.autoOn; saveMem(); B.sfx('click'); paintSlot(s); });
      const commitAuto = () => { const v = parseFloat(String(autoIn.value).replace(',', '.')); cfg.auto = M.clampTargetC(isFinite(v) ? v * 100 : cfg.auto); autoIn.value = (cfg.auto / 100).toFixed(2); saveMem(); };
      autoIn.addEventListener('change', commitAuto); autoIn.addEventListener('blur', commitAuto);
      autoIn.addEventListener('focus', () => { autoIn.select(); if (!cfg.autoOn) { cfg.autoOn = true; saveMem(); paintSlot(s); } });
      autoIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') autoIn.blur(); });
      ins.addEventListener('click', () => { cfg.ins = !cfg.ins; saveMem(); B.sfx('click'); paintSlot(s); });
      go.addEventListener('click', () => pressGo(s));
      el.slots.append(s.el);
      return s;
    }
    const stakeOf = (s) => M.STAKES[s.cfg.stakeI];
    const freeFor = (s) => (s.i === 0 && mem.card.free.length ? mem.card.free[0] : 0);
    function paintSlot(s) {
      const b = s.bet, R = g.round, free = !b && freeFor(s);
      let st;
      if (b) st = shared && g.phase === 'bet' ? 'armed' : b.cashC ? 'banked' : g.phase === 'fly' ? 'live' : g.phase === 'lift' ? 'locked' : 'bust';
      else st = s.armed ? 'armed' : 'idle';
      s.state = st; s.el.dataset.state = st; s.el.classList.toggle('free', !!(free || (b && b.free)));
      const stake = b ? b.stake : free || stakeOf(s), prem = !free && s.cfg.ins ? M.insurancePremium(stakeOf(s)) : 0;
      const lockCfg = !!b && g.phase !== 'end';
      s.out.innerHTML = B.fmt(stake) + '<small>' + (free || (b && b.free) ? 'Free flight' : 'Stake · BB') + '</small>';
      s.minus.disabled = lockCfg || !!free || s.cfg.stakeI === 0; s.plus.disabled = lockCfg || !!free || s.cfg.stakeI === M.STAKES.length - 1;
      s.autoT.setAttribute('aria-checked', s.cfg.autoOn ? 'true' : 'false'); s.autoT.disabled = lockCfg; s.autoIn.disabled = lockCfg;
      s.el.classList.toggle('auto-on', s.cfg.autoOn);
      const insOn = b ? b.insured : s.cfg.ins && !free;
      s.ins.setAttribute('aria-pressed', insOn ? 'true' : 'false'); s.ins.disabled = lockCfg || !!free;
      s.ins.lastChild.textContent = '+' + B.fmt(M.insurancePremium(b ? b.stake : stakeOf(s)));
      const main = s.go.firstChild, small = s.go.lastChild;
      s.go.disabled = st === 'locked' || st === 'banked' || st === 'bust';
      if (st === 'idle') { main.textContent = free ? 'Free flight' : 'Bet'; small.textContent = (free ? B.fmt(free) + ' BB on the house' : B.fmt(stake + prem) + ' BB' + (prem ? ' with cover' : '')) + (g.phase === 'bet' ? '' : ' · next flight'); }
      else if (st === 'armed') { main.textContent = s.placing ? 'Boarding' : g.phase === 'bet' ? 'On board' : 'Queued'; small.textContent = s.placing ? 'one moment' : 'tap to cancel'; }
      else if (st === 'locked') { main.textContent = 'Hold tight'; small.textContent = B.fmt(stake) + ' BB aboard'; }
      else if (st === 'live') { main.textContent = 'Cash out'; small.textContent = B.fmt(M.cashValue(b.stake, Math.max(g.cents, M.MIN_CASH_C), R.blood)) + ' BB'; s.go.disabled = g.cents < M.MIN_CASH_C; }
      else if (st === 'banked') { main.textContent = 'Banked ' + B.fmt(b.paid); small.textContent = 'out at ' + X(b.cashC) + (R && R.blood ? ' ×' + (M.BOOST_NUM / M.BOOST_DEN) : ''); }
      else { main.textContent = 'Toasted'; small.textContent = b.free ? 'free flight gone' : '−' + B.fmt(b.stake) + ' BB'; }
    }
    function pressGo(s) {
      if (shared) {
        if (s.placing) return;
        if (g.phase === 'bet' && g.flightId) { if (s.bet) unbetShared(s); else { s.armed = true; placeShared(s); } return; }
        if (s.bet) { if (s.state === 'live') manualCash(s); return; }
        s.armed = !s.armed; if (s.armed) SND.arm(); else B.sfx('click'); paintSlot(s); paintHero(); return;
      }
      if (s.bet) { if (s.state === 'live') manualCash(s); return; }
      if (!s.armed) {
        const need = freeFor(s) ? 0 : stakeOf(s) + (s.cfg.ins ? M.insurancePremium(stakeOf(s)) : 0);
        const other = g.slots[1 - s.i], otherNeed = other.armed && !freeFor(other) ? stakeOf(other) + (other.cfg.ins ? M.insurancePremium(stakeOf(other)) : 0) : 0;
        if (need && !B.wallet.canBet(need + otherNeed)) return B.ui.broke();
        s.armed = true; SND.arm();
      } else { s.armed = false; B.sfx('click'); if (g.auto.on) stopAuto('Autopilot off'); }
      paintSlot(s); paintHero();
    }

    /* ---------- house bats (cosmetic; generated here, never touch the outcome) ---------- */
    function makeBots() {
      const pool = BOT_NAMES.slice(), n = 5 + Math.floor(vr() * 3), out = [];
      for (let i = 0; i < n; i++) {
        const name = pool.splice(Math.floor(vr() * pool.length), 1)[0], r = vr();
        const target = Math.round(r < 0.36 ? 112 + vr() * 85 : r < 0.72 ? 200 + vr() * 230 : r < 0.93 ? 450 + vr() * 1100 : 2000 + vr() * 18000);
        const stake = [100, 100, 200, 200, 400, 1000, 2000][Math.floor(vr() * 7)];
        out.push({ name, stake, target, cashC: 0, bust: false, gone: false });
      }
      return out;
    }
    function paintBots() {
      if (shared) {
        el.botsUl.textContent = '';
        for (const b of g.bots) { b.row = h('li', { class: b.gone ? (b.bust ? 'lost' : 'won') : '' }, h('span', { class: 'ms-bn', html: B.avatar(b.avatar, 22) }), h('span', { class: 'ms-bname' }, b.label), h('span', { class: 'ms-bstake' }, b.free ? 'free' : B.fmt(b.stake)), b.out = h('span', { class: 'ms-bout' }, b.gone ? (b.bust ? 'toasted' : X(b.cashC)) : g.phase === 'bet' ? 'boarding' : 'aboard')); el.botsUl.append(b.row); }
        if (!g.bots.length) el.botsUl.append(h('li', { class: 'ms-none' }, 'Nobody else aboard yet.'));
        const n = new Set(g.bots.map((b) => b.uid)).size;
        tick(n ? n + ' other player' + (n > 1 ? 's' : '') + ' aboard' : 'Just you so far');
        return;
      }
      el.botsUl.textContent = '';
      for (const b of g.bots) {
        b.row = h('li', null, h('span', { class: 'ms-bn', html: B.batSvg() }), h('span', { class: 'ms-bname' }, b.name), h('span', { class: 'ms-bstake' }, B.fmt(b.stake)), b.out = h('span', { class: 'ms-bout' }, 'ready'));
        el.botsUl.append(b.row);
      }
      tick(g.bots.length + ' house bats on the roof');
    }
    function tick(msg) { el.tk.textContent = msg; }
    function botCash(b, c) {
      b.cashC = c; b.gone = true; const R = g.round, win = M.cashValue(b.stake, c, R.blood);
      b.row.className = 'won'; b.out.textContent = X(c) + ' · +' + B.fmt(win);
      tick(b.name + ' bailed at ' + X(c));
      if (!quiet()) { SND.botCash(); if (b.sx != null) scene.chute(b.sx, b.sy, { s: scene.k * 0.62, col: '#b9aef5', col2: '#7c6ad6', bat: '#241760', label: b.name.split(' ')[0] + ' ' + X(c), dim: true }); }
    }

    /* ---------- history, stats, stamps ---------- */
    function paintHist() {
      el.rail.textContent = ''; el.hgrid.textContent = '';
      if (!session.hist.length) { el.hgrid.append(h('p', { class: 'ms-empty' }, 'No flights yet. First dawn goes here.')); }
      session.hist.forEach((r, i) => {
        const mk = () => h('span', { class: 'ms-pill t-' + tier(r.c) + (r.blood ? ' blood' : '') + (i === 0 ? ' new' : ''), title: (r.blood ? 'Blood Moon flight, ' : '') + 'dawn at ' + X(r.c) }, X(r.c));
        el.hgrid.append(mk()); if (i < 12) el.rail.append(mk());
      });
    }
    function paintStats() {
      const net = session.paid - session.staked;
      el.stats.innerHTML = '<div><dt>Flights watched</dt><dd>' + B.fmt(session.flights) + '</dd></div>' +
        '<div><dt>Longest flight</dt><dd>' + (session.longest ? X(session.longest) : '–') + '</dd></div>' +
        '<div><dt>Best cash-out</dt><dd>' + (session.bestC ? X(session.bestC) : '–') + '</dd></div>' +
        '<div><dt>Biggest win</dt><dd>' + (session.bestBB ? B.fmt(session.bestBB) + ' BB' : '–') + '</dd></div>' +
        '<div><dt>Staked</dt><dd>' + B.fmt(session.staked) + '</dd></div>' +
        '<div><dt>Session result</dt><dd class="' + (net > 0 ? 'up' : net < 0 ? 'down' : '') + '">' + (net > 0 ? '+' : net < 0 ? '−' : '') + B.fmt(Math.abs(net)) + '</dd></div>';
    }
    function paintCard(fx) {
      const n = mem.card.stamps.length, free = mem.card.free.length;
      el.cardN.textContent = free ? free + ' free flight' + (free > 1 ? 's' : '') + ' ready' : n + ' of ' + M.STAMP.size;
      el.card.classList.toggle('has-free', free > 0);
      el.card.title = 'Moon Stamps: cash out at ' + X(M.STAMP.needC) + ' or higher to stamp, a bust burns one, ' + M.STAMP.size + ' stamps win a free flight';
      if (el.dots.children.length !== M.STAMP.size) { el.dots.textContent = ''; for (let i = 0; i < M.STAMP.size; i++) el.dots.append(h('i', { html: ICON.moon })); }
      for (let i = 0; i < M.STAMP.size; i++) {
        const d = el.dots.children[i]; d.classList.toggle('on', i < n); d.classList.remove('pop', 'burn');
        if (fx === 'stamp' && i === n - 1) { void d.offsetWidth; d.classList.add('pop'); }
        if (fx === 'burn' && i === n) { void d.offsetWidth; d.classList.add('burn'); }
        if (fx === 'full') { void d.offsetWidth; d.classList.add('pop'); }
      }
    }

    /* ---------- hero readout ---------- */
    let heroLen = 0;
    function setMult(txt) {
      if (el.mult.textContent !== txt) el.mult.textContent = txt;
      if (txt.length !== heroLen) { heroLen = txt.length; el.mult.style.setProperty('--fit', Math.min(1, 5.6 / txt.length).toFixed(3)); }
    }
    function paintHero() {
      const R = g.round, ph = g.phase; el.hero.dataset.phase = ph;
      el.hero.classList.toggle('blood', !!(R && R.blood && ph !== 'bet'));
      const aboard = g.slots.filter((s) => s.armed).length;
      if (ph === 'bet') {
        el.kick.textContent = 'Lift-off in'; setMult(String(Math.max(0, Math.ceil(g.left - 0.02))));
        el.sub.textContent = g.auto.on ? 'Autopilot · ' + (g.auto.left > 0 ? g.auto.left + ' to go' : 'until you stop it') : aboard ? (aboard === 2 ? 'Both slots aboard' : 'Slot ' + g.slots.find((s) => s.armed).key + ' aboard') : 'Place your bets, or just watch';
        el.bar.style.transform = 'scaleX(' + clamp(g.left / g.total, 0, 1) + ')';
      } else if (ph === 'wait') {
        el.kick.textContent = 'Boarding'; setMult('1.00×'); el.sub.textContent = 'Locking in your bets';
      } else if (ph === 'lift') {
        el.kick.textContent = R.blood ? 'Blood Moon rising' : 'Bets locked'; setMult('1.00×'); el.sub.textContent = 'Chocks away';
      } else if (ph === 'fly') {
        el.kick.textContent = R.blood ? 'Blood Moon · cash-outs ×' + (M.BOOST_NUM / M.BOOST_DEN) : g.landmark || 'Climbing';
        const live = g.slots.filter((s) => s.bet && !s.bet.cashC).length, had = g.slots.filter((s) => s.bet).length;
        el.sub.textContent = live ? '' : had ? 'You are out. Let’s see how far he gets' : 'Watching this one';
      } else {
        el.kick.textContent = R.capped ? 'Moonshot complete' : R.instant ? 'Dawn on the launch pad' : 'Dawn broke at';
        setMult(X(R.crashC)); el.sub.textContent = '';
      }
      el.launch.hidden = ph !== 'bet' || shared;
      el.launch.textContent = aboard || g.auto.on ? 'Launch now' : 'Skip the wait';
    }
    function caption(txt, cls) {
      el.cap.textContent = txt; el.cap.className = 'ms-cap show ' + (cls || ''); void el.cap.offsetWidth;
      S.timeout(() => { if (el.cap.textContent === txt) el.cap.className = 'ms-cap'; }, 2200);
    }

    /* ---------- round flow ---------- */
    function toBetting() {
      g.phase = 'bet'; g.round = null; g.ft = 0; g.cents = 100; g.landmark = ''; g.markI = 0; g.lastWhole = 1;
      for (const s of g.slots) s.bet = null;
      el.result.className = 'ms-result'; el.blood.className = 'ms-blood'; el.hero.classList.remove('cashed');
      scene.reset();
      if (shared) { g.bots = []; updatePlayers(g.players); } else { g.bots = makeBots(); paintBots(); }
      if (g.auto.on) {
        const a = g.auto; let why = '';
        if (a.left === 0) why = 'Autopilot finished';
        else if (B.wallet.balance < a.stopBelow) why = 'Autopilot stopped: balance below ' + B.fmt(a.stopBelow);
        else {
          let need = 0; g.slots.forEach((s) => { if (a.use[s.i] && !freeFor(s)) need += stakeOf(s) + (s.cfg.ins ? M.insurancePremium(stakeOf(s)) : 0); });
          if (!B.wallet.canBet(need) && need > 0) why = 'Autopilot stopped: not enough Batty Bucks';
        }
        if (why) stopAuto(why); else g.slots.forEach((s) => { s.armed = !!a.use[s.i]; });
      }
      g.total = g.left = g.auto.on ? (mem.turbo ? 1 : 2.2) : (mem.turbo ? 3.5 : 6.5);
      g.slots.forEach(paintSlot); paintHero(); paintAuto();
    }
    function launch() {
      if (g.phase !== 'bet' || shared) return;
      if (B.online && g.slots.some((s) => s.armed)) return launchOnline();
      let warned = false;
      for (const s of g.slots) {
        if (!s.armed) continue; s.armed = false;
        const free = freeFor(s);
        if (free) { mem.card.free.shift(); s.bet = { slot: s.key, stake: free, insured: false, free: true, cashC: 0, target: s.cfg.autoOn ? M.clampTargetC(s.cfg.auto) : 0, prem: 0, paid: 0 }; continue; }
        const stake = stakeOf(s), prem = s.cfg.ins ? M.insurancePremium(stake) : 0;
        if (!B.wallet.bet(ID, stake + prem)) { if (!warned) { warned = true; B.ui.broke(); } if (g.auto.on) stopAuto('Autopilot stopped: not enough Batty Bucks'); continue; }
        session.staked += stake + prem;
        s.bet = { slot: s.key, stake, insured: !!prem, free: false, cashC: 0, target: s.cfg.autoOn ? M.clampTargetC(s.cfg.auto) : 0, prem, paid: 0 };
      }
      saveMem();
      /* the whole hidden outcome, drawn by the maths file once bets are locked */
      let forced = null; if (dev) forced = dev.queue.length ? dev.queue.shift() : dev.force;
      g.round = forced ? M.makeRound(forced.crashC, forced.blood) : M.drawRound(B.rng);
      liftOff((g.round.blood ? 2.3 : 0.95) * (mem.turbo ? 0.6 : 1));
    }
    /* Online: the server draws the flight when the bets reach it and keeps the crash point to itself. */
    async function launchOnline() {
      g.phase = 'wait';
      const bets = []; let cost = 0, warned = false;
      for (const s of g.slots) {
        if (!s.armed) continue; s.armed = false;
        const target = s.cfg.autoOn ? M.clampTargetC(s.cfg.auto) : 0;
        if (freeFor(s)) { bets.push({ slot: s.key, free: true, target }); continue; }
        const stake = stakeOf(s), prem = s.cfg.ins ? M.insurancePremium(stake) : 0;
        if (!B.wallet.bet(ID, stake + prem)) { if (!warned) { warned = true; B.ui.broke(); } if (g.auto.on) stopAuto('Autopilot stopped: not enough Batty Bucks'); continue; }
        cost += stake + prem;
        bets.push({ slot: s.key, stake, insured: !!prem, target });
      }
      g.slots.forEach(paintSlot); paintHero();
      if (!bets.length) { g.phase = 'bet'; return launch(); }
      const r = await B.play(ID, 'launch', { bets, turbo: !!mem.turbo }, cost);
      if (g.dead) return;
      if (!r) { toBetting(); return; }
      session.staked += cost;
      for (const sb of r.bets) { const s = g.slots.find((x) => x.key === sb.slot); s.bet = { slot: sb.slot, stake: sb.stake, insured: sb.insured, free: sb.free, cashC: 0, target: sb.target, prem: sb.prem, paid: 0 }; }
      mem.card.stamps = r.card.stamps; mem.card.free = r.card.free; paintCard();
      g.round = { online: true, id: r.round, crashC: Infinity, blood: r.blood, capped: false, instant: false, safeEl: -1, srv: null, cashQ: [] };
      liftOff(r.lift);
    }
    function liftOff(lift) {
      if (g.auto.on && g.auto.left > 0) g.auto.left--;
      g.phase = 'lift'; g.left = lift;
      if (!quiet()) { SND.launch(); if (g.round.blood) SND.blood(); }
      if (g.round.blood) { el.blood.className = 'ms-blood show'; scene.V.flash = 0.5; }
      for (const b of g.bots) b.out.textContent = 'aboard';
      if (shared) paintBots(); else tick(g.bots.length + ' house bats aboard');
      g.slots.forEach(paintSlot); paintHero(); paintAuto();
    }
    function takeoff() {
      g.ft = 0; g.cents = 100; g.nextBeat = 0.6;
      if (g.round.instant) return crash();
      g.phase = 'fly'; if (!quiet()) engine.start();
      g.slots.forEach(paintSlot); paintHero();
    }
    const liveBets = () => g.slots.filter((s) => s.bet && !s.bet.cashC);
    function cashOut(s, cents, how, paid) {
      const b = s.bet, R = g.round; if (!b || b.cashC) return;
      b.cashC = cents; b.paid = paid != null ? paid : M.cashValue(b.stake, cents, R.blood);
      B.wallet.win(ID, b.paid); /* certain the instant it happens, so it is banked and shown at once */
      session.paid += b.paid; if (cents > session.bestC) session.bestC = cents; if (b.paid > session.bestBB) session.bestBB = b.paid;
      if (how !== 'bail' && !S.dead) {
        const p = scene.batty(), gold = s.i === 0;
        scene.chute(p.x, p.y + 8, { s: scene.k * 1.05, col: gold ? '#ffd76a' : '#8fd8ff', col2: gold ? '#ff8a4a' : '#5a7cf0', bat: '#2a1868', label: '+' + B.fmt(b.paid), big: true, vx: gold ? -26 : -12, life: 1.2 });
        if (!quiet()) { SND.cash(cents >= 1000); const r = s.go.getBoundingClientRect(); B.fx.burst({ x: r.left + r.width / 2, y: r.top + 6, count: cents >= 500 ? 26 : 12, kind: 'coin', power: 0.7 }); }
        el.hero.classList.remove('cashed'); void el.hero.offsetWidth; el.hero.classList.add('cashed');
        s.el.classList.remove('flash'); void s.el.offsetWidth; s.el.classList.add('flash');
      }
      paintSlot(s); paintHero(); paintStats();
    }
    function manualCash(s) {
      if (g.phase !== 'fly') return;
      step(); /* bring the flight clock right up to this instant first */
      const R = g.round;
      if (R && R.online) {
        if (s.cashing || !s.bet || s.bet.cashC || R.srv) return;
        s.cashing = true; s.go.classList.add('wait');
        B.play(ID, 'cash', R.shared ? { flight: R.flight, slot: s.key, cents: Math.max(g.cents, M.MIN_CASH_C) } : { round: R.id, slot: s.key, cents: Math.max(g.cents, M.MIN_CASH_C) }, 0).then((r) => { s.cashing = false; s.go.classList.remove('wait'); if (r && g.round === R && !g.dead) fromServer(R, r); });
        return;
      }
      if (g.phase === 'fly' && s.bet && !s.bet.cashC && M.canCashAt(g.round, g.cents)) cashOut(s, g.cents, 'hand');
    }
    function advance(dt) {
      const R = g.round, ff = mem.turbo && !liveBets().length && !shared ? 6 : 1;
      g.ft += dt * ff;
      if (R.online && !R.srv) { const lim = Math.max(0, R.safeEl) + 0.45; if (g.ft > lim) g.ft = lim; }
      let c = M.centsAt(g.ft); const done = c >= R.crashC; if (done) c = R.crashC;
      g.cents = c;
      if (R.online) { for (let i = R.cashQ.length - 1; i >= 0; i--) { const q = R.cashQ[i]; if (q.cashC <= c || done) { R.cashQ.splice(i, 1); const s = g.slots.find((x) => x.key === q.slot); if (s) cashOut(s, q.cashC, q.how || 'auto', q.paid); } } }
      else for (const s of g.slots) { const b = s.bet; if (b && !b.cashC && b.target && b.target <= c) cashOut(s, b.target, 'auto'); }
      for (const b of g.bots) if (!b.gone && b.target <= c) botCash(b, b.target);
      if (done) {
        if (R.capped && !R.online) for (const s of liveBets()) { const cc = M.autoCashC(R, s.bet.target); if (cc) cashOut(s, cc, 'auto'); }
        return crash();
      }
      /* landmarks + sound follow the readout */
      while (g.markI < LANDMARKS.length && c >= LANDMARKS[g.markI][0]) { g.landmark = LANDMARKS[g.markI][1]; caption(g.landmark + ' · ' + B.fmtX(LANDMARKS[g.markI][0] / 100)); if (!quiet()) SND.mark(g.markI); g.markI++; }
      if (!quiet()) {
        engine.set(c / 100);
        if (g.ft >= g.nextBeat) { g.nextBeat = g.ft + clamp(0.95 - g.ft * 0.028, 0.3, 0.95); SND.beat(clamp(0.35 + g.ft * 0.05, 0.35, 1)); }
        const whole = Math.floor(c / 100); if (whole > g.lastWhole) { g.lastWhole = whole; if (whole > 2) B.sfx('tick'); }
      }
    }
    /* Money and card for a finished flight. No visuals in here, so it is also what runs if the player walks out mid-flight. */
    function settle() {
      const R = g.round, bets = g.slots.filter((s) => s.bet).map((s) => s.bet);
      const before = mem.card.stamps.length;
      let total;
      if (R.online) {
        const S2 = R.srv;
        for (const b of bets) { const x = S2.bets.find((y) => y.slot === b.slot); if (!x) { b.win = b.paid || 0; b.insPay = 0; b.bust = !b.cashC; continue; } b.win = x.win; b.insPay = x.insPay; b.bust = x.bust; if (!b.cashC && x.cashC) { b.cashC = x.cashC; b.paid = x.win; } }
        mem.card.stamps = S2.card.stamps; mem.card.free = S2.card.free; mem.card.last = S2.card.last || { stamped: false, burned: false, award: 0 };
        total = S2.total;
      } else total = M.settleRound(R, bets, mem.card);
      let staked = 0, ins = 0;
      for (const b of bets) {
        if (b.win !== b.paid) console.error('moonshot: banked ' + b.paid + ' but maths says ' + b.win);
        if (b.insPay) { B.wallet.win(ID, b.insPay, { silent: true }); session.paid += b.insPay; ins += b.insPay; }
        staked += b.free ? 0 : b.stake + b.prem;
      }
      saveMem();
      session.flights++; if (R.crashC > session.longest) session.longest = R.crashC;
      session.hist.unshift({ c: R.crashC, blood: R.blood }); if (session.hist.length > 20) session.hist.length = 20;
      if (dev) dev.log.push({ crashC: R.crashC, blood: R.blood, staked, paid: total, bets: bets.map((b) => ({ slot: b.slot, stake: b.stake, prem: b.prem, free: b.free, target: b.target, cashC: b.cashC, win: b.win, insPay: b.insPay })), bal: B.wallet.balance, stamps: mem.card.stamps.length, award: mem.card.last.award });
      return { bets, total, staked, ins, before };
    }
    function crash() {
      const R = g.round; g.phase = 'end'; g.cents = R.crashC;
      engine.stop(true);
      const res = settle(), last = mem.card.last, V = scene.V;
      for (const b of g.bots) if (!b.gone) { b.bust = true; b.row.className = 'lost'; b.out.textContent = 'toasted'; }
      const toasted = g.bots.filter((b) => b.bust).length, who = shared ? ' player' : ' house bat';
      tick(shared && !g.bots.length ? 'Dawn at ' + X(R.crashC) : R.capped ? 'Everybody made it' : toasted ? toasted + who + (toasted > 1 ? 's' : '') + ' toasted' : shared ? 'Everyone aboard got out' : 'Every house bat got out');
      /* presentation */
      const p = scene.batty();
      if (R.capped) { V.flash = 1; if (!quiet()) { SND.cap(); B.fx.rain('confetti', 3000); } caption('10,000× · the ceiling', 'gold'); }
      else {
        V.poofed = true; V.flash = 1; V.shake = 1; scene.poof(p.x, p.y, true);
        if (!quiet()) for (const b of g.bots) if (b.bust && b.sx != null) scene.poof(b.sx, b.sy, false);
        if (!quiet()) SND.bust();
      }
      for (const b of g.bots) b.gone = true;
      /* result panel */
      const lines = [];
      for (const b of res.bets) {
        const tag = '<i class="t' + b.slot + '">' + b.slot + '</i>';
        if (b.win) lines.push('<li class="win">' + tag + '<span>' + (b.free ? 'Free flight out' : 'Out') + ' at ' + X(b.cashC) + (R.blood ? ' <em>×' + (M.BOOST_NUM / M.BOOST_DEN) + '</em>' : '') + '</span><b>+' + B.fmt(b.win) + '</b></li>');
        else lines.push('<li class="lose">' + tag + '<span>' + (b.free ? 'Free flight toasted' : 'Toasted') + (b.target ? ' chasing ' + X(b.target) : '') + '</span><b>' + (b.free ? '0' : '−' + B.fmt(b.stake)) + '</b></li>');
        if (b.insured) lines.push(b.insPay ? '<li class="cover">' + ICON.eclipse + '<span>Eclipse Cover pays</span><b>+' + B.fmt(b.insPay) + '</b></li>' : '<li class="dim">' + ICON.eclipse + '<span>Cover not needed (' + X(M.INS.belowC) + ' cleared)</span><b>−' + B.fmt(b.prem) + '</b></li>');
      }
      const n = mem.card.stamps.length;
      if (last.award) lines.push('<li class="stamp">' + ICON.moon + '<span>Card full: free flight won</span><b>' + B.fmt(last.award) + '</b></li>');
      else if (last.stamped) lines.push('<li class="stamp">' + ICON.moon + '<span>Moon Stamp earned</span><b>' + n + '/' + M.STAMP.size + '</b></li>');
      else if (last.burned) lines.push('<li class="burn">' + ICON.moon + '<span>A stamp went up in smoke</span><b>' + n + '/' + M.STAMP.size + '</b></li>');
      else if (last.cancelled) lines.push('<li class="dim">' + ICON.moon + '<span>Stamp and burn cancel out</span><b>' + n + '/' + M.STAMP.size + '</b></li>');
      let foot = '';
      if (res.bets.length) {
        const net = res.total - res.staked, bestOut = Math.max.apply(null, res.bets.map((b) => b.cashC));
        if (bestOut && R.crashC > bestOut && !R.capped) lines.push('<li class="dim note"><span>He flew on to ' + X(R.crashC) + ' after you bailed</span></li>');
        foot = '<div class="ms-res-t ' + (net > 0 ? 'up' : net < 0 ? 'down' : '') + '"><span>This flight</span><b>' + (net > 0 ? '+' : net < 0 ? '−' : '') + B.fmt(Math.abs(net)) + ' BB</b></div>';
      }
      el.result.innerHTML = lines.length ? '<ul>' + lines.join('') + '</ul>' + foot : '';
      el.result.className = 'ms-result' + (lines.length ? ' show' : '');
      const beat = res.bets.length ? (mem.turbo ? 1.7 : 3.6) : (mem.turbo ? 1.1 : 2.4);
      g.left = beat + (last.award ? 2.2 : 0);
      S.timeout(() => { B.wallet.sync(); if (res.ins && !quiet()) SND.cover(); }, quiet() ? 0 : 450);
      if (last.stamped || last.award) S.timeout(() => { paintCard(last.award ? 'full' : 'stamp'); if (!quiet()) SND.stamp(); }, quiet() ? 0 : 700);
      else if (last.burned) S.timeout(() => { paintCard('burn'); if (!quiet()) SND.burn(); }, quiet() ? 0 : 700);
      else paintCard();
      if (last.award) S.timeout(() => {
        el.free.innerHTML = '<span>Card full</span><b>Free flight</b><em>' + B.fmt(last.award) + ' BB on slot A, on the house</em>'; el.free.className = 'ms-free show';
        if (!quiet()) { B.sfx('bonus'); B.fx.burst({ el: el.card, count: 30, kind: 'spark', power: 0.8 }); }
        S.timeout(() => { el.free.className = 'ms-free'; }, 2400 / sp());
      }, 1300 / sp());
      paintHist(); paintStats(); g.slots.forEach(paintSlot); paintHero(); paintAuto();
      /* big wins get the full-screen treatment once the flight is over */
      if (res.staked > 0 && res.total >= 10 * res.staked && !quiet()) {
        g.hold = true;
        S.timeout(() => { B.ui.celebrate({ amount: res.total, bet: res.staked }).then(() => { if (!g.dead) { g.hold = false; g.last = performance.now(); } }); }, 1100);
      } else if (!res.staked && res.total >= 1000 && !quiet()) B.fx.rain('coin', 1200);
    }

    /* Online: fold a server reply into the flight. Cash-outs are queued so they appear as the readout reaches them. */
    function fromServer(R, r) {
      if (R.srv) return;   // already settled: late replies (a poll that crossed a cash-out) change nothing
      if (r.flying) { if (typeof r.el === 'number') R.safeEl = Math.max(R.safeEl, r.el); else R.safeEl = Math.max(R.safeEl, M.timeAtC(r.safeC)); }
      const seen = (slot) => R.cashQ.some((q) => q.slot === slot) || g.slots.some((s) => s.key === slot && s.bet && s.bet.cashC);
      for (const c of r.cashed || []) if (!seen(c.slot)) R.cashQ.push({ slot: c.slot, cashC: c.cashC, paid: c.paid });
      if (r.crashed) {
        for (const b of r.bets) if (b.cashC && !b.bust && !seen(b.slot)) R.cashQ.push({ slot: b.slot, cashC: b.cashC, paid: b.win });
        R.srv = r; R.crashC = r.crashC; R.capped = r.capped; R.instant = r.crashC <= 100;
      }
      if (r.gone) { R.srv = { bets: [], card: r.card, total: 0 }; R.crashC = Math.max(100, g.cents); }
    }
    S.interval(() => {
      const R = g.round;
      if (!R || !R.online || R.srv || g.polling || g.dead || (g.phase !== 'fly' && g.phase !== 'lift')) return;
      g.polling = true;
      B.api('play', { game: ID, op: 'status', round: R.id }, { defer: true })
        .then((r) => { g.polling = false; if (g.round === R && !g.dead) fromServer(R, r); })
        .catch(() => { g.polling = false; });
    }, 200);
    /* ---------- shared flights ---------- */
    const serverNow = () => Date.now() / 1000 + g.off;
    function updatePlayers(list) {
      const me = B.me ? B.me.id : 0, keep = [];
      for (const p of list || []) {
        if (p.id === me) continue;
        const key = p.id + p.slot;
        let b = g.bots.find((x) => x.key === key);
        if (!b) b = { key, uid: p.id, name: p.name, label: p.name + (list.some((q) => q.id === p.id && q.slot !== p.slot) ? ' · ' + p.slot : ''), avatar: p.avatar, stake: p.stake, free: p.free, target: Infinity, cashC: 0, bust: false, gone: false };
        if (p.cashC && b.target === Infinity && (g.phase === 'fly' || g.phase === 'end')) b.target = p.cashC;
        if (p.cashC && b.bust && g.phase === 'end' && b.row) { b.bust = false; b.cashC = p.cashC; b.row.className = 'won'; b.out.textContent = X(p.cashC); }
        keep.push(b);
      }
      const changed = keep.length !== g.bots.length || keep.some((b, i) => b !== g.bots[i]);
      g.bots = keep;
      if (changed) paintBots();
    }
    function applyMine(list, fromPoll, sentAt) {
      for (const s of g.slots) {
        const m = (list || []).find((x) => x.slot === s.key);
        if (fromPoll && (s.changedAt || 0) > sentAt) continue;   // this poll left before the player's last bet or cancel: ignore it for this slot
        if (m && !s.bet && (g.phase === 'bet' || !fromPoll || g.flightId === (g.flight && g.flight.id))) s.bet = { slot: m.slot, stake: m.stake, insured: m.insured, free: m.free, cashC: 0, target: m.target, prem: m.prem, paid: 0 };
        else if (!m && s.bet && g.phase === 'bet' && !s.placing) s.bet = null;
        if (m && s.bet && m.cashC && !s.bet.cashC && g.round && g.round.cashQ && !g.round.cashQ.some((q) => q.slot === m.slot)) g.round.cashQ.push({ slot: m.slot, cashC: m.cashC, paid: m.paid });
      }
      g.slots.forEach(paintSlot);
    }
    function placeShared(s) {
      if (s.placing || s.bet || !g.flightId || g.phase !== 'bet') return;
      const free = freeFor(s), stake = free || stakeOf(s), prem = !free && s.cfg.ins ? M.insurancePremium(stake) : 0, cost = free ? 0 : stake + prem;
      if (cost && !B.wallet.bet(ID, cost)) { s.armed = false; paintSlot(s); if (g.auto.on) stopAuto('Autopilot stopped: not enough Batty Bucks'); return B.ui.broke(); }
      s.placing = true; s.armed = false; s.changedAt = Date.now(); SND.arm(); paintSlot(s); paintHero();
      const fid = g.flightId;
      B.play(ID, 'bet', { flight: fid, slot: s.key, stake, insured: !!prem, target: s.cfg.autoOn ? M.clampTargetC(s.cfg.auto) : 0, free: !!free }, cost).then((r) => {
        s.placing = false; s.changedAt = Date.now(); if (g.dead) return;
        if (r) { session.staked += cost; mem.card.stamps = r.card.stamps; mem.card.free = r.card.free; paintCard(); if (g.flightId === fid) applyMine(r.mine); }
        paintSlot(s); paintHero();
      });
    }
    function unbetShared(s) {
      if (!s.bet || s.placing) return;
      s.placing = true; s.changedAt = Date.now(); B.sfx('click'); paintSlot(s);
      const cost = s.bet.free ? 0 : s.bet.stake + s.bet.prem;
      B.play(ID, 'unbet', { flight: g.flightId, slot: s.key }, 0).then((r) => {
        s.placing = false; s.changedAt = Date.now(); if (g.dead) return;
        if (r) { s.bet = null; session.staked -= cost; mem.card.stamps = r.card.stamps; mem.card.free = r.card.free; paintCard(); applyMine(r.mine); B.wallet.sync(); if (g.auto.on) stopAuto('Autopilot off'); }
        paintSlot(s); paintHero();
      });
    }
    async function pollShared() {
      if (g.polling || g.dead) return;
      g.polling = true;
      const t0 = Date.now(); let r;
      try { r = await B.api('play', { game: ID, op: 'state' }, { defer: true }); } catch (e) { g.polling = false; return; }
      const t1 = Date.now(); g.polling = false;
      if (g.dead) return;
      /* clock: keep the estimate from the quickest round trip, refreshed now and then */
      const rtt = t1 - t0, off = r.now - (t0 + t1) / 2000;
      if (g.off == null || rtt <= g.bestRtt * 1.25 || ++g.offAge > 60) { g.off = off; g.bestRtt = rtt; g.offAge = 0; }
      g.lastNow = r.now; g.flight = r.flight; g.players = r.players;
      if (g.phase === 'bet' || g.phase === 'end' || !session.hist.length) { session.hist = r.hist; paintHist(); }
      const R = g.round;
      if (R && R.shared && !R.srv) {
        const mineSettled = (r.settled || []).find((x) => x.flight === R.flight);
        if (r.flight.id === R.flight && r.flight.crashC === undefined) {
          if (r.flight.startAt !== undefined) R.safeEl = Math.max(R.safeEl, r.now - r.flight.startAt);
          if (r.flight.blood !== undefined && r.flight.blood !== R.blood) { R.blood = r.flight.blood; if (R.blood) { el.blood.className = 'ms-blood show'; if (!quiet()) SND.blood(); } paintHero(); }
        } else {
          const crashC = r.flight.id === R.flight ? r.flight.crashC : mineSettled ? mineSettled.crashC : (r.hist[0] && r.hist[0].c) || Math.max(100, g.cents);
          fromServer(R, mineSettled || { crashed: true, crashC, capped: crashC >= M.CAP_C, blood: R.blood, bets: [], total: 0, card: { stamps: r.card.stamps, free: r.card.free, last: null } });
        }
      }
      if (g.phase !== 'end') applyMine(r.mine, true, t0);
      if (g.phase === 'bet') { mem.card.stamps = r.card.stamps; mem.card.free = r.card.free; paintCard(); }
      updatePlayers(r.players);
    }
    function stepShared() {
      const F = g.flight; if (!F || g.off == null || g.hold) return;
      const now = serverNow();
      if (F.id !== g.flightId) {
        if (g.phase === 'fly' || g.phase === 'lift') return;   // still showing the last flight; the poll will bring its dawn
        if (g.phase === 'end' && now < F.openAt) return;
        g.flightId = F.id; toBetting(); g.round = null;
      }
      if (now < F.closeAt) {
        g.phase = 'bet'; g.left = F.closeAt - now; g.total = Math.max(1, F.closeAt - F.openAt);
        for (const s of g.slots) if (s.armed && !s.bet && !s.placing) placeShared(s);
        return;
      }
      if (F.startAt === undefined) { g.left = 0; return; }   // bets just closed; the next poll says when we fly
      if (!g.round) {
        for (const s of g.slots) { s.armed = false; s.placing = false; }
        g.round = { online: true, shared: true, flight: F.id, crashC: Infinity, blood: !!F.blood, capped: false, instant: false, safeEl: g.lastNow - F.startAt, srv: null, cashQ: [] };
        liftOff(Math.max(0, F.startAt - now));
      }
      if (g.phase === 'lift') { if (now >= F.startAt) { g.ft = 0; takeoff(); } else { g.left = F.startAt - now; return; } }
      if (g.phase === 'fly') { const dt = (now - F.startAt) - g.ft; if (dt > 0) advance(dt); }
    }
    if (shared) S.interval(pollShared, 220);

    function step() {
      if (g.dead) return;
      if (shared) { stepShared(); return; }
      const now = performance.now(); let dt = (now - g.last) / 1000; g.last = now;
      if (!(dt > 0) || g.hold) return;
      dt *= sp();
      if (g.phase === 'bet') { g.left -= dt; if (g.left <= 0) launch(); }
      else if (g.phase === 'lift') { g.left -= dt; if (g.left <= 0) takeoff(); }
      else if (g.phase === 'fly') advance(dt);
      else if (g.phase === 'wait') { /* waiting for the server to take the bets */ }
      else { g.left -= dt; if (g.left <= 0) toBetting(); }
    }

    /* ---------- autopilot ---------- */
    function paintAuto() {
      const a = g.auto; el.autobtn.classList.toggle('on', a.on);
      el.autobtn.lastChild.textContent = a.on ? 'Stop' + (a.left > 0 ? ' · ' + a.left : '') : 'Autopilot';
      el.quick.setAttribute('aria-pressed', mem.turbo ? 'true' : 'false');
    }
    function stopAuto(msg) { if (!g.auto.on) return; g.auto.on = false; if (msg) B.ui.toast(msg); paintAuto(); paintHero(); }
    let autoN = 25;
    function openAuto() {
      el.sheet.hidden = false; B.sfx('click');
      el.sheet.querySelectorAll('.ms-auto-slots button').forEach((b) => b.classList.toggle('on', !!g.auto.use[+b.dataset.s]));
      el.sheet.querySelectorAll('.ms-auto-n button').forEach((b) => b.classList.toggle('on', +b.dataset.n === autoN));
    }
    el.sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (e.target === el.sheet || (t && t.classList.contains('ms-cancel'))) { el.sheet.hidden = true; return; }
      if (!t) return;
      if (t.dataset.s != null) { const i = +t.dataset.s; g.auto.use[i] = !g.auto.use[i]; if (!g.auto.use[0] && !g.auto.use[1]) g.auto.use[i] = true; B.sfx('click'); openAutoPaint(); }
      else if (t.dataset.n != null) { autoN = +t.dataset.n; B.sfx('click'); openAutoPaint(); }
      else if (t.classList.contains('ms-start')) {
        const a = g.auto; a.stopBelow = Math.max(0, parseInt(String(el.stop.value).replace(/[^0-9]/g, ''), 10) || 0); a.left = autoN || -1; a.on = true;
        let fixed = false; g.slots.forEach((s) => { if (a.use[s.i] && !s.cfg.autoOn) { s.cfg.autoOn = true; fixed = true; } });
        saveMem(); el.sheet.hidden = true; B.sfx('pop');
        B.ui.toast(fixed ? 'Autopilot on. Auto cash-out switched on for its slots.' : 'Autopilot on');
        if (g.phase === 'bet') { g.slots.forEach((s) => { s.armed = !!a.use[s.i]; }); g.left = Math.min(g.left, 2.2); g.total = Math.max(g.left, 0.1); }
        else g.slots.forEach((s) => { if (!s.bet) s.armed = false; });
        g.slots.forEach(paintSlot); paintAuto(); paintHero();
      }
    });
    function openAutoPaint() {
      el.sheet.querySelectorAll('.ms-auto-slots button').forEach((b) => b.classList.toggle('on', !!g.auto.use[+b.dataset.s]));
      el.sheet.querySelectorAll('.ms-auto-n button').forEach((b) => b.classList.toggle('on', +b.dataset.n === autoN));
    }
    el.autobtn.addEventListener('click', () => { if (g.auto.on) { stopAuto(); B.sfx('click'); g.slots.forEach((s) => { if (!s.bet) { s.armed = false; paintSlot(s); } }); paintHero(); } else openAuto(); });
    el.quick.addEventListener('click', () => { mem.turbo = !mem.turbo; saveMem(); B.sfx('click'); paintAuto(); B.ui.toast(mem.turbo ? 'Quick on: shorter gaps, and flights fast-forward once you are out' : 'Quick off'); });
    el.launch.addEventListener('click', () => { if (g.phase === 'bet') { B.sfx('click'); launch(); } });
    const openSide = (o) => { el.side.classList.toggle('open', o); if (o) B.sfx('click'); };
    el.ticker.addEventListener('click', () => openSide(true));
    el.side.querySelector('.ms-x').addEventListener('click', () => openSide(false));

    /* Space = the primary action: cash out (A then B) in flight; otherwise board slot A, then launch */
    S.on(document, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.bc-veil,.bc-win') || !el.sheet.hidden) return;
      e.preventDefault(); if (e.repeat) return;
      if (g.phase === 'fly') { const s = liveBets()[0]; if (s) manualCash(s); else if (!g.slots[0].bet && !g.slots[0].armed) pressGo(g.slots[0]); }
      else if (g.phase === 'bet') { if (shared) pressGo(g.slots[0]); else if (g.slots.some((s) => s.armed)) { B.sfx('click'); launch(); } else pressGo(g.slots[0]); }
    });
    S.on(document, 'keyup', (e) => { if ((e.code === 'Space' || e.key === ' ') && e.target && e.target.tagName === 'BUTTON' && root.contains(e.target)) e.preventDefault(); });

    /* If the player walks out (or the page goes away) mid-flight, bets still aboard bail out at this instant. */
    function bail() {
      if (g.dead) return;
      const R0 = g.round;
      if (shared) {
        const live = g.slots.some((s) => s.bet && !s.bet.cashC);
        if (live && g.flightId && (g.phase === 'bet' || g.phase === 'fly') && !(R0 && R0.srv)) B.api('play', { game: ID, op: 'bail', flight: g.flightId }, { defer: true }).then(() => B.wallet.sync()).catch(() => {});
        g.phase = 'end'; return;
      }
      if (R0 && R0.online && !R0.srv && (g.phase === 'lift' || g.phase === 'fly')) {
        B.api('play', { game: ID, op: 'bail', round: R0.id }, { defer: true }).then(() => B.wallet.sync()).catch(() => {});
        g.phase = 'end'; return;
      }
      if (g.phase === 'fly') step();
      if (g.phase === 'lift' || g.phase === 'fly') {
        const c = Math.max(g.cents, M.MIN_CASH_C);
        for (const s of liveBets()) if (M.canCashAt(g.round, c)) cashOut(s, c, 'bail');
        settle(); g.phase = 'end';
      }
      B.wallet.sync();
    }
    S.on(window, 'pagehide', bail);
    g.destroy = () => { bail(); g.dead = true; engine.stop(false); if (dev) dev.game = null; };

    /* ---------- go ---------- */
    g.slots = [buildSlot(0), buildSlot(1)];
    if (B.online) B.api('play', { game: ID, op: 'card' }).then((r) => { if (g.dead) return; mem.card.stamps = r.card.stamps; mem.card.free = r.card.free; paintCard(); g.slots.forEach(paintSlot); }).catch(() => {});
    paintHist(); paintStats(); paintCard();
    scene.resize();
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => scene.resize()); ro.observe(el.stage); g.ro = ro; } else S.on(window, 'resize', () => scene.resize());
    toBetting();
    let lastBet = -1;
    S.loop((dt, now) => {
      step();
      if (g.phase === 'bet') { const n = Math.ceil(g.left - 0.02); el.bar.style.transform = 'scaleX(' + clamp(g.left / g.total, 0, 1) + ')'; if (n !== lastBet) { lastBet = n; setMult(String(Math.max(0, n))); if (n <= 3 && n > 0 && !quiet() && !g.auto.on) B.sfx('tick'); } }
      else { lastBet = -1; if (g.phase === 'fly') { setMult(X(g.cents)); for (const s of g.slots) if (s.state === 'live') { s.go.lastChild.textContent = B.fmt(M.cashValue(s.bet.stake, Math.max(g.cents, M.MIN_CASH_C), g.round.blood)) + ' BB'; if (s.go.disabled && g.cents >= M.MIN_CASH_C) s.go.disabled = false; } } }
      const heat = g.phase === 'fly' ? clamp(Math.log(g.cents / 100) / 3.2, 0, 1) : 0; el.hero.style.setProperty('--heat', heat.toFixed(3));
      scene.draw(dt, now, g);
    });
    S.interval(step, 250); /* keeps the flight honest while the tab is in the background */
  }

  B.registerGame({
    id: ID,
    name: 'Batty’s Moonshot',
    tagline: 'Ride the multiplier to the moon. Cash out before dawn.',
    tag: 'Crash',
    poster,
    rules,
    mount(root) { mount(root); },
    unmount() { if (G) { if (G.ro) G.ro.disconnect(); G.destroy(); } G = null; if (S) S.dispose(); S = null; },
  });
})();
