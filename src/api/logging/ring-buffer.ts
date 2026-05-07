export interface RingEntry {
  id: number;
  ts: number;
}

export type RingSubscriber<T extends RingEntry> = (entry: T) => void;

/**
 * Bounded FIFO queue with monotonic ids and push-time subscribers.
 *
 * `push()` accepts entries without an id and assigns one; the assigned
 * entry is what subscribers see and what `getSince()` returns. When
 * the buffer is full, the oldest entry is evicted.
 *
 * `getSince(id)` returns entries strictly newer than `id`. If `id` is
 * below the oldest retained id, the full buffer is returned (the
 * caller has lost some entries to overflow).
 *
 * `recordDrop()` is for parsing/normalization failures upstream; the
 * counter is exposed on the SSE replay so clients can show "N entries
 * dropped" if they care.
 */
export class RingBuffer<T extends RingEntry> {
  private entries: T[] = [];
  private nextId = 1;
  private subscribers = new Set<RingSubscriber<T>>();
  public dropped = 0;

  constructor(private readonly capacity: number) {}

  push(entry: Omit<T, 'id'>): T {
    const stamped = { ...(entry as object), id: this.nextId++ } as T;
    this.entries.push(stamped);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    for (const sub of this.subscribers) {
      try { sub(stamped); } catch { /* subscriber errors must not poison the buffer */ }
    }
    return stamped;
  }

  getSince(sinceId: number): T[] {
    if (this.entries.length === 0) return [];
    const oldest = this.entries[0].id;
    if (sinceId < oldest) return this.entries.slice();
    return this.entries.filter(e => e.id > sinceId);
  }

  subscribe(fn: RingSubscriber<T>): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  recordDrop(): void { this.dropped++; }
}
