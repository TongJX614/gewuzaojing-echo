/** 压缩氧气棒 */
import type { ItemDef } from './types';

export const ITEM_O2: ItemDef = {
  id: 'item_o2',
  name: '压缩氧气棒 (O2-CELL)',
  type: 'consumable',
  typeLabel: '消耗品 | 生存物资',
  desc: '便携式高压氧气罐。可以补充防护服内 35% 的生命维持气体。',
  lore: '标签被磨损了，上面有干涸的暗红色血迹。上一任主人没来得及用它。',
  stackable: true,
  maxStack: 10,
  pixels: [
    "      KKKK      ",
    "     KMMMMK     ",
    "    KKKKKKKK    ",
    "    KWWMMWWK    ",
    "    KBBBBBBK    ",
    "    KCCCCCCK    ",
    "    KCCCCCCK    ",
    "    KCCCCCCK    ",
    "    KCCCCCCK    ",
    "    KBBBBBBK    ",
    "    KCCCCCCK    ",
    "    KBBBBBBK    ",
    "    KMMMMMMK    ",
    "    KDDDDDDK    ",
    "    KKKKKKKK    ",
    "                ",
  ],
};
