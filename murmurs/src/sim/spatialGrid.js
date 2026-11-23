/**
 * A compact CSR spatial grid over a toroidal (wrap-around) world. One
 * instance belongs to one Simulation and is rebuilt in place every step; it
 * is never shared between variants.
 *
 * Positions are interleaved [x0, y0, x1, y1, ...] in [0, width) x [0, height).
 * Neighbour offsets use the minimum image, so flocks interact across edges.
 */
export class SpatialGrid {
  constructor(width, height, capacity) {
    this.width = width;
    this.height = height;
    this.halfW = width / 2;
    this.halfH = height / 2;
    this.capacity = capacity;
    this.items = new Int32Array(capacity);
    this.pos = null;
    this.base = 0;
    this.cellW = 0;
    this.cellH = 0;
    this.cols = 0;
    this.rows = 0;
    this.cellCount = 0;
    this.counts = null;
    this.starts = null;
    this.cursor = null;
    this.stamps = null;
    this.stamp = 0;
  }

  /**
   * Cells divide the world exactly so wrapped neighbours line up. Callers
   * quantise `base` so dragging a radius slider doesn't reallocate.
   */
  configure(base) {
    if (base === this.base) return;
    this.base = base;
    this.cols = Math.max(1, Math.floor(this.width / base));
    this.rows = Math.max(1, Math.floor(this.height / base));
    this.cellW = this.width / this.cols;
    this.cellH = this.height / this.rows;
    this.cellCount = this.cols * this.rows;
    this.counts = new Int32Array(this.cellCount);
    this.starts = new Int32Array(this.cellCount + 1);
    this.cursor = new Int32Array(this.cellCount);
    this.stamps = new Int32Array(this.cellCount);
    this.stamp = 0;
  }

  #cellOf(x, y) {
    let cx = (x / this.cellW) | 0;
    let cy = (y / this.cellH) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  rebuild(pos, count) {
    this.pos = pos;
    const { counts, starts, cursor, items } = this;
    counts.fill(0);
    for (let i = 0; i < count; i++) counts[this.#cellOf(pos[i * 2], pos[i * 2 + 1])]++;

    let sum = 0;
    for (let c = 0; c < this.cellCount; c++) {
      starts[c] = sum;
      cursor[c] = sum;
      sum += counts[c];
    }
    starts[this.cellCount] = sum;

    for (let i = 0; i < count; i++) {
      items[cursor[this.#cellOf(pos[i * 2], pos[i * 2 + 1])]++] = i;
    }
  }

  #nextStamp() {
    let stamp = ++this.stamp;
    if (stamp > 0x3fffffff) {
      this.stamps.fill(0);
      stamp = this.stamp = 1;
    }
    return stamp;
  }

  /**
   * Calls fn(index, dx, dy, distanceSquared) for birds inside the circle.
   * dx/dy point from the query position to the neighbour. fn returns true
   * when it counted the neighbour; scanning stops after `limit` counted ones.
   *
   * `rotate` varies the cell and in-cell start position per query so that
   * the truncation in dense flocks doesn't favour one direction or low bird
   * indices.
   */
  forEachInRadius(x, y, radius, fn, limit = Infinity, rotate = 0) {
    const { cols, rows, cellW, cellH, starts, items, pos, stamps, width, height, halfW, halfH } = this;
    const minX = Math.floor((x - radius) / cellW);
    const minY = Math.floor((y - radius) / cellH);
    const spanX = Math.min(cols, Math.floor((x + radius) / cellW) - minX + 1);
    const spanY = Math.min(rows, Math.floor((y + radius) / cellH) - minY + 1);
    const boxCells = spanX * spanY;
    const first = rotate % boxCells;
    const stamp = this.#nextStamp();
    const r2 = radius * radius;
    let counted = 0;

    for (let c = 0; c < boxCells; c++) {
      let local = first + c;
      if (local >= boxCells) local -= boxCells;
      let cx = (minX + (local % spanX)) % cols;
      let cy = (minY + ((local / spanX) | 0)) % rows;
      if (cx < 0) cx += cols;
      if (cy < 0) cy += rows;
      const cell = cy * cols + cx;
      if (stamps[cell] === stamp) continue;
      stamps[cell] = stamp;

      const start = starts[cell];
      const len = starts[cell + 1] - start;
      if (len === 0) continue;
      const offset = rotate % len;

      for (let t = 0; t < len; t++) {
        let slot = offset + t;
        if (slot >= len) slot -= len;
        const j = items[start + slot];
        let dx = pos[j * 2] - x;
        let dy = pos[j * 2 + 1] - y;
        if (dx > halfW) dx -= width;
        else if (dx < -halfW) dx += width;
        if (dy > halfH) dy -= height;
        else if (dy < -halfH) dy += height;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && fn(j, dx, dy, d2) && ++counted >= limit) return counted;
      }
    }
    return counted;
  }

  /**
   * Collects the k nearest neighbours using expanding cell rings. Stops once
   * no later ring can hold a closer point than the current kth neighbour.
   * Writes indices into outIdx and squared distances into outDist.
   */
  collectNearest(x, y, k, maxRadius, exclude, outIdx, outDist) {
    const { cols, rows, cellW, cellH, starts, items, pos, stamps, width, height, halfW, halfH } = this;
    const ccx = Math.min(cols - 1, Math.max(0, (x / cellW) | 0));
    const ccy = Math.min(rows - 1, Math.max(0, (y / cellH) | 0));
    const cellMin = Math.min(cellW, cellH);
    const maxRing = Math.min(
      Math.ceil(maxRadius / cellMin),
      Math.ceil(Math.max(cols, rows) / 2),
    );
    const r2 = maxRadius * maxRadius;
    const stamp = this.#nextStamp();
    let found = 0;
    let worst = -1;

    for (let ring = 0; ring <= maxRing; ring++) {
      for (let oy = -ring; oy <= ring; oy++) {
        const edgeRow = oy === -ring || oy === ring;
        const stepX = edgeRow ? 1 : 2 * ring || 1;
        for (let ox = -ring; ox <= ring; ox += stepX) {
          let cx = (ccx + ox) % cols;
          let cy = (ccy + oy) % rows;
          if (cx < 0) cx += cols;
          if (cy < 0) cy += rows;
          const cell = cy * cols + cx;
          if (stamps[cell] === stamp) continue;
          stamps[cell] = stamp;

          const end = starts[cell + 1];
          for (let t = starts[cell]; t < end; t++) {
            const j = items[t];
            if (j === exclude) continue;
            let dx = pos[j * 2] - x;
            let dy = pos[j * 2 + 1] - y;
            if (dx > halfW) dx -= width;
            else if (dx < -halfW) dx += width;
            if (dy > halfH) dy -= height;
            else if (dy < -halfH) dy += height;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2 || d2 === 0) continue;

            if (found < k) {
              outIdx[found] = j;
              outDist[found] = d2;
              found++;
              if (found === k) worst = worstIndex(k, outDist);
            } else if (d2 < outDist[worst]) {
              outIdx[worst] = j;
              outDist[worst] = d2;
              worst = worstIndex(k, outDist);
            }
          }
        }
      }

      // Every unvisited cell is at least `ring` whole cells away.
      if (found === k && ring * cellMin >= Math.sqrt(outDist[worst])) break;
    }

    return found;
  }
}

function worstIndex(count, outDist) {
  let worst = 0;
  for (let m = 1; m < count; m++) {
    if (outDist[m] > outDist[worst]) worst = m;
  }
  return worst;
}