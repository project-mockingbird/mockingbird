import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isPublishingValid,
  isPublishingValidationEnabled,
  WORKFLOW_STATE_FIELD_ID,
  VALID_FROM_FIELD_ID,
  VALID_TO_FIELD_ID,
} from '../../../src/engine/layout/publishing.js';
import { makeItem, buildEngine } from './_helpers.js';

describe('isPublishingValid (0.4.0.29)', () => {
  // Port of Sitecore's `Item.Publishing.IsValid(now, requireApproved: true)`.
  // Applied at rendering datasource resolution to match Edge preview's
  // `Database.GetItem` null-on-draft behaviour. See publishing.ts for the
  // full contract; these tests pin each gate individually.

  const APPROVED = '{F7FE5BDD-A991-4A58-9735-CD08F9B097AB}';
  const DRAFT = '{4460E76C-87E9-4859-9DE6-DE122774937F}';
  const FIXED_NOW = new Date('2026-04-22T12:00:00Z');

  const savedEnv = { ...process.env };
  beforeEach(() => {
    // 0.4.0.30: default mode is `none` (pre-0.4.0.29 behaviour — validation
    // off). Tests that exercise the filter must opt in by setting
    // MOCKINGBIRD_PUBLISHING_VALIDATION=approved explicitly.
    delete process.env.MOCKINGBIRD_PUBLISHING_VALIDATION;
    delete process.env.MOCKINGBIRD_APPROVED_WORKFLOW_STATES;
    // Each approved-mode test sets this fresh via its own setup.
    process.env.MOCKINGBIRD_PUBLISHING_VALIDATION = 'approved';
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function item(opts: {
    workflowState?: string;
    validFrom?: string;
    validTo?: string;
    noVersion?: boolean;
  }): ReturnType<typeof makeItem> {
    const fields: Array<{ id: string; hint: string; value: string }> = [];
    if (opts.workflowState !== undefined) fields.push({ id: WORKFLOW_STATE_FIELD_ID, hint: '__Workflow state', value: opts.workflowState });
    if (opts.validFrom !== undefined) fields.push({ id: VALID_FROM_FIELD_ID, hint: '__Valid from', value: opts.validFrom });
    if (opts.validTo !== undefined) fields.push({ id: VALID_TO_FIELD_ID, hint: '__Valid to', value: opts.validTo });
    return makeItem({
      id: 'eeee1111-0000-0000-0000-000000000001',
      path: '/sitecore/content/x',
      languages: opts.noVersion ? [] : [{
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields }],
      }],
    });
  }

  it('returns true when latest version is in an approved workflow state', () => {
    const i = item({ workflowState: APPROVED });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);
  });

  it('returns false when latest version is in a draft workflow state', () => {
    const i = item({ workflowState: DRAFT });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(false);
  });

  it('returns true when the item has no workflow state field at all (not under workflow)', () => {
    const i = item({});
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);
  });

  it('returns false when no version exists in the requested language', () => {
    const i = item({ noVersion: true });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(false);
  });

  it('returns false when __Valid from is in the future', () => {
    const i = item({ workflowState: APPROVED, validFrom: '20260601T000000Z' });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(false);
  });

  it('returns true when __Valid from is in the past', () => {
    const i = item({ workflowState: APPROVED, validFrom: '20250101T000000Z' });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);
  });

  it('returns false when __Valid to is in the past', () => {
    const i = item({ workflowState: APPROVED, validTo: '20250101T000000Z' });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(false);
  });

  it('returns true when __Valid to is in the future', () => {
    const i = item({ workflowState: APPROVED, validTo: '20270101T000000Z' });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);
  });

  it('env var MOCKINGBIRD_PUBLISHING_VALIDATION=none disables all gates', () => {
    process.env.MOCKINGBIRD_PUBLISHING_VALIDATION = 'none';
    const i = item({ workflowState: DRAFT, validFrom: '20260601T000000Z' });
    const engine = buildEngine([i]);
    expect(isPublishingValidationEnabled()).toBe(false);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);
  });

  it('default (env unset) is disabled — 0.4.0.30 flipped from approved to none', () => {
    // 0.4.0.29 shipped default=approved which broke SITE parity on ~19,833
    // routes: SITE uses multiple terminal workflow states and items with the
    // same state can be both published and unpublished in prod. Until an
    // SITE-correct predicate is found, default-off keeps the env scaffolding
    // available without filtering any content by default.
    delete process.env.MOCKINGBIRD_PUBLISHING_VALIDATION;
    const i = item({ workflowState: DRAFT });
    const engine = buildEngine([i]);
    expect(isPublishingValidationEnabled()).toBe(false);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);
  });

  it('env var MOCKINGBIRD_APPROVED_WORKFLOW_STATES overrides the default approved set', () => {
    // A project using a custom "Approved-For-Edge" workflow state can add
    // it via this env var; the default `{F7FE5BDD}` still resolves via
    // brace/case normalization.
    const CUSTOM = 'abcdef00-1111-2222-3333-444455556666';
    process.env.MOCKINGBIRD_APPROVED_WORKFLOW_STATES = `{${CUSTOM.toUpperCase()}}`;
    const i = item({ workflowState: `{${CUSTOM.toUpperCase()}}` });
    const engine = buildEngine([i]);
    expect(isPublishingValid(engine, i, { now: FIXED_NOW })).toBe(true);

    const j = item({ workflowState: APPROVED });
    const engine2 = buildEngine([j]);
    // Default approved state is NOT in the overridden set.
    expect(isPublishingValid(engine2, j, { now: FIXED_NOW })).toBe(false);
  });
});
