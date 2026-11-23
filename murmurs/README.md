# Murmurs

- `/murmurs/` lists the studies.
- `/murmurs/v1/` is the Murmuration Explorer: 20 live flocking simulations with tunable parameters and saved presets.
- `/murmurs/v2/` is Traveling Turn: one choreographed flock. Birds circulate through a flexible sheet, and a bank rolls from one end to the other. The dark folds come from projected overlap, not extra ink or trails. This is a visual study, not a new neighbor-based flocking model.

Both run as plain ES modules with no bundler. V2's controls are [DialKit](https://github.com/joshpuckett/dialkit) via its dependency-free vanilla build, vendored into `murmurs/vendor/dialkit/` so the site stays static.

```sh
npm install     # dialkit, build-time only
npm run build   # copies the vanilla bundle into murmurs/vendor/dialkit/
npm start       # http://localhost:8000/murmurs/
npm test
```

`murmurs/vendor/dialkit/` is generated output and is committed because GitHub Pages serves the repo as-is. Re-run `npm run build` after upgrading DialKit (`npm i -D dialkit@latest`).

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

## V1: Murmuration Explorer

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
vendor/dialkit/  generated: DialKit vanilla ESM + styles (npm run build)
tests/           explorer.test.mjs (V1), traveling-turn.test.mjs (V2)
```

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
- **V2 controls are DialKit, vendored.** `npm run build` copies DialKit's self-contained vanilla ESM build and stylesheet out of `node_modules` into `murmurs/vendor/dialkit/`; nothing is resolved from `node_modules` at runtime. The panel mounts once, floating, and `player.js` maps its values onto the flock. Presets are snapped to each slider's step so a form never reads back as Custom on load.

Debug handle in the console: `murmurs.variants[i].sim`.
