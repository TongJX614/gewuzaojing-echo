import { ItemDef } from './types';

export const ITEM_NAMEPLATE: ItemDef = {
  id: 'item_nameplate',
  name: '科学家人物桌牌',
  type: 'key_item',
  typeLabel: '会议物品 | 纪念物',
  desc: '写有参会者姓氏的折叠桌牌，用来确认每位科学家的座位。',
  lore: '桌牌外观基本相同，只通过姓名和细小标记区分人物。',
  pixels: [
        '                ',
        '                ',
        '                ',
        '                ',
        '      KKKK      ',
        '     KWWWWK     ',
        '    KWWWWWWK    ',
        '   KWWWSSWWWK   ',
        '  KWWWWWWWWWWK  ',
        '  KWWSWSSWSWWK  ',
        ' KWWWWWWWWWWWWK ',
        ' KKKKKKKKKKKKKK ',
        '                ',
        '                ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
