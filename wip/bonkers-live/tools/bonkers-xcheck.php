<?php
/* PHP half of the Bonkers Time parity check. Usage: php tools/bonkers-xcheck.php <rounds> <seed>
   Prints a JSON array of rounds drawn with the seeded mulberry32, each with its timetable and settlement. */
define('BATTY', 1);
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/bonkers.php';
$n = (int) ($argv[1] ?? 1000); $seed = (int) ($argv[2] ?? 1);
$rng = batty_mulberry($seed);
$D = bnk_D();
$bets = ['1' => 10, '2' => 20, '5' => 30, '10' => 40, 'flap' => 50, 'hunt' => 60, 'drop' => 70, 'bonkers' => 80];
$out = [];
for ($i = 0; $i < $n; $i++) {
    $o = bnk_drawRound($rng);
    $picks = ['hunt' => rfloor($rng, $D['HUNT_N']), 'flapper' => rfloor($rng, 3)];
    $out[] = ['o' => $o, 'picks' => $picks, 'settle' => bnk_settle($bets, $o, $picks), 'plan' => bnk_plan($o, 1000000.25 + $i * 61.5)];
}
echo json_encode(['tables' => ['WHEEL' => $D['WHEEL'], 'TS_STRIP' => $D['TS_STRIP'], 'TS' => $D['TS'], 'FLAP' => $D['FLAP'], 'HUNT' => $D['HUNT'], 'DROP' => $D['DROP'], 'BIG' => $D['BIG'], 'CAP' => $D['CAP'], 'TIME' => $D['TIME']], 'rounds' => $out], JSON_PRESERVE_ZERO_FRACTION);
