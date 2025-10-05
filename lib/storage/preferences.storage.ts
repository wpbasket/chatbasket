 import { Platform } from 'react-native'
import { MMKV } from 'react-native-mmkv'

export type ThemePreference = 'light' | 'dark'
export type AppModePreference = 'public' | 'personal'

const THEME_KEY = 'preferences.theme'
const MODE_KEY = 'preferences.mode'

// MMKV instance for native platforms
const mmkv = new MMKV({ id: 'preferences' })

const isWeb = Platform.OS === 'web'

export const PreferencesStorage = {
  // Synchronous getters are needed for Unistyles initialTheme
  getTheme(): ThemePreference | null {
    try {
      if (isWeb) {
        // Synchronous read for web
        const v = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_KEY) : null
        if (v === 'light' || v === 'dark') return v
        return null
      }
      const v = mmkv.getString(THEME_KEY)
      if (v === 'light' || v === 'dark') return v
      return null
    } catch {
      return null
    }
  },

  setTheme(theme: ThemePreference) {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(THEME_KEY, theme)
        }
      } else {
        mmkv.set(THEME_KEY, theme)
      }
    } catch {
      // no-op
    }
  },

  clearTheme() {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(THEME_KEY)
        }
      } else {
        mmkv.delete(THEME_KEY)
      }
    } catch {
      // no-op
    }
  },

  // App mode persistence (public | personal)
  getMode(): AppModePreference | null {
    try {
      if (isWeb) {
        const v = typeof window !== 'undefined' ? window.localStorage.getItem(MODE_KEY) : null
        if (v === 'public' || v === 'personal') return v
        return null
      }
      const v = mmkv.getString(MODE_KEY)
      if (v === 'public' || v === 'personal') return v
      return null
    } catch {
      return null
    }
  },

  setMode(mode: AppModePreference) {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(MODE_KEY, mode)
        }
      } else {
        mmkv.set(MODE_KEY, mode)
      }
    } catch {
      // no-op
    }
  },

  clearMode() {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(MODE_KEY)
        }
      } else {
        mmkv.delete(MODE_KEY)
      }
    } catch {
      // no-op
    }
  },
}

export { THEME_KEY, MODE_KEY }
