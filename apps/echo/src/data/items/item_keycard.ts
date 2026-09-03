/** 4级安保门禁卡 */
import type { ItemDef } from './types';

export const ITEM_KEYCARD: ItemDef = {
  id: 'item_keycard',
  name: '4级安保门禁卡',
  type: 'key_item',
  typeLabel: '任务道具 | 权限凭证',
  desc: '一张橙色高级权限的磁吸式身份卡，被授权进入下层反应堆和核心实验区。',
  lore: '卡片边缘有明显且尖锐的咬痕。持有者在死前似乎死死地把它含在了嘴里。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "   KKKKKKKKKK   ",
    "  KWWWWWWWWWWK  ",
    "  KWMMMMMMMMWK  ",
    "  KWWWWWWWWWWK  ",
    "  KWOOOOOOOOWK  ",
    "  KWOOOOOOOOWK  ",
    "  KWWWWWWWWWWK  ",
    "  KWKKKKKKKKWK  ",
    "  KWKKKKKKKKWK  ",
    "  KWWWWWWWWWWK  ",
    "  KWWWWWWWWWWK  ",
    "  KDDDDDDDDDDK  ",
    "   KKKKKKKKKK   ",
    "                ",
    "                ",
  ],
};
