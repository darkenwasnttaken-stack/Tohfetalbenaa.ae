# `lib/` — PHPMailer (only needed if you are NOT using Composer)

`contact-handler.php` sends mail with **PHPMailer**. It looks for the library in
two places, in this order:

1. `vendor/autoload.php` &nbsp;— created by Composer (preferred)
2. `lib/PHPMailer/src/` &nbsp;— a manual drop-in (this folder)

You only need **one** of them.

---

## Option A — Composer (recommended, one command)

On Hostinger you can run Composer from **hPanel → Advanced → SSH Access**, or
from **hPanel → Website → Advanced → Composer** (older panels):

```bash
cd ~/public_html        # or wherever the site's files live
composer require phpmailer/phpmailer
```

That creates `vendor/`. Nothing else to do — `contact-handler.php` finds it
automatically. `vendor/` is git-ignored; re-run the command after a fresh
deploy that doesn't include it.

---

## Option B — Manual drop-in (no Composer, no SSH)

1. Download the latest **PHPMailer** release ZIP:
   <https://github.com/PHPMailer/PHPMailer/releases> → asset `PHPMailer-x.y.z.zip`
2. Open the ZIP. Inside is a `src/` folder containing `PHPMailer.php`,
   `SMTP.php`, `Exception.php` (and a few more `.php` files).
3. Copy that whole `src/` folder to:

   ```
   lib/PHPMailer/src/
   ```

   Final layout:

   ```
   lib/
   └── PHPMailer/
       └── src/
           ├── PHPMailer.php
           ├── SMTP.php
           ├── Exception.php
           └── ... (the other files from the release's src/)
   ```

4. Upload `lib/` with the rest of the site. Done — the handler will use it.

`lib/PHPMailer/` is git-ignored so the library isn't committed to the repo;
this `README.md` is kept.
