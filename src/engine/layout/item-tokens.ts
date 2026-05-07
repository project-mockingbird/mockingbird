import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { FIELD_IDS } from '../constants.js';
import { readFieldWithSvFallback } from './item-fields.js';

/**
 * Port of Sitecore's `Sitecore.Kernel.Pipelines.ExpandInitialFieldValue`
 * processor. Expands `$`-prefixed item-context tokens when invoked on a
 * Standard Values-cascaded field. Caller (`resolveFieldValue` in
 * `item-fields.ts`) enforces the cascade-only invariant — stored
 * (authored) values never reach this function, preserving any literal
 * `$name` an editor set explicitly.
 *
 * The seven default Sitecore tokens:
 *   $name       → item display name (fallback: item name from path)
 *   $id         → item GUID in `{UPPER-DASHED}` format
 *   $parentname → parent item display name (tree first, registry fallback)
 *   $parentid   → parent GUID in `{UPPER-DASHED}` format
 *   $date       → DateUtil.ToIsoDate(Today)  = `yyyyMMddT000000Z`
 *   $time       → DateUtil.ToIsoTime(Now)    = `HHmmss`
 *   $now        → DateUtil.IsoNowWithTicks() = `yyyyMMddTHHmmssZ`
 *
 * Date/time tokens emit Sitecore's compact form; `formatDateISO` in
 * `field-formatter.ts` expands compact → ISO when the field type is
 * `date` or `datetime`. Non-date fields pass the compact form through —
 * mirrors Sitecore's layered architecture where `ExpandInitialFieldValue`
 * is decoupled from `RenderFieldPipeline`'s type-aware formatting.
 */
export function expandItemTokens(value: string, item: ScsItem, engine: Engine): string {
  return value.replace(/\$(name|id|parentname|parentid|date|time|now)\b/g, (match, token) => {
    switch (token) {
      case 'name':       return itemDisplayName(engine, item);
      case 'id':         return `{${item.id.toUpperCase()}}`;
      // Empty-parent asymmetry is deliberate and mirrors Sitecore:
      //   $parentname with no parent → `''` (display-name lookup on null parent
      //   yields empty string — `parentDisplayName` short-circuits on
      //   `!item.parent`).
      //   $parentid with no parent → the literal `$parentid` token returned
      //   verbatim (no safe GUID to emit; callers downstream treat the
      //   unexpanded token as an authoring signal).
      // Tests pin both behaviors in tests/engine/layout/item-tokens.test.ts.
      case 'parentname': return parentDisplayName(item, engine);
      case 'parentid':   return item.parent ? `{${item.parent.toUpperCase()}}` : match;
      case 'date':       return compactDateToday();
      case 'time':       return compactTimeNow();
      case 'now':        return compactDateTimeNow();
      default:           return match;
    }
  });
}

function itemDisplayName(engine: Engine, item: ScsItem): string {
  // Sitecore's `item.Fields["__Display Name"].Value` cascade: item's own
  // shared → item's own versioned → template SV (shared, then versioned) →
  // base-template SV chain. Final fallback: the item's path-derived name.
  //
  // 0.4.0.28: cascade extended through SV chain via `readFieldWithSvFallback`.
  // Pre-0.4.0.28 was item-only (shared → unversioned → versioned → path),
  // producing path-segment names for items whose template SV defined a
  // display-name default the item didn't override.
  const cascaded = readFieldWithSvFallback(engine, item, FIELD_IDS.displayName, 'en');
  if (cascaded) return cascaded;
  return item.path.split('/').pop() ?? '';
}

function parentDisplayName(item: ScsItem, engine: Engine): string {
  if (!item.parent) return '';
  const parentNode = engine.getItemById(item.parent);
  if (parentNode) return itemDisplayName(engine, parentNode.item);
  const parentReg = engine.getRegistryItem(item.parent);
  return parentReg?.name ?? '';
}

function compactDateToday(): string {
  const d = new Date();
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${mo}${dd}T000000Z`;
}

function compactTimeNow(): string {
  const d = new Date();
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${hh}${mi}${ss}`;
}

function compactDateTimeNow(): string {
  // Single atomic timestamp read — avoids midnight skew if composed from
  // two separate `new Date()` calls. Mirrors Sitecore's `IsoNowWithTicks()`
  // which reads `DateTime.UtcNow` once.
  const d = new Date();
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${y}${mo}${dd}T${hh}${mi}${ss}Z`;
}
