import type { ItemDef } from './types';

/** 记忆数据碎片 */
export const ITEM_MEMORY_DATA: ItemDef = {
  id: 'memory_data',
  name: '记忆数据碎片',
  type: 'key_item',
  typeLabel: '关键道具 | 数据载体',
  stackable: false,
  maxStack: 1,
  desc: '一段从旧终端中提取的加密记忆数据。需要特定的解码设备才能读取其中的内容。',
  lore: '"数据碎片中隐约可见一个女人的身影，她似乎在对着什么人微笑。你无法确定这是谁的记忆。"',
  pixels: [
    "                ",
    "   KKKKKKKKKK   ",
    "  KMMMMMMMMMK   ",
    "  KMKKKKKKKMK   ",
    "  KMKCCCCCMK    ",
    "  KMKCCCCCMK    ",
    "  KMCCCMMCMK    ",
    "  KMKCCCCCMK    ",
    "  KMKCCCCCMK    ",
    "  KMKKKKKKKMK   ",
    "  KMMMMMMMMMK   ",
    "  KDDDDDDDDDK   ",
    "  KKKKKKKKKKK   ",
    "   M M M M M    ",
    "   K K K K K    ",
    "                "
  ]
};
