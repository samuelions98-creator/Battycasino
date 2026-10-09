<?php
/* The Bat Pass: a 30-day season of 50 tiers, 1,000 XP each.
   XP comes from play (after_round -> plat_after_round), daily and weekly challenges, the wheel and Tier Skips.
   XP from wagering: per round 1 + sqrt(stake) / 4 (20 BB -> 2, 1,000 BB -> 9, 10,000 BB -> 26), so it grows far
   slower than the stake, and within a UK day the rate halves after 3,000 XP and quarters after 6,000 XP.
   Double Pass XP boosts double the XP from play (not challenges).
   Two tracks: Free, and Gold (250,000 BB, or 500,000 BB for Gold + 10 tiers). Each (season, tier, track) reward
   can be claimed once (primary key on plat_pass_claims). */
if (!defined('BATTY')) { http_response_code(403); exit; }

const PASS_TIERS = 50;
const PASS_TIER_XP = 1000;
const PASS_GOLD_PRICE = 250000;
const PASS_BUNDLE_PRICE = 500000;
const PASS_SEASON_DAYS = 30;
const PASS_LIVE_GAMES = ['moonshot', 'batjack', 'roulette', 'royale', 'baccarat'];
const PASS_SLOT_GAMES = ['olympus', 'fishing', 'ultraheist', 'bonanza', 'starwing', 'circus', 'crypt', 'nighttrain', 'gummy', 'bookofbats', 'bonkers', 'vault'];

function pass_season(): array {
    static $s = null;
    if ($s) return $s;
    $tz = new DateTimeZone('Europe/London');
    $epoch = new DateTime((string) setting('pass_epoch', '2026-10-01'), $tz);
    $today = new DateTime(plat_day(), $tz);
    $days = max(0, (int) $epoch->diff($today)->format('%r%a'));
    $n = intdiv($days, PASS_SEASON_DAYS) + 1;
    $start = (clone $epoch)->modify('+' . (($n - 1) * PASS_SEASON_DAYS) . ' days');
    $end = (clone $start)->modify('+' . PASS_SEASON_DAYS . ' days');
    $names = ['Harvest Moon', 'Frostbite', 'Velvet Nights', 'Thunder & Fangs', 'Neon Belfry', 'Midsummer Madness'];
    return $s = ['n' => $n, 'name' => $names[($n - 1) % count($names)], 'start' => $start->getTimestamp(), 'end' => $end->getTimestamp(), 'endsIn' => max(0, $end->getTimestamp() - plat_time())];
}
function pass_tier(int $xp): int { return min(PASS_TIERS, intdiv(max(0, $xp), PASS_TIER_XP)); }
function pass_claimable_count(int $tier, bool $gold): int { return $tier * ($gold ? 2 : 1); }

/* Rewards per tier. Each grant: ['bb', n] | ['item', id, qty]. */
function pass_rewards(): array {
    static $r = null;
    if ($r) return $r;
    $free = [
        1 => [['bb', 2000]], 2 => [['item', 'bo_xp1h', 1]], 3 => [['bb', 2500]], 4 => [['item', 'tk_spin', 1]], 5 => [['item', 'cr_night', 1]],
        6 => [['bb', 3000]], 7 => [['item', 'em_wave', 1]], 8 => [['bb', 3000]], 9 => [['item', 'tk_spin', 1]], 10 => [['item', 'fr_bat', 1]],
        11 => [['bb', 3500]], 12 => [['item', 'bo_xp1h', 1]], 13 => [['bb', 3500]], 14 => [['item', 'tk_spin', 1]], 15 => [['item', 'ns_ecto', 1]],
        16 => [['bb', 4000]], 17 => [['item', 'tk_premium', 1]], 18 => [['bb', 4000]], 19 => [['item', 'tk_spin', 1]], 20 => [['item', 'ti_nightowl', 1]],
        21 => [['bb', 4500]], 22 => [['item', 'bo_xp1h', 1]], 23 => [['bb', 4500]], 24 => [['item', 'tk_spin', 2]], 25 => [['item', 'cr_night', 1]],
        26 => [['bb', 5000]], 27 => [['item', 'tk_premium', 1]], 28 => [['bb', 5000]], 29 => [['item', 'tk_spin', 1]], 30 => [['item', 'acc_monocle', 1]],
        31 => [['bb', 5500]], 32 => [['item', 'bo_xp1h', 1]], 33 => [['bb', 5500]], 34 => [['item', 'tk_spin', 2]], 35 => [['item', 'cr_night', 1]],
        36 => [['bb', 6000]], 37 => [['item', 'tk_premium', 1]], 38 => [['bb', 6000]], 39 => [['item', 'tk_spin', 2]], 40 => [['item', 'em_gg', 1]],
        41 => [['bb', 7000]], 42 => [['item', 'bo_xp1h', 1]], 43 => [['bb', 7000]], 44 => [['item', 'tk_spin', 2]], 45 => [['item', 'cr_night', 1]],
        46 => [['bb', 8000]], 47 => [['item', 'tk_premium', 1]], 48 => [['bb', 8000]], 49 => [['item', 'tk_spin', 3]], 50 => [['item', 'ti_passmaster', 1], ['bb', 25000]],
    ];
    $gold = [
        1 => [['item', 'ns_sunset', 1]], 2 => [['bb', 8000]], 3 => [['item', 'tk_premium', 1]], 4 => [['bb', 8000]], 5 => [['item', 'fr_gold', 1]],
        6 => [['bb', 10000]], 7 => [['item', 'bo_xp24h', 1]], 8 => [['bb', 10000]], 9 => [['item', 'cr_night', 1]], 10 => [['item', 'acc_wizard', 1]],
        11 => [['bb', 12000]], 12 => [['item', 'tk_spin', 3]], 13 => [['bb', 12000]], 14 => [['item', 'tk_premium', 2]], 15 => [['item', 'em_cheers', 1]],
        16 => [['bb', 14000]], 17 => [['item', 'cr_night', 1]], 18 => [['bb', 14000]], 19 => [['item', 'bo_xp24h', 1]], 20 => [['item', 'fx_sparkle', 1]],
        21 => [['bb', 16000]], 22 => [['item', 'tk_premium', 2]], 23 => [['bb', 16000]], 24 => [['item', 'cr_blood', 1]], 25 => [['item', 'ns_disco', 1]],
        26 => [['bb', 18000]], 27 => [['item', 'tk_spin', 3]], 28 => [['bb', 18000]], 29 => [['item', 'bo_xp24h', 1]], 30 => [['item', 'fr_neon', 1]],
        31 => [['bb', 20000]], 32 => [['item', 'tk_premium', 3]], 33 => [['bb', 20000]], 34 => [['item', 'cr_blood', 1]], 35 => [['item', 'acc_starcape', 1]],
        36 => [['bb', 22000]], 37 => [['item', 'tk_spin', 5]], 38 => [['bb', 22000]], 39 => [['item', 'bo_xp24h', 1]], 40 => [['item', 'ti_count', 1]],
        41 => [['bb', 25000]], 42 => [['item', 'tk_premium', 3]], 43 => [['bb', 25000]], 44 => [['item', 'cr_blood', 1]], 45 => [['item', 'em_bow', 1]],
        46 => [['bb', 30000]], 47 => [['item', 'tk_spin', 5]], 48 => [['bb', 30000]], 49 => [['item', 'cr_blood', 1]], 50 => [['item', 'fx_eclipse', 1], ['item', 'ti_belfry', 1], ['bb', 100000]],
    ];
    $r = [];
    for ($t = 1; $t <= PASS_TIERS; $t++) $r[$t] = ['f' => $free[$t], 'g' => $gold[$t]];
    return $r;
}

function pass_row(array $u, bool $lock = false): array {
    $s = pass_season()['n'];
    $sql = 'SELECT * FROM plat_pass WHERE user_id = ? AND season = ?' . ($lock ? ' FOR UPDATE' : '');
    $r = q1($sql, [$u['id'], $s]);
    if ($r) return $r;
    q('INSERT IGNORE INTO plat_pass (user_id, season) VALUES (?, ?)', [$u['id'], $s]);
    return q1($sql, [$u['id'], $s]);
}
/* Add pass XP (inside the caller's transaction, player locked). Tier-ups raise a 'pass' event for the shell. */
function pass_add_xp(array &$u, int $xp, string $why): int {
    if ($xp <= 0) return 0;
    $r = pass_row($u, true);
    $before = (int) $r['xp']; $after = $before + $xp;
    q('UPDATE plat_pass SET xp = ? WHERE user_id = ? AND season = ?', [$after, $u['id'], $r['season']]);
    $t0 = pass_tier($before); $t1 = pass_tier($after);
    if ($t1 > $t0) event(['type' => 'pass', 'kind' => 'tier', 'tier' => $t1, 'from' => $t0, 'gold' => (bool) $r['gold']]);
    return $xp;
}

/* ---------- XP from play: called once per settled round from after_round() in lib/wallet.php ---------- */
function plat_after_round(array &$u, string $game, int $stake, int $win, array $f, float $x): void {
    if ($stake > 0) {
        $r = pass_row($u, true);
        $day = plat_day();
        $dayXp = $r['day'] === $day ? (int) $r['day_xp'] : 0;
        $rate = $dayXp < 3000 ? 1.0 : ($dayXp < 6000 ? 0.5 : 0.25);
        $base = max(1, (int) round((1 + sqrt($stake) / 4) * $rate));
        $p = q1('SELECT boost_until FROM plat_profile WHERE user_id = ?', [$u['id']]);
        $boost = $p && $p['boost_until'] && strtotime($p['boost_until'] . ' UTC') > plat_time();
        q('UPDATE plat_pass SET day = ?, day_xp = ? WHERE user_id = ? AND season = ?', [$day, $dayXp + $base, $u['id'], $r['season']]);
        pass_add_xp($u, $boost ? $base * 2 : $base, 'play');
    }
    plat_challenges_progress($u, $game, $stake, $win, $x, $f);
}

/* ---------- challenges ---------- */
function plat_challenge_defs(): array {
    return [
        /* daily */
        'd_rounds' => ['Play {t} rounds', 40, 200],
        'd_wager' => ['Wager {t} Batty Bucks', 20000, 200],
        'd_win' => ['Win {t} Batty Bucks', 15000, 200],
        'd_variety' => ['Play 3 different games', 3, 250],
        'd_slots' => ['Play 3 different slots', 3, 250],
        'd_wheel' => ['Spin the Daily Wheel', 1, 150],
        'd_bonus' => ['Trigger 2 bonus features', 2, 300],
        'd_big' => ['Land a win of 10× or more', 1, 300],
        /* weekly */
        'w_wager' => ['Wager {t} Batty Bucks', 250000, 1200],
        'w_rounds' => ['Play {t} rounds', 500, 1500],
        'w_days' => ['Spin the wheel on 5 different days', 5, 1500],
        'w_bonus' => ['Trigger 5 bonus features', 5, 1200],
        'w_variety' => ['Play 6 different games', 6, 1200],
        'w_live' => ['Win 10× on a live game', 1, 2000],
        'w_x25' => ['Land 3 wins of 25× or more', 3, 2000],
    ];
}
function plat_periods(): array {
    $d = plat_dt();
    $mon = (clone $d)->modify('-' . ((int) $d->format('N') - 1) . ' days');
    $nextMon = (clone $mon)->modify('+7 days')->setTime(0, 0);
    return ['d' => 'd' . $d->format('Y-m-d'), 'w' => 'w' . $mon->format('Y-m-d'), 'dIn' => plat_secs_to_midnight(), 'wIn' => $nextMon->getTimestamp() - $d->getTimestamp()];
}
function plat_challenges_ensure(array $u): array {
    static $done = [];
    $per = plat_periods();
    $key = $u['id'] . $per['d'];
    if (isset($done[$key])) return $per;
    $defs = plat_challenge_defs();
    $tier = mission_tier((int) $u['level']);
    $sets = [
        'd' => [['d_rounds', 'd_wager', 'd_win'], ['d_variety', 'd_slots', 'd_wheel'], ['d_bonus', 'd_big']],
        'w' => [['w_wager', 'w_rounds', 'w_days'], ['w_bonus', 'w_variety'], ['w_live', 'w_x25']],
    ];
    foreach (['d', 'w'] as $k) {
        $period = $per[$k];
        if ((int) qv('SELECT COUNT(*) FROM plat_challenges WHERE user_id = ? AND period = ?', [$u['id'], $period]) >= 3) continue;
        $h = crc32('bp|' . $u['id'] . '|' . $period);
        foreach ($sets[$k] as $slot => $opts) {
            $ch = $opts[$h % count($opts)]; $h = intdiv($h, count($opts));
            [, $target, $xp] = $defs[$ch];
            if (in_array($ch, ['d_wager', 'd_win', 'w_wager'], true)) $target *= $tier;
            q('INSERT IGNORE INTO plat_challenges (user_id, period, slot, ch, target, xp) VALUES (?,?,?,?,?,?)', [$u['id'], $period, $slot, $ch, $target, $xp]);
        }
    }
    $done[$key] = true;
    return $per;
}
function plat_challenge_label(string $ch, int $target): string {
    $d = plat_challenge_defs()[$ch] ?? ['?', 0, 0];
    return str_replace('{t}', number_format($target), $d[0]);
}
/* Move challenges on; pays the XP the moment one completes. $by maps challenge id -> callable(row) returning [add, meta]. */
function plat_challenges_apply(array &$u, callable $step): void {
    $per = plat_challenges_ensure($u);
    $rows = q('SELECT * FROM plat_challenges WHERE user_id = ? AND period IN (?, ?) AND done_at IS NULL FOR UPDATE', [$u['id'], $per['d'], $per['w']])->fetchAll();
    foreach ($rows as $c) {
        [$add, $meta] = $step($c);
        if ($add <= 0 && $meta === $c['meta']) continue;
        $p = min((int) $c['target'], (int) $c['progress'] + max(0, $add));
        $done = $p >= (int) $c['target'];
        q('UPDATE plat_challenges SET progress = ?, meta = ?, done_at = ? WHERE user_id = ? AND period = ? AND slot = ?', [$p, $meta, $done ? now_sql() : null, $u['id'], $c['period'], $c['slot']]);
        if ($done) {
            event(['type' => 'pass', 'kind' => 'challenge', 'label' => plat_challenge_label($c['ch'], (int) $c['target']), 'xp' => (int) $c['xp'], 'weekly' => $c['period'][0] === 'w']);
            pass_add_xp($u, (int) $c['xp'], 'challenge');
        }
    }
}
function plat_challenges_progress(array &$u, string $game, int $stake, int $win, float $x, array $f): void {
    $gi = array_search($game, BATTY_GAMES, true);
    plat_challenges_apply($u, function (array $c) use ($game, $stake, $win, $x, $f, $gi) {
        $meta = $c['meta'];
        switch ($c['ch']) {
            case 'd_rounds': case 'w_rounds': return [1, $meta];
            case 'd_wager': case 'w_wager': return [$stake, $meta];
            case 'd_win': return [$win, $meta];
            case 'd_bonus': case 'w_bonus': return [(int) ($f['bonus'] ?? 0), $meta];
            case 'd_big': return [($x >= 10 && $stake > 0) ? 1 : 0, $meta];
            case 'w_x25': return [($x >= 25 && $stake > 0) ? 1 : 0, $meta];
            case 'w_live': return [($x >= 10 && $stake > 0 && in_array($game, PASS_LIVE_GAMES, true)) ? 1 : 0, $meta];
            case 'd_slots':
                if (!in_array($game, PASS_SLOT_GAMES, true)) return [0, $meta];
                /* fall through: count distinct games in a bit mask */
            case 'd_variety': case 'w_variety':
                if ($gi === false) return [0, $meta];
                $mask = (int) $meta | (1 << $gi);
                return [substr_count(decbin($mask), '1') - (int) $c['progress'], (string) $mask];
        }
        return [0, $meta];
    });
}
/* Non-play events (the wheel). */
function plat_challenge_bump(array &$u, string $what, int $n): void {
    if ($what !== 'wheel') return;
    $day = plat_day();
    plat_challenges_apply($u, function (array $c) use ($n, $day) {
        if ($c['ch'] === 'd_wheel') return [$n, $c['meta']];
        if ($c['ch'] === 'w_days') return $c['meta'] === $day ? [0, $c['meta']] : [1, $day];
        return [0, $c['meta']];
    });
}
function plat_challenges_list(array $u): array {
    $per = plat_challenges_ensure($u);
    $rows = q('SELECT * FROM plat_challenges WHERE user_id = ? AND period IN (?, ?) ORDER BY period, slot', [$u['id'], $per['d'], $per['w']])->fetchAll();
    $out = ['daily' => [], 'weekly' => [], 'dailyIn' => $per['dIn'], 'weeklyIn' => $per['wIn']];
    foreach ($rows as $c) {
        $out[$c['period'] === $per['d'] ? 'daily' : 'weekly'][] = ['id' => $c['ch'], 'label' => plat_challenge_label($c['ch'], (int) $c['target']), 'target' => (int) $c['target'], 'progress' => (int) $c['progress'], 'xp' => (int) $c['xp'], 'done' => $c['done_at'] !== null];
    }
    return $out;
}

/* ---------- actions ---------- */
function pass_grant_public(array $g): array {
    if ($g[0] === 'bb') return ['t' => 'bb', 'n' => $g[1]];
    $it = plat_item($g[1]);
    return ['t' => 'item', 'i' => $g[1], 'n' => $g[2], 'name' => $it['name'], 'rarity' => $it['rarity'], 'cat' => $it['cat'], 'slot' => $it['slot']];
}
function pass_api_state(): array {
    $u = require_user();
    $r = tx(function () use ($u) { return pass_row($u); });
    $season = pass_season();
    $claimed = [];
    foreach (q('SELECT tier, track FROM plat_pass_claims WHERE user_id = ? AND season = ?', [$u['id'], $season['n']])->fetchAll() as $c) $claimed[$c['track'] . $c['tier']] = true;
    $tiers = [];
    foreach (pass_rewards() as $t => $tr) {
        $tiers[] = ['tier' => $t, 'f' => array_map('pass_grant_public', $tr['f']), 'g' => array_map('pass_grant_public', $tr['g']), 'fc' => isset($claimed['f' . $t]), 'gc' => isset($claimed['g' . $t])];
    }
    $p = plat_profile_row((int) $u['id']);
    $boost = $p['boost_until'] ? strtotime($p['boost_until'] . ' UTC') - plat_time() : 0;
    $dayXp = $r['day'] === plat_day() ? (int) $r['day_xp'] : 0;
    return [
        'season' => $season['n'], 'name' => $season['name'], 'endsIn' => $season['endsIn'], 'days' => PASS_SEASON_DAYS,
        'xp' => (int) $r['xp'], 'tier' => pass_tier((int) $r['xp']), 'tierXp' => PASS_TIER_XP, 'tiers' => PASS_TIERS, 'gold' => (bool) $r['gold'],
        'price' => PASS_GOLD_PRICE, 'bundle' => PASS_BUNDLE_PRICE, 'rewards' => $tiers,
        'challenges' => plat_challenges_list($u), 'boostIn' => max(0, $boost),
        'dayXp' => $dayXp, 'rate' => $dayXp < 3000 ? 1 : ($dayXp < 6000 ? 0.5 : 0.25),
    ];
}
/* Claim one reward ({tier, track}) or everything available ({all: true}). */
function pass_api_claim(array $in): array {
    $all = !empty($in['all']);
    $tier = $all ? 0 : in_int($in, 'tier', 1, PASS_TIERS);
    $track = $all ? '' : (string) ($in['track'] ?? '');
    if (!$all && !in_array($track, ['f', 'g'], true)) throw new ApiError('Pick a track.');
    return plat_tx(function (array &$u) use ($all, $tier, $track) {
        $r = pass_row($u, true);
        $season = (int) $r['season']; $have = pass_tier((int) $r['xp']); $gold = (bool) $r['gold'];
        $want = [];
        if ($all) { for ($t = 1; $t <= $have; $t++) { $want[] = [$t, 'f']; if ($gold) $want[] = [$t, 'g']; } }
        else {
            if ($tier > $have) throw new ApiError('Reach tier ' . $tier . ' first.', 409);
            if ($track === 'g' && !$gold) throw new ApiError('That reward is on the Gold track. Unlock Gold first.', 409);
            $want[] = [$tier, $track];
        }
        $rewards = pass_rewards(); $got = []; $bb = 0;
        foreach ($want as [$t, $tr]) {
            $st = q('INSERT IGNORE INTO plat_pass_claims (user_id, season, tier, track, claimed_at) VALUES (?,?,?,?,?)', [$u['id'], $season, $t, $tr, now_sql()]);
            if ($st->rowCount() < 1) { if (!$all) throw new ApiError('Already claimed.', 409); continue; }
            foreach ($rewards[$t][$tr] as $g) {
                if ($g[0] === 'bb') { credit($u, $g[1], 'pass', null, null, 'Bat Pass S' . $season . ' tier ' . $t . ($tr === 'g' ? ' Gold' : '')); $bb += $g[1]; $got[] = ['tier' => $t, 'track' => $tr] + pass_grant_public($g); }
                else { $res = plat_give($u, $g[1], $g[2], 'pass', 'pass'); $bb += $res['dup']; $got[] = ['tier' => $t, 'track' => $tr, 'dup' => $res['dup']] + pass_grant_public($g); }
            }
        }
        if ($all && !$got) throw new ApiError('Nothing to claim yet. Play on to reach the next tier.', 409);
        return ['got' => $got, 'bb' => $bb];
    });
}
function pass_api_buy(array $in): array {
    $bundle = !empty($in['bundle']);
    return plat_tx(function (array &$u) use ($bundle) {
        $r = pass_row($u, true);
        if ((int) $r['gold']) throw new ApiError('You already have Bat Pass Gold this season.', 409);
        $price = $bundle ? PASS_BUNDLE_PRICE : PASS_GOLD_PRICE;
        credit($u, -$price, 'pass', null, null, 'Bat Pass Gold S' . $r['season'] . ($bundle ? ' + 10 tiers' : ''));
        q('UPDATE plat_pass SET gold = 1, gold_at = ? WHERE user_id = ? AND season = ?', [now_sql(), $u['id'], $r['season']]);
        event(['type' => 'pass', 'kind' => 'gold']);
        if ($bundle) pass_add_xp($u, 10 * PASS_TIER_XP, 'bundle');
        return ['gold' => true, 'paid' => $price];
    });
}
