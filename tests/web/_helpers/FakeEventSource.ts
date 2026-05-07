/**
 * Shared FakeEventSource used by tests that want to drive a real
 * useLogStream / SSE-consuming component without spinning up a server.
 *
 * Install in beforeEach:
 *   FakeEventSource.reset();
 *   (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
 *
 * Drive events from inside act():
 *   act(() => { FakeEventSource.last.emit('replay', [...]); });
 */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  static get last(): FakeEventSource {
    const arr = FakeEventSource.instances;
    if (arr.length === 0) throw new Error('FakeEventSource: no instances; was a hook/component rendered?');
    return arr[arr.length - 1];
  }

  static reset(): void {
    FakeEventSource.instances.length = 0;
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener(type: string, fn: (e: MessageEvent) => void): void {
    const list = this.listeners[type];
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown, lastEventId?: string): void {
    const handlers = this.listeners[type] ?? [];
    const event = new MessageEvent(type, {
      data: typeof data === 'string' ? data : JSON.stringify(data),
      lastEventId,
    });
    for (const h of handlers) h(event);
  }
}

export function installFakeEventSource(): void {
  FakeEventSource.reset();
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
}
