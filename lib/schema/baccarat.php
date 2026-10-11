<?php
/* Velvet Baccarat: one shared Punto Banco table. An 8-deck shoe lives in bac_shoes; every hand dealt from it is a
   row in bac_hands; each player's chips on a hand are a row in bac_bets (their money lives in `rounds`, as ever);
   bac_seen says who has been at the table lately, for the live player count. */
if (!defined('BATTY')) { http_response_code(403); exit; }
return [
"CREATE TABLE IF NOT EXISTS bac_shoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cards TEXT NOT NULL,
  cut SMALLINT NOT NULL,
  pos SMALLINT NOT NULL,
  burn TINYINT NOT NULL,
  hands SMALLINT NOT NULL DEFAULT 0,
  created_at DOUBLE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bac_hands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shoe_id BIGINT UNSIGNED NOT NULL,
  hand_no SMALLINT NOT NULL,
  p VARCHAR(24) NOT NULL,
  b VARCHAR(24) NOT NULL,
  res CHAR(1) NOT NULL,
  pt TINYINT NOT NULL,
  bt TINYINT NOT NULL,
  left_before SMALLINT NOT NULL,
  left_cards SMALLINT NOT NULL,
  burn TINYINT NOT NULL DEFAULT -1,
  last TINYINT NOT NULL DEFAULT 0,
  shuffle TINYINT NOT NULL DEFAULT 0,
  start_at DOUBLE NOT NULL,
  open_at DOUBLE NOT NULL,
  close_at DOUBLE NOT NULL,
  result_at DOUBLE NOT NULL,
  KEY k_shoe (shoe_id),
  KEY k_result (result_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bac_bets (
  hand_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  bets VARCHAR(255) NOT NULL,
  total BIGINT NOT NULL,
  win BIGINT NOT NULL DEFAULT -1,
  PRIMARY KEY (hand_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bac_seen (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  seen_at DOUBLE NOT NULL,
  KEY k_seen (seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
