import {
  createFlock, step, setParams, perturb, polarization,
  DEFAULT_PARAMS, WORLD,
} from './flock3d.js';
import { SKIES } from '../shared/sky.js';
import { createDialKit, createDialRoot } from '../vendor/dialkit/index.js';

const WIDTH = 960;
const HEIGHT = 576;
const canvas = document.querySelector('#sky');
const readout = document.querySelector('#readout');
const ctx = canvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');

const KNOBS = [
  { key: 'lag', label: 'Lag', min: 0, max: 300, step: 10, group: 'Response' },
  { key: 'inertia', label: 'Turn Rate', min: 0.6, max: 6, step: 0.1, group: 'Response' },
  { key: 'neighbors', label: 'Neighbours', min: 3, max: 16, step: 1, group: 'Response' },
  { key: 'perception', label: 'Perception', min: 36, max: 120, step: 2, group: 'Response' },
  { key: 'commitShare', label: 'Commit Share', min: 0, max: 0.6, step: 0.02, group: 'Response' },
  { key: 'commitTime', label: 'Commit Hold', min: 0, max: 1.5, step: 0.05, group: 'Response' },
  { key: 'startleRadius', label: 'Startle Size', min: 50, max: 240, step: 5, group: 'Startle' },
  { key: 'startleEvery', label: 'Every', min: 1.5, max: 9, step: 0.5, group: 'Startle' },
  { key: 'zoom', label: 'Zoom', min: 0.6, max: 1.8, step: 0.02, group: 'Frame' },
  { key: 'size', label: 'Bird Size', min: 0.6, max: 2.4, step: 0.05, group: 'Frame' },
  { key: 'ink', label: 'Ink', min: 0.25, max: 0.9, step: 0.01, group: 'Frame' },
  { key: 'birds', label: 'Birds', min: 600, max: 3000, step: 100, group: 'Flock' },
  { key: 'speed', label: 'Speed', min: 20, max: 80, step: 1, group: 'Flock' },
];

const FOLDER = { Response: 'response', Startle: 'startle', Frame: 'frame', Flock: 'flock' };
const DIAL_KEY = {
  startleRadius: 'startleSize', startleEvery: 'every', size: 'birdSize', ink: 'ink', birds: 'birds',
};
const PATHS = new Map();

function buildConfig() {
  const config = {
    sky: {
      type: 'select',
      default: DEFAULT_PARAMS.sky,
      options: Object.entries(SKIES).map(([value, sky]) => ({ value, label: sky.label })),
    },
  };
  for (const knob of KNOBS) {
    const key = DIAL_KEY[knob.key] ?? knob.key;
    const folder = FOLDER[knob.group];
    const group = (config[folder] ??= {});
    group[key] = [DEFAULT_PARAMS[knob.key], knob.min, knob.max, knob.step];
    PATHS.set(knob.key, [folder, key]);
  }
  config.startle = { type: 'action', label: 'Startle now' };
  config.frame._collapsed = true;
  config.flock._collapsed = true;
  return config;
}

createDialRoot({
  position: 'top-right',
  theme: 'light',
  defaultOpen: matchMedia('(min-width: 64rem)').matches,
});

const kit = createDialKit('Propagation', buildConfig(), {
  persist: { key: 'murmurs.v3' },
  onAction: (action) => {
    if (action === 'startle' && !syncing) {
      perturb(flock);
      nextStartle = flock.time + params.startleEvery;
    }
  },
});

const params = { ...DEFAULT_PARAMS };
const shown = { ...params };
let flock = createFlock(params);
let syncing = false;
let running = !motion.matches;
let nextStartle = 2.5;
let last = null;
let frame = null;
let dirty = true;
let skyFill = null;
let skyKey = '';
let focus = [...flock.centroid];
// The camera frames whatever the flock currently is, so a dispersing flock
// stays inside the canvas without hard-coding a zoom per parameter set.
let fit = 1.8;

function halfExtents() {
  let mx = 0, my = 0;
  for (let i = 0; i < flock.n; i++) {
    const i3 = i * 3;
    mx = Math.max(mx, Math.abs(torus(flock.pos[i3] - flock.centroid[0], WORLD.w)));
    my = Math.max(my, Math.abs(torus(flock.pos[i3 + 1] - flock.centroid[1], WORLD.h)));
  }
  return [mx, my];
}

function gyration() {
  const [cx, cy, cz] = flock.centroid;
  let sum = 0;
  for (let i = 0; i < flock.n; i++) {
    const i3 = i * 3;
    const dx = torus(flock.pos[i3] - cx, WORLD.w);
    const dy = torus(flock.pos[i3 + 1] - cy, WORLD.h);
    const dz = torus(flock.pos[i3 + 2] - cz, WORLD.d);
    sum += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(sum / flock.n);
}

function paramsFrom(values) {
  const next = { ...DEFAULT_PARAMS, sky: values.sky };
  for (const [param, [folder, key]] of PATHS) {
    const value = values[folder]?.[key];
    if (Number.isFinite(value)) next[param] = value;
  }
  return next;
}

function apply(next) {
  const birdsChanged = next.birds !== params.birds;
  Object.assign(params, next);
  Object.assign(shown, next);
  if (birdsChanged) focus = [WORLD.w / 2, WORLD.h / 2, WORLD.d / 2];
  setParams(flock, params);
  dirty = true;
  ensureLoop();
}

function handle(values) {
  if (syncing) return;
  apply(paramsFrom(values));
}

const query = new URLSearchParams(location.search);
if (SKIES[query.get('sky')]) kit.setValue('sky', query.get('sky'));

kit.subscribe(handle);
requestAnimationFrame(() => handle(kit.getValues()));

/* ---------- Projection ---------- */

const torus = (d, size) => (d > size / 2 ? d - size : d < -size / 2 ? d + size : d);
const screenX = new Float32Array(3000);
const screenY = new Float32Array(3000);
const screenScale = new Float32Array(3000);
const layers = [0, 1, 2];
const bands = new Uint8Array(3000);

function project() {
  const { pos, n } = flock;
  const camDist = 950;
  const focal = camDist * fit * params.zoom;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const dx = torus(pos[i3] - focus[0], WORLD.w);
    const dy = torus(pos[i3 + 1] - focus[1], WORLD.h);
    const dz = torus(pos[i3 + 2] - focus[2], WORLD.d);
    const depth = dz + camDist;
    const scale = focal / depth;
    screenX[i] = WIDTH / 2 + dx * scale;
    screenY[i] = HEIGHT / 2 + dy * scale;
    screenScale[i] = scale;
  }
}

function skyGradient() {
  if (skyKey === params.sky && skyFill) return skyFill;
  const sky = SKIES[params.sky] ?? SKIES.dusk;
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.stops.forEach((stop, i) => gradient.addColorStop(i / (sky.stops.length - 1), stop));
  skyFill = gradient;
  skyKey = params.sky;
  return gradient;
}

function draw() {
  ctx.fillStyle = skyGradient();
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  project();
  const birds = params.birds;
  ctx.fillStyle = (SKIES[params.sky] ?? SKIES.dusk).ink;
  for (let i = 0; i < birds; i++) {
    const depth = torus(flock.pos[i * 3 + 2] - focus[2], WORLD.d);
    bands[i] = depth > 18 ? 0 : depth > -18 ? 1 : 2;
  }
  // Far birds are demoted to a paler pass; near ones read as the dark core.
  // One path per band keeps the fill count at three.
  for (const layer of layers) {
    ctx.globalAlpha = params.ink * (layer === 0 ? 0.45 : layer === 1 ? 0.75 : 1);
    ctx.beginPath();
    for (let i = 0; i < birds; i++) {
      if (bands[i] !== layer) continue;
      const size = Math.max(0.6, params.size * screenScale[i] * 0.9);
      ctx.rect(screenX[i], screenY[i], size * 1.1, size);
    }
    ctx.fill();
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

  if (running) {
    step(flock, dt);
    if (flock.time > nextStartle) {
      perturb(flock);
      nextStartle = flock.time + params.startleEvery;
    }
  }

  // The camera trails the flock so a wandering flock stays framed.
  const k = running ? 1 - Math.exp(-dt * 2.2) : 1;
  for (let i = 0; i < 3; i++) focus[i] += (flock.centroid[i] - focus[i]) * k;
  // Fit every bird, not a radius estimate: a stretched or split flock would
  // otherwise put part of itself outside the canvas.
  const [halfX, halfY] = halfExtents();
  const targetFit = Math.min(4.5, Math.max(0.5, Math.min((0.46 * WIDTH) / Math.max(60, halfX), (0.46 * HEIGHT) / Math.max(40, halfY))));
  fit += (targetFit - fit) * (running ? 1 - Math.exp(-dt * 1.4) : 1);

  draw();
  updateReadout();

  if (running || dirty) {
    dirty = false;
    ensureLoop();
  } else {
    last = null;
  }
}

function updateReadout() {
  const { fraction, speed, at } = flock.event;
  const lag = `${Math.round(shown.lag)} ms lag`;
  if (at < 0) {
    readout.textContent = running
      ? `First turn in ${Math.max(0, nextStartle - flock.time).toFixed(1)}s · ${lag}`
      : `${Math.round(polarization(flock) * 100)}% aligned · ${lag}`;
    return;
  }
  if (flock.time - at < 2.9) {
    readout.textContent = `Turn sweeping… · ${lag}`;
    return;
  }
  const crossing = flock.event.spread > 0 ? ` over ${flock.event.spread.toFixed(1)}s` : '';
  const front = speed > 0 ? ` · front ${speed} u/s` : '';
  readout.textContent = `Last turn: ${Math.round(fraction * 100)}% of the flock${crossing}${front} · ${lag}`;
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
  ensureLoop();
});

resize();
new ResizeObserver(resize).observe(canvas);
fit = Math.min(4.5, Math.max(0.5, Math.min((0.46 * WIDTH) / 240, (0.46 * HEIGHT) / 150)));
ensureLoop();
