/**
 * 物品注册表 — Mod 友好
 * 增删物品只需：1) 在 items/ 下新建文件  2) 在此注册
 */
import type { ItemDef } from './types';
import { ITEM_O2 } from './item_o2';
import { ITEM_CHIP } from './item_chip';
import { ITEM_MED } from './item_med';
import { ITEM_BATTERY } from './item_battery';
import { ITEM_BIO } from './item_bio';
import { ITEM_GUN } from './item_gun';
import { ITEM_KEYCARD } from './item_keycard';
import { ITEM_ARTIFACT } from './item_artifact';
import { ITEM_EMP } from './item_emp';
import { ITEM_FOOD } from './item_food';
import { ITEM_SCANNER } from './item_scanner';
import { ITEM_EYE } from './item_eye';
import { ITEM_MEMORY_DATA } from './item_memory_data';
import { ITEM_NEURAL_INTERFACE } from './item_neural_interface';
import { ITEM_ROSTER } from './item_roster';
import { ITEM_SEATING } from './item_seating';
import { ITEM_NAMEPLATE } from './item_nameplate';
import { ITEM_PHOTO_SINGLE } from './item_photo_single';
import { ITEM_DIFFRACTION } from './item_diffraction';
import { ITEM_SPECTRUM } from './item_spectrum';
import { ITEM_WAVEFUNC } from './item_wavefunc';
import { ITEM_PHOTO_LOCAL } from './item_photo_local';
import { ITEM_BLUEPRINT_FIXED } from './item_blueprint_fixed';
import { ITEM_BLUEPRINT_MOVE } from './item_blueprint_move';

/** 所有物品定义，按 id 索引 */
export const ALL_ITEMS: Record<string, ItemDef> = {
  [ITEM_O2.id]: ITEM_O2,
  [ITEM_CHIP.id]: ITEM_CHIP,
  [ITEM_MED.id]: ITEM_MED,
  [ITEM_BATTERY.id]: ITEM_BATTERY,
  [ITEM_BIO.id]: ITEM_BIO,
  [ITEM_GUN.id]: ITEM_GUN,
  [ITEM_KEYCARD.id]: ITEM_KEYCARD,
  [ITEM_ARTIFACT.id]: ITEM_ARTIFACT,
  [ITEM_EMP.id]: ITEM_EMP,
  [ITEM_FOOD.id]: ITEM_FOOD,
  [ITEM_SCANNER.id]: ITEM_SCANNER,
  [ITEM_EYE.id]: ITEM_EYE,
  [ITEM_MEMORY_DATA.id]: ITEM_MEMORY_DATA,
  [ITEM_NEURAL_INTERFACE.id]: ITEM_NEURAL_INTERFACE,
  [ITEM_ROSTER.id]: ITEM_ROSTER,
  [ITEM_SEATING.id]: ITEM_SEATING,
  [ITEM_NAMEPLATE.id]: ITEM_NAMEPLATE,
  [ITEM_PHOTO_SINGLE.id]: ITEM_PHOTO_SINGLE,
  [ITEM_DIFFRACTION.id]: ITEM_DIFFRACTION,
  [ITEM_SPECTRUM.id]: ITEM_SPECTRUM,
  [ITEM_WAVEFUNC.id]: ITEM_WAVEFUNC,
  [ITEM_PHOTO_LOCAL.id]: ITEM_PHOTO_LOCAL,
  [ITEM_BLUEPRINT_FIXED.id]: ITEM_BLUEPRINT_FIXED,
  [ITEM_BLUEPRINT_MOVE.id]: ITEM_BLUEPRINT_MOVE,
};

export { ITEM_PALETTE } from './palette';
export { renderPixelArt } from './types';
export type { ItemDef, ItemType } from './types';
