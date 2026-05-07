import type { Engine } from './index.js';
import type { ItemNode, ScsItem } from './types.js';
import { sitecoreDate } from './index.js';
import { generateGuid } from './guid.js';
import { BRANCH_TEMPLATE_ID, FIELD_IDS } from './constants.js';
import { getNameVsSiblingsError, getSiblingNames } from './name-validation.js';
import { getTemplateSchema, type TemplateFieldSchema } from './template-schema.js';
import { readFieldViaStandardValuesCascade } from './layout/item-fields.js';
import { expandItemTokens } from './layout/item-tokens.js';
import { insertBranch } from './insert-branch.js';

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
  // 1. Parent must exist
  const parentNode = engine.getItemById(args.parentId);
  if (!parentNode) {
    throw new Error(`Parent item not found: ${args.parentId}`);
  }

  // 2. Template must exist (tree first, registry fallback for OOTB templates)
  const tplNode = engine.getItemById(args.templateId);
  const tplFromTree = tplNode?.item;
  const tplFromRegistry = tplFromTree ? null : engine.getRegistryItem(args.templateId);
  if (!tplFromTree && !tplFromRegistry) {
    throw new Error(`Template not found: ${args.templateId}`);
  }
  // Both shapes expose a normalized lowercase-dashed `id`.
  const templateId = tplFromTree?.id ?? tplFromRegistry!.id;

  // 3. Validate name against existing siblings
  const existingSiblings = getSiblingNames(parentNode);
  const err = getNameVsSiblingsError(args.name, existingSiblings);
  if (err) throw new Error(err);

  // 4. Branch templates dispatch to the multi-item subtree-clone path.
  // Detection mirrors `getInsertOptions`'s `kind: 'branch'` tag: any item
  // whose `template` field equals `Sitecore.Data.TemplateIDs.BranchTemplate`
  // (`BRANCH_TEMPLATE_ID`). This is the same mechanism Sitecore's
  // `BranchItem` uses, so SXA Page Branches under
  // `/sitecore/content/.../Presentation/Page Branches/*` are detected
  // alongside the canonical `/sitecore/templates/Branches/*` location.
  // Branch instantiation requires walking the branch's children, so the
  // tree-resolved item is mandatory; registry-only branch templates aren't
  // supported in v1.
  const tplOfTpl = (tplFromTree?.template ?? tplFromRegistry?.template ?? '').toLowerCase();
  const isBranch = tplOfTpl === BRANCH_TEMPLATE_ID;
  if (isBranch) {
    if (!tplFromTree) {
      throw new Error(`Branch template must be tree-resolved (registry-only branches not supported): ${args.templateId}`);
    }
    return await insertBranch(engine, parentNode, tplFromTree, args.name);
  }

  // Build skeleton item. `__Created` is stamped here (matching the peer
  // create* methods); SV token-expansion fields are walked below.
  const newId = generateGuid();
  const newItem: ScsItem = {
    id: newId,
    parent: parentNode.item.id,
    template: templateId,
    path: `${parentNode.item.path}/${args.name}`,
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

  // Port of `Sitecore.Data.Managers.MasterVariablesReplacer.ReplaceItem`
  // (`Sitecore.Kernel.decompiled.cs:328348`). Sitecore iterates `item.Fields`
  // (a unified own + SV-cascade view) on a freshly-created item and writes
  // expanded values back for any field whose stored/cascaded value contains
  // a `$`-prefixed token.
  //
  // mockingbird port: walk the template's full schema (own + base templates),
  // read each field's RAW SV-cascade value (no expansion), and only when it
  // contains a token, expand and stamp the result. Non-token SV defaults are
  // left unwritten - the read-time cascade in `resolveFieldValue` serves
  // them on every read. This keeps new YAMLs lean and matches Sitecore's
  // observable serialized state (only token-expanded values become "stored").
  expandTokenBearingSvFields(engine, newItem, templateId);

  // Compute the YAML location via the SCS-parity path pipeline. Picks the
  // include scope by longest-prefix match against `parentNode.filePath` so
  // multi-root setups (primary + content) route writes to the parent's
  // root, then runs the SCS algorithm: leaf-prepend or alias substitution,
  // tail hashing for paths exceeding `MaxRelativePathLength`, and
  // filesystem-safe segment encoding. See `child-file-path.ts`.
  const filePath = await engine.writeItemFileAt(
    newItem,
    engine.computeChildFilePath(parentNode.filePath, newItem.path),
  );

  // Make the new item visible without restart
  const newNode = engine.getTree().addItem(newItem, filePath);

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
