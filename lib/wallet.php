<?php
/* Balances, rounds, levels, missions, achievements and the big-wins feed.
   Every money change happens inside a transaction with the player's row locked (lock_user), and writes a ledger row. */
if (!defined('BATTY')) { http_response_code(403); exit; }

$GLOBALS['BATTY_EVENTS'] = [];
function event(array $e): void { $GLOBALS['BATTY_EVENTS'][] = $e; }

function lock_user(int $id): array {
    $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$id]);
    if (!$u) throw new ApiError('Account not found.', 404);
    foreach (['balance', 'ver', 'wagered', 'won', 'rounds', 'level', 'best_win', 'games_mask', 'streak', 'is_admin', 'banned'] as $k) $u[$k] = (int) $u[$k];
    $u['best_x'] = (float) $u['best_x'];
    if ($u['banned']) throw new ApiError('This account has been suspended.', 403);
    return $u;
}
function save_user(array $u): void {
    q('UPDATE users SET balance=?, ver=?, wagered=?, won=?, rounds=?, level=?, best_win=?, best_x=?, best_game=?, games_mask=?, streak=?, streak_day=?, moon_card=?, last_seen=? WHERE id=?', [
        $u['balance'], $u['ver'], $u['wagered'], $u['won'], $u['rounds'], $u['level'], $u['best_win'], $u['best_x'], $u['best_game'], $u['games_mask'],
        $u['streak'], $u['streak_day'], $u['moon_card'], now_sql(), $u['id'],
    ]);
}
function msnow(): string { $t = microtime(true); return gmdate('Y-m-d H:i:s', (int) $t) . sprintf('.%03d', (int) (($t - floor($t)) * 1000)); }

/* Move money. Negative amounts must be covered by the balance. */
function credit(array &$u, int $amount, string $kind, ?string $game = null, ?int $roundId = null, string $note = ''): void {
    if ($amount === 0 && $kind !== 'bet') return;
    if ($u['balance'] + $amount < 0) throw new ApiError('Not enough Batty Bucks.', 402);
    $u['balance'] += $amount; $u['ver']++;
    q('INSERT INTO ledger (user_id, kind, game, amount, balance, round_id, note, created_at) VALUES (?,?,?,?,?,?,?,?)', [$u['id'], $kind, $game, $amount, $u['balance'], $roundId, mb_substr($note, 0, 120), msnow()]);
}

/* ---------- levels ---------- */
function level_floor(int $L): int { return (int) round(10000 * pow($L - 1, 1.6)); }
function add_wager(array &$u, int $stake): void {
    $u['wagered'] += $stake;
    while ($u['wagered'] >= level_floor($u['level'] + 1)) {
        $u['level']++;
        $gift = 500 * $u['level'];
        credit($u, $gift, 'level', null, null, 'Reached level ' . $u['level']);
        event(['type' => 'level', 'level' => $u['level'], 'amount' => $gift]);
    }
}
function claim_amount(int $level): int { return 2500 + 250 * ($level - 1); }

/* ---------- rounds ---------- */
/* One-shot round: stake taken and win paid together. */
function round_quick(array &$u, string $game, int $stake, int $win, array $facts): int {
    if ($u['balance'] < $stake) throw new ApiError('Not enough Batty Bucks.', 402);
    $x = $stake > 0 ? round($win / $stake, 2) : 0;
    q('INSERT INTO rounds (user_id, game, stake, win, x, balls, state, created_at, settled_at) VALUES (?,?,?,?,?,?,?,?,?)', [$u['id'], $game, $stake, $win, $facts['x'] ?? $x, $facts['rounds'] ?? 1, 'done', msnow(), msnow()]);
    $rid = (int) db()->lastInsertId();
    credit($u, $win - $stake, 'round', $game, $rid, ($facts['rounds'] ?? 1) > 1 ? ($facts['rounds'] . ' balls') : '');
    add_wager($u, $stake);
    after_round($u, $game, $stake, $win, $facts);
    return $rid;
}
/* Two-step round (a pick, or a live flight): stake taken now, winnings paid when it closes. */
function round_open(array &$u, string $game, int $stake, array $data): int {
    if ($u['balance'] < $stake) throw new ApiError('Not enough Batty Bucks.', 402);
    q('INSERT INTO rounds (user_id, game, stake, state, data, created_at) VALUES (?,?,?,?,?,?)', [$u['id'], $game, $stake, 'open', json_encode($data), msnow()]);
    $rid = (int) db()->lastInsertId();
    credit($u, -$stake, 'bet', $game, $rid);
    add_wager($u, $stake);
    return $rid;
}
function round_get_open(array $u, string $game, ?int $rid = null): ?array {
    $r = $rid ? q1("SELECT * FROM rounds WHERE id = ? AND user_id = ? AND game = ? AND state = 'open' FOR UPDATE", [$rid, $u['id'], $game])
              : q1("SELECT * FROM rounds WHERE user_id = ? AND game = ? AND state = 'open' ORDER BY id LIMIT 1 FOR UPDATE", [$u['id'], $game]);
    if ($r) $r['data'] = json_decode($r['data'], true);
    return $r;
}
function round_save_data(int $rid, array $data): void { q('UPDATE rounds SET data = ? WHERE id = ?', [json_encode($data), $rid]); }
/* $alreadyPaid: winnings from this round that were credited before it closed (Moonshot cash-outs). */
function round_close(array &$u, array $r, int $win, array $facts, int $alreadyPaid = 0): void {
    $stake = (int) $r['stake'];
    credit($u, $win - $alreadyPaid, 'win', $r['game'], (int) $r['id']);
    $x = $facts['x'] ?? ($stake > 0 ? round($win / $stake, 2) : 0);
    q("UPDATE rounds SET state = 'done', win = ?, x = ?, data = NULL, settled_at = ? WHERE id = ?", [$win, $x, msnow(), $r['id']]);
    after_round($u, $r['game'], $stake, $win, $facts);
}

/* Stats, records, streak, feed, missions, achievements. */
function after_round(array &$u, string $game, int $stake, int $win, array $f): void {
    $n = $f['rounds'] ?? 1;
    $bigWin = $f['bigWin'] ?? $win;
    $bigX = (float) ($f['x'] ?? ($stake > 0 ? $win / $stake : 0));
    $u['won'] += $win; $u['rounds'] += $n;
    $u['games_mask'] |= 1 << array_search($game, BATTY_GAMES, true);
    if ($bigWin > $u['best_win']) { $u['best_win'] = $bigWin; $u['best_game'] = $game; }
    if ($bigX > $u['best_x']) $u['best_x'] = round($bigX, 2);
    q('INSERT INTO user_games (user_id, game, rounds, wagered, won, best_win, best_x) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE rounds = rounds + VALUES(rounds), wagered = wagered + VALUES(wagered), won = won + VALUES(won), best_win = GREATEST(best_win, VALUES(best_win)), best_x = GREATEST(best_x, VALUES(best_x))',
       [$u['id'], $game, $n, $stake, $win, $bigWin, round($bigX, 2)]);
    /* streak of days played (UK days) */
    $today = uk_day();
    if ($u['streak_day'] !== $today) {
        $yesterday = (new DateTime($today))->modify('-1 day')->format('Y-m-d');
        $u['streak'] = $u['streak_day'] === $yesterday ? $u['streak'] + 1 : 1;
        $u['streak_day'] = $today;
    }
    /* big-wins feed */
    if (($bigX >= 25 && $bigWin >= 2500) || ($bigWin >= 50000 && $bigX >= 5) || !empty($f['feedLabel'])) {   // big amounts count only when the win is also big for the stake (High Roller stakes are large)
        if ($bigWin >= 1000) {
            q('INSERT INTO feed (user_id, game, amount, x, label, created_at) VALUES (?,?,?,?,?,?)', [$u['id'], $game, $bigWin, round($bigX, 2), mb_substr($f['feedLabel'] ?? '', 0, 60), now_sql()]);
        }
    }
    if ($bigX >= 10 && $stake > 0) event(['type' => 'bigwin', 'x' => round($bigX, 2), 'amount' => $bigWin]);
    missions_progress($u, $game, $stake, $win, $bigX, $f);
    rtp_record($game, $stake, $win);
    achievements_check($u, $game, $bigX, $f);
    /* Platform: Bat Pass XP and pass challenges (lib/platform/pass.php) */
    if (function_exists('plat_after_round')) plat_safe(function () use (&$u, $game, $stake, $win, $f, $bigX) { plat_after_round($u, $game, $stake, $win, $f, $bigX); }, null);
}
function uk_day(): string { return (new DateTime('now', new DateTimeZone('Europe/London')))->format('Y-m-d'); }

/* ---------- daily missions ---------- */
/* Games the daily "play this game" mission can pick: everything on the floor except the level-gated High Roller Lounge. */
const MISSION_GAMES = ['spin_bunky', 'spin_olympus', 'spin_fishing', 'spin_plachinko', 'spin_moonshot', 'spin_circus', 'spin_bonkers', 'spin_crypt', 'spin_nighttrain',
    'spin_gummy', 'spin_bookofbats', 'spin_derby', 'spin_ultraheist', 'spin_bonanza', 'spin_starwing', 'spin_batjack'];
function mission_tier(int $level): int { return 1 + intdiv($level, 5); }
function mission_defs(): array {
    return [
        'spin_bunky' => ['Play 20 rounds of Bunky Time', 20, 2000],
        'spin_olympus' => ['Spin 40 times on Raging Cocks of Olympus 2', 40, 2000],
        'spin_fishing' => ['Spin 40 times on Fishing Frenzy', 40, 2000],
        'spin_plachinko' => ['Drop 300 balls in Plachinko', 300, 2000],
        'spin_moonshot' => ["Fly 15 times in Batty's Moonshot", 15, 2000],
        'spin_roulette' => ['Play 15 spins of Bat Signal Roulette', 15, 2000],
        'spin_circus' => ['Spin 40 times on Batty Circus', 40, 2000],
        'spin_bonkers' => ['Play 15 rounds of Bonkers Time', 15, 2000],
        'spin_crypt' => ["Spin 40 times in Count Batula's Crypt", 40, 2000],
        'spin_nighttrain' => ['Spin 40 times on Night Train', 40, 2000],
        'spin_gummy' => ['Spin 40 times on Gummy Bats', 40, 2000],
        'spin_bookofbats' => ['Spin 40 times on Book of Bats', 40, 2000],
        'spin_derby' => ['Back 10 races in Bat Derby', 10, 2000],
        'spin_ultraheist' => ['Spin 40 times on Bat Bandits UltraNudge', 40, 2000],
        'spin_bonanza' => ['Spin 40 times on Sugar Fang Bonanza', 40, 2000],
        'spin_starwing' => ['Spin 40 times on Starwing', 40, 2000],
        'spin_batjack' => ['Play 15 hands of Bat Jack', 15, 2000],
        'wager' => ['Wager {t} Batty Bucks', 20000, 3000],
        'win' => ['Win {t} Batty Bucks', 15000, 3000],
        'variety' => ['Play 3 different games', 3, 3000],
        'big' => ['Land a win worth 10× your stake', 1, 4000],
        'bonus' => ['Trigger 3 bonus features', 3, 4000],
        'moon5' => ["Cash out at 5× or higher in Batty's Moonshot", 1, 4000],
    ];
}
function missions_ensure(array $u): string {
    $day = uk_day();
    $have = (int) qv('SELECT COUNT(*) FROM missions WHERE user_id = ? AND day = ?', [$u['id'], $day]);
    if ($have >= 3) return $day;
    $defs = mission_defs(); $tier = mission_tier((int) $u['level']);
    $h = crc32($u['id'] . '|' . $day);
    $slots = [
        MISSION_GAMES[$h % count(MISSION_GAMES)],
        ['wager', 'win', 'variety'][intdiv($h, 16) % 3],
        ['big', 'bonus', 'moon5'][intdiv($h, 48) % 3],
    ];
    foreach ($slots as $i => $m) {
        [$label, $target, $reward] = $defs[$m];
        if ($m === 'wager' || $m === 'win') $target *= $tier;
        $reward = (int) round($reward * (1 + 0.5 * ($tier - 1)) / 100) * 100;
        q('INSERT IGNORE INTO missions (user_id, day, slot, mission, target, reward) VALUES (?,?,?,?,?,?)', [$u['id'], $day, $i, $m, $target, $reward]);
    }
    return $day;
}
function missions_list(array $u): array {
    $day = missions_ensure($u); $defs = mission_defs();
    $rows = q('SELECT slot, mission, target, progress, reward, claimed FROM missions WHERE user_id = ? AND day = ? ORDER BY slot', [$u['id'], $day])->fetchAll();
    return array_map(fn($r) => [
        'slot' => (int) $r['slot'], 'id' => $r['mission'], 'label' => str_replace('{t}', number_format((int) $r['target']), $defs[$r['mission']][0] ?? $r['mission']),
        'target' => (int) $r['target'], 'progress' => (int) $r['progress'], 'reward' => (int) $r['reward'], 'claimed' => (bool) $r['claimed'],
        'game' => str_starts_with($r['mission'], 'spin_') ? substr($r['mission'], 5) : null,
    ], $rows);
}
function missions_progress(array &$u, string $game, int $stake, int $win, float $x, array $f): void {
    $day = missions_ensure($u); $defs = mission_defs();
    $rows = q('SELECT * FROM missions WHERE user_id = ? AND day = ? AND claimed = 0 AND progress < target', [$u['id'], $day])->fetchAll();
    foreach ($rows as $m) {
        $add = 0; $meta = $m['meta'];
        switch ($m['mission']) {
            case 'spin_' . $game: $add = $f['rounds'] ?? 1; break;
            case 'wager': $add = $stake; break;
            case 'win': $add = $win; break;
            case 'big': $add = ($x >= 10 && $stake > 0) ? 1 : 0; break;
            case 'bonus': $add = $f['bonus'] ?? 0; break;
            case 'moon5': $add = !empty($f['moon5']) ? 1 : 0; break;
            case 'variety':
                $mask = (int) $meta | (1 << array_search($game, BATTY_GAMES, true));
                $meta = (string) $mask; $add = substr_count(decbin($mask), '1') - (int) $m['progress'];
                break;
        }
        if ($add <= 0 && $meta === $m['meta']) continue;
        $p = min((int) $m['target'], (int) $m['progress'] + max(0, $add));
        q('UPDATE missions SET progress = ?, meta = ? WHERE user_id = ? AND day = ? AND slot = ?', [$p, $meta, $u['id'], $day, $m['slot']]);
        if ($p >= (int) $m['target'] && (int) $m['progress'] < (int) $m['target']) {
            event(['type' => 'mission', 'label' => str_replace('{t}', number_format((int) $m['target']), $defs[$m['mission']][0]), 'reward' => (int) $m['reward']]);
        }
    }
}
function mission_claim(array &$u, int $slot): int {
    $day = uk_day();
    $m = q1('SELECT * FROM missions WHERE user_id = ? AND day = ? AND slot = ? FOR UPDATE', [$u['id'], $day, $slot]);
    if (!$m) throw new ApiError('That mission has expired.');
    if ((int) $m['claimed']) throw new ApiError('Already claimed.');
    if ((int) $m['progress'] < (int) $m['target']) throw new ApiError('Not finished yet.');
    q('UPDATE missions SET claimed = 1 WHERE user_id = ? AND day = ? AND slot = ?', [$u['id'], $day, $slot]);
    credit($u, (int) $m['reward'], 'mission', null, null, $m['mission']);
    $done = (int) qv('SELECT COUNT(*) FROM missions WHERE user_id = ? AND claimed = 1', [$u['id']]);
    if ($done >= 10) unlock($u, 'missions');
    return (int) $m['reward'];
}

/* ---------- achievements ---------- */
function achievement_defs(): array {
    return [
        'first' => ['Fresh Blood', 'Play your first round', 500],
        'bonus1' => ['Feature Creature', 'Trigger any bonus feature', 1000],
        'x50' => ['Batty Win', 'Land a win worth 50× your stake', 2500],
        'x250' => ['Absolutely Batsh!t', 'Land a win worth 250× your stake', 10000],
        'allgames' => ['Night Crawler', 'Play every game in the casino', 2000],
        'lvl10' => ['Regular', 'Reach level 10', 5000],
        'lvl25' => ['Part of the Furniture', 'Reach level 25', 25000],
        'roller' => ['High Roller', 'Wager 1,000,000 Batty Bucks in total', 10000],
        'million' => ['Millionaire Bat', 'Hold 1,000,000 Batty Bucks at once', 10000],
        'pantheon' => ['Full Pantheon', 'Wake all five rooster gods in one Cock Combo', 5000],
        'grand' => ['Grand Cock', 'Win the Grand jackpot', 20000],
        'vip' => ['On the List', 'Win in the VIP Crypt Disco', 2500],
        'ladder10' => ['Top of the Ladder', 'Reach the ×10 fish multiplier', 5000],
        'batty' => ['Batty Fever', 'Trigger BATTY FEVER in Plachinko', 5000],
        'moon100' => ['Over the Moon', 'Cash out at 100× or higher', 10000],
        'stamps' => ['Card Shark', 'Fill a Moon Stamps card', 2500],
        'lightning' => ['Struck by Lightning', 'Win a straight-up on a Bat Signal number', 2500],
        'bolt500' => ['Bat Out of Hell', 'Hit a 500× Bat Signal number', 10000],
        'streak7' => ['Creature of Habit', 'Play on 7 days in a row', 5000],
        'missions' => ['Mission Bat', 'Complete 10 daily missions', 5000],
    ];
}
function unlock(array &$u, string $id): void {
    $defs = achievement_defs(); if (!isset($defs[$id])) return;
    $st = q('INSERT IGNORE INTO achievements (user_id, ach, unlocked_at) VALUES (?,?,?)', [$u['id'], $id, now_sql()]);
    if ($st->rowCount() < 1) return;
    [$name, $desc, $reward] = $defs[$id];
    credit($u, $reward, 'achieve', null, null, $name);
    event(['type' => 'achievement', 'id' => $id, 'name' => $name, 'desc' => $desc, 'reward' => $reward]);
}
function achievements_check(array &$u, string $game, float $x, array $f): void {
    $want = ['first'];
    if (!empty($f['bonus'])) $want[] = 'bonus1';
    if ($x >= 50) $want[] = 'x50';
    if ($x >= 250) $want[] = 'x250';
    $floor = 0; foreach (BATTY_GAMES as $i => $g) if (!in_array($g, BATTY_HIDDEN_GAMES, true)) $floor |= 1 << $i;
    if (($u['games_mask'] & $floor) === $floor) $want[] = 'allgames';
    if ($u['level'] >= 10) $want[] = 'lvl10';
    if ($u['level'] >= 25) $want[] = 'lvl25';
    if ($u['wagered'] >= 1000000) $want[] = 'roller';
    if ($u['balance'] >= 1000000) $want[] = 'million';
    if ($u['streak'] >= 7) $want[] = 'streak7';
    foreach (['pantheon', 'grand', 'vip', 'ladder10', 'batty', 'moon100', 'stamps', 'lightning', 'bolt500'] as $k) if (!empty($f[$k])) $want[] = $k;
    $have = array_column(q('SELECT ach FROM achievements WHERE user_id = ?', [$u['id']])->fetchAll(), 'ach');
    foreach ($want as $a) if (!in_array($a, $have, true)) unlock($u, $a);
}
