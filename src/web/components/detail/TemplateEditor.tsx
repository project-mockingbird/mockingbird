
import { useState, useMemo } from 'react';
import { useTemplateSchema } from '@/hooks/useItems';
import { useFieldTypes } from '@/hooks/useValidation';
import { useTabState } from '@/state/useTabState';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldEditor } from './FieldEditor';
import type { ItemDetail, ScsField, TemplateSectionSchema } from '@/lib/types';

const WELL_KNOWN_FIELDS = {
  type: 'ab162cc0-dc80-4abf-8871-998ee5d7ba32',
  source: '1eb8ae32-e190-44a6-968d-ed904c794ebf',
  shared: 'be351a73-fcb0-4213-93fa-c302d8ab4f51',
  unversioned: '39847666-389d-409b-95bd-f2016f11eed5',
};

export interface BuilderChanges {
  fieldUpdates: Map<string, Record<string, string>>;
  newFields: { sectionName: string; name: string; fieldType: string }[];
  newSections: string[];
}

interface TemplateBuilderProps {
  sections: TemplateSectionSchema[];
  onChanges: (changes: BuilderChanges) => void;
}

export function TemplateBuilder({ sections, onChanges }: TemplateBuilderProps) {
  const { data: fieldTypes } = useFieldTypes();
  const [fieldEdits, setFieldEdits] = useState<Map<string, Record<string, string>>>(new Map());
  const [newFieldName, setNewFieldName] = useState<Record<string, string>>({});
  const [newFieldType, setNewFieldType] = useState<Record<string, string>>({});
  const [pendingNewFields, setPendingNewFields] = useState<{ sectionName: string; name: string; fieldType: string }[]>([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [pendingNewSections, setPendingNewSections] = useState<string[]>([]);

  const reportChanges = (
    updates: Map<string, Record<string, string>>,
    newF: { sectionName: string; name: string; fieldType: string }[],
    newS: string[],
  ) => {
    onChanges({ fieldUpdates: updates, newFields: newF, newSections: newS });
  };

  const handleFieldPropChange = (fieldId: string, propFieldId: string, value: string) => {
    setFieldEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(fieldId) ?? {};
      next.set(fieldId, { ...existing, [propFieldId]: value });
      reportChanges(next, pendingNewFields, pendingNewSections);
      return next;
    });
  };

  const handleAddField = (sectionName: string) => {
    const name = newFieldName[sectionName]?.trim();
    if (!name) return;
    const fieldType = newFieldType[sectionName] || 'Single-Line Text';
    const updated = [...pendingNewFields, { sectionName, name, fieldType }];
    setPendingNewFields(updated);
    setNewFieldName(prev => ({ ...prev, [sectionName]: '' }));
    setNewFieldType(prev => ({ ...prev, [sectionName]: '' }));
    reportChanges(fieldEdits, updated, pendingNewSections);
  };

  const handleAddSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    const updated = [...pendingNewSections, name];
    setPendingNewSections(updated);
    setNewSectionName('');
    reportChanges(fieldEdits, pendingNewFields, updated);
  };

  const rowGrid = 'grid grid-cols-[1fr_150px_1fr_60px_60px] gap-px px-3 py-1 border-b items-center';

  const addFieldRow = (sectionName: string) => (
    <div className={rowGrid}>
      <Input
        placeholder="Add a new field"
        value={newFieldName[sectionName] ?? ''}
        onChange={(e) => setNewFieldName(prev => ({ ...prev, [sectionName]: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAddField(sectionName); }}
        className="pl-4 text-xs h-7"
      />
      <Select
        value={newFieldType[sectionName] ?? 'Single-Line Text'}
        onValueChange={(v) => setNewFieldType(prev => ({ ...prev, [sectionName]: v }))}
      >
        <SelectTrigger size="sm" className="text-xs w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fieldTypes?.map(ft => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
        </SelectContent>
      </Select>
      <span />
      <span />
      <span />
    </div>
  );

  // Staged-but-unsaved field: display-only, no editable props yet (it doesn't
  // exist as an item until Save creates it).
  const pendingFieldRow = (key: string, name: string, fieldType: string) => (
    <div key={key} className={`${rowGrid} italic text-muted-foreground`}>
      <span className="pl-4">{name}</span>
      <span className="text-xs">{fieldType}</span>
      <span />
      <span />
      <span />
    </div>
  );

  const pendingFieldsFor = (sectionName: string) =>
    pendingNewFields
      .filter(f => f.sectionName === sectionName)
      .map((f, i) => pendingFieldRow(`pending-${sectionName}-${i}`, f.name, f.fieldType));

  return (
    <div className="border rounded-md overflow-hidden text-sm">
      <div className="px-3 py-1.5 bg-stone-700 text-white text-sm font-medium">Builder</div>
      <div>
        <div className="grid grid-cols-[1fr_150px_1fr_60px_60px] gap-px bg-muted px-3 py-1.5 font-medium text-xs text-muted-foreground border-b">
          <span>Name</span>
          <span>Type</span>
          <span>Source</span>
          <span className="text-center">Shared</span>
          <span className="text-center">Unver.</span>
        </div>
        {sections.map(section => (
          <div key={section.id}>
            <div className="px-3 py-1.5 bg-muted/50 font-medium border-b">{section.name}</div>
            {section.fields.map(field => (
              <div key={field.id} className="grid grid-cols-[1fr_150px_1fr_60px_60px] gap-px px-3 py-1 border-b items-center">
                <span className="pl-4">{field.name}</span>
                <Select
                  value={fieldEdits.get(field.id)?.[WELL_KNOWN_FIELDS.type] ?? field.type}
                  onValueChange={(v) => handleFieldPropChange(field.id, WELL_KNOWN_FIELDS.type, v)}
                >
                  <SelectTrigger size="sm" className="text-xs w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldTypes?.map(ft => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  value={fieldEdits.get(field.id)?.[WELL_KNOWN_FIELDS.source] ?? field.source}
                  onChange={(e) => handleFieldPropChange(field.id, WELL_KNOWN_FIELDS.source, e.target.value)}
                  className="text-xs h-7"
                />
                <span className="text-center">
                  <Checkbox
                    checked={
                      fieldEdits.get(field.id)?.[WELL_KNOWN_FIELDS.shared] !== undefined
                        ? fieldEdits.get(field.id)![WELL_KNOWN_FIELDS.shared] === '1'
                        : field.shared
                    }
                    onCheckedChange={(c) => handleFieldPropChange(field.id, WELL_KNOWN_FIELDS.shared, c ? '1' : '0')}
                  />
                </span>
                <span className="text-center">
                  <Checkbox
                    checked={
                      fieldEdits.get(field.id)?.[WELL_KNOWN_FIELDS.unversioned] !== undefined
                        ? fieldEdits.get(field.id)![WELL_KNOWN_FIELDS.unversioned] === '1'
                        : field.unversioned
                    }
                    onCheckedChange={(c) => handleFieldPropChange(field.id, WELL_KNOWN_FIELDS.unversioned, c ? '1' : '0')}
                  />
                </span>
              </div>
            ))}
            {pendingFieldsFor(section.name)}
            {addFieldRow(section.name)}
          </div>
        ))}
        {pendingNewSections.map(sectionName => (
          <div key={`pending-section-${sectionName}`}>
            <div className="px-3 py-1.5 bg-muted/50 font-medium border-b italic">
              {sectionName}{' '}
              <span className="text-xs font-normal text-muted-foreground">(unsaved)</span>
            </div>
            {pendingFieldsFor(sectionName)}
            {addFieldRow(sectionName)}
          </div>
        ))}
        <div className="px-3 py-1.5 border-b">
          <Input
            placeholder="Add a new section"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSection(); }}
            className="text-xs h-7 w-full"
          />
        </div>
      </div>
    </div>
  );
}

interface TemplateEditorProps {
  item: ItemDetail;
  sectionFilter: 'content' | 'standard' | 'builder';
  selectedLang: string;
  selectedVersion: number;
  viewMode: 'normal' | 'raw';
  onFieldChange: (fieldId: string, value: string) => void;
  builderChanges?: BuilderChanges | null;
  onBuilderChanges?: (changes: BuilderChanges) => void;
  editing?: boolean;
  onNavigate?: (id: string) => void;
}

export function TemplateEditor({ item, sectionFilter, selectedLang, selectedVersion, viewMode, onFieldChange, onBuilderChanges, editing = true, onNavigate }: TemplateEditorProps) {
  const { state } = useTabState();
  const editedFields = state.editedFields;
  const { data: schema } = useTemplateSchema(item.id);

  const languages = item.languages ?? [];
  const langData = languages.find(l => l.language === selectedLang);
  const unversionedFields = langData?.fields ?? [];
  const versions = langData?.versions ?? [];
  const targetVersion = versions.find(v => v.version === selectedVersion) ?? versions[versions.length - 1];
  const versionNum = targetVersion?.version ?? selectedVersion;
  const versionedFields = targetVersion?.fields ?? [];

  const allItemFields = useMemo(() => {
    const map = new Map<string, ScsField>();
    for (const f of item.sharedFields) map.set(f.id, f);
    for (const f of unversionedFields) map.set(f.id, f);
    for (const f of versionedFields) map.set(f.id, f);
    return map;
  }, [item.sharedFields, unversionedFields, versionedFields]);

  const fieldTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (schema) {
      for (const section of schema.sections) {
        for (const field of section.fields) {
          if (field.type) map.set(field.id, field.type);
        }
      }
    }
    return map;
  }, [schema]);

  const fieldSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    if (schema) {
      for (const section of schema.sections) {
        for (const field of section.fields) {
          if (field.source) map.set(field.id, field.source);
        }
      }
    }
    return map;
  }, [schema]);

  const { groupedSections, unmatchedFields } = useMemo(() => {
    const matchedIds = new Set<string>();
    const sections: { title: string; fields: ScsField[]; isStandard: boolean; isStructuralFragment: boolean }[] = [];

    if (schema) {
      for (const section of schema.sections) {
        const sectionFields: ScsField[] = [];
        for (const schemaField of section.fields) {
          const itemField = allItemFields.get(schemaField.id);
          // Label resolution preference (Sitecore CE parity):
          //   1. Template Field's Title / __Display name (schemaField.displayName)
          //      - but only if it differs from the raw item name (otherwise
          //      it carries no information).
          //   2. The item's tree name (schemaField.name) - what SCS writes
          //      as the YAML Hint and what Sitecore shows when Title is unset.
          // The YAML's per-item Hint is intentionally NOT a label source:
          // SCS auto-writes Hint = field Name on every save, so preferring
          // Hint just echoes Name back and defeats the displayName promotion.
          const dn = schemaField.displayName?.trim();
          const label = dn && dn !== schemaField.name ? dn : schemaField.name;
          const merged = itemField
            ? { ...itemField, hint: label }
            : { id: schemaField.id, hint: label, value: '', type: schemaField.type };
          sectionFields.push(merged);
          matchedIds.add(schemaField.id);
        }
        if (sectionFields.length > 0) {
          sections.push({
            title: section.name,
            fields: sectionFields,
            isStandard: section.isStandard,
            isStructuralFragment: section.isStructuralFragment === true,
          });
        }
      }
    }

    const unmatched = Array.from(allItemFields.values()).filter(f => !matchedIds.has(f.id));
    return { groupedSections: sections, unmatchedFields: unmatched };
  }, [schema, allItemFields]);

  // Tab filter mirrors CE's Show Standard Fields toggle: the Standard tab
  // surfaces both `__`-prefixed Sitecore system sections (isStandard) and
  // null-base structural fragments (isStructuralFragment). The Content tab
  // shows everything else.
  const isStandardForUi = (s: { isStandard: boolean; isStructuralFragment: boolean }): boolean =>
    s.isStandard || s.isStructuralFragment;
  const visibleSections = sectionFilter === 'standard'
    ? groupedSections.filter(isStandardForUi)
    : groupedSections.filter(s => !isStandardForUi(s));

  const showOtherFields = sectionFilter === 'content' && unmatchedFields.length > 0;
  const useFallback = !schema;

  const allSectionNames = visibleSections.map(s => s.title);
  if (showOtherFields) allSectionNames.push('Other Fields');

  // Show the Builder for ANY template item, not just ones that already have
  // their own sections. A template with only inherited sections (notably a
  // Rendering Parameters template, whose fields all come from Standard
  // Rendering Parameters) has an empty `builderSections` array - it must still
  // get the Builder so the user can add the first section/field, exactly as
  // Sitecore's Template Builder does. The API only sets `builderSections` for
  // template items, so its presence (even empty) is the template signal.
  const showBuilder = item.type === 'template' && Array.isArray(schema?.builderSections) && !!onBuilderChanges;

  // The Builder is its own tab (before Content). In builder mode render ONLY the
  // Builder - never the field editors.
  if (sectionFilter === 'builder') {
    if (!showBuilder) {
      return (
        <div className="text-sm text-muted-foreground p-4">
          The Builder is available for template items only.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <TemplateBuilder sections={schema!.builderSections!} onChanges={onBuilderChanges!} />
      </div>
    );
  }

  // Standard tab fallback when no schema: show only the renamed-by-convention "Standard" buckets
  if (sectionFilter === 'standard' && useFallback) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No standard fields available. (Schema unavailable.)
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {useFallback ? (
        <div className="space-y-3">
          {item.sharedFields.length > 0 && (
            <SectionFallback
              title="Shared Fields"
              fields={item.sharedFields}
              fieldTypeMap={fieldTypeMap}
              viewMode={viewMode}
              resolvedFields={item.resolvedFields}
              editedFields={editedFields}
              onFieldChange={onFieldChange}
              editing={editing}
              onNavigate={onNavigate}
            />
          )}
          {unversionedFields.length > 0 && (
            <SectionFallback
              title="Unversioned Fields"
              fields={unversionedFields}
              fieldTypeMap={fieldTypeMap}
              viewMode={viewMode}
              resolvedFields={item.resolvedFields}
              editedFields={editedFields}
              onFieldChange={onFieldChange}
              editing={editing}
              onNavigate={onNavigate}
            />
          )}
          {versionedFields.length > 0 && (
            <SectionFallback
              title={`Versioned Fields (v${versionNum})`}
              fields={versionedFields}
              fieldTypeMap={fieldTypeMap}
              viewMode={viewMode}
              resolvedFields={item.resolvedFields}
              editedFields={editedFields}
              onFieldChange={onFieldChange}
              editing={editing}
              onNavigate={onNavigate}
            />
          )}
        </div>
      ) : visibleSections.length === 0 && !showOtherFields ? (
        <div className="text-sm text-muted-foreground p-4">
          {sectionFilter === 'standard' ? 'No standard fields on this template.' : 'No content fields on this template.'}
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={allSectionNames}>
          {visibleSections.map(section => (
            <AccordionItem key={section.title} value={section.title}>
              <AccordionTrigger className="text-sm font-medium bg-muted/40 rounded-sm">{section.title}</AccordionTrigger>
              <AccordionContent>
                <FieldGroup className="space-y-3 mt-0">
                  {section.fields.map(field => (
                    <FieldEditor
                      key={field.id}
                      fieldId={field.id}
                      hint={field.hint}
                      value={editedFields[field.id] ?? field.value}
                      fieldType={fieldTypeMap.get(field.id) ?? field.type}
                      fieldSource={fieldSourceMap.get(field.id)}
                      contextItemId={item.id}
                      viewMode={viewMode}
                      resolvedValue={item.resolvedFields?.[field.id]}
                      isEdited={editedFields[field.id] !== undefined}
                      onChange={(v) => onFieldChange(field.id, v)}
                      editing={editing}
                      onNavigate={onNavigate}
                    />
                  ))}
                </FieldGroup>
              </AccordionContent>
            </AccordionItem>
          ))}
          {showOtherFields && (
            <AccordionItem value="Other Fields">
              <AccordionTrigger className="text-sm font-medium bg-muted/40 rounded-sm">Other Fields</AccordionTrigger>
              <AccordionContent>
                <FieldGroup className="space-y-3 mt-0">
                  {unmatchedFields.map(field => (
                    <FieldEditor
                      key={field.id}
                      fieldId={field.id}
                      hint={field.hint}
                      value={editedFields[field.id] ?? field.value}
                      fieldType={fieldTypeMap.get(field.id) ?? field.type}
                      fieldSource={fieldSourceMap.get(field.id)}
                      contextItemId={item.id}
                      viewMode={viewMode}
                      resolvedValue={item.resolvedFields?.[field.id]}
                      isEdited={editedFields[field.id] !== undefined}
                      onChange={(v) => onFieldChange(field.id, v)}
                      editing={editing}
                      onNavigate={onNavigate}
                    />
                  ))}
                </FieldGroup>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  );
}

function SectionFallback({
  title,
  fields,
  fieldTypeMap,
  viewMode,
  resolvedFields,
  editedFields,
  onFieldChange,
  editing,
  onNavigate,
}: {
  title: string;
  fields: ScsField[];
  fieldTypeMap: Map<string, string>;
  viewMode: 'normal' | 'raw';
  resolvedFields?: Record<string, string>;
  editedFields: Record<string, string>;
  onFieldChange: (fieldId: string, value: string) => void;
  editing: boolean;
  onNavigate?: (id: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <Accordion type="single" collapsible defaultValue={title}>
      <AccordionItem value={title}>
        <AccordionTrigger className="text-sm font-medium bg-muted/40 rounded-sm">{title}</AccordionTrigger>
        <AccordionContent>
          <FieldGroup className="space-y-3 mt-0">
            {fields.map(field => (
              <FieldEditor
                key={field.id}
                fieldId={field.id}
                hint={field.hint}
                value={editedFields[field.id] ?? field.value}
                fieldType={fieldTypeMap.get(field.id) ?? field.type}
                viewMode={viewMode}
                resolvedValue={resolvedFields?.[field.id]}
                isEdited={editedFields[field.id] !== undefined}
                onChange={(v) => onFieldChange(field.id, v)}
                editing={editing}
                onNavigate={onNavigate}
              />
            ))}
          </FieldGroup>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
