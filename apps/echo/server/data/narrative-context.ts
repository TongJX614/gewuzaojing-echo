// ABOUTME: AI 对话的叙事上下文构建器
// ABOUTME: 将故事背景、世界设定、剧情阶段、任务进度注入 AI prompt

const SCRIPT_META = {
  title: '回响',
  genre: '科幻悬疑 / 量子物理',
};

const WORLD_BOOK = [
  { title: '世界观', content: '故事设定在一所顶尖量子物理研究所。研究所拥有多个实验室，研究方向涵盖天体物理、ARPES（角分辨光电子能谱）和 VR（虚拟现实）技术。' },
  { title: '回溯引擎', content: '一台能够以虚拟现实方式让人进入过去某个时刻、亲历其中历程的实验性设备，可用于科研项目的探索。启动条件严格，存在安全隐患。' },
  { title: '量子纠缠', content: '本世界的核心物理概念。两个粒子无论相距多远，状态都会瞬时关联。主角的特殊能力与量子纠缠有关。' },
  { title: '平行世界线', content: '存在多条世界线，主角的选择会影响世界线走向。不同世界线中人物的记忆和行为可能不同。' },
];

const STORY_STAGES = [
  { id: 'prep', name: '筹备日', description: '玩家到达研究所，熟悉环境，与 NPC 建立关系，为即将到来的学术辩论做准备。', emotionalArc: '好奇与期待' },
  { id: 'debate1', name: '第一轮辩论', description: '第一次学术辩论开始，各种观点碰撞，关键线索浮出水面。', emotionalArc: '紧张与疑惑' },
  { id: 'debate2', name: '第二轮辩论', description: '深入辩论，真相逐渐清晰，角色间的矛盾达到高潮。', emotionalArc: '冲突与抉择' },
  { id: 'finale', name: '终幕', description: '所有线索汇聚，主角面临最终选择，世界线走向决定。', emotionalArc: '释然与回响' },
];

const STORY_BEATS = [
  { name: '到达', description: '主角抵达研究所，第一次接触回溯引擎' },
  { name: '异常', description: '主角发现量子数据中的异常现象' },
  { name: '分歧', description: '研究员们对异常数据的解释产生分歧' },
  { name: '真相', description: '主角通过 VR 设备回溯过去，发现隐藏的真相' },
];

export interface NarrativeContext {
  sceneId?: string;
  stage?: string;
  questProgress?: string[];
  flags?: string[];
}

export function buildNarrativeContext(): string {
  const parts: string[] = [];

  parts.push(`【剧本】${SCRIPT_META.title}（${SCRIPT_META.genre}）`);

  const worldEntries = WORLD_BOOK.map(e => `• ${e.title}：${e.content}`).join('\n');
  parts.push(`【世界设定】\n${worldEntries}`);

  const beats = STORY_BEATS.map(b => `${b.name}：${b.description}`).join('；');
  parts.push(`【已知的剧情线索】${beats}`);

  return parts.join('\n\n');
}

export function buildContextSummary(ctx: NarrativeContext | undefined): string {
  if (!ctx) return '';
  const parts: string[] = [];

  if (ctx.stage) {
    const stageMap: Record<string, string> = {
      prep: '筹备日',
      debate1: '辩论一',
      debate2: '辩论二',
      finale: '终幕',
    };
    const stageName = stageMap[ctx.stage] ?? ctx.stage;
    const storyStage = STORY_STAGES.find(s => s.id === ctx.stage);
    if (storyStage) {
      parts.push(`【当前剧情阶段】${storyStage.name}：${storyStage.description}（情感线：${storyStage.emotionalArc}）`);
    } else {
      parts.push(`【当前剧情阶段】${stageName}`);
    }
  }

  if (ctx.sceneId) {
    const sceneNames: Record<string, string> = {
      astro: '天体物理实验室',
      vr: 'VR 实验室',
      arpes: 'ARPES 实验室',
    };
    parts.push(`【当前场景】${sceneNames[ctx.sceneId] ?? ctx.sceneId}`);
  }

  if (ctx.questProgress && ctx.questProgress.length > 0) {
    parts.push(`【当前任务】${ctx.questProgress.join('；')}`);
  }

  if (ctx.flags && ctx.flags.length > 0) {
    const userFlags = ctx.flags.filter(f =>
      !f.startsWith('visited:') &&
      !f.startsWith('talked:') &&
      !f.startsWith('stage_')
    );
    if (userFlags.length > 0) {
      parts.push(`【已发生的事件】${userFlags.join('、')}`);
    }
  }

  return parts.join('\n');
}
