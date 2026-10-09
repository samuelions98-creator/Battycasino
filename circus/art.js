/* Original vector cast, scalable without external images or fonts. */
(function(){let serial=0;const gold='#efb94e',ink='#35223b',red='#ca4853',cream='#fff1cf',blue='#69b9be';
const eye=(x,y)=>`<ellipse cx="${x}" cy="${y}" rx="3" ry="4" fill="${ink}"/><circle cx="${x+1}" cy="${y-1}" r="1" fill="white"/>`;
const face=`<ellipse cx="50" cy="44" rx="20" ry="22" fill="#ffc49a"/>${eye(43,42)}${eye(57,42)}<path d="M43 54q7 6 14 0" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
const bodies={
 cannon:`<path d="M23 69l38-35 23 22-41 31z" fill="#cb4a55" stroke="#f5c874" stroke-width="3"/><ellipse cx="74" cy="45" rx="17" ry="9" transform="rotate(43 74 45)" fill="#312436" stroke="#efbc70" stroke-width="4"/><path d="M23 68L7 58" stroke="#f5c874" stroke-width="3"/><circle cx="8" cy="56" r="4" fill="#ffe893"/><circle cx="32" cy="82" r="14" fill="#382a3f" stroke="#e3ad62" stroke-width="5"/><circle cx="32" cy="82" r="4" fill="#e3ad62"/><path d="M62 81h27" stroke="#e3ad62" stroke-width="5"/>`,
 monkey:`<circle cx="24" cy="45" r="12" fill="#9b6140"/><circle cx="76" cy="45" r="12" fill="#9b6140"/><ellipse cx="50" cy="47" rx="30" ry="32" fill="#9b6140"/><path d="M50 33c-30-23-40 29-16 39q16 12 32 0c24-10 14-62-16-39" fill="#f9cb92"/>${eye(39,47)}${eye(61,47)}<path d="M35 60q15 15 30 0" fill="white" stroke="${ink}" stroke-width="2"/><path d="M35 15h31l-5 20H40z" fill="${red}"/><ellipse cx="50" cy="34" rx="25" ry="4" fill="${gold}"/><path d="M27 87l23-9 23 9-23 8z" fill="${blue}"/>`,
 penguin:`<ellipse cx="50" cy="57" rx="26" ry="34" fill="${ink}"/><path d="M25 49L8 72l17-6M75 49l17 23-17-6" fill="${ink}"/><ellipse cx="50" cy="64" rx="18" ry="24" fill="${cream}"/><ellipse cx="40" cy="42" rx="9" ry="11" fill="white"/><ellipse cx="60" cy="42" rx="9" ry="11" fill="white"/>${eye(42,43)}${eye(58,43)}<path d="M43 51h14l-7 9zM22 91l16-8 8 9M54 92l8-9 16 8" fill="${gold}"/><path d="M39 63l11 5 11-5v13l-11-5-11 5z" fill="${red}"/><path d="M31 26l5-16 32 4 1 13z" fill="${blue}"/><circle cx="52" cy="11" r="6" fill="${gold}"/>`,
 elephant:`<ellipse cx="25" cy="47" rx="19" ry="27" fill="#69a6b4"/><ellipse cx="75" cy="47" rx="19" ry="27" fill="#69a6b4"/><ellipse cx="25" cy="47" rx="12" ry="19" fill="#a3d3d4"/><ellipse cx="75" cy="47" rx="12" ry="19" fill="#a3d3d4"/><ellipse cx="50" cy="46" rx="23" ry="30" fill="#90c6ce"/>${eye(39,43)}${eye(61,43)}<path d="M51 57v21q0 18 15 8" fill="none" stroke="#90c6ce" stroke-width="14" stroke-linecap="round"/><path d="M32 59l-7 15q10 0 13-12M68 59l7 15q-10 0-13-12" fill="${cream}"/><path d="M34 22l16-17 16 17z" fill="${red}"/><circle cx="50" cy="6" r="4" fill="${gold}"/>`,
 strong:`<path d="M26 91V70q-14 4-19-10V38h12v20l15-6h32l15 6V38h12v22q-5 14-19 10v21" fill="#ffbb91"/>${face}<path d="M29 88l5-26h32l5 26" fill="${red}"/><path d="M40 20q10-12 20 0v11H40z" fill="${ink}"/><path d="M39 49q6-8 11 0 5-8 11 0l-11 5z" fill="${ink}"/><path d="M8 24h84" stroke="${ink}" stroke-width="6"/><rect x="3" y="10" width="13" height="30" rx="5" fill="#53616e"/><rect x="84" y="10" width="13" height="30" rx="5" fill="#53616e"/><path d="M29 83h42v8H29z" fill="${gold}"/>`,
 jester:`<path d="M28 85q-5-19 10-28h24q15 9 10 28" fill="${blue}"/>${face}<path d="M25 35Q12 1 36 19Q46-12 57 18Q90-3 76 34L59 27 44 31z" fill="${red}"/><circle cx="23" cy="9" r="5" fill="${gold}"/><circle cx="49" cy="6" r="5" fill="${gold}"/><circle cx="82" cy="9" r="5" fill="${gold}"/><path d="M29 66l10-6 11 12 11-12 10 6-11 13H40z" fill="${cream}"/><rect x="21" y="80" width="58" height="17" rx="3" fill="${red}"/><path d="M50 81v15" stroke="${gold}" stroke-width="8"/>`,
 bear:`<circle cx="31" cy="24" r="10" fill="#a7704f"/><circle cx="69" cy="24" r="10" fill="#a7704f"/><ellipse cx="50" cy="43" rx="26" ry="26" fill="#a7704f"/><ellipse cx="50" cy="52" rx="17" ry="12" fill="#e5b986"/>${eye(40,39)}${eye(60,39)}<ellipse cx="50" cy="49" rx="6" ry="4" fill="${ink}"/><path d="M28 68l22-7 22 7-7 14H35z" fill="${blue}"/><path d="M43 80l7 12 7-12" fill="none" stroke="${ink}" stroke-width="4"/><circle cx="50" cy="91" r="8" fill="none" stroke="${gold}" stroke-width="4"/><path d="M32 19l7-13h23l6 13z" fill="${red}"/>`,
 fire:`<path d="M29 94l5-29 22-5 20 34" fill="${blue}"/>${face}<path d="M28 32q-1-28 31-19l15 18-27-6z" fill="${red}"/><path d="M55 48q16-8 22 0" fill="none" stroke="${ink}" stroke-width="2"/><path d="M73 45q7-14 11-23 3 12 7 11 15 14 1 26-13 4-19-14" fill="#ff873c"/><path d="M79 47l9-12q-2 9 5 11 3 10-8 11z" fill="#ffe687"/><path d="M73 78l12-23" stroke="${ink}" stroke-width="6"/>`,
 hat:`<ellipse cx="50" cy="78" rx="40" ry="11" fill="${ink}"/><path d="M26 24h48l-5 54H31z" fill="#445163"/><ellipse cx="50" cy="24" rx="24" ry="7" fill="#677789"/><path d="M30 61h40l-1 14H31z" fill="${red}"/><path d="M38 31l-1 25" stroke="#adbfcd" stroke-width="4"/><path d="M83 12v18M74 21h18" stroke="${gold}" stroke-width="3"/>`,
 drum:`<ellipse cx="50" cy="36" rx="33" ry="14" fill="${cream}"/><path d="M17 36v40q33 25 66 0V36q-33 25-66 0" fill="${red}"/><path d="M17 41l13 41 13-30 14 37 13-36 13 24" fill="none" stroke="${gold}" stroke-width="4"/><ellipse cx="50" cy="36" rx="33" ry="14" fill="none" stroke="${gold}" stroke-width="4"/><path d="M21 10l44 25M79 10L35 35" stroke="#dca96b" stroke-width="5" stroke-linecap="round"/>`,
 lion:`<path d="M50 7l11 9 15-1 3 15 13 9-8 14 1 15-15 4-8 14-14-7-15 3-6-15-14-7 6-14-2-15 15-5z" fill="#c57738"/><ellipse cx="49" cy="46" rx="25" ry="28" fill="#f1bf67"/>${eye(39,41)}${eye(59,41)}<ellipse cx="49" cy="55" rx="15" ry="11" fill="${cream}"/><path d="M43 51h12l-6 7z" fill="${ink}"/><path d="M34 87l15-6 15 6-15 8z" fill="${red}"/>`,
 balls:`<circle cx="50" cy="23" r="16" fill="${red}"/><circle cx="23" cy="62" r="16" fill="${blue}"/><circle cx="76" cy="66" r="16" fill="${gold}"/><path d="M40 18q8-9 18 0M12 57q8-9 18 0M66 61q8-9 18 0" fill="none" stroke="${cream}" stroke-width="4" stroke-linecap="round"/><path d="M22 36l-5 8M76 28l6 12M42 78h17" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>`};
const ranks={
 A:{tone:'#b93955',seal:'#9f3951',glint:'#f9e6bc',path:'M50 8l8 13 15-7 2 19H25l2-19 15 7z'},
 K:{tone:'#58719f',seal:'#4c507e',glint:'#e8eaf9',path:'M28 30l-6-19 17 11L50 6l11 16 17-11-6 19z'},
 Q:{tone:'#9364a5',seal:'#825098',glint:'#f4e4ff',path:'M26 30l1-21 16 10L50 6l7 13 16-10 1 21z'},
 J:{tone:'#40837e',seal:'#328b84',glint:'#e4fff1',path:'M24 28q10-24 26-5 16-19 26 5l-6-18-20 7-20-7z'}
};
function art(name){
 const id='ccg'+(++serial),rank=ranks[name],bonus=name==='penguin'||name==='elephant'||name==='monkey';
 const tint=rank?rank.tone:bonus?'#2d8588':'#a64059';
 const fill=rank?rank.seal:bonus?'#7cbfbd':'#ca685d';
 let body=bodies[name]||'';
 if(rank){body=`<g filter="url(#${id}-sh)"><path d="${rank.path}" fill="${gold}" stroke="#793a49" stroke-width="2"/><g transform="translate(0,8)"><path d="M25 26Q50 15 75 26L80 79Q50 94 20 79Z" fill="${rank.seal}" stroke="${rank.glint}" stroke-width="2"/><path d="M27 29Q50 19 73 29L77 77Q50 88 23 77Z" fill="none" stroke="${gold}" stroke-width="1"/><text x="50" y="71" text-anchor="middle" font-family="Georgia,serif" font-size="52" font-weight="bold" fill="#fff3d2" stroke="#8a3552" stroke-width="1.2">${name}</text></g><circle cx="50" cy="12" r="4" fill="#fff1c2"/></g>`;}
 return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs>
 <radialGradient id="${id}-bg" cx="37%" cy="24%" r="78%"><stop stop-color="#fff6dc"/><stop offset=".57" stop-color="${fill}"/><stop offset="1" stop-color="${tint}"/></radialGradient>
 <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff6d0"/><stop offset=".3" stop-color="#cf9851"/><stop offset=".55" stop-color="#ffe3a4"/><stop offset="1" stop-color="#925d42"/></linearGradient>
 <filter id="${id}-sh"><feDropShadow dx="0" dy="3" stdDeviation="1.4" flood-color="#2b142d" flood-opacity=".47"/></filter>
 </defs>
 <path d="M50 2L62 8 77 6 83 21 95 31 90 47 97 62 84 72 81 89 63 91 50 98 37 91 19 89 16 72 3 62 10 47 5 31 17 21 23 6 38 8z" fill="url(#${id}-rim)" stroke="#764153" stroke-width="1.4"/>
 <circle cx="50" cy="49" r="40.5" fill="url(#${id}-bg)" stroke="#6c3c49" stroke-width="2.3"/>
 <circle cx="50" cy="49" r="37.2" fill="none" stroke="#fff5d2" stroke-opacity=".85" stroke-width="1.2" stroke-dasharray="2 5"/>
 <path d="M19 46Q26 13 65 16Q38 13 20 40" fill="none" stroke="#ffffff" stroke-opacity=".38" stroke-width="6" stroke-linecap="round"/>
 <g transform="translate(9 7) scale(.82)" filter="url(#${id}-sh)">${body}</g>
 <path d="M17 78Q50 97 83 78L78 89Q50 105 22 89Z" fill="#72364a" stroke="#f2c77b" stroke-width="1.3"/>
 <path d="M29 89q21 7 42 0" fill="none" stroke="#ffe5b0" stroke-width="1.5"/>
 <circle cx="15" cy="51" r="2" fill="#fffbdc"/><circle cx="85" cy="51" r="2" fill="#fffbdc"/></svg>`;
}
const artPoster=(()=>{
 const folks=[['strong',43,208,.9],['elephant',430,205,.96],['penguin',239,204,1.13],['jester',124,249,.62],['fire',356,256,.62]];
 return `<svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Batty Circus grand show"><defs>
  <radialGradient id="circPostB"><stop stop-color="#d07168"/><stop offset=".62" stop-color="#7d2f53"/><stop offset="1" stop-color="#391b3c"/></radialGradient>
  <linearGradient id="circPostGold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff7c8"/><stop offset=".3" stop-color="#fbd687"/><stop offset=".56" stop-color="#b97838"/><stop offset=".86" stop-color="#f6cb81"/><stop offset="1" stop-color="#8f522c"/></linearGradient>
  <radialGradient id="circFloor"><stop stop-color="#bd7180"/><stop offset="1" stop-color="#401e43"/></radialGradient>
 </defs><rect width="600" height="360" fill="url(#circPostB)"/>
 <path d="M0 0h600v85L480 39Q300 10 120 39L0 85Z" fill="#922c46" stroke="#e2aa6b" stroke-width="5"/>
 <path d="M0 0q85 142 162 0M600 0q-85 142-162 0" fill="#bc4b5a" stroke="#efbb78" stroke-width="4"/>
 <path d="M38 0q-18 105-38 140V0ZM562 0q18 105 38 140V0Z" fill="#552843"/>
 <g fill="#ffe6a2">${Array.from({length:25},(_,i)=>`<circle cx="${i*25}" cy="16" r="3.3"/>`).join('')}</g>
 <path d="M0 250Q300 205 600 250V360H0Z" fill="url(#circFloor)"/>
 <path d="M0 328Q300 251 600 328" fill="none" stroke="#e4b076" stroke-width="3"/>
 <g opacity=".35" fill="#ffe0a5"><path d="M300 0 50 340 233 340z"/><path d="M300 0 548 340 371 340z"/></g>
 ${folks.map(([f,x,y,sc])=>`<g transform="translate(${x},${y}) scale(${sc})">${bodies[f]}</g>`).join('')}
 <rect x="119" y="50" width="362" height="175" rx="22" fill="#54263ee8" stroke="url(#circPostGold)" stroke-width="5"/>
 <rect x="126" y="57" width="348" height="161" rx="17" fill="none" stroke="#ffe8a2" stroke-width="1.4" stroke-dasharray="3 6"/>
 <text x="300" y="95" text-anchor="middle" font-family="Georgia,serif" font-size="25" letter-spacing="12" fill="#f8d695">BATTY</text>
 <text x="300" y="169" text-anchor="middle" font-family="Georgia,serif" font-size="77" font-weight="bold" fill="url(#circPostGold)" stroke="#fff7ca" stroke-width=".8">CIRCUS</text>
 <text x="300" y="195" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="bold" letter-spacing="5" fill="#fff1ce">FIVE ACTS • GRAND CANNON</text>
 <path d="M149 211q151 50 302 0" stroke="#eebf84" fill="none" stroke-width="2"/>
 <g fill="#ffdd9c">${Array.from({length:19},(_,i)=>`<circle cx="${75+i*25}" cy="344" r="3"/>`).join('')}</g>
 </svg>`;
})();
// Each act has dedicated illustrated stage scenery and bespoke touch-target props.
const accents={strong:['#e8a45f','#f3cf8a'],jester:['#77cfbc','#ffe09d'],bear:['#b99add','#f0cd9d'],fire:['#f28d55','#fff29e'],elephant:['#7dd9dc','#f8c4ed'],penguin:['#8fc9e3','#ffebba']};
function scene(name){const colors=accents[name]||accents.penguin,figure=bodies[name]||bodies.penguin;
 let furniture='';
 if(name==='strong')furniture=`<g transform="translate(325 126)"><rect x="-23" y="90" width="90" height="11" rx="5" fill="#ffe3a5"/><rect x="0" y="45" width="10" height="74" fill="#b15e5c"/><path d="M-30 55h130" stroke="#e8d4c5" stroke-width="9"/><rect x="-30" y="33" width="19" height="44" rx="4" fill="#47506b" stroke="#e9c08a" stroke-width="3"/><rect x="72" y="33" width="19" height="44" rx="4" fill="#47506b" stroke="#e9c08a" stroke-width="3"/></g>`;
 if(name==='jester')furniture=`<g transform="translate(331 158)"><rect x="0" y="40" width="95" height="76" rx="8" fill="#8e4c88" stroke="#f6c783" stroke-width="5"/><path d="M0 46h95M47 46v70" stroke="#eac68b" stroke-width="5"/><rect x="28" y="0" width="40" height="52" rx="7" fill="#b96671" stroke="#ffdf94" stroke-width="4"/><path d="M24 8L44-20L61 8" fill="#f4c375"/><circle cx="48" cy="28" r="10" fill="#fff2bd"/></g>`;
 if(name==='bear')furniture=`<g stroke="#f6dfb0" stroke-width="3"><path d="M0 182Q240 221 480 182" fill="none"/><path d="M345 40L345 195" stroke-dasharray="6 6"/><path d="M400 40L400 195" stroke-dasharray="6 6"/></g><g transform="translate(339 170)"><path d="M18 0h45l-7 35H25z" fill="#d8a05b" stroke="#ffdc91" stroke-width="4"/><circle cx="25" cy="12" r="8" fill="#fff6cc"/><circle cx="58" cy="12" r="8" fill="#fff6cc"/></g>`;
 if(name==='fire')furniture=`<g transform="translate(330 78)"><path d="M45 185Q-4 145 26 86q-9-42 23-73-4 31 25 45 29 55-29 127" fill="#ef733f" stroke="#f9c672" stroke-width="4"/><path d="M44 159Q24 122 55 87q-2 26 13 35-1 24-24 37" fill="#ffed8e"/><path d="M16 185l74 0" stroke="#fff0c3" stroke-width="5"/></g>`;
 if(name==='elephant')furniture=`<g transform="translate(333 39)"><path d="M40 0v62" stroke="#ffe2bd" stroke-width="3"/><ellipse cx="35" cy="0" rx="34" ry="40" fill="#a962a9" stroke="#f5dfba" stroke-width="4"/><path d="M102 8v54" stroke="#ffe2bd" stroke-width="3"/><ellipse cx="98" cy="5" rx="31" ry="41" fill="#7dc2cc" stroke="#f5dfba" stroke-width="4"/><path d="M27 102v27" stroke="#f5dfba" stroke-width="5"/><text x="42" y="148" font-family="Georgia" text-anchor="middle" font-size="51" fill="#fff0ad" font-weight="bold">×</text><text x="90" y="148" font-family="Georgia" text-anchor="middle" font-size="51" fill="#fff0ad" font-weight="bold">2</text></g>`;
 if(name==='penguin')furniture=`<g transform="translate(315 92)"><path d="M4 145L56 17 115 66 45 161" fill="#ac4755" stroke="#efc278" stroke-width="8"/><ellipse cx="83" cy="42" rx="34" ry="18" transform="rotate(32 83 42)" fill="#38273b" stroke="#f8d6a0" stroke-width="7"/><circle cx="37" cy="151" r="25" fill="#39304a" stroke="#f4c67d" stroke-width="9"/><circle cx="37" cy="151" r="6" fill="#f4c67d"/></g>`;
 return `<svg class="cc-scene" viewBox="0 0 480 300" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"><defs>
 <radialGradient id="csc-a-${name}"><stop stop-color="${colors[1]}" stop-opacity=".75"/><stop offset="1" stop-color="${colors[0]}" stop-opacity="0"/></radialGradient>
 <linearGradient id="csc-b-${name}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${colors[1]}"/><stop offset=".4" stop-color="${colors[0]}"/><stop offset="1" stop-color="#813e51"/></linearGradient></defs>
 <ellipse cx="235" cy="154" rx="213" ry="139" fill="url(#csc-a-${name})"/>
 <path d="M0 0L65 0Q90 80 18 251L0 249ZM480 0H415Q390 80 462 251L480 249Z" fill="#8a304b" stroke="#efc383" stroke-width="7"/>
 <path d="M5 1Q240 70 475 1" fill="none" stroke="#f6e1a3" stroke-width="6"/><path d="M65 20Q240 95 415 20" fill="none" stroke="#e0a564" stroke-width="2"/>
 <g fill="#ffeab6"><circle cx="70" cy="27" r="4"/><circle cx="165" cy="48" r="4"/><circle cx="240" cy="52" r="4"/><circle cx="322" cy="44" r="4"/><circle cx="408" cy="27" r="4"/></g>
 <ellipse cx="235" cy="245" rx="194" ry="37" fill="#4b263e" stroke="#f7d28e" stroke-width="8"/>
 <ellipse cx="235" cy="252" rx="146" ry="11" fill="${colors[0]}" opacity=".46"/>
 <g class="cc-scene-furniture cc-furn-${name}">${furniture}</g>
 <g class="cc-scene-hero cc-hero-${name}" transform="translate(83 67) scale(2.0)">${figure}</g>
 <path class="cc-scene-floor-line" d="M84 271q156 20 312 0" stroke="#ffdf97" stroke-width="3" fill="none"/>
 <g class="cc-scene-stars" fill="${colors[1]}"><path d="M42 71l7 14 16 3-12 11 3 17-14-9-15 9 4-17-12-11 16-3z"/><path d="M432 124l4 9 11 1-7 8 2 10-10-5-9 5 1-10-7-8 10-1z"/></g>
 </svg>`;
}
function choiceArt(name,i){const n=i+1;
 const inner={
  strong:`<g stroke="#ffe3a0" stroke-width="4"><path d="M15 45h70"/><rect x="12" y="21" width="${12+n*3}" height="50" rx="4" fill="#586379"/><rect x="${70-n*3}" y="21" width="${12+n*3}" height="50" rx="4" fill="#586379"/></g>`,
  fire:`<path d="M42 77l14-42" stroke="#663a50" stroke-width="10"/><path d="M53 40q-23-22-1-37-3 14 12 17 21 18-4 35-15 3-7-15" fill="#f28d3e" stroke="#fff0bb" stroke-width="3"/><path d="M56 45q-13-11 0-25 10 16 3 24" fill="#ffec9c"/>`,
  bear:`<path d="M14 44q36-34 72 0" fill="none" stroke="#ffe1a4" stroke-width="5"/><rect x="20" y="39" width="60" height="48" rx="7" fill="#a56852" stroke="#ebc487" stroke-width="5"/><path d="M27 61h46" stroke="#e9d29a" stroke-width="7"/><circle cx="50" cy="61" r="9" fill="#f9eeb4"/>`,
  jesterPick:`<rect x="16" y="39" width="68" height="47" rx="6" fill="#9c547d" stroke="#ffe2a9" stroke-width="5"/><rect x="13" y="29" width="74" height="18" rx="5" fill="#bd6973" stroke="#ffe2a9" stroke-width="4"/><path d="M50 27v57" stroke="#f8cc8f" stroke-width="8"/><path d="M50 31q-16-35-24-11 0 15 24 11 16-35 24-11 0 15-24 11" fill="#79c9b9" stroke="#ffe9b4" stroke-width="3"/>`
 }[name];
 return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="cchoice-${name}-${i}"><stop stop-color="#fff6db"/><stop offset="1" stop-color="#e0a66f"/></radialGradient></defs><circle cx="50" cy="50" r="44" fill="url(#cchoice-${name}-${i})" stroke="#894359" stroke-width="4"/><g>${inner||''}</g><circle cx="22" cy="20" r="3" fill="#fffbe4"/></svg>`;
}
window.BattyCircusArt={art,symbol:i=>art(['A','K','Q','J','hat','drum','lion','balls','monkey','penguin','elephant'][i]),poster:artPoster,scene,choiceArt};
})();
