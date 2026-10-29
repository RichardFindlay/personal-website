// Screenshots of the redesigned homepage for review, written to review/<milestone>/.
// Each viewport (1440 x 900 and 390 x 844) in light and dark at scroll progress
// 0, 0.25, 0.5, 0.75 and 1, and each section's card row scrolled halfway once
// the rows exist.
//
// Run the Django dev server first (python manage.py runserver --nostatic, so
// WhiteNoise serves staticfiles/), then:
//   node scripts/screenshots.mjs M0
//     --path /home-preview   the page to shoot (default /home-preview; / once it is live)
//     --base http://127.0.0.1:8000
//     --tablet               also 768 x 1024
//     --reduced              shoot with prefers-reduced-motion: reduce, into <milestone>/reduced/
//     --posts                also the top of each blog post, into <milestone>/posts/, to catch regressions
//     --video                also record the whole scroll at 1440 x 900, both themes, as webm
// Analytics requests are blocked so review runs never count as visits.
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Playwright is usually installed globally, which an ES module import cannot see.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const milestone = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.match(/^--(path|base)$/));
if (!milestone) { console.error("usage: node scripts/screenshots.mjs <milestone> [--path /] [--tablet] [--reduced] [--posts] [--video]"); process.exit(1); }

const BASE = option("base", "http://127.0.0.1:8000");
const PATH = option("path", "/home-preview");
const OUT = join(ROOT, "review", milestone, flag("reduced") ? "reduced" : "");
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844, mobile: true }];
if (flag("tablet")) VIEWPORTS.splice(1, 0, { width: 768, height: 1024, mobile: true });
const THEMES = ["light", "dark"];
const PROGRESS = [0, 0.25, 0.5, 0.75, 1];
const POSTS = [
    "/reinforcement-learning-for-offshore-wind-farm-optimisation-1",
    "/probabilistic-forecasting-of-renewable-generation-and-wholesale-prices-with-quantile-regression-2",
    "/deep-reinforcement-learning-for-grid-scale-lithium-ion-battery-optimisation-3",
];
const SETTLE = 900; // ms for fades (500 to 700 ms) to finish after a jump

const label = (v) => `${v.width}x${v.height}`;
const blockAnalytics = (context) =>
    context.route(/google-analytics\.com|googletagmanager\.com/, (route) => route.abort());

async function newContext(browser, viewport, theme, extra = {}) {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.mobile ? 2 : 1,
        isMobile: !!viewport.mobile,
        hasTouch: !!viewport.mobile,
        colorScheme: theme,
        reducedMotion: flag("reduced") ? "reduce" : "no-preference",
        ...extra,
    });
    await blockAnalytics(context);
    // the page reads its saved theme before it paints
    await context.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch (e) {} }, theme);
    return context;
}

async function load(page) {
    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // later milestones expose a promise that settles once the island is drawn
    await page.evaluate(() => window.homePage?.ready);
    await page.waitForTimeout(SETTLE);
}

const scrollTo = (page, p) => page.evaluate((p) => {
    if (window.homePage?.scrollToProgress) window.homePage.scrollToProgress(p);
    else window.scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight));
}, p);

async function shootHome(browser) {
    mkdirSync(OUT, { recursive: true });
    for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
            const context = await newContext(browser, viewport, theme);
            const page = await context.newPage();
            await load(page);
            for (const p of PROGRESS) {
                await scrollTo(page, p);
                await page.waitForTimeout(SETTLE);
                const file = join(OUT, `${label(viewport)}-${theme}-${p.toFixed(2)}.png`);
                await page.screenshot({ path: file });
                console.log(file.replace(ROOT + "/", ""));
            }
            // each card row scrolled halfway, with its section brought into focus
            const rows = await page.$$eval("[data-row]", (els) => els.map((el) => el.dataset.row));
            for (const row of rows) {
                await page.evaluate((row) => {
                    const el = document.querySelector(`[data-row="${row}"]`);
                    const section = el.closest("section");
                    if (window.homePage?.focusSection) window.homePage.focusSection(section.id);
                    else section.scrollIntoView();
                    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
                }, row);
                await page.waitForTimeout(SETTLE);
                const file = join(OUT, `${label(viewport)}-${theme}-row-${row}.png`);
                await page.screenshot({ path: file });
                console.log(file.replace(ROOT + "/", ""));
            }
            await context.close();
        }
    }
}

async function shootPosts(browser) {
    const dir = join(OUT, "posts");
    mkdirSync(dir, { recursive: true });
    for (const viewport of VIEWPORTS) {
        const context = await newContext(browser, viewport, "light");
        const page = await context.newPage();
        for (const path of POSTS) {
            await page.goto(BASE + path, { waitUntil: "networkidle" });
            await page.waitForTimeout(SETTLE);
            const file = join(dir, `${label(viewport)}-post-${path.split("-").pop()}.png`);
            await page.screenshot({ path: file });
            console.log(file.replace(ROOT + "/", ""));
        }
        await context.close();
    }
}

// The whole page scrolled top to bottom and back at a steady pace, so the
// motion can be judged and not just the frames.
async function recordScroll(browser) {
    const viewport = VIEWPORTS[0];
    for (const theme of THEMES) {
        const dir = join(OUT, `video-${theme}`);
        mkdirSync(dir, { recursive: true });
        const context = await newContext(browser, viewport, theme, { recordVideo: { dir, size: { width: viewport.width, height: viewport.height } } });
        const page = await context.newPage();
        await load(page);
        const steps = 240; // 8 s down, 8 s back up at 30 steps a second
        for (const leg of [[0, 1], [1, 0]]) {
            for (let i = 0; i <= steps; i++) {
                await scrollTo(page, leg[0] + (leg[1] - leg[0]) * (i / steps));
                await page.waitForTimeout(1000 / 30);
            }
            await page.waitForTimeout(800);
        }
        await context.close();
        const [webm] = readdirSync(dir).filter((f) => f.endsWith(".webm"));
        const file = join(OUT, `${label(viewport)}-${theme}-scroll.webm`);
        renameSync(join(dir, webm), file);
        rmSync(dir, { recursive: true });
        console.log(file.replace(ROOT + "/", ""));
    }
}

const browser = await chromium.launch();
try {
    await shootHome(browser);
    if (flag("posts")) await shootPosts(browser);
    if (flag("video")) await recordScroll(browser);
} finally {
    await browser.close();
}
