// Talking to an embedded YouTube player.
//
// A YouTube iframe whose URL carries `enablejsapi=1` accepts commands over
// postMessage — no SDK download required. Sending an `listening` event makes
// the player push back periodic `infoDelivery` messages carrying currentTime,
// duration and playerState, which is how we drive our own control bar.
//
// Everything here is best-effort: if a message doesn't land (cross-origin
// hiccup, ad playing, API disabled) YouTube's built-in controls still work.

export const isYouTubeEmbed = (url = '') => /youtube\.com\/embed\//.test(url)

const post = (iframe, message) => {
  try {
    iframe?.contentWindow?.postMessage(JSON.stringify(message), '*')
  } catch {
    /* ignore — the embed's own controls remain usable */
  }
}

export const ytCommand = (iframe, func, args = []) =>
  post(iframe, { event: 'command', func, args })

// Opt in to the player's periodic state broadcasts.
export const ytStartListening = (iframe) =>
  post(iframe, { event: 'listening', id: 1, channel: 'widget' })

export const originHost = (origin) => {
  try {
    return new URL(origin).hostname
  } catch {
    return ''
  }
}

export const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
