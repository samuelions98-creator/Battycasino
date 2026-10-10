# Batty Casino: release plan

The big update is split into small releases. Each one is self-contained, tested on its own, and has its own small
upload-only zip. Ship them one a day, or one every few days.

Releases are marked by commit on this branch (release 1 = `fdaa5bd`, release 2 = `070a896`, release 3 = `d056236`, release 4 = `e810bdc`, release 3b = `13ef5be`, release 8 = `b24e744`, release 9 = `913d42b`, release 11 = `abcddea`, release 10 = `3a65539`; the remote won't accept git tags, so
create local ones with `git tag release-1 fdaa5bd` and so on). Build the zips for any release with:

    tools/make-release.sh release-<N-1> release-<N> <out-dir>

That produces `release-N-update.zip` (only the files that changed, upload over the live site) and
`release-N-full.zip` (the whole site, for a fresh install or if you skipped one).

After uploading a release that says **DB**, open Admin → "Update database" once. Always purge the Cloudflare cache.

## Shipped

| # | Release | Upload size | DB |
|---|---|---|---|
| 1 | **Lobby + shell.** New lobby (carousel, filters, search, favourites, tab bar), tiered big-win show, play settings, reconnect banner, bug fixes, animation upgrades for Moonshot, Plachinko, Sugar Fang, Bat Bandits | full site | no |
| 2 | **Olympus + Fishing Frenzy animation upgrade** | 114 KB | no |
| 3 | **Starwing animation upgrade** | ~60 KB | no |
| 4 | **Batty Circus rebuilt** (Penguin Cannon, five acts, new art; 96.5% return) | ~120 KB | no |
| 3b | **Bat Jack animation** (live table with Barnaby the croupier: cards fly from the shoe, chips stack and slide; maths unchanged) | 94 KB | no |
| 8 | **Book of Bats** (new slot: expanding-symbol free spins, card gamble; 96.5% return) | 81 KB | no |
| 9 | **Night Train** (new hold-and-win slot; maths retuned to 96.2%, bonus buy 55x, max win about 1 in 50M spins) | 75 KB | no |
| 11 | **Count Batula's Crypt** (new cascading-ways slot: 6 reels up to 117,649 ways, rising multiplier, free spins with a gamble wheel, ante and buy; 96.7% return) | 84 KB | no |
| 10 | **Gummy Bats** (new 7×7 cluster-pays slot: tumbles, multiplier spots, Night Shift free spins, two bonus buys; 96.4% return) | 83 KB | no |

## Still to build (in the suggested order)

Effort: **S** = a short session, **M** = one solid session, **L** = one large session (or two).
"Saved" means what is already written in `wip/` (see HANDOVER.md); the remaining work is what a session needs to do.

| # | Release | Effort | Saved already | Remaining | DB |
|---|---|---|---|---|---|
| 5 | **Bonkers Time** (live Crazy Time-style show) | L | Maths, RTP sim, PHP live engine, tables, parity, client engine | The four bonus scenes, CSS, two-player test | yes |
| 6 | **Daily Wheel + Bat Pass + Belfry Shop** | L | All server code (`lib/platform/*`), tables, partial `core/platform.js` | Finish the client, write `core/platform.css`, hook into lobby/top bar, test purchases | yes |
| 7 | **Bunky Time goes live** (shared wheel that spins on its own) | M | Shared-round server and live client loop | Live bonus scenes, two-player test | yes |
| 12 | **Bat Derby** (live bat racing) | L | Server live race flow, odds model, sim, parity | The presentation | yes |
| 13 | **Roulette Royale** (opens the High Roller Lounge) | L | Server, tables, parity and RTP checks | The presentation | yes |
| 14 | **Velvet Baccarat** | L | Server, tables, shoe, sim, parity | Client and presentation | yes |
| 15 | **Crimson Vault** | L | Early PHP only | Most of it | no |

The High Roller Lounge shelf appears in the lobby automatically as soon as one lounge game (release 13) goes live.
Games that aren't finished stay hidden from the lobby, so a release never exposes half-built work.

## Doing a release cheaply

- **One release per session, one task at a time.** No parallel agent fan-out: that is what used up the usage on the first
  pass.
- Start a session with: *"Do release N from RELEASES.md."* The saved work and `docs/GAME-BRIEF.md` give it everything it
  needs without re-researching.
- For each release the session should: copy the saved files from `wip/` into place, finish the remaining work, run the
  game's `tools/<id>-sim.js` and `tools/<id>-xcheck.js` where they exist, play it online and check for console errors,
  look at two or three screenshots (desktop and phone), then commit, tag and build the zips.
- Keep screenshot loops short. Two or three images per game is enough; endless iteration is the biggest cost.
- A session on a smaller, cheaper model is fine for the S and M releases; keep the strongest model for the L ones.
