# Contact form — setup & deployment (Hostinger)

How the contact form works once the site is live:

```
Visitor fills the form on  contact.html / ar/contact.html
        │  POST  (fetch; or a normal form submit if JavaScript is off)
        ▼
contact-handler.php            ← on your Hostinger hosting, runs as PHP
        │  validates · anti-spam · de-dupes · builds the email
        ▼
PHPMailer  →  authenticated SMTP  →  mail.tohfetalbenaa.ae   (Tasjeel / Qamar)
        ▼
info@tohfetalbenaa.ae
        From:      info@tohfetalbenaa.ae   (your mailbox — required for auth/SPF)
        Reply-To:  the visitor              (so "Reply" in your inbox reaches them)
```

Nothing here is live-tested yet. This document is everything you do **after**
uploading to Hostinger.

---

## 1. What was added to the project

| Path | What it is | Commit it? |
|---|---|---|
| `contact-handler.php` | The server endpoint. No credentials inside. | ✅ yes |
| `config/mail.php` | Reads settings from env vars → `.env` → placeholders. | ✅ yes |
| `.env.example` | Template you copy to `.env` and fill in. | ✅ yes |
| `.env` | **Your real credentials.** Git-ignored, web-blocked. | ❌ **never** |
| `.htaccess` | Blocks `.env`, `config/`, `lib/`, `storage/`, `vendor/`; security headers. | ✅ yes |
| `composer.json` | Declares the PHPMailer dependency. | ✅ yes |
| `lib/README.md` | How to install PHPMailer without Composer. | ✅ yes |
| `vendor/` **or** `lib/PHPMailer/src/` | PHPMailer itself (one or the other). | ❌ git-ignored |
| `storage/` | Runtime log + rate-limit + de-dupe files. Must be writable. | folder only |
| `contact.html`, `ar/contact.html` | Form now POSTs to the handler; honeypot + timestamp added. | ✅ yes |
| `assets/js/main.js` | Submits via `fetch()`, locks the button, shows success/error. | ✅ yes |
| `assets/css/style.css` | Honeypot hide rule + green success style. | ✅ yes |

---

## 2. Install PHPMailer (pick ONE)

### A. Composer — recommended

hPanel → **Advanced → SSH Access** (enable it), connect, then:

```bash
cd ~/domains/tohfetalbenaa.ae/public_html      # adjust to your actual web root
composer require phpmailer/phpmailer
```

This creates `vendor/`. The handler finds it automatically.

### B. Manual — no SSH, no Composer

Follow **`lib/README.md`**: download the PHPMailer release ZIP, copy its
`src/` folder to `lib/PHPMailer/src/`, upload it. Done.

> The handler checks `vendor/` first, then `lib/PHPMailer/src/`. If neither is
> present the form returns *"isn't finished being set up yet"* and logs the
> reason to `storage/mail.log`.

---

## 3. Mailboxes

- **`info@tohfetalbenaa.ae`** must exist and be the inbox you want inquiries in.
- The **From** address (`TAB_MAIL_FROM`) must be a real mailbox on
  `tohfetalbenaa.ae` that you have the SMTP password for. Using `info@` for
  both From and To is fine. (A dedicated `website@` or `noreply@` mailbox also
  works — just create it and use its credentials.)

Do **not** put the visitor's address in From — mail servers will reject or
spam-file it because it fails SPF/DKIM for your domain. The visitor goes in
**Reply-To** (already handled in code).

---

## 4. SMTP settings — already configured

These were confirmed with Tasjeel/Qamar and are **already set** in `.env` and
in `config/mail.php`:

| Setting | Value |
|---|---|
| Host | `mail.tohfetalbenaa.ae` |
| Port | `465` |
| Encryption (`TAB_SMTP_SECURE`) | `ssl` (implicit SSL/TLS) |
| Username | `info@tohfetalbenaa.ae` |
| Auth | on |
| From | `info@tohfetalbenaa.ae` |
| To (recipient) | `info@tohfetalbenaa.ae` |
| Reply-To | the visitor's email (set automatically per submission) |

**The only thing left is the password.**

---

## 5. Enter the email password

`.env` already exists in the project root with everything filled in except one
line:

```dotenv
TAB_SMTP_PASS=YOUR_EMAIL_PASSWORD
```

Replace `YOUR_EMAIL_PASSWORD` with the **real password for
`info@tohfetalbenaa.ae`** (the mailbox login password from Qamar/Tasjeel; if
plain login is blocked, generate an *app password* in webmail security
settings and use that). No quotes, no spaces around the `=`:

```dotenv
TAB_SMTP_PASS=the-actual-password-here
```

You can edit `.env` **before** uploading, or afterwards in Hostinger's
**hPanel → File Manager** (right-click `.env` → *Edit*). Either is fine — just
never put the password in any other file, and never commit `.env`.

Leave every other line in `.env` as-is. Until the password is real, the form
politely shows *"isn't finished being set up yet"* rather than erroring.

**Permissions:** `chmod 600 .env` (hPanel File Manager → right-click → Permissions
→ `600`). It's already blocked from the web by `.htaccess`; `600` is defence in
depth.

**More secure option:** move `.env` one level *above* `public_html`
(e.g. `~/domains/tohfetalbenaa.ae/.env`). `config/mail.php` checks that
location automatically. Then it can't be web-served even if `.htaccess` is ever
disabled.

---

## 6. Upload & verify

1. **Upload the whole project** to the web root (`public_html` or
   `~/domains/tohfetalbenaa.ae/public_html`). Include `contact-handler.php`,
   `config/`, `.htaccess`, `storage/`, and `vendor/` **or** `lib/PHPMailer/`.
2. **PHP version:** hPanel → *Advanced → PHP Configuration* → select **8.1+**.
3. **`storage/` writable:** it should already be (PHP runs as your user). If the
   log never appears, set `storage/` to `755` and `storage/` subfolders to `755`.
4. **Quick health check** — open in a browser:

   ```
   https://tohfetalbenaa.ae/contact-handler.php?health=1
   ```

   Expected once configured:

   ```json
   {
     "php": "8.2.x",
     "phpmailer_loaded": true,
     "smtp_configured": true,
     "storage_writable": true,
     "env_file_present": true
   }
   ```

   Any `false` points at the step to revisit. *(You can delete the health
   block from `contact-handler.php` after setup if you prefer — search for
   `?health` in that file.)*
5. **Send a real test** from `https://tohfetalbenaa.ae/contact.html`. You should
   see the green success message and the email should land in `info@`.
6. If it fails: set `TAB_MAIL_DEBUG=true` in `.env`, submit again, read
   `storage/mail.log` for the SMTP transcript, then set it back to `false`.

---

## 7. Deliverability (do this so mail doesn't land in spam)

In the DNS for `tohfetalbenaa.ae` (wherever the domain's DNS is managed —
Tasjeel, or Hostinger if you point it there):

- **SPF** — one `TXT` record on the root that authorises the sending server,
  e.g. `v=spf1 include:_spf.tasjeel... ~all` (get the exact `include:` from
  Tasjeel/Qamar).
- **DKIM** — enable it in Qamar webmail / hosting panel; publish the `TXT`
  record it gives you.
- **DMARC** — `TXT` at `_dmarc.tohfetalbenaa.ae`:
  `v=DMARC1; p=none; rua=mailto:info@tohfetalbenaa.ae`

These are about **DNS**, not this code, but without them contact emails often
get spam-filed.

---

## 8. Troubleshooting

| Symptom (in `storage/mail.log` with `TAB_MAIL_DEBUG=true`) | Fix |
|---|---|
| `SMTP connect() failed` / connection times out | Wrong `TAB_SMTP_PORT` / `TAB_SMTP_SECURE` pair. Try `465` + `ssl`, or `587` + `tls`. Confirm the host allows outbound SMTP. |
| `Could not authenticate` / `535` | Wrong `TAB_SMTP_USER` or `TAB_SMTP_PASS`. Use the full email as the username. Try an app-specific password. |
| `certificate verify failed` | The mail host has a mismatched TLS cert. Ask Tasjeel to fix it; as a **temporary** measure you can relax verification in `contact-handler.php` (search `SMTPSecure`) — not recommended long-term. |
| Form says *"isn't finished being set up"* | `phpmailer_loaded` or `smtp_configured` is `false` — see the health check. |
| Email sends but lands in spam | Section 7 (SPF / DKIM / DMARC). |
| `403` on submit | `TAB_ALLOWED_ORIGINS` doesn't include the host the form is served from (add `www.` or the staging domain). |
| Nothing in `storage/mail.log` at all | `storage/` isn't writable, or PHP isn't executing — check the health URL returns JSON, not raw PHP text. |

---

## 9. Optional upgrades (hooks are ready, not required)

- **reCAPTCHA / hCaptcha:** add the widget to the form, send its token as a
  field, and verify it near the top of section 2 in `contact-handler.php`
  before the honeypot check.
- **Auto-reply to the visitor:** after `$mail->send()`, send a second short
  PHPMailer message with `To` = `$email`, `From` = your mailbox.
- **Copy to a second inbox:** add `$mail->addBcc('...')`.
