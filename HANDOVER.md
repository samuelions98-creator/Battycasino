# Batty Casino: handover notes

Branch: `ccr-566e675f-m94nev` (GitHub: samuelions98-creator/Battycasino)
Status date: 11 October 2026. **The big update is complete.** Every game is built, tested online and in practice mode,
and rolled into one full build (see `RELEASES.md` for the release history and `UPLOAD-README.txt` to deploy).
There is no work in progress: `wip/` holds only its deny-all `.htaccess`.

## 1. What's in the build

### Games (19)
| Game | Kind | Shelf | Return |
|---|---|---|---|
| Batty's Moonshot | crash, live | Live | existing |
| Plachinko | pachinko | Arcade | existing |
| Sugar Fang Bonanza, Bat Bandits UltraNudge, Raging Cocks of Olympus 2, Fishing Frenzy, Starwing | slots | Slots | existing (animation upgrades only) |
| Batty Circus | slot, rebuilt | Slots (featured) | 96.5% |
| Book of Bats | expanding-symbol slot + gamble | Slots | 96.5% |
| Night Train | hold & win slot + buy | Slots (featured) | 96.2% |
| Gummy Bats | 7×7 cluster pays + two buys | Slots | 96.4% |
| Count Batula's Crypt | cascading ways, ante, buy, gamble wheel | Slots (featured) | 96.7% |
| Bat Jack | live blackjack table (Barnaby) | Tables | 97.9% with Bat Advice |
| Bunky Time | live wheel show | Live (featured) | 96.0% |
| Bonkers Time | live game show, four bonus scenes | Live (featured) | 96.0% |
| Bat Derby | live bat racing | Arcade | 96.0% |
| Roulette Royale | live European roulette | High Roller (level 5+) | 97.3% |
| Velvet Baccarat | live baccarat, squeeze, roadmaps | High Roller (level 5+) | Banker 98.9% |
| Crimson Vault | heist slot, pick-your-vault | High Roller (level 5+) | 96.7% |

The lobby's **Live** filter lists every shared live game: the Live Studio shelf plus Bat Jack, Bat Derby, Royale and
Baccarat (`LIVE_SHARED` in `index.html`).

### Platform
- **Daily Wheel:** a free daily spin with a 7-day streak multiplier. The Premium Wheel costs 25,000 BB and takes money
  out of the economy.
- **Bat Pass:** 50 tiers a season. The Free track pays 122,500 BB. The Gold track costs 250,000 BB and pays 225,000 BB
  plus cosmetics and perks, deliberately under its price.
- **Belfry Shop:** frames, accessories, name styles and effects, plus crates and a Locker; equipped items show on avatars.
- Server code: `lib/platform/*` and `lib/schema/platform.php`. Client: `core/platform.js` and `core/platform.css`.
- `plat_safe()` keeps `me` and every game round working even before "Update database" has run.

### Shell
- **Lobby:** carousel, filters, search, favourites and shelves, with a velvet High Roller Lounge that has level-5 locks.
- **Mobile tab bar:** Lobby, Live, Bat Pass, Shop, Ranks, Me.
- **Big-win show:** tiered, at 10×, 25×, 75× and 250×.
- **Play settings:** sound and a reality-check reminder.
- **Reconnect banner** when the server can't be reached.
- **Service worker** (`sw.js`): precaches every game file at the exact `?v=` tag `index.html` requests. **When you change
  a game, bump its `?v=` in both `index.html` and `sw.js`, and bump `V` at the top of `sw.js`.**

## 2. How the games are built

The full rules are in `docs/GAME-BRIEF.md`. In short:

**Structure**
- Each game is `games/<id>/game.js` + `style.css`, and its server is `lib/games/<id>.php`.
- `game.js` starts with the pure maths (a UMD export to `BattyMath.<id>`), then a `/* ===== <id> ===== */` marker, then
  the presentation. The sim and xcheck tools load the file up to the marker.

**Rounds and maths**
- Rounds are server-authoritative.
- Practice mode, used when `api.php` doesn't answer, runs the same maths in the browser.
- `tools/<id>-sim.js` proves the return; `tools/<id>-xcheck.js` (+ `.php`) proves the JS and PHP give identical results
  on seeded rounds. Run them after any maths change; all eleven pass on the final build.

**Held rounds**
- Games that hold a round open between requests are settled in `lib/play.php`, in `resolve_open` and `resolve_stale`:
  Book of Bats (gamble), Crypt (free-spin offer), Crimson Vault (vault pick), Bat Jack and Bunky.
- The live games settle players who have left from other players' polls.

**Live games**
- They follow a server clock. Everything on screen is computed from round data plus the clock, so every viewer sees the
  same thing and a reload resumes mid-round.
- Bonkers and Bunky have a test-only `op:'devforce'`. It only exists on PHP's built-in server from localhost, never on
  the real site.

**High Roller games**
- `section: 'highroller', minLevel: 5`, stakes 2,000–250,000.
- The server refuses players below level 5; the page shows a lock screen.

**Lobby feed**
- A win posts when it is ≥25× and ≥2,500 BB, or ≥50,000 BB and ≥5× the stake (`after_round` in `lib/wallet.php`).
- Games set `feedLabel` only for genuinely notable wins (about 100× or more).

**Dev hooks**
- Practice mode only, with `localStorage['batty-dev'] = '1'`.
- For example: `window.crDev`, `window.ntDev`, `window.bobDev`, `window.vtDev`, `window.__royaleDev`,
  `window.__baccaratDev`, `window.__derbyDev`, `window.__bonkersDev` and `window.__batjackDev`.

## 3. Local test setup

- PHP 8 built-in server + MariaDB; `config.php` pointing at a local DB, then `install.php`, then Admin → Update database.
- `tools/shot.js` (Playwright) logs in and screenshots any `#hash`:
  `PORT=… USER_NAME=… node tools/shot.js "lobby,circus" out/`.
- To test High Roller games, raise a test user's `level` to 5+ in the `users` table.
- Logins are rate-limited per IP (the `attempts` table). Clear it locally if a test script gets locked out.
- Practice mode can be tested by routing `api.php` to a 404 (hide the `.bc-net` offline banner in screenshots).

## 4. Known notes and possible next steps

- **Bonkers Time frame rate:** the wheel runs at about 45–50 fps in headless software rendering. It should be fine on
  real devices, but is worth a look on a low-end phone.
- **Practice-mode High Roller lock:** Velvet Baccarat goes back to the lobby when a player below level 5 opens it,
  while Royale and Vault show a lock card. Harmless, but inconsistent.
- **Returns outside 96–97%:** Bat Bandits and Starwing quote about 98% (existing maths). Royale and Baccarat use standard
  table-game returns.
- **"Indiana Bats":** a Book of Bats symbol and feed label are named after a film-character pun; rename it if you want.
- **Bat Pass extra queries:** the hook adds about 6–8 queries per round. Fine for current traffic.

## 5. Deploying

See `UPLOAD-README.txt`:
1. Back up.
2. Extract the full-build zip over the site root, keeping `config.php`.
3. Admin → Update database.
4. Purge the Cloudflare cache.
