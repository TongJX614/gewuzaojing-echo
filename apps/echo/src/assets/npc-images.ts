// ============================================================
// NPC 贴图加载器（支持 front / side / back 多视角）
// ============================================================

import type { NpcSpriteVariant } from '../types/npc';
export type { NpcSpriteVariant };

/** 一个 NPC 的可用贴图集合：只登记实际存在的图片 */
export interface NpcSpriteSet {
  front: string;
  side?: string;
  back?: string;
}

export const NPC_SPRITE_SETS: Record<string, NpcSpriteSet> = {
  lin_xiao: { front: '/npc/lin_xiao.png' },
  // Astro Lab NPCs (7 sprites, 2 distinct characters)
  astro_scientist: { front: '/npc/astro_lab/NPC_Astro_lab_1.png' },
  astro_scientist_back: { front: '/npc/astro_lab/NPC_Astro_lab_2.png' },
  astro_scientist_crouch: { front: '/npc/astro_lab/NPC_Astro_lab_3.png' },
  astro_scientist_side: { front: '/npc/astro_lab/NPC_Astro_lab_4.png' },
  astro_scientist_back_side: { front: '/npc/astro_lab/NPC_Astro_lab_5.png' },
  astro_scientist_crouch_side: { front: '/npc/astro_lab/NPC_Astro_lab_6.png' },
  astro_hazmat: { front: '/npc/astro_lab/NPC_Astro_lab_7.png' },
  // VR Lab NPCs (reuse Astro Lab sprites)
  vr_scientist_1: { front: '/npc/astro_lab/NPC_Astro_lab_1.png' },
  vr_scientist_2: { front: '/npc/astro_lab/NPC_Astro_lab_2.png' },
  vr_scientist_3: { front: '/npc/astro_lab/NPC_Astro_lab_4.png' },
  vr_scientist_4: { front: '/npc/astro_lab/NPC_Astro_lab_3.png' },
  vr_researcher_main: { front: '/npc/vr_lab/npc_vr_researcher.png' },
  // Solvay 1927 NPCs（当前只有正面图；放入 side/back 素材后在此登记即可）
  solvay_einstein: { front: '/npc/solvay/einstein.png', side: '/npc/solvay/einstein_side.png', back: '/npc/solvay/einstein_back.png' },
  solvay_bohr: { front: '/npc/solvay/bohr.png', side: '/npc/solvay/bohr_side.png', back: '/npc/solvay/bohr_back.png' },
  solvay_curie: { front: '/npc/solvay/curie.png', back: '/npc/solvay/curie_back.png' },
  solvay_heisenberg: { front: '/npc/solvay/heisenberg.png', side: '/npc/solvay/heisenberg_side.png', back: '/npc/solvay/heisenberg_back.png' },
  solvay_schrodinger: { front: '/npc/solvay/schrodinger.png', side: '/npc/solvay/schrodinger_side.png' },
  solvay_pauli: { front: '/npc/solvay/pauli.png', side: '/npc/solvay/pauli_side.png' },
  solvay_born: { front: '/npc/solvay/born.png', side: '/npc/solvay/born_side.png' },
  solvay_lorentz: { front: '/npc/solvay/lorentz.png', side: '/npc/solvay/lorentz_side.png' },
  solvay_de_broglie: { front: '/npc/solvay/de_broglie.png' },
};

/** 缓存 key 必须包含 variant，避免不同视角互相覆盖 */
const npcImageCache: Record<string, HTMLImageElement> = {};
const cacheKey = (npcId: string, variant: NpcSpriteVariant) => `${npcId}:${variant}`;

/** 该 NPC 实际可用的视角列表（只返回已登记的） */
export function getNpcSpriteVariants(npcId: string): NpcSpriteVariant[] {
  const set = NPC_SPRITE_SETS[npcId];
  if (!set) return [];
  return (['front', 'side', 'back'] as NpcSpriteVariant[]).filter(v => Boolean(set[v]));
}

/** 某视角的贴图 URL；缺失时回退 front，再回退 null */
export function getNpcSpriteUrl(npcId: string, variant: NpcSpriteVariant): string | null {
  const set = NPC_SPRITE_SETS[npcId];
  if (!set) return null;
  return set[variant] ?? set.front ?? null;
}

/** 预加载指定 NPC + 视角的贴图 */
export function preloadNpcImage(npcId: string, variant: NpcSpriteVariant = 'front'): Promise<HTMLImageElement | null> {
  const url = getNpcSpriteUrl(npcId, variant);
  if (!url) return Promise.resolve(null);
  const key = cacheKey(npcId, variant);
  if (npcImageCache[key]) return Promise.resolve(npcImageCache[key]);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      npcImageCache[key] = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** 获取已缓存的贴图（同步，可能为 null）。variant 缺失时回退 front */
export function getNpcImage(npcId: string, variant: NpcSpriteVariant = 'front'): HTMLImageElement | null {
  return npcImageCache[cacheKey(npcId, variant)] ?? npcImageCache[cacheKey(npcId, 'front')] ?? null;
}

/** 预加载所有 NPC 的全部已登记视角 */
export function preloadAllNpcImages(): Promise<void> {
  const jobs: Promise<HTMLImageElement | null>[] = [];
  for (const [id, set] of Object.entries(NPC_SPRITE_SETS)) {
    for (const v of ['front', 'side', 'back'] as NpcSpriteVariant[]) {
      if (set[v]) jobs.push(preloadNpcImage(id, v));
    }
  }
  return Promise.all(jobs).then(() => {});
}
