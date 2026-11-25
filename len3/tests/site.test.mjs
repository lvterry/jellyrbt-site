import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core, product, groups, foundations, nodeUrl } from '../src/content.mjs';
import { data, icon } from '../src/specimens.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sections = [foundations, [...core, ['icons', 'Icons']], product];
const paths = ['', ...groups.flatMap(({ id }, i) => [`${id}/`, ...sections[i].map(([page]) => `${id}/${page}/`)])];

test('generated pages have valid local asset, navigation and section links', () => {
  const files = readdirSync(root, { recursive: true }).filter(path => path.endsWith('index.html'));
  assert.deepEqual(files.sort(), paths.map(path => path + 'index.html').sort());
  for (const path of paths) {
    const file = new URL(path + 'index.html', root);
    const html = readFileSync(file, 'utf8');
    const live = html.replace(/<template\b[\s\S]*?<\/template>/g, '');
    const ids = [...live.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, path);
    for (const [, ref] of live.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (ref.startsWith('https:')) continue;
      const target = new URL(ref, file);
      const hash = target.hash;
      target.hash = '';
      assert.ok(target.pathname.startsWith(root.pathname) && existsSync(target), `${path} → ${ref}`);
      if (!hash) continue;
      const targetFile = statSync(target).isDirectory() ? new URL('index.html', target) : target;
      assert.ok(readFileSync(targetFile, 'utf8').includes(`id="${hash.slice(1)}"`), `${path} → ${ref}`);
    }
  }
});

test('each audited component, variant and icon links to its Figma node', () => {
  const inventory = data('inventory');
  assert.deepEqual(
    [...core, ...product].map(([, name]) => name).sort(),
    Object.keys(inventory).filter(name => !name.startsWith('Icon / ')).sort()
  );
  for (const [items, prefix] of [[core, 'components'], [product, 'product-components']]) {
    for (const [id, title] of items) {
      const page = read(`${prefix}/${id}/index.html`);
      assert.equal([...page.matchAll(/<template data-view="[^"]+" data-props="[^"]+" data-url=/g)].length, inventory[title].length);
      for (const [node] of inventory[title]) assert.ok(page.includes(nodeUrl(node)), title);
    }
  }
  const gallery = read('components/icons/index.html');
  for (const [title, [[node]]] of Object.entries(inventory).filter(([name]) => name.startsWith('Icon / '))) {
    assert.ok(gallery.includes(nodeUrl(node)), title);
    assert.doesNotMatch(icon(title.slice(7)), /undefined/);
  }
});

test('Tabs exposes every variant and size independently', () => {
  const html = read('components/tabs/index.html');
  const combinations = [...html.matchAll(/<template data-view="[^"]+" data-props="([^"]+)"/g)].map(([, props]) => JSON.parse(props.replaceAll('&quot;', '"')));
  assert.equal(combinations.length, 12);
  for (const Variant of ['Default', 'Line']) {
    for (const Size of ['Default', 'Large']) {
      assert.deepEqual(combinations.filter(props => props.Variant === Variant && props.Size === Size).map(props => props.Active), ['1', '2', '3']);
    }
  }
});

test('all 82 variable names are generated as CSS tokens', () => {
  const tokens = read('assets/tokens.css');
  const names = [...tokens.matchAll(/^  (--l3-[\w-]+):/gm)].map(match => match[1]);
  assert.equal(new Set(names.filter(name => !name.startsWith('--l3-elevation-'))).size, 82);
  assert.equal(names.length, 82 + 59 + 2);
});
