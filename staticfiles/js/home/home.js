// The redesigned homepage: smooth scrolling, and the wind turbine drawing that
// explodes and drills into its assemblies as the page scrolls. Light mode only for now.
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

    // ── The turbine ──────────────────────────────────────────────────────────
    // A live 3D drawing, loaded after first paint so it never holds the page up;
    // it fades in once it has drawn. If it fails the page simply has no drawing.
    const stage = document.getElementById('turbine');
    const turbine = new Promise((resolve) => {
        const load = () => import(stage.dataset.module)
            .then(({ mountTurbine }) => mountTurbine(stage))
            .then((mounted) => {
                requestAnimationFrame(() => stage.classList.add('in'));
                resolve(mounted);
            })
            .catch((error) => { console.warn('turbine:', error); resolve(null); });
        if (document.readyState === 'complete') requestAnimationFrame(load);
        else addEventListener('load', () => requestAnimationFrame(load), { once: true });
    });

    // ── Scroll to drawing ────────────────────────────────────────────────────
    // Each section names the point of the drawing it sits beside (data-p). The
    // drawing reaches that point as the section's text crosses a third of the way
    // down the screen, and runs evenly between neighbours.
    // a section's text, not its box, is what the reader lines up with the drawing
    const anchors = () => [...document.querySelectorAll('main > [data-p]')].map((el) => {
        const text = el.classList.contains('hero') ? null : el.querySelector('.section-label, .section-note') || el;
        return { y: text ? text.getBoundingClientRect().top + scrollY - innerHeight * 0.34 : 0, p: Number(el.dataset.p) };
    });
    let marks = anchors();
    addEventListener('resize', () => { marks = anchors(); });
    const progressAt = (y) => {
        if (y <= marks[0].y) return marks[0].p;
        for (let i = 1; i < marks.length; i++) {
            const a = marks[i - 1], b = marks[i];
            if (y <= b.y) return a.p + (b.p - a.p) * ((y - a.y) / (b.y - a.y || 1));
        }
        return marks[marks.length - 1].p;
    };
    // the title block names the view in focus
    const VIEWS = [[0.1, 'GENERAL ARRANGEMENT', '1:40'], [0.27, 'EXPL0DED VIEW', '1:60'], [0.4, 'DETAIL A, HUB AND PITCH SYSTEM', '1:15'],
        [0.5, 'DETAIL B, MAIN BEARING', '1:12'], [0.62, 'DETAIL C, PLANETARY STAGE', '1:12'], [0.76, 'DETAIL D, GENERAT0R', '1:15'],
        [0.9, 'DETAIL E, YAW SYSTEM', '1:15'], [1.01, 'GENERAL ARRANGEMENT', '1:40']];
    const viewEl = document.querySelector('[data-view]'), scaleEl = document.querySelector('[data-scale]');
    let shown = '';
    const onScroll = () => {
        const p = progressAt(scrollY);
        turbine.then((t) => t && t.setProgress(p));
        const [, view, scale] = VIEWS.find(([until]) => p < until);
        if (view !== shown && viewEl) { shown = view; viewEl.textContent = view; scaleEl.textContent = scale; }
    };
    if (lenis) lenis.on('scroll', onScroll); else addEventListener('scroll', onScroll, { passive: true });
    turbine.then(() => { marks = anchors(); onScroll(); });

    // For scripts/screenshots.mjs: jump straight to a fraction of the page.
    window.homePage = {
        ready: turbine.then(() => new Promise((r) => setTimeout(r, 800))),
        scrollToProgress(p) {
            const y = p * (document.documentElement.scrollHeight - innerHeight);
            if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
            else window.scrollTo(0, y);
        },
    };
})();
