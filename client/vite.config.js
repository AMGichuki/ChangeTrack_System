import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During development, any call to /api is passed to our Express server.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
