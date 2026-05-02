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
let allBooks     = [];
let activeFilter = 'all';

// ── AUTH ──
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('auth-gate').classList.add('hidden');
        document.getElementById('main-library').classList.remove('hidden');
        const lb = document.getElementById('logout-btn');
        lb.classList.remove('hidden');
        lb.style.display = 'flex';
        loadBooks();
    } else {
        document.getElementById('auth-gate').classList.remove('hidden');
        document.getElementById('main-library').classList.add('hidden');
        document.getElementById('logout-btn').classList.add('hidden');
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

function logout() { auth.signOut(); }

// ── LOAD BOOKS ──
async function loadBooks() {
    const snap = await db.collection('library').orderBy('uploadedAt', 'desc').get();
    allBooks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCurrentlyReading();
    renderBookshelf();
}

// ── CURRENTLY READING ──
function renderCurrentlyReading() {
    const section = document.getElementById('currently-reading-section');
    const reading = allBooks
        .filter(b => b.status === 'reading')
        .sort((a, b) => (b.lastRead?.seconds || 0) - (a.lastRead?.seconds || 0))[0];

    if (!reading) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    const pct = reading.percentage || 0;
    const coverHtml = reading.coverUrl
        ? `<img src="${reading.coverUrl}" alt="Cover of ${escHtml(reading.title)}" class="book-cover-image">`
        : `<div class="absolute inset-0 p-4 flex flex-col justify-center items-center bg-warm-700 rounded-r-lg"><span class="font-heavy text-white text-sm text-center leading-tight">${escHtml(reading.title)}</span></div>`;

    section.innerHTML = `
        <div class="bg-[#fffdfa] rounded-[2rem] border border-warm-200 p-6 md:p-10 shadow-[0_15px_35px_-5px_rgba(74,37,23,0.1)] relative overflow-hidden">
            <div class="absolute -right-20 -top-20 w-96 h-96 bg-orange-50 rounded-full blur-3xl opacity-40 pointer-events-none"></div>
            <div class="flex flex-col md:flex-row gap-8 md:gap-12 items-center relative z-10">
                <button class="w-40 sm:w-48 shrink-0 book-card cursor-pointer" data-book-id="${escHtml(reading.id)}" aria-label="Continue reading ${escHtml(reading.title)}">
                    <div class="book-cover aspect-[2/3] bg-warm-800 relative">${coverHtml}</div>
                </button>
                <div class="flex-1 w-full">
                    <div class="inline-flex items-center gap-2 font-mono text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-4">
                        <i class="fa-solid fa-bookmark" aria-hidden="true"></i> Currently Reading
                    </div>
                    <h2 class="font-heavy text-3xl md:text-4xl text-warm-900 mb-2 leading-tight">${escHtml(reading.title)}</h2>
                    <p class="text-lg text-warm-500 mb-6 font-light">${escHtml(reading.author || 'Unknown Author')}</p>
                    <div class="bg-warm-50 border border-warm-200 p-4 rounded-xl shadow-inner mb-6">
                        <div class="flex justify-between font-mono text-xs text-warm-800 font-bold mb-2">
                            <span>${escHtml(reading.currentChapter || 'Reading…')}</span>
                            <span class="text-orange-600">${pct}%</span>
                        </div>
                        <div class="progress-bar-container" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Reading progress">
                            <div class="progress-bar-fill" style="width:${pct}%"></div>
                        </div>
                    </div>
                    <div class="flex gap-3">
                        <button data-book-id="${escHtml(reading.id)}"
                            class="bg-warm-900 text-warm-50 px-8 py-3 rounded-xl font-bold text-sm shadow-md hover:bg-warm-800 transition-colors flex items-center gap-2">
                            <i class="fa-solid fa-book-open text-xs text-warm-300" aria-hidden="true"></i> Continue Reading
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

// ── BOOKSHELF ──
function renderBookshelf() {
    const grid       = document.getElementById('book-grid');
    const emptyState = document.getElementById('empty-state');

    const filtered = activeFilter === 'all'
        ? allBooks
        : allBooks.filter(b => b.category === activeFilter);

    emptyState.classList.toggle('hidden', allBooks.length > 0);
    grid.innerHTML = filtered.map(bookCardHTML).join('') + uploadCardHTML();
}

function bookCardHTML(book) {
    const pct = book.percentage || 0;
    const coverHtml = book.coverUrl
        ? `<img src="${book.coverUrl}" alt="Cover of ${escHtml(book.title)}" class="book-cover-image">`
        : `<div class="absolute inset-0 p-3 flex flex-col justify-center items-center bg-warm-700 rounded-r-lg"><span class="font-heavy text-white text-xs text-center leading-tight">${escHtml(book.title)}</span></div>`;

    let statusHtml = '';
    if (book.status === 'finished') {
        statusHtml = `<div class="flex items-center gap-1 font-mono text-[9px] text-green-600 font-bold bg-green-50 w-fit px-2 py-0.5 rounded border border-green-200 mt-2"><i class="fa-solid fa-check" aria-hidden="true"></i> Finished</div>`;
    } else if (pct > 0) {
        statusHtml = `<div class="progress-bar-container h-1 mt-2" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Reading progress"><div class="progress-bar-fill" style="width:${pct}%"></div></div>`;
    } else {
        statusHtml = `<div class="font-mono text-[9px] text-warm-400 mt-2">Unread</div>`;
    }

    return `
        <button class="group text-left" data-book-id="${escHtml(book.id)}" aria-label="Open ${escHtml(book.title)}">
            <div class="w-full book-card mb-3">
                <div class="book-cover aspect-[2/3] bg-warm-800 relative">${coverHtml}</div>
            </div>
            <h4 class="font-bold text-warm-900 text-sm leading-tight mb-0.5 group-hover:text-orange-600 transition-colors line-clamp-2">${escHtml(book.title)}</h4>
            <p class="text-xs text-warm-500 mb-1">${escHtml(book.author || 'Unknown')}</p>
            ${statusHtml}
        </button>`;
}

function uploadCardHTML() {
    return `
        <button class="group" id="upload-card-btn" aria-label="Add a book — drop an epub file">
            <div class="w-full aspect-[2/3] rounded-lg border-2 border-dashed border-warm-300 bg-warm-50/50 hover:bg-warm-100 flex flex-col items-center justify-center transition-colors mb-3">
                <i class="fa-solid fa-plus text-2xl text-warm-300 group-hover:text-orange-500 transition-colors mb-2" aria-hidden="true"></i>
                <span class="font-mono text-[10px] font-bold text-warm-400 uppercase tracking-widest">Drop .epub</span>
            </div>
        </button>`;
}

// ── DELEGATED CLICK HANDLER for book cards ──
document.addEventListener('click', e => {
    const card = e.target.closest('[data-book-id]');
    if (card) { openBook(card.dataset.bookId); return; }

    const uploadCard = e.target.closest('#upload-card-btn');
    if (uploadCard) { document.getElementById('file-input').click(); }
});

// ── FILTER ──
function setFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(btn => {
        const active = btn.dataset.filter === filter;
        btn.className = `filter-tab px-3 py-1 rounded-lg text-xs font-bold font-mono transition-colors ${
            active ? 'bg-warm-200 text-warm-900' : 'hover:bg-warm-100 text-warm-600'}`;
        btn.setAttribute('aria-pressed', String(active));
    });
    renderBookshelf();
}

function openBook(id) {
    window.location.href = `reader.html?id=${id}`;
}

// ── DRAG & DROP ──
let dragCounter = 0;
document.addEventListener('dragenter', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter++;
    document.getElementById('drag-overlay').classList.remove('hidden');
});
document.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        document.getElementById('drag-overlay').classList.add('hidden');
    }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    document.getElementById('drag-overlay').classList.add('hidden');
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.epub')) handleFileUpload(file);
});

document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
});

// ── UPLOAD ──
async function handleFileUpload(file) {
    const modal = document.getElementById('upload-modal');
    modal.classList.remove('hidden');
    setUploadState('Reading metadata…', 'Extracting title and author', 5);

    let title  = file.name.replace(/\.epub$/i, '');
    let author = 'Unknown Author';
    let coverBlob = null;

    const timeout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));
    try {
        const ab   = await file.arrayBuffer();
        const book = ePub(ab, { openAs: 'epub' });
        const meta = await Promise.race([book.loaded.metadata, timeout(8000)]);
        if (meta.title)   title  = meta.title;
        if (meta.creator) author = meta.creator;
        try {
            const blobUrl = await Promise.race([book.coverUrl(), timeout(5000)]);
            if (blobUrl) {
                const res = await fetch(blobUrl);
                coverBlob = await res.blob();
            }
        } catch { /* cover extraction timed out — continue without */ }
        book.destroy();
    } catch { /* metadata extraction timed out or failed — continue with filename */ }

    setUploadState('Uploading…', `"${title}"`, 20);

    const bookId  = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const epubRef = storage.ref(`library/books/${bookId}.epub`);
    const task    = epubRef.put(file);

    await new Promise((resolve, reject) => {
        task.on('state_changed',
            snap => {
                const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 60) + 20;
                setUploadState('Uploading book…',
                    `${Math.round(snap.bytesTransferred / 1024)} KB`, pct);
            },
            reject,
            resolve
        );
    });

    const fileUrl = await epubRef.getDownloadURL();

    setUploadState('Uploading cover…', 'Processing cover image', 85);
    let coverUrl = null;
    if (coverBlob) {
        try {
            const coverRef = storage.ref(`library/covers/${bookId}.jpg`);
            await coverRef.put(coverBlob, { contentType: coverBlob.type || 'image/jpeg' });
            coverUrl = await coverRef.getDownloadURL();
        } catch { /* cover upload failed — continue without */ }
    }

    modal.classList.add('hidden');

    const category = await showCategoryPicker(title, author);

    modal.classList.remove('hidden');
    setUploadState('Saving to library…', 'Almost there', 95);

    try {
        await db.collection('library').doc(bookId).set({
            title, author, category,
            fileUrl, coverUrl,
            status: 'unread',
            percentage: 0,
            currentChapter: '',
            currentCfi: '',
            highlights: [],
            lastRead: null,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setUploadState('Done!', 'Your book is ready', 100);
        document.getElementById('upload-icon').className = 'fa-solid fa-check text-green-500 text-xl';
        await new Promise(r => setTimeout(r, 900));
        loadBooks();
    } catch (err) {
        setUploadState('Save failed', err.code === 'permission-denied'
            ? 'Check your Firestore rules — library collection not permitted'
            : err.message, 95);
        document.getElementById('upload-icon').className = 'fa-solid fa-triangle-exclamation text-red-400 text-xl';
        await new Promise(r => setTimeout(r, 4000));
    } finally {
        modal.classList.add('hidden');
        document.getElementById('upload-icon').className = 'fa-solid fa-circle-notch spin-slow text-warm-400 text-xl';
        setUploadState('Adding to library…', 'Reading book metadata', 5);
    }
}

function setUploadState(title, text, pct) {
    document.getElementById('upload-status-title').textContent = title;
    document.getElementById('upload-status-text').textContent  = text;
    document.getElementById('upload-progress-bar').style.width = `${pct}%`;
    document.getElementById('upload-progress-bar').setAttribute('aria-valuenow', pct);
    document.getElementById('upload-progress-label').textContent = `${pct}%`;
}

function showCategoryPicker(title, author) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-warm-900/60 backdrop-blur-sm';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Choose a category');
        overlay.innerHTML = `
            <div class="bg-warm-50 rounded-[2rem] border border-warm-200 shadow-2xl p-8 w-full max-w-sm mx-4">
                <h3 class="font-heavy text-xl text-warm-900 mb-1 leading-tight">${escHtml(title)}</h3>
                <p class="font-mono text-xs text-warm-400 mb-6">${escHtml(author)}</p>
                <label for="cat-select" class="font-mono text-[10px] text-warm-500 uppercase tracking-widest block mb-2">Category</label>
                <select id="cat-select" class="w-full px-4 py-2.5 rounded-xl bg-white border border-warm-200 text-sm font-mono text-warm-800 focus:outline-none focus:border-warm-400 mb-6">
                    <option value="fiction">Fiction</option>
                    <option value="non-fiction">Non-Fiction</option>
                    <option value="essays">Essays</option>
                    <option value="manuscripts">Manuscripts</option>
                </select>
                <button id="cat-confirm"
                    class="w-full bg-warm-900 text-warm-50 font-mono font-bold text-sm py-3 rounded-xl hover:bg-warm-800 transition-colors flex items-center justify-center gap-2">
                    <i class="fa-solid fa-plus text-xs text-warm-400" aria-hidden="true"></i> Add to Library
                </button>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#cat-confirm').addEventListener('click', () => {
            const cat = overlay.querySelector('#cat-select').value;
            document.body.removeChild(overlay);
            resolve(cat);
        });
        // Auto-focus the select for keyboard users
        setTimeout(() => overlay.querySelector('#cat-select')?.focus(), 50);
    });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
