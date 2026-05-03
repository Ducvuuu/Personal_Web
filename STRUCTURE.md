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
├── about/
│   ├── index.html        # About/bio page
│   ├── about.css         # About-only styles (add here as the page grows)
│   └── assets/
│       └── cover-about.jpg   # About page header image
│
└── library/
    ├── index.html        # Library home — book grid, upload, currently-reading hero
    ├── index.js          # All JS for index.html (auth, book loading, rendering, upload, filters)
    ├── reader.html       # Epub reader — markup only, no inline scripts
    ├── reader.js         # All JS for reader.html (auth, epub init, progress, highlights, TOC, settings)
    ├── rsvp.js           # RSVP speed-reading engine (Gemini scoring, playback, epub sync)
    └── RSVP.md           # Technical reference for the RSVP feature
```

---

## Library page

A private, Firebase-gated epub library. Separate from the rest of the site — it has its own
auth, its own Firebase project, and does not share styles with `home/` or `about/`.

### Files

| File | Role |
|---|---|
| `index.html` | Markup for the library home. Book grid, upload modal, currently-reading hero, auth gate, drag-and-drop overlay. No inline scripts. |
| `index.js` | All logic for `index.html`. Firebase init + auth, loading and rendering books, filter tabs, epub upload pipeline (metadata extraction, Storage upload, cover upload, Firestore write), book details modal (title, author, category, manual cover upload — shown before any Firebase write to prevent orphaned files), `escHtml()` XSS helper. |
| `reader.html` | Markup for the epub reader. Top nav, TOC panel, settings panel, RSVP player panel (floating + draggable on desktop, full-width slide-in on mobile), RSVP prep modal, epub viewer area, bottom progress bar. No inline scripts. |
| `reader.js` | All reader logic. Firebase init + auth, epub.js initialisation, theme/font/font-size settings, page navigation, reading progress tracking + Firestore save, highlights, TOC generation. Exposes globals (`rendition`, `epubBook`, `bookDoc`, `bookId`, `db`) that `rsvp.js` reads. |
| `rsvp.js` | Self-contained RSVP engine. Depends on `db`, `bookId`, `bookDoc`, `rendition`, `epubBook` from `reader.js`. Handles text extraction, Gemini scoring (`gemini-2.5-flash-lite`), Firestore score cache, flat word-array construction, playback loop, epub iframe sync via `postMessage`. See `RSVP.md` for the full technical reference. |
| `RSVP.md` | Technical reference: architecture, Gemini prompt format, Firestore cache schema, word-array shape, playback timing, epub postMessage protocol, ORP algorithm, cost model. Update this when changing the RSVP architecture. |

### Load order in `reader.html`

```html
<!-- CDN libraries first -->
<script src="firebase-app-compat.js"></script>
<script src="firebase-auth-compat.js"></script>
<script src="firebase-firestore-compat.js"></script>
<script src="jszip.min.js"></script>
<script src="epub.min.js"></script>

<!-- Page scripts — order matters: reader.js sets globals that rsvp.js uses -->
<script src="reader.js"></script>
<script src="rsvp.js"></script>
```

### External services

| Service | Purpose |
|---|---|
| Firebase Auth | Email/password gate on both pages |
| Firestore | Book metadata, reading progress, highlights, RSVP score cache |
| Firebase Storage | Epub files (`library/books/`) and cover images (`library/covers/`) |
| Gemini API (`gemini-2.5-flash-lite`) | Sentence complexity scoring for RSVP pacing |

The Firebase config (API key etc.) is hardcoded in `index.js` and `reader.js`. This is
intentional — web API keys are public by design; security lives in Firestore rules.
The Gemini API key is stored in Firestore at `_config/App.geminiApiKey` and fetched at
runtime, never hardcoded.

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
