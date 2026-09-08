import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api } from './api.js'

// Settings an admin can change without a deploy.
//
// Defaults live here as well as in the database, so the first paint is right
// and the app still works if the request fails. The server answers with every
// known key filled in, which is why nothing here has to merge partial replies.
const DEFAULTS = {
  nav_max_categories: '5',
}

const SettingsContext = createContext({
  settings: DEFAULTS,
  refresh: () => {},
  save: async () => {},
})

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)

  const refresh = useCallback(async () => {
    try {
      const next = await api.getSettings()
      if (next && typeof next === 'object') setSettings({ ...DEFAULTS, ...next })
    } catch {
      // The compiled-in defaults are already in place, and a header that
      // shows five categories instead of six is not worth a error toast.
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const save = useCallback(async (patch) => {
    const next = await api.updateSettings(patch)
    setSettings({ ...DEFAULTS, ...next })
    return next
  }, [])

  const value = useMemo(() => ({ settings, refresh, save }), [settings, refresh, save])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}

// Reading a number out of a text setting, with the default when it is missing
// or nonsense. Values are stored as text so a setting can change its type
// later without a migration; the parsing has to live somewhere, and it lives
// with the reader that knows what the value means.
export const settingNumber = (settings, key, fallback) => {
  const n = parseInt(settings?.[key], 10)
  return Number.isFinite(n) ? n : fallback
}
