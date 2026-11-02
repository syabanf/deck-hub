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

// pdf.js refuses to start a render on a canvas another render still holds, so
// paging faster than a page draws failed with "Cannot use the same canvas
// during multiple render() operations". Aborting `signal` cancels the render in
// flight, which frees the canvas at once; the cancelled call resolves quietly
// rather than surfacing as an error.
export const renderPdfPageToCanvas = async (pdfDoc, pageNumber, canvas, targetWidth, signal) => {
  const page = await pdfDoc.getPage(pageNumber)
  if (signal?.aborted) return
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = (targetWidth / baseViewport.width) * (window.devicePixelRatio || 1)
  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d', { alpha: false })
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`
  canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`
  const task = page.render({ canvasContext: ctx, viewport })
  const cancel = () => task.cancel()
  signal?.addEventListener('abort', cancel)
  try {
    await task.promise
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') throw e
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

export const loadPdfDocument = async (data) => {
  const pdfjs = await loadPdfJs()
  return await pdfjs.getDocument({ data }).promise
}

// Load a PDF served over HTTP (uploaded files live at /uploads/<name>).
export const loadPdfDocumentFromUrl = async (url) => {
  const pdfjs = await loadPdfJs()
  return await pdfjs.getDocument({ url }).promise
}

// Read a File into ArrayBuffer for pdfjs and persist as base64 in localStorage.
export const fileToArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })



export const base64ToArrayBuffer = (b64) => {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
