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

    // Canva: /design/{id}/{token}/view → the same path with ?embed
    //
    // Without ?embed, Canva sends X-Frame-Options and the browser renders its
    // own "can't open this page" instead of the deck — which is what a pasted
    // share link does, because that is the form the Share button hands out.
    //
    // The token segment has to survive. It is the part that authorises a view
    // link, so /design/{id}/view?embed is refused even for a public design.
    // Everything after the path is dropped: a share link carries a trail of
    // utm_ parameters that mean nothing here.
    if (u.hostname.includes('canva.com')) {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] === 'design' && parts[1]) {
        const id = parts[1]
        const token = parts[2] && parts[2] !== 'view' && parts[2] !== 'edit' ? parts[2] : null
        const base = token
          ? `https://www.canva.com/design/${id}/${token}/view`
          : `https://www.canva.com/design/${id}/view`
        return `${base}?embed`
      }
    }

    // SpeakerDeck: speakerdeck.com/{user}/{slug} — no good public embed without ID
    // Fall through to raw iframe (may be blocked); we provide a fallback link below.

    // SlideShare: slideshare.net/{user}/{slug} — embeds require ID; raw iframe rarely works.

    return url
  } catch {
    return url
  }
}


