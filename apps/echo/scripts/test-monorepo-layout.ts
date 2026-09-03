import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appRoot, '..', '..');
assert.equal(existsSync(resolve(appRoot, 'content')), false);
assert.equal(existsSync(resolve(appRoot, '.env')), false);
assert.equal(existsSync(resolve(appRoot, 'public')), true);
const overlay = readFileSync(resolve(appRoot, 'src', 'ui', 'minigame-overlay.ts'), 'utf8');
assert.match(overlay, /openWebExperience\(/u);
assert.match(overlay, /data-action="exit"/u);
console.log('ECHO_MONOREPO_LAYOUT=PASS');
