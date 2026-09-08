// Favorites live in the backend (see api.listFavorites/addFavorite/
// removeFavorite). The copy kept here is what renders before the server has
// answered, and what a failed write reverts to — not a separate store.

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
