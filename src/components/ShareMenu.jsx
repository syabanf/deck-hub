import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import qrcode from 'qrcode-generator'

import { absoluteUrl } from '../lib/api.js'
import {
  copyToClipboard,
  deckUrl,
  downloadFilename,
  downloadUrl,
  downloadable,
  mailtoUrl,
  whatsappUrl,
} from '../lib/share.js'

// QR as an SVG path rather than a canvas: it scales to whatever size the
// layout gives it, prints sharply, and needs no ref or draw step.
function QrCode({ value, size = 168 }) {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const count = qr.getModuleCount()
  // One rect per dark module. A path would be denser but harder to read, and
  // at this module count the difference is a few hundred bytes.
  const cells = []
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`)
    }
  }
  return (
    <svg
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      className="rounded-lg bg-white p-2"
      role="img"
      aria-label="QR code for this deck"
    >
      <path d={cells.join('')} fill="#000" />
    </svg>
  )
}

const MENU_WIDTH = 288 // w-72

export default function ShareMenu({ deck, onNotify }) {
  const [open, setOpen] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: MENU_WIDTH })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  // The menu is rendered into document.body rather than beside the button.
  // Both the modal panel and its hero region are `overflow-hidden`, so a
  // dropdown positioned normally is clipped at the edge of the artwork — all
  // that showed was its top border.
  const place = useCallback(() => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 12
    const height = menuRef.current?.offsetHeight || 260

    // Narrower than the menu is a real case on a phone, so the width gives way
    // before the position does.
    const width = Math.min(MENU_WIDTH, window.innerWidth - margin * 2)

    // Flip up when there is no room below, and pull back inside the viewport
    // rather than opening off the right edge.
    const below = r.bottom + margin + height <= window.innerHeight
    const top = below ? r.bottom + 10 : Math.max(margin, r.top - 10 - height)

    // The upper bound has to be clamped too. Written as a bare
    // `innerWidth - width - margin` it goes negative on a narrow window, and
    // Math.min then picked *that* — which put the menu 300px off the left of
    // the screen.
    const maxLeft = Math.max(margin, window.innerWidth - width - margin)
    const left = Math.min(Math.max(margin, r.left), maxLeft)
    setPos({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, showQr, place])

  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpen(false)
      setShowQr(false)
    }
    const onDown = (e) => {
      if (buttonRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      close()
    }
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // The modal scrolls behind a fixed menu, so follow it rather than letting
    // the two drift apart. Capture phase: the scroll happens on the panel, not
    // on the window.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  if (!deck) return null
  const url = deckUrl(deck)
  const file = downloadable(deck)
  const source = deck.source?.raw ?? deck.source?.value ?? ''

  const copy = async () => {
    try {
      await copyToClipboard(url)
      onNotify?.({ type: 'success', title: 'Link copied', message: 'Paste it wherever you like.' })
    } catch {
      onNotify?.({
        type: 'error',
        title: "Couldn't copy",
        message: 'Your browser blocked clipboard access. Select the link and copy it by hand.',
      })
    }
    setOpen(false)
  }

  const item = 'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-white/80 hover:text-white hover:bg-white/5 transition-colors'

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-white/25 hover:border-white/60 text-white/80 hover:text-white transition-colors"
        aria-label="Share this deck"
        aria-expanded={open}
        title="Share"
      >
        {/* Three nodes and two links — the share glyph, drawn inline so this
            component carries no icon dependency. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed rounded-xl bg-deck-card border border-deck-border shadow-2xl py-1.5 z-[70]"
        >
          <button onClick={copy} className={item}>
            <span className="w-5 text-center">⧉</span>
            Copy link
          </button>

          <a
            href={whatsappUrl(deck)}
            target="_blank"
            rel="noreferrer noopener"
            className={item}
            onClick={() => setOpen(false)}
          >
            <span className="w-5 text-center text-[#25d366]">✆</span>
            Share on WhatsApp
          </a>

          <a href={mailtoUrl(deck)} className={item} onClick={() => setOpen(false)}>
            <span className="w-5 text-center">✉</span>
            Send by email
          </a>

          {file ? (
            <a
              href={downloadUrl(deck, absoluteUrl)}
              download={downloadFilename(deck)}
              className={item}
              onClick={() => setOpen(false)}
              title={downloadFilename(deck)}
            >
              <span className="w-5 text-center">⇩</span>
              Download the file
            </a>
          ) : (
            source && (
              <a
                href={source}
                target="_blank"
                rel="noreferrer noopener"
                className={item}
                onClick={() => setOpen(false)}
              >
                <span className="w-5 text-center">↗</span>
                {/* No file to hand over: this deck is a link to a page
                    somebody else hosts. */}
                Open the original
              </a>
            )
          )}

          <button onClick={() => setShowQr((v) => !v)} className={item}>
            <span className="w-5 text-center">▦</span>
            {showQr ? 'Hide QR code' : 'Show QR code'}
          </button>

          {showQr && (
            <div className="px-4 pb-3 pt-1 flex flex-col items-center gap-2">
              <QrCode value={url} />
              <p className="text-[11px] text-deck-muted text-center leading-snug">
                Point a phone at this to open the deck.
              </p>
            </div>
          )}

          <p className="px-4 pt-2 pb-1 text-[11px] text-deck-muted border-t border-deck-border/60 mt-1 leading-snug">
            Anyone with the link can open this deck without signing in.
          </p>
        </div>,
        document.body,
      )}
    </>
  )
}
