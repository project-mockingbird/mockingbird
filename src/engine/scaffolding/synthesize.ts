import type { RegistryItem, ScsItem } from '../types.js';
import { synthesizeItemFromRegistry } from '../layout/item-fields.js';

/**
 * Public re-export of the registry->ScsItem adapter under the scaffolding
 * namespace, plus a convenience for typed call sites.
 */
export function synthesizeRegistryAsScs(reg: RegistryItem): ScsItem {
  return synthesizeItemFromRegistry(reg);
}
