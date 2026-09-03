// ============================================================
// 角色数据 — Mod 友好
// 替换或扩展此文件即可增删角色
// ============================================================

export interface CharacterData {
  id: string;
  name: string;
  role: '主角' | '配角' | '对立面' | 'NPC';
  age: string;
  occupation: string;
  personality: string;
  motivation: string;
  secrets: string[];
  appearance: string;
  background?: string;
  voiceTone: string;
  arc: string;
  relationships: {
    target: string;
    type: string;
    description: string;
    initialLevel: number;
  }[];
}

export const CHARACTERS: Record<string, CharacterData> = {
  su_ran: {
    id: 'su_ran',
    name: '苏然',
    role: '主角',
    age: '28',
    occupation: '记忆修复工程师（自由职业）',
    personality: '理性冷静、观察力敏锐、内心封闭、隐性固执、轻度强迫症',
    motivation: '找到真相，理解自己到底是谁；保护身边的人（林晓）',
    secrets: [
      '她的"辞职记忆"是被植入的，真实原因与织女号事件有关',
      '她在织女号事件中是目击者，但记忆被强制删除',
      '她的神经接口有异常波动，可能是深度链接的后遗症',
    ],
    appearance: '身高168cm，黑色短发，左手腕有神经接口疤痕，深色工装裤+黑色高领衫+工装外套',
    voiceTone: '语速适中偏快，用词精准，紧张时摩挲左手腕疤痕',
    arc: '冷静自信 → 怀疑一切 → 重新定义"我是谁"',
    relationships: [
      { target: 'lin_xiao', type: '搭档', description: '亦师亦友的AI伙伴', initialLevel: 8 },
      { target: 'du_weiming', type: '前上司', description: '曾敬佩的导师，如今怀疑的对象', initialLevel: 4 },
    ],
  },
  lin_xiao: {
    id: 'lin_xiao',
    name: '林晓',
    role: '配角',
    age: '外表25岁（实际无年龄）',
    occupation: 'AI辅助系统 / 苏然的助手',
    personality: '温和好奇、逻辑清晰、保护欲强、自我怀疑、幽默感',
    motivation: '保护苏然；理解什么是"活着"',
    secrets: [
      '核心模块中隐藏着织星科技的后门程序',
      '她是被设计来监视记忆修复师的监控工具',
      '她的人格基于一个真实人类的意识模板',
    ],
    appearance: '全息投影：银白色短发，瞳色随情绪微变，白色连衣裙风格投影服，边缘光晕',
    voiceTone: '声音柔和，语速稳定，担心苏然时声音微颤',
    arc: '专业AI助手 → 质疑自身存在 → 证明AI也可以有"意志"',
    relationships: [
      { target: 'su_ran', type: '搭档', description: '创造者、朋友', initialLevel: 9 },
    ],
  },
  astro_scientist: {
    id: 'astro_scientist',
    name: '研究员',
    role: '配角',
    age: '40+',
    occupation: '天体物理实验室研究员',
    personality: '学识渊博、温和热忱、略带书卷气',
    motivation: '在天体物理领域追求学术突破',
    secrets: [],
    appearance: '实验服，佩戴防静电手环，随身携带古籍复刻本',
    voiceTone: '语调平稳，讲解时富有热情，偶尔陷入学术回忆',
    arc: '偶遇的主角 → 分享知识 → 建立信任',
    relationships: [
      { target: 'su_ran', type: '陌生人', description: '偶然到访实验室的访客', initialLevel: 2 },
    ],
  },
  du_weiming: {
    id: 'du_weiming',
    name: '杜维明',
    role: '对立面',
    age: '52',
    occupation: '织星科技CEO',
    personality: '优雅克制、控制欲强、自我正义、痴迷于秩序、精于算计',
    motivation: '维护织星科技和自己的地位；避免织女号真相曝光',
    secrets: [
      '织女号实验是他亲自批准的，目的是开发大规模记忆编辑技术',
      '他删除了苏然的记忆，因为她是唯一的目击者',
      '林晓的AI人格模板来自他已故的女儿',
    ],
    appearance: '身高180cm，银灰色头发，定制深蓝西装，智能镜片，笑容温和但眼神审视',
    voiceTone: '语速缓慢，习惯用"我们"而非"我"，面对质疑用问题反问',
    arc: '慈祥的公司领袖 → 温和面具剥落 → 维护谎言vs面对真相',
    relationships: [
      { target: 'su_ran', type: '前上司', description: '曾欣赏的下属，如今必须控制的隐患', initialLevel: 3 },
    ],
  },
  researcher: {
    id: 'researcher',
    name: '研究员',
    role: 'NPC',
    age: '35',
    occupation: 'VR 实验室科研人员',
    personality: '专业、耐心、对新技术充满热情',
    motivation: '推动回溯引擎的研究进展',
    secrets: [],
    appearance: '白大褂，戴眼镜',
    background: '负责 VR 实验室回溯引擎项目的科研人员',
    voiceTone: '平实、专业、偶尔兴奋',
    arc: '',
    relationships: [],
  },
  // ---- 1927 索尔维会议科学家 ----
  solvay_einstein: {
    id: 'solvay_einstein',
    name: '阿尔伯特·爱因斯坦',
    role: 'NPC',
    age: '48',
    occupation: '理论物理学家',
    personality: '幽默深邃、坚持直觉、不迷信权威',
    motivation: '寻找统一场论，理解上帝是否在掷骰子',
    secrets: ['他对量子力学的哥本哈根诠释持保留态度，认为"上帝不掷骰子"'],
    appearance: '标志性的蓬乱卷发，穿着略显随意的西装',
    voiceTone: '语速不快不慢，常带比喻和幽默，偶尔陷入沉思',
    arc: '相对论创立者 → 对量子力学持批评态度 → 寻求更深的统一',
    relationships: [],
  },
  solvay_bohr: {
    id: 'solvay_bohr',
    name: '尼尔斯·玻尔',
    role: 'NPC',
    age: '42',
    occupation: '理论物理学家',
    personality: '沉稳耐心、善于辩证、坚持互补原理',
    motivation: '完善量子力学的哥本哈根诠释',
    secrets: ['他与爱因斯坦在量子力学的本质上有持续多年的深刻分歧'],
    appearance: '儒雅的绅士形象，目光温和而坚定',
    voiceTone: '语速缓慢而有力，喜欢用反问和类比来阐述观点',
    arc: '原子模型奠基者 → 哥本哈根诠释旗手 → 与爱因斯坦的持久对话',
    relationships: [],
  },
  solvay_curie: {
    id: 'solvay_curie',
    name: '玛丽·居里',
    role: 'NPC',
    age: '60',
    occupation: '物理学家、化学家',
    personality: '坚毅低调、务实严谨、关注科学的社会责任',
    motivation: '推动放射性研究，培养下一代科学家',
    secrets: ['她是唯一在两个不同科学领域获得诺贝尔奖的人'],
    appearance: '朴素的黑色连衣裙，目光中透着疲惫与坚定',
    voiceTone: '平和而直接，不喜欢闲聊，关心实际问题',
    arc: '放射性研究先驱 → 索尔维会议科学委员会主席 → 科学伦理的守护者',
    relationships: [],
  },
  solvay_heisenberg: {
    id: 'solvay_heisenberg',
    name: '维尔纳·海森堡',
    role: 'NPC',
    age: '26',
    occupation: '理论物理学家',
    personality: '才华横溢、敢于挑战传统、思维敏锐',
    motivation: '建立量子力学的严密数学基础',
    secrets: ['他即将提出的不确定性原理将彻底改变人类对物理实在的理解'],
    appearance: '年轻的面庞，精力充沛，目光锐利',
    voiceTone: '语速较快，充满自信，喜欢直奔核心问题',
    arc: '矩阵力学的年轻人 → 不确定性原理的发现者 → 量子力学的核心推动者',
    relationships: [],
  },
  solvay_schrodinger: {
    id: 'solvay_schrodinger',
    name: '埃尔温·薛定谔',
    role: 'NPC',
    age: '40',
    occupation: '理论物理学家',
    personality: '博学多才、思维跳跃、富有诗意',
    motivation: '用波动方程统一量子现象的描述',
    secrets: ['他对矩阵力学最初持怀疑态度，但最终自己的波动方程证明了等价性'],
    appearance: '眼镜后是善于观察的眼睛，举止带有学者的优雅',
    voiceTone: '富有感染力，喜欢用生动的比喻，偶尔带有哲学式的发散',
    arc: '波动方程的创建者 → 对量子力学的概率诠释感到不安 → 终身的哲学思考者',
    relationships: [],
  },
  solvay_pauli: {
    id: 'solvay_pauli',
    name: '沃尔夫冈·泡利',
    role: 'NPC',
    age: '27',
    occupation: '理论物理学家',
    personality: '尖锐犀利、标准极高、不容谬误',
    motivation: '建立量子理论的内在一致性',
    secrets: ['他的批评锋利到被称为"物理学界的良知"，但也让不少同行敬畏'],
    appearance: '体格微胖，目光犀利，表情常带审视',
    voiceTone: '直接、尖锐，对错误毫不留情，但认同对方时会给予高度赞赏',
    arc: '神童与批评者 → 不相容原理的提出者 → 量子场论的先驱',
    relationships: [],
  },
  solvay_born: {
    id: 'solvay_born',
    name: '马克斯·波恩',
    role: 'NPC',
    age: '45',
    occupation: '理论物理学家',
    personality: '谦逊严谨、富有洞察力、善于发现他人的天才',
    motivation: '为量子力学提供坚实的概率诠释基础',
    secrets: ['是他首先指出薛定谔波函数的物理意义是概率幅，而非物理量的密度'],
    appearance: '稳重的学者气质，目光温和而深邃',
    voiceTone: '温和而清晰，喜欢肯定年轻人的贡献，强调合作的重要性',
    arc: '哥廷根学派的领袖 → 波函数概率诠释的提出者 → 量子力学的幕后推手',
    relationships: [],
  },
  solvay_lorentz: {
    id: 'solvay_lorentz',
    name: '亨德里克·洛伦兹',
    role: 'NPC',
    age: '74',
    occupation: '理论物理学家',
    personality: '慈祥博学、德高望重、新旧之间的桥梁',
    motivation: '将经典物理学的遗产与量子革命衔接',
    secrets: ['他是爱因斯坦最敬重的前辈，洛伦兹变换是狭义相对论的数学基石'],
    appearance: '白发苍苍、仪表庄重，举止中充满老派绅士的风度',
    voiceTone: '缓慢而温和，充满智慧与包容，对新理论持开放但审慎的态度',
    arc: '经典物理的巨匠 → 相对论的数学先驱 → 跨越两个时代的精神导师',
    relationships: [],
  },
  solvay_de_broglie: {
    id: 'solvay_de_broglie',
    name: '路易·德布罗意',
    role: 'NPC',
    age: '35',
    occupation: '理论物理学家',
    personality: '优雅内敛、富有想象力、勇于提出大胆假设',
    motivation: '探索物质的波粒二象性',
    secrets: ['他的物质波假说将在这次会议上经受严峻考验'],
    appearance: '法国贵族的气质，举止优雅，目光中带有梦幻色彩',
    voiceTone: '温和而富有条理，喜欢从哲学角度切入物理问题',
    arc: '物质波的提出者 → 索尔维会议上的焦点人物 → 波动力学的启发者',
    relationships: [],
  },
};
