import Cover from './Cover.jsx'
import DeckFilters, { useDeckFilters } from './DeckFilters.jsx'
import { PlayIcon, ChevronDown, TrashIcon } from '../lib/icons.jsx'

const HEADERS = {
  'company-profile': {
    title: 'Company Profiles',
    description: 'Full corporate decks from Apple, Tesla, Stripe, OpenAI, and more.',
    accent: '#7f00ff',
  },
  iconic: {
    title: 'Iconic Pitch Decks',
    description: 'The legendary decks that raised famous rounds and shaped Silicon Valley.',
    accent: '#ff5f6d',
  },
  design: {
    title: 'Design & Brand',
    description: 'Methodology, systems, and visual thinking from the field\'s best.',
    accent: '#7f00ff',
  },
  engineering: {
    title: 'Engineering & AI',
    description: 'Foundational papers and architectural classics — including the Transformer.',
    accent: '#00c6fb',
  },
  strategy: {
    title: 'Startup Strategy',
    description: 'How to build, scale, and defend a company.',
    accent: '#f7971e',
  },
  keynotes: {
    title: 'Talks & Keynotes',
    description: 'Inspiration and frameworks from the masters.',
    accent: '#cb2d3e',
  },
  mine: {
    title: 'My Library',
    description: 'Decks uploaded or linked by the team, served by the WIT API.',
    accent: '#11998e',
  },
}

function GridCard({ deck, onPlay, onDetails, onRemove, onCategoryClick }) {
  return (
    <div
      className="group relative cursor-pointer"
      onClick={() => onDetails(deck)}
    >
      <div className="aspect-deck relative rounded-md overflow-hidden ring-1 ring-deck-border bg-deck-card shadow-lg card-tilt group-hover:ring-white/20">
        <Cover deck={deck} sizeClass="text-sm" minimal onCategoryClick={onCategoryClick} />

        {/* Hover action cluster over a scrim — matches the home-row cards. */}
        <div className="absolute inset-x-0 bottom-0 p-3 pt-10 flex items-center gap-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay(deck)
            }}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white text-black hover:bg-white/90 hover:scale-110 transition-[transform,background-color] duration-200 ease-out shadow-lg"
            title="Open deck"
          >
            <PlayIcon size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDetails(deck)
            }}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-black/40 hover:border-white border border-white/40 backdrop-blur hover:scale-110 transition-[transform,background-color,border-color] duration-200 ease-out"
            title="More info"
          >
            <ChevronDown size={15} />
          </button>
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(deck)
              }}
              className="ml-auto flex items-center justify-center w-8 h-8 rounded-full bg-black/40 hover:bg-red-600/80 border border-white/40 backdrop-blur hover:scale-110 transition-[transform,background-color,border-color] duration-200 ease-out"
              title="Remove"
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Title block under the card */}
      <div className="mt-2 px-0.5">
        <div className="text-sm font-bold leading-snug line-clamp-2">{deck.title}</div>
        {deck.subtitle && (
          <div className="text-xs text-deck-muted mt-0.5 line-clamp-1">{deck.subtitle}</div>
        )}
        <div className="text-xs text-deck-muted mt-1 flex items-center gap-1.5 truncate">
          <span className="truncate">{deck.author}</span>
          <span>·</span>
          <span className="whitespace-nowrap">{deck.slides?.length || deck.slidesCount || '—'} slides</span>
        </div>
      </div>
    </div>
  )
}

export default function CategoryView({
  categoryId,
  decks,
  onPlay,
  onDetails,
  onRemove,
  onAddClick,
  onCategoryClick,
  canEdit = false,
}) {
  const meta = HEADERS[categoryId] || { title: 'Decks', description: '' }
  const isEmpty = decks.length === 0
  const { filtered, controls } = useDeckFilters(decks)

  return (
    <div className="px-6 md:px-12 pt-32 lg:pt-28 pb-16 min-h-screen">
      <div className="relative mb-8 pb-6 border-b border-deck-border">
        <div
          className="absolute -top-2 left-0 w-16 h-1 rounded-full"
          style={{ background: meta.accent }}
        />
        <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
          Category
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">{meta.title}</h1>
        <p className="text-deck-muted mt-2 max-w-2xl">{meta.description}</p>
      </div>

      {isEmpty ? (
        <EmptyState categoryId={categoryId} onAddClick={onAddClick} canEdit={canEdit} />
      ) : (
        <>
        <DeckFilters {...controls} />
        <div
          key={`${controls.industry}-${controls.year}-${controls.source}-${controls.sort}`}
          className="content-in grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
        >
          {filtered.map((deck) => (
            <GridCard
              key={deck.id}
              deck={deck}
              onPlay={onPlay}
              onDetails={onDetails}
              onRemove={onRemove}
              onCategoryClick={onCategoryClick}
            />
          ))}
        </div>
        </>
      )}
    </div>
  )
}

function EmptyState({ categoryId, onAddClick, canEdit }) {
  if (categoryId === 'mine') {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-deck-card flex items-center justify-center text-white/60 text-2xl font-black">
          +
        </div>
        <h3 className="text-xl font-bold mb-2">Nothing in My Library yet</h3>
        <p className="text-deck-muted text-sm mb-6">
          {canEdit
            ? 'Upload a PDF or paste a link to a hosted presentation. It joins the shared catalog under “My Library”.'
            : 'Decks you add appear here. Ask an editor or admin to contribute decks to the catalog.'}
        </p>
        {canEdit && (
          <button
            onClick={onAddClick}
            className="px-5 py-2.5 rounded bg-deck-accent hover:bg-deck-accentDim font-semibold text-sm"
          >
            Add your first deck
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="text-center py-20 text-deck-muted">
      No decks here yet.
    </div>
  )
}
