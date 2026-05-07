import chokidar, { type FSWatcher } from 'chokidar';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
}

export type FileChangeCallback = (event: FileChangeEvent) => void;

export class FileWatcher {
  private watcher: FSWatcher;
  private readyPromise: Promise<void>;

  constructor(dirs: string | string[], onChange: FileChangeCallback) {
    // Polling is off by default. It was the only way to detect host-side edits through Docker Desktop / Windows bind mounts (inotify doesn't fire across the FUSE boundary), but on a 21k-file tree the stat storm saturated libuv's threadpool and made API writes + static asset reads wait tens of seconds behind the polling queue. The Web UI write paths now call notifyItemChange directly, so no polling is needed for in-container writes. Host-side detection is opt-in via MOCKINGBIRD_WATCH_POLL_INTERVAL > 0.
    const envInterval = Number(process.env.MOCKINGBIRD_WATCH_POLL_INTERVAL ?? 0);
    const usePolling = envInterval > 0;
    this.watcher = chokidar.watch(dirs, {
      ignoreInitial: true,
      usePolling,
      interval: envInterval,
      binaryInterval: usePolling ? Math.max(envInterval * 2, 5000) : 5000,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      // Skip non-content paths under the workspace. When `npm run api` runs
      // outside docker the rootDir defaults to process.cwd() (the project
      // root), so chokidar would otherwise pick up YAMLs from tests/fixtures,
      // node_modules vendoring, build output, and the index cache - all of
      // which can pollute the in-memory tree with non-production items.
      ignored: [
        /(^|[/\\])\.git([/\\]|$)/,
        /(^|[/\\])node_modules([/\\]|$)/,
        /(^|[/\\])tests([/\\]|$)/,
        /(^|[/\\])dist([/\\]|$)/,
        /(^|[/\\])out([/\\]|$)/,
        /(^|[/\\])data[/\\]cache([/\\]|$)/,
      ],
    });

    this.watcher.on('add', (absPath: string) => {
      if (absPath.endsWith('.yml')) onChange({ type: 'add', path: absPath });
    });
    this.watcher.on('change', (absPath: string) => {
      if (absPath.endsWith('.yml')) onChange({ type: 'change', path: absPath });
    });
    this.watcher.on('unlink', (absPath: string) => {
      if (absPath.endsWith('.yml')) onChange({ type: 'unlink', path: absPath });
    });

    this.readyPromise = new Promise((r) => {
      this.watcher.on('ready', r);
    });
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  async close(): Promise<void> {
    await this.watcher.close();
  }
}
