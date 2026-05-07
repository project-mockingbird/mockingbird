import { describe, it, expect } from 'vitest';
import { ReadinessState } from '../../src/engine/readiness.js';

describe('ReadinessState', () => {
  it('starts in "initializing" state with zero progress', () => {
    const r = new ReadinessState();
    expect(r.state).toBe('initializing');
    expect(r.progress).toEqual({ scanned: 0, total: 0 });
    expect(r.isReady()).toBe(false);
  });

  it('ready() resolves when markReady() is called', async () => {
    const r = new ReadinessState();
    const p = r.ready();
    r.markReady();
    await expect(p).resolves.toBeUndefined();
    expect(r.state).toBe('ready');
    expect(r.isReady()).toBe(true);
  });

  it('ready() resolves immediately if already ready', async () => {
    const r = new ReadinessState();
    r.markReady();
    await expect(r.ready()).resolves.toBeUndefined();
  });

  it('markProgress() updates scanned and total', () => {
    const r = new ReadinessState();
    r.markProgress(10, 100);
    expect(r.progress).toEqual({ scanned: 10, total: 100 });
  });

  it('markError() transitions to error and rejects ready()', async () => {
    const r = new ReadinessState();
    const p = r.ready();
    r.markError(new Error('boom'));
    await expect(p).rejects.toThrow('boom');
    expect(r.state).toBe('error');
    expect(r.error?.message).toBe('boom');
  });

  it('ready() after error rejects immediately', async () => {
    const r = new ReadinessState();
    r.markError(new Error('boom'));
    await expect(r.ready()).rejects.toThrow('boom');
  });

  it('markReady() after markError() does not transition (error is terminal)', () => {
    const r = new ReadinessState();
    r.markError(new Error('boom'));
    r.markReady();
    expect(r.state).toBe('error');
    expect(r.isReady()).toBe(false);
    expect(r.error?.message).toBe('boom');
  });

  it('markError() after markReady() does not transition (ready is terminal)', () => {
    const r = new ReadinessState();
    r.markReady();
    r.markError(new Error('boom'));
    expect(r.state).toBe('ready');
    expect(r.isReady()).toBe(true);
    expect(r.error).toBeNull();
  });

  it('markProgress() is ignored after terminal transition', () => {
    const r = new ReadinessState();
    r.markProgress(5, 10);
    r.markReady();
    r.markProgress(99, 100);
    expect(r.progress).toEqual({ scanned: 5, total: 10 });
  });
});
