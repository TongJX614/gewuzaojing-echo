import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot, pnpmInvocation, pythonExecutable } from './lib/workspace.mjs';
import { inspectPort, terminateOwnedChild, waitForHttp } from './lib/process-supervisor.mjs';

const root = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'gewuzaojing-integration-'));
const envFile = join(temporary, '.env');
const environmentText = [
  'SHARED_LLM_PROVIDER=openai-compatible',
  'SHARED_LLM_API_KEY=integration-unit-secret',
  'SHARED_LLM_BASE_URL=https://provider.invalid/v1',
  'ECHO_LLM_SOURCE=shared',
  'ECHO_CHAT_MODEL=echo-test',
  'ECHO_QUEST_MODEL=echo-test',
  'ECHO_HOST=127.0.0.1',
  'ECHO_PORT=5100',
  'QUILLFORGE_LLM_SOURCE=shared',
  'QUILLFORGE_RUNTIME_MODEL=qf-test',
  'QUILLFORGE_SCRIPT_MODEL=qf-test',
  'QUILLFORGE_DEBATE_MODEL=qf-test',
  'QUILLFORGE_MINIGAME_MODEL=qf-test',
  'QUILLFORGE_HOST=127.0.0.1',
  'QUILLFORGE_PORT=8150',
  'QUILLFORGE_ECHO_ENTRY_ENABLED=false',
].join('\n') + '\n';
const childEnvironment = {
  ...process.env,
  PYTHONUTF8: '1',
  GEWUZAOJING_ENV_FILE: envFile,
  QUILLFORGE_VAR_DIR: join(temporary, 'var'),
};
const children = [];
try {
  for (const port of [5100, 8150]) {
    assert.equal((await inspectPort('127.0.0.1', port)).occupied, false, `test port ${port} is occupied`);
  }
  await writeFile(envFile, environmentText, 'utf8');
  children.push(spawn(
    pythonExecutable(root),
    ['src/server.py', '--host', '127.0.0.1', '--port', '8150'],
    { cwd: join(root, 'apps/quillforge'), env: childEnvironment, stdio: 'inherit' },
  ));
  await waitForHttp('http://127.0.0.1:8150/');
  const echoCommand = pnpmInvocation(['--dir', 'apps/echo', 'dev']);
  children.push(spawn(
    echoCommand.command,
    echoCommand.args,
    { cwd: root, env: childEnvironment, stdio: 'inherit' },
  ));
  for (const url of [
    'http://127.0.0.1:5100/',
    'http://127.0.0.1:8150/',
    'http://127.0.0.1:8150/game',
    'http://127.0.0.1:8150/docs',
  ]) {
    const response = await waitForHttp(url);
    assert.equal(response.status, 200, url);
  }
  const contract = JSON.parse(await readFile(join(root, 'shared/contracts/embed-messages.json'), 'utf8'));
  const echoAdapter = await readFile(join(root, 'apps/echo/src/ui/embed-contract.ts'), 'utf8');
  const quillForgeAdapter = await readFile(join(root, 'apps/quillforge/src/static/echo-embed-bridge.js'), 'utf8');
  for (const message of Object.keys(contract.messages)) {
    assert.equal(echoAdapter.includes(message), true, `Echo adapter missing ${message}`);
    assert.equal(quillForgeAdapter.includes(message), true, `QuillForge adapter missing ${message}`);
  }
  console.log('INTEGRATION_SMOKE=PASS');
} finally {
  await Promise.all(children.map(terminateOwnedChild));
  await rm(temporary, { recursive: true, force: true });
}
