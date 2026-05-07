import { describe, it, expect } from 'vitest';
import {
  isVersionValid,
  VALID_FROM_FIELD_ID,
  VALID_TO_FIELD_ID,
  HIDE_VERSION_FIELD_ID,
  WORKFLOW_STATE_FIELD_ID,
  DEFAULT_APPROVED_STATE,
} from '../../../src/engine/layout/version-validity.js';
import type { ScsVersion } from '../../../src/engine/types.js';

describe('isVersionValid (0.4.0.31) — Sitecore ItemPublishing.IsValid port', () => {
  // Decompile ref: Sitecore.Kernel.decompiled.cs:377576-377602. Per-version
  // predicate — Hide version + __Valid from/__Valid to date range +
  // (when requireApproved) __Workflow state ∈ approved set.

  const FIXED_NOW = new Date('2026-04-22T12:00:00Z');
  const APPROVED = '{F7FE5BDD-A991-4A58-9735-CD08F9B097AB}';
  const DRAFT = '{4460E76C-87E9-4859-9DE6-DE122774937F}';

  function version(fields: Array<{ id: string; value: string }>): ScsVersion {
    return {
      version: 1,
      fields: fields.map(f => ({ id: f.id, hint: '', value: f.value })),
    };
  }

  it('version with no valid-from / valid-to / hide-version → passes at any date', () => {
    const v = version([]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(true);
  });

  it('version with __Valid from in the future → fails', () => {
    const v = version([{ id: VALID_FROM_FIELD_ID, value: '20270101T000000Z' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(false);
  });

  it('version with __Valid from in the past → passes', () => {
    const v = version([{ id: VALID_FROM_FIELD_ID, value: '20240101T000000Z' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(true);
  });

  it('version with __Valid from exactly equal to date → passes (Sitecore uses ≤ on lower bound)', () => {
    const v = version([{ id: VALID_FROM_FIELD_ID, value: '20260422T120000Z' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(true);
  });

  it('version with __Valid to in the past → fails', () => {
    const v = version([{ id: VALID_TO_FIELD_ID, value: '20250101T000000Z' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(false);
  });

  it('version with __Valid to equal to date → fails (Sitecore uses strict < on upper bound)', () => {
    const v = version([{ id: VALID_TO_FIELD_ID, value: '20260422T120000Z' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(false);
  });

  it('version with __Valid to in the future → passes', () => {
    const v = version([{ id: VALID_TO_FIELD_ID, value: '20270101T000000Z' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(true);
  });

  it('version with Hide version = 1 → fails regardless of date', () => {
    const v = version([
      { id: HIDE_VERSION_FIELD_ID, value: '1' },
      { id: VALID_FROM_FIELD_ID, value: '20240101T000000Z' },
    ]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(false);
  });

  it('version with Hide version = 0 → passes (treated as false)', () => {
    const v = version([{ id: HIDE_VERSION_FIELD_ID, value: '0' }]);
    expect(isVersionValid(v, undefined, FIXED_NOW)).toBe(true);
  });

  it('requireApproved=true + approved workflow state → passes', () => {
    const v = version([{ id: WORKFLOW_STATE_FIELD_ID, value: APPROVED }]);
    expect(isVersionValid(v, undefined, FIXED_NOW, {
      requireApproved: true,
      approvedStates: new Set([DEFAULT_APPROVED_STATE]),
    })).toBe(true);
  });

  it('requireApproved=true + draft workflow state → fails', () => {
    const v = version([{ id: WORKFLOW_STATE_FIELD_ID, value: DRAFT }]);
    expect(isVersionValid(v, undefined, FIXED_NOW, {
      requireApproved: true,
      approvedStates: new Set([DEFAULT_APPROVED_STATE]),
    })).toBe(false);
  });

  it('requireApproved=true + no workflow state field → passes (not under workflow)', () => {
    const v = version([]);
    expect(isVersionValid(v, undefined, FIXED_NOW, {
      requireApproved: true,
      approvedStates: new Set([DEFAULT_APPROVED_STATE]),
    })).toBe(true);
  });

  it('requireApproved=false + draft workflow state → passes (gate disabled)', () => {
    const v = version([{ id: WORKFLOW_STATE_FIELD_ID, value: DRAFT }]);
    expect(isVersionValid(v, undefined, FIXED_NOW, { requireApproved: false })).toBe(true);
  });

  it('reads fields from langFields when absent from the version', () => {
    // Some authoring paths store __Valid from as a language-unversioned
    // field (lang.fields) instead of on the version's field list.
    // isVersionValid must honor that — version-level takes precedence.
    const v = version([]);
    const langFields = [{ id: VALID_FROM_FIELD_ID, value: '20270101T000000Z' }];
    expect(isVersionValid(v, langFields, FIXED_NOW)).toBe(false);
  });

  it('version-level field takes precedence over langFields', () => {
    const v = version([{ id: VALID_FROM_FIELD_ID, value: '20240101T000000Z' }]);
    const langFields = [{ id: VALID_FROM_FIELD_ID, value: '20270101T000000Z' }];
    // Version has past date → passes; lang has future date → would fail if
    // it won. Version wins.
    expect(isVersionValid(v, langFields, FIXED_NOW)).toBe(true);
  });
});
