import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectContentViolations } from '../scripts/lib/content-checks.mjs';

test('reports a public file outside the declared content roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'content-manifest-'));
  try {
    await mkdir(join(root, 'apps/echo/public'), { recursive: true });
    await mkdir(join(root, 'apps/quillforge/samples'), { recursive: true });
    await writeFile(join(root, 'apps/echo/public/asset.png'), 'x');
    const violations = await collectContentViolations(root, { entries: [] });
    assert.deepEqual(violations.map((item) => item.code), ['UNDECLARED_CONTENT']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
