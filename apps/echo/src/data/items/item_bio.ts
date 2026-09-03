/** 密封生物样本 */
import type { ItemDef } from './types';

export const ITEM_BIO: ItemDef = {
  id: 'item_bio',
  name: '密封生物样本',
  type: 'unknown',
  typeLabel: '未知 | 隔离物资',
  desc: '一个厚重的玻璃容器，里面装着某种正在微微蠕动并发光的凝胶状物质。',
  lore: '系统检测不到该物质的碳基结构。它似乎...在观察你。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "   KKKKKKKKKK   ",
    "   KMMMMMMMMK   ",
    "   KKKBBBBBKK   ",
    "    KBBBBBBK    ",
    "    KBGGGGBK    ",
    "    KBPPPPBK    ",
    "    KBPGGPBK    ",
    "    KBPPPPBK    ",
    "    KBBGGGBK    ",
    "    KBBBBBBK    ",
    "   KKKDDDDDKK   ",
    "   KMMMMMMMMK   ",
    "   KKKKKKKKKK   ",
    "                ",
    "                ",
  ],
};
