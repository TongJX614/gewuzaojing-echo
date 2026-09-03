import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

async function filesUnder(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(directory);
  return files;
}

export async function collectContentViolations(root, manifest) {
  const declared = manifest.entries.map((entry) => resolve(root, entry.path));
  const publicRoots = [resolve(root, 'apps/echo/public'), resolve(root, 'apps/quillforge/samples')];
  const violations = [];
  for (const publicRoot of publicRoots) {
    for (const file of await filesUnder(publicRoot)) {
      if (!declared.some((directory) => file === directory || file.startsWith(`${directory}\\`) || file.startsWith(`${directory}/`))) {
        violations.push({ code: 'UNDECLARED_CONTENT', path: relative(root, file).replaceAll('\\', '/') });
      }
    }
  }
  return violations.sort((a, b) => a.path.localeCompare(b.path));
}
