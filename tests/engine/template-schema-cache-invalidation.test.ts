import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { getTemplateSchema, clearTemplateSchemaCache } from '../../src/engine/template-schema.js';
import { mkdtemp, rm } from 'fs/promises';
import { cpSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const VALID_FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('template schema cache invalidation', () => {
  let tempDir: string;
  beforeEach(async () => {
    clearTemplateSchemaCache();
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-schemacache-'));
    cpSync(VALID_FIXTURES, tempDir, { recursive: true });
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('reflects a newly created section even after the empty schema was already cached', async () => {
    const engine = new Engine({ rootDir: tempDir });
    await engine.init();
    const tpl = await engine.createTemplate('Widget', '/sitecore/templates/Project/MyProject');

    // Prime the cache with the section-less schema - this is what the Builder
    // does when it first opens the template.
    const before = getTemplateSchema(tpl.item.id, engine);
    expect(before.sections.filter(s => s.sourceTemplateId === tpl.item.id)).toHaveLength(0);

    // Add a section (mirrors the Builder's "add section" on the open template).
    await engine.createSection('Content', tpl.item.path);

    // The schema must now include the section. Before the fix this returned the
    // stale empty cache entry, so the Builder showed nothing until a restart.
    const after = getTemplateSchema(tpl.item.id, engine);
    const own = after.sections.filter(s => s.sourceTemplateId === tpl.item.id);
    expect(own.map(s => s.name)).toContain('Content');

    // And a field added to that section shows up too.
    const section = engine.getItemByPath(`${tpl.item.path}/Content`)!;
    await engine.createField('Heading', section.item.path, 'Single-Line Text');
    const after2 = getTemplateSchema(tpl.item.id, engine);
    const contentSection = after2.sections.find(s => s.sourceTemplateId === tpl.item.id && s.name === 'Content')!;
    expect(contentSection.fields.map(f => f.name)).toContain('Heading');

    await engine.close();
  });
});
