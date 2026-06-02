// Detect and normalize common video URLs into embeddable form.

export const isVideoFile = (file) => {
  if (!file) return false
  if (file.type?.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v)$/i.test(file.name || '')
}

export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}


export const detectVideo = (url) => {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()

    // YouTube — https://www.youtube.com/watch?v=ID or https://youtu.be/ID
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let id
      if (host.includes('youtu.be')) {
        id = u.pathname.slice(1)
      } else if (u.pathname.includes('/embed/')) {
        id = u.pathname.split('/embed/')[1].split(/[/?]/)[0]
      } else {
        id = u.searchParams.get('v')
      }
      if (!id) return null
      return {
        kind: 'iframe',
        platform: 'YouTube',
        color: '#ff0000',
        icon: 'Y',
        embedUrl: `https://www.youtube.com/embed/${id}?rel=0`,
        thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      }
    }

    // Vimeo — https://vimeo.com/ID
    if (host.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (!id || !/^\d+$/.test(id)) return null
      return {
        kind: 'iframe',
        platform: 'Vimeo',
        color: '#1ab7ea',
        icon: 'V',
        embedUrl: `https://player.vimeo.com/video/${id}`,
        thumbnail: null,
      }
    }

    // Loom — https://www.loom.com/share/ID
    if (host.includes('loom.com')) {
      const id = u.pathname.split('/share/')[1]?.split(/[/?]/)[0]
      if (!id) return null
      return {
        kind: 'iframe',
        platform: 'Loom',
        color: '#625df5',
        icon: 'L',
        embedUrl: `https://www.loom.com/embed/${id}`,
        thumbnail: null,
      }
    }

    // Direct video file (mp4, webm, mov)
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname)) {
      return {
        kind: 'native',
        platform: 'Video file',
        color: '#e50914',
        icon: 'V',
        embedUrl: url,
        thumbnail: null,
      }
    }

    return null
  } catch {
    return null
  }
}
