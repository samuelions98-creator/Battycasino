<?php
/* Bunky Time — PHP port of src/games/bunky.math.js. Same rng call order, same results. */
if (!defined('BATTY')) { http_response_code(403); exit; }

function bk_D(): array { static $d = null; if ($d === null) $d = batty_data('bunky'); return $d; }
function bk_kind(string $spot): string { return $spot === 'one' ? 'one' : (in_array($spot, bk_D()['BONUSES'], true) ? 'bonus' : 'letter'); }
function bk_pick(array $t, Closure $rng) {
    $r = $rng() * $t['total'];
    $n = count($t['values']);
    for ($i = 0; $i < $n; $i++) { $r -= $t['weights'][$i]; if ($r < 0) return $t['values'][$i]; }
    return $t['values'][$n - 1];
}
function bk_chooseDistinct(array $arr, int $n, Closure $rng): array {
    $a = $arr; $out = []; $len = count($a);
    for ($i = 0; $i < $n; $i++) { $j = $i + rfloor($rng, $len - $i); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; $out[] = $a[$i]; }
    return $out;
}
function bk_drawBoosts(Closure $rng): array {
    $D = bk_D(); $B = $D['BOOST']; $out = [];
    foreach (bk_chooseDistinct($D['ONE_SEGS'], $B['ones'], $rng) as $seg) $out[] = ['seg' => $seg, 'mult' => bk_pick($B['oneMult'], $rng)];
    foreach (bk_chooseDistinct($D['LETTER_SEGS'], $B['letters'], $rng) as $seg) $out[] = ['seg' => $seg, 'mult' => bk_pick($B['letterMult'], $rng)];
    if ($rng() < $B['bonusChance']) $out[] = ['seg' => $D['BONUS_SEGS'][rfloor($rng, count($D['BONUS_SEGS']))], 'mult' => bk_pick($B['bonusMult'], $rng)];
    return $out;
}
function bk_playBar(Closure $rng): array {
    $BAR = bk_D()['BAR'];
    do { $a = bk_pick($BAR, $rng); $b = bk_pick($BAR, $rng); $c = bk_pick($BAR, $rng); } while ($a === $b || $b === $c || $a === $c);
    return ['type' => 'bar', 'mults' => [$a, $b, $c]];
}
function bk_playHang(Closure $rng): array {
    $H = bk_D()['HANG'];
    $top = count($H['ladder']) - 1;
    $level = [0, 0, 0]; $grips = [$H['grips'], $H['grips'], $H['grips']]; $done = [false, false, false]; $how = ['', '', ''];
    $draws = []; $alive = 3;
    $up = function (int $t, array &$moved) use (&$level, &$done, &$how, &$alive, $top) {
        $level[$t]++; $moved[] = $t;
        if ($level[$t] >= $top) { $done[$t] = true; $how[$t] = 'top'; $alive--; }
    };
    while ($alive > 0) {
        $r = rfloor($rng, $H['ballTotal']);
        $team = -1;
        if ($r < $H['allBalls']) $kind = 'all';
        else {
            $r -= $H['allBalls'];
            $per = $H['climbPerTeam'] + $H['dropPerTeam'];
            $team = intdiv($r, $per); $kind = ($r % $per) < $H['climbPerTeam'] ? 'up' : 'drop';
            if ($done[$team]) continue;
        }
        $moved = []; $out = -1;
        if ($kind === 'all') { for ($t = 0; $t < 3; $t++) if (!$done[$t]) $up($t, $moved); }
        elseif ($kind === 'up') $up($team, $moved);
        else { $grips[$team]--; if ($grips[$team] <= 0) { $done[$team] = true; $how[$team] = 'drop'; $alive--; $out = $team; } }
        $draws[] = ['kind' => $kind, 'team' => $team, 'moved' => $moved, 'out' => $out, 'levels' => $level, 'grips' => $grips];
    }
    return ['type' => 'hang', 'draws' => $draws, 'levels' => $level, 'how' => $how, 'mults' => array_map(fn($l) => $H['ladder'][$l], $level)];
}
function bk_playDisco(Closure $rng, array $cfg, string $type): array {
    $DIRS = bk_D()['DIRS'];
    $n = $cfg['size']; $c = intdiv($n - 1, 2);
    $grid = [];
    for ($i = 0; $i < $n * $n; $i++) $grid[$i] = bk_pick($cfg['tiles'], $rng);
    $r = $c; $q = $c; $dir = -1; $total = $grid[$r * $n + $q];
    $steps = [];
    for (;;) {
        if ($dir < 0) $dir = rfloor($rng, 4);
        else { $k = rfloor($rng, 3); $dir = ($dir + ($k === 0 ? 0 : ($k === 1 ? 1 : 3))) % 4; }
        $r += $DIRS[$dir][0]; $q += $DIRS[$dir][1];
        if ($r < 0 || $r >= $n || $q < 0 || $q >= $n) { $steps[] = ['dir' => $dir, 'r' => $r, 'c' => $q, 'off' => true, 'value' => 0, 'total' => $total]; break; }
        $total += $grid[$r * $n + $q];
        $steps[] = ['dir' => $dir, 'r' => $r, 'c' => $q, 'off' => false, 'value' => $grid[$r * $n + $q], 'total' => $total];
    }
    return ['type' => $type, 'size' => $n, 'grid' => $grid, 'start' => [$c, $c], 'steps' => $steps, 'total' => $total];
}
function bk_playBonus(string $type, Closure $rng): array {
    $D = bk_D();
    if ($type === 'bar') return bk_playBar($rng);
    if ($type === 'hang') return bk_playHang($rng);
    if ($type === 'disco') return bk_playDisco($rng, $D['DISCO'], 'disco');
    return bk_playDisco($rng, $D['VIP'], 'vip');
}
function bk_spin(Closure $rng): array {
    $D = bk_D();
    $boosts = bk_drawBoosts($rng);
    $stop = rfloor($rng, count($D['WHEEL']));
    $spot = $D['WHEEL'][$stop]; $kind = bk_kind($spot);
    $boost = 1;
    foreach ($boosts as $b) if ($b['seg'] === $stop) $boost = $b['mult'];
    return ['boosts' => $boosts, 'stop' => $stop, 'spot' => $spot, 'kind' => $kind, 'boost' => $boost, 'bonus' => $kind === 'bonus' ? bk_playBonus($spot, $rng) : null];
}
function bk_needsPick(array $o): int { return ($o['kind'] === 'bonus' && ($o['spot'] === 'bar' || $o['spot'] === 'hang')) ? 3 : 0; }
function bk_bonusX(array $o, int $pick): int {
    $b = $o['bonus']; if (!$b) return 0;
    if ($b['type'] === 'bar' || $b['type'] === 'hang') return $b['mults'][$pick];
    return $b['total'];
}
function bk_winX(array $o, int $pick): int {
    $D = bk_D();
    if ($o['kind'] === 'one') return $D['ODDS']['one'] * $o['boost'];
    if ($o['kind'] === 'letter') return $D['ODDS']['letter'] * $o['boost'];
    return min($D['MAX_BONUS_X'], bk_bonusX($o, $pick) * $o['boost']);
}
function bk_settle(array $bets, array $o, int $pick): array {
    $by = []; $total = 0;
    foreach ($bets as $s => $stake) {
        if ($s !== $o['spot'] || !($stake > 0)) continue;
        $p = $stake + $stake * bk_winX($o, $pick);
        $by[$s] = $p; $total += $p;
    }
    return ['total' => $total, 'bySpot' => $by];
}
/* A hidden-until-picked copy of a bonus that needs a pick (the shapes the UI expects, values blank). */
function bk_masked(array $o): array {
    $m = $o;
    if ($o['bonus']['type'] === 'bar') $m['bonus'] = ['type' => 'bar', 'mults' => [0, 0, 0], 'hidden' => true];
    else $m['bonus'] = ['type' => 'hang', 'draws' => [], 'levels' => [0, 0, 0], 'how' => ['', '', ''], 'mults' => [0, 0, 0], 'hidden' => true];
    return $m;
}

/* =====================================================================
   THE LIVE SHOW — one wheel for the whole casino, on a fixed rhythm.
   There is no cron job. Whichever request arrives after a round's last beat creates the next one (with a lock row in
   settings, as Moonshot's flights do). Every outcome is drawn here when its round is created, from the same maths as
   above, and each part of it leaves the server only at its reveal time (bk_public). Chips live in bunky_bets and the
   money in rounds/ledger, so balances, missions, the feed, RTP records and achievements work as for every other game.
   ===================================================================== */
const BK_LIVE = [
    'bet' => 15.0,     // betting window
    'glit' => 5.5,     // "no more bets" and the Glitterball
    'spin' => 9.0,     // the host's spin, from the pull to the wheel at rest
    'stopAt' => 2.2,   // the stop leaves the server this long into the spin (screens need it before the final slow-down)
    'look' => 1.6,     // bonus events are sent this far ahead of their moment, so every screen can animate them on time
    'land' => 3.4,     // celebration between the wheel stopping on a bonus and the bonus starting
    'rest' => 7.0,     // a plain result stays up this long before the next betting window
    'intro' => 3.2,    // bonus title card
    'shake' => 2.4,    // Blood Bar: the bartenders mix before anyone can pick
    'pick' => 10.0,    // shared countdown for the players' own picks
    'outro' => 6.0,    // bonus result card and winners, then the next round
];
/* Every beat of a round, in seconds from the moment betting opens. A pure function of the outcome (mirrored in game.js).
   Each event's time depends only on what came before it, so revealing events one by one never hints at the next. */
function bk_timeline(array $o): array {
    $L = BK_LIVE;
    $t = ['close' => $L['bet'], 'spin' => $L['bet'] + $L['glit']];
    $t['land'] = $t['spin'] + $L['spin'];
    if ($o['kind'] !== 'bonus') { $t['end'] = $t['land'] + 0.4; $t['next'] = $t['land'] + $L['rest']; return $t; }
    $b = $o['bonus']; $at = $t['land'] + $L['land']; $t['bonus'] = $at;
    if ($b['type'] === 'bar') {
        $t['pickStart'] = $at + $L['intro'] + $L['shake']; $t['pickEnd'] = $t['pickStart'] + $L['pick'];
        $t['end'] = $t['pickEnd'] + 0.6; $t['finish'] = $t['end'] + 3.6;
    } elseif ($b['type'] === 'hang') {
        $top = count(bk_D()['HANG']['ladder']) - 1;
        $t['pickStart'] = $at + $L['intro']; $t['pickEnd'] = $t['pickStart'] + $L['pick'];
        $x = $t['pickEnd'] + 1.6; $ev = [];
        foreach ($b['draws'] as $k => $d) {
            $ev[] = $x;
            $topped = false; foreach ($d['moved'] as $m) if ($d['levels'][$m] >= $top) $topped = true;
            $x += ($k < 8 ? 1.3 : ($k < 18 ? 1.0 : 0.75)) + ($d['kind'] === 'drop' ? 0.5 : 0) + ($d['out'] >= 0 ? 0.7 : 0) + ($topped ? 1.0 : 0);
        }
        $t['ev'] = $ev; $t['finish'] = $x + 0.6; $t['end'] = $t['finish'];
    } else {
        $n = $b['size'];
        $t['floor'] = $at + $L['intro'] + 0.2; $t['first'] = $t['floor'] + 1.6;
        $x = $t['first']; $r = $b['start'][0]; $q = $b['start'][1]; $ev = [];
        foreach ($b['steps'] as $k => $s) {
            $edge = $r === 0 || $q === 0 || $r === $n - 1 || $q === $n - 1;
            $x += ($k < 8 ? 0.95 : ($k < 18 ? 0.8 : 0.6)) + ($edge ? 0.45 : 0);
            $ev[] = $x; $r = $s['r']; $q = $s['c'];
        }
        $t['ev'] = $ev; $t['finish'] = $x + 1.5; $t['end'] = $t['finish'];
    }
    $t['next'] = $t['finish'] + $L['outro'];
    return $t;
}
/* The biggest multiplier a round could pay (for the results strip). */
function bk_topX(array $o): int {
    $D = bk_D();
    if ($o['kind'] !== 'bonus') return $D['ODDS'][$o['kind']] * $o['boost'];
    $b = $o['bonus'];
    return min($D['MAX_BONUS_X'], ($b['type'] === 'bar' || $b['type'] === 'hang' ? max($b['mults']) : $b['total']) * $o['boost']);
}
function bk_row(array $r): array {
    foreach (['th0', 'jit', 'rest', 'open_at', 'close_at', 'spin_at', 'land_at', 'end_at', 'next_at'] as $k) $r[$k] = (float) $r[$k];
    $r['id'] = (int) $r['id']; $r['boost'] = (int) $r['boost']; $r['top_x'] = (int) $r['top_x'];
    $r['o'] = json_decode($r['o'], true); $r['tl'] = json_decode($r['tl'], true);
    return $r;
}
function bk_round(int $id): ?array { $r = q1('SELECT * FROM bunky_rounds WHERE id = ?', [$id]); return $r ? bk_row($r) : null; }
/* Where the wheel comes to rest for a stop (the pointer is at 12 o'clock; jit moves it within the segment). */
function bk_restAngle(int $stop, float $jit): float {
    $seg = 2 * M_PI / count(bk_D()['WHEEL']);
    $a = fmod(-M_PI / 2 - ($stop + 0.5 + $jit) * $seg, 2 * M_PI);
    return $a < 0 ? $a + 2 * M_PI : $a;
}
/* The round that is betting, spinning, in its bonus or showing its result right now (created if needed). */
function bk_current(): array {
    $now = microtime(true);
    $r = q1('SELECT * FROM bunky_rounds ORDER BY id DESC LIMIT 1');
    if ($r && $now < (float) $r['next_at']) return bk_row($r);
    return tx(function () {
        q("INSERT IGNORE INTO settings (k, v) VALUES ('bunky_lock', '')");
        qv("SELECT v FROM settings WHERE k = 'bunky_lock' FOR UPDATE");
        $now = microtime(true);
        $r = q1('SELECT * FROM bunky_rounds ORDER BY id DESC LIMIT 1');
        if ($r && $now < (float) $r['next_at']) return bk_row($r);
        $rng = batty_rng();
        $o = bk_dev_forced($rng) ?? bk_spin($rng);
        $jit = ($rng() - 0.5) * 0.72;
        $open = $r ? max($now, (float) $r['next_at']) : $now;
        $th0 = $r ? (float) $r['rest'] : $rng() * 2 * M_PI;
        $tl = [];
        foreach (bk_timeline($o) as $k => $v) $tl[$k] = is_array($v) ? array_map(fn($x) => $open + $x, $v) : $open + $v;
        q('INSERT INTO bunky_rounds (o, tl, spot, boost, top_x, th0, jit, rest, open_at, close_at, spin_at, land_at, end_at, next_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
            json_encode($o), json_encode($tl), $o['spot'], $o['boost'], bk_topX($o), $th0, $jit, bk_restAngle($o['stop'], $jit),
            $open, $tl['close'], $tl['spin'], $tl['land'], $tl['end'], $tl['next'],
        ]);
        $id = (int) db()->lastInsertId();
        if ($id % 500 === 0) { /* tidy up now and then: three days of rounds is plenty */
            $old = $now - 3 * 86400;
            q('DELETE b FROM bunky_bets b JOIN bunky_rounds r ON r.id = b.round_id WHERE r.next_at < ?', [$old]);
            q('DELETE FROM bunky_rounds WHERE next_at < ? AND id < ?', [$old, $id - 500]);
            q('DELETE FROM bunky_seen WHERE seen_at < ?', [$now - 86400]);
        }
        return bk_round($id);
    });
}
/* ---------- local testing only ----------
   On PHP's built-in development server, from the machine itself, op:'devforce' {spot, minx?} makes the NEXT round land on
   that spot (and, with minx, pay at least that multiplier on its best result). The round is redrawn with the real generator
   until it does, so everything else about it is honest. Apache, nginx and every other front end report a different
   PHP_SAPI, so on the real site the op does not exist. */
function bk_dev_ok(): bool { return PHP_SAPI === 'cli-server' && in_array(client_ip(), ['127.0.0.1', '::1'], true); }
function bk_dev_forced(Closure $rng): ?array {
    if (!bk_dev_ok()) return null;
    $want = json_decode((string) qv("SELECT v FROM settings WHERE k = 'bunky_force'"), true);
    if (!is_array($want) || !in_array($want['spot'] ?? '', bk_D()['SPOTS'], true)) return null;
    q("UPDATE settings SET v = '' WHERE k = 'bunky_force'");
    $minx = (int) ($want['minx'] ?? 0);
    for ($i = 0; $i < 400000; $i++) { $o = bk_spin($rng); if ($o['spot'] === $want['spot'] && bk_topX($o) >= $minx) return $o; }
    return null;
}
function bk_devforce_op(array $in): array {
    if (!bk_dev_ok()) throw new ApiError('Unknown action.');
    $s = (string) ($in['spot'] ?? '');
    if (!in_array($s, bk_D()['SPOTS'], true)) throw new ApiError('Unknown bet spot.');
    set_setting('bunky_force', json_encode(['spot' => $s, 'minx' => in_int($in + ['minx' => 0], 'minx', 0, 10000)]));
    return ['forced' => $s];
}
/* What every player may know about a round at this instant. */
function bk_public(array $r, float $now): array {
    $L = BK_LIVE; $o = $r['o']; $t = $r['tl'];
    $p = ['id' => $r['id'], 'openAt' => $r['open_at'], 'closeAt' => $r['close_at'], 'spinAt' => $r['spin_at'], 'landAt' => $r['land_at'], 'th0' => $r['th0']];
    if ($now >= $r['close_at']) $p['boosts'] = $o['boosts'];
    if ($now >= $r['spin_at'] + $L['stopAt']) { $p['stop'] = $o['stop']; $p['jit'] = $r['jit']; }
    if ($now < $r['land_at']) return $p;
    $p['spot'] = $o['spot']; $p['kind'] = $o['kind']; $p['boost'] = $o['boost'];
    if ($now >= max($r['land_at'], $r['end_at'] - $L['look'])) { $p['endAt'] = $r['end_at']; $p['nextAt'] = $r['next_at']; }
    if ($o['kind'] !== 'bonus') return $p;
    $b = $o['bonus']; $look = $now + $L['look'];
    $pb = ['type' => $b['type'], 'at' => $t['bonus']];
    if (isset($t['pickStart'])) { $pb['pickStart'] = $t['pickStart']; $pb['pickEnd'] = $t['pickEnd']; }
    if ($b['type'] === 'bar') {
        if ($now >= $t['pickEnd']) { $pb['mults'] = $b['mults']; $pb['finish'] = $t['finish']; }
    } elseif ($b['type'] === 'hang') {
        if ($now >= $t['pickEnd']) {
            $pb['ev'] = [];
            foreach ($t['ev'] as $k => $et) { if ($et > $look) break; $pb['ev'][] = $b['draws'][$k] + ['t' => $et]; }
            if (count($pb['ev']) === count($t['ev'])) { $pb['finish'] = $t['finish']; $pb['mults'] = $b['mults']; $pb['levels'] = $b['levels']; $pb['how'] = $b['how']; }
        }
    } else {
        $pb['floor'] = $t['floor']; $pb['first'] = $t['first'];
        if ($look >= $t['floor']) {
            $pb['size'] = $b['size']; $pb['grid'] = $b['grid']; $pb['start'] = $b['start']; $pb['ev'] = [];
            foreach ($t['ev'] as $k => $et) { if ($et > $look) break; $pb['ev'][] = $b['steps'][$k] + ['t' => $et]; }
            if (count($pb['ev']) === count($t['ev'])) { $pb['finish'] = $t['finish']; $pb['total'] = $b['total']; }
        }
    }
    $p['bonus'] = $pb;
    return $p;
}

/* ---------- bets: the player's whole set of chips for a round, replaced each time it changes ---------- */
function bk_clean_bets($raw): array {
    $D = bk_D();
    if (!is_array($raw)) throw new ApiError('Bad bets.');
    $bets = []; $total = 0;
    foreach ($raw as $spot => $amt) {
        if (!is_string($spot) || !in_array($spot, $D['SPOTS'], true)) throw new ApiError('Unknown bet spot.');
        if (!is_int($amt) || $amt < 0 || $amt % 10) throw new ApiError('Bad chip amount.');
        if ($amt > $D['SPOT_MAX'][bk_kind($spot)]) throw new ApiError('That spot is at its limit.');
        if ($amt > 0) { $bets[$spot] = $amt; $total += $amt; }
    }
    return [$bets, $total];
}
/* The player's open live round for show round $brId (locked), or null. */
function bk_my_open(array $u, int $brId): ?array {
    foreach (q("SELECT * FROM rounds WHERE user_id = ? AND game = 'bunky' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll() as $r) {
        $r['data'] = json_decode($r['data'], true);
        if (!empty($r['data']['live']) && (int) $r['data']['br'] === $brId) return $r;
    }
    return null;
}
function bk_bet_op(array &$u, array $in): array {
    $brId = in_int($in, 'round', 1, PHP_INT_MAX);
    $br = bk_round($brId);
    if (!$br) throw new ApiError('Unknown round.', 404);
    $now = microtime(true);
    if ($now < $br['open_at'] - 1) throw new ApiError('Betting has not opened yet.', 409);
    if ($now >= $br['close_at']) throw new ApiError('No more bets: the wheel is about to spin.', 409);
    [$bets, $new] = bk_clean_bets($in['bets'] ?? []);
    $cur = bk_my_open($u, $brId);
    $old = $cur ? (int) $cur['stake'] : 0;
    if ($new - $old > $u['balance']) throw new ApiError('Not enough Batty Bucks.', 402);
    if (!$cur && $new > 0) {
        round_open($u, 'bunky', $new, ['live' => 1, 'br' => $brId, 'end' => $br['end_at']]);
    } elseif ($cur) {
        if ($new > $old) { credit($u, -($new - $old), 'bet', 'bunky', (int) $cur['id'], 'more chips'); add_wager($u, $new - $old); }
        elseif ($new < $old) { credit($u, $old - $new, 'refund', 'bunky', (int) $cur['id'], 'chips taken back'); $u['wagered'] = max(0, $u['wagered'] - ($old - $new)); }
        if ($new > 0) q('UPDATE rounds SET stake = ? WHERE id = ?', [$new, $cur['id']]);
        else q("UPDATE rounds SET stake = 0, state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $cur['id']]);
    }
    if ($new > 0) q('INSERT INTO bunky_bets (round_id, user_id, bets, total) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE bets = VALUES(bets), total = VALUES(total)', [$brId, $u['id'], json_encode($bets), $new]);
    else q('DELETE FROM bunky_bets WHERE round_id = ? AND user_id = ?', [$brId, $u['id']]);
    return ['round' => $brId, 'bets' => $bets ?: (object) [], 'total' => $new];
}
/* A pick inside a bonus (bartender or team), during the shared countdown. Locked in once made; the values behind it
   stay on the server until the countdown has ended for everybody. */
function bk_pick_op(array &$u, array $in): array {
    $brId = in_int($in, 'round', 1, PHP_INT_MAX);
    $pick = in_int($in, 'pick', 0, 2);
    $br = bk_round($brId);
    if (!$br) throw new ApiError('Unknown round.', 404);
    $now = microtime(true); $t = $br['tl'];
    if ($now < $br['land_at']) throw new ApiError('Not yet.', 409);   // checked first: before the wheel stops, nothing may hint at what it lands on
    if (!isset($t['pickStart'])) throw new ApiError('There is nothing to pick in this round.');
    if ($now < $t['pickStart'] - 1) throw new ApiError('Not yet.', 409);
    if ($now >= $t['pickEnd']) throw new ApiError('Too late: the house picked for you.', 409);
    $b = q1('SELECT * FROM bunky_bets WHERE round_id = ? AND user_id = ?', [$brId, $u['id']]);
    $bets = $b ? json_decode($b['bets'], true) : [];
    if (($bets[$br['o']['spot']] ?? 0) <= 0) throw new ApiError('You have no chip on this bonus, so you are watching this one.');
    if ($b['pick'] === null) q('UPDATE bunky_bets SET pick = ? WHERE round_id = ? AND user_id = ? AND pick IS NULL', [$pick, $brId, $u['id']]);
    return ['round' => $brId, 'pick' => (int) qv('SELECT pick FROM bunky_bets WHERE round_id = ? AND user_id = ?', [$brId, $u['id']])];
}
/* After the pick countdown, everyone who did not choose gets a random pick (it cannot change the return). */
function bk_autopicks(array $br, float $now): void {
    $t = $br['tl'];
    if (!isset($t['pickEnd']) || $now < $t['pickEnd']) return;
    foreach (q('SELECT user_id FROM bunky_bets WHERE round_id = ? AND pick IS NULL', [$br['id']])->fetchAll() as $b)
        q('UPDATE bunky_bets SET pick = ? WHERE round_id = ? AND user_id = ? AND pick IS NULL', [random_int(0, 2), $br['id'], $b['user_id']]);
}
/* Fill in every player's win for a finished round (the same sum settlement pays), for the winners list. */
function bk_fill_wins(array $br, float $now): void {
    if ($now < $br['end_at']) return;
    if (!qv('SELECT 1 FROM bunky_bets WHERE round_id = ? AND win IS NULL LIMIT 1', [$br['id']])) return;
    bk_autopicks($br, $now);
    foreach (q('SELECT user_id, bets, pick FROM bunky_bets WHERE round_id = ? AND win IS NULL', [$br['id']])->fetchAll() as $b)
        q('UPDATE bunky_bets SET win = ? WHERE round_id = ? AND user_id = ? AND win IS NULL', [bk_settle(json_decode($b['bets'], true), $br['o'], (int) $b['pick'])['total'], $br['id'], $b['user_id']]);
}
/* Pay one live round. */
function bk_live_finish(array &$u, array $r): array {
    $brId = (int) $r['data']['br'];
    $br = bk_round($brId);
    $b = $br ? q1('SELECT * FROM bunky_bets WHERE round_id = ? AND user_id = ?', [$brId, $u['id']]) : null;
    if (!$br || !$b) { /* the show round is gone (should not happen): hand the chips back */
        credit($u, (int) $r['stake'], 'refund', 'bunky', (int) $r['id'], 'round cancelled');
        q("UPDATE rounds SET state = 'void', data = NULL, settled_at = ? WHERE id = ?", [msnow(), $r['id']]);
        return ['round' => $brId, 'won' => 0, 'staked' => 0, 'void' => true];
    }
    $o = $br['o']; $bets = json_decode($b['bets'], true);
    if ($b['pick'] === null) { bk_autopicks($br, INF); $b['pick'] = qv('SELECT pick FROM bunky_bets WHERE round_id = ? AND user_id = ?', [$brId, $u['id']]); }
    $pick = (int) ($b['pick'] ?? 0);
    $won = bk_settle($bets, $o, $pick)['total'];
    round_close($u, $r, $won, bunky_facts($o, $bets[$o['spot']] ?? 0, $won, (int) $r['stake']));
    q('UPDATE bunky_bets SET win = ? WHERE round_id = ? AND user_id = ?', [$won, $brId, $u['id']]);
    return ['round' => $brId, 'won' => $won, 'staked' => (int) $r['stake'], 'pick' => $pick];
}
/* Settle every live round of this player whose result is out (and any round left from the old private wheel). */
function bk_tidy(array &$u, float $now): array {
    $done = [];
    foreach (q("SELECT * FROM rounds WHERE user_id = ? AND game = 'bunky' AND state = 'open' ORDER BY id FOR UPDATE", [$u['id']])->fetchAll() as $r) {
        $r['data'] = json_decode($r['data'], true);
        if (!empty($r['data']['live'])) { if ($now >= (float) $r['data']['end']) $done[] = bk_live_finish($u, $r); }
        else bunky_finish($u, $r, random_int(0, 2));
    }
    return $done;
}

/* ---------- the poll every screen makes about once a second ---------- */
function bk_state_api(array $u0, array $in = []): array {
    $br = bk_current();
    $now = microtime(true);
    $uid = (int) $u0['id'];
    q('INSERT INTO bunky_seen (user_id, seen_at) VALUES (?,?) ON DUPLICATE KEY UPDATE seen_at = VALUES(seen_at)', [$uid, $now]);
    bk_autopicks($br, $now);
    /* my own results, the moment they are out */
    $due = false;
    foreach (q("SELECT data FROM rounds WHERE user_id = ? AND game = 'bunky' AND state = 'open'", [$uid])->fetchAll() as $m) {
        $d = json_decode((string) $m['data'], true);
        if (empty($d['live']) || $now >= (float) ($d['end'] ?? 0)) $due = true;
    }
    if ($due) {
        $out = tx(function () use ($uid, $now) {
            $u = lock_user($uid);
            $done = bk_tidy($u, $now);
            save_user($u);
            return ['settled' => $done, 'bal' => $u['balance'], 'ver' => $u['ver'], 'level' => $u['level'], 'xp' => level_progress($u)];
        });
    } else {
        $u = $u0; foreach (['balance', 'ver', 'level', 'wagered'] as $k) $u[$k] = (int) $u[$k];
        $out = ['settled' => [], 'bal' => $u['balance'], 'ver' => $u['ver'], 'level' => $u['level'], 'xp' => level_progress($u)];
    }
    /* pay a few other players whose rounds are over, so the feed and their balances stay current even if they left */
    $mine = $GLOBALS['BATTY_EVENTS'];
    $n = 0;
    foreach (q("SELECT id, user_id, data FROM rounds WHERE game = 'bunky' AND state = 'open' AND user_id <> ? ORDER BY id LIMIT 40", [$uid])->fetchAll() as $o) {
        $d = json_decode((string) $o['data'], true);
        if (empty($d['live']) || $now < (float) ($d['end'] ?? 0) + 6) continue;   // their own poll gets 6 s to collect it first
        try {
            tx(function () use ($o, $now) {
                $u = lock_user((int) $o['user_id']);
                $r = round_get_open($u, 'bunky', (int) $o['id']);
                if ($r && !empty($r['data']['live']) && $now >= (float) $r['data']['end']) { bk_live_finish($u, $r); save_user($u); }
            });
        } catch (Throwable $e) { /* their own next request will settle it */ }
        if (++$n >= 8) break;
    }
    $GLOBALS['BATTY_EVENTS'] = $mine;

    bk_fill_wins($br, $now);
    $pub = bk_public($br, $now);
    if (isset($br['tl']['pickEnd']) && $now >= $br['tl']['pickEnd']) {
        $c = [0, 0, 0];
        foreach (q('SELECT pick, COUNT(*) n FROM bunky_bets WHERE round_id = ? AND pick IS NOT NULL GROUP BY pick', [$br['id']])->fetchAll() as $x) $c[(int) $x['pick']] = (int) $x['n'];
        $pub['bonus']['picks'] = $c;
    }
    $b = q1('SELECT bets, total, pick, win FROM bunky_bets WHERE round_id = ? AND user_id = ?', [$br['id'], $uid]);
    $me = ['round' => $br['id'], 'bets' => (object) [], 'total' => 0];
    if ($b) {
        $me['bets'] = json_decode($b['bets'], true) ?: (object) []; $me['total'] = (int) $b['total'];
        if ($b['pick'] !== null && isset($br['tl']['pickStart'])) $me['pick'] = (int) $b['pick'];
        if ($now >= $br['end_at'] && $b['win'] !== null) $me['won'] = (int) $b['win'];
    }
    $players = [];
    $showWins = $now >= $br['end_at'];
    foreach (q('SELECT b.user_id, b.bets, b.total, b.pick, b.win, u.username, u.avatar, u.level FROM bunky_bets b JOIN users u ON u.id = b.user_id WHERE b.round_id = ? ORDER BY b.total DESC, b.user_id LIMIT 40', [$br['id']])->fetchAll() as $p) {
        $pb = json_decode($p['bets'], true) ?: []; arsort($pb);
        $row = ['id' => (int) $p['user_id'], 'name' => $p['username'], 'avatar' => $p['avatar'], 'level' => (int) $p['level'], 'total' => (int) $p['total'], 'spots' => array_slice(array_map('strval', array_keys($pb)), 0, 6), 'win' => $showWins && $p['win'] !== null ? (int) $p['win'] : null];
        if ($p['pick'] !== null && isset($br['tl']['pickEnd']) && $now >= $br['tl']['pickEnd']) $row['pick'] = (int) $p['pick'];   // who backed which bartender or team, once the picks are locked
        $players[] = $row;
    }
    $res = $out + [
        'now' => $now, 'round' => $pub, 'mine' => $me, 'players' => $players,
        'betting' => (int) qv('SELECT COUNT(*) FROM bunky_bets WHERE round_id = ?', [$br['id']]),
        'watching' => (int) qv('SELECT COUNT(*) FROM bunky_seen WHERE seen_at > ?', [$now - 12]),
    ];
    /* history, hot and cold, and the winners boards change once a round: only sent when the screen's copy is out of date */
    $landed = (int) qv('SELECT MAX(id) FROM bunky_rounds WHERE land_at <= ?', [$now]);
    $fin = (int) qv('SELECT MAX(id) FROM bunky_rounds WHERE end_at <= ?', [$now]);
    $have = (string) ($in['have'] ?? '');
    if ($landed && $have !== $landed . '.' . $fin) $res += bk_boards($landed, $fin, $now);
    return $res;
}
/* Last 20 results, hot and cold over the last 100, the last finished round's winners and the best wins lately. */
function bk_boards(int $landed, int $fin, float $now): array {
    $rows = q('SELECT id, spot, boost, top_x, end_at FROM bunky_rounds WHERE id <= ? ORDER BY id DESC LIMIT 100', [$landed])->fetchAll();
    $hist = []; $counts = []; $since = [];
    foreach ($rows as $i => $h) {
        /* a bonus's best result stays hidden until the round is over (the picks are made before it is shown) */
        if ($i < 20) $hist[] = ['id' => (int) $h['id'], 'spot' => $h['spot'], 'boost' => (int) $h['boost'], 'x' => (int) $h['id'] <= $fin ? (int) $h['top_x'] : null];
        $counts[$h['spot']] = ($counts[$h['spot']] ?? 0) + 1;
        if (!isset($since[$h['spot']])) $since[$h['spot']] = $i;
    }
    $winners = [];
    if ($fin) {
        $fr = bk_round($fin);
        if ($fr) bk_fill_wins($fr, $now);
        foreach (q('SELECT b.user_id, b.total, b.win, u.username, u.avatar FROM bunky_bets b JOIN users u ON u.id = b.user_id WHERE b.round_id = ? AND b.win > 0 ORDER BY b.win DESC LIMIT 10', [$fin])->fetchAll() as $w)
            $winners[] = ['id' => (int) $w['user_id'], 'name' => $w['username'], 'avatar' => $w['avatar'], 'win' => (int) $w['win'], 'total' => (int) $w['total']];
    }
    $top = [];
    foreach (q('SELECT b.win, b.total, r.spot, u.username, u.avatar FROM bunky_bets b JOIN users u ON u.id = b.user_id JOIN bunky_rounds r ON r.id = b.round_id WHERE b.round_id > ? AND b.round_id <= ? AND b.win > 0 ORDER BY b.win DESC LIMIT 5', [$fin - 400, $fin])->fetchAll() as $w)
        $top[] = ['name' => $w['username'], 'avatar' => $w['avatar'], 'win' => (int) $w['win'], 'x' => round((int) $w['win'] / max(1, (int) $w['total']), 1), 'spot' => $w['spot']];
    return ['have' => $landed . '.' . $fin, 'hist' => $hist, 'stats' => ['n' => count($rows), 'counts' => (object) $counts, 'since' => (object) $since], 'winners' => ['round' => $fin, 'list' => $winners], 'top' => $top];
}
