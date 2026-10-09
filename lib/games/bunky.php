<?php
/* Bunky Time — PHP port of src/games/bunky.math.js. Same rng call order, same results. */
if (!defined('BATTY')) { http_response_code(403); exit; }

function bk_D(): array { static $d = null; if ($d === null) $d = batty_data('bunky'); return $d; }
function bk_kind(string $spot): string { return $spot === 'one' ? 'one' : (in_array($spot, bk_D()['BONUSES'], true) ? 'bonus' : 'letter'); }
function bk_pick(array $t, Closure $rng) {
    $r = $rng() * $t['total'];
    $n = count($t['values']);
    for ($i = 0; $i < $n; $i++) { $r -= $t['weights'][$i]; if ($r < 0) return $t['values'][$i]; }
    return $t['values'][$n - 1];
}
function bk_chooseDistinct(array $arr, int $n, Closure $rng): array {
    $a = $arr; $out = []; $len = count($a);
    for ($i = 0; $i < $n; $i++) { $j = $i + rfloor($rng, $len - $i); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; $out[] = $a[$i]; }
    return $out;
}
function bk_drawBoosts(Closure $rng): array {
    $D = bk_D(); $B = $D['BOOST']; $out = [];
    foreach (bk_chooseDistinct($D['ONE_SEGS'], $B['ones'], $rng) as $seg) $out[] = ['seg' => $seg, 'mult' => bk_pick($B['oneMult'], $rng)];
    foreach (bk_chooseDistinct($D['LETTER_SEGS'], $B['letters'], $rng) as $seg) $out[] = ['seg' => $seg, 'mult' => bk_pick($B['letterMult'], $rng)];
    if ($rng() < $B['bonusChance']) $out[] = ['seg' => $D['BONUS_SEGS'][rfloor($rng, count($D['BONUS_SEGS']))], 'mult' => bk_pick($B['bonusMult'], $rng)];
    return $out;
}
function bk_playBar(Closure $rng): array {
    $BAR = bk_D()['BAR'];
    do { $a = bk_pick($BAR, $rng); $b = bk_pick($BAR, $rng); $c = bk_pick($BAR, $rng); } while ($a === $b || $b === $c || $a === $c);
    return ['type' => 'bar', 'mults' => [$a, $b, $c]];
}
function bk_playHang(Closure $rng): array {
    $H = bk_D()['HANG'];
    $top = count($H['ladder']) - 1;
    $level = [0, 0, 0]; $grips = [$H['grips'], $H['grips'], $H['grips']]; $done = [false, false, false]; $how = ['', '', ''];
    $draws = []; $alive = 3;
    $up = function (int $t, array &$moved) use (&$level, &$done, &$how, &$alive, $top) {
        $level[$t]++; $moved[] = $t;
        if ($level[$t] >= $top) { $done[$t] = true; $how[$t] = 'top'; $alive--; }
    };
    while ($alive > 0) {
        $r = rfloor($rng, $H['ballTotal']);
        $team = -1;
        if ($r < $H['allBalls']) $kind = 'all';
        else {
            $r -= $H['allBalls'];
            $per = $H['climbPerTeam'] + $H['dropPerTeam'];
            $team = intdiv($r, $per); $kind = ($r % $per) < $H['climbPerTeam'] ? 'up' : 'drop';
            if ($done[$team]) continue;
        }
        $moved = []; $out = -1;
        if ($kind === 'all') { for ($t = 0; $t < 3; $t++) if (!$done[$t]) $up($t, $moved); }
        elseif ($kind === 'up') $up($team, $moved);
        else { $grips[$team]--; if ($grips[$team] <= 0) { $done[$team] = true; $how[$team] = 'drop'; $alive--; $out = $team; } }
        $draws[] = ['kind' => $kind, 'team' => $team, 'moved' => $moved, 'out' => $out, 'levels' => $level, 'grips' => $grips];
    }
    return ['type' => 'hang', 'draws' => $draws, 'levels' => $level, 'how' => $how, 'mults' => array_map(fn($l) => $H['ladder'][$l], $level)];
}
function bk_playDisco(Closure $rng, array $cfg, string $type): array {
    $DIRS = bk_D()['DIRS'];
    $n = $cfg['size']; $c = intdiv($n - 1, 2);
    $grid = [];
    for ($i = 0; $i < $n * $n; $i++) $grid[$i] = bk_pick($cfg['tiles'], $rng);
    $r = $c; $q = $c; $dir = -1; $total = $grid[$r * $n + $q];
    $steps = [];
    for (;;) {
        if ($dir < 0) $dir = rfloor($rng, 4);
        else { $k = rfloor($rng, 3); $dir = ($dir + ($k === 0 ? 0 : ($k === 1 ? 1 : 3))) % 4; }
        $r += $DIRS[$dir][0]; $q += $DIRS[$dir][1];
        if ($r < 0 || $r >= $n || $q < 0 || $q >= $n) { $steps[] = ['dir' => $dir, 'r' => $r, 'c' => $q, 'off' => true, 'value' => 0, 'total' => $total]; break; }
        $total += $grid[$r * $n + $q];
        $steps[] = ['dir' => $dir, 'r' => $r, 'c' => $q, 'off' => false, 'value' => $grid[$r * $n + $q], 'total' => $total];
    }
    return ['type' => $type, 'size' => $n, 'grid' => $grid, 'start' => [$c, $c], 'steps' => $steps, 'total' => $total];
}
function bk_playBonus(string $type, Closure $rng): array {
    $D = bk_D();
    if ($type === 'bar') return bk_playBar($rng);
    if ($type === 'hang') return bk_playHang($rng);
    if ($type === 'disco') return bk_playDisco($rng, $D['DISCO'], 'disco');
    return bk_playDisco($rng, $D['VIP'], 'vip');
}
function bk_spin(Closure $rng): array {
    $D = bk_D();
    $boosts = bk_drawBoosts($rng);
    $stop = rfloor($rng, count($D['WHEEL']));
    $spot = $D['WHEEL'][$stop]; $kind = bk_kind($spot);
    $boost = 1;
    foreach ($boosts as $b) if ($b['seg'] === $stop) $boost = $b['mult'];
    return ['boosts' => $boosts, 'stop' => $stop, 'spot' => $spot, 'kind' => $kind, 'boost' => $boost, 'bonus' => $kind === 'bonus' ? bk_playBonus($spot, $rng) : null];
}
function bk_needsPick(array $o): int { return ($o['kind'] === 'bonus' && ($o['spot'] === 'bar' || $o['spot'] === 'hang')) ? 3 : 0; }
function bk_bonusX(array $o, int $pick): int {
    $b = $o['bonus']; if (!$b) return 0;
    if ($b['type'] === 'bar' || $b['type'] === 'hang') return $b['mults'][$pick];
    return $b['total'];
}
function bk_winX(array $o, int $pick): int {
    $D = bk_D();
    if ($o['kind'] === 'one') return $D['ODDS']['one'] * $o['boost'];
    if ($o['kind'] === 'letter') return $D['ODDS']['letter'] * $o['boost'];
    return min($D['MAX_BONUS_X'], bk_bonusX($o, $pick) * $o['boost']);
}
function bk_settle(array $bets, array $o, int $pick): array {
    $by = []; $total = 0;
    foreach ($bets as $s => $stake) {
        if ($s !== $o['spot'] || !($stake > 0)) continue;
        $p = $stake + $stake * bk_winX($o, $pick);
        $by[$s] = $p; $total += $p;
    }
    return ['total' => $total, 'bySpot' => $by];
}
/* A hidden-until-picked copy of a bonus that needs a pick (the shapes the UI expects, values blank). */
function bk_masked(array $o): array {
    $m = $o;
    if ($o['bonus']['type'] === 'bar') $m['bonus'] = ['type' => 'bar', 'mults' => [0, 0, 0], 'hidden' => true];
    else $m['bonus'] = ['type' => 'hang', 'draws' => [], 'levels' => [0, 0, 0], 'how' => ['', '', ''], 'mults' => [0, 0, 0], 'hidden' => true];
    return $m;
}
