import {
  createFlock, sampleFlock, FORMS, KNOBS, DEFAULT_PARAMS, WIDTH, HEIGHT,
} from '../v2/flock.js';

/** How many shapes a sheet holds. */
export const SLOTS = 12;

/** Shape knobs are rolled per square; every other knob is shared by the sheet. */
export const SHAPE_KNOBS = KNOBS.filter((knob) => knob.group === 'Shape');

export const SHARED_KNOBS = [
  { key: 'rate', label: 'Turn rate', min: 0, max: 3, step: 0.01, group: 'Motion' },
  { key: 'sway', label: 'Drift', min: 0, max: 1.2, step: 0.02, group: 'Motion' },
  { key: 'scale', label: 'Scale', min: 0.5, max: 1.15, step: 0.01, group: 'Motion' },
  { key: 'count', label: 'Birds', min: 1000, max: 6000, step: 250, group: 'Flock' },
  { key: 'size', label: 'Bird size', min: 0.5, max: 2.2, step: 0.05, group: 'Flock' },
  { key: 'opacity', label: 'Ink', min: 0.2, max: 0.9, step: 0.01, group: 'Flock' },
];

export const DEFAULT_SHARED = Object.freeze({
  sky: 'dusk',
  rate: 1.28,
  sway: 0.6,
  scale: 0.95,
  count: 2500,
  size: 0.9,
  opacity: 0.55,
});

// sampleFlock moves the sheet's centre by at most this much at sway = 1.
// Framing has to make room for the drift, or a shape slides out of its square.
const DRIFT_X = 154;
const DRIFT_Y = 48;

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function quantize(value, knob) {
  const steps = Math.round((value - knob.min) / knob.step);
  return Number((knob.min + steps * knob.step).toFixed(6));
}

/** Clamps a stored shape back onto the model's knobs, falling back per knob. */
export function normalizeShape(shape = {}, form = 'sheet') {
  const base = FORMS[form] ?? FORMS.sheet;
  const next = {};
  for (const knob of SHAPE_KNOBS) {
    const value = Number(shape?.[knob.key]);
    const raw = Number.isFinite(value) ? value : base[knob.key];
    next[knob.key] = quantize(Math.min(knob.max, Math.max(knob.min, raw)), knob);
  }
  return next;
}

/**
 * A shape near one of V2's six forms. The jitter is deliberately small — the
 * forms are what keep a sheet readable instead of a pile of blobs — but each
 * roll gets its own reach so a set is not twelve variations of the same nudge.
 */
function jitterShape(form, random) {
  const reach = 0.06 + 0.1 * random();
  const shape = {};
  for (const knob of SHAPE_KNOBS) {
    const offset = (random() * 2 - 1) * (knob.max - knob.min) * reach;
    const raw = FORMS[form][knob.key] + offset;
    shape[knob.key] = quantize(Math.min(knob.max, Math.max(knob.min, raw)), knob);
  }
  return shape;
}

/**
 * Rolls a whole sheet from one seed. Families are dealt in shuffled passes, so
 * a set of twelve shows all six forms twice before any jitter repeats.
 */
export function pickSet(seed, slots = SLOTS) {
  const random = randomFrom(Math.floor(seed) >>> 0);
  const forms = Object.keys(FORMS);
  const order = [];
  while (order.length < slots) {
    const pass = forms.slice();
    for (let i = pass.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pass[i], pass[j]] = [pass[j], pass[i]];
    }
    order.push(...pass);
  }
  return order.slice(0, slots).map((form, slot) => ({
    slot,
    form,
    shape: jitterShape(form, random),
    seed: Math.floor(random() * 4294967296) >>> 0,
  }));
}

// Framing is measured on a stand-in flock, not the square's own birds: the
// support of the sheet is the flock's, not any one distribution's.
const PROBE = createFlock(600, 4711);
const PROBE_SAMPLES = 24;

/**
 * Half-extents of a shape in world units, with the drift taken out, plus the
 * moment in the roll where the sheet is most open — the still frame for
 * `prefers-reduced-motion`, which would otherwise catch some shapes edge-on.
 */
export function shapeExtents(shape) {
  const params = { ...DEFAULT_PARAMS, ...shape, sway: 0, scale: 1 };
  let dx = 1;
  let dy = 1;
  let best = { area: 0, time: 0 };
  for (let i = 0; i < PROBE_SAMPLES; i++) {
    const time = i * 0.95;
    let sampleX = 1;
    let sampleY = 1;
    const positions = sampleFlock(PROBE, time, params);
    for (let p = 0; p < positions.length; p += 2) {
      sampleX = Math.max(sampleX, Math.abs(positions[p] - WIDTH / 2));
      sampleY = Math.max(sampleY, Math.abs(positions[p + 1] - HEIGHT * 0.48));
    }
    dx = Math.max(dx, sampleX);
    dy = Math.max(dy, sampleY);
    const area = sampleX * sampleY;
    if (area > best.area) best = { area, time };
  }
  return { dx, dy, time: best.time };
}

/**
 * A single scale factor that keeps the shape inside its square at the current
 * drift. Fitting per shape means a 360-unit blade and a 148-unit bloom both
 * read at the same size in the sheet, instead of one being cropped.
 */
export function fitFor({ dx, dy }, sway = DEFAULT_SHARED.sway) {
  const roomX = WIDTH * 0.47 - DRIFT_X * sway;
  const roomY = HEIGHT * 0.44 - DRIFT_Y * sway;
  return Math.min(
    1,
    Math.max(0.2, roomX / dx),
    Math.max(0.2, roomY / dy),
  );
}
