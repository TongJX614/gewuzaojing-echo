/** 损毁的伺服眼 */
import type { ItemDef } from './types';

export const ITEM_EYE: ItemDef = {
  id: 'item_eye',
  name: '损毁的伺服眼',
  type: 'material',
  typeLabel: '材料 | 电子残骸',
  desc: '从某个报废的清洁无人机上扯下来的光学传感器，后面还连着几根冒火花的电线。',
  lore: '即便已经从主板上剥离，它的光圈仍在不规律地收缩，仿佛还在记录着你的每一个动作。',
  stackable: false,
  maxStack: 1,
  pixels: [
    "                ",
    "      KKKK      ",
    "    KKMMMMKK    ",
    "   KMMMMMMMMK   ",
    "  KMMKKKKKKMMK  ",
    "  KMKRRRRRRKMK  ",
    "  KMKRRWWRRKMK  ",
    "  KMKRRWWRRKMK  ",
    "  KMKRRRRRRKMK  ",
    "  KMMKKKKKKMMK  ",
    "  KMMMMMMMMMMK  ",
    "   KMMDMMDMMK   ",
    "    KK K  KK    ",
    "     YY  YY     ",
    "      Y   Y     ",
    "                ",
  ],
};
