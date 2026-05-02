# RSVP Speed-Reading — Technical Reference

> Applies to `library/reader.html`. All RSVP logic lives in the
> `<!-- ── RSVP INTEGRATION ── -->` `<script>` block near the bottom of that file.

---

## Table of Contents

1. [What is RSVP?](#1-what-is-rsvp)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Session Lifecycle](#3-session-lifecycle)
4. [Text Extraction & Sentence Splitting](#4-text-extraction--sentence-splitting)
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
│  1. rsvpFetchKey()    — load Gemini API key from Firestore         │
│  2. rsvpExtractAllChapters()  — parse epub spine → sentences       │
│  3. rsvpScoreAllChapters()    — Gemini API (with cache check)      │
│  4. rsvpBuildFullBook()       — build flat rsvpWordsArray[]        │
│  5. enterRsvpMode()           — show RSVP player overlay           │
│                                                                    │
│  Playback: rsvpLoop() ticks every (60000/wpm × complexity) ms      │
│            each tick calls rsvpHighlightInEpub() via postMessage   │
└────────────────────────────────────────────────────────────────────┘
```

The epub pane remains visible and **stays in sync** — the word currently being spoken is
highlighted in the epub iframe in real time, and the epub auto-turns pages as the reader advances.

---

## 3. Session Lifecycle

### Entry

```
toggleRsvpMode()
  └─ rsvpFetchKey()           // GET Firestore _config/App.geminiApiKey
  └─ rsvpShowPrep(…)          // show prep modal with progress bar
  └─ rsvpInitSession()
       ├─ rsvpExtractAllChapters()   // walk epub spine, extract text
       ├─ rsvpScoreAllChapters()     // Gemini + Firestore cache
       ├─ rsvpBuildFullBook()        // populate rsvpWordsArray
       ├─ rsvpFindGlobalStartWord()  // jump to reader's current page
       └─ enterRsvpMode()            // show player, activate
```

### Exit

```
exitRsvpMode()
  ├─ rsvpStopPlayer()
  ├─ remove CSS class rsvp-on from <body>
  └─ postMessage rsvp-hl: -1  // clear epub highlight
```

---

## 4. Text Extraction & Sentence Splitting

### `rsvpExtractAllChapters()`

Iterates `epubBook.spine.items`. If the epub has a TOC (`nav.toc`), only spine items that
appear in the TOC are included (front-matter/endnotes are silently skipped). Items with fewer
than 100 characters of text are also dropped.

Each included item produces a **chapter object**:

```js
{
  title:     "Chapter 3 — The Storm",   // from TOC, or "Section N"
  spineHref: "OEBPS/chapter03.xhtml",   // raw epub href
  sentences: [ /* array of sentence objects, see below */ ]
}
```

### `rsvpExtractText(doc)`

Strips `<script>`, `<style>`, `<nav>`, `<aside>`, `<figure>`, `<figcaption>` nodes, then
reads `innerText` / `textContent`. Collapses runs of 3+ newlines to `\n\n` so paragraph
boundaries are preserved for pause detection.

### `rsvpSplitSentences(text)` → sentence objects

1. Split the chapter text on `\n\n+` → **paragraphs**.
2. Within each paragraph, split on `[^.!?…]+[.!?…]+["']?\s*` → raw sentence strings.
3. The **last sentence of every paragraph** gets `pause: 400` (ms); all others get `pause: 150`.

Each sentence object:

```js
{
  index: 12,                         // 0-based index within the chapter
  text:  "The ship vanished at dawn.", // full sentence text
  pause: 400                          // ms of blank-screen pause after last word
}
```

The `pause` value is **structural** — derived from paragraph breaks in the text, not from
Gemini. This removes an entire output field from the API call, cutting token usage.

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

There is no automatic expiry. To force a re-score (e.g. after epub content changes), delete the
`scores` document in the Firebase console.

### Reading the cache

```js
const cacheDoc = await cacheRef.get();
if (cacheDoc.exists && cacheDoc.data()?.csv) {
    return cacheDoc.data().csv.split(',').map(Number);
}
```

The returned array is the flat list of all scores, indexed by global sentence order.

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
- Last sentence of a paragraph → `400`
- Any other sentence → `150`

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
Used to display the chapter badge and to locate the reader's starting position.

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

This gives the reader a moment to mentally "reset" between sentences/paragraphs.

### `rsvpLoop()` — simplified flow

```
while playing and words remain:
    show rsvpWordsArray[rsvpIndex].word
    update progress bar
    update status badge (complexity ×)
    update chapter badge
    highlight word in epub iframe
    schedule next tick at delay_ms
    if last word of sentence:
        blank screen, wait pause_after_ms
    rsvpIndex++
```

### Jump controls

| Control | Action |
|---|---|
| `rsvpJumpSeconds(sec)` | Move ±`sec` seconds worth of words (based on current WPM) |
| `rsvpJumpToGlobalWord(idx)` | Jump directly to a specific word index (used by epub click) |
| `rsvpRestart()` | Reset to word 0, navigate epub to first chapter |

---

## 9. Epub Sync (iframe ↔ parent)

The epub content renders in an iframe managed by epub.js. The RSVP overlay and playback engine
live in the parent window. They communicate via `window.postMessage`.

### Messages sent by parent → iframe

| `type` | Payload | Purpose |
|---|---|---|
| `rsvp-activate` | — | Inject word-highlighting CSS + click listeners into the epub page |
| `rsvp-hl` | `{ li: number }` | Highlight word at position `li` on the current epub page (`li = -1` clears) |

### Messages sent by iframe → parent

| `type` | Payload | Purpose |
|---|---|---|
| `rsvp-page-words` | `{ words: string[], total: number }` | Sent on epub page load; gives the parent the list of words visible on this page |
| `rsvp-epub-click` | `{ li: number }` | User clicked word at page-local index `li`; parent converts to global index and jumps |

### Page-word anchoring

When the iframe sends `rsvp-page-words`, the parent scans `rsvpWordsArray` near the current
`rsvpIndex` to find where the page's first word sits in the global array. This offset
(`rsvpEpubPageWordStart`) is used to:
- Convert page-local click indices to global indices.
- Decide when to call `rendition.next()` / `rendition.prev()` for auto page-turn.

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

| Element ID | Description |
|---|---|
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

| Variable | Type | Description |
|---|---|---|
| `rsvpGeminiKey` | `string\|null` | Gemini API key, loaded from Firestore on first use |
| `rsvpActive` | `boolean` | Whether RSVP mode is currently on |
| `rsvpIsPlaying` | `boolean` | Whether the playback timer is running |
| `rsvpWordsArray` | `object[]` | Flat array of every word in the book (see §7) |
| `rsvpChapterBoundaries` | `object[]` | Chapter start indices + titles (see §7) |
| `rsvpIndex` | `number` | Current position in `rsvpWordsArray` |
| `rsvpMode` | `1–5` | Active speed mode key |
| `rsvpBaseWpm` | `number` | WPM for current mode |
| `rsvpTimer` | `TimeoutID` | Handle for the active `setTimeout` |
| `rsvpCancelled` | `boolean` | Set to `true` when user cancels the prep modal |
| `rsvpEpubPageWordStart` | `number` | Global index of the first word on the current epub page |
| `rsvpEpubPageWordCount` | `number` | Total words on the current epub page |
| `rsvpEpubNavigating` | `boolean` | Prevents double page-turns during navigation |

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
