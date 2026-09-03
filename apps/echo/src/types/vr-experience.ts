export type ProjectTwoThemeId =
  | 'observation-reality'
  | 'memory-identity'
  | 'energy-civilization';

export type ProjectTwoRoleId = 'witness' | 'calibrator' | 'participant';

export interface ProjectTwoSelection {
  schemaVersion: 1;
  themeId: ProjectTwoThemeId;
  roleId: ProjectTwoRoleId;
}

export interface LaunchVrExperienceRequest {
  experienceId: 'quillforge-webui';
  projectTwo: ProjectTwoSelection;
}

export type PreparedVrExperience =
  | { status: 'ready'; url: string }
  | { status: 'invalid' };
