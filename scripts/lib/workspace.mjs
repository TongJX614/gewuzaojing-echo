import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export function findWorkspaceRoot(startPath) {
  let current = resolve(startPath);
  for (;;) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'shared/contracts/environment.json'))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error('AGGREGATION_ROOT_NOT_FOUND');
    current = parent;
  }
}

export function resolveEnvFile(root, environment = process.env) {
  const override = environment.GEWUZAOJING_ENV_FILE;
  if (override !== undefined && !isAbsolute(override)) throw new Error('ENV_PATH_NOT_ABSOLUTE');
  return resolve(override ?? join(root, '.env'));
}

export function pythonExecutable(root) {
  return process.platform === 'win32'
    ? join(root, '.venv', 'Scripts', 'python.exe')
    : join(root, '.venv', 'bin', 'python');
}

export function pnpmInvocation(args = []) {
  if (process.platform !== 'win32') return { command: 'pnpm', args };
  const corepack = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  if (!existsSync(corepack)) throw new Error(`COREPACK_ENTRY_MISSING:${corepack}`);
  return { command: process.execPath, args: [corepack, 'pnpm', ...args] };
}

export function buildServiceSpecs(root, envFile, python = pythonExecutable(root)) {
  const sharedEnv = { ...process.env, GEWUZAOJING_ENV_FILE: envFile };
  const echoCommand = pnpmInvocation(['--dir', join(root, 'apps/echo'), 'dev']);
  return [
    {
      name: 'quillforge', command: python, args: [join(root, 'apps/quillforge/server_start.py')],
      cwd: join(root, 'apps/quillforge'), host: '127.0.0.1', port: 8050,
      readyUrl: 'http://127.0.0.1:8050/', env: sharedEnv,
    },
    {
      name: 'echo', command: echoCommand.command, args: echoCommand.args, cwd: root,
      host: '127.0.0.1', port: 5000, readyUrl: 'http://127.0.0.1:5000/', env: sharedEnv,
    },
  ];
}

export function assertToolVersions({ node = process.versions.node, pnpm, python }) {
  if (Number(node.split('.')[0]) !== 24) throw new Error(`NODE_VERSION:${node}`);
  if (Number(pnpm.split('.')[0]) < 9) throw new Error(`PNPM_VERSION:${pnpm}`);
  if (!/^3\.11(?:\.|$)/u.test(python)) throw new Error(`PYTHON_VERSION:${python}`);
}
