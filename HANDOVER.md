# Batty Casino: handover notes

Branch: `ccr-566e675f-m94nev` (GitHub: samuelions98-creator/Battycasino)
Status date: 9 October 2026

## 1. What is finished and in the live build

These are all in `Batty-Casino-latest.zip` and on the branch, tested in a browser against a real PHP/MySQL server.

**Structure**
- `index.html` went from 1.2 MB to about 110 KB. Each game now lives in `games/<id>/game.js` + `style.css`, and the shell
  layer is in `core/shell.css`.
- New tables can be added per module in `lib/schema/<name>.php`; `lib/schema.php` merges them. Admin → "Update database"
  creates them.

**Lobby redesign**
- A featured carousel (swipe, auto-advance) and a welcome strip with a greeting, the hourly-bonus progress ring and rescue.
- Sticky filter chips (All / Favourites / New / Live / Slots / Tables & Arcade / High Roller) and search.
- Shelves: Jump back in (recently played), Live Studio, New, Slots, Tables & Arcade, and a velvet High Roller Lounge
  with level-5 locks.
- Favourite hearts and LIVE/NEW/Flagship badges.
- A mobile app-style tab bar (Lobby, Live, Bat Pass*, Shop*, Ranks, Me). *Only appears once those pages exist.
- Games still being built register as "Coming soon" and are hidden from the floor automatically.

**Big-win show**
- Tiered: Big (10×), Mega (25×), Batty (75×), Absolutely Batsh!t (250×). Each tier gets its own slice of the count, with
  colour, sound and effects.
- A progress bar to the next tier, and tap or Space to skip.

**Play settings** (lobby footer)
- Sound, plus an optional reality-check reminder (off / 30 min / 1 h / 2 h; default 1 h) that shows time played and this
  visit's stakes and wins.

**Reconnecting banner** when the server can't be reached.

**Animation upgrades merged** (maths untouched, byte-identical):
- Batty's Moonshot
- Plachinko
- Sugar Fang Bonanza
- Bat Bandits UltraNudge

**Bug fixes**
- **Logout race:** a feed poll in flight during login could overwrite the new session cookie and log the player straight
  back out. Fixed in `current_user()` in `lib/core.php`.
- **Night Crawler achievement:** it required Bat Signal Roulette, which isn't in the lobby, so it was impossible.
  It now ignores hidden games (`BATTY_HIDDEN_GAMES`).
- **Daily missions:** the "play this game" mission now covers every lobby game, and no longer picks the retired roulette.
- **`<head>`:** the `<title>`, fonts and description were inside `<body>`; they're fixed. The service worker is updated
  for the new layout.

**Registered game IDs (placeholders until built)**
- Server and client lists already know: `crypt`, `nighttrain`, `gummy`, `bookofbats`, `derby`, `bonkers`, `vault`,
  `baccarat`, `royale`.
- Each has a placeholder `games/<id>/game.js` (tag "Coming soon", hidden in the lobby) and `lib/games/<id>.php`, which
  returns "opening soon".

## 2. Work in progress (NOT in the live build)

Twenty specialist agents were building these in parallel when we stopped. Their unfinished files are saved under `wip/<area>/` with the
same paths as the site (and in `Batty-Casino-WIP.zip`). Everything there passes `node --check` / `php -l`, but none of it
has been integrated or fully tested, so **do not upload `wip/` to the live site**. It has a deny-all `.htaccess` just in
case.

| Area | State when stopped | What's left |
|---|---|---|
| **Batty Circus rebuild** (`circus-rebuild`) | New maths (`math.js`), reel strips, PHP engine, RTP sim and JS↔PHP parity check written; art module half done | Finish `art.js`, write `game.js` (all scenes: cannon, 5 acts), CSS, switch the `index.html`/`sw.js` circus tags to `games/circus/` |
| **Bunky Time live** (`bunky-live`) | Shared-round server done (`lib/play.php` Bunky section, `lib/games/bunky.php`, `lib/schema/bunky.php`); client live loop done | Live bonus scenes, then two-player test |
| **Bonkers Time** (Crazy Time-style live show) (`bonkers-live`) | Maths, RTP sim, PHP live engine, schema, parity check, main client engine | The four bonus scenes (Coin Flap, Crypt Hunt, Drop Zone, BONKERS TIME), then test |
| **Bat Derby** (`derby-new`) | Server live race flow works end to end, including settling players who left; odds model + sim + parity | The whole presentation (race animation, bet slip) |
| **Roulette Royale** (`royale-highroller`) | Server, schema, parity and RTP checks pass | The presentation (wheel, ball, table, racetrack) |
| **Velvet Baccarat** (`baccarat-highroller`) | Server, schema, shoe, sim and parity done | The client engine and presentation (squeeze, roadmaps) |
| **Night Train** (`nighttrain-new`) | Maths, PHP, client and parity written | RTP tuning (max-win frequency too high), then visual QA |
| **Gummy Bats** (`gummy-new`) | Maths, PHP, sim and parity done | The client game logic/animation |
| **Book of Bats** (`bookofbats-new`) | Maths, PHP, sim and parity done; client JS written | The stylesheet, then QA |
| **Count Batula's Crypt** (`crypt-new`) | Draft maths + sim only | Most of it |
| **Crimson Vault** (`vault-highroller`) | Early PHP engine only | Most of it |
| **Daily Wheel + Bat Pass + Belfry Shop** (`platform-wheel-pass-shop`) | Server: `lib/platform/{core,wheel,pass,shop}.php`, `lib/schema/platform.php`, hooks in `api.php`/`lib/wallet.php`/`lib/social.php`. Client `core/platform.js` partly written | Finish `platform.js` and write `core/platform.css`; add the `<script>`/`<link>`; then test claims, purchases and equip |
| **Olympus / Fishing / Bat Jack animation** | New `game.js` written (maths identical) | Their stylesheets were being rewritten; the new JS does not match the old CSS, so don't drop in the JS alone |
| **Starwing animation** | JS + CSS reworked | A performance problem (very low frame rate) was being bisected |

**Shared-file edits inside `wip/`:** the copies of `lib/play.php`, `lib/wallet.php`, `lib/social.php` and `api.php` are
that agent's full modified versions. Merge them by hand against the current files (the main branch has since changed
`lib/wallet.php` missions and `lib/core.php`); don't overwrite.

## 3. How to continue

- `docs/GAME-BRIEF.md` is the full quality bar, API and rules every game was built to. It covers server-authoritative
  rounds, 96–97% RTP proven by simulation, JS↔PHP parity on seeded RNGs, and fitting 1280×800, 1440×900, 390×844 and
  844×390.
- **Local test setup:**
  - PHP 8 built-in server + MariaDB.
  - `config.php` pointing at a local DB, then `install.php`.
  - `tools/shot.js` (Playwright) logs in and screenshots any `#hash` (`PORT=… USER_NAME=… node tools/shot.js "lobby,circus" out/`).
- **To finish a WIP game:**
  1. Copy its `wip/<area>/…` files into place.
  2. Run its `tools/<id>-sim.js` and `tools/<id>-xcheck.js`.
  3. Finish the client, play it online and in practice mode, then commit.
  4. In admin, press "Update database" once so its tables exist.
- **High Roller rules**, used by `vault`, `baccarat` and `royale`:
  - `section: 'highroller', minLevel: 5`
  - stakes 2,000–250,000
  - the server refuses players below level 5
- **Lobby shelf placement:** use `section` in `registerGame` (`slots`, `live`, `tables`, `arcade`, `highroller`), plus
  `isNew` / `featured`.
- **Feed etiquette:** only set `feedLabel` in round facts for genuinely notable wins; any non-empty label posts to the
  lobby feed.

## 4. Deploying

See `UPLOAD-README.txt`.
1. Back up.
2. Extract `Batty-Casino-latest.zip` over the site root (keep your `config.php`).
3. Admin → Update database.
4. Purge the Cloudflare cache.
