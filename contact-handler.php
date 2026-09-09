<?php
/**
 * Tohfet Al Benaa — contact form handler
 * ===========================================================================
 *   contact.html / ar/contact.html  (visitor)
 *        |  POST (fetch, or plain form submit if JS is off)
 *        v
 *   contact-handler.php  (this file, on Hostinger)
 *        |  PHPMailer -> authenticated SMTP -> mail.tohfetalbenaa.ae
 *        v
 *   info@tohfetalbenaa.ae            From = our mailbox   Reply-To = visitor
 * ===========================================================================
 *
 * Credentials are NOT in this file. See config/mail.php, .env.example and
 * CONTACT_FORM_SETUP.md.
 *
 * Behaviour:
 *   - validates every required field (server-side, independent of the JS)
 *   - honeypot + time-trap + per-IP rate limit + same-origin check (spam)
 *   - ignores an identical re-submission within a few minutes (duplicates)
 *   - From = configured mailbox, Reply-To = visitor
 *   - JSON reply for fetch()  /  styled HTML page for no-JS submissions
 *   - GET ?health=1 -> booleans only, useful right after uploading
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');          // never show PHP errors/notices to a visitor

/* --------------------------------------------------------------------------
 * Config + request shape
 * ----------------------------------------------------------------------- */
$config = require __DIR__ . '/config/mail.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$wantsJson =
    (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest')
    || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)
    || (($_POST['format'] ?? '') === 'json');

$lang = (($_POST['lang'] ?? '') === 'ar') ? 'ar' : 'en';

$STR = [
    'en' => [
        'ok'           => 'Thank you — your inquiry has been sent. Our team will get back to you within one business day.',
        'invalid'      => 'Please check the highlighted fields and try again.',
        'too_fast'     => 'That came through a little too fast — please send it once more.',
        'rate'         => 'You’ve already sent a few messages. Please try again later, or reach us on WhatsApp.',
        'unconfigured' => 'The contact form isn’t finished being set up yet. Please email info@tohfetalbenaa.ae directly for now.',
        'send_fail'    => 'Sorry — something went wrong and your inquiry wasn’t sent. Please try again, or message us on WhatsApp.',
        'method'       => 'Method not allowed.',
        'title_ok'     => 'Message sent',
        'title_err'    => 'Couldn’t send your message',
        'back'         => 'Back to the website',
    ],
    'ar' => [
        'ok'           => 'شكرًا لك — تم إرسال طلبك. سيعاود فريقنا التواصل معك خلال يوم عمل واحد.',
        'invalid'      => 'يرجى مراجعة الحقول المحددة والمحاولة مرة أخرى.',
        'too_fast'     => 'تم الإرسال بسرعة كبيرة — يرجى إرساله مرة أخرى.',
        'rate'         => 'لقد أرسلت عدة رسائل بالفعل. يرجى المحاولة لاحقًا أو التواصل عبر واتساب.',
        'unconfigured' => 'لم يكتمل إعداد نموذج التواصل بعد. يرجى مراسلتنا على info@tohfetalbenaa.ae مباشرةً حاليًا.',
        'send_fail'    => 'عذرًا — حدث خطأ ولم يتم إرسال طلبك. يرجى المحاولة مرة أخرى أو مراسلتنا عبر واتساب.',
        'method'       => 'الطريقة غير مسموح بها.',
        'title_ok'     => 'تم إرسال الرسالة',
        'title_err'    => 'تعذّر إرسال رسالتك',
        'back'         => 'العودة إلى الموقع',
    ],
];
$T = $STR[$lang];

/* --------------------------------------------------------------------------
 * GET ?health=1  — quick post-upload sanity check (no secrets revealed)
 * ----------------------------------------------------------------------- */
if ($method === 'GET' && isset($_GET['health'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $smtpReady = $config['smtp_port'] > 0
        && $config['smtp_secure'] !== ''
        && $config['smtp_user'] !== ''
        && $config['smtp_pass'] !== ''
        && !in_array($config['smtp_pass'], ['YOUR_EMAIL_PASSWORD', 'CHANGE_ME', 'changeme'], true);
    echo json_encode([
        'php'               => PHP_VERSION,
        'phpmailer_loaded'  => load_phpmailer(),
        'smtp_configured'   => $smtpReady,
        'storage_writable'  => is_writable_dir($config['storage_dir']),
        'env_file_present'  => is_readable(__DIR__ . '/.env') || is_readable(dirname(__DIR__) . '/.env'),
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    finish(false, $T['method'], 405, $lang, $T);
}

/* --------------------------------------------------------------------------
 * 1. Same-origin check
 *    Only enforced when the browser actually sent Origin/Referer (some
 *    privacy setups strip them — then we lean on the honeypot + rate limit).
 * ----------------------------------------------------------------------- */
$originHost = '';
if (!empty($_SERVER['HTTP_ORIGIN'])) {
    $originHost = (string) (parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) ?: '');
} elseif (!empty($_SERVER['HTTP_REFERER'])) {
    $originHost = (string) (parse_url($_SERVER['HTTP_REFERER'], PHP_URL_HOST) ?: '');
}
if ($originHost !== '') {
    $selfHost = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $allowed  = $selfHost !== '' && strcasecmp($originHost, $selfHost) === 0;
    foreach ($config['allowed_origins'] as $a) {
        if ($a !== '' && strcasecmp($originHost, $a) === 0) {
            $allowed = true;
            break;
        }
    }
    if (!$allowed) {
        log_line($config, "reject: cross-origin post from '{$originHost}'");
        finish(false, $T['send_fail'], 403, $lang, $T);
    }
}

/* --------------------------------------------------------------------------
 * 2. Spam gates
 * ----------------------------------------------------------------------- */
// 2a. Honeypot — a real person never sees or fills "company".
if (trim((string) ($_POST['company'] ?? '')) !== '') {
    log_line($config, 'drop: honeypot filled');
    finish(true, $T['ok'], 200, $lang, $T);   // look successful; send nothing
}

// 2b. Time-trap — only when JS supplied the load timestamp.
$ts = (int) ($_POST['ts'] ?? 0);
if ($ts > 0) {
    $elapsed = time() - $ts;
    if ($elapsed < max(1, $config['min_seconds']) || $elapsed > 6 * 3600) {
        log_line($config, "reject: implausible timing ({$elapsed}s)");
        finish(false, $T['too_fast'], 429, $lang, $T);
    }
}

// 2c. Per-IP rate limit.
$ip = client_ip();
if (!throttle_ok($config, $ip)) {
    log_line($config, 'reject: rate limit ' . mask_ip($ip));
    finish(false, $T['rate'], 429, $lang, $T);
}

/* --------------------------------------------------------------------------
 * 3. Validate + sanitise
 * ----------------------------------------------------------------------- */
$name     = clean_line($_POST['name']         ?? '', 100);
$email    = clean_line($_POST['email']        ?? '', 190);
$phone    = clean_line($_POST['phone']        ?? '', 30);
$location = clean_line($_POST['location']     ?? '', 150);
$ptype    = clean_line($_POST['project_type'] ?? '', 60);
$message  = clean_text($_POST['message']      ?? '', 5000);

$errors = [];
if (mb_strlen($name) < 2)                              $errors[] = 'name';
if (!filter_var($email, FILTER_VALIDATE_EMAIL))        $errors[] = 'email';
if (!preg_match('/^[+()\-.\s0-9]{7,30}$/', $phone))    $errors[] = 'phone';
if (mb_strlen($message) < 10)                          $errors[] = 'message';

if ($errors) {
    finish(false, $T['invalid'], 422, $lang, $T, ['errors' => $errors]);
}

/* --------------------------------------------------------------------------
 * 4. Duplicate-submission guard
 *    Same IP + email + message seen within dedupe_minutes -> acknowledge,
 *    but do not send a second copy.
 * ----------------------------------------------------------------------- */
$fingerprint = sha1($ip . '|' . mb_strtolower($email) . '|' . $message);
if (seen_recently($config, $fingerprint)) {
    log_line($config, 'dedupe: identical submission ignored ' . mask_ip($ip));
    finish(true, $T['ok'], 200, $lang, $T);
}

/* --------------------------------------------------------------------------
 * 5. Mailer availability + SMTP configured?
 * ----------------------------------------------------------------------- */
if (!load_phpmailer()) {
    log_line($config, 'error: PHPMailer not installed (composer require phpmailer/phpmailer, or drop lib/PHPMailer/src)');
    finish(false, $T['unconfigured'], 503, $lang, $T, ['code' => 'mail_unconfigured']);
}

$missing = [];
foreach (['smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass'] as $k) {
    if (empty($config[$k])) {
        $missing[] = $k;
    }
}
// Treat the shipped placeholder as "not set yet" so the form shows the polite
// "not finished being set up" message instead of a real SMTP auth failure.
if (in_array($config['smtp_pass'], ['YOUR_EMAIL_PASSWORD', 'CHANGE_ME', 'changeme'], true)) {
    $missing[] = 'smtp_pass (still the placeholder)';
}
if ($missing) {
    log_line($config, 'error: SMTP not configured — ' . implode(', ', $missing));
    finish(false, $T['unconfigured'], 503, $lang, $T, ['code' => 'mail_unconfigured']);
}

/* --------------------------------------------------------------------------
 * 6. Build + send
 * ----------------------------------------------------------------------- */
$mail = new \PHPMailer\PHPMailer\PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host       = $config['smtp_host'];
    $mail->Port       = $config['smtp_port'];
    $mail->SMTPAuth   = $config['smtp_auth'];
    $mail->Username   = $config['smtp_user'];
    $mail->Password   = $config['smtp_pass'];
    $mail->Timeout    = 20;
    $mail->CharSet    = \PHPMailer\PHPMailer\PHPMailer::CHARSET_UTF8;

    switch ($config['smtp_secure']) {
        case 'ssl':
        case 'smtps':
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;      // implicit TLS, usually :465
            break;
        case 'tls':
        case 'starttls':
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;   // upgrade, usually :587
            break;
        default:
            $mail->SMTPSecure  = false;
            $mail->SMTPAutoTLS = false;
    }

    if (!empty($config['debug'])) {
        $mail->SMTPDebug   = \PHPMailer\PHPMailer\SMTP::DEBUG_CONNECTION;
        $mail->Debugoutput = static function ($line) use ($config) {
            log_line($config, 'smtp> ' . rtrim($line));
        };
    }

    // From = our own mailbox (SMTP auth + SPF/DKIM). NOT the visitor.
    $mail->setFrom($config['from_email'], $config['from_name']);
    // Where the inquiry is delivered.
    $mail->addAddress($config['to_email'], $config['to_name']);
    // The visitor — so "Reply" in the inbox goes straight back to them.
    $mail->addReplyTo($email, $name);

    $mail->Subject = ($lang === 'ar' ? 'طلب مشروع جديد — ' : 'New project inquiry — ') . $name;

    $fields = [
        'Project type' => $ptype !== '' ? $ptype : '—',
        'Name'         => $name,
        'Phone'        => $phone,
        'Email'        => $email,
        'Location'     => $location !== '' ? $location : '—',
    ];
    $meta = [
        'Submitted'  => gmdate('Y-m-d H:i:s') . ' UTC',
        'Form'       => $lang === 'ar' ? 'Arabic (/ar/contact.html)' : 'English (/contact.html)',
        'IP'         => mask_ip($ip),
        'User agent' => clean_line($_SERVER['HTTP_USER_AGENT'] ?? '—', 280),
    ];

    $mail->isHTML(true);
    $mail->Body    = html_body($fields, $message, $meta);
    $mail->AltBody = text_body($fields, $message, $meta);

    $mail->send();

    remember($config, $fingerprint);
    throttle_record($config, $ip);
    log_line($config, 'sent: ' . $email . ' ' . mask_ip($ip));

    finish(true, $T['ok'], 200, $lang, $T);

} catch (\PHPMailer\PHPMailer\Exception $e) {
    log_line($config, 'send-fail: ' . $mail->ErrorInfo);
    $extra = !empty($config['debug']) ? ['detail' => $mail->ErrorInfo] : [];
    finish(false, $T['send_fail'], 502, $lang, $T, $extra);
} catch (\Throwable $e) {
    log_line($config, 'send-fail (exception): ' . $e->getMessage());
    finish(false, $T['send_fail'], 502, $lang, $T);
}


/* =========================================================================
 * Helpers
 * ===================================================================== */

/**
 * Emit the response and stop. JSON for fetch(); a small styled HTML page for
 * a plain (no-JS) form submission.
 */
function finish(bool $ok, string $message, int $status, string $lang, array $T, array $extra = []): void
{
    global $wantsJson;

    header('Cache-Control: no-store');

    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array_merge(['ok' => $ok, 'message' => $message], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    http_response_code($ok ? 200 : $status);
    header('Content-Type: text/html; charset=utf-8');

    $dir    = $lang === 'ar' ? 'rtl' : 'ltr';
    $accent = $ok ? '#1f7a44' : '#c0392b';
    $title  = $ok ? $T['title_ok'] : $T['title_err'];
    $back   = $lang === 'ar' ? '/ar/contact.html' : '/contact.html';

    $title = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $msg   = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $blbl  = htmlspecialchars($T['back'], ENT_QUOTES, 'UTF-8');

    echo <<<HTML
<!doctype html>
<html lang="{$lang}" dir="{$dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{$title}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:24px;background:#0b1a33;color:#fff;
       font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .card{max-width:520px;width:100%;background:#0f2447;border:1px solid rgba(255,255,255,.12);
        border-radius:12px;padding:40px}
  .bar{width:56px;height:4px;border-radius:2px;background:{$accent};margin-bottom:24px}
  h1{margin:0 0 12px;font-size:22px;letter-spacing:.01em}
  p{margin:0 0 26px;color:rgba(255,255,255,.82)}
  a{display:inline-block;background:#b9924f;color:#0b1a33;font-weight:700;
    text-decoration:none;padding:12px 22px;border-radius:8px}
</style>
</head>
<body>
  <div class="card">
    <div class="bar"></div>
    <h1>{$title}</h1>
    <p>{$msg}</p>
    <a href="{$back}">{$blbl}</a>
  </div>
</body>
</html>
HTML;
    exit;
}

/** Collapse to one line, strip control chars / header-injection newlines, cap length. */
function clean_line(string $s, int $max = 300): string
{
    $s = str_replace(["\r", "\n", "\0"], ' ', $s);
    $s = preg_replace('/[ \t]+/u', ' ', trim($s));
    return mb_substr((string) $s, 0, $max);
}

/** Keep line breaks, strip null bytes, normalise newlines, cap length. */
function clean_text(string $s, int $max = 5000): string
{
    $s = str_replace(["\r\n", "\r", "\0"], ["\n", "\n", ''], $s);
    return mb_substr(trim($s), 0, $max);
}

function esc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
        if (empty($_SERVER[$k])) {
            continue;
        }
        $candidate = trim(explode(',', $_SERVER[$k])[0]);
        if (filter_var($candidate, FILTER_VALIDATE_IP)) {
            return $candidate;
        }
    }
    return '0.0.0.0';
}

/** Redact the last group so logs don't store a full address. */
function mask_ip(string $ip): string
{
    if (strpos($ip, ':') !== false) {                       // IPv6
        $p = explode(':', $ip);
        return implode(':', array_slice($p, 0, 3)) . '::x';
    }
    $p = explode('.', $ip);
    if (count($p) === 4) {
        $p[3] = 'x';
        return implode('.', $p);
    }
    return 'x';
}

function storage_path(array $config, string $sub = ''): string
{
    $base = $config['storage_dir'] ?: (__DIR__ . '/storage');
    $dir  = $sub !== '' ? $base . '/' . $sub : $base;
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir;
}

function is_writable_dir(string $dir): bool
{
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return is_dir($dir) && is_writable($dir);
}

function log_line(array $config, string $msg): void
{
    $dir  = storage_path($config);
    $file = $dir . '/mail.log';
    if (@is_file($file) && @filesize($file) > 1048576) {     // rotate at ~1 MB
        @rename($file, $dir . '/mail.log.1');
    }
    @file_put_contents($file, '[' . gmdate('c') . '] ' . $msg . "\n", FILE_APPEND | LOCK_EX);
}

/** Per-IP: at most max_per_hour successful/attempted sends in a rolling hour. */
function throttle_ok(array $config, string $ip): bool
{
    $file = storage_path($config, 'throttle') . '/' . sha1($ip) . '.json';
    $now  = time();
    $hits = [];
    if (is_readable($file)) {
        $hits = json_decode((string) @file_get_contents($file), true) ?: [];
    }
    $hits = array_values(array_filter($hits, static fn($t) => is_int($t) && $t > $now - 3600));
    return count($hits) < max(1, $config['max_per_hour']);
}

function throttle_record(array $config, string $ip): void
{
    $dir  = storage_path($config, 'throttle');
    $file = $dir . '/' . sha1($ip) . '.json';
    $now  = time();
    $hits = [];
    if (is_readable($file)) {
        $hits = json_decode((string) @file_get_contents($file), true) ?: [];
    }
    $hits = array_values(array_filter($hits, static fn($t) => is_int($t) && $t > $now - 3600));
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    gc_dir($dir, 7200);
}

function seen_recently(array $config, string $fingerprint): bool
{
    $file = storage_path($config, 'dedupe') . '/' . $fingerprint;
    return is_file($file) && filemtime($file) > time() - max(60, $config['dedupe_minutes'] * 60);
}

function remember(array $config, string $fingerprint): void
{
    $dir = storage_path($config, 'dedupe');
    @touch($dir . '/' . $fingerprint);
    gc_dir($dir, max(3600, $config['dedupe_minutes'] * 60));
}

/** Occasionally delete stale files so storage/ can't grow without bound. */
function gc_dir(string $dir, int $ttl): void
{
    if (mt_rand(1, 25) !== 1 || !is_dir($dir)) {
        return;
    }
    $cutoff = time() - $ttl;
    foreach ((array) @scandir($dir) as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        $p = $dir . '/' . $f;
        if (is_file($p) && @filemtime($p) < $cutoff) {
            @unlink($p);
        }
    }
}

/**
 * Load PHPMailer from Composer's vendor/ or from a manually-dropped
 * lib/PHPMailer/src/. Returns true if the class is available.
 */
function load_phpmailer(): bool
{
    if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
        return true;
    }

    $autoload = __DIR__ . '/vendor/autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
        if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
            return true;
        }
    }

    foreach ([
        __DIR__ . '/lib/PHPMailer/src',
        __DIR__ . '/lib/phpmailer/phpmailer/src',
        __DIR__ . '/lib/PHPMailer-master/src',
    ] as $src) {
        if (is_file($src . '/PHPMailer.php') && is_file($src . '/SMTP.php') && is_file($src . '/Exception.php')) {
            require_once $src . '/Exception.php';
            require_once $src . '/PHPMailer.php';
            require_once $src . '/SMTP.php';
            if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
                return true;
            }
        }
    }

    return false;
}

function text_body(array $fields, string $message, array $meta): string
{
    $out = "NEW PROJECT INQUIRY\n===================\n\n";
    foreach ($fields as $k => $v) {
        $out .= str_pad($k, 13) . ': ' . $v . "\n";
    }
    $out .= "\nMessage:\n--------\n" . $message . "\n\n--\n";
    foreach ($meta as $k => $v) {
        $out .= str_pad($k, 13) . ': ' . $v . "\n";
    }
    return $out;
}

function html_body(array $fields, string $message, array $meta): string
{
    $rows = '';
    foreach ($fields as $k => $v) {
        $rows .= '<tr>'
            . '<td style="padding:8px 14px;background:#f4f5f7;font-weight:700;color:#0b1a33;white-space:nowrap;vertical-align:top">' . esc($k) . '</td>'
            . '<td style="padding:8px 14px;color:#1b2430">' . esc($v) . '</td>'
            . '</tr>';
    }
    $metaRows = '';
    foreach ($meta as $k => $v) {
        $metaRows .= '<tr>'
            . '<td style="padding:4px 14px;color:#8a94a6;white-space:nowrap;vertical-align:top">' . esc($k) . '</td>'
            . '<td style="padding:4px 14px;color:#8a94a6">' . esc($v) . '</td>'
            . '</tr>';
    }
    $msgHtml = nl2br(esc($message));

    return '<!doctype html><html><body style="margin:0;background:#eef0f4;padding:24px;'
        . 'font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">'
        . '<tr><td style="background:#0b1a33;color:#fff;padding:20px 24px;font-size:16px;font-weight:700">'
        . 'Tohfet Al Benaa &mdash; new project inquiry</td></tr>'
        . '<tr><td style="background:#fff;padding:24px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">'
        . $rows . '</table>'
        . '<p style="margin:22px 0 6px;font-weight:700;color:#0b1a33;font-size:14px">Message</p>'
        . '<div style="font-size:14px;line-height:1.6;color:#1b2430;white-space:pre-wrap">' . $msgHtml . '</div>'
        . '</td></tr>'
        . '<tr><td style="background:#fff;border-top:1px solid #e6e8ec;padding:14px 24px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">'
        . $metaRows . '</table></td></tr>'
        . '</table></body></html>';
}
