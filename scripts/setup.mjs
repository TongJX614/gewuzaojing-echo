import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertToolVersions, findWorkspaceRoot, pnpmInvocation, pythonExecutable } from './lib/workspace.mjs';

const root = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const utf8Environment = { ...process.env, PYTHONUTF8: '1' };
const output = (command, args) => execFileSync(command, args, {
  cwd: root, env: utf8Environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
}).trim();
const pnpmVersionCommand = pnpmInvocation(['--version']);
const pnpmVersion = output(pnpmVersionCommand.command, pnpmVersionCommand.args);
const python = pythonExecutable(root);
if (!existsSync(python)) {
  const launcher = process.platform === 'win32' ? 'py.exe' : 'python3';
  execFileSync(launcher, process.platform === 'win32' ? ['-3.11', '-m', 'venv', '.venv'] : ['-m', 'venv', '.venv'], {
    cwd: root, env: utf8Environment, stdio: 'inherit',
  });
}
const pythonVersion = output(python, ['-c', 'import platform; print(platform.python_version())']);
assertToolVersions({ pnpm: pnpmVersion, python: pythonVersion });
const pnpmInstall = pnpmInvocation(['install', '--frozen-lockfile']);
execFileSync(pnpmInstall.command, pnpmInstall.args, { cwd: root, stdio: 'inherit' });
execFileSync(python, ['-m', 'pip', 'install', '-r', 'apps/quillforge/requirements.txt'], {
  cwd: root, env: utf8Environment, stdio: 'inherit',
});
console.log('SETUP=PASS');
