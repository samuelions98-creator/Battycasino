<?php
/* Sugar Fang Bonanza — PHP port of src/games/bonanza.math.js. Same rng call order, same results (proved by tools/bonanza-xcheck.js).
   Amounts are in units (1 unit = stake / 20). The whole round (every tumble and the whole free-spins bonus) is decided and
   settled in one request; nothing is held back, so there is no hidden state and no open round. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const BZ_REELS = 6, BZ_ROWS = 5, BZ_CELLS = 30, BZ_PAYERS = 9, BZ_LOLLY = 9, BZ_BOMB = 10;

function bz_D(): array { static $d = null; if ($d === null) $d = batty_data('bonanza'); return $d; }
function bz_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function bz_draw(Closure $rng, array $w, int &$mult): int {
    $s = bz_pickIndex($rng, $w);
    if ($s === BZ_BOMB) { $D = bz_D(); $mult = $D['BOMB_VALUES'][bz_pickIndex($rng, $D['BOMB_WEIGHTS'])]; }
    else $mult = 0;
    return $s;
}
function bz_tierOf(int $n): int { return $n >= 12 ? 2 : ($n >= 10 ? 1 : ($n >= 8 ? 0 : -1)); }
function bz_evaluate(array $g): array {
    $PAY = bz_D()['PAY'];
    $cnt = array_fill(0, BZ_PAYERS, 0);
    for ($c = 0; $c < BZ_CELLS; $c++) if ($g[$c] < BZ_PAYERS) $cnt[$g[$c]]++;
    $wins = []; $pay = 0;
    for ($s = 0; $s < BZ_PAYERS; $s++) { $t = bz_tierOf($cnt[$s]); if ($t >= 0) { $wins[] = ['s' => $s, 'n' => $cnt[$s], 'pay' => $PAY[$s][$t]]; $pay += $PAY[$s][$t]; } }
    return ['wins' => $wins, 'pay' => $pay];
}
function bz_applyTumble(array $g, array $m, array $rm, array $add, array $addM): array {
    $gone = array_fill(0, BZ_CELLS, false);
    foreach ($rm as $c) $gone[$c] = true;
    $ng = []; $nm = [];
    for ($r = 0; $r < BZ_REELS; $r++) {
        $col = $add[$r]; $colM = $addM[$r];
        for ($w = 0; $w < BZ_ROWS; $w++) { $c = $r * BZ_ROWS + $w; if (!$gone[$c]) { $col[] = $g[$c]; $colM[] = $m[$c]; } }
        for ($w = 0; $w < BZ_ROWS; $w++) { $ng[$r * BZ_ROWS + $w] = $col[$w]; $nm[$r * BZ_ROWS + $w] = $colM[$w]; }
    }
    ksort($ng); ksort($nm);
    return [array_values($ng), array_values($nm)];
}
function bz_runSequence(Closure $rng, array $g, array $m, array $w, bool $fs): array {
    $out = ['g' => $g, 'm' => $m, 'steps' => [], 'tw' => 0, 'sc' => 0, 'sp' => 0, 'bombs' => 0, 'mult' => 1, 'win' => 0];
    for (;;) {
        $ev = bz_evaluate($g);
        if (!$ev['pay']) break;
        $hit = array_fill(0, BZ_PAYERS, false);
        foreach ($ev['wins'] as $x) $hit[$x['s']] = true;
        $rm = [];
        for ($c = 0; $c < BZ_CELLS; $c++) if ($g[$c] < BZ_PAYERS && $hit[$g[$c]]) $rm[] = $c;
        $add = []; $addM = [];
        for ($r = 0; $r < BZ_REELS; $r++) {
            $n = 0; foreach ($rm as $c) if (intdiv($c, BZ_ROWS) === $r) $n++;
            $a = []; $am = [];
            for ($i = 0; $i < $n; $i++) { $mv = 0; $a[] = bz_draw($rng, $w, $mv); $am[] = $mv; }
            $add[] = $a; $addM[] = $am;
        }
        $out['steps'][] = ['wins' => $ev['wins'], 'pay' => $ev['pay'], 'rm' => $rm, 'add' => $add, 'addM' => $addM];
        $out['tw'] += $ev['pay'];
        [$g, $m] = bz_applyTumble($g, $m, $rm, $add, $addM);
    }
    for ($c = 0; $c < BZ_CELLS; $c++) { if ($g[$c] === BZ_LOLLY) $out['sc']++; elseif ($g[$c] === BZ_BOMB) $out['bombs'] += $m[$c]; }
    $out['sp'] = bz_D()['SCATTER_PAY'][min(6, $out['sc'])];
    if ($fs && $out['tw'] > 0 && $out['bombs'] > 0) $out['mult'] = $out['bombs'];
    $out['win'] = $out['tw'] * $out['mult'] + $out['sp'];
    return $out;
}
function bz_freshGrid(Closure $rng, array $w): array {
    $g = []; $m = [];
    for ($c = 0; $c < BZ_CELLS; $c++) { $mv = 0; $g[] = bz_draw($rng, $w, $mv); $m[] = $mv; }
    return [$g, $m];
}
function bz_freeSpins(Closure $rng, int $carried): array {
    $D = bz_D(); $W = $D['W']['fs'];
    $fs = ['spins' => [], 'awarded' => $D['FS_AWARD'], 'retriggers' => 0, 'total' => 0, 'capped' => false];
    $left = $D['FS_AWARD'];
    while ($left > 0) {
        $left--;
        [$g, $m] = bz_freshGrid($rng, $W);
        $seq = bz_runSequence($rng, $g, $m, $W, true);
        if ($seq['sc'] >= $D['FS_RETRIGGER_AT']) { $left += $D['FS_RETRIGGER']; $fs['awarded'] += $D['FS_RETRIGGER']; $fs['retriggers']++; $seq['retrigger'] = $D['FS_RETRIGGER']; }
        $fs['total'] += $seq['win'];
        $seq['running'] = $fs['total'];
        if ($carried + $fs['total'] >= $D['CAP']) { $fs['capped'] = true; $fs['total'] = $D['CAP'] - $carried; $seq['running'] = $fs['total']; $fs['spins'][] = $seq; break; }
        $fs['spins'][] = $seq;
    }
    return $fs;
}
function bz_finish(Closure $rng, string $mode, array $seq): array {
    $D = bz_D(); $U = $D['UNITS_PER_STAKE']; $CAP = $D['CAP'];
    $cost = $mode === 'buy' ? $D['BUY_X'] * $U : ($mode === 'ante' ? intdiv($U * $D['ANTE_NUM'], $D['ANTE_DEN']) : $U);
    $o = ['mode' => $mode, 'cost' => $cost, 'spin' => $seq, 'fs' => null, 'totalWin' => 0, 'capped' => false];
    $total = min($CAP, $seq['win']);
    if ($seq['win'] >= $CAP) $o['capped'] = true;
    if ($seq['sc'] >= $D['FS_TRIGGER'] && !$o['capped']) {
        $o['fs'] = bz_freeSpins($rng, $total);
        $total += $o['fs']['total'];
        if ($o['fs']['capped']) $o['capped'] = true;
    }
    $o['totalWin'] = min($CAP, $total);
    return $o;
}
function bz_spin(Closure $rng, bool $ante): array {
    $W = bz_D()['W'][$ante ? 'ante' : 'base'];
    [$g, $m] = bz_freshGrid($rng, $W);
    return bz_finish($rng, $ante ? 'ante' : 'base', bz_runSequence($rng, $g, $m, $W, false));
}
function bz_triggerSpin(Closure $rng, int $n, string $mode): array {
    $W = bz_D()['W']['base']; $w = $W; $w[BZ_LOLLY] = 0;
    [$g, $m] = bz_freshGrid($rng, $w);
    $idx = range(0, BZ_CELLS - 1);
    for ($i = 0; $i < $n; $i++) { $j = $i + rfloor($rng, BZ_CELLS - $i); $t = $idx[$i]; $idx[$i] = $idx[$j]; $idx[$j] = $t; $g[$idx[$i]] = BZ_LOLLY; $m[$idx[$i]] = 0; }
    return bz_finish($rng, $mode, bz_runSequence($rng, $g, $m, $W, false));
}
function bz_buy(Closure $rng): array { return bz_triggerSpin($rng, bz_pickIndex($rng, bz_D()['BUY_SCATTERS']), 'buy'); }

/* ================= the API =================
   {game:'bonanza', op:'spin', stake, ante?: bool, buy?: bool}  — one request = one whole round, settled at once. */
function play_bonanza(array &$u, string $op, array $in): array {
    if ($op !== 'spin') throw new ApiError('Unknown action.');
    $D = bz_D();
    $stake = stake_of($in, STAKE_LADDER);
    $flag = function (string $k) use ($in): bool {
        if (!array_key_exists($k, $in) || $in[$k] === null || $in[$k] === false || $in[$k] === 0) return false;
        if ($in[$k] === true || $in[$k] === 1) return true;
        throw new ApiError("Bad value for $k.");
    };
    $ante = $flag('ante'); $buy = $flag('buy');
    if ($ante && $buy) throw new ApiError('The bonus buy is not available with the ante bet on.');
    $unit = intdiv($stake, $D['UNITS_PER_STAKE']);
    $cost = $buy ? $D['BUY_X'] * $stake : ($ante ? intdiv($stake * $D['ANTE_NUM'], $D['ANTE_DEN']) : $stake);
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    $rng = batty_rng();
    /* Live balancing: the whole round (spin, every tumble, the whole bonus) is one draw; rtp_pick may redraw it once
       (server/lib/rtp.php). The player only ever sees a genuine, complete draw from the maths above. */
    $o = rtp_pick('bonanza', $cost, function () use ($rng, $buy, $ante, $unit) {
        $o = $buy ? bz_buy($rng) : bz_spin($rng, $ante);
        return [$o, $o['totalWin'] * $unit];
    });
    $win = $o['totalWin'] * $unit;
    $f = ['bonus' => $o['fs'] ? 1 : 0];
    if ($o['fs']) {
        $best = 0; foreach ($o['fs']['spins'] as $s) if ($s['mult'] > $best) $best = $s['mult'];
        if ($o['capped']) $f['feedLabel'] = 'MAX WIN';
        elseif ($best >= 250) $f['feedLabel'] = $best . '× Bat-Bomb';
        if ($best >= 100) $f['bomb100'] = true;
    }
    $rid = round_quick($u, 'bonanza', $cost, $win, $f);
    return ['o' => $o, 'win' => $win, 'cost' => $cost, 'round' => $rid];
}
