<?php
/* Echo Chamber: a memory game with a push-your-luck ladder. Server side; games/echo/game.js has the identical maths
   (proved by tools/echo-xcheck.js on seeded rounds).

   A cave of four glowing crystals plays a pattern; you repeat it. Level 1 is 3 notes, every level adds one, up to level 15
   (17 notes). Get one note wrong and the round is over. Each time you repeat a pattern correctly, an echo-storm may knock
   the bat down anyway: it passes with probability EC_SURVIVE[level]. After every cleared level you choose: take the
   banked multiplier, or fly on to a longer pattern with a bigger multiplier.

   Skill sets how far you get. Luck is a fixed storm, so the maths is honest for everyone: the multiplier for clearing level
   L is 98 / (product of the storm odds up to L), rounded DOWN to hundredths. So a player with perfect memory returns at most
   98% whatever they choose, and anyone who slips returns less. The pattern is only sent to the browser when it is shown. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const EC_PADS = 4, EC_LEVELS = 15, EC_START_LEN = 3;
const EC_SURVIVE = [95, 93, 91, 89, 87, 85, 83, 81, 79, 77, 75, 73, 71, 69, 67];   // storm: percent chance to pass, per level

function ec_len(int $level): int { return EC_START_LEN + $level - 1; }
/* Multiplier in hundredths for having cleared $level levels (index 1..15), rounded down. */
function ec_mults(): array {
    $m = [0]; $p = 1.0;
    for ($i = 0; $i < EC_LEVELS; $i++) { $p *= EC_SURVIVE[$i] / 100; $m[] = (int) floor(98 / $p); }
    return $m;
}
function ec_win(int $stake, int $m100): int { return intdiv($stake * $m100, 100); }
function ec_seq(Closure $rng, int $len): array { $s = []; for ($i = 0; $i < $len; $i++) { $v = (int) floor($rng() * EC_PADS); $s[] = $v < EC_PADS ? $v : EC_PADS - 1; } return $s; }
function ec_start(Closure $rng): array { return ['L' => 1, 'seq' => ec_seq($rng, ec_len(1)), 'phase' => 'input', 'm' => 0]; }
/* Submit a pattern. Returns [state, result] with result miss | storm | top | ok. */
function ec_input(array $s, array $taps, Closure $rng): array {
    if ($s['phase'] !== 'input') throw new ApiError('That is not available now.', 409);
    if ($taps !== $s['seq']) { $s['phase'] = 'done'; return [$s, 'miss']; }
    if (!($rng() * 100 < EC_SURVIVE[$s['L'] - 1])) { $s['phase'] = 'done'; return [$s, 'storm']; }
    $M = ec_mults(); $s['m'] = $M[$s['L']];
    if ($s['L'] >= EC_LEVELS) { $s['phase'] = 'done'; return [$s, 'top']; }
    $s['phase'] = 'decide';
    return [$s, 'ok'];
}
function ec_next(array $s, Closure $rng): array {
    if ($s['phase'] !== 'decide') throw new ApiError('That is not available now.', 409);
    $s['L']++; $s['seq'] = ec_seq($rng, ec_len($s['L'])); $s['phase'] = 'input';
    return $s;
}

/* ---------- the API ---------- (the reply field is `lvl`: play() already puts the player's account level in `level`) */
function ec_public(array $r, array $s): array {
    $o = ['round' => (int) $r['id'], 'stake' => (int) $r['data']['stake'], 'lvl' => $s['L'], 'phase' => $s['phase'], 'm' => $s['m']];
    if ($s['phase'] === 'input') $o['seq'] = $s['seq'];
    return $o;
}
function ec_finish(array &$u, array $r, array $s, int $m100, string $how): array {
    $stake = (int) $r['data']['stake']; $win = ec_win($stake, $m100);
    $f = ['bonus' => $s['L'] >= 3 ? 1 : 0, 'x' => $stake > 0 ? round($win / $stake, 2) : 0];
    if ($how === 'top') $f['feedLabel'] = 'Echo Chamber: all 15 levels';
    round_close($u, $r, $win, $f);
    return ['over' => $how, 'win' => $win, 'm' => $m100, 'lvl' => $s['L'], 'expected' => $how === 'miss' ? $s['seq'] : null];
}
/* A player who left: a banked win is paid; a pattern left half-done is lost (level 1 has risked nothing yet and is refunded). */
function echo_settle_open(array &$u): void {
    while ($r = round_get_open($u, 'echo')) {
        $s = $r['data']['s']; $stake = (int) $r['data']['stake'];
        if ($s['phase'] === 'decide') $win = ec_win($stake, $s['m']);
        elseif ($s['L'] === 1) $win = $stake;
        else $win = 0;
        round_close($u, $r, $win, ['x' => $stake > 0 ? round($win / $stake, 2) : 0]);
    }
}
function play_echo(array &$u, string $op, array $in): array {
    if ($op === 'state') {
        $r = round_get_open($u, 'echo');
        return $r ? ['open' => ec_public($r, $r['data']['s'])] : ['open' => null];
    }
    if ($op === 'start') {
        echo_settle_open($u);
        $stake = stake_of($in, STAKE_LADDER);
        if ($u['balance'] < $stake) throw new ApiError('Not enough Batty Bucks.', 402);
        $s = ec_start(batty_rng());
        $rid = round_open($u, 'echo', $stake, ['stake' => $stake, 's' => $s]);
        return ec_public(['id' => $rid, 'data' => ['stake' => $stake]], $s);
    }
    $r = round_get_open($u, 'echo', in_int($in, 'round', 1, PHP_INT_MAX));
    if (!$r) throw new ApiError('That round has finished.', 409);
    $s = $r['data']['s'];
    if ($op === 'input') {
        $taps = $in['taps'] ?? null;
        if (!is_array($taps) || count($taps) !== count($s['seq'])) throw new ApiError('Repeat the whole pattern.');
        foreach ($taps as $t) if (!is_int($t) || $t < 0 || $t >= EC_PADS) throw new ApiError('Bad note.');
        [$s, $res] = ec_input($s, array_values($taps), batty_rng());
        if ($res === 'miss' || $res === 'storm') return ec_finish($u, $r, $s, 0, $res);
        if ($res === 'top') return ec_finish($u, $r, $s, $s['m'], 'top');
        $r['data']['s'] = $s; round_save_data((int) $r['id'], $r['data']);
        return ['cleared' => $s['L'], 'm' => $s['m'], 'lvl' => $s['L'], 'phase' => 'decide', 'round' => (int) $r['id']];
    }
    if ($op === 'next') {
        $s = ec_next($s, batty_rng());
        $r['data']['s'] = $s; round_save_data((int) $r['id'], $r['data']);
        return ec_public($r, $s);
    }
    if ($op === 'cash') {
        if ($s['phase'] !== 'decide') throw new ApiError('That is not available now.', 409);
        return ec_finish($u, $r, $s, $s['m'], 'cash');
    }
    throw new ApiError('Unknown action.');
}
