<?php
/* Bunky Time live show: one shared wheel on a fixed rhythm (see lib/games/bunky.php).
   bunky_rounds  every show round, with its outcome drawn when the round is created (never sent before its reveal time)
   bunky_bets    each player's chips on a round (the money itself lives in rounds/ledger like every other game)
   bunky_seen    who has the show open, for the live audience count */
if (!defined('BATTY')) { http_response_code(403); exit; }
return [
"CREATE TABLE IF NOT EXISTS bunky_rounds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  o MEDIUMTEXT NOT NULL,
  tl TEXT NOT NULL,
  spot VARCHAR(8) NOT NULL,
  boost INT NOT NULL DEFAULT 1,
  top_x INT NOT NULL DEFAULT 0,
  th0 DOUBLE NOT NULL,
  jit DOUBLE NOT NULL,
  rest DOUBLE NOT NULL,
  open_at DOUBLE NOT NULL,
  close_at DOUBLE NOT NULL,
  spin_at DOUBLE NOT NULL,
  land_at DOUBLE NOT NULL,
  end_at DOUBLE NOT NULL,
  next_at DOUBLE NOT NULL,
  KEY k_land (land_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bunky_bets (
  round_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  bets VARCHAR(600) NOT NULL,
  total BIGINT NOT NULL,
  pick TINYINT NULL,
  win BIGINT NULL,
  PRIMARY KEY (round_id, user_id),
  KEY k_win (win)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS bunky_seen (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  seen_at DOUBLE NOT NULL,
  KEY k_seen (seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
