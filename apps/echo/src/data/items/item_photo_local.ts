import { ItemDef } from './types';

export const ITEM_PHOTO_LOCAL: ItemDef = {
  id: 'item_photo_local',
  name: '局域探测点照片',
  type: 'key_item',
  typeLabel: '实验记录 | 显影底片',
  desc: '一张真实探测记录，屏幕上只出现一个边界明确的亮点。',
  lore: '它说明单次测量总是在局部位置发现完整电子，与连续铺展的波函数图像形成鲜明对照。',
  pixels: [
        '                ',
        '   KKKKKKKKKK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDWDDDK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDDDDDK   ',
        '   KDDDDDDDDK   ',
        '   KKKKKKKKKK   ',
        '                ',
        '                ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
