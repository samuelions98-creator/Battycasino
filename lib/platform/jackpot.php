<?php
/* Batty Jackpots: four progressive pools (Mini, Minor, Major, Grand) shared by every player and every game.
   - Every round with a stake of JP_MIN_STAKE or more feeds the pools and has a chance to win one. The stake counts up to
     JP_CAP_STAKE, so bigger bets feed more and have a bigger chance, but one giant bet cannot drain the pools.
   - A pool's share of the stake is `rate`. A round with counted stake e wins that pool with probability e / hit, where `hit`
     is the staked volume between wins on average. A win pays the whole pool, which then restarts at its seed.
   - So in the long run the pools return rate + seed/hit of every counted BB staked: about 2.5% on top of the game's own
     return (Mini 1.0%, Minor 0.7%, Major 0.5%, Grand 0.3%). Jackpot wins are paid with credit() and never counted as game
     wins, so the live return balancer is unaffected.
   - The draw uses the OS CSPRNG on the server. Setting jp_scale (default 1) divides every `hit`, which makes wins that much
     more frequent; it is for testing and for promotions. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const JP_MIN_STAKE = 100;
const JP_CAP_STAKE = 100000;
const JP_TIERS = [   // listed rarest first: the draw checks them in this order
    'grand' => ['name' => 'Grand', 'seed' => 500000, 'rate' => 0.002, 'hit' => 500000000],
    'major' => ['name' => 'Major', 'seed' => 40000, 'rate' => 0.003, 'hit' => 20000000],
    'minor' => ['name' => 'Minor', 'seed' => 6000, 'rate' => 0.004, 'hit' => 2000000],
    'mini' => ['name' => 'Mini', 'seed' => 800, 'rate' => 0.006, 'hit' => 200000],
];
function jp_scale(): float {
    $s = (float) setting('jp_scale', 1); $s = $s >= 1 ? $s : 1.0;
    if (function_exists('happy_active') && ($e = happy_active())) $s *= max(1.0, (float) $e['jp']);   // Happy Hour
    return $s;
}

/* Called for every finished round, inside the transaction that holds the player's row. Pays a win straight into $u. */
function jp_after_round(array &$u, string $game, int $stake): void {
    if ($stake < JP_MIN_STAKE) return;
    $e = min($stake, JP_CAP_STAKE);
    foreach (JP_TIERS as $t => $c) q('UPDATE jp_pools SET amount = amount + ? WHERE tier = ?', [$e * $c['rate'], $t]);
    $draw = random_int(0, 9007199254740991) / 9007199254740992; $scale = jp_scale(); $band = 0.0; $won = null;
    foreach (JP_TIERS as $t => $c) { $band += $e * $scale / $c['hit']; if ($draw < $band) { $won = $t; break; } }
    if ($won === null) return;
    $row = q1('SELECT amount FROM jp_pools WHERE tier = ? FOR UPDATE', [$won]);
    $amount = (int) floor((float) $row['amount']);
    q('UPDATE jp_pools SET amount = ?, hits = hits + 1 WHERE tier = ?', [JP_TIERS[$won]['seed'], $won]);
    $name = JP_TIERS[$won]['name'];
    credit($u, $amount, 'jackpot', $game, null, $name . ' jackpot');
    q('INSERT INTO jp_hits (tier, user_id, amount, game, stake, created_at) VALUES (?,?,?,?,?,?)', [$won, $u['id'], $amount, $game, $stake, now_sql()]);
    q('INSERT INTO feed (user_id, game, amount, x, label, created_at) VALUES (?,?,?,?,?,?)', [$u['id'], $game, $amount, $stake > 0 ? round($amount / $stake, 2) : 0, $name . ' JACKPOT', now_sql()]);
    event(['type' => 'jackpot', 'tier' => $won, 'name' => $name, 'amount' => $amount]);
}
function jp_api_state(): array {
    require_user();
    $pools = [];
    $rows = []; foreach (q('SELECT tier, amount, hits FROM jp_pools')->fetchAll() as $r) $rows[$r['tier']] = $r;
    foreach (array_reverse(JP_TIERS, true) as $t => $c) $pools[] = ['tier' => $t, 'name' => $c['name'], 'amount' => (int) floor((float) ($rows[$t]['amount'] ?? $c['seed'])), 'seed' => $c['seed'], 'hits' => (int) ($rows[$t]['hits'] ?? 0)];
    $hits = [];
    foreach (q('SELECT h.tier, h.amount, h.game, h.created_at, u.username, u.avatar FROM jp_hits h JOIN users u ON u.id = h.user_id ORDER BY h.id DESC LIMIT 8')->fetchAll() as $h)
        $hits[] = ['tier' => $h['tier'], 'name' => JP_TIERS[$h['tier']]['name'] ?? $h['tier'], 'amount' => (int) $h['amount'], 'game' => $h['game'], 'who' => $h['username'], 'avatar' => $h['avatar'], 'at' => strtotime($h['created_at'] . ' UTC')];
    return ['pools' => $pools, 'hits' => $hits, 'minStake' => JP_MIN_STAKE, 'capStake' => JP_CAP_STAKE, 'boost' => rtp_boost_pct(), 'boostCap' => RTP_BOOST_CAP];
}
