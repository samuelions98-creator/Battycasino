<?php
/* Batty Circus parity check, PHP side. Run by tools/circus-xcheck.js: php tools/circus-xcheck.php N
   Plays N seeded rounds through lib/games/circus.php with batty_mulberry and prints one canonical JSON line per state. */
define('BATTY', 1);
class ApiError extends Exception { public $status; public function __construct(string $m, int $s = 400) { parent::__construct($m); $this->status = $s; } }
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/circus.php';
function canon($v) {
    if (is_array($v)) {
        if ($v === [] || array_keys($v) === range(0, count($v) - 1)) return '[' . implode(',', array_map('canon', $v)) . ']';
        ksort($v, SORT_STRING); $o = [];
        foreach ($v as $k => $x) $o[] = json_encode((string) $k) . ':' . canon($x);
        return '{' . implode(',', $o) . '}';
    }
    return json_encode($v);
}
$N = (int) ($argv[1] ?? 1000);
$modes = [null, null, 'grand', 'spotlight'];
for ($i = 0; $i < $N; $i++) {
    $rng = batty_mulberry(100000 + $i); $prng = batty_mulberry((100000 + $i) ^ 0x2545F491);
    $s = cc_start($rng, $modes[$i % 4]);
    echo $i, ' ', canon($s), "\n";
    $guard = 0;
    while ($s['phase'] !== 'done' && $guard++ < 500) {
        $p = $s['phase'];
        if ($p === 'cannon') { $a = 'fire'; $c = null; }
        elseif ($p === 'decide') { $a = $prng() < 0.5 ? 'retry' : 'collect'; $c = null; }
        elseif ($p === 'fire') { $left = []; for ($t = 0; $t < 12; $t++) if (!in_array($t, $s['act']['picked'], true)) $left[] = $t; $a = 'pick'; $c = $left[(int) floor($prng() * count($left))]; }
        elseif ($p === 'elephant') { $a = 'spin'; $c = null; }
        else { $a = 'pick'; $c = (int) floor($prng() * 3); }
        $s = cc_step($s, $a, $c, $rng);
        echo $i, ' ', canon($s), "\n";
    }
}
