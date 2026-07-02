import type { Engine } from './index.js';
import {
  FIELD_IDS,
  BRANCH_TEMPLATE_ID,
  COMMAND_MASTER_TEMPLATE_ID,
  COMMAND_FIELD_ID,
  producedTemplateForCommand,
} from './constants.js';
import { parseGuidList } from './guid.js';
import { readFieldWithSvFallback, readFieldViaStandardValuesCascade } from './layout/item-fields.js';

export type InsertOption = {
  /** Canonical lowercased GUID, no braces. */
  templateId: string;
  /** Display name for the menu row. */
  templateName: string;
  /** Full Sitecore path - useful for tooltip / debugging. */
  templatePath: string;
  /** `branch` when the resolved item's `template` equals `BRANCH_TEMPLATE_ID`, else `template`. */
  kind: 'template' | 'branch';
};

/**
 * Resolve Insert Options for an item, in Sitecore-canonical order:
 *   1. Item's own `__Masters` shared field (rare per-item override).
 *   2. Item template's `__Standard Values.__Masters` (common case;
 *      base-template SV chain handled by `readFieldWithSvFallback`).
 *
 * Each resolved Master GUID is looked up in the unified tree+registry.
 * GUIDs that don't resolve are skipped silently. Field order preserved.
 *
 * Branch detection: the resolved item's `template` field equals
 * `Sitecore.Data.TemplateIDs.BranchTemplate` (`BRANCH_TEMPLATE_ID`). This
 * matches Sitecore's `BranchItem` mechanism (template-id, not path), so SXA
 * Page Branches under `/sitecore/content/.../Presentation/Page Branches/*`
 * are detected correctly alongside `/sitecore/templates/Branches/*`.
 */
export function getInsertOptions(engine: Engine, itemId: string): InsertOption[] {
  const node = engine.getItemById(itemId);
  const item = node?.item;
  // Registry-only parents (OOTB items not serialized in any layer) resolve
  // their insert options from the baked registry instead of the tree.
  const reg = item ? undefined : engine.getRegistryItem(itemId);

  // Resolve the parent's `__Masters` value: item-own field first, then the
  // template `__Standard Values` cascade. Works for both tree and registry parents.
  let mastersValue = '';
  if (item) {
    const own = item.sharedFields.find(f => f.id === FIELD_IDS.masters);
    if (own?.value) mastersValue = own.value;
    if (!mastersValue) {
      const svValue = readFieldWithSvFallback(engine, item, FIELD_IDS.masters, 'en');
      if (svValue) mastersValue = svValue;
    }
  } else if (reg) {
    const own = reg.sharedFields[FIELD_IDS.masters];
    if (own) mastersValue = own;
    if (!mastersValue) {
      const svValue = readFieldViaStandardValuesCascade(engine, reg.template, FIELD_IDS.masters, 'en');
      if (svValue) mastersValue = svValue;
    }
  }

  if (!mastersValue) return [];

  const guids = parseGuidList(mastersValue);
  const results: InsertOption[] = [];
  for (const guid of guids) {
    const resolved = engine.getItemById(guid);
    const reg = resolved ? undefined : engine.getRegistryItem(guid);
    const path = resolved?.item.path ?? reg?.path;
    const name = resolved
      ? resolved.item.path.split('/').pop()
      : reg?.name;
    if (!path || !name) continue; // unresolvable - skip silently
    const tplOfTpl = (resolved?.item.template ?? reg?.template ?? '').toLowerCase();
    // Command Masters (Sitecore `TemplateIDs.CommandMaster`, e.g. "New
    // Template") are not real templates: AddMaster runs their `Command` field
    // (e.g. `templates:new`, which creates a Template). Surface the PRODUCED
    // template as the option's templateId so the insert makes the right item
    // type, keeping the master's display name ("New Template"). An unknown
    // command master is skipped rather than offered as a broken insert.
    let templateId = guid;
    if (tplOfTpl === COMMAND_MASTER_TEMPLATE_ID) {
      const commandValue = resolved
        ? resolved.item.sharedFields.find(f => f.id === COMMAND_FIELD_ID)?.value
        : reg!.sharedFields[COMMAND_FIELD_ID];
      const produced = producedTemplateForCommand(commandValue);
      if (!produced) continue;
      templateId = produced;
    }
    results.push({
      templateId,
      templateName: name,
      templatePath: path,
      kind: tplOfTpl === BRANCH_TEMPLATE_ID ? 'branch' : 'template',
    });
  }
  return results;
}
