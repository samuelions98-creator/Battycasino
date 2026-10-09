<?php
/* Platform tables: the Daily Prize Wheel, the Bat Pass (battle pass) and the Belfry Shop (cosmetics, boosts, crates).
   Every claim that must happen once has a primary or unique key, so a double request can never pay twice. */
if (!defined('BATTY')) { http_response_code(403); exit; }

return [
/* One row per player: what they wear, their wheel streak and any running XP boost. */
"CREATE TABLE IF NOT EXISTS plat_profile (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  eq_head VARCHAR(24) NULL,
  eq_face VARCHAR(24) NULL,
  eq_back VARCHAR(24) NULL,
  eq_frame VARCHAR(24) NULL,
  eq_name VARCHAR(24) NULL,
  eq_title VARCHAR(24) NULL,
  eq_emote VARCHAR(24) NULL,
  eq_effect VARCHAR(24) NULL,
  eq_badge VARCHAR(24) NULL,
  wheel_day DATE NULL,
  wheel_streak INT NOT NULL DEFAULT 0,
  boost_until DATETIME NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* Owned items. Cosmetics have qty 1; consumables (boosts, crates, wheel tickets, bonus spins) count down. */
"CREATE TABLE IF NOT EXISTS plat_inv (
  user_id INT UNSIGNED NOT NULL,
  item VARCHAR(24) NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  source VARCHAR(10) NOT NULL DEFAULT '',
  first_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* Bat Pass progress per season. day/day_xp throttle XP from wagering (diminishing returns within a UK day). */
"CREATE TABLE IF NOT EXISTS plat_pass (
  user_id INT UNSIGNED NOT NULL,
  season INT NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  gold TINYINT NOT NULL DEFAULT 0,
  gold_at DATETIME NULL,
  day DATE NULL,
  day_xp INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* Tier rewards claimed. The key makes every (season, tier, track) claim happen at most once. */
"CREATE TABLE IF NOT EXISTS plat_pass_claims (
  user_id INT UNSIGNED NOT NULL,
  season INT NOT NULL,
  tier TINYINT UNSIGNED NOT NULL,
  track CHAR(1) NOT NULL,
  claimed_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, season, tier, track)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* Daily (period 'd2026-10-09') and weekly (period 'w2026-10-05') pass challenges. XP is paid once, when done_at is set. */
"CREATE TABLE IF NOT EXISTS plat_challenges (
  user_id INT UNSIGNED NOT NULL,
  period VARCHAR(12) NOT NULL,
  slot TINYINT NOT NULL,
  ch VARCHAR(16) NOT NULL,
  target BIGINT NOT NULL,
  progress BIGINT NOT NULL DEFAULT 0,
  meta VARCHAR(64) NOT NULL DEFAULT '',
  xp INT NOT NULL,
  done_at DATETIME NULL,
  PRIMARY KEY (user_id, period, slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* Every wheel spin. free_day is set only for the free daily spin, so the unique key allows one per UK day. */
"CREATE TABLE IF NOT EXISTS plat_wheel_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  kind VARCHAR(8) NOT NULL,
  free_day DATE NULL,
  streak_day TINYINT NOT NULL DEFAULT 1,
  seg TINYINT NOT NULL,
  prize VARCHAR(16) NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  UNIQUE KEY u_free (user_id, free_day),
  KEY k_user (user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* Mystery crate openings (what dropped, at which rarity). */
"CREATE TABLE IF NOT EXISTS plat_crate_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  crate VARCHAR(24) NOT NULL,
  item VARCHAR(24) NOT NULL,
  rarity VARCHAR(10) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY k_user (user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
