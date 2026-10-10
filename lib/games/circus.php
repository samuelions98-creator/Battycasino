<?php
/* Batty Circus: the server engine. A line-for-line port of games/circus/math.js (same tables, same order of rng() calls),
   proved identical by tools/circus-xcheck.js. Amounts are in units (1 unit = stake / 20).

   A round is a multi-step state machine kept in the rounds table:
     op 'start'  {stake, token, buy?}   takes the stake and plays the base spin (or a bought trigger). With no bonus the
                                        round closes at once. The token makes it idempotent: a repeated start with the
                                        same token returns the same round and never charges twice.
     op 'act'    {round, rev, action, choice?}   resolves the next step AFTER the player's choice: fire, collect, retry,
                                        pick (weight / lane / torch / jester box), spin (elephant). rev must match the
                                        round's revision, so a double-tap or a repeated request cannot act twice; a stale
                                        rev just returns the current state.
     op 'state'                         the player's latest round (resume after a reload).
   Nothing is drawn ahead of time: every random value is drawn inside the step that needs it, so the stored state never
   holds an outcome the player has not reached yet. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const CC_REELS = 5, CC_ROWS = 4, CC_U = 20, CC_MAX_X = 2500, CC_CAP = CC_MAX_X * CC_U;
const CC_CH = 'WELMGSAKQJB';
const CC_W = 0, CC_ELE = 1, CC_BON = 10;
/*STRIPS*/
const CC_BASE = ['AKJKSESJJKABKESKGMEQMJJGQQAAJJQMJGKBAAMLQLQMLAJJJKQGSQSSAGBQSKLQKGAQKJ', 'GMAAAQSQGWWWAQSQKASKLJQSQJLMQJJGKQJMKAGALKKJJSEQSWWKAMJGAQEJKLMGEJJQKJKS', 'QLELSAAQKGQQBLQKKMJJAAAWWEGAAJKJEGQGBSMJQKJMQGMJQJSKSASWWWSLBQKMAJKKSGKJ', 'GEGQLJSQKKQAGKJWWGKAKMAJQGMGSJLQJQAJKJESMQAJAKAMJLSQQEAAJMJKJQLKQWWWWSKSS', 'WWWWKMKLSEQSBGQKQAKAAQJLKWWQQQJKJGASBKJAJAQMSGSJQGSKMGMLAQAEBJKKGSALMJEJJ'];
const CC_JFS = ['QJQJQAKJSJJQGJQKGLQASMGKLKJJQEMJKQKMSKAMKGEGKGAQJASAESASQJKLMAQLAJS', 'KAGEAGQGMSQQMQLMKKSGQSJWWLJJJESQAJKJMQQGAKJJAAJKSAJKAAJKGEMJLSKQQLKQS', 'MALKMJJQSEWWQJEAAQESJSGQKAQLMQJAGMGKQQKMLKJQGKAGJLSSJJJJKQAKJKSSGQAKA', 'QLQSGSGSSASKGLKJEJQMQMJEJAMKKSAKJKKAJJKGALQLJGQJQMJKQEAQAGQAJASKMJWWQ', 'AGALAQLQGQJASWWEQEJEAGJQKKLJAMKQQJAQKSSQKKSKKMJKAAJJJGJGMJMSGKSLJSMQQ'];
const CC_EFS = ['KALQJEJKKMQJLSGJEJBAMKAQKGAJKEMQEJAJKQJKKQKQEGQSSAAMQGESBJSQMESLJASEGJEALGQ', 'QMQQJSJQLAAKWWWQMKQEJGKGEJEQAKMQKJEGSJSASAGELSJASESLMKJJJJKKEGQAKEGAKEJLMQAQ', 'QGSSAKKKEKJMEQQAEKMBLJGQQJAJEMSAJWWWSGLAMGQGAEGESJJQEKSJQEBLMJQEKJSALAJJQAKKKQ', 'AEJSEKEQLKAEJQAJGKQKAEJMAJJQLJQKLSGSSEJGKAAJJSLSMQSAMEKMGJQQQAEKQQKMGJEKGWWW', 'ELJAGJSGMEKJAWWWAMJBQLQASSLMAGQQKGJAQAEAJJESJGEJJQJQKGKQEKBKQSLMKMKEQKJQSEKSEA'];/*/STRIPS*/
const CC_PAY = [[0, 0, 0], [25, 90, 280], [20, 65, 180], [16, 50, 130], [14, 42, 105], [12, 32, 85], [6, 13, 32], [5, 11, 28], [4, 8, 20], [3, 6, 16], [0, 0, 0]];
const CC_LINES = [
    [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3],
    [0, 1, 2, 1, 0], [3, 2, 1, 2, 3], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0], [3, 3, 2, 3, 3], [1, 1, 0, 1, 1], [2, 2, 3, 2, 2],
    [1, 1, 2, 1, 1], [2, 2, 1, 2, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3],
    [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2],
    [0, 1, 0, 1, 0], [3, 2, 3, 2, 3], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2],
    [1, 2, 1, 2, 1], [2, 1, 2, 1, 2], [0, 1, 2, 3, 3], [3, 2, 1, 0, 0],
    [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [1, 2, 3, 3, 3], [2, 1, 0, 0, 0],
    [0, 0, 0, 1, 2], [3, 3, 3, 2, 1], [1, 0, 1, 2, 1], [2, 3, 2, 1, 2],
    [1, 2, 1, 0, 1], [2, 1, 2, 3, 2], [3, 2, 2, 1, 0], [0, 1, 1, 2, 3],
];
const CC_ACTS = ['strong', 'bear', 'fire', 'jester', 'elephant'];
const CC_ACT_NAMES = ['Strongbat', 'High Wire', 'Fire Breather', 'Jester Spins', 'Elephant Spins'];
/* SEGS: [kind, cash x | acts] */
const CC_SEGS = [
    ['cash', 10], ['act', [0]], ['cash', 15], ['act', [1]], ['cash', 20],
    ['act', [2]], ['cash', 30], ['act', [3]], ['cash', 50], ['act', [4]],
    ['act', [0, 2]], ['act', [1, 3]], ['act', [2, 4]], ['act', [0, 3]], ['act', [1, 4]],
    ['bull', null],
];
/*BOARD*/
const CC_SEG_W = [
    'base'      => [70, 60, 60, 60, 50, 60, 30, 60, 12, 50, 26, 26, 18, 26, 18, 14],
    'grand'     => [0, 80, 0, 80, 0, 80, 0, 70, 0, 60, 15, 15, 11, 15, 11, 7],
    'spotlight' => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
];
/*/BOARD*/
const CC_BUYS = ['grand' => 75, 'spotlight' => 175];
/*ACTS*/
const CC_SM_P = [80, 55, 30];
const CC_SM_V = [1000, 1120, 1250, 1400, 1570, 1760, 1970, 2200, 0];
const CC_BEAR_DROPS = 10;
const CC_BEAR_ITEMS = [0, 40, 80, 140, 220, 360, 540, 900, 2400];
const CC_BEAR_W = [16, 22, 20, 15, 11, 7, 5, 3, 1];
const CC_FIRE_TORCHES = 12;
const CC_FIRE_ITEMS = [0, 50, 100, 160, 250, 400, 750, 1500, 4000];
const CC_FIRE_W = [48, 40, 40, 30, 20, 12, 6, 3, 1];
const CC_JS_SPINS = [5, 6, 7, 8, 10, 12];
const CC_JS_SPINS_W = [20, 26, 22, 16, 10, 6];
const CC_JS_N = [1, 2, 3, 4];
const CC_JS_N_W = [50, 32, 14, 4];
const CC_JS_BOOM = 0.14;
const CC_EL_SPINS = [7, 8, 10, 12];
const CC_EL_SPINS_W = [30, 30, 25, 15];
const CC_EL_START = 2, CC_EL_RETRIG = 4, CC_EL_MAX = 40;
/*/ACTS*/

function cc_strips(string $set): array {
    static $c = [];
    if (!isset($c[$set])) {
        $src = $set === 'base' ? CC_BASE : ($set === 'jester' ? CC_JFS : CC_EFS);
        $c[$set] = [];
        foreach ($src as $s) { $a = []; $n = strlen($s); for ($i = 0; $i < $n; $i++) $a[] = strpos(CC_CH, $s[$i]); $c[$set][] = $a; }
    }
    return $c[$set];
}
function cc_ri(Closure $rng, int $n): int { $v = (int) floor($rng() * $n); return $v < $n ? $v : $n - 1; }
function cc_pickW(Closure $rng, array $w): int {
    $t = 0; foreach ($w as $x) $t += $x;
    $v = $rng() * $t; $n = count($w);
    for ($i = 0; $i < $n; $i++) { $v -= $w[$i]; if ($v < 0) return $i; }
    return $n - 1;
}
function cc_smPrize(int $level, int $w): int { return intdiv(CC_SM_V[$level] * 100, CC_SM_P[$w]) - CC_SM_V[$level + 1]; }

/* ---------- reels ---------- */
function cc_window(string $set, array $stops): array {
    $S = cc_strips($set); $g = [];
    for ($r = 0; $r < CC_REELS; $r++) { $st = $S[$r]; $L = count($st); $col = []; for ($k = 0; $k < CC_ROWS; $k++) $col[] = $st[($stops[$r] + $k) % $L]; $g[] = $col; }
    return $g;
}
function cc_spinStops(Closure $rng, string $set): array { $S = cc_strips($set); $s = []; for ($r = 0; $r < CC_REELS; $r++) $s[] = cc_ri($rng, count($S[$r])); return $s; }
function cc_evaluate(array $g): array {
    $wins = []; $pay = 0;
    foreach (CC_LINES as $l => $ln) {
        $s = []; for ($r = 0; $r < CC_REELS; $r++) $s[] = $g[$r][$ln[$r]];
        $w = 0; while ($w < CC_REELS && $s[$w] === CC_W) $w++;
        $best = 0; $bs = -1; $bn = 0;
        if ($w >= 3) { $best = CC_PAY[CC_ELE][$w - 3]; $bs = CC_ELE; $bn = $w; }
        if ($w < CC_REELS && $s[$w] !== CC_BON) {
            $sym = $s[$w]; $n = $w + 1;
            while ($n < CC_REELS && ($s[$n] === $sym || $s[$n] === CC_W)) $n++;
            if ($n >= 3 && CC_PAY[$sym][$n - 3] > $best) { $best = CC_PAY[$sym][$n - 3]; $bs = $sym; $bn = $n; }
        }
        if ($best > 0) { $wins[] = ['l' => $l, 's' => $bs, 'n' => $bn, 'pay' => $best]; $pay += $best; }
    }
    return ['wins' => $wins, 'pay' => $pay];
}
function cc_triggered(array $g): bool { $n = 0; foreach ([0, 2, 4] as $r) if (in_array(CC_BON, $g[$r], true)) $n++; return $n === 3; }
function cc_spinBase(Closure $rng): array {
    $stops = cc_spinStops($rng, 'base'); $g = cc_window('base', $stops); $e = cc_evaluate($g);
    return ['stops' => $stops, 'grid' => $g, 'wins' => $e['wins'], 'pay' => $e['pay'], 'bonus' => cc_triggered($g)];
}
function cc_buyGrid(Closure $rng): array {
    $g = null; $stops = null;
    for ($i = 0; $i < 60; $i++) {
        $stops = cc_spinStops($rng, 'base'); $g = cc_window('base', $stops);
        foreach ([0, 2, 4] as $r) { if (!in_array(CC_BON, $g[$r], true)) $g[$r][cc_ri($rng, CC_ROWS)] = CC_BON; }
        if (cc_evaluate($g)['pay'] === 0) break;
    }
    return ['stops' => $stops, 'grid' => $g, 'wins' => [], 'pay' => 0, 'bonus' => true, 'bought' => true];
}

/* ---------- the round state machine ---------- */
function cc_add(array &$s, int $v): int {
    $before = $s['total']; $s['total'] = min(CC_CAP, $s['total'] + $v);
    if ($s['total'] >= CC_CAP) $s['capped'] = true;
    return $s['total'] - $before;
}
function cc_start(Closure $rng, ?string $buy): array {
    $b = $buy ? cc_buyGrid($rng) : cc_spinBase($rng);
    $s = ['v' => 1, 'buy' => $buy ?: null, 'rev' => 0, 'total' => 0, 'capped' => false, 'base' => $b, 'phase' => $b['bonus'] ? 'cannon' : 'done',
        'shots' => [], 'retried' => false, 'queue' => [], 'act' => null, 'done' => [], 'ev' => ['t' => 'base']];
    cc_add($s, $b['pay']);
    if ($s['capped']) $s['phase'] = 'done';
    return $s;
}
function cc_drawShot(Closure $rng, string $mode): array {
    $seg = cc_pickW($rng, CC_SEG_W[$mode]);
    $S = CC_SEGS[$seg];
    if ($S[0] === 'cash') return ['seg' => $seg, 'cash' => $S[1] * CC_U];
    if ($S[0] === 'act') return ['seg' => $seg, 'acts' => $S[1]];
    $pool = [0, 1, 2, 3, 4]; $got = [];
    for ($i = 0; $i < 3; $i++) { $j = cc_ri($rng, count($pool)); $got[] = $pool[$j]; array_splice($pool, $j, 1); }
    sort($got);
    return ['seg' => $seg, 'acts' => $got];
}
function cc_applyShot(array &$s, array $shot, Closure $rng): void {
    if (isset($shot['cash'])) { $s['ev']['cash'] = cc_add($s, $shot['cash']); $s['phase'] = 'done'; return; }
    $s['queue'] = $shot['acts'];
    cc_nextAct($s, $rng);
}
function cc_nextAct(array &$s, Closure $rng): void {
    $s['act'] = null;
    if ($s['capped'] || !$s['queue']) { $s['phase'] = 'done'; return; }
    $a = array_shift($s['queue']); $id = CC_ACTS[$a];
    if ($id === 'strong') $s['act'] = ['id' => $id, 'level' => 0, 'win' => 0, 'log' => []];
    elseif ($id === 'bear') $s['act'] = ['id' => $id, 'drop' => 0, 'lane' => 1, 'win' => 0, 'log' => []];
    elseif ($id === 'fire') $s['act'] = ['id' => $id, 'picked' => [], 'win' => 0, 'log' => []];
    elseif ($id === 'jester') $s['act'] = ['id' => $id, 'win' => 0];
    else $s['act'] = ['id' => $id, 'spins' => CC_EL_SPINS[cc_pickW($rng, CC_EL_SPINS_W)], 'win' => 0];
    $s['phase'] = $id;
}
function cc_endAct(array &$s, Closure $rng): void {
    $s['done'][] = ['id' => $s['act']['id'], 'win' => $s['act']['win']];
    $s['ev']['ended'] = $s['act']['id'];
    cc_nextAct($s, $rng);
}
function cc_credit(array &$s, int $v): int { $got = cc_add($s, $v); $s['act']['win'] += $got; return $got; }
function cc_jesterSpin(Closure $rng): array {
    $stops = cc_spinStops($rng, 'jester'); $g0 = cc_window('jester', $stops); $g = $g0;
    $n = CC_JS_N[cc_pickW($rng, CC_JS_N_W)]; $used = []; $boxes = [];
    for ($i = 0; $i < $n; $i++) {
        $c = cc_ri($rng, 20); while (isset($used[$c])) $c = ($c + 7) % 20;
        $used[$c] = 1;
        $boom = $rng() < CC_JS_BOOM;
        $boxes[] = ['r' => $c % CC_REELS, 'k' => intdiv($c, CC_REELS), 'boom' => $boom];
    }
    foreach ($boxes as $b) {
        $g[$b['r']][$b['k']] = CC_W;
        if ($b['boom']) for ($dr = -1; $dr <= 1; $dr++) for ($dk = -1; $dk <= 1; $dk++) {
            $r = $b['r'] + $dr; $k = $b['k'] + $dk; if ($r >= 0 && $r < CC_REELS && $k >= 0 && $k < CC_ROWS) $g[$r][$k] = CC_W;
        }
    }
    $e = cc_evaluate($g);
    return ['stops' => $stops, 'grid0' => $g0, 'grid' => $g, 'boxes' => $boxes, 'wins' => $e['wins'], 'pay' => $e['pay']];
}
function cc_elephantSpin(Closure $rng, int $mult): array {
    $stops = cc_spinStops($rng, 'elephant'); $g = cc_window('elephant', $stops);
    $el = 0; for ($r = 0; $r < CC_REELS; $r++) for ($k = 0; $k < CC_ROWS; $k++) if ($g[$r][$k] === CC_ELE) $el++;
    $m = $mult + $el; $e = cc_evaluate($g);
    return ['stops' => $stops, 'grid' => $g, 'el' => $el, 'mult' => $m, 'wins' => $e['wins'], 'base' => $e['pay'], 'pay' => $e['pay'] * $m, 'retrig' => cc_triggered($g)];
}
function cc_step(array $s, string $action, ?int $choice, Closure $rng): array {
    $p = $s['phase'];
    $s['ev'] = ['t' => $action];
    $bad = function () { throw new ApiError('That action is not available now.', 409); };
    $ok3 = $choice !== null && $choice >= 0 && $choice <= 2;
    if ($p === 'done') $bad();
    elseif ($p === 'cannon') {
        if ($action !== 'fire') $bad();
        $shot = cc_drawShot($rng, $s['buy'] ?: 'base');
        $s['shots'][] = $shot; $s['ev']['shot'] = $shot;
        if ($s['retried']) cc_applyShot($s, $shot, $rng); else $s['phase'] = 'decide';
    } elseif ($p === 'decide') {
        if ($action === 'collect') { $s['ev']['shot'] = $s['shots'][count($s['shots']) - 1]; cc_applyShot($s, $s['ev']['shot'], $rng); }
        elseif ($action === 'retry') {
            $s['retried'] = true;
            $shot = cc_drawShot($rng, $s['buy'] ?: 'base');
            $s['shots'][] = $shot; $s['ev']['shot'] = $shot;
            cc_applyShot($s, $shot, $rng);
        } else $bad();
    } elseif ($p === 'strong') {
        if ($action !== 'pick' || !$ok3) $bad();
        $lvl = $s['act']['level'];
        $ok = $rng() * 100 < CC_SM_P[$choice];
        $prize = $ok ? cc_smPrize($lvl, $choice) : 0;
        $got = $ok ? cc_credit($s, $prize) : 0;
        $s['act']['log'][] = ['w' => $choice, 'ok' => $ok, 'prize' => $got];
        $s['ev']['lift'] = ['level' => $lvl, 'w' => $choice, 'ok' => $ok, 'prize' => $got];
        if ($ok && $lvl + 1 < count(CC_SM_V) - 1 && !$s['capped']) $s['act']['level'] = $lvl + 1; else cc_endAct($s, $rng);
    } elseif ($p === 'bear') {
        if ($action !== 'pick' || !$ok3) $bad();
        $items = [];
        for ($i = 0; $i < 3; $i++) $items[] = cc_pickW($rng, CC_BEAR_W);
        $it = $items[$choice]; $snap = $it === 0;
        $got = $snap ? 0 : cc_credit($s, CC_BEAR_ITEMS[$it]);
        $s['act']['lane'] = $choice; $s['act']['drop']++;
        $s['act']['log'][] = ['lane' => $choice, 'items' => $items, 'got' => $got];
        $s['ev']['drop'] = ['lane' => $choice, 'items' => $items, 'got' => $got, 'snap' => $snap, 'n' => $s['act']['drop']];
        if ($snap || $s['act']['drop'] >= CC_BEAR_DROPS || $s['capped']) cc_endAct($s, $rng);
    } elseif ($p === 'fire') {
        if ($action !== 'pick' || $choice === null || $choice < 0 || $choice >= CC_FIRE_TORCHES || in_array($choice, $s['act']['picked'], true)) $bad();
        $first = count($s['act']['picked']) === 0;
        $it = cc_pickW($rng, $first ? array_slice(CC_FIRE_W, 1) : CC_FIRE_W);
        if ($first) $it++;
        $out = $it === 0; $got = $out ? 0 : cc_credit($s, CC_FIRE_ITEMS[$it]);
        $s['act']['picked'][] = $choice; $s['act']['log'][] = ['t' => $choice, 'it' => $it, 'got' => $got];
        $s['ev']['blast'] = ['t' => $choice, 'it' => $it, 'got' => $got, 'out' => $out];
        if ($out || count($s['act']['picked']) >= CC_FIRE_TORCHES || $s['capped']) cc_endAct($s, $rng);
    } elseif ($p === 'jester') {
        if ($action !== 'pick' || !$ok3) $bad();
        $boxes = [];
        for ($i = 0; $i < 3; $i++) $boxes[] = CC_JS_SPINS[cc_pickW($rng, CC_JS_SPINS_W)];
        $n = $boxes[$choice]; $spins = [];
        for ($i = 0; $i < $n && !$s['capped']; $i++) { $sp = cc_jesterSpin($rng); $sp['got'] = cc_credit($s, $sp['pay']); $spins[] = $sp; }
        $s['ev']['jester'] = ['pick' => $choice, 'boxes' => $boxes, 'spins' => $spins, 'win' => $s['act']['win']];
        cc_endAct($s, $rng);
    } elseif ($p === 'elephant') {
        if ($action !== 'spin') $bad();
        $spins = []; $left = $s['act']['spins']; $mult = CC_EL_START; $total = $s['act']['spins'];
        while ($left > 0 && !$s['capped']) {
            $left--;
            $sp = cc_elephantSpin($rng, $mult); $mult = $sp['mult'];
            if ($sp['retrig'] && $total < CC_EL_MAX) { $a2 = min(CC_EL_RETRIG, CC_EL_MAX - $total); $left += $a2; $total += $a2; $sp['extra'] = $a2; }
            $sp['got'] = cc_credit($s, $sp['pay']); $spins[] = $sp;
        }
        $s['ev']['elephant'] = ['spins' => $spins, 'start' => $s['act']['spins'], 'win' => $s['act']['win'], 'mult' => $mult];
        cc_endAct($s, $rng);
    } else $bad();
    $s['rev']++;
    return $s;
}

/* ---------- the API ---------- */
function cc_public(array $r): array {
    $s = $r['data']; $stake = (int) $r['stake'];
    $st = (int) ($s['stake'] ?? $stake);
    unset($s['token'], $s['stake'], $s['cost']);
    return ['o' => $s, 'round' => (int) $r['id'], 'stake' => $st, 'unit' => intdiv($st, CC_U), 'pending' => $r['state'] === 'open'];
}
function cc_label(array $s): string {
    if (empty($s['shots'])) return '';
    $shot = $s['shots'][count($s['shots']) - 1];
    if (isset($shot['cash'])) return 'Cannon cash prize';
    $n = []; foreach ($shot['acts'] as $a) $n[] = CC_ACT_NAMES[$a];
    return mb_substr('Cannon: ' . implode(' + ', $n), 0, 60);
}
function cc_store(array &$u, array $r, array $s): array {
    if ($s['phase'] === 'done' && $r['state'] === 'open') {
        $st = (int) $s['stake']; $win = $s['total'] * intdiv($st, CC_U);
        $x = $r['stake'] > 0 ? round($win / $r['stake'], 2) : 0;
        $f = ['bonus' => $s['base']['bonus'] ? 1 : 0];
        if ($s['capped']) $f['feedLabel'] = 'Max win 2,500x';
        elseif ($s['base']['bonus'] && $x >= 25) { $lbl = cc_label($s); if ($lbl !== '') $f['feedLabel'] = $lbl; }
        round_close($u, $r, $win, $f);
        $r['state'] = 'done';
    }
    round_save_data((int) $r['id'], $s);
    $r['data'] = $s;
    return cc_public($r);
}
function cc_load(array $row): array { $row['data'] = json_decode((string) $row['data'], true); return $row; }
function play_circus(array &$u, string $op, array $in): array {
    if ($op === 'state') {
        $r = q1("SELECT * FROM rounds WHERE user_id = ? AND game = 'circus' AND data IS NOT NULL ORDER BY id DESC LIMIT 1", [$u['id']]);
        if (!$r) return ['o' => null];
        $r = cc_load($r);
        return is_array($r['data']) ? cc_public($r) : ['o' => null];
    }
    if ($op === 'start') {
        $token = $in['token'] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{32}$/D', $token)) throw new ApiError('Invalid round reference.');
        /* a repeated start (a lost reply) returns the round it already made */
        foreach (q("SELECT * FROM rounds WHERE user_id = ? AND game = 'circus' ORDER BY id DESC LIMIT 6 FOR UPDATE", [$u['id']])->fetchAll() as $row) {
            $row = cc_load($row);
            if (is_array($row['data']) && ($row['data']['token'] ?? '') === $token) return cc_public($row) + ['repeat' => true];
        }
        /* an unfinished show must be finished first */
        $open = round_get_open($u, 'circus');
        if ($open && is_array($open['data'])) return cc_public($open) + ['resume' => true];
        $stake = stake_of($in, STAKE_LADDER);
        $buy = $in['buy'] ?? null;
        if ($buy !== null && (!is_string($buy) || !isset(CC_BUYS[$buy]))) throw new ApiError('Unknown bonus purchase.');
        /* the server sets the price; the browser never sends one */
        $cost = $buy === null ? $stake : $stake * CC_BUYS[$buy];
        if ($u['balance'] < $cost) throw new ApiError('Not enough Batty Bucks.', 402);
        $s = cc_start(batty_rng(), $buy);
        $s['token'] = $token; $s['stake'] = $stake; $s['cost'] = $cost;
        $rid = round_open($u, 'circus', $cost, $s);
        return cc_store($u, ['id' => $rid, 'game' => 'circus', 'stake' => $cost, 'state' => 'open', 'data' => $s], $s);
    }
    if ($op === 'act') {
        $rid = in_int($in, 'round', 1, PHP_INT_MAX);
        $r = q1("SELECT * FROM rounds WHERE id = ? AND user_id = ? AND game = 'circus' FOR UPDATE", [$rid, $u['id']]);
        if (!$r) throw new ApiError('That show could not be found.', 404);
        $r = cc_load($r);
        if (!is_array($r['data'])) throw new ApiError('That show has finished.', 409);
        $rev = in_int($in, 'rev', 0, 1000000);
        if ($r['state'] !== 'open' || $rev !== (int) $r['data']['rev']) return cc_public($r) + ['stale' => true];
        $a = $in['action'] ?? '';
        if (!is_string($a) || !in_array($a, ['fire', 'collect', 'retry', 'pick', 'spin'], true)) throw new ApiError('Unknown action.');
        $choice = array_key_exists('choice', $in) && $in['choice'] !== null ? in_int($in, 'choice', 0, 11) : null;
        $s = cc_step($r['data'], $a, $choice, batty_rng());
        return cc_store($u, $r, $s);
    }
    throw new ApiError('Unknown action.');
}
