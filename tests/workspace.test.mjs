import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import test from 'node:test';

import { buildServiceSpecs, findWorkspaceRoot, resolveEnvFile } from '../scripts/lib/workspace.mjs';

test('finds root markers and passes one absolute env file to both services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gewuzaojing-workspace-'));
  try {
    await mkdir(join(root, 'shared', 'contracts'), { recursive: true });
    await mkdir(join(root, 'apps', 'echo'), { recursive: true });
    await mkdir(join(root, 'apps', 'quillforge'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'shared', 'contracts', 'environment.json'), '{}');
    assert.equal(findWorkspaceRoot(join(root, 'apps', 'echo')), resolve(root));
    const envFile = resolveEnvFile(root, {});
    assert.equal(envFile, resolve(root, '.env'));
    assert.equal(isAbsolute(envFile), true);
    const specs = buildServiceSpecs(root, envFile, 'python-test');
    assert.equal(specs.length, 2);
    assert.deepEqual(new Set(specs.map((spec) => spec.env.GEWUZAOJING_ENV_FILE)), new Set([envFile]));
    assert.deepEqual(specs.map((spec) => spec.port), [8050, 5000]);
    if (process.platform === 'win32') {
      const echo = specs.find((spec) => spec.name === 'echo');
      assert.equal(echo.command, process.execPath);
      assert.match(echo.args[0], /corepack[\\/]dist[\\/]corepack\.js$/u);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a relative environment override', () => {
  assert.throws(() => resolveEnvFile(process.cwd(), { GEWUZAOJING_ENV_FILE: '.env' }), /ENV_PATH_NOT_ABSOLUTE/u);
});
