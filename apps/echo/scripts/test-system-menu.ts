import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  formatPlaytime,
  saveSlotDescription,
  slotLabel,
} from '../src/ui/save-slot-view';

assert.equal(formatPlaytime(0), '00:00');
assert.equal(formatPlaytime(61_000), '01:01');
assert.equal(formatPlaytime(3_661_000), '01:01:01');
assert.equal(slotLabel('auto'), '自动存档');
assert.equal(slotLabel('manual-3'), '手动存档 3');
assert.equal(
  saveSlotDescription({ slotId: 'manual-1', status: 'empty' }),
  '空存档',
);
assert.equal(
  saveSlotDescription({ slotId: 'manual-2', status: 'invalid' }),
  '存档不可用',
);

const source = readFileSync(
  new URL('../src/ui/system-menu.ts', import.meta.url),
  'utf8',
);
for (const label of ['继续游戏', '保存游戏', '读取存档', '返回标题']) {
  assert.match(source, new RegExp(label, 'u'));
}
assert.match(source, /保存暂不可用/u);
assert.match(source, /覆盖该存档/u);
assert.match(source, /未保存进度将被替换/u);
assert.match(source, /删除该存档/u);

console.log('SYSTEM_MENU=PASS');
