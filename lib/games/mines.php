<?php
/* Crypt Sweeper: a 5 x 5 crypt floor hides MINES skulls (1 to 24, chosen by the player); every other tile hides a crystal.
   Flip tiles one at a time. Each crystal raises the multiplier; a skull ends the round. Cash out whenever you like.
   Server side; games/mines/game.js has the identical maths (proved by tools/mines-xcheck.js on seeded rounds).

   The multiplier after k crystals is 96.5 / (the chance of surviving k flips), rounded DOWN to hundredths, in integers:
       mult100 = floor(193 * C(25,k) / (2 * C(25-mines,k)))   (that is 96.5 x the ratio, in hundredths).
   So whenever you stop, the expected return is at most 96.5% of the stake, with any number of skulls. A round that
   would pay more than MN_MAX_X times the stake is paid at the cap and ends. The skull positions are drawn on the server
   when the round starts and are only revealed when the round ends. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const MN_TILES = 25, MN_MAX_MINES = 24, MN_MAX_X = 10000;

function mn_choose(int $n, int $k): int {
    if ($k < 0 || $k > $n) return 0;
    $r = 1; $k = min($k, $n - $k);
    for ($i = 1; $i <= $k; $i++) $r = intdiv($r * ($n - $k + $i), $i);
    return $r;
}
/* multiplier in hundredths after k crystals with `mines` skulls, capped at MN_MAX_X */
function mn_mult(int $mines, int $k): int {
    if ($k <= 0) return 0;
    $c = mn_choose(MN_TILES - $mines, $k);
    if ($c === 0) return MN_MAX_X * 100;
    return min(MN_MAX_X * 100, intdiv(193 * mn_choose(MN_TILES, $k), 2 * $c));
}
function mn_win(int $stake, int $m100): int { return intdiv($stake * $m100, 100); }
/* the skull positions: a partial Fisher-Yates shuffle of the 25 tiles, sorted */
function mn_place(Closure $rng, int $mines): array {
    $a = range(0, MN_TILES - 1);
    for ($i = 0; $i < $mines; $i++) { $j = $i + (int) floor($rng() * (MN_TILES - $i)); if ($j >= MN_TILES) $j = MN_TILES - 1; [$a[$i], $a[$j]] = [$a[$j], $a[$i]]; }
    $m = array_slice($a, 0, $mines); sort($m);
    return $m;
}
/* does this many crystals end the round (all found, or the cap reached)? */
function mn_done(int $mines, int $k): bool { return $k >= MN_TILES - $mines || mn_mult($mines, $k) >= MN_MAX_X * 100; }

/* ---------- the API ---------- */
function mn_public(array $r, array $d): array {
    $k = count($d['picked']);
    return ['round' => (int) $r['id'], 'stake' => (int) $d['stake'], 'mines' => (int) $d['mines'], 'picked' => $d['picked'], 'm' => mn_mult($d['mines'], $k), 'next' => mn_done($d['mines'], $k) ? 0 : mn_mult($d['mines'], $k + 1)];
}
function mn_finish(array &$u, array $r, array $d, int $m100, string $how, ?int $tile = null): array {
    $stake = (int) $d['stake']; $win = mn_win($stake, $m100); $k = count($d['picked']);
    $f = ['bonus' => $k >= 5 ? 1 : 0, 'x' => $stake > 0 ? round($win / $stake, 2) : 0];
    if ($win >= $stake * 100 && $win > 0) $f['feedLabel'] = 'Crypt Sweeper ' . round($win / $stake) . 'x';
    round_close($u, $r, $win, $f);
    return ['over' => $how, 'win' => $win, 'm' => $m100, 'k' => $k, 'tile' => $tile, 'mineAt' => $d['mine']];
}
/* A player who left: banked crystals are paid; nothing flipped is refunded. */
function mines_settle_open(array &$u): void {
    while ($r = round_get_open($u, 'mines')) {
        $d = $r['data']; $k = count($d['picked']);
        $win = $k > 0 ? mn_win((int) $d['stake'], mn_mult($d['mines'], $k)) : (int) $d['stake'];
        round_close($u, $r, $win, ['x' => $d['stake'] > 0 ? round($win / $d['stake'], 2) : 0]);
    }
}
function play_mines(array &$u, string $op, array $in): array {
    if ($op === 'state') {
        $r = round_get_open($u, 'mines');
        return ['open' => $r ? mn_public($r, $r['data']) : null];
    }
    if ($op === 'start') {
        mines_settle_open($u);
        $stake = stake_of($in, STAKE_LADDER);
        $n = in_int($in, 'mines', 1, MN_MAX_MINES);
        if ($u['balance'] < $stake) throw new ApiError('Not enough Batty Bucks.', 402);
        $d = ['stake' => $stake, 'mines' => $n, 'mine' => mn_place(batty_rng(), $n), 'picked' => []];
        $rid = round_open($u, 'mines', $stake, $d);
        return mn_public(['id' => $rid], $d);
    }
    $r = round_get_open($u, 'mines', in_int($in, 'round', 1, PHP_INT_MAX));
    if (!$r) throw new ApiError('That round has finished.', 409);
    $d = $r['data']; $k = count($d['picked']);
    if ($op === 'reveal') {
        $t = in_int($in, 'tile', 0, MN_TILES - 1);
        if (in_array($t, $d['picked'], true)) throw new ApiError('That tile is already open.', 409);
        if (in_array($t, $d['mine'], true)) return mn_finish($u, $r, $d, 0, 'bomb', $t);
        $d['picked'][] = $t; $k++;
        if (mn_done($d['mines'], $k)) return mn_finish($u, $r, $d, mn_mult($d['mines'], $k), 'clear', $t);
        round_save_data((int) $r['id'], $d); $r['data'] = $d;
        return ['safe' => true, 'tile' => $t, 'k' => $k, 'm' => mn_mult($d['mines'], $k), 'next' => mn_mult($d['mines'], $k + 1), 'round' => (int) $r['id']];
    }
    if ($op === 'cash') {
        if ($k < 1) throw new ApiError('Flip a tile first.', 409);
        return mn_finish($u, $r, $d, mn_mult($d['mines'], $k), 'cash');
    }
    throw new ApiError('Unknown action.');
}
