// src/web/state/packageCartStore.ts
//
// Hand-rolled subscribe/notify store for the Package Builder cart, mirroring
// the closedTabsStore pattern. Module-level singleton, persisted to
// localStorage so the cart survives reloads.
//
// The CartSource shape here is paired with the server-side definition in
// src/engine/package/types.ts. Both sides communicate over JSON via
// POST /api/package; if you change one, change the other in the same commit.

const STORAGE_KEY = 'mockingbird.packageCart.v1';

export type CartSourceScope =
  | 'itemAndDescendants'
  | 'itemAndChildren'
  | 'descendantsOnly'
  | 'childrenOnly';

export interface CartSource {
  id: string;
  rootItemId: string;
  rootItemPath: string;
  rootItemName: string;
  scope: CartSourceScope;
  database: 'master';
}

export interface CartSnapshot {
  sources: CartSource[];
}

export interface PackageCartStore {
  getSnapshot: () => CartSnapshot;
  addSource: (source: Omit<CartSource, 'id' | 'database'>) => void;
  removeSource: (id: string) => void;
  setScope: (id: string, scope: CartSourceScope) => void;
  clearAll: () => void;
  subscribe: (listener: () => void) => () => void;
}

// Try/catch around localStorage so SSR / disabled-storage / corrupt-JSON paths
// all degrade to an empty cart rather than blowing up the store.
function readInitialSnapshot(): CartSnapshot {
  if (typeof localStorage === 'undefined') return { sources: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sources: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { sources?: unknown }).sources)
    ) {
      // Trust the shape; if a source is malformed at runtime the UI will show
      // it as-is (better than wiping the user's cart on a minor schema drift).
      return { sources: (parsed as CartSnapshot).sources };
    }
    return { sources: [] };
  } catch {
    return { sources: [] };
  }
}

function persistSnapshot(snapshot: CartSnapshot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or storage disabled - swallow; in-memory state is still
    // correct so the user can finish their session.
  }
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID. Not cryptographically
  // strong; the cart only needs unique-within-process ids.
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPackageCartStore(): PackageCartStore {
  let snapshot: CartSnapshot = readInitialSnapshot();
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };

  const commit = (next: CartSnapshot) => {
    snapshot = next;
    persistSnapshot(snapshot);
    notify();
  };

  return {
    getSnapshot: () => snapshot,
    addSource: (source) => {
      const fresh: CartSource = {
        id: genId(),
        database: 'master',
        rootItemId: source.rootItemId,
        rootItemPath: source.rootItemPath,
        rootItemName: source.rootItemName,
        scope: source.scope,
      };
      commit({ sources: [...snapshot.sources, fresh] });
    },
    removeSource: (id) => {
      const next = snapshot.sources.filter((s) => s.id !== id);
      if (next.length === snapshot.sources.length) return;
      commit({ sources: next });
    },
    setScope: (id, scope) => {
      let changed = false;
      const next = snapshot.sources.map((s) => {
        if (s.id !== id) return s;
        if (s.scope === scope) return s;
        changed = true;
        return { ...s, scope };
      });
      if (!changed) return;
      commit({ sources: next });
    },
    clearAll: () => {
      if (snapshot.sources.length === 0) return;
      commit({ sources: [] });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const packageCartStore: PackageCartStore = createPackageCartStore();
