import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { importRecipeFromUrl } from './recipeImport'

type PersistedIngredient = {
  item: string
  amount: string
  aisle: string
}

type PersistedRecipe = {
  id: string
  title: string
  author: string
  source: string
  image: string
  section: string
  tags: string[]
  time: string
  servings: string
  summary: string
  ingredients: PersistedIngredient[]
  steps: string[]
  notes: string
}

type PersistedPlannerEntry = {
  recipeId: string
  excludedIngredientKeys: string[]
}

type PersistedAppState = {
  importedRecipes: PersistedRecipe[]
  plannedRecipes: PersistedPlannerEntry[]
  recipeNotes: Record<string, string>
  manualShoppingItems: string[]
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

const defaultPersistedState: PersistedAppState = {
  importedRecipes: [],
  plannedRecipes: [],
  recipeNotes: {},
  manualShoppingItems: [],
}

const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), 'data')
const stateFilePath = path.join(dataDirectory, 'app-state.json')

async function readJsonBody(request: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const payload = Buffer.concat(chunks).toString('utf8').trim()

  if (!payload) {
    return {}
  }

  return JSON.parse(payload) as Record<string, unknown>
}

function sendJson(response: ServerResponse, statusCode: number, payload: object) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function normalizeIngredient(value: unknown): PersistedIngredient | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    item: normalizeString(value.item),
    amount: normalizeString(value.amount),
    aisle: normalizeString(value.aisle, 'Pantry'),
  }
}

function normalizeRecipe(value: unknown): PersistedRecipe | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizeString(value.id).trim()
  const title = normalizeString(value.title).trim()

  if (!id || !title) {
    return null
  }

  return {
    id,
    title,
    author: normalizeString(value.author, 'Unknown source'),
    source: normalizeString(value.source, 'Imported recipe'),
    image: normalizeString(value.image),
    section: normalizeString(value.section, 'Imported'),
    tags: normalizeStringArray(value.tags),
    time: normalizeString(value.time, 'Time not set'),
    servings: normalizeString(value.servings, 'Unspecified yield'),
    summary: normalizeString(value.summary, 'Imported from recipe URL.'),
    ingredients: Array.isArray(value.ingredients)
      ? value.ingredients
          .map(normalizeIngredient)
          .filter((ingredient): ingredient is PersistedIngredient => Boolean(ingredient))
      : [],
    steps: normalizeStringArray(value.steps),
    notes: normalizeString(value.notes),
  }
}

function normalizePlannerEntry(value: unknown): PersistedPlannerEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const recipeId = normalizeString(value.recipeId).trim()

  if (!recipeId) {
    return null
  }

  return {
    recipeId,
    excludedIngredientKeys: normalizeStringArray(value.excludedIngredientKeys),
  }
}

function normalizeRecipeNotes(value: unknown) {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, note]) => [key, note]),
  )
}

function normalizePersistedState(value: unknown): PersistedAppState {
  if (!isRecord(value)) {
    return defaultPersistedState
  }

  return {
    importedRecipes: Array.isArray(value.importedRecipes)
      ? value.importedRecipes
          .map(normalizeRecipe)
          .filter((recipe): recipe is PersistedRecipe => Boolean(recipe))
      : [],
    plannedRecipes: Array.isArray(value.plannedRecipes)
      ? value.plannedRecipes
          .map(normalizePlannerEntry)
          .filter((entry): entry is PersistedPlannerEntry => Boolean(entry))
      : [],
    recipeNotes: normalizeRecipeNotes(value.recipeNotes),
    manualShoppingItems: normalizeStringArray(value.manualShoppingItems).map((item) => item.trim()).filter(Boolean),
  }
}

async function ensureDataDirectory() {
  await mkdir(dataDirectory, { recursive: true })
}

async function readPersistedState() {
  try {
    const contents = await readFile(stateFilePath, 'utf8')
    return normalizePersistedState(JSON.parse(contents) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultPersistedState
    }

    throw error
  }
}

async function writePersistedState(state: PersistedAppState) {
  await ensureDataDirectory()

  const tempFilePath = `${stateFilePath}.tmp`
  await writeFile(tempFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tempFilePath, stateFilePath)
}

function registerAppApiRoutes(middlewares: MiddlewareStack) {
  middlewares.use('/api/import-recipe', async (request, response, next) => {
    if (request.method !== 'POST') {
      next()
      return
    }

    try {
      const { url } = (await readJsonBody(request)) as { url?: string }

      if (!url?.trim()) {
        sendJson(response, 400, { error: 'Paste a recipe URL to import.' })
        return
      }

      const recipe = await importRecipeFromUrl(url.trim())
      sendJson(response, 200, { recipe })
    } catch (error) {
      const message =
        error instanceof SyntaxError
          ? 'Request body must be valid JSON.'
          : error instanceof Error
            ? error.message
            : 'Recipe import failed.'

      sendJson(response, 422, { error: message })
    }
  })

  middlewares.use('/api/state', async (request, response, next) => {
    if (request.method === 'GET') {
      try {
        const state = await readPersistedState()
        sendJson(response, 200, state)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load saved app state.'
        sendJson(response, 500, { error: message })
      }

      return
    }

    if (request.method === 'PUT') {
      try {
        const body = await readJsonBody(request)
        const state = normalizePersistedState(body)
        await writePersistedState(state)
        sendJson(response, 200, { ok: true })
      } catch (error) {
        const message =
          error instanceof SyntaxError
            ? 'Request body must be valid JSON.'
            : error instanceof Error
              ? error.message
              : 'Unable to save app state.'

        sendJson(response, 500, { error: message })
      }

      return
    }

    next()
  })
}

export { registerAppApiRoutes }
