<?php
/* Batty Jackpots: four progressive pools fed by every bet of 100 BB or more, in every game. See lib/platform/jackpot.php. */
if (!defined('BATTY')) { http_response_code(403); exit; }

return [
"CREATE TABLE IF NOT EXISTS jp_pools (
  tier VARCHAR(8) NOT NULL PRIMARY KEY,
  amount DOUBLE NOT NULL,
  hits INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS jp_hits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tier VARCHAR(8) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  amount BIGINT NOT NULL,
  game VARCHAR(12) NOT NULL,
  stake BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY k_time (created_at),
  KEY k_tier (tier, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"INSERT IGNORE INTO jp_pools (tier, amount) VALUES ('mini', 800), ('minor', 6000), ('major', 40000), ('grand', 500000)",
];
