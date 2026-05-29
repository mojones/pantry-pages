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
const sessionCookieName = 'pantry_pages_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 30

app.set('trust proxy', 1)

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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || basicAuthPassword
}

function signSessionPayload(payload: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
}

function createSessionCookie() {
  const expiresAt = Date.now() + sessionDurationMs
  const payload = Buffer.from(JSON.stringify({ expiresAt }), 'utf8').toString('base64url')
  const signature = signSessionPayload(payload)

  return `${payload}.${signature}`
}

function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  for (const entry of cookieHeader.split(';')) {
    const separatorIndex = entry.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    cookies.set(entry.slice(0, separatorIndex).trim(), entry.slice(separatorIndex + 1).trim())
  }

  return cookies
}

function hasValidSession(request: express.Request) {
  const cookie = parseCookies(request.headers.cookie).get(sessionCookieName)

  if (!cookie) {
    return false
  }

  const [payload, signature] = cookie.split('.')

  if (!payload || !signature || !safeEqual(signature, signSessionPayload(payload))) {
    return false
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      expiresAt?: unknown
    }

    return typeof session.expiresAt === 'number' && session.expiresAt > Date.now()
  } catch {
    return false
  }
}

function buildCookieOptions(request: express.Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.secure,
    maxAge: sessionDurationMs,
    path: '/',
  }
}

function isSafeReturnPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

function renderLoginPage(returnTo: string, error = '') {
  const escapedReturnTo = escapeHtml(returnTo)
  const errorMarkup = error ? `<p class="error">${escapeHtml(error)}</p>` : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pantry Pages Sign In</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f4ed;
        color: #251d17;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
      }

      main {
        width: min(100%, 360px);
      }

      h1 {
        margin: 0 0 24px;
        font-size: 2rem;
        line-height: 1.1;
      }

      label {
        display: grid;
        gap: 8px;
        margin: 0 0 16px;
        font-weight: 700;
      }

      input {
        box-sizing: border-box;
        width: 100%;
        min-height: 44px;
        border: 1px solid #b9aa9d;
        border-radius: 6px;
        padding: 10px 12px;
        background: #fffaf2;
        color: inherit;
        font: inherit;
      }

      button {
        width: 100%;
        min-height: 44px;
        border: 0;
        border-radius: 6px;
        background: #2f5d50;
        color: white;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }

      .error {
        margin: 0 0 16px;
        color: #9f2d21;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Pantry Pages</h1>
      ${errorMarkup}
      <form method="post" action="/login">
        <input type="hidden" name="returnTo" value="${escapedReturnTo}">
        <label>
          Username
          <input name="username" autocomplete="username" required autofocus>
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`
}

app.get('/healthz', (_request, response) => {
  response.json({ ok: true })
})

app.use(express.urlencoded({ extended: false }))

app.get('/login', (request, response) => {
  const returnTo = isSafeReturnPath(request.query.returnTo) ? request.query.returnTo : '/'
  response.type('html').send(renderLoginPage(returnTo))
})

app.post('/login', (request, response) => {
  if (!basicAuthUser || !basicAuthPassword) {
    response.status(503).send(
      'Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD before exposing Pantry Pages publicly.',
    )
    return
  }

  const username = typeof request.body.username === 'string' ? request.body.username : ''
  const password = typeof request.body.password === 'string' ? request.body.password : ''
  const returnTo = isSafeReturnPath(request.body.returnTo) ? request.body.returnTo : '/'

  if (!safeEqual(username, basicAuthUser) || !safeEqual(password, basicAuthPassword)) {
    response.status(401).type('html').send(renderLoginPage(returnTo, 'Those credentials did not work.'))
    return
  }

  response.cookie(sessionCookieName, createSessionCookie(), buildCookieOptions(request))
  response.redirect(returnTo)
})

app.post('/logout', (_request, response) => {
  response.clearCookie(sessionCookieName, { path: '/' })
  response.redirect('/login')
})

app.use((request, response, next) => {
  if (request.path === '/healthz' || request.path === '/login') {
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
    credentials &&
    safeEqual(credentials.username, basicAuthUser) &&
    safeEqual(credentials.password, basicAuthPassword)
  ) {
    next()
    return
  }

  if (hasValidSession(request)) {
    next()
    return
  }

  if (request.accepts('html')) {
    response.redirect(`/login?returnTo=${encodeURIComponent(request.originalUrl || '/')}`)
    return
  }

  requestBasicAuth(response)
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
