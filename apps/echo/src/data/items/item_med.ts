/** 神经镇静剂 */
import type { ItemDef } from './types';

export const ITEM_MED: ItemDef = {
  id: 'item_med',
  name: '神经镇静剂 (STIM-X)',
  type: 'consumable',
  typeLabel: '消耗品 | 医疗物资',
  desc: '抑制中枢神经的恐惧反应，恢复少量生命值并消除幻觉状态。',
  lore: '这东西在黑市上被称为"死神之吻"。用多了你会分不清现实和深空的幻境。',
  stackable: true,
  maxStack: 10,
  pixels: [
    "       KK       ",
    "      KMMK      ",
    "      KMMK      ",
    "    KKKMMKKK    ",
    "   KWWKKKKWWK   ",
    "   KWWBBBBWWK   ",
    "   KWWRRBBWWK   ",
    "   KWWRRRRWWK   ",
    "   KWWRRRRWWK   ",
    "   KWWRRBBWWK   ",
    "   KWWBBBBWWK   ",
    "    KKKMMKKK    ",
    "      KMMK      ",
    "      KMMK      ",
    "       MM       ",
    "       WW       ",
  ],
};
