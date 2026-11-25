/**
 * V3 flock: an emergent model. Birds steer toward their neighbours' mean
 * heading, but through a first-order lag — they respond to what they saw a
 * moment ago, not instantly — and their turn rate is capped. A startle at the
 * flock's rim therefore travels outward as a front. Nothing prescribes where
 * it goes or how fast; the front is measured after the fact.
 */

export const WORLD = Object.freeze({ w: 960, h: 760, d: 640, step: 1 / 60 });

export const DEFAULT_PARAMS = Object.freeze({
  birds: 2600,
  neighbors: 8,
  perception: 55,
  separation: 11,
  speed: 44,
  inertia: 3.2,
  lag: 110,
  align: 1.6,
  cohesion: 1.0,
  rejoin: 1.15,
  rejoinRadius: 195,
  repel: 1.0,
  // Smooth per-bird wandering (an Ornstein–Uhlenbeck drift on the steering
  // direction) instead of white per-step jitter.
  wander: 0.12,
  wanderTime: 2.0,
  // A slowly drifting roost the flock circles so the flock swoops and loops
  // across the sky instead of flying straight.
  roost: 0.9,
  roostRadius: 105,
  // Time constant for a bird's turn rate to build up or decay (seconds).
  turnSmooth: 0.14,
  startleRadius: 85,
  startleAngle: 1.9,
  commitShare: 0.22,
  commitTime: 1.0,
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
    commitDir: new Float32Array(n * 3),
    commitUntil: new Float32Array(n).fill(-1),
    commitStart: new Float32Array(n).fill(-1),
    omega: new Float32Array(n * 3),
    wander: new Float32Array(n * 3),
    informed: new Float32Array(n),
    roost: [WORLD.w / 2, WORLD.h / 2, WORLD.d / 2],
    roostPhase: random() * 200,
    roostSide: 0,
    onset: new Float32Array(n).fill(-1),
    dist: new Float32Array(n),
    speedScale: new Float32Array(n),
    speeds: new Float32Array(n),
    grid: new Grid3(WORLD.w, WORLD.h, WORLD.d, Math.max(30, p.perception * 0.75)),
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

  // Start mid-flight as an organic, curved 3D ribbon with spatially varying
  // headings, banking, and wander so every launch feels alive from frame 0.
  const heading = random() * Math.PI * 2;
  const pitch = (random() - 0.5) * 0.45;
  const shapeAngle = heading + (random() - 0.5) * 1.4;
  const cosS = Math.cos(shapeAngle), sinS = Math.sin(shapeAngle);
  const spanX = 360 + random() * 170;
  const spanY = 140 + random() * 110;
  const bend = (random() - 0.5) * 150;
  const wave = (random() - 0.5) * 90;
  const twistZ = (random() - 0.5) * 110;
  const depthSpread = 55 + random() * 45;
  const yawGrad = (random() - 0.5) * 2.4;
  const yawWave = (random() - 0.5) * 1.6;
  const yawPhase = random() * Math.PI * 2;
  const pitchGrad = (random() - 0.5) * 1.1;
  const baseSpin = (random() - 0.5) * 1.8;
  const asym = (random() - 0.5) * 0.5;
  updateRoost(flock);
  const baseX = wrap(flock.roost[0] + (random() - 0.5) * 110, WORLD.w);
  const baseY = wrap(flock.roost[1] + (random() - 0.5) * 70, WORLD.h);
  const baseZ = wrap(flock.roost[2] + (random() - 0.5) * 40, WORLD.d);
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const u = (random() - 0.5) * 2; // -1..1 along ribbon spine
    const taper = Math.max(0.25, (1 - 0.65 * u * u) * (1 + asym * u));
    const vSpread = (random() + random() - 1) * taper;
    const gx = u * (spanX * 0.5);
    const gy = bend * (u * u - 0.35) + wave * Math.sin(u * Math.PI) + vSpread * (spanY * 0.5);
    const gz = twistZ * Math.sin(u * 2.1 + yawPhase) * 0.5 + (random() + random() - 1) * depthSpread;
    pos[i3] = wrap(baseX + gx * cosS - gy * sinS, WORLD.w);
    pos[i3 + 1] = wrap(baseY + gx * sinS + gy * cosS, WORLD.h);
    pos[i3 + 2] = wrap(baseZ + gz, WORLD.d);

    const a = heading
      + yawGrad * u
      + yawWave * Math.sin(u * Math.PI + yawPhase)
      + (random() + random() - 1) * 1.35;
    const localPitch = pitch + pitchGrad * u + (random() + random() - 1) * 0.75;
    const cosP = Math.cos(localPitch);
    const scale = 0.94 + random() * 0.12;
    flock.speedScale[i] = scale;
    const s = p.speed * scale;
    flock.speeds[i] = s;
    const ux = Math.cos(a) * cosP;
    const uy = Math.sin(a) * cosP;
    const uz = Math.sin(localPitch);
    const vl = len3(ux, uy, uz) || 1;
    const vx = ux / vl, vy = uy / vl, vz = uz / vl;
    vel[i3] = vx * s;
    vel[i3 + 1] = vy * s;
    vel[i3 + 2] = vz * s;
    flock.target[i3] = vx;
    flock.target[i3 + 1] = vy;
    flock.target[i3 + 2] = vz;

    // Seed gentle initial banking and stationary wander so birds aren't frozen straight.
    let ox = (random() - 0.5) * 0.6;
    let oy = (random() - 0.5) * 0.6;
    let oz = baseSpin + (random() - 0.5) * 0.9;
    const along = ox * vx + oy * vy + oz * vz;
    flock.omega[i3] = ox - along * vx;
    flock.omega[i3 + 1] = oy - along * vy;
    flock.omega[i3 + 2] = oz - along * vz;
    flock.wander[i3] = (random() + random() + random() - 1.5) * 2 * p.wander;
    flock.wander[i3 + 1] = (random() + random() + random() - 1.5) * 2 * p.wander;
    flock.wander[i3 + 2] = (random() + random() + random() - 1.5) * 2 * p.wander * 0.6;
  }
  for (let i = 0; i < n; i++) flock.informed[i] = 0.7 + 0.6 * random();
  centroidOf(flock);
  return flock;
}

const TURN_GAIN = 5; // rad/s of turn rate per radian of heading error
const COMMIT_FADE_IN = 0.15;
const COMMIT_FADE_OUT = 0.3;
const CAMERA_FREE = 0.65;

/** Approximately unit-variance noise from three uniforms. */
const gauss = (random) => (random() + random() + random() - 1.5) * 2;

/** Moves the roost along a slow Lissajous path so the loops never repeat. */
function updateRoost(flock) {
  const t = flock.time + flock.roostPhase;
  const r = flock.roost;
  r[0] = WORLD.w / 2 + 65 * Math.sin(t * 0.047) + 25 * Math.sin(t * 0.13 + 0.7);
  r[1] = WORLD.h / 2 + 40 * Math.sin(t * 0.035 + 1.3);
  r[2] = WORLD.d / 2 + 25 * Math.sin(t * 0.029 + 2.1);
}

const MAX_CAM_LAG = [90, 65, 35];

/** Where the camera should look: trailing toward the roost, clamped close enough to keep birds off the torus seam. */
export function cameraGoal(flock, out) {
  const sizes = [WORLD.w, WORLD.h, WORLD.d];
  for (let a = 0; a < 3; a++) {
    const toRoost = torusMinus(flock.roost[a], flock.centroid[a], sizes[a]);
    const shift = Math.max(-MAX_CAM_LAG[a], Math.min(MAX_CAM_LAG[a], toRoost * (1 - CAMERA_FREE)));
    out[a] = wrap(flock.centroid[a] + shift, sizes[a]);
  }
  return out;
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
  const k = Math.min(NEIGHBOR_LIMIT, params.neighbors);
  const reach = params.perception * 4;
  const reach2 = reach * reach;
  const halfW = WORLD.w / 2, halfH = WORLD.h / 2, halfD = WORLD.d / 2;
  const cols = grid.cols, rows = grid.rows, lays = grid.lays;
  const cellW = grid.cellW, cellH = grid.cellH, cellD = grid.cellD;
  const starts = grid.starts, items = grid.items;
  const baseX = Math.min(cols - 1, Math.max(0, (x / cellW) | 0));
  const baseY = Math.min(rows - 1, Math.max(0, (y / cellH) | 0));
  const baseZ = Math.min(lays - 1, Math.max(0, (z / cellD) | 0));
  const lx = x - baseX * cellW;
  const ly = y - baseY * cellH;
  const lz = z - baseZ * cellD;
  let found = 0;

  // Fast path: scan the bird's own cell first (span = 0).
  {
    const cell = (baseZ * rows + baseY) * cols + baseX;
    const end = starts[cell + 1];
    for (let s = starts[cell]; s < end; s++) {
      const j = items[s];
      if (j === i) continue;
      const j3 = j * 3;
      const dx = pos[j3] - x;
      const dy = pos[j3 + 1] - y;
      const dz = pos[j3 + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > reach2) continue;
      if (found === k && d2 >= neighborDist[k - 1]) continue;
      let at = found < k ? found++ : k - 1;
      while (at > 0 && neighborDist[at - 1] > d2) {
        neighborDist[at] = neighborDist[at - 1];
        neighborIndex[at] = neighborIndex[at - 1];
        at--;
      }
      neighborDist[at] = d2;
      neighborIndex[at] = j;
    }
  }

  // If the kth nearest is closer than every face of the current cell, we're done!
  if (found === k) {
    const r2 = neighborDist[k - 1];
    const minWall = Math.min(lx, cellW - lx, ly, cellH - ly, lz, cellD - lz);
    if (r2 <= minWall * minWall) return k;
  }

  const maxSpanX = Math.floor(cols / 2);
  const maxSpanY = Math.floor(rows / 2);
  const maxSpanZ = Math.floor(lays / 2);
  const maxSpan = Math.min(6, Math.max(maxSpanX, maxSpanY, maxSpanZ));
  const minCell = Math.min(cellW, cellH, cellD);

  for (let span = 1; span <= maxSpan; span++) {
    if (found === k) {
      const shellMin = (span - 1) * minCell;
      if (shellMin * shellMin >= neighborDist[k - 1]) break;
    }
    const ozMin = Math.max(-span, -maxSpanZ);
    const ozMax = Math.min(span, lays - 1 - maxSpanZ);
    const oyMin = Math.max(-span, -maxSpanY);
    const oyMax = Math.min(span, rows - 1 - maxSpanY);
    const oxMin = Math.max(-span, -maxSpanX);
    const oxMax = Math.min(span, cols - 1 - maxSpanX);

    for (let oz = ozMin; oz <= ozMax; oz++) {
      const edgeZ = oz === -span || oz === span;
      const minDz = oz === 0 ? 0 : (oz > 0 ? (oz - 1) * cellD + (cellD - lz) : (-oz - 1) * cellD + lz);
      const minDz2 = minDz * minDz;
      if (found === k && minDz2 >= neighborDist[k - 1]) continue;
      let gz = baseZ + oz;
      if (gz < 0) gz += lays; else if (gz >= lays) gz -= lays;
      const zOff = gz * rows;
      for (let oy = oyMin; oy <= oyMax; oy++) {
        const edgeY = oy === -span || oy === span;
        const minDy = oy === 0 ? 0 : (oy > 0 ? (oy - 1) * cellH + (cellH - ly) : (-oy - 1) * cellH + ly);
        const minDyz2 = minDz2 + minDy * minDy;
        if (found === k && minDyz2 >= neighborDist[k - 1]) continue;
        let gy = baseY + oy;
        if (gy < 0) gy += rows; else if (gy >= rows) gy -= rows;
        const yzOff = (zOff + gy) * cols;
        for (let ox = oxMin; ox <= oxMax; ox++) {
          if (!edgeZ && !edgeY && ox !== -span && ox !== span) continue;
          const minDx = ox === 0 ? 0 : (ox > 0 ? (ox - 1) * cellW + (cellW - lx) : (-ox - 1) * cellW + lx);
          if (found === k && minDyz2 + minDx * minDx >= neighborDist[k - 1]) continue;
          let gx = baseX + ox;
          if (gx < 0) gx += cols; else if (gx >= cols) gx -= cols;
          const cell = yzOff + gx;
          const end = starts[cell + 1];
          for (let s = starts[cell]; s < end; s++) {
            const j = items[s];
            const j3 = j * 3;
            let dx = pos[j3] - x;
            let dy = pos[j3 + 1] - y;
            let dz = pos[j3 + 2] - z;
            if (dx > halfW) dx -= WORLD.w; else if (dx < -halfW) dx += WORLD.w;
            if (dy > halfH) dy -= WORLD.h; else if (dy < -halfH) dy += WORLD.h;
            if (dz > halfD) dz -= WORLD.d; else if (dz < -halfD) dz += WORLD.d;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > reach2) continue;
            if (found === k && d2 >= neighborDist[k - 1]) continue;
            let at = found < k ? found++ : k - 1;
            while (at > 0 && neighborDist[at - 1] > d2) {
              neighborDist[at] = neighborDist[at - 1];
              neighborIndex[at] = neighborIndex[at - 1];
              at--;
            }
            neighborDist[at] = d2;
            neighborIndex[at] = j;
          }
        }
      }
    }
  }
  return found;
}

/** 0..1 strength of a bird's commitment, eased at both ends. */
function commitWeight(flock, i) {
  const until = flock.commitUntil[i];
  if (flock.time >= until) return 0;
  const a = Math.min(1, (flock.time - flock.commitStart[i]) / COMMIT_FADE_IN);
  const b = Math.min(1, (until - flock.time) / COMMIT_FADE_OUT);
  const w = Math.max(0, Math.min(a, b));
  return w * w * (3 - 2 * w);
}

function substep(flock, dt) {
  const { pos, vel, target, accel, unit, speeds, params, n } = flock;
  const p = params;
  const step = WORLD.step;
  const halfW = WORLD.w / 2, halfH = WORLD.h / 2, halfD = WORLD.d / 2;
  flock.grid.rebuild(pos, n);
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const v = len3(vel[i3], vel[i3 + 1], vel[i3 + 2]) || 1;
    speeds[i] = v;
    unit[i3] = vel[i3] / v;
    unit[i3 + 1] = vel[i3 + 1] / v;
    unit[i3 + 2] = vel[i3 + 2] / v;
  }

  const blend = 1 - Math.exp(-dt / Math.max(0.001, p.lag / 1000));
  const turnEase = 1 - Math.exp(-dt / Math.max(0.01, p.turnSmooth));
  const speedEase = 1 - Math.exp(-dt / 0.35);
  const minSpeed = p.speed * 0.85;
  const maxSpeed = p.speed * 1.15;
  const wDecay = Math.exp(-dt / Math.max(0.05, p.wanderTime));
  const wKick = p.wander * Math.sqrt(1 - wDecay * wDecay);
  const { omega, wander, informed } = flock;

  // Roost steering is computed once from the flock's centre, so it bends the
  // flock's path without squeezing it toward a point. Steer toward the roost
  // with a sideways bias when heading away so the flock curves cleanly back
  // instead of stalling at 180° or spiralling outward.
  updateRoost(flock);
  const offX = torusMinus(flock.centroid[0], flock.roost[0], WORLD.w);
  const offY = torusMinus(flock.centroid[1], flock.roost[1], WORLD.h);
  const offZ = torusMinus(flock.centroid[2], flock.roost[2], WORLD.d);
  // Weight Z slightly stronger so loops sweep mostly across the sky rather
  // than diving deep into or out of the camera plane.
  const offL = len3(offX, offY, offZ * 1.4) || 1;
  const rt = Math.max(0, Math.min(1, (offL - p.roostRadius * 0.6) / (p.roostRadius * 1.1)));
  const outer = offL > p.roostRadius * 1.6 ? ((offL - p.roostRadius * 1.6) / p.roostRadius) * 1.4 : 0;
  const roostPull = p.roost * (rt * rt * (3 - 2 * rt) + outer);
  let homeX = 0, homeY = 0, homeZ = 0;
  if (roostPull > 0) {
    let hx = 0, hy = 0, hz = 0;
    for (let i = 0; i < n; i++) { hx += unit[i * 3]; hy += unit[i * 3 + 1]; hz += unit[i * 3 + 2]; }
    const hl = len3(hx, hy, hz) || 1;
    hx /= hl; hy /= hl; hz /= hl;
    let gx = -offX / offL, gy = -offY / offL, gz = (-offZ * 1.4) / offL;
    const gl = len3(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    const ahead = gx * hx + gy * hy + gz * hz;
    if (ahead < -0.2) {
      // Heading away: add a consistent sideways kick so the turn breaks cleanly
      // in one direction instead of fighting 180° opposition.
      const hxy = Math.hypot(hx, hy);
      const px = hxy > 0.15 ? -hy / hxy : 1;
      const py = hxy > 0.15 ? hx / hxy : 0;
      const side = (px * gx + py * gy) >= 0 ? 1 : -1;
      if (flock.roostSide === 0) flock.roostSide = side;
      const bias = (-0.2 - ahead) * 0.9;
      gx += px * flock.roostSide * bias;
      gy += py * flock.roostSide * bias;
      const bl = len3(gx, gy, gz) || 1;
      gx /= bl; gy /= bl; gz /= bl;
    } else if (ahead > 0.2) {
      flock.roostSide = 0;
    }
    homeX = gx * roostPull;
    homeY = gy * roostPull;
    homeZ = gz * roostPull;
  }

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
    let ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, sx = 0, sy = 0, sz = 0;
    let dxm = 0, dym = 0, dzm = 0, dissenters = 0, wgt = commitWeight(flock, i);
    let nbrSpeed = 0;
    const count = gather(flock, i);
    const ux = unit[i3], uy = unit[i3 + 1], uz = unit[i3 + 2];

    if (count > 0) {
      for (let m = 0; m < count; m++) {
        const j = flock.neighborIndex[m];
        const j3 = j * 3;
        nbrSpeed += speeds[j];
        ax += unit[j3];
        ay += unit[j3 + 1];
        az += unit[j3 + 2];
        // Neighbours already pointing somewhere else: the raw material for a
        // committed turn.
        if (unit[j3] * ux + unit[j3 + 1] * uy + unit[j3 + 2] * uz < 0.82) {
          if (flock.time < flock.commitUntil[j]) {
            dxm += flock.commitDir[j3];
            dym += flock.commitDir[j3 + 1];
            dzm += flock.commitDir[j3 + 2];
          } else {
            dxm += unit[j3];
            dym += unit[j3 + 1];
            dzm += unit[j3 + 2];
          }
          dissenters++;
        }
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
      // Pull escalates smoothly before any axis nears half the torus so no
      // bird ever crosses the antipodal seam and teleports across the view.
      const [fx, fy, fz] = flock.centroid;
      const rdx = torusMinus(x, fx, WORLD.w);
      const rdy = torusMinus(y, fy, WORLD.h);
      const rdz = torusMinus(z, fz, WORLD.d);
      const rd = len3(rdx, rdy, rdz);
      let rx = 0, ry = 0, rz = 0;
      const edgeFrac = Math.max(
        Math.abs(rdx) / (halfW * 0.72),
        Math.abs(rdy) / (halfH * 0.72),
        Math.abs(rdz) / (halfD * 0.72),
      );
      if (rd > p.rejoinRadius || edgeFrac > 0.75) {
        let basePull = 0;
        if (rd > p.rejoinRadius) {
          const ex = Math.min(1.5, (rd - p.rejoinRadius) / p.rejoinRadius);
          basePull = p.rejoin * ex * ex;
        }
        const guardPull = edgeFrac > 0.75
          ? p.align * 4 * (edgeFrac - 0.75) * (edgeFrac - 0.75) * 8
          : 0;
        const pull = basePull + guardPull;
        const inv = 1 / (rd || 1);
        rx = -rdx * inv * pull;
        ry = -rdy * inv * pull;
        rz = -rdz * inv * pull;
        if (edgeFrac > 0.95) flock.commitUntil[i] = Math.min(flock.commitUntil[i], flock.time + COMMIT_FADE_OUT);
      }

      // Commitment: if enough neighbours already point a different way, and
      // they agree with each other, adopt their heading and hold it. This is
      // what lets a turn lock in and travel instead of being averaged away by
      // the birds that have not turned yet.
      if (p.commitShare > 0 && dissenters >= Math.max(2, count * p.commitShare)) {
        const dl = len3(dxm, dym, dzm);
        if (dl > dissenters * 0.6 && flock.time >= flock.commitUntil[i]) {
          flock.commitStart[i] = flock.time;
          flock.commitUntil[i] = flock.time + p.commitTime;
          flock.commitDir[i3] = dxm / dl;
          flock.commitDir[i3 + 1] = dym / dl;
          flock.commitDir[i3 + 2] = dzm / dl;
        }
      }
      wgt = commitWeight(flock, i);

      const al = len3(ax, ay, az) || 1;
      const cl = len3(cx, cy, cz) || 1;
      const closeness = Math.min(1, cl / count / p.perception);
      const sl = len3(sx, sy, sz);
      const sepScale = sl > 1 ? p.repel / sl : p.repel;
      // Free steering and committed steering are blended by a weight that
      // fades in and out, so a bird never snaps between the two.
      const nx0 = (ax / al) * p.align + (cx / cl) * p.cohesion * closeness + sx * sepScale + rx;
      const ny0 = (ay / al) * p.align + (cy / cl) * p.cohesion * closeness + sy * sepScale + ry;
      const nz0 = (az / al) * p.align + (cz / cl) * p.cohesion * closeness + sz * sepScale + rz;
      if (wgt > 0) {
        const cw = p.align * 1.6;
        const kx = flock.commitDir[i3] * cw + sx * sepScale * 0.5 + rx;
        const ky = flock.commitDir[i3 + 1] * cw + sy * sepScale * 0.5 + ry;
        const kz = flock.commitDir[i3 + 2] * cw + sz * sepScale * 0.5 + rz;
        ax = nx0 + (kx - nx0) * wgt;
        ay = ny0 + (ky - ny0) * wgt;
        az = nz0 + (kz - nz0) * wgt;
      } else {
        ax = nx0; ay = ny0; az = nz0;
      }
    }

    // Wander: each bird's private, slowly drifting preference.
    wander[i3] = wander[i3] * wDecay + gauss(flock.random) * wKick;
    wander[i3 + 1] = wander[i3 + 1] * wDecay + gauss(flock.random) * wKick;
    wander[i3 + 2] = wander[i3 + 2] * wDecay + gauss(flock.random) * wKick * 0.6;
    const free = 1 - 0.7 * wgt;
    const home = informed[i] * free;
    ax += wander[i3] * free + homeX * home;
    ay += wander[i3 + 1] * free + homeY * home;
    az += wander[i3 + 2] * free + homeZ * home;

    const fl = len3(ax, ay, az) || 1;
    // The lag: the steering target is a first-order follower of what the bird
    // currently sees, so a neighbour's turn reaches this bird late.
    const follow = blend + (1 - blend) * wgt;
    target[i3] += (ax / fl - target[i3]) * follow;
    target[i3 + 1] += (ay / fl - target[i3 + 1]) * follow;
    target[i3 + 2] += (az / fl - target[i3 + 2]) * follow;
    const tl = len3(target[i3], target[i3 + 1], target[i3 + 2]) || 1;
    const tx = target[i3] / tl, ty = target[i3 + 1] / tl, tz = target[i3 + 2] / tl;

    // Turning has momentum: the bird's angular velocity eases toward the rate
    // it wants (proportional to heading error, capped by `inertia`), so turns
    // roll in and out instead of switching on and off.
    const vx = unit[i3], vy = unit[i3 + 1], vz = unit[i3 + 2];
    const dot = vx * tx + vy * ty + vz * tz;
    let qx = vy * tz - vz * ty, qy = vz * tx - vx * tz, qz = vx * ty - vy * tx;
    let sinA = len3(qx, qy, qz);
    if (sinA < 0.05 && dot < 0) {
      // Target almost directly behind: u x t has no stable direction, so keep
      // the current turn going, or start a level turn.
      const ol = len3(omega[i3], omega[i3 + 1], omega[i3 + 2]);
      if (ol > 0.1) { qx = omega[i3] / ol; qy = omega[i3 + 1] / ol; qz = omega[i3 + 2] / ol; }
      else { const hl = Math.hypot(vx, vy) || 1; qx = -vy * vz / hl; qy = vx * vz / hl; qz = hl; }
      const ql = len3(qx, qy, qz) || 1;
      qx /= ql; qy /= ql; qz /= ql;
      sinA = 1;
    }
    let wdx = 0, wdy = 0, wdz = 0;
    if (sinA > 1e-6) {
      const rate = Math.min(p.inertia, Math.atan2(len3(vy * tz - vz * ty, vz * tx - vx * tz, vx * ty - vy * tx), dot) * TURN_GAIN) / sinA;
      wdx = qx * rate; wdy = qy * rate; wdz = qz * rate;
    }
    let ox = omega[i3] + (wdx - omega[i3]) * turnEase;
    let oy = omega[i3 + 1] + (wdy - omega[i3 + 1]) * turnEase;
    let oz = omega[i3 + 2] + (wdz - omega[i3 + 2]) * turnEase;
    const along = ox * vx + oy * vy + oz * vz;
    ox -= along * vx; oy -= along * vy; oz -= along * vz;
    omega[i3] = ox; omega[i3 + 1] = oy; omega[i3 + 2] = oz;
    const acx = oy * vz - oz * vy;
    const acy = oz * vx - ox * vz;
    const acz = ox * vy - oy * vx;
    const nx = vx + acx * dt;
    const ny = vy + acy * dt;
    const nz = vz + acz * dt;
    const nl = len3(nx, ny, nz) || 1;
    // Dynamic speed: couple toward neighbours' pace, accelerate slightly on
    // the outside of a turn (slow on the inside), and gain a touch of speed
    // when diving (+y in screen coordinates).
    const baseSpeed = p.speed * flock.speedScale[i];
    const meanSpeed = count > 0 ? nbrSpeed / count : baseSpeed;
    const cl = len3(cx, cy, cz);
    const turnBias = cl > 1e-4 ? (cx * acx + cy * acy + cz * acz) / (cl * p.inertia) : 0;
    const diveBias = (ny / nl) * 0.035;
    const desiredSpeed = Math.max(
      minSpeed,
      Math.min(maxSpeed, baseSpeed * 0.55 + meanSpeed * 0.45 + p.speed * (turnBias * 0.11 + diveBias)),
    );
    const birdSpeed = speeds[i] + (desiredSpeed - speeds[i]) * speedEase;
    accel[i3] = (nx / nl) * birdSpeed;
    accel[i3 + 1] = (ny / nl) * birdSpeed;
    accel[i3 + 2] = (nz / nl) * birdSpeed;
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

/**
 * Rotates every bird within `startleRadius` of a rim patch, or around an
 * explicit `{ anchor, awayFrom }` target (e.g. a canvas click).
 */
export function perturb(flock, origin = null) {
  const { pos, vel, target, params, n } = flock;
  centroidOf(flock);
  const [cx, cy, cz] = flock.centroid;

  // Vary startle size slightly so successive waves never feel mechanical.
  const radius = params.startleRadius * (origin ? 1.0 : 0.85 + flock.random() * 0.35);

  let anchor = 0;
  if (origin && Number.isInteger(origin.anchor) && origin.anchor >= 0 && origin.anchor < n) {
    anchor = origin.anchor;
  } else {
    // Pick a random rim direction so successive startles hit different edges
    // instead of repeatedly picking the same stray outlier.
    const theta = flock.random() * Math.PI * 2;
    const dirZ = (flock.random() - 0.5) * 0.5;
    const dirLen = Math.hypot(1, dirZ);
    const dirX = Math.cos(theta) / dirLen;
    const dirY = Math.sin(theta) / dirLen;
    const dirZn = dirZ / dirLen;

    let maxProj = -Infinity;
    const capDist = Math.min(params.rejoinRadius * 1.25, WORLD.d * 0.45);
    for (let i = 0; i < n; i++) {
      const dx = torusMinus(pos[i * 3], cx, WORLD.w);
      const dy = torusMinus(pos[i * 3 + 1], cy, WORLD.h);
      const dz = torusMinus(pos[i * 3 + 2], cz, WORLD.d);
      const proj = dx * dirX + dy * dirY + dz * dirZn;
      flock.dist[i] = proj;
      if (len3(dx, dy, dz) <= capDist && proj > maxProj) maxProj = proj;
    }
    if (!Number.isFinite(maxProj)) {
      for (let i = 0; i < n; i++) if (flock.dist[i] > maxProj) maxProj = flock.dist[i];
    }

    // Step slightly inward from the very tip so the startle bites into a real
    // rim patch rather than a handful of isolated strays.
    const rimTarget = maxProj - radius * 0.35;
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = flock.dist[i];
      if (p <= rimTarget && p > best) { best = p; anchor = i; }
    }
    if (!Number.isFinite(best)) {
      for (let i = 0; i < n; i++) if (flock.dist[i] > best) { best = flock.dist[i]; anchor = i; }
    }
  }

  const ax = pos[anchor * 3], ay = pos[anchor * 3 + 1], az = pos[anchor * 3 + 2];

  // Measure toroidal distance from the anchor; if a narrow ribbon tip holds
  // too few birds inside `radius`, widen the patch smoothly so the wave always
  // has enough mass to propagate across the flock.
  let inPatch = 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const dx = torusMinus(pos[i3], ax, WORLD.w);
    const dy = torusMinus(pos[i3 + 1], ay, WORLD.h);
    const dz = torusMinus(pos[i3 + 2], az, WORLD.d);
    const d = len3(dx, dy, dz);
    flock.dist[i] = d;
    if (d <= radius) inPatch++;
  }
  let patchRadius = radius;
  const minPatch = Math.min(Math.floor(n * 0.16), 360);
  if (inPatch < minPatch) {
    const sorted = Float32Array.from(flock.dist).sort();
    patchRadius = Math.max(radius, sorted[Math.min(n - 1, minPatch)]);
  }

  let mvx = 0, mvy = 0, mvz = 0;
  for (let i = 0; i < n; i++) {
    if (flock.dist[i] <= patchRadius) {
      const i3 = i * 3;
      mvx += vel[i3]; mvy += vel[i3 + 1]; mvz += vel[i3 + 2];
    }
  }
  let ml = len3(mvx, mvy, mvz);
  if (ml < 1e-4) {
    mvx = vel[anchor * 3]; mvy = vel[anchor * 3 + 1]; mvz = vel[anchor * 3 + 2];
    ml = len3(mvx, mvy, mvz) || 1;
  }
  const hx = mvx / ml, hy = mvy / ml, hz = mvz / ml;

  // Build an orthonormal plane perpendicular to the patch's flight direction so
  // the rotation axis is never parallel to velocity (which would cancel the turn).
  const upX = Math.abs(hz) < 0.9 ? 0 : 0;
  const upY = Math.abs(hz) < 0.9 ? 0 : 1;
  const upZ = Math.abs(hz) < 0.9 ? 1 : 0;
  let e1x = hy * upZ - hz * upY;
  let e1y = hz * upX - hx * upZ;
  let e1z = hx * upY - hy * upX;
  const e1l = len3(e1x, e1y, e1z) || 1;
  e1x /= e1l; e1y /= e1l; e1z /= e1l;
  const e2x = hy * e1z - hz * e1y;
  const e2y = hz * e1x - hx * e1z;
  const e2z = hx * e1y - hy * e1x;

  const axis = flock.axis;
  let sign = 1;
  if (origin?.awayFrom) {
    // Turn away from the clicked point (with a light Z-bank so the flock still
    // folds in 3D). If the click landed right on the anchor, flee toward the
    // flock's body so the wave sweeps across it.
    let awayX = torusMinus(ax, origin.awayFrom[0], WORLD.w);
    let awayY = torusMinus(ay, origin.awayFrom[1], WORLD.h);
    let awayL = Math.hypot(awayX, awayY);
    if (awayL < 18) {
      awayX = torusMinus(cx, ax, WORLD.w);
      awayY = torusMinus(cy, ay, WORLD.h);
      awayL = Math.hypot(awayX, awayY);
    }
    const awayZ = (flock.random() - 0.5) * 0.45 * (awayL || 1);
    const qx = hy * awayZ - hz * awayY;
    const qy = hz * awayX - hx * awayZ;
    const qz = hx * awayY - hy * awayX;
    const ql = len3(qx, qy, qz);
    if (ql > (awayL || 1) * 0.25) {
      axis[0] = qx / ql;
      axis[1] = qy / ql;
      axis[2] = qz / ql;
    } else {
      const phi = flock.random() * Math.PI * 2;
      axis[0] = e1x * Math.cos(phi) + e2x * Math.sin(phi);
      axis[1] = e1y * Math.cos(phi) + e2y * Math.sin(phi);
      axis[2] = e1z * Math.cos(phi) + e2z * Math.sin(phi);
    }
  } else {
    const phi = flock.random() * Math.PI * 2;
    const cPhi = Math.cos(phi), sPhi = Math.sin(phi);
    axis[0] = e1x * cPhi + e2x * sPhi;
    axis[1] = e1y * cPhi + e2y * sPhi;
    axis[2] = e1z * cPhi + e2z * sPhi;

    // Prefer rotating the rim patch inward toward the flock's body so the wave
    // sweeps across the flock instead of flying off into empty space.
    const inX = torusMinus(cx, ax, WORLD.w);
    const inY = torusMinus(cy, ay, WORLD.h);
    const inZ = torusMinus(cz, az, WORLD.d);
    const [ux0, uy0, uz0] = axis;
    const crossX = uy0 * hz - uz0 * hy;
    const crossY = uz0 * hx - ux0 * hz;
    const crossZ = ux0 * hy - uy0 * hx;
    sign = (crossX * inX + crossY * inY + crossZ * inZ) >= 0 ? 1 : -1;
  }
  const [ux, uy, uz] = axis;
  const angle = sign * params.startleAngle * (0.85 + flock.random() * 0.35);
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
  const kickRate = sign * params.inertia * 0.85;

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    flock.ref[i3] = vel[i3];
    flock.ref[i3 + 1] = vel[i3 + 1];
    flock.ref[i3 + 2] = vel[i3 + 2];
    flock.onset[i] = -1;
    if (flock.dist[i] > patchRadius) continue;
    const vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2];
    const dot = vx * ux + vy * uy + vz * uz;
    const rx = vx * c + (uy * vz - uz * vy) * s + ux * dot * k;
    const ry = vy * c + (uz * vx - ux * vz) * s + uy * dot * k;
    const rz = vz * c + (ux * vy - uy * vx) * s + uz * dot * k;
    // Start the startled patch banking immediately at a smooth physical turn
    // rate (no single-frame velocity snap), with full commitment that fades out.
    const tl = len3(rx, ry, rz) || 1;
    const tx = rx / tl, ty = ry / tl, tz = rz / tl;
    target[i3] = tx;
    target[i3 + 1] = ty;
    target[i3 + 2] = tz;
    flock.commitDir[i3] = tx;
    flock.commitDir[i3 + 1] = ty;
    flock.commitDir[i3 + 2] = tz;
    flock.commitStart[i] = flock.time - COMMIT_FADE_IN;
    flock.commitUntil[i] = flock.time + Math.max(1.1, params.commitTime * 1.25);
    flock.omega[i3] = ux * kickRate;
    flock.omega[i3 + 1] = uy * kickRate;
    flock.omega[i3 + 2] = uz * kickRate;
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
  flock.grid.configure(Math.max(30, next.perception * 0.75));
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
