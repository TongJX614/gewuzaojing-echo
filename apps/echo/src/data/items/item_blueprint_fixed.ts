import { ItemDef } from './types';

export const ITEM_BLUEPRINT_FIXED: ItemDef = {
  id: 'item_blueprint_fixed',
  name: '固定狭缝挡板装置图',
  type: 'key_item',
  typeLabel: '实验图纸 | 蓝图',
  desc: '挡板被牢固固定，狭缝的位置能够保持稳定。这样的装置有利于得到清晰的衍射或干涉图样。',
  lore: '但无法通过挡板运动读取粒子与挡板交换的动量。玻尔曾以此反驳爱因斯坦的思想实验。',
  pixels: [
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KBBBBBBBBBBK  ',
        '  KBBBBWWBBBBK  ',
        '  KBBBBBBBBBBK  ',
        '  KWWWWBBWWWWK  ',
        '  KWWWWBBWWWWK  ',
        '  KBBBBBBBBBBK  ',
        '  KBBBBWWBBBBK  ',
        '  KBBBBBBBBBBK  ',
        '  KBBBBBBBBBBK  ',
        '  KBBBBBBBBBBK  ',
        '  KKKKKKKKKKKK  ',
        '                ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
