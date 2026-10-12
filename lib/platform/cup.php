<?php
/* The Batty Cup: a weekly tournament (Monday to Sunday, UK time).
   Score: your best single round of the week as a multiple of your stake (x). Ranking by multiplier, not by amount, lets a
   100 BB stake compete with a 1,000,000 BB stake. Rounds count when the stake is at least CUP_MIN_STAKE and the game is a
   slot, arcade or live game show (the table games' multipliers are too small to compete). Ties go to whoever got there first.
   The server records scores from the round's own result (after_round), so a browser can never submit one.
   Top CUP_PRIZES win Batty Bucks. Weeks are settled the first time anyone opens the Cup after they end; every prize is
   guarded by cup_prizes' primary key, so it is paid exactly once. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const CUP_MIN_STAKE = 100;
const CUP_PRIZES = [250000, 120000, 60000, 30000, 20000, 15000, 12000, 10000, 8000, 5000];
const CUP_EXCLUDED = ['batjack', 'royale', 'baccarat', 'roulette'];

function cup_week_start(?int $t = null): string {
    $d = (new DateTime('@' . ($t ?? plat_time())))->setTimezone(new DateTimeZone('Europe/London'));
    $d->setTime(0, 0); $d->modify('-' . ((int) $d->format('N') - 1) . ' days');
    return $d->format('Y-m-d');
}
function cup_week_end_secs(): int {
    $s = new DateTime(cup_week_start() . ' 00:00', new DateTimeZone('Europe/London'));
    $s->modify('+7 days');
    return max(0, $s->getTimestamp() - plat_time());
}
/* Called from plat_after_round for every finished round. */
function cup_record(array $u, string $game, int $stake, int $win, float $x): void {
    if ($stake < CUP_MIN_STAKE || $win <= 0 || $x <= 0 || in_array($game, CUP_EXCLUDED, true)) return;
    q('INSERT INTO cup_scores (week, user_id, best_x, best_win, stake, game, at) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE entries = entries + 1,
         best_win = IF(VALUES(best_x) > best_x, VALUES(best_win), best_win), stake = IF(VALUES(best_x) > best_x, VALUES(stake), stake),
         game = IF(VALUES(best_x) > best_x, VALUES(game), game), at = IF(VALUES(best_x) > best_x, VALUES(at), at),
         best_x = IF(VALUES(best_x) > best_x, VALUES(best_x), best_x)',
      [cup_week_start(), $u['id'], round($x, 2), $win, $stake, $game, msnow()]);
}
function cup_board(string $week, int $limit = 50): array {
    return q('SELECT s.user_id, s.best_x, s.best_win, s.stake, s.game, s.entries, u.username, u.avatar, u.level FROM cup_scores s JOIN users u ON u.id = s.user_id
              WHERE s.week = ? AND u.banned = 0 ORDER BY s.best_x DESC, s.at ASC, s.user_id ASC LIMIT ' . (int) $limit, [$week])->fetchAll();
}
/* Pay out every finished week that is still unpaid (at most the last 8, so a long-dormant site settles quickly). */
function cup_settle(): void {
    $cur = cup_week_start();
    $weeks = q('SELECT DISTINCT week FROM cup_scores WHERE week < ? AND week >= ? ORDER BY week', [$cur, gmdate('Y-m-d', strtotime($cur . ' -56 days'))])->fetchAll(PDO::FETCH_COLUMN);
    foreach ($weeks as $w) {
        foreach (cup_board($w, count(CUP_PRIZES)) as $i => $r) {
            $place = $i + 1;
            if (q1('SELECT 1 FROM cup_prizes WHERE week = ? AND place = ?', [$w, $place])) continue;
            tx(function () use ($w, $place, $r) {
                $uid = (int) $r['user_id'];
                $u = lock_user($uid);
                $n = q('INSERT IGNORE INTO cup_prizes (week, place, user_id, best_x, amount, paid_at) VALUES (?,?,?,?,?,?)', [$w, $place, $uid, $r['best_x'], CUP_PRIZES[$place - 1], now_sql()])->rowCount();
                if (!$n) return;
                credit($u, CUP_PRIZES[$place - 1], 'cup', null, null, 'Batty Cup, week of ' . $w . ': place ' . $place);
                save_user($u);
            });
        }
    }
}
function cup_api_state(): array {
    $me = require_user();
    cup_settle();
    $week = cup_week_start();
    $rows = cup_board($week, 50);
    $out = [];
    foreach ($rows as $i => $r) $out[] = ['rank' => $i + 1, 'id' => (int) $r['user_id'], 'name' => $r['username'], 'avatar' => $r['avatar'], 'level' => (int) $r['level'],
        'x' => (float) $r['best_x'], 'win' => (int) $r['best_win'], 'stake' => (int) $r['stake'], 'game' => $r['game'], 'prize' => CUP_PRIZES[$i] ?? 0];
    $mine = q1('SELECT * FROM cup_scores WHERE week = ? AND user_id = ?', [$week, $me['id']]);
    $my = null;
    if ($mine) {
        $rank = 1 + (int) qv('SELECT COUNT(*) FROM cup_scores s JOIN users u ON u.id = s.user_id WHERE s.week = ? AND u.banned = 0 AND (s.best_x > ? OR (s.best_x = ? AND (s.at < ? OR (s.at = ? AND s.user_id < ?))))',
            [$week, $mine['best_x'], $mine['best_x'], $mine['at'], $mine['at'], $me['id']]);
        $my = ['rank' => $rank, 'x' => (float) $mine['best_x'], 'win' => (int) $mine['best_win'], 'stake' => (int) $mine['stake'], 'game' => $mine['game'], 'entries' => (int) $mine['entries']];
    }
    $last = null;
    $pw = gmdate('Y-m-d', strtotime($week . ' -7 days'));
    $pr = q('SELECT p.place, p.best_x, p.amount, u.id, u.username, u.avatar FROM cup_prizes p JOIN users u ON u.id = p.user_id WHERE p.week = ? ORDER BY p.place LIMIT 3', [$pw])->fetchAll();
    if ($pr) {
        $mp = q1('SELECT place, amount FROM cup_prizes WHERE week = ? AND user_id = ?', [$pw, $me['id']]);
        $last = ['week' => $pw, 'podium' => array_map(fn($r) => ['place' => (int) $r['place'], 'id' => (int) $r['id'], 'name' => $r['username'], 'avatar' => $r['avatar'], 'x' => (float) $r['best_x'], 'amount' => (int) $r['amount']], $pr),
            'mine' => $mp ? ['place' => (int) $mp['place'], 'amount' => (int) $mp['amount']] : null];
    }
    $fresh = q('SELECT COUNT(*) FROM cup_prizes WHERE user_id = ? AND paid_at > ?', [$me['id'], gmdate('Y-m-d H:i:s', time() - 120)])->fetchColumn();
    $u = current_user();
    return ['week' => $week, 'endsIn' => cup_week_end_secs(), 'minStake' => CUP_MIN_STAKE, 'prizes' => CUP_PRIZES, 'rows' => $out, 'mine' => $my, 'last' => $last,
        'paidNow' => (int) $fresh > 0, 'bal' => $u ? (int) $u['balance'] : null, 'ver' => $u ? (int) $u['ver'] : null];
}
