<?php
/* Crimson Vault cross-check, PHP side. Run by tools/vault-xcheck.js:
     php tools/vault-xcheck.php <rounds> <buys> <forced>
   Prints the maths tables and every reel strip, then one JSON line per round:
     <rounds> plain rounds (seed i; a trigger picks vault i % 3),
     <buys>   bought rounds (the 100x buy and the 300x Inside Job alternately, vault i % 3),
     <forced> rounds that spin on one seeded stream until 3+ keys land, then play vault i % 3,
     600 free-spin runs that start a whisker below the max-win cap (every vault, plain and Inside Job), so the cap path runs. */
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/vault.php';

$rounds = (int) ($argv[1] ?? 20000); $buys = (int) ($argv[2] ?? 3000); $forced = (int) ($argv[3] ?? 1500);
echo json_encode(['PAY' => VT_PAY, 'KEY_PAY' => VT_KEY_PAY, 'LINES' => VT_LINES, 'BASE' => VT_BASE, 'FREE' => VT_FREE, 'MODES' => VT_MODES, 'BUY_PRICE' => VT_BUY_PRICE,
    'FEATURE_EV' => VT_FEATURE_EV, 'CAP' => VT_CAP, 'MAX_WIN_X' => VT_MAX_WIN_X, 'STAKES' => VAULT_STAKES, 'MIN_LEVEL' => VAULT_MIN_LEVEL,
    'STRIPS' => vt_strips(), 'FREE_STRIPS' => [vt_free_strips(0), vt_free_strips(1), vt_free_strips(2)]]), "\n";
for ($i = 0; $i < $rounds; $i++) {
    $rng = batty_mulberry(1000003 * $i + 17); $m = $i % 3;
    $o = vt_round($rng, ['pick' => function ($b) use ($m) { return $m; }]);
    echo json_encode(['i' => $i, 'o' => $o, 'bb' => vt_winBB($o['win'], VAULT_STAKES[$i % 7])]), "\n";
}
for ($i = 0; $i < $buys; $i++) {
    $rng = batty_mulberry(0x5eed + 7919 * $i); $m = $i % 3;
    $o = vt_round($rng, ['buy' => intdiv($i, 3) % 2, 'pick' => function ($b) use ($m) { return $m; }]);
    echo json_encode(['b' => $i, 'o' => $o, 'bb' => vt_winBB($o['win'], VAULT_STAKES[$i % 7])]), "\n";
}
for ($i = 0; $i < $forced; $i++) {
    $rng = batty_mulberry(0xc0ffee + 104729 * $i); $tries = 0;
    do { $o = vt_spin($rng); $tries++; } while (!$o['trigger']);
    $b = vt_bonus($rng, $i % 3, ['carried' => $o['pay']]);
    echo json_encode(['f' => $i, 'tries' => $tries, 'o' => $o, 'b' => $b]), "\n";
}
for ($i = 0; $i < 600; $i++) {
    $rng = batty_mulberry(0xcab + 31337 * $i);
    $b = vt_bonus($rng, $i % 3, ['inside' => intdiv($i, 3) % 2 === 1, 'carried' => VT_CAP - 500 - ($i * 97) % 6000]);
    echo json_encode(['c' => $i, 'b' => $b]), "\n";
}
