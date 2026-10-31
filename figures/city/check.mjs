// Renders figures/city/preview.html at points along the flight, WebGL in software.
// Run: node figures/city/check.mjs <out-dir> [p ...] [--q low|high] [--scale 1]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const quality = option("q", "high"), scale = Number(option("scale", 1));
const [out = "review/city", ...points] = args;
const stops = points.length ? points.map(Number) : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
mkdirSync(resolve(ROOT, out), { recursive: true });

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const server = createServer((req, res) => {
  const file = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
page.on("pageerror", (e) => console.error("page:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/figures/city/preview.html?still&q=${quality}`);
await page.waitForFunction(() => window.ready, null, { timeout: 300000 });
for (const p of stops) {
  await page.evaluate((p) => { window.city.setProgress(p, true); window.city.draw(); }, p);
  const file = join(out, `p${p.toFixed(2)}.png`);
  await page.screenshot({ path: resolve(ROOT, file) });
  console.log(file);
}
await browser.close();
server.close();
