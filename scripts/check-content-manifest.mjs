import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectContentViolations } from './lib/content-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'content-manifest.json'), 'utf8'));
const violations = await collectContentViolations(root, manifest);
for (const item of violations) console.error(`${item.code}\t${item.path}`);
if (violations.length) process.exitCode = 1;
else console.log('CONTENT_MANIFEST=PASS');
