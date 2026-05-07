// src/engine/plan-create-item.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { BRANCH_TEMPLATE_ID } from './constants.js';

export interface CreateItemArgs {
  type: 'template' | 'section' | 'field' | 'rendering' | 'fromTemplate' | 'duplicate';
  name: string;
  parentPath?: string;
  fieldType?: string;
  templateId?: string;
  sourceId?: string;
}

/**
 * Build a no-op plan that did NOT touch the engine. Use only on early-exit
 * paths that bail out BEFORE beginRecording is called (no rollback needed).
 */
function noopPlan(reason: string): MutationPlan {
  return { files: [], summary: `no-op: ${reason}`, warnings: [reason] };
}

export async function planCreateItem(engine: Engine, args: CreateItemArgs): Promise<MutationPlan> {
  // Refuse `duplicate` outright. `duplicateItem` writes via the shared
  // `writeAtomic` helper which bypasses the engine's `writeItemFile`
  // recording sandbox, so any attempt to "preview" a duplicate would hit
  // disk for real. The cost of a false negative is leaked writes during
  // a dry-run, so we surface a clear warning and leave the caller to use
  // POST /api/items directly.
  if (args.type === 'duplicate') {
    return noopPlan(
      'Preview not supported for duplicate (writes bypass the recording sandbox); use POST /api/items directly to apply.',
    );
  }

  // Refuse `fromTemplate` when the templateId resolves to a branch template.
  // `insertBranch` also writes via `writeAtomic` and bypasses recording.
  // Non-branch single-template `fromTemplate` is safe (it goes through
  // `engine.writeItemFile`, which honors the recording stack), so we let
  // it through after the branch check.
  if (args.type === 'fromTemplate') {
    if (!args.templateId) {
      return noopPlan('parentPath and templateId required');
    }
    if (isBranchTemplateId(engine, args.templateId)) {
      return noopPlan(
        'Preview not supported for branch-template fromTemplate (writes bypass the recording sandbox); use POST /api/items directly to apply.',
      );
    }
  }

  // Snapshot tree + capture writes. Any early-return path inside the try
  // block must call rollback() to clean up the recording token and (defensively)
  // the tree even though no mutations have happened on the validation path.
  const snapshot = engine.getTree().snapshot();
  const token = engine.beginRecording();

  const rollback = (): void => {
    engine.endRecording(token);
    engine.getTree().restore(snapshot);
  };

  const noopWith = (reason: string): MutationPlan => {
    rollback();
    return { files: [], summary: `no-op: ${reason}`, warnings: [reason] };
  };

  try {
    switch (args.type) {
      case 'template':
        if (!args.parentPath) return noopWith(`parentPath required`);
        if (!engine.getItemByPath(args.parentPath)) return noopWith(`Parent path not found: ${args.parentPath}`);
        await engine.createTemplate(args.name, args.parentPath);
        break;
      case 'section':
        if (!args.parentPath) return noopWith(`parentPath required`);
        if (!engine.getItemByPath(args.parentPath)) return noopWith(`Parent path not found: ${args.parentPath}`);
        await engine.createSection(args.name, args.parentPath);
        break;
      case 'field':
        if (!args.parentPath || !args.fieldType) return noopWith(`parentPath and fieldType required`);
        if (!engine.getItemByPath(args.parentPath)) return noopWith(`Parent path not found: ${args.parentPath}`);
        await engine.createField(args.name, args.parentPath, args.fieldType);
        break;
      case 'rendering':
        if (!args.parentPath) return noopWith(`parentPath required`);
        if (!engine.getItemByPath(args.parentPath)) return noopWith(`Parent path not found: ${args.parentPath}`);
        await engine.createRendering(args.name, args.parentPath);
        break;
      case 'fromTemplate': {
        // templateId presence + branch-template check are handled before
        // beginRecording (above). We still validate parentPath here so the
        // error is captured into a plan with rollback semantics.
        if (!args.parentPath) return noopWith(`parentPath and templateId required`);
        const parent = engine.getItemByPath(args.parentPath);
        if (!parent) return noopWith(`Parent path not found: ${args.parentPath}`);
        await engine.insertItem({
          parentId: parent.item.id,
          templateId: args.templateId!,
          name: args.name,
        });
        break;
      }
      default:
        return noopWith(`Unknown type: ${args.type}`);
    }
    const writes = engine.endRecording(token);
    engine.getTree().restore(snapshot);
    return {
      files: writes.map(w => ({ path: w.path, before: '', after: w.after, op: 'create' as const })),
      summary: `Create ${args.type}: ${args.name}`,
      warnings: [],
    };
  } catch (err) {
    rollback();
    return { files: [], summary: `no-op: ${err instanceof Error ? err.message : String(err)}`, warnings: [err instanceof Error ? err.message : String(err)] };
  }
}

/**
 * Mirrors the branch detection in `insertItem` and `getInsertOptions`: an
 * item is a branch template iff its own `template` field equals
 * `BRANCH_TEMPLATE_ID`. Tree wins over registry when both have the id (a
 * project override of an OOTB template). Registry-only branch templates
 * are not supported by `insertBranch` anyway, so a registry-only hit here
 * still gets refused at the planner level, which is the conservative
 * outcome.
 */
function isBranchTemplateId(engine: Engine, templateId: string): boolean {
  const tplFromTree = engine.getItemById(templateId)?.item;
  const tplFromRegistry = tplFromTree ? null : engine.getRegistryItem(templateId);
  const tplOfTpl = (tplFromTree?.template ?? tplFromRegistry?.template ?? '').toLowerCase();
  return tplOfTpl === BRANCH_TEMPLATE_ID;
}
