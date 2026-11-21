import { parseRecipeLibrary } from './recipeCatalog'

const rawRecipeFiles = import.meta.glob('../source_recipes/**/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const recipes = parseRecipeLibrary(rawRecipeFiles)

export { recipes }
export { buildImportedRecipe, type ImportedRecipeDraft, type Recipe } from './recipeCatalog'
export { aisleCategories, splitIngredient, type Ingredient } from './ingredientParsing'
