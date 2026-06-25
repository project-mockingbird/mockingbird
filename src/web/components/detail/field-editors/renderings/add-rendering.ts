// src/web/components/detail/field-editors/renderings/add-rendering.ts

import type { RenderingEntry } from './types';

/**
 * Pick the next DynamicPlaceholderId for a newly added rendering: one greater
 * than the highest numeric DynamicPlaceholderId already present among the given
 * entries (page + partial), defaulting to 1. Page-unique so a Container added
 * to a page never collides with another container's exposed `container-N` slot.
 */
export function nextDynamicPlaceholderId(entries: RenderingEntry[]): number {
  let max = 0;
  for (const e of entries) {
    const raw = e.params?.DynamicPlaceholderId;
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Build the RenderingEntry for a newly added rendering. When the rendering
 * declares a dynamic placeholder (e.g. a Container's `container-{*}`), stamp a
 * `DynamicPlaceholderId` so its child placeholder resolves to a concrete slot -
 * Sitecore auto-manages this value on placement, so the editor does too rather
 * than exposing it as an editable field.
 */
export function buildAddedRenderingEntry(opts: {
  uid: string;
  renderingId: string;
  placeholder: string;
  dataSource: string;
  declaresDynamicPlaceholders: boolean;
  nextDynamicPlaceholderId: number;
}): RenderingEntry {
  const params: Record<string, string> = {};
  if (opts.declaresDynamicPlaceholders) {
    params.DynamicPlaceholderId = String(opts.nextDynamicPlaceholderId);
  }
  return {
    uid: opts.uid,
    renderingId: opts.renderingId,
    placeholder: opts.placeholder,
    dataSource: opts.dataSource,
    params,
  };
}
