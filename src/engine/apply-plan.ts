// src/engine/apply-plan.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { writeFile, rm, mkdir } from 'fs/promises';
import { dirname } from 'path';

export async function applyPlan(_engine: Engine, plan: MutationPlan): Promise<void> {
  for (const fm of plan.files) {
    if (fm.op === 'delete') {
      await rm(fm.path, { force: true });
      // Also recursively remove the item's wrapping children directory.
      // SCS sibling-style layout puts every item at `<stem>.yml` with its
      // own children inside `<stem>/`. After the .yml is gone, the
      // wrapping dir is either empty (cleanup) or contains orphan YAMLs
      // the in-memory tree didn't know about (e.g. files left behind by
      // a prior buggy move, where the YAML's `Path` field disagreed with
      // its on-disk location and the engine's subtree walk missed them).
      // Either way, the wrapping dir IS the item's storage by SCS
      // contract, so wiping it recursively is the right cleanup.
      const stem = fm.path.replace(/\.yml$/i, '');
      if (stem !== fm.path) {
        await rm(stem, { recursive: true, force: true });
      }
      continue;
    }
    if (fm.op === 'create') {
      await mkdir(dirname(fm.path), { recursive: true });
    }
    await writeFile(fm.path, fm.after, 'utf-8');
  }
}
