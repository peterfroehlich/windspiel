import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project pages are served from /<repo>/ — the deploy workflow
// sets VITE_BASE accordingly; local dev/build defaults to '/'.
export default defineConfig(() => ({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173 },
}))
