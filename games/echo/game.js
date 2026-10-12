/* ===== echo math ===== */
/* Echo Chamber: pure maths (no DOM). Shared verbatim by the browser game (practice mode) and tools/echo-xcheck.js, and ported
   line for line to lib/games/echo.php (proved identical by tools/echo-xcheck.js on seeded rounds).

   A cave of four glowing crystals plays a pattern; you repeat it. Level 1 is 3 notes and every level adds one, up to
   level 12 (14 notes). One wrong note ends the round. Each time you repeat a pattern correctly an echo-storm may knock the
   bat down anyway: it passes with probability SURVIVE[level] (percent). After every cleared level you choose: bank the
   multiplier, or fly on to a longer pattern with a bigger multiplier.

   Skill decides how far you get. Luck is a fixed storm, so the maths is honest for everyone. The multiplier for clearing
   level L is 96 / (product of the storm odds up to L), rounded DOWN to hundredths, so a player with perfect memory returns
   at most 96% whatever they decide, and anyone who slips returns less. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).echo = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PADS = 4, LEVELS = 12, START_LEN = 3;
  const SURVIVE = [93, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70];
  const len = (level) => START_LEN + level - 1;
  /* multiplier in hundredths for having cleared `level` levels (index 0..12), rounded down */
  function mults() { const m = [0]; let p = 1; for (let i = 0; i < LEVELS; i++) { p *= SURVIVE[i] / 100; m.push(Math.floor(96 / p)); } return m; }
  const MULT = mults();
  const win = (stake, m100) => Math.floor(stake * m100 / 100);
  function seq(rng, n) { const s = []; for (let i = 0; i < n; i++) { const v = Math.floor(rng() * PADS); s.push(v < PADS ? v : PADS - 1); } return s; }
  function start(rng) { return { L: 1, seq: seq(rng, len(1)), phase: 'input', m: 0 }; }
  /* submit a pattern: returns { s, res } with res = miss | storm | top | ok */
  function input(s, taps, rng) {
    if (s.phase !== 'input') throw new Error('That is not available now.');
    const n = Object.assign({}, s);
    if (taps.length !== s.seq.length || taps.some((t, i) => t !== s.seq[i])) { n.phase = 'done'; return { s: n, res: 'miss' }; }
    if (!(rng() * 100 < SURVIVE[s.L - 1])) { n.phase = 'done'; return { s: n, res: 'storm' }; }
    n.m = MULT[s.L];
    if (s.L >= LEVELS) { n.phase = 'done'; return { s: n, res: 'top' }; }
    n.phase = 'decide';
    return { s: n, res: 'ok' };
  }
  function next(s, rng) {
    if (s.phase !== 'decide') throw new Error('That is not available now.');
    const n = Object.assign({}, s); n.L++; n.seq = seq(rng, len(n.L)); n.phase = 'input';
    return n;
  }
  /* the return of "clear k levels with perfect memory, then bank", as a fraction of the stake (always at most 0.96) */
  function perfectReturn(k) { let p = 1; for (let i = 0; i < k; i++) p *= SURVIVE[i] / 100; return p * MULT[k] / 100; }
  return { PADS, LEVELS, START_LEN, SURVIVE, MULT, len, win, seq, start, input, next, perfectReturn };
});
/* ===== echo ===== */
(function () {
  'use strict';
  const B = Batty, h = B.h, fmt = B.fmt, M = BattyMath.echo, ID = 'echo';
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const COL = [['#ff4fa3', '#ffb3d9', '#5c0a35'], ['#19d3c5', '#a8fff6', '#04423d'], ['#ffb02e', '#ffe2a0', '#5c3600'], ['#9b6bff', '#d7c5ff', '#2a0f6b']];
  const FREQ = [329.63, 392.0, 493.88, 587.33];
  const KEYS = ['1', '2', '3', '4'];
  const xs = (m) => (m / 100).toFixed(2) + '×';
  let G = null;

  const crystal = (i) => {
    const c = COL[i];
    return '<svg viewBox="0 0 100 130" aria-hidden="true"><defs><linearGradient id="ec-g' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c[1] + '"/><stop offset=".5" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[2] + '"/></linearGradient></defs>' +
      '<path d="M50 4 82 38 72 124H28L18 38Z" fill="url(#ec-g' + i + ')" stroke="rgba(0,0,0,.45)" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M50 4 50 124M18 38 50 56 82 38" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.6"/><path d="M50 4 28 30 38 70" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.4" stroke-linecap="round"/></svg>';
  };
  function cave() {
    let st = '';
    for (let i = 0; i < 9; i++) { const x = 20 + i * 70 + (i % 2) * 14, hh = 50 + (i * 37) % 70; st += '<path d="M' + (x - 20) + ' 0 L' + x + ' ' + hh + ' L' + (x + 22) + ' 0Z" fill="#150a28"/>'; }
    return '<svg class="ec-cave" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="ec-moon" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#6b4fd1" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="640" height="400" fill="#0b0618"/><rect width="640" height="400" fill="url(#ec-moon)"/>' + st +
      '<path d="M0 400V340Q80 310 160 345T320 335T480 350T640 330V400Z" fill="#12092a"/></svg>';
  }
  function poster() {
    return '<svg viewBox="0 0 300 380" role="img" aria-label="Echo Chamber"><defs><linearGradient id="ecp-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0618"/><stop offset=".7" stop-color="#2a1250"/><stop offset="1" stop-color="#4a1a5a"/></linearGradient></defs><rect width="300" height="380" fill="url(#ecp-bg)"/>' +
      [0, 1, 2, 3].map((i) => '<g transform="translate(' + (14 + i * 70) + ' ' + (150 + (i % 2) * 16) + ') scale(.62)">' + crystal(i) + '</g>').join('') +
      '<g transform="translate(112 52) scale(.8)"><path d="' + B.batPath + '" fill="#fff4cc"/></g>' +
      '<text x="150" y="318" text-anchor="middle" font-family="Titan One,Arial Black,sans-serif" font-size="38" fill="#ffd451" stroke="#1a0b2e" stroke-width="3" paint-order="stroke">ECHO</text>' +
      '<text x="150" y="346" text-anchor="middle" font-family="Titan One,Arial Black,sans-serif" font-size="22" fill="#ffe6a8" stroke="#1a0b2e" stroke-width="3" paint-order="stroke">CHAMBER</text>' +
      '<text x="150" y="368" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="10" letter-spacing="3" fill="#cdbbff">A MEMORY GAME. SKILL PAYS.</text></svg>';
  }
  function rules() {
    const rows = []; for (let L = 1; L <= M.LEVELS; L++) rows.push('<tr><td>' + L + '</td><td>' + M.len(L) + ' notes</td><td>' + (100 - M.SURVIVE[L - 1]) + '%</td><td>' + xs(M.MULT[L]) + '</td></tr>');
    return '<div class="ec-rules"><p><b>Echo Chamber</b> is a game of memory, and the only game here where skill matters. The cave plays a pattern on four glowing crystals; repeat it note for note.</p>' +
      '<h3>How a round goes</h3><ul><li>Pick a stake and press <b>Play</b>. Level 1 is 3 notes; every level adds one, up to 14 notes at level 12.</li>' +
      '<li>One wrong note and the round is over.</li><li>Every time you repeat a pattern correctly, an <b>echo-storm</b> rolls. It passes most of the time, but it can knock the bat down however well you played. The storm risk is shown before you choose to fly on.</li>' +
      '<li>After each cleared level, <b>cash out</b> the banked multiplier or <b>fly on</b> for a longer pattern and a bigger multiplier.</li>' +
      '<li>Clear all 12 levels and the win is paid automatically.</li></ul>' +
      '<h3>Levels</h3><table class="ec-pt"><tr><th>Level</th><th>Pattern</th><th>Storm</th><th>Multiplier</th></tr>' + rows.join('') + '</table>' +
      '<h3>Fair for everyone</h3><p>Each multiplier is 96 divided by the chance of getting that far through the storms, rounded down. So <b>perfect memory returns at most 96% of your stakes, whatever you decide</b>, and every slip returns less. Skill decides how close to 96% you get; nobody can beat it. The pattern is only revealed when it is played, and every result is decided by the server.</p>' +
      '<p>Keys: <b>1</b> to <b>4</b> play the crystals, <b>Space</b> is the main button.</p><p>Batty Bucks are play money. They cannot be bought, sold or cashed out, and have no cash value.</p></div>';
  }

  function mount(root) {
    const S = B.scope(); G = { S };
    const el = {}; let st = 'idle', rs = null, round = 0, stake = 0, level = 1, taps = [], seq = [], bad = false, speedUp = false;
    const nap = (ms) => S.sleep(RM ? Math.min(ms, 120) : ms);
    const A = B.audio;
    const note = (i, d) => A.tone({ f: FREQ[i], d: d || 0.32, type: 'triangle', v: 0.16 });

    root.innerHTML = '';
    el.bg = h('div', { class: 'ec-bg', 'aria-hidden': 'true', html: cave() + '<div class="ec-storm"></div><div class="ec-flash"></div>' });
    el.title = h('div', { class: 'ec-title' }, h('b', null, 'Echo Chamber'), h('span', null, 'Repeat the pattern. Cash out before the storm.'));
    el.ladder = h('ol', { class: 'ec-ladder', 'aria-label': 'Levels' });
    for (let L = M.LEVELS; L >= 1; L--) el.ladder.append(h('li', { 'data-l': L }, h('b', null, 'L' + L), h('span', null, xs(M.MULT[L])), h('small', null, (100 - M.SURVIVE[L - 1]) + '% storm')));
    el.bat = h('div', { class: 'ec-bat', 'aria-hidden': 'true', html: B.batSvg ? B.batSvg() : '' });
    el.msg = h('div', { class: 'ec-msg', role: 'status', 'aria-live': 'polite' });
    el.dots = h('div', { class: 'ec-dots', 'aria-hidden': 'true' });
    el.pads = h('div', { class: 'ec-pads', role: 'group', 'aria-label': 'Crystals' });
    const pads = [0, 1, 2, 3].map((i) => {
      const b = h('button', { type: 'button', class: 'ec-pad', 'aria-label': 'Crystal ' + (i + 1), style: '--c:' + COL[i][0] + ';--c2:' + COL[i][1], html: crystal(i) + '<kbd>' + KEYS[i] + '</kbd>' });
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(i); });
      el.pads.append(b); return b;
    });
    el.stakeBox = h('div', { class: 'ec-stakebox' });
    el.win = h('output', null, '0'); el.bank = h('output', null, '0');
    el.info = h('div', { class: 'ec-info' }, h('span', { class: 'it' }, h('small', null, 'Banked'), el.bank), h('span', { class: 'it w' }, h('small', null, 'Last win'), el.win));
    el.main = h('button', { type: 'button', class: 'ec-main' });
    el.cash = h('button', { type: 'button', class: 'ec-cash', hidden: true });
    el.acts = h('div', { class: 'ec-acts' }, el.cash, el.main);
    el.bar = h('div', { class: 'ec-bar' }, el.stakeBox, el.info, el.acts);
    el.stage = h('div', { class: 'ec-stage' }, el.bat, el.msg, el.pads, el.dots);
    root.append(el.bg, el.title, h('div', { class: 'ec-main-area' }, el.ladder, el.stage), el.bar);
    const stakeCtl = B.ui.stake(el.stakeBox, { id: ID, label: 'Stake · BB' });

    const setMsg = (t, cls) => { el.msg.textContent = t; el.msg.className = 'ec-msg' + (cls ? ' ' + cls : ''); };
    const stormOf = (L) => 100 - M.SURVIVE[L - 1];
    function paintLadder(L, m) {
      [...el.ladder.children].forEach((li) => { const l = +li.dataset.l; li.className = l < L ? 'done' : l === L ? 'now' : ''; });
      const cur = el.ladder.querySelector('.now'); if (cur && cur.scrollIntoView && el.ladder.scrollWidth > el.ladder.clientWidth) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: RM ? 'auto' : 'smooth' });
      const frac = (L - 1) / (M.LEVELS - 1);
      el.bat.style.setProperty('--rise', String(frac));
      el.bg.style.setProperty('--storm', String(0.12 + 0.6 * frac));
      el.bank.textContent = m ? fmt(M.win(stake, m)) : '0';
    }
    function dots(n, done) { el.dots.innerHTML = ''; for (let i = 0; i < n; i++) el.dots.append(h('i', { class: i < done ? 'on' : '' })); }
    const lock = (on) => { pads.forEach((p) => { p.disabled = on; }); };
    function paintButtons() {
      el.cash.hidden = st !== 'decide';
      stakeCtl.disabled = st !== 'idle';
      if (st === 'idle') { el.main.textContent = 'Play'; el.main.disabled = false; el.main.className = 'ec-main go'; }
      else if (st === 'decide') {
        const m = rs.m, nl = level + 1;
        el.cash.innerHTML = '<small>Cash out</small><b>' + fmt(M.win(stake, m)) + ' BB</b><span>' + xs(m) + '</span>';
        el.main.innerHTML = '<small>Fly on · level ' + nl + '</small><b>' + xs(M.MULT[nl]) + '</b><span>' + M.len(nl) + ' notes · ' + stormOf(nl) + '% storm</span>';
        el.main.disabled = false; el.main.className = 'ec-main fly';
      } else { el.main.textContent = st === 'input' ? 'Your turn' : st === 'show' ? 'Listen…' : '…'; el.main.disabled = true; el.main.className = 'ec-main wait'; }
    }
    function flashPad(i, ms) { pads[i].classList.add('lit'); S.timeout(() => pads[i].classList.remove('lit'), ms); }
    async function playSeq() {
      st = 'show'; lock(true); paintButtons(); dots(seq.length, 0); setMsg('Listen…', '');
      const gap = Math.max(RM ? 120 : 230, 480 - 16 * level);
      await nap(520); if (!G) return;
      for (let k = 0; k < seq.length; k++) { flashPad(seq[k], gap * 0.7); note(seq[k], gap / 1000 * 0.9); await nap(gap); if (!G) return; }
      st = 'input'; taps = []; bad = false; lock(false); paintButtons(); dots(seq.length, 0);
      setMsg('Your turn: repeat the ' + seq.length + ' notes', 'gold');
    }
    async function tap(i) {
      if (st !== 'input' || !G) return;
      A.ensure(); flashPad(i, 160); note(i, 0.28);
      taps.push(i);
      if (i !== seq[taps.length - 1]) bad = true;
      dots(seq.length, taps.length);
      if (bad) { pads[i].classList.add('wrong'); S.timeout(() => pads[i].classList.remove('wrong'), 420); }
      if (taps.length === seq.length) submit();
      else if (bad) { /* keep taking taps so the player cannot tell where they slipped from the timing alone */ }
    }
    async function submit() {
      st = 'send'; lock(true); paintButtons(); setMsg('The echo travels…', '');
      let r;
      if (B.online) {
        r = await B.play(ID, 'input', { round, taps }, 0);
        if (!G) return;
        if (!r) { const sr = await B.play(ID, 'state', {}, 0); if (!G) return; if (sr && !sr.open) { end({ over: 'miss', win: 0, m: 0, expected: seq }); } else { st = 'input'; taps = []; lock(false); paintButtons(); dots(seq.length, 0); } return; }
      } else {
        const out = M.input(rs, taps, B.rng); const s = out.s;
        if (out.res === 'miss' || out.res === 'storm') r = { over: out.res, win: 0, m: 0, level, expected: out.res === 'miss' ? rs.seq : null };
        else if (out.res === 'top') r = { over: 'top', win: M.win(stake, s.m), m: s.m, level };
        else r = { cleared: s.L, m: s.m, level: s.L, phase: 'decide' };
        rs = s;
      }
      if (r.over) { await end(r); return; }
      /* cleared */
      rs = Object.assign({}, rs, { phase: 'decide', m: r.m });
      A.tone({ f: 523, f2: 784, d: 0.4, type: 'sine', v: 0.18 }); B.sfx('ding');
      const li = el.ladder.querySelector('[data-l="' + level + '"]'); if (li) li.classList.add('pop');
      const rect = el.bat.getBoundingClientRect(); B.fx.burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, kind: 'coin', count: 14 });
      st = 'decide'; paintLadder(level + 1, r.m); paintButtons();
      setMsg('Level ' + level + ' cleared. Bank ' + xs(r.m) + ' or fly on?', 'gold');
    }
    async function end(r) {
      st = 'over'; paintButtons();
      const w = r.win || 0;
      if (r.over === 'miss') {
        B.sfx('lose'); A.noise({ d: 0.5, v: 0.12, lp: 500 });
        if (r.expected) { /* show the right pattern so the player can learn it */ setMsg('Wrong note. It was ' + r.expected.map((n) => n + 1).join(' ') + '.', ''); }
        else setMsg('Wrong note.', '');
        el.bat.classList.add('fall');
      } else if (r.over === 'storm') {
        B.sfx('lose'); el.bg.classList.add('zap'); A.noise({ d: 0.9, v: 0.2, lp: 700 }); S.timeout(() => el.bg.classList.remove('zap'), 700);
        setMsg('Right notes, but the storm got the bat! Unlucky.', ''); el.bat.classList.add('fall');
      } else {
        el.win.textContent = fmt(w); B.sfx('coin');
        setMsg((r.over === 'top' ? 'All 12 levels! ' : 'Banked. ') + 'Paid ' + fmt(w) + ' BB', 'gold');
        if (r.over === 'top') B.fx.rain('coin', 1800);
      }
      if (w > 0) B.wallet.win(ID, w, { silent: true });
      if (r.over === 'miss' || r.over === 'storm') el.win.textContent = '0';
      B.wallet.sync();
      await nap(r.over === 'miss' || r.over === 'storm' ? 1700 : 900); if (!G) return;
      if (w >= stake * 10) { await B.ui.celebrate({ amount: w, bet: stake }); if (!G) return; }
      el.bat.classList.remove('fall'); el.ladder.querySelectorAll('.pop').forEach((n) => n.classList.remove('pop'));
      st = 'idle'; rs = null; level = 1; paintLadder(1, 0); dots(0, 0); lock(true); paintButtons();
    }
    async function begin() {
      if (st !== 'idle') return;
      const s0 = stakeCtl.value; A.ensure();
      if (!B.wallet.bet(ID, s0)) return B.ui.broke();
      stake = s0; el.win.textContent = '0'; level = 1;
      let r;
      if (B.online) {
        r = await B.play(ID, 'start', { stake: s0 }, s0);
        if (!G) return;
        if (!r) { B.wallet.sync(); return; }
        round = r.round; rs = { L: 1, seq: r.seq, phase: 'input', m: 0 };
      } else { rs = M.start(B.rng); round = 0; }
      seq = rs.seq; paintLadder(1, 0); playSeq();
    }
    async function fly() {
      if (st !== 'decide') return;
      B.sfx('click');
      let nxt;
      if (B.online) {
        const r = await B.play(ID, 'next', { round }, 0); if (!G) return;
        if (!r) return;
        nxt = { L: r.lvl, seq: r.seq, phase: 'input', m: rs.m };
      } else nxt = M.next(rs, B.rng);
      rs = nxt; level = rs.L; seq = rs.seq; paintLadder(level, rs.m ? 0 : 0);
      el.bank.textContent = fmt(M.win(stake, M.MULT[level - 1]));
      playSeq();
    }
    async function cash() {
      if (st !== 'decide') return;
      st = 'send'; paintButtons();
      let r;
      if (B.online) { r = await B.play(ID, 'cash', { round }, 0); if (!G) return; if (!r) { st = 'decide'; paintButtons(); return; } }
      else r = { over: 'cash', win: M.win(stake, rs.m), m: rs.m, level };
      await end(r);
    }
    el.main.addEventListener('click', () => { if (st === 'idle') begin(); else if (st === 'decide') fly(); });
    el.cash.addEventListener('click', cash);
    S.on(window, 'keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const k = KEYS.indexOf(e.key);
      if (k >= 0) { e.preventDefault(); tap(k); }
      else if (e.key === ' ' || e.key === 'Enter') { if (st === 'idle') { e.preventDefault(); begin(); } else if (st === 'decide') { e.preventDefault(); fly(); } }
      else if ((e.key === 'c' || e.key === 'C') && st === 'decide') cash();
    });

    /* a round left open (reload mid-game): pick it up where it was */
    paintLadder(1, 0); lock(true); paintButtons(); setMsg('Press Play. Repeat the pattern, then choose: cash out or fly on.', '');
    if (B.online) {
      B.play(ID, 'state', {}, 0).then((r) => {
        if (!G || !r || !r.open) return;
        const o = r.open; round = o.round; stake = o.stake; level = o.lvl; rs = { L: o.lvl, seq: o.seq || [], phase: o.phase, m: o.m };
        stakeCtl.value = stake;
        if (o.phase === 'decide') { st = 'decide'; paintLadder(level + 1, o.m); paintButtons(); setMsg('Level ' + level + ' cleared. Bank ' + xs(o.m) + ' or fly on?', 'gold'); }
        else { seq = o.seq; paintLadder(level, 0); el.bank.textContent = level > 1 ? fmt(M.win(stake, M.MULT[level - 1])) : '0'; playSeq(); }
      });
    }
    G.unmount = () => {};
  }

  B.registerGame({
    id: ID, name: 'Echo Chamber', tagline: 'A memory game. Repeat the pattern. Skill pays.', tag: 'Skill game', section: 'arcade', isNew: true,
    poster: poster(), rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S.dispose(); } G = null; },
  });
})();
