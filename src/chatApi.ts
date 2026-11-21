import { createHash, timingSafeEqual } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { buildImportedRecipe, parseRecipeLibrary, type Recipe } from './recipeCatalog'
import { readPersistedState, updatePersistedState } from './recipeApi'
import { buildShoppingList, ingredientKey, resolvePlannedRecipes, type PlannedRecipe } from './shoppingList'

type SavedState = Awaited<ReturnType<typeof readPersistedState>>

function withUpdatedPlan(state: SavedState, recipes: Recipe[], plannedRecipes: PlannedRecipe[]) {
  const { groceryByAisle } = buildShoppingList(resolvePlannedRecipes(recipes, plannedRecipes), state)
  const valid = new Set(Object.values(groceryByAisle).flat().map(({ key }) => key))
  return {
    ...state,
    plannedRecipes,
    neededShoppingItems: state.neededShoppingItems.filter((key) => valid.has(key)),
    completedShoppingItems: state.completedShoppingItems.filter((key) => valid.has(key)),
    removedShoppingItems: state.removedShoppingItems.filter((key) => valid.has(key)),
  }
}

function loadCatalog(directory: string) {
  return parseRecipeLibrary(Object.fromEntries(
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.txt') && !entry.name.startsWith('.') && !entry.parentPath.slice(directory.length).split('/').some((part) => part.startsWith('.')))
      .map((entry) => {
        const file = join(entry.parentPath, entry.name)
        return [`../source_recipes/${file.slice(directory.length + 1)}`, readFileSync(file, 'utf8')]
      }),
  ))
}

class InputError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected a JSON object.')
  return value as Record<string, unknown>
}

function text(value: unknown, name: string, max: number, required = false) {
  if (!required && value === undefined) return ''
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new InputError(`${name} must be ${required ? 'a non-empty ' : 'a '}string of at most ${max} characters.`)
  }
  return value.trim()
}

function list(value: unknown, name: string, maxCount: number, maxLength: number, required = false) {
  if (!required && value === undefined) return []
  if (!Array.isArray(value) || value.length > maxCount || (required && !value.length)) {
    throw new InputError(`${name} must be ${required ? 'a non-empty ' : 'an '}array with at most ${maxCount} entries.`)
  }
  return value.map((item) => text(item, name, maxLength, true))
}

function integer(value: unknown, name: string, min: number, max: number, fallback: number) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new InputError(`${name} must be an integer between ${min} and ${max}.`)
  }
  return Number(value)
}

function summary({ id, title, author, section, tags, time, servings }: Recipe) {
  return { id, title, author, section, tags, time, servings }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

export function createChatApi(directory: string, token = process.env.PANTRY_API_TOKEN?.trim()) {
  const router = express.Router()
  const expected = token ? digest(token) : null
  const base = expected ? loadCatalog(directory) : []
  function library(saved: Recipe[]) {
    const entries = new Map(base.map((recipe) => [recipe.id, recipe]))
    for (const recipe of saved) entries.set(recipe.id, recipe)
    return [...entries.values()]
  }
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!expected) { response.status(503).json({ error: 'Chat API is not configured.' }); return }
    const auth = request.get('Authorization')?.match(/^Bearer (\S+)$/i)
    if (!auth || !timingSafeEqual(digest(auth[1]), expected)) {
      response.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'A valid Pantry Pages API token is required.' })
      return
    }
    next()
  })
  router.use(express.json({ limit: '64kb' }))

  router.get('/recipes', async (request, response) => {
    const query = text(request.query.q, 'q', 200).toLowerCase().split(/\s+/).filter(Boolean)
    const offset = integer(request.query.offset, 'offset', 0, Number.MAX_SAFE_INTEGER, 0)
    const limit = integer(request.query.limit, 'limit', 1, 100, 20)
    const state = await readPersistedState()
    const matches = library(state.importedRecipes).filter((recipe) => {
      const haystack = [recipe.title, recipe.author, recipe.source, recipe.section, ...recipe.tags,
        ...recipe.ingredients.map((ingredient) => ingredient.item)].join(' ').toLowerCase()
      return query.every((term) => haystack.includes(term))
    })
    response.json({ recipes: matches.slice(offset, offset + limit).map(summary), total: matches.length, offset, limit })
  })
  router.get('/recipes/:id', async (request, response) => {
    const state = await readPersistedState()
    const recipe = library(state.importedRecipes).find(({ id }) => id === request.params.id)
    if (!recipe) throw new InputError('Recipe not found.', 404)
    const notes = Object.hasOwn(state.recipeNotes, recipe.id) ? state.recipeNotes[recipe.id] : recipe.notes
    response.json({ recipe: { ...recipe, notes } })
  })
  router.post('/recipes', async (request, response) => {
    const body = object(request.body)
    const draft = {
      title: text(body.title, 'title', 200, true),
      ingredients: list(body.ingredients, 'ingredients', 100, 500, true),
      steps: list(body.steps, 'steps', 100, 4000, true),
      author: text(body.author, 'author', 200), source: text(body.source, 'source', 1000) || 'Chat API',
      section: text(body.section, 'section', 100) || 'Manual', tags: list(body.tags, 'tags', 30, 80),
      time: text(body.time, 'time', 100), servings: text(body.servings, 'servings', 100),
      image: '', summary: text(body.summary, 'summary', 2000) || 'Added through the Pantry Pages API.',
    }
    const recipe = await updatePersistedState((state) => {
      const recipe = buildImportedRecipe(draft, new Set(library(state.importedRecipes).map(({ id }) => id)))
      return { state: { ...state, importedRecipes: [...state.importedRecipes, recipe] }, result: recipe }
    })
    response.location(`/api/v1/recipes/${encodeURIComponent(recipe.id)}`).status(201).json({ recipe })
  })

  router.get('/planner', async (_request, response) => {
    const state = await readPersistedState()
    const plans = resolvePlannedRecipes(library(state.importedRecipes), state.plannedRecipes)
    response.json({ entries: plans.map(({ recipe, excludedIngredientKeys }) => ({ recipe: summary(recipe), excludedIngredientKeys })) })
  })
  router.put('/planner/:id', async (request, response) => {
    if ((request.headers['content-length'] && request.headers['content-length'] !== '0' || request.headers['transfer-encoding']) && !request.is('application/json')) {
      throw new InputError('Planner updates with a body require application/json.', 415)
    }
    const body = object(request.body ?? {})
    const keys = body.excludedIngredientKeys === undefined ? undefined : list(body.excludedIngredientKeys, 'excludedIngredientKeys', 250, 1024)
    const entry = await updatePersistedState((state) => {
      const recipes = library(state.importedRecipes)
      const recipe = recipes.find(({ id }) => id === request.params.id)
      if (!recipe) throw new InputError('Recipe not found.', 404)
      const allowed = new Set(recipe.ingredients.map(ingredientKey))
      if (keys?.some((key) => !allowed.has(key))) throw new InputError('An excluded ingredient key does not belong to this recipe.')
      const index = state.plannedRecipes.findIndex((plan) => plan.recipeId === recipe.id)
      const plannedRecipes = [...state.plannedRecipes]
      const entry = { recipeId: recipe.id, excludedIngredientKeys: keys ? [...new Set(keys)] : plannedRecipes[index]?.excludedIngredientKeys ?? [] }
      if (index < 0) plannedRecipes.push(entry)
      else plannedRecipes[index] = entry
      return { state: withUpdatedPlan(state, recipes, plannedRecipes), result: entry }
    })
    response.json({ entry })
  })
  router.delete('/planner/:id', async (request, response) => {
    await updatePersistedState((state) => {
      const plannedRecipes = state.plannedRecipes.filter((plan) => plan.recipeId !== request.params.id)
      if (plannedRecipes.length === state.plannedRecipes.length) return { result: undefined }
      return { state: withUpdatedPlan(state, library(state.importedRecipes), plannedRecipes), result: undefined }
    })
    response.status(204).end()
  })
  router.get('/shopping', async (_request, response) => {
    const state = await readPersistedState()
    const shopping = buildShoppingList(resolvePlannedRecipes(library(state.importedRecipes), state.plannedRecipes), state)
    response.json({ toCheck: shopping.checkShoppingItems, needToBuy: shopping.visibleGroceryByAisle, bought: shopping.doneShoppingItems })
  })
  router.use((_request, response) => { response.status(404).json({ error: 'API endpoint not found.' }) })
  const handleError: express.ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) { next(error); return }
    if (error instanceof InputError) { response.status(error.status).json({ error: error.message }); return }
    if (error.status === 413) { response.status(413).json({ error: 'Request body exceeds 64 KB.' }); return }
    if (error.status === 400) { response.status(400).json({ error: 'Malformed JSON or invalid request path.' }); return }
    if (error.status === 415) { response.status(415).json({ error: 'Unsupported request encoding.' }); return }
    console.error('Pantry Pages chat API error:', error)
    response.status(500).json({ error: 'Unable to complete the Pantry Pages request.' })
  }
  router.use(handleError)
  return router
}
