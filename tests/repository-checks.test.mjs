import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { collectRepositoryViolations } from '../scripts/lib/repository-checks.mjs';

test('rejects private config, forbidden trees, local paths and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gewuzaojing-repo-'));
  try {
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await mkdir(join(root, 'docs', 'superpowers'), { recursive: true });
    await writeFile(join(root, '.env'), 'API_KEY=secret\n');
    await writeFile(join(root, 'docs', 'machine.txt'), 'E:\\0files\\private');
    await writeFile(join(root, 'leak.txt'), 'API_KEY=x\n');
    await writeFile(join(root, 'large.bin'), Buffer.alloc(33));
    const violations = await collectRepositoryViolations(root, { maxBytes: 32 });
    assert.deepEqual(
      violations.map(({ code }) => code).sort(),
      ['FORBIDDEN_DIRECTORY', 'LOCAL_ABSOLUTE_PATH', 'OVERSIZED_FILE', 'PRIVATE_ENV', 'SECRET_ASSIGNMENT'].sort(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts the public root contract and ignores runtime-only trees', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gewuzaojing-repo-'));
  try {
    await mkdir(join(root, 'apps', 'quillforge', 'var'), { recursive: true });
    await writeFile(join(root, '.env.example'), 'API_KEY=replace\n');
    await writeFile(join(root, 'apps', 'quillforge', 'var', 'runtime.bin'), Buffer.alloc(64));
    assert.deepEqual(await collectRepositoryViolations(root, { maxBytes: 32 }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not allow policy bypass through agent files, unrelated var trees or uncommon text files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gewuzaojing-repo-'));
  try {
    await mkdir(join(root, 'docs', 'var'), { recursive: true });
    await writeFile(join(root, 'AGENTS.md'), 'local agent instructions\n');
    await writeFile(join(root, 'docs', 'var', 'machine.toml'), 'path = "E:\\0files\\private"\n');
    await writeFile(join(root, '.env.example'), 'SHARED_LLM_BASE_URL=C:\\Users\\private\n');
    await writeFile(join(root, 'Dockerfile'), 'RUN echo C:\\Users\\private\n');

    const violations = await collectRepositoryViolations(root);
    assert.deepEqual(
      violations.map(({ code, path }) => `${code}:${path}`),
      [
        'FORBIDDEN_AGENT_DOCUMENT:AGENTS.md',
        'LOCAL_ABSOLUTE_PATH:.env.example',
        'LOCAL_ABSOLUTE_PATH:Dockerfile',
        'LOCAL_ABSOLUTE_PATH:docs/var/machine.toml',
      ].sort(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
