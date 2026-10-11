<?php
/* Roulette Royale (High Roller Lounge): one shared single-zero wheel on the server's clock. */
if (!defined('BATTY')) { http_response_code(403); exit; }
return [
"CREATE TABLE IF NOT EXISTS ry_spins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  number TINYINT UNSIGNED NOT NULL,
  open_at DOUBLE NOT NULL,
  close_at DOUBLE NOT NULL,
  result_at DOUBLE NOT NULL,
  KEY k_result (result_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS ry_bets (
  spin_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  total BIGINT NOT NULL,
  bets TEXT NOT NULL,
  win BIGINT NOT NULL DEFAULT -1,
  PRIMARY KEY (spin_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS ry_seen (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  at DOUBLE NOT NULL,
  KEY k_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
