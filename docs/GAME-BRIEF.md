# Batty Casino: shared brief for game agents

Batty Casino is a free-to-play social casino. It uses virtual "Batty Bucks" (BB) with no cash value. It is a static
front end (`index.html` + per-game JS/CSS) plus a PHP/MySQL back end (`api.php`, `lib/`). The owner wants every
game to look and feel like the very best, most technical slots on William Hill. That means Pragmatic Play, Big Time
Gaming, Red Tiger, Push Gaming, Relax Gaming, NetEnt and Hacksaw quality. Their words: **"fully animated, 0 compromises"**.

## Repository layout (after the split)

- `index.html`: shell only. Core CSS is inline. The core JS (`window.Batty`) and the online features (lobby, missions,
  leaderboards, profiles, admin) are inline. Then one `<link>`/`<script>` per game. **Do not edit it.**
- `games/<id>/game.js` and `games/<id>/style.css`: one game each. Most files hold the game's maths IIFE first
  (`/* ===== <id> math ===== */`), then its presentation IIFE (`/* ===== <id> ===== */`).
- `lib/games/<id>.php`: the server engine for that game (`play_<id>(array &$u, string $op, array $in): array`).
- `lib/gamedata.json`: strips and paytables shared by some older games (exported from the JS). **Do not edit it.**
- `lib/play.php`, `lib/wallet.php`, `lib/core.php`, `lib/social.php`, `lib/rtp.php`, `api.php`, `sw.js`: shared. **Do not edit.**
  If you believe a shared change is essential, describe it precisely in your final report instead.
- `games/circus` / `circus/`: Batty Circus. Out of bounds: the lead developer is rebuilding it.

## The client API (`window.Batty`, passed to `mount(root, B)`)

- `Batty.registerGame({ id, name, tagline, tag, poster, rules, mount(root, B), unmount() })`.
  - `poster` is an SVG/HTML string for the lobby card, roughly 300×380 portrait art plus a title.
  - `rules` is a string or a function returning HTML. It is shown in a modal from the ⓘ button in the top bar.
  - The shell gives the game `<div class="g-<id>">` inside `<main class="bc-stage">`, under a 56px sticky top bar
    (`--bar-h`). Every CSS rule must be scoped under `.g-<id>`.
- `B.scope()` returns timers, rafs and listeners that die together. Use `timeout`, `interval`, `sleep`, `raf`,
  `loop(fn(dt,t))`, `on(target, ev, fn)` and `dispose()`. Use it for everything so leaving the game cleans up.
- Wallet:
  - `B.wallet.bet(id, amount)` returns false if the player can't afford it; then call `B.ui.broke()`.
  - `B.wallet.win(id, amount, {silent:true})` banks a win without moving the display. Then call `B.wallet.sync()`
    to reveal it when the animation reaches that point.
  - `B.wallet.unbet(amount)` hands a stake back.
- Server:
  - `B.online` is true when the site is online. In that case every outcome must come from the server.
  - `await B.play(gameId, op, data, cost)` calls `api.php {a:'play', game, op, ...}` and returns the reply, or null
    (it already toasted the error). Pass `cost` as the stake you booked with `wallet.bet`.
  - Offline ("practice mode") uses the client-side maths with `B.rng` (crypto-backed, in [0,1)).
- UI:
  - `B.ui.toast(msg)`, `B.ui.modal(title, html|node)`, `B.ui.countUp(el, from, to, ms, fmt)`.
  - `B.ui.stake(container, {id, stakes, label, onChange})` is the standard stake stepper. `B.STAKES` is
    `[20,40,100,200,400,1000,2000,5000,10000]`, the server's `STAKE_LADDER`.
  - `B.ui.celebrate({amount, bet, title?})` is the shared full-screen big-win show for wins of 10× stake or more.
    The lead is upgrading it to tiered Big/Mega/Epic/Max, so always call it for big wins rather than rolling your own
    global overlay. In-game win presentations on top of it are welcome.
- FX and sound:
  - `B.fx.burst({el|x,y, kind:'coin'|'spark'|'confetti', count, power})` and `B.fx.rain(kind, ms)` draw on a
    full-screen canvas.
  - `B.sfx(name)` plays a shared sound. `B.audio.tone({f,f2,d,type,v,t})`, `B.audio.noise({...})` and
    `B.audio.seq(notes,{step,type,v})` synthesise sound. There are no audio files: all sound is WebAudio synthesis.
    Games build their own sound kits; see `games/bunky/game.js`'s "Bunky's own kit".
- Helpers: `B.h(tag, attrs, ...kids)` is a tiny DOM builder. `B.fmt(n)` and `B.fmtX(x)` format numbers.
  `B.batSvg()` returns the bat glyph.

Good references to read first:
- `games/starwing/game.js` with `lib/games/starwing.php`: a compact one-request slot.
- `games/olympus/game.js`: a rich hold-and-win, with buy menu, turbo, auto and skip.
- `games/fishing/game.js` with `play_fishing` in `lib/play.php`: a two-step round, where a pick is resolved on the
  server after the choice.

## Server rules (the server decides everything)

- In `play_<id>`: validate everything with `stake_of($in, STAKE_LADDER)` and `in_int(...)`, and check the balance.
  Draw with `batty_rng()`. Then use either:
  - `round_quick($u, $id, $cost, $win, $facts)` for a one-shot round. Wrap its draw in
    `rtp_pick($id, $cost, fn() => [$outcome, $winBB])` for live RTP balancing.
  - `round_open(...)` / `round_save_data(...)` / `round_close(...)` for multi-step rounds with player choices.
    Never send hidden values before the choice. Support an `op:'state'` resume when the page reloads mid-feature.
- `$facts` may include:
  - `'bonus' => 1` when a feature triggered (feeds missions and achievements).
  - `'feedLabel' => '...'`, a short label for the lobby big-wins feed.
  - `'x'`, `'bigWin'` and `'rounds'` (see `after_round` in `lib/wallet.php`).
- Maths must be deterministic given the RNG sequence. The JS maths and the PHP port must produce identical results
  from the same seeded RNG. `batty_mulberry($seed)` in `lib/rng.php` matches the JS mulberry32 used in
  `games/fishing/game.js`.
  - Prove parity with a cross-check script in `tools/<id>-xcheck.js` (+ php). Run, say, 20,000 seeded rounds in both
    and diff the JSON.
- RTP: design the base maths to return **96.0–97.0%** and prove it.
  - Use a simulation of at least 10 million rounds, or an exact computation, written as `tools/<id>-sim.js`.
  - State the measured RTP, hit rate and max win in the rules panel.
  - Every game has a max-win cap. Wins are integers of BB, rounded down.

## Presentation quality bar (this is the point of the job)

Benchmark against the best: Gates of Olympus, Sweet Bonanza, Bonanza Megaways, Money Train 3, Wanted Dead or a Wild,
Big Bass, Book of Dead, Reactoonz and Red Tiger's Wild Circus. Every one of these must be present and polished:

- **Reel motion:** a proper spin-up with a slight back-kick, motion blur while spinning, a staggered stop with
  overshoot/bounce, and a thud plus a small dust/spark per reel stop. Add slam-stop: tap or Space during a spin
  stops the reels at once, and taps skip any long presentation.
- **Anticipation:** when a feature is one symbol away, later reels slow down, glow, shake slightly, and a rising tone
  plays.
- **Symbol animation:**
  - Every symbol has an idle state.
  - Every winning symbol has a distinct win animation. Characters should blink, wink, bounce or flap; gems should
    sparkle; letters should shine.
  - Hand-built SVG art with gradients, highlights, rim light and drop shadows. No emoji, no plain text tiles.
- **Wins:**
  - Win lines or cluster outlines drawn over the reels, and per-line/per-cluster amounts.
  - The total win counts up with a ticking sound.
  - Tiered win sizes, and a coin shower or confetti for big ones.
  - `B.ui.celebrate` for 10× or more.
- **Features:**
  - A cinematic intro (title card, transition, the scene changes).
  - Distinct feature visuals and a persistent counter HUD (spins left, multiplier, total).
  - A proper outro summary screen: "You won X in N spins".
- **World:**
  - An animated background scene (parallax layers, ambient particles, characters that idle). It must react to wins
    and features, for example lights flashing or the crowd cheering.
- **UI:**
  - Large spin button with spin/stop states.
  - Stake stepper, turbo, autoplay (with a count menu and stop), win display, message/status bar, and an info button
    (the top bar already has ⓘ).
  - Keyboard: Space spins.
  - Buttons give press feedback.
- **Responsive:** the whole game must fit without page scroll at 1280×800 and 1440×900 desktop, at 390×844 portrait
  phone, and at 844×390 landscape phone. Use container-relative sizing (CSS `min()`/`clamp()`/aspect-ratio, or measure
  and scale).
- **Performance:**
  - Prefer CSS transforms and opacity, canvas for particles, and `will-change` sparingly.
  - No layout thrash in animation loops.
  - Must stay smooth on a mid-range phone.
- **Accessibility:**
  - Respect `prefers-reduced-motion` with shorter, simpler animations (functionality stays).
  - Buttons need labels, and the status text goes in an `aria-live` region.
- **Originality:**
  - All art is original vector work drawn in code: SVG, CSS and canvas.
  - No external images, fonts beyond those already loaded (Titan One, Figtree, Chakra Petch, Monoton, Bungee,
    Cinzel, Cinzel Decorative, Lilita One, Dela Gothic One, Audiowide, Bowlby One, Bebas Neue), or libraries.
  - No trademarked names in the UI. Don't write "Megaways", "Money Train", "Book of Dead", "Sugar Rush",
    "Reactoonz", "Red Tiger" or "Pragmatic". Describe mechanics generically ("117,649 ways", "hold and win").
- **Theme:** everything lives in the Batty Casino world of bats, the moon and night. It is cheeky, colourful and
  British. Use British English in all text.
- **Copy:** every game ends rules text with the standard line about Batty Bucks having no cash value.

## Running and testing locally

- MariaDB is already running locally (db `batty`, user `batty`/`batty`, on 127.0.0.1:3306).
  - If `mysqladmin ping` fails, restart it with
    `(mariadbd --user=root --datadir=/var/lib/mysql >/dev/null 2>&1 &)`.
- You work in a git worktree. Copy the config in: `cp /home/user/Battycasino/config.php <your-worktree>/config.php`.
  It is git-ignored; never commit it.
- Serve your worktree on YOUR port (given in your task):
  `(php -S 127.0.0.1:<PORT> -t <your-worktree> >/dev/null 2>&1 &)`.
- Your test account is `<your user>` / `secret1`, with 50,000,000 BB.
- Screenshot harness:
  `NODE_PATH=$(npm root -g) PORT=<PORT> USER_NAME=<your user> node tools/shot.js "<hash>,<hash>" <outdir>`
  - Env: `MOBILE=1` for a 390×844 touch device, `VW`/`VH` for a custom viewport, `WAIT=ms`, `SUF=-name` for a filename
    suffix, `FULL=1` for a full page.
  - It logs in through the API and prints console errors.
  - Copy it and extend it with Playwright actions (click spin, wait, screenshot mid-animation, force features) as you
    need. Look at your screenshots with the Read tool. Iterate visually until it is genuinely excellent.
- Playwright and Chromium are preinstalled (`require('playwright')` with `NODE_PATH=$(npm root -g)`).
  Do not run `playwright install`.
- `node --check` your JS and `php -l` your PHP.
  - Test online mode (the server path) **and** practice mode: open `index.html` via `file://`, or temporarily rename
    `config.php`, and `api.php` falls back so the shell runs offline when api.php 404s. Easiest is to serve a copy
    without api.php.
- Provide a dev hook to force features for testing (like olympus/starwing's `DEV` hooks). It must be inert unless
  explicitly enabled (e.g. `localStorage['batty-dev']==='1'`) and only in practice mode.

## Git

- Commit your work in your worktree branch with clear messages. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013Bf5wHqqCrE5rL6RyZtLxG
  ```
- Do NOT push. Do NOT touch files outside your scope. Never commit `config.php`, screenshots or node_modules.
- Final report (your last message):
  - What you built or changed, and your test evidence (which screenshots you checked, and the RTP/parity results).
  - Known limitations.
  - The branch name and the final commit hash.
