<?php
/* PHP half of tools/baccarat-xcheck.js (run that, not this). Prints the same JSON transcript as the JS. */
define('BATTY', 1);
class ApiError extends Exception {}
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games/baccarat.php';

$hands = (int) ($argv[1] ?? 20000); $seed = (int) ($argv[2] ?? 7);
$rng = batty_mulberry($seed);
const ODD = [1000, 2000, 3000, 4000, 7000, 99000, 100000, 101000, 250000, 2500000, 2501000];
$out = [];
$shoe = bac_newShoe($rng); $shoeNo = 1;
$out[] = ['shoe', $shoeNo, $shoe['cut'], $shoe['pos'], $shoe['burn'], array_slice($shoe['cards'], 0, 12)];
for ($n = 0; $n < $hands; $n++) {
    if ($shoe['pos'] >= $shoe['cut']) { $shoe = bac_newShoe($rng); $shoeNo++; $out[] = ['shoe', $shoeNo, $shoe['cut'], $shoe['pos'], $shoe['burn'], array_slice($shoe['cards'], 0, 12)]; }
    $h = bac_deal($shoe['cards'], $shoe['pos']); $shoe['pos'] = $h['pos'];
    $bets = [];
    foreach (BAC_SPOTS as $k) if ($rng() < 0.45) $bets[$k] = BAC_CHIPS[(int) floor($rng() * count(BAC_CHIPS))] * (1 + (int) floor($rng() * 4));
    $s = bac_settle($bets, $h);
    $F = bac_facts($h['p'], $h['b']);
    $odd = [];
    foreach (BAC_SPOTS as $k) if ($rng() < 0.3) $odd[$k] = ODD[(int) floor($rng() * count(ODD))];
    $out[] = [$n, $h['p'], $h['b'], $h['pt'], $h['bt'], $h['pn'], $h['bn'], $h['res'], $h['pp'], $h['bp'], $h['pos'], bac_dragon($h, 'P'), bac_dragon($h, 'B'), $s['total'],
        array_map(fn($k) => $s['by'][$k] ?? -1, BAC_SPOTS), ($F['res'] === $h['res'] && $F['pt'] === $h['pt'] && $F['bt'] === $h['bt']) ? 1 : 0, bac_check($odd) ?? '', round(bac_resultAfter($h), 3)];
}
echo json_encode($out);
