# Tohfet Al Benaa — Website

Static marketing site for **Tohfet Al Benaa Contracting & General Maintenance L.L.C.**,
a licensed Abu Dhabi general contractor (villa construction, renovation, roofing,
stone & mortar building, damage repair, window installation).

## Structure

```
.
├── index.html              # English homepage
├── about.html
├── services.html
├── projects.html
├── contact.html
├── ar/                     # Arabic (RTL) versions of every page
├── assets/
│   ├── css/style.css
│   ├── js/main.js
│   └── images/             # brand, hero, process, projects
├── robots.txt
└── sitemap.xml
```

## Local preview

It's a plain static site — open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Contact form

The contact page posts to a small PHP endpoint (`contact-handler.php`) that
sends the inquiry to `info@tohfetalbenaa.ae` over authenticated SMTP using
PHPMailer. It needs a PHP host (Hostinger) — it does **not** run under
`python -m http.server`, so in local preview the form shows a "works once
deployed" notice instead of sending.

Setup and Hostinger deployment steps: **[`CONTACT_FORM_SETUP.md`](CONTACT_FORM_SETUP.md)**.
Credentials live only in a git-ignored `.env` (template: `.env.example`).

## Deploy

Publish the repository root as-is (canonical domain: `https://tohfetalbenaa.ae`).
The marketing pages are fully static; only `contact-handler.php` needs PHP.
Before go-live, follow `CONTACT_FORM_SETUP.md` (install PHPMailer, create
`.env`).
