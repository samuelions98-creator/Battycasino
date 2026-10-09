<?php
/* Batty Casino settings.
   1. Copy this file to config.php (same folder).
   2. Fill in your IONOS MySQL details: IONOS control panel > Hosting > Databases > your database > "Show details".
   3. Visit install.php in your browser once. */
if (!defined('BATTY')) { http_response_code(403); exit; }

return [
    'db_host' => 'db5000000000.hosting-data.io',   // "Host name" from IONOS
    'db_port' => 3306,
    'db_name' => 'dbs0000000',                      // "Database name"
    'db_user' => 'dbu0000000',                      // "User name"
    'db_pass' => 'your-database-password',

    'start_balance' => 25000,      // Batty Bucks a new player starts with
    'site_name'     => 'Batty Casino',
];
