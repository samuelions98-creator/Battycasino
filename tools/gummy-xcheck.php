<?php
/* Gummy Bats parity check, PHP half. Called by tools/gummy-xcheck.js; not for the web.
   php tools/gummy-xcheck.php <firstSeed> <count>  ->  line 1: the tables as JSON; then one JSON outcome per line.
   Round i uses batty_mulberry(firstSeed + i) and mode xc_mode(i) (the same rule as the JS half). */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/gummy.php';

function xc_mode(int $i): string { $k = $i % 10; return $k < 7 ? 'base' : ($k < 9 ? 'buy' : 'super'); }

$first = (int) ($argv[1] ?? 1); $count = (int) ($argv[2] ?? 1000);
echo json_encode(gb_tables()), "\n";
for ($i = 0; $i < $count; $i++) {
    $rng = batty_mulberry($first + $i);
    $mode = xc_mode($i);
    /* every 50th base round is a forced trigger spin (the dev hook path) with 3..7 Moons */
    $o = ($mode === 'base' && $i % 50 === 0) ? gb_triggerSpin($rng, 3 + intdiv($i, 50) % 5, 'base') : gb_play($rng, $mode);
    echo json_encode($o), "\n";
}
