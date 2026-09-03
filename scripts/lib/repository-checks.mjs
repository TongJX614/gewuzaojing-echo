import { access, readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

const SKIP = new Set(['.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache']);
const SKIP_PATHS = new Set(['apps/quillforge/var']);
const FORBIDDEN = new Set(['.codegraph', '.qoder', '.coze', '.playwright-cli', 'superpowers']);
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const TEXT_BASENAMES = new Set(['.env.example', 'dockerfile', 'license', 'makefile']);
const SECRET_ASSIGNMENT = /^(?:[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))=(?!replace-with-)[^\s]+$/gmu;
const STATIC_ASSET = /['"`](\/(?:assets|characters|backgrounds|images|audio|video|minigame)\/[^'"`?#]+)(?:[?#][^'"`]*)?['"`]/gu;

function extension(path) {
  const match = /\.[^.\\/]+$/u.exec(path);
  return match?.[0].toLowerCase() ?? '';
}

function isTextCandidate(path) {
  const name = basename(path).toLowerCase();
  return TEXT_BASENAMES.has(name) || TEXT_EXTENSIONS.has(extension(path)) || extension(path) === '';
}

export async function collectRepositoryViolations(root, { maxBytes = 52_428_800 } = {}) {
  const violations = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = `${directory}/${entry.name}`;
      const local = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || SKIP_PATHS.has(local)) continue;
        if (FORBIDDEN.has(entry.name)) {
          violations.push({ code: 'FORBIDDEN_DIRECTORY', path: local, detail: entry.name });
          continue;
        }
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const localName = basename(local).toLowerCase();
      if (localName === '.env') {
        violations.push({ code: 'PRIVATE_ENV', path: local, detail: '.env is local-only' });
      }
      if (localName === 'agents.md') {
        violations.push({
          code: 'FORBIDDEN_AGENT_DOCUMENT',
          path: local,
          detail: 'Agent instructions are development-only',
        });
      }
      const info = await stat(absolute);
      if (info.size > maxBytes) {
        violations.push({ code: 'OVERSIZED_FILE', path: local, detail: String(info.size) });
      }
      if (isTextCandidate(local)) {
        const bytes = await readFile(absolute);
        if (bytes.includes(0)) continue;
        const text = bytes.toString('utf8');
        if (/[A-Za-z]:\\(?:Users|0files)\\/u.test(text)) {
          violations.push({ code: 'LOCAL_ABSOLUTE_PATH', path: local, detail: 'Windows local path' });
        }
        if (local !== '.env.example') {
          SECRET_ASSIGNMENT.lastIndex = 0;
          if (SECRET_ASSIGNMENT.test(text)) {
            violations.push({ code: 'SECRET_ASSIGNMENT', path: local, detail: 'secret-like assignment' });
          }
        }
        if (
          local === 'apps/echo/index.html' ||
          local.startsWith('apps/echo/src/') ||
          local.startsWith('apps/echo/config/')
        ) {
          for (const match of text.matchAll(STATIC_ASSET)) {
            const runtimePath = match[1];
            if (runtimePath.includes('${')) continue;
            const publicFile = join(root, 'apps', 'echo', 'public', runtimePath.slice(1));
            try {
              await access(publicFile);
            } catch {
              violations.push({ code: 'MISSING_ASSET', path: local, detail: runtimePath });
            }
          }
        }
      }
    }
  }
  await visit(root);
  return violations.sort((a, b) => `${a.code}:${a.path}`.localeCompare(`${b.code}:${b.path}`));
}
