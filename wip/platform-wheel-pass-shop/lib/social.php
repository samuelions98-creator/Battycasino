<?php
/* Accounts, bonuses, missions, leaderboards, the big-wins feed and profiles. */
if (!defined('BATTY')) { http_response_code(403); exit; }

function public_user(array $u): array {
    return ['id' => (int) $u['id'], 'name' => $u['username'], 'avatar' => $u['avatar'], 'level' => (int) $u['level'], 'motto' => $u['motto'],
        /* Platform: equipped cosmetics (frame, name style, title, accessories, effect, badge) */
        'cos' => function_exists('plat_cosmetics') ? (object) plat_cosmetics((int) $u['id']) : (object) []];
}
function me_payload(array $u): array {
    $u = q1('SELECT * FROM users WHERE id = ?', [$u['id']]);
    foreach (['balance', 'ver', 'wagered', 'won', 'rounds', 'level', 'best_win', 'is_admin', 'streak'] as $k) $u[$k] = (int) $u[$k];
    $next = $u['last_claim'] ? strtotime($u['last_claim'] . ' UTC') + 3600 - time() : 0;
    return public_user($u) + [
        'bal' => $u['balance'], 'ver' => $u['ver'], 'xp' => level_progress($u), 'wagered' => $u['wagered'], 'won' => $u['won'], 'rounds' => $u['rounds'],
        'bestWin' => $u['best_win'], 'bestX' => (float) $u['best_x'], 'streak' => $u['streak'], 'admin' => (bool) $u['is_admin'],
        'claimIn' => max(0, $next), 'claimAmount' => claim_amount($u['level']),
        'missionsReady' => (int) qv('SELECT COUNT(*) FROM missions WHERE user_id = ? AND day = ? AND claimed = 0 AND progress >= target', [$u['id'], uk_day()]),
        /* Platform: wheel, Bat Pass and boost status for the lobby and top bar */
        'plat' => function_exists('plat_status') ? plat_status($u) : null,
    ];
}
function site_payload(): array {
    return [
        'name' => cfg('site_name'),
        'announce' => (string) setting('announce', ''),
        'online' => (int) qv('SELECT COUNT(*) FROM users WHERE last_seen > ?', [gmdate('Y-m-d H:i:s', time() - 300)]),
        'players' => (int) qv('SELECT COUNT(*) FROM users'),
        'startBalance' => (int) cfg('start_balance'),
    ];
}

/* ---------- accounts ---------- */
function valid_name(string $n): string {
    if (!preg_match('/^[A-Za-z0-9_]{3,16}$/', $n)) throw new ApiError('Usernames are 3 to 16 letters, numbers or underscores.');
    $bad = ['admin', 'administrator', 'moderator', 'batty', 'battycasino', 'support', 'system', 'house'];
    if (in_array(strtolower($n), $bad, true)) throw new ApiError('That username is reserved. Try another.');
    return $n;
}
function valid_pass(string $p): string {
    if (mb_strlen($p) < 6) throw new ApiError('Passwords need at least 6 characters.');
    if (mb_strlen($p) > 200) throw new ApiError('That password is too long.');
    return $p;
}
function login_session(array $u): void {
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id']; $_SESSION['pv'] = (int) $u['pass_ver'];
    session_write_close();
}
function api_register(array $in): array {
    $name = valid_name(in_str($in, 'name', 16));
    $pass = valid_pass((string) ($in['pass'] ?? ''));
    rate_limit('reg', 5, 3600);
    if (qv('SELECT id FROM users WHERE name_lc = ?', [strtolower($name)])) throw new ApiError('That username is taken.');
    $start = (int) cfg('start_balance');
    $id = tx(function () use ($name, $pass, $start) {
        q('INSERT INTO users (username, name_lc, pass_hash, balance, avatar, created_at, last_seen) VALUES (?,?,?,?,?,?,?)',
            [$name, strtolower($name), password_hash($pass, PASSWORD_DEFAULT), 0, random_int(0, 11) . '-' . random_int(0, 7), now_sql(), now_sql()]);
        $id = (int) db()->lastInsertId();
        $u = lock_user($id);
        credit($u, $start, 'start', null, null, 'Welcome to the belfry');
        save_user($u);
        return $id;
    });
    login_session(q1('SELECT * FROM users WHERE id = ?', [$id]));
    return ['me' => me_payload(['id' => $id])];
}
function api_login(array $in): array {
    rate_limit('login', 10, 600);
    $name = in_str($in, 'name', 16); $pass = (string) ($in['pass'] ?? '');
    $u = q1('SELECT * FROM users WHERE name_lc = ?', [strtolower($name)]);
    if (!$u || !password_verify($pass, $u['pass_hash'])) throw new ApiError('Wrong username or password.', 401);
    if ((int) $u['banned']) throw new ApiError('This account has been suspended.', 403);
    if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) q('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
    login_session($u);
    return ['me' => me_payload($u)];
}
function api_logout(): array { start_session(); $_SESSION = []; session_destroy(); return ['ok' => true]; }
function api_password(array $in): array {
    $u = require_user();
    $row = q1('SELECT pass_hash, pass_ver FROM users WHERE id = ?', [$u['id']]);
    if (!password_verify((string) ($in['old'] ?? ''), $row['pass_hash'])) throw new ApiError('Your current password is wrong.', 401);
    $new = valid_pass((string) ($in['new'] ?? ''));
    q('UPDATE users SET pass_hash = ?, pass_ver = pass_ver + 1 WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    login_session(q1('SELECT * FROM users WHERE id = ?', [$u['id']]));
    return ['ok' => true];
}

/* ---------- bonuses ---------- */
function api_claim(): array {
    $u0 = require_user();
    return tx(function () use ($u0) {
        $u = lock_user((int) $u0['id']);
        if ($u['last_claim'] && strtotime($u['last_claim'] . ' UTC') + 3600 > time()) throw new ApiError('Your next free bonus is not ready yet.', 409);
        $amt = claim_amount($u['level']);
        credit($u, $amt, 'claim', null, null, 'Hourly bonus');
        q('UPDATE users SET last_claim = ? WHERE id = ?', [now_sql(), $u['id']]);
        save_user($u);
        return ['amount' => $amt, 'bal' => $u['balance'], 'ver' => $u['ver'], 'me' => me_payload($u)];
    });
}
function api_rescue(): array {
    $u0 = require_user();
    return tx(function () use ($u0) {
        $u = lock_user((int) $u0['id']);
        if ($u['balance'] >= 1000) throw new ApiError('Top-ups are for players under 1,000 Batty Bucks.', 409);
        if ((int) qv("SELECT COUNT(*) FROM rounds WHERE user_id = ? AND state = 'open'", [$u['id']])) throw new ApiError('Finish your current round first.', 409);
        if ($u['last_rescue'] && strtotime($u['last_rescue'] . ' UTC') + 300 > time()) throw new ApiError('The bat-signal recharges every 5 minutes. Grab your hourly bonus in the meantime.', 409);
        credit($u, 5000, 'rescue', null, null, 'Emergency top-up');
        q('UPDATE users SET last_rescue = ? WHERE id = ?', [now_sql(), $u['id']]);
        save_user($u);
        return ['amount' => 5000, 'bal' => $u['balance'], 'ver' => $u['ver']];
    });
}
function api_missions(): array { $u = require_user(); return ['missions' => missions_list($u), 'day' => uk_day()]; }
function api_mission_claim(array $in): array {
    $u0 = require_user();
    return tx(function () use ($u0, $in) {
        $u = lock_user((int) $u0['id']);
        $amt = mission_claim($u, in_int($in, 'slot', 0, 2));
        save_user($u);
        return ['amount' => $amt, 'bal' => $u['balance'], 'ver' => $u['ver'], 'missions' => missions_list($u)];
    });
}

/* ---------- leaderboards ---------- */
function period_start(string $period): ?string {
    $tz = new DateTimeZone('Europe/London');
    if ($period === 'day') $d = new DateTime('today', $tz);
    elseif ($period === 'week') { $d = new DateTime('today', $tz); $d->modify('-' . ((int) $d->format('N') - 1) . ' days'); }
    else $d = null;
    $season = setting('season_start');
    $t = $d ? $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s') : null;
    if ($season && (!$t || $season > $t)) $t = $season;
    return $t;
}
function api_leaderboard(array $in): array {
    $board = $in['board'] ?? 'rich'; $period = $in['period'] ?? 'week'; $game = $in['game'] ?? null;
    if (!in_array($board, ['rich', 'bigwin', 'bigx', 'wagered'], true)) throw new ApiError('Unknown board.');
    if (!in_array($period, ['day', 'week', 'all'], true)) $period = 'week';
    if ($game !== null && $game !== '' && !in_array($game, BATTY_GAMES, true)) $game = null;
    if ($game === '') $game = null;
    $since = period_start($period);
    if ($board === 'rich') {
        $rows = q('SELECT id, username, avatar, level, motto, balance AS v FROM users WHERE banned = 0 ORDER BY balance DESC, id LIMIT 50')->fetchAll();
    } else {
        $agg = ['bigwin' => 'MAX(r.win)', 'bigx' => 'MAX(r.x)', 'wagered' => 'SUM(r.stake)'][$board];
        $where = ["r.state = 'done'", 'u.banned = 0']; $args = [];
        if ($since) { $where[] = 'r.created_at >= ?'; $args[] = $since; }
        if ($game) { $where[] = 'r.game = ?'; $args[] = $game; }
        if ($board !== 'wagered') $where[] = 'r.win > 0';
        $rows = q("SELECT u.id, u.username, u.avatar, u.level, u.motto, $agg AS v FROM rounds r JOIN users u ON u.id = r.user_id WHERE " . implode(' AND ', $where) . " GROUP BY u.id ORDER BY v DESC LIMIT 50", $args)->fetchAll();
    }
    $out = [];
    foreach ($rows as $i => $r) $out[] = ['rank' => $i + 1, 'id' => (int) $r['id'], 'name' => $r['username'], 'avatar' => $r['avatar'], 'level' => (int) $r['level'], 'v' => $board === 'bigx' ? (float) $r['v'] : (int) $r['v']];
    $me = current_user(); $mine = null;
    if ($me && $board === 'rich') $mine = ['rank' => 1 + (int) qv('SELECT COUNT(*) FROM users WHERE banned = 0 AND (balance > ? OR (balance = ? AND id < ?))', [$me['balance'], $me['balance'], $me['id']]), 'v' => (int) $me['balance']];
    return ['board' => $board, 'period' => $board === 'rich' ? 'now' : $period, 'game' => $game, 'rows' => $out, 'mine' => $mine, 'season' => setting('season_start')];
}

/* ---------- live feed ---------- */
function api_feed(array $in): array {
    $since = max(0, (int) ($in['since'] ?? 0));
    $rows = q('SELECT f.id, f.game, f.amount, f.x, f.label, f.created_at, u.username, u.avatar FROM feed f JOIN users u ON u.id = f.user_id WHERE f.id > ? AND u.banned = 0 ORDER BY f.id DESC LIMIT 20', [$since])->fetchAll();
    return ['items' => array_map(fn($r) => ['id' => (int) $r['id'], 'game' => $r['game'], 'amount' => (int) $r['amount'], 'x' => (float) $r['x'], 'label' => $r['label'], 'at' => strtotime($r['created_at'] . ' UTC'), 'name' => $r['username'], 'avatar' => $r['avatar']], $rows), 'now' => time(), 'online' => site_payload()['online']];
}

/* ---------- profiles ---------- */
function api_profile(array $in): array {
    $name = in_str($in, 'name', 16);
    $u = q1('SELECT * FROM users WHERE name_lc = ?', [strtolower($name)]);
    if (!$u || ((int) $u['banned'] && !(current_user()['is_admin'] ?? 0))) throw new ApiError('No player by that name.', 404);
    $games = q('SELECT game, rounds, wagered, won, best_win, best_x FROM user_games WHERE user_id = ?', [$u['id']])->fetchAll();
    $top = q("SELECT game, stake, win, x, created_at FROM rounds WHERE user_id = ? AND state = 'done' AND win > 0 ORDER BY win DESC LIMIT 5", [$u['id']])->fetchAll();
    $ach = q('SELECT ach, unlocked_at FROM achievements WHERE user_id = ?', [$u['id']])->fetchAll();
    $defs = achievement_defs(); $have = array_column($ach, 'unlocked_at', 'ach');
    $achOut = [];
    foreach ($defs as $id => [$nm, $desc, $reward]) $achOut[] = ['id' => $id, 'name' => $nm, 'desc' => $desc, 'reward' => $reward, 'at' => isset($have[$id]) ? strtotime($have[$id] . ' UTC') : null];
    return [
        'user' => public_user($u) + ['joined' => strtotime($u['created_at'] . ' UTC'), 'seen' => strtotime($u['last_seen'] . ' UTC'), 'balance' => (int) $u['balance'], 'wagered' => (int) $u['wagered'], 'won' => (int) $u['won'], 'rounds' => (int) $u['rounds'],
            'bestWin' => (int) $u['best_win'], 'bestX' => (float) $u['best_x'], 'bestGame' => $u['best_game'], 'streak' => (int) $u['streak'],
            'rank' => 1 + (int) qv('SELECT COUNT(*) FROM users WHERE banned = 0 AND balance > ?', [$u['balance']])],
        'games' => array_map(fn($g) => ['game' => $g['game'], 'rounds' => (int) $g['rounds'], 'wagered' => (int) $g['wagered'], 'won' => (int) $g['won'], 'bestWin' => (int) $g['best_win'], 'bestX' => (float) $g['best_x']], $games),
        'top' => array_map(fn($r) => ['game' => $r['game'], 'stake' => (int) $r['stake'], 'win' => (int) $r['win'], 'x' => (float) $r['x'], 'at' => strtotime($r['created_at'] . ' UTC')], $top),
        'achievements' => $achOut,
    ];
}
function api_profile_update(array $in): array {
    $u = require_user();
    $sets = []; $args = [];
    if (isset($in['avatar'])) {
        if (!is_string($in['avatar']) || !preg_match('/^(\d{1,2})-(\d)$/', $in['avatar'], $m) || (int) $m[1] > 11 || (int) $m[2] > 7) throw new ApiError('Pick an avatar from the list.');
        $sets[] = 'avatar = ?'; $args[] = $in['avatar'];
    }
    if (isset($in['motto'])) {
        $mt = preg_replace('/[\x00-\x1F\x7F]/u', '', in_str($in, 'motto', 60));
        $sets[] = 'motto = ?'; $args[] = $mt;
    }
    if ($sets) { $args[] = $u['id']; q('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $args); }
    return ['me' => me_payload($u)];
}
