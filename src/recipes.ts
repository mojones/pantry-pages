type Ingredient = {
  item: string
  amount: string
  aisle: string
}

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

const aisleRules: Array<{ aisle: string; pattern: RegExp }> = [
  {
    aisle: 'Produce',
    pattern:
      /\b(onion|shallot|garlic|ginger|potato|sweet potato|tomato|aubergine|eggplant|courgette|zucchini|broccoli|broccolini|cauliflower|cabbage|carrot|celery|leek|pea|peas|bean|beans|spinach|kale|chard|coriander|cilantro|parsley|basil|mint|dill|spring onion|scallion|lime|lemon|orange|apple|pear|melon|plum|chilli|chili|mushroom|hispi|kohlrabi|salad|lettuce|herb|rocket|cucumber)\b/i,
  },
  {
    aisle: 'Spices',
    pattern:
      /\b(salt|pepper|cumin|turmeric|cinnamon|cayenne|paprika|garam masala|mustard seed|mustard seeds|fennel seeds|sesame seeds|spice|spices|chilli flakes|smoked salt|zaatar)\b/i,
  },
  {
    aisle: 'Baking',
    pattern:
      /\b(flour|bicarbonate|baking powder|baking soda|sugar|brown sugar|caster sugar|oats|oatmeal|chocolate|cocoa|vanilla|pretzel|rice krispies)\b/i,
  },
  {
    aisle: 'Pasta & Rice',
    pattern:
      /\b(pasta|spaghetti|orzo|rice|noodles|udon|soba|vermicelli|grain|polenta|couscous)\b/i,
  },
  {
    aisle: 'Grains & Beans',
    pattern:
      /\b(lentil|lentils|chickpea|chickpeas|bean|beans|quinoa|dal|dhal|split pea|peas|falafel)\b/i,
  },
  {
    aisle: 'Dairy & Chilled',
    pattern:
      /\b(butter|milk|cream|paneer|feta|cheddar|cheese|yogurt|yoghurt|tofu|egg|eggs)\b/i,
  },
  {
    aisle: 'Canned & Jarred',
    pattern:
      /\b(can|cans|tin|tins|coconut milk|tomato paste|diced tomatoes|crushed tomatoes|chopped tomatoes)\b/i,
  },
  {
    aisle: 'Condiments',
    pattern:
      /\b(miso|soy sauce|tamari|vinegar|tamarind|maple syrup|honey|sriracha|gochujang|chutney|harissa|olive oil|sesame oil|groundnut oil|coconut oil|oil)\b/i,
  },
  {
    aisle: 'Nuts & Seeds',
    pattern:
      /\b(peanut|peanuts|peanut butter|hazelnut|hazelnuts|pistachio|pistachios|walnut|walnuts|almond|almonds|sesame)\b/i,
  },
]

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

function inferAisle(ingredient: string) {
  for (const rule of aisleRules) {
    if (rule.pattern.test(ingredient)) {
      return rule.aisle
    }
  }

  return 'Pantry'
}

const unicodeFractionPattern = '[¼½¾⅓⅔⅛⅜⅝⅞]'
const numberPattern = `(?:\\d+(?:\\.\\d+)?\\+?|\\d+\\/\\d+|${unicodeFractionPattern})`
const mixedNumberPattern = `(?:${numberPattern}(?:\\s+${numberPattern})?)`
const rangePattern = `(?:${mixedNumberPattern}(?:\\s*(?:-|to)\\s*${mixedNumberPattern})?)`
const dimensionPattern =
  `(?:${mixedNumberPattern}\\s*(?:cm|mm|inch(?:es)?)\\s*x\\s*${mixedNumberPattern}\\s*(?:cm|mm|inch(?:es)?))`
const standardUnitPattern =
  '(?:g|gram(?:s)?|kg|kilogram(?:s)?|ml|millilitre(?:s)?|milliliter(?:s)?|l|litre(?:s)?|liter(?:s)?|oz|ounce(?:s)?|lb|pound(?:s)?|tsp|tsps|teaspoon(?:s)?|tbsp|tbsps|tablespoon(?:s)?|cup(?:s)?|pinch(?:es)?|dash(?:es)?|handful(?:s)?|bunch(?:es)?|sprig(?:s)?|can(?:s)?|tin(?:s)?|packet(?:s)?|pack(?:s)?|jar(?:s)?|clove(?:s)?|slice(?:s)?|stick(?:s)?|piece(?:s)?|inch(?:es)?|cm|mm|sachet(?:s)?)'
const quantityPattern = new RegExp(
  `^((?:${dimensionPattern}|${rangePattern}))(?:\\s*(${standardUnitPattern}))?(?:\\s+of)?\\s+(.+)$`,
  'i',
)

function normalizeIngredientText(rawIngredient: string) {
  return rawIngredient
    .replace(/[–—]/g, '-')
    .replace(/(\d)([A-Za-z¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2')
    .replace(/([¼½¾⅓⅔⅛⅜⅝⅞])([A-Za-z])/g, '$1 $2')
    .replace(/(\d)\s*-\s*(inch(?:es)?|cm|mm)\b/gi, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitIngredient(rawIngredient: string): Ingredient {
  const cleaned = normalizeIngredientText(rawIngredient)
  const amountMatch = cleaned.match(quantityPattern)

  if (!amountMatch) {
    return {
      item: cleaned,
      amount: '',
      aisle: inferAisle(cleaned),
    }
  }

  const quantity = amountMatch[1].trim()
  const unit = amountMatch[2]?.trim() ?? ''
  const item = amountMatch[3].trim()

  return {
    amount: unit ? `${quantity} ${unit}` : quantity,
    item,
    aisle: inferAisle(cleaned),
  }
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
export { buildImportedRecipe, recipes }
