/** 共振星石 */
import type { ItemDef } from './types';

export const ITEM_ARTIFACT: ItemDef = {
  id: 'item_artifact',
  name: '共振星石',
  type: 'unknown',
  typeLabel: '未知 | 异星物质',
  desc: '一种不符合任何已知物理学定律的紫色晶体，表面冰冷但内部散发着微弱的热量。',
  lore: '当你把它握在手里时，总觉得能听到通讯频道里传来某种微弱的低语。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "       KK       ",
    "      KPPK      ",
    "     KPPPPK     ",
    "    KPPPPPPK    ",
    "    KPWPPPWK    ",
    "   KPPPPPPPPK   ",
    "   KPPWPPWPPK   ",
    "   KPPPPPPPPK   ",
    "    KPPPPPPK    ",
    "    KPWPPPWK    ",
    "     KPPPPK     ",
    "      KPPK      ",
    "       KK       ",
    "                ",
    "                ",
  ],
};
