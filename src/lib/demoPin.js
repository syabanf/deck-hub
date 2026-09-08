// The Demo Center PIN, kept for the life of the tab and no longer.
//
// sessionStorage rather than localStorage: a gate that survives closing the
// browser stops meaning very much. It is cleared on sign-out too — the PIN
// belongs to the person who typed it, not to the machine, and leaving it
// behind let the next person to sign in walk straight past it.
const KEY = 'wit.demoPin'

export const loadDemoPin = () => {
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export const saveDemoPin = (pin) => {
  try {
    sessionStorage.setItem(KEY, pin)
  } catch {
    // Private browsing refuses storage. The PIN then lasts the page rather
    // than the tab, which is inconvenient but not wrong.
  }
}

export const clearDemoPin = () => {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing stored, nothing to clear */
  }
}
