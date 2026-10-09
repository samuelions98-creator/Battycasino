<?php
/* PHP half of tools/derby-xcheck.js: prints the md5 of each seeded round's JSON (or one round's JSON with "dump <seed>"). */
define('BATTY', 1);
require __DIR__ . '/../lib/core.php';
require __DIR__ . '/../lib/rng.php';
if (!defined('STAKE_LADDER')) define('STAKE_LADDER', [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000]);
require __DIR__ . '/../lib/games/derby.php';

function xround(int $seed): array {
    $rng = batty_mulberry($seed);
    $roster = dm_makeRoster($rng);
    $exclude = []; $nx = (int) floor($rng() * 9); for ($i = 0; $i < $nx; $i++) $exclude[] = 1 + (int) floor($rng() * 48);
    $race = dm_makeRace($rng, $roster, $exclude);
    $res = dm_runRace($rng, $race);
    $types = ['win', 'ew', 'fc', 'rfc', 'tc']; $T = dm_D()['TYPES'];
    $bets = [];
    for ($i = 0; $i < 6; $i++) {
        $t = $types[(int) floor($rng() * 5)]; $n = $T[$t];
        $sel = []; while (count($sel) < $n) { $x = (int) floor($rng() * 8); if (!in_array($x, $sel, true)) $sel[] = $x; }
        if ($i % 3 === 0) for ($k = 0; $k < $n; $k++) $sel[$k] = $res['order'][$k];
        $b = ['t' => $t, 'sel' => $sel, 'stake' => STAKE_LADDER[(int) floor($rng() * count(STAKE_LADDER))]];
        $bets[] = ['b' => $b, 'err' => dm_checkBet($b), 'win' => dm_settleBet($b, $race, $res)];
    }
    $byId = []; foreach ($roster as $r) $byId[$r['id']] = $r;
    $bats = array_map(fn($r) => $byId[$r['id']], $race['runners']);
    $form = dm_updateForm($bats, $race, $res, $seed, 1700000000 + $seed);
    return ['roster' => array_slice($roster, 0, 3), 'exclude' => $exclude, 'race' => $race, 'res' => $res, 'bets' => $bets, 'form' => $form, 'margins' => array_map('dm_marginStr', $res['margins'])];
}
$enc = fn($x) => json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (($argv[1] ?? '') === 'dump') { echo $enc(xround((int) $argv[2])), "\n"; exit; }
$n = (int) ($argv[1] ?? 20000);
for ($s = 1; $s <= $n; $s++) echo md5($enc(xround($s))), "\n";
