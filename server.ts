import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAppApiRoutes } from './src/recipeApi'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

registerAppApiRoutes({
  use(route, handler) {
    app.use(route, handler)
  },
})

app.use('/source_images', express.static(path.join(__dirname, 'source_images')))
app.use(express.static(path.join(__dirname, 'dist'), { index: false }))

app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) {
    next()
    return
  }

  response.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const port = Number(process.env.PORT) || 3000

app.listen(port, '0.0.0.0', () => {
  console.log(`Pantry Pages listening on http://0.0.0.0:${port}`)
})
