/* ===== mines math ===== */
/* Crypt Sweeper: pure maths (no DOM). Shared verbatim by the browser game (practice mode) and tools/mines-xcheck.js, and ported
   line for line to lib/games/mines.php (proved identical by tools/mines-xcheck.js on seeded rounds).
   A 5 x 5 floor hides `mines` skulls (1 to 24). The multiplier after k crystals is 96.5 / (the chance of surviving k flips),
   rounded DOWN to hundredths, in integers: floor(193 * C(25,k) / (2 * C(25-mines,k))). So the return is at most 96.5% whenever
   you stop, with any number of skulls. A round that would pay more than MAX_X times the stake is paid at the cap and ends. */
(function (root, factory) { const M = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = M; (root.BattyMath = root.BattyMath || {}).mines = M; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TILES = 25, MAX_MINES = 24, MAX_X = 10000;
  function choose(n, k) { if (k < 0 || k > n) return 0; let r = 1; k = Math.min(k, n - k); for (let i = 1; i <= k; i++) r = Math.floor(r * (n - k + i) / i); return r; }
  /* multiplier in hundredths after k crystals with `mines` skulls, capped at MAX_X */
  function mult(mines, k) {
    if (k <= 0) return 0;
    const c = choose(TILES - mines, k);
    if (c === 0) return MAX_X * 100;
    return Math.min(MAX_X * 100, Math.floor(193 * choose(TILES, k) / (2 * c)));
  }
  const win = (stake, m100) => Math.floor(stake * m100 / 100);
  /* the skull positions: a partial Fisher-Yates shuffle of the 25 tiles, sorted */
  function place(rng, mines) {
    const a = []; for (let i = 0; i < TILES; i++) a.push(i);
    for (let i = 0; i < mines; i++) { let j = i + Math.floor(rng() * (TILES - i)); if (j >= TILES) j = TILES - 1; const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, mines).sort((x, y) => x - y);
  }
  const done = (mines, k) => k >= TILES - mines || mult(mines, k) >= MAX_X * 100;
  /* the best return of "stop after k crystals" over every k and every number of skulls (always at most 0.965) */
  function bestReturn() {
    let best = 0;
    for (let m = 1; m <= MAX_MINES; m++) for (let k = 1; k <= TILES - m; k++) {
      if (mult(m, k) >= MAX_X * 100) break;
      let p = 1; for (let i = 0; i < k; i++) p *= (TILES - m - i) / (TILES - i);
      best = Math.max(best, p * mult(m, k) / 100);
    }
    return best;
  }
  return { TILES, MAX_MINES, MAX_X, choose, mult, win, place, done, bestReturn };
});
/* ===== mines ===== */
(function () {
  'use strict';
  const B = Batty, h = B.h, fmt = B.fmt, M = BattyMath.mines, ID = 'mines';
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const GEM = [['#5eead4', '#0f766e'], ['#ff6fb5', '#9d174d'], ['#ffd451', '#a16207'], ['#a78bfa', '#5b21b6'], ['#86efac', '#166534']];
  const xs = (m) => (m >= 1000000 ? Math.round(m / 100).toLocaleString('en-GB') : (m / 100).toFixed(2)) + '×';
  const PENTA = [0, 2, 4, 7, 9];
  let G = null;

  const gemSvg = (i) => { const c = GEM[i % GEM.length]; return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mg' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs><path d="M32 6 54 24 32 58 10 24Z" fill="url(#mg' + i + ')" stroke="rgba(0,0,0,.4)" stroke-width="2" stroke-linejoin="round"/><path d="M10 24h44M22 24 32 6l10 18M22 24l10 34 10-34" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6" stroke-linejoin="round"/></svg>'; };
  const skullSvg = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6C18 6 9 16 9 28c0 8 4 13 9 16v8h8v-5h4v5h4v-5h4v5h8v-8c5-3 9-8 9-16C55 16 46 6 32 6Z" fill="#f4eeff" stroke="#1a0b2e" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="22" cy="28" rx="6.5" ry="7.5" fill="#1a0b2e"/><ellipse cx="42" cy="28" rx="6.5" ry="7.5" fill="#1a0b2e"/><circle cx="22" cy="28" r="2.4" fill="#ff3d5a"/><circle cx="42" cy="28" r="2.4" fill="#ff3d5a"/><path d="M29 40l3-5 3 5Z" fill="#1a0b2e"/></svg>';
  const rune = (i) => ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ', 'ᚪ'][i];
  function bg() {
    let e = ''; for (let i = 0; i < 14; i++) e += '<i style="--x:' + (4 + (i * 7.3) % 92).toFixed(1) + '%;--d:' + (7 + (i * 1.7) % 8).toFixed(1) + 's;--l:-' + (i * 1.3).toFixed(1) + 's;--s:' + (3 + (i % 4) * 1.5) + 'px"></i>';
    return '<div class="mn-embers">' + e + '</div>';
  }
  function poster() {
    let t = ''; for (let i = 0; i < 25; i++) { const x = 20 + (i % 5) * 52, y = 56 + Math.floor(i / 5) * 52; t += '<rect x="' + x + '" y="' + y + '" width="46" height="46" rx="8" fill="#2a1a45" stroke="#4b3070" stroke-width="2"/>'; if ([2, 6, 8, 12, 16, 18, 22].includes(i)) t += '<g transform="translate(' + (x + 8) + ' ' + (y + 8) + ') scale(.47)">' + gemSvg(i) + '</g>'; }
    return '<svg viewBox="0 0 300 380" role="img" aria-label="Crypt Sweeper"><defs><linearGradient id="mnp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0618"/><stop offset="1" stop-color="#3a1450"/></linearGradient></defs><rect width="300" height="380" fill="url(#mnp)"/>' + t +
      '<g transform="translate(124 124) scale(.9)">' + skullSvg + '</g><text x="150" y="338" text-anchor="middle" font-family="Titan One,Arial Black,sans-serif" font-size="32" fill="#ffd451" stroke="#1a0b2e" stroke-width="3" paint-order="stroke">CRYPT SWEEPER</text><text x="150" y="362" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="800" font-size="10" letter-spacing="3" fill="#cdbbff">FLIP CRYSTALS. DODGE SKULLS.</text></svg>';
  }
  function rules() {
    const rows = [1, 3, 5, 10, 24].map((m) => '<tr><td>' + m + '</td>' + [1, 2, 3, 5].map((k) => '<td>' + (k <= M.TILES - m ? xs(M.mult(m, k)) : '–') + '</td>').join('') + '</tr>').join('');
    return '<div class="mn-rules"><p><b>Crypt Sweeper</b>: the crypt floor is 25 slabs. Under each is a crystal, except for the skulls you chose to risk (1 to 24).</p>' +
      '<ul><li>Pick a stake and how many skulls, then press <b>Play</b>.</li><li>Flip a slab. A crystal raises your multiplier. A skull ends the round.</li><li>Cash out whenever you like. Find every crystal and it pays automatically.</li>' +
      '<li>More skulls means a bigger multiplier per crystal, but fewer flips before disaster. You choose your own risk.</li><li>A round that reaches ' + M.MAX_X.toLocaleString('en-GB') + '× is paid at that cap and ends.</li></ul>' +
      '<h3>Multipliers</h3><table class="mn-pt"><tr><th>Skulls</th><th>1 crystal</th><th>2</th><th>3</th><th>5</th></tr>' + rows + '</table>' +
      '<h3>Fair for everyone</h3><p>Each multiplier is 96.5 divided by the chance of getting that far, rounded down. So <b>whenever you stop, the expected return is at most 96.5%</b>, however many skulls you pick. The skull positions are chosen by the server when the round starts and stay hidden until it ends.</p>' +
      '<p>Keys: <b>Space</b> plays or cashes out, <b>R</b> flips a random slab.</p><p>Batty Bucks are play money. They cannot be bought, sold or cashed out, and have no cash value.</p></div>';
  }

  function mount(root) {
    const S = B.scope(); G = { S };
    const A = B.audio, el = {}, tiles = [];
    let st = 'idle', round = 0, stake = 0, mines = 3, picked = [], local = null, busy = false;
    try { const m = +localStorage.getItem('batty-mines-n'); if (m >= 1 && m <= 24) mines = m; } catch (e) { /* fine */ }
    const nap = (ms) => S.sleep(RM ? Math.min(ms, 60) : ms);
    const note = (k) => { const s = PENTA[k % 5] + 12 * Math.floor(k / 5); A.tone({ f: 330 * Math.pow(2, Math.min(s, 36) / 12), d: 0.28, type: 'triangle', v: 0.16 }); A.tone({ f: 660 * Math.pow(2, Math.min(s, 36) / 12), d: 0.16, type: 'sine', v: 0.06, t: 0.04 }); };

    root.innerHTML = '';
    el.bg = h('div', { class: 'mn-bg', 'aria-hidden': 'true', html: bg() + '<div class="mn-flash"></div>' });
    el.title = h('div', { class: 'mn-title' }, h('b', null, 'Crypt Sweeper'), h('span', null, 'Flip crystals. Dodge skulls. Cash out any time.'));
    el.grid = h('div', { class: 'mn-grid', role: 'grid', 'aria-label': 'Crypt floor' });
    for (let i = 0; i < M.TILES; i++) {
      const t = h('button', { type: 'button', class: 'mn-tile', 'aria-label': 'Slab ' + (i + 1), disabled: true },
        h('span', { class: 'in' }, h('span', { class: 'front' }, h('i', null, rune(i))), h('span', { class: 'back' })));
      t.addEventListener('click', () => flip(i));
      tiles.push(t); el.grid.append(t);
    }
    el.board = h('div', { class: 'mn-board' }, el.grid, h('div', { class: 'mn-banner', hidden: true }));
    el.banner = el.board.lastChild;
    /* side panel */
    el.stakeBox = h('div', { class: 'mn-stakebox' });
    el.minesVal = h('output', null, String(mines));
    el.minesRange = h('input', { type: 'range', min: '1', max: '24', value: String(mines), 'aria-label': 'Number of skulls' });
    const quick = [1, 3, 5, 10, 24].map((n) => { const b = h('button', { type: 'button', class: 'q' }, String(n)); b.onclick = () => setMines(n); return b; });
    el.minesMinus = h('button', { type: 'button', 'aria-label': 'Fewer skulls' }, '−'); el.minesPlus = h('button', { type: 'button', 'aria-label': 'More skulls' }, '+');
    el.minesMinus.onclick = () => setMines(mines - 1); el.minesPlus.onclick = () => setMines(mines + 1);
    el.minesRange.oninput = () => setMines(+el.minesRange.value);
    el.minesBox = h('div', { class: 'mn-minesbox' }, h('small', null, 'Skulls'), h('div', { class: 'mn-mrow' }, el.minesMinus, el.minesVal, el.minesPlus), el.minesRange, h('div', { class: 'mn-quick' }, quick));
    el.gems = h('output', null, '0'); el.mult = h('output', null, '1.00×'); el.profit = h('output', null, '0');
    el.stats = h('div', { class: 'mn-stats' }, h('span', null, h('small', null, 'Crystals'), el.gems), h('span', null, h('small', null, 'Multiplier'), el.mult), h('span', null, h('small', null, 'Profit'), el.profit));
    el.next = h('div', { class: 'mn-next', 'aria-label': 'Upcoming multipliers' });
    el.main = h('button', { type: 'button', class: 'mn-main go' }, 'Play');
    el.rand = h('button', { type: 'button', class: 'mn-rand', hidden: true }, 'Flip a random slab');
    el.side = h('div', { class: 'mn-side' }, el.stakeBox, el.minesBox, el.stats, el.next, el.main, el.rand);
    root.append(el.bg, el.title, h('div', { class: 'mn-layout' }, el.side, el.board));
    const stakeCtl = B.ui.stake(el.stakeBox, { id: ID, label: 'Stake · BB' });

    function setMines(n) { if (st === 'playing' || busy) return; mines = Math.max(1, Math.min(24, n)); el.minesVal.textContent = String(mines); el.minesRange.value = String(mines); try { localStorage.setItem('batty-mines-n', String(mines)); } catch (e) { /* fine */ } paintNext(); }
    function paintNext() {
      const k = picked.length; el.next.innerHTML = '';
      const left = M.TILES - mines - k;
      for (let i = 1; i <= Math.min(4, left); i++) { if (k + i > M.TILES - mines) break; const m = M.mult(mines, k + i); el.next.append(h('i', { class: i === 1 ? 'n1' : '' }, h('small', null, '+' + i), xs(m))); if (M.done(mines, k + i)) break; }
    }
    function paintStats() {
      const k = picked.length, m = M.mult(mines, k);
      el.gems.textContent = k + ' / ' + (M.TILES - mines); el.mult.textContent = k ? xs(m) : '1.00×';
      el.profit.textContent = k ? (M.win(stake, m) - stake >= 0 ? '+' : '') + fmt(M.win(stake, m) - stake) : '0';
      el.profit.className = k && M.win(stake, m) > stake ? 'up' : '';
      paintNext();
    }
    function paintButtons() {
      const playing = st === 'playing';
      stakeCtl.disabled = playing || busy; el.minesMinus.disabled = el.minesPlus.disabled = el.minesRange.disabled = playing || busy;
      el.grid.classList.toggle('live', playing);
      tiles.forEach((t, i) => { t.disabled = !playing || busy || picked.includes(i); });
      el.rand.hidden = !playing;
      if (playing) {
        const k = picked.length;
        el.main.className = 'mn-main cash'; el.main.disabled = busy || k < 1;
        el.main.innerHTML = k ? '<small>Cash out</small><b>' + fmt(M.win(stake, M.mult(mines, k))) + ' BB</b>' : '<small>Flip a slab</small><b>to start</b>';
      } else { el.main.className = 'mn-main go'; el.main.disabled = busy; el.main.textContent = st === 'over' ? 'Play again' : 'Play'; }
    }
    const rectOf = (n) => n.getBoundingClientRect();
    function showFace(i, kind, dim, k) {
      const t = tiles[i], back = t.querySelector('.back');
      back.className = 'back ' + kind + (dim ? ' dim' : '');
      back.innerHTML = kind === 'gem' ? gemSvg(i) : skullSvg;
      t.classList.add('open');
    }
    async function begin() {
      if (busy || st === 'playing') return;
      const s0 = stakeCtl.value; A.ensure();
      if (!B.wallet.bet(ID, s0)) return B.ui.broke();
      busy = true; paintButtons();
      stake = s0; picked = []; el.banner.hidden = true;
      tiles.forEach((t) => { t.classList.remove('open', 'boom'); t.querySelector('.back').className = 'back'; t.querySelector('.back').innerHTML = ''; });
      let r;
      if (B.online) {
        r = await B.play(ID, 'start', { stake: s0, mines }, s0);
        if (!G) return;
        if (!r) { busy = false; B.wallet.sync(); paintButtons(); return; }
        round = r.round;
      } else { local = { mine: M.place(B.rng, mines), picked: [] }; round = 0; }
      st = 'playing'; busy = false; B.sfx('click'); A.tone({ f: 220, f2: 440, d: 0.25, type: 'sine', v: 0.1 });
      paintStats(); paintButtons();
    }
    async function flip(i) {
      if (st !== 'playing' || busy || picked.includes(i)) return;
      busy = true; paintButtons(); A.ensure();
      let r;
      if (B.online) { r = await B.play(ID, 'reveal', { round, tile: i }, 0); if (!G) return; if (!r) { busy = false; paintButtons(); return; } }
      else if (local.mine.includes(i)) r = { over: 'bomb', win: 0, tile: i, mineAt: local.mine };
      else { local.picked.push(i); const k = local.picked.length; r = M.done(mines, k) ? { over: 'clear', win: M.win(stake, M.mult(mines, k)), tile: i, mineAt: local.mine } : { safe: true, tile: i, k, m: M.mult(mines, k) }; }
      if (r.over === 'bomb') { await boom(i, r); return; }
      picked.push(i); showFace(i, 'gem', false); note(picked.length - 1);
      const rc = rectOf(tiles[i]); B.fx.burst({ x: rc.left + rc.width / 2, y: rc.top + rc.height / 2, kind: 'coin', count: 8 + Math.min(14, picked.length * 2) });
      el.mult.classList.remove('pop'); void el.mult.offsetWidth; el.mult.classList.add('pop');
      paintStats();
      if (r.over === 'clear') { await end(r, true); return; }
      busy = false; paintButtons();
    }
    async function boom(i, r) {
      showFace(i, 'skull', false); tiles[i].classList.add('boom');
      B.sfx('lose'); A.noise({ d: 0.7, v: 0.22, lp: 900 }); A.tone({ f: 120, f2: 40, d: 0.6, type: 'sawtooth', v: 0.18 });
      el.bg.classList.add('zap'); S.timeout(() => el.bg.classList.remove('zap'), 650);
      el.board.classList.add('shake'); S.timeout(() => el.board.classList.remove('shake'), 500);
      await nap(450); if (!G) return;
      await reveal(r.mineAt, i);
      await end(r, false);
    }
    async function reveal(mineAt, except) {
      for (let i = 0; i < M.TILES; i++) {
        if (tiles[i].classList.contains('open')) continue;
        showFace(i, mineAt && mineAt.includes(i) ? 'skull' : 'gem', true);
        if (!RM) await nap(28); if (!G) return;
      }
    }
    async function end(r, clear) {
      st = 'over'; busy = true; paintButtons();
      const w = r.win || 0;
      if (r.over !== 'bomb') await reveal(r.mineAt);
      if (!G) return;
      if (w > 0) {
        B.wallet.win(ID, w, { silent: true }); B.sfx('coin');
        el.banner.hidden = false; el.banner.className = 'mn-banner win'; el.banner.innerHTML = '<small>' + (clear ? 'Crypt cleared!' : 'Cashed out') + '</small><b>' + fmt(w) + ' BB</b><span>' + xs(r.m || M.mult(mines, picked.length)) + '</span>';
        if (clear && B.fx.rain) B.fx.rain('coin', 1800);
      } else { el.banner.hidden = false; el.banner.className = 'mn-banner lose'; el.banner.innerHTML = '<small>Skull!</small><b>Round over</b><span>Try again</span>'; }
      B.wallet.sync();
      await nap(w > 0 ? 900 : 600); if (!G) return;
      if (w >= stake * 10) { await B.ui.celebrate({ amount: w, bet: stake }); if (!G) return; }
      busy = false; paintButtons();
    }
    async function cash() {
      if (st !== 'playing' || busy || picked.length < 1) return;
      busy = true; paintButtons(); B.sfx('click');
      let r;
      if (B.online) { r = await B.play(ID, 'cash', { round }, 0); if (!G) return; if (!r) { busy = false; paintButtons(); return; } }
      else r = { over: 'cash', win: M.win(stake, M.mult(mines, picked.length)), m: M.mult(mines, picked.length), mineAt: local.mine };
      await end(r, false);
    }
    function randomTile() { const free = []; for (let i = 0; i < M.TILES; i++) if (!picked.includes(i)) free.push(i); if (free.length) flip(free[Math.floor(Math.random() * free.length)]); }
    el.main.onclick = () => { if (st === 'playing') cash(); else begin(); };
    el.rand.onclick = randomTile;
    S.on(window, 'keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (st === 'playing') cash(); else begin(); }
      else if ((e.key === 'r' || e.key === 'R') && st === 'playing') randomTile();
    });
    paintStats(); paintButtons();
    if (B.online) {
      B.play(ID, 'state', {}, 0).then((r) => {
        if (!G || !r || !r.open) return;
        const o = r.open; round = o.round; stake = o.stake; mines = o.mines; picked = o.picked.slice(); el.minesVal.textContent = String(mines); el.minesRange.value = String(mines);
        stakeCtl.value = stake; picked.forEach((i, n) => showFace(i, 'gem', false)); st = 'playing'; paintStats(); paintButtons();
      });
    }
    G.unmount = () => {};
  }

  B.registerGame({
    id: ID, name: 'Crypt Sweeper', tagline: 'Flip crystals. Dodge skulls. Cash out any time.', tag: 'Arcade game', section: 'arcade', isNew: true,
    poster: poster(), rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S.dispose(); } G = null; },
  });
})();
