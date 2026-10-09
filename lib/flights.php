<?php
/* Batty's Moonshot shared flights: one flight at a time that every player bets on together.
   There is no cron job: whichever request arrives after a flight has ended (plus a short result beat) creates the next one.
   The crash point is drawn when the flight is created and only ever leaves the server once the flight has crashed. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const MOON_BET_S = 8.0;      // betting window
const MOON_RESULT_S = 4.0;   // result beat after a crash before the next betting window opens

function moon_flight_row(array $f): array {
    foreach (['open_at', 'close_at', 'start_at', 'crash_at'] as $k) $f[$k] = (float) $f[$k];
    $f['id'] = (int) $f['id']; $f['crash_c'] = (int) $f['crash_c']; $f['blood'] = (bool) $f['blood'];
    return $f;
}
/* The flight that is betting, lifting, flying or showing its result right now (created if needed). */
function moon_current(): array {
    $now = microtime(true);
    $f = q1('SELECT * FROM moon_flights ORDER BY id DESC LIMIT 1');
    if ($f && $now < (float) $f['crash_at'] + MOON_RESULT_S) return moon_flight_row($f);
    return tx(function () {
        q("INSERT IGNORE INTO settings (k, v) VALUES ('moon_lock', '')");
        qv("SELECT v FROM settings WHERE k = 'moon_lock' FOR UPDATE");
        $now = microtime(true);
        $f = q1('SELECT * FROM moon_flights ORDER BY id DESC LIMIT 1');
        if ($f && $now < (float) $f['crash_at'] + MOON_RESULT_S) return moon_flight_row($f);
        $round = ms_drawRound(batty_rng());
        $open = $f ? max($now, (float) $f['crash_at'] + MOON_RESULT_S) : $now;
        $close = $open + MOON_BET_S;
        $start = $close + ($round['blood'] ? 2.3 : 0.95);
        $crash = $start + ms_timeAtC($round['crashC']);
        q('INSERT INTO moon_flights (crash_c, blood, open_at, close_at, start_at, crash_at) VALUES (?,?,?,?,?,?)', [$round['crashC'], $round['blood'] ? 1 : 0, $open, $close, $start, $crash]);
        $id = (int) db()->lastInsertId();
        if ($id % 200 === 0) { /* tidy up old flights now and then */
            $old = $now - 7 * 86400;
            q('DELETE b FROM moon_bets b JOIN moon_flights f ON f.id = b.flight_id WHERE f.crash_at < ?', [$old]);
            q('DELETE FROM moon_flights WHERE crash_at < ?', [$old]);
        }
        return moon_flight_row(q1('SELECT * FROM moon_flights WHERE id = ?', [$id]));
    });
}
function moon_flight(int $id): array {
    $f = q1('SELECT * FROM moon_flights WHERE id = ?', [$id]);
    if (!$f) throw new ApiError('Unknown flight.', 404);
    return moon_flight_row($f);
}
/* What every player may know about a flight at this instant. */
function moon_public(array $f, float $now): array {
    $o = ['id' => $f['id'], 'openAt' => $f['open_at'], 'closeAt' => $f['close_at']];
    if ($now >= $f['close_at']) { $o['startAt'] = $f['start_at']; $o['blood'] = $f['blood']; }
    if ($now >= $f['crash_at']) { $o['crashC'] = $f['crash_c']; $o['capped'] = $f['crash_c'] >= ms_D()['CAP_C']; }
    return $o;
}
function moon_sync_bets(array $r): void {
    if (empty($r['data']['shared'])) return;
    foreach ($r['data']['bets'] as $b) q('UPDATE moon_bets SET cash_c = ?, paid = ? WHERE flight_id = ? AND user_id = ? AND slot = ?', [!empty($b['bust']) ? 0 : (int) $b['cashC'], (int) ($b['win'] ?? $b['paid']), $r['data']['flight'], $r['user_id'], $b['slot']]);
}
/* All the player's open Moonshot rounds, oldest first. */
function moon_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'moonshot' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
/* Settle the player's rounds whose flights are over; returns [settlements, the open round for $flightId or null]. */
function moon_tidy(array &$u, ?int $flightId, float $now): array {
    $done = []; $cur = null;
    foreach (moon_open_rounds($u) as $r) {
        if ($flightId !== null && ($r['data']['flight'] ?? null) === $flightId && $now < $r['data']['tCrash']) { $cur = $r; continue; }
        if ($now >= $r['data']['tCrash']) $done[] = moon_finish($u, $r, false);
        else $done[] = moon_finish($u, $r, true); // an older round still in the air (should not happen): cash out now
    }
    return [$done, $cur];
}
function moon_bet_public(array $b): array {
    return ['slot' => $b['slot'], 'stake' => $b['stake'], 'free' => $b['free'], 'insured' => $b['insured'], 'prem' => $b['prem'], 'target' => $b['target'], 'cashC' => $b['cashC'], 'paid' => $b['paid']];
}

/* ---------- the poll every client makes several times a second ---------- */
function moon_state_api(array $u0): array {
    $f = moon_current();
    $now = microtime(true);
    $out = tx(function () use ($u0, $f, $now) {
        $u = lock_user((int) $u0['id']);
        [$done, $cur] = moon_tidy($u, $f['id'], $now);
        if ($cur && $now > $f['start_at']) { moon_autos($u, $cur, ms_centsAt($now - $f['start_at'])); }
        save_user($u);
        return ['settled' => $done, 'mine' => $cur ? array_map('moon_bet_public', $cur['data']['bets']) : [], 'bal' => $u['balance'], 'ver' => $u['ver'], 'level' => $u['level'], 'xp' => level_progress($u), 'card' => moon_card($u)];
    });
    /* settle a few other players whose flights have ended, so the feed and leaderboards stay current */
    $mine = $GLOBALS['BATTY_EVENTS'];
    $others = q("SELECT id, user_id, data FROM rounds WHERE game = 'moonshot' AND state = 'open' AND user_id <> ? ORDER BY id LIMIT 30", [$u0['id']])->fetchAll();
    $n = 0;
    foreach ($others as $o) {
        $d = json_decode($o['data'], true);
        if (!$d || $now < ($d['tCrash'] ?? INF) + 8) continue;   // give the player's own poll 8 s to collect their result first
        try {
            tx(function () use ($o, $now) {
                $u = lock_user((int) $o['user_id']);
                $r = round_get_open($u, 'moonshot', (int) $o['id']);
                if ($r && $now >= $r['data']['tCrash']) { moon_finish($u, $r, false); save_user($u); }
            });
        } catch (Throwable $e) { /* their own next request will settle it */ }
        if (++$n >= 4) break;
    }
    $GLOBALS['BATTY_EVENTS'] = $mine;
    /* who is aboard, and what everyone can see of them */
    $nowC = $now >= $f['crash_at'] ? $f['crash_c'] : ($now > $f['start_at'] ? ms_centsAt($now - $f['start_at']) : 0);
    $players = [];
    foreach (q('SELECT b.user_id, b.slot, b.stake, b.target, b.cash_c, b.free, u.username, u.avatar, u.level FROM moon_bets b JOIN users u ON u.id = b.user_id WHERE b.flight_id = ? ORDER BY b.stake DESC LIMIT 60', [$f['id']])->fetchAll() as $b) {
        $c = (int) $b['cash_c'];
        if (!$c && (int) $b['target'] > 0 && (int) $b['target'] <= $nowC && (int) $b['target'] <= $f['crash_c']) $c = (int) $b['target'];
        $players[] = ['id' => (int) $b['user_id'], 'name' => $b['username'], 'avatar' => $b['avatar'], 'level' => (int) $b['level'], 'slot' => $b['slot'], 'stake' => (int) $b['stake'], 'free' => (bool) $b['free'], 'cashC' => $c];
    }
    $hist = array_map(fn($h) => ['c' => (int) $h['crash_c'], 'blood' => (bool) $h['blood']], q('SELECT crash_c, blood FROM moon_flights WHERE crash_at <= ? ORDER BY id DESC LIMIT 20', [$now])->fetchAll());
    return $out + ['now' => $now, 'flight' => moon_public($f, $now), 'players' => $players, 'hist' => $hist];
}

/* ---------- placing and cancelling bets during the betting window ---------- */
function moon_shared_bet(array &$u, array $in): array {
    $D = ms_D();
    $f = moon_flight(in_int($in, 'flight', 1, PHP_INT_MAX));
    $now = microtime(true);
    if ($now >= $f['close_at']) throw new ApiError('Bets are closed for this flight.', 409);
    [, $cur] = moon_tidy($u, $f['id'], $now);
    $slot = $in['slot'] ?? ''; if (!in_array($slot, ['A', 'B'], true)) throw new ApiError('Bad slot.');
    if ($cur) foreach ($cur['data']['bets'] as $b) if ($b['slot'] === $slot) throw new ApiError('That slot is already aboard.', 409);
    $target = (int) ($in['target'] ?? 0); $target = $target > 0 ? ms_clampTarget($target) : 0;
    $card = moon_card($u);
    if (!empty($in['free'])) {
        if ($slot !== 'A' || !$card['free']) throw new ApiError('No free flight on your card.');
        $stake = (int) array_shift($card['free']); $prem = 0; $cost = 0; $free = true;
    } else {
        $stake = in_int($in, 'stake', 1, 1000000); if (!in_array($stake, $D['STAKES'], true)) throw new ApiError('That stake is not on offer.');
        $prem = !empty($in['insured']) ? ms_premium($stake) : 0; $cost = $stake + $prem; $free = false;
    }
    if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
    $bet = ['slot' => $slot, 'stake' => $stake, 'insured' => $prem > 0, 'free' => $free, 'target' => $target, 'prem' => $prem, 'cashC' => 0, 'paid' => 0];
    $u['moon_card'] = json_encode(['stamps' => $card['stamps'], 'free' => $card['free']]);
    if ($cur) {
        $cur['data']['bets'][] = $bet;
        if ($cost) { credit($u, -$cost, 'bet', 'moonshot', (int) $cur['id'], 'slot ' . $slot); add_wager($u, $cost); }
        q('UPDATE rounds SET stake = stake + ?, data = ? WHERE id = ?', [$cost, json_encode($cur['data']), $cur['id']]);
        $bets = $cur['data']['bets'];
    } else {
        $data = ['shared' => true, 'flight' => $f['id'], 'round' => ['crashC' => $f['crash_c'], 'blood' => $f['blood'], 'capped' => $f['crash_c'] >= $D['CAP_C'], 'instant' => $f['crash_c'] <= 100], 'start' => $f['start_at'], 'tCrash' => $f['crash_at'], 'bets' => [$bet]];
        round_open($u, 'moonshot', $cost, $data);
        $bets = [$bet];
    }
    q('INSERT INTO moon_bets (flight_id, user_id, slot, stake, target, free) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE stake = VALUES(stake), target = VALUES(target), free = VALUES(free), cash_c = 0, paid = 0', [$f['id'], $u['id'], $slot, $stake, $target, $free ? 1 : 0]);
    return ['flight' => $f['id'], 'mine' => array_map('moon_bet_public', $bets), 'card' => moon_card($u)];
}
function moon_shared_unbet(array &$u, array $in): array {
    $f = moon_flight(in_int($in, 'flight', 1, PHP_INT_MAX));
    $now = microtime(true);
    if ($now >= $f['close_at']) throw new ApiError('Too late: the bets are locked.', 409);
    [, $cur] = moon_tidy($u, $f['id'], $now);
    $slot = $in['slot'] ?? '';
    if (!$cur) return ['flight' => $f['id'], 'mine' => [], 'card' => moon_card($u)];
    $keep = []; $gone = null;
    foreach ($cur['data']['bets'] as $b) { if ($b['slot'] === $slot && !$gone) $gone = $b; else $keep[] = $b; }
    if ($gone) {
        $cost = $gone['free'] ? 0 : $gone['stake'] + $gone['prem'];
        if ($cost) { credit($u, $cost, 'refund', 'moonshot', (int) $cur['id'], 'slot ' . $slot . ' cancelled'); $u['wagered'] = max(0, $u['wagered'] - $cost); }
        if ($gone['free']) { $card = moon_card($u); array_unshift($card['free'], $gone['stake']); $u['moon_card'] = json_encode(['stamps' => $card['stamps'], 'free' => $card['free']]); }
        $cur['data']['bets'] = $keep;
        if ($keep) q('UPDATE rounds SET stake = stake - ?, data = ? WHERE id = ?', [$cost, json_encode($cur['data']), $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
        q('DELETE FROM moon_bets WHERE flight_id = ? AND user_id = ? AND slot = ?', [$f['id'], $u['id'], $slot]);
    }
    return ['flight' => $f['id'], 'mine' => array_map('moon_bet_public', $keep), 'card' => moon_card($u)];
}
/* Cash out one slot, or (bail) everything still aboard because the player is leaving. */
function moon_shared_cash(array &$u, array $in, bool $bail): array {
    $f = moon_flight(in_int($in, 'flight', 1, PHP_INT_MAX));
    $now = microtime(true);
    [$done, $cur] = moon_tidy($u, $f['id'], $now);
    if (!$cur) return ['flight' => $f['id'], 'settled' => $done];
    if ($bail) {
        if ($now < $f['close_at']) { foreach ($cur['data']['bets'] as $b) moon_shared_unbet($u, ['flight' => $f['id'], 'slot' => $b['slot']]); return ['flight' => $f['id'], 'left' => true]; }
        if ($now <= $f['start_at']) return ['flight' => $f['id'], 'locked' => true]; // bets are locked and not yet flying: they fly on
        $c = ms_centsAt($now - $f['start_at']);
        foreach ($cur['data']['bets'] as $b) if (!$b['cashC']) { $res = moon_cash($u, $cur, $b['slot'], $c); $cur = round_get_open($u, 'moonshot', (int) $cur['id']) ?: $cur; }
        return ['flight' => $f['id'], 'left' => true];
    }
    return moon_cash($u, $cur, (string) ($in['slot'] ?? ''), in_int($in, 'cents', 0, ms_D()['CAP_C'])) + ['flight' => $f['id']];
}
