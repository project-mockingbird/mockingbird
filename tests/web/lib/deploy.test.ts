import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatPlanSummary, runDeploy, type DeployProgress } from '../../../src/web/lib/deploy';

afterEach(() => vi.restoreAllMocks());

describe('formatPlanSummary', () => {
  it('renders the counts', () => {
    expect(formatPlanSummary({ steps: [], blockingErrors: [], warnings: [], summary: { create: 2, update: 1, skip: 3 } }))
      .toBe('2 create, 1 update, 3 skip');
  });
});

describe('runDeploy', () => {
  it('parses NDJSON chunks into progress callbacks and returns the terminal event', async () => {
    const chunks = ['{"kind":"progress","completed":1,"total":2}\n', '{"kind":"done","completed":2,"total":2}\n'];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })));
    const seen: DeployProgress[] = [];
    const final = await runDeploy('e1', [], 'skip', (p) => seen.push(p));
    expect(seen.map((s) => s.kind)).toEqual(['progress', 'done']);
    expect(final.kind).toBe('done');
  });
});
