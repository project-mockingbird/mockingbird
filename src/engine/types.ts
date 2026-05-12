export type { LayerSpec, AllowedPushOperations } from './layer-spec.js';

/** A single field entry in SCS YAML (used in SharedFields, Language Fields, and Version Fields). */
export interface ScsField {
  /** Field definition GUID (lowercase, no braces). */
  id: string;
  /** Human-readable field name (e.g., "__Base template", "Title"). */
  hint: string;
  /** Field value as a string. */
  value: string;
  /** Optional field type annotation (e.g., "layout", "Checkbox"). Only present on some fields. */
  type?: string;
}

/** A numbered version within a language, containing versioned fields. */
export interface ScsVersion {
  version: number;
  fields: ScsField[];
}

/** A language entry containing unversioned fields and numbered versions. */
export interface ScsLanguage {
  language: string;
  /** Unversioned fields — per-language, same across all versions. */
  fields: ScsField[];
  versions: ScsVersion[];
}

/** A fully parsed SCS YAML item. */
export interface ScsItem {
  /** Item GUID (lowercase, no braces). */
  id: string;
  /** Parent item GUID (lowercase, no braces). */
  parent: string;
  /** Template GUID (lowercase, no braces). */
  template: string;
  /** Full Sitecore path (e.g., "/sitecore/templates/Project/MyModule/MyTemplate"). */
  path: string;
  /**
   * Branch template GUID (lowercase, no braces). Rainbow/SCS emits this
   * top-level field only for items created from a branch; the default
   * all-zero GUID is elided. Preserve when present so round-trip writes
   * don't drop it.
   */
  branchId?: string;
  /** Fields shared across all languages and versions. */
  sharedFields: ScsField[];
  /** Per-language data with unversioned fields and versions. */
  languages: ScsLanguage[];
}

/** An item in the in-memory tree with parent/child relationships and file tracking. */
export interface ItemNode {
  item: ScsItem;
  children: Map<string, ItemNode>;
  parentNode: ItemNode | null;
  /** Absolute path to the .yml file on disk. */
  filePath: string;
  /** Module namespace this item belongs to (if known). */
  module?: string;
}

/** A single validation error or warning. */
export interface ValidationError {
  severity: 'error' | 'warning';
  /** Rule name (e.g., "missing-id", "circular-inheritance"). */
  rule: string;
  message: string;
  /** Item GUID (if available). */
  itemId?: string;
  /** Item Sitecore path (if available). */
  itemPath?: string;
  /** File path on disk. */
  filePath: string;
}

/** Result of running validation across the item tree. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** An include entry in a *.module.json file. */
export interface ModuleInclude {
  /** Folder name on disk. */
  name: string;
  /** Sitecore item path root. */
  path: string;
  /** Scope of serialization. Default: "ItemAndDescendants". */
  scope?: 'SingleItem' | 'ItemAndChildren' | 'ItemAndDescendants' | 'DescendantsOnly';
  database?: string;
  allowedPushOperations?: 'CreateOnly' | 'CreateAndUpdate' | 'CreateUpdateAndDelete';
  rules?: ModuleIncludeRule[];
}

/** A rule within a module include (overrides scope for sub-paths). */
export interface ModuleIncludeRule {
  /** Relative path within the include (use "*" for wildcard). */
  path: string;
  scope: 'Ignored' | 'SingleItem' | 'ItemAndChildren' | 'ItemAndDescendants';
  allowedPushOperations?: 'CreateOnly' | 'CreateAndUpdate' | 'CreateUpdateAndDelete';
  alias?: string;
}

/** Parsed *.module.json file. */
export interface ModuleConfig {
  /** Module namespace (e.g., "Project.MySite"). */
  namespace: string;
  /** Module file path on disk. */
  filePath: string;
  references?: string[];
  items: {
    /** Base path for serialized items relative to the module file (e.g., "items/templates"). */
    path?: string;
    includes: ModuleInclude[];
  };
}

/** Parsed sitecore.json project config. */
export interface ProjectConfig {
  /** Glob patterns for discovering *.module.json files. */
  modules: string[];
  serialization?: {
    defaultMaxRelativeItemPathLength?: number;
    defaultModuleRelativeSerializationPath?: string;
  };
}

/** Event emitted when an item changes due to file system activity. */
export interface ItemChangeEvent {
  type: 'added' | 'changed' | 'removed' | 'moved';
  itemId: string;
  /** Current path of the item (post-move for 'moved'). */
  itemPath: string;
  /** Previous path - present only for 'moved' events. */
  fromPath?: string;
}

/** Options for the engine's public API. */
export interface EngineOptions {
  /** Root directory containing sitecore.json and serialized items. When omitted,
   *  engine boots in 'no-project' mode: registry loads but no serialized items
   *  are indexed. Used for the Open Repository mode's first-run state.
   */
  rootDir?: string;
  /** Additional roots with their own sitecore.json to merge into the tree. */
  contentPaths?: string[];
  /** Whether to watch for file changes. Default: false. */
  watch?: boolean;
  /** Path to registry.json or registry.json.gz. If omitted, auto-detects or skips. */
  registryPath?: string;
  /** Path to persistent index cache (gzipped JSON). When set, startInit will
   *  try to load from the cache before re-parsing all YAML files, and write
   *  back after a full rebuild. Cache is invalidated by (path, mtime, size)
   *  signature — any file change triggers a full rebuild. */
  indexCachePath?: string;
  /** Called after the engine processes a file change. */
  onItemChange?: (event: ItemChangeEvent) => void;
}

/** Item type classification derived from the item's template GUID. */
export type ItemType = 'template' | 'templateSection' | 'templateField' | 'rendering' | 'standardValues' | 'unknown';

/** A single item from the IAR registry (OOTB Sitecore items). */
export interface RegistryItem {
  /** Item GUID (lowercase, no braces). */
  id: string;
  /** Item display name. */
  name: string;
  /** Parent item GUID. */
  parent: string;
  /** Template GUID. */
  template: string;
  /** Full Sitecore path. */
  path: string;
  /** Database this item belongs to (core, master, web). */
  database: string;
  /** Shared field values: field definition GUID → value. */
  sharedFields: Record<string, string>;
  /**
   * Versioned field values keyed by language → version → field definition
   * GUID → value. Registry v3.0 adds these to `__Standard Values` items so
   * template-default field values (e.g. SXA's Search Box template default
   * `SearchButtonText = "Search"`) can cascade to any item of that template
   * whose own serialization suppresses values equal to the SV default.
   *
   * Omitted on items that carry no versioned defaults (kept lean — only
   * ~66 of 781 SV items actually publish non-empty defaults).
   */
  versionedFields?: Record<string, Record<string, Record<string, string>>>;
}

/** Shape of the registry.json file. */
export interface RegistryData {
  version: string;
  source: string;
  extractedAt: string;
  items: RegistryItem[];
}
