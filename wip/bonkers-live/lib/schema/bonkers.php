<?php
/* Bonkers Time: the shared live wheel. One row per round in bonkers_rounds (outcome drawn and timetabled at creation),
   one row per player per round in bonkers_bets (their chips and bonus picks), and a presence row per viewer. */
if (!defined('BATTY')) { http_response_code(403); exit; }
return [
"CREATE TABLE IF NOT EXISTS bonkers_rounds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  spot VARCHAR(8) NOT NULL,
  seg TINYINT UNSIGNED NOT NULL,
  ts_spot VARCHAR(8) NOT NULL,
  ts_mult SMALLINT NOT NULL,
  x INT NOT NULL DEFAULT 0,
  outcome MEDIUMTEXT NOT NULL,
  plan TEXT NOT NULL,
  open_at DOUBLE NOT NULL,
  close_at DOUBLE NOT NULL,
  result_at DOUBLE NOT NULL,
  pay_at DOUBLE NOT NULL,
  end_at DOUBLE NOT NULL,
  picks_done TINYINT NOT NULL DEFAULT 0,
  KEY k_result (result_at),
  KEY k_end (end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bonkers_bets (
  round_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  bets VARCHAR(400) NOT NULL,
  total BIGINT NOT NULL,
  hunt_pick SMALLINT NULL,
  flapper TINYINT NULL,
  win BIGINT NOT NULL DEFAULT -1,
  rx INT NULL,
  PRIMARY KEY (round_id, user_id),
  KEY k_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bonkers_seen (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  seen_at DOUBLE NOT NULL,
  KEY k_seen (seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
