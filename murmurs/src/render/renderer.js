const PALETTES = {
  mono: ['#f3f0e9'],
  bySpeed: ['#5b6f92', '#6a93c4', '#7fc6e8', '#a3e9ff', '#d8f6ff', '#f3f0e9'],
  byAlignment: ['#5c6a84', '#6889a2', '#7fa8b4', '#a3d9d6', '#d4ece4', '#f3f0e9'],
  byDensity: ['#566887', '#5d8aa3', '#6fb0c4', '#a3e9ff', '#d9f3e9', '#ffd7a3'],
};

export class Renderer {
  constructor(canvas, { maxDpr = 1.5 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.maxDpr = maxDpr;
    this.width = 0;
    this.height = 0;
    this.dpr = 0;
    this.buckets = new Uint8Array(4000);
    this.lastBackground = null;
  }

  #syncSize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, this.maxDpr);
    if (width === 0 || height === 0) return false;

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      return true;
    }
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    return false;
  }

  draw(sim, params) {
    const resized = this.#syncSize();
    if (!this.width || !this.height) return;
    const { ctx, width, height } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const fade = Math.min(0.5, Math.max(0, params.trailFade));
    const backgroundChanged = this.lastBackground !== params.background;
    if (resized || backgroundChanged) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = params.background;
      ctx.fillRect(0, 0, width, height);
      this.lastBackground = params.background;
    } else {
      // 0 is a hard clear; 0.5 gives long trails. The floor of 0.05 alpha
      // keeps 8-bit rounding from leaving permanent ghost trails.
      ctx.globalAlpha = 0.05 + 0.95 * Math.pow(1 - fade / 0.5, 2.2);
      ctx.fillStyle = params.background;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }

    const count = sim.getCount();
    if (count === 0) return;

    const positions = sim.getPositions();
    const velocities = sim.getVelocities();
    const mode = params.colorMode;
    let metric = null;
    let metricMin = 0;
    let metricSpan = 1;

    if (mode === 'byAlignment') {
      metric = sim.getAlignments();
    } else if (mode === 'byDensity') {
      metric = sim.getDensities();
    } else if (mode === 'bySpeed') {
      metricMin = params.minSpeed;
      metricSpan = Math.max(0.0001, params.maxSpeed - params.minSpeed);
    }

    const palette = PALETTES[mode] || PALETTES.mono;
    const buckets = this.buckets;
    const colorCount = palette.length;

    for (let i = 0; i < count; i++) {
      let value = 0;
      if (mode === 'bySpeed') {
        const vx = velocities[i * 2];
        const vy = velocities[i * 2 + 1];
        value = (Math.sqrt(vx * vx + vy * vy) - metricMin) / metricSpan;
      } else if (metric) {
        value = metric[i];
      }
      if (value < 0) value = 0;
      else if (value > 1) value = 1;
      buckets[i] = Math.min(colorCount - 1, (value * colorCount) | 0);
    }

    const scale = Math.min(width / sim.width, height / sim.height);
    const offsetX = (width - sim.width * scale) * 0.5;
    const offsetY = (height - sim.height * scale) * 0.5;
    const lineWidth = Math.max(0.65, params.birdSize * 0.72);
    const halfLength = params.birdSize * 1.15;

    ctx.lineCap = 'round';
    ctx.lineWidth = lineWidth;

    for (let b = 0; b < colorCount; b++) {
      ctx.beginPath();
      let drew = false;
      for (let i = 0; i < count; i++) {
        if (buckets[i] !== b) continue;
        const i2 = i * 2;
        const x = offsetX + positions[i2] * scale;
        const y = offsetY + positions[i2 + 1] * scale;
        const vx = velocities[i2];
        const vy = velocities[i2 + 1];
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < 1e-4) {
          ctx.moveTo(x + lineWidth, y);
          ctx.arc(x, y, lineWidth, 0, Math.PI * 2);
        } else {
          const nx = vx / speed;
          const ny = vy / speed;
          ctx.moveTo(x - nx * halfLength, y - ny * halfLength);
          ctx.lineTo(x + nx * halfLength, y + ny * halfLength);
        }
        drew = true;
      }
      if (drew) {
        ctx.strokeStyle = palette[b];
        ctx.stroke();
      }
    }
  }

  /** Forces a full clear on the next draw (e.g. a different sim takes over). */
  invalidate() {
    this.lastBackground = null;
  }
}