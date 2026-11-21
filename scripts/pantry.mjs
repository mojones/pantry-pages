import { readFile } from 'node:fs/promises'

const usage = `Usage: node scripts/pantry.mjs <command>
  search [query] [offset]
  recipe <id>
  create <recipe.json>
  planner
  plan-add <id>
  plan-remove <id>
  shopping

Requires PANTRY_API_URL (app origin) and PANTRY_API_TOKEN in the environment.`

async function main() {
  const [command, value, extra, ...rest] = process.argv.slice(2)
  if (!command || command === '--help') { console.log(usage); return }
  if (rest.length || (extra !== undefined && command !== 'search')) throw new Error(usage)
  let route
  let method = 'GET'
  let body
  switch (command) {
    case 'search':
      route = `/recipes?${new URLSearchParams({ q: value ?? '', offset: extra ?? '0' })}`
      break
    case 'recipe':
    case 'plan-add':
    case 'plan-remove':
      if (!value || !/^[a-z0-9-]+$/.test(value)) throw new Error('A recipe ID from Pantry Pages search is required.')
      route = command === 'recipe' ? `/recipes/${value}` : `/planner/${value}`
      if (command === 'plan-add') method = 'PUT'
      if (command === 'plan-remove') method = 'DELETE'
      break
    case 'create':
      if (!value) throw new Error('Supply a recipe JSON file.')
      route = '/recipes'
      method = 'POST'
      body = JSON.stringify(JSON.parse(await readFile(value, 'utf8')))
      break
    case 'planner':
    case 'shopping':
      if (value !== undefined) throw new Error(usage)
      route = `/${command}`
      break
    default:
      throw new Error(usage)
  }
  const token = process.env.PANTRY_API_TOKEN?.trim()
  if (!process.env.PANTRY_API_URL || !token) throw new Error('Set PANTRY_API_URL and PANTRY_API_TOKEN in the environment.')
  const base = new URL(process.env.PANTRY_API_URL)
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname)
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password) {
    throw new Error('Use an HTTPS app origin, or HTTP on localhost for testing.')
  }
  const response = await fetch(new URL(`/api/v1${route}`, base), {
    method, body, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  })
  const result = response.status === 204 ? { ok: true } : await response.json()
  if (!response.ok) throw new Error(result.error ?? `Pantry Pages returned HTTP ${response.status}.`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Pantry Pages request failed.')
  process.exitCode = 1
})
