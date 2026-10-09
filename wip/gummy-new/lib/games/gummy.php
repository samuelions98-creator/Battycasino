<?php
/* Gummy Bats — PHP port of the "gummy math" block in games/gummy/game.js. Same tables, same rng call order, same results
   (proved round for round by tools/gummy-xcheck.js). Amounts are in units (1 unit = stake / 20).
   The whole round (the paid or bought spin, every tumble and the whole free-spins feature with its multiplier spots) is decided
   and settled in one request, through rtp_pick (live balancing). Nothing is held back, so there is no hidden state and no open round.

   {game:'gummy', op:'spin', stake, mode?: 'base' | 'buy' | 'super'}  ->  {o, win, cost, unit, round} */
if (!defined('BATTY')) { http_response_code(403); exit; }

const GB_COLS = 7, GB_ROWS = 7, GB_CELLS = 49, GB_UNITS = 20, GB_MAX_WIN_X = 25000, GB_CAP = 500000;
const GB_BUY_X = 100, GB_SUPER_X = 750, GB_MIN_CLUSTER = 5, GB_TOP_CLUSTER = 15, GB_SPOT_MAX = 1024, GB_SUPER_SPOT = 2;
const GB_PAYERS = 7, GB_MOON = 7, GB_WILD = 8, GB_FS_TRIGGER = 3;
const GB_PAY = [
    [60, 80, 100, 150, 200, 300, 400, 600, 1000, 2000, 5000],
    [40, 60, 80, 100, 150, 200, 300, 500, 800, 1500, 3000],
    [30, 40, 60, 80, 100, 150, 200, 300, 500, 1000, 2000],
    [25, 30, 40, 60, 80, 100, 150, 250, 400, 800, 1600],
    [20, 25, 30, 40, 60, 80, 100, 200, 300, 600, 1200],
    [15, 20, 25, 30, 40, 60, 80, 150, 250, 500, 1000],
    [10, 15, 20, 25, 30, 40, 60, 120, 200, 400, 800],
];
const GB_FS_AWARD = [0, 0, 0, 10, 12, 15, 20, 30];
const GB_W = [
    'base' => [90, 110, 135, 160, 185, 210, 240, 7, 0],
    'baseRef' => [90, 110, 135, 160, 185, 210, 240, 5, 36],
    'fs' => [260, 228, 193, 160, 128, 100, 80, 6, 0],
    'fsRef' => [260, 228, 193, 160, 128, 100, 80, 4, 25],
];
const GB_BUY_MOONS = [0, 0, 0, 832, 135, 25, 6, 2];
const GB_SUPER_MOONS = [0, 0, 0, 835, 132, 26, 5, 2];

/* every table, for the cross-check (it must equal the JS tables exactly) */
function gb_tables(): array {
    return ['COLS' => GB_COLS, 'ROWS' => GB_ROWS, 'CELLS' => GB_CELLS, 'UNITS_PER_STAKE' => GB_UNITS, 'MAX_WIN_X' => GB_MAX_WIN_X, 'CAP' => GB_CAP,
        'BUY_X' => GB_BUY_X, 'SUPER_X' => GB_SUPER_X, 'MIN_CLUSTER' => GB_MIN_CLUSTER, 'TOP_CLUSTER' => GB_TOP_CLUSTER, 'SPOT_MAX' => GB_SPOT_MAX,
        'SUPER_SPOT' => GB_SUPER_SPOT, 'PAY' => GB_PAY, 'FS_AWARD' => GB_FS_AWARD, 'FS_TRIGGER' => GB_FS_TRIGGER, 'W' => GB_W, 'BUY_MOONS' => GB_BUY_MOONS, 'SUPER_MOONS' => GB_SUPER_MOONS];
}

function gb_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function gb_payFor(int $s, int $n): int { return GB_PAY[$s][($n > GB_TOP_CLUSTER ? GB_TOP_CLUSTER : $n) - GB_MIN_CLUSTER]; }
function gb_fsAward(int $sc): int { return GB_FS_AWARD[$sc > 7 ? 7 : $sc]; }
function gb_nextSpot(int $v): int { return $v === 0 ? 1 : ($v === 1 ? 2 : ($v * 2 > GB_SPOT_MAX ? GB_SPOT_MAX : $v * 2)); }
function gb_neighbours(): array {
    static $nb = null;
    if ($nb !== null) return $nb;
    $nb = [];
    for ($c = 0; $c < GB_CELLS; $c++) {
        $col = intdiv($c, GB_ROWS); $row = $c % GB_ROWS; $n = [];
        if ($row > 0) $n[] = $c - 1;
        if ($row < GB_ROWS - 1) $n[] = $c + 1;
        if ($col > 0) $n[] = $c - GB_ROWS;
        if ($col < GB_COLS - 1) $n[] = $c + GB_ROWS;
        $nb[] = $n;
    }
    return $nb;
}
function gb_evaluate(array $g, array $spots): array {
    $NB = gb_neighbours();
    $cl = []; $pay = 0;
    $popped = array_fill(0, GB_CELLS, false);
    for ($s = 0; $s < GB_PAYERS; $s++) {
        $seen = array_fill(0, GB_CELLS, false);
        for ($c0 = 0; $c0 < GB_CELLS; $c0++) {
            if ($g[$c0] !== $s || $seen[$c0]) continue;
            $cells = [$c0]; $seen[$c0] = true;
            for ($k = 0; $k < count($cells); $k++) {
                foreach ($NB[$cells[$k]] as $d) if (!$seen[$d] && ($g[$d] === $s || $g[$d] === GB_WILD)) { $seen[$d] = true; $cells[] = $d; }
            }
            $n = count($cells);
            if ($n < GB_MIN_CLUSTER) continue;
            $mult = 0;
            foreach ($cells as $c) { $v = $spots[$c]; if ($v >= 2) $mult += $v; $popped[$c] = true; }
            $base = gb_payFor($s, $n); $p = $base * ($mult > 0 ? $mult : 1);
            $cl[] = ['s' => $s, 'cells' => $cells, 'n' => $n, 'base' => $base, 'mult' => $mult, 'pay' => $p];
            $pay += $p;
        }
    }
    $hit = [];
    for ($c = 0; $c < GB_CELLS; $c++) if ($popped[$c]) $hit[] = $c;
    return ['cl' => $cl, 'pay' => $pay, 'hit' => $hit];
}
function gb_applyTumble(array $g, array $hit, array $add): array {
    $gone = array_fill(0, GB_CELLS, false); $ng = array_fill(0, GB_CELLS, 0);
    foreach ($hit as $c) $gone[$c] = true;
    for ($col = 0; $col < GB_COLS; $col++) {
        $colv = $add[$col] ?? [];
        for ($row = 0; $row < GB_ROWS; $row++) { $c = $col * GB_ROWS + $row; if (!$gone[$c]) $colv[] = $g[$c]; }
        for ($row = 0; $row < GB_ROWS; $row++) $ng[$col * GB_ROWS + $row] = $colv[$row];
    }
    return $ng;
}
function gb_countMoons(array $g): int { $n = 0; foreach ($g as $x) if ($x === GB_MOON) $n++; return $n; }
function gb_runSequence(Closure $rng, array $g, array $spots, array $ref, int $room): array {
    $out = ['g' => $g, 'steps' => [], 'tw' => 0, 'sc' => 0, 'spots' => null, 'capped' => false];
    for (;;) {
        $ev = gb_evaluate($g, $spots);
        if (!$ev['pay']) break;
        $p = $ev['pay'];
        if ($out['tw'] + $p >= $room) { $p = $room - $out['tw']; $out['capped'] = true; }
        $step = ['cl' => $ev['cl'], 'pay' => $p, 'hit' => $ev['hit'], 'add' => []];
        $out['tw'] += $p;
        foreach ($ev['hit'] as $c) $spots[$c] = gb_nextSpot($spots[$c]);
        if ($out['capped']) { $out['steps'][] = $step; break; }
        for ($col = 0; $col < GB_COLS; $col++) {
            $n = 0; foreach ($ev['hit'] as $c) if (intdiv($c, GB_ROWS) === $col) $n++;
            $a = [];
            for ($i = 0; $i < $n; $i++) $a[] = gb_pickIndex($rng, $ref);
            $step['add'][] = $a;
        }
        $out['steps'][] = $step;
        $g = gb_applyTumble($g, $ev['hit'], $step['add']);
    }
    $out['sc'] = gb_countMoons($g);
    $out['spots'] = $spots;
    return $out;
}
function gb_freshGrid(Closure $rng, array $w): array { $g = []; for ($c = 0; $c < GB_CELLS; $c++) $g[] = gb_pickIndex($rng, $w); return $g; }
function gb_freeSpins(Closure $rng, int $carried, int $award, bool $superFs): array {
    $spots = array_fill(0, GB_CELLS, $superFs ? GB_SUPER_SPOT : 0);
    $fs = ['award' => $award, 'superFs' => $superFs, 's0' => $spots, 'spins' => [], 'awarded' => $award, 'retriggers' => 0, 'total' => 0, 'capped' => false];
    $left = $award;
    while ($left > 0) {
        $left--;
        $g = gb_freshGrid($rng, GB_W['fs']);
        $seq = gb_runSequence($rng, $g, $spots, GB_W['fsRef'], GB_CAP - $carried - $fs['total']);
        $spots = $seq['spots'];
        $fs['total'] += $seq['tw'];
        $seq['running'] = $fs['total'];
        $seq['retrig'] = 0;
        if ($seq['capped']) { $fs['capped'] = true; $fs['spins'][] = $seq; break; }
        $more = gb_fsAward($seq['sc']);
        if ($more) { $left += $more; $fs['awarded'] += $more; $fs['retriggers']++; $seq['retrig'] = $more; }
        $fs['spins'][] = $seq;
    }
    return $fs;
}
function gb_costOf(string $mode): int { return $mode === 'buy' ? GB_BUY_X * GB_UNITS : ($mode === 'super' ? GB_SUPER_X * GB_UNITS : GB_UNITS); }
function gb_finish(Closure $rng, string $mode, array $seq): array {
    $o = ['mode' => $mode, 'cost' => gb_costOf($mode), 'spin' => $seq, 'fs' => null, 'totalWin' => $seq['tw'], 'capped' => $seq['capped']];
    if (!$o['capped'] && $seq['sc'] >= GB_FS_TRIGGER) {
        $o['fs'] = gb_freeSpins($rng, $seq['tw'], gb_fsAward($seq['sc']), $mode === 'super');
        $o['totalWin'] += $o['fs']['total'];
        if ($o['fs']['capped']) $o['capped'] = true;
    }
    return $o;
}
function gb_spin(Closure $rng): array {
    $g = gb_freshGrid($rng, GB_W['base']);
    return gb_finish($rng, 'base', gb_runSequence($rng, $g, array_fill(0, GB_CELLS, 0), GB_W['baseRef'], GB_CAP));
}
function gb_triggerSpin(Closure $rng, int $n, string $mode): array {
    $w = GB_W['base']; $w[GB_MOON] = 0;
    $g = gb_freshGrid($rng, $w);
    $idx = range(0, GB_CELLS - 1);
    for ($i = 0; $i < $n; $i++) { $j = $i + (int) floor($rng() * (GB_CELLS - $i)); $t = $idx[$i]; $idx[$i] = $idx[$j]; $idx[$j] = $t; $g[$idx[$i]] = GB_MOON; }
    return gb_finish($rng, $mode, gb_runSequence($rng, $g, array_fill(0, GB_CELLS, 0), GB_W['baseRef'], GB_CAP));
}
function gb_buy(Closure $rng, bool $superFs): array { return gb_triggerSpin($rng, gb_pickIndex($rng, $superFs ? GB_SUPER_MOONS : GB_BUY_MOONS), $superFs ? 'super' : 'buy'); }
function gb_play(Closure $rng, string $mode): array { return $mode === 'buy' ? gb_buy($rng, false) : ($mode === 'super' ? gb_buy($rng, true) : gb_spin($rng)); }

/* ================= the API ================= */
function play_gummy(array &$u, string $op, array $in): array {
    if ($op !== 'spin') throw new ApiError('Unknown action.');
    $stake = stake_of($in, STAKE_LADDER);
    $mode = $in['mode'] ?? 'base';
    if (!is_string($mode) || !in_array($mode, ['base', 'buy', 'super'], true)) throw new ApiError('Bad value for mode.');
    $unit = intdiv($stake, GB_UNITS);
    $cost = $mode === 'buy' ? GB_BUY_X * $stake : ($mode === 'super' ? GB_SUPER_X * $stake : $stake);
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    $rng = batty_rng();
    /* Live balancing: the whole round is one draw; rtp_pick may redraw it once (lib/rtp.php). Every outcome the player sees
       is a genuine, complete draw from the maths above. */
    $o = rtp_pick('gummy', $cost, function () use ($rng, $mode, $unit) {
        $o = gb_play($rng, $mode);
        return [$o, $o['totalWin'] * $unit];
    });
    $win = $o['totalWin'] * $unit;
    /* the biggest multiplier that paid a cluster, for the big-wins feed */
    $best = 0;
    $seqs = [$o['spin']]; if ($o['fs']) foreach ($o['fs']['spins'] as $s) $seqs[] = $s;
    foreach ($seqs as $s) foreach ($s['steps'] as $st) foreach ($st['cl'] as $c) if ($c['mult'] > $best) $best = $c['mult'];
    $f = ['bonus' => $o['fs'] ? 1 : 0];
    if ($o['capped']) $f['feedLabel'] = 'MAX WIN 25,000×';
    elseif ($best >= 128) $f['feedLabel'] = '×' . $best . ' multiplier spots';
    $rid = round_quick($u, 'gummy', $cost, $win, $f);
    return ['o' => $o, 'win' => $win, 'cost' => $cost, 'unit' => $unit, 'round' => $rid];
}
