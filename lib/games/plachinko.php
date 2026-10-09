<?php
/* Plachinko — PHP port of src/games/plachinko.math.js. Same rng call order, same results. */
if (!defined('BATTY')) { http_response_code(403); exit; }

function pl_D(): array { static $d = null; if ($d === null) $d = batty_data('plachinko'); return $d; }
function pl_path(Closure $rng, int $rows): array {
    $G = pl_D()['GATE']['node'][(string) $rows];
    $bits = (int) floor($rng() * (1 << $rows));
    $j = 0; $pass = false;
    for ($i = 0; $i < $rows; $i++) {
        if ($i === $G['row'] && $j === $G['rights']) $pass = true;
        $j += ($bits >> $i) & 1;
    }
    return ['bits' => $bits, 'pocket' => $j, 'pass' => $pass];
}
function pl_rollReel(Closure $rng): array {
    $R = pl_D()['REEL'];
    $u = $rng();
    $kind = $u < $R['batty'] ? 'batty' : ($u < $R['batty'] + $R['fever'] ? 'fever' : ($u < $R['batty'] + $R['fever'] + $R['tulip'] ? 'tulip'
        : ($u < $R['batty'] + $R['fever'] + $R['tulip'] + $R['reach'] ? 'reach' : 'miss')));
    if ($kind === 'batty') $d = [7, 7, 7];
    elseif ($kind === 'fever') { $n = 1 + rfloor($rng, 8); $v = $n >= 7 ? $n + 1 : $n; $d = [$v, $v, $v]; }
    elseif ($kind === 'tulip') { $a = 1 + rfloor($rng, 7); $d = [$a, $a + 1, $a + 2]; }
    elseif ($kind === 'reach') {
        $v = 1 + rfloor($rng, 9); $up = $rng() < 0.5;
        $c = $up ? ($v % 9) + 1 : (($v + 7) % 9) + 1;
        $d = [$v, $c, $v];
    } else {
        $a = 1 + rfloor($rng, 9);
        $r = 1 + rfloor($rng, 8); if ($r >= $a) $r++;
        $c = 1 + rfloor($rng, 9);
        if ($r === $a + 2 && $c === $a + 1) $c = ($c % 9) + 1;
        $d = [$a, $c, $r];
    }
    return ['kind' => $kind, 'd' => $d];
}
function pl_ballTicks(int $rows, string $risk, int $pocket, bool $gold, int $mult): int {
    $D = pl_D();
    $t = $D['TICKS'][(string) $rows][$risk][$pocket] * ($gold ? $D['GOLD']['mult'] : 1) * $mult;
    $cap = $D['CAP_X'] * $D['TICK'];
    return $t > $cap ? $cap : $t;
}
function pl_makeFever(Closure $rng, int $rows, string $risk, string $kind): array {
    $D = pl_D(); $cfg = $D['FEVER'][$kind]; $RT = $D['FEVER']['retrigger'];
    $balls = []; $left = $cfg['balls']; $retrig = 0; $total = 0;
    $catch = $D['GATE']['catch'][(string) $rows];
    while ($left > 0) {
        $left--;
        $p = pl_path($rng, $rows);
        $gold = $rng() < $D['GOLD']['p'];
        $gate = $p['pass'] && $rng() < $catch;
        $add = 0;
        if ($gate && $retrig < $RT['max']) { $retrig++; $add = $RT['add']; $left += $add; }
        $ticks = pl_ballTicks($rows, $risk, $p['pocket'], $gold, $cfg['mult']);
        $total += $ticks;
        $balls[] = ['bits' => $p['bits'], 'pocket' => $p['pocket'], 'gold' => $gold, 'gate' => $gate, 'add' => $add, 'ticks' => $ticks];
    }
    return ['type' => $kind, 'mult' => $cfg['mult'], 'base' => $cfg['balls'], 'balls' => $balls, 'ticks' => $total];
}
function pl_makeTulip(Closure $rng): array {
    $T = pl_D()['TULIP']; $TICK = pl_D()['TICK'];
    $prizes = []; $total = 0;
    for ($i = 0; $i < $T['balls']; $i++) {
        $u = $rng() * $T['total']; $x = $T['prizes'][count($T['prizes']) - 1]['x'];
        foreach ($T['prizes'] as $p) { $u -= $p['w']; if ($u < 0) { $x = $p['x']; break; } }
        $prizes[] = ['x' => $x, 'side' => $i % 2, 'ticks' => $x * $TICK];
        $total += $x * $TICK;
    }
    return ['type' => 'tulip', 'balls' => $prizes, 'ticks' => $total];
}
function pl_drop(Closure $rng, int $rows, string $risk): array {
    $D = pl_D();
    $p = pl_path($rng, $rows);
    $o = ['rows' => $rows, 'risk' => $risk, 'bits' => $p['bits'], 'pocket' => $p['pocket'], 'pass' => $p['pass'], 'gold' => false, 'gate' => false, 'reel' => null, 'feature' => null, 'ticks' => 0, 'totalTicks' => 0];
    $o['gold'] = $rng() < $D['GOLD']['p'];
    $o['ticks'] = pl_ballTicks($rows, $risk, $o['pocket'], $o['gold'], 1);
    if ($o['pass']) $o['gate'] = $rng() < $D['GATE']['catch'][(string) $rows];
    if ($o['gate']) {
        $o['reel'] = pl_rollReel($rng);
        if ($o['reel']['kind'] === 'fever' || $o['reel']['kind'] === 'batty') $o['feature'] = pl_makeFever($rng, $rows, $risk, $o['reel']['kind']);
        elseif ($o['reel']['kind'] === 'tulip') $o['feature'] = pl_makeTulip($rng);
    }
    $o['totalTicks'] = $o['ticks'] + ($o['feature'] ? $o['feature']['ticks'] : 0);
    return $o;
}
function pl_pay(int $stake, int $ticks): int { return (int) round($stake * $ticks / pl_D()['TICK']); }
function pl_settle(array $o, int $stake): int {
    $total = pl_pay($stake, $o['ticks']);
    if ($o['feature']) foreach ($o['feature']['balls'] as $b) $total += pl_pay($stake, $b['ticks']);
    return $total;
}
