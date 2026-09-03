import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMBED_MESSAGE, createEchoMessage, isQuillForgeMessage } from '../src/ui/embed-contract';

const contract = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'shared', 'contracts', 'embed-messages.json'), 'utf8'),
) as { messages: Record<string, unknown> };
assert.deepEqual(Object.values(EMBED_MESSAGE).sort(), Object.keys(contract.messages).sort());
assert.equal(isQuillForgeMessage({ type: EMBED_MESSAGE.quillforgeReady }), true);
assert.equal(isQuillForgeMessage({ type: EMBED_MESSAGE.pauseRequest }), true);
assert.equal(isQuillForgeMessage({ type: EMBED_MESSAGE.pause }), false);
assert.deepEqual(createEchoMessage(EMBED_MESSAGE.pause), { type: 'echo:pause' });
assert.deepEqual(createEchoMessage(EMBED_MESSAGE.resume), { type: 'echo:resume' });
console.log('ECHO_SHARED_EMBED_CONTRACT=PASS');
