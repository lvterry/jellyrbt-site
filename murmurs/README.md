# Murmurs

- `/murmurs/` lists the studies.
- `/murmurs/v4/` is Contact sheet, the current study: twelve random shapes from V2's flock in a 4×3 grid. One set of dials moves all twelve; each square can save its own version.
- `/murmurs/v3/` is Propagation, marked experimental in the archive: an emergent model where birds copy their neighbours' mean heading through a lag and a turn-rate cap. A startle at the rim is measured after the fact — how much of the flock turned, how long it took, and the fitted front speed.
- `/murmurs/v1/` is the Murmuration explorer: 20 live flocking simulations with tunable parameters and saved presets.
- `/murmurs/v2/` is Traveling turn: one choreographed flock. Birds circulate through a flexible sheet, and a bank rolls from one end to the other. The dark folds come from projected overlap, not extra ink or trails. This is a visual study, not a new neighbor-based flocking model.

They all run as plain ES modules with no bundler. V2, V3 and V4 use [DialKit](https://github.com/joshpuckett/dialkit) via its dependency-free vanilla build, vendored into `murmurs/vendor/dialkit/` so the site stays static.

```sh
npm install     # dialkit, build-time only
npm run build   # copies the vanilla bundle into murmurs/vendor/dialkit/
npm start       # http://localhost:8000/murmurs/
npm test
```

`murmurs/vendor/dialkit/` is generated output and is committed because GitHub Pages serves the repo as-is. Re-run `npm run build` after upgrading DialKit (`npm i -D dialkit@latest`).

### V4 sheet

`shapes.js` rolls twelve shapes from V2's six forms: pick a family, nudge each shape knob by 6–16% of its range, and deal the families in shuffled passes so a set always shows all six before repeating one. Sampling V2's `sampleFlock` means the sheet inherits the morph entirely — the dark folds are still projected overlap.

The Shape folder and the Form select are gone from the panel. The whole sheet is rolled from one seed, so `?seed=31415` reloads a sheet exactly, and **Randomize shapes** deals another set of twelve.

| Control | What it does to the sheet |
| --- | --- |
| Sky | Dusk, Rose, Haze, Night; the squares are transparent over a CSS gradient |
| Turn rate / Drift | Speed of the traveling turn; how far each shape wanders (framing gives way as drift rises) |
| Scale | Framing |
| Birds / Bird size / Ink | Density and mark weight, per square |
| Save version | Stores that square's shape, bird seed and a thumbnail |
| Randomize shapes | Deals a new set of twelve |

**Save version** sits under each square. Versions are shapes, not dials, so they live in their own store (`murmurs.v4.versions`, newest first, 18 kept) instead of DialKit's preset store; DialKit persists the shared dials under `murmurs.v4` and its own toolbar is hidden on this page. Saved versions appear below the sheet — click one to put it back in its square, where it morphs in and its square flashes. If the browser refuses the write, versions stay for the session and the status line says so.

The sheet is four squares across on a desktop, three on a tablet and two on a phone, so twelve shapes read as 4×3, 3×4 or 2×6 without ever shrinking below a useful size. From 80rem the panel starts open and the page grows a right rail for it — the sheet's content stops 20rem short of the window, so the dials never sit over a square. Narrower than that the panel folds back to its toggle.

A square is a button: clicking it opens the same flock, same moment, large in a native `<dialog>` — Escape, the backdrop or Close dismiss it, and focus goes back to the square. The sheet stops repainting behind the scrim while the preview is open, which is what keeps the big canvas at 60 fps. The preview uses the same paint with the same knobs: a bird is exactly the Bird size and the flock exactly the Bird count, so the larger canvas shows a sparser, finer flock rather than an enlarged one.

Clicking anywhere outside the DialKit panel folds the panel back to its toggle; clicks inside it — dials, the Sky menu, the action — leave it open. Opening a preview closes it too.

Each square gets its own framing: `shapeExtents` measures a shape's half-extents over the roll, `fitFor` turns that into a scale that leaves room for the drift, so a 360-unit blade and a 148-unit bloom read at the same size and neither clips at the default scale. Frames are drawn in CSS pixels, not world units, or birds would be a fifth of a pixel wide in a 200 px square. Reduced motion gets one still per square at the moment that shape was most open.

### V2 knobs

Six forms (Sheet, Hook, Spiral, Bloom, Blade, Loose drift) are starting points; every knob stays live afterwards, and touching a shape knob switches Form to Custom.

| Knob | What it changes |
| --- | --- |
| Length / Girth | Size of the sheet the birds circulate through |
| Roll | How far the bank tips; drives the fold/fan |
| Folds | How many banks fit along the length |
| Curve | The S-bend of the sheet's spine (negative mirrors it) |
| Curl | How far the outer lip peels away |
| Twist | Skew between the roll and its projection — the helical read |
| Depth | Front-to-back thickness of the sheet |
| Turn rate / Drift | Speed of the traveling turn; how far the flock wanders |
| Scale | Framing |
| Birds / Bird size / Ink | Density and mark weight |
| Sky | Dusk, Rose, Haze, Night |

The panel is one DialKit root in its floating popover mode, pinned to the top-right of the viewport so the flock stays visible while you tune. On phones it starts collapsed (the panel would cover the canvas) and opens from DialKit's toggle. One panel holds Shape, Motion and Flock folders plus Form/Sky selects. DialKit owns persistence under `murmurs.v2` and the "Save version" thumbnails; `player.js` maps panel values onto the flock and keeps the form selector honest — moving any slider flips Form to Custom.

`?form=hook&sky=night` links to a specific setup. Form changes ease into each other, so picking a new form morphs the silhouette rather than cutting to it. The study has no transport controls: it plays on load, and `prefers-reduced-motion` gets a still, fully formed frame instead of motion.

### V3 model

`flock3d.js` is a 3D torus world with a periodic hash grid. Each bird averages the unit headings of its `k` nearest neighbours, adds cohesion and separation, then follows that target through a first-order lag (`lag`, ms) with a capped turn rate (`inertia`, rad/s). A startle rotates every bird within `startleRadius` of the flock's rim-most bird about a mostly-horizontal axis, so the flock banks through its own slab and the projection folds.

The measurement is post-hoc, not scripted: each bird's turn onset (first 34° away from its pre-startle heading) is regressed against its distance from the startle; the inverse slope is the front speed. Higher lag slows and narrows the front — at the far end it can fail to propagate at all, which is worth watching.

**Commitment (the mechanism that makes it travel).** A lag alone averages a turn away: when a few birds turn, the untouched majority pulls them back. Each bird now checks whether enough of its neighbours already point a different way (default 30%, at least two, sharing a coherent direction); if so it adopts that heading and holds it for `commitTime` (default 0.8 s), during which it ignores the old majority and bypasses the response lag. A turn then locks in, one ring of birds at a time. Dropping commitment to 0 returns to the collective turn with no measurable front; pushing the share down to 0.2 with a 0.5 s hold over-tightens the flock into a knot.

Findings from tuning: copying *stale* headings (rather than passing current headings through a lag) suppresses the turn instead of spreading it; inertia alone already propagates a front; and without commitment, a stable flock turns near-collectively with no distance/onset slope to measure.

Performance and framing fixes that made V3 usable:

- **Neighbour search short-circuits.** Scanning a whole grid shell after finding enough candidates cost 31 ms/step; stopping at ~2k candidates cut it to 1.4 ms. The browser run is now ~16.7 ms/frame at 2,600 birds and DPR 2, against ~17.8 ms for V2.
- **No catch-up spiral.** At most two sub-steps per frame; the backlog is dropped instead of compounding a slow frame.
- **Commitment costs nothing measurable.** The extra neighbour test rides along with the alignment loop; V3 stays at ~17 ms/frame.
- **Circular centroid.** An arithmetic mean on a torus jumps to the far side when the flock crosses a seam, which lurched the camera and pushed birds out of frame.
- **Topological neighbours.** `k` nearest found in expanding shells, so a stretched flock stays one network instead of shearing into groups that can never see each other again.
- **Bounded steering terms.** Cohesion and separation are normalised before summing, and birds further than `rejoinRadius` from the centre steer back. A 120 s run holds one group with 100% of birds.

## V1: Murmuration explorer

Spec: `docs/Project Murmuration Explorer.md`.

## Layout

```
src/sim/         Simulation (headless), boids, vicsek, topological, spatialGrid
src/variants/    paramSchema, defaultVariants (the 20), validate
src/presets/     presetStore (localStorage "murmuration.presets.v1", export/import)
src/render/      renderer (trails, colour modes)
src/ui/          app (state + RAF loop), gridView, singleView, paramPanel, presetList, dialogs
v1/              the explorer page
v2/              flock.js (shape model, forms, knobs) + player.js (DialKit panel, morph loop, canvas)
v3/              flock3d.js (emergent model + measurement) + player.js (camera, HUD, DialKit)
v4/              shapes.js (rolls, framing) + versions.js (per-square saves) + player.js (sheet, DialKit)
shared/          sky palettes used by V2, V3 and V4
vendor/dialkit/  generated: DialKit vanilla ESM + styles (npm run build)
tests/           explorer.test.mjs (V1), traveling-turn.test.mjs (V2), propagation.test.mjs (V3),
                 contact-sheet.test.mjs (V4)
```

## Type and page

Allo by Josh Puckett ([allo.joshpuckett.me](https://allo.joshpuckett.me)), SIL Open Font License 1.1. The variable font with roundness fixed at 50 is vendored at `assets/fonts/allo/AlloVariableFriendly.woff2`, with `OFL.txt` beside it; `studies.css` registers it for weights 400–500 only, so nothing on these pages can go bold. The scale is four sizes — 12, 14, 16 and 20 px — with body copy at 14 px, headings at 20 px medium, and no letter-spaced caps or eyebrow lines. Pages are white.

## Decisions

- **One `Simulation` per variant.** Each one has its own typed arrays, spatial grid and seeded RNG. The UI calls only `reset(params, opts)` and `step(dt)`. The renderer only reads, through `getPositions()` plus read-only getters for velocities, alignment and density, which the colour modes need.
- **The world is a fixed 1000×700 torus.** Edges wrap. Walls squeezed every flock into a blob when it turned, so they were dropped. Canvases keep the 10:7 shape. Positions don't depend on screen size, so presets look the same anywhere.
- **Grid previews run at most 1,000 birds.** Single view runs the full count. The cap only changes the running sim. The variant's params (and any preset saved from them) keep the real `numBirds`.
- **Each bird attends to at most 40 neighbours.** Without this, condensed flocks cost O(n²): 20 sims took about 44 ms per frame, and with the cap about 19 ms. Cells are scanned from a random start so the cap doesn't favour one direction.
- **Separation scales with crowding, and cohesion is a spring toward the local centre.** Normalised Reynolds forces made flocks collapse.
- **Off-screen grid cells keep simulating at 4 Hz without drawing.** If one frame's simulation work goes over 30 ms, visible sims step every other frame with double `dt`, so flock speed doesn't change.
- **Presets are full snapshots.** Validation only rewrites values that are out of range, so a saved preset loads back byte-identical. On import, values are clamped, unknown keys are dropped, invalid `algorithm`/`colorMode` values are rejected, and presets merge by `id`.
- **Working variants last for the session only.** That covers edits, duplicates and presets opened as variants. Only presets are persisted. A preset saved from a copy is credited to the default variant the copy came from, which is the one that gets the ★.
- **Reduced motion.** Playback starts paused, and the first frame is pre-simulated so it already shows flock structure.
- **V4 reuses V2's shape model instead of forking it.** The twelve squares import `flock.js`; a shape is only a set of knob values, so a fix to the morph reaches both studies. The rolls stay near the six forms rather than sampling the knob ranges flat: twelve uniform rolls are mostly blobs and folds nothing like the forms that make the model legible.
- **V4 framing is per shape, measured, not hard-coded.** `shapeExtents` samples each roll on a stand-in flock; `fitFor` subtracts the drift's reach and caps the scale. That is what keeps a blade and a bloom the same apparent size and stops a drifting shape from sliding out of its square.
- **Twelve squares share one frame budget.** 2,500 birds a square is 30,000 marks and holds 60 fps; 3,000 (36,000) already drops frames under a software canvas, so the default sits at 2,500 and the dial caps at 6,000 per square.
- **V4 saves are per square.** A shape is not a dial, so DialKit's preset store cannot hold one; `versions.js` keeps its own list with thumbnails (~3 KB each), caps it at 18, and falls back to memory when storage is full. Dials still persist through DialKit under `murmurs.v4`.
- **V2 controls are DialKit, vendored.** `npm run build` copies DialKit's self-contained vanilla ESM build and stylesheet out of `node_modules` into `murmurs/vendor/dialkit/`; nothing is resolved from `node_modules` at runtime. The panel mounts once, floating, and `player.js` maps its values onto the flock. Presets are snapped to each slider's step so a form never reads back as Custom on load.

Debug handle in the console: `murmurs.variants[i].sim`.
