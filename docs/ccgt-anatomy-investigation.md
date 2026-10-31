# A CCGT in the anatomy kit: research notes

The question: can the anatomy package vendored at `figures/lib/anatomy` explain how a combined-cycle gas turbine (CCGT) power station works, and what would it take?

This note covers four things:

- what the kit is good at;
- the physics model, which is built and checked;
- how a CCGT maps onto the kit's way of drawing;
- the scope I recommend.

Nothing here changes the site.

## 1. The package

Anatomy is a skill and kit for crafted, interactive isometric SVG figures in the style of the existing post cards (`figures/battery`, `figures/ohmera`, `figures/wake`, `figures/cyclone`). The relevant parts:

- **`kit/iso-kit.mjs`**: the camera, solids (`slabOf`, `extrude`, `cylinder`), four-tone shading, painter's order, and the card and page builders.
- **`kit/lathe.mjs`**: turned bodies on any axis. This covers most of a gas turbine: casings, bell-mouth intake, combustor cans, flanges, diffuser, the shaft line.
- **`kit/tube.mjs`**: pipework and cables. Pipes are split into depth-sortable chunks, with collars, clamps and ring textures. Feedwater, steam lines, gas supply and cabling would all come from here.
- **`kit/audit.mjs`**: proves that no pipe passes through anything, that every pipe end sits on a real port, and that every crossing is drawn in depth order. It is essential once a figure has a lot of pipework, which a CCGT does.
- **`kit/gl.mjs`**: WebGL shaders registered to the drawing's own isometric camera. Candidates here are the flame in the combustor, heat shimmer in the exhaust duct, the stack plume, and steam at the condenser.
- **Exploded views**: assemblies spring apart and are re-sorted every frame. The raptor-engine example does this with 11 assemblies, and a turbine hall would explode the same way.
- **Printable sheets**: poster, drawing or detailed A4 PDFs made from the same figure.

The kit's first rule is that **the object is the explanation**: no boxes, arrows or labels. A real machine with many small, true parts, every moving number taken from one pure model. The site's cards already follow this, each with its own `model.mjs`.

**Sizing rule.** The skill sizes work as follows:

| Size | What it covers | Parts | Time |
| --- | --- | --- | --- |
| Figure | one mechanism | 40–80 | under an hour |
| Hero | a dense object | 80–150 | about 2–4 hours |
| Epic | a whole plant | more | 6 hours or more |

It says not to start an Epic without agreement, and to offer a Hero version first. A whole CCGT station is an Epic.

## 2. The model (built): `figures/ccgt/model.mjs`

This is a pure module, so a build and its page would agree. It covers three stages:

1. **Gas turbine (Brayton topping cycle).** Compression, combustion and expansion, with real component efficiencies and one pressure-loss factor. The first turbine nozzle is choked, so the pressure ratio follows the air flow and the firing temperature.
2. **Heat-recovery steam generator (HRSG).** It recovers the exhaust's heat down to a stack temperature of 85 °C.
3. **Steam turbine (Rankine bottoming cycle).** Its efficiency is a fixed share of the Carnot limit, taken between the mean temperature at which the steam gains heat and a condenser that sits 18 K above the day's air or water. This gives the right hot-day behaviour.

It also models:

- **Part load in two stages, as real units do.** First the inlet guide vanes (IGVs) close, so the flame stays hot while the exhaust gets hotter. Then the flame is turned down. The minimum load is 40%.
- **Carbon capture on the stack**, as an efficiency penalty of about 8 points.

`node figures/ccgt/check.mjs` prints the operating points and checks nine bands. It is calibrated to an H-class single-shaft unit the size of Keadby 2, which holds the record of 849 MW at 64.18%:

| Point | Net | Efficiency | Gas : steam | Exhaust | CO₂ |
| --- | --- | --- | --- | --- | --- |
| ISO, 15 °C | 848 MW | 63.6 % | 595 : 270 MW | 635 °C | 317 g/kWh |
| Cold day, 0 °C | 936 MW | 64.4 % | | 630 °C | 314 g/kWh |
| Hot day, 30 °C | 768 MW | 62.8 % | | 639 °C | 322 g/kWh |
| 75 % load | 636 MW | 62.2 % | | 693 °C (vanes closed) | 325 g/kWh |
| 40 % load | 341 MW | 54.9 % | | 470 °C | 368 g/kWh |
| With 95 % capture | 741 MW | 55.6 % | | | 18 g/kWh |

Notes on the table:

- The hot-day loss is 0.62% of output per °C above ISO. Published rules of thumb give 0.5–0.9% per °C.
- The simple-cycle efficiency (gas turbine alone) is 44.7%.
- The shaft turns at 3,000 rpm, for a two-pole generator on GB's 50 Hz grid.

It is a teaching model, good to a few per cent. It ignores turbine cooling air, humidity and the HRSG's pinch analysis.

## 3. The object

**The concept.** One shaft carries the whole idea: air in at one end, electricity out of the middle, heat used twice. What moves and what it means:

- the shaft turns;
- the gas flame's colour and the exhaust shimmer follow the firing temperature;
- the steam turbine's share of the output rises as heat flows through the HRSG.

**The machine, single-shaft, seen from about 40° azimuth.** In flow order:

1. **Air in:** the filter house and the bell-mouth intake, with the inlet guide vanes visible through a cutaway.
2. **Gas turbine:** the compressor casing, with ribbed stages tapering inward. The combustor section has a ring of cans, its gas manifold and flexible hoses. The turbine casing has the exhaust diffuser behind it.
3. **Generator:** in the middle of the shaft line, with its exciter. A **clutch** couples it to the steam turbine, so the gas turbine can start alone.
4. **Steam turbine:** HP/IP and LP casings, crossover pipes, and the condenser beneath it, with its cooling-water inlet and outlet.
5. **HRSG:** a tall box with one wall cut away to show three tube banks (HP, IP and LP, the high-, intermediate- and low-pressure sections) and three steam drums on top. Downcomers and risers run from tube.mjs.
6. **Stack and control:** the stack, with a gas analyser cabinet partway up, and a control desk with a dial gauge for each of temperature, pressure and MW.

**Controls and readout:**

- A **load knob** drives `atLoad()`: the IGVs turn, then the flame dims.
- An **ambient dial** sets the day's temperature.
- An optional **capture switch** adds an amine column beside the stack.
- The readout shows net MW, efficiency and CO₂ g/kWh, all from the model.

**Shaders (`gl.mjs`)**, each driven by the model:

- the combustor flame, whose blackbody colour follows the firing temperature;
- exhaust shimmer in the duct, fading out as the gas cools through the HRSG;
- the stack plume, mostly invisible water vapour at full load;
- condenser steam.

## 4. Scope and recommendation

**The full station is an Epic:** about 200–300 parts, dense pipework that must pass the audit, four shader layers and an exploded view. Expect several working days to reach the kit's standard, not hours.

**Recommended first build: a Hero of the gas turbine island alone.** About 120 parts, about 2–4 hours:

- the intake with its inlet guide vanes, a compressor, combustor cans and the turbine on one shaft;
- the generator;
- the exhaust duct running off the card's edge towards an HRSG that is only hinted at;
- a load knob, and a readout of the gas turbine's MW and exhaust temperature;
- one shader, for the flame.

It proves the hardest part, the turned bodies and manifolds, and it can grow into the full CCGT later. A second Hero could add the HRSG and the steam turbine side.

**Open questions:**

1. **Where would it live?** As a blog post card it matches the existing cards and uses their navy and colour variants. The anatomy look was rejected for the homepage island, so I wouldn't propose it there.
2. **Dark or light theme?** The cards use the navy theme; the kit's light theme is for print.
3. **Show carbon capture or not?** It is relevant to GB's plans (Net Zero Teesside), but it adds an Epic's worth of extra plant.

## Sources

- Keadby 2: 849.45 MW, 64.18 % verified 2024, single-shaft SGT5-9000HL. [Siemens Energy via District Energy](https://www.districtenergy.org/blogs/district-energy/2024/06/24/siemens-energy-sets-world-records-at-uks-keadby-2), [Wikipedia](https://en.wikipedia.org/wiki/Keadby_Power_Stations), [Enerdata](https://www.enerdata.net/publications/daily-energy-news/sses-840-mw-keadby-2-ccgt-project-construction-moves-forward-uk.html)
- GE 9HA fact sheet: pressure ratio about 21.8, exhaust about 619 °C (9HA.01), above 61 % net combined. [energy-xprt](https://www.energy-xprt.com/downloads/9ha-heavy-duty-gas-turbine-fact-sheet-438268), [Modern Power Systems](https://www.modernpowersystems.com/news/ges-new-h-class-turbine-is-all-air-cooled-4206315/)
- Hot-day derate of 0.5–0.9 % of output per °C above ISO. [Power Engineering](https://www.power-eng.com/operations-maintenance/why-keeping-cool-keeps-output-high/), [USPE](https://uspeglobal.com/articles/gas-turbine-derating-heat-altitude-site-conditions/), [RWE Great Yarmouth ambient conditions](https://uk.rwe.com/-/media/RWE/RWE-UK/downloads/great-yarmouth-ccgt-power-plant/appendix-e-gy-section-36-ambient-conditions-final-february-2023.pdf)
