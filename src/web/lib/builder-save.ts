import type { BuilderChanges } from '@/components/detail/TemplateEditor';

type StructuralChanges = Pick<BuilderChanges, 'newSections' | 'newFields'>;

async function postItem(fetchFn: typeof fetch, body: Record<string, unknown>, label: string): Promise<void> {
  const res = await fetchFn('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create ${label}: ${res.status}`);
}

/**
 * Persist the Builder's staged structural additions (new sections + new
 * fields). The field-value PUT only mutates existing fields; brand-new
 * sections/fields are separate item creations and must go through
 * `POST /api/items`.
 *
 * Sections are created before fields because a new field's parent path is
 * `<templatePath>/<sectionName>` - the section item must already exist in the
 * engine's tree (each create is added synchronously) for `createField` to
 * resolve it.
 */
export async function applyBuilderStructuralChanges(
  templatePath: string,
  changes: StructuralChanges,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  for (const sectionName of changes.newSections) {
    await postItem(
      fetchFn,
      { type: 'section', name: sectionName, parentPath: templatePath },
      `section "${sectionName}"`,
    );
  }
  for (const field of changes.newFields) {
    await postItem(
      fetchFn,
      {
        type: 'field',
        name: field.name,
        fieldType: field.fieldType,
        parentPath: `${templatePath}/${field.sectionName}`,
      },
      `field "${field.name}"`,
    );
  }
}

/**
 * Persist the Builder's staged field-property edits (Type / Source / Shared /
 * Unversioned changes on EXISTING fields).
 *
 * Each key in `fieldUpdates` is a field-DEFINITION item's id, mapping to the
 * property-field GUIDs edited on it. Those properties live on the field item
 * itself (Type/Source/... are shared fields on the Template Field template),
 * so each entry is a PUT to `/api/items/<fieldItemId>` - NOT a write to the
 * template item. Folding these into the template's own field-value PUT (the
 * previous behaviour, via composite `"<fieldId>:<propId>"` keys) wrote a ghost
 * field on the template and lost the value on reload.
 */
export async function applyBuilderFieldPropEdits(
  fieldUpdates: BuilderChanges['fieldUpdates'],
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  for (const [fieldItemId, props] of fieldUpdates) {
    if (Object.keys(props).length === 0) continue;
    const res = await fetchFn(`/api/items/${fieldItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: props }),
    });
    if (!res.ok) throw new Error(`Failed to update field ${fieldItemId}: ${res.status}`);
  }
}
