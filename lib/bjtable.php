<?php
/* Bat Jack LIVE: one shared blackjack table on the server's clock (no cron, no websockets; everyone polls).
   A round is created by whichever request arrives after the previous one ends. Common draw: every player gets the
   same first two cards and the same dealer; each plays their own hand (hits, doubles, splits draw from an order of
   the shoe private to that player — see batjack.math.js LIVE TABLE). The shoe is shuffled the moment betting
   closes, through rtp_pick, judged on every bet on the table played with Bat Advice. Nothing about a card leaves the
   server before it is in play: the shared cards after the deal, the hole card at the peek (only a dealer blackjack)
   or when the dealer plays, your own draws as you take them, and other players' draws once the dealer plays. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const BJT_BET_S = 15.0;     // betting window
const BJT_DEAL_S = 4.0;     // the deal, from close to the cards being on the felt
const BJT_INS_S = 7.0;      // insurance window when the dealer shows an ace
const BJT_DECIDE_S = 20.0;  // decisions; the dealer plays early once every player is finished
const BJT_CARD_S = 0.85;    // per dealer card drawn
const BJT_REST_S = 5.0;     // result on show before the next betting window

function bjt_row(array $r): array {
    foreach (['open_at', 'close_at', 'peek_at', 'decide_end', 'dealer_at', 'result_at'] as $k) $r[$k] = $r[$k] === null ? null : (float) $r[$k];
    $r['id'] = (int) $r['id']; $r['seed'] = (int) $r['seed'];
    $r['shoe'] = $r['shoe'] === null ? null : json_decode($r['shoe'], true);
    return $r;
}
function bjt_lock(): void { q("INSERT IGNORE INTO settings (k, v) VALUES ('bjt_lock', '')"); qv("SELECT v FROM settings WHERE k = 'bjt_lock' FOR UPDATE"); }
function bjt_pseed(array $t, int $uid): int { return ($t['seed'] ^ (($uid * 2654435761) & 0xFFFFFFFF)) & 0xFFFFFFFF; }

/* The current round, advanced to where the clock says it is (deal at close, dealer at the deadline, next round). */
function bjt_current(): array {
    $now = microtime(true);
    $t = q1('SELECT * FROM bj_rounds ORDER BY id DESC LIMIT 1');
    if ($t) {
        $t = bjt_row($t);
        $needDeal = $t['shoe'] === null && $now >= $t['close_at'];
        $needDealer = $t['shoe'] !== null && $t['dealer_at'] === null && $now >= $t['decide_end'];
        $needNext = $t['result_at'] !== null && $now >= $t['result_at'] + BJT_REST_S;
        if (!$needDeal && !$needDealer && !$needNext) return $t;
    }
    return tx(function () {
        bjt_lock();
        $now = microtime(true);
        $t = q1('SELECT * FROM bj_rounds ORDER BY id DESC LIMIT 1');
        $t = $t ? bjt_row($t) : null;
        if ($t && $t['shoe'] === null && $now >= $t['close_at']) $t = bjt_deal($t);
        if ($t && $t['shoe'] !== null && $t['dealer_at'] === null && $now >= $t['decide_end']) $t = bjt_dealer($t, $t['decide_end']);
        if (!$t || ($t['result_at'] !== null && $now >= $t['result_at'] + BJT_REST_S)) {
            $open = $t ? max($now, $t['result_at'] + BJT_REST_S) : $now;
            q('INSERT INTO bj_rounds (seed, open_at, close_at) VALUES (?,?,?)', [random_int(1, 0xFFFFFFFF), $open, $open + BJT_BET_S]);
            $t = bjt_row(q1('SELECT * FROM bj_rounds WHERE id = ?', [(int) db()->lastInsertId()]));
            if ($t['id'] % 200 === 0) {
                $old = $now - 3 * 86400;
                q('DELETE b FROM bj_bets b JOIN bj_rounds r ON r.id = b.round_id WHERE r.result_at < ?', [$old]);
                q('DELETE FROM bj_rounds WHERE result_at < ? AND id < ?', [$old, $t['id'] - 1000]);
            }
        }
        return $t;
    });
}
/* Betting has closed: shuffle (live-balanced on everything bet), fix the peek moment, mark who has nothing to decide. */
function bjt_deal(array $t): array {
    $bets = q('SELECT user_id, main, pp, t3 FROM bj_bets WHERE round_id = ?', [$t['id']])->fetchAll();
    $stake = 0; foreach ($bets as $b) $stake += $b['main'] + $b['pp'] + $b['t3'];
    $rng = batty_rng();
    $gen = function () use ($rng, $bets, $t) {
        $shoe = bj_shuffle($rng); $ret = 0;
        foreach ($bets as $b) $ret += bj_liveAutoReturn(bj_liveDeal($shoe, ['main' => (int) $b['main'], 'pp' => (int) $b['pp'], 't3' => (int) $b['t3']], bjt_pseed($t, (int) $b['user_id'])));
        return [$shoe, $ret];
    };
    $shoe = $stake > 0 ? rtp_pick('batjack', $stake, $gen) : bj_shuffle($rng);
    $up = $shoe[1] % 52;
    $peek = $t['close_at'] + BJT_DEAL_S + (bj_val($up) === 1 ? BJT_INS_S : 0);
    q('UPDATE bj_rounds SET shoe = ?, peek_at = ?, decide_end = ? WHERE id = ?', [json_encode($shoe), $peek, $peek + BJT_DECIDE_S, $t['id']]);
    foreach ($bets as $b) {
        $S = bj_liveDeal($shoe, ['main' => (int) $b['main'], 'pp' => (int) $b['pp'], 't3' => (int) $b['t3']], bjt_pseed($t, (int) $b['user_id']));
        $C = $S; bj_livePeek($C);
        if ($C['phase'] !== 'player') q('UPDATE bj_bets SET done = 1 WHERE round_id = ? AND user_id = ?', [$t['id'], $b['user_id']]);
    }
    $t['shoe'] = $shoe; $t['peek_at'] = $peek; $t['decide_end'] = $peek + BJT_DECIDE_S;
    $d = bj_liveDealerCards($shoe);
    $allDone = (int) qv('SELECT COUNT(*) FROM bj_bets WHERE round_id = ? AND done = 0', [$t['id']]) === 0;
    if (bj_natural($d) || $allDone) $t = bjt_dealer($t, $peek);
    return $t;
}
/* fix the moment the dealer plays (and so when the round pays) */
function bjt_dealer(array $t, float $at): array {
    $d = bj_liveDealerCards($t['shoe']);
    $res = $at + 1.0 + BJT_CARD_S * max(0, count($d) - 2) + 1.2;
    q('UPDATE bj_rounds SET dealer_at = ?, result_at = ? WHERE id = ? AND dealer_at IS NULL', [$at, $res, $t['id']]);
    $t['dealer_at'] = $at; $t['result_at'] = $res;
    return $t;
}
function bjt_table(int $id): array { $t = q1('SELECT * FROM bj_rounds WHERE id = ?', [$id]); if (!$t) throw new ApiError('Unknown round.', 404); return bjt_row($t); }

/* the player's state for their open round: built from the shoe on first use, then synced to the clock */
function bjt_S(array $t, array $r, int $uid, float $now): ?array {
    if ($t['shoe'] === null) return null;
    $d = $r['data'];
    if (isset($d['S'])) { $S = $d['S']; $S['shoe'] = $t['shoe']; $S['order'] = bj_liveOrder(bjt_pseed($t, $uid)); }
    else $S = bj_liveDeal($t['shoe'], $d['bet'], bjt_pseed($t, $uid));
    if ($now >= $t['peek_at']) bj_livePeek($S);
    if ($t['dealer_at'] !== null && $now >= $t['dealer_at']) bj_liveFinish($S, false);
    return $S;
}
function bjt_save(array $r, array $S, int $seq): void {
    $d = $r['data']; $s = $S; unset($s['shoe'], $s['order']);
    $d['S'] = $s; $d['seq'] = $seq;
    round_save_data((int) $r['id'], $d);
    $hands = array_map(fn($h) => ['c' => $h['cards'], 'dbl' => $h['dbl']], $S['seats'][0]['hands']);
    q('UPDATE bj_bets SET hands = ?, done = ? WHERE round_id = ? AND user_id = ?', [json_encode($hands), in_array($S['phase'], ['stood', 'done'], true) ? 1 : 0, $d['tr'], $r['user_id']]);
}
function bjt_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'batjack' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
function bjt_finish(array &$u, array $r, array $t): array {
    $S = bjt_S($t, $r, (int) $u['id'], max(microtime(true), $t['result_at']));
    bj_liveFinish($S, false);
    round_close($u, $r, $S['win'], bj_facts($S));
    $hands = array_map(fn($h) => ['c' => $h['cards'], 'dbl' => $h['dbl'], 'res' => $h['res']], $S['seats'][0]['hands']);
    q('UPDATE bj_bets SET win = ?, done = 1, hands = ? WHERE round_id = ? AND user_id = ?', [$S['win'], json_encode($hands), $t['id'], $u['id']]);
    return ['round' => $t['id'], 'won' => $S['win'], 'staked' => (int) $r['stake'], 'v' => bj_view($S)];
}
/* settle this player's finished rounds; return [settlements, open round for table round $tid or null] */
function bjt_tidy(array &$u, ?int $tid, float $now): array {
    $done = []; $cur = null;
    foreach (bjt_open_rounds($u) as $r) {
        $tr = (int) ($r['data']['tr'] ?? 0);
        $t = $tr ? q1('SELECT * FROM bj_rounds WHERE id = ?', [$tr]) : null;
        if (!$t) { q("UPDATE rounds SET state = 'void' WHERE id = ?", [$r['id']]); continue; }
        $t = bjt_row($t);
        if ($t['result_at'] !== null && $now >= $t['result_at']) $done[] = bjt_finish($u, $r, $t);
        elseif ($tr === $tid) $cur = $r;
    }
    return [$done, $cur];
}
/* a round left open (closed tab): the clock decides it. Used by resolve_open/resolve_stale. */
function batjack_abandon(array &$u, array $r): void {
    $tr = (int) ($r['data']['tr'] ?? 0);
    $t = $tr ? q1('SELECT * FROM bj_rounds WHERE id = ?', [$tr]) : null;
    if (!$t) { q("UPDATE rounds SET state = 'void' WHERE id = ?", [$r['id']]); credit($u, (int) $r['stake'], 'refund', 'batjack', (int) $r['id'], 'round lost'); return; }
    $now = microtime(true);
    $t = bjt_row($t);
    if ($t['result_at'] === null) {          // nobody has been at the table since: bring the round up to the clock (we are inside a transaction)
        bjt_lock();
        $t = bjt_table($tr);
        if ($t['shoe'] === null && $now >= $t['close_at']) $t = bjt_deal($t);
        if ($t['shoe'] !== null && $t['dealer_at'] === null && $now >= $t['decide_end']) $t = bjt_dealer($t, $t['decide_end']);
    }
    if ($t['result_at'] !== null && $now >= $t['result_at']) bjt_finish($u, $r, $t);
}
function bjt_public(array $t, float $now): array {
    $o = ['id' => $t['id'], 'openAt' => $t['open_at'], 'closeAt' => $t['close_at']];
    if ($t['shoe'] !== null) {
        $s = $t['shoe'];
        $o += ['peekAt' => $t['peek_at'], 'decideEnd' => $t['decide_end'], 'cards' => [$s[0] % 52, $s[2] % 52], 'up' => $s[1] % 52, 'insurance' => bj_val($s[1] % 52) === 1];
        $d = bj_liveDealerCards($s);
        if ($now >= $t['peek_at'] && bj_natural($d) && in_array(bj_val($d[0]), [1, 10], true)) $o['dealerBJ'] = true;
    }
    if ($t['dealer_at'] !== null) { $o['dealerAt'] = $t['dealer_at']; $o['resultAt'] = $t['result_at']; }
    if ($t['dealer_at'] !== null && $now >= $t['dealer_at']) $o['dealer'] = bj_liveDealerCards($t['shoe']);
    return $o;
}

function bjt_state_api(array $u0): array {
    $t = bjt_current();
    $now = microtime(true);
    $out = tx(function () use ($u0, $t, $now) {
        $u = lock_user((int) $u0['id']);
        [$done, $cur] = bjt_tidy($u, $t['id'], $now);
        $mine = null;
        if ($cur) {
            $S = bjt_S($t, $cur, (int) $u['id'], $now);
            $mine = ['bet' => $cur['data']['bet'], 'seq' => (int) ($cur['data']['seq'] ?? 0), 'v' => $S ? bj_view($S) : null, 'stake' => (int) $cur['stake']];
        }
        save_user($u);
        return ['settled' => $done, 'mine' => $mine, 'bal' => $u['balance'], 'ver' => $u['ver'], 'level' => $u['level'], 'xp' => level_progress($u)];
    });
    /* settle other players' finished rounds after giving them 8 s to collect themselves */
    $ev = $GLOBALS['BATTY_EVENTS'];
    $others = q("SELECT r.id, r.user_id FROM rounds r JOIN bj_rounds t ON t.id = JSON_EXTRACT(r.data, '$.tr') WHERE r.game = 'batjack' AND r.state = 'open' AND r.user_id <> ? AND t.result_at IS NOT NULL AND t.result_at < ? LIMIT 4", [$u0['id'], $now - 8])->fetchAll();
    foreach ($others as $o) {
        try { tx(function () use ($o, $now) { $u = lock_user((int) $o['user_id']); bjt_tidy($u, null, $now); save_user($u); }); } catch (Throwable $e) { /* their next visit */ }
    }
    $GLOBALS['BATTY_EVENTS'] = $ev;
    $showHands = $t['dealer_at'] !== null && $now >= $t['dealer_at'];
    $showWins = $t['result_at'] !== null && $now >= $t['result_at'];
    $players = [];
    foreach (q('SELECT b.user_id, b.seat, b.main, b.pp, b.t3, b.done, b.hands, b.win, u.username, u.avatar, u.level FROM bj_bets b JOIN users u ON u.id = b.user_id WHERE b.round_id = ? ORDER BY b.seat LIMIT 50', [$t['id']])->fetchAll() as $b) {
        $p = ['id' => (int) $b['user_id'], 'name' => $b['username'], 'avatar' => $b['avatar'], 'level' => (int) $b['level'], 'seat' => (int) $b['seat'], 'main' => (int) $b['main'], 'pp' => (int) $b['pp'], 't3' => (int) $b['t3'], 'done' => (bool) $b['done']];
        if ($showHands) $p['hands'] = $b['hands'] ? json_decode($b['hands'], true) : ($t['shoe'] ? [['c' => [$t['shoe'][0] % 52, $t['shoe'][2] % 52], 'dbl' => false]] : []);
        if ($showWins && (int) $b['win'] >= 0) $p['win'] = (int) $b['win'];
        $players[] = $p;
    }
    $hist = [];
    foreach (q('SELECT shoe FROM bj_rounds WHERE result_at IS NOT NULL AND result_at <= ? AND shoe IS NOT NULL ORDER BY id DESC LIMIT 24', [$now])->fetchAll() as $hr) {
        $d = bj_liveDealerCards(json_decode($hr['shoe'], true)); $tt = bj_total($d)['t'];
        $hist[] = bj_natural($d) ? 'BJ' : ($tt > 21 ? ($tt === 22 ? '22' : 'B') : (string) $tt);
    }
    return $out + ['now' => $now, 'round' => bjt_public($t, $now), 'players' => $players, 'hist' => $hist];
}

/* ops: bet {round, main, pp, t3} (full replace, 0 to take it back) · insure {round, take} · act {round, move, seq} */
function play_batjack(array &$u, string $op, array $in): array {
    $now = microtime(true);
    $t = bjt_table(in_int($in, 'round', 1, PHP_INT_MAX));
    if ($op === 'bet') {
        if ($now >= $t['close_at']) throw new ApiError('No more bets: the cards are coming out.', 409);
        $bet = ['main' => $in['main'] ?? 0, 'pp' => $in['pp'] ?? 0, 't3' => $in['t3'] ?? 0];
        $new = 0;
        if ($bet['main'] !== 0 || $bet['pp'] !== 0 || $bet['t3'] !== 0) { if ($err = bj_checkBets([$bet])) throw new ApiError($err); $new = $bet['main'] + $bet['pp'] + $bet['t3']; }
        [, $cur] = bjt_tidy($u, $t['id'], $now);
        $old = $cur ? (int) $cur['stake'] : 0;
        if ($new - $old > $u['balance']) throw new ApiError('Not enough Batty Bucks.', 402);
        if (!$cur && $new > 0) {
            round_open($u, 'batjack', $new, ['tr' => $t['id'], 'bet' => $bet, 'seq' => 0]);
            $seat = 1 + (int) qv('SELECT COALESCE(MAX(seat), 0) FROM bj_bets WHERE round_id = ?', [$t['id']]);
            q('INSERT INTO bj_bets (round_id, user_id, seat, main, pp, t3) VALUES (?,?,?,?,?,?)', [$t['id'], $u['id'], $seat, $bet['main'], $bet['pp'], $bet['t3']]);
        } elseif ($cur) {
            $d = $cur['data']; $d['bet'] = $bet;
            if ($new > $old) { credit($u, -($new - $old), 'bet', 'batjack', (int) $cur['id']); add_wager($u, $new - $old); }
            elseif ($new < $old) { credit($u, $old - $new, 'refund', 'batjack', (int) $cur['id'], 'bet taken back'); $u['wagered'] = max(0, $u['wagered'] - ($old - $new)); }
            if ($new > 0) {
                q('UPDATE rounds SET stake = ?, data = ? WHERE id = ?', [$new, json_encode($d), $cur['id']]);
                q('UPDATE bj_bets SET main = ?, pp = ?, t3 = ? WHERE round_id = ? AND user_id = ?', [$bet['main'], $bet['pp'], $bet['t3'], $t['id'], $u['id']]);
            } else {
                q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
                q('DELETE FROM bj_bets WHERE round_id = ? AND user_id = ?', [$t['id'], $u['id']]);
            }
        }
        return ['round' => $t['id'], 'bet' => $new > 0 ? $bet : null, 'total' => $new];
    }
    if ($op !== 'insure' && $op !== 'act') throw new ApiError('Unknown action.');
    if ($t['shoe'] === null || $now < $t['close_at'] + BJT_DEAL_S - 0.5) throw new ApiError('The cards are not out yet.', 409);
    [, $r] = bjt_tidy($u, $t['id'], $now);
    if (!$r) throw new ApiError('You have no hand in this round.', 409);
    $seq = in_int($in, 'seq', 0, 1000);
    if ($seq !== (int) ($r['data']['seq'] ?? 0)) throw new ApiError('That move was already made.', 409);
    $S = bjt_S($t, $r, (int) $u['id'], $now);
    if ($op === 'insure') {
        if ($now >= $t['peek_at'] || $S['phase'] !== 'insurance') throw new ApiError('No insurance on offer.', 409);
        $take = $in['take'] ?? null;
        if (!is_bool($take)) throw new ApiError('Bad value for take.');
        if ($take) bj_stake_more($u, $r, intdiv($S['seats'][0]['main'], 2), 'insurance');
        bj_liveInsure($S, $take);
    } else {
        if ($now < $t['peek_at'] || ($t['dealer_at'] !== null && $now >= $t['dealer_at']) || $now >= $t['decide_end']) throw new ApiError('Decisions are closed.', 409);
        $a = $in['move'] ?? '';
        if ($S['phase'] !== 'player') throw new ApiError('Your hand is finished.', 409);
        if (!is_string($a) || !in_array($a, bj_legal($S), true)) throw new ApiError('That move is not allowed now.');
        $cost = bj_actionCost($S, $a);
        if ($cost) bj_stake_more($u, $r, $cost, $a);
        if ($err = bj_act($S, $a)) throw new ApiError($err);
    }
    $seq++;
    bjt_save($r, $S, $seq);
    /* everyone finished: the dealer plays now */
    if ($op === 'act' && $t['dealer_at'] === null && (int) qv('SELECT COUNT(*) FROM bj_bets WHERE round_id = ? AND done = 0', [$t['id']]) === 0) {
        bjt_lock();
        $t2 = bjt_table($t['id']);
        if ($t2['dealer_at'] === null) bjt_dealer($t2, max($now + 0.6, $t2['peek_at']));
    }
    return ['round' => $t['id'], 'v' => bj_view($S), 'seq' => $seq, 'stake' => (int) $r['stake']];
}
