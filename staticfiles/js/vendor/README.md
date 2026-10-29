# Vendored front-end libraries

Pinned copies, served from here rather than a CDN. The version is in each folder name; to upgrade, add a new folder and repoint the templates.

| Library | Version | Files | Source | Licence |
| --- | --- | --- | --- | --- |
| GSAP + ScrollTrigger | 3.15.0 | `gsap-3.15.0/gsap.min.js`, `gsap-3.15.0/ScrollTrigger.min.js` | npm `gsap@3.15.0`, `dist/` | GreenSock standard licence (free for all use), header in each file |
| three.js | 0.185.1 | `three-0.185.1/build/three.module.min.js` (+ `three.core.min.js`), and from `examples/jsm/`: `loaders/GLTFLoader.js`, `utils/BufferGeometryUtils.js`, `utils/SkeletonUtils.js`, `libs/meshopt_decoder.module.js`, `environments/RoomEnvironment.js` | npm `three@0.185.1`, same paths | MIT, `three-0.185.1/LICENSE` |
| Lenis | 1.3.26 | `lenis-1.3.26/lenis.min.js`, `lenis-1.3.26/lenis.css` | npm `lenis@1.3.26`, `dist/` | MIT, `lenis-1.3.26/LICENSE` |

The homepage maps `three` and `three/addons/` to these files with an import map, so the addons' own imports resolve unchanged. Source map comments are stripped so the browser does not request maps that are not shipped.
