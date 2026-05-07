// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock heavy editor + xterm so they don't try to render real DOM (canvas).
// These mocks must be hoisted before the IsePage import resolves.
vi.mock('../../../src/web/components/ise/Editor', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="editor-mock" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));
vi.mock('../../../src/web/components/ise/OutputPanel', () => ({
  OutputPanel: ({ frames }: { frames: unknown[] }) => <div data-testid="output-mock">{frames.length} frames</div>,
}));

// eslint-disable-next-line import/first
import { IsePage } from '../../../src/web/components/ise/IsePage';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send() {}
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}

let mem: Record<string, string>;

beforeEach(() => {
  mem = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { mem = {}; },
  });
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string }) => {
    if (url.endsWith('/api/spe/sessions') && opts?.method === 'POST') {
      return new Response(JSON.stringify({
        sessionId: 'sess-1',
        expiresAt: new Date(Date.now() + 1800_000).toISOString(),
        createdAt: new Date().toISOString(),
      }), { status: 201 });
    }
    if (url.includes('/execute')) return new Response(JSON.stringify({ runId: 'r-1' }), { status: 202 });
    if (url.includes('/abort')) return new Response(JSON.stringify({ aborted: true }), { status: 200 });
    if (url.match(/\/api\/spe\/sessions\/[^/]+$/) && opts?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response('not mocked', { status: 500 });
  }));
  // jsdom doesn't have ResizeObserver
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IsePage', () => {
  it('renders header, tabs, ribbon, and editor', () => {
    render(<IsePage />);
    expect(screen.getByText('Mockingbird ISE')).toBeInTheDocument();
    expect(screen.getByText('Execute')).toBeInTheDocument();
    expect(screen.getByText('Abort')).toBeInTheDocument();
    expect(screen.getByTestId('editor-mock')).toBeInTheDocument();
  });

  it('starts with one tab; clicking + adds another', async () => {
    render(<IsePage />);
    expect(screen.getByText(/Untitled1/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('New tab'));
    await waitFor(() => expect(screen.getByText(/Untitled2/)).toBeInTheDocument());
  });

  it('Execute button is disabled until session is ready', async () => {
    render(<IsePage />);
    const btn = screen.getByText('Execute').closest('button')!;
    expect(btn).toBeDisabled();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('switching active tab DELETEs the prior tab\'s session', async () => {
    render(<IsePage />);
    // Wait for the first session to be allocated.
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.some(c => String(c[0]).endsWith('/api/spe/sessions') && (c[1] as { method?: string } | undefined)?.method === 'POST')).toBe(true);
    });
    fireEvent.click(screen.getByLabelText('New tab'));
    // Adding a new tab makes it active; the original TabPane unmounts and its
    // useSession cleanup fires DELETE /api/spe/sessions/<sid>.
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.some(c => /\/api\/spe\/sessions\/sess-1$/.test(String(c[0])) && (c[1] as { method?: string } | undefined)?.method === 'DELETE')).toBe(true);
    });
  });
});
