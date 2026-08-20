import type { CartSource } from '../package/types.js';

export type InstallSource = CartSource; // reuse the cart shape verbatim

export interface EnvironmentDef {
  id: string;     // stable generated id
  name: string;   // display name
  cmHost: string; // host only, no scheme (e.g. "xmc-acme-dev.sitecorecloud.io")
}

export interface EnvironmentSecret {
  clientId: string;
  clientSecret?: string; // literal; mutually exclusive with secretEnv
  secretEnv?: string;    // names a process env var holding the secret
}

export interface ResolvedEnvironment {
  id: string;
  name: string;
  cmHost: string;
  clientId: string;
  clientSecret: string;  // resolved literal
}

export const ALL_STRATEGIES = ['overwrite', 'keepExisting', 'skip'] as const;
export type ConflictStrategy = (typeof ALL_STRATEGIES)[number];
export function isConflictStrategy(v: unknown): v is ConflictStrategy {
  return typeof v === 'string' && (ALL_STRATEGIES as readonly string[]).includes(v);
}

// --- serialize-command data shapes (Management API) ---
export interface SerializeFieldData { fieldId: string; value: string; blobId?: string; nameHint?: string; }
export interface SerializeLanguageFields { language: string; fields: SerializeFieldData[]; }
export interface SerializeVersionFields { language: string; version: number; fields: SerializeFieldData[]; }
export interface SerializeItemData {
  id: string; parentId: string; path: string; name: string;
  branchId: string; templateId: string;
  sharedFields: SerializeFieldData[];
  unversionedFields: SerializeLanguageFields[];
  versions: SerializeVersionFields[];
}
export type CommandVerb = 'CREATE' | 'UPDATE';
export interface ItemCommand {
  itemID: string; parentID: string; database: 'master';
  command: CommandVerb; data: string; // JSON.stringify(SerializeItemData)
}

// --- planner ---
export type PlanAction = 'create' | 'update' | 'skip';
export interface PlanStep { itemId: string; path: string; name: string; action: PlanAction; reason: string; }
export interface PlanIssue { itemId: string; path: string; reason: string; }
export interface InstallPlan {
  steps: PlanStep[];
  blockingErrors: PlanIssue[];
  warnings: PlanIssue[];
  summary: { create: number; update: number; skip: number };
}

// --- install progress (NDJSON events) ---
export interface InstallProgress {
  kind: 'progress' | 'done' | 'error';
  completed: number;
  total: number;
  message?: string;
  errors?: { itemId: string; reason: string }[];
}

export const ALL_ZERO_GUID = '00000000-0000-0000-0000-000000000000';

// --- faithful UPDATE (overwrite) ---
export type ItemUpdateOp =
  | { kind: 'changeTemplate'; templateId: string }
  | { kind: 'addVersion'; language: string; version: number }
  | { kind: 'removeVersion'; language: string; version: number }
  | { kind: 'updateField'; fieldId: string; value: string; blobId?: string; language?: string; version?: number }
  | { kind: 'resetField'; fieldId: string; language?: string; version?: number };

// --- snapshots (diff input) ---
export interface SnapshotField { fieldId: string; value: string; blobId?: string; }
export interface SnapshotLanguageFields { language: string; fields: SnapshotField[]; }
export interface SnapshotVersionFields { language: string; version: number; fields: SnapshotField[]; }
export interface ItemSnapshot {
  id?: string;          // present for target reads; used to verify id match
  templateId: string;
  sharedFields: SnapshotField[];
  unversionedFields: SnapshotLanguageFields[];
  versions: SnapshotVersionFields[];
}
