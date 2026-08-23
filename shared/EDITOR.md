# The shared editor

One writing surface, used by every journal template. A template declares **what it
allows** and **how it looks**. It never implements editing.

```
shared/rich-text.js   engine — sanitizer, commands, history, toolbar + insert menu
shared/rich-text.css  toolbar and insert-menu chrome
shared/editor.js      writing surface — capabilities, photos, embeds, input rules
shared/editor.css     media chrome — figures, embeds, drop state, focus fade
```

`editor.js` is the layer you talk to. `rich-text.js` is the engine underneath; reach
for it directly only when adding a command or changing how markup is produced.

---

## Quick start

Three things: load the files, mount the body, sanitize on render.

**1. In the page that writes** (`<head>`, then before your page script):

```html
<link rel="stylesheet" href="../shared/rich-text.css">
<link rel="stylesheet" href="../shared/editor.css">
...
<script src="../shared/rich-text.js"></script>
<script src="../shared/editor.js"></script>
```

**2. Mount the body** — one call per editable body:

```js
Editor.mount(document.getElementById('my-body-editor'), {
    templateId: 'my-template',
    uploadImage: uploadBodyImage,   // async (File) => https URL, or omit for no photos
    onChange:    scheduleAutosave,
    onStatus:    setSaveStatus,     // (phase, message)
    palette:     MY_COLOURS         // only used if the template allows colour
});
```

**3. Save and render through the same function:**

```js
// on save
const content = Editor.sanitizeFor(templateId, bodyEl.innerHTML);

// on render
host.innerHTML = `<div class="my-body ed-content">${Editor.sanitizeFor(entry.templateId, entry.content)}</div>`;
Editor.hydrateEmbeds(host);
```

Sanitizing on **both** sides is deliberate: an entry written under an older allowlist
is held to the current one when it is displayed, not trusted from storage.

---

## Capabilities

`CAPABILITIES` in `editor.js` is the single source of truth for what a template may
contain. `write.html` reads it on save and `entry.html` reads it on render, so the two
cannot drift.

```js
'my-template': {
    commands: TEXT_COMMANDS,        // named selection-toolbar rows
    align:    true,                 // permits text-align: center on a block
    colors:   false,                // permits coloured spans
    media:    ['image', 'embed']    // inline photos, video embeds
}
```

`commands` is three named rows, and every one of them **changes text that already
exists** — which is why they live in the selection toolbar.

```js
const TEXT_COMMANDS = {
    blocks:  ['h2', 'h3', 'quote'],
    marks:   ['bold', 'italic', 'underline', 'strike', 'highlight'],
    actions: ['link', 'alignCenter', 'clear']
};
```

Anything that brings **new content** into the entry belongs to the insert menu instead.
`mount()` builds that list per body — photo and video need the mounted element, so they
cannot be declared in the static table — and passes it as `inserts`:

```js
const INSERT_COMMANDS = ['hr'];
const inserts = media.concat(INSERT_COMMANDS);   // Photo, Video, Section divider
```

The split is the whole design. A template does not choose it; it only chooses which
commands it offers on the toolbar side.

Give a template its own object to offer less: `{ blocks: [], marks: ['bold', 'italic'],
actions: ['link', 'clear'] }` is a legitimate minimal surface. Dropping `media` drops the
matching insert-menu entries with it, and a template with no inserts at all simply never
shows the `+`.

**What is deliberately absent:** no font family, no font size, no justify, no lists.
The first three let an author fight the template's own typography. Lists were left out
because a diary is prose — and that is also why there is no `- ` markdown rule.

---

## Adding a new journal template

Six steps. `journal/index.html` and `writing/index.html` list entries generically and
need no change at all.

### 1. `journal/<name>-template.css`

Define every colour as a custom property on the root class, so the template can be
recoloured later without a retrofit.

**Style everything the editor can produce.** This is the contract, and the one that has
actually been broken before: `open-sky` shipped without heading rules and its headings
fell back to the browser's own serif, which read as a broken feature rather than a design.

| Required under your body class | Produced by |
|---|---|
| `p`, `h2`, `h3`, `blockquote` | headings and quote commands |
| `ul`, `ol`, `li` | pasted content (no list commands exist) |
| `a`, `mark` | link and highlight commands |
| `hr` | the insert menu's divider and the `---` rule |

Then override the media variables so photos and embeds belong to your surface:

```css
.my-body {
    --ed-rule:        rgba(…);   /* divider and figure rules   */
    --ed-caption:     rgba(…);   /* figcaption text            */
    --ed-placeholder: rgba(…);   /* empty caption hint         */
    --ed-shadow:      0 20px 46px rgba(…);
    --ed-mark-bg:     rgba(…);   /* highlight background       */
    --ed-mark-ink:    #…;        /* highlight text             */
}
```

### 2. `shared/editor.js` — one row in `CAPABILITIES`

```js
'my-template': { commands: TEXT_COMMANDS, align: true, colors: false, media: ['image', 'embed'] }
```

### 3. `journal/new.html` — a card in the grid

```html
<a href="write.html?mode=template&amp;template=my-template">…</a>
```

### 4. `journal/write.html` — editor markup and wiring

- `<link>` your CSS.
- Add the editor markup. The body element needs `contenteditable="true"`,
  `role="textbox"`, `aria-multiline="true"`, an `aria-label`, and a `data-placeholder`.
- Add a `templateConfigs` entry: `editorId`, `titleId`, `bodyId`, `populate`,
  `collectData`, `update`.
- Add a `BODY_TEMPLATES` row so the body gets mounted:

```js
const BODY_TEMPLATES = {
    'my-body-editor': 'my-template'
};
```

- In `populate()`, after setting `innerHTML`, call `Editor.renderEmbedPreviews(bodyEl)`
  and `Editor.ensureParagraph(bodyEl)`.
- Mark page chrome that should fade while writing with the `ed-fade` class.
- Nothing else is needed for the toolbar or the `+`: both bind at the document level and
  find their editor from the current selection.

### 5. `journal/entry.html` — the renderer

- `<link>` your CSS.
- Add a host `<div>` and register it in `ENTRY_HOSTS`.
- Add a `templateRenderers` entry, and call `showEntryHost('<id>-entry-host')` at the
  top of the renderer — never hand-hide the other hosts.
- Give the body container the `ed-content` class. Without it, photos and embeds get no
  styling at all.

### 6. Document it

`CLAUDE.md` and `STRUCTURE.md`: say what your template stores in `templateData`.

---

## Using the editor outside the journal

Shelf and the home inline editors are the intended next consumers. Nothing about the
component is journal-specific — the only journal-shaped part is the `CAPABILITIES` key,
which is just a string.

```js
Editor.mount(noteBody, { templateId: 'shelf-note', onChange: save });
```

Add a `'shelf-note'` row to `CAPABILITIES`, give the container the `ed-content` class,
style the required elements, and sanitize with `Editor.sanitizeFor('shelf-note', html)`
on both save and render. Omit `uploadImage` and leave `media: []` for a text-only surface.

---

## API

| Call | Purpose |
|---|---|
| `Editor.mount(body, options)` | Attach the toolbar, paste handling, input rules, drop target, focus mode |
| `Editor.sanitizeFor(templateId, html)` | The allowlist for that template — use on save **and** render |
| `Editor.sanitizeOptionsFor(templateId)` | The raw options, if you need to pass them on |
| `Editor.capabilitiesFor(templateId)` | The capability row, falling back to `field-note` |
| `Editor.hydrateEmbeds(root)` | Render time: build the real players |
| `Editor.renderEmbedPreviews(root, onRemove)` | Editor time: build inert poster cards |
| `Editor.ensureParagraph(body)` | Seed a paragraph so the caret starts inside a block |
| `Editor.isEmpty(html)` | Did the author write anything? |
| `Editor.detectEmbed(url)` | `{ provider, id }` or `null` |

`mount` options: `templateId`, `uploadImage`, `onChange`, `onStatus`, `palette`.

Engine-level, from `rich-text.js`: `RichText.sanitize`, `RichText.normalizeColor`,
`RichText.normalizeImageSrc`, `RichText.undo`, `RichText.redo`, `RichText.record`,
`RichText.setBlock`, `RichText.insertHTML`, `RichText.blockFor`, `RichText.hide`.

---

## What the author gets

Two affordances, each appearing only when the author is in a position to want it.

- **Selection toolbar** — select text and it appears above the selection: headings,
  quote, bold, italic, underline, strike, highlight, link, centre, clear. It goes away
  when the selection collapses, and it waits for the mouse button to come up rather than
  chasing the selection mid-drag. Typing, Escape, or scrolling dismisses it.
- **Insert menu** — a `+` follows the caret onto any **empty** block and opens a labelled
  menu: photo, video, section divider. One placement rule serves every template — just
  left of the caret, which lands in the gutter where a template has one and beside the
  caret where it does not.
- **Right-click belongs to the browser again.** Spelling suggestions and paste are back
  where authors expect them; nothing intercepts `contextmenu`.
- **Shortcuts** — Ctrl/Cmd+B, I, U, K; Ctrl+Z and Ctrl+Shift+Z. Undo and redo are
  keyboard-only: they are not selection commands, so they are not in the selection toolbar.
- **Markdown** — `# ` and `## ` for headings, `> ` for a quote, `---` for a divider.
- **Photos** — insert menu, paste, or drag-and-drop.
- **Video** — paste a YouTube or Vimeo link, or use the insert menu.
- **Focus mode** — chrome fades while typing, returns on any pause or pointer movement.

---

## Invariants — do not break these

**Storage contracts**

- A video embed stores **only** `data-embed` and `data-embed-id` on an empty `<figure>`.
  The sanitizer empties that figure's children on every save and every render, and the
  player is rebuilt as a sandboxed `youtube-nocookie` iframe at render time. Never store
  an `<iframe>`. Never widen `PROVIDERS` without an id pattern a path traversal cannot pass.
- Inline photos are `<figure><img><figcaption>`, restricted to Firebase Storage hosts by
  `RichText.normalizeImageSrc()`. The figcaption doubles as the image's alt text.
- A photo URL is inserted **only after the upload resolves**, so a `blob:` preview can
  never reach storage. All three routes — button, paste, drop — share `insertImageFile()`.
- Never interpolate a colour into a `style` attribute without `RichText.normalizeColor()`.
  `escHtml` does not protect a style context.

**Engine**

- Commands do not use `document.execCommand`. The only two remaining calls are the mode
  switches in `RichText.init()`, which have no modern replacement.
- Removing an inline mark needs real element splitting. `extractContents()` splits an
  ancestor only when the range boundaries sit at different depths, so a selection inside
  one text node leaves the mark whole. Use `removeMarkAround()`. Adding a mark can still
  extract-and-wrap.
- The engine owns undo, because the browser no longer tracks mutations it did not make.
  Commands record immediately before mutating; typing records on `beforeinput` — never on
  `input`, where the character has already landed — and coalesces on a 600ms idle.
- Selections are saved as plain text offsets, not node references. Formatting rearranges
  elements but never the characters.
- The toolbar shows only for a **non-collapsed** selection, and the `+` only for an
  **empty** block. The two can never be on screen together, which is what keeps a
  self-appearing panel from being noise: each one means the author is already in the
  situation it serves.
- Showing the toolbar is deferred while a drag is in progress. `selectionchange` fires on
  every mouse move during a drag, and a toolbar that re-anchored on each one is unreadable
  until the button comes up. Keyboard selection has no such phase and is not deferred.
- Both panels are dismissed on `beforeinput`, scroll, resize, Escape, and a blur that
  lands outside them. The blur check is deferred a tick: clicking the toolbar blurs the
  editor before the command runs, so an immediate hide would eat the click.
- A caret placed in a childless element does not survive `addRange()` in Chrome.
  `placeCaretIn()` seeds a `<br>`; the sanitizer drops a trailing `<br>` once the block
  has real text.
- `RichText.init()` owns `styleWithCSS` and `defaultParagraphSeparator`. A page that
  mounts the editor must not rely on having set them itself.

**Emptiness**

Use `Editor.isEmpty(html)`, never `!content`. A seeded empty paragraph is not writing;
a lone photo or video is.

---

## Testing

There is no test runner in the repo — no build step, by design. Changes to the engine
were verified by driving a real browser (headless Chromium via Playwright) against a
scratch page that loads `rich-text.js` and `editor.js`, asserting on the resulting HTML.

Worth re-checking after any engine change:

- The toolbar appearing on a mouse drag and on shift+arrow, and staying away mid-drag.
- The `+` appearing on an empty block, going once the block has text, and returning on
  the next empty one — including on a template with no left gutter.
- Bold a word, mid-word, and across two paragraphs.
- Unbold from *inside* a longer bold run — this is the case that silently did nothing
  before the mark-splitting fix.
- Undo after a command, and after a typing burst (one undo should clear the burst).
- Each markdown rule, and a `#` mid-line, which must be left alone.
- A dropped and a pasted photo.
- The sanitizer's rejections: script, iframe, `onclick`, `javascript:`, an external image
  host, a path-traversal embed id, and a lookalike host like `youtube.com.evil.test`.

Firebase paths — a real upload, a real draft write — cannot be exercised from a sandbox
and need a manual pass in the browser.
