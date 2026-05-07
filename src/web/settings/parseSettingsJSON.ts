import {
  VALIDATORS,
  validateTheme,
  SETTINGS_KEYS,
  type SettingsKey,
  type Overrides,
  type ThemeValue,
} from './schema';

export type ParseResult =
  | { ok: true; settings: Overrides; theme: ThemeValue | null }
  | { ok: false; errors: string[] };

export function parseSettingsJSON(input: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`Invalid JSON syntax: ${msg}`] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['Settings must be a JSON object'] };
  }

  const errors: string[] = [];
  const settings: Overrides = {};
  let theme: ThemeValue | null = null;

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key === 'appearance.theme') {
      try {
        theme = validateTheme(value);
      } catch (e) {
        errors.push(`appearance.theme: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    if (!SETTINGS_KEYS.includes(key as SettingsKey)) {
      errors.push(`Unknown setting: "${key}"`);
      continue;
    }

    const k = key as SettingsKey;
    try {
      // Cast via unknown - the validator narrows back to the proper Settings[K].
      (settings as Record<string, unknown>)[k] = (VALIDATORS[k] as (v: unknown) => unknown)(value);
    } catch (e) {
      errors.push(`${k}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, settings, theme };
}
