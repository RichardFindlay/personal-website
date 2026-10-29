// Everything that stands on the island, built with the kit and painted back to
// front: hills, woods, towns, the power stations, wind, solar, the battery, the
// grid and the sea's traffic. Each part is a small function that adds items
// with a depth; the build sorts them. Lights that come on at night carry a
// class (il-win, il-glow, il-beacon, il-led, il-head) for the live script.

export function makeParts({ k, G, W, P, at, flat, path, ribbon, drape, roads, random, makeRotor }) {
  const items = [], ground = [], over = [], hillShade = [];
  const depth = (p) => k.depthOf(p, P);
  const put = (p, svg, bias = 0) => items.push({ key: depth(p) + bias, svg });
  const mat = (name, ...svg) => `<g data-mat="${name}">${svg.join("")}</g>`;
  const solid = (paths, style = {}) => k.solidSvg(paths, style);
  const box = (plan, z, h, style = {}, steps = 2, bevel = 0) => solid(k.slabOf(plan, z, h, P, steps, bevel), style);
  const V = G.viewOf(P), L = G.lightOf(P), KS = G.scaleOf(P);
  const up = [0, 0, 1];
  const R1 = (v) => Math.round(v * 10) / 10;
  const circle = (c, r, cls, extra = "") => `<circle class="${cls}" cx="${R1(c[0])}" cy="${R1(c[1])}" r="${R1(r)}"${extra}/>`;
  const quad = (pts) => path(pts.map(at), true);
  // a rectangle footprint turned to `dir` (a unit floor vector), centred on c
  const turned = ([cx, cy], dir, len, wid) => {
    const [dx, dy] = dir, nx = -dy, ny = dx;
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [cx + (dx * len) / 2 * a + (nx * wid) / 2 * b, cy + (dy * len) / 2 * a + (ny * wid) / 2 * b]);
  };
  // hills carry what stands on them: anything on a hill is drawn after it
  const hillUnder = (x, y) => W.HILLS.find((h) => Math.hypot(x - h.x, y - h.y) < h.r);
  const standKey = (x, y, z) => {
    const h = hillUnder(x, y);
    return h ? Math.max(depth([x, y, z]), depth([h.x, h.y, 0]) + 0.5 + depth([x, y, z]) * 1e-4) : depth([x, y, z]);
  };
  const putOn = (x, y, z, svg, bias = 0) => items.push({ key: standKey(x, y, z) + bias, svg });

  // ── Materials ───────────────────────────────────────────────────────────────
  // The wake card's way: each base colour shades by facing with the white
  // steel's own per-channel ratios, so everything takes the same skylight.
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const css3 = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
  const WHITE = hex("#f2f4f5"), WHITE_SHADES = ["#8592a0", "#a6b1bc", "#c6cfd7", "#dde3e8"].map(hex);
  const scaled = (rgb, f) => rgb.map((v, i) => v * (Array.isArray(f) ? f[i] : f));
  function paint(base, over = {}) {
    const c = hex(base), t = { paper: c, face: c, top: c.map((v) => v + (255 - v) * 0.12), hi: scaled(c, 0.55), mid: scaled(c, 0.68), lo: scaled(c, 0.8), faint: scaled(c, 0.9), dot: scaled(c, 0.45) };
    WHITE_SHADES.forEach((s, n) => (t[`shade-${n}`] = scaled(c, s.map((v, i) => v / WHITE[i]))));
    for (const [name, value] of Object.entries(over)) t[name] = hex(value);
    return Object.entries(t).map(([name, rgb]) => `--anatomy-${name}:${css3(rgb)}`).join(";");
  }
  const MATERIALS = {
    hill: paint("#98ba70", { hi: "#6f9150", mid: "#7fa25c", lo: "#8aad66" }),
    render: paint("#eee8dc"), brick: paint("#b9785a"), stone: paint("#d2c7b3"),
    slate: paint("#66727c", { top: "#7b8791" }), tile: paint("#ad5f40", { top: "#c06f4d" }),
    glass: paint("#a8bfcf", { top: "#c9d8e3" }),
    concrete: paint("#dcd8cf"), hall: paint("#9fb0bd", { top: "#c3cfd8" }), steel: paint("#8b959d"),
    white: paint("#f2f4f5"), safety: paint("#e0b12e", { hi: "#b08414", mid: "#c49a22", lo: "#c49a22" }),
    pv: paint("#2f4566", { top: "#3d5a82", hi: "#1d2c42", mid: "#2a3d59", lo: "#506a8f" }),
    container: paint("#e9ecee"), gravel: paint("#c9c4b8"), red: paint("#c4503f"), dark: paint("#4b545c"),
    car0: paint("#f0f1f2"), car1: paint("#c8473d"), car2: paint("#3f6fa0"), car3: paint("#2f8f83"), car4: paint("#e2b236"), car5: paint("#30363c"),
    boat: paint("#f4f4f2"), lantern: paint("#f3e3a0"),
  };
  const mats = Object.entries(MATERIALS).map(([name, vars]) => `[data-mat="${name}"]{${vars}}`);

  // ── Hills: the fields are draped over them; this is only their light ──────
  // The kit's facing bands from a dome of the hill's own profile, laid over the
  // ground as translucent shade, so the patchwork shows through.
  for (const h of W.HILLS) {
    const F = G.frameOf([h.x, h.y, 0], up, [1, 0, 0], [0, 1, 0]);
    const n = 14, profile = [];
    for (let i = 0; i <= n; i++) {
      const s = (h.h * i) / n, q = Math.sqrt(Math.max(0, 1 - Math.sqrt(s / h.h)));
      profile.push([s, h.r * q, i > 0 && i < n ? 1 : 0]);
    }
    const dome = G.solidOf(profile, F, P, { rims: "none" });
    hillShade.push(dome.shades.map((d, b) => (d ? `<path class="il-hill-shade" data-shade="${b}" d="${d}"/>` : "")).join(""));
  }

  // ── Trees: a canopy ball on a short trunk, its shadow on the ground ─────────
  const shadowOff = [-L[0] * 3.5, -L[1] * 3.5];
  function tree(x, y, r = 4 + random() * 2.5, kind = random() < 0.25 ? "dark" : "mid") {
    const z = W.heightAt(x, y), c = at([x, y, z + 2.5 + r]);
    const s = at([x + shadowOff[0], y + shadowOff[1], z]);
    ground.push(`<ellipse class="il-tree-shadow" cx="${R1(s[0])}" cy="${R1(s[1])}" rx="${R1(r * KS * 1.05)}" ry="${R1(r * KS * 0.55)}"/>`);
    const trunk = path([at([x, y, z]), at([x, y, z + 3])]);
    const hl = [c[0] - r * KS * 0.28, c[1] - r * KS * 0.3];
    putOn(x, y, z, `<g class="il-tree" data-kind="${kind}"><path class="il-trunk" d="${trunk}"/>${circle(c, r * KS, "il-canopy")}${circle(hl, r * KS * 0.55, "il-canopy-lit")}</g>`);
  }
  // woods on the hill behind the town and along the river
  const clear = (x, y, gap = 6) => W.onLand(x + 12, y) && W.fromRiver(x, y) > gap &&
    Object.entries(roads).every(([name, line]) => line.every(([px, py]) => Math.hypot(px - x, py - y) > W.ROAD_WIDTH[name] / 2 + gap)) &&
    Object.values(W.SITES).every((s) => x < s.x - 4 || x > s.x + s.w + 4 || y < s.y - 4 || y > s.y + s.d + 4);
  const wood = (cx, cy, rad, count) => {
    for (let n = 0, tries = 0; n < count && tries < count * 8; tries++) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
      if (!clear(x, y, 5)) continue;
      tree(x, y); n++;
    }
  };
  wood(84, 296, 62, 46);
  wood(470, 58, 44, 16);
  wood(560, 600, 34, 12);
  // trees along the river banks
  for (let i = 4; i < W.RIVER.length - 4; i += 3) {
    const [x, y] = W.RIVER[i], [x2, y2] = W.RIVER[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
    for (const side of [-1, 1]) {
      if (random() < 0.45) continue;
      const off = W.riverWidth(i / W.RIVER.length) / 2 + 7 + random() * 6;
      const tx = x - (dy / l) * off * side, ty = y + (dx / l) * off * side;
      if (clear(tx, ty, 4)) tree(tx, ty, 3.5 + random() * 2);
    }
  }

  // ── Buildings ───────────────────────────────────────────────────────────────
  // A house: walls, a gable roof along its long side, and windows that light up.
  const houses = [];
  function house(cx, cy, along, { w = 8 + random() * 3, d = 6.5 + random() * 1.5, h = 5.2 + random() * 1.2, walls = random() < 0.55 ? "render" : "brick", roof = random() < 0.5 ? "slate" : "tile" } = {}) {
    const z = W.heightAt(cx, cy);
    const plan = along === "x" ? { x: cx - w / 2, y: cy - d / 2, w, d, r: 0 } : { x: cx - d / 2, y: cy - w / 2, w: d, d: w, r: 0 };
    const rise = d * 0.42;
    const F = along === "x"
      ? G.frameOf([plan.x - 0.4, cy, z + h], [1, 0, 0], [0, 1, 0], up)
      : G.frameOf([cx, plan.y - 0.4, z + h], [0, 1, 0], [-1, 0, 0], up);
    const len = (along === "x" ? plan.w : plan.d) + 0.8;
    const roofPaths = G.prismOf(F, [[-d / 2 - 0.5, -0.2], [d / 2 + 0.5, -0.2], [0, rise]], 0, len, P);
    // two windows on each face that looks at the viewer: the south and the east
    const wins = [];
    const zw0 = z + h * 0.45, zw1 = z + h * 0.72;
    for (const f of [0.28, 0.72]) {
      const xs = plan.x + plan.w * f, ys = plan.y + plan.d * f;
      wins.push(quad([[xs - 0.7, plan.y + plan.d + 0.02, zw0], [xs + 0.7, plan.y + plan.d + 0.02, zw0], [xs + 0.7, plan.y + plan.d + 0.02, zw1], [xs - 0.7, plan.y + plan.d + 0.02, zw1]]));
      wins.push(quad([[plan.x + plan.w + 0.02, ys - 0.7, zw0], [plan.x + plan.w + 0.02, ys + 0.7, zw0], [plan.x + plan.w + 0.02, ys + 0.7, zw1], [plan.x + plan.w + 0.02, ys - 0.7, zw1]]));
    }
    houses.push({ x: cx, y: cy, r: Math.max(w, d) / 2 + 1.5 });
    putOn(cx, cy, z, mat(walls, box(plan, z, h, { tone: "mid" })) + `<path class="il-win" d="${wins.join("")}"/>` + mat(roof, solid(roofPaths, { tone: "mid" })));
  }
  const freeFor = (x, y, r) => houses.every((h) => Math.hypot(h.x - x, h.y - y) > h.r + r) && clear(x, y, r - 2);
  // houses either side of a road, gables along it
  function street(line, from, to, gap = 13, set = 0.5) {
    for (let i = from; i < Math.min(to, line.length - 2); i += Math.max(1, Math.round(gap / 5))) {
      const [x, y] = line[i], [x2, y2] = line[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
      const along = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      for (const side of [-1, 1]) {
        if (random() > set + 0.35) continue;
        const off = 12 + random() * 3;
        const hx = x - (dy / l) * off * side, hy = y + (dx / l) * off * side;
        if (freeFor(hx, hy, 6)) house(hx, hy, along);
      }
    }
  }
  // the town: streets along the A road, the loop and the north road's first stretch
  street(roads.main, 26, 64, 12, 0.6);
  street(roads.loop, 0, roads.loop.length, 12, 0.65);
  street(roads.north, 0, 30, 13, 0.55);
  street(roads.south, 0, 14, 14, 0.5);
  // back streets: a short grid inside the loop
  for (const [x0, y0] of [[300, 552], [334, 556], [368, 560], [312, 588], [352, 594], [392, 560], [396, 532]]) {
    if (freeFor(x0, y0, 7)) house(x0, y0, random() < 0.5 ? "x" : "y");
  }
  // the village round its green
  street(roads.north, 40, roads.north.length, 12, 0.7);
  for (const [x0, y0] of [[96, 118], [118, 140], [150, 118], [104, 84], [178, 112], [80, 150]]) if (freeFor(x0, y0, 6)) house(x0, y0, random() < 0.5 ? "x" : "y");

  // Flats and offices in the town centre: storeys of windows in rows.
  function block(x, y, w, d, storeys, walls = "stone", roof = "concrete") {
    const z = 0, h = storeys * 3.2;
    const plan = { x, y, w, d, r: 0 };
    const rows = [];
    for (let s = 0; s < storeys; s++) {
      const z0 = z + s * 3.2 + 1.1, z1 = z0 + 1.3;
      for (let u = 2; u < w - 1; u += 3) rows.push(quad([[x + u, y + d + 0.02, z0], [x + u + 1.6, y + d + 0.02, z0], [x + u + 1.6, y + d + 0.02, z1], [x + u, y + d + 0.02, z1]]));
      for (let u = 2; u < d - 1; u += 3) rows.push(quad([[x + w + 0.02, y + u, z0], [x + w + 0.02, y + u + 1.6, z0], [x + w + 0.02, y + u + 1.6, z1], [x + w + 0.02, y + u, z1]]));
    }
    const parapet = k.sideSeam(plan, h - 0.8, P, 2);
    houses.push({ x: x + w / 2, y: y + d / 2, r: Math.max(w, d) / 2 + 2 });
    put([x + w / 2, y + d / 2, 0], mat(walls, box(plan, z, h, { tone: "mid", inner: k.lineSvg(parapet, { tone: "faint" }) })) + `<path class="il-win" d="${rows.join("")}"/>` +
      mat(roof, box({ x: x + w * 0.3, y: y + d * 0.3, w: w * 0.3, d: d * 0.3, r: 0 }, h, 1.6, { tone: "lo" })));
  }
  block(318, 478, 20, 14, 5);
  block(346, 470, 16, 12, 4, "glass");
  block(372, 476, 14, 18, 6, "glass", "steel");
  block(296, 500, 14, 10, 3, "brick");

  // The church: a tower and its spire.
  function church(x, y, scale = 1) {
    const nave = { x: x - 14 * scale, y: y - 4 * scale, w: 16 * scale, d: 8 * scale, r: 0 };
    const F = G.frameOf([nave.x, y, 7 * scale], [1, 0, 0], [0, 1, 0], up);
    const roof = G.prismOf(F, [[-4.5 * scale, -0.2], [4.5 * scale, -0.2], [0, 4.5 * scale]], 0, nave.w, P);
    const tower = { x: x + 2 * scale, y: y - 3 * scale, w: 6 * scale, d: 6 * scale, r: 0 };
    const spire = G.solidOf([[0, 3.6 * scale], [13 * scale, 0]], G.frameOf([x + 5 * scale, y, 18 * scale], up, [1, 0, 0], [0, 1, 0]), P, { steps: 4 });
    houses.push({ x, y, r: 18 * scale });
    put([x - 6 * scale, y, 0], mat("stone", box(nave, 0, 7 * scale, { tone: "mid" })) + mat("slate", solid(roof, { tone: "mid" })));
    put([x + 5 * scale, y, 0], mat("stone", box(tower, 0, 18 * scale, { tone: "mid" })) + mat("slate", solid(spire, { tone: "mid" })), 0.2);
  }
  church(286, 452);
  church(132, 116, 0.8);

  // the supermarket, solar on its roof
  {
    const plan = { x: 392, y: 600, w: 34, d: 22, r: 0 };
    houses.push({ x: plan.x + 17, y: plan.y + 11, r: 22 });
    ground.push(`<path class="il-carpark" d="${quad([[plan.x - 4, plan.y + plan.d, 0], [plan.x + plan.w + 4, plan.y + plan.d, 0], [plan.x + plan.w + 4, plan.y + plan.d + 16, 0], [plan.x - 4, plan.y + plan.d + 16, 0]])}"/>`);
    const panels = [];
    for (let u = 3; u < plan.w - 3; u += 4) panels.push(quad([[plan.x + u, plan.y + 3, 7.05], [plan.x + u + 2.6, plan.y + 3, 7.05], [plan.x + u + 2.6, plan.y + plan.d - 3, 7.05], [plan.x + u, plan.y + plan.d - 3, 7.05]]));
    put([plan.x + 17, plan.y + 11, 0], mat("hall", box(plan, 0, 7, { tone: "mid" })) + `<path class="il-pv-flat" d="${panels.join("")}"/>`);
  }

  // ── Ground works: site pads, the pitch, sheep ───────────────────────────────
  const pad = (s, cls = "il-pad", inset = 0) => ground.push(`<path class="${cls}" d="${quad([[s.x + inset, s.y + inset, 0], [s.x + s.w - inset, s.y + inset, 0], [s.x + s.w - inset, s.y + s.d - inset, 0], [s.x + inset, s.y + s.d - inset, 0]])}"/>`);
  for (const name of ["nuclear", "gas", "geothermal", "battery", "converter", "substation"]) pad(W.SITES[name]);
  pad(W.SITES.solar, "il-solar-ground");
  // a football pitch by the school
  {
    const p = { x: 452, y: 546, w: 40, d: 26 };
    pad(p, "il-pitch");
    const lines = path([[p.x + 1, p.y + 1], [p.x + p.w - 1, p.y + 1], [p.x + p.w - 1, p.y + p.d - 1], [p.x + 1, p.y + p.d - 1]].map(([x, y]) => at([x, y, 0])), true) +
      path([at([p.x + p.w / 2, p.y + 1, 0]), at([p.x + p.w / 2, p.y + p.d - 1, 0])]) + k.ring(p.x + p.w / 2, p.y + p.d / 2, 4, 0, P, 20);
    ground.push(`<path class="il-pitch-line" d="${lines}"/>`);
  }
  // sheep in the pastures west of the river
  for (let n = 0; n < 34; n++) {
    const fx = 30 + random() * 160, fy = 400 + random() * 240;
    if (!clear(fx, fy, 3)) continue;
    const c = at([fx, fy, W.heightAt(fx, fy) + 0.6]);
    ground.push(circle(c, 0.75, "il-sheep"));
  }

  // ── Cars: electric, on the left of the road ─────────────────────────────────
  const CAR_COUNT = { main: 7, north: 3, station: 3, loop: 3, south: 1 };
  const cars = [];
  for (const [name, count] of Object.entries(CAR_COUNT)) {
    const line = roads[name];
    for (let n = 0; n < count; n++) {
      const i = Math.floor(((n + 0.3 + random() * 0.4) / count) * (line.length - 2));
      const forward = random() < 0.5;
      const [x, y] = line[i], [x2, y2] = line[i + 1], l = Math.hypot(x2 - x, y2 - y) || 1;
      const dir = forward ? [(x2 - x) / l, (y2 - y) / l] : [(x - x2) / l, (y - y2) / l];
      const lane = W.ROAD_WIDTH[name] / 4;
      const cx = x - dir[1] * -lane, cy = y + dir[0] * -lane; // keep left
      cars.push({ road: name, i, forward, x: cx, y: cy, dir, paint: `car${(cars.length * 7) % 6}` });
    }
  }
  for (const c of cars) {
    const z = W.heightAt(c.x, c.y);
    const body = k.extrude(turned([c.x, c.y], c.dir, 4.4, 1.9), z + 0.3, 1.0, P);
    const cabin = k.extrude(turned([c.x - c.dir[0] * 0.3, c.y - c.dir[1] * 0.3], c.dir, 2.4, 1.7), z + 1.3, 0.6, P);
    const lamps = [-0.6, 0.6].map((s) => at([c.x + c.dir[0] * 2.25 - c.dir[1] * s, c.y + c.dir[1] * 2.25 + c.dir[0] * s, z + 0.8]));
    ground.push(`<g class="il-car">${mat(c.paint, solid(body, { tone: "mid", crease: "none" }))}${mat("glass", solid(cabin, { tone: "mid", crease: "none" }))}${lamps.map((p) => circle(p, 0.5, "il-head")).join("")}</g>`);
  }

  // ── Wind turbines: the wake card's rotor, in the island's parallel view ─────
  const ctx = { P, iso: k.iso, pathOf: k.pathOf, V, L, BANDS: [0, 0.2, 0.42, 0.62] };
  const AX = W.WIND_FROM; // the rotor's axis points into the wind
  const SIDE = [-AX[1], AX[0], 0];
  function turbine(x, y, { base = W.heightAt(x, y), hub = 70, R = 40, tower = [2.4, 1.4], offshore = false, phase = random() * Math.PI * 2 } = {}) {
    const out = [];
    const top = base + hub - 2;
    if (offshore) {
      // monopile and the yellow transition piece, foam at the waterline
      out.push(`<path class="il-foam" d="${k.ring(x, y, 5, W.SEA_LEVEL, P, 24)}"/>`);
      out.push(mat("safety", solid(G.solidOf([[W.SEA_LEVEL - 1, 3.4], [base, 3.4]], G.frameOf([x, y, 0], up, [1, 0, 0], [0, 1, 0]), P, { steps: 20 }), { tone: "mid" })));
      out.push(mat("safety", box({ x: x - 6, y: y - 6, w: 12, d: 12, r: 6 }, base, 0.8, { tone: "mid" }, 6)));
    }
    out.push(mat("white", solid(G.solidOf([[0, tower[0]], [top - base, tower[1]]], G.frameOf([x, y, base], up, [1, 0, 0], [0, 1, 0]), P, { steps: 14 }), { tone: "mid" })));
    // the nacelle, a box along the axis
    const NF = G.frameOf([x - AX[0] * 4, y - AX[1] * 4, top + 2], AX, SIDE, up);
    out.push(mat("white", solid(G.prismOf(NF, [[-1.8, -1.8], [1.8, -1.8], [1.8, 1.6], [-1.8, 1.6]], 0, 10, P), { tone: "mid" })));
    const hubAt = [x + AX[0] * 6.5, y + AX[1] * 6.5, top + 2];
    const spec = { hub: hubAt, axis: AX, R, rootR: 1.6, span: R - 1.6, collar: null, sections: 5, arc: 5, bisect: 5, girth: R / 60 };
    const blades = makeRotor(spec, ctx).pose(phase);
    const bladeSvg = (b) => (b ? solid({ ...b.blade, crease: "" }, { tone: "mid" }) : "");
    out.push(`<g class="il-rotor" data-hub="${hubAt.map(R1).join(",")}" data-r="${R}" data-phase="${phase.toFixed(3)}">${mat("white", blades.filter((b) => !b.toward).map(bladeSvg).join(""))}${mat("white", solid(G.sphereOf(hubAt, 1.9, P, { steps: 16 }), { tone: "mid" }))}${mat("white", blades.filter((b) => b.toward).map(bladeSvg).join(""))}</g>`);
    out.push(circle(at([x - AX[0] * 7, y - AX[1] * 7, top + 4]), 0.9, "il-beacon"));
    putOn(x, y, base, `<g class="il-turbine">${out.join("")}</g>`);
  }
  for (const [x, y] of W.ONSHORE) turbine(x, y);
  for (const [x, y] of W.OFFSHORE) turbine(x, y, { base: 16, hub: 104, R: 56, tower: [3.2, 2.0], offshore: true });

  // ── The nuclear station: two cooling towers, the reactor, the turbine hall ──
  {
    // a natural-draught tower: a hyperboloid, throat high up, open at the top
    const tower = (x, y) => {
      const rt = 17, st = 72, c = 58.4, H = 96;
      const radius = (s) => rt * Math.sqrt(1 + ((s - st) / c) ** 2);
      const slope = (s) => (rt * ((s - st) / (c * c))) / Math.sqrt(1 + ((s - st) / c) ** 2);
      const profile = Array.from({ length: 25 }, (_, i) => { const s = (H * i) / 24; return [s, radius(s), i && i < 24 ? 1 : 0]; });
      const F = G.frameOf([x, y, 0], up, [1, 0, 0], [0, 1, 0]);
      const body = G.solidOf(profile, F, P, { smooth: { slope, radius } });
      const legs = G.arcOf(F, 5, radius(5), P, { slope: slope(5) });
      const mouth = G.circleOf(F, H, radius(H) - 0.6, P);
      put([x, y, 0], mat("concrete", solid(body, { tone: "mid", inner: k.lineSvg(legs, { tone: "lo" }) })) + `<path class="il-tower-mouth" d="${mouth}"/>`);
      return [x, y, H];
    };
    const tops = [tower(798, 70), tower(870, 58)];
    // the reactor building: a drum with a dome
    const RF = G.frameOf([812, 148, 0], up, [1, 0, 0], [0, 1, 0]);
    const dome = [[0, 18], [30, 18], [30.01, 18, 1], [33, 17.2, 1], [36, 15.2, 1], [39, 11.4, 1], [41, 6.6, 1], [42, 0]];
    put([812, 148, 0], mat("concrete", solid(G.solidOf(dome, RF, P), { tone: "mid", inner: k.lineSvg(G.arcOf(RF, 30, 18, P), { tone: "faint" }) })));
    // the turbine hall, its roof lights, and the glow of its doors at night
    const hall = { x: 838, y: 126, w: 74, d: 34, r: 0 };
    const ridge = G.prismOf(G.frameOf([hall.x, hall.y + hall.d / 2, 24], [1, 0, 0], [0, 1, 0], up), [[-hall.d / 2, 0], [hall.d / 2, 0], [0, 3]], 0, hall.w, P);
    const doors = [0.2, 0.5, 0.8].map((f) => quad([[hall.x + hall.w * f - 3, hall.y + hall.d + 0.05, 0], [hall.x + hall.w * f + 3, hall.y + hall.d + 0.05, 0], [hall.x + hall.w * f + 3, hall.y + hall.d + 0.05, 7], [hall.x + hall.w * f - 3, hall.y + hall.d + 0.05, 7]])).join("");
    const seams = [8, 16].map((z) => k.sideSeam(hall, z, P, 2)).join("");
    put([hall.x + hall.w / 2, hall.y + hall.d / 2, 0], mat("hall", box(hall, 0, 24, { tone: "mid", inner: k.lineSvg(seams, { tone: "faint" }) }), solid(ridge, { tone: "mid" })) + `<path class="il-glow" d="${doors}"/>`);
    // offices and the switchyard
    put([780, 170, 0], mat("render", box({ x: 768, y: 164, w: 22, d: 14, r: 0 }, 0, 9, { tone: "mid" })));
    for (const [tx, ty] of [[846, 176], [862, 176], [878, 176]]) put([tx, ty, 0], mat("dark", box({ x: tx - 4, y: ty - 3, w: 8, d: 6, r: 0.5 }, 0, 5, { tone: "mid" }, 3)));
    // steam over the towers
    for (const [x, y, z] of tops) {
      const c = at([x, y, z + 14]);
      over.push(`<g class="il-plume">${[[0, 0, 15], [-12, -8, 11], [12, -14, 12], [2, -24, 13], [20, -30, 9]].map(([dx, dy, r]) => circle([c[0] + dx, c[1] + dy], r, "il-steam")).join("")}</g>`);
    }
  }

  // ── The gas station: a turbine hall, two boilers and their stacks ──────────
  {
    const s = W.SITES.gas;
    const hall = { x: s.x + 6, y: s.y + 28, w: 46, d: 32, r: 0 };
    put([hall.x + 23, hall.y + 16, 0], mat("hall", box(hall, 0, 18, { tone: "mid", inner: k.lineSvg(k.sideSeam(hall, 9, P, 2), { tone: "faint" }) })));
    for (const y of [s.y + 12, s.y + 50]) {
      const hrsg = { x: s.x + 58, y, w: 22, d: 16, r: 0 };
      put([hrsg.x + 11, hrsg.y + 8, 0], mat("steel", box(hrsg, 0, 30, { tone: "mid", inner: k.lineSvg([10, 20].map((z) => k.sideSeam(hrsg, z, P, 2)).join(""), { tone: "faint" }) })));
      const sx = s.x + 87, sy = y + 8;
      const F = G.frameOf([sx, sy, 0], up, [1, 0, 0], [0, 1, 0]);
      put([sx, sy, 0], mat("concrete", solid(G.solidOf([[0, 3.6], [64, 3.0]], F, P, { steps: 20 }), { tone: "mid", inner: k.lineSvg(G.arcOf(F, 58, 3.05, P), { tone: "lo" }) })) +
        circle(at([sx, sy, 64.3]), 2.6, "il-glow il-stack-glow"), 0.3);
    }
    // the gas reception yard: pipes on racks
    put([s.x + 20, s.y + 72, 0], mat("safety", box({ x: s.x + 8, y: s.y + 68, w: 30, d: 3, r: 1.5 }, 1, 1.4, { tone: "mid" }, 4)));
  }

  // ── Geothermal: the well on the cut face, the plant behind it ──────────────
  {
    const s = W.SITES.geothermal;
    const hall = { x: s.x + 50, y: s.y + 10, w: 40, d: 24, r: 0 };
    put([hall.x + 20, hall.y + 12, 0], mat("hall", box(hall, 0, 12, { tone: "mid" })) + `<path class="il-glow" d="${quad([[hall.x + 8, hall.y + hall.d + 0.05, 0], [hall.x + 14, hall.y + hall.d + 0.05, 0], [hall.x + 14, hall.y + hall.d + 0.05, 5], [hall.x + 8, hall.y + hall.d + 0.05, 5]])}"/>`);
    // air-cooled condenser: a deck of fans
    const deck = { x: s.x + 8, y: s.y + 8, w: 34, d: 18, r: 0 };
    const fans = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) fans.push(k.ring(deck.x + 4.5 + i * 8.3, deck.y + 4.5 + j * 9, 3.4, 8, P, 20));
    put([deck.x + 17, deck.y + 9, 0], mat("steel", box(deck, 0, 8, { tone: "mid" })) + `<path class="il-fan" d="${fans.join("")}"/>`);
    // the wellhead at the very edge, over the bore in the face
    const wx = 120, wy = 752;
    put([wx, wy, 0], mat("safety", box({ x: wx - 4, y: wy - 4, w: 8, d: 6, r: 0.5 }, 0, 1, { tone: "mid" }, 3)) +
      mat("steel", solid(G.solidOf([[0, 1.2], [6, 1.2], [6, 1.8], [7.2, 1.8], [7.2, 0]], G.frameOf([wx, wy - 1, 1], up, [1, 0, 0], [0, 1, 0]), P, { steps: 16 }), { tone: "mid" })));
    // the steam pipe from the well to the plant, on low supports
    const pipe = [[wx, wy - 1, 6], [wx, s.y + 46, 6], [hall.x + 4, s.y + 46, 6]];
    put([wx, s.y + 46, 0], `<path class="il-pipe" d="${path(pipe.map(at))}"/>`);
    // the bore, down the face to the hot granite, its fractures and their heat
    const face = W.TILE.y + W.TILE.d;
    const casing = [-0.9, 0.9].map((o) => path([at([wx + o, face, 0]), at([wx + o, face, -128])])).join("");
    const cracks = [];
    const crack = W.seeded(3);
    for (let n = 0; n < 9; n++) {
      let x = wx, z = -118 - crack() * 16;
      const pts = [at([x, face, z])];
      const dirn = n % 2 ? 1 : -1;
      for (let m = 0; m < 4; m++) { x += dirn * (4 + crack() * 7); z += (crack() - 0.5) * 6; pts.push(at([x, face, z])); }
      cracks.push(path(pts));
    }
    const heat = at([wx, face, -130]);
    ground.push(`<g class="il-bore"><ellipse class="il-heat" cx="${R1(heat[0])}" cy="${R1(heat[1])}" rx="${R1(46 * KS)}" ry="${R1(20 * KS)}"/><path class="il-crack" d="${cracks.join("")}"/><path class="il-casing" d="${casing}"/></g>`);
  }

  // ── Solar: tilted tables in rows facing south, on their posts ──────────────
  {
    const s = W.SITES.solar;
    const tilt = (25 * Math.PI) / 180, depthP = 4.4, rise = depthP * Math.sin(tilt), run = depthP * Math.cos(tilt);
    for (let y0 = s.y + 6; y0 + run < s.y + s.d - 4; y0 += 9.5) {
      for (let x0 = s.x + 5; x0 + 18 < s.x + s.w - 3; x0 += 21) {
        const F = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], up);
        const poly = [[y0, 0.9 + rise], [y0 + run, 0.9], [y0 + run + 0.12, 0.98], [y0 + 0.12, 0.98 + rise]];
        const table = G.prismOf(F, poly, x0, x0 + 18, P);
        const cells = [0.33, 0.66].map((f) => path([at([x0, y0 + run * f, 0.9 + rise * (1 - f) + 0.08]), at([x0 + 18, y0 + run * f, 0.9 + rise * (1 - f) + 0.08])])).join("");
        put([x0 + 9, y0 + run / 2, 0], mat("pv", solid(table, { tone: "mid", inner: k.lineSvg(cells, { tone: "lo" }) })));
      }
    }
    // the fence
    const fence = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.d], [s.x, s.y + s.d]];
    ground.push(`<path class="il-fence" d="${path(fence.map(([x, y]) => at([x, y, 1.8])), true)}"/>`);
  }

  // ── The battery: containers in rows, their charge lamps, the transformer ───
  {
    const s = W.SITES.battery;
    for (let row = 0; row < 2; row++) for (let n = 0; n < 4; n++) {
      const x = s.x + 4 + n * 14.5, y = s.y + 6 + row * 18;
      const c = { x, y, w: 12, d: 2.8, r: 0 };
      const doors = [3, 6, 9].map((u) => path([at([x + u, y + 2.82, 0.2]), at([x + u, y + 2.82, 2.7])])).join("");
      put([x + 6, y + 1.4, 0], mat("container", box(c, 0, 2.9, { tone: "mid", inner: k.lineSvg(doors, { tone: "faint" }) })) + circle(at([x + 11, y + 2.85, 2.3]), 0.55, "il-led"));
    }
    put([s.x + 56, s.y + 40, 0], mat("dark", box({ x: s.x + 52, y: s.y + 36, w: 8, d: 7, r: 0.6 }, 0, 4.5, { tone: "mid" }, 3)));
  }

  // ── The interconnector's converter station and its cable out to sea ────────
  {
    const s = W.SITES.converter;
    const hall = { x: s.x + 6, y: s.y + 6, w: 38, d: 24, r: 0 };
    put([hall.x + 19, hall.y + 12, 0], mat("hall", box(hall, 0, 16, { tone: "mid", inner: k.lineSvg(k.sideSeam(hall, 8, P, 2), { tone: "faint" }) })));
    const route = W.smoothLine(W.INTERCONNECTOR, 6).map(([x, y]) => at([x, y, W.SEA_LEVEL + 0.05]));
    ground.push(`<path class="il-cable" d="${path(route)}"/><path class="il-cable-pulse" d="${path(route)}"/>`);
    // where it leaves through the east face, in the sand under the sea
    const [ex, ey] = W.INTERCONNECTOR[W.INTERCONNECTOR.length - 1];
    ground.push(circle(at([ex, ey, -24]), 1.4, "il-cable-end"));
  }

  // ── The substation in the town, where the line comes down ──────────────────
  {
    const s = W.SITES.substation;
    for (const [tx, ty] of [[s.x + 10, s.y + 12], [s.x + 26, s.y + 12]]) put([tx, ty, 0], mat("dark", box({ x: tx - 4, y: ty - 3, w: 8, d: 6, r: 0.5 }, 0, 4.5, { tone: "mid" }, 3)));
    put([s.x + 20, s.y + 25, 0], mat("render", box({ x: s.x + 12, y: s.y + 22, w: 16, d: 6, r: 0 }, 0, 4, { tone: "mid" })));
  }

  // ── The lighthouse on the headland ──────────────────────────────────────────
  {
    const x = 936, y = 176, F = G.frameOf([x, y, 0], up, [1, 0, 0], [0, 1, 0]);
    const bands = [4, 8, 12].map((s) => G.arcOf(F, s, 2.6 - s * 0.03, P)).join("");
    put([x, y, 0], mat("white", solid(G.solidOf([[0, 3], [16, 2.4]], F, P, { steps: 20 }), { tone: "mid", inner: `<path class="il-band" d="${bands}"/>` })) +
      mat("lantern", solid(G.solidOf([[16, 1.8], [19, 1.8], [19, 2.2], [20.5, 0]], F, P, { steps: 16 }), { tone: "mid" })) + circle(at([x, y, 17.6]), 1.2, "il-glow il-lamp"));
  }

  // ── Boats on the sea ────────────────────────────────────────────────────────
  {
    // a yacht reaching across the wind, and the crew boat out to the farm
    const boat = (x, y, dir, len, sail) => {
      const hull = k.extrude(turned([x, y], dir, len, len * 0.34), W.SEA_LEVEL, 1.2, P);
      const wake = path([at([x - dir[0] * len * 0.6, y - dir[1] * len * 0.6, W.SEA_LEVEL]), at([x - dir[0] * len * 2.4, y - dir[1] * len * 2.4, W.SEA_LEVEL])]);
      let s = `<path class="il-wake" d="${wake}"/>` + mat("boat", solid(hull, { tone: "mid" }));
      if (sail) s += `<path class="il-sail" d="${quad([[x + dir[0] * 0.5, y + dir[1] * 0.5, W.SEA_LEVEL + 1.2], [x - dir[0] * 2.4, y - dir[1] * 2.4, W.SEA_LEVEL + 1.4], [x, y, W.SEA_LEVEL + 11]])}"/>`;
      else s += mat("white", box({ x: x - 1.6, y: y - 1.6, w: 3.2, d: 3.2, r: 0.6 }, W.SEA_LEVEL + 1.2, 1.8, { tone: "mid" }, 3));
      put([x, y, W.SEA_LEVEL], s);
    };
    boat(1010, 330, [0.8, 0.6], 8, true);
    boat(990, 520, [0.6, -0.8], 14, false);
  }

  // ── Pylons and the line ─────────────────────────────────────────────────────
  // A lattice tower: four legs taper to a waist, three cross-arms either side,
  // the earth wire's peak, insulator strings hanging from every arm tip.
  const ARMS = [{ z: 30, w: 9 }, { z: 36.5, w: 8 }, { z: 43, w: 6.5 }];
  const PEAK = 49;
  const pylonTips = [];
  W.PYLONS.forEach(([x, y], i) => {
    const a = W.PYLONS[Math.max(0, i - 1)], b = W.PYLONS[Math.min(W.PYLONS.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx; // across the line
    const z0 = W.heightAt(x, y);
    const leg = (u, v, z, h) => [x + dx * u + nx * v, y + dy * u + ny * v, z0 + z];
    const half = (z) => (z < 28 ? 5 - (z / 28) * 3.4 : 1.6 - ((z - 28) / (PEAK - 28)) * 1.2);
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    const levels = [0, 7, 14, 21, 28, 34, 40, 46, PEAK];
    const lines = [];
    for (const [cu, cv] of corners) lines.push(path(levels.map((z) => at(leg(cu * half(z), cv * half(z), z)))));
    for (let j = 0; j < levels.length - 1; j++) {
      const z = levels[j], z2 = levels[j + 1];
      const ring = corners.map(([cu, cv]) => at(leg(cu * half(z2), cv * half(z2), z2)));
      lines.push(path(ring, true));
      // the X bracing on each face
      for (let f = 0; f < 4; f++) {
        const [au, av] = corners[f], [bu, bv] = corners[(f + 1) % 4];
        lines.push(path([at(leg(au * half(z), av * half(z), z)), at(leg(bu * half(z2), bv * half(z2), z2))]));
        lines.push(path([at(leg(bu * half(z), bv * half(z), z)), at(leg(au * half(z2), av * half(z2), z2))]));
      }
    }
    const tips = [];
    for (const arm of ARMS) {
      for (const side of [-1, 1]) {
        lines.push(path([at(leg(0.9, side * half(arm.z), arm.z)), at(leg(0, side * arm.w, arm.z)), at(leg(-0.9, side * half(arm.z), arm.z))]));
        lines.push(path([at(leg(0.9, side * half(arm.z), arm.z)), at(leg(0, side * arm.w, arm.z + 0.01)), at(leg(0, side * half(arm.z + 2.5), arm.z + 2.5))]));
        const tip = leg(0, side * arm.w, arm.z), hang = leg(0, side * arm.w, arm.z - 3);
        lines.push(`M${at(tip).map(R1).join(" ")}L${at(hang).map(R1).join(" ")}`);
        tips.push(hang);
      }
    }
    tips.push(leg(0, 0, PEAK));
    pylonTips.push(tips);
    putOn(x, y, z0, `<g class="il-pylon"><path class="il-lattice" d="${lines.join("")}"/>${circle(at(leg(0, 0, PEAK + 0.6)), 0.8, "il-beacon il-pylon-light")}</g>`);
  });
  // the conductors: catenaries from string to string, the earth wire peak to peak
  const wires = [];
  for (let i = 0; i < pylonTips.length - 1; i++) {
    for (let c = 0; c < pylonTips[i].length; c++) {
      const a = pylonTips[i][c], b = pylonTips[i + 1][c], sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.045;
      const pts = Array.from({ length: 13 }, (_, n) => { const t = n / 12; return at([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - sag * 4 * t * (1 - t)]); });
      wires.push(path(pts));
    }
  }
  over.unshift(`<path class="il-wire" d="${wires.join("")}"/>`);

  // ── The sun, where the hero's day starts ────────────────────────────────────
  {
    const c = [250, 150], r = 24;
    const rays = Array.from({ length: 8 }, (_, n) => {
      const a = (n * Math.PI) / 4, b = 0.17;
      const p = (rr, aa) => [c[0] + rr * Math.cos(aa), c[1] + rr * Math.sin(aa)];
      return path([p(r + 7, a - b), p(r + 19, a), p(r + 7, a + b)], true);
    }).join("");
    over.push(`<g class="il-sun">${circle(c, 64, "il-sun-halo")}<path class="il-ray" d="${rays}"/>${circle(c, r, "il-sun-disc")}</g>`);
  }

  items.sort((a, b) => a.key - b.key);
  const css = [
    `.il-tree-shadow{fill:#3c5a2c;opacity:.18}`,
    `.il-hill-shade{fill:#2f4a22;stroke:none}`, `.il-hill-shade[data-shade="0"]{opacity:.26}`, `.il-hill-shade[data-shade="1"]{opacity:.16}`, `.il-hill-shade[data-shade="2"]{opacity:.07}`, `.il-hill-shade[data-shade="3"]{fill:#fff8e0;opacity:.08}`,
    `.il-trunk{fill:none;stroke:#6b5440;stroke-width:.8}`,
    `.il-canopy{fill:#5f8c45;stroke:#466b33;stroke-width:.5}`,
    `.il-tree[data-kind="dark"] .il-canopy{fill:#4e7a3c}`,
    `.il-canopy-lit{fill:#86b062;opacity:.75}`,
    `.il-win{fill:#56687a;opacity:.75}`,
    `.il-pad{fill:#d3cfc5}`, `.il-solar-ground{fill:#9cbf78}`, `.il-carpark{fill:#a6a9ab}`,
    `.il-pitch{fill:#79b85a}`, `.il-pitch-line{fill:none;stroke:#f4f7f2;stroke-width:.45}`,
    `.il-sheep{fill:#fbfbf7;stroke:#9aa08f;stroke-width:.3}`,
    `.il-head{fill:#fff6cf;opacity:0}`,
    `.il-foam{fill:none;stroke:#eef4f8;stroke-width:.7;opacity:.8}`,
    `.il-tower-mouth{fill:#5d6668;stroke:#8f948f;stroke-width:.5}`,
    `.il-steam{fill:#ffffff;opacity:.55}`,
    `.il-glow{fill:#ffcf7a;opacity:0}`,
    `.il-fan{fill:#4b545c;opacity:.8;stroke:#36404a;stroke-width:.4}`,
    `.il-pipe{fill:none;stroke:#b7bfc5;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}`,
    `.il-heat{fill:url(#il-heat-g)}`, `.il-crack{fill:none;stroke:#c2552b;stroke-width:.7;opacity:.8}`,
    `.il-casing{fill:none;stroke:#59636b;stroke-width:.8}`,
    `.il-fence{fill:none;stroke:#7d8a7a;stroke-width:.4;opacity:.8}`,
    `.il-led{fill:#38c172}`,
    `.il-cable{fill:none;stroke:#e8f1f7;stroke-width:.9;stroke-dasharray:3 3;opacity:.7}`,
    `.il-cable-pulse{fill:none;stroke:#ffe08a;stroke-width:1.2;opacity:0}`,
    `.il-cable-end{fill:#2b3238;stroke:#e9b44c;stroke-width:.6}`,
    `.il-band{fill:none;stroke:#c4503f;stroke-width:1.6}`,
    `.il-wake{fill:none;stroke:#f4f8fb;stroke-width:1;opacity:.7}`,
    `.il-sail{fill:#fbfbf9;stroke:#9aa5ad;stroke-width:.4}`,
    `.il-lattice{fill:none;stroke:#7f8a92;stroke-width:.45;stroke-linecap:round}`,
    `.il-wire{fill:none;stroke:#6b767e;stroke-width:.45;opacity:.85}`,
    `.il-beacon{fill:#d2493f;opacity:.9}`,
    `.il-pv-flat{fill:#334b6e;stroke:#c9d2da;stroke-width:.3}`,
    `.il-sun-halo{fill:#f7d27a;opacity:.18}`, `.il-sun-disc{fill:#f5c451;stroke:#e3a93a;stroke-width:.8}`, `.il-ray{fill:#f5c451;opacity:.9}`,
  ];
  return {
    css, mats,
    ground: `<g class="il-hills">${hillShade.join("")}</g><defs><radialGradient id="il-heat-g"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".85"/><stop offset=".55" stop-color="#e2582b" stop-opacity=".35"/><stop offset="1" stop-color="#c2552b" stop-opacity="0"/></radialGradient></defs><g class="il-works">${ground.join("")}</g>`,
    things: items.map((i) => i.svg).join(""),
    over: `<g class="il-over">${over.join("")}</g>`,
    cars,
  };
}
