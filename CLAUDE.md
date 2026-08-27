# CLAUDE.md — Personal Web / Library

Instructions for editing this repo. Read before making any change.

---

## Project overview

A personal, single-user web library. Two main pages:
- `library/index.html` — book grid, upload, currently-reading hero
- `library/reader.html` — epub reader with RSVP speed-reading mode

No build step. No npm. No bundler. Everything is plain HTML/JS served from a static host.
Tailwind is loaded via CDN. Firebase compat SDK is loaded via CDN. Keep it that way.

---

## Architecture facts

- **Firebase Auth** gates both pages (email/password). The Firebase config block in each file is intentionally public — web API keys are safe to expose; security lives in Firestore rules.
- **Firestore** stores book metadata, reading progress, highlights, and RSVP scores.
- **Firebase Storage** holds epub files and cover images.
- **epub.js** renders the book in an iframe inside `#viewer`.
- **RSVP engine** lives entirely in the `<!-- ── RSVP INTEGRATION ── -->` script block at the bottom of `reader.html`. Do not split it out unless the user explicitly asks to refactor files.
- `shared/components.js` injects the site nav and footer. Do not duplicate nav/footer HTML.
- The home page has an owner-only edit toggle backed by the `siteContent/home` Firestore document.
  Every piece of user-facing home-page copy added in `home/index.html` or rendered by `home/home.js`
  must have a unique, stable `data-edit-key`, including copy inside cards and modals. The shared home
  edit functions apply saved HTML, toggle `contenteditable`, and save all such elements. If editable
  copy sits inside a button or link, its click handler must not activate that control when the keyed
  text itself is clicked in edit mode. Re-rendered content must call `applyContentOverrides()` and
  restore `contenteditable` while `editModeOn` is true.
- Keep homepage imagery performance-conscious: the above-the-fold hero is a preloaded local WebP;
  images below the fold use `loading="lazy"` and `decoding="async"`; modal video uses
  `preload="none"`. Gallery display and modal URLs should point to the optimized local WebP assets,
  not full-resolution originals or eager third-party copies.
- Each item in the home page's “Random things I make” section has a keyboard-accessible project
  card and a matching `random-project-modal`. Keep new entries inside `.random-project-list`, give
  every visible label a `data-edit-key`, suppress card/link activation when keyed copy is clicked in
  edit mode, trap focus inside the open modal, restore focus on close, and prefer lightweight CSS
  previews or lazy media over eager videos and large poster images.
- `library/RSVP.md` is the technical reference for the RSVP feature. Update it if you change the RSVP architecture.
- `journal/new.html` is the only creation gateway for journal entries. It permanently selects
  `template` or `html`; do not add an editor control that switches an existing entry between them.
- Journal entries created by the new flow store `schemaVersion: 2`, `authoringMode`, and
  `templateId`. Entries without those fields are legacy raw-HTML entries and must remain compatible.
- The `field-note` template stores its optional subtitle, epigraph, and image caption inside
  `templateData`. Its shared editor/reader presentation lives in `journal/field-note-template.css`.
- The `open-sky` template stores its optional subtitle in `templateData`. Its editor/reader design
  lives in `journal/open-sky-template.css`, and its fixed closing artwork lives under `journal/assets/`.
- The `open-canvas` template stores its subtitle plus every appearance value — `backgroundImage`,
  `closingArt`, `inkColor`, `accentColor`, `scrimOpacity`, `layoutMode`, `focalPoint`,
  `softenArtEdge` — in `templateData`. Its design lives in `journal/open-canvas-template.css`. It
  ships no bundled artwork: both images are uploaded per entry, and each has a graceful empty state.
- The `column` template stores its optional subtitle in `templateData`. Its warm editorial design
  lives in `journal/column-template.css`, uses the bundled background-only travel artwork under
  `journal/assets/`, and intentionally has no cover-image slot or author row.
- Template selection and editor behavior are dispatched by `templateId` in `journal/write.html`;
  template entry rendering is dispatched by `templateId` in `journal/entry.html`. `entry.html` uses
  `showEntryHost()` to reveal one host and hide the rest — don't hand-hide hosts in a renderer.
- `shared/rich-text.js` is the low-level rich-text engine: `RichText.sanitize()` plus the selection
  toolbar (`RichText.attach()`). Consumers pass their own command set and palette so each surface
  keeps its own character.
- **`shared/EDITOR.md` is the reference for the editor** — the capability table, the API,
  the storage contracts, and a step-by-step recipe for putting the editor in a new template
  or on a new surface. Read it before changing the editor or adding a template; update it
  when the component's behaviour changes.
- `shared/editor.js` is the shared writing surface built on it, and the single source of truth for
  what a template may contain. `Editor.mount()` gives a template body the toolbar, paste
  normalisation, inline photos and video embeds; `Editor.sanitizeFor(templateId, html)` is used by
  **both** `write.html` on save and `entry.html` on render. A template declares what it allows in
  `CAPABILITIES` — it never implements editing. Shelf and the home inline editors are the intended
  next consumers.
- **A template must style everything the toolbar can produce.** The toolbar is shared, the
  typography is not: if a template's stylesheet has no `h2` rule, its headings fall back to the
  browser's own and read as a bug. The required set is `p, h2, h3, blockquote, ul, ol, li, a, mark,
  hr` under the body class, plus the `--ed-*` overrides for figures and embeds. `open-sky` shipped
  without any of them and its headings were visibly broken until they were added.
- Editor command scope is deliberate: Word-style basics (headings, bold/italic/underline/strike,
  highlight, link, centre, clear, plus photo/video/divider on the insert menu) with **no font
  family, font size or justify controls** — those are the knobs that let an author fight the
  template's own typography.
- **The editor has two affordances, split by the question the author is asking.** Commands that
  change existing text live in the **selection toolbar**; commands that add new content live in the
  **insert menu**. `CAPABILITIES.commands` is three named rows — `blocks`, `marks`, `actions` — and
  all three are toolbar rows. `mount()` builds the `inserts` list separately (photo, video, divider)
  because the media commands close over the mounted body.
- **The toolbar appears on a selection, never on its own.** It shows only for a non-collapsed range,
  anchored above the selection, and hides when the selection collapses. Showing is deferred until
  `mouseup` — `selectionchange` fires on every mouse move during a drag, and a toolbar that
  re-anchored on each one is unreadable until the button comes up.
- **The `+` appears only on an empty block**, following the caret. One placement rule serves every
  template: just left of the caret, clamped to the viewport, which lands in the gutter where a
  template has one and beside the caret where it does not. Don't add per-template placement.
- The toolbar and the `+` are mutually exclusive by construction — one needs a selection, the other
  an empty block — which is what keeps a self-appearing panel from becoming noise.
- **Right-click is left alone.** Nothing intercepts `contextmenu`, so spelling suggestions and paste
  stay where authors expect them. An earlier version opened the toolbar on right-click; it fought
  the browser's own menu and hid the whole feature behind a gesture nobody expects in a text field.
- Undo and redo are **keyboard-only** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z). They are not selection
  commands, so they have no place in a selection toolbar.
- An earlier insert **tray pinned to the viewport** collided with the page's own fixed action bar.
  The `+` avoids that by being anchored to the caret's block and transient rather than persistent —
  don't reintroduce a pinned tray.
- Template journal content is sanitized by `RichText.sanitize()` when saved **and again when
  rendered**, so entries written under an older allowlist are held to the current one. Raw HTML
  and legacy entries intentionally retain executable-script behavior in `journal/entry.html`.
- Coloured text spans survive sanitizing only for templates whose config sets `richText: true`.
  Every other template gets the original colourless allowlist, and their spans are unwrapped.
- Video embeds store **only** `data-embed` (provider) and `data-embed-id` on an empty `<figure>`.
  The sanitizer empties that figure's children on every save and render, and the player is rebuilt
  as a sandboxed `youtube-nocookie` iframe by `Editor.hydrateEmbeds()` at render time. Never store
  an `<iframe>` in an entry, and never widen `PROVIDERS` without an id pattern that a path
  traversal cannot pass.
- Inline body photos are `<figure><img><figcaption>` and are restricted to Firebase Storage hosts by
  `RichText.normalizeImageSrc()`. The figcaption doubles as the image's alt text.
- **Commands do not use `document.execCommand`.** Every command mutates the DOM directly, because
  execCommand is deprecated, writes different markup per browser, and cannot be extended. The only
  two remaining calls are the mode switches in `RichText.init()`, which have no modern replacement.
- Removing an inline mark cannot use `extractContents()` alone: it splits an ancestor only when the
  range boundaries sit at different depths, so a selection inside a single text node leaves the mark
  intact. `removeMarkAround()` splits the mark around the node with `splitBefore`/`splitAfter`, then
  unwraps it. Adding a mark can still use extract-and-wrap.
- Because the engine owns its mutations, it owns undo — the browser's native history no longer tracks
  them. `RichText` keeps snapshots: commands record immediately before mutating, typing is recorded
  on `beforeinput` and coalesced so one undo removes a burst. Never record on `input` for typing; the
  character has already landed by then.
- Selections are saved as plain text offsets, not node references. Formatting rearranges elements but
  never the characters, so an offset survives a change that a node reference would not.
- Ctrl/Cmd+B/I/U/K, Ctrl+Z and Ctrl+Shift+Z are intercepted. The browser's own shortcuts would invoke
  the execCommand behaviour the engine replaced.
- A caret placed in a childless element does not survive `addRange()` in Chrome. `placeCaretIn()`
  seeds a `<br>`, and the sanitizer drops a trailing `<br>` once a block has real text.
- Markdown shortcuts (`# `, `## `, `> `, `---`) live in `INPUT_RULES` in `editor.js` and run on
  `input`, once the marker character has landed. There are deliberately no list rules — a diary is
  prose, and lists were left out of the toolbar for the same reason.
- Focus mode: the editor only reports that typing is happening, by setting `data-writing` on the root
  element. Each page marks its own chrome with `ed-fade`; the editor never decides what is chrome.
- `journal/write.html` also owns a manual immersive mode. It expands the active authoring surface,
  hides setup chrome, keeps a compact save/exit control, and restores the author's caret and scroll
  position on Escape or Ctrl/Cmd+Shift+F. This remains page behavior, not an `Editor.mount()` concern.
- `RichText.init()` sets both `styleWithCSS` and `defaultParagraphSeparator` — a page that mounts
  the editor does not need to set them, and must not rely on having done so.
- Text typed into an empty body lands outside any block, missing every paragraph rule the template
  defines. `Editor.ensureParagraph()` seeds one paragraph so the caret always starts inside a block,
  and the sanitizer's `wrapLoose` wraps any loose text that still reaches it — including in entries
  written before this existed.
- Use `Editor.isEmpty(html)` to ask whether an author actually wrote something. A seeded empty
  paragraph is not writing; a lone photo or video is. Never test `!content` — the seeded paragraph
  makes that always true.
- `write.html` autosaves drafts on a 2.5s debounce. Editing an **already published** entry never
  autosaves — that stays an explicit save — and a `beforeunload` guard covers both.
- Uploads go through the slot registry in `journal/write.html` (`uploadSlots`). A slot's `reflect()`
  is visual only and `commit()` is the only path that writes a persisted value — that split is what
  stops a `blob:` preview being saved if the entry is sealed mid-upload. Images are downscaled to
  the slot's `maxEdge` before upload.

---

## Rules — always follow these

### 1. Interactive elements must be keyboard-accessible

**Never use `<div onclick>` or `<span onclick>` for clickable things.**
Use `<button>` for actions, `<a href>` for navigation. These get keyboard focus, Enter/Space
handling, and correct screen reader roles for free.

```html
<!-- Wrong -->
<div class="cursor-pointer" onclick="openBook('123')">…</div>

<!-- Right -->
<button data-id="123" class="cursor-pointer">…</button>
<!-- or -->
<a href="reader.html?id=123">…</a>
```

### 2. Every icon-only button needs an accessible name

Any `<button>` or `<a>` whose only visible content is a FontAwesome `<i>` tag must have
`aria-label` on the interactive element, and `aria-hidden="true"` on the `<i>`.

```html
<!-- Wrong -->
<button onclick="toggleToc()" title="Table of contents">
    <i class="fa-solid fa-list"></i>
</button>

<!-- Right -->
<button onclick="toggleToc()" aria-label="Table of contents">
    <i class="fa-solid fa-list" aria-hidden="true"></i>
</button>
```

`title` is not a substitute for `aria-label` — it only shows on hover and is ignored by most
screen readers.

### 3. All form labels must be associated with their input

`<label>` elements need a `for` attribute that matches the input's `id`.

```html
<!-- Wrong -->
<label class="…">Email</label>
<input type="email" id="login-email" …>

<!-- Right -->
<label for="login-email" class="…">Email</label>
<input type="email" id="login-email" …>
```

### 4. Cover image alt text must include the book title

```html
<!-- Wrong -->
<img src="${book.coverUrl}" alt="Cover">

<!-- Right -->
<img src="${book.coverUrl}" alt="Cover of ${escHtml(book.title)}">
```

### 5. Decorative icons must be hidden from screen readers

Any `<i>` that is purely decorative (next to visible text, or inside a button with `aria-label`)
must have `aria-hidden="true"`.

```html
<button aria-label="Go back">
    <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
</button>
```

### 6. `escHtml` must escape single quotes

The current `escHtml()` in `index.html` does not escape `'`. This is an XSS risk when
interpolating values into inline event handlers like `onclick="openBook('${id}')"`. The fix
is twofold: escape single quotes, and prefer `data-*` attributes + delegated listeners over
inline handlers.

```js
// Always use this version:
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
```

And prefer:
```html
<!-- Instead of: onclick="openBook('${book.id}')" -->
<button data-book-id="${escHtml(book.id)}">…</button>
<!-- handled by a single delegated listener -->
```

### 7. Toggle buttons must reflect their state

Any button that toggles something on/off (highlight mode, RSVP mode, play/pause) must use
`aria-pressed` so screen readers announce the current state.

```html
<button id="highlight-btn" aria-pressed="false" aria-label="Highlight mode">…</button>
```

```js
btn.setAttribute('aria-pressed', String(highlightMode));
```

### 8. Never interpolate a colour into a `style` attribute without validating it

`escHtml` is **not** sufficient in a style context — `red;background:url(…)` passes it cleanly and
still injects a declaration. Run every colour through `RichText.normalizeColor()`, which returns
`#rrggbb` or `null`, and fall back to a default on `null`.

```js
// Wrong
style="--oc-ink:${escHtml(templateData.inkColor)}"

// Right
const ink = RichText.normalizeColor(templateData.inkColor) || '#f6f2ea';
style="--oc-ink:${ink}"
```

The same applies to any other value reaching a style or `data-*` attribute: narrow it to a known-safe
set first (see `CANVAS_FOCAL_POINTS` and the scrim clamp in `journal/entry.html`).

### 9. Pacing mode buttons must indicate the active selection

The five RSVP pacing buttons are a group of mutually exclusive choices. Use `aria-pressed`
(or `aria-current`) to mark the active one, and update it in `rsvpSetMode()`.

---

## Rules — don't do these

- **Don't add new inline `onclick=` handlers** to HTML if you can avoid it. Use `addEventListener`
  or a delegated listener instead. If you must use inline handlers to stay consistent with
  surrounding code, that's acceptable — just don't make it worse.
- **Don't add a build step, npm, or a bundler** unless the user explicitly asks.
- **Don't split HTML files into separate JS/CSS files** unless the user explicitly asks to
  refactor the file structure.
- **Don't touch the Firebase config block** — it is intentionally in the HTML.
- **Don't add comments explaining what code does** — only add comments for non-obvious WHY.
- **Don't modify `shared/components.js`** without checking both pages still render correctly.
- **Don't add new global state variables** without noting them in the State section comment
  at the top of whichever script block you're editing.

---

## Known tech debt — don't fix unless asked

These are acknowledged issues. Don't "clean them up" during an unrelated task.

- Inline `onclick=` handlers throughout both files (pre-dates these guidelines).
- Settings panel and modals lack focus traps (keyboard focus can escape behind overlays).
- `<label>` elements in auth forms are not associated with inputs via `for` attribute.
- Tailwind config is duplicated between `index.html` and `reader.html`.
- No `aria-pressed` on highlight / RSVP toggle buttons yet.
- `reader.html` is ~1,500 lines; RSVP and epub logic are in the same file.

---

## How to test changes

1. Open `library/index.html` and `library/reader.html` via a local server (e.g. VS Code
   Live Server, or `python -m http.server`). Firebase Auth requires a real origin — file://
   will not work.
2. Log in with the test account.
3. For `index.html`: verify book grid renders, filter tabs work, drag-and-drop overlay appears.
4. For `reader.html`: verify a book loads, page turning works, RSVP activates and plays.
5. Keyboard-test any interactive element you changed: Tab to it, press Enter/Space.
6. Check the browser console for errors before reporting done.

---

## Colour palette reference

```
warm-50  #fffbf7    warm-100 #fdf5eb    warm-200 #fbe8d4
warm-300 #f5d3b3    warm-400 #ebad7a    warm-500 #e38847
warm-600 #d56a31    warm-700 #b15129    warm-800 #8f4228
warm-900 #4a2517
```

Background: `#eaddd7` (index), `#fdfcf6` (reader sepia default).
Accent: `orange-500` / `orange-600` for progress, active states, and the RSVP pivot letter.
