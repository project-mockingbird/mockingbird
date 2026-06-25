import type { Engine } from './index.js';
import type { ItemNode, ScsItem } from './types.js';
import { sitecoreDate } from './index.js';
import { generateGuid, formatGuidBraced } from './guid.js';
import {
  BRANCH_TEMPLATE_ID,
  COMMAND_MASTER_TEMPLATE_ID,
  COMMAND_FIELD_ID,
  FIELD_IDS,
  TEMPLATE_TEMPLATE_ID,
  STANDARD_TEMPLATE_ID,
  producedTemplateForCommand,
} from './constants.js';
import { getNameVsSiblingsError, getSiblingNames } from './name-validation.js';
import { getTemplateSchema, type TemplateFieldSchema } from './template-schema.js';
import { readFieldViaStandardValuesCascade } from './layout/item-fields.js';
import { expandItemTokens } from './layout/item-tokens.js';
import { insertBranch, type InsertBranchParent } from './insert-branch.js';

/**
 * Sitecore's `MasterVariablesReplacer.ReplaceItem` recognizes seven default
 * tokens (`$name`, `$id`, `$parentname`, `$parentid`, `$date`, `$time`,
 * `$now`). Match the same set so non-token-bearing SV values stay on the
 * read-time cascade (avoids serializing every SV value onto every new item).
 *
 * `\b` ensures `$name1` doesn't trigger expansion. Case-sensitive to mirror
 * Sitecore's `MasterVariablesReplacer` which uses `string.Replace("$name", ...)`
 * with .NET default (ordinal, case-sensitive) semantics. `$NAME` is left
 * literal so it is filtered out here, and the SV cascade serves the literal
 * at read time rather than persisting it onto every new item.
 */
const TOKEN_REGEX = /\$(name|id|parentname|parentid|date|time|now)\b/;

export type InsertItemArgs = {
  parentId: string;
  templateId: string;
  name: string;
  /**
   * Base template assigned to the new item when it is a Template definition
   * (its resolved template is `TEMPLATE_TEMPLATE_ID`). Defaults to Standard
   * template. Ignored for non-template inserts (folders, content items).
   */
  baseTemplateId?: string;
};

export type InsertItemResult = {
  rootItemId: string;
  createdItems: ItemNode[];
};

/**
 * Single-template item creation entry point. Mirrors Sitecore's
 * `Item.Add(string name, TemplateID templateId)` shape.
 *
 * Validation order (Sitecore canonical):
 *   1. Parent exists in the unified tree+registry.
 *   2. Template exists. Both the serialized tree AND the OOTB registry are
 *      consulted; either constitutes a valid template for skeleton creation.
 *      Tree wins when both contain the id (a project override of an OOTB
 *      template). The SV cascade walk uses `readFieldViaStandardValuesCascade`,
 *      which handles registry-only SVs, so a registry-only template resolves
 *      fields correctly there too.
 *   3. Name passes `getNameVsSiblingsError` (format check + sibling
 *      uniqueness, case-insensitive). Sitecore default
 *      `AllowDuplicateItemNamesOnSameLevel = false`.
 *
 * After the skeleton is built, {@link expandTokenBearingSvFields} ports
 * Sitecore's `MasterVariablesReplacer.ReplaceItem`
 * (`Sitecore.Kernel.decompiled.cs:328348`): token-bearing SV defaults are
 * expanded against the new item's context and stamped onto the item;
 * non-token SV defaults are left to the read-time cascade.
 */
export async function insertItem(engine: Engine, args: InsertItemArgs): Promise<InsertItemResult> {
  // 1. Parent must exist (tree only - registry-only parents go through
  //    insertItemAtParent, which the orchestrators use for cross-cutting
  //    folder roots like /sitecore/templates/Project).
  const parentNode = engine.getItemById(args.parentId);
  if (!parentNode) {
    throw new Error(`Parent item not found: ${args.parentId}`);
  }
  return insertItemAtParent(
    engine,
    { item: { id: parentNode.item.id, path: parentNode.item.path }, filePath: parentNode.filePath },
    { templateId: args.templateId, name: args.name, baseTemplateId: args.baseTemplateId },
  );
}

export type InsertItemAtParentArgs = {
  templateId: string;
  name: string;
  /** See {@link InsertItemArgs.baseTemplateId}. */
  baseTemplateId?: string;
};

/**
 * Lower-level insert-item primitive that takes a pre-resolved
 * {@link InsertBranchParent}. Lets callers (notably the SXA scaffolding
 * orchestrators) target registry-only roots like `/sitecore/templates/Project`
 * without first materializing them into the serialized tree.
 *
 * Sibling-name collision check considers both the tree children of the
 * resolved parent (when one exists) AND the OOTB registry children, so a
 * tenant folder name that already exists at the registry level still trips
 * the collision check rather than being silently shadowed.
 *
 * Branch templates require a tree-resolved parent ItemNode (the branch
 * walker uses tree state for descendant ordering); registry-only parents
 * trying to instantiate a branch template throw, matching the existing
 * registry-only-branch limitation.
 */
export async function insertItemAtParent(
  engine: Engine,
  parent: InsertBranchParent,
  args: InsertItemAtParentArgs,
): Promise<InsertItemResult> {
  // 1. Template must exist (tree first, registry fallback for OOTB templates)
  const tplNode = engine.getItemById(args.templateId);
  const tplFromTree = tplNode?.item;
  const tplFromRegistry = tplFromTree ? null : engine.getRegistryItem(args.templateId);
  if (!tplFromTree && !tplFromRegistry) {
    throw new Error(`Template not found: ${args.templateId}`);
  }
  // The master's own template decides how Sitecore inserts it (ported from
  // Sitecore.Kernel `AddMaster.Add`): CommandMaster -> run its `Command`;
  // BranchTemplate -> clone the branch subtree; otherwise -> create an item
  // ON the master template.
  const masterTpl = (tplFromTree?.template ?? tplFromRegistry?.template ?? '').toLowerCase();

  // 2. Validate name against existing siblings (tree + registry combined).
  const parentTreeNode = engine.getItemById(parent.item.id);
  const treeSiblings = parentTreeNode ? getSiblingNames(parentTreeNode) : [];
  const registrySiblings = engine
    .getRegistryChildren(parent.item.id)
    .map(c => c.path.split('/').pop() ?? '')
    .filter(Boolean);
  const existingSiblings = [...treeSiblings, ...registrySiblings];
  const err = getNameVsSiblingsError(args.name, existingSiblings);
  if (err) throw new Error(err);

  // 3. Branch templates dispatch to the multi-item subtree-clone path.
  if (masterTpl === BRANCH_TEMPLATE_ID) {
    if (!tplFromTree) {
      throw new Error(`Branch template must be tree-resolved (registry-only branches not supported): ${args.templateId}`);
    }
    return await insertBranch(engine, parent, tplFromTree, args.name);
  }

  // 4. Resolve the template the new item is created ON. A Command Master
  // (Sitecore `TemplateIDs.CommandMaster`, e.g. the OOTB "New Template") is NOT
  // the new item's template - AddMaster runs the master's `Command` (e.g.
  // `templates:new`, which creates a Template item). Resolve the produced
  // template so the skeleton below is the correct type, rather than an orphan
  // typed on the command master item itself.
  let templateId = tplFromTree?.id ?? tplFromRegistry!.id;
  if (masterTpl === COMMAND_MASTER_TEMPLATE_ID) {
    const commandValue = tplFromTree
      ? tplFromTree.sharedFields.find(f => f.id === COMMAND_FIELD_ID)?.value
      : tplFromRegistry!.sharedFields[COMMAND_FIELD_ID];
    const produced = producedTemplateForCommand(commandValue);
    if (!produced) {
      throw new Error(
        `Unsupported command template "${tplFromTree?.path ?? tplFromRegistry?.path ?? args.templateId}"` +
        ` (command: ${commandValue ?? 'none'})`,
      );
    }
    templateId = produced;
  }

  // Build skeleton item.
  const newId = generateGuid();
  const newItem: ScsItem = {
    id: newId,
    parent: parent.item.id,
    template: templateId,
    path: `${parent.item.path}/${args.name}`,
    sharedFields: [],
    languages: [
      {
        language: 'en',
        fields: [],
        versions: [
          {
            version: 1,
            fields: [
              { id: FIELD_IDS.created, hint: '__Created', value: sitecoreDate() },
            ],
          },
        ],
      },
    ],
  };

  // New Template definitions inherit a base template (CE parity: the create
  // dialog assigns one, defaulting to Standard template). Only applies when the
  // new item IS a Template - ordinary content/folder inserts get no base.
  if (templateId === TEMPLATE_TEMPLATE_ID) {
    newItem.sharedFields.push({
      id: FIELD_IDS.baseTemplate,
      hint: '__Base template',
      value: formatGuidBraced(args.baseTemplateId ?? STANDARD_TEMPLATE_ID),
    });
  }

  expandTokenBearingSvFields(engine, newItem, templateId);

  const filePath = await engine.writeItemFileAt(
    newItem,
    engine.computeChildFilePath(parent.filePath, newItem.path),
  );

  const newNode = engine.addCreatedItem(newItem, filePath);

  return { rootItemId: newId, createdItems: [newNode] };
}

/**
 * Walk every field in the template's full schema (own + base templates) and,
 * for any field whose SV-cascaded value carries a `$`-token, expand against
 * the new item's context and stamp the result onto the item in the correct
 * scope (shared / unversioned / versioned).
 *
 * Why `readFieldViaStandardValuesCascade` and not `readFieldWithSvFallback`:
 * the new item has zero stored fields here (skeleton-only), so both readers
 * collapse to the same SV walk. Calling the cascade reader directly skips
 * the redundant own-field check. Neither reader applies token expansion -
 * that contract belongs to `resolveFieldValue` (read-time, layout-pipeline)
 * and `expandItemTokens` (this call site, write-time MVR port).
 *
 * `__Created` was already stamped on the skeleton; the writer here skips
 * any field id already present on the targeted version's field list, so
 * an SV `__Created` default with a literal `$now` (rare but legal) won't
 * double-write or clobber the canonical `sitecoreDate()` stamp.
 */
function expandTokenBearingSvFields(engine: Engine, newItem: ScsItem, templateId: string): void {
  const schema = getTemplateSchema(templateId, engine);
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const raw = readFieldViaStandardValuesCascade(engine, templateId, field.id, 'en');
      if (!raw) continue;
      if (!TOKEN_REGEX.test(raw)) continue;
      const expanded = expandItemTokens(raw, newItem, engine);
      writeFieldOnItem(newItem, field.id, expanded, scopeOfField(field));
    }
  }
}

function writeFieldOnItem(
  item: ScsItem,
  fieldId: string,
  value: string,
  scope: 'shared' | 'unversioned' | 'versioned',
): void {
  if (scope === 'shared') {
    if (item.sharedFields.some(f => f.id === fieldId)) return;
    item.sharedFields.push({ id: fieldId, hint: '', value });
    return;
  }
  let lang = item.languages.find(l => l.language === 'en');
  if (!lang) {
    lang = { language: 'en', fields: [], versions: [] };
    item.languages.push(lang);
  }
  if (scope === 'unversioned') {
    if (lang.fields.some(f => f.id === fieldId)) return;
    lang.fields.push({ id: fieldId, hint: '', value });
    return;
  }
  let ver = lang.versions.find(v => v.version === 1);
  if (!ver) {
    ver = { version: 1, fields: [] };
    lang.versions.push(ver);
  }
  // Don't double-stamp a field already written on the skeleton (e.g. `__Created`).
  if (ver.fields.some(f => f.id === fieldId)) return;
  ver.fields.push({ id: fieldId, hint: '', value });
}

function scopeOfField(f: TemplateFieldSchema): 'shared' | 'unversioned' | 'versioned' {
  if (f.shared) return 'shared';
  if (f.unversioned) return 'unversioned';
  return 'versioned';
}
