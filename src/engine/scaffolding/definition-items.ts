/**
 * Definition-items discovery: walk every registry item and match by the
 * setup template GUID (HeadlessTenantSetup or HeadlessSiteSetup). Tree
 * items typed by the same setup templates are unioned in (user-authored
 * Definition Items in serialized content). Filter by IsSystemModule
 * (system features auto-include, never shown in the dialog) + HasChildren
 * + non-Standard-Values.
 *
 * Hydration walks the Definition Item's descendants and parses each
 * Action item into a ScaffoldingAction by matching the item's template
 * against the verified Base + JSS-Tenant + JSS-Site action template
 * GUIDs. Mirrors Get-Action.ps1 + Invoke-* dispatch shape.
 */
import type { Engine } from '../index.js';
import type { DefinitionItem, ScaffoldingAction } from './types.js';

// Setup-template GUIDs (lowercase, dashed) for definition-item discovery.
const HEADLESS_TENANT_SETUP = 'f036b5e0-37fb-4537-9d36-ef84e5bd41b7';
const HEADLESS_SITE_SETUP = 'bed31d6f-d968-45a9-b54e-12d7f977d861';

// Definition-item base-template fields (Sitecore.XA.Foundation.Scaffolding.Templates).
const FIELD_NAME = 'c202067e-7fab-4606-afb4-e76df2185ddc';
const FIELD_IS_SYSTEM_MODULE = '06d2c562-9229-4779-8807-e2a5fd2990d4';
const FIELD_INCLUDE_BY_DEFAULT = '11488836-d40f-40d4-beb4-1d31da7b1470';
const FIELD_INCLUDE_IF_INSTALLED = '52a4245c-a3d5-4b23-9f3a-5b33c9811906';

// Sitecore standard fields.
const FIELD_DISPLAY_NAME = 'b5e02ad9-d56f-4c41-a065-a133db87bdeb';
const FIELD_DESCRIPTION = '9541e67d-ce8c-4225-803d-33f7f29f09ef';

// Action template GUIDs - all three variants (Base + JSS-Tenant + JSS-Site).
// Verified via scripts/inspect-action-guids.mjs against the live registry.
const ACTION_TEMPLATES_ADD_ITEM = new Set([
  'e00120b5-1dbe-4bbb-a950-fab04eb77944', // Base
  '1e1b739e-c378-4909-941d-171aca7362e5', // JSS-Tenant
  '3aea335c-d06d-45b1-841a-cbc8d2d1ce40', // JSS-Site
]);
const ACTION_TEMPLATES_EDIT_TENANT_TEMPLATE = new Set([
  '7c8daa23-490d-4c55-a382-d7380b38fc32', // Base
  '88752f77-9109-424c-b1d8-af91e6369a2e', // JSS-Tenant
]);
const ACTION_TEMPLATES_EDIT_SITE_ITEM = new Set([
  '7a45de57-ceb6-42b3-9a2d-4df639785415', // Base
  'f040db03-87fe-4e10-ae40-53c63175e31b', // JSS-Site
]);
const ACTION_TEMPLATES_EXECUTE_SCRIPT = new Set([
  '3a385b25-df9b-47ac-9f6b-39c8534e81f1', // JSS-Tenant
  'bc9bb684-36df-4285-888b-d8b4d87b10de', // JSS-Site
]);

// Action field GUIDs - verified via scripts/inspect-action-guids.mjs.
const FIELD_ACTION_NAME = '7868e6bc-525c-4fce-ab8a-77da3e09b171';      // AddItem.Name
const FIELD_ACTION_TEMPLATE = 'e62c28f0-9d3b-46e2-8bec-a5e120542499';  // AddItem.Template
const FIELD_ACTION_FIELDS = 'ad0e8de7-f6c1-49fa-b2c4-87e10fbdaa52';    // AddItem.Fields
const FIELD_TENANT_EDIT_TYPE = '614f52cf-d54b-47d1-a242-d9a7d42860f4';
const FIELD_TENANT_ARGUMENTS = 'e830af53-210b-4981-b6a8-f8939f587eb1';
const FIELD_SITE_EDIT_TYPE = '76691b61-8692-4d98-a4ff-115ba4208ab6';
const FIELD_SITE_ARGUMENTS = '58aca5ca-742a-41bb-866f-cfa3764200c8';

// `__Standard Values` items live under each template; exclude from results.
const STANDARD_VALUES_NAME = '__standard values';

type RawItem = {
  id: string;
  path: string;
  name: string;
  template: string;
  fields: Record<string, string>;
  childIds: string[];
};

function rawFromTreeNode(engine: Engine, id: string): RawItem | undefined {
  const node = engine.getItemById(id);
  if (!node) return undefined;
  const fields: Record<string, string> = {};
  for (const f of node.item.sharedFields) fields[f.id.toLowerCase()] = f.value;
  return {
    id: node.item.id,
    path: node.item.path,
    name: node.item.path.split('/').pop() ?? '',
    template: node.item.template.toLowerCase(),
    fields,
    childIds: Array.from(node.children.values()).map(c => c.item.id),
  };
}

function rawFromRegistry(engine: Engine, id: string): RawItem | undefined {
  const reg = engine.getRegistryItem(id);
  if (!reg) return undefined;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(reg.sharedFields)) fields[k.toLowerCase()] = v;
  return {
    id: reg.id,
    path: reg.path,
    name: reg.name,
    template: reg.template.toLowerCase(),
    fields,
    childIds: engine.getRegistryChildren(reg.id).map(c => c.id),
  };
}

function readDefinitionMeta(raw: RawItem, source: 'registry' | 'tree'): DefinitionItem {
  return {
    id: raw.id,
    path: raw.path,
    name: raw.fields[FIELD_NAME] || raw.name,
    displayName: raw.fields[FIELD_DISPLAY_NAME] || undefined,
    description: raw.fields[FIELD_DESCRIPTION] || undefined,
    isSystemModule: raw.fields[FIELD_IS_SYSTEM_MODULE] === '1',
    includeByDefault: raw.fields[FIELD_INCLUDE_BY_DEFAULT] === '1',
    includeIfInstalled: (raw.fields[FIELD_INCLUDE_IF_INSTALLED] || '').split('|').filter(Boolean),
    hasChildren: raw.childIds.length > 0,
    source,
    actions: [],
  };
}

function isUsable(raw: RawItem): boolean {
  // System modules ARE returned (the dialog renders them as locked-checked,
  // and the orchestrator dispatches their actions just like user-selected
  // ones - matches Add-JSSTenant.ps1 behavior). Filter only out
  // `__Standard Values` and items with no children.
  if (raw.name.toLowerCase() === STANDARD_VALUES_NAME) return false;
  if (raw.childIds.length === 0) return false;
  return true;
}

async function discoverByTemplate(
  engine: Engine,
  templateId: string,
): Promise<DefinitionItem[]> {
  const result: DefinitionItem[] = [];
  const seenIds = new Set<string>();

  for (const reg of engine.getRegistryItemsByTemplate(templateId)) {
    const raw = rawFromRegistry(engine, reg.id);
    if (!raw || !isUsable(raw)) continue;
    seenIds.add(raw.id);
    result.push(readDefinitionMeta(raw, 'registry'));
  }

  // Walk the live tree for any user-authored definition items typed
  // by the same setup template (rare but supported).
  const target = templateId.toLowerCase();
  for (const node of engine.getTree().getAllNodes()) {
    if (node.item.template.toLowerCase() !== target) continue;
    if (seenIds.has(node.item.id)) continue;
    const raw = rawFromTreeNode(engine, node.item.id);
    if (!raw || !isUsable(raw)) continue;
    result.push(readDefinitionMeta(raw, 'tree'));
  }

  result.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
  return result;
}

export async function discoverTenantDefinitions(engine: Engine): Promise<DefinitionItem[]> {
  return discoverByTemplate(engine, HEADLESS_TENANT_SETUP);
}

export async function discoverSiteDefinitions(engine: Engine): Promise<DefinitionItem[]> {
  return discoverByTemplate(engine, HEADLESS_SITE_SETUP);
}

/**
 * Hydrate the action list for a given definition item by walking its
 * descendants and parsing each Action item by template GUID.
 */
export function hydrateDefinitionActions(
  engine: Engine,
  definition: DefinitionItem,
  warnings: string[],
): ScaffoldingAction[] {
  const actions: ScaffoldingAction[] = [];

  function visit(itemId: string) {
    const node = engine.getItemById(itemId);
    if (node) {
      const tpl = node.item.template.toLowerCase();
      const fields = Object.fromEntries(node.item.sharedFields.map(f => [f.id.toLowerCase(), f.value]));
      const parsed = parseAction(tpl, fields);
      if (parsed) actions.push(parsed);
      for (const child of node.children.values()) visit(child.item.id);
      return;
    }
    const reg = engine.getRegistryItem(itemId);
    if (reg) {
      const tpl = reg.template.toLowerCase();
      const fields = Object.fromEntries(Object.entries(reg.sharedFields).map(([k, v]) => [k.toLowerCase(), v]));
      const parsed = parseAction(tpl, fields);
      if (parsed) actions.push(parsed);
      for (const child of engine.getRegistryChildren(reg.id)) visit(child.id);
    }
  }

  // Walk descendants only (not the definition item itself).
  const def = engine.getItemById(definition.id);
  if (def) {
    for (const child of def.children.values()) visit(child.item.id);
    return actions;
  }
  const reg = engine.getRegistryItem(definition.id);
  if (reg) {
    for (const child of engine.getRegistryChildren(reg.id)) visit(child.id);
    return actions;
  }
  warnings.push(`Definition item not found in tree or registry: ${definition.id}`);
  return actions;
}

function parseAction(
  templateId: string,
  fields: Record<string, string>,
): ScaffoldingAction | undefined {
  if (ACTION_TEMPLATES_ADD_ITEM.has(templateId)) {
    return {
      kind: 'AddItem',
      locationTemplateId: '',
      templateId: fields[FIELD_ACTION_TEMPLATE] ?? '',
      name: fields[FIELD_ACTION_NAME] ?? '',
      fieldUpdates: parseFieldsQuerystring(fields[FIELD_ACTION_FIELDS] ?? ''),
    };
  }
  if (ACTION_TEMPLATES_EDIT_TENANT_TEMPLATE.has(templateId)) {
    const editType = fields[FIELD_TENANT_EDIT_TYPE] as
      | 'AddBaseTemplate'
      | 'AddInsertOptions'
      | 'AddTenantTemplatesToInsertOptions'
      | undefined;
    if (!editType) return undefined;
    return {
      kind: 'EditTenantTemplate',
      editType,
      targetTemplateId: '',
      argumentIds: (fields[FIELD_TENANT_ARGUMENTS] ?? '').split('|').filter(Boolean),
    };
  }
  if (ACTION_TEMPLATES_EDIT_SITE_ITEM.has(templateId)) {
    // EditSiteItem actions don't fit the EditTenantTemplate variant
    // shape exactly; they target a site descendant + apply field
    // updates. The current dispatcher does not yet implement them
    // (see actions.ts); treat as a future ScaffoldingAction kind and
    // skip with a warning at hydration time. For v1 we surface them
    // as a no-op so the dialog doesn't fail on definitions that ship
    // them.
    void fields[FIELD_SITE_EDIT_TYPE];
    void fields[FIELD_SITE_ARGUMENTS];
    return undefined;
  }
  if (ACTION_TEMPLATES_EXECUTE_SCRIPT.has(templateId)) {
    return { kind: 'ExecuteScript', scriptId: '' };
  }
  return undefined;
}

function parseFieldsQuerystring(qs: string): Array<{ fieldId: string; value: string }> {
  if (!qs) return [];
  const out: Array<{ fieldId: string; value: string }> = [];
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=');
    if (k) out.push({ fieldId: decodeURIComponent(k), value: decodeURIComponent(v ?? '') });
  }
  return out;
}
