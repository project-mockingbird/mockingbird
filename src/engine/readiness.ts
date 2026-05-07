export type ReadinessStateName = 'initializing' | 'ready' | 'error';

export interface IndexProgress {
  scanned: number;
  total: number;
}

export class ReadinessState {
  state: ReadinessStateName = 'initializing';
  progress: IndexProgress = { scanned: 0, total: 0 };
  error: Error | null = null;

  private resolvers: Array<() => void> = [];
  private rejecters: Array<(err: Error) => void> = [];

  isReady(): boolean {
    return this.state === 'ready';
  }

  ready(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    if (this.state === 'error') return Promise.reject(this.error ?? new Error('unknown error'));
    return new Promise<void>((resolve, reject) => {
      this.resolvers.push(resolve);
      this.rejecters.push(reject);
    });
  }

  markProgress(scanned: number, total: number): void {
    if (this.state !== 'initializing') return;
    this.progress = { scanned, total };
  }

  markReady(): void {
    if (this.state !== 'initializing') return;
    this.state = 'ready';
    const resolvers = this.resolvers;
    this.resolvers = [];
    this.rejecters = [];
    for (const resolve of resolvers) resolve();
  }

  markError(err: Error): void {
    if (this.state !== 'initializing') return;
    this.state = 'error';
    this.error = err;
    const rejecters = this.rejecters;
    this.resolvers = [];
    this.rejecters = [];
    for (const reject of rejecters) reject(err);
  }
}
