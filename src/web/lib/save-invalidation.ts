/**
 * The react-query keys to invalidate after saving an item in the detail pane.
 *
 * The template-schema entry is the subtle one: content items cache their own
 * `['template-schema', <id>]` with `staleTime: Infinity`. A structural /
 * field-property edit (adding a section/field, or changing a field's
 * Type/Source/Shared/Unversioned) changes the schema for EVERY item built on
 * that template, so we invalidate the whole `['template-schema']` family
 * (react-query prefix-matches, refreshing all `['template-schema', <id>]`
 * entries). A plain content-value save only affects the edited item, so it
 * narrows to that item's own entry.
 *
 * Kept as a pure function so the invalidation contract is unit-testable without
 * rendering the detail pane.
 */
export function saveInvalidationKeys(
  itemId: string,
  hadStructuralChange: boolean,
): (readonly unknown[])[] {
  const schemaKey = hadStructuralChange
    ? ['template-schema']
    : ['template-schema', itemId];
  return [
    ['item', itemId],
    schemaKey,
    ['tree'],
    ['unused-datasources', itemId],
    // Layout-derived queries depend on __Final Renderings; refresh them so a
    // just-added rendering's discovered child placeholders appear after Save.
    ['composed-layout'],
    ['placeholder-paths'],
  ];
}
