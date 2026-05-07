import { useState, useEffect, useCallback, useRef } from 'react';

export interface IseTab {
  id: string;
  title: string;
  body: string;
}

interface PersistedState {
  tabs: IseTab[];
  activeTabId: string;
}

const STORAGE_KEY = 'mockingbird-ise-tabs-v1';

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function loadInitial(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const id = genId();
  return { tabs: [{ id, title: 'Untitled1', body: '' }], activeTabId: id };
}

export function useTabPersistence() {
  const [state, setState] = useState<PersistedState>(loadInitial);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const addTab = useCallback(() => {
    const id = genId();
    setState((s) => ({
      tabs: [...s.tabs, { id, title: `Untitled${s.tabs.length + 1}`, body: '' }],
      activeTabId: id,
    }));
  }, []);

  const removeTab = useCallback((id: string) => {
    setState((s) => {
      const idx = s.tabs.findIndex(t => t.id === id);
      if (idx === -1) return s;
      const next = s.tabs.filter(t => t.id !== id);
      if (next.length === 0) {
        const newId = genId();
        return { tabs: [{ id: newId, title: 'Untitled1', body: '' }], activeTabId: newId };
      }
      const newActive = s.activeTabId === id ? next[Math.max(0, idx - 1)].id : s.activeTabId;
      return { tabs: next, activeTabId: newActive };
    });
  }, []);

  const setActiveTabId = useCallback((id: string) => {
    setState((s) => ({ ...s, activeTabId: id }));
  }, []);

  const updateTabBody = useCallback((id: string, body: string) => {
    setState((s) => ({ ...s, tabs: s.tabs.map(t => t.id === id ? { ...t, body } : t) }));
  }, []);

  const renameTab = useCallback((id: string, title: string) => {
    setState((s) => ({ ...s, tabs: s.tabs.map(t => t.id === id ? { ...t, title } : t) }));
  }, []);

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    addTab,
    removeTab,
    setActiveTabId,
    updateTabBody,
    renameTab,
  };
}
