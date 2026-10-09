<?php
/* Bat Signal Roulette — PHP port of src/games/roulette.math.js. Same rng call order, same results. */
if (!defined('BATTY')) { http_response_code(403); exit; }

function rl_D(): array { static $d = null; if ($d === null) $d = batty_data('roulette'); return $d; }
function rl_pick(array $t, Closure $rng) {
    $total = array_sum($t['weights']); $r = $rng() * $total; $n = count($t['values']);
    for ($i = 0; $i < $n; $i++) { $r -= $t['weights'][$i]; if ($r < 0) return $t['values'][$i]; }
    return $t['values'][$n - 1];
}
function rl_spin(Closure $rng): array {
    $D = rl_D();
    $n = rl_pick($D['LUCKY_COUNT'], $rng);
    $pool = range(0, 36); $lucky = [];
    for ($i = 0; $i < $n; $i++) { $j = $i + rfloor($rng, count($pool) - $i); $t = $pool[$i]; $pool[$i] = $pool[$j]; $pool[$j] = $t; $lucky[] = ['n' => $pool[$i], 'm' => 0]; }
    foreach ($lucky as &$l) $l['m'] = rl_pick($D['LUCKY_MULT'], $rng);
    unset($l);
    $pocket = rfloor($rng, $D['POCKETS']);
    return ['lucky' => $lucky, 'pocket' => $pocket, 'number' => $D['WHEEL'][$pocket]];
}
function rl_payout(string $key, int $stake, array $o): int {
    $D = rl_D(); $b = $D['BETS'][$key] ?? null;
    if (!$b || $stake <= 0) return 0;
    if ($o['number'] === $D['BAT']) return intdiv($stake, 2);
    if (!in_array($o['number'], $b['nums'], true)) return 0;
    if ($b['type'] === 'straight') { foreach ($o['lucky'] as $l) if ($l['n'] === $o['number']) return $stake * ($l['m'] + 1); return $stake * ($D['STRAIGHT_PAYS'] + 1); }
    return (int) round($stake * ($b['pays'] + 1));
}
function rl_settle(array $bets, array $o): array {
    $D = rl_D(); $by = []; $total = 0; $lightning = 0;
    $lucky = false; foreach ($o['lucky'] as $l) if ($l['n'] === $o['number']) $lucky = true;
    foreach ($bets as $k => $s) {
        $p = rl_payout((string) $k, (int) $s, $o);
        if ($p > 0) { $by[$k] = $p; $total += $p; if ($D['BETS'][$k]['type'] === 'straight' && $lucky && $o['number'] !== $D['BAT']) $lightning += $p; }
    }
    return ['total' => $total, 'bySpot' => $by, 'lightning' => $lightning];
}
function rl_validate(array $bets): ?string {
    $D = rl_D(); $total = 0; $n = 0;
    foreach ($bets as $k => $s) {
        $b = $D['BETS'][$k] ?? null;
        if (!$b) return 'Unknown bet';
        if (!is_int($s) || $s <= 0 || $s % 10) return 'Bad chip amount';
        $lim = $b['type'] === 'straight' ? $D['LIMITS']['straight'] : ($b['outside'] ? $D['LIMITS']['outside'] : $D['LIMITS']['inside']);
        if ($s > $lim) return 'That bet is over the table limit';
        $total += $s; $n++;
    }
    if ($n > 200) return 'Too many bets';
    if ($total > $D['LIMITS']['total']) return 'That is over the table limit of ' . $D['LIMITS']['total'];
    return null;
}
