import type { ScsItem, ValidationError } from '../types.js';
import { TEMPLATE_FIELD_TEMPLATE_ID, FIELD_IDS, VALID_FIELD_TYPES } from '../constants.js';

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isValidGuid(value: string): boolean {
  return GUID_REGEX.test(value);
}

export function validateStructural(item: ScsItem, filePath: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check ID exists
  if (!item.id) {
    errors.push({
      severity: 'error',
      rule: 'missing-id',
      message: 'Item is missing an ID',
      itemPath: item.path,
      filePath,
    });
  } else if (!isValidGuid(item.id)) {
    errors.push({
      severity: 'error',
      rule: 'invalid-guid-format',
      message: `Item ID "${item.id}" is not a valid GUID`,
      itemId: item.id,
      itemPath: item.path,
      filePath,
    });
  }

  // Check Parent exists and is valid GUID
  if (item.parent && !isValidGuid(item.parent)) {
    errors.push({
      severity: 'error',
      rule: 'invalid-guid-format',
      message: `Item Parent "${item.parent}" is not a valid GUID`,
      itemId: item.id,
      itemPath: item.path,
      filePath,
    });
  }

  // Check Template exists
  if (!item.template) {
    errors.push({
      severity: 'error',
      rule: 'missing-template',
      message: 'Item is missing a Template',
      itemId: item.id,
      itemPath: item.path,
      filePath,
    });
  } else if (!isValidGuid(item.template)) {
    errors.push({
      severity: 'error',
      rule: 'invalid-guid-format',
      message: `Item Template "${item.template}" is not a valid GUID`,
      itemId: item.id,
      itemPath: item.path,
      filePath,
    });
  }

  // Check Path exists
  if (!item.path) {
    errors.push({
      severity: 'error',
      rule: 'missing-path',
      message: 'Item is missing a Path',
      itemId: item.id,
      filePath,
    });
  }

  // If this is a template field item, validate the Type field
  if (item.template === TEMPLATE_FIELD_TEMPLATE_ID) {
    const typeField = item.sharedFields.find(f => f.id === FIELD_IDS.type);
    if (typeField) {
      const validTypes: readonly string[] = VALID_FIELD_TYPES;
      if (!validTypes.includes(typeField.value)) {
        errors.push({
          severity: 'error',
          rule: 'invalid-field-type',
          message: `Invalid field type "${typeField.value}". Must be one of: ${VALID_FIELD_TYPES.join(', ')}`,
          itemId: item.id,
          itemPath: item.path,
          filePath,
        });
      }
    }
  }

  return errors;
}
