import { PreferencesStorage } from '@/lib/storage/commonStorage/storage.preferences'
import { observable } from '@legendapp/state'

export type AppMode = 'public' | 'personal'

const initialMode: AppMode = (PreferencesStorage.getMode?.() as AppMode | null) ?? 'public'

export const appMode$ = observable({
  mode: initialMode as AppMode,
})

export function setAppMode(mode: AppMode) {
  appMode$.mode.set(mode)
  if (PreferencesStorage.setMode) {
    PreferencesStorage.setMode(mode)
  }
}
