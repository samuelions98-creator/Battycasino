(function(){
'use strict';
const B=Batty,M=BattyCircusMath,A=BattyCircusArt,h=B.h,ID='circus';
const labels={strong:'Strongman',jester:'Jester Spins',bear:'Bear Tightrope',fire:'Fire Breather',elephant:'Elephant Spins'};
const hints={strong:'Lift for bigger prizes',jester:'Wilds spring to life',bear:'Catch falling treasure',fire:'Pick a flaming prize',elephant:'Build your multiplier'};
const actionFor={cannon:'fire',offer:'collect',featureEnd:'continue',jesterPick:'pick',strong:'pick',fire:'pick',bear:'pick',jester:'spin',elephant:'spin'};
const prices=BattyCircusMath.BUY_PRICES;
const key='batty-circus-practice-v1';let instance;
function rules(){return `<div class="cc-rules"><p><b>Batty Circus</b> is an original Batty Bucks game inspired by the published Wild Circus feature rules. It is not Red Tiger’s game and has different artwork, paytable, line patterns and probabilities. No cash value. No external or Must Drop jackpot.</p><h3>40 fixed lines · 5 reels · 4 rows</h3><p>Three or more matching symbols from the left pay. Monkey wilds substitute for paying symbols. Only the highest combination on each line pays. All 40 lines are included in the stake.</p><h3>Bonus Buys · Batty Bucks only</h3><p><b>Grand Cannon:</b> costs 75× the selected stake and guarantees a cannon with at least one bonus act. <b>Spotlight Show:</b> costs 175× and guarantees an offer of two or three distinct acts. The price is charged once when you confirm. Neither purchase includes a normal base spin payout. Wins are random, may be less than the purchase cost, and neither option guarantees a profit. Purchases use virtual Batty Bucks with no cash value.</p><h3>Penguin cannon</h3><p>One penguin on each of reels 1, 3 and 5 opens the cannon. Fire to reveal an instant prize or one, two or three acts. An instant prize ends the bonus. Accept awarded acts or retry once; retry replaces the whole offer and can result in a smaller prize.</p><h3>The five acts</h3><p><b>Strongman:</b> pick a weight. A successful lift pays and advances to heavier weights. Failure ends the act; previous wins remain. Up to eight lifts. Larger weights pay more and are harder to lift.<br><b>Jester:</b> choose a box for 6, 8, 10 or 12 free spins. Springing boxes spread wilds around a random cell; extra wilds may also be thrown onto the reels. Wilds reset each spin.<br><b>Bear:</b> choose a lane before each treasure drop. Catch matching-lane treasure until the rope snaps, up to 18 drops. Catch prizes are 2, 3, 5 or 10 times the stake.<br><b>Fire Breather:</b> choose one of three torches. Every blast pays 2–25 times the stake. Continue until the torch burns out, up to eight blasts.<br><b>Elephant:</b> 6–12 free spins start at ×2. Each upgrade symbol increases the multiplier by one, including the current spin. Retriggers award five spins and retain the multiplier, with a 100-spin safety limit.</p><p>Multiple acts play in sequence. Total round winnings are capped at 2,500 times the original stake. Pick outcomes are revealed only after your choice. Online rounds resume when you reopen this game, and winnings are credited once on completion. Practice progress is saved on this device.</p><h3>Paytable</h3><p>Multiples of the <b>total stake</b> for each winning line. The aggregate line payout is rounded down to whole Batty Bucks.</p><table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>${M.PAY.map((p,i)=>`<tr><td>${M.NAMES[i]}</td>${p.map(x=>`<td>${x/40}×</td>`).join('')}</tr>`).join('')}</table><details><summary>View all 40 paylines</summary><div class="cc-lines">${M.LINES.map((l,i)=>`<svg viewBox="0 0 100 80" aria-label="Line ${i+1}"><rect width="100" height="80" fill="#342237"/><polyline points="${l.map((r,c)=>`${10+c*20},${10+r*17}`).join(' ')}" fill="none" stroke="#ffcf7a" stroke-width="3"/><text x="4" y="78" fill="white" font-size="10">${i+1}</text></svg>`).join('')}</div></details><p>This original math model uses fixed probabilities, not the site’s adaptive RTP rerolls. No certified RTP or equivalence to Wild Circus is claimed. Space spins; sound follows the casino sound setting. Free spins can be played individually or automatically.</p></div>`;}
function mount(root){
 let state=null,round=null,busy=false,alive=true,blocked=false,autoFree=true,turbo=false,timer=null,token=null,showPurchase=false,shownTotal=0,fxTimers=[];
 const onlineKey='batty-circus-request-'+(B.me?.name||'guest');
 const wrap=h('div',{class:'cc-wrap'}),status=h('div',{class:'cc-message',role:'status','aria-live':'polite'},'Three penguins open the cannon.'),win=h('output',null,'0');
 const reels=h('div',{class:'cc-reels','aria-label':'Five reels, four rows'}),cols=[],cells=[];
 for(let c=0;c<5;c++){const col=h('div',{class:'cc-reel'});cols.push(col);cells[c]=[];for(let r=0;r<4;r++){const cell=h('div',{class:'cc-cell'});cells[c].push(cell);col.append(cell);}reels.append(col);}
 const feature=h('section',{class:'cc-feature',hidden:true,'aria-label':'Bonus act'}),badge=h('div',{class:'cc-badge',hidden:true});
 const machine=h('div',{class:'cc-marquee'},
   h('div',{class:'cc-ambience','aria-hidden':'true'},h('span',{class:'cc-amb-left'}),h('span',{class:'cc-amb-right'})),
   h('div',{class:'cc-masthead'},h('span',{class:'cc-mast-star'},'✦'),h('div',null,h('small',null,'THE BIG TOP'),h('strong',null,'CIRCUS ROYALE')),h('span',{class:'cc-mast-star'},'✦')),
   h('div',{class:'cc-stage-frame'},h('div',{class:'cc-stage-light left'}),h('div',{class:'cc-stage-light right'}),
     h('div',{class:'cc-sky-stars','aria-hidden':'true'}),
     h('div',{class:'cc-reel-shell'},reels,h('svg',{class:'cc-payline-layer','aria-hidden':'true',viewBox:'0 0 500 400',preserveAspectRatio:'none'}))),
   h('div',{class:'cc-curtain-left','aria-hidden':'true'}),h('div',{class:'cc-curtain-right','aria-hidden':'true'}),
   h('div',{class:'cc-footlights'},...Array.from({length:17},()=>h('i'))),
   h('div',{class:'cc-ring-apron','aria-hidden':'true'},h('span',null,'THE GREATEST SHOW ON THE REELS')),
   badge,feature,h('div',{class:'cc-sparks','aria-hidden':'true'}));
 const bet=h('select',{'aria-label':'Stake in Batty Bucks'});for(const x of [20,40,100,200,400,1000,2000,5000,10000])bet.append(h('option',{value:x},B.fmt(x)+' BB'));bet.value='200';
 const spin=button('SPIN',()=>perform('start'),'gold cc-spin');spin.id='circus-spin';
 const buy=button('BUY BONUS',()=>{if(busy||blocked||(state&&state.phase!=='done'))return;openPurchase();},'cc-buy');buy.id='circus-buy';
 const auto=button('Free spins: auto',()=>{autoFree=!autoFree;auto.textContent='Free spins: '+(autoFree?'auto':'manual');auto.setAttribute('aria-pressed',String(autoFree));schedule();});auto.setAttribute('aria-pressed','true');
 const speed=button('Turbo: off',()=>{turbo=!turbo;speed.textContent='Turbo: '+(turbo?'on':'off');speed.setAttribute('aria-pressed',String(turbo));});speed.setAttribute('aria-pressed','false');
 const acts=h('aside',{class:'cc-cast'});for(const [i,f] of M.FEATURES.entries())acts.append(h('div',{class:'cc-act','data-act':f},h('div',{class:'cc-act-ring'},h('span',{html:A.art(f)})),h('div',null,h('em',null,'ACT 0'+(i+1)),h('b',null,labels[f]),h('small',null,hints[f]))));
 const side=h('aside',{class:'cc-side'},h('div',{class:'cc-note'},h('small',null,"TONIGHT\'S FEATURE"),h('b',null,'THE'),h('b',{class:'cc-note-big'},'GRAND'),h('b',null,'SHOW'),h('div',{class:'cc-note-stars'},'✦ ✦ ✦'),h('span',null,'One cannon. Five remarkable acts. Your ringside seat awaits.')));
 const payInfo=h('div',{class:'cc-payinfo'},h('span',{class:'cc-paylabel'},'LAST WIN'),h('b',null,'—'));
 const banner=h('div',{class:'cc-celebration',hidden:true,'aria-live':'polite'});
 const resultToast=h('div',{class:'cc-result-toast',hidden:true,'aria-hidden':'true'});
 const modeRibbon=h('div',{class:'cc-mode-ribbon','aria-live':'polite'},h('i',{class:'cc-live-dot'}),h('span',null,'MAIN SHOW'),h('em',null,'40 FIXED LINES'));
 let toastTimer=null,lastBannerKey='',lastShownWin=0,shownAnim=null;
 function toast(title,description,variant='gold'){
   if(!alive)return;clearTimeout(toastTimer);resultToast.replaceChildren(h('small',null,title),h('b',null,description));
   resultToast.className='cc-result-toast cc-toast-'+variant;resultToast.hidden=false;
   toastTimer=setTimeout(()=>{resultToast.hidden=true;},turbo?950:2200);
 }
 function pathsForWins(e){const layer=machine.querySelector('.cc-payline-layer');if(!layer)return;layer.textContent='';
   if(!e?.wins?.length)return;
   const tops=[...e.wins].sort((a,b)=>b.pay-a.pay).slice(0,4);
   tops.forEach((w,i)=>{const points=M.LINES[w.line].slice(0,w.count).map((r,c)=>[(c+.5)*100,(r+.5)*100]);
     if(points.length<3)return;
     const path=document.createElementNS('http://www.w3.org/2000/svg','polyline');
     path.setAttribute('points',points.map(pt=>pt.join(',')).join(' '));path.setAttribute('class','cc-payline-glow');
     path.style.setProperty('--line-delay',(i*.2)+'s');layer.append(path);
     for(const [x,y] of [points[0],points.at(-1)]){const coin=document.createElementNS('http://www.w3.org/2000/svg','circle');coin.setAttribute('cx',x);coin.setAttribute('cy',y);coin.setAttribute('r',4);coin.setAttribute('class','cc-payline-dot');coin.style.setProperty('--line-delay',(i*.2)+'s');layer.append(coin);}
   });
 }
 function countTo(value){if(shownAnim)cancelAnimationFrame(shownAnim);const dest=Number(value)||0;
   if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(dest-lastShownWin)<5){win.textContent=B.fmt(dest);lastShownWin=dest;return;}
   const from=dest<lastShownWin?0:lastShownWin,started=performance.now(),dur=Math.min(1000,450+Math.log10(Math.max(1,dest))*90);
   function frame(t){if(!alive)return;const k=Math.min(1,(t-started)/dur),v=Math.floor(from+(dest-from)*(1-Math.pow(1-k,3)));win.textContent=B.fmt(v);if(k<1)shownAnim=requestAnimationFrame(frame);else{win.textContent=B.fmt(dest);shownAnim=null;}}
   shownAnim=requestAnimationFrame(frame);lastShownWin=dest;
 }
 const purchase=h('div',{class:'cc-purchase',hidden:true,'role':'dialog','aria-modal':'true','aria-labelledby':'cc-buy-title'});
 const purchasePanel=h('div',{class:'cc-purchase-panel'});
 purchase.append(h('div',{class:'cc-buy-scrim',onclick:closePurchase}),purchasePanel);
 function buyCost(mode){return Number(bet.value)*prices[mode];}
 function closePurchase(){showPurchase=false;purchase.hidden=true;buy.focus();}
 function openPurchase(){showPurchase=true;purchase.hidden=false;const cost1=buyCost('grand'),cost2=buyCost('spotlight');purchasePanel.replaceChildren(
  h('div',{class:'cc-purchase-head'},h('span',null,'✦ THE RINGMASTER PRESENTS ✦'),button('✕',closePurchase,'cc-close')),
  h('h2',{id:'cc-buy-title'},'CHOOSE YOUR SHOW'),h('p',{class:'cc-buy-lede'},'Skip the wait. Every ticket guarantees bonus acts. Virtual Batty Bucks only.'),
  h('div',{class:'cc-ticket-list'},
   ticket('grand','GRAND CANNON','75×','Guaranteed cannon and at least one feature',cost1,'🎪'),
   ticket('spotlight','SPOTLIGHT SHOW','175×','Guaranteed two or three different acts',cost2,'✦')),
  h('p',{class:'cc-disclaimer'},'Bonuses have random outcomes and can return less than their price. No cash value. Purchase is deducted once when selected.'),
  h('div',{class:'cc-buy-balance'},'AVAILABLE ',h('b',null,B.fmt(B.wallet.balance)+' BB')));
 const first=purchasePanel.querySelector('button.cc-ticket-cta:not(:disabled)')||purchasePanel.querySelector('button.cc-close');if(first)first.focus();}
 function ticket(mode,name,mult,subtitle,cost,emblem){const afford=B.wallet.canBet(cost);const b=button('BUY FOR '+B.fmt(cost)+' BB',()=>{if(!B.wallet.canBet(cost)){B.ui.broke();return;}closePurchase();perform('start',undefined,mode);},'cc-ticket-cta');b.disabled=!afford;b.dataset.mode=mode;
  return h('div',{class:'cc-ticket '+mode},h('span',{class:'cc-ticket-emblem'},emblem),h('div',{class:'cc-ticket-main'},h('strong',null,name),h('small',null,subtitle),h('span',{class:'cc-ticket-mult'},mult+' STAKE')),b);}
 wrap.append(h('div',{class:'cc-topline'},h('span',null,'✦ BATTY ORIGINALS ✦'),h('span',null,'VIRTUAL BATTY BUCKS · NO CASH VALUE')),
 h('header',{class:'cc-head'},h('small',null,'LADIES & GENTLEMEN, WELCOME TO THE'),h('h1',null,h('span',{class:'cc-title-top'},'BATTY'),h('span',{class:'cc-title-main'},'CIRCUS')),h('p',null,'THE GREATEST LITTLE SHOW ON EARTH'),h('div',{class:'cc-header-stars'},'✦ 40 WINNING LINES ✦ 5 SPECTACULAR ACTS ✦')),
 h('div',{class:'cc-layout'},acts,h('div',{class:'cc-center'},machine,h('div',{class:'cc-winbar'},h('div',{class:'cc-totalbox'},h('small',null,'TOTAL SHOW WIN'),h('div',{class:'cc-winnumber'},win,h('span',null,'BB'))),payInfo,status)),side),
 h('div',{class:'cc-controls'},h('label',{class:'cc-bet'},'STAKE',bet),spin,buy,speed,auto),modeRibbon,resultToast,banner,purchase,h('div',{class:'cc-bottom'},'Original play-money game · ',h('button',{class:'cc-button',onclick:()=>B.ui.modal('Batty Circus · Rules & pays',rules())},'Rules & pays')));
 root.append(wrap);paintGrid(M.grid(B.rng));
 const motion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(motion)machine.classList.add('cc-intro-skipped');
 else fxTimers.push(setTimeout(()=>machine.classList.add('cc-intro-skipped'),2100));
 function button(text,fn,cls=''){return h('button',{type:'button',class:'cc-button '+cls,onclick:fn},text);}
 function paintGrid(g,event){for(let c=0;c<5;c++)for(let r=0;r<4;r++){let s=g[c][r],el=cells[c][r];el.innerHTML=A.symbol(s)+(s>=8?`<small>${['WILD','BONUS','UPGRADE'][s-8]}</small>`:'');el.setAttribute('aria-label',M.NAMES[s]);el.className='cc-cell cc-symbol-'+s+(s>=8?' special':'');}
  if(event?.wins)for(const w of event.wins)for(let c=0;c<w.count;c++)cells[c][M.LINES[w.line][c]].classList.add('hit');
 }
 function savePractice(){try{localStorage.setItem(key,JSON.stringify({state,paid:state.phase==='done'}));}catch(e){status.textContent='Browser storage unavailable. Keep the game open to finish your bonus.';}}
 function controls(){const free=state&&['jester','elephant'].includes(state.phase);spin.disabled=busy||blocked||(state&&state.phase!=='done'&&!free);spin.textContent=free?'FREE SPIN':'SPIN';buy.disabled=busy||blocked||!!(state&&state.phase!=='done');bet.disabled=busy||blocked||!!(state&&state.phase!=='done');feature.querySelectorAll('button').forEach(b=>b.disabled=busy||(blocked&&!b.dataset.recover));}
 function schedule(){clearTimeout(timer);if(alive&&!busy&&!blocked&&autoFree&&state&&['jester','elephant'].includes(state.phase))timer=setTimeout(()=>perform('spin'),turbo?450:1300);}
 function message(s){let e=s.event;switch(e.type){case 'buy':return s.buyMode==='spotlight'?'VIP spotlight ticket confirmed. Fire the cannon!':'Cannon ticket confirmed. Fire to reveal your act!';case 'base':return s.bonus?'Three penguins! The cannon is ready.':e.win?'Winning lines · '+B.fmt(e.win)+' BB':'The next performance awaits.';case 'offer':return 'Your cannon found '+s.offer.map(f=>labels[f]).join(' + ');case 'cash':return 'Cannon prize · '+e.x+'× stake';case 'jesterPick':return e.spins+' Jester Spins awarded';case 'jester':return `${e.left} spins left · ${B.fmt(e.win)} BB${e.added.length?' · Wilds unleashed!':''}`;case 'elephant':return `${e.left} spins left · ×${e.mult}${e.upgrades?' · Multiplier upgraded!':''}${e.retrigger?' · +5 spins!':''}`;case 'strong':return e.success?'Lift successful · +'+e.x+'× stake':'Too heavy! Your previous prizes are safe.';case 'fire':return '+'+e.x+'× stake'+(e.end?' · The torch burns out.':' · Another blast awaits.');case 'bear':return (e.x?'Caught! +'+e.x+'× stake':'The treasure fell in another lane.')+(e.end?' The rope snapped.':'');default:return labels[s.feature]||'Step right up!';}}

 function sceneFx(s,e){
  const phase=s.phase, current=s.feature||phase;
  const smoke='<span class="cc-smoke s1"></span><span class="cc-smoke s2"></span><span class="cc-smoke s3"></span>';
  if(phase==='cannon')return `<div class="cc-scene-fx cc-fx-cannon"><span class="cc-cannon-fuse"></span><span class="cc-cannon-flash"></span><span class="cc-penguin-shot"></span>${smoke}<span class="cc-audience-wave"></span><span class="cc-cannon-burst-ring"></span></div>`;
  if(phase==='offer')return `<div class="cc-scene-fx cc-fx-offer">${(s.offer||[]).map((f,i)=>`<span class="cc-act-chip chip-${f}" style="--i:${i}"><b>${labels[f]}</b></span>`).join('')}</div>`;
  if(current==='strong')return `<div class="cc-scene-fx cc-fx-strong ${e?.success===false?'fail':e?.success?'success':''}"><span class="cc-strong-bar"></span><span class="cc-strong-plate left"></span><span class="cc-strong-plate right"></span><span class="cc-strong-crowd">POWER!</span></div>`;
  if(phase==='jesterPick' || current==='jester')return `<div class="cc-scene-fx cc-fx-jester ${e?.added?.length?'wildstorm':''}"><span class="cc-jester-box lid1"></span><span class="cc-jester-box lid2"></span><span class="cc-jester-box lid3"></span><span class="cc-jester-ribbon r1"></span><span class="cc-jester-ribbon r2"></span><span class="cc-jester-ribbon r3"></span><span class="cc-jester-burst"></span></div>`;
  if(current==='bear')return `<div class="cc-scene-fx cc-fx-bear ${e?.end?'snap':''}"><span class="cc-rope-line"></span><span class="cc-rope-prize lane-${e?.lane??1}"></span><span class="cc-rope-marker ${Number.isInteger(e?.choice)?'pick-'+e.choice:''}"></span><span class="cc-rope-snap"></span></div>`;
  if(current==='fire')return `<div class="cc-scene-fx cc-fx-fire ${e?.end?'burnout':''}"><span class="cc-fire-jet jet1"></span><span class="cc-fire-jet jet2"></span><span class="cc-fire-jet jet3"></span><span class="cc-fire-ember e1"></span><span class="cc-fire-ember e2"></span><span class="cc-fire-ember e3"></span><span class="cc-fire-ember e4"></span></div>`;
  if(current==='elephant')return `<div class="cc-scene-fx cc-fx-elephant ${e?.upgrades?'upgrade':''} ${e?.retrigger?'retrigger':''}"><span class="cc-ele-beam"></span><span class="cc-ele-beam two"></span><span class="cc-ele-ring"></span><span class="cc-ele-mult">×${s.mult||2}</span><span class="cc-ele-stomp stomp1"></span><span class="cc-ele-stomp stomp2"></span></div>`;
  return '';
 }
 function render(){if(!alive||!state)return;const s=state,e=s.event;paintGrid(s.grid,e);countTo(s.total);status.textContent=message(s);bet.value=String(s.stake);pathsForWins(e);
 const wins=e?.wins||[];payInfo.lastChild.textContent=wins.length?wins.length+' PAYLINE'+(wins.length===1?'':'S'):(e?.x?'+'+e.x+'×':'—');
 machine.classList.toggle('cc-bonus-active',s.phase!=='done');machine.classList.toggle('cc-purchased',!!s.buyMode);
 const ribbons={cannon:['BONUS FEATURE','CANNON READY'],offer:['ACTS UNLOCKED','MAKE YOUR CHOICE'],strong:['STRONGMAN','POWER LIFT'],jesterPick:['JESTER','MYSTERY SPINS'],jester:['JESTER SPINS','WILDS UNLEASHED'],bear:['BEAR','TIGHTROPE'],fire:['FIRE BREATHER','DANGER ZONE'],elephant:['ELEPHANT SPINS','MULTIPLIER SHOW'],featureEnd:['ENCORE','ACT COMPLETE']};
 const label=ribbons[s.phase]||['MAIN SHOW','40 FIXED LINES'];modeRibbon.querySelector('span').textContent=label[0];modeRibbon.querySelector('em').textContent=label[1];
 modeRibbon.classList.toggle('active',s.phase!=='done');
 if(s.phase==='done'&&s.total>0&&e?.type!=='base'&&e?.type!=='buy'&&lastBannerKey!==String(s.rev)+':'+String(s.total)){
   lastBannerKey=String(s.rev)+':'+String(s.total);celebrate(s.total,s.stake);
 }
 acts.querySelectorAll('[data-act]').forEach(x=>x.classList.toggle('active',s.phase!=='done'&&x.dataset.act===s.feature));
 const free=['jester','elephant'].includes(s.phase);machine.classList.toggle('cc-free',free);badge.hidden=!free;badge.textContent=free?`${s.left} SPINS${s.phase==='elephant'?' · ×'+s.mult:''}`:'';
 feature.hidden=['done','jester','elephant'].includes(s.phase);feature.textContent='';
 if(!feature.hidden){let title='',desc='',cast=[],choices=[],value='';
 if(s.phase==='cannon'){title=s.buyMode?'The VIP Penguin Cannon':'The Penguin Cannon';desc=s.buyMode==='spotlight'?'Your Spotlight ticket guarantees a spectacular 2–3-act show!':s.buyMode==='grand'?'Your ticket guarantees at least one spectacular act.':'Fire into the big top. Land an instant prize or up to three bonus acts.';cast=['penguin'];choices=[['FIRE CANNON','fire',undefined,'gold']];}
 else if(s.phase==='offer'){title=s.offer.length>1?'A spectacular combination!':labels[s.offer[0]];desc=s.offer.map(x=>labels[x]).join(' + ')+'. Collect your acts, or risk replacing this whole offer with one more shot.';cast=s.offer;choices=[['COLLECT','collect',undefined,'gold']];if(!s.retried)choices.push(['RETRY ONCE','retry']);else desc='Final cannon result. Collect to begin your acts.';}
 else if(s.phase==='featureEnd'){title=labels[s.feature]+' complete';desc=s.queue.length?'Next up: '+labels[s.queue[0]]:'The final curtain. Collect your round winnings.';cast=[s.feature];value=B.fmt(s.featureWin)+' BB';choices=[['CONTINUE','continue',undefined,'gold']];}
 else if(s.phase==='jesterPick'){title='Jester Spins';desc='Choose a box. A mischievous surprise is waiting inside.';cast=['jester'];choices=[['BOX I','pick',0,'cc-pick'],['BOX II','pick',1,'cc-pick'],['BOX III','pick',2,'cc-pick']];}
 else {title=labels[s.phase];cast=[s.phase];value=s.featureWin?B.fmt(s.featureWin)+' BB':'';if(s.phase==='strong'){desc='Pick a weight. Heavier pays more, but is harder to lift.';const k=s.stage+1;choices=[['LIGHT · '+(k+1)+'×','pick',0,'cc-pick'],['MEDIUM · '+(k*2+1)+'×','pick',1,'cc-pick'],['HEAVY · '+(k*3+1)+'×','pick',2,'cc-pick']];}
 if(s.phase==='fire'){desc='Choose a torch. Every blast reveals another prize.';choices=[['TORCH I','pick',0,'cc-pick'],['TORCH II','pick',1,'cc-pick'],['TORCH III','pick',2,'cc-pick']];}
 if(s.phase==='bear'){desc='Move the bear before the next treasure falls. Catch it before the rope snaps.';choices=[['LEFT','pick',0,'cc-pick'],['CENTRE','pick',1,'cc-pick'],['RIGHT','pick',2,'cc-pick']];}}
 const drawing=h('div',{class:'cc-feature-art '+(s.phase==='cannon'?'cannon':s.feature==='bear'?'bear':'')+' cc-phase-'+s.phase+' cc-event-'+e.type});
 // Fully illustrated stage art and character scenes are direct children for consistent layout.
 drawing.innerHTML=(cast.length===1?A.scene(cast[0]):cast.map(f=>A.art(f)).join(''))+sceneFx(s,e);if(s.phase==='cannon'){drawing.insertAdjacentHTML('beforeend','<div class="cc-cannon">'+A.art('cannon')+'</div><div class="cc-ladder"><b>THREE ACTS</b><b>TWO ACTS</b><b>BONUS ACT</b><b>INSTANT WIN</b></div>');}if(e.type==='bear'){drawing.classList.toggle('broken',e.end);const scene=drawing.querySelector('svg');if(scene)scene.style.transform=`translateX(${(e.choice-1)*65}px)`;}
 const chooser=h('div',{class:'cc-choices'});for(const [txt,a,c,cls] of choices){const control=button(txt,()=>perform(a,c),cls||'');
   if(a==='pick'&&Number.isInteger(c)){control.classList.add('cc-choice-illustrated');control.replaceChildren(h('span',{class:'cc-choice-illustration',html:A.choiceArt(s.phase,c)}),h('b',null,txt));}
   chooser.append(control);}
 feature.append(h('div',null,h('h2',null,title),h('p',null,desc)),drawing,h('div',{class:'cc-feature-value'},value),chooser);
 }
 if(s.phase==='done'&&s.bonus)status.textContent=(s.capped?'Maximum win! ':'Show complete · ')+B.fmt(s.total)+' BB';controls();schedule();
 }
 function celebrate(total,stake){if(!alive)return;const ratio=total/Math.max(1,stake),tier=ratio>=100?'MEGA SHOW':ratio>=30?'SPECTACULAR WIN':ratio>=10?'BIG WIN':'SHOW WIN';
  banner.replaceChildren(h('span',{class:'cc-winbanner-kicker'},'✦ THE CROWD GOES WILD ✦'),h('strong',null,tier),h('b',null,B.fmt(total)+' BB'));
  banner.hidden=false;banner.classList.remove('cc-banner-in');void banner.offsetWidth;banner.classList.add('cc-banner-in');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)burst(40);
  fxTimers.push(setTimeout(()=>{if(alive)banner.hidden=true;},ratio>=30?4300:3100));
 }
 function burst(n=22){const layer=machine.querySelector('.cc-sparks');if(!layer||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(let i=0;i<n;i++){let el=document.createElement('i');let x=Math.random()*100,dx=(Math.random()-.5)*400,dy=(Math.random()-.5)*350;
   el.className='cc-particle';el.style.cssText=`--x:${x}%;--dx:${dx}px;--dy:${dy}px;--delay:${Math.random()*.35}s;--rot:${Math.random()*900}deg;`;layer.append(el);fxTimers.push(setTimeout(()=>el.remove(),2600));}}
 function teaserGrid(col){return Array.from({length:8},(_,i)=>`<div>${A.symbol((i+col*3)%11)}</div>`).join('');}
 const wait=ms=>new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?0:ms));
 async function animate(action,old,next){if(!alive)return;if(action==='start'||action==='spin'){feature.hidden=true;banner.hidden=true;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const strips=cols.map((col,c)=>{col.classList.add('rolling');const strip=h('div',{class:'cc-spin-strip',html:teaserGrid(c)});col.append(strip);return strip;});
 B.sfx('spin');await wait(reduce?0:turbo?210:650);
 for(let c=0;c<5&&alive;c++){for(let r=0;r<4;r++)cells[c][r].innerHTML=A.symbol(next.grid[c][r]);strips[c]?.remove();cols[c].classList.remove('rolling');B.sfx('tick');await wait(reduce?0:turbo?35:120);}
 if(next.event?.wins?.length){burst(Math.min(36,10+next.event.wins.length*2));B.sfx('win');
 toast('WINNING PAYLINES',next.event.wins.length+' LINES · '+B.fmt(next.event.win)+' BB');}
 else if(next.event?.type==='base'&&!next.bonus)toast('THE SHOW GOES ON','NEXT SPIN FOR YOUR ENCORE','soft');
 if(next.phase==='cannon'){burst(55);B.sfx('bonus');B.audio.seq([392,494,587,740,988],{step:.075,v:.10,type:'triangle'});toast('BONUS TRIGGERED',next.buyMode?'VIP TICKET · CANNON READY':'THREE PENGUINS · CANNON READY','bonus');}
 }
 else if(action==='fire'||action==='retry'){const a=feature.querySelector('.cc-feature-art');if(a)a.className='cc-feature-art cannon launch';B.audio.noise({d:.4,v:.18,lp:700});B.audio.tone({f:300,f2:1600,d:.8,v:.12,type:'triangle'});burst(38);toast('FIRE THE CANNON','THE WHOLE TENT IS WATCHING','bonus');await wait(turbo?540:1250);}
 else if(action==='pick'&&old){const a=feature.querySelector('.cc-feature-art');if(a){if(old.phase==='strong')a.classList.add('lift');if(old.phase==='fire')a.classList.add('flame');if(old.phase==='bear'){a.querySelector('svg').style.transform=`translateX(${(next.event.choice-1)*65}px)`;const treasure=h('i',{class:'cc-treasure',style:'left:'+([22,50,78][next.event.lane])+'%'},'◆');a.append(treasure);}}
 status.textContent=message(next);B.sfx(next.event.x?'win':'tick');if(next.event.x){burst(25);toast('SPECTACULAR ACT','+'+next.event.x+'× STAKE','bonus');}await wait(turbo?180:760);}
 if(alive&&next.event?.type==='intro'){B.audio.seq([330,440,554,659],{step:.1,v:.08,type:'triangle'});toast('NOW PRESENTING',labels[next.feature]||'THE GRAND SHOW','bonus');}
 if(alive&&next.event?.type==='offer')B.audio.seq([392,523,659,784,1047],{step:.08,v:.10,type:'triangle'});
 if(alive&&(next.total>(old?.total||0)))B.audio.seq([523,659,784,1047],{step:.08,v:.10,type:'triangle'});}
 function newToken(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
 async function perform(action,choice,buyMode=null){if(busy||blocked||!alive)return;clearTimeout(timer);if(action==='start'&&state&&['jester','elephant'].includes(state.phase))action='spin';busy=true;controls();const old=state;try{
 if(B.online){let data;if(action==='start'){const cost=+bet.value*(buyMode?prices[buyMode]:1);if(!B.wallet.canBet(cost)){B.ui.broke();return;}token=token||newToken();sessionStorage.setItem(onlineKey,JSON.stringify({token,stake:+bet.value,buy:buyMode}));data={game:ID,op:'start',stake:+bet.value,token,...(buyMode?{buy:buyMode}:{})};}else data={game:ID,op:'act',round,rev:state.rev,action,...(choice===undefined?{}:{choice})};
 const result=await B.api('play',data,{defer:true});state=result.o;round=result.round;token=null;sessionStorage.removeItem(onlineKey);
 }else{if(action==='start'){const cost=+bet.value*(buyMode?prices[buyMode]:1);if(!B.wallet.bet(ID,cost)){B.ui.broke();return;}state=M.start(+bet.value,B.rng,buyMode);}else state=M.step(state,action,choice,B.rng);if(state.phase==='done')B.wallet.win(ID,state.total,{silent:true});savePractice();}
 await animate(action,old,state);B.wallet.sync();if(alive)render();
 }catch(e){if(alive){status.textContent=e.message||'Connection interrupted. Recover your round before continuing.';if(B.online){if(e.status===400||e.status===402){token=null;sessionStorage.removeItem(onlineKey);B.wallet.sync();}else{blocked=true;recovery();}}}}
 finally{busy=false;if(alive){controls();schedule();}}}
 function recovery(){feature.hidden=false;feature.textContent='';feature.append(h('h2',null,'Reconnect to the show'),h('p',null,'Your server-held round is safe. Recover its latest result before playing again.'),Object.assign(button('RECOVER ROUND',recover,'gold'),{id:'circus-recover'}));feature.lastChild.dataset.recover='1';}
 async function recover(){busy=true;blocked=true;controls();try{const result=await B.api('play',{game:ID,op:'state'},{defer:true});state=result.o;round=result.round;const stored=sessionStorage.getItem(onlineKey);const request=stored?JSON.parse(stored):null;const pending=request?.token;token=pending;if(pending&&(!state||state.token!==pending)){const reply=await B.api('play',{game:ID,op:'start',token:pending,stake:request.stake,...(request.buy?{buy:request.buy}:{})},{defer:true});state=reply.o;round=reply.round;}token=null;sessionStorage.removeItem(onlineKey);blocked=false;B.wallet.sync();if(alive){feature.hidden=true;if(state)render();else status.textContent='Three penguins open the cannon.';}}
 catch(e){if(alive){status.textContent=e.message;recovery();}}finally{busy=false;if(alive){controls();schedule();}}}
 function onKey(e){if(showPurchase&&e.code==='Tab'){
  const tabbable=[...purchasePanel.querySelectorAll('button:not(:disabled)')];if(tabbable.length){const pos=tabbable.indexOf(document.activeElement);if(e.shiftKey&&pos===0){e.preventDefault();tabbable.at(-1).focus();}else if(!e.shiftKey&&pos===tabbable.length-1){e.preventDefault();tabbable[0].focus();}}return;}
 if(e.code==='Escape'&&showPurchase){closePurchase();return;}if(showPurchase)return;if(e.code==='Space'&&!e.target.closest('input,select,textarea,button')&&!document.querySelector('.bc-veil')){e.preventDefault();if(!spin.disabled)perform(state&&state.phase!=='done'?'spin':'start');}}
 document.addEventListener('keydown',onKey);
 instance={dispose(){alive=false;clearTimeout(timer);fxTimers.forEach(clearTimeout);clearTimeout(toastTimer);if(shownAnim)cancelAnimationFrame(shownAnim);document.removeEventListener('keydown',onKey);}};
 if(B.online)recover();else {try{const p=JSON.parse(localStorage.getItem(key));if(p?.state&&p.state.phase!=='done'){state=p.state;render();}}catch(e){localStorage.removeItem(key);}controls();}
}
B.registerGame({id:ID,name:'Batty Circus',tag:'SHOWCASE · BONUS BUY',tagline:'Five spectacular acts. One unforgettable big top.',poster:A.poster,rules,mount,unmount(){if(instance)instance.dispose();instance=null;}});
})();
