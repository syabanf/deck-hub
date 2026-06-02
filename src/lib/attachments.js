// Universal attachment detector — handles videos, slides, PDFs, Canva, etc.
import { detectVideo } from './video.js'

// Build an attachment from a URL — detects platform and chooses the right
// `type` so the player and details modal know how to render it.
export const detectAttachment = (url) => {
  if (!url) return null
  const video = detectVideo(url)
  if (video) {
    return {
      type: 'video',
      value: video.embedUrl,
      platform: video.platform,
      color: video.color,
      icon: video.icon,
      kind: video.kind,
      thumbnail: video.thumbnail,
    }
  }
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()

    // Canva — https://www.canva.com/design/{id}/view (or /edit)
    if (host.includes('canva.com') && u.pathname.includes('/design/')) {
      const id = u.pathname.split('/design/')[1]?.split('/')[0]
      if (id) {
        return {
          type: 'url',
          value: `https://www.canva.com/design/${id}/view?embed`,
          platform: 'Canva',
          color: '#00c4cc',
          icon: 'C',
        }
      }
    }

    // Google Slides
    if (host.includes('docs.google.com') && u.pathname.includes('/presentation/d/')) {
      const id = u.pathname.split('/presentation/d/')[1].split('/')[0]
      return {
        type: 'url',
        value: `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`,
        platform: 'Google Slides',
        color: '#fbbc04',
        icon: 'G',
      }
    }

    // Figma file
    if (host.includes('figma.com')) {
      return {
        type: 'url',
        value: `https://www.figma.com/embed?embed_host=deckflix&url=${encodeURIComponent(url)}`,
        platform: 'Figma',
        color: '#a259ff',
        icon: 'F',
      }
    }

    // Direct PDF link
    if (u.pathname.toLowerCase().endsWith('.pdf')) {
      return {
        type: 'url',
        value: url,
        platform: 'PDF link',
        color: '#60a5fa',
        icon: 'P',
      }
    }

    // SpeakerDeck / SlideShare — let through but mark embed-unfriendly
    if (host.includes('speakerdeck.com')) {
      return { type: 'url', value: url, platform: 'SpeakerDeck', color: '#009287', icon: 'S' }
    }
    if (host.includes('slideshare.net')) {
      return { type: 'url', value: url, platform: 'SlideShare', color: '#117db8', icon: 'S' }
    }

    // Generic link
    return { type: 'url', value: url, platform: host, color: '#8a8a99', icon: '↗' }
  } catch {
    return null
  }
}
