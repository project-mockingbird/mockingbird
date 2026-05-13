import { mdiPlus } from '@mdi/js';
import { Icon } from '@/lib/icon';
import { TabItem } from './TabItem';
import { workspaceStore } from '@/state/workspaceStore';

export interface TabstripItem {
  tabId: string;
  selectedItemId: string | null;
  isActive: boolean;
}

export interface TabstripProps {
  tabs: TabstripItem[];
  paneIndex: 0 | 1;
  onAdd: () => void;
}

export function Tabstrip({ tabs, paneIndex, onAdd }: TabstripProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (tabs.length === 0) return;
    const activeIdx = tabs.findIndex((t) => t.isActive);
    if (activeIdx === -1) return;
    let nextIdx = activeIdx;
    if (e.key === 'ArrowRight') {
      nextIdx = (activeIdx + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (activeIdx - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    workspaceStore.focusTab(tabs[nextIdx].tabId);
  };

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className="flex items-stretch border-b border-border bg-muted/30 text-sm overflow-x-auto h-9"
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.tabId}
          tabId={tab.tabId}
          paneIndex={paneIndex}
          isActive={tab.isActive}
          selectedItemId={tab.selectedItemId}
          siblingCount={tabs.length}
          tabIndex={tab.isActive ? 0 : -1}
        />
      ))}
      <button
        type="button"
        aria-label="New tab"
        onClick={onAdd}
        className="px-3 py-2 hover:bg-muted shrink-0"
      >
        <Icon path={mdiPlus} className="h-4 w-4" />
      </button>
    </div>
  );
}
