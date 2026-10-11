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

## Loose ends cleaned up (final build)

- Batty Circus: the cannon's COLLECT/RETRY choice is replaced by the ringmaster's automatic second shot, so the 96.5%
  return no longer depends on playing well (always collecting used to return about 90%). Bought shots follow the same
  rule; SPOTLIGHT re-priced from 175× to 168×.
- Starwing and Bat Bandits paytables trimmed into the 96–97% band (40,000,000-spin simulations; browser and server
  identical).
- The Book of Bats explorer is now "Professor Flaps".
- Practice mode no longer shows the "Reconnecting to the casino…" banner.
- Velvet Baccarat's lock screen was already consistent with the other lounge games (checked).
