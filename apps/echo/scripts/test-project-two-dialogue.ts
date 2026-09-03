import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALL_DIALOGUES,
  DIALOGUE_VR_DEVICE_CG,
  type DialogueChoice,
} from '../src/data/dialogues';
import {
  getProjectTwoCanonicalBrief,
  PROJECT_TWO_ROLE_LABELS,
  PROJECT_TWO_THEME_LABELS,
} from '../src/data/vr-experiences';
import type {
  ProjectTwoRoleId,
  ProjectTwoThemeId,
} from '../src/types/vr-experience';

const deviceTrees = ALL_DIALOGUES.filter(
  tree => tree.scene === 'vr' && tree.trigger === 'vr_device_event',
);
assert.equal(deviceTrees.length, 1);
const tree = DIALOGUE_VR_DEVICE_CG;
assert.equal(deviceTrees[0], tree);
assert.equal(tree.scene, 'vr');
assert.equal(tree.trigger, 'vr_device_event');
assert.equal(tree.startNode, 'node_vr_cg_start');
assert.ok(tree.nodes[tree.startNode]);
assert.equal(
  ALL_DIALOGUES.some(
    candidate => candidate.scene === 'vr' && candidate.trigger === 'researcher',
  ),
  false,
);

const externalTargets = new Set(['__enter_solvay__']);
for (const node of Object.values(tree.nodes)) {
  if (node.next && !externalTargets.has(node.next)) {
    assert.ok(tree.nodes[node.next], `${node.id} -> ${node.next}`);
  }
  for (const choice of node.choices ?? []) {
    if (!externalTargets.has(choice.next)) {
      assert.ok(
        tree.nodes[choice.next],
        `${node.id} -> ${choice.next}`,
      );
    }
  }
}

assert.equal(
  tree.nodes.node_vr_cg_start.next,
  'node_vr_choose_experience',
);
const selectorNode = tree.nodes.node_vr_choose_experience;
assert.ok(selectorNode, 'VR device must expose its experience selector');
assert.deepEqual(
  selectorNode.choices?.map(choice => ({
    text: choice.text,
    next: choice.next,
  })),
  [
    { text: '体验现有世界', next: 'node_vr_enter' },
    { text: '世界编织', next: 'p2_intro' },
    { text: '暂时离开', next: 'node_vr_decline' },
  ],
);
assert.equal(tree.nodes.p2_intro.choices?.[2]?.next, 'node_vr_choose_experience');
assert.equal(
  tree.nodes.p2_difference.choices?.[1]?.next,
  'node_vr_choose_experience',
);

const themes = Object.keys(PROJECT_TWO_THEME_LABELS) as ProjectTwoThemeId[];
const roles = Object.keys(PROJECT_TWO_ROLE_LABELS) as ProjectTwoRoleId[];
const themeNodeIds: Record<ProjectTwoThemeId, string> = {
  'observation-reality': 'p2_role_observation',
  'memory-identity': 'p2_role_memory',
  'energy-civilization': 'p2_role_energy',
};
const confirmPrefix: Record<ProjectTwoThemeId, string> = {
  'observation-reality': 'observation',
  'memory-identity': 'memory',
  'energy-civilization': 'energy',
};

const reachedConfirmNodes = new Set<string>();
for (const themeId of themes) {
  const roleNode = tree.nodes[themeNodeIds[themeId]];
  assert.ok(roleNode);
  assert.equal(roleNode.choices?.length, 3);
  for (const choice of roleNode.choices ?? []) {
    reachedConfirmNodes.add(choice.next);
  }

  for (const roleId of roles) {
    const suffix = `${confirmPrefix[themeId]}_${roleId}`;
    const confirmId = `p2_confirm_${suffix}`;
    const modifyId = `p2_modify_${suffix}`;
    const confirmNode = tree.nodes[confirmId];
    const modifyNode = tree.nodes[modifyId];
    assert.ok(confirmNode, confirmId);
    assert.ok(modifyNode, modifyId);
    const selection = { schemaVersion: 1, themeId, roleId } as const;
    const brief = getProjectTwoCanonicalBrief(selection);
    assert.ok(brief);
    assert.deepEqual(
      confirmNode.lines.map(line => line.text),
      [
        '坐标已经成形。我把你的选择收束成了这份简报。',
        brief,
        '它不是既定剧情，只是生成时必须守住的起点。QuillForge 会据此扩展人物、地点与事件；沉浸舱会先呈现世界书摘要，等你审阅后再决定是否进入。',
      ],
    );
    assert.equal(confirmNode.choices?.length, 3);
    const [launchChoice, changeChoice, declineChoice] =
      confirmNode.choices as DialogueChoice[];
    assert.equal(
      launchChoice.text,
      '确认这份简报，接入项目二。',
    );
    assert.equal(launchChoice.next, 'p2_after_launch');
    assert.equal(changeChoice.next, modifyId);
    assert.equal(declineChoice.next, 'p2_decline');
    assert.equal(launchChoice.actions?.length, 1);
    const [action] = launchChoice.actions ?? [];
    assert.deepEqual(action, {
      type: 'launch_vr_experience',
      experienceId: 'quillforge-webui',
      projectTwo: selection,
    });
    assert.deepEqual(Object.keys(action).sort(), [
      'experienceId',
      'projectTwo',
      'type',
    ]);
    assert.deepEqual(Object.keys(action.projectTwo).sort(), [
      'roleId',
      'schemaVersion',
      'themeId',
    ]);
    assert.equal(JSON.stringify(action).includes('prompt'), false);
    assert.equal(JSON.stringify(action).includes('url'), false);
    assert.equal(JSON.stringify(action).includes('path'), false);
    assert.equal(JSON.stringify(action).includes('key'), false);
    assert.equal(JSON.stringify(action).includes('script_id'), false);
    assert.deepEqual(
      modifyNode.choices?.map(choice => choice.next),
      ['p2_theme', themeNodeIds[themeId], confirmId],
    );
    assert.equal(
      modifyNode.choices?.some(choice => choice.actions?.length),
      false,
    );
  }
}
assert.equal(reachedConfirmNodes.size, 9);

const launchChoices = Object.values(tree.nodes)
  .flatMap(node => node.choices ?? [])
  .filter(choice =>
    choice.actions?.some(action => action.type === 'launch_vr_experience'),
  );
assert.equal(launchChoices.length, 9);
assert.deepEqual(
  tree.nodes.p2_after_launch.lines.map(line => line.text),
  ['项目二已经接入沉浸舱。世界书是否生成完成、是否进入故事，都以舱内实际显示为准。'],
);
assert.equal(tree.nodes.p2_after_launch.choices, undefined);
assert.deepEqual(
  tree.nodes.p2_decline.lines.map(line => line.text),
  [
    '当然。装置不会替你作决定。等你有一个真正想追问的问题，再回来。',
    '索尔维会议体验仍按原来的方式开放。',
  ],
);

assert.equal(
  DIALOGUE_VR_DEVICE_CG.nodes.node_vr_enter.choices?.[0]?.next,
  '__enter_solvay__',
);

const scenesSource = readFileSync(
  new URL('../src/scenes/scenes.ts', import.meta.url),
  'utf8',
);
assert.match(
  scenesSource,
  /new NPC\('vr_researcher_main', 18, 7, 'npc_default', 'VR研究员', 'researcher'\)/u,
);

const dialogueUiSource = readFileSync(
  new URL('../src/ui/dialogue-ui.ts', import.meta.url),
  'utf8',
);
assert.equal(
  [...dialogueUiSource.matchAll(/researcher:\s*'VR研究员'/gu)].length,
  3,
  'researcher display name must stay consistent in the dialogue, history, and notification views',
);

console.log('PROJECT_TWO_DIALOGUE=PASS');
