// Run with: node --test murmurs/tests
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const { Simulation } = await import('../src/sim/Simulation.js');
const { DEFAULT_VARIANTS } = await import('../src/variants/defaultVariants.js');
const { PARAM_SCHEMA, PARAM_KEYS } = await import('../src/variants/paramSchema.js');
const { validateParams } = await import('../src/variants/validate.js');
const store = await import('../src/presets/presetStore.js');

test('there are 20 valid, uniquely named default variants spanning all algorithms', () => {
  assert.equal(DEFAULT_VARIANTS.length, 20);
  assert.equal(new Set(DEFAULT_VARIANTS.map((v) => v.id)).size, 20);
  for (const variant of DEFAULT_VARIANTS) {
    const result = validateParams(variant.params);
    assert.ok(result.ok, variant.id);
    assert.deepEqual(result.clamped, [], `${variant.id} has out-of-range values`);
    assert.deepEqual(Object.keys(variant.params), PARAM_KEYS);
  }
  const algorithms = new Set(DEFAULT_VARIANTS.map((v) => v.params.algorithm));
  assert.deepEqual([...algorithms].sort(), ['boids', 'topological', 'vicsek']);
  const ks = DEFAULT_VARIANTS.filter((v) => v.id.startsWith('topo-')).map((v) => v.params.kNeighbors);
  assert.deepEqual(ks, [3, 7, 12, 20]);
});

test('identical params evolve independently with separate state', () => {
  const params = DEFAULT_VARIANTS[0].params;
  const a = new Simulation({ params });
  const b = new Simulation({ params });
  assert.notEqual(a.getSeed(), b.getSeed());
  assert.notEqual(a.getPositions(), b.getPositions());
  assert.notEqual(a.grid, b.grid);
  assert.notEqual(a.random, b.random);
  for (let i = 0; i < 30; i++) {
    a.step(1 / 60);
    b.step(1 / 60);
  }
  assert.notDeepEqual(Array.from(a.getPositions().slice(0, 20)), Array.from(b.getPositions().slice(0, 20)));
});

test('same seed is deterministic', () => {
  const params = DEFAULT_VARIANTS[8].params;
  const a = new Simulation({ params, seed: 42 });
  const b = new Simulation({ params, seed: 42 });
  for (let i = 0; i < 60; i++) {
    a.step(1 / 60);
    b.step(1 / 60);
  }
  assert.deepEqual(a.getPositions(), b.getPositions());
});

test('every algorithm keeps birds finite and inside the world', () => {
  for (const variant of DEFAULT_VARIANTS) {
    const sim = new Simulation({ params: variant.params, seed: 7 });
    for (let i = 0; i < 120; i++) sim.step(1 / 60);
    const pos = sim.getPositions();
    for (let i = 0; i < sim.getCount() * 2; i += 2) {
      assert.ok(Number.isFinite(pos[i]) && Number.isFinite(pos[i + 1]), variant.id);
      assert.ok(pos[i] >= 0 && pos[i] <= sim.width && pos[i + 1] >= 0 && pos[i + 1] <= sim.height, variant.id);
    }
  }
});

function orderParameter(sim) {
  const vel = sim.getVelocities();
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < sim.getCount(); i++) {
    const vx = vel[i * 2];
    const vy = vel[i * 2 + 1];
    const s = Math.hypot(vx, vy) || 1;
    sx += vx / s;
    sy += vy / s;
  }
  return Math.hypot(sx, sy) / sim.getCount();
}

test('vicsek shows order at low noise and disorder at high noise', () => {
  const run = (id) => {
    const sim = new Simulation({ params: DEFAULT_VARIANTS.find((v) => v.id === id).params, seed: 3 });
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    return orderParameter(sim);
  };
  const ordered = run('vicsek-order');
  const disordered = run('vicsek-disorder');
  assert.ok(ordered > disordered + 0.2, `order ${ordered.toFixed(2)} vs ${disordered.toFixed(2)}`);
});

test('topological k-NN matches brute force', () => {
  const params = { ...DEFAULT_VARIANTS[9].params, numBirds: 400 };
  const sim = new Simulation({ params, seed: 11 });
  sim.grid.rebuild(sim.getPositions(), sim.getCount());
  const pos = sim.getPositions();
  const idx = new Int32Array(20);
  const dist = new Float32Array(20);
  for (let i = 0; i < 400; i++) {
    const k = 7;
    const found = sim.grid.collectNearest(pos[i * 2], pos[i * 2 + 1], k, params.perceptionRadius, i, idx, dist);
    const brute = [];
    for (let j = 0; j < sim.getCount(); j++) {
      if (j === i) continue;
      let dx = Math.abs(pos[j * 2] - pos[i * 2]);
      let dy = Math.abs(pos[j * 2 + 1] - pos[i * 2 + 1]);
      dx = Math.min(dx, sim.width - dx);
      dy = Math.min(dy, sim.height - dy);
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 <= params.perceptionRadius ** 2) brute.push(d2);
    }
    brute.sort((x, y) => x - y);
    const expected = brute.slice(0, k);
    const got = Array.from(dist.slice(0, found)).sort((x, y) => x - y);
    assert.equal(found, expected.length);
    got.forEach((d, n) => assert.ok(Math.abs(d - expected[n]) < 1e-2));
  }
});

test('live param changes keep typed arrays; structural changes reinitialise', () => {
  const sim = new Simulation({ params: DEFAULT_VARIANTS[0].params, seed: 5 });
  const positions = sim.getPositions();
  for (let i = 0; i < 10; i++) sim.step(1 / 60);
  const before = Array.from(positions.slice(0, 10));
  sim.reset({ ...sim.getParams(), wCohesion: 2.5 }, { preserve: true });
  assert.deepEqual(Array.from(positions.slice(0, 10)), before);
  sim.reset({ ...sim.getParams(), numBirds: 1500 }, { preserve: true });
  assert.equal(sim.getCount(), 1500);
  assert.equal(sim.getPositions(), positions, 'buffer reused, not reallocated');
});

test('validation clamps, drops unknown keys, rejects bad enums', () => {
  const ok = validateParams({ ...DEFAULT_VARIANTS[0].params, numBirds: 99999, noise: -1, extra: 1, kNeighbors: 4.6 });
  assert.ok(ok.ok);
  assert.equal(ok.params.numBirds, PARAM_SCHEMA.numBirds.max);
  assert.equal(ok.params.noise, 0);
  assert.equal(ok.params.kNeighbors, 5);
  assert.ok(!('extra' in ok.params));
  assert.equal(validateParams({ ...DEFAULT_VARIANTS[0].params, algorithm: 'swarm' }).ok, false);
  assert.equal(validateParams({ ...DEFAULT_VARIANTS[0].params, colorMode: 'rainbow' }).ok, false);
});

test('presets are full snapshots that round-trip byte-identically', () => {
  store.clearPresets();
  const params = { ...DEFAULT_VARIANTS[4].params, noise: 0.37, background: '#123456' };
  const saved = store.savePreset('vicsek-order', 'Mine', params);
  assert.deepEqual(Object.keys(saved.params), PARAM_KEYS);

  // Simulates a reload: read straight from serialised storage.
  const raw = JSON.parse(globalThis.localStorage.getItem(store.STORAGE_KEY));
  assert.equal(JSON.stringify(raw[0].params), JSON.stringify(params));
  const loaded = store.loadPreset(saved.id);
  assert.equal(JSON.stringify(loaded.params), JSON.stringify(params));
  assert.equal(loaded.baseVariantId, 'vicsek-order');

  store.renamePreset(saved.id, '  Renamed  ');
  assert.equal(store.loadPreset(saved.id).name, 'Renamed');
});

test('export/import merges by id and clamps', () => {
  store.clearPresets();
  const a = store.savePreset('boids-tight', 'A', DEFAULT_VARIANTS[0].params);
  const exported = JSON.parse(store.exportPresets());
  assert.equal(exported.presets.length, 1);

  exported.presets[0].name = 'A2';
  exported.presets.push({
    id: 'external',
    name: 'Out of range',
    createdAt: '2026-01-01T00:00:00.000Z',
    baseVariantId: null,
    params: { ...DEFAULT_VARIANTS[1].params, maxSpeed: 99, bogus: true },
  });
  exported.presets.push({ id: 'bad', name: 'Bad', params: { ...DEFAULT_VARIANTS[1].params, algorithm: 'nope' } });

  const result = store.importPresets(JSON.stringify(exported));
  assert.deepEqual([result.added, result.replaced, result.rejected], [1, 1, 1]);
  assert.equal(store.loadPreset(a.id).name, 'A2');
  const external = store.loadPreset('external');
  assert.equal(external.params.maxSpeed, PARAM_SCHEMA.maxSpeed.max);
  assert.ok(!('bogus' in external.params));
  assert.equal(store.importPresets('not json').rejected, 1);
  assert.ok(store.deletePreset('external'));
  assert.equal(store.listPresets().length, 1);
});

test('20 grid-capped sims step within a frame budget', () => {
  const sims = DEFAULT_VARIANTS.map(
    (v) => new Simulation({ params: { ...v.params, numBirds: Math.min(v.params.numBirds, 1000) } }),
  );
  for (const sim of sims) for (let i = 0; i < 10; i++) sim.step(1 / 60);
  const frames = 60;
  const start = performance.now();
  for (let f = 0; f < frames; f++) for (const sim of sims) sim.step(1 / 60);
  const perFrame = (performance.now() - start) / frames;
  console.log(`  20 sims: ${perFrame.toFixed(2)} ms per frame`);
  for (const v of DEFAULT_VARIANTS) {
    const sim = new Simulation({ params: v.params });
    for (let i = 0; i < 5; i++) sim.step(1 / 60);
    const t = performance.now();
    for (let i = 0; i < 20; i++) sim.step(1 / 60);
    console.log(`  ${v.id.padEnd(22)} full ${String(v.params.numBirds).padStart(4)}: ${((performance.now() - t) / 20).toFixed(2)} ms`);
  }
  assert.ok(perFrame < 33, `${perFrame.toFixed(1)} ms per frame`);
});