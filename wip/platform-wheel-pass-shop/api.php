<?php
/* Batty Casino API. The page calls this with POST + JSON: {"a": "action", ...}. */
define('BATTY', 1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/rng.php';
require __DIR__ . '/lib/wallet.php';
require __DIR__ . '/lib/rtp.php';
foreach (BATTY_GAMES as $g) require __DIR__ . "/lib/games/$g.php";
require __DIR__ . '/lib/play.php';
require __DIR__ . '/lib/flights.php';
require __DIR__ . '/lib/tables.php';
require __DIR__ . '/lib/bjtable.php';
require __DIR__ . '/lib/social.php';
require __DIR__ . '/lib/admin.php';
/* Platform: Daily Prize Wheel, Bat Pass, Belfry Shop (actions are all named plat_*) */
foreach (['core', 'wheel', 'pass', 'shop'] as $p) require __DIR__ . "/lib/platform/$p.php";

function respond(array $data, int $status = 200): void {
    http_response_code($status);
    if (!empty($GLOBALS['BATTY_EVENTS'])) $data['events'] = $GLOBALS['BATTY_EVENTS'];
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new ApiError('POST only.', 405);
    /* the custom header can only be sent by our own page (browsers block it cross-site without CORS), which stops forged requests */
    if (($_SERVER['HTTP_X_BATTY'] ?? '') !== '1') throw new ApiError('Bad request.', 403);
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 65536) throw new ApiError('Request too large.', 413);
    $in = json_decode($raw ?: '{}', true);
    if (!is_array($in)) throw new ApiError('Bad JSON.');
    $a = (string) ($in['a'] ?? '');
    try { $installed = qv("SELECT v FROM settings WHERE k = 'installed'"); } catch (PDOException $e) { $installed = null; }
    if (!$installed) throw new ApiError('Batty Casino is not installed yet. Open install.php in your browser to finish setting it up.', 503);

    switch ($a) {
        case 'me': {
            $u = current_user();
            if ($u && !(int) $u['banned']) { q('UPDATE users SET last_seen = ? WHERE id = ?', [now_sql(), $u['id']]); resolve_stale((int) $u['id']); }
            respond(['site' => site_payload(), 'me' => ($u && !(int) $u['banned']) ? me_payload($u) : null]);
        }
        case 'register': respond(api_register($in));
        case 'login': respond(api_login($in));
        case 'logout': respond(api_logout());
        case 'password': respond(api_password($in));
        case 'claim': respond(api_claim());
        case 'rescue': respond(api_rescue());
        case 'missions': respond(api_missions());
        case 'mission_claim': respond(api_mission_claim($in));
        case 'leaderboard': respond(api_leaderboard($in));
        case 'feed': respond(api_feed($in));
        case 'profile': respond(api_profile($in));
        case 'profile_update': respond(api_profile_update($in));
        case 'play': respond(play($in));
        default:
            if (str_starts_with($a, 'admin_')) respond(admin_api($a, $in));
            if (str_starts_with($a, 'plat_')) respond(plat_api($a, $in)); // Platform: lib/platform/core.php
            throw new ApiError('Unknown action.', 404);
    }
} catch (ApiError $e) {
    respond(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('Batty Casino: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond(['error' => 'Something went wrong on the server. Please try again.'], 500);
}
