import { Icon } from '@/lib/icon';
import { mdiClose, mdiPlus } from '@mdi/js';
import type { IseTab } from './useTabPersistence';

interface DocumentTabsProps {
  tabs: IseTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function DocumentTabs({ tabs, activeTabId, onSelect, onClose, onAdd }: DocumentTabsProps) {
  return (
    <div className="flex items-center border-b bg-card">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2 px-3 h-9 text-sm border-r transition-colors
            ${tab.id === activeTabId ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        >
          <span className="max-w-[160px] truncate">{tab.title}</span>
          {tabs.length > 1 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onClose(tab.id);
                }
              }}
              className="hover:bg-destructive/20 rounded p-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive"
              aria-label={`Close ${tab.title}`}
            >
              <Icon path={mdiClose} className="size-3" />
            </span>
          )}
        </button>
      ))}
      <button type="button" onClick={onAdd} className="px-3 h-9 hover:bg-accent" aria-label="New tab">
        <Icon path={mdiPlus} className="size-4" />
      </button>
    </div>
  );
}
