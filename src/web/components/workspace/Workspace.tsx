import { useCallback } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { ContentTree } from '@/components/tree/ContentTree';
import { DetailPanel } from '@/components/detail/DetailPanel';
import { ValidationPanel } from '@/components/validation/ValidationPanel';
import { useTabState } from '@/state/useTabState';

export interface WorkspaceProps {
  validationOpen: boolean;
  setValidationOpen: (open: boolean) => void;
  persistedSize: number;
  onTreePanelResize: (size: number) => void;
}

export function Workspace({
  validationOpen,
  setValidationOpen,
  persistedSize,
  onTreePanelResize,
}: WorkspaceProps) {
  const { state, navigate } = useTabState();
  const selectedItemId = state.selectedItemId;
  const setSelectedItemId = useCallback(
    (id: string | null) => navigate({ selectedItemId: id }),
    [navigate],
  );
  const database = state.database;

  return (
    <PanelGroup direction="horizontal" className="flex-1">
      <Panel
        defaultSize={persistedSize}
        minSize={10}
        maxSize={60}
        className="bg-card overflow-hidden"
        onResize={onTreePanelResize}
      >
        <ContentTree selectedId={selectedItemId} onSelect={setSelectedItemId} database={database} />
      </Panel>
      <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
      <Panel className="overflow-hidden">
        <PanelGroup direction="vertical">
          <Panel defaultSize={75} className="overflow-auto">
            <DetailPanel selectedId={selectedItemId} onNavigate={setSelectedItemId} />
          </Panel>
          {validationOpen && (
            <>
              <PanelResizeHandle className="h-px bg-border" />
              <Panel defaultSize={25} minSize={10}>
                <ValidationPanel
                  onNavigate={setSelectedItemId}
                  onClose={() => setValidationOpen(false)}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
