import { describe, it, expect } from 'vitest';
import { ReadinessState } from '../../src/engine/readiness.js';

describe('ReadinessState no-project', () => {
  it('transitions initializing -> no-project via markNoProject', () => {
    const r = new ReadinessState();
    expect(r.state).toBe('initializing');
    r.markNoProject();
    expect(r.state).toBe('no-project');
  });

  it('isReady() returns false in no-project state', () => {
    const r = new ReadinessState();
    r.markNoProject();
    expect(r.isReady()).toBe(false);
  });

  it('isNoProject() returns true only after markNoProject', () => {
    const r = new ReadinessState();
    expect(r.isNoProject()).toBe(false);
    r.markNoProject();
    expect(r.isNoProject()).toBe(true);
  });

  it('ready() promise resolves when state becomes no-project', async () => {
    const r = new ReadinessState();
    const p = r.ready();
    r.markNoProject();
    await expect(p).resolves.toBeUndefined();
  });

  it('ready() resolves immediately if already no-project', async () => {
    const r = new ReadinessState();
    r.markNoProject();
    await expect(r.ready()).resolves.toBeUndefined();
  });

  it('markNoProject is a no-op once state has left initializing', () => {
    const r = new ReadinessState();
    r.markReady();
    r.markNoProject();
    expect(r.state).toBe('ready');
  });

  it('markNoProject is a no-op after markError', () => {
    const r = new ReadinessState();
    r.markError(new Error('boom'));
    r.markNoProject();
    expect(r.state).toBe('error');
  });

  it('markError is a no-op after markNoProject', () => {
    const r = new ReadinessState();
    r.markNoProject();
    r.markError(new Error('boom'));
    expect(r.state).toBe('no-project');
  });
});
