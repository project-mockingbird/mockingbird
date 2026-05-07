import { describe, it, expect } from 'vitest';
import { validateInheritance } from '../../../src/engine/validation/inheritance.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { TEMPLATE_TEMPLATE_ID, FIELD_IDS, STANDARD_TEMPLATE_ID } from '../../../src/engine/constants.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { Registry } from '../../../src/engine/registry.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname2 = fileURLToPath(new URL('.', import.meta.url));
const REGISTRY_JSON = resolve(__dirname2, '../../fixtures/registry/test-registry.json');

function makeTemplate(id: string, path: string, baseTemplateIds: string[]): ScsItem {
  const baseValue = baseTemplateIds.map(b => `{${b.toUpperCase()}}`).join('|');
  return {
    id, parent: 'root', template: TEMPLATE_TEMPLATE_ID, path,
    sharedFields: baseValue ? [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: baseValue }] : [],
    languages: [],
  };
}

describe('validateInheritance', () => {
  it('returns no errors for a valid inheritance chain', () => {
    const tree = new ItemTree();
    tree.addItem(makeTemplate('base', '/sitecore/templates/Base', [STANDARD_TEMPLATE_ID]), '/b.yml');
    tree.addItem(makeTemplate('child', '/sitecore/templates/Child', ['base']), '/c.yml');
    tree.resolveOrphans();
    expect(validateInheritance(tree)).toEqual([]);
  });

  it('detects direct circular inheritance (A → B → A)', () => {
    const tree = new ItemTree();
    tree.addItem(makeTemplate('a', '/sitecore/templates/A', ['b']), '/a.yml');
    tree.addItem(makeTemplate('b', '/sitecore/templates/B', ['a']), '/b.yml');
    tree.resolveOrphans();
    const errors = validateInheritance(tree);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'circular-inheritance' }));
  });

  it('detects indirect circular inheritance (A → B → C → A)', () => {
    const tree = new ItemTree();
    tree.addItem(makeTemplate('a', '/sitecore/templates/A', ['b']), '/a.yml');
    tree.addItem(makeTemplate('b', '/sitecore/templates/B', ['c']), '/b.yml');
    tree.addItem(makeTemplate('c', '/sitecore/templates/C', ['a']), '/c.yml');
    tree.resolveOrphans();
    const errors = validateInheritance(tree);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'circular-inheritance' }));
  });

  it('detects self-referencing template', () => {
    const tree = new ItemTree();
    tree.addItem(makeTemplate('self', '/sitecore/templates/Self', ['self']), '/s.yml');
    const errors = validateInheritance(tree);
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'circular-inheritance' }));
  });
});

describe('validateInheritance with registry', () => {
  it('treats registry items as terminal nodes — no false cycle', async () => {
    const registry = new Registry();
    await registry.loadFromJson(REGISTRY_JSON);

    const tree = new ItemTree();
    tree.addItem(makeTemplate('user-tmpl', '/sitecore/templates/User', ['aaaaaaaa-bbbb-cccc-dddd-111111111111']), '/u.yml');

    const errors = validateInheritance(tree, registry);
    expect(errors).toEqual([]);
  });
});
