import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { CATEGORIES, INDUSTRIES } from '../data/decks.js'
import { api } from './api.js'

// The browse taxonomy: categories, industries and source types.
//
// These used to be imported straight from src/data/decks.js by seven
// components, which is why they were unchangeable without a deploy. They now
// come from /taxonomy, and the constants stay on as the first paint: the home
// page renders a row per category, and waiting for a round trip before drawing
// anything would trade a real deploy problem for a visible blank screen.
//
// Terms are exposed with `id` rather than `slug`, matching the shape the
// existing components already read.

const SOURCE_TYPE_FALLBACK = [
  { id: 'pdf', title: 'PDF document' },
  { id: 'gslides', title: 'Google Slides' },
  { id: 'url', title: 'Link' },
  { id: 'video', title: 'Video' },
  { id: 'embed', title: 'Embed / iframe' },
]

const TaxonomyContext = createContext({
  categories: CATEGORIES,
  industries: INDUSTRIES,
  sourceTypes: SOURCE_TYPE_FALLBACK,
  refresh: () => {},
})

const toTerm = (t) => ({
  id: t.slug,
  title: t.title,
  accent: t.accent || undefined,
  secondary: t.secondary || undefined,
})

// A fetch that changes nothing must not change the array's identity.
//
// App.jsx fetches one row per category, so `categories` is in the dependencies
// of that effect. Handing back an equal-but-new array on every refresh made a
// single edit reload the whole catalog and remount the screen the edit was made
// on — the settings tab jumped back to Users mid-save. Comparing content keeps
// the same reference when the content is the same.
const signature = (list) =>
  list.map((t) => `${t.id}\u0001${t.title}\u0001${t.accent || ''}\u0001${t.secondary || ''}`).join('\u0000')

const applyIfChanged = (setter) => (next) =>
  setter((prev) => (signature(prev) === signature(next) ? prev : next))

export function TaxonomyProvider({ children }) {
  const [categories, setCategories] = useState(CATEGORIES)
  const [industries, setIndustries] = useState(INDUSTRIES)
  const [sourceTypes, setSourceTypes] = useState(SOURCE_TYPE_FALLBACK)

  const applyCategories = useMemo(() => applyIfChanged(setCategories), [])
  const applyIndustries = useMemo(() => applyIfChanged(setIndustries), [])
  const applySourceTypes = useMemo(() => applyIfChanged(setSourceTypes), [])

  const refresh = useCallback(async () => {
    // activeOnly: browse screens must not offer a retired term. The admin
    // screen fetches its own unfiltered copy.
    const opts = { activeOnly: true }
    const [cats, inds, srcs] = await Promise.allSettled([
      api.listTerms('categories', opts),
      api.listTerms('industries', opts),
      api.listTerms('source-types', opts),
    ])
    // Each list is applied on its own. One failing request should not roll the
    // other two back to the compiled-in defaults.
    if (cats.status === 'fulfilled' && cats.value?.length) applyCategories(cats.value.map(toTerm))
    if (inds.status === 'fulfilled' && inds.value?.length) applyIndustries(inds.value.map(toTerm))
    if (srcs.status === 'fulfilled' && srcs.value?.length) applySourceTypes(srcs.value.map(toTerm))
  }, [applyCategories, applyIndustries, applySourceTypes])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ categories, industries, sourceTypes, refresh }),
    [categories, industries, sourceTypes, refresh],
  )
  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>
}

export function useTaxonomy() {
  return useContext(TaxonomyContext)
}
