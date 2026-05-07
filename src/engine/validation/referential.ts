import type { ItemTree } from '../tree.js';
import type { ValidationError } from '../types.js';
import type { Registry } from '../registry.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  KNOWN_BUILTIN_TEMPLATE_IDS,
  FIELD_IDS,
  parseBraceGuids,
} from '../constants.js';

/** @deprecated Re-export of {@link parseBraceGuids}. Kept for the small number of in-tree imports.*/
export const parseBaseTemplateValue = parseBraceGuids;

export function validateReferential(tree: ItemTree, registry?: Registry): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of tree.getAllNodes()) {
    const { item } = node;

    // --- Template items: validate base template references ---
    if (item.template === TEMPLATE_TEMPLATE_ID) {
      const baseTemplateField = item.sharedFields.find(f => f.id === FIELD_IDS.baseTemplate);
      if (baseTemplateField && baseTemplateField.value) {
        const baseIds = parseBaseTemplateValue(baseTemplateField.value);
        for (const baseId of baseIds) {
          if (!tree.getById(baseId) && !KNOWN_BUILTIN_TEMPLATE_IDS.has(baseId) && !registry?.has(baseId)) {
            errors.push({
              severity: 'error',
              rule: 'unresolved-base-template',
              message: `Base template "${baseId}" referenced by "${item.path}" does not exist in the tree`,
              itemId: item.id,
              itemPath: item.path,
              filePath: node.filePath,
            });
          }
        }
      }
    }

    // --- Template field items: parent must be a template section ---
    if (item.template === TEMPLATE_FIELD_TEMPLATE_ID) {
      const parentTemplate = node.parentNode?.item.template;
      if (parentTemplate !== TEMPLATE_SECTION_TEMPLATE_ID) {
        errors.push({
          severity: 'error',
          rule: 'field-parent-not-section',
          message: `Template field "${item.path}" must have a template section as its parent`,
          itemId: item.id,
          itemPath: item.path,
          filePath: node.filePath,
        });
      }
    }

    // --- Template section items: parent must be a template ---
    if (item.template === TEMPLATE_SECTION_TEMPLATE_ID) {
      const parentTemplate = node.parentNode?.item.template;
      if (parentTemplate !== TEMPLATE_TEMPLATE_ID) {
        errors.push({
          severity: 'error',
          rule: 'section-parent-not-template',
          message: `Template section "${item.path}" must have a template as its parent`,
          itemId: item.id,
          itemPath: item.path,
          filePath: node.filePath,
        });
      }
    }
  }

  return errors;
}
