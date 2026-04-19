import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve('source_recipes')
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
const FIELD_PATTERN =
  /^(Title|Description|Source|Original URL|Yield|Prep|Cook|Total|Cookbook|Section|Tags|Image|Ingredients|Instructions):\s*(.*)$/

async function main() {
  const files = await listRecipeFiles(ROOT)
  const jobs = []

  for (const filePath of files) {
    const contents = await fs.readFile(filePath, 'utf8')
    const blocks = splitRecipeBlocks(filePath, contents)

    for (const [index, block] of blocks.entries()) {
      const parsed = parseRecipeBlock(block)
      const originalUrl = parsed.fields['Original URL']?.trim() ?? ''
      const image = parsed.fields.Image?.trim() ?? ''

      if (!originalUrl || image || !isValidHttpUrl(originalUrl)) {
        continue
      }

      jobs.push({
        filePath,
        index,
        title: parsed.fields.Title?.trim() || `${path.basename(filePath)}#${index + 1}`,
        originalUrl,
      })
    }
  }

  console.log(`Checking ${jobs.length} recipes with valid original URLs and empty image fields...`)

  const results = await mapWithConcurrency(jobs, 6, async (job) => {
    const image = await findImageForUrl(job.originalUrl)
    return { ...job, image }
  })

  const grouped = new Map()
  for (const result of results) {
    const group = grouped.get(result.filePath) ?? []
    group.push(result)
    grouped.set(result.filePath, group)
  }

  let updatedRecipes = 0
  for (const [filePath, fileResults] of grouped.entries()) {
    const contents = await fs.readFile(filePath, 'utf8')
    const blocks = splitRecipeBlocks(filePath, contents)
    let changed = false

    for (const result of fileResults) {
      if (!result.image) {
        continue
      }

      const current = blocks[result.index]
      const next = setImageField(current, result.image)
      if (next !== current) {
        blocks[result.index] = next
        changed = true
        updatedRecipes += 1
      }
    }

    if (changed) {
      await fs.writeFile(filePath, joinRecipeBlocks(filePath, blocks), 'utf8')
    }
  }

  const found = results.filter((result) => result.image).length
  const missed = results.filter((result) => !result.image)

  console.log(`Found images for ${found} recipes.`)
  console.log(`Updated ${updatedRecipes} recipe blocks.`)

  if (missed.length > 0) {
    console.log(`Could not find images for ${missed.length} recipes:`)
    for (const result of missed.slice(0, 40)) {
      console.log(`- ${result.title} :: ${result.originalUrl}`)
    }
  }
}

async function listRecipeFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listRecipeFiles(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.txt')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

function splitRecipeBlocks(filePath, contents) {
  if (filePath.includes(`${path.sep}cookbooks${path.sep}`)) {
    return contents
      .split(/^---\s*$/m)
      .map((block) => block.trim())
      .filter(Boolean)
  }

  return [contents.trim()]
}

function joinRecipeBlocks(filePath, blocks) {
  if (filePath.includes(`${path.sep}cookbooks${path.sep}`)) {
    return `${blocks.join('\n\n---\n\n')}\n`
  }

  return `${blocks[0]}\n`
}

function parseRecipeBlock(block) {
  const fields = {}
  let currentList = null

  for (const line of block.replace(/\r/g, '').split('\n')) {
    const match = line.match(FIELD_PATTERN)
    if (match) {
      const [, label, value] = match
      if (label === 'Ingredients' || label === 'Instructions') {
        currentList = label
      } else {
        fields[label] = value.trim()
        currentList = null
      }
      continue
    }

    if (currentList) {
      continue
    }
  }

  return { fields }
}

function setImageField(block, imageUrl) {
  if (/^Image:\s*$/m.test(block)) {
    return block.replace(/^Image:\s*$/m, `Image: ${imageUrl}`)
  }

  if (/^Image:\s*.+$/m.test(block)) {
    return block.replace(/^Image:\s*.+$/m, `Image: ${imageUrl}`)
  }

  return block
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function findImageForUrl(originalUrl) {
  const youtubeThumbnail = getYouTubeThumbnail(originalUrl)
  if (youtubeThumbnail) {
    return youtubeThumbnail
  }

  try {
    const response = await fetch(originalUrl, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    })

    if (!response.ok) {
      return buildScreenshotFallback(response.url || originalUrl)
    }

    const html = await response.text()
    const finalUrl = response.url || originalUrl
    return extractImageFromHtml(html, finalUrl) || buildScreenshotFallback(finalUrl)
  } catch {
    return buildScreenshotFallback(originalUrl)
  }
}

function getYouTubeThumbnail(urlString) {
  try {
    const url = new URL(urlString)
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v')
      return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''
    }

    if (url.hostname === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0]
      return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''
    }
  } catch {
    return ''
  }

  return ''
}

function extractImageFromHtml(html, pageUrl) {
  const candidates = [
    ...matchMetaImages(html),
    ...matchJsonLdImages(html),
    ...matchLinkImages(html),
  ]

  for (const candidate of candidates) {
    const resolved = resolveImageUrl(candidate, pageUrl)
    if (resolved) {
      return resolved
    }
  }

  return ''
}

function matchMetaImages(html) {
  const matches = []
  const metaPattern =
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/gi

  for (const match of html.matchAll(metaPattern)) {
    matches.push(match[1])
  }

  return matches
}

function matchLinkImages(html) {
  const matches = []
  const linkPattern = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi

  for (const match of html.matchAll(linkPattern)) {
    matches.push(match[1])
  }

  return matches
}

function matchJsonLdImages(html) {
  const matches = []
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

  for (const scriptMatch of html.matchAll(scriptPattern)) {
    const scriptContent = scriptMatch[1].trim()
    if (!scriptContent) {
      continue
    }

    try {
      const parsed = JSON.parse(scriptContent)
      collectImages(parsed, matches)
    } catch {
      continue
    }
  }

  return matches
}

function collectImages(value, images) {
  if (!value) {
    return
  }

  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
      images.push(value)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectImages(entry, images)
    }
    return
  }

  if (typeof value === 'object') {
    if ('image' in value) {
      collectImages(value.image, images)
    }

    if ('url' in value && typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) {
      images.push(value.url)
    }
  }
}

function resolveImageUrl(value, pageUrl) {
  if (!value || value.startsWith('data:')) {
    return ''
  }

  try {
    return new URL(value, pageUrl).toString()
  } catch {
    return ''
  }
}

function buildScreenshotFallback(url) {
  if (!isValidHttpUrl(url)) {
    return ''
  }

  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
