import { AppStorage } from '../storage.wrapper';

export type ThemePreference = 'light' | 'dark';
export type AppModePreference = 'public' | 'personal';

const THEME_KEY = 'preferences.theme';
const MODE_KEY = 'preferences.mode';

type PreferencesSchema = {
  [THEME_KEY]: ThemePreference;
  [MODE_KEY]: AppModePreference;
};

// Lazy singleton — defers MMKV construction until first access so the native
// runtime is ready.  On Web the cost is negligible; on native it avoids the
// "Cannot read property 'prototype' of undefined" crash at module-load time.
let _prefStorage: AppStorage<PreferencesSchema> | null = null;

function getPrefStorage(): AppStorage<PreferencesSchema> {
  if (!_prefStorage) {
    _prefStorage = new AppStorage<PreferencesSchema>('preferences', {}, {
      webBackend: 'sync',
      disableWebPrefix: true, // Maintain compatibility with existing localStorage keys
    });
  }
  return _prefStorage;
}

export const PreferencesStorage = {
  // Synchronous getters are needed for Unistyles initialTheme
  getTheme(): ThemePreference | null {
    return getPrefStorage().getSync(THEME_KEY);
  },

  setTheme(theme: ThemePreference) {
    getPrefStorage().set(THEME_KEY, theme);
  },

  clearTheme() {
    getPrefStorage().remove(THEME_KEY);
  },

  // App mode persistence (public | personal)
  getMode(): AppModePreference | null {
    return getPrefStorage().getSync(MODE_KEY);
  },

  setMode(mode: AppModePreference) {
    getPrefStorage().set(MODE_KEY, mode);
  },

  clearMode() {
    getPrefStorage().remove(MODE_KEY);
  },
};

export { THEME_KEY, MODE_KEY };
