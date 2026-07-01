export interface DescendantItem {
  id: string;
  name: string;
  displayName?: string;
  path: string;
  template: string;
  hasChildren: boolean;
}

export interface ItemProvenance {
  winnerLayer: string;
  contributingLayers: string[];
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  template: string;
  type: 'template' | 'templateSection' | 'templateField' | 'rendering' | 'unknown';
  source: 'serialized' | 'registry';
  /** True when a serialization root covers this node (so children can be inserted). Always true for serialized items. Absent/falsy on locally-constructed nodes is treated as not insertable. */
  insertable?: boolean;
  hasChildren: boolean;
  /** `__Sortorder`; default 100 when missing. */
  sortOrder?: number;
  /** `__Display Name`, falling back to name. */
  displayName?: string;
  /** `__Created` epoch ms; absent when missing. */
  createdAt?: number;
  /** `__Updated` epoch ms; absent when missing. */
  updatedAt?: number;
  /** Host-translated YAML path; only present for serialized items. */
  filePath?: string;
  autoExpand?: boolean;
  /** Layer attribution for this node; present when layers feature is active. */
  provenance?: ItemProvenance;
  children?: TreeNode[];
}

export interface ScsField {
  id: string;
  hint: string;
  value: string;
  type?: string;
}

export interface ScsVersion {
  version: number;
  fields: ScsField[];
}

export interface ScsLanguage {
  language: string;
  fields: ScsField[];
  versions: ScsVersion[];
}

export interface ItemDetail {
  source: 'serialized' | 'registry';
  id: string;
  name: string;
  path: string;
  template: string;
  parent: string;
  type: string;
  filePath: string;
  sharedFields: ScsField[];
  languages: ScsLanguage[];
  templateResolved?: string;
  resolvedFields?: Record<string, string>;
  fileSizeBytes?: number;
}

export interface TrimVersionsRequest {
  language: string;
  keepCount: number;
}

export interface ValidationError {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  itemId?: string;
  itemPath?: string;
  filePath: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface CreateItemRequest {
  type: 'template' | 'section' | 'field' | 'rendering';
  name: string;
  parentPath: string;
  fieldType?: string;
}

export interface UpdateItemRequest {
  fields: Record<string, string>;
  language?: string;
  version?: number;
}

export interface WebSocketEvent {
  type:
    | 'item:added'
    | 'item:changed'
    | 'item:removed'
    | 'item:moved'
    | 'validation:updated'
    | 'tree:refresh';
  id?: string;
  path?: string;
  /** Previous path - present only for `item:moved` events. */
  fromPath?: string;
  valid?: boolean;
  errorCount?: number;
  /** Multi-item subtree change root - present only for `tree:refresh`. */
  rootItemPath?: string;
  /** Items created in the subtree - present only for `tree:refresh`. */
  createdCount?: number;
  /** Why the refresh fired (e.g. 'scaffold') - present only for `tree:refresh`. */
  reason?: string;
}

export interface TemplateFieldSchema {
  id: string;
  name: string;
  /**
   * User-facing label resolved by the engine (Title unversioned field
   * preferred, then __Display name, then item name). Optional on the
   * wire for backwards compatibility with pre-1.1.0.0 API responses.
   */
  displayName?: string;
  type: string;
  source: string;
  shared: boolean;
  unversioned: boolean;
  sortOrder: number;
}

export interface TemplateSectionSchema {
  id: string;
  name: string;
  sortOrder: number;
  isStandard: boolean;
  /**
   * True for sections from null-base "structural fragment" templates
   * (e.g. SXA's _Name/_Description/_Site Template). CE hides these under
   * "Show Standard Fields = OFF" alongside isStandard sections. Optional
   * on the wire for backwards compatibility with older API responses.
   */
  isStructuralFragment?: boolean;
  sourceTemplateId: string;
  fields: TemplateFieldSchema[];
}

export interface TemplateSchema {
  sections: TemplateSectionSchema[];
  builderSections?: TemplateSectionSchema[];
}

export interface LookupSourceItem {
  id: string;
  name: string;
  displayName: string;
  path: string;
  templateId: string;
  hasChildren: boolean;
}

// Renderings editor types (consumed by hooks.ts and components in field-editors/renderings/)

export interface RenderingMeta {
  id: string;
  name: string;
  displayName: string;
  /**
   * Full Sitecore path of the rendering item (e.g.
   * `/sitecore/layout/Renderings/Feature/.../Page Content/Rich Text`).
   * Used by AddRenderingDialog to group renderings by their parent folder.
   */
  path: string;
  /**
   * Lowercase template GUID without braces. Lets the picker tell folder
   * items (e.g. Renderings Folder template) apart from real renderings,
   * so a folder renders as a folder even when it has no visible children.
   */
  template: string;
  icon?: string;
  parametersTemplateId?: string;
  datasourceTemplate?: string;
  datasourceLocation?: string;
  /** `__Sortorder`; default 100 when missing. */
  sortOrder?: number;
  /**
   * True when the rendering declares a dynamic placeholder (e.g. a Container's
   * `container-{*}`). The Add dialog uses this to auto-assign a
   * DynamicPlaceholderId so the rendering's child placeholder is exposed.
   */
  declaresDynamicPlaceholders?: boolean;
}

export interface RenderingPlaceholderPath {
  value: string;
  source: 'in-xml' | 'discovered';
  /** Rendering UID that exposes this discovered path, when attributable. */
  ownerUid?: string;
  isTokenForm?: boolean;
}

/**
 * A composed rendering entry from GET /api/items/:id/composed-layout. Mirrors
 * the engine's ComposedEntry: a rendering entry tagged with its owner so the
 * editor keeps partial-design renderings read-only and persists only page ones.
 */
export interface ComposedEntry {
  uid: string;
  renderingId: string;
  placeholder: string;
  dataSource: string;
  params: Record<string, string>;
  /** 'page' entries are editable; 'partial' entries are read-only. */
  owner: 'page' | 'partial';
  /** Sitecore path of the owning item (the page itself or a partial design). */
  ownerItemPath: string;
  /** Partial design item name, for the read-only badge. Set when owner is 'partial'. */
  ownerDisplayName?: string;
}

/** Response of GET /api/items/:id/composed-layout (page + partial composition). */
export interface ComposedLayout {
  entries: ComposedEntry[];
  placeholders: RenderingPlaceholderPath[];
}

export interface CompatibleRenderingsResponse {
  renderings: Array<Pick<RenderingMeta, 'id' | 'name' | 'displayName' | 'path' | 'template' | 'icon' | 'declaresDynamicPlaceholders'>>;
}

// Template picker types (consumed by useAllTemplates and components in
// components/tree/insert-from-template/). Mirror of engine's TemplateMeta
// at src/engine/templates/types.ts; engine is canonical, keep in sync.

export interface TemplateMeta {
  /** Canonical brace-wrapped uppercase GUID. */
  id: string;
  name: string;
  displayName: string;
  /** Full Sitecore path, e.g. `/sitecore/templates/Project/Foo/Bar`. */
  path: string;
  /**
   * Lowercase template GUID without braces. Lets the picker distinguish
   * Branch templates (BRANCH_TEMPLATE_ID) and folder/container items
   * (Template Folder, Common/Folder, Node, Renderings folder) from
   * pickable Template items.
   */
  template: string;
  icon?: string;
  /**
   * Item's `__Sortorder` field. Lower comes first. Sitecore default is 100
   * when the field is absent. Used by the picker to order children the way
   * Content Editor does.
   */
  sortOrder?: number;
}

export interface AllTemplatesResponse {
  templates: TemplateMeta[];
}

// Insert Options + Insert Item types. Mirror engine shapes
// (src/engine/insert-options.ts and the POST /api/items fromTemplate handler).

// MIRROR of src/engine/insert-options.ts. Engine is canonical; keep in sync.
export interface InsertOption {
  /** Canonical lowercased GUID, no braces. */
  templateId: string;
  /** Display name for the menu row. */
  templateName: string;
  /** Full Sitecore path - useful for tooltip / debugging. */
  templatePath: string;
  /** `branch` when the template lives under `/sitecore/templates/branches`, else `template`. */
  kind: 'template' | 'branch';
}

export interface InsertOptionsResponse {
  options: InsertOption[];
}

export interface InsertItemRequest {
  type: 'fromTemplate';
  parentPath: string;
  templateId: string;
  name: string;
  /** Base template for a new Template definition. Ignored for other inserts. */
  baseTemplateId?: string;
}

/** POST /api/items with type=fromTemplate returns the created node, serialized as ItemDetail. */
export type InsertItemResponse = ItemDetail;

export type DuplicateItemRequest = {
  type: 'duplicate';
  sourceId: string;
  name: string;
};

export interface CopyItemRequest {
  type: 'copyTo';
  sourceId: string;
  destinationParentId: string;
  /** Optional explicit name. UI omits; engine computes via getCopyOfName. */
  name?: string;
}

export interface MoveItemRequest {
  type: 'moveTo';
  sourceId: string;
  destinationParentId: string;
}
