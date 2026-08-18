/**
 * Tests for resolveDisplayIcon - the item -> template `__Icon` fallback that
 * mirrors Sitecore's `ItemAppearance.Icon` -> `TemplateItem.Icon`.
 *
 * Bug: content items whose icon is set only on their TEMPLATE definition item
 * (not on the item or its Standard Values) rendered with no icon in the tree,
 * because the tree read only the item's own `__Icon` (with SV cascade) and
 * never fell back to the template item's `__Icon`.
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { FIELD_IDS } from '../../src/engine/constants.js';
import { resolveDisplayIcon } from '../../src/engine/item-appearance.js';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const WIDGET_TPL = '0d9be3d8-4f1c-401c-820f-73c035ce185d';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return { parent: NULL_GUID, template: NULL_GUID, sharedFields: [], languages: [], ...overrides };
}

function iconField(value: string) {
  return { id: FIELD_IDS.icon, hint: '__Icon', value };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).tree = tree;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).registry = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

describe('resolveDisplayIcon', () => {
  it('falls back to the template item\'s __Icon when the item has none', () => {
    const template = makeItem({
      id: WIDGET_TPL,
      path: '/sitecore/templates/Feature/Widget',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [iconField('Office/32x32/message.png')],
    });
    const content = makeItem({
      id: '0bff4221-68c7-446f-9ec6-0aa062a10a86',
      path: '/sitecore/content/acme/Data/Widgets/First Widget',
      template: WIDGET_TPL,
      // no __Icon on the content item
    });
    const engine = buildEngine([template, content]);
    expect(resolveDisplayIcon(engine, content, 'en')).toBe('Office/32x32/message.png');
  });

  it('prefers the item\'s own __Icon over the template\'s', () => {
    const template = makeItem({
      id: WIDGET_TPL,
      path: '/sitecore/templates/Feature/Widget',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [iconField('Office/32x32/message.png')],
    });
    const content = makeItem({
      id: '0bff4221-68c7-446f-9ec6-0aa062a10a86',
      path: '/sitecore/content/acme/Data/Widgets/First Widget',
      template: WIDGET_TPL,
      sharedFields: [iconField('Applications/32x32/star.png')],
    });
    const engine = buildEngine([template, content]);
    expect(resolveDisplayIcon(engine, content, 'en')).toBe('Applications/32x32/star.png');
  });

  it('returns undefined when neither the item nor its template has an __Icon', () => {
    const template = makeItem({
      id: WIDGET_TPL,
      path: '/sitecore/templates/Feature/Widget',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const content = makeItem({
      id: '0bff4221-68c7-446f-9ec6-0aa062a10a86',
      path: '/sitecore/content/acme/Data/Widgets/First Widget',
      template: WIDGET_TPL,
    });
    const engine = buildEngine([template, content]);
    expect(resolveDisplayIcon(engine, content, 'en')).toBeUndefined();
  });
});
