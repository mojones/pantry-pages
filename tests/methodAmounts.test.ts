import assert from 'node:assert/strict'
import { annotateMethodStep, scaleIngredientAmount } from '../src/methodAmounts.ts'

const annotatedStep = annotateMethodStep(
  'Stir in the chickpeas and olive oil.',
  [
    { item: 'chickpeas', amount: '400 g' },
    { item: 'olive oil', amount: '2 tbsp' },
  ],
  0.5,
)

assert.equal(annotatedStep, 'Stir in the chickpeas (200 g) and olive oil (1 tbsp).')
assert.equal(scaleIngredientAmount('200 g', 2), '400 g')
assert.equal(scaleIngredientAmount('3/8 teaspoon', 2), '3/4 teaspoon')

assert.equal(
  annotateMethodStep('Cook the onion until soft.', [{ item: 'onion, diced', amount: '1' }], 1),
  'Cook the onion (1) until soft.',
)

assert.equal(
  annotateMethodStep(
    'Heat the olive oil.',
    [
      { item: 'olive oil', amount: '2 tbsp' },
      { item: 'oil', amount: '1 tsp' },
    ],
    1,
  ),
  'Heat the olive oil (2 tbsp).',
)

assert.equal(
  annotateMethodStep(
    'Add the lentils and coconut milk.',
    [
      { item: 'uncooked red lentils', amount: '100 g' },
      { item: 'can light coconut milk', amount: '200 ml' },
    ],
    2,
  ),
  'Add the lentils (200 g) and coconut milk (400 ml).',
)

console.log('method amount tests passed')
