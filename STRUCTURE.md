# Personal Web — Project Structure

## Directory Layout

```
/
├── shared/
│   ├── shared.css        # Global styles: body bg, font utilities, sticky-note
│   ├── components.js     # Nav + footer injection (shared across all pages)
│   ├── rich-text.js      # Sanitizer + contenteditable selection toolbar
│   ├── rich-text.css     # Selection toolbar chrome
│   ├── editor.js         # Shared writing surface: capabilities, photos, embeds
│   ├── editor.css        # Editor media chrome: figures, embeds, insert tray
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
├── journal/
│   ├── index.html        # Private journal desk, drafts, chronicle, and atlas
│   ├── new.html          # Permanent authoring-mode choice for new entries
│   ├── write.html        # Template or raw-HTML editor, selected per entry
│   ├── entry.html        # Private/public entry renderer
│   ├── field-note-template.css # Shared Field Note editor/reader design
│   ├── open-sky-template.css # Shared Open Sky editor/reader design
│   ├── open-canvas-template.css # Shared Open Canvas editor/reader design
│   ├── assets/
│   │   └── open-sky-horizon.png # Open Sky closing landscape artwork
│   └── migrate.html      # Legacy Firestore collection migration utility
│
├── writing/
│   └── index.html        # Public showcase of featured journal entries
│
└── library/
    ├── index.html        # Library home — book grid, upload, currently-reading hero
    ├── index.js          # All JS for index.html (auth, book loading, rendering, upload, filters)
    ├── reader.html       # Epub reader — markup only, no inline scripts
    ├── reader.js         # All JS for reader.html (auth, epub init, progress, highlights, TOC, settings)
    ├── rsvp.js           # RSVP speed-reading engine (Gemini scoring, playback, epub sync)
    └── RSVP.md           # Technical reference for the RSVP feature
```

### Journal authoring modes

Every new journal entry permanently chooses one authoring mode in `journal/new.html`:

- `template` — focused content editor using a stable `templateId`. `field-note` uses a sticky,
  height-limited cover on desktop and a fixed-height cover above the paper on mobile. `open-sky`
  provides a borderless night-sky canvas whose illustrated horizon follows the final paragraph.
  `open-canvas` is photographic: the author supplies the backdrop and closing artwork and sets the
  ink and accent colours, so nothing about its look is bundled.
- `html` — raw HTML editor with preview. Custom scripts retain the legacy behavior.

New documents store `schemaVersion: 2`, `authoringMode`, and `templateId`. Documents without
these fields are legacy entries and continue to edit and render as raw HTML without migration.
The title, location, weather, visibility, and featured status use the same Firestore fields in both
modes. Template-specific values are grouped under `templateData`: Field Note stores subtitle,
epigraph, and image caption; Open Sky stores its optional subtitle; Open Canvas stores its subtitle
plus `backgroundImage`, `closingArt`, `inkColor`, `accentColor`, `scrimOpacity`, `layoutMode`,
`focalPoint` and `softenArtEdge`.

### Open Canvas appearance

| Value | Range | Empty / invalid falls back to |
|---|---|---|
| `backgroundImage` | Storage URL | Dusk gradient |
| `closingArt` | Storage URL | Section omitted entirely |
| `inkColor` / `accentColor` | `#rrggbb` | `#f6f2ea` / `#ffd36f` |
| `scrimOpacity` | 0–80 | 42 (clamped, never rejected) |
| `layoutMode` | `panel` \| `bare` | `panel` |
| `focalPoint` | 9 `object-position` keywords | `center` |
| `softenArtEdge` | boolean | `true` |

`panel` puts the text on a translucent frosted card, which stays readable over any photograph.
`bare` sets it directly on the backdrop and leans on the scrim. Every colour in the stylesheet
resolves from `--oc-ink` and `--oc-accent`, so those two values drive the whole surface.

On upload the backdrop is sampled down to a single pixel to estimate luminance, and the ink is
switched to light or dark accordingly — but only until the author picks a colour themselves.

### The shared editor — `shared/editor.js`

One writing surface, mounted by every template. Templates say *what they allow*; they never
implement editing.

```js
Editor.mount(bodyEl, { templateId, palette, uploadImage, onChange, onStatus });
Editor.sanitizeFor(templateId, html);   // save AND render both go through this
Editor.hydrateEmbeds(root);             // render time: build the real players
```

`CAPABILITIES` is the single source of truth for what a template may contain — `write.html` reads it
on save and `entry.html` reads it on render, so the two can no longer drift.

| Capability | Meaning |
|---|---|
| `commands` | Toolbar groups. Word-style basics only — no font family, size, or justify |
| `align` | Permits `text-align: center` on a block |
| `colors` | Permits coloured spans; the palette itself is passed in at mount |
| `media` | `image` for inline photos, `embed` for video |

**Inline photos** are `<figure><img><figcaption>`, restricted to Firebase Storage hosts by
`RichText.normalizeImageSrc()`. The URL is inserted only once the upload resolves, so a `blob:`
preview can never be stored — the same discipline the cover-image slots use. The caption doubles as
the image's alt text.

**Video embeds** store nothing executable. Saved markup is an inert placeholder:

```html
<figure data-embed="youtube" data-embed-id="dQw4w9WgXcQ"></figure>
```

The sanitizer empties that figure's children on every save *and* every render, keeping only a
provider from `PROVIDERS` and an id its own `valid()` pattern accepts. `Editor.hydrateEmbeds()`
rebuilds a sandboxed, `youtube-nocookie`, lazy-loaded iframe at render time; the editor shows an
inert poster card instead. Adding a service means adding one row to `PROVIDERS`.

**The engine no longer uses `document.execCommand`.** Commands mutate the DOM directly — execCommand
is deprecated, writes browser-specific markup, and cannot be extended. Two mode switches remain in
`RichText.init()` (`styleWithCSS`, `defaultParagraphSeparator`) because nothing replaces them.

Two consequences worth knowing before touching the engine:

- **Removing a mark needs real element splitting.** `extractContents()` splits an ancestor only when
  the range boundaries sit at different depths; a selection inside one text node leaves the mark
  whole. `removeMarkAround()` splits it with `splitBefore`/`splitAfter`, then unwraps. Adding a mark
  can still extract-and-wrap.
- **The engine owns undo.** The browser's history does not track mutations it did not make, so
  `RichText` keeps its own snapshots. Commands record immediately before mutating; typing records on
  `beforeinput` (never `input` — the character has already landed) and coalesces on a 600ms idle, so
  one undo removes a burst rather than one letter. Selections are stored as plain text offsets, which
  survive the element rearrangement that a node reference would not.

```js
RichText.undo(editor);  RichText.redo(editor);  RichText.record(editor, immediate);
```

**Typed shortcuts** live in `INPUT_RULES` in `editor.js`: `# ` and `## ` for headings, `> ` for a
quote, `---` for a divider. They run on `input`, once the marker has landed, and only in a plain
paragraph. There are no list rules on purpose — lists are absent from the toolbar for the same
reason, because a diary is prose.

**Photos** arrive three ways: the tray button, a paste, or a drag-and-drop — all through one
`insertImageFile()`, so the upload-then-insert discipline holds for each. A drop places the caret
where the cursor was, so the photo lands where it was dropped.

**Focus mode** is a division of labour: the editor sets `data-writing` on the root element while
typing and clears it on any pause or pointer movement. Each page marks its own chrome with `ed-fade`
— `editor.css` supplies the fade, the page decides what fades. Reduced motion drops the transition,
not the dimming.

**Every template must style what the toolbar can produce.** The editor is shared; the typography
is not. A template whose stylesheet lacks an `h2` rule gets the browser's default heading, which
reads as a broken feature rather than a design choice — this is exactly how `open-sky` shipped.

| Must be styled under the body class | Comes from |
|---|---|
| `p`, `h2`, `h3`, `blockquote`, `ul`, `ol`, `li` | headings, quote and list commands |
| `a`, `mark` | link and highlight commands |
| `hr` | the divider command |
| `--ed-rule`, `--ed-caption`, `--ed-placeholder`, `--ed-shadow`, `--ed-mark-bg`, `--ed-mark-ink` | photos and embeds, styled by `editor.css` |

**Paragraph discipline.** Typing into an empty `contenteditable` produces a bare text node with no
block of its own, so it misses every paragraph rule — and the drop cap with it. Two defences:
`Editor.ensureParagraph()` seeds one paragraph on mount and focus, and the sanitizer's `wrapLoose`
wraps any loose text that still arrives, which also repairs older entries on render.
`RichText.init()` owns `defaultParagraphSeparator`, so Enter yields `<p>` rather than a `<div>` the
sanitizer would unwrap.

`Editor.isEmpty(html)` answers "did the author write anything?" — the seeded paragraph counts as
empty, a lone photo or video does not. Testing `!content` instead will always look non-empty.

**Autosave** runs on a 2.5s debounce in `write.html`, reusing `saveDraft()`. Editing an already
published entry never autosaves — that stays an explicit save — and a `beforeunload` guard covers
unsaved work in both cases.

### Rich text — `shared/rich-text.js`

A selection toolbar (bold, italic, link, clear, colour swatches, custom picker) plus the sanitizer
used by every template.

```js
RichText.attach(el, { palette: [{ name, value }], onChange });
RichText.sanitize(html, { allowColor: true });
RichText.normalizeColor(value);   // '#rrggbb' or null
```

The engine and sanitizer are shared; the **palette is per-surface** so colours stay on-brand.
Sanitizing runs on save *and* on render. Colour spans survive only when the template config sets
`richText: true` — `open-canvas` is the only one today, so Field Note and Open Sky keep the
original colourless allowlist.

`normalizeColor()` validates by assigning to a CSSOM property and resolving through a canvas
`fillStyle`, so the browser's own parser rejects anything that is not a bare colour. Use it for any
value heading into a `style` attribute; `escHtml` does not protect a style context.

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

## Adding a new journal template

The editor comes for free — you design the look and declare what it allows.
`journal/index.html` and `writing/index.html` list entries generically and need no change.

1. `journal/<name>-template.css` — define every colour as a custom property on the root class so the
   template can be recoloured later without a retrofit. Style every element in the table above, and
   override the `--ed-*` variables on the body container so shared photos and embeds sit correctly
   on your surface
2. `shared/editor.js` — one row in `CAPABILITIES` saying what the template allows
3. `journal/new.html` — a card in the grid linking to `write.html?mode=template&template=<id>`
4. `journal/write.html` — `<link>` the CSS, add the editor markup, add a `templateConfigs` entry
   (`editorId`, `titleId`, `bodyId`, `populate`, `collectData`, `update`) and a `BODY_TEMPLATES` row
   so the body gets mounted
5. `journal/entry.html` — `<link>` the CSS, add a host `<div>`, add a `templateRenderers` entry, call
   `showEntryHost('<id>-entry-host')` at the top of the renderer, and give the body container the
   `ed-content` class
6. `CLAUDE.md` + `STRUCTURE.md` — document what the template stores in `templateData`

Validate anything from `templateData` that reaches a `style` or `data-*` attribute before it goes in.

## Tech stack

- **HTML5** — one `index.html` per page folder
- **Tailwind CSS** — loaded via CDN, configured inline in each `<head>`
- **Vanilla JS** — no frameworks, no build step
- **Font Awesome 6.4.0** — icons via CDN
- **Google Fonts** — Caveat, Outfit, Poppins, JetBrains Mono
