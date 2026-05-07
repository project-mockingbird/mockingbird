import { describe, it, expect } from 'vitest';
import { CONTENTS_RESOLVERS, readSortOrder } from '../../../src/engine/layout/contents-resolvers.js';
import { buildEngine, makeItem } from './_helpers.js';

import { formatGuidEdge } from '../../../src/engine/guid.js';

const SPOTLIGHT_LINK_TEMPLATE_ID = '11cdaadf-1248-4b6e-ba3a-d96e802fb489';
const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

function spotlightLink(id: string, parentId: string, sortOrder: number, name: string) {
  return makeItem({
    id,
    parent: parentId,
    path: `/sitecore/content/site/Data/Spotlights/container/${name}`,
    template: SPOTLIGHT_LINK_TEMPLATE_ID,
    sharedFields: [
      { id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: String(sortOrder) },
    ],
    languages: [
      {
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: [] }],
      },
    ],
  });
}

describe('Spotlight resolver — links sort (Item 9)', () => {
  it('sorts links.results by __Sortorder ascending', () => {
    const dsId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const datasource = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Data/Spotlights/container',
      languages: [
        { language: 'en', fields: [], versions: [{ version: 1, fields: [] }] },
      ],
    });
    // Insert in arbitrary order; resolver should emit sorted by __Sortorder.
    const alpha = spotlightLink('11111111-0000-0000-0000-000000000001', dsId, 300, 'Alpha');
    const beta = spotlightLink('22222222-0000-0000-0000-000000000002', dsId, 100, 'Beta');
    const gamma = spotlightLink('33333333-0000-0000-0000-000000000003', dsId, 200, 'Gamma');

    const engine = buildEngine([datasource, alpha, beta, gamma]);
    const out = CONTENTS_RESOLVERS.Spotlight!(datasource, engine, '', '');
    const data = (out.data as unknown as {
      datasource: { links: { results: Array<{ id: string }> } };
    }).datasource;
    const order = data.links.results.map(r => r.id);
    expect(order).toEqual([
      '22222222000000000000000000000002', // Beta 100
      '33333333000000000000000000000003', // Gamma 200
      '11111111000000000000000000000001', // Alpha 300
    ]);
  });

  it('Spotlight links.results ids are Edge format (bare 32-hex uppercase)', () => {
    const dsId = 'cccccccc-0000-0000-0000-000000000001';
    const datasource = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Data/Spotlights/format-check',
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
    });
    const link = spotlightLink('ab12cd34-ef56-7890-abcd-efabcdef1234', dsId, 0, 'Link');
    const engine = buildEngine([datasource, link]);
    const out = CONTENTS_RESOLVERS.Spotlight!(datasource, engine, '', '');
    const ids = (out.data as unknown as { datasource: { links: { results: Array<{ id: string }> } } })
      .datasource.links.results.map(r => r.id);
    expect(ids).toEqual([formatGuidEdge('ab12cd34-ef56-7890-abcd-efabcdef1234')]);
  });

  it('treats missing __Sortorder as zero and preserves insertion order for equal values', () => {
    const dsId = 'bbbbbbbb-0000-0000-0000-000000000001';
    const datasource = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Data/Spotlights/no-sortorder',
      languages: [
        { language: 'en', fields: [], versions: [{ version: 1, fields: [] }] },
      ],
    });
    const first = makeItem({
      id: '44444444-0000-0000-0000-000000000001',
      parent: dsId,
      path: '/sitecore/content/site/Data/Spotlights/no-sortorder/First',
      template: SPOTLIGHT_LINK_TEMPLATE_ID,
      languages: [
        { language: 'en', fields: [], versions: [{ version: 1, fields: [] }] },
      ],
    });
    const second = makeItem({
      id: '55555555-0000-0000-0000-000000000002',
      parent: dsId,
      path: '/sitecore/content/site/Data/Spotlights/no-sortorder/Second',
      template: SPOTLIGHT_LINK_TEMPLATE_ID,
      languages: [
        { language: 'en', fields: [], versions: [{ version: 1, fields: [] }] },
      ],
    });

    const engine = buildEngine([datasource, first, second]);
    const out = CONTENTS_RESOLVERS.Spotlight!(datasource, engine, '', '');
    const data = (out.data as unknown as {
      datasource: { links: { results: Array<{ id: string }> } };
    }).datasource;
    expect(data.links.results.map(r => r.id)).toEqual([
      '44444444000000000000000000000001',
      '55555555000000000000000000000002',
    ]);
  });
});

describe('Carousel resolver — items ids are canonical lowercase-dashed', () => {
  // Prod Edge emits Carousel `items[*].id` in canonical lowercase-dashed
  // form (AnyItem-style), NOT the bare-upper-hex shape used for
  // ComponentQuery executor output. 0.3.3's Fix A over-applied the Edge
  // format here; 0.3.4 reverts.
  it('items[*].id uses canonical lowercase-dashed (no braces)', () => {
    const dsId = 'caaa0000-0000-0000-0000-000000000001';
    const CAROUSEL_SLIDE_TMPL = 'dddddddd-0000-0000-0000-000000000001';
    const datasource = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Data/Carousels/main',
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
    });
    const slide = makeItem({
      id: 'cbbb0000-0000-0000-0000-000000000002',
      parent: dsId,
      path: '/sitecore/content/site/Data/Carousels/main/Slide One',
      template: CAROUSEL_SLIDE_TMPL,
      sharedFields: [
        { id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '100' },
      ],
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
    });
    const engine = buildEngine([datasource, slide]);
    const out = CONTENTS_RESOLVERS.Carousel!(datasource, engine, '', '/sitecore/content/site');
    const items = out.items as unknown as Array<{ id: string }>;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('cbbb0000-0000-0000-0000-000000000002');
  });
});

describe('readSortOrder — SV cascade (0.4.0.28)', () => {
  // Sitecore's ChildListOptions walks item.Fields["__Sortorder"].Value which
  // cascades through the template's Standard Values when the item's own value
  // is absent. Pre-0.4.0.28 mockingbird read only the direct shared field,
  // defaulting to 100 on absence - wrong when SCS strips shared fields whose
  // values equal SV.

  const SORTORDER_FIELD_ID_LOCAL = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';
  const TEMPLATE_ID = 'dddddddd-0000-0000-0000-0000aabbccdd0001';
  const SV_ID = 'dddddddd-0000-0000-0000-0000aabbccdd0002';

  it('cascades to template SV when item has no own __Sortorder', () => {
    const item = makeItem({
      id: 'dddddddd-0000-0000-0000-0000aabbccdd0010',
      template: TEMPLATE_ID,
      path: '/sitecore/content/x',
      // No __Sortorder on shared — SCS would strip if equal to SV default.
    });
    const template = makeItem({
      id: TEMPLATE_ID,
      path: '/sitecore/templates/Leaf Page',
    });
    const sv = makeItem({
      id: SV_ID,
      parent: TEMPLATE_ID,
      path: '/sitecore/templates/Leaf Page/__Standard Values',
      sharedFields: [{ id: SORTORDER_FIELD_ID_LOCAL, hint: '__Sortorder', value: '400' }],
    });
    const engine = buildEngine([template, sv, item]);

    expect(readSortOrder(engine, item)).toBe(400);
  });

  it("uses item's own __Sortorder when present (SV does not override)", () => {
    const item = makeItem({
      id: 'dddddddd-0000-0000-0000-0000aabbccdd0011',
      template: TEMPLATE_ID,
      path: '/sitecore/content/x',
      sharedFields: [{ id: SORTORDER_FIELD_ID_LOCAL, hint: '__Sortorder', value: '300' }],
    });
    const template = makeItem({ id: TEMPLATE_ID, path: '/sitecore/templates/Leaf Page' });
    const sv = makeItem({
      id: SV_ID,
      parent: TEMPLATE_ID,
      path: '/sitecore/templates/Leaf Page/__Standard Values',
      sharedFields: [{ id: SORTORDER_FIELD_ID_LOCAL, hint: '__Sortorder', value: '400' }],
    });
    const engine = buildEngine([template, sv, item]);

    expect(readSortOrder(engine, item)).toBe(300);
  });

  it('defaults to 100 when neither item nor SV carries __Sortorder', () => {
    const item = makeItem({
      id: 'dddddddd-0000-0000-0000-0000aabbccdd0012',
      template: TEMPLATE_ID,
      path: '/sitecore/content/x',
    });
    const template = makeItem({ id: TEMPLATE_ID, path: '/sitecore/templates/Plain' });
    const engine = buildEngine([template, item]);

    expect(readSortOrder(engine, item)).toBe(100);
  });
});
