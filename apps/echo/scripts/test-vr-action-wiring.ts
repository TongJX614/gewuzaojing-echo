import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACTION_SCHEMA,
  type NarrativeAction,
} from '../src/systems/condition-action';

const approvedAction: NarrativeAction = {
  type: 'launch_vr_experience',
  experienceId: 'quillforge-webui',
  projectTwo: {
    schemaVersion: 1,
    themeId: 'observation-reality',
    roleId: 'witness',
  },
};
assert.deepEqual(approvedAction, {
  type: 'launch_vr_experience',
  experienceId: 'quillforge-webui',
  projectTwo: {
    schemaVersion: 1,
    themeId: 'observation-reality',
    roleId: 'witness',
  },
});
assert.deepEqual(ACTION_SCHEMA.launch_vr_experience, {
  params: ['experienceId', 'projectTwo'],
  required: ['experienceId', 'projectTwo'],
  ref: null,
});

const engineSource = readFileSync(
  new URL('../src/game/engine.ts', import.meta.url),
  'utf8',
);
assert.match(engineSource, /import \{ prepareVrExperience \}/u);
assert.match(engineSource, /case 'launch_vr_experience': \{/u);
assert.match(engineSource, /this\.minigameOverlay\.openWebExperience\(/u);
assert.doesNotMatch(engineSource, /window\.open/u);
assert.doesNotMatch(engineSource, /about:blank/u);
assert.doesNotMatch(engineSource, /允许弹窗|新窗口没有出现/u);
assert.match(engineSource, /if \(choice\.next === '__enter_solvay__'\)/u);

const launchCaseMatch = engineSource.match(
  /case 'launch_vr_experience': \{([\s\S]*?)\r?\n\s*\}\r?\n\s*case /u,
);
assert.ok(launchCaseMatch);
const launchCase = launchCaseMatch[1];
assert.equal((launchCase.match(/prepareVrExperience\(/gu) ?? []).length, 1);
assert.equal(
  (launchCase.match(/this\.minigameOverlay\.openWebExperience\(/gu) ?? [])
    .length,
  1,
);
for (const forbiddenStateMutation of [
  'progressManager',
  'questManager',
  'inventorySystem',
  'stageManager',
  'startTransition',
  'switchScene',
  'player.',
  'save',
]) {
  assert.equal(
    launchCase.includes(forbiddenStateMutation),
    false,
    forbiddenStateMutation,
  );
}

for (const message of [
  '入口参数没有通过校验，我没有接入这份简报。请重新选择。',
  '项目二链路正在舱内载入；世界书仍需由你审阅确认。',
  '已退出项目二，返回 VR 实验室。',
]) {
  assert.equal(engineSource.includes(message), true);
}

const dialogueDataSource = readFileSync(
  new URL('../src/data/dialogues.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(dialogueDataSource, /新窗口/u);
assert.match(dialogueDataSource, /沉浸舱会先呈现世界书摘要/u);
assert.match(dialogueDataSource, /确认这份简报，接入项目二/u);

const dialogueSource = readFileSync(
  new URL('../src/systems/dialogue.ts', import.meta.url),
  'utf8',
);
const chooseStart = dialogueSource.indexOf(
  'choose(choice: DialogueChoice): void',
);
const actionsIndex = dialogueSource.indexOf(
  'this.onActions(choice.actions)',
  chooseStart,
);
const navigationIndex = dialogueSource.indexOf(
  'this.jumpToNode(choice.next)',
  chooseStart,
);
assert.ok(chooseStart >= 0);
assert.ok(actionsIndex > chooseStart);
assert.ok(navigationIndex > actionsIndex);
assert.match(
  engineSource,
  /setOnActions\(\(actions: NarrativeAction\[\]\) => this\.executeActions\(actions\)\)/u,
);
assert.match(
  engineSource,
  /public executeActions\(actions: NarrativeAction\[\]\): void \{[\s\S]*?this\.executeAction\(action\)/u,
);

console.log('VR_ACTION_WIRING=PASS');
