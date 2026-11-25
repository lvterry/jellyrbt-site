import { readFileSync } from 'node:fs';

export const data = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
export const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const slug = value => value.toLowerCase().replace(/[^a-z\d]+/g, '-').replace(/^-|-$/g, '');
const icons = data('icons');
export function icon(name, size = 16) {
  const custom = name === 'Calendar' || name === 'Clock';
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="${custom ? '0 0 24 24' : '0 0 256 256'}" ${custom ? 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"' : 'fill="currentColor"'}>${icons[name]}</svg>`;
}

const b = (label, variant = 'default', attributes = '') => `<button type="button" class="p-btn" data-variant="${variant}" ${attributes}>${label}</button>`;
const risk = (level = 'Medium') => `<span class="p-risk" data-risk="${slug(level)}">${level}</span>`;
const badge = (label, variant = 'secondary') => `<span class="p-badge" data-variant="${variant}">${label}</span>`;
const avatar = (label, role = 'default') => `<span class="p-avatar" data-role="${role}" aria-hidden="true">${label}</span>`;
const photo = (present = true) => `<span class="p-photo${present ? ' has-photo' : ''}" aria-hidden="true">${present ? '' : icon('House', 24)}</span>`;
const desc = (title, subtitle) => `<span class="p-copy"><strong>${title}</strong><small>${subtitle}</small></span>`;
const evidence = () => `<div class="p-evidence">${icon('FileText', 18)}${desc('Inspection report', 'Exterior · page 12')}<p>Water stains were observed beneath the rear gutter outlet.</p></div>`;
const finding = (level = 'Medium', open = false, withEvidence = true) => `<details class="p-finding" ${open ? 'open' : ''}><summary><span class="p-index">01</span><strong>Rear gutter drainage</strong>${risk(level)}${icon('CaretDown')}</summary><div><p>The downspout ends near the foundation. Extend the discharge away from the house and check for pooling after rainfall.</p>${withEvidence ? evidence() : ''}</div></details>`;
const bubble = (sender, alignment) => `<div class="p-bubble-row" data-alignment="${slug(alignment)}"><div class="p-bubble" data-sender="${slug(sender)}"><small>${sender}</small>${sender === 'Agent' ? 'I’ve pulled out three items to review before the inspection.' : 'Can we look at the inspection notes together?'}</div></div>`;
const nav = { Overview: 'Squares Four', Properties: 'House', Clients: 'Users', Chat: 'Chat Circle' };
const navItem = (label, active) => `<button type="button" class="p-nav-item" aria-current="${active ? 'page' : 'false'}" aria-label="${label}" data-preview-nav>${icon(nav[label])}<span>${label}</span></button>`;

export function preview(id, props = {}) {
  const { Variant = 'Default', Size = 'Default', State = 'Default', Mode = 'Expanded', Role = 'Default', Side = 'Top', Tone = 'Default', Risk = 'Medium', Expanded = 'Yes', Evidence = 'Yes', Sender = 'Agent', Alignment = 'Start' } = props;
  const variant = slug(Variant), size = slug(Size), state = slug(State);
  const disabled = State === 'Disabled' ? 'disabled' : '';
  const attr = `data-state="${state}" data-size="${size}" ${disabled}`;
  switch (id) {
    case 'button': return Variant === 'Link'
      ? disabled ? '<span class="p-btn" data-variant="link" aria-disabled="true">View report</span>' : `<a class="p-btn" data-variant="link" ${attr} href="#usage">View report</a>`
      : `<div class="p-stack">${b(Variant === 'Destructive' ? 'Remove report' : 'Save changes', variant, `${attr} data-preview-action`)}<span class="p-status sr-only" role="status"></span></div>`;
    case 'icon-button': return b(icon(Variant === 'Destructive' ? 'Trash' : 'Plus', Size === 'XS' ? 12 : 16), variant, `data-icon ${attr} aria-label="${Variant === 'Destructive' ? 'Remove report' : 'Add report'}"`);
    case 'input': {
      const endIcon = props['Right icon'];
      const field = { Calendar: ['Appointment date', 'MM/DD/YYYY', '11/26/2026', 'Enter a date in MM/DD/YYYY format.'], Clock: ['Appointment time', 'HH:MM', '09:30', 'Enter a time in HH:MM format.'] }[endIcon] || ['Property name', 'Enter property name', 'Maple House', 'Enter a property name.'];
      const [label, placeholder, example, error] = field;
      const value = State === 'Invalid' ? '—' : State === 'Filled' ? example : '';
      return `<div class="p-field"><label for="preview-input">${label}</label><span class="p-input-wrap"><input id="preview-input" class="p-field-control" placeholder="${placeholder}" value="${value}" ${attr} ${endIcon ? 'data-has-icon' : ''} ${State === 'Invalid' ? 'aria-invalid="true" aria-describedby="field-error"' : ''}>${endIcon ? icon(endIcon) : ''}</span>${State === 'Invalid' ? `<small class="p-error" id="field-error">${error}</small>` : ''}</div>`;
    }
    case 'textarea': return `<label class="p-field"><span>Inspection notes</span><textarea class="p-field-control" placeholder="Add a note for the report" ${attr} ${State === 'Invalid' ? 'aria-invalid="true" aria-describedby="field-error"' : ''}>${State === 'Filled' ? 'Recheck the gutters after the next rainfall.' : ''}</textarea>${State === 'Invalid' ? '<small class="p-error" id="field-error">Add a note before saving.</small>' : ''}</label>`;
    case 'select': return `<label class="p-field"><span>Report status</span><span class="p-input-wrap"><select class="p-field-control" ${attr} ${State === 'Invalid' ? 'aria-invalid="true" aria-describedby="field-error"' : ''}><option disabled ${State !== 'Selected' ? 'selected' : ''} value="">Choose a status</option><option ${State === 'Selected' ? 'selected' : ''}>Draft</option><option>Ready to review</option><option>Published</option></select>${icon('Chevron Down')}</span>${State === 'Invalid' ? '<small class="p-error" id="field-error">Select a report status.</small>' : ''}</label>`;
    case 'checkbox': return `<label class="p-check-label"><input type="checkbox" ${attr} ${props.Checked === 'Checked' ? 'checked' : ''} ${props.Checked === 'Indeterminate' ? 'data-indeterminate' : ''}> Include evidence in the report</label>`;
    case 'tabs': {
      const items = ['Reports', 'Profile', 'Activity'];
      const active = Number(props.Active ?? 1) - 1;
      return `<div class="p-tab-example"><div class="p-tabs" data-variant="${variant}" data-size="${size}" role="tablist" aria-label="Client details">${items.map((label, i) => `<button type="button" class="p-tab" id="example-tab-${i}" data-variant="${variant}" role="tab" aria-selected="${i === active}" aria-controls="example-panel-${i}" tabindex="${i === active ? 0 : -1}">${label}</button>`).join('')}</div>${['Two reports are ready to review.', 'Morgan Lee · Buyer', 'Inspection notes added today.'].map((text, i) => `<div class="p-tab-panel" id="example-panel-${i}" role="tabpanel" aria-labelledby="example-tab-${i}" tabindex="0" ${i === active ? '' : 'hidden'}>${text}</div>`).join('')}</div>`;
    }
    case 'badge': return badge({ default: 'New', destructive: 'Archived', outline: 'Pending', secondary: 'Draft', ghost: 'Internal', link: 'Report' }[variant], variant);
    case 'avatar': return `<div class="p-avatar-specimen" aria-label="${Role} avatar">${avatar({ 'System Agent': 'L³', 'System Buyer': 'M', Buyer: 'ML', Profile: 'AR' }[Role] || 'ML', slug(Role))}</div>`;
    case 'tooltip': return `<div class="p-tooltip-example" data-side="${slug(Side)}">${b(icon('Info'), 'outline', 'data-icon aria-label="Report information" aria-describedby="preview-tip"')}<span role="tooltip" id="preview-tip">Visible to your team</span></div>`;
    case 'dialog':
    case 'sheet': {
      const sheet = id === 'sheet';
      return `<div class="p-overlay-demo">${b(sheet ? 'Open sheet' : 'Open dialog', 'outline', 'data-open-preview')}
        <dialog class="p-overlay ${sheet ? 'p-sheet' : ''}" ${sheet ? `data-side="${slug(Side)}"` : ''} aria-labelledby="example-overlay-title"><form method="dialog"><div class="p-overlay-header"><div><h2 id="example-overlay-title">${sheet ? 'Report details' : 'Save this report?'}</h2><p>${sheet ? 'Review the current status and source.' : 'Your changes will be available to your team.'}</p></div><button class="p-btn" data-variant="ghost" data-icon aria-label="Close" value="close" autofocus>${icon('Close')}</button></div>${sheet ? `<div class="p-row">${desc('Inspection report', 'Updated today')}${badge('Draft')}</div>` : '<div class="p-overlay-actions"><button class="p-btn" data-variant="outline" value="cancel">Cancel</button><button class="p-btn" data-variant="default" value="save">Save report</button></div>'}</form></dialog></div>`;
    }
    case 'toast': return `<div class="p-stack"><div class="p-toast" role="status" data-tone="${slug(Tone)}">${icon(Tone === 'Success' ? 'Success' : Tone === 'Error' ? 'Error' : 'Info', 17)}<span>${Tone === 'Success' ? 'Report saved.' : Tone === 'Error' ? 'Could not save the report.' : 'You’re viewing a draft.'}</span>${b(icon('Close', 14), 'ghost', 'data-icon aria-label="Dismiss notice" data-toast-close')}</div>${b('Show toast', 'outline', 'data-toast-open hidden')}</div>`;
    case 'sidebar': return `<div class="p-sidebar" data-mode="${slug(Mode)}"><div class="p-sidebar-head"><strong aria-label="Len3">${Mode === 'Collapsed' ? 'L³' : 'LEN³'}</strong>${Mode !== 'Collapsed' ? icon('Sidebar Simple') : ''}</div><div aria-label="Preview destinations">${Object.keys(nav).map(label => navItem(label, label === (props.Active ?? 'Overview'))).join('')}</div>${Mode !== 'Collapsed' ? `<div class="p-sidebar-account">${avatar('ML', 'profile')}${desc('Morgan Lee', 'Workspace')}</div>` : ''}</div>`;
    case 'sidebar-nav-item': return `<div class="p-nav-demo" data-mode="${slug(Mode)}">${navItem('Properties', props.Active === 'Yes')}</div>`;
    case 'breadcrumb': return `<nav class="p-breadcrumb" aria-label="Example breadcrumb"><a href="#usage">Properties</a>${icon('CaretRight', 12)}<span aria-current="page">Maple House</span></nav>`;
    case 'empty-state': return `<div class="p-empty">${icon('FileMagnifyingGlass', 28)}<strong>No inspection reports</strong><p>Upload a report to start reviewing findings.</p>${b('Upload report', 'outline')}</div>`;
    case 'progress-bar-with-cancel': return `<div class="p-progress-example"><label for="example-progress">Uploading inspection.pdf</label><div><progress id="example-progress" max="100" value="64">64%</progress><span>64%</span>${b(icon('Close', 14), 'ghost', 'data-icon aria-label="Cancel upload" data-progress-cancel')}</div><p role="status" hidden>Upload canceled.</p></div>`;
    case 'content-placeholder': return '<div class="p-placeholder">Content slot</div>';
    case 'severity': return risk(Risk);
    case 'evidence-row': return evidence();
    case 'finding': return finding(Risk, Expanded === 'Yes', Evidence === 'Yes');
    case 'client-row': return `<div class="p-row">${avatar('ML', 'buyer')}${desc('Morgan Lee', 'morgan@example.com')}<span class="p-row-tail">2 properties ${icon('CaretRight')}</span></div>`;
    case 'property-row': return `<div class="p-row">${photo(props['House Image'] !== 'Placeholder')}${desc('18 Maple Avenue', 'Oakland, CA · Inspection report')}<span class="p-row-tail">${badge('Draft')}${icon('CaretRight')}</span></div>`;
    case 'property-summary': return `<div class="p-row p-summary">${photo()}${desc('18 Maple Avenue', 'Oakland, CA · Inspected October 12')}${badge('Ready to review')}</div>`;
    case 'report-section': return `<div class="p-report"><h2>Exterior and drainage</h2>${finding('Medium', false)}${finding('Low', false, false).replace('01', '02').replace('Rear gutter drainage', 'Sealant at siding joints')}</div>`;
    case 'section-header': return `<div class="p-section-head"><div><h2>Inspection findings</h2><p>Review the observations before sharing this report.</p></div>${b(`${icon('Plus')} Add finding`, 'outline')}</div>`;
    case 'report-row': return `<label class="p-row p-report-row">${photo()}${desc('18 Maple Avenue', 'Inspection report · October 12')}<input type="checkbox" aria-label="Include 18 Maple Avenue report" ${State === 'Selected' ? 'checked' : ''}></label>`;
    case 'chat-bubble': return `<div class="p-thread">${bubble(Sender, Alignment)}</div>`;
    case 'chat-composer': {
      const filled = props['Property 1'] === 'Input has value';
      return `<div class="p-composer-example"><div class="p-sent" hidden></div><form class="p-composer" data-composer><button type="button" class="p-btn" data-variant="secondary" data-icon data-size="sm" aria-label="Attach a file" data-demo-only>${icon('Plus')}</button><input aria-label="Message" placeholder="Ask about a property…" value="${filled ? 'Summarize the inspection notes' : ''}"><button type="button" class="p-btn" data-variant="ghost" data-icon data-size="sm" aria-label="Record a message" data-demo-only>${icon('Microphone')}</button><button class="p-btn" data-variant="default" data-icon data-size="sm" aria-label="Send message" ${filled ? '' : 'disabled'}>${icon('Arrow Up On Primary')}</button></form><span class="p-status" role="status"></span></div>`;
    }
    default: throw new Error(`Missing specimen: ${id}`);
  }
}
