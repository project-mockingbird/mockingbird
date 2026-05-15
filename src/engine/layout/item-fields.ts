import type { Engine } from '../index.js';
import type { ScsItem, ScsVersion, RegistryItem } from '../types.js';
import { expandItemTokens } from './item-tokens.js';
import { readFieldViaSctOverride } from './site-collection-templates.js';
import { walkBaseTemplates } from './template-walk.js';
import { resolveFieldIdByHintOnTemplate } from './template-fields.js';
import {
  isVersionValid,
  isPublishingValidationEnabled,
  readApprovedStatesFromEnv,
} from './version-validity.js';
import { getEffectivePublishDate } from './publish-dates.js';

/**
 * Read a shared field value directly off an `ScsItem`. Returns `undefined`
 * if the field is absent (NOT `''` — callers can distinguish).
 */
export function readSharedFieldOnItem(item: ScsItem, fieldId: string): string | undefined {
  const id = fieldId.toLowerCase();
  return item.sharedFields.find(f => f.id.toLowerCase() === id)?.value;
}

/**
 * Read a shared field by item ID. Looks in the serialized tree first, then
 * falls back to the OOTB registry. Case-insensitive on both the lookup and
 * the registry sharedFields map (the registry is case-preserving and some
 * entries use uppercase keys).
 */
export function readSharedField(
  engine: Engine,
  itemId: string,
  fieldId: string,
): string | undefined {
  if (!itemId) return undefined;
  const id = fieldId.toLowerCase();
  const node = engine.getItemById(itemId);
  if (node) {
    return readSharedFieldOnItem(node.item, id);
  }
  const reg = engine.getRegistryItem(itemId);
  if (reg?.sharedFields) {
    const sf = reg.sharedFields as Record<string, string>;
    return sf[id] ?? sf[fieldId] ?? sf[fieldId.toUpperCase()];
  }
  return undefined;
}

/**
 * Read a shared field by its authored hint (field name) — case-insensitive.
 *
 * Tree path: the serialized `ScsField.hint` stored on each shared field is
 * used directly — fast and authoritative for items in the tree.
 *
 * Registry fallback: registry `sharedFields` is keyed by field ID and does
 * not preserve hints. For registry-only items (e.g. OOTB RCR settings items
 * under `/sitecore/system/Settings/Rendering Contents Resolvers/*`) the hint
 * is resolved to a field ID by walking the item's template definition children
 * — mirroring Sitecore's `Item.Fields["UseContextItem"]` contract where the
 * template is the source of truth for name→ID mapping.
 *
 * Used by the P1 RCR settings read (`UseContextItem`, `ItemSelectorQuery`),
 * which Sitecore accesses by field name in `Sitecore.LayoutService.decompiled.cs:2281-2289`.
 */
export function readSharedFieldByHint(
  engine: Engine,
  itemId: string,
  hint: string,
): string | undefined {
  if (!itemId || !hint) return undefined;
  const target = hint.toLowerCase();

  // Tree item: authored hint stored on the field itself — preferred authoritative path.
  const node = engine.getItemById(itemId);
  if (node) {
    const match = node.item.sharedFields.find(
      f => (f.hint ?? '').toLowerCase() === target,
    );
    return match?.value;
  }

  // Registry-only item: resolve the hint to a field ID via the template's
  // field-definition children (mirrors Sitecore's `Item.Fields["UseContextItem"]`
  // contract — the template is the source of truth for name→ID mapping).
  const reg = engine.getRegistryItem(itemId);
  if (!reg?.template) return undefined;
  const fieldId = resolveFieldIdByHintOnTemplate(engine, reg.template, target);
  if (!fieldId) return undefined;
  const sf = reg.sharedFields as Record<string, string> | undefined;
  if (!sf) return undefined;
  return sf[fieldId] ?? sf[fieldId.toUpperCase()];
}

/**
 * Port of Sitecore's `ItemPublishing.GetValidVersion(date, requireApproved,
 * targetDatabase)` (`Sitecore.Kernel.decompiled.cs:377439-377467`):
 *
 * > Iterate versions highest-to-lowest; return the first whose
 * > `Publishing.IsValid(date, requireApproved, targetDatabase)` passes.
 * > Return null if no version passes.
 *
 * `IsValid` (377576-377602) is `InValidRange` (`__Valid from` ≤ date <
 * `__Valid to` AND NOT `Hide version`) plus, when `requireApproved`, an
 * `IsApproved` gate on `__Workflow state`.
 *
 * ## Inputs mockingbird threads in
 *
 * - `publishDate` — `getEffectivePublishDate(item.path)`: per-path override
 *   from the overrides file, then `MOCKINGBIRD_PUBLISH_DATE` env var, then
 *   real `now`. Matches Sitecore's per-item publish history.
 * - `requireApproved` — `MOCKINGBIRD_PUBLISHING_VALIDATION=approved` flips
 *   on the workflow-state gate. Default off (0.4.0.30 — the reference
 *   apparently persists a `__Published` marker that this gate can't see).
 * - `approvedStates` — `MOCKINGBIRD_APPROVED_WORKFLOW_STATES` env list.
 *
 * ## Default behaviour when no date overrides or env are set
 *
 * With `publishDate = now`, `requireApproved = false`, and no `__Valid from`
 * fields authored, every version passes `isVersionValid` → highest-numbered
 * wins → byte-identical to the pre-0.4.0.31 "highest version" behaviour.
 * The port is backward-compatible in that regime and only diverges when
 * Sitecore's gates (valid-from/to, Hide version, workflow state) actually
 * carry values.
 *
 * Returns `undefined` when no version in the requested language passes —
 * matches Sitecore's `null` return, which in Edge means "item not
 * published, Edge has nothing." Downstream callers (resolveFieldValue etc.)
 * already handle this path.
 */
export function getLatestVersion(item: ScsItem, language: string): ScsVersion | undefined {
  const lang = item.languages.find(l => l.language === language);
  if (!lang || lang.versions.length === 0) return undefined;

  const date = getEffectivePublishDate(item.path);
  const requireApproved = isPublishingValidationEnabled();
  const approvedStates = requireApproved ? readApprovedStatesFromEnv() : undefined;

  // Walk highest-to-lowest. Mirrors Sitecore's `for (int num = versions.Length - 1; num >= 0; num--)`.
  const sorted = [...lang.versions].sort((a, b) => b.version - a.version);
  for (const v of sorted) {
    if (isVersionValid(v, lang.fields, date, { requireApproved, approvedStates })) {
      return v;
    }
  }
  return undefined;
}

/**
 * Read a versioned field's value on an item for a given language. Prefers an
 * unversioned (language-level) value if present, then falls back to the
 * highest-numbered version's field list.
 */
export function readVersionedField(
  item: ScsItem,
  fieldId: string,
  language: string,
): string | undefined {
  const id = fieldId.toLowerCase();
  const lang = item.languages.find(l => l.language === language);
  if (!lang) return undefined;
  const unver = lang.fields.find(f => f.id.toLowerCase() === id);
  if (unver?.value) return unver.value;
  const latest = getLatestVersion(item, language);
  return latest?.fields.find(f => f.id.toLowerCase() === id)?.value;
}

/**
 * Locate the `__Standard Values` item for a given template ID, checking the
 * serialized tree first (SV appears as a direct child of the template item)
 * and falling back to the registry (which indexes registry items by parent).
 *
 * Returns either `{ kind: 'tree', item: ScsItem }` or
 * `{ kind: 'registry', item: RegistryItem }` so the caller can use the
 * right reader for shared + versioned fields. Returns `undefined` when no
 * SV exists for the template.
 */
type StandardValuesItem =
  | { kind: 'tree'; item: ScsItem }
  | { kind: 'registry'; item: RegistryItem };

function getStandardValuesItem(
  engine: Engine,
  templateId: string,
): StandardValuesItem | undefined {
  const tplId = templateId.toLowerCase();

  // Tree first. If the template itself is serialized, the SV is one of its
  // direct children. Match by name — canonical in Sitecore.
  const treeNode = engine.getItemById(tplId);
  if (treeNode) {
    for (const child of treeNode.children.values()) {
      // Child path ends with `/__Standard Values`. Use the last path segment
      // rather than an arbitrary name field so behavior matches whatever the
      // serializer stored on disk.
      const lastSlash = child.item.path.lastIndexOf('/');
      const name = lastSlash >= 0 ? child.item.path.slice(lastSlash + 1) : child.item.path;
      if (name === '__Standard Values') {
        return { kind: 'tree', item: child.item };
      }
    }
  }

  // Registry fallback. Registry v3.0 carries versioned fields on SV items
  // so OOTB template defaults (e.g. SXA Search Box `SearchButtonText =
  // "Search"`) can be read without a live CM.
  const regChildren = engine.getRegistryChildren(tplId);
  for (const reg of regChildren) {
    if (reg.name === '__Standard Values') {
      return { kind: 'registry', item: reg };
    }
  }

  return undefined;
}

/**
 * Read a field value from a `__Standard Values` item, checking shared first
 * then versioned (en/v1 for registry items; the full language/version pick
 * via {@link readVersionedField} for tree items). Returns `undefined` when
 * the SV doesn't carry the field at all.
 */
function readFieldOnStandardValues(
  sv: StandardValuesItem,
  fieldId: string,
  language: string,
): string | undefined {
  const id = fieldId.toLowerCase();
  if (sv.kind === 'tree') {
    const shared = readSharedFieldOnItem(sv.item, id);
    if (shared !== undefined && shared !== '') return shared;
    const versioned = readVersionedField(sv.item, id, language);
    if (versioned !== undefined && versioned !== '') return versioned;
    return undefined;
  }
  const shared = sv.item.sharedFields[id];
  if (shared !== undefined && shared !== '') return shared;
  // Registry versioned fields are keyed language → version → fieldId. We
  // only ever need version "1" for SV defaults — newer versions aren't
  // authored on SV items in practice, and the extraction is en/v1-only.
  const versioned = sv.item.versionedFields?.[language]?.['1']?.[id];
  if (versioned !== undefined && versioned !== '') return versioned;
  return undefined;
}

/**
 * Indexed view of an item's fields keyed by field id and by field hint name.
 * The index folds shared → language-unversioned → latest-version in order, so
 * more-specific values (versioned) overwrite less-specific ones (shared) —
 * matching Sitecore's field-resolution precedence.
 */
export interface ItemValueIndex {
  byId: Map<string, string>;
  byHint: Map<string, string>;
}

/**
 * Build an {@link ItemValueIndex} for an item in a given language. Keys are
 * lowercased to match the engine's case-insensitive id lookup.
 */
export function buildItemValueIndex(item: ScsItem, language: string): ItemValueIndex {
  const byId = new Map<string, string>();
  const byHint = new Map<string, string>();
  const add = (f: { id: string; hint: string; value: string }): void => {
    if (f.id) byId.set(f.id.toLowerCase(), f.value);
    if (f.hint) byHint.set(f.hint.toLowerCase(), f.value);
  };
  for (const f of item.sharedFields) add(f);
  const lang = item.languages.find(l => l.language === language);
  if (lang) for (const f of lang.fields) add(f);
  const latest = getLatestVersion(item, language);
  if (latest) for (const f of latest.fields) add(f);
  return { byId, byHint };
}

/**
 * Resolve a single field value from a pre-built {@link ItemValueIndex},
 * applying the three-branch rule:
 *   1. Stored non-empty   → return the stored value (no token expansion).
 *   2. Stored explicit "" → return undefined (caller emits the type's empty
 *      default; the explicit empty deliberately suppresses SV cascade, e.g.
 *      Global Search Box.TextBoxText = "").
 *   3. Stored missing     → walk the `__Standard Values` cascade across the
 *      item's template and base-template chain. First non-empty hit wins.
 *      Apply {@link expandItemTokens} to the cascaded value (Sitecore's
 *      `ExpandInitialFieldValue` pipeline fires only on SV-sourced values —
 *      authored literals reach branch 1 and pass through verbatim).
 *
 * Shared between `formatItemFields` (route-level) and `formatReferenceItem`
 * (multilist reference-level) — both need the same precedence.
 *
 * Signature: the `item` parameter (was `templateId: string` pre-0.4.0.11)
 * gives the token expander access to item-context for `$name`/`$id`/
 * `$parentname`/`$parentid`. Callers already hold the item at both call
 * sites (see `formatItemFields` in utils.ts and field-formatter.ts).
 */
export function resolveFieldValue(
  index: ItemValueIndex,
  fieldId: string,
  fieldName: string,
  item: ScsItem,
  language: string,
  engine: Engine,
  siteRootPath: string,
): string | undefined {
  const stored = index.byId.get(fieldId.toLowerCase()) ?? index.byHint.get(fieldName.toLowerCase());
  if (stored !== undefined && stored !== '') return stored;
  if (stored === '') return undefined;
  // 0.4.0.12: SXA Site Collection Templates overlay.
  // Runs before classic cascade; on hit, returns the literal SCT value
  // WITHOUT token expansion (SCT items store already-expanded literals per
  // Sitecore's `ExpandInitialFieldValue`-at-creation contract).
  const sctValue = readFieldViaSctOverride(engine, item, fieldId, language, siteRootPath);
  if (sctValue !== undefined) return sctValue;
  const cascaded = readFieldViaStandardValuesCascade(engine, item.template, fieldId, language);
  if (cascaded === undefined || cascaded === '') return undefined;
  // 0.4.0.11 item 4: expand $-prefixed item-context tokens on
  // SV-cascaded values only. Authored literal `$name` reached the
  // early `stored` branch above and was returned verbatim — preserving
  // Sitecore's `ExpandInitialFieldValue`-on-SV-defaults rule.
  return expandItemTokens(cascaded, item, engine);
}

/**
 * Read a field value on an item with Sitecore's standard cascade semantics:
 *   own shared → own versioned → template SV (shared, then versioned) →
 *   base-template SV chain.
 *
 * Thin adapter over {@link readFieldViaStandardValuesCascade} that prepends
 * the "item's own authored value" check. Use at call sites that need
 * `item.Fields[fieldId].Value` semantics on content fields with meaningful
 * SV defaults — e.g. `__Sortorder`, `__Display Name`, and param-item `Value`.
 * Do NOT use for override fields where absence is an intentional signal
 * (Page Design override, component-name override, RCR-per-rendering, etc.).
 *
 * Explicit-empty semantics mirror {@link resolveFieldValue}: a stored `""`
 * deliberately suppresses the SV cascade (per Sitecore's "set empty to clear
 * the inherited default" contract). Field-absent → cascade runs.
 */
export function readFieldWithSvFallback(
  engine: Engine,
  item: ScsItem,
  fieldId: string,
  language: string,
): string | undefined {
  const id = fieldId.toLowerCase();
  const shared = readSharedFieldOnItem(item, id);
  if (shared !== undefined) {
    return shared !== '' ? shared : undefined;
  }
  const versioned = readVersionedField(item, id, language);
  if (versioned !== undefined) {
    return versioned !== '' ? versioned : undefined;
  }
  return readFieldViaStandardValuesCascade(engine, item.template, fieldId, language);
}

/**
 * Walk an item's template and base-template chain looking for a field value
 * on each template's `__Standard Values` item. First non-empty hit wins —
 * most-derived template's SV takes precedence over base templates' SVs, so
 * a page template can override a shared-base-template default just by
 * setting its own SV field.
 *
 * This mirrors Sitecore's classic field-value resolution order for an item
 * whose own serialization omits a field (omission means "inherit from SV"
 * — serializers deliberately skip values equal to SV to keep serialized
 * YAML lean).
 *
 * Returns `undefined` when neither the direct template's SV nor any base
 * template's SV carries a value. Cycle-safe via a visited set; depth
 * bounded by the template graph itself.
 */
export function readFieldViaStandardValuesCascade(
  engine: Engine,
  templateId: string,
  fieldId: string,
  language: string,
): string | undefined {
  if (!templateId) return undefined;
  let hit: string | undefined;
  walkBaseTemplates(engine, templateId, (current) => {
    const sv = getStandardValuesItem(engine, current);
    if (sv) {
      const value = readFieldOnStandardValues(sv, fieldId, language);
      if (value !== undefined && value !== '') {
        hit = value;
        return true;
      }
    }
  });
  return hit;
}

/**
 * Build a minimal `ScsItem` from a `RegistryItem` so registry-only items
 * can flow through the same serialization paths as tree-resolved items.
 *
 * Registry stores `sharedFields` as `Record<fieldId, value>` and
 * `versionedFields` as `Record<lang, Record<version, Record<fieldId, value>>>`.
 * Both are converted to the `ScsField[]` shape ScsItem callers expect.
 *
 * `hint` is emitted as `''` — the registry doesn't carry human-readable
 * field names. Downstream byHint lookups degrade to byId; fields-by-id
 * (the template-schema-driven path used by `formatItemFields`) still
 * resolve correctly.
 *
 * Used by `resolveItem` in `field-formatter.ts` to fall back from tree
 * to registry when a multilist reference points at a registry-only item
 * (e.g. Navigation Filters under `/sitecore/system/Settings/Foundation/
 * Experience Accelerator/Navigation`).
 *
 * Note: `reg.name` is not mapped — `ScsItem` has no `name` field; callers
 * derive item name from `path` (last segment) via `itemName()`. Task D's
 * parent-display-name lookup reads `RegistryItem.name` directly from the
 * registry for registry-only parents, bypassing synthesis — intentional
 * asymmetry.
 */
export function synthesizeItemFromRegistry(reg: RegistryItem): ScsItem {
  return {
    id: reg.id,
    parent: reg.parent,
    template: reg.template,
    path: reg.path,
    sharedFields: Object.entries(reg.sharedFields).map(([id, value]) => ({
      id: id.toLowerCase(),
      hint: '',
      value,
    })),
    languages: (() => {
      // Union of every language that has unversioned OR versioned data.
      const langs = new Set<string>([
        ...Object.keys(reg.unversionedFields ?? {}),
        ...Object.keys(reg.versionedFields ?? {}),
      ]);
      return Array.from(langs).map((language) => ({
        language,
        // Registry v5.0+ carries language-level unversioned fields.
        fields: Object.entries(reg.unversionedFields?.[language] ?? {}).map(([id, value]) => ({
          id: id.toLowerCase(),
          hint: '',
          value,
        })),
        versions: Object.entries(reg.versionedFields?.[language] ?? {}).map(([version, fields]) => ({
          version: parseInt(version, 10),
          fields: Object.entries(fields).map(([id, value]) => ({
            id: id.toLowerCase(),
            hint: '',
            value,
          })),
        })),
      }));
    })(),
  };
}
