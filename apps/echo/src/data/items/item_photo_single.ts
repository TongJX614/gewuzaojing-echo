import { ItemDef } from './types';

export const ITEM_PHOTO_SINGLE: ItemDef = {
  id: 'item_photo_single',
  name: '单电子落点照片',
  type: 'key_item',
  typeLabel: '实验记录 | 显影底片',
  desc: '探测屏的一次实验记录。照片上只有一个局部亮点，说明电子被探测时会在一个明确位置留下完整记录。',
  lore: '这张照片无法显示电子此前经过的轨迹。',
  pixels: [
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDWDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
        '  KDDDDDDDDDDK  ',
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
