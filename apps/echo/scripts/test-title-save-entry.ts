import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(
  new URL('../src/main.ts', import.meta.url),
  'utf8',
);
const title = readFileSync(
  new URL('../src/ui/title-menu.ts', import.meta.url),
  'utf8',
);

for (const label of ['继续游戏', '新游戏', '读取存档']) {
  assert.match(title, new RegExp(label, 'u'));
}
assert.match(title, /class="etm-panel etm-main-panel"/u);
assert.match(title, /width:\s*min\(308px,/u);
assert.match(
  title,
  /background:\s*linear-gradient\(110deg, rgba\(1, 10, 18, \.60\), rgba\(7, 9, 19, \.60\)\)/u,
);
assert.doesNotMatch(title, /transform:\s*scale\(\.7\)/u);
assert.match(title, /\.etm-load-panel\s*\{\s*width:\s*min\(620px,/u);
assert.doesNotMatch(main, /点击地面移动 .* F5\/F9 存读档/u);
assert.match(main, /Esc 系统菜单/u);
assert.match(main, /echo\.pending-load/u);
assert.match(main, /location\.reload/u);

for (const file of ['slit-rebuttal.html', 'photon-box.html']) {
  const html = readFileSync(
    new URL('../public/minigame/' + file, import.meta.url),
    'utf8',
  );
  assert.match(html, /echo:pause-request/u);
  assert.match(html, /e\.key === 'Escape'/u);
}

console.log('TITLE_SAVE_ENTRY=PASS');
