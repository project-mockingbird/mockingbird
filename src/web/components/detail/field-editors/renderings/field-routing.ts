/**
 * Maps a Sitecore field name (from the rendering's Parameters Template chain)
 * to one of the dedicated bindings on RenderingEntry, or 'custom' for any
 * non-reserved name. Reserved names match Sitecore.Kernel's reserved-field
 * exclusion list (per `RenderingParametersFieldCollection` in
 * `Sitecore.Kernel.decompiled.cs:381487-381495`); the lookup is
 * case-insensitive to match the decompile's behavior.
 *
 * 'custom' fields bind to entry.params (URL-encoded s:par). Reserved-name
 * fields bind to dedicated <r> attributes via the EditRenderingDialog's
 * per-binding render rule.
 */
import type { TemplateFieldSchema } from '@/lib/types';

export type FieldBinding =
  | 'placeholder'
  | 'datasource'
  | 'caching'
  | 'cacheclearingbehavior'
  | 'personalization'
  | 'additional'
  | 'contentdeps'
  | 'tests'
  | 'variant'
  | 'styles'
  | 'gridparameters'
  | 'custom';

/** The three SXA control bindings that get dedicated UI controls. */
export type SxaControlBinding = 'variant' | 'styles' | 'gridparameters';

const SXA_CONTROL_BINDINGS: ReadonlySet<FieldBinding> = new Set<FieldBinding>(['variant', 'styles', 'gridparameters']);

/** Returns true when a FieldBinding maps to a dedicated SXA UI control. */
export function isSxaControlBinding(b: FieldBinding): b is SxaControlBinding {
  return SXA_CONTROL_BINDINGS.has(b);
}

const RESERVED_NAME_TO_BINDING: ReadonlyMap<string, FieldBinding> = new Map([
  ['placeholder', 'placeholder'],                   // <r s:ph="...">
  ['data source', 'datasource'],                    // <r s:ds="...">
  ['caching', 'caching'],                           // <r cac/vbd/vbl/vbp/vbqs/vbu/ciu="...">
  ['cacheclearingbehavior', 'cacheclearingbehavior'], // <r ccb="..."> (Sitecore writes this name with no space)
  ['personalization', 'personalization'],           // <r><rls>...</rls></r>
  ['additional parameters', 'additional'],          // catch-all for s:par keys not declared in the params template
  ['content dependencies', 'contentdeps'],          // not currently exposed; v1 is read-only
  ['tests', 'tests'],                               // <r pt="..." mvt="...">
  ['fieldnames', 'variant'],                        // <r s:par="FieldNames={guid}"> - Sitecore CE labels this "Variant"
  ['styles', 'styles'],                             // <r s:par="Styles={guid1}|{guid2}">
  ['gridparameters', 'gridparameters'],             // <r s:par="GridParameters={guid1}|{guid2}">
]);

export function routeFieldToBinding(name: string): FieldBinding {
  return RESERVED_NAME_TO_BINDING.get(name.toLowerCase()) ?? 'custom';
}

/**
 * SXA system fields that surface on Standard Rendering Parameters but should
 * not be exposed as user-editable controls in the EditRenderingDialog. These
 * are framework metadata (auto-managed by Sitecore or legacy aliases).
 *
 * Names match case-insensitively.
 */
const SYSTEM_FIELD_NAMES: ReadonlySet<string> = new Set([
  'renderingidentifier',     // auto-generated rendering instance ID
  'cssstyles',               // legacy alias of Styles (TransformStyles reads both, but editing it directly is a footgun)
  'dynamicplaceholderid',    // auto-managed by Sitecore experience editor
]);

/**
 * Returns true for fields that should be hidden from the EditRenderingDialog
 * because they are SXA framework metadata, not user-editable parameters.
 *
 * Hides:
 *   1. Sitecore standard system fields (names starting with `__`, e.g. `__Source`).
 *   2. Known SXA framework param names (RenderingIdentifier, CSSStyles, DynamicPlaceholderId).
 *
 * Reserved-name fields handled by `routeFieldToBinding` are NOT considered system
 * fields - they have dedicated controls and remain visible.
 */
export function isSystemField(name: string): boolean {
  if (name.startsWith('__')) return true;
  return SYSTEM_FIELD_NAMES.has(name.toLowerCase());
}

/**
 * Build a minimal synthetic TemplateFieldSchema for SXA controls that are
 * present in entry.params but have no backing schema field. The id includes
 * both binding and paramName to avoid React key collisions.
 */
export function syntheticSxaField(binding: SxaControlBinding, paramName: string): TemplateFieldSchema {
  return {
    id: `synthetic-${binding}-${paramName}`,
    name: paramName,
    type: '',
    source: '',
    shared: false,
    unversioned: false,
    sortOrder: 0,
  };
}

/**
 * Compute the set of param names "covered" by a dedicated control in the
 * EditRenderingDialog. A name is covered when it appears in the schema
 * (any binding) OR when it's a reserved SXA-control name (`FieldNames` /
 * `Styles` / `GridParameters`) AND has a non-empty value in entry.params.
 *
 * The dialog uses this set to decide which entry.params keys belong in
 * the Additional Parameters textarea (the rest) vs. which get a dedicated
 * control. Without this, when schema is missing or thin (the common case
 * for registry-only OOTB renderings whose Parameters Template field isn't
 * baked), reserved-name params dump into the raw textarea instead of
 * the typed SXA controls.
 *
 * Returns lowercased names for case-insensitive comparison by callers.
 */
export function computeCoveredFieldNames(
  schemaFieldNames: string[],
  entryParams: Record<string, string>,
): string[] {
  const covered = new Set<string>();
  for (const name of schemaFieldNames) covered.add(name.toLowerCase());
  for (const [name, value] of Object.entries(entryParams)) {
    if (!value) continue;
    const binding = routeFieldToBinding(name);
    if (isSxaControlBinding(binding)) {
      covered.add(name.toLowerCase());
    }
  }
  return [...covered];
}
