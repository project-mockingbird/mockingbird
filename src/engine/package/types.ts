// src/engine/package/types.ts

export interface CartSource {
  id: string;
  rootItemId: string;
  rootItemPath: string;
  rootItemName: string;
  scope: 'itemAndDescendants' | 'itemAndChildren' | 'descendantsOnly' | 'childrenOnly';
  database: 'master';
}

export interface PackageMetadata {
  name: string;
  author?: string;
  version?: string;
  comment?: string;
  publisher?: string;
  license?: string;
}

export type PackageWarning =
  | { kind: 'unresolved-root'; sourceId: string; rootPath: string; }
  | { kind: 'parse-failure'; itemId: string; itemPath: string; reason: string; }
  | { kind: 'truncated'; droppedCount: number; };

export interface BuildPackageResult {
  zip: Uint8Array;
  warnings: PackageWarning[];
  itemCount: number;
}
