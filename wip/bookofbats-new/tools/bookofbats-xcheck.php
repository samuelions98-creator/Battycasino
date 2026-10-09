<?php
/* Book of Bats cross-check, PHP side. Run by tools/bookofbats-xcheck.js:
     php tools/bookofbats-xcheck.php <rounds> <features>
   Prints the maths tables, then one JSON line per round: <rounds> plain rounds (seed i, lines 1 + i % 10), then <features>
   rounds that each spin on the same seeded stream until free spins trigger, then gamble cards and verdicts. */
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/bookofbats.php';

$rounds = (int) ($argv[1] ?? 20000); $features = (int) ($argv[2] ?? 2000);
echo json_encode(['PAY' => BOB_PAY, 'SCAT' => BOB_SCAT, 'MINEXP' => BOB_MINEXP, 'SPECIAL_W' => BOB_SPECIAL_W, 'LINES' => BOB_LINES, 'STRIPS' => BOB_STRIPS,
    'MAX_WIN_X' => BOB_MAX_WIN_X, 'FS_AWARD' => BOB_FS_AWARD, 'MAX_SPECIALS' => BOB_MAX_SPECIALS, 'GAMBLE_STEPS' => BOB_GAMBLE_STEPS, 'GAMBLE_LIMIT_X' => BOB_GAMBLE_LIMIT_X]), "\n";
$stakes = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];
for ($i = 0; $i < $rounds; $i++) {
    $rng = batty_mulberry(1000003 * $i + 17);
    $lines = 1 + $i % 10; $stake = $stakes[$i % 9];
    $o = bob_spin($rng, $lines);
    echo json_encode(['i' => $i, 'o' => $o, 'bb' => bob_winBB($o['total'], $stake, $lines)]), "\n";
}
for ($i = 0; $i < $features; $i++) {
    $rng = batty_mulberry(0x51ab + 7919 * $i);
    $lines = 10 - $i % 10; $n = 0;
    do { $o = bob_spin($rng, $lines); $n++; } while (!$o['fs']);
    echo json_encode(['f' => $i, 'tries' => $n, 'o' => $o]), "\n";
}
$rng = batty_mulberry(424242);
$g = [];
for ($i = 0; $i < 5000; $i++) {
    $c = bob_drawCard($rng); $row = [$c];
    foreach (BOB_CHOICES as $ch) $row[] = bob_gambleResolve($c, $ch) ? 1 : 0;
    $amt = 1 + (int) floor($rng() * 20000); $stake = $stakes[$i % 9]; $steps = $i % 7;
    foreach (BOB_CHOICES as $ch) $row[] = bob_gambleAllowed($amt, $stake, $steps, $ch) ? 1 : 0;
    $g[] = $row;
}
echo json_encode(['gamble' => $g]), "\n";
