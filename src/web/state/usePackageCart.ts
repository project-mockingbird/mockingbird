// src/web/state/usePackageCart.ts
//
// React hook bridging the module-level packageCartStore singleton to the
// useSyncExternalStore pattern used elsewhere in the app (useTabState,
// useFocusedTabState).

import { useSyncExternalStore } from 'react';
import { packageCartStore, type CartSource, type CartSourceScope } from './packageCartStore';

export interface UsePackageCartResult {
  sources: CartSource[];
  addSource: (source: Omit<CartSource, 'id' | 'database'>) => void;
  removeSource: (id: string) => void;
  setScope: (id: string, scope: CartSourceScope) => void;
  clearAll: () => void;
}

export function usePackageCart(): UsePackageCartResult {
  const snapshot = useSyncExternalStore(
    packageCartStore.subscribe,
    packageCartStore.getSnapshot,
    packageCartStore.getSnapshot,
  );
  return {
    sources: snapshot.sources,
    addSource: packageCartStore.addSource,
    removeSource: packageCartStore.removeSource,
    setScope: packageCartStore.setScope,
    clearAll: packageCartStore.clearAll,
  };
}
