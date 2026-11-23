export const WIDTH = 960;
export const HEIGHT = 576;
const TAU = Math.PI * 2;

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function createFlock(count = 16000, seed = 2071) {
  const random = randomFrom(seed);
  const birds = Array.from({ length: count }, () => {
    const depth = (random() - 0.5) * 2;
    return {
      radius: Math.sqrt(random()),
      angle: random() * TAU,
      rate: 0.12 + 0.32 * random(),
      depth,
      layer: depth < -0.25 ? 0 : depth > 0.4 ? 2 : 1,
      size: 0.7 + 0.75 * random(),
    };
  });
  return { birds, positions: new Float32Array(count * 2) };
}

/**
 * Shape families. Picking one sets the geometry knobs; they are starting
 * points, not exclusive modes — every knob stays live afterwards.
 */
export const FORMS = {
  sheet: { label: 'Sheet', length: 182, girth: 90, roll: 1.44, waves: 1, curve: 54, curl: 23, twist: 0.4, depth: 8, rate: 1.28, scale: 0.95 },
  hook: { label: 'Hook', length: 160, girth: 92, roll: 1.9, waves: 0.6, curve: 74, curl: 44, twist: 0.1, depth: 10, rate: 1.15, scale: 0.89 },
  spiral: { label: 'Spiral', length: 200, girth: 68, roll: 1.75, waves: 2.4, curve: 66, curl: 20, twist: 1.5, depth: 8, rate: 1.9, scale: 0.9 },
  bloom: { label: 'Bloom', length: 148, girth: 106, roll: 0.95, waves: 0.9, curve: 34, curl: 48, twist: 0.6, depth: 6, rate: 1.05, scale: 0.84 },
  blade: { label: 'Blade', length: 214, girth: 56, roll: 1.5, waves: 1.15, curve: 64, curl: 30, twist: 0.3, depth: 8, rate: 1.45, scale: 0.87 },
  drift: { label: 'Loose drift', length: 224, girth: 124, roll: 0.55, waves: 0.5, curve: 32, curl: 12, twist: 0.2, depth: 6, rate: 0.8, scale: 0.88 },
};

export const SKIES = {
  dusk: { label: 'Dusk', stops: ['#7d7597', '#b58da7', '#f2b6ab', '#f4c9b1'], ink: '#2b1a2e' },
  rose: { label: 'Rose', stops: ['#8d6f92', '#c996a9', '#f3b8ae', '#fbd7c4'], ink: '#2f1c2b' },
  haze: { label: 'Haze', stops: ['#97a4b8', '#bcc2ca', '#e6d5cf', '#f3e6dc'], ink: '#252a35' },
  night: { label: 'Night', stops: ['#151a29', '#20283a', '#2d3648', '#44505f'], ink: '#d9d3cf' },
};

/** Rendering knobs are not part of the silhouette; geometry knobs are. */
export const KNOBS = [
  { key: 'length', label: 'Length', min: 110, max: 360, step: 2, group: 'Shape' },
  { key: 'girth', label: 'Girth', min: 36, max: 180, step: 1, group: 'Shape' },
  { key: 'roll', label: 'Roll', min: 0, max: 2.6, step: 0.02, group: 'Shape' },
  { key: 'waves', label: 'Folds', min: 0.2, max: 3, step: 0.05, group: 'Shape' },
  { key: 'curve', label: 'Curve', min: -140, max: 140, step: 1, group: 'Shape' },
  { key: 'curl', label: 'Curl', min: 0, max: 120, step: 1, group: 'Shape' },
  { key: 'twist', label: 'Twist', min: -2, max: 2, step: 0.02, group: 'Shape' },
  { key: 'depth', label: 'Depth', min: 0, max: 24, step: 0.5, group: 'Shape' },
  { key: 'rate', label: 'Turn rate', min: 0, max: 3, step: 0.01, group: 'Motion' },
  { key: 'sway', label: 'Drift', min: 0, max: 1.8, step: 0.02, group: 'Motion' },
  { key: 'scale', label: 'Scale', min: 0.5, max: 1.15, step: 0.01, group: 'Motion' },
  { key: 'count', label: 'Birds', min: 2000, max: 20000, step: 500, group: 'Flock' },
  { key: 'size', label: 'Bird size', min: 0.6, max: 2.2, step: 0.05, group: 'Flock' },
  { key: 'opacity', label: 'Ink', min: 0.25, max: 0.9, step: 0.01, group: 'Flock' },
];

export const DEFAULT_PARAMS = Object.freeze({
  ...FORMS.sheet,
  form: 'sheet',
  sky: 'dusk',
  count: 16000,
  size: 1.05,
  opacity: 0.45,
  sway: 1,
});

export function clampParams(params) {
  const next = { ...DEFAULT_PARAMS, ...params };
  for (const knob of KNOBS) {
    const value = Number(next[knob.key]);
    next[knob.key] = Number.isFinite(value) ? Math.min(knob.max, Math.max(knob.min, value)) : DEFAULT_PARAMS[knob.key];
  }
  if (!FORMS[next.form]) next.form = 'custom';
  if (!SKIES[next.sky]) next.sky = DEFAULT_PARAMS.sky;
  return next;
}

/**
 * Advects birds through a flexible sheet. A bank rolls along the sheet's
 * length; where it faces the camera the flock opens into a fan, where it turns
 * edge-on it projects into a narrow dark fold. Birds circulate within the sheet
 * and are never respawned, so restarts and pausing are exact.
 */
export function sampleFlock({ birds, positions }, time, params = DEFAULT_PARAMS) {
  const p = params;
  const cx = WIDTH * 0.5 + (122 * Math.sin(time * 0.29 - 0.8) + 32 * Math.sin(time * 0.13)) * p.sway;
  const cy = HEIGHT * 0.48 + 48 * Math.sin(time * 0.41 + 0.5) * p.sway;
  const heading = 0.76 * Math.sin(time * 0.34 - 0.48) + 0.28 * Math.sin(time * 0.23 + 1.1);
  const cosHeading = Math.cos(heading);
  const sinHeading = Math.sin(heading);
  const length = p.length * (1 + 0.25 * Math.sin(time * 0.52 + 0.4));
  const turn = time * p.rate + 0.42 * Math.sin(time * 0.43);
  const reverse = Math.sin(time * 0.21 + 0.5);
  const perspective = 0.52 + 0.18 * p.twist;

  for (let i = 0; i < birds.length; i++) {
    const bird = birds[i];
    const angle = bird.angle + time * bird.rate;
    const u = bird.radius * Math.cos(angle);
    const v = bird.radius * Math.sin(angle);
    const phase = turn - 3.7 * p.waves * u + 0.25 * Math.sin(time * 0.71 + u * 4);
    const bank = p.roll * Math.sin(phase);
    const width = p.girth * (1 + 0.35 * Math.sin(phase - 0.9)) + 16 * u * (p.girth / 92);
    const bend = p.curve * Math.sin(phase - 0.65) + 0.42 * p.curve * reverse * (2 * u * u - 1);
    const cross = v * width;
    // The outer lip fans away from the roll, then folds back as it passes.
    const tip = Math.max(0, v) ** 2 * (0.5 + 0.5 * Math.sin(phase - 1.5));
    const depth = bird.depth * p.depth * (1 + 0.55 * Math.cos(phase)) + perspective * cross * Math.sin(bank);
    const x = (u * length - p.curl * tip + depth * 0.55) * (1 + depth / 570);
    const y = (bend + cross * Math.cos(bank) + 1.7 * p.curl * tip + bird.depth * p.depth * 0.9) * (1 + depth / 570);
    positions[i * 2] = cx + p.scale * (x * cosHeading - y * sinHeading);
    positions[i * 2 + 1] = cy + p.scale * (x * sinHeading + y * cosHeading);
  }
  return positions;
}
