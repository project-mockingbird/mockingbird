import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { EditorView } from '@codemirror/view';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { FileLoadError } from '@/components/ui/empty-states';
import { OpenInEditorButton } from './OpenInEditorButton';

interface RawYamlTabProps {
  itemId: string;
}

const READ_ONLY_EXTENSIONS = [yaml(), EditorView.editable.of(false)];

export function RawYamlTab({ itemId }: RawYamlTabProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['item', itemId, 'yaml'],
    queryFn: () => api.getItemYaml(itemId),
    enabled: !!itemId,
    retry: false,
  });

  if (isLoading) {
    return <div className="flex h-32 items-center justify-center"><Spinner /></div>;
  }

  if (error) {
    return <FileLoadError title="Failed to load YAML" error={error} />;
  }

  // Idle state with no error: enabled is false (no itemId) or the query has not
  // yet kicked off. Render nothing instead of an error - the loading spinner
  // covers the in-flight case, and a missing itemId is a parent-component bug,
  // not a user-facing failure.
  if (!data) {
    return null;
  }

  // Default to dark on first paint to avoid a white-on-white flash. The app's
  // default theme is dark and the host html starts with class="dark", so the
  // editor matches the surrounding chrome immediately. Once next-themes
  // hydrates, switch to light when resolvedTheme says so. resolvedTheme also
  // collapses 'system' down to the actual OS preference, so this handles
  // 'system' implicitly without a separate branch.
  const cmTheme = mounted && resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <OpenInEditorButton filePath={data.filePath} variant="button" />
      </div>
      <div className="rounded-md border overflow-hidden">
        <CodeMirror
          value={data.yaml}
          theme={cmTheme}
          extensions={READ_ONLY_EXTENSIONS}
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false, highlightSpecialChars: false }}
        />
      </div>
      <p className="text-xs text-muted-foreground px-1">
        Source: <span className="font-mono">{data.filePath}</span>
      </p>
    </div>
  );
}
