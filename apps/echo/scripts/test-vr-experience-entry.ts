import assert from 'node:assert/strict';

import { prepareVrExperience } from '../src/systems/vr-experience';
import type { LaunchVrExperienceRequest } from '../src/types/vr-experience';

const request: LaunchVrExperienceRequest = {
  experienceId: 'quillforge-webui',
  projectTwo: {
    schemaVersion: 1,
    themeId: 'observation-reality',
    roleId: 'witness',
  },
};
const expectedUrl =
  'http://127.0.0.1:8050/?entry=echo-project-2&v=1&theme=observation-reality&role=witness';

assert.deepEqual(prepareVrExperience(request), {
  status: 'ready',
  url: expectedUrl,
});
assert.deepEqual(
  prepareVrExperience({
    ...request,
    projectTwo: { ...request.projectTwo, roleId: 'intruder' },
  } as unknown as LaunchVrExperienceRequest),
  { status: 'invalid' },
);
assert.equal(prepareVrExperience.toString().includes('window.open'), false);
assert.equal(prepareVrExperience.toString().includes('about:blank'), false);

console.log('VR_EXPERIENCE_PREPARE=PASS');
