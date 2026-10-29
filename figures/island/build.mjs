// The homepage's island: one tile of the GB power system cut from the ground
// like a diorama, the rock under it on show, as a small 3D scene the page
// draws live with three.js. scene.mjs decides all the geometry from layout.mjs;
// Blender (blender/island.py) meshes it, bakes its soft shadows and exports it;
// gltfpack compresses it. One unit is a metre.
// Run: node figures/island/build.mjs            staticfiles/image/island/island.glb and island.json,
//                                               and preview.html beside this file
//      node figures/island/build.mjs --check    also renders preview.html to check.png
//      --quick                                  a fast, noisier shadow bake while working
// Needs Blender 4.2 (BLENDER=/path/to/blender, else `blender` on the PATH) and
// gltfpack 1.3 (GLTFPACK=/path/to/gltfpack, else npx gltfpack@1.3.0).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { scene } from "./scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const OUT = join(ROOT, "staticfiles/image/island");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

// ── The camera the page uses: a parallel view, 58° round as in the sketch, 30° up
export const CAMERA = { azimuth: 58, elevation: 30, frame: [1440, 900], pad: 44, headroom: 64 };

const run = (cmd, argv, what) => {
  const r = spawnSync(cmd, argv, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", shell: false });
  if (r.status !== 0) {
    console.error(r.stdout?.slice(-3000), r.stderr?.slice(-3000));
    throw new Error(`${what} failed`);
  }
  return r.stdout + "\n" + r.stderr;
};

const S = scene();
if (flag("quick")) S.bakeSamples = 8;
const work = join(tmpdir(), `island-${process.pid}`);
mkdirSync(work, { recursive: true });
const sceneFile = join(work, "scene.json"), raw = join(work, "island-raw.glb");
writeFileSync(sceneFile, JSON.stringify(S));

const t0 = Date.now();
const blender = process.env.BLENDER || "blender";
const log = run(blender, ["-b", "--factory-startup", "--python", join(HERE, "blender/island.py"), "--", sceneFile, raw], "Blender");
if (!log.includes("island.glb written")) { console.error(log.slice(-4000)); throw new Error("Blender wrote no island"); }
console.log(`blender ${((Date.now() - t0) / 1000).toFixed(0)} s`);

mkdirSync(OUT, { recursive: true });
const glb = join(OUT, "island.glb");
// meshopt compression, named nodes and materials kept so the page can find them
const packArgs = ["-i", raw, "-o", glb, "-cc", "-kn", "-km"];
if (process.env.GLTFPACK) run(process.env.GLTFPACK, packArgs, "gltfpack");
else run("npx", ["--yes", "gltfpack@1.3.0", ...packArgs], "gltfpack");
rmSync(work, { recursive: true, force: true });

// ── What the page needs besides the meshes ──────────────────────────────────
const meta = {
  camera: CAMERA, tile: S.tile, depth: S.depth, seaLevel: S.seaLevel,
  instances: S.instances.map((i) => ({ proto: i.proto, at: i.at.map((v) => Math.round(v * 100) / 100), rot: Math.round(i.rot * 1000) / 1000, scale: Math.round(i.scale * 1000) / 1000 })),
  rotors: S.rotors, cars: S.cars, roads: S.roads, roadWidth: S.roadWidth, steam: S.steam, smoke: S.smoke, pixels: S.pixels, spray: S.spray, lines: S.lines, tall: S.tall, bore: S.bore,
};
writeFileSync(join(OUT, "island.json"), JSON.stringify(meta));

// ── Preview: the island alone, as the hero shows it ─────────────────────────
const preview = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Island</title>
<style>html,body{margin:0;height:100%;background:#fff}.island-stage{position:fixed;inset:0}.island-stage canvas{display:block;width:100%;height:100%}</style>
<script type="importmap">{"imports":{"three":"../../staticfiles/js/vendor/three-0.185.1/build/three.module.min.js","three/addons/":"../../staticfiles/js/vendor/three-0.185.1/examples/jsm/"}}</script>
</head><body><div class="island-stage" data-glb="../../staticfiles/image/island/island.glb" data-meta="../../staticfiles/image/island/island.json"></div>
<script type="module">
// ?p=<0..1> shows that point of the scroll; ?still holds the idle motion
const q = new URLSearchParams(location.search);
const stage = document.querySelector(".island-stage");
const { mountIsland } = await import("../../staticfiles/js/home/island.js");
const island = await mountIsland(stage, { still: q.has("still") });
if (q.has("p")) island.setProgress(Number(q.get("p")));
window.island = island;
window.ready = true;
</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview);

const size = statSync(glb).size, meta1 = readFileSync(join(OUT, "island.json"));
console.log(`island.glb ${(size / 1024).toFixed(0)} KB · island.json ${(meta1.length / 1024).toFixed(0)} KB (${(gzipSync(meta1).length / 1024).toFixed(0)} KB gzipped) · ${S.instances.length} instances`);

// ── --check: the preview rendered to a PNG, WebGL in software ───────────────
if (flag("check")) {
  const { createRequire } = await import("node:module");
  const { createServer } = await import("node:http");
  const { extname } = await import("node:path");
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary" };
  const server = createServer((req, res) => {
    const file = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/figures/island/preview.html?still`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(HERE, "check.png") });
  await browser.close();
  server.close();
  console.log("check.png");
}
