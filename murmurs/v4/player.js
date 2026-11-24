import {
  createFlock, sampleFlock, FORMS, WIDTH, HEIGHT,
} from '../v2/flock.js';
import { SKIES } from '../shared/sky.js';
import { createDialKit, createDialRoot } from '../vendor/dialkit/index.js';
import {
  SLOTS, SHAPE_KNOBS, SHARED_KNOBS, DEFAULT_SHARED,
  pickSet, shapeExtents, fitFor, normalizeShape,
} from './shapes.js';
import { createVersionStore } from './versions.js';

const sheet = document.querySelector('#shapes');
const savedSection = document.querySelector('#saved');
const savedList = document.querySelector('#saved-list');
const statusLine = document.querySelector('#status');
const previewEl = document.querySelector('#preview');
const previewCanvas = document.querySelector('#preview-sky');
const previewName = document.querySelector('#preview-name');
const previewCtx = previewCanvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const query = new URLSearchParams(location.search);

// Far birds are drawn smaller and paler, nearer ones larger and darker.
const PASSES = [
  { layer: 0, ink: 0.5 },
  { layer: 1, ink: 0.8 },
  { layer: 2, ink: 1 },
];
const SHAPE_KEYS = SHAPE_KNOBS.map((knob) => knob.key);

/* ---------- DialKit panel ---------- */

const FOLDER = { Motion: 'motion', Flock: 'flock' };
// DialKit derives labels from keys, so a few params get a nicer name here.
const DIAL_KEY = { rate: 'turnRate', sway: 'drift', count: 'birds', size: 'birdSize' };
const PATHS = new Map(); // shared param -> [folder, dial key]

function buildConfig() {
  const config = {
    sky: {
      type: 'select',
      default: DEFAULT_SHARED.sky,
      options: Object.entries(SKIES).map(([value, sky]) => ({ value, label: sky.label })),
    },
  };
  for (const knob of SHARED_KNOBS) {
    const dialKey = DIAL_KEY[knob.key] ?? knob.key;
    const folder = FOLDER[knob.group];
    const group = (config[folder] ??= {});
    group[dialKey] = [DEFAULT_SHARED[knob.key], knob.min, knob.max, knob.step];
    PATHS.set(knob.key, [folder, dialKey]);
  }
  config.flock._collapsed = true;
  config.randomize = { type: 'action', label: 'Randomize shapes' };
  return config;
}

// An open panel covers a square or two, so it only starts open where there is
// room beside the sheet. DialKit's own version gallery is not used: versions
// belong to squares here.
createDialRoot({
  position: 'top-right',
  theme: 'light',
  defaultOpen: matchMedia('(min-width: 80rem)').matches,
  versions: 'menu',
});

const kit = createDialKit('Contact sheet', buildConfig(), {
  persist: { key: 'murmurs.v4', presets: false },
  onAction: (action) => {
    if (action === 'randomize') randomize();
  },
});

/* ---------- Sheet state ---------- */

const shared = { ...DEFAULT_SHARED };
const shown = { ...DEFAULT_SHARED }; // only scale eases; the rest snap
const store = createVersionStore(safeStorage());

const setSeed = initialSeed();
let clock = 0;
let running = !motion.matches;
let last = null;
let frame = null;
let dirty = true;
let skyKey = '';

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initialSeed() {
  const seed = Number(query.get('seed'));
  if (Number.isFinite(seed) && seed > 0) return Math.floor(seed) >>> 0;
  return (Math.random() * 4294967296) >>> 0;
}

function pad(slot) {
  return String(slot + 1).padStart(2, '0');
}

function labelTile(tile) {
  tile.name.textContent = pad(tile.slot);
  tile.open.setAttribute('aria-label', `Preview shape ${tile.slot + 1} of ${SLOTS}`);
  tile.button.setAttribute('aria-label', `Save version of shape ${tile.slot + 1}`);
}

function makeTile(entry) {
  const item = document.createElement('li');
  item.className = 'shape';

  const canvas = document.createElement('canvas');
  canvas.className = 'shape-sky';
  canvas.width = 320;
  canvas.height = 192;
  canvas.setAttribute('aria-hidden', 'true');

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'shape-open';
  open.setAttribute('aria-haspopup', 'dialog');
  open.append(canvas);

  const bar = document.createElement('div');
  bar.className = 'shape-bar';
  const name = document.createElement('span');
  name.className = 'shape-name';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shape-save';
  button.textContent = 'Save version';
  bar.append(name, button);
  item.append(open, bar);
  sheet.append(item);

  const tile = {
    slot: entry.slot,
    form: entry.form,
    seed: entry.seed,
    shape: entry.shape,
    shown: { ...entry.shape },
    extents: shapeExtents(entry.shape),
    fit: 1,
    shownFit: 1,
    flock: createFlock(shared.count, entry.seed),
    canvas,
    ctx: canvas.getContext('2d'),
    open,
    item,
    name,
    button,
    flashTimer: 0,
    restoreTimer: 0,
  };
  button.addEventListener('click', () => save(tile));
  open.addEventListener('click', () => showPreview(tile));
  return tile;
}

const tiles = pickSet(setSeed, SLOTS).map(makeTile);

/* ---------- Shared dials ---------- */

function sharedFrom(values) {
  const next = { ...DEFAULT_SHARED, sky: values.sky };
  for (const [param, [folder, key]] of PATHS) {
    const value = values[folder]?.[key];
    if (Number.isFinite(value)) next[param] = value;
  }
  return next;
}

function apply(next) {
  const previousCount = shared.count;
  Object.assign(shared, next);
  if (shared.count !== previousCount) {
    for (const tile of tiles) tile.flock = createFlock(shared.count, tile.seed);
  }
  refit();
  applySky();
  if (!running) snap();
  wake();
}

function refit() {
  for (const tile of tiles) tile.fit = fitFor(tile.extents, shared.sway);
}

function snap() {
  Object.assign(shown, shared);
  for (const tile of tiles) {
    Object.assign(tile.shown, tile.shape);
    tile.shownFit = tile.fit;
  }
}

function applySky() {
  if (skyKey === shared.sky) return;
  skyKey = shared.sky;
  const sky = SKIES[shared.sky] ?? SKIES.dusk;
  const root = document.documentElement.style;
  sky.stops.forEach((stop, i) => root.setProperty(`--sky-${i + 1}`, stop));
}

function announce(message) {
  statusLine.textContent = '';
  requestAnimationFrame(() => { statusLine.textContent = message; });
}

function randomize() {
  for (const entry of pickSet((Math.random() * 4294967296) >>> 0, SLOTS)) {
    const tile = tiles[entry.slot];
    tile.form = entry.form;
    tile.seed = entry.seed;
    tile.shape = entry.shape;
    tile.extents = shapeExtents(entry.shape);
    tile.flock = createFlock(shared.count, entry.seed);
    labelTile(tile);
  }
  refit();
  if (!running) snap();
  wake();
  announce(`Another set of ${SLOTS} shapes.`);
}

/* ---------- Saved versions ---------- */

function thumbnail(tile) {
  const width = 240;
  const height = Math.round((width * HEIGHT) / WIDTH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const sky = SKIES[shared.sky] ?? SKIES.dusk;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  sky.stops.forEach((stop, i) => gradient.addColorStop(i / (sky.stops.length - 1), stop));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  // The square's canvas is transparent over a CSS gradient, so the sky is
  // painted under the snapshot instead of being captured with it.
  try {
    ctx.drawImage(tile.canvas, 0, 0, width, height);
  } catch {
    return '';
  }
  return canvas.toDataURL('image/webp', 0.8);
}

function flash(tile) {
  const { button } = tile;
  button.dataset.saved = 'true';
  button.textContent = 'Saved';
  clearTimeout(tile.flashTimer);
  tile.flashTimer = setTimeout(() => {
    button.dataset.saved = 'false';
    button.textContent = 'Save version';
  }, 1400);
}

function save(tile) {
  const version = store.add({
    slot: tile.slot,
    form: tile.form,
    shape: { ...tile.shape },
    seed: tile.seed,
    thumb: thumbnail(tile),
  });
  flash(tile);
  announce(store.stored
    ? `Shape ${tile.slot + 1} saved. ${store.all().length} versions kept.`
    : `Shape ${tile.slot + 1} saved for this session only — browser storage is full.`);
  return version;
}

function restore(version) {
  const tile = tiles[version.slot];
  if (!tile) return;
  tile.form = FORMS[version.form] ? version.form : tile.form;
  tile.seed = version.seed;
  tile.shape = normalizeShape(version.shape, tile.form);
  tile.extents = shapeExtents(tile.shape);
  tile.flock = createFlock(shared.count, tile.seed);
  labelTile(tile);
  refit();
  if (!running) snap();
  wake();

  tile.item.dataset.restored = 'true';
  clearTimeout(tile.restoreTimer);
  tile.restoreTimer = setTimeout(() => { delete tile.item.dataset.restored; }, 1400);
  announce(`Shape ${version.slot + 1} restored from saved versions.`);
}

function renderVersions() {
  const versions = store.all();
  savedSection.hidden = versions.length === 0;
  savedList.replaceChildren(...versions.map((version) => {
    const item = document.createElement('li');
    item.className = 'saved-item';

    const put = document.createElement('button');
    put.type = 'button';
    put.className = 'saved-restore';
    put.title = `Put this shape back in square ${pad(version.slot)}`;
    const image = document.createElement('img');
    image.src = version.thumb;
    image.alt = '';
    const caption = document.createElement('span');
    caption.className = 'saved-caption';
    caption.textContent = pad(version.slot);
    if (version.thumb) put.append(image);
    put.append(caption);
    put.addEventListener('click', () => restore(version));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'saved-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove saved version of shape ${pad(version.slot)}`);
    remove.addEventListener('click', () => {
      const index = store.all().findIndex((saved) => saved.id === version.id);
      store.remove(version.id);
      announce('Saved version removed.');
      // Removing takes the focused button with it; land on the next version,
      // or back on the square it came from.
      const cards = [...savedList.querySelectorAll('.saved-restore')];
      (cards[index] ?? cards.at(-1) ?? tiles[version.slot]?.button)?.focus();
    });

    item.append(put, remove);
    return item;
  }));
}

/* ---------- Preview ---------- */

let previewTile = null;
let lastPreviewTile = null;

function showPreview(tile) {
  previewTile = tile;
  lastPreviewTile = tile;
  previewName.textContent = `Shape ${pad(tile.slot)}`;
  kit.setOpen(false);
  if (!previewEl.open) {
    previewEl.showModal();
    // Land on the dialog itself, not the Close button: a page of artwork
    // should not open with a focus ring on its only control.
    previewEl.focus();
  }
  wake();
}

previewEl.querySelector('.preview-close').addEventListener('click', () => previewEl.close());

// Clicking the backdrop lands on the dialog itself; clicks inside the card do not.
previewEl.addEventListener('click', (event) => {
  if (event.target === previewEl) previewEl.close();
});

previewEl.addEventListener('close', () => {
  previewTile = null;
  wake();
  lastPreviewTile?.open.focus();
});

/* ---------- Drawing ---------- */

function paint(canvas, ctx, tile, time) {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (!cssWidth || !cssHeight) return;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const params = {
    ...shared,
    ...tile.shown,
    scale: shown.scale * tile.shownFit,
  };
  const positions = sampleFlock(tile.flock, time, params);
  const birds = tile.flock.birds;
  const sx = cssWidth / WIDTH;
  const sy = cssHeight / HEIGHT;
  // Marks are sized in CSS pixels from the Bird size dial, on every canvas:
  // a 200px square would otherwise draw birds a fifth of a pixel wide.
  ctx.fillStyle = (SKIES[shared.sky] ?? SKIES.dusk).ink;
  for (const pass of PASSES) {
    const mark = shared.size * pass.ink;
    ctx.globalAlpha = shared.opacity * pass.ink;
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      if (bird.layer !== pass.layer) continue;
      ctx.fillRect(positions[i * 2] * sx, positions[i * 2 + 1] * sy, mark * 1.2, mark);
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------- Loop ---------- */

function wake() {
  dirty = true;
  ensureLoop();
}

function ensureLoop() {
  if (frame === null) frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = null;
  const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
  last = now;

  // A roll eases into place, so randomize and restore morph rather than cut.
  const ease = dt > 0 ? 1 - Math.exp(-dt / 0.22) : 0;
  let settled = true;

  for (const tile of tiles) {
    for (const key of SHAPE_KEYS) {
      const delta = tile.shape[key] - tile.shown[key];
      if (Math.abs(delta) < 0.02) {
        tile.shown[key] = tile.shape[key];
        continue;
      }
      settled = false;
      tile.shown[key] += delta * ease;
    }
    const fitDelta = tile.fit - tile.shownFit;
    if (Math.abs(fitDelta) < 0.002) {
      tile.shownFit = tile.fit;
    } else {
      settled = false;
      tile.shownFit += fitDelta * ease;
    }
  }

  const scaleDelta = shared.scale - shown.scale;
  if (Math.abs(scaleDelta) < 0.002) {
    shown.scale = shared.scale;
  } else {
    settled = false;
    shown.scale += scaleDelta * ease;
  }

  if (running) clock += dt;
  // The preview's scrim hides the sheet, so hold its squares still while it is
  // open and spend the frame on the one big canvas.
  if (!previewEl.open) {
    for (const tile of tiles) {
      paint(tile.canvas, tile.ctx, tile, running ? clock : tile.extents.time);
    }
  } else if (previewTile) {
    paint(previewCanvas, previewCtx, previewTile, running ? clock : previewTile.extents.time);
  }

  if (running || !settled || dirty) {
    dirty = false;
    ensureLoop();
  } else {
    last = null;
  }
}

/* ---------- Boot ---------- */

applySky();
refit();
snap();
for (const tile of tiles) labelTile(tile);
store.subscribe(renderVersions);
renderVersions();

if (SKIES[query.get('sky')]) kit.setValue('sky', query.get('sky'));

// DialKit's first callback can carry a snapshot from before its store
// resolved, so the panel is read again once it has mounted.
kit.subscribe((values) => apply(sharedFrom(values)));
requestAnimationFrame(() => apply(sharedFrom(kit.getValues())));

motion.addEventListener('change', ({ matches }) => {
  running = !matches;
  last = null;
  if (!running) snap();
  wake();
});

// Below the rail width the panel would sit over squares, so a persisted open
// panel folds back to its toggle when the window gets that narrow.
const wide = matchMedia('(min-width: 80rem)');
wide.addEventListener('change', ({ matches }) => {
  if (!matches) kit.setOpen(false);
});

new ResizeObserver(wake).observe(sheet);
new ResizeObserver(wake).observe(previewEl);

// A click anywhere but the panel folds it back to its toggle. Capture keeps
// this working even when a target stops propagation.
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  if (!kit.getOpen()) return;
  if (event.target instanceof Element && event.target.closest('.dialkit-root')) return;
  kit.setOpen(false);
}, true);

wake();
