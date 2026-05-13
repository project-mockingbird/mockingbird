
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useSettings } from './SettingsProvider';
import { validateTheme, type ThemeValue } from './schema';
import { usePrefs, useUpdatePrefs } from '@/hooks/usePrefs';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export function UIForm() {
  const { settings, setSetting } = useSettings();
  const { theme, setTheme } = useTheme();
  const { data: prefs } = usePrefs();
  const updatePrefs = useUpdatePrefs();

  // next-themes returns undefined during SSR/first render; gate UI until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Appearance</h3>
        <Field>
          <FieldLabel>Theme</FieldLabel>
          {mounted ? (
            <RadioGroup
              value={theme ?? 'dark'}
              onValueChange={(v) => {
                try { setTheme(validateTheme(v)); } catch { /* ignore - UI options are constrained */ }
              }}
              className="flex gap-4"
            >
              {(['light', 'dark', 'system'] as ThemeValue[]).map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <RadioGroupItem value={v} id={`theme-${v}`} />
                  <Label htmlFor={`theme-${v}`} className="capitalize">{v}</Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <div className="h-6 w-32 rounded bg-muted animate-pulse" />
          )}
        </Field>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Editor</h3>
        <Field>
          <FieldLabel>Default tab when opening an item</FieldLabel>
          <RadioGroup
            value={settings['editor.defaultTab']}
            onValueChange={(v) => setSetting('editor.defaultTab', v as 'content' | 'standard' | 'layout')}
            className="flex gap-4"
          >
            {(['content', 'standard', 'layout'] as const).map((v) => (
              <div key={v} className="flex items-center gap-2">
                <RadioGroupItem value={v} id={`tab-${v}`} />
                <Label htmlFor={`tab-${v}`} className="capitalize">{v}</Label>
              </div>
            ))}
          </RadioGroup>
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="raw-default">Show raw values by default</FieldLabel>
          <Switch
            id="raw-default"
            checked={settings['editor.defaultViewMode'] === 'raw'}
            onCheckedChange={(v) => setSetting('editor.defaultViewMode', v ? 'raw' : 'normal')}
          />
        </Field>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Versioning</h3>
        <Field>
          <FieldLabel htmlFor="trim-keep">Versions to keep when trimming</FieldLabel>
          <Input
            id="trim-keep"
            type="number"
            min={1}
            max={100}
            value={settings['versioning.trimKeepCount']}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= 100) {
                setSetting('versioning.trimKeepCount', n);
              }
            }}
            className="w-24"
          />
          <FieldDescription>How many of the most recent versions are kept by the trim button.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="trim-warn">Warn when version count reaches</FieldLabel>
          <Input
            id="trim-warn"
            type="number"
            min={1}
            max={1000}
            value={settings['versioning.trimWarnThreshold']}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= 1000) {
                setSetting('versioning.trimWarnThreshold', n);
              }
            }}
            className="w-24"
          />
          <FieldDescription>The trim warning appears when an item has at least this many versions in a language.</FieldDescription>
        </Field>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Open Repository</h3>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="auto-restore">Auto-restore last session on container start</FieldLabel>
          <Switch
            id="auto-restore"
            checked={prefs?.autoRestoreLastSession ?? false}
            onCheckedChange={(v) => updatePrefs.mutate({ autoRestoreLastSession: v })}
          />
        </Field>
        <FieldDescription>
          When on, mockingbird re-opens your last profile after a Docker restart. Closing a project clears the pointer.
        </FieldDescription>
      </section>
    </div>
  );
}
