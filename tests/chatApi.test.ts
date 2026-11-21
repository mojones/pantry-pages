/// <reference types="node" />
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { promisify } from 'node:util'

const dir = await mkdtemp(join(tmpdir(), 'pantry-api-'))
const token = randomBytes(32).toString('hex')
const password = randomBytes(24).toString('hex')
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  env: { ...process.env, PORT: '0', DATA_DIR: dir, BASIC_AUTH_USER: 'tester', BASIC_AUTH_PASSWORD: password, PANTRY_API_TOKEN: token },
  stdio: ['ignore', 'pipe', 'inherit'],
})
const exited = once(child, 'exit')
try {
  const port = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000)
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/listening on http:\/\/0\.0\.0\.0:(\d+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
    void exited.then(() => { clearTimeout(timeout); reject(new Error('Server exited')) })
  })
  const base = `http://127.0.0.1:${port}`
  const auth = { Authorization: `Bearer ${token}` }
  const browserAuth = { Authorization: `Basic ${Buffer.from(`tester:${password}`).toString('base64')}` }
  const request = (path: string, method = 'GET', body?: unknown) => fetch(`${base}/api/v1${path}`, {
    method, headers: { ...auth, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.equal((await fetch(`${base}/api/v1/recipes`, { redirect: 'manual' })).status, 401)
  assert.equal((await fetch(`${base}/api/v1/recipes`, { headers: browserAuth })).status, 401)
  assert.equal((await fetch(`${base}/api/state`, { headers: auth, redirect: 'manual' })).status, 302)
  const snapshot = await fetch(`${base}/api/state`, { headers: browserAuth })
  assert.equal(snapshot.status, 200)
  const version = snapshot.headers.get('etag')!
  const oldState = await snapshot.json()
  const seeded = await request('/recipes?q=lentils&limit=1')
  assert.equal(seeded.status, 200)
  const matches = await seeded.json()
  assert.equal(matches.recipes.length, 1)
  assert.equal((await request(`/recipes/${matches.recipes[0].id}`)).status, 200)
  const draft = { title: 'Chat test soup', ingredients: ['200 g red lentils', '1 onion'], steps: ['Simmer until tender.'] }
  assert.equal((await request('/recipes', 'POST', { title: 'Incomplete' })).status, 400)
  const created = await request('/recipes', 'POST', draft)
  assert.equal(created.status, 201)
  const { recipe } = await created.json()
  const cli = await promisify(execFile)(process.execPath, ['scripts/pantry.mjs', 'search', 'chat test'], {
    env: { ...process.env, PANTRY_API_URL: base, PANTRY_API_TOKEN: token },
  })
  assert.equal(JSON.parse(cli.stdout).recipes[0].id, recipe.id)
  assert.equal((await request('/planner/missing', 'PUT', {})).status, 404)
  assert.equal((await request(`/planner/${recipe.id}`, 'PUT', { excludedIngredientKeys: ['not-real'] })).status, 400)
  const excluded = recipe.ingredients[1]
  const plan = { excludedIngredientKeys: [`${excluded.item}__${excluded.amount}`] }
  assert.equal((await request(`/planner/${recipe.id}`, 'PUT', plan)).status, 200)
  assert.equal((await request(`/planner/${recipe.id}`, 'PUT', {})).status, 200)
  const planner = await (await request('/planner')).json()
  assert.equal(planner.entries.length, 1)
  assert.deepEqual(planner.entries[0].excludedIngredientKeys, plan.excludedIngredientKeys)
  const shopping = await (await request('/shopping')).json()
  assert.deepEqual(shopping.toCheck.map((item: { item: string }) => item.item), ['200 g red lentils'])
  const stale = await fetch(`${base}/api/state`, {
    method: 'PUT', headers: { ...browserAuth, 'Content-Type': 'application/json', 'If-Match': version }, body: JSON.stringify(oldState),
  })
  assert.equal(stale.status, 412)
  assert.equal((await fetch(`${base}/api/state`, {
    method: 'PUT', headers: { ...browserAuth, 'Content-Type': 'application/json' }, body: JSON.stringify(oldState),
  })).status, 428)
  const current = await fetch(`${base}/api/state`, { headers: browserAuth })
  const saved = await current.json()
  assert.equal(saved.importedRecipes[0].id, recipe.id)
  saved.neededShoppingItems = shopping.toCheck[0].keys
  assert.equal((await fetch(`${base}/api/state`, {
    method: 'PUT', headers: { ...browserAuth, 'Content-Type': 'application/json', 'If-Match': current.headers.get('etag')! }, body: JSON.stringify(saved),
  })).status, 200)
  const after = await (await request('/shopping')).json()
  assert.equal(after.toCheck.length, 0)
  assert.equal(Object.values(after.needToBuy).flat().length, 1)
  const planPath = `/planner/${recipe.id}`
  assert.equal((await fetch(`${base}/api/v1${planPath}`, {
    method: 'PUT', headers: auth, body: JSON.stringify({ excludedIngredientKeys: [] }),
  })).status, 415)
  assert.equal((await fetch(`${base}/api/v1${planPath}`, { method: 'PUT', headers: auth })).status, 200)
  const excludeAll = recipe.ingredients.map(({ item, amount }: { item: string; amount: string }) => `${item}__${amount}`)
  assert.equal((await request(planPath, 'PUT', { excludedIngredientKeys: excludeAll })).status, 200)
  assert.equal((await request(planPath, 'PUT', plan)).status, 200)
  const restored = await (await request('/shopping')).json()
  assert.deepEqual(restored.needToBuy, {}, 're-included ingredients must not inherit old shopping status')
  assert.deepEqual(restored.toCheck.map(({ item }: { item: string }) => item), ['200 g red lentils'])
  assert.equal((await request(`/planner/${recipe.id}`, 'DELETE')).status, 204)
  assert.deepEqual((await (await request('/shopping')).json()).needToBuy, {})
  const parallel = await Promise.all([request('/recipes', 'POST', draft), request('/recipes', 'POST', draft)])
  assert.deepEqual(parallel.map(({ status }) => status), [201, 201])
  const found = await (await request('/recipes?q=chat%20test%20soup')).json()
  assert.equal(new Set(found.recipes.map(({ id }: { id: string }) => id)).size, 3)
  console.log('chat API integration tests passed')
} finally {
  child.kill()
  await exited
  await rm(dir, { recursive: true, force: true })
}
