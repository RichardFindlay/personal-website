// Renders bake.html (one storm in its own square, written by build.mjs) in
// headless Chrome with WebGL and saves it as fallback.webp: the SVG's cloud when
// a browser has no WebGL. Run build.mjs again afterwards to embed it.
//   node bake.mjs [--colour]   (needs a Node with WebSocket, 22 or newer)
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const suffix = process.argv.includes("--colour") ? "-colour" : "";
const drive = join(homedir(), ".claude/skills/anatomy/scripts/drive.mjs");
// to a file, not a pipe: a pipe loses whatever is unflushed when drive exits
const out = join(tmpdir(), `cyclone-bake-${process.pid}.txt`), fd = openSync(out, "w");
spawnSync(process.execPath, [drive, join(HERE, `bake${suffix}.html`), JSON.stringify([["until", "window.baked", 20000], ["eval", "window.baked"]]), "--width", "700", "--height", "700"], { stdio: ["ignore", fd, "inherit"] });
closeSync(fd);
const text = readFileSync(out, "utf8");
rmSync(out);
const line = text.split("\n").find((l) => l.startsWith("eval: "));
if (!line) throw new Error(`no image from bake${suffix}.html\n${text.slice(0, 2000)}`);
const url = JSON.parse(line.slice(6));
if (!url.startsWith("data:image/png;base64,")) throw new Error(`not a png: ${url.slice(0, 40)}`);
// cwebp packs the soft alpha far tighter than the browser encoder
const png = join(tmpdir(), `cyclone-bake-${process.pid}.png`), webp = join(HERE, `fallback${suffix}.webp`);
writeFileSync(png, Buffer.from(url.slice(22), "base64"));
const enc = spawnSync("cwebp", ["-quiet", "-q", "62", "-alpha_q", "45", "-m", "6", "-sharp_yuv", png, "-o", webp], { stdio: "inherit" });
rmSync(png);
if (enc.status !== 0) throw new Error("cwebp failed");
console.log(`fallback${suffix}.webp`, (readFileSync(webp).length / 1024).toFixed(1), "KB");
