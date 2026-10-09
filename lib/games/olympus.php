<?php
/* Raging Cocks of Olympus 2 — PHP port of src/games/olympus.math.js. Same rng call order, same results.
   Amounts are in units (1 unit = stake / 20). */
if (!defined('BATTY')) { http_response_code(403); exit; }

const OL_REELS = 5, OL_ROWS = 3, OL_CELLS = 15, OL_LINES = 20;
const OL_WILD = 10, OL_COIN = 11, OL_GOD = 12;
const OL_ZEUS = 0, OL_PECK = 1, OL_HEN = 2, OL_POLLO = 3, OL_ARES = 4;

function ol_D(): array { static $d = null; if ($d === null) $d = batty_data('olympus'); return $d; }
function ol_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function ol_coin(Closure $rng): int { $C = ol_D()['CFG']; return $C['coinValues'][ol_pickIndex($rng, $C['coinWeights'])]; }
function ol_shuffled(Closure $rng, array $a): array {
    $a = array_values($a);
    for ($i = count($a) - 1; $i > 0; $i--) { $j = rfloor($rng, $i + 1); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; }
    return $a;
}
function ol_linePay(array $s, ?array &$out = null): int {
    $PAY = ol_D()['PAY'];
    $wl = 0; while ($wl < 5 && $s[$wl] === OL_WILD) $wl++;
    $best = $PAY[OL_WILD][$wl]; $bs = OL_WILD; $bn = $wl;
    if ($wl < 5) {
        $x = $s[$wl];
        if ($x < OL_WILD) {
            $n = $wl + 1; while ($n < 5 && ($s[$n] === $x || $s[$n] === OL_WILD)) $n++;
            $p = $PAY[$x][$n];
            if ($p > $best || ($p === $best && $p > 0)) { $best = $p; $bs = $x; $bn = $n; }
        }
    }
    $out = [$bs, $bn];
    return $best;
}
function ol_evalLines(array $grid): array {
    $PL = ol_D()['PAYLINES']; $wins = []; $total = 0;
    for ($l = 0; $l < OL_LINES; $l++) {
        $pl = $PL[$l]; $out = null;
        $p = ol_linePay([$grid[0][$pl[0]], $grid[1][$pl[1]], $grid[2][$pl[2]], $grid[3][$pl[3]], $grid[4][$pl[4]]], $out);
        if ($p > 0) { $wins[] = ['line' => $l, 'symbol' => $out[0], 'count' => $out[1], 'pay' => $p]; $total += $p; }
    }
    return ['wins' => $wins, 'total' => $total];
}

function ol_makeBonus(Closure $rng, array $gods, array $start, ?int $cap = null): array {
    $D = ol_D(); $CFG = $D['CFG']; $JP = $D['JACKPOTS'];
    if ($cap === null) $cap = $D['CAP'];
    $active = [false, false, false, false, false];
    foreach ($gods as $g) $active[$g] = true;
    $kind = array_fill(0, OL_CELLS, null); $val = array_fill(0, OL_CELLS, 0); $isJp = array_fill(0, OL_CELLS, false);
    $filled = 0; $powerCell = -1; $startOut = [];
    foreach ($start as $st) {
        $c = $st['cell'];
        if ($kind[$c]) continue;
        if ($st['kind'] === 'god') {
            if ($st['god'] === OL_ARES) { $kind[$c] = 'power'; $val[$c] = $CFG['powerStart']; $powerCell = $c; }
            else { $kind[$c] = 'coin'; $val[$c] = ol_coin($rng); }
            $startOut[] = ['cell' => $c, 'kind' => $kind[$c], 'value' => $val[$c], 'god' => $st['god']];
        } else { $kind[$c] = 'coin'; $val[$c] = $st['value']; $startOut[] = ['cell' => $c, 'kind' => 'coin', 'value' => $st['value']]; }
        $filled++;
    }
    $sum = function () use (&$val) { return array_sum($val); };
    $owed = [];
    if ($active[OL_ZEUS]) $owed[] = OL_ZEUS; if ($active[OL_PECK]) $owed[] = OL_PECK; if ($active[OL_HEN]) $owed[] = OL_HEN; if ($active[OL_POLLO]) $owed[] = OL_POLLO;
    $landW = [$CFG['wCoin'], $active[OL_ZEUS] ? $CFG['wBolt'] : 0, $active[OL_PECK] ? $CFG['wTrident'] : 0, $active[OL_HEN] ? $CFG['wGem'] : 0, $active[OL_POLLO] ? $CFG['wSun'] : 0];
    $SK = ['bolt', 'trident', 'gem', 'sun']; $SG = [OL_ZEUS, OL_PECK, OL_HEN, OL_POLLO];
    $steps = []; $jackpots = [0, 0, 0, 0];
    $left = 3; $capped = $sum() >= $cap; $strikes = [0, 0, 0, 0, 0];

    while ($left > 0 && $filled < OL_CELLS && !$capped) {
        $step = ['left' => $left, 'lands' => [], 'events' => [], 'leftAfter' => 0, 'total' => 0];
        $p = $CFG['landP'][$filled];
        $empties = [];
        for ($c = 0; $c < OL_CELLS; $c++) if (!$kind[$c]) $empties[] = $c;
        $lands = [];
        foreach ($empties as $e) {
            if ($rng() < $p) { $w = ol_pickIndex($rng, $landW); $lands[] = ['cell' => $e, 'spec' => $w - 1, 'forced' => false]; }
        }
        if ($left === 1 && count($owed)) {
            $need = $owed[rfloor($rng, count($owed))];
            $has = false;
            foreach ($lands as $L) if ($L['spec'] >= 0 && $SG[$L['spec']] === $need) $has = true;
            if (!$has) {
                $specIdx = array_search($need, $SG, true);
                $free = [];
                foreach ($empties as $e) { $taken = false; foreach ($lands as $L) if ($L['cell'] === $e) { $taken = true; break; } if (!$taken) $free[] = $e; }
                if (count($free)) $lands[] = ['cell' => $free[rfloor($rng, count($free))], 'spec' => $specIdx, 'forced' => true];
                else {
                    $pi = -1;
                    foreach ($lands as $i => $L) if ($L['spec'] < 0) { $pi = $i; break; }
                    if ($pi < 0) $pi = 0;
                    $lands[$pi]['spec'] = $specIdx; $lands[$pi]['forced'] = true;
                }
            }
        }
        usort($lands, fn($a, $b) => $a['cell'] <=> $b['cell']);
        foreach ($lands as $i => $L) {
            $c = $L['cell'];
            $rec = ['cell' => $c, 'kind' => 'coin', 'value' => 0];
            if ($L['forced']) $rec['forced'] = true;
            if ($L['spec'] < 0) { $kind[$c] = 'coin'; $val[$c] = ol_coin($rng); $rec['value'] = $val[$c]; }
            else {
                $k = $SK[$L['spec']]; $g = $SG[$L['spec']];
                $kind[$c] = $k; $rec['kind'] = $k; $rec['god'] = $g; $strikes[$g]++;
                $oi = array_search($g, $owed, true); if ($oi !== false) array_splice($owed, $oi, 1);
                if ($k === 'gem') { $j = ol_pickIndex($rng, $CFG['gemWeights']); $val[$c] = $JP[$j]['units']; $isJp[$c] = true; $rec['jp'] = $j; $rec['value'] = $val[$c]; $jackpots[$j]++; }
                elseif ($k === 'bolt') { $lands[$i]['add'] = $CFG['boostValues'][ol_pickIndex($rng, $CFG['boostWeights'])]; $rec['value'] = 0; }
                elseif ($k === 'sun') { $lands[$i]['own'] = ol_coin($rng); $rec['value'] = 0; }
                else $rec['value'] = 0;
            }
            $filled++;
            $step['lands'][] = $rec;
        }
        foreach ($lands as $L) if ($L['spec'] === 0) {
            $c = $L['cell']; $add = $L['add']; $hits = [];
            for ($t = 0; $t < OL_CELLS; $t++) if ($t !== $c && $kind[$t] && !$isJp[$t] && $val[$t] > 0) { $val[$t] += $add; $hits[] = ['cell' => $t, 'to' => $val[$t]]; }
            $val[$c] = $add;
            $step['events'][] = ['type' => 'boost', 'god' => OL_ZEUS, 'cell' => $c, 'add' => $add, 'hits' => $hits, 'own' => $add];
        }
        foreach ($lands as $L) if ($L['spec'] === 3) {
            $c = $L['cell']; $hits = [];
            for ($t = 0; $t < OL_CELLS; $t++) if ($t !== $c && $kind[$t] && !$isJp[$t] && $val[$t] > 0) { $val[$t] *= 2; $hits[] = ['cell' => $t, 'to' => $val[$t]]; }
            $val[$c] = $L['own'];
            $step['events'][] = ['type' => 'double', 'god' => OL_POLLO, 'cell' => $c, 'hits' => $hits, 'own' => $L['own']];
        }
        foreach ($lands as $L) if ($L['spec'] === 1) {
            $c = $L['cell']; $from = []; $s = 0;
            for ($t = 0; $t < OL_CELLS; $t++) if ($t !== $c && $kind[$t] && $val[$t] > 0) { $s += $val[$t]; $from[] = ['cell' => $t, 'value' => $val[$t]]; }
            if ($s <= 0) $s = ol_coin($rng);
            $val[$c] = $s;
            $step['events'][] = ['type' => 'collect', 'god' => OL_PECK, 'cell' => $c, 'from' => $from, 'value' => $s];
        }
        if (count($lands)) $left = 3; else $left--;
        if ($powerCell >= 0) {
            $add = $CFG['growValues'][ol_pickIndex($rng, $CFG['growWeights'])];
            $val[$powerCell] += $add; $strikes[OL_ARES]++;
            $step['events'][] = ['type' => 'grow', 'god' => OL_ARES, 'cell' => $powerCell, 'add' => $add, 'to' => $val[$powerCell]];
        }
        $step['leftAfter'] = $left;
        $s = $sum();
        if ($s >= $cap) $capped = true;
        $step['total'] = min($cap, $s);
        $steps[] = $step;
    }
    $total = $sum(); $full = $filled >= OL_CELLS; $grand = false;
    if ($full && !$capped) { $grand = true; $total += $JP[3]['units']; $jackpots[3]++; }
    if ($total >= $cap) { $total = $cap; $capped = true; }
    $final = [];
    for ($c = 0; $c < OL_CELLS; $c++) if ($kind[$c]) $final[] = ['cell' => $c, 'kind' => $kind[$c], 'value' => $val[$c]];
    return ['gods' => array_values($gods), 'start' => $startOut, 'steps' => $steps, 'final' => $final, 'boardSum' => min($cap, $sum()), 'full' => $full, 'fullGrand' => $grand, 'jackpots' => $jackpots, 'strikes' => $strikes, 'total' => $total, 'capped' => $capped];
}

function ol_readGrid(array $stops): array {
    $S = ol_D()['STRIPS']; $grid = [];
    for ($r = 0; $r < OL_REELS; $r++) { $st = $S[$r]; $n = count($st); $s = $stops[$r]; $grid[] = [$st[$s], $st[($s + 1) % $n], $st[($s + 2) % $n]]; }
    return $grid;
}
function ol_finishSpin(Closure $rng, array $grid, ?array $stops, ?array $forced): array {
    $D = ol_D(); $CFG = $D['CFG']; $CAP = $D['CAP'];
    $ev = ol_evalLines($grid);
    $coins = []; $gods = []; $order = null;
    for ($r = 0; $r < OL_REELS; $r++) for ($w = 0; $w < OL_ROWS; $w++) {
        $s = $grid[$r][$w];
        if ($s === OL_COIN) $coins[] = ['reel' => $r, 'row' => $w, 'cell' => $r * OL_ROWS + $w, 'value' => ol_coin($rng)];
        elseif ($s === OL_GOD) {
            if ($order === null) $order = $forced && isset($forced['gods']) ? $forced['gods'] : ol_shuffled($rng, [0, 1, 2, 3, 4]);
            $gods[] = ['reel' => $r, 'row' => $w, 'cell' => $r * OL_ROWS + $w, 'god' => $order[count($gods)], 'grow' => $rng() < $CFG['potGrow']];
        }
    }
    $out = ['stops' => $stops, 'grid' => $grid, 'lines' => $ev['wins'], 'lineWin' => $ev['total'], 'coins' => $coins, 'gods' => $gods, 'trigger' => null, 'bonus' => null, 'bonusWin' => 0, 'totalWin' => 0, 'capped' => false];
    $k = count($gods); $type = null;
    if ($forced) $type = $forced['type'];
    elseif ($k >= 3) $type = 'natural';
    elseif ($k >= 1) {
        if ($rng() < $CFG['trigger'][$k]) $type = 'natural';
        elseif ($rng() < $CFG['superChance']) $type = 'super';
    }
    if ($type) {
        $inPlay = array_map(fn($g) => $g['god'], $gods);
        $extras = [];
        if ($type === 'super') {
            if ($forced && !empty($forced['total'])) $total = $forced['total'];
            else { $w = []; foreach ($CFG['superTotal'] as $n => $x) $w[] = ($n > $k && $n >= 2) ? $x : 0; $total = ol_pickIndex($rng, $w); }
            $rest = ol_shuffled($rng, array_values(array_filter([0, 1, 2, 3, 4], fn($g) => !in_array($g, $inPlay, true))));
            $want = $forced && isset($forced['extraGods']) ? $forced['extraGods'] : array_slice($rest, 0, max(0, $total - $k));
            $free = [];
            for ($c = 0; $c < OL_CELLS; $c++) { $s = $grid[intdiv($c, OL_ROWS)][$c % OL_ROWS]; if ($s !== OL_COIN && $s !== OL_GOD) $free[] = $c; }
            $spots = ol_shuffled($rng, $free);
            foreach ($want as $i => $g) { $extras[] = ['god' => $g, 'cell' => $spots[$i], 'reel' => intdiv($spots[$i], OL_ROWS), 'row' => $spots[$i] % OL_ROWS]; $inPlay[] = $g; }
        }
        $start = [];
        foreach ($gods as $g) $start[] = ['cell' => $g['cell'], 'kind' => 'god', 'god' => $g['god']];
        foreach ($extras as $e) $start[] = ['cell' => $e['cell'], 'kind' => 'god', 'god' => $e['god']];
        foreach ($coins as $c) $start[] = ['cell' => $c['cell'], 'kind' => 'coin', 'value' => $c['value']];
        sort($inPlay);
        $out['trigger'] = ['type' => $type, 'gods' => $inPlay, 'extras' => $extras];
        $out['bonus'] = ol_makeBonus($rng, $inPlay, $start, max(0, $CAP - min($CAP, $ev['total'])));
        $out['bonusWin'] = $out['bonus']['total'];
    }
    $total = $out['lineWin'] + $out['bonusWin'];
    if ($total >= $CAP) { $total = $CAP; $out['capped'] = true; }
    $out['totalWin'] = $total;
    return $out;
}
function ol_spin(Closure $rng): array {
    $S = ol_D()['STRIPS']; $stops = [];
    for ($r = 0; $r < OL_REELS; $r++) $stops[] = rfloor($rng, count($S[$r]));
    return ol_finishSpin($rng, ol_readGrid($stops), $stops, null);
}
const OL_FILLER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function ol_quietGrid(Closure $rng): array {
    for ($tries = 0; $tries < 200; $tries++) {
        $grid = [];
        for ($r = 0; $r < OL_REELS; $r++) $grid[] = [OL_FILLER[rfloor($rng, 10)], OL_FILLER[rfloor($rng, 10)], OL_FILLER[rfloor($rng, 10)]];
        if (ol_evalLines($grid)['total'] === 0) return $grid;
    }
    return [[0, 5, 1], [2, 6, 3], [4, 7, 0], [1, 8, 2], [3, 9, 4]];
}
function ol_staged(Closure $rng, array $godList, int $nCoins, string $type, ?array $superExtra): array {
    $grid = ol_quietGrid($rng);
    $landed = $superExtra ? array_slice($godList, 0, count($godList) - count($superExtra)) : $godList;
    $reels = array_slice(ol_shuffled($rng, [0, 1, 2, 3, 4]), 0, count($landed)); sort($reels);
    foreach ($landed as $i => $_) $grid[$reels[$i]][rfloor($rng, OL_ROWS)] = OL_GOD;
    $free = [];
    for ($c = 0; $c < OL_CELLS; $c++) if ($grid[intdiv($c, OL_ROWS)][$c % OL_ROWS] !== OL_GOD) $free[] = $c;
    $spots = ol_shuffled($rng, $free);
    for ($i = 0; $i < $nCoins && $i < count($spots); $i++) $grid[intdiv($spots[$i], OL_ROWS)][$spots[$i] % OL_ROWS] = OL_COIN;
    if (ol_evalLines($grid)['total'] !== 0) return ol_staged($rng, $godList, $nCoins, $type, $superExtra);
    $forced = ['type' => $type, 'gods' => ol_shuffled($rng, $landed)];
    if ($superExtra) { $forced['extraGods'] = $superExtra; $forced['total'] = count($godList); }
    return ol_finishSpin($rng, $grid, null, $forced);
}
function ol_buy(Closure $rng, int $tierIndex): array {
    $tier = ol_D()['CFG']['buy'][$tierIndex];
    $n = ol_pickIndex($rng, $tier['godCount']);
    $godList = array_slice(ol_shuffled($rng, [0, 1, 2, 3, 4]), 0, $n);
    $out = ol_staged($rng, $godList, ol_pickIndex($rng, $tier['startCoins']), 'natural', null);
    $out['trigger']['type'] = 'buy'; $out['buy'] = $tier['id']; $out['cost'] = $tier['price'];
    return $out;
}
