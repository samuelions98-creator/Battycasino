<?php
/* The Belfry Shop: cosmetics, boosts, wheel tickets and Mystery Crates, paid for with Batty Bucks only.
   Prices live on the server (plat_catalog) and every purchase is a credit($u, -price, 'shop') ledger row.
   One cosmetic a day is the Deal of the Night at 25% off. Crates hold cosmetics only and never a duplicate. */
if (!defined('BATTY')) { http_response_code(403); exit; }

const SHOP_DEAL_OFF = 0.25;

function shop_deal_id(): string {
    $pool = [];
    foreach (plat_catalog() as $id => $c) if ($c[3] > 0 && in_array($c[0], ['acc', 'frame', 'name', 'title', 'emote', 'effect'], true) && $c[2] !== 'common') $pool[] = $id;
    return $pool[crc32('deal|' . plat_day()) % count($pool)];
}
function shop_price(string $id): int {
    $it = plat_item($id);
    if (!$it || $it['price'] <= 0 || !in_array($it['source'], ['shop', 'any'], true)) return 0;
    if ($id === shop_deal_id()) return (int) (round($it['price'] * (1 - SHOP_DEAL_OFF) / 500) * 500);
    return $it['price'];
}

function shop_api_state(): array {
    $u = require_user();
    $uid = (int) $u['id'];
    $items = [];
    foreach (plat_catalog() as $id => $_) {
        $it = plat_item($id);
        $it['price'] = shop_price($id);
        if ($id === shop_deal_id()) $it['was'] = plat_item($id)['price'];
        $items[] = $it;
    }
    $p = plat_profile_row($uid);
    $boost = $p['boost_until'] ? strtotime($p['boost_until'] . ' UTC') - plat_time() : 0;
    return [
        'items' => $items, 'owned' => (object) plat_inv($uid), 'equipped' => (object) plat_cos_of($p),
        'odds' => ['cr_night' => plat_crate_odds('cr_night'), 'cr_blood' => plat_crate_odds('cr_blood')],
        'deal' => shop_deal_id(), 'dealIn' => plat_secs_to_midnight(), 'boostIn' => max(0, $boost),
    ];
}

function shop_api_buy(array $in): array {
    $id = (string) ($in['item'] ?? '');
    $it = plat_item($id);
    if (!$it) throw new ApiError('Unknown item.');
    $price = shop_price($id);
    if ($price <= 0) throw new ApiError('That one is not for sale. Look for it in the Bat Pass or in crates.');
    $cos = plat_is_cosmetic($it);
    $qty = $cos ? 1 : in_int($in, 'qty', 1, 10);
    return plat_tx(function (array &$u) use ($id, $it, $price, $qty, $cos) {
        if ($cos && plat_qty((int) $u['id'], $id) > 0) throw new ApiError('You already own ' . $it['name'] . '.', 409);
        credit($u, -$price * $qty, 'shop', null, null, $it['name'] . ($qty > 1 ? ' ×' . $qty : ''));
        plat_give($u, $id, $qty, 'shop', 'shop');
        return ['item' => $id, 'qty' => $qty, 'paid' => $price * $qty, 'owned' => (object) plat_inv((int) $u['id'])];
    });
}

/* Equip {item} (owned cosmetic), or unequip {slot}. */
function shop_api_equip(array $in): array {
    $u = require_user();
    $uid = (int) $u['id'];
    $item = $in['item'] ?? null;
    if ($item === null || $item === '') {
        $slot = (string) ($in['slot'] ?? '');
        if (!in_array($slot, PLAT_SLOTS, true)) throw new ApiError('Unknown slot.');
        $val = null;
    } else {
        $it = plat_item((string) $item);
        if (!$it || !plat_is_cosmetic($it)) throw new ApiError('That cannot be worn.');
        if ((int) (qv('SELECT qty FROM plat_inv WHERE user_id = ? AND item = ?', [$uid, $it['id']]) ?? 0) < 1) throw new ApiError('You do not own that yet.', 409);
        $slot = $it['slot']; $val = $it['id'];
    }
    plat_profile_row($uid);
    q("UPDATE plat_profile SET eq_$slot = ?, updated_at = ? WHERE user_id = ?", [$val, now_sql(), $uid]);
    return ['equipped' => (object) plat_cosmetics($uid)];
}

/* Use a consumable boost. */
function shop_api_use(array $in): array {
    $id = (string) ($in['item'] ?? '');
    if (!in_array($id, ['bo_xp1h', 'bo_xp24h', 'bo_tier'], true)) throw new ApiError('That cannot be used here.');
    return plat_tx(function (array &$u) use ($id) {
        $uid = (int) $u['id'];
        plat_take($uid, $id);
        $msg = '';
        if ($id === 'bo_tier') { pass_add_xp($u, PASS_TIER_XP, 'skip'); $msg = '+1,000 Bat Pass XP'; }
        else {
            $p = plat_profile_row($uid, true);
            $from = max(plat_time(), $p['boost_until'] ? strtotime($p['boost_until'] . ' UTC') : 0);
            $until = $from + ($id === 'bo_xp1h' ? 3600 : 86400);
            q('UPDATE plat_profile SET boost_until = ?, updated_at = ? WHERE user_id = ?', [plat_sql_time($until), now_sql(), $uid]);
            $msg = 'Double Pass XP is on';
        }
        return ['used' => $id, 'msg' => $msg, 'owned' => (object) plat_inv($uid)];
    });
}

/* ---------- Mystery Crates ---------- */
function shop_crate_pool(int $uid, string $rarity): array {
    $owned = plat_inv($uid); $out = [];
    foreach (plat_catalog() as $id => $c) {
        if ($c[2] !== $rarity || !in_array($c[5], ['any', 'crate'], true) || !in_array($c[0], ['acc', 'frame', 'name', 'title', 'emote', 'effect'], true)) continue;
        if (!isset($owned[$id])) $out[] = $id;
    }
    return $out;
}
/* Open {item: cr_night|cr_blood}. Uses one you own, or buys one when {buy: true}. */
function shop_api_crate(array $in): array {
    $crate = (string) ($in['item'] ?? '');
    if (!in_array($crate, ['cr_night', 'cr_blood'], true)) throw new ApiError('Unknown crate.');
    $buy = !empty($in['buy']);
    return plat_tx(function (array &$u) use ($crate, $buy) {
        $uid = (int) $u['id'];
        $odds = plat_crate_odds($crate);
        $rars = array_keys($odds);
        $any = false; foreach ($rars as $r) if (shop_crate_pool($uid, $r)) $any = true;
        if (!$any) throw new ApiError('You already own every cosmetic this crate can hold. Nothing was spent.', 409);
        if (plat_qty($uid, $crate) > 0) plat_take($uid, $crate);
        elseif ($buy) credit($u, -shop_price($crate), 'shop', null, null, plat_item($crate)['name']);
        else throw new ApiError('You do not have one of those crates.', 409);
        /* roll the rarity on the published odds */
        $rng = batty_rng(); $x = $rng() * 100; $rolled = end($rars);
        foreach ($odds as $r => $pct) { $x -= $pct; if ($x < 0) { $rolled = $r; break; } }
        /* no duplicates: if that rarity is complete, step to the nearest rarity in this crate (higher first on a tie) */
        $idx = array_search($rolled, $rars, true); $got = null; $gotR = $rolled;
        for ($d = 0; $d < count($rars) && !$got; $d++) {
            foreach ([$idx + $d, $idx - $d] as $j) {
                if ($j < 0 || $j >= count($rars)) continue;
                $pool = shop_crate_pool($uid, $rars[$j]);
                if ($pool) { $got = $pool[random_int(0, count($pool) - 1)]; $gotR = $rars[$j]; break; }
            }
        }
        plat_give($u, $got, 1, 'crate', 'shop');
        q('INSERT INTO plat_crate_log (user_id, crate, item, rarity, created_at) VALUES (?,?,?,?,?)', [$uid, $crate, $got, $gotR, now_sql()]);
        return ['crate' => $crate, 'item' => plat_item($got), 'rolled' => $rolled, 'rarity' => $gotR, 'owned' => (object) plat_inv($uid)];
    });
}
