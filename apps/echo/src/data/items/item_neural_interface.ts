import type { ItemDef } from './types';

/** 神经接口模块 */
export const ITEM_NEURAL_INTERFACE: ItemDef = {
  id: 'neural_interface',
  name: '神经接口模块',
  type: 'material',
  typeLabel: '材料 | 电子元件',
  stackable: false,
  maxStack: 1,
  desc: '一个从废弃设备中拆解出来的神经连接模块，表面残留着微弱的生物电信号。',
  lore: '"接口的金属触点上还沾着干涸的导电凝胶。上一个连接者似乎经历了剧烈的神经冲击。"',
  pixels: [
    "                ",
    "      KKKK      ",
    "    KKMMMMKK    ",
    "   KMMMMMMMMK   ",
    "  KMMKKKKKKMMK  ",
    "  KMKCCCCCKMK   ",
    "  KMKCCMMCCMK   ",
    "  KMKCCCCCKMK   ",
    "  KMKKKKKKKMK   ",
    "  KMMMMMMMMMK   ",
    "  KMDDDDDDMK    ",
    "   KMMDMMK K    ",
    "    KK K  KK    ",
    "     CC  CC     ",
    "      C   C     ",
    "                "
  ]
};
