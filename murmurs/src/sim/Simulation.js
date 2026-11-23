import { validateParams } from '../variants/validate.js';
import { SpatialGrid } from './spatialGrid.js';
import { stepBoids } from './boids.js';
import { stepVicsek } from './vicsek.js';
import { stepTopological } from './topological.js';

export const MAX_BIRDS = 4000;
export const DEFAULT_WORLD = Object.freeze({ width: 1000, height: 700 });

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] || 1;
  }
  return (Math.random() * 0xffffffff) >>> 0 || 1;
}

/** Cell size is quantised so dragging a radius slider doesn't reallocate grids. */
function cellSizeFor(params) {
  let base = params.perceptionRadius;
  if (params.algorithm === 'topological') base = Math.min(base, 60);
  base = Math.max(20, base);
  return Math.min(120, Math.ceil(base / 20) * 20);
}

const STEPS = {
  boids: stepBoids,
  vicsek: stepVicsek,
  topological: stepTopological,
};

/**
 * Headless flocking simulation. One instance per variant, owning every typed
 * array, the spatial grid and its RNG. Rendering never mutates this object;
 * the UI talks to it through reset() and the read-only getters.
 *
 * The world is a fixed 1000x700 torus (edges wrap); canvases scale it to fit.
 */
export class Simulation {
  constructor({ params, seed = randomSeed(), width = DEFAULT_WORLD.width, height = DEFAULT_WORLD.height }) {
    this.width = width;
    this.height = height;
    this.capacity = MAX_BIRDS;
    this.pos = new Float32Array(this.capacity * 2);
    this.vel = new Float32Array(this.capacity * 2);
    this.align = new Float32Array(this.capacity);
    this.density = new Float32Array(this.capacity);
    this.accel = new Float32Array(this.capacity * 2);
    this.scratch = new Float64Array(2);
    this.grid = new SpatialGrid(width, height, this.capacity);
    this.nearestIndex = new Int32Array(20);
    this.nearestDist = new Float32Array(20);
    this.seed = 0;
    this.random = mulberry32(1);
    this.params = null;
    this.count = 0;
    this.#setSeed(seed);
    this.reset(params, { preserve: false });
  }

  #setSeed(seed) {
    this.seed = seed >>> 0 || 1;
    this.random = mulberry32(this.seed);
  }

  /**
   * Replaces the full parameter snapshot. With preserve:true, state is kept
   * when only continuous parameters changed; structural changes (algorithm or
   * bird count) always reinitialise, because old positions are meaningless.
   */
  reset(params, { preserve = false, reseed = false } = {}) {
    const result = validateParams(params);
    if (!result.ok) {
      throw new Error(`Invalid simulation params: ${result.errors.join(' ')}`);
    }

    const next = result.params;
    const structural =
      !this.params ||
      next.algorithm !== this.params.algorithm ||
      next.numBirds !== this.params.numBirds;

    this.params = next;
    this.count = Math.min(next.numBirds, this.capacity);
    this.grid.configure(cellSizeFor(next));

    if (reseed) this.#setSeed(randomSeed());

    if (!preserve || structural) this.#initialise();
    else this.#clampVelocities();

    return this;
  }

  #initialise() {
    const { pos, vel, align, density, count } = this;
    const p = this.params;
    const w = this.width;
    const h = this.height;
    const spread = p.maxSpeed - p.minSpeed;

    for (let i = 0; i < count; i++) {
      const i2 = i * 2;
      pos[i2] = this.random() * w;
      pos[i2 + 1] = this.random() * h;
      const angle = this.random() * Math.PI * 2;
      const speed = p.minSpeed + this.random() * (spread > 0 ? spread : 0);
      vel[i2] = Math.cos(angle) * speed;
      vel[i2 + 1] = Math.sin(angle) * speed;
      align[i] = 0;
      density[i] = 0;
    }
    for (let i = count; i < this.capacity; i++) {
      align[i] = 0;
      density[i] = 0;
    }
  }

  #clampVelocities() {
    const { vel, count } = this;
    const p = this.params;
    for (let i = 0; i < count; i++) {
      const i2 = i * 2;
      let vx = vel[i2];
      let vy = vel[i2 + 1];
      let speed = Math.sqrt(vx * vx + vy * vy);
      if (speed < 1e-5) {
        const angle = this.random() * Math.PI * 2;
        vx = Math.cos(angle) * p.minSpeed;
        vy = Math.sin(angle) * p.minSpeed;
        speed = p.minSpeed;
      }
      if (speed > p.maxSpeed) {
        const r = p.maxSpeed / speed;
        vx *= r;
        vy *= r;
      } else if (speed < p.minSpeed) {
        const r = p.minSpeed / speed;
        vx *= r;
        vy *= r;
      }
      vel[i2] = vx;
      vel[i2 + 1] = vy;
    }
  }

  /** Advance by dt seconds. dt is clamped so a background tab cannot explode. */
  step(dt) {
    if (this.params && this.count > 0) STEPS[this.params.algorithm](this, dt);
  }

  getCount() {
    return this.count;
  }

  /** Interleaved [x0, y0, x1, y1, ...]; read-only by contract. */
  getPositions() {
    return this.pos;
  }

  /** Interleaved velocities, same layout as positions. */
  getVelocities() {
    return this.vel;
  }

  /** Local order parameter per bird, 0..1. */
  getAlignments() {
    return this.align;
  }

  /** Neighbour count per bird, normalised to 0..1. */
  getDensities() {
    return this.density;
  }

  getParams() {
    return { ...this.params };
  }

  getSeed() {
    return this.seed;
  }
}