import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlock, sampleFlock, FORMS, WIDTH, HEIGHT } from '../v2/flock.js';
import {
  SLOTS, SHAPE_KNOBS, SHARED_KNOBS, DEFAULT_SHARED,
  pickSet, normalizeShape, shapeExtents, fitFor,
} from '../v4/shapes.js';
import { createVersionStore, LIMIT } from '../v4/versions.js';

function fakeStorage(quota = Infinity, seed = null) {
  const data = new Map(seed ? Object.entries(seed) : []);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > quota) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    data,
  };
}

function onStep(value, knob) {
  const steps = (value - knob.min) / knob.step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

test('a seeded roll fills every square with a shape on the model knobs', () => {
  const set = pickSet(1234);
  assert.equal(set.length, SLOTS);
  assert.deepEqual(set.map((entry) => entry.slot), Array.from({ length: SLOTS }, (_, i) => i));

  for (const entry of set) {
    assert.ok(FORMS[entry.form], `unknown form ${entry.form}`);
    assert.ok(Number.isInteger(entry.seed) && entry.seed >= 0);
    for (const knob of SHAPE_KNOBS) {
      const value = entry.shape[knob.key];
      assert.ok(Number.isFinite(value), `${knob.key} missing`);
      assert.ok(value >= knob.min && value <= knob.max, `${knob.key} ${value}`);
      assert.ok(onStep(value, knob), `${knob.key} ${value} is off its step`);
    }
  }

  // One seed is one sheet; another seed is another sheet.
  assert.deepEqual(pickSet(1234), set);
  assert.notDeepEqual(pickSet(99), set);

  // Ten rolls show the whole family shelf before any form repeats.
  assert.ok(new Set(set.map((entry) => entry.form)).size >= Object.keys(FORMS).length);

  for (const knob of SHARED_KNOBS) {
    const value = DEFAULT_SHARED[knob.key];
    assert.ok(value >= knob.min && value <= knob.max, `${knob.key} default ${value}`);
    assert.ok(onStep(value, knob), `${knob.key} default ${value} is off its step`);
  }
});

test('every roll stays inside its square at the full drift range', () => {
  // One seed is ten families and ten jitters; more seeds only buy CI time.
  for (const seed of [1234]) {
    for (const entry of pickSet(seed)) {
      const extents = shapeExtents(entry.shape);
      assert.ok(extents.time >= 0 && extents.time < 24, 'still frame inside the probe window');
      for (const sway of [0, DEFAULT_SHARED.sway, 1.2]) {
        const params = {
          ...DEFAULT_SHARED,
          ...entry.shape,
          sway,
          scale: fitFor(extents, sway),
        };
        const flock = createFlock(250, entry.seed);
        for (let t = 0; t < 24; t += 6) {
          const positions = sampleFlock(flock, t, params);
          for (let p = 0; p < positions.length; p += 2) {
            const x = positions[p];
            const y = positions[p + 1];
            assert.ok(x > 0.5 && x < WIDTH - 0.5, `x ${x} at sway ${sway} (seed ${seed}, slot ${entry.slot})`);
            assert.ok(y > 0.5 && y < HEIGHT - 0.5, `y ${y} at sway ${sway} (seed ${seed}, slot ${entry.slot})`);
          }
        }
      }
    }
  }
});

test('a stored shape is clamped back onto the knobs', () => {
  const shape = normalizeShape({ length: 9999, girth: -5, roll: 'nope', waves: 1 }, 'sheet');
  assert.equal(shape.length, 360);
  assert.equal(shape.girth, 36);
  assert.equal(shape.roll, FORMS.sheet.roll);
  assert.equal(shape.waves, 1);
  for (const knob of SHAPE_KNOBS) {
    assert.ok(shape[knob.key] >= knob.min && shape[knob.key] <= knob.max);
    assert.ok(Number.isFinite(shape[knob.key]));
  }

  const unknown = normalizeShape({}, 'unicorn');
  assert.equal(unknown.length, FORMS.sheet.length);
  assert.equal(unknown.curl, FORMS.sheet.curl);
});

test('versions survive a reload, newest first, and fall off past the limit', () => {
  const storage = fakeStorage();
  const store = createVersionStore(storage);
  assert.equal(store.all().length, 0);
  assert.equal(store.stored, true);

  const first = store.add({ slot: 2, form: 'hook', shape: { length: 160 }, seed: 7, thumb: 'a' });
  const second = store.add({ slot: 9, form: 'blade', shape: { length: 214 }, seed: 8, thumb: 'b' });
  assert.notEqual(first.id, second.id);
  assert.deepEqual(store.all().map((version) => version.id), [second.id, first.id]);

  const reloaded = createVersionStore(storage);
  assert.deepEqual(reloaded.all().map((version) => version.id), [second.id, first.id]);
  assert.deepEqual(reloaded.all()[0].shape, { length: 214 });

  assert.equal(reloaded.remove(first.id), true);
  assert.equal(reloaded.remove(first.id), false);
  assert.deepEqual(reloaded.all().map((version) => version.id), [second.id]);
  assert.deepEqual(createVersionStore(storage).all().map((version) => version.id), [second.id]);

  for (let i = 0; i < LIMIT + 4; i++) {
    reloaded.add({ slot: i % SLOTS, form: 'sheet', shape: {}, seed: i, thumb: `${i}` });
  }
  assert.equal(reloaded.all().length, LIMIT);
  assert.equal(reloaded.all()[0].thumb, String(LIMIT + 3));
});

test('storage that is full or broken still keeps versions for the session', () => {
  const full = createVersionStore(fakeStorage(1));
  full.add({ slot: 0, form: 'sheet', shape: {}, seed: 1, thumb: 'x' });
  assert.equal(full.stored, false);
  assert.equal(full.all().length, 1, 'the newest version is kept in memory');

  const junk = fakeStorage(Infinity, { 'murmurs.v4.versions': '[{"nope":true}]' });
  assert.deepEqual(createVersionStore(junk).all(), []);

  const nullStorage = createVersionStore(null);
  nullStorage.add({ slot: 1, form: 'hook', shape: {}, seed: 2, thumb: 'y' });
  assert.equal(nullStorage.stored, false);
  assert.equal(nullStorage.all().length, 1);
});

test('a quota-limited store drops the oldest versions to keep the newest', () => {
  const storage = fakeStorage(1400);
  const store = createVersionStore(storage);
  const thumbFor = (i) => String(i).padStart(2, '0').repeat(60);
  for (let i = 0; i < 12; i++) {
    store.add({ slot: i % SLOTS, form: 'sheet', shape: { length: 150 + i }, seed: i, thumb: thumbFor(i) });
  }
  assert.equal(store.stored, true);
  const kept = store.all();
  assert.ok(kept.length < 12 && kept.length > 1, `kept ${kept.length}`);
  assert.equal(kept[0].thumb, thumbFor(11), 'newest survives');
  assert.ok(kept.every((version) => version.thumb.length === 120));
});
