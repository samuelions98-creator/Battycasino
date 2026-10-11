<?php
/* Bat Derby tables: the race schedule, every bet struck on it, the stable of racing bats, and who is watching. */
if (!defined('BATTY')) { http_response_code(403); exit; }
return [
"CREATE TABLE IF NOT EXISTS derby_races (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  card MEDIUMTEXT NOT NULL,
  result TEXT NOT NULL,
  summary TEXT NOT NULL,
  open_at DOUBLE NOT NULL,
  close_at DOUBLE NOT NULL,
  off_at DOUBLE NOT NULL,
  finish_at DOUBLE NOT NULL,
  result_at DOUBLE NOT NULL,
  end_at DOUBLE NOT NULL,
  applied TINYINT NOT NULL DEFAULT 0,
  KEY k_result (result_at),
  KEY k_applied (applied, finish_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS derby_bets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  race_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  round_id BIGINT UNSIGNED NOT NULL,
  t VARCHAR(4) NOT NULL,
  sel VARCHAR(12) NOT NULL,
  stake BIGINT NOT NULL,
  cost BIGINT NOT NULL,
  win BIGINT NOT NULL DEFAULT -1,
  created_at DOUBLE NOT NULL,
  KEY k_race (race_id),
  KEY k_user (user_id, race_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS derby_bats (
  id INT UNSIGNED NOT NULL PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  silks VARCHAR(200) NOT NULL,
  rating INT NOT NULL,
  form VARCHAR(12) NOT NULL,
  runs INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  hist TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS derby_seen (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  at DOUBLE NOT NULL,
  KEY k_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
/* widen the bet columns of tables made before bets had no limits (safe to re-run) */
"ALTER TABLE derby_bets MODIFY stake BIGINT NOT NULL, MODIFY cost BIGINT NOT NULL",
];
