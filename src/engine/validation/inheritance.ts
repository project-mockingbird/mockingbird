import type { ItemTree } from '../tree.js';
import type { ValidationError } from '../types.js';
import type { Registry } from '../registry.js';
import { TEMPLATE_TEMPLATE_ID, KNOWN_BUILTIN_TEMPLATE_IDS, FIELD_IDS } from '../constants.js';
import { parseBaseTemplateValue } from './referential.js';

export function validateInheritance(tree: ItemTree, registry?: Registry): ValidationError[] {
  const errors: ValidationError[] = [];
  // Track globally which template IDs have already been fully verified (no cycle found)
  const verified = new Set<string>();

  for (const node of tree.getAllNodes()) {
    if (node.item.template !== TEMPLATE_TEMPLATE_ID) continue;
    if (verified.has(node.item.id)) continue;

    // DFS using an explicit path set for cycle detection
    const path = new Set<string>();
    detectCycle(node.item.id, tree, path, verified, errors, registry);
  }

  return errors;
}

function getBaseTemplateIds(templateId: string, tree: ItemTree): string[] {
  const node = tree.getById(templateId);
  if (!node) return [];
  const baseField = node.item.sharedFields.find(f => f.id === FIELD_IDS.baseTemplate);
  if (!baseField || !baseField.value) return [];
  return parseBaseTemplateValue(baseField.value);
}

function detectCycle(
  templateId: string,
  tree: ItemTree,
  path: Set<string>,
  verified: Set<string>,
  errors: ValidationError[],
  registry?: Registry,
): void {
  // Self-reference or cycle detected
  if (path.has(templateId)) {
    const node = tree.getById(templateId);
    errors.push({
      severity: 'error',
      rule: 'circular-inheritance',
      message: `Circular inheritance detected involving template "${node?.item.path ?? templateId}"`,
      itemId: templateId,
      itemPath: node?.item.path,
      filePath: node?.filePath ?? '',
    });
    return;
  }

  // Skip already-verified or known terminal templates
  if (verified.has(templateId) || KNOWN_BUILTIN_TEMPLATE_IDS.has(templateId) || registry?.has(templateId)) return;

  // Skip templates not in tree (unresolved reference - referential validator handles that)
  if (!tree.getById(templateId)) return;

  path.add(templateId);

  for (const baseId of getBaseTemplateIds(templateId, tree)) {
    detectCycle(baseId, tree, path, verified, errors, registry);
  }

  path.delete(templateId);
  verified.add(templateId);
}
