import { buildProjectTwoEntryUrl } from '../data/vr-experiences';
import type {
  LaunchVrExperienceRequest,
  PreparedVrExperience,
} from '../types/vr-experience';

export function prepareVrExperience(
  request: LaunchVrExperienceRequest,
): PreparedVrExperience {
  const url = buildProjectTwoEntryUrl(request);
  return url ? { status: 'ready', url } : { status: 'invalid' };
}
