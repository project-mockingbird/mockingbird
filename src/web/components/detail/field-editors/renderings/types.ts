// src/web/components/detail/field-editors/renderings/types.ts

/**
 * Web-side representation of a single rendering entry on a page's Default
 * device <d> block. Mirrors the engine's RenderingEntry shape but trims the
 * fields the editor doesn't manipulate (ownerItemPath, rules, hidden) - those
 * are computed server-side during layout resolution and have no UI surface.
 */
export interface RenderingEntry {
  uid: string;          // braced-uppercase GUID (the entry's own uid attribute)
  renderingId: string;  // braced-uppercase GUID of the rendering item
  placeholder: string;  // s:ph value, e.g. "/headless-main/.../container-1"
  dataSource: string;   // s:ds value (may be empty, "local:Data/X", or a GUID)
  params: Record<string, string>;  // decoded s:par key-value pairs
  /**
   * Personalization preservation: when a rendering had an `<rls>` body on the
   * input XML, capture the raw block here so the serializer can splice it
   * back unchanged. Absent for renderings without personalization.
   */
  rlsRaw?: string;
  /**
   * Caching attributes from the <r> element (cac, vbd, vbl, vbp, vbqs, vbu,
   * ciu, ccb). Absent when the rendering had none. Edited via the unified
   * Edit Rendering dialog's Caching control.
   */
  caching?: RenderingCaching;
  /**
   * Round-trip preservation for any <r> attribute we don't model explicitly
   * (e.g. cnd, pt, mvt). Captured raw on parse and emitted last on serialize
   * so we stop dropping bytes on edit-save cycles.
   */
  unknownAttrs?: Record<string, string>;
  /**
   * Composed-layout ownership. 'page' entries (the default when absent, for the
   * back-compat own-only parse path) are editable and persisted; 'partial'
   * entries come from a Page Design's partial designs and are read-only.
   */
  owner?: 'page' | 'partial';
  /** Partial design item name for the read-only badge. Set when owner is 'partial'. */
  ownerDisplayName?: string;
  /**
   * Sitecore path of the owning partial design, for navigating to it from a
   * read-only partial card. Set when owner is 'partial'.
   */
  ownerItemPath?: string;
}

/**
 * Sitecore caching attributes on the <r> element. Each is independently
 * optional. The Cacheable master toggle (cacheable) gates whether the others
 * have any runtime effect, but all are stored independently.
 */
export interface RenderingCaching {
  cacheable?: boolean;          // cac
  varyByData?: boolean;         // vbd
  varyByLogin?: boolean;        // vbl
  varyByParm?: boolean;         // vbp
  varyByQueryString?: boolean;  // vbqs
  varyByUser?: boolean;         // vbu
  clearOnIndexUpdate?: boolean; // ciu
  clearingBehavior?: string;    // ccb (raw value)
}

/**
 * Result of parsing a `__Final Renderings` XML field value. Holds the
 * structured Default-device entries plus everything else captured byte-faithfully
 * for round-trip preservation.
 */
export interface ParsedLayout {
  /** The Default device block's renderings, in document order. */
  entries: RenderingEntry[];
  /**
   * The ORIGINAL XML string. Serializer uses it to splice back non-Default
   * device blocks and outer wrappers byte-for-byte. Empty string for new layouts.
   */
  originalXml: string;
}

/**
 * Recursive tree shape consumed by RenderingsTree. Built by tree-builder.ts
 * from a flat RenderingEntry[] plus the discovered placeholder paths from
 * GET /api/items/:id/placeholder-paths. Roots are always placeholder nodes.
 */
export type TreeNode = TreePlaceholderNode | TreeRenderingNode;

export interface TreePlaceholderNode {
  kind: 'placeholder';
  /** Full s:ph value, e.g. "/headless-main/sxa-full-width-body/container-1". */
  path: string;
  /** Last "/"-segment of path, used as the displayed label. */
  segment: string;
  children: TreeNode[];
}

export interface TreeRenderingNode {
  kind: 'rendering';
  entry: RenderingEntry;
  /**
   * Placeholder nodes the rendering exposes for child renderings (the
   * SXA-style "Container with DPI=N exposes container-N" relationship).
   * Empty for non-container renderings or containers with no DPI. The
   * tree-builder claims paths from `discoveredPaths` based on the
   * rendering's DynamicPlaceholderId so visualisation tracks SXA's
   * ownership model rather than raw path-prefix hierarchy.
   */
  children: TreePlaceholderNode[];
}
