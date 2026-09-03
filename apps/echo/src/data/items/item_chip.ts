/** 三级加密数据盘 */
import type { ItemDef } from './types';

export const ITEM_CHIP: ItemDef = {
  id: 'item_chip',
  name: '三级加密数据盘',
  type: 'key_item',
  typeLabel: '关键道具 | 信息载体',
  desc: '一块被物理损坏的固态存储芯片。需要接入中控台终端才能读取内部日志。',
  lore: '"...不要相信AI系统，不要相信AI系统，不要相..." —— 刻在芯片背面的划痕。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "  KKKKKKKKKKKK  ",
    "  KMMMMMMMMMMK  ",
    "  KMKKKKKKKKMK  ",
    "  KMKCCCCCCKMK  ",
    "  KMKCCCCCCKMK  ",
    "  KMKCMMMMCKMK  ",
    "  KMKCCCCCCKMK  ",
    "  KMKCCCCCCKMK  ",
    "  KMKKKKKKKKMK  ",
    "  KMMMMMMMMMMK  ",
    "  KDDDDDDDDDDK  ",
    "  KKKKKKKKKKKK  ",
    "   M M M M M M  ",
    "   K K K K K K  ",
    "                ",
  ],
};
