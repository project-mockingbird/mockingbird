// src/web/components/detail/field-editors/renderings/EditRenderingDialog.tsx

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldEditor } from '@/components/detail/FieldEditor';
import { useRenderingMeta, useRenderingParametersSchema, usePlaceholderPaths, useSxaVariants, useSxaStyleOptions, useSxaGridOptions } from './hooks';
import { routeFieldToBinding, isSystemField, computeCoveredFieldNames, isSxaControlBinding, syntheticSxaField, type SxaControlBinding } from './field-routing';
import { VariantControl } from './VariantControl';
import { StylesControl } from './StylesControl';
import { GridParametersControl } from './GridParametersControl';
import type { RenderingEntry, RenderingCaching } from './types';
import type { TemplateSchema, TemplateFieldSchema } from '@/lib/types';

interface EditRenderingDialogProps {
  open: boolean;
  entry: RenderingEntry | null;
  contextItemId: string;
  editing: boolean;
  onCancel: () => void;
  onSave: (next: RenderingEntry) => void;
  onNavigate?: (id: string) => void;
}

export function EditRenderingDialog({
  open, entry, contextItemId, editing, onCancel, onSave, onNavigate,
}: EditRenderingDialogProps) {
  const [draft, setDraft] = useState<RenderingEntry | null>(null);

  useEffect(() => {
    if (open && entry) setDraft({ ...entry, params: { ...entry.params } });
  }, [open, entry]);

  const { data: meta } = useRenderingMeta(entry?.renderingId);
  const { data: schema, isLoading: schemaLoading } =
    useRenderingParametersSchema(entry?.renderingId);
  const { data: pathsResp } = usePlaceholderPaths(contextItemId);
  const { data: variantsResp, isLoading: variantsLoading } = useSxaVariants(entry?.renderingId);
  const { data: styleOptionsResp, isLoading: stylesLoading } = useSxaStyleOptions(entry?.renderingId);
  const { data: gridOptionsResp, isLoading: gridLoading } = useSxaGridOptions();

  const placeholderOptions = useMemo(
    () => (pathsResp?.paths ?? []).filter(p => !p.isTokenForm).map(p => p.value),
    [pathsResp],
  );

  const allSchemaFields = useMemo(() => collectFlatFields(schema ?? undefined), [schema]);
  const schemaFieldNames = useMemo(() => allSchemaFields.map(f => f.name), [allSchemaFields]);

  const coveredFieldNames = useMemo(
    () => computeCoveredFieldNames(schemaFieldNames, draft?.params ?? {}),
    [schemaFieldNames, draft?.params],
  );

  const additionalEntries = useMemo(() => {
    if (!draft) return {};
    const covered = new Set(coveredFieldNames);
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(draft.params)) {
      if (covered.has(name.toLowerCase())) continue;
      if (isSystemField(name)) continue;
      out[name] = value;
    }
    return out;
  }, [draft, coveredFieldNames]);

  if (!entry || !draft) return null;

  const updateDraft = (patch: Partial<RenderingEntry>) => setDraft(d => d ? { ...d, ...patch } : d);
  const updateCaching = (patch: Partial<RenderingCaching>) =>
    setDraft(d => d ? { ...d, caching: { ...(d.caching ?? {}), ...patch } } : d);
  const updateParam = (name: string, value: string) =>
    setDraft(d => d ? { ...d, params: { ...d.params, [name]: value } } : d);

  const handleSave = () => onSave(draft);

  const displayName = meta?.displayName ?? meta?.name ?? entry.renderingId;
  const paramTplId = meta?.parametersTemplateId ?? '(none)';

  const schemaSxaBindings = new Set<string>();
  if (schema) {
    for (const section of schema.sections) {
      for (const field of section.fields) {
        const binding = routeFieldToBinding(field.name);
        if (isSxaControlBinding(binding)) {
          schemaSxaBindings.add(binding);
        }
      }
    }
  }

  const dataDrivenSxaBindings: Array<{ binding: SxaControlBinding; paramName: string }> = [];
  for (const [paramName, value] of Object.entries(draft.params)) {
    if (!value) continue;
    const binding = routeFieldToBinding(paramName);
    if (!isSxaControlBinding(binding)) continue;
    if (schemaSxaBindings.has(binding)) continue;
    dataDrivenSxaBindings.push({ binding, paramName });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit: {displayName}</DialogTitle>
          <p className="text-[10px] text-muted-foreground font-mono">
            {entry.renderingId} - params template: {paramTplId}
          </p>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {schemaLoading && <div className="text-xs text-muted-foreground">Loading schema...</div>}

          {schema && (
            <div className="space-y-4">
              {schema.sections.map(section => {
                // Filter to renderable fields - hide sections with no visible fields.
                const visibleFields = section.fields.filter(f => !isSystemField(f.name));
                if (visibleFields.length === 0) return null;
                return (
                  <div key={section.id} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
                      {section.name}
                    </div>
                    {visibleFields.map(field => renderField(field))}
                  </div>
                );
              })}
            </div>
          )}

          {dataDrivenSxaBindings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
                SXA Parameters
              </div>
              {dataDrivenSxaBindings.map(({ binding, paramName }) => {
                const syntheticField = syntheticSxaField(binding, paramName);
                if (binding === 'variant') return renderVariant(syntheticField);
                if (binding === 'styles') return renderStyles(syntheticField);
                return renderGridParameters(syntheticField);
              })}
            </div>
          )}

          {Object.keys(additionalEntries).length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
                Additional Parameters
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Params not declared in the Parameters Template chain. Edit as key=value lines.
              </p>
              <textarea
                value={kvSerialize(additionalEntries)}
                onChange={e => mergeAdditional(e.target.value, schemaFieldNames, setDraft)}
                className="w-full min-h-[80px] font-mono text-xs p-2 border border-border rounded"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function renderField(field: TemplateFieldSchema) {
    if (isSystemField(field.name)) return null;
    const binding = routeFieldToBinding(field.name);
    if (binding === 'placeholder') return renderPlaceholder(field);
    if (binding === 'datasource') return renderDatasource(field);
    if (binding === 'caching') return renderCaching(field);
    if (binding === 'cacheclearingbehavior') return renderCcb(field);
    if (binding === 'personalization') return renderPersonalization(field);
    if (binding === 'contentdeps') return renderReadOnly(field, '(content dependencies preserved)');
    if (binding === 'tests') return renderTests(field);
    if (binding === 'variant') return renderVariant(field);
    if (binding === 'styles') return renderStyles(field);
    if (binding === 'gridparameters') return renderGridParameters(field);
    if (binding === 'additional') return null; // handled outside the section loop
    // 'custom' - schema-driven via FieldEditor
    return (
      <FieldEditor
        key={field.id}
        fieldId={field.id}
        hint={field.name}
        value={draft!.params[field.name] ?? ''}
        fieldType={field.type ?? ''}
        fieldSource={field.source ?? ''}
        contextItemId={contextItemId}
        editing={editing}
        onChange={v => updateParam(field.name, v)}
        onNavigate={onNavigate}
      />
    );
  }

  function renderPlaceholder(field: TemplateFieldSchema) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Placeholder</label>
        <Select
          value={draft!.placeholder}
          onValueChange={v => updateDraft({ placeholder: v })}
          disabled={!editing}
        >
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="(none)" />
          </SelectTrigger>
          <SelectContent>
            {placeholderOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {!placeholderOptions.includes(draft!.placeholder) && (
          <Input
            value={draft!.placeholder}
            disabled={!editing}
            onChange={e => updateDraft({ placeholder: e.target.value })}
            className="text-xs mt-1"
            placeholder="Free-text placeholder path"
          />
        )}
      </div>
    );
  }

  function renderDatasource(field: TemplateFieldSchema) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Data Source</label>
        <Input
          value={draft!.dataSource}
          disabled={!editing}
          onChange={e => updateDraft({ dataSource: e.target.value })}
          className="text-xs font-mono"
          placeholder="local:Data/Foo or {GUID}"
        />
        {(meta?.datasourceLocation || meta?.datasourceTemplate) && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {meta.datasourceLocation && <>Location: <code>{meta.datasourceLocation}</code> </>}
            {meta.datasourceTemplate && <>Template: <code>{meta.datasourceTemplate}</code></>}
          </p>
        )}
      </div>
    );
  }

  function renderCaching(field: TemplateFieldSchema) {
    const c = draft!.caching ?? {};
    const toggle = (key: keyof RenderingCaching, label: string) => (
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={!!c[key]}
          disabled={!editing || (key !== 'cacheable' && !c.cacheable)}
          onCheckedChange={v => updateCaching({ [key]: v === true } as Partial<RenderingCaching>)}
        />
        {label}
      </label>
    );
    return (
      <div key={field.id} className="space-y-1">
        <label className="text-xs font-medium mb-1 block">Caching</label>
        {toggle('cacheable', 'Cacheable')}
        <div className="ml-4 space-y-1">
          {toggle('varyByData', 'Vary By Data')}
          {toggle('varyByLogin', 'Vary By Login')}
          {toggle('varyByParm', 'Vary By Parm')}
          {toggle('varyByQueryString', 'Vary By Query String')}
          {toggle('varyByUser', 'Vary By User')}
          {toggle('clearOnIndexUpdate', 'Clear On Index Update')}
        </div>
      </div>
    );
  }

  function renderCcb(field: TemplateFieldSchema) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Cache Clearing Behavior</label>
        <Input
          value={draft!.caching?.clearingBehavior ?? ''}
          disabled={!editing}
          onChange={e => updateCaching({ clearingBehavior: e.target.value })}
          className="text-xs"
          placeholder="(default)"
        />
      </div>
    );
  }

  function renderPersonalization(field: TemplateFieldSchema) {
    const has = !!draft!.rlsRaw;
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Personalization</label>
        {has ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Rules present ({draft!.rlsRaw!.length} bytes)
            </span>
            {editing && (
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => updateDraft({ rlsRaw: undefined })}
              >
                Remove
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">No personalization</span>
        )}
      </div>
    );
  }

  function renderTests(field: TemplateFieldSchema) {
    const pt = draft!.unknownAttrs?.pt;
    const mvt = draft!.unknownAttrs?.mvt;
    if (!pt && !mvt) {
      return (
        <div key={field.id}>
          <label className="text-xs font-medium mb-1 block">Tests</label>
          <span className="text-xs text-muted-foreground italic">None</span>
        </div>
      );
    }
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Tests</label>
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {pt && <li>Personalization test: <code className="font-mono">{pt}</code></li>}
          {mvt && <li>MVT: <code className="font-mono">{mvt}</code></li>}
        </ul>
      </div>
    );
  }

  function renderVariant(field: TemplateFieldSchema) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Variant</label>
        <VariantControl
          value={draft!.params[field.name] ?? ''}
          options={variantsResp?.variants ?? []}
          loading={variantsLoading}
          editing={editing}
          onChange={v => updateParam(field.name, v)}
        />
      </div>
    );
  }

  function renderStyles(field: TemplateFieldSchema) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Styles</label>
        <StylesControl
          value={draft!.params[field.name] ?? ''}
          categories={styleOptionsResp?.categories ?? []}
          loading={stylesLoading}
          editing={editing}
          onChange={v => updateParam(field.name, v)}
        />
      </div>
    );
  }

  function renderGridParameters(field: TemplateFieldSchema) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">Grid Parameters</label>
        <GridParametersControl
          value={draft!.params[field.name] ?? ''}
          options={gridOptionsResp}
          loading={gridLoading}
          editing={editing}
          onChange={v => updateParam(field.name, v)}
        />
      </div>
    );
  }

  function renderReadOnly(field: TemplateFieldSchema, msg: string) {
    return (
      <div key={field.id}>
        <label className="text-xs font-medium mb-1 block">{field.name}</label>
        <span className="text-xs text-muted-foreground italic">{msg}</span>
      </div>
    );
  }
}

function collectFlatFields(schema: TemplateSchema | undefined): TemplateFieldSchema[] {
  if (!schema) return [];
  const out: TemplateFieldSchema[] = [];
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) out.push(field);
  }
  return out;
}

function kvSerialize(map: Record<string, string>): string {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
}

function mergeAdditional(
  text: string,
  schemaFieldNames: string[],
  setDraft: React.Dispatch<React.SetStateAction<RenderingEntry | null>>,
) {
  setDraft(d => {
    if (!d) return d;
    const covered = new Set(computeCoveredFieldNames(schemaFieldNames, d.params));
    const preserved: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.params)) {
      if (covered.has(k.toLowerCase()) || isSystemField(k)) preserved[k] = v;
    }
    const fresh: Record<string, string> = { ...preserved };
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=');
      if (eq === -1) {
        const k = line.trim();
        if (k) fresh[k] = '';
        continue;
      }
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1);
      if (k) fresh[k] = v;
    }
    return { ...d, params: fresh };
  });
}
