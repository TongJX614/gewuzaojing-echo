import { ItemDef } from './types';

export const ITEM_BLUEPRINT_MOVE: ItemDef = {
  id: 'item_blueprint_move',
  name: '可回冲狭缝挡板装置图',
  type: 'key_item',
  typeLabel: '实验图纸 | 蓝图',
  desc: '挡板可以在粒子通过后发生轻微移动，从而留下动量交换的信息。',
  lore: '但挡板不再拥有同样稳定的位置，原本清晰的干涉图样也可能因此漂移并逐渐模糊。',
  pixels: [
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KBBBBBBBBBBK  ',
        '  KBBBBWWBBBBK  ',
        '  KBBAABBAABBK  ',
        '  KWWWWBBWWWWK  ',
        '  KWWWWBBWWWWK  ',
        '  KBBAABBAABBK  ',
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
