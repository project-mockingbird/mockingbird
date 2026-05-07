import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerItemRoutes } from '../../src/api/routes/items.js';
import type { Engine } from '../../src/engine/index.js';
import { buildEngine, makeItem } from '../engine/layout/_helpers.js';
import { TEMPLATE_TEMPLATE_ID, TEMPLATE_FIELD_TEMPLATE_ID, FIELD_IDS } from '../../src/engine/constants.js';

// PUT /api/items/:id used to mutate node.item BEFORE the writeFile resolved.
// If the disk write rejected, the in-memory tree was already updated and the
// caller had received 200. The fix snapshots first, writes second, applies
// only on success - so a rejected write must surface as 5xx with the prior
// in-memory state intact.
describe('PUT /api/items/:id - rollback on disk write failure', () => {
  let app: FastifyInstance;
  let engine: Engine;

  const titleFieldId = 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee';
  const pageTemplateId = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee';
  const itemId = 'home1111-home-home-home-homehomehome';

  beforeEach(async () => {
    const pageTemplate = makeItem({
      id: pageTemplateId,
      path: '/sitecore/templates/Project/site/Content Page',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const pageSection = makeItem({
      id: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: pageTemplateId,
      path: '/sitecore/templates/Project/site/Content Page/Content',
      template: '0437fee2-44c9-46a6-abe9-28858d9fee8c', // SECTION
    });
    const titleField = makeItem({
      id: titleFieldId,
      parent: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
      path: '/sitecore/templates/Project/site/Content Page/Content/Title',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    const homePage = makeItem({
      id: itemId,
      path: '/sitecore/content/site/Home',
      template: pageTemplateId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: [{ id: titleFieldId, hint: 'Title', value: 'original' }] }],
      }],
    });

    engine = buildEngine([pageTemplate, pageSection, titleField, homePage]);
    app = Fastify({ logger: false });
    registerItemRoutes(app, engine);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 5xx and leaves the in-memory item unchanged when the disk write fails', async () => {
    // buildEngine sets filePath to `/fake/<id>.yml` - a directory that does
    // not exist. writeFile rejects with ENOENT before any successful flush.
    const before = engine.getItemById(itemId)!;
    const beforeValue = before.item.languages[0].versions[0].fields[0].value;
    expect(beforeValue).toBe('original');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}`,
      payload: { fields: { [titleFieldId]: 'mutated' }, language: 'en', version: 1 },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const after = engine.getItemById(itemId)!;
    const afterValue = after.item.languages[0].versions[0].fields[0].value;
    expect(afterValue).toBe('original');
  });
});
