// Best-effort conversion of common slide-share URLs into embeddable iframe URLs.

export const toEmbedUrl = (url) => {
  if (!url) return null
  try {
    const u = new URL(url)

    // Google Slides: /presentation/d/{id}/edit → /presentation/d/{id}/embed
    if (u.hostname.includes('docs.google.com') && u.pathname.includes('/presentation/d/')) {
      const id = u.pathname.split('/presentation/d/')[1].split('/')[0]
      return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`
    }

    // SpeakerDeck: speakerdeck.com/{user}/{slug} — no good public embed without ID
    // Fall through to raw iframe (may be blocked); we provide a fallback link below.

    // SlideShare: slideshare.net/{user}/{slug} — embeds require ID; raw iframe rarely works.

    return url
  } catch {
    return url
  }
}


