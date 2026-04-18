(function () {
    const currentYear = new Date().getFullYear();

    // Detect which page we're on by folder name in the path
    const pathname = window.location.pathname;
    const currentSection = pathname.includes('/about') ? 'about' : 'home';

    const navLinks = [
        { href: '../about/',         label: 'About',   key: 'about' },
        { href: '../home/#work',     label: 'Work',    key: 'work' },
        { href: '../home/#writing',  label: 'Writing', key: 'writing' },
        { href: '../home/#life',     label: 'Life',    key: 'life' },
    ];

    function navHTML() {
        const links = navLinks.map(({ href, label, key }) => {
            const active = currentSection === key;
            const cls = active
                ? 'px-4 py-2 rounded-lg bg-warm-200 text-warm-900 transition-colors'
                : 'px-4 py-2 rounded-lg hover:bg-warm-100 transition-colors';
            return `<li><a href="${href}" class="${cls}">${label}</a></li>`;
        }).join('');

        return `
        <nav class="flex justify-between items-center z-20 p-6 md:px-10 md:py-8 border-b border-warm-200 bg-white/50">
            <a href="../home/" class="bg-white px-5 py-2.5 rounded-xl font-mono font-bold text-warm-800 text-sm shadow-sm border border-warm-200 hover:bg-warm-50 transition-colors cursor-pointer flex items-center gap-2">
                <span class="text-orange-500">~</span><span class="text-warm-400">/</span>home
            </a>
            <ul class="hidden md:flex gap-2 font-medium text-sm text-warm-700">${links}</ul>
            <button class="md:hidden bg-white px-4 py-2.5 rounded-xl shadow-sm text-warm-900 border border-warm-200">
                <i class="fa-solid fa-bars text-lg"></i>
            </button>
        </nav>`;
    }

    function footerHTML() {
        return `
        <section class="bg-warm-900 px-8 py-20 md:px-16 text-center relative overflow-hidden rounded-b-[2rem]">
            <div class="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent"></div>
            <div class="relative z-10 max-w-2xl mx-auto">
                <h2 class="font-heavy text-4xl text-warm-50 mb-6">The Door's Open</h2>
                <p class="text-warm-300 font-medium text-lg mb-10 leading-relaxed">
                    If something here resonated — a piece of writing, a shared interest, a question about energy policy in Southeast Asia — I'd genuinely like to hear from you. This is a home, after all. Guests are welcome.
                </p>
                <div class="flex justify-center gap-6 mb-12">
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl"><i class="fa-brands fa-github"></i></a>
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl"><i class="fa-brands fa-linkedin"></i></a>
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl"><i class="fa-brands fa-instagram"></i></a>
                    <a href="#" class="text-warm-400 hover:text-white transition-colors text-2xl"><i class="fa-solid fa-envelope"></i></a>
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
