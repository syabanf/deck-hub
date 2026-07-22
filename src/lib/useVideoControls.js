import { useCallback, useEffect, useRef, useState } from 'react'
import { isYouTubeEmbed, originHost, ytCommand, ytStartListening } from './videoControl.js'

// Unified playback control for both kinds of video deck:
//   - uploaded files render a real <video>, which we drive directly
//   - YouTube embeds are cross-origin, so they're driven over postMessage
//
// Anything else (Vimeo, Loom, Google Slides) reports `supported: false` and the
// player falls back to the provider's own inline controls.
export function useVideoControls(mediaRef, source) {
  const isVideo = source?.type === 'video'
  const isNative = isVideo && source?.kind === 'native'
  const isYouTube = isVideo && isYouTubeEmbed(source?.value || '')

  const [isPlaying, setIsPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  // Mirrors `current` without re-subscribing effects on every tick, so a
  // relative seek always works off the latest position.
  const currentRef = useRef(0)

  // ---- uploaded <video> ----
  useEffect(() => {
    if (!isNative) return
    const el = mediaRef.current
    if (!el) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTime = () => {
      currentRef.current = el.currentTime
      setCurrent(el.currentTime)
    }
    const onMeta = () => setDuration(el.duration || 0)

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
    }
  }, [isNative, mediaRef, source?.value])

  // ---- YouTube embed ----
  useEffect(() => {
    if (!isYouTube) return
    const iframe = mediaRef.current
    if (!iframe) return

    const onMessage = (event) => {
      if (!/(^|\.)youtube(-nocookie)?\.com$/.test(originHost(event.origin))) return
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      const info = data?.info
      if (!info) return
      if (typeof info.currentTime === 'number') {
        currentRef.current = info.currentTime
        setCurrent(info.currentTime)
      }
      if (typeof info.duration === 'number' && info.duration > 0) setDuration(info.duration)
      // 1 = playing, per the IFrame API's state enum.
      if (typeof info.playerState === 'number') setIsPlaying(info.playerState === 1)
    }

    window.addEventListener('message', onMessage)
    // The iframe may not be ready on first paint, so retry the handshake
    // briefly rather than firing once and hoping.
    const handshake = setInterval(() => ytStartListening(iframe), 750)
    const stopRetrying = setTimeout(() => clearInterval(handshake), 6000)

    return () => {
      window.removeEventListener('message', onMessage)
      clearInterval(handshake)
      clearTimeout(stopRetrying)
    }
  }, [isYouTube, mediaRef, source?.value])

  // Reset when the deck changes.
  useEffect(() => {
    setIsPlaying(false)
    setCurrent(0)
    setDuration(0)
    currentRef.current = 0
  }, [source?.value])

  const togglePlay = useCallback(() => {
    if (isNative) {
      const el = mediaRef.current
      if (!el) return
      if (el.paused) el.play().catch(() => {})
      else el.pause()
      return
    }
    if (isYouTube) {
      ytCommand(mediaRef.current, isPlaying ? 'pauseVideo' : 'playVideo')
      // Optimistic; the next infoDelivery corrects us if the command missed.
      setIsPlaying((p) => !p)
    }
  }, [isNative, isYouTube, isPlaying, mediaRef])

  const seekBy = useCallback(
    (delta) => {
      if (isNative) {
        const el = mediaRef.current
        if (!el) return
        const max = Number.isFinite(el.duration) ? el.duration : Infinity
        el.currentTime = Math.max(0, Math.min(max, el.currentTime + delta))
        return
      }
      if (isYouTube) {
        const target = Math.max(0, currentRef.current + delta)
        ytCommand(mediaRef.current, 'seekTo', [target, true])
        currentRef.current = target
        setCurrent(target)
      }
    },
    [isNative, isYouTube, mediaRef],
  )

  return {
    supported: isNative || isYouTube,
    isPlaying,
    current,
    duration,
    togglePlay,
    seekBy,
  }
}
