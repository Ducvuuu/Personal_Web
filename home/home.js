document.addEventListener('DOMContentLoaded', function () {

    // ── Dynamic year / age ──────────────────────────────────────────────────
    const birthYear  = 2001;
    const currentYear = new Date().getFullYear();

    const ageEl = document.getElementById('auto-age');
    if (ageEl) ageEl.innerText = currentYear - birthYear;

    const heroYearEl = document.getElementById('current-year');
    if (heroYearEl) heroYearEl.innerText = currentYear;

    // ── Interests grid (Tier 1) ──────────────────────────────────────────────
    const interestsData = [
        { icon: 'fa-chess-knight', title: 'Grand Strategy',              spin: false, desc: 'PLACEHOLDER — HoI4, EU4, Victoria 3. Modeling entire civilizations in granular, obsessive detail. The policy-brain running free with no deliverable due.' },
        { icon: 'fa-earth-asia',   title: 'Geopolitics',                 spin: false, desc: 'PLACEHOLDER — South China Sea, ASEAN power dynamics, Vietnamese foreign policy. The thing read about when supposed to be doing something else.' },
        { icon: 'fa-landmark',     title: 'History & Civilizations',     spin: false, desc: 'PLACEHOLDER — Colonial histories, the long arc of how states form and fracture, Vietnam specifically. History as pattern recognition, not memorization.' },
        { icon: 'fa-scale-balanced', title: 'Political Theory',          spin: false, desc: "PLACEHOLDER — How institutions actually work versus how they're supposed to. The CPV's internal logic. Theory of the state as genuine obsession, not just academic interest." },
        { icon: 'fa-brain',        title: 'Philosophy of Consciousness', spin: false, desc: 'PLACEHOLDER — Kyoto School, existentialism, Jungian archetypes, comparative mythology. What consciousness is doing here and why it keeps asking that question.' },
        { icon: 'fa-arrows-rotate', title: 'Overthinking as a Hobby',   spin: true,  desc: 'PLACEHOLDER — Some people have hobbies. I have spirals. Technically a personality flaw. Practically a full-time research project with no grant funding.' },
        { icon: 'fa-city',         title: 'Southeast Asian Cities',      spin: false, desc: "PLACEHOLDER — How SEA cities actually live, not how they're planned to. The sociology of organized chaos. The human energy that no urban design manual manufactures." },
        { icon: 'fa-gamepad',      title: 'Story-Driven Games',          spin: false, desc: 'PLACEHOLDER — NieR: Automata, Genshin Impact. The feeling-mode counterpart to grand strategy. Games played for what they do to you, not for the systems.' },
        { icon: 'fa-book-open',    title: 'Vietnamese Literature',       spin: false, desc: 'PLACEHOLDER — Thạch Lam, Vietnamese poetry, the specific way Vietnamese writers hold impermanence and place simultaneously. Literary sci-fi as a secondary habit.' },
    ];

    const interestsGrid = document.getElementById('interests-grid');
    if (interestsGrid) {
        interestsGrid.innerHTML = '';
        interestsData.forEach(item => {
            const iconClass = item.spin ? `${item.icon} icon-slow-spin` : item.icon;
            interestsGrid.innerHTML += `
                <div class="bg-warm-50 p-6 rounded-[1.5rem] border border-warm-200 shadow-sm hover:shadow-md transition-shadow group">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-10 h-10 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center text-lg group-hover:bg-orange-100 transition-colors shrink-0">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <h3 class="font-heavy text-lg text-warm-900 leading-tight">${item.title}</h3>
                    </div>
                    <p class="text-warm-700 text-sm leading-relaxed">${item.desc}</p>
                </div>`;
        });
    }

    // ── Interests tag cloud (Tier 2) ────────────────────────────────────────
    const interestsTags = [
        { icon: 'fa-mug-hot',        label: 'matcha every morning' },
        { icon: 'fa-sun',            label: 'golden hour, specifically' },
        { icon: 'fa-taxi',           label: 'taxi windows at night' },
        { icon: 'fa-vr-cardboard',   label: 'Beat Saber at Expert+' },
        { icon: 'fa-box-archive',    label: "archiving things that shouldn't need archiving" },
        { icon: 'fa-chart-line',     label: 'data visualization as craft' },
        { icon: 'fa-person-walking', label: 'the specific liveness of chaotic streets' },
        { icon: 'fa-drum',           label: 'rhythm games' },
        { icon: 'fa-cube',           label: "VR as a room of one's own" },
    ];

    const tagsContainer = document.getElementById('interests-tags');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        interestsTags.forEach(tag => {
            tagsContainer.innerHTML += `
                <span class="interest-tag">
                    <i class="fa-solid ${tag.icon}"></i>
                    ${tag.label}
                </span>`;
        });
    }

    // ── Shelf panels ────────────────────────────────────────────────────────
    const colors    = ['bg-warm-300', 'bg-warm-400', 'bg-warm-500', 'bg-warm-600', 'bg-warm-700'];
    const statusMap = {
        books:  [{ label: 'Finished',      cls: 'bg-emerald-100 text-emerald-700' },
                 { label: 'Reading',       cls: 'bg-orange-100 text-orange-700' },
                 { label: 'Want to read',  cls: 'bg-warm-200 text-warm-600' }],
        games:  [{ label: 'Finished',      cls: 'bg-emerald-100 text-emerald-700' },
                 { label: 'Playing',       cls: 'bg-orange-100 text-orange-700' },
                 { label: 'Dropped',       cls: 'bg-warm-200 text-warm-500 line-through' }],
        movies: [{ label: 'Watched',       cls: 'bg-emerald-100 text-emerald-700' },
                 { label: 'Watching',      cls: 'bg-orange-100 text-orange-700' },
                 { label: 'Want to watch', cls: 'bg-warm-200 text-warm-600' }],
    };
    const icons  = { books: 'fa-book',    games: 'fa-gamepad',  movies: 'fa-film' };
    const aspect = { books: 'aspect-[2/3]', games: 'aspect-square', movies: 'aspect-[2/3]' };

    function buildPanel(type, count) {
        const panel = document.getElementById('panel-' + type);
        if (!panel) return;
        let html = '';
        for (let i = 0; i < count; i++) {
            const color  = colors[i % colors.length];
            const status = statusMap[type][i % statusMap[type].length];
            html += `
                <div class="group cursor-pointer" onclick="openShelfModal('${type}', ${i})">
                    <div class="${aspect[type]} ${color} cover-placeholder rounded-xl overflow-hidden relative flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300">
                        <i class="fa-solid ${icons[type]} text-3xl text-white/60"></i>
                        <span class="absolute bottom-2 left-2 right-2 font-mono text-[8px] text-white/70 text-center uppercase tracking-widest">[ cover ]</span>
                    </div>
                    <p class="ph-inline mt-3 truncate block text-center">[ Title placeholder ]</p>
                    <div class="text-center mt-1"><span class="inline-block font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${status.cls}">${status.label}</span></div>
                </div>`;
        }
        panel.innerHTML = html;
    }

    buildPanel('books', 10);
    buildPanel('games', 10);
    buildPanel('movies', 10);

    window.switchTab = function (type) {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById('panel-' + type).classList.remove('hidden');
        document.querySelectorAll('.shelf-tab').forEach(t => {
            const isActive = t.dataset.tab === type;
            t.classList.toggle('active', isActive);
            t.classList.toggle('text-warm-900', isActive);
            t.classList.toggle('text-warm-700', !isActive);
        });
    };

    // ── Promise data ────────────────────────────────────────────────────────
    const promiseContentMap = {
        nishitani: {
            eyebrow: `<i class="fa-solid fa-circle-notch icon-slow-spin mr-2 opacity-75" aria-hidden="true"></i>[ Nishitani, Religion and Nothingness, 1961 ]`,
            body: `<div class="space-y-6 text-warm-300">
                <p class="text-base leading-[1.9]">Basically just my stance on nihilism, what is the meaning of this life, and how to live in a world that is void of meaning. I think everyone does need to have a firm stance on this, otherwise it's easy to fall into nihilism. For me, I'm more influenced by the Kyoto School. I think they articulate it something like this:</p>
                <blockquote class="quote-kyoto">
                    <p>"The universe has no inherent meaning, but this emptiness is not a void to be feared. It is <em>śūnyatā</em>, the groundless ground from which all things arise and to which they return. The crisis of nihilism comes only when the ego stands apart, demanding meaning from a world that owes it none. The way through is not to conquer the emptiness, nor to assert the self against it, but to pass into it so completely that the boundary between self and void dissolves. When the self empties itself, becomes transparent to its own groundlessness, the things of the world appear again with extraordinary vividness, each exactly what it is, nothing diminished. To become what you are on the near side of nothing: this is not the defeat of meaning, but its quiet recovery, on the other side of the abyss."</p>
                    <span class="attribution"><i class="fa-solid fa-yin-yang" aria-hidden="true"></i>Kyoto School reading of Nishitani</span>
                </blockquote>
                <p class="text-base leading-[1.9]">So weirdly, in the paradoxical way the Buddhists really love :)), it just means the resolution to nihilism, to the lack of meaning, is dissolution? Stop fighting it, stop demanding something that was never there to begin with, and you start seeing reality and existence in its true nature. <em class="italic text-warm-400">Become one with the void???</em> Or as the Buddhists would say, it's the attachment to these worldly matters that is the source of our suffering.</p>
                <div class="pivot">
                    <div class="pivot-line"></div>
                    <span class="pivot-mark"><i class="fa-solid fa-bolt" aria-hidden="true"></i>but here I disagree</span>
                    <div class="pivot-line right"></div>
                </div>
                <p class="text-base leading-[1.9] text-warm-100">But here is where I don't agree with either of them. Fuck them, I don't want to dissolve, I want to be myself?? I <span class="font-medium">want</span> to be attached, because attachment, even when it hurts, isn't a fault or something that needs fixing. It's evidence of how wonderful the world is, and without it, nothing matters. To put it in the mytho phrasing thing:</p>
                <blockquote class="quote-ducanh">
                    <i class="fa-solid fa-heart quote-heart" aria-hidden="true"></i>
                    <p>"Yes, the void is there, the empty universe void of meaning is there, but the answer to it isn't detachment. Mine is: <span class="text-warm-100 font-medium not-italic">let's be more attached, more woundable on purpose.</span> The world they teach you to release your grip on is exactly the world I choose to grip, a particular city, particular people, fleeting moments of connection, closeness that won't ever happen again till the end of Time, particular beauty that will not last, and love. Non-attachment is their answer to impermanence. Mine is the opposite. I think the blossom is beautiful <span class="text-warm-100 font-medium not-italic">because</span> it falls, human love because we die, or will get separated eventually, not in spite of it. So I leave the gate open. I choose to grieve: the beauties of this world, and the despair alike."</p>
                </blockquote>
                <p class="text-base leading-[1.9]">It hurts, more of the time lol :))), suffering, even. But not for its own sake. I'm not chasing the wound. I just won't reach peace by cutting away the things I love, and I'd rather feel all of it than be calm and untouched. Caring isn't a flaw to be refined away. If anything, there should be <span class="text-warm-100 font-medium">more</span> care in this dark universe, because it's the whole point of being a consciousness in a world this full of wonders.</p>
            </div>`,
            landing: `<i class="fa-solid fa-infinity mr-2 text-warm-700 opacity-70" aria-hidden="true"></i>So that's my answer to a universe with no built-in meaning: so what? I'll choose to love it anyway. Forever and always.`,
            icon: `<img src="https://firebasestorage.googleapis.com/v0/b/personal-web-journal.firebasestorage.app/o/Home%20Page%20Assets%2FVoid.jpg?alt=media&token=e7c60445-f18b-42e1-bab6-3674354e0fea" alt="Void. Image for the Nishitani tile" class="w-full h-auto rounded-2xl border border-warm-800 shadow-xl object-cover block">
            <div class="mt-4">
                <p class="font-heavy text-sm text-warm-200 mb-1">Religion and Nothingness</p>
                <p class="font-mono text-[0.62rem] uppercase tracking-widest text-warm-700">Nishitani Keiji · 1961 · Kyoto School</p>
                <hr class="border-t border-warm-800 my-3">
                <p class="text-[0.78rem] text-warm-700 italic leading-relaxed">On the movement from nihilism through nihility to śūnyatā, and why emptiness is not absence, but the condition for encounter.</p>
            </div>`,
        },
        fromm: {
            eyebrow: '[ Fromm — The Art of Loving, 1956 ]',
            body: `<div class="promise-ph-block">[ expanded text placeholder: mature love as standing, not falling. being over having / remaining open despite exhaustion. the "second arrow" concept. Rilke + a tender amor fati reading folded in. ]</div>`,
            landing: '[ this is where "Promise" as a section title earns itself ]',
            icon: `<img src="https://firebasestorage.googleapis.com/v0/b/personal-web-journal.firebasestorage.app/o/Home%20Page%20Assets%2Ffromm.jpg?alt=media&token=2ccce3aa-856b-46c7-b1b2-8a9269cb2b0d" alt="Fromm" class="w-full h-auto rounded-2xl border border-warm-800 shadow-xl object-cover">`,
        },
        berger: {
            eyebrow: '[ Berger — Invitation to Sociology ]',
            body: `<div class="promise-ph-block">[ expanded text placeholder: the curiosity made concrete. archivist material: record-everything impulse, journal FOMO. JSON taxonomies, the folder-numbering script. insider's vantage. ]</div>`,
            landing: '[ the curiosity and the archiving are one motion ]',
            icon: `<img src="https://firebasestorage.googleapis.com/v0/b/personal-web-journal.firebasestorage.app/o/Home%20Page%20Assets%2FDoor.jpg?alt=media&token=48ef43e5-4434-4ed1-ae98-7d29fc5e1d01" alt="Berger" class="w-full h-auto rounded-2xl border border-warm-800 shadow-xl object-cover">`,
        },
    };

    // ── Shelf modal ──────────────────────────────────────────────────────────
    const shelfModal = document.getElementById('shelf-modal');

    window.openShelfModal = function (type, i) {
        const color  = colors[i % colors.length];
        const status = statusMap[type][i % statusMap[type].length];
        const cover  = document.getElementById('shelf-modal-cover');
        cover.className = `w-48 ${type === 'games' ? 'h-48' : 'h-64'} rounded-2xl shadow-2xl border-4 border-warm-50 mb-6 flex items-center justify-center text-white/70 ${color} cover-placeholder`;
        document.getElementById('shelf-modal-icon').className = `fa-solid ${icons[type]} text-4xl`;
        const badge = document.getElementById('shelf-modal-badge');
        badge.innerText  = status.label;
        badge.className  = `font-mono text-xs uppercase tracking-widest px-3 py-1 rounded-full mb-3 ${status.cls}`;
        shelfModal.classList.remove('opacity-0', 'pointer-events-none');
        document.body.style.overflow = 'hidden';
    };

    window.closeShelfModal = function () {
        shelfModal.classList.add('opacity-0', 'pointer-events-none');
        document.body.style.overflow = 'auto';
    };

    shelfModal.addEventListener('click', e => { if (e.target.id === 'shelf-modal') window.closeShelfModal(); });

    // ── Promise modal ────────────────────────────────────────────────────────
    const promiseModal        = document.getElementById('promise-modal');
    const promiseModalContent = document.getElementById('promise-modal-content');
    const promiseEyebrow      = document.getElementById('promise-modal-eyebrow');
    const promiseTextContent  = document.getElementById('promise-modal-text-content');
    const promiseLanding      = document.getElementById('promise-modal-landing');
    const promiseIconSlot     = document.getElementById('promise-modal-icon-slot');

    window.openPromiseModal = function (key) {
        const data = promiseContentMap[key];
        promiseEyebrow.innerHTML        = data.eyebrow;
        promiseTextContent.innerHTML    = data.body;
        promiseLanding.innerHTML        = data.landing;
        promiseIconSlot.innerHTML       = data.icon;
        promiseModal.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            promiseModalContent.classList.remove('scale-95');
            promiseModalContent.classList.add('scale-100');
        }, 50);
        document.body.style.overflow = 'hidden';
    };

    window.closePromiseModal = function () {
        promiseModal.classList.add('opacity-0', 'pointer-events-none');
        promiseModalContent.classList.remove('scale-100');
        promiseModalContent.classList.add('scale-95');
        document.body.style.overflow = 'auto';
    };

    promiseModal.addEventListener('click', e => { if (e.target === promiseModal) window.closePromiseModal(); });

    // ── Chart modal ──────────────────────────────────────────────────────────
    const chartModal   = document.getElementById('chart-modal');
    const chartContent = document.getElementById('chart-content');
    const chartIframe  = document.getElementById('chart-iframe');
    const chartTitle   = document.getElementById('chart-modal-title');

    window.openChart = function (url, title) {
        chartIframe.src    = url;
        chartTitle.innerText = title;
        chartModal.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            chartContent.classList.remove('scale-95');
            chartContent.classList.add('scale-100');
        }, 50);
        document.body.style.overflow = 'hidden';
    };

    window.closeChart = function () {
        chartModal.classList.add('opacity-0', 'pointer-events-none');
        chartContent.classList.remove('scale-100');
        chartContent.classList.add('scale-95');
        document.body.style.overflow = 'auto';
        setTimeout(() => { chartIframe.src = ''; }, 300);
    };

    chartModal.addEventListener('click', e => { if (e.target === chartModal) window.closeChart(); });

    // ── Story modal ──────────────────────────────────────────────────────────
    const storyModal   = document.getElementById('story-modal');
    const modalImg     = document.getElementById('modal-img');
    const modalCaption = document.getElementById('modal-caption');
    const storyContent = document.getElementById('story-content');

    window.openStory = function (src, caption) {
        modalImg.src            = src;
        modalCaption.innerText  = caption;
        storyModal.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            storyContent.classList.remove('scale-95');
            storyContent.classList.add('scale-100');
        }, 50);
        document.body.style.overflow = 'hidden';
    };

    window.closeStory = function () {
        storyModal.classList.add('opacity-0', 'pointer-events-none');
        storyContent.classList.remove('scale-100');
        storyContent.classList.add('scale-95');
        document.body.style.overflow = 'auto';
    };

    storyModal.addEventListener('click', e => { if (e.target === storyModal) window.closeStory(); });

    // ── Global Escape key handler ────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            window.closeStory();
            window.closeShelfModal();
            window.closeChart();
            window.closePromiseModal();
        }
    });

    // ── Scroll interactions ──────────────────────────────────────────────────
    const moonCover = document.getElementById('moon-cover');
    const btt       = document.getElementById('back-to-top');
    const sideNav   = document.getElementById('side-nav');

    window.addEventListener('scroll', () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const pct = scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0;
        if (moonCover) moonCover.style.transform = `translateX(${pct}%)`;

        if (window.scrollY > 450) {
            if (btt) btt.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
            if (sideNav) sideNav.classList.remove('opacity-0', 'pointer-events-none', '-translate-x-10');
        } else {
            if (btt) btt.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            if (sideNav) sideNav.classList.add('opacity-0', 'pointer-events-none', '-translate-x-10');
        }
    });

    // ── Active nav link via IntersectionObserver ─────────────────────────────
    const sections     = document.querySelectorAll('main section[id]');
    const topNavLinks  = document.querySelectorAll('.top-nav-link');
    const sideNavLinks = document.querySelectorAll('.side-nav-link');

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                topNavLinks.forEach(l  => l.classList.remove('active'));
                sideNavLinks.forEach(l => l.classList.remove('active'));
                const topLink  = document.querySelector(`.top-nav-link[href="#${entry.target.id}"]`);
                if (topLink) topLink.classList.add('active');
                const sideLink = document.querySelector(`.side-nav-link[href="#${entry.target.id}"]`);
                if (sideLink) sideLink.classList.add('active');
            }
        });
    }, { rootMargin: '-40% 0px -50% 0px' });

    sections.forEach(s => observer.observe(s));

    // ── Hero audio player ────────────────────────────────────────────────────
    const heroAudio            = document.getElementById('hero-audio');
    const heroPlayBtn          = document.getElementById('hero-play-btn');
    const heroPlayIcon         = document.getElementById('hero-play-icon');
    const heroProgress         = document.getElementById('hero-progress');
    const heroProgressContainer = document.getElementById('hero-progress-container');
    const visBars              = document.querySelectorAll('.vis-bar');

    if (heroAudio && heroPlayBtn) {
        let isPlaying = false;

        window.addEventListener('load', () => {
            heroAudio.play().then(() => {
                isPlaying = true;
                heroPlayIcon.classList.replace('fa-play', 'fa-pause');
                heroPlayIcon.classList.remove('ml-0.5');
                visBars.forEach(b => b.classList.add('playing'));
            }).catch(() => {});
        });

        heroPlayBtn.addEventListener('click', () => {
            if (isPlaying) {
                heroAudio.pause();
                heroPlayIcon.classList.replace('fa-pause', 'fa-play');
                heroPlayIcon.classList.add('ml-0.5');
                visBars.forEach(b => b.classList.remove('playing'));
            } else {
                heroAudio.play();
                heroPlayIcon.classList.replace('fa-play', 'fa-pause');
                heroPlayIcon.classList.remove('ml-0.5');
                visBars.forEach(b => b.classList.add('playing'));
            }
            isPlaying = !isPlaying;
        });

        heroAudio.addEventListener('timeupdate', () => {
            const pct = (heroAudio.currentTime / heroAudio.duration) * 100;
            if (heroProgress) heroProgress.style.width = `${pct}%`;
        });

        heroAudio.addEventListener('ended', () => {
            isPlaying = false;
            heroPlayIcon.classList.replace('fa-pause', 'fa-play');
            heroPlayIcon.classList.add('ml-0.5');
            visBars.forEach(b => b.classList.remove('playing'));
            if (heroProgress) heroProgress.style.width = '0%';
        });

        if (heroProgressContainer) {
            heroProgressContainer.addEventListener('click', e => {
                const rect = heroProgressContainer.getBoundingClientRect();
                heroAudio.currentTime = ((e.clientX - rect.left) / rect.width) * heroAudio.duration;
            });
        }
    }
});
