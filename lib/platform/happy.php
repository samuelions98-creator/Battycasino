<?php
/* Happy Hour: timed, site-wide events an admin starts from the Admin page (settings key happy).
   While one runs, for every player: the Return Boost goes up by `boost` points, the Batty Jackpots hit `jp` times as often,
   and Bat Pass XP from play is multiplied by `xp`. A banner and countdown show in the lobby and the top bar. It ends by itself. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const HAPPY_PRESETS = [
    'happy' => ['name' => 'Happy Hour', 'blurb' => 'Bigger payouts, jackpots hit more and double Bat Pass XP', 'boost' => 1.0, 'jp' => 3.0, 'xp' => 2.0, 'mins' => 60],
    'frenzy' => ['name' => 'Jackpot Frenzy', 'blurb' => 'The jackpots hit ten times as often', 'boost' => 0.0, 'jp' => 10.0, 'xp' => 1.0, 'mins' => 30],
    'xp' => ['name' => 'Double XP', 'blurb' => 'Double Bat Pass XP on every round', 'boost' => 0.0, 'jp' => 1.0, 'xp' => 2.0, 'mins' => 120],
    'payday' => ['name' => 'Payday', 'blurb' => 'An extra 2% of every stake paid back', 'boost' => 2.0, 'jp' => 1.0, 'xp' => 1.0, 'mins' => 30],
];
/* the running event, or null */
function happy_active(): ?array {
    $raw = setting('happy');
    if (!$raw) return null;
    $e = json_decode($raw, true);
    if (!is_array($e) || ($e['until'] ?? 0) <= time()) return null;
    return $e;
}
function happy_public(): ?array {
    $e = happy_active();
    return $e ? ['name' => $e['name'], 'blurb' => $e['blurb'], 'left' => max(0, (int) $e['until'] - time()), 'boost' => $e['boost'], 'jp' => $e['jp'], 'xp' => $e['xp']] : null;
}
function happy_start(string $preset, int $mins): array {
    $p = HAPPY_PRESETS[$preset] ?? null; if (!$p) throw new ApiError('Unknown event.');
    if ($mins < 5 || $mins > 1440) throw new ApiError('An event lasts 5 minutes to 24 hours.');
    $e = $p + ['id' => $preset, 'until' => time() + $mins * 60, 'started' => time()];
    set_setting('happy', json_encode($e));
    return happy_public();
}
function happy_stop(): void { q('DELETE FROM settings WHERE k = ?', ['happy']); }
function happy_xp_mult(): float { $e = happy_active(); return $e ? max(1.0, (float) $e['xp']) : 1.0; }
