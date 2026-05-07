import { describe, it, expect } from 'vitest';
import { validateStructural } from '../../../src/engine/validation/structural.js';
import { parseItemFromString } from '../../../src/engine/parser.js';
import type { ScsItem } from '../../../src/engine/types.js';

describe('validateStructural', () => {
  it('returns no errors for a valid item', () => {
    const item = parseItemFromString(`---\nID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "ab86861a-6030-46c5-b394-e8f99e8b87db"\nPath: /sitecore/templates/Test\n`);
    const errors = validateStructural(item, '/test.yml');
    expect(errors).toEqual([]);
  });

  it('reports missing ID', () => {
    const item: ScsItem = {
      id: '', parent: '00000000-0000-0000-0000-000000000000',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', path: '/sitecore/templates/Test',
      sharedFields: [], languages: [],
    };
    const errors = validateStructural(item, '/test.yml');
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'missing-id' }));
  });

  it('reports invalid GUID format', () => {
    const item = parseItemFromString(`---\nID: "not-a-guid"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "ab86861a-6030-46c5-b394-e8f99e8b87db"\nPath: /sitecore/templates/Test\n`);
    const errors = validateStructural(item, '/test.yml');
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'invalid-guid-format' }));
  });

  it('reports missing Template', () => {
    const item = parseItemFromString(`---\nID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\nParent: "00000000-0000-0000-0000-000000000000"\nPath: /sitecore/templates/Test\n`);
    const errors = validateStructural(item, '/test.yml');
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'missing-template' }));
  });

  it('reports missing Path', () => {
    const item = parseItemFromString(`---\nID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "ab86861a-6030-46c5-b394-e8f99e8b87db"\n`);
    const errors = validateStructural(item, '/test.yml');
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'missing-path' }));
  });

  it('reports invalid field type on a template field item', () => {
    const item = parseItemFromString(`---\nID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\nParent: "00000000-0000-0000-0000-000000000000"\nTemplate: "455a3e98-a627-4b40-8035-e683a0331ac7"\nPath: /sitecore/templates/Test/Section/Field\nSharedFields:\n- ID: "ab162cc0-dc80-4abf-8871-998ee5d7ba32"\n  Hint: Type\n  Value: "Invalid Field Type"\n`);
    const errors = validateStructural(item, '/test.yml');
    expect(errors).toContainEqual(expect.objectContaining({ rule: 'invalid-field-type' }));
  });
});
