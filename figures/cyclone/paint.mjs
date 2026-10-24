// The two paints of the card: the navy set it shares with the other post cards,
// and a daylight colour version close to the satellite photo it replaced. Same
// ground, same storm, same motion; only these values differ.
//   tokens   the scope's custom properties
//   ground   one fill (or declarations) per piece of land.mjs, in paint order
//   lines    stroke declarations of the coast, the surf line and the index contour
//   cloud    the shader's cloud tones (GLSL vec3 source), the core's share of
//            white, the ground shadow's ink (null: black) and its strength.
//            Over a coloured ground the shadow is a cool grey, not black.
//   card     the card's background before the SVG fades in
//   suffix   appended to every output name

const NAVY_TOKENS = `--anatomy-page:#050f17;--anatomy-card:#081722;--anatomy-paper:#081722;--anatomy-face:#0c1f2d;
--anatomy-shade-0:#040e17;--anatomy-shade-1:#061521;--anatomy-shade-2:#091b29;--anatomy-shade-3:#0c2131;--anatomy-top:#10283a;
--anatomy-lit-top:#163045;--anatomy-lit-shade:#12293b;
--anatomy-hi:#9fb2c2;--anatomy-mid:#5a7184;--anatomy-lo:#2f475a;--anatomy-faint:#1a3041;--anatomy-halo:#01070c;
--anatomy-text:#7f95a7;--anatomy-strong:#c9d6e0;--anatomy-muted:#566d80;--anatomy-lit:#e8f0f6;--anatomy-dot:#c9d6e0;--anatomy-weight:.6px`;

export const PAINT = {
  navy: {
    tokens: NAVY_TOKENS,
    ground: {
      sea: "fill:#040d15",
      shelf: ["#05111b", "#061420", "#081927"],
      swell: "fill:var(--anatomy-hi)",
      swellOpacity: [".16", ".28", ".45"],
      terrace: ["#0b1f2e", "#0d2333", "#0f2738", "#112a3d", "#132e42", "#163248", "#19374e", "#1c3c54"],
      dark: "fill:#01060b;opacity:.8", rim: "fill:#36556c",
      wadi: "fill:#050f18;opacity:.85", fan: "fill:#1d3a51;opacity:.75",
      hachDark: "fill:#030b12;opacity:.75", hachLit: "fill:#56738a;opacity:.6",
      duneDark: "fill:#0b1c29;opacity:.6", duneLit: "fill:#2a475e;opacity:.6",
    },
    lines: { coast: "stroke:var(--anatomy-hi);stroke-width:.55", surf: "stroke:var(--anatomy-lo);stroke-width:.4", index: "stroke:var(--anatomy-lo);stroke-width:.3;opacity:.8" },
    cloud: { lo: ".36,.45,.55", hi: ".93,.955,.975", core: ".3", shadowInk: null, shadow: ".42" },
    card: "#081722",
    suffix: "",
  },
  colour: {
    tokens: NAVY_TOKENS,
    ground: {
      // deep ocean, shoaling to a lighter blue over the shelf
      sea: "fill:#1b3a62",
      shelf: ["#1f426d", "#244b78", "#2c5885"],
      swell: "fill:#d6e4ee",
      swellOpacity: [".2", ".34", ".55"],
      // a buff coastal plain, sand up the scarp, warmer ochre on the plateau
      terrace: ["#c2a982", "#bea177", "#bb9a6d", "#b99465", "#b88f5e", "#b98b58", "#bb8853", "#bd8550"],
      dark: "fill:#5b3e24;opacity:.72", rim: "fill:#ecdcb9",
      wadi: "fill:#5e5a3c;opacity:.6", fan: "fill:#e2d6bd;opacity:.8",
      hachDark: "fill:#5d3f25;opacity:.7", hachLit: "fill:#f2e2c0;opacity:.6",
      duneDark: "fill:#9a6a3e;opacity:.55", duneLit: "fill:#f3dcae;opacity:.7",
    },
    lines: { coast: "stroke:#7b5e3d;stroke-width:.55", surf: "stroke:#e6eff4;stroke-width:.4;opacity:.75", index: "stroke:#8a6440;stroke-width:.3;opacity:.6" },
    cloud: { lo: ".38,.46,.58", hi: ".95,.965,.98", core: ".55", shadowInk: ".16,.18,.24", shadow: ".4" },
    card: "#1b3a62",
    suffix: "-colour",
  },
};
