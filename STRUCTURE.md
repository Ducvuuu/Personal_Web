# Personal Web — Project Structure

## Directory Layout

```
/
├── shared/
│   ├── shared.css        # Global styles: body bg, font utilities, sticky-note
│   ├── components.js     # Nav + footer injection (shared across all pages)
│   └── assets/           # Reserved for assets used across multiple pages
│
├── home/
│   ├── index.html        # Home page (hero, about blurb, work, writing, life/gallery)
│   ├── home.css          # Home-only styles: .hero-bg, .animate-gentle-float
│   ├── home.js           # Home-only JS: auto-age, hero year, masonry modal
│   └── assets/
│       ├── Cover Image.jpg   # Hero section background
│       ├── Avatar.png        # Profile avatar (novel character)
│       └── masonry1–11.jpg   # Life gallery images
│
└── about/
    ├── index.html        # About/bio page
    ├── about.css         # About-only styles (add here as the page grows)
    └── assets/
        └── cover-about.jpg   # About page header image
```

---

## How the shared system works

### Navigation & Footer — `shared/components.js`

Both nav and footer are injected by JavaScript. Each page needs two placeholder `<div>`s:

```html
<div id="site-nav"></div>    <!-- injected nav -->
<div id="site-footer"></div> <!-- injected footer -->
```

**Exception:** The home page has a *special hero nav* hardcoded inside the `<section class="hero-bg">` element — it overlays the cover photo. The `#site-nav` placeholder is **not** used on the home page. Only `#site-footer` is injected there.

**Active link detection** uses `window.location.pathname`. The logic in `components.js`:
```js
const currentSection = pathname.includes('/about') ? 'about' : 'home';
```
Extend this when adding new pages (e.g. `pathname.includes('/writing') ? 'writing' : ...`).

**Nav link hrefs** use relative paths from each page's folder:
```js
{ href: '../about/',        label: 'About'   }
{ href: '../home/#work',    label: 'Work'    }
{ href: '../home/#writing', label: 'Writing' }
{ href: '../home/#life',    label: 'Life'    }
```

---

## How each page loads its files

### Home (`home/index.html`)
```html
<link rel="stylesheet" href="../shared/shared.css">
<link rel="stylesheet" href="home.css">
...
<script src="../shared/components.js"></script>
<script src="home.js"></script>
```

### About (`about/index.html`)
```html
<link rel="stylesheet" href="../shared/shared.css">
<link rel="stylesheet" href="about.css">
...
<script src="../shared/components.js"></script>
<!-- no page-specific JS needed yet -->
```

---

## Design system

**Color palette** — Tailwind custom `warm` scale (configured inline in each HTML `<head>`):
| Token | Hex |
|---|---|
| warm-50 | `#fffbf7` |
| warm-100 | `#fdf5eb` |
| warm-200 | `#fbe8d4` |
| warm-300 | `#f5d3b3` |
| warm-400 | `#ebad7a` |
| warm-500 | `#e38847` |
| warm-600 | `#d56a31` |
| warm-700 | `#b15129` |
| warm-800 | `#8f4228` |
| warm-900 | `#4a2517` |

**Typography:**
- Body: `Outfit` (sans-serif)
- Handwriting/casual: `Caveat` → class `.font-handwriting`
- Bold headings: `Poppins` → class `.font-heavy`
- Code/mono: `JetBrains Mono` → Tailwind `font-mono`

**Key reusable classes** (defined in `shared/shared.css`):
- `.font-handwriting` — Caveat script
- `.font-heavy` — Poppins bold
- `.sticky-note` — cream card with washi tape pseudo-element (`::before`)

---

## Adding a new page

1. Create a new folder: `mkdir pagename/` and `mkdir pagename/assets/`
2. Copy an existing `index.html` as your starting template
3. Update the `<title>` and page content
4. Add `<link rel="stylesheet" href="pagename.css">` and create `pagename.css`
5. Add a script tag for `../shared/components.js`
6. Add the page's nav link in `shared/components.js` → `navLinks` array
7. Update the active-page detection logic in `components.js` if needed

---

## Tech stack

- **HTML5** — one `index.html` per page folder
- **Tailwind CSS** — loaded via CDN, configured inline in each `<head>`
- **Vanilla JS** — no frameworks, no build step
- **Font Awesome 6.4.0** — icons via CDN
- **Google Fonts** — Caveat, Outfit, Poppins, JetBrains Mono
