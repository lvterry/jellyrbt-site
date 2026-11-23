import { icon } from './icons.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ALGO_SHORT = { boids: 'Boids', vicsek: 'Vicsek', topological: 'Topo' };

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Sidebar: working variants on top (defaults + duplicates/spawned presets),
 * saved presets below. Rendering is cheap and only happens on structural
 * changes (select, save, rename, delete), never per animation frame.
 */
export class PresetList {
  constructor(root, callbacks) {
    this.root = root;
    this.callbacks = callbacks;
    root.addEventListener('click', (event) => this.#onClick(event));
  }

  render({ variants, presets, selectedId }) {
    const starred = new Set(presets.map((preset) => preset.baseVariantId).filter(Boolean));

    const variantItems = variants
      .map((variant, index) => {
        const selected = variant.id === selectedId;
        const star = starred.has(variant.id)
          ? `<span class="badge-star" title="Saved as preset">${icon('star', 12)}<span class="visually-hidden">Saved as preset</span></span>`
          : '';
        const user = variant.source === 'user'
          ? '<span class="badge-user" title="Your variant">copy</span>'
          : '';
        return `
          <li>
            <button type="button" class="variant-item${selected ? ' is-selected' : ''}" data-select="${escapeHtml(variant.id)}" aria-current="${selected ? 'true' : 'false'}">
              <span class="variant-swatch" style="--swatch:${escapeHtml(variant.params.background)}" aria-hidden="true"></span>
              <span class="variant-index">${String(index + 1).padStart(2, '0')}</span>
              <span class="variant-name">${escapeHtml(variant.name)}</span>
              ${user}
              ${star}
              <span class="variant-algo">${ALGO_SHORT[variant.params.algorithm]}</span>
            </button>
          </li>`;
      })
      .join('');

    const presetItems = presets.length
      ? presets
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((preset) => {
            const created = dateFormat.format(new Date(preset.createdAt));
            const name = escapeHtml(preset.name);
            return `
              <li class="preset-item">
                <button type="button" class="preset-apply" data-apply="${escapeHtml(preset.id)}" title="Apply to the selected variant">
                  <span class="preset-name">${name}</span>
                  <span class="preset-meta">${ALGO_SHORT[preset.params.algorithm]} · ${preset.params.numBirds} birds · ${escapeHtml(created)}</span>
                </button>
                <div class="preset-actions">
                  <button type="button" class="icon-btn icon-btn-sm" data-spawn="${escapeHtml(preset.id)}" aria-label="Open ${name} as a new variant" title="Open as new variant">${icon('fork', 14)}</button>
                  <button type="button" class="icon-btn icon-btn-sm" data-rename="${escapeHtml(preset.id)}" aria-label="Rename ${name}" title="Rename">${icon('edit', 14)}</button>
                  <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-delete="${escapeHtml(preset.id)}" aria-label="Delete ${name}" title="Delete">${icon('trash', 14)}</button>
                </div>
              </li>`;
          })
          .join('')
      : `<li class="preset-empty">
           <p>No presets yet.</p>
           <p>Tune a variant, then choose <strong>Save preset</strong>. Presets stay in this browser and can be exported as JSON.</p>
         </li>`;

    this.root.innerHTML = `
      <section class="sidebar-section" aria-labelledby="variants-heading">
        <div class="sidebar-heading">
          <h2 id="variants-heading">Variants</h2>
          <span class="count">${variants.length}</span>
        </div>
        <ul class="variant-list">${variantItems}</ul>
      </section>
      <section class="sidebar-section" aria-labelledby="presets-heading">
        <div class="sidebar-heading">
          <h2 id="presets-heading">Saved presets</h2>
          <span class="count">${presets.length}</span>
        </div>
        <ul class="preset-list">${presetItems}</ul>
      </section>`;
  }

  #onClick(event) {
    const target = event.target.closest('button');
    if (!target || !this.root.contains(target)) return;
    const { select, apply, spawn, rename } = target.dataset;
    if (select) this.callbacks.onSelect(select);
    else if (apply) this.callbacks.onApplyPreset(apply);
    else if (spawn) this.callbacks.onSpawnPreset(spawn);
    else if (rename) this.callbacks.onRenamePreset(rename);
    else if (target.dataset.delete) this.callbacks.onDeletePreset(target.dataset.delete);
  }

  focusSelected() {
    this.root.querySelector('.variant-item.is-selected')?.scrollIntoView({ block: 'nearest' });
  }
}