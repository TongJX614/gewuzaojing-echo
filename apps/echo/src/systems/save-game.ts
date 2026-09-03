import type { InventorySlot } from './inventory';
import type {
  GlobalProgressState,
  ObjectiveProgress,
  QuestManagerState,
  QuestRuntime,
  QuestStatus,
  StepRuntime,
} from '../data/quests/types';

export const SAVE_SLOT_IDS = [
  'auto',
  'manual-1',
  'manual-2',
  'manual-3',
] as const;

export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];
export type ManualSaveSlotId = Exclude<SaveSlotId, 'auto'>;

export interface DroppedItemState {
  id: string;
  itemId: string;
  sceneId: string;
  x: number;
  y: number;
}

export interface GameSnapshot {
  playtimeMs: number;
  scene: {
    id: string;
    playerX: number;
    playerY: number;
  };
  player: {
    hp: number;
    exp: number;
    level: number;
  };
  inventory: InventorySlot[];
  progress: GlobalProgressState;
  quests: QuestManagerState;
  world: {
    talkedEntityIds: string[];
    collectedEntityIds: string[];
    droppedItems: DroppedItemState[];
  };
}

export interface SaveEnvelope {
  format: 'echo-save';
  version: 1;
  slotId: SaveSlotId;
  savedAt: string;
  summary: {
    sceneId: string;
    stage: string;
    playtimeMs: number;
  };
  snapshot: GameSnapshot;
}

export type SaveSlotEntry =
  | { slotId: SaveSlotId; status: 'empty' }
  | { slotId: SaveSlotId; status: 'invalid' }
  | { slotId: SaveSlotId; status: 'ready'; envelope: SaveEnvelope };

export type SaveGameErrorCode =
  | 'SAVE_WRITE_FAILED'
  | 'SAVE_DELETE_FAILED'
  | 'SAVE_DATA_INVALID'
  | 'SAVE_SCENE_INVALID';

export class SaveGameError extends Error {
  constructor(readonly code: SaveGameErrorCode) {
    super(code);
    this.name = 'SaveGameError';
  }
}

export interface SaveGameStore {
  list(): SaveSlotEntry[];
  read(slotId: SaveSlotId): SaveEnvelope | null;
  write(slotId: SaveSlotId, snapshot: GameSnapshot): SaveEnvelope;
  remove(slotId: SaveSlotId): void;
  latest(): SaveEnvelope | null;
}

const STORAGE_PREFIX = 'echo.save.v1.';
const QUEST_STATUSES = new Set<QuestStatus>([
  'locked',
  'active',
  'completed',
  'failed',
]);

export class LocalSaveGameStore implements SaveGameStore {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(): SaveSlotEntry[] {
    return SAVE_SLOT_IDS.map((slotId) => this.readEntry(slotId));
  }

  read(slotId: SaveSlotId): SaveEnvelope | null {
    const entry = this.readEntry(slotId);
    return entry.status === 'ready' ? entry.envelope : null;
  }

  write(slotId: SaveSlotId, snapshot: GameSnapshot): SaveEnvelope {
    const sanitized = sanitizeSnapshot(snapshot);
    if (!sanitized) {
      throw new SaveGameError('SAVE_DATA_INVALID');
    }

    const envelope: SaveEnvelope = {
      format: 'echo-save',
      version: 1,
      slotId,
      savedAt: this.now().toISOString(),
      summary: {
        sceneId: sanitized.scene.id,
        stage: sanitized.progress.stage,
        playtimeMs: sanitized.playtimeMs,
      },
      snapshot: sanitized,
    };

    try {
      this.storage.setItem(storageKey(slotId), JSON.stringify(envelope));
    } catch {
      throw new SaveGameError('SAVE_WRITE_FAILED');
    }
    return cloneEnvelope(envelope);
  }

  remove(slotId: SaveSlotId): void {
    try {
      this.storage.removeItem(storageKey(slotId));
    } catch {
      throw new SaveGameError('SAVE_DELETE_FAILED');
    }
  }

  latest(): SaveEnvelope | null {
    let latest: SaveEnvelope | null = null;
    for (const entry of this.list()) {
      if (entry.status !== 'ready') continue;
      if (
        latest === null
        || Date.parse(entry.envelope.savedAt) > Date.parse(latest.savedAt)
      ) {
        latest = entry.envelope;
      }
    }
    return latest ? cloneEnvelope(latest) : null;
  }

  private readEntry(slotId: SaveSlotId): SaveSlotEntry {
    let raw: string | null;
    try {
      raw = this.storage.getItem(storageKey(slotId));
    } catch {
      return { slotId, status: 'invalid' };
    }
    if (raw === null) return { slotId, status: 'empty' };

    try {
      const envelope = parseEnvelope(JSON.parse(raw), slotId);
      return envelope
        ? { slotId, status: 'ready', envelope }
        : { slotId, status: 'invalid' };
    } catch {
      return { slotId, status: 'invalid' };
    }
  }
}

function storageKey(slotId: SaveSlotId): string {
  return STORAGE_PREFIX + slotId;
}

function parseEnvelope(
  value: unknown,
  expectedSlotId: SaveSlotId,
): SaveEnvelope | null {
  if (!isRecord(value)) return null;
  if (
    value.format !== 'echo-save'
    || value.version !== 1
    || value.slotId !== expectedSlotId
    || typeof value.savedAt !== 'string'
    || !Number.isFinite(Date.parse(value.savedAt))
  ) {
    return null;
  }

  const snapshot = sanitizeSnapshot(value.snapshot);
  if (!snapshot) return null;

  return {
    format: 'echo-save',
    version: 1,
    slotId: expectedSlotId,
    savedAt: value.savedAt,
    summary: {
      sceneId: snapshot.scene.id,
      stage: snapshot.progress.stage,
      playtimeMs: snapshot.playtimeMs,
    },
    snapshot,
  };
}

function sanitizeSnapshot(value: unknown): GameSnapshot | null {
  if (!isRecord(value)) return null;
  const playtimeMs = finiteNumber(value.playtimeMs, 0);
  const scene = sanitizeScene(value.scene);
  const player = sanitizePlayer(value.player);
  const inventory = sanitizeInventory(value.inventory);
  const progress = sanitizeProgress(value.progress);
  const quests = sanitizeQuests(value.quests);
  const world = sanitizeWorld(value.world);

  if (
    playtimeMs === null
    || scene === null
    || player === null
    || inventory === null
    || progress === null
    || quests === null
    || world === null
  ) {
    return null;
  }

  return {
    playtimeMs,
    scene,
    player,
    inventory,
    progress,
    quests,
    world,
  };
}

function sanitizeScene(
  value: unknown,
): GameSnapshot['scene'] | null {
  if (!isRecord(value) || !nonEmptyString(value.id)) return null;
  const playerX = finiteNumber(value.playerX);
  const playerY = finiteNumber(value.playerY);
  if (playerX === null || playerY === null) return null;
  return { id: value.id, playerX, playerY };
}

function sanitizePlayer(
  value: unknown,
): GameSnapshot['player'] | null {
  if (!isRecord(value)) return null;
  const hp = finiteNumber(value.hp, 0);
  const exp = finiteNumber(value.exp, 0);
  const level = finiteInteger(value.level, 1);
  if (hp === null || exp === null || level === null) return null;
  return { hp, exp, level };
}

function sanitizeInventory(value: unknown): InventorySlot[] | null {
  if (!Array.isArray(value)) return null;
  const result: InventorySlot[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !nonEmptyString(candidate.itemId)) return null;
    const qty = finiteInteger(candidate.qty, 1);
    if (qty === null) return null;
    result.push({ itemId: candidate.itemId, qty });
  }
  return result;
}

function sanitizeProgress(value: unknown): GlobalProgressState | null {
  if (!isRecord(value) || !nonEmptyString(value.stage)) return null;
  const chapter = finiteInteger(value.chapter, 1);
  const totalExp = finiteNumber(value.totalExp, 0);
  const flags = stringArray(value.flags);
  const completedQuests = stringArray(value.completedQuests);
  if (
    chapter === null
    || totalExp === null
    || flags === null
    || completedQuests === null
  ) {
    return null;
  }
  return {
    chapter,
    stage: value.stage,
    flags,
    completedQuests,
    totalExp,
  };
}

function sanitizeQuests(value: unknown): QuestManagerState | null {
  if (!isRecord(value) || !Array.isArray(value.questRuntimes)) return null;
  if (
    value.trackedQuestId !== null
    && value.trackedQuestId !== undefined
    && typeof value.trackedQuestId !== 'string'
  ) {
    return null;
  }

  const questRuntimes: QuestRuntime[] = [];
  for (const candidate of value.questRuntimes) {
    const runtime = sanitizeQuestRuntime(candidate);
    if (!runtime) return null;
    questRuntimes.push(runtime);
  }
  return {
    questRuntimes,
    trackedQuestId:
      typeof value.trackedQuestId === 'string' ? value.trackedQuestId : null,
  };
}

function sanitizeQuestRuntime(value: unknown): QuestRuntime | null {
  if (
    !isRecord(value)
    || !nonEmptyString(value.questId)
    || typeof value.status !== 'string'
    || !QUEST_STATUSES.has(value.status as QuestStatus)
    || !Array.isArray(value.steps)
  ) {
    return null;
  }

  const currentStepIndex = finiteInteger(value.currentStepIndex, 0);
  const startedAt = finiteNumber(value.startedAt, 0);
  const completedAt =
    value.completedAt === undefined
      ? undefined
      : finiteNumber(value.completedAt, 0);
  if (
    currentStepIndex === null
    || startedAt === null
    || completedAt === null
  ) {
    return null;
  }

  const steps: StepRuntime[] = [];
  for (const candidate of value.steps) {
    const step = sanitizeStepRuntime(candidate);
    if (!step) return null;
    steps.push(step);
  }

  return {
    questId: value.questId,
    status: value.status as QuestStatus,
    currentStepIndex,
    ...(typeof value.currentStepId === 'string'
      ? { currentStepId: value.currentStepId }
      : {}),
    steps,
    startedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function sanitizeStepRuntime(value: unknown): StepRuntime | null {
  if (
    !isRecord(value)
    || !nonEmptyString(value.stepId)
    || typeof value.done !== 'boolean'
    || !Array.isArray(value.objectives)
  ) {
    return null;
  }
  const objectives: ObjectiveProgress[] = [];
  for (const candidate of value.objectives) {
    const objective = sanitizeObjectiveProgress(candidate);
    if (!objective) return null;
    objectives.push(objective);
  }
  return { stepId: value.stepId, objectives, done: value.done };
}

function sanitizeObjectiveProgress(
  value: unknown,
): ObjectiveProgress | null {
  if (!isRecord(value) || typeof value.done !== 'boolean') return null;
  const index = finiteInteger(value.index, 0);
  const current = finiteNumber(value.current, 0);
  if (index === null || current === null) return null;
  return {
    index,
    ...(typeof value.objectiveId === 'string'
      ? { objectiveId: value.objectiveId }
      : {}),
    current,
    done: value.done,
  };
}

function sanitizeWorld(value: unknown): GameSnapshot['world'] | null {
  if (!isRecord(value)) return null;
  const talkedEntityIds = stringArray(value.talkedEntityIds);
  const collectedEntityIds = stringArray(value.collectedEntityIds);
  if (
    talkedEntityIds === null
    || collectedEntityIds === null
    || !Array.isArray(value.droppedItems)
  ) {
    return null;
  }

  const droppedItems: DroppedItemState[] = [];
  for (const candidate of value.droppedItems) {
    if (
      !isRecord(candidate)
      || !nonEmptyString(candidate.id)
      || !nonEmptyString(candidate.itemId)
      || !nonEmptyString(candidate.sceneId)
    ) {
      return null;
    }
    const x = finiteNumber(candidate.x);
    const y = finiteNumber(candidate.y);
    if (x === null || y === null) return null;
    droppedItems.push({
      id: candidate.id,
      itemId: candidate.itemId,
      sceneId: candidate.sceneId,
      x,
      y,
    });
  }

  return { talkedEntityIds, collectedEntityIds, droppedItems };
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null;
  }
  return [...new Set(value.filter((item) => item.trim().length > 0))];
}

function finiteNumber(value: unknown, minimum?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (minimum !== undefined && value < minimum) return null;
  return value;
}

function finiteInteger(value: unknown, minimum: number): number | null {
  const number = finiteNumber(value, minimum);
  return number === null ? null : Math.trunc(number);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneEnvelope(envelope: SaveEnvelope): SaveEnvelope {
  return structuredClone(envelope);
}
