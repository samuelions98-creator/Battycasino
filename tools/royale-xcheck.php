<?php
/* PHP half of tools/royale-xcheck.js: same seeded rounds through lib/games/royale.php. php tools/royale-xcheck.php N seed */
define('BATTY', 1);
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/royale.php';
$N = (int) ($argv[1] ?? 20000); $seed = (int) ($argv[2] ?? 777);
$rng = batty_mulberry($seed);
$keys = array_keys(ry_spots()); $nk = count($keys);
/* same greedy as maxWin() in the JS */
$best = 0;
for ($n = 0; $n <= 36; $n++) {
    $ks = array_values(array_filter($keys, fn($k) => in_array($n, ry_spots()[$k], true)));
    usort($ks, fn($a, $b) => count(ry_spots()[$a]) <=> count(ry_spots()[$b]));
    $room = RY_TABLE_MAX; $win = 0;
    foreach ($ks as $k) { $s = min(ry_spot_max($k), $room); $room -= $s; $win += intdiv($s * 36, count(ry_spots()[$k])); if (!$room) break; }
    $best = max($best, $win);
}
$out = [];
for ($i = 0; $i < $N; $i++) {
    $bets = []; $m = 1 + rfloor($rng, 6);
    for ($j = 0; $j < $m; $j++) { $k = $keys[rfloor($rng, $nk)]; $bets[$k] = RY_UNIT * (2 + rfloor($rng, 300)); }
    if ($rng() < 0.03) $bets['bogus'] = 2000;
    if ($rng() < 0.03) $bets['n17'] = 2500;
    $n = ry_draw($rng); $s = ry_settle($bets, $n);
    $by = []; foreach ((array) $s['bySpot'] as $k => $v) $by[] = [(string) $k, $v];
    usort($by, fn($a, $b) => strcmp($a[0], $b[0]));
    $out[] = ['v' => ry_validate($bets), 'n' => $n, 't' => $s['total'], 'by' => $by];
}
echo json_encode(['spots' => $keys, 'maxWin' => $best, 'rounds' => $out]);
