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
- `library/RSVP.md` is the technical reference for the RSVP feature. Update it if you change the RSVP architecture.

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

### 8. Pacing mode buttons must indicate the active selection

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
