// Minimal WebSocket mock for testing useWebSocket hook arms.
// Captures instances + exposes emit() to dispatch synthetic messages.

export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emit(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

export function installFakeWebSocket(): void {
  FakeWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
}
