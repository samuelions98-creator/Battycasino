<?php
/* Bat Bandits UltraNudge — PHP port of src/games/ultraheist.math.js (same rng call order, same results, proved by
   tools/ultraheist-xcheck.js), plus the server action play_ultraheist(). Amounts are in units (1 unit = stake / 20).
   Strips, paytable and weights come from gamedata.json (exported from the JS by tools/export-data.js). */
if (!defined('BATTY')) { http_response_code(403); exit; }

const UH_REELS = 5, UH_ROWS = 4, UH_CELLS = 20, UH_LINES = 40;
const UH_WILD = 10, UH_BAG = 11, UH_VAULT = 12;

function uh_D(): array { static $d = null; if ($d === null) $d = batty_data('ultraheist'); return $d; }
function uh_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function uh_bagValue(Closure $rng, bool $free): int {
    $C = uh_D()['CFG'];
    return $C['bagValues'][uh_pickIndex($rng, $free ? $C['bagFree'] : $C['bagBase'])];
}

/* board: ['strips', 'free', 'pos', 'sym', 'bag', 'wild'] */
function uh_board(bool $free): array {
    $D = uh_D();
    return ['strips' => $free ? $D['FREE_STRIPS'] : $D['STRIPS'], 'free' => $free, 'pos' => [0, 0, 0, 0, 0],
        'sym' => array_fill(0, UH_CELLS, 0), 'bag' => array_fill(0, UH_CELLS, 0), 'wild' => array_fill(0, UH_CELLS, false)];
}
function uh_land(array &$bd, Closure $rng): array {
    $S = $bd['strips']; $C = uh_D()['CFG'];
    for ($r = 0; $r < UH_REELS; $r++) $bd['pos'][$r] = (int) floor($rng() * count($S[$r]));
    for ($r = 0; $r < UH_REELS; $r++) for ($k = 0; $k < UH_ROWS; $k++) {
        $c = $r * UH_ROWS + $k; $L = count($S[$r]); $s = $S[$r][($bd['pos'][$r] + $k) % $L];
        $bd['sym'][$c] = $s; $bd['bag'][$c] = $s === UH_BAG ? uh_bagValue($rng, $bd['free']) : 0; $bd['wild'][$c] = false;
    }
    $n = uh_pickIndex($rng, $bd['free'] ? $C['banditFree'] : $C['banditBase']);
    $cand = [];
    for ($c = UH_ROWS; $c < 4 * UH_ROWS; $c++) if ($bd['sym'][$c] < UH_WILD) $cand[] = $c;
    $out = [];
    while ($n > 0 && count($cand)) {
        $i = (int) floor($rng() * count($cand)); $c = $cand[$i]; $bd['wild'][$c] = true; $out[] = $c; $n--;
        $reel = intdiv($c, UH_ROWS);
        for ($j = count($cand) - 1; $j >= 0; $j--) { $rj = intdiv($cand[$j], UH_ROWS); if ($cand[$j] === $c || $rj === $reel - 1 || $rj === $reel + 1) array_splice($cand, $j, 1); }
    }
    sort($out);
    return $out;
}
function uh_nudge(array &$bd, Closure $rng): void {
    $S = $bd['strips'];
    for ($r = 0; $r < UH_REELS; $r++) {
        $L = count($S[$r]); $bd['pos'][$r] = ($bd['pos'][$r] + $L - 1) % $L;
        $b = $r * UH_ROWS;
        for ($k = UH_ROWS - 1; $k > 0; $k--) { $bd['sym'][$b + $k] = $bd['sym'][$b + $k - 1]; $bd['bag'][$b + $k] = $bd['bag'][$b + $k - 1]; $bd['wild'][$b + $k] = $bd['wild'][$b + $k - 1]; }
        $s = $S[$r][$bd['pos'][$r]];
        $bd['sym'][$b] = $s; $bd['bag'][$b] = $s === UH_BAG ? uh_bagValue($rng, $bd['free']) : 0; $bd['wild'][$b] = false;
    }
}
function uh_evalLines(array $view): array {
    $D = uh_D(); $PL = $D['PAYLINES']; $PAY = $D['PAY'];
    $wins = []; $total = 0; $withWild = false;
    for ($l = 0; $l < UH_LINES; $l++) {
        $pl = $PL[$l]; $s = $view[$pl[0]];
        if ($s >= UH_WILD) continue;
        $n = 1; $w = false;
        while ($n < UH_REELS) { $v = $view[$n * UH_ROWS + $pl[$n]]; if ($v === $s) $n++; elseif ($v === UH_WILD) { $n++; $w = true; } else break; }
        $p = $PAY[$s][$n];
        if ($p > 0) { $wins[] = [$l, $s, $n, $p]; $total += $p; if ($w) $withWild = true; }
    }
    return ['wins' => $wins, 'total' => $total, 'withWild' => $withWild];
}
function uh_step(array &$bd, int $mult, bool $bagMult): array {
    $view = []; $bags = $bd['bag'];
    for ($c = 0; $c < UH_CELLS; $c++) { $view[] = $bd['wild'][$c] ? UH_WILD : $bd['sym'][$c]; if ($bd['wild'][$c]) $bags[$c] = 0; }
    $ev = uh_evalLines($view);
    $wins = array_map(fn($w) => [$w[0], $w[1], $w[2], $w[3] * $mult], $ev['wins']);
    $lineWin = $ev['total'] * $mult;
    $bandits = 0; $sc = 0;
    for ($c = 0; $c < UH_CELLS; $c++) { if ($bd['wild'][$c]) $bandits++; if ($view[$c] === UH_VAULT) $sc++; }
    $got = []; $bagSum = 0;
    if ($bandits > 0) for ($c = 0; $c < UH_CELLS; $c++) if (!$bd['wild'][$c] && $bd['sym'][$c] === UH_BAG && $bd['bag'][$c] > 0) { $got[] = $c; $bagSum += $bd['bag'][$c]; $bd['bag'][$c] = -1; }
    $collect = $bagSum * $bandits * ($bagMult ? $mult : 1);
    return ['g' => $view, 'b' => $bags, 'm' => $mult, 'w' => $wins, 'lw' => $lineWin, 'ww' => $ev['withWild'], 'nb' => $bandits, 'cc' => $got, 'c' => $collect, 'sc' => $sc, 'win' => $lineWin + $collect];
}
function uh_playSet(Closure $rng, bool $free, int $mult0, int $room): array {
    $bd = uh_board($free);
    $bandits = uh_land($bd, $rng);
    $stops = $bd['pos']; $steps = [];
    $mult = $free ? $mult0 : 1; $win = 0; $bagsGot = 0; $scatter = false; $capped = false;
    $max = uh_D()['MAX_STEPS'];
    for ($i = 0; ; $i++) {
        $st = uh_step($bd, $mult, $free);
        $steps[] = $st; $win += $st['win']; $bagsGot += count($st['cc']);
        if (!$free && $st['sc'] >= 3) $scatter = true;
        if ($win >= $room) { $capped = true; break; }
        $go = $st['nb'] > 0 || ($free && $st['lw'] > 0);
        if (!$go || $i + 1 >= $max) break;
        uh_nudge($bd, $rng); $mult++;
    }
    return ['stops' => $stops, 'bandits' => $bandits, 'steps' => $steps, 'win' => $win, 'bags' => $bagsGot, 'scatter' => $scatter, 'capped' => $capped, 'multEnd' => $mult];
}
function uh_freeSpins(Closure $rng, int $room): array {
    $C = uh_D()['CFG'];
    $spins = []; $left = $C['fsSpins']; $total = 0; $mult = 1; $meter = 0; $extra = 0; $capped = false; $played = 0;
    while ($left > 0) {
        $left--; $played++;
        $s = uh_playSet($rng, true, $mult, $room - $total);
        $mult = $s['multEnd'];
        $total += $s['win'];
        $add = 0; $meter += $s['bags'];
        while ($meter >= $C['alarmEvery']) { $meter -= $C['alarmEvery']; $add += $C['alarmSpins']; }
        $left += $add; $extra += $add;
        $spins[] = ['stops' => $s['stops'], 'bandits' => $s['bandits'], 'steps' => $s['steps'], 'win' => $s['win'], 'bags' => $s['bags'], 'add' => $add, 'meter' => $meter, 'left' => $left, 'mult' => $mult];
        if ($s['capped'] || $total >= $room) { $capped = true; $total = min($total, $room); break; }
    }
    return ['spins' => $spins, 'total' => $total, 'played' => $played, 'extra' => $extra, 'multEnd' => $mult, 'capped' => $capped];
}
function uh_spin(Closure $rng): array {
    $CAP = uh_D()['CAP'];
    $base = uh_playSet($rng, false, 1, $CAP);
    $fs = $base['scatter'] && !$base['capped'] ? uh_freeSpins($rng, $CAP - $base['win']) : null;
    $total = $base['win'] + ($fs ? $fs['total'] : 0); $capped = $base['capped'] || ($fs && $fs['capped']);
    if ($total >= $CAP) { $total = $CAP; $capped = true; }
    return ['stops' => $base['stops'], 'bandits' => $base['bandits'], 'steps' => $base['steps'], 'baseWin' => min($base['win'], $CAP), 'trig' => $base['scatter'] && !$base['capped'], 'fs' => $fs, 'totalWin' => $total, 'capped' => $capped];
}
function uh_buy(Closure $rng): array {
    $CAP = uh_D()['CAP'];
    $fs = uh_freeSpins($rng, $CAP);
    return ['stops' => null, 'bandits' => [], 'steps' => [], 'baseWin' => 0, 'trig' => true, 'buy' => true, 'fs' => $fs, 'totalWin' => min($CAP, $fs['total']), 'capped' => $fs['capped']];
}

/* ================= server action =================
   op 'spin': {stake, buy?: true}. One request returns the entire spin (every nudge, collect and free spin); nothing
   is hidden because nothing is left to decide. The draw goes through rtp_pick (live balancing, see lib/rtp.php):
   the whole outcome, free spins included, is drawn in one go and its total return decides any redraw. */
function play_ultraheist(array &$u, string $op, array $in): array {
    if ($op !== 'spin') throw new ApiError('Unknown action.');
    $D = uh_D();
    $stake = stake_of($in, STAKE_LADDER);
    $unit = intdiv($stake, $D['UNITS_PER_STAKE']);
    $buy = array_key_exists('buy', $in) && $in['buy'] !== null && $in['buy'] !== false;
    if ($buy && $in['buy'] !== true && $in['buy'] !== 1) throw new ApiError('Bad value for buy.');
    $cost = $buy ? $D['BUY_X'] * $stake : $stake;
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    $rng = batty_rng();
    $o = rtp_pick('ultraheist', $cost, function () use ($rng, $buy, $unit) {
        $o = $buy ? uh_buy($rng) : uh_spin($rng);
        return [$o, $o['totalWin'] * $unit];
    });
    $win = $o['totalWin'] * $unit;
    $f = ['bonus' => $o['fs'] ? 1 : 0, 'x' => round($win / $cost, 2)];
    if ($o['fs']) {
        $f['heist'] = true;
        if ($o['fs']['multEnd'] >= 25) $f['mult25'] = true;
        if ($win >= 50 * $cost) $f['feedLabel'] = 'Heist Free Spins x' . $o['fs']['multEnd'];
    }
    if ($o['capped']) { $f['capped'] = true; $f['feedLabel'] = 'The Big Score: 10,000x'; }
    $rid = round_quick($u, 'ultraheist', $cost, $win, $f);
    return ['o' => $o, 'win' => $win, 'cost' => $cost, 'unit' => $unit, 'round' => $rid];
}
