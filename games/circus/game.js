/* ===== circus ===== */
/* Batty Circus: the big top. Presentation only: every outcome comes from the round state machine in math.js (practice
   mode runs it here, online mode asks lib/games/circus.php, which runs the same code). The player's choices are sent
   to the server and resolved there after the choice, so nothing hidden is ever in the browser.
   Layout: .cz-bg (tent, crowd, beams) | .cz-curtain | .cz-main = top strip, HUD, stage box (reels + scene overlay), controls. */
(function () {
  'use strict';
  const B = Batty, h = B.h, M = BattyMath.circus, A = BattyCircusArt, ID = 'circus';
  const U = M.U, fmt = B.fmt, ROWS = 4, REELS = 5, CELLN = 6, STEP = 100 / CELLN;
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ACT_SHORT = ['Strongman', 'Bear Tightrope', 'Fire Breather', 'Jester Spins', 'Elephant Spins'];
  const ACT_DESC = ['Pick a weight and lift', 'Steer the bear, catch treasure', 'Light the torches', 'Pick a box for free spins', 'Free spins with a growing multiplier'];
  const DEV = (() => { try { return localStorage.getItem('batty-dev') === '1'; } catch (e) { return false; } })();
  const uid = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let G = null; // the mounted game

  /* ---------- sound: calliope, drums, crowd, all synthesised ---------- */
  const au = B.audio;
  const SND = {
    spin() { au.noise({ d: 0.5, v: 0.07, lp: 700, f2: 2600 }); },
    stop(i) { au.tone({ f: 150 + i * 14, f2: 70, d: 0.12, type: 'sine', v: 0.3 }); au.noise({ d: 0.05, v: 0.06, lp: 2200 }); },
    win(n) { au.seq(n > 2 ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784], { step: 0.07, type: 'triangle', v: 0.17 }); },
    antic(k) { au.tone({ f: 260 + k * 150, f2: 420 + k * 170, d: 0.55, type: 'sawtooth', v: 0.045 }); },
    boom() { au.noise({ d: 0.9, v: 0.4, lp: 900, f2: 60 }); au.tone({ f: 90, f2: 30, d: 0.8, type: 'sine', v: 0.4 }); },
    whistle() { au.tone({ f: 1900, f2: 520, d: 1.3, type: 'sine', v: 0.07 }); },
    fuse() { au.noise({ d: 0.9, v: 0.05, hp: 3000 }); },
    drum() { for (let i = 0; i < 12; i++) au.tone({ f: 130, f2: 90, d: 0.06, type: 'triangle', v: 0.2, t: i * 0.07 }); },
    cheer() { au.noise({ d: 1.1, v: 0.11, hp: 700, f2: 3200 }); },
    calliope() { au.seq([392, 523, 659, 523, 784, 659, 784, 1047], { step: 0.09, type: 'square', v: 0.07 }); },
    snap() { au.noise({ d: 0.15, v: 0.3, hp: 1200 }); au.tone({ f: 300, f2: 60, d: 0.3, type: 'sawtooth', v: 0.1 }); },
    clang() { au.tone({ f: 220, d: 0.6, type: 'square', v: 0.1 }); au.tone({ f: 331, d: 0.5, type: 'triangle', v: 0.1 }); },
    flame() { au.noise({ d: 0.6, v: 0.2, lp: 500, f2: 3500 }); },
    lift() { au.tone({ f: 110, f2: 210, d: 0.5, type: 'sawtooth', v: 0.07 }); },
    thud() { au.tone({ f: 120, f2: 40, d: 0.3, type: 'sine', v: 0.4 }); },
    coin() { B.sfx('coin'); },
    pop() { B.sfx('pop'); },
    bonus() { B.sfx('bonus'); },
    click() { B.sfx('click'); },
    tick() { au.tone({ f: 1500, d: 0.02, type: 'square', v: 0.04 }); },
  };
  const snd = (n, a) => { try { SND[n](a); } catch (e) { /* sound is optional */ } };

  /* ---------- symbol html caches ---------- */
  const REST = [], BLUR = [];
  function prepSyms() { if (REST.length) return; for (let i = 0; i <= 10; i++) { REST[i] = A.symSvg(i); BLUR[i] = '<img class="cz-blur" alt="" draggable="false" src="' + A.symBlur(i) + '">'; } }
  const strip0 = M.STRIPS.base[1];
  const rndSym = () => strip0[(Math.random() * strip0.length) | 0];

  /* ---------- rules ---------- */
  function rules() {
    const pay = M.PAY, nm = M.NAMES;
    const lines = M.LINES.map((l, i) => '<svg viewBox="0 0 100 80" aria-label="Line ' + (i + 1) + '"><rect width="100" height="80" rx="6" fill="#3a1226"/><polyline points="' + l.map((r, c) => (10 + c * 20) + ',' + (10 + r * 20)).join(' ') + '" fill="none" stroke="#ffcf7a" stroke-width="3.5" stroke-linejoin="round"/><text x="5" y="77" fill="#fff" font-size="10">' + (i + 1) + '</text></svg>').join('');
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => '<tr><td>' + nm[i] + '</td>' + pay[i].map((x) => '<td>' + (x / U) + '×</td>').join('') + '</tr>').join('');
    const buy = M.BUYS;
    return '<div class="cz-rules">' +
      '<p><b>Batty Circus</b> is an original Batty Bucks game in the spirit of the classic cannon-and-acts circus slot. Every character, picture and number here is our own. Batty Bucks have no cash value.</p>' +
      '<h3>The reels</h3><p>5 reels, 4 rows and 40 fixed lines, all included in the stake. Three or more matching symbols in a row from reel 1 pay, and only the best win on each line counts. The <b>Ringmaster</b> is wild and stands in for every pay symbol (five Ringmasters pay as Elephants). Line wins are shown as multiples of your total stake.</p>' +
      '<h3>The Cannon Bonus</h3><p>Land a <b>Cannonball Bat</b> on reels 1, 3 <i>and</i> 5 in the same spin. The performer is fired at the target board: five cash prizes (10×, 15×, 20×, 30× and 50× your stake), each of the five acts on its own, five two-act combinations, and the bullseye, which plays three acts. After the first shot you can <b>COLLECT</b> it, or <b>RETRY</b> once: a fresh independent shot that you must keep, which may be worse. The panel shows the average value of what you hold against the average of a fresh shot. Acts are played one after another.</p>' +
      '<h3>The five acts</h3><ul>' +
      '<li><b>Strongman.</b> Eight lifts. Pick light, medium or heavy: heavier is less likely to lift and pays more, and the odds and the prize for each are shown before you choose. A lift pays and moves you up a level; a dropped weight ends the act. Up to 8 lifts.</li>' +
      '<li><b>Bear Tightrope.</b> Up to ' + M.BEAR_DROPS + ' drops. Steer the bear to a lane; one item falls in each lane after you choose. Catch treasure and keep going. Catch the anvil and the rope snaps.</li>' +
      '<li><b>Fire Breather.</b> Up to ' + M.FIRE_TORCHES + ' torches. Each blast reveals a prize, until the fire goes out. The first torch always pays.</li>' +
      '<li><b>Jester Spins.</b> Pick one of three boxes for 5 to 12 free spins. On each spin jack-in-the-boxes spring onto the reels and turn cells wild, and some explode and turn the cells around them wild too.</li>' +
      '<li><b>Elephant Spins.</b> ' + M.EL_SPINS.join(', ') + ' free spins at ×' + M.EL_START + '. Every Elephant that lands adds +1 to the multiplier on that spin, and it carries on growing. Three Cannonball Bats add ' + M.EL_RETRIG + ' more spins.</li></ul>' +
      '<p>The whole round, base game and bonus together, is capped at <b>' + fmt(M.MAX_X) + '× your stake</b>; the round ends the moment it is reached.</p>' +
      '<h3>Bonus buys</h3><p>Batty Bucks only, no cash value, no guaranteed return. <b>GRAND CANNON</b> costs ' + buy.grand + '× your stake and guarantees a cannon shot that lands on an act or combination (never a cash prize). <b>SPOTLIGHT SHOW</b> costs ' + buy.spotlight + '× and sends the performer straight to the bullseye: three acts. A bought round has no base-game line win. The server works out the price; wins can be less than the cost.</p>' +
      '<h3>Paytable</h3><p>Multiples of your <b>total stake</b>, per winning line, for 3, 4 and 5 in a row.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>' + rows + '</table>' +
      '<details><summary>View all 40 paylines</summary><div class="cz-lines">' + lines + '</div></details>' +
      '<div class="rtp"><b>Tested return</b> <span class="cz-rtp">about 96% (base game and each buy; see the figures from the 10,000,000-spin simulation in the release notes)</span>. Rounds are drawn on the server with a secure random generator and settle once. Space spins; a tap or Space during a spin stops the reels at once.</div>' +
      '<p>Batty Bucks are play money. They cannot be bought, sold or cashed out.</p></div>';
  }

  /* ---------- the mounted game ---------- */
  function mount(root) {
    prepSyms();
    const S = B.scope();
    G = { S };
    const el = {};
    let stakeCtl, reels = [], busy = false, spinning = false, auto = 0, turbo = false, skip = false, unit = 0, curStake = 0;
    let cycleTok = 0, primary = null, introduced = new Set(), roundCost = 0;
    const T = (ms) => ms * (skip ? 0.18 : turbo ? 0.55 : 1);
    const nap = (ms) => S.sleep(Math.max(16, T(ms)));
    const setMsg = (t, cls) => { el.msg.textContent = t; el.msg.className = 'cz-msg' + (cls ? ' ' + cls : ''); };

    /* ----- build the world ----- */
    root.classList.add('cz');
    root.innerHTML = A.DEFS;
    el.bg = h('div', { class: 'cz-bg', 'aria-hidden': 'true', html: A.bigTop(1600, 900) + '<div class="cz-beams"><i></i><i></i><i></i></div>' + A.crowd(1600, 3) });
    el.curL = h('div', { class: 'cz-curtain l', 'aria-hidden': 'true', html: A.curtain('l') });
    el.curR = h('div', { class: 'cz-curtain r', 'aria-hidden': 'true', html: A.curtain('r') });
    el.val = h('div', { class: 'cz-val', 'aria-hidden': 'true', html: A.valance() });
    el.ring = h('div', { class: 'cz-ring', 'aria-hidden': 'true', html: '<svg viewBox="-110 -320 220 330">' + A.ringmaster() + '</svg>' });
    el.title = h('div', { class: 'cz-title' }, h('b', null, 'BATTY CIRCUS'), h('span', null, '40 lines · up to ' + fmt(M.MAX_X) + '× stake'));
    /* the reels */
    el.reels = h('div', { class: 'cz-reels' });
    for (let i = 0; i < REELS; i++) {
      const strip = h('div', { class: 'cz-strip' }), reel = h('div', { class: 'cz-reel' }, strip);
      const r = { i, el: reel, strip, off: 0, mode: 'idle', queue: null, stopAt: 0, v: 0, t: 0, antic: false };
      for (let k = 0; k < CELLN; k++) { const c = h('div', { class: 'cz-cell' }); c.innerHTML = REST[rndSym()]; strip.append(c); }
      reels.push(r); el.reels.append(reel);
    }
    el.lines = h('div', { class: 'cz-lines-layer', 'aria-hidden': 'true' });
    el.banner = h('div', { class: 'cz-banner', hidden: true, 'aria-hidden': 'true' });
    el.frame = h('div', { class: 'cz-frame' }, el.reels, el.lines, el.banner, h('i', { class: 'cz-fb t' }), h('i', { class: 'cz-fb b' }));
    el.mid = h('div', { class: 'cz-mid' }, el.frame);
    el.scene = h('div', { class: 'cz-scene', hidden: true }, el.sceneBody = h('div', { class: 'cz-sc-body' }), el.sceneUi = h('div', { class: 'cz-sc-ui' }));
    el.box = h('div', { class: 'cz-box' }, el.ring, el.mid, el.scene);
    /* HUD for the bonus */
    el.chips = h('div', { class: 'cz-chips' }, ...M.ACTS.map((a, i) => h('div', { class: 'cz-chip', 'data-a': i, title: ACT_SHORT[i], html: A.actIcon(i) })));
    el.hudTotal = h('output', null, '0');
    el.hudInfo = h('div', { class: 'cz-hud-info' });
    el.skipBtn = h('button', { class: 'cz-skip', type: 'button', onclick: () => { skip = true; snd('click'); el.skipBtn.hidden = true; }, 'aria-label': 'Fast forward' }, 'SKIP ▸▸');
    el.hud = h('div', { class: 'cz-hud', hidden: true }, el.chips, h('div', { class: 'cz-hud-mid' }, h('small', null, 'SHOW TOTAL'), el.hudTotal), h('div', { class: 'cz-hud-r' }, el.hudInfo, el.skipBtn));
    /* controls */
    el.msg = h('div', { class: 'cz-msg', role: 'status', 'aria-live': 'polite' }, 'Land a Cannonball Bat on reels 1, 3 and 5 to fire the cannon.');
    el.win = h('output', null, '0');
    el.winbox = h('div', { class: 'cz-winbox' }, h('small', null, 'WIN'), el.win);
    el.stakeBox = h('div', { class: 'cz-stakebox' });
    el.spin = h('button', { class: 'cz-spin', type: 'button', 'aria-label': 'Spin', id: 'cz-spin', onclick: () => onSpin(), html: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8a16 16 0 1 1-11.3 4.7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M8 6v10h10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    el.buy = h('button', { class: 'cz-btn gold', type: 'button', id: 'cz-buy', onclick: () => openBuy() }, h('small', null, 'BUY'), 'BONUS');
    el.turbo = h('button', { class: 'cz-btn', type: 'button', id: 'cz-turbo', 'aria-pressed': 'false', onclick: () => { turbo = !turbo; el.turbo.setAttribute('aria-pressed', turbo); el.turbo.classList.toggle('on', turbo); snd('click'); } }, h('small', null, 'TURBO'), 'OFF');
    el.auto = h('button', { class: 'cz-btn', type: 'button', id: 'cz-auto', onclick: () => onAuto() }, h('small', null, 'AUTO'), 'OFF');
    el.autoMenu = h('div', { class: 'cz-automenu', hidden: true }, ...[10, 25, 50, 100].map((n) => h('button', { type: 'button', onclick: () => { el.autoMenu.hidden = true; startAuto(n); } }, String(n))));
    el.ctl = h('div', { class: 'cz-ctl' }, el.stakeBox, el.buy, el.winbox, el.spin, el.turbo, h('div', { class: 'cz-autowrap' }, el.auto, el.autoMenu));
    el.ov = h('div', { class: 'cz-ov', hidden: true });
    el.main = h('div', { class: 'cz-main' }, el.title, el.hud, el.box, el.msg, el.ctl);
    root.append(el.bg, el.main, el.curL, el.curR, el.val, el.ov);
    stakeCtl = B.ui.stake(el.stakeBox, { id: ID, label: 'Stake · BB' });
    const paintAuto = () => { const e = el.auto; e.lastChild.textContent = auto > 0 ? String(auto) : (auto === -1 ? '∞' : 'OFF'); e.classList.toggle('on', auto !== 0); };
    requestAnimationFrame(() => root.classList.add('open'));
    S.timeout(() => snd('calliope'), 500);

    /* ----- keyboard ----- */
    S.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (document.querySelector('.bc-veil, .bc-win')) return;
      e.preventDefault(); if (e.repeat) return;
      if (primary) primary(); else onSpin();
    });

    /* ===================== reels ===================== */
    const cellAt = (c, row) => reels[c].strip.children[row + 1];
    const setStrip = (r) => { r.strip.style.transform = 'translate3d(0,' + ((r.off - 1) * STEP).toFixed(3) + '%,0)'; };
    function shift(r) {
      const c = r.strip.lastElementChild; r.strip.prepend(c);
      if (r.mode === 'stopping') {
        const s = r.queue.shift(); c.innerHTML = REST[s];
        if (!r.queue.length) landed(r);
      } else c.innerHTML = RM ? REST[rndSym()] : BLUR[rndSym()];
    }
    function landed(r) {
      r.mode = 'settle'; r.off = 0; setStrip(r); r.el.classList.remove('spinning', 'antic');
      snd('stop', r.i);
      if (!RM) r.strip.animate([{ transform: 'translate3d(0,' + (-STEP * 0.83).toFixed(3) + '%,0)' }, { transform: 'translate3d(0,' + (-STEP).toFixed(3) + '%,0)' }], { duration: T(340), easing: 'cubic-bezier(.22,1.7,.45,1)' });
      r.el.classList.add('thud'); S.timeout(() => r.el.classList.remove('thud'), 260);
      const reelBonus = r.fin && r.fin.indexOf(M.BON) >= 0;
      if (reelBonus) { r.el.classList.add('bon'); S.timeout(() => r.el.classList.remove('bon'), 900); snd('pop'); }
      S.timeout(() => { r.mode = 'idle'; if (r.done) { const d = r.done; r.done = null; d(); } }, T(300));
    }
    function frame(dt) {
      const now = performance.now();
      for (const r of reels) {
        if (r.mode === 'spin' || r.mode === 'stopping') {
          if (r.mode === 'spin' && r.stopAt && now >= r.stopAt) { r.mode = 'stopping'; r.queue = [r.fin[3], r.fin[2], r.fin[1], r.fin[0], rndSym()]; }
          r.t += dt;
          const vmax = (turbo || skip ? 34 : 23) * (RM ? 0.6 : 1);
          if (r.t < 0.09 && !RM) { r.off = -0.12 * Math.sin(r.t / 0.09 * Math.PI / 2); setStrip(r); continue; }
          r.v = Math.min(vmax, r.v + dt * vmax / 0.2);
          r.off += r.v * dt;
          while (r.off >= 1 && (r.mode === 'spin' || r.mode === 'stopping')) { r.off -= 1; shift(r); }
          if (r.mode !== 'settle') setStrip(r);
        }
      }
    }
    S.loop(frame);
    const live = new Set();
    /* spin the reels and bring them to rest on `grid` (grid[reel][row]). Resolves when the last reel has settled. */
    function spinTo(grid, opts) {
      opts = opts || {};
      return new Promise((res) => {
        const base = performance.now(), gap = T(190), first = T(opts.first || 760);
        const bonusReels = [0, 2, 4].filter((i) => grid[i].indexOf(M.BON) >= 0);
        const antic = opts.antic !== false && grid[0].indexOf(M.BON) >= 0 && grid[2].indexOf(M.BON) >= 0 && grid[4].indexOf(M.BON) >= 0 ? true : (opts.antic !== false && grid[0].indexOf(M.BON) >= 0 && grid[2].indexOf(M.BON) >= 0);
        let left = REELS;
        reels.forEach((r, i) => {
          r.fin = grid[i]; r.done = () => { if (--left === 0) { spinning = false; res(); } };
          if (r.mode === 'idle' || r.mode === 'settle') { r.mode = 'spin'; r.t = 0; r.v = 0; r.off = 0; r.el.classList.add('spinning'); }
          let at = base + first + i * gap;
          if (i === 4 && antic) at += T(1500);
          r.stopAt = at;
        });
        spinning = true;
        if (antic) {
          S.timeout(() => { reels[4].el.classList.add('antic'); el.frame.classList.add('antic'); for (let k = 0; k < 4; k++) S.timeout(() => snd('antic', k), T(k * 330)); setMsg('One more Cannonball Bat…', 'gold'); }, first + gap * 3);
          S.timeout(() => el.frame.classList.remove('antic'), first + gap * 4 + T(1500));
        }
        snd('spin');
      });
    }
    /* put the reels spinning at once, before the answer is known (base game): they carry on to stopAt once spinTo is called */
    function startRoll() {
      for (const r of reels) if (r.mode === 'idle') { r.mode = 'spin'; r.t = 0; r.v = 0; r.stopAt = 0; r.el.classList.add('spinning'); }
      spinning = true; snd('spin');
    }
    function slam() {
      if (!spinning) return;
      const now = performance.now();
      reels.forEach((r, i) => { if (r.mode === 'spin' && r.stopAt) r.stopAt = Math.min(r.stopAt, now + i * 45); });
    }
    function restAll() { for (const r of reels) { r.mode = 'idle'; r.off = 0; setStrip(r); r.el.classList.remove('spinning', 'antic'); r.strip.children[1].innerHTML = REST[rndSym()]; for (let k = 2; k <= 4; k++) r.strip.children[k].innerHTML = REST[rndSym()]; } spinning = false; }
    function setGrid(grid) { grid.forEach((col, c) => col.forEach((s, k) => { cellAt(c, k).innerHTML = REST[s]; })); }

    /* ===================== win presentation ===================== */
    const clearMarks = () => { el.reels.querySelectorAll('.cz-cell.win,.cz-cell.pulse').forEach((c) => c.classList.remove('win', 'pulse')); el.reels.classList.remove('dim'); el.lines.innerHTML = ''; };
    function markWins(ws) { clearMarks(); if (!ws.length) return; el.reels.classList.add('dim'); for (const w of ws) { const ln = M.LINES[w.l]; for (let c = 0; c < w.n; c++) cellAt(c, ln[c]).classList.add('win'); } }
    function drawLines(ws) {
      el.lines.innerHTML = '<svg viewBox="0 0 5 4" preserveAspectRatio="none" aria-hidden="true">' + ws.map((w) => { const ln = M.LINES[w.l]; return '<polyline class="cz-ln" points="' + ln.slice(0, w.n).map((row, c) => (c + 0.5) + ',' + (row + 0.5)).join(' ') + '"/>'; }).join('') + '</svg>';
    }
    function countWin(to, ms) { const from = parseInt(el.win.textContent.replace(/,/g, ''), 10) || 0; return B.ui.countUp(el.win, from, to, Math.max(60, T(ms || 600))); }
    function crowdCheer(n) { el.bg.classList.remove('cheer'); void el.bg.offsetWidth; el.bg.classList.add('cheer'); if (n) snd('cheer'); S.timeout(() => el.bg.classList.remove('cheer'), 2200); }
    /* show a spin's line wins: all at once, then one by one while the player waits */
    async function showWins(ws, mult, total) {
      if (!ws.length) return;
      markWins(ws); drawLines(ws); snd('win', ws.length); el.frame.classList.add('won');
      if (total != null) await countWin(total, 600);
      if (ws.length > 1) {
        const tok = ++cycleTok;
        S.timeout(async () => {
          let i = 0;
          while (cycleTok === tok && !S.dead) {
            const w = ws[i++ % ws.length]; markWins([w]); drawLines([w]);
            setMsg(M.NAMES[w.s] + ' × ' + w.n + ' pays ' + fmt(w.pay * unit * (mult || 1)) + ' BB', 'gold');
            await S.sleep(T(950));
          }
        }, T(900));
      } else setMsg(M.NAMES[ws[0].s] + ' × ' + ws[0].n + ' pays ' + fmt(ws[0].pay * unit * (mult || 1)) + ' BB', 'gold');
    }
    function stopCycle() { cycleTok++; el.frame.classList.remove('won'); clearMarks(); }
    function banner(html, cls, ms) {
      el.banner.hidden = false; el.banner.className = 'cz-banner ' + (cls || ''); el.banner.innerHTML = html; void el.banner.offsetWidth; el.banner.classList.add('in');
      return nap(ms || 1100).then(() => { el.banner.classList.remove('in'); el.banner.classList.add('out'); return nap(260); }).then(() => { el.banner.hidden = true; });
    }

    /* ===================== talking to the maths / the server ===================== */
    let rnd = null; // { id, o }
    async function begin(stake, buy, cost) {
      if (B.online) {
        const r = await B.play(ID, 'start', { stake, buy: buy || undefined, token: uid() }, cost);
        if (!r || !r.o) return null;
        rnd = { id: r.round, o: r.o }; unit = r.unit || Math.round(r.stake / U);
        if (r.resume || r.repeat) { B.wallet.sync(); }
        return r.o;
      }
      const o = M.start(B.rng, buy || null); rnd = { id: 0, o }; unit = Math.round(stake / U); return o;
    }
    async function doStep(action, choice) {
      const o = rnd.o;
      if (B.online) {
        const r = await B.play(ID, 'act', { round: rnd.id, rev: o.rev, action, choice: choice == null ? undefined : choice }, 0);
        if (!r || !r.o) return null;
        if (r.stale) { rnd.o = r.o; return 'stale'; }
        rnd.o = r.o; return r.o;
      }
      try { rnd.o = M.step(o, action, choice == null ? null : choice, B.rng); } catch (e) { B.ui.toast(e.message); return null; }
      return rnd.o;
    }
    const bb = (units) => fmt(units * unit);

    /* ===================== spin button, auto, buy ===================== */
    function lockUi(on) {
      stakeCtl.disabled = on; el.buy.disabled = on; el.main.classList.toggle('busy', on);
      el.spin.classList.toggle('stop', on && spinning);
    }
    function onSpin() {
      if (el.ov && !el.ov.hidden) { closeOv(); return; }
      if (!el.autoMenu.hidden) { el.autoMenu.hidden = true; return; }
      if (busy) { if (spinning) slam(); return; }
      round(null);
    }
    function onAuto() { if (auto !== 0) { stopAuto(); snd('click'); } else if (!busy) el.autoMenu.hidden = !el.autoMenu.hidden; }
    function startAuto(n) { auto = n; paintAuto(); round(null); }
    function stopAuto() { auto = 0; paintAuto(); }
    function openBuy() {
      if (busy) return; const stake = stakeCtl.value;
      const card = (k, name, blurb) => {
        const cost = stake * M.BUYS[k];
        return h('button', { class: 'cz-buycard', type: 'button', id: 'cz-buy-' + k, disabled: B.wallet.balance < cost, onclick: () => { closeOv(); round(k); } },
          h('b', null, name), h('span', null, blurb), h('em', null, fmt(cost) + ' BB'), h('small', null, M.BUYS[k] + '× stake'));
      };
      el.ov.hidden = false; el.ov.textContent = '';
      el.ov.append(h('div', { class: 'cz-buybox', role: 'dialog', 'aria-label': 'Bonus buy' }, h('h3', null, 'Buy the bonus'),
        h('p', null, 'Skip straight to the cannon. Batty Bucks only; the result is still random and can be less than the price.'),
        h('div', { class: 'cz-buycards' }, card('grand', 'GRAND CANNON', 'A guaranteed shot at an act or a combination'), card('spotlight', 'SPOTLIGHT SHOW', 'Straight to the bullseye: three acts')),
        h('button', { class: 'cz-btn', type: 'button', onclick: closeOv }, 'Not now')));
      snd('pop');
    }
    function closeOv() { el.ov.hidden = true; el.ov.textContent = ''; }

    /* ===================== a round ===================== */
    async function round(buy) {
      if (busy || !G) return;
      const stake = stakeCtl.value, cost = stake * (buy ? M.BUYS[buy] : 1);
      if (!B.wallet.bet(ID, cost)) { stopAuto(); return B.ui.broke(); }
      busy = true; skip = false; el.autoMenu.hidden = true; roundCost = cost; curStake = stake; unit = Math.round(stake / U);
      stopCycle(); el.win.textContent = '0'; el.frame.classList.remove('won'); lockUi(true);
      if (auto > 0) { auto--; paintAuto(); }
      setMsg(buy ? 'Rolling up the big top…' : 'Spinning…', '');
      if (!buy) startRoll(); else snd('drum');
      let o = await begin(stake, buy, cost);
      if (!G) return;
      if (!o) { restAll(); busy = false; stopAuto(); lockUi(false); setMsg('Lost contact with the big top. Try again.', ''); return; }
      await baseSpin(o);
      if (!G) return;
      if (o.base.bonus) { o = await bonus(o, false); if (!G) return; }
      await finish(o);
    }
    async function baseSpin(o) {
      const b = o.base;
      if (o.buy) { startRoll(); }
      await spinTo(b.grid, { first: o.buy ? 1100 : 760 });
      if (!G) return;
      if (b.pay > 0) { const w = b.pay * unit; await showWins(b.wins, 1, w); crowdCheer(b.pay >= 60); await nap(b.bonus ? 600 : 250); }
      else setMsg(b.bonus ? 'THE CANNON!' : 'Ten lines of fun. Spin again.', b.bonus ? 'gold' : '');
    }
    async function finish(o) {
      const win = o.total * unit;
      if (win > 0) B.wallet.win(ID, win, { silent: true });
      stopCycle();
      if (win > parseInt(el.win.textContent.replace(/,/g, ''), 10)) await countWin(win, 900);
      B.wallet.sync();
      if (win > 0) { setMsg((o.capped ? 'MAXIMUM WIN! ' : '') + 'Paid ' + fmt(win) + ' BB', 'gold'); el.winbox.classList.add('hot'); S.timeout(() => el.winbox.classList.remove('hot'), 1600); }
      else setMsg('No win this time. Roll up again!', '');
      if (win >= roundCost * 10) { crowdCheer(true); await B.ui.celebrate({ amount: win, bet: roundCost }); if (!G) return; }
      busy = false; spinning = false; lockUi(false); rnd = null; clearMarks();
      if (auto > 0 && B.wallet.balance >= stakeCtl.value) S.timeout(() => { if (auto > 0) round(null); }, T(o.base && o.base.bonus ? 900 : 350));
      else if (auto !== 0) stopAuto();
    }

    /* ===================== the bonus: scene plumbing ===================== */
    const showHud = (on) => { el.hud.hidden = !on; el.main.classList.toggle('bonus', on); el.skipBtn.hidden = true; };
    function paintHud(o) {
      const queued = new Set((o.queue || []).map((a) => M.ACTS[a])), doneIds = new Set((o.done || []).map((d) => d.id));
      if (o.phase === 'decide' && o.shots.length) { const sh = o.shots[o.shots.length - 1]; if (sh.acts) sh.acts.forEach((a) => queued.add(M.ACTS[a])); }
      el.chips.querySelectorAll('.cz-chip').forEach((c, i) => { const id = M.ACTS[i]; c.className = 'cz-chip' + (o.act && o.act.id === id ? ' cur' : doneIds.has(id) ? ' done' : queued.has(id) ? ' q' : ''); });
      setHudTotal(o.total * unit);
    }
    function setHudTotal(v) { const from = parseInt(el.hudTotal.textContent.replace(/,/g, ''), 10) || 0; if (v !== from) B.ui.countUp(el.hudTotal, from, v, Math.max(80, T(600))); }
    function openScene() { el.scene.hidden = false; el.scene.classList.remove('out'); void el.scene.offsetWidth; el.scene.classList.add('in'); el.main.classList.add('inscene'); }
    function closeScene() { el.scene.classList.remove('in'); el.scene.classList.add('out'); primary = null; return nap(360).then(() => { el.scene.hidden = true; el.sceneBody.textContent = ''; el.sceneUi.textContent = ''; el.main.classList.remove('inscene'); cn = null; }); }
    function tapOr(ms) {
      return new Promise((res) => {
        const done = () => { primary = null; el.sceneBody.removeEventListener('click', done); res(); };
        el.sceneBody.addEventListener('click', done); primary = done; S.timeout(done, T(ms));
      });
    }
    /* offer buttons in the scene and wait for one: buttons = [{val, cls, html}] */
    function ask(buttons, opts) {
      opts = opts || {};
      return new Promise((res) => {
        el.sceneUi.textContent = '';
        if (opts.note) el.sceneUi.append(h('p', { class: 'cz-note', html: opts.note }));
        const row = h('div', { class: 'cz-choices ' + (opts.cls || '') });
        buttons.forEach((b) => { const x = h('button', { type: 'button', class: 'cz-choice ' + (b.cls || ''), onclick: () => { primary = null; row.classList.add('sent'); snd('click'); res(b.val); } }); x.innerHTML = b.html; row.append(x); });
        el.sceneUi.append(row);
        primary = () => row.children[opts.primary != null ? opts.primary : Math.floor(Math.random() * row.children.length)].click();
      });
    }
    const clearUi = () => { el.sceneUi.textContent = ''; primary = null; };
    const note = (html) => { el.sceneUi.textContent = ''; el.sceneUi.append(h('p', { class: 'cz-note', html })); };
    async function introCard(i, o) {
      const n = (o.done ? o.done.length : 0) + 1, m = (o.done ? o.done.length : 0) + (o.act ? 1 : 0) + (o.queue ? o.queue.length : 0);
      el.sceneBody.textContent = ''; clearUi();
      el.sceneBody.append(h('div', { class: 'cz-intro' }, h('div', { class: 'cz-intro-ic', html: A.actIcon(i) }), h('small', null, 'ACT ' + n + ' OF ' + m), h('b', null, M.ACT_NAMES[i]), h('span', null, ACT_DESC[i])));
      snd('drum'); crowdCheer(false); await tapOr(1900);
    }
    const needIntro = (o, i) => { const k = 'a' + (o.done ? o.done.length : 0) + ':' + i; if (introduced.has(k)) return false; introduced.add(k); return true; };
    const sceneSize = () => ({ W: el.sceneBody.clientWidth || 600, H: el.sceneBody.clientHeight || 360 });
    function popText(host, txt, cls, at) { const p = h('div', { class: 'cz-pop ' + (cls || ''), style: at || {} }, txt); host.append(p); S.timeout(() => p.remove(), 1700); return p; }
    function burstAt(node, kind, n) { if (!node || !node.getBoundingClientRect) return; const r = node.getBoundingClientRect(); B.fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: kind || 'coin', count: n || 18, power: 0.8 }); }
    async function actDone(n, id) {
      const d = (n.done || []).filter((x) => x.id === id).pop(); const i = M.ACTS.indexOf(id);
      paintHud(n);
      if (d) { note('<b>' + esc(ACT_SHORT[i]) + '</b> paid <b>' + bb(d.win) + ' BB</b>'); snd(d.win > 0 ? 'win' : 'click', 3); if (d.win > 0) burstAt(el.sceneBody, 'coin', 26); await nap(1500); }
    }

    /* ===================== the cannon ===================== */
    let cn = null;
    function geo() {
      const { W, H } = sceneSize(), por = W < H * 0.95;
      const Rb = por ? Math.min(W * 0.36, H * 0.27) : Math.min(W * 0.27, H * 0.36);
      const bx = por ? W / 2 : W * 0.63, by = por ? H * 0.31 : H * 0.47;
      const k = por ? Math.min(W * 0.0012, H * 0.0014) : Math.min(W * 0.00078, H * 0.0017);
      const cx = por ? W * 0.3 : W * 0.2, cy = por ? H * 0.9 : H * 0.86;
      return { W, H, Rb, bx, by, k, cx, cy, mx: cx + 154.3 * k, my: cy - 126.4 * k };
    }
    function segXY(g, seg) {
      if (seg === 15) return { x: g.bx, y: g.by };
      if (seg < 10) { const a = -Math.PI / 2 + seg * Math.PI / 5, r = 0.82 * g.Rb; return { x: g.bx + Math.cos(a) * r, y: g.by + Math.sin(a) * r }; }
      const a = -Math.PI / 2 + (seg - 10) * 2 * Math.PI / 5 + Math.PI / 5, r = 0.47 * g.Rb; return { x: g.bx + Math.cos(a) * r, y: g.by + Math.sin(a) * r };
    }
    function segAt(g, x, y) {
      const dx = x - g.bx, dy = y - g.by, r = Math.hypot(dx, dy); if (r > g.Rb) return -1; if (r < 0.3 * g.Rb) return 15;
      let a = Math.atan2(dy, dx) + Math.PI / 2; a = (a + 4 * Math.PI) % (2 * Math.PI);
      if (r < 0.64 * g.Rb) return 10 + (Math.floor(a / (2 * Math.PI / 5)) % 5);
      return Math.floor((a + Math.PI / 10) / (Math.PI / 5)) % 10;
    }
    function buildCannon(lastShot) {
      const g = geo();
      el.sceneBody.textContent = '';
      const wrap = h('div', { class: 'cz-csc' });
      wrap.innerHTML = '<svg class="cz-csvg" viewBox="0 0 ' + g.W + ' ' + g.H + '" aria-label="The cannon target board">' +
        '<g class="cz-bd" transform="translate(' + g.bx + ' ' + g.by + ')">' + A.board(g.Rb, M) + '</g>' +
        '<g class="cz-cn" transform="translate(' + g.cx + ' ' + g.cy + ') scale(' + g.k + ')">' + A.cannon() + '</g>' +
        '<g class="cz-smoke"></g><g class="cz-trail"></g><g class="cz-pf" style="display:none">' + A.performer() + '</g></svg>';
      el.sceneBody.append(wrap);
      const svg = wrap.firstChild, c = { g, svg, cn: svg.querySelector('.cz-cn'), pf: svg.querySelector('.cz-pf'), trail: svg.querySelector('.cz-trail'), smoke: svg.querySelector('.cz-smoke') };
      c.cap = h('div', { class: 'cz-cap' }); wrap.append(c.cap);
      if (lastShot) land(c, lastShot, true);
      return c;
    }
    function setCap(html, cls) { if (cn) { cn.cap.className = 'cz-cap in ' + (cls || ''); cn.cap.innerHTML = html; } }
    function land(c, shot, quiet) {
      const p = segXY(c.g, shot.seg);
      c.svg.querySelectorAll('.cz-seg.hit').forEach((s) => s.classList.remove('hit'));
      const seg = c.svg.querySelector('.cz-seg[data-seg="' + shot.seg + '"]'); if (seg) seg.classList.add('hit');
      c.pf.style.display = ''; c.pf.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + (quiet ? -20 : -12) + ') scale(' + (c.g.k * 1.1).toFixed(3) + ')'); c.pf.classList.add('stuck');
      if (!quiet) { snd('thud'); S.timeout(() => burstAt(c.pf, 'spark', 26), 0); crowdCheer(true); c.svg.classList.add('shake'); S.timeout(() => c.svg.classList.remove('shake'), 500); }
    }
    async function fly(c, shot) {
      const g = c.g; c.pf.classList.remove('stuck'); c.pf.style.display = 'none'; c.trail.textContent = '';
      c.svg.querySelectorAll('.cz-seg.hit').forEach((s) => s.classList.remove('hit'));
      c.cn.classList.remove('fire'); void c.cn.getBoundingClientRect(); c.cn.classList.add('fire'); snd('fuse'); setCap('<b>3… 2… 1…</b>', ''); await nap(750);
      if (!G) return; snd('boom');
      for (let i = 0; i < 6; i++) c.smoke.insertAdjacentHTML('beforeend', '<circle class="cz-pu" cx="' + (g.mx + (Math.random() - 0.3) * 30 * g.k * 4).toFixed(0) + '" cy="' + (g.my + (Math.random() - 0.5) * 20).toFixed(0) + '" r="' + (10 + Math.random() * 16).toFixed(0) + '" style="animation-delay:' + (i * 40) + 'ms"/>');
      S.timeout(() => { c.smoke.textContent = ''; }, 1400);
      const to = segXY(g, shot.seg), p0 = { x: g.mx, y: g.my }, p2 = to, p1 = { x: (p0.x + p2.x) / 2 - g.W * 0.04, y: Math.min(p0.y, p2.y) - g.H * 0.55 };
      c.pf.style.display = ''; snd('whistle');
      const D = T(1550), t0 = performance.now(); let lastT = 0, lastSeg = -2;
      await new Promise((res) => {
        const step = (now) => {
          if (!G) return res();
          const k = Math.min(1, (now - t0) / D), u = 1 - k;
          const x = u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x, y = u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y;
          const dx = 2 * u * (p1.x - p0.x) + 2 * k * (p2.x - p1.x), dy = 2 * u * (p1.y - p0.y) + 2 * k * (p2.y - p1.y);
          const ang = Math.atan2(dy, dx) * 180 / Math.PI + k * 40 * (k > 0.7 ? 1 : 0);
          c.pf.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ') scale(' + (g.k * (0.55 + 0.55 * Math.min(1, k * 2))).toFixed(3) + ')');
          if (now - lastT > 34 && !RM) { lastT = now; c.trail.insertAdjacentHTML('beforeend', '<circle class="cz-trd" cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (5 + Math.random() * 5).toFixed(0) + '"/>'); if (c.trail.childNodes.length > 40) c.trail.removeChild(c.trail.firstChild); }
          const sg = segAt(g, x, y);
          if (sg >= 0 && sg !== lastSeg) { lastSeg = sg; const s = c.svg.querySelector('.cz-seg[data-seg="' + sg + '"]'); if (s) { s.classList.add('pass'); S.timeout(() => s.classList.remove('pass'), 160); snd('tick'); } }
          if (k < 1) S.raf(step); else res();
        };
        S.raf(step);
      });
      if (!G) return; land(c, shot, false); S.timeout(() => { c.trail.textContent = ''; }, 900);
    }
    const shotText = (shot) => shot.cash ? '<b>CASH PRIZE</b> · ' + (shot.cash / U) + '× stake · ' + bb(shot.cash) + ' BB' : '<b>' + shot.acts.map((a) => ACT_SHORT[a].toUpperCase()).join(' + ') + '</b>' + (shot.acts.length === 3 ? ' · THE BULLSEYE' : '');
    async function phCannon(o) {
      if (!cn || !cn.svg.isConnected) cn = buildCannon(null);
      setCap('Roll up! Fire the cannon.', ''); snd('calliope');
      await ask([{ val: 1, cls: 'gold big', html: '<b>FIRE!</b>' }], { primary: 0 });
      const n = await doStep('fire'); if (!n || n === 'stale') return n;
      clearUi(); await fly(cn, n.ev.shot); if (!G) return n;
      setCap(shotText(n.ev.shot), 'gold'); paintHud(n);
      if (n.phase !== 'decide') await announce(n.ev.shot, n); else await nap(500);
      return n;
    }
    async function announce(shot, n) {
      setCap(shotText(shot), 'gold'); paintHud(n);
      if (shot.cash) { snd('win', 3); burstAt(cn && cn.pf, 'coin', 30); await B.ui.countUp(el.hudTotal, 0, n.total * unit, T(900)); await nap(1300); }
      else { snd('bonus'); await nap(1500); }
    }
    async function phDecide(o) {
      if (!cn || !cn.svg.isConnected) cn = buildCannon(o.shots[o.shots.length - 1]);
      const shot = o.shots[o.shots.length - 1], mine = M.shotValueEV(shot), avg = M.shotEV(o.buy || 'base');
      setCap(shotText(shot), 'gold'); paintHud(o);
      const c = await ask([
        { val: 'collect', cls: 'gold', html: '<b>COLLECT</b><small>keep this shot</small>' },
        { val: 'retry', cls: 'teal', html: '<b>RETRY</b><small>one fresh shot, final</small>' },
      ], { primary: 0, note: 'This shot is worth about <b>' + mine.toFixed(0) + '×</b> your stake on average. A fresh shot averages <b>' + avg.toFixed(0) + '×</b>. A retry must be kept.' });
      clearUi();
      const n = await doStep(c); if (!n || n === 'stale') return n;
      if (c === 'retry') { await fly(cn, n.ev.shot); if (!G) return n; }
      await announce(n.ev.shot, n); return n;
    }

    /* ===================== Act 1: the strongman ===================== */
    async function phStrong(o) {
      if (needIntro(o, 0)) await introCard(0, o); if (!G) return o;
      el.sceneBody.textContent = ''; clearUi();
      const pips = M.SM_V.slice(0, 8).map((_, i) => '<i data-i="' + i + '"></i>').join('');
      el.sceneBody.insertAdjacentHTML('beforeend', '<div class="cz-sc strong"><div class="cz-ladder" aria-hidden="true">' + pips + '</div>' +
        '<svg class="cz-char sb" viewBox="-130 -300 260 310" aria-hidden="true">' + A.strongbat() + '</svg>' +
        '<svg class="cz-bar" viewBox="-130 -60 260 90" aria-hidden="true"><g class="cz-barg"></g></svg><div class="cz-popbox"></div></div>');
      const sc = el.sceneBody.querySelector('.cz-sc'), bat = sc.querySelector('.cz-char'), bar = sc.querySelector('.cz-bar'), barg = bar.querySelector('.cz-barg'), pb = sc.querySelector('.cz-popbox');
      barg.innerHTML = A.barbell(1);
      let cur = o;
      while (G && cur.phase === 'strong') {
        const lvl = cur.act.level;
        sc.querySelectorAll('.cz-ladder i').forEach((p, i) => p.className = i < lvl ? 'done' : i === lvl ? 'cur' : '');
        bar.className.baseVal = 'cz-bar'; barg.innerHTML = A.barbell(1); bat.classList.remove('strain', 'oops'); setHudInfo('Lift ' + (lvl + 1) + ' of 8');
        const lab = ['LIGHT', 'MEDIUM', 'HEAVY'];
        const w = await ask([0, 1, 2].map((i) => ({ val: i, cls: 'wt w' + i, html: '<svg viewBox="-60 -75 120 140" aria-hidden="true">' + A.weightIcon(i) + '</svg><b>' + lab[i] + '</b><small>' + M.SM_P[i] + '% to lift</small><em>' + bb(M.smPrize(lvl, i)) + ' BB</em>' })), { primary: 1, cls: 'three' });
        clearUi(); barg.innerHTML = A.barbell(w);
        const n = await doStep('pick', w); if (!n || n === 'stale') { if (n === 'stale') cur = rnd.o; continue; }
        const L = n.ev.lift; bat.classList.add('strain'); snd('lift'); await nap(800); if (!G) return n;
        if (L.ok) { bar.classList.add('up'); snd('win', 3); popText(pb, '+' + bb(L.prize) + ' BB', 'gold'); burstAt(bar, 'coin', 22); crowdCheer(true); setMsg('LIFTED!', 'gold'); }
        else { bar.classList.add('drop'); bat.classList.remove('strain'); bat.classList.add('oops'); snd('clang'); popText(pb, 'DROPPED!', 'bad'); }
        paintHud(n); await nap(1300); cur = n;
        if (!cur.act || cur.act.id !== 'strong') { await actDone(cur, 'strong'); return cur; }
      }
      return cur;
    }
    const setHudInfo = (t) => { el.hudInfo.textContent = t || ''; };

    /* ===================== Act 2: the bear on the high wire ===================== */
    function itemSvg(code) {
      if (code === 0) return '<svg viewBox="-40 -40 80 80" aria-hidden="true"><path d="M-30 -22 L30 -22 L16 -6 L10 6 L24 26 L-24 26 L-10 6 L-16 -6Z" fill="#3d3a46" stroke="#14020c" stroke-width="3"/><path d="M-24 -18 L24 -18" stroke="#8a8794" stroke-width="4"/><text y="2" text-anchor="middle" font-family="Bungee,Impact" font-size="13" fill="#e9e6f0">1 TON</text></svg>';
      const tier = code, hue = ['#cd7f32', '#cfd3da', '#ffd451', '#4ac0ff', '#ff5ea8', '#57e2a0', '#b35cff', '#ff9a3c'][tier - 1], v = M.BEAR_ITEMS[code] / U;
      return '<svg viewBox="-40 -40 80 80" aria-hidden="true"><circle r="30" fill="' + hue + '" stroke="#2a0b1e" stroke-width="4"/><circle r="22" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"/><text y="7" text-anchor="middle" font-family="Bungee,Impact" font-size="' + (v >= 100 ? 17 : 21) + '" fill="#2a0b1e">' + v + '×</text></svg>';
    }
    async function phBear(o) {
      if (needIntro(o, 1)) await introCard(1, o); if (!G) return o;
      el.sceneBody.textContent = ''; clearUi();
      el.sceneBody.insertAdjacentHTML('beforeend', '<div class="cz-sc bear" style="--lane:' + (o.act.lane == null ? 1 : o.act.lane) + '"><div class="cz-lanes"><i></i><i></i><i></i></div><div class="cz-rope"><b class="l"></b><b class="r"></b></div>' +
        '<div class="cz-bearw"><svg viewBox="-100 -230 200 250" aria-hidden="true">' + A.bear() + '</svg></div><div class="cz-popbox"></div></div>');
      const sc = el.sceneBody.querySelector('.cz-sc'), bearw = sc.querySelector('.cz-bearw'), rope = sc.querySelector('.cz-rope'), lanes = sc.querySelector('.cz-lanes'), pb = sc.querySelector('.cz-popbox');
      let cur = o;
      while (G && cur.phase === 'bear') {
        setHudInfo('Drop ' + (cur.act.drop + 1) + ' of ' + M.BEAR_DROPS);
        const lane = await ask([{ val: 0, cls: 'ln', html: '<b>◀</b><small>LEFT</small>' }, { val: 1, cls: 'ln', html: '<b>▲</b><small>MIDDLE</small>' }, { val: 2, cls: 'ln', html: '<b>▶</b><small>RIGHT</small>' }], { primary: 1, cls: 'three', note: 'Steer the bear. One item falls in each lane after you choose.' });
        clearUi(); sc.style.setProperty('--lane', lane);
        const n = await doStep('pick', lane); if (!n || n === 'stale') { if (n === 'stale') cur = rnd.o; continue; }
        await nap(480); if (!G) return n;
        const D = n.ev.drop; lanes.textContent = '';
        D.items.forEach((code, i) => { const it = h('div', { class: 'cz-item l' + i + (i === lane ? ' mine' : ''), html: itemSvg(code) }); lanes.append(it); it.style.animationDuration = T(950) + 'ms'; });
        snd('whistle'); await nap(1000); if (!G) return n;
        if (D.snap) { snd('snap'); snd('clang'); rope.classList.add('snap'); bearw.classList.add('fall'); popText(pb, 'THE ROPE SNAPS!', 'bad'); crowdCheer(false); }
        else { snd('coin'); snd('win', 2); popText(pb, '+' + bb(D.got) + ' BB', 'gold'); burstAt(bearw, 'coin', 16); }
        paintHud(n); await nap(D.snap ? 1500 : 650); cur = n;
        if (!cur.act || cur.act.id !== 'bear') { await actDone(cur, 'bear'); return cur; }
      }
      return cur;
    }

    /* ===================== Act 3: the fire breather ===================== */
    async function phFire(o) {
      if (needIntro(o, 2)) await introCard(2, o); if (!G) return o;
      el.sceneBody.textContent = ''; clearUi();
      const tor = Array.from({ length: M.FIRE_TORCHES }, (_, i) => '<button type="button" class="cz-tor" data-t="' + i + '" aria-label="Torch ' + (i + 1) + '"><svg viewBox="-34 -160 68 170" aria-hidden="true">' + A.torch(i) + '</svg><b></b></button>').join('');
      el.sceneBody.insertAdjacentHTML('beforeend', '<div class="cz-sc fire"><svg class="cz-char bz" viewBox="-110 -230 280 250" aria-hidden="true">' + A.blaze() + '</svg><div class="cz-torches">' + tor + '</div><div class="cz-popbox"></div></div>');
      const sc = el.sceneBody.querySelector('.cz-sc'), bz = sc.querySelector('.cz-char'), tors = Array.from(sc.querySelectorAll('.cz-tor')), pb = sc.querySelector('.cz-popbox');
      let cur = o;
      /* restore torches already lit (resume) */
      (cur.act.log || []).forEach((l) => { const t = tors[l.t]; t.classList.add('lit'); t.disabled = true; t.querySelector('b').textContent = l.got ? (M.FIRE_ITEMS[l.it] / U) + '×' : ''; });
      while (G && cur.phase === 'fire') {
        setHudInfo('Torch ' + (cur.act.picked.length + 1) + ' of ' + M.FIRE_TORCHES);
        note('Pick a torch for Blaze to light. Every torch hides a prize, until the fire goes out.');
        const t = await new Promise((res) => {
          const free = tors.filter((x) => !x.disabled);
          free.forEach((x) => { x.classList.add('ready'); x.onclick = () => { free.forEach((y) => { y.classList.remove('ready'); y.onclick = null; }); primary = null; snd('click'); res(+x.dataset.t); }; });
          primary = () => free[Math.floor(Math.random() * free.length)].click();
        });
        clearUi();
        const n = await doStep('pick', t); if (!n || n === 'stale') { if (n === 'stale') cur = rnd.o; tors.forEach((x) => { if (!x.classList.contains('lit') && !x.classList.contains('out')) x.disabled = false; }); continue; }
        const Bl = n.ev.blast, tel = tors[t]; tel.disabled = true;
        bz.classList.add('blast'); snd('flame');
        /* the fireball */
        const a = bz.getBoundingClientRect(), b = tel.getBoundingClientRect(), ball = h('i', { class: 'cz-fball' }); document.body.append(ball);
        const sx = a.left + a.width * 0.78, sy = a.top + a.height * 0.2, ex = b.left + b.width / 2, ey = b.top + b.height * 0.25;
        const an = ball.animate([{ transform: 'translate(' + sx + 'px,' + sy + 'px) scale(.4)' }, { transform: 'translate(' + ((sx + ex) / 2) + 'px,' + (Math.min(sy, ey) - 60) + 'px) scale(1.2)' }, { transform: 'translate(' + ex + 'px,' + ey + 'px) scale(.8)' }], { duration: T(620), easing: 'ease-in' });
        await an.finished.catch(() => {}); ball.remove(); bz.classList.remove('blast'); if (!G) return n;
        if (Bl.out) { tel.classList.add('out'); snd('snap'); popText(pb, 'THE FIRE GOES OUT!', 'bad'); }
        else { tel.classList.add('lit'); tel.querySelector('b').textContent = (M.FIRE_ITEMS[Bl.it] / U) + '×'; snd('win', 3); popText(pb, '+' + bb(Bl.got) + ' BB', 'gold'); burstAt(tel, 'spark', 22); crowdCheer(false); }
        paintHud(n); await nap(Bl.out ? 1400 : 800); cur = n;
        if (!cur.act || cur.act.id !== 'fire') { await actDone(cur, 'fire'); return cur; }
      }
      return cur;
    }

    /* ===================== free-spin helpers: the machine on stage ===================== */
    function wildPop(c, r, k, delay) {
      S.timeout(() => {
        const cell = cellAt(r, k); if (!cell) return;
        cell.classList.add('wpop'); cell.innerHTML = REST[M.W]; snd('pop'); S.timeout(() => cell.classList.remove('wpop'), 700);
      }, T(delay || 0));
    }
    async function dropBox(b) {
      const cell = cellAt(b.r, b.k), box = h('div', { class: 'cz-mbox', html: A.miniBox() }); cell.append(box);
      await nap(380); if (!G) return; box.classList.add('open'); snd('pop'); await nap(220);
      wildPop(null, b.r, b.k, 0); box.remove();
      if (b.boom) { snd('boom'); crowdCheer(false); el.frame.classList.add('shake'); S.timeout(() => el.frame.classList.remove('shake'), 400); for (let dr = -1; dr <= 1; dr++) for (let dk = -1; dk <= 1; dk++) { const r = b.r + dr, k = b.k + dk; if (r >= 0 && r < REELS && k >= 0 && k < ROWS && (dr || dk)) wildPop(null, r, k, 80 + (Math.abs(dr) + Math.abs(dk)) * 70); } await nap(520); }
    }
    let multEl = null;
    const showMult = (v, on) => { if (!multEl) { multEl = h('div', { class: 'cz-mult', 'aria-live': 'polite' }); el.frame.append(multEl); } multEl.hidden = !on; if (on) { multEl.textContent = '×' + v; multEl.classList.remove('bump'); void multEl.offsetWidth; multEl.classList.add('bump'); } };
    const FREE_VIEW = async (on) => { if (on) { await closeScene(); el.skipBtn.hidden = false; } else el.skipBtn.hidden = true; };

    /* ===================== Act 4: jester spins ===================== */
    async function phJester(o) {
      if (needIntro(o, 3)) await introCard(3, o); if (!G) return o;
      el.sceneBody.textContent = ''; clearUi();
      const boxes = [0, 1, 2].map((c) => '<button type="button" class="cz-jb" data-c="' + c + '" aria-label="Box ' + (c + 1) + '"><svg viewBox="-70 -230 140 240" aria-hidden="true">' + A.jesterBox(c) + '</svg></button>').join('');
      el.sceneBody.insertAdjacentHTML('beforeend', '<div class="cz-sc jest"><div class="cz-jboxes">' + boxes + '</div><div class="cz-popbox"></div></div>');
      const sc = el.sceneBody.querySelector('.cz-sc'), btns = Array.from(sc.querySelectorAll('.cz-jb'));
      note('Pick a box. Each one holds a number of free spins.'); setHudInfo('Pick a box');
      const pick = await new Promise((res) => { btns.forEach((x) => { x.classList.add('ready'); x.onclick = () => { btns.forEach((y) => { y.onclick = null; y.classList.remove('ready'); }); primary = null; snd('click'); res(+x.dataset.c); }; }); primary = () => btns[1].click(); });
      clearUi();
      const before = o.total, n = await doStep('pick', pick); if (!n || n === 'stale') return n;
      const J = n.ev.jester;
      btns.forEach((x, i) => { const t = x.querySelector('.cz-jn'); if (t) { t.textContent = J.boxes[i]; t.setAttribute('opacity', '1'); } x.classList.add('open', i === pick ? 'chosen' : 'dim'); });
      snd('bonus'); note('<b>' + J.boxes[pick] + ' free spins!</b>'); await nap(1500); if (!G) return n;
      await FREE_VIEW(true);
      const N = J.spins.length; let acc = before;
      for (let i = 0; i < N && G; i++) {
        const sp = J.spins[i]; stopCycle(); setHudInfo('Free spin ' + (i + 1) + ' / ' + J.boxes[pick]); setMsg('Jinx’s free spin ' + (i + 1) + ' of ' + J.boxes[pick], 'gold');
        await spinTo(sp.grid0, { antic: false, first: 520 }); if (!G) return n;
        for (const b of sp.boxes) await dropBox(b);
        await nap(300);
        acc += sp.got; el.win.textContent = '0';
        if (sp.wins.length) { await showWins(sp.wins, 1, sp.got * unit); setHudTotal(acc * unit); await nap(sp.got * unit >= 20 * curStake / 20 ? 1400 : 900); } else await nap(350);
        stopCycle();
      }
      await FREE_VIEW(false); stopCycle(); paintHud(n); setHudInfo('');
      openScene(); el.sceneBody.textContent = ''; await actDone(n, 'jester'); return n;
    }

    /* ===================== Act 5: elephant spins ===================== */
    async function phElephant(o) {
      if (needIntro(o, 4)) await introCard(4, o); if (!G) return o;
      el.sceneBody.textContent = ''; clearUi();
      el.sceneBody.insertAdjacentHTML('beforeend', '<div class="cz-sc ele"><svg class="cz-char bal" viewBox="-110 -250 220 280" aria-hidden="true">' + A.balloon() + '</svg></div>');
      setHudInfo(o.act.spins + ' free spins');
      note('<b>' + o.act.spins + ' free spins</b> at <b>×' + M.EL_START + '</b>. Every Elephant that lands adds +1 to the multiplier.');
      await ask([{ val: 1, cls: 'gold big', html: '<b>START THE SPINS</b>' }], { primary: 0 }); clearUi(); if (!G) return o;
      const before = o.total, n = await doStep('spin'); if (!n || n === 'stale') return n;
      const E = n.ev.elephant; snd('bonus');
      await FREE_VIEW(true); showMult(M.EL_START, true);
      let total = E.start, acc = before, mult = M.EL_START;
      for (let i = 0; i < E.spins.length && G; i++) {
        const sp = E.spins[i]; stopCycle(); setHudInfo('Free spin ' + (i + 1) + ' / ' + total); setMsg('Ellie’s free spin ' + (i + 1) + ' of ' + total, 'gold');
        await spinTo(sp.grid, { first: 520 }); if (!G) return n;
        /* count the elephants, +1 each */
        let k = 0; for (let r = 0; r < REELS; r++) for (let c = 0; c < ROWS; c++) if (sp.grid[r][c] === M.ELE) { const cell = cellAt(r, c); cell.classList.add('pulse'); k++; mult++; showMult(mult, true); snd('pop'); popCell(cell, '+1'); await nap(300); }
        mult = sp.mult; showMult(mult, true);
        acc += sp.got; el.win.textContent = '0';
        if (sp.wins.length) { await showWins(sp.wins, sp.mult, sp.got * unit); setHudTotal(acc * unit); await nap(1100); } else await nap(350);
        if (sp.extra) { total += sp.extra; await banner('<small>Three Cannonball Bats</small><b>+' + sp.extra + ' SPINS</b>', 'cannon', 1200); }
        stopCycle();
      }
      showMult(0, false); await FREE_VIEW(false); stopCycle(); paintHud(n); setHudInfo('');
      openScene(); el.sceneBody.textContent = ''; await actDone(n, 'elephant'); return n;
    }
    function popCell(cell, txt) { const p = h('i', { class: 'cz-cpop' }, txt); cell.append(p); S.timeout(() => p.remove(), 900); }

    /* ===================== the bonus loop ===================== */
    async function phase(o) {
      switch (o.phase) {
        case 'cannon': return phCannon(o);
        case 'decide': return phDecide(o);
        case 'strong': return phStrong(o);
        case 'bear': return phBear(o);
        case 'fire': return phFire(o);
        case 'jester': return phJester(o);
        case 'elephant': return phElephant(o);
        default: return o;
      }
    }
    async function bonus(o, resumed) {
      showHud(true); introduced.clear(); paintHud(o); lockUi(true); stopCycle();
      if (!resumed) { crowdCheer(false); snd('drum'); await banner('<small>Three Cannonball Bats</small><b>THE CANNON!</b>', 'cannon', 1400); if (!G) return o; }
      openScene();
      let guard = 0;
      while (G && rnd && rnd.o.phase !== 'done' && guard++ < 300) {
        const n = await phase(rnd.o);
        if (n === 'stale' || !n) { await nap(300); continue; }
        rnd.o = n;
      }
      if (!G) return o;
      const fin = rnd.o; paintHud(fin);
      if (el.scene.hidden) openScene();
      el.sceneBody.textContent = ''; clearUi();
      el.sceneBody.append(h('div', { class: 'cz-over' }, h('small', null, fin.capped ? 'MAXIMUM WIN' : 'WHAT A SHOW'), h('b', null, bb(fin.total) + ' BB'), h('span', null, (fin.total / U).toFixed(fin.total % U ? 1 : 0) + '× your stake')));
      snd('calliope'); await tapOr(2100); if (!G) return fin;
      await closeScene(); showHud(false); setHudInfo('');
      return fin;
    }

    /* ===================== resume after a reload ===================== */
    (async () => {
      if (!B.online) return;
      const r = await B.play(ID, 'state', {}, 0); if (!G || !r || !r.o || !r.pending) return;
      const o = r.o; rnd = { id: r.round, o }; curStake = r.stake; unit = r.unit || Math.round(r.stake / U);
      roundCost = r.stake * (o.buy ? M.BUYS[o.buy] : 1); busy = true; lockUi(true);
      if (o.base && o.base.grid) setGrid(o.base.grid);
      setMsg('Welcome back, the show is still on!', 'gold');
      const fin = await bonus(o, true); if (!G) return;
      await finish(fin);
    })();

    G.unmount = () => { cycleTok++; };
  }

  B.registerGame({
    id: ID, name: 'Batty Circus', tagline: 'Fire the cannon. Five acts. One big top.', tag: 'Slot', section: 'slots', featured: true,
    poster: A.poster(M), rules, mount,
    unmount() { if (G) { G.unmount && G.unmount(); G.S.dispose(); } G = null; },
  });
})();
