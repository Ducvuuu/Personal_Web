/* ── home.js — Personal Web Home Page ── */

// ── Firebase config (same project as library) ──
const firebaseConfig = {
    apiKey: "AIzaSyAp4iRTfJ0jWBX5XcTiBAghdN_iCE0Ix4o",
    authDomain: "personal-web-journal.firebaseapp.com",
    projectId: "personal-web-journal",
    storageBucket: "personal-web-journal.firebasestorage.app",
    messagingSenderId: "980592936593",
    appId: "1:980592936793:web:20e8dc2a636a3e8be8e130"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

const OWNER_EMAIL = 'neopet2010@gmail.com';
const CONTENT_DOC = db.collection('site_content').doc('home');

// ── State ──
let editMode = false;

// ── Static data ──

const interestsData = [
    { icon: '⚡', title: 'Energy Systems',    desc: 'How electricity grids, fuel supply chains, and carbon markets interact with politics and institutions.' },
    { icon: '📖', title: 'Philosophy',         desc: 'Primarily Continental — Heidegger, Nishitani, Simone Weil. Also ethics of technology and political philosophy.' },
    { icon: '🌏', title: 'Southeast Asia',     desc: 'The region I call home across two countries. Its politics, cultures, and extraordinary diversity fascinate me.' },
    { icon: '✍️', title: 'Writing',            desc: 'Long-form essays and short notes. I write to think, not to perform having thought.' },
    { icon: '🎮', title: 'Games',              desc: 'Narrative-driven games as a storytelling medium. Currently: slow burn RPGs and walking simulators.' },
    { icon: '🏛️', title: 'Institutions',      desc: 'How rules, norms, and organisations shape human behaviour — often in ways their designers didn\'t intend.' },
];

const interestTags = [
    'urban planning', 'film scores', 'matcha', 'typography', 'podcasts',
    'maps', 'cafe hopping', 'long walks', 'climate fiction', 'analog photography',
    'board games', 'astrophysics', 'linguistics', 'food culture', 'sleep'
];

const skillsData = [
    { label: 'Policy analysis',    pct: 92 },
    { label: 'Data visualisation', pct: 78 },
    { label: 'Research writing',   pct: 88 },
    { label: 'Python / R',         pct: 65 },
    { label: 'Stakeholder mapping', pct: 80 },
];

const langsData = [
    { label: 'Vietnamese (native)', pct: 100 },
    { label: 'English (fluent)',    pct: 95 },
    { label: 'Indonesian (working)', pct: 60 },
];

const publicationsData = [
    { title: 'Coal Phase-Out Finance Mechanisms in ASEAN', year: '2024', venue: 'ACE Working Paper' },
    { title: 'Just Transition Pathways for Vietnam\'s Power Sector', year: '2023', venue: 'EDGE Policy Brief' },
    { title: 'Renewable Energy Potential Assessment — Mekong Region', year: '2022', venue: 'GIZ Technical Report' },
];

const volunteerData = [
    { title: 'Mentor', org: 'Young Energy Professionals Network', period: '2023 – present' },
    { title: 'Translator (VI/EN)', org: 'Climate Reality Project Vietnam', period: '2021 – 2022' },
];

const writingData = [
    {
        title: 'What energy transition actually means for people',
        date: 'March 2025',
        tag: 'Essay',
        excerpt: 'The gap between gigawatts installed and lives improved is where most transition policy fails.',
        href: '../writing/'
    },
    {
        title: 'On reading Nishitani seriously',
        date: 'January 2025',
        tag: 'Notes',
        excerpt: 'Religion and Nothingness is one of the hardest books I\'ve read. It\'s also one of the most useful.',
        href: '../writing/'
    },
    {
        title: 'The quiet politics of Southeast Asian grids',
        date: 'October 2024',
        tag: 'Analysis',
        excerpt: 'Who controls the wires turns out to matter enormously for who benefits from the energy transition.',
        href: '../writing/'
    },
];

const shelfData = {
    books: [
        { title: 'Religion and Nothingness', creator: 'Keiji Nishitani',     status: 'read',    review: 'Demanding but essential. Changed how I think about groundlessness and self.' },
        { title: 'The Art of Loving',         creator: 'Erich Fromm',          status: 'read',    review: 'A short book with a long argument. Love as discipline, not luck.' },
        { title: 'Ways of Seeing',            creator: 'John Berger',           status: 'read',    review: 'Taught me to mistrust my own gaze. In the best way.' },
        { title: 'Invisible Cities',          creator: 'Italo Calvino',         status: 'reading', review: 'Mid-read. Each city is a different way of being lost.' },
        { title: 'The Power Broker',          creator: 'Robert Caro',           status: 'queue',   review: 'On the list. 1200 pages about Robert Moses and institutional power.' },
    ],
    games: [
        { title: 'Disco Elysium',   creator: 'ZA/UM',          status: 'read',    review: 'The most literary game I\'ve played. Every dialogue is a character study.' },
        { title: 'Pentiment',       creator: 'Obsidian',        status: 'read',    review: 'A meditation on how history gets made and unmade at the local level.' },
        { title: 'Hollow Knight',   creator: 'Team Cherry',     status: 'reading', review: 'Current: still not done. The world-building is extraordinary.' },
    ],
    movies: [
        { title: 'A Brighter Summer Day', creator: 'Edward Yang',    status: 'read',  review: 'Four hours of slow accumulation. One of the best films ever made.' },
        { title: 'Chungking Express',     creator: 'Wong Kar-wai',   status: 'read',  review: 'About loneliness and the city in a way that feels like music.' },
        { title: 'Perfect Days',          creator: 'Wim Wenders',    status: 'queue', review: 'On my list after reading about its production process.' },
    ],
};

const promiseContent = {
    nishitani: {
        eyebrow: 'Nishitani · Religion & Nothingness',
        title:   'Face the void, then keep going.',
        body: [
            'Keiji Nishitani was a philosopher of the Kyoto School who spent his career trying to answer a simple, terrifying question: what do we do once the ground falls away beneath us? Not the metaphorical ground of religious certainty or political order — though those too — but the ontological ground itself. The sense that things have a foundation, a why, a because.',
            'His answer, drawn from Zen Buddhism and Meister Eckhart and a close reading of Nietzsche, is that you keep going — but differently. Nishitani calls the experience of groundlessness "nihility." Most people flee from it, or never confront it at all. But for him, passing through nihility and out the other side into what he calls "śūnyatā" (emptiness) is the only path to genuine selfhood.',
            'Śūnyatā is not despair. It\'s not resignation. It\'s a kind of orientation — a way of being present in the world that doesn\'t require the world to be other than it is. Everything contingent, everything impermanent, everything groundless — and you standing in it, clear-eyed, continuing.',
            'I find this enormously useful for the kind of work I do. Energy policy is full of false foundations — the assumption that markets will solve it, that technology will solve it, that the right government will solve it. None of these grounds hold indefinitely. Nishitani\'s question is: what do you do then? His answer: stop needing the ground. Just work.',
        ],
        landing: 'The promise is to keep working even when the why doesn\'t resolve cleanly. Especially then.',
        icon: '☯'
    },
    fromm: {
        eyebrow: 'Fromm · The Art of Loving',
        title:   'Love as practice, not feeling.',
        body: [
            'Erich Fromm opens The Art of Loving with a provocation: most people think the problem with love is finding the right person. They\'re wrong. The problem is developing the capacity to love — which is a skill, a practice, a discipline, the same as any art form.',
            'The book is short and dense and has the feel of someone saying an obvious thing so clearly that you wonder how you missed it. Love isn\'t a state that happens to you when conditions are right. It\'s an activity. You practice it or you don\'t. You get better at it or you don\'t.',
            'Fromm distinguishes between immature love ("I love you because I need you") and mature love ("I need you because I love you"). The difference is the direction of the dependence. Immature love is extractive; it needs the other to fill something. Mature love is generative; it creates rather than consumes.',
            'What this means in practice: showing up. Paying attention. Not waiting to feel like it. Treating care — for people, for ideas, for craft — as something you choose, repeatedly, even when it\'s not easy.',
        ],
        landing: 'The promise is to choose it. Repeatedly. Even when it would be easier not to.',
        icon: '♡'
    },
    berger: {
        eyebrow: 'Berger · Ways of Seeing',
        title:   'Seeing is political. Look anyway.',
        body: [
            'John Berger\'s Ways of Seeing began as a BBC television series in 1972 and became one of the most widely read art criticism books of the twentieth century. Its central argument is deceptively simple: the way we see things is always conditioned by what we know, what we believe, and what we\'ve been taught to value.',
            'Berger is particularly interested in how images — oil paintings, advertisements, photographs — carry power relations within them. A portrait of a wealthy landowner isn\'t just a record of a face. It\'s an assertion of ownership, of permanence, of a right to be seen. Advertising works the same way, just with different desires being constructed.',
            'The uncomfortable implication is that you can\'t see innocently. Every look is mediated. Every interpretation reflects assumptions you didn\'t choose. And yet Berger doesn\'t conclude that we should stop looking or that all interpretations are equally suspect. He concludes that we should look more carefully — which is harder than it sounds, because it requires knowing what shaped your looking.',
            'In my own work, this translates into a kind of epistemological vigilance. Whose data? Whose categories? What assumptions are baked into the framing of the problem? Looking carefully means asking these questions before you trust what you see.',
        ],
        landing: 'The promise is to keep asking whose looking this is — including my own.',
        icon: '👁'
    }
};

// ── DOM helpers ──

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openModal(el) {
    el.classList.remove('opacity-0', 'pointer-events-none');
    const inner = el.querySelector('[id$="-content"], #story-content');
    if (inner) setTimeout(() => { inner.classList.remove('scale-95'); inner.classList.add('scale-100'); }, 20);
    document.body.style.overflow = 'hidden';
}

function closeModal(el) {
    el.classList.add('opacity-0', 'pointer-events-none');
    const inner = el.querySelector('[id$="-content"], #story-content');
    if (inner) { inner.classList.remove('scale-100'); inner.classList.add('scale-95'); }
    document.body.style.overflow = '';
}

// ── Story modal (life photos) ──

window.openStory = function (src, caption) {
    const modal = document.getElementById('story-modal');
    document.getElementById('modal-img').src = src;
    const cap = document.getElementById('modal-caption-text');
    cap.textContent = caption;
    openModal(modal);
};

window.closeStory = function () {
    closeModal(document.getElementById('story-modal'));
};

// ── Promise modal ──

function openPromise(key) {
    const data = promiseContent[key];
    if (!data) return;
    document.getElementById('promise-modal-eyebrow').textContent = data.eyebrow;
    document.getElementById('promise-modal-title').textContent   = data.title;
    document.getElementById('promise-modal-body').innerHTML      = data.body.map(p => `<p>${escHtml(p)}</p>`).join('');
    document.getElementById('promise-modal-landing').textContent = data.landing;
    openModal(document.getElementById('promise-modal'));
}

// ── Shelf modal ──

function openShelfItem(item, type) {
    const statusLabels = { read: 'finished', reading: 'currently reading', queue: 'on my list' };
    document.getElementById('shelf-modal-type').textContent    = `${type} · ${statusLabels[item.status] || item.status}`;
    document.getElementById('shelf-modal-title').textContent   = item.title;
    document.getElementById('shelf-modal-creator').textContent = item.creator;
    document.getElementById('shelf-modal-review').textContent  = item.review;
    const img = document.getElementById('shelf-modal-img');
    img.src = '';
    img.alt = `Cover of ${escHtml(item.title)}`;
    openModal(document.getElementById('shelf-modal'));
}

// ── Build interests ──

function buildInterests() {
    const grid = document.getElementById('interests-grid');
    const tags  = document.getElementById('interests-tags');
    if (grid) {
        grid.innerHTML = interestsData.map(i => `
            <div class="bg-white rounded-3xl p-7 shadow-sm border border-warm-200 hover:-translate-y-1 transition-transform duration-200">
                <div class="text-3xl mb-4">${i.icon}</div>
                <h3 class="font-heavy text-lg text-warm-900 mb-2">${escHtml(i.title)}</h3>
                <p class="text-warm-600 text-sm leading-relaxed">${escHtml(i.desc)}</p>
            </div>
        `).join('');
    }
    if (tags) {
        tags.innerHTML = interestTags.map(t => `<span class="interest-tag">${escHtml(t)}</span>`).join('');
    }
}

// ── Build work section bars + lists ──

function buildBar(label, pct, accent = 'bg-orange-400') {
    return `
        <div>
            <div class="flex justify-between text-sm mb-1.5">
                <span class="text-warm-700 font-medium">${escHtml(label)}</span>
                <span class="font-mono text-warm-400 text-xs">${pct}%</span>
            </div>
            <div class="h-2 bg-warm-100 rounded-full overflow-hidden">
                <div class="${accent} h-full rounded-full transition-all duration-700" style="width:${pct}%"></div>
            </div>
        </div>`;
}

function buildWork() {
    const skillsEl = document.getElementById('skills-bars');
    const langsEl  = document.getElementById('langs-bars');
    const pubsEl   = document.getElementById('publications-list');
    const volEl    = document.getElementById('volunteer-list');

    if (skillsEl) skillsEl.innerHTML = skillsData.map(s => buildBar(s.label, s.pct)).join('');
    if (langsEl)  langsEl.innerHTML  = langsData.map(l  => buildBar(l.label, l.pct, 'bg-warm-400')).join('');

    if (pubsEl) {
        pubsEl.innerHTML = publicationsData.map(p => `
            <li class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span class="font-mono text-xs text-warm-400 whitespace-nowrap">${escHtml(p.year)}</span>
                <div>
                    <p class="font-semibold text-warm-800 text-sm">${escHtml(p.title)}</p>
                    <p class="text-xs text-warm-400 mt-0.5">${escHtml(p.venue)}</p>
                </div>
            </li>`).join('');
    }

    if (volEl) {
        volEl.innerHTML = volunteerData.map(v => `
            <li class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span class="font-mono text-xs text-warm-400 whitespace-nowrap">${escHtml(v.period)}</span>
                <div>
                    <p class="font-semibold text-warm-800 text-sm">${escHtml(v.title)}</p>
                    <p class="text-xs text-warm-400 mt-0.5">${escHtml(v.org)}</p>
                </div>
            </li>`).join('');
    }
}

// ── Build writing cards ──

function buildWriting() {
    const el = document.getElementById('writing-cards');
    if (!el) return;
    el.innerHTML = writingData.map(w => `
        <a href="${escHtml(w.href)}" class="bg-white rounded-3xl p-7 shadow-sm border border-warm-200 flex flex-col hover:-translate-y-1 transition-transform duration-200">
            <div class="flex items-center gap-2 mb-4">
                <span class="interest-tag text-xs">${escHtml(w.tag)}</span>
                <span class="text-xs font-mono text-warm-400">${escHtml(w.date)}</span>
            </div>
            <h3 class="font-heavy text-lg text-warm-900 mb-3 leading-snug">${escHtml(w.title)}</h3>
            <p class="text-warm-600 text-sm leading-relaxed flex-1">${escHtml(w.excerpt)}</p>
            <div class="mt-5 text-xs font-mono text-warm-400 flex items-center gap-1.5">
                <span>read →</span>
            </div>
        </a>`).join('');
}

// ── Build shelf ──

function buildShelfPanel(panelId, items, type) {
    const el = document.getElementById(panelId);
    if (!el) return;
    el.innerHTML = items.map(item => {
        const statusColor = item.status === 'reading' ? 'bg-orange-100 text-orange-600'
                          : item.status === 'read'    ? 'bg-emerald-100 text-emerald-600'
                          :                             'bg-warm-100 text-warm-500';
        const statusLabel = item.status === 'reading' ? 'Reading' : item.status === 'read' ? 'Read' : 'Queued';
        return `
            <button class="flex-shrink-0 w-40 text-left group" aria-label="View details: ${escHtml(item.title)}" data-shelf-type="${escHtml(type)}" data-shelf-idx="${items.indexOf(item)}">
                <div class="w-40 h-56 rounded-2xl bg-warm-200 mb-3 overflow-hidden flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow cover-placeholder">
                    <i class="fa-solid fa-${type === 'books' ? 'book' : type === 'games' ? 'gamepad' : 'film'} text-3xl text-warm-300" aria-hidden="true"></i>
                </div>
                <span class="inline-block text-xs px-2 py-0.5 rounded-full font-mono mb-1 ${statusColor}">${statusLabel}</span>
                <p class="font-semibold text-warm-900 text-sm leading-tight">${escHtml(item.title)}</p>
                <p class="text-xs text-warm-400 mt-0.5">${escHtml(item.creator)}</p>
            </button>`;
    }).join('');
}

function buildShelf() {
    buildShelfPanel('panel-books',  shelfData.books,  'books');
    buildShelfPanel('panel-games',  shelfData.games,  'games');
    buildShelfPanel('panel-movies', shelfData.movies, 'movies');
}

// ── Shelf tabs ──

function initShelfTabs() {
    document.querySelectorAll('.shelf-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.shelf-tab').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            document.querySelectorAll('.shelf-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(`panel-${tab}`)?.classList.remove('hidden');
        });
    });

    // Shelf item click → modal
    document.getElementById('shelf')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-shelf-type]');
        if (!btn) return;
        const type = btn.dataset.shelfType;
        const idx  = parseInt(btn.dataset.shelfIdx, 10);
        const item = shelfData[type]?.[idx];
        if (item) openShelfItem(item, type);
    });
}

// ── Promise tiles ──

function initPromiseTiles() {
    document.querySelectorAll('.promise-tile').forEach(btn => {
        btn.addEventListener('click', () => openPromise(btn.dataset.promise));
    });
    document.getElementById('promise-modal-close')?.addEventListener('click', () => closeModal(document.getElementById('promise-modal')));
    document.getElementById('promise-modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('promise-modal')) closeModal(document.getElementById('promise-modal'));
    });
}

// ── Story modal (life buttons) ──

function initStoryButtons() {
    document.querySelectorAll('.story-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const src     = btn.dataset.img || '';
            const caption = btn.dataset.caption || '';
            openStory(src, caption);
        });
    });
    document.getElementById('story-modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('story-modal')) closeStory();
    });
}

// ── Shelf modal close ──

function initShelfModal() {
    document.getElementById('shelf-modal-close')?.addEventListener('click', () => closeModal(document.getElementById('shelf-modal')));
    document.getElementById('shelf-modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('shelf-modal')) closeModal(document.getElementById('shelf-modal'));
    });
}

// ── Mobile menu ──

function initMobileMenu() {
    const btn  = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
        const open = !menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        const icon = btn.querySelector('i');
        if (icon) icon.className = open ? 'fa-solid fa-bars text-lg' : 'fa-solid fa-xmark text-lg';
        btn.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        menu.classList.add('hidden');
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-bars text-lg';
    }));
}

// ── Back to top ──

function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        const visible = window.scrollY > 600;
        btn.classList.toggle('opacity-0', !visible);
        btn.classList.toggle('pointer-events-none', !visible);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── Side nav scroll tracking + moon phase ──

function initSideNav() {
    const links    = document.querySelectorAll('.side-nav-link');
    const sections = [...document.querySelectorAll('section[id]')];
    const moon     = document.getElementById('moon-cover');

    // Moon phase based on day of month (0–100% coverage over 30 days)
    if (moon) {
        const day = new Date().getDate();
        moon.style.width = `${Math.round((day / 30) * 100)}%`;
    }

    function onScroll() {
        const scrollY = window.scrollY + window.innerHeight * 0.4;
        let active = sections[0];
        for (const s of sections) {
            if (s.offsetTop <= scrollY) active = s;
        }
        links.forEach(l => {
            const isActive = l.dataset.section === active?.id;
            l.classList.toggle('active', isActive);
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

// ── Audio player ──

function initAudio() {
    const audio    = document.getElementById('audio-player');
    const playBtn  = document.getElementById('audio-play-btn');
    const icon     = document.getElementById('audio-icon');
    const progress = document.getElementById('audio-progress');
    const timeEl   = document.getElementById('audio-time');
    const bar      = document.getElementById('audio-progress-bar');
    if (!audio || !playBtn) return;

    function fmt(s) {
        const m = Math.floor(s / 60);
        const ss = Math.floor(s % 60).toString().padStart(2, '0');
        return `${m}:${ss}`;
    }

    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    });

    audio.addEventListener('play', () => {
        icon.className = 'fa-solid fa-pause text-white text-xs';
    });

    audio.addEventListener('pause', () => {
        icon.className = 'fa-solid fa-play text-white text-xs';
    });

    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progress.style.width = pct + '%';
        timeEl.textContent = fmt(audio.currentTime);
    });

    bar?.addEventListener('click', e => {
        if (!audio.duration) return;
        const rect = bar.getBoundingClientRect();
        const pct  = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
    });
}

// ── Keyboard: close modals on Escape ──

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['story-modal', 'promise-modal', 'shelf-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('pointer-events-none')) closeModal(el);
    });
});

// ── Edit mode (Firebase-gated) ──

function setEditMode(on) {
    editMode = on;
    const toggleBtn = document.getElementById('edit-toggle-btn');
    const saveBtn   = document.getElementById('edit-save-btn');
    const editIcon  = document.getElementById('edit-icon');

    document.querySelectorAll('[data-editable]').forEach(el => {
        el.contentEditable = on ? 'true' : 'false';
        el.classList.toggle('edit-outline', on);
    });

    if (toggleBtn) toggleBtn.setAttribute('aria-pressed', String(on));
    if (editIcon)  editIcon.className = on ? 'fa-solid fa-xmark' : 'fa-solid fa-pencil';
    if (saveBtn)   saveBtn.classList.toggle('hidden', !on);
}

async function saveContent() {
    const data = {};
    document.querySelectorAll('[data-editable]').forEach(el => {
        data[el.dataset.editable] = el.innerHTML;
    });
    try {
        await CONTENT_DOC.set(data, { merge: true });
        const saveBtn = document.getElementById('edit-save-btn');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
            setTimeout(() => { saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>'; }, 2000);
        }
    } catch (err) {
        console.error('Save failed:', err);
        alert('Save failed. Check console for details.');
    }
}

async function loadContent() {
    try {
        const doc = await CONTENT_DOC.get();
        if (!doc.exists) return;
        const data = doc.data();
        document.querySelectorAll('[data-editable]').forEach(el => {
            const key = el.dataset.editable;
            if (data[key] !== undefined) el.innerHTML = data[key];
        });
    } catch (err) {
        console.error('Load content failed:', err);
    }
}

function initEditFab() {
    const fab       = document.getElementById('edit-fab');
    const toggleBtn = document.getElementById('edit-toggle-btn');
    const saveBtn   = document.getElementById('edit-save-btn');
    if (!fab || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => setEditMode(!editMode));
    saveBtn?.addEventListener('click', saveContent);
}

// ── Firebase auth observer ──

auth.onAuthStateChanged(user => {
    const fab = document.getElementById('edit-fab');
    if (!fab) return;
    if (user && user.email === OWNER_EMAIL) {
        fab.classList.remove('hidden');
    } else {
        fab.classList.add('hidden');
        if (editMode) setEditMode(false);
    }
});

// ── DOMContentLoaded ──

document.addEventListener('DOMContentLoaded', () => {
    buildInterests();
    buildWork();
    buildWriting();
    buildShelf();
    initShelfTabs();
    initPromiseTiles();
    initStoryButtons();
    initShelfModal();
    initMobileMenu();
    initBackToTop();
    initSideNav();
    initAudio();
    initEditFab();
    loadContent();
});
