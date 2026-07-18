import assert from 'node:assert/strict'
import { sortRecipesByShoppingRecency } from '../src/recipeSorting.ts'

const recipes = [
  { id: 'library-first', title: 'Library first' },
  { id: 'older-shopping', title: 'Older shopping recipe' },
  { id: 'library-second', title: 'Library second' },
  { id: 'newer-shopping', title: 'Newer shopping recipe' },
]

const sortedRecipes = sortRecipesByShoppingRecency(recipes, [
  'older-shopping',
  'newer-shopping',
])

assert.deepEqual(
  sortedRecipes.map((recipe) => recipe.id),
  ['newer-shopping', 'older-shopping', 'library-first', 'library-second'],
)
assert.deepEqual(
  recipes.map((recipe) => recipe.id),
  ['library-first', 'older-shopping', 'library-second', 'newer-shopping'],
)

console.log('recipe sorting tests passed')
