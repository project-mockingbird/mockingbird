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
import { insertItemAtParent } from '../insert-item.js';
import type { InsertBranchParent } from '../insert-branch.js';
import { applyFieldUpdates } from './field-updates.js';
import { BASE_TEMPLATE_FIELD_ID, STANDARD_VALUES_NAME, resolveLookupKey } from './scaffold-lookup.js';

// Sitecore "Template" template - every per-tenant template item uses this
// as its template-of-template, mirroring the SPE script's New-Item
// -ItemType "System/Templates/Template".
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';

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
      const sourceTplId = resolveLookupKey(engine, action.prototypeId);
      if (sourceTplId) ids.add(sourceTplId);
    }
  }
  return Array.from(ids);
}

/**
 * SPE: New-TenantTemplate - creates a Template item under the tenant
 * templates root whose __Base template is the source template id, plus a
 * __Standard Values child. Returns the new template id + SV id so callers
 * can wire downstream actions to either.
 *
 * Name comes from the source template item's path leaf (e.g. source at
 * `/sitecore/templates/Foundation/X/Base Page` -> new template named
 * "Base Page"). Caller may pass an explicit `name` to override (the v1
 * port doesn't, but it keeps the API symmetric).
 */
export async function createTenantTemplate(
  engine: Engine,
  parent: InsertBranchParent,
  sourceTemplateId: string,
  name?: string,
): Promise<{ templateId: string; standardValuesId: string }> {
  // Resolve source template to read its name + verify it exists.
  const sourceNode = engine.getItemById(sourceTemplateId);
  const sourceReg = sourceNode ? undefined : engine.getRegistryItem(sourceTemplateId);
  const sourcePath = sourceNode?.item.path ?? sourceReg?.path;
  if (!sourcePath) {
    throw new Error(`Source template not found: ${sourceTemplateId}`);
  }
  const resolvedName = name ?? sourcePath.split('/').pop()!;

  // 1. Create the Template item under parent.
  const tplResult = await insertItemAtParent(engine, parent, {
    templateId: TEMPLATE_TEMPLATE_ID,
    name: resolvedName,
  });
  const templateId = tplResult.rootItemId;

  // 2. Set __Base template to point at the source.
  await applyFieldUpdates(engine, [
    { itemId: templateId, fieldId: BASE_TEMPLATE_FIELD_ID, value: sourceTemplateId },
  ]);

  // 3. Create __Standard Values child whose template = the new template id
  //    (so its fields cascade as SV defaults). Sitecore's CreateStandardValues
  //    does the same: instantiate an item OF the template, named "__Standard Values".
  // Safe: insertItemAtParent above synchronously added the item to the tree.
  const newTplNode = engine.getItemById(templateId)!;
  const svParent: InsertBranchParent = {
    item: { id: newTplNode.item.id, path: newTplNode.item.path },
    filePath: newTplNode.filePath,
  };
  const svResult = await insertItemAtParent(engine, svParent, {
    templateId,
    name: STANDARD_VALUES_NAME,
  });

  return { templateId, standardValuesId: svResult.rootItemId };
}
