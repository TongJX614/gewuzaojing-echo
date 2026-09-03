import { ItemDef } from './types';

export const ITEM_SEATING: ItemDef = {
  id: 'item_seating',
  name: '会场座位安排表',
  type: 'key_item',
  typeLabel: '历史文献 | 平面图',
  desc: '标明讲台、主持席及各位参会者座位的会场平面图。',
  lore: '部分争论激烈的科学家被安排得很近，方便会议讨论，也让Lorentz不得不时刻留意现场秩序。',
  pixels: [
        '                ',
        '   KKKKKKKKKK   ',
        '  KWWWWWWWWWWK  ',
        '  KWKWWKWWKWK   ',
        '  KWWWWWWWWWWK  ',
        '  KWWWWWWWWWWK  ',
        '  KWDRRDRRDRWK  ',
        '  KWWWWWWWWWWK  ',
        '  KWDRRDRRDRWK  ',
        '  KWWWWWWWWWWK  ',
        '  KWKWWWWWWKWK  ',
        '  KWWWWWWWWWWK  ',
        '  KKKKKKKKKKKK  ',
        '                ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
