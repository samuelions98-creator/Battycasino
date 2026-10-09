<?php
/* Batty Circus. Original play-money engine; documented inspiration is not a claim of identical RTP. */
if (!defined('BATTY')) { http_response_code(403); exit; }
function cc_lines(): array { static $l=null; if($l!==null)return $l; $l=[];for($r=0;$r<4;$r++)$l[]=[$r,$r,$r,$r,$r];for($a=0;$a<4;$a++)for($b=0;$b<4;$b++)if($a!==$b)$l[]=[$a,$b,$a,$b,$a];for($a=0;$a<4;$a++)for($b=0;$b<4;$b++)if($a!==$b)$l[]=[$a,$a,$b,$a,$a];for($a=0;$a<4;$a++)for($b=0;$b<4;$b++)if($a!==$b)$l[]=[$a,$b,$b,$b,$a];return $l; }
function cc_ri(Closure $rng,int $n): int{return min($n-1,(int)floor($rng()*$n));}
function cc_pick(Closure $rng,array $w): int {$v=$rng()*array_sum($w);foreach($w as $i=>$x){$v-=$x;if($v<0)return $i;}return count($w)-1;}
function cc_grid(Closure $rng,string $mode='base'): array {$g=[];for($c=0;$c<5;$c++){ $g[$c]=[];for($r=0;$r<4;$r++)$g[$c][]=cc_pick($rng,[17,17,17,17,11,10,8,6,3]);}for($c=0;$c<5;$c++)if($rng()<.015){$r=cc_ri($rng,3);$g[$c][$r]=$g[$c][$r+1]=8;}if($mode==='base')foreach([0,2,4] as $c)if($rng()<.16)$g[$c][cc_ri($rng,4)]=9;if($mode==='elephant')for($c=0;$c<5;$c++)if($rng()<.08)$g[$c][cc_ri($rng,4)]=10;return $g;}
function cc_evaluate(array $g,int $stake,int $mult=1): array {$pay=[[12,36,96],[12,36,96],[12,36,96],[12,36,96],[24,72,240],[24,72,240],[36,120,420],[48,180,600],[60,240,900]];$wins=[];$points=0;foreach(cc_lines() as $l=>$line){$best=0;$sym=-1;$count=0;for($s=0;$s<=8;$s++){$n=0;for($c=0;$c<5;$c++){$v=$g[$c][$line[$c]];if($v===$s||($v===8&&$s!==8))$n++;else break;}$p=$n>=3?$pay[$s][$n-3]:0;if($p>$best){$best=$p;$sym=$s;$count=$n;}}if($best){$points+=$best;$wins[]=['line'=>$l,'symbol'=>$sym,'count'=>$count,'pay'=>(int)floor($stake*$best*$mult/40)];}}return ['win'=>(int)floor($stake*$points*$mult/40),'wins'=>$wins];}
function cc_add(array &$s,int $v): void {$s['total']=min($s['stake']*2500,$s['total']+$v);if($s['total']>=$s['stake']*2500){$s['phase']='done';$s['capped']=true;$s['queue']=[];}}
function cc_start(int $stake,Closure $rng,?string $buy=null): array {
 if($buy!==null&&!in_array($buy,['grand','spotlight'],true))throw new ApiError('Unknown bonus purchase.');
 $g=cc_grid($rng);$purchased=$buy!==null;
 if($purchased)foreach([0,2,4] as $c)$g[$c][cc_ri($rng,4)]=9;
 $e=$purchased?['win'=>0,'wins'=>[]]:cc_evaluate($g,$stake);
 $t=$purchased;
 if(!$t){$t=true;foreach([0,2,4] as $c)if(!in_array(9,$g[$c],true))$t=false;}
 return ['stake'=>$stake,'grid'=>$g,'total'=>$e['win'],'phase'=>$t?'cannon':'done','rev'=>0,'retried'=>false,'bonus'=>$t,'buyMode'=>$buy,'queue'=>[],'event'=>['type'=>$purchased?'buy':'base','mode'=>$buy]+$e,'capped'=>false];
}
function cc_next(array &$s,Closure $rng): void {if($s['phase']==='done'&&$s['capped'])return;$f=array_shift($s['queue']);if(!$f){$s['phase']='done';return;}$s['feature']=$f;$s['stage']=0;$s['featureWin']=0;$s['phase']=$f==='jester'?'jesterPick':$f;$s['event']=['type'=>'intro','feature'=>$f];if($f==='elephant'){$s['left']=6+cc_ri($rng,7);$s['mult']=2;$s['played']=0;$s['event']['spins']=$s['left'];}}
function cc_cannon(array &$s,Closure $rng): void {$features=['strong','jester','bear','fire','elephant'];$mode=$s['buyMode']??null;$i=$mode==='spotlight'?($rng()<.72?6:7):($mode==='grand'?1+cc_pick($rng,[17,13,11,8,7,4,2]):cc_pick($rng,[38,17,13,11,8,7,4,2]));if($i===0){$x=[3,5,8,10][cc_ri($rng,4)];cc_add($s,$x*$s['stake']);$s['phase']='done';$s['event']=['type'=>'cash','x'=>$x,'win'=>$x*$s['stake']];return;}$order=$features;for($j=4;$j>0;$j--){$k=cc_ri($rng,$j+1);[$order[$j],$order[$k]]=[$order[$k],$order[$j]];}$s['offer']=$i<=5?[$features[$i-1]]:array_slice($order,0,$i===6?2:3);$s['phase']='offer';$s['event']=['type'=>'offer','features'=>$s['offer']];}
function cc_step(array $s,string $action,?int $choice,Closure $rng): array {if($s['phase']==='done')return $s;$p=$s['phase'];if($p==='cannon'&&$action==='fire')cc_cannon($s,$rng);elseif($p==='offer'&&$action==='retry'&&!$s['retried']){$s['retried']=true;cc_cannon($s,$rng);}elseif($p==='offer'&&$action==='collect'){$s['queue']=$s['offer'];cc_next($s,$rng);}elseif($p==='featureEnd'&&$action==='continue')cc_next($s,$rng);
elseif(in_array($p,['strong','fire','bear','jesterPick'],true)&&$action==='pick'&&$choice!==null&&$choice>=0&&$choice<3){
 if($p==='jesterPick'){$s['left']=[6,8,10,12][cc_ri($rng,4)];$s['phase']='jester';$s['played']=0;$s['event']=['type'=>'jesterPick','spins'=>$s['left'],'choice'=>$choice];}
 elseif($p==='strong'){$s['stage']++;$ok=$rng()<max(.18,.88-$s['stage']*.085-$choice*.055);$x=$ok?($s['stage']*($choice+1)+1):0;cc_add($s,$x*$s['stake']);$s['featureWin']+=$x*$s['stake'];$s['event']=['type'=>'strong','success'=>$ok,'x'=>$x,'choice'=>$choice,'stage'=>$s['stage']];if(!$s['capped']&&(!$ok||$s['stage']===8))$s['phase']='featureEnd';}
 elseif($p==='fire'){$s['stage']++;$x=[2,3,5,8,15,25][cc_pick($rng,[32,27,20,12,7,2])];$end=$rng()<.42||$s['stage']===8;cc_add($s,$x*$s['stake']);$s['featureWin']+=$x*$s['stake'];$s['event']=['type'=>'fire','x'=>$x,'choice'=>$choice,'end'=>$end];if(!$s['capped']&&$end)$s['phase']='featureEnd';}
 else{$s['stage']++;$lane=cc_ri($rng,3);$x=$lane===$choice?[2,3,5,10][cc_ri($rng,4)]:0;$end=$s['stage']>=3&&($rng()<.20||$s['stage']===18);cc_add($s,$x*$s['stake']);$s['featureWin']+=$x*$s['stake'];$s['event']=['type'=>'bear','lane'=>$lane,'choice'=>$choice,'x'=>$x,'end'=>$end,'stage'=>$s['stage']];if(!$s['capped']&&$end)$s['phase']='featureEnd';}}
elseif(($p==='jester'||$p==='elephant')&&$action==='spin'){$s['left']--;$s['played']++;$s['grid']=cc_grid($rng,$p);$upgrades=0;$added=[];$retrigger=0;
 if($p==='jester'&&$rng()<.7){$c=cc_ri($rng,5);$r=cc_ri($rng,4);for($dc=-1;$dc<=1;$dc++)for($dr=-1;$dr<=1;$dr++)if($c+$dc>=0&&$c+$dc<5&&$r+$dr>=0&&$r+$dr<4){$s['grid'][$c+$dc][$r+$dr]=8;$added[]=[$c+$dc,$r+$dr];}}
 if($p==='jester'&&$rng()<.3)for($i=0;$i<3;$i++){$c=cc_ri($rng,5);$r=cc_ri($rng,4);$s['grid'][$c][$r]=8;$added[]=[$c,$r];}
 if($p==='elephant'){foreach($s['grid'] as $col)foreach($col as $x)if($x===10)$upgrades++;$s['mult']+=$upgrades;if($rng()<.035&&$s['played']+$s['left']<95){$retrigger=5;$s['left']+=5;}}
 $e=cc_evaluate($s['grid'],$s['stake'],$p==='elephant'?$s['mult']:1);cc_add($s,$e['win']);$s['featureWin']+=$e['win'];$s['event']=['type'=>$p]+$e+['upgrades'=>$upgrades,'added'=>$added,'retrigger'=>$retrigger,'left'=>$s['left'],'mult'=>$p==='elephant'?$s['mult']:1];if(!$s['capped']&&($s['left']===0||$s['played']>=100))$s['phase']='featureEnd';}
else throw new ApiError('Action unavailable for this stage.',409);$s['rev']++;return $s;}

/* User row is already locked by play(). Revision matching prevents double picks.
   Keep the completed snapshot so lost HTTP replies can be recovered without a second debit. */
function cc_public(array $r): array {return ['o'=>$r['data'],'round'=>(int)$r['id'],'pending'=>$r['data']['phase']!=='done'];}
function cc_store(array &$u,array $r,array $s): array {if($s['phase']==='done'&&$r['state']==='open')round_close($u,$r,$s['total'],['bonus'=>$s['bonus']?1:0]);round_save_data((int)$r['id'],$s);$r['data']=$s;return cc_public($r);}
function play_circus(array &$u,string $op,array $in): array {
 if($op==='state'){$r=q1("SELECT * FROM rounds WHERE user_id=? AND game='circus' ORDER BY id DESC LIMIT 1 FOR UPDATE",[$u['id']]);if(!$r)return ['o'=>null];$r['data']=json_decode($r['data'],true);return cc_public($r);}
 if($op==='start'){
  $token=$in['token']??'';if(!is_string($token)||!preg_match('/^[a-f0-9]{32}$/D',$token))throw new ApiError('Invalid round reference.');
  $old=q1("SELECT * FROM rounds WHERE user_id=? AND game='circus' AND data LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE",[$u['id'],'%"token":"'.$token.'"%']);if($old){$old['data']=json_decode($old['data'],true);return cc_public($old);}
  $open=round_get_open($u,'circus');if($open)return cc_public($open);
  $stake=stake_of($in,STAKE_LADDER);
  $buy=$in['buy']??null;
  if($buy!==null&&(!is_string($buy)||!in_array($buy,['grand','spotlight'],true)))throw new ApiError('Invalid bonus purchase.');
  // Server-authoritative cost. Never trust a price provided by a browser client.
  $cost=$stake*($buy===null?1:($buy==='grand'?75:175));
  if($u['balance']<$cost)throw new ApiError('Not enough Batty Bucks.',402);
  $s=cc_start($stake,batty_rng(),$buy);$s['token']=$token;$rid=round_open($u,'circus',$cost,$s);
  return cc_store($u,['id'=>$rid,'game'=>'circus','stake'=>$stake,'state'=>'open','data'=>$s],$s);
 }
 if($op!=='act')throw new ApiError('Unknown action.');
 $rid=in_int($in,'round',1,PHP_INT_MAX);$r=q1("SELECT * FROM rounds WHERE id=? AND user_id=? AND game='circus' FOR UPDATE",[$rid,$u['id']]);if(!$r)throw new ApiError('Round not found.',404);$r['data']=json_decode($r['data'],true);
 $rev=in_int($in,'rev',0,10000);if($rev!==$r['data']['rev']||$r['state']==='done')return cc_public($r);
 $a=$in['action']??'';if(!is_string($a))throw new ApiError('Invalid action.');$pick=array_key_exists('choice',$in)?in_int($in,'choice',0,2):null;
 return cc_store($u,$r,cc_step($r['data'],$a,$pick,batty_rng()));
}
