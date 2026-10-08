import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds the demo page (index.html → demo/main.tsx) as a static site, for
// hosting on Vercel. `npm run build` is different: it builds the library that
// other sites install.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-demo' },
})
