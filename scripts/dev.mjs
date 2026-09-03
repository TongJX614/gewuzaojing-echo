import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServiceSpecs, findWorkspaceRoot, pnpmInvocation, pythonExecutable, resolveEnvFile } from './lib/workspace.mjs';
import { runSupervised } from './lib/process-supervisor.mjs';

const root = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const envFile = resolveEnvFile(root);
if (!existsSync(envFile)) throw new Error(`ENV_FILE_MISSING:${envFile}`);
const environment = { ...process.env, GEWUZAOJING_ENV_FILE: envFile, PYTHONUTF8: '1' };
const echoValidation = pnpmInvocation(['--dir', 'apps/echo', 'env:validate']);
execFileSync(echoValidation.command, echoValidation.args, { cwd: root, env: environment, stdio: 'inherit' });
execFileSync(pythonExecutable(root), ['apps/quillforge/src/gewuzaojing_config.py', '--check'], { cwd: root, env: environment, stdio: 'inherit' });
await runSupervised(buildServiceSpecs(root, envFile).map((spec) => ({ ...spec, env: { ...spec.env, PYTHONUTF8: '1' } })));
