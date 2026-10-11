<?php
/* Random numbers for the games.
   batty_rng()      production: a closure returning a uniform float in [0,1) from the OS CSPRNG (random_int).
   batty_mulberry() testing only: the same seeded generator the JavaScript simulations use, bit for bit,
                    so the PHP maths can be proved identical to the JS maths round by round. */
if (!defined('BATTY')) { http_response_code(403); exit; }

/* The most one bet (or one table round) may stake, in BB. Players may bet anything they can afford up to this; it is a
   technical ceiling that keeps the biggest wins exactly representable in the browser. See stake_of() in lib/play.php. */
const MAX_BET = 1000000000;
/* A legal stake: a whole multiple of $step from the game's smallest stake (the first entry of its ladder) up to MAX_BET. */
function stake_ok(int $s, array $ladder, int $step = 20): bool { return $s >= $ladder[0] && $s <= MAX_BET && $s % $step === 0; }

function batty_rng(): Closure {
    return static function (): float {
        return random_int(0, 9007199254740991) / 9007199254740992.0; // 53 random bits
    };
}

function batty_imul(int $a, int $b): int {
    $a &= 0xFFFFFFFF; $b &= 0xFFFFFFFF;
    $ah = ($a >> 16) & 0xFFFF; $al = $a & 0xFFFF;
    $lo = ($al * $b) & 0xFFFFFFFF;
    $hi = (($ah * $b) & 0xFFFF) << 16;
    return ($lo + $hi) & 0xFFFFFFFF;
}

function batty_mulberry(int $seed): Closure {
    $a = $seed & 0xFFFFFFFF;
    return static function () use (&$a): float {
        $a = ($a + 0x6D2B79F5) & 0xFFFFFFFF;
        $t = batty_imul($a ^ ($a >> 15), 1 | $a);
        $t = (($t + batty_imul($t ^ ($t >> 7), 61 | $t)) & 0xFFFFFFFF) ^ $t;
        return (($t ^ ($t >> 14)) & 0xFFFFFFFF) / 4294967296.0;
    };
}

function batty_data(string $game): array {
    static $all = null;
    if ($all === null) $all = json_decode(file_get_contents(__DIR__ . '/gamedata.json'), true);
    return $all[$game];
}

/* small helpers shared by the game files */
function rfloor(Closure $rng, int $n): int { return (int) floor($rng() * $n); }
