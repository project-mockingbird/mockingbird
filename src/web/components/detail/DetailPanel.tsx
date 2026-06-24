
import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, FileLoadError } from '@/components/ui/empty-states';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/lib/icon';
import { mdiFileOutline } from '@mdi/js';
import { toast } from 'sonner';
import { TemplateEditor, type BuilderChanges } from './TemplateEditor';
import { applyBuilderStructuralChanges } from '@/lib/builder-save';
import { RenderingsFieldEditor } from './field-editors/renderings';
import { QuickInfo } from './QuickInfo';
import { VersionTrimmer } from './VersionTrimmer';
import { UnusedDatasourcesBanner } from './UnusedDatasourcesBanner';
import type { ItemDetail } from '@/lib/types';
import { resolveDetailTab, type TabName } from '@/lib/url-state';
import { useSettings } from '@/settings/SettingsProvider';
import { useTabState } from '@/state/useTabState';
import { workspaceStore } from '@/state/workspaceStore';
import { useTabId } from '@/state/tabContext';

const RawYamlTab = lazy(() =>
  import('./RawYamlTab').then((m) => ({ default: m.RawYamlTab }))
);

const FINAL_RENDERINGS_FIELD_ID = '04bf00db-f5fb-41f7-8ab7-22408372a981';

interface DetailPanelProps {
  selectedId: string | null;
  onNavigate?: (id: string) => void;
}

export function DetailPanel({ selectedId, onNavigate }: DetailPanelProps) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { state, navigate } = useTabState();
  const tabId = useTabId();
  const editedFields = state.editedFields;
  const setEditedFields = useCallback(
    (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
      const value = typeof next === 'function'
        ? next(workspaceStore.getState().tabs[tabId]?.editedFields ?? {})
        : next;
      navigate({ editedFields: value });
    },
    [navigate, tabId],
  );
  const [builderChanges, setBuilderChanges] = useState<BuilderChanges | null>(null);
  const selectedLang = state.language;
  const setSelectedLang = useCallback(
    (lang: string) => navigate({ language: lang }),
    [navigate],
  );
  const [selectedVersion, setSelectedVersion] = useState<number>(1);
  const [rawValues, setRawValues] = useState(settings['editor.defaultViewMode'] === 'raw');

  const { data: item, isLoading, error } = useQuery<ItemDetail>({
    queryKey: ['item', selectedId],
    queryFn: async () => {
      if (!selectedId) return null as unknown as ItemDetail;
      const res = await fetch(`/api/items/${selectedId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    enabled: !!selectedId,
    retry: false,
  });

  const readOnly = item?.source === 'registry';

  // Reset edit state when item changes. Lang persists per-tab in the workspace
  // store across item switches; version resets to the latest available for the
  // lang the user is currently on (which differs from the pre-routing
  // behaviour that always used the new item's first lang). selectedLang is
  // read from render closure but intentionally not in deps - we want this
  // effect to fire only when item.id changes, not when lang changes. Both
  // useTabState updates and item queries flow through the same render batch,
  // so when a navigation changes both at once the closure sees the new
  // selectedLang in the same render.
  useEffect(() => {
    if (!item) return;
    setEditedFields({});
    setBuilderChanges(null);
    const langs = item.languages ?? [];
    const versions = langs.find(l => l.language === selectedLang)?.versions ?? [];
    setSelectedVersion(versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const handleDiscard = () => {
    setEditedFields({});
    setBuilderChanges(null);
  };

  const languages = item?.languages ?? [];
  const langData = languages.find(l => l.language === selectedLang);
  const availableVersions = useMemo(
    () => (langData?.versions.map(v => v.version).sort((a, b) => b - a) ?? []),
    [langData],
  );

  const saveMutation = useMutation({
    mutationFn: async ({ fields, structural }: { fields: Record<string, string>; structural: BuilderChanges | null }) => {
      // Brand-new Builder sections/fields are item creations, not field-value
      // edits - they go through POST /api/items first (sections before fields,
      // so a field's parent section exists). The field-value PUT below only
      // mutates existing fields (including Builder field-prop edits).
      if (structural && item && (structural.newSections.length > 0 || structural.newFields.length > 0)) {
        await applyBuilderStructuralChanges(item.path, structural);
      }
      if (Object.keys(fields).length > 0) {
        const res = await fetch(`/api/items/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields, language: selectedLang, version: selectedVersion }),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        return res.json();
      }
      return null;
    },
    onSuccess: () => {
      toast.success('Saved');
      setEditedFields({});
      setBuilderChanges(null);
      queryClient.invalidateQueries({ queryKey: ['item', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['template-schema', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
      queryClient.invalidateQueries({ queryKey: ['unused-datasources', selectedId] });
    },
    onError: (err) => {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const handleFieldChange = (fieldId: string, value: string) => {
    setEditedFields(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSave = () => {
    const allFields: Record<string, string> = { ...editedFields };
    if (builderChanges) {
      for (const [fieldId, props] of builderChanges.fieldUpdates) {
        for (const [propId, val] of Object.entries(props)) {
          allFields[`${fieldId}:${propId}`] = val;
        }
      }
    }
    const hasStructural = builderChanges !== null &&
      (builderChanges.newSections.length > 0 || builderChanges.newFields.length > 0);
    if (Object.keys(allFields).length === 0 && !hasStructural) return;
    saveMutation.mutate({ fields: allFields, structural: builderChanges });
  };

  const dirty = Object.keys(editedFields).length > 0 ||
    (builderChanges !== null && (builderChanges.fieldUpdates.size > 0 || builderChanges.newFields.length > 0 || builderChanges.newSections.length > 0));

  if (!selectedId) {
    return (
      <EmptyState>
        <Icon path={mdiFileOutline} className="size-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Select an item from the tree</p>
      </EmptyState>
    );
  }

  if (error) {
    return <FileLoadError title="Failed to load item" error={error} />;
  }

  if (isLoading || !item) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }

  const viewMode = rawValues ? 'raw' : 'normal';

  return (
    // h-full + overflow-auto on the root because react-resizable-panels'
    // Panel component sets `overflow: hidden` inline which beats any
    // className we'd put on the Panel itself - the panel hands us its
    // height and we handle our own scrolling here.
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b bg-card px-4 py-2 text-xs">
        {languages.length > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <label className="text-muted-foreground">Language</label>
              <Select value={selectedLang} onValueChange={(v) => {
                setSelectedLang(v);
                const versions = languages.find(l => l.language === v)?.versions ?? [];
                setSelectedVersion(versions.length > 0 ? Math.max(...versions.map(ver => ver.version)) : 1);
              }}>
                <SelectTrigger size="sm" className="text-xs h-7 min-w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(l => <SelectItem key={l.language} value={l.language}>{l.language}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {availableVersions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label className="text-muted-foreground">Version</label>
                <Select value={String(selectedVersion)} onValueChange={(v) => setSelectedVersion(Number(v))}>
                  <SelectTrigger size="sm" className="text-xs h-7 min-w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVersions.map(v => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox checked={rawValues} onCheckedChange={(c) => setRawValues(!!c)} />
              <span className="text-muted-foreground">Raw Values</span>
            </label>
          </>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {!readOnly && dirty && (
            <>
              <Button onClick={handleDiscard} variant="ghost" size="sm" disabled={saveMutation.isPending}>
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">
                {saveMutation.isPending ? <><Spinner className="mr-2 size-4" /> Saving...</> : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>
      {!readOnly && dirty && (
        <div className="px-4 pt-2">
          <Alert variant="warning">
            <AlertTitle>Unsaved changes</AlertTitle>
          </Alert>
        </div>
      )}
      {readOnly && <ReadOnlyBanner />}
      <div className="px-4 py-2 space-y-4">
        <VersionTrimmer item={item} language={selectedLang} />
        <UnusedDatasourcesBanner item={item} />
        <Tabs
          value={resolveDetailTab({
            persisted: state.detailTab,
            isTemplate: item.type === 'template',
            readOnly,
            settingDefault: settings['editor.defaultTab'] as TabName,
          })}
          onValueChange={(v) => navigate({ detailTab: v as TabName })}
        >
          <TabsList>
            {item.type === 'template' && <TabsTrigger value="builder">Builder</TabsTrigger>}
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="standard">Standard Fields</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            {!readOnly && <TabsTrigger value="yaml">Yaml</TabsTrigger>}
          </TabsList>
          {item.type === 'template' && (
            <TabsContent value="builder" className="space-y-4">
              <QuickInfo item={item} onNavigate={onNavigate} />
              <TemplateEditor
                item={item}
                sectionFilter="builder"
                selectedLang={selectedLang}
                selectedVersion={selectedVersion}
                viewMode={viewMode}
                onFieldChange={handleFieldChange}
                builderChanges={builderChanges}
                onBuilderChanges={setBuilderChanges}
                editing={!readOnly}
                onNavigate={onNavigate}
              />
            </TabsContent>
          )}
          <TabsContent value="content" className="space-y-4">
            <QuickInfo item={item} onNavigate={onNavigate} />
            <TemplateEditor
              item={item}
              sectionFilter="content"
              selectedLang={selectedLang}
              selectedVersion={selectedVersion}
              viewMode={viewMode}
              onFieldChange={handleFieldChange}
              editing={!readOnly}
              onNavigate={onNavigate}
            />
          </TabsContent>
          <TabsContent value="standard" className="space-y-4">
            <QuickInfo item={item} onNavigate={onNavigate} />
            <TemplateEditor
              item={item}
              sectionFilter="standard"
              selectedLang={selectedLang}
              selectedVersion={selectedVersion}
              viewMode={viewMode}
              onFieldChange={handleFieldChange}
              editing={!readOnly}
              onNavigate={onNavigate}
            />
          </TabsContent>
          <TabsContent value="layout" className="space-y-4">
            <QuickInfo item={item} onNavigate={onNavigate} />
            {(() => {
              const versionFields = langData?.versions.find(v => v.version === selectedVersion)?.fields ?? [];
              const stored = versionFields.find(f => f.id === FINAL_RENDERINGS_FIELD_ID);
              const value = editedFields[FINAL_RENDERINGS_FIELD_ID] ?? stored?.value ?? '';
              return (
                <RenderingsFieldEditor
                  fieldId={FINAL_RENDERINGS_FIELD_ID}
                  label="__Final Renderings"
                  value={value}
                  contextItemId={item.id}
                  editing={!readOnly}
                  viewMode={viewMode}
                  onChange={(v) => handleFieldChange(FINAL_RENDERINGS_FIELD_ID, v)}
                  onNavigate={onNavigate}
                />
              );
            })()}
          </TabsContent>
          {!readOnly && (
            <TabsContent value="yaml" className="space-y-4">
              <Suspense fallback={<div className="flex h-32 items-center justify-center"><Spinner /></div>}>
                <RawYamlTab itemId={item.id} />
              </Suspense>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
