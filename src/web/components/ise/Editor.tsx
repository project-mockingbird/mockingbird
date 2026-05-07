import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';

interface EditorProps {
  value: string;
  onChange: (next: string) => void;
  onExecute?: () => void;
  onAbort?: () => void;
}

export function Editor({ value, onChange, onExecute, onAbort }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // Keep latest callbacks in refs so the Monaco bindings always see current handlers
  const executeRef = useRef(onExecute);
  const abortRef = useRef(onAbort);
  const onChangeRef = useRef(onChange);
  executeRef.current = onExecute;
  abortRef.current = onAbort;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const editor = monaco.editor.create(containerRef.current, {
      value,
      language: 'powershell',
      theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 4,
      insertSpaces: true,
    });
    editorRef.current = editor;

    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    // F5 = Execute
    editor.addCommand(monaco.KeyCode.F5, () => executeRef.current?.());
    // Shift+F5 = Abort
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F5, () => abortRef.current?.());

    return () => {
      subscription.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value updates (e.g. tab switch) - sync to editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
}
