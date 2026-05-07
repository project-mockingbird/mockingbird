// src/web/components/detail/field-editors/GeneralLinkFieldEditor.tsx
import { useMemo, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useItem } from '@/hooks/useItems';
import { FieldShell } from './FieldShell';
import { InsertLinkDialog } from './InsertLinkDialog';
import { InsertExternalLinkDialog } from './InsertExternalLinkDialog';
import { InsertMediaLinkDialog } from './InsertMediaLinkDialog';
import { InsertAnchorDialog } from './InsertAnchorDialog';
import { normaliseGuid, bracedGuid } from './utils';

interface GeneralLinkFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  editing: boolean;
  viewMode?: 'normal' | 'raw';
  /**
   * The field's `Source` attribute from the template-field definition.
   * Threaded into InsertLinkDialog so the tree pane honours SXA tokens
   * (`$site`, `query:$linkableHomes`, etc.) when scoping the picker. Defaults
   * to '' (full /sitecore tree) when the field has no Source configured.
   */
  fieldSource?: string;
  /**
   * The id of the item being edited. Required for SXA token resolution
   * (`$site`, `$tenant`, `$linkableHomes` all walk ancestors / read the
   * per-site Settings starting from the context item).
   */
  contextItemId?: string;
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

const SITECORE_CONTENT_PREFIX = '/sitecore/content';
const MEDIA_LIBRARY_PATH_PREFIX = '/sitecore/media library';

export interface ParsedLink {
  linktype?: string;     // internal | external | media | anchor | mailto | javascript
  id?: string;           // normalised lower
  url?: string;
  text?: string;
  target?: string;
  title?: string;
  anchor?: string;
  querystring?: string;
  class?: string;
}

export function parseLinkXml(value: string): ParsedLink | null {
  if (!value || !value.trim()) return null;
  const tag = value.match(/<link\b([^>]*?)\/?>/i);
  if (!tag) return null;
  const attrs = tag[1];
  const readAttr = (name: string): string | undefined => {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : undefined;
  };
  const id = readAttr('id');
  return {
    linktype: readAttr('linktype'),
    id: id ? normaliseGuid(id) : undefined,
    url: readAttr('url'),
    text: readAttr('text'),
    target: readAttr('target'),
    title: readAttr('title'),
    anchor: readAttr('anchor'),
    querystring: readAttr('querystring'),
    class: readAttr('class'),
  };
}

export interface InternalLinkParts {
  text: string;
  anchor: string;
  target: string;
  title: string;
  class: string;
  querystring: string;
  id: string;
}

function escapeXmlAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the 8-attribute internal-link XML envelope. Mirrors Sitecore CE's
 * InternalLinkForm.OnOK packet construction, with the bug-fix that
 * querystring is written ONCE (Sitecore writes it twice; the first write
 * uses the Anchor value and is dead code).
 *
 * Empty values are written as empty-string attributes (text=""), not omitted -
 * matches the content tree shape and Sitecore's actual output.
 */
export function serializeLinkXml(parts: InternalLinkParts): string {
  const querystring = parts.querystring.startsWith('?')
    ? parts.querystring.slice(1)
    : parts.querystring;
  const id = bracedGuid(parts.id);
  const attrs = [
    `text="${escapeXmlAttr(parts.text)}"`,
    `linktype="internal"`,
    `anchor="${escapeXmlAttr(parts.anchor)}"`,
    `querystring="${escapeXmlAttr(querystring)}"`,
    `title="${escapeXmlAttr(parts.title)}"`,
    `class="${escapeXmlAttr(parts.class)}"`,
    `target="${escapeXmlAttr(parts.target)}"`,
    `id="${id}"`,
  ];
  return `<link ${attrs.join(' ')} />`;
}

export interface ExternalLinkParts {
  text: string;
  url: string;
  target: string;
  title: string;
  class: string;
}

export function serializeExternalLinkXml(parts: ExternalLinkParts): string {
  const attrs = [
    `text="${escapeXmlAttr(parts.text)}"`,
    `linktype="external"`,
    `url="${escapeXmlAttr(parts.url)}"`,
    `anchor=""`,
    `title="${escapeXmlAttr(parts.title)}"`,
    `class="${escapeXmlAttr(parts.class)}"`,
    `target="${escapeXmlAttr(parts.target)}"`,
  ];
  return `<link ${attrs.join(' ')} />`;
}

export interface MediaLinkParts {
  text: string;
  target: string;
  title: string;
  class: string;
  id: string;
}

export function serializeMediaLinkXml(parts: MediaLinkParts): string {
  const id = bracedGuid(parts.id);
  const attrs = [
    `text="${escapeXmlAttr(parts.text)}"`,
    `linktype="media"`,
    `title="${escapeXmlAttr(parts.title)}"`,
    `class="${escapeXmlAttr(parts.class)}"`,
    `target="${escapeXmlAttr(parts.target)}"`,
    `id="${id}"`,
  ];
  return `<link ${attrs.join(' ')} />`;
}

export interface AnchorLinkParts {
  text: string;
  anchor: string;
  title: string;
  class: string;
}

/**
 * Anchor links in the content tree carry BOTH `url` and `anchor` set to the same
 * value (Sitecore CE's AnchorForm legacy behaviour). Mirroring that for
 * round-trip stability.
 */
export function serializeAnchorLinkXml(parts: AnchorLinkParts): string {
  const anchor = escapeXmlAttr(parts.anchor);
  const attrs = [
    `text="${escapeXmlAttr(parts.text)}"`,
    `linktype="anchor"`,
    `url="${anchor}"`,
    `anchor="${anchor}"`,
    `title="${escapeXmlAttr(parts.title)}"`,
    `class="${escapeXmlAttr(parts.class)}"`,
  ];
  return `<link ${attrs.join(' ')} />`;
}

export function GeneralLinkFieldEditor({ fieldId, label, value, editing, viewMode = 'normal', fieldSource, contextItemId, onChange, onNavigate }: GeneralLinkFieldEditorProps) {
  const parsed = useMemo(() => parseLinkXml(value), [value]);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertMediaOpen, setInsertMediaOpen] = useState(false);
  const [insertExternalOpen, setInsertExternalOpen] = useState(false);
  const [insertAnchorOpen, setInsertAnchorOpen] = useState(false);
  const isResolvable =
    (parsed?.linktype === 'internal' || parsed?.linktype === 'media') && !!parsed?.id;
  const { data: linkedItem } = useItem(isResolvable ? parsed!.id! : null);

  // Raw view: edit the XML directly.
  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-16 font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  // Compose the display string per linktype.
  let display: string;
  if (!parsed) {
    display = '(no link set)';
  } else {
    switch (parsed.linktype) {
      case 'internal':
        if (linkedItem) {
          display = linkedItem.path.startsWith(SITECORE_CONTENT_PREFIX)
            ? linkedItem.path.slice(SITECORE_CONTENT_PREFIX.length)
            : linkedItem.path;
        } else if (parsed.url) {
          display = parsed.url;
        } else {
          display = parsed.id ? `(loading) ${parsed.id}` : '(empty internal link)';
        }
        break;
      case 'media':
        if (linkedItem) {
          display = linkedItem.path.toLowerCase().startsWith(MEDIA_LIBRARY_PATH_PREFIX)
            ? linkedItem.path.slice(MEDIA_LIBRARY_PATH_PREFIX.length)
            : linkedItem.path;
        } else if (parsed.url) {
          display = parsed.url;
        } else {
          display = parsed.id ? `(loading) ${parsed.id}` : '(empty media link)';
        }
        break;
      case 'external':
        display = parsed.url || '(empty external link)';
        break;
      case 'anchor':
        display = parsed.anchor ? `#${parsed.anchor}` : '(empty anchor)';
        break;
      case 'mailto':
        display = (parsed.url ?? '').replace(/^mailto:/i, '') || '(empty email)';
        break;
      case 'javascript':
        display = parsed.url ? `(JavaScript) ${parsed.url.slice(0, 120)}` : '(empty JavaScript)';
        break;
      default:
        display = parsed.url || '(unknown link type)';
    }
  }

  const handleClear = () => onChange('');

  const linkClass = 'text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed';

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <div className="flex flex-col gap-1">
        {/* Toolbar - mirrors Sitecore content editor row order */}
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          <button
            type="button"
            onClick={() => setInsertOpen(true)}
            disabled={!editing}
            className={linkClass}
            title="Pick an item and configure the internal link"
          >
            Insert link
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={() => setInsertMediaOpen(true)}
            disabled={!editing}
            className={linkClass}
            title="Pick a media-library item and configure the media link"
          >
            Insert media link
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={() => setInsertExternalOpen(true)}
            disabled={!editing}
            className={linkClass}
            title="Configure an external URL link"
          >
            Insert external link
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={() => setInsertAnchorOpen(true)}
            disabled={!editing}
            className={linkClass}
            title="Configure an in-page anchor link"
          >
            Insert anchor
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={!editing || !parsed}
            className={linkClass}
          >
            Clear
          </button>
        </div>

        {/* Display row - matches Input primitive metrics (h-10, text-sm, px-3) for visual consistency with Single Line Text fields */}
        <div className="border border-input rounded-sm px-3 h-10 flex items-center text-base md:text-sm bg-body-bg truncate">
          {display}
        </div>

        {/* Optional secondary line: link text + target if either is non-empty */}
        {parsed && (parsed.text || (parsed.target && parsed.target !== '')) && (
          <div className="text-[11px] text-muted-foreground space-x-3 px-1">
            {parsed.text ? <span>Text: <span className="font-mono">{parsed.text}</span></span> : null}
            {parsed.target ? <span>Target: <span className="font-mono">{parsed.target}</span></span> : null}
          </div>
        )}
      </div>
      <InsertLinkDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        onInsert={(xml) => onChange(xml)}
        existing={parsed}
        fieldSource={fieldSource ?? ''}
        contextItemId={contextItemId}
      />
      <InsertMediaLinkDialog
        open={insertMediaOpen}
        onOpenChange={setInsertMediaOpen}
        onInsert={(xml) => onChange(xml)}
        existing={parsed}
        // Media picker always scopes to the site's media library, not the
        // field's literal Source (which usually targets internal items
        // via query:$linkableHomes). The dialog itself just honors whatever
        // source it's given - the per-dialog canonical source is decided
        // here at the call site.
        fieldSource="query:$siteMedia"
        contextItemId={contextItemId}
      />
      <InsertExternalLinkDialog
        open={insertExternalOpen}
        onOpenChange={setInsertExternalOpen}
        onInsert={(xml) => onChange(xml)}
        existing={parsed}
      />
      <InsertAnchorDialog
        open={insertAnchorOpen}
        onOpenChange={setInsertAnchorOpen}
        onInsert={(xml) => onChange(xml)}
        existing={parsed}
      />
    </FieldShell>
  );
}
