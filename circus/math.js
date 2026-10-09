/* Batty Circus: original play-money mathematics, not Red Tiger's proprietary model.
   Pure state machine. Identical operations are implemented server-side in circus.php. */
(function(root){
'use strict';
const NAMES=['Ace','King','Queen','Jack','Top hat','Drum','Lion','Juggling balls','Monkey wild','Penguin bonus','Elephant upgrade'];
const PAY=[[12,36,96],[12,36,96],[12,36,96],[12,36,96],[24,72,240],[24,72,240],[36,120,420],[48,180,600],[60,240,900]];
const LINES=[];
for(let r=0;r<4;r++)LINES.push([r,r,r,r,r]);
for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b)LINES.push([a,b,a,b,a]);
for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b)LINES.push([a,a,b,a,a]);
for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b)LINES.push([a,b,b,b,a]);
const FEATURES=['strong','jester','bear','fire','elephant'];
const BUY_PRICES={grand:75,spotlight:175}; // virtual Batty Bucks only: price multiplier of the selected base stake
const WEIGHTS=[17,17,17,17,11,10,8,6,3];
const ri=(rng,n)=>Math.min(n-1,Math.floor(rng()*n));
function pick(rng,w){let v=rng()*w.reduce((a,b)=>a+b,0);for(let i=0;i<w.length;i++){v-=w[i];if(v<0)return i;}return w.length-1;}
function grid(rng,mode='base'){
 const g=Array.from({length:5},()=>Array.from({length:4},()=>pick(rng,WEIGHTS)));
 for(let c=0;c<5;c++)if(rng()<.015){let r=ri(rng,3);g[c][r]=g[c][r+1]=8;}
 if(mode==='base')for(const c of [0,2,4])if(rng()<.16)g[c][ri(rng,4)]=9;
 if(mode==='elephant')for(let c=0;c<5;c++)if(rng()<.08)g[c][ri(rng,4)]=10;
 return g;
}
function evaluate(g,stake,mult=1){
 const wins=[];let points=0;
 LINES.forEach((line,l)=>{let best=0,sym=-1,count=0;
  for(let s=0;s<=8;s++){let n=0;for(let c=0;c<5;c++){const v=g[c][line[c]];if(v===s||(v===8&&s!==8))n++;else break;}const p=n>=3?PAY[s][n-3]:0;if(p>best){best=p;sym=s;count=n;}}
  if(best){points+=best;wins.push({line:l,symbol:sym,count,pay:Math.floor(stake*best*mult/40)});}
 });return {win:Math.floor(stake*points*mult/40),wins};
}
function add(s,v){s.total=Math.min(s.stake*2500,s.total+v);if(s.total>=s.stake*2500){s.phase='done';s.capped=true;s.queue=[];}}
function start(stake,rng,buy=null){
 if(buy!==null&&!Object.hasOwn(BUY_PRICES,buy))throw new Error('Unknown bonus purchase.');
 const g=grid(rng),purchased=buy!==null;
 // A bonus purchase buys a feature trigger, not a regular base-game spin. There is no initial line payout.
 if(purchased)for(const c of [0,2,4])g[c][ri(rng,4)]=9;
 const e=purchased?{win:0,wins:[]}:evaluate(g,stake),trigger=purchased||[0,2,4].every(c=>g[c].includes(9));
 return {stake,grid:g,total:e.win,phase:trigger?'cannon':'done',rev:0,retried:false,bonus:trigger,buyMode:buy,queue:[],event:{type:purchased?'buy':'base',mode:buy,...e},capped:false};
}
function next(s,rng){if(s.phase==='done'&&s.capped)return;const f=s.queue.shift();if(!f){s.phase='done';return;}s.feature=f;s.stage=0;s.featureWin=0;s.phase=f==='jester'?'jesterPick':f;s.event={type:'intro',feature:f};if(f==='elephant'){s.left=6+ri(rng,7);s.mult=2;s.played=0;s.event.spins=s.left;}}
function cannon(s,rng){const i=s.buyMode==='spotlight'?(rng()<.72?6:7):s.buyMode==='grand'?1+pick(rng,[17,13,11,8,7,4,2]):pick(rng,[38,17,13,11,8,7,4,2]);if(i===0){let x=[3,5,8,10][ri(rng,4)];add(s,x*s.stake);s.phase='done';s.event={type:'cash',x,win:x*s.stake};return;}
 const order=FEATURES.slice();for(let j=4;j>0;j--){let k=ri(rng,j+1);[order[j],order[k]]=[order[k],order[j]];}
 s.offer=i<=5?[FEATURES[i-1]]:order.slice(0,i===6?2:3);s.phase='offer';s.event={type:'offer',features:s.offer};}
function step(original,action,choice,rng){const s=JSON.parse(JSON.stringify(original));if(s.phase==='done')return s;
 const p=s.phase;
 if(p==='cannon'&&action==='fire')cannon(s,rng);
 else if(p==='offer'&&action==='retry'&&!s.retried){s.retried=true;cannon(s,rng);}
 else if(p==='offer'&&action==='collect'){s.queue=s.offer.slice();next(s,rng);}
 else if(p==='featureEnd'&&action==='continue')next(s,rng);
 else if(['strong','fire','bear','jesterPick'].includes(p)&&action==='pick'&&Number.isInteger(choice)&&choice>=0&&choice<3){
  if(p==='jesterPick'){s.left=[6,8,10,12][ri(rng,4)];s.phase='jester';s.played=0;s.event={type:'jesterPick',spins:s.left,choice};}
  else if(p==='strong'){s.stage++;let success=rng()<Math.max(.18,.88-s.stage*.085-choice*.055);let x=success?(s.stage*(choice+1)+1):0;add(s,x*s.stake);s.featureWin+=x*s.stake;s.event={type:'strong',success,x,choice,stage:s.stage};if(!s.capped&&(!success||s.stage===8))s.phase='featureEnd';}
  else if(p==='fire'){s.stage++;let x=[2,3,5,8,15,25][pick(rng,[32,27,20,12,7,2])];let end=rng()<.42||s.stage===8;add(s,x*s.stake);s.featureWin+=x*s.stake;s.event={type:'fire',x,choice,end};if(!s.capped&&end)s.phase='featureEnd';}
  else {s.stage++;let lane=ri(rng,3),x=lane===choice?[2,3,5,10][ri(rng,4)]:0;let end=s.stage>=3&&(rng()<.20||s.stage===18);add(s,x*s.stake);s.featureWin+=x*s.stake;s.event={type:'bear',lane,choice,x,end,stage:s.stage};if(!s.capped&&end)s.phase='featureEnd';}
 }
 else if((p==='jester'||p==='elephant')&&action==='spin'){
  s.left--;s.played++;s.grid=grid(rng,p);let upgrades=0,added=[],retrigger=0;
  if(p==='jester'&&rng()<.7){let c=ri(rng,5),r=ri(rng,4);for(let dc=-1;dc<=1;dc++)for(let dr=-1;dr<=1;dr++)if(c+dc>=0&&c+dc<5&&r+dr>=0&&r+dr<4){s.grid[c+dc][r+dr]=8;added.push([c+dc,r+dr]);}}
  if(p==='jester'&&rng()<.3)for(let i=0;i<3;i++){let c=ri(rng,5),r=ri(rng,4);s.grid[c][r]=8;added.push([c,r]);}
  if(p==='elephant'){upgrades=s.grid.flat().filter(x=>x===10).length;s.mult+=upgrades;if(rng()<.035&&s.played+s.left<95){retrigger=5;s.left+=5;}}
  const e=evaluate(s.grid,s.stake,p==='elephant'?s.mult:1);add(s,e.win);s.featureWin+=e.win;
  s.event={type:p,...e,upgrades,added,retrigger,left:s.left,mult:p==='elephant'?s.mult:1};if(!s.capped&&(s.left===0||s.played>=100))s.phase='featureEnd';
 }else throw new Error('Action unavailable for this stage.');
 s.rev++;return s;
}
const api={NAMES,PAY,LINES,FEATURES,BUY_PRICES,start,step,evaluate,grid};if(typeof module!=='undefined')module.exports=api;root.BattyCircusMath=api;
})(typeof window!=='undefined'?window:globalThis);
