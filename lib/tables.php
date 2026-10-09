<?php
/* Bat Signal Roulette: one shared wheel. A spin is created by whichever request arrives after the last one ends
   (no cron job). Its result and lucky numbers are drawn at creation and only leave the server once betting closes. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const RL_BET_S = 15.0;    // betting window
const RL_SHOW_S = 10.5;   // bat-signal strike + ball spin, from close to the ball dropping
const RL_REST_S = 5.0;    // result on show before the next betting window

function rl_row(array $s): array {
    foreach (['open_at', 'close_at', 'result_at'] as $k) $s[$k] = (float) $s[$k];
    $s['id'] = (int) $s['id']; $s['number'] = (int) $s['number']; $s['pocket'] = (int) $s['pocket']; $s['lucky'] = json_decode($s['lucky'], true);
    return $s;
}
function rl_current(): array {
    $now = microtime(true);
    $s = q1('SELECT * FROM rl_spins ORDER BY id DESC LIMIT 1');
    if ($s && $now < (float) $s['result_at'] + RL_REST_S) return rl_row($s);
    return tx(function () {
        q("INSERT IGNORE INTO settings (k, v) VALUES ('rl_lock', '')");
        qv("SELECT v FROM settings WHERE k = 'rl_lock' FOR UPDATE");
        $now = microtime(true);
        $s = q1('SELECT * FROM rl_spins ORDER BY id DESC LIMIT 1');
        if ($s && $now < (float) $s['result_at'] + RL_REST_S) return rl_row($s);
        $o = rl_spin(batty_rng());
        $open = $s ? max($now, (float) $s['result_at'] + RL_REST_S) : $now;
        q('INSERT INTO rl_spins (number, pocket, lucky, open_at, close_at, result_at) VALUES (?,?,?,?,?,?)', [$o['number'], $o['pocket'], json_encode($o['lucky']), $open, $open + RL_BET_S, $open + RL_BET_S + RL_SHOW_S]);
        $id = (int) db()->lastInsertId();
        if ($id % 200 === 0) {
            $old = $now - 7 * 86400;
            q('DELETE b FROM rl_bets b JOIN rl_spins s ON s.id = b.spin_id WHERE s.result_at < ?', [$old]);
            q('DELETE FROM rl_spins WHERE result_at < ? AND id < ?', [$old, $id - 1000]);
        }
        return rl_row(q1('SELECT * FROM rl_spins WHERE id = ?', [$id]));
    });
}
function rl_public(array $s, float $now): array {
    $o = ['id' => $s['id'], 'openAt' => $s['open_at'], 'closeAt' => $s['close_at'], 'resultAt' => $s['result_at']];
    if ($now >= $s['close_at']) { $o['lucky'] = $s['lucky']; $o['number'] = $s['number']; $o['pocket'] = $s['pocket']; }
    return $o;
}
function rl_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'roulette' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
function rl_finish(array &$u, array $r): array {
    $d = $r['data']; $o = $d['o'];
    $res = rl_settle($d['bets'], $o);
    $f = ['bonus' => $res['lightning'] > 0 ? 1 : 0];
    if ($res['lightning'] > 0) {
        $f['lightning'] = true;
        $m = 0; foreach ($o['lucky'] as $l) if ($l['n'] === $o['number']) $m = $l['m'];
        if ($m >= 500) $f['bolt500'] = true;
        $f['feedLabel'] = 'Bat Signal ' . $m . '× on ' . $o['number'];
        $stake = 0; foreach ($d['bets'] as $k => $s) if ($k === 'straight:' . $o['number']) $stake = $s;
        if ($stake) { $f['x'] = $m; $f['bigWin'] = $res['lightning']; }
    }
    round_close($u, $r, $res['total'], $f);
    q('UPDATE rl_bets SET win = ? WHERE spin_id = ? AND user_id = ?', [$res['total'], $d['spin'], $u['id']]);
    return ['spin' => $d['spin'], 'number' => $o['number'], 'won' => $res['total'], 'bySpot' => $res['bySpot'], 'lightning' => $res['lightning'], 'staked' => (int) $r['stake']];
}
/* Settle the player's spins that have finished; returns [settlements, open round for $spinId or null]. */
function rl_tidy(array &$u, ?int $spinId, float $now): array {
    $done = []; $cur = null;
    foreach (rl_open_rounds($u) as $r) {
        if ($now >= $r['data']['resultAt']) $done[] = rl_finish($u, $r);
        elseif (($r['data']['spin'] ?? null) === $spinId) $cur = $r;
    }
    return [$done, $cur];
}

function rl_state_api(array $u0): array {
    $s = rl_current();
    $now = microtime(true);
    $out = tx(function () use ($u0, $s, $now) {
        $u = lock_user((int) $u0['id']);
        [$done, $cur] = rl_tidy($u, $s['id'], $now);
        save_user($u);
        return ['settled' => $done, 'mine' => $cur ? $cur['data']['bets'] : (object) [], 'bal' => $u['balance'], 'ver' => $u['ver'], 'level' => $u['level'], 'xp' => level_progress($u)];
    });
    $mine = $GLOBALS['BATTY_EVENTS'];
    $others = q("SELECT id, user_id, data FROM rounds WHERE game = 'roulette' AND state = 'open' AND user_id <> ? ORDER BY id LIMIT 30", [$u0['id']])->fetchAll();
    $n = 0;
    foreach ($others as $o) {
        $d = json_decode($o['data'], true);
        if (!$d || $now < ($d['resultAt'] ?? INF) + 8) continue;   // the player's own poll gets 8 s to collect it first
        try {
            tx(function () use ($o, $now) {
                $u = lock_user((int) $o['user_id']);
                foreach (rl_open_rounds($u) as $r) if ((int) $r['id'] === (int) $o['id'] && $now >= $r['data']['resultAt']) { rl_finish($u, $r); save_user($u); }
            });
        } catch (Throwable $e) { /* settled on their next visit */ }
        if (++$n >= 4) break;
    }
    $GLOBALS['BATTY_EVENTS'] = $mine;
    $players = [];
    $showWins = $now >= $s['result_at'];
    foreach (q('SELECT b.user_id, b.total, b.win, u.username, u.avatar, u.level FROM rl_bets b JOIN users u ON u.id = b.user_id WHERE b.spin_id = ? ORDER BY b.total DESC LIMIT 40', [$s['id']])->fetchAll() as $b) {
        $players[] = ['id' => (int) $b['user_id'], 'name' => $b['username'], 'avatar' => $b['avatar'], 'level' => (int) $b['level'], 'total' => (int) $b['total'], 'win' => $showWins && (int) $b['win'] >= 0 ? (int) $b['win'] : null];
    }
    $hist = array_map(function ($h) {
        $lk = json_decode($h['lucky'], true); $m = 0; foreach ($lk as $l) if ($l['n'] === (int) $h['number']) $m = $l['m'];
        return ['n' => (int) $h['number'], 'm' => $m];
    }, q('SELECT number, lucky FROM rl_spins WHERE result_at <= ? ORDER BY id DESC LIMIT 100', [$now])->fetchAll());
    return $out + ['now' => $now, 'spin' => rl_public($s, $now), 'players' => $players, 'hist' => $hist];
}

function play_roulette(array &$u, string $op, array $in): array {
    if ($op !== 'bet') throw new ApiError('Unknown action.');
    $sid = in_int($in, 'spin', 1, PHP_INT_MAX);
    $s = q1('SELECT * FROM rl_spins WHERE id = ?', [$sid]);
    if (!$s) throw new ApiError('Unknown spin.', 404);
    $s = rl_row($s);
    $now = microtime(true);
    if ($now >= $s['close_at']) throw new ApiError('No more bets: the wheel is spinning.', 409);
    $bets = $in['bets'] ?? [];
    if (!is_array($bets)) throw new ApiError('Bad bets.');
    if ($err = rl_validate($bets)) throw new ApiError($err . '.');
    [, $cur] = rl_tidy($u, $sid, $now);
    $new = array_sum($bets); $old = $cur ? (int) $cur['stake'] : 0;
    if ($new - $old > $u['balance']) throw new ApiError('Not enough Batty Bucks.', 402);
    if (!$cur && $new > 0) {
        round_open($u, 'roulette', $new, ['spin' => $sid, 'bets' => $bets, 'o' => ['lucky' => $s['lucky'], 'pocket' => $s['pocket'], 'number' => $s['number']], 'resultAt' => $s['result_at']]);
    } elseif ($cur) {
        $d = $cur['data']; $d['bets'] = $bets;
        if ($new > $old) { credit($u, -($new - $old), 'bet', 'roulette', (int) $cur['id']); add_wager($u, $new - $old); }
        elseif ($new < $old) { credit($u, $old - $new, 'refund', 'roulette', (int) $cur['id'], 'bets taken back'); $u['wagered'] = max(0, $u['wagered'] - ($old - $new)); }
        if ($new > 0) q('UPDATE rounds SET stake = ?, data = ? WHERE id = ?', [$new, json_encode($d), $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
    }
    if ($new > 0) q('INSERT INTO rl_bets (spin_id, user_id, total) VALUES (?,?,?) ON DUPLICATE KEY UPDATE total = VALUES(total)', [$sid, $u['id'], $new]);
    else q('DELETE FROM rl_bets WHERE spin_id = ? AND user_id = ?', [$sid, $u['id']]);
    return ['spin' => $sid, 'mine' => $new > 0 ? $bets : (object) [], 'total' => $new];
}
