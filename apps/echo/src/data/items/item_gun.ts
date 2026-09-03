/** 等离子切割枪 */
import type { ItemDef } from './types';

export const ITEM_GUN: ItemDef = {
  id: 'item_gun',
  name: '等离子切割枪',
  type: 'equipment',
  typeLabel: '装备 | 武器',
  desc: '原本用于切割船体装甲的工程工具，但去除安全锁后，是一把致命的防身武器。',
  lore: '枪管严重过热变形。前任使用者显然遇到过连这把枪都无法解决的麻烦。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "                ",
    "   KKKKK        ",
    "  KMMMMMK       ",
    "  KMMMMMK KKKK  ",
    " KKKKKMMKKKMMKK ",
    " KCCCCCMMMMMMMK ",
    " KKKKKKMMMMMMMK ",
    "      KMMKDDDK  ",
    "      KMMK KK   ",
    "      KMMK      ",
    "     KDDDK      ",
    "     KKKKK      ",
    "                ",
    "                ",
    "                ",
  ],
};
