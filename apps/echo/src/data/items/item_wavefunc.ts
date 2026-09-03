import { ItemDef } from './types';

export const ITEM_WAVEFUNC: ItemDef = {
  id: 'item_wavefunc',
  name: '波函数连续分布示意图',
  type: 'key_item',
  typeLabel: '理论图稿 | 黑板草图',
  desc: 'Schrödinger用于说明波函数空间分布的理论图。图中的连续云团表示波函数在不同位置的分布。',
  lore: '这并非照相机直接拍摄到的电子形状，而是一个概率（或电荷分布）在三维空间中的数学幽灵。',
  pixels: [
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDWWWDDDDK  ',
        '  KDDWWWWWDDDK  ',
        '  KDWWWWWWWDDK  ',
        '  KDDWWWWWDDDK  ',
        '  KDDDWWWDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KKKKKKKKKKKK  ',
        '  S          S  ',
        ' SSSS      SSSS ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
