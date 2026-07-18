type RecipeWithId = {
  id: string
}

export function sortRecipesByShoppingRecency<T extends RecipeWithId>(
  recipes: T[],
  plannedRecipeIds: string[],
) {
  const shoppingRecency = new Map(
    plannedRecipeIds.map((recipeId, index) => [recipeId, index]),
  )

  return recipes
    .map((recipe, index) => ({ recipe, index }))
    .sort((left, right) => {
      const recencyDifference =
        (shoppingRecency.get(right.recipe.id) ?? -1) -
        (shoppingRecency.get(left.recipe.id) ?? -1)

      return recencyDifference || left.index - right.index
    })
    .map(({ recipe }) => recipe)
}
