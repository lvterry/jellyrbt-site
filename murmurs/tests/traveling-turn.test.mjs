import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFlock, sampleFlock, clampParams, DEFAULT_PARAMS, FORMS, KNOBS, WIDTH, HEIGHT,
} from '../v2/flock.js';

function aspect(positions) {
  let x = 0, y = 0, xx = 0, yy = 0, xy = 0;
  const n = positions.length / 2;
  for (let i = 0; i < positions.length; i += 2) {
    const a = positions[i], b = positions[i + 1];
    x += a; y += b;
    xx += a * a; yy += b * b; xy += a * b;
  }
  const vx = xx / n - (x / n) ** 2;
  const vy = yy / n - (y / n) ** 2;
  const covariance = xy / n - x * y / n ** 2;
  const spread = Math.hypot(vx - vy, 2 * covariance);
  return Math.sqrt((vx + vy + spread) / (vx + vy - spread));
}

test('the flock changes aspect after warm-up, independent of heading and position', () => {
  const flock = createFlock();
  for (const start of [0, 20, 60]) {
    const aspects = Array.from({ length: 20 }, (_, i) => aspect(sampleFlock(flock, start + i, DEFAULT_PARAMS)));
    assert.ok(Math.max(...aspects) / Math.min(...aspects) > 1.4);
  }
});

test('form presets give distinguishable silhouettes', () => {
  const flock = createFlock();
  const shapes = Object.values(FORMS).map((preset) => {
    const params = { ...DEFAULT_PARAMS, ...preset };
    const aspects = Array.from({ length: 12 }, (_, i) => aspect(sampleFlock(flock, i, params)));
    return aspects.reduce((a, b) => a + b, 0) / aspects.length;
  });
  assert.ok(Math.max(...shapes) / Math.min(...shapes) > 1.6);
});

test('the flock stays framed without wrapping and restart reproduces the first frame', () => {
  const flock = createFlock();
  const first = sampleFlock(flock, 0, DEFAULT_PARAMS).slice();
  for (let t = 0; t <= 120; t += 0.25) {
    const positions = sampleFlock(flock, t, DEFAULT_PARAMS);
    for (let i = 0; i < positions.length; i += 2) {
      assert.ok(positions[i] > 4 && positions[i] < WIDTH - 4);
      assert.ok(positions[i + 1] > 4 && positions[i + 1] < HEIGHT - 4);
    }
  }
  assert.deepEqual(sampleFlock(flock, 0, DEFAULT_PARAMS), first);
});

test('clamping keeps every knob inside its range and rejects unknown forms', () => {
  const params = clampParams({ length: 9999, girth: -4, roll: 'nope', form: 'unicorn', sky: 'vaporwave' });
  assert.equal(params.length, 360);
  assert.equal(params.girth, 36);
  assert.equal(params.roll, DEFAULT_PARAMS.roll);
  assert.equal(params.form, 'custom');
  assert.equal(params.sky, DEFAULT_PARAMS.sky);
  for (const knob of KNOBS) {
    assert.ok(params[knob.key] >= knob.min && params[knob.key] <= knob.max, knob.key);
  }
});
