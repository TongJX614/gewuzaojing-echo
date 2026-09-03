// ============================================================
// 世界书数据 — Mod 友好
// ============================================================

export interface WorldBookEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export const WORLD_BOOK: WorldBookEntry[] = [
  {
    id: 'world_bg',
    title: '世界背景',
    content: '2087年，新深圳（New Shenzhen）— 建立在旧深圳废墟上的巨型都市。2045年"大断联"摧毁了旧世界的数字基础设施，记忆科技成为新时代核心产业。',
    tags: ['设定', '背景'],
  },
  {
    id: 'memory_repair',
    title: '记忆修复术',
    content: '修复因创伤、疾病或人为删除而损坏的记忆片段。修复师进入"记忆空间"——神经接口构建的虚拟意识领域。深度链接可能导致意识混淆。',
    tags: ['科技', '核心'],
  },
  {
    id: 'memory_edit',
    title: '记忆编辑术',
    content: '合法：治疗PTSD、删除创伤记忆（需审批）。非法：篡改记忆、植入虚假记忆。全球记忆伦理公约禁止非治疗目的编辑，但执法困难。',
    tags: ['科技', '冲突'],
  },
  {
    id: 'starweave',
    title: '织星科技',
    content: '全球最大记忆科技公司，总部新深圳织星塔（128层）。表面：记忆修复/治疗/存档。暗面：非法记忆交易、记忆控制实验。创始人：杜维明。',
    tags: ['组织', '核心'],
  },
  {
    id: 'zhinuv',
    title: '织女号空间站',
    content: '织星科技私人太空站，2079年发射，2083年"设备故障"退役，所有乘员记忆统一删除。实际：非法记忆实验致多人脑死亡，退役后封锁在轨道。',
    tags: ['组织', '秘密'],
  },
  {
    id: 'social_rules',
    title: '社会规则',
    content: '①记忆所有权：未经授权修改他人记忆是重罪 ②公民有权免费存档记忆备份 ③记忆修复师需政府执照 ④地下记忆交易黑市活跃',
    tags: ['设定', '规则'],
  },
];

export function getWorldEntry(id: string): WorldBookEntry | undefined {
  return WORLD_BOOK.find(e => e.id === id);
}

export function getEntriesByTag(tag: string): WorldBookEntry[] {
  return WORLD_BOOK.filter(e => e.tags.includes(tag));
}
