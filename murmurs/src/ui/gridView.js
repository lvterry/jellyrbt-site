import { Renderer } from '../render/renderer.js';
import { icon } from './icons.js';

/**
 * One persistent canvas per variant. Cells are created when a variant appears
 * and removed when it is deleted; they are never rebuilt per frame or per
 * param change, which keeps memory flat in long sessions.
 */
export class GridView {
  constructor(root, { onOpen }) {
    this.root = root;
    this.onOpen = onOpen;
    this.cells = new Map();
    this.visible = new Set();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.dataset.variantId;
          if (entry.isIntersecting) this.visible.add(id);
          else this.visible.delete(id);
        }
      },
      { root: null, rootMargin: '80px' },
    );
  }

  sync(variants) {
    const wanted = new Set(variants.map((variant) => variant.id));
    for (const [id, cell] of this.cells) {
      if (wanted.has(id)) continue;
      this.observer.unobserve(cell.el);
      cell.el.remove();
      this.cells.delete(id);
      this.visible.delete(id);
    }

    variants.forEach((variant, index) => {
      let cell = this.cells.get(variant.id);
      if (!cell) cell = this.#createCell(variant);
      this.#label(cell, variant, index);
      // appendChild moves existing nodes, so order follows `variants`
      // without recreating canvases.
      if (this.root.children[index] !== cell.el) {
        this.root.insertBefore(cell.el, this.root.children[index] || null);
      }
    });
  }

  #createCell(variant) {
    const el = document.createElement('article');
    el.className = 'grid-cell';
    el.dataset.variantId = variant.id;
    el.innerHTML = `
      <button type="button" class="grid-open">
        <canvas aria-hidden="true"></canvas>
        <span class="grid-caption">
          <span class="grid-index"></span>
          <span class="grid-name"></span>
          <span class="grid-meta"></span>
        </span>
        <span class="grid-expand" aria-hidden="true">${icon('expand', 14)}</span>
      </button>`;

    const button = el.querySelector('.grid-open');
    button.addEventListener('click', () => this.onOpen(variant.id));

    const cell = {
      el,
      button,
      renderer: new Renderer(el.querySelector('canvas'), { maxDpr: 1.5 }),
      index: el.querySelector('.grid-index'),
      name: el.querySelector('.grid-name'),
      meta: el.querySelector('.grid-meta'),
    };
    this.cells.set(variant.id, cell);
    this.observer.observe(el);
    return cell;
  }

  #label(cell, variant, index) {
    const number = String(index + 1).padStart(2, '0');
    cell.index.textContent = number;
    cell.name.textContent = variant.name;
    cell.meta.textContent = variant.params.algorithm;
    cell.button.setAttribute(
      'aria-label',
      `Open variant ${number}, ${variant.name}, ${variant.params.algorithm}, in single view`,
    );
  }

  updateLabels(variants) {
    variants.forEach((variant, index) => {
      const cell = this.cells.get(variant.id);
      if (cell) this.#label(cell, variant, index);
    });
  }

  setSelected(id) {
    for (const [cellId, cell] of this.cells) {
      cell.el.classList.toggle('is-selected', cellId === id);
    }
  }

  scrollTo(id) {
    this.cells.get(id)?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  focus(id) {
    this.cells.get(id)?.button.focus({ preventScroll: false });
  }

  renderer(id) {
    return this.cells.get(id)?.renderer ?? null;
  }

  isVisible(id) {
    return this.visible.has(id);
  }
}