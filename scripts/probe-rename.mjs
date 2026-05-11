import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Engine } from '../src/engine/index.js';

const fixDir = mkdtempSync(join(tmpdir(), 'mb-rename-probe-'));
writeFileSync(join(fixDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
writeFileSync(join(fixDir, 'mod.module.json'), JSON.stringify({
  namespace: 'mod',
  items: { includes: [{ name: 'tree', path: '/sitecore/content' }] },
}));
mkdirSync(join(fixDir, 'tree'), { recursive: true });
writeFileSync(join(fixDir, 'tree', 'Root.yml'),
  `---\nID: "11111111-1111-1111-1111-111111111111"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "a87a00b1-e6db-45ab-8b54-636fec3b5523"\nPath: /sitecore/content/Root\n`,
);
const dir = join(fixDir, 'tree', 'Root');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'OldName.yml'),
  `---\nID: "22222222-2222-2222-2222-222222222222"\nParent: "11111111-1111-1111-1111-111111111111"\nTemplate: "a87a00b1-e6db-45ab-8b54-636fec3b5523"\nPath: /sitecore/content/Root/OldName\n`,
);

const engine = new Engine({ rootDir: fixDir });
await engine.init();
console.log('Before - file path:', engine.getItemById('22222222-2222-2222-2222-222222222222')?.filePath);
console.log('Before - tree/Root contents:', readdirSync(join(fixDir, 'tree', 'Root')));
await engine.renameItem('22222222-2222-2222-2222-222222222222', 'NewName');
console.log('After rename - tree contents:', readdirSync(join(fixDir, 'tree')));
console.log('After rename - tree/Root exists?', existsSync(join(fixDir, 'tree', 'Root')));
if (existsSync(join(fixDir, 'tree', 'Root'))) console.log('After rename - tree/Root contents:', readdirSync(join(fixDir, 'tree', 'Root')));
console.log('After - node.filePath:', engine.getItemById('22222222-2222-2222-2222-222222222222')?.filePath);
console.log('After - node.path:', engine.getItemById('22222222-2222-2222-2222-222222222222')?.item.path);
rmSync(fixDir, { recursive: true, force: true });
