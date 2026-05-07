/**
 * resolveDatasourceFields - resolves the Datasource Template and Datasource
 * Location field VALUES for a given rendering item.
 *
 * Sitecore mechanism: rendering code reads these as
 *   args.RenderingItem["Datasource Template"]
 *   args.RenderingItem["Datasource Location"]
 * which routes through Sitecore's `Item.Fields["HintName"]` contract: the
 * template definition is the source of truth for name->id mapping.
 *
 * Implementation: walk the rendering's template base chain via
 * resolveFieldIdByHintOnTemplate, then read the resolved field IDs from the
 * rendering item's shared fields (registry-aware via readSharedField).
 *
 * Why not reuse readSharedFieldByHint (item-fields.ts):
 * That helper short-circuits to the serialized field's hint property for
 * tree items. Datasource Template / Location fields are typically declared
 * on the rendering's base template (Json Rendering / Rendering Options),
 * not on the rendering item itself, so we must always walk the template
 * chain via resolveFieldIdByHintOnTemplate.
 *
 * Returns null when the rendering id does not exist; returns an object with
 * undefined fields when the template chain has no field by those names or
 * the rendering does not store a value for them.
 */

import type { Engine } from '../index.js';
import { readSharedField } from '../layout/item-fields.js';
import { resolveFieldIdByHintOnTemplate } from '../layout/template-fields.js';
import { lookupUnifiedItem, getTemplate } from '../layout/unified-item.js';

const HINT_DATASOURCE_TEMPLATE = 'Datasource Template';
const HINT_DATASOURCE_LOCATION = 'Datasource Location';

export interface DatasourceFields {
  datasourceTemplate?: string;  // braced uppercase GUID, or undefined
  datasourceLocation?: string;  // path or GUID string, or undefined
}

export function resolveDatasourceFields(
  engine: Engine,
  renderingId: string,
): DatasourceFields | null {
  const node = lookupUnifiedItem(renderingId, engine);
  if (!node) return null;

  const templateId = getTemplate(node);
  if (!templateId) return {};

  const templateFieldId = resolveFieldIdByHintOnTemplate(engine, templateId, HINT_DATASOURCE_TEMPLATE);
  const locationFieldId = resolveFieldIdByHintOnTemplate(engine, templateId, HINT_DATASOURCE_LOCATION);

  const result: DatasourceFields = {};

  if (templateFieldId) {
    const raw = readSharedField(engine, renderingId, templateFieldId);
    if (raw !== undefined && raw.trim() !== '') {
      const trimmed = raw.trim();
      result.datasourceTemplate = /^\{[0-9a-fA-F-]{36}\}$/.test(trimmed)
        ? trimmed.toUpperCase()
        : trimmed;
    }
  }

  if (locationFieldId) {
    const raw = readSharedField(engine, renderingId, locationFieldId);
    if (raw !== undefined && raw.trim() !== '') {
      result.datasourceLocation = raw.trim();
    }
  }

  return result;
}
