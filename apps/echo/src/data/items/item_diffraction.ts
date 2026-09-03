import { ItemDef } from './types';

export const ITEM_DIFFRACTION: ItemDef = {
  id: 'item_diffraction',
  name: '电子衍射累积图',
  type: 'key_item',
  typeLabel: '实验记录 | 显影底片',
  desc: '大量电子依次到达探测屏后形成的图样。每个电子只留下一个点，但许多落点积累起来，却组成了具有规律的衍射环或明暗条纹。',
  lore: '上帝是否掷骰子？这些宏观的干涉条纹，究竟是粒子群体的统计规律，还是单个电子自身的波动属性？',
  pixels: [
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDGDDGDDDK  ',
        '  KDDGDDDDGDDK  ',
        '  KDGDWDDWDGDK  ',
        '  KDGDWWWWDGDK  ',
        '  KDGDWDDWDGDK  ',
        '  KDDGDDDDGDDK  ',
        '  KDDDGDDGDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KKKKKKKKKKKK  ',
        '                ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
