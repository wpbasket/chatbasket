import { PreferencesStorage } from '@/lib/storage/commonStorage/storage.preferences'
import { observable } from '@legendapp/state'

export type AppMode = 'public' | 'personal'

function getInitialMode(): AppMode {
  if (typeof window !== 'undefined') {
    const path = window.location?.pathname ?? ''
    if (path.startsWith('/public')) {
      return 'public'
    }
    if (path.startsWith('/personal')) {
      return 'personal'
    }
  }
  return (PreferencesStorage.getMode?.() as AppMode | null) ?? 'public'
}

const initialMode: AppMode = getInitialMode()

export const appMode$ = observable({
  mode: initialMode as AppMode,
})

export function setAppMode(mode: AppMode) {
  appMode$.mode.set(mode)
  if (PreferencesStorage.setMode) {
    PreferencesStorage.setMode(mode)
  }
}
