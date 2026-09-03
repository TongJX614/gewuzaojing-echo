import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSync } from 'esbuild';

import {
  GewuzaojingConfigError,
  applyAtomicConnectionOverride,
  parsePortableEnv,
  resolveGewuzaojingEnvPath,
} from '../server/config/portable-env';
import { loadEchoLlmConfig } from '../server/config/llm-config';
import { buildMigratedRootEnv } from '../server/config/env-migration';

function expectConfigError(
  operation: () => unknown,
  expectedCode: string,
  forbiddenText?: string,
): GewuzaojingConfigError {
  try {
    operation();
  } catch (error) {
    assert.ok(error instanceof GewuzaojingConfigError);
    assert.equal(error.code, expectedCode);
    if (forbiddenText) {
      assert.doesNotMatch(error.message, new RegExp(forbiddenText, 'u'));
    }
    return error;
  }
  assert.fail(`Expected GewuzaojingConfigError(${expectedCode})`);
}

const validSharedEnv = [
  'SHARED_LLM_PROVIDER=openai-compatible',
  'SHARED_LLM_API_KEY=unit-secret',
  'SHARED_LLM_BASE_URL=https://provider.example/v1',
  'ECHO_LLM_SOURCE=shared',
  'ECHO_CHAT_MODEL=echo-chat',
  'ECHO_QUEST_MODEL=echo-quest',
  'ECHO_HOST=127.0.0.1',
  'ECHO_PORT=5000',
].join('\n');

const parsed = parsePortableEnv(
  [
    '\uFEFF# comment',
    '  # indented full-line comment',
    '',
    'API_KEY=abc=def',
    'MODEL=demo-model',
  ].join('\n'),
);
assert.deepEqual(parsed, {
  API_KEY: 'abc=def',
  MODEL: 'demo-model',
});

for (const invalidText of [
  'lower=value',
  ' export KEY=value',
  'KEY="quoted"',
  "KEY='quoted'",
  'KEY=value # inline',
  'KEY=$OTHER',
  'KEY=value ',
  'KEY= value',
  'KEY',
  'KEY=value\ncontinuation',
  'KEY=first\nKEY=second',
]) {
  expectConfigError(() => parsePortableEnv(invalidText), 'ENV_SYNTAX');
}

const fileValues = parsePortableEnv(validSharedEnv);
assert.equal(
  applyAtomicConnectionOverride(fileValues, {}, 'SHARED_LLM').SHARED_LLM_API_KEY,
  'unit-secret',
);
const processOverride = applyAtomicConnectionOverride(
  fileValues,
  {
    SHARED_LLM_PROVIDER: 'openai-compatible',
    SHARED_LLM_API_KEY: 'process-secret',
    SHARED_LLM_BASE_URL: 'https://process.example/v1',
  },
  'SHARED_LLM',
);
assert.equal(processOverride.SHARED_LLM_API_KEY, 'process-secret');
assert.equal(processOverride.SHARED_LLM_BASE_URL, 'https://process.example/v1');
expectConfigError(
  () =>
    applyAtomicConnectionOverride(
      fileValues,
      { SHARED_LLM_API_KEY: 'partial-secret' },
      'SHARED_LLM',
    ),
  'ATOMIC_CONNECTION_OVERRIDE',
  'partial-secret',
);

const sharedMigration = buildMigratedRootEnv(
  parsePortableEnv('DEEPSEEK_API_KEY=same-secret'),
  parsePortableEnv(
    [
      'DEEPSEEK_API_KEY=same-secret',
      'DEEPSEEK_BASE_URL=https://api.deepseek.com/v1',
      'DEEPSEEK_MODEL=legacy-runtime',
      'IMAGE_SIZE_BG=1344x768',
      'IMAGE_CONCURRENCY=3',
      'SESSION_TTL_SECONDS=456',
    ].join('\n'),
  ),
);
assert.equal(sharedMigration.sameConnection, true);
assert.equal(sharedMigration.echoSource, 'shared');
assert.equal(sharedMigration.quillforgeSource, 'shared');
assert.match(sharedMigration.text, /^SHARED_LLM_PROVIDER=/mu);
assert.doesNotMatch(sharedMigration.text, /^ECHO_LLM_API_KEY=/mu);
assert.match(sharedMigration.text, /^IMAGE_SIZE_BG=1344x768$/mu);
assert.match(sharedMigration.text, /^IMAGE_CONCURRENCY=3$/mu);
assert.match(sharedMigration.text, /^SESSION_TTL_SECONDS=456$/mu);

const dedicatedMigration = buildMigratedRootEnv(
  parsePortableEnv('DEEPSEEK_API_KEY=echo-secret'),
  parsePortableEnv(
    [
      'DEEPSEEK_API_KEY=quillforge-secret',
      'DEEPSEEK_BASE_URL=https://api.deepseek.com',
      'DEEPSEEK_MODEL=legacy-runtime',
    ].join('\n'),
  ),
);
assert.equal(dedicatedMigration.sameConnection, false);
assert.equal(dedicatedMigration.echoSource, 'dedicated');
assert.equal(dedicatedMigration.quillforgeSource, 'dedicated');
assert.match(dedicatedMigration.text, /^ECHO_LLM_API_KEY=echo-secret$/mu);
assert.match(
  dedicatedMigration.text,
  /^QUILLFORGE_LLM_API_KEY=quillforge-secret$/mu,
);
assert.match(
  dedicatedMigration.text,
  /^QUILLFORGE_RUNTIME_MODEL=deepseek-v4-flash$/mu,
);

const sandbox = mkdtempSync(join(tmpdir(), 'gewuzaojing-env-'));
try {
  const repoRoot = join(sandbox, 'gewuzaojing-echo');
  const echoStart = join(repoRoot, 'apps', 'echo', 'server', 'config', 'portable-env.ts');
  const rootEnv = join(repoRoot, '.env');
  mkdirSync(dirname(echoStart), { recursive: true });
  mkdirSync(join(repoRoot, 'shared', 'contracts'), { recursive: true });
  writeFileSync(join(repoRoot, 'package.json'), '{"name":"gewuzaojing-echo","private":true}\n');
  writeFileSync(join(repoRoot, 'shared', 'contracts', 'environment.json'), '{"version":1}\n');
  writeFileSync(echoStart, '', 'utf8');
  writeFileSync(rootEnv, validSharedEnv, 'utf8');
  writeFileSync(join(repoRoot, 'apps', 'echo', '.env'), validSharedEnv.replace('unit-secret', 'poison-local-secret'));

  assert.equal(
    resolveGewuzaojingEnvPath({ processEnv: {}, startPath: echoStart }),
    resolve(rootEnv),
  );

  const legacyRoot = join(sandbox, 'legacy');
  const legacyStart = join(legacyRoot, 'src', 'echo', 'file.ts');
  mkdirSync(dirname(legacyStart), { recursive: true });
  mkdirSync(join(legacyRoot, 'src', 'Quillforge'), { recursive: true });
  writeFileSync(legacyStart, '');
  expectConfigError(
    () => resolveGewuzaojingEnvPath({ processEnv: {}, startPath: legacyStart }),
    'AGGREGATION_ROOT_NOT_FOUND',
  );

  const bundledPortableEnv = join(
    repoRoot,
    'apps',
    'echo',
    'dist-server',
    'portable-env.cjs',
  );
  mkdirSync(dirname(bundledPortableEnv), { recursive: true });
  buildSync({
    entryPoints: [
      fileURLToPath(new URL('../server/config/portable-env.ts', import.meta.url)),
    ],
    outfile: bundledPortableEnv,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  const bundledConfig = createRequire(import.meta.url)(bundledPortableEnv) as {
    resolveGewuzaojingEnvPath: typeof resolveGewuzaojingEnvPath;
  };
  assert.equal(
    bundledConfig.resolveGewuzaojingEnvPath({ processEnv: {} }),
    resolve(rootEnv),
  );
  assert.equal(
    resolveGewuzaojingEnvPath({
      processEnv: { GEWUZAOJING_ENV_FILE: rootEnv },
      startPath: echoStart,
    }),
    resolve(rootEnv),
  );
  expectConfigError(
    () =>
      resolveGewuzaojingEnvPath({
        processEnv: { GEWUZAOJING_ENV_FILE: '.env' },
        startPath: echoStart,
      }),
    'ENV_PATH_NOT_ABSOLUTE',
  );

  const sharedConfig = loadEchoLlmConfig({
    envFile: rootEnv,
    processEnv: {},
  });
  assert.deepEqual(
    {
      source: sharedConfig.source,
      provider: sharedConfig.connection.provider,
      apiKey: sharedConfig.connection.apiKey,
      baseUrl: sharedConfig.connection.baseUrl,
      chatModel: sharedConfig.chatModel,
      questModel: sharedConfig.questModel,
      host: sharedConfig.host,
      port: sharedConfig.port,
    },
    {
      source: 'shared',
      provider: 'openai-compatible',
      apiKey: 'unit-secret',
      baseUrl: 'https://provider.example/v1/',
      chatModel: 'echo-chat',
      questModel: 'echo-quest',
      host: '127.0.0.1',
      port: 5000,
    },
  );

  const dedicatedEnv = [
    validSharedEnv,
    'ECHO_LLM_PROVIDER=openai-compatible',
    'ECHO_LLM_API_KEY=dedicated-secret',
    'ECHO_LLM_BASE_URL=https://echo.example/api',
  ]
    .join('\n')
    .replace('ECHO_LLM_SOURCE=shared', 'ECHO_LLM_SOURCE=dedicated');
  const dedicatedPath = join(repoRoot, 'dedicated.env');
  writeFileSync(dedicatedPath, dedicatedEnv, 'utf8');
  const dedicatedConfig = loadEchoLlmConfig({
    envFile: dedicatedPath,
    processEnv: {
      ECHO_CHAT_MODEL: 'process-chat',
      ECHO_PORT: '5100',
    },
  });
  assert.equal(dedicatedConfig.source, 'dedicated');
  assert.equal(dedicatedConfig.connection.apiKey, 'dedicated-secret');
  assert.equal(dedicatedConfig.chatModel, 'process-chat');
  assert.equal(dedicatedConfig.port, 5100);

  const placeholderPath = join(repoRoot, 'placeholder.env');
  writeFileSync(
    placeholderPath,
    validSharedEnv.replace('unit-secret', 'replace-with-real-secret'),
    'utf8',
  );
  expectConfigError(
    () => loadEchoLlmConfig({ envFile: placeholderPath, processEnv: {} }),
    'PLACEHOLDER_SECRET',
    'replace-with-real-secret',
  );

  const badBasePath = join(repoRoot, 'bad-base.env');
  writeFileSync(
    badBasePath,
    validSharedEnv.replace(
      'https://provider.example/v1',
      'https://user:pass@provider.example/v1?leak=1',
    ),
    'utf8',
  );
  expectConfigError(
    () => loadEchoLlmConfig({ envFile: badBasePath, processEnv: {} }),
    'INVALID_BASE_URL',
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log('ECHO_LLM_CONFIG=PASS');
