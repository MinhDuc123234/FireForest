import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // three.js in its own chunk (loaded only with the home intro), so the intro's own code stays measurable
        advancedChunks: { groups: [{ name: 'three', test: /node_modules[\/]three[\/]/ }] },
      },
    },
  },
})
