import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { registerAppApiRoutes } from './src/recipeApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'recipe-import-api',
      configureServer(server) {
        registerAppApiRoutes(server.middlewares)
      },
      configurePreviewServer(server) {
        registerAppApiRoutes(server.middlewares)
      },
    },
  ],
})
