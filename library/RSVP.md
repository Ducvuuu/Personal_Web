# RSVP Speed-Reading — Technical Reference

> RSVP logic lives in `library/rsvp.js`. The injected iframe script lives inside
> `registerThemes()` in `library/reader.js`. `rsvp.js` depends on globals
> (`db`, `bookId`, `bookDoc`, `rendition`, `epubBook`) set by `reader.js`.

---

## Table of Contents

1. [What is RSVP?](#1-what-is-rsvp)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Session Lifecycle](#3-session-lifecycle)
4. [Text Extraction — Unified DOM Walker](#4-text-extraction--unified-dom-walker)
5. [Gemini Scoring](#5-gemini-scoring)
6. [Firestore Cache](#6-firestore-cache)
7. [The Flat Word Array](#7-the-flat-word-array)
8. [The Playback Loop](#8-the-playback-loop)
9. [Epub Sync (iframe ↔ parent)](#9-epub-sync-iframe--parent)
10. [Speed Modes](#10-speed-modes)
11. [ORP — Optimal Recognition Point](#11-orp--optimal-recognition-point)
12. [UI Components](#12-ui-components)
13. [State Variables Reference](#13-state-variables-reference)
14. [Cost Model](#14-cost-model)

---

## 1. What is RSVP?

**Rapid Serial Visual Presentation** is a speed-reading technique where one word at a time is
flashed in a fixed position on screen. Because the eye never moves, the reader can process words
significantly faster than normal — typical gains are 1.5–3× over conventional reading.

This implementation adds two enhancements on top of plain word-flashing:

| Enhancement | Description |
|---|---|
| **ORP alignment** | The word is split at its Optimal Recognition Point (see §11) so the key letter is always at the same horizontal position. |
| **Adaptive pacing** | Gemini scores each sentence's complexity; dense sentences slow the display rate. |

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  User clicks ⚡ button                                              │
│                                                                    │
│  1. rsvpFetchKey()            — load Gemini API key from Firestore │
│  2. rsvpExtractAllChapters()  — DOM-walk epub spine → sentences    │
│  3. rsvpScoreAllChapters()    — Gemini API (with cache check)      │
│  4. rsvpBuildFullBook()       — build flat rsvpWordsArray[]        │
│  5. enterRsvpMode()           — show RSVP panel, seed page anchors │
│                                                                    │
│  Playback: rsvpLoop() ticks every (60000/wpm × complexity) ms      │
│            checks page-word anchor; flips page when index exceeds  │
│            the last visible word; highlights via postMessage       │
└────────────────────────────────────────────────────────────────────┘
```

The epub pane remains visible and **stays in sync** — the word currently being read is highlighted
in the epub iframe in real time. Page turns are driven by a memory comparison against
pre-measured page boundaries, not by DOM polling.

---

## 3. Session Lifecycle

### Entry

```
toggleRsvpMode()
  └─ rsvpFetchKey()              // GET Firestore _config/App.geminiApiKey
  └─ rsvpShowPrep(…)             // show prep modal with progress bar
  └─ rsvpInitSession()
       ├─ rsvpExtractAllChapters()   // DOM-walk epub spine, extract text
       ├─ rsvpScoreAllChapters()     // Gemini + Firestore cache
       ├─ rsvpBuildFullBook()        // populate rsvpWordsArray
       ├─ rsvpFindGlobalStartWord()  // jump to reader's current page
       └─ enterRsvpMode()
            ├─ resets page-anchor state (rsvpPageEndGlobal = -1, etc.)
            └─ sends rsvp-get-page  // seeds initial visible-word range
```

### Exit

```
exitRsvpMode()
  ├─ rsvpStopPlayer()
  ├─ remove CSS class rsvp-on from <body>
  └─ postMessage rsvp-hl: -1    // clear epub highlight
```

---

## 4. Text Extraction — Unified DOM Walker

### Why a unified walker?

The parent (`rsvp.js`) and the iframe injected script (`reader.js`) must count words
**identically**. If they diverge, word index 150 in the parent is not the same word as
`data-li="150"` in the iframe, breaking click-to-jump and highlight sync.

Both use the same recursive DOM-walking algorithm. The parent's version is `rsvpDomExtract(doc)`;
the iframe's is `processNode(node)`.

### `rsvpExtractAllChapters()`

Iterates `epubBook.spine.items`. If the epub has a TOC (`nav.toc`), only spine items that
appear in the TOC are included (front-matter/endnotes are silently skipped). Items with fewer
than 20 words are also dropped. Each included item loads the raw XHTML document via
`section.load()` and passes it to `rsvpDomExtract`.

### `rsvpDomExtract(doc)` — the unified parser

```
SKIP = { SCRIPT, STYLE, NAV, ASIDE, FIGURE, FIGCAPTION, HEAD, TITLE, META }
BLOCK = { P, H1, H2, H3, H4, H5, H6, LI, BLOCKQUOTE }

walk(node):
  if nodeType === 9 (Document): recurse into childNodes
  if tagName in SKIP: return
  if nodeType === 3 (Text): split by /(\s+)/, push non-whitespace tokens to words[]
  if nodeType === 1 (Element):
    isBlock = tagName in BLOCK
    recurse children
    if isBlock and new words were added: mark last word index in paraEnds
```

Key robustness details:
- `tagName` is always `.toUpperCase()` before lookup — EPUB/XHTML returns lowercase tag names.
- The Document node (nodeType 9) is handled explicitly so no `querySelector('body')` call is
  needed, avoiding crashes on `XMLDocument` objects from epub.js.
- All loops use index-based `for`, not spread iterators (`[...node.childNodes]`), which can
  throw on XML DOMs.

### Output — sentence objects

After collecting the flat `words[]` array, `rsvpDomExtract` groups words into sentence objects
based on punctuation and block boundaries:

```js
{
  text:  "The ship vanished at dawn.",   // joined word string (for Gemini)
  words: ["The", "ship", "vanished", "at", "dawn."],  // pre-split tokens
  pause: 150   // ms of blank-screen pause after last word (400 for block/paragraph end)
}
```

`words` is pre-split so `rsvpBuildFullBook` never re-tokenises — any re-split would risk
introducing whitespace differences that break parent/iframe index parity.

---

## 5. Gemini Scoring

### Model

`gemini-2.5-flash-lite` — the cheapest Gemini model capable of nuanced text comprehension.
Chosen over `gemini-2.5-flash` (~4× more expensive per output token) because output is just a
flat list of numbers; no reasoning is needed in the response.

### Prompt

```
Score reading complexity for RSVP speed-reading pacing.
Return ONLY a comma-separated list of floats — one per sentence, in order.
0.7 = very easy/fast, 1.0 = baseline, 1.8 = very dense/slow.
Numbers only. No labels, no JSON, no explanation.

0: The ship vanished at dawn.
1: No one in the village understood why Captain Aldric, decorated veteran of three campaigns, would abandon his post without warning.
2: Maria wept.
…
```

The numbered prefix (`0: … 1: …`) lets Gemini track position without adding output tokens.

### Response format

```
0.8,1.4,0.7,1.1,1.3,0.9,…
```

One float per sentence, comma-separated, nothing else. Values are clamped to `[0.7, 1.8]`
client-side. If Gemini returns fewer values than there are sentences (rare), the remainder
default to `1.0`.

### `rsvpScoreChapter(chapter)` — call details

| Parameter | Value |
|---|---|
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent` |
| `temperature` | `0.1` (near-deterministic; scores should be consistent on re-run) |
| `maxOutputTokens` | `2048` (enough for ~680 sentences per chapter) |
| Retry | 1 automatic retry on non-429 errors (800 ms delay); 2-second delay on 429 |
| Fallback | All sentences score `1.0` if both attempts fail |

### `rsvpScoreAllChapters(chapters)`

Scores chapters **sequentially** (not in parallel) to avoid rate-limit bursts. The progress
bar in the prep modal updates after each chapter.

---

## 6. Firestore Cache

All scores for a book are stored in a **single Firestore document** the first time RSVP runs.
Subsequent sessions for the same book skip the Gemini API entirely.

### Document path

```
library/{bookId}/rsvp/scores
```

### Document fields

| Field | Type | Description |
|---|---|---|
| `csv` | `string` | All sentence scores for the entire book, comma-separated. Order matches the order sentences were extracted from the spine. Example: `"0.8,1.2,1.0,0.9,1.4,…"` |
| `scoredAt` | `Timestamp` | Server timestamp of when scoring was performed |

### Cache invalidation

There is no automatic expiry. To force a re-score (e.g. after the epub content changes or
after a parser update), delete the `scores` document in the Firebase console.

> **Note:** Any change to the DOM-walker tokenisation logic (§4) invalidates existing cached
> scores because the sentence boundaries will shift. Delete all `library/*/rsvp/scores`
> documents after such a change.

---

## 7. The Flat Word Array

`rsvpBuildFullBook(chapters, allScores)` takes the extracted chapters and their scores and
produces two global data structures used by the playback engine.

### `rsvpWordsArray` — every word in the book

An array where each element represents one word:

```js
{
  word:           "vanished",       // the display string
  complexity:     1.2,              // Gemini score for this word's sentence
  pause_after_ms: 0,                // ms to pause AFTER this word (non-zero only for sentence-final words)
  sentence_text:  "The ship vanished at dawn."  // full sentence (shown in context bar)
}
```

`pause_after_ms` is `0` for every word except the **last word of each sentence**:
- Last word of a block/paragraph → `400`
- Last word of any other sentence → `150`

Words are pushed directly from `sent.words` (the pre-split array from `rsvpDomExtract`).
Re-splitting `sent.text` is deliberately avoided — it would re-introduce whitespace differences
and break parent/iframe index parity.

### `rsvpChapterBoundaries` — chapter index

```js
[
  { startWordIdx: 0,     title: "Prologue",   spineHref: "OEBPS/prologue.xhtml" },
  { startWordIdx: 2340,  title: "Chapter 1",  spineHref: "OEBPS/chapter01.xhtml" },
  { startWordIdx: 7891,  title: "Chapter 2",  spineHref: "OEBPS/chapter02.xhtml" },
  …
]
```

`startWordIdx` is the index in `rsvpWordsArray` where that chapter's first word lives.
Used to translate between chapter-local iframe indices (`data-li`) and global word indices,
to display the chapter badge, and to locate the reader's starting position.

---

## 8. The Playback Loop

### Timing formula

```
delay_ms = (60000 / baseWpm) × word.complexity
```

Where `baseWpm` is the WPM set by the speed mode (e.g. 320 for "Focused"). A word with
complexity `1.4` at 320 WPM gets `(60000/320) × 1.4 ≈ 263 ms` of display time.

### Sentence pause

After showing the last word of a sentence, the display blanks for `pause_after_ms`:

```
show word → wait delay_ms → blank screen → wait pause_after_ms → advance
```

### `rsvpLoop()` — simplified flow

```
if not playing or past end of book: stop

── PAGE-WORD ANCHOR CHECK ──
if rsvpPageEndGlobal ≠ -1
   AND rsvpIndex > rsvpPageEndGlobal
   AND NOT rsvpEpubNavigating:
     set rsvpWaitingForPage = true
     call rendition.next()
     return   ← loop exits; resumes when rsvp-page-words arrives

show rsvpWordsArray[rsvpIndex].word
update progress bar, status badge, chapter badge
highlight word in epub iframe  (rsvpHighlightInEpub)
schedule next tick at delay_ms
  if last word of sentence: blank screen, wait pause_after_ms
  rsvpIndex++
```

### Page-word anchor check

The anchor check is the core of the auto-page-turn mechanism (replacing the old reactive
`rsvp-need-flip` approach):

- `rsvpPageEndGlobal` holds the **global index** of the last visible word on the current epub page.
- When `rsvpIndex` exceeds it, the loop calls `rendition.next()` and sets `rsvpWaitingForPage = true`.
- The loop exits. When the new page settles, `rsvpOnEpubRelocated` sends `rsvp-get-page`
  to the iframe, which responds with `rsvp-page-words`, updating `rsvpPageEndGlobal` and
  resuming the loop.
- The `!rsvpEpubNavigating` guard prevents double-flipping during cross-chapter navigation.
- If `rsvpPageEndGlobal === -1` (anchors not yet known), the check is skipped and the loop plays freely.

### Jump controls

| Control | Action |
|---|---|
| `rsvpJumpSeconds(sec)` | Move ±`sec` seconds worth of words (based on current WPM) |
| `rsvpJumpToGlobalWord(idx)` | Jump to a specific global word index; resets page anchors to `-1` so stale boundaries don't trigger an instant wrong flip |
| `rsvpRestart()` | Reset to word 0, navigate epub to first chapter |

---

## 9. Epub Sync (iframe ↔ parent)

The epub content renders in an iframe managed by epub.js. The RSVP engine lives in the parent
window. They communicate via `window.postMessage`.

### Messages: parent → iframe

| `type` | Payload | Purpose |
|---|---|---|
| `rsvp-activate` | — | Wrap words in `<span class="rsvp-w" data-li="N">` (idempotent) |
| `rsvp-hl` | `{ li: number }` | Highlight word at chapter-local index `li` (`li = -1` clears highlight) |
| `rsvp-get-page` | — | Wrap words (if not already), then report the visible word range via `rsvp-page-words` |

### Messages: iframe → parent

| `type` | Payload | Purpose |
|---|---|---|
| `rsvp-page-words` | `{ start: number, end: number }` | Chapter-local indices of the first and last visible word on the current page. Both are `-1` on an image-only page. |
| `rsvp-epub-click` | `{ li: number }` | User clicked a word at chapter-local index `li`; parent converts to global and calls `rsvpJumpToGlobalWord` |

### Page-word anchoring flow

```
enterRsvpMode() / rsvpOnEpubRelocated()
  └─ sends rsvp-get-page to iframe (after 180ms settle delay)

iframe receives rsvp-get-page:
  1. wrapWords()              — inject <span data-li="N"> if not done
  2. reportVisibleWords()     — scan .rsvp-w elements for visible range
  3. postMessage rsvp-page-words { start, end }  (chapter-local)

parent receives rsvp-page-words:
  chStart = rsvpChapterBoundaries[chIdx].startWordIdx
  rsvpPageStartGlobal = chStart + start
  rsvpPageEndGlobal   = chStart + end
  if rsvpWaitingForPage: resume rsvpLoop()
```

### Visibility detection (`reportVisibleWords`)

```js
for each .rsvp-w span:
  if rect.width === 0 && rect.height === 0: skip (display:none)
  isVisible = Math.round(rect.right) > 0 && Math.round(rect.left) < vW
  if visible: record start (first time) and end (last time)
  else if already found start: break   // exited visible column
```

Only horizontal bounds are checked — epub.js uses CSS columns for pagination, so vertical
overflow does not occur. `Math.round()` prevents subpixel floating-point misses at exact
column edges.

### Cross-chapter navigation

When `rsvpHighlightInEpub` detects that `rsvpIndex` has entered a new chapter:

1. Sets `rsvpEpubNavigating = true` and starts `rsvpNavSafetyTimer` (3 s watchdog).
2. Calls `rendition.display(chapter.spineHref)` directly.
3. On `relocated`, `rsvpOnEpubRelocated` clears the timer, resets `rsvpEpubNavigating`,
   and sends `rsvp-get-page` for the new chapter's page.

The 3-second watchdog (`rsvpNavSafetyTimer`) ensures `rsvpEpubNavigating` is released
even if epub.js fails to fire `relocated` (e.g., at the very last chapter).

### Word wrapping in the iframe (`wrapWords` / `processNode`)

The iframe injected script walks `document.body` with the same recursive algorithm as
`rsvpDomExtract`, assigning each text token a `data-li` index (0-based within the chapter).
The walk is idempotent — a `wrapped` flag prevents double-wrapping on re-activation.

---

## 10. Speed Modes

```js
const RSVP_MODES = {
    1: { label: 'Leisurely',   wpm: 180 },
    2: { label: 'Comfortable', wpm: 250 },
    3: { label: 'Focused',     wpm: 320 },   // default
    4: { label: 'Brisk',       wpm: 420 },
    5: { label: 'Sprint',      wpm: 550 },
};
```

These are **base** WPM values — the effective rate for any given word is
`baseWpm / complexity`. A complexity-1.4 word at "Focused" (320 WPM) is effectively read at
`320 / 1.4 ≈ 229 WPM`.

---

## 11. ORP — Optimal Recognition Point

Research shows the brain begins to recognize a word before the eye reaches it. The ORP is the
letter the eye should land on for fastest recognition — typically around the centre-left of the
word.

```js
function rsvpOrpIdx(word) {
    const l = word.length;
    if (l <= 1) return 0;
    if (l <= 5) return Math.floor(l / 2);
    return Math.floor(l / 2) - 1;
}
```

The word is rendered as three `<span>` elements:

```
<span id="rsvp-before">van</span>
<span id="rsvp-pivot">i</span>    ← red, always at screen centre
<span id="rsvp-after">shed</span>
```

For the word "vanished" (8 chars): ORP index = `floor(8/2) - 1 = 3`, so pivot = `"i"`.

---

## 12. UI Components

### RSVP panel

The RSVP panel (`#rsvp-panel`) is a **floating, draggable widget on desktop** (≥768 px) and a
full-width side panel that slides in from the left on mobile.

- On mobile: slides in via `transform: translateX(-100% → 0)`.
- On desktop: fades in via `opacity: 0 → 1`; `position: fixed` with inline `left`/`top` set by
  the drag handler. Default position: `top: 6rem, left: 6rem`.
- The drag handle (`#rsvp-drag-handle`) is visible only on desktop. Dragging disables
  `pointer-events` on the epub iframe to prevent mouse events being swallowed.

### Element reference

| Element ID | Description |
|---|---|
| `rsvp-panel` | The floating RSVP player container |
| `rsvp-drag-handle` | Pill-shaped drag handle at top of panel (desktop only) |
| `rsvp-prep-modal` | Full-screen overlay shown during the scoring phase |
| `rsvp-prep-title` | Primary status text (e.g. "Scoring chapters…") |
| `rsvp-prep-sub` | Secondary text (e.g. "Chapter 3 of 12") |
| `rsvp-prep-bar` | Animated progress bar; pulses during API calls |
| `rsvp-prep-chunk` | "Chapter N of M" counter |
| `rsvp-word` | The `<div>` containing before/pivot/after spans |
| `rsvp-before` | Text before ORP pivot |
| `rsvp-pivot` | The ORP letter (rendered in warm red) |
| `rsvp-after` | Text after ORP pivot |
| `rsvp-context` | The full current sentence, shown when paused |
| `rsvp-chapter-badge` | Current chapter title badge |
| `rsvp-status` | Complexity badge (e.g. "1.4×") |
| `rsvp-progress` | Thin progress bar at the bottom of the player |
| `rsvp-play-btn` | Play / pause button |
| `rsvp-mode-label` | Current speed mode name |
| `.rsvp-mode-btn` | The five speed selector buttons |

---

## 13. State Variables Reference

### Core playback state

| Variable | Type | Description |
|---|---|---|
| `rsvpGeminiKey` | `string\|null` | Gemini API key, loaded from Firestore on first use |
| `rsvpActive` | `boolean` | Whether RSVP mode is currently on |
| `rsvpIsPlaying` | `boolean` | Whether the playback timer is running |
| `rsvpWordsArray` | `object[]` | Flat array of every word in the book (see §7) |
| `rsvpChapterBoundaries` | `object[]` | Chapter start indices + titles + hrefs (see §7) |
| `rsvpIndex` | `number` | Current position in `rsvpWordsArray` |
| `rsvpMode` | `1–5` | Active speed mode key |
| `rsvpBaseWpm` | `number` | WPM for current mode |
| `rsvpTimer` | `TimeoutID` | Handle for the active `setTimeout` |
| `rsvpCancelled` | `boolean` | Set to `true` when user cancels the prep modal |
| `rsvpPausedCfi` | `string\|null` | CFI of the epub location saved on pause; used to snap back to the right page on resume |

### Epub navigation state

| Variable | Type | Description |
|---|---|---|
| `rsvpEpubNavigating` | `boolean` | `true` while epub.js is processing a `rendition.display()` or `rendition.next()` call; prevents double-navigation |
| `rsvpNavSafetyTimer` | `TimeoutID\|null` | 3-second watchdog that releases `rsvpEpubNavigating` if the epub `relocated` event never fires |

### Page-word anchor state

| Variable | Type | Description |
|---|---|---|
| `rsvpPageStartGlobal` | `number` | Global index of the first visible word on the current epub page (`-1` = unknown) |
| `rsvpPageEndGlobal` | `number` | Global index of the last visible word on the current epub page (`-1` = unknown; loop anchor check is skipped) |
| `rsvpWaitingForPage` | `boolean` | `true` when the loop has triggered a page flip and is suspended waiting for `rsvp-page-words` to confirm the new page |

---

## 14. Cost Model

Pricing based on `gemini-2.5-flash-lite` public rates (as of May 2026).

### Assumptions — 100-page book

| Metric | Estimate |
|---|---|
| Words | ~25,000 |
| Sentences | ~1,700 |
| Chapters | ~12 |

### Token counts per chapter (~140 sentences)

| Direction | Tokens | Notes |
|---|---|---|
| Input (prompt + numbered sentences) | ~800 | Prompt ~50 tokens + ~5 tokens/sentence |
| Output (CSV scores) | ~420 | ~3 tokens/sentence |

### Totals for full book (12 chapters)

| Item | Tokens | Cost (est.) |
|---|---|---|
| Input | ~9,600 | ~$0.001 |
| Output | ~5,040 | ~$0.005 |
| **Total** | **~14,640** | **~$0.006** |

Costs are one-time per book — the result is cached in Firestore indefinitely.

### Comparison with previous architecture

| Architecture | Output tokens | Est. cost / book |
|---|---|---|
| `gemini-2.5-flash` + full JSON | ~32,000 | ~$0.040 |
| `gemini-2.5-flash-lite` + compact CSV | ~5,000 | ~$0.006 |
| **Reduction** | **~84%** | **~85%** |
