import { createContext, useContext } from 'react'

// Favorites are consumed deep in the card tree (every Card / GridCard), so a
// context avoids threading favSet + toggle through ~10 Row instances.
const FavoritesContext = createContext({
  favSet: new Set(),
  toggle: () => {},
})

export const FavoritesProvider = FavoritesContext.Provider

export function useFavorites() {
  return useContext(FavoritesContext)
}
