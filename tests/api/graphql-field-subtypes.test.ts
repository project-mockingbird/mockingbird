/**
 * TDD: ItemField subtype hierarchy (C2).
 *
 * Tests cover the concrete field types added in Task C2:
 * LinkField, ImageField, FileField, DateField, CheckboxField,
 * NumberField, IntegerField, LookupField, MultilistField,
 * NameValueListField, RichTextField.
 *
 * On first run (before implementation) these tests should fail with
 * "Unknown type 'LinkField'" / wrong __typename / missing fields.
 * After implementation all tests should pass.
 */
import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
  EXTENSION_FIELD_ID,
  MIME_TYPE_FIELD_ID,
} from '../../src/engine/constants.js';
import { registerGraphQLRoutes } from '../../src/api/routes/graphql.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let seqC2 = 0;
function nextId(tag: string): string {
  const n = (++seqC2).toString(16).padStart(4, '0');
  // Pad to 36-char GUID shape
  return `c2${tag}${n}00-0000-4000-a000-000000000000`.slice(0, 36);
}

function makeItem(o: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields: [],
    languages: [],
    ...o,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const e = Object.create(Engine.prototype) as Engine;
  const t = new ItemTree();
  for (const item of items) t.addItem(item, `/fake/${item.id}.yml`);
  (e as unknown as Record<string, unknown>).tree = t;
  (e as unknown as Record<string, unknown>).registry = null;
  (e as unknown as Record<string, unknown>).options = { rootDir: '/fake' };
  return e;
}

async function mkApp(items: ScsItem[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerGraphQLRoutes(app, buildEngine(items), { mediaBaseUrl: '' });
  return app;
}

/**
 * Build a minimal template fixture (template item + section + one typed field).
 * Each call uses fresh IDs to avoid template-schema cache collisions.
 */
function buildTemplate(
  fieldName: string,
  fieldType: string,
): { tmplId: string; items: ScsItem[] } {
  const tmplId = nextId('t');
  const secId = nextId('s');
  const fldId = nextId('f');
  return {
    tmplId,
    items: [
      makeItem({
        id: tmplId,
        path: `/sitecore/templates/SubtypeTest/${tmplId}`,
        template: TEMPLATE_TEMPLATE_ID,
      }),
      makeItem({
        id: secId,
        parent: tmplId,
        path: `/sitecore/templates/SubtypeTest/${tmplId}/Data`,
        template: TEMPLATE_SECTION_TEMPLATE_ID,
      }),
      makeItem({
        id: fldId,
        parent: secId,
        path: `/sitecore/templates/SubtypeTest/${tmplId}/Data/${fieldName}`,
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: fieldType }],
      }),
    ],
  };
}

/** Build a content item with a given template + one typed field value. */
function buildItem(
  tmplId: string,
  fieldName: string,
  fieldValue: string,
  extra: ScsItem['sharedFields'] = [],
): ScsItem {
  const itemId = nextId('i');
  return makeItem({
    id: itemId,
    path: `/sitecore/content/test/item${itemId}`,
    template: tmplId,
    sharedFields: [
      { id: nextId('v'), hint: fieldName, value: fieldValue },
      ...extra,
    ],
  });
}

// ---------------------------------------------------------------------------
// Step 0: jsonValue is never null (JSON! non-null contract)
// ---------------------------------------------------------------------------

describe('Step 0: jsonValue non-null contract', () => {
  it('jsonValue is never null for an unset field on a minimal item', async () => {
    const item = makeItem({ id: nextId('i'), path: '/sitecore/content/step0/item' });
    const app = await mkApp([item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: { query: '{ item(path: "/sitecore/content/step0/item", language: "en") { field(name: "Anything") { jsonValue } } }' },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.jsonValue).not.toBeNull();
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// LinkField
// ---------------------------------------------------------------------------

describe('LinkField', () => {
  it('resolves __typename as LinkField for a General Link typed field', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_link', 'General Link');
    const item = buildItem(
      tmplId,
      'f_link',
      '<link linktype="external" url="https://example.org" text="Example" target="_blank" anchor="" />',
    );
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_link") { __typename } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('LinkField');
    } finally {
      await app.close();
    }
  });

  it('exposes url, text, anchor, target, linkType via inline fragment', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_link', 'General Link');
    const item = buildItem(
      tmplId,
      'f_link',
      '<link linktype="external" url="https://example.org" text="Click me" target="_self" anchor="section1" />',
    );
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_link") {
                ... on LinkField { url text anchor target linkType }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.url).toBe('https://example.org');
      expect(f.text).toBe('Click me');
      expect(f.anchor).toBe('section1');
      expect(f.target).toBe('_self');
      expect(f.linkType).toBe('external');
    } finally {
      await app.close();
    }
  });

  it('exposes targetItem for an internal link', async () => {
    const targetId = nextId('r');
    const target = makeItem({ id: targetId, path: '/sitecore/content/link-target-page' });

    const { tmplId, items: tmplItems } = buildTemplate('f_link', 'General Link');
    const item = buildItem(
      tmplId,
      'f_link',
      `<link linktype="internal" id="{${targetId.toUpperCase()}}" text="Target" anchor="" class="" title="" target="" querystring="" />`,
    );
    const app = await mkApp([...tmplItems, item, target]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_link") {
                ... on LinkField { targetItem { id(format: "D") } url }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.targetItem).not.toBeNull();
      expect(f.targetItem.id).toBe(targetId);
    } finally {
      await app.close();
    }
  });

  it('exposes queryString and className', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_link', 'General Link');
    const item = buildItem(
      tmplId,
      'f_link',
      '<link linktype="external" url="https://q.test" querystring="ref=demo" class="btn-primary" />',
    );
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_link") {
                ... on LinkField { queryString className }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.queryString).toBe('ref=demo');
      expect(f.className).toBe('btn-primary');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// ImageField
// ---------------------------------------------------------------------------

describe('ImageField', () => {
  it('resolves __typename as ImageField for an Image typed field', async () => {
    const mediaId = nextId('m');
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/img-type-test',
      sharedFields: [
        { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'png' },
      ],
    });
    const { tmplId, items: tmplItems } = buildTemplate('f_image', 'Image');
    const item = buildItem(tmplId, 'f_image', `<image mediaid="{${mediaId.toUpperCase()}}" alt="Alt text" />`);
    const app = await mkApp([...tmplItems, item, media]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_image") { __typename } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('ImageField');
    } finally {
      await app.close();
    }
  });

  it('exposes src and alt via inline fragment', async () => {
    const mediaId = nextId('m');
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/img-src-alt',
      sharedFields: [
        { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'jpg' },
      ],
    });
    const { tmplId, items: tmplItems } = buildTemplate('f_image', 'Image');
    const item = buildItem(
      tmplId,
      'f_image',
      `<image mediaid="{${mediaId.toUpperCase()}}" alt="Hero Image" />`,
    );
    const app = await mkApp([...tmplItems, item, media]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_image") {
                ... on ImageField { src alt }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.src).toBeTruthy();
      expect(f.src).toContain('/-/media/');
      expect(f.alt).toBe('Hero Image');
    } finally {
      await app.close();
    }
  });

  it('exposes width and height from authored attrs', async () => {
    const mediaId = nextId('m');
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/img-dims',
      sharedFields: [
        { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'png' },
        { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width', value: '800' },
        { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height', value: '600' },
      ],
    });
    const { tmplId, items: tmplItems } = buildTemplate('f_image', 'Image');
    const item = buildItem(
      tmplId,
      'f_image',
      `<image mediaid="{${mediaId.toUpperCase()}}" />`,
    );
    const app = await mkApp([...tmplItems, item, media]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_image") {
                ... on ImageField { width height }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.width).toBe('800');
      expect(f.height).toBe('600');
    } finally {
      await app.close();
    }
  });

  it('src honours maxWidth and maxHeight args', async () => {
    const mediaId = nextId('m');
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/img-constrained',
      sharedFields: [
        { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'webp' },
      ],
    });
    const { tmplId, items: tmplItems } = buildTemplate('f_image', 'Image');
    const item = buildItem(
      tmplId,
      'f_image',
      `<image mediaid="{${mediaId.toUpperCase()}}" />`,
    );
    const app = await mkApp([...tmplItems, item, media]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_image") {
                ... on ImageField { src(maxWidth: 400, maxHeight: 300) }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.src).toContain('w=400');
      expect(body.data.item.field.src).toContain('h=300');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// FileField
// ---------------------------------------------------------------------------

describe('FileField', () => {
  it('resolves __typename as FileField and exposes url', async () => {
    const mediaId = nextId('m');
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/docs/spec',
      sharedFields: [{ id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'pdf' }],
    });
    const { tmplId, items: tmplItems } = buildTemplate('f_file', 'File');
    // File field stores XML similar to image: <file mediaid="{GUID}" />
    const item = buildItem(tmplId, 'f_file', `<file mediaid="{${mediaId.toUpperCase()}}" />`);
    const app = await mkApp([...tmplItems, item, media]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_file") {
                __typename
                ... on FileField { url }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('FileField');
      expect(body.data.item.field.url).toContain('/-/media/');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// MediaItemField
// ---------------------------------------------------------------------------

describe('MediaItemField', () => {
  it('resolves __typename as MediaItemField and reads media item fields', async () => {
    const mediaId = nextId('m');
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/docs/media-item-test',
      sharedFields: [
        { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'mp4' },
        { id: MIME_TYPE_FIELD_ID, hint: 'Mime Type', value: 'video/mp4' },
        { id: 'a4f985d9-98b3-4b52-aaaf-4344f6e747c6', hint: 'Title', value: 'Demo Video' },
      ],
    });
    const { tmplId, items: tmplItems } = buildTemplate('f_media', 'Media Item');
    // Media Item field stores a GUID
    const item = buildItem(tmplId, 'f_media', `{${mediaId.toUpperCase()}}`);
    const app = await mkApp([...tmplItems, item, media]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_media") {
                __typename
                ... on MediaItemField { title extension mimeType }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('MediaItemField');
      expect(body.data.item.field.title).toBe('Demo Video');
      expect(body.data.item.field.extension).toBe('mp4');
      expect(body.data.item.field.mimeType).toBe('video/mp4');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// DateField
// ---------------------------------------------------------------------------

describe('DateField', () => {
  it('resolves __typename as DateField and exposes dateValue via interface field', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_date', 'Date');
    const item = buildItem(tmplId, 'f_date', '20260115T123456Z');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_date") {
                __typename
                dateValue
                ... on DateField { formattedDateValue }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('DateField');
      expect(body.data.item.field.dateValue).toBe('2026-01-15T12:34:56Z');
      // formattedDateValue should be non-null for a parseable date
      expect(body.data.item.field.formattedDateValue).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it('resolves __typename as DateField for Datetime type', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_datetime', 'Datetime');
    const item = buildItem(tmplId, 'f_datetime', '20260315T090000Z');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_datetime") { __typename } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('DateField');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// CheckboxField
// ---------------------------------------------------------------------------

describe('CheckboxField', () => {
  it('resolves __typename as CheckboxField and exposes boolValue', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_cb', 'Checkbox');
    const item = buildItem(tmplId, 'f_cb', '1');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_cb") { __typename boolValue } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('CheckboxField');
      expect(body.data.item.field.boolValue).toBe(true);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

describe('NumberField', () => {
  it('resolves __typename as NumberField and exposes numberValue', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_num', 'Number');
    const item = buildItem(tmplId, 'f_num', '3.14');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_num") { __typename numberValue } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('NumberField');
      expect(body.data.item.field.numberValue).toBeCloseTo(3.14);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// IntegerField
// ---------------------------------------------------------------------------

describe('IntegerField', () => {
  it('resolves __typename as IntegerField and exposes intValue', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_int', 'Integer');
    const item = buildItem(tmplId, 'f_int', '42');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_int") {
                __typename
                ... on IntegerField { intValue }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('IntegerField');
      expect(body.data.item.field.intValue).toBe(42);
    } finally {
      await app.close();
    }
  });

  it('intValue returns null for an empty integer field', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_int_empty', 'Integer');
    const item = buildItem(tmplId, 'f_int_empty', '');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_int_empty") { ... on IntegerField { intValue } } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.intValue).toBeNull();
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// LookupField
// ---------------------------------------------------------------------------

describe('LookupField', () => {
  it('resolves __typename as LookupField for Droplink and exposes targetItem', async () => {
    const targetId = nextId('r');
    const target = makeItem({ id: targetId, path: '/sitecore/content/lookup-target' });
    const { tmplId, items: tmplItems } = buildTemplate('f_drop', 'Droplink');
    const item = buildItem(tmplId, 'f_drop', `{${targetId.toUpperCase()}}`);
    const app = await mkApp([...tmplItems, item, target]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_drop") {
                __typename
                ... on LookupField { targetItem { id(format: "D") } }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('LookupField');
      expect(body.data.item.field.targetItem.id).toBe(targetId);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// MultilistField
// ---------------------------------------------------------------------------

describe('MultilistField', () => {
  it('resolves __typename as MultilistField and exposes targetItems + count + targetIds', async () => {
    const id1 = nextId('r');
    const id2 = nextId('r');
    const t1 = makeItem({ id: id1, path: '/sitecore/content/ml-target-a' });
    const t2 = makeItem({ id: id2, path: '/sitecore/content/ml-target-b' });

    const { tmplId, items: tmplItems } = buildTemplate('f_ml', 'Multilist');
    const item = buildItem(
      tmplId,
      'f_ml',
      `{${id1.toUpperCase()}}|{${id2.toUpperCase()}}`,
    );
    const app = await mkApp([...tmplItems, item, t1, t2]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_ml") {
                __typename
                ... on MultilistField {
                  targetItems { id(format: "D") }
                  targetIds
                  count
                }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.__typename).toBe('MultilistField');
      expect(f.count).toBe(2);
      expect(f.targetItems).toHaveLength(2);
      const ids = f.targetItems.map((i: { id: string }) => i.id).sort();
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(f.targetIds).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it('resolves __typename as MultilistField for Treelist type', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_tl', 'Treelist');
    const item = buildItem(tmplId, 'f_tl', '');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_tl") { __typename ... on MultilistField { count } } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('MultilistField');
      expect(body.data.item.field.count).toBe(0);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// NameValueListField
// ---------------------------------------------------------------------------

describe('NameValueListField', () => {
  it('resolves __typename as NameValueListField and exposes parsed values', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_nvl', 'Name Value List');
    const item = buildItem(tmplId, 'f_nvl', 'key1=val1&key2=val2');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{
            item(path: "${item.path}", language: "en") {
              field(name: "f_nvl") {
                __typename
                ... on NameValueListField {
                  values { name value }
                }
              }
            }
          }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      const f = body.data.item.field;
      expect(f.__typename).toBe('NameValueListField');
      expect(f.values).toHaveLength(2);
      expect(f.values[0]).toEqual({ name: 'key1', value: 'val1' });
      expect(f.values[1]).toEqual({ name: 'key2', value: 'val2' });
    } finally {
      await app.close();
    }
  });

  it('returns empty values array for an unset Name Value List field', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_nvl_empty', 'Name Value List');
    const item = buildItem(tmplId, 'f_nvl_empty', '');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_nvl_empty") { ... on NameValueListField { values { name value } } } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.values).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// RichTextField
// ---------------------------------------------------------------------------

describe('RichTextField', () => {
  it('resolves __typename as RichTextField for a Rich Text typed field', async () => {
    const { tmplId, items: tmplItems } = buildTemplate('f_rt', 'Rich Text');
    const item = buildItem(tmplId, 'f_rt', '<p>Hello world</p>');
    const app = await mkApp([...tmplItems, item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "f_rt") { __typename value } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('RichTextField');
      expect(body.data.item.field.value).toContain('Hello world');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback: untyped fields still route to TextField
// ---------------------------------------------------------------------------

describe('TextField fallback', () => {
  it('untyped field (no template declaration) still resolves as TextField', async () => {
    const item = makeItem({
      id: nextId('i'),
      path: '/sitecore/content/test/untyped',
      sharedFields: [{ id: nextId('v'), hint: 'PlainText', value: 'Hello' }],
    });
    const app = await mkApp([item]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/graphql',
        payload: {
          query: `{ item(path: "${item.path}", language: "en") { field(name: "PlainText") { __typename value } } }`,
        },
      });
      const body = res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.item.field.__typename).toBe('TextField');
      expect(body.data.item.field.value).toBe('Hello');
    } finally {
      await app.close();
    }
  });
});
