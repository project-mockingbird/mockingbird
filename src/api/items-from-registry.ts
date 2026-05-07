import type { Engine } from '../engine/index.js';
import type { RegistryItem, ScsField } from '../engine/types.js';
import { classifyItem } from '../engine/constants.js';
import { resolveFieldValue } from './resolve.js';

/**
 * Build an ItemDetail-shaped response from a RegistryItem. Mirrors
 * src/api/routes/items.ts::serializeItemNode but for registry-only items
 * (which have no on-disk YAML, no ItemNode, no versioned/per-language data
 * because the v4.0 registry baker captures shared fields only).
 *
 * Returns a plain object so it can be sent over the wire alongside the
 * existing serializeItemNode shape. The `source: 'registry'` discriminator
 * tells the client to render this in read-only mode.
 */
export function buildRegistryItemDetail(item: RegistryItem, engine: Engine): Record<string, unknown> {
  const sharedFields: ScsField[] = Object.entries(item.sharedFields).map(([id, value]) => ({
    id,
    hint: '',
    value,
  }));

  const resolvedFields: Record<string, string> = {};
  for (const field of sharedFields) {
    if (!field.value) continue;
    const resolved = resolveFieldValue(field.value, engine);
    if (resolved !== field.value) {
      resolvedFields[field.id] = resolved;
    }
  }

  return {
    source: 'registry',
    id: item.id,
    name: item.name,
    path: item.path,
    template: item.template,
    parent: item.parent,
    type: classifyItem(item.template),
    filePath: '',
    sharedFields,
    languages: [],
    resolvedFields: Object.keys(resolvedFields).length > 0 ? resolvedFields : undefined,
    templateResolved: resolveFieldValue(`{${item.template}}`, engine),
    fileSizeBytes: undefined,
  };
}
