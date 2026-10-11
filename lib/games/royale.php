<?php
/* Roulette Royale (High Roller Lounge): one shared European single-zero wheel on the server's clock.
   No cron and no websockets: everyone polls op 'state', and a spin is created by whichever request arrives after the
   previous one has finished (a settings lock row serialises that). The winning number is drawn when the spin is created
   and only leaves the server once betting has closed. Every player's bets are a normal open round (round_open), settled
   with round_close the moment anyone polls after the ball lands (their own poll, or another player's 8 seconds later),
   so the ledger, missions, feed, RTP and achievements all see it, even if the player has left the table.

   Bets are a map of spot => Batty Bucks. Spot keys: 'n' + the covered numbers joined by '-' for inside bets
   (n17, n1-2, n0-2-3, n1-2-4-5, n0-1-2-3, n1-2-3-4-5-6) and red, black, odd, even, low, high, d1-d3, c1-c3 outside.
   A spot covering k numbers returns 36/k times its stake (stake included), so every bet returns 36/37 = 97.30%.
   Mirrors games/royale/game.js (royale math); parity proved by tools/royale-xcheck.js. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const RY_BET_S = 15.0;     // betting window
const RY_SPIN_S = 10.0;    // from close to the ball settling
const RY_REST_S = 5.0;     // result on show before the next betting window
const RY_CHIPS = [2000, 5000, 10000, 25000, 50000, 100000, 250000];
const RY_UNIT = 1000;                 // every spot is a whole number of thousands (any sum of chips is)
const RY_SPOT_MIN = 2000;
const RY_SPOT_MAX_PER_NUMBER = 250000; // a spot may hold 250,000 per number it covers (straight 250k ... even money 4.5M)
const RY_TABLE_MAX = 10000000;
const RY_MAX_SPOTS = 200;
const RY_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RY_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

/* ---------- maths (ported line for line from the JS) ---------- */
function ry_spots(): array {
    static $S = null;
    if ($S !== null) return $S;
    $S = [];
    $add = function (array $nums) use (&$S) { sort($nums); $S['n' . implode('-', $nums)] = $nums; };
    for ($n = 0; $n <= 36; $n++) $add([$n]);
    $add([0, 1]); $add([0, 2]); $add([0, 3]);
    for ($n = 1; $n <= 36; $n++) { if ($n % 3 !== 0) $add([$n, $n + 1]); if ($n <= 33) $add([$n, $n + 3]); }
    $add([0, 1, 2]); $add([0, 2, 3]);
    for ($n = 1; $n <= 34; $n += 3) $add([$n, $n + 1, $n + 2]);
    $add([0, 1, 2, 3]);
    for ($n = 1; $n <= 32; $n++) if ($n % 3 !== 0) $add([$n, $n + 1, $n + 3, $n + 4]);
    for ($n = 1; $n <= 31; $n += 3) $add(range($n, $n + 5));
    $S['red'] = RY_RED;
    $S['black'] = array_values(array_diff(range(1, 36), RY_RED));
    $S['odd'] = range(1, 36, 2); $S['even'] = range(2, 36, 2);
    $S['low'] = range(1, 18); $S['high'] = range(19, 36);
    for ($i = 1; $i <= 3; $i++) { $S['d' . $i] = range(12 * $i - 11, 12 * $i); $S['c' . $i] = range($i, 36, 3); }
    return $S;
}
/* What a spot returns (stake included) when $number comes in. */
function ry_return(string $key, int $stake, int $number): int {
    $nums = ry_spots()[$key] ?? null;
    if (!$nums || !in_array($number, $nums, true)) return 0;
    return intdiv($stake * 36, count($nums));
}
function ry_settle(array $bets, int $number): array {
    $total = 0; $by = [];
    foreach ($bets as $k => $s) { $r = ry_return((string) $k, (int) $s, $number); if ($r > 0) { $by[(string) $k] = $r; $total += $r; } }
    return ['total' => $total, 'bySpot' => (object) $by];
}
function ry_spot_max(string $key): int { return RY_SPOT_MAX_PER_NUMBER * count(ry_spots()[$key]); }
/* null when fine, else the reason */
function ry_validate($bets): ?string {
    if (!is_array($bets)) return 'Bad bets';
    $S = ry_spots(); $total = 0;
    if (count($bets) > RY_MAX_SPOTS) return 'Too many bets';
    foreach ($bets as $k => $s) {
        $k = (string) $k;
        if (!isset($S[$k])) return 'Unknown bet';
        if (!is_int($s) || $s < RY_SPOT_MIN || $s % RY_UNIT !== 0) return 'Bad chip amount';
        if ($s > ry_spot_max($k)) return 'That bet is over the ' . number_format(ry_spot_max($k)) . ' spot limit';
        $total += $s;
    }
    if ($total > RY_TABLE_MAX) return 'That is over the table limit of ' . number_format(RY_TABLE_MAX);
    return null;
}
function ry_draw(Closure $rng): int { return RY_WHEEL[rfloor($rng, 37)]; }

/* ---------- the shared wheel ---------- */
function ry_row(array $s): array {
    foreach (['open_at', 'close_at', 'result_at'] as $k) $s[$k] = (float) $s[$k];
    $s['id'] = (int) $s['id']; $s['number'] = (int) $s['number'];
    return $s;
}
/* The current spin, creating the next one when the last has finished. Runs inside play()'s transaction, so the
   re-read under the lock is a locking read (a plain read would see the transaction's older snapshot). */
function ry_current(): array {
    $now = microtime(true);
    $s = q1('SELECT * FROM ry_spins ORDER BY id DESC LIMIT 1');
    if ($s && $now < (float) $s['result_at'] + RY_REST_S) return ry_row($s);
    if (qv("SELECT v FROM settings WHERE k = 'ry_lock'") === null) q("INSERT IGNORE INTO settings (k, v) VALUES ('ry_lock', '')");
    qv("SELECT v FROM settings WHERE k = 'ry_lock' FOR UPDATE");
    $now = microtime(true);
    $s = q1('SELECT * FROM ry_spins ORDER BY id DESC LIMIT 1 FOR UPDATE');
    if ($s && $now < (float) $s['result_at'] + RY_REST_S) return ry_row($s);
    $open = $s ? max($now, (float) $s['result_at'] + RY_REST_S) : $now;
    q('INSERT INTO ry_spins (number, open_at, close_at, result_at) VALUES (?,?,?,?)', [ry_draw(batty_rng()), $open, $open + RY_BET_S, $open + RY_BET_S + RY_SPIN_S]);
    $id = (int) db()->lastInsertId();
    if ($id % 200 === 0) {
        $old = $now - 7 * 86400;
        q('DELETE b FROM ry_bets b JOIN ry_spins s ON s.id = b.spin_id WHERE s.result_at < ? AND s.id < ?', [$old, $id - 1000]);
        q('DELETE FROM ry_spins WHERE result_at < ? AND id < ?', [$old, $id - 1000]);
        q('DELETE FROM ry_seen WHERE at < ?', [$now - 86400]);
    }
    return ry_row(q1('SELECT * FROM ry_spins WHERE id = ?', [$id]));
}
function ry_public(array $s, float $now): array {
    $o = ['id' => $s['id'], 'openAt' => $s['open_at'], 'closeAt' => $s['close_at'], 'resultAt' => $s['result_at']];
    if ($now >= $s['close_at']) $o['number'] = $s['number'];
    return $o;
}
function ry_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'royale' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
function ry_finish(array &$u, array $r): array {
    $d = $r['data']; $n = (int) $d['number']; $stake = (int) $r['stake'];
    $res = ry_settle($d['bets'], $n);
    $win = $res['total'];
    $f = [];
    $x = $stake > 0 ? $win / $stake : 0;
    if (($x >= 25 && $win >= 2500) || $win >= 50000) {
        $straight = (int) ($d['bets']['n' . $n] ?? 0);
        $f['feedLabel'] = $straight > 0 ? 'Straight up on ' . $n : 'Royale ' . $n . ($n === 0 ? ' green' : (in_array($n, RY_RED, true) ? ' red' : ' black'));
    }
    round_close($u, $r, $win, $f);
    q('UPDATE ry_bets SET win = ? WHERE spin_id = ? AND user_id = ?', [$win, $d['spin'], $u['id']]);
    return ['spin' => (int) $d['spin'], 'number' => $n, 'won' => $win, 'bySpot' => $res['bySpot'], 'staked' => $stake];
}
/* Settle this player's finished spins; returns [settlements, the open round for $spinId or null]. */
function ry_tidy(array &$u, ?int $spinId, float $now): array {
    $done = []; $cur = null;
    foreach (ry_open_rounds($u) as $r) {
        if ($now >= (float) $r['data']['resultAt']) $done[] = ry_finish($u, $r);
        elseif ((int) ($r['data']['spin'] ?? 0) === $spinId) $cur = $r;
    }
    return [$done, $cur];
}
/* Settle up to four other players who left the table with a spin finished. Never waits on a lock (SKIP LOCKED),
   so two pollers can never deadlock; anyone skipped is settled by the next poll or on their own return. */
function ry_settle_others(int $me, float $now): void {
    $saved = $GLOBALS['BATTY_EVENTS'];
    try {
        $rows = q("SELECT id, user_id, data FROM rounds WHERE game = 'royale' AND state = 'open' AND user_id <> ? ORDER BY id LIMIT 40", [$me])->fetchAll();
        $users = [];
        foreach ($rows as $o) {
            $d = json_decode($o['data'], true);
            if ($d && $now >= (float) ($d['resultAt'] ?? INF) + 8) $users[(int) $o['user_id']] = true;
            if (count($users) >= 4) break;
        }
        foreach (array_keys($users) as $uid) {
            if (!q1('SELECT id FROM users WHERE id = ? FOR UPDATE SKIP LOCKED', [$uid])) continue;
            try { $o = lock_user($uid); } catch (ApiError $e) { continue; }
            foreach (ry_open_rounds($o) as $r) if ($now >= (float) $r['data']['resultAt']) ry_finish($o, $r);
            save_user($o);
        }
    } catch (PDOException $e) {
        if (in_array($e->errorInfo[1] ?? 0, [1213, 1205], true)) throw $e;   // let tx() retry a real deadlock
        /* an older server without SKIP LOCKED: they are settled on their own return instead */
    }
    $GLOBALS['BATTY_EVENTS'] = $saved;
}

function ry_state(array &$u, array $in): array {
    $s = ry_current();
    $now = microtime(true);
    [$done, $cur] = ry_tidy($u, $s['id'], $now);
    q('INSERT INTO ry_seen (user_id, at) VALUES (?,?) ON DUPLICATE KEY UPDATE at = VALUES(at)', [$u['id'], $now]);
    ry_settle_others((int) $u['id'], $now);

    $showResult = $now >= $s['result_at'];
    $players = []; $spots = [];
    foreach (q('SELECT b.user_id, b.total, b.bets, u.username, u.avatar, u.level FROM ry_bets b JOIN users u ON u.id = b.user_id WHERE b.spin_id = ? ORDER BY b.total DESC LIMIT 60', [$s['id']])->fetchAll() as $b) {
        $bets = json_decode($b['bets'], true) ?: [];
        $uid = (int) $b['user_id'];
        $p = ['id' => $uid, 'name' => $b['username'], 'avatar' => $b['avatar'], 'level' => (int) $b['level'], 'total' => (int) $b['total'], 'spots' => count($bets)];
        if ($showResult) $p['win'] = ry_settle($bets, $s['number'])['total'];
        $players[] = $p;
        if ($uid !== (int) $u['id']) foreach ($bets as $k => $v) $spots[$k] = ($spots[$k] ?? 0) + (int) $v;
    }
    /* winners of the last spin whose result is out */
    $last = $showResult ? $s : q1('SELECT * FROM ry_spins WHERE result_at <= ? ORDER BY id DESC LIMIT 1', [$now]);
    $winners = [];
    if ($last) {
        $last = ry_row($last);
        foreach (q('SELECT b.user_id, b.total, b.bets, u.username, u.avatar FROM ry_bets b JOIN users u ON u.id = b.user_id WHERE b.spin_id = ? LIMIT 200', [$last['id']])->fetchAll() as $b) {
            $w = ry_settle(json_decode($b['bets'], true) ?: [], $last['number'])['total'];
            if ($w > 0) $winners[] = ['id' => (int) $b['user_id'], 'name' => $b['username'], 'avatar' => $b['avatar'], 'win' => $w, 'staked' => (int) $b['total']];
        }
        usort($winners, fn($a, $b) => $b['win'] <=> $a['win']);
        $winners = array_slice($winners, 0, 10);
    }
    $out = [
        'now' => $now, 'spin' => ry_public($s, $now), 'settled' => $done,
        'mine' => $cur ? $cur['data']['bets'] : (object) [],
        'players' => $players, 'spots' => (object) $spots,
        'winners' => ['spin' => $last ? $last['id'] : 0, 'number' => $last ? $last['number'] : null, 'list' => $winners],
        'live' => (int) qv('SELECT COUNT(*) FROM ry_seen WHERE at > ?', [$now - 12]),
    ];
    /* the last 500 results, only when they have changed since the client's copy */
    $lastId = (int) qv('SELECT id FROM ry_spins WHERE result_at <= ? ORDER BY id DESC LIMIT 1', [$now]);
    $out['histId'] = $lastId;
    if ((int) ($in['h'] ?? -1) !== $lastId) {
        $out['hist'] = array_map(fn($r) => (int) $r['number'], q('SELECT number FROM ry_spins WHERE result_at <= ? ORDER BY id DESC LIMIT 500', [$now])->fetchAll());
    }
    return $out;
}

function ry_bet(array &$u, array $in): array {
    $sid = in_int($in, 'spin', 1, PHP_INT_MAX);
    $s = q1('SELECT * FROM ry_spins WHERE id = ?', [$sid]);
    if (!$s) throw new ApiError('Unknown spin.', 404);
    $s = ry_row($s);
    $now = microtime(true);
    if ($now >= $s['close_at']) throw new ApiError('No more bets: the wheel is spinning.', 409);
    if ($now < $s['open_at'] - 0.5) throw new ApiError('Betting has not opened yet.', 409);
    $bets = $in['bets'] ?? [];
    if ($err = ry_validate($bets)) throw new ApiError($err . '.');
    $clean = []; foreach ($bets as $k => $v) $clean[(string) $k] = (int) $v;
    [, $cur] = ry_tidy($u, $sid, $now);
    $new = array_sum($clean); $old = $cur ? (int) $cur['stake'] : 0;
    if ($new - $old > $u['balance']) throw new ApiError('Not enough Batty Bucks.', 402);
    if (!$cur && $new > 0) {
        round_open($u, 'royale', $new, ['spin' => $sid, 'bets' => $clean, 'number' => $s['number'], 'resultAt' => $s['result_at']]);
    } elseif ($cur) {
        $d = $cur['data']; $d['bets'] = $clean;
        if ($new > $old) { credit($u, -($new - $old), 'bet', 'royale', (int) $cur['id']); add_wager($u, $new - $old); }
        elseif ($new < $old) { credit($u, $old - $new, 'refund', 'royale', (int) $cur['id'], 'bets taken back'); $u['wagered'] = max(0, $u['wagered'] - ($old - $new)); }
        if ($new > 0) q('UPDATE rounds SET stake = ?, data = ? WHERE id = ?', [$new, json_encode($d), $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
    }
    if ($new > 0) q('INSERT INTO ry_bets (spin_id, user_id, total, bets) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE total = VALUES(total), bets = VALUES(bets)', [$sid, $u['id'], $new, json_encode((object) $clean)]);
    else q('DELETE FROM ry_bets WHERE spin_id = ? AND user_id = ?', [$sid, $u['id']]);
    return ['spin' => $sid, 'mine' => $new > 0 ? (object) $clean : (object) [], 'total' => $new];
}

function play_royale(array &$u, string $op, array $in): array {
    if ($u['level'] < 5) throw new ApiError('The High Roller Lounge opens at level 5.', 403);
    if ($op === 'state') return ry_state($u, $in);
    if ($op === 'bet') return ry_bet($u, $in);
    throw new ApiError('Unknown action.');
}
