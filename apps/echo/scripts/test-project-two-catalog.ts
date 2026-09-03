import assert from 'node:assert/strict';

import {
  PROJECT_TWO_CANONICAL_BRIEFS,
  PROJECT_TWO_ROLE_LABELS,
  PROJECT_TWO_THEME_LABELS,
  buildProjectTwoEntryUrl,
  getProjectTwoCanonicalBrief,
  isProjectTwoSelection,
} from '../src/data/vr-experiences';
import type {
  LaunchVrExperienceRequest,
  ProjectTwoRoleId,
  ProjectTwoThemeId,
} from '../src/types/vr-experience';

const expectedBriefs = {
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

const themeIds = Object.keys(
  PROJECT_TWO_THEME_LABELS,
) as ProjectTwoThemeId[];
const roleIds = Object.keys(PROJECT_TWO_ROLE_LABELS) as ProjectTwoRoleId[];
assert.deepEqual(themeIds, [
  'observation-reality',
  'memory-identity',
  'energy-civilization',
]);
assert.deepEqual(roleIds, ['witness', 'calibrator', 'participant']);
assert.deepEqual(PROJECT_TWO_THEME_LABELS, {
  'observation-reality': '观测与真实',
  'memory-identity': '记忆与身份',
  'energy-civilization': '能量与文明',
});
assert.deepEqual(PROJECT_TWO_ROLE_LABELS, {
  witness: '旁证者',
  calibrator: '校准员',
  participant: '当事人',
});
assert.deepEqual(PROJECT_TWO_CANONICAL_BRIEFS, expectedBriefs);

const pairs = new Set<string>();
for (const themeId of themeIds) {
  for (const roleId of roleIds) {
    const projectTwo = { schemaVersion: 1, themeId, roleId } as const;
    assert.equal(isProjectTwoSelection(projectTwo), true);
    pairs.add(`${themeId}:${roleId}`);
    assert.equal(
      getProjectTwoCanonicalBrief(projectTwo),
      expectedBriefs[themeId][roleId],
    );

    const request: LaunchVrExperienceRequest = {
      experienceId: 'quillforge-webui',
      projectTwo,
    };
    const rawUrl = buildProjectTwoEntryUrl(request);
    assert.ok(rawUrl);
    const url = new URL(rawUrl);
    assert.equal(url.origin, 'http://127.0.0.1:8050');
    assert.equal(url.pathname, '/');
    assert.deepEqual([...url.searchParams.entries()], [
      ['entry', 'echo-project-2'],
      ['v', '1'],
      ['theme', themeId],
      ['role', roleId],
    ]);
    assert.ok([...url.search].length <= 256);
    for (const forbiddenKey of [
      'prompt',
      'path',
      'key',
      'url',
      'script_id',
    ]) {
      assert.equal(url.searchParams.has(forbiddenKey), false);
    }
    assert.equal(rawUrl.includes(expectedBriefs[themeId][roleId]), false);
  }
}
assert.equal(pairs.size, 9);

for (const malformed of [
  null,
  {},
  { schemaVersion: 2, themeId: 'memory-identity', roleId: 'witness' },
  { schemaVersion: 1, themeId: 'unknown', roleId: 'witness' },
  { schemaVersion: 1, themeId: 'memory-identity', roleId: 'unknown' },
  {
    schemaVersion: 1,
    themeId: 'memory-identity',
    roleId: 'witness',
    prompt: 'should-not-pass',
  },
]) {
  assert.equal(isProjectTwoSelection(malformed), false);
}

for (const malformed of [
  {
    experienceId: 'solvay-dlc',
    projectTwo: {
      schemaVersion: 1,
      themeId: 'memory-identity',
      roleId: 'witness',
    },
  },
  {
    experienceId: 'quillforge-webui',
    projectTwo: {
      schemaVersion: 2,
      themeId: 'memory-identity',
      roleId: 'witness',
    },
  },
  {
    experienceId: 'quillforge-webui',
    projectTwo: {
      schemaVersion: 1,
      themeId: 'memory-identity',
      roleId: 'witness',
    },
    targetUrl: 'https://attacker.example',
  },
]) {
  assert.equal(
    buildProjectTwoEntryUrl(malformed as unknown as LaunchVrExperienceRequest),
    undefined,
  );
}

console.log('PROJECT_TWO_CATALOG=PASS');
