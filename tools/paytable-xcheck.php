<?php
/* Parity helper for tools/paytable-xcheck.js: plays seeded rounds of Starwing or Bat Bandits through the PHP engine and
   prints one total per round. Usage: php tools/paytable-xcheck.php <starwing|ultraheist> <N> [buy] */
define('BATTY', 1);
require __DIR__ . '/../lib/core.php';
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/' . $argv[1] . '.php';
$n = (int) $argv[2]; $buy = ($argv[3] ?? '') === 'buy'; $out = [];
for ($i = 1; $i <= $n; $i++) {
    $rng = batty_mulberry($i);
    $o = $argv[1] === 'starwing' ? sw_spin($rng) : ($buy ? uh_buy($rng) : uh_spin($rng));
    $out[] = $o['totalWin'] . ($o['capped'] ? 'c' : '');
}
echo implode(',', $out);
