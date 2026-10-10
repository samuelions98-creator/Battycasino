<?php
/* Count Batula's Crypt: PHP port of the maths at the top of games/crypt/game.js. Same rng call order, same results, proved
   round by round on seeded RNGs by tools/crypt-xcheck.js. Amounts are in UNITS: 1 unit = stake / 100, so a win in BB is
   floor(units * stake / 100).

   ops
     spin     {stake, ante 0|1, buy 0|1}. The spin (or a bought trigger) and all its cascades are drawn here through rtp_pick.
              No free spins: the round settles at once (round_quick). Free spins won: the round is held open (round_open,
              the stake is taken) with the award, and the trigger spin's win is paid when the round closes.
              Any free spins left over from before are played and paid first.
     gamble   {round}. The gamble wheel, drawn here after the player chose to gamble: win = 4 more spins (up to 28),
              lose = the free spins are gone and the round closes paying the trigger spin's win.
     start    {round}. Plays every free spin (through rtp_pick), pays the round and closes it.
     state    The held award, if any, so a reloaded page can offer the gamble or the free spins again.
   Measured (tools/crypt-sim.js, 20M spins): base 96.64%, ante 96.86%, bonus buy (56x) 96.53%; full numbers in the header of
   games/crypt/game.js. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const CR_REELS = 6, CR_TOPN = 4, CR_MAXH = 7, CR_UNITS = 100;
const CR_MAX_WIN_X = 10000, CR_CAP = 1000000;
const CR_ANTE_NUM = 5, CR_ANTE_DEN = 4, CR_BUY_X = 56;
const CR_FS_BASE = 12, CR_FS_EXTRA = 4, CR_FS_RETRIG = 4, CR_GAMBLE_STEP = 4, CR_GAMBLE_MAX = 28;
const CR_WILD = 0, CR_SCAT = 1, CR_COUNT = 2, CR_BRIDE = 3, CR_STAKE = 4, CR_CHALICE = 5, CR_GARLIC = 6, CR_RUBY = 7, CR_AMETHYST = 8, CR_COFFIN = 9, CR_CANDLE = 10, CR_NSYM = 11;
const CR_NAMES = ['Bat Wild', 'Blood Moon', 'Count Batula', "Batula's Bride", 'Silver Stake', 'Chalice of Blood', 'Garlic Wreath', 'Blood Ruby', 'Amethyst', 'Coffin', 'Candle'];
/* keep every table identical to games/crypt/game.js (tools/crypt-xcheck.js compares them) */
const CR_PAY = [null, null, [20, 40, 100, 400], [16, 32, 60, 200], [12, 24, 40, 120], [8, 16, 32, 80], [8, 12, 24, 60], [4, 8, 16, 40], [4, 8, 12, 32], [4, 6, 8, 24], [4, 6, 8, 21]];
const CR_HEIGHT_OUTER = [12, 20, 24, 20, 14, 10], CR_HEIGHT_MID = [14, 24, 28, 20, 14];
const CR_COMP = [
    2 => [9, 10, 11, 12, 13, 14, 15, 16, 17],
    3 => [8, 9, 10, 12, 13, 14, 15, 17, 18],
    4 => [7, 8, 10, 11, 13, 15, 16, 17, 19],
    5 => [6, 7, 9, 11, 12, 15, 16, 18, 20],
    6 => [5, 7, 8, 10, 12, 15, 17, 18, 21],
    7 => [5, 6, 8, 10, 12, 15, 17, 19, 21],
];
const CR_SCATN = ['base' => [0, 0, 8, 5, 4, 3, 3, 2], 'ante' => [0, 0, 9, 6, 5, 4, 3, 2], 'fs' => [0, 0, 6, 4, 3, 3, 2, 2]];
const CR_TOPCOMP = ['base' => [65, 48, 56, 64, 72, 80, 96, 96, 104, 104], 'ante' => [8, 6, 7, 8, 9, 10, 12, 12, 13, 13], 'fs' => [21, 6, 7, 8, 9, 10, 12, 13, 13, 13]];
const CR_SETS = ['base', 'ante', 'fs'];
const CR_STACK = ['base' => [15, 40, 45], 'ante' => [15, 40, 45], 'fs' => [10, 30, 60]];
const CR_GAMBLE_P = [12 => 0.6017, 16 => 0.6698, 20 => 0.7190, 24 => 0.7495];
const CR_FS_EV = [12 => 5085, 16 => 8452, 20 => 12618, 24 => 17549, 28 => 23414];

/* ---------- maths (mirrors game.js) ---------- */
function cr_pickIndex(Closure $rng, array $w): int {
    $total = 0; foreach ($w as $x) $total += $x;
    $r = $rng() * $total; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $r -= $w[$i]; if ($r < 0) return $i; }
    return $n - 1;
}
function cr_mod(int $a, int $n): int { return (($a % $n) + $n) % $n; }
function cr_buildStrip(array $syms, array $counts, int $nScat, array $stack, int $seed): array {
    $rnd = batty_mulberry($seed); $blocks = [];
    $ns = count($syms);
    for ($i = 0; $i < $ns; $i++) {
        $left = $counts[$i];
        while ($left > 0) { $b = min($left, 1 + cr_pickIndex($rnd, $stack)); $blocks[] = [$syms[$i], $b]; $left -= $b; }
    }
    $nb = count($blocks);
    for ($i = $nb - 1; $i > 0; $i--) { $j = (int) floor($rnd() * ($i + 1)); $t = $blocks[$i]; $blocks[$i] = $blocks[$j]; $blocks[$j] = $t; }
    for ($pass = 0; $pass < 80; $pass++) {
        $bad = false;
        for ($i = 0; $i < $nb; $i++) {
            $n = ($i + 1) % $nb;
            if ($blocks[$i][0] === $blocks[$n][0]) { $bad = true; $k = ($n + 1 + (int) floor($rnd() * ($nb - 3))) % $nb; $t = $blocks[$n]; $blocks[$n] = $blocks[$k]; $blocks[$k] = $t; }
        }
        if (!$bad) break;
    }
    $a = [];
    foreach ($blocks as $bl) for ($k = 0; $k < $bl[1]; $k++) $a[] = $bl[0];
    if ($nScat > 0) {
        $L = count($a) + $nScat; $out = []; $j = 0; $src = 0;
        for ($p = 0; $p < $L; $p++) {
            if ($j < $nScat && $p === intdiv((2 * $j + 1) * $L, 2 * $nScat)) { $out[] = CR_SCAT; $j++; }
            else $out[] = $a[$src++];
        }
        return $out;
    }
    return $a;
}
function cr_strips(): array {
    static $S = null;
    if ($S !== null) return $S;
    $S = [];
    $MAIN = [CR_COUNT, CR_BRIDE, CR_STAKE, CR_CHALICE, CR_GARLIC, CR_RUBY, CR_AMETHYST, CR_COFFIN, CR_CANDLE];
    $TOPS = [CR_WILD, CR_COUNT, CR_BRIDE, CR_STAKE, CR_CHALICE, CR_GARLIC, CR_RUBY, CR_AMETHYST, CR_COFFIN, CR_CANDLE];
    foreach (CR_SETS as $si => $set) {
        $main = [];
        for ($r = 0; $r < CR_REELS; $r++) {
            $byH = [];
            for ($h = 0; $h <= CR_MAXH; $h++) {
                if ($h < 2) { $byH[] = null; continue; }
                $byH[] = cr_buildStrip($MAIN, CR_COMP[$h], CR_SCATN[$set][$h], CR_STACK[$set], 7919 * ($r + 1) + 104729 * $h + 1299709 * ($si + 1));
            }
            $main[] = $byH;
        }
        $S[$set] = ['main' => $main, 'top' => cr_buildStrip($TOPS, CR_TOPCOMP[$set], 0, [1], 31337 + 977 * $si)];
    }
    return $S;
}
function cr_draw(Closure $rng, string $set): array {
    $S = cr_strips()[$set]; $hs = []; $stops = []; $cols = [];
    for ($r = 0; $r < CR_REELS; $r++) $hs[] = 2 + cr_pickIndex($rng, ($r === 0 || $r === CR_REELS - 1) ? CR_HEIGHT_OUTER : CR_HEIGHT_MID);
    for ($r = 0; $r < CR_REELS; $r++) {
        $st = $S['main'][$r][$hs[$r]]; $L = count($st); $p = (int) floor($rng() * $L); $c = [];
        for ($k = 0; $k < $hs[$r]; $k++) $c[] = $st[($p + $k) % $L];
        $stops[] = $p; $cols[] = $c;
    }
    $T = $S['top']; $TL = count($T); $tp = (int) floor($rng() * $TL); $top = [];
    for ($k = 0; $k < CR_TOPN; $k++) $top[] = $T[($tp + $k) % $TL];
    return ['set' => $set, 'hs' => $hs, 'stops' => $stops, 'tstop' => $tp, 'cols' => $cols, 'top' => $top];
}
function cr_countScat(array $cols): int { $n = 0; foreach ($cols as $c) foreach ($c as $v) if ($v === CR_SCAT) $n++; return $n; }
function cr_evaluate(array $cols, array $top): array {
    $wins = [];
    for ($s = CR_COUNT; $s < CR_NSYM; $s++) {
        $w = 1; $n = 0;
        for ($r = 0; $r < CR_REELS; $r++) {
            $c = 0;
            foreach ($cols[$r] as $v) if ($v === $s) $c++;
            if ($r >= 1 && $r <= CR_TOPN) { $t = $top[$r - 1]; if ($t === $s || $t === CR_WILD) $c++; }
            if (!$c) break;
            $w *= $c; $n++;
        }
        if ($n >= 3) $wins[] = ['s' => $s, 'n' => $n, 'w' => $w, 'p' => CR_PAY[$s][$n - 3] * $w];
    }
    return $wins;
}
function cr_playDrop(array $d, int $mult, int $budget): array {
    $S = cr_strips()[$d['set']]; $cols = $d['cols']; $top = $d['top'];
    $ptr = $d['stops']; $tnext = $d['tstop'] + CR_TOPN;
    $steps = []; $win = 0; $capped = false;
    for (;;) {
        $wins = cr_evaluate($cols, $top);
        $step = ['c' => $cols, 't' => $top, 'wins' => $wins, 'hit' => null, 'th' => null, 'm' => $mult, 'pay' => 0];
        if (!$wins) { $steps[] = $step; break; }
        $units = 0; foreach ($wins as $wi) $units += $wi['p'];
        $pay = $units * $mult;
        if ($win + $pay >= $budget) { $pay = $budget - $win; $capped = true; }
        $step['pay'] = $pay; $win += $pay;
        $hit = []; $th = [];
        for ($r = 0; $r < CR_REELS; $r++) {
            $rows = [];
            foreach ($cols[$r] as $k => $v) { foreach ($wins as $wi) if ($r < $wi['n'] && $v === $wi['s']) { $rows[] = $k; break; } }
            $hit[] = $rows;
        }
        for ($k = 0; $k < CR_TOPN; $k++) { $v = $top[$k]; $r = $k + 1; foreach ($wins as $wi) if ($r < $wi['n'] && ($v === $wi['s'] || $v === CR_WILD)) { $th[] = $k; break; } }
        $step['hit'] = $hit; $step['th'] = $th;
        $steps[] = $step;
        if ($capped) break;
        for ($r = 0; $r < CR_REELS; $r++) {
            $rows = $hit[$r]; if (!$rows) continue;
            $st = $S['main'][$r][count($cols[$r])]; $L = count($st); $keep = [];
            foreach ($cols[$r] as $k => $v) if (!in_array($k, $rows, true)) $keep[] = $v;
            $n = count($rows); $fresh = [];
            for ($i = $n; $i >= 1; $i--) $fresh[] = $st[cr_mod($ptr[$r] - $i, $L)];
            $ptr[$r] = cr_mod($ptr[$r] - $n, $L);
            $cols[$r] = array_merge($fresh, $keep);
        }
        if ($th) {
            $T = $S['top']; $TL = count($T); $keep = [];
            for ($k = 0; $k < CR_TOPN; $k++) if (!in_array($k, $th, true)) $keep[] = $top[$k];
            while (count($keep) < CR_TOPN) { $keep[] = $T[$tnext % $TL]; $tnext++; }
            $top = $keep;
        }
        $mult++;
    }
    return ['hs' => $d['hs'], 'steps' => $steps, 'scat' => cr_countScat($cols), 'win' => $win, 'mult' => $mult, 'capped' => $capped];
}
function cr_fsAward(int $n): int { return $n >= 4 ? CR_FS_BASE + CR_FS_EXTRA * ($n - 4) : 0; }
function cr_fsRetrig(int $n): int { return $n >= 3 ? CR_FS_RETRIG * ($n - 2) : 0; }
function cr_spin(Closure $rng, bool $ante): array {
    $o = cr_playDrop(cr_draw($rng, $ante ? 'ante' : 'base'), 1, CR_CAP);
    $o['fs'] = $o['capped'] ? 0 : cr_fsAward($o['scat']);
    $o['bought'] = false;
    return $o;
}
function cr_buy(Closure $rng): array {
    for ($i = 0; ; $i++) { $d = cr_draw($rng, 'base'); if (cr_countScat($d['cols']) >= 4 || $i >= 200000) break; }
    if (cr_countScat($d['cols']) < 4) { for ($r = 0; $r < 4; $r++) $d['cols'][$r][0] = CR_SCAT; }
    $o = cr_playDrop($d, 1, CR_CAP);
    $o['fs'] = $o['capped'] ? 0 : cr_fsAward($o['scat']);
    $o['bought'] = true;
    return $o;
}
function cr_gambleP(int $n): float { return CR_GAMBLE_P[$n] ?? 0; }
function cr_canGamble(int $n): bool { return $n > 0 && $n < CR_GAMBLE_MAX && cr_gambleP($n) > 0; }
function cr_freeSpins(Closure $rng, int $n, int $carried): array {
    $left = $n; $mult = 1; $total = 0; $capped = false; $maxMult = 1; $played = 0; $retrigs = 0;
    $spins = [];
    while ($left > 0 && !$capped) {
        $left--; $played++;
        $m0 = $mult;
        $o = cr_playDrop(cr_draw($rng, 'fs'), $mult, CR_CAP - $carried - $total);
        $mult = $o['mult']; if ($mult > $maxMult) $maxMult = $mult;
        $total += $o['win']; $capped = $o['capped'];
        $add = $capped ? 0 : cr_fsRetrig($o['scat']);
        if ($add) { $left += $add; $retrigs++; }
        $spins[] = ['hs' => $o['hs'], 'steps' => $o['steps'], 'scat' => $o['scat'], 'win' => $o['win'], 'm0' => $m0, 'm1' => $mult, 'add' => $add, 'left' => $capped ? 0 : $left, 'total' => $total];
    }
    return ['start' => $n, 'spins' => $spins, 'total' => $total, 'capped' => $capped, 'maxMult' => $maxMult, 'played' => $played, 'retrigs' => $retrigs];
}
/* a whole round (simulations and the cross-check): policy(n, k) -> true to gamble at n spins */
function cr_round(Closure $rng, array $opt): array {
    $base = !empty($opt['buy']) ? cr_buy($rng) : cr_spin($rng, !empty($opt['ante']));
    $out = ['base' => $base, 'gambles' => [], 'fs' => null, 'win' => $base['win']];
    $n = $base['fs'];
    if ($n) {
        $k = 0; $policy = $opt['policy'] ?? null;
        while (cr_canGamble($n) && $policy && $policy($n, $k)) { $ok = $rng() < cr_gambleP($n); $out['gambles'][] = $ok ? 1 : 0; $k++; if (!$ok) { $n = 0; break; } $n += CR_GAMBLE_STEP; }
        if ($n) { $out['fs'] = cr_freeSpins($rng, $n, $base['win']); $out['win'] += $out['fs']['total']; }
    }
    $out['spins'] = $n;
    return $out;
}
function cr_winBB(int $units, int $stake): int { return intdiv($units * $stake, CR_UNITS); }

/* ---------- the server game ---------- */
function cr_cost(int $stake, bool $ante, bool $buy): int { return $buy ? CR_BUY_X * $stake : ($ante ? intdiv($stake * CR_ANTE_NUM, CR_ANTE_DEN) : $stake); }
function cr_offer(array $r): array {
    $d = $r['data']; $n = (int) $d['n'];
    return ['round' => (int) $r['id'], 'stake' => (int) $r['stake'], 'n' => $n, 'baseWin' => (int) $d['baseWin'], 'gambles' => $d['gambles'],
        'canGamble' => cr_canGamble($n), 'p' => cr_gambleP($n), 'scat' => (int) $d['scat'], 'ante' => !empty($d['ante']), 'buy' => !empty($d['buy'])];
}
function cr_facts(int $units, int $cost, int $win, bool $bonus, bool $capped, int $spins): array {
    $f = ['x' => $cost > 0 ? round($win / $cost, 2) : 0];
    if ($bonus) $f['bonus'] = 1;
    $x = $units / CR_UNITS;
    if ($bonus && $x >= 100) $f['feedLabel'] = 'Blood Moon free spins: ' . number_format($x, 0) . 'x';
    elseif ($spins >= CR_GAMBLE_MAX && $x >= 50) $f['feedLabel'] = 'Gambled up to ' . CR_GAMBLE_MAX . ' free spins';
    if ($capped) $f['feedLabel'] = "Batula's Crypt max win: 10,000x";
    return $f;
}
/* play the held free spins (no more gambling) and close the round */
function cr_finish(array &$u, array $r, Closure $rng): array {
    $d = $r['data']; $stake = (int) $d['stake']; $cost = (int) $r['stake']; $n = (int) $d['n']; $carried = (int) $d['baseWin'];
    $fs = null; $units = $carried; $capped = !empty($d['capped']);
    if ($n > 0) {
        $fs = rtp_pick('crypt', $cost, function () use ($rng, $n, $carried, $stake) {
            $fs = cr_freeSpins($rng, $n, $carried);
            return [$fs, cr_winBB($carried + $fs['total'], $stake)];
        });
        $units += $fs['total']; $capped = $capped || $fs['capped'];
    }
    $win = cr_winBB($units, $stake);
    round_close($u, $r, $win, cr_facts($units, $cost, $win, true, $capped, $n));
    return ['fs' => $fs, 'units' => $units, 'win' => $win];
}
function cr_settle_open(array &$u): int {
    $paid = 0;
    while ($r = round_get_open($u, 'crypt')) { $o = cr_finish($u, $r, batty_rng()); $paid += $o['win']; }
    return $paid;
}
function play_crypt(array &$u, string $op, array $in): array {
    if ($op === 'state') {
        $r = round_get_open($u, 'crypt');
        return ['open' => $r ? cr_offer($r) : null];
    }
    if ($op === 'spin') {
        $collected = cr_settle_open($u);
        $stake = stake_of($in, STAKE_LADDER);
        $buy = !empty($in['buy']); $ante = !$buy && !empty($in['ante']);
        $cost = cr_cost($stake, $ante, $buy);
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        $rng = batty_rng();
        /* live balancing: the spin and all its cascades are one draw (an award is valued at its measured worth) */
        $o = rtp_pick('crypt', $cost, function () use ($rng, $buy, $ante, $stake) {
            $o = $buy ? cr_buy($rng) : cr_spin($rng, $ante);
            return [$o, cr_winBB($o['win'] + ($o['fs'] ? (CR_FS_EV[min($o['fs'], CR_GAMBLE_MAX)] ?? 0) : 0), $stake)];
        });
        if (!$o['fs']) {
            $win = cr_winBB($o['win'], $stake);
            $rid = round_quick($u, 'crypt', $cost, $win, cr_facts($o['win'], $cost, $win, false, $o['capped'], 0));
            return ['o' => $o, 'win' => $win, 'cost' => $cost, 'round' => $rid, 'open' => null, 'collected' => $collected];
        }
        $d = ['stake' => $stake, 'ante' => $ante ? 1 : 0, 'buy' => $buy ? 1 : 0, 'baseWin' => $o['win'], 'n' => $o['fs'], 'scat' => $o['scat'], 'gambles' => []];
        $rid = round_open($u, 'crypt', $cost, $d);
        $r = ['id' => $rid, 'stake' => $cost, 'data' => $d];
        return ['o' => $o, 'win' => cr_winBB($o['win'], $stake), 'cost' => $cost, 'round' => $rid, 'open' => cr_offer($r), 'collected' => $collected];
    }
    if ($op === 'gamble' || $op === 'start') {
        $r = round_get_open($u, 'crypt', in_int($in, 'round', 1, PHP_INT_MAX));
        if (!$r) throw new ApiError('Those free spins have already been played.', 409);
        $d = $r['data']; $stake = (int) $d['stake']; $n = (int) $d['n'];
        if ($op === 'start') {
            $o = cr_finish($u, $r, batty_rng());
            return ['fs' => $o['fs'], 'n' => $n, 'baseWin' => (int) $d['baseWin'], 'units' => $o['units'], 'win' => $o['win'], 'round' => (int) $r['id']];
        }
        if (!cr_canGamble($n)) throw new ApiError('Those spins cannot be gambled any higher.', 409);
        /* the wheel is drawn now, after the choice to gamble */
        $p = cr_gambleP($n);
        $x = batty_rng()();
        $won = $x < $p;
        $d['gambles'][] = $won ? 1 : 0;
        if (!$won) {
            $d['n'] = 0; $r['data'] = $d;
            $units = (int) $d['baseWin']; $win = cr_winBB($units, $stake);
            $f = cr_facts($units, (int) $r['stake'], $win, true, false, 0); $f['gambleLost'] = 1;
            round_close($u, $r, $win, $f);
            return ['won' => false, 'x' => $x, 'p' => $p, 'from' => $n, 'n' => 0, 'win' => $win, 'done' => true, 'round' => (int) $r['id']];
        }
        $d['n'] = $n + CR_GAMBLE_STEP; $r['data'] = $d;
        round_save_data((int) $r['id'], $d);
        return ['won' => true, 'x' => $x, 'p' => $p, 'from' => $n, 'n' => $d['n'], 'done' => false, 'open' => cr_offer($r), 'round' => (int) $r['id']];
    }
    throw new ApiError('Unknown action.');
}
