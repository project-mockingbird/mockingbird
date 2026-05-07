import type { Engine } from '../index.js';
import { FIELD_IDS } from '../constants.js';
import { parseGuidList } from '../guid.js';
import { readSharedField } from './item-fields.js';

/**
 * BFS up the base-template graph starting at `templateId` (inclusive). The
 * visitor is invoked once per template id in BFS order; returning `true`
 * terminates the walk. Cycle-safe via a visited set. IDs are normalised to
 * lowercase before visiting and comparing.
 *
 * Shared by {@link readFieldViaStandardValuesCascade} (classic SV cascade)
 * and the 0.4.0.12 SCT resolution module — both need the same walk.
 */
export function walkBaseTemplates(
  engine: Engine,
  templateId: string,
  visit: (id: string) => boolean | void,
): void {
  if (!templateId) return;
  const visited = new Set<string>();
  const queue: string[] = [templateId.toLowerCase()];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (visit(current) === true) return;
    const baseValue = readSharedField(engine, current, FIELD_IDS.baseTemplate);
    for (const baseId of parseGuidList(baseValue)) {
      if (!visited.has(baseId)) queue.push(baseId);
    }
  }
}

/**
 * True when `templateId` inherits from `ancestorId` anywhere in its transitive
 * base-template chain. Strict — identity returns false. Use
 * {@link templateDescendsFromOrEquals} when identity should match.
 */
export function templateInheritsFrom(
  engine: Engine,
  templateId: string,
  ancestorId: string,
): boolean {
  if (!templateId || !ancestorId) return false;
  const target = ancestorId.toLowerCase();
  const start = templateId.toLowerCase();
  let found = false;
  walkBaseTemplates(engine, start, (id) => {
    if (id === start) return; // skip identity
    if (id === target) {
      found = true;
      return true;
    }
  });
  return found;
}

/**
 * True when `subjectId` is `candidateId` or transitively inherits from it.
 * Mirrors Sitecore's `Template.DescendsFromOrEquals`.
 */
export function templateDescendsFromOrEquals(
  engine: Engine,
  subjectId: string,
  candidateId: string,
): boolean {
  if (!subjectId || !candidateId) return false;
  const target = candidateId.toLowerCase();
  let found = false;
  walkBaseTemplates(engine, subjectId, (id) => {
    if (id === target) {
      found = true;
      return true;
    }
  });
  return found;
}

/**
 * Direct base-template IDs from the `__Base template` shared field, in
 * declaration order. Mirrors Sitecore's `Template.GetBaseTemplates()` which
 * is direct — not transitive. Used by the SCT base-template fallback walk.
 */
export function getDirectBaseTemplateIds(engine: Engine, templateId: string): string[] {
  if (!templateId) return [];
  const baseValue = readSharedField(engine, templateId, FIELD_IDS.baseTemplate);
  return parseGuidList(baseValue);
}
