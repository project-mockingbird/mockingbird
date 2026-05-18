export const SETTINGS_DEFAULTS = {
  'editor.defaultTab': 'content',
  'editor.defaultViewMode': 'normal',
  'versioning.trimKeepCount': 5,
  'versioning.trimWarnThreshold': 15,
  'layout.treePanelSize': 20,
  'session.autoRestore': true,
} as const;

export type Settings = {
  'editor.defaultTab': 'content' | 'standard' | 'layout';
  'editor.defaultViewMode': 'normal' | 'raw';
  'versioning.trimKeepCount': number;
  'versioning.trimWarnThreshold': number;
  'layout.treePanelSize': number;
  'session.autoRestore': boolean;
};

export type SettingsKey = keyof Settings;
export type Overrides = Partial<Settings>;

export type ThemeValue = 'light' | 'dark' | 'system';

type Validator<K extends SettingsKey> = (v: unknown) => Settings[K];

export const VALIDATORS: { [K in SettingsKey]: Validator<K> } = {
  'editor.defaultTab': (v) => {
    if (v !== 'content' && v !== 'standard' && v !== 'layout') {
      throw new Error('must be "content", "standard", or "layout"');
    }
    return v;
  },
  'editor.defaultViewMode': (v) => {
    if (v !== 'normal' && v !== 'raw') {
      throw new Error('must be "normal" or "raw"');
    }
    return v;
  },
  'versioning.trimKeepCount': (v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100) {
      throw new Error('must be an integer between 1 and 100');
    }
    return v;
  },
  'versioning.trimWarnThreshold': (v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1000) {
      throw new Error('must be an integer between 1 and 1000');
    }
    return v;
  },
  // Tree panel width as a percentage of the horizontal split. Bounds match
  // the Panel's minSize/maxSize so values from the settings JSON view can't
  // wedge the panel outside its allowed range.
  'layout.treePanelSize': (v) => {
    if (typeof v !== 'number' || v < 10 || v > 60) {
      throw new Error('must be a number between 10 and 60');
    }
    return v;
  },
  'session.autoRestore': (v) => {
    if (typeof v !== 'boolean') throw new Error('must be true or false');
    return v;
  },
};

export function validateTheme(v: unknown): ThemeValue {
  if (v !== 'light' && v !== 'dark' && v !== 'system') {
    throw new Error('must be "light", "dark", or "system"');
  }
  return v;
}

export const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingsKey[];
