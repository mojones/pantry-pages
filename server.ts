import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAppApiRoutes } from './src/recipeApi'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const basicAuthUser = process.env.BASIC_AUTH_USER?.trim() ?? ''
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD ?? ''

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function requestBasicAuth(response: express.Response) {
  response.setHeader('WWW-Authenticate', 'Basic realm="Pantry Pages"')
  response.status(401).send('Authentication required.')
}

function parseBasicAuthHeader(headerValue: string | undefined) {
  if (!headerValue?.startsWith('Basic ')) {
    return null
  }

  try {
    const decoded = Buffer.from(headerValue.slice(6), 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')

    if (separatorIndex === -1) {
      return null
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

app.get('/healthz', (_request, response) => {
  response.json({ ok: true })
})

app.use((request, response, next) => {
  if (request.path === '/healthz') {
    next()
    return
  }

  if (!basicAuthUser || !basicAuthPassword) {
    response.status(503).send(
      'Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD before exposing Pantry Pages publicly.',
    )
    return
  }

  const credentials = parseBasicAuthHeader(request.headers.authorization)

  if (
    !credentials ||
    !safeEqual(credentials.username, basicAuthUser) ||
    !safeEqual(credentials.password, basicAuthPassword)
  ) {
    requestBasicAuth(response)
    return
  }

  next()
})

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
