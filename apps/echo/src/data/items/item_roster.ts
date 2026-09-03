import { ItemDef } from './types';

export const ITEM_ROSTER: ItemDef = {
  id: 'item_roster',
  name: '索尔维会议参会名册',
  type: 'key_item',
  typeLabel: '历史文献 | 官方文件',
  desc: '一份印有参会科学家姓名和所属机构的正式名册。Einstein、Bohr、Schrödinger、Heisenberg等人都在其中。',
  lore: '他们大体认可量子理论的计算成果，却对它究竟描述什么存在明显分歧。',
  pixels: [
        '                ',
        '  KKKKKKKKKKKK  ',
        '  KSSSSSSSSSSK  ',
        '  KSLKLLLLLLSK  ',
        '  KSLKSKSSKLSK  ',
        '  KSLKLLLLLLSK  ',
        '  KSLKSKSSKLSK  ',
        '  KSLKLLLLLLSK  ',
        '  KSLKSKSSKLSK  ',
        '  KSLKLLLLLLSK  ',
        '  KSLKLLLLLLSK  ',
        '  KSLKLLLLLLSK  ',
        '  KSSSSSSSSSSK  ',
        '  KKKKKKKKKKKK  ',
        '                ',
        '                '
    ],
  stackable: false,
  maxStack: 1,
};
