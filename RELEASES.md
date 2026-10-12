# Batty Casino: releases

The big update is finished. It went out as a series of small releases. Each was self-contained, tested on its own, and
had its own upload-only zip. They are all now rolled into one **full build**.

## The full build (recommended)

`Batty-Casino-full-build.zip` is the whole site at the final commit on this branch (tag `final-build` locally). Install
it as described in `UPLOAD-README.txt`:
1. Back up your files and database.
2. Extract the zip over the site root, keeping your `config.php`.
3. Open Admin → **"Update database"** once.
4. Purge the Cloudflare cache.

"Update database" is required. Releases 5, 6, 7, 12, 13 and 14 add tables: the live games, the High Roller tables, and
the Daily Wheel / Bat Pass / Shop. It never deletes or changes data.

To rebuild it: `git archive --format=zip -o Batty-Casino-full-build.zip HEAD -- . ':!wip' ':!docs' ':!tools' ':!.gitignore'
':!README.md' ':!HANDOVER.md' ':!RELEASES.md'` (this is what `tools/make-release.sh` does for its `-full.zip`).

## Release history

Each release is marked by a commit on this branch. The remote won't accept git tags, so create local ones with, for
example, `git tag release-1 fdaa5bd`. Then `tools/make-release.sh release-<prev> release-<N> <out-dir>` builds the
upload-only zip for any one release.

| # | Release | Commit | Upload size | DB |
|---|---|---|---|---|
| 1 | **Lobby + shell.** New lobby (carousel, filters, search, favourites, tab bar), tiered big-win show, play settings, reconnect banner, bug fixes, animation upgrades for Moonshot, Plachinko, Sugar Fang, Bat Bandits | `fdaa5bd` | full site | no |
| 2 | **Olympus + Fishing Frenzy animation upgrade** | `070a896` | 114 KB | no |
| 3 | **Starwing animation upgrade** | `d056236` | ~60 KB | no |
| 4 | **Batty Circus rebuilt** (Penguin Cannon, five acts, new art; 96.5% return) | `e810bdc` | ~120 KB | no |
| 3b | **Bat Jack animation** (live table with Barnaby the croupier: cards fly from the shoe, chips stack and slide; maths unchanged) | `13ef5be` | 94 KB | no |
| 8 | **Book of Bats** (new slot: expanding-symbol free spins, card gamble; 96.5%) | `b24e744` | 81 KB | no |
| 9 | **Night Train** (new hold-and-win slot; maths retuned to 96.2%, bonus buy 55×, max win about 1 in 50M spins) | `913d42b` | 75 KB | no |
| 11 | **Count Batula's Crypt** (cascading-ways slot: 6 reels up to 117,649 ways, rising multiplier, free spins with a gamble wheel, ante and buy; 96.7%) | `abcddea` | 84 KB | no |
| 10 | **Gummy Bats** (7×7 cluster-pays slot: tumbles, multiplier spots, Night Shift free spins, two bonus buys; 96.4%) | `3a65539` | 83 KB | no |
| 13 | **Roulette Royale** (live European roulette with racetrack; opens the High Roller Lounge, level 5+; 97.3%) + lobby feed fix for big stakes | `0bb3830` | 86 KB | **yes** |
| 14 | **Velvet Baccarat** (live High Roller baccarat: card squeeze, five roadmaps, pairs and dragon side bets; level 5+; standard paytables, Banker 98.9%) | `6469b58` | 92 KB | **yes** |
| 12 | **Bat Derby** (live bat racing: race card, win/each-way/forecast/tricast, animated races with photo finish; 96.0% every bet) | `62f1bef` | 95 KB | **yes** |
| 5 | **Bonkers Time** (live game show: money wheel, Top Slot, Coin Flap, Crypt Hunt, Drop Zone and BONKERS TIME bonus scenes; 96.0% every spot) | `ac51ca9` | 93 KB | **yes** |
| 6 | **Daily Wheel + Bat Pass + Belfry Shop** (daily prize wheel with streaks, Premium Wheel, 50-tier season pass, cosmetics shop and Locker; Gold track rebalanced so it can't be bought for profit) | `99fd1ef` | 113 KB | **yes** |
| 7 | **Bunky Time goes live** (one shared wheel on a clock: live betting, players rail, live bonus scenes; fixes a result leak in the saved server; 96.0%) | `19d7393` | 111 KB | **yes** |
| 15 | **Crimson Vault** (High Roller heist slot: 5×4, 20 lines, pick-your-vault free spins, 100× and 300× buys; level 5+; 96.7%) | `39bcff9` | 81 KB | no |
| QA | **Final QA and polish** (Bat Derby leaderboard, Bonkers Time frame rate, lobby carousel and big-win show on phones, top bar at 390px, service-worker precache for every game, Live filter lists every live table, Sugar Fang timer fix) | `8370e18` | — | no |
| 16 | **Unlimited bets** (bet any amount up to your balance in every game: tap a stake to type one or pick MAX; the top chip on every table is yours to set; no table limits; level rewards stop growing at level 100) | see branch | ~150 KB | **yes** (recommended) |
| 16a | **Top-up fix** ("Finish your current round first" no longer locks players out: unfinished Circus shows and every other left-behind round are settled automatically, and the top-up then goes through) | see branch | small | no |
| 21 | **Crypt Sweeper** (new arcade game: flip crystals on a 5×5 crypt floor, choose 1 to 24 skulls, cash out any time; 96.5% whatever you choose) | see branch | ~40 KB | no |
| 20 | **Happy Hour events + bug fixes** (timed site-wide events started from Admin: extra payouts, jackpots hitting more often, double Bat Pass XP, with a lobby banner and a countdown in the top bar; fixes the Leaderboards page failing to load and the Batty Cup board showing raw code) | see branch | ~20 KB | no |
| 19 | **Adjustable return to player** (new Admin panel: a Return Boost that pays extra % of every stake back in all slots, arcade and live games, plus editable target returns for the nine self-balancing games) | see branch | ~25 KB | no |
| 18 | **Batty Jackpots + a better-paying Echo Chamber** (four progressive pools fed by every bet in every game; Echo Chamber now returns up to 98% with 15 levels and a 25.2× top prize) | see branch | ~40 KB | **yes** |
| 17 | **Batty Cup + Echo Chamber** (a weekly tournament ranked by best single-round multiplier, with prizes for the top ten; and a memory skill game) | see branch | ~60 KB | **yes** |

## Returns at a glance

Every game's return is proven by its simulation (`tools/<id>-sim.js`). For each game with a server, the browser and PHP
maths are proven identical on seeded rounds (`tools/<id>-xcheck.js`, plus `tools/paytable-xcheck.js` for Starwing and Bat
Bandits); every parity check passes on the final build.

- Every slot and game show sits in the 96–97% band:
  - Batty Circus: 96.5% base for every player (the ringmaster's second shot is automatic); GRAND 96.0%, SPOTLIGHT 96.0% at 168×.
  - Starwing: 96.5% (paytable trimmed from 98.3%).
  - Bat Bandits: 96.9% base and 96.2% Bonus Buy (paytable trimmed from 98.4% / 97.7%).
- Table games keep standard returns: Roulette Royale 97.3%, Velvet Baccarat Banker 98.9%.
- A hair under 96%: a few Bonkers and Bunky bonus spots, within rounding.
- The live balancer (`lib/rtp.php`) now targets **96.5%** for every game, matching the designs (it was 98%). Override one
  game with the settings key `rtp_<game>`.

## Unlimited bets (release 16)

Players can bet as much as they like, up to their balance, in every game.

- **Slots, Plachinko, Moonshot:** tap the stake to type any amount ("250k", "2.5m", "1,000,000") or use Min, ½, ×2, ×10 or
  MAX. The − / + buttons step through a ladder that now runs on past 10,000 up to 1,000,000,000.
- **Tables and live games** (Royale, Baccarat, Bat Jack, Bonkers, Bunky, Bat Derby): the top chip is yours to set. Tap it
  again to give it any value. Table and spot limits are gone.
- **The one ceiling** is 1,000,000,000 BB on a single bet (or on one table round). It is technical: it keeps the biggest
  wins exactly representable in the browser. Steps: 20 BB for slots, Plachinko and Derby; 100 BB for Moonshot and Crimson
  Vault; 10 BB for Bat Jack, Bonkers and Bunky; 1,000 BB for Royale and Baccarat (from 2,000).
- **Guards against giant bets:**
  - **Rewards that grow with level stop growing at level 100.** That covers level-up gifts, the hourly bonus, the Daily
    Wheel, and mission and Bat Pass challenge tiers. Levels themselves still climb.
  - A bet that climbs many levels pays one combined gift with one notice.
  - Bat Pass XP counts at most 100,000 BB of any one bet.
  - The live balancer counts at most 100,000 BB of any one round in its recent window.
- **Database:** "Update database" widens the Bat Jack and Bat Derby bet columns to BIGINT. Run it after uploading (the
  site works before it, but run it anyway).
- Maths unchanged: every parity check still passes. Baccarat now also accepts a 3,000 BB spot (whole thousands from
  2,000), on both browser and server.

## Batty Cup and Echo Chamber (release 17)

- **The Batty Cup** (`#cup`, a tile in the lobby): every week (Monday to Sunday, UK time) players are ranked by their best
  single round as a multiple of the stake, so a 100 BB stake can beat a 1,000,000 BB one. Stakes of 100 BB or more count;
  the table games are excluded. The server records scores from the round's own result. The top ten win 250,000 /
  120,000 / 60,000 / 30,000 / 20,000 / 15,000 / 12,000 / 10,000 / 8,000 / 5,000 BB, paid automatically the first time
  anyone opens the Cup after the week ends (each prize is guarded by a primary key, so it is paid exactly once).
  Prizes are `CUP_PRIZES` in `lib/platform/cup.php`.
- **Echo Chamber** (Arcade shelf): a memory game. Repeat a growing pattern on four crystals (3 to 14 notes, 12 levels). An
  echo-storm can knock the bat down after any correct level, and after each level you choose to cash out or fly on. The
  multiplier for each level is 96 divided by the chance of getting that far, rounded down, so perfect memory returns at
  most 96% whatever you decide and every slip returns less (proved by `tools/echo-xcheck.js`, which also proves browser
  and server identical). Leaving mid-game: a banked win is paid, a half-played pattern is lost (refunded at level 1).
- "Update database" adds the Cup tables.

## Batty Jackpots and a better-paying Echo Chamber (release 18)

- **Batty Jackpots:** Mini, Minor, Major and Grand pools shared by everyone, in every game. Any round with a stake of 100 BB or
  more feeds them and has a chance to win one (the stake counts up to 100,000 BB, so one giant bet cannot drain the pools).
  A win pays the whole pool, which restarts from its seed (800 / 6,000 / 40,000 / 500,000). Together they return about 2.5%
  of counted stakes on top of each game's own return (Mini 1.0%, Minor 0.7%, Major 0.5%, Grand 0.3%). Shown as a strip in
  the lobby and a chip in every game's top bar; a win gets a full-screen celebration and a feed entry. Tuning is in
  `JP_TIERS` in `lib/platform/jackpot.php`; the setting `jp_scale` (default 1) divides every hit interval, so 10 makes wins
  ten times as frequent (for promotions or testing). Jackpot wins are never counted as game wins, so the live balancer is
  unaffected. "Update database" adds the tables and seeds the pools.
- **Echo Chamber pays better:** perfect memory now returns up to 98% (was 96%), the ladder is 15 levels (was 12) with a
  25.20× top prize (was 12.43×), and the early storms are gentler. `tools/echo-xcheck.js` proves no strategy beats 98%.

## Adjustable return to player (release 19)

Admin → **Return to player**:
- **Return boost** (default 0.5 points, max 3): this share of every stake is paid back automatically, in every slot, arcade
  game and live show (not Bat Jack, Baccarat or Roulette Royale, whose own return is already near 100%). It counts the stake
  up to 100,000 BB, is paid as a separate ledger entry ("boost") and is never counted as a game win. Settings key `rtp_boost`.
- **Balanced games' target return** (default 96.5%, settings key `rtp_default`, or one game's own `rtp_<game>`): Bat Jack,
  Sugar Fang, Book of Bats, the Crypt, Gummy Bats, Night Train, Starwing, Bat Bandits and Crimson Vault steer their own return
  toward it by redrawing some outcomes, so raising it makes them pay more, gradually.
- The table shows each game's target, recent and lifetime return, and an estimated total (game + boost + about 2.5 points of
  Batty Jackpots), in red at 100% or more. Keep the total under 100% or players can grow their Batty Bucks without limit.
  Fixed-maths games (Olympus, Fishing Frenzy, Plachinko, Moonshot, Circus and the live shows) are raised with the boost.

## Crypt Sweeper (release 21)

A new Arcade game. A 5×5 crypt floor hides 1 to 24 skulls (the player's choice); every other slab hides a crystal. Flip slabs one
at a time: each crystal raises the multiplier, a skull ends the round, and the player can cash out at any point. The multiplier
after k crystals is `floor(193 × C(25,k) / (2 × C(25−skulls,k)))` hundredths, i.e. 96.5 ÷ the chance of surviving k flips, so the
expected return is at most 96.5% whenever the player stops and however many skulls they choose (proved by `tools/mines-xcheck.js`,
which also proves browser and server identical on seeded placements). A round that would pass 10,000× is paid at that cap and
ends. Skull positions are drawn by the server when the round starts and stay hidden. Leaving mid-round pays the banked crystals;
an untouched board is refunded. Practice mode runs the same maths in the browser. Return boost, jackpots and Happy Hour apply as
in every other game.

## Happy Hour events and fixes (release 20)

- **Happy Hour** (Admin → Return to player → Happy Hour events): start a timed, site-wide event with one tap. Presets: Happy Hour
  (+1 point of Return Boost, jackpots ×3, Bat Pass XP ×2, 60 min), Jackpot Frenzy (jackpots ×10, 30 min), Double XP (XP ×2,
  120 min) and Payday (+2 points of boost, 30 min). Every player sees a banner in the lobby and a countdown chip in the top
  bar; it ends by itself and can be stopped early. The Admin boost box edits only the permanent setting. Presets are
  `HAPPY_PRESETS` in `lib/platform/happy.php`; the running event is the `happy` setting.
- **Fixed:** the Leaderboards page showed "This page failed to load" (a variable I used was not visible there; introduced in
  release 17), and the Batty Cup board printed prize amounts as raw code.

## Loose ends cleaned up (final build)

- Batty Circus: the cannon's COLLECT/RETRY choice is replaced by the ringmaster's automatic second shot, so the 96.5%
  return no longer depends on playing well (always collecting used to return about 90%). Bought shots follow the same
  rule; SPOTLIGHT re-priced from 175× to 168×.
- Starwing and Bat Bandits paytables trimmed into the 96–97% band (40,000,000-spin simulations; browser and server
  identical).
- The Book of Bats explorer is now "Professor Flaps".
- Practice mode no longer shows the "Reconnecting to the casino…" banner.
- Velvet Baccarat's lock screen was already consistent with the other lounge games (checked).
