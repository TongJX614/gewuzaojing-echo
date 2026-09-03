'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

test('browser bridge uses exactly the shared embed messages', () => {
  const root = resolve(__dirname, '..', '..', '..');
  const contract = JSON.parse(readFileSync(resolve(root, 'shared/contracts/embed-messages.json'), 'utf8'));
  const source = readFileSync(resolve(__dirname, '../src/static/echo-embed-bridge.js'), 'utf8');
  const expected = Object.keys(contract.messages).sort();
  const used = [...source.matchAll(/['"]((?:echo|quillforge):[a-z-]+)['"]/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(used)].sort(), expected);
  assert.equal(expected.includes('echo:exit'), false);
});
