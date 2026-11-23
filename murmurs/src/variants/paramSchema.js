/**
 * Single source of truth for every tunable value in the explorer.
 * The parameter panel, validation and simulation all read from this.
 *
 * `default` is deliberately included even though the spec omits it: it lets
 * imports of partial or older snapshots degrade gracefully and gives duplicated
 * variants a sensible starting point.
 */
export const PARAM_SCHEMA = Object.freeze({
  algorithm: {
    type: 'enum',
    values: ['boids', 'vicsek', 'topological'],
    default: 'boids',
    label: 'Algorithm',
    group: 'flocking',
    options: [
      ['boids', 'Boids'],
      ['vicsek', 'Vicsek'],
      ['topological', 'Topological'],
    ],
  },
  numBirds: {
    type: 'int',
    min: 200,
    max: 4000,
    step: 100,
    default: 600,
    label: 'Birds',
    group: 'flocking',
  },
  perceptionRadius: {
    type: 'float',
    min: 20,
    max: 120,
    step: 1,
    default: 60,
    label: 'Perception radius',
    group: 'flocking',
  },
  separationRadius: {
    type: 'float',
    min: 5,
    max: 40,
    step: 1,
    default: 18,
    label: 'Separation radius',
    group: 'flocking',
  },
  kNeighbors: {
    type: 'int',
    min: 3,
    max: 20,
    step: 1,
    default: 7,
    label: 'Neighbours (k)',
    group: 'flocking',
    hint: 'Topological algorithm only',
  },
  wSeparation: {
    type: 'float',
    min: 0,
    max: 3,
    step: 0.1,
    default: 1.4,
    label: 'Separation weight',
    group: 'flocking',
  },
  wAlignment: {
    type: 'float',
    min: 0,
    max: 3,
    step: 0.1,
    default: 1.2,
    label: 'Alignment weight',
    group: 'flocking',
  },
  wCohesion: {
    type: 'float',
    min: 0,
    max: 3,
    step: 0.1,
    default: 1.0,
    label: 'Cohesion weight',
    group: 'flocking',
  },
  minSpeed: {
    type: 'float',
    min: 0.5,
    max: 4,
    step: 0.1,
    default: 1.5,
    label: 'Minimum speed',
    group: 'flocking',
  },
  maxSpeed: {
    type: 'float',
    min: 1,
    max: 8,
    step: 0.1,
    default: 4.0,
    label: 'Maximum speed',
    group: 'flocking',
  },
  maxForce: {
    type: 'float',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    default: 0.12,
    label: 'Steering force',
    group: 'flocking',
  },
  noise: {
    type: 'float',
    min: 0,
    max: 0.5,
    step: 0.01,
    default: 0.02,
    label: 'Noise',
    group: 'flocking',
  },
  fovDegrees: {
    type: 'float',
    min: 90,
    max: 360,
    step: 5,
    default: 300,
    label: 'Field of view',
    group: 'flocking',
  },
  trailFade: {
    type: 'float',
    min: 0,
    max: 0.5,
    step: 0.01,
    default: 0.06,
    label: 'Trail fade',
    group: 'visual',
  },
  birdSize: {
    type: 'float',
    min: 1,
    max: 4,
    step: 0.5,
    default: 1.5,
    label: 'Bird size',
    group: 'visual',
  },
  colorMode: {
    type: 'enum',
    values: ['mono', 'bySpeed', 'byAlignment', 'byDensity'],
    default: 'mono',
    label: 'Color mode',
    group: 'visual',
    options: [
      ['mono', 'Monochrome'],
      ['bySpeed', 'By speed'],
      ['byAlignment', 'By alignment'],
      ['byDensity', 'By density'],
    ],
  },
  background: {
    type: 'color',
    default: '#06090f',
    label: 'Background',
    group: 'visual',
  },
});

export const PARAM_KEYS = Object.freeze(Object.keys(PARAM_SCHEMA));

export const PARAM_GROUPS = Object.freeze([
  { id: 'flocking', label: 'Flocking' },
  { id: 'visual', label: 'Visual' },
]);

/** A fresh, fully populated params object using schema defaults. */
export function defaultParams() {
  const params = {};
  for (const key of PARAM_KEYS) params[key] = PARAM_SCHEMA[key].default;
  return params;
}