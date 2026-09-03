import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEchoLlmConfig } from '../server/config/llm-config';
import { resolveGewuzaojingEnvPath } from '../server/config/portable-env';

const envPath = resolveGewuzaojingEnvPath();
const config = loadEchoLlmConfig({ envFile: envPath });
const expectedRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

console.log(
  `envPathMatches=${dirname(envPath).toLowerCase() === expectedRoot.toLowerCase()}`,
);
console.log('echoConfigValid=true');
console.log(`echoSource=${config.source}`);
