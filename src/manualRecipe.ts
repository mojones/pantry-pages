import { splitIngredient, type Ingredient } from './ingredientParsing'
import type { Recipe } from './recipes'

type ManualRecipeForm = {
  title: string
  author: string
  source: string
  image: string
  section: string
  tags: string
  time: string
  servings: string
  summary: string
  ingredientsText: string
  stepsText: string
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createUniqueRecipeId(title: string, existingIds: Set<string>, currentRecipeId = '') {
  if (currentRecipeId) {
    return currentRecipeId
  }

  const baseId = slugify(title) || 'manual-recipe'

  if (!existingIds.has(baseId)) {
    return baseId
  }

  let suffix = 2
  let candidate = `${baseId}-${suffix}`

  while (existingIds.has(candidate)) {
    suffix += 1
    candidate = `${baseId}-${suffix}`
  }

  return candidate
}

function parseTextLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseRecipeTextList(value: string): Ingredient[] {
  return parseTextLines(value).map(splitIngredient)
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => titleCase(tag))
        .filter(Boolean),
    ),
  )
}

function buildManualRecipe(
  form: ManualRecipeForm,
  existingIds: Set<string>,
  currentRecipeId = '',
): Recipe {
  const title = form.title.trim() || 'Untitled Recipe'

  return {
    id: createUniqueRecipeId(title, existingIds, currentRecipeId),
    title,
    author: form.author.trim() || 'Unknown source',
    source: form.source.trim() || 'Manual entry',
    image: form.image.trim(),
    section: titleCase(form.section.trim() || 'Manual'),
    tags: parseTags(form.tags),
    time: form.time.trim() || 'Time not set',
    servings: form.servings.trim() || 'Unspecified yield',
    summary: form.summary.trim() || 'Manually added recipe.',
    ingredients: parseRecipeTextList(form.ingredientsText),
    steps: parseTextLines(form.stepsText),
    notes: '',
  }
}

function recipeToManualForm(recipe: Recipe): ManualRecipeForm {
  return {
    title: recipe.title,
    author: recipe.author,
    source: recipe.source,
    image: recipe.image,
    section: recipe.section,
    tags: recipe.tags.join(', '),
    time: recipe.time,
    servings: recipe.servings,
    summary: recipe.summary,
    ingredientsText: recipe.ingredients
      .map((ingredient) => `${ingredient.amount} ${ingredient.item}`.trim())
      .join('\n'),
    stepsText: recipe.steps.join('\n'),
  }
}

const emptyManualRecipeForm: ManualRecipeForm = {
  title: '',
  author: '',
  source: '',
  image: '',
  section: '',
  tags: '',
  time: '',
  servings: '',
  summary: '',
  ingredientsText: '',
  stepsText: '',
}

export type { ManualRecipeForm }
export { buildManualRecipe, emptyManualRecipeForm, parseRecipeTextList, recipeToManualForm }
