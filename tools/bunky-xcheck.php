<?php
/* PHP half of the Bunky Time parity check. Usage: php tools/bunky-xcheck.php <rounds> <seed>
   Draws rounds with the seeded mulberry32 exactly as the live show does (outcome, then the rest-angle jitter), and prints
   each with its settlement, timetable, results-strip multiplier, rest angle and what bk_public reveals at sample moments. */
define('BATTY', 1);
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/bunky.php';
$n = (int) ($argv[1] ?? 1000); $seed = (int) ($argv[2] ?? 1);
$rng = batty_mulberry($seed);
$D = bk_D();
$bets = []; foreach ($D['SPOTS'] as $i => $s) $bets[$s] = 10 * ($i + 1);
$out = [];
for ($i = 0; $i < $n; $i++) {
    $o = bk_spin($rng);
    $jit = ($rng() - 0.5) * 0.72;
    $pick = rfloor($rng, 3);
    $open = 1000000.25 + $i * 61.5;
    $tl0 = bk_timeline($o); $tl = [];
    foreach ($tl0 as $k => $v) $tl[$k] = is_array($v) ? array_map(fn($x) => $open + $x, $v) : $open + $v;
    $row = ['id' => $i + 1, 'o' => $o, 'tl' => $tl, 'th0' => 1.5, 'jit' => $jit, 'open_at' => $open, 'close_at' => $tl['close'], 'spin_at' => $tl['spin'],
        'land_at' => $tl['land'], 'end_at' => $tl['end'], 'next_at' => $tl['next']];
    $seen = [];
    foreach ([0.5, 15.2, 22.9, 29.6, 34.0, 41.0, 47.0, 55.0, 70.0, 95.0] as $dt) $seen[] = bk_public($row, $open + $dt);
    $out[] = ['o' => $o, 'pick' => $pick, 'settle' => bk_settle($bets, $o, $pick), 'tl' => $tl0, 'topX' => bk_topX($o), 'rest' => round(bk_restAngle($o['stop'], $jit), 9), 'seen' => $seen];
}
echo json_encode(['tables' => ['WHEEL' => $D['WHEEL'], 'BOOST' => $D['BOOST'], 'BAR' => $D['BAR'], 'HANG' => $D['HANG'], 'DISCO' => $D['DISCO'], 'VIP' => $D['VIP'], 'ODDS' => $D['ODDS'], 'MAX_BONUS_X' => $D['MAX_BONUS_X'], 'SPOT_MAX' => $D['SPOT_MAX'], 'LIVE' => BK_LIVE], 'rounds' => $out], JSON_PRESERVE_ZERO_FRACTION);
