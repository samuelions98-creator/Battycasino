<?php
/* One-time installer: checks the server, creates the tables and the first admin account.
   Once an admin exists it locks itself and only shows a status page. */
define('BATTY', 1);
require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/rng.php';
require __DIR__ . '/lib/wallet.php';
require __DIR__ . '/lib/social.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');

$checks = []; $err = null; $done = false; $locked = false;
$checks[] = ['PHP 8.0 or newer', version_compare(PHP_VERSION, '8.0.0', '>='), PHP_VERSION];
$checks[] = ['PDO MySQL driver', extension_loaded('pdo_mysql'), extension_loaded('pdo_mysql') ? 'loaded' : 'missing'];
$checks[] = ['config.php present', is_file(__DIR__ . '/config.php'), is_file(__DIR__ . '/config.php') ? 'found' : 'copy config.sample.php to config.php and fill in your database details'];
$ok = !in_array(false, array_column($checks, 1), true);
if ($ok) {
    try { db(); $checks[] = ['Database connection', true, cfg('db_name')]; }
    catch (ApiError $e) { $checks[] = ['Database connection', false, $e->getMessage()]; $ok = false; }
}
if ($ok) {
    try {
        foreach (require __DIR__ . '/lib/schema.php' as $sql) db()->exec($sql);
        $checks[] = ['Tables', true, 'created or already there'];
        $locked = (bool) qv('SELECT COUNT(*) FROM users WHERE is_admin = 1');
    } catch (Throwable $e) { $checks[] = ['Tables', false, $e->getMessage()]; $ok = false; }
}
if ($ok && !$locked && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    try {
        $name = valid_name(trim((string) ($_POST['name'] ?? '')));
        $pass = valid_pass((string) ($_POST['pass'] ?? ''));
        if ($pass !== (string) ($_POST['pass2'] ?? '')) throw new ApiError('The two passwords do not match.');
        if (qv('SELECT id FROM users WHERE name_lc = ?', [strtolower($name)])) throw new ApiError('That username is taken.');
        tx(function () use ($name, $pass) {
            q('INSERT INTO users (username, name_lc, pass_hash, balance, is_admin, avatar, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?)', [$name, strtolower($name), password_hash($pass, PASSWORD_DEFAULT), 0, 1, '3-7', now_sql(), now_sql()]);
            $u = lock_user((int) db()->lastInsertId());
            credit($u, (int) cfg('start_balance'), 'start', null, null, 'Welcome to the belfry');
            save_user($u);
            set_setting('installed', gmdate('c'));
        });
        $done = true; $locked = true;
    } catch (ApiError $e) { $err = $e->getMessage(); }
}
if ($ok && $locked) set_setting('installed', setting('installed') ?: gmdate('c'));
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
?><!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install Batty Casino</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#100a1c;color:#f7f0ff;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px}
main{max-width:560px;margin:0 auto}h1{color:#ffd76a;font-size:30px;margin:0 0 4px}p{color:#ab98c9}
table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:8px;border-bottom:1px solid rgba(255,255,255,.1);vertical-align:top}
.ok{color:#58f0c8}.bad{color:#ff3d81}form{display:grid;gap:10px;margin-top:16px;padding:16px;border-radius:14px;background:#1d1033;border:1px solid rgba(255,215,106,.35)}
label{display:grid;gap:4px;font-weight:600}input{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:#100a1c;color:#fff}
button{font:inherit;font-weight:800;padding:12px;border:0;border-radius:12px;background:#ffd76a;color:#3b1d00;cursor:pointer}.msg{padding:12px 14px;border-radius:12px;margin:12px 0}
.msg.e{background:rgba(255,61,129,.15);border:1px solid #ff3d81}.msg.g{background:rgba(88,240,200,.12);border:1px solid #58f0c8}a{color:#ffd76a}
</style></head><body><main>
<h1>Batty Casino installer</h1>
<p>This checks your hosting, creates the database tables and your admin account.</p>
<table><?php foreach ($checks as [$n, $good, $info]): ?><tr><td><?= $h($n) ?></td><td class="<?= $good ? 'ok' : 'bad' ?>"><?= $good ? 'OK' : 'Problem' ?></td><td><?= $h($info) ?></td></tr><?php endforeach; ?></table>
<?php if ($done): ?>
  <div class="msg g"><b>All done.</b> Your admin account is ready and the installer has locked itself. You can delete install.php now if you like.</div>
  <p><a href="./">Open Batty Casino</a></p>
<?php elseif ($locked): ?>
  <div class="msg g">Batty Casino is installed and has an admin account. This installer is locked.</div>
  <p><a href="./">Open Batty Casino</a></p>
<?php elseif ($ok): ?>
  <?php if ($err): ?><div class="msg e"><?= $h($err) ?></div><?php endif; ?>
  <form method="post" autocomplete="off">
    <b>Create your admin account</b>
    <label>Username<input name="name" required minlength="3" maxlength="16" pattern="[A-Za-z0-9_]{3,16}" value="<?= $h($_POST['name'] ?? '') ?>"></label>
    <label>Password<input name="pass" type="password" required minlength="6"></label>
    <label>Password again<input name="pass2" type="password" required minlength="6"></label>
    <button type="submit">Create admin and finish</button>
  </form>
<?php else: ?>
  <div class="msg e">Fix the problems above, then reload this page.</div>
<?php endif; ?>
</main></body></html>
