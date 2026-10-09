<?php
/* Starwing — PHP port of src/games/starwing.math.js. Same rng call order, same results (proved by tools/starwing-xcheck.js).
   Amounts are in units (1 unit = stake / 20). The whole round (the spin and every re-spin) is decided and settled in one
   request, through rtp_pick (live balancing). Nothing is held back, so there is no hidden state and no open round. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const SW_REELS = 5, SW_WILD = 0;

function sw_D(): array { static $d = null; if ($d === null) $d = batty_data('starwing'); return $d; }
function sw_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function sw_window(array $stops): array {
    $S = sw_D()['STRIPS']; $g = [];
    for ($r = 0; $r < SW_REELS; $r++) { $st = $S[$r]; $L = count($st); $g[] = [$st[$stops[$r] % $L], $st[($stops[$r] + 1) % $L], $st[($stops[$r] + 2) % $L]]; }
    return $g;
}
function sw_evaluate(array $g, array $mult): array {
    $D = sw_D(); $PAY = $D['PAY']; $LINES = $D['LINES'];
    $wins = []; $pay = 0; $R = SW_REELS;
    foreach ($LINES as $l => $line) {
        $s = []; for ($r = 0; $r < $R; $r++) $s[] = $g[$r][$line[$r]];
        $sym = $s[0]; $n = 1; $m = 1;
        while ($n < $R && ($s[$n] === $sym || $s[$n] === SW_WILD)) { if ($s[$n] === SW_WILD) $m *= $mult[$n]; $n++; }
        if ($n >= 3) { $p = $PAY[$sym][$n - 3] * $m; $wins[] = ['l' => $l, 'dir' => 1, 's' => $sym, 'n' => $n, 'm' => $m, 'pay' => $p]; $pay += $p; }
        if ($n === $R) continue;
        $sym = $s[$R - 1]; $k = 1; $m = 1;
        while ($k < $R && ($s[$R - 1 - $k] === $sym || $s[$R - 1 - $k] === SW_WILD)) { if ($s[$R - 1 - $k] === SW_WILD) $m *= $mult[$R - 1 - $k]; $k++; }
        if ($k >= 3) { $p = $PAY[$sym][$k - 3] * $m; $wins[] = ['l' => $l, 'dir' => -1, 's' => $sym, 'n' => $k, 'm' => $m, 'pay' => $p]; $pay += $p; }
    }
    return ['wins' => $wins, 'pay' => $pay];
}
function sw_spin(Closure $rng): array {
    $D = sw_D(); $S = $D['STRIPS']; $CAP = $D['CAP'];
    $stops = []; $held = [false, false, false, false, false]; $mult = [1, 1, 1, 1, 1];
    for ($r = 0; $r < SW_REELS; $r++) $stops[] = (int) floor($rng() * count($S[$r]));
    $steps = []; $total = 0; $capped = false;
    for (;;) {
        $g = sw_window($stops); $newWild = [];
        for ($r = 1; $r <= 3; $r++) {
            if ($held[$r]) continue;
            if ($g[$r][0] === SW_WILD || $g[$r][1] === SW_WILD || $g[$r][2] === SW_WILD) {
                $held[$r] = true; $mult[$r] = $D['CFG']['multValues'][sw_pickIndex($rng, $D['CFG']['multWeights'])]; $newWild[] = $r;
            }
        }
        for ($r = 1; $r <= 3; $r++) if ($held[$r]) $g[$r] = [SW_WILD, SW_WILD, SW_WILD];
        $ev = sw_evaluate($g, $mult);
        $pay = $ev['pay'];
        if ($total + $pay >= $CAP) { $pay = $CAP - $total; $capped = true; }
        $total += $pay;
        $steps[] = ['stops' => $stops, 'grid' => $g, 'newWild' => $newWild, 'mult' => $mult, 'wins' => $ev['wins'], 'pay' => $pay];
        if ($capped || !$newWild) break;
        for ($r = 0; $r < SW_REELS; $r++) if (!$held[$r]) $stops[$r] = (int) floor($rng() * count($S[$r]));
    }
    return ['steps' => $steps, 'held' => $held, 'totalWin' => $total, 'capped' => $capped];
}

function play_starwing(array &$u, string $op, array $in): array {
    if ($op !== 'spin') throw new ApiError('Unknown action.');
    $D = sw_D();
    $stake = stake_of($in, STAKE_LADDER);
    $unit = intdiv($stake, $D['UNITS_PER_STAKE']);
    if ($u['balance'] < $stake) throw new ApiError('Not enough Batty Bucks.', 402);
    $rng = batty_rng();
    /* Live balancing: the spin and all its re-spins are one draw; rtp_pick may redraw it once (server/lib/rtp.php). */
    $o = rtp_pick('starwing', $stake, function () use ($rng, $unit) {
        $o = sw_spin($rng);
        return [$o, $o['totalWin'] * $unit];
    });
    $win = $o['totalWin'] * $unit;
    $mx = 1; foreach ($o['steps'] as $s) foreach ($s['wins'] as $w) if ($w['m'] > $mx) $mx = $w['m'];
    $f = ['x' => round($win / $stake, 2), 'respins' => count($o['steps']) - 1];
    if ($mx >= 25) $f['feedLabel'] = 'x' . $mx . ' wild line';
    if ($o['capped']) { $f['capped'] = true; $f['feedLabel'] = 'Supernova: 5,000x'; }
    $rid = round_quick($u, 'starwing', $stake, $win, $f);
    return ['o' => $o, 'win' => $win, 'cost' => $stake, 'unit' => $unit, 'round' => $rid];
}
