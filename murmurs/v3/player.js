import {
  createFlock, step, setParams, perturb, polarization, cameraGoal,
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
  { key: 'zoom', label: 'Zoom', min: 0.6, max: 1.8, step: 0.02, group: 'Frame' },
  { key: 'size', label: 'Bird Size', min: 0.6, max: 2.4, step: 0.05, group: 'Frame' },
  { key: 'ink', label: 'Ink', min: 0.25, max: 0.9, step: 0.01, group: 'Frame' },
  { key: 'birds', label: 'Birds', min: 600, max: 3000, step: 100, group: 'Flock' },
  { key: 'speed', label: 'Speed', min: 20, max: 80, step: 1, group: 'Flock' },
];

const FOLDER = { Response: 'response', Startle: 'startle', Frame: 'frame', Flock: 'flock' };
const DIAL_KEY = {
  startleRadius: 'startleSize', size: 'birdSize', ink: 'ink', birds: 'birds',
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
  config.randomize = { type: 'action', label: 'Randomize' };
  config.frame._collapsed = true;
  config.flock._collapsed = true;
  return config;
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] || 1;
  }
  return ((Math.random() * 0xffffffff) >>> 0) || 1;
}

createDialRoot({
  position: 'top-right',
  theme: 'light',
  defaultOpen: matchMedia('(min-width: 64rem)').matches,
});

const kit = createDialKit('Propagation', buildConfig(), {
  persist: { key: 'murmurs.v3' },
  onAction: (action) => {
    if (!syncing && action === 'randomize') randomize();
  },
});

const params = { ...DEFAULT_PARAMS };
const shown = { ...params };
let flock = createFlock(params, randomSeed());
let syncing = false;
let running = !motion.matches;
let last = null;
let frame = null;
let dirty = true;
let skyFill = null;
let skyKey = '';
let focus = [...flock.centroid];
// The camera frames whatever the flock currently is, so a dispersing flock
// stays inside the canvas without hard-coding a zoom per parameter set.
let fit = 1.8;

function halfExtents(center) {
  // Use a soft upper bound (mean + 2.6 * std, capped by max) so a single stray
  // bird never yanks the zoom out and makes the rest of the flock feel sluggish.
  const n = flock.n;
  let sx = 0, sy = 0, sxx = 0, syy = 0, mx = 0, my = 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const ax = Math.abs(torus(flock.pos[i3] - center[0], WORLD.w));
    const ay = Math.abs(torus(flock.pos[i3 + 1] - center[1], WORLD.h));
    sx += ax; sy += ay;
    sxx += ax * ax; syy += ay * ay;
    if (ax > mx) mx = ax;
    if (ay > my) my = ay;
  }
  const meanX = sx / n, meanY = sy / n;
  const stdX = Math.sqrt(Math.max(0, sxx / n - meanX * meanX));
  const stdY = Math.sqrt(Math.max(0, syy / n - meanY * meanY));
  return [Math.min(mx, meanX + 2.6 * stdX), Math.min(my, meanY + 2.6 * stdY)];
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

function randomize() {
  flock = createFlock(params, randomSeed());
  focus = [...flock.centroid];
  const [halfX, halfY] = halfExtents(focus);
  fit = Math.min(2.4, Math.max(0.85, Math.min((0.46 * WIDTH) / Math.max(60, halfX), (0.46 * HEIGHT) / Math.max(40, halfY))));
  dirty = true;
  ensureLoop();
}

function apply(next) {
  const birdsChanged = next.birds !== params.birds;
  Object.assign(params, next);
  Object.assign(shown, next);
  setParams(flock, params);
  if (birdsChanged) focus = [...flock.centroid];
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

const WORLD_SIZE = [WORLD.w, WORLD.h, WORLD.d];
const wrap = (v, size) => (v < 0 ? ((v % size) + size) % size : v >= size ? v % size : v);
const torus = (d, size) => (d > size / 2 ? d - size : d < -size / 2 ? d + size : d);
const screenX = new Float32Array(3000);
const screenY = new Float32Array(3000);
const screenScale = new Float32Array(3000);
// Seven depth bands across the flock's real depth spread give smooth aerial
// recession without birds popping between shades, at 7 fills per frame.
const DEPTH_BANDS = 7;
const DEPTH_RANGE = 150;
const LAYER_ALPHA = Array.from({ length: DEPTH_BANDS }, (_, i) => 0.34 + (i / (DEPTH_BANDS - 1)) * 0.66);
const bands = new Uint8Array(3000);
const goal = [0, 0, 0];
const ripples = [];
// How far a turning bird leans: lift tilts toward the turn centre by roughly
// this many units per rad/s of turn rate.
const BANK = 0.9;

function project() {
  const { pos, vel, accumulator, n } = flock;
  const lead = running ? accumulator : 0;
  const camDist = 950;
  const focal = camDist * fit * params.zoom;
  const invSpan = DEPTH_BANDS / (2 * DEPTH_RANGE);
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const dx = torus(pos[i3] + vel[i3] * lead - focus[0], WORLD.w);
    const dy = torus(pos[i3 + 1] + vel[i3 + 1] * lead - focus[1], WORLD.h);
    const dz = torus(pos[i3 + 2] + vel[i3 + 2] * lead - focus[2], WORLD.d);
    const depth = dz + camDist;
    const scale = focal / depth;
    screenX[i] = WIDTH / 2 + dx * scale;
    screenY[i] = HEIGHT / 2 + dy * scale;
    // Keep bird glyph size tied to perspective depth and user zoom, not auto-fit,
    // so birds never shrink when the flock widens during a turn.
    screenScale[i] = (camDist / depth) * params.zoom;
    const b = ((DEPTH_RANGE - dz) * invSpan) | 0;
    bands[i] = b < 0 ? 0 : b >= DEPTH_BANDS ? DEPTH_BANDS - 1 : b;
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
  // Far birds are drawn paler, near birds darker, across 7 graded bands.
  //
  // Each bird is a 4-vertex swept-wing chevron pointing along its projected
  // heading: a sharp nose leads the flight direction, swept-back wingtips open
  // wider when the bird banks its wings toward the camera, and a V-notched tail
  // makes heading unmistakable at a glance.
  const { vel, omega } = flock;
  for (let layer = 0; layer < DEPTH_BANDS; layer++) {
    ctx.globalAlpha = params.ink * LAYER_ALPHA[layer];
    ctx.beginPath();
    for (let i = 0; i < birds; i++) {
      if (bands[i] !== layer) continue;
      const i3 = i * 3;
      const v = Math.hypot(vel[i3], vel[i3 + 1], vel[i3 + 2]) || 1;
      const ux = vel[i3] / v, uy = vel[i3 + 1] / v, uz = vel[i3 + 2] / v;
      // Wing normal: world up (screen -y) made perpendicular to the heading,
      // then tilted toward the turn centre (omega x heading).
      const ox = omega[i3], oy = omega[i3 + 1], oz = omega[i3 + 2];
      const nx = uy * ux + BANK * (oy * uz - oz * uy);
      const ny = -1 + uy * uy + BANK * (oz * ux - ox * uz);
      const nz = uy * uz + BANK * (ox * uy - oy * ux);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const facing = Math.abs(nz / nl);
      const hl = Math.hypot(ux, uy);
      const ax = hl > 1e-3 ? ux / hl : 1, ay = hl > 1e-3 ? uy / hl : 0;
      const s = Math.max(0.85, params.size * screenScale[i] * 1.45);
      const nose = s * (0.5 + 1.35 * hl);
      const sweep = s * (0.35 + 0.95 * hl);
      const notch = s * (0.12 + 0.35 * hl);
      const wing = s * (0.45 + 1.25 * facing);
      const cx = screenX[i], cy = screenY[i];
      const wx = -ay * wing, wy = ax * wing;
      const sx = cx - ax * sweep, sy = cy - ay * sweep;
      ctx.moveTo(cx + ax * nose, cy + ay * nose);
      ctx.lineTo(sx + wx, sy + wy);
      ctx.lineTo(cx - ax * notch, cy - ay * notch);
      ctx.lineTo(sx - wx, sy - wy);
      ctx.closePath();
    }
    ctx.fill();
  }
  // Subtle fading ink ring where the user clicked to startle the flock.
  if (ripples.length > 0) {
    const now = performance.now();
    ctx.strokeStyle = (SKIES[params.sky] ?? SKIES.dusk).ink;
    ctx.lineWidth = 1.2;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const age = (now - r.at) / 420;
      if (age >= 1) { ripples.splice(i, 1); continue; }
      const ease = 1 - (1 - age) * (1 - age);
      ctx.globalAlpha = (1 - age) * 0.22;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4 + ease * 28, 0, Math.PI * 2);
      ctx.stroke();
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

  if (running) step(flock, dt);

  // The camera hangs between the roost and the flock and follows loosely, so
  // the flock's swoops read as motion across the sky. Shortest toroidal path
  // keeps a seam crossing from whipping the view.
  cameraGoal(flock, goal);
  const k = running ? 1 - Math.exp(-dt * 1.2) : 1;
  for (let i = 0; i < 3; i++) {
    focus[i] = wrap(focus[i] + torus(goal[i] - focus[i], WORLD_SIZE[i]) * k, WORLD_SIZE[i]);
  }
  // Fit the flock gently so brief shape changes during a turn don't pump the zoom.
  const [halfX, halfY] = halfExtents(focus);
  const targetFit = Math.min(2.4, Math.max(0.85, Math.min((0.46 * WIDTH) / Math.max(60, halfX), (0.46 * HEIGHT) / Math.max(40, halfY))));
  fit += (targetFit - fit) * (running ? 1 - Math.exp(-dt * 0.45) : 1);

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
      ? `Click the sky to startle · ${lag}`
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

function startleAt(x, y) {
  const n = flock.n;
  let anchor = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const dx = screenX[i] - x;
    const dy = screenY[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; anchor = i; }
  }
  const scale = fit * params.zoom;
  const clickWx = wrap(focus[0] + (x - WIDTH / 2) / scale, WORLD.w);
  const clickWy = wrap(focus[1] + (y - HEIGHT / 2) / scale, WORLD.h);
  perturb(flock, { anchor, awayFrom: [clickWx, clickWy, focus[2]] });
  ripples.push({ x, y, at: performance.now() });
  dirty = true;
  ensureLoop();
}

canvas.style.cursor = 'pointer';
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
  const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
  startleAt(x, y);
});

motion.addEventListener('change', ({ matches }) => {
  running = !matches;
  last = null;
  ensureLoop();
});

resize();
new ResizeObserver(resize).observe(canvas);
fit = Math.min(4.5, Math.max(0.5, Math.min((0.46 * WIDTH) / 240, (0.46 * HEIGHT) / 150)));
ensureLoop();
