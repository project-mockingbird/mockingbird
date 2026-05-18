import { describe, it, expect } from 'vitest';
import { validateReferential } from '../../../src/engine/validation/referential.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { TEMPLATE_TEMPLATE_ID, TEMPLATE_SECTION_TEMPLATE_ID, TEMPLATE_FIELD_TEMPLATE_ID, STANDARD_TEMPLATE_ID, FIELD_IDS } from '../../../src/engine/constants.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { Registry } from '../../../src/engine/registry.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname2 = fileURLToPath(new URL('.', import.meta.url));
const REGISTRY_JSON = resolve(__dirname2, '../../fixtures/registry/test-registry.json');

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return { parent: 'root', template: TEMPLATE_TEMPLATE_ID, sharedFields: [], languages: [], ...overrides };
}

describe('validateReferential', () => {
  it('returns no errors when all references resolve', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({
      id: 'tmpl-1', path: '/sitecore/templates/T1', template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${STANDARD_TEMPLATE_ID.toUpperCase()}}` }],
    }), '/t1.yml');
    const errors = validateReferential(tree);
    expect(errors).toEqual([]);
  });

  it('reports unresolved base template reference', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({
      id: 'tmpl-1', path: '/sitecore/templates/T1', template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: '{DEADBEEF-DEAD-DEAD-DEAD-DEADDEADBEEF}' }],
    }), '/t1.yml');
    const errors = validateReferential(tree);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'unresolved-base-template' }));
  });

  it('parses block-scalar (multi-line) base template values, not just pipe-separated', () => {
    // Real-world: long base-template lists are stored as block scalars (Value: |\n  {guid}\n  {guid}). Parser bug treated the whole multi-line string as a single GUID.
    const tree = new ItemTree();
    tree.addItem(makeItem({
      id: 'tmpl-1', path: '/sitecore/templates/T1', template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: FIELD_IDS.baseTemplate,
        hint: '__Base template',
        value: `{${STANDARD_TEMPLATE_ID.toUpperCase()}}\n{DEADBEEF-DEAD-DEAD-DEAD-DEADDEADBEEF}`,
      }],
    }), '/t1.yml');
    const errors = validateReferential(tree);
    // Standard template MUST resolve via the built-in known-id set; only the bogus DEADBEEF should be reported.
    const unresolved = errors.filter(e => e.rule === 'unresolved-base-template');
    expect(unresolved).toHaveLength(1);
    // Strict: message must contain ONLY the deadbeef GUID, not the concatenated mess (a buggy parser would emit a single message containing both GUIDs joined together).
    expect(unresolved[0].message).toMatch(/^Base template "deadbeef-dead-dead-dead-deaddeadbeef" referenced by/);
  });

  it('reports template field whose parent is not a template section', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({ id: 'tmpl-1', path: '/sitecore/templates/T1', template: TEMPLATE_TEMPLATE_ID }), '/t1.yml');
    tree.addItem(makeItem({
      id: 'field-1', parent: 'tmpl-1', path: '/sitecore/templates/T1/Field', template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    }), '/f.yml');
    tree.resolveOrphans();
    const errors = validateReferential(tree);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'field-parent-not-section' }));
  });

  it('reports template section whose parent is not a template', () => {
    const tree = new ItemTree();
    tree.addItem(makeItem({
      id: 'section-1', path: '/sitecore/templates/Orphan/Section', template: TEMPLATE_SECTION_TEMPLATE_ID, parent: 'nonexistent',
    }), '/s.yml');
    const errors = validateReferential(tree);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'section-parent-not-template' }));
  });
});

describe('validateReferential with registry', () => {
  it('resolves base template from registry - no error', async () => {
    const registry = new Registry();
    await registry.loadFromJson(REGISTRY_JSON);

    const tree = new ItemTree();
    tree.addItem(makeItem({
      id: 'user-tmpl',
      path: '/sitecore/templates/Project/Test',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: FIELD_IDS.baseTemplate,
        hint: '__Base template',
        value: '{AAAAAAAA-BBBB-CCCC-DDDD-111111111111}',
      }],
    }), '/t.yml');

    const errors = validateReferential(tree, registry);
    expect(errors).toEqual([]);
  });

  it('still reports unresolved base template when not in registry', async () => {
    const registry = new Registry();
    await registry.loadFromJson(REGISTRY_JSON);

    const tree = new ItemTree();
    tree.addItem(makeItem({
      id: 'user-tmpl',
      path: '/sitecore/templates/Project/Test',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: FIELD_IDS.baseTemplate,
        hint: '__Base template',
        value: '{DEADBEEF-DEAD-DEAD-DEAD-DEADDEADBEEF}',
      }],
    }), '/t.yml');

    const errors = validateReferential(tree, registry);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'unresolved-base-template' }));
  });
});
