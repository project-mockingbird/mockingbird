/**
 * Engine-side metadata for a template (or branch / folder) under
 * /sitecore/templates, as returned by `listTemplates`.
 *
 * Pickable items (template === TEMPLATE_TEMPLATE_ID or BRANCH_TEMPLATE_ID)
 * become tree leaves on the client; folder-templated items become nodes that
 * the user can expand but not select.
 */
export interface TemplateMeta {
  /** Canonical brace-wrapped uppercase GUID. */
  id: string;
  name: string;
  displayName: string;
  /** Full Sitecore path, e.g. `/sitecore/templates/Project/Foo/Bar`. */
  path: string;
  /** Lowercase template GUID without braces. Used to detect Branch and Folder. */
  template: string;
  icon?: string;
  /**
   * Item's `__Sortorder` field. Lower comes first. Sitecore default is 100
   * when the field is absent or unparseable. Used by the picker to order
   * children the way Content Editor does.
   */
  sortOrder?: number;
}
