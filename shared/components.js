(function () {
    const currentYear = new Date().getFullYear();

    // Detect which page we're on by folder name in the path
    const pathname = window.location.pathname;
    const currentSection = pathname.includes('/about') ? 'about'
                        : pathname.includes('/writing') ? 'writing'
                        : 'home';

    const navLinks = [
        { href: '../about/',    label: 'About',   key: 'about' },
        { href: '../home/#work', label: 'Work',   key: 'work' },
        { href: '../writing/',  label: 'Writing', key: 'writing' },
        { href: '../home/#life', label: 'Life',   key: 'life' },
    ];

    function navHTML() {
        const links = navLinks.map(({ href, label, key }) => {
            const active = currentSection === key;
            const cls = active
                ? 'px-4 py-2 rounded-lg bg-warm-200 text-warm-900 transition-colors'
                : 'px-4 py-2 rounded-lg hover:bg-warm-100 transition-colors';
            return `<li><a href="${href}" class="${cls}">${label}</a></li>`;
        }).join('');

        const navClass = 'absolute top-0 left-0 right-0 z-30 flex justify-between items-center p-6 md:px-10 md:py-8';

        return `
        <nav class="${navClass}">
            <a href="../home/" class="bg-white px-5 py-2.5 rounded-xl font-mono font-bold text-warm-800 text-sm shadow-sm border border-warm-200 hover:bg-warm-50 transition-colors cursor-pointer flex items-center gap-2">
                <span class="text-orange-500">~</span><span class="text-warm-400">/</span>home
            </a>
            <ul class="hidden md:flex gap-2 font-medium text-sm text-warm-700 bg-white/80 backdrop-blur-sm px-3 py-2 rounded-xl border border-warm-200 shadow-sm">${links}</ul>
            <button class="md:hidden bg-white px-4 py-2.5 rounded-xl shadow-sm text-warm-900 border border-warm-200">
                <i class="fa-solid fa-bars text-lg"></i>
            </button>
        </nav>`;
    }

    function footerHTML() {
        const i = '../shared/icons/';
        return `
        <section class="bg-warm-900 px-8 py-20 md:px-16 text-center relative overflow-hidden rounded-b-[2rem]">
            <div class="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent"></div>

            <!-- Decorative icons -->
            <img src="${i}moon_stars.webp"   alt="" class="absolute pointer-events-none select-none"            style="top:-40px;left:-30px;width:230px;opacity:0.6;transform:rotate(-18deg);">
            <img src="${i}compass.webp"      alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:16px;left:220px;width:55px;opacity:0.3;transform:rotate(-20deg);">
            <img src="${i}matcha_cup.webp"   alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:8px;left:38%;width:65px;opacity:0.28;transform:rotate(10deg);">
            <img src="${i}moon_stars.webp"   alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:6px;right:36%;width:70px;opacity:0.22;transform:rotate(15deg);">
            <img src="${i}waving_hand.webp"  alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:10px;right:200px;width:55px;opacity:0.28;transform:rotate(-12deg);">
            <img src="${i}open_door.webp"    alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:-30px;right:-20px;width:160px;opacity:0.5;transform:rotate(14deg);">
            <img src="${i}waving_hand.webp"  alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:45%;left:30px;width:80px;opacity:0.35;transform:rotate(-10deg);">
            <img src="${i}dm_bubble.webp"    alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:40%;right:150px;width:115px;opacity:0.55;transform:rotate(-6deg);">
            <img src="${i}phone.webp"        alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:42%;right:30px;width:70px;opacity:0.35;transform:rotate(8deg);">
            <img src="${i}compass.webp"      alt="" class="absolute pointer-events-none select-none hidden md:block" style="top:48%;left:160px;width:50px;opacity:0.28;transform:rotate(18deg);">
            <img src="${i}matcha_cup.webp"   alt="" class="absolute pointer-events-none select-none"            style="bottom:-20px;left:30px;width:150px;opacity:0.6;transform:rotate(-14deg);">
            <img src="${i}waving_hand.webp"  alt="" class="absolute pointer-events-none select-none hidden md:block" style="bottom:24px;left:210px;width:65px;opacity:0.35;transform:rotate(14deg);">
            <img src="${i}dm_bubble.webp"    alt="" class="absolute pointer-events-none select-none hidden md:block" style="bottom:20px;left:40%;width:70px;opacity:0.28;transform:rotate(-8deg);">
            <img src="${i}moon_stars.webp"   alt="" class="absolute pointer-events-none select-none hidden md:block" style="bottom:10px;right:30%;width:65px;opacity:0.25;transform:rotate(12deg);">
            <img src="${i}compass.webp"      alt="" class="absolute pointer-events-none select-none hidden md:block" style="bottom:50px;right:120px;width:70px;opacity:0.4;transform:rotate(22deg);">
            <img src="${i}phone.webp"        alt="" class="absolute pointer-events-none select-none hidden md:block" style="bottom:-10px;right:-10px;width:110px;opacity:0.45;transform:rotate(-20deg);">

            <div class="relative z-10 max-w-2xl mx-auto">
                <h2 class="font-heavy text-4xl text-warm-50 mb-6">The Door's Open</h2>
                <p class="text-warm-300 font-medium text-lg mb-10 leading-relaxed">
                    If something here resonated — a piece of writing, a shared interest, a question about energy policy in Southeast Asia — I'd genuinely like to hear from you. This is a home, after all. Guests are welcome.
                </p>
                <div class="flex justify-center gap-6 mb-12">
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl" aria-label="GitHub"><i class="fa-brands fa-github"></i></a>
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl" aria-label="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl" aria-label="Email"><i class="fa-solid fa-envelope"></i></a>
                </div>
                <a href="#" class="inline-block bg-warm-50 text-warm-900 font-bold px-8 py-3 rounded-full hover:bg-white transition-transform hover:-translate-y-1 shadow-lg">
                    Say hello
                </a>
                <div class="mt-20 pt-8 border-t border-warm-800">
                    <p class="font-mono text-xs text-warm-500">
                        Made with too much matcha and Claude. &middot; Hanoi &rarr; Jakarta &middot; ${currentYear}
                    </p>
                </div>
            </div>
        </section>`;
    }

    document.addEventListener('DOMContentLoaded', function () {
        const navEl = document.getElementById('site-nav');
        if (navEl) navEl.outerHTML = navHTML();

        const footerEl = document.getElementById('site-footer');
        if (footerEl) footerEl.outerHTML = footerHTML();
    });
})();
