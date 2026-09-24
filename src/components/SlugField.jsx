import { DECK_PATH } from '../lib/share.js'
import { slugProblem, slugify } from '../lib/slug.js'

// The readable name in a deck's share link.
//
// One component for both the add and the edit form, because the rules are
// fiddly enough that two copies would be two sets of rules within a month.
//
// It types the cleaned value straight into the field rather than validating
// after the fact: a form that says "no spaces allowed" is one that makes its
// reader do the computer's job. Typing "Profil WIT 2026!" leaves
// "profil-wit-2026" in the box, so what the person sees is what the link will
// be, before they save and send it to anybody.
export default function SlugField({ value, onChange, title = '', taken = false }) {
  const problem = slugProblem(value)

  // The host this page is on — paparan.reddie.id in production, localhost in
  // development. Read rather than configured: the link that is about to be
  // copied is a link to *here*, whatever here is.
  const host = typeof window === 'undefined' ? '' : window.location.host

  // What the field would hold if it were left empty and filled in from the
  // title. Offered, not applied: a deck may legitimately have no link name,
  // and silently minting a public URL from a title is not the form's call.
  const fromTitle = slugify(title)
  const canSuggest = !value.trim() && fromTitle && !slugProblem(fromTitle)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel>
          Link <span className="text-white/40">optional</span>
        </FieldLabel>
        {canSuggest && (
          <button
            type="button"
            onClick={() => onChange(fromTitle)}
            className="text-[11px] font-semibold text-deck-muted hover:text-white transition-colors shrink-0"
          >
            Use the title
          </button>
        )}
      </div>

      {/* Stacks on a phone.
          Side by side, the host eats most of a 375px row and leaves the input
          a sliver — and it is the input that is being typed in. min-w-0 on the
          input is load-bearing once they do sit in a row: a flex child
          defaults to min-width:auto and refuses to shrink below its content,
          which pushes the whole field past the edge of the modal. */}
      <div className="flex flex-col sm:flex-row sm:items-stretch rounded-lg border border-deck-border bg-deck-card overflow-hidden focus-within:border-white/40 transition-colors">
        <span className="px-3 pt-2 sm:py-2 text-sm text-deck-muted font-mono whitespace-nowrap select-none sm:border-r sm:border-deck-border sm:bg-white/[0.03] flex items-center">
          {host}
          {DECK_PATH}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(slugify(e.target.value))}
          placeholder="company-profile-2026"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 px-3 pb-2 pt-1 sm:py-2 bg-transparent text-sm placeholder:text-white/40 focus:outline-none font-mono"
        />
      </div>

      <p className="text-[11px] leading-snug text-deck-muted">
        {problem ? (
          <span className="text-red-300">{problem}</span>
        ) : taken ? (
          <span className="text-red-300">
            That link already belongs to another deck — try something else.
          </span>
        ) : value ? (
          'Change this later if you like — the old link keeps working.'
        ) : (
          'Without one, the link is a long id. It still works either way.'
        )}
      </p>
    </div>
  )
}

// Matches the label style the rest of the form uses. Local rather than
// imported, so this component can be dropped into either modal.
function FieldLabel({ children }) {
  return (
    <span className="text-xs uppercase tracking-widest font-bold text-deck-muted">{children}</span>
  )
}
