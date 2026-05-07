import { useState, useCallback } from 'react';

const KEY = 'mockingbird-ise-apply-mode-v1';

export function useApplyMode() {
  const [applyMode, setApplyModeState] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const [pendingEnable, setPendingEnable] = useState(false);

  const persist = useCallback((next: boolean) => {
    setApplyModeState(next);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const setApplyMode = useCallback((next: boolean) => {
    if (next) {
      setPendingEnable(true);
      return;
    }
    persist(false);
  }, [persist]);

  const confirmEnable = useCallback(() => {
    persist(true);
    setPendingEnable(false);
  }, [persist]);

  const cancelEnable = useCallback(() => {
    setPendingEnable(false);
  }, []);

  return { applyMode, setApplyMode, pendingEnable, confirmEnable, cancelEnable };
}
