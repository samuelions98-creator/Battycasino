BATTY CASINO: FULL SITE BUILD

This ZIP contains the whole website: the front end, every game and the PHP back end. It is a root-level archive.

INSTALLING OVER AN EXISTING SITE
1. Back up your current website files and your database.
2. Extract this ZIP directly into the folder that holds the live index.html and api.php (not into a sub-folder).
   Overwrite everything it contains. Keep your own config.php: it is not in this ZIP.
3. New folders in this build: games/ (one folder per game), core/ and lib/schema/. Make sure they uploaded.
   The old circus/ folder is no longer used once the rebuilt Batty Circus is included (games/circus/).
4. Log in as an admin, open your profile, then "Open the admin panel", and press "Update database".
   This adds the tables for the live games, the Daily Wheel, the Bat Pass and the shop. It never deletes or changes data.
5. If you use Cloudflare, purge the cache (HTML, JS and CSS), then reload the site.

FRESH INSTALL
Copy config.sample.php to config.php, fill in your MySQL details, then open install.php once in your browser.

NOTES
- PHP 8.0+ with PDO MySQL is required (MySQL 5.7+/MariaDB 10.3+).
- There is no cron job. The live games (Bunky Time, Bonkers Time, Moonshot, Bat Derby, the lounge tables)
  advance whenever anyone is connected.
- Batty Bucks are virtual play money with no cash value. Nothing can be bought with real money.
