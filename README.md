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

## Deploy

Publish the repository root as-is to any static host (canonical domain:
`https://tohfetalbenaa.ae`).
