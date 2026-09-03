/** 离子聚合物电池 */
import type { ItemDef } from './types';

export const ITEM_BATTERY: ItemDef = {
  id: 'item_battery',
  name: '离子聚合物电池',
  type: 'material',
  typeLabel: '材料 | 能源',
  desc: '标准的工业级高能电池，可用于重启废弃门禁或给能量武器充能。',
  lore: '表面的警示标语写着：远离明火与有机生命体。',
  stackable: true,
  maxStack: 20,
  pixels: [
    "                ",
    "      KKKK      ",
    "     KMMMMK     ",
    "   KKKKKKKKKK   ",
    "   KMMMMMMMMK   ",
    "   KMYYYYYYMK   ",
    "   KMYYYYYYMK   ",
    "   KMYKKKKYYK   ",
    "   KMYYYYYYMK   ",
    "   KMYYYYYYMK   ",
    "   KMYYYYYYMK   ",
    "   KMDDDDDDDK   ",
    "   KMMMMMMMMK   ",
    "   KKKKKKKKKK   ",
    "                ",
    "                ",
  ],
};
