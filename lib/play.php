<?php
/* Game actions. The server decides every outcome; the browser only animates what it is sent.
   Anything the player chooses mid-round (a bartender, a team, a float) is resolved here, after the choice,
   and hidden values are never sent before it. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const STAKE_LADDER = [20, 40, 100, 200, 400, 1000, 2000, 5000, 10000];

function play(array $in): array {
    $u0 = require_user();
    $game = $in['game'] ?? ''; $op = $in['op'] ?? '';
    if (!in_array($game, BATTY_GAMES, true)) throw new ApiError('Unknown game.');
    $fn = 'play_' . $game;
    if ($game === 'moonshot' && $op === 'state') return moon_state_api($u0);
    if ($game === 'roulette' && $op === 'state') return rl_state_api($u0);
    if ($game === 'batjack' && $op === 'state') return bjt_state_api($u0);
    if ($game === 'bunky' && $op === 'state') return bk_state_api($u0, $in);
    return tx(function () use ($u0, $game, $op, $in, $fn) {
        $u = lock_user((int) $u0['id']);
        $out = $fn($u, $op, $in);
        save_user($u);
        $out['bal'] = $u['balance']; $out['ver'] = $u['ver']; $out['level'] = $u['level']; $out['xp'] = level_progress($u);
        return $out;
    });
}
function level_progress(array $u): float {
    $a = level_floor($u['level']); $b = level_floor($u['level'] + 1);
    return round(max(0, min(1, ($u['wagered'] - $a) / max(1, $b - $a))), 4);
}
function stake_of(array $in, array $ladder): int {
    $s = in_int($in, 'stake', 1, 1000000);
    if (!in_array($s, $ladder, true)) throw new ApiError('That stake is not on offer.');
    return $s;
}
/* Settle every round of this game the player left hanging (closed tab, left mid-bonus). */
function resolve_open(array &$u, string $game): void {
    if ($game === 'batjack') { foreach (bjt_open_rounds($u) as $r) batjack_abandon($u, $r); return; }
    if ($game === 'bookofbats') { bob_settle_open($u); return; }   // a held (gambleable) win is paid, never lost
    if ($game === 'crypt') { cr_settle_open($u); return; }        // held free spins are played and paid, never lost
    if ($game === 'vault') { vault_settle_open($u); return; }        // an unpicked vault is opened at random and paid, never lost
    while ($r = round_get_open($u, $game)) {
        if ($game === 'bunky') { bk_tidy($u, microtime(true)); return; }   // live rounds settle once their result is out (old private-wheel rounds at once)
        elseif ($game === 'fishing') fishing_finish($u, $r, random_int(0, 4));
        elseif ($game === 'moonshot') moon_finish($u, $r, true);
        else q("UPDATE rounds SET state = 'done' WHERE id = ?", [$r['id']]);
    }
}
/* Called on page load: settle anything older than 10 minutes in any game. */
function resolve_stale(int $uid): void {
    $n = (int) qv("SELECT COUNT(*) FROM rounds WHERE user_id = ? AND state = 'open' AND created_at < ?", [$uid, gmdate('Y-m-d H:i:s', time() - 600)]);
    if (!$n) return;
    tx(function () use ($uid) {
        $u = lock_user($uid);
        foreach (['bunky', 'fishing', 'moonshot', 'batjack', 'bookofbats', 'crypt', 'vault'] as $g) resolve_open($u, $g);
        save_user($u);
    });
}

/* ================= Raging Cocks of Olympus 2 ================= */
function play_olympus(array &$u, string $op, array $in): array {
    if ($op !== 'spin') throw new ApiError('Unknown action.');
    $stake = stake_of($in, STAKE_LADDER);
    $unit = intdiv($stake, 20);
    $buy = $in['buy'] ?? null;
    $rng = batty_rng();
    if ($buy !== null) {
        $buy = in_int($in, 'buy', 0, 2);
        $cost = ol_D()['CFG']['buy'][$buy]['price'] * $unit;
        $o = ol_buy($rng, $buy);
    } else { $cost = $stake; $o = ol_spin($rng); }
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    $win = $o['totalWin'] * $unit;
    $f = ['bonus' => $o['bonus'] ? 1 : 0];
    if ($o['bonus']) {
        if (count($o['trigger']['gods']) === 5) $f['pantheon'] = true;
        if ($o['bonus']['jackpots'][3] > 0) { $f['grand'] = true; $f['feedLabel'] = 'Grand jackpot'; }
        elseif ($o['bonus']['jackpots'][2] > 0) $f['feedLabel'] = 'Major jackpot';
        elseif (!isset($f['feedLabel'])) $f['feedLabel'] = '';
        if (count($o['trigger']['gods']) >= 4 && ($f['feedLabel'] ?? '') === '') $f['feedLabel'] = count($o['trigger']['gods']) . '-god Cock Combo';
        if (($f['feedLabel'] ?? '') === '') unset($f['feedLabel']);
    }
    $rid = round_quick($u, 'olympus', $cost, $win, $f);
    return ['o' => $o, 'win' => $win, 'cost' => $cost, 'round' => $rid];
}

/* ================= Fishing Frenzy ================= */
function play_fishing(array &$u, string $op, array $in): array {
    if ($op === 'spin') {
        resolve_open($u, 'fishing');
        $stake = stake_of($in, STAKE_LADDER);
        $buy = !empty($in['buy']);
        $cost = $buy ? ff_D()['BUY_PRICE_X'] * $stake : $stake;
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        $rng = batty_rng();
        $o = $buy ? ff_buy($rng, $stake) : ff_spin($rng, $stake);
        if (!$o['triggered']) {
            $rid = round_quick($u, 'fishing', $cost, $o['win'], []);
            return ['o' => $o, 'round' => $rid, 'win' => $o['win']];
        }
        $rid = round_open($u, 'fishing', $cost, ['o' => $o, 'stake' => $stake]);
        $masked = $o; $masked['perks'] = array_fill(0, count($o['perks']), '?');
        return ['o' => $masked, 'round' => $rid, 'pending' => true];
    }
    if ($op === 'pick') {
        $r = round_get_open($u, 'fishing', in_int($in, 'round', 1, PHP_INT_MAX));
        if (!$r) throw new ApiError('That round has already finished.', 409);
        return fishing_finish($u, $r, in_int($in, 'pick', 0, 4));
    }
    throw new ApiError('Unknown action.');
}
function fishing_finish(array &$u, array $r, int $pick): array {
    $o = $r['data']['o']; $stake = (int) $r['data']['stake'];
    $b = ff_bonus(batty_rng(), $stake, ['spins' => $o['freeSpins'], 'perk' => $o['perks'][$pick], 'carried' => $o['win']]);
    $win = $o['win'] + $b['total'];
    $f = ['bonus' => 1];
    if ($b['maxLevel'] >= 3) { $f['ladder10'] = true; $f['feedLabel'] = 'Fish paying ×10'; }
    round_close($u, $r, $win, $f);
    return ['bonus' => $b, 'perks' => $o['perks'], 'pick' => $pick, 'win' => $win, 'round' => (int) $r['id']];
}

/* ================= Bunky Time ================= */
/* A live show: one shared wheel for the whole casino on a fixed rhythm (the engine is in lib/games/bunky.php).
   'state' is the poll (the fast path in play()), 'bet' replaces the player's chips on the betting round, 'pick' is a
   bartender or team inside a bonus. Rounds left over from the old private wheel still settle (bunky_finish). */
function play_bunky(array &$u, string $op, array $in): array {
    if ($op === 'bet') return bk_bet_op($u, $in);
    if ($op === 'pick') return bk_pick_op($u, $in);
    if ($op === 'devforce') return bk_devforce_op($in);
    throw new ApiError('Unknown action.');
}
/* Feed etiquette: only a genuinely notable win (100x the round's stake or more) gets a label of its own. */
function bunky_facts(array $o, int $mine, int $won, int $staked): array {
    $f = ['bonus' => ($o['kind'] === 'bonus' && $mine > 0) ? 1 : 0];
    if ($o['spot'] === 'vip' && $won > 0) $f['vip'] = true;
    if ($won > 0 && $staked > 0 && $won >= 100 * $staked)
        $f['feedLabel'] = ['bar' => 'The Blood Bar', 'hang' => "Hangin' Alive", 'disco' => 'Belfry Disco', 'vip' => 'VIP Crypt Disco'][$o['spot']] ?? 'Glitterball ' . $o['boost'] . '×';
    return $f;
}
function bunky_finish(array &$u, array $r, int $pick): array {
    $o = $r['data']['o']; $bets = $r['data']['bets'];
    $won = bk_settle($bets, $o, $pick)['total'];
    round_close($u, $r, $won, bunky_facts($o, $bets[$o['spot']] ?? 0, $won, (int) $r['stake']));
    return ['o' => $o, 'won' => $won, 'pick' => $pick, 'round' => (int) $r['id']];
}

/* ================= Plachinko ================= */
function play_plachinko(array &$u, string $op, array $in): array {
    if ($op !== 'drop') throw new ApiError('Unknown action.');
    $D = pl_D();
    $stake = stake_of($in, $D['STAKES']);
    $rows = in_int($in, 'rows', 8, 16); if (!in_array($rows, $D['ROWS'], true)) throw new ApiError('Bad rows.');
    $risk = $in['risk'] ?? ''; if (!in_array($risk, $D['RISKS'], true)) throw new ApiError('Bad risk.');
    $n = in_int($in, 'n', 1, 30);
    $n = min($n, intdiv($u['balance'], $stake));
    if ($n < 1) throw new ApiError('Not enough Batty Bucks.', 402);
    $rng = batty_rng(); $balls = []; $win = 0; $bestX = 0; $bestWin = 0; $bonus = 0; $batty = false; $label = null;
    for ($i = 0; $i < $n; $i++) {
        $o = pl_drop($rng, $rows, $risk);
        $pay = pl_settle($o, $stake);
        $win += $pay;
        if ($pay > $bestWin) { $bestWin = $pay; $bestX = $pay / $stake; }
        if ($o['feature'] && $o['feature']['type'] !== 'tulip') { $bonus++; $label = $o['feature']['type'] === 'batty' ? 'BATTY FEVER' : ($label ?? 'Fever'); }
        if ($o['reel'] && $o['reel']['kind'] === 'batty') $batty = true;
        $balls[] = $o;
    }
    $f = ['rounds' => $n, 'bonus' => $bonus, 'x' => round($bestX, 2), 'bigWin' => $bestWin];
    if ($batty) $f['batty'] = true;
    if ($label && $bestX >= 25) $f['feedLabel'] = $label;
    $rid = round_quick($u, 'plachinko', $stake * $n, $win, $f);
    return ['balls' => $balls, 'n' => $n, 'win' => $win, 'round' => $rid];
}

/* ================= Batty's Moonshot ================= */
function moon_card(array $u): array {
    $c = $u['moon_card'] ? json_decode($u['moon_card'], true) : null;
    return is_array($c) ? $c + ['stamps' => [], 'free' => []] : ['stamps' => [], 'free' => []];
}
function play_moonshot(array &$u, string $op, array $in): array {
    $D = ms_D();
    if ($op === 'card') return ['card' => moon_card($u)];
    if ($op === 'bet') return moon_shared_bet($u, $in);
    if ($op === 'unbet') return moon_shared_unbet($u, $in);
    if (isset($in['flight']) && ($op === 'cash' || $op === 'bail')) return moon_shared_cash($u, $in, $op === 'bail');
    if ($op === 'launch') {
        resolve_open($u, 'moonshot');
        $card = moon_card($u);
        $raw = $in['bets'] ?? null;
        if (!is_array($raw) || !$raw || count($raw) > 2) throw new ApiError('No bets.');
        $bets = []; $cost = 0; $seen = [];
        foreach ($raw as $b) {
            $slot = $b['slot'] ?? ''; if (!in_array($slot, ['A', 'B'], true) || isset($seen[$slot])) throw new ApiError('Bad slot.'); $seen[$slot] = 1;
            $target = (int) ($b['target'] ?? 0); $target = $target > 0 ? ms_clampTarget($target) : 0;
            if (!empty($b['free'])) {
                if ($slot !== 'A' || !$card['free']) throw new ApiError('No free flight on your card.');
                $stake = (int) array_shift($card['free']);
                $bets[] = ['slot' => $slot, 'stake' => $stake, 'insured' => false, 'free' => true, 'target' => $target, 'prem' => 0, 'cashC' => 0, 'paid' => 0];
                continue;
            }
            $stake = in_int($b, 'stake', 1, 1000000); if (!in_array($stake, $D['STAKES'], true)) throw new ApiError('That stake is not on offer.');
            $prem = !empty($b['insured']) ? ms_premium($stake) : 0;
            $cost += $stake + $prem;
            $bets[] = ['slot' => $slot, 'stake' => $stake, 'insured' => $prem > 0, 'free' => false, 'target' => $target, 'prem' => $prem, 'cashC' => 0, 'paid' => 0];
        }
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        $round = ms_drawRound(batty_rng());
        $lift = ($round['blood'] ? 2.3 : 0.95) * (!empty($in['turbo']) ? 0.6 : 1);
        $start = microtime(true) + $lift;
        $u['moon_card'] = json_encode(['stamps' => $card['stamps'], 'free' => $card['free']]);
        $rid = round_open($u, 'moonshot', $cost, ['round' => $round, 'bets' => $bets, 'start' => $start, 'tCrash' => $start + ms_timeAtC($round['crashC'])]);
        return ['round' => $rid, 'blood' => $round['blood'], 'lift' => $lift, 'bets' => array_map(fn($b) => ['slot' => $b['slot'], 'stake' => $b['stake'], 'free' => $b['free'], 'insured' => $b['insured'], 'target' => $b['target'], 'prem' => $b['prem']], $bets), 'card' => moon_card($u)];
    }
    $r = round_get_open($u, 'moonshot', in_int($in, 'round', 1, PHP_INT_MAX));
    if (!$r) {
        /* already settled (for example by an earlier status call): report how it ended */
        $done = q1("SELECT win FROM rounds WHERE id = ? AND user_id = ? AND game = 'moonshot'", [(int) $in['round'], $u['id']]);
        if (!$done) throw new ApiError('Unknown flight.', 404);
        return ['gone' => true, 'card' => moon_card($u)];
    }
    if ($op === 'cash') {
        $slot = $in['slot'] ?? '';
        $claim = in_int($in, 'cents', 0, $D['CAP_C']);
        return moon_cash($u, $r, $slot, $claim);
    }
    if ($op === 'status') return moon_status($u, $r);
    if ($op === 'bail') return moon_finish($u, $r, true);
    throw new ApiError('Unknown action.');
}
/* Pay any auto cash-outs the flight has now passed. */
function moon_autos(array &$u, array &$r, int $nowC): void {
    $changed = false;
    foreach ($r['data']['bets'] as &$b) {
        if (!$b['cashC'] && $b['target'] && $b['target'] <= $nowC && $b['target'] <= $r['data']['round']['crashC']) {
            $b['cashC'] = $b['target']; $b['paid'] = ms_cashValue($b['stake'], $b['cashC'], $r['data']['round']['blood']);
            credit($u, $b['paid'], 'win', 'moonshot', (int) $r['id'], 'auto ' . $b['slot']);
            $changed = true;
        }
    }
    unset($b);
    if ($changed) { round_save_data((int) $r['id'], $r['data']); moon_sync_bets($r); }
}
function moon_live(array $r): int { $n = 0; foreach ($r['data']['bets'] as $b) if (!$b['cashC']) $n++; return $n; }
function moon_cashed(array $r): array { return array_values(array_filter(array_map(fn($b) => $b['cashC'] ? ['slot' => $b['slot'], 'cashC' => $b['cashC'], 'paid' => $b['paid']] : null, $r['data']['bets']))); }
function moon_status(array &$u, array $r): array {
    $now = microtime(true); $d = $r['data'];
    if ($now >= $d['tCrash']) return moon_finish($u, $r, false);
    $el = $now - $d['start'];
    $c = $el > 0 ? ms_centsAt($el) : 100;
    moon_autos($u, $r, $c);
    if (moon_live($r) === 0 && empty($d['shared'])) return moon_finish($u, $r, false);
    return ['flying' => true, 'safeC' => $c, 'el' => round($el, 3), 'cashed' => moon_cashed($r)];
}
function moon_cash(array &$u, array $r, string $slot, int $claim): array {
    $now = microtime(true); $d = $r['data'];
    if ($now >= $d['tCrash']) return moon_finish($u, $r, false) + ['late' => true];
    $el = $now - $d['start'];
    if ($el <= 0) throw new ApiError('Not off the ground yet.', 409);
    $serverC = ms_centsAt($el);
    moon_autos($u, $r, $serverC);
    $min = ms_D()['MIN_CASH_C'];
    $cents = min(max($claim, $min), $serverC);
    if ($cents < $min || $cents >= $d['round']['crashC']) return moon_status($u, $r);
    foreach ($r['data']['bets'] as &$b) {
        if ($b['slot'] !== $slot || $b['cashC']) continue;
        $b['cashC'] = $cents; $b['paid'] = ms_cashValue($b['stake'], $cents, $d['round']['blood']);
        credit($u, $b['paid'], 'win', 'moonshot', (int) $r['id'], 'cash ' . $slot);
    }
    unset($b);
    round_save_data((int) $r['id'], $r['data']);
    moon_sync_bets($r);
    if (moon_live($r) === 0 && empty($d['shared'])) return moon_finish($u, $r, false);
    return ['flying' => true, 'safeC' => $serverC, 'cashed' => moon_cashed($r)];
}
/* Close the flight. $bail: the player left, so anything still aboard cashes out at this instant if it can. */
function moon_finish(array &$u, array $r, bool $bail): array {
    $d = $r['data']; $round = $d['round']; $now = microtime(true);
    if ($bail && $now < $d['tCrash']) {
        $el = $now - $d['start']; $c = $el > 0 ? ms_centsAt($el) : 100;
        moon_autos($u, $r, $c);
        $min = ms_D()['MIN_CASH_C'];
        if ($c >= $min && $c < $round['crashC']) foreach ($r['data']['bets'] as &$b) if (!$b['cashC']) {
            $b['cashC'] = $c; $b['paid'] = ms_cashValue($b['stake'], $c, $round['blood']);
            credit($u, $b['paid'], 'win', 'moonshot', (int) $r['id'], 'bail ' . $b['slot']);
        }
        unset($b);
    }
    $bets = $r['data']['bets'];
    /* auto targets the flight reached (or the ceiling) */
    foreach ($bets as &$b) if (!$b['cashC'] && $b['target']) { $cc = ms_autoCashC($round, $b['target']); if ($cc) $b['cashC'] = $cc; }
    unset($b);
    $already = 0; foreach ($bets as $b) $already += $b['paid'];
    $card = moon_card($u); $card['last'] = null;
    $total = ms_settleRound($round, $bets, $card);
    $u['moon_card'] = json_encode(['stamps' => $card['stamps'], 'free' => $card['free']]);
    $best = 0; $bestC = 0; foreach ($bets as $b) { if ($b['win'] > $best) $best = $b['win']; if ($b['cashC'] > $bestC && !$b['bust']) $bestC = $b['cashC']; }
    $stake = (int) $r['stake'];
    $f = ['bonus' => $round['blood'] ? 1 : 0, 'x' => $bestC ? round($bestC / 100 * ($round['blood'] ? 1.5 : 1), 2) : 0, 'bigWin' => $best];
    if ($bestC >= 500) $f['moon5'] = true;
    if ($bestC >= 10000) { $f['moon100'] = true; $f['feedLabel'] = 'out at ' . number_format($bestC / 100, 2) . '×'; }
    if (!empty($card['last']['award'])) $f['stamps'] = true;
    round_close($u, $r, $total, $f, $already);
    if (!empty($d['shared'])) { $r['data']['bets'] = $bets; moon_sync_bets($r); }
    return [
        'flight' => $d['flight'] ?? null,
        'crashed' => true, 'crashC' => $round['crashC'], 'blood' => $round['blood'], 'capped' => $round['capped'],
        'bets' => array_map(fn($b) => ['slot' => $b['slot'], 'stake' => $b['stake'], 'free' => $b['free'], 'insured' => $b['insured'], 'prem' => $b['prem'], 'target' => $b['target'], 'cashC' => $b['bust'] ? 0 : $b['cashC'], 'win' => $b['win'], 'insPay' => $b['insPay'], 'bust' => $b['bust']], $bets),
        'total' => $total, 'card' => $card,
    ];
}
