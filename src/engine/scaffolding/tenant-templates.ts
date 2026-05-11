/**
 * Per-tenant Template ITEM creation - the missing piece between tenant-folder
 * scaffolding and EditTenantTemplate action dispatch. Mirrors the SPE
 * sequence: Add-TenantTemplate -> Get-SourceTemplate -> New-TenantTemplate.
 *
 * Without this step, /sitecore/templates/Project/<tenant>/ stays empty and
 * every EditTenantTemplate action warn-and-skips ("no tenant-local template
 * inherits from X"). With it, each EditTenantTemplate action finds a real
 * target whose __Base template inherits from the source prototype.
 */
import type { Engine } from '../index.js';
import type { DefinitionItem } from './types.js';

// Sitecore "Template" template - every per-tenant template item uses this
// as its template-of-template, mirroring the SPE script's New-Item
// -ItemType "System/Templates/Template".
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';

// __Base template field on a Template item.
const BASE_TEMPLATE_FIELD_ID = '12c33f3f-86c5-43a5-aeb4-5598cec45116';

// Standard Values child name. SV item's template = the parent template's id
// (so its fields cascade as the SV cascade does in Sitecore).
const STANDARD_VALUES_NAME = '__Standard Values';

/**
 * Resolve a prototype id to its template-type GUID. Tree-first, registry
 * fallback. Mirrors actions.ts's resolveLookupKey.
 */
function resolvePrototypeTemplateId(engine: Engine, prototypeId: string): string | undefined {
  if (!prototypeId) return undefined;
  const node = engine.getItemById(prototypeId);
  if (node) return node.item.template.toLowerCase();
  const reg = engine.getRegistryItem(prototypeId);
  if (reg) return reg.template.toLowerCase();
  return undefined;
}

/**
 * SPE: Get-SourceTemplate - walks each definition's EditTenantTemplate
 * actions, looks up each action's prototype, returns the deduped set of
 * prototype.template.id values. These are the templates that need a
 * per-tenant copy.
 */
export function getSourceTemplateIds(
  engine: Engine,
  definitions: DefinitionItem[],
): string[] {
  const ids = new Set<string>();
  for (const def of definitions) {
    for (const action of def.actions) {
      if (action.kind !== 'EditTenantTemplate') continue;
      const sourceTplId = resolvePrototypeTemplateId(engine, action.prototypeId);
      if (sourceTplId) ids.add(sourceTplId);
    }
  }
  return Array.from(ids);
}
