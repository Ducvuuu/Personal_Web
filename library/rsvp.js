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

// ── Epub iframe sync state ──
let rsvpEpubPageWordStart = 0;
let rsvpEpubPageWordCount = 0;
let rsvpEpubNavigating    = false;

// ── Listen for messages from epub iframe ──
window.addEventListener('message', e => {
    if (!e.data?.type) return;

    if (e.data.type === 'rsvp-page-words' && rsvpActive) {
        rsvpEpubPageWordCount = e.data.total || 0;
        rsvpEpubNavigating    = false;

        const rawWords  = e.data.words || [];
        const pageWords = rawWords.map(w => w.toLowerCase().replace(/[^\w]/g, '')).filter(Boolean);
        if (pageWords.length >= 2 && rsvpWordsArray.length > 0) {
            // Search the full current chapter, not just a narrow window around rsvpIndex
            let chIdx = -1;
            for (let i = rsvpChapterBoundaries.length - 1; i >= 0; i--) {
                if (rsvpChapterBoundaries[i].startWordIdx <= rsvpIndex) { chIdx = i; break; }
            }
            const searchStart = chIdx >= 0
                ? rsvpChapterBoundaries[chIdx].startWordIdx
                : Math.max(0, rsvpIndex - 500);
            const chEnd = chIdx >= 0 && chIdx + 1 < rsvpChapterBoundaries.length
                ? rsvpChapterBoundaries[chIdx + 1].startWordIdx
                : rsvpWordsArray.length;
            const searchEnd  = Math.min(chEnd - 1, rsvpIndex + 1500);
            const matchLen   = Math.min(10, pageWords.length);

            outer: for (let i = searchStart; i <= searchEnd; i++) {
                const cand = (rsvpWordsArray[i]?.word || '').toLowerCase().replace(/[^\w]/g, '');
                if (cand !== pageWords[0]) continue;
                for (let j = 1; j < matchLen; j++) {
                    if ((rsvpWordsArray[i + j]?.word || '').toLowerCase().replace(/[^\w]/g, '') !== pageWords[j]) continue outer;
                }
                rsvpEpubPageWordStart = i;
                break;
            }
        }
        if (rsvpActive) rsvpHighlightInEpub(rsvpIndex);
    }

    // Iframe reports highlighted word is off the visible page — flip now
    if (e.data.type === 'rsvp-need-flip' && rsvpActive && !rsvpEpubNavigating) {
        rsvpEpubNavigating = true;
        if (e.data.forward) rendition?.next?.();
        else rendition?.prev?.();
    }

    if (e.data.type === 'rsvp-epub-click' && rsvpActive) {
        const li           = e.data.li;
        const clickedWord  = (e.data.word || '').toLowerCase().replace(/[^\w]/g, '');
        let   globalIdx    = rsvpEpubPageWordStart + li;

        // Verify the word at the estimated position actually matches what was clicked.
        // If calibration was off, search ±60 words around the estimate for the closest match.
        if (clickedWord) {
            const est     = globalIdx;
            const lo      = Math.max(0, est - 60);
            const hi      = Math.min(rsvpWordsArray.length - 1, est + 60);
            const atEst   = (rsvpWordsArray[est]?.word || '').toLowerCase().replace(/[^\w]/g, '');
            if (atEst !== clickedWord) {
                let bestDist = Infinity;
                for (let i = lo; i <= hi; i++) {
                    const w = (rsvpWordsArray[i]?.word || '').toLowerCase().replace(/[^\w]/g, '');
                    if (w === clickedWord) {
                        const dist = Math.abs(i - est);
                        if (dist < bestDist) { bestDist = dist; globalIdx = i; }
                    }
                }
            }
        }

        if (globalIdx >= 0 && globalIdx < rsvpWordsArray.length) {
            rsvpJumpToGlobalWord(globalIdx);
        }
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
    if (rsvpCancelled || chapters.length === 0) return;

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
            const section = epubBook.spine.get(i);
            const doc     = await section.load(epubBook.load.bind(epubBook));
            const text    = rsvpExtractText(doc);
            section.unload();
            if (text.trim().length < 100) continue;

            chapters.push({
                title:     label || `Section ${chapters.length + 1}`,
                spineHref: item.href || '',
                sentences: rsvpSplitSentences(text.trim()),
            });
        } catch {}
    }
    return chapters;
}

// ── Extract text, preserving paragraph breaks ──
function rsvpExtractText(doc) {
    if (!doc) return '';
    const body = doc.body || doc;
    ['script','style','nav','aside','figure','figcaption'].forEach(tag => {
        body.querySelectorAll?.(tag).forEach(el => el.remove());
    });
    return (body.innerText || body.textContent || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ── Split into sentences; last sentence of each paragraph gets 400ms pause ──
function rsvpSplitSentences(text) {
    const sentences  = [];
    const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
    paragraphs.forEach(para => {
        const raw      = para.match(/[^.!?…]+[.!?…]+["']?\s*/g) || [para];
        const paraSnts = raw.map(s => s.trim()).filter(s => s.length > 0);
        paraSnts.forEach((sText, i) => {
            sentences.push({
                index: sentences.length,
                text:  sText,
                pause: i === paraSnts.length - 1 ? 400 : 150,
            });
        });
    });
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
            const words      = sent.text.split(/\s+/);
            words.forEach((word, wi) => {
                rsvpWordsArray.push({
                    word,
                    complexity,
                    pause_after_ms: wi === words.length - 1 ? sent.pause : 0,
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
    const href   = loc.start.href || '';
    const chIdx  = rsvpChapterBoundaries.findIndex(b =>
        href && (href === b.spineHref || href.endsWith(b.spineHref) || b.spineHref.endsWith(href.split('/').pop()))
    );
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
    rsvpEpubNavigating    = false;
    rsvpEpubPageWordStart = 0;
    rsvpEpubPageWordCount = 0;
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
    const li = globalIdx - rsvpEpubPageWordStart;
    if (rsvpEpubPageWordCount > 0 && li >= rsvpEpubPageWordCount) {
        rsvpEpubNavigating = true;
        rendition?.next?.();
        return;
    }
    if (li < 0) {
        rsvpEpubNavigating = true;
        rendition?.prev?.();
        return;
    }
    rsvpSendToEpub({ type: 'rsvp-hl', li });
}

function rsvpJumpToGlobalWord(globalIdx) {
    rsvpIndex = Math.max(0, Math.min(globalIdx, rsvpWordsArray.length - 1));
    rsvpSetWord(rsvpWordsArray[rsvpIndex]?.word || '');
    rsvpUpdateProgress();
    rsvpHighlightInEpub(rsvpIndex);
    if (rsvpIsPlaying) { clearTimeout(rsvpTimer); rsvpLoop(); }
    else rsvpShowContext();
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
        rsvpLoop();
    } else {
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
