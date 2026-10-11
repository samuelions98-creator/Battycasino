<?php
/* The Daily Prize Wheel.
   - One free spin per UK day. Spinning on consecutive days builds a streak; each day of the 7-day cycle multiplies
     the Batty Bucks and XP prizes, and day 7 is the Golden Spin (×2.5, and the jackpot is four times as likely).
   - Bonus spins (tk_spin, from the Bat Pass) spin the same wheel at your current streak multiplier.
   - The Premium Wheel costs a ticket (tk_premium) or 25,000 BB, with fixed prizes up to a 1,000,000 BB jackpot.
   Daily prizes scale with level through claim_amount() (the hourly bonus, C):
     expected Batty Bucks from a day-1 free spin ≈ 1.1 × C; the jackpot is 25 × C (× the streak multiplier).
   The outcome is drawn here with batty_rng(), paid with credit($u, ..., 'wheel') and logged in plat_wheel_log. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const WHEEL_PREMIUM_PRICE = 25000;
const WHEEL_MULTS = [1 => 1.0, 2 => 1.1, 3 => 1.25, 4 => 1.4, 5 => 1.6, 6 => 1.8, 7 => 2.5];

/* Streak state from the profile row. 'streak' is the streak that today's free spin counts as. */
function wheel_streak_info(array $p): array {
    $today = plat_day();
    $yday = (new DateTime($today))->modify('-1 day')->format('Y-m-d');
    $last = $p['wheel_day'] ?? null; $s = (int) ($p['wheel_streak'] ?? 0);
    if ($last === $today) { $streak = max(1, $s); $ready = false; }
    elseif ($last === $yday) { $streak = $s + 1; $ready = true; }
    else { $streak = 1; $ready = true; }
    $day = (($streak - 1) % 7) + 1;
    return ['freeReady' => $ready, 'streak' => $streak, 'day' => $day, 'mult' => WHEEL_MULTS[$day], 'golden' => $day === 7, 'spunToday' => !$ready];
}

/* Segments in wheel order (clockwise from the top). w = weight. */
function wheel_segments(string $wheel, int $level, float $mult, bool $golden): array {
    if ($wheel === 'premium') {
        return [
            ['t' => 'bb', 'n' => 8000, 'w' => 20],
            ['t' => 'item', 'i' => 'cr_night', 'n' => 1, 'w' => 6],
            ['t' => 'bb', 'n' => 20000, 'w' => 14],
            ['t' => 'xp', 'n' => 1000, 'w' => 12],
            ['t' => 'bb', 'n' => 50000, 'w' => 4],
            ['t' => 'item', 'i' => 'bo_xp1h', 'n' => 1, 'w' => 9],
            ['t' => 'jackpot', 'n' => 1000000, 'w' => 0.3],
            ['t' => 'bb', 'n' => 12000, 'w' => 18],
            ['t' => 'xp', 'n' => 2000, 'w' => 4],
            ['t' => 'bb', 'n' => 30000, 'w' => 9],
            ['t' => 'item', 'i' => 'cr_blood', 'n' => 1, 'w' => 1.5],
            ['t' => 'bb', 'n' => 100000, 'w' => 1.2],
        ];
    }
    $C = claim_amount($level);
    $bb = fn(float $k) => (int) (round($k * $C * $mult / 50) * 50);
    $xp = fn(int $n) => (int) (round($n * $mult / 5) * 5);
    return [
        ['t' => 'bb', 'n' => $bb(0.5), 'w' => 20],
        ['t' => 'xp', 'n' => $xp(150), 'w' => 12],
        ['t' => 'bb', 'n' => $bb(1.5), 'w' => 13],
        ['t' => 'item', 'i' => 'bo_xp1h', 'n' => 1, 'w' => 5],
        ['t' => 'bb', 'n' => $bb(3), 'w' => 5],
        ['t' => 'item', 'i' => 'tk_premium', 'n' => 1, 'w' => 3],
        ['t' => 'jackpot', 'n' => $bb(25), 'w' => $golden ? 2 : 0.5],
        ['t' => 'bb', 'n' => $bb(1), 'w' => 18],
        ['t' => 'xp', 'n' => $xp(400), 'w' => 6],
        ['t' => 'bb', 'n' => $bb(2), 'w' => 9],
        ['t' => 'item', 'i' => 'cr_night', 'n' => 1, 'w' => 1.5],
        ['t' => 'bb', 'n' => $bb(5), 'w' => 2.5],
    ];
}
/* For the browser: segments with their odds in percent (shown in the wheel's info panel). */
function wheel_public(array $segs): array {
    $tw = array_sum(array_column($segs, 'w'));
    return array_map(function ($s) use ($tw) {
        $o = ['t' => $s['t'], 'n' => $s['n'], 'p' => round($s['w'] / $tw * 100, 2)];
        if (isset($s['i'])) { $o['i'] = $s['i']; $o['name'] = plat_item($s['i'])['name']; }
        return $o;
    }, $segs);
}
function wheel_draw(array $segs): int {
    $rng = batty_rng();
    $tw = array_sum(array_column($segs, 'w'));
    $r = $rng() * $tw;
    foreach ($segs as $i => $s) { $r -= $s['w']; if ($r < 0) return $i; }
    return count($segs) - 1;
}

/* The 7-day calendar for the wheel page. */
function wheel_calendar(array $info): array {
    $out = [];
    $cur = $info['day'];
    for ($d = 1; $d <= 7; $d++) {
        $state = $d < $cur ? 'done' : ($d === $cur ? ($info['spunToday'] ? 'done' : 'today') : 'next');
        $out[] = ['d' => $d, 'mult' => WHEEL_MULTS[$d], 'state' => $state, 'golden' => $d === 7];
    }
    return $out;
}

function wheel_api_state(): array {
    $u = require_user();
    $p = plat_profile_row((int) $u['id']);
    $info = wheel_streak_info($p);
    $inv = plat_inv((int) $u['id']);
    $recent = q('SELECT kind, prize, amount, created_at FROM plat_wheel_log WHERE user_id = ? ORDER BY id DESC LIMIT 8', [$u['id']])->fetchAll();
    return [
        'daily' => wheel_public(wheel_segments('daily', (int) $u['level'], $info['mult'], $info['golden'])),
        'premium' => wheel_public(wheel_segments('premium', 1, 1, false)),
        'price' => WHEEL_PREMIUM_PRICE,
        'streak' => $info + ['calendar' => wheel_calendar($info), 'nextIn' => plat_secs_to_midnight()],
        'spins' => $inv['tk_spin'] ?? 0, 'tickets' => $inv['tk_premium'] ?? 0,
        'claim' => claim_amount((int) $u['level']),
        'recent' => array_map(fn($r) => ['kind' => $r['kind'], 'prize' => $r['prize'], 'amount' => (int) $r['amount'], 'at' => strtotime($r['created_at'] . ' UTC')], $recent),
    ];
}

function wheel_api_spin(array $in): array {
    $kind = $in['kind'] ?? '';
    if (!in_array($kind, ['free', 'bonus', 'premium'], true)) throw new ApiError('Pick a wheel.');
    return plat_tx(function (array &$u) use ($kind) {
        $uid = (int) $u['id'];
        $p = plat_profile_row($uid, true);
        $info = wheel_streak_info($p);
        $today = plat_day();
        $freeDay = null; $paid = 0;
        if ($kind === 'free') {
            if (!$info['freeReady']) throw new ApiError('You have had today’s free spin. Come back after midnight (UK time).', 409);
            $freeDay = $today;
            q('UPDATE plat_profile SET wheel_day = ?, wheel_streak = ?, updated_at = ? WHERE user_id = ?', [$today, $info['streak'], now_sql(), $uid]);
            $info['spunToday'] = true; $info['freeReady'] = false;
        } elseif ($kind === 'bonus') {
            plat_take($uid, 'tk_spin');
        } else {
            if (plat_qty($uid, 'tk_premium') > 0) plat_take($uid, 'tk_premium');
            else { credit($u, -WHEEL_PREMIUM_PRICE, 'wheel', null, null, 'Premium Wheel ticket'); $paid = WHEEL_PREMIUM_PRICE; }
        }
        $wheel = $kind === 'premium' ? 'premium' : 'daily';
        $segs = wheel_segments($wheel, (int) $u['level'], $wheel === 'daily' ? $info['mult'] : 1, $wheel === 'daily' && $info['golden']);
        $i = wheel_draw($segs);
        $s = $segs[$i];
        $label = $kind === 'free' ? 'Daily Wheel' : ($kind === 'bonus' ? 'Bonus spin' : 'Premium Wheel');
        $prize = ['t' => $s['t'], 'n' => $s['n']];
        try {
            q('INSERT INTO plat_wheel_log (user_id, kind, free_day, streak_day, seg, prize, amount, created_at) VALUES (?,?,?,?,?,?,?,?)',
                [$uid, $kind, $freeDay, $wheel === 'daily' ? $info['day'] : 0, $i, $s['t'] === 'item' ? $s['i'] : $s['t'], $s['n'], now_sql()]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) throw new ApiError('You have had today’s free spin.', 409);
            throw $e;
        }
        if ($s['t'] === 'bb' || $s['t'] === 'jackpot') {
            credit($u, $s['n'], 'wheel', null, null, $label . ($s['t'] === 'jackpot' ? ' JACKPOT' : ''));
        } elseif ($s['t'] === 'xp') {
            pass_add_xp($u, $s['n'], 'wheel');
        } else {
            $g = plat_give($u, $s['i'], $s['n'], 'wheel', 'wheel');
            $prize['i'] = $s['i']; $prize['name'] = plat_item($s['i'])['name']; $prize['dup'] = $g['dup'];
        }
        if ($kind === 'free') { plat_challenge_bump($u, 'wheel', 1); }
        $inv = plat_inv($uid);
        return [
            'kind' => $kind, 'seg' => $i, 'prize' => $prize, 'paid' => $paid,
            'segments' => wheel_public($segs),
            'streak' => $info + ['calendar' => wheel_calendar($info), 'nextIn' => plat_secs_to_midnight()],
            'spins' => $inv['tk_spin'] ?? 0, 'tickets' => $inv['tk_premium'] ?? 0,
        ];
    });
}
