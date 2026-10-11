/* Batty Casino platform: the Daily Prize Wheel (#wheel), the Bat Pass (#pass) and the Belfry Shop (#shop).
   Online mode only (like missions): in practice mode none of it appears. The server (lib/platform/*.php) decides
   every outcome and price; this file only draws and animates what it is sent.
   Hooks it fills in on Batty.ext (called from the shell in index.html):
     avatarParts(cos, baseAcc)  extra accessory layers, frame ring and animated effect for avatar()
     barPlatform(bar, inGame)   Bat Pass chip, wheel and shop buttons in the top bar
     passEvent(e)               tier-up / challenge / Gold celebrations from server events
     lobbyPlatform(box)         lobby widgets: Daily Wheel tile, Bat Pass strip, shop teaser
   It also decorates names and avatars wherever the shell draws them (feed, leaderboards, profiles) with the
   player's equipped frame, name style, title and badge, and adds the Locker to your own profile page. */
(function () {
  'use strict';
  const B = Batty, h = B.h, fmt = B.fmt, ext = B.ext;
  const live = () => B.online && !!B.me;
  const REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RAR = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function dur(s) {
    s = Math.max(0, Math.round(s));
    const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return d + 'd ' + hh + 'h';
    if (hh) return hh + 'h ' + m + 'm';
    if (m) return m + 'm ' + (s % 60) + 's';
    return (s % 60) + 's';
  }
  /* h:mm:ss for live cooldowns */
  const clock = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const coinSvg = () => '<span class="pl-coin">' + B.batSvg() + '</span>';

  /* ---------- server calls ----------
     call(action, data, {quiet, defer}) -> reply. Refreshes Batty.me.plat (top-bar chip, lobby) from every reply. */
  async function call(a, data, o) {
    o = o || {};
    try {
      const r = await B.api(a, data, { defer: !!o.defer });
      if (r.plat && B.me) { B.me.plat = r.plat; paintChips(); }
      if (!o.defer) B.wallet.sync();
      return r;
    } catch (e) {
      if (!o.quiet) B.ui.toast(e.message);
      throw e;
    }
  }
  let statusAt = 0, statusBusy = false;
  async function refreshStatus(force) {
    if (!live() || statusBusy || (!force && Date.now() - statusAt < 12000)) return;
    statusBusy = true; statusAt = Date.now();
    try { await call('plat_status', null, { quiet: true }); } catch (e) { /* fine */ }
    statusBusy = false;
  }

  /* ---------- sounds (synthesised) ---------- */
  const A = B.audio;
  const snd = {
    tick(speed) { A.tone({ f: 1500 + 900 * Math.min(1, speed), f2: 900, d: 0.03, type: 'square', v: 0.05 + 0.04 * Math.min(1, speed) }); A.noise({ d: 0.02, v: 0.05, hp: 3000 }); },
    whoosh() { A.noise({ d: 0.9, v: 0.12, lp: 400, f2: 4000 }); },
    thunk() { A.tone({ f: 120, f2: 55, d: 0.22, type: 'sine', v: 0.4 }); A.noise({ d: 0.08, v: 0.12, lp: 1200 }); },
    rise() { A.tone({ f: 220, f2: 880, d: 0.9, type: 'sawtooth', v: 0.05 }); },
    fanfare(big) {
      const N = B.notes;
      A.seq([N.G4, N.C5, N.E5, N.G5, 0, N.E5, [N.G5, 2], [N.C6, 4]], { step: 0.1, type: 'square', v: 0.1 });
      A.seq([N.C4, 0, N.G4, 0, N.C5, 0, [N.E5, 4]], { step: 0.1, type: 'triangle', v: 0.12 });
      if (big) { A.seq([N.C6, N.E6, N.G6, N.E6, N.G6, [N.C6 * 2, 6]], { step: 0.08, type: 'triangle', v: 0.09, t: 0.9 }); A.noise({ d: 1.4, v: 0.06, hp: 4000, t: 0.8 }); }
    },
    chime() { const N = B.notes; A.seq([N.E5, N.B5, [N.E6, 3]], { step: 0.07, type: 'sine', v: 0.16 }); },
    buy() { A.tone({ f: 880, d: 0.08, type: 'square', v: 0.06 }); A.tone({ f: 1320, d: 0.25, type: 'triangle', v: 0.12, t: 0.06 }); A.noise({ d: 0.15, v: 0.05, hp: 6000, t: 0.04 }); },
    creak() { A.tone({ f: 90, f2: 140, d: 0.35, type: 'sawtooth', v: 0.05 }); },
    burst() { A.noise({ d: 0.6, v: 0.25, lp: 2400, f2: 200 }); A.tone({ f: 80, f2: 40, d: 0.5, type: 'sine', v: 0.4 }); },
  };

  /* ================================================================================================
     COSMETICS ART. Avatar layers use the shell avatar's 100×100 space (head ~y20–86, eyes at y52).
     ================================================================================================ */
  const star4 = (x, y, r, fill) => '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';
  const twinkle = (x, y, r, fill, d, b) => '<g transform="translate(' + x + ' ' + y + ')">' + star4(0, 0, r, fill).replace('/>', '><animateTransform attributeName="transform" type="scale" values="0.3;1.15;0.3" dur="' + d + 's" begin="' + b + 's" repeatCount="indefinite"/></path>') + '</g>';
  /* acc art: {o: drawn over the head, u: drawn under the head (capes)} */
  const ACC = {
    acc_bowler: { o: '<path d="M35 31Q35 11 50 11Q65 11 65 31Z" fill="#241a30"/><path d="M39 18Q42 13 49 12.5" stroke="#fff" stroke-opacity=".28" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="35" y="24.5" width="30" height="5.5" fill="#9a1d42"/><ellipse cx="50" cy="31.5" rx="23" ry="4.6" fill="#241a30"/><ellipse cx="50" cy="30.6" rx="18" ry="1.8" fill="#3c2d50"/>' },
    acc_deerstalker: { o: '<path d="M33 32Q33 12 50 12Q67 12 67 32Z" fill="#c29a5e"/><path d="M41 13.5V32M50 12V32M59 13.5V32M33.6 19.5H66.4M33.2 26H66.8" stroke="#7d5a2c" stroke-width="1.6" opacity=".75"/><path d="M22 34Q30 27 40 31.5Z" fill="#a47c45"/><path d="M78 34Q70 27 60 31.5Z" fill="#a47c45"/><path d="M36 22Q50 6 64 22" stroke="#7d5a2c" stroke-width="2" fill="none"/><circle cx="50" cy="11.5" r="3.4" fill="#7d5a2c"/>' },
    acc_monocle: { o: '<circle cx="60" cy="52" r="11" fill="rgba(200,235,255,.22)" stroke="#ffd76a" stroke-width="2.6"/><path d="M53.5 46.5l4.5-2" stroke="#fff" stroke-width="1.8" opacity=".8" stroke-linecap="round"/><path d="M70.5 56Q78 70 68 86" stroke="#ffd76a" stroke-width="1.3" fill="none" stroke-dasharray="2 1.4"/>' },
    acc_wizard: { o: '<path d="M30 33Q41 21 51 5Q55 1.5 58 6Q61 20 70 33Z" fill="#5a33c6"/><path d="M51 5Q55 1.5 58 6Q58.5 12 60 17Q55 10 51 5Z" fill="#7a55e8"/>' + star4(45, 24, 3.6, '#ffd76a') + star4(57, 16, 2.6, '#ffd76a') + star4(60, 27, 2.2, '#fff4c2') + '<ellipse cx="50" cy="33" rx="24" ry="4.6" fill="#3f2391"/><ellipse cx="50" cy="32" rx="19" ry="1.8" fill="#6b45d9"/>' },
    acc_horns: { o: '<path d="M33 31Q21 22 27 4Q31 18 41 25Z" fill="#e2223f"/><path d="M67 31Q79 22 73 4Q69 18 59 25Z" fill="#e2223f"/><path d="M29 10Q29 19 35 25" stroke="#ff8aa0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M71 10Q71 19 65 25" stroke="#ff8aa0" stroke-width="2" fill="none" stroke-linecap="round"/>' },
    acc_hearts: { o: '<path d="M39 61L29.5 51.5A5.6 5.6 0 0 1 39 44.8A5.6 5.6 0 0 1 48.5 51.5Z" fill="#ff3d81" fill-opacity=".88" stroke="#a30d47" stroke-width="1.6"/><path d="M61 61L51.5 51.5A5.6 5.6 0 0 1 61 44.8A5.6 5.6 0 0 1 70.5 51.5Z" fill="#ff3d81" fill-opacity=".88" stroke="#a30d47" stroke-width="1.6"/><path d="M48 50H52M29.5 50L23 47M70.5 50L77 47" stroke="#a30d47" stroke-width="2"/><path d="M33 49.5l3-2.4M55 49.5l3-2.4" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".8"/>' },
    acc_cape: { u: '<path d="M15 86Q14 60 21 42L12 22L33 37Q50 32 67 37L88 22L79 42Q86 60 85 86Q50 99 15 86Z" fill="#6d0c27"/><path d="M21 42L15 27L33 38Z M79 42L85 27L67 38Z" fill="#e0304f"/><path d="M24 80Q50 90 76 80" stroke="#9e1a3c" stroke-width="2" fill="none"/>' },
    acc_pumpkin: { o: '<ellipse cx="50" cy="21" rx="19" ry="13.5" fill="#ff8a1c"/><ellipse cx="50" cy="21" rx="9" ry="13.5" fill="#ffa040"/><path d="M38 9.5Q33 21 38 33M62 9.5Q67 21 62 33" stroke="#d96500" stroke-width="2" fill="none"/><path d="M41 18l4-4 4 4zM51 18l4-4 4 4z" fill="#ffe14a"><animate attributeName="fill" values="#ffe14a;#fff7b0;#ffb200;#ffe14a" dur="1.3s" repeatCount="indefinite"/></path><path d="M40 25Q50 31 60 25L57 27.5L54 25.5L50 28L46 25.5L43 27.5Z" fill="#ffe14a"/><path d="M50 8Q49 3 53 1" stroke="#3d8a2c" stroke-width="3" fill="none" stroke-linecap="round"/>' },
    acc_viking: { o: '<path d="M31 25Q15 24 12 6Q21 17 32 18Z" fill="#f4e8cb"/><path d="M69 25Q85 24 88 6Q79 17 68 18Z" fill="#f4e8cb"/><path d="M15 11Q19 19 28 21" stroke="#c9b48a" stroke-width="1.6" fill="none"/><path d="M85 11Q81 19 72 21" stroke="#c9b48a" stroke-width="1.6" fill="none"/><path d="M30 34Q30 11 50 11Q70 11 70 34Z" fill="#8e98aa"/><path d="M36 20Q42 13 50 12.6" stroke="#fff" stroke-opacity=".45" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="29" y="28" width="42" height="6.5" rx="2" fill="#c08a2e"/><path d="M48 12V28h4V12z" fill="#c08a2e"/><circle cx="34" cy="31.2" r="1.3" fill="#ffe7a6"/><circle cx="42" cy="31.2" r="1.3" fill="#ffe7a6"/><circle cx="58" cy="31.2" r="1.3" fill="#ffe7a6"/><circle cx="66" cy="31.2" r="1.3" fill="#ffe7a6"/>' },
    acc_visor: { o: '<rect x="25" y="44.5" width="50" height="14" rx="7" fill="#12081f" stroke="#ff3d81" stroke-width="1.6"/><rect x="28" y="49.6" width="44" height="3.6" rx="1.8" fill="#ff3d81" opacity=".25"/><rect x="28" y="49.6" width="9" height="3.6" rx="1.8" fill="#ff7aa8"><animate attributeName="x" values="28;63;28" dur="1.5s" repeatCount="indefinite"/></rect><path d="M27 47Q50 44 73 47" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" fill="none"/>' },
    acc_ermine: {
      u: '<path d="M14 88Q14 58 22 40L32 37Q50 32 68 37L78 40Q86 58 86 88Q50 100 14 88Z" fill="#a3102e"/><path d="M22 40Q30 60 30 90M78 40Q70 60 70 90" stroke="#7a0a20" stroke-width="2" fill="none"/>',
      o: '<path d="M24 78Q50 92 76 78L80 90Q50 101 20 90Z" fill="#f6f2ea"/><path d="M30 86l1.5 3 1.5-3zM44 90l1.5 3 1.5-3zM58 90l1.5 3 1.5-3zM70 86l1.5 3 1.5-3z" fill="#1a1030"/>',
    },
    acc_mooncrown: { o: '<path d="M31 33L29 13L39.5 22L50 7L60.5 22L71 13L69 33Z" fill="#d9e2f2" stroke="#7d8db0" stroke-width="1.6" stroke-linejoin="round"/><path d="M33 29H67" stroke="#7d8db0" stroke-width="1.4"/><circle cx="50" cy="22.5" r="5.2" fill="#9be7ff" stroke="#3b7fb3" stroke-width="1.2"/><path d="M48 19.5a4 4 0 1 0 4.5 5.6a3.2 3.2 0 1 1 -4.5 -5.6z" fill="#fff8d6"/><circle cx="29" cy="13" r="2" fill="#ffd76a"/><circle cx="71" cy="13" r="2" fill="#ffd76a"/><circle cx="50" cy="7" r="2.2" fill="#ffd76a"/>' + twinkle(55, 18, 4, '#ffffff', 1.6, 0) },
    acc_starcape: { u: '<path d="M15 86Q14 60 21 42L12 22L33 37Q50 32 67 37L88 22L79 42Q86 60 85 86Q50 99 15 86Z" fill="#141a52"/><path d="M21 42L15 27L33 38Z M79 42L85 27L67 38Z" fill="#3a46b8"/>' + twinkle(24, 62, 3, '#fff', 1.8, 0) + twinkle(78, 58, 2.6, '#ffd76a', 2.2, 0.6) + twinkle(30, 80, 2.2, '#9be7ff', 1.6, 1.1) + twinkle(72, 78, 3, '#fff', 2.4, 0.3) + twinkle(18, 46, 2, '#ffd76a', 2, 0.9) + twinkle(83, 40, 2.2, '#fff', 1.7, 1.4) },
  };
  /* Which slot the shell's eight basic accessories occupy (none, top hat, crown, party hat, shades, bow tie, headphones, halo). */
  const BASE_SLOT = ['', 'head', 'head', 'head', 'face', 'neck', 'head', 'head'];
  const FX_HTML = {
    fx_sparkle: '<i class="pl-fx fx-sparkle"><b></b><b></b><b></b><b></b><b></b></i>',
    fx_bats: '<i class="pl-fx fx-bats"><b>' + B.batSvg() + '</b><b>' + B.batSvg() + '</b><b>' + B.batSvg() + '</b></i>',
    fx_embers: '<i class="pl-fx fx-embers"><b></b><b></b><b></b><b></b><b></b><b></b><b></b></i>',
    fx_storm: '<i class="pl-fx fx-storm"><b><svg viewBox="0 0 20 40"><path d="M12 0L2 22h7L5 40 18 14h-7z"/></svg></b><b><svg viewBox="0 0 20 40"><path d="M12 0L2 22h7L5 40 18 14h-7z"/></svg></b></i>',
    fx_eclipse: '<i class="pl-fx fx-eclipse"><b></b></i>',
  };
  /* The shell calls this from avatar(code, size, cos). Returns null when nothing is equipped. */
  ext.avatarParts = function (cos, baseAcc, baseSvg) {
    if (!cos) return null;
    const head = cos.head && ACC[cos.head], face = cos.face && ACC[cos.face], back = cos.back && ACC[cos.back];
    if (!head && !face && !back && !cos.frame && !cos.effect) return null;
    const bs = BASE_SLOT[baseAcc] || '';
    let acc = null;
    if (head || face || back) {
      /* keep the basic accessory unless a shop item takes its slot */
      const keepBase = !((bs === 'head' && head) || (bs === 'face' && face));
      acc = (keepBase ? baseSvg || '' : '') + (back && back.o ? back.o : '') + (face ? face.o : '') + (head ? head.o : '');
    }
    return {
      under: back && back.u ? back.u : '',
      acc,
      wrap(svg, size) {
        if (!cos.frame && !cos.effect) return svg;
        const fx = cos.effect && FX_HTML[cos.effect] ? FX_HTML[cos.effect] : '';
        return '<span class="pl-av' + (cos.frame ? ' ' + cos.frame : '') + (cos.effect ? ' ' + cos.effect : '') + (size < 34 ? ' sm' : '') + '" style="--sz:' + size + 'px">' + (cos.effect === 'fx_eclipse' ? fx : '') + svg + (cos.effect && cos.effect !== 'fx_eclipse' ? fx : '') + '</span>';
      },
    };
  };
  const KEY_SVG = '<svg viewBox="0 0 40 20" aria-hidden="true"><circle cx="8" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M14 8.3H37v3.4h-3v4h-3.4v-4h-3v3h-3.4v-3H14z" fill="currentColor"/></svg>';
  /* Small inline art for every item (shop cards, pass rewards, locker). */
  const EMOTE = {
    em_wave: '<svg viewBox="0 0 100 100"><g class="e-body">' + '<path d="M22 46L30 26L40 40Q50 36 60 40L70 26L78 46Q84 68 70 82Q50 96 30 82Q16 68 22 46Z" fill="#1a1030"/><circle cx="40" cy="57" r="7" fill="#fff"/><circle cx="60" cy="57" r="7" fill="#fff"/><circle cx="41" cy="58" r="3.2" fill="#1a1030"/><circle cx="61" cy="58" r="3.2" fill="#1a1030"/><path d="M42 72Q50 79 58 72" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></g><path class="e-wing" d="M76 50Q92 30 98 10Q86 18 80 14Q78 26 70 28Q70 38 76 50Z" fill="#2b1650"/></svg>',
    em_gg: '<svg viewBox="0 0 100 100"><path d="M10 18h80a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H44L26 90V74H10a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z" fill="#ffd76a" stroke="#a8660a" stroke-width="3"/><text class="e-gg" x="50" y="58" text-anchor="middle" font-family="Titan One, sans-serif" font-size="34" fill="#3b1d00">GG</text></svg>',
    em_cuppa: '<svg viewBox="0 0 100 100"><path class="e-steam" d="M40 34Q34 26 40 18Q46 10 40 2M56 34Q50 26 56 18Q62 10 56 2" stroke="#d9d4ff" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M22 40H74L68 82Q66 92 56 92H40Q30 92 28 82Z" fill="#f2f2f7" stroke="#6b3fd1" stroke-width="3"/><path d="M74 48Q90 48 88 62Q86 74 70 74" stroke="#6b3fd1" stroke-width="5" fill="none"/><rect x="24" y="40" width="48" height="6" fill="#a86a3a"/><path d="M36 62l6 6 6-6M52 62l6 6 6-6" stroke="#ff3d81" stroke-width="3" fill="none"/></svg>',
    em_cheers: '<svg viewBox="0 0 100 100"><g class="e-gl1"><path d="M18 22H44L40 52Q38 60 31 60Q24 60 22 52Z" fill="rgba(255,215,106,.85)" stroke="#fff" stroke-width="2.4"/><path d="M31 60V84M22 86H40" stroke="#fff" stroke-width="3"/></g><g class="e-gl2"><path d="M56 22H82L78 52Q76 60 69 60Q62 60 60 52Z" fill="rgba(255,215,106,.85)" stroke="#fff" stroke-width="2.4"/><path d="M69 60V84M60 86H78" stroke="#fff" stroke-width="3"/></g><g class="e-clink" fill="#fff">' + star4(50, 14, 7, '#fff') + '</g></svg>',
    em_mindblown: '<svg viewBox="0 0 100 100"><g class="e-boom"><circle cx="34" cy="22" r="11" fill="#ff8a3c"/><circle cx="50" cy="14" r="13" fill="#ffd76a"/><circle cx="66" cy="22" r="11" fill="#ff3d81"/></g><path d="M22 52L30 34L40 46Q50 42 60 46L70 34L78 52Q84 72 70 84Q50 96 30 84Q16 72 22 52Z" fill="#1a1030"/><circle cx="40" cy="62" r="8" fill="#fff"/><circle cx="60" cy="62" r="8" fill="#fff"/><circle cx="40" cy="62" r="2.4" fill="#1a1030"/><circle cx="60" cy="62" r="2.4" fill="#1a1030"/><ellipse cx="50" cy="79" rx="5" ry="6" fill="#fff"/></svg>',
    em_howl: '<svg viewBox="0 0 100 100"><circle cx="58" cy="40" r="30" fill="#ffe18a"/><circle cx="48" cy="32" r="5" fill="#f3b33c" opacity=".6"/><circle cx="68" cy="52" r="7" fill="#f3b33c" opacity=".5"/><path class="e-howl" d="M14 92L22 64L30 72Q36 66 40 70L46 58L50 76Q54 84 46 92Z" fill="#1a1030"/><path class="e-wave" d="M30 50Q24 42 30 34M22 54Q12 42 22 28" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>',
    em_rain: '<svg viewBox="0 0 100 100"><g class="e-coins"><circle cx="20" cy="20" r="8" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/><circle cx="50" cy="8" r="8" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/><circle cx="80" cy="24" r="8" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/><circle cx="34" cy="44" r="7" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/><circle cx="66" cy="50" r="7" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/></g><path d="M8 74Q50 62 92 74L88 94H12Z" fill="#6b3fd1"/><path d="M16 80Q50 70 84 80" stroke="#ffd76a" stroke-width="3" fill="none"/></svg>',
    em_bow: '<svg viewBox="0 0 100 100"><path class="e-crown" d="M22 40L18 12L34 24L50 4L66 24L82 12L78 40Z" fill="#ffd76a" stroke="#a8660a" stroke-width="3" stroke-linejoin="round"/><g class="e-bow"><path d="M22 66L30 48L40 60Q50 56 60 60L70 48L78 66Q84 84 70 92Q50 100 30 92Q16 84 22 66Z" fill="#1a1030"/><path d="M34 74q6 -4 12 0M54 74q6 -4 12 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></g></svg>',
  };
  const ICON = {
    coins: '<svg viewBox="0 0 100 100"><ellipse cx="50" cy="80" rx="32" ry="9" fill="#a8660a"/><rect x="18" y="64" width="64" height="16" fill="#e9a422"/><ellipse cx="50" cy="64" rx="32" ry="9" fill="#ffd76a"/><rect x="18" y="48" width="64" height="16" fill="#f5b52f"/><ellipse cx="50" cy="48" rx="32" ry="9" fill="#ffe08a"/><rect x="24" y="30" width="54" height="16" fill="#f5b52f" transform="rotate(-6 50 38)"/><ellipse cx="51" cy="29" rx="27" ry="8" fill="#fff0b5" transform="rotate(-6 50 30)"/><path d="M38 29c4-2 6-1 8 1 1-2 4-3 5-2-1 3 1 4 3 4 2-1 4-1 5 1" stroke="#a8660a" stroke-width="2.4" fill="none" transform="rotate(-6 50 30)"/><path d="M24 54v6M30 70v6M70 54v6" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></svg>',
    xp: '<svg viewBox="0 0 100 100"><path d="M50 4L90 27V73L50 96L10 73V27Z" fill="#0e3b3a" stroke="#58f0c8" stroke-width="5"/><path d="M56 16L30 56H48L42 84L72 40H54Z" fill="#58f0c8"/><path d="M56 16L30 56H40Z" fill="#c5fff0"/></svg>',
    spin: '<svg viewBox="0 0 100 100"><circle cx="50" cy="52" r="42" fill="#2b1650" stroke="#ffd76a" stroke-width="6"/>' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => '<path d="M50 52L' + (50 + 38 * Math.sin(i * Math.PI / 4)).toFixed(1) + ' ' + (52 - 38 * Math.cos(i * Math.PI / 4)).toFixed(1) + 'A38 38 0 0 1 ' + (50 + 38 * Math.sin((i + 1) * Math.PI / 4)).toFixed(1) + ' ' + (52 - 38 * Math.cos((i + 1) * Math.PI / 4)).toFixed(1) + 'Z" fill="' + ['#ff3d81', '#6b3fd1', '#58f0c8', '#6b3fd1', '#ffd76a', '#6b3fd1', '#4aa8ff', '#6b3fd1'][i] + '"/>').join('') + '<circle cx="50" cy="52" r="10" fill="#ffd76a" stroke="#a8660a" stroke-width="3"/><path d="M50 2L58 14H42Z" fill="#ff3d81" stroke="#fff" stroke-width="2"/></svg>',
    ticket: '<svg viewBox="0 0 100 100"><g transform="rotate(-12 50 50)"><path d="M8 28H92V42A8 8 0 0 0 92 58V72H8V58A8 8 0 0 0 8 42Z" fill="#ffd76a" stroke="#a8660a" stroke-width="3"/><path d="M28 30V70" stroke="#a8660a" stroke-width="2.4" stroke-dasharray="4 3"/><text x="61" y="56" text-anchor="middle" font-family="Titan One, sans-serif" font-size="17" fill="#6b2d00">SPIN</text>' + star4(18, 50, 6, '#a8660a') + '</g></svg>',
    boost: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#3d0e3a" stroke="#ff3d81" stroke-width="5"/><path d="M56 12L28 56H48L40 88L74 40H54Z" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/><rect x="58" y="62" width="38" height="26" rx="8" fill="#ff3d81"/><text x="77" y="81" text-anchor="middle" font-family="Titan One, sans-serif" font-size="18" fill="#fff">2×</text></svg>',
    tier: '<svg viewBox="0 0 100 100"><path d="M50 4L90 27V73L50 96L10 73V27Z" fill="#2b1650" stroke="#ffd76a" stroke-width="5"/><path d="M28 56L50 34L72 56M28 74L50 52L72 74" stroke="#ffd76a" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    key: '<svg viewBox="0 0 100 100"><ellipse cx="50" cy="80" rx="40" ry="12" fill="#6a0f2a"/><ellipse cx="50" cy="76" rx="40" ry="12" fill="#a3163e"/><g transform="rotate(-24 50 50)"><circle cx="28" cy="50" r="15" fill="none" stroke="#ffd76a" stroke-width="8"/><circle cx="28" cy="50" r="15" fill="none" stroke="#fff3bd" stroke-width="2" stroke-dasharray="10 40"/><path d="M42 46H90V54H84V64H76V54H70V61H62V54H42Z" fill="#ffd76a" stroke="#a8660a" stroke-width="2"/></g></svg>',
  };
  /* Chest art (crates): body and lid separately so the opening animation can blow the lid off. */
  function chestSvg(kind, cls) {
    const c = kind === 'cr_blood' ? { wood: '#5a0d1e', wood2: '#8a1430', band: '#ffd76a', band2: '#a8660a', glow: '#ff5d5d' } : { wood: '#2b1a5a', wood2: '#4a2f95', band: '#c9d6ea', band2: '#6d7ea0', glow: '#9be7ff' };
    return '<svg class="pl-chest ' + (cls || '') + '" viewBox="0 0 200 180" aria-hidden="true">' +
      '<ellipse cx="100" cy="168" rx="80" ry="10" fill="rgba(0,0,0,.45)"/>' +
      '<g class="ch-body"><rect x="24" y="82" width="152" height="84" rx="8" fill="' + c.wood + '"/><rect x="24" y="82" width="152" height="20" fill="' + c.wood2 + '"/>' +
      '<path d="M34 112H166M34 136H166" stroke="rgba(0,0,0,.25)" stroke-width="3"/><rect x="24" y="82" width="16" height="84" fill="' + c.band + '"/><rect x="160" y="82" width="16" height="84" fill="' + c.band + '"/><rect x="24" y="152" width="152" height="12" fill="' + c.band2 + '"/>' +
      '<rect x="86" y="92" width="28" height="34" rx="5" fill="' + c.band + '" stroke="' + c.band2 + '" stroke-width="3"/><path d="M100 102a5 5 0 0 1 3 9l2 9h-10l2-9a5 5 0 0 1 3-9z" fill="' + c.band2 + '"/></g>' +
      '<g class="ch-glow"><rect x="28" y="76" width="144" height="10" rx="5" fill="' + c.glow + '"/></g>' +
      '<g class="ch-lid"><path d="M20 84V60Q20 22 100 22Q180 22 180 60V84Z" fill="' + c.wood2 + '"/><path d="M20 84V60Q20 22 100 22Q180 22 180 60V84" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="3"/><path d="M38 84V44Q40 30 52 26M162 84V44Q160 30 148 26" stroke="' + c.band + '" stroke-width="14" fill="none"/>' +
      '<rect x="18" y="76" width="164" height="12" rx="4" fill="' + c.band + '" stroke="' + c.band2 + '" stroke-width="2"/><path d="M60 34Q100 24 140 34" stroke="#fff" stroke-opacity=".18" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      (kind === 'cr_blood' ? '<circle cx="100" cy="52" r="13" fill="#ff3d5a" stroke="#ffd76a" stroke-width="3"/><path d="M95 48a6 6 0 1 0 8 8a5 5 0 1 1 -8 -8z" fill="#2a0010"/>' : '<path d="M88 46a12 12 0 1 0 14 16a9.5 9.5 0 1 1 -14 -16z" fill="#ffd76a"/>') + '</g></svg>';
  }
  /* Preview of any item. me: the viewer's avatar code. */
  function itemArt(it, o) {
    o = o || {};
    const id = it.id || it.i;
    const cat = it.cat;
    const size = o.size || 84;
    const me = B.me || {};
    if (cat === 'acc' || cat === 'frame' || cat === 'effect') {
      const cos = {}; const slot = it.slot || (ITEMS[id] && ITEMS[id].slot);
      cos[slot || cat] = id;
      return '<span class="pl-art av">' + B.avatar(me.avatar || '3-0', size, cos) + '</span>';
    }
    if (cat === 'name') return '<span class="pl-art nm' + (size <= 64 ? ' aa' : '') + '"><b class="pl-ns ' + id + '">' + (size <= 64 ? 'Aa' : esc(me.name || 'Batty')) + '</b></span>';
    if (cat === 'title') return '<span class="pl-art ti"><b class="pl-ti r-' + (it.rarity || 'common') + '">' + esc(it.name) + '</b></span>';
    if (cat === 'emote') return '<span class="pl-art em"><i class="pl-emote ' + id + '">' + (EMOTE[id] || '') + '</i></span>';
    if (cat === 'badge') return '<span class="pl-art ic">' + ICON.key + '</span>';
    if (cat === 'crate') return '<span class="pl-art cr">' + chestSvg(id) + '</span>';
    if (id === 'tk_premium') return '<span class="pl-art ic">' + ICON.ticket + '</span>';
    if (id === 'tk_spin') return '<span class="pl-art ic">' + ICON.spin + '</span>';
    if (id === 'bo_tier') return '<span class="pl-art ic">' + ICON.tier + '</span>';
    if (cat === 'boost') return '<span class="pl-art ic">' + ICON.boost + (id === 'bo_xp24h' ? '<em class="pl-art-tag">24h</em>' : '<em class="pl-art-tag">1h</em>') + '</span>';
    if (it.t === 'bb' || it.t === 'jackpot') return '<span class="pl-art ic">' + ICON.coins + '</span>';
    if (it.t === 'xp') return '<span class="pl-art ic">' + ICON.xp + '</span>';
    return '<span class="pl-art ic">' + ICON.coins + '</span>';
  }

  /* ================================================================================================
     DECORATING NAMES AND AVATARS around the site
     ================================================================================================ */
  const cosCache = new Map(); // name -> {cos, at}
  const waiting = new Set();
  let lookupT = 0;
  function nameDecor(el, cos) {
    for (const c of [...el.classList]) if (c.startsWith('ns_')) el.classList.remove(c);
    el.classList.remove('pl-ns');
    if (cos && cos.name) el.classList.add('pl-ns', cos.name);
    const nx = el.nextElementSibling;
    if (nx && nx.classList.contains('pl-key')) nx.remove();
    if (cos && cos.badge === 'bd_key') el.insertAdjacentHTML('afterend', '<i class="pl-key" title="Lounge Key">' + KEY_SVG + '</i>');
  }
  function avatarDecor(svg, cos) {
    if (!svg || !svg.isConnected || svg.closest('.pl-av')) return;
    const code = svg.getAttribute('data-av'); const size = +svg.getAttribute('width') || 40;
    if (!code || !cos || !Object.keys(cos).length) return;
    const tmp = document.createElement('span'); tmp.innerHTML = B.avatar(code, size, cos);
    const n = tmp.firstElementChild; if (n) svg.replaceWith(n);
  }
  function applyTo(root) {
    const scope = root && root.querySelectorAll ? root : document;
    /* feed, leaderboards, lobby hero: an .ol-name with an avatar in the same row */
    scope.querySelectorAll('.ol-name:not([data-pl])').forEach((el) => {
      const name = (el.textContent || '').trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return;
      el.setAttribute('data-pl', name);
      want(name);
    });
    const ph = scope.querySelector ? (scope.matches && scope.matches('.pf-head') ? scope : scope.querySelector('.pf-head:not([data-pl])')) : null;
    if (ph && !ph.hasAttribute('data-pl')) {
      const n = ph.querySelector('.pg-h1'); const name = n && n.textContent.trim();
      if (name && /^[A-Za-z0-9_]{3,16}$/.test(name)) { ph.setAttribute('data-pl', name); want(name); }
    }
    flush();
  }
  function want(name) { const c = cosCache.get(name.toLowerCase()); if (!c || Date.now() - c.at > 60000) waiting.add(name); }
  function flush() {
    if (waiting.size) { clearTimeout(lookupT); lookupT = setTimeout(lookup, 60); }
    paintDecor();
  }
  async function lookup() {
    const names = [...waiting].slice(0, 80); names.forEach((n) => waiting.delete(n));
    if (!names.length) return;
    try {
      const r = await B.api('plat_cos', { names });
      const now = Date.now();
      for (const n of names) cosCache.set(n.toLowerCase(), { cos: null, at: now });
      for (const k in r.cos) cosCache.set(k.toLowerCase(), { cos: r.cos[k], at: now });
    } catch (e) { /* decoration is a nicety */ }
    paintDecor();
    if (waiting.size) lookup();
  }
  function cosFor(name) {
    if (B.me && name.toLowerCase() === B.me.name.toLowerCase()) return B.me.cos || null;
    const c = cosCache.get(name.toLowerCase()); return c ? c.cos : undefined;
  }
  function paintDecor() {
    document.querySelectorAll('.ol-name[data-pl]').forEach((el) => {
      const name = el.getAttribute('data-pl'); const cos = cosFor(name);
      if (cos === undefined) return;
      const key = JSON.stringify(cos || {});
      if (el.getAttribute('data-plk') === key) return;
      el.setAttribute('data-plk', key);
      nameDecor(el, cos);
      const row = el.closest('li, .ol-row');
      if (row) {
        avatarDecor(row.querySelector('svg.bc-av'), cos);
        const who = el.closest('.who'); const small = who && who.querySelector('small');
        if (small) { let t = small.querySelector('.pl-ti'); if (t) t.remove(); if (cos && cos.titleText) small.insertAdjacentHTML('beforeend', ' <b class="pl-ti mini">' + esc(cos.titleText) + '</b>'); }
      }
    });
    document.querySelectorAll('.pf-head[data-pl]').forEach((ph) => {
      const name = ph.getAttribute('data-pl'); const cos = cosFor(name);
      if (cos === undefined) return;
      avatarDecor(ph.querySelector('.pf-av svg.bc-av'), cos);
      const key = JSON.stringify(cos || {});
      if (ph.getAttribute('data-plk') === key) return;
      ph.setAttribute('data-plk', key);
      const h1 = ph.querySelector('.pg-h1'); if (h1) nameDecor(h1, cos);
      ph.querySelectorAll('.pl-pfx').forEach((n) => n.remove());
      const id = ph.querySelector('.pf-id');
      if (id && cos && (cos.titleText || cos.emote)) {
        const bits = h('div', { class: 'pl-pfx' });
        if (cos.titleText) bits.append(h('b', { class: 'pl-ti' }, cos.titleText));
        if (cos.emote && EMOTE[cos.emote]) bits.append(h('i', { class: 'pl-emote sig ' + cos.emote, title: 'Signature emote', html: EMOTE[cos.emote] }));
        h1.after(bits);
      }
    });
    /* your own profile: the Locker panel goes above the settings */
    const set = document.querySelector('.pf-settings:not([data-pl])');
    if (set && live()) { set.setAttribute('data-pl', '1'); if (ext.lockerPanel) set.before(ext.lockerPanel()); }
  }
  /* re-run when the shell draws new rows */
  let moT = 0;
  const mo = new MutationObserver(() => { if (!moT) moT = requestAnimationFrame(() => { moT = 0; if (live()) applyTo(document); }); });
  function startObserver() { mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.body) startObserver(); else addEventListener('DOMContentLoaded', startObserver);
  /* after equipping: refresh my own cached look everywhere */
  function myCosChanged(cos) {
    if (!B.me) return;
    B.me.cos = cos || {};
    cosCache.set(B.me.name.toLowerCase(), { cos: B.me.cos, at: Date.now() });
    const me = document.getElementById('bc-me'); if (me) me.innerHTML = B.avatar(B.me.avatar, 34, B.me.cos);
    document.querySelectorAll('[data-plk]').forEach((el) => { if ((el.getAttribute('data-pl') || '').toLowerCase() === B.me.name.toLowerCase()) el.removeAttribute('data-plk'); });
    paintDecor();
  }

  /* ================================================================================================
     TOP BAR: Bat Pass chip, wheel button, shop button
     ================================================================================================ */
  let chipEls = [];
  const WHEEL_ICO = '<svg viewBox="0 0 24 24" class="pl-wico"><circle cx="12" cy="12.5" r="9"/><path d="M12 12.5V3.5M12 12.5l7.8 4.5M12 12.5l-7.8 4.5M12 12.5l7.8-4.5M12 12.5l-7.8-4.5M12 12.5v9"/><path d="M9.5 1h5L12 4.6z" class="pt"/></svg>';
  const SHOP_ICO = '<svg viewBox="0 0 24 24"><path d="M4 8h16l-1.3 12.2a1 1 0 0 1-1 .8H6.3a1 1 0 0 1-1-.8z"/><path d="M8.5 10.5V6.5a3.5 3.5 0 0 1 7 0v4"/></svg>';
  ext.barPlatform = function (bar, inGame) {
    if (!live() || !B.me.plat) { chipEls = []; return; }
    const chip = h('button', { class: 'pl-chip' + (inGame ? ' ingame' : ''), type: 'button', id: 'pl-chip', 'aria-label': 'Bat Pass', title: 'Bat Pass', onclick: () => B.go('pass') });
    chipEls = [chip];
    bar.append(chip);
    if (!inGame) {
      const wb = h('button', { class: 'bc-icon pl-barbtn pl-wbtn', type: 'button', id: 'pl-wheelbtn', 'aria-label': 'Daily Prize Wheel', title: 'Daily Prize Wheel', html: WHEEL_ICO, onclick: () => B.go('wheel') });
      const sb = h('button', { class: 'bc-icon pl-barbtn pl-sbtn', type: 'button', id: 'pl-shopbtn', 'aria-label': 'The Belfry Shop', title: 'The Belfry Shop', html: SHOP_ICO, onclick: () => B.go('shop') });
      bar.append(wb, sb); chipEls.push(wb, sb);
    }
    paintChips();
  };
  function paintChips() {
    const p = B.me && B.me.plat; if (!p) return;
    for (const el of chipEls) {
      if (!el.isConnected) continue;
      if (el.id === 'pl-chip') {
        const into = p.tier >= 50 ? 1 : (p.xp % p.tierXp) / p.tierXp;
        const C = 2 * Math.PI * 15;
        el.classList.toggle('gold', !!p.gold);
        el.classList.toggle('ready', p.claimable > 0);
        el.innerHTML = '<svg viewBox="0 0 36 36" class="ring"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" style="stroke-dasharray:' + (C * into).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg><b>' + p.tier + '</b><span>Bat Pass</span>' + (p.claimable > 0 ? '<i class="dot">' + Math.min(99, p.claimable) + '</i>' : '') + (p.boostIn > 0 ? '<i class="boost" title="Double Pass XP">2×</i>' : '');
      } else if (el.id === 'pl-wheelbtn') {
        const ready = p.wheelReady || p.spins > 0;
        el.classList.toggle('ready', ready);
        el.querySelector('.dot') && el.querySelector('.dot').remove();
        if (ready) el.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
      }
    }
  }
  /* keep the chip fresh while playing */
  B.wallet.on(() => { if (live() && chipEls.length) refreshStatus(false); });

  /* ================================================================================================
     EVENTS from the server: tier-ups, challenges, Gold
     ================================================================================================ */
  let banner = null;
  ext.passEvent = function (e) {
    if (e.kind === 'challenge') {
      B.ui.toast((e.weekly ? 'Weekly challenge done: ' : 'Challenge done: ') + e.label + ' · +' + fmt(e.xp) + ' Pass XP', 3800);
      snd.chime();
      refreshStatus(true);
      return;
    }
    if (e.kind === 'gold') return; // the pass page celebrates Gold itself
    if (e.kind === 'tier') {
      refreshStatus(true);
      if (banner) banner.remove();
      banner = h('div', { class: 'pl-tierup' + (e.gold ? ' gold' : ''), role: 'status', onclick: () => B.go('pass') },
        h('div', { class: 'pl-tierup-badge' }, h('b', null, String(e.tier))),
        h('div', { class: 'pl-tierup-txt' }, h('small', null, 'Bat Pass'), h('strong', null, 'Tier ' + e.tier + ' reached!'), h('span', null, e.tier >= 50 ? 'You have finished the season. Legend.' : 'New rewards are waiting. Tap to claim.')));
      document.body.append(banner);
      B.sfx('level'); setTimeout(() => snd.chime(), 380);
      const r = banner.getBoundingClientRect();
      setTimeout(() => B.fx.burst({ x: r.left + 40, y: r.top + r.height / 2, kind: 'confetti', count: 36, power: 0.8 }), 250);
      const mine = banner;
      setTimeout(() => { mine.classList.add('out'); setTimeout(() => mine.remove(), 500); }, 4600);
    }
  };

  /* ================================================================================================
     THE DAILY PRIZE WHEEL (#wheel)
     Physics: the wheel spins up the moment you press (a small back-kick, then acceleration) while the server draws
     the prize; when the reply lands we plan a deceleration ω(t) = ω0·(1 − t/T)^k that stops exactly on the
     drawn segment. Pegs on the rim flick a two-part pointer (a damped spring) and click with a pitch that follows
     the speed. Bulbs chase with the wheel.
     ================================================================================================ */
  const NSEG = 12, SEG = 360 / NSEG;
  const short = (n) => (n >= 1e6 ? (n / 1e6) + 'M' : n >= 100000 ? Math.round(n / 1000) + 'K' : fmt(n));
  const ITEM_LBL = { bo_xp1h: ['2× XP', '1 HOUR'], tk_premium: ['TICKET', 'PREMIUM'], cr_night: ['CRATE', 'NIGHT'], cr_blood: ['CRATE', 'BLOOD MOON'] };
  const PAL = {
    daily: { bb: [['#4b1fa0', '#2c1063'], ['#3a1683', '#210a4c']], xp: ['#17b394', '#0b5b52'], item: ['#ff3d81', '#8e0f45'], jackpot: ['#ffe58a', '#d18b10'], rim: ['#fff1b0', '#e2a325', '#8a5207'], hub: ['#fff6cf', '#ffcf4a', '#b8770c'] },
    premium: { bb: [['#2a2a38', '#0f0f18'], ['#3a0d1d', '#16030a']], xp: ['#1f6f8f', '#0a2a3a'], item: ['#c0183c', '#4d0718'], jackpot: ['#ffe58a', '#d18b10'], rim: ['#ffe9a8', '#c9871a', '#5e3504'], hub: ['#2a0e18', '#7a1028', '#1a0810'] },
  };
  function pt(a, r) { const t = a * Math.PI / 180; return [r * Math.sin(t), -r * Math.cos(t)]; }
  function wedge(a0, a1, r0, r1) {
    const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + 'L' + x2.toFixed(2) + ' ' + y2.toFixed(2) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + x3.toFixed(2) + ' ' + y3.toFixed(2) + 'Z';
  }
  /* Build the wheel SVG. uid keeps gradient ids unique on the page. */
  function wheelSvg(segs, kind, uid, golden) {
    const P = PAL[kind];
    let defs = '<defs>' +
      '<radialGradient id="' + uid + 'rim" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="' + P.rim[0] + '"/><stop offset=".55" stop-color="' + P.rim[1] + '"/><stop offset="1" stop-color="' + P.rim[2] + '"/></radialGradient>' +
      '<linearGradient id="' + uid + 'rimL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + P.rim[0] + '"/><stop offset=".5" stop-color="' + P.rim[1] + '"/><stop offset="1" stop-color="' + P.rim[2] + '"/></linearGradient>' +
      '<radialGradient id="' + uid + 'hub" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="' + P.hub[0] + '"/><stop offset=".5" stop-color="' + P.hub[1] + '"/><stop offset="1" stop-color="' + P.hub[2] + '"/></radialGradient>' +
      '<radialGradient id="' + uid + 'shade" cx="50%" cy="50%" r="50%"><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".86" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>' +
      '<radialGradient id="' + uid + 'bulb" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#fff6c4"/><stop offset="1" stop-color="#ffb627"/></radialGradient>';
    let wedges = '', labels = '', pegs = '';
    segs.forEach((s, i) => {
      const c = s.t === 'bb' ? P.bb[i % 2] : P[s.t] || P.item;
      defs += '<radialGradient id="' + uid + 's' + i + '" cx="0" cy="0" r="212" gradientUnits="userSpaceOnUse"><stop offset=".2" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[0] + '"/></radialGradient>';
      wedges += '<path d="' + wedge(i * SEG - SEG / 2, i * SEG + SEG / 2, 0, 212) + '" fill="url(#' + uid + 's' + i + ')"/>';
      let big, small, ico = '', col = '#fff', stroke = 'rgba(0,0,0,.45)';
      if (s.t === 'bb') { big = short(s.n); small = 'BATTY BUCKS'; }
      else if (s.t === 'xp') { big = short(s.n); small = 'PASS XP'; ico = 'xp'; }
      else if (s.t === 'jackpot') { big = short(s.n); small = 'JACKPOT'; col = '#5a2a00'; stroke = 'rgba(255,255,255,.55)'; ico = 'crown'; }
      else { const l = ITEM_LBL[s.i] || [s.name || 'PRIZE', '']; big = l[0]; small = l[1]; ico = s.i; }
      const fs = ico ? (big.length > 5 ? 22 : 26) : big.length > 6 ? 27 : big.length > 4 ? 32 : 36;
      labels += '<g transform="rotate(' + (i * SEG) + ')">' +
        (ico ? '<g transform="translate(0 -176) scale(.8)">' + segIcon(ico) + '</g>' : '') +
        '<text transform="translate(0 ' + (ico ? -146 : -192) + ') rotate(90)" text-anchor="start" dominant-baseline="central" class="wl-big" font-size="' + fs + '" fill="' + col + '" stroke="' + stroke + '" stroke-width="5" paint-order="stroke">' + esc(big) + '</text>' +
        '<text transform="translate(-' + (fs * 0.62).toFixed(1) + ' ' + (ico ? -146 : -192) + ') rotate(90)" text-anchor="start" dominant-baseline="central" class="wl-small" fill="' + (s.t === 'jackpot' ? '#7a3c00' : 'rgba(255,255,255,.75)') + '">' + esc(small) + '</text></g>';
      const [px, py] = pt(i * SEG + SEG / 2, 203);
      pegs += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="5.5" fill="url(#' + uid + 'rimL)" stroke="#5e3504" stroke-width="1.5"/>';
      const [lx0, ly0] = pt(i * SEG + SEG / 2, 52), [lx1, ly1] = pt(i * SEG + SEG / 2, 212);
      wedges += '<path d="M' + lx0.toFixed(1) + ' ' + ly0.toFixed(1) + 'L' + lx1.toFixed(1) + ' ' + ly1.toFixed(1) + '" stroke="url(#' + uid + 'rimL)" stroke-width="3"/>';
    });
    defs += '</defs>';
    let bulbs = '';
    for (let i = 0; i < 24; i++) { const [x, y] = pt(i * 15 + 7.5, 226); bulbs += '<g class="wl-bulb" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><circle class="g" r="13"/><circle class="b" r="6.2"/><circle class="s" r="2.2" cx="-1.8" cy="-1.8"/></g>'; }
    const hubTxt = kind === 'premium' ? '<text y="16" text-anchor="middle" class="wl-hubt" fill="#ffd76a">PREMIUM</text>' : golden ? '<text y="16" text-anchor="middle" class="wl-hubt" fill="#6b2d00">GOLDEN</text>' : '';
    return '<svg class="wl-svg ' + kind + (golden ? ' golden' : '') + '" viewBox="-262 -290 524 556" aria-hidden="true">' + defs +
      '<circle r="252" fill="rgba(0,0,0,.45)" transform="translate(0 10)"/>' +
      '<circle r="246" fill="url(#' + uid + 'rimL)"/><circle r="238" fill="url(#' + uid + 'rim)"/><circle r="214" fill="#1a0b2e"/>' +
      '<g class="wl-bulbs">' + bulbs + '</g>' +
      '<g class="wl-rot">' + wedges + '<circle r="212" fill="url(#' + uid + 'shade)"/>' + labels + pegs + '<path class="wl-hl" d=""/></g>' +
      '<circle r="54" fill="url(#' + uid + 'rimL)"/><circle r="46" fill="url(#' + uid + 'hub)"/><circle r="46" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>' +
      '<g transform="translate(0 ' + (hubTxt ? -6 : 0) + ') scale(.5) translate(-60 -29)"><path d="' + B.batPath + '" fill="' + (kind === 'premium' ? '#ffd76a' : '#2a1046') + '"/></g>' + hubTxt +
      /* the pointer: a base that pivots on the rim and a flexible tip that lags behind it */
      '<g class="wl-ptr" transform="translate(0 -250)"><g class="wl-ptr-base"><path d="M-22 -22Q0 -38 22 -22L14 4H-14Z" fill="url(#' + uid + 'rimL)" stroke="#5e3504" stroke-width="2.5"/><circle cy="-14" r="7" fill="#ff3d81" stroke="#fff" stroke-width="2"/>' +
      '<g class="wl-ptr-tip" transform="translate(0 2)"><path d="M-15 0H15L2 46Q0 50 -2 46Z" fill="#ff3d81" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M-6 4L0 32" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/></g></g></g>' +
      '</svg>';
  }
  function segIcon(k) {
    if (k === 'xp') return '<path d="M0 -24L21 -12V12L0 24L-21 12V-12Z" fill="#0e3b3a" stroke="#58f0c8" stroke-width="3"/><path d="M3 -16L-10 3H-1L-4 17L10 -3H1Z" fill="#58f0c8"/>';
    if (k === 'crown') return '<path d="M-24 12L-26 -14L-12 -2L0 -22L12 -2L26 -14L24 12Z" fill="#fff6cf" stroke="#7a3c00" stroke-width="3" stroke-linejoin="round"/>';
    if (k === 'bo_xp1h') return '<circle r="22" fill="#3d0e3a" stroke="#ffd76a" stroke-width="3"/><path d="M4 -16L-10 4H0L-4 18L10 -4H0Z" fill="#ffd76a"/>';
    if (k === 'tk_premium') return '<g transform="rotate(-10)"><path d="M-26 -13H26V-5A5 5 0 0 0 26 5V13H-26V5A5 5 0 0 0 -26 -5Z" fill="#ffd76a" stroke="#7a3c00" stroke-width="2.5"/><path d="M-12 -11V11" stroke="#7a3c00" stroke-width="2" stroke-dasharray="3 2"/></g>';
    if (k === 'cr_night' || k === 'cr_blood') return '<g transform="translate(-25 -24) scale(.25)">' + chestSvg(k).replace(/^<svg[^>]*>/, '').replace('</svg>', '') + '</g>';
    return '';
  }

  B.registerPage('wheel', {
    title: 'Prize Wheel', auth: true,
    mount(root) {
      if (!live()) { root.append(h('div', { class: 'pg-wrap' }, h('h1', { class: 'pg-h1' }, 'Prize Wheel'), h('p', null, 'The Prize Wheel needs an online account.'))); return null; }
      const S = B.scope();
      let st = null, kind = 'daily', busy = false;
      const stage = h('div', { class: 'wl-stage' });
      const wrap = h('div', { class: 'wl-wrap' });
      const rays = h('div', { class: 'wl-rays', 'aria-hidden': 'true' });
      const reveal = h('div', { class: 'wl-reveal', hidden: true, role: 'status', 'aria-live': 'polite' });
      stage.append(rays, wrap, reveal);
      const tabs = h('div', { class: 'ol-seg wl-tabs', role: 'tablist' });
      const cal = h('div', { class: 'wl-cal' });
      const streakTxt = h('p', { class: 'wl-streak' });
      const btnMain = h('button', { class: 'bc-btn wl-go', type: 'button', id: 'wl-spin' });
      const btnAlt = h('button', { class: 'bc-btn ghost wl-go2', type: 'button', id: 'wl-spin2' });
      const note = h('p', { class: 'wl-note' });
      const recent = h('ol', { class: 'wl-recent' });
      const odds = h('button', { class: 'ol-more wl-odds', type: 'button' }, 'Prizes and odds');
      const side = h('div', { class: 'wl-side' },
        h('header', { class: 'wl-head' }, h('small', null, 'The Belfry presents'), h('h1', null, 'Prize Wheel')),
        tabs,
        h('section', { class: 'wl-card wl-streakcard' }, streakTxt, cal),
        h('div', { class: 'wl-btns' }, btnMain, btnAlt), note,
        h('section', { class: 'wl-card' }, h('header', null, h('b', null, 'Recent spins'), odds), recent));
      const page = h('div', { class: 'wl-page' }, h('div', { class: 'wl-sky', 'aria-hidden': 'true' }), stage, side);
      root.append(page);

      /* ---- wheel motion state ---- */
      let ang = 0, omega = 0, phase = 'idle', plan = null, t0 = 0, ptr = 0, ptrV = 0, tip = 0, tipV = 0, lastPeg = 0, lastTick = 0, chase = 0, idleT = 0, flash = 0;
      let svg, rot, ptrBase, ptrTip, bulbs = [], hl;
      const W_MAX = REDUCE ? 600 : 840;
      function draw() {
        const segs = kind === 'premium' ? st.premium : st.daily;
        wrap.innerHTML = wheelSvg(segs, kind, 'wl' + kind, kind === 'daily' && st.streak.golden);
        svg = wrap.firstChild; rot = svg.querySelector('.wl-rot'); ptrBase = svg.querySelector('.wl-ptr-base'); ptrTip = svg.querySelector('.wl-ptr-tip'); hl = svg.querySelector('.wl-hl');
        bulbs = [...svg.querySelectorAll('.wl-bulb')];
        stage.classList.toggle('premium', kind === 'premium');
        stage.classList.toggle('golden', kind === 'daily' && st.streak.golden);
        paintWheel();
      }
      function paintWheel() {
        if (!rot) return;
        rot.setAttribute('transform', 'rotate(' + ang.toFixed(3) + ')');
        ptrBase.setAttribute('transform', 'rotate(' + ptr.toFixed(2) + ')');
        ptrTip.setAttribute('transform', 'translate(0 2) rotate(' + (tip * 0.9).toFixed(2) + ')');
        const n = bulbs.length;
        for (let i = 0; i < n; i++) {
          let on;
          if (flash > 0) on = Math.floor(flash * 8) % 2 === 0;
          else if (phase === 'idle') on = (i + Math.floor(chase)) % 4 < 2;
          else on = (i + Math.floor(chase)) % 3 === 0;
          bulbs[i].classList.toggle('on', on);
        }
      }
      /* the deceleration plan from the current angle/speed to land on segment idx */
      function planStop(idx) {
        const k = 2.3, want = REDUCE ? 1.3 : 4.6;
        const jitter = (Math.random() - 0.5) * SEG * 0.62;
        const target = ((-idx * SEG + jitter) % 360 + 360) % 360;
        const cur = ((ang % 360) + 360) % 360;
        const dmin = ((target - cur) % 360 + 360) % 360;
        const w = Math.max(omega, 200);
        const ideal = (w * want) / (k + 1);
        const turns = Math.max(REDUCE ? 0 : 1, Math.round((ideal - dmin) / 360));
        const D = dmin + 360 * turns;
        plan = { from: ang, D, k, T: (D * (k + 1)) / w, w };
        t0 = performance.now(); phase = 'stop';
      }
      S.loop((dt, now) => {
        const prev = ang;
        if (phase === 'idle') { idleT += dt; ang += dt * 6; chase += dt * 5; }
        else if (phase === 'kick') { const k = Math.min(1, (now - t0) / 170); ang = plan.from - 7 * Math.sin(k * Math.PI / 2); if (k >= 1) { phase = 'up'; t0 = now; plan.from = ang; omega = 0; } }
        else if (phase === 'up') { omega = Math.min(W_MAX, omega + W_MAX * dt / 0.45); ang += omega * dt; if (pendingIdx != null && omega >= W_MAX * 0.98 && now - t0 > 500) { planStop(pendingIdx); pendingIdx = null; } }
        else if (phase === 'stop') {
          const s = Math.min(1, (now - t0) / 1000 / plan.T);
          ang = plan.from + plan.D * (1 - Math.pow(1 - s, plan.k + 1));
          omega = plan.w * Math.pow(1 - s, plan.k);
          if (s >= 1) { ang = plan.from + plan.D; omega = 0; phase = 'landed'; landed(); }
        } else if (phase === 'landed') { /* hold */ }
        if (phase !== 'idle') chase += Math.abs(ang - prev) / 15;
        /* pegs flick the pointer */
        const pegIdx = Math.floor((ang + SEG / 2) / SEG);
        if (pegIdx !== lastPeg) {
          const sp = Math.min(1, Math.abs(ang - prev) / dt / 900);
          lastPeg = pegIdx;
          if (phase !== 'idle') {
            ptrV -= 220 + 520 * sp; tipV -= 150 + 300 * sp;
            if (now - lastTick > 28) { snd.tick(sp); lastTick = now; }
          }
        }
        /* damped springs: base (stiff) and tip (softer, lags) */
        ptrV += (-260 * ptr - 16 * ptrV) * dt; ptr += ptrV * dt; ptr = Math.max(-30, Math.min(8, ptr));
        tipV += (-180 * (tip - ptr * 0.6) - 11 * tipV) * dt; tip += tipV * dt; tip = Math.max(-34, Math.min(14, tip));
        if (flash > 0) flash = Math.max(0, flash - dt);
        paintWheel();
      });

      /* ---- the spin ---- */
      let pendingIdx = null, result = null;
      async function spin(which) {
        if (busy || !st) return;
        const wantKind = which === 'premium' ? 'premium' : 'daily';
        if (wantKind !== kind) { kind = wantKind; draw(); paintSide(); }
        busy = true; paintSide(); reveal.hidden = true; hl.setAttribute('d', '');
        stage.classList.add('spinning'); stage.classList.remove('won', 'jackpot');
        B.audio.ensure(); snd.whoosh(); B.sfx('click');
        plan = { from: ang }; t0 = performance.now(); phase = REDUCE ? 'up' : 'kick'; omega = 0; pendingIdx = null;
        try {
          const r = await call('plat_wheel_spin', { kind: which }, { defer: true, quiet: true });
          result = r;
          st.spins = r.spins; st.tickets = r.tickets; st.streak = r.streak;
          if (kind === 'premium') st.premium = r.segments; else st.daily = r.segments;
          /* labels might have changed (level-up, streak day): redraw keeping the angle */
          const keep = ang; draw(); ang = keep;
          pendingIdx = r.seg;
          if (phase === 'up' && omega >= W_MAX * 0.98) { planStop(pendingIdx); pendingIdx = null; }
        } catch (e) {
          B.ui.toast(e.message);
          plan = { from: ang, D: Math.max(90, omega * 0.6), k: 2, T: 1.2, w: Math.max(omega, 100) }; t0 = performance.now(); phase = 'stop'; result = null;
        }
      }
      function landed() {
        stage.classList.remove('spinning');
        snd.thunk();
        ptrV -= 120;
        if (!result) { busy = false; phase = 'idle'; paintSide(); return; }
        const r = result, p = r.prize, i = r.seg;
        hl.setAttribute('d', wedge(i * SEG - SEG / 2, i * SEG + SEG / 2, 52, 212));
        flash = 1.6;
        const big = p.t === 'jackpot';
        stage.classList.add('won'); if (big) stage.classList.add('jackpot');
        const box = wrap.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height * 0.53;
        B.fx.burst({ x: cx, y: box.top + box.height * 0.08, kind: 'spark', count: 30, power: 0.7 });
        S.timeout(() => {
          B.fx.burst({ x: cx, y: cy, kind: p.t === 'bb' || big ? 'coin' : 'confetti', count: big ? 90 : 46, power: big ? 1.5 : 1.05 });
          B.fx.burst({ x: cx, y: cy, kind: 'confetti', count: big ? 70 : 30, power: 1.2 });
          if (big) { B.fx.rain('coin', 3600); stage.classList.add('shake'); S.timeout(() => stage.classList.remove('shake'), 700); }
          snd.fanfare(big || (p.t === 'bb' && p.n >= (st.claim || 2500) * 3));
          showReveal(r);
        }, 260);
      }
      function prizeText(p) {
        if (p.t === 'bb') return [fmt(p.n), 'Batty Bucks'];
        if (p.t === 'jackpot') return [fmt(p.n), 'Batty Bucks · JACKPOT'];
        if (p.t === 'xp') return ['+' + fmt(p.n), 'Bat Pass XP'];
        return [p.name, p.dup ? 'Already owned: +' + fmt(p.dup) + ' BB instead' : (p.i === 'bo_xp1h' ? 'Saved to your Locker. Use it when you like.' : p.i === 'tk_premium' ? 'One spin of the Premium Wheel' : 'Open it from your Locker or the shop')];
      }
      function showReveal(r) {
        const p = r.prize, [big, sub] = prizeText(p);
        const amt = h('b', { class: 'wl-amt' }, p.t === 'bb' || p.t === 'jackpot' ? '0' : big);
        reveal.textContent = '';
        reveal.className = 'wl-reveal t-' + p.t;
        reveal.append(
          h('div', { class: 'wl-rv-card' },
            h('small', null, p.t === 'jackpot' ? 'JACKPOT!' : r.kind === 'premium' ? 'Premium Wheel' : r.kind === 'bonus' ? 'Bonus spin' : 'Daily Wheel · Day ' + r.streak.day),
            h('span', { class: 'wl-rv-art', html: itemArt(p.t === 'item' ? { id: p.i, cat: p.i.startsWith('cr_') ? 'crate' : p.i.startsWith('bo_') ? 'boost' : 'ticket' } : p, { size: 90 }) }),
            amt, h('span', { class: 'wl-sub' }, sub),
            h('button', { class: 'bc-btn', type: 'button', id: 'wl-collect', onclick: collect }, p.t === 'item' || p.t === 'xp' ? 'Lovely' : 'Collect')));
        reveal.hidden = false;
        if (p.t === 'bb' || p.t === 'jackpot') {
          const tk = S.interval(() => B.sfx('tick'), 70);
          B.ui.countUp(amt, 0, p.n, p.t === 'jackpot' ? 2400 : 1100).then(() => { S.clear(tk); });
        }
        S.timeout(collect, 9000);
        paintSide(); paintRecent(r);
      }
      let collected = true;
      function collect() {
        if (reveal.hidden) return;
        reveal.hidden = true; hl.setAttribute('d', '');
        B.wallet.sync();
        stage.classList.remove('won', 'jackpot');
        busy = false; phase = 'idle';
        paintSide();
        refreshStatus(true);
      }
      function paintRecent(r) {
        if (r) st.recent.unshift({ kind: r.kind, prize: r.prize.t === 'item' ? r.prize.i : r.prize.t, amount: r.prize.n, at: Date.now() / 1000 });
        recent.textContent = '';
        if (!st.recent.length) recent.append(h('li', { class: 'ol-empty' }, 'No spins yet. Your first one is on the house.'));
        for (const x of st.recent.slice(0, 6)) {
          const nm = x.prize === 'bb' ? fmt(x.amount) + ' BB' : x.prize === 'jackpot' ? fmt(x.amount) + ' BB jackpot' : x.prize === 'xp' ? '+' + fmt(x.amount) + ' Pass XP' : (ITEM_LBL[x.prize] ? ({ bo_xp1h: 'Double XP (1 hour)', tk_premium: 'Premium ticket', cr_night: 'Night Crate', cr_blood: 'Blood Moon Crate' })[x.prize] : x.prize);
          recent.append(h('li', { class: 'p-' + x.prize }, h('span', null, x.kind === 'premium' ? 'Premium' : x.kind === 'bonus' ? 'Bonus' : 'Daily'), h('b', null, nm)));
        }
      }
      function paintSide() {
        if (!st) return;
        tabs.textContent = '';
        for (const [k, n] of [['daily', 'Daily Wheel'], ['premium', 'Premium Wheel']]) {
          const b = h('button', { type: 'button', role: 'tab', class: k === kind ? 'on' : '', 'aria-selected': k === kind, disabled: busy }, n);
          b.onclick = () => { if (busy || kind === k) return; kind = k; B.sfx('click'); wrap.classList.add('swap'); S.timeout(() => { draw(); wrap.classList.remove('swap'); }, 180); paintSide(); };
          tabs.append(b);
        }
        const s = st.streak;
        streakTxt.innerHTML = s.spunToday
          ? '<b>Day ' + s.day + '</b> of your streak is banked. Come back tomorrow for <b>Day ' + (s.day % 7 + 1) + ' ×' + (s.day === 7 ? 1 : s.calendar[s.day].mult) + '</b>. Next free spin in <b class="wl-cd">' + clock(s.nextIn) + '</b>.'
          : s.streak > 1 ? 'You are on a <b>' + s.streak + '-day streak</b>. Today is <b>Day ' + s.day + ' ×' + s.mult + '</b>' + (s.golden ? ': the <b>Golden Spin</b>, with the jackpot four times as likely.' : '.') : 'Spin every day to build a streak: prizes grow each day, and <b>Day 7 is the Golden Spin</b>.';
        cal.textContent = '';
        for (const c of s.calendar) cal.append(h('div', { class: 'wl-day ' + c.state + (c.golden ? ' gold' : '') }, h('small', null, 'Day ' + c.d), h('b', null, '×' + c.mult), h('i', { 'aria-hidden': 'true', html: c.state === 'done' ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : c.golden ? '<svg viewBox="0 0 24 24"><path d="M3 18L2 7l5.5 4.5L12 3l4.5 8.5L22 7l-1 11z"/></svg>' : '' })));
        const free = !s.spunToday;
        if (kind === 'daily') {
          btnMain.textContent = free ? 'Spin free · Day ' + s.day : st.spins > 0 ? 'Bonus spin (' + st.spins + ' left)' : '';
          btnMain.classList.toggle('cool', !free && !st.spins);
          if (!free && !st.spins) btnMain.append(h('small', null, 'Next free spin in'), h('b', { class: 'wl-cd' }, clock(s.nextIn)));
          btnMain.disabled = busy || (!free && !st.spins);
          btnMain.onclick = () => spin(free ? 'free' : 'bonus');
          btnMain.classList.toggle('ready', !busy && (free || st.spins > 0));
          btnAlt.textContent = st.tickets > 0 ? 'Premium Wheel (' + st.tickets + ' ticket' + (st.tickets > 1 ? 's' : '') + ')' : 'Try the Premium Wheel';
          btnAlt.onclick = () => { kind = 'premium'; draw(); paintSide(); };
          btnAlt.disabled = busy;
          note.innerHTML = free ? 'Prizes scale with your level. Today’s multiplier: <b>×' + s.mult + '</b>.' : st.spins > 0 ? 'Bonus spins come from the Bat Pass and use your streak multiplier (×' + s.mult + ').' : 'Earn bonus spins on the <a href="#pass">Bat Pass</a>, or try the Premium Wheel.';
        } else {
          btnMain.textContent = st.tickets > 0 ? 'Spin · use 1 ticket (' + st.tickets + ')' : 'Spin for ' + fmt(st.price) + ' BB';
          btnMain.disabled = busy || (st.tickets < 1 && B.wallet.balance < st.price);
          btnMain.onclick = () => spin('premium');
          btnMain.classList.toggle('ready', !busy);
          btnAlt.textContent = 'Back to the Daily Wheel';
          btnAlt.onclick = () => { kind = 'daily'; draw(); paintSide(); };
          btnAlt.disabled = busy;
          note.innerHTML = 'Premium prizes are fixed: up to <b>1,000,000 BB</b>, crates, XP and boosts. Tickets come from the Bat Pass or the shop.';
        }
      }
      function oddsModal() {
        const tbl = (segs) => '<table><tr><th>Prize</th><th>Chance</th></tr>' + segs.map((s) => '<tr><td>' + (s.t === 'bb' ? fmt(s.n) + ' BB' : s.t === 'jackpot' ? '<b>Jackpot: ' + fmt(s.n) + ' BB</b>' : s.t === 'xp' ? fmt(s.n) + ' Bat Pass XP' : esc(s.name)) + '</td><td>' + s.p + '%</td></tr>').join('') + '</table>';
        B.ui.modal('Prizes and odds', '<h3>Daily Wheel (today, at ×' + st.streak.mult + ')</h3><p>One free spin every UK day. Batty Bucks prizes are based on your hourly bonus (' + fmt(st.claim) + ' BB at your level) and grow with your streak: ' + st.streak.calendar.map((c) => '×' + c.mult).join(', ') + '. Day 7 is the Golden Spin, with the jackpot four times as likely. Miss a day and the streak starts again.</p>' + tbl(st.daily) +
          '<h3>Premium Wheel</h3><p>' + fmt(st.price) + ' BB a spin, or one Premium Wheel Ticket. Prizes are fixed.</p>' + tbl(st.premium) +
          '<p class="rtp">Every spin is drawn on the server. Batty Bucks have no cash value and cannot be bought, sold or cashed out.</p>');
      }
      odds.onclick = oddsModal;
      S.on(document, 'keydown', (e) => { if ((e.code === 'Space' || e.key === ' ') && !e.repeat && document.activeElement === document.body) { e.preventDefault(); if (!reveal.hidden) collect(); else if (!btnMain.disabled) btnMain.click(); } });
      S.on(reveal, 'click', (e) => { if (e.target === reveal) collect(); });
      /* the cooldown ticks every second; at UK midnight the free spin comes back */
      let reloading = false;
      S.interval(() => {
        if (!st) return;
        st.streak.nextIn = Math.max(0, st.streak.nextIn - 1);
        page.querySelectorAll('.wl-cd').forEach((el) => { el.textContent = clock(st.streak.nextIn); });
        if (st.streak.nextIn <= 0 && st.streak.spunToday && !busy && !reloading) {
          reloading = true;
          call('plat_wheel', null, { quiet: true }).then((r) => { if (S.dead) return; st = r; draw(); paintSide(); paintRecent(); refreshStatus(true); }).catch(() => {}).then(() => { reloading = false; });
        }
      }, 1000);

      wrap.innerHTML = '<div class="bc-loading"><span>' + B.batSvg() + '</span>Fetching the wheel</div>';
      call('plat_wheel', null).then((r) => {
        if (S.dead) return;
        st = r;
        kind = 'daily';
        draw(); paintSide(); paintRecent();
      }).catch(() => { wrap.textContent = 'The wheel is having a lie-down. Try again in a moment.'; });
      return { destroy() { S.dispose(); if (!reveal.hidden) B.wallet.sync(); } };
    },
  });

  /* ================================================================================================
     THE BAT PASS (#pass)
     ================================================================================================ */
  const CAT_OF = (id) => (id.startsWith('cr_') ? 'crate' : id.startsWith('bo_') ? 'boost' : id.startsWith('tk_') ? 'ticket' : null);
  function grantLabel(g) {
    if (g.t === 'bb') return fmt(g.n) + ' BB';
    if (g.i === 'tk_spin') return g.n > 1 ? g.n + ' Bonus Spins' : 'Bonus Spin';
    if (g.i === 'tk_premium') return g.n > 1 ? g.n + ' Premium Tickets' : 'Premium Ticket';
    return (g.n > 1 ? g.n + '× ' : '') + g.name;
  }
  const CAT_NAME = { acc: 'Accessory', frame: 'Frame', name: 'Name style', title: 'Title', emote: 'Emote', effect: 'Effect', badge: 'Badge', boost: 'Boost', ticket: 'Ticket', crate: 'Crate' };
  function grantArt(g, size) { return g.t === 'bb' ? itemArt({ t: 'bb' }) : itemArt({ id: g.i, cat: g.cat || CAT_OF(g.i), name: g.name, rarity: g.rarity, slot: g.slot }, { size: size || 64 }); }
  /* A sheet listing what you just received, with Equip buttons for cosmetics. */
  function rewardSheet(title, got) {
    const list = h('div', { class: 'bp-sheet' });
    const merged = [];
    for (const g of got) {
      const same = g.t === 'bb' ? merged.find((m) => m.t === 'bb') : merged.find((m) => m.i === g.i);
      if (same && (g.t === 'bb' || CAT_OF(g.i))) { same.n += g.n; continue; }
      merged.push(Object.assign({}, g));
    }
    for (const g of merged) {
      const cos = g.cat && !CAT_OF(g.i) && g.t !== 'bb';
      const row = h('div', { class: 'bp-sheet-row r-' + (g.rarity || 'common') },
        h('span', { class: 'bp-sheet-art', html: grantArt(g, 56) }),
        h('div', null, h('b', null, grantLabel(g)), h('small', null, g.t === 'bb' ? 'Batty Bucks' : (g.dup ? 'Already owned: +' + fmt(g.dup) + ' BB' : (RAR[g.rarity] || '') + ' ' + (CAT_NAME[g.cat] || '')))));
      if (cos && !g.dup && g.cat !== 'emote') {
        const eq = h('button', { class: 'bc-btn sm', type: 'button' }, 'Equip');
        eq.onclick = async () => { eq.disabled = true; try { const r = await call('plat_equip', { item: g.i }); myCosChanged(r.equipped); eq.textContent = 'Equipped'; B.sfx('ding'); } catch (e) { eq.disabled = false; } };
        row.append(eq);
      }
      list.append(row);
    }
    return B.ui.modal(title, list);
  }

  B.registerPage('pass', {
    title: 'Bat Pass', auth: true,
    mount(root) {
      if (!live()) { root.append(h('div', { class: 'pg-wrap' }, h('h1', { class: 'pg-h1' }, 'Bat Pass'), h('p', null, 'The Bat Pass needs an online account.'))); return null; }
      const S = B.scope();
      const page = h('div', { class: 'bp-page' }, h('div', { class: 'bc-loading' }, h('span', { html: B.batSvg() }), 'Opening the Bat Pass'));
      root.append(page);
      let st = null, colW = 136;
      async function load(first) {
        try { st = await call('plat_pass', null); } catch (e) { page.textContent = e.message; return; }
        if (S.dead) return;
        paint(first);
      }
      function paint(first) {
        const tier = st.tier, into = tier >= st.tiers ? st.tierXp : st.xp - tier * st.tierXp, frac = tier >= st.tiers ? 1 : into / st.tierXp;
        let seen = null; try { seen = JSON.parse(localStorage.getItem('pl-pass-seen') || 'null'); } catch (e) {}
        const fromXp = first && seen && seen.s === st.season && seen.xp < st.xp ? seen.xp : st.xp;
        try { localStorage.setItem('pl-pass-seen', JSON.stringify({ s: st.season, xp: st.xp })); } catch (e) {}
        const claimable = st.rewards.reduce((n, r) => n + (r.tier <= tier && !r.fc ? 1 : 0) + (st.gold && r.tier <= tier && !r.gc ? 1 : 0), 0);
        page.textContent = '';
        page.classList.toggle('gold', st.gold);
        /* ---- hero ---- */
        const bar = h('div', { class: 'bp-xpbar' }, h('i', { style: { width: (fromXp === st.xp ? frac * 100 : 0) + '%' } }), h('span', null));
        const medal = h('div', { class: 'bp-medal' + (st.gold ? ' gold' : '') }, h('small', null, 'Tier'), h('b', null, String(tier)));
        const claimAll = h('button', { class: 'bc-btn bp-claimall' + (claimable ? ' ready' : ''), type: 'button', id: 'bp-claimall', disabled: !claimable }, claimable ? 'Claim all (' + claimable + ')' : tier ? 'All claimed' : 'Nothing to claim yet');
        claimAll.onclick = () => claimEverything(claimAll);
        const hero = h('section', { class: 'bp-hero' },
          h('div', { class: 'bp-hero-l' },
            h('span', { class: 'bp-season' }, 'Season ' + st.season + ' · ' + st.name),
            h('h1', { class: 'bp-title' }, 'Bat Pass', st.gold ? h('em', null, 'Gold') : null),
            h('p', { class: 'bp-ends' }, 'Ends in ', h('b', { class: 'bp-cd' }, dur(st.endsIn)), ' · ' + st.tiers + ' tiers · ' + fmt(st.tierXp) + ' XP each'),
            h('div', { class: 'bp-prog' }, medal, h('div', { class: 'bp-progtxt' },
              h('b', null, tier >= st.tiers ? 'Season complete!' : fmt(into) + ' / ' + fmt(st.tierXp) + ' XP'),
              h('small', null, tier >= st.tiers ? 'Every tier unlocked. What a bat.' : 'to tier ' + (tier + 1)),
              bar,
              st.boostIn > 0 ? h('span', { class: 'bp-boost' }, 'Double Pass XP · ' + dur(st.boostIn) + ' left') : null)),
            h('div', { class: 'bp-actions' }, claimAll, st.gold ? null : h('button', { class: 'bc-btn gold bp-buy', type: 'button', id: 'bp-gold', onclick: () => buyGold(false) }, 'Unlock Gold'))),
          h('div', { class: 'bp-hero-art', 'aria-hidden': 'true', html: passArt(st.gold) }));
        page.append(hero);
        if (fromXp !== st.xp) S.timeout(() => { bar.firstChild.style.width = frac * 100 + '%'; if (Math.floor(fromXp / st.tierXp) < tier) { medal.classList.add('pop'); B.sfx('level'); B.fx.burst({ el: medal, kind: 'confetti', count: 40 }); } }, 450);
        /* ---- gold offer ---- */
        if (!st.gold) {
          const picks = [50, 35, 25, 20].map((t) => st.rewards[t - 1].g[0]);
          const gtotal = st.rewards.reduce((n, r) => n + r.g.filter((g) => g.t === 'bb').reduce((a, g) => a + g.n, 0), 0);
          page.append(h('section', { class: 'bp-goldcta' },
            h('div', { class: 'bp-gc-txt' }, h('b', null, 'Go Gold'), h('p', null, 'Unlock the Gold track: a reward on every tier, ' + fmt(gtotal) + ' Batty Bucks in all, the Eclipse Aura, the Starlit Cape, Disco names and the title Lord of the Belfry. Rewards for tiers you have already reached unlock at once.')),
            h('div', { class: 'bp-gc-picks' }, ...picks.map((g) => h('span', { class: 'bp-gc-pick r-' + g.rarity, title: g.name, html: grantArt(g, 58) }))),
            h('div', { class: 'bp-gc-btns' },
              h('button', { class: 'bc-btn gold', type: 'button', id: 'bp-buy-gold', onclick: () => buyGold(false) }, 'Gold · ' + fmt(st.price) + ' BB'),
              h('button', { class: 'bc-btn ghost', type: 'button', id: 'bp-buy-bundle', onclick: () => buyGold(true) }, 'Gold + 10 tiers · ' + fmt(st.bundle) + ' BB'))));
        }
        /* ---- the track ---- */
        const track = h('div', { class: 'bp-track', style: { '--cols': st.tiers } });
        const fill = h('div', { class: 'bp-line' }, h('i', { style: { width: 'calc(' + (Math.min(st.tiers, tier + frac) / st.tiers * 100) + '% )' } }));
        track.append(fill);
        for (const r of st.rewards) {
          const reached = r.tier <= tier;
          const col = h('div', { class: 'bp-col' + (reached ? ' reached' : '') + (r.tier === tier + 1 ? ' next' : '') + (r.tier % 5 === 0 ? ' major' : ''), 'data-tier': r.tier });
          col.append(rewardCard(r, 'f', reached), h('div', { class: 'bp-node' }, h('b', null, String(r.tier))), rewardCard(r, 'g', reached));
          track.append(col);
        }
        const scroller = h('div', { class: 'bp-scroll', tabindex: '0', 'aria-label': 'Bat Pass rewards' }, track);
        const left = h('button', { class: 'bp-arrow l', type: 'button', 'aria-label': 'Earlier tiers', html: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', onclick: () => scroller.scrollBy({ left: -colW * 4, behavior: 'smooth' }) });
        const right = h('button', { class: 'bp-arrow r', type: 'button', 'aria-label': 'Later tiers', html: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>', onclick: () => scroller.scrollBy({ left: colW * 4, behavior: 'smooth' }) });
        page.append(h('section', { class: 'bp-trackbox' }, h('div', { class: 'bp-lanes', 'aria-hidden': 'true' }, h('b', { class: 'f' }, 'Free'), h('b', { class: 'g' }, 'Gold')), scroller, left, right));
        S.on(scroller, 'wheel', (e) => {
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          const max = scroller.scrollWidth - scroller.clientWidth;
          if ((e.deltaY > 0 && scroller.scrollLeft >= max - 1) || (e.deltaY < 0 && scroller.scrollLeft <= 0)) return;
          e.preventDefault(); scroller.scrollLeft += e.deltaY;
        }, { passive: false });
        let drag = null;
        S.on(scroller, 'pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.target.closest('button')) return; drag = { x: e.clientX, l: scroller.scrollLeft, moved: false }; });
        S.on(window, 'pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) { drag.moved = true; scroller.classList.add('drag'); } scroller.scrollLeft = drag.l - dx; });
        S.on(window, 'pointerup', () => { drag = null; scroller.classList.remove('drag'); });
        requestAnimationFrame(() => {
          const c = track.querySelector('.bp-col'); if (c) colW = c.getBoundingClientRect().width;
          const target = track.querySelector('.bp-col[data-tier="' + Math.max(1, Math.min(st.tiers, tier + (tier < st.tiers ? 1 : 0))) + '"]');
          if (target) scroller.scrollLeft = target.offsetLeft - scroller.clientWidth / 2 + colW / 2;
        });
        /* ---- challenges ---- */
        const ch = st.challenges;
        const chList = (arr) => h('div', { class: 'bp-chl' }, ...arr.map((c) => h('div', { class: 'bp-ch' + (c.done ? ' done' : '') },
          h('span', { class: 'bp-ch-ico', html: c.done ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ICON.xp }),
          h('div', null, h('b', null, c.label), h('div', { class: 'ol-bar' }, h('i', { style: { width: Math.min(100, c.progress / c.target * 100) + '%' } })), h('small', null, c.done ? 'Done' : fmt(Math.min(c.progress, c.target)) + ' / ' + fmt(c.target))),
          h('em', null, '+' + fmt(c.xp) + ' XP'))));
        page.append(h('section', { class: 'bp-chals' },
          h('div', { class: 'ol-panel' }, h('header', null, h('h2', null, 'Daily challenges'), h('small', null, 'New ones in ' + dur(ch.dailyIn))), chList(ch.daily)),
          h('div', { class: 'ol-panel' }, h('header', null, h('h2', null, 'Weekly challenges'), h('small', null, 'New ones in ' + dur(ch.weeklyIn))), chList(ch.weekly))));
        page.append(h('section', { class: 'bp-how ol-panel' }, h('header', null, h('h2', null, 'How Bat Pass XP works')),
          h('ul', null,
            h('li', null, h('b', null, 'Play anything. '), 'Every round earns XP, a little more for bigger stakes (about 2 XP at 20 BB, 9 at 1,000 BB). After 3,000 XP from play in a UK day the rate halves, and after 6,000 it quarters. ', h('span', { class: 'bp-rate' }, 'Today: ' + fmt(st.dayXp) + ' XP from play, rate ×' + st.rate + '.')),
            h('li', null, h('b', null, 'Challenges. '), 'Three daily and three weekly; XP lands the moment you finish one.'),
            h('li', null, h('b', null, 'The wheel and boosts. '), 'The Daily Wheel can drop XP, Double Pass XP doubles XP from play, and a Tier Skip is worth a whole tier.'),
            h('li', null, h('b', null, 'Gold. '), 'Gold costs Batty Bucks only and lasts for this season. Batty Bucks have no cash value.'))));
      }
      function rewardCard(r, track, reached) {
        const grants = r[track], claimed = track === 'f' ? r.fc : r.gc, locked = track === 'g' && !st.gold;
        const g = grants[0];
        const can = reached && !claimed && !locked;
        const card = h('div', { class: 'bp-card ' + track + ' r-' + (g.rarity || (g.t === 'bb' ? 'bb' : 'common')) + (claimed ? ' claimed' : '') + (can ? ' can' : '') + (locked ? ' locked' : '') + (!reached ? ' future' : '') + (grants.length > 1 ? ' multi' : '') },
          h('span', { class: 'bp-art', html: grantArt(g, 60) }),
          h('b', { class: 'bp-lbl' }, grants.map(grantLabel).join(' + ')),
          h('small', null, g.t === 'bb' ? 'Batty Bucks' : (RAR[g.rarity] || '') + ' ' + (CAT_NAME[g.cat] || '')));
        if (claimed) card.append(h('i', { class: 'bp-tick', html: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' }));
        else if (locked) card.append(h('i', { class: 'bp-lock', html: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>' }));
        if (can) {
          const btn = h('button', { class: 'bp-claim', type: 'button', id: 'bp-claim-' + track + r.tier }, 'Claim');
          btn.onclick = async () => {
            btn.disabled = true;
            try {
              const res = await call('plat_pass_claim', { tier: r.tier, track });
              if (track === 'f') r.fc = true; else r.gc = true;
              snd.buy(); B.fx.burst({ el: card, kind: g.t === 'bb' ? 'coin' : 'confetti', count: 26 });
              card.classList.add('popped');
              const cos = res.got.find((x) => x.cat && !CAT_OF(x.i) && x.t !== 'bb');
              if (cos) rewardSheet('Tier ' + r.tier + ' reward', res.got);
              else B.ui.toast('Claimed: ' + res.got.map(grantLabel).join(', ') + (res.got.some((x) => x.dup) ? ' (duplicate paid as BB)' : ''));
              S.timeout(() => paint(false), 420);
            } catch (e) { btn.disabled = false; }
          };
          card.append(btn);
        }
        return card;
      }
      async function claimEverything(btn) {
        btn.disabled = true;
        const cards = [...page.querySelectorAll('.bp-card.can')];
        try {
          const res = await call('plat_pass_claim', { all: true });
          snd.fanfare(false);
          cards.forEach((c, i) => S.timeout(() => { c.classList.add('popped'); if (i < 14) B.fx.burst({ el: c, kind: i % 2 ? 'coin' : 'confetti', count: 14, power: 0.7 }); B.sfx('chip'); }, i * 70));
          S.timeout(() => { rewardSheet('You claimed ' + plural(res.got.length, 'reward'), res.got); load(false); }, Math.min(1400, cards.length * 70 + 300));
        } catch (e) { btn.disabled = false; }
      }
      function buyGold(bundle) {
        const price = bundle ? st.bundle : st.price;
        const after = B.wallet.balance - price;
        const body = h('div', { class: 'bp-confirm' },
          h('div', { class: 'bp-confirm-art', html: passArt(true) }),
          h('p', null, bundle ? 'Bat Pass Gold for Season ' + st.season + ', plus 10 tiers (10,000 XP) straight away.' : 'Bat Pass Gold for Season ' + st.season + ': the Gold track unlocks, including every tier you have already reached.'),
          h('p', { class: 'bp-confirm-price' }, h('b', null, fmt(price) + ' BB'), h('small', null, after >= 0 ? 'Balance afterwards: ' + fmt(after) + ' BB' : 'You need ' + fmt(-after) + ' more Batty Bucks.')),
          h('small', { class: 'bp-confirm-note' }, 'Paid in Batty Bucks only. Batty Bucks have no cash value; nothing here costs real money.'));
        const go = h('button', { class: 'bc-btn gold', type: 'button', id: 'bp-confirm', disabled: after < 0 }, 'Unlock Gold');
        body.append(go);
        const m = B.ui.modal(bundle ? 'Gold + 10 tiers' : 'Bat Pass Gold', body);
        go.onclick = async () => {
          go.disabled = true;
          try {
            await call('plat_pass_buy', { bundle: bundle ? 1 : 0 }, { defer: true });
            m.close(); goldShow(); B.wallet.sync(); load(false);
          } catch (e) { go.disabled = false; }
        };
      }
      function goldShow() {
        const el = h('div', { class: 'bp-goldshow', role: 'status' }, h('div', null, h('div', { class: 'bp-gs-art', html: passArt(true) }), h('h2', null, 'Gold unlocked'), h('p', null, 'Every Gold reward is yours to claim as you climb.')));
        document.body.append(el);
        snd.fanfare(true); B.fx.rain('coin', 2600);
        const done = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
        setTimeout(done, 3200); el.addEventListener('click', done);
      }
      S.interval(() => { if (st) { st.endsIn = Math.max(0, st.endsIn - 60); const cd = page.querySelector('.bp-cd'); if (cd) cd.textContent = dur(st.endsIn); } }, 60000);
      load(true);
      return { destroy() { S.dispose(); } };
    },
  });
  /* The Bat Pass emblem: a bat over a shield. */
  function passArt(gold) {
    const a = gold ? ['#fff3bd', '#ffd76a', '#c9860f', '#6b3a00'] : ['#d9c8ff', '#8a5cf0', '#4b23a8', '#1a0b2e'];
    return '<svg viewBox="0 0 200 220" class="bp-emblem"><path d="M100 8L180 36V112Q180 176 100 212Q20 176 20 112V36Z" fill="' + a[3] + '" stroke="' + a[1] + '" stroke-width="8"/>' +
      '<path d="M100 24L166 47V112Q166 164 100 196Q34 164 34 112V47Z" fill="none" stroke="' + a[0] + '" stroke-opacity=".35" stroke-width="3"/>' +
      '<circle cx="100" cy="92" r="46" fill="' + a[1] + '" opacity=".18"/><g transform="translate(40 70)"><path d="' + B.batPath + '" fill="' + a[1] + '"/></g>' +
      '<path d="M54 150H146" stroke="' + a[1] + '" stroke-width="6" stroke-linecap="round"/><text x="100" y="180" text-anchor="middle" font-family="Titan One, sans-serif" font-size="22" fill="' + a[0] + '">' + (gold ? 'GOLD' : 'PASS') + '</text></svg>';
  }

  /* ================================================================================================
     THE BELFRY SHOP (#shop), MYSTERY CRATES and THE LOCKER
     ================================================================================================ */
  const ITEMS = {}; // id -> item, from the last shop fetch
  let shopCache = null, shopAt = 0;
  async function shopData(force) {
    if (!force && shopCache && Date.now() - shopAt < 30000) return shopCache;
    const r = await call('plat_shop', null, { quiet: true });
    for (const it of r.items) ITEMS[it.id] = it;
    shopCache = r; shopAt = Date.now();
    return r;
  }
  const CATS = [
    ['featured', 'Featured'], ['acc', 'Accessories'], ['frame', 'Frames'], ['name', 'Name Styles'], ['title', 'Titles'],
    ['emote', 'Emotes'], ['effect', 'Effects'], ['boost', 'Boosts & Tickets'], ['crate', 'Mystery Crates'], ['badge', 'Lounge Key'], ['locker', 'Your Locker'],
  ];
  const SLOT_NAME = { head: 'Head', face: 'Face', back: 'Back', frame: 'Frame', name: 'Name style', title: 'Title', emote: 'Signature emote', effect: 'Effect', badge: 'Badge' };
  const isCos = (it) => ['acc', 'frame', 'name', 'title', 'emote', 'effect', 'badge'].includes(it.cat);
  const srcNote = (it) => (it.source === 'pass' ? 'Bat Pass reward' : it.source === 'crate' ? 'Crates only' : '');

  /* Equip / unequip, used by the shop, the Locker and reward sheets. */
  async function equip(it, on) {
    const r = await call('plat_equip', on ? { item: it.id } : { slot: it.slot });
    myCosChanged(r.equipped);
    if (shopCache) shopCache.equipped = r.equipped;
    B.sfx(on ? 'ding' : 'click');
    return r.equipped;
  }
  /* Use a boost / open a crate / spin a ticket from the Locker. */
  async function useItem(it, after) {
    if (it.cat === 'crate') return openCrate(it.id, false, after);
    if (it.cat === 'ticket') return B.go('wheel');
    const r = await call('plat_use', { item: it.id });
    if (shopCache) shopCache.owned = r.owned;
    snd.buy(); B.ui.toast(r.msg + (it.id === 'bo_tier' ? '' : ' for ' + (it.id === 'bo_xp1h' ? 'an hour' : '24 hours')));
    if (after) after();
  }

  /* ---- buying ---- */
  function buyModal(it, after) {
    const cos = isCos(it);
    let qty = 1;
    const price = () => it.price * qty;
    const priceEl = h('b', null), afterEl = h('small', null);
    const q = h('div', { class: 'sh-qty' });
    const paintQ = () => {
      priceEl.innerHTML = coinSvg() + fmt(price()) + ' BB';
      const a = B.wallet.balance - price();
      afterEl.textContent = a >= 0 ? 'Balance afterwards: ' + fmt(a) + ' BB' : 'You need ' + fmt(-a) + ' more Batty Bucks.';
      go.disabled = a < 0;
      q.textContent = '';
      if (!cos) {
        const m = h('button', { type: 'button', 'aria-label': 'Fewer', disabled: qty <= 1 }, '−'), p = h('button', { type: 'button', 'aria-label': 'More', disabled: qty >= 10 }, '+');
        m.onclick = () => { qty = Math.max(1, qty - 1); B.sfx('click'); paintQ(); }; p.onclick = () => { qty = Math.min(10, qty + 1); B.sfx('click'); paintQ(); };
        q.append(m, h('output', null, '×' + qty), p);
      }
    };
    const go = h('button', { class: 'bc-btn', type: 'button', id: 'sh-confirm' }, 'Buy');
    const body = h('div', { class: 'sh-buy r-' + it.rarity },
      h('div', { class: 'sh-buy-prev', html: itemArt(it, { size: 120 }) }),
      h('div', { class: 'sh-buy-info' },
        h('span', { class: 'sh-rar r-' + it.rarity }, RAR[it.rarity]), h('h3', null, it.name), h('p', null, it.desc),
        q, h('p', { class: 'sh-buy-price' }, priceEl, afterEl), go,
        h('small', { class: 'sh-buy-note' }, 'Paid in Batty Bucks. No real money, ever.')));
    paintQ();
    const m = B.ui.modal(cos ? 'Add to your collection' : 'Buy', body);
    go.onclick = async () => {
      go.disabled = true;
      try {
        const r = await call('plat_shop_buy', { item: it.id, qty });
        if (shopCache) shopCache.owned = r.owned;
        snd.buy(); B.fx.burst({ el: go, kind: 'coin', count: 22 });
        body.classList.add('bought');
        const done = h('div', { class: 'sh-bought' }, h('b', null, cos ? 'It’s yours!' : 'Added to your Locker'), h('span', null, cos ? it.name + ' is in your Locker.' : qty + '× ' + it.name));
        const btns = h('div', { class: 'sh-bought-btns' });
        if (cos) { const eq = h('button', { class: 'bc-btn', type: 'button', id: 'sh-equipnow' }, 'Equip now'); eq.onclick = async () => { eq.disabled = true; try { await equip(it, true); m.close(); if (after) after(); } catch (e) { eq.disabled = false; } }; btns.append(eq); }
        else if (it.cat === 'crate') { const op = h('button', { class: 'bc-btn', type: 'button' }, 'Open it now'); op.onclick = () => { m.close(); openCrate(it.id, false, after); }; btns.append(op); }
        else if (it.cat === 'boost') { const us = h('button', { class: 'bc-btn', type: 'button' }, it.id === 'bo_tier' ? 'Use now' : 'Start the boost'); us.onclick = async () => { us.disabled = true; try { await useItem(it); m.close(); if (after) after(); } catch (e) { us.disabled = false; } }; btns.append(us); }
        else if (it.cat === 'ticket') btns.append(h('a', { class: 'bc-btn', href: '#wheel' }, 'Spin it'));
        btns.append(h('button', { class: 'bc-btn ghost', type: 'button', onclick: () => { m.close(); if (after) after(); } }, 'Keep shopping'));
        done.append(btns);
        go.replaceWith(done);
        if (after) after();
      } catch (e) { go.disabled = false; }
    };
  }

  /* ---- Mystery Crates: the opening show ---- */
  const RCOL = { common: '#b8c7da', rare: '#4aa8ff', epic: '#c44dff', legendary: '#ffb627' };
  async function openCrate(crate, buy, after) {
    const veil = h('div', { class: 'cr-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Opening a crate' });
    const rays = h('div', { class: 'cr-rays' });
    const chest = h('div', { class: 'cr-chest', html: chestSvg(crate) });
    const card = h('div', { class: 'cr-card', hidden: true });
    const hint = h('p', { class: 'cr-hint' }, 'Unlocking…');
    veil.append(rays, chest, card, hint);
    document.body.append(veil);
    B.audio.ensure();
    let skip = false, res = null, err = null;
    veil.addEventListener('click', () => { skip = true; });
    const wait = (ms) => new Promise((r) => setTimeout(r, skip || REDUCE ? Math.min(ms, 60) : ms));
    const req = call('plat_crate', { item: crate, buy: buy ? 1 : 0 }, { quiet: true }).then((r) => { res = r; if (shopCache) shopCache.owned = r.owned; }).catch((e) => { err = e; });
    chest.classList.add('drop'); await wait(520); snd.thunk();
    await req;
    if (err) { veil.remove(); B.ui.toast(err.message); return; }
    const rar = res.rarity, col = RCOL[rar];
    veil.style.setProperty('--rc', col);
    hint.textContent = 'Tap to skip';
    /* three shakes; the seam glows white, then flips to the rarity colour on the last one */
    for (let i = 0; i < 3; i++) {
      chest.classList.remove('shake'); void chest.offsetWidth; chest.classList.add('shake');
      chest.style.setProperty('--glow', i < 2 ? '#ffffff' : col);
      chest.style.setProperty('--gi', String(0.35 + i * 0.3));
      snd.creak(); B.sfx('drum');
      await wait(560 - i * 80);
    }
    chest.classList.add('open'); veil.classList.add('opened', 'r-' + rar);
    snd.burst(); if (rar === 'legendary' || rar === 'epic') snd.fanfare(rar === 'legendary'); else snd.chime();
    const box = chest.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height * 0.45;
    B.fx.burst({ x: cx, y: cy, kind: 'spark', count: 50, power: 1.2, colors: [col, '#ffffff', col] });
    B.fx.burst({ x: cx, y: cy, kind: 'confetti', count: rar === 'legendary' ? 90 : 40, power: 1.3 });
    if (rar === 'legendary') B.fx.rain('confetti', 2600);
    await wait(380);
    const it = res.item; ITEMS[it.id] = Object.assign(ITEMS[it.id] || {}, it);
    card.className = 'cr-card r-' + rar;
    card.append(
      h('span', { class: 'cr-rar' }, RAR[rar] + '!'),
      h('div', { class: 'cr-prev', html: itemArt(it, { size: 120 }) }),
      h('b', null, it.name), h('small', null, CAT_NAME[it.cat] + (res.rolled !== rar ? ' · you had every ' + RAR[res.rolled] + ' item, so you got the next best thing' : '')));
    const btns = h('div', { class: 'cr-btns' });
    if (it.cat !== 'emote' || true) { const eq = h('button', { class: 'bc-btn', type: 'button', id: 'cr-equip' }, 'Equip'); eq.onclick = async (e) => { e.stopPropagation(); eq.disabled = true; try { await equip(it, true); eq.textContent = 'Equipped'; } catch (er) { eq.disabled = false; } }; btns.append(eq); }
    const again = h('button', { class: 'bc-btn ghost', type: 'button', id: 'cr-again' }, 'Open another');
    again.onclick = (e) => { e.stopPropagation(); veil.remove(); const own = shopCache && shopCache.owned[crate] > 0; openCrate(crate, !own, after); };
    const close = h('button', { class: 'bc-btn ghost', type: 'button', id: 'cr-done' }, 'Done');
    close.onclick = (e) => { e.stopPropagation(); veil.remove(); if (after) after(); };
    btns.append(again, close);
    card.append(btns);
    card.hidden = false; hint.textContent = '';
    skip = false;
    B.wallet.sync();
    if (after) after();
  }

  /* ---- item cards ---- */
  function itemCard(it, d, refresh) {
    const owned = (d.owned[it.id] || 0) > 0, eq = isCos(it) && d.equipped[it.slot] === it.id;
    const card = h('article', { class: 'sh-card r-' + it.rarity + (owned && isCos(it) ? ' owned' : '') + (eq ? ' equipped' : '') + (it.was ? ' deal' : ''), id: 'sh-' + it.id },
      h('span', { class: 'sh-rar r-' + it.rarity }, RAR[it.rarity]),
      it.was ? h('span', { class: 'sh-dealtag' }, '25% off tonight') : null,
      h('div', { class: 'sh-prev', html: itemArt(it, { size: 92 }) }),
      h('h3', null, it.name), h('p', null, it.desc));
    const foot = h('footer');
    if (isCos(it) && owned) {
      const b = h('button', { class: 'bc-btn sm' + (eq ? ' ghost' : ''), type: 'button' }, eq ? 'Unequip' : 'Equip');
      b.onclick = async () => { b.disabled = true; try { await equip(it, !eq); refresh(); } catch (e) { b.disabled = false; } };
      foot.append(eq ? h('span', { class: 'sh-on' }, 'Wearing') : h('span', { class: 'sh-owned' }, 'Owned'), b);
    } else if (it.price > 0) {
      const b = h('button', { class: 'bc-btn sm sh-price', type: 'button', html: (it.was ? '<s>' + fmt(it.was) + '</s>' : '') + coinSvg() + fmt(it.price) });
      b.onclick = () => (it.cat === 'crate' ? crateBuy(it, d, refresh) : buyModal(it, refresh));
      foot.append(!isCos(it) && owned ? h('span', { class: 'sh-owned' }, 'You have ' + d.owned[it.id]) : h('span'), b);
    } else foot.append(h('span', { class: 'sh-src' }, srcNote(it)));
    card.append(foot);
    return card;
  }
  function crateBuy(it, d, refresh) { openCrate(it.id, !(d.owned[it.id] > 0), refresh); }
  function crateSection(d, refresh) {
    const out = h('div', { class: 'sh-crates' });
    for (const id of ['cr_night', 'cr_blood']) {
      const it = ITEMS[id], odds = d.odds[id], own = d.owned[id] || 0;
      const bars = h('div', { class: 'sh-odds' }, ...Object.keys(odds).map((r) => h('div', { class: 'sh-odd r-' + r }, h('span', null, RAR[r]), h('i', null, h('b', { style: { width: Math.max(2, odds[r]) + '%' } })), h('em', null, odds[r] + '%'))));
      const openB = h('button', { class: 'bc-btn', type: 'button', id: 'sh-open-' + id }, own ? 'Open (' + own + ' owned)' : 'Buy & open');
      openB.onclick = () => openCrate(id, !own, refresh);
      const buyB = h('button', { class: 'bc-btn ghost', type: 'button', html: 'Buy ' + coinSvg() + fmt(it.price) });
      buyB.onclick = () => buyModal(it, refresh);
      out.append(h('article', { class: 'sh-crate ' + id },
        h('div', { class: 'sh-crate-art', html: chestSvg(id, 'idle') }),
        h('div', { class: 'sh-crate-info' }, h('h3', null, it.name), h('p', null, it.desc), h('b', { class: 'sh-crate-price', html: coinSvg() + fmt(it.price) + ' BB' }), bars, h('div', { class: 'sh-crate-btns' }, openB, buyB))));
    }
    out.append(h('p', { class: 'sh-fine' }, 'Crates hold cosmetics only: never Batty Bucks, boosts or anything that changes a game. You never get a duplicate: if you already own everything at the rarity you roll, you get one from the nearest rarity you have not finished. If you own everything a crate can hold, it will not open and nothing is spent.'));
    return out;
  }

  /* ---- the Locker (shop tab and your profile) ---- */
  function lockerView(d, refresh, compact) {
    const out = h('div', { class: 'lk' + (compact ? ' compact' : '') });
    const mine = Object.keys(d.owned).filter((id) => ITEMS[id] && d.owned[id] > 0);
    const cos = mine.map((id) => ITEMS[id]).filter(isCos);
    const cons = mine.map((id) => ITEMS[id]).filter((it) => !isCos(it));
    if (d.boostIn > 0) out.append(h('p', { class: 'lk-boost' }, h('b', null, 'Double Pass XP is on'), ' · ' + dur(d.boostIn) + ' left'));
    if (cons.length) {
      const row = h('div', { class: 'lk-cons' });
      for (const it of cons) {
        const b = h('button', { class: 'bc-btn sm', type: 'button' }, it.cat === 'crate' ? 'Open' : it.cat === 'ticket' ? 'Spin' : 'Use');
        b.onclick = async () => { b.disabled = true; try { await useItem(it, refresh); } catch (e) { /* toasted */ } b.disabled = false; };
        row.append(h('div', { class: 'lk-con r-' + it.rarity }, h('span', { class: 'lk-art', html: itemArt(it, { size: 48 }) }), h('div', null, h('b', null, it.name), h('small', null, '×' + d.owned[it.id])), b));
      }
      out.append(h('h3', { class: 'lk-h' }, 'Boosts, tickets and crates'), row);
    }
    out.append(h('h3', { class: 'lk-h' }, 'Cosmetics', h('small', null, cos.length + ' owned')));
    if (!cos.length) out.append(h('p', { class: 'ol-empty' }, 'Nothing here yet. Visit the shop, open a crate or climb the Bat Pass.'));
    const grid = h('div', { class: 'lk-grid' });
    for (const slot of Object.keys(SLOT_NAME)) {
      const items = cos.filter((it) => it.slot === slot);
      if (!items.length) continue;
      for (const it of items) {
        const on = d.equipped[slot] === it.id;
        const t = h('button', { class: 'lk-tile r-' + it.rarity + (on ? ' on' : ''), type: 'button', 'aria-pressed': on, title: (on ? 'Unequip ' : 'Equip ') + it.name },
          h('span', { class: 'lk-art', html: itemArt(it, { size: 56 }) }), h('b', null, it.name), h('small', null, SLOT_NAME[slot] + (on ? ' · on' : '')));
        t.onclick = async () => { t.disabled = true; try { await equip(it, !on); refresh(); } catch (e) { t.disabled = false; } };
        grid.append(t);
      }
    }
    out.append(grid);
    return out;
  }
  ext.lockerPanel = function () {
    const box = h('section', { class: 'ol-panel lk-panel', id: 'pl-locker' }, h('header', null, h('h2', null, 'Your Locker'), h('a', { href: '#shop', class: 'ol-more' }, 'Visit the shop')), h('p', { class: 'ol-empty' }, 'Opening your Locker'));
    const draw = async (force) => {
      try {
        const d = await shopData(force);
        box.querySelectorAll('.lk, .ol-empty').forEach((n) => n.remove());
        box.append(lockerView(d, () => draw(true), true));
      } catch (e) { /* the locker is optional */ }
    };
    draw(true);
    return box;
  };

  B.registerPage('shop', {
    title: 'The Belfry Shop', auth: true,
    mount(root, param) {
      if (!live()) { root.append(h('div', { class: 'pg-wrap' }, h('h1', { class: 'pg-h1' }, 'The Belfry Shop'), h('p', null, 'The shop needs an online account.'))); return null; }
      const S = B.scope();
      let cat = CATS.some((c) => c[0] === param) ? param : 'featured', d = null;
      const fit = h('div', { class: 'sh-fit' });
      const tabs = h('nav', { class: 'sh-tabs', 'aria-label': 'Shop categories' });
      const body = h('div', { class: 'sh-body' });
      const dealBox = h('div', { class: 'sh-deal' });
      const page = h('div', { class: 'sh-page' },
        h('section', { class: 'sh-hero' },
          h('div', { class: 'sh-sign', 'aria-hidden': 'true', html: signArt() }),
          h('div', { class: 'sh-hero-txt' }, h('small', null, 'Open all night'), h('h1', null, 'The Belfry Shop'), h('p', null, 'Hats, frames, name styles and other finery for the discerning bat. Everything costs Batty Bucks, and only Batty Bucks.')),
          fit, dealBox),
        tabs, body,
        h('footer', { class: 'sh-foot' }, h('b', null, 'Batty Bucks only, no real money anywhere. '), 'Batty Bucks have no cash value: they cannot be bought, sold, traded or cashed out, and neither can anything in this shop. Cosmetics are purely for show and never change your chances in any game. Crate odds are published above each crate.'));
      root.append(page);
      function paintFit() {
        if (!B.me) return;
        fit.innerHTML = '<span class="sh-fit-av">' + B.avatar(B.me.avatar, 96, B.me.cos) + '</span><div><small>The fitting room</small><b class="sh-fit-name ' + (B.me.cos && B.me.cos.name ? 'pl-ns ' + B.me.cos.name : '') + '">' + esc(B.me.name) + '</b>' + (B.me.cos && B.me.cos.badge ? '<i class="pl-key">' + KEY_SVG + '</i>' : '') + (B.me.cos && B.me.cos.titleText ? '<b class="pl-ti">' + esc(B.me.cos.titleText) + '</b>' : '') + '<a href="#profile/' + encodeURIComponent(B.me.name) + '">Your profile</a></div>';
      }
      function paintTabs() {
        tabs.textContent = '';
        for (const [k, n] of CATS) {
          const b = h('button', { type: 'button', class: 'sh-tab t-' + k + (k === cat ? ' on' : ''), 'aria-pressed': k === cat, id: 'sh-tab-' + k }, n);
          b.onclick = () => { cat = k; B.sfx('click'); paintTabs(); paintBody(); history.replaceState(null, '', '#shop/' + k); };
          tabs.append(b);
        }
        const on = tabs.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
      function paintDeal() {
        const it = ITEMS[d.deal];
        dealBox.textContent = '';
        if (!it) return;
        dealBox.className = 'sh-deal r-' + it.rarity;
        const owned = d.owned[it.id] > 0;
        dealBox.append(h('small', null, 'Deal of the Night'), h('div', { class: 'sh-deal-art', html: itemArt(it, { size: 72 }) }), h('b', null, it.name),
          h('span', { class: 'sh-deal-price', html: '<s>' + fmt(it.was) + '</s> ' + coinSvg() + fmt(it.price) }),
          h('em', null, owned ? 'Already yours' : 'Ends in ' + dur(d.dealIn)));
        if (!owned) dealBox.onclick = () => buyModal(it, refresh); else dealBox.onclick = null;
      }
      function paintBody() {
        body.textContent = '';
        const all = d.items;
        const refreshCb = refresh;
        if (cat === 'locker') { body.append(lockerView(d, refreshCb, false)); return; }
        if (cat === 'crate') { body.append(crateSection(d, refreshCb)); return; }
        let list;
        if (cat === 'featured') {
          const ids = [d.deal, 'bd_key', 'fr_galaxy', 'acc_mooncrown', 'ns_molten', 'fx_bats', 'acc_viking', 'fr_flame', 'ti_highroller', 'acc_wizard', 'em_howl', 'bo_xp1h', 'tk_premium'];
          list = [...new Set(ids)].map((id) => ITEMS[id]).filter(Boolean);
          body.append(crateBanner());
        } else if (cat === 'boost') list = all.filter((it) => it.cat === 'boost' || (it.cat === 'ticket' && it.price > 0));
        else list = all.filter((it) => it.cat === cat);
        if (cat === 'badge') body.append(h('p', { class: 'sh-blurb' }, 'The Lounge Key is the Belfry’s showcase item. It does nothing at all except sit beside your name on every leaderboard, feed and profile, glinting. That is rather the point.'));
        const grid = h('div', { class: 'sh-grid' + (cat === 'badge' ? ' solo' : '') });
        list.sort((a, b) => (cat === 'featured' ? 0 : (a.price > 0 ? 0 : 1) - (b.price > 0 ? 0 : 1) || a.price - b.price));
        for (const it of list) grid.append(itemCard(it, d, refreshCb));
        body.append(grid);
      }
      function crateBanner() {
        const b = h('button', { class: 'sh-cratebanner', type: 'button', onclick: () => { cat = 'crate'; paintTabs(); paintBody(); } },
          h('span', { class: 'sh-cb-art', html: chestSvg('cr_blood', 'idle') }),
          h('div', null, h('small', null, 'Mystery Crates'), h('b', null, 'Crack open a crate'), h('span', null, 'Cosmetics only, never a duplicate, odds on show.')),
          h('em', null, 'See crates'));
        return b;
      }
      async function refresh() {
        try { d = await shopData(true); } catch (e) { return; }
        if (S.dead) return;
        paintFit(); paintDeal(); paintBody();
      }
      body.append(h('div', { class: 'bc-loading' }, h('span', { html: B.batSvg() }), 'Unlocking the shop'));
      shopData(true).then((r) => { if (S.dead) return; d = r; paintFit(); paintTabs(); paintDeal(); paintBody(); }).catch(() => { body.textContent = 'The shop is shut for a moment. Try again shortly.'; });
      S.interval(() => { if (d) { d.dealIn = Math.max(0, d.dealIn - 60); paintDeal(); } }, 60000);
      return { destroy() { S.dispose(); } };
    },
  });
  /* The shop's hanging sign. */
  function signArt() {
    return '<svg viewBox="0 0 220 170"><path d="M20 10H200" stroke="#5a3d1e" stroke-width="8" stroke-linecap="round"/><path d="M60 10V44M160 10V44" stroke="#c9a46a" stroke-width="3"/>' +
      '<g class="sh-sign-sw"><rect x="18" y="40" width="184" height="104" rx="14" fill="#2b1650" stroke="#ffd76a" stroke-width="5"/><rect x="28" y="50" width="164" height="84" rx="9" fill="none" stroke="#ffd76a" stroke-opacity=".35" stroke-width="2"/>' +
      '<g transform="translate(80 58) scale(.5)"><path d="' + B.batPath + '" fill="#ffd76a"/></g>' +
      '<text x="110" y="112" text-anchor="middle" font-family="Cinzel Decorative, Cinzel, serif" font-weight="900" font-size="25" fill="#ffd76a">BELFRY</text><text x="110" y="130" text-anchor="middle" font-family="Cinzel, serif" font-weight="800" font-size="11" letter-spacing="5" fill="#d9c8ff">EST. 1897</text></g></svg>';
  }

  /* ================================================================================================
     LOBBY: Daily Wheel hero tile, Bat Pass strip, shop teaser (mounted by the PLATFORM HOOK in lobby())
     ================================================================================================ */
  function miniWheel() {
    const cols = ['#ff3d81', '#4b1fa0', '#17b394', '#3a1683', '#ffd76a', '#4b1fa0', '#c0183c', '#3a1683', '#4aa8ff', '#4b1fa0', '#ff8a3c', '#3a1683'];
    let w = '';
    cols.forEach((c, i) => { w += '<path d="' + wedge(i * 30 - 15, i * 30 + 15, 0, 88) + '" fill="' + c + '"/>'; });
    let bl = '';
    for (let i = 0; i < 16; i++) { const [x, y] = pt(i * 22.5, 97); bl += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" style="--i:' + i + '"/>'; }
    return '<svg viewBox="-110 -122 220 234" class="pl-mw" aria-hidden="true"><circle r="104" fill="#e2a325"/><circle r="100" fill="#8a5207"/><circle r="90" fill="#1a0b2e"/>' +
      '<g class="pl-mw-rot">' + w + '<circle r="88" fill="none" stroke="#ffd76a" stroke-width="2"/></g><g class="pl-mw-bulbs">' + bl + '</g>' +
      '<circle r="22" fill="#ffd76a" stroke="#8a5207" stroke-width="5"/><g transform="translate(-15 -7) scale(.25)"><path d="' + B.batPath + '" fill="#2a1046"/></g>' +
      '<path d="M-14 -118H14L0 -88Z" fill="#ff3d81" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';
  }
  ext.lobbyPlatform = function (box) {
    if (!live()) return () => {};
    let dead = false;
    const sec = h('section', { class: 'pl-lobby', 'aria-label': 'Daily Wheel, Bat Pass and shop' });
    const feed = box.querySelector('.ol-feed');
    if (feed) feed.before(sec); else box.append(sec);
    const wheelT = h('a', { class: 'pl-tile pl-wt', href: '#wheel', id: 'pl-wheeltile' });
    const passT = h('a', { class: 'pl-tile pl-pt', href: '#pass', id: 'pl-passtile' });
    const shopT = h('a', { class: 'pl-tile pl-st', href: '#shop', id: 'pl-shoptile' });
    sec.append(wheelT, passT, shopT);
    function paint() {
      const p = B.me && B.me.plat; if (!p || dead) return;
      const ready = p.wheelReady, bonus = p.spins;
      wheelT.className = 'pl-tile pl-wt' + (ready ? ' ready' : bonus ? ' bonus' : '');
      wheelT.innerHTML = '<span class="pl-wt-glow"></span><span class="pl-wt-wheel">' + miniWheel() + '</span><div class="pl-wt-txt">' +
        (ready ? '<small>Daily Prize Wheel</small><b>Your free spin is ready!</b><span>Day ' + p.wheelDay + ' of your streak' + (p.wheelDay === 7 ? ': the <i>Golden Spin</i>' : '') + '. Prizes up to a jackpot.</span><em class="pl-cta">Spin now</em>'
          : bonus ? '<small>Daily Prize Wheel</small><b>' + plural(bonus, 'bonus spin') + ' waiting</b><span>Your free spin is back in ' + dur(p.wheelIn) + '.</span><em class="pl-cta">Use a spin</em>'
            : '<small>Daily Prize Wheel</small><b>Spun for today</b><span>Next free spin in ' + dur(p.wheelIn) + '. Keep the streak going.</span><em class="pl-cta ghost">Premium Wheel</em>') + '</div>';
      const into = p.tier >= 50 ? 1 : (p.xp % p.tierXp) / p.tierXp;
      passT.className = 'pl-tile pl-pt' + (p.gold ? ' gold' : '') + (p.claimable ? ' ready' : '');
      passT.innerHTML = '<div class="pl-pt-top"><span class="pl-pt-badge"><b>' + p.tier + '</b></span><div><small>Bat Pass · Season ' + p.season + '</small><b>' + esc(p.seasonName) + (p.gold ? ' <i>Gold</i>' : '') + '</b><span>Ends in ' + dur(p.seasonEnds) + '</span></div></div>' +
        '<div class="pl-pt-bar"><i style="width:' + (into * 100).toFixed(1) + '%"></i></div><div class="pl-pt-foot"><span>' + (p.tier >= 50 ? 'Season complete' : fmt(p.xp % p.tierXp) + ' / ' + fmt(p.tierXp) + ' XP to tier ' + (p.tier + 1)) + '</span>' +
        (p.claimable ? '<em class="pl-pill">' + plural(p.claimable, 'reward') + ' to claim</em>' : p.boostIn > 0 ? '<em class="pl-pill teal">2× XP · ' + dur(p.boostIn) + '</em>' : '<em class="pl-pill dim">Open</em>') + '</div>';
    }
    async function paintShop() {
      try {
        const d = await shopData(false);
        if (dead) return;
        const it = ITEMS[d.deal];
        shopT.className = 'pl-tile pl-st r-' + (it ? it.rarity : 'rare');
        shopT.innerHTML = '<div class="pl-st-txt"><small>The Belfry Shop</small><b>Deal of the Night</b>' + (it ? '<span>' + esc(it.name) + '</span><span class="pl-st-price"><s>' + fmt(it.was) + '</s> ' + coinSvg() + fmt(it.price) + '</span>' : '') + '<em class="pl-cta ghost">Browse</em></div>' + (it ? '<span class="pl-st-art">' + itemArt(it, { size: 76 }) + '</span>' : '');
      } catch (e) {
        shopT.innerHTML = '<div class="pl-st-txt"><small>The Belfry Shop</small><b>Hats, frames and finery</b><em class="pl-cta ghost">Browse</em></div>';
      }
    }
    paint(); paintShop();
    shopT.innerHTML = '<div class="pl-st-txt"><small>The Belfry Shop</small><b>Deal of the Night</b></div>';
    refreshStatus(true).then(paint);
    const t = setInterval(() => { refreshStatus(false).then(paint); }, 30000);
    const off = B.wallet.on(() => setTimeout(paint, 50));
    return () => { dead = true; clearInterval(t); off(); };
  };
})();
