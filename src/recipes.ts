import { aisleCategories, splitIngredient, type Ingredient } from './ingredientParsing'

type Recipe = {
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
  ingredients: Ingredient[]
  steps: string[]
  notes: string
}

type ImportedRecipeDraft = {
  title: string
  author: string
  source: string
  image: string
  section: string
  tags: string[]
  time: string
  servings: string
  summary: string
  ingredients: string[]
  steps: string[]
}

type RecipeFields = {
  Title?: string
  Description?: string
  Source?: string
  'Original URL'?: string
  Yield?: string
  Prep?: string
  Cook?: string
  Total?: string
  Cookbook?: string
  Section?: string
  Tags?: string
  Image?: string
}

const rawRecipeFiles = import.meta.glob('../source_recipes/**/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const fieldPattern =
  /^(Title|Description|Source|Original URL|Yield|Prep|Cook|Total|Cookbook|Section|Tags|Image|Ingredients|Instructions):\s*(.*)$/



function splitRecipeBlocks(filePath: string, contents: string) {
  if (filePath.includes('/cookbooks/')) {
    return contents
      .split(/^---\s*$/m)
      .map((block) => block.trim())
      .filter(Boolean)
  }

  return [contents.trim()]
}

function parseRecipeBlock(block: string) {
  const fields: RecipeFields = {}
  const ingredients: string[] = []
  const instructions: string[] = []
  let currentList: 'ingredients' | 'instructions' | null = null

  for (const line of block.replace(/\r/g, '').split('\n')) {
    const match = line.match(fieldPattern)

    if (match) {
      const [, label, value] = match

      if (label === 'Ingredients') {
        currentList = 'ingredients'
        if (value.trim()) {
          ingredients.push(value.trim())
        }
        continue
      }

      if (label === 'Instructions') {
        currentList = 'instructions'
        if (value.trim()) {
          instructions.push(value.trim())
        }
        continue
      }

      fields[label as keyof RecipeFields] = value.trim()
      currentList = null
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    if (currentList === 'ingredients') {
      ingredients.push(trimmed)
    } else if (currentList === 'instructions') {
      instructions.push(trimmed)
    }
  }

  return { fields, ingredients, instructions }
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

function createUniqueRecipeId(title: string, existingIds: Set<string>) {
  const baseId = slugify(title) || 'imported-recipe'

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

function splitTags(fields: RecipeFields) {
  const sourceTags = fields.Tags
    ? fields.Tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : []

  return Array.from(
    new Set(
      sourceTags.map((tag) => titleCase(tag.replace(/^author:/, '').replace(/^cookbook:/, ''))),
    ),
  )
}

function buildTime(fields: RecipeFields) {
  return fields.Total || [fields.Prep, fields.Cook].filter(Boolean).join(' + ') || 'Time not set'
}

function buildSummary(fields: RecipeFields, instructions: string[]) {
  if (fields.Description?.trim()) {
    return fields.Description.trim()
  }

  if (instructions[0]) {
    return instructions[0]
  }

  return 'Imported from source recipes.'
}

const parsedRecipes = Object.entries(rawRecipeFiles)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
  .flatMap(([filePath, contents]) =>
    splitRecipeBlocks(filePath, contents).map((block, index) => {
      const { fields, ingredients, instructions } = parseRecipeBlock(block)
      return {
        filePath,
        index,
        fields,
        ingredients,
        instructions,
      }
    }),
  )
  .filter((entry) => entry.fields.Title)

const recipeIdCounts = new Map<string, number>()

const recipes: Recipe[] = parsedRecipes.map((entry) => {
  const title = entry.fields.Title?.trim() || 'Untitled Recipe'
  const baseId = slugify(title) || `recipe-${entry.index + 1}`
  const duplicateCount = recipeIdCounts.get(baseId) ?? 0
  recipeIdCounts.set(baseId, duplicateCount + 1)

  const id = duplicateCount === 0 ? baseId : `${baseId}-${duplicateCount + 1}`
  const source = entry.fields.Cookbook?.trim() || 'Imported recipe'
  const author = entry.fields.Source?.trim() || 'Unknown source'
  const sectionValue = entry.fields.Section?.trim() || entry.fields.Cookbook?.trim() || 'Imported'
  const summary = buildSummary(entry.fields, entry.instructions)

  return {
    id,
    title,
    author,
    source,
    image: entry.fields.Image?.trim() || '',
    section: titleCase(sectionValue),
    tags: splitTags(entry.fields),
    time: buildTime(entry.fields),
    servings: entry.fields.Yield?.trim() || 'Unspecified yield',
    summary,
    ingredients: entry.ingredients.map(splitIngredient),
    steps: entry.instructions,
    notes: '',
  }
})

function buildImportedRecipe(draft: ImportedRecipeDraft, existingIds: Set<string>) {
  return {
    id: createUniqueRecipeId(draft.title, existingIds),
    title: draft.title.trim() || 'Untitled Recipe',
    author: draft.author.trim() || 'Unknown source',
    source: draft.source.trim() || 'Imported recipe',
    image: draft.image.trim(),
    section: titleCase(draft.section.trim() || 'Imported'),
    tags: Array.from(new Set(draft.tags.map((tag) => titleCase(tag)).filter(Boolean))),
    time: draft.time.trim() || 'Time not set',
    servings: draft.servings.trim() || 'Unspecified yield',
    summary: draft.summary.trim() || 'Imported from recipe URL.',
    ingredients: draft.ingredients.map(splitIngredient),
    steps: draft.steps.map((step) => step.trim()).filter(Boolean),
    notes: '',
  } satisfies Recipe
}

export type { ImportedRecipeDraft, Ingredient, Recipe }
export { aisleCategories, buildImportedRecipe, recipes, splitIngredient }
