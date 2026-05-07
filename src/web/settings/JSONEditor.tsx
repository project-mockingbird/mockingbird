
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { useSettings } from './SettingsProvider';
import { parseSettingsJSON } from './parseSettingsJSON';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function buildDisplayJSON(overrides: Record<string, unknown>, currentTheme: string | undefined): string {
  const merged: Record<string, unknown> = {
    ...overrides,
    'appearance.theme': currentTheme ?? 'system',
  };
  return JSON.stringify(merged, null, 2);
}

export function JSONEditor() {
  const { overrides, setSetting, reset } = useSettings();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const canonical = useMemo(
    () => buildDisplayJSON(overrides as Record<string, unknown>, theme),
    [overrides, theme]
  );
  const [text, setText] = useState(canonical);
  const [errors, setErrors] = useState<string[]>([]);

  // When overrides or theme change externally (e.g., UI tab edits, Reset), refresh the textarea.
  useEffect(() => {
    setText(canonical);
    setErrors([]);
  }, [canonical]);

  function onApply() {
    const result = parseSettingsJSON(text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    // Apply: merge into overrides by setting each parsed key, and clearing keys absent from input.
    // To match VS Code semantic where the JSON is the canonical override set, we reset() then setSetting() for each parsed key.
    reset();
    for (const [k, v] of Object.entries(result.settings)) {
      // Type-narrow safely: parser already validated.
      setSetting(k as never, v as never);
    }
    if (result.theme !== null) {
      setTheme(result.theme);
    }
    setErrors([]);
  }

  if (!mounted) {
    return <div className="h-48 w-full rounded bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Showing only non-default values. <code>appearance.theme</code> is shown for convenience but stored separately by next-themes.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="font-mono text-xs min-h-48"
        spellCheck={false}
      />
      {errors.length > 0 && (
        <ul className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive space-y-1">
          {errors.map((err, i) => <li key={i}>{err}</li>)}
        </ul>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={onApply}>Apply</Button>
      </div>
    </div>
  );
}
