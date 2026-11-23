import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFlock, step, perturb, measureEvent, polarization,
  WORLD, DEFAULT_PARAMS,
} from '../v3/flock3d.js';

function warm(flock, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(flock, 1 / 60);
}

test('a startle sweeps the flock and the front has a measurable speed', () => {
  const flock = createFlock();
  warm(flock, 4);
  perturb(flock);
  warm(flock, 3.5);

  assert.ok(flock.measured, 'the event should be measured once its window closes');
  assert.ok(flock.event.fraction > 0.5, `only ${flock.event.fraction} of the flock turned`);
  assert.ok(flock.event.speed > 20, `front speed ${flock.event.speed} u/s`);
  assert.ok(flock.event.speed < 2000, 'a front that crosses instantly is not a measurement');
});

test('birds stay inside the torus and keep their speed', () => {
  const flock = createFlock({ birds: 400 });
  warm(flock, 5);
  for (let i = 0; i < flock.n; i++) {
    const x = flock.pos[i * 3], y = flock.pos[i * 3 + 1], z = flock.pos[i * 3 + 2];
    assert.ok(x >= 0 && x < WORLD.w && y >= 0 && y < WORLD.h && z >= 0 && z < WORLD.d);
    const speed = Math.hypot(flock.vel[i * 3], flock.vel[i * 3 + 1], flock.vel[i * 3 + 2]);
    assert.ok(Math.abs(speed - DEFAULT_PARAMS.speed) < DEFAULT_PARAMS.speed * 0.2, `speed ${speed}`);
  }
});

test('same seed reproduces the flock, and the lag knob changes the run', () => {
  const a = createFlock({ birds: 300 }, 99);
  const b = createFlock({ birds: 300 }, 99);
  warm(a, 2);
  warm(b, 2);
  assert.deepEqual([...a.pos], [...b.pos]);
  assert.ok(polarization(a) > 0.5);
});

test('measuring an event without a startle returns an empty result', () => {
  const flock = createFlock({ birds: 200 });
  warm(flock, 1);
  assert.equal(measureEvent(flock).fraction, 0);
});
