// Guest favorites live in localStorage; signed-in users' favorites live in the
// backend (see api.listFavorites/addFavorite/removeFavorite). App picks which
// path to use based on whether there's an auth token.

const KEY = 'wit.favorites.v1'

const safeParse = (raw) => {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export const loadLocalFavorites = () => safeParse(localStorage.getItem(KEY))

export const saveLocalFavorites = (ids) =>
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]))
