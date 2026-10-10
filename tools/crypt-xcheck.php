<?php
/* Count Batula's Crypt cross-check, PHP side. Run by tools/crypt-xcheck.js:
     php tools/crypt-xcheck.php <rounds> <buys> <forced>
   Prints the maths tables and every reel strip, then one JSON line per round:
     <rounds> plain rounds (seed i; every third with the ante; gambling up to i % 5 times when free spins are won),
     <buys>   bought rounds (gambling up to i % 5 times, so gamble wins and losses and every free-spin path are covered),
     <forced> rounds that spin on one seeded stream until free spins trigger (ante on every other), then play them,
     500 free-spin runs that start a whisker below the max-win cap, so the cap path is exercised. */
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/crypt.php';

$rounds = (int) ($argv[1] ?? 20000); $buys = (int) ($argv[2] ?? 3000); $forced = (int) ($argv[3] ?? 1000);
echo json_encode(['PAY' => CR_PAY, 'HEIGHT_OUTER' => CR_HEIGHT_OUTER, 'HEIGHT_MID' => CR_HEIGHT_MID, 'COMP' => CR_COMP, 'SCATN' => CR_SCATN, 'TOPCOMP' => CR_TOPCOMP, 'STACK' => CR_STACK,
    'GAMBLE_P' => CR_GAMBLE_P, 'FS_EV' => CR_FS_EV, 'MAX_WIN_X' => CR_MAX_WIN_X, 'CAP' => CR_CAP, 'BUY_X' => CR_BUY_X, 'ANTE' => [CR_ANTE_NUM, CR_ANTE_DEN], 'STRIPS' => cr_strips()]), "\n";
$stakes = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];
for ($i = 0; $i < $rounds; $i++) {
    $rng = batty_mulberry(1000003 * $i + 17); $g = $i % 5;
    $o = cr_round($rng, ['ante' => $i % 3 === 0, 'policy' => function ($n, $k) use ($g) { return $k < $g; }]);
    echo json_encode(['i' => $i, 'o' => $o, 'bb' => cr_winBB($o['win'], $stakes[$i % 9])]), "\n";
}
for ($i = 0; $i < $buys; $i++) {
    $rng = batty_mulberry(0x5eed + 7919 * $i); $g = $i % 5;
    $o = cr_round($rng, ['buy' => true, 'policy' => function ($n, $k) use ($g) { return $k < $g; }]);
    echo json_encode(['b' => $i, 'o' => $o, 'bb' => cr_winBB($o['win'], $stakes[$i % 9])]), "\n";
}
for ($i = 0; $i < $forced; $i++) {
    $rng = batty_mulberry(0xc0ffee + 104729 * $i); $tries = 0;
    do { $o = cr_spin($rng, $i % 2 === 1); $tries++; } while (!$o['fs']);
    $fs = cr_freeSpins($rng, $o['fs'], $o['win']);
    echo json_encode(['f' => $i, 'tries' => $tries, 'o' => $o, 'fs' => $fs]), "\n";
}
/* the max-win cap: free spins played as if the round had already won nearly the cap */
for ($i = 0; $i < 500; $i++) {
    $rng = batty_mulberry(0xcab + 31337 * $i);
    $fs = cr_freeSpins($rng, 12 + 4 * ($i % 5), CR_CAP - 500 - ($i * 97) % 6000);
    echo json_encode(['c' => $i, 'fs' => $fs]), "\n";
}
