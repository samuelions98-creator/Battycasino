<?php
/* Count Batula's Crypt: placeholder until the game is built. */
if (!defined('BATTY')) { http_response_code(403); exit; }
function play_crypt(array &$u, string $op, array $in): array { throw new ApiError('This game is opening soon.', 409); }
