import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot, pnpmInvocation, pythonExecutable } from './lib/workspace.mjs';

const root = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const run = (command, args, env = process.env) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });
const runPnpm = (args) => {
  const invocation = pnpmInvocation(args);
  run(invocation.command, invocation.args);
};
const rootTests = readdirSync(`${root}/tests`)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);
const quillForgeJsTests = readdirSync(`${root}/apps/quillforge/tests_js`)
  .filter((name) => name.endsWith('.test.cjs'))
  .sort()
  .map((name) => `apps/quillforge/tests_js/${name}`);
run('node', ['--test', ...rootTests]);
run('node', ['scripts/check-repository.mjs']);
run('node', ['scripts/check-content-manifest.mjs']);
runPnpm(['--dir', 'apps/echo', 'test']);
runPnpm(['--dir', 'apps/echo', 'run', 'validate']);
runPnpm(['--dir', 'apps/echo', 'run', 'build']);
run(pythonExecutable(root), ['-m', 'pytest', 'apps/quillforge/tests', '-q', '-m', 'not live'], {
  ...process.env,
  PYTHONUTF8: '1',
  PYTHONPATH: [join(root, 'apps/quillforge/src'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
});
run('node', ['--test', ...quillForgeJsTests]);
run('node', ['scripts/integration-smoke.mjs']);
console.log('WORKSPACE_TEST=PASS');
