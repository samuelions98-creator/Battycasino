<?php
/* Bat Derby: virtual racing on a shared live schedule.
   The maths (dm_*) is a line-for-line port of the "derby math" block in games/derby/game.js: same rng call order and the
   same arithmetic (only + - * / on doubles), so a seeded run gives identical races in both (tools/derby-xcheck.js proves it).
   The schedule: one race every 60-75 s. There is no cron job: whichever request arrives after the open race's betting
   closes creates the next race, under the 'derby_lock' settings row. A race's result is drawn when it is created and only
   leaves the server once its betting has closed. Every player's bets on a race are one open round, settled when the
   result is official, by the player's own poll or (if they have gone) by whoever polls next. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const DM_N = 8;
const DM_TARGET = 0.96;
const DM_BAND = 0.0015;
const DM_DIV_CAP = 999999;

function dm_D(): array {
    static $d = null;
    if ($d !== null) return $d;
    $lad = [[1, 5], [2, 9], [1, 4], [2, 7], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1],
        [11, 10], [6, 5], [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2],
        [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [17, 2], [9, 1], [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [18, 1], [20, 1], [22, 1], [25, 1], [28, 1], [33, 1],
        [40, 1], [50, 1], [66, 1], [80, 1], [100, 1]];
    $dec = []; $fra = [];
    foreach ($lad as $f) { $dec[] = ($f[0] + $f[1]) / $f[1]; $fra[] = $f[0] / $f[1]; }
    $d = [
        'LADDER' => $lad, 'DEC' => $dec, 'FRA' => $fra,
        'TYPES' => ['win' => 1, 'ew' => 1, 'fc' => 2, 'rfc' => 2, 'tc' => 3],
        'TYPE_NAMES' => ['win' => 'Win', 'ew' => 'Each Way', 'fc' => 'Forecast', 'rfc' => 'Reverse Forecast', 'tc' => 'Tricast'],
        'BAT_NAMES' => ['Count Flapula', 'Wing Commander', 'Night Fury', 'Echo Location', 'Fang Shui', 'Guano Express', 'Sir Flapsalot', 'Velvet Wings',
            'Moonlit Menace', 'Belfry Boy', 'Nocturne', 'Dusk Till Dawn', 'Batty Boo', 'Steeple Chaser', 'Hanging Around', 'Upside Downey',
            'Sonar Flare', 'Leather Wing', 'Flittermouse', 'Nosferatu Ned', 'Little Fang', 'Pipistrelle Pete', 'Hollow Moon', 'Gloaming Glory',
            'Batsby', 'Blood Orange', 'Garlic Dodger', 'Coffin Dodger', 'Eclipse Express', 'Wingnut', 'Lady Noctula', 'Barbastelle',
            'Night Shift', 'Bramble Bat', 'Rooftop Rascal', 'Bell Tower', 'Echo Chamber', 'Moon Dancer', 'Shadow Puppet', 'Flap Jack',
            'Sky Fang', 'Midnight Feast', 'Dracu-Lass', 'Gothic Rocket', 'Vlad the Inhaler', 'Bite Club', 'Fangs a Million', 'Lord Dangleby'],
        'JOCKEYS' => ['V. Nightingale', 'B. Wingate', 'R. Flittermouse', 'D. Batterby', 'S. Echols', 'C. Dusk', 'M. Moonie', 'J. Belfry',
            'T. Vamperley', 'L. Fangio', 'P. Gargoyle', 'H. Ravenscroft', 'E. Mothersole', 'A. Sonar'],
        'RACE_NAMES' => ['Moonlight Sprint', 'Belfry Handicap', 'Count’s Cup', 'Twilight Stakes', 'Gravestone Maiden Stakes', 'Full Moon Derby',
            'Crypt Nursery Stakes', 'Lantern Trophy', 'Batty Bucks Handicap', 'Vampire Vase', 'Echo Plate', 'Gothic Gold Cup', 'Harvest Moon Stakes',
            'Witching Hour Handicap', 'Fang Sprint', 'Night Owl Conditions Stakes'],
        'GOINGS' => ['Good', 'Good to Firm', 'Good to Soft', 'Soft', 'Firm'],
        'GOING_W' => [34, 22, 24, 12, 8],
        'GOING_MS' => ['Firm' => -300, 'Good to Firm' => -150, 'Good' => 0, 'Good to Soft' => 200, 'Soft' => 450],
        'DISTS' => [5, 6, 7],
        'DIST_MS' => [15200, 17400, 19600],
        'COLOURS' => ['#e8173a', '#1d4fd8', '#ffd21f', '#0f9d58', '#ffffff', '#14141c', '#ff7a1a', '#7b2ff7', '#ff5fb0', '#22c6e0', '#7a1030', '#0b2a6b', '#9be22d', '#c0c6d2', '#7b4a1e', '#00796b'],
        'PATTERNS' => ['hoops', 'stripes', 'chevrons', 'quartered', 'halved', 'sash', 'cross', 'stars', 'spots', 'diamonds', 'check', 'braces', 'hoop', 'seams'],
        'CAPS' => ['plain', 'quartered', 'hooped', 'spots', 'star', 'peak'],
        'MARGINS' => [5, 10, 20, 30, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600],
        'WIN_MW' => [6, 6, 7, 12, 14, 12, 10, 7, 6, 4, 4, 2, 2, 1, 1, 0, 0],
        'GAP_MW' => [3, 4, 6, 10, 13, 12, 11, 8, 8, 5, 6, 4, 3, 2, 2, 1, 1],
    ];
    return $d;
}
function dm_frac(int $i): string { $f = dm_D()['LADDER'][$i]; return $f[0] === $f[1] ? 'Evs' : $f[0] . '/' . $f[1]; }
function dm_pickW(Closure $rng, array $w): int {
    $t = 0; foreach ($w as $x) $t += $x;
    $r = $rng() * $t; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function dm_shuffleTake(Closure $rng, array $a, int $k): array {
    $a = array_values($a); $n = count($a);
    for ($i = 0; $i < $k; $i++) { $j = $i + (int) floor($rng() * ($n - $i)); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; }
    return array_slice($a, 0, $k);
}
function dm_expA(float $x): float { $y = 1 + $x / 1024; for ($i = 0; $i < 10; $i++) $y = $y * $y; return $y; }
function dm_gauss(Closure $rng): float { $a = $rng(); $b = $rng(); $c = $rng(); $d = $rng(); return ($a + $b + $c + $d - 2) * 1.7320508075688772; }
function dm_snapDec(float $d): int {
    $DEC = dm_D()['DEC']; $L = count($DEC);
    if ($d <= $DEC[0]) return 0;
    for ($i = 1; $i < $L; $i++) if ($d <= $DEC[$i]) return $d * $d < $DEC[$i - 1] * $DEC[$i] ? $i - 1 : $i;
    return $L - 1;
}
function dm_snapFra(float $f): int {
    $FRA = dm_D()['FRA']; $L = count($FRA);
    if ($f <= $FRA[0]) return 0;
    for ($i = 1; $i < $L; $i++) if ($f <= $FRA[$i]) return $f * $f < $FRA[$i - 1] * $FRA[$i] ? $i - 1 : $i;
    return $L - 1;
}
function dm_placeProbs(array $w, array $v): array {
    $out = [0, 0, 0, 0, 0, 0, 0, 0];
    $V = 0; for ($i = 0; $i < DM_N; $i++) $V += $v[$i];
    for ($j = 0; $j < DM_N; $j++) {
        $out[$j] += $w[$j];
        $V1 = $V - $v[$j];
        for ($a = 0; $a < DM_N; $a++) {
            if ($a === $j) continue;
            $pa = $v[$a] / $V1;
            $out[$a] += $w[$j] * $pa;
            $V2 = $V1 - $v[$a];
            for ($b = 0; $b < DM_N; $b++) { if ($b === $j || $b === $a) continue; $out[$b] += $w[$j] * $pa * $v[$b] / $V2; }
        }
    }
    return $out;
}
function dm_bookReturn(array $idx): float { $DEC = dm_D()['DEC']; $q = 0; for ($i = 0; $i < DM_N; $i++) $q += 1 / $DEC[$idx[$i]]; return 1 / $q; }
function dm_ewReturn(array $w, array $eidx): float {
    $FRA = dm_D()['FRA']; $sb = 0; $sc = 0;
    for ($i = 0; $i < DM_N; $i++) { $e = $FRA[$eidx[$i]]; $b = 1 / (1 + $e / 4); $sb += $b; $sc += $w[$i] * (1 + $e) * $b; }
    return (3 + $sc) / (2 * $sb);
}
function dm_tune(array &$idx, Closure $fn, Closure $maxOf): void {
    for ($it = 0; $it < 30; $it++) {
        $cur = $fn($idx); $best = $cur < DM_TARGET ? DM_TARGET - $cur : $cur - DM_TARGET;
        if ($best < 0.0006) return;
        $moves = [];
        for ($i = 0; $i < DM_N; $i++) for ($d = -1; $d <= 1; $d += 2) { $k = $idx[$i] + $d; if ($k >= 0 && $k <= $maxOf($i)) $moves[] = [$i, $d]; }
        $bm = null; $nm = count($moves);
        for ($m = 0; $m < $nm; $m++) {
            $A = $moves[$m]; $idx[$A[0]] += $A[1];
            $r = $fn($idx); $e = $r < DM_TARGET ? DM_TARGET - $r : $r - DM_TARGET;
            if ($e < $best) { $best = $e; $bm = [$A]; }
            for ($m2 = $m + 1; $m2 < $nm; $m2++) {
                $B2 = $moves[$m2]; if ($B2[0] === $A[0]) continue;
                $idx[$B2[0]] += $B2[1]; $r = $fn($idx); $e = $r < DM_TARGET ? DM_TARGET - $r : $r - DM_TARGET;
                if ($e < $best) { $best = $e; $bm = [$A, $B2]; }
                $idx[$B2[0]] -= $B2[1];
            }
            $idx[$A[0]] -= $A[1];
        }
        if (!$bm) return;
        foreach ($bm as $A) $idx[$A[0]] += $A[1];
    }
}
function dm_priceField(Closure $rng, array $ratings): ?array {
    $D = dm_D(); $DEC = $D['DEC']; $FRA = $D['FRA']; $L = count($DEC);
    $mean = 0; for ($i = 0; $i < DM_N; $i++) $mean += $ratings[$i]; $mean /= DM_N;
    $sig = 0.34 + 0.32 * $rng();
    $s = []; $S = 0;
    for ($i = 0; $i < DM_N; $i++) { $x = ($ratings[$i] - $mean) * 0.04 + dm_gauss($rng) * $sig; $e = dm_expA($x < -3.5 ? -3.5 : ($x > 3.5 ? 3.5 : $x)); $s[] = $e; $S += $e; }
    $idx = [];
    for ($i = 0; $i < DM_N; $i++) $idx[] = dm_snapDec(DM_TARGET * $S / $s[$i]);
    dm_tune($idx, fn($x) => dm_bookReturn($x), fn($i) => $L - 1);
    $rw = dm_bookReturn($idx);
    if ($rw < DM_TARGET - DM_BAND || $rw > DM_TARGET + DM_BAND) return null;
    $w = []; for ($i = 0; $i < DM_N; $i++) $w[] = $rw / $DEC[$idx[$i]];
    $lo = 0.5; $hi = 1.05; $k = 1;
    for ($t = 0; $t < 40; $t++) { $k = ($lo + $hi) / 2; $e = []; for ($i = 0; $i < DM_N; $i++) $e[] = dm_snapFra($FRA[$idx[$i]] * $k); if (dm_ewReturn($w, $e) > DM_TARGET) $hi = $k; else $lo = $k; }
    $eidx = []; for ($i = 0; $i < DM_N; $i++) { $j = dm_snapFra($FRA[$idx[$i]] * $k); $eidx[] = $j > $idx[$i] ? $idx[$i] : $j; }
    dm_tune($eidx, fn($x) => dm_ewReturn($w, $x), fn($i) => $idx[$i]);
    $re = dm_ewReturn($w, $eidx);
    if ($re < DM_TARGET - DM_BAND || $re > DM_TARGET + DM_BAND) return null;
    $tgt = [];
    for ($i = 0; $i < DM_N; $i++) {
        $e = $FRA[$eidx[$i]]; $t = (2 * $re - $w[$i] * (1 + $e)) / (1 + $e / 4);
        if (!($t > $w[$i] + 0.002) || !($t < 0.995)) return null;
        $tgt[] = $t;
    }
    $v = $w; $err = 1;
    for ($it = 0; $it < 200 && $err > 1e-13; $it++) {
        $c = dm_placeProbs($w, $v); $err = 0;
        for ($i = 0; $i < DM_N; $i++) { $d = $c[$i] - $tgt[$i]; $ad = $d < 0 ? -$d : $d; if ($ad > $err) $err = $ad; $v[$i] = $v[$i] * (($tgt[$i] - $w[$i]) / ($c[$i] - $w[$i])); }
        $sv = 0; for ($i = 0; $i < DM_N; $i++) $sv += $v[$i];
        for ($i = 0; $i < DM_N; $i++) $v[$i] = $v[$i] / $sv;
    }
    if ($err > 1e-9) return null;
    $fc = []; $tc = [];
    for ($a = 0; $a < DM_N; $a++) for ($b = 0; $b < DM_N; $b++) {
        if ($a === $b) { $fc[] = 0; for ($c = 0; $c < DM_N; $c++) $tc[] = 0; continue; }
        $pab = $w[$a] * $v[$b] / (1 - $v[$a]);
        $fc[] = (int) floor(96 / $pab);
        for ($c = 0; $c < DM_N; $c++) {
            if ($c === $a || $c === $b) { $tc[] = 0; continue; }
            $dv = floor(96 / ($pab * $v[$c] / (1 - $v[$a] - $v[$b])));
            if ($dv > DM_DIV_CAP) return null;
            $tc[] = (int) $dv;
        }
    }
    return ['idx' => $idx, 'eidx' => $eidx, 'w' => $w, 'v' => $v, 'rw' => $rw, 're' => $re, 'fc' => $fc, 'tc' => $tc];
}
function dm_makeSilks(Closure $rng): array {
    $D = dm_D(); $C = $D['COLOURS']; $nc = count($C);
    $b = (int) floor($rng() * $nc);
    $a = (int) floor($rng() * ($nc - 1)); if ($a >= $b) $a++;
    $p = (int) floor($rng() * count($D['PATTERNS']));
    $cp = (int) floor($rng() * count($D['CAPS']));
    $c = $rng() < 0.5 ? $a : $b;
    return ['b' => $C[$b], 'a' => $C[$a], 'p' => $D['PATTERNS'][$p], 'c' => $C[$c], 'cp' => $D['CAPS'][$cp]];
}
function dm_makeRoster(Closure $rng): array {
    $out = []; $names = dm_D()['BAT_NAMES'];
    foreach ($names as $i => $name) {
        $silks = dm_makeSilks($rng);
        $rating = 62 + (int) floor($rng() * 40);
        $runs = 3 + (int) floor($rng() * 4);
        $form = '';
        for ($k = 0; $k < $runs; $k++) {
            $q = ($rating - 62) / 40;
            $pos = 1 + (int) floor($rng() * 8 * (1.15 - 0.75 * $q));
            if ($pos > 8) $pos = 8; if ($pos < 1) $pos = 1;
            $form .= (string) $pos;
        }
        $out[] = ['id' => $i + 1, 'name' => $name, 'silks' => $silks, 'rating' => $rating, 'form' => $form, 'runs' => $runs, 'wins' => substr_count($form, '1'), 'hist' => []];
    }
    return $out;
}
function dm_makeRace(Closure $rng, array $roster, array $exclude): array {
    $D = dm_D();
    $pool = []; foreach ($roster as $b) if (!in_array($b['id'], $exclude, true)) $pool[] = $b;
    $runners = dm_shuffleTake($rng, $pool, DM_N);
    $jockeys = dm_shuffleTake($rng, $D['JOCKEYS'], DM_N);
    $name = $D['RACE_NAMES'][(int) floor($rng() * count($D['RACE_NAMES']))];
    $dist = (int) floor($rng() * count($D['DISTS']));
    $going = dm_pickW($rng, $D['GOING_W']);
    $ratings = array_map(fn($b) => $b['rating'], $runners);
    $pr = null; $tries = 0;
    while (!$pr) { $pr = dm_priceField($rng, $ratings); $tries++; if ($tries > 200) throw new ApiError('Could not price a race.', 500); }
    $avg = 0; foreach ($ratings as $r) $avg += $r; $avg /= DM_N;
    $cls = $avg >= 92 ? 1 : ($avg >= 84 ? 2 : ($avg >= 76 ? 3 : ($avg >= 68 ? 4 : 5)));
    $R = [];
    foreach ($runners as $i => $b) $R[] = ['no' => $i + 1, 'id' => $b['id'], 'name' => $b['name'], 'silks' => $b['silks'], 'rating' => $b['rating'], 'form' => $b['form'], 'jockey' => $jockeys[$i],
        'odds' => $D['LADDER'][$pr['idx'][$i]], 'ew' => $D['LADDER'][$pr['eidx'][$i]], 'oi' => $pr['idx'][$i], 'ei' => $pr['eidx'][$i]];
    return ['name' => $name, 'dist' => $D['DISTS'][$dist], 'going' => $D['GOINGS'][$going], 'cls' => $cls, 'tries' => $tries,
        'runners' => $R, 'w' => $pr['w'], 'v' => $pr['v'], 'rw' => $pr['rw'], 're' => $pr['re'], 'fc' => $pr['fc'], 'tc' => $pr['tc']];
}
function dm_runRace(Closure $rng, array $race): array {
    $D = dm_D();
    $order = []; $left = [0, 1, 2, 3, 4, 5, 6, 7];
    $first = dm_pickW($rng, $race['w']);
    $order[] = $first; array_splice($left, array_search($first, $left, true), 1);
    while ($left) {
        $vw = array_map(fn($i) => $race['v'][$i], $left);
        $k = dm_pickW($rng, $vw);
        $order[] = $left[$k]; array_splice($left, $k, 1);
    }
    $margins = [$D['MARGINS'][dm_pickW($rng, $D['WIN_MW'])]];
    for ($i = 1; $i < DM_N - 1; $i++) $margins[] = $D['MARGINS'][dm_pickW($rng, $D['GAP_MW'])];
    $di = array_search($race['dist'], $D['DISTS'], true);
    $timeMs = $D['DIST_MS'][$di] + ($D['GOING_MS'][$race['going']] ?? 0) + (int) floor($rng() * 900) - 300;
    $seed = (int) floor($rng() * 2147483647);
    return ['order' => $order, 'margins' => $margins, 'timeMs' => $timeMs, 'seed' => $seed, 'photo' => $margins[0] <= 20];
}
/* Validate a bet; returns an error message or ''. */
function dm_checkBet($b): string {
    $T = dm_D()['TYPES'];
    if (!is_array($b) || !is_string($b['t'] ?? null) || !isset($T[$b['t']])) return 'Unknown bet type';
    $sel = $b['sel'] ?? null; $n = $T[$b['t']];
    if (!is_array($sel) || !array_is_list($sel) || count($sel) !== $n) return 'Pick ' . $n . ' runner' . ($n > 1 ? 's' : '');
    foreach ($sel as $i => $x) {
        if (!is_int($x) || $x < 0 || $x >= DM_N) return 'Bad runner';
        for ($j = 0; $j < $i; $j++) if ($sel[$j] === $x) return 'Pick different runners';
    }
    if (!is_int($b['stake'] ?? null) || !in_array($b['stake'], STAKE_LADDER, true)) return 'That stake is not on offer';
    return '';
}
function dm_settleBet(array $b, array $race, array $res): int {
    $o = $res['order']; $s = $b['stake']; $R = $race['runners']; $sel = $b['sel'];
    $pos = fn($i) => array_search($i, $o, true);
    switch ($b['t']) {
        case 'win': $f = $R[$sel[0]]['odds']; return $pos($sel[0]) === 0 ? (int) floor($s * ($f[0] + $f[1]) / $f[1]) : 0;
        case 'ew':
            $f = $R[$sel[0]]['ew']; $h = $s; $p = $pos($sel[0]); $r = 0;
            if ($p === 0) $r += (int) floor($h * ($f[0] + $f[1]) / $f[1]);
            if ($p !== false && $p <= 2) $r += (int) floor($h * ($f[0] + 4 * $f[1]) / (4 * $f[1]));
            return $r;
        case 'fc': return $o[0] === $sel[0] && $o[1] === $sel[1] ? (int) floor($s * $race['fc'][$sel[0] * DM_N + $sel[1]] / 100) : 0;
        case 'rfc':
            $h = $s; $a = $sel[0]; $c = $sel[1];
            if ($o[0] === $a && $o[1] === $c) return (int) floor($h * $race['fc'][$a * DM_N + $c] / 100);
            if ($o[0] === $c && $o[1] === $a) return (int) floor($h * $race['fc'][$c * DM_N + $a] / 100);
            return 0;
        case 'tc': return $o[0] === $sel[0] && $o[1] === $sel[1] && $o[2] === $sel[2] ? (int) floor($s * $race['tc'][($sel[0] * DM_N + $sel[1]) * DM_N + $sel[2]] / 100) : 0;
    }
    return 0;
}
function dm_updateForm(array $bats, array $race, array $res, int $raceId, int $when): array {
    $out = [];
    for ($i = 0; $i < DM_N; $i++) {
        $b = $bats[$i]; $pos = array_search($i, $res['order'], true) + 1;
        $rank = 1; for ($j = 0; $j < DM_N; $j++) if ($j !== $i && $race['runners'][$j]['oi'] < $race['runners'][$i]['oi']) $rank++;
        $d = $rank - $pos;
        $rating = $b['rating'] + ($d > 0 ? intdiv($d + 1, 2) : ($d < 0 ? -intdiv(1 - $d, 2) : 0)) + ($pos === 1 ? 1 : 0);
        if ($rating > 125) $rating = 125; if ($rating < 45) $rating = 45;
        $form = $b['form'] . (string) $pos; if (strlen($form) > 8) $form = substr($form, strlen($form) - 8);
        $hist = array_slice(array_merge([['race' => $raceId, 'at' => $when, 'pos' => $pos, 'odds' => dm_frac($race['runners'][$i]['oi']), 'name' => $race['name'], 'dist' => $race['dist'], 'going' => $race['going'], 'j' => $race['runners'][$i]['jockey']]], $b['hist'] ?? []), 0, 6);
        $out[] = ['id' => $b['id'], 'rating' => $rating, 'form' => $form, 'runs' => $b['runs'] + 1, 'wins' => $b['wins'] + ($pos === 1 ? 1 : 0), 'hist' => $hist];
    }
    return $out;
}
function dm_marginStr(int $m): string {
    if ($m <= 5) return 'nose'; if ($m <= 10) return 'short head'; if ($m <= 20) return 'head'; if ($m <= 30) return 'neck';
    $whole = intdiv($m, 100); $frac = $m % 100;
    $fs = $frac === 25 ? '¼' : ($frac === 50 ? '½' : ($frac === 75 ? '¾' : ''));
    return ($whole ? $whole : '') . $fs . ($m <= 100 ? ' length' : ' lengths');
}
function dm_costOf(array $b): int { return ($b['t'] === 'ew' || $b['t'] === 'rfc' ? 2 : 1) * $b['stake']; }

/* =====================================================================================================================
   The live schedule
   ===================================================================================================================== */
const DERBY_GATE_S = 4.0;      // from the close of betting to the stalls opening ("under starter's orders")
const DERBY_PHOTO_S = 5.5;     // from the winner crossing the line to the official result, after a photo
const DERBY_PLAIN_S = 2.5;     // ... and without one
const DERBY_SHOW_S = 9.0;      // winner's enclosure, after the result
const DERBY_MAX_BETS = 40;     // bets per player per race
const DERBY_SETTLE_GRACE = 6.0;

function derby_row(array $r): array {
    foreach (['open_at', 'close_at', 'off_at', 'finish_at', 'result_at', 'end_at'] as $k) $r[$k] = (float) $r[$k];
    $r['id'] = (int) $r['id'];
    return $r;
}
/* The whole stable, in id order (created the first time anyone asks). */
function derby_roster(): array {
    $rows = q('SELECT * FROM derby_bats ORDER BY id')->fetchAll();
    if (!$rows) {
        foreach (dm_makeRoster(batty_rng()) as $b)
            q('INSERT IGNORE INTO derby_bats (id, name, silks, rating, form, runs, wins, hist) VALUES (?,?,?,?,?,?,?,?)', [$b['id'], $b['name'], json_encode($b['silks']), $b['rating'], $b['form'], $b['runs'], $b['wins'], '[]']);
        $rows = q('SELECT * FROM derby_bats ORDER BY id')->fetchAll();
    }
    return array_map(fn($b) => ['id' => (int) $b['id'], 'name' => $b['name'], 'silks' => json_decode($b['silks'], true), 'rating' => (int) $b['rating'], 'form' => $b['form'],
        'runs' => (int) $b['runs'], 'wins' => (int) $b['wins'], 'hist' => json_decode($b['hist'] ?: '[]', true) ?: []], $rows);
}
/* Fold every race that has been run into the stable's ratings and form. Called under the derby lock. */
function derby_apply(array &$roster, float $now): void {
    $byId = []; foreach ($roster as $k => $b) $byId[$b['id']] = $k;
    foreach (q('SELECT id, card, result, off_at FROM derby_races WHERE applied = 0 AND finish_at <= ? ORDER BY id', [$now])->fetchAll() as $r) {
        $race = json_decode($r['card'], true); $res = json_decode($r['result'], true);
        $bats = array_map(fn($x) => $roster[$byId[$x['id']]], $race['runners']);
        foreach (dm_updateForm($bats, $race, $res, (int) $r['id'], (int) $r['off_at']) as $u) {
            $k = $byId[$u['id']];
            $roster[$k] = array_merge($roster[$k], $u);
            q('UPDATE derby_bats SET rating = ?, form = ?, runs = ?, wins = ?, hist = ? WHERE id = ?', [$u['rating'], $u['form'], $u['runs'], $u['wins'], json_encode($u['hist'], JSON_UNESCAPED_UNICODE), $u['id']]);
        }
        q('UPDATE derby_races SET applied = 1 WHERE id = ?', [$r['id']]);
    }
}
/* Make sure a race is open for betting. Runs inside the caller's transaction; the settings row serialises creators. */
function derby_ensure(float $now): void {
    $last = q1('SELECT id, close_at FROM derby_races ORDER BY id DESC LIMIT 1');
    if ($last && $now < (float) $last['close_at']) return;
    q("INSERT IGNORE INTO settings (k, v) VALUES ('derby_lock', '')");
    qv("SELECT v FROM settings WHERE k = 'derby_lock' FOR UPDATE");
    $last = q1('SELECT id, card, close_at FROM derby_races ORDER BY id DESC LIMIT 1');
    if ($last && $now < (float) $last['close_at']) return;
    $roster = derby_roster();
    derby_apply($roster, $now);
    $exclude = $last ? array_map(fn($x) => $x['id'], json_decode($last['card'], true)['runners']) : [];
    $rng = batty_rng();
    $race = dm_makeRace($rng, $roster, $exclude);
    $res = dm_runRace($rng, $race);
    $cycle = 60 + (int) floor($rng() * 16);                         // 60-75 s from one off to the next
    $open = $last ? max($now, (float) $last['close_at']) : $now;
    $close = ($last && $now - (float) $last['close_at'] < 30) ? (float) $last['close_at'] + $cycle : $now + $cycle;
    $off = $close + DERBY_GATE_S;
    $finish = $off + $res['timeMs'] / 1000;
    $result = $finish + ($res['photo'] ? DERBY_PHOTO_S : DERBY_PLAIN_S);
    $end = $result + DERBY_SHOW_S;
    unset($race['tries']);
    q('INSERT INTO derby_races (card, result, summary, open_at, close_at, off_at, finish_at, result_at, end_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [json_encode($race, JSON_UNESCAPED_UNICODE), json_encode($res), json_encode(derby_summary($race, $res, $off), JSON_UNESCAPED_UNICODE), $open, $close, $off, $finish, $result, $end]);
    $id = (int) db()->lastInsertId();
    if ($id % 500 === 0) { /* tidy up: races and bets older than a fortnight */
        $old = $now - 14 * 86400;
        q('DELETE FROM derby_bets WHERE race_id IN (SELECT id FROM derby_races WHERE end_at < ?)', [$old]);
        q('DELETE FROM derby_races WHERE end_at < ? AND id < ?', [$old, $id - 2000]);
        q('DELETE FROM derby_seen WHERE at < ?', [$now - 86400]);
    }
}
/* What the results board shows about a race (only sent once the result is official). */
function derby_summary(array $race, array $res, float $off): array {
    $o = $res['order']; $top = [];
    for ($k = 0; $k < 4; $k++) { $r = $race['runners'][$o[$k]]; $top[] = ['i' => $o[$k], 'no' => $r['no'], 'name' => $r['name'], 'silks' => $r['silks'], 'odds' => dm_frac($r['oi']), 'jockey' => $r['jockey']]; }
    return ['name' => $race['name'], 'dist' => $race['dist'], 'going' => $race['going'], 'cls' => $race['cls'], 'offAt' => $off, 'top' => $top, 'order' => $o,
        'margins' => array_map('dm_marginStr', array_slice($res['margins'], 0, 3)), 'photo' => $res['photo'],
        'fc' => $race['fc'][$o[0] * DM_N + $o[1]], 'tc' => $race['tc'][($o[0] * DM_N + $o[1]) * DM_N + $o[2]], 'timeMs' => $res['timeMs']];
}
function derby_race(int $id): ?array {
    static $cache = [];
    if (!array_key_exists($id, $cache)) { $r = q1('SELECT * FROM derby_races WHERE id = ?', [$id]); $cache[$id] = $r ? derby_row($r) : null; }
    return $cache[$id];
}
/* The race card every player may see (prices and dividends; no model, no result). */
function derby_card(array $r): array {
    $c = json_decode($r['card'], true);
    $runners = array_map(fn($x) => ['no' => $x['no'], 'id' => $x['id'], 'name' => $x['name'], 'silks' => $x['silks'], 'rating' => $x['rating'], 'form' => $x['form'],
        'jockey' => $x['jockey'], 'odds' => $x['odds'], 'ew' => $x['ew'], 'oi' => $x['oi'], 'ei' => $x['ei']], $c['runners']);
    return ['id' => $r['id'], 'name' => $c['name'], 'dist' => $c['dist'], 'going' => $c['going'], 'cls' => $c['cls'], 'runners' => $runners, 'fc' => $c['fc'], 'tc' => $c['tc']];
}
/* Timing every player may know now; the result only once betting has closed. */
function derby_public(array $r, float $now): array {
    $o = ['id' => $r['id'], 'openAt' => $r['open_at'], 'closeAt' => $r['close_at'], 'offAt' => $r['off_at']];
    if ($now >= $r['close_at']) {
        $o += ['finishAt' => $r['finish_at'], 'resultAt' => $r['result_at'], 'endAt' => $r['end_at']];
        $res = json_decode($r['result'], true);
        $o['res'] = ['order' => $res['order'], 'margins' => $res['margins'], 'timeMs' => $res['timeMs'], 'seed' => $res['seed'], 'photo' => $res['photo']];
    }
    return $o;
}
function derby_bet_public(array $b): array {
    return ['id' => (int) $b['id'], 'race' => (int) $b['race_id'], 't' => $b['t'], 'sel' => array_map('intval', explode(',', $b['sel'])), 'stake' => (int) $b['stake'], 'cost' => (int) $b['cost'], 'win' => (int) $b['win']];
}

/* ---------- rounds: one open round per player per race ---------- */
function derby_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'derby' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
function derby_type_name(string $t): string { return dm_D()['TYPE_NAMES'][$t] ?? $t; }
/* Settle a finished race's round: every bet on the slip, paid together. */
function derby_finish(array &$u, array $r): array {
    $d = $r['data']; $race = derby_race((int) $d['race']);
    $card = json_decode($race['card'], true); $res = json_decode($race['result'], true);
    $total = 0; $best = null; $out = []; $multi = false;
    foreach ($d['bets'] as $b) {
        $win = dm_settleBet($b, $card, $res);
        $total += $win; $cost = dm_costOf($b);
        q('UPDATE derby_bets SET win = ? WHERE id = ?', [$win, $b['id']]);
        $out[] = ['id' => $b['id'], 'win' => $win];
        if ($win > 0 && ($b['t'] === 'fc' || $b['t'] === 'rfc' || $b['t'] === 'tc')) $multi = true;
        if ($win > 0 && (!$best || $win / $cost > $best['x'])) $best = ['x' => $win / $cost, 'win' => $win, 't' => $b['t'], 'cost' => $cost];
    }
    $f = [];
    if ($multi) $f['bonus'] = 1;
    if ($best) {
        $f['x'] = round($best['x'], 2); $f['bigWin'] = $best['win'];
        if ($best['x'] >= 20 && $best['win'] >= 1000) $f['feedLabel'] = derby_type_name($best['t']) . ' ' . ($best['x'] >= 100 ? number_format($best['x']) : rtrim(rtrim(number_format($best['x'], 1), '0'), '.')) . '×';
    }
    round_close($u, $r, $total, $f);
    return ['race' => (int) $d['race'], 'staked' => (int) $r['stake'], 'won' => $total, 'bets' => $out, 'best' => $best];
}
/* Settle the player's rounds whose results are official; returns [settlements, open rounds by race id]. */
function derby_tidy(array &$u, float $now): array {
    $done = []; $open = [];
    foreach (derby_open_rounds($u) as $r) {
        if ($now >= (float) $r['data']['settleAt']) $done[] = derby_finish($u, $r);
        else $open[(int) $r['data']['race']] = $r;
    }
    return [$done, $open];
}
/* Settle a few other players whose races are over (they may have left), without ever waiting on their row lock. */
function derby_settle_others(int $me, float $now): void {
    $mine = $GLOBALS['BATTY_EVENTS'];
    $rows = q("SELECT id, user_id, data FROM rounds WHERE game = 'derby' AND state = 'open' AND user_id <> ? ORDER BY id LIMIT 30", [$me])->fetchAll();
    $n = 0; $tried = [];
    foreach ($rows as $o) {
        $d = json_decode($o['data'], true); $uid = (int) $o['user_id'];
        if (!$d || $now < ($d['settleAt'] ?? INF) + DERBY_SETTLE_GRACE || isset($tried[$uid])) continue;
        $tried[$uid] = true;
        db()->exec('SAVEPOINT derby_other');
        try {
            q('SELECT id FROM users WHERE id = ? FOR UPDATE NOWAIT', [$uid]);
            $u = lock_user($uid);
            derby_tidy($u, $now);
            save_user($u);
            db()->exec('RELEASE SAVEPOINT derby_other');
        } catch (Throwable $e) { db()->exec('ROLLBACK TO SAVEPOINT derby_other'); }
        if (++$n >= 4) break;
    }
    $GLOBALS['BATTY_EVENTS'] = $mine;
}

/* ---------- the poll ---------- */
function derby_state(array &$u, array $in): array {
    $now = microtime(true);
    derby_ensure($now);
    [$settled, ] = derby_tidy($u, $now);
    derby_settle_others((int) $u['id'], $now);
    $now = microtime(true);
    /* the race open for betting, and the one before it while it is running or on show */
    $rows = q('SELECT * FROM derby_races ORDER BY id DESC LIMIT 2')->fetchAll();
    $races = []; $show = [];
    foreach ($rows as $r) { $r = derby_row($r); if ($now < $r['close_at'] || $now < $r['end_at']) $show[] = $r; }
    $show = array_reverse($show);
    $have = is_array($in['have'] ?? null) ? array_map('intval', array_slice($in['have'], 0, 8)) : [];
    $cards = [];
    foreach ($show as $r) { $races[] = derby_public($r, $now); if (!in_array($r['id'], $have, true)) $cards[] = derby_card($r); }
    $ids = array_map(fn($r) => $r['id'], $show) ?: [0];
    $in_ = implode(',', array_fill(0, count($ids), '?'));
    $mine = array_map('derby_bet_public', q("SELECT * FROM derby_bets WHERE user_id = ? AND race_id IN ($in_) ORDER BY id", array_merge([$u['id']], $ids))->fetchAll());
    /* who is here, and what everyone has on these races */
    q('INSERT INTO derby_seen (user_id, at) VALUES (?, ?) ON DUPLICATE KEY UPDATE at = VALUES(at)', [$u['id'], $now]);
    $online = (int) qv('SELECT COUNT(*) FROM derby_seen WHERE at > ?', [$now - 15]);
    $others = [];
    foreach (q("SELECT b.id, b.race_id, b.user_id, b.t, b.sel, b.stake, b.cost, b.win, u.username, u.avatar, u.level FROM derby_bets b JOIN users u ON u.id = b.user_id WHERE b.race_id IN ($in_) AND b.user_id <> ? ORDER BY b.id DESC LIMIT 80", array_merge($ids, [$u['id']]))->fetchAll() as $b) {
        $race = null; foreach ($show as $r) if ($r['id'] === (int) $b['race_id']) $race = $r;
        $pub = derby_bet_public($b);
        if (!$race || $now < $race['result_at']) $pub['win'] = -1;
        $others[] = $pub + ['uid' => (int) $b['user_id'], 'name' => $b['username'], 'avatar' => $b['avatar'], 'level' => (int) $b['level']];
    }
    $out = ['now' => $now, 'races' => $races, 'cards' => $cards, 'mine' => $mine, 'settled' => $settled, 'online' => $online, 'others' => $others];
    $since = (int) ($in['since'] ?? 0);
    $latest = (int) qv('SELECT id FROM derby_races WHERE result_at <= ? ORDER BY id DESC LIMIT 1', [$now]);
    if ($latest > $since) $out['results'] = derby_results(12, $now);
    $out['latest'] = $latest;
    return $out;
}
function derby_results(int $n, float $now): array {
    return array_map(fn($r) => ['id' => (int) $r['id']] + json_decode($r['summary'], true),
        q('SELECT id, summary FROM derby_races WHERE result_at <= ? ORDER BY id DESC LIMIT ' . $n, [$now])->fetchAll());
}

/* ---------- betting ---------- */
function derby_bet(array &$u, array $in): array {
    $now = microtime(true);
    $race = derby_race(in_int($in, 'race', 1, PHP_INT_MAX));
    if (!$race) throw new ApiError('Unknown race.', 404);
    if ($now >= $race['close_at']) throw new ApiError('Betting has closed on that race.', 409);
    $bets = $in['bets'] ?? null;
    if (!is_array($bets) || !$bets || !array_is_list($bets) || count($bets) > 20) throw new ApiError('Bad bet slip.');
    $cost = 0;
    foreach ($bets as $b) { if ($err = dm_checkBet($b)) throw new ApiError($err . '.'); $cost += dm_costOf($b); }
    [, $open] = derby_tidy($u, $now);
    $cur = $open[$race['id']] ?? null;
    $have = $cur ? count($cur['data']['bets']) : 0;
    if ($have + count($bets) > DERBY_MAX_BETS) throw new ApiError('That is the limit of ' . DERBY_MAX_BETS . ' bets on one race.', 409);
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    if ($cur) {
        $rid = (int) $cur['id']; $data = $cur['data'];
        credit($u, -$cost, 'bet', 'derby', $rid); add_wager($u, $cost);
    } else {
        $data = ['race' => $race['id'], 'settleAt' => $race['result_at'], 'bets' => []];
        $rid = round_open($u, 'derby', $cost, $data);
    }
    foreach ($bets as $b) {
        q('INSERT INTO derby_bets (race_id, user_id, round_id, t, sel, stake, cost, created_at) VALUES (?,?,?,?,?,?,?,?)', [$race['id'], $u['id'], $rid, $b['t'], implode(',', $b['sel']), $b['stake'], dm_costOf($b), $now]);
        $data['bets'][] = ['id' => (int) db()->lastInsertId(), 't' => $b['t'], 'sel' => $b['sel'], 'stake' => $b['stake']];
    }
    q('UPDATE rounds SET stake = ?, data = ? WHERE id = ?', [$cur ? (int) $cur['stake'] + $cost : $cost, json_encode($data), $rid]);
    return ['race' => $race['id'], 'mine' => derby_mine($u, $race['id'])];
}
function derby_mine(array $u, int $raceId): array {
    return array_map('derby_bet_public', q('SELECT * FROM derby_bets WHERE user_id = ? AND race_id = ? ORDER BY id', [$u['id'], $raceId])->fetchAll());
}
function derby_cancel(array &$u, array $in): array {
    $now = microtime(true);
    $race = derby_race(in_int($in, 'race', 1, PHP_INT_MAX));
    if (!$race) throw new ApiError('Unknown race.', 404);
    if ($now >= $race['close_at']) throw new ApiError('Too late: the bets are locked.', 409);
    $id = in_int($in, 'id', 1, PHP_INT_MAX);
    [, $open] = derby_tidy($u, $now);
    $cur = $open[$race['id']] ?? null;
    if (!$cur) return ['race' => $race['id'], 'mine' => []];
    $keep = []; $gone = null;
    foreach ($cur['data']['bets'] as $b) { if ($b['id'] === $id && !$gone) $gone = $b; else $keep[] = $b; }
    if ($gone) {
        $cost = dm_costOf($gone);
        credit($u, $cost, 'refund', 'derby', (int) $cur['id'], 'bet cancelled'); $u['wagered'] = max(0, $u['wagered'] - $cost);
        $cur['data']['bets'] = $keep;
        if ($keep) q('UPDATE rounds SET stake = stake - ?, data = ? WHERE id = ?', [$cost, json_encode($cur['data']), $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
        q('DELETE FROM derby_bets WHERE id = ? AND user_id = ?', [$id, $u['id']]);
    }
    return ['race' => $race['id'], 'mine' => derby_mine($u, $race['id'])];
}
/* The form guide: the whole stable. */
function derby_form(): array {
    return array_map(fn($b) => ['id' => $b['id'], 'name' => $b['name'], 'silks' => $b['silks'], 'rating' => $b['rating'], 'form' => $b['form'], 'runs' => $b['runs'], 'wins' => $b['wins'], 'hist' => $b['hist']], derby_roster());
}
/* The results board, plus the player's own recent bets. */
function derby_history(array $u): array {
    $now = microtime(true);
    $bets = q('SELECT b.*, r.summary FROM derby_bets b JOIN derby_races r ON r.id = b.race_id WHERE b.user_id = ? AND b.win >= 0 ORDER BY b.id DESC LIMIT 40', [$u['id']])->fetchAll();
    $mine = array_map(function ($b) { $s = json_decode($b['summary'], true); return derby_bet_public($b) + ['raceName' => $s['name'], 'offAt' => $s['offAt']]; }, $bets);
    return ['results' => derby_results(40, $now), 'bets' => $mine];
}

function play_derby(array &$u, string $op, array $in): array {
    switch ($op) {
        case 'state': return derby_state($u, $in);
        case 'bet': return derby_bet($u, $in);
        case 'cancel': return derby_cancel($u, $in);
        case 'form': return ['bats' => derby_form()];
        case 'history': return derby_history($u);
    }
    throw new ApiError('Unknown action.');
}
