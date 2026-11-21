import { splitIngredient, type Ingredient } from './ingredientParsing'
import type { Recipe } from './recipeCatalog'

type GroceryListItem = {
  key: string
  keys: string[]
  item: string
  count: number
}

type RawGroceryListItem = {
  key: string
  item: string
}

export function ingredientKey(ingredient: Ingredient) {
  return `${ingredient.item}__${ingredient.amount}`
}

function manualShoppingItemKey(item: string, itemIndex: number) {
  return `manual:${itemIndex}:${ingredientKey(splitIngredient(item))}`
}

export function formatIngredient(ingredient: Ingredient) {
  return ingredient.amount ? `${ingredient.amount} ${ingredient.item}` : ingredient.item
}

export function normalizeShoppingItemLabel(item: string) {
  return item.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function formatShoppingItemLabel(item: string) {
  return normalizeShoppingItemLabel(item)
}

export function getIngredientCategoryKey(item: string) {
  return normalizeShoppingItemLabel(item)
}

function groupGroceryItems(items: RawGroceryListItem[]) {
  const groupedItems = new Map<string, GroceryListItem>()

  items.forEach((item) => {
    const normalizedItem = normalizeShoppingItemLabel(item.item)
    if (!normalizedItem) {
      return
    }

    const currentItem = groupedItems.get(normalizedItem)

    if (currentItem) {
      currentItem.keys.push(item.key)
      currentItem.count += 1
      return
    }

    groupedItems.set(normalizedItem, {
      key: item.key,
      keys: [item.key],
      item: formatShoppingItemLabel(item.item),
      count: 1,
    })
  })

  return Array.from(groupedItems.values()).sort((left, right) =>
    left.item.localeCompare(right.item),
  )
}

export type PlannedRecipe = { recipeId: string; excludedIngredientKeys: string[] }
type ShoppingState = {
  manualShoppingItems: string[]
  neededShoppingItems: string[]
  completedShoppingItems: string[]
  removedShoppingItems: string[]
  categoryOverrides: Record<string, string>
}

export function resolvePlannedRecipes(recipeLibrary: Recipe[], plannedRecipesState: PlannedRecipe[]) {
  return plannedRecipesState
    .map((plannedRecipe) => {
      const recipe = recipeLibrary.find((entry) => entry.id === plannedRecipe.recipeId)
      return recipe ? { recipe, excludedIngredientKeys: plannedRecipe.excludedIngredientKeys } : null
    })
    .filter(
      (
        plannedRecipe,
      ): plannedRecipe is { recipe: Recipe; excludedIngredientKeys: string[] } =>
        Boolean(plannedRecipe),
    )

}

export function buildShoppingList(plannedRecipes: ReturnType<typeof resolvePlannedRecipes>, {
  manualShoppingItems, neededShoppingItems, completedShoppingItems, removedShoppingItems, categoryOverrides,
}: ShoppingState) {
  function resolveIngredientAisle(ingredient: Ingredient) {
    return categoryOverrides[getIngredientCategoryKey(ingredient.item)] || ingredient.aisle
  }

  const groceryByAisle = plannedRecipes.reduce<Record<string, RawGroceryListItem[]>>((groups, plannedRecipe) => {
    plannedRecipe.recipe.ingredients
      .filter(
        (ingredient) =>
          !plannedRecipe.excludedIngredientKeys.includes(ingredientKey(ingredient)),
      )
      .forEach((ingredient, ingredientIndex) => {
        const aisle = resolveIngredientAisle(ingredient)

        if (!groups[aisle]) {
          groups[aisle] = []
        }

        groups[aisle].push({
          key: `recipe:${plannedRecipe.recipe.id}:${ingredientIndex}:${ingredientKey(ingredient)}`,
          item: formatIngredient(ingredient),
        })
      })

    return groups
  }, Object.create(null) as Record<string, RawGroceryListItem[]>)

  manualShoppingItems
    .map((item, itemIndex) => ({ ingredient: splitIngredient(item), itemIndex }))
    .forEach(({ ingredient, itemIndex }) => {
      const aisle = resolveIngredientAisle(ingredient)

      if (!groceryByAisle[aisle]) {
        groceryByAisle[aisle] = []
      }

      groceryByAisle[aisle].push({
        key: manualShoppingItemKey(manualShoppingItems[itemIndex], itemIndex),
        item: formatIngredient(ingredient),
      })
    })

  const completedShoppingItemSet = new Set(completedShoppingItems)
  const neededShoppingItemSet = new Set(neededShoppingItems)
  const removedShoppingItemSet = new Set(removedShoppingItems)

  const checkShoppingItems = groupGroceryItems(
    Object.values(groceryByAisle)
      .flat()
      .filter(
      (item) =>
        !neededShoppingItemSet.has(item.key) &&
        !completedShoppingItemSet.has(item.key) &&
        !removedShoppingItemSet.has(item.key),
      ),
  )

  const visibleGroceryByAisle = Object.fromEntries(
    Object.entries(groceryByAisle)
      .map(
        ([aisle, items]): [string, GroceryListItem[]] => [
          aisle,
          groupGroceryItems(
            items.filter(
              (item) =>
                neededShoppingItemSet.has(item.key) &&
                !completedShoppingItemSet.has(item.key) &&
                !removedShoppingItemSet.has(item.key),
            ),
          ),
        ],
      )
      .filter(([, items]) => items.length > 0),
  ) as Record<string, GroceryListItem[]>

  const doneShoppingItems = Object.entries(groceryByAisle).flatMap(([aisle, items]) =>
    groupGroceryItems(
      items.filter(
        (item) =>
          completedShoppingItemSet.has(item.key) &&
          !removedShoppingItemSet.has(item.key),
      ),
    ).map((item) => ({ ...item, aisle })),
  )
  return { groceryByAisle, checkShoppingItems, visibleGroceryByAisle, doneShoppingItems }
}
