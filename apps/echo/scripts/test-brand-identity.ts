import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
const indexHtmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const workspacePath = fileURLToPath(new URL('../../../pnpm-workspace.yaml', import.meta.url));

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  name?: unknown;
  scripts?: Record<string, string>;
};
const indexHtml = readFileSync(indexHtmlPath, 'utf8');
const workspace = readFileSync(workspacePath, 'utf8').replace(/\r\n/g, '\n');

assert.equal(packageJson.name, '@gewuzaojing/echo');
for (const scriptName of ['build', 'dev']) {
  const command = packageJson.scripts?.[scriptName] ?? '';
  assert.ok(command.length > 0, `Missing ${scriptName} script`);
  assert.doesNotMatch(command, /\bbash\b/u);
}
assert.match(
  indexHtml,
  /<title>格物造境·回响 \| GEWUZAOJING · ECHO<\/title>/,
);
assert.match(
  indexHtml,
  /<meta name="description" content="格物造境·回响——像素风 RPG × Galgame 对话系统" \/>/,
);
assert.equal(
  workspace,
  'packages:\n  - apps/echo\nonlyBuiltDependencies:\n  - esbuild\n',
);

console.log('BRAND_IDENTITY=PASS');
