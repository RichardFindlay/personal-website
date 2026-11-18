// A small readout of what the scene costs on the machine showing it, for `?fps` on the address. Nothing loads this file otherwise.
// Frames drawn a second, how long the graphics card and the page's own code spend on each, and how much is drawn.

const WINDOW_MS = 1000;
const TIME_ELAPSED = 0x88bf;
const GPU_DISJOINT = 0x8fbb;

export function mountReadout(renderer, figure) {
  const gl = renderer.getContext();
  const panel = document.createElement("output");
  panel.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:1000;padding:8px 10px;border-radius:6px;background:rgba(8,24,34,0.82);color:#e8f4f8;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none";
  figure.ownerDocument.body.append(panel);

  // Where the browser offers it, each frame's work on the graphics card is timed. A query's answer arrives a few frames later.
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const pending = [];
  let gpuTotal = 0;
  let gpuFrames = 0;
  const collect = () => {
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = pending.shift();
      if (!gl.getParameter(GPU_DISJOINT)) {
        gpuTotal += gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gpuFrames++;
      }
      gl.deleteQuery(query);
    }
  };

  // The renderer is wrapped rather than the scene's loop, so the timings cover exactly one frame's drawing, shadows included.
  const render = renderer.render.bind(renderer);
  let codeTotal = 0;
  let drawn = 0;
  let triangles = 0;
  let calls = 0;
  renderer.render = (scene, camera) => {
    const query = timer && pending.length < 8 ? gl.createQuery() : null;
    if (query) gl.beginQuery(TIME_ELAPSED, query);
    const started = performance.now();
    render(scene, camera);
    codeTotal += performance.now() - started;
    if (query) {
      gl.endQuery(TIME_ELAPSED);
      pending.push(query);
    }
    drawn++;
    ({ triangles, calls } = renderer.info.render);
  };

  let since = 0;
  return (now) => {
    collect();
    since ||= now;
    if (now - since < WINDOW_MS) return;
    const seconds = (now - since) / 1000;
    const canvas = renderer.domElement;
    panel.textContent = [
      `${(drawn / seconds).toFixed(0)} frames a second`,
      `graphics card ${gpuFrames ? `${(gpuTotal / gpuFrames).toFixed(1)} ms a frame` : "time not offered by this browser"}`,
      `page code ${(codeTotal / Math.max(1, drawn)).toFixed(1)} ms a frame`,
      `${Math.round(triangles / 1000)}k triangles in ${calls} draw calls`,
      `${canvas.width} x ${canvas.height} px at ${renderer.getPixelRatio()}x`,
    ].join("\n");
    since = now;
    drawn = 0;
    codeTotal = 0;
    gpuTotal = 0;
    gpuFrames = 0;
  };
}
