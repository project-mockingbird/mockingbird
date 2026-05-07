export interface RenderingMeta {
  id: string;           // braced-uppercase GUID
  name: string;         // item Name
  displayName: string;  // __Display Name field, fallback to name
  /** Full Sitecore path of the rendering item. Used by the web UI to group
   *  renderings by their parent folder in pickers. */
  path: string;
  /** Lowercase template GUID without braces. Used by the web UI to tell
   *  rendering-folder items apart from real renderings (folders should
   *  render as folders even when they have no visible children). */
  template: string;
  icon?: string;        // __Icon field if present
  parametersTemplateId?: string;
  datasourceTemplate?: string;
  datasourceLocation?: string;
  /** `__Sortorder`; default 100 when missing. */
  sortOrder?: number;
}

export interface PlaceholderPath {
  value: string;
  source: 'in-xml' | 'discovered';
  isTokenForm?: boolean;
  /**
   * UID of the rendering that exposes this path, when known. Set on
   * 'discovered' paths whose declaration we can attribute to a specific
   * entry on the page. Absent on 'in-xml' paths (those are placeholders
   * an entry SITS in, not paths a rendering exposes).
   */
  ownerUid?: string;
}
