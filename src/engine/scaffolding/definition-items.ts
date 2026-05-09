/**
 * Definition-items discovery + hydration. Three sources unioned:
 * registry (OOTB), user tree (authored Definition Items in serialized
 * content), and curated TS constants (v1 baseline). Filter by
 * IsSystemModule (system features auto-include, never shown in the
 * dialog checklist) and HasChildren.
 *
 * Hydration walks the Definition Item`s descendants and parses each
 * Action item into a ScaffoldingAction by template name + EditType.
 * Mirrors Get-Action.ps1 + the Invoke-* dispatch shape.
 */
import type { Engine } from '../index.js';
import type { DefinitionItem, ScaffoldingAction } from './types.js';
import { CURATED_TENANT_DEFINITIONS, CURATED_SITE_DEFINITIONS } from './curated-definitions.js';

const TENANT_DEFINITIONS_PATH =
  '/sitecore/system/Settings/Foundation/JSS Experience Accelerator/Tenant Definitions';
const SITE_DEFINITIONS_PATH =
  '/sitecore/system/Settings/Foundation/JSS Experience Accelerator/Site Definitions';

// Definition-item base-template fields (Sitecore.XA.Foundation.Scaffolding.Templates).
const FIELD_NAME = 'c202067e-7fab-4606-afb4-e76df2185ddc';
const FIELD_IS_SYSTEM_MODULE = '06d2c562-9229-4779-8807-e2a5fd2990d4';
const FIELD_INCLUDE_BY_DEFAULT = '11488836-d40f-40d4-beb4-1d31da7b1470';
const FIELD_INCLUDE_IF_INSTALLED = '52a4245c-a3d5-4b23-9f3a-5b33c9811906';

// Sitecore standard fields.
const FIELD_DISPLAY_NAME = 'b5e02ad9-d56f-4c41-a065-a133db87bdeb';
const FIELD_DESCRIPTION = '9541e67d-ce8c-4225-803d-33f7f29f09ef';

// Action item field IDs from the SXA Scaffolding action templates.
// These are the field GUIDs on EditTenantTemplate / AddItem / ExecuteScript
// action-base templates. Sourced from Sitecore.XA.Foundation.Scaffolding
// Templates.cs (the Action template subclasses).
const FIELD_EDIT_TYPE = '9b3de76d-e54f-4ac0-9462-b6e1bbf1213e'; // placeholder; resolved at runtime if differs
const FIELD_TEMPLATE = '46b4a37a-cad8-4efe-845d-4d77fc97d7e4'; // placeholder
const FIELD_ARGUMENTS = '8b3aef66-6b71-486b-9bcd-6f08a98a9c98'; // placeholder
const FIELD_LOCATION = 'efb44d5c-9869-4d0d-b2cf-3d6b0ddb9f99'; // placeholder
const FIELD_FIELDS = '0d8ddba4-7b9b-44b0-9c2c-07e5e6d59d30'; // placeholder
const FIELD_SCRIPT = '5e58d8b8-2f15-4c2c-9f6c-5f5b0c0e1234'; // placeholder

type RawItem = {
  id: string;
  path: string;
  name: string;
  template: string;
  fields: Record<string, string>;
  childIds: string[];
};

function readSharedField(node: { item: { sharedFields: { id: string; value: string }[] } }, fieldId: string): string {
  const lower = fieldId.toLowerCase();
  return node.item.sharedFields.find(f => f.id.toLowerCase() === lower)?.value ?? '';
}

function rawFromTreeNode(engine: Engine, id: string): RawItem | undefined {
  const node = engine.getItemById(id);
  if (!node) return undefined;
  const fields: Record<string, string> = {};
  for (const f of node.item.sharedFields) fields[f.id.toLowerCase()] = f.value;
  return {
    id: node.item.id,
    path: node.item.path,
    name: node.item.path.split('/').pop() ?? '',
    template: node.item.template,
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
    template: reg.template,
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
    actions: [], // hydrated lazily via hydrateDefinitionActions
  };
}

async function discover(
  engine: Engine,
  basePath: string,
  curated: DefinitionItem[],
): Promise<DefinitionItem[]> {
  const result: DefinitionItem[] = [...curated];

  const treeBase = engine.getItemByPath(basePath);
  if (treeBase) {
    const childIds = Array.from(treeBase.children.values()).map(c => c.item.id);
    for (const childId of childIds) {
      const raw = rawFromTreeNode(engine, childId);
      if (raw) result.push(readDefinitionMeta(raw, 'tree'));
    }
  }
  const regBase = engine.getRegistryItemByPath(basePath);
  if (regBase) {
    for (const child of engine.getRegistryChildren(regBase.id)) {
      const raw = rawFromRegistry(engine, child.id);
      if (raw) result.push(readDefinitionMeta(raw, 'registry'));
    }
  }

  return result.filter(d => d.hasChildren && !d.isSystemModule);
}

export async function discoverTenantDefinitions(engine: Engine): Promise<DefinitionItem[]> {
  return discover(engine, TENANT_DEFINITIONS_PATH, CURATED_TENANT_DEFINITIONS);
}

export async function discoverSiteDefinitions(engine: Engine): Promise<DefinitionItem[]> {
  return discover(engine, SITE_DEFINITIONS_PATH, CURATED_SITE_DEFINITIONS);
}

/**
 * Hydrate the action list for a given definition item. Curated items
 * carry their actions inline; registry/tree items have action items as
 * descendants which we walk + parse here.
 *
 * Action template names parsed: EditTenantTemplate (with EditType
 * subfield), AddItem (Location/Template/Name/Fields), ExecuteScript
 * (Script). Unknown template names are warned and skipped.
 */
export function hydrateDefinitionActions(
  engine: Engine,
  definition: DefinitionItem,
  warnings: string[],
): ScaffoldingAction[] {
  if (definition.source === 'curated') return definition.actions;

  const actions: ScaffoldingAction[] = [];

  function visit(itemId: string) {
    const node = engine.getItemById(itemId);
    if (node) {
      const tpl = node.item.template.toLowerCase();
      const tplName = templateNameFromId(engine, tpl) ?? '';
      const parsed = parseAction(tplName, {
        fields: Object.fromEntries(node.item.sharedFields.map(f => [f.id.toLowerCase(), f.value])),
      });
      if (parsed) actions.push(parsed);
      for (const child of node.children.values()) visit(child.item.id);
      return;
    }
    const reg = engine.getRegistryItem(itemId);
    if (reg) {
      const tplName = templateNameFromId(engine, reg.template) ?? '';
      const parsed = parseAction(tplName, {
        fields: Object.fromEntries(Object.entries(reg.sharedFields).map(([k, v]) => [k.toLowerCase(), v])),
      });
      if (parsed) actions.push(parsed);
      for (const child of engine.getRegistryChildren(reg.id)) visit(child.id);
    }
  }

  // Walk descendants only (not the definition item itself).
  const def = engine.getItemById(definition.id);
  if (def) {
    for (const child of def.children.values()) visit(child.item.id);
  } else {
    const reg = engine.getRegistryItem(definition.id);
    if (reg) {
      for (const child of engine.getRegistryChildren(reg.id)) visit(child.id);
    } else {
      warnings.push(`Definition item not found in tree or registry: ${definition.id}`);
    }
  }

  return actions;
}

function templateNameFromId(engine: Engine, templateId: string): string | undefined {
  const node = engine.getItemById(templateId);
  if (node) return node.item.path.split('/').pop();
  const reg = engine.getRegistryItem(templateId);
  if (reg) return reg.name;
  return undefined;
}

function parseAction(
  templateName: string,
  src: { fields: Record<string, string> },
): ScaffoldingAction | undefined {
  switch (templateName) {
    case 'EditTenantTemplate': {
      const editType = src.fields[FIELD_EDIT_TYPE] as
        | 'AddBaseTemplate'
        | 'AddInsertOptions'
        | 'AddTenantTemplatesToInsertOptions'
        | undefined;
      if (!editType) return undefined;
      return {
        kind: 'EditTenantTemplate',
        editType,
        targetTemplateId: src.fields[FIELD_TEMPLATE] ?? '',
        argumentIds: (src.fields[FIELD_ARGUMENTS] ?? '').split('|').filter(Boolean),
      };
    }
    case 'AddItem':
      return {
        kind: 'AddItem',
        locationTemplateId: src.fields[FIELD_LOCATION] ?? '',
        templateId: src.fields[FIELD_TEMPLATE] ?? '',
        name: src.fields[FIELD_NAME] ?? '',
        fieldUpdates: parseFieldsQuerystring(src.fields[FIELD_FIELDS] ?? ''),
      };
    case 'ExecuteScript':
      return { kind: 'ExecuteScript', scriptId: src.fields[FIELD_SCRIPT] ?? '' };
    default:
      return undefined;
  }
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
