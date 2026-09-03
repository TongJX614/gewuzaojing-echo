// ============================================================
// 场景定义 — 两个游戏场景（办公室 + ARPES实验室）
// ============================================================

import { NPC } from '../entities/npc';
import { InteractiveItem } from '../entities/item';
import { SceneDef, createSceneDef } from './scene';
import { MAP_OFFICE } from '../assets/tilesets';

// ---- 办公室场景 ----
const officeNpcs = [
  new NPC('lin_xiao', 7, 5, 'npc_xiao', '林晓', 'lin_xiao'),
];
const officeItems = [
  new InteractiveItem('memory_data', 5, 3, 'item_doc', '记忆数据', 'memory_data', 'doc', false, 'memory_data'),
  new InteractiveItem('neural_interface', 7, 3, 'item_glow', '神经接口', 'neural_interface', 'glow', false, 'neural_interface'),
];

export const SCENE_OFFICE: SceneDef = createSceneDef(
  'office', '苏然的办公室', MAP_OFFICE,
  { x: 10, y: 10 },
  officeNpcs,
  officeItems,
  [
    { x: 10, y: 0, targetScene: 'arpes', targetX: 10, targetY: 17 },
    { x: 20, y: 0, targetScene: 'astro', targetX: 10, targetY: 1 },
  ],
  '/world/cyber_lab.png',
  undefined,
  32,
  16,
);

// ---- ARPES 实验室场景 ----
const arpesItems = [
  new InteractiveItem('arpes_equipment', 10, 9, 'item_glow', 'ARPES设备', 'arpes_equipment', 'glow', true),
  new InteractiveItem('sample_rod', 12, 9, 'item_glow', '样品杆', 'sample_rod', 'glow', true),
  new InteractiveItem('keycard_find', 6, 7, 'item_glow', '4级安保门禁卡', 'item_keycard', 'key', false, 'item_keycard'),
  new InteractiveItem('bio_find', 18, 11, 'item_glow', '密封生物样本', 'item_bio', 'glow', false, 'item_bio'),
];

export const SCENE_ARPES: SceneDef = createSceneDef(
  'arpes', 'ARPES实验室', MAP_OFFICE,
  { x: 10, y: 17 },
  [], // 无NPC
  arpesItems,
  [
    { x: 10, y: 19, targetScene: 'office', targetX: 10, targetY: 1 },
  ],
  '/world/ARPES_lab.png',
  12,
  32,
  16,
);

// ---- Astro 实验室场景 ----
const astroNpcs = [
  // 研究员 — 正面站立
  new NPC('astro_scientist', 14, 14, 'npc_default', '实验室研究员', 'astro_scientist'),
  // 研究员 — 背面
  new NPC('astro_scientist_back', 20, 18, 'npc_default', '实验室研究员', 'astro_scientist_back'),
  // 研究员 — 蹲下操作设备
  new NPC('astro_scientist_crouch', 10, 22, 'npc_default', '实验室研究员', 'astro_scientist_crouch'),
  // 研究员 — 侧面
  new NPC('astro_scientist_side', 25, 12, 'npc_default', '天体物理实验室研究员', 'astro_scientist_side'),
  // 研究员 — 背侧面
  new NPC('astro_scientist_back_side', 30, 20, 'npc_default', '实验室研究员', 'astro_scientist_back_side'),
  // 研究员 — 蹲下侧面
  new NPC('astro_scientist_crouch_side', 16, 26, 'npc_default', '实验室研究员', 'astro_scientist_crouch_side'),
  // 防护服人员
  new NPC('astro_hazmat', 8, 16, 'npc_default', '隔离区人员', 'astro_hazmat'),
];
const astroItems: InteractiveItem[] = [
  // LISA 观测台 CG 事件（第二类事件）
  new InteractiveItem('lisa_cg_event', 22, 14, 'event_orb', 'LISA 观测台', 'lisa_cg_event', 'glow', true),
];

export const SCENE_ASTRO: SceneDef = createSceneDef(
  'astro', '天文观测实验室', MAP_OFFICE,
  { x: 10, y: 10 },
  astroNpcs,
  astroItems,
  [
    { x: 10, y: 19, targetScene: 'office', targetX: 10, targetY: 1 },
    { x: 20, y: 0, targetScene: 'vr', targetX: 10, targetY: 17 },
  ],
  '/world/Astro_lab.jpg',
  12,
  32,
  16,
);

// ---- VR 实验室场景 ----
const vrNpcs = [
  new NPC('vr_scientist_1', 8, 8, 'npc_default', 'VR研究员', 'astro_scientist'),
  new NPC('vr_scientist_2', 14, 6, 'npc_default', 'VR研究员', 'astro_scientist_back'),
  new NPC('vr_scientist_3', 20, 10, 'npc_default', 'VR研究员', 'astro_scientist_side'),
  new NPC('vr_scientist_4', 12, 14, 'npc_default', 'VR研究员', 'astro_scientist_crouch'),
  new NPC('vr_researcher_main', 18, 7, 'npc_default', 'VR研究员', 'researcher'),
];

export const SCENE_VR: SceneDef = createSceneDef(
  'vr', 'VR实验室', MAP_OFFICE,
  { x: 10, y: 10 },
  vrNpcs,
  [
    new InteractiveItem('vr_device', 16, 8, 'event_orb', 'VR沉浸装置', 'vr_device_event', 'glow', true),
  ],
  [
    { x: 10, y: 19, targetScene: 'astro', targetX: 10, targetY: 1 },
    { x: 0, y: 8, targetScene: 'solvay', targetX: 16, targetY: 16 },
  ],
  '/world/VR_lab.png',
  12,
  32,
  16,
);

// ============================================================
// 索尔维会议 1927
// ============================================================
const solvayNpcs: NPC[] = [
  new NPC('solvay_einstein', 10, 6, 'npc_default', '爱因斯坦', 'solvay_einstein'),
  new NPC('solvay_bohr', 16, 8, 'npc_default', '玻尔', 'solvay_bohr'),
  new NPC('solvay_curie', 14, 12, 'npc_default', '居里夫人', 'solvay_curie'),
  new NPC('solvay_heisenberg', 8, 10, 'npc_default', '海森堡', 'solvay_heisenberg'),
  new NPC('solvay_schrodinger', 12, 14, 'npc_default', '薛定谔', 'solvay_schrodinger'),
  new NPC('solvay_pauli', 6, 14, 'npc_default', '泡利', 'solvay_pauli'),
  new NPC('solvay_born', 18, 12, 'npc_default', '波恩', 'solvay_born'),
  new NPC('solvay_lorentz', 4, 8, 'npc_default', '洛伦兹', 'solvay_lorentz'),
  new NPC('solvay_de_broglie', 20, 6, 'npc_default', '德布罗意', 'solvay_de_broglie'),
];

export const SCENE_SOLVAY: SceneDef = createSceneDef(
  'solvay', '1927索尔维会议', MAP_OFFICE,
  { x: 16, y: 16 },
  solvayNpcs,
  [
    new InteractiveItem('solvay_seating', 14, 8, 'item_doc', '会场座位安排表', 'solvay_seating', 'doc', false, 'item_seating'),
    new InteractiveItem('solvay_nameplate', 10, 11, 'item_key', '科学家人物桌牌', 'solvay_nameplate', 'key', false, 'item_nameplate'),
    new InteractiveItem('solvay_diffraction', 22, 11, 'item_doc', '电子衍射累积图', 'solvay_diffraction', 'doc', false, 'item_diffraction'),
  ],
  [
    { x: 1, y: 12, targetScene: 'vr', targetX: 10, targetY: 17 },
  ],
  '/world/solvay_1927.jpg',
  12,
  32,
  24,
);

// ============================================================
// 场景注册表
// ============================================================
export const ALL_SCENES: Record<string, SceneDef> = {
  office: SCENE_OFFICE,
  arpes: SCENE_ARPES,
  astro: SCENE_ASTRO,
  vr: SCENE_VR,
  solvay: SCENE_SOLVAY,
};
