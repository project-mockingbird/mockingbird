import { useState, useMemo, useRef, useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Editor } from './Editor';
import { OutputPanel } from './OutputPanel';
import { Ribbon } from './Ribbon';
import { StatusBar } from './StatusBar';
import { DocumentTabs } from './DocumentTabs';
import { ApplyToggle } from './ApplyToggle';
import { useTabPersistence, type IseTab } from './useTabPersistence';
import { useApplyMode } from './useApplyMode';
import { ApplyModeConfirmDialog } from './ApplyModeConfirmDialog';
import { useSession } from './useSession';

// One TabPane per active tab. We use `key={activeTab.id}` so switching tabs
// unmounts the old TabPane (and disposes its session via the useEffect cleanup
// in useSession). This is intentional for v1 - each tab is isolated.
// Inactive tabs do not retain a live pwsh session.
interface TabPaneProps {
  tab: IseTab;
  applyMode: boolean;
  database: string;
  onDatabaseChange: (db: string) => void;
  onBodyChange: (id: string, body: string) => void;
}

function TabPane({ tab, applyMode, database, onDatabaseChange, onBodyChange }: TabPaneProps) {
  const session = useSession({});
  // Synchronous double-click guard. session.status only flips to 'running' once
  // the WS runStarted frame arrives (~tens of ms), so two fast clicks would
  // both pass the status check and the second would 409. The ref latches
  // immediately and clears in finally, regardless of outcome.
  const executingRef = useRef(false);

  const onExecute = async () => {
    if (executingRef.current) return;
    if (session.status !== 'ready') return;
    executingRef.current = true;
    try {
      // Set $script:MockingbirdDefaultDatabase so the module's cmdlets pick up
      // the dropdown choice. We can't Set-Location to the drive root cleanly
      // (PSProvider drive-root navigation has internal "/.." pathology), so
      // database selection is plumbed via a global instead.
      const prefix = `$script:MockingbirdDefaultDatabase = '${database.replace(/'/g, "''")}'\n`;
      await session.execute(prefix + tab.body, applyMode);
    } finally {
      executingRef.current = false;
    }
  };
  const onAbort = async () => { await session.abort(); };
  const canExecute = session.status === 'ready';
  const canAbort = session.status === 'running';

  // F5 / Shift+F5 work even when Monaco doesn't have focus. Without this,
  // pressing F5 anywhere outside the editor (toolbar, output pane, document
  // body) reloads the browser, which is the worst possible user-visible
  // failure mode in a scripting tool. Monaco's own keybindings still fire
  // when the editor is focused; we check defaultPrevented so we don't
  // double-trigger on the editor pane.
  const onExecuteRef = useRef(onExecute);
  const onAbortRef = useRef(onAbort);
  onExecuteRef.current = onExecute;
  onAbortRef.current = onAbort;
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'F5') return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.shiftKey) onAbortRef.current();
      else onExecuteRef.current();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <Ribbon
        onExecute={onExecute}
        onAbort={onAbort}
        canExecute={canExecute}
        canAbort={canAbort}
        database={database}
        onDatabaseChange={onDatabaseChange}
      />
      <div className="flex flex-col flex-1 min-h-0">
        <PanelGroup
          direction="vertical"
          autoSaveId="ise-editor-output-split"
          className="flex-1 min-h-0"
        >
          <Panel defaultSize={60} minSize={20} className="overflow-hidden">
            <Editor
              value={tab.body}
              onChange={(next) => onBodyChange(tab.id, next)}
              onExecute={onExecute}
              onAbort={onAbort}
            />
          </Panel>
          <PanelResizeHandle className="h-px bg-border hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-colors" />
          <Panel defaultSize={40} minSize={15} className="overflow-hidden">
            <OutputPanel frames={session.frames} />
          </Panel>
        </PanelGroup>
        <StatusBar status={session.status} expiresAt={session.expiresAt} />
      </div>
    </>
  );
}

export function IsePage() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTabId, updateTabBody } = useTabPersistence();
  const { applyMode, setApplyMode, pendingEnable, confirmEnable, cancelEnable } = useApplyMode();
  const [database, setDatabase] = useState<string>('master');
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b bg-card px-4 py-2 h-16 shrink-0">
        <a href="/" aria-label="Home" className="flex items-center gap-3">
          <img src="/mockingbird-tile.svg" alt="" className="size-10" />
          <span className="font-semibold text-xl">Mockingbird ISE</span>
        </a>
        <ApplyToggle applyMode={applyMode} onChange={setApplyMode} />
      </header>
      <ApplyModeConfirmDialog
        open={pendingEnable}
        onConfirm={confirmEnable}
        onCancel={cancelEnable}
      />
      <DocumentTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onClose={removeTab}
        onAdd={addTab}
      />
      {activeTab && (
        <TabPane
          key={activeTab.id}
          tab={activeTab}
          applyMode={applyMode}
          database={database}
          onDatabaseChange={setDatabase}
          onBodyChange={updateTabBody}
        />
      )}
    </div>
  );
}
