// A quiet, persistent strip — not a toast. Being offline isn't an event that
// happened once, it's a state you stay in, so it shouldn't time out and vanish.
//
// Sits under the navbar (taller below lg, where the category chip strip lives).
export default function OfflineBanner({ online }) {
  if (online) return null

  return (
    <div
      role="status"
      className="fixed top-28 lg:top-16 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-amber-500/95 text-amber-950 px-4 py-2 shadow-xl backdrop-blur animate-toast-in">
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          <span className="absolute inline-flex w-full h-full rounded-full bg-amber-900/50 animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-900" />
        </span>
        <div className="text-xs leading-tight">
          <span className="font-bold">You’re offline.</span>{' '}
          <span className="text-amber-900">
            Decks you’ve already opened still work — new ones will load once you reconnect.
          </span>
        </div>
      </div>
    </div>
  )
}
