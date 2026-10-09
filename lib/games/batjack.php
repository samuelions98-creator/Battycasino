<?php
/* Bat Jack — PHP port of src/games/batjack.math.js (same rng call order, same results; proved by tools/batjack-xcheck.js)
   plus the server game play_batjack(). The whole round (shoe order, hole card) lives in rounds.data on the server;
   the browser only ever receives bj_view(), which never contains the shoe and hides the hole card until the dealer acts. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const BJ_DECKS = 6, BJ_CARDS = 312, BJ_SEATS = 3, BJ_MAX_HANDS = 4;
const BJ_PAY = ['bj' => 1.5, 'batjack' => 6, 'insurance' => 2];
const BJ_PP = ['perfect' => 30, 'coloured' => 10, 'mixed' => 6];
const BJ_T3 = ['suitedTrips' => 100, 'straightFlush' => 40, 'trips' => 30, 'straight' => 9, 'flush' => 6];
const BJ_LIMITS = ['mainMin' => 10, 'mainMax' => 10000, 'sideMax' => 1000, 'step' => 10];

function bj_rank(int $c): int { return $c % 13; }
function bj_suit(int $c): int { return intdiv($c, 13); }
function bj_val(int $c): int { $r = $c % 13; return $r === 0 ? 1 : ($r >= 9 ? 10 : $r + 1); }
function bj_red(int $c): bool { $s = intdiv($c, 13); return $s === 1 || $s === 2; }
function bj_total(array $cards): array {
    $t = 0; $ace = false;
    foreach ($cards as $c) { $v = bj_val($c); $t += $v; if ($v === 1) $ace = true; }
    if ($ace && $t + 10 <= 21) return ['t' => $t + 10, 'soft' => true];
    return ['t' => $t, 'soft' => false];
}
function bj_natural(array $cards): bool { return count($cards) === 2 && bj_total($cards)['t'] === 21; }
function bj_batjack(array $cards): bool {
    return count($cards) === 2 && ((bj_rank($cards[0]) === 0 && bj_rank($cards[1]) === 10) || (bj_rank($cards[1]) === 0 && bj_rank($cards[0]) === 10));
}
/* the whole shoe is shuffled at the deal; a draw takes the next card */
function bj_shuffle(Closure $rng): array {
    $shoe = range(0, BJ_CARDS - 1);
    for ($i = 0; $i < BJ_CARDS - 1; $i++) { $j = $i + (int) floor($rng() * (BJ_CARDS - $i)); $t = $shoe[$i]; $shoe[$i] = $shoe[$j]; $shoe[$j] = $t; }
    return $shoe;
}
function bj_draw(array &$S): int { return (!empty($S['live']) ? $S['shoe'][$S['order'][$S['pos']++]] : $S['shoe'][$S['pos']++]) % 52; }
function bj_ppKind(int $a, int $b): ?string {
    if (bj_rank($a) !== bj_rank($b)) return null;
    if (bj_suit($a) === bj_suit($b)) return 'perfect';
    return bj_red($a) === bj_red($b) ? 'coloured' : 'mixed';
}
function bj_t3Kind(int $a, int $b, int $c): ?string {
    $r = [bj_rank($a), bj_rank($b), bj_rank($c)]; sort($r);
    $flush = bj_suit($a) === bj_suit($b) && bj_suit($b) === bj_suit($c);
    $trips = $r[0] === $r[1] && $r[1] === $r[2];
    $straight = $r[0] !== $r[1] && $r[1] !== $r[2] && ($r[2] - $r[0] === 2 || ($r[0] === 0 && $r[1] === 11 && $r[2] === 12));
    if ($trips && $flush) return 'suitedTrips';
    if ($straight && $flush) return 'straightFlush';
    if ($trips) return 'trips';
    if ($straight) return 'straight';
    if ($flush) return 'flush';
    return null;
}
/* bets from the client: list of 1..3 seats {main, pp, t3}. Strict: integers only, multiples of 10, within limits. */
function bj_checkBets($bets): ?string {
    if (!is_array($bets) || !array_is_list($bets) || count($bets) < 1 || count($bets) > BJ_SEATS) return 'Choose one to three seats.';
    $any = false;
    foreach ($bets as $b) {
        if (!is_array($b)) return 'Bad seat.';
        $m = $b['main'] ?? null; $p = $b['pp'] ?? 0; $t = $b['t3'] ?? 0;
        foreach ([$m, $p, $t] as $v) if (!is_int($v) || $v < 0 || $v % BJ_LIMITS['step']) return 'Bets come in 10 BB chips.';
        if ($m === 0 && ($p || $t)) return 'Side bets need a main bet on the same seat.';
        if ($m && ($m < BJ_LIMITS['mainMin'] || $m > BJ_LIMITS['mainMax'])) return 'Main bets are ' . BJ_LIMITS['mainMin'] . ' to ' . BJ_LIMITS['mainMax'] . ' BB.';
        if ($p > BJ_LIMITS['sideMax'] || $t > BJ_LIMITS['sideMax']) return 'Side bets are up to ' . BJ_LIMITS['sideMax'] . ' BB.';
        if ($m) $any = true;
    }
    return $any ? null : 'Put a bet on at least one seat.';
}
function bj_betCost(array $bets): int { $s = 0; foreach ($bets as $b) $s += $b['main'] + ($b['pp'] ?? 0) + ($b['t3'] ?? 0); return $s; }
function bj_newHand(array $cards, int $bet): array { return ['cards' => $cards, 'bet' => $bet, 'dbl' => false, 'splitAces' => false, 'fromSplit' => false, 'done' => false, 'res' => null, 'win' => 0]; }

function bj_deal(Closure $rng, array $bets): array {
    $S = ['shoe' => bj_shuffle($rng), 'pos' => 0, 'seats' => [], 'dealer' => [], 'phase' => 'player', 'cur' => [0, 0], 'staked' => 0, 'win' => 0, 'insured' => null, 'dealerBJ' => false, 'peeked' => false];
    foreach ($bets as $b) {
        $m = $b['main']; $pp = $m ? ($b['pp'] ?? 0) : 0; $t3 = $m ? ($b['t3'] ?? 0) : 0;
        $S['seats'][] = ['main' => $m, 'pp' => $pp, 't3' => $t3, 'ppKind' => null, 'ppWin' => 0, 't3Kind' => null, 't3Win' => 0, 'ins' => 0, 'insWin' => 0, 'hands' => []];
        $S['staked'] += $m + $pp + $t3;
    }
    $live = []; foreach ($S['seats'] as $i => $st) if ($st['main']) $live[] = $i;
    foreach ($live as $i) $S['seats'][$i]['hands'][] = bj_newHand([bj_draw($S)], $S['seats'][$i]['main']);
    $S['dealer'][] = bj_draw($S);
    foreach ($live as $i) $S['seats'][$i]['hands'][0]['cards'][] = bj_draw($S);
    $S['dealer'][] = bj_draw($S);
    $up = $S['dealer'][0];
    foreach ($live as $i) {
        $st = &$S['seats'][$i]; $c = $st['hands'][0]['cards'];
        if ($st['pp']) { $st['ppKind'] = bj_ppKind($c[0], $c[1]); $st['ppWin'] = $st['ppKind'] ? $st['pp'] * (BJ_PP[$st['ppKind']] + 1) : 0; }
        if ($st['t3']) { $st['t3Kind'] = bj_t3Kind($c[0], $c[1], $up); $st['t3Win'] = $st['t3Kind'] ? $st['t3'] * (BJ_T3[$st['t3Kind']] + 1) : 0; }
        if (bj_natural($c)) $st['hands'][0]['done'] = true;
        unset($st);
    }
    if (bj_val($up) === 1) { $S['phase'] = 'insurance'; return $S; }
    bj_afterPeek($S);
    return $S;
}
function bj_insure(array &$S, bool $take): ?string {
    if ($S['phase'] !== 'insurance') return 'No insurance on offer.';
    $S['insured'] = $take;
    if ($take) foreach ($S['seats'] as &$st) if ($st['main']) { $st['ins'] = intdiv($st['main'], 2); $S['staked'] += $st['ins']; }
    unset($st);
    bj_afterPeek($S);
    return null;
}
function bj_insuranceCost(array $S): int { $s = 0; foreach ($S['seats'] as $st) if ($st['main']) $s += intdiv($st['main'], 2); return $s; }
function bj_afterPeek(array &$S): void {
    $v = bj_val($S['dealer'][0]);
    if ($v === 1 || $v === 10) { $S['peeked'] = true; $S['dealerBJ'] = bj_natural($S['dealer']); }
    if ($S['dealerBJ']) { bj_settle($S); return; }
    $S['phase'] = 'player'; $S['cur'] = [0, -1];
    bj_advance($S);
}
function bj_advance(array &$S): void {
    $si = $S['cur'][0]; $hi = $S['cur'][1] + 1;
    for (; $si < count($S['seats']); $si++, $hi = 0) {
        for (; $hi < count($S['seats'][$si]['hands']); $hi++) {
            $h = &$S['seats'][$si]['hands'][$hi];
            if ($h['done']) { unset($h); continue; }
            if (count($h['cards']) === 1) {
                $h['cards'][] = bj_draw($S);
                if ($h['splitAces'] || bj_total($h['cards'])['t'] === 21) { $h['done'] = true; unset($h); continue; }
            }
            unset($h);
            $S['cur'] = [$si, $hi];
            return;
        }
    }
    if (!empty($S['live'])) { $S['phase'] = 'stood'; return; }
    bj_dealerPlay($S);
}
function bj_legal(array $S): array {
    if ($S['phase'] !== 'player') return [];
    $st = $S['seats'][$S['cur'][0]]; $h = $st['hands'][$S['cur'][1]];
    $out = ['hit', 'stand'];
    if (count($h['cards']) === 2) {
        $out[] = 'double';
        if (bj_val($h['cards'][0]) === bj_val($h['cards'][1]) && count($st['hands']) < BJ_MAX_HANDS && !$h['splitAces']) $out[] = 'split';
    }
    return $out;
}
function bj_actionCost(array $S, string $a): int {
    if ($S['phase'] !== 'player' || ($a !== 'double' && $a !== 'split')) return 0;
    return $S['seats'][$S['cur'][0]]['hands'][$S['cur'][1]]['bet'];
}
function bj_act(array &$S, string $a): ?string {
    if ($S['phase'] !== 'player') return 'Not your turn.';
    if (!in_array($a, bj_legal($S), true)) return 'That move is not allowed now.';
    [$si, $hi] = $S['cur'];
    $h = &$S['seats'][$si]['hands'][$hi];
    if ($a === 'hit') {
        $h['cards'][] = bj_draw($S);
        if (bj_total($h['cards'])['t'] >= 21) $h['done'] = true;
    } elseif ($a === 'stand') $h['done'] = true;
    elseif ($a === 'double') {
        $S['staked'] += $h['bet']; $h['bet'] *= 2; $h['dbl'] = true;
        $h['cards'][] = bj_draw($S); $h['done'] = true;
    } elseif ($a === 'split') {
        $aces = bj_val($h['cards'][0]) === 1;
        $nh = bj_newHand([array_pop($h['cards'])], $h['bet']);
        $nh['fromSplit'] = true; $h['fromSplit'] = true;
        if ($aces) { $nh['splitAces'] = true; $h['splitAces'] = true; }
        $S['staked'] += $h['bet'];
        unset($h);
        array_splice($S['seats'][$si]['hands'], $hi + 1, 0, [$nh]);
        $h = &$S['seats'][$si]['hands'][$hi];
        $h['cards'][] = bj_draw($S);
        if ($aces || bj_total($h['cards'])['t'] === 21) $h['done'] = true;
    }
    $done = $h['done']; unset($h);
    if ($done) bj_advance($S);
    return null;
}
function bj_autoFinish(array &$S): void {
    if ($S['phase'] === 'insurance') bj_insure($S, false);
    $g = 0;
    while ($S['phase'] === 'player' && $g++ < 50) bj_act($S, 'stand');
}
function bj_dealerPlay(array &$S): void {
    $S['phase'] = 'dealer';
    $needed = false;
    foreach ($S['seats'] as $st) foreach ($st['hands'] as $h) {
        $t = bj_total($h['cards'])['t'];
        if ($t <= 21 && !(bj_natural($h['cards']) && !$h['fromSplit'])) $needed = true;
    }
    if ($needed || !empty($S['live'])) { while (bj_total($S['dealer'])['t'] < 17) $S['dealer'][] = !empty($S['live']) ? $S['shoe'][$S['dpos']++] % 52 : bj_draw($S); }
    bj_settle($S);
}
function bj_settle(array &$S): void {
    $d = bj_total($S['dealer'])['t']; $dBJ = $S['dealerBJ'];
    $win = 0;
    foreach ($S['seats'] as &$st) {
        if (!$st['main']) continue;
        $st['insWin'] = $st['ins'] && $dBJ ? $st['ins'] * (BJ_PAY['insurance'] + 1) : 0;
        foreach ($st['hands'] as &$h) {
            $t = bj_total($h['cards'])['t'];
            $nat = bj_natural($h['cards']) && !$h['fromSplit'];
            if ($nat && $dBJ) { $res = 'push'; $w = $h['bet']; }
            elseif ($nat) { $bat = bj_batjack($h['cards']); $res = $bat ? 'batjack' : 'blackjack'; $w = $h['bet'] + ($bat ? $h['bet'] * BJ_PAY['batjack'] : intdiv($h['bet'] * 3, 2)); }
            elseif ($dBJ) { $res = 'lose'; $w = 0; }
            elseif ($t > 21) { $res = 'bust'; $w = 0; }
            elseif ($d === 22) { $res = 'push22'; $w = $h['bet']; }
            elseif ($d > 21 || $t > $d) { $res = 'win'; $w = $h['bet'] * 2; }
            elseif ($t === $d) { $res = 'push'; $w = $h['bet']; }
            else { $res = 'lose'; $w = 0; }
            $h['res'] = $res; $h['win'] = $w; $h['done'] = true; $win += $w;
        }
        unset($h);
        $win += $st['ppWin'] + $st['t3Win'] + $st['insWin'];
    }
    unset($st);
    $S['win'] = $win; $S['phase'] = 'done';
}
function bj_view(array $S): array {
    $show = $S['phase'] === 'done' || $S['phase'] === 'dealer';
    $dc = $show ? $S['dealer'] : [$S['dealer'][0]];
    $dt = bj_total($show ? $S['dealer'] : $dc);
    return [
        'phase' => $S['phase'] === 'dealer' ? 'done' : $S['phase'], 'cur' => $S['phase'] === 'player' ? $S['cur'] : null, 'staked' => $S['staked'], 'win' => $S['phase'] === 'done' ? $S['win'] : 0,
        'dealer' => ['cards' => $dc, 'hole' => !$show, 'total' => $dt['t'], 'soft' => $dt['soft'], 'bj' => $show ? $S['dealerBJ'] : false, 'peeked' => $S['peeked']],
        'insured' => $S['insured'], 'legal' => bj_legal($S), 'insCost' => $S['phase'] === 'insurance' ? bj_insuranceCost($S) : 0,
        'seats' => array_map(fn($st) => ['main' => $st['main'], 'pp' => $st['pp'], 't3' => $st['t3'], 'ppKind' => $st['ppKind'], 'ppWin' => $st['ppWin'], 't3Kind' => $st['t3Kind'], 't3Win' => $st['t3Win'], 'ins' => $st['ins'], 'insWin' => $st['insWin'],
            'hands' => array_map(function ($h) { $t = bj_total($h['cards']); return ['cards' => $h['cards'], 'bet' => $h['bet'], 'dbl' => $h['dbl'], 'splitAces' => $h['splitAces'], 'fromSplit' => $h['fromSplit'], 'done' => $h['done'], 'res' => $h['res'], 'win' => $h['win'], 'total' => $t['t'], 'soft' => $t['soft']]; }, $st['hands'])], $S['seats']),
    ];
}

/* Bat Advice (basic strategy for these rules), identical to STRATEGY in batjack.math.js. Columns: up card 2..10, A. */
const BJ_STRATEGY = [
    'hard' => [4 => 'HHHHHHHHHH', 5 => 'HHHHHHHHHH', 6 => 'HHHHHHHHHH', 7 => 'HHHHHHHHHH', 8 => 'HHHHHHHHHH', 9 => 'HHHDDHHHHH', 10 => 'DDDDDDDHHH', 11 => 'DDDDDDDDHH',
        12 => 'HHHSHHHHHH', 13 => 'HSSSSHHHHH', 14 => 'SSSSSHHHHH', 15 => 'SSSSSHHHHH', 16 => 'SSSSSHHHHH', 17 => 'SSSSSSSSSS', 18 => 'SSSSSSSSSS', 19 => 'SSSSSSSSSS', 20 => 'SSSSSSSSSS', 21 => 'SSSSSSSSSS'],
    'soft' => [12 => 'HHHHHHHHHH', 13 => 'HHHHHHHHHH', 14 => 'HHHHHHHHHH', 15 => 'HHHHHHHHHH', 16 => 'HHHHHHHHHH', 17 => 'HHHDDHHHHH', 18 => 'SSSddSSHHH', 19 => 'SSSSSSSSSS', 20 => 'SSSSSSSSSS', 21 => 'SSSSSSSSSS'],
    'pair' => [1 => 'YYYYYYYYYY', 2 => '---YYY----', 3 => '---YYY----', 4 => '----------', 5 => '----------', 6 => '--YYY-----', 7 => '-YYYYY----', 8 => 'YYYYYYYY-Y', 9 => '--YYY-YY--', 10 => '----------'],
];
function bj_adviseCards(array $cards, int $up, array $lg): string {
    $col = bj_val($up) === 1 ? 9 : bj_val($up) - 2;
    if (in_array('split', $lg, true) && BJ_STRATEGY['pair'][bj_val($cards[0])][$col] === 'Y') return 'split';
    $t = bj_total($cards);
    $row = $t['soft'] ? (BJ_STRATEGY['soft'][$t['t']] ?? null) : (BJ_STRATEGY['hard'][$t['t']] ?? null);
    $c = $row ? $row[$col] : 'S';
    $canD = in_array('double', $lg, true);
    if ($c === 'D') return $canD ? 'double' : 'hit';
    if ($c === 'd') return $canD ? 'double' : 'stand';
    return $c === 'H' ? 'hit' : 'stand';
}
/* the round played out with Bat Advice and no insurance (PHP arrays are values, so $S is already a copy), and its
   return measured against the deal stake (win minus the extra money doubles and splits put in), as in batjack.math.js */
function bj_autoPlay(array $S): array {
    if ($S['phase'] === 'insurance') bj_insure($S, false);
    $g = 0;
    while ($S['phase'] === 'player' && $g++ < 200) {
        $h = $S['seats'][$S['cur'][0]]['hands'][$S['cur'][1]];
        bj_act($S, bj_adviseCards($h['cards'], $S['dealer'][0], bj_legal($S)));
    }
    return $S;
}
function bj_autoReturn(array $S): int { $C = bj_autoPlay($S); return $C['win'] - ($C['staked'] - $S['staked']); }

/* ================= the server game ================= */
/* Extra money a running round takes (double, split, insurance): debit, count it as wagered, add it to the round's stake. */
function bj_stake_more(array &$u, array &$r, int $amt, string $note): void {
    if ($amt <= 0) return;
    if ($u['balance'] < $amt) throw new ApiError('Not enough Batty Bucks.', 402);
    credit($u, -$amt, 'bet', 'batjack', (int) $r['id'], $note);
    add_wager($u, $amt);
    $r['stake'] = (int) $r['stake'] + $amt;
    q('UPDATE rounds SET stake = ? WHERE id = ?', [$r['stake'], $r['id']]);
}
function bj_facts(array $S): array {
    $f = ['bonus' => 0];
    foreach ($S['seats'] as $st) {
        foreach ($st['hands'] as $h) if ($h['res'] === 'batjack') $f['bonus'] = 1;
        if ($st['t3Kind'] === 'suitedTrips') $f['feedLabel'] = '21+3 suited trips';
        elseif ($st['t3Kind'] === 'straightFlush' && !isset($f['feedLabel'])) $f['feedLabel'] = '21+3 straight flush';
        elseif ($st['ppKind'] === 'perfect' && !isset($f['feedLabel'])) $f['feedLabel'] = 'Perfect pair';
    }
    return $f;
}
function bj_reply(array $S, int $rid, int $seq): array { return ['v' => bj_view($S), 'round' => $rid, 'seq' => $seq]; }
/* abandoned round (left the table, closed the tab): no insurance, every remaining hand stands, the dealer plays it out */
/* the original one-player table (kept for reference and the xcheck; online play is the live table in lib/bjtable.php) */
function bj_solo_play(array &$u, string $op, array $in): array {
    if ($op === 'state') {
        $r = round_get_open($u, 'batjack');
        if (!$r) return ['v' => null];
        return bj_reply($r['data']['S'], (int) $r['id'], (int) $r['data']['seq']);
    }
    if ($op === 'deal') {
        resolve_open($u, 'batjack');
        $bets = $in['bets'] ?? null;
        if ($err = bj_checkBets($bets)) throw new ApiError($err);
        $bets = array_map(fn($b) => ['main' => $b['main'], 'pp' => $b['pp'] ?? 0, 't3' => $b['t3'] ?? 0], $bets);
        $cost = bj_betCost($bets);
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        /* live balancing: the whole shoe is fixed at the deal, so the round is judged as Bat Advice would play it */
        $rng = batty_rng();
        $S = rtp_pick('batjack', $cost, function () use ($rng, $bets) { $S = bj_deal($rng, $bets); return [$S, bj_autoReturn($S)]; });
        if ($S['phase'] === 'done') {
            $rid = round_quick($u, 'batjack', $cost, $S['win'], bj_facts($S));
            return bj_reply($S, $rid, 0);
        }
        $rid = round_open($u, 'batjack', $cost, ['S' => $S, 'seq' => 0]);
        return bj_reply($S, $rid, 0);
    }
    if (!in_array($op, ['insure', 'hit', 'stand', 'double', 'split'], true)) throw new ApiError('Unknown action.');
    $r = round_get_open($u, 'batjack', in_int($in, 'round', 1, PHP_INT_MAX));
    if (!$r) throw new ApiError('That hand has already finished.', 409);
    $seq = in_int($in, 'seq', 0, 1000);
    if ($seq !== (int) $r['data']['seq']) throw new ApiError('That move was already made.', 409);
    $S = $r['data']['S'];
    if ($op === 'insure') {
        if ($S['phase'] !== 'insurance') throw new ApiError('No insurance on offer.', 409);
        $take = $in['take'] ?? null;
        if (!is_bool($take)) throw new ApiError('Bad value for take.');
        if ($take) bj_stake_more($u, $r, bj_insuranceCost($S), 'insurance');
        bj_insure($S, $take);
    } else {
        if ($S['phase'] !== 'player') throw new ApiError('Not your turn.', 409);
        if (!in_array($op, bj_legal($S), true)) throw new ApiError('That move is not allowed now.');
        $cost = bj_actionCost($S, $op);
        if ($cost) bj_stake_more($u, $r, $cost, $op);
        if ($err = bj_act($S, $op)) throw new ApiError($err);
    }
    $seq++;
    if ($S['phase'] === 'done') {
        round_close($u, $r, $S['win'], bj_facts($S));
    } else {
        round_save_data((int) $r['id'], ['S' => $S, 'seq' => $seq]);
    }
    return bj_reply($S, (int) $r['id'], $seq);
}

/* ================= LIVE TABLE (common draw) — line for line with batjack.math.js ================= */
const BJ_LIVE_FIRST = 14;
function bj_liveOrder(int $seed): array {
    $r = batty_mulberry($seed); $o = range(BJ_LIVE_FIRST, BJ_CARDS - 1); $n = count($o);
    for ($i = 0; $i < $n - 1; $i++) { $j = $i + (int) floor($r() * ($n - $i)); $t = $o[$i]; $o[$i] = $o[$j]; $o[$j] = $t; }
    return $o;
}
function bj_liveDeal(array $shoe, array $bet, int $seed): array {
    $S = ['live' => true, 'shoe' => $shoe, 'order' => bj_liveOrder($seed), 'pos' => 0, 'dpos' => 4, 'seats' => [], 'dealer' => [$shoe[1] % 52, $shoe[3] % 52], 'phase' => 'peek', 'cur' => [0, 0], 'staked' => 0, 'win' => 0, 'insured' => null, 'dealerBJ' => false, 'peeked' => false];
    $m = $bet['main']; $pp = $bet['pp'] ?? 0; $t3 = $bet['t3'] ?? 0;
    $st = ['main' => $m, 'pp' => $pp, 't3' => $t3, 'ppKind' => null, 'ppWin' => 0, 't3Kind' => null, 't3Win' => 0, 'ins' => 0, 'insWin' => 0, 'hands' => [bj_newHand([$shoe[0] % 52, $shoe[2] % 52], $m)]];
    $c = $st['hands'][0]['cards']; $up = $S['dealer'][0];
    if ($pp) { $st['ppKind'] = bj_ppKind($c[0], $c[1]); $st['ppWin'] = $st['ppKind'] ? $pp * (BJ_PP[$st['ppKind']] + 1) : 0; }
    if ($t3) { $st['t3Kind'] = bj_t3Kind($c[0], $c[1], $up); $st['t3Win'] = $st['t3Kind'] ? $t3 * (BJ_T3[$st['t3Kind']] + 1) : 0; }
    if (bj_natural($c)) $st['hands'][0]['done'] = true;
    $S['seats'][] = $st; $S['staked'] = $m + $pp + $t3;
    if (bj_val($up) === 1) $S['phase'] = 'insurance';
    return $S;
}
function bj_liveInsure(array &$S, bool $take): ?string {
    if ($S['phase'] !== 'insurance') return 'No insurance on offer.';
    $S['insured'] = $take;
    if ($take) { $S['seats'][0]['ins'] = intdiv($S['seats'][0]['main'], 2); $S['staked'] += $S['seats'][0]['ins']; }
    $S['phase'] = 'peek';
    return null;
}
function bj_livePeek(array &$S): void {
    if ($S['phase'] === 'insurance') $S['insured'] = false;
    if ($S['phase'] === 'insurance' || $S['phase'] === 'peek') bj_afterPeek($S);
}
function bj_liveFinish(array &$S, bool $advice): void {
    bj_livePeek($S);
    $g = 0;
    while ($S['phase'] === 'player' && $g++ < 200) bj_act($S, $advice ? bj_adviseCards(bj_curCards($S), $S['dealer'][0], bj_legal($S)) : 'stand');
    if ($S['phase'] === 'stood') bj_dealerPlay($S);
}
function bj_curCards(array $S): array { return $S['seats'][$S['cur'][0]]['hands'][$S['cur'][1]]['cards']; }
function bj_liveAutoReturn(array $S): int { $C = $S; bj_liveFinish($C, true); return $C['win'] - ($C['staked'] - $S['staked']); }
function bj_liveDealerCards(array $shoe): array {
    $d = [$shoe[1] % 52, $shoe[3] % 52]; $v = bj_val($d[0]);
    if (($v === 1 || $v === 10) && bj_natural($d)) return $d;
    $p = 4; while (bj_total($d)['t'] < 17) $d[] = $shoe[$p++] % 52;
    return $d;
}
