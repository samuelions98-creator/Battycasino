<?php
/* Fishing Frenzy — PHP port of src/games/fishing.math.js. Same rng call order, same results. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const FF_REELS = 5, FF_ROWS = 3, FF_CELLS = 15, FF_LINE_COUNT = 10;
const FF_FISH = 9, FF_SCAT = 10, FF_WILD = 11;

function ff_D(): array { static $d = null; if ($d === null) $d = batty_data('fishing'); return $d; }
function ff_fishValue(Closure $rng): int {
    $FV = ff_D()['FISH_VALUES']; $W = 0; foreach ($FV as $f) $W += $f['w'];
    $r = $rng() * $W;
    foreach ($FV as $f) { $r -= $f['w']; if ($r < 0) return $f['v']; }
    return $FV[0]['v'];
}
function ff_pickW(Closure $rng, array $items): array {
    $t = 0; foreach ($items as $it) $t += $it['w'];
    $r = $rng() * $t;
    foreach ($items as $it) { $r -= $it['w']; if ($r < 0) return $it; }
    return $items[count($items) - 1];
}
function ff_drawGrid(Closure $rng, array $set, ?array $forced = null): array {
    $grid = array_fill(0, FF_CELLS, 0); $values = array_fill(0, FF_CELLS, 0); $stops = [];
    for ($r = 0; $r < FF_REELS; $r++) {
        $strip = $set[$r]; $L = count($strip);
        $stop = ($forced && $forced[$r] !== null) ? $forced[$r] : rfloor($rng, $L);
        $stops[$r] = $stop;
        for ($row = 0; $row < FF_ROWS; $row++) {
            $s = $strip[($stop + $row) % $L];
            $grid[$r * FF_ROWS + $row] = $s;
            if ($s === FF_FISH) $values[$r * FF_ROWS + $row] = ff_fishValue($rng);
        }
    }
    return ['grid' => $grid, 'values' => $values, 'stops' => $stops];
}
function ff_evalLines(array $grid, $lineBet): array {
    $D = ff_D(); $PAY = $D['PAY']; $LINES = $D['LINES'];
    $wins = []; $total = 0;
    for ($l = 0; $l < FF_LINE_COUNT; $l++) {
        $ln = $LINES[$l];
        $s = [$grid[$ln[0]], $grid[FF_ROWS + $ln[1]], $grid[2 * FF_ROWS + $ln[2]], $grid[3 * FF_ROWS + $ln[3]], $grid[4 * FF_ROWS + $ln[4]]];
        $w = 0; while ($w < 5 && $s[$w] === FF_WILD) $w++;
        $best = 0; $bsym = -1; $bcount = 0;
        if ($w >= 2) { $p = $PAY[FF_WILD][$w]; if ($p > 0) { $best = $p; $bsym = FF_WILD; $bcount = $w; } }
        if ($w < 5) {
            $base = $s[$w];
            if ($base !== FF_SCAT) {
                $c = $w + 1; while ($c < 5 && ($s[$c] === $base || $s[$c] === FF_WILD)) $c++;
                $p = $PAY[$base][$c];
                if ($p > $best) { $best = $p; $bsym = $base; $bcount = $c; }
            }
        }
        if ($best > 0) { $pay = $best * $lineBet; $wins[] = ['line' => $l, 'sym' => $bsym, 'count' => $bcount, 'pay' => $pay]; $total += $pay; }
    }
    return ['wins' => $wins, 'total' => $total];
}
function ff_shuffledPerks(Closure $rng): array {
    $p = ff_D()['PERKS'];
    for ($i = count($p) - 1; $i > 0; $i--) { $j = rfloor($rng, $i + 1); $t = $p[$i]; $p[$i] = $p[$j]; $p[$j] = $t; }
    return $p;
}
function ff_finishBase(Closure $rng, int $stake, array $d, bool $bought): array {
    $D = ff_D(); $LINES = $D['LINES'];
    $grid = $d['grid']; $values = $d['values']; $lineBet = $stake / 10;
    $scat = [];
    for ($i = 0; $i < FF_CELLS; $i++) if ($grid[$i] === FF_SCAT) $scat[] = $i;
    $tease = null; $blastCell = -1;
    $landed = $grid; $landedValues = $values;
    if (count($scat) === 2 && !$bought) {
        $u = $rng();
        if ($u < $D['P_BLAST']) {
            $tease = 'blast';
            $pre = ff_evalLines($grid, $lineBet); $used = array_fill(0, FF_CELLS, false);
            foreach ($pre['wins'] as $wn) for ($r = 0; $r < $wn['count']; $r++) $used[$r * FF_ROWS + $LINES[$wn['line']][$r]] = true;
            $has = [false, false, false, false, false];
            foreach ($scat as $c) $has[intdiv($c, FF_ROWS)] = true;
            $free = []; $any = [];
            for ($i = 0; $i < FF_CELLS; $i++) { if ($has[intdiv($i, FF_ROWS)]) continue; $any[] = $i; if (!$used[$i]) $free[] = $i; }
            $pool = count($free) ? $free : $any;
            $blastCell = $pool[rfloor($rng, count($pool))];
            $grid[$blastCell] = FF_SCAT; $values[$blastCell] = 0; $scat[] = $blastCell;
        } elseif ($u < $D['P_BLAST'] + $D['P_DUD']) {
            $tease = 'dud';
            $has = [false, false, false, false, false];
            foreach ($scat as $c) $has[intdiv($c, FF_ROWS)] = true;
            $any = []; for ($i = 0; $i < FF_CELLS; $i++) if (!$has[intdiv($i, FF_ROWS)]) $any[] = $i;
            $blastCell = $any[rfloor($rng, count($any))];
        }
    }
    $ev = ff_evalLines($grid, $lineBet);
    $cap = $D['MAX_WIN_X'] * $stake;
    $lineWin = min($ev['total'], $cap);
    $triggered = count($scat) >= 3;
    return [
        'stake' => $stake, 'bought' => $bought, 'stops' => $d['stops'], 'landed' => $landed, 'landedValues' => $landedValues, 'grid' => $grid, 'values' => $values,
        'scatters' => $scat, 'tease' => $tease, 'blastCell' => $blastCell, 'lines' => $ev['wins'], 'lineWin' => $lineWin, 'win' => $lineWin, 'triggered' => $triggered,
        'freeSpins' => $triggered ? $D['FS_AWARD'][(string) min(5, count($scat))] : 0,
        'perks' => $triggered ? ff_shuffledPerks($rng) : null,
    ];
}
function ff_spin(Closure $rng, int $stake): array { return ff_finishBase($rng, $stake, ff_drawGrid($rng, ff_D()['STRIPS']['base']), false); }
function ff_buy(Closure $rng, int $stake): array {
    $D = ff_D();
    $n = ff_pickW($rng, $D['BUY_SCATTERS'])['n'];
    $reels = [0, 1, 2, 3, 4];
    for ($i = 4; $i > 0; $i--) { $j = rfloor($rng, $i + 1); $t = $reels[$i]; $reels[$i] = $reels[$j]; $reels[$j] = $t; }
    $forced = [null, null, null, null, null];
    $set = $D['STRIPS']['base'];
    for ($r = 0; $r < FF_REELS; $r++) {
        $strip = $set[$r]; $L = count($strip); $at = [];
        for ($i = 0; $i < $L; $i++) if ($strip[$i] === FF_SCAT) $at[] = $i;
        $inView = function ($st) use ($at, $L) { foreach ($at as $pos) if ((($pos - $st + $L) % $L) < FF_ROWS) return true; return false; };
        if (array_search($r, $reels, true) < $n) $forced[$r] = ($at[rfloor($rng, count($at))] - rfloor($rng, FF_ROWS) + $L) % $L;
        else { do { $st = rfloor($rng, $L); } while ($inView($st)); $forced[$r] = $st; }
    }
    $o = ff_finishBase($rng, $stake, ff_drawGrid($rng, $set, $forced), true);
    $o['price'] = $D['BUY_PRICE_X'] * $stake;
    return $o;
}
function ff_bonus(Closure $rng, int $stake, array $opt): array {
    $D = ff_D(); $LADDER = $D['LADDER']; $CPS = $D['CAPTAINS_PER_STEP'];
    $perk = $opt['perk'] ?? null; $carried = $opt['carried'] ?? 0; $lineBet = $stake / 10;
    $cap = $D['MAX_WIN_X'] * $stake;
    $spinsLeft = $opt['spins']; $level = 0; $meter = 0; $total = 0; $capped = false;
    if ($perk === 'spins3') $spinsLeft += 3;
    if ($perk === 'spins5') $spinsLeft += 5;
    if ($perk === 'mult') { $level = 1; $meter = $CPS; }
    $set = $perk === 'fish' ? $D['STRIPS']['fish'] : ($perk === 'crew' ? $D['STRIPS']['crew'] : $D['STRIPS']['free']);
    $startSpins = $spinsLeft; $startLevel = $level;
    $spins = []; $captainsSeen = 0; $fishCaught = 0; $maxLevel = $level;
    while ($spinsLeft > 0 && !$capped) {
        $spinsLeft--;
        $d = ff_drawGrid($rng, $set); $grid = $d['grid']; $values = $d['values'];
        $landed = $grid; $landedValues = $values;
        $caps = []; $fish = [];
        for ($i = 0; $i < FF_CELLS; $i++) { if ($grid[$i] === FF_WILD) $caps[] = $i; elseif ($grid[$i] === FF_FISH) $fish[] = $i; }
        $feature = null;
        if (count($fish) && !count($caps)) {
            if ($rng() < $D['P_NET']) {
                $pool = []; for ($i = 0; $i < FF_CELLS; $i++) if ($grid[$i] !== FF_FISH) $pool[] = $i;
                if (count($pool)) {
                    $c = $pool[rfloor($rng, count($pool))];
                    $grid[$c] = FF_WILD; $values[$c] = 0; $caps = [$c];
                    $feature = ['type' => 'net', 'cell' => $c];
                }
            }
        } elseif (count($caps) && !count($fish)) {
            if ($rng() < $D['P_SHOAL']) {
                $n = ff_pickW($rng, $D['SHOAL_COUNT'])['n'];
                $pool = []; for ($i = 0; $i < FF_CELLS; $i++) if ($grid[$i] !== FF_WILD) $pool[] = $i;
                $cells = [];
                for ($k = 0; $k < $n && count($pool); $k++) {
                    $j = rfloor($rng, count($pool)); $c = $pool[$j]; array_splice($pool, $j, 1);
                    $v = ff_fishValue($rng);
                    $grid[$c] = FF_FISH; $values[$c] = $v; $cells[] = ['cell' => $c, 'value' => $v];
                }
                usort($cells, fn($a, $b) => $a['cell'] <=> $b['cell']);
                $fish = array_map(fn($x) => $x['cell'], $cells);
                $feature = ['type' => 'shoal', 'cells' => $cells];
            }
        }
        $ev = ff_evalLines($grid, $lineBet);
        $mult = $LADDER[$level];
        $sum = 0; foreach ($fish as $c) $sum += $values[$c];
        $collects = []; $collectWin = 0;
        if (count($caps) && count($fish)) {
            foreach ($caps as $c) { $amt = $sum * $mult * $stake; $collects[] = ['captain' => $c, 'amount' => $amt]; $collectWin += $amt; }
            $fishCaught += count($fish) * count($caps);
        }
        $meterBefore = $meter; $levelBefore = $level;
        $meter += count($caps); $captainsSeen += count($caps);
        $steps = [];
        while ($level < count($LADDER) - 1 && $meter >= $CPS * ($level + 1)) {
            $level++; $spinsLeft += $D['RETRIGGER_SPINS'];
            $steps[] = ['level' => $level, 'mult' => $LADDER[$level], 'spins' => $D['RETRIGGER_SPINS']];
        }
        if ($level > $maxLevel) $maxLevel = $level;
        $win = $ev['total'] + $collectWin;
        if ($carried + $total + $win >= $cap) { $win = $cap - $carried - $total; $capped = true; }
        $total += $win;
        $spins[] = [
            'stops' => $d['stops'], 'landed' => $landed, 'landedValues' => $landedValues, 'grid' => $grid, 'values' => $values, 'feature' => $feature,
            'lines' => $ev['wins'], 'lineWin' => $ev['total'], 'captains' => $caps, 'fish' => $fish, 'fishSum' => $sum, 'mult' => $mult, 'collects' => $collects, 'collectWin' => $collectWin,
            'meterBefore' => $meterBefore, 'meterAfter' => $meter, 'levelBefore' => $levelBefore, 'levelAfter' => $level, 'steps' => $steps,
            'win' => $win, 'totalAfter' => $total, 'spinsLeftAfter' => $capped ? 0 : $spinsLeft, 'capped' => $capped,
        ];
    }
    return ['stake' => $stake, 'perk' => $perk, 'startSpins' => $startSpins, 'startLevel' => $startLevel, 'startMeter' => $startLevel * $CPS, 'spins' => $spins, 'total' => $total, 'capped' => $capped, 'maxLevel' => $maxLevel, 'captainsSeen' => $captainsSeen, 'fishCaught' => $fishCaught];
}
