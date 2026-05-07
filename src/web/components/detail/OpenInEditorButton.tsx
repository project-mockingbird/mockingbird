import { Icon } from '@/lib/icon';
import { mdiOpenInNew } from '@mdi/js';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { buildEditorUrl, DEFAULT_EDITOR_URL_TEMPLATE } from '@/lib/editor-url';

interface OpenInEditorButtonProps {
  filePath: string | null | undefined;
  /** Layout: 'inline' for the QuickInfo row, 'button' for the Raw YAML tab toolbar. */
  variant?: 'inline' | 'button';
}

export function OpenInEditorButton({ filePath, variant = 'inline' }: OpenInEditorButtonProps) {
  const { data: status } = useEngineStatus();
  if (!filePath) return null;

  const template = status?.editorUrlTemplate ?? DEFAULT_EDITOR_URL_TEMPLATE;
  const url = buildEditorUrl(template, filePath);
  const scheme = template.split(':')[0];
  const title = `Open in editor (${scheme}://)`;

  if (variant === 'button') {
    return (
      <a
        href={url}
        title={title}
        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
      >
        <Icon path={mdiOpenInNew} className="size-3" />
        Open in editor
      </a>
    );
  }

  return (
    <a
      href={url}
      title={title}
      aria-label="Open in editor"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon path={mdiOpenInNew} className="size-3" />
    </a>
  );
}
