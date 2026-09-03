/** 军用合成营养膏 */
import type { ItemDef } from './types';

export const ITEM_FOOD: ItemDef = {
  id: 'item_food',
  name: '军用合成营养膏',
  type: 'consumable',
  typeLabel: '消耗品 | 生存物资',
  desc: '高度压缩的条状食物，能提供人体一整天所需的热量、维生素和微量元素。',
  lore: '口感像是在咀嚼带有机油味的硬纸板，但在这片星区，这是难得的奢侈品。',
  stackable: true,
  maxStack: 30,
  pixels: [
    "                ",
    "                ",
    "   KKKKKKKKKK   ",
    "   KMMMMMMMMK   ",
    "  KWWMMMMMMWK   ",
    "  KWMMMMMMMMK   ",
    "  KWMMMMMMMMK   ",
    "  KWGMMMMMMMK   ",
    "  KWGMMMMMMMK   ",
    "  KWMMMMMMMMK   ",
    "  KWMMMMMMMMK   ",
    "  KKDMMMMMMDK   ",
    "   KKKKKKKKKK   ",
    "                ",
    "                ",
    "                ",
  ],
};
