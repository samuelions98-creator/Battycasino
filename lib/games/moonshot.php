<?php
/* Batty's Moonshot — PHP port of src/games/moonshot.math.js (crash point, money and the Moon Stamps card). */
if (!defined('BATTY')) { http_response_code(403); exit; }

function ms_D(): array { static $d = null; if ($d === null) $d = batty_data('moonshot'); return $d; }
function ms_crashFromU(float $u): int {
    $D = ms_D(); $raw = (int) floor(100 * $D['R'] / (1 - $u));
    return $raw < 100 ? 100 : ($raw > $D['CAP_C'] ? $D['CAP_C'] : $raw);
}
function ms_drawRound(Closure $rng): array {
    $D = ms_D(); $u = $rng(); $v = $rng();
    $c = ms_crashFromU($u);
    return ['crashC' => $c, 'blood' => $v < $D['BLOOD_P'], 'capped' => $c >= $D['CAP_C'], 'instant' => $c <= 100];
}
function ms_multAt(float $t): float { $C = ms_D()['CURVE']; return $t <= 0 ? 1.0 : exp($C['a'] * $t + $C['b'] * $t * $t); }
function ms_centsAt(float $t): int { $c = (int) floor(100 * ms_multAt($t) + 1e-7); $cap = ms_D()['CAP_C']; return $c > $cap ? $cap : $c; }
function ms_timeAtC(int $c): float { $C = ms_D()['CURVE']; $L = log(max(100, $c) / 100); return (-$C['a'] + sqrt($C['a'] * $C['a'] + 4 * $C['b'] * $L)) / (2 * $C['b']); }
function ms_cashValue(int $stake, int $cents, bool $blood): int {
    $D = ms_D();
    return $blood ? (int) round($stake * $cents * $D['BOOST_NUM'] / (100 * $D['BOOST_DEN'])) : (int) round($stake * $cents / 100);
}
function ms_premium(int $stake): int { $I = ms_D()['INS']; return (int) round($stake * $I['num'] / $I['den']); }
function ms_clampTarget(int $c): int { $D = ms_D(); return $c < $D['MIN_CASH_C'] ? $D['MIN_CASH_C'] : ($c > $D['CAP_C'] ? $D['CAP_C'] : $c); }
function ms_autoCashC(array $round, int $target): int {
    if ($target && $target <= $round['crashC']) return $target;
    return $round['capped'] ? ms_D()['CAP_C'] : 0;
}
function ms_newCard(): array { return ['stamps' => [], 'free' => [], 'last' => ['stamped' => false, 'burned' => false, 'award' => 0, 'cancelled' => false]]; }
/* bets: [['stake','insured','free','cashC'], ...] — writes win / insPay / bust into each bet, updates the card, returns total paid. */
function ms_settleRound(array $round, array &$bets, array &$card): int {
    $D = ms_D(); $total = 0; $stampStake = 0; $burned = false;
    foreach ($bets as &$b) {
        $cashC = ($b['cashC'] > 0 && $b['cashC'] <= $round['crashC']) ? $b['cashC'] : 0;
        $b['bust'] = $cashC === 0;
        $b['win'] = $cashC ? ms_cashValue($b['stake'], $cashC, $round['blood']) : 0;
        $b['insPay'] = (!$b['free'] && $b['insured'] && $round['crashC'] < $D['INS']['belowC']) ? $b['stake'] : 0;
        $total += $b['win'] + $b['insPay'];
        if (!$b['free']) {
            if ($b['bust']) $burned = true;
            elseif ($cashC >= $D['STAMP']['needC'] && $b['stake'] > $stampStake) $stampStake = $b['stake'];
        }
    }
    unset($b);
    $last = ['stamped' => $stampStake > 0 && !$burned, 'burned' => $burned && !$stampStake && count($card['stamps']) > 0, 'award' => 0, 'cancelled' => $burned && $stampStake > 0];
    if ($last['stamped']) {
        $card['stamps'][] = $stampStake;
        if (count($card['stamps']) >= $D['STAMP']['size']) { $lo = min($card['stamps']); $card['stamps'] = []; $card['free'][] = $lo; $last['award'] = $lo; }
    } elseif ($last['burned']) array_pop($card['stamps']);
    $card['last'] = $last;
    return $total;
}
