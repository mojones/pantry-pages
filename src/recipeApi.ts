import type { IncomingMessage, ServerResponse } from 'node:http'
import { importRecipeFromUrl } from './recipeImport'

async function readJsonBody(request: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const payload = Buffer.concat(chunks).toString('utf8').trim()
  return payload ? (JSON.parse(payload) as { url?: string }) : {}
}

type MiddlewareStack = {
  use: (
    route: string,
    handler: (
      request: IncomingMessage,
      response: ServerResponse,
      next: () => void,
    ) => void | Promise<void>,
  ) => void
}

function sendJson(response: ServerResponse, statusCode: number, payload: object) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function registerRecipeImportRoute(middlewares: MiddlewareStack) {
  middlewares.use('/api/import-recipe', async (request, response, next) => {
    if (request.method !== 'POST') {
      next()
      return
    }

    try {
      const { url } = await readJsonBody(request)

      if (!url?.trim()) {
        sendJson(response, 400, { error: 'Paste a recipe URL to import.' })
        return
      }

      const recipe = await importRecipeFromUrl(url.trim())
      sendJson(response, 200, { recipe })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Recipe import failed.'
      sendJson(response, 422, { error: message })
    }
  })
}

export { registerRecipeImportRoute }
