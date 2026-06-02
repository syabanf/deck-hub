// Lazy-load pdfjs only when actually needed (uploaded PDFs).
let pdfjsPromise

export const loadPdfJs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf')
      const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
      return pdfjs
    })()
  }
  return pdfjsPromise
}

export const renderPdfPageToCanvas = async (pdfDoc, pageNumber, canvas, targetWidth) => {
  const page = await pdfDoc.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = (targetWidth / baseViewport.width) * (window.devicePixelRatio || 1)
  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d', { alpha: false })
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`
  canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`
  await page.render({ canvasContext: ctx, viewport }).promise
}

export const loadPdfDocument = async (data) => {
  const pdfjs = await loadPdfJs()
  return await pdfjs.getDocument({ data }).promise
}

// Read a File into ArrayBuffer for pdfjs and persist as base64 in localStorage.
export const fileToArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })

export const arrayBufferToBase64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export const base64ToArrayBuffer = (b64) => {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
