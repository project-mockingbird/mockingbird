import type { Engine } from '../index.js';
import {
  TEMPLATE_TEMPLATE_ID,
  BRANCH_TEMPLATE_ID,
  TEMPLATE_FOLDER_TEMPLATE_ID,
  FIELD_IDS,
} from '../constants.js';
import { formatGuidBraced } from '../guid.js';
import { readSharedField } from '../layout/item-fields.js';
import {
  getId,
  getName,
  getMergedChildren,
  lookupUnifiedItemByPath,
  type UnifiedItem,
} from '../layout/unified-item.js';
import type { TemplateMeta } from './types.js';

const TEMPLATES_ROOT = '/sitecore/templates';

/**
 * Templates that are pickable as the basis for new items, plus the four
 * folder/container templates we want to surface as navigation nodes. The set
 * mirrors the folder-template detection in
 * `src/web/components/detail/field-editors/renderings/rendering-tree.ts` so
 * the picker tree behaves consistently with Add Rendering.
 */
const ALLOWED_TEMPLATE_IDS = new Set<string>([
  TEMPLATE_TEMPLATE_ID,
  BRANCH_TEMPLATE_ID,
  TEMPLATE_FOLDER_TEMPLATE_ID,
  '7ee0975b-0698-493e-b3a2-0b2ef33d0522', // Renderings folder
  'a87a00b1-e6db-45ab-8b54-636fec3b5523', // Common/Folder
  '14416946-9839-4651-a12b-308de9415d52', // Node
]);

/**
 * Walk the unified tree+registry under `/sitecore/templates` and return every
 * item whose template is in `ALLOWED_TEMPLATE_IDS`. Pickable items
 * (Template, Branch) and folder/container items are returned together; the
 * client tree-builder distinguishes them by `template` field.
 *
 * Output is sorted by path (ascending). The walker dedupes by id so an item
 * present in both serialized tree and registry only appears once.
 */
export function listTemplates(engine: Engine): TemplateMeta[] {
  const root = lookupUnifiedItemByPath(engine, TEMPLATES_ROOT);
  if (!root) return [];

  const out: TemplateMeta[] = [];
  const seen = new Set<string>([getId(root).toLowerCase()]);
  const stack: UnifiedItem[] = [root];
  let budget = 100_000;

  while (stack.length > 0 && budget-- > 0) {
    const node = stack.pop()!;
    if (node !== root) {
      const id = getId(node).toLowerCase();
      const path = node.kind === 'node' ? node.value.item.path : node.value.path;
      const template = (node.kind === 'node' ? node.value.item.template : node.value.template).toLowerCase();
      if (
        path.toLowerCase().startsWith(TEMPLATES_ROOT + '/') &&
        ALLOWED_TEMPLATE_IDS.has(template)
      ) {
        const name = getName(node);
        if (name.toLowerCase() === '__standard values') {
          // Skip Sitecore data rows - they hold field defaults, not pickable template definitions
          continue;
        }
        const storedDisplay = readSharedField(engine, id, FIELD_IDS.displayName);
        const displayName = storedDisplay && storedDisplay.trim() !== '' ? storedDisplay : name;
        const iconValue = readSharedField(engine, id, FIELD_IDS.icon);
        const sortorderRaw = readSharedField(engine, id, FIELD_IDS.sortorder);
        const meta: TemplateMeta = {
          id: formatGuidBraced(id),
          name,
          displayName,
          path,
          template,
        };
        if (iconValue && iconValue.trim() !== '') meta.icon = iconValue;
        if (sortorderRaw && sortorderRaw.trim() !== '') {
          const n = Number(sortorderRaw);
          if (Number.isFinite(n)) meta.sortOrder = n;
        }
        out.push(meta);
      }
    }
    for (const child of getMergedChildren(node, engine)) {
      const id = getId(child).toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(child);
    }
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
