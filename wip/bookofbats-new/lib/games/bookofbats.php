<?php
/* Book of Bats: PHP port of the maths in games/bookofbats/game.js. Same rng call order, same results, proved round by round
   by tools/bookofbats-xcheck.js. Amounts are in LINE UNITS (multiples of the line bet); a win in BB is
   floor(units * stake / lines).

   ops
     spin     {stake, lines 1-10, gamble 0|1}. The spin and all its free spins are drawn in one go through rtp_pick.
              A win the player may gamble (gamble=1, within the limit) is HELD in an open round (round_open): the stake is
              taken, the win is not paid until it is collected. Anything else settles at once (round_quick).
              Any held win left over from before is collected first.
     gamble   {round, choice: red|black|hearts|diamonds|clubs|spades}. The card is drawn here, after the choice.
              A loss closes the round with nothing; a win doubles (colour) or quadruples (suit) the held amount. When no
              further gamble is allowed the amount is collected automatically.
     collect  {round}. Pays the held amount and closes the round.
     state    The held win, if any, so a reloaded page can offer Collect / Gamble again. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const BOB_REELS = 5, BOB_ROWS = 3, BOB_MAX_WIN_X = 5000, BOB_FS_AWARD = 10, BOB_MAX_SPECIALS = 3;
const BOB_GAMBLE_STEPS = 5, BOB_GAMBLE_LIMIT_X = 500;
const BOB_BOOK = 9;
const BOB_PAY = [
    [0, 0, 0, 5, 25, 100],
    [0, 0, 0, 5, 25, 100],
    [0, 0, 0, 5, 25, 100],
    [0, 0, 0, 5, 40, 150],
    [0, 0, 0, 5, 40, 150],
    [0, 0, 5, 30, 100, 750],
    [0, 0, 5, 40, 150, 1000],
    [0, 0, 5, 50, 400, 2000],
    [0, 0, 10, 100, 1000, 5000],
];
const BOB_SCAT = [0, 0, 0, 2, 20, 200];
const BOB_MINEXP = [3, 3, 3, 3, 3, 2, 2, 2, 2];
const BOB_SPECIAL_W = [1, 1, 1, 1, 1, 1, 1, 1, 1];
const BOB_LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 2, 1, 0, 1],
];
const BOB_STRIPS = [
    'base' => [
        [3, 0, 7, 4, 6, 2, 9, 6, 1, 3, 2, 6, 2, 0, 4, 1, 0, 3, 0, 2, 3, 4, 1, 4, 1, 5, 8, 3, 0, 1, 0, 1],
        [0, 4, 2, 1, 7, 4, 1, 7, 3, 0, 4, 0, 4, 0, 6, 1, 3, 1, 2, 0, 2, 9, 8, 0, 2, 3, 2, 1, 5, 3, 4, 3, 1, 4, 1],
        [4, 1, 2, 3, 0, 5, 4, 2, 0, 1, 4, 1, 5, 1, 3, 2, 5, 0, 2, 1, 3, 0, 7, 6, 4, 8, 9, 4, 6, 5, 4, 2, 8, 1, 0, 1, 4, 3],
        [3, 4, 1, 3, 4, 1, 2, 1, 0, 2, 7, 0, 3, 1, 0, 4, 1, 6, 1, 4, 8, 2, 0, 2, 1, 5, 2, 9, 0, 3, 6, 0, 3, 0, 5, 6],
        [1, 2, 1, 3, 0, 3, 4, 2, 5, 6, 1, 2, 0, 7, 3, 0, 6, 3, 1, 4, 9, 0, 4, 3, 2, 0, 5, 1, 7, 4, 8, 0, 1, 2, 3, 2],
    ],
    'fs' => [
        [3, 4, 5, 0, 1, 2, 1, 4, 1, 2, 0, 9, 4, 3, 2, 0, 4, 0, 6, 1, 7, 6, 5, 2, 7, 8, 3, 1, 6, 1, 0, 3, 4, 8],
        [4, 3, 2, 0, 2, 3, 2, 1, 5, 3, 1, 2, 4, 1, 7, 5, 3, 2, 4, 1, 2, 6, 8, 0, 1, 3, 9, 7, 6, 0, 4, 0],
        [1, 2, 7, 1, 3, 4, 5, 0, 4, 3, 4, 0, 1, 3, 2, 0, 5, 2, 8, 4, 7, 4, 3, 9, 6, 2, 4, 0, 1, 3, 0, 6, 5, 2],
        [2, 4, 1, 2, 4, 6, 7, 5, 4, 3, 1, 2, 1, 9, 5, 1, 7, 1, 0, 4, 0, 4, 3, 1, 0, 5, 0, 4, 0, 2, 8, 6, 3, 0],
        [1, 4, 1, 3, 6, 2, 5, 3, 2, 3, 5, 8, 1, 5, 2, 0, 3, 1, 2, 0, 1, 8, 3, 6, 7, 2, 0, 4, 3, 6, 7, 0, 9, 4, 5],
    ],
];
const BOB_SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const BOB_CHOICES = ['red', 'black', 'hearts', 'diamonds', 'clubs', 'spades'];
const BOB_NAMES = ['10', 'J', 'Q', 'K', 'A', 'Scarab', 'Ankh-Bat', 'Pharaoh Bat Queen', 'Indiana Bats', 'Book of Bats'];

/* ---------- maths (mirrors game.js) ---------- */
function bob_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { if ($w[$i] <= 0) continue; $r -= $w[$i]; if ($r < 0) return $i; }
    for ($i = $n - 1; $i >= 0; $i--) if ($w[$i] > 0) return $i;
    return 0;
}
function bob_pickSpecial(Closure $rng, array $have): int {
    $w = BOB_SPECIAL_W;
    foreach ($have as $s) $w[$s] = 0;
    return bob_pickIndex($rng, $w);
}
function bob_window(string $set, array $stops): array {
    $S = BOB_STRIPS[$set]; $g = [];
    for ($r = 0; $r < BOB_REELS; $r++) { $st = $S[$r]; $L = count($st); $g[] = [$st[$stops[$r] % $L], $st[($stops[$r] + 1) % $L], $st[($stops[$r] + 2) % $L]]; }
    return $g;
}
function bob_drawStops(Closure $rng, string $set): array {
    $S = BOB_STRIPS[$set]; $stops = [];
    for ($r = 0; $r < BOB_REELS; $r++) $stops[] = (int) floor($rng() * count($S[$r]));
    return $stops;
}
function bob_evalLines(array $g, int $lines): array {
    $wins = []; $pay = 0;
    for ($l = 0; $l < $lines; $l++) {
        $ln = BOB_LINES[$l];
        $w = 0; while ($w < BOB_REELS && $g[$w][$ln[$w]] === BOB_BOOK) $w++;
        if ($w === BOB_REELS) continue;
        $sym = $g[$w][$ln[$w]];
        $n = $w + 1; while ($n < BOB_REELS && ($g[$n][$ln[$n]] === $sym || $g[$n][$ln[$n]] === BOB_BOOK)) $n++;
        $p = BOB_PAY[$sym][$n];
        if ($p > 0) { $wins[] = ['l' => $l, 's' => $sym, 'n' => $n, 'pay' => $p]; $pay += $p; }
    }
    return ['wins' => $wins, 'pay' => $pay];
}
function bob_books(array $g): array {
    $cells = [];
    for ($r = 0; $r < BOB_REELS; $r++) for ($row = 0; $row < BOB_ROWS; $row++) if ($g[$r][$row] === BOB_BOOK) $cells[] = [$r, $row];
    return $cells;
}
function bob_expansion(array $g, int $s, int $lines): ?array {
    $reels = [];
    for ($r = 0; $r < BOB_REELS; $r++) if ($g[$r][0] === $s || $g[$r][1] === $s || $g[$r][2] === $s) $reels[] = $r;
    if (count($reels) < BOB_MINEXP[$s]) return null;
    return ['s' => $s, 'reels' => $reels, 'n' => count($reels), 'pay' => BOB_PAY[$s][count($reels)] * $lines];
}
function bob_spin(Closure $rng, int $lines): array {
    $cap = BOB_MAX_WIN_X * $lines;
    $stops = bob_drawStops($rng, 'base'); $grid = bob_window('base', $stops);
    $ev = bob_evalLines($grid, $lines); $books = bob_books($grid);
    $scat = BOB_SCAT[count($books)] * $lines;
    $pay = $ev['pay'] + $scat; $capped = false;
    if ($pay >= $cap) { $pay = $cap; $capped = true; }
    $base = ['stops' => $stops, 'grid' => $grid, 'wins' => $ev['wins'], 'books' => $books, 'scat' => $scat, 'pay' => $pay];
    $total = $pay; $fs = null;
    if (count($books) >= 3 && !$capped) {
        $specials = [bob_pickSpecial($rng, [])];
        $spins = []; $left = BOB_FS_AWARD; $fsPay = 0; $played = 0; $retriggers = 0;
        while ($left > 0 && !$capped) {
            $left--; $played++;
            $st = bob_drawStops($rng, 'fs'); $g = bob_window('fs', $st);
            $e = bob_evalLines($g, $lines); $bk = bob_books($g);
            $sc = BOB_SCAT[count($bk)] * $lines;
            $using = $specials;
            $exp = [];
            $p = $e['pay'] + $sc;
            foreach ($using as $s) { $x = bob_expansion($g, $s, $lines); if ($x) { $exp[] = $x; $p += $x['pay']; } }
            $retrig = false; $newSpecial = -1;
            if (count($bk) >= 3) {
                $retrig = true; $retriggers++; $left += BOB_FS_AWARD;
                if (count($specials) < BOB_MAX_SPECIALS) { $newSpecial = bob_pickSpecial($rng, $specials); $specials[] = $newSpecial; }
            }
            if ($total + $p >= $cap) { $p = $cap - $total; $capped = true; }
            $total += $p; $fsPay += $p;
            $spins[] = ['stops' => $st, 'grid' => $g, 'wins' => $e['wins'], 'books' => $bk, 'scat' => $sc, 'specials' => $using, 'exp' => $exp,
                'retrig' => $retrig, 'newSpecial' => $newSpecial, 'pay' => $p, 'total' => $total, 'left' => $capped ? 0 : $left];
        }
        $fs = ['specials' => $specials, 'first' => $specials[0], 'spins' => $spins, 'pay' => $fsPay, 'played' => $played, 'retriggers' => $retriggers];
    }
    return ['lines' => $lines, 'base' => $base, 'fs' => $fs, 'total' => $total, 'capped' => $capped];
}
function bob_winBB(int $units, int $stake, int $lines): int { return intdiv($units * $stake, $lines); }
function bob_gambleMult(string $choice): int { return ($choice === 'red' || $choice === 'black') ? 2 : 4; }
function bob_gambleAllowed(int $amount, int $stake, int $steps, string $choice): bool {
    if ($amount <= 0 || $steps >= BOB_GAMBLE_STEPS) return false;
    return $amount * bob_gambleMult($choice) <= BOB_GAMBLE_LIMIT_X * $stake;
}
function bob_gambleResolve(int $card, string $choice): bool {
    $suit = intdiv($card, 13); $red = $suit < 2;
    if ($choice === 'red') return $red;
    if ($choice === 'black') return !$red;
    return BOB_SUITS[$suit] === $choice;
}
function bob_drawCard(Closure $rng): int { return (int) floor($rng() * 52); }

/* ---------- the server game ---------- */
function bob_facts(array $o, int $stake, int $win): array {
    $f = [];
    if ($o['fs']) {
        $f['bonus'] = 1;
        $sp = $o['fs']['specials'];
        if (in_array(8, $sp, true) && $win >= 100 * $stake) $f['feedLabel'] = 'Indiana Bats expanding';
        elseif ($win >= 100 * $stake) $f['feedLabel'] = 'Free spins: ' . BOB_NAMES[$sp[0]] . ' expanding';
    }
    if ($o['capped']) $f['feedLabel'] = 'Max win: 5,000x';
    return $f;
}
/* what the player may do with a held amount */
function bob_offer(array $d): array {
    $amt = (int) $d['amount']; $stake = (int) $d['stake']; $steps = (int) $d['steps'];
    return ['amount' => $amt, 'steps' => $steps, 'hist' => $d['hist'], 'canColour' => bob_gambleAllowed($amt, $stake, $steps, 'red'), 'canSuit' => bob_gambleAllowed($amt, $stake, $steps, 'hearts'),
        'stepsLeft' => max(0, BOB_GAMBLE_STEPS - $steps), 'limit' => BOB_GAMBLE_LIMIT_X * $stake];
}
function bob_close(array &$u, array $r, int $amount): void {
    $d = $r['data']; $stake = (int) $r['stake'];
    $f = $d['facts'] ?? [];
    $f['x'] = $stake > 0 ? round($amount / $stake, 2) : 0;
    if ((int) $d['steps'] > 0) $f['gambled'] = (int) $d['steps'];
    if ($amount <= 0) unset($f['feedLabel']);
    elseif ((int) $d['steps'] > 0 && $amount >= 50 * $stake && !isset($f['feedLabel'])) $f['feedLabel'] = 'Gambled up ' . (int) $d['steps'] . ' card' . ((int) $d['steps'] > 1 ? 's' : '');
    round_close($u, $r, $amount, $f);
}
/* pay out any held win left from an earlier spin */
function bob_settle_open(array &$u): int {
    $paid = 0;
    while ($r = round_get_open($u, 'bookofbats')) { $amt = (int) ($r['data']['amount'] ?? 0); bob_close($u, $r, $amt); $paid += $amt; }
    return $paid;
}
function play_bookofbats(array &$u, string $op, array $in): array {
    if ($op === 'state') {
        $r = round_get_open($u, 'bookofbats');
        if (!$r) return ['open' => null];
        $d = $r['data'];
        return ['open' => array_merge(bob_offer($d), ['round' => (int) $r['id'], 'stake' => (int) $r['stake'], 'lines' => (int) $d['lines'], 'win' => (int) $d['win'], 'grid' => $d['grid'], 'set' => $d['set'], 'stops' => $d['stops']])];
    }
    if ($op === 'spin') {
        $collected = bob_settle_open($u);
        $stake = stake_of($in, STAKE_LADDER);
        $lines = in_int($in, 'lines', 1, 10);
        $wantGamble = !empty($in['gamble']);
        if ($u['balance'] < $stake) throw new ApiError('Not enough Batty Bucks.', 402);
        $rng = batty_rng();
        /* live balancing: the spin and its free spins are one draw, which rtp_pick may redraw once (lib/rtp.php) */
        $o = rtp_pick('bookofbats', $stake, function () use ($rng, $lines, $stake) {
            $o = bob_spin($rng, $lines);
            return [$o, bob_winBB($o['total'], $stake, $lines)];
        });
        $win = bob_winBB($o['total'], $stake, $lines);
        $f = bob_facts($o, $stake, $win);
        $last = $o['fs'] ? $o['fs']['spins'][count($o['fs']['spins']) - 1] : null;
        if ($win > 0 && $wantGamble && bob_gambleAllowed($win, $stake, 0, 'red')) {
            $d = ['stake' => $stake, 'lines' => $lines, 'win' => $win, 'amount' => $win, 'steps' => 0, 'hist' => [], 'facts' => $f,
                'set' => $last ? 'fs' : 'base', 'stops' => $last ? $last['stops'] : $o['base']['stops'], 'grid' => $last ? $last['grid'] : $o['base']['grid']];
            $rid = round_open($u, 'bookofbats', $stake, $d);
            return ['o' => $o, 'win' => $win, 'cost' => $stake, 'round' => $rid, 'held' => true, 'offer' => bob_offer($d), 'collected' => $collected];
        }
        $rid = round_quick($u, 'bookofbats', $stake, $win, $f);
        return ['o' => $o, 'win' => $win, 'cost' => $stake, 'round' => $rid, 'held' => false, 'collected' => $collected];
    }
    if ($op === 'gamble' || $op === 'collect') {
        $r = round_get_open($u, 'bookofbats', in_int($in, 'round', 1, PHP_INT_MAX));
        if (!$r) throw new ApiError('That win has already been collected.', 409);
        $d = $r['data']; $stake = (int) $r['stake'];
        if ($op === 'collect') {
            $amt = (int) $d['amount'];
            bob_close($u, $r, $amt);
            return ['done' => true, 'amount' => $amt, 'round' => (int) $r['id']];
        }
        $choice = $in['choice'] ?? '';
        if (!is_string($choice) || !in_array($choice, BOB_CHOICES, true)) throw new ApiError('Pick red, black or a suit.');
        if (!bob_gambleAllowed((int) $d['amount'], $stake, (int) $d['steps'], $choice)) throw new ApiError('That gamble is over the gamble limit.', 409);
        /* the card is drawn now, after the choice */
        $card = bob_drawCard(batty_rng());
        $won = bob_gambleResolve($card, $choice);
        $d['steps'] = (int) $d['steps'] + 1;
        $d['hist'][] = $card;
        if (count($d['hist']) > 8) $d['hist'] = array_slice($d['hist'], -8);
        if (!$won) {
            $d['amount'] = 0;
            $r['data'] = $d;
            bob_close($u, $r, 0);
            return ['card' => $card, 'won' => false, 'done' => true, 'amount' => 0, 'round' => (int) $r['id'], 'offer' => bob_offer($d)];
        }
        $d['amount'] = (int) $d['amount'] * bob_gambleMult($choice);
        $offer = bob_offer($d);
        $r['data'] = $d;
        if (!$offer['canColour']) {   /* nothing more may be gambled: collect it */
            bob_close($u, $r, (int) $d['amount']);
            return ['card' => $card, 'won' => true, 'done' => true, 'amount' => (int) $d['amount'], 'round' => (int) $r['id'], 'offer' => $offer];
        }
        round_save_data((int) $r['id'], $d);
        return ['card' => $card, 'won' => true, 'done' => false, 'amount' => (int) $d['amount'], 'round' => (int) $r['id'], 'offer' => $offer];
    }
    throw new ApiError('Unknown action.');
}
