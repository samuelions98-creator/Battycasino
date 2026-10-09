/* ===== circus art ===== */
/* Batty Circus: the whole cast and set, drawn in code (SVG strings). No images, no external assets.
   Shared gradients live once in DEFS (ids start "cz-"); every drawing references them, so the game puts DEFS in the page
   once. Parts that animate carry class names (cz-eyes, cz-trunk, cz-arm-r ...) for game.js / style.css to move. */
(function (root) {
  'use strict';
  const OL = '#2a0b1e';
  const lg = (id, stops, x2, y2) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</linearGradient>';
  const rg = (id, stops, cx, cy, r) => '<radialGradient id="' + id + '" cx="' + (cx || '50%') + '" cy="' + (cy || '50%') + '" r="' + (r || '50%') + '">' + stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('') + '</radialGradient>';

  const DEFS_INNER =
    lg('cz-fur', [[0, '#a77ee6'], [0.5, '#6c3fb4'], [1, '#341463']]) +
    lg('cz-fur2', [[0, '#c48a62'], [0.5, '#8a5233'], [1, '#4a2614']]) +
    lg('cz-fur3', [[0, '#7fb2e8'], [0.5, '#3f6cb4'], [1, '#1c2f63']]) +
    lg('cz-fur4', [[0, '#e47ab0'], [0.5, '#a83a7c'], [1, '#5a1442']]) +
    lg('cz-furL', [[0, '#eadbff'], [1, '#b997e6']]) +
    lg('cz-furL2', [[0, '#ffe0c4'], [1, '#d9a27a']]) +
    lg('cz-wing', [[0, '#6a3aa8'], [1, '#2a0f50']]) +
    lg('cz-gold', [[0, '#fff6c2'], [0.35, '#ffd451'], [0.7, '#e09a1c'], [1, '#9a5a08']]) +
    lg('cz-goldH', [[0, '#9a5a08'], [0.2, '#ffd451'], [0.5, '#fff6c2'], [0.8, '#ffd451'], [1, '#9a5a08']], 1, 0) +
    lg('cz-red', [[0, '#ff7a7a'], [0.45, '#e0262f'], [1, '#7d0a17']]) +
    lg('cz-redV', [[0, '#c3101e'], [0.5, '#8d0a17'], [1, '#4d0410']]) +
    lg('cz-cream', [[0, '#fffaf0'], [1, '#f1d9aa']]) +
    lg('cz-grey', [[0, '#efe6fb'], [0.5, '#b2a2cb'], [1, '#6a5a88']]) +
    lg('cz-lion', [[0, '#ffe39a'], [0.5, '#f5a73a'], [1, '#b55a10']]) +
    rg('cz-mane', [[0, '#ff9a3c'], [0.7, '#d4501a'], [1, '#7a1f06']]) +
    lg('cz-seal', [[0, '#a9cdea'], [0.5, '#5a86b0'], [1, '#253e5c']]) +
    lg('cz-steel', [[0, '#ffffff'], [0.4, '#b9bfd1'], [1, '#4a4e63']]) +
    rg('cz-ball', [[0, '#8a8aa6'], [0.45, '#2d2d3e'], [1, '#09090f']], '35%', '30%', '70%') +
    lg('cz-blue', [[0, '#9fd8ff'], [0.5, '#2f7de0'], [1, '#0d2f7a']]) +
    lg('cz-green', [[0, '#b2ffcf'], [0.5, '#1fb56c'], [1, '#05522c']]) +
    lg('cz-purple', [[0, '#f0c4ff'], [0.5, '#a447e0'], [1, '#4a0f7a']]) +
    lg('cz-teal', [[0, '#a6fff2'], [0.5, '#17b5a3'], [1, '#05504a']]) +
    lg('cz-wood', [[0, '#c98a4a'], [1, '#6b3a14']]) +
    rg('cz-glow', [[0, '#fff6c2', 0.95], [0.4, '#ffd451', 0.45], [1, '#ffd451', 0]]) +
    rg('cz-flame', [[0, '#fffbe0'], [0.35, '#ffd23a'], [0.7, '#ff7a1a'], [1, '#d4200f', 0]], '50%', '70%', '60%') +
    rg('cz-burst', [[0, '#fff3b8'], [0.6, '#ffc93a'], [1, '#e07a10']]) +
    lg('cz-velvet', [[0, '#a3121f'], [0.5, '#6e0814'], [1, '#3a020a']]) +
    lg('cz-shade', [[0, '#000', 0.45], [0.45, '#000', 0.05], [1, '#000', 0.6]]) +
    lg('cz-tent1', [[0, '#e8303c'], [1, '#7a0b18']]) +
    lg('cz-tent2', [[0, '#fff3dc'], [1, '#c9a27a']]) +
    rg('cz-beam', [[0, '#fff8dc', 0.55], [0.6, '#ffe7a0', 0.12], [1, '#ffe7a0', 0]], '50%', '0%', '100%') +
    lg('cz-beamL', [[0, '#fff8dc', 0.42], [1, '#fff8dc', 0]]) +
    '<filter id="cz-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#14020c" flood-opacity=".55"/></filter>' +
    '<filter id="cz-soft"><feGaussianBlur stdDeviation="6"/></filter>';
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + DEFS_INNER + '</defs></svg>';

  /* ---------- the bat head (everyone is a bat; local coords, centre 0,0, about 60 wide) ---------- */
  function batHead(o) {
    o = o || {};
    const fur = o.fur || 'url(#cz-fur)', furL = o.furL || 'url(#cz-furL)';
    return '<g class="cz-head">' +
      '<path d="M-22 -12 L-31 -50 Q-15 -34 -5 -24 Z" fill="' + fur + '" stroke="' + OL + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M22 -12 L31 -50 Q15 -34 5 -24 Z" fill="' + fur + '" stroke="' + OL + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M-20 -16 L-26 -41 Q-16 -30 -9 -24 Z" fill="#ff8fb8"/><path d="M20 -16 L26 -41 Q16 -30 9 -24 Z" fill="#ff8fb8"/>' +
      '<ellipse cx="0" cy="0" rx="29" ry="26" fill="' + fur + '" stroke="' + OL + '" stroke-width="2.5"/>' +
      '<path d="M-20 -14 Q-6 -24 10 -21" stroke="#fff" stroke-opacity=".35" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="0" cy="11" rx="17" ry="12" fill="' + furL + '"/>' +
      '<ellipse cx="-19" cy="9" rx="5" ry="3" fill="#ff6fa8" opacity=".55"/><ellipse cx="19" cy="9" rx="5" ry="3" fill="#ff6fa8" opacity=".55"/>' +
      '<g class="cz-eyes"><ellipse cx="-11" cy="-4" rx="7.5" ry="8.5" fill="#fff" stroke="' + OL + '" stroke-width="1.6"/><ellipse cx="11" cy="-4" rx="7.5" ry="8.5" fill="#fff" stroke="' + OL + '" stroke-width="1.6"/>' +
      '<circle class="cz-pupil" cx="-9.5" cy="-2.5" r="4.2" fill="' + OL + '"/><circle class="cz-pupil" cx="9.5" cy="-2.5" r="4.2" fill="' + OL + '"/>' +
      '<circle cx="-11" cy="-5" r="1.7" fill="#fff"/><circle cx="8" cy="-5" r="1.7" fill="#fff"/></g>' +
      (o.brows ? '<path d="M-18 -16 L-5 -12 M18 -16 L5 -12" stroke="' + OL + '" stroke-width="3" stroke-linecap="round"/>' : '') +
      '<path d="M-3.4 4.5 Q0 2.6 3.4 4.5 Q0 8.6 -3.4 4.5Z" fill="' + OL + '"/>' +
      '<g class="cz-m-smile"><path d="M-8 12 Q0 19 8 12" stroke="' + OL + '" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M-5.5 13.6 l1.4 4 l1.6 -3.4Z M2.5 14.2 l1.6 3.4 l1.4 -4Z" fill="#fff"/></g>' +
      '<g class="cz-m-open" display="none"><path d="M-8 11 Q0 26 8 11 Z" fill="#5a0a24" stroke="' + OL + '" stroke-width="2"/><path d="M-6 11.6 l1.6 4 l1.8 -3.6Z M2.6 11.8 l1.8 3.6 l1.6 -4Z" fill="#fff"/><ellipse cx="0" cy="19" rx="3.4" ry="2" fill="#ff6f8f"/></g>' +
      '<g class="cz-m-grit" display="none"><rect x="-9" y="10" width="18" height="7" rx="3" fill="#fff" stroke="' + OL + '" stroke-width="2"/><path d="M-3 10v7M3 10v7M-9 13.5h18" stroke="' + OL + '" stroke-width="1"/></g>' +
      (o.extra || '') + '</g>';
  }
  /* a bat wing, from the shoulder (0,0) out to the right; mirror with scale(-1 1) */
  const WING = '<path d="M0 0 Q26 -34 74 -26 Q68 -10 76 6 Q60 0 52 14 Q44 2 32 16 Q24 4 8 14 Z" fill="url(#cz-wing)" stroke="' + OL + '" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M4 -2 Q30 -20 72 -24 M8 4 Q32 -6 50 12 M6 8 Q20 2 30 15" stroke="#9a6ad8" stroke-width="1.6" fill="none" opacity=".7"/>';
  const wing = (x, y, s, flip, cls) => '<g class="' + (cls || 'cz-wing') + '" transform="translate(' + x + ' ' + y + ') scale(' + (flip ? -s : s) + ' ' + s + ')">' + WING + '</g>';
  const topHat = (x, y, s, band) => '<g class="cz-hat" transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
    '<ellipse cx="0" cy="0" rx="26" ry="6.5" fill="#1d1024" stroke="' + OL + '" stroke-width="2"/>' +
    '<path d="M-16 -1 L-14 -34 Q0 -38 14 -34 L16 -1 Q0 4 -16 -1Z" fill="#2c1838" stroke="' + OL + '" stroke-width="2.2"/>' +
    '<path d="M-15.4 -10 Q0 -6 15.4 -10 L15.8 -3 Q0 1 -15.8 -3Z" fill="' + (band || '#e0262f') + '"/>' +
    '<path d="M-10 -32 L-9 -12" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>' +
    '<ellipse cx="0" cy="-34" rx="14" ry="3.2" fill="#3d2450" stroke="' + OL + '" stroke-width="1.6"/></g>';

  /* ---------- reel symbols (viewBox 0 0 120 120) ---------- */
  const S = {};
  S.wild = () =>
    '<g class="cz-burst"><path d="' + star(60, 60, 58, 44, 14) + '" fill="url(#cz-gold)" stroke="#8a4a06" stroke-width="2"/></g>' +
    '<circle cx="60" cy="60" r="38" fill="url(#cz-redV)" stroke="#ffd451" stroke-width="3"/>' +
    '<circle cx="60" cy="60" r="33" fill="none" stroke="#ffd451" stroke-width="1" stroke-dasharray="2 4" opacity=".8"/>' +
    '<g transform="translate(60 54)">' + topHat(0, 6, 1.15, '#ffd451').replace('class="cz-hat"', 'class="cz-hat cz-wildhat"') + '</g>' +
    '<g class="cz-wand"><path d="M86 30 L98 18" stroke="#1d1024" stroke-width="4" stroke-linecap="round"/><path d="M97 19 l3 -3" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>' +
    '<g transform="translate(60 92)"><path d="M-52 -12 L52 -12 L46 0 L52 12 L-52 12 L-46 0Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<text x="0" y="8.5" text-anchor="middle" font-family="Bungee, Titan One, Impact, sans-serif" font-size="22" fill="#fff6c2" stroke="' + OL + '" stroke-width="1.2" paint-order="stroke" letter-spacing="2">WILD</text></g>' +
    '<g class="cz-twinkle"><path d="' + star(22, 26, 7, 2, 4) + '" fill="#fff"/><path d="' + star(100, 70, 6, 1.8, 4) + '" fill="#fff"/></g>';

  S.elephant = () =>
    '<g class="cz-ear cz-ear-l"><path d="M40 40 Q8 18 6 50 Q4 66 14 74 Q20 66 24 76 Q30 68 38 72 Z" fill="url(#cz-grey)" stroke="' + OL + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M36 46 Q16 32 13 52 Q13 62 18 66" stroke="#ff9ec4" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/></g>' +
    '<g class="cz-ear cz-ear-r"><path d="M80 40 Q112 18 114 50 Q116 66 106 74 Q100 66 96 76 Q90 68 82 72 Z" fill="url(#cz-grey)" stroke="' + OL + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M84 46 Q104 32 107 52 Q107 62 102 66" stroke="#ff9ec4" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/></g>' +
    '<ellipse cx="60" cy="54" rx="29" ry="27" fill="url(#cz-grey)" stroke="' + OL + '" stroke-width="2.5"/>' +
    '<path d="M42 38 Q54 30 70 33" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<g class="cz-trunk"><path d="M60 64 Q57 88 70 98 Q82 106 92 94" stroke="' + OL + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M60 64 Q57 88 70 98 Q82 106 92 94" stroke="#b9a9d1" stroke-width="12" fill="none" stroke-linecap="round"/>' +
    '<path d="M58 72 h7 M59 79 h8 M62 86 h8 M67 93 h7" stroke="#7d6c9c" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="92" cy="93" rx="5" ry="4" fill="#7d6c9c"/></g>' +
    '<path d="M46 70 Q42 80 48 84" stroke="#fffaf0" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M74 70 Q78 80 72 84" stroke="#fffaf0" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<g class="cz-eyes"><ellipse cx="49" cy="52" rx="5.5" ry="6.5" fill="#fff" stroke="' + OL + '" stroke-width="1.6"/><ellipse cx="71" cy="52" rx="5.5" ry="6.5" fill="#fff" stroke="' + OL + '" stroke-width="1.6"/><circle cx="50" cy="53" r="3.2" fill="' + OL + '"/><circle cx="70" cy="53" r="3.2" fill="' + OL + '"/><circle cx="49" cy="51.5" r="1.2" fill="#fff"/><circle cx="69" cy="51.5" r="1.2" fill="#fff"/></g>' +
    '<ellipse cx="42" cy="62" rx="4" ry="2.4" fill="#ff7fb0" opacity=".6"/><ellipse cx="78" cy="62" rx="4" ry="2.4" fill="#ff7fb0" opacity=".6"/>' +
    '<g class="cz-fez"><path d="M48 31 L51 14 Q60 11 69 14 L72 31 Q60 35 48 31Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.2"/><ellipse cx="60" cy="14" rx="9" ry="2.6" fill="#a8101e" stroke="' + OL + '" stroke-width="1.5"/>' +
    '<g class="cz-tassel"><path d="M60 13 Q70 12 72 22" stroke="#ffd451" stroke-width="2" fill="none"/><path d="M70 21 l-2 9 l4 0 l1 -9Z" fill="#ffd451" stroke="#8a4a06" stroke-width="1"/></g></g>';

  S.lion = () => {
    let mane = ''; const n = 16;
    mane = ''; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 0.5) / n) * Math.PI * 2, c = ((i + 1) / n) * Math.PI * 2; const P = (r, t) => (60 + Math.cos(t) * r).toFixed(1) + ' ' + (58 + Math.sin(t) * r * 0.97).toFixed(1); mane += (i ? ' ' : 'M' + P(36, a) + ' ') + 'Q' + P(60, b) + ' ' + P(36, c); }
    return '<g class="cz-mane"><path d="' + mane + 'Z" fill="url(#cz-mane)" stroke="' + OL + '" stroke-width="2.4" stroke-linejoin="round"/></g>' +
      '<ellipse cx="60" cy="60" rx="30" ry="31" fill="url(#cz-lion)" stroke="' + OL + '" stroke-width="2.5"/>' +
      '<circle cx="36" cy="34" r="7" fill="url(#cz-lion)" stroke="' + OL + '" stroke-width="2"/><circle cx="84" cy="34" r="7" fill="url(#cz-lion)" stroke="' + OL + '" stroke-width="2"/><circle cx="36" cy="34" r="3" fill="#d4501a"/><circle cx="84" cy="34" r="3" fill="#d4501a"/>' +
      '<path d="M42 44 Q50 36 58 40" stroke="#fff" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<g class="cz-eyes"><ellipse cx="49" cy="55" rx="5.5" ry="6" fill="#fff" stroke="' + OL + '" stroke-width="1.6"/><ellipse cx="71" cy="55" rx="5.5" ry="6" fill="#fff" stroke="' + OL + '" stroke-width="1.6"/><circle cx="50" cy="56" r="3.3" fill="#3a1a06"/><circle cx="70" cy="56" r="3.3" fill="#3a1a06"/><circle cx="49" cy="54.5" r="1.2" fill="#fff"/><circle cx="69" cy="54.5" r="1.2" fill="#fff"/></g>' +
      '<path d="M42 47 L55 50 M78 47 L65 50" stroke="' + OL + '" stroke-width="2.6" stroke-linecap="round"/>' +
      '<ellipse cx="60" cy="74" rx="16" ry="11" fill="#fff1d6"/>' +
      '<path d="M53 66 Q60 63 67 66 L60 73Z" fill="#5a1a10" stroke="' + OL + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<g class="cz-m-smile"><path d="M60 73 v4 M52 78 Q56 82 60 77 Q64 82 68 78" stroke="' + OL + '" stroke-width="2" fill="none" stroke-linecap="round"/></g>' +
      '<g class="cz-m-open" display="none"><path d="M48 76 Q60 72 72 76 Q70 96 60 97 Q50 96 48 76Z" fill="#6a0a1c" stroke="' + OL + '" stroke-width="2"/><path d="M50 77 l3 6 l3 -5.6Z M64 77.4 l3 5.6 l3 -6Z M52 94 l3 -5 l2.6 5.4Z M62.4 94.4 l2.6 -5.4 l3 5Z" fill="#fff"/><ellipse cx="60" cy="91" rx="6" ry="3" fill="#ff6f8f"/></g>' +
      '<g fill="' + OL + '"><circle cx="49" cy="72" r="1"/><circle cx="46" cy="75" r="1"/><circle cx="71" cy="72" r="1"/><circle cx="74" cy="75" r="1"/></g>';
  };

  S.strongman = () =>
    '<g class="cz-arm cz-arm-l"><path d="M34 74 Q16 72 14 56 Q12 42 22 36" stroke="' + OL + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M34 74 Q16 72 14 56 Q12 42 22 36" stroke="url(#cz-fur2)" stroke-width="12.5" fill="none" stroke-linecap="round"/><ellipse class="cz-bicep" cx="18" cy="58" rx="10" ry="8" fill="#a8683f" stroke="' + OL + '" stroke-width="2"/><circle cx="23" cy="33" r="7.5" fill="#c48a62" stroke="' + OL + '" stroke-width="2"/></g>' +
    '<g class="cz-arm cz-arm-r"><path d="M86 74 Q104 72 106 56 Q108 42 98 36" stroke="' + OL + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M86 74 Q104 72 106 56 Q108 42 98 36" stroke="url(#cz-fur2)" stroke-width="12.5" fill="none" stroke-linecap="round"/><ellipse class="cz-bicep" cx="102" cy="58" rx="10" ry="8" fill="#a8683f" stroke="' + OL + '" stroke-width="2"/><circle cx="97" cy="33" r="7.5" fill="#c48a62" stroke="' + OL + '" stroke-width="2"/></g>' +
    '<path d="M30 120 L34 80 Q60 66 86 80 L90 120Z" fill="url(#cz-fur2)" stroke="' + OL + '" stroke-width="2.5"/>' +
    '<path d="M38 120 L40 86 Q60 78 80 86 L82 120Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/>' +
    '<path d="M40 92 L80 92 M40 102 L81 102 M39 112 L81 112" stroke="#fff1d6" stroke-width="4"/>' +
    '<path d="M44 86 L50 80 M76 86 L70 80" stroke="url(#cz-red)" stroke-width="5" stroke-linecap="round"/>' +
    '<g transform="translate(60 54) scale(.92)">' + batHead({ fur: 'url(#cz-fur2)', furL: 'url(#cz-furL2)', brows: true,
      extra: '<path class="cz-tache" d="M0 9 Q-8 5 -16 9 Q-24 13 -26 6 Q-22 18 -12 15 Q-4 13 0 11 Q4 13 12 15 Q22 18 26 6 Q24 13 16 9 Q8 5 0 9Z" fill="#2a1408" stroke="' + OL + '" stroke-width="1.2"/>' }) + '</g>';

  S.juggler = () =>
    '<g class="cz-balls"><g transform="translate(34 26)"><g class="cz-jb cz-jb1"><circle cx="0" cy="0" r="9" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/><path d="M-4 -4 a6 6 0 0 1 6 -2" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/></g></g>' +
    '<g transform="translate(60 12)"><g class="cz-jb cz-jb2"><circle cx="0" cy="0" r="9" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2"/><path d="M-4 -4 a6 6 0 0 1 6 -2" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/></g></g>' +
    '<g transform="translate(86 26)"><g class="cz-jb cz-jb3"><circle cx="0" cy="0" r="9" fill="url(#cz-teal)" stroke="' + OL + '" stroke-width="2"/><path d="M-4 -4 a6 6 0 0 1 6 -2" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/></g></g></g>' +
    '<path d="M30 120 Q32 92 60 90 Q88 92 90 120Z" fill="url(#cz-purple)" stroke="' + OL + '" stroke-width="2.4"/>' +
    '<path d="M60 90 L60 120" stroke="#ffd451" stroke-width="3"/><path d="M45 92 L60 120 L75 92" fill="url(#cz-gold)" opacity=".5"/>' +
    '<g class="cz-arm cz-arm-l"><path d="M38 98 Q24 92 24 74" stroke="' + OL + '" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M38 98 Q24 92 24 74" stroke="url(#cz-fur)" stroke-width="8" fill="none" stroke-linecap="round"/></g>' +
    '<g class="cz-arm cz-arm-r"><path d="M82 98 Q96 92 96 74" stroke="' + OL + '" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M82 98 Q96 92 96 74" stroke="url(#cz-fur)" stroke-width="8" fill="none" stroke-linecap="round"/></g>' +
    '<path d="M34 90 Q40 82 46 90 Q52 82 58 90 Q64 82 70 90 Q76 82 82 90 Q86 96 78 98 Q60 104 42 98 Q32 96 34 90Z" fill="#fffaf0" stroke="' + OL + '" stroke-width="2"/>' +
    '<g transform="translate(60 66) scale(.82)">' + batHead({ extra: '<path d="M-26 -20 Q-34 -46 -8 -30 Q0 -52 8 -30 Q34 -46 26 -20 Q0 -30 -26 -20Z" fill="url(#cz-teal)" stroke="' + OL + '" stroke-width="2.2" transform="translate(0 -12)"/><circle cx="-24" cy="-46" r="4" fill="#ffd451" stroke="' + OL + '" stroke-width="1.4"/><circle cx="0" cy="-60" r="4" fill="#ffd451" stroke="' + OL + '" stroke-width="1.4"/><circle cx="24" cy="-46" r="4" fill="#ffd451" stroke="' + OL + '" stroke-width="1.4"/>' }) + '</g>';

  S.seal = () =>
    '<g class="cz-sealball"><circle cx="64" cy="20" r="15" fill="#fffaf0" stroke="' + OL + '" stroke-width="2.4"/><path d="M50 16 Q64 4 78 16 Q64 10 50 16Z M50 24 Q64 36 78 24 Q64 30 50 24Z" fill="#e0262f"/><path d="M58 6 Q64 20 58 34" stroke="#2f7de0" stroke-width="5" fill="none"/><circle cx="58" cy="14" r="3" fill="#fff"/></g>' +
    '<g class="cz-sealbody"><path d="M30 118 Q22 92 38 72 Q46 58 54 48 Q60 40 68 42 Q78 46 74 58 Q70 74 74 92 Q78 108 92 116 Z" fill="url(#cz-seal)" stroke="' + OL + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M42 116 Q38 96 48 82 Q54 74 60 80 Q62 96 70 116Z" fill="#cfe4f5" opacity=".7"/>' +
    '<path d="M46 86 Q28 92 24 104 Q36 102 48 96" fill="url(#cz-seal)" stroke="' + OL + '" stroke-width="2.2"/>' +
    '<path d="M72 88 Q90 90 98 100 Q86 102 72 98" fill="url(#cz-seal)" stroke="' + OL + '" stroke-width="2.2"/>' +
    '<path d="M64 42 Q70 36 66 34 Q60 34 58 40" fill="#253e5c" stroke="' + OL + '" stroke-width="1.6"/>' +
    '<ellipse cx="66" cy="38" rx="3.4" ry="2.6" fill="' + OL + '"/>' +
    '<g class="cz-eyes"><ellipse cx="58" cy="52" rx="4.4" ry="5" fill="#fff" stroke="' + OL + '" stroke-width="1.4"/><circle cx="59" cy="52" r="2.8" fill="' + OL + '"/><circle cx="58.2" cy="50.8" r="1" fill="#fff"/></g>' +
    '<path d="M60 44 l-9 -3 M61 46 l-10 1 M68 44 l8 -4" stroke="' + OL + '" stroke-width="1" opacity=".7"/>' +
    '<path d="M50 50 Q56 46 60 46" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M40 66 Q60 70 74 62 L74 68 Q58 76 40 72Z" fill="#e0262f" stroke="' + OL + '" stroke-width="1.6"/><circle cx="58" cy="72" r="3.4" fill="#ffd451" stroke="' + OL + '" stroke-width="1.2"/></g>';

  /* royals: marquee tickets with light bulbs */
  function royal(letter, grad, rim) {
    let bulbs = '';
    const pts = []; for (let i = 0; i < 6; i++) pts.push([24 + i * 14.4, 14], [24 + i * 14.4, 106]); for (let i = 1; i < 5; i++) pts.push([14, 14 + i * 18.4], [106, 14 + i * 18.4]);
    pts.forEach((p, i) => { bulbs += '<circle class="cz-bulb' + (i % 2 ? ' b2' : '') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.6" fill="#fff4c2" stroke="#8a4a06" stroke-width="1"/>'; });
    return '<rect x="10" y="10" width="100" height="100" rx="20" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2.5"/>' +
      '<rect x="20" y="20" width="80" height="80" rx="13" fill="url(#' + grad + ')" stroke="' + OL + '" stroke-width="2"/>' +
      '<rect x="24" y="24" width="72" height="30" rx="10" fill="#fff" opacity=".16"/>' +
      bulbs +
      '<text x="60" y="88" text-anchor="middle" font-family="Bungee, Titan One, Impact, sans-serif" font-size="62" fill="' + rim + '" stroke="' + OL + '" stroke-width="7" stroke-linejoin="round" paint-order="stroke">' + letter + '</text>' +
      '<text x="60" y="88" text-anchor="middle" font-family="Bungee, Titan One, Impact, sans-serif" font-size="62" fill="url(#cz-cream)">' + letter + '</text>' +
      '<g class="cz-shine"><rect x="-30" y="0" width="16" height="140" fill="#fff" opacity=".45" transform="rotate(20)"/></g>';
  }
  S.ace = () => royal('A', 'cz-red', '#ffd451');
  S.king = () => royal('K', 'cz-blue', '#ffd451');
  S.queen = () => royal('Q', 'cz-purple', '#ffd451');
  S.jack = () => royal('J', 'cz-green', '#ffd451');

  S.bonus = () =>
    '<circle cx="60" cy="62" r="54" fill="url(#cz-glow)" class="cz-bglow"/>' +
    '<g class="cz-fuse"><path d="M88 46 Q100 34 96 22" stroke="#c9a27a" stroke-width="4" fill="none" stroke-linecap="round"/><g class="cz-spark" transform="translate(96 20)"><path d="' + star(0, 0, 11, 3, 6) + '" fill="#fff3b8"/><circle r="4" fill="#ff9a3c"/></g></g>' +
    '<circle cx="62" cy="76" r="34" fill="url(#cz-ball)" stroke="' + OL + '" stroke-width="2.6"/>' +
    '<ellipse cx="50" cy="62" rx="10" ry="6" fill="#fff" opacity=".35" transform="rotate(-30 50 62)"/>' +
    '<g transform="translate(58 34) scale(.72)">' + wing(-20, 18, 0.62, true, 'cz-wing cz-wl') + wing(20, 18, 0.62, false, 'cz-wing cz-wr') + batHead({ fur: 'url(#cz-fur4)',
      extra: '<path d="M-27 -10 Q-28 -36 0 -38 Q28 -36 27 -10 Q0 -18 -27 -10Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.2"/><path d="M-12 -36 L-8 -14 M12 -36 L8 -14" stroke="#fff" stroke-width="4"/>' +
      '<rect x="-24" y="-16" width="48" height="12" rx="6" fill="#4a2a10" stroke="' + OL + '" stroke-width="1.6"/><circle cx="-11" cy="-10" r="7" fill="#9fe8ff" stroke="#ffd451" stroke-width="2.4"/><circle cx="11" cy="-10" r="7" fill="#9fe8ff" stroke="#ffd451" stroke-width="2.4"/><circle cx="-13" cy="-12" r="2" fill="#fff"/><circle cx="9" cy="-12" r="2" fill="#fff"/>' }).replace('<g class="cz-eyes">', '<g class="cz-eyes" opacity="0">') + '</g>' +
    '<g transform="translate(60 104)"><path d="M-46 -11 L46 -11 L40 0 L46 11 L-46 11 L-40 0Z" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<text x="0" y="7.5" text-anchor="middle" font-family="Bungee, Titan One, Impact, sans-serif" font-size="19" fill="#7d0a17" letter-spacing="1.5">BONUS</text></g>';

  function star(cx, cy, R, r, n) {
    let d = '';
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
    return d + 'Z';
  }
  const SYMS = ['wild', 'elephant', 'lion', 'strongman', 'juggler', 'seal', 'ace', 'king', 'queen', 'jack', 'bonus'];
  const symCache = {};
  function sym(i) { const k = SYMS[i]; return symCache[k] || (symCache[k] = S[k]()); }
  function symSvg(i, cls) { return '<svg class="cz-sym cz-s-' + SYMS[i] + (cls ? ' ' + cls : '') + '" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' + sym(i) + '</svg>'; }
  /* motion-blurred copies for the spinning strips (data URIs, so they are rasterised once and cached by the browser) */
  const blurCache = {};
  function symBlur(i) {
    if (blurCache[i]) return blurCache[i];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 120 140" width="120" height="140"><defs>' + DEFS_INNER + '<filter id="mb" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0.6 9"/></filter></defs><g filter="url(#mb)" opacity=".92">' + sym(i).replace(/font-family="[^"]*"/g, 'font-family="Impact, Arial Black, sans-serif"') + '</g></svg>';
    return (blurCache[i] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }

  /* ---------- characters for the scenes ---------- */
  /* Ringmaster Bat: origin at his feet, about 300 tall */
  function ringmaster() {
    return '<g class="cz-rm">' +
      '<ellipse cx="0" cy="2" rx="62" ry="10" fill="#000" opacity=".35"/>' +
      '<g class="cz-rm-wings">' + wing(-26, -196, 1.25, true, 'cz-wing cz-wl') + wing(26, -196, 1.25, false, 'cz-wing cz-wr') + '</g>' +
      '<path d="M-24 -96 L-30 -4 L-8 -4 L-4 -80 L4 -80 L8 -4 L30 -4 L24 -96Z" fill="#1d1024" stroke="' + OL + '" stroke-width="2.5"/>' +
      '<path d="M-34 -6 Q-36 4 -8 4 L-6 -6Z M34 -6 Q36 4 8 4 L6 -6Z" fill="#0d0710" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="M-38 -190 Q-48 -150 -46 -110 Q-52 -78 -40 -60 L-24 -92 L24 -92 L40 -60 Q52 -78 46 -110 Q48 -150 38 -190 Q0 -204 -38 -190Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M-14 -190 L0 -150 L14 -190 Q0 -196 -14 -190Z" fill="#fffaf0" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="M-14 -190 L-4 -120 L-24 -150Z M14 -190 L4 -120 L24 -150Z" fill="#7d0a17" stroke="' + OL + '" stroke-width="1.8"/>' +
      '<path d="M-9 -186 L0 -180 L9 -186 L9 -176 L0 -182 L-9 -176Z" fill="#ffd451" stroke="' + OL + '" stroke-width="1.6"/>' +
      '<g fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="1.2"><circle cx="-6" cy="-138" r="3.4"/><circle cx="-8" cy="-122" r="3.4"/><circle cx="6" cy="-138" r="3.4"/><circle cx="8" cy="-122" r="3.4"/></g>' +
      '<path d="M-26 -104 L26 -104 L25 -96 L-25 -96Z" fill="#1d1024"/><rect x="-6" y="-106" width="12" height="11" rx="2" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="1.4"/>' +
      '<path d="M-38 -186 Q-56 -184 -62 -170 L-44 -160 Q-44 -176 -36 -176Z M38 -186 Q56 -184 62 -170 L44 -160 Q44 -176 36 -176Z" fill="#ffd451" stroke="' + OL + '" stroke-width="2"/>' +
      '<g class="cz-rm-arml"><path d="M-40 -176 Q-62 -140 -40 -112" stroke="' + OL + '" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M-40 -176 Q-62 -140 -40 -112" stroke="url(#cz-red)" stroke-width="15" fill="none" stroke-linecap="round"/><circle cx="-38" cy="-110" r="9" fill="#fffaf0" stroke="' + OL + '" stroke-width="2"/></g>' +
      '<g class="cz-rm-armr"><path d="M40 -176 Q70 -160 80 -130" stroke="' + OL + '" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M40 -176 Q70 -160 80 -130" stroke="url(#cz-red)" stroke-width="15" fill="none" stroke-linecap="round"/>' +
      '<g class="cz-cane"><path d="M80 -128 L96 -20" stroke="#1d1024" stroke-width="6" stroke-linecap="round"/><circle cx="80" cy="-130" r="8" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2"/><path d="M95 -24 l2 6" stroke="url(#cz-gold)" stroke-width="7" stroke-linecap="round"/></g>' +
      '<circle cx="80" cy="-132" r="9.5" fill="#fffaf0" stroke="' + OL + '" stroke-width="2"/></g>' +
      '<g class="cz-rm-head" transform="translate(0 -226) scale(1.45)">' + batHead() + topHat(0, -24, 1.0) + '</g>' +
      '</g>';
  }
  /* Strongbat for his act: origin at feet, about 280 tall. Barbell is drawn separately (barbell()). */
  function strongbat() {
    return '<g class="cz-sb">' +
      '<ellipse cx="0" cy="2" rx="70" ry="11" fill="#000" opacity=".35"/>' +
      '<g class="cz-sb-legs"><path d="M-30 -100 L-40 -6 L-14 -6 L-6 -70 L6 -70 L14 -6 L40 -6 L30 -100Z" fill="url(#cz-fur2)" stroke="' + OL + '" stroke-width="2.6"/>' +
      '<path d="M-46 -8 Q-48 4 -12 4 L-12 -8Z M46 -8 Q48 4 12 4 L12 -8Z" fill="#1d1024" stroke="' + OL + '" stroke-width="2"/></g>' +
      '<g class="cz-sb-body"><path d="M-58 -206 Q-70 -160 -40 -100 L40 -100 Q70 -160 58 -206 Q0 -226 -58 -206Z" fill="url(#cz-fur2)" stroke="' + OL + '" stroke-width="2.6"/>' +
      '<path d="M-40 -168 Q0 -150 40 -168 L36 -100 L-36 -100Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.2"/>' +
      '<path d="M-38 -150 L38 -150 M-37 -132 L37 -132 M-36 -114 L36 -114" stroke="#fff1d6" stroke-width="6"/>' +
      '<path d="M-36 -168 L-14 -206" stroke="url(#cz-red)" stroke-width="9"/><path d="M-36 -168 L-14 -206" stroke="' + OL + '" stroke-width="1.5" fill="none" opacity=".6"/>' +
      '<path d="M-26 -196 Q-10 -186 0 -196 Q10 -186 26 -196" stroke="#4a2614" stroke-width="2.6" fill="none"/>' +
      '<path d="M-40 -108 L40 -108 L38 -96 L-38 -96Z" fill="#1d1024"/><rect x="-10" y="-112" width="20" height="18" rx="3" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="1.6"/></g>' +
      '<g class="cz-sb-head" transform="translate(0 -236) scale(1.4)">' + batHead({ fur: 'url(#cz-fur2)', furL: 'url(#cz-furL2)', brows: true,
        extra: '<path d="M0 9 Q-8 5 -16 9 Q-24 13 -26 6 Q-22 18 -12 15 Q-4 13 0 11 Q4 13 12 15 Q22 18 26 6 Q24 13 16 9 Q8 5 0 9Z" fill="#2a1408" stroke="' + OL + '" stroke-width="1.2"/><g class="cz-sweat" opacity="0"><path d="M30 -14 q4 6 0 9 q-4 -3 0 -9Z" fill="#9fe8ff"/><path d="M-32 -6 q4 6 0 9 q-4 -3 0 -9Z" fill="#9fe8ff"/></g><g class="cz-blush" opacity="0"><ellipse cx="0" cy="0" rx="28" ry="24" fill="#ff2a2a" opacity=".35"/></g><g class="cz-dizzy" opacity="0">' +
        '<path d="' + star(-22, -40, 7, 2.5, 5) + '" fill="#ffd451"/><path d="' + star(0, -48, 7, 2.5, 5) + '" fill="#ffd451"/><path d="' + star(22, -40, 7, 2.5, 5) + '" fill="#ffd451"/></g>' }) + '</g>' +
      '<g class="cz-sb-arms"><path class="cz-sb-al" d="M-56 -196 Q-90 -170 -84 -136" stroke="' + OL + '" stroke-width="30" fill="none" stroke-linecap="round"/><path d="M-56 -196 Q-90 -170 -84 -136" stroke="url(#cz-fur2)" stroke-width="24" fill="none" stroke-linecap="round"/>' +
      '<path d="M56 -196 Q90 -170 84 -136" stroke="' + OL + '" stroke-width="30" fill="none" stroke-linecap="round"/><path d="M56 -196 Q90 -170 84 -136" stroke="url(#cz-fur2)" stroke-width="24" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="-76" cy="-176" rx="15" ry="12" fill="#a8683f" stroke="' + OL + '" stroke-width="2"/><ellipse cx="76" cy="-176" rx="15" ry="12" fill="#a8683f" stroke="' + OL + '" stroke-width="2"/></g>' +
      '</g>';
  }
  /* barbell: weight 0 light, 1 medium, 2 heavy. Centre of the bar at 0,0. */
  function barbell(w) {
    const plates = [[16, 34, 'url(#cz-blue)'], [22, 52, 'url(#cz-green)'], [30, 74, '#1d1024']][w];
    const pw = plates[0], ph = plates[1], f = plates[2];
    const plate = (x) => '<rect x="' + (x - pw / 2) + '" y="' + (-ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="6" fill="' + f + '" stroke="' + OL + '" stroke-width="2.4"/><rect x="' + (x - pw / 2 + 3) + '" y="' + (-ph / 2 + 4) + '" width="4" height="' + (ph - 8) + '" rx="2" fill="#fff" opacity=".3"/>';
    const span = 96 + w * 10;
    return '<g class="cz-barbell">' +
      '<rect x="' + (-span - 16) + '" y="-5" width="' + (span * 2 + 32) + '" height="10" rx="5" fill="url(#cz-steel)" stroke="' + OL + '" stroke-width="2"/>' +
      plate(-span) + plate(span) + (w === 2 ? plate(-span + pw + 4) + plate(span - pw - 4) : '') +
      (w === 2 ? '<text x="' + (-span) + '" y="5" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="11" fill="#ffd451" transform="rotate(-90 ' + (-span) + ' 0)">1 TON</text><text x="' + span + '" y="5" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="11" fill="#ffd451" transform="rotate(-90 ' + span + ' 0)">1 TON</text>' : '') +
      '</g>';
  }
  /* kettlebell-style weight for the pick buttons: 0 light (blue), 1 medium (green), 2 heavy (black, 1 TON) */
  function weightIcon(w) {
    const c = ['url(#cz-blue)', 'url(#cz-green)', 'url(#cz-ball)'][w], lab = ['50 KG', '250 KG', '1 TON'][w];
    const sc = [0.72, 0.86, 1][w];
    return '<g transform="scale(' + sc + ')"><ellipse cx="0" cy="54" rx="58" ry="10" fill="#000" opacity=".35"/>' +
      '<path d="M-26 -36 Q-26 -66 0 -66 Q26 -66 26 -36" stroke="' + OL + '" stroke-width="16" fill="none"/><path d="M-26 -36 Q-26 -66 0 -66 Q26 -66 26 -36" stroke="url(#cz-steel)" stroke-width="10" fill="none"/>' +
      '<path d="M-52 10 Q-56 -40 0 -42 Q56 -40 52 10 Q48 54 0 56 Q-48 54 -52 10Z" fill="' + c + '" stroke="' + OL + '" stroke-width="3"/>' +
      '<ellipse cx="-22" cy="-18" rx="14" ry="8" fill="#fff" opacity=".3" transform="rotate(-25 -22 -18)"/>' +
      '<text x="0" y="22" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="' + (w === 2 ? 22 : 18) + '" fill="#fff6c2" stroke="' + OL + '" stroke-width="3" paint-order="stroke">' + lab + '</text></g>';
  }
  /* Bruno the bear on his unicycle: origin at the wheel's contact point, about 200 tall */
  function bear() {
    let spokes = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; spokes += '<path d="M0 0 L' + (Math.cos(a) * 24).toFixed(1) + ' ' + (Math.sin(a) * 24).toFixed(1) + '" stroke="#b9bfd1" stroke-width="2"/>'; }
    return '<g class="cz-bear">' +
      '<g class="cz-bear-pole"><path d="M-130 -116 L130 -116" stroke="' + OL + '" stroke-width="7" stroke-linecap="round"/><path d="M-130 -116 L130 -116" stroke="url(#cz-goldH)" stroke-width="4" stroke-linecap="round"/><circle cx="-130" cy="-116" r="9" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/><circle cx="130" cy="-116" r="9" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/></g>' +
      '<g class="cz-wheel" transform="translate(0 -28)"><circle r="28" fill="none" stroke="' + OL + '" stroke-width="9"/><circle r="28" fill="none" stroke="#3a3a4e" stroke-width="5"/>' + spokes + '<circle r="5" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="1.6"/></g>' +
      '<path d="M0 -28 L0 -74" stroke="url(#cz-steel)" stroke-width="6"/><path d="M-14 -76 L14 -76" stroke="' + OL + '" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M-6 -34 L-12 -60 M6 -34 L12 -60" stroke="#6b3a14" stroke-width="10" stroke-linecap="round"/>' +
      '<ellipse cx="0" cy="-104" rx="34" ry="36" fill="url(#cz-fur2)" stroke="' + OL + '" stroke-width="2.6"/>' +
      '<ellipse cx="0" cy="-98" rx="21" ry="24" fill="#e8c09a"/>' +
      '<path d="M-14 -134 L0 -124 L14 -134 L14 -122 L0 -128 L-14 -122Z" fill="#e0262f" stroke="' + OL + '" stroke-width="1.6"/>' +
      '<path d="M-30 -122 Q-50 -120 -64 -114 M30 -122 Q50 -120 64 -114" stroke="' + OL + '" stroke-width="13" stroke-linecap="round" fill="none"/><path d="M-30 -122 Q-50 -120 -64 -114 M30 -122 Q50 -120 64 -114" stroke="#8a5233" stroke-width="9" stroke-linecap="round" fill="none"/>' +
      '<g transform="translate(0 -160)"><circle cx="-24" cy="-22" r="10" fill="#8a5233" stroke="' + OL + '" stroke-width="2.4"/><circle cx="24" cy="-22" r="10" fill="#8a5233" stroke="' + OL + '" stroke-width="2.4"/><circle cx="-24" cy="-22" r="5" fill="#e8c09a"/><circle cx="24" cy="-22" r="5" fill="#e8c09a"/>' +
      '<ellipse cx="0" cy="0" rx="31" ry="28" fill="url(#cz-fur2)" stroke="' + OL + '" stroke-width="2.6"/><ellipse cx="0" cy="10" rx="15" ry="11" fill="#e8c09a"/><ellipse cx="0" cy="4" rx="6" ry="4.4" fill="' + OL + '"/>' +
      '<path d="M-6 12 Q0 18 6 12" stroke="' + OL + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<g class="cz-eyes"><circle cx="-11" cy="-7" r="4.2" fill="' + OL + '"/><circle cx="11" cy="-7" r="4.2" fill="' + OL + '"/><circle cx="-12" cy="-8.4" r="1.4" fill="#fff"/><circle cx="10" cy="-8.4" r="1.4" fill="#fff"/></g>' +
      '<path d="M-10 -26 L-8 -44 Q0 -47 8 -44 L10 -26 Q0 -22 -10 -26Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/><path d="M0 -45 Q10 -46 12 -36" stroke="#ffd451" stroke-width="2" fill="none"/></g>' +
      '</g>';
  }
  /* Blaze the fire-breathing bat: origin at feet; the torch flame tip is at (70,-196) */
  function blaze() {
    return '<g class="cz-blaze">' +
      '<ellipse cx="0" cy="2" rx="54" ry="9" fill="#000" opacity=".35"/>' +
      wing(-24, -150, 1.05, true, 'cz-wing cz-wl') + wing(24, -150, 1.05, false, 'cz-wing cz-wr') +
      '<path d="M-22 -80 L-28 -4 L-8 -4 L-4 -62 L4 -62 L8 -4 L28 -4 L22 -80Z" fill="#1d1024" stroke="' + OL + '" stroke-width="2.4"/>' +
      '<path d="M-34 -150 Q-44 -110 -26 -76 L26 -76 Q44 -110 34 -150 Q0 -162 -34 -150Z" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2.4"/>' +
      '<path d="M-30 -126 Q0 -116 30 -126 M-28 -104 Q0 -94 28 -104" stroke="#e0262f" stroke-width="5" fill="none"/>' +
      '<g class="cz-blaze-arm"><path d="M30 -144 Q56 -132 66 -160" stroke="' + OL + '" stroke-width="15" fill="none" stroke-linecap="round"/><path d="M30 -144 Q56 -132 66 -160" stroke="url(#cz-fur)" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<path d="M60 -150 L74 -186" stroke="url(#cz-wood)" stroke-width="7" stroke-linecap="round"/><path d="M70 -184 l8 2 l-2 6 l-8 -2Z" fill="#555"/>' +
      '<g class="cz-torchflame" transform="translate(75 -192)"><path d="M0 6 Q-10 -6 -4 -16 Q-2 -8 2 -10 Q0 -20 6 -26 Q8 -14 12 -10 Q14 -2 8 6 Q4 10 0 6Z" fill="url(#cz-flame)"/></g></g>' +
      '<g class="cz-blaze-head" transform="translate(0 -184) scale(1.3)">' + batHead({ fur: 'url(#cz-fur3)', extra: '<path d="M-29 -12 Q-30 -28 0 -30 Q30 -28 29 -12 Q0 -20 -29 -12Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/><path d="M26 -16 Q40 -14 44 -2 Q34 -6 28 -8Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="1.6"/><g class="cz-puff" opacity="0"><ellipse cx="0" cy="14" rx="14" ry="10" fill="#ff8f6f" stroke="' + OL + '" stroke-width="1.6"/></g>' }) + '</g>' +
      '</g>';
  }
  /* a standing torch for the fire act: origin at its base. lit state via class */
  function torch(i) {
    return '<g class="cz-torch" data-t="' + i + '">' +
      '<ellipse cx="0" cy="0" rx="20" ry="5" fill="#000" opacity=".35"/>' +
      '<path d="M-14 0 L14 0 L6 -10 L-6 -10Z" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="M-4 -10 L-6 -80 L6 -80 L4 -10Z" fill="url(#cz-wood)" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="M-16 -80 Q-18 -100 0 -102 Q18 -100 16 -80Z" fill="url(#cz-goldH)" stroke="' + OL + '" stroke-width="2.4"/>' +
      '<path d="M-14 -86 L14 -86 M-15 -94 L15 -94" stroke="#8a4a06" stroke-width="1.6"/>' +
      '<g class="cz-tf" transform="translate(0 -102)"><path d="M0 4 Q-20 -8 -10 -30 Q-6 -16 0 -20 Q-4 -40 8 -52 Q10 -32 18 -22 Q24 -6 12 4 Q6 8 0 4Z" fill="url(#cz-flame)"/><path d="M2 2 Q-8 -8 -2 -20 Q2 -12 6 -14 Q10 -4 6 2Z" fill="#fffbe0"/></g>' +
      '<g class="cz-tsmoke" opacity="0"><circle cx="-4" cy="-112" r="8" fill="#6b6475"/><circle cx="6" cy="-124" r="10" fill="#7d7686"/><circle cx="-2" cy="-140" r="12" fill="#8f8898"/></g>' +
      '</g>';
  }
  /* Jinx's jack-in-the-box: origin at the base centre, about 120 tall */
  function jesterBox(c) {
    const cols = [['url(#cz-purple)', 'url(#cz-gold)'], ['url(#cz-teal)', 'url(#cz-red)'], ['url(#cz-red)', 'url(#cz-teal)']][c % 3];
    return '<g class="cz-jbox">' +
      '<ellipse cx="0" cy="2" rx="62" ry="10" fill="#000" opacity=".35"/>' +
      '<g class="cz-jspring"><path d="M0 -96 ' + Array.from({ length: 8 }, (_, i) => 'L' + (i % 2 ? 14 : -14) + ' ' + (-96 - (i + 1) * 9)).join(' ') + '" stroke="url(#cz-steel)" stroke-width="5" fill="none"/>' +
      '<g class="cz-jhead" transform="translate(0 -176) scale(1.05)">' + batHead({ fur: 'url(#cz-fur)', extra: '<path d="M-28 -12 Q-44 -44 -60 -30 Q-46 -50 -20 -32 Q0 -66 20 -32 Q46 -50 60 -30 Q44 -44 28 -12 Q0 -24 -28 -12Z" fill="' + cols[0] + '" stroke="' + OL + '" stroke-width="2.2"/><circle cx="-60" cy="-30" r="5.5" fill="#ffd451" stroke="' + OL + '" stroke-width="1.4"/><circle cx="60" cy="-30" r="5.5" fill="#ffd451" stroke="' + OL + '" stroke-width="1.4"/><circle cx="0" cy="-50" r="5.5" fill="#ffd451" stroke="' + OL + '" stroke-width="1.4"/><path d="M-26 22 L-16 30 L-6 22 L4 30 L14 22 L24 30" stroke="#fffaf0" stroke-width="6" fill="none" stroke-linejoin="round"/>' }) + '</g></g>' +
      '<path d="M-50 -4 L50 -4 L54 -96 L-54 -96Z" fill="' + cols[0] + '" stroke="' + OL + '" stroke-width="3"/>' +
      '<path d="M-50 -4 L-54 -96 L0 -50Z M50 -4 L54 -96 L0 -50Z" fill="' + cols[1] + '" opacity=".75"/>' +
      '<path d="' + star(0, -50, 16, 7, 5) + '" fill="#fff6c2" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="M-54 -96 L54 -96" stroke="url(#cz-goldH)" stroke-width="7"/><path d="M-50 -4 L50 -4" stroke="url(#cz-goldH)" stroke-width="7"/>' +
      '<g class="cz-crank" transform="translate(56 -50)"><path d="M0 0 L16 0 L16 -16" stroke="url(#cz-steel)" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="16" cy="-18" r="5" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="1.6"/></g>' +
      '<g class="cz-jlid"><path d="M-58 -96 L58 -96 L56 -108 L-56 -108Z" fill="' + cols[1] + '" stroke="' + OL + '" stroke-width="3" stroke-linejoin="round"/></g>' +
      '<text class="cz-jn" x="0" y="-126" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="40" fill="#fff6c2" stroke="' + OL + '" stroke-width="6" paint-order="stroke" opacity="0">?</text>' +
      '</g>';
  }
  /* small jack-in-the-box that lands on a reel cell (viewBox-free, unit about 100) */
  function miniBox() {
    return '<svg viewBox="-60 -70 120 130" aria-hidden="true"><g class="cz-mb">' +
      '<path d="M-40 50 L40 50 L44 -20 L-44 -20Z" fill="url(#cz-purple)" stroke="' + OL + '" stroke-width="3"/>' +
      '<path d="' + star(0, 16, 16, 7, 5) + '" fill="#fff6c2" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="M-44 -20 L44 -20" stroke="url(#cz-goldH)" stroke-width="7"/><path d="M-40 50 L40 50" stroke="url(#cz-goldH)" stroke-width="7"/>' +
      '<g class="cz-mlid"><path d="M-48 -20 L48 -20 L46 -32 L-46 -32Z" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="3"/></g></g></svg>';
  }
  /* the cannon: origin at the axle; the barrel pivots at (0,-30) and its muzzle is 170 along it */
  function cannon() {
    let spokes = ''; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; spokes += '<path d="M0 0 L' + (Math.cos(a) * 46).toFixed(1) + ' ' + (Math.sin(a) * 46).toFixed(1) + '" stroke="url(#cz-wood)" stroke-width="6"/>'; }
    const wheel = (x) => '<g class="cz-cwheel" transform="translate(' + x + ' 0)"><g class="cz-cwheel-in"><circle r="52" fill="none" stroke="' + OL + '" stroke-width="14"/><circle r="52" fill="none" stroke="url(#cz-gold)" stroke-width="9"/>' + spokes + '<circle r="12" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2.4"/></g></g>';
    return '<g class="cz-cannon">' +
      '<ellipse cx="0" cy="54" rx="150" ry="16" fill="#000" opacity=".4"/>' +
      '<path d="M-130 30 L120 30 L100 -20 L-110 -20Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="3"/>' +
      '<path d="M-120 20 L110 20" stroke="#ffd451" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>' +
      '<g class="cz-barrel" transform="translate(0 -30) rotate(-32)">' +
      '<path d="M-70 -36 L170 -50 L170 50 L-70 36 Q-100 0 -70 -36Z" fill="url(#cz-blue)" stroke="' + OL + '" stroke-width="3.4"/>' +
      '<path d="M-60 -28 L160 -38" stroke="#fff" stroke-opacity=".45" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M-40 -38 L-40 38 M40 -42 L40 42 M120 -47 L120 47" stroke="url(#cz-goldH)" stroke-width="12"/>' +
      '<path d="M162 -58 L182 -58 L182 58 L162 58Z" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="3"/>' +
      '<path d="' + star(80, 0, 22, 9, 5) + '" fill="#ffd451" stroke="' + OL + '" stroke-width="2"/>' +
      '<path d="' + star(0, 0, 16, 6.5, 5) + '" fill="#fff6c2" stroke="' + OL + '" stroke-width="2"/>' +
      '<g class="cz-fusewire"><path d="M-80 -10 Q-110 -30 -100 -60 Q-94 -80 -110 -90" stroke="#c9a27a" stroke-width="5" fill="none" stroke-linecap="round"/></g>' +
      '<g class="cz-fusespark" transform="translate(-110 -90)"><path d="' + star(0, 0, 14, 4, 7) + '" fill="#fff3b8"/><circle r="5" fill="#ff9a3c"/></g>' +
      '</g>' +
      wheel(-70) + wheel(70) +
      '</g>';
  }
  /* the performer in flight (facing right): origin at his middle */
  function performer() {
    return '<g class="cz-perf">' +
      '<g class="cz-cape"><path d="M-10 -10 Q-60 -30 -96 -6 Q-70 0 -84 18 Q-50 10 -10 10Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.4"/></g>' +
      wing(-6, -4, 0.9, true, 'cz-wing cz-wl') +
      '<path d="M-30 -14 Q0 -24 34 -10 Q40 0 34 12 Q0 22 -30 12Z" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2.4"/>' +
      '<path d="M-24 -10 L30 -4 M-24 6 L30 6" stroke="#e0262f" stroke-width="4"/>' +
      '<path d="M30 -8 L64 -18" stroke="' + OL + '" stroke-width="11" stroke-linecap="round"/><path d="M30 -8 L64 -18" stroke="url(#cz-fur)" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M-30 -6 L-60 -14 M-30 6 L-60 10" stroke="#1d1024" stroke-width="10" stroke-linecap="round"/>' +
      '<g transform="translate(44 -20) rotate(58) scale(.72)">' + batHead({ fur: 'url(#cz-fur4)', extra: '<path d="M-27 -10 Q-28 -36 0 -38 Q28 -36 27 -10 Q0 -18 -27 -10Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2.2"/><path d="M-12 -36 L-8 -14 M12 -36 L8 -14" stroke="#fff" stroke-width="4"/><rect x="-24" y="-16" width="48" height="12" rx="6" fill="#4a2a10" stroke="' + OL + '" stroke-width="1.6"/><circle cx="-11" cy="-10" r="7" fill="#9fe8ff" stroke="#ffd451" stroke-width="2.4"/><circle cx="11" cy="-10" r="7" fill="#9fe8ff" stroke="#ffd451" stroke-width="2.4"/><circle cx="-13" cy="-12" r="2" fill="#fff"/><circle cx="9" cy="-12" r="2" fill="#fff"/>' }).replace('<g class="cz-eyes">', '<g class="cz-eyes" opacity="0">').replace('class="cz-m-smile"', 'class="cz-m-smile" style="display:none"').replace('class="cz-m-grit"', 'class="cz-m-grit" style="display:none"') + '</g>' +
      '</g>';
  }
  /* a balloon for Elephant Spins: origin at the knot */
  function balloon() {
    return '<g class="cz-balloon"><path d="M0 0 Q-10 40 6 80 Q16 110 0 150" stroke="#fffaf0" stroke-width="2.4" fill="none" opacity=".8"/>' +
      '<g class="cz-bal-body"><path d="M0 -4 Q-86 -60 -74 -150 Q-60 -230 0 -232 Q60 -230 74 -150 Q86 -60 0 -4Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="3.4"/>' +
      '<path d="M-44 -190 Q-30 -214 -6 -214" stroke="#fff" stroke-opacity=".6" stroke-width="12" fill="none" stroke-linecap="round"/><ellipse cx="-52" cy="-150" rx="8" ry="16" fill="#fff" opacity=".35"/>' +
      '<path d="M-6 -4 L6 -4 L10 6 L-10 6Z" fill="#a8101e" stroke="' + OL + '" stroke-width="2"/>' +
      '<g transform="translate(0 -196) scale(.5)">' + '<path d="M-40 0 Q-70 -20 -66 10 Q-62 30 -46 26 M40 0 Q70 -20 66 10 Q62 30 46 26" fill="#ffd451" opacity=".9"/></g>' +
      '<text class="cz-bal-x" x="0" y="-102" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="72" fill="#fff6c2" stroke="' + OL + '" stroke-width="7" paint-order="stroke">×2</text>' +
      '<text x="0" y="-52" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="16" fill="#ffd451" letter-spacing="2">MULTIPLIER</text></g></g>';
  }

  /* ---------- act icons (viewBox -50 -50 100 100) ---------- */
  const ACT_ICON = [
    /* strongman: barbell */
    '<rect x="-40" y="-4" width="80" height="8" rx="4" fill="url(#cz-steel)" stroke="' + OL + '" stroke-width="2"/><rect x="-38" y="-20" width="12" height="40" rx="4" fill="#1d1024" stroke="' + OL + '" stroke-width="2"/><rect x="26" y="-20" width="12" height="40" rx="4" fill="#1d1024" stroke="' + OL + '" stroke-width="2"/><rect x="-26" y="-14" width="8" height="28" rx="3" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="1.6"/><rect x="18" y="-14" width="8" height="28" rx="3" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="1.6"/>',
    /* bear: face */
    '<circle cx="-22" cy="-22" r="10" fill="#8a5233" stroke="' + OL + '" stroke-width="2"/><circle cx="22" cy="-22" r="10" fill="#8a5233" stroke="' + OL + '" stroke-width="2"/><circle r="30" fill="url(#cz-fur2)" stroke="' + OL + '" stroke-width="2.4"/><ellipse cx="0" cy="10" rx="14" ry="10" fill="#e8c09a"/><ellipse cx="0" cy="4" rx="6" ry="4" fill="' + OL + '"/><circle cx="-11" cy="-8" r="4" fill="' + OL + '"/><circle cx="11" cy="-8" r="4" fill="' + OL + '"/><path d="M-10 -26 L-8 -44 Q0 -47 8 -44 L10 -26 Q0 -22 -10 -26Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/>',
    /* fire: flame */
    '<path d="M0 40 Q-34 30 -30 0 Q-28 -16 -16 -24 Q-14 -10 -6 -8 Q-12 -30 6 -46 Q4 -20 20 -14 Q34 -4 30 14 Q26 36 0 40Z" fill="url(#cz-flame)" stroke="#8a2a06" stroke-width="2"/><path d="M0 34 Q-14 28 -12 12 Q-6 18 -2 14 Q-4 2 6 -6 Q8 8 14 14 Q18 28 0 34Z" fill="#fffbe0"/>',
    /* jester: hat */
    '<path d="M-34 20 Q-50 -20 -40 -34 Q-28 -10 -12 -6 Q-8 -40 0 -44 Q8 -40 12 -6 Q28 -10 40 -34 Q50 -20 34 20Z" fill="url(#cz-purple)" stroke="' + OL + '" stroke-width="2.4"/><path d="M-12 -6 Q0 0 12 -6 L0 20Z" fill="url(#cz-teal)" opacity=".8"/><circle cx="-40" cy="-36" r="6" fill="#ffd451" stroke="' + OL + '" stroke-width="1.6"/><circle cx="0" cy="-46" r="6" fill="#ffd451" stroke="' + OL + '" stroke-width="1.6"/><circle cx="40" cy="-36" r="6" fill="#ffd451" stroke="' + OL + '" stroke-width="1.6"/><rect x="-36" y="16" width="72" height="12" rx="6" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="2"/>',
    /* elephant: head */
    '<path d="M-14 -10 Q-46 -30 -46 0 Q-44 18 -30 20Z M14 -10 Q46 -30 46 0 Q44 18 30 20Z" fill="url(#cz-grey)" stroke="' + OL + '" stroke-width="2"/><ellipse cx="0" cy="-4" rx="22" ry="22" fill="url(#cz-grey)" stroke="' + OL + '" stroke-width="2.2"/><path d="M0 10 Q-2 30 10 38 Q18 40 20 32" stroke="' + OL + '" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M0 10 Q-2 30 10 38 Q18 40 20 32" stroke="#b9a9d1" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="-8" cy="-6" r="3" fill="' + OL + '"/><circle cx="8" cy="-6" r="3" fill="' + OL + '"/><path d="M-10 -22 L-8 -38 Q0 -41 8 -38 L10 -22 Q0 -18 -10 -22Z" fill="url(#cz-red)" stroke="' + OL + '" stroke-width="2"/>',
  ];
  const actIcon = (a, cls) => '<svg class="cz-acticon' + (cls ? ' ' + cls : '') + '" viewBox="-50 -50 100 100" aria-hidden="true">' + ACT_ICON[a] + '</svg>';

  /* ---------- the cannon target board (centre 0,0, radius R) ---------- */
  function board(R, M) {
    const rOut = R, rMid = R * 0.64, rIn = R * 0.3;
    const wedge = (r0, r1, a0, a1) => {
      const p = (r, a) => (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1);
      return 'M' + p(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + p(r1, a1) + ' L' + p(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + p(r0, a0) + 'Z';
    };
    let s = '<g class="cz-board">';
    s += '<circle r="' + (R + 26) + '" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="4"/><circle r="' + (R + 12) + '" fill="#2a0b1e"/>';
    /* outer ring: 10 wedges starting at -90deg */
    for (let i = 0; i < 10; i++) {
      const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI / 5), a1 = a0 + Math.PI / 5, am = (a0 + a1) / 2;
      const S = M.SEGS[i], cash = S.k === 'cash';
      s += '<path class="cz-seg" data-seg="' + i + '" d="' + wedge(rMid, rOut, a0, a1) + '" fill="' + (cash ? (i % 4 === 0 ? 'url(#cz-cream)' : '#ffe9b8') : (i % 4 === 1 ? 'url(#cz-red)' : '#b3101f')) + '" stroke="' + OL + '" stroke-width="3"/>';
      const rx = Math.cos(am) * (rMid + rOut) / 2, ry = Math.sin(am) * (rMid + rOut) / 2, rot = (am * 180 / Math.PI) + 90;
      if (cash) s += '<text x="' + rx.toFixed(1) + '" y="' + ry.toFixed(1) + '" transform="rotate(' + rot.toFixed(1) + ' ' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ')" dy="10" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="' + (R * 0.11).toFixed(0) + '" fill="#7d0a17">' + S.x + '×</text>';
      else s += '<g transform="translate(' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ') rotate(' + rot.toFixed(1) + ') scale(' + (R * 0.0036).toFixed(3) + ')">' + ACT_ICON[S.a[0]] + '</g>';
    }
    /* middle ring: 5 two-act wedges */
    for (let j = 0; j < 5; j++) {
      const a0 = -Math.PI / 2 + (j - 0.5) * (2 * Math.PI / 5) + Math.PI / 5, a1 = a0 + 2 * Math.PI / 5, am = (a0 + a1) / 2;
      const S = M.SEGS[10 + j];
      s += '<path class="cz-seg" data-seg="' + (10 + j) + '" d="' + wedge(rIn, rMid, a0, a1) + '" fill="' + (j % 2 ? 'url(#cz-teal)' : 'url(#cz-purple)') + '" stroke="' + OL + '" stroke-width="3"/>';
      const rr = (rIn + rMid) / 2, rot = am * 180 / Math.PI + 90;
      for (let k = 0; k < 2; k++) {
        const aa = am + (k ? 0.22 : -0.22), x = Math.cos(aa) * rr, y = Math.sin(aa) * rr;
        s += '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ') scale(' + (R * 0.0024).toFixed(3) + ')"><circle r="44" fill="#fff6c2" opacity=".85"/>' + ACT_ICON[S.a[k]] + '</g>';
      }
    }
    s += '<circle class="cz-seg" data-seg="15" r="' + rIn + '" fill="url(#cz-gold)" stroke="' + OL + '" stroke-width="3"/>';
    s += '<path d="' + star(0, 0, rIn * 0.9, rIn * 0.42, 8) + '" fill="#fff6c2" opacity=".7"/>';
    s += '<text y="' + (-rIn * 0.08).toFixed(1) + '" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="' + (rIn * 0.44).toFixed(0) + '" fill="#7d0a17">3</text><text y="' + (rIn * 0.38).toFixed(1) + '" text-anchor="middle" font-family="Bungee, Impact, sans-serif" font-size="' + (rIn * 0.22).toFixed(0) + '" fill="#7d0a17">ACTS</text>';
    /* rim bulbs */
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; s += '<circle class="cz-rimbulb' + (i % 2 ? ' b2' : '') + '" cx="' + (Math.cos(a) * (R + 19)).toFixed(1) + '" cy="' + (Math.sin(a) * (R + 19)).toFixed(1) + '" r="5" fill="#fff4c2"/>'; }
    return s + '</g>';
  }

  /* ---------- the big top (background), viewBox W x H ---------- */
  function bigTop(W, H) {
    const cx = W / 2, apexY = -H * 0.18;
    let s = '<svg class="cz-tent" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
    s += '<rect width="' + W + '" height="' + H + '" fill="#2a0612"/>';
    /* canvas panels radiating from the apex */
    s += '<g class="cz-canvas">';
    const n = 22, spread = W * 1.8;
    for (let i = 0; i < n; i++) {
      const x0 = cx - spread / 2 + (i / n) * spread, x1 = cx - spread / 2 + ((i + 1) / n) * spread;
      s += '<path d="M' + cx + ' ' + apexY + ' L' + x0.toFixed(0) + ' ' + (H * 0.62).toFixed(0) + ' Q' + ((x0 + x1) / 2).toFixed(0) + ' ' + (H * 0.68).toFixed(0) + ' ' + x1.toFixed(0) + ' ' + (H * 0.62).toFixed(0) + 'Z" fill="' + (i % 2 ? 'url(#cz-tent1)' : 'url(#cz-tent2)') + '"/>';
    }
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#cz-shade)"/>';
    s += '</g>';
    /* tent poles and rigging */
    s += '<path d="M' + (cx - W * 0.33) + ' 0 L' + (cx - W * 0.31) + ' ' + H + ' M' + (cx + W * 0.33) + ' 0 L' + (cx + W * 0.31) + ' ' + H + '" stroke="#5a1a0a" stroke-width="' + (W * 0.012) + '"/>';
    s += '<path d="M' + (cx - W * 0.33) + ' 0 L' + (cx - W * 0.31) + ' ' + H + ' M' + (cx + W * 0.33) + ' 0 L' + (cx + W * 0.31) + ' ' + H + '" stroke="#c98a4a" stroke-width="' + (W * 0.004) + '" opacity=".6"/>';
    s += '<path d="M' + (cx - W * 0.2) + ' ' + (H * 0.04) + ' L' + (cx - W * 0.17) + ' ' + (H * 0.34) + ' M' + (cx + W * 0.2) + ' ' + (H * 0.04) + ' L' + (cx + W * 0.17) + ' ' + (H * 0.34) + '" stroke="#e8d0a0" stroke-width="2" opacity=".5"/>';
    s += '<g class="cz-trapeze"><path d="M' + (cx - W * 0.17) + ' ' + (H * 0.34) + ' L' + (cx + W * 0.17) + ' ' + (H * 0.34) + '" stroke="#ffd451" stroke-width="5" opacity=".7"/></g>';
    /* bunting garlands */
    s += '<g class="cz-bunting">';
    const garland = (y0, sag, k, ph) => {
      let g = '<path d="M-20 ' + y0 + ' Q' + cx + ' ' + (y0 + sag) + ' ' + (W + 20) + ' ' + y0 + '" stroke="#f1d9aa" stroke-width="2" fill="none"/>';
      const cols = ['#e0262f', '#ffd451', '#17b5a3', '#a447e0', '#2f7de0'];
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k, x = (1 - t) * (1 - t) * -20 + 2 * (1 - t) * t * cx + t * t * (W + 20), y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag) + t * t * y0;
        g += '<path class="cz-flag" style="animation-delay:' + (-(i * 0.37 + ph) % 3).toFixed(2) + 's" d="M' + (x - 13).toFixed(0) + ' ' + y.toFixed(0) + ' L' + (x + 13).toFixed(0) + ' ' + y.toFixed(0) + ' L' + x.toFixed(0) + ' ' + (y + 30).toFixed(0) + 'Z" fill="' + cols[(i + ph) % 5] + '" stroke="#2a0b1e" stroke-width="1.4"/>';
      }
      return g;
    };
    s += garland(H * 0.08, H * 0.12, 20, 0) + garland(H * 0.2, H * 0.1, 24, 2);
    s += '</g>';
    /* spotlight beams */
    s += '<g class="cz-beams" style="mix-blend-mode:screen">';
    [[0.08, 'cz-beam-a'], [0.92, 'cz-beam-b'], [0.5, 'cz-beam-c']].forEach(([fx, cls]) => {
      s += '<g class="cz-beam ' + cls + '" style="transform-origin:' + (W * fx).toFixed(0) + 'px -20px"><path d="M' + (W * fx - 14).toFixed(0) + ' -20 L' + (W * fx + 14).toFixed(0) + ' -20 L' + (W * fx + W * 0.14).toFixed(0) + ' ' + (H * 1.05).toFixed(0) + ' L' + (W * fx - W * 0.14).toFixed(0) + ' ' + (H * 1.05).toFixed(0) + 'Z" fill="url(#cz-beamL)"/></g>';
    });
    s += '</g>';
    /* the ring and the floor */
    s += '<rect y="' + (H * 0.62) + '" width="' + W + '" height="' + (H * 0.38) + '" fill="#1a0510"/>';
    s += '<ellipse cx="' + cx + '" cy="' + (H * 0.88) + '" rx="' + (W * 0.6) + '" ry="' + (H * 0.2) + '" fill="#6b3a14"/>';
    s += '<ellipse cx="' + cx + '" cy="' + (H * 0.88) + '" rx="' + (W * 0.6) + '" ry="' + (H * 0.2) + '" fill="none" stroke="#e0262f" stroke-width="' + (H * 0.03) + '"/>';
    s += '<ellipse cx="' + cx + '" cy="' + (H * 0.88) + '" rx="' + (W * 0.6) + '" ry="' + (H * 0.2) + '" fill="none" stroke="#ffd451" stroke-width="3" stroke-dasharray="4 18"/>';
    s += '<ellipse cx="' + cx + '" cy="' + (H * 0.9) + '" rx="' + (W * 0.5) + '" ry="' + (H * 0.14) + '" fill="#c98a4a" opacity=".55"/>';
    s += '</svg>';
    return s;
  }
  /* the crowd: rows of bat silhouettes (each a <g class="cz-fan">) */
  function crowd(W, rows) {
    let s = '<svg class="cz-crowd" viewBox="0 0 ' + W + ' 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">';
    for (let r = 0; r < rows; r++) {
      const y = 70 + r * 38, step = 62 - r * 4, col = ['#3a0a1e', '#2a0614', '#1a030c'][r];
      for (let x = -20 + (r % 2) * 30; x < W + 40; x += step) {
        const k = ((x * 7 + r * 13) % 5) / 5, hgt = 8 + k * 12;
        s += '<g class="cz-fan" style="animation-delay:' + (-(x % 97) / 60).toFixed(2) + 's"><g transform="translate(' + x + ' ' + (y - hgt) + ')">' +
          '<path d="M-17 -6 L-22 -34 Q-10 -24 -4 -20 Q0 -22 4 -20 Q10 -24 22 -34 L17 -6 Q20 12 0 14 Q-20 12 -17 -6Z" fill="' + col + '"/>' +
          '<path d="M-30 40 Q-30 14 0 12 Q30 14 30 40Z" fill="' + col + '"/>' +
          '<circle cx="-7" cy="-4" r="2.4" fill="#ffd451" opacity="' + (r === 0 ? 0.55 : 0.3) + '"/><circle cx="7" cy="-4" r="2.4" fill="#ffd451" opacity="' + (r === 0 ? 0.55 : 0.3) + '"/>' +
          '<g class="cz-fanw"><path d="M-26 22 L-44 -10 L-34 -4 L-40 -22 L-28 -8 Z M26 22 L44 -10 L34 -4 L40 -22 L28 -8 Z" fill="' + col + '"/></g></g></g>';
      }
    }
    return s + '</svg>';
  }
  /* the velvet curtains: a full-width drape element (left or right), drawn as SVG with folds */
  function curtain(side) {
    let folds = '';
    for (let i = 0; i < 9; i++) { const x = i * 60; folds += '<path d="M' + x + ' 0 Q' + (x + 30) + ' 300 ' + (x + 10) + ' 600 Q' + (x + 30) + ' 900 ' + x + ' 1000 L' + (x + 60) + ' 1000 Q' + (x + 50) + ' 700 ' + (x + 60) + ' 400 Q' + (x + 70) + ' 150 ' + (x + 60) + ' 0Z" fill="url(#cz-velvet)" stroke="#2a0108" stroke-width="2"/><path d="M' + (x + 28) + ' 0 Q' + (x + 40) + ' 500 ' + (x + 28) + ' 1000" stroke="#ff4a5a" stroke-opacity=".25" stroke-width="8" fill="none"/>'; }
    return '<svg viewBox="0 0 540 1000" preserveAspectRatio="none" aria-hidden="true"' + (side === 'r' ? ' style="transform:scaleX(-1)"' : '') + '>' + folds +
      '<path d="M0 990 L540 990" stroke="url(#cz-goldH)" stroke-width="16"/>' + '</svg>';
  }
  function valance() {
    let s = '<svg class="cz-valance" viewBox="0 0 1600 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 L1600 0 L1600 34 ';
    for (let i = 16; i > 0; i--) s += 'Q' + (i * 100 - 50) + ' 70 ' + ((i - 1) * 100) + ' 34 ';
    s += 'Z" fill="url(#cz-velvet)" stroke="#2a0108" stroke-width="2"/><path d="M0 34 ';
    for (let i = 0; i < 16; i++) s += 'Q' + (i * 100 + 50) + ' 70 ' + ((i + 1) * 100) + ' 34 ';
    s += '" stroke="url(#cz-goldH)" stroke-width="5" fill="none"/>';
    for (let i = 0; i < 16; i++) s += '<path d="M' + (i * 100 + 50) + ' 52 l-5 14 l10 0Z" fill="#ffd451"/>';
    return s + '</svg>';
  }

  /* ---------- lobby poster (300 x 380) ---------- */
  function poster(M) {
    const W = 300, H = 380;
    let s = '<svg viewBox="0 0 300 380" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>' + DEFS_INNER.replace(/cz-/g, 'czp-') +
      '<linearGradient id="czp-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient></defs>';
    s += '<rect width="300" height="380" fill="#2a0612"/>';
    for (let i = 0; i < 14; i++) { const x0 = -150 + i * 43, x1 = x0 + 43; s += '<path d="M150 -60 L' + x0 + ' 260 L' + x1 + ' 260Z" fill="' + (i % 2 ? 'url(#czp-tent1)' : 'url(#czp-tent2)') + '"/>'; }
    s += '<rect width="300" height="380" fill="url(#czp-shade)"/>';
    s += '<path d="M-10 250 L310 250 L310 380 L-10 380Z" fill="#1a0510"/><ellipse cx="150" cy="350" rx="190" ry="60" fill="#6b3a14"/><ellipse cx="150" cy="350" rx="190" ry="60" fill="none" stroke="#e0262f" stroke-width="10"/>';
    s += '<path d="M40 -10 L100 400 L-40 400Z" fill="#fff8dc" opacity=".12"/><path d="M260 -10 L340 400 L200 400Z" fill="#fff8dc" opacity=".12"/>';
    s += '<g transform="translate(150 196) scale(1.3)"><path d="' + star(0, 0, 70, 52, 16) + '" fill="url(#czp-gold)" opacity=".9"/></g>';
    s += '<g transform="translate(150 352) scale(.78)">' + ringmaster().replace(/cz-/g, 'czp-') + '</g>';
    s += '<g transform="translate(46 300) scale(.42)">' + '<svg x="-60" y="-60" width="120" height="120" viewBox="0 0 120 120">' + S.elephant().replace(/cz-/g, 'czp-') + '</svg></g>';
    s += '<g transform="translate(254 300) scale(.42)">' + '<svg x="-60" y="-60" width="120" height="120" viewBox="0 0 120 120">' + S.lion().replace(/cz-/g, 'czp-') + '</svg></g>';
    s += '<path d="M0 0 L300 0 L300 18 Q285 34 270 18 Q255 34 240 18 Q225 34 210 18 Q195 34 180 18 Q165 34 150 18 Q135 34 120 18 Q105 34 90 18 Q75 34 60 18 Q45 34 30 18 Q15 34 0 18Z" fill="url(#czp-velvet)"/>';
    s += '<text x="150" y="70" text-anchor="middle" font-family="Bungee, Titan One, Impact, sans-serif" font-size="30" fill="#fff6c2" stroke="#2a0b1e" stroke-width="6" paint-order="stroke" letter-spacing="2">BATTY</text>';
    s += '<text x="150" y="118" text-anchor="middle" font-family="Bungee, Titan One, Impact, sans-serif" font-size="46" fill="url(#czp-gold)" stroke="#2a0b1e" stroke-width="7" paint-order="stroke" letter-spacing="1">CIRCUS</text>';
    s += '<text x="150" y="140" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="800" font-size="11" fill="#fff1d6" letter-spacing="3">THE CANNON · FIVE ACTS</text>';
    return s + '</svg>';
  }

  root.BattyCircusArt = { OL, DEFS, DEFS_INNER, SYMS, sym, symSvg, symBlur, batHead, wing, topHat, star, ringmaster, strongbat, barbell, weightIcon, bear, blaze, torch, jesterBox, miniBox, cannon, performer, balloon, actIcon, ACT_ICON, board, bigTop, crowd, curtain, valance, poster };
})(typeof globalThis !== 'undefined' ? globalThis : this);
