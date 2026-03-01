import { AppStorage } from '../storage.wrapper';

export type ThemePreference = 'light' | 'dark';
export type AppModePreference = 'public' | 'personal';

const THEME_KEY = 'preferences.theme';
const MODE_KEY = 'preferences.mode';

type PreferencesSchema = {
  [THEME_KEY]: ThemePreference;
  [MODE_KEY]: AppModePreference;
};

// Use AppStorage with sync backend for Web to support synchronous access
const prefStorage = new AppStorage<PreferencesSchema>('preferences', {}, {
  webBackend: 'sync',
  disableWebPrefix: true // Maintain compatibility with existing localStorage keys
});

export const PreferencesStorage = {
  // Synchronous getters are needed for Unistyles initialTheme
  getTheme(): ThemePreference | null {
    return prefStorage.getSync(THEME_KEY);
  },

  setTheme(theme: ThemePreference) {
    prefStorage.set(THEME_KEY, theme);
  },

  clearTheme() {
    prefStorage.remove(THEME_KEY);
  },

  // App mode persistence (public | personal)
  getMode(): AppModePreference | null {
    return prefStorage.getSync(MODE_KEY);
  },

  setMode(mode: AppModePreference) {
    prefStorage.set(MODE_KEY, mode);
  },

  clearMode() {
    prefStorage.remove(MODE_KEY);
  },
};

export { THEME_KEY, MODE_KEY };
