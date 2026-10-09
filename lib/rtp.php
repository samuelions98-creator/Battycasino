<?php
/* Live RTP balancing — a "compensated machine", per game, site-wide.

   Every game's maths is designed to return about 98% on its own. On top of that, each game keeps a running record of what it has
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
   Targets default to 98% and can be changed per game in the admin panel (settings key rtp_<game>, a percentage). */
if (!defined('BATTY')) { http_response_code(403); exit; }

const RTP_DEFAULT = 98.0;          // %
const RTP_WINDOW = 3000000;        // BB of stake: the recent window's decay length
const RTP_SPAN = 0.06;             // the recent window running 6 points off target -> full bias
const RTP_LIFE_SPAN = 0.015;       // lifetime running 1.5 points off target -> full bias
const RTP_REROLL = 0.6;            // at full bias, chance a qualifying draw is redrawn

function rtp_target(string $game): float {
    $v = setting('rtp_' . $game);
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
    $k = exp(-$stake / RTP_WINDOW);
    $rr = $GLOBALS['RTP_REROLLED'][$game] ?? 0; unset($GLOBALS['RTP_REROLLED'][$game]);
    q('INSERT INTO rtp_games (game, w_stake, w_win, life_stake, life_win, rounds, rerolls) VALUES (?,?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE w_stake = w_stake * ? + VALUES(w_stake), w_win = w_win * ? + VALUES(w_win),
       life_stake = life_stake + VALUES(life_stake), life_win = life_win + VALUES(life_win), rounds = rounds + 1, rerolls = rerolls + VALUES(rerolls)',
      [$game, $stake, $win, $stake, $win, $rr, $k, $k]);
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
