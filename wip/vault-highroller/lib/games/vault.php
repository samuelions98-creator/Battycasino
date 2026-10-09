<?php
/* Crimson Vault: PHP port of the maths at the top of games/vault/game.js (same rng call order, same results, proved by
   tools/vault-xcheck.js), plus the server action play_vault(). High Roller Lounge: level 5 and up, its own stake ladder.

   Amounts are in units: 1 unit = stake / 100 (every stake on the ladder is a multiple of 100). Line bet = 5 units.

   A round is either one request or two:
     op 'spin'  {stake}         a base spin, drawn through rtp_pick and settled at once with round_quick... unless 3+ Crimson
                                Keys land. Then the stake is taken with round_open and the spin comes back with pending:true.
     op 'spin'  {stake, buy}    buy 0 (100x stake) or 1 (300x, the Inside Job): round_open straight away, pending:true.
     op 'pick'  {round, mode}   the player picks the vault (0 Safe, 1 Deposit Box, 2 Grand Vault). Only now are the free spins
                                drawn (through rtp_pick, against the round's cost), and the round is settled with round_close.
     op 'state'                 the open round, if any, so a reloaded page can show the vault choice again.
   Nothing about the free spins exists before the pick, so there is nothing hidden to leak. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const VAULT_STAKES = [2000, 5000, 10000, 25000, 50000, 100000, 250000];
const VAULT_MIN_LEVEL = 5;
const VT_REELS = 5, VT_ROWS = 4, VT_UNITS = 100, VT_CAP = 50000 * 100, VT_TRIGGER = 3;
const VT_WILD = 0, VT_KEY = 1, VT_NSYM = 10;
const VT_PAY = [[0, 0, 0], [0, 0, 0], [100, 500, 2500], [75, 300, 1500], [60, 200, 1000], [50, 150, 750], [30, 80, 300], [25, 60, 250], [20, 50, 200], [15, 40, 150]];
const VT_KEY_PAY = [0, 0, 0, 200, 1000, 10000];
const VT_LINES = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3],
    [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 1, 0, 1, 1],
    [2, 2, 3, 2, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [3, 2, 3, 2, 3],
];
const VT_BASE = [
    [0, 1, 3, 4, 4, 5, 10, 12, 14, 17],
    [9, 2, 4, 4, 5, 6, 12, 13, 15, 17],
    [9, 2, 4, 4, 5, 6, 12, 13, 16, 17],
    [8, 2, 4, 4, 5, 6, 12, 13, 15, 17],
    [7, 1, 3, 4, 4, 5, 10, 12, 14, 16],
];
const VT_FREE = [
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
];
const VT_MODES = [
    ['key' => 'safe', 'name' => 'The Safe', 'spins' => 12, 'retrig' => 4, 'ladder' => [1], 'drop' => 0.2156, 'inside' => 1, 'insideDrop' => 0.3162, 'guarantee' => false],
    ['key' => 'box', 'name' => 'The Deposit Box', 'spins' => 10, 'retrig' => 3, 'ladder' => [2], 'drop' => 0.1192, 'inside' => 1, 'insideDrop' => 0.1504, 'guarantee' => false],
    ['key' => 'grand', 'name' => 'The Grand Vault', 'spins' => 4, 'retrig' => 2, 'ladder' => [2, 3, 5], 'drop' => 0.1214, 'inside' => 1, 'insideDrop' => 0.1263, 'guarantee' => true],
];
const VT_BUY_PRICE = [100, 300];
/* average return of one feature in units (any vault: they are tuned to the same average), for rtp_pick on a trigger spin */
const VT_FEATURE_EV = 9650;

function vt_buildStrips(array $counts, int $seed): array {
    $rnd = batty_mulberry($seed); $out = [];
    for ($r = 0; $r < VT_REELS; $r++) {
        $a = [];
        for ($s = 0; $s < VT_NSYM; $s++) if ($s !== VT_KEY) for ($i = 0; $i < $counts[$r][$s]; $i++) $a[] = $s;
        for ($i = count($a) - 1; $i > 0; $i--) { $j = (int) floor($rnd() * ($i + 1)); $t = $a[$i]; $a[$i] = $a[$j]; $a[$j] = $t; }
        $nk = $counts[$r][VT_KEY]; $L = count($a) + $nk;
        for ($k = 0; $k < $nk; $k++) array_splice($a, intdiv($k * $L, $nk) + intdiv($L, 2 * $nk), 0, [VT_KEY]);
        $out[] = $a;
    }
    return $out;
}
function vt_strips(): array { static $s = null; if ($s === null) $s = vt_buildStrips(VT_BASE, 20261009); return $s; }
function vt_free_strips(int $m): array {
    static $s = [];
    if (!isset($s[$m])) { $c = VT_FREE[$m]; $s[$m] = vt_buildStrips([$c, $c, $c, $c, $c], 19201031 + $m); }
    return $s[$m];
}
function vt_window(array $strips, array $stops): array {
    $g = [];
    for ($r = 0; $r < VT_REELS; $r++) { $st = $strips[$r]; $L = count($st); $col = []; for ($k = 0; $k < VT_ROWS; $k++) $col[] = $st[($stops[$r] + $k) % $L]; $g[] = $col; }
    return $g;
}
function vt_keysOn(array $g): int { $n = 0; for ($r = 0; $r < VT_REELS; $r++) for ($k = 0; $k < VT_ROWS; $k++) if ($g[$r][$k] === VT_KEY) $n++; return $n; }
function vt_evaluate(array $g, ?array $mult): array {
    $wins = []; $pay = 0;
    foreach (VT_LINES as $l => $ln) {
        $sym = $g[0][$ln[0]];
        if ($sym === VT_KEY) continue;
        $n = 1; $m = 1;
        while ($n < VT_REELS) {
            $c = $g[$n][$ln[$n]];
            if ($c === VT_WILD) $m *= $mult ? $mult[$n][$ln[$n]] : 1;
            elseif ($c !== $sym) break;
            $n++;
        }
        if ($n >= 3) { $p = VT_PAY[$sym][$n - 3] * $m; $wins[] = ['l' => $l, 's' => $sym, 'n' => $n, 'm' => $m, 'pay' => $p]; $pay += $p; }
    }
    return ['wins' => $wins, 'pay' => $pay];
}
function vt_spin(Closure $rng): array {
    $S = vt_strips(); $stops = [];
    for ($r = 0; $r < VT_REELS; $r++) $stops[] = (int) floor($rng() * count($S[$r]));
    $g = vt_window($S, $stops);
    $ev = vt_evaluate($g, null); $keys = vt_keysOn($g);
    $keyPay = VT_KEY_PAY[$keys];
    $pay = $ev['pay'] + $keyPay;
    if ($pay > VT_CAP) $pay = VT_CAP;
    return ['stops' => $stops, 'grid' => $g, 'wins' => $ev['wins'], 'linePay' => $ev['pay'], 'keys' => $keys, 'keyPay' => $keyPay, 'pay' => $pay, 'trigger' => $keys >= VT_TRIGGER];
}
function vt_ladderAt(array $md, int $age): int { return $md['ladder'][min($age, count($md['ladder']) - 1)]; }
function vt_freeCells(array $sticky, ?array $g): array {
    $out = [];
    for ($r = 1; $r < VT_REELS; $r++) for ($k = 0; $k < VT_ROWS; $k++) { $c = $r * VT_ROWS + $k; if (!$sticky[$c] && (!$g || $g[$r][$k] !== VT_KEY)) $out[] = $c; }
    return $out;
}
function vt_bonus(Closure $rng, int $modeIdx, array $opts = []): array {
    $md = VT_MODES[$modeIdx]; $inside = !empty($opts['inside']);
    $drop = $inside ? $md['insideDrop'] : $md['drop']; $strips = vt_free_strips($modeIdx);
    $N = VT_REELS * VT_ROWS; $sticky = array_fill(0, $N, 0); $age = array_fill(0, $N, 0);
    $carried = (int) ($opts['carried'] ?? 0);
    $total = $carried; $capped = false; $left = $md['spins']; $played = 0;
    $preset = []; $spins = [];
    if ($inside) {
        for ($k = 0; $k < $md['inside']; $k++) {
            $fc = vt_freeCells($sticky, null);
            $c = $fc[(int) floor($rng() * count($fc))];
            $sticky[$c] = vt_ladderAt($md, 0); $preset[] = $c;
        }
    }
    while ($left > 0 && !$capped) {
        $left--; $played++;
        if ($played > 1) for ($c = 0; $c < $N; $c++) if ($sticky[$c]) { $age[$c]++; $sticky[$c] = vt_ladderAt($md, $age[$c]); }
        $stops = [];
        for ($r = 0; $r < VT_REELS; $r++) $stops[] = (int) floor($rng() * count($strips[$r]));
        $g = vt_window($strips, $stops);
        $land = [];
        for ($r = 1; $r < VT_REELS; $r++) {
            if ($rng() < $drop) {
                $rows = [];
                for ($k = 0; $k < VT_ROWS; $k++) if (!$sticky[$r * VT_ROWS + $k] && $g[$r][$k] !== VT_KEY) $rows[] = $k;
                if ($rows) { $c = $r * VT_ROWS + $rows[(int) floor($rng() * count($rows))]; $sticky[$c] = vt_ladderAt($md, 0); $land[] = $c; }
            }
        }
        $forced = false;
        if ($md['guarantee'] && !$land) {
            $fc = vt_freeCells($sticky, $g);
            if ($fc) { $c = $fc[(int) floor($rng() * count($fc))]; $sticky[$c] = vt_ladderAt($md, 0); $land[] = $c; $forced = true; }
        }
        $mult = [];
        for ($r = 0; $r < VT_REELS; $r++) { $col = []; for ($k = 0; $k < VT_ROWS; $k++) { $c = $r * VT_ROWS + $k; $col[] = $sticky[$c] ?: 1; if ($sticky[$c]) $g[$r][$k] = VT_WILD; } $mult[] = $col; }
        $ev = vt_evaluate($g, $mult); $keys = vt_keysOn($g);
        $pay = $ev['pay'];
        if ($total + $pay >= VT_CAP) { $pay = VT_CAP - $total; $capped = true; }
        $total += $pay;
        $add = $keys >= VT_TRIGGER ? $md['retrig'] : 0;
        $left += $add;
        $spins[] = ['stops' => $stops, 'grid' => $g, 'land' => $land, 'forced' => $forced, 'sticky' => $sticky, 'wins' => $ev['wins'], 'pay' => $pay, 'keys' => $keys, 'add' => $add, 'left' => $left, 'total' => $total];
    }
    return ['mode' => $modeIdx, 'inside' => $inside, 'preset' => $preset, 'spins' => $spins, 'total' => $total - $carried, 'capped' => $capped];
}

/* ---------- the server action ---------- */
function vault_open_view(array $r): array {
    $d = $r['data'];
    return ['round' => (int) $r['id'], 'stake' => (int) $d['stake'], 'buy' => (int) $d['buy'], 'o' => $d['o'] ?? null, 'cost' => (int) $r['stake']];
}
function play_vault(array &$u, string $op, array $in): array {
    if ($u['level'] < VAULT_MIN_LEVEL) throw new ApiError('The High Roller Lounge opens at level 5.', 403);
    if ($op === 'state') {
        $r = round_get_open($u, 'vault');
        return ['open' => $r ? vault_open_view($r) : null];
    }
    if ($op === 'spin') {
        /* a vault already waiting for its choice comes back instead of a new spin (nothing is charged) */
        $open = round_get_open($u, 'vault');
        if ($open) return ['resume' => vault_open_view($open)];
        $stake = stake_of($in, VAULT_STAKES);
        $unit = intdiv($stake, VT_UNITS);
        $buy = null;
        if (array_key_exists('buy', $in) && $in['buy'] !== null) $buy = in_int($in, 'buy', 0, 1);
        $cost = $buy === null ? $stake : VT_BUY_PRICE[$buy] * $stake;
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        if ($buy !== null) {
            $rid = round_open($u, 'vault', $cost, ['stake' => $stake, 'buy' => $buy, 'o' => null, 'carried' => 0]);
            return ['pending' => true, 'round' => $rid, 'buy' => $buy, 'cost' => $cost, 'stake' => $stake];
        }
        $rng = batty_rng();
        /* Live balancing: one base spin is one draw; a trigger is valued at the feature's average return. */
        $o = rtp_pick('vault', $stake, function () use ($rng, $unit) {
            $o = vt_spin($rng);
            return [$o, ($o['pay'] + ($o['trigger'] ? VT_FEATURE_EV : 0)) * $unit];
        });
        if (!$o['trigger']) {
            $win = $o['pay'] * $unit;
            $f = ['x' => round($win / $stake, 2)];
            if ($o['keys'] >= 5) $f['feedLabel'] = 'Five Crimson Keys';
            $rid = round_quick($u, 'vault', $stake, $win, $f);
            return ['o' => $o, 'win' => $win, 'cost' => $stake, 'round' => $rid];
        }
        $rid = round_open($u, 'vault', $stake, ['stake' => $stake, 'buy' => -1, 'o' => $o, 'carried' => $o['pay']]);
        return ['o' => $o, 'pending' => true, 'round' => $rid, 'cost' => $stake, 'stake' => $stake, 'buy' => -1];
    }
    if ($op === 'pick') {
        $r = round_get_open($u, 'vault', in_int($in, 'round', 1, PHP_INT_MAX));
        if (!$r) throw new ApiError('That vault has already been opened.', 409);
        return vault_finish($u, $r, in_int($in, 'mode', 0, 2));
    }
    throw new ApiError('Unknown action.');
}
function vault_finish(array &$u, array $r, int $mode): array {
    $d = $r['data']; $stake = (int) $d['stake']; $unit = intdiv($stake, VT_UNITS);
    $carried = (int) $d['carried']; $inside = (int) $d['buy'] === 1; $cost = (int) $r['stake'];
    $rng = batty_rng();
    $b = rtp_pick('vault', $cost, function () use ($rng, $mode, $inside, $carried, $unit) {
        $b = vt_bonus($rng, $mode, ['inside' => $inside, 'carried' => $carried]);
        return [$b, ($carried + $b['total']) * $unit];
    });
    $win = ($carried + $b['total']) * $unit;
    $mx = 1; foreach ($b['spins'] as $s) foreach ($s['wins'] as $w) if ($w['m'] > $mx) $mx = $w['m'];
    $f = ['bonus' => 1, 'x' => round($win / $cost, 2), 'rounds' => 1];
    if ($b['capped']) $f['feedLabel'] = 'Max win: 50,000x';
    elseif ($mx >= 125) $f['feedLabel'] = VT_MODES[$mode]['name'] . ': x' . $mx . ' line';
    elseif ($win >= 500 * $stake) $f['feedLabel'] = VT_MODES[$mode]['name'];
    round_close($u, $r, $win, $f);
    return ['bonus' => $b, 'mode' => $mode, 'win' => $win, 'carried' => $carried * $unit, 'cost' => $cost, 'stake' => $stake, 'round' => (int) $r['id']];
}
