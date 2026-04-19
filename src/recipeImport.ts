import { load } from 'cheerio'

type ImportedRecipePayload = {
  url: string
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

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string) {
  const $ = load(`<div>${value}</div>`)
  return $('div').text()
}

function cleanNumericArtifacts(value: string) {
  return value
    .replace(/(\d)([A-Za-z¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2')
    .replace(/([¼½¾⅓⅔⅛⅜⅝⅞])([A-Za-z])/g, '$1 $2')
    .replace(/(\d+)\.0(?=\s|[A-Za-z]|$)/g, '$1')
}

function cleanText(value: string) {
  return cleanNumericArtifacts(normalizeWhitespace(decodeHtmlEntities(value)))
}

function toStringArray(value: JsonValue | undefined): string[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry: JsonValue) => toStringArray(entry))
  }

  return typeof value === 'string' ? [cleanText(value)] : []
}

function getObject(value: JsonValue | undefined): { [key: string]: JsonValue } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function getTypeList(value: JsonValue | undefined) {
  return toStringArray(value).map((entry) => entry.toLowerCase())
}

function isRecipeNode(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  const objectValue = getObject(value)
  if (!objectValue) {
    return false
  }

  return getTypeList(objectValue['@type']).includes('recipe')
}

function flattenJsonLd(value: JsonValue | undefined): Array<{ [key: string]: JsonValue }> {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLd(entry))
  }

  const objectValue = getObject(value)
  if (!objectValue) {
    return []
  }

  return [
    objectValue,
    ...flattenJsonLd(objectValue['@graph']),
    ...flattenJsonLd(objectValue.mainEntity),
    ...flattenJsonLd(objectValue.itemListElement),
  ]
}

function extractImageUrl(value: JsonValue | undefined): string {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const image = extractImageUrl(entry)
      if (image) {
        return image
      }
    }

    return ''
  }

  const objectValue = getObject(value)
  if (!objectValue) {
    return ''
  }

  return typeof objectValue.url === 'string' ? objectValue.url : ''
}

function extractAuthor(value: JsonValue | undefined): string {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return cleanText(value)
  }

  if (Array.isArray(value)) {
    const names = value.map((entry) => extractAuthor(entry)).filter(Boolean)
    return names.join(', ')
  }

  const objectValue = getObject(value)
  if (!objectValue) {
    return ''
  }

  if (typeof objectValue.name === 'string') {
    return cleanText(objectValue.name)
  }

  return ''
}

function extractInstructions(value: JsonValue | undefined): string[] {
  if (!value) {
    return []
  }

  if (typeof value === 'string') {
    return [cleanText(value)]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractInstructions(entry))
  }

  const objectValue = getObject(value)
  if (!objectValue) {
    return []
  }

  if (typeof objectValue.text === 'string') {
    return [cleanText(objectValue.text)]
  }

  return extractInstructions(objectValue.itemListElement)
}

function formatIsoDuration(value: string) {
  const match = value.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i,
  )

  if (!match) {
    return cleanText(value)
  }

  const [, days, hours, minutes, seconds] = match
  const parts = [
    days ? `${Number(days)} day${Number(days) === 1 ? '' : 's'}` : '',
    hours ? `${Number(hours)} hr${Number(hours) === 1 ? '' : 's'}` : '',
    minutes ? `${Number(minutes)} min${Number(minutes) === 1 ? '' : 's'}` : '',
    seconds ? `${Number(seconds)} sec${Number(seconds) === 1 ? '' : 's'}` : '',
  ].filter(Boolean)

  return parts.join(' ') || cleanText(value)
}

function normalizeYield(value: JsonValue | undefined) {
  if (typeof value === 'number') {
    return `Serves ${cleanText(String(value))}`
  }

  const yields = toStringArray(value)
  const firstYield = yields[0]

  if (!firstYield) {
    return 'Unspecified yield'
  }

  return /^\d+(?:\.\d+)?$/.test(firstYield) ? `Serves ${cleanText(firstYield)}` : firstYield
}

function normalizeTags(values: string[]) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)))
}

function extractRecipeSchema(html: string) {
  const $ = load(html)
  const scripts = $('script[type="application/ld+json"]')
    .toArray()
    .map((element) => $(element).html() ?? '')

  for (const scriptContent of scripts) {
    if (!scriptContent.trim()) {
      continue
    }

    try {
      const parsed = JSON.parse(scriptContent) as JsonValue
      const recipeNode = flattenJsonLd(parsed).find((entry) => isRecipeNode(entry))

      if (recipeNode) {
        return {
          recipeNode,
          siteName: cleanText(
            $('meta[property="og:site_name"]').attr('content') ??
              $('meta[name="application-name"]').attr('content') ??
              '',
          ),
        }
      }
    } catch {
      continue
    }
  }

  return null
}

function hostnameLabel(url: URL) {
  return url.hostname.replace(/^www\./, '')
}

function buildTimeLabel(recipeNode: { [key: string]: JsonValue }) {
  if (typeof recipeNode.totalTime === 'string') {
    return formatIsoDuration(recipeNode.totalTime)
  }

  const parts = [
    typeof recipeNode.prepTime === 'string' ? `Prep ${formatIsoDuration(recipeNode.prepTime)}` : '',
    typeof recipeNode.cookTime === 'string' ? `Cook ${formatIsoDuration(recipeNode.cookTime)}` : '',
  ].filter(Boolean)

  return parts.join(' + ') || 'Time not set'
}

async function importRecipeFromUrl(urlValue: string): Promise<ImportedRecipePayload> {
  const url = new URL(urlValue)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Use a valid http or https recipe URL.')
  }

  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    throw new Error(`Recipe page request failed with ${response.status}.`)
  }

  const html = await response.text()
  const extracted = extractRecipeSchema(html)

  if (!extracted) {
    throw new Error('No schema.org recipe data found on that page.')
  }

  const { recipeNode, siteName } = extracted
  const title = typeof recipeNode.name === 'string' ? cleanText(recipeNode.name) : ''
  const ingredients = toStringArray(recipeNode.recipeIngredient)
  const steps = extractInstructions(recipeNode.recipeInstructions)

  if (!title || ingredients.length === 0 || steps.length === 0) {
    throw new Error('The page exposes recipe metadata, but key recipe fields are missing.')
  }

  const recipeCategory = toStringArray(recipeNode.recipeCategory)
  const recipeCuisine = toStringArray(recipeNode.recipeCuisine)
  const keywords =
    typeof recipeNode.keywords === 'string'
      ? recipeNode.keywords.split(',').map((entry) => cleanText(entry))
      : toStringArray(recipeNode.keywords)

  return {
    url: url.toString(),
    title,
    author: extractAuthor(recipeNode.author) || hostnameLabel(url),
    source: siteName || hostnameLabel(url),
    image: extractImageUrl(recipeNode.image),
    section: 'Imported',
    tags: normalizeTags([...recipeCategory, ...recipeCuisine, ...keywords]),
    time: buildTimeLabel(recipeNode),
    servings: normalizeYield(recipeNode.recipeYield),
    summary:
      (typeof recipeNode.description === 'string' && cleanText(recipeNode.description)) ||
      'Imported from recipe URL.',
    ingredients,
    steps,
  }
}

export type { ImportedRecipePayload }
export { importRecipeFromUrl }
