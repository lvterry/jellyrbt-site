import {
  createFlock, sampleFlock, DEFAULT_PARAMS,
  FORMS, KNOBS, WIDTH, HEIGHT,
} from './flock.js';
import { SKIES } from '../shared/sky.js';
import { createDialKit, createDialRoot } from '../vendor/dialkit/index.js';

const canvas = document.querySelector('#sky');
const ctx = canvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');

// Shape and framing ease toward the knobs; motion, count and ink snap.
const MORPHED = new Set(['length', 'girth', 'roll', 'waves', 'curve', 'curl', 'twist', 'depth', 'scale']);
// Far birds are drawn smaller and paler, nearer ones larger and darker.
const PASSES = [
  { layer: 0, ink: 0.5 },
  { layer: 1, ink: 0.8 },
  { layer: 2, ink: 1 },
];

/* ---------- DialKit panel ---------- */

const FOLDER = { Shape: 'shape', Motion: 'motion', Flock: 'flock' };
// DialKit derives labels from keys, so a few params get a nicer name here.
const DIAL_KEY = { waves: 'folds', rate: 'turnRate', sway: 'drift', count: 'birds', size: 'birdSize', opacity: 'ink' };
const PATHS = new Map(); // param key -> [folder, dial key]

function buildConfig() {
  const config = {
    form: {
      type: 'select',
      default: DEFAULT_PARAMS.form,
      options: [...Object.entries(FORMS).map(([value, form]) => ({ value, label: form.label })), { value: 'custom', label: 'Custom' }],
    },
    sky: {
      type: 'select',
      default: DEFAULT_PARAMS.sky,
      options: Object.entries(SKIES).map(([value, sky]) => ({ value, label: sky.label })),
    },
  };
  for (const knob of KNOBS) {
    const dialKey = DIAL_KEY[knob.key] ?? knob.key;
    const folder = FOLDER[knob.group];
    const group = (config[folder] ??= {});
    group[dialKey] = [DEFAULT_PARAMS[knob.key], knob.min, knob.max, knob.step];
    PATHS.set(knob.key, [folder, dialKey]);
  }
  config.flock._collapsed = true;
  config.randomize = { type: 'action', label: 'Randomize shape' };
  config.reset = { type: 'action', label: 'Reset' };
  return config;
}

// On phones an open panel covers the flock, so it starts collapsed there.
createDialRoot({
  position: 'top-right',
  theme: 'light',
  defaultOpen: matchMedia('(min-width: 64rem)').matches,
});

const kit = createDialKit('Flock', buildConfig(), {
  persist: { key: 'murmurs.v2' },
  onAction: (action) => {
    if (action === 'randomize') randomize();
    else if (action === 'reset') reset();
  },
});

// Start from the documented defaults; the subscription below replaces them
// with whatever DialKit restored (kit.values is not settled at mount time).
const target = { ...DEFAULT_PARAMS };
const shown = { ...target };
let flock = createFlock(target.count);
let activeForm = null;
let syncing = false;
let skyFill = null;
let skyKey = '';
let time = 0;
let last = null;
let frame = null;
let running = !motion.matches;
let dirty = true;

function paramsFrom(values) {
  const params = { ...DEFAULT_PARAMS, form: values.form, sky: values.sky };
  for (const [param, [folder, key]] of PATHS) {
    const value = values[folder]?.[key];
    if (Number.isFinite(value)) params[param] = value;
  }
  return params;
}

// Presets are authored values; sliders quantise to a step, so snap before
// writing or the panel would immediately fall back to Custom.
function snapToStep(value, knob) {
  const steps = Math.round((value - knob.min) / knob.step);
  return Number((knob.min + steps * knob.step).toFixed(6));
}

function dialUpdates(preset) {
  const updates = {};
  for (const knob of KNOBS) {
    if (!(knob.key in preset)) continue;
    const [folder, key] = PATHS.get(knob.key);
    (updates[folder] ??= {})[key] = snapToStep(preset[knob.key], knob);
  }
  return updates;
}

function matchesPreset(values, preset) {
  for (const knob of KNOBS) {
    if (!(knob.key in preset)) continue;
    const [folder, key] = PATHS.get(knob.key);
    if (Math.abs(values[folder][key] - preset[knob.key]) > knob.step / 2 + 1e-9) return false;
  }
  return true;
}

/** Applies kept values, rebuilding the flock only when the count changed. */
function apply(next) {
  const previousCount = target.count;
  Object.assign(target, next);
  for (const key of Object.keys(next)) {
    if (!MORPHED.has(key)) shown[key] = next[key];
  }
  if (next.count !== previousCount) flock = createFlock(next.count);
  if (!running) Object.assign(shown, next);
  ensureLoop();
}

function handle(values) {
  if (syncing) return;
  if (values.form !== activeForm) {
    activeForm = values.form;
    const preset = FORMS[values.form];
    if (!preset) {
      apply(paramsFrom(values));
      return;
    }
    const updates = dialUpdates(preset);
    syncing = true;
    kit.setValues(updates);
    syncing = false;
    apply(paramsFrom({ ...values, ...updates }));
    return;
  }
  const preset = FORMS[values.form];
  if (preset && !matchesPreset(values, preset)) {
    syncing = true;
    kit.setValue('form', 'custom');
    syncing = false;
    activeForm = 'custom';
    apply(paramsFrom({ ...values, form: 'custom' }));
    return;
  }
  apply(paramsFrom(values));
}

function randomize() {
  const shape = {};
  for (const knob of KNOBS) {
    if (knob.group !== 'Shape') continue;
    const [, key] = PATHS.get(knob.key);
    const raw = knob.min + Math.random() * (knob.max - knob.min);
    shape[key] = Math.round(raw / knob.step) * knob.step;
  }
  syncing = true;
  kit.setValues({ form: 'custom', shape });
  syncing = false;
  activeForm = 'custom';
  handle(kit.getValues());
}

function reset() {
  activeForm = null;
  kit.resetValues();
}

/* ---------- URL overrides ---------- */

const query = new URLSearchParams(location.search);
if (FORMS[query.get('form')]) kit.setValue('form', query.get('form'));
if (SKIES[query.get('sky')]) kit.setValue('sky', query.get('sky'));

kit.subscribe(handle);
// DialKit's first subscription callback can carry a snapshot from before the
// store resolved, so re-read once the panel has mounted.
requestAnimationFrame(() => handle(kit.getValues()));

/* ---------- Drawing ---------- */

function skyGradient() {
  if (skyKey === target.sky && skyFill) return skyFill;
  const sky = SKIES[target.sky] ?? SKIES.dusk;
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.stops.forEach((stop, i) => gradient.addColorStop(i / (sky.stops.length - 1), stop));
  skyFill = gradient;
  skyKey = target.sky;
  return gradient;
}

function draw() {
  ctx.fillStyle = skyGradient();
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const positions = sampleFlock(flock, time, shown);
  const birds = flock.birds;
  ctx.fillStyle = (SKIES[target.sky] ?? SKIES.dusk).ink;
  // Three back-to-front passes fake aerial recession without per-bird alpha.
  for (const pass of PASSES) {
    ctx.globalAlpha = target.opacity * pass.ink;
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      if (bird.layer !== pass.layer) continue;
      const size = bird.size * target.size * pass.ink;
      ctx.fillRect(positions[i * 2], positions[i * 2 + 1], size * 1.2, size);
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------- Loop ---------- */

function ensureLoop() {
  if (frame === null) frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = null;
  const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
  last = now;

  // Knob changes ease toward the target so picking a form morphs the flock
  // instead of cutting to it.
  let settled = true;
  if (dt > 0) {
    const ease = 1 - Math.exp(-dt / 0.18);
    for (const key of MORPHED) {
      const delta = target[key] - shown[key];
      if (Math.abs(delta) < 0.01) {
        shown[key] = target[key];
      } else {
        shown[key] += delta * ease;
        settled = false;
      }
    }
  }

  if (running) time += dt;
  draw();

  if (running || !settled || dirty) {
    dirty = false;
    ensureLoop();
  } else {
    last = null;
  }
}

/* ---------- Boot ---------- */

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  dirty = true;
  ensureLoop();
}

motion.addEventListener('change', ({ matches }) => {
  running = !matches;
  last = null;
  if (!running) Object.assign(shown, target);
  ensureLoop();
});

// Without controls, reduced motion gets a still, fully formed frame instead.
if (!running) time = 8;
resize();
new ResizeObserver(resize).observe(canvas);
ensureLoop();
