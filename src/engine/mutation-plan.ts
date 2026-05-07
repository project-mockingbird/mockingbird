// src/engine/mutation-plan.ts

export type MutationOp = 'create' | 'update' | 'delete';

export interface FileMutation {
  /** Absolute filesystem path of the YAML file. */
  path: string;
  /** Existing on-disk content. Empty string for `create`. */
  before: string;
  /** Content to write. Empty string for `delete`. */
  after: string;
  /** Operation kind. */
  op: MutationOp;
}

export interface MutationPlan {
  /** Per-file changes the plan would make. */
  files: FileMutation[];
  /** Human-readable summary. e.g. "Update 2 fields on /sitecore/content/Foo". */
  summary: string;
  /** Warnings the planner produced (e.g. "field X had no schema entry"). */
  warnings: string[];
}
