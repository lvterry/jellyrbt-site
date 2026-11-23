import { MAX_NEIGHBORS, crowding, frameScale, wrap } from './boids.js';

/**
 * Vicsek model: every bird moves at constant speed, takes the mean heading of
 * neighbours inside its perception radius (itself included), and adds
 * uniform angular noise of up to ±noise·π. No separation or cohesion — which
 * is exactly what makes the order/disorder transition visible as noise rises.
 */
export function stepVicsek(sim, dt) {
  const p = sim.params;
  const { pos, vel, align, density, grid, count, accel, width, height } = sim;
  const scale = frameScale(dt);
  if (!(scale > 0) || count === 0) return;

  const perception = p.perceptionRadius;
  const cosHalf = Math.cos((p.fovDegrees * Math.PI) / 360);
  const fovLimited = p.fovDegrees < 359.9;
  const speed = (p.minSpeed + p.maxSpeed) * 0.5;
  const noise = p.noise;

  grid.rebuild(pos, count);

  const acc = { i: -1, vx: 0, vy: 0, speed: 0, sumX: 0, sumY: 0, n: 0, dist: 0 };
  const visit = (j, dx, dy, d2) => {
    if (j === acc.i) return false;
    const d = Math.sqrt(d2);
    if (fovLimited && acc.vx * dx + acc.vy * dy < cosHalf * d * acc.speed) return false;
    const nvx = vel[j * 2];
    const nvy = vel[j * 2 + 1];
    const nSpeed = Math.sqrt(nvx * nvx + nvy * nvy);
    if (nSpeed < 1e-5) return false;
    acc.sumX += nvx / nSpeed;
    acc.sumY += nvy / nSpeed;
    acc.n++;
    acc.dist += d;
    return true;
  };

  // Headings are computed from one snapshot (stored in accel), then applied.
  for (let i = 0; i < count; i++) {
    const i2 = i * 2;
    const vx = vel[i2];
    const vy = vel[i2 + 1];
    const s = Math.sqrt(vx * vx + vy * vy);
    acc.i = i;
    acc.vx = vx;
    acc.vy = vy;
    acc.speed = s;
    acc.sumX = s > 1e-5 ? vx / s : 1;
    acc.sumY = s > 1e-5 ? vy / s : 0;
    acc.n = 1;
    acc.dist = 0;

    grid.forEachInRadius(pos[i2], pos[i2 + 1], perception, visit, MAX_NEIGHBORS, (sim.random() * 0x7fffffff) | 0);

    let angle = Math.atan2(acc.sumY, acc.sumX);
    if (noise > 0) angle += (sim.random() * 2 - 1) * noise * Math.PI;
    accel[i2] = Math.cos(angle) * speed;
    accel[i2 + 1] = Math.sin(angle) * speed;
    align[i] = Math.min(1, Math.sqrt(acc.sumX * acc.sumX + acc.sumY * acc.sumY) / acc.n);
    density[i] = crowding(acc.n - 1, acc.dist, perception);
  }

  for (let i = 0; i < count; i++) {
    const i2 = i * 2;
    // Turn rate is scaled by dt so the model behaves the same at any frame rate.
    const blend = Math.min(1, 0.35 * scale);
    let nvx = vel[i2] + (accel[i2] - vel[i2]) * blend;
    let nvy = vel[i2 + 1] + (accel[i2 + 1] - vel[i2 + 1]) * blend;
    const s = Math.sqrt(nvx * nvx + nvy * nvy) || 1;
    nvx = (nvx / s) * speed;
    nvy = (nvy / s) * speed;
    vel[i2] = nvx;
    vel[i2 + 1] = nvy;
    pos[i2] = wrap(pos[i2] + nvx * scale, width);
    pos[i2 + 1] = wrap(pos[i2 + 1] + nvy * scale, height);
  }
}