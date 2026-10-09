<?php
/* Night Train cross-check, PHP side. Usage: php tools/nighttrain-xcheck.php <spins> <buys> <seed0>
   Prints one JSON line per round, from the same seeded generator as tools/nighttrain-xcheck.js. */
define('BATTY', 1);
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/nighttrain.php';
$spins = (int) ($argv[1] ?? 20000); $buys = (int) ($argv[2] ?? 5000); $seed0 = (int) ($argv[3] ?? 1);
echo json_encode(['strips' => nt_strips(), 'cfg' => nt_cfg(), 'pay' => NT_PAY, 'lines' => NT_LINES]), "\n";
for ($i = 0; $i < $spins; $i++) echo json_encode(nt_spin(batty_mulberry($seed0 + $i))), "\n";
for ($i = 0; $i < $buys; $i++) echo json_encode(nt_buy(batty_mulberry($seed0 + 1000000 + $i))), "\n";
