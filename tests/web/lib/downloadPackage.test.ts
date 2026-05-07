// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadPackage } from '@/lib/downloadPackage';
import type { CartSource } from '@/state/packageCartStore';

function makeSource(overrides: Partial<CartSource> = {}): CartSource {
  return {
    id: 'src-1',
    rootItemId: '{a1b2c3d4-e5f6-7890-1234-567890abcdef}',
    rootItemPath: '/sitecore/content/Site/Home',
    rootItemName: 'Home',
    scope: 'itemAndDescendants',
    database: 'master',
    ...overrides,
  };
}

function mockResponse(opts: {
  status?: number;
  statusText?: string;
  body?: unknown;
  blob?: Blob;
  headers?: Record<string, string>;
}): Response {
  const status = opts.status ?? 200;
  const ok = status >= 200 && status < 300;
  const headers = new Headers(opts.headers ?? {});
  return {
    ok,
    status,
    statusText: opts.statusText ?? '',
    headers,
    blob: () => Promise.resolve(opts.blob ?? new Blob(['zip-bytes'])),
    json: () => (opts.body === undefined
      ? Promise.reject(new Error('no body'))
      : Promise.resolve(opts.body)),
  } as unknown as Response;
}

describe('downloadPackage', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    // jsdom doesn't define URL.createObjectURL by default.
    vi.stubGlobal('URL', Object.assign(globalThis.URL, {
      createObjectURL,
      revokeObjectURL,
    }));

    // Spy on anchor .click() without breaking createElement for the rest of
    // the document tree (Dialog, etc. don't render here, but be safe).
    clickSpy = vi.fn();
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tag, options);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy, configurable: true });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/package and triggers a browser download on 200', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(mockResponse({
      headers: {
        'Content-Disposition': 'attachment; filename="my-pkg.zip"',
        'X-Mockingbird-Package-Warnings': JSON.stringify([
          { kind: 'unresolved-root', sourceId: 's2', rootPath: '/missing' },
        ]),
        'X-Mockingbird-Package-Item-Count': '847',
      },
    })));
    vi.stubGlobal('fetch', fetchSpy);

    const args = {
      sources: [makeSource()],
      metadata: { name: 'my-pkg', author: 'me', version: '1.0' },
    };
    const result = await downloadPackage(args);

    // Right URL, method, headers, body shape.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/package');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(args);

    // Download fired.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // Parsed return shape.
    expect(result.filename).toBe('my-pkg.zip');
    expect(result.itemCount).toBe(847);
    expect(result.warnings).toEqual([
      { kind: 'unresolved-root', sourceId: 's2', rootPath: '/missing' },
    ]);
  });

  it('falls back to <metadata.name>.zip when Content-Disposition is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockResponse({
      headers: {},
    }))));
    const result = await downloadPackage({
      sources: [makeSource()],
      metadata: { name: 'fallback' },
    });
    expect(result.filename).toBe('fallback.zip');
    expect(result.warnings).toEqual([]);
    expect(result.itemCount).toBe(0);
  });

  it('throws Error(error) on a 400 with a parseable JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockResponse({
      status: 400,
      statusText: 'Bad Request',
      body: { error: 'oops', statusCode: 400 },
    }))));
    await expect(downloadPackage({
      sources: [makeSource()],
      metadata: { name: 'x' },
    })).rejects.toThrow('oops');
    // Download path never ran.
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('throws something useful on a 500 with no parseable JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockResponse({
      status: 500,
      statusText: 'Internal Server Error',
      // body undefined -> json() rejects
    }))));
    await expect(downloadPackage({
      sources: [makeSource()],
      metadata: { name: 'x' },
    })).rejects.toThrow(/internal server error|build failed/i);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('ignores a malformed warnings header and returns warnings: []', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockResponse({
      headers: {
        'Content-Disposition': 'attachment; filename="x.zip"',
        'X-Mockingbird-Package-Warnings': '{not-json',
        'X-Mockingbird-Package-Item-Count': '5',
      },
    }))));
    const result = await downloadPackage({
      sources: [makeSource()],
      metadata: { name: 'x' },
    });
    expect(result.warnings).toEqual([]);
    expect(result.itemCount).toBe(5);
  });
});
