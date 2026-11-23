// The site is served as static files, so DialKit's self-contained vanilla ESM
// build is copied out of node_modules instead of being resolved at runtime.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = dirname(dirname(require.resolve('dialkit')));
const source = join(pkg, 'dist', 'vanilla');
const target = join(process.cwd(), 'murmurs', 'vendor', 'dialkit');

await mkdir(target, { recursive: true });
for (const file of ['index.js', 'styles.css']) {
  await copyFile(join(source, file), join(target, file));
}
const { version } = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
console.log(`dialkit ${version} -> murmurs/vendor/dialkit`);
