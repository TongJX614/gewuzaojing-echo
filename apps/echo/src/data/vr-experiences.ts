import type {
  LaunchVrExperienceRequest,
  ProjectTwoRoleId,
  ProjectTwoSelection,
  ProjectTwoThemeId,
} from '../types/vr-experience';

const PROJECT_TWO_ENTRY_ORIGIN = 'http://127.0.0.1:8050';
const PROJECT_TWO_ENTRY_NAME = 'echo-project-2';
const PROJECT_TWO_MAX_QUERY_LENGTH = 256;

export const PROJECT_TWO_THEME_LABELS = {
  'observation-reality': '观测与真实',
  'memory-identity': '记忆与身份',
  'energy-civilization': '能量与文明',
} as const;

export const PROJECT_TWO_ROLE_LABELS = {
  witness: '旁证者',
  calibrator: '校准员',
  participant: '当事人',
} as const;

export const PROJECT_TWO_CANONICAL_BRIEFS = {
  'observation-reality': {
    witness:
      '一个观测会改变被观测现实的世界。你追踪互相矛盾的证据，并检验“不干预”是否真的可能。',
    calibrator:
      '一个观测会改变被观测现实的世界。你修复失真的观测链，却必须决定哪一种现实值得保留。',
    participant:
      '一个观测会改变被观测现实的世界。你卷入冲突，并逐渐怀疑自己是否也是一次观测的产物。',
  },
  'memory-identity': {
    witness:
      '一个记忆可以复制、删改和重放的世界。你整理彼此冲突的记忆证词，寻找身份连续性的证据。',
    calibrator:
      '一个记忆可以复制、删改和重放的世界。你修复记忆异常，却必须判断哪些遗忘不该被纠正。',
    participant:
      '一个记忆可以复制、删改和重放的世界。你发现自己的过去存在多个版本，必须决定哪一份记忆构成“我”。',
  },
  'energy-civilization': {
    witness:
      '一个以有限能源维系生存与探索的封闭文明。你记录每次分配的得失，并追问中立是否也是一种选择。',
    calibrator:
      '一个以有限能源维系生存与探索的封闭文明。你重建失衡系统，却必须决定谁先获得能源、谁承担代价。',
    participant:
      '一个以有限能源维系生存与探索的封闭文明。你被置于关键配给之中，而个人生存与文明远行无法同时得到保证。',
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(key => expectedKeys.includes(key))
  );
}

function isThemeId(value: unknown): value is ProjectTwoThemeId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PROJECT_TWO_THEME_LABELS, value)
  );
}

function isRoleId(value: unknown): value is ProjectTwoRoleId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PROJECT_TWO_ROLE_LABELS, value)
  );
}

export function isProjectTwoSelection(
  value: unknown,
): value is ProjectTwoSelection {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['schemaVersion', 'themeId', 'roleId']) &&
    value.schemaVersion === 1 &&
    isThemeId(value.themeId) &&
    isRoleId(value.roleId)
  );
}

export function getProjectTwoCanonicalBrief(
  selection: ProjectTwoSelection,
): string | undefined {
  if (!isProjectTwoSelection(selection)) return undefined;
  return PROJECT_TWO_CANONICAL_BRIEFS[selection.themeId][selection.roleId];
}

export function buildProjectTwoEntryUrl(
  request: LaunchVrExperienceRequest,
): string | undefined {
  if (
    !isRecord(request) ||
    !hasExactKeys(request, ['experienceId', 'projectTwo']) ||
    request.experienceId !== 'quillforge-webui' ||
    !isProjectTwoSelection(request.projectTwo)
  ) {
    return undefined;
  }

  const url = new URL('/', PROJECT_TWO_ENTRY_ORIGIN);
  if (url.origin !== PROJECT_TWO_ENTRY_ORIGIN) return undefined;
  url.searchParams.set('entry', PROJECT_TWO_ENTRY_NAME);
  url.searchParams.set('v', String(request.projectTwo.schemaVersion));
  url.searchParams.set('theme', request.projectTwo.themeId);
  url.searchParams.set('role', request.projectTwo.roleId);
  if ([...url.search].length > PROJECT_TWO_MAX_QUERY_LENGTH) return undefined;
  return url.toString();
}
