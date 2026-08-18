import { describe, it, expect } from 'vitest';
import { saveInvalidationKeys } from './save-invalidation';

describe('saveInvalidationKeys', () => {
  it('invalidates only the edited item\'s template-schema for a content-value save', () => {
    const keys = saveInvalidationKeys('item-1', false);
    // Targeted: the item's own schema entry.
    expect(keys).toContainEqual(['template-schema', 'item-1']);
    // NOT the broad family key.
    expect(keys).not.toContainEqual(['template-schema']);
  });

  it('invalidates the WHOLE template-schema family for a structural/field-property save', () => {
    // Editing a template field (e.g. its Source) changes the schema for every
    // content item built on that template - each caches its own
    // ['template-schema', <id>] with staleTime Infinity - so the broad,
    // prefix-matching key must be used to refresh them all.
    const keys = saveInvalidationKeys('template-1', true);
    expect(keys).toContainEqual(['template-schema']);
    // Must NOT narrow to the template's own id (that would leave content items stale).
    expect(keys).not.toContainEqual(['template-schema', 'template-1']);
  });

  it('always refreshes the item, tree, and layout-derived queries', () => {
    for (const structural of [false, true]) {
      const keys = saveInvalidationKeys('x', structural);
      expect(keys).toContainEqual(['item', 'x']);
      expect(keys).toContainEqual(['tree']);
      expect(keys).toContainEqual(['unused-datasources', 'x']);
      expect(keys).toContainEqual(['composed-layout']);
      expect(keys).toContainEqual(['placeholder-paths']);
    }
  });
});
