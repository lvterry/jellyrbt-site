export const TAU = Math.PI * 2;
// Birds attend to a bounded number of neighbours; this also keeps dense flocks
// from becoming quadratically expensive.
export const MAX_NEIGHBORS = 40;
const SEPARATION_CAP = 4;

/**
 * Turns accumulated neighbour sums into an acceleration. Shared by boids and
 * the topological model, which differ only in how neighbours are chosen.
 *
 * - separation grows with crowding (not normalised away), so dense cores push
 *   outward harder than cohesion pulls in;
 * - cohesion is a spring toward the local centre, proportional to distance;
 * - alignment is a classic Reynolds steer toward the mean heading.
 */
export function steer(sim, p, out, vx, vy, n, sx, sy, cdx, cdy, avx, avy) {
  const { maxSpeed, maxForce, wSeparation, wAlignment, wCohesion, noise } = p;
  let ax = 0;
  let ay = 0;

  if (n > 0) {
    if (wSeparation > 0) {
      const len = Math.sqrt(sx * sx + sy * sy);
      if (len > 1e-6) {
        const strength = Math.min(len, SEPARATION_CAP) * maxForce * wSeparation;
        ax += (sx / len) * strength;
        ay += (sy / len) * strength;
      }
    }

    if (wAlignment > 0) {
      const len = Math.sqrt(avx * avx + avy * avy);
      if (len > 1e-6) {
        const desiredX = (avx / len) * maxSpeed - vx;
        const desiredY = (avy / len) * maxSpeed - vy;
        const m = Math.sqrt(desiredX * desiredX + desiredY * desiredY);
        const limit = m > maxForce ? maxForce / m : 1;
        ax += desiredX * limit * wAlignment;
        ay += desiredY * limit * wAlignment;
      }
    }

    if (wCohesion > 0) {
      const k = (maxForce * wCohesion) / p.perceptionRadius;
      ax += (cdx / n) * k;
      ay += (cdy / n) * k;
    }
  }

  if (noise > 0) {
    const angle = sim.random() * TAU;
    const strength = noise * maxForce * 2;
    ax += Math.cos(angle) * strength;
    ay += Math.sin(angle) * strength;
  }

  out[0] = ax;
  out[1] = ay;
}

/** Applies acceleration, enforces speed limits and wraps around the world. */
export function integrate(sim, p, i, ax, ay, scale) {
  const { pos, vel, width, height } = sim;
  const i2 = i * 2;
  let vx = vel[i2] + ax * scale;
  let vy = vel[i2 + 1] + ay * scale;
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > p.maxSpeed) {
    const r = p.maxSpeed / speed;
    vx *= r;
    vy *= r;
  } else if (speed < p.minSpeed) {
    if (speed > 1e-5) {
      const r = p.minSpeed / speed;
      vx *= r;
      vy *= r;
    } else {
      const angle = sim.random() * TAU;
      vx = Math.cos(angle) * p.minSpeed;
      vy = Math.sin(angle) * p.minSpeed;
    }
  }
  vel[i2] = vx;
  vel[i2 + 1] = vy;
  pos[i2] = wrap(pos[i2] + vx * scale, width);
  pos[i2 + 1] = wrap(pos[i2 + 1] + vy * scale, height);
}

export function wrap(value, size) {
  if (value < 0) value += size;
  else if (value >= size) value -= size;
  // Guard against huge steps (never expected with clamped dt).
  if (value < 0 || value >= size) value = ((value % size) + size) % size;
  return value;
}

/**
 * 0..1 local crowding: how many neighbours were seen and how close they sit
 * relative to the perception radius. Doesn't saturate at the neighbour cap.
 */
export function crowding(n, distanceSum, radius) {
  if (n === 0) return 0;
  const closeness = 1 - distanceSum / n / radius;
  const value = (n / MAX_NEIGHBORS) * closeness * 1.6;
  return value > 1 ? 1 : value;
}

export function frameScale(dt) {
  return Math.min(Math.max(dt, 0), 0.05) * 60;
}

/**
 * Classic Reynolds boids: separation, alignment and cohesion over neighbours
 * inside a perception radius and field-of-view cone.
 *
 * Accelerations are computed for every bird from the same snapshot before
 * any bird moves, so update order doesn't bias the flock.
 */
export function stepBoids(sim, dt) {
  const p = sim.params;
  const { pos, vel, align, density, grid, count, accel } = sim;
  const scale = frameScale(dt);
  if (!(scale > 0) || count === 0) return;

  const perception = p.perceptionRadius;
  const separation = p.separationRadius;
  const sep2 = separation * separation;
  const cosHalf = Math.cos((p.fovDegrees * Math.PI) / 360);
  const fovLimited = p.fovDegrees < 359.9;
  const out = sim.scratch;

  grid.rebuild(pos, count);

  // One accumulator + visitor per step (not per bird) keeps the hot loop
  // allocation-free.
  const acc = { i: -1, vx: 0, vy: 0, speed: 0, sx: 0, sy: 0, cdx: 0, cdy: 0, avx: 0, avy: 0, ux: 0, uy: 0, n: 0, dist: 0 };
  const visit = (j, dx, dy, d2) => {
    if (j === acc.i) return false;
    const d = Math.sqrt(d2);
    if (fovLimited && acc.vx * dx + acc.vy * dy < cosHalf * d * acc.speed) return false;
    const j2 = j * 2;
    acc.dist += d;
    const nvx = vel[j2];
    const nvy = vel[j2 + 1];
    acc.n++;
    acc.avx += nvx;
    acc.avy += nvy;
    acc.cdx += dx;
    acc.cdy += dy;
    const nSpeed = Math.sqrt(nvx * nvx + nvy * nvy);
    if (nSpeed > 1e-5) {
      acc.ux += nvx / nSpeed;
      acc.uy += nvy / nSpeed;
    }
    if (d2 < sep2 && d2 > 1e-6) {
      const falloff = 1 - d / separation;
      acc.sx -= (dx / d) * falloff;
      acc.sy -= (dy / d) * falloff;
    }
    return true;
  };

  for (let i = 0; i < count; i++) {
    const i2 = i * 2;
    const vx = vel[i2];
    const vy = vel[i2 + 1];
    acc.i = i;
    acc.vx = vx;
    acc.vy = vy;
    acc.speed = Math.sqrt(vx * vx + vy * vy);
    acc.sx = acc.sy = acc.cdx = acc.cdy = acc.avx = acc.avy = acc.ux = acc.uy = 0;
    acc.n = 0;
    acc.dist = 0;

    grid.forEachInRadius(pos[i2], pos[i2 + 1], perception, visit, MAX_NEIGHBORS, (sim.random() * 0x7fffffff) | 0);

    const n = acc.n;
    steer(sim, p, out, vx, vy, n, acc.sx, acc.sy, acc.cdx, acc.cdy, acc.avx, acc.avy);
    accel[i2] = out[0];
    accel[i2 + 1] = out[1];
    align[i] = n > 0 ? Math.sqrt(acc.ux * acc.ux + acc.uy * acc.uy) / n : 0;
    density[i] = crowding(n, acc.dist, perception);
  }

  for (let i = 0; i < count; i++) integrate(sim, p, i, accel[i * 2], accel[i * 2 + 1], scale);
}