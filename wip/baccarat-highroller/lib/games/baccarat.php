<?php
/* Velvet Baccarat: one shared Punto Banco table in the High Roller Lounge (level 5 and up).
   One 8-deck shoe is persisted in bac_shoes and dealt hand after hand, every ~25 s, whether anyone bets or not.
   There is no cron: whichever request arrives after a hand's result beat deals the next hand (lock row bac_lock in
   settings, server timestamps). A hand's cards are drawn from the shoe when it is created and only leave the server
   once betting has closed. Every player's chips are a `rounds` row (round_open), settled by round_close when the
   hand's result time has passed: on their own next poll, or by anyone else's poll 8 s later, so a player who walks
   away is still paid. The maths below is a line-for-line port of the JS in games/baccarat/game.js
   (proved by tools/baccarat-xcheck.js). */
if (!defined('BATTY')) { http_response_code(403); exit; }

const BAC_DECKS = 8;
const BAC_SHOE_N = 416;
const BAC_CHIPS = [2000, 5000, 10000, 25000, 50000, 100000, 250000];   // the High Roller stake ladder, as chips
const BAC_SPOTS = ['P', 'B', 'T', 'PP', 'BP', 'PD', 'BD'];
const BAC_LIMIT = ['P' => 2500000, 'B' => 2500000, 'T' => 250000, 'PP' => 100000, 'BP' => 100000, 'PD' => 100000, 'BD' => 100000];
const BAC_MAX_WIN = 10500000;            // per hand; the table limits keep every real hand below it
const BAC_MIN_LEVEL = 5;
/* the table clock, in seconds (identical in the JS) */
const BAC_BET_S = 12.0;      // betting window
const BAC_SHUFFLE_S = 7.0;   // a new shoe: shuffle, cut and burn before betting opens
const BAC_BASE_S = 7.6;      // close -> four cards dealt, Player squeezed, Banker squeezed
const BAC_THIRD_S = 2.2;     // each third card (dealt and squeezed)
const BAC_END_S = 0.4;       // last card -> result
const BAC_REST_S = 3.0;      // result on show before the next hand

/* ---------------- the maths (pure; mirrors the JS) ---------------- */
/* card: 0..51, rank = c % 13 (0 ace .. 8 nine, 9 ten, 10 jack, 11 queen, 12 king), suit = intdiv(c, 13) */
function bac_val(int $c): int { $r = $c % 13; return $r >= 9 ? 0 : $r + 1; }
function bac_newShoe(Closure $rng): array {
    $s = [];
    for ($i = 0; $i < BAC_SHOE_N; $i++) $s[] = $i % 52;
    for ($i = BAC_SHOE_N - 1; $i > 0; $i--) { $j = (int) floor($rng() * ($i + 1)); $t = $s[$i]; $s[$i] = $s[$j]; $s[$j] = $t; }
    $cut = BAC_SHOE_N - 14 - (int) floor($rng() * 5);   // 14 to 18 cards sit behind the cut card
    $burnN = bac_val($s[0]) ?: 10;                         // the first card is shown and that many burned
    return ['cards' => $s, 'cut' => $cut, 'pos' => 1 + $burnN, 'burn' => $s[0]];
}
/* Deal one hand from $pos (P, B, P, B, then the third-card rules). */
function bac_deal(array $cards, int $pos): array {
    $p = [$cards[$pos], $cards[$pos + 2]]; $b = [$cards[$pos + 1], $cards[$pos + 3]]; $k = $pos + 4;
    $pt = (bac_val($p[0]) + bac_val($p[1])) % 10; $bt = (bac_val($b[0]) + bac_val($b[1])) % 10;
    $pn = $pt; $bn = $bt;
    if ($pt < 8 && $bt < 8) {
        $p3 = -1;
        if ($pt <= 5) { $c = $cards[$k++]; $p[] = $c; $p3 = bac_val($c); $pt = ($pt + $p3) % 10; }
        if ($p3 < 0) $draw = $bt <= 5;
        else $draw = $bt <= 2 || ($bt === 3 && $p3 !== 8) || ($bt === 4 && $p3 >= 2 && $p3 <= 7) || ($bt === 5 && $p3 >= 4 && $p3 <= 7) || ($bt === 6 && ($p3 === 6 || $p3 === 7));
        if ($draw) { $c = $cards[$k++]; $b[] = $c; $bt = ($bt + bac_val($c)) % 10; }
    }
    return ['p' => $p, 'b' => $b, 'pt' => $pt, 'bt' => $bt, 'pn' => $pn, 'bn' => $bn,
        'res' => $pt > $bt ? 'P' : ($bt > $pt ? 'B' : 'T'), 'pp' => $p[0] % 13 === $p[1] % 13, 'bp' => $b[0] % 13 === $b[1] % 13, 'pos' => $k];
}
/* Rebuild a dealt hand's facts from its cards. */
function bac_facts(array $p, array $b): array {
    $sum = fn($cs) => array_sum(array_map('bac_val', $cs)) % 10;
    $pt = $sum($p); $bt = $sum($b);
    return ['p' => $p, 'b' => $b, 'pt' => $pt, 'bt' => $bt, 'pn' => (bac_val($p[0]) + bac_val($p[1])) % 10, 'bn' => (bac_val($b[0]) + bac_val($b[1])) % 10,
        'res' => $pt > $bt ? 'P' : ($bt > $pt ? 'B' : 'T'), 'pp' => $p[0] % 13 === $p[1] % 13, 'bp' => $b[0] % 13 === $b[1] % 13];
}
/* Dragon Bonus: what a 1-unit bet on $side returns (stake included). Natural win 1:1, natural tie push,
   non-natural win by 9 / 8 / 7 / 6 / 5 / 4 points pays 30 / 10 / 6 / 4 / 2 / 1 to 1; anything else loses. */
function bac_dragon(array $h, string $side): int {
    $my = $side === 'P' ? $h['pt'] : $h['bt']; $ot = $side === 'P' ? $h['bt'] : $h['pt'];
    $myN = ($side === 'P' ? $h['pn'] : $h['bn']) >= 8 && count($side === 'P' ? $h['p'] : $h['b']) === 2;
    $otN = ($side === 'P' ? $h['bn'] : $h['pn']) >= 8 && count($side === 'P' ? $h['b'] : $h['p']) === 2;
    if ($my < $ot) return 0;
    if ($my === $ot) return ($myN && $otN) ? 1 : 0;
    if ($myN) return 2;
    return [9 => 31, 8 => 11, 7 => 7, 6 => 5, 5 => 3, 4 => 2][$my - $ot] ?? 0;
}
/* What a set of bets returns on a hand (stakes included), spot by spot. */
function bac_settle(array $bets, array $h): array {
    $by = []; $total = 0;
    foreach (BAC_SPOTS as $k) {
        if (!isset($bets[$k])) continue;
        $s = (int) $bets[$k];
        switch ($k) {
            case 'P': $w = $h['res'] === 'P' ? 2 * $s : ($h['res'] === 'T' ? $s : 0); break;
            case 'B': $w = $h['res'] === 'B' ? $s + intdiv($s * 95, 100) : ($h['res'] === 'T' ? $s : 0); break;
            case 'T': $w = $h['res'] === 'T' ? 9 * $s : 0; break;
            case 'PP': $w = $h['pp'] ? 12 * $s : 0; break;
            case 'BP': $w = $h['bp'] ? 12 * $s : 0; break;
            case 'PD': $w = $s * bac_dragon($h, 'P'); break;
            default: $w = $s * bac_dragon($h, 'B');
        }
        $by[$k] = $w; $total += $w;
    }
    return ['total' => min($total, BAC_MAX_WIN), 'by' => $by];
}
/* null when the bets are legal, otherwise why not. Chips only: every amount is a sum of ladder chips. */
function bac_check($bets): ?string {
    if (!is_array($bets)) return 'Bad bets';
    foreach ($bets as $k => $v) {
        if (!in_array($k, BAC_SPOTS, true)) return 'Unknown bet spot';
        if (!is_int($v) || $v < BAC_CHIPS[0] || $v % 1000 !== 0 || $v === 3000) return 'Bets are made with the table chips';
        if ($v > BAC_LIMIT[$k]) return 'That spot is at its table limit';
    }
    if (isset($bets['P'], $bets['B'])) return 'Back the Player or the Banker, not both';
    return null;
}
function bac_resultAfter(array $d): float { return BAC_BASE_S + BAC_THIRD_S * (count($d['p']) + count($d['b']) - 4) + BAC_END_S; }

/* ---------------- the shared table ---------------- */
function bac_row(array $h): array {
    foreach (['start_at', 'open_at', 'close_at', 'result_at'] as $k) $h[$k] = (float) $h[$k];
    foreach (['id', 'shoe_id', 'hand_no', 'pt', 'bt', 'left_before', 'left_cards', 'burn', 'last', 'shuffle'] as $k) $h[$k] = (int) $h[$k];
    $h['p'] = json_decode($h['p'], true); $h['b'] = json_decode($h['b'], true);
    return $h;
}
function bac_lock(): void { q("INSERT IGNORE INTO settings (k, v) VALUES ('bac_lock', '')"); qv("SELECT v FROM settings WHERE k = 'bac_lock' FOR UPDATE"); }
/* The hand on the table now, dealing the next one from the shoe if the last one's result beat is over.
   Runs inside play()'s transaction, so the re-read after taking the lock must be a locking read. */
function bac_current(): array {
    $now = microtime(true);
    $h = q1('SELECT * FROM bac_hands ORDER BY id DESC LIMIT 1');
    if ($h && $now < (float) $h['result_at'] + BAC_REST_S) return bac_row($h);
    bac_lock();
    $h = q1('SELECT * FROM bac_hands ORDER BY id DESC LIMIT 1 LOCK IN SHARE MODE');
    $now = microtime(true);
    if ($h && $now < (float) $h['result_at'] + BAC_REST_S) return bac_row($h);
    $shoe = q1('SELECT * FROM bac_shoes ORDER BY id DESC LIMIT 1 FOR UPDATE');
    $shuffle = !$shoe || (int) $shoe['pos'] >= (int) $shoe['cut'];
    if ($shuffle) {
        $s = bac_newShoe(batty_rng());
        q('INSERT INTO bac_shoes (cards, cut, pos, burn, hands, created_at) VALUES (?,?,?,?,0,?)', [json_encode($s['cards']), $s['cut'], $s['pos'], $s['burn'], $now]);
        $shoe = q1('SELECT * FROM bac_shoes WHERE id = ? FOR UPDATE', [(int) db()->lastInsertId()]);
    }
    $pos = (int) $shoe['pos'];
    $d = bac_deal(json_decode($shoe['cards'], true), $pos);
    $start = $h ? max($now, (float) $h['result_at'] + BAC_REST_S) : $now;
    $open = $start + ($shuffle ? BAC_SHUFFLE_S : 0.0);
    $close = $open + BAC_BET_S;
    $no = (int) $shoe['hands'] + 1;
    q('UPDATE bac_shoes SET pos = ?, hands = ? WHERE id = ?', [$d['pos'], $no, $shoe['id']]);
    q('INSERT INTO bac_hands (shoe_id, hand_no, p, b, res, pt, bt, left_before, left_cards, burn, last, shuffle, start_at, open_at, close_at, result_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        $shoe['id'], $no, json_encode($d['p']), json_encode($d['b']), $d['res'], $d['pt'], $d['bt'], BAC_SHOE_N - $pos, BAC_SHOE_N - $d['pos'],
        $shuffle ? (int) $shoe['burn'] : -1, $d['pos'] >= (int) $shoe['cut'] ? 1 : 0, $shuffle ? 1 : 0, $start, $open, $close, $close + bac_resultAfter($d),
    ]);
    $id = (int) db()->lastInsertId();
    if ($id % 200 === 0) {   /* tidy up now and then */
        $old = $now - 3 * 86400;
        q('DELETE b FROM bac_bets b JOIN bac_hands h ON h.id = b.hand_id WHERE h.result_at < ?', [$old]);
        q('DELETE FROM bac_hands WHERE result_at < ? AND id < ?', [$old, $id - 1000]);
        q('DELETE FROM bac_shoes WHERE id < (SELECT m FROM (SELECT MIN(shoe_id) AS m FROM bac_hands) t)');
        q('DELETE FROM bac_seen WHERE seen_at < ?', [$now - 86400]);
    }
    return bac_row(q1('SELECT * FROM bac_hands WHERE id = ?', [$id]));
}
/* What every player may know about a hand at this instant: the cards only once betting has closed. */
function bac_public(array $h, float $now): array {
    $o = ['id' => $h['id'], 'no' => $h['hand_no'], 'shoe' => $h['shoe_id'], 'startAt' => $h['start_at'], 'openAt' => $h['open_at'], 'closeAt' => $h['close_at'],
        'shuffle' => (bool) $h['shuffle'], 'left' => $h['left_before']];
    if ($h['shuffle']) $o['burn'] = $h['burn'];
    if ($now >= $h['close_at']) { $o += ['p' => $h['p'], 'b' => $h['b'], 'resultAt' => $h['result_at'], 'last' => (bool) $h['last']]; $o['left'] = $h['left_cards']; }
    return $o;
}
function bac_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'baccarat' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
function bac_finish(array &$u, array $r): array {
    $d = $r['data'];
    $h = q1('SELECT * FROM bac_hands WHERE id = ?', [(int) $d['hand']]);
    if (!$h) {   /* the hand is long gone (tidied away): hand the stake back */
        q("UPDATE rounds SET state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $r['id']]);
        credit($u, (int) $r['stake'], 'refund', 'baccarat', (int) $r['id'], 'hand no longer on record');
        return ['hand' => (int) $d['hand'], 'won' => (int) $r['stake'], 'staked' => (int) $r['stake'], 'by' => (object) [], 'void' => true];
    }
    $h = bac_row($h);
    $F = bac_facts($h['p'], $h['b']);
    $res = bac_settle($d['bets'], $F);
    $stake = (int) $r['stake']; $win = $res['total']; $by = $res['by'];
    $dP = isset($d['bets']['PD']) ? bac_dragon($F, 'P') : 0; $dB = isset($d['bets']['BD']) ? bac_dragon($F, 'B') : 0;
    $side = ($by['T'] ?? 0) + ($by['PP'] ?? 0) + ($by['BP'] ?? 0);
    $f = ['bonus' => ($side > 0 || $dP >= 3 || $dB >= 3) ? 1 : 0];
    if ($stake > 0 && $win >= 8 * $stake) {
        $top = max($dP, $dB);
        if ($top >= 11) $f['feedLabel'] = 'Dragon Bonus ' . ($top - 1) . ':1';
        elseif (($by['T'] ?? 0) > 0) $f['feedLabel'] = 'Tie at ' . $F['pt'] . ' pays 8:1';
        elseif (($by['PP'] ?? 0) > 0 || ($by['BP'] ?? 0) > 0) $f['feedLabel'] = 'Pair pays 11:1';
    }
    round_close($u, $r, $win, $f);
    q('UPDATE bac_bets SET win = ? WHERE hand_id = ? AND user_id = ?', [$win, $h['id'], $u['id']]);
    return ['hand' => $h['id'], 'won' => $win, 'staked' => $stake, 'by' => $by ?: (object) []];
}
/* Settle the player's hands whose result time has passed; returns [settlements, the open round on $handId or null]. */
function bac_tidy(array &$u, ?int $handId, float $now): array {
    $done = []; $cur = null;
    foreach (bac_open_rounds($u) as $r) {
        if ($now >= (float) ($r['data']['resultAt'] ?? 0)) $done[] = bac_finish($u, $r);
        elseif ($handId !== null && (int) $r['data']['hand'] === $handId) $cur = $r;
    }
    return [$done, $cur];
}
/* Pay a few other players whose hands ended 8 s ago or more (they gave up waiting, or closed the tab).
   Players whose row is busy are skipped (SKIP LOCKED), so two polls can never wait on each other. */
function bac_settle_others(int $me, float $now): void {
    $ev = $GLOBALS['BATTY_EVENTS'];
    $rows = q("SELECT DISTINCT user_id FROM rounds WHERE game = 'baccarat' AND state = 'open' AND user_id <> ? AND CAST(JSON_VALUE(data, '$.resultAt') AS DOUBLE) < ? LIMIT 4", [$me, $now - 8])->fetchAll();
    foreach ($rows as $o) {
        db()->exec('SAVEPOINT bac_other');
        try {
            if (!q1('SELECT id FROM users WHERE id = ? FOR UPDATE SKIP LOCKED', [(int) $o['user_id']])) continue;
            $v = lock_user((int) $o['user_id']);
            bac_tidy($v, null, $now);
            save_user($v);
            db()->exec('RELEASE SAVEPOINT bac_other');
        } catch (Throwable $e) { db()->exec('ROLLBACK TO SAVEPOINT bac_other'); }
    }
    $GLOBALS['BATTY_EVENTS'] = $ev;
}

/* ---------------- ops ---------------- */
function bac_state(array &$u): array {
    $h = bac_current();
    $now = microtime(true);
    [$done, $cur] = bac_tidy($u, $h['id'], $now);
    q('INSERT INTO bac_seen (user_id, seen_at) VALUES (?,?) ON DUPLICATE KEY UPDATE seen_at = VALUES(seen_at)', [$u['id'], $now]);
    bac_settle_others((int) $u['id'], $now);
    /* everyone's chips on this hand: the spots others have backed, and who squeezes */
    $spots = []; $bettors = []; $sq = ['P' => null, 'B' => null]; $big = ['P' => 0, 'B' => 0];
    foreach (q('SELECT b.user_id, b.bets, b.total, u.username, u.avatar, u.level FROM bac_bets b JOIN users u ON u.id = b.user_id WHERE b.hand_id = ? ORDER BY b.total DESC, b.user_id LIMIT 80', [$h['id']])->fetchAll() as $b) {
        $bets = json_decode($b['bets'], true) ?: []; $uid = (int) $b['user_id'];
        foreach (['P', 'B'] as $s) if (($bets[$s] ?? 0) > $big[$s]) { $big[$s] = $bets[$s]; $sq[$s] = $uid; }
        if ($uid !== (int) $u['id']) foreach ($bets as $k => $v) { $spots[$k] = $spots[$k] ?? ['n' => 0, 'amt' => 0]; $spots[$k]['n']++; $spots[$k]['amt'] += $v; }
        if (count($bettors) < 30) $bettors[] = ['id' => $uid, 'name' => $b['username'], 'avatar' => $b['avatar'], 'level' => (int) $b['level'], 'total' => (int) $b['total'], 'bets' => $bets ?: (object) []];
    }
    /* winners of the last hand with a result */
    $wh = $now >= $h['result_at'] ? $h : q1('SELECT * FROM bac_hands WHERE id < ? AND result_at <= ? ORDER BY id DESC LIMIT 1', [$h['id'], $now]);
    $winners = [];
    if ($wh) {
        if (is_string($wh['p'])) $wh = bac_row($wh);
        $F = bac_facts($wh['p'], $wh['b']);
        foreach (q('SELECT b.user_id, b.bets, b.total, u.username, u.avatar FROM bac_bets b JOIN users u ON u.id = b.user_id WHERE b.hand_id = ? LIMIT 200', [$wh['id']])->fetchAll() as $b) {
            $w = bac_settle(json_decode($b['bets'], true) ?: [], $F)['total'];
            if ($w > (int) $b['total']) $winners[] = ['id' => (int) $b['user_id'], 'name' => $b['username'], 'avatar' => $b['avatar'], 'win' => $w, 'net' => $w - (int) $b['total']];
        }
        usort($winners, fn($a, $b) => $b['net'] <=> $a['net']);
        $winners = array_slice($winners, 0, 10);
    }
    /* this shoe's results so far, for the roadmaps */
    $road = [];
    foreach (q('SELECT p, b, res, pt, bt FROM bac_hands WHERE shoe_id = ? AND result_at <= ? ORDER BY id', [$h['shoe_id'], $now])->fetchAll() as $r) {
        $p = json_decode($r['p'], true); $b = json_decode($r['b'], true);
        $road[] = [$r['res'], (int) $r['pt'], (int) $r['bt'], $p[0] % 13 === $p[1] % 13 ? 1 : 0, $b[0] % 13 === $b[1] % 13 ? 1 : 0, (count($p) === 2 && count($b) === 2 && max((int) $r['pt'], (int) $r['bt']) >= 8) ? 1 : 0];
    }
    $players = (int) qv('SELECT COUNT(*) FROM bac_seen WHERE seen_at > ?', [$now - 6]);
    return [
        'hand' => bac_public($h, $now), 'mine' => $cur ? $cur['data']['bets'] : (object) [], 'settled' => $done,
        'players' => $players, 'bettors' => $bettors, 'spots' => $spots ?: (object) [], 'squeeze' => $sq,
        'winners' => $winners, 'winHand' => $wh ? (int) $wh['id'] : null, 'road' => $road, 'now' => microtime(true),
    ];
}
function bac_bet(array &$u, array $in): array {
    $hid = in_int($in, 'hand', 1, PHP_INT_MAX);
    $h = q1('SELECT * FROM bac_hands WHERE id = ?', [$hid]);
    if (!$h) throw new ApiError('Unknown hand.', 404);
    $h = bac_row($h);
    $now = microtime(true);
    if ($now >= $h['close_at']) throw new ApiError('No more bets: the cards are out.', 409);
    $raw = $in['bets'] ?? [];
    if ($err = bac_check($raw)) throw new ApiError($err . '.');
    $bets = []; foreach (BAC_SPOTS as $k) if (isset($raw[$k])) $bets[$k] = $raw[$k];
    [, $cur] = bac_tidy($u, $hid, $now);
    $new = array_sum($bets); $old = $cur ? (int) $cur['stake'] : 0;
    if ($new - $old > $u['balance']) throw new ApiError('Not enough Batty Bucks.', 402);
    if (!$cur && $new > 0) {
        round_open($u, 'baccarat', $new, ['hand' => $hid, 'bets' => $bets, 'resultAt' => $h['result_at']]);
    } elseif ($cur) {
        $d = $cur['data']; $d['bets'] = $bets;
        if ($new > $old) { credit($u, -($new - $old), 'bet', 'baccarat', (int) $cur['id']); add_wager($u, $new - $old); }
        elseif ($new < $old) { credit($u, $old - $new, 'refund', 'baccarat', (int) $cur['id'], 'chips taken back'); $u['wagered'] = max(0, $u['wagered'] - ($old - $new)); }
        if ($new > 0) q('UPDATE rounds SET stake = ?, data = ? WHERE id = ?', [$new, json_encode($d), $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
    }
    if ($new > 0) q('INSERT INTO bac_bets (hand_id, user_id, bets, total) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE bets = VALUES(bets), total = VALUES(total)', [$hid, $u['id'], json_encode($bets), $new]);
    else q('DELETE FROM bac_bets WHERE hand_id = ? AND user_id = ?', [$hid, $u['id']]);
    return ['hand' => $hid, 'mine' => $new > 0 ? $bets : (object) [], 'total' => $new];
}
function play_baccarat(array &$u, string $op, array $in): array {
    if ($u['level'] < 5) throw new ApiError('The High Roller Lounge opens at level 5.', 403);
    if ($op === 'state') return bac_state($u);
    if ($op === 'bet') return bac_bet($u, $in);
    throw new ApiError('Unknown action.');
}
