import { PARAM_GROUPS, PARAM_SCHEMA } from '../variants/paramSchema.js';
import { icon } from './icons.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decimalsFor(step) {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function formatValue(key, spec, value) {
  if (spec.type === 'int') return String(value);
  const text = Number(value).toFixed(decimalsFor(spec.step));
  return key === 'fovDegrees' ? `${text}°` : text;
}

function controlMarkup(key, spec, value) {
  const id = `param-${key}`;
  const label = escapeHtml(spec.label);
  const hint = spec.hint ? `<p class="param-hint">${escapeHtml(spec.hint)}</p>` : '';

  if (spec.type === 'enum') {
    const options = (spec.options || spec.values.map((v) => [v, v]))
      .map(
        ([optionValue, optionLabel]) =>
          `<option value="${escapeHtml(optionValue)}"${optionValue === value ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`,
      )
      .join('');
    return `
      <div class="param-control" data-key="${key}">
        <div class="param-label-row"><label for="${id}">${label}</label></div>
        <select id="${id}" data-param="${key}">${options}</select>
        ${hint}
      </div>`;
  }

  if (spec.type === 'color') {
    return `
      <div class="param-control" data-key="${key}">
        <div class="param-label-row">
          <label for="${id}">${label}</label>
          <output id="${id}-value" for="${id}" class="param-value">${escapeHtml(value)}</output>
        </div>
        <div class="color-row">
          <input id="${id}" type="color" data-param="${key}" value="${escapeHtml(value)}">
        </div>
        ${hint}
      </div>`;
  }

  const isInteger = spec.type === 'int';
  return `
    <div class="param-control" data-key="${key}">
      <div class="param-label-row">
        <label for="${id}">${label}</label>
        <output id="${id}-value" for="${id}" class="param-value">${escapeHtml(formatValue(key, spec, value))}</output>
      </div>
      <input
        id="${id}"
        type="range"
        data-param="${key}"
        min="${spec.min}"
        max="${spec.max}"
        step="${spec.step}"
        value="${value}"
        ${isInteger ? 'inputmode="numeric"' : ''}
      >
      ${hint}
    </div>`;
}

export class ParamPanel {
  constructor(root, callbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.collapsed = false;
    this.variant = null;
  }

  setCollapsed(collapsed) {
    this.collapsed = collapsed;
    this.root.classList.toggle('is-collapsed', collapsed);
    const body = this.root.querySelector('.panel-body');
    if (body) body.hidden = collapsed;
    const toggle = this.root.querySelector('[data-action="collapse"]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Show parameters' : 'Hide parameters');
      toggle.innerHTML = icon(collapsed ? 'chevronRight' : 'chevronDown');
    }
  }

  toggleCollapsed() {
    this.setCollapsed(!this.collapsed);
  }

  setNote(text) {
    const note = this.root.querySelector('.panel-note');
    if (note) note.textContent = text;
  }

  setAlgorithm(algorithm) {
    const chip = this.root.querySelector('.chip-algo');
    if (chip) chip.textContent = algorithm;
  }

  render(variant, { isUser = false, presetCount = 0, note = '' } = {}) {
    this.variant = variant;
    const params = variant.params;

    const groups = PARAM_GROUPS.map((group) => {
      const controls = Object.entries(PARAM_SCHEMA)
        .filter(([, spec]) => spec.group === group.id)
        .map(([key, spec]) => controlMarkup(key, spec, params[key]))
        .join('');
      return `
        <div class="param-group" role="group" aria-label="${escapeHtml(group.label)}">
          <h3 class="param-group-title">${escapeHtml(group.label)}</h3>
          <div class="param-grid">${controls}</div>
        </div>`;
    }).join('');

    const presetLabel = presetCount
      ? `${presetCount} saved preset${presetCount === 1 ? '' : 's'} derived from this variant`
      : '';

    this.root.innerHTML = `
      <div class="panel-head">
        <div class="panel-heading">
          <p class="panel-eyebrow">Parameters</p>
          <div class="panel-title-row">
            <h2 id="panel-variant-name">${escapeHtml(variant.name)}</h2>
            <span class="chip chip-algo">${escapeHtml(params.algorithm)}</span>
            <span class="panel-note">${escapeHtml(note)}</span>
          </div>
          ${presetLabel ? `<p class="panel-preset-note">${escapeHtml(presetLabel)}</p>` : ''}
        </div>
        <div class="panel-actions">
          <button type="button" class="btn btn-primary" data-action="save">${icon('star')}<span class="btn-label">Save preset</span></button>
          <button type="button" class="btn" data-action="reset">${icon('rotate')}<span class="btn-label">Reset</span></button>
          <button type="button" class="btn" data-action="duplicate">${icon('copy')}<span class="btn-label">Duplicate</span></button>
          ${isUser ? `<button type="button" class="btn btn-ghost-danger" data-action="delete">${icon('trash')}<span class="btn-label">Delete</span></button>` : ''}
          <button type="button" class="icon-btn panel-collapse" data-action="collapse" aria-expanded="true" aria-label="Hide parameters">${icon('chevronDown')}</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="param-columns">${groups}</div>
      </div>`;

    this.#bind();
    this.setCollapsed(this.collapsed);
  }

  #bind() {
    for (const input of this.root.querySelectorAll('[data-param]')) {
      const key = input.dataset.param;
      const spec = PARAM_SCHEMA[key];
      const output = this.root.querySelector(`#param-${key}-value`);

      const update = () => {
        let value;
        if (spec.type === 'color') value = input.value;
        else if (spec.type === 'enum') value = input.value;
        else value = Number(input.value);

        if (output) {
          output.textContent =
            spec.type === 'color' ? value : formatValue(key, spec, value);
        }
        if (key === 'algorithm') {
          this.#syncDependentControls(value);
        }
        this.callbacks.onChange(key, value);
      };

      input.addEventListener(spec.type === 'enum' ? 'change' : 'input', update);
    }

    this.root.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        switch (button.dataset.action) {
          case 'save':
            this.callbacks.onSave();
            break;
          case 'reset':
            this.callbacks.onReset();
            break;
          case 'duplicate':
            this.callbacks.onDuplicate();
            break;
          case 'delete':
            this.callbacks.onDelete();
            break;
          case 'collapse':
            this.toggleCollapsed();
            break;
          default:
            break;
        }
      });
    });

    this.#syncDependentControls(this.variant?.params.algorithm);
  }

  #syncDependentControls(algorithm) {
    const control = this.root.querySelector('[data-key="kNeighbors"]');
    if (!control) return;
    const input = control.querySelector('input');
    const disabled = algorithm !== 'topological';
    control.classList.toggle('is-disabled', disabled);
    if (input) input.disabled = disabled;
  }
}