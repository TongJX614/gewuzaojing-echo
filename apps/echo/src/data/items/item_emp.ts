/** 电磁脉冲手雷 */
import type { ItemDef } from './types';

export const ITEM_EMP: ItemDef = {
  id: 'item_emp',
  name: '电磁脉冲手雷',
  type: 'consumable',
  typeLabel: '消耗品 | 战术装备',
  desc: '能释放高强度定向电磁波的投掷物，可以瘫痪半径20米内的所有电子设备。',
  lore: '警告说明：严禁在具有生命维持系统的密闭舱室内使用，否则后果自负。',
  stackable: true,
  maxStack: 5,
  pixels: [
    "       KK       ",
    "      KMMK      ",
    "      KYYK      ",
    "    KKKMMKKK    ",
    "   KMMMMMMMMK   ",
    "  KMMCCCCCCMMK  ",
    "  KMCMMMMMMCMK  ",
    "  KMKMMMMMMKMK  ",
    "  KMKMMMMMMKMK  ",
    "  KMCMMMMMMCMK  ",
    "  KMMCCCCCCMMK  ",
    "   KMMMMMMMMK   ",
    "    KKDDDDKK    ",
    "      KKKK      ",
    "                ",
    "                ",
  ],
};
