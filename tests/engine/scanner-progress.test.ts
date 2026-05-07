import { describe, it, expect } from 'vitest';
import { scanDirectory } from '../../src/engine/scanner.js';
import { resolve } from 'path';

describe('scanDirectory progress reporting', () => {
  it('invokes onProgress with monotonic scanned counts and a stable total', async () => {
    const events: Array<{ scanned: number; total: number }> = [];
    const fixtureDir = resolve(__dirname, '../fixtures/valid');
    await scanDirectory(fixtureDir, {
      onProgress: (scanned, total) => events.push({ scanned, total }),
    });

    expect(events.length).toBeGreaterThan(0);
    const total = events[0].total;
    expect(total).toBeGreaterThan(0);
    for (const e of events) expect(e.total).toBe(total);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].scanned).toBeGreaterThanOrEqual(events[i - 1].scanned);
    }
    expect(events[events.length - 1].scanned).toBe(total);
  });

  it('works without onProgress (backwards compatible)', async () => {
    const fixtureDir = resolve(__dirname, '../fixtures/valid');
    const tree = await scanDirectory(fixtureDir);
    expect(tree.getAllNodes().length).toBeGreaterThan(0);
  });
});
