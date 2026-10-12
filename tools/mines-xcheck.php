<?php
/* PHP half of tools/mines-xcheck.js (run that, not this): tables and seeded skull placements from lib/games/mines.php. */
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/mines.php';
$N = (int) ($argv[1] ?? 20000);
$t = []; for ($m = 1; $m <= MN_MAX_MINES; $m++) for ($k = 0; $k <= MN_TILES - $m; $k++) $t[] = mn_mult($m, $k);
echo json_encode($t), "\n";
for ($i = 0; $i < $N; $i++) { $rng = batty_mulberry(1000003 * $i + 5); $m = 1 + (int) floor($rng() * MN_MAX_MINES); echo json_encode([$m, mn_place($rng, $m)]), "\n"; }
