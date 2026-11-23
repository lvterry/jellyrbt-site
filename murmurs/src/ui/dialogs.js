let dialog;
let titleEl;
let descEl;
let fieldEl;
let labelEl;
let inputEl;
let confirmEl;
let cancelEl;
let resolveFn = null;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.setAttribute('aria-describedby', 'dialog-desc');
  dialog.innerHTML = `
    <form class="dialog-form" method="dialog">
      <div class="dialog-head">
        <h2 id="dialog-title"></h2>
        <button type="button" class="icon-btn dialog-close" data-dialog-cancel aria-label="Close dialog"></button>
      </div>
      <p id="dialog-desc" class="dialog-desc"></p>
      <div class="dialog-field">
        <label id="dialog-label" for="dialog-input"></label>
        <input id="dialog-input" type="text" maxlength="80" autocomplete="off" spellcheck="false">
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-dialog-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary" data-dialog-confirm>Save</button>
      </div>
    </form>`;

  document.body.append(dialog);
  titleEl = dialog.querySelector('#dialog-title');
  descEl = dialog.querySelector('#dialog-desc');
  fieldEl = dialog.querySelector('.dialog-field');
  labelEl = dialog.querySelector('#dialog-label');
  inputEl = dialog.querySelector('#dialog-input');
  confirmEl = dialog.querySelector('[data-dialog-confirm]');
  cancelEl = dialog.querySelector('[data-dialog-cancel]');
  dialog.querySelector('.dialog-close').innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  dialog.querySelectorAll('[data-dialog-cancel]').forEach((button) => {
    button.addEventListener('click', () => dialog.close());
  });

  inputEl.addEventListener('input', () => {
    confirmEl.disabled = fieldEl.hidden ? false : inputEl.value.trim() === '';
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    if (!resolveFn) return;
    const resolve = resolveFn;
    resolveFn = null;
    resolve(null);
  });

  dialog.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!resolveFn) return;
    const resolve = resolveFn;
    resolveFn = null;
    const value = fieldEl.hidden ? true : inputEl.value.trim();
    dialog.close();
    resolve(value);
  });
}

function prepare({ title, description, label, value, confirmText, danger, withField }) {
  if (!dialog) build();
  titleEl.textContent = title;
  descEl.textContent = description || '';
  descEl.hidden = !description;
  fieldEl.hidden = !withField;
  labelEl.textContent = label || '';
  inputEl.value = value || '';
  confirmEl.textContent = confirmText || 'Save';
  confirmEl.classList.toggle('btn-danger', Boolean(danger));
  confirmEl.classList.toggle('btn-primary', !danger);
  confirmEl.disabled = withField && !inputEl.value.trim();
}

export function promptDialog({
  title,
  description = '',
  label = 'Name',
  value = '',
  confirmText = 'Save',
}) {
  if (!dialog) build();
  prepare({ title, description, label, value, confirmText, danger: false, withField: true });
  return new Promise((resolve) => {
    resolveFn = resolve;
    dialog.showModal();
    inputEl.focus();
    inputEl.select();
  });
}

export function confirmDialog({
  title,
  description = '',
  confirmText = 'Confirm',
  danger = false,
}) {
  if (!dialog) build();
  prepare({ title, description, confirmText, danger, withField: false });
  return new Promise((resolve) => {
    resolveFn = resolve;
    dialog.showModal();
    confirmEl.focus();
  });
}