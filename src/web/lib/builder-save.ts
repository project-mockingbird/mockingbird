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
