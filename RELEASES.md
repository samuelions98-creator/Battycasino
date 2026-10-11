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

## Returns at a glance

Every game's return is proven by its simulation (`tools/<id>-sim.js`). For each game with a server, the browser and PHP
maths are proven identical on seeded rounds (`tools/<id>-xcheck.js`); all eleven parity checks pass on the final build.

- Most games sit in the 96–97% target.
- Above it, by design:
  - Roulette Royale: 97.3%, standard single-zero roulette.
  - Velvet Baccarat: standard paytables, Banker 98.9%.
  - Bat Bandits and Starwing: about 98%, existing maths.
- A hair under 96%: a few Bonkers and Bunky bonus spots, within rounding.
