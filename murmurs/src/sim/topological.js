import { frameScale, integrate, steer } from './boids.js';

/**
 * Topological flocking: each bird interacts with its k nearest neighbours
 * (found through the spatial grid, up to the perception radius) rather than
 * every bird within a metric distance. Same steering rules as boids, so the
 * difference you see is purely how neighbours are chosen.
 */
export function stepTopological(sim, dt) {
  const p = sim.params;
  const { pos, vel, align, density, grid, count, accel, nearestIndex, nearestDist, width, height } = sim;
  const scale = frameScale(dt);
  if (!(scale > 0) || count === 0) return;

  const k = Math.min(nearestIndex.length, Math.max(1, p.kNeighbors | 0));
  const perception = p.perceptionRadius;
  const separation = p.separationRadius;
  const sep2 = separation * separation;
  const cosHalf = Math.cos((p.fovDegrees * Math.PI) / 360);
  const fovLimited = p.fovDegrees < 359.9;
  const halfW = width / 2;
  const halfH = height / 2;
  const out = sim.scratch;

  grid.rebuild(pos, count);

  for (let i = 0; i < count; i++) {
    const i2 = i * 2;
    const x = pos[i2];
    const y = pos[i2 + 1];
    const vx = vel[i2];
    const vy = vel[i2 + 1];
    const speed = Math.sqrt(vx * vx + vy * vy);

    const found = grid.collectNearest(x, y, k, perception, i, nearestIndex, nearestDist);

    let sx = 0;
    let sy = 0;
    let cdx = 0;
    let cdy = 0;
    let avx = 0;
    let avy = 0;
    let ux = 0;
    let uy = 0;
    let n = 0;
    let farthest = 0;

    for (let m = 0; m < found; m++) {
      const j2 = nearestIndex[m] * 2;
      const d2 = nearestDist[m];
      let dx = pos[j2] - x;
      let dy = pos[j2 + 1] - y;
      if (dx > halfW) dx -= width;
      else if (dx < -halfW) dx += width;
      if (dy > halfH) dy -= height;
      else if (dy < -halfH) dy += height;
      if (d2 > farthest) farthest = d2;

      if (fovLimited && vx * dx + vy * dy < cosHalf * Math.sqrt(d2) * speed) continue;

      const nvx = vel[j2];
      const nvy = vel[j2 + 1];
      n++;
      avx += nvx;
      avy += nvy;
      cdx += dx;
      cdy += dy;
      const nSpeed = Math.sqrt(nvx * nvx + nvy * nvy);
      if (nSpeed > 1e-5) {
        ux += nvx / nSpeed;
        uy += nvy / nSpeed;
      }
      if (d2 < sep2 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const falloff = 1 - d / separation;
        sx -= (dx / d) * falloff;
        sy -= (dy / d) * falloff;
      }
    }

    steer(sim, p, out, vx, vy, n, sx, sy, cdx, cdy, avx, avy);
    accel[i2] = out[0];
    accel[i2 + 1] = out[1];
    align[i] = n > 0 ? Math.sqrt(ux * ux + uy * uy) / n : 0;
    // Tighter k-neighbourhoods read as denser.
    density[i] = found < k ? (found / k) * 0.3 : 1 - Math.sqrt(farthest) / perception;
  }

  for (let i = 0; i < count; i++) integrate(sim, p, i, accel[i * 2], accel[i * 2 + 1], scale);
}