// The home page's hero chart: one illustrative trading day in the GB power
// market, 48 half-hour periods. A day-ahead auction price (stepped, amber), an
// intraday VWAP that drifts around it as the wind forecast updates (sky), and
// trades printing as a cursor sweeps across the day. The numbers are made up
// with a seeded generator so the picture is the same on every visit.

const svg = document.getElementById("tape");
if (svg) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 560, H = 300, PAD = { l: 34, r: 12, t: 18, b: 34 };
  const N = 48;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let seed = 20240917;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // A day-ahead shape: a low overnight, a morning ramp, a midday dip as solar
  // comes on, then an evening peak.
  const da = Array.from({ length: N }, (_, i) => {
    const h = i / 2;
    const base = 62 + 28 * Math.exp(-((h - 7.5) ** 2) / 4) - 22 * Math.exp(-((h - 13) ** 2) / 6) + 46 * Math.exp(-((h - 18) ** 2) / 3.2) - 18 * Math.exp(-((h - 3) ** 2) / 8);
    return base + gauss() * 2.5;
  });
  // The intraday VWAP: the auction plus a wind-forecast revision that builds
  // through the afternoon, plus noise.
  const revision = Array.from({ length: N }, (_, i) => 14 * Math.sin((i / N) * Math.PI * 1.6 + 0.4) * Math.min(1, i / 14));
  const id = da.map((p, i) => p + revision[i] + gauss() * 3.5);
  // Trades: a handful per period around the VWAP, more in the evening.
  const trades = [];
  for (let i = 0; i < N; i++) {
    const n = 1 + Math.floor(rnd() * (i > 30 ? 4 : 2));
    for (let k = 0; k < n; k++) trades.push({ i, x: i + rnd(), p: id[i] + gauss() * 4, r: 1.3 + rnd() * 1.6 });
  }
  const all = da.concat(id, trades.map((t) => t.p));
  const lo = Math.min(...all) - 6, hi = Math.max(...all) + 6;
  const X = (i) => PAD.l + ((W - PAD.l - PAD.r) * i) / N;
  const Y = (p) => PAD.t + ((H - PAD.t - PAD.b) * (hi - p)) / (hi - lo);

  const el = (name, attrs, parent = svg) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
  const g = el("g", {});

  // frame
  for (let p = Math.ceil(lo / 20) * 20; p < hi; p += 20) {
    el("line", { x1: PAD.l, x2: W - PAD.r, y1: Y(p), y2: Y(p), stroke: "rgba(255,255,255,0.07)", "stroke-width": 1 }, g);
    el("text", { x: PAD.l - 8, y: Y(p) + 3, fill: "#5f7389", "font-size": 9, "font-family": "JetBrains Mono, monospace", "text-anchor": "end" }, g).textContent = "£" + p;
  }
  for (let h = 0; h <= 24; h += 6) {
    el("line", { x1: X(h * 2), x2: X(h * 2), y1: H - PAD.b, y2: H - PAD.b + 4, stroke: "#5f7389" }, g);
    el("text", { x: X(h * 2), y: H - PAD.b + 16, fill: "#5f7389", "font-size": 9, "font-family": "JetBrains Mono, monospace", "text-anchor": h === 24 ? "end" : h === 0 ? "start" : "middle" }, g).textContent = String(h).padStart(2, "0") + ":00";
  }
  el("text", { x: W - PAD.r, y: PAD.t - 6, fill: "#5f7389", "font-size": 9, "font-family": "JetBrains Mono, monospace", "text-anchor": "end" }, g).textContent = "£/MWh · half-hourly";

  // the spread between the two, shaded
  const area = el("path", { fill: "rgba(169,200,225,0.10)" }, g);
  const daPath = el("path", { fill: "none", stroke: "#f5b301", "stroke-width": 2, "stroke-linejoin": "round" }, g);
  const idPath = el("path", { fill: "none", stroke: "#a9c8e1", "stroke-width": 1.6, "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
  const dots = el("g", {}, g);
  const dotEls = trades.map((t) => el("circle", { cx: X(t.x), cy: Y(t.p), r: t.r, fill: "#ffffff", opacity: 0 }, dots));
  const cursor = el("line", { y1: PAD.t, y2: H - PAD.b, stroke: "rgba(255,255,255,0.35)", "stroke-width": 1, "stroke-dasharray": "3 3" }, g);
  const head = el("circle", { r: 3.5, fill: "#f5b301" }, g);
  const label = document.getElementById("tape-period");

  const stepTo = (arr, upto) => {
    let d = "";
    for (let i = 0; i < N && i < upto; i++) {
      const x0 = X(i), x1 = X(Math.min(upto, i + 1)), y = Y(arr[i]);
      d += (i ? "L" : "M") + x0.toFixed(1) + " " + y.toFixed(1) + "L" + x1.toFixed(1) + " " + y.toFixed(1);
    }
    return d;
  };
  const smoothTo = (arr, upto) => {
    let d = "";
    const n = Math.min(N, Math.ceil(upto));
    for (let i = 0; i < n; i++) {
      const x = X(i + 0.5), y = Y(arr[i]);
      d += (i ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d;
  };
  const areaTo = (upto) => {
    const n = Math.min(N, Math.ceil(upto));
    if (n < 2) return "";
    let d = "M" + X(0.5).toFixed(1) + " " + Y(da[0]).toFixed(1);
    for (let i = 1; i < n; i++) d += "L" + X(i + 0.5).toFixed(1) + " " + Y(da[i]).toFixed(1);
    for (let i = n - 1; i >= 0; i--) d += "L" + X(i + 0.5).toFixed(1) + " " + Y(id[i]).toFixed(1);
    return d + "Z";
  };

  function draw(t) {
    // the auction is known for the whole day; the intraday book fills in as the day goes
    daPath.setAttribute("d", stepTo(da, N));
    idPath.setAttribute("d", smoothTo(id, t));
    area.setAttribute("d", areaTo(t));
    const i = Math.min(N - 1, Math.floor(t));
    dotEls.forEach((c, k) => c.setAttribute("opacity", trades[k].x <= t ? 0.85 : 0));
    const x = X(Math.min(t, N));
    cursor.setAttribute("x1", x); cursor.setAttribute("x2", x);
    head.setAttribute("cx", x); head.setAttribute("cy", Y(id[i]));
    if (label) { const h = Math.floor(i / 2), m = i % 2 ? "30" : "00"; label.textContent = String(h).padStart(2, "0") + ":" + m; }
  }

  if (still.matches) {
    draw(N);
  } else {
    const SECONDS = 22, HOLD = 3;
    let start = performance.now();
    const tick = (now) => {
      const s = (now - start) / 1000;
      if (s > SECONDS + HOLD) { start = now; }
      draw(Math.min(N, (Math.max(0, s) / SECONDS) * N));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
