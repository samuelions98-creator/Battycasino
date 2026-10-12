<?php
/* Admin panel actions. Every one requires an admin account and writes to the ledger when money moves. */
if (!defined('BATTY')) { http_response_code(403); exit; }

function admin_api(string $a, array $in): array {
    $me = require_admin();
    switch ($a) {
        case 'admin_stats': {
            $today = (new DateTime('today', new DateTimeZone('Europe/London')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            $games = [];
            foreach (q("SELECT game, COUNT(*) n, SUM(balls) balls, SUM(stake) s, SUM(win) w FROM rounds WHERE state = 'done' GROUP BY game")->fetchAll() as $r)
                $games[$r['game']] = ['rounds' => (int) $r['n'], 'balls' => (int) $r['balls'], 'staked' => (int) $r['s'], 'won' => (int) $r['w'], 'rtp' => $r['s'] > 0 ? round($r['w'] / $r['s'] * 100, 2) : null];
            $t = q1("SELECT COUNT(*) n, COALESCE(SUM(stake),0) s, COALESCE(SUM(win),0) w FROM rounds WHERE state = 'done' AND created_at >= ?", [$today]);
            return [
                'players' => (int) qv('SELECT COUNT(*) FROM users'),
                'activeToday' => (int) qv('SELECT COUNT(*) FROM users WHERE last_seen >= ?', [$today]),
                'online' => (int) qv('SELECT COUNT(*) FROM users WHERE last_seen > ?', [gmdate('Y-m-d H:i:s', time() - 300)]),
                'banned' => (int) qv('SELECT COUNT(*) FROM users WHERE banned = 1'),
                'bankroll' => (int) qv('SELECT COALESCE(SUM(balance),0) FROM users'),
                'openRounds' => (int) qv("SELECT COUNT(*) FROM rounds WHERE state = 'open'"),
                'today' => ['rounds' => (int) $t['n'], 'staked' => (int) $t['s'], 'won' => (int) $t['w']],
                'games' => $games,
                'announce' => (string) setting('announce', ''),
                'season' => setting('season_start'),
            ];
        }
        case 'admin_users': {
            $search = in_str($in, 'q', 16);
            $sort = ['seen' => 'last_seen DESC', 'balance' => 'balance DESC', 'new' => 'id DESC', 'wagered' => 'wagered DESC'][$in['sort'] ?? 'seen'] ?? 'last_seen DESC';
            $page = max(0, (int) ($in['page'] ?? 0));
            $args = [];
            $where = '';
            if ($search !== '') { $where = 'WHERE name_lc LIKE ?'; $args[] = '%' . strtolower(addcslashes($search, '%_\\')) . '%'; }
            $rows = q("SELECT id, username, avatar, level, balance, wagered, won, rounds, is_admin, banned, created_at, last_seen FROM users $where ORDER BY $sort LIMIT 50 OFFSET " . ($page * 50), $args)->fetchAll();
            return ['users' => array_map(fn($r) => [
                'id' => (int) $r['id'], 'name' => $r['username'], 'avatar' => $r['avatar'], 'level' => (int) $r['level'], 'balance' => (int) $r['balance'], 'wagered' => (int) $r['wagered'],
                'won' => (int) $r['won'], 'rounds' => (int) $r['rounds'], 'admin' => (bool) $r['is_admin'], 'banned' => (bool) $r['banned'],
                'joined' => strtotime($r['created_at'] . ' UTC'), 'seen' => strtotime($r['last_seen'] . ' UTC')], $rows), 'page' => $page];
        }
        case 'admin_user': {
            $id = in_int($in, 'id', 1, PHP_INT_MAX);
            $u = q1('SELECT id, username, avatar, level, balance, wagered, won, rounds, is_admin, banned, created_at, last_seen, motto, streak FROM users WHERE id = ?', [$id]);
            if (!$u) throw new ApiError('No such player.', 404);
            $ledger = q('SELECT id, kind, game, amount, balance, note, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$id])->fetchAll();
            $games = q('SELECT game, rounds, wagered, won, best_win, best_x FROM user_games WHERE user_id = ?', [$id])->fetchAll();
            return ['user' => $u, 'ledger' => $ledger, 'games' => $games];
        }
        case 'admin_adjust': {
            $id = in_int($in, 'id', 1, PHP_INT_MAX);
            $amt = in_int($in, 'amount', -1000000000, 1000000000);
            $note = in_str($in, 'note', 80);
            return tx(function () use ($id, $amt, $note, $me) {
                $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$id]);
                if (!$u) throw new ApiError('No such player.', 404);
                foreach (['balance', 'ver'] as $k) $u[$k] = (int) $u[$k];
                if ($u['balance'] + $amt < 0) $amt = -$u['balance'];
                $u['balance'] += $amt; $u['ver']++;
                q('UPDATE users SET balance = ?, ver = ? WHERE id = ?', [$u['balance'], $u['ver'], $id]);
                q('INSERT INTO ledger (user_id, kind, amount, balance, note, created_at) VALUES (?,?,?,?,?,?)', [$id, 'admin', $amt, $u['balance'], 'By ' . $me['username'] . ($note !== '' ? ': ' . $note : ''), msnow()]);
                return ['balance' => $u['balance']];
            });
        }
        case 'admin_set': {
            $id = in_int($in, 'id', 1, PHP_INT_MAX);
            $field = $in['field'] ?? '';
            if (!in_array($field, ['banned', 'is_admin'], true)) throw new ApiError('Unknown setting.');
            if ($id === (int) $me['id']) throw new ApiError('You cannot change that on your own account.');
            q("UPDATE users SET $field = ? WHERE id = ?", [!empty($in['on']) ? 1 : 0, $id]);
            return ['ok' => true];
        }
        case 'admin_happy': return ['active' => happy_public(), 'presets' => HAPPY_PRESETS];
        case 'admin_happy_start': { $p = $in['preset'] ?? ''; $m = (int) ($in['mins'] ?? (HAPPY_PRESETS[$p]['mins'] ?? 60)); return ['active' => happy_start((string) $p, $m), 'presets' => HAPPY_PRESETS]; }
        case 'admin_happy_stop': happy_stop(); return ['active' => null, 'presets' => HAPPY_PRESETS];
        case 'admin_rtp': return admin_rtp_state();
        case 'admin_rtp_set': return admin_rtp_set($in);
        case 'admin_password': {
            $id = in_int($in, 'id', 1, PHP_INT_MAX);
            $p = valid_pass((string) ($in['pass'] ?? ''));
            q('UPDATE users SET pass_hash = ?, pass_ver = pass_ver + 1 WHERE id = ?', [password_hash($p, PASSWORD_DEFAULT), $id]);
            return ['ok' => true];
        }
        case 'admin_feed_delete': {
            q('DELETE FROM feed WHERE id = ?', [in_int($in, 'id', 1, PHP_INT_MAX)]);
            return ['ok' => true];
        }
        case 'admin_migrate': {
            $before = q("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            foreach (require __DIR__ . '/schema.php' as $sql) db()->exec($sql);
            $after = q("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            return ['added' => array_values(array_diff($after, $before)), 'tables' => count($after)];
        }
        case 'admin_announce': {
            set_setting('announce', in_str($in, 'text', 200));
            return ['ok' => true];
        }
        case 'admin_season': {
            set_setting('season_start', now_sql());
            q('DELETE FROM feed');
            $reset = !empty($in['resetBalances']);
            if ($reset) {
                $start = (int) cfg('start_balance');
                tx(function () use ($start, $me) {
                    q("INSERT INTO ledger (user_id, kind, amount, balance, note, created_at) SELECT id, 'admin', ? - balance, ?, ?, ? FROM users", [$start, $start, 'New season: balance reset by ' . $me['username'], msnow()]);
                    q('UPDATE users SET balance = ?, ver = ver + 1', [$start]);
                });
            }
            return ['ok' => true, 'season' => setting('season_start'), 'reset' => $reset];
        }
    }
    throw new ApiError('Unknown admin action.');
}

/* ---------- return to player ---------- */
/* Designed returns (%) from each game's own simulation, for the Admin table; null where there is no single figure. */
const RTP_DESIGNED = ['circus' => 96.5, 'bookofbats' => 96.5, 'nighttrain' => 96.2, 'gummy' => 96.4, 'crypt' => 96.7, 'vault' => 96.7, 'starwing' => 96.5, 'ultraheist' => 96.9,
    'bunky' => 96.0, 'bonkers' => 96.0, 'derby' => 96.0, 'batjack' => 97.9, 'royale' => 97.3, 'baccarat' => 98.9, 'echo' => 98.0];
const RTP_BALANCED = ['batjack', 'bonanza', 'bookofbats', 'crypt', 'gummy', 'nighttrain', 'starwing', 'ultraheist', 'vault'];
function admin_rtp_state(): array {
    $rep = rtp_report(); $games = [];
    foreach (BATTY_GAMES as $g) {
        if (in_array($g, BATTY_HIDDEN_GAMES, true)) continue;
        $r = $rep[$g] ?? [];
        $games[] = ['id' => $g, 'name' => BATTY_GAME_NAMES[$g] ?? $g, 'designed' => RTP_DESIGNED[$g] ?? null, 'balanced' => in_array($g, RTP_BALANCED, true),
            'target' => $r['target'] ?? null, 'custom' => !empty($r['custom']), 'recent' => $r['recent'] ?? null, 'life' => $r['life'] ?? null, 'rounds' => $r['rounds'] ?? 0,
            'boosted' => !in_array($g, RTP_BOOST_EXCLUDED, true)];
    }
    $d = setting('rtp_default');
    return ['boost' => rtp_boost_base(), 'boostMax' => RTP_BOOST_MAX, 'boostCap' => RTP_BOOST_CAP, 'default' => $d === null || $d === '' ? RTP_DEFAULT : (float) $d, 'jackpots' => 2.5, 'games' => $games];
}
function admin_rtp_set(array $in): array {
    if (array_key_exists('boost', $in)) {
        $b = $in['boost']; if (!is_numeric($b) || $b < 0 || $b > RTP_BOOST_MAX) throw new ApiError('The boost is between 0 and ' . RTP_BOOST_MAX . ' points.');
        set_setting('rtp_boost', round((float) $b, 2));
    }
    if (array_key_exists('default', $in)) {
        $d = $in['default']; if (!is_numeric($d) || $d < 80 || $d > 110) throw new ApiError('The target return is between 80% and 110%.');
        set_setting('rtp_default', round((float) $d, 2));
    }
    if (isset($in['game'])) {
        $g = $in['game']; if (!in_array($g, RTP_BALANCED, true)) throw new ApiError('That game has fixed maths; use the boost instead.');
        $v = $in['value'] ?? null;
        if ($v === null || $v === '') q('DELETE FROM settings WHERE k = ?', ['rtp_' . $g]);
        else { if (!is_numeric($v) || $v < 80 || $v > 110) throw new ApiError('The target return is between 80% and 110%.'); set_setting('rtp_' . $g, round((float) $v, 2)); }
    }
    return admin_rtp_state();
}
