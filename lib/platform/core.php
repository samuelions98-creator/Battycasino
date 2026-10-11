<?php
/* Platform: shared plumbing for the Daily Prize Wheel, the Bat Pass and the Belfry Shop.
   - The clock (with a dev-only offset for testing day rollover).
   - The item catalogue (one source of truth: the browser receives it from here).
   - Inventory, equipping, and the cosmetics shown beside avatars and names.
   - The plat_* action dispatcher used by api.php.
   Money only ever moves through credit() inside tx() with the player's row locked. */
if (!defined('BATTY')) { http_response_code(403); exit; }

/* ---------- clock ----------
   Testing only: when config.php sets 'plat_dev' => true, the settings key plat_dev_offset (seconds) shifts the
   platform's clock so day rollover and streaks can be exercised. Without that config flag the offset is ignored. */
function plat_time(): int {
    static $off = null;
    if ($off === null) $off = cfg('plat_dev') === true ? (int) setting('plat_dev_offset', 0) : 0;
    return time() + $off;
}
function plat_dt(): DateTime { return (new DateTime('@' . plat_time()))->setTimezone(new DateTimeZone('Europe/London')); }
function plat_day(): string { return plat_dt()->format('Y-m-d'); }
function plat_sql_time(int $t): string { return gmdate('Y-m-d H:i:s', $t); }
/* Seconds until the next UK midnight (for the wheel and daily challenges). */
function plat_secs_to_midnight(): int { $d = plat_dt(); $m = (clone $d)->modify('tomorrow'); return $m->getTimestamp() - $d->getTimestamp(); }

/* ---------- catalogue ----------
   [id] => [category, name, rarity, price or 0 (not for sale), slot, source, description]
   source: 'shop' (sold, never in crates), 'crate' (crate-only), 'pass' (Bat Pass only), 'any' (sold and in crates)
   Cosmetic categories: acc (slot head/face/back), frame, name, title, emote, effect, badge.
   Consumables: boost, crate, ticket (counted in plat_inv.qty). */
const PLAT_RARITY = ['common' => 1, 'rare' => 2, 'epic' => 3, 'legendary' => 4];
function plat_catalog(): array {
    static $c = null;
    if ($c) return $c;
    $c = [
        /* avatar accessories */
        'acc_bowler' => ['acc', 'Bowler Hat', 'common', 20000, 'head', 'any', 'A proper gentlebat’s lid.'],
        'acc_deerstalker' => ['acc', 'Deerstalker', 'common', 20000, 'head', 'any', 'Elementary, my dear Batson.'],
        'acc_monocle' => ['acc', 'Posh Monocle', 'common', 15000, 'face', 'any', 'For inspecting the paytable.'],
        'acc_wizard' => ['acc', 'Wizard Hat', 'rare', 60000, 'head', 'any', 'Starry, pointy, faintly magical.'],
        'acc_horns' => ['acc', 'Little Devil Horns', 'rare', 50000, 'head', 'any', 'Cheeky. Very cheeky.'],
        'acc_hearts' => ['acc', 'Heart Specs', 'rare', 50000, 'face', 'any', 'Love at first spin.'],
        'acc_cape' => ['acc', 'Count’s Cape', 'rare', 75000, 'back', 'any', 'High collar, crimson lining, dramatic swish.'],
        'acc_pumpkin' => ['acc', 'Pumpkin Hat', 'epic', 0, 'head', 'crate', 'A grinning lantern. Crates only.'],
        'acc_viking' => ['acc', 'Viking Helm', 'epic', 180000, 'head', 'any', 'Horns, rivets and a fearless attitude.'],
        'acc_visor' => ['acc', 'Laser Visor', 'epic', 150000, 'face', 'any', 'A scanning beam from the future.'],
        'acc_ermine' => ['acc', 'Royal Ermine Cape', 'epic', 200000, 'back', 'any', 'Fit for a coronation.'],
        'acc_mooncrown' => ['acc', 'Crown of the Night', 'legendary', 750000, 'head', 'any', 'Moonstone crown with a glinting jewel.'],
        'acc_starcape' => ['acc', 'Starlit Cape', 'legendary', 0, 'back', 'pass', 'A cape woven from the night sky. Bat Pass Gold, tier 35.'],
        /* frames */
        'fr_silver' => ['frame', 'Silver Ring', 'common', 15000, 'frame', 'any', 'Clean, polished, quietly smug.'],
        'fr_gold' => ['frame', 'Gold Ring', 'rare', 60000, 'frame', 'any', 'Solid gold with a slow shine.'],
        'fr_bat' => ['frame', 'Bat Wing Ring', 'rare', 0, 'frame', 'pass', 'Wings folded round your face. Bat Pass, tier 10.'],
        'fr_neon' => ['frame', 'Neon Ring', 'epic', 160000, 'frame', 'any', 'Buzzing pink-to-teal neon tube.'],
        'fr_frost' => ['frame', 'Frost Ring', 'epic', 160000, 'frame', 'any', 'Icy crystals that glitter.'],
        'fr_blood' => ['frame', 'Blood Moon Ring', 'epic', 0, 'frame', 'crate', 'A pulsing crimson halo. Crates only.'],
        'fr_flame' => ['frame', 'Flame Ring', 'legendary', 600000, 'frame', 'any', 'Living fire licks round your avatar.'],
        'fr_galaxy' => ['frame', 'Galaxy Ring', 'legendary', 800000, 'frame', 'any', 'A whole galaxy, slowly turning.'],
        /* name styles */
        'ns_moon' => ['name', 'Moonbeam', 'common', 15000, 'name', 'any', 'Your name in warm moonlight gold.'],
        'ns_ecto' => ['name', 'Ectoplasm', 'common', 15000, 'name', 'any', 'Ghostly green.'],
        'ns_fang' => ['name', 'Fang Pink', 'common', 15000, 'name', 'any', 'Hot pink with bite.'],
        'ns_sunset' => ['name', 'Sunset', 'rare', 50000, 'name', 'any', 'Orange-to-magenta gradient.'],
        'ns_frost' => ['name', 'Frostbite', 'rare', 50000, 'name', 'any', 'Ice-blue gradient.'],
        'ns_aurora' => ['name', 'Aurora', 'epic', 150000, 'name', 'any', 'Northern lights that drift.'],
        'ns_bloodmoon' => ['name', 'Blood Moon', 'epic', 0, 'name', 'crate', 'Deep crimson glow. Crates only.'],
        'ns_disco' => ['name', 'Disco', 'legendary', 0, 'name', 'pass', 'Every colour, all at once. Bat Pass Gold, tier 25.'],
        'ns_molten' => ['name', 'Molten Gold', 'legendary', 500000, 'name', 'any', 'Liquid gold with a travelling shine.'],
        /* titles */
        'ti_nightowl' => ['title', 'Night Owl', 'common', 10000, 'title', 'any', 'Shown under your name.'],
        'ti_cheeky' => ['title', 'Cheeky Bat', 'common', 10000, 'title', 'any', 'Shown under your name.'],
        'ti_cuppa' => ['title', 'Cuppa Champion', 'common', 10000, 'title', 'any', 'Milk, two sugars.'],
        'ti_moon' => ['title', 'Moon Whisperer', 'rare', 60000, 'title', 'any', 'Shown under your name.'],
        'ti_highroller' => ['title', 'High Roller', 'rare', 100000, 'title', 'any', 'Shown under your name.'],
        'ti_passmaster' => ['title', 'Pass Master', 'rare', 0, 'title', 'pass', 'Bat Pass, tier 50.'],
        'ti_count' => ['title', 'Count of the Crypt', 'epic', 250000, 'title', 'any', 'Shown under your name.'],
        'ti_hell' => ['title', 'Bat Out of Hell', 'epic', 0, 'title', 'crate', 'Crates only.'],
        'ti_legend' => ['title', 'Living Legend', 'legendary', 1000000, 'title', 'any', 'Shown under your name.'],
        'ti_belfry' => ['title', 'Lord of the Belfry', 'legendary', 0, 'title', 'pass', 'Bat Pass Gold, tier 50.'],
        /* emotes (for live games; your signature emote shows on your profile) */
        'em_wave' => ['emote', 'Bat Wave', 'common', 10000, 'emote', 'any', 'A friendly flap.'],
        'em_gg' => ['emote', 'GG', 'common', 10000, 'emote', 'any', 'Good game, old bean.'],
        'em_cuppa' => ['emote', 'Cuppa', 'common', 15000, 'emote', 'any', 'Time for a brew.'],
        'em_cheers' => ['emote', 'Cheers!', 'rare', 40000, 'emote', 'any', 'Clink.'],
        'em_mindblown' => ['emote', 'Mind Blown', 'rare', 40000, 'emote', 'any', 'Did that just happen?'],
        'em_howl' => ['emote', 'Moon Howl', 'epic', 120000, 'emote', 'any', 'Awooo.'],
        'em_rain' => ['emote', 'Make It Rain', 'epic', 0, 'emote', 'crate', 'Crates only.'],
        'em_bow' => ['emote', 'Bow Down', 'legendary', 0, 'emote', 'pass', 'Bat Pass Gold, tier 45.'],
        /* animated avatar effects */
        'fx_sparkle' => ['effect', 'Sparkles', 'rare', 80000, 'effect', 'any', 'Twinkling stars round your avatar.'],
        'fx_bats' => ['effect', 'Bat Swarm', 'epic', 250000, 'effect', 'any', 'Three little bats orbit you.'],
        'fx_embers' => ['effect', 'Embers', 'epic', 0, 'effect', 'crate', 'Rising sparks. Crates only.'],
        'fx_storm' => ['effect', 'Storm', 'legendary', 900000, 'effect', 'any', 'Lightning crackles round you.'],
        'fx_eclipse' => ['effect', 'Eclipse Aura', 'legendary', 0, 'effect', 'pass', 'The season’s grand prize. Bat Pass Gold, tier 50.'],
        /* the showcase */
        'bd_key' => ['badge', 'Lounge Key', 'legendary', 2500000, 'badge', 'shop', 'A solid gold key beside your name. Purely for show, and everyone will see it.'],
        /* consumables */
        'bo_xp1h' => ['boost', 'Double Pass XP · 1 hour', 'common', 20000, '', 'shop', 'Doubles Bat Pass XP from play for an hour.'],
        'bo_xp24h' => ['boost', 'Double Pass XP · 24 hours', 'rare', 150000, '', 'shop', 'Doubles Bat Pass XP from play for a whole day.'],
        'bo_tier' => ['boost', 'Tier Skip', 'rare', 40000, '', 'shop', '+1,000 Bat Pass XP: one whole tier.'],
        'tk_premium' => ['ticket', 'Premium Wheel Ticket', 'rare', 25000, '', 'shop', 'One spin of the Premium Wheel. Jackpot 1,000,000 BB.'],
        'tk_spin' => ['ticket', 'Bonus Spin', 'common', 0, '', 'pass', 'One extra spin of the Daily Wheel.'],
        'cr_night' => ['crate', 'Night Crate', 'rare', 40000, '', 'shop', 'One cosmetic you do not own yet. Common to Legendary.'],
        'cr_blood' => ['crate', 'Blood Moon Crate', 'epic', 175000, '', 'shop', 'One cosmetic you do not own yet. Rare or better.'],
    ];
    return $c;
}
function plat_item(string $id): ?array {
    $c = plat_catalog();
    if (!isset($c[$id])) return null;
    [$cat, $name, $rar, $price, $slot, $src, $desc] = $c[$id];
    return ['id' => $id, 'cat' => $cat, 'name' => $name, 'rarity' => $rar, 'price' => $price, 'slot' => $slot, 'source' => $src, 'desc' => $desc];
}
function plat_is_cosmetic(array $it): bool { return in_array($it['cat'], ['acc', 'frame', 'name', 'title', 'emote', 'effect', 'badge'], true); }
/* What a duplicate cosmetic from the pass or the wheel converts to. */
function plat_dup_bb(array $it): int { return $it['price'] > 0 ? intdiv($it['price'], 2) : [1 => 5000, 2 => 20000, 3 => 60000, 4 => 150000][PLAT_RARITY[$it['rarity']]]; }
/* Crate odds (percent by rarity), shown openly in the shop. */
function plat_crate_odds(string $crate): array {
    return $crate === 'cr_blood' ? ['rare' => 55, 'epic' => 35, 'legendary' => 10] : ['common' => 62, 'rare' => 28, 'epic' => 8.5, 'legendary' => 1.5];
}
const PLAT_SLOTS = ['head', 'face', 'back', 'frame', 'name', 'title', 'emote', 'effect', 'badge'];

/* Run a platform read or hook from shared code (me_payload, public_user, after_round). Until the platform tables exist
   (Admin -> "Update database" not pressed yet) it returns $fallback instead of breaking the whole request. */
function plat_safe(callable $fn, $fallback) {
    try { return $fn(); }
    catch (PDOException $e) { if ((int) ($e->errorInfo[1] ?? 0) === 1146) return $fallback; throw $e; }
}

/* ---------- player rows ---------- */
function plat_profile_row(int $uid, bool $lock = false): array {
    $r = q1('SELECT * FROM plat_profile WHERE user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$uid]);
    if ($r) return $r;
    q('INSERT IGNORE INTO plat_profile (user_id, updated_at) VALUES (?, ?)', [$uid, now_sql()]);
    return q1('SELECT * FROM plat_profile WHERE user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$uid]);
}
function plat_inv(int $uid): array {
    $out = [];
    foreach (q('SELECT item, qty FROM plat_inv WHERE user_id = ? AND qty > 0', [$uid])->fetchAll() as $r) $out[$r['item']] = (int) $r['qty'];
    return $out;
}
function plat_qty(int $uid, string $item): int { return (int) (qv('SELECT qty FROM plat_inv WHERE user_id = ? AND item = ? FOR UPDATE', [$uid, $item]) ?? 0); }
function plat_take(int $uid, string $item, int $n = 1): void {
    $st = q('UPDATE plat_inv SET qty = qty - ? WHERE user_id = ? AND item = ? AND qty >= ?', [$n, $uid, $item, $n]);
    if ($st->rowCount() < 1) throw new ApiError('You do not have one of those.', 409);
}
/* Give an item. Cosmetics already owned become Batty Bucks instead (half the shop price). Returns what happened. */
function plat_give(array &$u, string $item, int $qty, string $source, string $kind): array {
    $it = plat_item($item);
    if (!$it) throw new ApiError('Unknown item.');
    if (plat_is_cosmetic($it)) {
        $st = q('INSERT IGNORE INTO plat_inv (user_id, item, qty, source, first_at) VALUES (?,?,1,?,?)', [$u['id'], $item, $source, now_sql()]);
        if ($st->rowCount() < 1) {
            /* a row with qty 0 cannot exist for cosmetics, so this is a duplicate */
            $bb = plat_dup_bb($it);
            credit($u, $bb, $kind, null, null, 'Duplicate ' . $it['name']);
            return ['item' => $item, 'qty' => 1, 'dup' => $bb];
        }
        return ['item' => $item, 'qty' => 1, 'dup' => 0];
    }
    q('INSERT INTO plat_inv (user_id, item, qty, source, first_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)', [$u['id'], $item, $qty, $source, now_sql()]);
    return ['item' => $item, 'qty' => $qty, 'dup' => 0];
}

/* ---------- cosmetics shown beside avatars and names ---------- */
function plat_cos_of(array $p): array {
    $o = [];
    foreach (PLAT_SLOTS as $s) if (!empty($p['eq_' . $s])) $o[$s] = $p['eq_' . $s];
    if (isset($o['title'])) { $it = plat_item($o['title']); $o['titleText'] = $it ? $it['name'] : ''; }
    return $o;
}
function plat_cosmetics(int $uid): array {
    $p = q1('SELECT * FROM plat_profile WHERE user_id = ?', [$uid]);
    return $p ? plat_cos_of($p) : [];
}
/* Look up many players' cosmetics at once (leaderboards, the feed). */
function plat_api_cos(array $in): array {
    $names = $in['names'] ?? [];
    if (!is_array($names)) throw new ApiError('Bad value for names.');
    $names = array_values(array_unique(array_filter(array_map(fn($n) => is_string($n) && preg_match('/^[A-Za-z0-9_]{3,16}$/', $n) ? strtolower($n) : null, array_slice($names, 0, 80)))));
    if (!$names) return ['cos' => (object) []];
    $ph = implode(',', array_fill(0, count($names), '?'));
    $rows = q("SELECT u.username, p.* FROM users u JOIN plat_profile p ON p.user_id = u.id WHERE u.name_lc IN ($ph)", $names)->fetchAll();
    $out = [];
    foreach ($rows as $r) { $c = plat_cos_of($r); if ($c) $out[$r['username']] = $c; }
    return ['cos' => (object) $out];
}

/* ---------- lobby / top-bar status (part of me_payload) ---------- */
function plat_status(array $u): array {
    $uid = (int) $u['id'];
    $p = q1('SELECT * FROM plat_profile WHERE user_id = ?', [$uid]) ?: ['wheel_day' => null, 'wheel_streak' => 0, 'boost_until' => null];
    $season = pass_season();
    $pp = q1('SELECT xp, gold FROM plat_pass WHERE user_id = ? AND season = ?', [$uid, $season['n']]);
    $xp = $pp ? (int) $pp['xp'] : 0; $gold = $pp ? (bool) $pp['gold'] : false;
    $tier = pass_tier($xp);
    $claimed = (int) qv('SELECT COUNT(*) FROM plat_pass_claims WHERE user_id = ? AND season = ? AND (track = ? OR track = ?)', [$uid, $season['n'], 'f', $gold ? 'g' : 'f']);
    $claimable = pass_claimable_count($tier, $gold) - $claimed;
    $inv = plat_inv($uid);
    $w = wheel_streak_info($p);
    $boost = $p['boost_until'] ? strtotime($p['boost_until'] . ' UTC') - plat_time() : 0;
    return [
        'wheelReady' => $w['freeReady'], 'wheelDay' => $w['day'], 'wheelIn' => $w['freeReady'] ? 0 : plat_secs_to_midnight(),
        'spins' => $inv['tk_spin'] ?? 0, 'tickets' => $inv['tk_premium'] ?? 0,
        'season' => $season['n'], 'seasonName' => $season['name'], 'seasonEnds' => $season['endsIn'],
        'tier' => $tier, 'xp' => $xp, 'tierXp' => PASS_TIER_XP, 'gold' => $gold, 'claimable' => max(0, $claimable),
        'boostIn' => max(0, $boost),
    ];
}

/* ---------- actions (api.php routes every 'plat_*' action here) ---------- */
function plat_api(string $a, array $in): array {
    switch ($a) {
        case 'plat_cos': return plat_api_cos($in);
        case 'plat_status': { $u = require_user(); return ['plat' => plat_status($u)]; }
        case 'plat_wheel': return wheel_api_state();
        case 'plat_wheel_spin': return wheel_api_spin($in);
        case 'plat_pass': return pass_api_state();
        case 'plat_pass_claim': return pass_api_claim($in);
        case 'plat_pass_buy': return pass_api_buy($in);
        case 'plat_shop': return shop_api_state();
        case 'plat_shop_buy': return shop_api_buy($in);
        case 'plat_equip': return shop_api_equip($in);
        case 'plat_use': return shop_api_use($in);
        case 'plat_crate': return shop_api_crate($in);
    }
    throw new ApiError('Unknown action.', 404);
}
/* Run $fn($u) in a transaction with the player locked; adds the fresh balance and platform status to the reply. */
function plat_tx(callable $fn): array {
    $u0 = require_user();
    return tx(function () use ($u0, $fn) {
        $u = lock_user((int) $u0['id']);
        plat_profile_row((int) $u['id'], true);
        $out = $fn($u);
        save_user($u);
        $out['bal'] = $u['balance']; $out['ver'] = $u['ver'];
        $out['plat'] = plat_status($u);
        return $out;
    });
}
