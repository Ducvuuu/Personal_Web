// ── RSVP INTEGRATION ──
// Depends on: db, bookId, bookDoc, rendition, epubBook (from reader.js)

// ── Constants ──
const RSVP_MODES = {
    1: { label: 'Leisurely',   wpm: 180 },
    2: { label: 'Comfortable', wpm: 250 },
    3: { label: 'Focused',     wpm: 320 },
    4: { label: 'Brisk',       wpm: 420 },
    5: { label: 'Sprint',      wpm: 550 },
};

const RSVP_PROMPT = `Score reading complexity for RSVP speed-reading pacing.
Return ONLY a comma-separated list of floats — one per sentence, in order.
0.7 = very easy/fast, 1.0 = baseline, 1.8 = very dense/slow.
Numbers only. No labels, no JSON, no explanation.\n\n`;

// ── State ──
let rsvpGeminiKey         = null;
let rsvpActive            = false;
let rsvpIsPlaying         = false;
let rsvpWordsArray        = [];           // flat array for entire book
let rsvpChapterBoundaries = [];           // [{startWordIdx, title, spineHref}]
let rsvpIndex             = 0;
let rsvpMode              = 3;
let rsvpBaseWpm           = RSVP_MODES[3].wpm;
let rsvpTimer             = null;
let rsvpCancelled         = false;
let rsvpPausedCfi         = null;

// ── Epub iframe sync state ──
let rsvpEpubNavigating    = false;
let rsvpNavSafetyTimer    = null;   // releases rsvpEpubNavigating if 'relocated' never fires

// ── Listen for messages from epub iframe ──
window.addEventListener('message', e => {
    if (!e.data?.type) return;

    // Iframe reports highlighted word is off the visible page — flip now
    if (e.data.type === 'rsvp-need-flip' && rsvpActive && !rsvpEpubNavigating) {
        rsvpEpubNavigating = true;
        clearTimeout(rsvpNavSafetyTimer);
        // Safety: if epub.js never fires 'relocated' (last chapter, error), release the lock
        rsvpNavSafetyTimer = setTimeout(() => { rsvpEpubNavigating = false; }, 3000);
        if (e.data.forward) rendition?.next?.();
        else rendition?.prev?.();
    }

    if (e.data.type === 'rsvp-epub-click' && rsvpActive) {
        const loc  = rendition?.currentLocation();
        const href = (loc?.start?.href || '').split('#')[0];
        const chIdx = rsvpChapterBoundaries.findIndex(b => {
            const bHref = (b.spineHref || '').split('#')[0];
            return href && (href === bHref || href.endsWith(bHref) || bHref.endsWith(href.split('/').pop()));
        });
        if (chIdx < 0) return;

        const parentChapterStart = rsvpChapterBoundaries[chIdx].startWordIdx;
        const exactGlobalIdx = Math.min(parentChapterStart + e.data.li, rsvpWordsArray.length - 1);
        rsvpJumpToGlobalWord(exactGlobalIdx);
    }
});

// ── Fetch Gemini key from Firestore ──
async function rsvpFetchKey() {
    if (rsvpGeminiKey) return rsvpGeminiKey;
    try {
        const snap = await db.collection('_config').doc('App').get();
        rsvpGeminiKey = snap.data()?.geminiApiKey || null;
    } catch { rsvpGeminiKey = null; }
    return rsvpGeminiKey;
}

// ── Toggle entry point (⚡ button) ──
async function toggleRsvpMode() {
    if (rsvpActive) { exitRsvpMode(); return; }

    const key = await rsvpFetchKey();
    if (!key) { alert('Gemini API key not found in _config/App.'); return; }

    rsvpCancelled = false;
    rsvpShowPrep('Preparing RSVP…', 'Extracting chapters', 0, 0);
    document.getElementById('rsvp-prep-modal').classList.remove('hidden');

    try {
        await rsvpInitSession();
    } catch (err) {
        document.getElementById('rsvp-prep-modal').classList.add('hidden');
        if (!rsvpCancelled) alert(`RSVP error: ${err.message}`);
    }
}

function cancelRsvpPrep() {
    rsvpCancelled = true;
    document.getElementById('rsvp-prep-modal').classList.add('hidden');
}

// ── Init session: extract all → score all → build flat array → enter ──
async function rsvpInitSession() {
    rsvpShowPrep('Extracting text…', bookDoc.title, 0, 0);
    const chapters = await rsvpExtractAllChapters();
    if (rsvpCancelled) return;
    if (chapters.length === 0) {
        document.getElementById('rsvp-prep-modal').classList.add('hidden');
        alert('Extraction failed. The book may be empty or use an unsupported format.');
        return;
    }

    const allScores = await rsvpScoreAllChapters(chapters);
    if (rsvpCancelled) return;

    const loc = rendition?.currentLocation();
    rsvpBuildFullBook(chapters, allScores);
    rsvpIndex = rsvpFindGlobalStartWord(loc);
    rsvpSetWord(rsvpWordsArray[rsvpIndex]?.word || 'Ready.');
    rsvpUpdateProgress();

    document.getElementById('rsvp-prep-modal').classList.add('hidden');
    enterRsvpMode();
}

// ── Extract all chapters from epub spine ──
async function rsvpExtractAllChapters() {
    const chapters = [];
    let tocItems = [];
    try {
        const nav = await epubBook.loaded.navigation;
        tocItems  = nav.toc || [];
    } catch {}

    function flattenToc(items, depth = 0) {
        const out = [];
        items.forEach(item => {
            out.push({ label: item.label?.trim() || '', href: item.href || '', depth });
            if (item.subitems?.length) out.push(...flattenToc(item.subitems, depth + 1));
        });
        return out;
    }
    const flatToc     = flattenToc(tocItems);
    const hrefToLabel = {};
    flatToc.forEach(t => {
        const base = t.href.split('#')[0];
        if (!hrefToLabel[base]) hrefToLabel[base] = t.label;
    });

    const useToc     = Object.keys(hrefToLabel).length > 0;
    const spineItems = epubBook.spine.items;

    for (let i = 0; i < spineItems.length; i++) {
        const item     = spineItems[i];
        const hrefBase = (item.href || '').split('#')[0].split('/').pop();
        const fullBase = (item.href || '').split('#')[0];
        const label    = hrefToLabel[fullBase] || hrefToLabel[hrefBase] || null;
        if (useToc && !label) continue;

        try {
            const section   = epubBook.spine.get(i);
            const doc       = await section.load(epubBook.load.bind(epubBook));
            const sentences = rsvpDomExtract(doc);
            section.unload();
            const wordCount = sentences.reduce((n, s) => n + s.words.length, 0);
            if (wordCount < 20) continue;

            chapters.push({
                title:     label || `Section ${chapters.length + 1}`,
                spineHref: item.href || '',
                sentences,
            });
        } catch (err) {
            console.error('Error extracting chapter:', err);
        }
    }
    return chapters;
}

// ── DOM-walking extractor — mirrors processNode in the iframe exactly ──
// Produces sentences with pre-split word arrays so rsvpBuildFullBook never re-tokenises.
function rsvpDomExtract(doc) {
    if (!doc) return [];
    const SKIP  = new Set(['SCRIPT','STYLE','NAV','ASIDE','FIGURE','FIGCAPTION','HEAD','TITLE','META']);
    const BLOCK = new Set(['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE']);

    const words    = [];
    const paraEnds = new Set();

    function walk(node) {
        if (!node) return;

        // Document node — recurse into children without tag checks
        if (node.nodeType === 9) {
            if (node.childNodes) {
                for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
            }
            return;
        }

        const tag = node.tagName ? node.tagName.toUpperCase() : null;
        if (tag && SKIP.has(tag)) return;

        if (node.nodeType === 3) {
            const text = node.textContent;
            if (!text.trim()) return;
            const tokens = text.split(/(\s+)/);
            let hasWord = false;
            for (let t = 0; t < tokens.length; t++) {
                if (tokens[t] && !/^\s+$/.test(tokens[t])) { hasWord = true; break; }
            }
            if (!hasWord) return;
            for (let t = 0; t < tokens.length; t++) {
                if (!tokens[t] || /^\s+$/.test(tokens[t])) continue;
                words.push(tokens[t]);
            }
            return;
        }

        if (node.nodeType === 1) {
            const isBlock = BLOCK.has(tag);
            const before  = words.length;
            if (node.childNodes) {
                for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
            }
            if (isBlock && words.length > before) paraEnds.add(words.length - 1);
        }
    }

    walk(doc);

    if (words.length === 0) return [];

    const sentences = [];
    let segStart    = 0;

    const flush = (end, pause) => {
        const w = words.slice(segStart, end + 1);
        if (w.length > 0) sentences.push({ text: w.join(' '), words: w, pause });
        segStart = end + 1;
    };

    for (let i = 0; i < words.length; i++) {
        if (paraEnds.has(i)) {
            flush(i, 400);
        } else if (/[.!?…]["']?$/.test(words[i])) {
            flush(i, 150);
        }
    }
    if (segStart < words.length) flush(words.length - 1, 400);

    return sentences;
}

// ── Score all chapters upfront; load from Storage cache if available ──
async function rsvpScoreAllChapters(chapters) {
    const cacheFile = storage.ref(`library/rsvp/${bookId}.csv`);

    // Try loading from Storage first
    try {
        const url = await cacheFile.getDownloadURL();
        const res = await fetch(url);
        if (res.ok) {
            const csv = await res.text();
            if (csv.trim().length > 0) return csv.trim().split(',').map(Number);
        }
    } catch {}

    // Cache miss — score with Gemini and save to Storage
    const allScores = [];
    for (let i = 0; i < chapters.length; i++) {
        if (rsvpCancelled) return allScores;
        rsvpShowPrep('Scoring chapters…', `Chapter ${i + 1} of ${chapters.length}`, i, chapters.length);
        const scores = await rsvpScoreChapter(chapters[i]);
        allScores.push(...scores);
    }

    try {
        const csv  = allScores.join(',');
        const blob = new Blob([csv], { type: 'text/plain' });
        await cacheFile.put(blob);
    } catch {}

    return allScores;
}

// ── Score one chapter with gemini-2.5-flash-lite, compact CSV output ──
async function rsvpScoreChapter(chapter) {
    const lines = chapter.sentences.map((s, i) => `${i}: ${s.text}`).join('\n');

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${rsvpGeminiKey}`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents:         [{ parts: [{ text: RSVP_PROMPT + lines }] }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
                    })
                }
            );
            if (res.status === 429) { await rsvpSleep(2000); continue; }
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            const raw    = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const scores = raw.trim().split(',').map(s => {
                const f = parseFloat(s.trim());
                return isNaN(f) ? 1.0 : Math.max(0.7, Math.min(1.8, f));
            });
            while (scores.length < chapter.sentences.length) scores.push(1.0);
            return scores.slice(0, chapter.sentences.length);
        } catch {
            if (attempt === 0) { await rsvpSleep(800); continue; }
        }
    }
    return chapter.sentences.map(() => 1.0);
}

// ── Build single flat word array for entire book ──
function rsvpBuildFullBook(chapters, allScores) {
    rsvpWordsArray        = [];
    rsvpChapterBoundaries = [];
    let scoreOffset = 0;

    chapters.forEach(ch => {
        rsvpChapterBoundaries.push({
            startWordIdx: rsvpWordsArray.length,
            title:        ch.title,
            spineHref:    ch.spineHref,
        });
        ch.sentences.forEach((sent, si) => {
            const complexity = allScores[scoreOffset + si] ?? 1.0;
            sent.words.forEach((word, wi) => {
                rsvpWordsArray.push({
                    word,
                    complexity,
                    pause_after_ms: wi === sent.words.length - 1 ? sent.pause : 0,
                    sentence_text:  sent.text,
                });
            });
        });
        scoreOffset += ch.sentences.length;
    });
}

// ── Estimate global word index from epub CFI position ──
function rsvpFindGlobalStartWord(loc) {
    if (!loc?.start) return 0;

    // Strip fragments so chapter16.xhtml#part2 matches chapter16.xhtml
    const href = (loc.start.href || '').split('#')[0];

    const chIdx = rsvpChapterBoundaries.findIndex(b => {
        const bHref = (b.spineHref || '').split('#')[0];
        return href && (href === bHref || href.endsWith(bHref) || bHref.endsWith(href.split('/').pop()));
    });
    if (chIdx < 0) return 0;
    const chStart = rsvpChapterBoundaries[chIdx].startWordIdx;
    const chEnd   = chIdx + 1 < rsvpChapterBoundaries.length
        ? rsvpChapterBoundaries[chIdx + 1].startWordIdx
        : rsvpWordsArray.length;
    return chStart + Math.floor((loc.start.percentage || 0) * (chEnd - chStart));
}

// ── Return the chapter title for the current rsvpIndex ──
function rsvpCurrentChapterTitle() {
    let title = rsvpChapterBoundaries[0]?.title || '';
    for (const b of rsvpChapterBoundaries) {
        if (b.startWordIdx > rsvpIndex) break;
        title = b.title;
    }
    return title;
}

// ── Mode enter / exit ──
function enterRsvpMode() {
    rsvpActive = true;
    document.body.classList.add('rsvp-on');
    const btn = document.getElementById('rsvp-btn');
    btn.classList.add('rsvp-active');
    btn.title = 'Exit RSVP mode';
    btn.setAttribute('aria-pressed', 'true');
    rsvpSetMode(rsvpMode);

    setTimeout(() => {
        if (rendition) {
            const v = document.getElementById('viewer');
            try { rendition.resize(v.offsetWidth, v.offsetHeight); } catch {}
        }
        rsvpSendToEpub({ type: 'rsvp-activate' });
    }, 280);
}

function exitRsvpMode() {
    rsvpActive = false;
    rsvpStopPlayer();
    document.body.classList.remove('rsvp-on');
    const btn = document.getElementById('rsvp-btn');
    btn.classList.remove('rsvp-active');
    btn.title = 'RSVP speed reading';
    btn.setAttribute('aria-pressed', 'false');
    rsvpSendToEpub({ type: 'rsvp-hl', li: -1 });
    setTimeout(() => {
        if (rendition) {
            const v = document.getElementById('viewer');
            try { rendition.resize(v.offsetWidth, v.offsetHeight); } catch {}
        }
    }, 280);
}

function rsvpOnEpubRelocated() {
    clearTimeout(rsvpNavSafetyTimer);
    rsvpEpubNavigating = false;
    setTimeout(() => {
        if (rsvpActive) rsvpSendToEpub({ type: 'rsvp-activate' });
    }, 180);
}

// ── Epub iframe communication ──
function rsvpSendToEpub(msg) {
    try {
        const contents = rendition?.getContents?.();
        if (contents && contents[0]) contents[0].window.postMessage(msg, '*');
    } catch {}
}

function rsvpHighlightInEpub(globalIdx) {
    if (rsvpEpubNavigating) return;

    // Find the chapter containing globalIdx
    let chIdx = 0;
    for (let i = rsvpChapterBoundaries.length - 1; i >= 0; i--) {
        if (rsvpChapterBoundaries[i].startWordIdx <= globalIdx) {
            chIdx = i;
            break;
        }
    }
    const chapter = rsvpChapterBoundaries[chIdx];

    // Cross-chapter sync: if playback has entered a new chapter, navigate to it directly
    // instead of sending li=0 to the old chapter (which would flip backward)
    const loc = rendition?.currentLocation();
    if (loc && loc.start && loc.start.href) {
        const currentHref = loc.start.href.split('#')[0];
        const targetHref  = (chapter.spineHref || '').split('#')[0];
        const isSameChapter = currentHref === targetHref ||
                              currentHref.endsWith(targetHref) ||
                              targetHref.endsWith(currentHref.split('/').pop());
        if (!isSameChapter) {
            rsvpEpubNavigating = true;
            clearTimeout(rsvpNavSafetyTimer);
            rsvpNavSafetyTimer = setTimeout(() => { rsvpEpubNavigating = false; }, 3000);
            rendition.display(chapter.spineHref);
            return; // rsvpOnEpubRelocated will resume highlighting after navigation settles
        }
    }

    rsvpSendToEpub({ type: 'rsvp-hl', li: globalIdx - chapter.startWordIdx });
}

function rsvpJumpToGlobalWord(globalIdx) {
    rsvpIndex = Math.max(0, Math.min(globalIdx, rsvpWordsArray.length - 1));
    rsvpSetWord(rsvpWordsArray[rsvpIndex]?.word || '');
    rsvpUpdateProgress();
    rsvpHighlightInEpub(rsvpIndex);
    if (rsvpIsPlaying) {
        clearTimeout(rsvpTimer);
        rsvpLoop();
    } else {
        // Update anchor so snap-back targets the clicked location, not the old pause point
        rsvpPausedCfi = rendition?.currentLocation()?.start?.cfi || null;
        rsvpShowContext();
    }
}

// ── Player engine ──
function rsvpOrpIdx(word) {
    const l = word.length;
    if (l <= 1) return 0;
    if (l <= 5) return Math.floor(l / 2);
    return Math.floor(l / 2) - 1;
}

function rsvpSetWord(word) {
    const el = document.getElementById('rsvp-word');
    el.classList.remove('text-3xl', 'text-4xl', 'text-5xl', 'text-6xl');
    const l = word.length;
    el.classList.add(l > 12 ? 'text-3xl' : l > 8 ? 'text-4xl' : l > 5 ? 'text-5xl' : 'text-6xl');
    const p = rsvpOrpIdx(word);
    document.getElementById('rsvp-before').textContent = word.slice(0, p);
    document.getElementById('rsvp-pivot').textContent  = word[p] || '';
    document.getElementById('rsvp-after').textContent  = word.slice(p + 1);
}

function rsvpTogglePlay() {
    if (rsvpIndex >= rsvpWordsArray.length) rsvpIndex = 0;
    rsvpIsPlaying = !rsvpIsPlaying;
    rsvpUpdatePlayUI();

    if (rsvpIsPlaying) {
        document.getElementById('rsvp-context').style.opacity = '0';
        // Snap epub back to where we paused before resuming playback
        if (rsvpPausedCfi && rendition) {
            rendition.display(rsvpPausedCfi).then(() => {
                rsvpLoop();
            });
        } else {
            rsvpLoop();
        }
    } else {
        // Save exact page position so snap-back knows where to return
        rsvpPausedCfi = rendition?.currentLocation()?.start?.cfi || null;
        clearTimeout(rsvpTimer);
        rsvpShowContext();
    }
}

function rsvpLoop() {
    if (!rsvpIsPlaying || rsvpIndex >= rsvpWordsArray.length) {
        rsvpIsPlaying = false;
        rsvpUpdatePlayUI();
        if (rsvpIndex >= rsvpWordsArray.length) rsvpSetWord('Done.');
        return;
    }
    const wd = rsvpWordsArray[rsvpIndex];
    rsvpSetWord(wd.word);
    rsvpUpdateProgress();
    rsvpUpdateStatus(wd.complexity);
    document.getElementById('rsvp-chapter-badge').textContent = rsvpCurrentChapterTitle();

    if (rsvpActive) rsvpHighlightInEpub(rsvpIndex);

    const ms = (60000 / rsvpBaseWpm) * wd.complexity;
    rsvpTimer = setTimeout(() => {
        if (wd.pause_after_ms > 0) {
            rsvpSetWord('');
            rsvpTimer = setTimeout(() => { rsvpIndex++; rsvpLoop(); }, wd.pause_after_ms);
        } else {
            rsvpIndex++;
            rsvpLoop();
        }
    }, ms);
}

function rsvpStopPlayer() {
    rsvpIsPlaying = false;
    clearTimeout(rsvpTimer);
    rsvpUpdatePlayUI();
}

function rsvpRestart() {
    rsvpIndex = 0;
    rsvpStopPlayer();
    rsvpSetWord('Ready.');
    rsvpUpdateProgress();
    document.getElementById('rsvp-context').style.opacity = '0';
    if (rsvpChapterBoundaries.length > 0 && rendition) {
        rendition.display(rsvpChapterBoundaries[0].spineHref).catch(() => {});
    }
}

function rsvpJumpSeconds(sec) {
    const wps  = rsvpBaseWpm / 60;
    rsvpIndex  = Math.max(0, Math.min(rsvpIndex + Math.round(wps * sec), rsvpWordsArray.length - 1));
    if (!rsvpIsPlaying) {
        rsvpSetWord(rsvpWordsArray[rsvpIndex]?.word || '');
        rsvpHighlightInEpub(rsvpIndex);
        rsvpShowContext();
    } else {
        clearTimeout(rsvpTimer);
        rsvpLoop();
    }
}

// ── UI helpers ──
function rsvpShowContext() {
    const ctx = document.getElementById('rsvp-context');
    if (rsvpIndex < rsvpWordsArray.length) {
        ctx.textContent   = rsvpWordsArray[rsvpIndex].sentence_text;
        ctx.style.opacity = '1';
    }
}

function rsvpSetMode(m) {
    rsvpMode    = m;
    rsvpBaseWpm = RSVP_MODES[m].wpm;
    document.getElementById('rsvp-mode-label').textContent = RSVP_MODES[m].label;
    document.querySelectorAll('.rsvp-mode-btn').forEach(b => {
        const active = parseInt(b.dataset.mode) === m;
        b.classList.toggle('rsvp-mode-active', active);
        b.setAttribute('aria-pressed', String(active));
    });
}

function rsvpUpdatePlayUI() {
    const playing = rsvpIsPlaying;
    document.getElementById('rsvp-icon-play').classList.toggle('hidden', playing);
    document.getElementById('rsvp-icon-pause').classList.toggle('hidden', !playing);
    document.getElementById('rsvp-play-btn').classList.toggle('bg-warm-800', playing);
    document.getElementById('rsvp-play-btn').classList.toggle('bg-warm-600', !playing);
    document.getElementById('rsvp-play-btn').setAttribute('aria-pressed', String(playing));
}

function rsvpUpdateProgress() {
    const pct = rsvpWordsArray.length ? (rsvpIndex / rsvpWordsArray.length) * 100 : 0;
    const bar = document.getElementById('rsvp-progress');
    bar.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', Math.round(pct));
}

function rsvpUpdateStatus(complexity) {
    const el = document.getElementById('rsvp-status');
    el.textContent = `${complexity.toFixed(1)}×`;
    el.className   = `shrink-0 px-2.5 py-1 rounded-full font-mono text-[9px] font-bold uppercase tracking-widest border ${
        complexity > 1.2 ? 'bg-warm-200 text-warm-800 border-warm-300' :
        complexity < 0.9 ? 'bg-white text-warm-500 border-warm-200' :
                           'bg-warm-100 text-warm-700 border-warm-200'}`;
}

function rsvpShowPrep(title, sub, done, total) {
    document.getElementById('rsvp-prep-title').textContent = title;
    document.getElementById('rsvp-prep-sub').textContent   = sub;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('rsvp-prep-bar').style.width   = `${pct}%`;
    document.getElementById('rsvp-prep-chunk').textContent = total > 0 ? `Chapter ${done} of ${total}` : 'Starting…';
    if (done >= total && total > 0) document.getElementById('rsvp-prep-bar').classList.remove('rsvp-bar-pulse');
    else document.getElementById('rsvp-prep-bar').classList.add('rsvp-bar-pulse');
}

function rsvpSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
