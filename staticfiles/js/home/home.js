// The redesigned homepage: smooth scrolling and the island. The camera and the
// sections join this at later milestones. Light mode only for now.
(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Smooth scrolling ─────────────────────────────────────────────────────
    // Lenis smooths the wheel; with reduced motion the browser scrolls natively.
    const lenis = !reduceMotion && window.Lenis ? new window.Lenis({ autoRaf: true }) : null;

    const scrollToTarget = (target) => {
        if (lenis) lenis.scrollTo(target, { duration: 1.4 });
        else target.scrollIntoView();
    };

    // In-page links (the name, which leads to AB0UT ME) go through the same scroll.
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const target = document.querySelector(link.hash);
            if (!target) return;
            event.preventDefault();
            scrollToTarget(target);
            history.replaceState(null, '', link.hash);
        });
    });

    // ── The island ───────────────────────────────────────────────────────────
    // Fetched after first paint so it never holds the page up; it fades in once
    // its script has mounted it. If it fails the page simply has no island.
    const stage = document.getElementById('island');
    const island = new Promise((resolve) => {
        const load = () => fetch(stage.dataset.svg)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error('island ' + r.status))))
            .then((svg) => { stage.insertAdjacentHTML('beforeend', svg); return import(stage.dataset.js); })
            .then((module) => {
                const mounted = module.mount(stage);
                requestAnimationFrame(() => stage.classList.add('in'));
                resolve(mounted);
            })
            .catch(() => resolve(null));
        if (document.readyState === 'complete') requestAnimationFrame(load);
        else addEventListener('load', () => requestAnimationFrame(load), { once: true });
    });

    // For scripts/screenshots.mjs: jump straight to a fraction of the page.
    window.homePage = {
        ready: island.then(() => new Promise((r) => setTimeout(r, 800))),
        scrollToProgress(p) {
            const y = p * (document.documentElement.scrollHeight - innerHeight);
            if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
            else window.scrollTo(0, y);
        },
    };
})();
