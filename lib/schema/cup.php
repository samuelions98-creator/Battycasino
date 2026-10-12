<?php
/* The Batty Cup: a weekly tournament. One row per player per week (their best round), and one row per paid prize. */
if (!defined('BATTY')) { http_response_code(403); exit; }

return [
"CREATE TABLE IF NOT EXISTS cup_scores (
  week DATE NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  best_x DECIMAL(14,2) NOT NULL,
  best_win BIGINT NOT NULL,
  stake BIGINT NOT NULL,
  game VARCHAR(12) NOT NULL,
  at DATETIME(3) NOT NULL,
  entries INT NOT NULL DEFAULT 1,
  PRIMARY KEY (week, user_id),
  KEY k_rank (week, best_x, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

/* The primary key is what makes a prize payable exactly once, however many requests settle the week. */
"CREATE TABLE IF NOT EXISTS cup_prizes (
  week DATE NOT NULL,
  place INT NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  best_x DECIMAL(14,2) NOT NULL,
  amount BIGINT NOT NULL,
  paid_at DATETIME NOT NULL,
  PRIMARY KEY (week, place),
  KEY k_user (user_id, week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
