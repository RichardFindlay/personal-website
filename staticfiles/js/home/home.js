// The redesigned homepage: theme toggle and smooth scrolling. The island, the
// camera and the sections join this at later milestones.
(() => {
    const root = document.documentElement;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const systemDark = matchMedia('(prefers-color-scheme: dark)');

    // ── Theme ────────────────────────────────────────────────────────────────
    // The inline script in the head has already set data-theme. A choice made
    // with the toggle is saved; until one is made, the page follows the system.
    const toggle = document.querySelector('.theme-toggle');
    const saved = () => { try { return localStorage.getItem('theme'); } catch (e) { return null; } };

    const applyTheme = (theme) => {
        root.dataset.theme = theme;
        const dark = theme === 'dark';
        toggle.setAttribute('aria-pressed', String(dark));
        toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    };

    applyTheme(root.dataset.theme);

    toggle.addEventListener('click', () => {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('theme', next); } catch (e) {}
        applyTheme(next);
    });

    systemDark.addEventListener('change', (e) => {
        if (!saved()) applyTheme(e.matches ? 'dark' : 'light');
    });

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
