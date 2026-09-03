// ============================================================
// 对话树数据 — Mod 友好
// 这是 galgame 对话系统的核心数据，修改此文件即可增删剧情
// ============================================================

import type { StartConditionEntry } from './quests/types';
import type { NarrativeAction } from '../systems/condition-action';
import { getProjectTwoCanonicalBrief } from './vr-experiences';
import type {
  ProjectTwoRoleId,
  ProjectTwoSelection,
  ProjectTwoThemeId,
} from '../types/vr-experience';

export type Emotion = 'idle' | 'happy' | 'angry' | 'sad' | 'surprise';

export interface DialogueLine {
  speaker: string;       // 角色 ID 或 'narrator'
  text: string;          // 对话文本
  emotion?: Emotion;     // 情绪表情（默认 idle）
}

export interface DialogueChoice {
  text: string;          // 选项显示文本
  next: string;          // 选择后跳转的对话 ID
  effect?: string;      // @deprecated 旧格式效果字符串，保留向后兼容
  actions?: NarrativeAction[];  // 新格式：结构化动作列表
}

export interface DialogueNode {
  id: string;
  lines: DialogueLine[];
  choices?: DialogueChoice[];  // 有选项时显示，无则自动推进
  next?: string;               // 无选项时自动跳转的下一节点
  cgUrl?: string;              // 节点级 CG：进入该节点时切换全屏 CG（event_type2）
}

export type EventType = 'event_type1' | 'event_type2';

export interface DialogueTree {
  id: string;
  scene: string;          // 关联场景
  trigger: string;        // 触发条件（NPC id 或 'auto'）
  eventType?: EventType;  // 事件类型：type1=立绘+背景+对话框, type2=CG+对话框
  cgUrl?: string;         // event_type2 时显示的 CG 图片路径
  stage?: string;         // 只在该阶段显示此对话；不填 = 任意阶段
  condition?: StartConditionEntry[];  // 满足全部条件时才显示；不填 = 无条件
  priority?: number;      // 解析优先级（数值越大越优先），默认 0
  nodes: Record<string, DialogueNode>;
  startNode: string;      // 起始节点 ID
}

// ============================================================
// 场景 1 对话：苏然办公室 - 林晓互动
// ============================================================
export const DIALOGUE_OFFICE_XIAO: DialogueTree = {
  id: 'dlg_office_xiao',
  scene: 'office',
  trigger: 'lin_xiao',
  startNode: 'node_01',
  nodes: {
    node_01: {
      id: 'node_01',
      lines: [
        { speaker: 'lin_xiao', text: '苏然，有新邮件。匿名来源，加密等级……很高。', emotion: 'idle' },
        { speaker: 'su_ran', text: '发件人信息呢？', emotion: 'idle' },
        { speaker: 'lin_xiao', text: '完全擦除了。但附件是一段记忆数据——损坏率87%，来自织女号空间站。', emotion: 'sad' },
        { speaker: 'su_ran', text: '……织女号？那个退役的太空站？', emotion: 'idle' },
        { speaker: 'lin_xiao', text: '报酬异常丰厚。条件是：在线修复，不备份，不外传。', emotion: 'sad' },
      ],
      choices: [
        { text: '接受委托，开始修复', next: 'node_accept', effect: 'flag:set:mission_accepted' },
        { text: '太可疑了，先调查发件人', next: 'node_investigate', effect: 'flag:set:investigate_sender' },
      ],
    },
    node_accept: {
      id: 'node_accept',
      lines: [
        { speaker: 'su_ran', text: '……接吧。损坏率87%的记忆，如果真的能修复，这个技术挑战我无法拒绝。', emotion: 'idle' },
        { speaker: 'lin_xiao', text: '了解。我正在搭建修复接口——苏然，请小心。', emotion: 'sad' },
        { speaker: 'narrator', text: '你将神经接口连接到工作台，一段破碎的记忆洪流涌入意识……' },
      ],
    },
    node_investigate: {
      id: 'node_investigate',
      lines: [
        { speaker: 'su_ran', text: '不备份、不外传——这是在封口。林晓，先查发件人。', emotion: 'angry' },
        { speaker: 'lin_xiao', text: '正在追踪……加密层太深了，但IP路由指向新深圳织星塔附近。', emotion: 'idle' },
        { speaker: 'su_ran', text: '织星科技？……有意思。好吧，修，但我会留自己的备份。', emotion: 'happy' },
        { speaker: 'lin_xiao', text: '偷偷留备份……这违反了委托条件。但我会帮你遮掩的。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// ARPES 实验室 - 主角内心独白科普
// ============================================================
export const DIALOGUE_ARPES_MONOLOGUE: DialogueTree = {
  id: 'dlg_arpes_monologue',
  scene: 'arpes',
  trigger: 'arpes_equipment',
  startNode: 'node_monologue',
  nodes: {
    node_monologue: {
      id: 'node_monologue',
      lines: [
        { speaker: 'su_ran', text: 'ARPES……角分辨光电子能谱。哎我上学的时候最怕固体物理了，但现在站在真正的设备面前，反而觉得恍惚。', emotion: 'idle' },
        { speaker: 'su_ran', text: '呃...说白了就是——用一束特定能量的光去照射材料表面，把表面电子打出来，然后测量这些电子跑出来的方向和能量。', emotion: 'sad' },
        { speaker: 'su_ran', text: '不同的方向对应材料里不同的动量，不同的能量对应不同的能级。所以一次测量就能拿到整个能带结构——就是电子在材料里能待在哪儿的地图。', emotion: 'happy' },
        { speaker: 'su_ran', text: '拓扑材料的表面态就是这样被发现的。体内是绝缘体，但表面有一层导电的金属态——ARPES恰好只探测表面几层原子，所以特别适合抓这种东西。', emotion: 'idle' },
        { speaker: 'su_ran', text: '这间实验室的配置……光源是氦灯和同步辐射两套，分析器是半球形的那种。可以做高温超导的费米面测绘。', emotion: 'idle' },
        { speaker: 'su_ran', text: '不过话说回来，织星科技为什么会在新深圳的地下藏一间ARPES实验室？他们在研究什么材料的能带？', emotion: 'sad' },
      ],
    },
  },
};

// ============================================================
// ARPES 实验室 — 样品杆交互 (event_type2: CG+对话框)
// 主角偷偷打开样品杆，发现黑色材料
// ============================================================
export const DIALOGUE_ARPES_SAMPLE_ROD: DialogueTree = {
  id: 'dlg_arpes_sample_rod',
  scene: 'arpes',
  trigger: 'sample_rod',
  eventType: 'event_type2',
  cgUrl: '/CG_Scene/sample_rod/sample_rod.png',
  startNode: 'node_sample_rod',
  nodes: {
    node_sample_rod: {
      id: 'node_sample_rod',
      lines: [
        { speaker: 'su_ran', text: '这是……样品杆？', emotion: 'idle' },
        { speaker: 'su_ran', text: '我看看能不能打开……', emotion: 'idle' },
        { speaker: 'narrator', text: '苏然小心翼翼地拧开样品杆的卡扣，金属密封的真空腔缓缓泄压，发出细微的嘶嘶声。' },
        { speaker: 'su_ran', text: '！', emotion: 'angry' },
        { speaker: 'su_ran', text: '这是什么东西……', emotion: 'sad' },
        { speaker: 'narrator', text: '样品杆的托盘上，静静地躺着一块指甲盖大小的材料。它不是金属——表面没有任何反光。它也不是碳——那种极致的黑色像是把所有光线都吞噬了。' },
        { speaker: 'su_ran', text: '完全不反光……连边缘的轮廓都模糊了。如果不是托盘有刻度线做参照，我几乎无法判断它的边界在哪里。', emotion: 'sad' },
        { speaker: 'su_ran', text: '等等，这触感——', emotion: 'idle' },
        { speaker: 'narrator', text: '苏然的指尖刚触碰到那黑色材料的瞬间，一阵微弱的电流感从指尖窜上手臂。她猛地缩回手。' },
        { speaker: 'su_ran', text: '它……是温的？不对，不是温。是它在向我的皮肤传递某种信号？', emotion: 'angry' },
        { speaker: 'su_ran', text: '织星科技在用ARPES研究这种材料……但ARPES需要超高真空环境才能打出有用的光电子谱。这种材料的表面态会是什么样的？', emotion: 'idle' },
        { speaker: 'su_ran', text: '一个连光都能吞噬的东西——它的能带结构会不会根本就不遵循费米-狄拉克统计？', emotion: 'sad' },
        { speaker: 'narrator', text: '苏然迅速合上样品杆，重新锁紧密封。她的心跳声在空旷的实验室里格外清晰。' },
      ],
    },
  },
};

// ============================================================
// Astro 实验室 — 科学家 NPC 对话（占位，等待写入）
// ============================================================
// Astro Lab — NPC 对话预留位
// NPC 已放入场景但暂无对话，开发者/LLM 可随时写入：
// 1. 创建 DialogueTree (scene='astro', trigger=NPC的dialogueTrigger)
// 2. 注册到 ALL_DIALOGUES 数组
// ============================================================

// ============================================================
// Astro 实验室 — LISA 观测台 CG 事件（主角内心独白）
// ============================================================
export const DIALOGUE_ASTRO_LISA_CG: DialogueTree = {
  id: 'dlg_astro_lisa_cg',
  scene: 'astro',
  trigger: 'lisa_cg_event',
  eventType: 'event_type2',
  cgUrl: '/CG_Scene/LISA/LISA.jpg',
  startNode: 'node_lisa_cg_start',
  nodes: {
    node_lisa_cg_start: {
      id: 'node_lisa_cg_start',
      lines: [
        { speaker: 'su_ran', text: '……好安静。', emotion: 'idle' },
        { speaker: 'su_ran', text: '站在这里，面对着这台巨大的仪器，我突然觉得自己很小。', emotion: 'sad' },
        { speaker: 'su_ran', text: '激光干涉空间天线……LISA。人类第一座太空中的引力波天文台。', emotion: 'surprise' },
        { speaker: 'su_ran', text: '它将听到的不是声音，而是时空本身的涟漪——那些由亿万光年外超大质量黑洞碰撞所激起的波动。', emotion: 'idle' },
        { speaker: 'su_ran', text: '爱因斯坦在一百年前预言了引力波的存在。他说，质量会弯曲时空，而当质量加速运动时，时空会像水面一样泛起涟漪。', emotion: 'idle' },
        { speaker: 'su_ran', text: '一百年后，LIGO 终于在地球上听到了第一声"啵"——两个黑洞合并的最后一瞬间。', emotion: 'happy' },
        { speaker: 'su_ran', text: '但那只是高频段。低频段的引力波，那些超大质量黑洞在合并前漫长舞蹈所产生的低沉嗡鸣，地球上的仪器根本听不到。', emotion: 'sad' },
        { speaker: 'su_ran', text: '因为地面太小了，振动太多，噪音太吵。要听清那些低语，人类必须飞向太空。', emotion: 'idle' },
        { speaker: 'su_ran', text: 'LISA ——三颗卫星，组成一个边长二百五十万公里的等边三角形，在太阳轨道上尾随地球飞行。', emotion: 'surprise' },
        { speaker: 'su_ran', text: '二百五十万公里……用激光连接，测量精度达到皮米级别。一兆分之一米。', emotion: 'sad' },
        { speaker: 'su_ran', text: '这已经超越了任何工程常识。他们是怎么做到的？', emotion: 'idle' },
        { speaker: 'su_ran', text: '无拖拽飞行。每颗卫星内部都有一颗自由悬浮的纯金铂合金立方体，完全隔绝一切外力，在真空中自由下落。', emotion: 'idle' },
        { speaker: 'su_ran', text: '卫星的外壳用微型推进器不断修正位置，像影子一样跟随测试质量块，永远不触碰它。', emotion: 'idle' },
        { speaker: 'su_ran', text: '只有这样，那颗立方体才能成为真正的"自由粒子"，成为引力波穿过时唯一会被推动的东西。', emotion: 'idle' },
        { speaker: 'su_ran', text: '……超越爱因斯坦计划。NASA 和 ESA 联合发起的，旨在验证广义相对论最后预言的宏大工程。', emotion: 'idle' },
        { speaker: 'su_ran', text: 'LISA 就是其中最雄心勃勃的一环。2030 年代发射，设计寿命四年，但如果一切顺利，它可以运行十年以上。', emotion: 'happy' },
        { speaker: 'su_ran', text: '十年。十年间它会听到宇宙深处无数超大质量黑洞合并的低吟，绘制出人类有史以来最宏大的星图。', emotion: 'surprise' },
        { speaker: 'su_ran', text: '那将不是一张光的地图，而是一张"时空震动"的地图。每一道涟漪，都是数十亿年前两个巨兽碰撞的回响。', emotion: 'idle' },
        { speaker: 'su_ran', text: '……而织星科技，居然在秘密参与这个项目？', emotion: 'angry' },
        { speaker: 'su_ran', text: '杜维明……你到底在找什么？', emotion: 'angry' },
        { speaker: 'su_ran', text: '是想通过引力波找到什么东西，还是——想通过它确认什么东西不存在？', emotion: 'sad' },
        { speaker: 'su_ran', text: '……算了。现在想这些也没用。先把能看到的都记下来吧。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// Astro 实验室 — 侧面研究员：LISA 引力波天线科普对话
// 情绪标注：idle(默认) / happy(轻松感兴趣) / sad(感叹沉重) / angry(警觉质疑) / surprise(震惊意外)
// ============================================================
export const DIALOGUE_ASTRO_LISA: DialogueTree = {
  id: 'dlg_astro_lisa',
  scene: 'astro',
  trigger: 'astro_scientist_side',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'su_ran', text: '……这是什么？', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '这是 LISA ——激光干涉空间天线（Laser Interferometer Space Antenna）。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '它将是人类第一座部署在太空中的引力波天文台，服务于"超越爱因斯坦"计划。', emotion: 'happy' },
        { speaker: 'su_ran', text: '引力波……你是说验证爱因斯坦广义相对论的那个？', emotion: 'surprise' },
        { speaker: 'astro_scientist_side', text: '没错。你想了解哪方面？我很乐意介绍一下。', emotion: 'happy' },
      ],
      choices: [
        { text: '背景', next: 'topic_background' },
        { text: '科学原理', next: 'topic_principle' },
        { text: '技术', next: 'topic_tech' },
        { text: '再见', next: 'exit' },
      ],
    },

    // --- 背景 ---
    topic_background: {
      id: 'topic_background',
      lines: [
        { speaker: 'astro_scientist_side', text: '"超越爱因斯坦"计划是 NASA 在 21 世纪初提出的宇宙学探索蓝图。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '它的目标很宏大：用实验直接验证爱因斯坦广义相对论的预言——尤其是引力波和黑洞。', emotion: 'happy' },
        { speaker: 'astro_scientist_side', text: '2015 年，地面探测器 LIGO 首次"听到"了引力波，人类由此打开了一扇新的天文窗口。', emotion: 'happy' },
        { speaker: 'su_ran', text: '2015年……那次发现轰动了全世界。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '是的。但地面探测器受限于地球震动噪声和臂长，只能探测高频引力波。', emotion: 'sad' },
        { speaker: 'astro_scientist_side', text: 'LISA 在太空中，臂长 250 万公里，能"听"到完全不同的低频宇宙。', emotion: 'happy' },
        { speaker: 'su_ran', text: '所以 LISA 是 LIGO 的太空升级版？', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '可以这么说。它们互补，共同覆盖完整的引力波频谱。', emotion: 'idle' },
      ],
      choices: [
        { text: '背景', next: 'topic_background' },
        { text: '科学原理', next: 'topic_principle' },
        { text: '技术', next: 'topic_tech' },
        { text: '再见', next: 'exit' },
      ],
    },

    // --- 科学原理 ---
    topic_principle: {
      id: 'topic_principle',
      lines: [
        { speaker: 'astro_scientist_side', text: '根据广义相对论，质量弯曲时空。当大质量天体加速运动时，时空本身会像水面一样泛起涟漪——这就是引力波。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '这些涟漪以光速传播。当它穿过地球时，会极其微小地拉伸和压缩一切物体——幅度比一个原子还小。', emotion: 'idle' },
        { speaker: 'su_ran', text: '比原子还小……怎么测？', emotion: 'surprise' },
        { speaker: 'astro_scientist_side', text: '靠激光干涉。LISA 由三颗卫星组成三角形编队，用激光测量彼此间的距离变化。精度达到皮米级——万亿分之一毫米。', emotion: 'happy' },
        { speaker: 'su_ran', text: '皮米级……这几乎是在测量虚无。', emotion: 'sad' },
        { speaker: 'astro_scientist_side', text: '它主要探测超大质量黑洞合并、极端质量比旋近等低频信号。这些是 LIGO 永远无法触及的。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '可以说，LISA 听到的是宇宙最深处、最古老的回响。', emotion: 'happy' },
        { speaker: 'su_ran', text: '宇宙最深处的回响……', emotion: 'sad' },
      ],
      choices: [
        { text: '背景', next: 'topic_background' },
        { text: '科学原理', next: 'topic_principle' },
        { text: '技术', next: 'topic_tech' },
        { text: '再见', next: 'exit' },
      ],
    },

    // --- 技术 ---
    topic_tech: {
      id: 'topic_tech',
      lines: [
        { speaker: 'astro_scientist_side', text: 'LISA 的核心技术挑战是"无拖拽飞行"。三颗卫星内部各有一个自由悬浮的金属测试质量块。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '卫星外壳需要持续微调姿态，用微型推进器抵消太阳光压，让质量块处于纯自由落体状态——不受任何非引力干扰。', emotion: 'idle' },
        { speaker: 'su_ran', text: '让一个物体在太空中完全自由……这听起来几乎不可能。', emotion: 'surprise' },
        { speaker: 'astro_scientist_side', text: '确实很难。但 LISA 探路者任务已经验证了可行性，精度比预期好了五倍。', emotion: 'happy' },
        { speaker: 'astro_scientist_side', text: '激光在三个航天器之间往返，形成 250 万公里的干涉臂。任何引力波信号都会体现在臂长的周期性变化中。', emotion: 'idle' },
        { speaker: 'su_ran', text: '250 万公里……在太空中维持这种精度，简直是工程奇迹。', emotion: 'surprise' },
        { speaker: 'astro_scientist_side', text: 'ESA 和 NASA 联合推进，LISA 计划在 2030 年代发射。设计寿命四年，但有望运行十年以上。', emotion: 'happy' },
        { speaker: 'su_ran', text: '十年间听到宇宙深处的低吟……真了不起。', emotion: 'sad' },
      ],
      choices: [
        { text: '背景', next: 'topic_background' },
        { text: '科学原理', next: 'topic_principle' },
        { text: '技术', next: 'topic_tech' },
        { text: '再见', next: 'exit' },
      ],
    },

    // --- 退出 ---
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '了解了，谢谢你。', emotion: 'idle' },
        { speaker: 'astro_scientist_side', text: '不客气。引力波天文学的大门才刚刚打开。', emotion: 'happy' },
        { speaker: 'su_ran', text: '（……织星科技为什么秘密参与这个项目？杜维明，你到底在找什么？）', emotion: 'angry' },
      ],
    },
  },
};

// ============================================================
// 场景 astro：研究员 — 门禁卡与《天体运行论》
// 对应 NPC_Astro_lab_2.png（astro_scientist_back）
// ============================================================
export const DIALOGUE_ASTRO_BOOK: DialogueTree = {
  id: 'dlg_astro_book',
  scene: 'astro',
  trigger: 'astro_scientist_back',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'astro_scientist', text: '……糟了。', emotion: 'sad' },
        { speaker: 'astro_scientist', text: '不好意思，能打扰你一下吗？我遇到点麻烦。', emotion: 'sad' },
        { speaker: 'su_ran', text: '怎么了？', emotion: 'idle' },
        { speaker: 'astro_scientist', text: '我把一本书忘在隔离区里了，得回去取。但我自己没有四级门禁卡，进不去。', emotion: 'sad' },
        { speaker: 'astro_scientist', text: '如果你有四级门禁卡的话……能不能帮我把书带出来？', emotion: 'idle' },
        { speaker: 'su_ran', text: '一本书？什么书这么重要？', emotion: 'idle' },
        { speaker: 'astro_scientist', text: '《De Revolutionibus Orbium Coelestium》——哥白尼写的。', emotion: 'happy' },
      ],
      choices: [
        { text: '这是什么语言？', next: 'topic_latin' },
        { text: '为什么是 Revolution？', next: 'topic_revolution' },
        { text: '好的，我帮你', next: 'exit' },
      ],
    },

    // --- 这是什么语言？ ---
    topic_latin: {
      id: 'topic_latin',
      lines: [
        { speaker: 'su_ran', text: 'Revolutionibus……这是什么语言？', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '拉丁语。早期欧洲的学术著作几乎都是用拉丁语写的，这是一直以来的学术传统。', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '包括牛顿的那一本——《Philosophiæ Naturalis Principia Mathematica》，自然哲学的数学原理。也是拉丁语。', emotion: 'happy' },
        { speaker: 'su_ran', text: '原来如此。整个欧洲的学者都用同一种语言交流……', emotion: 'happy' },
      ],
      choices: [
        { text: '这是什么语言？', next: 'topic_latin' },
        { text: '为什么是 Revolution？', next: 'topic_revolution' },
        { text: '好的，我帮你', next: 'exit' },
      ],
    },

    // --- 为什么是 Revolution？ ---
    topic_revolution: {
      id: 'topic_revolution',
      lines: [
        { speaker: 'su_ran', text: '"Revolution"——这个词现在是"革命"的意思。但书名里它是在说……运转？', emotion: 'idle' },
        { speaker: 'astro_scientist', text: '没错。Revolution 原本只是指天体的运转——环绕、旋转。', emotion: 'idle' },
        { speaker: 'astro_scientist', text: '但这本书彻底颠覆了教会和学术界对宇宙的权威理论，把地球从宇宙中心拉了下来。', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '它的冲击力太大了，从此以后"revolution"才有了如今"革命性变革"的含义。', emotion: 'happy' },
        { speaker: 'su_ran', text: '一本书改变了这个词本身的意义……', emotion: 'surprise' },
      ],
      choices: [
        { text: '这是什么语言？', next: 'topic_latin' },
        { text: '为什么是 Revolution？', next: 'topic_revolution' },
        { text: '好的，我帮你', next: 'exit' },
      ],
    },

    // --- 结束 ---
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '好，我去帮你拿。四级门禁卡……我想想办法。', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '太感谢了！书在隔离区东侧的书架上，封面是深红色皮装，很好认。', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '《天体运行论》……它值得被好好保管。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// Astro 实验室 — 还书感谢对话
// 玩家取回门禁卡后将书送回，研究员表示感谢
// ============================================================
export const DIALOGUE_ASTRO_BOOK_THANKS: DialogueTree = {
  id: 'dlg_astro_book_thanks',
  scene: 'astro',
  trigger: 'astro_scientist_back',
  condition: [{ type: 'quest_completed', target: 'quest_find_book_part1' }],
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'astro_scientist', text: '你……你真的把书带回来了！', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '太谢谢你了！没有你的话我根本拿不到它。', emotion: 'happy' },
        { speaker: 'su_ran', text: '举手之劳而已。这本书对你很重要？', emotion: 'idle' },
        { speaker: 'astro_scientist', text: '当然——这是我导师传给我的，他说这本书改变了他看宇宙的方式。', emotion: 'happy' },
        { speaker: 'astro_scientist', text: '对了，门禁卡你留着吧，后面你还会用到的。', emotion: 'idle' },
        { speaker: 'su_ran', text: '那……我就先收着了。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// VR 实验室 — VR 设备介绍 CG 事件
// 科研人员向主角解释虚拟现实回溯装置的原理和用途
// ============================================================
const DIALOGUE_VR_DEVICE_BASE: DialogueTree = {
  id: 'dlg_vr_device_cg',
  scene: 'vr',
  trigger: 'vr_device_event',
  eventType: 'event_type2',
  cgUrl: '/CG_Scene/VR_lab/VR_device_intro.png',
  startNode: 'node_vr_cg_start',
  nodes: {
    node_vr_cg_start: {
      id: 'node_vr_cg_start',
      lines: [
        { speaker: 'researcher', text: '欢迎来到 VR 回溯实验室。你面前的这台设备，是我们最引以为傲的发明——"记忆织机"。', emotion: 'happy' },
        { speaker: 'researcher', text: '它能读取特定的量子纠缠信号，将过去某个时刻的环境数据完整还原为可交互的虚拟现实场景。', emotion: 'idle' },
        { speaker: 'su_ran', text: '……虚拟现实？像游戏那样？', emotion: 'surprise' },
        { speaker: 'researcher', text: '不，远不止于此。游戏是人工构建的世界，而"记忆织机"还原的是真实发生过的事件。', emotion: 'idle' },
        { speaker: 'researcher', text: '你看到的每一束光、听到的每一声响，都是那个时刻的原貌。你不是在"玩"，而是在"亲历"。', emotion: 'idle' },
        { speaker: 'researcher', text: '我们用残存的量子信息回溯事故现场，用环境数据复原实验过程……', emotion: 'sad' },
        { speaker: 'researcher', text: '那些已经无法重来的瞬间，在这里可以反复观察、反复验证。', emotion: 'idle' },
        { speaker: 'su_ran', text: '你是说……可以回到过去？', emotion: 'surprise' },
        { speaker: 'researcher', text: '不是物理意义上的穿越。它更像是——一段极其精确的记忆重放。', emotion: 'happy' },
        { speaker: 'researcher', text: '你的意识会沉浸其中，你可以走动、可以触碰、可以近距离观察那些当时被忽略的细节。', emotion: 'idle' },
        { speaker: 'researcher', text: '但记住，你不能改变任何已经发生的事。你只是一个旁观者。', emotion: 'sad' },
        { speaker: 'su_ran', text: '……所以这个设备目前用在哪些方面？', emotion: 'idle' },
        { speaker: 'researcher', text: '科研探索。我们用它复现了数十次失败的材料实验，找到了之前从未注意到的中间态。', emotion: 'idle' },
        { speaker: 'researcher', text: '也用它回溯了实验室事故，确认了事故的真正原因，为后续的安全改进提供了关键线索。', emotion: 'sad' },
        { speaker: 'researcher', text: '目前，记忆织机开放了两条体验链路。一条通往我们已经完成的世界；另一条会从你的问题出发，现场编织一个新世界。', emotion: 'happy' },
      ],
      next: 'node_vr_choose_experience',
    },
    node_vr_choose_experience: {
      id: 'node_vr_choose_experience',
      lines: [
        {
          speaker: 'researcher',
          text: '你想先体验哪一条链路？',
          emotion: 'idle',
        },
      ],
      choices: [
        { text: '体验现有世界', next: 'node_vr_enter' },
        { text: '世界编织', next: 'p2_intro' },
        { text: '暂时离开', next: 'node_vr_decline' },
      ],
    },
    node_vr_enter: {
      id: 'node_vr_enter',
      lines: [
        { speaker: 'researcher', text: '好。闭上眼睛，深呼吸。', emotion: 'happy' },
        { speaker: 'researcher', text: '当你再次睁开眼时，你会身处一段真实的过去。', emotion: 'idle' },
        { speaker: 'su_ran', text: '……（舱门缓缓关闭，冰凉的液体没过身体。）', emotion: 'surprise' },
        { speaker: 'su_ran', text: '……（一切归于寂静，然后——光。）', emotion: 'surprise' },
      ],
      choices: [
        { text: '睁开眼睛', next: '__enter_solvay__' },
      ],
    },
    node_vr_decline: {
      id: 'node_vr_decline',
      lines: [
        { speaker: 'researcher', text: '没关系。这个决定确实需要时间消化。', emotion: 'idle' },
        { speaker: 'researcher', text: '设备会一直在这里。当你准备好了，随时可以来找我。', emotion: 'happy' },
        { speaker: 'su_ran', text: '……谢谢。我需要先消化一下今天看到的一切。', emotion: 'sad' },
      ],
    },
  },
};

// ============================================================
// VR 实验室 — VR 设备中的项目二“世界编织”分支
// 只负责确定性选择与显式启动；最终与设备基础节点合并为唯一入口。
// ============================================================
const PROJECT_TWO_THEME_IDS: readonly ProjectTwoThemeId[] = [
  'observation-reality',
  'memory-identity',
  'energy-civilization',
];
const PROJECT_TWO_ROLE_IDS: readonly ProjectTwoRoleId[] = [
  'witness',
  'calibrator',
  'participant',
];
const PROJECT_TWO_THEME_SLUGS: Record<ProjectTwoThemeId, string> = {
  'observation-reality': 'observation',
  'memory-identity': 'memory',
  'energy-civilization': 'energy',
};
const PROJECT_TWO_ROLE_NODE_IDS: Record<ProjectTwoThemeId, string> = {
  'observation-reality': 'p2_role_observation',
  'memory-identity': 'p2_role_memory',
  'energy-civilization': 'p2_role_energy',
};
const PROJECT_TWO_ROLE_CHOICE_TEXT: Record<ProjectTwoRoleId, string> = {
  witness: '我以旁证者进入：记录证据，尽量不改变事件。',
  calibrator: '我以校准员进入：修复异常，并承担干预的后果。',
  participant: '我以当事人进入：卷入冲突，让自己也成为谜题。',
};

function projectTwoNodeId(
  kind: 'confirm' | 'modify',
  themeId: ProjectTwoThemeId,
  roleId: ProjectTwoRoleId,
): string {
  return `p2_${kind}_${PROJECT_TWO_THEME_SLUGS[themeId]}_${roleId}`;
}

function projectTwoRoleChoices(
  themeId: ProjectTwoThemeId,
): DialogueChoice[] {
  return PROJECT_TWO_ROLE_IDS.map(roleId => ({
    text: PROJECT_TWO_ROLE_CHOICE_TEXT[roleId],
    next: projectTwoNodeId('confirm', themeId, roleId),
  }));
}

function buildProjectTwoCombinationNodes(): Record<string, DialogueNode> {
  const nodes: Record<string, DialogueNode> = {};
  for (const themeId of PROJECT_TWO_THEME_IDS) {
    for (const roleId of PROJECT_TWO_ROLE_IDS) {
      const selection: ProjectTwoSelection = {
        schemaVersion: 1,
        themeId,
        roleId,
      };
      const brief = getProjectTwoCanonicalBrief(selection);
      if (!brief) {
        throw new Error(`PROJECT_TWO_BRIEF_MISSING:${themeId}:${roleId}`);
      }
      const confirmId = projectTwoNodeId('confirm', themeId, roleId);
      const modifyId = projectTwoNodeId('modify', themeId, roleId);
      nodes[confirmId] = {
        id: confirmId,
        lines: [
          {
            speaker: 'researcher',
            text: '坐标已经成形。我把你的选择收束成了这份简报。',
            emotion: 'happy',
          },
          { speaker: 'researcher', text: brief, emotion: 'idle' },
          {
            speaker: 'researcher',
            text: '它不是既定剧情，只是生成时必须守住的起点。QuillForge 会据此扩展人物、地点与事件；沉浸舱会先呈现世界书摘要，等你审阅后再决定是否进入。',
            emotion: 'idle',
          },
        ],
        choices: [
          {
            text: '确认这份简报，接入项目二。',
            next: 'p2_after_launch',
            actions: [
              {
                type: 'launch_vr_experience',
                experienceId: 'quillforge-webui',
                projectTwo: selection,
              },
            ],
          },
          { text: '我想修改刚才的选择。', next: modifyId },
          { text: '这次先不参加。', next: 'p2_decline' },
        ],
      };
      nodes[modifyId] = {
        id: modifyId,
        lines: [
          {
            speaker: 'researcher',
            text: '可以。世界还没有启动，现在改动坐标不会丢失任何东西。',
            emotion: 'idle',
          },
        ],
        choices: [
          { text: '重新选择这个世界的问题。', next: 'p2_theme' },
          {
            text: '保留母题，只调整我的身份。',
            next: PROJECT_TWO_ROLE_NODE_IDS[themeId],
          },
          { text: '不用修改，返回刚才的简报。', next: confirmId },
        ],
      };
    }
  }
  return nodes;
}

const DIALOGUE_VR_PROJECT_TWO_BRANCH: DialogueTree = {
  id: 'dlg_vr_device_project_two_branch',
  scene: 'vr',
  trigger: 'vr_device_event',
  startNode: 'p2_intro',
  nodes: {
    p2_intro: {
      id: 'p2_intro',
      lines: [
        {
          speaker: 'researcher',
          text: '索尔维会议是我们已经完成的历史体验。人物、争论和科学细节都经过人工考据与逐段打磨，它的边界来自已经发生过的历史。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '世界编织连接的是仍在成长的项目二。你给出一个科学问题和进入世界的身份，我把它们整理成简报，再交给 QuillForge 尝试生成世界书与互动故事。',
          emotion: 'happy',
        },
        {
          speaker: 'researcher',
          text: '生成结果可能存在差异。所以新世界不会直接把你卷进去：沉浸舱会先呈现世界书摘要，审阅之后，再由你决定是否开始游戏。',
          emotion: 'idle',
        },
      ],
      choices: [
        { text: '好，先从这个世界的问题开始。', next: 'p2_theme' },
        {
          text: '再说明一下两种体验的区别。',
          next: 'p2_difference',
        },
        { text: '返回装置选择。', next: 'node_vr_choose_experience' },
      ],
    },
    p2_difference: {
      id: 'p2_difference',
      lines: [
        {
          speaker: 'researcher',
          text: '项目一回答的是：怎样更接近一段真实历史。因此人物、事件和观点都必须服从史料边界。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '项目二追问的是：能不能从一个科学问题出发，生成一个规则自洽、可以亲身体验的世界。它允许想象，也必须承认生成中的不确定性。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '前者是我们精心完成的历史体验，后者是仍在成长的世界原型实验。它们彼此独立，也不互相替代。',
          emotion: 'happy',
        },
      ],
      choices: [
        { text: '好，先从这个世界的问题开始。', next: 'p2_theme' },
        { text: '返回装置选择。', next: 'node_vr_choose_experience' },
      ],
    },
    p2_theme: {
      id: 'p2_theme',
      lines: [
        {
          speaker: 'researcher',
          text: '那就先确定这个世界的张力源。不是景观或年代，而是所有人物最终都绕不开的问题。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '你希望它追问什么？',
          emotion: 'happy',
        },
      ],
      choices: [
        {
          text: '我想追问观测与真实：观察会不会改变真相？',
          next: 'p2_role_observation',
        },
        {
          text: '我想追问记忆与身份：改写记忆，还是原来的我吗？',
          next: 'p2_role_memory',
        },
        {
          text: '我想追问能量与文明：有限能源该换取谁的未来？',
          next: 'p2_role_energy',
        },
      ],
    },
    p2_role_observation: {
      id: 'p2_role_observation',
      lines: [
        {
          speaker: 'researcher',
          text: '在这个世界里，“看见”不再只是记录，它本身也可能成为事件的一部分。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '接下来决定你站在哪里。位置不同，世界向你开放的证据也会不同。',
          emotion: 'happy',
        },
      ],
      choices: projectTwoRoleChoices('observation-reality'),
    },
    p2_role_memory: {
      id: 'p2_role_memory',
      lines: [
        {
          speaker: 'researcher',
          text: '当记忆可以复制、删改和重放，身份就不再是默认答案。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '接下来决定你站在哪里。位置不同，世界向你开放的证据也会不同。',
          emotion: 'happy',
        },
      ],
      choices: projectTwoRoleChoices('memory-identity'),
    },
    p2_role_energy: {
      id: 'p2_role_energy',
      lines: [
        {
          speaker: 'researcher',
          text: '只要资源有限，每一种未来都会占用另一种未来的代价。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '接下来决定你站在哪里。位置不同，世界向你开放的证据也会不同。',
          emotion: 'happy',
        },
      ],
      choices: projectTwoRoleChoices('energy-civilization'),
    },
    ...buildProjectTwoCombinationNodes(),
    p2_after_launch: {
      id: 'p2_after_launch',
      lines: [
        {
          speaker: 'researcher',
          text: '项目二已经接入沉浸舱。世界书是否生成完成、是否进入故事，都以舱内实际显示为准。',
          emotion: 'idle',
        },
      ],
    },
    p2_decline: {
      id: 'p2_decline',
      lines: [
        {
          speaker: 'researcher',
          text: '当然。装置不会替你作决定。等你有一个真正想追问的问题，再回来。',
          emotion: 'idle',
        },
        {
          speaker: 'researcher',
          text: '索尔维会议体验仍按原来的方式开放。',
          emotion: 'happy',
        },
      ],
    },
  },
};

export const DIALOGUE_VR_DEVICE_CG: DialogueTree = {
  ...DIALOGUE_VR_DEVICE_BASE,
  nodes: {
    ...DIALOGUE_VR_DEVICE_BASE.nodes,
    ...DIALOGUE_VR_PROJECT_TWO_BRANCH.nodes,
  },
};

// ============================================================
// 1927 索尔维会议 — 爱因斯坦
// ============================================================
export const DIALOGUE_SOLVAY_EINSTEIN: DialogueTree = {
  id: 'dlg_solvay_einstein',
  scene: 'solvay',
  trigger: 'solvay_einstein',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_einstein', text: '哦？一张新面孔。我想你不是我们物理学界的常客吧。', emotion: 'happy' },
        { speaker: 'su_ran', text: '我只是……来旁听的。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '旁听是好事情。好奇心比知识本身更重要——想象力比知识更重要。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '知识是有限的，它告诉我们世界是什么样的。但想象力围绕着整个世界，告诉我们世界可以是什么样的。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '这些天大家都在谈论量子力学。索尔维先生的会议总能把最有趣的问题摆到桌面上。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '你想聊些什么？', emotion: 'happy' },
      ],
      choices: [
        { text: '相对论', next: 'topic_relativity' },
        { text: '量子力学的争论', next: 'topic_quantum' },
        { text: '统一场论', next: 'topic_unified' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_relativity: {
      id: 'topic_relativity',
      lines: [
        { speaker: 'su_ran', text: '相对论……1905年的狭义相对论，和1915年的广义相对论。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '没错。狭义相对论说的是：物理定律对所有惯性参考系都相同，光速不变。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '由此可以推出时间膨胀、长度收缩、质能等价——E=mc²。', emotion: 'happy' },
        { speaker: 'su_ran', text: 'E=mc²……质量和能量是同一事物的两面。', emotion: 'surprise' },
        { speaker: 'solvay_einstein', text: '是的。一点点质量中蕴含着巨大的能量。只是我们当时还不知道如何释放它——也许永远不应该知道。', emotion: 'sad' },
        { speaker: 'solvay_einstein', text: '广义相对论更进一步：引力不是力，而是时空的弯曲。物质告诉时空如何弯曲，时空告诉物质如何运动。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '1919年的日全食观测验证了星光在太阳附近的偏折——爱丁顿的远征。那是我最紧张的时刻。', emotion: 'sad' },
        { speaker: 'solvay_einstein', text: '结果与预言吻合。那天的报纸标题写的是"科学革命：宇宙新理论，牛顿思想被推翻"。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '其实牛顿没有被推翻，只是被推广了。他的理论在低速弱场下依然完美——这就是好理论的标志：它包含了它的前任。', emotion: 'idle' },
      ],
      choices: [
        { text: '相对论', next: 'topic_relativity' },
        { text: '量子力学的争论', next: 'topic_quantum' },
        { text: '统一场论', next: 'topic_unified' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_quantum: {
      id: 'topic_quantum',
      lines: [
        { speaker: 'su_ran', text: '听说您对量子力学的一些解释有不同看法？', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '（叹气）我没有否定量子力学本身的成就。光电效应——那是我自己用光量子假说解释的。', emotion: 'sad' },
        { speaker: 'solvay_einstein', text: '1905年，我用普朗克的量子概念解释了为什么只有特定频率的光才能打出电子。这是量子最早的实验证据之一。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '但我无法接受玻尔他们说的"互补原理"——一个粒子在被观测之前没有确定的状态？', emotion: 'angry' },
        { speaker: 'solvay_einstein', text: '我仍然相信，物理实在应该具有独立于观测的确定性。上帝不掷骰子。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '我们不应该用"观测"来定义存在。月亮在你不看它的时候依然在那里——不是吗？', emotion: 'happy' },
        { speaker: 'su_ran', text: '玻尔怎么说？', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '（微笑）他总是耐心地反驳我。我们在这个问题上争论了很多年。但请别误会——这是科学中最深刻的友谊。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '他的反对迫使我不断深入。一个好的对手比一百个附和者更有价值。', emotion: 'idle' },
      ],
      choices: [
        { text: '相对论', next: 'topic_relativity' },
        { text: '量子力学的争论', next: 'topic_quantum' },
        { text: '统一场论', next: 'topic_unified' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_unified: {
      id: 'topic_unified',
      lines: [
        { speaker: 'su_ran', text: '您接下来在研究什么？', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '统一场论。我想把引力和电磁力纳入同一个框架——就像麦克斯韦统一电和磁那样。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '广义相对论用几何描述了引力。也许电磁力也不过是时空几何的一部分。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '卡鲁扎在1919年提出了一个天才的想法：如果时空有五维——多出一个卷曲的维度——电磁力就能自然地涌现出来。', emotion: 'idle' },
        { speaker: 'su_ran', text: '这听起来极其困难。', emotion: 'surprise' },
        { speaker: 'solvay_einstein', text: '当然困难。也许我这辈子也完成不了。但如果不去尝试，那就永远不会知道答案。', emotion: 'sad' },
        { speaker: 'solvay_einstein', text: '探索未知本身就是值得的。哪怕最终证明这条路走不通。', emotion: 'idle' },
        { speaker: 'solvay_einstein', text: '况且，在这条路上你会遇到意想不到的风景。科学最伟大的发现，往往来自走错路的时候。', emotion: 'happy' },
      ],
      choices: [
        { text: '相对论', next: 'topic_relativity' },
        { text: '量子力学的争论', next: 'topic_quantum' },
        { text: '统一场论', next: 'topic_unified' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您，爱因斯坦先生。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '叫我阿尔伯特就好。记住——重要的是不要停止提问。', emotion: 'happy' },
        { speaker: 'solvay_einstein', text: '好奇心有它存在的理由。当你凝视永恒的神秘时，它会让你感到敬畏。这种体验与真正的艺术和科学同源。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 玻尔
// ============================================================
export const DIALOGUE_SOLVAY_BOHR: DialogueTree = {
  id: 'dlg_solvay_bohr',
  scene: 'solvay',
  trigger: 'solvay_bohr',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_bohr', text: '欢迎，朋友。你看起来对物理学充满了好奇。', emotion: 'idle' },
        { speaker: 'su_ran', text: '是的，尤其是……关于量子的世界。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '量子的世界是一个充满矛盾和互补的世界。它需要全新的思维方式。', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '在这里，你熟悉的一切——因果律、确定性、连续性——都会被重新审视。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '但请不要害怕。困惑是理解的开始。只有当你真正感到困惑的时候，你才在接近真相。', emotion: 'happy' },
      ],
      choices: [
        { text: '原子模型', next: 'topic_atom' },
        { text: '互补原理', next: 'topic_complementarity' },
        { text: '与爱因斯坦的论战', next: 'topic_debate' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_atom: {
      id: 'topic_atom',
      lines: [
        { speaker: 'su_ran', text: '您的原子模型……电子在分立的轨道上运行？', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '是的。1913年，我把卢瑟福的原子核模型和普朗克的量子假说结合起来。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '电子只能在特定的轨道上运行，不辐射能量。只有跃迁时才吸收或发射光子。', emotion: 'happy' },
        { speaker: 'su_ran', text: '这完全打破了经典电磁学的预期。', emotion: 'surprise' },
        { speaker: 'solvay_bohr', text: '在原子尺度上，经典物理学确实失效了。我们需要新的规则。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '光谱线——巴尔末系列、莱曼系列——完美验证了这个模型。每种元素都有独特的光谱指纹。', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '后来弗兰克和赫兹用电子轰击汞原子，直接证明了能级的存在。他们因此获得了诺贝尔奖。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '当然，我的模型只是第一步。真正的量子力学——海森堡和薛定谔的工作——才是完整的故事。', emotion: 'sad' },
      ],
      choices: [
        { text: '原子模型', next: 'topic_atom' },
        { text: '互补原理', next: 'topic_complementarity' },
        { text: '与爱因斯坦的论战', next: 'topic_debate' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_complementarity: {
      id: 'topic_complementarity',
      lines: [
        { speaker: 'su_ran', text: '互补原理是什么意思？', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '简单说：波和粒子不是对立的，而是同一现象的互补描述。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '你设计实验观察波动性，就看不到粒子性；反过来也一样。', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '完整的图景需要两种描述的结合——但它们永远无法同时被观察到。', emotion: 'idle' },
        { speaker: 'su_ran', text: '所以这不是我们的仪器不够好，而是自然界的本质？', emotion: 'surprise' },
        { speaker: 'solvay_bohr', text: '正是如此。这不是技术的局限，是物理实在的基本特征。', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '我有时会把它和东方哲学做类比——阴和阳，看似对立，实则互补。不同的视角看到不同的面，但真相是整体。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '我们用经典概念——波、粒子、位置、动量——来描述量子世界。但这些概念本身是互斥的。这就是困境的核心。', emotion: 'sad' },
      ],
      choices: [
        { text: '原子模型', next: 'topic_atom' },
        { text: '互补原理', next: 'topic_complementarity' },
        { text: '与爱因斯坦的论战', next: 'topic_debate' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_debate: {
      id: 'topic_debate',
      lines: [
        { speaker: 'su_ran', text: '您和爱因斯坦先生的争论……', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '（微笑）阿尔伯特坚持认为物理实在应该是确定的、可预测的。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '他说"上帝不掷骰子"。我回答说："阿尔伯特，别告诉上帝该怎么做。"', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '他每次提出一个思想实验——比如光子盒——我都会彻夜思考如何回应。', emotion: 'sad' },
        { speaker: 'su_ran', text: '这争论有结论吗？', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '科学从来不是靠权威定论的。我们用思想实验互相挑战，推动彼此深入思考。', emotion: 'idle' },
        { speaker: 'solvay_bohr', text: '阿尔伯特提出了许多深刻的质疑。正是因为他的反对，我们的理解才更加严密。', emotion: 'sad' },
        { speaker: 'solvay_bohr', text: '一个没有质疑的理论是不健康的。真正的知识，是在不断的质疑和修正中生长出来的。', emotion: 'happy' },
      ],
      choices: [
        { text: '原子模型', next: 'topic_atom' },
        { text: '互补原理', next: 'topic_complementarity' },
        { text: '与爱因斯坦的论战', next: 'topic_debate' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您的耐心解释，玻尔先生。', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '不要试图一次理解一切。量子世界的智慧，需要时间去消化。', emotion: 'happy' },
        { speaker: 'solvay_bohr', text: '保持开放的心态。真相往往比我们最初的想象更加微妙。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 居里夫人
// ============================================================
export const DIALOGUE_SOLVAY_CURIE: DialogueTree = {
  id: 'dlg_solvay_curie',
  scene: 'solvay',
  trigger: 'solvay_curie',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_curie', text: '你来了。坐吧。这届索尔维会议比你想象的要激烈得多。', emotion: 'idle' },
        { speaker: 'su_ran', text: '居里夫人……很荣幸见到您。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '不必拘谨。在这里，每个人都只是追寻真理的旅人。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '这已经是我参加的第五届索尔维会议了。每一次，物理学都翻天覆地。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '1911年第一届的时候，我们还在讨论辐射理论。现在——量子力学、波动力学、测不准关系……世界变得太快了。', emotion: 'idle' },
      ],
      choices: [
        { text: '放射性研究', next: 'topic_radioactivity' },
        { text: '科学精神', next: 'topic_spirit' },
        { text: '对年轻科学家的建议', next: 'topic_advice' },
        { text: '女性与科研', next: 'topic_women' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_radioactivity: {
      id: 'topic_radioactivity',
      lines: [
        { speaker: 'su_ran', text: '您发现钋和镭的时候，条件一定很艰苦吧？', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '那是在巴黎一间漏雨的棚屋里。我和皮埃尔——我已故的丈夫——用成吨的沥青铀矿提取出极微量的镭。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '四年。整整四年，才分离出0.1克纯氯化镭。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '夏天棚子里闷热得透不过气，冬天水会结冰。我们 stirred 沸腾的沥青锅，手上全是烧伤。', emotion: 'sad' },
        { speaker: 'su_ran', text: '只是为了证明一种新元素的存在……', emotion: 'surprise' },
        { speaker: 'solvay_curie', text: '科学就是这样。你不知道终点有什么，但你知道必须走下去。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '放射性现象证明原子不是不可分割的——它在衰变，在释放能量。这改变了人类对物质的基本认识。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '贝克勒尔最先发现了铀的放射性。我系统地研究了其他元素，发现钍也有放射性。然后找到了钋和镭。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '卢瑟福和索迪后来提出了衰变理论——原子在自发地转变为另一种原子。这在当时几乎是不可想象的概念。', emotion: 'happy' },
      ],
      choices: [
        { text: '放射性研究', next: 'topic_radioactivity' },
        { text: '科学精神', next: 'topic_spirit' },
        { text: '对年轻科学家的建议', next: 'topic_advice' },
        { text: '女性与科研', next: 'topic_women' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_spirit: {
      id: 'topic_spirit',
      lines: [
        { speaker: 'su_ran', text: '是什么支撑您走过那些困难？', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '我没有把注意力放在困难上。我只看到要做的事情。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '生活中没有什么可怕的事情，只有需要被理解的事情。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '这正是科学教给我的：面对未知，不要退缩，而要观察、思考、理解。', emotion: 'idle' },
        { speaker: 'su_ran', text: '这句话很有力量。', emotion: 'surprise' },
        { speaker: 'solvay_curie', text: '我不知道。我只知道，如果你害怕，你永远无法看清真相。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '包括辐射本身。我们当年并不完全了解它的危害。但了解它，比逃避它更重要。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '皮埃尔和我都因为长期暴露在辐射中而健康受损。这是代价。但如果重来一次，我依然会做同样的选择。', emotion: 'sad' },
      ],
      choices: [
        { text: '放射性研究', next: 'topic_radioactivity' },
        { text: '科学精神', next: 'topic_spirit' },
        { text: '对年轻科学家的建议', next: 'topic_advice' },
        { text: '女性与科研', next: 'topic_women' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_advice: {
      id: 'topic_advice',
      lines: [
        { speaker: 'su_ran', text: '您对新一代科学家有什么建议？', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '不要追求名利。追求理解。名声是副产品，不是目标。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '我没有为镭的提取工艺申请专利。有朋友劝我这样做——那会带来一大笔财富。但科学属于全人类。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '其次，要承认自己的无知。世界上最危险的事情，是以为自己已经知道了答案。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '我在这个会场里看到太多聪明人——但最聪明的人，往往是那些愿意承认"我不确定"的人。', emotion: 'idle' },
        { speaker: 'su_ran', text: '包括爱因斯坦和玻尔的争论？', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '正是。他们都不确定。这正是科学最美的地方。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '我的女儿伊雷娜也在这条路上走着。她和弗里德里克·约里奥正在研究辐射。看到年轻一代接力，这是最让我欣慰的事。', emotion: 'happy' },
      ],
      choices: [
        { text: '放射性研究', next: 'topic_radioactivity' },
        { text: '科学精神', next: 'topic_spirit' },
        { text: '对年轻科学家的建议', next: 'topic_advice' },
        { text: '女性与科研', next: 'topic_women' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_women: {
      id: 'topic_women',
      lines: [
        { speaker: 'su_ran', text: '居里夫人，作为一名女性科研工作者……这条路一定比常人更难走吧？', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '你问了一个很少有人在正式场合提起的问题。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '我从华沙来到巴黎求学，是因为波兰的大学不接受女性。即使在巴黎，我最初也只能坐在教室的角落里旁听。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '毕业时我成绩第一，但没有实验室愿意接收我。最后是皮埃尔给了我一个位置——先是一个工作台，后来是他的姓氏。', emotion: 'idle' },
        { speaker: 'su_ran', text: '所以您的第一篇论文署名是"居里夫人"，而不是您的本名？', emotion: 'surprise' },
        { speaker: 'solvay_curie', text: '那时候，一个女人的名字出现在学术论文上是不可想象的。如果不是皮埃尔的坚持，法国科学院甚至不会考虑我的发现。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '1903年诺贝尔奖——最初提名里只有皮埃尔和贝克勒尔。是皮埃尔写信给委员会，坚持把我的名字加进去。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '即便如此，委员会在授奖词里也只是说"在贝克勒尔先生的工作之后予以协助"。协助。', emotion: 'sad' },
        { speaker: 'su_ran', text: '但您用第二次诺贝尔奖证明了自己。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '1911年，化学奖，单独获奖。那一年，法国科学院还是以一票之差拒绝了我的院士申请——因为我是女人。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '一个获得了两次诺贝尔奖的人，被自己国家的科学院拒之门外。这件事本身比任何论文都更能说明问题。', emotion: 'idle' },
        { speaker: 'solvay_curie', text: '我看到你也是一个女孩。你看，时间过去了这么多年，但偏见并没有消失——它只是换了更隐蔽的形式。', emotion: 'sad' },
        { speaker: 'solvay_curie', text: '我的建议是：不要等待别人给你座位。如果你足够优秀，就自己去争取那个位置。不要因为别人的质疑而怀疑自己的价值。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '皮埃尔从来没有把我当作"他的助手"。他把我当作平等的伙伴。找一个真正尊重你才华的人——不管是合作者还是伴侣——这比什么都重要。', emotion: 'idle' },
        { speaker: 'su_ran', text: '谢谢您……这些话对我来说意义重大。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '去走你的路吧。我期待有一天，没有人会再说"女科学家"——只会说"科学家"。', emotion: 'happy' },
      ],
      choices: [
        { text: '放射性研究', next: 'topic_radioactivity' },
        { text: '科学精神', next: 'topic_spirit' },
        { text: '对年轻科学家的建议', next: 'topic_advice' },
        { text: '女性与科研', next: 'topic_women' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您，居里夫人。您的话让我受益匪浅。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '去探索吧。科学属于每一个有好奇心的人。', emotion: 'happy' },
        { speaker: 'solvay_curie', text: '记住——我们从未真正拥有过真理，我们只是在无限地接近它。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 海森堡
// ============================================================
export const DIALOGUE_SOLVAY_HEISENBERG: DialogueTree = {
  id: 'dlg_solvay_heisenberg',
  scene: 'solvay',
  trigger: 'solvay_heisenberg',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_heisenberg', text: '你好！你是来听报告的吗？这次会议讨论的可是物理学最前沿的东西。', emotion: 'happy' },
        { speaker: 'su_ran', text: '是的。听说您在做很开创性的工作。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '可以这么说。我和玻恩、约尔当一起发展了矩阵力学——一种全新的描述原子世界的方法。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '我才二十六岁，能站在这里和爱因斯坦、玻尔这些人讨论，真是做梦都没想到。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '不过话说回来，物理学现在正处于一个前所未有的激动人心的时刻——旧框架在崩塌，新框架正在建立。', emotion: 'idle' },
      ],
      choices: [
        { text: '矩阵力学', next: 'topic_matrix' },
        { text: '不确定性原理', next: 'topic_uncertainty' },
        { text: '对经典物理的看法', next: 'topic_classical' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_matrix: {
      id: 'topic_matrix',
      lines: [
        { speaker: 'su_ran', text: '矩阵力学……我听说它和传统的物理完全不同。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '是的。传统物理描述的是轨道、轨迹——电子从这里飞到那里。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '但问题是：我们从来无法直接观测到电子的轨道。我们只能观测到光谱线的频率和强度。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '所以我决定：只使用可观测的量。放弃轨道的概念，用矩阵——一种数学对象——来描述物理量。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '这个想法是我在黑尔戈兰岛上养花粉症时想到的。一个人在那座荒凉的小岛上，突然之间一切都清晰了。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '凌晨三点，我算出了能量矩阵的对角化——结果和实验数据完全吻合。我激动得睡不着觉。', emotion: 'happy' },
        { speaker: 'su_ran', text: '完全放弃轨道？这太大胆了。', emotion: 'surprise' },
        { speaker: 'solvay_heisenberg', text: '科学进步有时候需要勇气。如果旧的框架无法解释新的现象，就必须建立新的框架。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '当然，玻恩后来告诉我，我用的那些数表其实是数学家们早就研究过的"矩阵"。我当时连矩阵乘法都不会。', emotion: 'sad' },
      ],
      choices: [
        { text: '矩阵力学', next: 'topic_matrix' },
        { text: '不确定性原理', next: 'topic_uncertainty' },
        { text: '对经典物理的看法', next: 'topic_classical' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_uncertainty: {
      id: 'topic_uncertainty',
      lines: [
        { speaker: 'su_ran', text: '不确定性原理是怎么回事？', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '我正在完善这个想法。简单说：你不可能同时精确知道一个粒子的位置和动量。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '位置测量得越精确，动量就越模糊。反之亦然。这不是技术限制——这是自然界的根本法则。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: 'Δx·Δp ≥ ℏ/2。这个不等式是我在今年早些时候推导出来的。', emotion: 'idle' },
        { speaker: 'su_ran', text: '自然界在本质上就是不确定的？', emotion: 'surprise' },
        { speaker: 'solvay_heisenberg', text: '我认为是的。因果律在量子层面需要被重新理解。我们无法预测单个事件，只能预测概率。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '爱因斯坦对此很不满。但科学不是民主投票——它最终取决于实验和逻辑。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '如果你想观测一个电子的位置，至少要用一个光子去"看"它。但光子会撞击电子，改变它的动量。看即扰。', emotion: 'idle' },
      ],
      choices: [
        { text: '矩阵力学', next: 'topic_matrix' },
        { text: '不确定性原理', next: 'topic_uncertainty' },
        { text: '对经典物理的看法', next: 'topic_classical' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_classical: {
      id: 'topic_classical',
      lines: [
        { speaker: 'su_ran', text: '经典物理已经过时了吗？', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '不。经典物理——牛顿力学、麦克斯韦电磁学——在宏观世界依然完美有效。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '但当我们深入到原子尺度，它的语言就不够用了。我们需要一套新的词汇。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '量子力学不是否定经典物理，而是包含了它。当普朗克常数可以忽略时，量子力学就回归经典。', emotion: 'idle' },
        { speaker: 'solvay_heisenberg', text: '这就是对应原理——玻尔最先提出的。旧理论是新理论在特定条件下的近似。', emotion: 'idle' },
        { speaker: 'su_ran', text: '就像相对论在低速下回归牛顿力学。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '正是如此！你在物理直觉上很不错。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '物理学的发展就像剥洋葱——每一层都更深入，但外面那层并没有错，只是不够完整。', emotion: 'idle' },
      ],
      choices: [
        { text: '矩阵力学', next: 'topic_matrix' },
        { text: '不确定性原理', next: 'topic_uncertainty' },
        { text: '对经典物理的看法', next: 'topic_classical' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢你，海森堡先生。你的思路太清晰了。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '保持这种好奇心。物理学的黄金时代才刚刚开始。', emotion: 'happy' },
        { speaker: 'solvay_heisenberg', text: '我有一种感觉——未来几十年，量子力学会彻底改变我们对世界的理解。你赶上了最好的时代。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 薛定谔
// ============================================================
export const DIALOGUE_SOLVAY_SCHRODINGER: DialogueTree = {
  id: 'dlg_solvay_schrodinger',
  scene: 'solvay',
  trigger: 'solvay_schrodinger',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_schrodinger', text: '啊，一个新朋友。这届会议比我想象的还要热闹。', emotion: 'happy' },
        { speaker: 'su_ran', text: '薛定谔先生，您的波动方程……', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '你是说那个让我在阿尔卑斯山度假时灵光一现的方程？是的，那是1926年的事。', emotion: 'happy' },
        { speaker: 'solvay_schrodinger', text: '我当时住在阿罗萨的一间小木屋里。远离了维也纳的喧嚣，山间的空气让头脑格外清澈。', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '说实话，那个方程的美让我着迷——一个简洁的偏微分方程，却包含了整个原子世界的秘密。', emotion: 'happy' },
      ],
      choices: [
        { text: '波动方程', next: 'topic_wave' },
        { text: '与矩阵力学的关系', next: 'topic_matrix_rel' },
        { text: '对概率诠释的看法', next: 'topic_probability' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_wave: {
      id: 'topic_wave',
      lines: [
        { speaker: 'su_ran', text: '波动方程是怎么想出来的？', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '德布罗意的物质波假说启发了我。如果电子是波，它就应该满足一个波动方程。', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '我从哈密顿的经典力学类比出发，写出了那个方程——现在被称为薛定谔方程。', emotion: 'happy' },
        { speaker: 'solvay_schrodinger', text: '它自然地给出了氢原子的能级，和玻尔模型的预言完全一致，但不需要那些人为的假设。', emotion: 'happy' },
        { speaker: 'solvay_schrodinger', text: '1926年那半年里，我连续发表了四篇论文。一个接一个，解决了振子、转子、氢原子的问题。', emotion: 'idle' },
        { speaker: 'su_ran', text: '一个方程就能解释原子结构……', emotion: 'surprise' },
        { speaker: 'solvay_schrodinger', text: '数学的美总是指引着我们。好方程的特征是：它简洁、优美，且与自然一致。', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '相比之下，海森堡那些矩阵——没有图像、没有连续性——说实话，我最初觉得那不过是丑陋的数学游戏。', emotion: 'sad' },
      ],
      choices: [
        { text: '波动方程', next: 'topic_wave' },
        { text: '与矩阵力学的关系', next: 'topic_matrix_rel' },
        { text: '对概率诠释的看法', next: 'topic_probability' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_matrix_rel: {
      id: 'topic_matrix_rel',
      lines: [
        { speaker: 'su_ran', text: '您的波动方程和海森堡的矩阵力学是什么关系？', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '起初我对矩阵力学很排斥。那些不可交换的矩阵、没有直观图像的数学，让我很不舒服。', emotion: 'sad' },
        { speaker: 'solvay_schrodinger', text: '但后来薛定谔自己——也就是我——证明了两者在数学上是完全等价的。', emotion: 'happy' },
        { speaker: 'solvay_schrodinger', text: '同一个物理实在，两种不同的数学语言。这本身就很深刻。', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '不过我仍然认为波动力学更自然。它有连续的波函数，有直观的图像，不像矩阵那样抽象。', emotion: 'idle' },
        { speaker: 'su_ran', text: '两种看似完全不同的理论竟然描述的是同一件事。', emotion: 'surprise' },
        { speaker: 'solvay_schrodinger', text: '物理学的统一性往往隐藏在表面差异之下。也许有一天，我们会发现更深层的统一。', emotion: 'happy' },
      ],
      choices: [
        { text: '波动方程', next: 'topic_wave' },
        { text: '与矩阵力学的关系', next: 'topic_matrix_rel' },
        { text: '对概率诠释的看法', next: 'topic_probability' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_probability: {
      id: 'topic_probability',
      lines: [
        { speaker: 'su_ran', text: '波函数到底代表什么？', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '（叹气）这是最让我困扰的问题。波恩说它是概率幅——波函数的模平方代表在某处找到粒子的概率。', emotion: 'sad' },
        { speaker: 'solvay_schrodinger', text: '但我不想接受这个诠释。我最初以为波函数描述的是某种真实的物理波——电荷的弥散分布。', emotion: 'idle' },
        { speaker: 'solvay_schrodinger', text: '一个粒子同时"在这里又在那里"？这种概率性的图景让我深感不安。', emotion: 'angry' },
        { speaker: 'solvay_schrodinger', text: '你知道吗，我后来提出了一个思想实验——一只猫被关在盒子里，和一个量子装置相连。在你打开盒子之前，猫处于死和活的叠加态。', emotion: 'idle' },
        { speaker: 'su_ran', text: '薛定谔的猫……这是为了说明概率诠释的荒谬？', emotion: 'surprise' },
        { speaker: 'solvay_schrodinger', text: '正是。把量子层面的不确定性放大到宏观层面，你就能看到这个诠释有多么反直觉。', emotion: 'sad' },
        { speaker: 'solvay_schrodinger', text: '不过说实话……现在回想起来，也许我的猫实验反而被对方当成了反证。', emotion: 'sad' },
      ],
      choices: [
        { text: '波动方程', next: 'topic_wave' },
        { text: '与矩阵力学的关系', next: 'topic_matrix_rel' },
        { text: '对概率诠释的看法', next: 'topic_probability' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '感谢您的分享，薛定谔先生。', emotion: 'happy' },
        { speaker: 'solvay_schrodinger', text: '物理不只是方程。它也关乎我们如何理解这个世界。保重。', emotion: 'happy' },
        { speaker: 'solvay_schrodinger', text: '也许有一天，我们会找到一个更好的诠释——一个不需要牺牲确定性的诠释。我依然在等待。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 泡利
// ============================================================
export const DIALOGUE_SOLVAY_PAULI: DialogueTree = {
  id: 'dlg_solvay_pauli',
  scene: 'solvay',
  trigger: 'solvay_pauli',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_pauli', text: '……（审视的目光）你不像是物理学家。你来这里做什么？', emotion: 'idle' },
        { speaker: 'su_ran', text: '我只是对科学感兴趣……', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '兴趣是好的。但兴趣和真正的理解之间有很大的距离。你想了解什么？', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '（端起咖啡杯）我提醒你，我的时间有限。而且我不喜欢浪费时间在肤浅的问题上。', emotion: 'idle' },
      ],
      choices: [
        { text: '不相容原理', next: 'topic_exclusion' },
        { text: '对矩阵力学的贡献', next: 'topic_matrix' },
        { text: '对同行的评价', next: 'topic_colleagues' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_exclusion: {
      id: 'topic_exclusion',
      lines: [
        { speaker: 'su_ran', text: '不相容原理是什么？', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '简单说：在一个原子中，不可能有两个电子具有完全相同的四个量子数。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '这就是为什么电子必须填入不同的能级和轨道，为什么元素周期表是这样的结构。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '第四个量子数——自旋——是关键。电子有自旋向上和向下两种状态。一个轨道最多容纳两个电子，自旋相反。', emotion: 'idle' },
        { speaker: 'su_ran', text: '整个化学的基础都建立在这个原理上？', emotion: 'surprise' },
        { speaker: 'solvay_pauli', text: '你可以这么理解。没有不相容原理，所有电子都会塌缩到最低能级，就不会有化学，不会有生命。', emotion: 'happy' },
        { speaker: 'solvay_pauli', text: '当然，我提出它的时候没想那么远。我只是想解释光谱线的精细结构中的反常塞曼效应。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '乌伦贝克和古兹密特后来提出了电子自旋的概念，我的原理就有了自然的物理解释。一开始我还不太信自旋——但最终我承认了。', emotion: 'sad' },
      ],
      choices: [
        { text: '不相容原理', next: 'topic_exclusion' },
        { text: '对矩阵力学的贡献', next: 'topic_matrix' },
        { text: '对同行的评价', next: 'topic_colleagues' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_matrix: {
      id: 'topic_matrix',
      lines: [
        { speaker: 'su_ran', text: '您对矩阵力学也有贡献？', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '海森堡最初提出矩阵力学的框架后，是我帮助他理清了物理含义。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '我用量子力学正确地推导出了氢原子的光谱公式——巴尔末公式。这证明了新理论的正确性。', emotion: 'happy' },
        { speaker: 'solvay_pauli', text: '那不是容易的工作。矩阵力学刚出来时，很多人觉得它太抽象、太丑陋。但结果说明一切。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '不过，海森堡的功劳是主要的。我只是做了我该做的——检验、批评、完善。', emotion: 'idle' },
        { speaker: 'su_ran', text: '听说您的批评非常尖锐？', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '（不以为然）如果一个人的理论经不起批评，那它就不值得被提出。我不是在攻击谁，我是在帮他们做得更好。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '他们叫我"物理学的良心"。也有人说我的批评像"泡利效应"——我一出现，实验设备就会出问题。（冷笑）也许吧。', emotion: 'happy' },
      ],
      choices: [
        { text: '不相容原理', next: 'topic_exclusion' },
        { text: '对矩阵力学的贡献', next: 'topic_matrix' },
        { text: '对同行的评价', next: 'topic_colleagues' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_colleagues: {
      id: 'topic_colleagues',
      lines: [
        { speaker: 'su_ran', text: '您怎么看待会场的其他科学家？', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '爱因斯坦是天才，但他在量子问题上太固执了。他应该放下他的偏见。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '玻尔是深刻的思想者。他的互补原理虽然不直观，但我认为方向是对的。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '海森堡有极好的物理直觉。薛定谔的方程很美，但他的哲学太浪漫了。', emotion: 'happy' },
        { speaker: 'solvay_pauli', text: '德布罗意的导波理论？数学上有严重的困难。我在会上直接指出来了。他不高兴，但这是必要的。', emotion: 'idle' },
        { speaker: 'su_ran', text: '您对每个人都评价这么直接？', emotion: 'surprise' },
        { speaker: 'solvay_pauli', text: '含糊其辞是对科学的不尊重。如果你有看法，就直说。对错可以讨论，但沉默毫无价值。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '我的标准很简单——"完全正确"才算合格。"差不多"就是"完全错"。', emotion: 'idle' },
      ],
      choices: [
        { text: '不相容原理', next: 'topic_exclusion' },
        { text: '对矩阵力学的贡献', next: 'topic_matrix' },
        { text: '对同行的评价', next: 'topic_colleagues' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您，泡利先生。虽然有些……直接。', emotion: 'idle' },
        { speaker: 'solvay_pauli', text: '直接是因为我在认真对待你的问题。下次来之前，多做点功课。', emotion: 'happy' },
        { speaker: 'solvay_pauli', text: '（嘴角微微上扬）……不过你问的问题倒也不算太差。再见。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 波恩
// ============================================================
export const DIALOGUE_SOLVAY_BORN: DialogueTree = {
  id: 'dlg_solvay_born',
  scene: 'solvay',
  trigger: 'solvay_born',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_born', text: '你好啊。看你很年轻——是学生吗？', emotion: 'happy' },
        { speaker: 'su_ran', text: '算是吧。我对量子力学很感兴趣。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '那你来对地方了。量子力学正是我们这个时代最激动人心的领域。你想聊些什么？', emotion: 'happy' },
        { speaker: 'solvay_born', text: '说实话，我们这些人正在做的事情——我自己都还有些眩晕。三年前，这一切还只是模糊的线索。', emotion: 'idle' },
      ],
      choices: [
        { text: '概率诠释', next: 'topic_probability' },
        { text: '哥廷根学派', next: 'topic_gottingen' },
        { text: '对海森堡的评价', next: 'topic_heisenberg' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_probability: {
      id: 'topic_probability',
      lines: [
        { speaker: 'su_ran', text: '听说波函数的概率诠释是您提出的？', emotion: 'idle' },
        { speaker: 'solvay_born', text: '是的。1926年，薛定谔发表了波动方程，但他不确定波函数的物理含义。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '我提出：波函数的绝对值平方代表了在某处找到粒子的概率密度。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '这个想法其实受到了爱因斯坦的启发——他在研究气体统计性质时已经有过类似的想法，只是没有公开发表。', emotion: 'idle' },
        { speaker: 'su_ran', text: '所以电子不是"弥散"在空间中的波，而是一个概率分布？', emotion: 'surprise' },
        { speaker: 'solvay_born', text: '正是。波函数本身不是物理实体，它是一种概率幅——一种预测工具。', emotion: 'happy' },
        { speaker: 'solvay_born', text: '有趣的是，薛定谔本人并不喜欢这个诠释。但实验结果持续支持它。', emotion: 'sad' },
        { speaker: 'solvay_born', text: '这个诠释把概率引入了物理学的核心。对于习惯了确定性宇宙的人来说，这是一个巨大的哲学冲击。', emotion: 'idle' },
      ],
      choices: [
        { text: '概率诠释', next: 'topic_probability' },
        { text: '哥廷根学派', next: 'topic_gottingen' },
        { text: '对海森堡的评价', next: 'topic_heisenberg' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_gottingen: {
      id: 'topic_gottingen',
      lines: [
        { speaker: 'su_ran', text: '哥廷根是一个什么样的地方？', emotion: 'idle' },
        { speaker: 'solvay_born', text: '哥廷根是全世界数学和物理的中心。希尔伯特在那里，我也在那里。', emotion: 'happy' },
        { speaker: 'solvay_born', text: '我们吸引了全世界最聪明的年轻人——海森堡就是其中之一。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '那里的氛围是：大胆提问，严谨求证。没有愚蠢的问题，只有未经检验的假设。', emotion: 'happy' },
        { speaker: 'solvay_born', text: '希尔伯特有一句名言："我们必须知道，我们必将知道。"这就是哥廷根的精神。', emotion: 'happy' },
        { speaker: 'su_ran', text: '听起来是一个理想的学术环境。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '确实。科学从来不是一个人的事。它需要对话、碰撞、合作。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '矩阵力学的诞生就是最好的例子。海森堡的灵感，我的数学，约尔当的计算——三个人，缺一不可。', emotion: 'happy' },
      ],
      choices: [
        { text: '概率诠释', next: 'topic_probability' },
        { text: '哥廷根学派', next: 'topic_gottingen' },
        { text: '对海森堡的评价', next: 'topic_heisenberg' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_heisenberg: {
      id: 'topic_heisenberg',
      lines: [
        { speaker: 'su_ran', text: '您怎么评价海森堡？', emotion: 'idle' },
        { speaker: 'solvay_born', text: '维尔纳是我见过的最有天赋的年轻人之一。他的物理直觉惊人。', emotion: 'happy' },
        { speaker: 'solvay_born', text: '矩阵力学最初的想法完全是他自己的。我和约尔当做的是帮他把数学基础打牢。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '说实话，发表那篇论文时，我有些愧疚——海森堡的名字应该在最前面。', emotion: 'sad' },
        { speaker: 'solvay_born', text: '他当时度假去了，留下我整理那些手稿。我发现他用的数表满足的规则其实是非交换代数——矩阵乘法。', emotion: 'idle' },
        { speaker: 'su_ran', text: '您很谦虚。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '这不是谦虚。科学的荣誉应该归给那些真正做出核心突破的人。我的角色是支持者和完善者。', emotion: 'idle' },
        { speaker: 'solvay_born', text: '不过现在他提出的不确定性原理确实让所有人都大吃一惊。那个年轻人——他还会走得更远。', emotion: 'happy' },
      ],
      choices: [
        { text: '概率诠释', next: 'topic_probability' },
        { text: '哥廷根学派', next: 'topic_gottingen' },
        { text: '对海森堡的评价', next: 'topic_heisenberg' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您，波恩先生。您让我看到了合作的力量。', emotion: 'happy' },
        { speaker: 'solvay_born', text: '记住，伟大发现背后往往有一群人。继续探索吧。', emotion: 'happy' },
        { speaker: 'solvay_born', text: '量子力学的未来属于你们这一代。我们只是开了个头。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 洛伦兹
// ============================================================
export const DIALOGUE_SOLVAY_LORENTZ: DialogueTree = {
  id: 'dlg_solvay_lorentz',
  scene: 'solvay',
  trigger: 'solvay_lorentz',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_lorentz', text: '（慈祥的微笑）孩子，你看上去对这个世界充满了疑问。这很好。', emotion: 'happy' },
        { speaker: 'su_ran', text: '洛伦兹先生……您是这一辈物理学家的导师。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '导师谈不上。我只是比他们多看了几十年的风景。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '这次会议由我主持。爱因斯坦、玻尔、居里夫人……他们都来了。能把这些伟大的头脑聚到一起，是我的荣幸。', emotion: 'happy' },
      ],
      choices: [
        { text: '洛伦兹变换', next: 'topic_transform' },
        { text: '新旧物理的交替', next: 'topic_transition' },
        { text: '电子理论', next: 'topic_electron' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_transform: {
      id: 'topic_transform',
      lines: [
        { speaker: 'su_ran', text: '洛伦兹变换……它和相对论是什么关系？', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '我在研究运动物体的电动力学时推导出了这组变换。它描述了不同参考系之间时间和空间的转换。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '当时我还引入了"当地时间"的概念——但那只是一个数学技巧，我没有意识到它的物理意义。', emotion: 'sad' },
        { speaker: 'solvay_lorentz', text: '是爱因斯坦看出了它的真正含义：时间本身就是相对的。他把我的数学变成了物理革命。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '他在1905年提出狭义相对论时才26岁。那种洞察力——我只能叹服。', emotion: 'idle' },
        { speaker: 'su_ran', text: '您不觉得遗憾吗？差一步就到了。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '科学不是竞赛。重要的是真理被发现了——至于谁先发现，那不重要。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '而且我的思维方式是经典力学的。我有以太的包袱。爱因斯坦没有——他敢于直接抛弃以太。这种勇气是我不具备的。', emotion: 'sad' },
      ],
      choices: [
        { text: '洛伦兹变换', next: 'topic_transform' },
        { text: '新旧物理的交替', next: 'topic_transition' },
        { text: '电子理论', next: 'topic_electron' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_transition: {
      id: 'topic_transition',
      lines: [
        { speaker: 'su_ran', text: '您怎么看待经典物理和量子力学的交替？', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '我的一生恰好横跨了两个时代。我成长的年代，牛顿和麦克斯韦就是物理学的全部。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '然后是X射线、放射性、电子的发现……旧世界在一瞬间崩塌了。', emotion: 'sad' },
        { speaker: 'solvay_lorentz', text: '1895年伦琴发现X射线，1896年贝克勒尔发现放射性，1897年汤姆逊发现电子……三年之内，一切都变了。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '说实话，我对量子力学的某些方面感到困惑。波粒二象性、不确定性……这些概念和我的直觉相去甚远。', emotion: 'idle' },
        { speaker: 'su_ran', text: '但您没有反对它？', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '反对年轻人？不。如果实验和逻辑指向一个方向，个人的直觉就应该让步。这是科学的基本原则。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '一个科学家最大的美德，就是在证据面前承认自己错了。我已经错了太多次了——每一次错误都让我离真理更近。', emotion: 'happy' },
      ],
      choices: [
        { text: '洛伦兹变换', next: 'topic_transform' },
        { text: '新旧物理的交替', next: 'topic_transition' },
        { text: '电子理论', next: 'topic_electron' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_electron: {
      id: 'topic_electron',
      lines: [
        { speaker: 'su_ran', text: '您的电子理论是怎样的？', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '我提出了一种模型，认为物质中的电子在以太中运动，由此解释了金属的光学性质和塞曼效应。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '塞曼效应——光谱线在磁场中的分裂——是我最自豪的工作之一。我和塞曼因此共享了诺贝尔奖。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '那还是1896年的事。塞曼在实验室里观察到了钠光谱线在强磁场中的展宽。我们立刻意识到这和我的电子理论有关。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '当然，以太的概念后来被相对论否定了。但电子理论的核心思想——带电粒子的运动产生电磁现象——至今仍然成立。', emotion: 'idle' },
        { speaker: 'su_ran', text: '即使具体的框架改变了，洞察力是不朽的。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '你说话很有道理。保持这种洞察力，你会走得很远。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '科学就是这样——旧的框架会被新的取代，但其中真正正确的部分会被保留下来，融入新的理论。', emotion: 'idle' },
      ],
      choices: [
        { text: '洛伦兹变换', next: 'topic_transform' },
        { text: '新旧物理的交替', next: 'topic_transition' },
        { text: '电子理论', next: 'topic_electron' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您，洛伦兹先生。您的智慧让我深受感动。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '去吧，年轻人。你们是这个时代的希望。我们做的只是为你们铺路。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '记住：永远对未知保持谦逊。物理学的秘密远比我们已知的要多得多。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 德布罗意
// ============================================================
export const DIALOGUE_SOLVAY_DE_BROGLIE: DialogueTree = {
  id: 'dlg_solvay_de_broglie',
  scene: 'solvay',
  trigger: 'solvay_de_broglie',
  startNode: 'start',
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_de_broglie', text: 'Bonjour. 你是来参会的吗？在这里能看到很多伟大的头脑。', emotion: 'happy' },
        { speaker: 'su_ran', text: '是的。德布罗意先生，您的物质波理论——', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '啊，你是说我的博士论文。那个想法确实有些大胆……', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '（微微苦笑）说实话，来之前我有些忐忑。这次会议上要讨论的东西，连我自己都还没有完全想清楚。', emotion: 'sad' },
      ],
      choices: [
        { text: '物质波假说', next: 'topic_matter_wave' },
        { text: '导波理论', next: 'topic_pilot_wave' },
        { text: '会议上的遭遇', next: 'topic_conference' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_matter_wave: {
      id: 'topic_matter_wave',
      lines: [
        { speaker: 'su_ran', text: '物质波——一切物质都有波动性？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '是的。我的想法很简单：如果光既是波又是粒子，那么物质为什么不能也是波呢？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '我为粒子关联了一个波长——λ=h/p。动量越大，波长越短。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '这个公式的美妙之处在于它的对称性。普朗克常数h连接了波和粒子的两个世界。', emotion: 'idle' },
        { speaker: 'su_ran', text: '所以一个电子也有波长？', emotion: 'surprise' },
        { speaker: 'solvay_de_broglie', text: '是的。当然，对宏观物体来说，波长小到无法察觉。这就是为什么我们日常生活中看不到物质的波动性。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '爱因斯坦看到我的论文后非常支持。他说我"揭开了一幅大幕的一角"。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '后来戴维逊和革末的电子衍射实验——用电子束打到镍晶体上产生了衍射图样——直接证实了我的预言。那一刻我无比激动。', emotion: 'happy' },
      ],
      choices: [
        { text: '物质波假说', next: 'topic_matter_wave' },
        { text: '导波理论', next: 'topic_pilot_wave' },
        { text: '会议上的遭遇', next: 'topic_conference' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_pilot_wave: {
      id: 'topic_pilot_wave',
      lines: [
        { speaker: 'su_ran', text: '导波理论是什么？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '在这次会议上，我提出了一个尝试——让粒子像"骑"在波上一样，由波引导运动。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '这样既保留了粒子的确定性，又解释了干涉和衍射现象。波引导粒子，粒子有确定的轨迹。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '我不喜欢哥本哈根学派那种"粒子没有确定位置直到被观测"的说法。那太不自然了。', emotion: 'idle' },
        { speaker: 'su_ran', text: '这听起来是波粒二象性的另一种解读？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '是的。但在会场上……泡利和玻尔的批评很尖锐。他们指出了一些数学上的困难。', emotion: 'sad' },
        { speaker: 'solvay_de_broglie', text: '泡利说我无法处理多粒子系统。也许他是对的——至少目前，我还无法给出令人信服的回应。', emotion: 'sad' },
        { speaker: 'solvay_de_broglie', text: '我暂时放弃了这条路，转向了哥本哈根诠释。但也许有一天……导波理论会重新被审视。', emotion: 'idle' },
      ],
      choices: [
        { text: '物质波假说', next: 'topic_matter_wave' },
        { text: '导波理论', next: 'topic_pilot_wave' },
        { text: '会议上的遭遇', next: 'topic_conference' },
        { text: '再见', next: 'exit' },
      ],
    },
    topic_conference: {
      id: 'topic_conference',
      lines: [
        { speaker: 'su_ran', text: '在会上作报告感觉怎么样？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '紧张。我毕竟是一个人面对整个物理学界的精英。', emotion: 'sad' },
        { speaker: 'solvay_de_broglie', text: '爱因斯坦私下支持我，但他在公开场合比较沉默。玻尔和泡利则直接质疑了导波理论。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '你知道吗，我是以法国代表团成员的身份来的——我出身贵族，哥哥莫里斯也是物理学家。但在这里，头衔毫无意义。', emotion: 'idle' },
        { speaker: 'su_ran', text: '被这么多大师质疑，一定很有压力。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '确实。但这也是科学的一部分。你的想法必须经受最严格的审查。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '即使最终被证明有缺陷，这个过程本身就是有价值的。它会推动更深的思考。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '而且……我获得了1929年的诺贝尔物理学奖。物质波假说本身得到了认可，即使导波理论暂时搁浅了。', emotion: 'happy' },
      ],
      choices: [
        { text: '物质波假说', next: 'topic_matter_wave' },
        { text: '导波理论', next: 'topic_pilot_wave' },
        { text: '会议上的遭遇', next: 'topic_conference' },
        { text: '再见', next: 'exit' },
      ],
    },
    exit: {
      id: 'exit',
      lines: [
        { speaker: 'su_ran', text: '谢谢您，德布罗意先生。您的想象力令人敬佩。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '物理需要想象力，也需要严谨。两者缺一不可。再会。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '（微笑）也许下次见面时，我会有新的想法。科学的旅程永远不会结束。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 洛伦兹：任务前置对话（洛伦兹的委托 · 未交谈时）
// ============================================================
export const DIALOGUE_SOLVAY_LORENTZ_QUEST: DialogueTree = {
  id: 'dlg_solvay_lorentz_quest',
  scene: 'solvay',
  trigger: 'solvay_lorentz',
  startNode: 'start',
  priority: 50,
  condition: [{ type: 'has_flag', target: 'talked:solvay_lorentz', value: false }],
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_lorentz', text: '（翻着一叠文件，眉头微皱）……这块是座位安排表，这块是科学家桌牌——都乱了。', emotion: 'sad' },
        { speaker: 'solvay_lorentz', text: '孩子，来得正好。作为会议主席，我得说，我们遇上了点小麻烦。', emotion: 'idle' },
        { speaker: 'su_ran', text: '什么麻烦？', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '会场座位安排表和人物桌牌散落在会场各处。没有它们，明天的圆桌讨论没法就座——谁也不知道自己该坐在哪。', emotion: 'sad' },
        { speaker: 'solvay_lorentz', text: '别小看这两样东西。在座的三十二位学者，每一位的名字都值得一枚端正的桌牌。这是对科学的礼数。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '（恳切地）能帮我找回来吗？它们应该还在会场附近。拜托了。', emotion: 'idle' },
      ],
      choices: [
        { text: '交给我吧', next: 'accept' },
        { text: '（与他们再聊聊）', next: 'accept' },
      ],
    },
    accept: {
      id: 'accept',
      lines: [
        { speaker: 'solvay_lorentz', text: '（欣慰地）谢谢。年轻人愿意为这些小事奔走，这很难得。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '座位安排表可能压在长桌附近，桌牌不好说——大概落在哪个科学家脚边了吧。找齐了直接来找我。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 洛伦兹：任务进行中（已接委托 · 收集未完成）
// ============================================================
export const DIALOGUE_SOLVAY_LORENTZ_URGE: DialogueTree = {
  id: 'dlg_solvay_lorentz_urge',
  scene: 'solvay',
  trigger: 'solvay_lorentz',
  startNode: 'start',
  priority: 40,
  condition: [
    { type: 'talked_to_npc', target: 'solvay_lorentz' },
    { type: 'quest_completed', target: 'quest_lorentz_commission', value: false },
  ],
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_lorentz', text: '（整理文件）资料找得怎么样了？会场座位安排表，还有科学家桌牌——两样都要找齐。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '不急。但天黑前圆桌就要开始了，我怕居里夫人找不到自己的位子而生气。', emotion: 'idle' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 洛伦兹：任务完成后感谢对话（仅首次）
// ============================================================
export const DIALOGUE_SOLVAY_LORENTZ_THANKS: DialogueTree = {
  id: 'dlg_solvay_lorentz_thanks',
  scene: 'solvay',
  trigger: 'solvay_lorentz',
  startNode: 'start',
  priority: 60,
  condition: [
    { type: 'quest_completed', target: 'quest_lorentz_commission' },
    { type: 'has_flag', target: 'lorentz_thanked', value: false },
  ],
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_lorentz', text: '（接过文件，逐一核对）座位表、桌牌……一份不少。孩子，你帮了会议一个大忙。', emotion: 'happy' },
        { speaker: 'su_ran', text: '小事而已。', emotion: 'happy' },
        { speaker: 'solvay_lorentz', text: '不。小事才最见真章。科学讨论可以争得面红耳赤，但散场后的礼数不能少——这是对不同学派最起码的尊重。', emotion: 'idle' },
        { speaker: 'solvay_lorentz', text: '这次会议要谈的题目很棘手。玻尔与爱因斯坦的分歧，几乎没有人能调和。', emotion: 'sad' },
        { speaker: 'solvay_lorentz', text: '但只要他们还愿意坐在同一张桌子旁，愿意看着对方的眼睛说话——物理学就还有希望。这就是桌牌和座位表真正的意义。', emotion: 'idle' },
      ],
      choices: [
        { text: '我明白了。（告辞）', next: 'exit_thanks', actions: [{ type: 'flag.set', flag: 'lorentz_thanked' }] },
        { text: '（不必多言，转身离开）', next: 'exit_thanks', actions: [{ type: 'flag.set', flag: 'lorentz_thanked' }] },
      ],
    },
    exit_thanks: {
      id: 'exit_thanks',
      lines: [
        { speaker: 'solvay_lorentz', text: '去吧。圆桌那边马上要开始了——听听玻尔和爱因斯坦怎么说。这样的争吵，几十年也难遇一次。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 德布罗意：任务前置对话（持有衍射图 · 任务未完成）
// ============================================================
export const DIALOGUE_SOLVAY_DE_BROGLIE_QUEST: DialogueTree = {
  id: 'dlg_solvay_de_broglie_quest',
  scene: 'solvay',
  trigger: 'solvay_de_broglie',
  startNode: 'start',
  priority: 50,
  condition: [
    { type: 'has_item', target: 'item_diffraction' },
    { type: 'quest_completed', target: 'quest_point_to_pattern', value: false },
  ],
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_de_broglie', text: '（目光忽然停住）等等——你手里拿的，是电子衍射的累积图样？', emotion: 'surprise' },
        { speaker: 'su_ran', text: '您认识这张图？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '（凑近细看，声音发颤）一个点、一个点地打……每一个落点都是随机的，可落点多了，竟真的显出条纹。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '这正是我说的物质波——每一个电子都是粒子，可它们的"波"在暗中牵着每一次的落点。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '（恳切地）这张图请务必让我细看——不，先等等……我们先从它说起。谈谈你眼里的"落点"与"图样"。', emotion: 'idle' },
      ],
      choices: [
        { text: '先说说一个落点', next: 'from_one_dot' },
        { text: '直接看整张图', next: 'from_one_dot' },
      ],
    },
    from_one_dot: {
      id: 'from_one_dot',
      lines: [
        { speaker: 'solvay_de_broglie', text: '你看——单看一个落点，什么规律都没有，像是骰子随便扔出来的结果。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '可当落点越积越多，亮纹与暗纹便浮现出来，如同水波的干涉图样。', emotion: 'happy' },
        { speaker: 'su_ran', text: '所以一个落点是粒子，一整张图是波？', emotion: 'surprise' },
        { speaker: 'solvay_de_broglie', text: '（郑重地点头）你抓住了核心。这正是我从物性学研究里得到的信念。这张图，请让我留在身边细看——它比我一百页的论文更有说服力。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 德布罗意：任务进行中（已交谈 · 任务未完成）
// ============================================================
export const DIALOGUE_SOLVAY_DE_BROGLIE_URGE: DialogueTree = {
  id: 'dlg_solvay_de_broglie_urge',
  scene: 'solvay',
  trigger: 'solvay_de_broglie',
  startNode: 'start',
  priority: 40,
  condition: [
    { type: 'talked_to_npc', target: 'solvay_de_broglie' },
    { type: 'quest_completed', target: 'quest_point_to_pattern', value: false },
  ],
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_de_broglie', text: '（仍在若有所思）刚才说的落点与图样……你还有什么新发现吗？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '（稍掸衣袖）抱歉，我有些急切了。若有新的想法，随时来找我。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// 1927 索尔维会议 — 德布罗意：任务完成后感谢对话（仅首次）
// ============================================================
export const DIALOGUE_SOLVAY_DE_BROGLIE_THANKS: DialogueTree = {
  id: 'dlg_solvay_de_broglie_thanks',
  scene: 'solvay',
  trigger: 'solvay_de_broglie',
  startNode: 'start',
  priority: 60,
  condition: [
    { type: 'quest_completed', target: 'quest_point_to_pattern' },
    { type: 'has_flag', target: 'de_broglie_thanked', value: false },
  ],
  nodes: {
    start: {
      id: 'start',
      lines: [
        { speaker: 'solvay_de_broglie', text: '（把图样小心收好）谢谢你愿意把这张图与我分享。它回答了一个我最想回答、却始终无人肯信的问题。', emotion: 'happy' },
        { speaker: 'solvay_de_broglie', text: '一个落点是粒子——离散、确定、毫无规律可循；一整张图是波——连续、展开、严格遵循干涉的法则。', emotion: 'idle' },
        { speaker: 'su_ran', text: '那它到底是粒子，还是波？', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '（沉吟片刻）也许，"是A还是B"的问法本身就不成立。它两者都是，也正因为两者都是，才有这一整张图。', emotion: 'idle' },
        { speaker: 'solvay_de_broglie', text: '玻尔先生的"互补原理"大约也是这个意思。去听他的报告吧——今天下午，这间会议室会诞生历史。', emotion: 'happy' },
      ],
      choices: [
        { text: '我会去听的。（告辞）', next: 'exit_thanks', actions: [{ type: 'flag.set', flag: 'de_broglie_thanked' }] },
        { text: '（告辞）', next: 'exit_thanks', actions: [{ type: 'flag.set', flag: 'de_broglie_thanked' }] },
      ],
    },
    exit_thanks: {
      id: 'exit_thanks',
      lines: [
        { speaker: 'solvay_de_broglie', text: '（微笑）另外，若你回头想听会上的争论——爱因斯坦先生和玻尔先生的交锋，才是这届会议真正的高潮。', emotion: 'happy' },
      ],
    },
  },
};

// ============================================================
// Solvay 报告 CG：Stage 2（debate1）洛伦兹主持开场 → Born-Heisenberg 联合报告 → Einstein 第一次挑战
// 节点级 cgUrl 驱动五张 CG 切换，播完 set solvay_report_seen 防重播
// ============================================================
export const DIALOGUE_CG_SOLVAY_REPORT: DialogueTree = {
  id: 'dlg_cg_solvay_report',
  scene: 'solvay',
  trigger: 'solvay_lorentz',
  eventType: 'event_type2',
  priority: 90,
  cgUrl: '/CG_Scene/solvay_report/lorentz.png',
  condition: [
    { type: 'quest_completed', target: 'quest_point_to_pattern' },
    { type: 'stage_at_least', target: 'debate1' },
    { type: 'has_flag', target: 'solvay_report_seen', value: false },
  ],
  nodes: {
    open: {
      id: 'open',
      lines: [
        { speaker: '洛伦兹', text: '各位，这几天我们从四面八方撞上了同一个问题。' },
        { speaker: '洛伦兹', text: '左边这张底片——单次事件。每个电子也好，光量子也好，打到屏上就是一个点，干净利落。' },
        { speaker: '洛伦兹', text: '中间这一张，是很多次实验叠在一起。点攒够了，就露出了一条只有波动方程能算准的条纹——干涉图样。' },
        { speaker: '洛伦兹', text: '一个新理论要想立住脚，不能只解得开某一张照片。它得同时说清楚三件事：我们能预知什么，我们预知不了什么——以及这些「预知不了」，到底是仪器精度太差，还是理论本身就只能给到这个程度。' },
        { speaker: '洛伦兹', text: '下面请 Born 教授和 Heisenberg 教授做联合报告。在报告结束之前，请各位先让他们把话说完。' },
      ],
      next: 'born_report',
    },
    born_report: {
      id: 'born_report',
      cgUrl: '/CG_Scene/solvay_report/born.png',
      lines: [
        { speaker: 'Born', text: '经典力学给了我们一个习惯：初始状态写得越全，下一次实验的结果就越确定。' },
        { speaker: 'Born', text: '但到了粒子这里，下一颗粒子落在哪儿，不保证相同。装置复位，入射条件校准到同一范围，结果照变不误。' },
        { speaker: 'Born', text: '如果事情停在这儿，概率当然可以被当成「我们还没搞清细节」。问题是，理论说不出下一次落点，却能算出不同区域出现结果的比例——精确地算出来。' },
        { speaker: 'Born', text: '所以我主张：波函数首先要被理解为一种统计描述，描述在既定实验安排下，各种结果有多大概率发生。波函数给的，不是物质怎么分布，是可能结果怎么分布。' },
        { speaker: 'Born', text: '这个概率，也不是「仪器还不够好」的意思。仪器再精，理论对单次事件依然只给可能性；但对大量事件，它的预言能被严格检验。' },
      ],
      next: 'heisenberg_report',
    },
    heisenberg_report: {
      id: 'heisenberg_report',
      cgUrl: '/CG_Scene/solvay_report/heisenberg.png',
      lines: [
        { speaker: 'Heisenberg', text: '概率这件事，不意味着所有经典物理量其实都还带着精确值。' },
        { speaker: 'Heisenberg', text: '对同一个量子态，这两类可能结果没办法同时无限集中。位置准备得越窄，后面可能测到的动量范围就越宽；反过来也一样。' },
        { speaker: 'Heisenberg', text: 'Δx · Δp ≥ ℏ / 2' },
        { speaker: 'Heisenberg', text: '这个式子里的 Δx 和 Δp，不是尺子刻歪了，也不是读数读错了。' },
        { speaker: 'Heisenberg', text: '它说的是：你把完全相同的实验重复很多次，位置读数和动量读数此消彼长。更好的仪器能缩小误差，但缩不掉这两者的乘积。一方小，另一方就不可避免地大。' },
        { speaker: 'Heisenberg', text: '我们称之为共轭。我们主张，在它适用的原子过程内，量子力学已经是一个闭合的理论框架。' },
      ],
      next: 'lorentz_open_floor',
    },
    lorentz_open_floor: {
      id: 'lorentz_open_floor',
      cgUrl: '/CG_Scene/solvay_report/lorentz.png',
      lines: [
        { speaker: '洛伦兹', text: '谢谢两位。现在可以讨论。' },
      ],
      next: 'einstein_rise',
    },
    einstein_rise: {
      id: 'einstein_rise',
      cgUrl: '/CG_Scene/solvay_report/einstein_question.png',
      lines: [
        { speaker: '爱因斯坦', emotion: 'surprise', text: '两位在计算上的成就，我没有打算否认。' },
        { speaker: '爱因斯坦', text: '我真正在意的，是你们用「闭合」这个词。' },
        { speaker: '爱因斯坦', text: '如果一套理论宣布某些信息原则上无法同时获得，那就应该存在一台具体的装置，能把它放到实验面前去检验。' },
      ],
      next: 'slit_explain',
    },
    slit_explain: {
      id: 'slit_explain',
      cgUrl: '/CG_Scene/solvay_report/einstein_slit.png',
      lines: [
        { speaker: '爱因斯坦', text: '从左侧来一束很弱的光，一次只让一个光子进来。' },
        { speaker: '爱因斯坦', text: '它先穿过非固定挡板 A 上的窄缝，用弹簧挂着，能在竖直方向回冲。然后光子到达后面固定挡板 B 上的两条缝，最后在照相屏 P 上留下一个点。' },
        { speaker: '爱因斯坦', text: '重复很多次——屏上应该会出现干涉条纹。' },
      ],
      next: 'slit_momentum',
    },
    slit_momentum: {
      id: 'slit_momentum',
      cgUrl: '/CG_Scene/solvay_report/einstein_slit.png',
      lines: [
        { speaker: '爱因斯坦', text: '现在看动量守恒。光子从 A 出来以后，如果偏上，它会走向 B 的上缝，A 就受到一个向下的回冲；如果偏下，A 的回冲方向就反过来。' },
        { speaker: '爱因斯坦', text: '每次事件之后，我去读 A 的动量变化，就能判断光子刚才经过了哪条缝。' },
        { speaker: '爱因斯坦', text: '而整个过程里，两条缝一直开着，屏也没动过。' },
        { speaker: '爱因斯坦', text: '路径记录和干涉图样——为什么不能在同一批实验里同时拿到？' },
      ],
      next: 'bohr_reply',
    },
    bohr_reply: {
      id: 'bohr_reply',
      cgUrl: '/CG_Scene/solvay_report/einstein_slit.png',
      lines: [
        { speaker: '玻尔', emotion: 'idle', text: '所以您测的不是光最后落在哪里，而是前挡板在光子通过前后的动量变化，再从这个变化推断路径。我没理解错吧？' },
        { speaker: '爱因斯坦', emotion: 'idle', text: '没错。没有人在两条缝旁边拦着，也不是等条纹出来以后再猜路径。屏上每一个落点，我们同时都有一条来自 A 的独立记录。' },
        { speaker: '玻尔', emotion: 'idle', text: '而上、下两种回冲的差别再小，您也认为读数装置可以理想化到足以分辨。' },
        { speaker: '爱因斯坦', emotion: 'idle', text: '当然。如果最后的回答只剩下「信号太弱」，那只是工艺问题，不是理论限制。' },
        { speaker: '玻尔', emotion: 'idle', text: '（玻尔看着 A 与 B 之间那两支斜箭头，沉默了一会儿。）我现在还不能指出您的方案在哪里失效。' },
      ],
      next: 'pauli_interject',
    },
    pauli_interject: {
      id: 'pauli_interject',
      cgUrl: '/CG_Scene/solvay_report/einstein_slit.png',
      lines: [
        { speaker: '泡利', text: '但「回冲太小」不能算回答。这里谈的是原则问题。如果理论说它不可能，就必须指出是哪两个条件不能同时成立。' },
        { speaker: '洛伦兹', text: 'Einstein 不是在说哪台仪器做得不够好。他问的是：不确定关系能不能被一台理想装置绕过去。' },
        { speaker: '洛伦兹', text: '玻尔教授下午本来就有报告。我们按议程走。爱因斯坦教授画在黑板上的装置，留着，不擦。' },
      ],
      choices: [
        {
          text: '（屏息，把这页黑板记在心里）',
          actions: [{ type: 'flag.set', flag: 'solvay_report_seen' }],
          next: 'curtain',
        },
      ],
    },
    curtain: {
      id: 'curtain',
      cgUrl: '/CG_Scene/solvay_report/einstein_slit.png',
      lines: [{ speaker: '洛伦兹', text: '（报告的第一场论战，就此留在了这块黑板上。）' }],
    },
  },
  startNode: 'open',
};


// ============================================================
// Solvay 主线 CG：玻尔的报告 + 互补性（stage 3 触发）
// ============================================================
export const DIALOGUE_CG_SOLVAY_BOHR_REPORT: DialogueTree = {
  id: 'dlg_cg_solvay_bohr_report',
  scene: 'solvay',
  trigger: 'solvay_bohr',
  eventType: 'event_type2',
  priority: 60,
  condition: [
    { type: 'stage_at_least', target: 'meeting' },
    { type: 'has_flag', target: 'slit_rebuttal_done', value: false },
  ],
  cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
  nodes: {
    open: {
      id: 'open',
      lines: [
        { speaker: '玻尔', text: '今天我只想谈一件事：我们说的一个"现象"，到底包括什么。' },
        { speaker: '玻尔', text: '屏幕上那个黑点当然是记录。但完整的物理陈述，还应该写清楚——狭缝是怎么固定的，时钟是怎么校准的，哪些部件充当参考，哪些部件用来读动量或能量。' },
        { speaker: '玻尔', text: '如果把这些条件删掉，只剩下一个结果，很多看似清楚的问题，其实压根还没被定义。' },
        { speaker: '玻尔', text: '牢固连接的支架，适合规定位置和相位关系；能够独立运动的部件，适合记录动量交换。' },
        { speaker: '玻尔', text: '如果把两种互相排斥的安排各自给出的信息，偷偷合并成同一次实验的记录——那不是在发现矛盾，是在制造矛盾。' },
      ],
      next: 'complementarity',
    },
    complementarity: {
      id: 'complementarity',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [
        { speaker: '玻尔', text: '我把这种关系称为互补性。' },
        { speaker: '玻尔', text: '它不是不让你问问题，而是要求：每一个物理结论，都必须连同让它成立的条件一起说出来。' },
        { speaker: '玻尔', text: '这也不意味着物体和仪器之间有一条永远不变的界线。界线怎么划，取决于这次实验要取得什么样的记录。' },
        { speaker: '玻尔', text: '但一旦安排确定了，我们就不能在推理中悄悄把它改掉。' },
      ],
      next: 'debate_einstein',
    },
    debate_einstein: {
      id: 'debate_einstein',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [
        { speaker: '旁白', text: '（玻尔结束报告。会场没有立刻鼓掌。爱因斯坦指向上午留下的装置图。）' },
        { speaker: '爱因斯坦', text: '那么，请把这个原则用在 A、B 和照相屏上。' },
        { speaker: '玻尔', text: '好。我们从"路径已经能够分辨"这句话开始。' },
      ],
      choices: [
        {
          text: '（走向装置，亲手验证）',
          actions: [{ type: 'minigame.open', minigameId: 'slit-rebuttal' }],
          next: 'hold',
        },
      ],
    },
    hold: {
      id: 'hold',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [{ speaker: '洛伦兹', text: '（装置准备就绪，论战开始了。）' }],
    },
  },
  startNode: 'open',
};


// ============================================================
// Solvay 主线 CG：玻尔 vs 爱因斯坦 辩论（小游戏通关后续播，stage 3）
// ============================================================
export const DIALOGUE_CG_SOLVAY_DEBATE: DialogueTree = {
  id: 'dlg_cg_solvay_debate',
  scene: 'solvay',
  trigger: 'solvay_bohr',
  eventType: 'event_type2',
  priority: 70,
  condition: [
    { type: 'stage_at_least', target: 'meeting' },
    { type: 'has_flag', target: 'slit_rebuttal_done' },
    { type: 'has_flag', target: 'bohr_debate_seen', value: false },
  ],
  cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
  nodes: {
    open: {
      id: 'open',
      lines: [
        { speaker: '玻尔', text: '光子走上面还是走下面，A 获得的竖直回冲是有差别的——差别很小，但确实有一个量。' },
        { speaker: '玻尔', text: '如果读数要能区分两条路径，那狭缝在光子到达之前，本身的动量范围就不能宽到让两种回冲混在一起。' },
      ],
      next: 'momentum_prep',
    },
    momentum_prep: {
      id: 'momentum_prep',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [
        { speaker: '爱因斯坦', text: '同意。' },
        { speaker: '玻尔', text: '好。那么第一项条件已经清楚了：要拿到路径信息，A 的动量范围必须比两种回冲的差值更窄。' },
        { speaker: '玻尔', text: '而且这件事不是"测得准"和"测不准"的突变。路径判断越可靠，A 需要提前准备好的动量范围就越窄。' },
        { speaker: '玻尔', text: '接下来要看的是：这会对干涉条件产生什么影响。' },
        { speaker: '玻尔', text: '不只是动量，它的位置，也属于这台干涉装置的一部分。' },
        { speaker: '玻尔', text: '请注意——不是说实验员手碰了挡板，或弹簧精度差。它说的是：狭缝本身所处的量子状态允许的位置范围。' },
      ],
      next: 'quantum_slit_analysis',
    },
    quantum_slit_analysis: {
      id: 'quantum_slit_analysis',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [
        { speaker: '爱因斯坦', text: '也就是说，在你的分析里，测量装置的一部分必须和光量子一样用量子力学来描述。' },
        { speaker: '玻尔', text: '这正是上午那个公式在装置上的含义。' },
        { speaker: '玻尔', text: '它没有额外增加任何规则，只是没有允许狭缝 A 在同一句话里同时拥有两种互斥的状态。' },
        { speaker: '爱因斯坦', text: '就算 A 的位置有一个范围，为什么这会破坏屏上的图样？' },
        { speaker: '玻尔', text: '因为那条窄缝，决定了波从什么地方出发到达 B 的两条缝。' },
        { speaker: '玻尔', text: 'A 向上或者向下挪了一点，到达两条缝的路程差就变了，屏上的亮纹和暗纹位置就会整体平移。' },
      ],
      next: 'einstein_photon',
    },
    einstein_photon: {
      id: 'einstein_photon',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [
        { speaker: '爱因斯坦', text: '可是单个光子只留下一个点。你说的"一组条纹移动"，在一次事件里是怎么发生的？' },
        { speaker: '玻尔', text: '干涉图样本来就不是一次事件的形状。它是很多次同样准备的结果分布。所有落点累积到同一块屏上增益或抵消。' },
        { speaker: '玻尔', text: '最后剩下的，就是一张没有清晰明暗对比的分布。' },
        { speaker: '爱因斯坦', text: '如果我只要求粗一点的路径判断，不追求每次都能分清，屏上还能不能留下比较弱的条纹？' },
        { speaker: '玻尔', text: '能。路径信息越清楚，条纹对比度就越低。' },
      ],
      next: 'einstein_close',
    },
    einstein_close: {
      id: 'einstein_conclusion',
      cgUrl: '/CG_Scene/solvay_report/bohr_slit.png',
      lines: [
        { speaker: '爱因斯坦', text: '所以你的回答不是"光碰到挡板就失去了波动性"——而是：为了取得路径信息而做的动量准备，让 A 无法继续提供形成稳定相位所需要的位置参考。' },
        { speaker: '玻尔', text: '对。' },
        { speaker: '爱因斯坦', text: '对于这台装置，我接受你的分析。它确实没有同时给出我要求的那两类记录。而我担心的是另一件事。' },
        { speaker: '爱因斯坦', text: '从"目前没有共同的检验条件"，走到"不存在一个更完整的共同事实"——这中间多了一步。那一步不是这台装置本身能够证明的。所以我们的分歧还在。' },
        { speaker: '爱因斯坦', text: '你把理论能够无歧义陈述的范围看作完整的描述；我把它看作可能还没有穷尽现实的描述。' },
      ],
      next: 'lorentz_close',
    },
    lorentz_close: {
      id: 'lorentz_close',
      cgUrl: '/CG_Scene/solvay_report/lorentz.png',
      lines: [
        { speaker: '洛伦兹', text: '很好。技术问题已经有回答了，完备性的问题先留着。' },
        { speaker: '洛伦兹', text: '今晚先到这里。' },
      ],
      choices: [
        {
          text: '（这一天，物理学的根基被重新丈量）',
          actions: [
            { type: 'stage.set', stage: 'debate2' },
            { type: 'flag.set', flag: 'bohr_debate_seen' },
          ],
          next: 'curtain',
        },
      ],
    },
    curtain: {
      id: 'curtain',
      cgUrl: '/CG_Scene/solvay_report/lorentz.png',
      lines: [{ speaker: '玻尔', text: '（白天的议程结束。夜晚的布鲁塞尔，灯还亮着。）' }],
    },
  },
  startNode: 'open',
};


// ============================================================
// Solvay 主线 CG：爱因斯坦光子箱（stage 5 触发）+ 中段言弹小游戏
// ============================================================
export const DIALOGUE_CG_SOLVAY_PHOTON_BOX: DialogueTree = {
  id: 'dlg_cg_solvay_photon_box',
  scene: 'solvay',
  trigger: 'solvay_einstein',
  eventType: 'event_type2',
  priority: 60,
  condition: [
    { type: 'quest_completed', target: 'quest_attend_bohr_report' },
    { type: 'has_flag', target: 'photon_box_done', value: false },
  ],
  cgUrl: '/CG_Scene/solvay_report/einstein_box.png',
  nodes: {
    open: {
      id: 'open',
      lines: [
        { speaker: '爱因斯坦', text: '昨天你的回答依赖一对共轭量。今天我换一组量。' },
        { speaker: '爱因斯坦', text: '箱子侧面开一个小孔，孔由快门控制，让快门只打开极短的一瞬，放出一个光子。' },
        { speaker: '爱因斯坦', text: '把整只箱子挂在弹簧秤上。放光之前称一次，光子离开之后再称一次。两次质量的差，就是箱子失去的质量。' },
        { speaker: '爱因斯坦', text: '这样比较的是整只密闭箱放光前后的质量，不需要知道光子怎么产生，受了多大的冲量。因为 E = mc²，质量差乘以光速的平方，就是离开箱子的能量。' },
        { speaker: '爱因斯坦', text: '如果量子理论说能量和时间不能同时任意精确——请指出这台装置到底在哪一步提出了互不相容的条件。' },
      ],
      next: 'bohr_react',
    },
    bohr_react: {
      id: 'bohr_react',
      cgUrl: '/CG_Scene/solvay_report/einstein_box.png',
      lines: [
        { speaker: '玻尔', text: '昨天的位置参考问题，似乎已经被绕开了。' },
        { speaker: '旁白', text: '玻尔先看箱内时钟，又顺着弹簧秤的指针看到固定在支架上的刻度。他试图开口，又停住了。' },
        { speaker: '玻尔', text: '如果这两项精度真的能彼此独立地提高，问题会比昨天更严重。' },
        { speaker: '玻尔', text: '爱因斯坦，如果你是对的，那么物理学就完了！' },
      ],
      choices: [
        {
          text: '（搬出光子箱，开始称量）',
          actions: [{ type: 'minigame.open', minigameId: 'photon-box' }],
          next: 'hold',
        },
      ],
    },
    hold: {
      id: 'hold',
      cgUrl: '/CG_Scene/solvay_report/einstein_box.png',
      lines: [{ speaker: '旁白', text: '（光子箱就位，称量开始。这一局，得由你自己来赢。）' }],
    },
  },
  startNode: 'open',
};


// ============================================================
// Solvay 主线 CG：最终辩驳（光子箱小游戏通关后续播，stage 5）
// ============================================================
export const DIALOGUE_CG_SOLVAY_FINAL_DEBATE: DialogueTree = {
  id: 'dlg_cg_solvay_final_debate',
  scene: 'solvay',
  trigger: 'solvay_einstein',
  eventType: 'event_type2',
  priority: 70,
  condition: [
    { type: 'quest_completed', target: 'quest_attend_bohr_report' },
    { type: 'has_flag', target: 'photon_box_done' },
    { type: 'has_flag', target: 'photon_box_seen', value: false },
  ],
  cgUrl: '/CG_Scene/solvay_report/final_debate.png',
  nodes: {
    open: {
      id: 'open',
      lines: [
        { speaker: '玻尔', text: '但有一个问题。称量不是看一眼就完事的。质量差极小的时候，你需要花时间调节砝码，让箱子重新平衡。' },
        { speaker: '玻尔', text: '那一点点质量差异，在重力作用下会产生一个极小的动量变化。要从箱子本身那些不规则的微小运动中分辨出它。' },
        { speaker: '爱因斯坦', text: '这和昨天一样，为了读出很小的变化，先控制被称物的动量。' },
      ],
      next: 'height_uncertainty',
    },
    height_uncertainty: {
      id: 'height_uncertainty',
      cgUrl: '/CG_Scene/solvay_report/final_debate.png',
      lines: [
        { speaker: '玻尔', text: '对，但这次多了一层。指针的零线同时标定了箱体的高度。你越严格地控制动量，箱体的高度就越不确定。' },
        { speaker: '爱因斯坦', text: '然后呢？' },
        { speaker: '玻尔', text: '高度不确定会带来一个问题。在重力场中，不同高度的时钟走得不一样快，这是广义相对论的结论。箱体高度如果有一个范围，箱内时钟相对于外部标准钟的偏差就也有一个范围。' },
        { speaker: '爱因斯坦', text: '那个偏差极小。' },
        { speaker: '玻尔', text: '当然极小。但现在讨论的是原则上能否任意精确。引力造成的钟差虽然小，但恰好在这个极限下不能被忽略。' },
      ],
      next: 'gravity_clock',
    },
    gravity_clock: {
      id: 'gravity_clock',
      cgUrl: '/CG_Scene/solvay_report/final_debate.png',
      lines: [
        { speaker: '爱因斯坦', text: '所以我不能同时拿到任意精确的能量和发射时刻。' },
        { speaker: '玻尔', text: '对。把三件事连起来看——称量需要的精度、位置和动量的限制、引力对时钟的影响。' },
        { speaker: '爱因斯坦', text: '所以钟没坏，秤也没失准。限制来自箱子本身。你用我的引力理论，回答了我的装置。' },
      ],
      next: 'concessions',
    },
    concessions: {
      id: 'concessions',
      cgUrl: '/CG_Scene/solvay_report/final_debate.png',
      lines: [
        { speaker: '爱因斯坦', text: '对这只光子箱，反驳成立。它没有让能量和发射时刻同时达到我原先要求的精度。' },
        { speaker: '爱因斯坦', text: '请在记录里写清楚，我不否认你们守住了不确定关系。两项挑战都没有证明理论内部有矛盾。' },
        { speaker: '爱因斯坦', text: '但内部一致不等于描述已经完备。理论能正确预言所有读数，仍可能没有说出单次事件的全部事实。我会继续找办法区分这两者。' },
      ],
      next: 'lorentz_summary',
    },
    lorentz_summary: {
      id: 'lorentz_summary',
      cgUrl: '/CG_Scene/solvay_report/lorentz.png',
      lines: [
        { speaker: '洛伦兹', text: '我们至少该分三件事记：方程不冲突，是一致；计算符合实验，是成功；是否说尽物理事实，是完备。前两项今晚得到加强，第三项没有解决。' },
      ],
      next: 'final_statements',
    },
    final_statements: {
      id: 'final_statements',
      cgUrl: '/CG_Scene/solvay_report/final_debate.png',
      lines: [
        { speaker: '爱因斯坦', text: '正是。我接受反例失败，但不接受把失败解释成一切更深描述都被排除。' },
        { speaker: '玻尔', text: '我也不认为一个装置能终止所有认识论问题。我只坚持：一句话若以物理结论的面目出现，就必须说明它的概念由什么实验条件定义。否则我们容易把分属不同安排的数值拼成无法检验的东西。' },
        { speaker: '爱因斯坦', text: '请在记录里写清楚：我不否认你们守住了不确定关系。可回冲狭缝没有同时留下路径和干涉；光子箱也没有同时给出任意精确的能量和外部发射时刻。两项挑战都没有证明这套理论内部有矛盾。但内部一致——不等于对现实的描述已经完备了。一套理论可以正确预言所有已经设计好的读数，但仍然没有说出决定单次事件的全部事实。' },
        { speaker: '玻尔', text: '我也不认为一个装置的回答能终止所有认识论问题。我坚持的是更有限的要求：如果一句话是以物理结论的名义出现的，就必须说明它的概念是由什么实验条件定义的。否则，我们很容易把分属不同安排的数值拼成一个无法检验的对象。' },
        { speaker: '爱因斯坦', text: '那么我会继续提出装置。' },
        { speaker: '玻尔', text: '我会继续检查装置实际上允许我们说什么。' },
      ],
      next: 'curtain',
    },
    curtain: {
      id: 'curtain',
      cgUrl: '/CG_Scene/solvay_report/final_debate.png',
      lines: [{ speaker: '旁白', text: '（布鲁塞尔的夜深了。会议之外，物理学的世纪仍在继续。）' }],
    },
  },
  startNode: 'open',
};
// ============================================================
// 全部对话注册表
// ============================================================
export const ALL_DIALOGUES: DialogueTree[] = [
  DIALOGUE_OFFICE_XIAO,
  DIALOGUE_ARPES_MONOLOGUE,
  DIALOGUE_ARPES_SAMPLE_ROD,
  DIALOGUE_ASTRO_LISA,
  DIALOGUE_ASTRO_LISA_CG,
  DIALOGUE_ASTRO_BOOK,
  DIALOGUE_ASTRO_BOOK_THANKS,
  DIALOGUE_VR_DEVICE_CG,
  DIALOGUE_SOLVAY_EINSTEIN,
  DIALOGUE_SOLVAY_BOHR,
  DIALOGUE_CG_SOLVAY_PHOTON_BOX,
  DIALOGUE_CG_SOLVAY_FINAL_DEBATE,
  DIALOGUE_CG_SOLVAY_BOHR_REPORT,
  DIALOGUE_CG_SOLVAY_DEBATE,
  DIALOGUE_SOLVAY_CURIE,
  DIALOGUE_SOLVAY_HEISENBERG,
  DIALOGUE_SOLVAY_SCHRODINGER,
  DIALOGUE_SOLVAY_PAULI,
  DIALOGUE_SOLVAY_BORN,
  DIALOGUE_SOLVAY_LORENTZ,
  DIALOGUE_SOLVAY_DE_BROGLIE,
  DIALOGUE_SOLVAY_LORENTZ_QUEST,
  DIALOGUE_SOLVAY_LORENTZ_URGE,
  DIALOGUE_SOLVAY_LORENTZ_THANKS,
  DIALOGUE_SOLVAY_DE_BROGLIE_QUEST,
  DIALOGUE_SOLVAY_DE_BROGLIE_URGE,
  DIALOGUE_SOLVAY_DE_BROGLIE_THANKS,
  DIALOGUE_CG_SOLVAY_REPORT,
];

export type ConditionChecker = (entry: StartConditionEntry) => boolean;
