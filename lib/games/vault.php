<?php
/* Crimson Vault: PHP port of the maths at the top of games/vault/game.js (same rng call order, same results, proved round by
   round on seeded RNGs by tools/vault-xcheck.js), plus the server action play_vault(). High Roller Lounge: level 5 and up,
   its own stake ladder (VAULT_STAKES).

   Amounts are in units: 1 unit = stake / 100 (every stake on the ladder is a multiple of 100). 20 lines, line bet = 5 units.

   A round is either one request or two:
     op 'spin'  {stake}         a base spin, drawn through rtp_pick and settled at once with round_quick... unless 3+ Crimson
                                Keys land. Then the stake is taken with round_open and the spin comes back with pending:true.
     op 'spin'  {stake, buy}    buy 0 (100x stake) or 1 (300x, the Inside Job): round_open straight away, pending:true.
     op 'pick'  {round, mode}   the player picks the vault (0 Safe, 1 Deposit Box, 2 Grand Vault). Only now are the free spins
                                drawn (through rtp_pick, against the round's cost), and the round is settled with round_close.
     op 'state'                 the open round, if any, so a reloaded page can show the vault choice again.
   Nothing about the free spins exists before the pick, so there is nothing hidden to leak. A round left open (a closed tab)
   is settled by vault_settle_open(): a vault is picked at random (every vault returns the same on average) and paid.
   Measured return: see the header of games/vault/game.js (tools/vault-sim.js). */
if (!defined('BATTY')) { http_response_code(403); exit; }

const VAULT_STAKES = [2000, 5000, 10000, 25000, 50000, 100000, 250000];
const VAULT_MIN_LEVEL = 5;
const VT_REELS = 5, VT_ROWS = 4, VT_UNITS = 100, VT_MAX_WIN_X = 50000, VT_CAP = 50000 * 100, VT_TRIGGER = 3;
const VT_WILD = 0, VT_KEY = 1, VT_NSYM = 10;
/* keep every table identical to games/vault/game.js (tools/vault-xcheck.js compares them) */
const VT_PAY = [[0, 0, 0], [0, 0, 0], [200, 1000, 5000], [150, 500, 2500], [120, 400, 1500], [100, 250, 1000], [60, 150, 600], [50, 125, 500], [40, 100, 400], [30, 75, 300]];
const VT_KEY_PAY = [0, 0, 0, 300, 2000, 10000];
const VT_LINES = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3],
    [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 1, 0, 1, 1],
    [2, 2, 3, 2, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [3, 2, 3, 2, 3],
];
const VT_BASE = [
    [0, 1, 5, 6, 7, 8, 10, 11, 12, 13],
    [4, 2, 6, 7, 8, 9, 11, 12, 13, 14],
    [4, 2, 6, 7, 8, 9, 11, 12, 13, 14],
    [4, 2, 6, 7, 8, 9, 11, 12, 13, 14],
    [3, 1, 5, 6, 7, 8, 10, 11, 12, 13],
];
const VT_FREE = [
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
    [0, 1, 4, 5, 6, 7, 10, 11, 12, 13],
    [0, 1, 2, 3, 4, 5, 15, 16, 18, 20],
];
const VT_MODES = [
    ['key' => 'safe', 'name' => 'The Safe', 'spins' => 12, 'retrig' => 4, 'ladder' => [1], 'drop' => 0.168, 'inside' => 2, 'insideDrop' => 0.2143, 'guarantee' => false],
    ['key' => 'box', 'name' => 'The Deposit Box', 'spins' => 10, 'retrig' => 3, 'ladder' => [2], 'drop' => 0.0958, 'inside' => 1, 'insideDrop' => 0.118, 'guarantee' => false],
    ['key' => 'grand', 'name' => 'The Grand Vault', 'spins' => 4, 'retrig' => 2, 'ladder' => [2, 3, 5], 'drop' => 0.051, 'inside' => 1, 'insideDrop' => 0.005, 'guarantee' => true],
];
const VT_BUY_PRICE = [100, 300];
/* average return of one feature in units (each vault is tuned to the same average), for rtp_pick on a trigger spin */
const VT_FEATURE_EV = 9640;

/* ---------- maths (mirrors game.js) ---------- */
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
/* a whole round (simulations and the cross-check): pick(base|null) -> vault index */
function vt_round(Closure $rng, array $opt): array {
    $buy = $opt['buy'] ?? null;
    $base = $buy === null ? vt_spin($rng) : null;
    $out = ['buy' => $buy, 'base' => $base, 'mode' => -1, 'bonus' => null, 'win' => $base ? $base['pay'] : 0];
    if ($buy !== null || $base['trigger']) {
        $mode = isset($opt['pick']) ? $opt['pick']($base) : 0;
        $carried = $base ? $base['pay'] : 0;
        $out['mode'] = $mode;
        $out['bonus'] = vt_bonus($rng, $mode, ['inside' => $buy === 1, 'carried' => $carried]);
        $out['win'] = $carried + $out['bonus']['total'];
    }
    return $out;
}
function vt_winBB(int $units, int $stake): int { return intdiv($units * $stake, VT_UNITS); }

/* ---------- the server action ---------- */
function vault_open_view(array $r): array {
    $d = $r['data'];
    return ['round' => (int) $r['id'], 'stake' => (int) $d['stake'], 'buy' => (int) $d['buy'], 'o' => $d['o'] ?? null,
        'carried' => (int) $d['carried'], 'cost' => (int) $r['stake']];
}
function vault_facts(int $units, int $stake, int $cost, int $win, bool $bonus, bool $capped, int $mode, int $keys): array {
    $f = ['x' => $cost > 0 ? round($win / $cost, 2) : 0];
    if ($bonus) $f['bonus'] = 1;
    $x = $units / VT_UNITS;   // in stakes
    /* feed etiquette: only the genuinely notable */
    if ($capped) $f['feedLabel'] = 'Crimson Vault max win: 50,000x';
    elseif ($bonus && $x >= 1000 && $win >= 5 * $cost) $f['feedLabel'] = VT_MODES[$mode]['name'] . ': ' . number_format($x, 0) . 'x';
    elseif ($keys >= 5) $f['feedLabel'] = 'Five Crimson Keys';
    return $f;
}
/* draw the chosen vault's free spins and settle the round */
function vault_finish(array &$u, array $r, int $mode, Closure $rng): array {
    $d = $r['data']; $stake = (int) $d['stake'];
    $carried = (int) $d['carried']; $inside = (int) $d['buy'] === 1; $cost = (int) $r['stake'];
    $b = rtp_pick('vault', $cost, function () use ($rng, $mode, $inside, $carried, $stake) {
        $b = vt_bonus($rng, $mode, ['inside' => $inside, 'carried' => $carried]);
        return [$b, vt_winBB($carried + $b['total'], $stake)];
    });
    $units = $carried + $b['total'];
    $win = vt_winBB($units, $stake);
    $keys = isset($d['o']['keys']) ? (int) $d['o']['keys'] : 0;
    round_close($u, $r, $win, vault_facts($units, $stake, $cost, $win, true, $b['capped'], $mode, $keys));
    return ['bonus' => $b, 'mode' => $mode, 'units' => $units, 'win' => $win, 'carried' => $carried, 'cost' => $cost, 'stake' => $stake, 'buy' => (int) $d['buy'], 'round' => (int) $r['id']];
}
/* rounds left open (a closed tab): pick a vault at random and pay it. Called from resolve_open() in lib/play.php. */
function vault_settle_open(array &$u): int {
    $paid = 0;
    while ($r = round_get_open($u, 'vault')) { $o = vault_finish($u, $r, random_int(0, 2), batty_rng()); $paid += $o['win']; }
    return $paid;
}
function play_vault(array &$u, string $op, array $in): array {
    if ((int) $u['level'] < VAULT_MIN_LEVEL) throw new ApiError('The High Roller Lounge opens at level ' . VAULT_MIN_LEVEL . '.', 403);
    if ($op === 'state') {
        $r = round_get_open($u, 'vault');
        return ['open' => $r ? vault_open_view($r) : null];
    }
    if ($op === 'spin') {
        /* a vault already waiting for its choice comes back instead of a new spin (nothing is charged) */
        $open = round_get_open($u, 'vault');
        if ($open) return ['resume' => vault_open_view($open)];
        $stake = stake_of($in, VAULT_STAKES);
        $buy = null;
        if (array_key_exists('buy', $in) && $in['buy'] !== null) $buy = in_int($in, 'buy', 0, 1);
        $cost = $buy === null ? $stake : VT_BUY_PRICE[$buy] * $stake;
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        if ($buy !== null) {
            $rid = round_open($u, 'vault', $cost, ['stake' => $stake, 'buy' => $buy, 'o' => null, 'carried' => 0]);
            return ['pending' => true, 'round' => $rid, 'buy' => $buy, 'cost' => $cost, 'stake' => $stake, 'carried' => 0];
        }
        $rng = batty_rng();
        /* live balancing: one base spin is one draw; a trigger is valued at the feature's average return */
        $o = rtp_pick('vault', $stake, function () use ($rng, $stake) {
            $o = vt_spin($rng);
            return [$o, vt_winBB($o['pay'] + ($o['trigger'] ? VT_FEATURE_EV : 0), $stake)];
        });
        if (!$o['trigger']) {
            $win = vt_winBB($o['pay'], $stake);
            $rid = round_quick($u, 'vault', $stake, $win, vault_facts($o['pay'], $stake, $stake, $win, false, false, 0, $o['keys']));
            return ['o' => $o, 'win' => $win, 'cost' => $stake, 'round' => $rid, 'pending' => false];
        }
        $rid = round_open($u, 'vault', $stake, ['stake' => $stake, 'buy' => -1, 'o' => $o, 'carried' => $o['pay']]);
        return ['o' => $o, 'pending' => true, 'round' => $rid, 'cost' => $stake, 'stake' => $stake, 'buy' => -1, 'carried' => $o['pay']];
    }
    if ($op === 'pick') {
        $mode = in_int($in, 'mode', 0, 2);
        $r = round_get_open($u, 'vault', in_int($in, 'round', 1, PHP_INT_MAX));
        if (!$r) throw new ApiError('That vault has already been opened.', 409);
        return vault_finish($u, $r, $mode, batty_rng());
    }
    throw new ApiError('Unknown action.');
}
