<?php
/* Live RTP balancing — a "compensated machine", per game, site-wide.

   Every game's maths is designed to return about 96-97% on its own. On top of that, each game keeps a running record of what it has
   taken and paid across ALL players: a recent window (exponentially decayed, so old play fades out) and the lifetime total.
   From those it works out a bias between -1 and +1:
       bias > 0  the game has been paying MORE than its target  -> lean tighter
       bias < 0  the game has been paying LESS than its target  -> lean looser
   Games use the bias in one of two ways:
     rtp_pick($game, $stake, $gen)  — for any round whose outcome is drawn in one go. $gen() draws a complete outcome and returns
                                      [$outcome, $returnInBB]. If the game is running hot and the draw is a win, it may be redrawn once;
                                      if it is running cold and the draw is a loss, it may be redrawn once. The second draw always stands.
                                      Nothing else changes, so every outcome the player sees is a genuine draw from the game's maths.
     rtp_bias($game)                — the raw number, for games with their own lever (e.g. Moonshot's crash curve, a mines table).
   Targets default to 96.5%; the settings key rtp_default changes them all and rtp_<game> overrides one (a percentage). The Admin page edits both. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const RTP_DEFAULT = 96.5;          // % (every game's maths is designed for 96-97%; set rtp_<game> in settings to override one game)
const RTP_WINDOW = 3000000;        // BB of stake: the recent window's decay length
const RTP_SPAN = 0.06;             // the recent window running 6 points off target -> full bias
const RTP_LIFE_SPAN = 0.015;       // lifetime running 1.5 points off target -> full bias
const RTP_REROLL = 0.6;            // at full bias, chance a qualifying draw is redrawn

/* The Return Boost: on top of each game's own maths, a fixed share of every stake is paid back automatically, in every game
   except the table games (whose own return is already near 100%). It is set from the Admin page (settings key rtp_boost,
   in percentage points) and applies to the stake up to RTP_BOOST_CAP, like the jackpots, so one giant bet cannot farm it.
   It is paid with credit() and never counted as a game win, so the live balancer and the Batty Cup are unaffected. */
const RTP_BOOST_DEFAULT = 0.5;
const RTP_BOOST_MAX = 3.0;
const RTP_BOOST_CAP = 100000;
const RTP_BOOST_EXCLUDED = ['batjack', 'baccarat', 'royale', 'roulette'];
function rtp_boost_base(): float {   // the setting alone (what the Admin page edits)
    $v = setting('rtp_boost');
    $b = $v === null || $v === '' ? RTP_BOOST_DEFAULT : (float) $v;
    return max(0.0, min(RTP_BOOST_MAX, $b));
}
function rtp_boost_pct(): float {   // what is paid right now: the setting plus any running Happy Hour
    $b = rtp_boost_base();
    if (function_exists('happy_active') && ($e = happy_active())) $b += (float) $e['boost'];   // Happy Hour (lib/platform/happy.php)
    return $b;
}
/* Called for every settled round (from after_round). The fractional BB is paid by chance, so it is exact on average. */
function rtp_boost_apply(array &$u, string $game, int $stake): void {
    if ($stake <= 0 || in_array($game, RTP_BOOST_EXCLUDED, true)) return;
    $b = rtp_boost_pct(); if ($b <= 0) return;
    $x = min($stake, RTP_BOOST_CAP) * $b / 100;
    $pay = (int) floor($x);
    if (random_int(0, 999999) < ($x - $pay) * 1000000) $pay++;
    if ($pay > 0) credit($u, $pay, 'boost', $game, null, 'Return boost');
}
function rtp_target(string $game): float {
    $v = setting('rtp_' . $game);
    if ($v === null || $v === '') $v = setting('rtp_default');
    $t = $v === null || $v === '' ? RTP_DEFAULT : (float) $v;
    return max(50.0, min(120.0, $t)) / 100;
}
function rtp_row(string $game): array {
    static $cache = [];
    if (!isset($cache[$game])) {
        $r = q1('SELECT * FROM rtp_games WHERE game = ?', [$game]);
        $cache[$game] = $r ?: ['game' => $game, 'w_stake' => 0, 'w_win' => 0, 'life_stake' => 0, 'life_win' => 0, 'rounds' => 0, 'rerolls' => 0];
    }
    return $cache[$game];
}
/* -1 .. +1, positive = paying too much */
function rtp_bias(string $game): float {
    $r = rtp_row($game); $t = rtp_target($game);
    $ws = (float) $r['w_stake']; $ls = (float) $r['life_stake'];
    if ($ws < 20000) return 0.0;                                          // not enough play to judge yet
    $conf = min(1.0, $ws / (RTP_WINDOW * 0.25));                            // trust the window as it fills
    $recent = ((float) $r['w_win'] / $ws - $t) / RTP_SPAN * $conf;
    $life = $ls > 0 ? ((float) $r['life_win'] / $ls - $t) / RTP_LIFE_SPAN * min(1.0, $ls / (RTP_WINDOW * 2)) : 0;
    return max(-1.0, min(1.0, 0.6 * $recent + 0.4 * $life));
}
/* Draw an outcome, possibly redrawing once (see above). $gen(): [$outcome, $returnInBB]. Returns $outcome. */
function rtp_pick(string $game, int $stake, callable $gen) {
    [$o, $ret] = $gen();
    $b = rtp_bias($game);
    $redraw = ($b > 0 && $ret > $stake) || ($b < 0 && $ret < $stake);
    if ($redraw && $stake > 0 && batty_rng()() < abs($b) * RTP_REROLL) {
        [$o, $ret] = $gen();
        $GLOBALS['RTP_REROLLED'][$game] = ($GLOBALS['RTP_REROLLED'][$game] ?? 0) + 1;
    }
    return $o;
}
/* Called for every settled round (from after_round). */
function rtp_record(string $game, int $stake, int $win): void {
    if ($stake <= 0 && $win <= 0) return;
    /* One giant bet must not swamp the recent window: rounds count at most 100,000 BB of stake there (win scaled to match). */
    $sc = $stake > 100000 ? 100000 / $stake : 1.0; $ws = $stake * $sc; $ww = $win * $sc;
    $k = exp(-$ws / RTP_WINDOW);
    $rr = $GLOBALS['RTP_REROLLED'][$game] ?? 0; unset($GLOBALS['RTP_REROLLED'][$game]);
    q('INSERT INTO rtp_games (game, w_stake, w_win, life_stake, life_win, rounds, rerolls) VALUES (?,?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE w_stake = w_stake * ? + VALUES(w_stake), w_win = w_win * ? + VALUES(w_win),
       life_stake = life_stake + VALUES(life_stake), life_win = life_win + VALUES(life_win), rounds = rounds + 1, rerolls = rerolls + VALUES(rerolls)',
      [$game, $ws, $ww, $stake, $win, $rr, $k, $k]);
}
/* For the admin panel. */
function rtp_report(): array {
    $out = [];
    $rows = []; foreach (q('SELECT * FROM rtp_games')->fetchAll() as $r) $rows[$r['game']] = $r;
    foreach (BATTY_GAMES as $g) {
        $r = $rows[$g] ?? ['w_stake' => 0, 'w_win' => 0, 'life_stake' => 0, 'life_win' => 0, 'rounds' => 0, 'rerolls' => 0];
        $out[$g] = ['target' => round(rtp_target($g) * 100, 2), 'custom' => setting('rtp_' . $g) !== null && setting('rtp_' . $g) !== '',
            'recent' => $r['w_stake'] > 0 ? round($r['w_win'] / $r['w_stake'] * 100, 2) : null, 'recentStake' => (int) $r['w_stake'],
            'life' => $r['life_stake'] > 0 ? round($r['life_win'] / $r['life_stake'] * 100, 2) : null, 'lifeStake' => (int) $r['life_stake'],
            'rounds' => (int) $r['rounds'], 'rerolls' => (int) $r['rerolls'], 'bias' => round(rtp_bias($g), 3)];
    }
    return $out;
}
