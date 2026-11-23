/**
 * V3 flock: an emergent model. Birds steer toward their neighbours' mean
 * heading, but through a first-order lag — they respond to what they saw a
 * moment ago, not instantly — and their turn rate is capped. A startle at the
 * flock's rim therefore travels outward as a front. Nothing prescribes where
 * it goes or how fast; the front is measured after the fact.
 */

export const WORLD = Object.freeze({ w: 900, h: 620, d: 420, step: 1 / 60 });

export const DEFAULT_PARAMS = Object.freeze({
  birds: 2600,
  neighbors: 8,
  perception: 55,
  separation: 12,
  speed: 38,
  inertia: 2.4,
  lag: 130,
  align: 1.3,
  cohesion: 1,
  rejoin: 1.3,
  rejoinRadius: 200,
  repel: 1.8,
  noise: 0.01,
  startleRadius: 70,
  startleAngle: 1.9,
  startleEvery: 7,
  zoom: 1,
  size: 0.8,
  ink: 0.55,
  sky: 'dusk',
});

const NEIGHBOR_LIMIT = 32;

/** Periodic 3D hash grid, rebuilt each step. */
class Grid3 {
  constructor(w, h, d, cell) {
    this.w = w;
    this.h = h;
    this.d = d;
    this.setCell(cell);
    this.items = new Int32Array(0);
  }

  setCell(cell) {
    this.cell = cell;
    this.cols = Math.max(1, Math.floor(this.w / cell));
    this.rows = Math.max(1, Math.floor(this.h / cell));
    this.lays = Math.max(1, Math.floor(this.d / cell));
    this.size = this.cols * this.rows * this.lays;
    this.cellW = this.w / this.cols;
    this.cellH = this.h / this.rows;
    this.cellD = this.d / this.lays;
    this.counts = new Int32Array(this.size);
    this.starts = new Int32Array(this.size + 1);
    this.cursor = new Int32Array(this.size);
  }

  configure(cell) {
    if (cell !== this.cell) this.setCell(cell);
  }

  index(x, y, z) {
    const cx = Math.min(this.cols - 1, Math.max(0, (x / this.cellW) | 0));
    const cy = Math.min(this.rows - 1, Math.max(0, (y / this.cellH) | 0));
    const cz = Math.min(this.lays - 1, Math.max(0, (z / this.cellD) | 0));
    return (cz * this.rows + cy) * this.cols + cx;
  }

  rebuild(pos, count) {
    if (this.items.length < count) this.items = new Int32Array(count);
    const { counts, starts, cursor, items } = this;
    counts.fill(0);
    for (let i = 0; i < count; i++) counts[this.index(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])]++;
    let sum = 0;
    for (let c = 0; c < this.size; c++) {
      starts[c] = sum;
      cursor[c] = sum;
      sum += counts[c];
    }
    starts[this.size] = sum;
    for (let i = 0; i < count; i++) items[cursor[this.index(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])]++] = i;
  }
}

const wrap = (v, size) => (v < 0 ? ((v % size) + size) % size : v >= size ? v % size : v);
const torusMinus = (a, b, size) => {
  let d = a - b;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
};
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function createFlock(params = DEFAULT_PARAMS, seed = 20261) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const random = rng(seed);
  const n = p.birds;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const flock = {
    params: p,
    seed,
    random,
    n,
    pos,
    vel,
    target: new Float32Array(n * 3),
    accel: new Float32Array(n * 3),
    ref: new Float32Array(n * 3),
    onset: new Float32Array(n).fill(-1),
    dist: new Float32Array(n),
    grid: new Grid3(WORLD.w, WORLD.h, WORLD.d, Math.max(30, p.perception)),
    accumulator: 0,
    time: 0,
    centroid: [WORLD.w / 2, WORLD.h / 2, WORLD.d / 2],
    startleAt: -1,
    measured: false,
    event: { fraction: 0, speed: 0, onset: 0, at: -1 },
    neighborIndex: new Int32Array(NEIGHBOR_LIMIT),
    neighborDist: new Float32Array(NEIGHBOR_LIMIT),
    unit: new Float32Array(n * 3),
    axis: new Float64Array(3),
  };

  // Start as an elongated, thin flock so a turn has a long axis to travel.
  const heading = 0.4;
  const cosH = Math.cos(heading), sinH = Math.sin(heading);
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const gx = (random() - 0.5) * 480;
    const gy = (random() - 0.5) * 240 * (1 - Math.abs(gx) / 340);
    pos[i3] = wrap(WORLD.w / 2 + gx * cosH - gy * sinH, WORLD.w);
    pos[i3 + 1] = wrap(WORLD.h / 2 + gx * sinH + gy * cosH, WORLD.h);
    pos[i3 + 2] = wrap(WORLD.d / 2 + (random() - 0.5) * 46, WORLD.d);
    const a = heading + (random() - 0.5) * 0.12;
    const s = p.speed * (0.85 + random() * 0.3);
    vel[i3] = Math.cos(a) * s;
    vel[i3 + 1] = Math.sin(a) * s;
    vel[i3 + 2] = (random() - 0.5) * 0.12 * s;
    flock.target[i3] = Math.cos(a);
    flock.target[i3 + 1] = Math.sin(a);
  }
  return flock;
}

// Circular mean per axis. An arithmetic mean on a torus jumps to the far side
// of the world the moment the flock straddles a seam, which made the camera
// lurch and left birds outside the frame.
function centroidOf(flock) {
  const { pos, n, centroid } = flock;
  const twoPi = Math.PI * 2;
  let sx = 0, sy = 0, sz = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const ax = (pos[i * 3] / WORLD.w) * twoPi;
    const ay = (pos[i * 3 + 1] / WORLD.h) * twoPi;
    const az = (pos[i * 3 + 2] / WORLD.d) * twoPi;
    sx += Math.sin(ax); cx += Math.cos(ax);
    sy += Math.sin(ay); cy += Math.cos(ay);
    sz += Math.sin(az); cz += Math.cos(az);
  }
  centroid[0] = ((Math.atan2(sx, cx) + twoPi) % twoPi) / twoPi * WORLD.w;
  centroid[1] = ((Math.atan2(sy, cy) + twoPi) % twoPi) / twoPi * WORLD.h;
  centroid[2] = ((Math.atan2(sz, cz) + twoPi) % twoPi) / twoPi * WORLD.d;
}

/**
 * Nearest `neighbors` birds, searched in expanding shells of grid cells.
 * The link is topological — k nearest within a generous cap — so a stretched
 * flock stays one connected network instead of shearing into sub-flocks that
 * can never see each other again.
 */
function gather(flock, i) {
  const { pos, grid, params, neighborIndex, neighborDist } = flock;
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const k = params.neighbors;
  const reach = params.perception * 4;
  const reach2 = reach * reach;
  const halfW = WORLD.w / 2, halfH = WORLD.h / 2, halfD = WORLD.d / 2;
  const maxSpan = Math.max(grid.cols, grid.rows, grid.lays);
  const baseX = Math.floor(x / grid.cellW), baseY = Math.floor(y / grid.cellH), baseZ = Math.floor(z / grid.cellD);
  let found = 0;

  const enough = Math.min(NEIGHBOR_LIMIT, k * 2);

  for (let span = 1; span <= Math.min(maxSpan, 6); span++) {
    for (let oz = -span; oz <= span; oz++) {
      const edgeZ = Math.abs(oz) === span;
      const gz = (((baseZ + oz) % grid.lays) + grid.lays) % grid.lays;
      for (let oy = -span; oy <= span; oy++) {
        const edgeY = Math.abs(oy) === span;
        const gy = (((baseY + oy) % grid.rows) + grid.rows) % grid.rows;
        for (let ox = -span; ox <= span; ox++) {
          if (!edgeZ && !edgeY && Math.abs(ox) !== span) continue;
          const gx = (((baseX + ox) % grid.cols) + grid.cols) % grid.cols;
          const cell = (gz * grid.rows + gy) * grid.cols + gx;
          const end = grid.starts[cell + 1];
          for (let s = grid.starts[cell]; s < end; s++) {
            const j = grid.items[s];
            if (j === i) continue;
            let dx = pos[j * 3] - x;
            let dy = pos[j * 3 + 1] - y;
            let dz = pos[j * 3 + 2] - z;
            if (dx > halfW) dx -= WORLD.w; else if (dx < -halfW) dx += WORLD.w;
            if (dy > halfH) dy -= WORLD.h; else if (dy < -halfH) dy += WORLD.h;
            if (dz > halfD) dz -= WORLD.d; else if (dz < -halfD) dz += WORLD.d;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > reach2) continue;
            if (found === NEIGHBOR_LIMIT && d2 >= neighborDist[found - 1]) continue;
            let at = found < NEIGHBOR_LIMIT ? found++ : NEIGHBOR_LIMIT - 1;
            while (at > 0 && neighborDist[at - 1] > d2) {
              neighborDist[at] = neighborDist[at - 1];
              neighborIndex[at] = neighborIndex[at - 1];
              at--;
            }
            neighborDist[at] = d2;
            neighborIndex[at] = j;
            // A handful of candidates is enough to pick k from, and short
            // circuits the scan in a dense flock.
            if (found >= enough) return k;
          }
        }
      }
    }
    if (found >= k) break;
  }
  return Math.min(found, k);
}

function substep(flock, dt) {
  const { pos, vel, target, accel, unit, params, n } = flock;
  const p = params;
  const step = WORLD.step;
  const halfW = WORLD.w / 2, halfH = WORLD.h / 2, halfD = WORLD.d / 2;
  flock.grid.rebuild(pos, n);
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const v = len3(vel[i3], vel[i3 + 1], vel[i3 + 2]) || 1;
    unit[i3] = vel[i3] / v;
    unit[i3 + 1] = vel[i3 + 1] / v;
    unit[i3 + 2] = vel[i3 + 2] / v;
  }

  const turn = p.inertia * dt;
  const blend = 1 - Math.exp(-dt / Math.max(0.001, p.lag / 1000));

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
    let ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, sx = 0, sy = 0, sz = 0;
    const count = gather(flock, i);

    if (count > 0) {
      for (let m = 0; m < count; m++) {
        const j = flock.neighborIndex[m];
        const j3 = j * 3;
        ax += unit[j3];
        ay += unit[j3 + 1];
        az += unit[j3 + 2];
        let dx = pos[j3] - x, dy = pos[j3 + 1] - y, dz = pos[j3 + 2] - z;
        if (dx > halfW) dx -= WORLD.w; else if (dx < -halfW) dx += WORLD.w;
        if (dy > halfH) dy -= WORLD.h; else if (dy < -halfH) dy += WORLD.h;
        if (dz > halfD) dz -= WORLD.d; else if (dz < -halfD) dz += WORLD.d;
        cx += dx;
        cy += dy;
        cz += dz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < p.separation * p.separation && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const f = (1 - d / p.separation) / d;
          sx -= dx * f;
          sy -= dy * f;
          sz -= dz * f;
        }
      }
      // Each term is bounded before it is summed: unbounded cohesion or
      // separation flings birds out of the flock once a turn stretches it.
      // Stray birds steer back toward the flock's centre. Without this a
      // strong startle can hand a patch to a different heading for good,
      // because topological neighbours alone cannot pull a broken group back.
      const [fx, fy, fz] = flock.centroid;
      const rdx = torusMinus(x, fx, WORLD.w);
      const rdy = torusMinus(y, fy, WORLD.h);
      const rdz = torusMinus(z, fz, WORLD.d);
      const rd = len3(rdx, rdy, rdz);
      if (rd > p.rejoinRadius) {
        const pull = p.rejoin * Math.min(1, (rd - p.rejoinRadius) / p.rejoinRadius);
        ax -= (rdx / rd) * pull;
        ay -= (rdy / rd) * pull;
        az -= (rdz / rd) * pull;
      }

      const al = len3(ax, ay, az) || 1;
      const cl = len3(cx, cy, cz) || 1;
      const closeness = Math.min(1, cl / count / p.perception);
      const sl = len3(sx, sy, sz);
      const sepScale = sl > 1 ? p.repel / sl : p.repel;
      ax = (ax / al) * p.align + (cx / cl) * p.cohesion * closeness + sx * sepScale;
      ay = (ay / al) * p.align + (cy / cl) * p.cohesion * closeness + sy * sepScale;
      az = (az / al) * p.align + (cz / cl) * p.cohesion * closeness + sz * sepScale;
    }

    const fl = len3(ax, ay, az) || 1;
    // The lag: the steering target is a first-order follower of what the bird
    // currently sees, so a neighbour's turn reaches this bird late.
    target[i3] += (ax / fl - target[i3]) * blend;
    target[i3 + 1] += (ay / fl - target[i3 + 1]) * blend;
    target[i3 + 2] += (az / fl - target[i3 + 2]) * blend;
    const tl = len3(target[i3], target[i3 + 1], target[i3 + 2]) || 1;
    const tx = target[i3] / tl, ty = target[i3 + 1] / tl, tz = target[i3 + 2] / tl;

    const vx = unit[i3], vy = unit[i3 + 1], vz = unit[i3 + 2];
    const dot = Math.max(-1, Math.min(1, vx * tx + vy * ty + vz * tz));
    const angle = Math.acos(dot);
    let nx = vx, ny = vy, nz = vz;
    if (angle > 1e-4) {
      const k = Math.min(1, turn / angle);
      nx += (tx - nx) * k;
      ny += (ty - ny) * k;
      nz += (tz - nz) * k;
    } else {
      nx = tx; ny = ty; nz = tz;
    }
    if (p.noise > 0) {
      nx += (flock.random() - 0.5) * p.noise;
      ny += (flock.random() - 0.5) * p.noise;
      nz += (flock.random() - 0.5) * p.noise * 0.5;
    }
    const nl = len3(nx, ny, nz) || 1;
    accel[i3] = (nx / nl) * p.speed;
    accel[i3 + 1] = (ny / nl) * p.speed;
    accel[i3 + 2] = (nz / nl) * p.speed;
  }

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    vel[i3] = accel[i3];
    vel[i3 + 1] = accel[i3 + 1];
    vel[i3 + 2] = accel[i3 + 2];
    pos[i3] = wrap(pos[i3] + vel[i3] * step, WORLD.w);
    pos[i3 + 1] = wrap(pos[i3 + 1] + vel[i3 + 1] * step, WORLD.h);
    pos[i3 + 2] = wrap(pos[i3 + 2] + vel[i3 + 2] * step, WORLD.d);
  }

  flock.time += step;
  if (flock.startleAt >= 0) trackOnsets(flock);
}

/** Rotates every bird within `startleRadius` of the rim-most bird. */
export function perturb(flock) {
  const { pos, vel, target, params, n } = flock;
  centroidOf(flock);
  const [cx, cy, cz] = flock.centroid;
  let anchor = 0;
  let farthest = -1;
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - cx, dy = pos[i * 3 + 1] - cy, dz = pos[i * 3 + 2] - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > farthest) { farthest = d; anchor = i; }
  }
  const ax = pos[anchor * 3], ay = pos[anchor * 3 + 1], az = pos[anchor * 3 + 2];
  const angle = (flock.random() < 0.5 ? -1 : 1) * params.startleAngle;
  // Rotate about a mostly-horizontal axis: the turn banks the flock through
  // its own slab, which is what makes the projected silhouette fold.
  const axis = flock.axis;
  const tilt = (flock.random() - 0.5) * 0.9;
  axis[0] = Math.cos(tilt);
  axis[1] = Math.sin(tilt);
  axis[2] = (flock.random() - 0.5) * 0.5;
  const al = len3(axis[0], axis[1], axis[2]) || 1;
  axis[0] /= al; axis[1] /= al; axis[2] /= al;
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
  const [ux, uy, uz] = axis;

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    flock.ref[i3] = vel[i3];
    flock.ref[i3 + 1] = vel[i3 + 1];
    flock.ref[i3 + 2] = vel[i3 + 2];
    flock.onset[i] = -1;
    const dx = pos[i3] - ax, dy = pos[i3 + 1] - ay, dz = pos[i3 + 2] - az;
    flock.dist[i] = len3(dx, dy, dz);
    if (flock.dist[i] > params.startleRadius) continue;
    const vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2];
    const dot = vx * ux + vy * uy + vz * uz;
    const rx = vx * c + (uy * vz - uz * vy) * s + ux * dot * k;
    const ry = vy * c + (uz * vx - ux * vz) * s + uy * dot * k;
    const rz = vz * c + (ux * vy - uy * vx) * s + uz * dot * k;
    vel[i3] = rx;
    vel[i3 + 1] = ry;
    vel[i3 + 2] = rz;
    // Commit the lagged target too, so the patch does not snap back.
    const tl = len3(rx, ry, rz) || 1;
    target[i3] = rx / tl;
    target[i3 + 1] = ry / tl;
    target[i3 + 2] = rz / tl;
  }
  flock.startleAt = flock.time;
  flock.measured = false;
  flock.event = { fraction: 0, speed: 0, onset: 0, at: flock.time };
}

function trackOnsets(flock) {
  const elapsed = flock.time - flock.startleAt;
  if (elapsed > 3) return;
  const { vel, ref, onset, n } = flock;
  for (let i = 0; i < n; i++) {
    if (onset[i] >= 0) continue;
    const i3 = i * 3;
    const vl = len3(vel[i3], vel[i3 + 1], vel[i3 + 2]) || 1;
    const rl = len3(ref[i3], ref[i3 + 1], ref[i3 + 2]) || 1;
    const dot = Math.max(-1, Math.min(1, (vel[i3] * ref[i3] + vel[i3 + 1] * ref[i3 + 1] + vel[i3 + 2] * ref[i3 + 2]) / (vl * rl)));
    if (Math.acos(dot) > 0.6) onset[i] = elapsed;
  }
  if (elapsed > 2.9 && !flock.measured) {
    flock.event = measureEvent(flock);
    flock.measured = true;
  }
}

function onsetSpread(flock) {
  const times = [];
  for (let i = 0; i < flock.n; i++) if (flock.onset[i] >= 0) times.push(flock.onset[i]);
  if (times.length < 20) return 0;
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length * 0.9)] - times[Math.floor(times.length * 0.1)];
}

/** Least-squares slope of turn-onset time against distance from the startle. */
export function measureEvent(flock) {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, count = 0;
  for (let i = 0; i < flock.n; i++) {
    if (flock.onset[i] < 0) continue;
    const x = flock.dist[i];
    const y = flock.onset[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y; count++;
  }
  if (count < 20) return { fraction: count / flock.n, speed: 0, onset: 0, at: flock.time };
  const den = count * sxx - sx * sx;
  const slope = den > 1e-6 ? (count * sxy - sx * sy) / den : 0;
  return {
    fraction: count / flock.n,
    speed: slope > 1e-5 ? Math.round(1 / slope) : 0,
    onset: sy / count,
    // Median-ish crossing time: the middle 80% of turn onsets.
    spread: onsetSpread(flock),
    at: flock.startleAt,
  };
}

/** Advance by `dt` seconds of wall time, in fixed sub-steps. */
export function step(flock, dt) {
  // Never chase more than two sub-steps: dropping the backlog is better than
  // spiralling when a slow machine falls behind.
  flock.accumulator = Math.min(flock.accumulator + Math.min(dt, 0.1), 0.25);
  let steps = 0;
  while (flock.accumulator >= WORLD.step && steps < 2) {
    substep(flock, WORLD.step);
    flock.accumulator -= WORLD.step;
    steps++;
  }
  if (flock.accumulator > WORLD.step) flock.accumulator = WORLD.step;
  centroidOf(flock);
}

export function setParams(flock, params) {
  const next = { ...DEFAULT_PARAMS, ...params };
  if (next.birds !== flock.params.birds) {
    const fresh = createFlock(next, flock.seed);
    for (const key of Object.keys(fresh)) flock[key] = fresh[key];
    return flock;
  }
  flock.params = next;
  flock.grid.configure(Math.max(30, next.perception));
  for (let i = 0; i < flock.n; i++) {
    const i3 = i * 3;
    const l = len3(flock.vel[i3], flock.vel[i3 + 1], flock.vel[i3 + 2]) || 1;
    flock.target[i3] = flock.vel[i3] / l;
    flock.target[i3 + 1] = flock.vel[i3 + 1] / l;
    flock.target[i3 + 2] = flock.vel[i3 + 2] / l;
  }
  return flock;
}

/** Order parameter: 0 is a tangled flock, 1 is one heading. */
export function polarization(flock) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < flock.n; i++) {
    const i3 = i * 3;
    const l = len3(flock.vel[i3], flock.vel[i3 + 1], flock.vel[i3 + 2]) || 1;
    x += flock.vel[i3] / l;
    y += flock.vel[i3 + 1] / l;
    z += flock.vel[i3 + 2] / l;
  }
  return len3(x, y, z) / flock.n;
}
