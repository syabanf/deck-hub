import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  define: {
    // Replaced literally at build time, so the demo sign-in block becomes
    // `false && …` and the minifier drops it along with the passwords it
    // carries.
    //
    // `import.meta.env.VITE_SHOW_DEMO_ACCOUNTS` cannot do this job: Vite only
    // substitutes VITE_ variables that are actually set, so with the flag
    // absent the comparison stays dynamic, the branch stays reachable, and
    // admin1234 ships in the bundle — which is what the first attempt at this
    // gate did.
    __SHOW_DEMO_ACCOUNTS__: JSON.stringify(
      mode !== 'production' || process.env.VITE_SHOW_DEMO_ACCOUNTS === 'true',
    ),
  },
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf', 'pdfjs-dist/build/pdf.worker.min.mjs'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // pdf.js ships its worker as .mjs, and Vite keeps that extension for a
        // `?url` import. nginx's mime.types has no entry for .mjs, so it went
        // out as application/octet-stream — which browsers refuse for a module
        // script. pdf.js then fell back to a "fake worker" and reading a PDF
        // failed, so uploading one worked locally and not on the server.
        //
        // The server config is fixed too, but emitting .js means the app does
        // not depend on every deployment target having that mapping. One less
        // thing that can differ between here and production.
        assetFileNames: (info) => {
          const name = info.name || ''
          if (name.endsWith('.mjs')) return 'assets/[name]-[hash].js'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
}))
