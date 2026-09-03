import assert from 'node:assert/strict';
import type { Quest } from '../src/data/quests/types';
import { ProgressManager } from '../src/systems/progress';
import { QuestManager } from '../src/systems/quest';
import { InventorySystem } from '../src/systems/inventory';

const inventory = new Map<string, number>();
let playerExp = 0;
const grantedItems: Array<{ itemId: string; count: number }> = [];

const definition: Quest = {
  id: 'test_framework',
  title: 'Framework Test',
  desc: '',
  category: 'main',
  autoStart: true,
  steps: [
    {
      id: 'step_and',
      desc: '',
      logic: 'AND',
      objectives: [
        { type: 'collect_item', target: 'item_a', count: 2 },
        { type: 'talk_to_npc', target: 'npc_a' },
      ],
    },
    {
      id: 'step_or',
      desc: '',
      logic: 'OR',
      objectives: [
        { type: 'trigger_event', target: 'event_a' },
        { type: 'custom_flag', target: 'flag_a' },
      ],
    },
    {
      id: 'step_submit',
      desc: '',
      objectives: [{ type: 'submit_item', target: 'item_a', submitTo: 'npc_a', count: 2 }],
    },
  ],
  rewards: {
    items: [{ itemId: 'reward_a', count: 2 }],
    exp: 30,
    flags: ['reward_flag'],
  },
  onCompleteFlags: ['complete_flag'],
};

const progress = new ProgressManager();
const manager = new QuestManager(progress, {
  getInventoryCount: (itemId) => inventory.get(itemId) ?? 0,
  grantItem: (itemId, count) => {
    grantedItems.push({ itemId, count });
    return true;
  },
  grantPlayerExp: (amount) => { playerExp += amount; },
  getWorldSnapshot: () => ({ sceneId: 'scene_a', x: 0, y: 0 }),
  now: () => 1000,
}, [definition]);

assert.equal(manager.getRuntime(definition.id)?.status, 'active');
manager.reportEvent({ type: 'item_collected', itemId: 'item_a' });
manager.reportEvent({ type: 'dialogue_completed', npcId: 'npc_a' });
assert.equal(manager.getRuntime(definition.id)?.currentStepIndex, 0, 'AND step must wait for both item counts');

manager.reportEvent({ type: 'item_collected', itemId: 'item_a' });
assert.equal(manager.getRuntime(definition.id)?.currentStepIndex, 1);

progress.setFlag('flag_a');
assert.equal(manager.getRuntime(definition.id)?.currentStepIndex, 2, 'custom flag should drive OR step through progress events');
assert.deepEqual(manager.getPendingSubmissions('npc_a').map((item) => item.remaining), [2]);

manager.reportEvent({ type: 'item_submitted', itemId: 'item_a', npcId: 'npc_a', count: 2 });
assert.equal(manager.getRuntime(definition.id)?.status, 'completed');
assert.equal(progress.isQuestCompleted(definition.id), true);
assert.equal(progress.getExp(), 30);
assert.equal(playerExp, 30);
assert.equal(progress.hasFlag('reward_flag'), true);
assert.equal(progress.hasFlag('complete_flag'), true);
assert.deepEqual(grantedItems, [{ itemId: 'reward_a', count: 2 }]);

const persistenceQuest: Quest = {
  id: 'test_persistence',
  title: 'Persistence Test',
  desc: '',
  category: 'side',
  steps: [{ id: 'collect', desc: '', objectives: [{ type: 'collect_item', target: 'item_b', count: 3 }] }],
};
const first = new QuestManager(new ProgressManager(), {}, [persistenceQuest]);
assert.equal(first.activateQuest(persistenceQuest.id), true);
first.reportEvent({ type: 'item_collected', itemId: 'item_b', count: 2 });
const saved = first.serialize();

const restored = new QuestManager(new ProgressManager(), {}, [persistenceQuest]);
restored.restore(saved);
assert.equal(restored.getRuntime(persistenceQuest.id)?.steps[0].objectives[0].current, 2);
restored.reportEvent({ type: 'item_collected', itemId: 'item_b' });
assert.equal(restored.getRuntime(persistenceQuest.id)?.status, 'completed');

const inventorySystem = new InventorySystem();
assert.equal(inventorySystem.addItem('item_battery', 25), true);
assert.equal(inventorySystem.getItemQty('item_battery'), 25);
assert.equal(inventorySystem.getSlots().length, 2, 'reward quantities above one stack should use another slot');
assert.equal(inventorySystem.removeItem('item_battery', 22), 22);
assert.equal(inventorySystem.getItemQty('item_battery'), 3);

console.log('QuestManager tests passed');
