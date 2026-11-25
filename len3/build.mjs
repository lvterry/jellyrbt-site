import { mkdirSync, writeFileSync } from 'node:fs';
import { groups, foundations, core, product, figma, nodeUrl } from './src/content.mjs';
import { data, esc, slug, icon, preview } from './src/specimens.mjs';

const inventory = data('inventory');
const dimensions = data('dimensions');
const colors = data('semantic-colors');
const types = data('type');
const iconNames = Object.keys(inventory).filter(name => name.startsWith('Icon / '));
const colorRows = (group, prefix = '') => Object.entries(group).flatMap(([name, item]) => {
  const key = prefix ? `${prefix}/${name}` : name;
  return item.$value ? [[key, item.$extensions['com.len3.modes']]] : colorRows(item, key);
});
const cssName = key => `--l3-${slug(key)}`;
const colorValue = ({ components, alpha = 1 }) => `color(srgb ${components.join(' ')}${alpha === 1 ? '' : ` / ${alpha}`} )`;
const dimValue = ({ $value }) => `${$value.value}${$value.unit}`;
const save = (file, text) => {
  const url = new URL(file, import.meta.url);
  mkdirSync(new URL('.', url), { recursive: true });
  writeFileSync(url, text);
};
const tokenCss = `[data-len3] {\n  color-scheme: light;\n${colorRows(colors).map(([key, modes]) => `  ${cssName(key)}: ${colorValue(modes.Light)};`).join('\n')}\n${Object.entries(dimensions).flatMap(([group, values]) => Object.entries(values).map(([key, token]) => `  ${cssName(`${group}/${key}`)}: ${dimValue(token)};`)).join('\n')}\n  --l3-elevation-control: 0 1px 2px rgb(0 0 0 / .05);\n  --l3-elevation-overlay: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1);\n}\n[data-len3][data-mode="dark"], :root[data-theme="dark"] [data-len3]:not([data-mode="light"]) {\n  color-scheme: dark;\n${colorRows(colors).map(([key, modes]) => `  ${cssName(key)}: ${colorValue(modes.Dark)};`).join('\n')}\n}\n`;
save('./assets/tokens.css', tokenCss);

const page = (section, [id, title, description, usage, details]) => ({ section, id, title, description, usage, details, path: `${section.id}/${id}/` });
const overview = { id: 'overview', path: '', title: 'Len3 Design System', description: 'Foundations, components, and product UI for Len3.', node: '0:1' };
const sections = [foundations, [...core, ['icons', 'Icons', 'The icon instances used across the Len3 library.']], product].map((items, i) => {
  const section = { ...groups[i], path: `${groups[i].id}/` };
  section.pages = items.map(item => page(section, item));
  return section;
});
const pages = [overview, ...sections.flatMap(section => [section, ...section.pages])];
for (const item of pages) {
  if (item.section && inventory[item.title]) item.node = inventory[item.title][0][0];
  else item.node ??= item.section?.node;
}

const headings = list => list.map(([id, title, body]) => `<section class="doc-section" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${body}</section>`).join('');
const figLink = (id, label = 'Open in Figma') => `<a href="${nodeUrl(id)}" target="_blank" rel="noreferrer">${label} ${icon('ArrowUpRight', 13)}</a>`;
const download = (url, label) => `<a href="${url}" download>${label} ${icon('ArrowRight', 14)}</a>`;
const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr><th scope="row">${cells[0]}</th>${cells.slice(1).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const token = key => `<code>${esc(key)}</code>`;
const cardList = (items, root, numbered = false) => `<div class="doc-cards">${items.map(item => `<a class="doc-card" href="${root}${item.path}">${numbered ? `<span class="card-number">${item.number}</span>` : ''}<span><strong>${esc(item.title)}</strong><span>${esc(item.description)}</span></span>${icon('ArrowRight', 15)}</a>`).join('')}</div>`;
const eyebrow = label => `<span class="eyebrow">${label}</span>`;

function overviewContent(root) {
  return [
    ['explore', 'Explore the system', `<p>Start with foundations to choose tokens, then use the component reference to check variants, states and how they fit together.</p>${cardList(sections, root, true)}`],
    ['in-practice', 'In practice', `<p>Here’s how Len3’s type, semantic color and component styles come together in a report.</p><div class="showcase"><div class="panel-bar">${eyebrow('Product preview')}<a href="${root}product-components/finding/">Finding ${icon('ArrowUpRight', 13)}</a></div><div class="showcase-body" data-len3>${preview('property-summary')}${preview('report-section')}</div></div>`],
    ['start', 'Designing with Len3', `<ol><li>Pick the Light or Dark mode and use named roles like ${token('Text/Primary')} and ${token('Surface/Elevated')} instead of raw colors.</li><li>Choose a component with the interaction you need. Check the specimen and its Figma properties before making a new variant.</li><li>Use product components for shared property, client, report and chat layouts.</li></ol><p data-source-note>Figma is the source of truth. This site uses the November 3 design-system audit and handoff, plus the November 24 Input update.</p>`]
  ];
}

function foundationContent(id, root) {
  switch (id) {
    case 'colors': return [
      ['usage', 'Using color', `<p>Bind to the semantic role, not a raw swatch. Start with the Background role for the region, then choose the matching Surface, Text, Border and Action roles. Keep the foreground paired with its own background for Action, Selection and Risk.</p><p>Both modes are shown below. Translucent tokens keep their alpha and are shown over the matching canvas.</p><p>${download(`${root}data/semantic-colors.json`, 'Download color tokens')} · ${download(`${root}assets/tokens.css`, 'Download CSS')}</p>`],
      ...Object.entries(colors).map(([group, entries]) => [slug(group), group, table(['Token', 'Light', 'Dark'], colorRows(entries, group).map(([key, modes]) => [token(key), ...['Light', 'Dark'].map(mode => { const color = modes[mode]; return `<span class="swatch-cell"><span class="swatch" data-len3 data-mode="${mode.toLowerCase()}"><i style="background:${colorValue(color)}"></i></span><code>${color.hex}${color.alpha < 1 ? ` · ${Number((color.alpha * 100).toFixed(1))}%` : ''}</code></span>`; })]))])
    ];
    case 'typography': return [
      ['type-styles', 'Type styles', `<p>Use Manrope Variable. The weight steps are deliberate: keep 450 for body and 550 for finding titles rather than rounding to the nearest static weight. The handoff records the metrics for the 11 styles below; the Figma audit counted 13.</p><div class="type-list" data-len3>${types.map(([name, size, weight, leading, tracking, usage]) => `<div class="type-entry"><div class="type-sample" style="font-size:${size}px;font-weight:${weight};line-height:${leading}px;letter-spacing:${tracking}px">${esc(name)}</div><div><p>${esc(usage)}</p><code>${size}px · ${weight} · ${leading}px leading · ${tracking}px tracking</code></div></div>`).join('')}</div>`],
      ['application', 'Application', '<p>Use Heading / Page at the top of a view and Title / Section inside it. Use Body / Reading for long-form content and Body / Report for report excerpts. Preserve local leading in chat bubbles and dialogs, and use at least 16px input text on coarse pointers to avoid focus zoom.</p>']
    ];
    case 'spacing': return [
      ['scale', 'Spacing scale', `<p>Start on the 2px grid. Use spacing tokens for repeated gaps or padding; use Layout tokens only for their named roles.</p>${table(['Token', 'Value', 'Scale'], Object.entries(dimensions.Space).map(([key, value]) => [token(`Space/${key}`), dimValue(value), `<span class="space-sample" style="--sample-size:${dimValue(value)}" aria-hidden="true"></span>`]))}`],
      ['layout', 'Layout', `${table(['Token', 'Value'], Object.entries(dimensions.Layout).map(([key, value]) => [token(`Layout/${key}`), dimValue(value)]))}<p>Content widths and breakpoints belong to their product layout rather than the spacing scale.</p><p>${download(`${root}data/dimensions.json`, 'Download dimension tokens')}</p>`]
    ];
    case 'radius': return [
      ['scale', 'Radius scale', `<div class="radius-list" data-len3>${Object.entries(dimensions.Radius).map(([key, value]) => `<div><span style="border-radius:${dimValue(value)}"></span>${token(`Radius/${key}`)}<small>${key === 'Full' ? 'Pill' : dimValue(value)}</small></div>`).join('')}</div><p>Use MD for controls, LG for cards, and XL for large panels. Full represents a completely rounded shape; it is not a measured corner size.</p>`]
    ];
    case 'elevation': return [
      ['effects', 'Effect styles', `<p>Use Control on input fields and outline controls. Use Overlay on menus and notices. Dialogs and selected filled tabs retain their local effects.</p><div class="elevation-grid" data-len3><div style="box-shadow:var(--l3-elevation-control)">Control</div><div style="box-shadow:var(--l3-elevation-overlay)">Overlay</div></div>${table(['Style', 'X', 'Y', 'Blur', 'Spread', 'Black'], [['Control', '0', '1', '2', '0', '5%'], ['Overlay · first', '0', '4', '6', '−1', '10%'], ['Overlay · second', '0', '2', '4', '−2', '10%']])}`]
    ];
    default: throw new Error(`Unknown foundation: ${id}`);
  }
}

function iconContent() {
  return [
    ['gallery', 'Icon library', `<p>Use Phosphor Regular for shared product icons. Most controls use 16px icons; XS controls and badges use 12px. Calendar and Clock are the right-icon additions for Input.</p><div class="icon-gallery">${iconNames.map(name => `<a id="${slug(name)}" href="${nodeUrl(inventory[name][0][0])}" target="_blank" rel="noreferrer">${icon(name.slice(7), 24)}<span>${esc(name.slice(7))}</span>${icon('ArrowUpRight', 12)}</a>`).join('')}</div>`],
    ['usage', 'Usage', '<p>Pair unfamiliar icons with a visible label. Label the action, not the drawing, for icon-only controls: “Remove report” instead of “Trash”. Decorative glyphs next to copy should not be announced.</p>']
  ];
}

function componentContent(item) {
  const entries = inventory[item.title];
  if (!entries) throw new Error(`Missing inventory: ${item.title}`);
  const rows = entries.map(([node, name]) => ({ node, name, props: Object.fromEntries(name ? name.split(', ').map(pair => pair.split('=')) : []) }));
  if (item.id === 'tabs') {
    for (const row of rows) {
      const { Variant, Active } = row.props;
      row.props = { Variant: Variant === 'Large' ? 'Line' : Variant, Size: Variant === 'Large' ? 'Large' : 'Default', Active };
    }
    for (const row of rows.filter(({ props }) => props.Variant === 'Default')) {
      rows.push({ node: null, props: { ...row.props, Size: 'Large' } });
    }
  }
  const options = Object.entries(rows[0].props).map(([key]) => [key, [...new Set(rows.map(row => row.props[key]))]]);
  const priority = { Variant: 'Default', Size: 'Default', Mode: 'Expanded', Sender: 'Agent', Alignment: 'End', Side: 'Right', Risk: 'Medium', Active: '1', 'Property 1': 'Input empty' };
  const first = rows.findIndex(row => options.every(([key, values]) => row.props[key] === (values.includes(priority[key]) ? priority[key] : values[0])));
  const index = first >= 0 ? first : 0;
  const initial = rows[index];
  const controls = options.map(([key, values]) => `<label class="variant-control"><span id="property-${slug(key)}">${esc(key === 'Property 1' ? 'Input' : key)}</span><select aria-labelledby="property-${slug(key)}" data-property="${esc(key)}">${values.map(value => `<option ${value === initial.props[key] ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`).join('');
  const inputDemo = item.id === 'input' ? '<label class="variant-control"><span id="right-icon-label">Right icon</span><select aria-labelledby="right-icon-label" data-right-icon><option>Hidden</option><option>Calendar</option><option>Clock</option></select></label>' : '';
  const views = rows.map((row, i) => `<template data-view="${i}" data-props="${esc(JSON.stringify(row.props))}" ${row.node ? `data-url="${nodeUrl(row.node)}"` : ''}>${preview(item.id, row.props)}</template>${inputDemo ? ['Calendar', 'Clock'].map(icon => `<template data-view-icon="${i}-${icon}">${preview(item.id, { ...row.props, 'Right icon': icon })}</template>`).join('') : ''}`).join('');
  const specimen = `<div class="showcase" data-playground><div class="panel-bar">${eyebrow('Live preview')}<button type="button" class="quiet" data-preview-mode aria-pressed="false">${icon('CircleHalf', 15)}<span>Light preview</span></button></div><div class="preview-stage" data-len3 data-mode="light" data-stage>${preview(item.id, initial.props)}</div><div class="panel-bar panel-footer">${controls ? `<div class="variant-controls">${controls}${inputDemo}</div>` : ''}<a data-variant-link href="${nodeUrl(initial.node)}" target="_blank" rel="noreferrer">Figma specimen ${icon('ArrowUpRight', 13)}</a><span data-preview-only hidden>Web preview only</span></div>${views}</div>`;
  const reference = item.id === 'tabs'
    ? 'Variant and Size are independent. In the Figma snapshot, the Line / Large specimens are named “Large”. Default / Large has a web preview but no matching Figma node in the snapshot.'
    : 'These property values come from the Figma inventory. Select a combination in the preview to inspect its appearance and open the matching node.';
  const definitions = options.length ? `<p>${reference}</p>${table(['Property', 'Available values'], options.map(([key, values]) => [esc(key), values.map(token).join(' ')]))}<details class="variant-list"><summary>All ${entries.length} Figma variants</summary><ul>${rows.filter(row => row.node).map(({ node, name }) => `<li>${figLink(node, esc(name))}</li>`).join('')}</ul></details>` : `<p>This component is catalogued as a single definition. Use the Figma specimen for its component properties.</p>`;
  return [['preview', 'Preview', specimen], ['usage', 'Usage', `<p>${esc(item.usage)}</p>${item.details ? `<p>${esc(item.details)}</p>` : ''}`], ['figma-properties', 'Figma reference', definitions]];
}

function documentFor(item) {
  const root = '../'.repeat(item.path.split('/').filter(Boolean).length) || './';
  const index = pages.indexOf(item);
  const previous = pages[index - 1], next = pages[index + 1];
  const nav = (entry, label = entry.title) => `<a href="${root}${entry.path}"${entry.path === item.path ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  const sidebar = `<div class="nav-group">${eyebrow('Overview')}${nav(overview, 'Get started')}</div>${sections.map(section => `<div class="nav-group">${nav(section, `${section.number} · ${section.title}`)}${section.pages.map(sub => nav(sub)).join('')}</div>`).join('')}`;
  const top = `<header class="site-header"><a href="${root}" class="logotype" aria-label="Len3 design system, home"><span aria-hidden="true">LEN<sup>3</sup></span><span aria-hidden="true" class="brand-slash">/</span><span class="brand-title">Design system</span></a><nav class="top-nav" aria-label="Sections">${sections.map(sec => nav(sec)).join('')}</nav><div class="site-actions"><a class="header-figma" href="${figma}" target="_blank" rel="noreferrer">Figma ${icon('ArrowUpRight', 14)}</a><button type="button" class="search-trigger" data-open-search aria-label="Search documentation">${icon('MagnifyingGlass', 15)}<span>Search the docs</span><kbd data-shortcut>⌘ K</kbd></button><button type="button" class="icon-button theme-toggle" data-theme-toggle aria-label="Switch to dark theme">${icon('Sun', 16)}${icon('Moon', 16)}</button><button type="button" class="icon-button menu-toggle" aria-expanded="false" aria-controls="docs-nav" aria-label="Open documentation menu">${icon('List', 18)}</button></div></header>`;
  const deck = item === overview ? overviewContent(root) : item.pages ? [['catalog', item.title === 'Foundations' ? 'Reference' : 'Browse components', cardList(item.pages, root)]] : item.section.id === 'foundations' ? foundationContent(item.id, root) : item.id === 'icons' ? iconContent() : componentContent(item);
  const crumbs = item === overview ? 'System documentation' : item.section ? `${item.section.number} · ${item.section.title}` : `${item.number} · Library`;
  const pagination = `<nav class="pagination" aria-label="Previous and next pages">${[[previous, 'Previous', 'ArrowLeft'], [next, 'Next', 'ArrowRight']].map(([target, label, glyph]) => target ? `<a href="${root}${target.path}">${icon(glyph, 16)}<span><small>${label}</small><strong>${esc(target === overview ? 'Get started' : target.title)}</strong></span></a>` : '<span></span>').join('')}</nav>`;
  const toc = `<aside class="page-index"><nav aria-label="On this page">${eyebrow('On this page')}<ul>${deck.map(([id, title]) => `<li><a href="#${id}">${esc(title)}</a></li>`).join('')}</ul></nav><div class="page-tools">${figLink(item.node, 'View Figma source')}<button type="button" data-copy-link>${icon('Copy', 14)}<span>Copy page link</span></button><a href="#top">${icon('ArrowUp', 14)} Back to top</a></div><p class="toc-note">Reference for the Len3 product.<br>Light and Dark modes.</p></aside>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(item.description)}"><title>${esc(item === overview ? item.title : `${item.title} · Len3 Design System`)}</title>
<link rel="icon" href="${root}assets/mark.svg" type="image/svg+xml">
<script>try { const theme = localStorage.getItem('len3:theme'); if (theme) document.documentElement.dataset.theme = theme; } catch {}</script>
<link rel="stylesheet" href="${root}assets/site.css"><link rel="stylesheet" href="${root}assets/tokens.css"><link rel="stylesheet" href="${root}assets/specimens.css">
<script type="module" src="${root}assets/site.js"></script>
</head>
<body id="top"><a class="skip-link" href="#main">Skip to content</a>${top}
<div class="layout">
<aside class="left-nav" id="docs-nav"><nav aria-label="Documentation">${sidebar}</nav></aside>
<main id="main" tabindex="-1"><article><header class="article-header"><div>${eyebrow(esc(crumbs))}<h1>${esc(item.title)}</h1><p>${esc(item.description)}</p></div><a class="heading-link" href="${nodeUrl(item.node)}" target="_blank" rel="noreferrer" aria-label="Open ${esc(item.title)} in Figma">${icon('ArrowUpRight', 17)}</a></header>${headings(deck)}${pagination}</article><footer class="site-footer"><span>Len3 Design System</span>${figLink(item.node, 'Figma')}</footer></main>
${toc}</div>
<dialog class="search-dialog" aria-labelledby="search-title"><div class="search-top"><h2 id="search-title" class="sr-only">Search the documentation</h2>${icon('MagnifyingGlass', 18)}<input type="search" id="docs-search" aria-labelledby="search-title" placeholder="Search tokens, components, and pages" autofocus><form method="dialog"><button class="icon-button" aria-label="Close search">${icon('Close', 16)}</button></form></div><p class="search-status sr-only" role="status"></p><div class="search-body"></div></dialog>
</body></html>\n`;
}

for (const item of pages) save(`./${item.path}index.html`, documentFor(item));
const searchable = [
  ...pages.map(({ path, id, title, description, section }) => [path, id === 'overview' ? 'Get started' : title, section?.title ?? 'Documentation', description]),
  ...iconNames.map(name => [`components/icons/#${slug(name)}`, name, 'Icons', 'Icon library']),
  ...colorRows(colors).map(([key]) => [`foundations/colors/#${slug(key.split('/')[0])}`, key, 'Colors', 'Semantic color token']),
  ...Object.entries(dimensions).flatMap(([group, entries]) => Object.keys(entries).map(key => [`foundations/${group === 'Radius' ? 'radius' : 'spacing'}/#${group === 'Layout' ? 'layout' : 'scale'}`, `${group}/${key}`, group, 'Dimension token'])),
  ...types.map(([name]) => ['foundations/typography/#type-styles', name, 'Typography', 'Text style'])
];
save('./assets/search-index.js', `export default ${JSON.stringify(searchable)};\n`);
console.log(`Built ${pages.length} Len3 documentation pages.`);
