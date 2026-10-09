<?php
/* Bonkers Time — the live game show. One money wheel spins for the whole casino on a continuous schedule.
   PART 1 is a line-for-line port of the "bonkers math" block in games/bonkers/game.js (same rng call order, same results;
   proved by tools/bonkers-xcheck.js). PART 2 runs the live show: there is no cron job. Whoever asks after a round has
   ended creates the next one (under a lock row in settings), with its whole outcome and timetable drawn up front.
   Nothing hidden leaves the server before its moment: the wheel's result at "no more bets", bonus values as each scene
   reaches them, and Crypt Hunt positions and BONKERS TIME spins only after the picks have locked.
   Everyone's chips are settled on the server once the show reaches the payout, whether or not they are still watching. */
if (!defined('BATTY')) { http_response_code(403); exit; }

/* ================= PART 1: the maths ================= */
function bnk_tbl(array $v, array $w): array { return ['values' => $v, 'weights' => $w, 'total' => array_sum($w)]; }
function bnk_D(): array {
    static $d = null;
    if ($d !== null) return $d;
    $tsm = [2, 3, 4, 5, 7, 10, 15, 20, 25, 50];
    $d = [
        'SPOTS' => ['1', '2', '5', '10', 'flap', 'hunt', 'drop', 'bonkers'],
        'NUMBERS' => ['1' => 1, '2' => 2, '5' => 5, '10' => 10],
        'BONUSES' => ['flap', 'hunt', 'drop', 'bonkers'],
        'CAP' => 20000, 'SPOT_MAX' => 10000, 'TABLE_MAX' => 50000,
        'WHEEL' => ['bonkers', '1', '2', '1', '5', '1', 'flap', '2', '1', '10', '1', '2', 'drop', '1', '5', '1', '2', '1', 'flap', '2', '1', '5', '1', '2', 'hunt', '1', '10', '1', '2', '1', 'flap', '2', '1', '5', '1', '2', 'drop', '1', '2', '10', '2', '1', 'flap', '5', '1', '2', '1', '5', 'hunt', '1', '10', '2', '5', '1'],
        'TS_STRIP' => ['1', 'flap', '2', 'hunt', '5', 'drop', '1', 'bonkers', '2', 'flap', '10', 'hunt', '1', 'drop', '2', 'flap', '5', 'hunt', 'bonkers', 'drop'],
        'TS_MULTS' => $tsm,
        'TS' => [
            '1' => bnk_tbl($tsm, [347, 184, 118, 84, 50, 29, 16, 10, 7, 2]),
            '2' => bnk_tbl($tsm, [360, 198, 130, 93, 57, 34, 18, 12, 9, 3]),
            '5' => bnk_tbl($tsm, [316, 157, 97, 67, 38, 21, 11, 6, 4, 1]),
            '10' => bnk_tbl($tsm, [430, 253, 177, 134, 88, 56, 34, 24, 18, 8]),
            'flap' => bnk_tbl($tsm, [272, 129, 76, 50, 27, 14, 6, 4, 2, 1]),
            'hunt' => bnk_tbl($tsm, [277, 129, 76, 50, 27, 14, 6, 4, 2, 1]),
            'drop' => bnk_tbl($tsm, [274, 129, 76, 50, 27, 14, 6, 4, 2, 1]),
            'bonkers' => bnk_tbl($tsm, [309, 130, 76, 50, 27, 14, 6, 4, 2, 1]),
        ],
        'FLAP' => bnk_tbl([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100], [605, 451, 366, 311, 272, 221, 188, 165, 140, 114, 97, 58, 35]),
        'HUNT_N' => 108,
        'HUNT' => bnk_tbl([5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 500], [1872, 1319, 910, 753, 597, 442, 351, 290, 215, 170, 112, 83, 54, 40, 16]),
        'DROP_POCKETS' => 16, 'DROP_DOUBLES' => 2, 'DROP_MAX_DOUBLES' => 5,
        'DROP' => bnk_tbl([5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200, 500], [1531, 1034, 682, 425, 304, 234, 190, 136, 104, 65, 47, 21, 7]),
        'BIG' => [500, 10, 25, 15, 50, 10, 20, 15, 'D', 10, 100, 20, 10, 25, 15, 75, 10, 20, 15, 50, 10, 25, 20, 15, 'T', 200, 10, 15, 20, 50, 10, 25, 15, 10, 150, 15, 10, 15, 50, 25, 'D', 10, 20, 15, 75, 10, 25, 20, 10, 100, 15, 10, 50, 20, 15, 10, 'D', 25, 20, 10, 50, 15, 20, 10],
        'BIG_N' => 64, 'FLAPPERS' => [-16, 0, 16], 'BIG_MAX_RESPINS' => 5,
        'TIME' => ['BET' => 15, 'SPIN_AT' => 0.4, 'SPIN' => 9, 'TS_LEFT' => 2.6, 'TS_RIGHT' => 3.4, 'NUM_PAY' => 1.2, 'NUM_END' => 7, 'BONUS_IN' => 5.5, 'BOARD' => 6],
        'NAMES' => ['1' => '1', '2' => '2', '5' => '5', '10' => '10', 'flap' => 'Coin Flap', 'hunt' => 'Crypt Hunt', 'drop' => 'Drop Zone', 'bonkers' => 'BONKERS TIME'],
    ];
    return $d;
}
function bnk_isBonus(string $s): bool { return in_array($s, bnk_D()['BONUSES'], true); }
function bnk_pick(array $t, Closure $rng) {
    $r = $rng() * $t['total'];
    $n = count($t['values']);
    for ($i = 0; $i < $n; $i++) { $r -= $t['weights'][$i]; if ($r < 0) return $t['values'][$i]; }
    return $t['values'][$n - 1];
}
function bnk_drawTop(Closure $rng): array {
    $D = bnk_D();
    $stop = rfloor($rng, count($D['TS_STRIP'])); $spot = $D['TS_STRIP'][$stop];
    return ['stop' => $stop, 'spot' => $spot, 'mult' => bnk_pick($D['TS'][$spot], $rng)];
}
function bnk_playFlap(Closure $rng): array {
    $F = bnk_D()['FLAP'];
    $red = bnk_pick($F, $rng); $blue = bnk_pick($F, $rng); $side = $rng() < 0.5 ? 0 : 1;
    return ['red' => $red, 'blue' => $blue, 'side' => $side, 'x' => $side ? $blue : $red];
}
function bnk_playHunt(Closure $rng): array {
    $D = bnk_D(); $wall = [];
    for ($i = 0; $i < $D['HUNT_N']; $i++) $wall[] = bnk_pick($D['HUNT'], $rng);
    return ['wall' => $wall, 'best' => max($wall)];
}
function bnk_chooseDistinct(int $n, int $k, Closure $rng): array {
    $a = range(0, $n - 1); $out = [];
    for ($i = 0; $i < $k; $i++) { $j = $i + rfloor($rng, $n - $i); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; $out[] = $a[$i]; }
    return $out;
}
function bnk_playDrop(Closure $rng): array {
    $D = bnk_D(); $n = $D['DROP_POCKETS'];
    $dbl = bnk_chooseDistinct($n, $D['DROP_DOUBLES'], $rng);
    $board = [];
    for ($i = 0; $i < $n; $i++) $board[] = in_array($i, $dbl, true) ? 0 : bnk_pick($D['DROP'], $rng);
    $prizes = []; for ($i = 0; $i < $n; $i++) if ($board[$i]) $prizes[] = $i;
    $drops = []; $doubles = 0;
    for (;;) {
        $closed = $doubles >= $D['DROP_MAX_DOUBLES'];
        $p = $closed ? $prizes[rfloor($rng, count($prizes))] : rfloor($rng, $n);
        $drops[] = $p;
        if ($board[$p]) break;
        $doubles++;
    }
    return ['board' => $board, 'drops' => $drops, 'doubles' => $doubles, 'x' => $board[$drops[count($drops) - 1]] * (2 ** $doubles)];
}
function bnk_bigAt(int $r, int $k) { $D = bnk_D(); $n = $D['BIG_N']; return $D['BIG'][((($r + $D['FLAPPERS'][$k]) % $n) + $n) % $n]; }
function bnk_playBonkers(Closure $rng): array {
    $D = bnk_D();
    $fac = [1, 1, 1]; $res = [0, 0, 0]; $live = [true, true, true]; $spins = [];
    for ($n = 0; ; $n++) {
        if ($n >= $D['BIG_MAX_RESPINS']) {
            do {
                $r = rfloor($rng, $D['BIG_N']); $bad = false;
                for ($k = 0; $k < 3; $k++) if ($live[$k] && !is_int(bnk_bigAt($r, $k))) $bad = true;
            } while ($bad);
        } else $r = rfloor($rng, $D['BIG_N']);
        $hit = [];
        for ($k = 0; $k < 3; $k++) {
            if (!$live[$k]) { $hit[] = null; continue; }
            $s = bnk_bigAt($r, $k);
            $hit[] = $s;
            if (is_int($s)) { $res[$k] = $s * $fac[$k]; $live[$k] = false; }
            else $fac[$k] *= $s === 'D' ? 2 : 3;
        }
        $spins[] = ['r' => $r, 'hit' => $hit, 'fac' => $fac];
        if (!$live[0] && !$live[1] && !$live[2]) break;
    }
    return ['spins' => $spins, 'res' => $res, 'x' => max($res)];
}
function bnk_drawRound(Closure $rng): array {
    $D = bnk_D();
    $ts = bnk_drawTop($rng);
    $seg = rfloor($rng, count($D['WHEEL'])); $spot = $D['WHEEL'][$seg];
    $o = ['seg' => $seg, 'spot' => $spot, 'ts' => $ts];
    if ($spot === 'flap') $o['flap'] = bnk_playFlap($rng);
    elseif ($spot === 'hunt') $o['hunt'] = bnk_playHunt($rng);
    elseif ($spot === 'drop') $o['drop'] = bnk_playDrop($rng);
    elseif ($spot === 'bonkers') $o['bonkers'] = bnk_playBonkers($rng);
    return $o;
}
function bnk_baseX(array $o, array $picks): int {
    $D = bnk_D(); $s = (string) $o['spot'];
    if (isset($D['NUMBERS'][$s])) return $D['NUMBERS'][$s];
    if ($s === 'flap') return $o['flap']['x'];
    if ($s === 'drop') return $o['drop']['x'];
    if ($s === 'hunt') return $o['hunt']['wall'][$picks['hunt'] ?? 0];
    return $o['bonkers']['res'][$picks['flapper'] ?? 1];
}
function bnk_spotX(array $o, array $picks): int {
    $m = (string) $o['ts']['spot'] === (string) $o['spot'] ? $o['ts']['mult'] : 1;
    return min(bnk_D()['CAP'], bnk_baseX($o, $picks) * $m);
}
function bnk_settle(array $bets, array $o, array $picks): array {
    $b = (int) ($bets[$o['spot']] ?? 0);
    $staked = 0; foreach ($bets as $v) $staked += $v;
    $x = bnk_spotX($o, $picks);
    return ['total' => $b > 0 ? (int) floor($b * (1 + $x)) : 0, 'x' => $x, 'staked' => $staked, 'on' => $b];
}
/* Clean a bets map from the browser: string keys, integer chips. Returns [bets, error]. */
function bnk_clean_bets($raw): array {
    $D = bnk_D();
    if (!is_array($raw)) return [[], 'Bad bets'];
    $bets = []; $total = 0;
    foreach ($raw as $k => $v) {
        $k = (string) $k;
        if (!in_array($k, $D['SPOTS'], true)) return [[], 'Unknown bet spot'];
        if (!is_int($v) || $v <= 0 || $v % 10) return [[], 'Bad chip amount'];
        if ($v > $D['SPOT_MAX']) return [[], 'That spot is at its limit'];
        $bets[$k] = $v; $total += $v;
    }
    if ($total > $D['TABLE_MAX']) return [[], 'The table limit is ' . number_format($D['TABLE_MAX']) . ' BB'];
    return [$bets, ''];
}
/* The round's timetable (a port of plan() in the JS). */
function bnk_plan(array $o, float $open): array {
    $T = bnk_D()['TIME'];
    $close = $open + $T['BET']; $spinAt = $close + $T['SPIN_AT']; $result = $spinAt + $T['SPIN'];
    $p = ['open' => $open, 'close' => $close, 'tsLeft' => $close + $T['TS_LEFT'], 'tsRight' => $close + $T['TS_RIGHT'], 'spinAt' => $spinAt, 'result' => $result];
    if (!bnk_isBonus($o['spot'])) { $p['pay'] = $result + $T['NUM_PAY']; $p['end'] = $result + $T['NUM_END']; return $p; }
    $B = $result + $T['BONUS_IN'];
    $p['bonus'] = $B;
    if ($o['spot'] === 'flap') { $p['flip'] = $B + 4.5; $p['land'] = $B + 7.7; $E = $B + 10.5; }
    elseif ($o['spot'] === 'hunt') { $p['cover'] = $B + 3; $p['shuffle'] = $B + 4.2; $p['aim'] = $B + 7.5; $p['lock'] = $B + 17.5; $p['fire'] = $B + 18.1; $E = $B + 25; }
    elseif ($o['spot'] === 'drop') {
        $p['drops'] = []; $p['lands'] = []; $t = $B + 3;
        foreach ($o['drop']['drops'] as $_) { $p['drops'][] = $t; $l = $t + 5.2; $p['lands'][] = $l; $t = $l + 2.4; }
        $E = $p['lands'][count($p['lands']) - 1] + 3.5;
    } else {
        $p['pick'] = $B + 4.5; $p['lock'] = $B + 12.5; $p['spins'] = []; $p['stops'] = []; $t = $p['lock'] + 0.5;
        foreach ($o['bonkers']['spins'] as $_) { $p['spins'][] = $t; $s = $t + 8; $p['stops'][] = $s; $t = $s + 3; }
        $E = $p['stops'][count($p['stops']) - 1] + 4.5;
    }
    $p['pay'] = $E; $p['end'] = $E + $T['BOARD'];
    return $p;
}
/* What the history strip shows for a round: the shared result (or the best on offer for a pick bonus), Top Slot included. */
function bnk_summary_x(array $o): int {
    $D = bnk_D(); $s = $o['spot'];
    $m = $o['ts']['spot'] === $s ? $o['ts']['mult'] : 1;
    $b = isset($D['NUMBERS'][$s]) ? $D['NUMBERS'][$s] : ($s === 'hunt' ? $o['hunt']['best'] : $o[$s]['x']);
    return min($D['CAP'], $b * $m);
}

/* ================= PART 2: the live show ================= */
const BNK_HUNT_REVEAL = 0.4;   // seconds after the lock before Crypt Hunt positions are released (late picks are refused first)

function bnk_row(array $b): array {
    $b['id'] = (int) $b['id']; $b['o'] = json_decode($b['outcome'], true); $b['plan'] = json_decode($b['plan'], true);
    foreach (['open_at', 'close_at', 'result_at', 'pay_at', 'end_at'] as $k) $b[$k] = (float) $b[$k];
    $b['picks_done'] = (int) $b['picks_done'];
    unset($b['outcome']);
    return $b;
}
/* Create a round opening at $open. $o lets a test script stage a particular outcome; play never passes one. */
function bnk_new_round(float $open, ?array $o = null): array {
    $o = $o ?? bnk_drawRound(batty_rng());
    $p = bnk_plan($o, $open);
    q('INSERT INTO bonkers_rounds (spot, seg, ts_spot, ts_mult, x, outcome, plan, open_at, close_at, result_at, pay_at, end_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [$o['spot'], $o['seg'], $o['ts']['spot'], $o['ts']['mult'], bnk_summary_x($o), json_encode($o), json_encode($p, JSON_PRESERVE_ZERO_FRACTION), $p['open'], $p['close'], $p['result'], $p['pay'], $p['end']]);
    $id = (int) db()->lastInsertId();
    if ($id % 500 === 0) { /* tidy up now and then: rounds older than three days */
        $old = microtime(true) - 3 * 86400;
        q('DELETE b FROM bonkers_bets b JOIN bonkers_rounds r ON r.id = b.round_id WHERE r.end_at < ?', [$old]);
        q('DELETE FROM bonkers_rounds WHERE end_at < ? AND id < ?', [$old, $id - 2000]);
        q('DELETE FROM bonkers_seen WHERE seen_at < ?', [$old]);
    }
    return bnk_row(q1('SELECT * FROM bonkers_rounds WHERE id = ? FOR UPDATE', [$id]));
}
/* The round on air right now, created if the last one has finished. Runs inside play()'s transaction. */
function bnk_current(): array {
    $now = microtime(true);
    $b = q1('SELECT * FROM bonkers_rounds ORDER BY id DESC LIMIT 1');
    if ($b && $now < (float) $b['end_at']) return bnk_row($b);
    q("INSERT IGNORE INTO settings (k, v) VALUES ('bonkers_lock', '')");
    qv("SELECT v FROM settings WHERE k = 'bonkers_lock' FOR UPDATE");
    $b = q1('SELECT * FROM bonkers_rounds ORDER BY id DESC LIMIT 1 FOR UPDATE'); // a locking read sees the latest commit
    $now = microtime(true);
    if ($b && $now < (float) $b['end_at']) return bnk_row($b);
    return bnk_new_round($b ? max($now, (float) $b['end_at']) : $now);
}
function bnk_round(int $id): array {
    $b = q1('SELECT * FROM bonkers_rounds WHERE id = ?', [$id]);
    if (!$b) throw new ApiError('Unknown round.', 404);
    return bnk_row($b);
}
/* Everything a viewer may know about round $b at time $now. */
function bnk_public(array $b, float $now): array {
    $p = $b['plan']; $o = $b['o'];
    $out = ['id' => $b['id'], 'open' => $p['open'], 'close' => $p['close']];
    if ($now < $p['close']) return $out;
    foreach (['tsLeft', 'tsRight', 'spinAt', 'result'] as $k) $out[$k] = $p[$k];
    $out['seg'] = $o['seg']; $out['spot'] = $o['spot']; $out['ts'] = $o['ts'];
    $s = $o['spot'];
    if (!bnk_isBonus($s)) { $out['pay'] = $p['pay']; $out['end'] = $p['end']; return $out; }
    $out['bonus'] = $p['bonus'];
    if ($now < $p['bonus']) return $out;
    if ($s === 'flap') {
        $out += ['flip' => $p['flip'], 'land' => $p['land'], 'pay' => $p['pay'], 'end' => $p['end']];
        $out['flap'] = ['red' => $o['flap']['red'], 'blue' => $o['flap']['blue']];
        if ($now >= $p['flip']) { $out['flap']['side'] = $o['flap']['side']; $out['flap']['x'] = $o['flap']['x']; }
    } elseif ($s === 'hunt') {
        foreach (['cover', 'shuffle', 'aim', 'lock', 'fire', 'pay', 'end'] as $k) $out[$k] = $p[$k];
        $show = $o['hunt']['wall']; rsort($show);
        $out['hunt'] = ['show' => $show];
        if ($now >= $p['lock'] + BNK_HUNT_REVEAL) { $out['hunt']['wall'] = $o['hunt']['wall']; $out['hunt']['best'] = $o['hunt']['best']; }
    } elseif ($s === 'drop') {
        $n = 0; foreach ($p['drops'] as $t) if ($now >= $t) $n++;
        $k = max(1, $n);
        $out['drops'] = array_slice($p['drops'], 0, $k); $out['lands'] = array_slice($p['lands'], 0, $k);
        $out['drop'] = ['board' => $o['drop']['board'], 'drops' => array_slice($o['drop']['drops'], 0, $n)];
        if ($n >= count($p['drops'])) { $out['pay'] = $p['pay']; $out['end'] = $p['end']; $out['drop']['doubles'] = $o['drop']['doubles']; $out['drop']['x'] = $o['drop']['x']; }
    } else {
        $out['pick'] = $p['pick']; $out['lock'] = $p['lock'];
        $n = 0; foreach ($p['spins'] as $t) if ($now >= $t) $n++;
        $k = max(1, $n);
        $out['spins'] = array_slice($p['spins'], 0, $k); $out['stops'] = array_slice($p['stops'], 0, $k);
        $out['bonkers'] = ['spins' => array_slice($o['bonkers']['spins'], 0, $n)];
        if ($n >= count($p['spins'])) { $out['pay'] = $p['pay']; $out['end'] = $p['end']; $out['bonkers']['res'] = $o['bonkers']['res']; $out['bonkers']['x'] = $o['bonkers']['x']; }
    }
    return $out;
}
function bnk_decode_bets(?string $j): array { $a = $j ? json_decode($j, true) : []; $out = []; if (is_array($a)) foreach ($a as $k => $v) $out[(string) $k] = (int) $v; return $out; }
function bnk_bets_json(array $bets): string { return json_encode((object) $bets); }
/* Once Crypt Hunt or BONKERS TIME has locked, anyone who backed it without choosing gets a random target or flapper. */
function bnk_autopicks(array $b, float $now): void {
    $s = $b['o']['spot'];
    if ($b['picks_done'] || ($s !== 'hunt' && $s !== 'bonkers') || $now < $b['plan']['lock'] + 0.25) return;
    $col = $s === 'hunt' ? 'hunt_pick' : 'flapper';
    $rng = batty_rng();
    foreach (q("SELECT user_id, bets FROM bonkers_bets WHERE round_id = ? AND $col IS NULL", [$b['id']])->fetchAll() as $row) {
        if ((bnk_decode_bets($row['bets'])[$s] ?? 0) <= 0) continue;
        q("UPDATE bonkers_bets SET $col = ? WHERE round_id = ? AND user_id = ? AND $col IS NULL", [$s === 'hunt' ? rfloor($rng, bnk_D()['HUNT_N']) : rfloor($rng, 3), $b['id'], $row['user_id']]);
    }
    q('UPDATE bonkers_rounds SET picks_done = 1 WHERE id = ? AND picks_done = 0', [$b['id']]);
}
function bnk_picks_of(?array $row): array {
    return ['hunt' => $row && $row['hunt_pick'] !== null ? (int) $row['hunt_pick'] : null, 'flapper' => $row && $row['flapper'] !== null ? (int) $row['flapper'] : null];
}
/* Settle one player's round. $u is locked; the show has reached its payout. */
function bnk_finish(array &$u, array $r): array {
    $d = $r['data']; $rid = (int) $d['round'];
    $row = q1('SELECT * FROM bonkers_rounds WHERE id = ?', [$rid]);
    if (!$row) { /* the round was tidied away (very old): hand the chips back */
        round_close($u, $r, (int) $r['stake'], []);
        return ['round' => $rid, 'won' => (int) $r['stake'], 'refund' => true];
    }
    $b = bnk_row($row); $o = $b['o']; $s = $o['spot'];
    $bet = q1('SELECT * FROM bonkers_bets WHERE round_id = ? AND user_id = ? FOR UPDATE', [$rid, $u['id']]);
    $picks = bnk_picks_of($bet);
    $on = (int) ($d['bets'][$s] ?? 0);
    if ($on > 0 && $s === 'hunt' && $picks['hunt'] === null) { $picks['hunt'] = rfloor(batty_rng(), bnk_D()['HUNT_N']); if ($bet) q('UPDATE bonkers_bets SET hunt_pick = ? WHERE round_id = ? AND user_id = ?', [$picks['hunt'], $rid, $u['id']]); }
    if ($on > 0 && $s === 'bonkers' && $picks['flapper'] === null) { $picks['flapper'] = rfloor(batty_rng(), 3); if ($bet) q('UPDATE bonkers_bets SET flapper = ? WHERE round_id = ? AND user_id = ?', [$picks['flapper'], $rid, $u['id']]); }
    $res = bnk_settle($d['bets'], $o, $picks);
    $f = [];
    if ($on > 0 && bnk_isBonus($s)) { $f['bonus'] = 1; $f['feedLabel'] = bnk_D()['NAMES'][$s] . ' ' . $res['x'] . '×'; }
    elseif ($on > 0 && $o['ts']['spot'] === $s && $res['x'] >= 20) $f['feedLabel'] = 'Top Slot ' . $o['ts']['mult'] . '× on ' . $s;
    if ($on > 0) $f['bigWin'] = $res['total'];
    round_close($u, $r, $res['total'], $f);
    q('UPDATE bonkers_bets SET win = ?, rx = ? WHERE round_id = ? AND user_id = ?', [$res['total'], $on > 0 ? $res['x'] : 0, $rid, $u['id']]);
    return ['round' => $rid, 'won' => $res['total'], 'x' => $on > 0 ? $res['x'] : 0, 'spot' => $s, 'on' => $on, 'staked' => (int) $r['stake'], 'picks' => $picks];
}
function bnk_open_rounds(array $u): array {
    $rows = q("SELECT * FROM rounds WHERE user_id = ? AND game = 'bonkers' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll();
    foreach ($rows as &$r) $r['data'] = json_decode($r['data'], true);
    return $rows;
}
/* Settle the player's finished rounds; returns [settlements, the open round for round $bid or null]. */
function bnk_tidy(array &$u, ?int $bid, float $now): array {
    $done = []; $cur = null;
    foreach (bnk_open_rounds($u) as $r) {
        if ($now >= (float) $r['data']['payAt']) $done[] = bnk_finish($u, $r);
        elseif ((int) $r['data']['round'] === $bid) $cur = $r;
    }
    return [$done, $cur];
}
/* Lock another player without waiting: if they are busy with their own request it simply skips them this time. */
function bnk_lock_other(int $id): ?array {
    $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE NOWAIT', [$id]);
    if (!$u || (int) $u['banned']) return null;
    foreach (['balance', 'ver', 'wagered', 'won', 'rounds', 'level', 'best_win', 'games_mask', 'streak', 'is_admin', 'banned'] as $k) $u[$k] = (int) $u[$k];
    $u['best_x'] = (float) $u['best_x'];
    return $u;
}
/* Settle a few other players whose rounds have paid out, so leaving the page never strands a win. */
function bnk_settle_others(int $me, float $now): void {
    $mine = $GLOBALS['BATTY_EVENTS'];
    $n = 0;
    foreach (q("SELECT id, user_id, data FROM rounds WHERE game = 'bonkers' AND state = 'open' AND user_id <> ? ORDER BY id LIMIT 30", [$me])->fetchAll() as $o) {
        $d = json_decode($o['data'], true);
        if (!$d || $now < ($d['payAt'] ?? INF) + 3) continue;   // their own poll gets 3 s to collect it first
        db()->exec('SAVEPOINT bnk_other');
        try {
            $u = bnk_lock_other((int) $o['user_id']);
            if ($u) {
                $r = round_get_open($u, 'bonkers', (int) $o['id']);
                if ($r) { bnk_finish($u, $r); save_user($u); }
            }
            db()->exec('RELEASE SAVEPOINT bnk_other');
        } catch (Throwable $e) {
            db()->exec('ROLLBACK TO SAVEPOINT bnk_other');   // busy or failed: their next visit (or the next poll) settles it
        }
        if (++$n >= 4) break;
    }
    $GLOBALS['BATTY_EVENTS'] = $mine;
}
/* Everyone with chips on a round, as the room sees them. $b public view rules apply (picks after the lock, wins at payout). */
function bnk_players(array $b, float $now, int $limit): array {
    $o = $b['o']; $p = $b['plan']; $out = [];
    $locked = isset($p['lock']) && $now >= $p['lock'] + BNK_HUNT_REVEAL;
    $paid = $now >= $p['pay'];
    foreach (q('SELECT b.user_id, b.bets, b.total, b.hunt_pick, b.flapper, b.win, b.rx, u.username, u.avatar, u.level FROM bonkers_bets b JOIN users u ON u.id = b.user_id WHERE b.round_id = ? ORDER BY b.total DESC LIMIT ' . $limit, [$b['id']])->fetchAll() as $row) {
        $bets = bnk_decode_bets($row['bets']);
        $e = ['id' => (int) $row['user_id'], 'name' => $row['username'], 'avatar' => $row['avatar'], 'level' => (int) $row['level'], 'total' => (int) $row['total'], 'spots' => array_keys($bets)];
        $e['spots'] = array_map('strval', $e['spots']);
        if ($locked) { if ($row['hunt_pick'] !== null) $e['hunt'] = (int) $row['hunt_pick']; if ($row['flapper'] !== null) $e['flapper'] = (int) $row['flapper']; }
        elseif ($o['spot'] === 'bonkers' && $now >= $p['result'] && $row['flapper'] !== null) $e['flapper'] = (int) $row['flapper']; // flapper choices are public as they are made
        if ($paid) {
            if ((int) $row['win'] >= 0) { $e['win'] = (int) $row['win']; $e['x'] = (int) $row['rx']; }
            else { $st = bnk_settle($bets, $o, bnk_picks_of($row)); $e['win'] = $st['total']; $e['x'] = $st['on'] > 0 ? $st['x'] : 0; }
        }
        $out[] = $e;
    }
    return $out;
}

/* ---------- ops ---------- */
function bnk_state_op(array &$u, array $in): array {
    $b = bnk_current();
    $now = microtime(true);
    q('INSERT INTO bonkers_seen (user_id, seen_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE seen_at = VALUES(seen_at)', [$u['id'], $now]);
    bnk_autopicks($b, $now);
    [$done, $cur] = bnk_tidy($u, $b['id'], $now);
    bnk_settle_others((int) $u['id'], $now);
    $mineRow = q1('SELECT * FROM bonkers_bets WHERE round_id = ? AND user_id = ?', [$b['id'], $u['id']]);
    $mine = null;
    if ($mineRow) {
        $mine = ['bets' => (object) bnk_decode_bets($mineRow['bets']), 'total' => (int) $mineRow['total']] + array_filter(bnk_picks_of($mineRow), fn($v) => $v !== null);
        if ((int) $mineRow['win'] >= 0) $mine['win'] = (int) $mineRow['win'];
    }
    $out = [
        'now' => $now, 'round' => bnk_public($b, $now), 'mine' => $mine, 'settled' => $done,
        'players' => bnk_players($b, $now, 40),
        'inRound' => (int) qv('SELECT COUNT(*) FROM bonkers_bets WHERE round_id = ?', [$b['id']]),
        'watching' => (int) qv('SELECT COUNT(*) FROM bonkers_seen WHERE seen_at > ?', [$now - 8]),
    ];
    /* winners board: this round once it has paid, otherwise the round before */
    $wb = $now >= $b['plan']['pay'] ? $b : null;
    if (!$wb) { $prev = q1('SELECT * FROM bonkers_rounds WHERE id < ? ORDER BY id DESC LIMIT 1', [$b['id']]); if ($prev && $now >= (float) $prev['pay_at']) $wb = bnk_row($prev); }
    if ($wb) {
        $list = array_values(array_filter(bnk_players($wb, $now, 100), fn($e) => ($e['win'] ?? 0) > 0));
        usort($list, fn($a, $c) => $c['win'] <=> $a['win']);
        $out['winners'] = ['round' => $wb['id'], 'spot' => $wb['o']['spot'], 'list' => array_slice(array_map(fn($e) => ['id' => $e['id'], 'name' => $e['name'], 'avatar' => $e['avatar'], 'win' => $e['win'], 'x' => $e['x']], $list), 0, 10)];
    }
    /* history: sent only when it has changed since the version the client holds */
    $top = q1('SELECT id, pay_at FROM bonkers_rounds WHERE result_at <= ? ORDER BY id DESC LIMIT 1', [$now]);
    $hv = $top ? $top['id'] . ($now >= (float) $top['pay_at'] ? 'p' : 'r') : '0';
    $out['hv'] = $hv;
    if (($in['hv'] ?? '') !== $hv) {
        $out['hist'] = array_map(fn($h) => ['id' => (int) $h['id'], 's' => $h['spot'], 'ts' => $h['ts_spot'], 'm' => (int) $h['ts_mult']] + ($now >= (float) $h['pay_at'] ? ['x' => (int) $h['x']] : []),
            q('SELECT id, spot, ts_spot, ts_mult, x, pay_at FROM bonkers_rounds WHERE result_at <= ? ORDER BY id DESC LIMIT 100', [$now])->fetchAll());
    }
    return $out;
}
function bnk_bet_op(array &$u, array $in): array {
    $b = bnk_round(in_int($in, 'round', 1, PHP_INT_MAX));
    $now = microtime(true);
    if ($now >= $b['close_at']) throw new ApiError('No more bets: the wheel is spinning.', 409);
    [$bets, $err] = bnk_clean_bets($in['bets'] ?? null);
    if ($err) throw new ApiError($err . '.');
    [, $cur] = bnk_tidy($u, $b['id'], $now);
    $new = array_sum($bets); $old = $cur ? (int) $cur['stake'] : 0;
    if ($new - $old > $u['balance']) throw new ApiError('Not enough Batty Bucks.', 402);
    if (!$cur && $new > 0) {
        round_open($u, 'bonkers', $new, ['round' => $b['id'], 'bets' => (object) $bets, 'payAt' => $b['pay_at']]);
    } elseif ($cur) {
        $d = $cur['data']; $d['bets'] = (object) $bets;
        if ($new > $old) { credit($u, -($new - $old), 'bet', 'bonkers', (int) $cur['id']); add_wager($u, $new - $old); }
        elseif ($new < $old) { credit($u, $old - $new, 'refund', 'bonkers', (int) $cur['id'], 'chips taken back'); $u['wagered'] = max(0, $u['wagered'] - ($old - $new)); }
        if ($new > 0) q('UPDATE rounds SET stake = ?, data = ? WHERE id = ?', [$new, json_encode($d), $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
    }
    if ($new > 0) q('INSERT INTO bonkers_bets (round_id, user_id, bets, total) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE bets = VALUES(bets), total = VALUES(total)', [$b['id'], $u['id'], bnk_bets_json($bets), $new]);
    else q('DELETE FROM bonkers_bets WHERE round_id = ? AND user_id = ?', [$b['id'], $u['id']]);
    return ['round' => $b['id'], 'mine' => $new > 0 ? ['bets' => (object) $bets, 'total' => $new] : null];
}
function bnk_pick_op(array &$u, array $in): array {
    $b = bnk_round(in_int($in, 'round', 1, PHP_INT_MAX));
    $now = microtime(true); $p = $b['plan']; $s = $b['o']['spot'];
    if ($s !== 'hunt' && $s !== 'bonkers') throw new ApiError('Nothing to pick in this round.', 409);
    $from = $s === 'hunt' ? $p['aim'] : $p['result'];
    if ($now < $from) throw new ApiError('Not yet: wait for the host.', 409);
    if ($now >= $p['lock']) throw new ApiError('Too late: the picks have locked.', 409);
    $row = q1('SELECT * FROM bonkers_bets WHERE round_id = ? AND user_id = ? FOR UPDATE', [$b['id'], $u['id']]);
    if (!$row || (bnk_decode_bets($row['bets'])[$s] ?? 0) <= 0) throw new ApiError('No chip on this bonus: you are watching this one.', 409);
    if ($s === 'hunt') { $v = in_int($in, 'hunt', 0, bnk_D()['HUNT_N'] - 1); q('UPDATE bonkers_bets SET hunt_pick = ? WHERE round_id = ? AND user_id = ?', [$v, $b['id'], $u['id']]); return ['round' => $b['id'], 'hunt' => $v]; }
    $v = in_int($in, 'flapper', 0, 2); q('UPDATE bonkers_bets SET flapper = ? WHERE round_id = ? AND user_id = ?', [$v, $b['id'], $u['id']]);
    return ['round' => $b['id'], 'flapper' => $v];
}
function play_bonkers(array &$u, string $op, array $in): array {
    if ($op === 'state') return bnk_state_op($u, $in);
    if ($op === 'bet') return bnk_bet_op($u, $in);
    if ($op === 'pick') return bnk_pick_op($u, $in);
    throw new ApiError('Unknown action.');
}
