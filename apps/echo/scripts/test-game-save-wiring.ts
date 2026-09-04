import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync(
  new URL('../src/game/engine.ts', import.meta.url),
  'utf8',
).replace(/\r\n/gu, '\n');

assert.match(engine, /export interface GameEngineOptions/u);
assert.match(engine, /captureSnapshot\(/u);
assert.match(engine, /restoreSnapshot\(/u);
assert.match(engine, /requestAutoSave\(/u);
assert.match(engine, /flushPendingAutoSave\(/u);
assert.match(engine, /change\.type === 'stage'/u);
assert.match(engine, /change\.type === 'quest_completed'/u);
assert.match(engine, /e\.code === 'Escape'/u);
assert.match(engine, /this\.systemMenu\.open/u);
assert.match(engine, /this\.paused/u);
assert.match(engine, /this\.minigameOverlay\.isOpen/u);
assert.match(engine, /SAVE_SCENE_INVALID/u);
assert.match(engine, /dropped_/u);
assert.match(engine, /scene_entered/u);

const dialogue = readFileSync(
  new URL('../src/ui/dialogue-ui.ts', import.meta.url),
  'utf8',
);
assert.match(dialogue, /setPaused\(/u);

const terminal = readFileSync(
  new URL('../src/ui/terminal-ui.ts', import.meta.url),
  'utf8',
);
assert.match(terminal, /get opened\(/u);

const minigame = readFileSync(
  new URL('../src/ui/minigame-overlay.ts', import.meta.url),
  'utf8',
);
assert.match(minigame, /get isOpen\(/u);
assert.match(minigame, /isQuillForgeMessage/u);
assert.match(minigame, /EMBED_MESSAGE\.pauseRequest/u);

const intro = readFileSync(
  new URL('../src/ui/solvay-intro.ts', import.meta.url),
  'utf8',
);
assert.match(intro, /setSolvayIntroPaused/u);

console.log('GAME_SAVE_WIRING=PASS');
