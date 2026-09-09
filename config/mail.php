<?php
/**
 * Tohfet Al Benaa — mail / SMTP configuration
 * ---------------------------------------------------------------------------
 * NO SECRETS LIVE IN THIS FILE. Values are resolved in this order
 * (first non-empty wins):
 *
 *   1. A real environment variable            getenv('TAB_SMTP_USER') ...
 *   2. A line in a local  .env  file          TAB_SMTP_USER=info@...
 *   3. The safe placeholder default below     (deliberately incomplete, so
 *                                              the form reports "not set up"
 *                                              instead of silently failing)
 *
 * Put real values in `.env` (git-ignored, blocked from the web by .htaccess)
 * or in Hostinger environment variables. See `.env.example` and
 * `CONTACT_FORM_SETUP.md`.
 */

declare(strict_types=1);

if (!function_exists('tab_env')) {
    /**
     * Look a key up in real env vars, then in the .env file(s), then fall back.
     */
    function tab_env(string $key, ?string $default = null): ?string
    {
        static $file = null;

        if ($file === null) {
            $file = [];
            $paths = [
                dirname(__DIR__) . '/.env',        // project root (= web root on Hostinger)
                dirname(__DIR__, 2) . '/.env',     // one level ABOVE the web root (more secure)
            ];
            foreach ($paths as $path) {
                if (!is_readable($path)) {
                    continue;
                }
                $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                foreach ($lines as $rawLine) {
                    $line = ltrim($rawLine);
                    if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                        continue;
                    }
                    list($k, $v) = explode('=', $line, 2);
                    $k = trim($k);
                    // Value runs to end of line. Trim only surrounding whitespace.
                    // NO inline "# comment" stripping — passwords may contain '#',
                    // spaces, quotes, etc. Put comments on their own line instead.
                    $v = trim($v);
                    // If the whole value is wrapped in matching quotes, take the
                    // literal contents (so a value CAN start/end with a space).
                    $len = strlen($v);
                    if ($len >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
                        $v = substr($v, 1, -1);
                    }
                    if ($k !== '' && !array_key_exists($k, $file)) {
                        $file[$k] = $v;
                    }
                }
                break; // first readable .env wins
            }
        }

        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        if (isset($file[$key]) && $file[$key] !== '') {
            return $file[$key];
        }
        return $default;
    }
}

$bool = static function (?string $v, bool $default): bool {
    if ($v === null || $v === '') {
        return $default;
    }
    return filter_var($v, FILTER_VALIDATE_BOOLEAN);
};

$origins = array_values(array_filter(array_map('trim', explode(
    ',',
    (string) tab_env('TAB_ALLOWED_ORIGINS', 'tohfetalbenaa.ae,www.tohfetalbenaa.ae')
))));

return [
    // ---- SMTP transport (confirmed with Tasjeel / Qamar) ------------------
    // Host / port / encryption / username are known and set as defaults here.
    // The PASSWORD is the only secret and is NEVER hard-coded — it comes from
    // the .env file (see .env / .env.example). No default is provided for it.
    'smtp_host'   => tab_env('TAB_SMTP_HOST', 'mail.tohfetalbenaa.ae'),
    'smtp_port'   => (int) tab_env('TAB_SMTP_PORT', '465'),               // SSL/TLS
    'smtp_secure' => strtolower((string) tab_env('TAB_SMTP_SECURE', 'ssl')), // implicit TLS on :465
    'smtp_user'   => (string) tab_env('TAB_SMTP_USER', 'info@tohfetalbenaa.ae'),
    'smtp_pass'   => (string) tab_env('TAB_SMTP_PASS', ''), // <-- set in .env only, never here
    'smtp_auth'   => $bool(tab_env('TAB_SMTP_AUTH', null), true),

    // ---- Addresses -------------------------------------------------------
    // From MUST be a real mailbox on tohfetalbenaa.ae (needed for SMTP auth
    // and SPF/DKIM alignment). It is NOT the visitor — the visitor goes into
    // Reply-To so hitting "Reply" in the inbox reaches them directly.
    'from_email'  => (string) tab_env('TAB_MAIL_FROM', 'info@tohfetalbenaa.ae'),
    'from_name'   => (string) tab_env('TAB_MAIL_FROM_NAME', 'Tohfet Al Benaa Website'),
    'to_email'    => (string) tab_env('TAB_MAIL_TO', 'info@tohfetalbenaa.ae'),
    'to_name'     => (string) tab_env('TAB_MAIL_TO_NAME', 'Tohfet Al Benaa'),

    // ---- Anti-abuse (sane defaults; override in .env if needed) ------------
    'allowed_origins' => $origins,
    'min_seconds'     => (int) tab_env('TAB_FORM_MIN_SECONDS', '3'),  // submitted faster than this = bot
    'max_per_hour'    => (int) tab_env('TAB_MAX_PER_HOUR', '5'),      // per IP address
    'dedupe_minutes'  => (int) tab_env('TAB_DEDUPE_MINUTES', '10'),   // ignore identical re-send within
    'storage_dir'     => rtrim((string) tab_env('TAB_STORAGE_DIR', dirname(__DIR__) . '/storage'), '/\\'),

    // ---- Debugging -----------------------------------------------------
    // true  -> raw SMTP error is returned in the JSON response and a verbose
    //          SMTP transcript is written to storage/mail.log.
    // Turn OFF again once sending works.
    'debug'           => $bool(tab_env('TAB_MAIL_DEBUG', null), false),
];
