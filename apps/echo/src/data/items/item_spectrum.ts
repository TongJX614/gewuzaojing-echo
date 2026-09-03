import { ItemDef } from './types';

export const ITEM_SPECTRUM: ItemDef = {
  id: 'item_spectrum',
  name: '原子发射光谱底片',
  type: 'key_item',
  typeLabel: '实验记录 | 显影底片',
  desc: '一张记录原子发光结果的感光底片，上面不是连续彩色光带，而是若干位置固定的亮线。',
  lore: '它记录了原子能够发出哪些频率的光，却没有拍到电子在原子内部的运动轨道。',
  pixels: [
        '                ',
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KDDDDDDDDDDK  ',
        '  KDWDDWDDDWDK  ',
        '  KDWDDWDDDWDK  ',
        '  KDWDDWDDDWDK  ',
        '  KDWDDWDDDWDK  ',
        '  KDWDDWDDDWDK  ',
        '  KDDDDDDDDDDK  ',
        '  KKKKKKKKKKKK  ',
        '                ',
        '                ',
        '                ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
