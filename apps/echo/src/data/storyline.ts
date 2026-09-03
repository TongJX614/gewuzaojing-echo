// ============================================================
// 主线剧情 & 剧本元数据 — Mod 友好
// ============================================================

export interface StoryBeat {
  id: string;
  name: string;
  description: string;
  scene: string;
  purpose: string;
}

export interface StoryStage {
  id: string;
  name: string;
  description: string;
  scenes: string[];
  keyEvents: string[];
  emotionalArc: string;
}

export const SCRIPT_META = {
  id: 'echo_demo_001',
  title: '回响',
  version: '1.0.0',
  author: '挑战杯团队',
  genre: '硬核科幻/悬疑/近未来',
  language: '中文',
  estimatedDuration: '30-45分钟',
  difficulty: '中等',
  replayValue: '3个结局，2条分支线',
  license: 'CC BY-NC-SA 4.0',
} as const;

export const STORY_STAGES: StoryStage[] = [
  {
    id: 'stage_01',
    name: '开端',
    description: '神秘委托引发的连锁反应',
    scenes: ['scene_01'],
    keyEvents: ['收到匿名委托', '决定接受委托', '记忆碎片中发现异常'],
    emotionalArc: '好奇 → 不安 → 震惊',
  },
  {
    id: 'stage_02',
    name: '发现',
    description: '记忆修复揭示的真相',
    scenes: ['scene_02'],
    keyEvents: ['进入记忆空间', '发现记忆属于自己', '目睹织女号灾难真相'],
    emotionalArc: '困惑 → 恐惧 → 愤怒',
  },
  {
    id: 'stage_03',
    name: '对峙',
    description: '真相与谎言的正面交锋',
    scenes: ['scene_03'],
    keyEvents: ['前往织星科技总部', '与杜维明对质', '林晓面临存在拷问'],
    emotionalArc: '坚定 → 动摇 → 抉择',
  },
  {
    id: 'stage_04',
    name: '结局',
    description: '选择的代价与回响',
    scenes: ['scene_04'],
    keyEvents: ['根据选择进入不同结局', '代价与收获呈现'],
    emotionalArc: '释然/遗憾/希望',
  },
];

export const STORY_BEATS: StoryBeat[] = [
  { id: 'beat_01', name: '神秘委托', description: '一封匿名邮件打破了苏然平静的夜晚', scene: 'scene_01', purpose: '建立悬疑氛围' },
  { id: 'beat_02', name: '第一次接触', description: '苏然开始修复，发现记忆数据的异常', scene: 'scene_01', purpose: '暗示记忆的特殊性' },
  { id: 'beat_03', name: '真相时刻', description: '苏然发现记忆属于自己', scene: 'scene_02', purpose: '故事核心转折' },
  { id: 'beat_04', name: '灾难重现', description: '苏然目睹织女号实验失控', scene: 'scene_02', purpose: '揭露真相' },
  { id: 'beat_05', name: '正面对峙', description: '苏然与杜维明对峙', scene: 'scene_03', purpose: '情感高潮' },
  { id: 'beat_06', name: '最终选择', description: '苏然做出决定', scene: 'scene_03', purpose: '玩家代入感最高点' },
  { id: 'beat_07', name: '回响', description: '结局呈现', scene: 'scene_04', purpose: '主题升华' },
];
