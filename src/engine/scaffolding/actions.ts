/**
 * Action dispatcher + per-action ports for the scaffolding orchestrators.
 *
 * Mirrors Sitecore's Invoke-TenantAction (SPE script) which dispatches by
 * action item template name + EditType subfield. Each action variant
 * delegates to a port function so individual actions can be unit-tested
 * in isolation. The orchestrators consume `defaultPorts` for production
 * use; tests can pass mock ports.
 */
import type { Engine } from '../index.js';
import type { ScaffoldingAction } from './types.js';
import { ScaffoldError } from './types.js';

/** Sitecore's BranchTemplate template ID. */
const BRANCH_TEMPLATE_ID = '35E75C72-4985-4E09-88C3-0EAC6CD1E64F'.toLowerCase();
/** __Base template field on a Sitecore Template item. */
const BASE_TEMPLATE_FIELD_ID = '12C33F3F-86C5-43A5-AEB4-5598CEC45116';
/** __Masters field on Standard Values. */
const MASTERS_FIELD_ID = 'B0BF8442-6F77-4F46-A99D-E15F00A3E1F7';
const STANDARD_VALUES_NAME = '__Standard Values';

export type ActionContext = {
  ports: ActionPorts;
  engine: Engine;
  /** Tenant or site item id, depending on caller. */
  contextItemId: string;
  /** Tenant or site item path - used to scope subtree searches. */
  contextItemPath: string;
  /** Resolved tenant template ids for AddInsertOptionAdvanced translation. */
  tenantTemplates: string[];
  language: string;
  /** Accumulating warnings (e.g. ExecuteScript skipped, lookup misses). */
  warnings: string[];
  /** From Invoke-TenantAction's -UpdateTemplate flag. AddItem uses this. */
  updateTemplate: boolean;
};

export type ActionPorts = {
  invokeAddBaseTemplate: (
    action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
    ctx: ActionContext,
  ) => Promise<void>;
  invokeAddInsertOptionsToTemplate: (
    action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
    ctx: ActionContext,
  ) => Promise<void>;
  invokeAddInsertOptionAdvanced: (
    action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
    ctx: ActionContext,
  ) => Promise<void>;
  invokeAddItem: (
    action: Extract<ScaffoldingAction, { kind: 'AddItem' }>,
    ctx: ActionContext,
  ) => Promise<string | undefined>;
  invokeExecuteScript: (
    action: Extract<ScaffoldingAction, { kind: 'ExecuteScript' }>,
    ctx: ActionContext,
  ) => Promise<void>;
};

export async function dispatchAction(action: ScaffoldingAction, ctx: ActionContext): Promise<void> {
  switch (action.kind) {
    case 'EditTenantTemplate': {
      switch (action.editType) {
        case 'AddBaseTemplate':
          await ctx.ports.invokeAddBaseTemplate(action, ctx);
          return;
        case 'AddInsertOptions':
          await ctx.ports.invokeAddInsertOptionsToTemplate(action, ctx);
          return;
        case 'AddTenantTemplatesToInsertOptions':
          await ctx.ports.invokeAddInsertOptionAdvanced(action, ctx);
          return;
        default:
          throw new ScaffoldError(
            'invalid-action',
            `Unknown EditTenantTemplate.editType: ${(action as { editType: string }).editType}`,
          );
      }
    }
    case 'AddItem':
      await ctx.ports.invokeAddItem(action, ctx);
      return;
    case 'ExecuteScript':
      ctx.warnings.push(
        `ExecuteScript action skipped (not supported in v1): scriptId=${action.scriptId}`,
      );
      await ctx.ports.invokeExecuteScript(action, ctx);
      return;
  }
}

function appendIds(existing: string, toAdd: string[]): string {
  const parts = existing ? existing.split('|').filter(Boolean) : [];
  for (const id of toAdd) {
    if (!parts.some(p => p.toLowerCase() === id.toLowerCase())) {
      parts.push(id);
    }
  }
  return parts.join('|');
}

function readField(node: { item: { sharedFields: { id: string; value: string }[] } }, fieldId: string): string {
  const lower = fieldId.toLowerCase();
  return node.item.sharedFields.find(f => f.id.toLowerCase() === lower)?.value ?? '';
}

/**
 * Resolve a prototype id to its template-type GUID. Mirrors the SPE cmdlet's
 * `$baseTemplate.InnerItem.Template.InnerItem.ID`: the prototype is loaded,
 * then ITS template field is the lookup key. Tree-first, registry fallback
 * (prototypes live in the registry on a fresh install).
 */
function resolveLookupKey(engine: Engine, prototypeId: string): string | undefined {
  if (!prototypeId) return undefined;
  const node = engine.getItemById(prototypeId);
  if (node) return node.item.template.toLowerCase();
  const reg = engine.getRegistryItem(prototypeId);
  if (reg) return reg.template.toLowerCase();
  return undefined;
}

/**
 * Find the tenant-local template whose __Base template chain includes
 * `lookupKey`. Mirrors `Get-ProjectTemplateBasedOnBaseTemplate` (direct
 * `__Base template` membership first, then a recursive InheritsFrom walk -
 * collapsed here into a single inheritance walk via `templateInheritsFrom`).
 * Returns the first match; SPE script likewise selects "first one" when
 * multiple match.
 */
function findTenantTemplateByLookupKey(
  engine: Engine,
  tenantTemplates: string[],
  lookupKey: string,
): string | undefined {
  return tenantTemplates.find(tplId => templateInheritsFrom(engine, tplId, lookupKey));
}

export async function defaultInvokeAddBaseTemplate(
  action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
  ctx: ActionContext,
): Promise<void> {
  const lookupKey = resolveLookupKey(ctx.engine, action.prototypeId);
  if (!lookupKey) {
    ctx.warnings.push(
      `AddBaseTemplate skipped: prototype not in tree or registry: ${action.prototypeId}`,
    );
    return;
  }
  const targetId = findTenantTemplateByLookupKey(ctx.engine, ctx.tenantTemplates, lookupKey);
  if (!targetId) {
    ctx.warnings.push(
      `AddBaseTemplate skipped: no tenant-local template inherits from ${lookupKey} (prototype ${action.prototypeId})`,
    );
    return;
  }
  const target = ctx.engine.getItemById(targetId)!;
  const current = readField(target, BASE_TEMPLATE_FIELD_ID);
  const next = appendIds(current, action.argumentIds);
  if (next === current) return;
  const { applyFieldUpdates } = await import('./field-updates.js');
  await applyFieldUpdates(ctx.engine, [
    { itemId: target.item.id, fieldId: BASE_TEMPLATE_FIELD_ID, value: next, language: ctx.language },
  ]);
}

export async function defaultInvokeAddInsertOptionsToTemplate(
  action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
  ctx: ActionContext,
): Promise<void> {
  const lookupKey = resolveLookupKey(ctx.engine, action.prototypeId);
  if (!lookupKey) {
    ctx.warnings.push(
      `AddInsertOptions skipped: prototype not in tree or registry: ${action.prototypeId}`,
    );
    return;
  }
  const targetId = findTenantTemplateByLookupKey(ctx.engine, ctx.tenantTemplates, lookupKey);
  if (!targetId) {
    ctx.warnings.push(
      `AddInsertOptions skipped: no tenant-local template inherits from ${lookupKey} (prototype ${action.prototypeId})`,
    );
    return;
  }
  const target = ctx.engine.getItemById(targetId)!;
  const standardValues = Array.from(target.children.values()).find(
    c => c.item.path.endsWith(`/${STANDARD_VALUES_NAME}`),
  );
  if (!standardValues) {
    ctx.warnings.push(
      `No __Standard Values child under template ${target.item.path}; AddInsertOptions skipped`,
    );
    return;
  }
  const current = readField(standardValues, MASTERS_FIELD_ID);
  const next = appendIds(current, action.argumentIds);
  if (next === current) return;
  const { applyFieldUpdates } = await import('./field-updates.js');
  await applyFieldUpdates(ctx.engine, [
    { itemId: standardValues.item.id, fieldId: MASTERS_FIELD_ID, value: next, language: ctx.language },
  ]);
}

export async function defaultInvokeAddInsertOptionAdvanced(
  action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
  ctx: ActionContext,
): Promise<void> {
  // Mirror Invoke-AddInsertOptionAdvanced.ps1: target template is the
  // tenant-local copy of the prototype's template-type; for each argument
  // (a base-template id) find the tenant-local template inheriting from it
  // and use ITS id as the insert option (not the base-template id directly).
  const lookupKey = resolveLookupKey(ctx.engine, action.prototypeId);
  if (!lookupKey) {
    ctx.warnings.push(
      `AddInsertOptionAdvanced skipped: prototype not in tree or registry: ${action.prototypeId}`,
    );
    return;
  }
  const targetId = findTenantTemplateByLookupKey(ctx.engine, ctx.tenantTemplates, lookupKey);
  if (!targetId) {
    ctx.warnings.push(
      `AddInsertOptionAdvanced skipped: no tenant-local template inherits from ${lookupKey} (prototype ${action.prototypeId})`,
    );
    return;
  }
  const translated: string[] = [];
  for (const baseId of action.argumentIds) {
    const tenantLocal = findTenantTemplateByLookupKey(ctx.engine, ctx.tenantTemplates, baseId);
    if (tenantLocal) {
      translated.push(tenantLocal);
    } else {
      ctx.warnings.push(
        `AddInsertOptionAdvanced: no tenant-local template inherits from ${baseId}; skipping argument`,
      );
    }
  }
  if (translated.length === 0) return;
  await defaultInvokeAddInsertOptionsToTemplate(
    { ...action, argumentIds: translated },
    ctx,
  );
}

export async function defaultInvokeAddItem(
  action: Extract<ScaffoldingAction, { kind: 'AddItem' }>,
  ctx: ActionContext,
): Promise<string | undefined> {
  // The action's `Location` field is a prototype item id (e.g. /sitecore/
  // masters/.../JSS Site/Home). Mirror Invoke-AddItem.ps1: load the
  // prototype, take its template as the lookup key, then BFS the context
  // subtree for a descendant whose template inherits from that key.
  const locationLookupKey = resolveLookupKey(ctx.engine, action.locationPrototypeId);
  if (!locationLookupKey) {
    ctx.warnings.push(
      `AddItem skipped: Location prototype not in tree or registry: ${action.locationPrototypeId}`,
    );
    return undefined;
  }
  const ctxNode = ctx.engine.getItemById(ctx.contextItemId);
  if (!ctxNode) {
    throw new ScaffoldError(
      'parent-not-found',
      `Context item not found: ${ctx.contextItemId}`,
    );
  }
  let parentItemId: string | null = null;
  // BFS over descendants.
  const queue: { id: string }[] = Array.from(ctxNode.children.values()).map(c => ({ id: c.item.id }));
  while (queue.length > 0) {
    const next = queue.shift()!;
    const node = ctx.engine.getItemById(next.id);
    if (!node) continue;
    if (templateInheritsFrom(ctx.engine, node.item.template, locationLookupKey)) {
      parentItemId = node.item.id;
      break;
    }
    for (const child of node.children.values()) queue.push({ id: child.item.id });
  }
  if (!parentItemId) {
    ctx.warnings.push(
      `AddItem: no descendant of ${ctx.contextItemPath} inherits from ${locationLookupKey} (Location prototype ${action.locationPrototypeId})`,
    );
    return undefined;
  }

  // Branch-template-aware duplicate check: if Template is a BranchTemplate,
  // peek at first child's template for the dupe-check key.
  let dupeCheckTemplateId = action.templateId;
  const tplNode = ctx.engine.getItemById(action.templateId);
  const tplReg = tplNode ? null : ctx.engine.getRegistryItem(action.templateId);
  const tplTemplate = (tplNode?.item.template ?? tplReg?.template ?? '').toLowerCase();
  const isBranch = tplTemplate === BRANCH_TEMPLATE_ID;
  if (isBranch) {
    const firstChild = tplNode
      ? Array.from(tplNode.children.values())[0]?.item
      : ctx.engine.getRegistryChildren(action.templateId)[0];
    if (firstChild) dupeCheckTemplateId = firstChild.template;
  }

  const parentNode = ctx.engine.getItemById(parentItemId)!;
  const existing = Array.from(parentNode.children.values()).find(
    c => c.item.template.toLowerCase() === dupeCheckTemplateId.toLowerCase() && itemName(c.item.path) === action.name,
  );
  if (existing) return existing.item.id;

  // Use insertBranch for branch templates (so registry-resident branches
  // also work via Task 5's fallback). For regular templates, use the
  // existing insertItem path.
  if (isBranch) {
    const { insertBranch } = await import('../insert-branch.js');
    const synthBranch = tplNode
      ? tplNode.item
      : (await import('./synthesize.js')).synthesizeRegistryAsScs(tplReg!);
    const result = await insertBranch(ctx.engine, parentNode, synthBranch, action.name);

    if (action.fieldUpdates.length > 0) {
      const { applyFieldUpdates } = await import('./field-updates.js');
      await applyFieldUpdates(
        ctx.engine,
        action.fieldUpdates.map(fu => ({ itemId: result.rootItemId, ...fu, language: ctx.language })),
      );
    }
    return result.rootItemId;
  }

  // Plain template insert.
  const { insertItem } = await import('../insert-item.js');
  const created = await insertItem(ctx.engine, {
    parentId: parentNode.item.id,
    templateId: action.templateId,
    name: action.name,
  });

  if (action.fieldUpdates.length > 0) {
    const { applyFieldUpdates } = await import('./field-updates.js');
    await applyFieldUpdates(
      ctx.engine,
      action.fieldUpdates.map(fu => ({ itemId: created.rootItemId, ...fu, language: ctx.language })),
    );
  }
  return created.rootItemId;
}

async function noopExecuteScript(): Promise<void> {
  // Warning already pushed by dispatchAction.
}

export const defaultPorts: ActionPorts = {
  invokeAddBaseTemplate: defaultInvokeAddBaseTemplate,
  invokeAddInsertOptionsToTemplate: defaultInvokeAddInsertOptionsToTemplate,
  invokeAddInsertOptionAdvanced: defaultInvokeAddInsertOptionAdvanced,
  invokeAddItem: defaultInvokeAddItem,
  invokeExecuteScript: noopExecuteScript,
};

function itemName(path: string): string {
  return path.split('/').pop() ?? '';
}

/**
 * Walk the __Base template chain on `templateId` and check whether
 * `ancestorId` appears anywhere. Mirrors Sitecore's
 * `TemplateManager.GetTemplate(item).InheritsFrom(...)`.
 */
function templateInheritsFrom(engine: Engine, templateId: string, ancestorId: string): boolean {
  const target = ancestorId.toLowerCase();
  const visited = new Set<string>();
  const stack = [templateId.toLowerCase()];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === target) return true;

    const node = engine.getItemById(cur);
    const reg = node ? null : engine.getRegistryItem(cur);
    const baseField = node
      ? node.item.sharedFields.find(f => f.id.toLowerCase() === BASE_TEMPLATE_FIELD_ID.toLowerCase())?.value
      : reg?.sharedFields[BASE_TEMPLATE_FIELD_ID.toLowerCase()] ??
        reg?.sharedFields[BASE_TEMPLATE_FIELD_ID];
    if (!baseField) continue;
    for (const id of baseField.split('|')) {
      const lower = id.toLowerCase().trim();
      if (lower) stack.push(lower);
    }
  }
  return false;
}
