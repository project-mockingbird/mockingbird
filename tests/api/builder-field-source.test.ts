import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { FIELD_IDS } from '../../src/engine/constants.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

// Reproduces the reported bug: populating a template field's Source in the
// Builder and clicking Save loses the value. Two distinct defects are covered:
//   1. The edit must land on the field-definition item's Source shared field.
//   2. Re-reading the parent template's schema must reflect the new Source
//      (the server template-schema cache must be invalidated on the edit).
describe('Builder template-field Source persistence', () => {
  let app: FastifyInstance;
  let tempDir: string;
  const PARENT = '/sitecore/templates/Project/MyProject';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-src-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    const result = await createServer({ rootDir: tempDir });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

  async function post(payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url: '/api/items', payload });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  function iconField(schema: { builderSections?: { fields: { id: string; source: string }[] }[] }, fieldId: string) {
    return (schema.builderSections ?? [])
      .flatMap(s => s.fields)
      .find(f => f.id.toLowerCase() === fieldId.toLowerCase());
  }

  it('persists a Source edit on a template field and reflects it in the schema', async () => {
    const tpl = await post({ type: 'template', name: 'SrcTest', parentPath: PARENT });
    await post({ type: 'section', name: 'Content', parentPath: tpl.path });
    const field = await post({ type: 'field', name: 'Icon', parentPath: `${tpl.path}/Content`, fieldType: 'Image' });

    // Prime the cache exactly as the Builder does when it first opens the template.
    const before = (await app.inject({ method: 'GET', url: `/api/items/${tpl.id}/template-schema` })).json();
    expect(iconField(before, field.id)?.source).toBe('');

    // Populate Source and Save (the Builder targets the field-definition item).
    const put = await app.inject({
      method: 'PUT',
      url: `/api/items/${field.id}`,
      payload: { fields: { [FIELD_IDS.source]: '/sitecore/media library' } },
    });
    expect(put.statusCode).toBe(200);

    // Re-reading the schema must show the new Source, not the stale empty cache.
    const after = (await app.inject({ method: 'GET', url: `/api/items/${tpl.id}/template-schema` })).json();
    expect(iconField(after, field.id)?.source).toBe('/sitecore/media library');
  });

  it('orders builderSections fields the way the content tree does (sortorder then name), not creation order', async () => {
    const tpl = await post({ type: 'template', name: 'OrderTest', parentPath: PARENT });
    await post({ type: 'section', name: 'Content', parentPath: tpl.path });
    // Create in deliberately non-alphabetical order; with no __Sortorder set,
    // the tree falls back to name order, so the Builder must too.
    for (const name of ['Zebra', 'Apple', 'Mango']) {
      await post({ type: 'field', name, parentPath: `${tpl.path}/Content`, fieldType: 'Single-Line Text' });
    }
    const schema = (await app.inject({ method: 'GET', url: `/api/items/${tpl.id}/template-schema` })).json();
    const section = (schema.builderSections ?? []).find((s: { name: string }) => s.name === 'Content');
    expect(section.fields.map((f: { name: string }) => f.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });
});
