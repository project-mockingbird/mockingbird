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

export async function defaultInvokeAddBaseTemplate(
  action: Extract<ScaffoldingAction, { kind: 'EditTenantTemplate' }>,
  ctx: ActionContext,
): Promise<void> {
  if (!action.targetTemplateId) {
    ctx.warnings.push(
      'AddBaseTemplate skipped: target template not resolved from action (per-tenant template lookup not yet ported)',
    );
    return;
  }
  const target = ctx.engine.getItemById(action.targetTemplateId);
  if (!target) {
    ctx.warnings.push(
      `AddBaseTemplate skipped: target template not found in tenant tree: ${action.targetTemplateId}`,
    );
    return;
  }
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
  if (!action.targetTemplateId) {
    ctx.warnings.push(
      'AddInsertOptions skipped: target template not resolved from action (per-tenant template lookup not yet ported)',
    );
    return;
  }
  const target = ctx.engine.getItemById(action.targetTemplateId);
  if (!target) {
    ctx.warnings.push(
      `AddInsertOptions skipped: target template not found in tenant tree: ${action.targetTemplateId}`,
    );
    return;
  }
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
  // Translate each base-template argument to its tenant-local equivalent.
  // tenantTemplates is the ID list of templates under the tenant's
  // templates root - find ones that inherit from each base argument.
  const translated: string[] = [];
  for (const baseId of action.argumentIds) {
    const tenantLocal = ctx.tenantTemplates.find(tplId => {
      const tpl = ctx.engine.getItemById(tplId);
      if (!tpl) return false;
      const baseField = readField(tpl, BASE_TEMPLATE_FIELD_ID);
      return baseField
        .split('|')
        .some(b => b.toLowerCase() === baseId.toLowerCase());
    });
    if (tenantLocal) {
      translated.push(tenantLocal);
    } else {
      ctx.warnings.push(
        `AddInsertOptionAdvanced: no tenant-local template inherits from ${baseId}; skipping`,
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
  // Find the first descendant of the context item whose template
  // inherits from action.locationTemplateId. This is the
  // template-keyed inheritance lookup that Invoke-AddItem does in PS.
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
    if (templateInheritsFrom(ctx.engine, node.item.template, action.locationTemplateId)) {
      parentItemId = node.item.id;
      break;
    }
    for (const child of node.children.values()) queue.push({ id: child.item.id });
  }
  if (!parentItemId) {
    ctx.warnings.push(
      `AddItem: no descendant of ${ctx.contextItemPath} inherits from Location template ${action.locationTemplateId}`,
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
