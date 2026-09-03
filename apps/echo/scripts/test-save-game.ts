import assert from 'node:assert/strict';

import {
  LocalSaveGameStore,
  SAVE_SLOT_IDS,
  SaveGameError,
  type GameSnapshot,
} from '../src/systems/save-game';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const snapshot: GameSnapshot = {
  playtimeMs: 90_000,
  scene: { id: 'vr', playerX: 12.5, playerY: 8 },
  player: { hp: 85, exp: 20, level: 2 },
  inventory: [{ itemId: 'item_battery', qty: 1 }],
  progress: {
    chapter: 1,
    stage: 'prep',
    flags: ['visited:vr'],
    completedQuests: [],
    totalExp: 20,
  },
  quests: { questRuntimes: [], trackedQuestId: null },
  world: {
    talkedEntityIds: ['vr_lab_researcher'],
    collectedEntityIds: [],
    droppedItems: [],
  },
};

assert.deepEqual(SAVE_SLOT_IDS, [
  'auto',
  'manual-1',
  'manual-2',
  'manual-3',
]);

const storage = new MemoryStorage();
const store = new LocalSaveGameStore(
  storage,
  () => new Date('2026-09-03T10:00:00.000Z'),
);

assert.equal(store.list().every((entry) => entry.status === 'empty'), true);

const saved = store.write('manual-1', snapshot);
assert.equal(saved.summary.sceneId, 'vr');
assert.equal(saved.summary.stage, 'prep');
assert.equal(saved.summary.playtimeMs, 90_000);
assert.deepEqual(store.read('manual-1'), saved);
assert.equal(store.latest()?.slotId, 'manual-1');

const mutableRead = store.read('manual-1');
assert.ok(mutableRead);
mutableRead.snapshot.progress.flags.push('mutated-after-read');
assert.deepEqual(store.read('manual-1')?.snapshot.progress.flags, ['visited:vr']);

store.remove('manual-1');
assert.equal(store.read('manual-1'), null);

storage.setItem('echo.save.v1.manual-2', '{broken');
assert.equal(
  store.list().find((entry) => entry.slotId === 'manual-2')?.status,
  'invalid',
);

storage.setItem(
  'echo.save.v1.manual-3',
  JSON.stringify({ format: 'echo-save', version: 99 }),
);
assert.equal(store.read('manual-3'), null);

storage.setItem(
  'echo.save.v1.auto',
  JSON.stringify({
    ...saved,
    slotId: 'auto',
    snapshot: {
      ...saved.snapshot,
      playtimeMs: -1,
    },
  }),
);
assert.equal(store.read('auto'), null);

const failingStorage = new MemoryStorage();
failingStorage.setItem = () => {
  throw new DOMException('quota', 'QuotaExceededError');
};
assert.throws(
  () => new LocalSaveGameStore(failingStorage).write('manual-1', snapshot),
  (error) =>
    error instanceof SaveGameError && error.code === 'SAVE_WRITE_FAILED',
);

console.log('SAVE_GAME_STORE=PASS');
