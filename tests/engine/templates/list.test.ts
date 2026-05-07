import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../../src/engine/index.js';
import { listTemplates } from '../../../src/engine/templates/list.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../../fixtures/valid');

describe('listTemplates', () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  it('returns an array of TemplateMeta objects', () => {
    const templates = listTemplates(engine);
    expect(templates).toBeInstanceOf(Array);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]).toMatchObject({
      id: expect.stringMatching(/^\{[A-F0-9-]+\}$/),
      name: expect.any(String),
      displayName: expect.any(String),
      path: expect.any(String),
      template: expect.any(String),
    });
  });

  it('only returns items under /sitecore/templates/', () => {
    const templates = listTemplates(engine);
    for (const t of templates) {
      expect(t.path.toLowerCase().startsWith('/sitecore/templates/')).toBe(true);
    }
  });

  it('only includes Template, Branch, and Folder templates', () => {
    const templates = listTemplates(engine);
    const allowed = new Set([
      'ab86861a-6030-46c5-b394-e8f99e8b87db', // Template
      '35e75c72-4985-4e09-88c3-0eac6cd1e64f', // Branch
      '0437fee2-44c9-46a6-abe9-28858d9fee8c', // Template Folder
      '7ee0975b-0698-493e-b3a2-0b2ef33d0522', // Renderings folder
      'a87a00b1-e6db-45ab-8b54-636fec3b5523', // Common/Folder
      '14416946-9839-4651-a12b-308de9415d52', // Node
    ]);
    for (const t of templates) {
      expect(allowed.has(t.template)).toBe(true);
    }
  });

  it('deduplicates by id (no duplicates across registry+tree merge)', () => {
    const templates = listTemplates(engine);
    const ids = templates.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludes __Standard Values items', () => {
    const templates = listTemplates(engine);
    const svItems = templates.filter(t => t.name.toLowerCase() === '__standard values');
    expect(svItems).toHaveLength(0);
  });
});
