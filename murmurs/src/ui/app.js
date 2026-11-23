import { Simulation } from '../sim/Simulation.js';
import { DEFAULT_VARIANTS } from '../variants/defaultVariants.js';
import { PARAM_SCHEMA } from '../variants/paramSchema.js';
import { cloneParams, validateParams } from '../variants/validate.js';
import * as store from '../presets/presetStore.js';
import { GridView } from './gridView.js';
import { SingleView } from './singleView.js';
import { ParamPanel } from './paramPanel.js';
import { PresetList } from './presetList.js';
import { confirmDialog, promptDialog } from './dialogs.js';
import { icon } from './icons.js';

// Grid previews are capped so 20 sims stay smooth; single view runs the full
// count. The cap only affects the running sim, never the stored params.
const GRID_BIRD_CAP = 1000;
const OFFSCREEN_INTERVAL = 0.25;
const SLOW_FRAME_MS = 30;

const $ = (selector) => document.querySelector(selector);

const state = {
  variants: [],
  selectedId: null,
  mode: 'grid',
  playing: true,
  presets: [],
};

let userCounter = 0;

function makeVariant({ id, name, params, source, originParams, rootId }) {
  const snapshot = cloneParams(params);
  const variant = {
    id,
    name,
    source,
    // Session copies are not persisted, so presets saved from them are
    // attributed to the default variant they descend from (for the ★ badge).
    rootId: rootId ?? id,
    originParams: cloneParams(originParams ?? params),
    params: snapshot,
    // Each variant gets its own Simulation: own typed arrays, own spatial
    // grid, own seeded RNG. Nothing is shared between variants.
    sim: null,
    full: false,
    offscreenTime: 0,
  };
  variant.sim = new Simulation({ params: simParams(variant, false) });
  return variant;
}

function simParams(variant, full) {
  if (full || variant.params.numBirds <= GRID_BIRD_CAP) return variant.params;
  return { ...variant.params, numBirds: GRID_BIRD_CAP };
}

function wantsFull(variant) {
  return state.mode === 'single' && variant.id === state.selectedId;
}

/** Push the variant's params into its sim; structural changes reinitialise. */
function syncSim(variant, { preserve = true, reseed = false } = {}) {
  const full = wantsFull(variant);
  variant.full = full;
  variant.sim.reset(simParams(variant, full), { preserve, reseed });
}

function newUserId() {
  userCounter += 1;
  return `u-${Date.now().toString(36)}-${userCounter}`;
}

function selected() {
  return state.variants.find((variant) => variant.id === state.selectedId) ?? state.variants[0];
}

function selectedIndex() {
  return state.variants.findIndex((variant) => variant.id === state.selectedId);
}

function presetCountFor(id) {
  return state.presets.filter((preset) => preset.baseVariantId === id).length;
}

function noteFor(variant) {
  const n = variant.params.numBirds;
  if (state.mode === 'single') return `${n.toLocaleString()} birds`;
  return n > GRID_BIRD_CAP
    ? `Preview at ${GRID_BIRD_CAP.toLocaleString()} of ${n.toLocaleString()} birds. Open in single view for all of them.`
    : `${n.toLocaleString()} birds`;
}

let statusTimer = 0;
function announce(message) {
  const el = $('#status');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

/* ---------- Views ---------- */

const grid = new GridView($('#grid'), { onOpen: (id) => openSingle(id) });

const single = new SingleView($('#single'), {
  onBack: () => setMode('grid'),
  onPrev: () => step(-1),
  onNext: () => step(1),
  onReseed: () => {
    const variant = selected();
    syncSim(variant, { preserve: false, reseed: true });
    single.renderer.invalidate();
    dirty = true;
  },
});

const panel = new ParamPanel($('#panel'), {
  onChange: (key, value) => updateParam(key, value),
  onSave: () => saveCurrent(),
  onReset: () => resetCurrent(),
  onDuplicate: () => duplicateCurrent(),
  onDelete: () => deleteCurrentVariant(),
});

const sidebar = new PresetList($('#sidebar-content'), {
  onSelect: (id) => select(id, { reveal: true }),
  onApplyPreset: (id) => applyPreset(id),
  onSpawnPreset: (id) => spawnPreset(id),
  onRenamePreset: (id) => renamePreset(id),
  onDeletePreset: (id) => removePreset(id),
});

function renderSidebar() {
  sidebar.render({
    variants: state.variants,
    presets: state.presets,
    selectedId: state.selectedId,
  });
}

function renderPanel() {
  const variant = selected();
  panel.render(variant, {
    isUser: variant.source === 'user',
    presetCount: presetCountFor(variant.rootId),
    note: noteFor(variant),
  });
}

function renderSingleHeader() {
  single.show(selected(), selectedIndex());
}

function refreshPresets() {
  state.presets = store.listPresets();
}

/* ---------- Selection & modes ---------- */

function select(id, { reveal = false } = {}) {
  if (!state.variants.some((variant) => variant.id === id)) return;
  const previous = selected();
  state.selectedId = id;

  if (state.mode === 'single' && previous && previous.id !== id) {
    syncSim(previous, { preserve: true });
    syncSim(selected(), { preserve: true });
    renderSingleHeader();
  }

  grid.setSelected(id);
  renderSidebar();
  renderPanel();
  if (reveal && state.mode === 'grid') grid.scrollTo(id);
  closeDrawer();
  dirty = true;
}

function openSingle(id) {
  state.selectedId = id;
  setMode('single');
}

function setMode(mode) {
  const changed = state.mode !== mode;
  state.mode = mode;
  document.body.dataset.mode = mode;
  $('#grid').hidden = mode !== 'grid';
  $('#single').hidden = mode !== 'single';
  $('#mode-grid').setAttribute('aria-pressed', String(mode === 'grid'));
  $('#mode-single').setAttribute('aria-pressed', String(mode === 'single'));

  for (const variant of state.variants) {
    if (variant.full !== wantsFull(variant)) syncSim(variant, { preserve: true });
  }

  grid.setSelected(state.selectedId);
  renderSidebar();
  renderPanel();

  if (mode === 'single') {
    renderSingleHeader();
    single.renderer.invalidate();
    if (changed) single.focusBack();
  } else if (changed) {
    for (const variant of state.variants) grid.renderer(variant.id)?.invalidate();
    requestAnimationFrame(() => {
      grid.scrollTo(state.selectedId);
      grid.focus(state.selectedId);
    });
  }
  dirty = true;
}

function step(delta) {
  const count = state.variants.length;
  const index = (selectedIndex() + delta + count) % count;
  select(state.variants[index].id);
}

function setPlaying(playing) {
  state.playing = playing;
  const button = $('#play-toggle');
  button.setAttribute('aria-pressed', String(!playing));
  button.setAttribute('aria-label', playing ? 'Pause all' : 'Play all');
  button.title = playing ? 'Pause all (Space)' : 'Play all (Space)';
  button.innerHTML = `${icon(playing ? 'pause' : 'play')}<span class="btn-label">${playing ? 'Pause' : 'Play'}</span>`;
  last = performance.now();
}

/* ---------- Params ---------- */

function updateParam(key, value) {
  const variant = selected();
  const result = validateParams({ ...variant.params, [key]: value });
  if (!result.ok) return;
  variant.params = result.params;
  syncSim(variant, { preserve: true });

  if (key === 'numBirds') panel.setNote(noteFor(variant));
  if (key === 'algorithm') {
    panel.setAlgorithm(variant.params.algorithm);
    grid.updateLabels(state.variants);
    if (state.mode === 'single') renderSingleHeader();
  }
  if (key === 'algorithm' || key === 'background') renderSidebar();
  if (key === 'background' || key === 'colorMode') {
    grid.renderer(variant.id)?.invalidate();
    single.renderer.invalidate();
  }
  dirty = true;
}

function replaceParams(variant, params) {
  variant.params = cloneParams(params);
  syncSim(variant, { preserve: false });
  grid.renderer(variant.id)?.invalidate();
  if (state.mode === 'single' && variant.id === state.selectedId) single.renderer.invalidate();
}

function resetCurrent() {
  const variant = selected();
  replaceParams(variant, variant.originParams);
  renderPanel();
  renderSidebar();
  grid.updateLabels(state.variants);
  if (state.mode === 'single') renderSingleHeader();
  announce(`Reset “${variant.name}” to its original parameters.`);
  dirty = true;
}

function insertVariant(variant, afterId) {
  const index = afterId ? state.variants.findIndex((v) => v.id === afterId) : -1;
  if (index >= 0) state.variants.splice(index + 1, 0, variant);
  else state.variants.push(variant);
  grid.sync(state.variants);
}

function duplicateCurrent() {
  const source = selected();
  const copy = makeVariant({
    id: newUserId(),
    name: `${source.name} copy`,
    params: source.params,
    source: 'user',
    rootId: source.rootId,
  });
  insertVariant(copy, source.id);
  select(copy.id, { reveal: true });
  if (state.mode === 'single') renderSingleHeader();
  announce(`Duplicated “${source.name}”. The copy runs with its own seed.`);
}

async function deleteCurrentVariant() {
  const variant = selected();
  if (variant.source !== 'user') return;
  const ok = await confirmDialog({
    title: `Delete “${variant.name}”?`,
    description: 'This removes the variant from this session. Saved presets are not affected.',
    confirmText: 'Delete variant',
    danger: true,
  });
  if (!ok) return;
  const index = state.variants.indexOf(variant);
  state.variants.splice(index, 1);
  grid.sync(state.variants);
  const next = state.variants[Math.min(index, state.variants.length - 1)];
  state.selectedId = null;
  select(next.id);
  if (state.mode === 'single') {
    syncSim(next, { preserve: true });
    renderSingleHeader();
  }
  announce(`Deleted “${variant.name}”.`);
}

/* ---------- Presets ---------- */

async function saveCurrent() {
  const variant = selected();
  // Snapshot now, not when the dialog closes, so the preset matches what was
  // on screen when the user asked to save.
  const snapshot = cloneParams(variant.params);
  const count = presetCountFor(variant.rootId);
  const name = await promptDialog({
    title: 'Save preset',
    description: 'Saves every parameter of this variant. Presets stay in this browser.',
    label: 'Preset name',
    value: count ? `${variant.name} ${count + 1}` : variant.name,
    confirmText: 'Save preset',
  });
  if (!name) return;
  const preset = store.savePreset(variant.rootId, name, snapshot);
  refreshPresets();
  renderSidebar();
  renderPanel();
  announce(`Saved preset “${preset.name}”.`);
}

function applyPreset(presetId) {
  const preset = store.loadPreset(presetId);
  if (!preset) return;
  const variant = selected();
  replaceParams(variant, preset.params);
  renderPanel();
  renderSidebar();
  grid.updateLabels(state.variants);
  if (state.mode === 'single') renderSingleHeader();
  announce(`Applied “${preset.name}” to “${variant.name}”.`);
  closeDrawer();
  dirty = true;
}

function spawnPreset(presetId) {
  const preset = store.loadPreset(presetId);
  if (!preset) return;
  const variant = makeVariant({
    id: newUserId(),
    name: preset.name,
    params: preset.params,
    source: 'user',
    rootId: preset.baseVariantId ?? undefined,
  });
  insertVariant(variant, null);
  select(variant.id, { reveal: true });
  if (state.mode === 'single') {
    syncSim(variant, { preserve: true });
    renderSingleHeader();
  }
  announce(`Opened “${preset.name}” as variant ${state.variants.length}.`);
}

async function renamePreset(presetId) {
  const preset = store.loadPreset(presetId);
  if (!preset) return;
  const name = await promptDialog({
    title: 'Rename preset',
    label: 'Preset name',
    value: preset.name,
    confirmText: 'Rename',
  });
  if (!name || name === preset.name) return;
  store.renamePreset(presetId, name);
  refreshPresets();
  renderSidebar();
  announce(`Renamed to “${name}”.`);
}

async function removePreset(presetId) {
  const preset = store.loadPreset(presetId);
  if (!preset) return;
  const ok = await confirmDialog({
    title: `Delete “${preset.name}”?`,
    description: 'The preset is removed from this browser. Export first if you want to keep a copy.',
    confirmText: 'Delete preset',
    danger: true,
  });
  if (!ok) return;
  store.deletePreset(presetId);
  refreshPresets();
  renderSidebar();
  renderPanel();
  announce(`Deleted preset “${preset.name}”.`);
}

function exportAll() {
  if (state.presets.length === 0) {
    announce('No presets to export yet. Save one first.');
    return;
  }
  const blob = new Blob([store.exportPresets()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `murmuration-presets-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Exported ${state.presets.length} preset${state.presets.length === 1 ? '' : 's'}.`);
}

async function importFile(file) {
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch {
    announce('Could not read that file.');
    return;
  }
  const result = store.importPresets(text);
  refreshPresets();
  renderSidebar();
  renderPanel();

  const parts = [];
  if (result.added) parts.push(`${result.added} added`);
  if (result.replaced) parts.push(`${result.replaced} updated`);
  if (result.rejected) parts.push(`${result.rejected} rejected`);
  if (!parts.length) parts.push('nothing to import');
  const detail = result.rejected && result.errors[0] ? ` ${result.errors[0]}` : '';
  announce(`Import: ${parts.join(', ')}.${detail}`);
}

/* ---------- Animation loop ---------- */

let last = performance.now();
let dirty = true;
let frame = 0;
let frameEma = 16;
let fpsShownAt = 0;
let stride = 1;

function tick(now) {
  const elapsed = now - last;
  last = now;
  const dt = Math.min(elapsed / 1000, 0.05);
  const playing = state.playing;
  const started = performance.now();

  if (playing || dirty) {
    if (state.mode === 'single') {
      const variant = selected();
      if (playing) variant.sim.step(dt);
      single.renderer.draw(variant.sim, variant.params);
    } else {
      state.variants.forEach((variant, index) => {
        if (grid.isVisible(variant.id)) {
          variant.offscreenTime = 0;
          // When the machine is struggling, each sim steps every other frame
          // with twice the dt, halving cost without changing flock speed.
          const due = !playing || (frame + index) % stride === 0;
          if (!due) return;
          if (playing) variant.sim.step(dt * stride);
          grid.renderer(variant.id)?.draw(variant.sim, variant.params);
        } else if (playing) {
          // Off-screen sims keep evolving at a few steps per second.
          variant.offscreenTime += dt;
          if (variant.offscreenTime >= OFFSCREEN_INTERVAL) {
            variant.sim.step(Math.min(variant.offscreenTime, 0.05));
            variant.offscreenTime = 0;
          }
        }
      });
    }
    dirty = false;
  }

  frame++;
  if (playing) {
    const work = performance.now() - started;
    frameEma += (Math.max(elapsed, work) - frameEma) * 0.05;
    if (state.mode === 'grid') {
      if (stride === 1 && work > SLOW_FRAME_MS) stride = 2;
      else if (stride === 2 && work < SLOW_FRAME_MS * 0.35) stride = 1;
    } else {
      stride = 1;
    }
    if (now - fpsShownAt > 500) {
      fpsShownAt = now;
      $('#fps').textContent = `${Math.round(1000 / frameEma)} fps`;
    }
  } else if (now - fpsShownAt > 500) {
    fpsShownAt = now;
    $('#fps').textContent = 'Paused';
  }

  requestAnimationFrame(tick);
}

/* ---------- Drawer (narrow screens) ---------- */

function closeDrawer() {
  document.body.classList.remove('drawer-open');
  $('#drawer-toggle').setAttribute('aria-expanded', 'false');
}

function toggleDrawer() {
  const open = !document.body.classList.contains('drawer-open');
  document.body.classList.toggle('drawer-open', open);
  $('#drawer-toggle').setAttribute('aria-expanded', String(open));
  if (open) sidebar.focusSelected();
}

/* ---------- Boot ---------- */

function init() {
  state.variants = DEFAULT_VARIANTS.map((variant) =>
    makeVariant({
      id: variant.id,
      name: variant.name,
      params: variant.params,
      source: 'default',
    }),
  );
  state.selectedId = state.variants[0].id;
  refreshPresets();

  grid.sync(state.variants);
  setMode('grid');

  $('#mode-grid').addEventListener('click', () => setMode('grid'));
  $('#mode-single').addEventListener('click', () => setMode('single'));
  $('#play-toggle').addEventListener('click', () => setPlaying(!state.playing));
  $('#export').addEventListener('click', exportAll);
  $('#import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    await importFile(file);
    event.target.value = '';
  });
  $('#drawer-toggle').addEventListener('click', toggleDrawer);
  $('#drawer-scrim').addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    const typing = target.closest?.('input, select, textarea');
    if (typing) return;

    if (event.key === ' ' && !target.closest?.('button, a')) {
      event.preventDefault();
      setPlaying(!state.playing);
    } else if (event.key === 'Escape') {
      if (document.body.classList.contains('drawer-open')) closeDrawer();
      else if (state.mode === 'single') setMode('grid');
    } else if (state.mode === 'single' && event.key === 'ArrowLeft') {
      step(-1);
    } else if (state.mode === 'single' && event.key === 'ArrowRight') {
      step(1);
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== store.STORAGE_KEY) return;
    refreshPresets();
    renderSidebar();
  });

  window.addEventListener('resize', () => {
    dirty = true;
  });

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  setPlaying(!reduceMotion.matches);
  if (reduceMotion.matches) {
    // Warm each flock briefly so the paused first frame shows structure.
    for (const variant of state.variants) {
      for (let i = 0; i < 90; i++) variant.sim.step(1 / 60);
    }
    announce('Motion is paused because reduced motion is on. Press Play to start.');
  }

  requestAnimationFrame((now) => {
    last = now;
    tick(now);
  });

  // Exposed for debugging and acceptance checks in the console, e.g.
  // murmurs.variants[0].sim.getSeed() !== murmurs.variants[1].sim.getSeed().
  window.murmurs = { state, store, PARAM_SCHEMA, get variants() { return state.variants; } };
}

init();