import type { ValidationResult } from '../types.js';
import type { ItemTree } from '../tree.js';
import type { Registry } from '../registry.js';
import { validateStructural } from './structural.js';
import { validateReferential } from './referential.js';
import { validateInheritance } from './inheritance.js';

export function validate(tree: ItemTree, registry?: Registry): ValidationResult {
  const errors = [];
  for (const node of tree.getAllNodes()) {
    errors.push(...validateStructural(node.item, node.filePath));
  }
  errors.push(...validateReferential(tree, registry));
  errors.push(...validateInheritance(tree, registry));
  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
  };
}

export { validateStructural } from './structural.js';
export { validateReferential } from './referential.js';
export { validateInheritance } from './inheritance.js';
