import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { registerRecipeImportRoute } from './src/recipeApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'recipe-import-api',
      configureServer(server) {
        registerRecipeImportRoute(server.middlewares)
      },
      configurePreviewServer(server) {
        registerRecipeImportRoute(server.middlewares)
      },
    },
  ],
})
