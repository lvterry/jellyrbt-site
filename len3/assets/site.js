import index from './search-index.js';

const siteRoot = new URL('../', import.meta.url);
const html = document.documentElement;
const themeButton = document.querySelector('[data-theme-toggle]');
function updateThemeLabel() {
  themeButton.setAttribute('aria-label', `Switch to ${html.dataset.theme === 'dark' ? 'light' : 'dark'} theme`);
}
updateThemeLabel();
themeButton.addEventListener('click', () => {
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  updateThemeLabel();
  try { localStorage.setItem('len3:theme', next); } catch {}
});

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#docs-nav');
const activeNavLink = navigation.querySelector('[aria-current="page"]');
function revealCurrentPage() {
  if (!navigation.clientHeight) return;
  const link = activeNavLink.getBoundingClientRect();
  const panel = navigation.getBoundingClientRect();
  if (link.top < panel.top || link.bottom > panel.bottom) {
    navigation.scrollTop += link.top - panel.top - panel.height / 3;
  }
}
revealCurrentPage();
function setMenu(open) {
  navigation.toggleAttribute('data-open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', `${open ? 'Close' : 'Open'} documentation menu`);
  if (open) revealCurrentPage();
}
menu.addEventListener('click', () => setMenu(!navigation.hasAttribute('data-open')));
document.addEventListener('click', event => {
  if (navigation.hasAttribute('data-open') && !navigation.contains(event.target) && !menu.contains(event.target)) setMenu(false);
});
document.querySelector('[data-copy-link]').addEventListener('click', async event => {
  const label = event.currentTarget.querySelector('span');
  try {
    await navigator.clipboard.writeText(location.href);
    label.textContent = 'Link copied';
  } catch {
    label.textContent = 'Could not copy link';
  }
  window.setTimeout(() => { label.textContent = 'Copy page link'; }, 2000);
});

const search = document.querySelector('.search-dialog');
const input = search.querySelector('input');
const list = search.querySelector('.search-body');
const status = search.querySelector('.search-status');
const trigger = document.querySelector('[data-open-search]');
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
trigger.querySelector('[data-shortcut]').textContent = mac ? '⌘ K' : 'Ctrl K';
const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const entries = index.map(([path, title, section, description]) => ({
  path, title, section, normalizedTitle: normalize(title), haystack: normalize(`${title} ${section} ${description}`),
}));
function searchDocs(query) {
  const term = normalize(query);
  if (!term) return entries.filter(entry => ['','foundations/','components/','product-components/'].includes(entry.path));
  const words = term.split(' ');
  return entries.filter(entry => words.every(word => entry.haystack.includes(word))).sort((a, b) => rank(b) - rank(a));
  function rank(entry) {
    return (entry.normalizedTitle === term ? 20 : entry.normalizedTitle.startsWith(term) ? 10 : 0)
      + words.filter(word => entry.normalizedTitle.includes(word)).length;
  }
}
function renderSearch() {
  const matches = searchDocs(input.value);
  const fragment = document.createDocumentFragment();
  for (const result of matches.slice(0, 10)) {
    const link = document.createElement('a');
    link.href = new URL(result.path, siteRoot);
    const title = document.createElement('span');
    title.textContent = result.title;
    const group = document.createElement('small');
    group.textContent = result.section;
    link.append(title, group);
    fragment.append(link);
  }
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No results. Try a component name or token, such as “Button” or “Text”.';
    fragment.append(empty);
  }
  list.replaceChildren(fragment);
  status.textContent = input.value ? `${matches.length} matching results` : 'Browse the documentation sections';
}
function openSearch() {
  if (search.open) return;
  setMenu(false);
  input.value = '';
  renderSearch();
  search.showModal();
}
trigger.addEventListener('click', openSearch);
document.addEventListener('keydown', event => {
  if ((mac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (search.open) search.close();
    else openSearch();
  } else if (event.key === 'Escape' && navigation.hasAttribute('data-open')) {
    setMenu(false);
    menu.focus();
  }
});
search.addEventListener('close', () => trigger.focus({ preventScroll: true }));
search.addEventListener('click', event => { if (event.target === search) search.close(); });
input.addEventListener('input', renderSearch);
list.addEventListener('click', event => { if (event.target.closest('a')) search.close(); });
search.addEventListener('keydown', event => {
  const results = [...list.querySelectorAll('a')];
  if (!results.length) return;
  const current = results.indexOf(document.activeElement);
  if (event.key === 'Enter' && document.activeElement === input) {
    event.preventDefault();
    results[0].click();
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const next = event.key === 'ArrowDown' ? (current + 1) % results.length : current - 1;
  if (next < 0) input.focus();
  else results[next].focus();
});

const playground = document.querySelector('[data-playground]');
if (playground) {
  const stage = playground.querySelector('[data-stage]');
  const controls = [...playground.querySelectorAll('[data-property]')];
  const views = [...playground.querySelectorAll('template[data-view]')].map(template => ({ template, props: JSON.parse(template.dataset.props) }));
  const flag = playground.querySelector('[data-right-icon]');
  const mode = playground.querySelector('[data-preview-mode]');
  mode.addEventListener('click', () => {
    const dark = stage.dataset.mode !== 'dark';
    stage.dataset.mode = dark ? 'dark' : 'light';
    mode.setAttribute('aria-pressed', String(dark));
    mode.querySelector('span').textContent = dark ? 'Dark preview' : 'Light preview';
  });
  function updatePreview(changed) {
    const prioritized = changed ? [changed, ...controls.filter(control => control !== changed)] : controls;
    const matches = view => prioritized.reduce((score, control) => score * 2 + Number(view.props[control.dataset.property] === control.value), 0);
    const view = views.reduce((best, candidate) => matches(candidate) > matches(best) ? candidate : best);
    const { template, props } = view;
    for (const control of controls) control.value = props[control.dataset.property];
    const source = flag && flag.value !== 'Hidden' ? playground.querySelector(`template[data-view-icon="${template.dataset.view}-${flag.value}"]`) : template;
    stage.replaceChildren(source.content.cloneNode(true));
    setIndeterminate(stage);
    const link = playground.querySelector('[data-variant-link]');
    link.hidden = !template.dataset.url;
    if (template.dataset.url) link.href = template.dataset.url;
    else link.removeAttribute('href');
    playground.querySelector('[data-preview-only]').hidden = !link.hidden;
  }
  controls.forEach(control => control.addEventListener('change', () => updatePreview(control)));
  flag?.addEventListener('change', () => updatePreview());
}

function setIndeterminate(scope) {
  scope.querySelectorAll('input[data-indeterminate]').forEach(checkbox => { checkbox.indeterminate = true; });
}
setIndeterminate(document);

function activateTab(tab) {
  for (const sibling of tab.parentElement.querySelectorAll('[role="tab"]')) {
    const selected = sibling === tab;
    sibling.setAttribute('aria-selected', String(selected));
    sibling.tabIndex = selected ? 0 : -1;
    document.getElementById(sibling.getAttribute('aria-controls')).hidden = !selected;
  }
}

document.querySelector('main').addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.matches('[data-preview-action]')) target.parentElement.querySelector('[role="status"]').textContent = 'Example action run.';
  if (target.matches('[data-preview-nav]')) {
    target.parentElement.querySelectorAll('[data-preview-nav]').forEach(item => item.setAttribute('aria-current', item === target ? 'page' : 'false'));
  }
  if (target.matches('[role="tab"]')) activateTab(target);
  if (target.matches('[data-open-preview]')) target.parentElement.querySelector('dialog').showModal();
  if (target.matches('[data-toast-close], [data-toast-open]')) {
    const stack = target.closest('.p-stack');
    const toast = stack.querySelector('.p-toast');
    const show = stack.querySelector('[data-toast-open]');
    toast.hidden = !toast.hidden;
    show.hidden = !toast.hidden;
    (toast.hidden ? show : toast.querySelector('button')).focus();
  }
  if (target.matches('[data-progress-cancel]')) {
    const example = target.closest('.p-progress-example');
    example.querySelector('p').hidden = false;
    target.disabled = true;
  }
  if (target.matches('[data-demo-only]')) {
    target.closest('.p-composer-example').querySelector('.p-status').textContent = 'Attachments and recording are shown for reference only.';
  }
});

document.querySelector('main').addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(tab);
  const next = { Home: 0, End: tabs.length - 1, ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length }[event.key];
  event.preventDefault();
  activateTab(tabs[next]);
  tabs[next].focus();
});

document.querySelector('main').addEventListener('input', event => {
  const composer = event.target.closest('[data-composer]');
  if (composer) composer.querySelector('button[type="submit"],button:not([type])').disabled = !event.target.value.trim();
});
document.querySelector('main').addEventListener('submit', event => {
  const composer = event.target.closest('[data-composer]');
  if (!composer) return;
  event.preventDefault();
  const field = composer.querySelector('input');
  const message = field.value.trim();
  if (!message) return;
  const sent = composer.parentElement.querySelector('.p-sent');
  const row = document.createElement('div');
  row.className = 'p-bubble-row';
  row.dataset.alignment = 'end';
  const bubble = document.createElement('div');
  bubble.className = 'p-bubble';
  bubble.dataset.sender = 'agent';
  bubble.textContent = message;
  row.append(bubble);
  sent.replaceChildren(row);
  sent.hidden = false;
  field.value = '';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  composer.parentElement.querySelector('.p-status').textContent = 'Message sent in the preview.';
});

const toc = [...document.querySelectorAll('.page-index li a')];
let currentHeading;
function markHeading() {
  const active = toc.findLast(link => document.getElementById(link.hash.slice(1)).getBoundingClientRect().top < 115);
  if (currentHeading === active) return;
  currentHeading?.removeAttribute('aria-current');
  active?.setAttribute('aria-current', 'true');
  currentHeading = active;
}
window.addEventListener('scroll', markHeading, { passive: true });
markHeading();
