import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRepositoryViolations } from './lib/repository-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const violations = await collectRepositoryViolations(root);
for (const item of violations) console.error(`${item.code}\t${item.path}\t${item.detail}`);
if (violations.length > 0) process.exitCode = 1;
else console.log('REPOSITORY_POLICY=PASS');
