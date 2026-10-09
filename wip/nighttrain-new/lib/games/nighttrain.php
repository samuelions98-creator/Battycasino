<?php
/* Night Train: PHP port of the maths at the top of games/nighttrain/game.js. Same rng call order, same results
   (proved on seeded RNGs by tools/nighttrain-xcheck.js). Amounts are in credits: 1,000 credits = 1x the stake.
   The whole round (the spin, and the whole Respin Bonus if it triggers, or a bought bonus) is decided and settled in one
   request through rtp_pick, so there is no hidden state and no open round. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const NT_REELS = 5, NT_ROWS = 4, NT_COLS = 5, NT_BROWS = 6, NT_CELLS = 30, NT_ROW0 = 2;
const NT_CR = 1000, NT_MAX_X = 50000, NT_CAP = 50000000, NT_BUY_X = 80;
const NT_WILD = 0, NT_COIN = 9, NT_NSYM = 10;
const NT_K_COIN = 1, NT_K_COL = 2, NT_K_PAY = 3, NT_K_SNP = 4, NT_K_NEC = 5, NT_K_PCOL = 6, NT_K_PPAY = 7, NT_K_PSNP = 8;
const NT_PAY = [[0, 0, 0], [500, 2500, 12500], [375, 1250, 5000], [300, 750, 3750], [250, 625, 2500], [175, 450, 1250], [150, 375, 1000], [125, 300, 750], [125, 250, 625], [0, 0, 0]];
const NT_LINES = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3],
    [1, 1, 0, 1, 1], [2, 2, 3, 2, 2], [1, 1, 2, 1, 1], [2, 2, 1, 2, 2], [0, 1, 1, 1, 0],
    [3, 2, 2, 2, 3], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2],
    [0, 1, 0, 1, 0], [3, 2, 3, 2, 3], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2], [1, 2, 1, 2, 1],
    [2, 1, 2, 1, 2], [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [0, 1, 2, 3, 3], [3, 2, 1, 0, 0],
    [1, 0, 1, 2, 1], [2, 3, 2, 1, 2], [1, 2, 1, 0, 1], [2, 1, 2, 3, 2], [0, 0, 0, 1, 2],
    [3, 3, 3, 2, 1], [0, 1, 2, 2, 2], [3, 2, 1, 1, 1], [1, 1, 1, 0, 0], [2, 2, 2, 3, 3],
];
/* CFG: keep identical to CFG in games/nighttrain/game.js (tools/nighttrain-xcheck.js checks it) */
function nt_cfg(): array {
    static $c = null;
    if ($c === null) $c = [
        'counts' => [
            [0, 4, 5, 6, 7, 10, 11, 12, 12, 1],
            [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
            [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
            [8, 4, 5, 6, 7, 10, 11, 12, 12, 2],
            [8, 4, 5, 6, 7, 10, 11, 12, 12, 1],
        ],
        'coinV' => [500, 1000, 2000, 3000, 4000, 5000, 8000, 10000, 15000, 20000, 25000, 50000, 100000, 250000],
        'coinW' => [2600, 2600, 1600, 900, 600, 500, 300, 250, 160, 120, 90, 45, 18, 4],
        'baseKindW' => [960, 10, 14, 12, 4],
        'landP' => 0.05,
        'kindW' => [0, 9200, 160, 180, 160, 70, 5, 7, 7],
        'shotN' => [2, 3, 4, 5], 'shotW' => [45, 30, 17, 8],
        'raiseN' => [1, 2, 3], 'raiseW' => [55, 32, 13],
        'unlock' => [12, 18],
        'buyN' => [3, 4, 5], 'buyNW' => [70, 22, 8],
        'buyKindW' => [900, 25, 30, 30, 15],
    ];
    return $c;
}
function nt_strips(): array {
    static $out = null;
    if ($out !== null) return $out;
    $C = nt_cfg(); $rnd = batty_mulberry(20261031); $out = [];
    for ($r = 0; $r < NT_REELS; $r++) {
        $a = [];
        for ($sym = 0; $sym < NT_NSYM; $sym++) for ($i = 0; $i < $C['counts'][$r][$sym]; $i++) $a[] = $sym;
        for ($i = count($a) - 1; $i > 0; $i--) { $j = (int) floor($rnd() * ($i + 1)); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; }
        $L = count($a);
        for ($pass = 0; $pass < 60; $pass++) {
            $bad = false;
            for ($i = 0; $i < $L; $i++) {
                $n = ($i + 1) % $L;
                if ($a[$i] === $a[$n]) { $bad = true; $k = ($n + 1 + (int) floor($rnd() * ($L - 3))) % $L; $t = $a[$n]; $a[$n] = $a[$k]; $a[$k] = $t; }
            }
            if (!$bad) break;
        }
        $out[] = $a;
    }
    return $out;
}
function nt_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function nt_coinValue(Closure $rng): int { $C = nt_cfg(); return $C['coinV'][nt_pickIndex($rng, $C['coinW'])]; }
function nt_readGrid(array $stops): array {
    $S = nt_strips(); $g = [];
    for ($r = 0; $r < NT_REELS; $r++) { $st = $S[$r]; $L = count($st); $s = $stops[$r]; $g[] = [$st[$s % $L], $st[($s + 1) % $L], $st[($s + 2) % $L], $st[($s + 3) % $L]]; }
    return $g;
}
function nt_evalLines(array $g): array {
    $wins = []; $total = 0;
    foreach (NT_LINES as $l => $ln) {
        $sym = $g[0][$ln[0]];
        if ($sym === NT_COIN) continue;
        $n = 1;
        while ($n < NT_REELS) { $s = $g[$n][$ln[$n]]; if ($s === $sym || $s === NT_WILD) $n++; else break; }
        if ($n >= 3) { $p = NT_PAY[$sym][$n - 3]; $wins[] = ['l' => $l, 's' => $sym, 'n' => $n, 'pay' => $p]; $total += $p; }
    }
    return ['wins' => $wins, 'total' => $total];
}
function nt_pickSome(Closure $rng, array $a, int $n): array {
    $out = []; $L = count($a); $n = min($n, $L);
    for ($i = 0; $i < $n; $i++) { $j = $i + (int) floor($rng() * ($L - $i)); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; $out[] = $a[$i]; }
    return $out;
}
function nt_isSpecial(int $k): bool { return $k >= NT_K_COL; }
function nt_isPhantom(int $k): bool { return $k >= NT_K_PCOL; }
function nt_baseKind(int $k): int { return $k === NT_K_PCOL ? NT_K_COL : ($k === NT_K_PPAY ? NT_K_PAY : ($k === NT_K_PSNP ? NT_K_SNP : $k)); }
const NT_ORDER_OF = [9, 9, 2, 0, 1, 3, 2, 0, 1];

function nt_bonus(Closure $rng, array $start, int $capLeft): array {
    $C = nt_cfg();
    $kind = array_fill(0, NT_CELLS, 0); $val = array_fill(0, NT_CELLS, 0); $used = array_fill(0, NT_CELLS, false); $marked = array_fill(0, NT_CELLS, false);
    $open = 4; $filled = 0; $capped = false;
    $kw = $C['kindW'];
    $sum = function () use (&$val) { return array_sum($val); };
    $startOut = [];
    foreach ($start as $s) { $kind[$s['c']] = $s['k']; $val[$s['c']] = $s['v']; $filled++; $startOut[] = ['c' => $s['c'], 'k' => $s['k'], 'v' => $s['v']]; }
    $byOrder = function (array &$cells) use (&$kind) { usort($cells, fn($x, $y) => (NT_ORDER_OF[$kind[$x]] - NT_ORDER_OF[$kind[$y]]) ?: ($x - $y)); };

    $act = function (int $c, int $k, ?string $phase) use (&$kind, &$val, &$used, &$marked, $rng, $C): array {
        $bk = nt_baseKind($k);
        if ($bk === NT_K_PAY) {
            $v = $val[$c]; $hits = [];
            for ($t = 0; $t < NT_CELLS; $t++) if ($t !== $c && $kind[$t]) { $val[$t] += $v; $hits[] = [$t, $val[$t]]; }
            $a = ['t' => 'pay', 'c' => $c, 'v' => $v, 'hits' => $hits];
        } elseif ($bk === NT_K_SNP) {
            $cand = [];
            $ph = nt_isPhantom($k);
            for ($t = 0; $t < NT_CELLS; $t++) if ($t !== $c && $kind[$t] && !nt_isPhantom($kind[$t]) && $val[$t] > 0 && !($ph && $marked[$t])) $cand[] = $t;
            $n = $C['shotN'][nt_pickIndex($rng, $C['shotW'])];
            $tg = nt_pickSome($rng, $cand, $n); $hits = [];
            foreach ($tg as $t) { $val[$t] *= 2; if ($ph) $marked[$t] = true; $hits[] = [$t, $val[$t]]; }
            $a = ['t' => 'snp', 'c' => $c, 'n' => $n, 'hits' => $hits];
        } elseif ($bk === NT_K_COL) {
            $from = []; $s = 0;
            for ($t = 0; $t < NT_CELLS; $t++) if ($t !== $c && $kind[$t] && $val[$t] > 0) { $from[] = $t; $s += $val[$t]; }
            $val[$c] += $s;
            $a = ['t' => 'col', 'c' => $c, 'from' => $from, 'to' => $val[$c]];
        } else {
            $a = ['t' => 'nec', 'c' => $c, 'raise' => [], 'to' => $val[$c]];
        }
        if ($phase !== null) $a['p'] = $phase;
        if (!nt_isPhantom($k)) $used[$c] = true;
        return $a;
    };
    $capCheck = function () use (&$capped, $sum, $capLeft): bool { if ($sum() >= $capLeft) $capped = true; return $capped; };
    $resolveNew = function (array $cells, array &$acts) use (&$kind, &$val, &$used, &$capped, $rng, $C, $act, $capCheck, $byOrder): void {
        $sp = []; foreach ($cells as $c) if (nt_isSpecial($kind[$c])) $sp[] = $c;
        $byOrder($sp);
        foreach ($sp as $c) {
            if ($capped) return;
            $k = $kind[$c];
            if ($k === NT_K_NEC) {
                $cand = [];
                for ($t = 0; $t < NT_CELLS; $t++) if ($used[$t] && ($kind[$t] === NT_K_COL || $kind[$t] === NT_K_PAY || $kind[$t] === NT_K_SNP)) $cand[] = $t;
                $n = $C['raiseN'][nt_pickIndex($rng, $C['raiseW'])];
                $raised = nt_pickSome($rng, $cand, $n);
                if (!$raised) { $val[$c] *= 3; $acts[] = ['t' => 'nec', 'c' => $c, 'raise' => [], 'to' => $val[$c]]; $used[$c] = true; $capCheck(); continue; }
                $byOrder($raised);
                $acts[] = ['t' => 'nec', 'c' => $c, 'raise' => $raised, 'to' => $val[$c]]; $used[$c] = true;
                foreach ($raised as $t) { if ($capped) return; $acts[] = $act($t, $kind[$t], 'r'); $capCheck(); }
            } else { $acts[] = $act($c, $k, null); $capCheck(); }
        }
    };

    $startActs = [];
    $capCheck();
    if (!$capped) $resolveNew(array_map(fn($s) => $s['c'], $startOut), $startActs);
    $steps = []; $left = 3; $respins = 0;
    while ($left > 0 && !$capped && $filled < $open * NT_COLS) {
        $respins++;
        $step = ['left' => $left, 'lands' => [], 'unlock' => 0, 'acts' => [], 'leftAfter' => 0, 'sum' => 0];
        $landed = [];
        for ($c = 0; $c < NT_CELLS; $c++) {
            if ($kind[$c] || intdiv($c, NT_COLS) < NT_BROWS - $open) continue;
            if ($rng() < $C['landP']) {
                $k = nt_pickIndex($rng, $kw);
                $v = 0;
                if ($k !== NT_K_COL && $k !== NT_K_PCOL) $v = nt_coinValue($rng);
                if (nt_isPhantom($k)) $kw[$k] = 0;
                $kind[$c] = $k; $val[$c] = $v; $filled++;
                $landed[] = $c; $step['lands'][] = ['c' => $c, 'k' => $k, 'v' => $v];
            }
        }
        while ($open < NT_BROWS && $filled >= $C['unlock'][$open - 4]) { $open++; $step['unlock'] = $open; }
        $capCheck();
        if (!$capped) $resolveNew($landed, $step['acts']);
        if (!$capped) {
            $ph = [];
            for ($c = 0; $c < NT_CELLS; $c++) if (nt_isPhantom($kind[$c]) && !in_array($c, $landed, true)) $ph[] = $c;
            $byOrder($ph);
            foreach ($ph as $c) { if ($capped) break; $step['acts'][] = $act($c, $kind[$c], 'p'); $capCheck(); }
        }
        $left = $landed ? 3 : $left - 1;
        $step['leftAfter'] = $left;
        $step['sum'] = min($capLeft, $sum());
        $steps[] = $step;
    }
    $total = $sum();
    if ($total >= $capLeft) { $total = $capLeft; $capped = true; }
    $board = [];
    for ($c = 0; $c < NT_CELLS; $c++) if ($kind[$c]) $board[] = ['c' => $c, 'k' => $kind[$c], 'v' => $val[$c]];
    return ['start' => $startOut, 'startActs' => $startActs, 'steps' => $steps, 'board' => $board, 'open' => $open, 'full' => $filled >= NT_CELLS, 'respins' => $respins, 'total' => $total, 'capped' => $capped];
}

function nt_finish(Closure $rng, array $grid, ?array $stops, array $kindW, bool $buy): array {
    $ev = $buy ? ['wins' => [], 'total' => 0] : nt_evalLines($grid);
    $coins = [];
    for ($r = 0; $r < NT_REELS; $r++) for ($w = 0; $w < NT_ROWS; $w++) {
        if ($grid[$r][$w] !== NT_COIN) continue;
        $k = nt_pickIndex($rng, $kindW) + 1;
        $v = $k === NT_K_COL ? 0 : nt_coinValue($rng);
        $coins[] = ['r' => $r, 'w' => $w, 'c' => ($w + NT_ROW0) * NT_COLS + $r, 'k' => $k, 'v' => $v];
    }
    $out = ['stops' => $stops, 'grid' => $grid, 'lines' => $ev['wins'], 'lineWin' => min(NT_CAP, $ev['total']), 'coins' => $coins, 'bonus' => null, 'bonusWin' => 0, 'totalWin' => 0, 'capped' => false];
    if ($buy) $out['buy'] = true;
    if (count($coins) >= 3) {
        $out['bonus'] = nt_bonus($rng, array_map(fn($x) => ['c' => $x['c'], 'k' => $x['k'], 'v' => $x['v']], $coins), NT_CAP - $out['lineWin']);
        $out['bonusWin'] = $out['bonus']['total'];
    }
    $total = $out['lineWin'] + $out['bonusWin'];
    if ($total >= NT_CAP) { $total = NT_CAP; $out['capped'] = true; }
    $out['totalWin'] = $total;
    return $out;
}
function nt_spin(Closure $rng): array {
    $S = nt_strips(); $stops = [];
    for ($r = 0; $r < NT_REELS; $r++) $stops[] = (int) floor($rng() * count($S[$r]));
    return nt_finish($rng, nt_readGrid($stops), $stops, nt_cfg()['baseKindW'], false);
}
const NT_BUY_R1 = [1, 3, 5, 7], NT_BUY_R2 = [2, 4, 6, 8], NT_BUY_REST = [1, 2, 3, 4, 5, 6, 7, 8];
function nt_buy(Closure $rng): array {
    $C = nt_cfg();
    $n = $C['buyN'][nt_pickIndex($rng, $C['buyNW'])];
    $grid = [];
    for ($r = 0; $r < NT_REELS; $r++) {
        $set = $r === 0 ? NT_BUY_R1 : ($r === 1 ? NT_BUY_R2 : NT_BUY_REST); $col = [];
        for ($w = 0; $w < NT_ROWS; $w++) $col[] = $set[(int) floor($rng() * count($set))];
        $grid[] = $col;
    }
    $spots = nt_pickSome($rng, range(0, NT_REELS * NT_ROWS - 1), $n);
    sort($spots);
    foreach ($spots as $s) $grid[intdiv($s, NT_ROWS)][$s % NT_ROWS] = NT_COIN;
    return nt_finish($rng, $grid, null, $C['buyKindW'], true);
}

function play_nighttrain(array &$u, string $op, array $in): array {
    if ($op !== 'spin') throw new ApiError('Unknown action.');
    $stake = stake_of($in, STAKE_LADDER);
    $buy = !empty($in['buy']);
    $cost = $buy ? NT_BUY_X * $stake : $stake;
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    $rng = batty_rng();
    /* Live balancing: the spin and its whole bonus are one draw; rtp_pick may redraw it once (lib/rtp.php). */
    $o = rtp_pick('nighttrain', $cost, function () use ($rng, $buy, $stake) {
        $o = $buy ? nt_buy($rng) : nt_spin($rng);
        return [$o, intdiv($o['totalWin'] * $stake, NT_CR)];
    });
    $win = intdiv($o['totalWin'] * $stake, NT_CR);
    $x = $o['totalWin'] / NT_CR;
    $f = ['x' => round($win / $cost, 2)];
    if ($o['bonus']) {
        $f['bonus'] = 1;
        $f['respins'] = $o['bonus']['respins'];
        if ($x >= 100) $f['feedLabel'] = 'Night Train Respins: ' . number_format($x, 0) . 'x';
    }
    if ($o['capped']) { $f['capped'] = true; $f['feedLabel'] = 'Night Train max win: 50,000x'; }
    $rid = round_quick($u, 'nighttrain', $cost, $win, $f);
    return ['o' => $o, 'win' => $win, 'cost' => $cost, 'round' => $rid];
}
