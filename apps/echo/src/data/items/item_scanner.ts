/** 穿透式热像仪 */
import type { ItemDef } from './types';

export const ITEM_SCANNER: ItemDef = {
  id: 'item_scanner',
  name: '穿透式热像仪',
  type: 'equipment',
  typeLabel: '装备 | 探测终端',
  desc: '可以穿透标准厚度的舱壁，探测周围环境中的热源分布，用红色高亮显示。',
  lore: '它最近总是出故障。明明前方是完全真空的走廊，屏幕上却挤满了密密麻麻的红点。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "  KKKKKKKKKKKK  ",
    "  KMMMMMMMMMMK  ",
    "  KMRRRRRRRRMK  ",
    "  KMRROYORRRMK  ",
    "  KMRRRRRRORMK  ",
    "  KMRROORRRRMK  ",
    "  KMRRRRRRRRMK  ",
    "  KMMMMMMMMMMK  ",
    "  KMKKKMKMKKMK  ",
    "  KMMMMMMMMMMK  ",
    "  KDDDDDDDDDDK  ",
    "  KKKKKKKKKKKK  ",
    "                ",
    "                ",
    "                ",
  ],
};
