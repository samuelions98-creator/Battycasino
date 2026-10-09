<?php
/* Shared plumbing: config, database, JSON responses, sessions, rate limiting. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const BATTY_GAMES = ['bunky', 'olympus', 'fishing', 'plachinko', 'moonshot', 'roulette', 'ultraheist', 'batjack', 'bonanza', 'starwing', 'circus'];
const BATTY_GAME_NAMES = ['bunky' => 'Bunky Time', 'olympus' => 'Raging Cocks of Olympus 2', 'fishing' => 'Fishing Frenzy', 'plachinko' => 'Plachinko', 'moonshot' => "Batty's Moonshot", 'roulette' => 'Bat Signal Roulette', 'ultraheist' => 'Bat Bandits UltraNudge', 'batjack' => 'Bat Jack', 'bonanza' => 'Sugar Fang Bonanza', 'starwing' => 'Starwing', 'circus' => 'Batty Circus'];

class ApiError extends Exception {
    public $status;
    public function __construct(string $msg, int $status = 400) { parent::__construct($msg); $this->status = $status; }
}

function cfg(?string $key = null) {
    static $c = null;
    if ($c === null) {
        $f = dirname(__DIR__) . '/config.php';
        if (!is_file($f)) throw new ApiError('Batty Casino is not set up yet: copy config.sample.php to config.php and run install.php.', 503);
        $c = require $f;
        $c += ['db_port' => 3306, 'start_balance' => 25000, 'site_name' => 'Batty Casino'];
    }
    return $key === null ? $c : ($c[$key] ?? null);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = cfg();
    $dsn = 'mysql:host=' . $c['db_host'] . ';port=' . (int) $c['db_port'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        throw new ApiError('Could not connect to the database. Check the details in config.php.', 503);
    }
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}
function q(string $sql, array $args = []): PDOStatement { $st = db()->prepare($sql); $st->execute($args); return $st; }
function q1(string $sql, array $args = []) { $r = q($sql, $args)->fetch(); return $r === false ? null : $r; }
function qv(string $sql, array $args = []) { $r = q($sql, $args)->fetchColumn(); return $r === false ? null : $r; }
function tx(callable $fn) {
    $pdo = db();
    for ($try = 0; ; $try++) {
        $pdo->beginTransaction();
        try { $r = $fn(); $pdo->commit(); return $r; }
        catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            /* retry once on a deadlock */
            if ($try < 2 && $e instanceof PDOException && in_array($e->errorInfo[1] ?? 0, [1213, 1205], true)) continue;
            throw $e;
        }
    }
}
function setting(string $k, $default = null) {
    static $cache = [];
    if (!array_key_exists($k, $cache)) { $v = qv('SELECT v FROM settings WHERE k = ?', [$k]); $cache[$k] = $v; }
    return $cache[$k] ?? $default;
}
function set_setting(string $k, $v): void { q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$k, (string) $v]); }

function now_sql(): string { return gmdate('Y-m-d H:i:s'); }
function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0', 0, 45); }

/* ---------- sessions ---------- */
function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('battysess');
    session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    ini_set('session.use_strict_mode', '1');
    session_start();
}
/* The logged-in user's row, or null. Releases the session lock straight away so requests never queue on it. */
function current_user(): ?array {
    static $u = false;
    if ($u !== false) return $u;
    start_session();
    $id = (int) ($_SESSION['uid'] ?? 0);
    $ver = (int) ($_SESSION['pv'] ?? 0);
    session_write_close();
    $u = null;
    if ($id) {
        $row = q1('SELECT * FROM users WHERE id = ?', [$id]);
        if ($row && (int) $row['pass_ver'] === $ver) $u = $row;
    }
    return $u;
}
function require_user(): array {
    $u = current_user();
    if (!$u) throw new ApiError('Please log in first.', 401);
    if ((int) $u['banned']) throw new ApiError('This account has been suspended.', 403);
    return $u;
}
function require_admin(): array {
    $u = require_user();
    if (!(int) $u['is_admin']) throw new ApiError('Admins only.', 403);
    return $u;
}

/* ---------- rate limiting (login, register) ---------- */
function rate_limit(string $bucket, int $max, int $seconds): void {
    $ip = client_ip();
    q('DELETE FROM attempts WHERE at < ?', [gmdate('Y-m-d H:i:s', time() - 3600)]);
    $n = (int) qv('SELECT COUNT(*) FROM attempts WHERE ip = ? AND bucket = ? AND at > ?', [$ip, $bucket, gmdate('Y-m-d H:i:s', time() - $seconds)]);
    if ($n >= $max) throw new ApiError('Too many attempts. Wait a few minutes and try again.', 429);
    q('INSERT INTO attempts (ip, bucket, at) VALUES (?, ?, ?)', [$ip, $bucket, now_sql()]);
}

/* ---------- input helpers ---------- */
function in_int(array $in, string $k, int $min, int $max): int {
    $v = $in[$k] ?? null;
    if (!is_int($v) && !(is_string($v) && preg_match('/^-?\d+$/', $v)) && !(is_float($v) && floor($v) == $v)) throw new ApiError("Bad value for $k.");
    $v = (int) $v;
    if ($v < $min || $v > $max) throw new ApiError("Bad value for $k.");
    return $v;
}
function in_str(array $in, string $k, int $maxLen = 200): string {
    $v = $in[$k] ?? '';
    if (!is_string($v)) throw new ApiError("Bad value for $k.");
    return mb_substr(trim($v), 0, $maxLen);
}
