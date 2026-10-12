<?php
/* PHP half of tools/echo-xcheck.js (run that, not this): the same seeded rounds through lib/games/echo.php. */
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/echo.php';
$N = (int) ($argv[1] ?? 20000);
echo json_encode(['MULT' => ec_mults(), 'SURVIVE' => EC_SURVIVE]), "\n";
for ($i = 0; $i < $N; $i++) {
    $rng = batty_mulberry(1000003 * $i + 11);
    $s = ec_start($rng); $log = [$s['seq']];
    $cashAt = 1 + (int) floor($rng() * 12); $skill = $rng();   // the player slips sometimes
    $stake = [20, 100, 1000, 25000, 777760][$i % 5]; $end = null; $win = 0;
    while (true) {
        $taps = $s['seq'];
        if ($rng() < (1 - $skill) * 0.15) $taps[(int) floor($rng() * count($taps))] = ($taps[0] + 1) % 4;
        [$s, $res] = ec_input($s, $taps, $rng);
        $log[] = $res;
        if ($res === 'miss' || $res === 'storm') { $end = $res; $win = 0; break; }
        if ($res === 'top') { $end = 'top'; $win = ec_win($stake, $s['m']); break; }
        if ($s['L'] >= $cashAt) { $end = 'cash'; $win = ec_win($stake, $s['m']); break; }
        $s = ec_next($s, $rng); $log[] = $s['seq'];
    }
    echo json_encode(['i' => $i, 'log' => $log, 'end' => $end, 'win' => $win, 'L' => $s['L']]), "\n";
}
