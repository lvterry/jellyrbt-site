import { Renderer } from '../render/renderer.js';
import { icon } from './icons.js';

/** One large canvas that shows whichever variant is selected. */
export class SingleView {
  constructor(root, { onBack, onPrev, onNext, onReseed }) {
    this.root = root;
    root.innerHTML = `
      <div class="single-bar">
        <button type="button" class="btn btn-quiet" data-single="back">${icon('grid')}<span class="btn-label">All variants</span></button>
        <div class="single-title">
          <span class="single-index"></span>
          <h2 class="single-name"></h2>
          <span class="chip chip-algo single-algo"></span>
        </div>
        <div class="single-nav">
          <button type="button" class="icon-btn" data-single="reseed" aria-label="Restart with a new seed" title="Restart with a new seed">${icon('rotate')}</button>
          <button type="button" class="icon-btn" data-single="prev" aria-label="Previous variant" title="Previous (←)">${icon('chevronLeft')}</button>
          <button type="button" class="icon-btn" data-single="next" aria-label="Next variant" title="Next (→)">${icon('chevronRight')}</button>
        </div>
      </div>
      <div class="single-stage">
        <canvas class="single-canvas" role="img" aria-label=""></canvas>
      </div>`;

    this.canvas = root.querySelector('canvas');
    this.renderer = new Renderer(this.canvas, { maxDpr: 2 });
    this.indexEl = root.querySelector('.single-index');
    this.nameEl = root.querySelector('.single-name');
    this.algoEl = root.querySelector('.single-algo');
    this.currentId = null;

    const actions = { back: onBack, prev: onPrev, next: onNext, reseed: onReseed };
    root.querySelectorAll('[data-single]').forEach((button) => {
      button.addEventListener('click', () => actions[button.dataset.single]());
    });
  }

  show(variant, index) {
    if (this.currentId !== variant.id) this.renderer.invalidate();
    this.currentId = variant.id;
    const number = String(index + 1).padStart(2, '0');
    this.indexEl.textContent = number;
    this.nameEl.textContent = variant.name;
    this.algoEl.textContent = variant.params.algorithm;
    this.canvas.setAttribute(
      'aria-label',
      `Variant ${number}, ${variant.name}: ${variant.params.numBirds} birds using the ${variant.params.algorithm} algorithm.`,
    );
  }

  focusBack() {
    this.root.querySelector('[data-single="back"]').focus();
  }
}