import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('README documents the two experiences, root commands and license split', () => {
  const readme = readFileSync('README.md', 'utf8');
  for (const text of ['索尔维会议', '世界编织', 'pnpm setup', 'pnpm dev', 'pnpm test', 'MIT', 'CC BY-NC-SA 4.0']) {
    assert.match(readme, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('CI has repository, echo, quillforge and integration jobs without secrets', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const job of ['repository:', 'echo:', 'quillforge:', 'integration:']) assert.match(ci, new RegExp(`^  ${job}`, 'mu'));
  assert.doesNotMatch(ci, /secrets\./u);
  assert.match(ci, /node-version:\s*24/u);
  assert.match(ci, /python-version:\s*['"]3\.11['"]/u);
});
