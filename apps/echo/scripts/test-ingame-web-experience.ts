import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/ui/minigame-overlay.ts', import.meta.url),
  'utf8',
);

for (const required of [
  'export interface WebExperienceDefinition',
  'openWebExperience(',
  'isQuillForgeMessage(e.data)',
  'e.data.type === EMBED_MESSAGE.quillforgeReady',
  'e.data.type === EMBED_MESSAGE.pauseRequest',
  'createEchoMessage(paused ? EMBED_MESSAGE.pause : EMBED_MESSAGE.resume)',
  'e.source !== frame.contentWindow',
  'data-action="retry"',
  'data-action="exit"',
  'clearTimeout(this.readyTimer)',
]) {
  assert.equal(source.includes(required), true, required);
}
assert.equal(source.includes('window.open'), false);
assert.equal(source.includes('about:blank'), false);
assert.match(source, /zIndex:\s*'9999'/u);

console.log('INGAME_WEB_EXPERIENCE=PASS');
