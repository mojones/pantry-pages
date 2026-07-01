import assert from 'node:assert/strict'
import { buildManualRecipe, parseRecipeTextList } from '../src/manualRecipe.ts'

const parsedIngredients = parseRecipeTextList(`
2 tbsp olive oil
1 onion, diced

400g chickpeas
`)

assert.deepEqual(
  parsedIngredients.map((ingredient) => ({ amount: ingredient.amount, item: ingredient.item, aisle: ingredient.aisle })),
  [
    { amount: '2 tbsp', item: 'olive oil', aisle: 'Oils & Vinegars' },
    { amount: '1', item: 'onion, diced', aisle: 'Produce' },
    { amount: '400 g', item: 'chickpeas', aisle: 'Grains & Beans' },
  ],
)

const recipe = buildManualRecipe(
  {
    title: 'Quick Chickpea Supper',
    author: 'Me',
    source: 'Notebook',
    image: '',
    section: 'weeknights',
    tags: 'vegan, fast, vegan',
    time: '',
    servings: '',
    summary: '',
    ingredientsText: '2 tbsp olive oil\n400g chickpeas',
    stepsText: 'Warm the oil.\nAdd the chickpeas.',
  },
  new Set(['quick-chickpea-supper']),
)

assert.equal(recipe.id, 'quick-chickpea-supper-2')
assert.equal(recipe.title, 'Quick Chickpea Supper')
assert.equal(recipe.author, 'Me')
assert.equal(recipe.source, 'Notebook')
assert.equal(recipe.section, 'Weeknights')
assert.deepEqual(recipe.tags, ['Vegan', 'Fast'])
assert.equal(recipe.time, 'Time not set')
assert.equal(recipe.servings, 'Unspecified yield')
assert.equal(recipe.summary, 'Manually added recipe.')
assert.deepEqual(recipe.steps, ['Warm the oil.', 'Add the chickpeas.'])
assert.deepEqual(
  recipe.ingredients.map((ingredient) => `${ingredient.amount} ${ingredient.item}`.trim()),
  ['2 tbsp olive oil', '400 g chickpeas'],
)

const editedRecipe = buildManualRecipe(
  {
    title: 'Edited Supper',
    author: '',
    source: '',
    image: '',
    section: '',
    tags: '',
    time: '',
    servings: '',
    summary: '',
    ingredientsText: 'salt',
    stepsText: '',
  },
  new Set(['edited-supper']),
  'edited-supper',
)

assert.equal(editedRecipe.id, 'edited-supper')
assert.equal(editedRecipe.author, 'Unknown source')
assert.equal(editedRecipe.source, 'Manual entry')
assert.equal(editedRecipe.section, 'Manual')

console.log('manualRecipe tests passed')
