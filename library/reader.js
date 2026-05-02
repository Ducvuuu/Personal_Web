// ── FIREBASE ──
const firebaseConfig = {
    apiKey: "AIzaSyAp4iRTfJ0jWBX5XcTiBAghdN_iCE0Ix4o",
    authDomain: "personal-web-journal.firebaseapp.com",
    projectId: "personal-web-journal",
    storageBucket: "personal-web-journal.firebasestorage.app",
    messagingSenderId: "980592936593",
    appId: "1:980592936593:web:20e8dc2a636a3e8be8e130"
};
firebase.initializeApp(firebaseConfig);
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// ── STATE ──
const bookId      = new URLSearchParams(window.location.search).get('id');
let rendition     = null;
let bookDoc       = null;
let epubBook      = null;
let highlightMode = false;
let saveTimer     = null;
let fontSize      = parseInt(localStorage.getItem('lib_fontSize') || '18');
let currentTheme  = localStorage.getItem('lib_theme')  || 'sepia';
let currentFont   = localStorage.getItem('lib_font')   || 'serif';

// ── AUTH ──
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('auth-gate').classList.add('hidden');
        if (!bookId) { window.location.href = 'index.html'; return; }
        initBook();
    } else {
        document.getElementById('auth-gate').classList.remove('hidden');
    }
});

async function login() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errEl    = document.getElementById('login-error');
    const errMsg   = document.getElementById('login-error-msg');
    if (!email || !password) return;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch spin-slow" aria-hidden="true"></i> Unlocking…';
    btn.disabled  = true;
    errEl.classList.add('hidden');
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch {
        errMsg.textContent = 'Wrong email or password.';
        errEl.classList.remove('hidden');
        btn.innerHTML = '<i class="fa-solid fa-lock text-xs text-warm-400" aria-hidden="true"></i> Open the library';
        btn.disabled  = false;
    }
}

// ── INIT BOOK ──
async function initBook() {
    showLoading('Opening book…');
    try {
        const snap = await db.collection('library').doc(bookId).get();
        if (!snap.exists) { window.location.href = 'index.html'; return; }
        bookDoc = { id: snap.id, ...snap.data() };

        document.getElementById('nav-title').textContent  = bookDoc.title;
        document.getElementById('nav-author').textContent = bookDoc.author || '';
        document.title = `Reading: ${bookDoc.title}`;

        await initReader(bookDoc.fileUrl);
    } catch (err) {
        showLoading('Could not load book.');
        console.error(err);
    }
}

// ── INIT READER ──
async function initReader(url) {
    document.getElementById('reader-area').classList.remove('hidden');
    applyBodyTheme(currentTheme);

    try {
        showLoading('Opening book…');
        epubBook  = ePub(url, { openAs: 'epub' });
        const viewerEl = document.getElementById('viewer');
        rendition = epubBook.renderTo(viewerEl, {
            width:  viewerEl.offsetWidth  || window.innerWidth,
            height: viewerEl.offsetHeight || (window.innerHeight - 124),
            spread: 'none',
            flow:   'paginated',
            allowScriptedContent: true
        });
    } catch (err) {
        showLoading(`Could not open book: ${err.message}`);
        return;
    }

    // Register themes + typography hook BEFORE display so first page gets styling
    registerThemes();

    // ── DISPLAY ──
    showLoading('Rendering…');
    const tryDisplay = target => Promise.race([
        rendition.display(target),
        new Promise((_, r) => setTimeout(() => r(new Error('display-timeout')), 30000))
    ]);

    try {
        if (bookDoc.currentCfi) {
            try { await tryDisplay(bookDoc.currentCfi); }
            catch { await tryDisplay(); }
        } else {
            await tryDisplay();
        }
    } catch (err) {
        showLoading(err.message === 'display-timeout'
            ? 'Render timed out — this EPUB may be malformed.'
            : `Render failed: ${err.message}`);
        return;
    }

    // ── APPLY THEMES + FONT ──
    rendition.themes.select(currentTheme);
    rendition.themes.fontSize(`${fontSize}px`);
    rendition.themes.override('font-family', currentFont === 'sans'
        ? "'Outfit', system-ui, sans-serif"
        : "'Lora', Georgia, serif");
    document.getElementById('font-size-display').textContent = `${fontSize}px`;
    updateFontButtons();
    updateThemeButtons();

    showLoading(null);

    // ── BACKGROUND TASKS ──
    epubBook.locations.generate(1600).then(() => {
        const loc = rendition.currentLocation();
        if (loc) updateProgress(loc);
    }).catch(() => {});

    epubBook.loaded.navigation
        .then(nav => buildToc(nav.toc))
        .catch(() => {});

    // ── EVENTS ──
    rendition.on('relocated', location => {
        updateProgress(location);
        scheduleSave(location);
        if (rsvpActive) rsvpOnEpubRelocated();
    });

    rendition.on('selected', cfiRange => {
        if (!highlightMode) return;
        addHighlight(cfiRange);
        rendition.getContents().forEach(c => c.window.getSelection().removeAllRanges());
    });

    (bookDoc.highlights || []).forEach(h => paintHighlight(h.cfi));

    rendition.on('click', () => {
        document.getElementById('settings-panel').classList.add('hidden');
        if (!rsvpActive) document.body.classList.toggle('reading-mode');
    });

    document.addEventListener('keydown', e => {
        if (!document.getElementById('settings-panel').classList.contains('hidden')) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); nextPage(); }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')                    { e.preventDefault(); prevPage(); }
    });

    let touchStartX = 0;
    const viewerEl = document.getElementById('viewer');
    viewerEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    viewerEl.addEventListener('touchend',   e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) dx < 0 ? nextPage() : prevPage();
    });
}

function prevPage() { if (rendition) rendition.prev(); }
function nextPage() { if (rendition) rendition.next(); }

// ── PROGRESS ──
function bookPct(cfi) {
    if (epubBook && epubBook.locations && epubBook.locations.length()) {
        return Math.round(epubBook.locations.percentageFromCfi(cfi) * 100);
    }
    return null;
}

function updateProgress(location) {
    if (!location || !location.start) return;
    const cfi = location.start.cfi;
    const pct = bookPct(cfi);

    document.getElementById('pct-label').textContent     = pct !== null ? `${pct}%` : '…';
    const progressFill = document.getElementById('progress-fill');
    progressFill.style.width = pct !== null ? `${pct}%` : '0%';
    progressFill.setAttribute('aria-valuenow', pct !== null ? pct : 0);

    if (epubBook && epubBook.locations && epubBook.locations.length()) {
        const locIdx = epubBook.locations.locationFromCfi(cfi);
        const total  = epubBook.locations.length();
        document.getElementById('loc-label').textContent = `${locIdx + 1} / ${total}`;
    } else {
        document.getElementById('loc-label').textContent = '';
    }

    const href = location.start.href || '';
    document.getElementById('chapter-label').textContent =
        href ? href.split('/').pop().replace(/\.(html|xhtml)$/, '').replace(/-/g, ' ').toUpperCase() : '—';
}

function scheduleSave(location) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProgress(location), 2500);
}

async function saveProgress(location) {
    if (!location?.start || !bookId) return;
    const cfi = location.start.cfi;
    const pct = bookPct(cfi) ?? Math.round((location.start.percentage || 0) * 100);
    const chapter = document.getElementById('chapter-label').textContent;
    await db.collection('library').doc(bookId).update({
        currentCfi:     cfi,
        percentage:     pct,
        currentChapter: chapter,
        status:         pct >= 99 ? 'finished' : 'reading',
        lastRead:       firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ── PROGRESS BAR DRAGGING ──
const progressTrack = document.getElementById('progress-track');
const progressFill  = document.getElementById('progress-fill');
let isDraggingProgress = false;

function getDragPct(e) {
    const rect    = progressTrack.getBoundingClientRect();
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function startProgressDrag(e) {
    isDraggingProgress = true;
    progressFill.style.transition = 'none';
    const pct = getDragPct(e);
    progressFill.style.width = `${pct * 100}%`;
}

function doProgressDrag(e) {
    if (!isDraggingProgress) return;
    e.preventDefault();
    const pct = getDragPct(e);
    progressFill.style.width = `${pct * 100}%`;
    document.getElementById('pct-label').textContent = `${Math.round(pct * 100)}%`;
}

function endProgressDrag(e) {
    if (!isDraggingProgress) return;
    isDraggingProgress = false;
    progressFill.style.transition = '';

    const pct = getDragPct(e);
    if (epubBook && epubBook.locations && epubBook.locations.length()) {
        const cfi = epubBook.locations.cfiFromPercentage(pct);
        if (cfi) rendition.display(cfi);
    }
}

progressTrack.addEventListener('mousedown',  startProgressDrag);
progressTrack.addEventListener('touchstart', startProgressDrag, { passive: false });

window.addEventListener('mousemove', doProgressDrag);
window.addEventListener('touchmove', doProgressDrag, { passive: false });

window.addEventListener('mouseup',  endProgressDrag);
window.addEventListener('touchend', endProgressDrag);

// ── HIGHLIGHTS ──
function toggleHighlightMode() {
    highlightMode = !highlightMode;
    const btn = document.getElementById('highlight-btn');
    btn.className = highlightMode
        ? 'text-orange-500 text-base'
        : 'text-warm-400 hover:text-warm-800 transition-colors text-base';
    btn.setAttribute('aria-pressed', String(highlightMode));
}

function paintHighlight(cfi) {
    try {
        rendition.annotations.add('highlight', cfi, {}, null, 'hl', {
            fill: 'rgba(227,136,71,0.2)',
            'fill-opacity': '1',
            'stroke': 'rgba(227,136,71,0.5)',
            'stroke-width': '1.5',
            'stroke-alignment': 'inner'
        });
    } catch { }
}

async function addHighlight(cfi) {
    paintHighlight(cfi);
    const highlights = [...(bookDoc.highlights || []), { cfi, createdAt: new Date().toISOString() }];
    bookDoc.highlights = highlights;
    await db.collection('library').doc(bookId).update({ highlights });
}

// ── TOC ──
function buildToc(toc) {
    const list = document.getElementById('toc-list');
    if (!toc || toc.length === 0) {
        list.innerHTML = '<li class="font-mono text-xs text-warm-400 px-3 py-2">No table of contents available.</li>';
        return;
    }
    list.innerHTML = toc.map(item => tocItemHTML(item, 0)).join('');
}

function tocItemHTML(item, depth) {
    const indent = depth > 0 ? `padding-left:${depth * 12 + 12}px` : 'padding-left:12px';
    let html = `
        <li>
            <button onclick="rendition.display('${item.href}'); toggleToc();"
                style="${indent}"
                class="w-full text-left py-2 pr-3 rounded-lg hover:bg-warm-100 text-warm-700 hover:text-warm-900 transition-colors font-outfit text-sm">
                ${item.label.trim()}
            </button>
        </li>`;
    if (item.subitems && item.subitems.length > 0) {
        html += item.subitems.map(sub => tocItemHTML(sub, depth + 1)).join('');
    }
    return html;
}

function toggleToc() {
    document.getElementById('toc-panel').classList.toggle('open');
    document.getElementById('toc-backdrop').classList.toggle('hidden');
}

// ── SETTINGS ──
function toggleSettings() {
    document.getElementById('settings-panel').classList.toggle('hidden');
}

function registerThemes() {
    const base = {
        body: {
            'line-height':            '1.85 !important',
            'text-rendering':         'optimizeLegibility',
            '-webkit-font-smoothing': 'antialiased',
            'padding':                '2em 6% 1em !important',
        },
        p:  { 'orphans': '3', 'widows': '3', 'hyphens': 'auto', '-webkit-hyphens': 'auto' },
        'h1,h2,h3,h4,h5,h6': { 'line-height': '1.3' },
    };

    rendition.themes.register('sepia', {
        ...base,
        body: { ...base.body, background: '#fdfcf6 !important', color: '#332925 !important' },
        a:   { color: '#d56a31 !important', 'text-decoration': 'none !important' },
    });
    rendition.themes.register('light', {
        ...base,
        body: { ...base.body, background: '#ffffff !important', color: '#1a1a1a !important' },
        a:   { color: '#d56a31 !important', 'text-decoration': 'none !important' },
    });
    rendition.themes.register('dark', {
        ...base,
        body: { ...base.body, background: '#1a1612 !important', color: '#d4c5b0 !important' },
        a:   { color: '#e38847 !important', 'text-decoration': 'none !important' },
    });

    // Inject Google Fonts + typography into every rendered iframe
    rendition.hooks.content.register(contents => {
        const doc = contents.document;
        if (!doc?.head) return;

        const link = doc.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Outfit:wght@300;400;500;900&display=swap';
        doc.head.appendChild(link);

        const style = doc.createElement('style');
        style.textContent = `
            ::selection { background: rgba(251,176,64,0.35); color: #332925; }
            p {
                margin-bottom: 1.5em !important;
                line-height: 1.8 !important;
                hyphens: auto; -webkit-hyphens: auto;
                orphans: 3; widows: 3;
            }
            p:first-of-type::first-letter {
                font-family: 'Outfit', sans-serif !important;
                font-weight: 900 !important;
                font-size: 4.2em !important;
                line-height: 0.8 !important;
                float: left !important;
                padding-right: 0.12em !important;
                padding-top: 0.08em !important;
                color: #d56a31 !important;
            }
            h1, h2, h3, h4 {
                font-family: 'Outfit', sans-serif !important;
                font-weight: 900 !important;
                line-height: 1.25 !important;
                color: #4a2517 !important;
                margin-bottom: 0.75em !important;
            }
            h1 { font-size: 2em !important; }
            h2 { font-size: 0.8em !important; color: #d56a31 !important; letter-spacing: 0.05em !important; text-transform: uppercase !important; }
            mark, .highlight {
                background: rgba(227,136,71,0.2) !important;
                border-bottom: 2px solid rgba(227,136,71,0.5) !important;
                border-radius: 0 !important;
                padding-bottom: 1px !important;
            }
        `;
        doc.head.appendChild(style);

        // ── RSVP word-injection styles ──
        const rsvpStyle = doc.createElement('style');
        rsvpStyle.textContent = `
            .rsvp-w {
                cursor: pointer;
                border-radius: 2px;
                padding: 0 1px;
                transition: background 0.08s;
                display: inline;
            }
            .rsvp-w:hover { background: rgba(251,176,64,0.28); }
            .rsvp-current {
                background: #fef08a !important;
                color: #8f4228 !important;
                font-weight: 700 !important;
                border-radius: 3px !important;
                box-shadow: 0 0 0 1.5px rgba(235,173,122,0.7) !important;
            }
        `;
        doc.head.appendChild(rsvpStyle);

        // ── RSVP word-injection script ──
        const rsvpScript = doc.createElement('script');
        rsvpScript.textContent = `
(function() {
    var wrapped = false;
    var totalWords = 0;

    function wrapWords() {
        if (wrapped) return;
        wrapped = true;
        var li = 0;
        var firstWords = [];

        function processNode(node) {
            if (!node) return;
            var tag = node.tagName;
            if (tag && ['SCRIPT','STYLE','NAV','ASIDE','FIGURE','FIGCAPTION'].indexOf(tag) >= 0) return;
            if (node.classList && node.classList.contains('rsvp-w')) return;

            if (node.nodeType === 3) {
                var text = node.textContent;
                if (!text.trim()) return;
                var tokens = text.split(/(\\s+)/);
                var hasWord = false;
                for (var t = 0; t < tokens.length; t++) { if (tokens[t] && !/^\\s+$/.test(tokens[t])) { hasWord = true; break; } }
                if (!hasWord) return;

                var frag = document.createDocumentFragment();
                for (var t = 0; t < tokens.length; t++) {
                    var tok = tokens[t];
                    if (!tok) continue;
                    if (/^\\s+$/.test(tok)) {
                        frag.appendChild(document.createTextNode(tok));
                    } else {
                        var sp = document.createElement('span');
                        sp.className = 'rsvp-w';
                        sp.setAttribute('data-li', li);
                        sp.textContent = tok;
                        if (li < 40) firstWords.push(tok.replace(/[^\\w'\\-]/g, ''));
                        li++;
                        frag.appendChild(sp);
                    }
                }
                if (node.parentNode) node.parentNode.replaceChild(frag, node);
                return;
            }

            if (node.nodeType === 1) {
                var kids = [];
                for (var k = 0; k < node.childNodes.length; k++) kids.push(node.childNodes[k]);
                for (var k = 0; k < kids.length; k++) processNode(kids[k]);
            }
        }

        if (document.body) processNode(document.body);
        totalWords = li;

        window.parent.postMessage({
            type: 'rsvp-page-words',
            words: firstWords,
            total: totalWords
        }, '*');
    }

    function highlight(li) {
        var els = document.querySelectorAll('.rsvp-current');
        for (var i = 0; i < els.length; i++) els[i].classList.remove('rsvp-current');
        if (li < 0) return;
        var target = document.querySelector('.rsvp-w[data-li="' + li + '"]');
        if (target) {
            target.classList.add('rsvp-current');
            var rect = target.getBoundingClientRect();
            var vH = window.innerHeight || document.documentElement.clientHeight;
            var vW = window.innerWidth  || document.documentElement.clientWidth;
            if (rect.bottom < 0 || rect.top > vH || rect.right < 0 || rect.left > vW) {
                window.parent.postMessage({ type: 'rsvp-need-flip', forward: rect.top >= 0 }, '*');
            }
        } else {
            window.parent.postMessage({ type: 'rsvp-need-flip', forward: true }, '*');
        }
    }

    window.addEventListener('message', function(e) {
        if (!e.data || !e.data.type) return;
        if (e.data.type === 'rsvp-activate') wrapWords();
        if (e.data.type === 'rsvp-hl')       { wrapWords(); highlight(e.data.li); }
    });

    document.addEventListener('click', function(e) {
        var el = e.target;
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains('rsvp-w')) {
                window.parent.postMessage({
                    type: 'rsvp-epub-click',
                    li:   parseInt(el.getAttribute('data-li')),
                    word: el.textContent
                }, '*');
                return;
            }
            el = el.parentNode;
        }
    }, true);
})();
        `;
        doc.head.appendChild(rsvpScript);
    });
}

function setTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('lib_theme', theme);
    rendition.themes.select(theme);
    applyBodyTheme(theme);
    updateThemeButtons();
}

function applyBodyTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') document.body.classList.add('theme-light');
    if (theme === 'dark')  document.body.classList.add('theme-dark');
}

function updateThemeButtons() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        const isActive = btn.dataset.theme === currentTheme;
        btn.classList.toggle('ring-2',          isActive);
        btn.classList.toggle('ring-orange-200', isActive);
        btn.classList.toggle('ring-offset-1',   isActive);
    });
}

function changeFontSize(delta) {
    fontSize = Math.min(28, Math.max(12, fontSize + delta));
    localStorage.setItem('lib_fontSize', fontSize);
    document.getElementById('font-size-display').textContent = `${fontSize}px`;
    rendition.themes.fontSize(`${fontSize}px`);
}

function setFont(font) {
    currentFont = font;
    localStorage.setItem('lib_font', font);
    const family = font === 'serif'
        ? "'Lora', Georgia, serif"
        : "'Outfit', system-ui, sans-serif";
    rendition.themes.override('font-family', family);
    updateFontButtons();
}

function updateFontButtons() {
    const isSerif = currentFont === 'serif';
    document.getElementById('btn-serif').className =
        `flex-1 py-2 rounded-xl font-book text-sm transition-colors ${isSerif ? 'bg-warm-200 text-warm-900' : 'text-warm-600 hover:bg-warm-100'}`;
    document.getElementById('btn-sans').className =
        `flex-1 py-2 rounded-xl font-outfit text-sm transition-colors ${!isSerif ? 'bg-warm-200 text-warm-900' : 'text-warm-600 hover:bg-warm-100'}`;
}

// ── HELPERS ──
function showLoading(text) {
    const el = document.getElementById('loading-screen');
    if (text === null) { el.classList.add('hidden'); return; }
    document.getElementById('loading-text').textContent = text;
    el.classList.remove('hidden');
}

document.addEventListener('click', e => {
    const panel = document.getElementById('settings-panel');
    if (!panel.classList.contains('hidden') &&
        !panel.contains(e.target) &&
        !e.target.closest('[onclick="toggleSettings()"]')) {
        panel.classList.add('hidden');
    }
});
